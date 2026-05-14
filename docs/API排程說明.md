# API 排程說明

## 一、API 服務資訊

| 項目 | 說明 |
|------|------|
| 服務商 | SportsGameOdds（https://sportsgameodds.com） |
| API 版本 | v2 |
| Base URL | `https://api.sportsgameodds.com/v2/` |
| 認證方式 | Query string 帶入 `apiKey` |
| 目前授權球種 | MLB（免費方案）；NPB、CPBL 升級後可加入 |

---

## 二、實際使用的 API 端點

### 端點：`GET /v2/events/`

本專案所有同步均使用此單一端點，依參數不同拉取不同類型資料。

#### 呼叫 A：未結束賽事（盤口資料）

```
GET https://api.sportsgameodds.com/v2/events/?apiKey={KEY}&leagueID=MLB&limit=50&finalized=false
```

| 參數 | 值 | 說明 |
|------|----|------|
| `apiKey` | `{SPORTSGAMEODDS_API_KEY}` | API 金鑰 |
| `leagueID` | `MLB` | 聯賽代碼 |
| `limit` | `50` | 最多回傳筆數 |
| `finalized` | `false` | 只拉未結束賽事（upcoming + started） |

**回傳資料用途：** 盤口資訊（spread / totals / moneyline / odd_even / first_inning）、開賽時間、隊伍名稱、賽事狀態。

#### 呼叫 B：近期已結束賽事（比分資料）

```
GET https://api.sportsgameodds.com/v2/events/?apiKey={KEY}&leagueID=MLB&limit=50&finalized=true&startsAfter={2_DAYS_AGO}
```

| 參數 | 值 | 說明 |
|------|----|------|
| `apiKey` | `{SPORTSGAMEODDS_API_KEY}` | API 金鑰 |
| `leagueID` | `MLB` | 聯賽代碼 |
| `limit` | `50` | 最多回傳筆數 |
| `finalized` | `true` | 只拉已結束賽事（含比分） |
| `startsAfter` | 2 天前日期，格式 `YYYY-MM-DD` | 限縮範圍，避免拉取過多歷史資料 |

**回傳資料用途：** 全場比分（`full_home_score` / `full_away_score`）、半場比分（前5局加總）。

---

## 三、同步邏輯流程

```
每次同步觸發
    │
    ├── 呼叫 A（finalized=false）─ 取得未結束賽事
    │
    ├── 呼叫 B（finalized=true, startsAfter=2天前）─ 取得近期已結束賽事
    │
    ├── 去重合併：同一 eventID 以 finalized 版本覆蓋 active 版本
    │
    ├── 資料轉換
    │     ├── eventID       → match_id
    │     ├── teamID        → 中文隊名（TEAM_NAMES_CN 對照表）
    │     ├── 美式賠率       → 香港賠率（÷100 或 100÷絕對值）
    │     ├── 1h periodID  → first_inning.{total_line, over_odds, ml_home_odds ...}
    │     └── results.game / results.1i~5i → 比分欄位
    │
    └── Upsert 至 matches 表（on conflict: match_id）
```

---

## 四、排程建議

### 方案一：Supabase pg_cron（推薦）

Supabase 付費方案支援 `pg_cron` 擴充，可在資料庫層直接呼叫 Edge Function。

```sql
-- 開啟 pg_cron 擴充（在 Supabase Dashboard > Extensions 啟用）
select cron.schedule(
  'sync-matches-every-10-min',
  '*/10 * * * *',                          -- 每 10 分鐘一次
  $$
  select net.http_post(
    url    := 'https://igavhfxwfsuyksnzbvfx.supabase.co/functions/v1/sync-matches',
    headers := '{"Authorization": "Bearer <SERVICE_ROLE_KEY>"}'::jsonb
  );
  $$
);
```

> 將 `<SERVICE_ROLE_KEY>` 替換為 Supabase 專案的 Service Role Key（Dashboard → Settings → API）。

### 方案二：GitHub Actions（免費）

若無付費方案，可用 GitHub Actions 免費 cron 排程呼叫 Edge Function。

```yaml
# .github/workflows/sync-matches.yml
name: Sync Matches

on:
  schedule:
    - cron: '*/15 * * * *'   # 每 15 分鐘
  workflow_dispatch:           # 允許手動觸發

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Call sync-matches Edge Function
        run: |
          curl -X POST \
            "https://igavhfxwfsuyksnzbvfx.supabase.co/functions/v1/sync-matches" \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}" \
            -H "Content-Type: application/json"
```

在 GitHub Repository → Settings → Secrets 新增：
- `SUPABASE_SERVICE_ROLE_KEY`：Supabase 專案的 Service Role Key

### 方案三：手動觸發（展示用途）

進入任一頁面的編輯模式（URL 加上 `?edit=true`），點擊右側「立刻同步 API」按鈕，即可手動觸發一次同步。

---

## 五、排程頻率建議

| 使用情境 | 建議頻率 | 說明 |
|---------|---------|------|
| 賽前（開賽 3 小時前） | 每 30 分鐘 | 盤口線變動較慢 |
| 賽中（進行中） | 每 5～10 分鐘 | 即時更新比分與狀態 |
| 賽後（結束後） | 每 30 分鐘（持續 2 小時） | 確保比分寫入後同步到位 |
| 無賽期 | 每小時 1 次 | 節省 API 配額 |

> **API 配額注意：** 免費方案每月有請求次數上限，建議以 15～30 分鐘為基本排程間隔，MLB 球季（4 月～10 月）賽中時段可縮短至 10 分鐘。

---

## 六、回傳資料欄位對應

| SportsGameOdds 欄位 | 轉換方式 | `matches` 欄位 |
|--------------------|---------|---------------|
| `event.eventID` | 字串化 | `match_id` |
| `event.teams.home.teamID` | 查 TEAM_NAMES_CN 中文對照表 | `home_team` |
| `event.teams.away.teamID` | 查 TEAM_NAMES_CN 中文對照表 | `away_team` |
| `event.status.startsAt` | 字串化 | `commence_time` |
| `event.status.completed` | true → `completed`，started → `started`，其餘 → `upcoming` | `status` |
| `odds[betTypeID=sp, sideID=home, periodID=game].bookSpread` | 字串化 | `spread.home_line` |
| `odds[betTypeID=sp, sideID=home, periodID=game].bookOdds` | toHKOdds() | `spread.home_odds` |
| `odds[betTypeID=ou, sideID=over, periodID=game].bookOverUnder` | 字串化 | `totals.line` |
| `odds[betTypeID=ou, sideID=over, periodID=game].bookOdds` | toHKOdds() | `totals.over_odds` |
| `odds[betTypeID=ml, sideID=home, periodID=game].bookOdds` | toHKOdds() | `moneyline.home_odds` |
| `odds[betTypeID=eo, sideID=even, periodID=game].bookOdds` | toHKOdds() | `odd_even.even_odds` |
| `odds[betTypeID=sp, sideID=home, periodID=1h].bookSpread` | 字串化 | `first_inning.home_line` |
| `odds[betTypeID=ou, sideID=over, periodID=1h].bookOverUnder` | 字串化 | `first_inning.total_line` |
| `odds[betTypeID=ml, sideID=home, periodID=1h].bookOdds` | toHKOdds() | `first_inning.ml_home_odds` |
| `results.game.home.points` | 直接取值 | `full_home_score` |
| `results.game.away.points` | 直接取值 | `full_away_score` |
| `results['1i'~'5i'].home.points` 加總 | 累加 | `half_home_score` |
| `results['1i'~'5i'].away.points` 加總 | 累加 | `half_away_score` |

#### `toHKOdds()` 換算公式

```
美式賠率為正（+110）：香港賠率 = 110 ÷ 100 = 1.10
美式賠率為負（-120）：香港賠率 = 100 ÷ 120 = 0.833
```
（四捨五入至小數點後 3 位）

---

## 七、升級啟用 NPB / CPBL 步驟

當 SportsGameOdds 帳號升級後，在 `supabase/functions/sync-matches/index.ts` 中：

```typescript
// 第 230 行，修改為：
const leagues = ['MLB', 'NPB', 'CPBL'];
```

同時補齊 `TEAM_NAMES_CN` 對照表中 NPB 與 CPBL 的隊伍中文名稱（目前有佔位 comment）。
