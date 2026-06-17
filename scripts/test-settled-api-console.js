/**
 * 台彩賽後資料 API 測試腳本
 * 使用方式：
 *   1. 開啟 https://www.sportslottery.com.tw/ （任意頁面）
 *   2. F12 → Console → 貼上全部內容 → Enter
 *
 * 目的：測試 api3rd 的 settledEventsByAlias 能否返回賽後賭盤資料
 */

(async function testSettledApi() {
  const SB_URL = 'https://igavhfxwfsuyksnzbvfx.supabase.co';
  const SB_KEY = 'sb_publishable_6RL5se3g_FgxZFAcfWoWPQ_SFoxBi67';
  const SETTLE_URL = 'https://api3rd.sportslottery.com.tw/services/content/get';

  /* ── Step 1: 從 Supabase 撈有 listcode 的歷史場次（取最近 5 筆） ── */
  console.log('🔍 從 Supabase 取有 listcode 的歷史場次...');
  /* 只找已結束（completed）或開賽時間在昨天以前的場次 */
  const yesterday = new Date(Date.now() - 24*60*60*1000).toISOString();
  const res = await fetch(
    `${SB_URL}/rest/v1/matches?sport=in.(baseball_npb,baseball_cpbl)&listcode=not.is.null&listcode=neq.&commence_time=lt.${yesterday}&order=commence_time.desc&limit=5&select=match_id,sport,home_team,away_team,listcode,commence_time,status`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
  );
  const matches = await res.json();
  if (!matches.length) { console.error('❌ 找不到昨天以前有 listcode 的場次'); return; }

  console.log(`✅ 找到 ${matches.length} 筆，開始逐一測試：\n`);

  for (const m of matches) {
    /* 計算台灣日期 YYYYMMDD */
    const twMs = new Date(m.commence_time).getTime() + 8 * 60 * 60 * 1000;
    const gameDate = new Date(twMs).toISOString().slice(0, 10).replace(/-/g, '');

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`場次: ${m.match_id} | ${m.sport}`);
    console.log(`隊伍: ${m.away_team} vs ${m.home_team}`);
    console.log(`listcode: ${m.listcode} | 日期: ${gameDate} | status: ${m.status}`);

    /* ── 測試各種 type + id 格式 ── */
    const tests = [
      { type: 'settledEventsByAlias', id: `${gameDate}/${m.listcode}` },
      { type: 'settledEventsByAlias', id: `${m.listcode}` },
      { type: 'eventsByAlias',        id: `${gameDate}/${m.listcode}` },
      { type: 'eventsByAlias',        id: `${m.listcode}` },
      { type: 'oddsEventsByAlias',    id: `${gameDate}/${m.listcode}` },
    ];

    for (const t of tests) {
      try {
        const r = await fetch(SETTLE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: t.type, id: t.id, language: 'ZH' }),
        });
        const json = await r.json();
        const errType = json?.errorType || json?.error || null;
        const hasData = JSON.stringify(json).length > 100;

        if (errType) {
          console.log(`  ❌ type=${t.type} id=${t.id} → ${errType}`);
        } else if (hasData) {
          console.log(`  ✅ type=${t.type} id=${t.id} → 有資料！`);
          console.log('  完整回應：', JSON.stringify(json, null, 2));
        } else {
          console.log(`  ⚠️ type=${t.type} id=${t.id} → 空回應`, json);
        }
      } catch (e) {
        console.log(`  💥 type=${t.type} id=${t.id} → ${e.message}`);
      }
    }
    console.log('');
  }

  console.log('🏁 測試完成');
})();
