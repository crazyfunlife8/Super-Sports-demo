// scripts/sync-taiwan-baseball-actions.js
// 由 GitHub Actions 每天 UTC 00:00（台灣時間 08:00）執行
// 透過 ScrapingBee 繞過台彩 IP 封鎖，同步 NPB/CPBL 資料至 Supabase
// 比分來源：Sportradar Fan Hub（statshub.sportradar.com + sh.fn.sportradar.com）

const { createClient } = require('@supabase/supabase-js');

const SCRAPINGBEE = 'https://app.scrapingbee.com/api/v1/';
const LEAGUE_MAP  = { '日本職棒': 'baseball_npb', '中華職棒': 'baseball_cpbl' };

const SR_STATSHUB = 'https://statshub.sportradar.com/taiwansportslottery/zht/sport/3';
const SR_CDN      = 'https://sh.fn.sportradar.com/taiwansportslottery/zht/Asia:Shanghai/gismo/unified_sport_matches/3';
const SR_NPB_RCID = 211;  // 日本職棒
const SR_CPBL_RCID = 397; // 中華職棒

/* ── ScrapingBee GET → JSON ── */
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
    throw new Error(`ScrapingBee GET JSON ${res.status}: ${txt.slice(0, 300)}`);
  }
  return res.json();
}


/* ── 從 statshub HTML 取得 Sportradar auth token（直接 fetch，全球可存取） ── */
async function fetchSRToken(date) {
  const res = await fetch(`${SR_STATSHUB}?date=${date}`);
  if (!res.ok) throw new Error(`statshub HTTP ${res.status}`);
  const html = await res.text();
  const m = html.match(/exp=\d+~acl=[^~]+~data=[^~]+~hmac=[a-f0-9]+/);
  if (!m) throw new Error(`statshub HTML 找不到 token（${date}）`);
  return m[0];
}

/* ── 取得指定日期的 NPB/CPBL 比分 map（直接 fetch） ── */
async function fetchSRScores(date, token) {
  const res = await fetch(`${SR_CDN}/${date}/0?T=${encodeURIComponent(token)}`);
  if (!res.ok) throw new Error(`Sportradar CDN HTTP ${res.status}`);
  const json = await res.json();

  const byName = {};  // key: "home_team|away_team"
  const byUts  = [];  // [{uts, home_score, away_score, home_name, away_name}]

  const categories = json?.doc?.[0]?.data?.sport?.realcategories ?? [];
  for (const cat of categories) {
    const rcid = Number(cat._id ?? cat.id ?? cat.rcid);
    if (rcid !== SR_NPB_RCID && rcid !== SR_CPBL_RCID) continue;

    for (const tour of (cat.tournaments ?? [])) {
      for (const match of (tour.matches ?? [])) {
        const homeName  = String(match.home?.name ?? '').trim();
        const awayName  = String(match.away?.name ?? '').trim();
        const homeScore = match.result?.home ?? null;
        const awayScore = match.result?.away ?? null;
        const uts       = Number(match._dt?.uts ?? 0);

        if (homeScore === null && awayScore === null) continue; // 尚未開打

        const key = `${homeName}|${awayName}`;
        byName[key] = { home_score: Number(homeScore), away_score: Number(awayScore) };
        if (uts) byUts.push({ uts, home_score: Number(homeScore), away_score: Number(awayScore), home_name: homeName, away_name: awayName });
      }
    }
  }

  return { byName, byUts };
}

/* ── 用隊名精確比對，失敗則用開賽時間±30分鐘備援 ── */
function findScore(match, scoreMap) {
  const key = `${match.home_team}|${match.away_team}`;
  if (scoreMap.byName[key]) return scoreMap.byName[key];

  // 時間備援
  const matchUts = Math.floor(new Date(match.commence_time).getTime() / 1000);
  const WINDOW = 30 * 60;
  for (const entry of scoreMap.byUts) {
    if (Math.abs(entry.uts - matchUts) <= WINDOW) return { home_score: entry.home_score, away_score: entry.away_score };
  }
  return null;
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

  /* Step 5: 查詢待補比分（4 小時前開打、尚未 completed） */
  const cutoff = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();

  const { data: pending, error: pendingErr } = await supabase.from('matches')
    .select('match_id, home_team, away_team, commence_time')
    .in('sport', ['baseball_npb','baseball_cpbl'])
    .neq('status','completed')
    .lt('commence_time', cutoff);

  if (pendingErr) throw new Error(`query pending: ${pendingErr.message}`);
  console.log(`🔍 待補比分: ${pending?.length ?? 0} 場`);

  if (!pending?.length) {
    console.log('\n🎉 完成！同步', matchesSynced, '筆，補分 0 筆');
    return;
  }

  /* Step 6: 按日期分組，每日取一次 token + scores */
  const byDate = {};
  for (const match of pending) {
    const twMs   = new Date(match.commence_time).getTime() + 8*60*60*1000;
    const dateStr = new Date(twMs).toISOString().slice(0, 10); // YYYY-MM-DD
    if (!byDate[dateStr]) byDate[dateStr] = [];
    byDate[dateStr].push(match);
  }

  let scoresUpdated = 0;
  for (const [date, matches] of Object.entries(byDate)) {
    console.log(`\n📅 ${date} 共 ${matches.length} 場待補分...`);

    let scoreMap;
    try {
      console.log(`  🔑 取得 Sportradar token...`);
      const token = await fetchSRToken(date);
      console.log(`  ✅ token 取得`);
      scoreMap = await fetchSRScores(date, token);
      console.log(`  ✅ Sportradar 比分 byName:${Object.keys(scoreMap.byName).length} 筆，byUts:${scoreMap.byUts.length} 筆`);
    } catch (e) {
      console.error(`  ❌ Sportradar 取分失敗（${date}）: ${e.message}`);
      continue;
    }

    for (const match of matches) {
      const found = findScore(match, scoreMap);
      if (!found) {
        console.log(`  ⏳ ${match.match_id} ${match.home_team} vs ${match.away_team} 無比分`);
        continue;
      }

      const { error } = await supabase.from('matches').update({
        full_home_score: found.home_score,
        full_away_score: found.away_score,
        status:    'completed',
        synced_at: new Date().toISOString(),
      }).eq('match_id', match.match_id);

      if (error) {
        console.error(`  ❌ ${match.match_id}: ${error.message}`);
      } else {
        scoresUpdated++;
        console.log(`  ✅ ${match.match_id} ${match.home_team} ${found.home_score}:${found.away_score} ${match.away_team}`);
      }
    }
  }

  console.log(`\n🎉 完成！同步 ${matchesSynced} 筆，補分 ${scoresUpdated} 筆`);
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
