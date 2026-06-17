// scripts/sync-taiwan-baseball-actions.js
// 由 GitHub Actions 每天 UTC 00:00（台灣時間 08:00）執行
// 透過 ScrapingBee 繞過台彩 IP 封鎖，同步 NPB/CPBL 資料至 Supabase

const { createClient } = require('@supabase/supabase-js');

const SCRAPINGBEE  = 'https://app.scrapingbee.com/api/v1/';
const SETTLE_URL   = 'https://api3rd.sportslottery.com.tw/services/content/get';
const LEAGUE_MAP   = { '日本職棒': 'baseball_npb', '中華職棒': 'baseball_cpbl' };

/* ── ScrapingBee GET（住宅 IP 代理） ── */
async function sbGet(targetUrl) {
  const url = new URL(SCRAPINGBEE);
  url.searchParams.set('api_key',         process.env.SCRAPINGBEE_API_KEY);
  url.searchParams.set('url',             targetUrl);
  url.searchParams.set('render_js',       'false');
  url.searchParams.set('premium_proxy',   'true');
  url.searchParams.set('block_resources', 'false');

  const res = await fetch(url.toString());
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`ScrapingBee ${res.status}: ${txt.slice(0, 300)}`);
  }
  return res.json();
}

/* ── 解析台彩結算回應 ── */
function _parseSettleJson(json) {
  const events = json?.content?.data?.settledevents ?? [];
  if (!events.length) return null;
  const ev = events[0];
  return {
    full_home_score: Number(ev.homescoreline) || 0,
    full_away_score: Number(ev.awayscoreline) || 0,
    status:    'completed',
    synced_at: new Date().toISOString(),
  };
}

/* ── 台彩結果 API：先直接 POST，失敗改用 ScrapingBee ── */
async function fetchSettledScore(gameDate, listcode) {
  const body = JSON.stringify({ type: 'settledEventsByAlias', id: `${gameDate}/${listcode}`, language: 'ZH' });

  /* 嘗試直接 POST（api3rd 可能不封鎖） */
  try {
    const res = await fetch(SETTLE_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (res.ok) {
      const json = await res.json();
      const parsed = _parseSettleJson(json);
      if (parsed) return parsed;
    }
  } catch { /* fall through to ScrapingBee */ }

  /* 備援：ScrapingBee 直接轉發 JSON body（POST to ScrapingBee → 它 forward 給 target） */
  try {
    const url = new URL(SCRAPINGBEE);
    url.searchParams.set('api_key',       process.env.SCRAPINGBEE_API_KEY);
    url.searchParams.set('url',           SETTLE_URL);
    url.searchParams.set('render_js',     'false');
    url.searchParams.set('premium_proxy', 'true');

    const res = await fetch(url.toString(), {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body,   /* ScrapingBee 會把此 JSON body 原封不動 forward 給 target */
    });
    if (!res.ok) {
      console.log(`  ⚠️ ScrapingBee settle ${res.status}`);
      return null;
    }
    const json = await res.json();
    const parsed = _parseSettleJson(json);
    if (!parsed) console.log(`  ⚠️ settle response 無結算資料`);
    return parsed;
  } catch (e) {
    console.log(`  ⚠️ ScrapingBee settle error: ${e.message}`);
    return null;
  }
}

/* ── 賠率工具 ── */
const toHKOdds = (pd, pu) => {
  const p = Number(pd), u = Number(pu);
  if (!p || !u) return 0;
  return parseFloat((u / p).toFixed(3));
};
const toAwayLine = (mv) => {
  if (!mv) return '';
  const n = parseFloat(mv);
  if (isNaN(n) || n === 0) return mv;
  return n < 0 ? `+${Math.abs(n)}` : `-${n}`;
};
const pickMainMarket = (ms, ti) => {
  const list = ms.filter(m => Number(m.ti) === ti);
  if (!list.length) return null;
  if (list.length === 1) return list[0];
  let best = list[0], bestSum = 0;
  for (const m of list) {
    const s = (m.cs || []).reduce((a, c) => a + (Number(c.pd) || 0), 0);
    if (s > bestSum) { bestSum = s; best = m; }
  }
  return best;
};
const oddsBy     = (cs, v)  => { const c = (cs||[]).find(x => x.v === v);  return c ? toHKOdds(c.pd, c.pu) : 0; };
const oddsByName = (cs, kw) => { const c = (cs||[]).find(x => String(x.name||'').includes(kw)); return c ? toHKOdds(c.pd, c.pu) : 0; };

/* ── 解析單場 ── */
function parseMatch(game) {
  const tn = String(game.tn ?? '').trim().replace(/\r/g, '');
  const sport = LEAGUE_MAP[tn];
  if (!sport) return null;

  const ms = game.ms || [];
  const sp = pickMainMarket(ms,358), spCs=sp?.cs||[], spLine=sp?String(sp.mv??''):'';
  const ou = pickMainMarket(ms,360), ouCs=ou?.cs||[], ouLine=ou?String(ou.mv??''):'';
  const ml = pickMainMarket(ms,354), mlCs=ml?.cs||[];
  const oe = pickMainMarket(ms,366), oeCs=oe?.cs||[];
  const fim= pickMainMarket(ms,376), fimCs=fim?.cs||[];
  const fio= pickMainMarket(ms,378), fioCs=fio?.cs||[], fioLine=fio?String(fio.mv??''):'';

  const kt = String(game.kt ?? '');
  const commenceTime = kt ? new Date(kt).toISOString() : '';
  const gameTime = kt ? new Date(kt) : null;
  const status = (gameTime && gameTime <= new Date()) ? 'started' : 'upcoming';

  return {
    match_id: String(game.id??'').trim(), sport,
    home_team: String(game.hn??'').trim().replace(/\r/g,''),
    away_team: String(game.an??'').trim().replace(/\r/g,''),
    commence_time: commenceTime, listcode: String(game.no??''), status,
    spread:      { home_line:spLine, away_line:toAwayLine(spLine), home_odds:oddsBy(spCs,'H'), away_odds:oddsBy(spCs,'A'), home_book_odds:null, away_book_odds:null },
    totals:      { line:ouLine, over_odds:oddsBy(ouCs,'A'), under_odds:oddsBy(ouCs,'H') },
    moneyline:   { home_odds:oddsBy(mlCs,'H'), away_odds:oddsBy(mlCs,'A') },
    odd_even:    { odd_odds:oddsByName(oeCs,'單'), even_odds:oddsByName(oeCs,'雙') },
    first_inning:{ home_line:'', away_line:'', home_odds:0, away_odds:0, home_book_odds:null, away_book_odds:null,
                   total_line:fioLine, over_odds:oddsBy(fioCs,'A'), under_odds:oddsBy(fioCs,'H'),
                   ml_home_odds:oddsBy(fimCs,'H'), ml_away_odds:oddsBy(fimCs,'A') },
    full_home_score:null, full_away_score:null, half_home_score:null, half_away_score:null,
    synced_at: new Date().toISOString(),
  };
}

/* ── 主程式 ── */
async function main() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SCRAPINGBEE_API_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) { console.error('❌ 缺少 Supabase 環境變數'); process.exit(1); }
  if (!SCRAPINGBEE_API_KEY)                        { console.error('❌ 缺少 SCRAPINGBEE_API_KEY');   process.exit(1); }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  /* Step 1 & 2: 取得棒球 sport ID + 比賽列表 */
  console.log('🔍 ScrapingBee → 台彩棒球資料...');
  const sports   = await sbGet('https://blob3rd.sportslottery.com.tw/apidata/Pre/Sports.zh.json');
  const baseball = sports.find(s => s.name === '棒球' || s.san === 'BSB');
  if (!baseball) throw new Error('找不到棒球 sport ID');
  const sportId  = String(baseball.id);
  console.log(`✅ 棒球 ID: ${sportId}`);

  const games = await sbGet(`https://blob3rd.sportslottery.com.tw/apidata/Pre/${sportId}-Games.zh.json`);
  console.log(`✅ 共 ${games.length} 場比賽`);

  /* Step 3: 解析 NPB/CPBL */
  const rows = games.map(parseMatch).filter(Boolean);
  console.log(`✅ NPB/CPBL: ${rows.length} 場`);

  /* Step 4: UPSERT（跳過已完成） */
  let matchesSynced = 0;
  if (rows.length > 0) {
    const ids = rows.map(r => r.match_id);
    const { data: completed } = await supabase.from('matches').select('match_id').in('match_id', ids).eq('status','completed');
    const completedSet = new Set((completed||[]).map(m => m.match_id));
    const toUpsert = rows.filter(r => !completedSet.has(r.match_id));
    if (toUpsert.length > 0) {
      const { error } = await supabase.from('matches').upsert(toUpsert, { onConflict: 'match_id' });
      if (error) throw new Error(`upsert: ${error.message}`);
    }
    matchesSynced = toUpsert.length;
    console.log(`✅ 寫入/更新 ${matchesSynced} 筆`);
  }

  /* Step 5: 查詢待補比分（今天台灣零時之前） */
  const twNow      = new Date(Date.now() + 8*60*60*1000);
  const twMidnight = Date.UTC(twNow.getUTCFullYear(), twNow.getUTCMonth(), twNow.getUTCDate());
  const cutoff     = new Date(twMidnight - 8*60*60*1000).toISOString();

  const { data: pending, error: pendingErr } = await supabase.from('matches')
    .select('match_id, listcode, commence_time')
    .in('sport', ['baseball_npb','baseball_cpbl'])
    .neq('status','completed')
    .lt('commence_time', cutoff)
    .not('listcode','is',null)
    .neq('listcode','');

  if (pendingErr) throw new Error(`query pending: ${pendingErr.message}`);
  console.log(`🔍 待補比分: ${pending?.length ?? 0} 場`);

  /* Step 6: 補比分 */
  let scoresUpdated = 0;
  for (const match of (pending||[])) {
    const twMs     = new Date(match.commence_time).getTime() + 8*60*60*1000;
    const gameDate = new Date(twMs).toISOString().slice(0,10).replace(/-/g,'');
    const score    = await fetchSettledScore(gameDate, match.listcode);
    if (!score) { console.log(`  ⏳ ${match.match_id} 尚未有結果`); continue; }

    const { error } = await supabase.from('matches').update(score).eq('match_id', match.match_id);
    if (error) { console.error(`  ❌ ${match.match_id}: ${error.message}`); }
    else       { scoresUpdated++; console.log(`  ✅ ${match.match_id} 客:${score.full_away_score} 主:${score.full_home_score}`); }
  }

  console.log(`\n🎉 完成！同步 ${matchesSynced} 筆，補分 ${scoresUpdated} 筆`);
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
