import { type User, type InsertUser } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  validateCdk(key: string, apiKey: string): Promise<{ type: string } | null>;
  activateCdk(key: string, sessionData: object, apiKey: string): Promise<{ success: boolean; message?: string }>;
}

const CDK_TYPES: Record<string, string> = {
  "PLUS": "ChatGPT Plus CDK (1M)",
  "PRO": "ChatGPT Pro CDK (3M)",
  "TEAM": "ChatGPT Team CDK (1M)",
  "EDU": "ChatGPT Edu CDK (6M)",
};

function detectCdkType(key: string): string {
  const upper = key.toUpperCase();
  for (const prefix of Object.keys(CDK_TYPES)) {
    if (upper.includes(prefix)) return CDK_TYPES[prefix];
  }
  return "ChatGPT Plus CDK (1M)";
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private usedCdks: Set<string>;

  constructor() {
    this.users = new Map();
    this.usedCdks = new Set();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async validateCdk(key: string, apiKey: string): Promise<{ type: string } | null> {
    if (this.usedCdks.has(key)) {
      return null;
    }

    const isValidFormat =
      key.length >= 8 &&
      key.length <= 64 &&
      /^[A-Z0-9\-]+$/.test(key);

    if (!isValidFormat) return null;

    const type = detectCdkType(key);
    return { type };
  }

  async activateCdk(
    key: string,
    sessionData: object,
    apiKey: string
  ): Promise<{ success: boolean; message?: string }> {
    if (this.usedCdks.has(key)) {
      return { success: false, message: "This CDK has already been used." };
    }

    const session = sessionData as Record<string, unknown>;
    const hasAuth =
      session.accessToken || session.user || session.expires || session.session;

    if (!hasAuth) {
      return { success: false, message: "Invalid session data provided." };
    }

    this.usedCdks.add(key);
    return { success: true };
  }
}

export const storage = new MemStorage();
