import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import bcrypt from "bcrypt";
import { eq, desc, and, sql } from "drizzle-orm";
import { db } from "./storage";
import { users, transactions, orders, depositRequests } from "@shared/schema";

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

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  await seedAdmin();

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

      // Fetch current price from API
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

      // Apply volume pricing
      let unitPrice = subType.price;
      if (subType.volume_prices?.length) {
        const sorted = [...subType.volume_prices].sort((a: any, b: any) => b.min_qty - a.min_qty);
        const tier = sorted.find((t: any) => quantity >= t.min_qty);
        if (tier) unitPrice = tier.price;
      }

      const totalCents = Math.round(unitPrice * quantity * 100);

      if (user.balanceCents < totalCents) {
        const shortfall = ((totalCents - user.balanceCents) / 100).toFixed(2);
        return res.json({
          success: false,
          message: `Insufficient balance. You need $${shortfall} more. Please top up your account.`,
          code: "insufficient_balance",
        });
      }

      // Purchase from keys.ovh
      const idempotencyKey = `${user.id}-${planId}-${quantity}-${Date.now()}`;
      console.log(`[purchase] user=${user.id} plan=${planId} qty=${quantity} total=$${(totalCents/100).toFixed(2)}`);

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

      const purchasedKeys: string[] = purchaseData.data?.keys || [];

      // Deduct balance and save order atomically
      await db.update(users)
        .set({ balanceCents: user.balanceCents - totalCents })
        .where(eq(users.id, user.id));

      await db.insert(transactions).values({
        userId: user.id,
        amountCents: totalCents,
        type: "debit",
        description: `${planSlug.name} x${quantity} — Order #${purchaseData.data?.order_number}`,
        createdBy: user.id,
      });

      const [savedOrder] = await db.insert(orders).values({
        userId: user.id,
        orderNumber: purchaseData.data?.order_number || idempotencyKey,
        product: purchaseData.data?.product || product.name,
        subscription: purchaseData.data?.subscription || subType.name,
        quantity,
        amountCents: totalCents,
        keys: purchasedKeys,
        status: purchaseData.data?.status || "delivered",
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
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
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

      const [deposit] = await db.insert(depositRequests).values({
        userId: req.session.userId!,
        amountUsdt,
        amountCents,
        network,
        status: "pending",
        expiresAt,
      }).returning();

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
      let found = false;
      let txHash: string | null = null;

      if (deposit.network === "bep20") {
        const url = `https://api.bscscan.com/api?module=account&action=tokentx&contractaddress=${USDT_BEP20_CONTRACT}&address=${USDT_BEP20_ADDRESS}&sort=desc&offset=50&page=1`;
        const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
        const data = await response.json();
        if (data.status === "1" && Array.isArray(data.result)) {
          const expectedWei = BigInt(Math.round(parseFloat(deposit.amountUsdt) * 10000)) * BigInt("100000000000000");
          for (const tx of data.result) {
            if (parseInt(tx.timeStamp) * 1000 < since) break;
            if (tx.to.toLowerCase() === USDT_BEP20_ADDRESS.toLowerCase() && BigInt(tx.value) === expectedWei) {
              found = true; txHash = tx.hash; break;
            }
          }
        }
      } else {
        // TRC-20: try TronScan first, fall back to TronGrid if unavailable
        interface TronScanTransfer {
          transaction_id: string;
          toAddress: string;
          quant: string;
          amount?: string;
        }
        interface TronScanResp { token_transfers: TronScanTransfer[]; }
        interface TronGridTransfer {
          transaction_id: string;
          to: string;
          value: string;
          quant?: string;
        }
        interface TronGridResp { data: TronGridTransfer[]; }

        const expectedAmount = Math.round(parseFloat(deposit.amountUsdt) * 1000000);
        let resolved = false;

        // Primary: TronScan
        try {
          const tronScanUrl = `https://apilist.tronscanapi.com/api/token_trc20/transfers?toAddress=${USDT_TRC20_ADDRESS}&contract_address=${USDT_TRC20_CONTRACT}&count=50&start=0&start_timestamp=${since}`;
          const tronScanResp = await fetch(tronScanUrl, {
            signal: AbortSignal.timeout(10000),
            headers: { "Accept": "application/json", "User-Agent": "ChatGPT-Recharge/1.0" },
          });
          if (tronScanResp.ok) {
            const contentType = tronScanResp.headers.get("content-type") ?? "";
            if (contentType.includes("application/json")) {
              const tronScanData = await tronScanResp.json() as TronScanResp;
              if (Array.isArray(tronScanData.token_transfers)) {
                resolved = true;
                for (const tx of tronScanData.token_transfers) {
                  const txAmount = parseInt(tx.quant || tx.amount || "0");
                  if (txAmount === expectedAmount) { found = true; txHash = tx.transaction_id; break; }
                }
              }
            }
          }
        } catch { /* TronScan unavailable — fall through to TronGrid */ }

        // Fallback: TronGrid (official TRON API, more reliable in production)
        if (!resolved) {
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
                if (toAddr === USDT_TRC20_ADDRESS.toLowerCase() && txAmount === expectedAmount) {
                  found = true; txHash = tx.transaction_id; break;
                }
              }
            }
          }
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
        // Concurrent request already processed — return current status
        return res.json({ success: true, status: "completed" });
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
      } else if (keyData.status === "used") {
        return res.json({ valid: false, message: "This key has already been activated." });
      } else if (keyData.status === "expired") {
        return res.json({ valid: false, message: "This key has expired." });
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
