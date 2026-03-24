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
  // Partial unique index: no two active pending deposits can share (network, amount_usdt)
  // This enforces the unique micro-amount identification even under concurrent requests.
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
