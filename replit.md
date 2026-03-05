# CDK Key Validator

## Overview

This is a CDK (Content Delivery Key) validation and redemption web application. It allows users to:
- **Redeem a single key** via a step-by-step wizard on the main page (`/`)
- **Batch check multiple keys** at once on the `/batch` page

The app acts as a proxy to an external key management API (`https://keys.ovh/api/v1`), keeping the API credentials server-side. The frontend is a React SPA served by an Express backend.

---

## User Preferences

Preferred communication style: Simple, everyday language.

---

## System Architecture

### Frontend (React SPA)

- **Framework**: React 18 with TypeScript
- **Routing**: `wouter` (lightweight client-side routing)
- **State/Data fetching**: TanStack React Query v5 for server state management
- **UI components**: shadcn/ui (built on Radix UI primitives) with Tailwind CSS
- **Build tool**: Vite
- **Styling**: Tailwind CSS with CSS custom properties for theming (light/dark mode support via HSL variables)
- **Font**: DM Sans, Fira Code, Geist Mono, Architects Daughter (Google Fonts)

**Key pages:**
- `client/src/pages/redeem.tsx` — 3-step key redemption wizard (enter key → confirm product → success)
- `client/src/pages/batch-check.tsx` — paste multiple keys, check all statuses at once

### Backend (Express)

- **Framework**: Express 5 (Node.js)
- **Language**: TypeScript, run with `tsx` in dev, bundled with esbuild for production
- **Routes** (`server/routes.ts`):
  - `GET /api/products` — fetches available products from the external API
  - `POST /api/validate-cdk` — validates a single key against the external API
  - `POST /api/batch-check` — checks multiple keys in batch (implied by client usage)
- **Static serving**: In production, serves the Vite-built frontend from `dist/public`; in dev, Vite runs as middleware

### Data Storage

- **Schema** (`shared/schema.ts`): Drizzle ORM with PostgreSQL dialect. Defines a `users` table with `id`, `username`, `password`.
- **Current storage**: `server/storage.ts` uses an in-memory `MemStorage` class (a `Map`). The database schema exists but the app currently doesn't use Postgres at runtime — it's ready to be wired up.
- **Migrations**: Drizzle Kit configured to push schema to PostgreSQL via `DATABASE_URL` env variable.

### Shared Code

- `shared/schema.ts` — single source of truth for DB types and Zod validation schemas, used by both server and client type imports.

### Build & Dev

- **Dev**: `tsx server/index.ts` starts Express which also hosts Vite dev server as middleware (HMR via WebSocket at `/vite-hmr`)
- **Production build**: `script/build.ts` runs Vite for the client, then esbuild bundles the server into `dist/index.cjs`
- **Replit plugins**: `@replit/vite-plugin-runtime-error-modal`, `@replit/vite-plugin-cartographer`, `@replit/vite-plugin-dev-banner` enabled in dev on Replit

### Path Aliases

| Alias | Resolves to |
|---|---|
| `@/*` | `client/src/*` |
| `@shared/*` | `shared/*` |
| `@assets/*` | `attached_assets/*` |

---

## External Dependencies

### External API: keys.ovh

- **Base URL**: `https://keys.ovh/api/v1`
- **Auth**: Bearer token via `CDK_API_KEY` environment variable
- **Endpoints used**:
  - `GET /products` — list available products
  - `GET /key/:key/status` — check a key's status (available/used/expired/not_found)
  - (implied) key activation endpoint for the redeem flow

### Environment Variables Required

| Variable | Purpose |
|---|---|
| `CDK_API_KEY` | Bearer token for keys.ovh API |
| `DATABASE_URL` | PostgreSQL connection string (required by drizzle-kit, not yet used at runtime) |

### NPM / Key Libraries

| Library | Purpose |
|---|---|
| `express` v5 | HTTP server |
| `drizzle-orm` + `drizzle-zod` | ORM and schema validation |
| `@tanstack/react-query` | Client-side data fetching and caching |
| `wouter` | Lightweight React router |
| `radix-ui/*` | Accessible UI primitives |
| `tailwindcss` | Utility-first CSS |
| `class-variance-authority` + `clsx` + `tailwind-merge` | Conditional className utilities |
| `lucide-react` | Icon set |
| `zod` | Runtime schema validation |
| `nanoid` | Unique ID generation |
| `connect-pg-simple` | PostgreSQL session store (available but not wired up yet) |