import { useState } from "react";
import { api } from "../lib/api";

export function Login({ onLogin }: { onLogin: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = mode === "login"
        ? await api.login(email, password)
        : await api.register(email, password);
      localStorage.setItem("token", res.token);
      onLogin();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-2xl p-8">
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">🤖</div>
          <h1 className="text-2xl font-bold">CDK Bot</h1>
          <p className="text-gray-500 text-sm mt-1">Admin Dashboard</p>
        </div>

        <div className="flex bg-gray-800 rounded-lg p-1 mb-6">
          {(["login", "register"] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors capitalize ${mode === m ? "bg-green-600 text-white" : "text-gray-400 hover:text-white"}`}>
              {m}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-500" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-500" />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-semibold py-2 rounded-lg transition-colors">
            {loading ? "Please wait…" : mode === "login" ? "Login" : "Register"}
          </button>
        </form>
      </div>
    </div>
  );
}
