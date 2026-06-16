/* bet-records-data.js — 賽事帳 Supabase CRUD（資料表：bet_tickets） */

window.betRecordsDataSvc = {

  async loadRecords(filters) {
    let query = _supabase.from('bet_tickets').select('*').order('created_at', { ascending: false });

    if (filters) {
      if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom + 'T00:00:00');
      if (filters.dateTo)   query = query.lte('created_at', filters.dateTo   + 'T23:59:59');
      if (filters.account)  query = query.ilike('account_name', '%' + filters.account + '%');
      if (filters.ticketNo) query = query.ilike('ticket_no', filters.ticketNo + '%');
    }

    const { data, error } = await query;
    if (error) { console.error('loadRecords:', error); return []; }
    return data || [];
  },

  async saveRecord(id, fields) {
    const { error } = await _supabase.from('bet_tickets').update(fields).eq('id', id);
    if (error) console.error('saveRecord:', error);
  },

  async createRecord() {
    const ticketNo = String(Math.floor(Math.random() * 900000000) + 100000000);
    const { data, error } = await _supabase
      .from('bet_tickets')
      .insert({
        ticket_no: ticketNo, account_name: '', bet_type: '讓分盤',
        bet_amount: 0, valid_bet: 0,
        member_result: 0, agent_result: 0, super_agent_result: 0,
        shareholder_result: 0, big_shareholder_result: 0,
        director_result: 0, big_director_result: 0
      })
      .select().single();
    if (error) { console.error('createRecord:', error); return null; }
    return data;
  },

  async deleteRecord(id) {
    const { error } = await _supabase.from('bet_tickets').delete().eq('id', id);
    if (error) console.error('deleteRecord:', error);
  }
};
