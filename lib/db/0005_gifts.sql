CREATE TABLE gifts (
 id text PRIMARY KEY,
 sender_id text NOT NULL REFERENCES "user"(id),
 order_id text REFERENCES orders(id),
 sender_seat_id integer REFERENCES seats(id),
 recipient_seat_id integer REFERENCES seats(id),
 source_seat_id integer REFERENCES seats(id),
 occasion text NOT NULL CHECK(occasion IN ('birthday','congratulations','thank-you','miss-you','just-because')),
 sender_name text NOT NULL CHECK(char_length(sender_name) BETWEEN 1 AND 30),
 recipient_name text NOT NULL CHECK(char_length(recipient_name) BETWEEN 1 AND 30),
 private_message text NOT NULL CHECK(char_length(private_message) BETWEEN 1 AND 1000),
 sender_customization jsonb NOT NULL,
 recipient_customization jsonb NOT NULL,
 dish text NOT NULL,
 prop text NOT NULL CHECK(prop IN ('cake','banner','flowers','wave','bread-heart')),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','awaiting_payment','ready','revoked','unavailable')),
 package_id text CHECK(package_id IN ('one','two')),
 token_hash text UNIQUE,
 link_created_at timestamptz,
 thank_you_at timestamptz,
 first_read_at timestamptz,
 claimed_by text REFERENCES "user"(id),
 claimed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(sender_seat_id IS NULL OR recipient_seat_id IS NULL OR sender_seat_id<>recipient_seat_id),
 CHECK((claimed_by IS NULL)=(claimed_at IS NULL))
);
CREATE INDEX gifts_sender_created_idx ON gifts(sender_id,created_at DESC);
CREATE INDEX gifts_order_idx ON gifts(order_id);
CREATE INDEX gifts_seat_lifecycle_idx ON gifts(sender_seat_id,recipient_seat_id,status);
CREATE UNIQUE INDEX gifts_active_recipient_idx ON gifts(recipient_seat_id) WHERE status IN ('ready','awaiting_payment');
CREATE TABLE gift_claim_intents(
 id text PRIMARY KEY,gift_id text NOT NULL REFERENCES gifts(id) ON DELETE CASCADE,user_id text NOT NULL REFERENCES "user"(id),token_hash text NOT NULL UNIQUE,expires_at timestamptz NOT NULL,consumed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX gift_claim_intents_gift_idx ON gift_claim_intents(gift_id,user_id,expires_at);
CREATE TABLE gift_rate_buckets(key text PRIMARY KEY,count integer NOT NULL CHECK(count>0),expires_at timestamptz NOT NULL);
