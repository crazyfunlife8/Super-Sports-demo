/* sync-taiwan-baseball/index.ts — 台灣運彩棒球資料同步
   同步 NPB（日本職棒）和 CPBL（中華職棒）至 matches 表
   部署：supabase functions deploy sync-taiwan-baseball
   前置：先在 Supabase SQL Editor 執行 add-listcode-column.sql */

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SPORTS_URL = 'https://blob3rd.sportslottery.com.tw/apidata/Pre/Sports.zh.json';
const SETTLE_URL = 'https://api3rd.sportslottery.com.tw/services/content/get';

/* 台彩聯盟名稱 → sport key */
const LEAGUE_MAP: Record<string, string> = {
  '日本職棒': 'baseball_npb',
  '中華職棒': 'baseball_cpbl',
};

/* ── 工具函數 ── */

/* 台彩賠率公式：HK賠率 = pu / pd */
function toHKOdds(pd: string | null, pu: string | null): number {
  const p = Number(pd);
  const u = Number(pu);
  if (!p || !u || isNaN(p) || isNaN(u)) return 0;
  return parseFloat((u / p).toFixed(3));
}

/* 讓分線對面值：-1.5 → +1.5 */
function toAwayLine(mv: string): string {
  if (!mv) return '';
  const n = parseFloat(mv);
  if (isNaN(n) || n === 0) return mv;
  return n < 0 ? `+${Math.abs(n)}` : `-${n}`;
}

/* 從 ms 陣列中找出「主要盤口」：同一 ti 有多個時取 pd 總和最大的那個 */
function pickMainMarket(
  ms: Record<string, unknown>[],
  ti: number
): Record<string, unknown> | null {
  const markets = ms.filter(m => Number(m.ti) === ti);
  if (markets.length === 0) return null;
  if (markets.length === 1) return markets[0];

  let best = markets[0];
  let bestPdSum = 0;
  for (const m of markets) {
    const choices = (m.cs as Record<string, unknown>[]) || [];
    const pdSum = choices.reduce((s, c) => s + (Number(c.pd) || 0), 0);
    if (pdSum > bestPdSum) { bestPdSum = pdSum; best = m; }
  }
  return best;
}

/* 從 choices 找指定 v 值的賠率 */
function oddsBy(
  choices: Record<string, unknown>[],
  v: string
): number {
  const c = choices.find(ch => ch.v === v);
  if (!c) return 0;
  return toHKOdds(String(c.pd ?? ''), String(c.pu ?? ''));
}

/* 從 choices 找 name 包含關鍵字的賠率（用於單雙，v 欄為空） */
function oddsByName(
  choices: Record<string, unknown>[],
  keyword: string
): number {
  const c = choices.find(ch => String(ch.name ?? '').includes(keyword));
  if (!c) return 0;
  return toHKOdds(String(c.pd ?? ''), String(c.pu ?? ''));
}

/* ── 解析單場比賽 ── */
function parseMatch(game: Record<string, unknown>): Record<string, unknown> | null {
  const tn = String(game.tn ?? '').trim().replace(/\r/g, '');
  const sport = LEAGUE_MAP[tn];
  if (!sport) return null; // 跳過 MLB 等其他聯盟

  const ms = (game.ms as Record<string, unknown>[]) ?? [];

  /* 主要讓分盤 (ti=358) */
  const spMkt  = pickMainMarket(ms, 358);
  const spCs   = spMkt ? (spMkt.cs as Record<string, unknown>[]) ?? [] : [];
  const spLine = spMkt ? String(spMkt.mv ?? '') : '';

  /* 主要大小盤 (ti=360) */
  const ouMkt  = pickMainMarket(ms, 360);
  const ouCs   = ouMkt ? (ouMkt.cs as Record<string, unknown>[]) ?? [] : [];
  const ouLine = ouMkt ? String(ouMkt.mv ?? '') : '';

  /* 不讓分/獨贏 (ti=354) */
  const mlMkt = pickMainMarket(ms, 354);
  const mlCs  = mlMkt ? (mlMkt.cs as Record<string, unknown>[]) ?? [] : [];

  /* 單雙 (ti=366) */
  const oeMkt = pickMainMarket(ms, 366);
  const oeCs  = oeMkt ? (oeMkt.cs as Record<string, unknown>[]) ?? [] : [];

  /* 1-5局不讓分 (ti=376) */
  const fiMlMkt = pickMainMarket(ms, 376);
  const fiMlCs  = fiMlMkt ? (fiMlMkt.cs as Record<string, unknown>[]) ?? [] : [];

  /* 1-5局大小 (ti=378) */
  const fiOuMkt  = pickMainMarket(ms, 378);
  const fiOuCs   = fiOuMkt ? (fiOuMkt.cs as Record<string, unknown>[]) ?? [] : [];
  const fiOuLine = fiOuMkt ? String(fiOuMkt.mv ?? '') : '';

  /* 開賽時間：kt 已含 +08:00，轉為 UTC 存入 */
  const kt = String(game.kt ?? '');
  const commenceTime = kt ? new Date(kt).toISOString() : '';

  /* 比賽狀態：kt 時間已過則視為 started，否則 upcoming */
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
      over_odds:  oddsBy(ouCs, 'A'),  // v='A' = 大 = over
      under_odds: oddsBy(ouCs, 'H'),  // v='H' = 小 = under
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

/* ── 查詢已結束賽事比分 ── */
async function fetchSettledScore(
  gameDate: string,
  listcode: string
): Promise<{ full_home_score: number; full_away_score: number; status: string; synced_at: string } | null> {
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
    const json = await res.json() as Record<string, unknown>;
    const events = (json as any)?.content?.data?.settledevents ?? [];
    if (events.length === 0) return null;

    const ev = events[0] as Record<string, unknown>;
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

/* ── Edge Function 主體 ── */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    /* 模擬瀏覽器 header，避免台彩 blob server 回 403 */
    const blobHeaders = {
      'Referer':    'https://www.sportslottery.com.tw/',
      'Origin':     'https://www.sportslottery.com.tw',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
    };

    /* ── Step 1: 取得棒球 sport ID ── */
    const sportsRes = await fetch(SPORTS_URL, { headers: blobHeaders });
    if (!sportsRes.ok) throw new Error(`Sports.zh.json error: ${sportsRes.status}`);
    const sports = await sportsRes.json() as Record<string, unknown>[];

    const baseball = sports.find(s =>
      String(s.name) === '棒球' || String(s.san) === 'BSB'
    );
    if (!baseball) throw new Error('找不到棒球運動 ID');
    const sportId = String(baseball.id ?? '');
    console.log(`棒球 sport ID: ${sportId}`);

    /* ── Step 2: 取得所有棒球比賽 ── */
    const gamesUrl = `https://blob3rd.sportslottery.com.tw/apidata/Pre/${sportId}-Games.zh.json`;
    const gamesRes = await fetch(gamesUrl, { headers: blobHeaders });
    if (!gamesRes.ok) throw new Error(`Games.zh.json error: ${gamesRes.status}`);
    const games = await gamesRes.json() as Record<string, unknown>[];
    console.log(`取得 ${games.length} 場比賽`);

    /* ── Step 3: 解析 NPB/CPBL 比賽 ── */
    const rows = games
      .map(parseMatch)
      .filter((r): r is Record<string, unknown> => r !== null);
    console.log(`NPB/CPBL 比賽: ${rows.length} 場`);

    /* ── Step 4: UPSERT（跳過已完成的比賽） ── */
    let matchesSynced = 0;
    if (rows.length > 0) {
      const matchIds = rows.map(r => r.match_id as string);
      const { data: completed } = await supabase
        .from('matches')
        .select('match_id')
        .in('match_id', matchIds)
        .eq('status', 'completed');

      const completedSet = new Set((completed ?? []).map((m: any) => m.match_id));
      const toUpsert = rows.filter(r => !completedSet.has(r.match_id as string));

      if (toUpsert.length > 0) {
        const { error } = await supabase
          .from('matches')
          .upsert(toUpsert, { onConflict: 'match_id' });
        if (error) throw new Error(`upsert matches: ${error.message}`);
      }
      matchesSynced = toUpsert.length;
      console.log(`✅ 寫入/更新 ${matchesSynced} 筆`);
    }

    /* ── Step 5: 查詢待補比分的比賽（已開賽 3 小時以上，尚未 completed） ── */
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const { data: pending, error: pendingErr } = await supabase
      .from('matches')
      .select('match_id, listcode, commence_time')
      .in('sport', ['baseball_npb', 'baseball_cpbl'])
      .neq('status', 'completed')
      .lt('commence_time', threeHoursAgo)
      .not('listcode', 'is', null);

    if (pendingErr) throw new Error(`query pending: ${pendingErr.message}`);
    console.log(`待補比分: ${pending?.length ?? 0} 場`);

    /* ── Step 6: 逐一查詢比分並更新 ── */
    let scoresUpdated = 0;
    for (const match of (pending ?? [])) {
      /* commence_time 為 UTC，+8h 取得台灣日期 */
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
        console.log(`  ✅ ${match.match_id} → ${score.full_away_score}:${score.full_home_score}`);
      }
    }

    return new Response(
      JSON.stringify({ success: true, matches_synced: matchesSynced, scores_updated: scoresUpdated }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('sync-taiwan-baseball error:', msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }
});
