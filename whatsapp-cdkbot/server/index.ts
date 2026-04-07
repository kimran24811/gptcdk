import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { authRouter } from "./routes/auth";
import { botRouter } from "./routes/bot";
import { settingsRouter } from "./routes/settings";
import { keysRouter } from "./routes/keys";
import { ordersRouter } from "./routes/orders";
import { WAManager } from "./wa/WAManager";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// API routes
app.use("/api/auth", authRouter);
app.use("/api/bot", botRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/keys", keysRouter);
app.use("/api/orders", ordersRouter);

// Serve React build in production
if (process.env.NODE_ENV === "production") {
  const clientDist = path.join(__dirname, "public");
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
}

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  // Auto-reconnect all tenants that have saved WhatsApp auth
  await WAManager.reconnectAll();
});
