/* sync-matches/index.ts — Supabase Edge Function
   同步所有棒球賽事：
     MLB  → SportsGameOdds API（賠率 + 比分）
     CPBL/NPB → 台彩 blob3rd via ScrapingBee（賠率）+ Sportradar 直接 fetch（比分）
   部署：supabase functions deploy sync-matches
   環境變數：SPORTSGAMEODDS_API_KEY、SCRAPINGBEE_API_KEY */

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/* ════════════════════════════════════════════
   MLB — SportsGameOdds
   ════════════════════════════════════════════ */

const LEAGUE_MAP: Record<string, string> = {
  MLB:  'baseball_mlb',
};

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
  'STLOUIS_CARDINALS_MLB':    '聖路易紅雀',
  /* NL West */
  'LOS_ANGELES_DODGERS_MLB':  '洛杉磯道奇',
  'SAN_FRANCISCO_GIANTS_MLB': '舊金山巨人',
  'SAN_DIEGO_PADRES_MLB':     '聖地牙哥教士',
  'ARIZONA_DIAMONDBACKS_MLB': '亞利桑那響尾蛇',
  'COLORADO_ROCKIES_MLB':     '科羅拉多落磯',
};

function toHKOdds(americanOdds: string | number | null | undefined): number {
  if (americanOdds == null || americanOdds === '') return 0;
  const n = Number(americanOdds);
  if (isNaN(n) || n === 0) return 0;
  if (n > 0) return parseFloat((n / 100).toFixed(3));
  return parseFloat((100 / Math.abs(n)).toFixed(3));
}

function transformEvent(event: Record<string, unknown>, leagueID: string) {
  const sport   = LEAGUE_MAP[leagueID] || leagueID.toLowerCase();
  const status  = (event.status  as Record<string, unknown>) || {};
  const teams   = (event.teams   as Record<string, Record<string, unknown>>) || {};
  const oddsMap = (event.odds    as Record<string, Record<string, unknown>>) || {};

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

  const eventStatus = status.completed ? 'completed'
    : status.started ? 'started'
    : 'upcoming';

  return {
    match_id:      String(event.eventID ?? ''),
    sport,
    home_team:     TEAM_NAMES_CN[homeId] || homeId || homeNames.long,
    away_team:     TEAM_NAMES_CN[awayId] || awayId || awayNames.long,
    commence_time: String(status.startsAt ?? ''),
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
      home_line:      fi_home?.bookSpread != null ? String(fi_home.bookSpread) : '',
      away_line:      fi_away?.bookSpread != null ? String(fi_away.bookSpread) : '',
      home_odds:      toHKOdds(fi_home?.bookOdds as string),
      away_odds:      toHKOdds(fi_away?.bookOdds as string),
      home_book_odds: fi_home?.bookOdds != null ? Number(fi_home.bookOdds) : null,
      away_book_odds: fi_away?.bookOdds != null ? Number(fi_away.bookOdds) : null,
      total_line:  String(fi_ou_over?.bookOverUnder ?? ''),
      over_odds:   toHKOdds(fi_ou_over?.bookOdds  as string),
      under_odds:  toHKOdds(fi_ou_under?.bookOdds as string),
      ml_home_odds: toHKOdds(fi_ml_home?.bookOdds as string),
      ml_away_odds: toHKOdds(fi_ml_away?.bookOdds as string),
    },
    full_home_score: gameRes['home']?.['points'] ?? null,
    full_away_score: gameRes['away']?.['points'] ?? null,
    half_home_score: halfHomeScore,
    half_away_score: halfAwayScore,
    status:    eventStatus,
    synced_at: new Date().toISOString(),
  };
}

async function fetchActiveEvents(apiKey: string, leagueID: string) {
  const url = new URL('https://api.sportsgameodds.com/v2/events/');
  url.searchParams.set('apiKey', apiKey);
  url.searchParams.set('leagueID', leagueID);
  url.searchParams.set('limit', '50');
  url.searchParams.set('finalized', 'false');
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`SGO ${leagueID} active: ${res.status}`);
  const json = await res.json() as { data?: Record<string, unknown>[] };
  return json.data || [];
}

async function fetchFinalizedEvents(apiKey: string, leagueID: string) {
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const url = new URL('https://api.sportsgameodds.com/v2/events/');
  url.searchParams.set('apiKey', apiKey);
  url.searchParams.set('leagueID', leagueID);
  url.searchParams.set('limit', '50');
  url.searchParams.set('finalized', 'true');
  url.searchParams.set('startsAfter', twoDaysAgo);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`SGO ${leagueID} finalized: ${res.status}`);
  const json = await res.json() as { data?: Record<string, unknown>[] };
  return json.data || [];
}

/* ════════════════════════════════════════════
   CPBL / NPB — 台彩 blob3rd（賠率）+ api3rd（比分 + 盤口結果）
   ════════════════════════════════════════════ */

const SCRAPINGBEE   = 'https://app.scrapingbee.com/api/v1/';
const TW_LEAGUE_MAP: Record<string, string> = { '日本職棒': 'baseball_npb', '中華職棒': 'baseball_cpbl' };
const TW_SETTLED_API = 'https://api3rd.sportslottery.com.tw/services/content/get';

async function sbGet(targetUrl: string, sbKey: string): Promise<unknown> {
  const url = new URL(SCRAPINGBEE);
  url.searchParams.set('api_key',       sbKey);
  url.searchParams.set('url',           targetUrl);
  url.searchParams.set('render_js',     'false');
  url.searchParams.set('premium_proxy', 'true');
  url.searchParams.set('block_resources','false');
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`ScrapingBee GET ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function sbPost(targetUrl: string, body: Record<string, unknown>, sbKey: string): Promise<unknown> {
  const url = new URL(SCRAPINGBEE);
  url.searchParams.set('api_key',        sbKey);
  url.searchParams.set('url',            targetUrl);
  url.searchParams.set('render_js',      'false');
  url.searchParams.set('premium_proxy',  'true');
  url.searchParams.set('block_resources','false');
  const res = await fetch(url.toString(), {
    method:  'POST',
    headers: {
      'Content-Type':     'application/json',
      'Spb-Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`ScrapingBee POST ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/* ── 台彩賠率工具 ── */
function twOdds(pd: unknown, pu: unknown): number {
  const p = Number(pd), u = Number(pu);
  if (!p || !u || isNaN(p) || isNaN(u)) return 0;
  return parseFloat((u / p).toFixed(3));
}
function twAwayLine(mv: string): string {
  if (!mv) return '';
  const n = parseFloat(mv);
  if (isNaN(n) || n === 0) return mv;
  return n < 0 ? `+${Math.abs(n)}` : `-${n}`;
}
function pickMainMarket(ms: Record<string, unknown>[], ti: number) {
  const list = ms.filter(m => Number(m.ti) === ti);
  if (!list.length) return null;
  if (list.length === 1) return list[0];
  let best = list[0], bestSum = 0;
  for (const m of list) {
    const s = ((m.cs as Record<string, unknown>[]) || []).reduce((a, c) => a + (Number(c.pd) || 0), 0);
    if (s > bestSum) { bestSum = s; best = m; }
  }
  return best;
}
const oddsBy = (cs: Record<string, unknown>[], v: string) => {
  const c = (cs || []).find(x => x.v === v);
  return c ? twOdds(c.pd, c.pu) : 0;
};
const oddsByName = (cs: Record<string, unknown>[], kw: string) => {
  const c = (cs || []).find(x => String(x.name || '').includes(kw));
  return c ? twOdds(c.pd, c.pu) : 0;
};

function parseTWGame(game: Record<string, unknown>) {
  const tn = String(game.tn ?? '').trim().replace(/\r/g, '');
  const sport = TW_LEAGUE_MAP[tn];
  if (!sport) return null;

  const ms = (game.ms as Record<string, unknown>[]) || [];
  const sp = pickMainMarket(ms, 358), spCs = (sp?.cs as Record<string, unknown>[]) || [], spLine = sp ? String(sp.mv ?? '') : '';
  const ou = pickMainMarket(ms, 360), ouCs = (ou?.cs as Record<string, unknown>[]) || [], ouLine = ou ? String(ou.mv ?? '') : '';
  const ml = pickMainMarket(ms, 354), mlCs = (ml?.cs as Record<string, unknown>[]) || [];
  let oe: Record<string, unknown> | null | undefined = pickMainMarket(ms, 366);
  if (!oe) oe = ms.find(m => String(m.name || '').includes('單雙')) ?? null;
  const oeCs = (oe?.cs as Record<string, unknown>[]) || [];
  const fim = pickMainMarket(ms, 376), fimCs = (fim?.cs as Record<string, unknown>[]) || [];
  const fio = pickMainMarket(ms, 378), fioCs = (fio?.cs as Record<string, unknown>[]) || [], fioLine = fio ? String(fio.mv ?? '') : '';

  const kt = String(game.kt ?? '');
  const commenceTime = kt ? new Date(kt).toISOString() : '';
  const gameTime = kt ? new Date(kt) : null;
  const status = (gameTime && gameTime <= new Date()) ? 'started' : 'upcoming';

  return {
    match_id: String(game.id ?? '').trim(), sport,
    home_team: String(game.hn ?? '').trim().replace(/\r/g, ''),
    away_team: String(game.an ?? '').trim().replace(/\r/g, ''),
    commence_time: commenceTime, listcode: String(game.no ?? ''), status,
    spread:      { home_line: spLine, away_line: twAwayLine(spLine), home_odds: oddsBy(spCs, 'H'), away_odds: oddsBy(spCs, 'A'), home_book_odds: null, away_book_odds: null },
    totals:      { line: ouLine, over_odds: oddsBy(ouCs, 'A'), under_odds: oddsBy(ouCs, 'H') },
    moneyline:   { home_odds: oddsBy(mlCs, 'H'), away_odds: oddsBy(mlCs, 'A') },
    odd_even:    { odd_odds: oddsByName(oeCs, '單') || oddsBy(oeCs, 'A'), even_odds: oddsByName(oeCs, '雙') || oddsBy(oeCs, 'H') },
    first_inning: {
      home_line: '', away_line: '', home_odds: 0, away_odds: 0, home_book_odds: null, away_book_odds: null,
      total_line: fioLine, over_odds: oddsBy(fioCs, 'A'), under_odds: oddsBy(fioCs, 'H'),
      ml_home_odds: oddsBy(fimCs, 'H'), ml_away_odds: oddsBy(fimCs, 'A'),
    },
    full_home_score: null, full_away_score: null, half_home_score: null, half_away_score: null,
    synced_at: new Date().toISOString(),
  };
}


/* ════════════════════════════════════════════
   Edge Function 主體
   ════════════════════════════════════════════ */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const sgoKey = Deno.env.get('SPORTSGAMEODDS_API_KEY');
    const sbKey  = Deno.env.get('SCRAPINGBEE_API_KEY');
    if (!sgoKey) throw new Error('環境變數 SPORTSGAMEODDS_API_KEY 未設定');
    if (!sbKey)  throw new Error('環境變數 SCRAPINGBEE_API_KEY 未設定');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    /* ── MLB ── */
    console.log('⏳ 同步 MLB...');
    let mlbUpdated = 0;
    try {
      const [activeEvents, finalizedEvents] = await Promise.all([
        fetchActiveEvents(sgoKey, 'MLB'),
        fetchFinalizedEvents(sgoKey, 'MLB'),
      ]);
      const eventMap = new Map<string, Record<string, unknown>>();
      for (const ev of activeEvents)    eventMap.set(String(ev.eventID), ev);
      for (const ev of finalizedEvents) eventMap.set(String(ev.eventID), ev);
      const rows = Array.from(eventMap.values()).map(ev => transformEvent(ev, 'MLB'));
      if (rows.length > 0) {
        const { error } = await supabase.from('matches').upsert(rows, { onConflict: 'match_id' });
        if (error) throw new Error(`upsert MLB: ${error.message}`);
        mlbUpdated = rows.length;
      }
      console.log(`  ✅ MLB ${mlbUpdated} 筆`);
    } catch (e) {
      console.error('  ❌ MLB:', (e as Error).message);
    }

    /* ── CPBL/NPB 賠率（台彩 via ScrapingBee） ── */
    console.log('⏳ 同步 CPBL/NPB 賠率...');
    let twSynced = 0;
    try {
      const sports   = await sbGet('https://blob3rd.sportslottery.com.tw/apidata/Pre/Sports.zh.json', sbKey) as Record<string, unknown>[];
      const baseball = sports.find(s => s.name === '棒球' || s.san === 'BSB');
      if (!baseball) throw new Error('找不到棒球 sport ID');
      const games = await sbGet(`https://blob3rd.sportslottery.com.tw/apidata/Pre/${baseball.id}-Games.zh.json`, sbKey) as Record<string, unknown>[];
      const rows  = games.map(g => parseTWGame(g)).filter(Boolean);
      if (rows.length > 0) {
        const ids = rows.map(r => r!.match_id);
        const { data: completed } = await supabase.from('matches').select('match_id').in('match_id', ids).eq('status', 'completed');
        const completedSet = new Set((completed || []).map((m: Record<string, string>) => m.match_id));
        const toUpsert = rows.filter(r => !completedSet.has(r!.match_id));
        if (toUpsert.length > 0) {
          const { error } = await supabase.from('matches').upsert(toUpsert, { onConflict: 'match_id' });
          if (error) throw new Error(`upsert CPBL/NPB: ${error.message}`);
        }
        twSynced = toUpsert.length;
      }
      console.log(`  ✅ CPBL/NPB ${twSynced} 筆`);
    } catch (e) {
      console.error('  ❌ CPBL/NPB 賠率:', (e as Error).message);
    }

    /* ── CPBL/NPB 比分 + 賽後盤口（台彩 settledMarkets，一次搞定） ── */
    console.log('⏳ 同步 CPBL/NPB 比分及賽後盤口...');
    let settledUpdated = 0;
    try {
      const cutoff        = new Date(Date.now() - 4  * 60 * 60 * 1000).toISOString();
      const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

      /* 找出：14天內、已過開賽4小時、尚未取得 settled_markets 的場次 */
      const { data: pendingMatches } = await supabase.from('matches')
        .select('match_id, home_team, away_team')
        .in('sport', ['baseball_npb', 'baseball_cpbl'])
        .gte('commence_time', fourteenDaysAgo)
        .lt('commence_time', cutoff)
        .is('settled_markets', null);

      if (pendingMatches?.length) {
        const cleanStr = (s: string | null | undefined) => s ? s.replace(/\s+/g, ' ').trim() : '';

        for (const m of pendingMatches) {
          try {
            const json    = await sbPost(TW_SETTLED_API, { type: 'settledMarkets', id: m.match_id, language: 'ZH' }, sbKey) as Record<string, unknown>;
            const content = (json?.content as Record<string, unknown>) ?? {};
            if (content?.errorType) continue; // 比賽尚未結束，跳過

            const apiData   = (content?.data as Record<string, unknown>) ?? {};
            const markets   = (apiData.settledmarkets   as Record<string, unknown>[]) ?? [];
            const handicaps = (apiData.settledhandicaps as Record<string, unknown>[]) ?? [];
            if (!markets.length && !handicaps.length) continue;

            /* 從 settledhandicaps 取比分 */
            type HItem = Record<string, unknown>;
            const scoreEntry = handicaps.find((x: HItem) => x.homescoreline != null && x.awayscoreline != null) as HItem | undefined;
            const homeScore  = scoreEntry != null ? Number(scoreEntry.homescoreline) : null;
            const awayScore  = scoreEntry != null ? Number(scoreEntry.awayscoreline) : null;

            /* 解析盤口結果 */
            const ml    = markets.find((x: HItem) => x.name === '不讓分') as HItem | undefined;
            const oe    = markets.find((x: HItem) => String(x.name ?? '').includes('單雙')) as HItem | undefined;
            const fi1   = markets.find((x: HItem) => String(x.name ?? '').includes('[第1局] 不讓分')) as HItem | undefined;
            const fi5   = markets.find((x: HItem) => String(x.name ?? '').includes('[1-5局] 不讓分')) as HItem | undefined;
            const sp    = handicaps.find((x: HItem) => /^讓分 /.test(String(x.name ?? ''))) as HItem | undefined;
            const ou    = handicaps.find((x: HItem) => /^\[總分\]大小 /.test(String(x.name ?? ''))) as HItem | undefined;
            const fi5ou = handicaps.find((x: HItem) => /^\[1-5局\] 大小 /.test(String(x.name ?? ''))) as HItem | undefined;

            const spWinner   = cleanStr(sp?.winnername as string);
            const spHadvalue = spWinner
              ? (m.home_team && spWinner.includes(m.home_team.trim()) ? 'H'
                : m.away_team && spWinner.includes(m.away_team.trim()) ? 'A' : null)
              : null;

            const settled = {
              ml_hadvalue:   cleanStr(ml?.hadvalue   as string) || null,
              ml_winner:     cleanStr(ml?.winnername as string) || null,
              oe_winner:     cleanStr(oe?.winnername as string) || null,
              fi1_ml_winner: cleanStr(fi1?.winnername as string) || null,
              fi5_ml_winner: cleanStr(fi5?.winnername as string) || null,
              sp_name:       cleanStr(sp?.name       as string) || null,
              sp_winner:     spWinner                           || null,
              sp_hadvalue:   spHadvalue,
              ou_name:       cleanStr(ou?.name       as string) || null,
              ou_winner:     cleanStr(ou?.winnername as string) || null,
              fi5_ou_name:   cleanStr(fi5ou?.name   as string) || null,
              fi5_ou_winner: cleanStr(fi5ou?.winnername as string) || null,
            };

            const updateFields: Record<string, unknown> = {
              settled_markets: settled,
              status:    'completed',
              synced_at: new Date().toISOString(),
            };
            if (homeScore !== null && !isNaN(homeScore)) {
              updateFields.full_home_score = homeScore;
              updateFields.full_away_score = awayScore;
            }

            const { error } = await supabase.from('matches')
              .update(updateFields)
              .eq('match_id', m.match_id);
            if (!error) settledUpdated++;
            else console.error(`  ⚠️ update ${m.match_id}:`, error.message);
          } catch (e) {
            console.error(`  ⚠️ settledMarkets ${m.match_id}:`, (e as Error).message);
          }
        }
      }
      console.log(`  ✅ 比分+賽後盤口 ${settledUpdated} 筆`);
    } catch (e) {
      console.error('  ❌ CPBL/NPB 比分+盤口:', (e as Error).message);
    }

    return new Response(
      JSON.stringify({ success: true, mlb: mlbUpdated, cpbl_npb: twSynced, settled: settledUpdated }),
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
