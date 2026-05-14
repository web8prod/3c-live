-- 3C Live - Supabase schema
-- Run this ONCE in Supabase Console → SQL Editor → New query → paste → Run.
--
-- Creates tables, Row Level Security policies, and enables Realtime broadcast
-- so all browsers see live updates instantly.

-- ============================================================
-- Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS public.rooms (
  code         TEXT PRIMARY KEY CHECK (code ~ '^[A-Z0-9]{6}$'),
  title        TEXT NOT NULL,
  scheduled_at BIGINT,
  host_name    TEXT,
  memo         TEXT,
  status       TEXT NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active','scheduled','ended','archived')),
  host_token   TEXT NOT NULL CHECK (char_length(host_token) >= 16),
  created_at   BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.notes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code        TEXT NOT NULL REFERENCES public.rooms(code) ON DELETE CASCADE,
  category         TEXT NOT NULL CHECK (category IN ('customer','competitor','company')),
  sub              TEXT NOT NULL CHECK (char_length(sub) BETWEEN 1 AND 32),
  text             TEXT NOT NULL CHECK (char_length(text) BETWEEN 1 AND 200),
  author_name      TEXT NOT NULL,
  author_client_id TEXT NOT NULL,
  created_at       BIGINT NOT NULL,
  updated_at       BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS notes_room_cat_created_idx
  ON public.notes(room_code, category, created_at);

CREATE TABLE IF NOT EXISTS public.participants (
  room_code    TEXT NOT NULL REFERENCES public.rooms(code) ON DELETE CASCADE,
  client_id    TEXT NOT NULL,
  name         TEXT NOT NULL,
  joined_at    BIGINT NOT NULL,
  last_seen_at BIGINT NOT NULL,
  PRIMARY KEY (room_code, client_id)
);

-- ============================================================
-- Row Level Security
-- ============================================================
--
-- This app uses a permissive read/write policy via the anon key.
-- The actual access control is in the app layer:
--   - Admin UI requires a client-side password (auth-guard.js).
--   - Room mutations require a hostToken stored in the creator's browser.
--
-- For a higher-security setup you can later swap these for stricter
-- policies (e.g. require Postgres role checks).

ALTER TABLE public.rooms        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rooms_all" ON public.rooms;
DROP POLICY IF EXISTS "notes_all" ON public.notes;
DROP POLICY IF EXISTS "parts_all" ON public.participants;

CREATE POLICY "rooms_all" ON public.rooms        FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "notes_all" ON public.notes        FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "parts_all" ON public.participants FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- Realtime broadcasting
-- ============================================================
-- Tell Supabase to publish changes on these tables over the Realtime
-- WebSocket channel so all browsers receive instant updates.

ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.participants;
