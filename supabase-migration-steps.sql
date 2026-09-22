-- 3C Live - 研修工程2〜8 用の追加スキーマ（実行は任意）
-- 既存の rooms / notes / participants は一切変更しません（3C分析はそのまま動きます）。
-- Supabase Console → SQL Editor → New query → 貼り付け → Run
--
-- 実行しなくても工程2〜8 は動きます（その場合は既存テーブルの「隠し部屋」に保存 = legacy モード）。
-- このスクリプトは何度実行しても安全です。実行すると:
--   1. step_notes / step_data テーブルを作成（無ければ）
--   2. legacy モードで隠し部屋に溜まっていたデータを新テーブルにコピー（再実行で再コピー・上書き）
--
--   step_notes : 工程2〜8 で参加者が貼る付箋（工程番号つき）
--   step_data  : 各工程の AI 結果・決定事項・現在の工程番号などの保存先

-- ============================================================
-- Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS public.step_notes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code        TEXT NOT NULL REFERENCES public.rooms(code) ON DELETE CASCADE,
  step             SMALLINT NOT NULL CHECK (step BETWEEN 2 AND 8),
  category         TEXT NOT NULL CHECK (char_length(category) BETWEEN 1 AND 32),
  sub              TEXT NOT NULL CHECK (char_length(sub) BETWEEN 1 AND 32),
  text             TEXT NOT NULL CHECK (char_length(text) BETWEEN 1 AND 200),
  author_name      TEXT NOT NULL,
  author_client_id TEXT NOT NULL,
  created_at       BIGINT NOT NULL,
  updated_at       BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS step_notes_room_step_created_idx
  ON public.step_notes(room_code, step, created_at);

-- key の例: 'result'（AI の出力全文）, 'decision'（ファシリテータが確定した内容）
-- step = 0, key = 'current_step' は「参加者に配信中の工程番号」
CREATE TABLE IF NOT EXISTS public.step_data (
  room_code   TEXT NOT NULL REFERENCES public.rooms(code) ON DELETE CASCADE,
  step        SMALLINT NOT NULL CHECK (step BETWEEN 0 AND 8),
  key         TEXT NOT NULL CHECK (char_length(key) BETWEEN 1 AND 32),
  content     TEXT NOT NULL DEFAULT '' CHECK (char_length(content) <= 20000),
  updated_at  BIGINT NOT NULL,
  updated_by  TEXT,
  PRIMARY KEY (room_code, step, key)
);

-- ============================================================
-- Row Level Security（既存テーブルと同じ方針: アプリ層で制御）
-- ============================================================

ALTER TABLE public.step_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.step_data  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "step_notes_all" ON public.step_notes;
DROP POLICY IF EXISTS "step_data_all"  ON public.step_data;

CREATE POLICY "step_notes_all" ON public.step_notes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "step_data_all"  ON public.step_data  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- Realtime
-- ============================================================
-- DELETE / UPDATE の差分を全ブラウザに届けるため REPLICA IDENTITY FULL にする
ALTER TABLE public.step_notes REPLICA IDENTITY FULL;
ALTER TABLE public.step_data  REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.step_notes;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.step_data;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- legacy モードのデータを新テーブルへコピー
-- ============================================================
-- legacy モードでは、親セッション XXXXXX ごとに title = '§steps:XXXXXX' の隠し部屋
-- （status = archived）を作り、付箋は notes（sub = '工程|列|テーマ'）、
-- AI 結果・決定事項・配信中の工程は memo（JSON）に保存しています。

INSERT INTO public.step_notes
  (id, room_code, step, category, sub, text, author_name, author_client_id, created_at, updated_at)
SELECT
  n.id,
  right(r.title, 6),                                             -- '§steps:XXXXXX' の末尾6文字 = 親コード
  substring(n.sub from '^([2-8])\|')::smallint,
  substring(n.sub from '^[2-8]\|([^|]+)\|'),
  substring(n.sub from '^[2-8]\|[^|]+\|(.*)$'),
  n.text, n.author_name, n.author_client_id, n.created_at, n.updated_at
FROM public.notes n
JOIN public.rooms r ON r.code = n.room_code
WHERE r.title LIKE '§steps:%'
  AND n.sub ~ '^[2-8]\|[^|]+\|.+$'
  AND EXISTS (SELECT 1 FROM public.rooms p WHERE p.code = right(r.title, 6))
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.step_data (room_code, step, key, content, updated_at, updated_by)
SELECT
  right(r.title, 6),
  split_part(kv.key, ':', 1)::smallint,
  split_part(kv.key, ':', 2),
  coalesce(kv.value->>'content', ''),
  coalesce((kv.value->>'updatedAt')::bigint, r.created_at),
  kv.value->>'updatedBy'
FROM public.rooms r
CROSS JOIN LATERAL jsonb_each(r.memo::jsonb) AS kv
WHERE r.title LIKE '§steps:%'
  AND r.memo IS NOT NULL AND left(r.memo, 1) = '{'
  AND kv.key ~ '^[0-8]:[A-Za-z_]{1,32}$'
  AND jsonb_typeof(kv.value) = 'object'
  AND EXISTS (SELECT 1 FROM public.rooms p WHERE p.code = right(r.title, 6))
ON CONFLICT (room_code, step, key) DO UPDATE
  SET content = EXCLUDED.content, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;
