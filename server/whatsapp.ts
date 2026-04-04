import fs from "fs";
import path from "path";
import QRCode from "qrcode";

const AUTH_DIR = process.env.WA_AUTH_DIR || path.join(process.cwd(), "wa-auth");

let sock: any = null;
let currentQR: string | null = null;
let isConnected = false;
let messageHandler: ((from: string, text: string) => Promise<void>) | null = null;

// Load Baileys at runtime using Function trick to bypass CJS bundler
// (Baileys is ESM-only and cannot be require()'d in a CJS bundle)
async function loadBaileys(): Promise<any> {
  return new Function('s', 'return import(s)')("@whiskeysockets/baileys");
}

export function getConnectionStatus() {
  return { isConnected, hasQR: !!currentQR };
}

export async function getQRCodeDataURL(): Promise<string | null> {
  if (!currentQR) return null;
  try {
    return await QRCode.toDataURL(currentQR);
  } catch {
    return null;
  }
}

export function setMessageHandler(handler: (from: string, text: string) => Promise<void>) {
  messageHandler = handler;
}

export async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
  if (!sock || !isConnected) {
    console.error("[whatsapp] Not connected — cannot send message to", to);
    return;
  }
  const jid = to.includes("@") ? to : `${to}@s.whatsapp.net`;
  try {
    await sock.sendMessage(jid, { text });
    console.log(`[whatsapp] Sent message to ${to}`);
  } catch (err) {
    console.error("[whatsapp] sendMessage error:", err);
  }
}

export async function startWhatsApp(): Promise<void> {
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }

  const baileys = await loadBaileys();

  const makeWASocket = baileys.default;
  const {
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason,
    makeCacheableSignalKeyStore,
    isJidBroadcast,
  } = baileys;

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  console.log("[whatsapp] Starting Baileys v" + version.join("."));

  sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, console as any),
    },
    getMessage: async () => undefined,
    shouldIgnoreJid: (jid: string) => isJidBroadcast(jid),
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update: any) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      currentQR = qr;
      isConnected = false;
      console.log("[whatsapp] QR code ready — scan from admin panel at /api/admin/whatsapp/qr");
    }

    if (connection === "open") {
      currentQR = null;
      isConnected = true;
      console.log("[whatsapp] Connected successfully!");
    }

    if (connection === "close") {
      isConnected = false;
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log("[whatsapp] Connection closed. Reconnect:", shouldReconnect);

      if (shouldReconnect) {
        setTimeout(() => startWhatsApp(), 5000);
      } else {
        console.log("[whatsapp] Logged out — clearing auth state");
        currentQR = null;
        try {
          fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        } catch {}
        setTimeout(() => startWhatsApp(), 3000);
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }: any) => {
    if (type !== "notify") return;
    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      if (!msg.message) continue;

      const from = msg.key.remoteJid;
      if (!from) continue;

      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        "";

      if (!text.trim()) continue;

      console.log(`[whatsapp] Message from ${from}: ${text.slice(0, 80)}`);

      if (messageHandler) {
        try {
          await messageHandler(from, text.trim());
        } catch (err) {
          console.error("[whatsapp] messageHandler error:", err);
        }
      }
    }
  });
}
