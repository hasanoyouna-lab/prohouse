// ==================== التقارير (يوم / شهر / فترة) + فلاتر + تصدير Excel ====================

let lastReportData = null;      // البيانات الخام من السيرفر (كل الفروع/الموظفين) لنفس الفترة
let lastReportRange = { start: "", end: "" };
let lastFilteredDays = [];      // بعد تطبيق فلاتر الفرع/الموظف/التصنيف — تُستخدم بالعرض والتصدير معاً

function monthRange(monthStr) {
  const [y, m] = monthStr.split("-").map(Number);
  const start = monthStr + "-01";
  const lastDay = new Date(y, m, 0).getDate();
  const end = monthStr + "-" + String(lastDay).padStart(2, "0");
  return { start, end };
}

function initReportTab() {
  const modeSel = document.getElementById("reportMode");
  const dayInput = document.getElementById("reportDayInput");
  const monthInput = document.getElementById("reportMonthInput");
  const startInput = document.getElementById("reportStartInput");
  const endInput = document.getElementById("reportEndInput");
  const rangeSep = document.getElementById("reportRangeSep");

  function syncBars() {
    const mode = modeSel.value;
    dayInput.classList.toggle("hidden", mode !== "day");
    monthInput.classList.toggle("hidden", mode !== "month");
    startInput.classList.toggle("hidden", mode !== "range");
    endInput.classList.toggle("hidden", mode !== "range");
    rangeSep.classList.toggle("hidden", mode !== "range");
  }
  modeSel.addEventListener("change", syncBars);
  syncBars();

  document.getElementById("reportGoBtn").addEventListener("click", runReport);
  document.getElementById("exportExcelBtn").addEventListener("click", exportExcel);
  ["reportBranchFilter", "reportCategoryFilter", "reportEmployeeFilter"].forEach(id => {
    document.getElementById(id).addEventListener("change", () => renderReport(lastReportData));
  });
  document.getElementById("reportFlaggedOnly").addEventListener("change", () => renderReport(lastReportData));

  document.getElementById("reportDayInput").value = todayStr();
  document.getElementById("reportMonthInput").value = todayStr().slice(0, 7);
  const r = monthRange(todayStr().slice(0, 7));
  document.getElementById("reportStartInput").value = r.start;
  document.getElementById("reportEndInput").value = r.end;

  populateReportFilterOptions();
  runReport();
}

async function populateReportFilterOptions() {
  const branchSel = document.getElementById("reportBranchFilter");
  branchSel.innerHTML = `<option value="">كل الفروع</option>` + branchList().map(b => `<option value="${b}">${b}</option>`).join("");

  await Items.load();
  const cats = [...new Set(Items.current.map(it => it.category).filter(Boolean))];
  document.getElementById("reportCategoryFilter").innerHTML = `<option value="">كل التصنيفات</option>` + cats.map(c => `<option value="${c}">${c}</option>`).join("");

  const empData = Sync.cacheGet("employees");
  const employees = (empData && empData.value) || [];
  document.getElementById("reportEmployeeFilter").innerHTML = `<option value="">كل الموظفين</option>` + employees.map(e => `<option value="${e.name}">${e.name}</option>`).join("");
}

function currentReportRange() {
  const mode = document.getElementById("reportMode").value;
  if (mode === "day") {
    const d = document.getElementById("reportDayInput").value || todayStr();
    return { start: d, end: d };
  }
  if (mode === "month") {
    const m = document.getElementById("reportMonthInput").value || todayStr().slice(0, 7);
    return monthRange(m);
  }
  const start = document.getElementById("reportStartInput").value;
  const end = document.getElementById("reportEndInput").value;
  return { start: start || todayStr(), end: end || todayStr() };
}

async function runReport() {
  const view = document.getElementById("reportView");
  view.innerHTML = '<div class="loader">جاري تجميع التقرير…</div>';
  const { start, end } = currentReportRange();
  lastReportRange = { start, end };

  const data = await Sync.get("getReport", { start, end }, "report:" + start + ":" + end, (val) => {
    lastReportData = val;
    renderReport(val);
  });
  lastReportData = data;
  renderReport(data);
}

// يعيد بناء "الإجمالي حسب الصنف" من مجموعة أيام مفلترة (يطابق منطق السيرفر لكن على العميل)
function computeTotalsFromDays(days) {
  const returnThreshold = thresholdFrom("returnThresholdPct", RETURN_THRESHOLD_DEFAULT);
  const totalsMap = {};
  days.forEach(d => (d.items || []).forEach(it => {
    if (!totalsMap[it.itemId]) totalsMap[it.itemId] = { itemId: it.itemId, itemName: it.itemName, unit: it.unit, totalReceived: 0, totalReturned: 0, dayCount: 0 };
    const t = totalsMap[it.itemId];
    const rec = Number(it.received), ret = Number(it.returned);
    if (!isNaN(rec) && it.received !== "" && it.received != null) { t.totalReceived += rec; t.dayCount += 1; }
    if (!isNaN(ret) && it.returned !== "" && it.returned != null) { t.totalReturned += ret; }
  }));
  let flaggedCount = 0;
  const totals = Object.values(totalsMap).map(t => {
    t.avgDaily = t.dayCount > 0 ? t.totalReceived / t.dayCount : null;
    t.returnPct = t.totalReceived > 0 ? t.totalReturned / t.totalReceived : null;
    t.flagged = t.returnPct !== null && t.returnPct >= returnThreshold;
    if (t.flagged) flaggedCount++;
    return t;
  });
  return { totals, flaggedCount };
}

function applyReportFilters(data) {
  if (!data || !data.days) return { days: [], totals: [], flaggedCount: 0 };
  const branch = document.getElementById("reportBranchFilter").value;
  const category = document.getElementById("reportCategoryFilter").value;
  const employee = document.getElementById("reportEmployeeFilter").value;

  let days = data.days;
  if (branch) days = days.filter(d => d.branch === branch);
  if (employee) days = days.filter(d => d.meta && d.meta.employeeName === employee);

  if (category) {
    days = days.map(d => ({ ...d, items: (d.items || []).filter(it => { const item = Items.byId(it.itemId); return item && item.category === category; }) }));
  }

  const noFilters = !branch && !category && !employee;
  const { totals, flaggedCount } = noFilters ? { totals: data.totals, flaggedCount: data.flaggedCount } : computeTotalsFromDays(days);
  return { days, totals, flaggedCount };
}

function renderReport(data) {
  const view = document.getElementById("reportView");
  const filtered = applyReportFilters(data);
  lastFilteredDays = filtered.days;

  if (!filtered.days.length) {
    view.innerHTML = '<div class="empty-state">مافي بيانات محفوظة لهذه الفترة/الفلترة بعد.<br>ابدأ بتعبئة تاب "طلبية اليوم".</div>';
    return;
  }

  const flaggedOnly = document.getElementById("reportFlaggedOnly").checked;

  const summary = `
    <div class="summary-banner">
      <div class="lbl">عدد الأصناف بنسبة إرجاع مرتفعة بهذه الفترة/الفلترة (هدر محتمل)</div>
      <div class="big">${filtered.flaggedCount}</div>
    </div>
  `;

  const branchStats = branchList().map(b => {
    const branchDays = filtered.days.filter(d => d.branch === b);
    let recv = 0, ret = 0;
    branchDays.forEach(d => (d.items || []).forEach(it => {
      const r = Number(it.received), rt = Number(it.returned);
      if (!isNaN(r)) recv += r;
      if (!isNaN(rt)) ret += rt;
    }));
    return { branch: b, dayCount: branchDays.length, recv, ret };
  }).filter(s => s.dayCount > 0);

  const branchStatsBlock = branchStats.length ? `
    <div class="cat-title">ملخص حسب الفرع</div>
    ${branchStats.map(s => `
      <div class="report-card">
        <div class="top-row"><div class="name">${s.branch}</div></div>
        <div class="stat-grid">
          <div class="stat"><div class="v">${s.dayCount}</div><div class="l">أيام مسجلة</div></div>
          <div class="stat"><div class="v">${Math.round(s.recv)}</div><div class="l">إجمالي مستلم (جم)</div></div>
          <div class="stat"><div class="v">${Math.round(s.ret)}</div><div class="l">إجمالي مرتجع (جم)</div></div>
        </div>
      </div>
    `).join("")}
  ` : "";

  const dayLinks = filtered.days.map(d => {
    const links = [];
    if (d.meta && d.meta.salesReportLink) links.push(`<a href="${d.meta.salesReportLink}" target="_blank" rel="noopener">📈 مبيعات ${d.branch} — ${d.date}</a>`);
    if (d.meta && d.meta.paymentsReportLink) links.push(`<a href="${d.meta.paymentsReportLink}" target="_blank" rel="noopener">💳 مدفوعات ${d.branch} — ${d.date}</a>`);
    return links.join("");
  }).filter(Boolean).join("");

  const linksBlock = dayLinks ? `<div class="report-card"><div class="name">روابط تقارير الأيام</div><div class="day-links">${dayLinks}</div></div>` : "";

  const totalsCards = filtered.totals
    .filter(t => !flaggedOnly || t.flagged)
    .slice()
    .sort((a, b) => (a.itemName || "").localeCompare(b.itemName || ""))
    .map(t => `
      <div class="report-card">
        <div class="top-row">
          <div class="name">${t.itemName}</div>
          <div class="cat">${t.unit}</div>
        </div>
        <div class="stat-grid">
          <div class="stat"><div class="v">${Math.round(t.totalReceived)}</div><div class="l">إجمالي مستلم (جم)</div></div>
          <div class="stat"><div class="v">${Math.round(t.totalReturned)}</div><div class="l">إجمالي مرتجع (جم)</div></div>
          <div class="stat"><div class="v">${t.avgDaily ? Math.round(t.avgDaily) : "—"}</div><div class="l">متوسط يومي (جم)</div></div>
        </div>
        <div class="badges">
          ${t.returnPct !== null ? `<span class="badge ${t.flagged ? 'warn' : 'ok'}">${t.flagged ? '⚠ ' : ''}نسبة إرجاع ${Math.round(t.returnPct * 100)}%</span>` : ""}
        </div>
      </div>
    `).join("");

  view.innerHTML = summary + branchStatsBlock + linksBlock + `<div class="cat-title">الإجمالي حسب الصنف</div>` + (totalsCards || '<div class="empty-state">مافي أصناف تطابق هالفلترة.</div>');
}

function exportExcel() {
  if (!lastFilteredDays.length) {
    showToast("مافي بيانات للتصدير بهذه الفترة/الفلترة");
    return;
  }
  if (typeof XLSX === "undefined") {
    showToast("مكتبة Excel لسا ما تحمّلت، جرب مرة ثانية");
    return;
  }

  const detailRows = [];
  lastFilteredDays.forEach(d => {
    (d.items || []).forEach(it => {
      detailRows.push({
        "التاريخ": d.date,
        "الفرع": d.branch,
        "الموظف": d.meta ? d.meta.employeeName : "",
        "تم الاستلام": it.confirmed === true || it.confirmed === "TRUE" ? "نعم" : "لا",
        "الصنف": it.itemName,
        "الوحدة": it.unit,
        "اسم الطبخة": it.cookName || "",
        "المستلم": it.received,
        "المرتجع": it.returned,
        "ملاحظات": it.notes || ""
      });
    });
  });

  const { totals } = computeTotalsFromDays(lastFilteredDays);
  const totalsRows = totals.map(t => ({
    "الصنف": t.itemName, "الوحدة": t.unit,
    "إجمالي مستلم": Math.round(t.totalReceived), "إجمالي مرتجع": Math.round(t.totalReturned),
    "متوسط يومي": t.avgDaily ? Math.round(t.avgDaily) : "", "نسبة إرجاع %": t.returnPct !== null ? Math.round(t.returnPct * 100) : ""
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows), "التفاصيل اليومية");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(totalsRows), "الإجمالي");
  XLSX.writeFile(wb, `تقرير_${lastReportRange.start}_${lastReportRange.end}.xlsx`);
}
