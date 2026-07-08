/* edit.js — 編輯模式偵測、inline 欄位編輯、新增列、刪除列 */

window.editSvc = {

  isEditMode() {
    const urlParam = new URLSearchParams(window.location.search).get('edit');
    if (urlParam === 'true')  { sessionStorage.setItem('editMode', 'true');  return true; }
    if (urlParam === 'false') { sessionStorage.removeItem('editMode');        return false; }
    return sessionStorage.getItem('editMode') === 'true';
  },

  setMarquee(rawLines) {
    const separator = '　'.repeat(15);
    const joined = rawLines
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .join(separator);
    $('#marq').text((joined + separator).repeat(3));
  },

  applyDisplaySetting(key, value) {
    if (key === 'marquee_text')    { this.setMarquee(value); return; }
    if (key === 'header_username') { $('#headerUsername').text(value); return; }
    if (key === 'header_role')     { $('#headerRole').text(value); return; }
    if (key === 'header_credit')   { $('#headerCredit').text(value); return; }
  },

  init() {
    const self = this;

    /* 立即用 localStorage 渲染，避免 Supabase 回應前空白 */
    ['marquee_text', 'header_username', 'header_role', 'header_credit'].forEach(function (k) {
      const v = localStorage.getItem(k);
      if (v) self.applyDisplaySetting(k, v);
    });

    /* 從 Supabase 一次載入所有 display_settings（跨裝置同步） */
    _supabase.from('display_settings').select('key, value')
      .then(function ({ data }) {
        if (!data) return;
        data.forEach(function (row) {
          self.applyDisplaySetting(row.key, row.value);
          localStorage.setItem(row.key, row.value);
        });
      });

    /* Realtime：監聽整張 display_settings，任何 key 修改後即時更新 */
    _supabase.channel('display-settings-all')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'display_settings' },
        function (payload) {
          const row = payload.new;
          if (row?.key && row?.value) {
            self.applyDisplaySetting(row.key, row.value);
            localStorage.setItem(row.key, row.value);
          }
        }
      )
      .subscribe();

    if (!this.isEditMode()) return;

    $('body').addClass('is-edit');
    $('#editModeIndicator').show();
    this.bindHeaderHandlers();
    this.initGlobalActions();
  },

  initGlobalActions() {
    $('footer').after(`
      <div id="globalActionPanel" style="
        display:flex;flex-direction:column;gap:6px;width:160px;
        margin-left:auto;padding:1rem 1rem 1.5rem;">
        <button id="btnExitEdit"     class="btn btn-sm btn-dark"><i class="bi bi-box-arrow-right me-1"></i>退出編輯模式</button>
        <hr class="my-1" style="border-color:#aaa">
        <button id="btnExportJson"   class="btn btn-sm btn-outline-secondary"><i class="bi bi-download me-1"></i>匯出 JSON</button>
        <button id="btnImportJson"   class="btn btn-sm btn-outline-secondary"><i class="bi bi-upload me-1"></i>匯入 JSON</button>
        <input  id="importJsonFile"  type="file" accept=".json" style="display:none">
        <hr class="my-1" style="border-color:#aaa">
        <button id="btnExportExcelTpl" class="btn btn-sm btn-outline-success"><i class="bi bi-file-earmark-excel me-1"></i>匯出 Excel 範本</button>
        <button id="btnImportExcel"    class="btn btn-sm btn-outline-success"><i class="bi bi-file-earmark-arrow-up me-1"></i>匯入 Excel 業績</button>
        <input  id="importExcelFile"   type="file" accept=".xlsx,.xls" style="display:none">
        <button id="btnSyncApi"      class="btn btn-sm btn-info text-white"><i class="bi bi-arrow-repeat me-1"></i>立刻同步 API</button>
        <small id="lastSyncTime" style="color:#888;font-size:11px;text-align:center"></small>
        <button id="btnBatchFill"    class="btn btn-sm btn-primary"><i class="bi bi-shuffle me-1"></i>批量隨機填注單</button>
        <hr class="my-1" style="border-color:#aaa">
        <button id="btnClearTickets" class="btn btn-sm btn-warning"><i class="bi bi-eraser me-1"></i>清空注單彙總</button>
        <button id="btnClearSites"   class="btn btn-sm btn-warning"><i class="bi bi-eraser me-1"></i>清空網站業績</button>
        <button id="btnResetData"    class="btn btn-sm btn-danger"><i class="bi bi-arrow-counterclockwise me-1"></i>重置預設資料</button>
      </div>
    `);

    /* ── 退出編輯模式 ── */
    $('#btnExitEdit').on('click', function () {
      sessionStorage.removeItem('editMode');
      var qs = new URLSearchParams(window.location.search);
      qs.delete('edit');
      location.href = window.location.pathname + (qs.toString() ? '?' + qs.toString() : '');
    });

    /* ── 匯出 JSON ── */
    $('#btnExportJson').on('click', async function () {
      try {
        const [r1, r2, r3] = await Promise.all([
          _supabase.from('sites').select('*').order('created_at'),
          _supabase.from('tickets_aggregate').select('*'),
          _supabase.from('matches').select('*').order('commence_time')
        ]);
        const payload = {
          exported_at: new Date().toISOString(),
          sites: r1.data || [],
          tickets_aggregate: r2.data || [],
          matches: r3.data || []
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `backup_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (e) {
        alert('匯出失敗：' + e.message);
      }
    });

    /* ── 匯入 JSON ── */
    $('#btnImportJson').on('click', function () {
      $('#importJsonFile').trigger('click');
    });

    $('#importJsonFile').on('change', async function () {
      const file = this.files[0];
      if (!file) return;
      this.value = '';
      try {
        const text = await file.text();
        const json = JSON.parse(text);
        const sitesCount   = (json.sites || []).length;
        const ticketsCount = (json.tickets_aggregate || []).length;
        if (!confirm(`即將匯入：\n• 網站業績 ${sitesCount} 筆\n• 注單彙總 ${ticketsCount} 筆\n\n現有資料將被覆蓋，確定繼續？`)) return;

        await _supabase.from('sites').delete().not('id', 'is', null);
        await _supabase.from('tickets_aggregate').delete().not('id', 'is', null);

        if (json.sites?.length) {
          const rows = json.sites.map(({ id, ...rest }) => rest);
          const { error } = await _supabase.from('sites').insert(rows);
          if (error) throw new Error('sites: ' + error.message);
        }
        if (json.tickets_aggregate?.length) {
          const rows = json.tickets_aggregate.map(({ id, ...rest }) => rest);
          const { error } = await _supabase.from('tickets_aggregate').insert(rows);
          if (error) throw new Error('tickets_aggregate: ' + error.message);
        }

        alert('匯入完成。');
        _refreshCurrentPage();
      } catch (e) {
        alert('匯入失敗：' + e.message);
      }
    });

    /* ── 查詢報表 Excel 匯入／匯出 ── */
    const EXCEL_COL_MAP = {
      '網站名稱':   { field: 'site_name',            type: 'str'  },
      '日期':       { field: 'display_date',          type: 'date' },
      '注單筆數':   { field: 'bet_count',             type: 'num'  },
      '投注金額':   { field: 'bet_amount',            type: 'num'  },
      '有效金額':   { field: 'valid_bet',             type: 'num'  },
      '待結算':     { field: 'pending_amount',         type: 'num'  },
      '會員輸贏':   { field: 'member_result',          type: 'num'  },
      '代理輸贏':   { field: 'agent_result',           type: 'num'  },
      '總代輸贏':   { field: 'super_agent_result',     type: 'num'  },
      '股東輸贏':   { field: 'shareholder_result',     type: 'num'  },
      '大股東輸贏': { field: 'big_shareholder_result', type: 'num'  },
      '總監輸贏':   { field: 'director_result',        type: 'num'  },
      '大總監輸贏': { field: 'big_director_result',    type: 'num'  },
      '備註':       { field: 'remark',                type: 'str'  }
    };
    const EXCEL_HEADERS = Object.keys(EXCEL_COL_MAP);

    $('#btnExportExcelTpl').on('click', function () {
      if (typeof XLSX === 'undefined') { alert('Excel 函式庫尚未載入，請重新整理後再試。'); return; }
      try {
        const today = new Date().toISOString().slice(0, 10);
        const exampleRow = ['示範網站A', today, 100, 500000, 450000, 0, -5000, 2500, 1250, 625, 312, 156, 78, ''];
        const ws = XLSX.utils.aoa_to_sheet([EXCEL_HEADERS, exampleRow]);
        ws['!cols'] = EXCEL_HEADERS.map(() => ({ wch: 14 }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, '查詢報表');
        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = '查詢報表匯入範本.xlsx';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (e) {
        alert('匯出失敗：' + e.message);
      }
    });

    $('#btnImportExcel').on('click', function () {
      $('#importExcelFile').trigger('click');
    });

    $('#importExcelFile').on('change', async function () {
      const file = this.files[0];
      if (!file) return;
      this.value = '';
      if (typeof XLSX === 'undefined') { alert('Excel 函式庫尚未載入，請重新整理後再試。'); return; }

      function excelDateToStr(val) {
        if (!val && val !== 0) return '';
        if (val instanceof Date) return val.toISOString().slice(0, 10);
        if (typeof val === 'number') {
          const d = new Date(Math.round((val - 25569) * 86400 * 1000));
          return d.toISOString().slice(0, 10);
        }
        return String(val).trim();
      }

      try {
        const buf  = await file.arrayBuffer();
        const wb   = XLSX.read(buf, { type: 'array', cellDates: true });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (!rows.length) { alert('Excel 內無資料列。'); return; }

        const today = new Date().toISOString().slice(0, 10);

        const toInsert = rows.map(function (row) {
          const rec = {
            bet_count: 0, bet_amount: 0, valid_bet: 0, pending_amount: 0,
            member_result: 0, agent_result: 0, super_agent_result: 0,
            shareholder_result: 0, big_shareholder_result: 0,
            director_result: 0, big_director_result: 0,
            remark: '', rate_scheme: '', display_date: ''
          };
          EXCEL_HEADERS.forEach(function (h) {
            const meta = EXCEL_COL_MAP[h];
            const v = row[h];
            if (meta.type === 'num') {
              rec[meta.field] = Number(String(v).replace(/,/g, '')) || 0;
            } else if (meta.type === 'date') {
              rec[meta.field] = excelDateToStr(v);
            } else {
              rec[meta.field] = (v !== undefined && v !== null) ? String(v).trim() : '';
            }
          });
          if (!rec.display_date) rec.display_date = today;
          return rec;
        }).filter(function (r) { return r.site_name; });

        if (!toInsert.length) { alert('沒有有效資料列（網站名稱不可空白）。'); return; }
        if (!confirm(`即將新增 ${toInsert.length} 筆網站業績資料，確定繼續？`)) return;

        const { error } = await _supabase.from('sites').insert(toInsert);
        if (error) throw new Error(error.message);

        alert(`匯入完成，共新增 ${toInsert.length} 筆。`);
        if (typeof billfn !== 'undefined') billfn.Refresh();
      } catch (e) {
        alert('匯入失敗：' + e.message);
      }
    });

    /* ── 立刻同步 API ── */
    $('#btnSyncApi').on('click', async function () {
      if (!confirm('立刻同步今日所有賽事？\n・MLB / CPBL / NPB：ag.amg888.net')) return;
      const $btn = $(this);
      $btn.prop('disabled', true).html('<i class="bi bi-hourglass-split me-1"></i>同步中...');
      try {
        const { data, error } = await _supabase.functions.invoke('sync-amg');
        if (error) throw new Error(error.message);
        const now = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        $('#lastSyncTime').text('上次同步：' + now);
        alert(`同步完成（${now}）\n共 ${data?.total ?? 0} 場\n${(data?.log ?? []).join('\n')}`);
        _refreshCurrentPage();
      } catch (e) {
        alert('同步失敗：' + e.message);
      } finally {
        $btn.prop('disabled', false).html('<i class="bi bi-arrow-repeat me-1"></i>立刻同步 API');
      }
    });

    /* ── 批量隨機填注單 ── */
    const BET_SLOTS = [
      ['handicap',       'home'], ['handicap',       'away'],
      ['totals',         'over'], ['totals',         'under'],
      ['moneyline',      'home'], ['moneyline',      'away'],
      ['odd_even',       'odd'],  ['odd_even',       'even'],
      ['first_inning',   'home'], ['first_inning',   'away'],
      ['half_totals',    'over'], ['half_totals',    'under'],
      ['half_moneyline', 'home'], ['half_moneyline', 'away'],
    ];

    $('#btnBatchFill').on('click', async function () {
      if (!confirm('為所有賽事批量生成隨機注單資料？\n現有注單資料將被清除並覆寫。')) return;
      try {
        let matchIds;
        const { data: matchRows } = await _supabase.from('matches').select('match_id');
        if (matchRows && matchRows.length > 0) {
          matchIds = matchRows.map(r => r.match_id);
        } else {
          matchIds = ['26050801','26050802','26050803',
                      '26050811','26050812','26050813',
                      '26050821','26050822','26050823'];
        }

        const rows = [];
        matchIds.forEach(function (matchId) {
          BET_SLOTS.forEach(function ([betType, betPosition]) {
            rows.push({
              match_id:     matchId,
              bet_type:     betType,
              bet_position: betPosition,
              count:        Math.floor(Math.random() * 120) + 5,
              total_amount: (Math.floor(Math.random() * 490) + 10) * 1000
            });
          });
        });

        await _supabase.from('tickets_aggregate').delete().not('id', 'is', null);
        const { error } = await _supabase.from('tickets_aggregate').insert(rows);
        if (error) throw new Error(error.message);

        alert(`批量填注完成，共 ${rows.length} 筆。`);
        _refreshCurrentPage();
      } catch (e) {
        alert('批量填注失敗：' + e.message);
      }
    });

    /* ── 清空注單彙總 ── */
    $('#btnClearTickets').on('click', async function () {
      if (!confirm('確定清空所有注單彙總資料？\n此操作無法復原。')) return;
      const { error } = await _supabase.from('tickets_aggregate').delete().not('id', 'is', null);
      if (error) { alert('清空失敗：' + error.message); return; }
      alert('注單彙總已清空。');
      _refreshCurrentPage();
    });

    /* ── 清空網站業績 ── */
    $('#btnClearSites').on('click', async function () {
      if (!confirm('確定清空所有網站業績資料？\n此操作無法復原。')) return;
      const { error } = await _supabase.from('sites').delete().not('id', 'is', null);
      if (error) { alert('清空失敗：' + error.message); return; }
      alert('網站業績已清空。');
      if (typeof billfn !== 'undefined') billfn.Refresh();
    });

    /* ── 重置預設資料 ── */
    const DEMO_SITES = [
      {
        site_name: '示範網站A',
        bet_count: 1250, bet_amount: 3800000, valid_bet: 3500000, pending_amount: 150000,
        member_result: -45000, agent_result: 22500, super_agent_result: 11250,
        shareholder_result: 5625, big_shareholder_result: 2812,
        director_result: 1406, big_director_result: 703,
        remark: '', rate_scheme: '',
        display_date: '2026-05-01'
      },
      {
        site_name: '示範網站B',
        bet_count: 870, bet_amount: 2200000, valid_bet: 2000000, pending_amount: 80000,
        member_result: 32000, agent_result: -16000, super_agent_result: -8000,
        shareholder_result: -4000, big_shareholder_result: -2000,
        director_result: -1000, big_director_result: -500,
        remark: '', rate_scheme: '',
        display_date: '2026-05-01'
      }
    ];

    $('#btnResetData').on('click', async function () {
      if (!confirm('確定重置為預設示範資料？\n目前所有資料將被清除並替換為預設資料，此操作無法復原。')) return;
      try {
        await Promise.all([
          _supabase.from('tickets_aggregate').delete().not('id', 'is', null),
          _supabase.from('sites').delete().not('id', 'is', null),
          _supabase.from('matches').delete().not('match_id', 'is', null)
        ]);
        const { error } = await _supabase.from('sites').insert(DEMO_SITES);
        if (error) throw new Error(error.message);
        alert('已重置為預設示範資料。');
        _refreshCurrentPage();
      } catch (e) {
        alert('重置失敗：' + e.message);
      }
    });
  },

  bindHeaderHandlers() {
    const self = this;

    $('body').off('click.header', '#headerUsername, #headerRole, #headerCredit')
      .on('click.header', '#headerUsername, #headerRole, #headerCredit', function () {
        self.startHeaderEdit($(this));
      });

    $('#marq').off('click').on('click', function (e) {
      e.preventDefault();
      e.stopImmediatePropagation();
      self.openMarqueeEdit();
    });
  },

  startHeaderEdit($el) {
    if ($el.find('input').length) return;
    const raw = $el.text().trim();
    const $input = $('<input class="form-control form-control-sm d-inline-block" />')
      .val(raw)
      .css({ width: Math.max(80, raw.length * 9) + 'px' });

    $el.html($input);
    $input.focus().select();

    const KEY_MAP = {
      headerUsername: 'header_username',
      headerRole:     'header_role',
      headerCredit:   'header_credit'
    };
    const settingKey = KEY_MAP[$el.attr('id')];

    const restore = () => { $el.text(raw); };
    const save = () => {
      const val = $input.val().trim();
      const finalVal = val || raw;
      $el.text(finalVal);
      if (settingKey) {
        localStorage.setItem(settingKey, finalVal);
        _supabase.from('display_settings')
          .upsert({ key: settingKey, value: finalVal }, { onConflict: 'key' })
          .then(function ({ error }) {
            if (error) console.warn('header sync failed:', error.message);
          });
      }
    };

    $input
      .on('keydown', function (e) {
        if (e.key === 'Enter')  { e.preventDefault(); save(); }
        if (e.key === 'Escape') { restore(); }
      })
      .on('blur', save);
  },

  openMarqueeEdit() {
    const raw = localStorage.getItem('marquee_text') || '';
    $('#marqueeEditText').val(raw);
    new bootstrap.Modal(document.getElementById('marqueeEditModal')).show();
  },

  saveMarquee() {
    const text = $('#marqueeEditText').val().trim();
    if (text) {
      localStorage.setItem('marquee_text', text);
      this.setMarquee(text);
      _supabase.from('display_settings')
        .upsert({ key: 'marquee_text', value: text }, { onConflict: 'key' })
        .then(function ({ error }) {
          if (error) console.warn('marquee sync failed:', error.message);
        });
    }
    bootstrap.Modal.getInstance(document.getElementById('marqueeEditModal')).hide();
  },

  bindHandlers() {
    const self = this;
    const $body = $('#sitesBody');

    $body.off('click.edit', '[data-edit-field]')
      .on('click.edit', '[data-edit-field]', function (e) {
        if ($(e.target).is('button, i, input, a')) return;
        self.startEdit($(this));
      });

    $body.off('click.edit', '.delete-site-btn')
      .on('click.edit', '.delete-site-btn', function () {
        const id = $(this).data('site-id');
        if (!confirm('確定刪除此列？')) return;
        dataSvc.deleteSite(id).then(() => billfn.Refresh());
      });

    $body.off('click.edit', '.add-site-btn')
      .on('click.edit', '.add-site-btn', function () {
        dataSvc.addSite().then(() => billfn.Refresh());
      });
  },

  startEdit($td) {
    if ($td.find('input').length) return;

    const field   = $td.data('edit-field');
    const siteId  = $td.data('site-id');
    const rawText = $td.text().trim().replace(/,/g, '');

    const $input = $('<input class="form-control form-control-sm" />')
      .val(rawText)
      .css({ minWidth: '60px', width: '100%', boxSizing: 'border-box' });

    $td.html($input);
    $input.focus().select();

    const NUM_FIELDS = new Set([
      'bet_count', 'bet_amount', 'valid_bet', 'pending_amount',
      'member_result', 'agent_result', 'super_agent_result',
      'shareholder_result', 'big_shareholder_result',
      'director_result', 'big_director_result'
    ]);

    const save = () => {
      let val = $input.val().trim();
      if (NUM_FIELDS.has(field)) {
        val = Number(val.replace(/,/g, '')) || 0;
      }
      dataSvc.saveSite(siteId, field, val).then(() => billfn.Refresh());
    };

    $input
      .on('keydown', function (e) {
        if (e.key === 'Enter')  { e.preventDefault(); save(); }
        if (e.key === 'Escape') { billfn.Refresh(); }
      })
      .on('blur', save);
  }
};

/* 依目前所在頁面呼叫對應的 Refresh */
function _refreshCurrentPage() {
  if (typeof billfn         !== 'undefined') billfn.Refresh();
  if (typeof billfnLive     !== 'undefined') billfnLive.Refresh();
  if (typeof billfnHistory  !== 'undefined') billfnHistory.Refresh();
}

$(function () {
  editSvc.init();
});
