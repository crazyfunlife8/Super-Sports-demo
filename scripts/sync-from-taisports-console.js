/**
 * 台彩棒球同步腳本
 * 使用方式：
 *   1. 開啟 https://www.sportslottery.com.tw/ (任意頁面)
 *   2. 按 F12 開啟 DevTools → Console
 *   3. 貼上此檔案全部內容，按 Enter 執行
 *
 * 原理：腳本在台彩網站頁面執行，IP 和 CORS 皆不受限，
 *       抓完資料後直接用 Supabase REST API 寫入。
 */

(async function syncTaiwanBaseball() {
  const SB_URL = 'https://igavhfxwfsuyksnzbvfx.supabase.co';
  const SB_KEY = 'sb_publishable_6RL5se3g_FgxZFAcfWoWPQ_SFoxBi67';
  const LEAGUE_MAP = { '日本職棒': 'baseball_npb', '中華職棒': 'baseball_cpbl' };

  /* ── Supabase REST 工具 ── */
  const sbGet = async (path) => {
    const r = await fetch(`${SB_URL}/rest/v1${path}`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    });
    if (!r.ok) throw new Error(`Supabase GET ${path} → ${r.status}`);
    return r.json();
  };

  const sbUpsert = async (rows) => {
    const r = await fetch(`${SB_URL}/rest/v1/matches?on_conflict=match_id`, {
      method: 'POST',
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(rows),
    });
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`Supabase upsert → ${r.status}: ${t}`);
    }
  };

  const sbUpdate = async (matchId, data) => {
    const r = await fetch(`${SB_URL}/rest/v1/matches?match_id=eq.${encodeURIComponent(matchId)}`, {
      method: 'PATCH',
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error(`Supabase update ${matchId} → ${r.status}`);
  };

  /* ── 賠率 / 盤口工具 ── */
  const toHKOdds = (pd, pu) => {
    const p = Number(pd), u = Number(pu);
    if (!p || !u || isNaN(p) || isNaN(u)) return 0;
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
  const parseMatch = (game) => {
    const tn = String(game.tn ?? '').trim().replace(/\r/g, '');
    const sport = LEAGUE_MAP[tn];
    if (!sport) return null;

    const ms = game.ms || [];
    const sp = pickMainMarket(ms, 358), spCs = sp?.cs||[], spLine = sp ? String(sp.mv??'') : '';
    const ou = pickMainMarket(ms, 360), ouCs = ou?.cs||[], ouLine = ou ? String(ou.mv??'') : '';
    const ml = pickMainMarket(ms, 354), mlCs = ml?.cs||[];
    const oe = pickMainMarket(ms, 366), oeCs = oe?.cs||[];
    const fim= pickMainMarket(ms, 376), fimCs= fim?.cs||[];
    const fio= pickMainMarket(ms, 378), fioCs= fio?.cs||[], fioLine= fio ? String(fio.mv??'') : '';

    const kt = String(game.kt ?? '');
    const commenceTime = kt ? new Date(kt).toISOString() : '';
    const gameTime = kt ? new Date(kt) : null;
    const status = (gameTime && gameTime <= new Date()) ? 'started' : 'upcoming';

    return {
      match_id: String(game.id ?? '').trim(), sport,
      home_team: String(game.hn ?? '').trim().replace(/\r/g, ''),
      away_team: String(game.an ?? '').trim().replace(/\r/g, ''),
      commence_time: commenceTime, listcode: String(game.no ?? ''), status,
      spread: { home_line: spLine, away_line: toAwayLine(spLine), home_odds: oddsBy(spCs,'H'), away_odds: oddsBy(spCs,'A'), home_book_odds: null, away_book_odds: null },
      totals: { line: ouLine, over_odds: oddsBy(ouCs,'A'), under_odds: oddsBy(ouCs,'H') },
      moneyline: { home_odds: oddsBy(mlCs,'H'), away_odds: oddsBy(mlCs,'A') },
      odd_even:  { odd_odds: oddsByName(oeCs,'單'), even_odds: oddsByName(oeCs,'雙') },
      first_inning: {
        home_line: '', away_line: '', home_odds: 0, away_odds: 0, home_book_odds: null, away_book_odds: null,
        total_line: fioLine, over_odds: oddsBy(fioCs,'A'), under_odds: oddsBy(fioCs,'H'),
        ml_home_odds: oddsBy(fimCs,'H'), ml_away_odds: oddsBy(fimCs,'A'),
      },
      full_home_score: null, full_away_score: null, half_home_score: null, half_away_score: null,
      synced_at: new Date().toISOString(),
    };
  };

  /* ── Step 1: 取得棒球 sport ID ── */
  console.log('🔍 取得棒球 sport ID...');
  const sports = await fetch('https://blob3rd.sportslottery.com.tw/apidata/Pre/Sports.zh.json').then(r => r.json());
  const baseball = sports.find(s => s.name === '棒球' || s.san === 'BSB');
  if (!baseball) { console.error('❌ 找不到棒球 ID'); return; }
  const sportId = String(baseball.id);
  console.log(`✅ 棒球 ID: ${sportId}`);

  /* ── Step 2: 取得比賽列表 ── */
  console.log('🔍 取得比賽列表...');
  const games = await fetch(`https://blob3rd.sportslottery.com.tw/apidata/Pre/${sportId}-Games.zh.json`).then(r => r.json());
  console.log(`✅ 共 ${games.length} 場`);

  /* ── Step 3: 解析 NPB/CPBL ── */
  const rows = games.map(parseMatch).filter(Boolean);
  console.log(`✅ NPB/CPBL: ${rows.length} 場`);

  /* ── Step 4: 跳過已完成，其餘 UPSERT ── */
  let matchesSynced = 0;
  if (rows.length > 0) {
    const ids = rows.map(r => r.match_id).join(',');
    const completed = await sbGet(`/matches?match_id=in.(${ids})&status=eq.completed&select=match_id`);
    const completedSet = new Set(completed.map(m => m.match_id));
    const toUpsert = rows.filter(r => !completedSet.has(r.match_id));
    if (toUpsert.length > 0) await sbUpsert(toUpsert);
    matchesSynced = toUpsert.length;
    console.log(`✅ 寫入/更新 ${matchesSynced} 筆`);
  }

  /* ── Step 5: 查詢待補比分（今天台灣時間零時之前、尚未 completed 的場次） ── */
  const twNow  = new Date(Date.now() + 8 * 60 * 60 * 1000);           // 台灣現在時間（UTC）
  const twMidnight = Date.UTC(                                          // 今天台灣零時（UTC）
    twNow.getUTCFullYear(), twNow.getUTCMonth(), twNow.getUTCDate()
  );
  const todayTWMidnightUTC = new Date(twMidnight - 8 * 60 * 60 * 1000).toISOString();

  const pending = await sbGet(
    `/matches?sport=in.(baseball_npb,baseball_cpbl)&status=neq.completed&commence_time=lt.${todayTWMidnightUTC}&listcode=not.is.null&select=match_id,listcode,commence_time`
  );
  console.log(`🔍 待補比分: ${pending.length} 場`);

  /* ── Step 6: 補比分 ── */
  let scoresUpdated = 0;
  for (const match of pending) {
    const twMs = new Date(match.commence_time).getTime() + 8*60*60*1000;
    const gameDate = new Date(twMs).toISOString().slice(0,10).replace(/-/g,'');
    try {
      const res = await fetch('https://api3rd.sportslottery.com.tw/services/content/get', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'settledEventsByAlias', id: `${gameDate}/${match.listcode}`, language: 'ZH' }),
      });
      const json = await res.json();
      const events = json?.content?.data?.settledevents ?? [];
      if (!events.length) { console.log(`  ⏳ ${match.match_id} 尚未有結果`); continue; }
      const ev = events[0];
      await sbUpdate(match.match_id, {
        full_home_score: Number(ev.homescoreline) || 0,
        full_away_score: Number(ev.awayscoreline) || 0,
        status: 'completed',
        synced_at: new Date().toISOString(),
      });
      scoresUpdated++;
      console.log(`  ✅ ${match.match_id} 客:${ev.awayscoreline} 主:${ev.homescoreline}`);
    } catch (e) {
      console.warn(`  ⚠️ ${match.match_id}: ${e.message}`);
    }
  }

  console.log(`\n🎉 完成！同步 ${matchesSynced} 筆賽事，補分 ${scoresUpdated} 筆`);
})();
