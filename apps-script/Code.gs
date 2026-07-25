/**
 * Pro House — Apps Script backend.
 * Bind this script to the Google Sheet that has these tabs (header row = row 1):
 *   Items:          id, category, name, unit, hasCustomName, active, sortOrder, updatedAt
 *   DailyEntries:   date, itemId, itemName, unit, received, returned, cookName, notes, savedAt
 *   DayMeta:        date, employeeName, salesReportLink, paymentsReportLink, savedAt, updatedAt
 *   TomorrowOrders: date, itemId, itemName, unit, qty, notes, employeeName, savedAt
 *   Employees:      name, active
 *   Settings:       key, value
 *
 * Deploy: Deploy > New deployment > Web app > Execute as: Me > Who has access: Anyone.
 * Every code change needs a NEW deployment version (Deploy > Manage deployments > Edit > New version)
 * or the live /exec URL keeps running the old code.
 */

var SHEET_NAMES = {
  ITEMS: 'Items',
  DAILY: 'DailyEntries',
  DAYMETA: 'DayMeta',
  TOMORROW: 'TomorrowOrders',
  EMPLOYEES: 'Employees',
  SETTINGS: 'Settings'
};

function doGet(e) {
  try {
    var action = e.parameter.action;
    var data;
    switch (action) {
      case 'getItems': data = getItems(e.parameter.all === '1'); break;
      case 'getDay': data = getDay(e.parameter.date); break;
      case 'getReport': data = getReport(e.parameter.start, e.parameter.end); break;
      case 'getTomorrowOrder': data = getTomorrowOrder(e.parameter.date); break;
      case 'getEmployees': data = getEmployees(); break;
      case 'getSettings': data = getSettings(); break;
      case 'backupAll': data = backupAll(); break;
      default: throw new Error('unknown action: ' + action);
    }
    return jsonOut({ ok: true, data: data });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var body = JSON.parse(e.postData.contents); // {action, payload}
    var data;
    switch (body.action) {
      case 'saveItem': data = saveItem(body.payload); break;
      case 'deleteItem': data = deleteItem(body.payload); break;
      case 'saveDay': data = saveDay(body.payload); break;
      case 'saveTomorrowOrder': data = saveTomorrowOrder(body.payload); break;
      case 'saveSettings': data = saveSettings(body.payload); break;
      case 'restoreAll': data = restoreAll(body.payload); break;
      default: throw new Error('unknown action: ' + body.action);
    }
    return jsonOut({ ok: true, data: data });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ==================== helpers ====================

function sheet(name) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error('missing sheet tab: ' + name);
  return sh;
}

function readRows(name) {
  var sh = sheet(name);
  var values = sh.getDataRange().getValues();
  var headers = values[0];
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var row = {};
    for (var c = 0; c < headers.length; c++) row[headers[c]] = values[i][c];
    rows.push(row);
  }
  return { sh: sh, headers: headers, rows: rows };
}

function appendRow(name, obj) {
  var sh = sheet(name);
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var row = headers.map(function (h) { return obj.hasOwnProperty(h) ? obj[h] : ''; });
  sh.appendRow(row);
}

function deleteRowsWhere(name, predicate) {
  var sh = sheet(name);
  var values = sh.getDataRange().getValues();
  var headers = values[0];
  for (var i = values.length - 1; i >= 1; i--) {
    var row = {};
    for (var c = 0; c < headers.length; c++) row[headers[c]] = values[i][c];
    if (predicate(row)) sh.deleteRow(i + 1);
  }
}

function nowIso() { return new Date().toISOString(); }

// ==================== Items ====================

function getItems(all) {
  var r = readRows(SHEET_NAMES.ITEMS);
  var rows = all ? r.rows : r.rows.filter(function (it) { return it.active === true || it.active === 'TRUE'; });
  rows.sort(function (a, b) {
    if (a.category !== b.category) return String(a.category).localeCompare(String(b.category));
    return Number(a.sortOrder) - Number(b.sortOrder);
  });
  return rows;
}

function saveItem(p) {
  var r = readRows(SHEET_NAMES.ITEMS);
  if (!p.id) p.id = Utilities.getUuid();
  // isNew = لا يوجد صف بهذا الـ id حالياً (يدعم إنشاء id على العميل أثناء العمل أوفلاين)
  var isNew = !r.rows.some(function (row) { return row.id === p.id; });
  p.updatedAt = nowIso();
  if (isNew) {
    appendRow(SHEET_NAMES.ITEMS, {
      id: p.id, category: p.category, name: p.name, unit: p.unit,
      hasCustomName: !!p.hasCustomName, active: true,
      sortOrder: p.sortOrder || 0, updatedAt: p.updatedAt
    });
  } else {
    var idx = r.headers.indexOf('id');
    for (var i = 0; i < r.rows.length; i++) {
      if (r.rows[i].id === p.id) {
        var rowNum = i + 2;
        r.headers.forEach(function (h, c) {
          if (p.hasOwnProperty(h)) r.sh.getRange(rowNum, c + 1).setValue(p[h]);
        });
        break;
      }
    }
  }
  return { id: p.id };
}

function deleteItem(p) {
  var r = readRows(SHEET_NAMES.ITEMS);
  for (var i = 0; i < r.rows.length; i++) {
    if (r.rows[i].id === p.id) {
      var rowNum = i + 2;
      var activeCol = r.headers.indexOf('active') + 1;
      var updatedCol = r.headers.indexOf('updatedAt') + 1;
      r.sh.getRange(rowNum, activeCol).setValue(false);
      r.sh.getRange(rowNum, updatedCol).setValue(nowIso());
      break;
    }
  }
  return { id: p.id };
}

// ==================== Daily entries / day meta ====================

function getDay(date) {
  var entries = readRows(SHEET_NAMES.DAILY).rows.filter(function (r) { return r.date === date; });
  var metaRows = readRows(SHEET_NAMES.DAYMETA).rows.filter(function (r) { return r.date === date; });
  return { date: date, meta: metaRows[0] || null, items: entries };
}

function saveDay(p) {
  // full replace for this date
  deleteRowsWhere(SHEET_NAMES.DAILY, function (row) { return row.date === p.date; });
  var savedAt = nowIso();
  (p.items || []).forEach(function (it) {
    appendRow(SHEET_NAMES.DAILY, {
      date: p.date, itemId: it.itemId, itemName: it.itemName, unit: it.unit,
      received: it.received, returned: it.returned, cookName: it.cookName || '',
      notes: it.notes || '', savedAt: savedAt
    });
  });

  var metaRows = readRows(SHEET_NAMES.DAYMETA);
  var existing = metaRows.rows.filter(function (r) { return r.date === p.date; })[0];
  var metaObj = {
    date: p.date, employeeName: p.employeeName || '',
    salesReportLink: p.salesReportLink || '', paymentsReportLink: p.paymentsReportLink || '',
    savedAt: existing ? existing.savedAt : savedAt, updatedAt: savedAt
  };
  if (existing) {
    var idx2 = metaRows.rows.indexOf(existing);
    var rowNum2 = idx2 + 2;
    metaRows.headers.forEach(function (h, c) { metaRows.sh.getRange(rowNum2, c + 1).setValue(metaObj[h]); });
  } else {
    appendRow(SHEET_NAMES.DAYMETA, metaObj);
  }
  return { date: p.date, savedAt: savedAt };
}

function getReport(start, end) {
  var settings = getSettings();
  var returnThreshold = settings.returnThresholdPct !== undefined && settings.returnThresholdPct !== ''
    ? Number(settings.returnThresholdPct) : 0.30;
  var allEntries = readRows(SHEET_NAMES.DAILY).rows.filter(function (r) { return r.date >= start && r.date <= end; });
  var allMeta = readRows(SHEET_NAMES.DAYMETA).rows.filter(function (r) { return r.date >= start && r.date <= end; });

  var byDate = {};
  allEntries.forEach(function (r) {
    if (!byDate[r.date]) byDate[r.date] = [];
    byDate[r.date].push(r);
  });
  var days = Object.keys(byDate).sort().map(function (date) {
    var meta = allMeta.filter(function (m) { return m.date === date; })[0] || null;
    return { date: date, meta: meta, items: byDate[date] };
  });

  var totalsMap = {};
  allEntries.forEach(function (r) {
    if (!totalsMap[r.itemId]) totalsMap[r.itemId] = { itemId: r.itemId, itemName: r.itemName, unit: r.unit, totalReceived: 0, totalReturned: 0, dayCount: 0 };
    var t = totalsMap[r.itemId];
    var rec = Number(r.received);
    var ret = Number(r.returned);
    if (!isNaN(rec) && r.received !== '') { t.totalReceived += rec; t.dayCount += 1; }
    if (!isNaN(ret) && r.returned !== '') { t.totalReturned += ret; }
  });
  var flaggedCount = 0;
  var totals = Object.keys(totalsMap).map(function (id) {
    var t = totalsMap[id];
    t.avgDaily = t.dayCount > 0 ? t.totalReceived / t.dayCount : null;
    t.returnPct = t.totalReceived > 0 ? t.totalReturned / t.totalReceived : null;
    t.flagged = t.returnPct !== null && t.returnPct >= returnThreshold;
    if (t.flagged) flaggedCount++;
    return t;
  });

  return { days: days, totals: totals, flaggedCount: flaggedCount };
}

// ==================== Tomorrow orders ====================

function getTomorrowOrder(date) {
  return readRows(SHEET_NAMES.TOMORROW).rows.filter(function (r) { return r.date === date; });
}

function saveTomorrowOrder(p) {
  deleteRowsWhere(SHEET_NAMES.TOMORROW, function (row) { return row.date === p.date; });
  var savedAt = nowIso();
  (p.items || []).forEach(function (it) {
    appendRow(SHEET_NAMES.TOMORROW, {
      date: p.date, itemId: it.itemId, itemName: it.itemName, unit: it.unit,
      qty: it.qty, notes: it.notes || '', employeeName: p.employeeName || '', savedAt: savedAt
    });
  });
  return { date: p.date, savedAt: savedAt };
}

// ==================== Employees / Settings ====================

function getEmployees() {
  return readRows(SHEET_NAMES.EMPLOYEES).rows.filter(function (r) { return r.active === true || r.active === 'TRUE'; });
}

function getSettings() {
  var rows = readRows(SHEET_NAMES.SETTINGS).rows;
  var out = {};
  rows.forEach(function (r) { out[r.key] = r.value; });
  return out;
}

function saveSettings(p) {
  var r = readRows(SHEET_NAMES.SETTINGS);
  Object.keys(p).forEach(function (key) {
    var existingIdx = -1;
    for (var i = 0; i < r.rows.length; i++) { if (r.rows[i].key === key) { existingIdx = i; break; } }
    if (existingIdx >= 0) {
      var rowNum = existingIdx + 2;
      var valueCol = r.headers.indexOf('value') + 1;
      var updatedCol = r.headers.indexOf('updatedAt') + 1;
      r.sh.getRange(rowNum, valueCol).setValue(p[key]);
      if (updatedCol > 0) r.sh.getRange(rowNum, updatedCol).setValue(nowIso());
    } else {
      appendRow(SHEET_NAMES.SETTINGS, { key: key, value: p[key], updatedAt: nowIso() });
    }
  });
  return getSettings();
}

// ==================== Backup / Restore ====================

function backupAll() {
  return {
    items: readRows(SHEET_NAMES.ITEMS).rows,
    dailyEntries: readRows(SHEET_NAMES.DAILY).rows,
    dayMeta: readRows(SHEET_NAMES.DAYMETA).rows,
    tomorrowOrders: readRows(SHEET_NAMES.TOMORROW).rows,
    employees: readRows(SHEET_NAMES.EMPLOYEES).rows,
    settings: readRows(SHEET_NAMES.SETTINGS).rows,
    exportedAt: nowIso()
  };
}

function restoreAll(p) {
  function replaceSheet(name, rows) {
    var sh = sheet(name);
    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    var lastRow = sh.getLastRow();
    if (lastRow > 1) sh.getRange(2, 1, lastRow - 1, headers.length).clearContent();
    if (!rows || !rows.length) return;
    var values = rows.map(function (obj) { return headers.map(function (h) { return obj.hasOwnProperty(h) ? obj[h] : ''; }); });
    sh.getRange(2, 1, values.length, headers.length).setValues(values);
  }
  replaceSheet(SHEET_NAMES.ITEMS, p.items);
  replaceSheet(SHEET_NAMES.DAILY, p.dailyEntries);
  replaceSheet(SHEET_NAMES.DAYMETA, p.dayMeta);
  replaceSheet(SHEET_NAMES.TOMORROW, p.tomorrowOrders);
  replaceSheet(SHEET_NAMES.EMPLOYEES, p.employees);
  replaceSheet(SHEET_NAMES.SETTINGS, p.settings);
  return { restoredAt: nowIso() };
}
