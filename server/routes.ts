import type { Express } from "express";
import { createServer, type Server } from "http";

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

function validateAccessToken(token: string): { valid: boolean; message?: string } {
  // Must be a non-empty string
  if (!token || typeof token !== "string" || token.trim().length === 0) {
    return { valid: false, message: "No access token found in session data." };
  }

  const parts = token.split(".");

  // A JWT must have exactly 3 parts
  if (parts.length !== 3) {
    return {
      valid: false,
      message: "Invalid token format. Please copy the full JSON from the AuthSession page.",
    };
  }

  // Decode the payload (second part) — base64url encoded
  try {
    const payloadBase64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payloadBase64 + "=".repeat((4 - (payloadBase64.length % 4)) % 4);
    const payload = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));

    // Check expiry
    if (payload.exp) {
      const nowSeconds = Math.floor(Date.now() / 1000);
      if (payload.exp < nowSeconds) {
        return {
          valid: false,
          message: "Invalid token. Please get a new one — your session has expired. Open the AuthSession page again to get a fresh token.",
        };
      }
    }

    return { valid: true };
  } catch {
    return {
      valid: false,
      message: "Could not read token data. Make sure you copied the full JSON from the AuthSession page.",
    };
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

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
      return res.status(400).json({ valid: false, message: "CDK key is required." });
    }

    try {
      const trimmedKey = key.trim();
      const data = await apiCall("GET", `/key/${encodeURIComponent(trimmedKey)}/status`);

      if (!data.success) {
        const msg =
          data.error === "key_not_found"
            ? "Key not found or not available."
            : data.message || "Invalid key.";
        return res.json({ valid: false, message: msg });
      }

      const keyData = data.data;
      if (keyData.status === "available") {
        // Only show subscription name, not "ChatGPT ChatGPT Plus CDK"
        const type = keyData.subscription || "Plus CDK";
        return res.json({
          valid: true,
          type,
          status: keyData.status,
        });
      } else if (keyData.status === "used") {
        return res.json({ valid: false, message: "This key has already been activated." });
      } else if (keyData.status === "expired") {
        return res.json({ valid: false, message: "This key has expired." });
      } else {
        return res.json({ valid: false, message: "Key is not available for activation." });
      }
    } catch (err) {
      console.error("CDK validation error:", err);
      return res.status(500).json({ valid: false, message: "Validation service unavailable. Please try again." });
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

      const accessToken = parsed.accessToken || parsed.access_token || parsed.token;

      if (!accessToken || typeof accessToken !== "string") {
        return res.json({
          valid: false,
          message: "No accessToken found in session data. Make sure you copied the full JSON from the ChatGPT AuthSession page (chat.openai.com/api/auth/session).",
        });
      }

      // Local JWT format + expiry check first (fast path for obviously bad tokens)
      const tokenCheck = validateAccessToken(accessToken);
      if (!tokenCheck.valid) {
        return res.json({ valid: false, message: tokenCheck.message });
      }

      // Actually verify the token is live by calling ChatGPT's API
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
        // Network error reaching ChatGPT — can't verify, reject to be safe
        return res.json({
          valid: false,
          message: "Could not reach ChatGPT to verify your session. Please check your connection and try again.",
        });
      }

      if (chatGptRes.status === 401 || chatGptRes.status === 403) {
        return res.json({
          valid: false,
          message: "Invalid token. Please get a new one — your session has expired or been revoked. Open the AuthSession page again to get a fresh token.",
        });
      }

      if (!chatGptRes.ok) {
        return res.json({
          valid: false,
          message: `Token verification failed (HTTP ${chatGptRes.status}). Please get a new session token.`,
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
      const userToken = parsed.accessToken || parsed.access_token || parsed.token;

      if (!userToken) {
        return res.json({ success: false, message: "Could not extract user token from session data." });
      }

      const data = await apiCall("POST", "/activate", {
        key: cdkKey.trim(),
        user_token: userToken,
      });

      if (data.success) {
        return res.json({
          success: true,
          email: data.data?.email,
          product: data.data?.product,
          subscription: data.data?.subscription,
          activatedAt: data.data?.activated_at,
        });
      }

      const errorMessages: Record<string, string> = {
        key_not_found: "Key not found or not available.",
        activation_failed: "Activation failed. Please check your session data and try again.",
        rate_limit_exceeded: "Too many requests. Please wait and try again.",
        token_inactive: "API token is inactive. Please contact support.",
        token_expired: "API token has expired. Please contact support.",
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
      return res.status(400).json({ success: false, message: "An array of keys is required." });
    }

    if (keys.length > 500) {
      return res.status(400).json({ success: false, message: "Maximum 500 keys per request." });
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
