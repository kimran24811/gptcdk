import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";

const CDK_API_KEY = process.env.CDK_API_KEY || "";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.post("/api/validate-cdk", async (req, res) => {
    const { key } = req.body;

    if (!key || typeof key !== "string" || key.trim().length === 0) {
      return res.status(400).json({ valid: false, message: "CDK key is required." });
    }

    try {
      const trimmedKey = key.trim().toUpperCase();

      const isFormatValid =
        trimmedKey.length >= 8 &&
        /^[A-Z0-9\-]+$/.test(trimmedKey);

      if (!isFormatValid) {
        return res.json({
          valid: false,
          message: "Invalid CDK format. Please check your key and try again.",
        });
      }

      const stored = await storage.validateCdk(trimmedKey, CDK_API_KEY);

      if (stored) {
        return res.json({
          valid: true,
          type: stored.type,
          message: "CDK is valid.",
        });
      }

      return res.json({
        valid: false,
        message: "CDK not found or already used. Please check your key.",
      });
    } catch (err) {
      console.error("CDK validation error:", err);
      return res.status(500).json({ valid: false, message: "Validation service unavailable." });
    }
  });

  app.post("/api/validate-session", async (req, res) => {
    const { sessionData } = req.body;

    if (!sessionData || typeof sessionData !== "string") {
      return res.status(400).json({ valid: false, message: "Session data is required." });
    }

    try {
      const parsed = JSON.parse(sessionData.trim());

      if (!parsed || typeof parsed !== "object") {
        return res.json({ valid: false, message: "Session data must be a JSON object." });
      }

      const hasRequiredFields =
        parsed.accessToken || parsed.user || parsed.expires || parsed.session;

      if (!hasRequiredFields) {
        return res.json({
          valid: false,
          message: "Session data appears incomplete. Make sure you copied the full JSON from the AuthSession page.",
        });
      }

      return res.json({ valid: true, message: "Session data is valid." });
    } catch {
      return res.json({
        valid: false,
        message: "Invalid JSON. Please copy the full content from the AuthSession page.",
      });
    }
  });

  app.post("/api/activate", async (req, res) => {
    const { cdkKey, sessionData } = req.body;

    if (!cdkKey || !sessionData) {
      return res.status(400).json({ success: false, message: "CDK key and session data are required." });
    }

    try {
      const parsed = JSON.parse(sessionData.trim());

      const result = await storage.activateCdk(cdkKey.trim().toUpperCase(), parsed, CDK_API_KEY);

      if (result.success) {
        return res.json({ success: true, message: "Subscription activated successfully." });
      }

      return res.json({ success: false, message: result.message || "Activation failed." });
    } catch (err) {
      console.error("Activation error:", err);
      return res.status(500).json({ success: false, message: "Activation service unavailable." });
    }
  });

  return httpServer;
}
