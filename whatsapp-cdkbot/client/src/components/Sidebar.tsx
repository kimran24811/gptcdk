type Page = "dashboard" | "orders" | "keys" | "settings";

interface Props {
  page: Page;
  setPage: (p: Page) => void;
  pendingCount: number;
  onLogout: () => void;
}

const navItems: { id: Page; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "⚡" },
  { id: "orders",    label: "Orders",    icon: "📦" },
  { id: "keys",      label: "Key Inventory", icon: "🔑" },
  { id: "settings",  label: "Settings",  icon: "⚙️" },
];

export function Sidebar({ page, setPage, pendingCount, onLogout }: Props) {
  return (
    <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col">
      <div className="p-5 border-b border-gray-800">
        <h1 className="font-bold text-lg text-white">CDK Bot</h1>
        <p className="text-xs text-gray-500 mt-0.5">Admin Dashboard</p>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => setPage(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              page === item.id ? "bg-green-600 text-white" : "text-gray-400 hover:bg-gray-800 hover:text-white"
            }`}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
            {item.id === "orders" && pendingCount > 0 && (
              <span className="ml-auto bg-yellow-500 text-black text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {pendingCount > 9 ? "9+" : pendingCount}
              </span>
            )}
          </button>
        ))}
      </nav>
      <div className="p-3 border-t border-gray-800">
        <button onClick={onLogout} className="w-full px-3 py-2 text-sm text-gray-500 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors text-left">
          🚪 Logout
        </button>
      </div>
    </aside>
  );
}
