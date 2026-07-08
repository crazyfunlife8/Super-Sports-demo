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

/* ── 分組列（View & Edit 模式皆用，Edit 模式可展開） ── */

function buildGroupRow(group, isEditMode, idx) {
  const isExpanded = _expandedGroups.has(group.site_name);
  const expandBtn = isEditMode
    ? `<button class="btn btn-link btn-sm p-0 me-1 text-dark"
         onclick="billfn._toggleGroup(${idx});return false;"
         title="${isExpanded ? '收合' : '展開個別記錄'}"
         style="font-size:11px;line-height:1;text-decoration:none">${isExpanded ? '▼' : '▶'}</button>`
    : '';

  const rate = group.rate_scheme || '';
  const w99Cells = Array(21).fill(null)
    .map(() => `<td class="w99" style="display:none">${rate}</td>`)
    .join('');

  return `<tr class="group-row"${isEditMode ? ' style="font-weight:600"' : ''}>
    <td>${expandBtn}${group.site_name}</td>
    <td>${fmtNum(group.bet_count)}</td>
    <td><a href="javascript:void(0)"><span style="color:blue">${fmtNum(group.bet_amount)}</span></a></td>
    <td>${fmtNum(group.valid_bet)}</td>
    <td>${fmtNum(group.pending_amount)}</td>
    ${buildLevelCells(group, false)}
    <td>${group.remark || ''}</td>
    ${w99Cells}
  </tr>`;
}

/* ── 個別記錄列（Edit 模式展開後顯示） ── */

function buildIndividualRow(site) {
  const rate = site.rate_scheme || '';
  const w99Cells = Array(21).fill(null)
    .map(() => `<td class="w99" style="display:none">${rate}</td>`)
    .join('');

  const deleteBtn = `<button class="btn btn-danger btn-sm ms-2 p-0 px-1 delete-site-btn"
    data-site-id="${site.id}" title="刪除此列"><i class="bi bi-trash"></i></button>`;

  const ea = (f) => ` data-edit-field="${f}" data-site-id="${site.id}"`;

  return `<tr class="individual-row" data-site-id="${site.id}"
      style="background:#f5f5f5;font-size:0.92em">
    <td style="padding-left:2rem"${ea('site_name')}>${site.site_name}${deleteBtn}</td>
    <td${ea('bet_count')}>${fmtNum(site.bet_count)}</td>
    <td${ea('bet_amount')}><a href="javascript:void(0)"><span style="color:blue">${fmtNum(site.bet_amount)}</span></a></td>
    <td${ea('valid_bet')}>${fmtNum(site.valid_bet)}</td>
    <td${ea('pending_amount')}>${fmtNum(site.pending_amount)}</td>
    ${buildLevelCells(site, true)}
    <td${ea('remark')}>${site.remark || ''}</td>
    ${w99Cells}
  </tr>`;
}

/* ── 合計列 ── */

function buildTotalRow(groups) {
  const totals = { id: 'total' };
  SUM_FIELDS.forEach(f => {
    totals[f] = groups.reduce((s, r) => s + (Number(r[f]) || 0), 0);
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
    ${w99Cells}
  </tr>`;
}

/* ── 主渲染 ── */

function renderTable(groups, filteredSites, isEditMode) {
  billfn._groups = groups;   // 供 _toggleGroup 依 index 查 site_name
  let html = '';
  groups.forEach(function (group, idx) {
    html += buildGroupRow(group, isEditMode, idx);
    if (isEditMode && _expandedGroups.has(group.site_name)) {
      filteredSites
        .filter(s => (s.site_name || '') === group.site_name)
        .forEach(function (site) { html += buildIndividualRow(site); });
    }
  });
  html += buildTotalRow(groups);
  if (isEditMode) {
    html += `<tr><td colspan="45">
      <button class="btn btn-outline-primary btn-sm add-site-btn">
        <i class="bi bi-plus-circle"></i> 新增網站
      </button>
    </td></tr>`;
  }
  $('#sitesBody').html(html);
}

/* ── 依網站名稱分組加總 ── */

function _groupBySiteName(sites) {
  var groups = {};
  var order  = [];
  sites.forEach(function (s) {
    var name = s.site_name || '';
    if (!groups[name]) {
      groups[name] = {
        id: 'grp_' + name,
        site_name: name,
        bet_count: 0, bet_amount: 0, valid_bet: 0, pending_amount: 0,
        member_result: 0, agent_result: 0, super_agent_result: 0,
        shareholder_result: 0, big_shareholder_result: 0,
        director_result: 0, big_director_result: 0,
        remark: s.remark || '',
        rate_scheme: s.rate_scheme || '',
        display_date: ''
      };
      order.push(name);
    }
    SUM_FIELDS.forEach(function (f) {
      groups[name][f] = (Number(groups[name][f]) || 0) + (Number(s[f]) || 0);
    });
  });
  return order.map(function (name) { return groups[name]; });
}

/* ── 狀態 ── */

var _filterActive  = true;
var _expandedGroups = new Set();
var _cachedSites   = [];

/* ── 展開 / 收合（onclick 直接呼叫） ── */

billfn._toggleGroup = function (idx) {
  var groupName = (billfn._groups[idx] || {}).site_name;
  if (groupName === undefined) return;
  if (_expandedGroups.has(groupName)) {
    _expandedGroups.delete(groupName);
  } else {
    _expandedGroups.add(groupName);
  }
  billfn._renderFromCache();
};

/* ── 從快取重渲（expand/collapse 與日期切換共用，不打 DB） ── */

billfn._renderFromCache = function () {
  var isEdit = (typeof editSvc !== 'undefined') && editSvc.isEditMode();

  var filtered = _cachedSites;
  if (_filterActive) {
    var from = $('#txtStartDate').val();
    var to   = $('#txtEndDate').val();
    if (from || to) {
      filtered = _cachedSites.filter(function (s) {
        var sd = s.display_date || '';
        if (!sd) return true;
        if (from && sd < from) return false;
        if (to   && sd > to)   return false;
        return true;
      });
    }
  }

  var groups = _groupBySiteName(filtered);
  renderTable(groups, filtered, isEdit);
  if (isEdit) editSvc.bindHandlers();
};

/* ── 重新從 DB 載入再渲染 ── */

billfn.Refresh = function () {
  dataSvc.loadSites().then(function (sites) {
    _cachedSites = sites;
    billfn._renderFromCache();
  });
};

billfn.showcol = function (el) {
  const $el = $(el);
  let idx, $groupTh, show;

  if (el.tagName === 'INPUT' && el.type === 'checkbox') {
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
  /* 確保日期選單有初始值（flatpickr 可能尚未執行） */
  var today = new Date().toISOString().slice(0, 10);
  if (!$('#txtStartDate').val()) $('#txtStartDate').val(today);
  if (!$('#txtEndDate').val())   $('#txtEndDate').val(today);

  billfn.Refresh();

  /* Supabase Realtime — sites 表有任何變動立即重新整理 */
  _supabase
    .channel('sites-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'sites' }, function () {
      billfn.Refresh();
    })
    .subscribe();
});
