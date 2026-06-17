/**
 * 台彩 settledMarkets API 測試腳本
 * 使用方式：在 https://www.sportslottery.com.tw/ Console 執行
 *
 * 測試用 match_id 直接查詢賽後市場資料（不需要 listcode 或日期）
 */

(async function testSettledMarkets() {
  const SB_URL = 'https://igavhfxwfsuyksnzbvfx.supabase.co';
  const SB_KEY = 'sb_publishable_6RL5se3g_FgxZFAcfWoWPQ_SFoxBi67';
  const API    = 'https://api3rd.sportslottery.com.tw/services/content/get';

  /* 取最近 3 場已完成的 CPBL/NPB 場次 */
  const yesterday = new Date(Date.now() - 24*60*60*1000).toISOString();
  const res = await fetch(
    `${SB_URL}/rest/v1/matches?sport=in.(baseball_npb,baseball_cpbl)&status=eq.completed&order=commence_time.desc&limit=3&select=match_id,sport,home_team,away_team,commence_time`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
  );
  const matches = await res.json();
  if (!matches.length) { console.error('❌ 找不到已完成的 CPBL/NPB 場次'); return; }

  for (const m of matches) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`${m.sport} | ${m.away_team} vs ${m.home_team}`);
    console.log(`match_id: ${m.match_id}`);

    const r = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'settledMarkets', id: m.match_id, language: 'ZH' }),
    });
    const json = await r.json();

    if (json?.content?.errorType) {
      console.log(`❌ 錯誤: ${json.content.errorType}`);
      continue;
    }

    const markets   = json?.content?.data?.settledmarkets   ?? [];
    const handicaps = json?.content?.data?.settledhandicaps ?? [];
    console.log(`✅ settledmarkets: ${markets.length} 筆，settledhandicaps: ${handicaps.length} 筆`);

    /* 嘗試解析關鍵欄位 */
    const ml  = markets.find(x => x.name === '不讓分');
    const oe  = markets.find(x => x.name?.includes('單雙'));
    const fi  = markets.find(x => x.name?.includes('[第1局] 不讓分') || x.name?.includes('[1-5局] 不讓分'));

    const sp  = handicaps.find(x => /^讓分 /.test(x.name));       // 主要讓分
    const ou  = handicaps.find(x => /^\[總分\]大小 /.test(x.name)); // 主要大小
    const fiOu = handicaps.find(x => /^\[第1局\] 大小 /.test(x.name)); // 第一局大小

    console.log('獨贏結果:', ml  ? `贏家=${ml.winnername?.trim()}  hadvalue=${ml.hadvalue}` : '無');
    console.log('單雙結果:', oe  ? `贏家=${oe.winnername?.trim()}` : '無');
    console.log('首局獨贏:', fi  ? `贏家=${fi.winnername?.trim()}` : '無');
    console.log('讓分盤:  ', sp  ? `name=${sp.name}  贏家=${sp.winnername?.trim()}` : '無');
    console.log('大小盤:  ', ou  ? `name=${ou.name}  贏家=${ou.winnername?.trim()}` : '無');
    console.log('首局大小:', fiOu? `name=${fiOu.name}  贏家=${fiOu.winnername?.trim()}` : '無');

    console.log('\n--- 完整 settledmarkets ---');
    markets.forEach(x => console.log(` [${x.name}] 贏家: ${x.winnername?.trim()} hadvalue:${x.hadvalue||'-'}`));
    console.log('--- 完整 settledhandicaps ---');
    handicaps.forEach(x => console.log(` [${x.name}] 贏家: ${x.winnername?.trim()}`));
  }

  console.log('\n🏁 測試完成');
})();
