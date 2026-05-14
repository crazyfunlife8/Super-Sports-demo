/* render.js — 表格渲染、合計列計算、正負值顏色、billfn.showcol / billfn.Refresh */

window.billfn = window.billfn || {};

/* 欄位定義：7 個階級，依序對應 thead 欄位順序 */
const RESULT_LEVELS = [
  { wIdx: 1, field: 'member_result',         simple: true  },  // 會員（無 s0/s1）
  { wIdx: 3, field: 'agent_result',           simple: false },  // 代理
  { wIdx: 5, field: 'super_agent_result',     simple: false },  // 總代
  { wIdx: 6, field: 'shareholder_result',     simple: false },  // 股東
  { wIdx: 7, field: 'big_shareholder_result', simple: false },  // 大股東
  { wIdx: 8, field: 'director_result',        simple: false },  // 總監
  { wIdx: 9, field: 'big_director_result',    simple: false }   // 大總監
];

const SUM_FIELDS = [
  'bet_count', 'bet_amount', 'valid_bet', 'pending_amount',
  'member_result', 'agent_result', 'super_agent_result',
  'shareholder_result', 'big_shareholder_result', 'director_result', 'big_director_result'
];

/* ── 工具函式 ── */

function fmtNum(n) {
  const v = Number(n);
  return isNaN(v) ? '' : v.toLocaleString('en-US');
}

function resultSpan(value) {
  const n = Number(value) || 0;
  const color = n >= 0 ? 'green' : '#dc3545';
  return `<span style="color:${color}">${fmtNum(n)}</span>`;
}

/* ── 階級欄位（返水 toggle + 結果）─ 資料列與合計列共用 ── */

function buildLevelCells(row, isEditMode) {
  return RESULT_LEVELS.map(function (lv) {
    const val = Number(row[lv.field]) || 0;
    const editAttrs = (isEditMode && row.id !== 'total')
      ? ` data-edit-field="${lv.field}" data-site-id="${row.id}"`
      : '';

    /* tbody td：只放數值，onclick/箭頭/文字標籤是 thead th 的結構 */
    const rebateCell = lv.simple
      ? `<td class="w1" style="display:none">0</td>`
      : `<td class="w${lv.wIdx}" data-v="${lv.wIdx}" style="display:none">` +
        `<span class="w${lv.wIdx}s0">0</span>` +
        `<span class="w${lv.wIdx}s1">0</span>` +
        `</td>`;

    const dvAttr = lv.simple ? '' : ` data-v="${lv.wIdx}"`;
    const resultCell = `<td${dvAttr}${editAttrs}>${resultSpan(val)}</td>`;

    return rebateCell + resultCell;
  }).join('');
}

/* ── 資料列 ── */

function buildDataRow(site, isEditMode) {
  const rate = site.rate_scheme || '';
  const w99Cells = Array(21).fill(null)
    .map(() => `<td class="w99" style="display:none">${rate}</td>`)
    .join('');

  const deleteBtn = isEditMode
    ? `<button class="btn btn-danger btn-sm ms-2 p-0 px-1 delete-site-btn" ` +
      `data-site-id="${site.id}" title="刪除此列">` +
      `<i class="bi bi-trash"></i></button>`
    : '';

  const ea = (f) => isEditMode
    ? ` data-edit-field="${f}" data-site-id="${site.id}"`
    : '';

  return `<tr data-site-id="${site.id}">
    <td${ea('site_name')}>${site.site_name}${deleteBtn}</td>
    <td${ea('bet_count')}>${fmtNum(site.bet_count)}</td>
    <td${ea('bet_amount')}><a href="javascript:void(0)"><span style="color:blue">${fmtNum(site.bet_amount)}</span></a></td>
    <td${ea('valid_bet')}>${fmtNum(site.valid_bet)}</td>
    <td${ea('pending_amount')}>${fmtNum(site.pending_amount)}</td>
    ${buildLevelCells(site, isEditMode)}
    <td${ea('remark')}>${site.remark || ''}</td>
    <td class="date-edit-col"><input type="date" class="site-date-input form-control form-control-sm p-1"
      data-site-id="${site.id}" data-field="display_date_from"
      value="${site.display_date_from || ''}"></td>
    <td class="date-edit-col"><input type="date" class="site-date-input form-control form-control-sm p-1"
      data-site-id="${site.id}" data-field="display_date_to"
      value="${site.display_date_to || ''}"></td>
    ${w99Cells}
  </tr>`;
}

/* ── 合計列 ── */

function buildTotalRow(sites) {
  const totals = { id: 'total' };
  SUM_FIELDS.forEach(f => {
    totals[f] = sites.reduce((s, r) => s + (Number(r[f]) || 0), 0);
  });

  const w99Cells = Array(21).fill('<td class="w99" style="display:none"></td>').join('');

  return `<tr class="last">
    <td><span>合計</span></td>
    <td>${fmtNum(totals.bet_count)}</td>
    <td><span style="color:blue">${fmtNum(totals.bet_amount)}</span></td>
    <td>${fmtNum(totals.valid_bet)}</td>
    <td>${fmtNum(totals.pending_amount)}</td>
    ${buildLevelCells(totals, false)}
    <td></td>
    <td class="date-edit-col"></td>
    <td class="date-edit-col"></td>
    ${w99Cells}
  </tr>`;
}

/* ── 主渲染 ── */

function renderTable(sites) {
  const isEditMode = (typeof editSvc !== 'undefined') && editSvc.isEditMode();

  let html = sites.map(s => buildDataRow(s, isEditMode)).join('');
  html += buildTotalRow(sites);

  if (isEditMode) {
    html += `<tr><td colspan="45">
      <button class="btn btn-outline-primary btn-sm add-site-btn">
        <i class="bi bi-plus-circle"></i> 新增網站
      </button>
    </td></tr>`;
  }

  $('#sitesBody').html(html);
}

/* ── 日期欄 change handler（總是綁定，欄位本身由 CSS 控制顯示） ── */

function bindSiteDateHandlers() {
  $('#sitesBody').off('change.date', '.site-date-input')
    .on('change.date', '.site-date-input', function () {
      var siteId = $(this).data('site-id');
      var field  = $(this).data('field');
      var value  = $(this).val();
      dataSvc.saveSite(siteId, field, value);
    });
}

/* ── billfn 公開介面 ── */

billfn.Refresh = function () {
  dataSvc.loadSites().then(function (sites) {
    var isEdit = (typeof editSvc !== 'undefined') && editSvc.isEditMode();
    var from = $('#txtStartDate').val();
    var to   = $('#txtEndDate').val();

    /* 編輯模式顯示全部；一般模式才套用日期篩選 */
    var filtered = (!isEdit && (from || to)) ? sites.filter(function (s) {
      var sf = s.display_date_from || '';
      var st = s.display_date_to   || '';
      if (!sf && !st) return true;
      if (from && st && st < from) return false;
      if (to   && sf && sf > to)   return false;
      return true;
    }) : sites;

    renderTable(filtered);
    bindSiteDateHandlers();
    if (isEdit) {
      editSvc.bindHandlers();
    }
  });
};

billfn.showcol = function (el) {
  const $el = $(el);
  let idx, $groupTh, show;

  if (el.tagName === 'INPUT' && el.type === 'checkbox') {
    /* Row-2 checkbox：顯示/隱藏整欄 + 調整 group header colspan */
    idx = $el.data('idx');
    $groupTh = $el.closest('th');
    show = el.checked;
    if (show) {
      $('.w' + idx).show();
      $groupTh.attr('colspan', 2);
    } else {
      $('.w' + idx).hide();
      $groupTh.attr('colspan', 1);
    }
  } else {
    /* Row-3 .w{idx} th 點擊：切換 上級返水 ↔ 未拆帳，並反向箭頭 */
    idx = $el.data('v');
    const $arrow = $el.find(`span[data-idx="${idx}"]`);
    const state = parseInt($arrow.attr('data-show')) || 0;

    if (state === 0) {
      $el.find(`.w${idx}s0`).hide();
      $el.find(`.w${idx}s1`).show();
      $arrow.attr('data-show', 1).css({ display: 'inline-block', transform: 'scaleX(-1)' });
    } else {
      $el.find(`.w${idx}s1`).hide();
      $el.find(`.w${idx}s0`).show();
      $arrow.attr('data-show', 0).css({ display: 'inline-block', transform: 'scaleX(1)' });
    }
  }
};

/* ── 初始化 ── */
$(function () {
  billfn.Refresh();

  /* V-10：Supabase Realtime — sites 表有任何變動立即重新整理 */
  _supabase
    .channel('sites-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'sites' }, function () {
      billfn.Refresh();
    })
    .subscribe();
});
