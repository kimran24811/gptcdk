import { useState, useEffect } from "react";
import { api } from "../lib/api";

export function Keys() {
  const [data, setData] = useState<{ keys: any[]; stats: any }>({ keys: [], stats: {} });
  const [filter, setFilter] = useState("");
  const [newKeys, setNewKeys] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try { setData(await api.getKeys(filter || undefined)); } catch {}
    setLoading(false);
  }

  useEffect(() => { load(); }, [filter]);

  async function addKeys() {
    if (!newKeys.trim()) return;
    setAdding(true);
    try {
      const res = await api.addKeys(newKeys);
      alert(`✅ Added ${res.inserted} key(s).`);
      setNewKeys("");
      await load();
    } catch (e: any) { alert(e.message); }
    setAdding(false);
  }

  async function deleteKey(id: number) {
    if (!confirm("Delete this key?")) return;
    setDeletingId(id);
    try { await api.deleteKey(id); await load(); } catch (e: any) { alert(e.message); }
    setDeletingId(null);
  }

  const s = data.stats;

  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-bold">Key Inventory</h2>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Available", value: s.available ?? 0, color: "text-green-400" },
          { label: "Used",      value: s.used ?? 0,      color: "text-red-400" },
          { label: "Total",     value: s.total ?? 0,     color: "text-gray-300" },
        ].map(stat => (
          <div key={stat.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-500 mb-1">{stat.label}</p>
            <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Add Keys */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="font-semibold mb-3">Add Keys</h3>
        <textarea value={newKeys} onChange={e => setNewKeys(e.target.value)} rows={6}
          placeholder={"Paste keys here, one per line:\nKEY-AAAAAA\nKEY-BBBBBB\nKEY-CCCCCC"}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm font-mono focus:outline-none focus:border-green-500 resize-y" />
        <div className="flex items-center justify-between mt-3">
          <p className="text-xs text-gray-500">{newKeys.split("\n").filter(l => l.trim()).length} keys detected</p>
          <button onClick={addKeys} disabled={adding || !newKeys.trim()}
            className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors">
            {adding ? "Adding…" : "Add Keys"}
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {[{ val: "", label: "All" }, { val: "available", label: "Available" }, { val: "used", label: "Used" }].map(f => (
          <button key={f.val} onClick={() => setFilter(f.val)}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${filter === f.val ? "bg-green-600 border-green-600 text-white" : "border-gray-700 text-gray-400 hover:text-white"}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Keys table */}
      {loading ? <p className="text-gray-500">Loading…</p> : data.keys.length === 0 ? (
        <p className="text-gray-500">No keys found.</p>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-800/50 text-gray-400 text-left">
              <tr>
                <th className="px-4 py-3">Key</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Used By</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {data.keys.map((k, i) => (
                <tr key={k.id} className={`border-t border-gray-800 ${i % 2 === 0 ? "" : "bg-gray-800/20"}`}>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-300">{k.keyValue}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${k.isUsed ? "bg-red-500/20 text-red-300 border-red-500/30" : "bg-green-500/20 text-green-300 border-green-500/30"}`}>
                      {k.isUsed ? "Used" : "Available"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">{k.usedByJid ? k.usedByJid.split("@")[0] : "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">{k.isUsed && k.usedAt ? new Date(k.usedAt).toLocaleDateString() : new Date(k.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-2.5 text-right">
                    {!k.isUsed && (
                      <button onClick={() => deleteKey(k.id)} disabled={deletingId === k.id}
                        className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50 px-2 py-1 rounded hover:bg-red-950 transition-colors">
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
