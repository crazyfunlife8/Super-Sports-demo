/**
 * Sportradar 比分手動補分腳本
 * 使用方式：
 *   1. 開啟 https://statshub.sportradar.com/taiwansportslottery/zht/sport/3?date=YYYY-MM-DD
 *      （不帶 date 則自動取昨天台灣時間）
 *   2. 按 F12 開啟 DevTools → Console
 *   3. 貼上此檔案全部內容，按 Enter 執行
 *
 * 原理：statshub 頁面的 HTML 已內嵌 Sportradar auth token，
 *       直接從 document 取得 token 再呼叫 Sportradar CDN API。
 */

(async function syncScoresFromStatshub() {
  const SB_URL = 'https://igavhfxwfsuyksnzbvfx.supabase.co';
  const SB_KEY = 'sb_publishable_6RL5se3g_FgxZFAcfWoWPQ_SFoxBi67';
  const SR_CDN = 'https://sh.fn.sportradar.com/taiwansportslottery/zht/Asia:Shanghai/gismo/unified_sport_matches/3';
  const SR_NPB_RCID  = 211;
  const SR_CPBL_RCID = 397;

  /* ── Supabase REST 工具 ── */
  const sbGet = async (path) => {
    const r = await fetch(`${SB_URL}/rest/v1${path}`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    });
    if (!r.ok) throw new Error(`Supabase GET ${path} → ${r.status}`);
    return r.json();
  };

  const sbUpdate = async (matchId, data) => {
    const r = await fetch(`${SB_URL}/rest/v1/matches?match_id=eq.${encodeURIComponent(matchId)}`, {
      method: 'PATCH',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error(`Supabase PATCH ${matchId} → ${r.status}`);
  };

  /* ── 從當前頁面 HTML 取得 token ── */
  const tokenMatch = document.documentElement.innerHTML.match(/exp=\d+~acl=[^~]+~data=[^~]+~hmac=[a-f0-9]+/);
  if (!tokenMatch) { console.error('❌ 找不到 Sportradar token，請確認已在 statshub 頁面執行'); return; }
  const token = tokenMatch[0];
  console.log('✅ token:', token.slice(0, 60) + '...');

  /* ── 從 URL 或自動推算日期 ── */
  const urlDate = new URL(location.href).searchParams.get('date');
  let date;
  if (urlDate) {
    date = urlDate; // YYYY-MM-DD
  } else {
    // 昨天台灣時間
    const twYesterday = new Date(Date.now() + 8*60*60*1000 - 24*60*60*1000);
    date = twYesterday.toISOString().slice(0, 10);
  }
  console.log(`📅 日期：${date}`);

  /* ── 取得 Sportradar 比分 ── */
  console.log('🔍 取得 Sportradar 比分...');
  const json = await fetch(`${SR_CDN}/${date}/0?T=${encodeURIComponent(token)}`).then(r => r.json());

  const byName = {};
  const byUts  = [];
  const categories = json?.doc?.[0]?.data?.sport?.realcategories ?? [];
  for (const cat of categories) {
    const rcid = Number(cat._id ?? cat.id ?? cat.rcid);
    if (rcid !== SR_NPB_RCID && rcid !== SR_CPBL_RCID) continue;
    const league = rcid === SR_NPB_RCID ? 'NPB' : 'CPBL';
    for (const tour of (cat.tournaments ?? [])) {
      for (const match of (tour.matches ?? [])) {
        const homeName  = String(match.home?.name ?? '').trim();
        const awayName  = String(match.away?.name ?? '').trim();
        const homeScore = match.result?.home ?? null;
        const awayScore = match.result?.away ?? null;
        const uts       = Number(match._dt?.uts ?? 0);
        console.log(`  [${league}] ${homeName} ${homeScore ?? '-'}:${awayScore ?? '-'} ${awayName}`);
        if (homeScore === null && awayScore === null) continue;
        byName[`${homeName}|${awayName}`] = { home_score: Number(homeScore), away_score: Number(awayScore) };
        if (uts) byUts.push({ uts, home_score: Number(homeScore), away_score: Number(awayScore) });
      }
    }
  }
  console.log(`✅ 有比分的場次: ${Object.keys(byName).length} 場`);

  /* ── 查詢 Supabase 待補比分 ── */
  // 今天台灣零時 UTC
  const twNow = new Date(Date.now() + 8*60*60*1000);
  const twMidnightUTC = new Date(
    Date.UTC(twNow.getUTCFullYear(), twNow.getUTCMonth(), twNow.getUTCDate()) - 8*60*60*1000
  ).toISOString();

  const pending = await sbGet(
    `/matches?sport=in.(baseball_npb,baseball_cpbl)&status=neq.completed&commence_time=lt.${twMidnightUTC}&select=match_id,home_team,away_team,commence_time`
  );
  console.log(`🔍 待補比分: ${pending.length} 場`);

  /* ── 比對並寫入 ── */
  let updated = 0;
  const WINDOW = 30 * 60;
  for (const match of pending) {
    let found = byName[`${match.home_team}|${match.away_team}`] ?? null;

    if (!found) {
      const matchUts = Math.floor(new Date(match.commence_time).getTime() / 1000);
      for (const entry of byUts) {
        if (Math.abs(entry.uts - matchUts) <= WINDOW) {
          found = { home_score: entry.home_score, away_score: entry.away_score };
          break;
        }
      }
    }

    if (!found) {
      console.log(`  ⏳ ${match.match_id} ${match.home_team} vs ${match.away_team} 無比分`);
      continue;
    }

    try {
      await sbUpdate(match.match_id, {
        full_home_score: found.home_score,
        full_away_score: found.away_score,
        status: 'completed',
        synced_at: new Date().toISOString(),
      });
      updated++;
      console.log(`  ✅ ${match.match_id} ${match.home_team} ${found.home_score}:${found.away_score} ${match.away_team}`);
    } catch (e) {
      console.warn(`  ⚠️ ${match.match_id}: ${e.message}`);
    }
  }

  console.log(`\n🎉 完成！補分 ${updated} / ${pending.length} 筆`);
})();
