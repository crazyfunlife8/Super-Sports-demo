/* bet-records-render.js — 賽事帳表格渲染、完整原站交易內容、編輯模式 */

window.betRecordsFn = window.betRecordsFn || {};

/* ── 常數 ── */

const BR_SPORT_PREFIX = {
  'baseball_mlb':  '美棒-MLB 美國職棒',
  'baseball_cpbl': '台棒-CPBL 中華職棒',
  'baseball_npb':  '日棒-NPB 日本職棒'
};

const BR_BET_TYPES = ['讓分盤', '大小盤', '獨贏', '單雙', '一輸二贏', '台盤讓分'];

/* 各層級欄位對應（用於 buildLevelCells） */
const BR_LEVELS = [
  { wIdx: 1, key: 'member_result',          simple: true  },
  { wIdx: 3, key: 'agent_result',           simple: false },
  { wIdx: 5, key: 'super_agent_result',     simple: false },
  { wIdx: 6, key: 'shareholder_result',     simple: false },
  { wIdx: 7, key: 'big_shareholder_result', simple: false },
  { wIdx: 8, key: 'director_result',        simple: false },
  { wIdx: 9, key: 'big_director_result',    simple: false }
];

/* ── 工具 ── */

function brFmt(n) {
  const v = Math.round(Number(n) || 0);
  return v.toLocaleString('en-US');
}

function brResultSpan(n) {
  const v = Number(n) || 0;
  return `<span style="color:${v >= 0 ? 'green' : '#dc3545'}">${brFmt(v)}</span>`;
}

function brFmtDatetime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth()+1)}/${p(d.getDate())} ` +
         `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/* bet_choice "紐約洋基 -1+35@0.95" → { team, hcp, odds } */
function brParseBetChoice(s) {
  if (!s) return { team: '', hcp: '', odds: '' };
  const at   = s.lastIndexOf('@');
  const odds = at >= 0 ? s.slice(at + 1) : '';
  const pre  = at >= 0 ? s.slice(0, at)  : s;
  const sp   = pre.lastIndexOf(' ');
  return {
    team: sp >= 0 ? pre.slice(0, sp) : pre,
    hcp:  sp >= 0 ? pre.slice(sp + 1) : '',
    odds
  };
}

/* ── 欄位建構 ── */

/* 各層級結果欄（從 record 讀取已儲存的值） */
function brLevelCells(r) {
  return BR_LEVELS.map(function (lv) {
    const val = Number(r[lv.key]) || 0;
    const rebate = lv.simple
      ? `<td class="w1" style="display:none">0</td>`
      : `<td class="w${lv.wIdx}" data-v="${lv.wIdx}" style="display:none">` +
        `<span class="w${lv.wIdx}s0">0</span><span class="w${lv.wIdx}s1">0</span></td>`;
    const dvAttr = lv.simple ? '' : ` data-v="${lv.wIdx}"`;
    return rebate + `<td${dvAttr}>${brResultSpan(val)}</td>`;
  }).join('');
}

/* 交易內容欄（還原原站完整格式） */
function brBuildContent(r, isEdit) {
  if (!r.away_team && !r.home_team) {
    const inner = isEdit
      ? `<span class="br-match-cell text-muted" data-record-id="${r.id}" style="cursor:pointer;text-decoration:underline dotted">＋ 設定賽事</span>`
      : `（未設定賽事）`;
    return `<td style="text-align:left;white-space:nowrap"><div>${inner}</div></td>`;
  }

  const prefix  = BR_SPORT_PREFIX[r.sport] || r.sport || '';
  const session = r.match_session || '全場早餐';
  const editBtn = isEdit
    ? ` <span class="br-match-cell" data-record-id="${r.id}" style="cursor:pointer;color:#888;font-size:11px">[編輯]</span>`
    : '';
  const line1   = `${prefix}-${session}-${r.bet_type || ''}${editBtn}`;

  const asHtml = r.away_score !== null && r.away_score !== undefined
    ? `[<span style="color:#23ba1e">${r.away_score}</span>]` : '';
  const hsHtml = r.home_score !== null && r.home_score !== undefined
    ? `[<span style="color:#23ba1e">${r.home_score}</span>]` : '';
  const line2 = `${r.away_team || ''}${asHtml} V.S ${r.home_team || ''}(主)${hsHtml}`;

  let line3 = '';
  if (r.bet_choice) {
    const bc = brParseBetChoice(r.bet_choice);
    line3 = `<span><span style="color:#1a6aeb">${bc.team}</span> ` +
             `<span style="color:red">${bc.hcp}</span>@` +
             `<span style="color:red">${bc.odds}</span></span>`;
  }

  const parts = [
    line1,
    line2,
    line3,
    r.commence_time ? `開賽時間:${r.commence_time}` : '',
    r.settle_time   ? `派彩時間:${r.settle_time}`   : '',
    r.outcome       ? `<span style="color:red">${r.outcome}</span>` : ''
  ].filter(Boolean);

  return `<td style="text-align:left;white-space:nowrap"><div>${parts.join('<br />')}</div></td>`;
}

/* 單號欄 */
function brTicketCell(r, isEdit) {
  const betTypeHtml = isEdit
    ? `<select class="form-select form-select-sm br-bettype-select" data-record-id="${r.id}" style="display:inline-block;width:auto">` +
      BR_BET_TYPES.map(t => `<option${t === r.bet_type ? ' selected' : ''}>${t}</option>`).join('') +
      `</select>`
    : (r.bet_type || '');

  const acctHtml = isEdit
    ? `<span class="br-account-edit" data-record-id="${r.id}" style="color:blue;cursor:pointer">${r.account_name || '（未填）'}</span>`
    : `<span style="color:blue">${r.account_name || ''}</span>`;

  return `<td style="text-align:center">${betTypeHtml}<br />${r.ticket_no || ''}<br />${acctHtml}</td>`;
}

/* 資料列 */
function brDataRow(r, isEdit) {
  const bet = Number(r.bet_amount) || 0;

  const amtHtml = isEdit
    ? `<span class="br-amount-edit" data-record-id="${r.id}" style="cursor:pointer">${brFmt(bet)}</span>`
    : brFmt(bet);

  const deleteBtn = isEdit
    ? `<button class="btn btn-danger btn-sm p-0 px-1 ms-1 br-delete-btn" data-record-id="${r.id}">` +
      `<i class="bi bi-trash"></i></button>`
    : '';

  return `<tr data-record-id="${r.id}">
    <td style="text-align:center">${brFmtDatetime(r.created_at)}${deleteBtn}</td>
    ${brTicketCell(r, isEdit)}
    ${brBuildContent(r, isEdit)}
    <td>${amtHtml}</td>
    <td>${brFmt(r.valid_bet !== undefined ? r.valid_bet : bet)}</td>
    ${brLevelCells(r)}
    <td class="w99" style="display:none">${r.rate_scheme ? `<div class="row p-2" style="margin:0;background-color:#c4e3cb;width:270px"><div class="col-2">成數:</div><div class="col-10 p-0">${r.rate_scheme}</div></div>` : ''}</td>
    <td class="w99" style="display:none"></td>
  </tr>`;
}

/* 合計列 */
function brTotalRow(records) {
  const sum = (key) => records.reduce((s, r) => s + (Number(r[key]) || 0), 0);
  const totalBet   = sum('bet_amount');
  const totalValid = sum('valid_bet');

  const totalRecord = {
    member_result:          sum('member_result'),
    agent_result:           sum('agent_result'),
    super_agent_result:     sum('super_agent_result'),
    shareholder_result:     sum('shareholder_result'),
    big_shareholder_result: sum('big_shareholder_result'),
    director_result:        sum('director_result'),
    big_director_result:    sum('big_director_result')
  };

  return `<tr>
    <td colspan="3">合計</td>
    <td>${brFmt(totalBet)}</td>
    <td>${brFmt(totalValid)}</td>
    ${brLevelCells(totalRecord)}
    <td class="w99" style="display:none"></td>
    <td class="w99" style="display:none"></td>
  </tr>`;
}

/* ── 主渲染 ── */

function brRenderTable(records, isEdit) {
  let html = records.map(function (r) { return brDataRow(r, isEdit); }).join('');
  html += brTotalRow(records);

  if (isEdit) {
    html += `<tr><td colspan="21">
      <button class="btn btn-outline-primary btn-sm br-add-btn">
        <i class="bi bi-plus-circle"></i> 新增注單
      </button>
    </td></tr>`;
  }

  $('#betRecordsBody').html(html);
  brBindHandlers(isEdit);
}

/* ── 賽事設定 Modal ── */

function brInitMatchModal() {
  if ($('#brMatchEditModal').length) return;
  $('body').append(`
    <div class="modal fade" id="brMatchEditModal" tabindex="-1">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header py-2">
            <h6 class="modal-title mb-0">設定賽事資料</h6>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="mb-3">
              <label class="form-label fw-bold small">選擇賽事（點擊選取）</label>
              <div class="btn-group btn-group-sm mb-1" id="brSportFilter">
                <button class="btn btn-outline-secondary active" data-sport="">全部</button>
                <button class="btn btn-outline-secondary" data-sport="baseball_mlb">美棒</button>
                <button class="btn btn-outline-secondary" data-sport="baseball_cpbl">台棒</button>
                <button class="btn btn-outline-secondary" data-sport="baseball_npb">日棒</button>
              </div>
              <div id="brMatchList" style="max-height:200px;overflow-y:auto;border:1px solid #dee2e6;border-radius:4px;font-size:13px"></div>
            </div>
            <div class="row g-2">
              <div class="col-sm-6">
                <label class="form-label small">場次</label>
                <select class="form-select form-select-sm" id="brEditSession">
                  <option>全場早餐</option><option>全場</option><option>半場</option>
                </select>
              </div>
              <div class="col-sm-6">
                <label class="form-label small">結果</label>
                <select class="form-select form-select-sm" id="brEditOutcome">
                  <option value="">（未派彩）</option>
                  <option>全贏</option><option>全輸</option>
                  <option>半贏</option><option>半輸</option><option>和局</option>
                </select>
              </div>
              <div class="col-12">
                <label class="form-label small">投注選擇</label>
                <div id="brBetChoiceOptions" class="mb-1" style="display:none"></div>
                <input class="form-control form-control-sm" id="brEditBetChoice" placeholder="選取賽事後自動產生，或手動填入">
              </div>
              <div class="col-sm-6">
                <label class="form-label small">客隊比分</label>
                <input class="form-control form-control-sm" type="number" id="brEditAwayScore" placeholder="空白=未知">
              </div>
              <div class="col-sm-6">
                <label class="form-label small">主隊比分</label>
                <input class="form-control form-control-sm" type="number" id="brEditHomeScore" placeholder="空白=未知">
              </div>
              <div class="col-sm-6">
                <label class="form-label small">派彩時間</label>
                <input class="form-control form-control-sm" id="brEditSettleTime" placeholder="例：2026-06-16 14:30">
              </div>
            </div>
          </div>
          <div class="modal-footer py-2">
            <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">取消</button>
            <button type="button" class="btn btn-primary btn-sm" id="brMatchSaveBtn">儲存</button>
          </div>
        </div>
      </div>
    </div>
  `);
}

var _brEditRecordId = null;
var _brSelectedMatch = null;
var _brAllMatches = [];

const _brSportLabel = { baseball_mlb:'美棒', baseball_cpbl:'台棒', baseball_npb:'日棒' };
const _brSportBadge = { baseball_mlb:'primary', baseball_cpbl:'success', baseball_npb:'danger' };

function brRenderMatchList(sport) {
  const list = sport ? _brAllMatches.filter(m => m.sport === sport) : _brAllMatches;
  if (!list.length) { $('#brMatchList').html('<div class="p-2 text-muted">無資料</div>'); return; }
  const rows = list.map(function (m) {
    const time = m.commence_time ? m.commence_time.slice(0,16).replace('T',' ') : '';
    const safe = JSON.stringify(m).replace(/'/g, '&#39;');
    return `<div class="br-match-option px-2 py-1" data-match='${safe}'
      style="cursor:pointer;border-bottom:1px solid #f0f0f0">
      <span class="badge bg-${_brSportBadge[m.sport]||'secondary'} me-1">${_brSportLabel[m.sport]||m.sport}</span>
      ${m.away_team} v ${m.home_team}(主)
      <small class="text-muted ms-2">${time}</small>
    </div>`;
  }).join('');
  $('#brMatchList').html(rows);
}

function brFmtChoice(line, bookOdds) {
  if (line === '' || line == null) return '';
  var s = String(line);
  var o = Number(bookOdds);
  if (o && o !== -100 && o !== 100) {
    var vig = o > 0 ? o - 100 : o + 100;
    s += (vig >= 0 ? '+' : '') + vig;
  }
  return s;
}

function brRenderBetChoiceOptions(m) {
  var sp = m.spread       || {};
  var ou = m.totals       || {};
  var ml = m.moneyline    || {};
  var oe = m.odd_even     || {};
  var fi = m.first_inning || {};
  var home = m.home_team, away = m.away_team;
  var opts = [];

  /* 全場讓分 */
  if (sp.home_odds) opts.push({ group:'讓分', label: `${home}(主) ${brFmtChoice(sp.home_line, sp.home_book_odds)}@${sp.home_odds}` });
  if (sp.away_odds) opts.push({ group:'讓分', label: `${away} ${brFmtChoice(sp.away_line, sp.away_book_odds)}@${sp.away_odds}` });
  /* 全場大小 */
  if (ou.over_odds)  opts.push({ group:'大小', label: `大 ${ou.line||''}@${ou.over_odds}` });
  if (ou.under_odds) opts.push({ group:'大小', label: `小 ${ou.line||''}@${ou.under_odds}` });
  /* 全場獨贏 */
  if (ml.home_odds) opts.push({ group:'獨贏', label: `${home}(主)@${ml.home_odds}` });
  if (ml.away_odds) opts.push({ group:'獨贏', label: `${away}@${ml.away_odds}` });
  /* 單雙 */
  if (oe.odd_odds)  opts.push({ group:'單雙', label: `單@${oe.odd_odds}` });
  if (oe.even_odds) opts.push({ group:'單雙', label: `雙@${oe.even_odds}` });
  /* 半場讓分 */
  if (fi.home_odds) opts.push({ group:'半場讓分', label: `${home}(主) ${brFmtChoice(fi.home_line, fi.home_book_odds)}@${fi.home_odds}` });
  if (fi.away_odds) opts.push({ group:'半場讓分', label: `${away} ${brFmtChoice(fi.away_line, fi.away_book_odds)}@${fi.away_odds}` });
  /* 半場大小 */
  if (fi.over_odds)  opts.push({ group:'半場大小', label: `大 ${fi.total_line||''}@${fi.over_odds}` });
  if (fi.under_odds) opts.push({ group:'半場大小', label: `小 ${fi.total_line||''}@${fi.under_odds}` });
  /* 半場獨贏 */
  if (fi.ml_home_odds) opts.push({ group:'半場獨贏', label: `${home}(主)@${fi.ml_home_odds}` });
  if (fi.ml_away_odds) opts.push({ group:'半場獨贏', label: `${away}@${fi.ml_away_odds}` });

  if (!opts.length) { $('#brBetChoiceOptions').hide(); return; }

  /* 依 group 分組渲染 */
  var groups = {};
  opts.forEach(function (o) {
    if (!groups[o.group]) groups[o.group] = [];
    var val = o.label.trim();
    groups[o.group].push(`<button type="button" class="btn btn-sm btn-outline-secondary br-choice-btn me-1 mb-1" data-value="${val}">${val}</button>`);
  });

  var html = Object.keys(groups).map(function (g) {
    return `<div class="mb-1"><small class="text-muted me-1">${g}：</small>${groups[g].join('')}</div>`;
  }).join('');

  $('#brBetChoiceOptions').html(html).show();
}

function brOpenMatchModal(recordId) {
  brInitMatchModal();
  _brEditRecordId  = recordId;
  _brSelectedMatch = null;
  $('#brSportFilter .btn').removeClass('active');
  $('#brSportFilter .btn[data-sport=""]').addClass('active');

  /* 載入賽事清單 */
  $('#brMatchList').html('<div class="p-2 text-muted">載入中...</div>');
  _supabase.from('matches')
    .select('match_id,sport,away_team,home_team,commence_time,status,spread,totals,moneyline,odd_even,first_inning')
    .in('sport', ['baseball_mlb','baseball_cpbl','baseball_npb'])
    .order('commence_time', { ascending: false })
    .limit(100)
    .then(function ({ data }) {
      _brAllMatches = data || [];
      brRenderMatchList('');
    });

  /* 若已有資料，預填欄位 */
  _supabase.from('bet_tickets').select('*').eq('id', recordId).maybeSingle()
    .then(function ({ data: r }) {
      if (!r) return;
      $('#brEditSession').val(r.match_session || '全場早餐');
      $('#brEditOutcome').val(r.outcome || '');
      $('#brEditBetChoice').val(r.bet_choice || '');
      $('#brEditAwayScore').val(r.away_score !== null ? r.away_score : '');
      $('#brEditHomeScore').val(r.home_score !== null ? r.home_score : '');
      $('#brEditSettleTime').val(r.settle_time || '');
    });

  new bootstrap.Modal(document.getElementById('brMatchEditModal')).show();
}

/* ── 編輯事件綁定 ── */

function brBindHandlers(isEdit) {
  if (!isEdit) return;
  const $body = $('#betRecordsBody');

  /* 盤口類型 */
  $body.off('change.br', '.br-bettype-select')
    .on('change.br', '.br-bettype-select', function () {
      const id = $(this).data('record-id');
      betRecordsDataSvc.saveRecord(id, { bet_type: $(this).val() })
        .then(function () { betRecordsFn.Refresh(); });
    });

  /* 帳號 inline */
  $body.off('click.br', '.br-account-edit')
    .on('click.br', '.br-account-edit', function () {
      const $span = $(this);
      if ($span.find('input').length) return;
      const id  = $span.data('record-id');
      const raw = $span.text().trim() === '（未填）' ? '' : $span.text().trim();
      const $inp = $('<input class="form-control form-control-sm" />').val(raw).css({ width: '120px' });
      $span.html($inp);
      $inp.focus().select();
      const save = function () {
        betRecordsDataSvc.saveRecord(id, { account_name: $inp.val().trim() })
          .then(function () { betRecordsFn.Refresh(); });
      };
      $inp.on('keydown', function (e) {
        if (e.key === 'Enter')  { e.preventDefault(); save(); }
        if (e.key === 'Escape') { betRecordsFn.Refresh(); }
      }).on('blur', save);
    });

  /* 下注金額 inline → 同步更新各層級結果 */
  $body.off('click.br', '.br-amount-edit')
    .on('click.br', '.br-amount-edit', function () {
      const $span = $(this);
      if ($span.find('input').length) return;
      const id  = $span.data('record-id');
      const raw = $span.text().trim().replace(/,/g, '');
      const $inp = $('<input class="form-control form-control-sm" type="number" min="0" />')
        .val(raw).css({ width: '90px' });
      $span.html($inp);
      $inp.focus().select();
      const save = function () {
        const amt = Math.round(Number($inp.val()) || 0);
        betRecordsDataSvc.saveRecord(id, {
          bet_amount:             amt,
          valid_bet:              amt,
          member_result:          Math.round(amt * 0.99),
          agent_result:           amt,
          super_agent_result:     Math.round(amt * 0.05),
          shareholder_result:     Math.round(amt * 0.05),
          big_shareholder_result: Math.round(amt * 0.05),
          director_result:        Math.round(amt * 0.05),
          big_director_result:    Math.round(amt * 0.03)
        }).then(function () { betRecordsFn.Refresh(); });
      };
      $inp.on('keydown', function (e) {
        if (e.key === 'Enter')  { e.preventDefault(); save(); }
        if (e.key === 'Escape') { betRecordsFn.Refresh(); }
      }).on('blur', save);
    });

  /* 刪除 */
  $body.off('click.br', '.br-delete-btn')
    .on('click.br', '.br-delete-btn', function () {
      const id = $(this).data('record-id');
      if (!confirm('確定刪除此注單？此操作無法復原。')) return;
      betRecordsDataSvc.deleteRecord(id).then(function () { betRecordsFn.Refresh(); });
    });

  /* 新增 */
  $body.off('click.br', '.br-add-btn')
    .on('click.br', '.br-add-btn', function () {
      betRecordsDataSvc.createRecord().then(function () { betRecordsFn.Refresh(); });
    });

  /* 設定賽事：點擊內容格 */
  $body.off('click.br', '.br-match-cell')
    .on('click.br', '.br-match-cell', function (e) {
      e.stopPropagation();
      e.preventDefault();
      brOpenMatchModal($(this).data('record-id'));
    });

  /* Modal：運動分類過濾 */
  $(document).off('click.br', '#brSportFilter .btn')
    .on('click.br', '#brSportFilter .btn', function () {
      $('#brSportFilter .btn').removeClass('active');
      $(this).addClass('active');
      brRenderMatchList($(this).data('sport'));
    });

  /* Modal：選取賽事 → 生成投注選項 */
  $(document).off('click.br', '.br-match-option')
    .on('click.br', '.br-match-option', function () {
      $('.br-match-option').css({ background: '' });
      $(this).css({ background: '#dbeafe' });
      _brSelectedMatch = JSON.parse($(this).attr('data-match'));
      brRenderBetChoiceOptions(_brSelectedMatch);
    });

  /* Modal：點選投注選項 → 填入輸入框 */
  $(document).off('click.br', '.br-choice-btn')
    .on('click.br', '.br-choice-btn', function () {
      $('.br-choice-btn').removeClass('btn-primary').addClass('btn-outline-secondary');
      $(this).removeClass('btn-outline-secondary').addClass('btn-primary');
      $('#brEditBetChoice').val($(this).data('value'));
    });

  /* Modal：儲存 */
  $(document).off('click.br', '#brMatchSaveBtn')
    .on('click.br', '#brMatchSaveBtn', function () {
      if (!_brEditRecordId) return;

      const fields = {
        match_session: $('#brEditSession').val(),
        outcome:       $('#brEditOutcome').val() || null,
        bet_choice:    $('#brEditBetChoice').val().trim() || null,
        away_score:    $('#brEditAwayScore').val() !== '' ? Number($('#brEditAwayScore').val()) : null,
        home_score:    $('#brEditHomeScore').val() !== '' ? Number($('#brEditHomeScore').val()) : null,
        settle_time:   $('#brEditSettleTime').val().trim() || null,
      };

      if (_brSelectedMatch) {
        fields.sport        = _brSelectedMatch.sport;
        fields.away_team    = _brSelectedMatch.away_team;
        fields.home_team    = _brSelectedMatch.home_team;
        fields.commence_time = _brSelectedMatch.commence_time
          ? _brSelectedMatch.commence_time.slice(0,16).replace('T',' ')
          : null;
      }

      betRecordsDataSvc.saveRecord(_brEditRecordId, fields).then(function () {
        bootstrap.Modal.getInstance(document.getElementById('brMatchEditModal')).hide();
        betRecordsFn.Refresh();
      });
    });
}

/* ── 公開介面 ── */

var _brFilterActive = false;

betRecordsFn.Refresh = function () {
  const isEdit    = (typeof editSvc !== 'undefined') && editSvc.isEditMode();
  const filters   = (isEdit || !_brFilterActive) ? null : {
    dateFrom: $('#txtStartDate').val() || null,
    dateTo:   $('#txtEndDate').val()   || null,
    account:  $('#txtqMemID').val().trim()    || null,
    ticketNo: $('#txtqTicketID').val().trim() || null
  };

  betRecordsDataSvc.loadRecords(filters).then(function (records) {
    brRenderTable(records, isEdit);
  });
};

betRecordsFn.activateFilter = function () {
  _brFilterActive = true;
  betRecordsFn.Refresh();
};
