-- 在 Supabase Dashboard → SQL Editor 執行
-- 為 matches 表新增 listcode 欄位（台灣運彩賽事編號，用於查詢結果）
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS listcode TEXT;
