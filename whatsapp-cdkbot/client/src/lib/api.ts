const BASE = "/api";

function token() { return localStorage.getItem("token") ?? ""; }

async function req(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token()}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

export const api = {
  // Auth
  login: (email: string, password: string) => req("POST", "/auth/login", { email, password }),
  register: (email: string, password: string) => req("POST", "/auth/register", { email, password }),
  me: () => req("GET", "/auth/me"),

  // Bot
  botStatus: () => req("GET", "/bot/status"),
  botStart: () => req("POST", "/bot/start"),
  botStop: () => req("POST", "/bot/stop"),

  // Settings
  getSettings: () => req("GET", "/settings"),
  saveSettings: (data: Record<string, string>) => req("POST", "/settings", data),

  // Keys
  getKeys: (status?: string) => req("GET", `/keys${status ? `?status=${status}` : ""}`),
  addKeys: (keysText: string) => req("POST", "/keys", { keysText }),
  deleteKey: (id: number) => req("DELETE", `/keys/${id}`),

  // Orders
  getOrders: (status?: string) => req("GET", `/orders${status ? `?status=${status}` : ""}`),
  confirmOrder: (id: number) => req("POST", `/orders/${id}/confirm`),
  cancelOrder: (id: number) => req("POST", `/orders/${id}/cancel`),
};
