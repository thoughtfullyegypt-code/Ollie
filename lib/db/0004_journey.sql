ALTER TABLE orders ADD COLUMN IF NOT EXISTS attribution jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS guest_kind text NOT NULL DEFAULT 'purchased' CHECK (guest_kind IN ('purchased','complimentary','demo'));
UPDATE profiles p SET guest_kind=CASE WHEN p.is_demo OR o.is_demo OR o.provider='development' THEN 'demo' WHEN o.provider='seed' THEN 'complimentary' ELSE 'purchased' END FROM seats s JOIN orders o ON o.id=s.order_id WHERE p.seat_id=s.id;
CREATE INDEX IF NOT EXISTS profiles_guest_kind_idx ON profiles(guest_kind,visibility,seat_id);
CREATE TABLE IF NOT EXISTS analytics_events (
 id text PRIMARY KEY,
 event_key text NOT NULL UNIQUE,
 name text NOT NULL CHECK(name IN ('main_cta_clicked','builder_opened','customization_completed','seat_selected','package_selected','checkout_started','order_fulfilled','invitation_created','invitation_link_opened','paid_group_seat_claimed','referred_purchase_fulfilled','share_action_invoked')),
 source text NOT NULL CHECK(source IN ('client','server')),
 order_key text,
 invitation_key text,
 properties jsonb NOT NULL DEFAULT '{}'::jsonb,
 attribution jsonb NOT NULL DEFAULT '{}'::jsonb,
 is_development boolean NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analytics_events_name_created_idx ON analytics_events(name,created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_origin_created_idx ON analytics_events(source,created_at);
CREATE TABLE IF NOT EXISTS analytics_rate_buckets (
 key text PRIMARY KEY,
 count integer NOT NULL CHECK(count>0),
 expires_at timestamptz NOT NULL
);
