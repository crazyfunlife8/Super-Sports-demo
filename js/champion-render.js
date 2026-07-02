/* champion-render.js — 冠軍聯賽（世界盃足球）表格渲染與編輯模式
   依賴：supabase-client.js → live-bets-render.js（fmtOdds/fmtAmt/_fmtTime/startLiveCountdown）
         → champion-data.js → champion-render.js */

window.billfnChampion = window.billfnChampion || {};

var _champMatches = [];  // 供 JSONB 嵌套欄位更新用的快取

/* ── 票券 span ── */
function champTicketSpan(count, amount, matchId, betType, side, isEdit) {
  if (isEdit) {
    return `<span class="edit-champ-ticket" style="color:red;cursor:pointer"
      data-match-id="${matchId}" data-bet-type="${betType}" data-side="${side}" data-field="count">${count}</span>/<span
      class="edit-champ-ticket" style="cursor:pointer"
      data-match-id="${matchId}" data-bet-type="${betType}" data-side="${side}" data-field="amount">${fmtAmt(amount)}</span>`;
  }
  return `<span style="color:red">${count}</span>/${fmtAmt(amount)}`;
}

/* ── 可點擊編輯 span（賽事資料欄位） ── */
function champCell(value, matchId, col, key, isEdit) {
  var display = (value !== undefined && value !== null && value !== 0) ? value : '';
  if (!isEdit) return display;
  var attrs = `data-match-id="${matchId}" data-col="${col}"` + (key ? ` data-key="${key}"` : '');
  return `<span class="edit-champ-cell" style="cursor:pointer;min-width:20px;display:inline-block;border-bottom:1px dashed #aaa" ${attrs}>${display}</span>`;
}

/* ── 建立一場賽事的列 ── */
function buildChampRow(match, tickets, isEdit) {
  var id = match.match_id;
  var t = tickets[id] || {
    handicap:    { home:{count:0,amount:0}, away:{count:0,amount:0} },
    totals:      { over:{count:0,amount:0}, under:{count:0,amount:0} },
    moneyline:   { home:{count:0,amount:0}, away:{count:0,amount:0} },
    odd_even:    { odd:{count:0,amount:0},  even:{count:0,amount:0} },
    first_inning:{ home:{count:0,amount:0}, away:{count:0,amount:0} }
  };
  var sp = match.spread       || { home_line:'', away_line:'', home_odds:0, away_odds:0 };
  var tt = match.totals       || { line:'', over_odds:0, under_odds:0 };
  var ml = match.moneyline    || { home_odds:0, away_odds:0 };
  var oe = match.odd_even     || { odd_odds:0, even_odds:0 };
  var fi = match.first_inning || { home_line:'', away_line:'', home_odds:0, away_odds:0,
                                   total_line:'', over_odds:0, under_odds:0,
                                   ml_home_odds:0, ml_away_odds:0 };

  var hdpHome = champTicketSpan(t.handicap.home.count,     t.handicap.home.amount,     id, 'handicap',    'home', isEdit);
  var hdpAway = champTicketSpan(t.handicap.away.count,     t.handicap.away.amount,     id, 'handicap',    'away', isEdit);
  var ouOver  = champTicketSpan(t.totals.over.count,       t.totals.over.amount,       id, 'totals',      'over', isEdit);
  var ouUnder = champTicketSpan(t.totals.under.count,      t.totals.under.amount,      id, 'totals',      'under', isEdit);
  var mlHome  = champTicketSpan(t.moneyline.home.count,    t.moneyline.home.amount,    id, 'moneyline',   'home', isEdit);
  var mlAway  = champTicketSpan(t.moneyline.away.count,    t.moneyline.away.amount,    id, 'moneyline',   'away', isEdit);
  var oeOdd   = champTicketSpan(t.odd_even.odd.count,      t.odd_even.odd.amount,      id, 'odd_even',    'odd',  isEdit);
  var oeEven  = champTicketSpan(t.odd_even.even.count,     t.odd_even.even.amount,     id, 'odd_even',    'even', isEdit);
  var fiHome  = champTicketSpan(t.first_inning.home.count, t.first_inning.home.amount, id, 'first_inning','home', isEdit);
  var fiAway  = champTicketSpan(t.first_inning.away.count, t.first_inning.away.amount, id, 'first_inning','away', isEdit);

  var delBtn = isEdit
    ? `<button class="del-champ-row btn btn-danger py-0 px-1 ms-1" data-match-id="${id}" style="font-size:10px;line-height:1.4">✕</button>`
    : '';

  return `<tr data-match-id="${id}">
    <th style="width:90px;white-space:nowrap">${id.slice(0,8)}${delBtn}</th>
    <th style="width:90px">${champCell(match.commence_time, id, 'commence_time', '', isEdit)}</th>
    <td style="width:120px;text-align:left!important;white-space:nowrap">
      <div>
        <div>${champCell(match.away_team, id, 'away_team', '', isEdit)}</div>
        <div>${champCell(match.home_team, id, 'home_team', '', isEdit)}<span class="text-danger">[主]</span></div>
      </div>
    </td>
    <td status="0"><div>
      <div>&nbsp;${champCell(sp.away_line, id, 'spread', 'away_line', isEdit)}</div>
      <div>&nbsp;${champCell(sp.home_line, id, 'spread', 'home_line', isEdit)}</div>
    </div></td>
    <td status="0"><div>
      <div>${champCell(fmtOdds(sp.away_odds), id, 'spread', 'away_odds', isEdit)}</div>
      <div>${champCell(fmtOdds(sp.home_odds), id, 'spread', 'home_odds', isEdit)}</div>
    </div></td>
    <td status="0"><div><div>${hdpAway}</div><div>${hdpHome}</div></div></td>
    <td status="0"><div>
      <div>&nbsp;${champCell(tt.line, id, 'totals', 'line', isEdit)}</div>
      <div>小</div>
    </div></td>
    <td status="0"><div>
      <div>${champCell(fmtOdds(tt.over_odds), id, 'totals', 'over_odds', isEdit)}</div>
      <div>${champCell(fmtOdds(tt.under_odds), id, 'totals', 'under_odds', isEdit)}</div>
    </div></td>
    <td status="0"><div><div>${ouOver}</div><div>${ouUnder}</div></div></td>
    <td status="0"><div>
      <div>${champCell(fmtOdds(ml.away_odds), id, 'moneyline', 'away_odds', isEdit)}</div>
      <div>${champCell(fmtOdds(ml.home_odds), id, 'moneyline', 'home_odds', isEdit)}</div>
    </div></td>
    <td status="0"><div><div>${mlAway}</div><div>${mlHome}</div></div></td>
    <td status="0"><div><div>單</div><div>雙</div></div></td>
    <td status="0"><div>
      <div>${champCell(fmtOdds(oe.odd_odds), id, 'odd_even', 'odd_odds', isEdit)}</div>
      <div>${champCell(fmtOdds(oe.even_odds), id, 'odd_even', 'even_odds', isEdit)}</div>
    </div></td>
    <td status="0"><div><div>${oeOdd}</div><div>${oeEven}</div></div></td>
    <td class="" status="0">
      <div class="d-flex justify-content-center rules">
        <div>
          <div>&nbsp;${champCell(fi.away_line, id, 'first_inning', 'away_line', isEdit)}</div>
          <div>&nbsp;${champCell(fi.home_line, id, 'first_inning', 'home_line', isEdit)}</div>
        </div>
        <div>
          <div>${champCell(fmtOdds(fi.away_odds), id, 'first_inning', 'away_odds', isEdit)}</div>
          <div>${champCell(fmtOdds(fi.home_odds), id, 'first_inning', 'home_odds', isEdit)}</div>
        </div>
        <div><div>${fiAway}</div><div>${fiHome}</div></div>
      </div>
    </td>
  </tr>`;
}

/* ── 主渲染 ── */
function renderChampion(matches, tickets) {
  _champMatches = matches;
  var isEdit = (typeof editSvc !== 'undefined') && editSvc.isEditMode();

  var addBtn = isEdit
    ? `<div class="mb-2"><button id="btnAddChampMatch" class="btn btn-sm btn-success"><i class="bi bi-plus-circle me-1"></i>新增賽事</button></div>`
    : '';

  if (matches.length === 0) {
    $('#liveBetsContainer').html(addBtn + '<div class="p-4 text-center text-muted">暫無賽事</div>');
    if (isEdit) editSvcChampion.bindHandlers();
    return;
  }

  var rows = matches.map(function (m) { return buildChampRow(m, tickets, isEdit); }).join('');

  $('#liveBetsContainer').html(addBtn + `
    <div class="table-responsive">
      <table class="table table-sm table-hover pre-tables" style="width:100%">
        <colgroup>
          <col style="width:5.5%">
          <col style="width:5.5%">
          <col style="width:8%">
          <col style="width:6%">
          <col style="width:5%">
          <col style="width:7%">
          <col style="width:6.5%">
          <col style="width:5%">
          <col style="width:7%">
          <col style="width:4.5%">
          <col style="width:5.5%">
          <col style="width:2.5%">
          <col style="width:4%">
          <col style="width:5.5%">
          <col style="width:22.5%">
        </colgroup>
        <thead>
          <tr>
            <th colspan="15" style="color:#000;background:rgb(248,205,205)!important;text-align:left;font-size:12pt;border:none!important">
              世界盃足球
            </th>
          </tr>
          <tr>
            <th scope="col">編號</th>
            <th class="data-title" scope="col">時間</th>
            <th scope="col">場次 / 隊伍</th>
            <th scope="col" colspan="3">讓分 / 注單</th>
            <th scope="col" colspan="3">大小盤 / 注單</th>
            <th scope="col" colspan="2">獨贏</th>
            <th scope="col" colspan="3">單雙</th>
            <th scope="col" colspan="1">一輸二贏</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `);

  if (isEdit) { editSvcChampion.bindHandlers(); }
}

/* ── 編輯模式 ── */
var editSvcChampion = {

  bindHandlers: function () {
    var self = this;
    var $c = $('#liveBetsContainer');

    $('#btnAddChampMatch').off('click').on('click', function () {
      dataSvcChampion.addMatch().then(function () { billfnChampion.Refresh(); });
    });

    $c.off('click.del-champ', '.del-champ-row')
      .on('click.del-champ', '.del-champ-row', function () {
        var matchId = $(this).data('match-id');
        if (!confirm('確定刪除此場賽事？')) return;
        dataSvcChampion.deleteMatch(matchId).then(function () { billfnChampion.Refresh(); });
      });

    $c.off('click.edit-champ', '.edit-champ-cell')
      .on('click.edit-champ', '.edit-champ-cell', function () {
        self.startCellEdit($(this));
      });

    $c.off('click.edit-ticket', '.edit-champ-ticket')
      .on('click.edit-ticket', '.edit-champ-ticket', function () {
        self.startTicketEdit($(this));
      });
  },

  startCellEdit: function ($span) {
    if ($span.find('input').length) return;
    var raw     = $span.text().trim();
    var matchId = $span.data('match-id');
    var col     = $span.data('col');
    var key     = $span.data('key');

    var $input = $('<input class="form-control form-control-sm d-inline-block" />')
      .val(raw)
      .css({ width: '72px' });
    $span.html($input);
    $input.focus().select();

    function save() {
      var val = $input.val().trim();
      if (key) {
        var match = _champMatches.find(function (m) { return m.match_id === matchId; });
        if (!match) { billfnChampion.Refresh(); return; }
        var jsonObj = JSON.parse(JSON.stringify(match[col] || {}));
        var isNum = key.indexOf('odds') !== -1;
        jsonObj[key] = isNum ? (parseFloat(val) || 0) : val;
        dataSvcChampion.updateMatchField(matchId, col, jsonObj)
          .then(function () { billfnChampion.Refresh(); });
      } else {
        dataSvcChampion.updateMatchField(matchId, col, val)
          .then(function () { billfnChampion.Refresh(); });
      }
    }

    $input
      .on('keydown', function (e) {
        if (e.key === 'Enter')  { e.preventDefault(); save(); }
        if (e.key === 'Escape') { billfnChampion.Refresh(); }
      })
      .on('blur', save);
  },

  startTicketEdit: function ($span) {
    if ($span.find('input').length) return;
    var raw     = $span.text().trim().replace(/,/g, '');
    var matchId = $span.data('match-id');
    var betType = $span.data('bet-type');
    var side    = $span.data('side');
    var field   = $span.data('field');

    var $input = $('<input class="form-control form-control-sm d-inline-block" />')
      .val(raw)
      .css({ width: '60px' });
    $span.html($input);
    $input.focus().select();

    function save() {
      var val = Number($input.val().replace(/,/g, '')) || 0;
      dataSvcChampion.saveTicket(matchId, betType, side, field, val)
        .then(function () { billfnChampion.Refresh(); });
    }

    $input
      .on('keydown', function (e) {
        if (e.key === 'Enter')  { e.preventDefault(); save(); }
        if (e.key === 'Escape') { billfnChampion.Refresh(); }
      })
      .on('blur', save);
  }
};

/* ── 公開介面 ── */
billfnChampion.Refresh = function () {
  Promise.all([dataSvcChampion.loadMatches(), dataSvcChampion.loadTickets()])
    .then(function (results) {
      renderChampion(results[0], results[1]);
      startLiveCountdown();
    });
};
