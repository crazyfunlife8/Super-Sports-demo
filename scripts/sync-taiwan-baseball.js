// scripts/sync-taiwan-baseball.js
// 同步台灣運彩 NPB/CPBL 棒球資料至 Supabase matches 表
// 由 GitHub Actions 排程執行

import { createClient } from '@supabase/supabase-js';

const SPORTS_URL = 'https://blob3rd.sportslottery.com.tw/apidata/Pre/Sports.zh.json';
const SETTLE_URL = 'https://api3rd.sportslottery.com.tw/services/content/get';

const LEAGUE_MAP = {
  '日本職棒': 'baseball_npb',
  '中華職棒': 'baseball_cpbl',
};

/* 台彩賠率公式：HK賠率 = pu / pd */
function toHKOdds(pd, pu) {
  const p = Number(pd);
  const u = Number(pu);
  if (!p || !u || isNaN(p) || isNaN(u)) return 0;
  return parseFloat((u / p).toFixed(3));
}

/* 讓分線對面值：-1.5 → +1.5 */
function toAwayLine(mv) {
  if (!mv) return '';
  const n = parseFloat(mv);
  if (isNaN(n) || n === 0) return mv;
  return n < 0 ? `+${Math.abs(n)}` : `-${n}`;
}

/* 從 ms 陣列中找出「主要盤口」：同一 ti 有多個時取 pd 總和最大的那個 */
function pickMainMarket(ms, ti) {
  const markets = ms.filter(m => Number(m.ti) === ti);
  if (markets.length === 0) return null;
  if (markets.length === 1) return markets[0];

  let best = markets[0];
  let bestPdSum = 0;
  for (const m of markets) {
    const choices = m.cs ?? [];
    const pdSum = choices.reduce((s, c) => s + (Number(c.pd) || 0), 0);
    if (pdSum > bestPdSum) { bestPdSum = pdSum; best = m; }
  }
  return best;
}

/* 從 choices 找指定 v 值的賠率 */
function oddsBy(choices, v) {
  const c = choices.find(ch => ch.v === v);
  if (!c) return 0;
  return toHKOdds(String(c.pd ?? ''), String(c.pu ?? ''));
}

/* 從 choices 找 name 包含關鍵字的賠率（用於單雙，v 欄為空） */
function oddsByName(choices, keyword) {
  const c = choices.find(ch => String(ch.name ?? '').includes(keyword));
  if (!c) return 0;
  return toHKOdds(String(c.pd ?? ''), String(c.pu ?? ''));
}

/* 解析單場比賽 */
function parseMatch(game) {
  const tn = String(game.tn ?? '').trim().replace(/\r/g, '');
  const sport = LEAGUE_MAP[tn];
  if (!sport) return null;

  const ms = game.ms ?? [];

  const spMkt  = pickMainMarket(ms, 358);
  const spCs   = spMkt ? (spMkt.cs ?? []) : [];
  const spLine = spMkt ? String(spMkt.mv ?? '') : '';

  const ouMkt  = pickMainMarket(ms, 360);
  const ouCs   = ouMkt ? (ouMkt.cs ?? []) : [];
  const ouLine = ouMkt ? String(ouMkt.mv ?? '') : '';

  const mlMkt = pickMainMarket(ms, 354);
  const mlCs  = mlMkt ? (mlMkt.cs ?? []) : [];

  const oeMkt = pickMainMarket(ms, 366);
  const oeCs  = oeMkt ? (oeMkt.cs ?? []) : [];

  const fiMlMkt = pickMainMarket(ms, 376);
  const fiMlCs  = fiMlMkt ? (fiMlMkt.cs ?? []) : [];

  const fiOuMkt  = pickMainMarket(ms, 378);
  const fiOuCs   = fiOuMkt ? (fiOuMkt.cs ?? []) : [];
  const fiOuLine = fiOuMkt ? String(fiOuMkt.mv ?? '') : '';

  const kt = String(game.kt ?? '');
  const commenceTime = kt ? new Date(kt).toISOString() : '';

  const now = new Date();
  const gameTime = kt ? new Date(kt) : null;
  const status = (gameTime && gameTime <= now) ? 'started' : 'upcoming';

  return {
    match_id:      String(game.id ?? '').trim(),
    sport,
    home_team:     String(game.hn ?? '').trim().replace(/\r/g, ''),
    away_team:     String(game.an ?? '').trim().replace(/\r/g, ''),
    commence_time: commenceTime,
    listcode:      String(game.no ?? ''),
    status,
    spread: {
      home_line:      spLine,
      away_line:      toAwayLine(spLine),
      home_odds:      oddsBy(spCs, 'H'),
      away_odds:      oddsBy(spCs, 'A'),
      home_book_odds: null,
      away_book_odds: null,
    },
    totals: {
      line:       ouLine,
      over_odds:  oddsBy(ouCs, 'A'),
      under_odds: oddsBy(ouCs, 'H'),
    },
    moneyline: {
      home_odds: oddsBy(mlCs, 'H'),
      away_odds: oddsBy(mlCs, 'A'),
    },
    odd_even: {
      odd_odds:  oddsByName(oeCs, '單'),
      even_odds: oddsByName(oeCs, '雙'),
    },
    first_inning: {
      home_line:      '',
      away_line:      '',
      home_odds:      0,
      away_odds:      0,
      home_book_odds: null,
      away_book_odds: null,
      total_line:     fiOuLine,
      over_odds:      oddsBy(fiOuCs, 'A'),
      under_odds:     oddsBy(fiOuCs, 'H'),
      ml_home_odds:   oddsBy(fiMlCs, 'H'),
      ml_away_odds:   oddsBy(fiMlCs, 'A'),
    },
    full_home_score: null,
    full_away_score: null,
    half_home_score: null,
    half_away_score: null,
    synced_at: new Date().toISOString(),
  };
}

/* 查詢已結束賽事比分 */
async function fetchSettledScore(gameDate, listcode) {
  try {
    const res = await fetch(SETTLE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://www.sportslottery.com.tw',
      },
      body: JSON.stringify({
        type: 'settledEventsByAlias',
        id: `${gameDate}/${listcode}`,
        language: 'ZH',
      }),
    });

    if (!res.ok) return null;
    const json = await res.json();
    const events = json?.content?.data?.settledevents ?? [];
    if (events.length === 0) return null;

    const ev = events[0];
    return {
      full_home_score: Number(ev.homescoreline) || 0,
      full_away_score: Number(ev.awayscoreline) || 0,
      status:    'completed',
      synced_at: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/* 主程式 */
async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error('❌ 缺少環境變數 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const blobHeaders = {
    'Referer':    'https://www.sportslottery.com.tw/',
    'Origin':     'https://www.sportslottery.com.tw',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  };

  /* Step 1: 取得棒球 sport ID */
  console.log('🔍 取得棒球 sport ID...');
  const sportsRes = await fetch(SPORTS_URL, { headers: blobHeaders });
  if (!sportsRes.ok) throw new Error(`Sports.zh.json error: ${sportsRes.status}`);
  const sports = await sportsRes.json();

  const baseball = sports.find(s => String(s.name) === '棒球' || String(s.san) === 'BSB');
  if (!baseball) throw new Error('找不到棒球運動 ID');
  const sportId = String(baseball.id ?? '');
  console.log(`✅ 棒球 sport ID: ${sportId}`);

  /* Step 2: 取得所有棒球比賽 */
  const gamesUrl = `https://blob3rd.sportslottery.com.tw/apidata/Pre/${sportId}-Games.zh.json`;
  console.log(`🔍 取得比賽列表: ${gamesUrl}`);
  const gamesRes = await fetch(gamesUrl, { headers: blobHeaders });
  if (!gamesRes.ok) throw new Error(`Games.zh.json error: ${gamesRes.status}`);
  const games = await gamesRes.json();
  console.log(`✅ 取得 ${games.length} 場比賽`);

  /* Step 3: 解析 NPB/CPBL */
  const rows = games.map(parseMatch).filter(r => r !== null);
  console.log(`✅ NPB/CPBL 比賽: ${rows.length} 場`);

  /* Step 4: UPSERT（跳過已完成的比賽） */
  let matchesSynced = 0;
  if (rows.length > 0) {
    const matchIds = rows.map(r => r.match_id);
    const { data: completed } = await supabase
      .from('matches')
      .select('match_id')
      .in('match_id', matchIds)
      .eq('status', 'completed');

    const completedSet = new Set((completed ?? []).map(m => m.match_id));
    const toUpsert = rows.filter(r => !completedSet.has(r.match_id));

    if (toUpsert.length > 0) {
      const { error } = await supabase
        .from('matches')
        .upsert(toUpsert, { onConflict: 'match_id' });
      if (error) throw new Error(`upsert matches: ${error.message}`);
    }
    matchesSynced = toUpsert.length;
    console.log(`✅ 寫入/更新 ${matchesSynced} 筆`);
  }

  /* Step 5: 查詢待補比分（已開賽 3 小時以上，尚未 completed） */
  const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const { data: pending, error: pendingErr } = await supabase
    .from('matches')
    .select('match_id, listcode, commence_time')
    .in('sport', ['baseball_npb', 'baseball_cpbl'])
    .neq('status', 'completed')
    .lt('commence_time', threeHoursAgo)
    .not('listcode', 'is', null);

  if (pendingErr) throw new Error(`query pending: ${pendingErr.message}`);
  console.log(`🔍 待補比分: ${pending?.length ?? 0} 場`);

  /* Step 6: 逐一查詢比分並更新 */
  let scoresUpdated = 0;
  for (const match of (pending ?? [])) {
    const twMs = new Date(match.commence_time).getTime() + 8 * 60 * 60 * 1000;
    const gameDate = new Date(twMs).toISOString().slice(0, 10).replace(/-/g, '');

    const score = await fetchSettledScore(gameDate, match.listcode);
    if (!score) {
      console.log(`  ⏳ ${match.match_id} 尚未有結果`);
      continue;
    }

    const { error } = await supabase
      .from('matches')
      .update(score)
      .eq('match_id', match.match_id);

    if (error) {
      console.error(`  ❌ 更新比分 ${match.match_id}: ${error.message}`);
    } else {
      scoresUpdated++;
      console.log(`  ✅ ${match.match_id} → 客:${score.full_away_score} 主:${score.full_home_score}`);
    }
  }

  console.log(`\n🎉 完成！同步 ${matchesSynced} 筆，補分 ${scoresUpdated} 筆`);
}

main().catch(err => {
  console.error('❌ 同步失敗:', err.message);
  process.exit(1);
});
