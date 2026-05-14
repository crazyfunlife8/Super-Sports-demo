# SportsGameOdds API 回傳資料說明

> 版本：v2  
> 文件日期：2026-05-13  
> 官方文件：https://sportsgameodds.com/docs

---

## 端點

```
GET https://api.sportsgameodds.com/v2/events/
```

### 常用參數

| 參數 | 說明 | 範例 |
|------|------|------|
| `apiKey` | API 金鑰（環境變數） | — |
| `leagueID` | 聯賽代碼 | `MLB` |
| `limit` | 筆數上限 | `50` |
| `finalized` | `false`=未結束，`true`=已結束 | `false` |
| `startsAfter` | 開賽日期下限（ISO 日期） | `2026-05-06` |

---

## 回傳結構

```jsonc
{
  "data": [ <Event>, <Event>, ... ]
}
```

---

## Event 物件

```jsonc
{
  "eventID": "NNgrOHqHen5ANswJiiog",   // 賽事唯一 ID（非數字字串）
  "status": {
    "startsAt":  "2026-05-08T03:40:00Z", // 開賽時間（UTC ISO 8601）
    "started":   false,                  // true = 比賽進行中
    "completed": false                   // true = 比賽已結束
  },
  "teams": {
    "home": {
      "teamID": "LOS_ANGELES_DODGERS_MLB",
      "names":  { "long": "Los Angeles Dodgers", "short": "Dodgers" }
    },
    "away": {
      "teamID": "SAN_FRANCISCO_GIANTS_MLB",
      "names":  { "long": "San Francisco Giants", "short": "Giants" }
    }
  },
  "odds":    { <oddsKey>: <OddsEntry>, ... },   // 見下方
  "results": { <periodID>: <ResultEntry>, ... } // 見下方（比賽結束後才有值）
}
```

---

## odds 欄位

每個 `OddsEntry` 的格式：

```jsonc
{
  "oddID":          "points-home-game-sp-home", // {statID}-{entityID}-{periodID}-{betTypeID}-{sideID}
  "betTypeID":      "sp",        // 投注類型（見下表）
  "sideID":         "home",      // 方向（見下表）
  "periodID":       "game",      // 盤口期間（見下表）
  "bookSpread":     -1.5,        // 讓分盤口值（sp 類型才有）⚠️ 不是 spread
  "bookOverUnder":  8.5,         // 大小盤線（ou 類型才有）⚠️ 不是 overUnder
  "bookOdds":       -110,        // 美式賠率（正負整數）
  "fairSpread":     -1.5,        // 無水錢讓分值（參考用）
  "fairOverUnder":  8.5,         // 無水錢大小盤線（參考用）
  "fairOdds":       -105         // 無水錢賠率（參考用）
}
```

> ⚠️ **常見陷阱**：盤口線欄位是 `bookSpread` / `bookOverUnder`，**不是** `spread` / `overUnder`。

### betTypeID 對應

| betTypeID | 說明 |
|-----------|------|
| `sp` | 讓分（Run Line / Spread） |
| `ou` | 大小盤（Over/Under） |
| `ml` | 獨贏（Moneyline） |
| `eo` | 單雙（Even/Odd） |

### sideID 對應

| sideID | 說明 |
|--------|------|
| `home` | 主隊 |
| `away` | 客隊 |
| `over` | 大（ou 用） |
| `under` | 小（ou 用） |
| `even` | 雙（eo 用） |
| `odd` | 單（eo 用） |

### periodID 對應

| periodID | 說明 |
|----------|------|
| `game` | 全場 |
| `1h` | 前半場（棒球：前 5 局） |
| `1i`～`9i` | 各局（棒球） |

---

## results 欄位（比賽結束後）

```jsonc
"results": {
  "game": {                       // 全場
    "home": { "points": 5 },     // 主隊得分（棒球＝安打得分）
    "away": { "points": 3 }
  },
  "1i": { "home": { "points": 0 }, "away": { "points": 2 } }, // 第1局
  "2i": { "home": { "points": 1 }, "away": { "points": 0 } }, // 第2局
  // ...以此類推
}
```

> 半場分數（前5局）需自行加總 `1i`～`5i` 的 `points`。

---

## 賠率換算

### 美式賠率 → 港式賠率（每押 1 元的純獲利）

```
正數（+125）：  125 / 100 = 1.25
負數（-110）：  100 / 110 ≈ 0.91
```

> 港式賠率 = 歐式小數賠率 − 1

### 對應欄位（存入 matches 表）

| matches 欄位 | 來源 |
|-------------|------|
| `spread.home_odds` | `bookOdds(sp, home, game)` → 港式 |
| `spread.home_book_odds` | `bookOdds(sp, home, game)` 原始美式 |
| `spread.home_line` | `spread(sp, home, game)` |
| `totals.over_odds` | `bookOdds(ou, over, game)` → 港式 |
| `totals.line` | `overUnder(ou, over, game)` |
| `moneyline.home_odds` | `bookOdds(ml, home, game)` → 港式 |
| `odd_even.odd_odds` | `bookOdds(eo, odd, game)` → 港式 |
| `first_inning.home_line` | `spread(sp, home, 1h)` |
| `first_inning.home_book_odds` | `bookOdds(sp, home, 1h)` 原始美式 |

---

## 實際資料範例

### 無讓分盤口（API 有訂價但未回傳盤口值）

```json
{
  "home_line": "",
  "away_line": "",
  "home_odds": 0.86,
  "away_odds": 0.95,
  "home_book_odds": -117,
  "away_book_odds": -105
}
```

> `home_line` 為空字串時，`spread` 欄位值為 `null`（API 未回傳），  
> 但 `bookOdds` 仍存在。前端顯示時直接顯示港式賠率，不顯示盤口值。

### 1+25 格式拆解

```
home_line = "1"       → 讓分 +1
home_book_odds = +125 → 水錢：+125 - 100 = +25
顯示：1+25
```

```
home_line = "-1.5"
home_book_odds = -117  → 水錢：-117 + 100 = -17
顯示：-1.5-17
```

---

## TeamID 格式（MLB 30 隊）

格式：`全大寫城市_隊名_MLB`（空格以 `_` 取代，省略標點）

| TeamID | 中文名稱 |
|--------|----------|
| `NEW_YORK_YANKEES_MLB` | 紐約洋基 |
| `BOSTON_RED_SOX_MLB` | 波士頓紅襪 |
| `TAMPA_BAY_RAYS_MLB` | 坦帕灣光芒 |
| `TORONTO_BLUE_JAYS_MLB` | 多倫多藍鳥 |
| `BALTIMORE_ORIOLES_MLB` | 巴爾的摩金鶯 |
| `CLEVELAND_GUARDIANS_MLB` | 克里夫蘭守護者 |
| `CHICAGO_WHITE_SOX_MLB` | 芝加哥白襪 |
| `MINNESOTA_TWINS_MLB` | 明尼蘇達雙城 |
| `KANSAS_CITY_ROYALS_MLB` | 堪薩斯市皇家 |
| `DETROIT_TIGERS_MLB` | 底特律老虎 |
| `HOUSTON_ASTROS_MLB` | 休士頓太空人 |
| `SEATTLE_MARINERS_MLB` | 西雅圖水手 |
| `TEXAS_RANGERS_MLB` | 德州遊騎兵 |
| `LOS_ANGELES_ANGELS_MLB` | 洛杉磯天使 |
| `OAKLAND_ATHLETICS_MLB` | 奧克蘭運動家 |
| `SACRAMENTO_ATHLETICS_MLB` | 沙加緬度運動家（搬遷過渡） |
| `LAS_VEGAS_ATHLETICS_MLB` | 拉斯維加斯運動家 |
| `ATLANTA_BRAVES_MLB` | 亞特蘭大勇士 |
| `NEW_YORK_METS_MLB` | 紐約大都會 |
| `PHILADELPHIA_PHILLIES_MLB` | 費城費城人 |
| `MIAMI_MARLINS_MLB` | 邁阿密馬林魚 |
| `WASHINGTON_NATIONALS_MLB` | 華盛頓國民 |
| `CHICAGO_CUBS_MLB` | 芝加哥小熊 |
| `MILWAUKEE_BREWERS_MLB` | 密爾瓦基釀酒人 |
| `CINCINNATI_REDS_MLB` | 辛辛那提紅人 |
| `PITTSBURGH_PIRATES_MLB` | 匹茲堡海盜 |
| `STLOUIS_CARDINALS_MLB` | 聖路易紅雀（注意：無底線，STLOUIS 連寫） |
| `LOS_ANGELES_DODGERS_MLB` | 洛杉磯道奇 |
| `SAN_FRANCISCO_GIANTS_MLB` | 舊金山巨人 |
| `SAN_DIEGO_PADRES_MLB` | 聖地牙哥教士 |
| `ARIZONA_DIAMONDBACKS_MLB` | 亞利桑那響尾蛇 |
| `COLORADO_ROCKIES_MLB` | 科羅拉多落磯 |

---

## 注意事項

- **免費方案**只提供 `MLB`；`NPB`、`CPBL` 需升級後加入 `LEAGUE_MAP`。
- `eventID` 為 Supabase 自動產生的英數字串，前端顯示時使用 `fmtMatchId()` 轉換為 `YYMMDD + 2位hash`。
- `startsAt` 為 UTC 時間，顯示時需注意時區（台灣 UTC+8）。
- `finalized=true` 搭配 `startsAfter` 可限制範圍，避免拉取過多歷史資料。
