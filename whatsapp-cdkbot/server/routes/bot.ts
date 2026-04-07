import { Router } from "express";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { WAManager } from "../wa/WAManager";

export const botRouter = Router();
botRouter.use(requireAuth);

botRouter.get("/status", (req: AuthRequest, res) => {
  res.json(WAManager.getState(req.tenantId!));
});

botRouter.post("/start", async (req: AuthRequest, res) => {
  try {
    await WAManager.startSession(req.tenantId!);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

botRouter.post("/stop", async (req: AuthRequest, res) => {
  try {
    await WAManager.stopSession(req.tenantId!);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
