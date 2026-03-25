import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import bcrypt from "bcrypt";
import { eq, desc, and, ne, sql, inArray, lt } from "drizzle-orm";
import { db } from "./storage";
import { users, transactions, orders, depositRequests, inventoryKeys } from "@shared/schema";

const USDT_BEP20_ADDRESS = process.env.USDT_BEP20_ADDRESS || "0x0c31c91ec2cbb607aeca28c1bc09c55352db2fea";
const USDT_TRC20_ADDRESS = process.env.USDT_TRC20_ADDRESS || "TLUSXogZfhgWGHpTBHNtNQPanq6AvNfCY4";
const USDT_BEP20_CONTRACT = "0x55d398326f99059fF775485246999027B3197955";
const USDT_TRC20_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

const CDK_API_KEY = process.env.CDK_API_KEY || "";
const API_BASE = "https://keys.ovh/api/v1";

async function apiCall(method: string, path: string, body?: object) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Authorization": `Bearer ${CDK_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

// ── Middleware ────────────────────────────────────────
function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ success: false, message: "Not authenticated." });
  }
  next();
}

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ success: false, message: "Not authenticated." });
  }
  const [user] = await db.select().from(users).where(eq(users.id, req.session.userId));
  if (!user || user.role !== "admin") {
    return res.status(403).json({ success: false, message: "Admin access required." });
  }
  next();
}

// ── Seed admin on startup ─────────────────────────────
async function seedAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL || "admin@gptcdk.xyz";
  const adminPassword = process.env.ADMIN_PASSWORD || "Admin@CDK2024!";
  const [existing] = await db.select().from(users).where(eq(users.email, adminEmail));
  if (!existing) {
    const hash = await bcrypt.hash(adminPassword, 10);
    await db.insert(users).values({
      email: adminEmail,
      passwordHash: hash,
      name: "Admin",
      role: "admin",
      balanceCents: 0,
    });
    console.log(`[seed] Admin account created: ${adminEmail}`);
  }
}

// ── Token/session validation helpers ─────────────────
function validateAccessToken(token: string): { valid: boolean; message?: string } {
  if (!token || typeof token !== "string" || token.trim().length === 0) {
    return { valid: false, message: "No access token found in session data." };
  }
  const parts = token.split(".");
  if (parts.length !== 3) {
    return { valid: false, message: "Invalid token format. Please copy the full JSON from the AuthSession page." };
  }
  try {
    const payloadBase64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payloadBase64 + "=".repeat((4 - (payloadBase64.length % 4)) % 4);
    const payload = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
    if (payload.exp) {
      const nowSeconds = Math.floor(Date.now() / 1000);
      if (payload.exp < nowSeconds) {
        return { valid: false, message: "Token expired. Open the AuthSession page again for a fresh token." };
      }
    }
    return { valid: true };
  } catch {
    return { valid: false, message: "Could not read token data. Make sure you copied the full JSON." };
  }
}

// ── Plan → keys.ovh slug mapping ─────────────────────
const PLAN_SLUG_MAP: Record<string, { product_slug: string; subscription_type_slug: string; name: string }> = {
  "plus-1m":  { product_slug: "chatgpt", subscription_type_slug: "plus-1m",  name: "ChatGPT Plus 1 Month" },
  "plus-1y":  { product_slug: "chatgpt", subscription_type_slug: "plus-12m", name: "ChatGPT Plus 1 Year" },
  "go-1y":    { product_slug: "chatgpt", subscription_type_slug: "go-12m",   name: "ChatGPT GO 1 Year" },
  "pro-1m":   { product_slug: "chatgpt", subscription_type_slug: "pro-1m",   name: "ChatGPT Pro 1 Month" },
};

// ── Custom customer-facing prices (what customers are charged) ───────────────
// These are the prices shown to customers in the shop. Keys.ovh charges less
// internally — the difference is the admin's margin. Always bill using these.
interface CustomVolumeTier { minQty: number; price: number; }
interface CustomPlanPrice {
  basePrice: number;
  volumeTiers: CustomVolumeTier[]; // sorted desc by minQty
}
const CUSTOM_PLAN_PRICES: Record<string, CustomPlanPrice> = {
  "plus-1m": {
    basePrice: 2.38,
    volumeTiers: [
      { minQty: 100, price: 1.55 },
      { minQty: 50,  price: 1.75 },
      { minQty: 30,  price: 1.95 },
      { minQty: 10,  price: 2.15 },
    ],
  },
  "plus-1y": { basePrice: 28,  volumeTiers: [] },
  "go-1y":   { basePrice: 5,   volumeTiers: [] },
  "pro-1m":  { basePrice: 110, volumeTiers: [] },
};

function resolveCustomPrice(planId: string, quantity: number): number {
  const custom = CUSTOM_PLAN_PRICES[planId];
  if (!custom) return 0;
  for (const tier of custom.volumeTiers) {
    if (quantity >= tier.minQty) return tier.price;
  }
  return custom.basePrice;
}

// ── Cached plan pricing (populated from keys.ovh, used for inventory orders) ─
interface VolumeTier { min_qty: number; price: number; }
interface PlanPriceInfo {
  basePrice: number;                 // USD (default unit price)
  volumePrices: VolumeTier[];        // sorted desc by min_qty
  productName: string;
  subscriptionName: string;
  cachedAt: number;                  // ms timestamp
}
const planPriceCache: Record<string, PlanPriceInfo> = {};
const PRICE_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function resolvePlanPrice(info: PlanPriceInfo, quantity: number): number {
  if (info.volumePrices.length) {
    const tier = info.volumePrices.find((t) => quantity >= t.min_qty);
    if (tier) return tier.price;
  }
  return info.basePrice;
}

async function fetchAndCachePricing(planId: string): Promise<PlanPriceInfo | null> {
  const planSlug = PLAN_SLUG_MAP[planId];
  if (!planSlug) return null;
  try {
    const productsData = await apiCall("GET", "/products");
    if (!productsData.success || !Array.isArray(productsData.data)) return null;
    const product = productsData.data.find((p: any) => p.slug === planSlug.product_slug);
    const subType = product?.subscription_types?.find((s: any) => s.slug === planSlug.subscription_type_slug);
    if (!subType) return null;
    const volumePrices: VolumeTier[] = Array.isArray(subType.volume_prices)
      ? [...subType.volume_prices].sort((a: VolumeTier, b: VolumeTier) => b.min_qty - a.min_qty)
      : [];
    const info: PlanPriceInfo = {
      basePrice: subType.price,
      volumePrices,
      productName: product.name ?? planSlug.name,
      subscriptionName: subType.name ?? planSlug.name,
      cachedAt: Date.now(),
    };
    planPriceCache[planId] = info;
    return info;
  } catch {
    return null;
  }
}

function getCachedPricing(planId: string): PlanPriceInfo | null {
  const cached = planPriceCache[planId];
  if (cached && Date.now() - cached.cachedAt < PRICE_CACHE_TTL_MS) return cached;
  return null;
}

async function warmPricingCache(): Promise<void> {
  for (const planId of Object.keys(PLAN_SLUG_MAP)) {
    await fetchAndCachePricing(planId).catch(() => {});
  }
  console.log("[pricing] cache warmed for all plans");
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  await seedAdmin();
  // Warm pricing cache on startup (non-blocking — purchase falls back to live fetch if cache is cold)
  warmPricingCache().catch(() => {});

  // ── Auth ────────────────────────────────────────────

  app.post("/api/auth/register", async (req, res) => {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      return res.json({ success: false, message: "Name, email and password are required." });
    }
    if (password.length < 6) {
      return res.json({ success: false, message: "Password must be at least 6 characters." });
    }
    try {
      const [existing] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
      if (existing) {
        return res.json({ success: false, message: "An account with this email already exists." });
      }
      const hash = await bcrypt.hash(password, 10);
      const [user] = await db.insert(users).values({
        email: email.toLowerCase().trim(),
        passwordHash: hash,
        name: name.trim(),
        role: "customer",
        balanceCents: 0,
      }).returning();
      req.session.userId = user.id;
      return res.json({ success: true, user: { id: user.id, email: user.email, name: user.name, role: user.role, balanceCents: user.balanceCents } });
    } catch (err) {
      console.error("Register error:", err);
      return res.status(500).json({ success: false, message: "Registration failed. Please try again." });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.json({ success: false, message: "Email and password are required." });
    }
    try {
      const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
      if (!user) {
        return res.json({ success: false, message: "Invalid email or password." });
      }
      const match = await bcrypt.compare(password, user.passwordHash);
      if (!match) {
        return res.json({ success: false, message: "Invalid email or password." });
      }
      req.session.userId = user.id;
      return res.json({ success: true, user: { id: user.id, email: user.email, name: user.name, role: user.role, balanceCents: user.balanceCents } });
    } catch (err) {
      console.error("Login error:", err);
      return res.status(500).json({ success: false, message: "Login failed. Please try again." });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ success: true });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session?.userId) {
      return res.json({ user: null });
    }
    try {
      const [user] = await db.select().from(users).where(eq(users.id, req.session.userId));
      if (!user) {
        return res.json({ user: null });
      }
      return res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role, balanceCents: user.balanceCents } });
    } catch {
      return res.json({ user: null });
    }
  });

  // ── Customer routes ──────────────────────────────────

  app.get("/api/me/orders", requireAuth, async (req, res) => {
    try {
      const userOrders = await db.select().from(orders)
        .where(eq(orders.userId, req.session.userId!))
        .orderBy(desc(orders.createdAt));
      return res.json({ success: true, data: userOrders });
    } catch (err) {
      console.error("Orders fetch error:", err);
      return res.status(500).json({ success: false, message: "Could not fetch orders." });
    }
  });

  app.post("/api/purchase", requireAuth, async (req, res) => {
    const { planId, quantity } = req.body;
    if (!planId || !quantity || quantity < 1 || quantity > 100) {
      return res.json({ success: false, message: "Valid plan and quantity (1–100) are required." });
    }

    const planSlug = PLAN_SLUG_MAP[planId];
    if (!planSlug) {
      return res.json({ success: false, message: "Invalid plan selected." });
    }

    try {
      const [user] = await db.select().from(users).where(eq(users.id, req.session.userId!));
      if (!user) {
        return res.json({ success: false, message: "User not found." });
      }

      // ── Helper to call keys.ovh and update the purchase result vars ─────────
      const idempotencyKey = `${user.id}-${planId}-${quantity}-${Date.now()}`;
      type OvhResult = { keys: string[]; orderNumber: string; product: string; subscription: string; status: string; totalCents: number } | null;
      async function purchaseFromOvh(fallbackProductName: string, fallbackSubName: string): Promise<OvhResult> {
        const productsData = await apiCall("GET", "/products");
        if (!productsData.success) return null;
        const product = productsData.data?.find((p: any) => p.slug === planSlug.product_slug);
        const subType = product?.subscription_types?.find((s: any) => s.slug === planSlug.subscription_type_slug);
        if (!subType || !subType.in_stock) return null;
        // Update cache with fresh data
        const volumePrices: VolumeTier[] = Array.isArray(subType.volume_prices)
          ? [...subType.volume_prices].sort((a: VolumeTier, b: VolumeTier) => b.min_qty - a.min_qty)
          : [];
        planPriceCache[planId] = { basePrice: subType.price, volumePrices, productName: product.name ?? planSlug.name, subscriptionName: subType.name ?? planSlug.name, cachedAt: Date.now() };
        const unitPrice = resolveCustomPrice(planId, quantity);
        const tc = Math.round(unitPrice * quantity * 100);
        if (user.balanceCents < tc) return null; // insufficient — caller handles
        const purchaseData = await apiCall("POST", "/purchase", {
          product_slug: planSlug.product_slug,
          subscription_type_slug: planSlug.subscription_type_slug,
          quantity,
          idempotency_key: idempotencyKey,
        });
        if (!purchaseData.success) return null;
        return {
          keys: purchaseData.data?.keys || [],
          orderNumber: purchaseData.data?.order_number || idempotencyKey,
          product: purchaseData.data?.product || product.name || fallbackProductName,
          subscription: purchaseData.data?.subscription || subType.name || fallbackSubName,
          status: purchaseData.data?.status || "delivered",
          totalCents: tc,
        };
      }

      // Count available inventory keys for this plan upfront (no keys.ovh call yet)
      const inventoryCountResult = await db.select({ cnt: sql<number>`COUNT(*)` })
        .from(inventoryKeys)
        .where(and(eq(inventoryKeys.plan, planId), eq(inventoryKeys.status, "available")));
      const inventoryCount = Number(inventoryCountResult[0]?.cnt ?? 0);
      const useInventory = inventoryCount >= quantity;

      let purchasedKeys: string[];
      let orderNumber: string;
      let orderProduct: string;
      let orderSubscription: string;
      let orderStatus: string;
      let totalCents: number;

      if (useInventory) {
        // ── Inventory path: zero keys.ovh API calls when cache is warm ───────
        // Use cached pricing (warmed at startup, refreshed by fallback-path purchases).
        // If cache is completely cold (first boot + keys.ovh unreachable at startup),
        // do a single /products fetch now to populate it.
        let pricing = getCachedPricing(planId) ?? planPriceCache[planId]; // accept stale rather than calling keys.ovh
        if (!pricing) {
          // Cache is completely absent — fetch once to populate
          pricing = await fetchAndCachePricing(planId);
          if (!pricing) {
            return res.json({ success: false, message: "Could not fetch current pricing. Please try again shortly." });
          }
        }

        const unitPrice = resolveCustomPrice(planId, quantity);
        totalCents = Math.round(unitPrice * quantity * 100);

        if (user.balanceCents < totalCents) {
          const shortfall = ((totalCents - user.balanceCents) / 100).toFixed(2);
          return res.json({
            success: false,
            message: `Insufficient balance. You need $${shortfall} more. Please top up your account.`,
            code: "insufficient_balance",
          });
        }

        console.log(`[purchase] user=${user.id} plan=${planId} qty=${quantity} unitPrice=$${unitPrice} total=$${(totalCents/100).toFixed(2)} source=inventory`);

        // Atomically allocate exactly `quantity` available keys — FOR UPDATE SKIP LOCKED
        // prevents concurrent purchases from double-selling the same keys.
        const allocated = await db.transaction(async (tx) => {
          const rows = await tx.execute<{ id: number; key: string }>(
            sql`SELECT id, key FROM inventory_keys
                WHERE plan = ${planId} AND status = 'available'
                ORDER BY id
                LIMIT ${quantity}
                FOR UPDATE SKIP LOCKED`
          );
          if (rows.rows.length < quantity) return null; // Race: someone else grabbed keys

          const ids = rows.rows.map((r) => r.id);
          await tx.update(inventoryKeys)
            .set({ status: "sold", soldTo: user.id, soldAt: new Date() })
            .where(inArray(inventoryKeys.id, ids));

          return rows.rows.map((r) => r.key);
        });

        if (!allocated) {
          // Inventory depleted by concurrent request — fall back to keys.ovh
          console.log(`[purchase] inventory race — falling back to keys.ovh for user=${user.id}`);
          const ovhResult = await purchaseFromOvh(pricing.productName, pricing.subscriptionName);
          if (!ovhResult) {
            return res.json({ success: false, message: "This plan is currently out of stock." });
          }
          if (user.balanceCents < ovhResult.totalCents) {
            const shortfall = ((ovhResult.totalCents - user.balanceCents) / 100).toFixed(2);
            return res.json({ success: false, message: `Insufficient balance. You need $${shortfall} more.`, code: "insufficient_balance" });
          }
          purchasedKeys = ovhResult.keys;
          orderNumber = ovhResult.orderNumber;
          orderProduct = ovhResult.product;
          orderSubscription = ovhResult.subscription;
          orderStatus = ovhResult.status;
          totalCents = ovhResult.totalCents;
        } else {
          purchasedKeys = allocated;
          orderNumber = idempotencyKey;
          orderProduct = pricing.productName;
          orderSubscription = pricing.subscriptionName;
          orderStatus = "delivered";
          console.log(`[purchase] fulfilled from inventory (${quantity} keys)`);
        }
      } else {
        // ── keys.ovh fallback path ──────────────────────────────────────────
        const productsData = await apiCall("GET", "/products");
        if (!productsData.success) {
          return res.json({ success: false, message: "Could not fetch current pricing." });
        }

        const product = productsData.data?.find((p: any) => p.slug === planSlug.product_slug);
        const subType = product?.subscription_types?.find((s: any) => s.slug === planSlug.subscription_type_slug);
        if (!subType) {
          return res.json({ success: false, message: "Selected plan is not available." });
        }
        if (!subType.in_stock) {
          return res.json({ success: false, message: "This plan is currently out of stock." });
        }

        // Cache this pricing for future inventory-path purchases
        const volumePricesOvh: VolumeTier[] = Array.isArray(subType.volume_prices)
          ? [...subType.volume_prices].sort((a: VolumeTier, b: VolumeTier) => b.min_qty - a.min_qty)
          : [];
        planPriceCache[planId] = {
          basePrice: subType.price,
          volumePrices: volumePricesOvh,
          productName: product.name ?? planSlug.name,
          subscriptionName: subType.name ?? planSlug.name,
          cachedAt: Date.now(),
        };

        // Always charge the custom price — not the keys.ovh wholesale price
        const customUnitPrice = resolveCustomPrice(planId, quantity);
        totalCents = Math.round(customUnitPrice * quantity * 100);

        if (user.balanceCents < totalCents) {
          const shortfall = ((totalCents - user.balanceCents) / 100).toFixed(2);
          return res.json({
            success: false,
            message: `Insufficient balance. You need $${shortfall} more. Please top up your account.`,
            code: "insufficient_balance",
          });
        }

        console.log(`[purchase] user=${user.id} plan=${planId} qty=${quantity} unitPrice=$${customUnitPrice} total=$${(totalCents/100).toFixed(2)} source=keys.ovh`);

        const purchaseData = await apiCall("POST", "/purchase", {
          product_slug: planSlug.product_slug,
          subscription_type_slug: planSlug.subscription_type_slug,
          quantity,
          idempotency_key: idempotencyKey,
        });

        if (!purchaseData.success) {
          const errMap: Record<string, string> = {
            out_of_stock: "This plan is currently out of stock.",
            insufficient_balance: "We are unable to process your order at this time. Please contact us on WhatsApp: +447577308067",
            product_not_found: "Product not found.",
            subscription_not_found: "Subscription type not found.",
          };
          const msg = errMap[purchaseData.error] || purchaseData.message || "Purchase failed. Please try again.";
          return res.json({ success: false, message: msg });
        }

        purchasedKeys = purchaseData.data?.keys || [];
        orderNumber = purchaseData.data?.order_number || idempotencyKey;
        orderProduct = purchaseData.data?.product || product.name;
        orderSubscription = purchaseData.data?.subscription || subType.name;
        orderStatus = purchaseData.data?.status || "delivered";
      }

      // Deduct balance and save order atomically
      await db.update(users)
        .set({ balanceCents: user.balanceCents - totalCents })
        .where(eq(users.id, user.id));

      await db.insert(transactions).values({
        userId: user.id,
        amountCents: totalCents,
        type: "debit",
        description: `${planSlug.name} x${quantity} — Order #${orderNumber}`,
        createdBy: user.id,
      });

      const [savedOrder] = await db.insert(orders).values({
        userId: user.id,
        orderNumber,
        product: orderProduct,
        subscription: orderSubscription,
        quantity,
        amountCents: totalCents,
        keys: purchasedKeys,
        status: orderStatus,
      }).returning();

      const newBalance = user.balanceCents - totalCents;
      return res.json({
        success: true,
        keys: purchasedKeys,
        orderNumber: savedOrder.orderNumber,
        product: savedOrder.product,
        subscription: savedOrder.subscription,
        quantity,
        amount: (totalCents / 100).toFixed(2),
        balanceCents: newBalance,
      });
    } catch (err) {
      console.error("Purchase error:", err);
      return res.status(500).json({ success: false, message: "Purchase failed. Please try again." });
    }
  });

  // ── Admin routes ─────────────────────────────────────

  app.get("/api/admin/customers", requireAdmin, async (_req, res) => {
    try {
      const customers = await db.select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        balanceCents: users.balanceCents,
        createdAt: users.createdAt,
      }).from(users).orderBy(desc(users.createdAt));
      return res.json({ success: true, data: customers });
    } catch (err) {
      console.error("Admin customers error:", err);
      return res.status(500).json({ success: false, message: "Could not fetch customers." });
    }
  });

  app.post("/api/admin/customers/:id/credit", requireAdmin, async (req, res) => {
    const customerId = parseInt(req.params.id, 10);
    const { amountUsd, description } = req.body;
    if (!amountUsd || isNaN(parseFloat(amountUsd)) || parseFloat(amountUsd) <= 0) {
      return res.json({ success: false, message: "Valid amount in USD is required." });
    }
    const amountCents = Math.round(parseFloat(amountUsd) * 100);
    const desc = description?.trim() || `Manual top-up by admin`;
    try {
      const [user] = await db.select().from(users).where(eq(users.id, customerId));
      if (!user) {
        return res.json({ success: false, message: "Customer not found." });
      }
      const newBalance = user.balanceCents + amountCents;
      await db.update(users).set({ balanceCents: newBalance }).where(eq(users.id, customerId));
      await db.insert(transactions).values({
        userId: customerId,
        amountCents,
        type: "credit",
        description: desc,
        createdBy: req.session.userId!,
      });
      return res.json({ success: true, balanceCents: newBalance });
    } catch (err) {
      console.error("Credit error:", err);
      return res.status(500).json({ success: false, message: "Could not add balance." });
    }
  });

  app.post("/api/admin/customers/:id/debit", requireAdmin, async (req, res) => {
    const customerId = parseInt(req.params.id, 10);
    const { amountUsd, description } = req.body;
    if (!amountUsd || isNaN(parseFloat(amountUsd)) || parseFloat(amountUsd) <= 0) {
      return res.json({ success: false, message: "Valid amount in USD is required." });
    }
    const amountCents = Math.round(parseFloat(amountUsd) * 100);
    const desc = description?.trim() || `Manual deduction by admin`;
    try {
      const [user] = await db.select().from(users).where(eq(users.id, customerId));
      if (!user) return res.json({ success: false, message: "Customer not found." });
      if (user.balanceCents < amountCents) {
        return res.json({ success: false, message: "Insufficient balance. Cannot reduce below zero." });
      }
      const newBalance = user.balanceCents - amountCents;
      await db.update(users).set({ balanceCents: newBalance }).where(eq(users.id, customerId));
      await db.insert(transactions).values({
        userId: customerId, amountCents: -amountCents, type: "debit", description: desc, createdBy: req.session.userId!,
      });
      return res.json({ success: true, balanceCents: newBalance });
    } catch (err) {
      console.error("Debit error:", err);
      return res.status(500).json({ success: false, message: "Could not reduce balance." });
    }
  });

  app.delete("/api/admin/customers/:id", requireAdmin, async (req, res) => {
    const customerId = parseInt(req.params.id, 10);
    try {
      const [user] = await db.select().from(users).where(eq(users.id, customerId));
      if (!user) return res.json({ success: false, message: "Customer not found." });
      if (user.role === "admin") return res.json({ success: false, message: "Cannot delete admin account." });
      await db.delete(transactions).where(eq(transactions.userId, customerId));
      await db.delete(depositRequests).where(eq(depositRequests.userId, customerId));
      await db.update(inventoryKeys).set({ soldTo: null, soldAt: null, status: "available" }).where(eq(inventoryKeys.soldTo, customerId));
      await db.delete(orders).where(eq(orders.userId, customerId));
      await db.delete(users).where(eq(users.id, customerId));
      return res.json({ success: true });
    } catch (err) {
      console.error("Delete customer error:", err);
      return res.status(500).json({ success: false, message: "Could not delete customer." });
    }
  });

  app.get("/api/admin/customers/:id/orders", requireAdmin, async (req, res) => {
    const customerId = parseInt(req.params.id, 10);
    try {
      const customerOrders = await db.select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        subscription: orders.subscription,
        quantity: orders.quantity,
        amountCents: orders.amountCents,
        keys: orders.keys,
        status: orders.status,
        createdAt: orders.createdAt,
      }).from(orders).where(eq(orders.userId, customerId)).orderBy(desc(orders.createdAt));
      return res.json({ success: true, data: customerOrders });
    } catch (err) {
      console.error("Customer orders error:", err);
      return res.status(500).json({ success: false, message: "Could not fetch orders." });
    }
  });

  app.get("/api/admin/orders", requireAdmin, async (_req, res) => {
    try {
      const allOrders = await db
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          product: orders.product,
          subscription: orders.subscription,
          quantity: orders.quantity,
          amountCents: orders.amountCents,
          keys: orders.keys,
          status: orders.status,
          createdAt: orders.createdAt,
          userId: orders.userId,
          userEmail: users.email,
          userName: users.name,
        })
        .from(orders)
        .innerJoin(users, eq(orders.userId, users.id))
        .orderBy(desc(orders.createdAt));
      return res.json({ success: true, data: allOrders });
    } catch (err) {
      console.error("Admin orders error:", err);
      return res.status(500).json({ success: false, message: "Could not fetch orders." });
    }
  });

  // ── Deposit routes ────────────────────────────────────

  app.post("/api/deposit/create", requireAuth, async (req, res) => {
    const { amountUsd, network } = req.body;
    const amount = parseFloat(amountUsd);
    if (!amountUsd || isNaN(amount) || amount < 1 || amount > 10000) {
      return res.json({ success: false, message: "Amount must be between $1 and $10,000." });
    }
    if (!network || !["bep20", "trc20"].includes(network)) {
      return res.json({ success: false, message: "Network must be bep20 or trc20." });
    }

    const amountCents = Math.round(amount * 100);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const walletAddress = network === "bep20" ? USDT_BEP20_ADDRESS : USDT_TRC20_ADDRESS;

    try {
      // Generate a unique amountUsdt: add a micro-offset (0.0001–0.0099) that
      // doesn't collide with any active pending deposit for the same network.
      let amountUsdt = "";
      let tries = 0;
      while (tries < 30) {
        const microOffset = Math.floor(Math.random() * 99) + 1; // 1–99
        const totalUnits = Math.round(amount * 10000) + microOffset;
        const candidate = (totalUnits / 10000).toFixed(4);
        const [collision] = await db.select({ id: depositRequests.id })
          .from(depositRequests)
          .where(and(
            eq(depositRequests.amountUsdt, candidate),
            eq(depositRequests.network, network),
            eq(depositRequests.status, "pending"),
          ))
          .limit(1);
        if (!collision) { amountUsdt = candidate; break; }
        tries++;
      }
      if (!amountUsdt) {
        return res.status(503).json({ success: false, message: "Could not generate a unique deposit amount. Please try again shortly." });
      }

      // Insert — partial unique index (status='pending', network, amount_usdt) enforces
      // uniqueness at DB level even if two concurrent requests bypass the pre-check.
      let deposit;
      try {
        [deposit] = await db.insert(depositRequests).values({
          userId: req.session.userId!,
          amountUsdt,
          amountCents,
          network,
          status: "pending",
          expiresAt,
        }).returning();
      } catch (insertErr: unknown) {
        const errMsg = insertErr instanceof Error ? insertErr.message : String(insertErr);
        if (errMsg.includes("uniq_pending_deposit_amount")) {
          // Concurrent request grabbed the same amount — tell the user to retry
          return res.status(503).json({ success: false, message: "Could not generate a unique deposit amount. Please try again." });
        }
        throw insertErr;
      }

      if (!deposit) {
        return res.status(500).json({ success: false, message: "Could not create deposit request." });
      }

      return res.json({
        success: true,
        deposit: { id: deposit.id, amountUsdt, amountCents, network, walletAddress, expiresAt: expiresAt.toISOString() },
      });
    } catch (err) {
      console.error("Deposit create error:", err);
      return res.status(500).json({ success: false, message: "Could not create deposit request." });
    }
  });

  app.post("/api/deposit/check/:id", requireAuth, async (req, res) => {
    const depositId = parseInt(req.params.id, 10);
    const userTxHash = typeof req.body.txHash === "string" ? req.body.txHash.trim() : null;

    try {
      const [deposit] = await db.select().from(depositRequests).where(eq(depositRequests.id, depositId));
      if (!deposit || deposit.userId !== req.session.userId!) {
        return res.json({ success: false, message: "Deposit request not found." });
      }
      if (deposit.status === "completed") {
        return res.json({ success: true, status: "completed" });
      }
      if (new Date() > deposit.expiresAt) {
        await db.update(depositRequests).set({ status: "expired" }).where(eq(depositRequests.id, depositId));
        return res.json({ success: false, status: "expired", message: "This deposit request has expired." });
      }

      const since = deposit.createdAt.getTime() - 60000;
      const expectedAmountTrc20 = Math.round(parseFloat(deposit.amountUsdt) * 1_000_000);      // 6 decimals
      const expectedWei = BigInt(Math.round(parseFloat(deposit.amountUsdt) * 10_000)) * BigInt("100000000000000"); // 18 decimals
      let found = false;
      let txHash: string | null = null;

      // Minimum accepted amount: 95% of the deposit's dollar value (to allow round-number sends)
      // TRC-20: 1 cent = 10,000 sun (6 decimals). 95% → amountCents * 9500
      const minSun = deposit.amountCents * 9500;
      // BEP-20: 1 cent = 10^16 wei (18 decimals). 95% → amountCents * 9_500_000_000_000_000
      const minWei = BigInt(deposit.amountCents) * BigInt("9500000000000000");

      // ── Helper: verify a user-provided TRC-20 tx hash directly ──────────────
      async function verifyTrc20Hash(hash: string): Promise<{ ok: boolean; reason?: string }> {
        const url = `https://api.trongrid.io/wallet/gettransactioninfobyid`;
        const resp = await fetch(url, {
          method: "POST",
          headers: { "Accept": "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ value: hash }),
          signal: AbortSignal.timeout(12000),
        });
        if (!resp.ok) return { ok: false, reason: "notfound" };
        const ct = resp.headers.get("content-type") ?? "";
        if (!ct.includes("application/json")) return { ok: false, reason: "notfound" };
        const data = await resp.json() as { log?: Array<{ address: string; data: string; topics: string[] }> };
        if (!data?.log?.length) return { ok: false, reason: "notfound" };
        const contractHex = "a614f803b6fd780986a42c78ec9c7f77e6ded13c";
        const transferTopic = "ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
        for (const log of data.log) {
          if (log.address?.toLowerCase() !== contractHex) continue;
          if (!log.topics?.[0]?.toLowerCase().includes(transferTopic)) continue;
          const amt = log.data ? parseInt(log.data, 16) : 0;
          // Accept if amount >= 95% of deposit dollar value
          if (amt >= minSun) return { ok: true };
        }
        // Found USDT Transfer logs but none going to our wallet with enough amount
        return { ok: false, reason: "mismatch" };
      }

      // ── Helper: verify a user-provided BEP-20 tx hash directly ──────────────
      async function verifyBep20Hash(hash: string): Promise<{ ok: boolean; reason?: string }> {
        const bscRpc = "https://bsc-dataseed1.binance.org/";
        const resp = await fetch(bscRpc, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", method: "eth_getTransactionReceipt", params: [hash], id: 1 }),
          signal: AbortSignal.timeout(12000),
        });
        if (!resp.ok) return { ok: false, reason: "notfound" };
        const data = await resp.json() as { result?: { logs?: Array<{ address: string; topics: string[]; data: string }> } };
        const logs = data?.result?.logs;
        if (!Array.isArray(logs)) return { ok: false, reason: "notfound" };
        const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
        const walletPadded = "0x000000000000000000000000" + USDT_BEP20_ADDRESS.slice(2).toLowerCase();
        for (const log of logs) {
          if (log.address?.toLowerCase() !== USDT_BEP20_CONTRACT.toLowerCase()) continue;
          if (log.topics?.[0]?.toLowerCase() !== transferTopic) continue;
          if (log.topics?.[2]?.toLowerCase() !== walletPadded) continue;
          const amt = BigInt(log.data ?? "0x0");
          // Accept if amount >= 95% of deposit dollar value
          if (amt >= minWei) return { ok: true };
        }
        if (!logs.some((l) => l.address?.toLowerCase() === USDT_BEP20_CONTRACT.toLowerCase())) {
          return { ok: false, reason: "notusdt" };
        }
        return { ok: false, reason: "mismatch" };
      }

      // ── If user provided a TX hash: verify it directly ───────────────────────
      if (userTxHash) {
        try {
          const result = deposit.network === "bep20"
            ? await verifyBep20Hash(userTxHash)
            : await verifyTrc20Hash(userTxHash);
          if (result.ok) {
            found = true;
            txHash = userTxHash;
          } else if (result.reason === "notfound") {
            return res.json({ success: true, status: "pending", message: "Transaction not found on blockchain. Make sure you copied the full hash and the transaction is confirmed." });
          } else if (result.reason === "notusdt") {
            return res.json({ success: true, status: "pending", message: "This transaction does not contain a USDT transfer. Please check you selected the right network (BEP-20 / TRC-20)." });
          } else {
            return res.json({ success: true, status: "pending", message: "Transaction found, but it was not sent to our receiving wallet. Please verify you used the correct wallet address shown in the dialog." });
          }
        } catch {
          return res.json({ success: true, status: "pending", message: "Could not reach blockchain to verify your transaction. Please try again in a moment." });
        }
      }

      // ── Fallback: scan recent transactions on our wallet ─────────────────────
      if (!found) {
        if (deposit.network === "bep20") {
          // BEP-20: Use BSC public RPC eth_getLogs in 200-block chunks
          try {
            const bscRpc = "https://bsc-dataseed1.binance.org/";
            const blockResp = await fetch(bscRpc, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 }),
              signal: AbortSignal.timeout(8000),
            });
            const blockData = await blockResp.json() as { result?: string };
            const latestBlock = parseInt(blockData.result ?? "0x0", 16);
            // BSC ~3s/block, deposit is max 24h = 28800 blocks. Search in 200-block chunks up to 600 blocks back (~30 min quick scan)
            const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
            const walletPadded = "0x000000000000000000000000" + USDT_BEP20_ADDRESS.slice(2).toLowerCase();
            const chunkSize = 150;
            const totalBlocks = Math.min(Math.ceil((Date.now() - since) / 3000), 600);
            for (let offset = 0; offset < totalBlocks && !found; offset += chunkSize) {
              const toBlock = latestBlock - offset;
              const fromBlock = toBlock - chunkSize + 1;
              const logsResp = await fetch(bscRpc, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  jsonrpc: "2.0", method: "eth_getLogs", id: 1,
                  params: [{
                    fromBlock: "0x" + fromBlock.toString(16),
                    toBlock: "0x" + toBlock.toString(16),
                    address: USDT_BEP20_CONTRACT,
                    topics: [transferTopic, null, walletPadded],
                  }],
                }),
                signal: AbortSignal.timeout(10000),
              });
              const logsData = await logsResp.json() as { result?: Array<{ data: string; transactionHash: string }> };
              if (!Array.isArray(logsData.result)) break;
              for (const log of logsData.result) {
                const amt = BigInt(log.data ?? "0x0");
                if (amt === expectedWei) { found = true; txHash = log.transactionHash; break; }
              }
            }
          } catch { /* BSC RPC unavailable */ }
        } else {
          // TRC-20: TronGrid scan of wallet's incoming trc20 transactions
          interface TronGridTransfer {
            transaction_id: string;
            to: string;
            value: string;
            quant?: string;
          }
          interface TronGridResp { data: TronGridTransfer[]; }

          try {
            const tronGridUrl = `https://api.trongrid.io/v1/accounts/${USDT_TRC20_ADDRESS}/transactions/trc20?contract_address=${USDT_TRC20_CONTRACT}&limit=50&min_timestamp=${since}&order_by=block_timestamp,desc`;
            const tronGridResp = await fetch(tronGridUrl, {
              signal: AbortSignal.timeout(12000),
              headers: { "Accept": "application/json", "User-Agent": "ChatGPT-Recharge/1.0" },
            });
            const contentType = tronGridResp.headers.get("content-type") ?? "";
            if (tronGridResp.ok && contentType.includes("application/json")) {
              const tronGridData = await tronGridResp.json() as TronGridResp;
              if (Array.isArray(tronGridData.data)) {
                for (const tx of tronGridData.data) {
                  const txAmount = parseInt(tx.value || tx.quant || "0");
                  const toAddr = (tx.to ?? "").toLowerCase();
                  if (toAddr === USDT_TRC20_ADDRESS.toLowerCase() && txAmount === expectedAmountTrc20) {
                    found = true; txHash = tx.transaction_id; break;
                  }
                }
              }
            }
          } catch { /* TronGrid unavailable */ }
        }
      }

      if (found && txHash) {
        // Credit atomically inside a transaction; guard against txHash reuse
        const result = await db.transaction(async (tx) => {
          // Ensure this txHash hasn't already been used for any other deposit
          const [txUsed] = await tx.select({ id: depositRequests.id })
            .from(depositRequests)
            .where(and(eq(depositRequests.txHash, txHash), eq(depositRequests.status, "completed")))
            .limit(1);
          if (txUsed) return null; // TX already claimed — don't double-credit

          // Re-read deposit inside the transaction to confirm still pending
          const [dep] = await tx.select().from(depositRequests)
            .where(and(eq(depositRequests.id, depositId), eq(depositRequests.status, "pending")))
            .limit(1);
          if (!dep) return null; // Already processed by concurrent request

          // Mark deposit completed
          await tx.update(depositRequests)
            .set({ status: "completed", txHash })
            .where(eq(depositRequests.id, depositId));

          // Atomically increment user balance (avoid read-then-write race)
          const [updatedUser] = await tx.update(users)
            .set({ balanceCents: sql`balance_cents + ${dep.amountCents}` })
            .where(eq(users.id, dep.userId))
            .returning({ balanceCents: users.balanceCents });

          await tx.insert(transactions).values({
            userId: dep.userId,
            amountCents: dep.amountCents,
            type: "credit",
            description: `USDT top-up via ${dep.network.toUpperCase()} — ${dep.amountUsdt} USDT`,
            createdBy: dep.userId,
          });
          return updatedUser?.balanceCents ?? null;
        });

        if (result !== null) {
          return res.json({ success: true, status: "completed", balanceCents: result });
        }
        // result is null — either concurrent request completed this deposit OR
        // the matched txHash was already claimed by a different deposit.
        // Re-fetch the deposit to return accurate current status.
        const [current] = await db.select({ status: depositRequests.status })
          .from(depositRequests).where(eq(depositRequests.id, depositId)).limit(1);
        if (current?.status === "completed") {
          return res.json({ success: true, status: "completed" });
        }
        return res.json({ success: true, status: "pending", message: "Payment not detected yet. Please wait a few minutes and try again." });
      }

      return res.json({ success: true, status: "pending", message: "Payment not detected yet. Please wait a few minutes and try again." });
    } catch (err) {
      console.error("Deposit check error:", err);
      return res.json({ success: true, status: "pending", message: "Could not reach blockchain. Please wait a moment and try again." });
    }
  });

  app.get("/api/me/deposits", requireAuth, async (req, res) => {
    try {
      // Reconcile any overdue pending deposits before returning the list
      await db.update(depositRequests)
        .set({ status: "expired" })
        .where(and(
          eq(depositRequests.userId, req.session.userId!),
          eq(depositRequests.status, "pending"),
          sql`expires_at < NOW()`,
        ));
      const userDeposits = await db.select().from(depositRequests)
        .where(eq(depositRequests.userId, req.session.userId!))
        .orderBy(desc(depositRequests.createdAt));
      return res.json({ success: true, data: userDeposits });
    } catch (err) {
      return res.status(500).json({ success: false, message: "Could not fetch deposits." });
    }
  });

  app.post("/api/admin/deposits/:id/approve", requireAdmin, async (req, res) => {
    const depositId = parseInt(req.params.id, 10);
    try {
      const newBalance = await db.transaction(async (tx) => {
        // Re-read inside transaction — confirm still pending
        const [deposit] = await tx.select().from(depositRequests)
          .where(and(eq(depositRequests.id, depositId), eq(depositRequests.status, "pending")))
          .limit(1);
        if (!deposit) return null; // Already completed or not found

        // Mark completed
        await tx.update(depositRequests)
          .set({ status: "completed", txHash: "manual-admin-approval" })
          .where(eq(depositRequests.id, depositId));

        // Atomically increment balance
        const [updatedUser] = await tx.update(users)
          .set({ balanceCents: sql`balance_cents + ${deposit.amountCents}` })
          .where(eq(users.id, deposit.userId))
          .returning({ balanceCents: users.balanceCents });

        await tx.insert(transactions).values({
          userId: deposit.userId,
          amountCents: deposit.amountCents,
          type: "credit",
          description: `Manual top-up via ${deposit.network.toUpperCase()} — ${deposit.amountUsdt} USDT (admin approved)`,
          createdBy: req.session.userId!,
        });
        return updatedUser?.balanceCents ?? null;
      });

      if (newBalance === null) {
        return res.json({ success: false, message: "Deposit already completed or not found." });
      }
      return res.json({ success: true, newBalance });
    } catch (err) {
      console.error("Admin approve deposit error:", err);
      return res.status(500).json({ success: false, message: "Could not approve deposit." });
    }
  });

  app.get("/api/admin/deposits", requireAdmin, async (_req, res) => {
    try {
      // Reconcile any overdue pending deposits before returning the list
      await db.update(depositRequests)
        .set({ status: "expired" })
        .where(and(eq(depositRequests.status, "pending"), sql`expires_at < NOW()`));
      const allDeposits = await db.select({
        id: depositRequests.id,
        amountUsdt: depositRequests.amountUsdt,
        amountCents: depositRequests.amountCents,
        network: depositRequests.network,
        status: depositRequests.status,
        txHash: depositRequests.txHash,
        createdAt: depositRequests.createdAt,
        expiresAt: depositRequests.expiresAt,
        userId: depositRequests.userId,
        userEmail: users.email,
        userName: users.name,
      }).from(depositRequests)
        .innerJoin(users, eq(depositRequests.userId, users.id))
        .orderBy(desc(depositRequests.createdAt));
      return res.json({ success: true, data: allDeposits });
    } catch (err) {
      console.error("Admin deposits error:", err);
      return res.status(500).json({ success: false, message: "Could not fetch deposits." });
    }
  });

  // ── Profile update ───────────────────────────────────

  app.patch("/api/auth/profile", requireAuth, async (req, res) => {
    const { name, email, currentPassword, newPassword } = req.body;
    try {
      const [user] = await db.select().from(users).where(eq(users.id, req.session.userId!));
      if (!user) {
        return res.json({ success: false, message: "User not found." });
      }

      const updates: Partial<typeof users.$inferInsert> = {};

      if (name && name.trim()) updates.name = name.trim();

      if (email && email.trim() && email.toLowerCase() !== user.email) {
        const [existing] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
        if (existing) {
          return res.json({ success: false, message: "That email is already in use." });
        }
        updates.email = email.toLowerCase().trim();
      }

      if (newPassword) {
        if (!currentPassword) {
          return res.json({ success: false, message: "Current password is required to set a new password." });
        }
        const match = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!match) {
          return res.json({ success: false, message: "Current password is incorrect." });
        }
        if (newPassword.length < 6) {
          return res.json({ success: false, message: "New password must be at least 6 characters." });
        }
        updates.passwordHash = await bcrypt.hash(newPassword, 10);
      }

      if (Object.keys(updates).length === 0) {
        return res.json({ success: true, message: "No changes made." });
      }

      const [updated] = await db.update(users).set(updates).where(eq(users.id, user.id)).returning();
      return res.json({
        success: true,
        user: { id: updated.id, email: updated.email, name: updated.name, role: updated.role, balanceCents: updated.balanceCents },
      });
    } catch (err) {
      console.error("Profile update error:", err);
      return res.status(500).json({ success: false, message: "Could not update profile." });
    }
  });

  // ── Admin key inventory routes ───────────────────────

  app.post("/api/admin/inventory", requireAdmin, async (req, res) => {
    const { plan, keys } = req.body;
    const validPlans = ["plus-1m", "plus-1y", "go-1y", "pro-1m"];
    if (!plan || !validPlans.includes(plan)) {
      return res.json({ success: false, message: "Valid plan is required." });
    }
    if (!Array.isArray(keys) || keys.length === 0) {
      return res.json({ success: false, message: "At least one key is required." });
    }
    const cleanKeys: string[] = keys.map((k: string) => k.trim()).filter((k: string) => k.length > 0);
    if (cleanKeys.length === 0) {
      return res.json({ success: false, message: "No valid keys found after trimming." });
    }
    if (cleanKeys.length > 500) {
      return res.json({ success: false, message: "Maximum 500 keys per batch." });
    }
    try {
      const rows = cleanKeys.map((k) => ({ plan, key: k, status: "available" as const, addedBy: req.session.userId! }));
      await db.insert(inventoryKeys).values(rows);
      return res.json({ success: true, added: cleanKeys.length });
    } catch (err) {
      console.error("Inventory insert error:", err);
      return res.status(500).json({ success: false, message: "Could not save keys." });
    }
  });

  app.get("/api/admin/inventory", requireAdmin, async (req, res) => {
    const planFilter = req.query.plan as string | undefined;
    const statusFilter = req.query.status as string | undefined;
    try {
      const conditions = [ne(inventoryKeys.status, "deleted" as const)];
      if (planFilter) conditions.push(eq(inventoryKeys.plan, planFilter));
      if (statusFilter) conditions.push(eq(inventoryKeys.status, statusFilter));

      const rows = await db.select({
        id: inventoryKeys.id,
        plan: inventoryKeys.plan,
        key: inventoryKeys.key,
        status: inventoryKeys.status,
        soldTo: inventoryKeys.soldTo,
        soldToEmail: users.email,
        soldToName: users.name,
        soldAt: inventoryKeys.soldAt,
        createdAt: inventoryKeys.createdAt,
      }).from(inventoryKeys)
        .leftJoin(users, eq(inventoryKeys.soldTo, users.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(inventoryKeys.createdAt))
        .limit(200);

      // Summary: count available/sold per plan
      const summary = await db.execute<{ plan: string; status: string; cnt: string }>(
        sql`SELECT plan, status, COUNT(*) as cnt FROM inventory_keys GROUP BY plan, status`
      );

      return res.json({ success: true, data: rows, summary: summary.rows });
    } catch (err) {
      console.error("Inventory fetch error:", err);
      return res.status(500).json({ success: false, message: "Could not fetch inventory." });
    }
  });

  app.delete("/api/admin/inventory/:id", requireAdmin, async (req, res) => {
    const keyId = parseInt(req.params.id, 10);
    try {
      const [key] = await db.select().from(inventoryKeys).where(eq(inventoryKeys.id, keyId));
      if (!key) return res.json({ success: false, message: "Key not found." });
      if (key.status !== "available") return res.json({ success: false, message: "Only unsold keys can be deleted." });
      await db.update(inventoryKeys)
        .set({ status: "deleted", deletedAt: new Date() })
        .where(eq(inventoryKeys.id, keyId));
      return res.json({ success: true });
    } catch (err) {
      console.error("Inventory delete error:", err);
      return res.status(500).json({ success: false, message: "Could not delete key." });
    }
  });

  app.get("/api/admin/inventory/search", requireAdmin, async (req, res) => {
    const keyVal = (req.query.key as string ?? "").trim();
    if (!keyVal) return res.json({ success: false, message: "Key is required." });
    try {
      const rows = await db.select({
        id: inventoryKeys.id,
        plan: inventoryKeys.plan,
        key: inventoryKeys.key,
        status: inventoryKeys.status,
        addedBy: inventoryKeys.addedBy,
        soldTo: inventoryKeys.soldTo,
        soldToEmail: users.email,
        soldToName: users.name,
        soldAt: inventoryKeys.soldAt,
        deletedAt: inventoryKeys.deletedAt,
        createdAt: inventoryKeys.createdAt,
      }).from(inventoryKeys)
        .leftJoin(users, eq(inventoryKeys.soldTo, users.id))
        .where(sql`LOWER(${inventoryKeys.key}) = LOWER(${keyVal})`);
      if (rows.length === 0) return res.json({ success: false, message: "Key not found in inventory." });
      return res.json({ success: true, key: rows[0] });
    } catch (err) {
      console.error("Key search error:", err);
      return res.status(500).json({ success: false, message: "Search failed." });
    }
  });

  app.get("/api/admin/inventory/deleted", requireAdmin, async (req, res) => {
    try {
      const keys = await db.select({
        id: inventoryKeys.id,
        plan: inventoryKeys.plan,
        key: inventoryKeys.key,
        deletedAt: inventoryKeys.deletedAt,
        createdAt: inventoryKeys.createdAt,
      }).from(inventoryKeys)
        .where(eq(inventoryKeys.status, "deleted"))
        .orderBy(desc(inventoryKeys.deletedAt));
      return res.json({ success: true, keys });
    } catch (err) {
      console.error("Inventory deleted list error:", err);
      return res.status(500).json({ success: false, message: "Could not fetch deleted keys." });
    }
  });

  app.post("/api/admin/inventory/:id/restore", requireAdmin, async (req, res) => {
    const keyId = parseInt(req.params.id, 10);
    try {
      const [key] = await db.select().from(inventoryKeys).where(eq(inventoryKeys.id, keyId));
      if (!key) return res.json({ success: false, message: "Key not found." });
      if (key.status !== "deleted") return res.json({ success: false, message: "Key is not deleted." });
      await db.update(inventoryKeys)
        .set({ status: "available", deletedAt: null })
        .where(eq(inventoryKeys.id, keyId));
      return res.json({ success: true });
    } catch (err) {
      console.error("Inventory restore error:", err);
      return res.status(500).json({ success: false, message: "Could not restore key." });
    }
  });

  app.delete("/api/admin/inventory/:id/permanent", requireAdmin, async (req, res) => {
    const keyId = parseInt(req.params.id, 10);
    try {
      const [key] = await db.select().from(inventoryKeys).where(eq(inventoryKeys.id, keyId));
      if (!key) return res.json({ success: false, message: "Key not found." });
      if (key.status !== "deleted") return res.json({ success: false, message: "Key must be in trash first." });
      await db.delete(inventoryKeys).where(eq(inventoryKeys.id, keyId));
      return res.json({ success: true });
    } catch (err) {
      console.error("Inventory permanent delete error:", err);
      return res.status(500).json({ success: false, message: "Could not permanently delete key." });
    }
  });

  // ── Existing CDK routes ──────────────────────────────

  app.get("/api/products", async (_req, res) => {
    try {
      const data = await apiCall("GET", "/products");
      return res.json(data);
    } catch (err) {
      console.error("Products fetch error:", err);
      return res.status(500).json({ success: false, message: "Could not fetch products." });
    }
  });

  app.post("/api/validate-cdk", async (req, res) => {
    const { key } = req.body;
    if (!key || typeof key !== "string" || key.trim().length === 0) {
      return res.json({ valid: false, message: "CDK key is required." });
    }
    try {
      const data = await apiCall("GET", `/key/${encodeURIComponent(key.trim())}/status`);
      if (!data.success) {
        const msg = data.error === "key_not_found" ? "Key not found or not available." : data.message || "Invalid key.";
        return res.json({ valid: false, message: msg });
      }
      const keyData = data.data;
      if (keyData.status === "available") {
        return res.json({ valid: true, type: keyData.subscription || "Plus CDK", status: keyData.status });
      } else if (keyData.status === "used" || keyData.status === "activated") {
        const activatedFor = keyData.activated_for ?? keyData.used_by ?? keyData.email ?? keyData.activated_email ?? null;
        const activatedAt = keyData.activated_at ?? keyData.used_at ?? keyData.activatedAt ?? null;
        return res.json({
          valid: false,
          status: "used",
          message: "This key has already been activated.",
          activatedFor,
          activatedAt,
        });
      } else if (keyData.status === "expired") {
        return res.json({ valid: false, status: "expired", message: "This key has expired." });
      }
      return res.json({ valid: false, message: "Key is not available for activation." });
    } catch (err) {
      console.error("CDK validation error:", err);
      return res.status(500).json({ valid: false, message: "Validation service unavailable. Please try again." });
    }
  });

  app.post("/api/validate-session", async (req, res) => {
    const { sessionData } = req.body;
    if (!sessionData || typeof sessionData !== "string") {
      return res.json({ valid: false, message: "Session data is required." });
    }
    try {
      const parsed = JSON.parse(sessionData.trim());
      if (!parsed || typeof parsed !== "object") {
        return res.json({ valid: false, message: "Session data must be a JSON object." });
      }
      const accessToken = parsed.accessToken || parsed.access_token || parsed.token;
      if (!accessToken) {
        return res.json({ valid: false, message: "No accessToken found. Copy the full JSON from chat.openai.com/api/auth/session." });
      }
      const tokenCheck = validateAccessToken(accessToken);
      if (!tokenCheck.valid) {
        return res.json({ valid: false, message: tokenCheck.message });
      }
      let chatGptRes: Response;
      try {
        chatGptRes = await fetch("https://chatgpt.com/backend-api/me", {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
        });
      } catch {
        return res.json({ valid: false, message: "Could not reach ChatGPT to verify your session. Please try again." });
      }
      if (chatGptRes.status === 401 || chatGptRes.status === 403) {
        return res.json({ valid: false, message: "Session expired or revoked. Open the AuthSession page again for a fresh token." });
      }
      if (!chatGptRes.ok) {
        return res.json({ valid: false, message: `Token verification failed (HTTP ${chatGptRes.status}). Please get a new session token.` });
      }
      return res.json({ valid: true, message: "Session data is valid." });
    } catch {
      return res.json({ valid: false, message: "Invalid JSON. Please copy the full content from the AuthSession page." });
    }
  });

  app.post("/api/activate", async (req, res) => {
    const { cdkKey, sessionData } = req.body;
    if (!cdkKey || !sessionData) {
      return res.json({ success: false, message: "CDK key and session data are required." });
    }
    let accessToken: string;
    const rawSession = sessionData.trim();
    try {
      const parsed = JSON.parse(rawSession);
      accessToken = parsed.accessToken || parsed.access_token || parsed.token;
      if (!accessToken) {
        return res.json({ success: false, message: "No accessToken found in session data." });
      }
    } catch {
      return res.json({ success: false, message: "Invalid session data — could not parse JSON." });
    }
    try {
      console.log("[activate] key:", cdkKey.trim().slice(0, 8) + "...", "token length:", accessToken.length, "token prefix:", accessToken.slice(0, 20));

      // Try with full session JSON first, then fall back to just the access token
      let data = await apiCall("POST", "/activate", { key: cdkKey.trim(), user_token: rawSession });
      console.log("[activate] full-session attempt: success:", data.success, "error:", data.error);

      if (!data.success && data.error === "token_invalid") {
        // Fall back to just the access token
        data = await apiCall("POST", "/activate", { key: cdkKey.trim(), user_token: accessToken });
        console.log("[activate] token-only attempt: success:", data.success, "error:", data.error);
      }
      if (data.success) {
        return res.json({ success: true, email: data.data?.email, product: data.data?.product, subscription: data.data?.subscription, activatedAt: data.data?.activated_at });
      }
      const errorMessages: Record<string, string> = {
        key_not_found: "Key not found or not available.",
        activation_failed: "Activation failed. Please check your session data and try again.",
        token_invalid: "Token validation failed. Please get a fresh session from the ChatGPT AuthSession page.",
        rate_limit_exceeded: "Too many requests. Please wait and try again.",
        out_of_stock: "Product is out of stock.",
      };
      const msg = errorMessages[data.error] || data.message || "Activation failed.";
      return res.json({ success: false, message: msg });
    } catch (err) {
      console.error("Activation error:", err);
      return res.status(500).json({ success: false, message: "Activation service unavailable. Please try again." });
    }
  });

  // ── Nitro Auto-Activate (receipt-api.nitro.xin) ──────────────────────────
  app.post("/api/activate-nitro", async (req, res) => {
    const { cdkKey, sessionData } = req.body;
    if (!cdkKey || !sessionData) {
      return res.json({ success: false, message: "CDK key and session data are required." });
    }
    try {
      const resp = await fetch("https://receipt-api.nitro.xin/stocks/public/outstock", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Device-Id": "web",
        },
        body: JSON.stringify({ cdk: cdkKey.trim(), user: sessionData.trim() }),
      });
      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        console.error("[nitro] outstock error:", resp.status, errText);
        return res.json({ success: false, message: errText || `Activation service returned error ${resp.status}.` });
      }
      const contentType = resp.headers.get("content-type") || "";
      let taskId: string;
      if (contentType.includes("application/json")) {
        const json = await resp.json();
        taskId = typeof json === "string" ? json : String(json);
      } else {
        taskId = (await resp.text()).trim();
      }
      if (!taskId) {
        return res.json({ success: false, message: "Activation service did not return a task ID." });
      }
      return res.json({ success: true, taskId });
    } catch (err) {
      console.error("[nitro] activate error:", err);
      return res.json({ success: false, message: "Could not reach the activation service. Please try again." });
    }
  });

  app.get("/api/activate-nitro/:taskId", async (req, res) => {
    const { taskId } = req.params;
    try {
      const resp = await fetch(`https://receipt-api.nitro.xin/stocks/public/outstock/${encodeURIComponent(taskId)}`);
      if (!resp.ok) {
        return res.json({ pending: true, success: false, message: `Poll error ${resp.status}.` });
      }
      const data = await resp.json();
      return res.json(data);
    } catch (err) {
      console.error("[nitro] poll error:", err);
      return res.json({ pending: true, success: false, message: "Polling failed, retrying..." });
    }
  });

  app.post("/api/batch-status", async (req, res) => {
    const { keys } = req.body;
    if (!Array.isArray(keys) || keys.length === 0) {
      return res.json({ success: false, message: "An array of keys is required." });
    }
    if (keys.length > 500) {
      return res.json({ success: false, message: "Maximum 500 keys per request." });
    }
    try {
      const data = await apiCall("POST", "/keys/batch-status", { keys });
      return res.json(data);
    } catch (err) {
      console.error("Batch status error:", err);
      return res.status(500).json({ success: false, message: "Service unavailable. Please try again." });
    }
  });

  return httpServer;
}
