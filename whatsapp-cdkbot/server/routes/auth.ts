import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db, tenants } from "../db";
import { eq } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../middleware/auth";

export const authRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET || "changeme";

authRouter.post("/register", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password required." });
  const [existing] = await db.select().from(tenants).where(eq(tenants.email, email));
  if (existing) return res.status(409).json({ error: "Email already registered." });
  const passwordHash = await bcrypt.hash(password, 10);
  const [tenant] = await db.insert(tenants).values({ email, passwordHash }).returning();
  const token = jwt.sign({ tenantId: tenant.id }, JWT_SECRET, { expiresIn: "30d" });
  res.json({ token, tenant: { id: tenant.id, email: tenant.email } });
});

authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password required." });
  const [tenant] = await db.select().from(tenants).where(eq(tenants.email, email));
  if (!tenant) return res.status(401).json({ error: "Invalid credentials." });
  const ok = await bcrypt.compare(password, tenant.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials." });
  const token = jwt.sign({ tenantId: tenant.id }, JWT_SECRET, { expiresIn: "30d" });
  res.json({ token, tenant: { id: tenant.id, email: tenant.email } });
});

authRouter.get("/me", requireAuth, async (req: AuthRequest, res) => {
  const [tenant] = await db.select({ id: tenants.id, email: tenants.email, createdAt: tenants.createdAt })
    .from(tenants).where(eq(tenants.id, req.tenantId!));
  if (!tenant) return res.status(404).json({ error: "Not found." });
  res.json(tenant);
});
