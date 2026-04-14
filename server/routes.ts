import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import bcrypt from "bcrypt";
import { eq, desc, and, ne, sql, inArray, lt } from "drizzle-orm";
import { db } from "./storage";
import { users, transactions, orders, depositRequests, inventoryKeys, customProducts, customVouchers, announcementConfig, apiKeys, mainPlans } from "@shared/schema";
import crypto from "crypto";
import { sendWhatsAppMessage, getRawQR, getConnectionStatus, setMessageHandler } from "./whatsapp";

const USDT_BEP20_ADDRESS = (process.env.USDT_BEP20_ADDRESS || "0x0c31c91ec2cbb607aeca28c1bc09c55352db2fea").toLowerCase();
const USDT_BEP20_CONTRACT = "0x55d398326f99059ff775485246999027b3197955";
const ERC20_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const BSCSCAN_API_KEY = process.env.BSCSCAN_API_KEY || "9XYU1BJ44JJN4NSIPKTCVJ9UXPQZY2JWRU";
// Etherscan V2 unified API — chainid=56 targets BSC
const BSCSCAN_API_BASE = "https://api.etherscan.io/v2/api";
const BSC_CHAIN_ID = "56";

// Public BSC RPC endpoints used ONLY for single-TX receipt lookups.
// eth_getTransactionReceipt is a lightweight call — these free endpoints handle it fine.
// (eth_getLogs over block ranges is what gets rate-limited — we don't use that anymore.)
const BSC_RECEIPT_RPCS = [
  "https://bsc-dataseed.binance.org/",
  "https://bsc-dataseed1.bnbchain.org/",
  "https://bsc-dataseed2.bnbchain.org/",
  "https://bsc.publicnode.com",
  "https://1rpc.io/bnb",
  "https://binance.llamarpc.com",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function bscRpcCall(endpoint: string, method: string, params: unknown[]): Promise<unknown> {
  const resp = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(8000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json() as { result?: unknown; error?: { message?: string } };
  if (data.error) throw new Error(data.error.message ?? "RPC error");
  return data.result;
}

async function bscscanGet(params: Record<string, string | number>): Promise<unknown> {
  const qs = new URLSearchParams({
    chainid: BSC_CHAIN_ID,
    apikey: BSCSCAN_API_KEY,
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  });
  const resp = await fetch(`${BSCSCAN_API_BASE}?${qs}`, { signal: AbortSignal.timeout(15000) });
  if (!resp.ok) throw new Error(`Etherscan V2 HTTP ${resp.status}`);
  return resp.json();
}

// BSC produces ~1 block every 3 seconds
const BSC_BLOCK_TIME_S = 3;
// BSCScan tokentx accepts unlimited lookback but keep a sane cap
const BSC_MAX_LOOKBACK_BLOCKS = 5000;

/**
 * Batch-scan BEP-20 USDT transfers to our wallet using BSCScan API.
 * Returns a Map of amountUsdt → txHash for all matched amounts.
 */
async function scanBscDeposits(
  pendingAmounts: string[],
  lookbackBlocks = 200,
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  if (pendingAmounts.length === 0) return results;

  const safeBlocks = Math.min(lookbackBlocks, BSC_MAX_LOOKBACK_BLOCKS);

  // Pre-compute expected wei ranges for each pending amount (USDT BEP-20 = 18 decimals)
  const ranges = pendingAmounts.map((amt) => {
    const expectedWei = BigInt(Math.round(parseFloat(amt) * 1_000_000)) * BigInt("1000000000000");
    const toleranceWei = BigInt("10000000000000000"); // ±0.01 USDT
    return { amt, min: expectedWei - toleranceWei, max: expectedWei + toleranceWei };
  });

  try {
    // 1. Convert lookback window to a start block number via timestamp lookup
    const lookbackSec = safeBlocks * BSC_BLOCK_TIME_S;
    const fromTimestamp = Math.floor(Date.now() / 1000) - lookbackSec;
    let startBlock = 0; // fallback: let BSCScan return most-recent 10k txs

    try {
      const blockData = await bscscanGet({
        module: "block", action: "getblocknobytime",
        timestamp: fromTimestamp, closest: "before",
      }) as { status: string; message: string; result: string };
      console.log("[deposit] BSCScan getblocknobytime:", JSON.stringify(blockData));
      if (blockData.status === "1" && blockData.result) {
        startBlock = parseInt(blockData.result, 10);
      } else {
        console.warn("[deposit] BSCScan getblocknobytime failed:", blockData.message, "— scanning from block 0");
      }
    } catch (blockErr) {
      console.warn("[deposit] BSCScan getblocknobytime error:", (blockErr as Error).message, "— scanning from block 0");
    }

    // 2. Fetch BEP-20 USDT transfers to our wallet from startBlock onwards
    const txData = await bscscanGet({
      module: "account", action: "tokentx",
      contractaddress: USDT_BEP20_CONTRACT,
      address: USDT_BEP20_ADDRESS,
      startblock: startBlock,
      endblock: 99999999,
      sort: "asc",
    }) as { status: string; message: string; result: Array<{ hash: string; to: string; value: string }> | string };

    if (txData.status !== "1" || !Array.isArray(txData.result)) {
      if (txData.message !== "No transactions found") {
        console.error("[deposit] BSCScan tokentx error:", txData.message, typeof txData.result === "string" ? txData.result : "");
      }
      return results;
    }

    // 3. Match transfers against pending amounts
    for (const tx of txData.result) {
      if (tx.to?.toLowerCase() !== USDT_BEP20_ADDRESS) continue;
      const value = BigInt(tx.value ?? "0");
      for (const r of ranges) {
        if (results.has(r.amt)) continue;
        if (value >= r.min && value <= r.max) {
          console.log(`[deposit] ✓ BSCScan matched ${r.amt} USDT → tx ${tx.hash}`);
          results.set(r.amt, tx.hash);
        }
      }
    }

    console.log(`[deposit] BSCScan scan: ${txData.result.length} tx(s) from block ${startBlock}, ${results.size} match(es)`);
  } catch (err) {
    console.error("[deposit] BSCScan scan failed:", (err as Error).message);
  }

  return results;
}

/**
 * Verify a specific tx hash instantly via direct BSC RPC (eth_getTransactionReceipt).
 * This is a single lightweight call — not rate-limited like eth_getLogs.
 * Falls back to BSCScan V2 tokentx if all RPC nodes fail.
 *
 * Uses exact amount range (±0.02 USDT) to prevent using historical large TXs to
 * fraudulently credit deposits.
 */
async function verifyBep20Hash(
  txHash: string,
  expectedWei: bigint,
  toleranceWei = BigInt("20000000000000000"), // ±0.02 USDT
): Promise<{ ok: boolean; reason?: string }> {
  const walletPadded = "0x000000000000000000000000" + USDT_BEP20_ADDRESS.slice(2);
  const minWei = expectedWei - toleranceWei;
  const maxWei = expectedWei + toleranceWei;

  // ── Path 1: direct RPC receipt lookup (fast, ~200ms) ─────────────────────
  for (const rpc of BSC_RECEIPT_RPCS) {
    try {
      const receipt = await bscRpcCall(rpc, "eth_getTransactionReceipt", [txHash]) as {
        status?: string;
        logs?: Array<{ address: string; topics: string[]; data: string }>;
      } | null;

      if (receipt === null) continue; // not found on this node yet, try next

      console.log(`[deposit] verifyHash via ${rpc.split("/")[2]}: status=${receipt.status} logs=${receipt.logs?.length ?? 0}`);

      if (receipt.status === "0x0") return { ok: false, reason: "failed" };

      let foundUsdt = false;
      for (const log of receipt.logs ?? []) {
        if (log.address?.toLowerCase() !== USDT_BEP20_CONTRACT) continue;
        foundUsdt = true;
        if (log.topics?.[0]?.toLowerCase() !== ERC20_TRANSFER_TOPIC) continue;
        if (log.topics?.[2]?.toLowerCase() !== walletPadded) continue;
        const val = BigInt(log.data ?? "0x0");
        console.log(`[deposit] verifyHash: USDT transfer val=${val} expected=${expectedWei} range=[${minWei},${maxWei}]`);
        if (val >= minWei && val <= maxWei) return { ok: true };
        return { ok: false, reason: "mismatch" };
      }
      return { ok: false, reason: foundUsdt ? "mismatch" : "notusdt" };
    } catch (err) {
      console.warn(`[deposit] verifyHash RPC ${rpc.split("/")[2]} failed: ${(err as Error).message}`);
    }
  }

  // ── Path 2: BSCScan V2 tokentx fallback ──────────────────────────────────
  console.warn("[deposit] verifyHash: all RPC nodes failed, falling back to BSCScan tokentx");
  try {
    const txRes = await bscscanGet({
      module: "proxy", action: "eth_getTransactionByHash", txhash: txHash,
    }) as { result?: { blockNumber?: string } | null };

    const blockHex = txRes.result?.blockNumber;
    if (!blockHex) return { ok: false, reason: "notfound" };
    const blockNum = parseInt(blockHex, 16);

    const tokenRes = await bscscanGet({
      module: "account", action: "tokentx",
      contractaddress: USDT_BEP20_CONTRACT,
      address: USDT_BEP20_ADDRESS,
      startblock: blockNum,
      endblock: blockNum + 1,
      sort: "asc",
    }) as { status: string; result: Array<{ hash: string; to: string; value: string }> | string };

    if (tokenRes.status !== "1" || !Array.isArray(tokenRes.result)) return { ok: false, reason: "notusdt" };

    for (const tx of tokenRes.result) {
      if (tx.hash?.toLowerCase() !== txHash.toLowerCase()) continue;
      if (tx.to?.toLowerCase() !== USDT_BEP20_ADDRESS) return { ok: false, reason: "mismatch" };
      const value = BigInt(tx.value ?? "0");
      console.log(`[deposit] verifyHash BSCScan fallback: value=${value} range=[${minWei},${maxWei}]`);
      if (value >= minWei && value <= maxWei) return { ok: true };
      return { ok: false, reason: "mismatch" };
    }
    return { ok: false, reason: "notusdt" };
  } catch (err) {
    console.error("[deposit] verifyHash BSCScan fallback failed:", (err as Error).message);
    return { ok: false, reason: "error" };
  }
}

/**
 * Credit a deposit atomically — marks it completed, increments user balance,
 * and logs the transaction. Returns new balanceCents, or null if already processed.
 */
async function creditDeposit(depositId: number, txHash: string): Promise<number | null> {
  return db.transaction(async (tx) => {
    const [txUsed] = await tx.select({ id: depositRequests.id })
      .from(depositRequests)
      .where(and(eq(depositRequests.txHash, txHash), eq(depositRequests.status, "completed")))
      .limit(1);
    if (txUsed) return null;

    const [dep] = await tx.select().from(depositRequests)
      .where(and(eq(depositRequests.id, depositId), eq(depositRequests.status, "pending")))
      .limit(1);
    if (!dep) return null;

    await tx.update(depositRequests)
      .set({ status: "completed", txHash })
      .where(eq(depositRequests.id, depositId));

    const [updatedUser] = await tx.update(users)
      .set({ balanceCents: sql`balance_cents + ${dep.amountCents}` })
      .where(eq(users.id, dep.userId))
      .returning({ balanceCents: users.balanceCents });

    await tx.insert(transactions).values({
      userId: dep.userId,
      amountCents: dep.amountCents,
      type: "credit",
      description: `USDT top-up via ${dep.network.toUpperCase()} — ${dep.amountUsdt} USDT`,
      createdBy: dep.userId,
    });

    return updatedUser?.balanceCents ?? null;
  });
}

/**
 * Background auto-processor: exported so server/index.ts can call it on startup.
 * Batch-scans ALL pending BEP-20 deposits in a single RPC call.
 */
export async function processAllPendingDeposits(): Promise<void> {
  try {
    const now = new Date();

    // ── Step 1: Expire any past-due pending deposits ──────────────────────────
    const expiredRows = await db.update(depositRequests)
      .set({ status: "expired" })
      .where(and(eq(depositRequests.status, "pending"), sql`expires_at <= ${now}`))
      .returning({ id: depositRequests.id });
    if (expiredRows.length > 0) {
      console.log(`[deposit] Marked ${expiredRows.length} overdue deposit(s) as expired`);
    }

    // ── Step 2: Batch-scan all active pending deposits ────────────────────────
    const pending = await db.select().from(depositRequests)
      .where(and(eq(depositRequests.status, "pending"), sql`expires_at > ${now}`));
    if (pending.length === 0) return;

    // Calculate how far back to scan: cover the full age of the oldest pending deposit
    // + a 2-minute safety buffer.  Cap at BSC_MAX_LOOKBACK_BLOCKS (~4 hours).
    const oldestMs = Math.min(...pending.map((d) => d.createdAt.getTime()));
    const ageSeconds = Math.ceil((Date.now() - oldestMs) / 1000);
    const lookbackBlocks = Math.min(
      BSC_MAX_LOOKBACK_BLOCKS,
      Math.ceil(ageSeconds / BSC_BLOCK_TIME_S) + 40, // +40 blocks (~2 min) buffer
    );

    console.log(`[deposit] Scanning ${pending.length} active pending deposit(s) via BSCScan API (lookback: ${lookbackBlocks} blocks ≈ ${Math.round(lookbackBlocks * BSC_BLOCK_TIME_S / 60)} min)…`);

    // One RPC call fetches logs for all pending amounts at once
    const amounts = pending.map((d) => d.amountUsdt);
    const foundMap = await scanBscDeposits(amounts, lookbackBlocks);

    for (const dep of pending) {
      const txHash = foundMap.get(dep.amountUsdt);
      if (txHash) {
        try {
          const newBalance = await creditDeposit(dep.id, txHash);
          if (newBalance !== null) {
            console.log(`[deposit] ✓ Auto-credited deposit #${dep.id} (${dep.amountUsdt} USDT BEP-20) → user ${dep.userId}, balance: ${newBalance} cents`);
          }
        } catch (err) {
          console.error(`[deposit] Failed to credit deposit #${dep.id}:`, err);
        }
      }
    }
  } catch (err) {
    console.error("[deposit] processAllPendingDeposits error:", err);
  }
}

const CDK_API_KEY = process.env.CDK_API_KEY || "";
const API_BASE = "https://keys.ovh/api/v1";

// ── Suppy.Redeem API integration ──────────────────────────────────────────────
const SUPPY_API_BASE = "https://redeem.suppy.org/api";

async function suppyFetch(method: string, path: string, body?: object): Promise<{ ok: boolean; status: number; data?: any; error?: string }> {
  try {
    const res = await fetch(`${SUPPY_API_BASE}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = text; }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, error: String(err) };
  }
}

async function suppyCheckKey(code: string, service = "chatgpt"): Promise<{
  found: boolean; status?: string; keyType?: string; service?: string;
  plan?: string; term?: string; activatedEmail?: string | null; activatedAt?: number | null;
} | null> {
  // Try the service-specific endpoint first, fall back to chatgpt if 404
  const path = `/${service}/keys/${encodeURIComponent(code.trim())}`;
  let res = await suppyFetch("GET", path);
  if (res.status === 404 && service !== "chatgpt") {
    // Some keys may still be found on the chatgpt endpoint
    res = await suppyFetch("GET", `/chatgpt/keys/${encodeURIComponent(code.trim())}`);
  }
  console.log(`[suppy] checkKey(${service}) status:`, res.status, "data:", JSON.stringify(res.data));
  if (res.status === 404) return { found: false };
  if (!res.ok || !res.data || typeof res.data !== "object") return null;
  const d = res.data;
  return {
    found: true,
    status: typeof d.status === "string" ? d.status.toLowerCase() : d.status,
    keyType: d.key_type,
    service: d.service,
    plan: d.plan,
    term: d.term,
    activatedEmail: d.activated_email ?? null,
    activatedAt: d.activated_at ?? null,
  };
}

async function suppyPollActivation(code: string, maxAttempts = 10, intervalMs = 3000): Promise<{
  success: boolean; email?: string; activationType?: string; message?: string;
}> {
  for (let i = 0; i < maxAttempts; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, intervalMs));
    try {
      const res = await suppyFetch("GET", `/chatgpt/keys/activation-status/${encodeURIComponent(code)}`);
      if (!res.ok || !res.data || typeof res.data !== "object") continue;
      const d = res.data;
      if (d.status === "subscription_sent") {
        return { success: true, email: d.key?.activated_email ?? undefined, activationType: d.activation_type };
      }
      if (d.status === "error") {
        return { success: false, message: d.message || "Activation failed on provider side." };
      }
      // "started" | "account_found" — keep polling
    } catch { /* swallow, retry */ }
  }
  return { success: false, message: "Activation is taking longer than expected. Please check your account in a few minutes." };
}

// ── WhatsApp Bot helpers ──────────────────────────────────────────────────────

interface WaState {
  stage: "idle" | "awaiting_session";
  cdkKey?: string;
  lastActivity: number;
}
const waStateMap = new Map<string, WaState>();

// Purge idle sessions older than 30 minutes
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [phone, state] of waStateMap.entries()) {
    if (state.lastActivity < cutoff) waStateMap.delete(phone);
  }
}, 30 * 60 * 1000);

async function checkCdkKeyStatus(key: string): Promise<{ status: string; type?: string; apiSource?: string }> {
  try {
    const data = await apiCall("GET", `/key/${encodeURIComponent(key.trim())}/status`);
    if (data.success) {
      const keyData = data.data;
      if (keyData.status === "available") return { status: "available", type: keyData.subscription, apiSource: "ovh" };
      if (keyData.status === "used" || keyData.status === "activated") return { status: "used", apiSource: "ovh" };
      if (keyData.status === "expired") return { status: "expired", apiSource: "ovh" };
    }
    // Not found on keys.ovh — try Suppy
    const suppy = await suppyCheckKey(key.trim());
    if (suppy && suppy.found) {
      if (suppy.status === "available") return { status: "available", type: suppy.plan ?? "CDK", apiSource: "suppy" };
      if (suppy.status === "activated") return { status: "used", apiSource: "suppy" };
      if (suppy.status === "reserved") return { status: "invalid", apiSource: "suppy" };
    }
    return { status: "invalid" };
  } catch {
    return { status: "error" };
  }
}

async function activateCdkViaWhatsApp(cdkKey: string, sessionData: string): Promise<{ success: boolean; email?: string; subscription?: string; message?: string }> {
  const rawSession = sessionData.trim();
  let accessToken: string = rawSession;
  try {
    const parsed = JSON.parse(rawSession);
    if (parsed && typeof parsed === "object") {
      accessToken = parsed.accessToken || parsed.access_token || parsed.token || rawSession;
    }
  } catch { /* not JSON — treat as raw token */ }

  // Try keys.ovh first
  let data = await apiCall("POST", "/activate", { key: cdkKey.trim(), user_token: rawSession });
  if (!data.success && data.error === "token_invalid") {
    data = await apiCall("POST", "/activate", { key: cdkKey.trim(), user_token: accessToken });
  }
  if (data.success) {
    return { success: true, email: data.data?.email, subscription: data.data?.subscription };
  }

  // keys.ovh failed — try Suppy if the key exists there
  if (data.error === "key_not_found" || !data.success) {
    const suppyStart = await suppyFetch("POST", "/chatgpt/keys/activate-session", { code: cdkKey.trim(), session: rawSession });
    if (suppyStart.ok && suppyStart.data?.status === "started") {
      const result = await suppyPollActivation(cdkKey.trim());
      if (result.success) return { success: true, email: result.email, subscription: result.activationType };
      return { success: false, message: result.message || "Activation failed via Suppy." };
    }
  }

  const errMap: Record<string, string> = {
    key_not_found: "Key not found or not available.",
    activation_failed: "Activation failed. Please check your session data and try again.",
    token_invalid: "Invalid session. Please get a fresh session from chat.openai.com/api/auth/session.",
    rate_limit_exceeded: "Too many requests. Please wait a moment and try again.",
  };
  return { success: false, message: errMap[data.error] || data.message || "Activation failed." };
}

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

// ── Custom customer-facing prices (what customers are charged) ───────────────
// These are the prices shown to customers in the shop. Keys.ovh charges less
// internally — the difference is the admin's margin. Always bill using these.
interface CustomVolumeTier { minQty: number; price: number; }
interface CustomPlanPrice {
  basePrice: number;
  volumeTiers: CustomVolumeTier[]; // sorted desc by minQty
}
const CUSTOM_PLAN_PRICES: Record<string, CustomPlanPrice> = {
  "plus-1m": {
    basePrice: 2.38,
    volumeTiers: [
      { minQty: 100, price: 1.55 },
      { minQty: 50,  price: 1.75 },
      { minQty: 30,  price: 1.95 },
      { minQty: 10,  price: 2.15 },
    ],
  },
  "plus-1y": { basePrice: 28,  volumeTiers: [] },
  "go-1y":   { basePrice: 5,   volumeTiers: [] },
  "pro-1m":  { basePrice: 110, volumeTiers: [] },
};

function resolveCustomPrice(planId: string, quantity: number): number {
  const custom = CUSTOM_PLAN_PRICES[planId];
  if (!custom) return 0;
  for (const tier of custom.volumeTiers) {
    if (quantity >= tier.minQty) return tier.price;
  }
  return custom.basePrice;
}

// ── Cached plan pricing (populated from keys.ovh, used for inventory orders) ─
interface VolumeTier { min_qty: number; price: number; }
interface PlanPriceInfo {
  basePrice: number;                 // USD (default unit price)
  volumePrices: VolumeTier[];        // sorted desc by min_qty
  productName: string;
  subscriptionName: string;
  cachedAt: number;                  // ms timestamp
}
const planPriceCache: Record<string, PlanPriceInfo> = {};
const PRICE_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function resolvePlanPrice(info: PlanPriceInfo, quantity: number): number {
  if (info.volumePrices.length) {
    const tier = info.volumePrices.find((t) => quantity >= t.min_qty);
    if (tier) return tier.price;
  }
  return info.basePrice;
}

async function fetchAndCachePricing(planId: string): Promise<PlanPriceInfo | null> {
  const planSlug = PLAN_SLUG_MAP[planId];
  if (!planSlug) return null;
  try {
    const productsData = await apiCall("GET", "/products");
    if (!productsData.success || !Array.isArray(productsData.data)) return null;
    const product = productsData.data.find((p: any) => p.slug === planSlug.product_slug);
    const subType = product?.subscription_types?.find((s: any) => s.slug === planSlug.subscription_type_slug);
    if (!subType) return null;
    const volumePrices: VolumeTier[] = Array.isArray(subType.volume_prices)
      ? [...subType.volume_prices].sort((a: VolumeTier, b: VolumeTier) => b.min_qty - a.min_qty)
      : [];
    const info: PlanPriceInfo = {
      basePrice: subType.price,
      volumePrices,
      productName: product.name ?? planSlug.name,
      subscriptionName: subType.name ?? planSlug.name,
      cachedAt: Date.now(),
    };
    planPriceCache[planId] = info;
    return info;
  } catch {
    return null;
  }
}

function getCachedPricing(planId: string): PlanPriceInfo | null {
  const cached = planPriceCache[planId];
  if (cached && Date.now() - cached.cachedAt < PRICE_CACHE_TTL_MS) return cached;
  return null;
}

async function warmPricingCache(): Promise<void> {
  for (const planId of Object.keys(PLAN_SLUG_MAP)) {
    await fetchAndCachePricing(planId).catch(() => {});
  }
  console.log("[pricing] cache warmed for all plans");
}

// ── API Key helpers ───────────────────────────────────
function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const raw = "sk_live_" + crypto.randomBytes(24).toString("hex");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  const prefix = raw.slice(0, 16);
  return { raw, hash, prefix };
}

function hashApiKey(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

// ── In-memory rate limiter (60 req/min per API key hash) ─────────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(keyHash: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(keyHash);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(keyHash, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 60) return false;
  entry.count++;
  return true;
}

async function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, error: "missing_api_key", message: "Provide your API key via: Authorization: Bearer sk_live_..." });
  }
  const raw = authHeader.slice(7).trim();
  if (!raw.startsWith("sk_live_")) {
    return res.status(401).json({ success: false, error: "invalid_api_key", message: "Invalid API key format." });
  }
  const hash = hashApiKey(raw);
  try {
    const [key] = await db.select().from(apiKeys).where(and(eq(apiKeys.keyHash, hash), eq(apiKeys.active, 1)));
    if (!key) {
      return res.status(401).json({ success: false, error: "invalid_api_key", message: "API key not found or has been revoked." });
    }
    if (!checkRateLimit(hash)) {
      return res.status(429).json({ success: false, error: "rate_limit_exceeded", message: "Rate limit exceeded. Maximum 60 requests per minute." });
    }
    await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id));
    res.locals.apiKeyUserId = key.userId;
    res.locals.apiKeyId = key.id;
    next();
  } catch (err) {
    console.error("API key auth error:", err);
    return res.status(500).json({ success: false, error: "server_error", message: "Authentication failed. Please try again." });
  }
}

const DEFAULT_MAIN_PLANS = [
  { name: "ChatGPT Plus CDK", duration: "1M", durationLabel: "1 month",  priceCents: 238,   popular: 0, isNew: 0, service: "chatgpt", accentColor: null, deliveryNote: "Automatic delivery", action: "order",    planKey: "plus-1m", sortOrder: 1 },
  { name: "ChatGPT Plus CDK", duration: "1Y", durationLabel: "1 year",   priceCents: 2800,  popular: 1, isNew: 0, service: "chatgpt", accentColor: null, deliveryNote: "Automatic delivery", action: "order",    planKey: "plus-1y", sortOrder: 2 },
  { name: "ChatGPT GO CDK",   duration: "1Y", durationLabel: "1 year",   priceCents: 500,   popular: 0, isNew: 0, service: "chatgpt", accentColor: null, deliveryNote: "Automatic delivery", action: "order",    planKey: "go-1y",   sortOrder: 3 },
  { name: "ChatGPT Pro CDK",  duration: "1M", durationLabel: "1 month",  priceCents: 11000, popular: 0, isNew: 0, service: "chatgpt", accentColor: null, deliveryNote: "Automatic delivery", action: "order",    planKey: "pro-1m",  sortOrder: 4 },
  { name: "Claude Pro",       duration: "Weekly", durationLabel: "Weekly", priceCents: 230, popular: 0, isNew: 1, service: "claude",  accentColor: "#D97757", deliveryNote: "Via WhatsApp",   action: "whatsapp", planKey: "claude-weekly", sortOrder: 5 },
];

async function seedMainPlans() {
  try {
    // Create table if it doesn't exist (safe to run on every boot)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS main_plans (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        duration TEXT NOT NULL,
        duration_label TEXT NOT NULL,
        price_cents INTEGER NOT NULL,
        popular INTEGER NOT NULL DEFAULT 0,
        is_new INTEGER NOT NULL DEFAULT 0,
        service TEXT NOT NULL DEFAULT 'chatgpt',
        accent_color TEXT,
        delivery_note TEXT NOT NULL DEFAULT 'Automatic delivery',
        action TEXT NOT NULL DEFAULT 'order',
        plan_key TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    const existing = await db.select({ id: mainPlans.id }).from(mainPlans).limit(1);
    if (existing.length === 0) {
      await db.insert(mainPlans).values(DEFAULT_MAIN_PLANS.map(p => ({ ...p, active: 1 })));
      console.log("[seed] Main plans seeded.");
    }
  } catch (err) {
    console.error("[seed] mainPlans error:", err);
  }
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  await seedAdmin();
  await seedMainPlans();
  // Warm pricing cache on startup (non-blocking — purchase falls back to live fetch if cache is cold)
  warmPricingCache().catch(() => {});

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

      // ── Helper to call keys.ovh and update the purchase result vars ─────────
      const idempotencyKey = `${user.id}-${planId}-${quantity}-${Date.now()}`;
      type OvhResult = { keys: string[]; orderNumber: string; product: string; subscription: string; status: string; totalCents: number } | null;
      async function purchaseFromOvh(fallbackProductName: string, fallbackSubName: string): Promise<OvhResult> {
        const productsData = await apiCall("GET", "/products");
        if (!productsData.success) return null;
        const product = productsData.data?.find((p: any) => p.slug === planSlug.product_slug);
        const subType = product?.subscription_types?.find((s: any) => s.slug === planSlug.subscription_type_slug);
        if (!subType || !subType.in_stock) return null;
        // Update cache with fresh data
        const volumePrices: VolumeTier[] = Array.isArray(subType.volume_prices)
          ? [...subType.volume_prices].sort((a: VolumeTier, b: VolumeTier) => b.min_qty - a.min_qty)
          : [];
        planPriceCache[planId] = { basePrice: subType.price, volumePrices, productName: product.name ?? planSlug.name, subscriptionName: subType.name ?? planSlug.name, cachedAt: Date.now() };
        const unitPrice = resolveCustomPrice(planId, quantity);
        const tc = Math.round(unitPrice * quantity * 100);
        if (user.balanceCents < tc) return null; // insufficient — caller handles
        const purchaseData = await apiCall("POST", "/purchase", {
          product_slug: planSlug.product_slug,
          subscription_type_slug: planSlug.subscription_type_slug,
          quantity,
          idempotency_key: idempotencyKey,
        });
        if (!purchaseData.success) return null;
        return {
          keys: purchaseData.data?.keys || [],
          orderNumber: purchaseData.data?.order_number || idempotencyKey,
          product: purchaseData.data?.product || product.name || fallbackProductName,
          subscription: purchaseData.data?.subscription || subType.name || fallbackSubName,
          status: purchaseData.data?.status || "delivered",
          totalCents: tc,
        };
      }

      // Count available inventory keys for this plan upfront (no keys.ovh call yet)
      const inventoryCountResult = await db.select({ cnt: sql<number>`COUNT(*)` })
        .from(inventoryKeys)
        .where(and(eq(inventoryKeys.plan, planId), eq(inventoryKeys.status, "available")));
      const inventoryCount = Number(inventoryCountResult[0]?.cnt ?? 0);
      const useInventory = inventoryCount >= quantity;

      let purchasedKeys: string[];
      let orderNumber: string;
      let orderProduct: string;
      let orderSubscription: string;
      let orderStatus: string;
      let totalCents: number;

      if (useInventory) {
        // ── Inventory path: zero keys.ovh API calls when cache is warm ───────
        // Use cached pricing (warmed at startup, refreshed by fallback-path purchases).
        // If cache is completely cold (first boot + keys.ovh unreachable at startup),
        // do a single /products fetch now to populate it.
        let pricing = getCachedPricing(planId) ?? planPriceCache[planId]; // accept stale rather than calling keys.ovh
        if (!pricing) {
          // Cache is completely absent — fetch once to populate
          pricing = await fetchAndCachePricing(planId);
          if (!pricing) {
            return res.json({ success: false, message: "Could not fetch current pricing. Please try again shortly." });
          }
        }

        const unitPrice = resolveCustomPrice(planId, quantity);
        totalCents = Math.round(unitPrice * quantity * 100);

        if (user.balanceCents < totalCents) {
          const shortfall = ((totalCents - user.balanceCents) / 100).toFixed(2);
          return res.json({
            success: false,
            message: `Insufficient balance. You need $${shortfall} more. Please top up your account.`,
            code: "insufficient_balance",
          });
        }

        console.log(`[purchase] user=${user.id} plan=${planId} qty=${quantity} unitPrice=$${unitPrice} total=$${(totalCents/100).toFixed(2)} source=inventory`);

        // Atomically allocate exactly `quantity` available keys — FOR UPDATE SKIP LOCKED
        // prevents concurrent purchases from double-selling the same keys.
        const allocated = await db.transaction(async (tx) => {
          const rows = await tx.execute<{ id: number; key: string }>(
            sql`SELECT id, key FROM inventory_keys
                WHERE plan = ${planId} AND status = 'available'
                ORDER BY id
                LIMIT ${quantity}
                FOR UPDATE SKIP LOCKED`
          );
          if (rows.rows.length < quantity) return null; // Race: someone else grabbed keys

          const ids = rows.rows.map((r) => r.id);
          await tx.update(inventoryKeys)
            .set({ status: "sold", soldTo: user.id, soldAt: new Date() })
            .where(inArray(inventoryKeys.id, ids));

          return rows.rows.map((r) => r.key);
        });

        if (!allocated) {
          // Inventory depleted by concurrent request — fall back to keys.ovh
          console.log(`[purchase] inventory race — falling back to keys.ovh for user=${user.id}`);
          const ovhResult = await purchaseFromOvh(pricing.productName, pricing.subscriptionName);
          if (!ovhResult) {
            return res.json({ success: false, message: "This plan is currently out of stock." });
          }
          if (user.balanceCents < ovhResult.totalCents) {
            const shortfall = ((ovhResult.totalCents - user.balanceCents) / 100).toFixed(2);
            return res.json({ success: false, message: `Insufficient balance. You need $${shortfall} more.`, code: "insufficient_balance" });
          }
          purchasedKeys = ovhResult.keys;
          orderNumber = ovhResult.orderNumber;
          orderProduct = ovhResult.product;
          orderSubscription = ovhResult.subscription;
          orderStatus = ovhResult.status;
          totalCents = ovhResult.totalCents;
        } else {
          purchasedKeys = allocated;
          orderNumber = idempotencyKey;
          orderProduct = pricing.productName;
          orderSubscription = pricing.subscriptionName;
          orderStatus = "delivered";
          console.log(`[purchase] fulfilled from inventory (${quantity} keys)`);
        }
      } else {
        // ── keys.ovh fallback path ──────────────────────────────────────────
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

        // Cache this pricing for future inventory-path purchases
        const volumePricesOvh: VolumeTier[] = Array.isArray(subType.volume_prices)
          ? [...subType.volume_prices].sort((a: VolumeTier, b: VolumeTier) => b.min_qty - a.min_qty)
          : [];
        planPriceCache[planId] = {
          basePrice: subType.price,
          volumePrices: volumePricesOvh,
          productName: product.name ?? planSlug.name,
          subscriptionName: subType.name ?? planSlug.name,
          cachedAt: Date.now(),
        };

        // Always charge the custom price — not the keys.ovh wholesale price
        const customUnitPrice = resolveCustomPrice(planId, quantity);
        totalCents = Math.round(customUnitPrice * quantity * 100);

        if (user.balanceCents < totalCents) {
          const shortfall = ((totalCents - user.balanceCents) / 100).toFixed(2);
          return res.json({
            success: false,
            message: `Insufficient balance. You need $${shortfall} more. Please top up your account.`,
            code: "insufficient_balance",
          });
        }

        console.log(`[purchase] user=${user.id} plan=${planId} qty=${quantity} unitPrice=$${customUnitPrice} total=$${(totalCents/100).toFixed(2)} source=keys.ovh`);

        const purchaseData = await apiCall("POST", "/purchase", {
          product_slug: planSlug.product_slug,
          subscription_type_slug: planSlug.subscription_type_slug,
          quantity,
          idempotency_key: idempotencyKey,
        });

        if (!purchaseData.success) {
          const errMap: Record<string, string> = {
            out_of_stock: "This plan is currently out of stock.",
            insufficient_balance: "We are unable to process your order at this time. Please contact us on WhatsApp: +447577308067",
            product_not_found: "Product not found.",
            subscription_not_found: "Subscription type not found.",
          };
          const msg = errMap[purchaseData.error] || purchaseData.message || "Purchase failed. Please try again.";
          return res.json({ success: false, message: msg });
        }

        purchasedKeys = purchaseData.data?.keys || [];
        orderNumber = purchaseData.data?.order_number || idempotencyKey;
        orderProduct = purchaseData.data?.product || product.name;
        orderSubscription = purchaseData.data?.subscription || subType.name;
        orderStatus = purchaseData.data?.status || "delivered";
      }

      // Deduct balance and save order atomically
      await db.update(users)
        .set({ balanceCents: user.balanceCents - totalCents })
        .where(eq(users.id, user.id));

      await db.insert(transactions).values({
        userId: user.id,
        amountCents: totalCents,
        type: "debit",
        description: `${planSlug.name} x${quantity} — Order #${orderNumber}`,
        createdBy: user.id,
      });

      const [savedOrder] = await db.insert(orders).values({
        userId: user.id,
        orderNumber,
        product: orderProduct,
        subscription: orderSubscription,
        quantity,
        amountCents: totalCents,
        keys: purchasedKeys,
        status: orderStatus,
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

  // ── API Key management (account) ─────────────────────

  app.get("/api/me/api-keys", requireAuth, async (req, res) => {
    try {
      const keys = await db.select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        active: apiKeys.active,
        lastUsedAt: apiKeys.lastUsedAt,
        createdAt: apiKeys.createdAt,
      }).from(apiKeys)
        .where(and(eq(apiKeys.userId, req.session.userId!), eq(apiKeys.active, 1)))
        .orderBy(desc(apiKeys.createdAt));
      return res.json({ success: true, data: keys });
    } catch (err) {
      console.error("API keys fetch error:", err);
      return res.status(500).json({ success: false, message: "Could not fetch API keys." });
    }
  });

  app.post("/api/me/api-keys", requireAuth, async (req, res) => {
    const { name } = req.body;
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return res.json({ success: false, message: "API key name is required." });
    }
    try {
      const existing = await db.select({ id: apiKeys.id }).from(apiKeys)
        .where(and(eq(apiKeys.userId, req.session.userId!), eq(apiKeys.active, 1)));
      if (existing.length >= 10) {
        return res.json({ success: false, message: "Maximum 10 active API keys allowed. Revoke one to create a new one." });
      }
      const { raw, hash, prefix } = generateApiKey();
      await db.insert(apiKeys).values({
        userId: req.session.userId!,
        name: name.trim(),
        keyHash: hash,
        keyPrefix: prefix,
        active: 1,
      });
      return res.json({ success: true, key: raw, prefix });
    } catch (err) {
      console.error("API key create error:", err);
      return res.status(500).json({ success: false, message: "Could not create API key." });
    }
  });

  app.delete("/api/me/api-keys/:id", requireAuth, async (req, res) => {
    const keyId = parseInt(req.params.id, 10);
    try {
      const [key] = await db.select().from(apiKeys)
        .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, req.session.userId!)));
      if (!key) return res.json({ success: false, message: "API key not found." });
      await db.update(apiKeys).set({ active: 0 }).where(eq(apiKeys.id, keyId));
      return res.json({ success: true });
    } catch (err) {
      console.error("API key revoke error:", err);
      return res.status(500).json({ success: false, message: "Could not revoke API key." });
    }
  });

  // ── Public API v1 ─────────────────────────────────────

  app.post("/api/v1/check", requireApiKey, async (req, res) => {
    const { key } = req.body;
    if (!key || typeof key !== "string" || key.trim().length === 0) {
      return res.status(400).json({ success: false, error: "missing_key", message: "The 'key' field is required." });
    }
    try {
      // Try keys.ovh first
      const data = await apiCall("GET", `/key/${encodeURIComponent(key.trim())}/status`);
      if (data.success) {
        const keyData = data.data;
        if (keyData.status === "available") {
          return res.json({ success: true, status: "available", type: keyData.subscription || "Plus CDK", apiSource: "ovh" });
        } else if (keyData.status === "used" || keyData.status === "activated") {
          return res.json({ success: true, status: "used", message: "This key has already been activated.", activatedFor: keyData.activated_for ?? keyData.used_by ?? keyData.email ?? null, activatedAt: keyData.activated_at ?? keyData.used_at ?? null, apiSource: "ovh" });
        } else if (keyData.status === "expired") {
          return res.json({ success: true, status: "expired", message: "This key has expired.", apiSource: "ovh" });
        }
      }
      // Try Suppy fallback
      const suppy = await suppyCheckKey(key.trim());
      if (suppy && suppy.found) {
        if (suppy.status === "available") return res.json({ success: true, status: "available", type: suppy.plan ?? "CDK", keyType: suppy.keyType, service: suppy.service, apiSource: "suppy" });
        if (suppy.status === "activated") return res.json({ success: true, status: "used", message: "This key has already been activated.", activatedFor: suppy.activatedEmail, activatedAt: suppy.activatedAt, apiSource: "suppy" });
        if (suppy.status === "reserved") return res.json({ success: false, error: "reserved", message: "Key is currently reserved.", apiSource: "suppy" });
      }
      const msg = data.error === "key_not_found" ? "Key not found or not available." : data.message || "Invalid key.";
      return res.json({ success: false, error: "key_not_found", message: msg });
    } catch (err) {
      console.error("API v1 check error:", err);
      return res.status(500).json({ success: false, error: "server_error", message: "Key check service unavailable. Please try again." });
    }
  });

  app.post("/api/v1/redeem", requireApiKey, async (req, res) => {
    const { key: cdkKey, session, apiSource } = req.body;
    if (!cdkKey || typeof cdkKey !== "string" || cdkKey.trim().length === 0) {
      return res.status(400).json({ success: false, error: "missing_key", message: "The 'key' field is required." });
    }
    if (!session || typeof session !== "string" || session.trim().length === 0) {
      return res.status(400).json({ success: false, error: "missing_session", message: "The 'session' field is required (ChatGPT session JSON or access token)." });
    }
    try {
      const rawSession = session.trim();

      // Route to Suppy if specified
      if (apiSource === "suppy") {
        const startRes = await suppyFetch("POST", "/chatgpt/keys/activate-session", { code: cdkKey.trim(), session: rawSession });
        if (!startRes.ok) {
          const errText = typeof startRes.data === "string" ? startRes.data : startRes.data?.message || "Activation failed.";
          return res.json({ success: false, error: "activation_failed", message: errText });
        }
        const result = await suppyPollActivation(cdkKey.trim(), 10, 3000);
        if (result.success) return res.json({ success: true, email: result.email, subscription: result.activationType, apiSource: "suppy" });
        return res.json({ success: false, error: "activation_failed", message: result.message || "Activation failed." });
      }

      // keys.ovh path
      let accessToken: string = rawSession;
      try {
        const parsed = JSON.parse(rawSession);
        if (parsed && typeof parsed === "object") {
          accessToken = parsed.accessToken || parsed.access_token || parsed.token || rawSession;
        }
      } catch { /* not JSON — treat as raw token */ }

      let data = await apiCall("POST", "/activate", { key: cdkKey.trim(), user_token: rawSession });
      if (!data.success && data.error === "token_invalid") {
        data = await apiCall("POST", "/activate", { key: cdkKey.trim(), user_token: accessToken });
      }
      if (data.success) {
        return res.json({ success: true, email: data.data?.email, product: data.data?.product, subscription: data.data?.subscription, activatedAt: data.data?.activated_at, apiSource: "ovh" });
      }

      // keys.ovh didn't find it — try Suppy automatically
      if (data.error === "key_not_found") {
        const startRes = await suppyFetch("POST", "/chatgpt/keys/activate-session", { code: cdkKey.trim(), session: rawSession });
        if (startRes.ok && startRes.data?.status === "started") {
          const result = await suppyPollActivation(cdkKey.trim(), 10, 3000);
          if (result.success) return res.json({ success: true, email: result.email, subscription: result.activationType, apiSource: "suppy" });
          return res.json({ success: false, error: "activation_failed", message: result.message || "Activation failed." });
        }
      }

      const errorMessages: Record<string, string> = {
        key_not_found: "Key not found or not available.",
        activation_failed: "Activation failed. Please check your session data and try again.",
        token_invalid: "Token validation failed. Please provide a fresh ChatGPT session.",
        rate_limit_exceeded: "Too many activation requests. Please wait and try again.",
      };
      const msg = errorMessages[data.error] || data.message || "Activation failed.";
      return res.json({ success: false, error: data.error || "activation_failed", message: msg });
    } catch (err) {
      console.error("API v1 redeem error:", err);
      return res.status(500).json({ success: false, error: "server_error", message: "Activation service unavailable. Please try again." });
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

  app.post("/api/admin/customers/:id/debit", requireAdmin, async (req, res) => {
    const customerId = parseInt(req.params.id, 10);
    const { amountUsd, description } = req.body;
    if (!amountUsd || isNaN(parseFloat(amountUsd)) || parseFloat(amountUsd) <= 0) {
      return res.json({ success: false, message: "Valid amount in USD is required." });
    }
    const amountCents = Math.round(parseFloat(amountUsd) * 100);
    const desc = description?.trim() || `Manual deduction by admin`;
    try {
      const [user] = await db.select().from(users).where(eq(users.id, customerId));
      if (!user) return res.json({ success: false, message: "Customer not found." });
      if (user.balanceCents < amountCents) {
        return res.json({ success: false, message: "Insufficient balance. Cannot reduce below zero." });
      }
      const newBalance = user.balanceCents - amountCents;
      await db.update(users).set({ balanceCents: newBalance }).where(eq(users.id, customerId));
      await db.insert(transactions).values({
        userId: customerId, amountCents: -amountCents, type: "debit", description: desc, createdBy: req.session.userId!,
      });
      return res.json({ success: true, balanceCents: newBalance });
    } catch (err) {
      console.error("Debit error:", err);
      return res.status(500).json({ success: false, message: "Could not reduce balance." });
    }
  });

  app.delete("/api/admin/customers/:id", requireAdmin, async (req, res) => {
    const customerId = parseInt(req.params.id, 10);
    try {
      const [user] = await db.select().from(users).where(eq(users.id, customerId));
      if (!user) return res.json({ success: false, message: "Customer not found." });
      if (user.role === "admin") return res.json({ success: false, message: "Cannot delete admin account." });
      await db.delete(transactions).where(eq(transactions.userId, customerId));
      await db.delete(depositRequests).where(eq(depositRequests.userId, customerId));
      await db.update(inventoryKeys).set({ soldTo: null, soldAt: null, status: "available" }).where(eq(inventoryKeys.soldTo, customerId));
      await db.delete(orders).where(eq(orders.userId, customerId));
      await db.delete(apiKeys).where(eq(apiKeys.userId, customerId));
      await db.delete(users).where(eq(users.id, customerId));
      return res.json({ success: true });
    } catch (err) {
      console.error("Delete customer error:", err);
      return res.status(500).json({ success: false, message: "Could not delete customer." });
    }
  });

  app.get("/api/admin/customers/:id/orders", requireAdmin, async (req, res) => {
    const customerId = parseInt(req.params.id, 10);
    try {
      const customerOrders = await db.select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        subscription: orders.subscription,
        quantity: orders.quantity,
        amountCents: orders.amountCents,
        keys: orders.keys,
        status: orders.status,
        createdAt: orders.createdAt,
      }).from(orders).where(eq(orders.userId, customerId)).orderBy(desc(orders.createdAt));
      return res.json({ success: true, data: customerOrders });
    } catch (err) {
      console.error("Customer orders error:", err);
      return res.status(500).json({ success: false, message: "Could not fetch orders." });
    }
  });

  app.get("/api/admin/customers/:id/history", requireAdmin, async (req, res) => {
    const customerId = parseInt(req.params.id, 10);
    try {
      const [txs, customerOrders, deposits] = await Promise.all([
        db.select().from(transactions).where(eq(transactions.userId, customerId)).orderBy(desc(transactions.createdAt)),
        db.select().from(orders).where(eq(orders.userId, customerId)).orderBy(desc(orders.createdAt)),
        db.select().from(depositRequests).where(eq(depositRequests.userId, customerId)).orderBy(desc(depositRequests.createdAt)),
      ]);
      return res.json({ success: true, transactions: txs, orders: customerOrders, deposits });
    } catch (err) {
      console.error("Customer history error:", err);
      return res.status(500).json({ success: false, message: "Could not fetch history." });
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

  // ── Admin API keys view ───────────────────────────────

  app.get("/api/admin/api-keys", requireAdmin, async (_req, res) => {
    try {
      const keys = await db.select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        active: apiKeys.active,
        lastUsedAt: apiKeys.lastUsedAt,
        createdAt: apiKeys.createdAt,
        userId: apiKeys.userId,
        userEmail: users.email,
        userName: users.name,
      }).from(apiKeys)
        .innerJoin(users, eq(apiKeys.userId, users.id))
        .where(eq(apiKeys.active, 1))
        .orderBy(desc(apiKeys.createdAt));
      return res.json({ success: true, data: keys });
    } catch (err) {
      console.error("Admin API keys error:", err);
      return res.status(500).json({ success: false, message: "Could not fetch API keys." });
    }
  });

  // ── Deposit routes ────────────────────────────────────

  app.post("/api/deposit/create", requireAuth, async (req, res) => {
    const { amountUsd } = req.body;
    const network = "bep20"; // BSC only
    const amount = parseFloat(amountUsd);
    if (!amountUsd || isNaN(amount) || amount < 1 || amount > 10000) {
      return res.json({ success: false, message: "Amount must be between $1 and $10,000." });
    }

    const amountCents = Math.round(amount * 100);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const walletAddress = USDT_BEP20_ADDRESS;

    try {
      // Generate a unique amountUsdt: add a micro-offset (0.0001–0.0099) that
      // doesn't collide with any active pending deposit for the same network.
      let amountUsdt = "";
      let tries = 0;
      while (tries < 30) {
        const microOffset = Math.floor(Math.random() * 99) + 1; // 1–99
        const totalUnits = Math.round(amount * 10000) + microOffset;
        const candidate = (totalUnits / 10000).toFixed(4);
        const [collision] = await db.select({ id: depositRequests.id })
          .from(depositRequests)
          .where(and(
            eq(depositRequests.amountUsdt, candidate),
            eq(depositRequests.network, network),
            eq(depositRequests.status, "pending"),
          ))
          .limit(1);
        if (!collision) { amountUsdt = candidate; break; }
        tries++;
      }
      if (!amountUsdt) {
        return res.status(503).json({ success: false, message: "Could not generate a unique deposit amount. Please try again shortly." });
      }

      // Insert — partial unique index (status='pending', network, amount_usdt) enforces
      // uniqueness at DB level even if two concurrent requests bypass the pre-check.
      let deposit;
      try {
        [deposit] = await db.insert(depositRequests).values({
          userId: req.session.userId!,
          amountUsdt,
          amountCents,
          network,
          status: "pending",
          expiresAt,
        }).returning();
      } catch (insertErr: unknown) {
        const errMsg = insertErr instanceof Error ? insertErr.message : String(insertErr);
        if (errMsg.includes("uniq_pending_deposit_amount")) {
          // Concurrent request grabbed the same amount — tell the user to retry
          return res.status(503).json({ success: false, message: "Could not generate a unique deposit amount. Please try again." });
        }
        throw insertErr;
      }

      if (!deposit) {
        return res.status(500).json({ success: false, message: "Could not create deposit request." });
      }

      return res.json({
        success: true,
        deposit: { id: deposit.id, amountUsdt, amountCents, network, walletAddress, expiresAt: expiresAt.toISOString() },
      });
    } catch (err) {
      console.error("Deposit create error:", err);
      return res.status(500).json({ success: false, message: "Could not create deposit request." });
    }
  });

  app.post("/api/deposit/check/:id", requireAuth, async (req, res) => {
    const depositId = parseInt(req.params.id, 10);
    const userTxHash = typeof req.body.txHash === "string" ? req.body.txHash.trim() : null;

    try {
      const [deposit] = await db.select().from(depositRequests).where(eq(depositRequests.id, depositId));
      if (!deposit || deposit.userId !== req.session.userId!) {
        return res.json({ success: false, message: "Deposit request not found." });
      }
      if (deposit.status === "completed") {
        const [u] = await db.select({ balanceCents: users.balanceCents }).from(users).where(eq(users.id, deposit.userId));
        return res.json({ success: true, status: "completed", balanceCents: u?.balanceCents ?? null });
      }
      if (new Date() > deposit.expiresAt) {
        await db.update(depositRequests).set({ status: "expired" }).where(eq(depositRequests.id, depositId));
        return res.json({ success: false, status: "expired", message: "This deposit request has expired." });
      }

      // Exact expected wei for this deposit (same formula as scanBscDeposits)
      const expectedWei = BigInt(Math.round(parseFloat(deposit.amountUsdt) * 1_000_000)) * BigInt("1000000000000");
      let found = false;
      let txHash: string | null = null;

      // ── If user provided a TX hash: verify it directly ───────────────────────
      if (userTxHash) {
        console.log(`[deposit] check #${depositId}: verifying txHash ${userTxHash.slice(0, 10)}... amountUsdt=${deposit.amountUsdt} expectedWei=${expectedWei}`);
        const result = await verifyBep20Hash(userTxHash, expectedWei);
        console.log(`[deposit] check #${depositId}: verifyHash result=${JSON.stringify(result)}`);
        if (result.ok) {
          found = true;
          txHash = userTxHash;
        } else if (result.reason === "notusdt") {
          return res.json({ success: true, status: "pending", message: "This transaction does not contain a USDT (BEP-20) transfer. Make sure you sent on BSC network." });
        } else if (result.reason === "mismatch") {
          return res.json({ success: true, status: "pending", message: "Transaction found but sent to wrong wallet or wrong amount. Check address and exact amount." });
        }
        // reason === "notfound" | "error" → fall through to scan
      }

      // ── Batch-scan recent transfers on our BSC wallet ────────────────────────
      if (!found) {
        // Cover the full age of this deposit so a payment made shortly after creation
        // is still found even if the user only checks hours later.
        const depositAgeS = Math.ceil((Date.now() - deposit.createdAt.getTime()) / 1000);
        const lookbackBlocks = Math.min(
          BSC_MAX_LOOKBACK_BLOCKS,
          Math.ceil(depositAgeS / BSC_BLOCK_TIME_S) + 40,
        );
        const scanResults = await scanBscDeposits([deposit.amountUsdt], lookbackBlocks);
        const scannedHash = scanResults.get(deposit.amountUsdt) ?? null;
        if (scannedHash) {
          found = true;
          txHash = scannedHash;
        }
      }

      if (found && txHash) {
        const newBalance = await creditDeposit(depositId, txHash);
        if (newBalance !== null) {
          return res.json({ success: true, status: "completed", balanceCents: newBalance });
        }
        // Already credited by concurrent request — check final state
        const [current] = await db.select({ status: depositRequests.status, userId: depositRequests.userId })
          .from(depositRequests).where(eq(depositRequests.id, depositId)).limit(1);
        if (current?.status === "completed") {
          const [u] = await db.select({ balanceCents: users.balanceCents }).from(users).where(eq(users.id, current.userId));
          return res.json({ success: true, status: "completed", balanceCents: u?.balanceCents ?? null });
        }
      }

      return res.json({ success: true, status: "pending", message: "Payment not detected yet. Scanning the blockchain — please wait." });
    } catch (err) {
      console.error("[deposit] check route error:", err);
      return res.json({ success: true, status: "pending", message: "Could not reach blockchain at the moment. Will keep trying." });
    }
  });

  app.get("/api/me/deposits", requireAuth, async (req, res) => {
    try {
      // Reconcile any overdue pending deposits before returning the list
      await db.update(depositRequests)
        .set({ status: "expired" })
        .where(and(
          eq(depositRequests.userId, req.session.userId!),
          eq(depositRequests.status, "pending"),
          sql`expires_at < NOW()`,
        ));
      const userDeposits = await db.select().from(depositRequests)
        .where(eq(depositRequests.userId, req.session.userId!))
        .orderBy(desc(depositRequests.createdAt));
      return res.json({ success: true, data: userDeposits });
    } catch (err) {
      return res.status(500).json({ success: false, message: "Could not fetch deposits." });
    }
  });

  app.post("/api/admin/deposits/:id/approve", requireAdmin, async (req, res) => {
    const depositId = parseInt(req.params.id, 10);
    try {
      const newBalance = await db.transaction(async (tx) => {
        // Re-read inside transaction — confirm still pending
        const [deposit] = await tx.select().from(depositRequests)
          .where(and(eq(depositRequests.id, depositId), eq(depositRequests.status, "pending")))
          .limit(1);
        if (!deposit) return null; // Already completed or not found

        // Mark completed
        await tx.update(depositRequests)
          .set({ status: "completed", txHash: "manual-admin-approval" })
          .where(eq(depositRequests.id, depositId));

        // Atomically increment balance
        const [updatedUser] = await tx.update(users)
          .set({ balanceCents: sql`balance_cents + ${deposit.amountCents}` })
          .where(eq(users.id, deposit.userId))
          .returning({ balanceCents: users.balanceCents });

        await tx.insert(transactions).values({
          userId: deposit.userId,
          amountCents: deposit.amountCents,
          type: "credit",
          description: `Manual top-up via ${deposit.network.toUpperCase()} — ${deposit.amountUsdt} USDT (admin approved)`,
          createdBy: req.session.userId!,
        });
        return updatedUser?.balanceCents ?? null;
      });

      if (newBalance === null) {
        return res.json({ success: false, message: "Deposit already completed or not found." });
      }
      return res.json({ success: true, newBalance });
    } catch (err) {
      console.error("Admin approve deposit error:", err);
      return res.status(500).json({ success: false, message: "Could not approve deposit." });
    }
  });

  app.get("/api/admin/deposits", requireAdmin, async (_req, res) => {
    try {
      // Reconcile any overdue pending deposits before returning the list
      await db.update(depositRequests)
        .set({ status: "expired" })
        .where(and(eq(depositRequests.status, "pending"), sql`expires_at < NOW()`));
      const allDeposits = await db.select({
        id: depositRequests.id,
        amountUsdt: depositRequests.amountUsdt,
        amountCents: depositRequests.amountCents,
        network: depositRequests.network,
        status: depositRequests.status,
        txHash: depositRequests.txHash,
        createdAt: depositRequests.createdAt,
        expiresAt: depositRequests.expiresAt,
        userId: depositRequests.userId,
        userEmail: users.email,
        userName: users.name,
      }).from(depositRequests)
        .innerJoin(users, eq(depositRequests.userId, users.id))
        .orderBy(desc(depositRequests.createdAt));
      return res.json({ success: true, data: allDeposits });
    } catch (err) {
      console.error("Admin deposits error:", err);
      return res.status(500).json({ success: false, message: "Could not fetch deposits." });
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

  // ── Admin key inventory routes ───────────────────────

  app.post("/api/admin/inventory", requireAdmin, async (req, res) => {
    const { plan, keys } = req.body;
    const validPlans = ["plus-1m", "plus-1y", "go-1y", "pro-1m"];
    if (!plan || !validPlans.includes(plan)) {
      return res.json({ success: false, message: "Valid plan is required." });
    }
    if (!Array.isArray(keys) || keys.length === 0) {
      return res.json({ success: false, message: "At least one key is required." });
    }
    const cleanKeys: string[] = keys.map((k: string) => k.trim()).filter((k: string) => k.length > 0);
    if (cleanKeys.length === 0) {
      return res.json({ success: false, message: "No valid keys found after trimming." });
    }
    if (cleanKeys.length > 500) {
      return res.json({ success: false, message: "Maximum 500 keys per batch." });
    }
    try {
      const rows = cleanKeys.map((k) => ({ plan, key: k, status: "available" as const, addedBy: req.session.userId! }));
      await db.insert(inventoryKeys).values(rows);
      return res.json({ success: true, added: cleanKeys.length });
    } catch (err) {
      console.error("Inventory insert error:", err);
      return res.status(500).json({ success: false, message: "Could not save keys." });
    }
  });

  app.get("/api/admin/inventory", requireAdmin, async (req, res) => {
    const planFilter = req.query.plan as string | undefined;
    const statusFilter = req.query.status as string | undefined;
    try {
      const conditions = [ne(inventoryKeys.status, "deleted" as const)];
      if (planFilter) conditions.push(eq(inventoryKeys.plan, planFilter));
      if (statusFilter) conditions.push(eq(inventoryKeys.status, statusFilter));

      const rows = await db.select({
        id: inventoryKeys.id,
        plan: inventoryKeys.plan,
        key: inventoryKeys.key,
        status: inventoryKeys.status,
        soldTo: inventoryKeys.soldTo,
        soldToEmail: users.email,
        soldToName: users.name,
        soldAt: inventoryKeys.soldAt,
        createdAt: inventoryKeys.createdAt,
      }).from(inventoryKeys)
        .leftJoin(users, eq(inventoryKeys.soldTo, users.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(inventoryKeys.createdAt))
        .limit(200);

      // Summary: count available/sold per plan
      const summary = await db.execute<{ plan: string; status: string; cnt: string }>(
        sql`SELECT plan, status, COUNT(*) as cnt FROM inventory_keys GROUP BY plan, status`
      );

      return res.json({ success: true, data: rows, summary: summary.rows });
    } catch (err) {
      console.error("Inventory fetch error:", err);
      return res.status(500).json({ success: false, message: "Could not fetch inventory." });
    }
  });

  app.delete("/api/admin/inventory/:id", requireAdmin, async (req, res) => {
    const keyId = parseInt(req.params.id, 10);
    try {
      const [key] = await db.select().from(inventoryKeys).where(eq(inventoryKeys.id, keyId));
      if (!key) return res.json({ success: false, message: "Key not found." });
      if (key.status !== "available") return res.json({ success: false, message: "Only unsold keys can be deleted." });
      await db.update(inventoryKeys)
        .set({ status: "deleted", deletedAt: new Date() })
        .where(eq(inventoryKeys.id, keyId));
      return res.json({ success: true });
    } catch (err) {
      console.error("Inventory delete error:", err);
      return res.status(500).json({ success: false, message: "Could not delete key." });
    }
  });

  app.get("/api/admin/inventory/search", requireAdmin, async (req, res) => {
    const keyVal = (req.query.key as string ?? "").trim();
    if (!keyVal) return res.json({ success: false, message: "Key is required." });
    try {
      const rows = await db.select({
        id: inventoryKeys.id,
        plan: inventoryKeys.plan,
        key: inventoryKeys.key,
        status: inventoryKeys.status,
        addedBy: inventoryKeys.addedBy,
        soldTo: inventoryKeys.soldTo,
        soldToEmail: users.email,
        soldToName: users.name,
        soldAt: inventoryKeys.soldAt,
        deletedAt: inventoryKeys.deletedAt,
        createdAt: inventoryKeys.createdAt,
      }).from(inventoryKeys)
        .leftJoin(users, eq(inventoryKeys.soldTo, users.id))
        .where(sql`LOWER(${inventoryKeys.key}) = LOWER(${keyVal})`);
      if (rows.length === 0) return res.json({ success: false, message: "Key not found in inventory." });
      return res.json({ success: true, key: rows[0] });
    } catch (err) {
      console.error("Key search error:", err);
      return res.status(500).json({ success: false, message: "Search failed." });
    }
  });

  app.get("/api/admin/inventory/deleted", requireAdmin, async (req, res) => {
    try {
      const keys = await db.select({
        id: inventoryKeys.id,
        plan: inventoryKeys.plan,
        key: inventoryKeys.key,
        deletedAt: inventoryKeys.deletedAt,
        createdAt: inventoryKeys.createdAt,
      }).from(inventoryKeys)
        .where(eq(inventoryKeys.status, "deleted"))
        .orderBy(desc(inventoryKeys.deletedAt));
      return res.json({ success: true, keys });
    } catch (err) {
      console.error("Inventory deleted list error:", err);
      return res.status(500).json({ success: false, message: "Could not fetch deleted keys." });
    }
  });

  app.post("/api/admin/inventory/:id/restore", requireAdmin, async (req, res) => {
    const keyId = parseInt(req.params.id, 10);
    try {
      const [key] = await db.select().from(inventoryKeys).where(eq(inventoryKeys.id, keyId));
      if (!key) return res.json({ success: false, message: "Key not found." });
      if (key.status !== "deleted") return res.json({ success: false, message: "Key is not deleted." });
      await db.update(inventoryKeys)
        .set({ status: "available", deletedAt: null })
        .where(eq(inventoryKeys.id, keyId));
      return res.json({ success: true });
    } catch (err) {
      console.error("Inventory restore error:", err);
      return res.status(500).json({ success: false, message: "Could not restore key." });
    }
  });

  app.delete("/api/admin/inventory/:id/permanent", requireAdmin, async (req, res) => {
    const keyId = parseInt(req.params.id, 10);
    try {
      const [key] = await db.select().from(inventoryKeys).where(eq(inventoryKeys.id, keyId));
      if (!key) return res.json({ success: false, message: "Key not found." });
      if (key.status !== "deleted") return res.json({ success: false, message: "Key must be in trash first." });
      await db.delete(inventoryKeys).where(eq(inventoryKeys.id, keyId));
      return res.json({ success: true });
    } catch (err) {
      console.error("Inventory permanent delete error:", err);
      return res.status(500).json({ success: false, message: "Could not permanently delete key." });
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
      // ── Try keys.ovh first ─────────────────────────────────────────────────
      const data = await apiCall("GET", `/key/${encodeURIComponent(key.trim())}/status`);
      if (data.success) {
        const keyData = data.data;
        if (keyData.status === "available") {
          return res.json({ valid: true, type: keyData.subscription || "Plus CDK", status: keyData.status, apiSource: "ovh" });
        } else if (keyData.status === "used" || keyData.status === "activated") {
          const activatedFor = keyData.activated_for ?? keyData.used_by ?? keyData.email ?? keyData.activated_email ?? null;
          const activatedAt = keyData.activated_at ?? keyData.used_at ?? keyData.activatedAt ?? null;
          return res.json({ valid: false, status: "used", message: "This key has already been activated.", activatedFor, activatedAt, apiSource: "ovh" });
        } else if (keyData.status === "expired") {
          return res.json({ valid: false, status: "expired", message: "This key has expired.", apiSource: "ovh" });
        }
        return res.json({ valid: false, message: "Key is not available for activation.", apiSource: "ovh" });
      }

      // ── keys.ovh didn't find it — try Suppy ───────────────────────────────
      const suppy = await suppyCheckKey(key.trim());
      if (suppy && suppy.found) {
        if (suppy.status === "available") {
          const svc = suppy.service === "claude" ? "Claude" : "ChatGPT";
          const planName = suppy.plan ? ` ${suppy.plan.charAt(0).toUpperCase() + suppy.plan.slice(1)}` : "";
          const termName = suppy.term === "30d" ? " 1 Month" : suppy.term === "365d" ? " 1 Year" : "";
          return res.json({
            valid: true,
            type: `${svc}${planName}${termName}`.trim() || "CDK",
            status: "available",
            apiSource: "suppy",
            keyType: suppy.keyType,
            service: suppy.service,
          });
        } else if (suppy.status === "activated") {
          return res.json({
            valid: false,
            status: "used",
            message: "This key has already been activated.",
            activatedFor: suppy.activatedEmail,
            activatedAt: suppy.activatedAt,
            apiSource: "suppy",
          });
        } else if (suppy.status === "reserved") {
          return res.json({ valid: false, status: "reserved", message: "This key is currently reserved.", apiSource: "suppy" });
        }
        return res.json({ valid: false, message: "Key is not available for activation.", apiSource: "suppy" });
      }

      // Neither API found it
      const msg = data.error === "key_not_found" ? "Key not found or not available." : data.message || "Invalid key.";
      return res.json({ valid: false, message: msg });
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
    const { cdkKey, sessionData, apiSource, service } = req.body;
    if (!cdkKey || !sessionData) {
      return res.json({ success: false, message: "CDK key and session data are required." });
    }
    const rawSession = sessionData.trim();

    // ── Route to Suppy for Suppy keys ─────────────────────────────────────────
    if (apiSource === "suppy") {
      const suppyService = service === "claude" ? "claude" : "chatgpt";
      const platform = suppyService === "claude" ? "Claude" : "ChatGPT";

      // Try the service-specific endpoint; if it returns 404 (endpoint doesn't exist
      // for this key type), automatically fall back to /chatgpt/keys/activate-session.
      const pathsToTry = suppyService === "claude"
        ? ["/claude/keys/activate-session", "/chatgpt/keys/activate-session"]
        : ["/chatgpt/keys/activate-session"];

      const suppyErrMap: Record<string, string> = {
        no_access_token: `No session key found. Please follow the instructions to copy your ${platform} session.`,
        session_expired: "Your session has expired. Please get a fresh session token.",
        session_invalid: "Invalid session. Please get a fresh session token.",
        workspace_account: "Corporate/workspace accounts are not supported.",
        "key already activated": "This key has already been activated.",
        "key not found": "Key not found or not available.",
      };

      // For Claude keys the session is a raw cookie (sk-ant-sid0x-...).
      // Suppy may expect it wrapped in a JSON object instead of a plain string.
      // Build a list of (path, body) attempts to try in order.
      type Attempt = { path: string; body: Record<string, unknown> };
      const attempts: Attempt[] = suppyService === "claude"
        ? [
            // 1. Correct service path, raw session string
            { path: "/claude/keys/activate-session", body: { code: cdkKey.trim(), session: rawSession } },
            // 2. Chatgpt path (some Claude keys live here), raw string
            { path: "/chatgpt/keys/activate-session", body: { code: cdkKey.trim(), session: rawSession } },
            // 3. Chatgpt path, session wrapped in JSON object (Suppy may need this format)
            { path: "/chatgpt/keys/activate-session", body: { code: cdkKey.trim(), session: { sessionKey: rawSession } } },
            // 4. Chatgpt path with explicit service hint
            { path: "/chatgpt/keys/activate-session", body: { code: cdkKey.trim(), session: rawSession, service: "claude" } },
          ]
        : [
            { path: "/chatgpt/keys/activate-session", body: { code: cdkKey.trim(), session: rawSession } },
          ];

      try {
        let startRes: Awaited<ReturnType<typeof suppyFetch>> | null = null;
        for (const attempt of attempts) {
          console.log(`[activate/suppy] trying ${attempt.path} body-keys:${Object.keys(attempt.body).join(",")} for key:`, cdkKey.trim().slice(0, 8) + "...");
          startRes = await suppyFetch("POST", attempt.path, attempt.body);
          console.log(`[activate/suppy] → status:${startRes.status} ok:${startRes.ok} data:${JSON.stringify(startRes.data)}`);
          if (startRes.ok) break;
          // Only skip to next attempt on 404 (wrong endpoint) or 0 (network fail)
          if (startRes.status !== 404 && startRes.status !== 0) break;
        }

        if (!startRes || !startRes.ok) {
          const raw = startRes?.data;
          const errText = (typeof raw === "string" ? raw : (raw?.message ?? raw?.error)) || "";
          const message = suppyErrMap[errText] || errText || "Activation failed. Please try again.";
          console.log(`[activate/suppy] all attempts failed. last status=${startRes?.status} raw="${JSON.stringify(raw)}"`);
          return res.json({ success: false, message });
        }

        // If Suppy says "ok" / "completed", verify the key actually got activated
        // (workspace/team accounts silently fail — Suppy returns "ok" but the key stays "Available")
        const suppyStatus = startRes.data?.status;
        if (suppyStatus === "ok" || suppyStatus === "completed") {
          console.log(`[activate/suppy] instant activation (status:${suppyStatus}) for key:`, cdkKey.trim().slice(0, 8) + "...");

          // Give Suppy 2 seconds to update the key status, then verify
          await new Promise(r => setTimeout(r, 2000));
          const verify = await suppyCheckKey(cdkKey.trim(), suppyService);
          console.log(`[activate/suppy] post-instant verify:`, JSON.stringify(verify));

          if (!verify || verify.status === "Available") {
            // Key is still available — activation was silently rejected (e.g. workspace account)
            return res.json({
              success: false,
              message: suppyService === "claude"
                ? "Activation failed. Make sure you are using a personal Claude.ai account, not a Claude for Work or Anthropic developer console account."
                : "Activation failed. Make sure you are using a personal ChatGPT account, not a work or enterprise account.",
            });
          }

          return res.json({ success: true, activated: true, code: cdkKey.trim(), service: suppyService });
        }

        // "started" = async activation in progress — frontend polls /api/suppy-recheck/:code
        return res.json({ success: true, started: true, code: cdkKey.trim(), service: suppyService });
      } catch (err) {
        console.error("[activate/suppy] error:", err);
        return res.status(500).json({ success: false, message: "Activation service unavailable. Please try again." });
      }
    }

    // ── keys.ovh path (default) ────────────────────────────────────────────────
    let accessToken: string;
    try {
      const parsed = JSON.parse(rawSession);
      accessToken = parsed.accessToken || parsed.access_token || parsed.token;
      if (!accessToken) {
        return res.json({ success: false, message: "No accessToken found in session data." });
      }
    } catch {
      return res.json({ success: false, message: "Invalid session data — could not parse JSON." });
    }
    try {
      console.log("[activate] key:", cdkKey.trim().slice(0, 8) + "...", "token length:", accessToken.length, "token prefix:", accessToken.slice(0, 20));

      // Try with full session JSON first, then fall back to just the access token
      let data = await apiCall("POST", "/activate", { key: cdkKey.trim(), user_token: rawSession });
      console.log("[activate] full-session attempt: success:", data.success, "error:", data.error);

      if (!data.success && data.error === "token_invalid") {
        data = await apiCall("POST", "/activate", { key: cdkKey.trim(), user_token: accessToken });
        console.log("[activate] token-only attempt: success:", data.success, "error:", data.error);
      }
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

  // ── Suppy Team Key Activation (email-based) ───────────────────────────────
  app.post("/api/activate-team", async (req, res) => {
    const { cdkKey, email } = req.body;
    if (!cdkKey || !email) {
      return res.json({ success: false, message: "CDK key and email are required." });
    }
    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.json({ success: false, message: "A valid email address is required." });
    }
    try {
      console.log("[activate-team/suppy] key:", cdkKey.trim().slice(0, 8) + "... email:", email.trim());
      const result = await suppyFetch("POST", "/chatgpt/keys/activate", { code: cdkKey.trim(), email: email.trim() });
      if (result.ok && result.data?.key) {
        return res.json({
          success: true,
          email: result.data.key.activated_email,
          activationType: result.data.activation_type,
          subscriptionEndsAt: result.data.key.subscription_ends_at ?? null,
          subscriptionHours: result.data.key.subscription_hours ?? null,
        });
      }
      const errText = typeof result.data === "string" ? result.data : result.data?.message || "Activation failed.";
      return res.json({ success: false, message: errText });
    } catch (err) {
      console.error("[activate-team/suppy] error:", err);
      return res.status(500).json({ success: false, message: "Activation service unavailable. Please try again." });
    }
  });

  // ── Suppy Activation Status Polling ──────────────────────────────────────
  app.get("/api/suppy-activation-status/:code", async (req, res) => {
    const { code } = req.params;
    const suppyService = req.query.service === "claude" ? "claude" : "chatgpt";
    try {
      const result = await suppyFetch("GET", `/${suppyService}/keys/activation-status/${encodeURIComponent(code)}`);
      if (result.status === 404) {
        return res.json({ pending: true, status: "started" });
      }
      if (!result.ok || !result.data || typeof result.data !== "object") {
        return res.json({ pending: true, status: "started" });
      }
      const d = result.data;
      const status = typeof d.status === "string" ? d.status.toLowerCase() : "";
      if (status === "subscription_sent") {
        return res.json({ pending: false, success: true, email: d.key?.activated_email ?? null, activationType: d.activation_type });
      }
      if (status === "error") {
        return res.json({ pending: false, success: false, message: d.message || "Activation failed on provider side." });
      }
      // started | account_found — still in progress
      return res.json({ pending: true, status: d.status });
    } catch (err) {
      console.error("[suppy-status] poll error:", err);
      return res.json({ pending: true, status: "started" });
    }
  });

  /**
   * Definitive re-check: looks at BOTH the activation-status endpoint AND the
   * key's actual status.  Accepts ?service=claude|chatgpt to use the correct
   * Suppy API path for each service type.
   */
  app.get("/api/suppy-recheck/:code", async (req, res) => {
    const { code } = req.params;
    const suppyService = req.query.service === "claude" ? "claude" : "chatgpt";
    try {
      // 1. Check activation-status first (fastest confirmation)
      const statusRes = await suppyFetch("GET", `/${suppyService}/keys/activation-status/${encodeURIComponent(code)}`);
      if (statusRes.ok && statusRes.data && typeof statusRes.data === "object") {
        const d = statusRes.data;
        const s = typeof d.status === "string" ? d.status.toLowerCase() : "";
        if (s === "subscription_sent") {
          return res.json({ pending: false, success: true, email: d.key?.activated_email ?? null, activationType: d.activation_type });
        }
        if (s === "error") {
          return res.json({ pending: false, success: false, message: d.message || "Activation failed on provider side." });
        }
      }

      // 2. Fall back to checking the key's actual status via service-specific endpoint
      const keyInfo = await suppyCheckKey(code, suppyService);
      if (keyInfo?.found && keyInfo.status === "activated") {
        console.log(`[suppy-recheck/${suppyService}] Key ${code.slice(0, 8)}… is activated in key status`);
        return res.json({ pending: false, success: true, email: keyInfo.activatedEmail ?? null, activationType: null });
      }

      return res.json({ pending: true, status: "started" });
    } catch (err) {
      console.error("[suppy-recheck] error:", err);
      return res.json({ pending: true, status: "started" });
    }
  });

  // ── Nitro Auto-Activate (receipt-api.nitro.xin) ──────────────────────────
  app.post("/api/activate-nitro", async (req, res) => {
    const { cdkKey, sessionData } = req.body;
    if (!cdkKey || !sessionData) {
      return res.json({ success: false, message: "CDK key and session data are required." });
    }
    try {
      const resp = await fetch("https://receipt-api.nitro.xin/stocks/public/outstock", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Device-Id": "web",
        },
        body: JSON.stringify({ cdk: cdkKey.trim(), user: sessionData.trim() }),
      });
      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        console.error("[nitro] outstock error:", resp.status, errText);
        return res.json({ success: false, message: errText || `Activation service returned error ${resp.status}.` });
      }
      const contentType = resp.headers.get("content-type") || "";
      let taskId: string;
      if (contentType.includes("application/json")) {
        const json = await resp.json();
        taskId = typeof json === "string" ? json : String(json);
      } else {
        taskId = (await resp.text()).trim();
      }
      if (!taskId) {
        return res.json({ success: false, message: "Activation service did not return a task ID." });
      }
      return res.json({ success: true, taskId });
    } catch (err) {
      console.error("[nitro] activate error:", err);
      return res.json({ success: false, message: "Could not reach the activation service. Please try again." });
    }
  });

  app.get("/api/activate-nitro/:taskId", async (req, res) => {
    const { taskId } = req.params;
    try {
      const resp = await fetch(`https://receipt-api.nitro.xin/stocks/public/outstock/${encodeURIComponent(taskId)}`);
      if (!resp.ok) {
        return res.json({ pending: true, success: false, message: `Poll error ${resp.status}.` });
      }
      const data = await resp.json();
      return res.json(data);
    } catch (err) {
      console.error("[nitro] poll error:", err);
      return res.json({ pending: true, success: false, message: "Polling failed, retrying..." });
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

  // ── Announcement config ──────────────────────────────────────────────────────

  app.get("/api/announcement", async (_req, res) => {
    try {
      const rows = await db.select().from(announcementConfig).orderBy(desc(announcementConfig.id)).limit(1);
      if (rows.length === 0 || !rows[0].isActive) return res.json({ success: true, active: false });
      return res.json({ success: true, active: true, config: rows[0] });
    } catch (err) {
      console.error("Announcement fetch error:", err);
      return res.json({ success: false, active: false });
    }
  });

  app.get("/api/admin/announcement", requireAdmin, async (_req, res) => {
    try {
      const rows = await db.select().from(announcementConfig).orderBy(desc(announcementConfig.id)).limit(1);
      return res.json({ success: true, config: rows[0] ?? null });
    } catch (err) {
      return res.status(500).json({ success: false, message: "Could not fetch config." });
    }
  });

  app.put("/api/admin/announcement", requireAdmin, async (req, res) => {
    const { title, body, ctaText, ctaUrl, logoData, isActive } = req.body;
    try {
      const rows = await db.select().from(announcementConfig).limit(1);
      if (rows.length === 0) {
        await db.insert(announcementConfig).values({
          title: title ?? "", body: body ?? "", ctaText: ctaText ?? "",
          ctaUrl: ctaUrl ?? "", logoData: logoData ?? null,
          isActive: isActive ? 1 : 0, version: 1,
        });
      } else {
        await db.update(announcementConfig)
          .set({ title: title ?? "", body: body ?? "", ctaText: ctaText ?? "",
            ctaUrl: ctaUrl ?? "", logoData: logoData ?? null,
            isActive: isActive ? 1 : 0, version: rows[0].version + 1,
            updatedAt: new Date() })
          .where(eq(announcementConfig.id, rows[0].id));
      }
      const [updated] = await db.select().from(announcementConfig).limit(1);
      return res.json({ success: true, config: updated });
    } catch (err) {
      console.error("Announcement update error:", err);
      return res.status(500).json({ success: false, message: "Could not update popup." });
    }
  });

  // ── Main Plans (admin-editable) ───────────────────────────────────────────────

  app.get("/api/main-plans", async (_req, res) => {
    try {
      const plans = await db.select().from(mainPlans)
        .where(eq(mainPlans.active, 1))
        .orderBy(mainPlans.sortOrder, mainPlans.id);
      return res.json({ success: true, data: plans });
    } catch (err) {
      console.error("main-plans fetch error:", err);
      return res.status(500).json({ success: false, message: "Could not fetch plans." });
    }
  });

  app.get("/api/admin/main-plans", requireAdmin, async (_req, res) => {
    try {
      const plans = await db.select().from(mainPlans).orderBy(mainPlans.sortOrder, mainPlans.id);
      return res.json({ success: true, data: plans });
    } catch (err) {
      return res.status(500).json({ success: false, message: "Error fetching plans." });
    }
  });

  app.post("/api/admin/main-plans", requireAdmin, async (req, res) => {
    try {
      const { name, duration, durationLabel, priceCents, popular, isNew, service, accentColor, deliveryNote, action, planKey, sortOrder } = req.body;
      if (!name || !duration || !durationLabel || !priceCents || !planKey) {
        return res.status(400).json({ success: false, message: "Missing required fields." });
      }
      const [plan] = await db.insert(mainPlans).values({
        name, duration, durationLabel,
        priceCents: parseInt(priceCents),
        popular: popular ? 1 : 0,
        isNew: isNew ? 1 : 0,
        service: service || "chatgpt",
        accentColor: accentColor || null,
        deliveryNote: deliveryNote || "Automatic delivery",
        action: action || "order",
        planKey,
        active: 1,
        sortOrder: parseInt(sortOrder ?? "0") || 0,
      }).returning();
      return res.json({ success: true, data: plan });
    } catch (err) {
      console.error("main-plans create error:", err);
      return res.status(500).json({ success: false, message: "Error creating plan." });
    }
  });

  app.patch("/api/admin/main-plans/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { name, duration, durationLabel, priceCents, popular, isNew, service, accentColor, deliveryNote, action, planKey, active, sortOrder } = req.body;
      const updates: Record<string, unknown> = {};
      if (name !== undefined) updates.name = name;
      if (duration !== undefined) updates.duration = duration;
      if (durationLabel !== undefined) updates.durationLabel = durationLabel;
      if (priceCents !== undefined) updates.priceCents = parseInt(priceCents);
      if (popular !== undefined) updates.popular = popular ? 1 : 0;
      if (isNew !== undefined) updates.isNew = isNew ? 1 : 0;
      if (service !== undefined) updates.service = service;
      if (accentColor !== undefined) updates.accentColor = accentColor || null;
      if (deliveryNote !== undefined) updates.deliveryNote = deliveryNote;
      if (action !== undefined) updates.action = action;
      if (planKey !== undefined) updates.planKey = planKey;
      if (active !== undefined) updates.active = active ? 1 : 0;
      if (sortOrder !== undefined) updates.sortOrder = parseInt(sortOrder) || 0;
      await db.update(mainPlans).set(updates).where(eq(mainPlans.id, id));
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ success: false, message: "Error updating plan." });
    }
  });

  app.delete("/api/admin/main-plans/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await db.delete(mainPlans).where(eq(mainPlans.id, id));
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ success: false, message: "Error deleting plan." });
    }
  });

  // ── Custom Products ───────────────────────────────────────────────────────────

  app.get("/api/products/custom", async (_req, res) => {
    try {
      const products = await db.select().from(customProducts)
        .where(eq(customProducts.active, 1))
        .orderBy(desc(customProducts.createdAt));
      const counts = await db.execute<{ product_id: number; cnt: string }>(
        sql`SELECT product_id, COUNT(*) as cnt FROM custom_vouchers WHERE status='available' GROUP BY product_id`
      );
      const stockMap: Record<number, number> = {};
      counts.rows.forEach((r) => { stockMap[r.product_id] = parseInt(r.cnt); });
      return res.json({ success: true, data: products.map((p) => ({ ...p, stock: stockMap[p.id] ?? 0 })) });
    } catch (err) {
      console.error("Custom products fetch error:", err);
      return res.status(500).json({ success: false, message: "Could not fetch products." });
    }
  });

  app.get("/api/admin/products/custom", requireAdmin, async (_req, res) => {
    try {
      const products = await db.select().from(customProducts).orderBy(desc(customProducts.createdAt));
      const counts = await db.execute<{ product_id: number; status: string; cnt: string }>(
        sql`SELECT product_id, status, COUNT(*) as cnt FROM custom_vouchers GROUP BY product_id, status`
      );
      const stockMap: Record<number, { available: number; sold: number }> = {};
      counts.rows.forEach((r) => {
        if (!stockMap[r.product_id]) stockMap[r.product_id] = { available: 0, sold: 0 };
        if (r.status === "available") stockMap[r.product_id].available = parseInt(r.cnt);
        if (r.status === "sold") stockMap[r.product_id].sold = parseInt(r.cnt);
      });
      return res.json({ success: true, data: products.map((p) => ({ ...p, stock: stockMap[p.id] ?? { available: 0, sold: 0 } })) });
    } catch (err) {
      console.error("Admin custom products error:", err);
      return res.status(500).json({ success: false, message: "Could not fetch products." });
    }
  });

  app.post("/api/admin/products/custom", requireAdmin, async (req, res) => {
    const { name, description, priceCents, logoData } = req.body;
    if (!name?.trim()) return res.json({ success: false, message: "Product name is required." });
    if (!priceCents || isNaN(parseInt(priceCents)) || parseInt(priceCents) < 1)
      return res.json({ success: false, message: "Valid price is required." });
    try {
      const [product] = await db.insert(customProducts).values({
        name: name.trim(), description: (description ?? "").trim(),
        priceCents: parseInt(priceCents), logoData: logoData ?? null, active: 1,
      }).returning();
      return res.json({ success: true, product });
    } catch (err) {
      console.error("Create custom product error:", err);
      return res.status(500).json({ success: false, message: "Could not create product." });
    }
  });

  app.patch("/api/admin/products/custom/:id", requireAdmin, async (req, res) => {
    const productId = parseInt(req.params.id, 10);
    const { name, description, priceCents, logoData, active } = req.body;
    try {
      const updates: Partial<{ name: string; description: string; priceCents: number; logoData: string | null; active: number }> = {};
      if (name !== undefined) updates.name = name.trim();
      if (description !== undefined) updates.description = description.trim();
      if (priceCents !== undefined) updates.priceCents = parseInt(priceCents);
      if (logoData !== undefined) updates.logoData = logoData ?? null;
      if (active !== undefined) updates.active = active ? 1 : 0;
      if (Object.keys(updates).length === 0) return res.json({ success: true });
      await db.update(customProducts).set(updates).where(eq(customProducts.id, productId));
      return res.json({ success: true });
    } catch (err) {
      console.error("Update custom product error:", err);
      return res.status(500).json({ success: false, message: "Could not update product." });
    }
  });

  app.delete("/api/admin/products/custom/:id", requireAdmin, async (req, res) => {
    const productId = parseInt(req.params.id, 10);
    try {
      await db.delete(customVouchers).where(eq(customVouchers.productId, productId));
      await db.delete(customProducts).where(eq(customProducts.id, productId));
      return res.json({ success: true });
    } catch (err) {
      console.error("Delete custom product error:", err);
      return res.status(500).json({ success: false, message: "Could not delete product." });
    }
  });

  // ── Custom Vouchers ───────────────────────────────────────────────────────────

  app.get("/api/admin/products/custom/:id/vouchers", requireAdmin, async (req, res) => {
    const productId = parseInt(req.params.id, 10);
    const statusFilter = req.query.status as string | undefined;
    try {
      const conditions = [eq(customVouchers.productId, productId)];
      if (statusFilter) conditions.push(eq(customVouchers.status, statusFilter));
      const vouchers = await db.select({
        id: customVouchers.id,
        code: customVouchers.code,
        status: customVouchers.status,
        soldTo: customVouchers.soldTo,
        soldAt: customVouchers.soldAt,
        createdAt: customVouchers.createdAt,
        soldToEmail: users.email,
        soldToName: users.name,
      }).from(customVouchers)
        .leftJoin(users, eq(customVouchers.soldTo, users.id))
        .where(and(...conditions))
        .orderBy(desc(customVouchers.createdAt))
        .limit(200);
      return res.json({ success: true, data: vouchers });
    } catch (err) {
      console.error("Voucher list error:", err);
      return res.status(500).json({ success: false, message: "Could not fetch vouchers." });
    }
  });

  app.post("/api/admin/products/custom/:id/vouchers", requireAdmin, async (req, res) => {
    const productId = parseInt(req.params.id, 10);
    const { codes } = req.body;
    if (!Array.isArray(codes) || codes.length === 0)
      return res.json({ success: false, message: "At least one code is required." });
    const clean = codes.map((c: string) => c.trim()).filter((c: string) => c.length > 0);
    if (clean.length === 0) return res.json({ success: false, message: "No valid codes found." });
    if (clean.length > 500) return res.json({ success: false, message: "Maximum 500 codes per batch." });
    try {
      const [product] = await db.select().from(customProducts).where(eq(customProducts.id, productId));
      if (!product) return res.json({ success: false, message: "Product not found." });
      await db.insert(customVouchers).values(clean.map((code) => ({ productId, code, status: "available" as const })));
      return res.json({ success: true, added: clean.length });
    } catch (err) {
      console.error("Add vouchers error:", err);
      return res.status(500).json({ success: false, message: "Could not add codes." });
    }
  });

  app.delete("/api/admin/vouchers/:id", requireAdmin, async (req, res) => {
    const voucherId = parseInt(req.params.id, 10);
    try {
      const [v] = await db.select().from(customVouchers).where(eq(customVouchers.id, voucherId));
      if (!v) return res.json({ success: false, message: "Voucher not found." });
      if (v.status !== "available") return res.json({ success: false, message: "Only unsold vouchers can be deleted." });
      await db.delete(customVouchers).where(eq(customVouchers.id, voucherId));
      return res.json({ success: true });
    } catch (err) {
      console.error("Delete voucher error:", err);
      return res.status(500).json({ success: false, message: "Could not delete voucher." });
    }
  });

  // ── Purchase custom product ───────────────────────────────────────────────────

  app.post("/api/purchase-custom", requireAuth, async (req, res) => {
    const { productId } = req.body;
    if (!productId) return res.json({ success: false, message: "Product ID is required." });
    try {
      const [user] = await db.select().from(users).where(eq(users.id, req.session.userId!));
      if (!user) return res.json({ success: false, message: "User not found." });

      const [product] = await db.select().from(customProducts)
        .where(and(eq(customProducts.id, parseInt(productId)), eq(customProducts.active, 1)));
      if (!product) return res.json({ success: false, message: "Product not found or unavailable." });

      if (user.balanceCents < product.priceCents) {
        const shortfall = ((product.priceCents - user.balanceCents) / 100).toFixed(2);
        return res.json({ success: false, message: `Insufficient balance. You need $${shortfall} more.`, code: "insufficient_balance" });
      }

      const allocated = await db.transaction(async (tx) => {
        const rows = await tx.execute<{ id: number; code: string }>(
          sql`SELECT id, code FROM custom_vouchers WHERE product_id = ${product.id} AND status = 'available' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED`
        );
        if (rows.rows.length === 0) return null;
        const voucher = rows.rows[0];
        await tx.update(customVouchers).set({ status: "sold", soldTo: user.id, soldAt: new Date() }).where(eq(customVouchers.id, voucher.id));
        return voucher.code;
      });

      if (!allocated) return res.json({ success: false, message: "This product is currently out of stock." });

      const orderNumber = `C-${Date.now()}-${user.id}`;
      await db.update(users).set({ balanceCents: user.balanceCents - product.priceCents }).where(eq(users.id, user.id));
      await db.insert(transactions).values({ userId: user.id, amountCents: -product.priceCents, type: "debit", description: `${product.name} — Order #${orderNumber}`, createdBy: user.id });
      await db.insert(orders).values({ userId: user.id, orderNumber, product: product.name, subscription: product.name, quantity: 1, amountCents: product.priceCents, keys: [allocated], status: "delivered" });

      return res.json({ success: true, key: allocated, orderNumber, product: product.name, balanceCents: user.balanceCents - product.priceCents, amountCents: product.priceCents });
    } catch (err) {
      console.error("Purchase custom product error:", err);
      return res.status(500).json({ success: false, message: "Purchase failed. Please try again." });
    }
  });

  // ── WhatsApp Bot (Baileys) ────────────────────────────────────────────────

  // Admin endpoint: returns QR code image or connection status
  app.get("/api/admin/whatsapp/qr", requireAdmin, async (req, res) => {
    try {
      const { isConnected } = getConnectionStatus();
      if (isConnected) {
        return res.json({ status: "connected" });
      }
      const qr = getRawQR();
      if (qr) {
        return res.json({ status: "qr", qr });
      }
      return res.json({ status: "waiting" });
    } catch (err) {
      console.error("[whatsapp] QR endpoint error:", err);
      return res.status(500).json({ status: "error" });
    }
  });

  // Register the Baileys message handler for CDK activation
  setMessageHandler(async (from: string, text: string) => {
    try {
      let state: WaState = waStateMap.get(from) ?? { stage: "idle", lastActivity: Date.now() };
      state.lastActivity = Date.now();

      if (state.stage === "idle") {
        const looksLikeKey = text.length >= 8 && !text.includes(" ");
        if (looksLikeKey) {
          const check = await checkCdkKeyStatus(text);
          if (check.status === "available") {
            waStateMap.set(from, { stage: "awaiting_session", cdkKey: text, lastActivity: Date.now() });
            const planInfo = check.type ? ` (${check.type})` : "";
            await sendWhatsAppMessage(from,
              `✅ Key verified${planInfo}!\n\nNow send your ChatGPT session token to activate.\n\n📋 How to get it:\n1. Open your browser\n2. Go to: chat.openai.com/api/auth/session\n3. You will see a long JSON text starting with {"user":...\n4. Select ALL of it and send it here\n\n⚠️ The session token is NOT a CDK key. It is a long JSON from that URL.`
            );
          } else if (check.status === "used") {
            waStateMap.set(from, state);
            await sendWhatsAppMessage(from, "❌ This key has already been activated by another account.");
          } else if (check.status === "expired") {
            waStateMap.set(from, state);
            await sendWhatsAppMessage(from, "❌ This key has expired and can no longer be used.");
          } else if (check.status === "error") {
            waStateMap.set(from, state);
            await sendWhatsAppMessage(from, "⚠️ Could not check this key right now. Please try again in a moment.");
          } else {
            waStateMap.set(from, state);
            await sendWhatsAppMessage(from,
              `👋 Welcome to ChatGPT CDK Activation!\n\nSend me your CDK activation key to get started.`
            );
          }
        } else {
          waStateMap.set(from, state);
          await sendWhatsAppMessage(from,
            `👋 Welcome to ChatGPT CDK Activation!\n\nSend me your CDK activation key to get started.`
          );
        }
      } else if (state.stage === "awaiting_session") {
        const cdkKey = state.cdkKey!;

        const looksLikeCdkKey = text.length <= 30 && !text.includes(" ") && !text.startsWith("{") && !text.startsWith("ey") && /^[A-Za-z0-9_\-]+$/.test(text);
        if (looksLikeCdkKey) {
          const check = await checkCdkKeyStatus(text);
          if (check.status === "available") {
            waStateMap.set(from, { stage: "awaiting_session", cdkKey: text, lastActivity: Date.now() });
            const planInfo = check.type ? ` (${check.type})` : "";
            await sendWhatsAppMessage(from, `✅ New key accepted${planInfo}!\n\nNow send your ChatGPT session token to activate.\n\n📋 Go to: chat.openai.com/api/auth/session\nCopy the full JSON text and send it here.`);
            return;
          } else {
            await sendWhatsAppMessage(from,
              `⚠️ That does not look like a session token.\n\nYour CDK key is already verified. I need your ChatGPT session token now.\n\n📋 How to get it:\n1. Open your browser\n2. Go to: chat.openai.com/api/auth/session\n3. You will see a long JSON starting with {"user":...\n4. Copy ALL of it and send it here\n\nOr send a new CDK key to start over.`
            );
            waStateMap.set(from, state);
            return;
          }
        }

        await sendWhatsAppMessage(from, "⏳ Activating your account, please wait...");
        const result = await activateCdkViaWhatsApp(cdkKey, text);

        if (result.success) {
          waStateMap.delete(from);
          const details = [
            result.email ? `📧 Account: ${result.email}` : null,
            result.subscription ? `📦 Plan: ${result.subscription}` : null,
          ].filter(Boolean).join("\n");
          await sendWhatsAppMessage(from,
            `🎉 Your ChatGPT account has been activated successfully!\n\n${details}\n\nEnjoy your subscription!`
          );
        } else {
          await sendWhatsAppMessage(from,
            `❌ Activation failed: ${result.message}\n\nMake sure you copied the full JSON from chat.openai.com/api/auth/session and try again. Or send your CDK key again to start over.`
          );
        }
      }
    } catch (err) {
      console.error("[whatsapp] Message handler error:", err);
    }
  });

  return httpServer;
}
