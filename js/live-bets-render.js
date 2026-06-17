/* live-bets-render.js — 即時注單頁表格渲染、11 秒倒數、球種切換、編輯模式注單欄位 */

window.billfnLive = window.billfnLive || {};

function _fmtTime(t) {
  if (!t) return '';
  var d = new Date(t);
  if (isNaN(d.getTime())) return t;
  var tw = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  var mo = String(tw.getUTCMonth() + 1).padStart(2, '0');
  var dy = String(tw.getUTCDate()).padStart(2, '0');
  var hr = String(tw.getUTCHours()).padStart(2, '0');
  var mn = String(tw.getUTCMinutes()).padStart(2, '0');
  return mo + '-' + dy + ' ' + hr + ':' + mn;
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

/* 導航 ball_* ID → 內部球種 key（僅三個棒球有資料） */
var BALL_ID_TO_SPORT = {
  ball_4:  'baseball_mlb',
  ball_11: 'baseball_cpbl',
  ball_12: 'baseball_npb'
};

/* 球種 key → 顯示名稱 */
var SPORT_DISPLAY = {
  baseball_mlb:  '美棒',
  baseball_cpbl: '台棒',
  baseball_npb:  '日棒'
};

var SPORT_DISPLAY_FULL = {
  baseball_mlb:  'MLB 美國職棒',
  baseball_cpbl: 'CPBL 中華職棒',
  baseball_npb:  'NPB 日本職棒'
};

/* 球種 key → URL sport 參數 */
var SPORT_TO_PARAM = {
  baseball_mlb:  'mlb',
  baseball_cpbl: 'cpbl',
  baseball_npb:  'npb'
};

/* 目前顯示的球種（預設美棒） */
var _currentSport = 'baseball_mlb';

/* ── 工具函式 ── */

function fmtAmt(n) {
  return Number(n).toLocaleString('en-US');
}

function ticketSpan(count, amount, matchId, betType, side, isEdit) {
  if (isEdit) {
    return `<span class="edit-ticket" style="color:red;cursor:pointer"
      data-match-id="${matchId}" data-bet-type="${betType}" data-side="${side}" data-field="count">${count}</span>/<span
      class="edit-ticket" style="cursor:pointer"
      data-match-id="${matchId}" data-bet-type="${betType}" data-side="${side}" data-field="amount">${fmtAmt(amount)}</span>`;
  }
  return `<span style="color:red">${count}</span>/${fmtAmt(amount)}`;
}

/* ── 建立一場比賽的列 ── */

function buildMatchRow(match, tickets, isEdit) {
  var t = tickets[match.match_id] || {
    handicap:     { home: { count:0, amount:0 }, away:  { count:0, amount:0 } },
    totals:       { over: { count:0, amount:0 }, under: { count:0, amount:0 } },
    moneyline:    { home: { count:0, amount:0 }, away:  { count:0, amount:0 } },
    odd_even:     { odd:  { count:0, amount:0 }, even:  { count:0, amount:0 } },
    first_inning: { home: { count:0, amount:0 }, away:  { count:0, amount:0 } }
  };
  var id = match.match_id;
  var sp = match.spread        || { home_line: '', away_line: '', home_odds: '', away_odds: '' };
  var tt = match.totals        || { line: '', over_odds: '', under_odds: '' };
  var ml = match.moneyline     || { home_odds: '', away_odds: '' };
  var oe = match.odd_even      || { odd_odds: '', even_odds: '' };
  var fi = match.first_inning  || { home_line: '', away_line: '', home_odds: '', away_odds: '' };

  var hdpHome = ticketSpan(t.handicap.home.count,     t.handicap.home.amount,     id, 'handicap',     'home',  isEdit);
  var hdpAway = ticketSpan(t.handicap.away.count,     t.handicap.away.amount,     id, 'handicap',     'away',  isEdit);
  var ouOver  = ticketSpan(t.totals.over.count,       t.totals.over.amount,       id, 'totals',       'over',  isEdit);
  var ouUnder = ticketSpan(t.totals.under.count,      t.totals.under.amount,      id, 'totals',       'under', isEdit);
  var mlHome  = ticketSpan(t.moneyline.home.count,    t.moneyline.home.amount,    id, 'moneyline',    'home',  isEdit);
  var mlAway  = ticketSpan(t.moneyline.away.count,    t.moneyline.away.amount,    id, 'moneyline',    'away',  isEdit);
  var oeOdd   = ticketSpan(t.odd_even.odd.count,      t.odd_even.odd.amount,      id, 'odd_even',     'odd',   isEdit);
  var oeEven  = ticketSpan(t.odd_even.even.count,     t.odd_even.even.amount,     id, 'odd_even',     'even',  isEdit);
  var fiHome  = ticketSpan(t.first_inning.home.count, t.first_inning.home.amount, id, 'first_inning', 'home',  isEdit);
  var fiAway  = ticketSpan(t.first_inning.away.count, t.first_inning.away.amount, id, 'first_inning', 'away',  isEdit);

  return `<tr data-match-id="${id}">
    <th style="width:90px">${fmtMatchId(id, match.commence_time)}</th>
    <th style="width:90px">${_fmtTime(match.commence_time)}</th>
    <td style="width:120px;text-align:left!important;white-space:nowrap">
      <div>
        <div>${match.away_team}</div>
        <div>${match.home_team}<span class="text-danger">[主]</span></div>
      </div>
    </td>
    <td status="0"><div><div>&nbsp;${fmtHandicap(sp.home_line, sp.home_book_odds)}</div><div>&nbsp;${fmtHandicap(sp.away_line, sp.away_book_odds)}</div></div></td>
    <td status="0"><div><div>${avgOdds(sp.home_odds, sp.away_odds)}</div><div>${avgOdds(sp.home_odds, sp.away_odds)}</div></div></td>
    <td status="0"><div><div>${hdpHome}</div><div>${hdpAway}</div></div></td>
    <td status="0"><div><div>&nbsp;${tt.line}</div><div>小</div></div></td>
    <td status="0"><div><div>${avgOdds(tt.over_odds, tt.under_odds)}</div><div>${avgOdds(tt.over_odds, tt.under_odds)}</div></div></td>
    <td status="0"><div><div>${ouOver}</div><div>${ouUnder}</div></div></td>
    <td status="0"><div><div>${fmtOdds(ml.home_odds)}</div><div>${fmtOdds(ml.away_odds)}</div></div></td>
    <td status="0"><div><div>${mlHome}</div><div>${mlAway}</div></div></td>
    <td status="0"><div><div>單</div><div>雙</div></div></td>
    <td status="0"><div><div>${avgOdds(oe.odd_odds, oe.even_odds)}</div><div>${avgOdds(oe.odd_odds, oe.even_odds)}</div></div></td>
    <td status="0"><div><div>${oeOdd}</div><div>${oeEven}</div></div></td>
    <td class="" status="0">
      <div class="d-flex justify-content-center rules">
        <div><div>&nbsp;${fmtHandicap(fi.home_line, null)}</div><div>&nbsp;${fmtHandicap(fi.away_line, null)}</div></div>
        <div><div>${fmtOdds(fi.home_odds)}</div><div>${fmtOdds(fi.away_odds)}</div></div>
        <div><div>${fiHome}</div><div>${fiAway}</div></div>
      </div>
    </td>
  </tr>`;
}

/* ── 主渲染：只顯示目前球種，一張表 ── */

function renderLiveBets(matches, tickets) {
  var isEdit = (typeof editSvc !== 'undefined') && editSvc.isEditMode();

  /* 過濾目前球種 */
  var sportMatches = matches.filter(function (m) { return m.sport === _currentSport; });

  if (sportMatches.length === 0) {
    $('#liveBetsContainer').html(
      '<div class="text-muted">暫無賽事</div>'
    );
    return;
  }

  var rows = sportMatches.map(function (m) { return buildMatchRow(m, tickets, isEdit); }).join('');

  $('#liveBetsContainer').html(`
    <div class="table-responsive">
      <table class="table table-sm table-hover pre-tables" style="width:100%">
        <colgroup>
          <col style="width:5.5%">  <!-- 編號 -->
          <col style="width:5.5%">  <!-- 時間 -->
          <col style="width:8%">    <!-- 隊伍 -->
          <!-- 讓分/注單：線 / 賠率 / 票券 -->
          <col style="width:6%">
          <col style="width:5%">
          <col style="width:7%">
          <!-- 大小盤/注單：線 / 賠率 / 票券 -->
          <col style="width:6.5%">
          <col style="width:5%">
          <col style="width:7%">
          <!-- 獨贏：賠率 / 票券 -->
          <col style="width:4.5%">
          <col style="width:5.5%">
          <!-- 單雙：標籤 / 賠率 / 票券 -->
          <col style="width:2.5%">
          <col style="width:4%">
          <col style="width:5.5%">
          <!-- 一輸二贏 -->
          <col style="width:22.5%">
        </colgroup>
        <thead>
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
}

/* ── 球種切換 ── */

billfnLive.switchSport = function (sport) {
  _currentSport = sport;

  /* 更新 URL（只改 sport 參數，保留其他參數如 edit=true） */
  var param = SPORT_TO_PARAM[sport];
  if (param) {
    var qs = new URLSearchParams(window.location.search);
    qs.set('sport', param);
    history.replaceState(null, '', window.location.pathname + '?' + qs.toString());
  }

  /* 更新 Header 顯示 */
  $('#ballName').text(SPORT_DISPLAY[sport] || sport);
  $('#liveBetsLeagueTitle').text(SPORT_DISPLAY_FULL[sport] || sport);
  $('#liveBetsLeagueTitle').closest('.accordion-header').show();

  /* 更新 dropdown active 狀態 */
  $('.dropdown-item[id^="ball_"]').removeClass('active');
  var activeBallId = Object.keys(BALL_ID_TO_SPORT).find(function (k) {
    return BALL_ID_TO_SPORT[k] === sport;
  });
  if (activeBallId) $('#' + activeBallId).addClass('active');

  clearInterval(_liveTimer);
  billfnLive.Refresh();
};

/* ── 11 秒倒數計時器 ── */

var _liveCountdown = 11;
var _liveTimer = null;

function startLiveCountdown() {
  _liveCountdown = 11;
  $('#countdownDisplay').text(_liveCountdown);
  clearInterval(_liveTimer);
  _liveTimer = setInterval(function () {
    _liveCountdown--;
    if (_liveCountdown <= 0) {
      clearInterval(_liveTimer);
      $('#countdownDisplay').text('0');
      billfnLive.Refresh();
    } else {
      $('#countdownDisplay').text(_liveCountdown);
    }
  }, 1000);
}

/* ── 注單欄位 inline 編輯（編輯模式） ── */

var editSvcLive = {
  bindHandlers: function () {
    var self = this;
    $('#liveBetsContainer')
      .off('click.ticket-edit', '.edit-ticket')
      .on('click.ticket-edit', '.edit-ticket', function () {
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
      .val(raw)
      .css({ width: '60px' });

    $span.html($input);
    $input.focus().select();

    function save() {
      var val = Number($input.val().replace(/,/g, '')) || 0;
      dataSvcLive.saveTicket(matchId, betType, side, field, val)
        .then(function () { billfnLive.Refresh(); });
    }

    $input
      .on('keydown', function (e) {
        if (e.key === 'Enter')  { e.preventDefault(); save(); }
        if (e.key === 'Escape') { billfnLive.Refresh(); }
      })
      .on('blur', save);
  }
};

/* ── billfnLive 公開介面 ── */

billfnLive.Refresh = function () {
  Promise.all([dataSvcLive.loadMatches(), dataSvcLive.loadTickets()])
    .then(function (results) {
      var matches = results[0];
      var tickets = results[1];
      renderLiveBets(matches, tickets);
      if ((typeof editSvc !== 'undefined') && editSvc.isEditMode()) {
        editSvcLive.bindHandlers();
      }
      startLiveCountdown();
    });
};

/* ── 初始化 ── */
$(function () {
  /* 讀取 URL ?sport= 參數，設定初始球種 */
  var PARAM_TO_SPORT = { mlb: 'baseball_mlb', cpbl: 'baseball_cpbl', npb: 'baseball_npb', other: '__other__' };
  var sportParam = new URLSearchParams(window.location.search).get('sport');
  if (sportParam && PARAM_TO_SPORT[sportParam]) {
    _currentSport = PARAM_TO_SPORT[sportParam];
  }
  $('#ballName').text(_currentSport === '__other__' ? '其他賽事' : (SPORT_DISPLAY[_currentSport] || '美棒'));
  if (_currentSport === '__other__') {
    $('#liveBetsLeagueTitle').closest('.accordion-header').hide();
  } else {
    $('#liveBetsLeagueTitle').text(SPORT_DISPLAY_FULL[_currentSport] || 'MLB 美國職棒');
  }

  /* 三個棒球球種：已在 HTML 設好 href（供 index.html 跳轉），
     在 live-bets.html 上攔截點擊改為原地切換 */
  $.each(BALL_ID_TO_SPORT, function (ballId, sport) {
    $('#' + ballId).on('click', function (e) {
      e.preventDefault();
      billfnLive.switchSport(sport);
    });
  });

  /* 其他 18 種運動 → 暫無賽事（不離開頁面） */
  $('.dropdown-item[id^="ball_"]').not(function () {
    return BALL_ID_TO_SPORT.hasOwnProperty(this.id);
  }).on('click', function (e) {
    e.preventDefault();
    _currentSport = '__other__';
    var qsOther = new URLSearchParams(window.location.search);
    qsOther.set('sport', 'other');
    history.replaceState(null, '', window.location.pathname + '?' + qsOther.toString());
    $('#ballName').text($(this).text().trim());
    $('.dropdown-item[id^="ball_"]').removeClass('active');
    $(this).addClass('active');
    clearInterval(_liveTimer);
    $('#liveBetsLeagueTitle').closest('.accordion-header').hide();
    $('#liveBetsContainer').html('<div class="p-4 text-center text-muted">暫無賽事</div>');
  });

  /* 無功能頁籤（早餐/走地/3局/7局/已開賽）→ 顯示「暫無資料」並停止倒數 */
  $('#b0, #b2, #bs3, #bs7, #b3').on('click', function (e) {
    e.preventDefault();
    $('#list_ball a').removeClass('active');
    $(this).addClass('active');
    clearInterval(_liveTimer);
    $('#countdownDisplay').text('--');
    $('#liveBetsContainer').html('<div>暫無資料</div>');
  });

  /* 單式頁籤 → 恢復正常資料顯示 */
  $('#b1').on('click', function (e) {
    e.preventDefault();
    $('#list_ball a').removeClass('active');
    $(this).addClass('active');
    billfnLive.Refresh();
  });

  /* 立即更新按鈕 */
  $('#btnImmediateRefresh').on('click', function () {
    clearInterval(_liveTimer);
    billfnLive.Refresh();
  });

  /* 初始載入 */
  billfnLive.Refresh();
});
