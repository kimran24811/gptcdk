import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  WASocket,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import * as qrcode from "qrcode";
import path from "path";
import fs from "fs";
import { handleMessage } from "./handleMessage";

export interface WAState {
  connected: boolean;
  qrDataUrl: string | null;
  phone: string | null;
  status: "disconnected" | "connecting" | "connected";
}

interface SessionEntry {
  socket: WASocket | null;
  state: WAState;
}

const sessions = new Map<number, SessionEntry>();
const AUTH_BASE = path.join(process.cwd(), "wa_auth");

function getAuthDir(tenantId: number) {
  const dir = path.join(AUTH_BASE, String(tenantId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export const WAManager = {
  async startSession(tenantId: number): Promise<void> {
    if (sessions.get(tenantId)?.state.status === "connected") return;

    const entry: SessionEntry = {
      socket: null,
      state: { connected: false, qrDataUrl: null, phone: null, status: "connecting" },
    };
    sessions.set(tenantId, entry);

    const { version } = await fetchLatestBaileysVersion();
    const { state: authState, saveCreds } = await useMultiFileAuthState(getAuthDir(tenantId));

    const sock = makeWASocket({
      version,
      auth: {
        creds: authState.creds,
        keys: makeCacheableSignalKeyStore(authState.keys, { level: "silent" } as any),
      },
      printQRInTerminal: false,
      syncFullHistory: false,
      logger: { level: "silent" } as any,
    });

    entry.socket = sock;

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        entry.state.qrDataUrl = await qrcode.toDataURL(qr);
        entry.state.status = "connecting";
      }

      if (connection === "open") {
        entry.state.connected = true;
        entry.state.qrDataUrl = null;
        entry.state.status = "connected";
        entry.state.phone = sock.user?.id?.split(":")[0] ?? null;
        console.log(`[WA] Tenant ${tenantId} connected — ${entry.state.phone}`);
      }

      if (connection === "close") {
        const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;
        console.log(`[WA] Tenant ${tenantId} disconnected (code ${code})`);
        entry.state = { connected: false, qrDataUrl: null, phone: null, status: "disconnected" };
        entry.socket = null;
        if (!loggedOut) {
          // Auto-reconnect after 5 seconds
          setTimeout(() => WAManager.startSession(tenantId), 5000);
        } else {
          // Logged out — clear auth
          fs.rmSync(getAuthDir(tenantId), { recursive: true, force: true });
        }
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;
      for (const msg of messages) {
        if (!msg.message || msg.key.fromMe) continue;
        const jid = msg.key.remoteJid;
        if (!jid || jid.endsWith("@g.us")) continue; // skip groups
        const text =
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          "";
        if (!text.trim()) continue;
        await handleMessage(tenantId, jid, text.trim(), async (reply: string) => {
          await sock.sendMessage(jid, { text: reply });
        });
      }
    });
  },

  async stopSession(tenantId: number): Promise<void> {
    const entry = sessions.get(tenantId);
    if (!entry?.socket) return;
    await entry.socket.logout();
    entry.state = { connected: false, qrDataUrl: null, phone: null, status: "disconnected" };
    entry.socket = null;
    sessions.delete(tenantId);
    fs.rmSync(getAuthDir(tenantId), { recursive: true, force: true });
  },

  async sendMessage(tenantId: number, jid: string, text: string): Promise<void> {
    const entry = sessions.get(tenantId);
    if (!entry?.socket || !entry.state.connected) throw new Error("Bot not connected.");
    await entry.socket.sendMessage(jid, { text });
  },

  getState(tenantId: number): WAState {
    return sessions.get(tenantId)?.state ?? {
      connected: false, qrDataUrl: null, phone: null, status: "disconnected",
    };
  },

  async reconnectAll(): Promise<void> {
    if (!fs.existsSync(AUTH_BASE)) return;
    const dirs = fs.readdirSync(AUTH_BASE);
    for (const dir of dirs) {
      const tenantId = parseInt(dir, 10);
      if (!isNaN(tenantId)) {
        console.log(`[WA] Auto-reconnecting tenant ${tenantId}`);
        WAManager.startSession(tenantId).catch(console.error);
      }
    }
  },
};
