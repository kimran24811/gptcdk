import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthRequest extends Request {
  tenantId?: number;
}

const JWT_SECRET = process.env.JWT_SECRET || "changeme";

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized." });
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET) as { tenantId: number };
    req.tenantId = payload.tenantId;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token." });
  }
}
