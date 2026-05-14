/* sync-matches/index.ts — Supabase Edge Function
   SportsGameOdds API → Supabase matches 表同步
   部署：supabase functions deploy sync-matches
   環境變數：SPORTSGAMEODDS_API_KEY */

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/* ── 聯賽 ID 對應內部 sport key ── */
const LEAGUE_MAP: Record<string, string> = {
  MLB:  'baseball_mlb',
  NPB:  'baseball_npb',   // 升級後啟用
  CPBL: 'baseball_cpbl',  // 升級後啟用
};

/* ── MLB 30 隊中文名稱對照表 ── */
const TEAM_NAMES_CN: Record<string, string> = {
  /* AL East */
  'NEW_YORK_YANKEES_MLB':     '紐約洋基',
  'BOSTON_RED_SOX_MLB':       '波士頓紅襪',
  'TAMPA_BAY_RAYS_MLB':       '坦帕灣光芒',
  'TORONTO_BLUE_JAYS_MLB':    '多倫多藍鳥',
  'BALTIMORE_ORIOLES_MLB':    '巴爾的摩金鶯',
  /* AL Central */
  'CLEVELAND_GUARDIANS_MLB':  '克里夫蘭守護者',
  'CHICAGO_WHITE_SOX_MLB':    '芝加哥白襪',
  'MINNESOTA_TWINS_MLB':      '明尼蘇達雙城',
  'KANSAS_CITY_ROYALS_MLB':   '堪薩斯市皇家',
  'DETROIT_TIGERS_MLB':       '底特律老虎',
  /* AL West */
  'HOUSTON_ASTROS_MLB':       '休士頓太空人',
  'SEATTLE_MARINERS_MLB':     '西雅圖水手',
  'TEXAS_RANGERS_MLB':        '德州遊騎兵',
  'LOS_ANGELES_ANGELS_MLB':   '洛杉磯天使',
  'OAKLAND_ATHLETICS_MLB':    '奧克蘭運動家',
  'SACRAMENTO_ATHLETICS_MLB': '沙加緬度運動家',
  'LAS_VEGAS_ATHLETICS_MLB':  '拉斯維加斯運動家',
  /* NL East */
  'ATLANTA_BRAVES_MLB':       '亞特蘭大勇士',
  'NEW_YORK_METS_MLB':        '紐約大都會',
  'PHILADELPHIA_PHILLIES_MLB':'費城費城人',
  'MIAMI_MARLINS_MLB':        '邁阿密馬林魚',
  'WASHINGTON_NATIONALS_MLB': '華盛頓國民',
  /* NL Central */
  'CHICAGO_CUBS_MLB':         '芝加哥小熊',
  'MILWAUKEE_BREWERS_MLB':    '密爾瓦基釀酒人',
  'CINCINNATI_REDS_MLB':      '辛辛那提紅人',
  'PITTSBURGH_PIRATES_MLB':   '匹茲堡海盜',
  'STLOUIS_CARDINALS_MLB':   '聖路易紅雀',
  /* NL West */
  'LOS_ANGELES_DODGERS_MLB':  '洛杉磯道奇',
  'SAN_FRANCISCO_GIANTS_MLB': '舊金山巨人',
  'SAN_DIEGO_PADRES_MLB':     '聖地牙哥教士',
  'ARIZONA_DIAMONDBACKS_MLB': '亞利桑那響尾蛇',
  'COLORADO_ROCKIES_MLB':     '科羅拉多落磯',
  /* NPB — 升級後補齊 */
  /* CPBL — 升級後補齊 */
};

/* ── 美式賠率 → 香港賠率（= 歐式小數 − 1，即每押 1 元的純獲利） ── */
function toHKOdds(americanOdds: string | number | null | undefined): number {
  if (americanOdds == null || americanOdds === '') return 0;
  const n = Number(americanOdds);
  if (isNaN(n) || n === 0) return 0;
  if (n > 0) return parseFloat((n / 100).toFixed(3));
  return parseFloat((100 / Math.abs(n)).toFixed(3));
}

/* ── 單一賽事物件 → matches 表格式 ── */
function transformEvent(event: Record<string, unknown>, leagueID: string) {
  const sport   = LEAGUE_MAP[leagueID] || leagueID.toLowerCase();
  const status  = (event.status  as Record<string, unknown>) || {};
  const teams   = (event.teams   as Record<string, Record<string, unknown>>) || {};
  const oddsMap = (event.odds    as Record<string, Record<string, unknown>>) || {};

  /* 比分：results.<periodID>.<statEntityID>.points
     baseball: points = runs scored
     逐局：1i～9i；半場（前5局）= 1i+2i+3i+4i+5i 自行加總 */
  type ResultsMap = Record<string, Record<string, Record<string, number>>>;
  const results = (event.results as ResultsMap) || {};
  const gameRes = results['game'] || {};

  const sumHalf = (side: 'home' | 'away') =>
    ['1i','2i','3i','4i','5i'].reduce((acc, inn) => {
      return acc + ((results[inn]?.[side]?.['points']) ?? 0);
    }, 0);
  const halfHomeScore = gameRes['home'] ? sumHalf('home') : null;
  const halfAwayScore = gameRes['away'] ? sumHalf('away') : null;

  const oddsArr = Object.values(oddsMap);
  const find = (type: string, side: string, periodID = 'game') =>
    oddsArr.find(o => o.betTypeID === type && o.sideID === side && o.periodID === periodID);

  const sp_home  = find('sp', 'home');
  const sp_away  = find('sp', 'away');
  const ou_over  = find('ou', 'over');
  const ou_under = find('ou', 'under');
  const ml_home  = find('ml', 'home');
  const ml_away  = find('ml', 'away');
  const eo_even  = find('eo', 'even');
  const eo_odd   = find('eo', 'odd');
  /* 首半場（1h = 前5局）各盤口 */
  const fi_home     = find('sp', 'home',  '1h');
  const fi_away     = find('sp', 'away',  '1h');
  const fi_ou_over  = find('ou', 'over',  '1h');
  const fi_ou_under = find('ou', 'under', '1h');
  const fi_ml_home  = find('ml', 'home',  '1h');
  const fi_ml_away  = find('ml', 'away',  '1h');

  const homeId    = (teams.home?.teamID as string) || '';
  const awayId    = (teams.away?.teamID as string) || '';
  const homeNames = (teams.home?.names  as Record<string, string>) || {};
  const awayNames = (teams.away?.names  as Record<string, string>) || {};

  /* status 對應：
     completed → 'completed'（歷史賽事頁顯示）
     started   → 'started' （即時注單頁 + 歷史賽事頁都顯示）
     其餘      → 'upcoming'（僅即時注單頁顯示） */
  const eventStatus = status.completed ? 'completed'
    : status.started ? 'started'
    : 'upcoming';

  return {
    match_id:       String(event.eventID ?? ''),
    sport,
    home_team:      TEAM_NAMES_CN[homeId] || homeId || homeNames.long,
    away_team:      TEAM_NAMES_CN[awayId] || awayId || awayNames.long,
    commence_time:  String(status.startsAt ?? ''),
    spread: {
      home_line: sp_home?.bookSpread != null ? String(sp_home.bookSpread) : '',
      away_line: sp_away?.bookSpread != null ? String(sp_away.bookSpread) : '',
      home_odds: toHKOdds(sp_home?.bookOdds as string),
      away_odds: toHKOdds(sp_away?.bookOdds as string),
      home_book_odds: sp_home?.bookOdds != null ? Number(sp_home.bookOdds) : null,
      away_book_odds: sp_away?.bookOdds != null ? Number(sp_away.bookOdds) : null,
    },
    totals: {
      line:       String(ou_over?.bookOverUnder ?? ''),
      over_odds:  toHKOdds(ou_over?.bookOdds  as string),
      under_odds: toHKOdds(ou_under?.bookOdds as string),
    },
    moneyline: {
      home_odds: toHKOdds(ml_home?.bookOdds as string),
      away_odds: toHKOdds(ml_away?.bookOdds as string),
    },
    odd_even: {
      even_odds: toHKOdds(eo_even?.bookOdds as string),
      odd_odds:  toHKOdds(eo_odd?.bookOdds  as string),
    },
    first_inning: {
      /* 讓分（sp, 1h） */
      home_line:      fi_home?.bookSpread != null ? String(fi_home.bookSpread) : '',
      away_line:      fi_away?.bookSpread != null ? String(fi_away.bookSpread) : '',
      home_odds:      toHKOdds(fi_home?.bookOdds as string),
      away_odds:      toHKOdds(fi_away?.bookOdds as string),
      home_book_odds: fi_home?.bookOdds != null ? Number(fi_home.bookOdds) : null,
      away_book_odds: fi_away?.bookOdds != null ? Number(fi_away.bookOdds) : null,
      /* 大小盤（ou, 1h） */
      total_line:  String(fi_ou_over?.bookOverUnder ?? ''),
      over_odds:   toHKOdds(fi_ou_over?.bookOdds  as string),
      under_odds:  toHKOdds(fi_ou_under?.bookOdds as string),
      /* 獨贏（ml, 1h） */
      ml_home_odds: toHKOdds(fi_ml_home?.bookOdds as string),
      ml_away_odds: toHKOdds(fi_ml_away?.bookOdds as string),
    },
    /* 比分（僅已結束賽事有值，進行中/未開賽為 null） */
    full_home_score: gameRes['home']?.['points'] ?? null,
    full_away_score: gameRes['away']?.['points'] ?? null,
    half_home_score: halfHomeScore,
    half_away_score: halfAwayScore,
    status:       eventStatus,
    synced_at:    new Date().toISOString(),
  };
}

/* ── 拉取未結束賽事（upcoming + live） ── */
async function fetchActiveEvents(apiKey: string, leagueID: string): Promise<Record<string, unknown>[]> {
  const url = new URL('https://api.sportsgameodds.com/v2/events/');
  url.searchParams.set('apiKey', apiKey);
  url.searchParams.set('leagueID', leagueID);
  url.searchParams.set('limit', '50');
  url.searchParams.set('finalized', 'false');

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`API ${leagueID} active error: ${res.status}`);

  const json = await res.json() as { data?: Record<string, unknown>[] };
  return json.data || [];
}

/* ── 拉取近 2 天已結束賽事（含比分） ── */
async function fetchFinalizedEvents(apiKey: string, leagueID: string): Promise<Record<string, unknown>[]> {
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);

  const url = new URL('https://api.sportsgameodds.com/v2/events/');
  url.searchParams.set('apiKey', apiKey);
  url.searchParams.set('leagueID', leagueID);
  url.searchParams.set('limit', '50');
  url.searchParams.set('finalized', 'true');
  url.searchParams.set('startsAfter', twoDaysAgo);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`API ${leagueID} finalized error: ${res.status}`);

  const json = await res.json() as { data?: Record<string, unknown>[] };
  return json.data || [];
}

/* ── Edge Function 主體 ── */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const apiKey = Deno.env.get('SPORTSGAMEODDS_API_KEY');
    if (!apiKey) throw new Error('環境變數 SPORTSGAMEODDS_API_KEY 未設定');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    /* 目前免費方案只有 MLB；升級後把 'NPB', 'CPBL' 加回來即可 */
    const leagues = ['MLB'];

    let totalUpdated = 0;

    for (const leagueID of leagues) {
      console.log(`⏳ 同步 ${leagueID}...`);

      /* 同時拉取：未結束 + 近 7 天已結束 */
      const [activeEvents, finalizedEvents] = await Promise.all([
        fetchActiveEvents(apiKey, leagueID),
        fetchFinalizedEvents(apiKey, leagueID),
      ]);

      /* 去重（同一 eventID 以 finalized 版本為準，因為有比分） */
      const eventMap = new Map<string, Record<string, unknown>>();
      for (const ev of activeEvents)    eventMap.set(String(ev.eventID), ev);
      for (const ev of finalizedEvents) eventMap.set(String(ev.eventID), ev);

      const events = Array.from(eventMap.values());
      console.log(`  取得 ${activeEvents.length} 筆未結束 + ${finalizedEvents.length} 筆已結束（去重後 ${events.length} 筆）`);

      if (events.length === 0) continue;

      const rows = events.map(ev => transformEvent(ev, leagueID));

      const { error } = await supabase
        .from('matches')
        .upsert(rows, { onConflict: 'match_id' });

      if (error) throw new Error(`upsert ${leagueID}: ${error.message}`);

      totalUpdated += rows.length;
      console.log(`  ✅ 寫入 ${rows.length} 筆`);
    }

    return new Response(
      JSON.stringify({ success: true, updated: totalUpdated }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('sync-matches error:', msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }
});
