import { pgTable, serial, text, integer, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const orderStatusEnum = pgEnum("order_status", ["pending", "verifying", "delivered", "cancelled", "insufficient_stock"]);

export const tenants = pgTable("tenants", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Key-value store for all tenant settings:
// bot_name, binance_pay_id, binance_username, bsc_address, nayapay_number,
// gmail_user, gmail_app_password
export const tenantSettings = pgTable("tenant_settings", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  value: text("value").notNull(),
});

export const keyPool = pgTable("key_pool", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  plan: text("plan").notNull().default("chatgpt_plus"),
  keyValue: text("key_value").notNull(),
  isUsed: boolean("is_used").notNull().default(false),
  usedAt: timestamp("used_at"),
  usedByJid: text("used_by_jid"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  jid: text("jid").notNull(),           // WhatsApp JID (phone@s.whatsapp.net)
  quantity: integer("quantity").notNull(),
  pricePerKey: integer("price_per_key").notNull(), // PKR
  totalPkr: integer("total_pkr").notNull(),
  senderName: text("sender_name"),       // Name customer submitted for payment
  amountSubmitted: integer("amount_submitted"), // Amount customer said they sent
  nayapayTxId: text("nayapay_tx_id"),   // Extracted from email after verification
  status: orderStatusEnum("status").notNull().default("pending"),
  keysDelivered: text("keys_delivered").array().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Tracks which NayaPay email transaction IDs have been used, to prevent double-delivery
export const usedTransactions = pgTable("used_transactions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  txId: text("tx_id").notNull().unique(),
  orderId: integer("order_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
