-- ============================================================
-- bet_tickets_setup.sql
-- 建立 bet_tickets 資料表並匯入 bet-full.html 原站注單資料（7筆）
-- 在 Supabase Dashboard → SQL Editor 執行此檔案
-- ============================================================

CREATE TABLE IF NOT EXISTS public.bet_tickets (
  id                     uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_no              text NOT NULL,
  created_at             timestamptz NOT NULL,
  account_name           text,
  bet_type               text,
  sport                  text,
  match_session          text DEFAULT '全場早餐',
  away_team              text,
  away_score             integer,
  home_team              text,
  home_score             integer,
  bet_choice             text,
  commence_time          text,
  settle_time            text,
  outcome                text,
  bet_amount             numeric NOT NULL DEFAULT 0,
  valid_bet              numeric NOT NULL DEFAULT 0,
  member_result          numeric NOT NULL DEFAULT 0,
  agent_result           numeric NOT NULL DEFAULT 0,
  super_agent_result     numeric NOT NULL DEFAULT 0,
  shareholder_result     numeric NOT NULL DEFAULT 0,
  big_shareholder_result numeric NOT NULL DEFAULT 0,
  director_result        numeric NOT NULL DEFAULT 0,
  big_director_result    numeric NOT NULL DEFAULT 0,
  rate_scheme            text
);

-- RLS
ALTER TABLE public.bet_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select" ON public.bet_tickets;
DROP POLICY IF EXISTS "anon_all"    ON public.bet_tickets;

CREATE POLICY "anon_select" ON public.bet_tickets FOR SELECT USING (true);
CREATE POLICY "anon_all"    ON public.bet_tickets FOR ALL    USING (true);

-- ============================================================
-- 匯入原站 7 筆注單（解析自 bet-full.html）
-- ============================================================
INSERT INTO public.bet_tickets
  (ticket_no, created_at, account_name, bet_type, sport,
   away_team, away_score, home_team, home_score,
   bet_choice, commence_time, settle_time, outcome,
   bet_amount, valid_bet,
   member_result, agent_result, super_agent_result,
   shareholder_result, big_shareholder_result,
   director_result, big_director_result,
   rate_scheme)
VALUES
  -- 1. 紐約洋基 v 多倫多藍鳥 → 全贏
  ('140852196', '2026-06-14T11:59:29+08:00', 'k116537-3', '台盤讓分', 'baseball_mlb',
   '紐約洋基', 8, '多倫多藍鳥', 3,
   '紐約洋基 -1+35@0.95', '2026-06-15 01:37', '2026-06-15 05:03', '全贏',
   2000, 2000,
   1900, 1932, 96, 96, 96, 96, 57,
   '0/95/95/95/95/97'),

  -- 2. 西雅圖水手 v 華盛頓國民 → 全輸
  ('140851473', '2026-06-14T11:58:28+08:00', 'k116537-3', '台盤讓分', 'baseball_mlb',
   '西雅圖水手', 1, '華盛頓國民', 10,
   '西雅圖水手 -1-10@0.95', '2026-06-15 01:35', '2026-06-15 03:57', '全輸',
   2000, 2000,
   -2000, -1968, -98, -98, -98, -98, -59,
   '0/95/95/95/95/97'),

  -- 3. 邁阿密馬林魚 v 匹茲堡海盜 → 全輸
  ('140839286', '2026-06-14T11:35:18+08:00', 'k117063-5', '台盤讓分', 'baseball_mlb',
   '邁阿密馬林魚', 4, '匹茲堡海盜', 2,
   '匹茲堡海盜(主) -1@0.95', '2026-06-15 00:15', '2026-06-15 03:24', '全輸',
   2000, 2000,
   -2000, -1968, -1968, -1968, -98, -98, -59,
   '0/0/0/95/95/97'),

  -- 4. 亞特蘭大勇士 v 紐約大都會 → 全贏
  ('140839002', '2026-06-14T11:34:45+08:00', 'k117063-5', '台盤讓分', 'baseball_mlb',
   '亞特蘭大勇士', 1, '紐約大都會', 8,
   '紐約大都會(主) -1+85@0.95', '2026-06-15 01:40', '2026-06-15 04:39', '全贏',
   2000, 2000,
   1900, 1932, 1932, 1932, 96, 96, 57,
   '0/0/0/95/95/97'),

  -- 5. 休士頓太空人 v 堪薩斯皇家 → 全贏
  ('140838852', '2026-06-14T11:34:22+08:00', 'k117063-5', '台盤讓分', 'baseball_mlb',
   '休士頓太空人', 0, '堪薩斯皇家', 4,
   '堪薩斯皇家(主) -1+70@0.95', '2026-06-15 02:10', '2026-06-15 04:41', '全贏',
   2000, 2000,
   1900, 1932, 1932, 1932, 96, 96, 57,
   '0/0/0/95/95/97'),

  -- 6. 費城費城人 v 密爾瓦基釀酒人 → 全輸
  ('140838795', '2026-06-14T11:34:16+08:00', 'k117063-5', '台盤讓分', 'baseball_mlb',
   '費城費城人', 0, '密爾瓦基釀酒人', 4,
   '費城費城人 -1+75@0.95', '2026-06-15 02:10', '2026-06-15 04:54', '全輸',
   2000, 2000,
   -2000, -1968, -1968, -1968, -98, -98, -59,
   '0/0/0/95/95/97'),

  -- 7. 德州遊騎兵 v 波士頓紅襪 → 全輸
  ('140838727', '2026-06-14T11:34:08+08:00', 'k117063-5', '台盤讓分', 'baseball_mlb',
   '德州遊騎兵', 6, '波士頓紅襪', 4,
   '波士頓紅襪(主) -1+95@0.95', '2026-06-15 07:20', '2026-06-15 10:17', '全輸',
   2000, 2000,
   -2000, -1968, -1968, -1968, -98, -98, -59,
   '0/0/0/95/95/97');
