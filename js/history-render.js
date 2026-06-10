/* history-render.js — 歷史賽事頁表格渲染、球種切換、麵包屑連結、編輯模式 */

window.billfnHistory = window.billfnHistory || {};

function _fmtTime(t) {
  if (!t) return '';
  if (typeof t === 'string' && t.includes('T')) return t.slice(0, 16).replace('T', ' ');
  return t;
}

/* 賠率顯示：取小數點後兩位，0 或無效值回傳空字串 */
function fmtOdds(n) {
  var v = parseFloat(n);
  return (!isNaN(v) && v > 0) ? v.toFixed(2) : '';
}

/* 公水制：兩邊取算術平均，主客顯示同一水錢率 */
function avgOdds(o1, o2) {
  var a = parseFloat(o1), b = parseFloat(o2);
  if (a > 0 && b > 0) return fmtOdds((a + b) / 2);
  return fmtOdds(a > 0 ? a : b);
}

/* 讓分合併顯示：盤口 + 水錢（美式賠率 ±100 偏移） */
function fmtHandicap(line, bookOdds) {
  if (line === '' || line == null) return '';
  var n = parseFloat(line);
  if (isNaN(n) || n < 0) return '';          // 負數盤口（強隊方）不顯示
  var o = Number(bookOdds);
  if (!o || o === -100 || o === 100) return String(n);
  var vig = o > 0 ? o - 100 : o + 100;
  return String(n) + (vig >= 0 ? '+' : '') + String(vig);
}

var HIST_SPORT_DISPLAY = {
  baseball_mlb:  '美棒',
  baseball_cpbl: '台棒',
  baseball_npb:  '日棒'
};

var HIST_SPORT_TO_PARAM = {
  baseball_mlb:  'mlb',
  baseball_cpbl: 'cpbl',
  baseball_npb:  'npb'
};

var _histCurrentSport = 'baseball_mlb';

/* ── 工具 ── */

function histFmtAmt(n) {
  return Number(n).toLocaleString('en-US');
}

function histTicketCount(count, matchId, betType, side, isEdit) {
  if (isEdit) {
    return `<span class="edit-ticket-hist" style="color:red;cursor:pointer"
      data-match-id="${matchId}" data-bet-type="${betType}" data-side="${side}" data-field="count">${count}</span>`;
  }
  return `<span style="color:red">${count}</span>`;
}

function histTicketAmt(amount, matchId, betType, side, isEdit) {
  if (isEdit) {
    return `<span class="edit-ticket-hist" style="cursor:pointer"
      data-match-id="${matchId}" data-bet-type="${betType}" data-side="${side}" data-field="amount">${histFmtAmt(amount)}</span>`;
  }
  return histFmtAmt(amount);
}

/* ── 欄位 Cell 建構器 ── */

function histValCell(line1, line2) {
  return `<td style="border-left:1px solid rgb(255,193,7);padding:0 10px">
    <div><div>
      <div><span class="hdp">${line1}</span></div>
      <div><span class="hdp">${line2}</span></div>
    </div></div></td>`;
}

function histOddsCell(o1, o2) {
  return `<td style="padding:0 10px">
    <div><div>
      <div><span class="odds">${o1}</span></div>
      <div><span class="odds">${o2}</span></div>
    </div></div></td>`;
}

function histCountCell(c1, c2) {
  return `<td style="text-align:right">
    <div class="rules"><div><div>${c1}</div><div>${c2}</div></div></div></td>`;
}

function histAmtCell(a1, a2) {
  return `<td style="text-align:right;padding-right:10px">
    <div class="justify-content-center rules"><div><div>${a1}</div><div>${a2}</div></div></div></td>`;
}

function histScoreCell(home, away) {
  var h = (home !== null && home !== undefined) ? home : '';
  var a = (away !== null && away !== undefined) ? away : '';
  return `<td style="text-align:center!important;color:red;border-left:1px dotted rgb(206,212,218)">
    <div><div>
      <div style="font-size:12pt!important">${h}</div>
      <div style="font-size:12pt!important">${a}</div>
    </div></div></td>`;
}

/* ── 建立一場比賽的兩列（全場 + 半場） ── */

function buildHistRows(match, tickets, isEdit) {
  var id  = match.match_id;
  var t   = tickets[id] || {
    handicap:       { home: { count:0, amount:0 }, away:  { count:0, amount:0 } },
    totals:         { over: { count:0, amount:0 }, under: { count:0, amount:0 } },
    moneyline:      { home: { count:0, amount:0 }, away:  { count:0, amount:0 } },
    odd_even:       { odd:  { count:0, amount:0 }, even:  { count:0, amount:0 } },
    first_inning:   { home: { count:0, amount:0 }, away:  { count:0, amount:0 } },
    half_totals:    { over: { count:0, amount:0 }, under: { count:0, amount:0 } },
    half_moneyline: { home: { count:0, amount:0 }, away:  { count:0, amount:0 } }
  };
  var sp = match.spread        || { home_line: '', away_line: '', home_odds: '', away_odds: '' };
  var tt = match.totals        || { line: '', over_odds: '', under_odds: '' };
  var ml = match.moneyline     || { home_odds: '', away_odds: '' };
  var fi = match.first_inning  || { home_line: '', away_line: '', home_odds: '', away_odds: '',
                                    total_line: '', over_odds: 0, under_odds: 0,
                                    ml_home_odds: 0, ml_away_odds: 0 };
  var oe = match.odd_even      || { odd_odds: '', even_odds: '' };

  function buildRow(label, homeScore, awayScore, rowSp, hdpType, isHalf) {
    var rowHdp = t[hdpType] || { home: { count:0, amount:0 }, away: { count:0, amount:0 } };
    var rowOu  = isHalf ? (t.half_totals    || { over: {count:0,amount:0}, under: {count:0,amount:0} })
                        : (t.totals         || { over: {count:0,amount:0}, under: {count:0,amount:0} });
    var rowMl  = isHalf ? (t.half_moneyline || { home: {count:0,amount:0}, away:  {count:0,amount:0} })
                        : (t.moneyline      || { home: {count:0,amount:0}, away:  {count:0,amount:0} });
    var ouType = isHalf ? 'half_totals'    : 'totals';
    var mlType = isHalf ? 'half_moneyline' : 'moneyline';

    var hdpHomeCnt = histTicketCount(rowHdp.home.count, id, hdpType, 'home', isEdit);
    var hdpAwayCnt = histTicketCount(rowHdp.away.count, id, hdpType, 'away', isEdit);
    var hdpHomeAmt = histTicketAmt(rowHdp.home.amount,  id, hdpType, 'home', isEdit);
    var hdpAwayAmt = histTicketAmt(rowHdp.away.amount,  id, hdpType, 'away', isEdit);

    var ouOverCnt  = histTicketCount(rowOu.over.count,  id, ouType, 'over',  isEdit);
    var ouUnderCnt = histTicketCount(rowOu.under.count, id, ouType, 'under', isEdit);
    var ouOverAmt  = histTicketAmt(rowOu.over.amount,   id, ouType, 'over',  isEdit);
    var ouUnderAmt = histTicketAmt(rowOu.under.amount,  id, ouType, 'under', isEdit);

    var mlHomeCnt  = histTicketCount(rowMl.home.count,  id, mlType, 'home',  isEdit);
    var mlAwayCnt  = histTicketCount(rowMl.away.count,  id, mlType, 'away',  isEdit);
    var mlHomeAmt  = histTicketAmt(rowMl.home.amount,   id, mlType, 'home',  isEdit);
    var mlAwayAmt  = histTicketAmt(rowMl.away.amount,   id, mlType, 'away',  isEdit);

    /* 單雙：全場有，半場無 API 資料故空白 */
    var oeOddCnt   = isHalf ? '&nbsp;' : histTicketCount(t.odd_even.odd.count,   id, 'odd_even', 'odd',  isEdit);
    var oeEvenCnt  = isHalf ? '&nbsp;' : histTicketCount(t.odd_even.even.count,  id, 'odd_even', 'even', isEdit);
    var oeOddAmt   = isHalf ? '&nbsp;' : histTicketAmt(t.odd_even.odd.amount,    id, 'odd_even', 'odd',  isEdit);
    var oeEvenAmt  = isHalf ? '&nbsp;' : histTicketAmt(t.odd_even.even.amount,   id, 'odd_even', 'even', isEdit);

    /* 全場用全場資料；半場用 first_inning 內的半場專屬欄位 */
    var ttLine  = isHalf ? (fi.total_line  ?? '') : (tt.line ?? '');
    var ttOdds  = isHalf ? avgOdds(fi.over_odds,    fi.under_odds)
                         : avgOdds(tt.over_odds,    tt.under_odds);
    var mlOddsH = isHalf ? fmtOdds(fi.ml_home_odds) : fmtOdds(ml.home_odds);
    var mlOddsA = isHalf ? fmtOdds(fi.ml_away_odds) : fmtOdds(ml.away_odds);
    var oeOdds  = isHalf ? '' : avgOdds(oe.odd_odds, oe.even_odds);

    return `<tr data-match-id="${id}">
      <th><span>${fmtMatchId(id, match.commence_time)} ${label}<br/>${_fmtTime(match.commence_time)}</span></th>
      <td><div class="team-name">
        <div>${match.away_team}</div>
        <div>${match.home_team}<span class="text-danger">[主]</span></div>
      </div></td>
      ${histScoreCell(homeScore, awayScore)}
      ${histValCell('&nbsp;' + fmtHandicap(rowSp.home_line, rowSp.home_book_odds), '&nbsp;' + fmtHandicap(rowSp.away_line, rowSp.away_book_odds))}
      ${histOddsCell(avgOdds(rowSp.home_odds, rowSp.away_odds), avgOdds(rowSp.home_odds, rowSp.away_odds))}
      ${histCountCell(hdpHomeCnt, hdpAwayCnt)}
      ${histAmtCell(hdpHomeAmt, hdpAwayAmt)}
      ${histValCell('&nbsp;' + ttLine, '&nbsp;')}
      ${histOddsCell(ttOdds, ttOdds)}
      ${histCountCell(ouOverCnt, ouUnderCnt)}
      ${histAmtCell(ouOverAmt, ouUnderAmt)}
      ${histValCell('&nbsp;', '&nbsp;')}
      ${histOddsCell(mlOddsH, mlOddsA)}
      ${histCountCell(mlHomeCnt, mlAwayCnt)}
      ${histAmtCell(mlHomeAmt, mlAwayAmt)}
      ${histValCell('&nbsp;', '&nbsp;')}
      ${histOddsCell('', '')}
      ${histCountCell('&nbsp;', '&nbsp;')}
      ${histAmtCell('&nbsp;', '&nbsp;')}
      ${histValCell('&nbsp;單', '&nbsp;雙')}
      ${histOddsCell(oeOdds, oeOdds)}
      ${histCountCell(oeOddCnt, oeEvenCnt)}
      ${histAmtCell(oeOddAmt, oeEvenAmt)}
    </tr>`;
  }

  return '<tbody>'
       + buildRow('[全場]', match.full_home_score, match.full_away_score, sp, 'handicap',     false)
       + buildRow('[半場]', match.half_home_score, match.half_away_score, fi, 'first_inning', true)
       + '</tbody>';
}

/* ── 主渲染 ── */

function renderHistory(matches, tickets) {
  var isEdit = (typeof editSvc !== 'undefined') && editSvc.isEditMode();
  var sportMatches = matches.filter(function (m) { return m.sport === _histCurrentSport; });

  if (sportMatches.length === 0) {
    $('#historyContainer').html('<div class="p-2">暫無賽事</div>');
    return;
  }

  var leagueLabel = {
    baseball_mlb:  'MLB 美國職棒',
    baseball_cpbl: 'CPBL 中華職棒',
    baseball_npb:  'NPB 日本職棒'
  }[_histCurrentSport] || '';

  var rows = sportMatches.map(function (m) { return buildHistRows(m, tickets, isEdit); }).join('');

  $('#historyContainer').html(`
    <div class="pre-tables ball">
      <table class="table table-sm table-hover histb" style="width:100%">
        <colgroup>
          <!-- 編號/時間 5.7% -->
          <col style="width:5.7%">
          <!-- 隊伍 39.6% -->
          <col style="width:17.6%">
          <!-- 比分 10.4% -->
          <col style="width:6.4%">
          <!-- 讓分 10.5% (Val:Odds:Count:Amt = 60:50:40:80) -->
          <col style="width:2.74%">
          <col style="width:2.28%">
          <col style="width:1.83%">
          <col style="width:1.83%">
          <!-- 大小 10.5% -->
          <col style="width:2.74%">
          <col style="width:2.28%">
          <col style="width:1.83%">
          <col style="width:1.83%">
          <!-- 獨贏 9.7% -->
          <col style="width:2.53%">
          <col style="width:2.11%">
          <col style="width:1.69%">
          <col style="width:1.69%">
          <!-- 一輸 5.5% -->
          <col style="width:1.44%">
          <col style="width:1.20%">
          <col style="width:0.96%">
          <col style="width:1.90%">
          <!-- 單雙 8.1% -->
          <col style="width:2.10%">
          <col style="width:1.75%">
          <col style="width:1.40%">
          <col style="width:1.40%">
        </colgroup>
        <thead>
          <tr>
            <th colspan="100" style="color:#000;background:rgb(248,205,205)!important;text-align:left;font-size:12pt;border:none!important">
              ${leagueLabel}
            </th>
          </tr>
          <tr>
            <th scope="col">編號 / 時間</th>
            <th class="team-set" scope="col">隊伍</th>
            <th scope="col" class="rules" style="text-align:center">比分</th>
            <th class="rules" colspan="4">讓分</th>
            <th class="rules" colspan="4">大小</th>
            <th class="rules" colspan="4">獨贏</th>
            <th class="rules" colspan="4">一輸</th>
            <th class="rules" colspan="4">單雙</th>
          </tr>
        </thead>
        ${rows}
      </table>
    </div>
  `);

  if (isEdit) { editSvcHistory.bindHandlers(); }
}

/* ── 球種切換 ── */

billfnHistory.switchSport = function (sport) {
  _histCurrentSport = sport;

  var param = HIST_SPORT_TO_PARAM[sport];
  if (param) {
    var qs = new URLSearchParams(window.location.search);
    qs.set('sport', param);
    history.replaceState(null, '', window.location.pathname + '?' + qs.toString());
  }

  $('#ballName').text(HIST_SPORT_DISPLAY[sport] || sport);

  /* 更新麵包屑 active 狀態 */
  $('#list_His_Items a[data-sport]').removeClass('active');
  $('#list_His_Items a[data-sport="' + param + '"]').addClass('active');

  billfnHistory.Refresh();
};

/* ── inline 編輯（編輯模式） ── */

var editSvcHistory = {
  bindHandlers: function () {
    var self = this;
    $('#historyContainer')
      .off('click.ticket-edit', '.edit-ticket-hist')
      .on('click.ticket-edit', '.edit-ticket-hist', function () {
        self.startEdit($(this));
      });
  },

  startEdit: function ($span) {
    if ($span.find('input').length) return;
    var raw     = $span.text().trim().replace(/,/g, '');
    var matchId = $span.data('match-id');
    var betType = $span.data('bet-type');
    var side    = $span.data('side');
    var field   = $span.data('field');

    var $input = $('<input class="form-control form-control-sm d-inline-block" />')
      .val(raw).css({ width: '60px' });

    $span.html($input);
    $input.focus().select();

    function save() {
      var val = Number($input.val().replace(/,/g, '')) || 0;
      dataSvcHistory.saveTicket(matchId, betType, side, field, val)
        .then(function () { billfnHistory.Refresh(); });
    }

    $input
      .on('keydown', function (e) {
        if (e.key === 'Enter')  { e.preventDefault(); save(); }
        if (e.key === 'Escape') { billfnHistory.Refresh(); }
      })
      .on('blur', save);
  }
};

/* ── 公開介面 ── */

billfnHistory.Refresh = function () {
  Promise.all([dataSvcHistory.loadMatches(), dataSvcHistory.loadTickets()])
    .then(function (results) {
      renderHistory(results[0], results[1]);
    });
};

/* ── 初始化 ── */
$(function () {
  var PARAM_TO_SPORT = { mlb: 'baseball_mlb', cpbl: 'baseball_cpbl', npb: 'baseball_npb', other: '__other__' };
  var sportParam = new URLSearchParams(window.location.search).get('sport') || 'mlb';
  if (PARAM_TO_SPORT[sportParam]) {
    _histCurrentSport = PARAM_TO_SPORT[sportParam];
  }

  /* 帳務日期預設今日 */
  var today = new Date();
  var yyyy  = today.getFullYear();
  var mm    = String(today.getMonth() + 1).padStart(2, '0');
  var dd    = String(today.getDate()).padStart(2, '0');
  $('#histDate').val(yyyy + '-' + mm + '-' + dd);

  /* 設定 ballName */
  $('#ballName').text(_histCurrentSport === '__other__' ? '其他賽事' : (HIST_SPORT_DISPLAY[_histCurrentSport] || '美棒'));

  /* 設定麵包屑 active */
  $('#list_His_Items a[data-sport]').removeClass('active');
  if (_histCurrentSport !== '__other__') {
    var activeParam = HIST_SPORT_TO_PARAM[_histCurrentSport];
    $('#list_His_Items a[data-sport="' + activeParam + '"]').addClass('active');
  }

  /* 麵包屑點擊 */
  $('#list_His_Items a[data-sport]').on('click', function (e) {
    e.preventDefault();
    var sport = $(this).data('sport');
    if (sport === 'other') {
      _histCurrentSport = '__other__';
      var qs = new URLSearchParams(window.location.search);
      qs.set('sport', 'other');
      history.replaceState(null, '', window.location.pathname + '?' + qs.toString());
      $('#ballName').text($(this).text().trim());
      $('#list_His_Items a[data-sport]').removeClass('active');
      $('#historyContainer').html('<div class="p-2">暫無賽事</div>');
    } else {
      var PARAM_TO_KEY = { mlb: 'baseball_mlb', cpbl: 'baseball_cpbl', npb: 'baseball_npb' };
      billfnHistory.switchSport(PARAM_TO_KEY[sport]);
    }
  });

  /* 重新整理按鈕 */
  $('#btnHistRefresh').on('click', function () {
    billfnHistory.Refresh();
  });

  /* 初始載入 */
  if (_histCurrentSport === '__other__') {
    $('#historyContainer').html('<div class="p-2">暫無賽事</div>');
  } else {
    billfnHistory.Refresh();
  }
});
