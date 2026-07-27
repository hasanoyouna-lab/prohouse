/**
 * Pro House — Apps Script backend.
 * Bind this script to the Google Sheet that has these tabs (header row = row 1):
 *   Items:          id, category, name, unit, hasCustomName, branches, active, sortOrder, updatedAt
 *   DailyEntries:   date, branch, itemId, itemName, unit, confirmed, received, returned, cookName, notes, savedAt
 *   DayMeta:        date, branch, employeeName, salesReportLink, paymentsReportLink, savedAt, updatedAt
 *   TomorrowOrders: date, branch, itemId, itemName, unit, qty, notes, employeeName, savedAt
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

var SHEET_HEADERS = {
  Items: ['id', 'category', 'name', 'unit', 'hasCustomName', 'branches', 'active', 'sortOrder', 'updatedAt'],
  DailyEntries: ['date', 'branch', 'itemId', 'itemName', 'unit', 'confirmed', 'received', 'returned', 'cookName', 'notes', 'savedAt'],
  DayMeta: ['date', 'branch', 'employeeName', 'salesReportLink', 'paymentsReportLink', 'savedAt', 'updatedAt'],
  TomorrowOrders: ['date', 'branch', 'itemId', 'itemName', 'unit', 'qty', 'notes', 'employeeName', 'savedAt'],
  Employees: ['name', 'active'],
  Settings: ['key', 'value', 'updatedAt']
};

var DEFAULT_BRANCHES = 'الروضة,الشاطئ,عبداللطيف جميل';

/**
 * شغّل هاي الدالة مرة وحدة بس (▶ Run فوق، اختارها من القائمة، وافق على الصلاحيات).
 * بتنشئ كل التبويبات المطلوبة تلقائياً بأسماء وأعمدة صحيحة، وبتعبي بيانات أولية
 * (30 صنف، 7 موظفين placeholder، إعدادات افتراضية) — ما بتحتاج تسوي شي يدوي بالشيت أبداً.
 * ممكن تشغّلها أكثر من مرة بأمان: ما بتكرر التبويبات ولا البيانات إذا كانت موجودة أصلاً.
 */
function setupEverything() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  Object.keys(SHEET_HEADERS).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    var headers = SHEET_HEADERS[name];
    // نكتب صف العناوين دايماً (حتى لو الشيت مش فاضي) — كتابة العناوين آمنة 100% وما بتلمس صفوف البيانات (تبلش من صف 2)،
    // وهيك بتصلح لحالها أي عناوين مكتوبة غلط يدوياً قبل هيك.
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    // نص عادي لكل الأعمدة (مو بس date) — Sheets بيحوّل قيم زي "1/3" أو "2026-07-25" لتاريخ
    // تلقائياً حتى لو العمود Plain Text أصلاً؛ هذا بيمنع تكرار المشكلة بأي عمود مستقبلاً.
    sh.getRange(2, 1, 2000, headers.length).setNumberFormat('@');
  });

  // احذف تبويب "Sheet1" الفاضي الافتراضي إذا ما زال موجود وما فيه بيانات
  var defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 1 && defaultSheet.getLastRow() === 0) {
    ss.deleteSheet(defaultSheet);
  }

  seedInitialDataIfEmpty();
  ensureDefaultSetting('branches', DEFAULT_BRANCHES);
  return 'تم إعداد كل التبويبات بنجاح';
}

// يضيف إعداد افتراضي بس إذا كان مش موجود أصلاً (ما بيلمس قيمة موجودة سابقاً حتى لو تغيّرت يدوياً)
function ensureDefaultSetting(key, defaultValue) {
  var r = readRows(SHEET_NAMES.SETTINGS);
  var exists = r.rows.some(function (row) { return row.key === key; });
  if (!exists) appendRow(SHEET_NAMES.SETTINGS, { key: key, value: defaultValue, updatedAt: nowIso() });
}

function seedInitialDataIfEmpty() {
  var itemsSheet = sheet(SHEET_NAMES.ITEMS);
  if (itemsSheet.getLastRow() < 2) {
    var items = [
      ['دجاج', 'دجاج تندر', '1/3', false, 1],
      ['دجاج', 'دجاج باربكيو', '1/3', false, 2],
      ['دجاج', 'دجاج بينك صوص', '1/3', false, 3],
      ['دجاج', 'دجاج الشيف', '1/3', true, 4],
      ['بحري', 'لحم الشيف', '1/3', true, 1],
      ['بحري', 'سالمون', '1/3', false, 2],
      ['بحري', 'سمك الشيف (جمبو)', '1/3', false, 3],
      ['بحري', 'جمبري بروفنسال', '1/3', false, 4],
      ['كارب', 'رز أبيض', '1/2', false, 1],
      ['كارب', 'رز الشيف', '1/2', false, 2],
      ['كارب', 'بطاطس ويدجز', '1', false, 3],
      ['كارب', 'مكرونة الشيف', '1/3', false, 4],
      ['كارب', 'كارب الشيف', '1/3', false, 5],
      ['السلطات', 'سلطة تونا', 'طاسة', false, 1],
      ['السلطات', 'سلطة فتوش', 'طاسة', false, 2],
      ['السلطات', 'سلطة سيزر', 'طاسة', false, 3],
      ['الحلويات', 'كوكيز', 'حبة', false, 1],
      ['الحلويات', 'براونيز', 'حبة', false, 2],
      ['الحلويات', 'سينابون', 'حبة', false, 3],
      ['الحلويات', 'حلى الشيف', 'صينية', false, 4],
      ['فطور', 'ساندويتش روستيد', 'ساندويتش', false, 1],
      ['فطور', 'ساندويتش صن رايز', 'ساندويتش', false, 2],
      ['فطور', 'صن رايز بدون ديك رومي', 'ساندويتش', false, 3],
      ['فطور', 'ساندويتش تونا', 'ساندويتش', false, 4],
      ['فطور', 'ساندويتش كساديا', 'ساندويتش', false, 5],
      ['فطور', 'ساندويتش كروك ديلوكس', 'ساندويتش', false, 6],
      ['فطور', 'كرواسون بيض بالتيركي', 'ساندويتش', false, 7],
      ['فطور', 'ساندويتش حلوم', 'ساندويتش', false, 8],
      ['فطور', 'كلوب ساندويتش', 'ساندويتش', false, 9],
      ['معدات', 'سفنديشات الفطور', '-', false, 1]
    ];
    var now = nowIso();
    var rows = items.map(function (it) {
      // id, category, name, unit, hasCustomName, branches('' = كل الفروع), active, sortOrder, updatedAt
      return [Utilities.getUuid(), it[0], it[1], it[2], it[3], '', true, it[4], now];
    });
    itemsSheet.getRange(2, 1, rows.length, 9).setValues(rows);
  }

  var employeesSheet = sheet(SHEET_NAMES.EMPLOYEES);
  if (employeesSheet.getLastRow() < 2) {
    var employees = [1, 2, 3, 4, 5, 6, 7].map(function (n) { return ['موظف ' + n, true]; });
    employeesSheet.getRange(2, 1, employees.length, 2).setValues(employees);
  }

  var settingsSheet = sheet(SHEET_NAMES.SETTINGS);
  if (settingsSheet.getLastRow() < 2) {
    var now2 = nowIso();
    var settings = [
      ['restaurantName', 'Pro House', now2],
      ['branchName', '', now2],
      ['logoUrl', '', now2],
      ['shortageThresholdPct', -0.20, now2],
      ['surplusThresholdPct', 0.25, now2],
      ['returnThresholdPct', 0.30, now2],
      ['branches', DEFAULT_BRANCHES, now2]
    ];
    settingsSheet.getRange(2, 1, settings.length, 3).setValues(settings);
  }
}

function doGet(e) {
  try {
    var action = e.parameter.action;
    var data;
    switch (action) {
      case 'getItems': data = getItems(e.parameter.all === '1'); break;
      case 'getDay': data = getDay(e.parameter.date, e.parameter.branch); break;
      case 'getReport': data = getReport(e.parameter.start, e.parameter.end); break;
      case 'getTomorrowOrder': data = getTomorrowOrder(e.parameter.date, e.parameter.branch); break;
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

// Google Sheets أحياناً بيحوّل نص التاريخ ("2026-07-25") لكائن Date حقيقي تلقائياً
// وقت appendRow حتى لو العمود مهيأ Plain Text — هذا بيكسر كل مقارنة نصية (===, >=, <=)
// بين تاريخ قادم من العميل (نص) وتاريخ راجع من الشيت (كائن Date). نطبّعه هون مرة وحدة
// بعد كل قراءة، حتى كل الدوال (getDay/saveDay/getReport/التومورو) تشتغل صح دايماً.
function isDateValue(v) {
  return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime());
}
function normalizeDateValue(v) {
  if (isDateValue(v)) {
    return v.getFullYear() + '-' + String(v.getMonth() + 1).padStart(2, '0') + '-' + String(v.getDate()).padStart(2, '0');
  }
  return v;
}
// عمود "unit" أحياناً بيحوي قيم متل "1/3" أو "1/2" — Google Sheets بيفسّرها كتاريخ (يوم/شهر)
// ويحوّلها لكائن Date تلقائياً حتى لو العمود Plain Text. نعيد بناء النص الأصلي "يوم/شهر" من التاريخ.
function normalizeUnitValue(v) {
  if (isDateValue(v)) return v.getDate() + '/' + (v.getMonth() + 1);
  return v;
}

function readRows(name) {
  var sh = sheet(name);
  var values = sh.getDataRange().getValues();
  var headers = values[0];
  var dateCol = headers.indexOf('date');
  var unitCol = headers.indexOf('unit');
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var row = {};
    for (var c = 0; c < headers.length; c++) row[headers[c]] = values[i][c];
    if (dateCol >= 0) row.date = normalizeDateValue(row.date);
    if (unitCol >= 0) row.unit = normalizeUnitValue(row.unit);
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
  var dateCol = headers.indexOf('date');
  for (var i = values.length - 1; i >= 1; i--) {
    var row = {};
    for (var c = 0; c < headers.length; c++) row[headers[c]] = values[i][c];
    if (dateCol >= 0) row.date = normalizeDateValue(row.date);
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
      hasCustomName: !!p.hasCustomName, branches: p.branches || '', active: true,
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

function getDay(date, branch) {
  var entries = readRows(SHEET_NAMES.DAILY).rows.filter(function (r) { return r.date === date && r.branch === branch; });
  var metaRows = readRows(SHEET_NAMES.DAYMETA).rows.filter(function (r) { return r.date === date && r.branch === branch; });
  return { date: date, branch: branch, meta: metaRows[0] || null, items: entries };
}

function saveDay(p) {
  // full replace لنفس التاريخ + نفس الفرع فقط (كل فرع مستقل، ما بيمسح فروع تانية بنفس اليوم)
  deleteRowsWhere(SHEET_NAMES.DAILY, function (row) { return row.date === p.date && row.branch === p.branch; });
  var savedAt = nowIso();
  (p.items || []).forEach(function (it) {
    appendRow(SHEET_NAMES.DAILY, {
      date: p.date, branch: p.branch, itemId: it.itemId, itemName: it.itemName, unit: it.unit,
      confirmed: !!it.confirmed, received: it.received, returned: it.returned, cookName: it.cookName || '',
      notes: it.notes || '', savedAt: savedAt
    });
  });

  var metaRows = readRows(SHEET_NAMES.DAYMETA);
  var existing = metaRows.rows.filter(function (r) { return r.date === p.date && r.branch === p.branch; })[0];
  var metaObj = {
    date: p.date, branch: p.branch, employeeName: p.employeeName || '',
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
  return { date: p.date, branch: p.branch, savedAt: savedAt };
}

function getReport(start, end) {
  var settings = getSettings();
  var returnThreshold = settings.returnThresholdPct !== undefined && settings.returnThresholdPct !== ''
    ? Number(settings.returnThresholdPct) : 0.30;
  var allEntries = readRows(SHEET_NAMES.DAILY).rows.filter(function (r) { return r.date >= start && r.date <= end; });
  var allMeta = readRows(SHEET_NAMES.DAYMETA).rows.filter(function (r) { return r.date >= start && r.date <= end; });

  // نجمع حسب (التاريخ + الفرع) — كل فرع بيوم معين سجل مستقل بروابطه وموظفه الخاص،
  // بينما الإجمالي (totals تحت) بيضم كل الفروع مع بعض بتقرير واحد للشيف.
  var byDateBranch = {};
  allEntries.forEach(function (r) {
    var key = r.date + '||' + r.branch;
    if (!byDateBranch[key]) byDateBranch[key] = [];
    byDateBranch[key].push(r);
  });
  var days = Object.keys(byDateBranch).sort().map(function (key) {
    var parts = key.split('||');
    var date = parts[0], branch = parts[1];
    var meta = allMeta.filter(function (m) { return m.date === date && m.branch === branch; })[0] || null;
    return { date: date, branch: branch, meta: meta, items: byDateBranch[key] };
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

function getTomorrowOrder(date, branch) {
  return readRows(SHEET_NAMES.TOMORROW).rows.filter(function (r) { return r.date === date && r.branch === branch; });
}

function saveTomorrowOrder(p) {
  deleteRowsWhere(SHEET_NAMES.TOMORROW, function (row) { return row.date === p.date && row.branch === p.branch; });
  var savedAt = nowIso();
  (p.items || []).forEach(function (it) {
    appendRow(SHEET_NAMES.TOMORROW, {
      date: p.date, branch: p.branch, itemId: it.itemId, itemName: it.itemName, unit: it.unit,
      qty: it.qty, notes: it.notes || '', employeeName: p.employeeName || '', savedAt: savedAt
    });
  });
  return { date: p.date, branch: p.branch, savedAt: savedAt };
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
