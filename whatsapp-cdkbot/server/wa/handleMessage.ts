import { db, keyPool, orders, tenantSettings } from "../db";
import { eq, and } from "drizzle-orm";
import { GmailChecker } from "../gmail/GmailChecker";

// ── Pricing tiers (PKR per key) ───────────────────────────────────────────────
const TIERS = [
  { min: 1,  max: 9,  price: 615 },
  { min: 10, max: 29, price: 600 },
  { min: 30, max: 49, price: 565 },
  { min: 50, max: 99, price: 550 },
];

function getPrice(qty: number): number | null {
  return TIERS.find(t => qty >= t.min && qty <= t.max)?.price ?? null;
}

function pricingTable(): string {
  return TIERS.map(t => `  ${t.min}–${t.max} keys: PKR ${t.price}/key`).join("\n");
}

// ── Per-user conversation state ───────────────────────────────────────────────
interface UserState {
  step: "idle" | "awaiting_quantity" | "awaiting_payment" | "verifying";
  orderId?: number;
  quantity?: number;
  totalPkr?: number;
  lastActivity: number;
}

const userStates = new Map<string, UserState>();
const msgCounts = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT = 10;
const RATE_WINDOW = 60_000;
const STATE_EXPIRY = 30 * 60_000;

function getState(jid: string): UserState {
  const s = userStates.get(jid);
  if (!s || Date.now() - s.lastActivity > STATE_EXPIRY) {
    const fresh: UserState = { step: "idle", lastActivity: Date.now() };
    userStates.set(jid, fresh);
    return fresh;
  }
  s.lastActivity = Date.now();
  return s;
}

function setState(jid: string, partial: Partial<UserState>) {
  const s = getState(jid);
  userStates.set(jid, { ...s, ...partial, lastActivity: Date.now() });
}

function isRateLimited(jid: string): boolean {
  const now = Date.now();
  const entry = msgCounts.get(jid) ?? { count: 0, windowStart: now };
  if (now - entry.windowStart > RATE_WINDOW) {
    msgCounts.set(jid, { count: 1, windowStart: now });
    return false;
  }
  entry.count++;
  msgCounts.set(jid, entry);
  return entry.count > RATE_LIMIT;
}

async function getSetting(tenantId: number, key: string): Promise<string> {
  const [row] = await db.select().from(tenantSettings)
    .where(and(eq(tenantSettings.tenantId, tenantId), eq(tenantSettings.key, key)));
  return row?.value ?? "";
}

async function buildPaymentMsg(tenantId: number, qty: number, total: number): Promise<string> {
  const binanceId   = await getSetting(tenantId, "binance_pay_id");
  const binanceUser = await getSetting(tenantId, "binance_username");
  const bsc         = await getSetting(tenantId, "bsc_address");
  const nayapay     = await getSetting(tenantId, "nayapay_number");

  let details = "";
  if (binanceId)  details += `🟡 Binance Pay ID: ${binanceId}${binanceUser ? ` (${binanceUser})` : ""}\n`;
  if (bsc)        details += `🔷 BSC Wallet: ${bsc}\n`;
  if (nayapay)    details += `🟢 NayaPay: ${nayapay}\n`;

  return (
    `📋 *Order Summary*\n` +
    `• ${qty} × PKR ${getPrice(qty)} = *PKR ${total}*\n\n` +
    `💳 *Payment Details*\n${details}\n` +
    `After paying via *NayaPay*, reply with:\n` +
    `*AMOUNT | SENDER NAME*\n` +
    `Example: \`${total} | Ali Khan\`\n\n` +
    `For Binance/BSC, an admin will manually confirm your payment.`
  );
}

async function deliverKeys(tenantId: number, orderId: number, jid: string, qty: number, sendReply: (t: string) => Promise<void>) {
  // Grab available keys
  const available = await db.select().from(keyPool)
    .where(and(eq(keyPool.tenantId, tenantId), eq(keyPool.isUsed, false)))
    .limit(qty);

  if (available.length === 0) {
    await sendReply("⚠️ Sorry, we are currently out of stock. An admin will deliver your keys shortly.");
    await db.update(orders).set({ status: "insufficient_stock" }).where(eq(orders.id, orderId));
    return;
  }

  const toDeliver = available.slice(0, qty);
  const keyValues = toDeliver.map(k => k.keyValue);

  // Mark keys as used
  for (const k of toDeliver) {
    await db.update(keyPool).set({ isUsed: true, usedAt: new Date(), usedByJid: jid }).where(eq(keyPool.id, k.id));
  }

  // Update order
  await db.update(orders).set({
    status: toDeliver.length < qty ? "insufficient_stock" : "delivered",
    keysDelivered: keyValues,
  }).where(eq(orders.id, orderId));

  const keyList = keyValues.map((k, i) => `${i + 1}. ${k}`).join("\n");

  if (toDeliver.length < qty) {
    await sendReply(
      `✅ *Partial Delivery*\n\nHere are ${toDeliver.length} of your ${qty} keys:\n\n${keyList}\n\n` +
      `⚠️ ${qty - toDeliver.length} key(s) will be delivered soon. We apologize for the inconvenience.`
    );
  } else {
    await sendReply(
      `✅ *Payment Verified! Here are your keys:*\n\n${keyList}\n\n` +
      `Thank you for your purchase! 🎉`
    );
  }
}

// ── Main message handler ──────────────────────────────────────────────────────
export async function handleMessage(
  tenantId: number,
  jid: string,
  text: string,
  sendReply: (t: string) => Promise<void>
): Promise<void> {
  if (isRateLimited(jid)) return;

  const state = getState(jid);
  const lower = text.toLowerCase().trim();

  // ── IDLE / GREETING → show menu ──────────────────────────────────────────
  if (state.step === "idle" || ["hi", "hello", "hey", "start", "menu", "help"].includes(lower)) {
    const botName = await getSetting(tenantId, "bot_name") || "CDK Bot";
    await sendReply(
      `👋 Welcome to *${botName}*!\n\n` +
      `We sell *ChatGPT Plus CDK Keys* 🔑\n\n` +
      `💰 *Pricing (PKR)*\n${pricingTable()}\n\n` +
      `How many keys do you want? Reply with a number (1–99).`
    );
    setState(jid, { step: "awaiting_quantity" });
    return;
  }

  // ── AWAITING QUANTITY ─────────────────────────────────────────────────────
  if (state.step === "awaiting_quantity") {
    const qty = parseInt(text, 10);
    if (isNaN(qty) || qty < 1 || qty > 99) {
      await sendReply("❌ Please enter a valid number between 1 and 99.");
      return;
    }
    const pricePerKey = getPrice(qty);
    if (!pricePerKey) {
      await sendReply("❌ We only support orders of 1–99 keys at this time.");
      return;
    }
    const total = qty * pricePerKey;

    // Create pending order
    const [order] = await db.insert(orders).values({
      tenantId, jid, quantity: qty, pricePerKey, totalPkr: total, status: "pending",
    }).returning();

    const paymentMsg = await buildPaymentMsg(tenantId, qty, total);
    await sendReply(paymentMsg);
    setState(jid, { step: "awaiting_payment", orderId: order.id, quantity: qty, totalPkr: total });
    return;
  }

  // ── AWAITING PAYMENT (customer sends "AMOUNT | NAME") ─────────────────────
  if (state.step === "awaiting_payment") {
    // Allow "cancel" to reset
    if (lower === "cancel") {
      if (state.orderId) await db.update(orders).set({ status: "cancelled" }).where(eq(orders.id, state.orderId!));
      setState(jid, { step: "idle" });
      await sendReply("❌ Order cancelled. Send *hi* to start a new order.");
      return;
    }

    // Parse "AMOUNT | SENDER NAME"
    const parts = text.split("|").map(p => p.trim());
    if (parts.length < 2) {
      await sendReply(
        `Please reply in this format:\n*AMOUNT | SENDER NAME*\nExample: \`${state.totalPkr} | Ali Khan\`\n\nSend *cancel* to cancel this order.`
      );
      return;
    }

    const submittedAmount = parseInt(parts[0].replace(/[^0-9]/g, ""), 10);
    const submittedName = parts.slice(1).join("|").trim();

    if (isNaN(submittedAmount) || submittedAmount <= 0) {
      await sendReply("❌ Invalid amount. Please try again.\nFormat: *AMOUNT | SENDER NAME*");
      return;
    }

    // Save submitted details to order
    await db.update(orders).set({
      senderName: submittedName,
      amountSubmitted: submittedAmount,
      status: "verifying",
    }).where(eq(orders.id, state.orderId!));

    setState(jid, { step: "verifying" });
    await sendReply("⏳ Checking your payment... please wait a moment.");

    // Start async payment verification (non-blocking)
    verifyPaymentWithRetry(tenantId, state.orderId!, jid, submittedAmount, submittedName, state.quantity!, sendReply);
    return;
  }

  // ── VERIFYING state — customer sends something while we're checking ────────
  if (state.step === "verifying") {
    await sendReply("⏳ We are still verifying your payment. Please wait...");
    return;
  }

  // ── Default fallback ──────────────────────────────────────────────────────
  await sendReply("Send *hi* to see our menu and pricing. 👋");
  setState(jid, { step: "idle" });
}

// ── Payment verification with retry ──────────────────────────────────────────
async function verifyPaymentWithRetry(
  tenantId: number,
  orderId: number,
  jid: string,
  amount: number,
  senderName: string,
  quantity: number,
  sendReply: (t: string) => Promise<void>,
  attempt = 1
): Promise<void> {
  const MAX_ATTEMPTS = 5;
  const INTERVAL_MS = 15_000;

  try {
    const gmailUser = await getSetting(tenantId, "gmail_user");
    const gmailPass = await getSetting(tenantId, "gmail_app_password");

    if (!gmailUser || !gmailPass) {
      // No Gmail configured — flag for manual confirmation
      await db.update(orders).set({ status: "pending" }).where(eq(orders.id, orderId));
      await sendReply(
        "⚠️ Auto-verification is not configured. An admin will manually confirm your payment.\n" +
        "You will receive your keys once confirmed."
      );
      setState(jid, { step: "idle" });
      return;
    }

    const result = await GmailChecker.findNayapayPayment(gmailUser, gmailPass, amount, senderName, tenantId, orderId);

    if (result.found) {
      // Payment found — deliver keys
      await db.update(orders).set({ nayapayTxId: result.txId }).where(eq(orders.id, orderId));
      setState(jid, { step: "idle" });
      await deliverKeys(tenantId, orderId, jid, quantity, sendReply);
    } else if (attempt < MAX_ATTEMPTS) {
      // Try again after 15 seconds
      setTimeout(() => {
        verifyPaymentWithRetry(tenantId, orderId, jid, amount, senderName, quantity, sendReply, attempt + 1);
      }, INTERVAL_MS);
    } else {
      // All attempts exhausted
      await db.update(orders).set({ status: "pending" }).where(eq(orders.id, orderId));
      setState(jid, { step: "idle" });
      await sendReply(
        "❌ *Payment not verified.*\n\n" +
        "We could not find a matching NayaPay payment after multiple checks.\n\n" +
        "Please ensure:\n" +
        `• You sent *PKR ${amount}* from NayaPay\n` +
        `• Your sender name is exactly *${senderName}*\n\n` +
        "Send *hi* to try a new order, or contact support for manual verification."
      );
    }
  } catch (err) {
    console.error(`[verify] attempt ${attempt} error:`, err);
    if (attempt < MAX_ATTEMPTS) {
      setTimeout(() => {
        verifyPaymentWithRetry(tenantId, orderId, jid, amount, senderName, quantity, sendReply, attempt + 1);
      }, INTERVAL_MS);
    } else {
      await db.update(orders).set({ status: "pending" }).where(eq(orders.id, orderId));
      setState(jid, { step: "idle" });
      await sendReply("❌ Payment verification failed due to a technical error. An admin will review your order shortly.");
    }
  }
}
