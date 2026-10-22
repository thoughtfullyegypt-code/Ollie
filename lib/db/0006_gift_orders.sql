ALTER TABLE orders ADD COLUMN IF NOT EXISTS gift_id text REFERENCES gifts(id);
CREATE INDEX IF NOT EXISTS orders_gift_idx ON orders(gift_id);
