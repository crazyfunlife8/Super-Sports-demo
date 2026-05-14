# Supabase 設定文件

## 一、專案基本資訊

| 項目 | 值 |
|------|-----|
| Supabase Project URL | `https://igavhfxwfsuyksnzbvfx.supabase.co` |
| Anon Key（前端使用） | `sb_publishable_6RL5se3g_FgxZFAcfWoWPQ_SFoxBi67` |
| 使用功能 | Database、Realtime、Edge Functions |

---

## 二、資料表說明

### 1. `matches`（賽事主表）

儲存所有棒球賽事的基本資訊與賠率快照，由 Edge Function `sync-matches` 寫入，前端唯讀。

#### 建表 SQL

```sql
create table public.matches (
  match_id          text        primary key,
  sport             text        not null,
  home_team         text,
  away_team         text,
  commence_time     timestamptz,
  spread            jsonb,
  totals            jsonb,
  moneyline         jsonb,
  odd_even          jsonb,
  first_inning      jsonb,
  full_home_score   integer,
  full_away_score   integer,
  half_home_score   integer,
  half_away_score   integer,
  status            text        default 'upcoming',
  synced_at         timestamptz default now()
);
```

#### 欄位說明

| 欄位 | 型別 | 說明 |
|------|------|------|
| `match_id` | text | 賽事唯一識別碼（來自 SportsGameOdds `eventID`），主鍵 |
| `sport` | text | 球種：`baseball_mlb`、`baseball_cpbl`、`baseball_npb` |
| `home_team` | text | 主場隊伍中文名稱 |
| `away_team` | text | 客場隊伍中文名稱 |
| `commence_time` | timestamptz | 開賽時間（UTC） |
| `spread` | jsonb | 全場讓分盤口（見下方 JSON 結構） |
| `totals` | jsonb | 全場大小盤（見下方 JSON 結構） |
| `moneyline` | jsonb | 全場獨贏（見下方 JSON 結構） |
| `odd_even` | jsonb | 全場單雙（見下方 JSON 結構） |
| `first_inning` | jsonb | 半場（前5局）各盤口（見下方 JSON 結構） |
| `full_home_score` | integer | 全場主場得分（未結束為 null） |
| `full_away_score` | integer | 全場客場得分（未結束為 null） |
| `half_home_score` | integer | 半場主場得分（未結束為 null） |
| `half_away_score` | integer | 半場客場得分（未結束為 null） |
| `status` | text | 狀態：`upcoming`（未開賽）、`started`（進行中）、`completed`（已結束） |
| `synced_at` | timestamptz | 最後同步時間 |

#### JSONB 欄位結構

**`spread`（全場讓分）**
```json
{
  "home_line": "-1.5",
  "away_line": "+1.5",
  "home_odds": 0.85,
  "away_odds": 0.95,
  "home_book_odds": -120,
  "away_book_odds": 110
}
```
- `home_line` / `away_line`：讓分盤口（字串，帶正負號）
- `home_odds` / `away_odds`：香港賠率（歐式賠率 − 1）
- `home_book_odds` / `away_book_odds`：原始美式賠率，供 `fmtHandicap` 計算水錢差使用

**`totals`（全場大小）**
```json
{
  "line": "8.5",
  "over_odds": 0.90,
  "under_odds": 0.90
}
```

**`moneyline`（全場獨贏）**
```json
{
  "home_odds": 0.62,
  "away_odds": 1.28
}
```

**`odd_even`（全場單雙）**
```json
{
  "odd_odds": 0.90,
  "even_odds": 0.90
}
```

**`first_inning`（半場，前5局）**
```json
{
  "home_line": "-0.5",
  "away_line": "+0.5",
  "home_odds": 0.75,
  "away_odds": 0.95,
  "home_book_odds": -120,
  "away_book_odds": 110,
  "total_line": "4.5",
  "over_odds": 0.90,
  "under_odds": 0.90,
  "ml_home_odds": 0.65,
  "ml_away_odds": 1.25
}
```
- `home_line` / `away_line`：半場讓分盤口
- `total_line` / `over_odds` / `under_odds`：半場大小盤
- `ml_home_odds` / `ml_away_odds`：半場獨贏

---

### 2. `tickets_aggregate`（注單彙總表）

以「賽事 × 盤口類型 × 下注方向」為一列，記錄注數與注金加總，由前端編輯模式寫入。

#### 建表 SQL

```sql
create table public.tickets_aggregate (
  id            bigserial   primary key,
  match_id      text        not null,
  bet_type      text        not null,
  bet_position  text        not null,
  count         integer     default 0,
  total_amount  bigint      default 0,
  updated_at    timestamptz default now(),
  unique (match_id, bet_type, bet_position)
);
```

#### 欄位說明

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | bigserial | 自動遞增主鍵 |
| `match_id` | text | 對應 `matches.match_id` |
| `bet_type` | text | 盤口類型（見下方列舉） |
| `bet_position` | text | 下注方向（見下方列舉） |
| `count` | integer | 注數 |
| `total_amount` | bigint | 注金合計 |
| `updated_at` | timestamptz | 最後更新時間 |

#### `bet_type` × `bet_position` 組合列舉

| `bet_type` | `bet_position` | 說明 |
|------------|----------------|------|
| `handicap` | `home` / `away` | 全場讓分：主場 / 客場 |
| `totals` | `over` / `under` | 全場大小：大 / 小 |
| `moneyline` | `home` / `away` | 全場獨贏：主場 / 客場 |
| `odd_even` | `odd` / `even` | 全場單雙：單 / 雙 |
| `first_inning` | `home` / `away` | 半場讓分：主場 / 客場 |
| `half_totals` | `over` / `under` | 半場大小：大 / 小 |
| `half_moneyline` | `home` / `away` | 半場獨贏：主場 / 客場 |

---

### 3. `sites`（網站業績表）

儲存各子網站的投注業績數據，由前端編輯模式直接 CRUD，首頁報表頁讀取顯示。

#### 建表 SQL

```sql
create table public.sites (
  id                    bigserial   primary key,
  site_name             text        not null default '新網站',
  bet_count             integer     default 0,
  bet_amount            bigint      default 0,
  valid_bet             bigint      default 0,
  pending_amount        bigint      default 0,
  member_result         bigint      default 0,
  agent_result          bigint      default 0,
  super_agent_result    bigint      default 0,
  shareholder_result    bigint      default 0,
  big_shareholder_result bigint     default 0,
  director_result       bigint      default 0,
  big_director_result   bigint      default 0,
  remark                text        default '',
  rate_scheme           text        default '',
  display_date_from     date,
  display_date_to       date,
  created_at            timestamptz default now()
);
```

#### 欄位說明

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | bigserial | 自動遞增主鍵 |
| `site_name` | text | 網站名稱 |
| `bet_count` | integer | 總注數 |
| `bet_amount` | bigint | 總注金 |
| `valid_bet` | bigint | 有效投注額 |
| `pending_amount` | bigint | 待結算金額 |
| `member_result` | bigint | 會員結果（正數=輸，負數=贏） |
| `agent_result` | bigint | 代理結果 |
| `super_agent_result` | bigint | 總代結果 |
| `shareholder_result` | bigint | 股東結果 |
| `big_shareholder_result` | bigint | 大股東結果 |
| `director_result` | bigint | 總監結果 |
| `big_director_result` | bigint | 大總監結果 |
| `remark` | text | 備註 |
| `rate_scheme` | text | 費率方案說明 |
| `display_date_from` | date | 報表顯示起始日期 |
| `display_date_to` | date | 報表顯示結束日期 |
| `created_at` | timestamptz | 建立時間（排序依據） |

---

### 4. `display_settings`（顯示設定表）

以 key/value 格式儲存跑馬燈文字與頁首顯示資訊，支援 Realtime 即時同步至所有開啟的視窗。

#### 建表 SQL

```sql
create table public.display_settings (
  key        text        primary key,
  value      text        not null default '',
  updated_at timestamptz default now()
);
```

#### 欄位說明

| 欄位 | 型別 | 說明 |
|------|------|------|
| `key` | text | 設定識別碼，主鍵 |
| `value` | text | 設定值 |
| `updated_at` | timestamptz | 最後更新時間 |

#### 預設資料列

| `key` | 說明 | 範例 `value` |
|-------|------|-------------|
| `marquee_text` | 跑馬燈文字（多行以 `\n` 分隔） | `最新消息：今日賽事開放投注中...` |
| `header_username` | 頁首帳號名稱 | `示範帳號` |
| `header_role` | 頁首身份角色 | `管理員` |
| `header_credit` | 頁首額度顯示 | `1,000,000` |

---

## 三、Row Level Security（RLS）設定

前端使用 `anon` 金鑰存取，需對所有資料表開啟讀寫政策。建議設定如下：

```sql
-- matches（唯讀，由 Edge Function service role 寫入）
alter table public.matches enable row level security;
create policy "anon read matches" on public.matches
  for select using (true);

-- tickets_aggregate（可讀寫）
alter table public.tickets_aggregate enable row level security;
create policy "anon read tickets" on public.tickets_aggregate
  for select using (true);
create policy "anon write tickets" on public.tickets_aggregate
  for all using (true) with check (true);

-- sites（可讀寫）
alter table public.sites enable row level security;
create policy "anon read sites" on public.sites
  for select using (true);
create policy "anon write sites" on public.sites
  for all using (true) with check (true);

-- display_settings（可讀寫）
alter table public.display_settings enable row level security;
create policy "anon read display_settings" on public.display_settings
  for select using (true);
create policy "anon write display_settings" on public.display_settings
  for all using (true) with check (true);
```

> **注意**：以上政策適用於無後端驗證的展示平台。若日後需要身份驗證，需修改 `using` 條件加入 `auth.role() = 'authenticated'` 等限制。

---

## 四、Realtime 設定

### 啟用步驟

1. 進入 Supabase Dashboard → **Database** → **Replication**
2. 在 **Source** 區塊找到 `display_settings` 資料表
3. 確認 `INSERT`、`UPDATE`、`DELETE` 三個事件均已開啟（打勾）

### 訂閱說明

| Channel 名稱 | 監聽表格 | 事件 | 用途 |
|-------------|----------|------|------|
| `display-settings-all` | `display_settings` | `*`（INSERT / UPDATE / DELETE） | 跑馬燈文字、頁首帳號/角色/額度的即時同步 |

### 前端訂閱程式碼位置

`js/edit.js` — `init()` 函式內：

```javascript
_supabase.channel('display-settings-all')
  .on('postgres_changes',
    { event: '*', schema: 'public', table: 'display_settings' },
    function (payload) {
      const row = payload.new;
      if (row?.key && row?.value) {
        self.applyDisplaySetting(row.key, row.value);
        localStorage.setItem(row.key, row.value);
      }
    }
  )
  .subscribe();
```

> `sites`、`matches`、`tickets_aggregate` 三張表目前不使用 Realtime，資料更新後由前端手動呼叫 `Refresh()` 或等待11秒自動更新。

---

## 五、Edge Function 設定

### `sync-matches`

| 項目 | 說明 |
|------|------|
| 路徑 | `supabase/functions/sync-matches/index.ts` |
| 觸發方式 | 前端編輯模式「立刻同步 API」按鈕（HTTP POST），或外部排程（見排程說明文件） |
| 功能 | 從 SportsGameOdds API 拉取 MLB 賽事，upsert 至 `matches` 表 |

#### 必要環境變數

在 Supabase Dashboard → **Edge Functions** → **sync-matches** → **Secrets** 設定：

| 變數名稱 | 說明 | 範例 |
|---------|------|------|
| `SPORTSGAMEODDS_API_KEY` | SportsGameOdds API 金鑰 | `your_api_key_here` |
| `SUPABASE_URL` | 自動注入，無需手動設定 | — |
| `SUPABASE_SERVICE_ROLE_KEY` | 自動注入，無需手動設定 | — |

#### 部署指令

```bash
supabase functions deploy sync-matches
```

#### 拉取範圍

| 類型 | API 參數 | 範圍 |
|------|---------|------|
| 未結束賽事（upcoming + started） | `finalized=false` | 全部，limit 50 |
| 已結束賽事（含比分） | `finalized=true` | 近 2 天，limit 50 |

去重規則：同一 `eventID` 以 finalized 版本為準（finalized 版本含比分資料）。
