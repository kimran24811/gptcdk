-- Guest checkout tables migration
-- Run this on the production database after deploying the code

CREATE TABLE IF NOT EXISTS guest_checkouts (
  id SERIAL PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  guest_email TEXT,
  items TEXT NOT NULL,
  total_cents INTEGER NOT NULL,
  amount_usdt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_payment',
  delivered_keys TEXT,
  order_number TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS guest_deposits (
  id SERIAL PRIMARY KEY,
  checkout_id INTEGER NOT NULL REFERENCES guest_checkouts(id),
  amount_usdt TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  network TEXT NOT NULL DEFAULT 'bep20',
  status TEXT NOT NULL DEFAULT 'pending',
  tx_hash TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_pending_guest_deposit_amount
  ON guest_deposits (network, amount_usdt)
  WHERE status = 'pending';
