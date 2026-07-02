/* champion-data.js — 冠軍聯賽資料存取（Supabase champion_matches + tickets_aggregate） */

function _champTicketsToNested(rows) {
  var result = {};
  (rows || []).forEach(function (r) {
    if (!result[r.match_id]) {
      result[r.match_id] = {
        handicap:    { home:{count:0,amount:0}, away:{count:0,amount:0} },
        totals:      { over:{count:0,amount:0}, under:{count:0,amount:0} },
        moneyline:   { home:{count:0,amount:0}, away:{count:0,amount:0} },
        odd_even:    { odd:{count:0,amount:0},  even:{count:0,amount:0} },
        first_inning:{ home:{count:0,amount:0}, away:{count:0,amount:0} }
      };
    }
    var bt = r.bet_type, bp = r.bet_position;
    if (result[r.match_id][bt] && result[r.match_id][bt][bp] !== undefined) {
      result[r.match_id][bt][bp] = { count: r.count, amount: r.total_amount };
    }
  });
  return result;
}

window.dataSvcChampion = {

  async loadMatches() {
    const { data, error } = await _supabase
      .from('champion_matches')
      .select('*')
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) { console.error('champion loadMatches:', error); return []; }
    return data || [];
  },

  async loadTickets() {
    const { data, error } = await _supabase
      .from('tickets_aggregate')
      .select('*');
    if (error) { console.error('champion loadTickets:', error); return {}; }
    return _champTicketsToNested(data);
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
      if (error) console.error('champion saveTicket update:', error);
    } else {
      const { error } = await _supabase
        .from('tickets_aggregate')
        .insert({
          match_id: matchId, bet_type: betType, bet_position: side,
          count:        field === 'count'  ? value : 0,
          total_amount: field === 'amount' ? value : 0
        });
      if (error) console.error('champion saveTicket insert:', error);
    }
  },

  async addMatch() {
    const matchId = 'champ_' + Date.now();
    const { error } = await _supabase.from('champion_matches').insert({
      match_id:     matchId,
      home_team:    '主隊',
      away_team:    '客隊',
      commence_time: '',
      spread:       { home_line: '', away_line: '', home_odds: 0, away_odds: 0 },
      totals:       { line: '', over_odds: 0, under_odds: 0 },
      moneyline:    { home_odds: 0, away_odds: 0 },
      odd_even:     { odd_odds: 0, even_odds: 0 },
      first_inning: { home_line: '', away_line: '', home_odds: 0, away_odds: 0,
                      total_line: '', over_odds: 0, under_odds: 0,
                      ml_home_odds: 0, ml_away_odds: 0 },
      display_order: 0
    });
    if (error) console.error('champion addMatch:', error);
  },

  async deleteMatch(matchId) {
    const { error } = await _supabase
      .from('champion_matches')
      .delete()
      .eq('match_id', matchId);
    if (error) console.error('champion deleteMatch:', error);
  },

  async updateMatchField(matchId, col, value) {
    const { error } = await _supabase
      .from('champion_matches')
      .update({ [col]: value, updated_at: new Date().toISOString() })
      .eq('match_id', matchId);
    if (error) console.error('champion updateMatchField:', error);
  }
};
