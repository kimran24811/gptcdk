import { useState, useEffect } from "react";
import { api } from "../lib/api";

interface BotState {
  connected: boolean;
  qrDataUrl: string | null;
  phone: string | null;
  status: "disconnected" | "connecting" | "connected";
}

export function Dashboard() {
  const [bot, setBot] = useState<BotState | null>(null);
  const [keyStats, setKeyStats] = useState<{ total: number; available: number; used: number } | null>(null);
  const [pendingOrders, setPendingOrders] = useState(0);
  const [loading, setLoading] = useState(false);

  async function fetchStatus() {
    try {
      const [status, keys, orders] = await Promise.all([
        api.botStatus(),
        api.getKeys(),
        api.getOrders("pending"),
      ]);
      setBot(status);
      setKeyStats(keys.stats);
      setPendingOrders(orders.length);
    } catch {}
  }

  useEffect(() => {
    fetchStatus();
    const t = setInterval(fetchStatus, 5000);
    return () => clearInterval(t);
  }, []);

  async function handleStart() {
    setLoading(true);
    await api.botStart().catch(() => {});
    setLoading(false);
    fetchStatus();
  }

  async function handleStop() {
    if (!confirm("Disconnect the WhatsApp bot?")) return;
    setLoading(true);
    await api.botStop().catch(() => {});
    setLoading(false);
    fetchStatus();
  }

  const statusColor = bot?.status === "connected" ? "text-green-400" : bot?.status === "connecting" ? "text-yellow-400" : "text-gray-500";

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-2xl font-bold">Dashboard</h2>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Available Keys", value: keyStats?.available ?? "—", color: "text-green-400" },
          { label: "Used Keys",      value: keyStats?.used ?? "—",      color: "text-gray-400" },
          { label: "Pending Orders", value: pendingOrders,               color: "text-yellow-400" },
        ].map(s => (
          <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">{s.label}</p>
            <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Bot status card */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-lg">WhatsApp Bot</h3>
            <p className={`text-sm mt-0.5 ${statusColor}`}>
              {bot?.status === "connected" ? `Connected — ${bot.phone}` : bot?.status === "connecting" ? "Connecting…" : "Disconnected"}
            </p>
          </div>
          <div className="flex gap-2">
            {bot?.status !== "connected" && (
              <button onClick={handleStart} disabled={loading}
                className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
                Connect
              </button>
            )}
            {bot?.status === "connected" && (
              <button onClick={handleStop} disabled={loading}
                className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
                Disconnect
              </button>
            )}
          </div>
        </div>

        {/* QR Code */}
        {bot?.qrDataUrl && (
          <div className="mt-4 text-center">
            <p className="text-sm text-gray-400 mb-3">Scan with WhatsApp to connect</p>
            <img src={bot.qrDataUrl} alt="QR Code" className="w-56 h-56 mx-auto rounded-xl border border-gray-700 bg-white p-2" />
            <p className="text-xs text-gray-500 mt-2">QR refreshes automatically</p>
          </div>
        )}

        {bot?.status === "connected" && (
          <div className="mt-4 flex items-center gap-2 bg-green-950 border border-green-800 rounded-lg px-4 py-3">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
            <span className="text-sm text-green-300">Bot is online and accepting orders</span>
          </div>
        )}
      </div>

      {/* Pricing reference */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="font-semibold mb-3">Pricing Tiers (PKR)</h3>
        <table className="w-full text-sm">
          <thead><tr className="text-gray-500 text-left"><th className="pb-2">Quantity</th><th className="pb-2">Price/Key</th><th className="pb-2">Example Total</th></tr></thead>
          <tbody className="text-gray-300 space-y-1">
            {[
              { range: "1–9 keys", price: 615, ex: "9 × 615 = PKR 5,535" },
              { range: "10–29 keys", price: 600, ex: "20 × 600 = PKR 12,000" },
              { range: "30–49 keys", price: 565, ex: "40 × 565 = PKR 22,600" },
              { range: "50–99 keys", price: 550, ex: "60 × 550 = PKR 33,000" },
            ].map(t => (
              <tr key={t.range} className="border-t border-gray-800">
                <td className="py-2">{t.range}</td>
                <td className="py-2 font-medium text-green-400">PKR {t.price}</td>
                <td className="py-2 text-gray-500">{t.ex}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
