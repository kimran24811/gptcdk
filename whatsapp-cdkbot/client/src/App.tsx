import { useState, useEffect } from "react";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { Orders } from "./pages/Orders";
import { Keys } from "./pages/Keys";
import { Settings } from "./pages/Settings";
import { Sidebar } from "./components/Sidebar";
import { api } from "./lib/api";

type Page = "dashboard" | "orders" | "keys" | "settings";

export default function App() {
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<Page>("dashboard");
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    api.me()
      .then(() => setAuthed(true))
      .catch(() => setAuthed(false))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!authed) return;
    const refresh = () =>
      api.getOrders("pending").then((rows: any[]) => setPendingCount(rows.length)).catch(() => {});
    refresh();
    const t = setInterval(refresh, 30_000);
    return () => clearInterval(t);
  }, [authed]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>;
  if (!authed) return <Login onLogin={() => setAuthed(true)} />;

  return (
    <div className="flex min-h-screen">
      <Sidebar page={page} setPage={setPage} pendingCount={pendingCount} onLogout={() => { localStorage.removeItem("token"); setAuthed(false); }} />
      <main className="flex-1 p-6 overflow-auto">
        {page === "dashboard" && <Dashboard />}
        {page === "orders"    && <Orders />}
        {page === "keys"      && <Keys />}
        {page === "settings"  && <Settings />}
      </main>
    </div>
  );
}
