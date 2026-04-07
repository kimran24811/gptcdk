import { Router } from "express";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { db, orders, keyPool } from "../db";
import { eq, and, desc } from "drizzle-orm";
import { WAManager } from "../wa/WAManager";

export const ordersRouter = Router();
ordersRouter.use(requireAuth);

ordersRouter.get("/", async (req: AuthRequest, res) => {
  const status = req.query.status as string | undefined;
  let rows;
  if (status) {
    rows = await db.select().from(orders)
      .where(and(eq(orders.tenantId, req.tenantId!), eq(orders.status, status as any)))
      .orderBy(desc(orders.createdAt));
  } else {
    rows = await db.select().from(orders)
      .where(eq(orders.tenantId, req.tenantId!))
      .orderBy(desc(orders.createdAt));
  }
  res.json(rows);
});

// Manual confirm & deliver (for Binance/BSC or failed auto-verify)
ordersRouter.post("/:id/confirm", async (req: AuthRequest, res) => {
  const id = parseInt(req.params.id, 10);
  const [order] = await db.select().from(orders)
    .where(and(eq(orders.id, id), eq(orders.tenantId, req.tenantId!)));
  if (!order) return res.status(404).json({ error: "Order not found." });
  if (order.status === "delivered") return res.status(400).json({ error: "Already delivered." });

  // Grab available keys
  const available = await db.select().from(keyPool)
    .where(and(eq(keyPool.tenantId, req.tenantId!), eq(keyPool.isUsed, false)))
    .limit(order.quantity);

  if (available.length === 0) {
    return res.status(400).json({ error: "No keys available in stock." });
  }

  const toDeliver = available.slice(0, order.quantity);
  const keyValues = toDeliver.map(k => k.keyValue);

  // Mark keys as used
  for (const k of toDeliver) {
    await db.update(keyPool).set({ isUsed: true, usedAt: new Date(), usedByJid: order.jid })
      .where(eq(keyPool.id, k.id));
  }

  const newStatus = toDeliver.length < order.quantity ? "insufficient_stock" : "delivered";
  await db.update(orders).set({ status: newStatus as any, keysDelivered: keyValues }).where(eq(orders.id, id));

  // Send keys via WhatsApp
  try {
    const keyList = keyValues.map((k, i) => `${i + 1}. ${k}`).join("\n");
    let msg = `✅ *Your ChatGPT Plus CDK Keys:*\n\n${keyList}\n\nThank you for your purchase! 🎉`;
    if (toDeliver.length < order.quantity) {
      msg = `✅ *Partial Delivery (${toDeliver.length}/${order.quantity} keys):*\n\n${keyList}\n\n⚠️ Remaining keys will follow shortly.`;
    }
    await WAManager.sendMessage(req.tenantId!, order.jid, msg);
  } catch (err: any) {
    // Don't fail the confirm if WA send fails — keys are already marked
    console.error("[confirm] WA send error:", err.message);
  }

  res.json({ ok: true, delivered: keyValues.length, status: newStatus });
});

ordersRouter.post("/:id/cancel", async (req: AuthRequest, res) => {
  const id = parseInt(req.params.id, 10);
  const [order] = await db.select().from(orders)
    .where(and(eq(orders.id, id), eq(orders.tenantId, req.tenantId!)));
  if (!order) return res.status(404).json({ error: "Order not found." });
  if (order.status === "delivered") return res.status(400).json({ error: "Cannot cancel a delivered order." });
  await db.update(orders).set({ status: "cancelled" }).where(eq(orders.id, id));

  // Notify customer
  try {
    await WAManager.sendMessage(req.tenantId!, order.jid,
      "❌ Your order has been cancelled. If you believe this is an error, please contact support.\n\nSend *hi* to place a new order."
    );
  } catch { /* silent */ }

  res.json({ ok: true });
});
