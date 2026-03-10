import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import bcrypt from "bcrypt";
import { eq, desc } from "drizzle-orm";
import { db } from "./storage";
import { users, transactions, orders } from "@shared/schema";

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
          insufficient_balance: "Supplier balance issue. Please contact support.",
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
    try {
      const parsed = JSON.parse(sessionData.trim());
      accessToken = parsed.accessToken || parsed.access_token || parsed.token;
      if (!accessToken) {
        return res.json({ success: false, message: "No accessToken found in session data." });
      }
    } catch {
      return res.json({ success: false, message: "Invalid session data — could not parse JSON." });
    }
    try {
      console.log("[activate] calling /api/v1/activate for key:", cdkKey.trim().slice(0, 8) + "...");
      const data = await apiCall("POST", "/activate", { key: cdkKey.trim(), user_token: accessToken });
      console.log("[activate] response success:", data.success, "error:", data.error);
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
