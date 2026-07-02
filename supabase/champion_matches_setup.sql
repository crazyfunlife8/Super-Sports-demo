-- ============================================================
-- champion_matches_setup.sql
-- 建立冠軍聯賽賽事資料表（由業主手動填入）
-- 在 Supabase Dashboard → SQL Editor 執行此檔案
-- ============================================================

CREATE TABLE IF NOT EXISTS public.champion_matches (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id      text        UNIQUE NOT NULL,
  home_team     text        DEFAULT '',
  away_team     text        DEFAULT '',
  commence_time text        DEFAULT '',
  spread        jsonb       DEFAULT '{"home_line":"","away_line":"","home_odds":0,"away_odds":0}'::jsonb,
  totals        jsonb       DEFAULT '{"line":"","over_odds":0,"under_odds":0}'::jsonb,
  moneyline     jsonb       DEFAULT '{"home_odds":0,"away_odds":0}'::jsonb,
  odd_even      jsonb       DEFAULT '{"odd_odds":0,"even_odds":0}'::jsonb,
  first_inning  jsonb       DEFAULT '{"home_line":"","away_line":"","home_odds":0,"away_odds":0,"total_line":"","over_odds":0,"under_odds":0,"ml_home_odds":0,"ml_away_odds":0}'::jsonb,
  display_order integer     DEFAULT 0,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

ALTER TABLE public.champion_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_all" ON public.champion_matches;
CREATE POLICY "anon_all" ON public.champion_matches
  FOR ALL USING (true) WITH CHECK (true);
