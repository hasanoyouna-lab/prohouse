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
  document.getElementById("reportType").addEventListener("change", (e) => {
    const isTomorrow = e.target.value === "tomorrow";
    document.getElementById("entriesReportControls").classList.toggle("hidden", isTomorrow);
    document.getElementById("tomorrowReportControls").classList.toggle("hidden", !isTomorrow);
    if (isTomorrow) runTomorrowReport();
  });
  initTomorrowReportControls();

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

  const chartBlock = `<div class="chart-wrap"><canvas id="reportTrendChart"></canvas></div>`;

  view.innerHTML = summary + chartBlock + branchStatsBlock + linksBlock + `<div class="cat-title">الإجمالي حسب الصنف</div>` + (totalsCards || '<div class="empty-state">مافي أصناف تطابق هالفلترة.</div>');

  renderTrendChart(filtered.days);
}

let trendChartInstance = null;
function renderTrendChart(days) {
  const canvas = document.getElementById("reportTrendChart");
  if (!canvas || typeof Chart === "undefined") return;

  const byDate = {};
  days.forEach(d => {
    if (!byDate[d.date]) byDate[d.date] = { received: 0, returned: 0 };
    (d.items || []).forEach(it => {
      const r = Number(it.received), rt = Number(it.returned);
      if (!isNaN(r)) byDate[d.date].received += r;
      if (!isNaN(rt)) byDate[d.date].returned += rt;
    });
  });
  const dates = Object.keys(byDate).sort();

  if (trendChartInstance) { trendChartInstance.destroy(); trendChartInstance = null; }
  trendChartInstance = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels: dates,
      datasets: [
        { label: "مستلم (جم)", data: dates.map(d => byDate[d].received), borderColor: "#000000", backgroundColor: "rgba(0,0,0,.08)", tension: .3, fill: true },
        { label: "مرتجع (جم)", data: dates.map(d => byDate[d].returned), borderColor: "#ff5151", backgroundColor: "rgba(255,81,81,.1)", tension: .3, fill: true }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: "bottom", labels: { font: { family: "Tajawal" } } } },
      scales: {
        x: { ticks: { font: { family: "Tajawal" }, maxRotation: 0 } },
        y: { ticks: { font: { family: "Tajawal" } }, beginAtZero: true }
      }
    }
  });
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

// ==================== طلبية الغد (تقرير جاهز للشيف) — فرع واحد أو كل الفروع بنفس الشكل ====================

let lastTomorrowReportRows = [];
let lastTomorrowReportBranches = [];
let lastTomorrowReportDate = "";

function initTomorrowReportControls() {
  document.getElementById("tomorrowReportBranch").innerHTML =
    `<option value="">كل الفروع</option>` + branchList().map(b => `<option value="${b}">${b}</option>`).join("");
  document.getElementById("tomorrowReportDate").value = addDaysStr(todayStr(), 1);
  document.getElementById("tomorrowReportGoBtn").addEventListener("click", runTomorrowReport);
  document.getElementById("tomorrowReportExportBtn").addEventListener("click", exportTomorrowReportExcel);
}

async function runTomorrowReport() {
  const view = document.getElementById("tomorrowReportView");
  view.innerHTML = '<div class="loader">جاري تجميع طلبية الغد…</div>';
  await Items.load();

  const date = document.getElementById("tomorrowReportDate").value || addDaysStr(todayStr(), 1);
  const branchFilter = document.getElementById("tomorrowReportBranch").value;
  const branches = branchFilter ? [branchFilter] : branchList();
  lastTomorrowReportDate = date;
  lastTomorrowReportBranches = branches;

  const perBranch = await Promise.all(branches.map(b =>
    Sync.get("getTomorrowOrder", { date, branch: b }, "tomorrow:" + date + ":" + b)
  ));

  // نجمع الأصناف (بترتيب/تصنيف القائمة الأساسية) مع كمية كل فرع بعمود لحاله
  const rowsByItem = {};
  Items.current.forEach(it => {
    rowsByItem[it.id] = { itemId: it.id, category: it.category, name: it.name, unit: it.unit, sortOrder: it.sortOrder, qtyByBranch: {}, notes: [] };
  });
  branches.forEach((b, i) => {
    (perBranch[i] || []).forEach(entry => {
      if (!rowsByItem[entry.itemId]) {
        rowsByItem[entry.itemId] = { itemId: entry.itemId, category: "-", name: entry.itemName, unit: entry.unit, sortOrder: 999, qtyByBranch: {}, notes: [] };
      }
      rowsByItem[entry.itemId].qtyByBranch[b] = entry.qty;
      if (entry.notes) rowsByItem[entry.itemId].notes.push(branchFilter ? entry.notes : `${b}: ${entry.notes}`);
    });
  });

  const rows = Object.values(rowsByItem)
    .filter(r => Object.values(r.qtyByBranch).some(q => q !== "" && q != null && Number(q) > 0))
    .sort((a, b) => String(a.category).localeCompare(String(b.category)) || (Number(a.sortOrder) - Number(b.sortOrder)));

  lastTomorrowReportRows = rows;
  renderTomorrowReport(rows, branches, date);
}

function renderTomorrowReport(rows, branches, date) {
  const view = document.getElementById("tomorrowReportView");
  if (!rows.length) {
    view.innerHTML = '<div class="empty-state">مافي طلبية محفوظة لهذا اليوم/الفرع بعد.<br>ابدأ بتعبئة تاب "طلبية الغد".</div>';
    return;
  }

  const branchCols = branches.map(b => `<th>${b} (الكمية)</th>`).join("");
  const showTotal = branches.length > 1;

  const bodyRows = rows.map(r => {
    const catCell = `<td class="cat-cell">${r.category}</td>`;
    const qtyCells = branches.map(b => {
      const q = r.qtyByBranch[b];
      return `<td>${q !== undefined && q !== null && q !== "" ? `${q} ${r.unit || ""}` : "—"}</td>`;
    }).join("");
    const total = branches.reduce((sum, b) => sum + (Number(r.qtyByBranch[b]) || 0), 0);
    const totalCell = showTotal ? `<td class="total-cell">${total} ${r.unit || ""}</td>` : "";
    return `<tr>${catCell}<td class="name-cell">${r.name}</td>${qtyCells}${totalCell}<td>${r.notes.join(" / ")}</td></tr>`;
  }).join("");

  view.innerHTML = `
    <div class="order-table-wrap">
      <div class="order-header">طلبية الغد — ${date} — ${branches.length > 1 ? "كل الفروع" : branches[0]}</div>
      <table class="order-table">
        <thead><tr>
          <th>الفئة</th><th>اسم الصنف</th>${branchCols}${showTotal ? "<th>المجموع</th>" : ""}<th>ملاحظات</th>
        </tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
  `;
}

function exportTomorrowReportExcel() {
  if (!lastTomorrowReportRows.length) { showToast("مافي بيانات للتصدير"); return; }
  if (typeof XLSX === "undefined") { showToast("مكتبة Excel لسا ما تحمّلت، جرب مرة ثانية"); return; }

  const branches = lastTomorrowReportBranches;
  const showTotal = branches.length > 1;
  const qtyCell = (r, b) => {
    const q = r.qtyByBranch[b];
    return q !== undefined && q !== null && q !== "" ? `${q} ${r.unit || ""}` : "—";
  };

  const header = ["الفئة", "اسم الصنف", ...branches, ...(showTotal ? ["المجموع"] : []), "ملاحظات"];
  const aoa = [header];
  const merges = [];
  let rowIdx = 1; // 0 = header

  const grouped = [];
  lastTomorrowReportRows.forEach(r => {
    const last = grouped[grouped.length - 1];
    if (last && last.category === r.category) last.items.push(r); else grouped.push({ category: r.category, items: [r] });
  });

  grouped.forEach(group => {
    const startRow = rowIdx;
    group.items.forEach(r => {
      const total = branches.reduce((s, b) => s + (Number(r.qtyByBranch[b]) || 0), 0);
      aoa.push([
        r.category, r.name,
        ...branches.map(b => qtyCell(r, b)),
        ...(showTotal ? [`${total} ${r.unit || ""}`] : []),
        r.notes.join(" / ")
      ]);
      rowIdx++;
    });
    if (group.items.length > 1) merges.push({ s: { r: startRow, c: 0 }, e: { r: rowIdx - 1, c: 0 } });
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!merges"] = merges;
  ws["!cols"] = [
    { wch: 14 }, { wch: 26 },
    ...branches.map(() => ({ wch: 16 })),
    ...(showTotal ? [{ wch: 14 }] : []),
    { wch: 24 }
  ];
  ws["!rightToLeft"] = true;

  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, "طلبية الغد");
  XLSX.writeFile(wb, `طلبية_الغد_${lastTomorrowReportDate}.xlsx`);
}
