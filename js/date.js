/* date.js — 日期欄位邏輯、7 個快捷按鈕 */

window.billfn = window.billfn || {};

billfn.getDateRange = function (type, _ticketTimeType) {
  const today = new Date();

  function fmt(d) {
    return d.toISOString().slice(0, 10);
  }

  function addDays(d, n) {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
  }

  let start, end;

  switch (type) {
    case 'DB': // 前一日
      start = end = addDays(today, -1);
      break;
    case 'N': // 今日
      start = end = today;
      break;
    case 'DA': // 後一日
      start = end = addDays(today, 1);
      break;
    case 'W': { // 本週（週一為起點）
      const dow = today.getDay() || 7; // 週日=7
      start = addDays(today, 1 - dow);
      end   = addDays(today, 7 - dow);
      break;
    }
    case 'LW': { // 上週
      const dow = today.getDay() || 7;
      start = addDays(today, 1 - dow - 7);
      end   = addDays(today, 7 - dow - 7);
      break;
    }
    case 'M': // 本月
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      end   = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      break;
    case 'LM': // 上月
      start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      end   = new Date(today.getFullYear(), today.getMonth(), 0);
      break;
    default:
      return;
  }

  $('#txtStartDate').val(fmt(start));
  $('#txtEndDate').val(fmt(end));
};

$(function () {
  var today = new Date().toISOString().slice(0, 10);

  flatpickr('#txtStartDate', { dateFormat: 'Y-m-d', defaultDate: today, allowInput: true });
  flatpickr('#txtEndDate',   { dateFormat: 'Y-m-d', defaultDate: today, allowInput: true });

  $('#btnRptQuery').on('click', function () {
    _filterActive = true;
    billfn.Refresh();
  });
});
