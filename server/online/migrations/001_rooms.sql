CREATE TABLE IF NOT EXISTS draft_rooms (
  id text PRIMARY KEY,
  host_session text NOT NULL,
  guest_session text,
  host_name text NOT NULL,
  guest_name text,
  category_id text NOT NULL,
  creation_key uuid NOT NULL,
  invite_digest text,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  expires_at_ms double precision NOT NULL,
  vote_expires_at_ms double precision,
  p1_vote text CHECK (p1_vote IN ('p1', 'p2', 'tie')),
  p2_vote text CHECK (p2_vote IN ('p1', 'p2', 'tie')),
  draft jsonb,
  UNIQUE (host_session, creation_key),
  CHECK ((guest_session IS NULL) = (guest_name IS NULL)),
  CHECK (guest_session IS NULL OR guest_session <> host_session),
  CHECK (guest_session IS NULL OR invite_digest IS NULL)
);

CREATE INDEX IF NOT EXISTS draft_rooms_expiry ON draft_rooms (expires_at_ms);

CREATE TABLE IF NOT EXISTS draft_requests (
  room_id text NOT NULL REFERENCES draft_rooms(id) ON DELETE CASCADE,
  seat text NOT NULL CHECK (seat IN ('p1', 'p2')),
  request_id uuid NOT NULL,
  fingerprint text NOT NULL,
  PRIMARY KEY (room_id, seat, request_id)
);

CREATE TABLE IF NOT EXISTS draft_rate_buckets (
  subject text NOT NULL,
  operation text NOT NULL,
  window_start_ms double precision NOT NULL,
  attempts integer NOT NULL DEFAULT 1,
  PRIMARY KEY (subject, operation, window_start_ms)
);

CREATE INDEX IF NOT EXISTS draft_rate_expiry ON draft_rate_buckets (window_start_ms);
