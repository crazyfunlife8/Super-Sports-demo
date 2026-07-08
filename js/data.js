/* data.js — 查詢報表頁資料存取（Supabase sites 表） */

window.dataSvc = {

  async loadSites() {
    const { data, error } = await _supabase
      .from('sites')
      .select('*')
      .order('created_at');
    if (error) { console.error('loadSites:', error); return []; }
    return data || [];
  },

  async saveSite(id, field, value) {
    const { error } = await _supabase
      .from('sites')
      .update({ [field]: value })
      .eq('id', id);
    if (error) console.error('saveSite:', error);
  },

  async deleteSite(id) {
    const { error } = await _supabase
      .from('sites')
      .delete()
      .eq('id', id);
    if (error) console.error('deleteSite:', error);
  },

  async addSite() {
    const today = new Date().toISOString().slice(0, 10);
    const date = $('#txtStartDate').val() || today;
    const { data, error } = await _supabase
      .from('sites')
      .insert({
        site_name: '新網站',
        bet_count: 0, bet_amount: 0, valid_bet: 0, pending_amount: 0,
        member_result: 0, agent_result: 0, super_agent_result: 0,
        shareholder_result: 0, big_shareholder_result: 0,
        director_result: 0, big_director_result: 0,
        remark: '', rate_scheme: '',
        display_date: date
      })
      .select()
      .single();
    if (error) console.error('addSite:', error);
    return data;
  }
};
