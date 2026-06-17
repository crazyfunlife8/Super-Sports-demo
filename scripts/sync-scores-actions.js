// scripts/sync-scores-actions.js
// 由 GitHub Actions 每天台灣 20:00、22:00、00:00 執行
// 直接 fetch Sportradar（不需 ScrapingBee），將 NPB/CPBL 比分寫入 Supabase

const { createClient } = require('@supabase/supabase-js');

const SR_STATSHUB  = 'https://statshub.sportradar.com/taiwansportslottery/zht/sport/3';
const SR_CDN       = 'https://sh.fn.sportradar.com/taiwansportslottery/zht/Asia:Shanghai/gismo/unified_sport_matches/3';
const SR_NPB_RCID  = 211;
const SR_CPBL_RCID = 397;

/* ── 從 statshub HTML 取得 auth token（直接 fetch，全球可存取） ── */
async function fetchSRToken(date) {
  const res = await fetch(`${SR_STATSHUB}?date=${date}`);
  if (!res.ok) throw new Error(`statshub HTTP ${res.status}`);
  const html = await res.text();
  const m = html.match(/exp=\d+~acl=[^~]+~data=[^~]+~hmac=[a-f0-9]+/);
  if (!m) throw new Error(`statshub HTML 找不到 token（${date}）`);
  return m[0];
}

/* ── 取得指定日期的 NPB/CPBL 比分 map ── */
async function fetchSRScores(date, token) {
  const res = await fetch(`${SR_CDN}/${date}/0?T=${encodeURIComponent(token)}`);
  if (!res.ok) throw new Error(`Sportradar CDN HTTP ${res.status}`);
  const json = await res.json();

  const byName = {};
  const byUts  = [];
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
        if (homeScore === null && awayScore === null) continue;
        byName[`${homeName}|${awayName}`] = { home_score: Number(homeScore), away_score: Number(awayScore) };
        if (uts) byUts.push({ uts, home_score: Number(homeScore), away_score: Number(awayScore) });
      }
    }
  }
  return { byName, byUts };
}

/* ── 比對：隊名精確 → 時間 ±30 分鐘備援 ── */
function findScore(match, scoreMap) {
  const key = `${match.home_team}|${match.away_team}`;
  if (scoreMap.byName[key]) return scoreMap.byName[key];
  const matchUts = Math.floor(new Date(match.commence_time).getTime() / 1000);
  for (const entry of scoreMap.byUts) {
    if (Math.abs(entry.uts - matchUts) <= 1800) return { home_score: entry.home_score, away_score: entry.away_score };
  }
  return null;
}

/* ── 主程式 ── */
async function main() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) { console.error('❌ 缺少 Supabase 環境變數'); process.exit(1); }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  /* 查詢：4 小時前開打、尚未 completed */
  const cutoff = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
  const { data: pending, error } = await supabase.from('matches')
    .select('match_id, home_team, away_team, commence_time')
    .in('sport', ['baseball_npb', 'baseball_cpbl'])
    .neq('status', 'completed')
    .lt('commence_time', cutoff);

  if (error) throw new Error(`query pending: ${error.message}`);
  console.log(`🔍 待補比分: ${pending?.length ?? 0} 場`);
  if (!pending?.length) { console.log('✅ 無待補場次'); return; }

  /* 按台灣日期分組 */
  const byDate = {};
  for (const match of pending) {
    const twMs = new Date(match.commence_time).getTime() + 8 * 60 * 60 * 1000;
    const date = new Date(twMs).toISOString().slice(0, 10);
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(match);
  }

  let updated = 0;
  for (const [date, matches] of Object.entries(byDate)) {
    console.log(`\n📅 ${date} 共 ${matches.length} 場...`);
    let scoreMap;
    try {
      const token = await fetchSRToken(date);
      scoreMap    = await fetchSRScores(date, token);
      console.log(`  ✅ Sportradar: ${Object.keys(scoreMap.byName).length} 場有比分`);
    } catch (e) {
      console.error(`  ❌ Sportradar 失敗（${date}）: ${e.message}`);
      continue;
    }

    for (const match of matches) {
      const found = findScore(match, scoreMap);
      if (!found) { console.log(`  ⏳ ${match.match_id} ${match.home_team} vs ${match.away_team} 無比分`); continue; }

      const { error: updErr } = await supabase.from('matches').update({
        full_home_score: found.home_score,
        full_away_score: found.away_score,
        status:    'completed',
        synced_at: new Date().toISOString(),
      }).eq('match_id', match.match_id);

      if (updErr) console.error(`  ❌ ${match.match_id}: ${updErr.message}`);
      else { updated++; console.log(`  ✅ ${match.match_id} ${match.home_team} ${found.home_score}:${found.away_score} ${match.away_team}`); }
    }
  }

  console.log(`\n🎉 補分 ${updated} 筆`);
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
