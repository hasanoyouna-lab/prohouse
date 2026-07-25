// ==================== التقارير (يوم / شهر / فترة) + تصدير Excel ====================

let lastReportData = null;
let lastReportRange = { start: "", end: "" };

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

  function syncBars() {
    const mode = modeSel.value;
    dayInput.classList.toggle("hidden", mode !== "day");
    monthInput.classList.toggle("hidden", mode !== "month");
    startInput.classList.toggle("hidden", mode !== "range");
    endInput.classList.toggle("hidden", mode !== "range");
  }
  modeSel.addEventListener("change", syncBars);
  syncBars();

  document.getElementById("reportGoBtn").addEventListener("click", runReport);
  document.getElementById("exportExcelBtn").addEventListener("click", exportExcel);

  document.getElementById("reportDayInput").value = todayStr();
  document.getElementById("reportMonthInput").value = todayStr().slice(0, 7);
  const r = monthRange(todayStr().slice(0, 7));
  document.getElementById("reportStartInput").value = r.start;
  document.getElementById("reportEndInput").value = r.end;

  runReport();
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

function renderReport(data) {
  const view = document.getElementById("reportView");
  if (!data || (!data.days || !data.days.length)) {
    view.innerHTML = '<div class="empty-state">مافي بيانات محفوظة لهذه الفترة بعد.<br>ابدأ بتعبئة تاب "إدخال اليوم".</div>';
    return;
  }

  const summary = `
    <div class="summary-banner">
      <div class="lbl">عدد الأصناف بنسبة إرجاع مرتفعة بهذه الفترة (هدر محتمل)</div>
      <div class="big">${data.flaggedCount}</div>
    </div>
  `;

  const dayLinks = data.days.map(d => {
    const links = [];
    if (d.meta && d.meta.salesReportLink) links.push(`<a href="${d.meta.salesReportLink}" target="_blank" rel="noopener">📈 مبيعات ${d.date}</a>`);
    if (d.meta && d.meta.paymentsReportLink) links.push(`<a href="${d.meta.paymentsReportLink}" target="_blank" rel="noopener">💳 مدفوعات ${d.date}</a>`);
    return links.join("");
  }).filter(Boolean).join("");

  const linksBlock = dayLinks ? `<div class="report-card"><div class="name">روابط تقارير الأيام</div><div class="day-links">${dayLinks}</div></div>` : "";

  const totalsCards = data.totals
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

  view.innerHTML = summary + linksBlock + `<div class="cat-title">الإجمالي حسب الصنف</div>` + totalsCards;
}

function exportExcel() {
  if (!lastReportData || !lastReportData.days || !lastReportData.days.length) {
    showToast("مافي بيانات للتصدير بهذه الفترة");
    return;
  }
  if (typeof XLSX === "undefined") {
    showToast("مكتبة Excel لسا ما تحمّلت، جرب مرة ثانية");
    return;
  }

  const detailRows = [];
  lastReportData.days.forEach(d => {
    (d.items || []).forEach(it => {
      detailRows.push({
        "التاريخ": d.date,
        "الموظف": d.meta ? d.meta.employeeName : "",
        "الصنف": it.itemName,
        "الوحدة": it.unit,
        "اسم الطبخة": it.cookName || "",
        "المستلم": it.received,
        "المرتجع": it.returned,
        "ملاحظات": it.notes || ""
      });
    });
  });

  const totalsRows = lastReportData.totals.map(t => ({
    "الصنف": t.itemName, "الوحدة": t.unit,
    "إجمالي مستلم": Math.round(t.totalReceived), "إجمالي مرتجع": Math.round(t.totalReturned),
    "متوسط يومي": t.avgDaily ? Math.round(t.avgDaily) : "", "نسبة إرجاع %": t.returnPct !== null ? Math.round(t.returnPct * 100) : ""
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows), "التفاصيل اليومية");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(totalsRows), "الإجمالي");
  XLSX.writeFile(wb, `تقرير_${lastReportRange.start}_${lastReportRange.end}.xlsx`);
}
