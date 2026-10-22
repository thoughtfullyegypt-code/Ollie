-- Donation bookkeeping is independent of allocations, moderation and transfers.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_minor integer NOT NULL DEFAULT 0 CHECK(tax_minor>=0);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunded_minor integer NOT NULL DEFAULT 0 CHECK(refunded_minor>=0);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunded_tax_minor integer NOT NULL DEFAULT 0 CHECK(refunded_tax_minor>=0);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS disputed_minor integer NOT NULL DEFAULT 0 CHECK(disputed_minor>=0);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS disputed_tax_minor integer NOT NULL DEFAULT 0 CHECK(disputed_tax_minor>=0);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunded_tax_known boolean NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS disputed_tax_known boolean NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS settled_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS financial_review_required boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS donation_commitments(id text PRIMARY KEY,config jsonb NOT NULL,created_by text NOT NULL REFERENCES "user"(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS donation_financial_events(event_id text PRIMARY KEY,order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,event_type text NOT NULL,snapshot jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS donation_order_assignments(order_id text PRIMARY KEY REFERENCES orders(id),commitment_id text NOT NULL REFERENCES donation_commitments(id));
CREATE TABLE IF NOT EXISTS donation_ledger(id text PRIMARY KEY,event_id text NOT NULL,order_id text NOT NULL REFERENCES orders(id),commitment_id text NOT NULL REFERENCES donation_commitments(id),event_type text NOT NULL,currency text NOT NULL CHECK(currency='usd'),eligible_delta_minor bigint NOT NULL,accrual_delta_minor bigint NOT NULL,period_start date NOT NULL,period_end date NOT NULL,occurred_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(event_id,commitment_id),CHECK(period_end>period_start));
CREATE INDEX IF NOT EXISTS donation_ledger_commitment_idx ON donation_ledger(commitment_id,period_start,created_at);
CREATE INDEX IF NOT EXISTS donation_ledger_order_idx ON donation_ledger(order_id,created_at);
CREATE TABLE IF NOT EXISTS donation_receipts(id text PRIMARY KEY,commitment_id text NOT NULL REFERENCES donation_commitments(id),donated_at date NOT NULL,amount_minor bigint NOT NULL CHECK(amount_minor>0),currency text NOT NULL CHECK(currency='usd'),recipient_name text NOT NULL,period_start date NOT NULL,period_end date NOT NULL,file_name text NOT NULL,mime_type text NOT NULL CHECK(mime_type IN ('application/pdf','image/png','image/jpeg')),file_bytes bytea NOT NULL,redacted_confirmed boolean NOT NULL CHECK(redacted_confirmed),published boolean NOT NULL DEFAULT false,created_by text NOT NULL REFERENCES "user"(id),created_at timestamptz NOT NULL DEFAULT now(),CHECK(octet_length(file_bytes)<=5242880),CHECK(period_end>period_start));
CREATE TABLE IF NOT EXISTS donation_reports(id text PRIMARY KEY,commitment_id text NOT NULL REFERENCES donation_commitments(id),period_start date NOT NULL,period_end date NOT NULL,cutoff_at timestamptz NOT NULL,snapshot jsonb NOT NULL,created_by text NOT NULL REFERENCES "user"(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(commitment_id,period_start),CHECK(period_end>period_start));
CREATE INDEX IF NOT EXISTS donation_receipts_commitment_idx ON donation_receipts(commitment_id,period_start,published);
