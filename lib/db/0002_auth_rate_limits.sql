-- Standard schema used by Better Auth's maintained database rate limiter.
-- The unique key and conditional increments enforce limits across app instances.
CREATE TABLE IF NOT EXISTS "rateLimit" (
  id text PRIMARY KEY,
  key text UNIQUE NOT NULL,
  count integer NOT NULL CHECK(count >= 0),
  "lastRequest" bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_rate_limit_expiry_idx ON "rateLimit"("lastRequest");
