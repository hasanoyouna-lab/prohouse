// ==================== شاشة إدخال اليوم (استلام / إرجاع) ====================

const SHORTAGE_THRESHOLD = -0.20;
const SURPLUS_THRESHOLD  = 0.25;
const RETURN_THRESHOLD   = 0.30;

function todayStr() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function addDaysStr(dateStr, delta) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

let currentEntryDate = todayStr();
let currentEntry = {};   // itemId -> {received, returned, notes, cookName}
let currentDayMeta = { employeeName: "", salesReportLink: "", paymentsReportLink: "" };
let historicalAvg = {};  // itemId -> avg

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}

async function loadHistoricalAverages(beforeDate) {
  const end = addDaysStr(beforeDate, -1);
  const data = await Sync.get("getReport", { start: "2000-01-01", end }, "report:before:" + beforeDate);
  const map = {};
  (data && data.totals || []).forEach(t => { map[t.itemId] = t.avgDaily; });
  return map;
}

function computeStatus(received, avg) {
  if (avg === undefined || avg === null || isNaN(avg)) return { text: "لا يوجد سابق", cls: "neutral" };
  if (received === "" || received === null || isNaN(received)) return { text: "", cls: "neutral" };
  const diff = (received - avg) / avg;
  if (diff <= SHORTAGE_THRESHOLD) return { text: "⚠ نقص واضح (" + Math.round(diff * 100) + "%)", cls: "warn" };
  if (diff >= SURPLUS_THRESHOLD) return { text: "⚠ زيادة غير معتادة (+" + Math.round(diff * 100) + "%)", cls: "warn" };
  return { text: "طبيعي", cls: "ok" };
}
function computeReturnStatus(received, returned) {
  if (received === "" || received === null || isNaN(received) || Number(received) === 0) return { text: "", cls: "neutral" };
  if (returned === "" || returned === null || isNaN(returned)) return { text: "", cls: "neutral" };
  const pct = Number(returned) / Number(received);
  if (pct >= RETURN_THRESHOLD) return { text: "⚠ إرجاع مرتفع " + Math.round(pct * 100) + "% (هدر محتمل)", cls: "warn" };
  return { text: "إرجاع طبيعي " + Math.round(pct * 100) + "%", cls: "ok" };
}

function renderEntryView() {
  const view = document.getElementById("entryView");
  if (!view) return;
  view.innerHTML = "";

  const metaCard = document.createElement("div");
  metaCard.className = "item-card";
  metaCard.innerHTML = `
    <div class="inputs-row">
      <div class="field">
        <label>الموظف</label>
        <select id="employeeSelect">${employeeOptionsHtml()}</select>
      </div>
    </div>
    <div class="notes-row">
      <input type="url" id="salesLink" placeholder="رابط تقرير المبيعات حسب المنتج (Foodics/Tabsense)" value="${currentDayMeta.salesReportLink || ""}">
    </div>
    <div class="notes-row">
      <input type="url" id="paymentsLink" placeholder="رابط تقرير المدفوعات" value="${currentDayMeta.paymentsReportLink || ""}">
    </div>
  `;
  view.appendChild(metaCard);
  document.getElementById("employeeSelect").addEventListener("change", markDirty);
  document.getElementById("salesLink").addEventListener("input", markDirty);
  document.getElementById("paymentsLink").addEventListener("input", markDirty);

  if (!Items.current.length) {
    view.insertAdjacentHTML("beforeend", '<div class="empty-state">لا يوجد أصناف بعد. ضيف أصناف من تاب "إدارة الأصناف"، أو تأكد إن الباك اند مربوط (js/config.js).</div>');
    return;
  }

  let lastCat = null;
  Items.current.forEach(item => {
    if (item.category !== lastCat) {
      const h = document.createElement("div");
      h.className = "cat-title";
      h.textContent = item.category;
      view.appendChild(h);
      lastCat = item.category;
    }
    const entry = currentEntry[item.id] || { received: "", returned: "", notes: "", cookName: "" };
    const card = document.createElement("div");
    card.className = "item-card";
    card.innerHTML = `
      <div class="item-name">${item.name} <span class="item-unit">(${item.unit})</span></div>
      ${item.hasCustomName ? `
        <div class="cookname-row">
          <input type="text" placeholder="اسم الطبخة (مطلوب)" data-id="${item.id}" data-field="cookName" value="${entry.cookName || ""}">
        </div>` : ""}
      <div class="inputs-row">
        <div class="field">
          <label>الكمية المستلمة (جم)</label>
          <input type="number" inputmode="decimal" data-id="${item.id}" data-field="received" value="${entry.received}">
        </div>
        <div class="field">
          <label>الكمية المرتجعة (جم)</label>
          <input type="number" inputmode="decimal" data-id="${item.id}" data-field="returned" value="${entry.returned}">
        </div>
      </div>
      <div class="notes-row">
        <input type="text" placeholder="ملاحظة (اختياري)" data-id="${item.id}" data-field="notes" value="${entry.notes || ""}">
      </div>
      <div class="badges" id="badges-${item.id}"></div>
    `;
    view.appendChild(card);
  });

  view.querySelectorAll("input[data-field]").forEach(inp => inp.addEventListener("input", onFieldChange));
  Items.current.forEach(item => updateBadges(item.id));
}

function employeeOptionsHtml() {
  const list = Sync.cacheGet("employees");
  const employees = (list && list.value) || [{ name: "موظف 1" }, { name: "موظف 2" }, { name: "موظف 3" }, { name: "موظف 4" }, { name: "موظف 5" }, { name: "موظف 6" }, { name: "موظف 7" }];
  const current = currentDayMeta.employeeName || Employee.get();
  return `<option value="">اختر الموظف</option>` + employees.map(e =>
    `<option value="${e.name}" ${e.name === current ? "selected" : ""}>${e.name}</option>`
  ).join("");
}

function onFieldChange(e) {
  const id = e.target.dataset.id;
  const field = e.target.dataset.field;
  if (!currentEntry[id]) currentEntry[id] = { received: "", returned: "", notes: "", cookName: "" };
  currentEntry[id][field] = e.target.value;
  updateBadges(id);
  markDirty();
}

function markDirty() {
  document.getElementById("saveStatus").textContent = "فيه تعديلات لسا ما تحفظت";
}

function updateBadges(id) {
  const el = document.getElementById("badges-" + id);
  if (!el) return;
  const entry = currentEntry[id] || {};
  const received = entry.received === "" ? "" : Number(entry.received);
  const returned = entry.returned === "" ? "" : Number(entry.returned);
  const avg = historicalAvg[id];
  const st1 = computeStatus(received, avg);
  const st2 = computeReturnStatus(received, returned);
  let html = "";
  if (avg !== undefined && avg !== null) html += `<span class="badge neutral">متوسط سابق: ${Math.round(avg)} جم</span>`;
  if (st1.text) html += `<span class="badge ${st1.cls}">${st1.text}</span>`;
  if (st2.text) html += `<span class="badge ${st2.cls}">${st2.text}</span>`;
  el.innerHTML = html;
}

async function loadEntryDay(dateStr) {
  document.getElementById("entryView").innerHTML = '<div class="loader">جاري التحميل…</div>';
  currentEntry = {};
  currentDayMeta = { employeeName: Employee.get(), salesReportLink: "", paymentsReportLink: "" };

  await Items.load();

  const dayData = await Sync.get("getDay", { date: dateStr }, "day:" + dateStr, (val) => applyDayData(val));
  applyDayData(dayData);

  historicalAvg = await loadHistoricalAverages(dateStr);
  renderEntryView();

  const hasData = Object.keys(currentEntry).length > 0;
  document.getElementById("saveStatus").textContent = hasData
    ? "تم تحميل بيانات محفوظة لهذا اليوم — عدّل واحفظ لو احتجت"
    : "لسا ما تحفظ شي لهذا اليوم";
}

function applyDayData(val) {
  if (!val) return;
  if (val.meta) currentDayMeta = { ...currentDayMeta, ...val.meta };
  if (val.items && val.items.length) {
    const map = {};
    val.items.forEach(it => { map[it.itemId] = { received: it.received, returned: it.returned, notes: it.notes, cookName: it.cookName }; });
    currentEntry = map;
  }
}

function initEntryTab() {
  const dateInput = document.getElementById("dateInput");
  dateInput.value = currentEntryDate;
  dateInput.addEventListener("change", (e) => {
    currentEntryDate = e.target.value;
    loadEntryDay(currentEntryDate);
  });

  document.getElementById("saveBtn").addEventListener("click", () => {
    const employeeName = document.getElementById("employeeSelect").value;
    if (!employeeName) { showToast("اختر اسم الموظف قبل الحفظ"); return; }
    Employee.set(employeeName);
    const salesReportLink = document.getElementById("salesLink").value.trim();
    const paymentsReportLink = document.getElementById("paymentsLink").value.trim();

    const items = Items.current
      .filter(it => currentEntry[it.id] && (currentEntry[it.id].received !== "" || currentEntry[it.id].returned !== "" || currentEntry[it.id].notes))
      .map(it => ({
        itemId: it.id, itemName: it.name, unit: it.unit,
        received: currentEntry[it.id].received, returned: currentEntry[it.id].returned,
        cookName: currentEntry[it.id].cookName || "", notes: currentEntry[it.id].notes || ""
      }));

    const payload = { date: currentEntryDate, employeeName, salesReportLink, paymentsReportLink, items };
    Sync.enqueue("saveDay:" + currentEntryDate, "saveDay", payload);
    Sync.cacheSet("day:" + currentEntryDate, { date: currentEntryDate, meta: { employeeName, salesReportLink, paymentsReportLink }, items });
    document.getElementById("saveStatus").textContent = "✅ محفوظ محلياً — بتتزامن " + new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
    showToast("تم حفظ بيانات اليوم");
  });

  loadEntryDay(currentEntryDate);
}
