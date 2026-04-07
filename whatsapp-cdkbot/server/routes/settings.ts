import { Router } from "express";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { db, tenantSettings } from "../db";
import { eq, and } from "drizzle-orm";

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

const ALLOWED_KEYS = [
  "bot_name",
  "binance_pay_id",
  "binance_username",
  "bsc_address",
  "nayapay_number",
  "gmail_user",
  "gmail_app_password",
];

settingsRouter.get("/", async (req: AuthRequest, res) => {
  const rows = await db.select().from(tenantSettings).where(eq(tenantSettings.tenantId, req.tenantId!));
  const result: Record<string, string> = {};
  for (const row of rows) {
    // Mask app password in response
    result[row.key] = row.key === "gmail_app_password" && row.value
      ? "••••••••••••••••"
      : row.value;
  }
  res.json(result);
});

settingsRouter.post("/", async (req: AuthRequest, res) => {
  const updates: Record<string, string> = req.body;
  for (const [key, value] of Object.entries(updates)) {
    if (!ALLOWED_KEYS.includes(key)) continue;
    if (typeof value !== "string") continue;
    // Don't overwrite password if placeholder was sent back
    if (key === "gmail_app_password" && value.startsWith("•")) continue;

    const [existing] = await db.select().from(tenantSettings)
      .where(and(eq(tenantSettings.tenantId, req.tenantId!), eq(tenantSettings.key, key)));
    if (existing) {
      await db.update(tenantSettings).set({ value })
        .where(and(eq(tenantSettings.tenantId, req.tenantId!), eq(tenantSettings.key, key)));
    } else {
      await db.insert(tenantSettings).values({ tenantId: req.tenantId!, key, value });
    }
  }
  res.json({ ok: true });
});
