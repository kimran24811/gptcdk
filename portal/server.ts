import express from "express";
import cors from "cors";
import path from "path";

const app = express();
const PORT = process.env.PORT || 3001;
const CDK_API_KEY = process.env.CDK_API_KEY || "";
const API_BASE = "https://keys.ovh/api/v1";

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

// ── Helpers ───────────────────────────────────────────────────────────────────

async function apiCall(method: string, endpoint: string, body?: object) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${CDK_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

function validateAccessToken(token: string): { valid: boolean; message?: string } {
  if (!token || typeof token !== "string" || token.trim().length === 0) {
    return { valid: false, message: "No access token found in session data." };
  }
  const parts = token.split(".");
  if (parts.length !== 3) {
    return { valid: false, message: "Invalid token format. Make sure you copied the full JSON from the ChatGPT session page." };
  }
  try {
    const payloadBase64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payloadBase64 + "=".repeat((4 - (payloadBase64.length % 4)) % 4);
    const payload = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
    if (payload.exp) {
      const nowSeconds = Math.floor(Date.now() / 1000);
      if (payload.exp < nowSeconds) {
        return { valid: false, message: "Token expired. Open the ChatGPT session page again for a fresh token." };
      }
    }
    return { valid: true };
  } catch {
    return { valid: false, message: "Could not read token data. Make sure you copied the full JSON." };
  }
}

// ── API Routes ────────────────────────────────────────────────────────────────

// POST /api/validate-key
app.post("/api/validate-key", async (req, res) => {
  const { key } = req.body;
  if (!key || typeof key !== "string" || key.trim().length === 0) {
    return res.json({ valid: false, message: "Activation key is required." });
  }
  try {
    const data = await apiCall("GET", `/key/${encodeURIComponent(key.trim())}/status`);
    if (!data.success) {
      const msg =
        data.error === "key_not_found"
          ? "Key not found or not available."
          : data.message || "Invalid key.";
      return res.json({ valid: false, message: msg });
    }
    const keyData = data.data;
    if (keyData.status === "available") {
      return res.json({ valid: true, type: keyData.subscription || "ChatGPT Plus", status: keyData.status });
    } else if (keyData.status === "used" || keyData.status === "activated") {
      return res.json({
        valid: false,
        status: "used",
        message: "This key has already been activated.",
        activatedFor: keyData.activated_for ?? keyData.used_by ?? keyData.email ?? null,
        activatedAt: keyData.activated_at ?? keyData.used_at ?? null,
      });
    } else if (keyData.status === "expired") {
      return res.json({ valid: false, status: "expired", message: "This key has expired." });
    }
    return res.json({ valid: false, message: "Key is not available for activation." });
  } catch (err) {
    console.error("[validate-key] error:", err);
    return res.status(500).json({ valid: false, message: "Validation service unavailable. Please try again." });
  }
});

// POST /api/validate-session
// Validates session JSON, checks token liveness, and returns current account plan
app.post("/api/validate-session", async (req, res) => {
  const { sessionData } = req.body;
  if (!sessionData || typeof sessionData !== "string") {
    return res.json({ valid: false, message: "Session data is required." });
  }
  let accessToken: string;
  let emailFromJson: string | null = null;
  let planFromJson: string | null = null;
  try {
    const parsed = JSON.parse(sessionData.trim());
    if (!parsed || typeof parsed !== "object") {
      return res.json({ valid: false, message: "Session data must be a JSON object." });
    }
    accessToken = parsed.accessToken || parsed.access_token || parsed.token;
    if (!accessToken) {
      return res.json({ valid: false, message: "No accessToken found. Copy the full JSON from chatgpt.com/api/auth/session." });
    }
    emailFromJson = parsed.user?.email ?? null;
    planFromJson = parsed.account?.plan?.type ?? parsed.account?.planType ?? null;
  } catch {
    return res.json({ valid: false, message: "Invalid JSON. Please copy the full content from the session page." });
  }

  const tokenCheck = validateAccessToken(accessToken);
  if (!tokenCheck.valid) {
    return res.json({ valid: false, message: tokenCheck.message });
  }

  try {
    const chatGptRes = await fetch("https://chatgpt.com/backend-api/me", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (chatGptRes.status === 401 || chatGptRes.status === 403) {
      return res.json({ valid: false, message: "Session expired or revoked. Open the ChatGPT session page again for a fresh token." });
    }
    if (!chatGptRes.ok) {
      return res.json({ valid: false, message: `Token verification failed (HTTP ${chatGptRes.status}). Please get a new session token.` });
    }
    let meData: any = {};
    try { meData = await chatGptRes.json(); } catch { /* ignore */ }

    const email = meData?.email ?? emailFromJson ?? null;
    // Determine current plan from API response or parsed session
    const planType: string = meData?.account?.plan?.type ?? meData?.planType ?? planFromJson ?? "free";
    const hasPaidPlan = planType !== "free" && planType !== null && planType !== "";

    return res.json({
      valid: true,
      email,
      planType,
      hasPaidPlan,
      message: "Session is valid.",
    });
  } catch {
    return res.json({ valid: false, message: "Could not reach ChatGPT to verify your session. Please try again." });
  }
});

// POST /api/batch-check
// Body: { keys: string[] }
// Checks status of multiple activation keys using a single batch API call
app.post("/api/batch-check", async (req, res) => {
  const { keys } = req.body;
  if (!Array.isArray(keys) || keys.length === 0) {
    return res.json({ success: false, message: "Provide an array of keys." });
  }
  if (keys.length > 100) {
    return res.json({ success: false, message: "Maximum 100 keys per batch check." });
  }

  const cleanKeys = keys.map((k: string) => String(k).trim()).filter(Boolean);

  try {
    const data = await apiCall("POST", "/keys/batch-status", { keys: cleanKeys });
    if (!data.success) {
      return res.json({ success: false, message: data.message || "Batch check failed." });
    }

    // Normalize the response array into a consistent format
    const results = (data.data || []).map((item: any) => {
      const key = item.key || item.cdk || "";
      const status = item.status;
      if (status === "available") {
        return { key, status: "available", type: item.subscription || item.type || "ChatGPT Plus" };
      } else if (status === "used" || status === "activated") {
        return {
          key,
          status: "used",
          activatedFor: item.activated_for ?? item.used_by ?? item.email ?? null,
          activatedAt: item.activated_at ?? item.used_at ?? null,
        };
      } else if (status === "expired") {
        return { key, status: "expired" };
      }
      return { key, status: "invalid", message: item.message || "Invalid key" };
    });

    return res.json({ success: true, results });
  } catch (err) {
    console.error("[batch-check] error:", err);
    return res.status(500).json({ success: false, message: "Batch check service unavailable. Please try again." });
  }
});

// POST /api/activate
app.post("/api/activate", async (req, res) => {
  const { key, sessionData } = req.body;
  if (!key || !sessionData) {
    return res.json({ success: false, message: "Activation key and session data are required." });
  }

  let accessToken: string;
  const rawSession = sessionData.trim();
  try {
    const parsed = JSON.parse(rawSession);
    if (!parsed || typeof parsed !== "object") {
      return res.json({ success: false, message: "Session data must be a JSON object." });
    }
    accessToken = parsed.accessToken || parsed.access_token || parsed.token;
    if (!accessToken) {
      return res.json({ success: false, message: "No accessToken found. Copy the full JSON from chatgpt.com/api/auth/session." });
    }
  } catch {
    return res.json({ success: false, message: "Invalid JSON. Please copy the full content from the session page." });
  }

  const tokenCheck = validateAccessToken(accessToken);
  if (!tokenCheck.valid) {
    return res.json({ success: false, message: tokenCheck.message });
  }

  try {
    const chatGptRes = await fetch("https://chatgpt.com/backend-api/me", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (chatGptRes.status === 401 || chatGptRes.status === 403) {
      return res.json({ success: false, message: "Session expired or revoked. Open the ChatGPT session page again for a fresh token." });
    }
    if (!chatGptRes.ok) {
      return res.json({ success: false, message: `Token verification failed (HTTP ${chatGptRes.status}). Please get a new session token.` });
    }
  } catch {
    return res.json({ success: false, message: "Could not reach ChatGPT to verify your session. Please try again." });
  }

  try {
    let data = await apiCall("POST", "/activate", { key: key.trim(), user_token: rawSession });
    if (!data.success && data.error === "token_invalid") {
      data = await apiCall("POST", "/activate", { key: key.trim(), user_token: accessToken });
    }
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
      token_invalid: "Token validation failed. Please get a fresh session from the ChatGPT session page.",
      rate_limit_exceeded: "Too many requests. Please wait a moment and try again.",
      out_of_stock: "Product is out of stock.",
    };
    return res.json({ success: false, message: errorMessages[data.error] || data.message || "Activation failed." });
  } catch (err) {
    console.error("[activate] error:", err);
    return res.status(500).json({ success: false, message: "Activation service unavailable. Please try again." });
  }
});

// ── Serve frontend ────────────────────────────────────────────────────────────
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

app.listen(PORT, () => {
  console.log(`Redemption Portal running on port ${PORT}`);
});
