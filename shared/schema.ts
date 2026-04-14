import { pgTable, serial, text, integer, timestamp, pgEnum, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const roleEnum = pgEnum("role", ["admin", "customer"]);
export const txTypeEnum = pgEnum("tx_type", ["credit", "debit"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: roleEnum("role").notNull().default("customer"),
  balanceCents: integer("balance_cents").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  amountCents: integer("amount_cents").notNull(),
  type: txTypeEnum("type").notNull(),
  description: text("description").notNull(),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  orderNumber: text("order_number").notNull(),
  product: text("product").notNull(),
  subscription: text("subscription").notNull(),
  quantity: integer("quantity").notNull(),
  amountCents: integer("amount_cents").notNull(),
  keys: text("keys").array().notNull(),
  status: text("status").notNull().default("delivered"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const depositRequests = pgTable("deposit_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  amountUsdt: text("amount_usdt").notNull(),
  amountCents: integer("amount_cents").notNull(),
  network: text("network").notNull(),
  status: text("status").notNull().default("pending"),
  txHash: text("tx_hash"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
}, (table) => ({
  uniqPendingDepositAmount: uniqueIndex("uniq_pending_deposit_amount")
    .on(table.network, table.amountUsdt)
    .where(sql`${table.status} = 'pending'`),
}));

export const inventoryKeys = pgTable("inventory_keys", {
  id: serial("id").primaryKey(),
  plan: text("plan").notNull(),
  key: text("key").notNull(),
  status: text("status").notNull().default("available"),
  addedBy: integer("added_by").notNull().references(() => users.id),
  soldTo: integer("sold_to").references(() => users.id),
  soldAt: timestamp("sold_at"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  planStatusIdx: index("idx_inventory_keys_plan_status").on(table.plan, table.status),
}));

// ── Custom Products (admin-managed, e.g. LinkedIn vouchers) ──────────────────
export const customProducts = pgTable("custom_products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  priceCents: integer("price_cents").notNull(),
  logoData: text("logo_data"),          // base64 data URL or external URL
  active: integer("active").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const customVouchers = pgTable("custom_vouchers", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => customProducts.id),
  code: text("code").notNull(),
  status: text("status").notNull().default("available"),
  soldTo: integer("sold_to").references(() => users.id),
  soldAt: timestamp("sold_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Main Plans (admin-editable shop plans, replaces hardcoded PLANS array) ───
export const mainPlans = pgTable("main_plans", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  duration: text("duration").notNull(),         // "1M", "1Y", "Weekly"
  durationLabel: text("duration_label").notNull(),
  priceCents: integer("price_cents").notNull(),
  popular: integer("popular").notNull().default(0),
  isNew: integer("is_new").notNull().default(0),
  service: text("service").notNull().default("chatgpt"), // "chatgpt" | "claude"
  accentColor: text("accent_color"),            // null = use primary; "#D97757" for claude
  deliveryNote: text("delivery_note").notNull().default("Automatic delivery"),
  action: text("action").notNull().default("order"), // "order" | "whatsapp"
  planKey: text("plan_key").notNull(),          // maps to inventory plan slug
  active: integer("active").notNull().default(1),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type MainPlan = typeof mainPlans.$inferSelect;

// ── Guest Checkout (no account required) ─────────────────────────────────────
export const guestCheckouts = pgTable("guest_checkouts", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),           // UUID used in all URLs
  guestEmail: text("guest_email"),                   // optional contact email
  items: text("items").notNull(),                    // JSON: [{planKey, planName, quantity, unitCents}]
  totalCents: integer("total_cents").notNull(),
  amountUsdt: text("amount_usdt").notNull(),         // unique-offset USDT amount to pay
  status: text("status").notNull().default("pending_payment"), // pending_payment | paid | fulfilled | out_of_stock | expired
  deliveredKeys: text("delivered_keys"),             // JSON: [{planKey, keys:[]}] — set on fulfillment
  orderNumber: text("order_number"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

export const guestDeposits = pgTable("guest_deposits", {
  id: serial("id").primaryKey(),
  checkoutId: integer("checkout_id").notNull().references(() => guestCheckouts.id),
  amountUsdt: text("amount_usdt").notNull(),         // same unique-offset amount as checkout
  amountCents: integer("amount_cents").notNull(),
  network: text("network").notNull().default("bep20"),
  status: text("status").notNull().default("pending"), // pending | completed | expired
  txHash: text("tx_hash"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
}, (table) => ({
  uniqPendingGuestDepositAmount: uniqueIndex("uniq_pending_guest_deposit_amount")
    .on(table.network, table.amountUsdt)
    .where(sql`${table.status} = 'pending'`),
}));

export type GuestCheckout = typeof guestCheckouts.$inferSelect;
export type GuestDeposit = typeof guestDeposits.$inferSelect;

// ── API Keys (user-generated for public API access) ──────────────────────────
export const apiKeys = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  keyPrefix: text("key_prefix").notNull(),
  active: integer("active").notNull().default(1),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── Announcement popup config (admin-controlled) ─────────────────────────────
export const announcementConfig = pgTable("announcement_config", {
  id: serial("id").primaryKey(),
  title: text("title").notNull().default(""),
  body: text("body").notNull().default(""),
  ctaText: text("cta_text").notNull().default(""),
  ctaUrl: text("cta_url").notNull().default(""),
  logoData: text("logo_data"),          // base64 data URL or external URL
  isActive: integer("is_active").notNull().default(0),
  version: integer("version").notNull().default(1),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, balanceCents: true, role: true });
export const insertOrderSchema = createInsertSchema(orders).omit({ id: true, createdAt: true });
export const insertDepositSchema = createInsertSchema(depositRequests).omit({ id: true, createdAt: true });
export const insertInventoryKeySchema = createInsertSchema(inventoryKeys).omit({ id: true, createdAt: true, soldTo: true, soldAt: true });

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Order = typeof orders.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type DepositRequest = typeof depositRequests.$inferSelect;
export type InventoryKey = typeof inventoryKeys.$inferSelect;
export type CustomProduct = typeof customProducts.$inferSelect;
export type CustomVoucher = typeof customVouchers.$inferSelect;
export type AnnouncementConfig = typeof announcementConfig.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
