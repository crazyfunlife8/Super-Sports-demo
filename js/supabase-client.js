/* supabase-client.js — Supabase 客戶端初始化，供三頁共用 */

const SUPABASE_URL     = 'https://igavhfxwfsuyksnzbvfx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_6RL5se3g_FgxZFAcfWoWPQ_SFoxBi67';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: { params: { eventsPerSecond: 0 } }
});

/* 將 API eventID 轉成 8 位顯示編號（YYMMDD + 2 位 hash）
   純數字 ID（mock 資料）直接回傳 */
function fmtMatchId(id, commenceTime) {
  if (!id) return '';
  if (/^\d+$/.test(id)) return id;
  var dateStr = '';
  if (commenceTime) {
    var m = String(commenceTime).match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) dateStr = m[1].slice(2) + m[2] + m[3];
  }
  var h = 0;
  for (var i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) & 0x7FFFFFFF;
  }
  return dateStr + String(h % 100).padStart(2, '0');
}
