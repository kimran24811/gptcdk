import { useState, useEffect } from "react";
import { api } from "../lib/api";

type Tab = "general" | "payment" | "gmail" | "pricing";

export function Settings() {
  const [tab, setTab] = useState<Tab>("general");
  const [form, setForm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getSettings().then(s => { setForm(s); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  function set(key: string, value: string) {
    setForm(f => ({ ...f, [key]: value }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    try {
      await api.saveSettings(form);
      setSaved(true);
    } catch (e: any) { alert(e.message); }
    setSaving(false);
  }

  const Input = ({ label, field, type = "text", placeholder = "" }: { label: string; field: string; type?: string; placeholder?: string }) => (
    <div>
      <label className="block text-sm text-gray-400 mb-1">{label}</label>
      <input type={type} value={form[field] ?? ""} onChange={e => set(field, e.target.value)} placeholder={placeholder}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-500" />
    </div>
  );

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "general", label: "General", icon: "⚙️" },
    { id: "payment", label: "Payment", icon: "💳" },
    { id: "gmail",   label: "Gmail",   icon: "📧" },
    { id: "pricing", label: "Pricing", icon: "💰" },
  ];

  if (loading) return <p className="text-gray-500">Loading…</p>;

  return (
    <div className="max-w-xl space-y-5">
      <h2 className="text-2xl font-bold">Settings</h2>

      <div className="flex gap-2 flex-wrap">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg border transition-colors ${tab === t.id ? "bg-green-600 border-green-600 text-white" : "border-gray-700 text-gray-400 hover:text-white hover:border-gray-500"}`}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
        {tab === "general" && (
          <>
            <h3 className="font-semibold">General Settings</h3>
            <Input label="Bot Name (shown in welcome message)" field="bot_name" placeholder="CDK Bot" />
          </>
        )}

        {tab === "payment" && (
          <>
            <h3 className="font-semibold">Payment Details</h3>
            <p className="text-xs text-gray-500">These details are shown to customers when they place an order.</p>
            <Input label="Binance Pay ID" field="binance_pay_id" placeholder="552780449" />
            <Input label="Binance Username" field="binance_username" placeholder="User-1d9f7" />
            <Input label="BSC Wallet Address" field="bsc_address" placeholder="0x0c31c91ec2cbb607..." />
            <Input label="NayaPay Number" field="nayapay_number" placeholder="03022000761" />
          </>
        )}

        {tab === "gmail" && (
          <>
            <h3 className="font-semibold">Gmail Auto-Verification</h3>
            <p className="text-xs text-gray-500 leading-relaxed">
              The bot checks this Gmail inbox for NayaPay "Cha-Ching!" emails to automatically verify customer payments.
              Use an App Password — not your regular Gmail password.
            </p>
            <div className="bg-blue-950 border border-blue-800 rounded-lg p-3 text-xs text-blue-300 leading-relaxed">
              <strong>How to get App Password:</strong><br />
              1. Go to Google Account → Security<br />
              2. Enable 2-Step Verification<br />
              3. Search "App Passwords" → Create one for "Mail"<br />
              4. Copy the 16-character password and paste below
            </div>
            <Input label="Gmail Address" field="gmail_user" placeholder="yourname@gmail.com" />
            <div>
              <label className="block text-sm text-gray-400 mb-1">Gmail App Password</label>
              <input type="password" value={form["gmail_app_password"] ?? ""} onChange={e => set("gmail_app_password", e.target.value)}
                placeholder="xxxx xxxx xxxx xxxx"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-500 font-mono" />
              <p className="text-xs text-gray-600 mt-1">Stored securely. Leave blank to keep existing password.</p>
            </div>
          </>
        )}

        {tab === "pricing" && (
          <>
            <h3 className="font-semibold">Pricing Tiers</h3>
            <p className="text-xs text-gray-500 mb-2">These are fixed in the bot logic. Contact your developer to change them.</p>
            <table className="w-full text-sm">
              <thead><tr className="text-gray-500 text-left"><th className="pb-2">Quantity</th><th className="pb-2">Price / Key</th></tr></thead>
              <tbody>
                {[["1–9 keys", "PKR 615"], ["10–29 keys", "PKR 600"], ["30–49 keys", "PKR 565"], ["50–99 keys", "PKR 550"]].map(([qty, price]) => (
                  <tr key={qty} className="border-t border-gray-800">
                    <td className="py-2 text-gray-300">{qty}</td>
                    <td className="py-2 font-medium text-green-400">{price}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {tab !== "pricing" && (
          <div className="flex items-center gap-3 pt-2">
            <button onClick={save} disabled={saving}
              className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-semibold px-6 py-2 rounded-lg transition-colors text-sm">
              {saving ? "Saving…" : "Save Settings"}
            </button>
            {saved && <span className="text-green-400 text-sm">✓ Saved</span>}
          </div>
        )}
      </div>
    </div>
  );
}
