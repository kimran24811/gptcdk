import { Router } from "express";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { db, keyPool } from "../db";
import { eq, and } from "drizzle-orm";
import { sql } from "drizzle-orm";

export const keysRouter = Router();
keysRouter.use(requireAuth);

keysRouter.get("/", async (req: AuthRequest, res) => {
  const filter = req.query.status as string | undefined;
  let rows;
  if (filter === "available") {
    rows = await db.select().from(keyPool)
      .where(and(eq(keyPool.tenantId, req.tenantId!), eq(keyPool.isUsed, false)))
      .orderBy(keyPool.createdAt);
  } else if (filter === "used") {
    rows = await db.select().from(keyPool)
      .where(and(eq(keyPool.tenantId, req.tenantId!), eq(keyPool.isUsed, true)))
      .orderBy(keyPool.usedAt);
  } else {
    rows = await db.select().from(keyPool)
      .where(eq(keyPool.tenantId, req.tenantId!))
      .orderBy(keyPool.createdAt);
  }

  const [stats] = await db.select({
    total:     sql<number>`COUNT(*)`,
    available: sql<number>`COUNT(*) FILTER (WHERE is_used = false)`,
    used:      sql<number>`COUNT(*) FILTER (WHERE is_used = true)`,
  }).from(keyPool).where(eq(keyPool.tenantId, req.tenantId!));

  res.json({ keys: rows, stats });
});

keysRouter.post("/", async (req: AuthRequest, res) => {
  const { keysText } = req.body;
  if (!keysText || typeof keysText !== "string") {
    return res.status(400).json({ error: "keysText is required." });
  }
  const lines = keysText.split("\n").map((l: string) => l.trim()).filter(Boolean);
  if (lines.length === 0) return res.status(400).json({ error: "No keys found." });

  const values = lines.map((k: string) => ({
    tenantId: req.tenantId!,
    plan: "chatgpt_plus",
    keyValue: k,
  }));
  const inserted = await db.insert(keyPool).values(values).returning();
  res.json({ inserted: inserted.length });
});

keysRouter.delete("/:id", async (req: AuthRequest, res) => {
  const id = parseInt(req.params.id, 10);
  const [key] = await db.select().from(keyPool)
    .where(and(eq(keyPool.id, id), eq(keyPool.tenantId, req.tenantId!)));
  if (!key) return res.status(404).json({ error: "Key not found." });
  if (key.isUsed) return res.status(400).json({ error: "Cannot delete a used key." });
  await db.delete(keyPool).where(eq(keyPool.id, id));
  res.json({ ok: true });
});
