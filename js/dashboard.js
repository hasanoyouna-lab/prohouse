// ==================== الرئيسية (Dashboard) ====================

function branchVisibleItems(branch) {
  return Items.current.filter(item => {
    const list = (item.branches || "").split(",").map(s => s.trim()).filter(Boolean);
    return list.length === 0 || list.includes(branch);
  });
}

async function loadBranchStatus(branch) {
  const visible = branchVisibleItems(branch);
  const data = await Sync.get("getDay", { date: todayStr(), branch }, "day:" + todayStr() + ":" + branch);
  const items = (data && data.items) || [];
  const confirmedIds = new Set(items.filter(it => it.confirmed === true || it.confirmed === "TRUE").map(it => it.itemId));
  const touchedIds = new Set(items.filter(it => it.received !== "" && it.received != null).map(it => it.itemId));

  const total = visible.length;
  const confirmed = visible.filter(it => confirmedIds.has(it.id)).length;
  const touched = visible.filter(it => touchedIds.has(it.id)).length;

  let status = "none";
  if (touched > 0 && confirmed >= total && total > 0) status = "done";
  else if (touched > 0) status = "partial";

  return { branch, total, confirmed, touched, status };
}

function statusPillHtml(status) {
  if (status === "done") return `<span class="status-pill done">✅ مكتمل</span>`;
  if (status === "partial") return `<span class="status-pill partial">⚠ جزئي</span>`;
  return `<span class="status-pill none">— لم يبدأ</span>`;
}

async function renderDashboard() {
  const view = document.getElementById("dashboardView");
  view.innerHTML = '<div class="loader">جاري تحميل الرئيسية…</div>';

  await Items.load();
  const branches = allowedBranchList();
  const statuses = await Promise.all(branches.map(loadBranchStatus));

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "صباح الخير" : hour < 17 ? "مساء الخير" : "مساء الخير";

  let flaggedCount = 0;
  if (Auth.canSeeReports()) {
    const monthStart = todayStr().slice(0, 7) + "-01";
    const monthEnd = todayStr();
    const reportData = await Sync.get("getReport", { start: monthStart, end: monthEnd }, "report:" + monthStart + ":" + monthEnd);
    flaggedCount = (reportData && reportData.flaggedCount) || 0;
  }

  const pending = Sync.getQueue().length;

  view.innerHTML = `
    <div class="dash-greeting">${greeting} 👋</div>
    <div class="dash-date">${new Date().toLocaleDateString("ar-EG", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</div>

    <div class="dash-grid" id="dashBranchGrid"></div>

    ${Auth.canSeeReports() ? `
    <div class="dash-tile" id="dashFlaggedTile">
      <div class="lbl">عدد الأصناف بنسبة إرجاع مرتفعة هذا الشهر (هدر محتمل)</div>
      <div class="big">${flaggedCount}</div>
    </div>` : ""}

    <div class="dash-links">
      <button class="btn primary" id="dashGotoEntry">📝 طلبية اليوم</button>
      <button class="btn" id="dashGotoTomorrow">📦 طلبية الغد</button>
      ${Auth.canSeeReports() ? '<button class="btn" id="dashGotoReport">📊 التقارير</button>' : ""}
    </div>
  `;

  const grid = document.getElementById("dashBranchGrid");
  statuses.forEach(s => {
    const pct = s.total > 0 ? Math.round((s.confirmed / s.total) * 100) : 0;
    const card = document.createElement("div");
    card.className = "dash-card";
    card.innerHTML = `
      <div class="branch-name">${s.branch}</div>
      ${statusPillHtml(s.status)}
      <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
      <div style="font-size:11px;color:var(--gray);">${s.confirmed}/${s.total} صنف مؤكّد</div>
    `;
    card.addEventListener("click", () => {
      Branch.set(s.branch);
      document.querySelector('.tab-btn[data-tab="entry"]').click();
    });
    grid.appendChild(card);
  });

  if (Auth.canSeeReports()) {
    document.getElementById("dashFlaggedTile").addEventListener("click", () => {
      document.querySelector('.tab-btn[data-tab="report"]').click();
    });
    document.getElementById("dashGotoReport").addEventListener("click", () => document.querySelector('.tab-btn[data-tab="report"]').click());
  }
  document.getElementById("dashGotoEntry").addEventListener("click", () => document.querySelector('.tab-btn[data-tab="entry"]').click());
  document.getElementById("dashGotoTomorrow").addEventListener("click", () => document.querySelector('.tab-btn[data-tab="tomorrow"]').click());
}

function initDashboardTab() {
  renderDashboard();
}
