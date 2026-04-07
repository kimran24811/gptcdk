import { useState, useEffect } from "react";
import { api } from "../lib/api";

const STATUS_LABELS: Record<string, { label: string; class: string }> = {
  pending:           { label: "Pending",    class: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" },
  verifying:         { label: "Verifying",  class: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  delivered:         { label: "Delivered",  class: "bg-green-500/20 text-green-300 border-green-500/30" },
  cancelled:         { label: "Cancelled",  class: "bg-gray-500/20 text-gray-400 border-gray-500/30" },
  insufficient_stock:{ label: "Partial",    class: "bg-orange-500/20 text-orange-300 border-orange-500/30" },
};

export function Orders() {
  const [orders, setOrders] = useState<any[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try { setOrders(await api.getOrders(filter || undefined)); } catch {}
    setLoading(false);
  }

  useEffect(() => { load(); }, [filter]);

  async function confirm(id: number) {
    setActionId(id);
    try { await api.confirmOrder(id); await load(); } catch (e: any) { alert(e.message); }
    setActionId(null);
  }

  async function cancel(id: number) {
    if (!confirm("Cancel this order? The customer will be notified.")) return;
    setActionId(id);
    try { await api.cancelOrder(id); await load(); } catch (e: any) { alert(e.message); }
    setActionId(null);
  }

  const phone = (jid: string) => jid.split("@")[0];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Orders</h2>
        <button onClick={load} className="text-sm text-gray-400 hover:text-white">↺ Refresh</button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {[
          { val: "",            label: "All" },
          { val: "pending",     label: "Pending" },
          { val: "verifying",   label: "Verifying" },
          { val: "delivered",   label: "Delivered" },
          { val: "cancelled",   label: "Cancelled" },
        ].map(f => (
          <button key={f.val} onClick={() => setFilter(f.val)}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${filter === f.val ? "bg-green-600 border-green-600 text-white" : "border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white"}`}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : orders.length === 0 ? (
        <p className="text-gray-500">No orders found.</p>
      ) : (
        <div className="space-y-3">
          {orders.map(o => {
            const st = STATUS_LABELS[o.status] ?? { label: o.status, class: "bg-gray-800 text-gray-400 border-gray-700" };
            return (
              <div key={o.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-gray-500">#{o.id}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${st.class}`}>{st.label}</span>
                    </div>
                    <p className="font-semibold mt-1">📱 {phone(o.jid)}</p>
                    <p className="text-sm text-gray-400 mt-0.5">
                      {o.quantity} key{o.quantity > 1 ? "s" : ""} × PKR {o.pricePerKey} = <span className="text-white font-medium">PKR {o.totalPkr.toLocaleString()}</span>
                    </p>
                    {o.senderName && (
                      <p className="text-sm text-gray-500 mt-0.5">
                        Submitted: PKR {o.amountSubmitted?.toLocaleString()} · {o.senderName}
                      </p>
                    )}
                    {o.nayapayTxId && <p className="text-xs text-gray-600 mt-0.5 font-mono">TX: {o.nayapayTxId}</p>}
                    <p className="text-xs text-gray-600 mt-1">{new Date(o.createdAt).toLocaleString()}</p>
                  </div>

                  {/* Actions */}
                  {(o.status === "pending" || o.status === "verifying" || o.status === "insufficient_stock") && (
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      <button onClick={() => confirm(o.id)} disabled={actionId === o.id}
                        className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors whitespace-nowrap">
                        {actionId === o.id ? "…" : "✓ Confirm & Deliver"}
                      </button>
                      <button onClick={() => cancel(o.id)} disabled={actionId === o.id}
                        className="text-red-400 hover:text-red-300 text-sm px-4 py-1.5 rounded-lg hover:bg-red-950 transition-colors">
                        Cancel
                      </button>
                    </div>
                  )}
                </div>

                {/* Delivered keys */}
                {o.keysDelivered?.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-800">
                    <p className="text-xs text-gray-500 mb-1">Keys delivered:</p>
                    <div className="flex flex-wrap gap-1">
                      {o.keysDelivered.map((k: string, i: number) => (
                        <span key={i} className="text-xs font-mono bg-gray-800 px-2 py-0.5 rounded">{k}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
