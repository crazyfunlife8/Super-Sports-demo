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
function brBuildContent(r) {
  if (!r.away_team && !r.home_team) {
    return `<td style="text-align:left;white-space:nowrap"><div>（未設定賽事）</div></td>`;
  }

  const prefix  = BR_SPORT_PREFIX[r.sport] || r.sport || '';
  const session = r.match_session || '全場早餐';
  const line1   = `${prefix}-${session}-${r.bet_type || ''}`;

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
    ${brBuildContent(r)}
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
