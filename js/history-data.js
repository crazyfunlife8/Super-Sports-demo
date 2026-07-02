/* history-data.js — 歷史賽事頁資料存取（Supabase matches + tickets_aggregate） */

/* ── 暫用 Mock 資料（matches 表尚未 API 同步前的備援） ── */
const HIST_MATCHES = [
  /* ── MLB ── */
  {
    match_id: '26050801', sport: 'baseball_mlb',
    home_team: '洛杉磯道奇', away_team: '舊金山巨人',
    commence_time: '05-08 03:40',
    full_home_score: 5, full_away_score: 3,
    half_home_score: 3, half_away_score: 2,
    spread:       { home_line: '-1.5', away_line: '+1.5', home_odds: 0.95, away_odds: 0.85 },
    totals:       { line: '8.5', over_odds: 0.95, under_odds: 0.85 },
    moneyline:    { home_odds: 0.62, away_odds: 1.28 },
    odd_even:     { odd_odds: 0.95, even_odds: 0.85 },
    first_inning: { home_line: '+1.5', away_line: '-1.5', home_odds: 1.39, away_odds: 0.60 }
  },
  {
    match_id: '26050802', sport: 'baseball_mlb',
    home_team: '紐約洋基', away_team: '波士頓紅襪',
    commence_time: '05-08 06:05',
    full_home_score: null, full_away_score: null,
    half_home_score: 2, half_away_score: 1,
    spread:       { home_line: '-0.5', away_line: '+0.5', home_odds: 0.90, away_odds: 0.90 },
    totals:       { line: '9.0', over_odds: 0.90, under_odds: 0.90 },
    moneyline:    { home_odds: 0.75, away_odds: 1.10 },
    odd_even:     { odd_odds: 0.90, even_odds: 0.90 },
    first_inning: { home_line: '+0.5', away_line: '-0.5', home_odds: 1.25, away_odds: 0.70 }
  },
  {
    match_id: '26050803', sport: 'baseball_mlb',
    home_team: '芝加哥小熊', away_team: '聖路易紅雀',
    commence_time: '05-08 07:40',
    full_home_score: 4, full_away_score: 6,
    half_home_score: 2, half_away_score: 4,
    spread:       { home_line: '+0.5', away_line: '-0.5', home_odds: 0.88, away_odds: 0.92 },
    totals:       { line: '8.0', over_odds: 0.92, under_odds: 0.88 },
    moneyline:    { home_odds: 1.15, away_odds: 0.72 },
    odd_even:     { odd_odds: 0.92, even_odds: 0.88 },
    first_inning: { home_line: '-0.5', away_line: '+0.5', home_odds: 0.65, away_odds: 1.35 }
  },
  /* ── CPBL ── */
  {
    match_id: '26050811', sport: 'baseball_cpbl',
    home_team: '富邦悍將', away_team: '樂天桃猿',
    commence_time: '05-08 17:00',
    full_home_score: null, full_away_score: null,
    half_home_score: 1, half_away_score: 0,
    spread:       { home_line: '-0.5', away_line: '+0.5', home_odds: 0.90, away_odds: 0.90 },
    totals:       { line: '9.5', over_odds: 0.90, under_odds: 0.90 },
    moneyline:    { home_odds: 0.80, away_odds: 1.00 },
    odd_even:     { odd_odds: 0.90, even_odds: 0.90 },
    first_inning: { home_line: '+0.5', away_line: '-0.5', home_odds: 1.20, away_odds: 0.72 }
  },
  {
    match_id: '26050812', sport: 'baseball_cpbl',
    home_team: '中信兄弟', away_team: '統一7-ELEVEn獅',
    commence_time: '05-08 17:00',
    full_home_score: 7, full_away_score: 3,
    half_home_score: 4, half_away_score: 2,
    spread:       { home_line: '-1.5', away_line: '+1.5', home_odds: 0.92, away_odds: 0.88 },
    totals:       { line: '10.0', over_odds: 0.92, under_odds: 0.88 },
    moneyline:    { home_odds: 0.65, away_odds: 1.30 },
    odd_even:     { odd_odds: 0.92, even_odds: 0.88 },
    first_inning: { home_line: '-0.5', away_line: '+0.5', home_odds: 0.70, away_odds: 1.20 }
  },
  {
    match_id: '26050813', sport: 'baseball_cpbl',
    home_team: '味全龍', away_team: '台鋼雄鷹',
    commence_time: '05-08 18:35',
    full_home_score: null, full_away_score: null,
    half_home_score: null, half_away_score: null,
    spread:       { home_line: '+0.5', away_line: '-0.5', home_odds: 0.85, away_odds: 0.95 },
    totals:       { line: '9.0', over_odds: 0.88, under_odds: 0.92 },
    moneyline:    { home_odds: 1.10, away_odds: 0.78 },
    odd_even:     { odd_odds: 0.88, even_odds: 0.92 },
    first_inning: { home_line: '+1.5', away_line: '-1.5', home_odds: 1.40, away_odds: 0.58 }
  },
  /* ── NPB ── */
  {
    match_id: '26050821', sport: 'baseball_npb',
    home_team: '讀賣巨人', away_team: '阪神虎',
    commence_time: '05-08 11:00',
    full_home_score: 3, full_away_score: 2,
    half_home_score: 2, half_away_score: 1,
    spread:       { home_line: '-1.5', away_line: '+1.5', home_odds: 0.88, away_odds: 0.92 },
    totals:       { line: '7.5', over_odds: 0.90, under_odds: 0.90 },
    moneyline:    { home_odds: 0.70, away_odds: 1.20 },
    odd_even:     { odd_odds: 0.90, even_odds: 0.90 },
    first_inning: { home_line: '-0.5', away_line: '+0.5', home_odds: 0.72, away_odds: 1.20 }
  },
  {
    match_id: '26050822', sport: 'baseball_npb',
    home_team: '軟銀鷹', away_team: '西武獅',
    commence_time: '05-08 11:00',
    full_home_score: null, full_away_score: null,
    half_home_score: 3, half_away_score: 0,
    spread:       { home_line: '-2.5', away_line: '+2.5', home_odds: 0.92, away_odds: 0.88 },
    totals:       { line: '8.0', over_odds: 0.88, under_odds: 0.92 },
    moneyline:    { home_odds: 0.55, away_odds: 1.50 },
    odd_even:     { odd_odds: 0.88, even_odds: 0.92 },
    first_inning: { home_line: '-1.5', away_line: '+1.5', home_odds: 0.60, away_odds: 1.40 }
  },
  {
    match_id: '26050823', sport: 'baseball_npb',
    home_team: '橫濱DeNA海灣之星', away_team: '養樂多燕子',
    commence_time: '05-08 11:00',
    full_home_score: 6, full_away_score: 5,
    half_home_score: 3, half_away_score: 3,
    spread:       { home_line: '+0.5', away_line: '-0.5', home_odds: 0.88, away_odds: 0.92 },
    totals:       { line: '7.0', over_odds: 0.92, under_odds: 0.88 },
    moneyline:    { home_odds: 1.00, away_odds: 0.88 },
    odd_even:     { odd_odds: 0.92, even_odds: 0.88 },
    first_inning: { home_line: '+0.5', away_line: '-0.5', home_odds: 1.15, away_odds: 0.72 }
  }
];

/* ── 工具：將 tickets_aggregate 平行列轉為巢狀結構 ── */
function _histTicketsToNested(rows) {
  var result = {};
  (rows || []).forEach(function (r) {
    if (!result[r.match_id]) {
      result[r.match_id] = {
        handicap:       { home:{count:0,amount:0}, away: {count:0,amount:0} },
        totals:         { over:{count:0,amount:0}, under:{count:0,amount:0} },
        moneyline:      { home:{count:0,amount:0}, away: {count:0,amount:0} },
        odd_even:       { odd: {count:0,amount:0}, even: {count:0,amount:0} },
        first_inning:   { home:{count:0,amount:0}, away: {count:0,amount:0} },
        half_totals:    { over:{count:0,amount:0}, under:{count:0,amount:0} },
        half_moneyline: { home:{count:0,amount:0}, away: {count:0,amount:0} }
      };
    }
    var bt = r.bet_type, bp = r.bet_position;
    if (result[r.match_id][bt] && result[r.match_id][bt][bp] !== undefined) {
      result[r.match_id][bt][bp] = { count: r.count, amount: r.total_amount };
    }
  });
  return result;
}

/* ── 公開介面 ── */
window.dataSvcHistory = {

  async loadMatches() {
    const { data, error } = await _supabase
      .from('matches')
      .select('*')
      .in('sport', ['baseball_mlb', 'baseball_cpbl', 'baseball_npb'])
      .eq('status', 'completed')
      .order('commence_time', { ascending: true });
    if (error) { console.error('loadMatches:', error); return HIST_MATCHES; }
    return (data && data.length > 0) ? data : HIST_MATCHES;
  },

  async loadTickets() {
    const { data, error } = await _supabase
      .from('tickets_aggregate')
      .select('*');
    if (error) { console.error('loadTickets:', error); return {}; }
    return _histTicketsToNested(data);
  },

  async saveTicket(matchId, betType, side, field, value) {
    const col = field === 'count' ? 'count' : 'total_amount';
    const { data: existing } = await _supabase
      .from('tickets_aggregate')
      .select('id')
      .eq('match_id', matchId)
      .eq('bet_type', betType)
      .eq('bet_position', side)
      .maybeSingle();

    if (existing) {
      const { error } = await _supabase
        .from('tickets_aggregate')
        .update({ [col]: value, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      if (error) console.error('saveTicket update:', error);
    } else {
      const { error } = await _supabase
        .from('tickets_aggregate')
        .insert({
          match_id: matchId, bet_type: betType, bet_position: side,
          count:        field === 'count'  ? value : 0,
          total_amount: field === 'amount' ? value : 0
        });
      if (error) console.error('saveTicket insert:', error);
    }
  }
};
