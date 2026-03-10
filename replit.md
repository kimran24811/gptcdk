# ChatGPT Recharge — CDK Key Service

## Overview

A full-stack web application for ChatGPT CDK subscription key management. Customers register, top up their balance via Binance Pay, then buy keys instantly from the shop. Keys are delivered via keys.ovh API and shown on screen immediately.

Live at: **gptcdk.xyz**

---

## User Preferences

Preferred communication style: Simple, everyday language.

---

## System Architecture

### Frontend (React SPA)

- **Framework**: React 18 with TypeScript
- **Routing**: `wouter` (lightweight client-side routing)
- **State/Data fetching**: TanStack React Query v5 (queries and mutations)
- **UI components**: shadcn/ui (Radix UI primitives) with Tailwind CSS
- **Build tool**: Vite
- **Styling**: Tailwind CSS with HSL CSS custom properties, dark mode via `.dark` class
- **Theme**: ThemeProvider in `client/src/components/theme-provider.tsx`, defaults to dark
- **Auth state**: `useAuth()` hook in `client/src/hooks/use-auth.ts` (wraps `/api/auth/me` query)

**Pages:**
| Route | Page | Access |
|---|---|---|
| `/` | Redeem CDK — 3-step activation wizard | Public |
| `/batch` | Batch Key Check | Public |
| `/shop` | Shop — buy keys with balance | Login required |
| `/account` | My Account — balance + order history | Login required |
| `/admin` | Admin Panel — customers + orders | Admin only |
| `/login` | Login | Public |
| `/register` | Register | Public |

**Key features:**
- `?key=XXXXX` URL param on `/` pre-fills and auto-validates CDK key (from "Redeem →" shortcuts)
- Shop order panel shows balance and disables "Buy Now" if insufficient
- Success dialog shows delivered keys with Copy + Redeem shortcuts per key
- Account page shows expandable order history with keys, copy + redeem per key

### Backend (Express)

- **Framework**: Express (Node.js) with TypeScript via `tsx`
- **Session**: `express-session` with `connect-pg-simple` store (sessions in Postgres)
- **Auth**: bcrypt password hashing, session-based auth

**API Routes:**
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | — | Register customer |
| POST | `/api/auth/login` | — | Login |
| POST | `/api/auth/logout` | — | Logout |
| GET | `/api/auth/me` | — | Current user |
| GET | `/api/me/orders` | User | Customer's order history |
| POST | `/api/purchase` | User | Buy keys (balance check → keys.ovh → deduct) |
| GET | `/api/admin/customers` | Admin | All customers |
| POST | `/api/admin/customers/:id/credit` | Admin | Add balance to customer |
| GET | `/api/admin/orders` | Admin | All orders across all users |
| GET | `/api/products` | — | keys.ovh product list |
| POST | `/api/validate-cdk` | — | Validate CDK key status |
| POST | `/api/validate-session` | — | Validate ChatGPT session JSON |
| POST | `/api/activate` | — | Activate CDK with user session |
| POST | `/api/batch-status` | — | Batch key status check |

**Admin seed:** On startup, creates admin from `ADMIN_EMAIL` + `ADMIN_PASSWORD` env vars if no admin exists.
- Default: `admin@gptcdk.xyz` / `Admin@CDK2024!`

### Database (PostgreSQL)

Drizzle ORM with these tables:

| Table | Key fields |
|---|---|
| `users` | id, email, password_hash, name, role (admin\|customer), balance_cents, created_at |
| `transactions` | id, user_id, amount_cents, type (credit\|debit), description, created_by, created_at |
| `orders` | id, user_id, order_number, product, subscription, quantity, amount_cents, keys (text[]), status, created_at |
| `session` | (managed by connect-pg-simple) |

### External API: keys.ovh

- **Base URL**: `https://keys.ovh/api/v1`
- **Auth**: Bearer token via `CDK_API_KEY` environment variable
- **Plan → slug mapping**:
  - `plus-1m` → subscription_type_slug: `plus-1m`
  - `plus-1y` → subscription_type_slug: `plus-12m`
  - `go-1y` → subscription_type_slug: `go-12m`
  - `pro-1m` → subscription_type_slug: `pro-1m`
  - All use `product_slug: "chatgpt"`

### Payment Flow

1. Customer tops up via **Binance Pay** (ID: `552780449`, Username: `User-1d9f7`)
2. Customer sends WhatsApp screenshot to `+447577308067`
3. Admin verifies → opens `/admin` → adds balance via "Add" button
4. Customer returns to Shop → balance shows → buys keys instantly

### Environment Variables

| Variable | Purpose |
|---|---|
| `CDK_API_KEY` | keys.ovh Bearer token |
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Express session secret |
| `ADMIN_EMAIL` | Admin account email (default: admin@gptcdk.xyz) |
| `ADMIN_PASSWORD` | Admin account password |

### Build & Dev

- **Dev**: `npm run dev` → `tsx server/index.ts` (Express + Vite middleware)
- **Production**: Vite builds client to `dist/public`, esbuild bundles server

### Path Aliases

| Alias | Resolves to |
|---|---|
| `@/*` | `client/src/*` |
| `@shared/*` | `shared/*` |
| `@assets/*` | `attached_assets/*` |
