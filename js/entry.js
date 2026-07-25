// ==================== شاشة إدخال اليوم (استلام / إرجاع) ====================

const SHORTAGE_THRESHOLD_DEFAULT = -0.20;
const SURPLUS_THRESHOLD_DEFAULT  = 0.25;
const RETURN_THRESHOLD_DEFAULT   = 0.30;

// تُقرأ من شاشة الإعدادات (currentSettings مُعرّفة بـ js/settings.js) إن كانت محفوظة، وإلا القيم الافتراضية فوق.
function thresholdFrom(key, fallback) {
  const v = (typeof currentSettings !== "undefined" && currentSettings[key] !== undefined && currentSettings[key] !== "")
    ? Number(currentSettings[key]) : NaN;
  return isNaN(v) ? fallback : v;
}

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
let currentEntry = {};   // itemId -> {received, returned, notes, cookName, confirmed}
let currentDayMeta = { employeeName: "", salesReportLink: "", paymentsReportLink: "" };
let historicalAvg = {};  // itemId -> avg
let currentBranch = "";

const Branch = {
  get() { return localStorage.getItem("ph_branch") || ""; },
  set(name) { localStorage.setItem("ph_branch", name); }
};

function branchList() {
  const raw = (typeof currentSettings !== "undefined" && currentSettings.branches) || DEFAULT_BRANCHES_FALLBACK;
  return raw.split(",").map(s => s.trim()).filter(Boolean);
}

function branchOptionsHtml(selected) {
  const current = selected || Branch.get();
  return `<option value="">اختر الفرع</option>` + branchList().map(b =>
    `<option value="${b}" ${b === current ? "selected" : ""}>${b}</option>`
  ).join("");
}

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}

// متوسط سابق خاص بنفس الفرع بس (كل فرع له نمط استهلاك مختلف)
async function loadHistoricalAverages(beforeDate, branch) {
  const end = addDaysStr(beforeDate, -1);
  const data = await Sync.get("getReport", { start: "2000-01-01", end }, "report:before:" + beforeDate + ":" + branch);
  const sums = {}, counts = {};
  (data && data.days || []).filter(d => d.branch === branch).forEach(d => {
    (d.items || []).forEach(it => {
      const rec = Number(it.received);
      if (!isNaN(rec) && it.received !== "" && it.received != null) {
        sums[it.itemId] = (sums[it.itemId] || 0) + rec;
        counts[it.itemId] = (counts[it.itemId] || 0) + 1;
      }
    });
  });
  const map = {};
  Object.keys(sums).forEach(id => { map[id] = sums[id] / counts[id]; });
  return map;
}

function computeStatus(received, avg) {
  if (avg === undefined || avg === null || isNaN(avg)) return { text: "لا يوجد سابق", cls: "neutral" };
  if (received === "" || received === null || isNaN(received)) return { text: "", cls: "neutral" };
  const diff = (received - avg) / avg;
  const shortage = thresholdFrom("shortageThresholdPct", SHORTAGE_THRESHOLD_DEFAULT);
  const surplus = thresholdFrom("surplusThresholdPct", SURPLUS_THRESHOLD_DEFAULT);
  if (diff <= shortage) return { text: "⚠ نقص واضح (" + Math.round(diff * 100) + "%)", cls: "warn" };
  if (diff >= surplus) return { text: "⚠ زيادة غير معتادة (+" + Math.round(diff * 100) + "%)", cls: "warn" };
  return { text: "طبيعي", cls: "ok" };
}
function computeReturnStatus(received, returned) {
  if (received === "" || received === null || isNaN(received) || Number(received) === 0) return { text: "", cls: "neutral" };
  if (returned === "" || returned === null || isNaN(returned)) return { text: "", cls: "neutral" };
  const pct = Number(returned) / Number(received);
  const returnThreshold = thresholdFrom("returnThresholdPct", RETURN_THRESHOLD_DEFAULT);
  if (pct >= returnThreshold) return { text: "⚠ إرجاع مرتفع " + Math.round(pct * 100) + "% (هدر محتمل)", cls: "warn" };
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
      <div class="field">
        <label>الفرع</label>
        <select id="branchSelect">${branchOptionsHtml(currentBranch)}</select>
      </div>
    </div>
  `;
  view.appendChild(metaCard);
  document.getElementById("employeeSelect").addEventListener("change", scheduleAutoSave);
  document.getElementById("branchSelect").addEventListener("change", (e) => {
    currentBranch = e.target.value;
    Branch.set(currentBranch);
    loadEntryDay(currentEntryDate);
  });

  // فلترة الأصناف حسب الفرع — فقط بشاشة الاستلام (طلبية الغد بتضل تعرض كل الأصناف)
  const visibleItems = Items.current.filter(item => {
    const list = (item.branches || "").split(",").map(s => s.trim()).filter(Boolean);
    return list.length === 0 || list.includes(currentBranch);
  });

  if (!visibleItems.length) {
    view.insertAdjacentHTML("beforeend", '<div class="empty-state">لا يوجد أصناف مفعّلة لهذا الفرع. راجع "إدارة الأصناف" وحدد الفروع لكل صنف، أو تأكد إن الباك اند مربوط (js/config.js).</div>');
    return;
  }

  let lastCat = null;
  visibleItems.forEach(item => {
    if (item.category !== lastCat) {
      const h = document.createElement("div");
      h.className = "cat-title";
      h.textContent = item.category;
      view.appendChild(h);
      lastCat = item.category;
    }
    const entry = currentEntry[item.id] || { received: "", returned: "", notes: "", cookName: "", confirmed: false };
    const card = document.createElement("div");
    card.className = "item-card";
    card.innerHTML = `
      <div class="item-name" style="display:flex;align-items:center;justify-content:space-between;">
        <span>${item.name} <span class="item-unit">(${item.unit})</span></span>
        <label style="display:flex;align-items:center;gap:5px;font-size:12.5px;font-weight:700;cursor:pointer;">
          <input type="checkbox" data-id="${item.id}" data-field="confirmed" ${entry.confirmed ? "checked" : ""} style="width:18px;height:18px;">
          تم الاستلام
        </label>
      </div>
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

  const linksCard = document.createElement("div");
  linksCard.className = "item-card";
  linksCard.innerHTML = `
    <div class="notes-row">
      <input type="url" id="salesLink" placeholder="رابط تقرير المبيعات حسب المنتج (Foodics/Tabsense)" value="${currentDayMeta.salesReportLink || ""}">
    </div>
    <div class="notes-row">
      <input type="url" id="paymentsLink" placeholder="رابط تقرير المدفوعات" value="${currentDayMeta.paymentsReportLink || ""}">
    </div>
  `;
  view.appendChild(linksCard);
  document.getElementById("salesLink").addEventListener("input", scheduleAutoSave);
  document.getElementById("paymentsLink").addEventListener("input", scheduleAutoSave);

  view.querySelectorAll("input[data-field]").forEach(inp => {
    const evt = inp.type === "checkbox" ? "change" : "input";
    inp.addEventListener(evt, onFieldChange);
  });
  visibleItems.forEach(item => updateBadges(item.id));
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
  if (!currentEntry[id]) currentEntry[id] = { received: "", returned: "", notes: "", cookName: "", confirmed: false };
  currentEntry[id][field] = e.target.type === "checkbox" ? e.target.checked : e.target.value;
  updateBadges(id);
  scheduleAutoSave();
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
  currentBranch = Branch.get();
  await Items.load();

  if (!currentBranch) {
    // ما فيه فرع محدد بعد — نطلب اختياره قبل ما نجيب/نعرض بيانات أي فرع
    currentEntry = {};
    currentDayMeta = { employeeName: Employee.get(), salesReportLink: "", paymentsReportLink: "" };
    renderEntryView();
    document.getElementById("saveStatus").textContent = "اختر الفرع أولاً";
    return;
  }

  document.getElementById("entryView").innerHTML = '<div class="loader">جاري التحميل…</div>';
  currentEntry = {};
  currentDayMeta = { employeeName: Employee.get(), salesReportLink: "", paymentsReportLink: "" };

  const cacheKey = "day:" + dateStr + ":" + currentBranch;
  const dayData = await Sync.get("getDay", { date: dateStr, branch: currentBranch }, cacheKey, (val) => applyDayData(val));
  applyDayData(dayData);

  historicalAvg = await loadHistoricalAverages(dateStr, currentBranch);
  renderEntryView();

  const hasData = Object.keys(currentEntry).length > 0;
  document.getElementById("saveStatus").textContent = hasData
    ? "تم تحميل بيانات محفوظة لهذا اليوم لهذا الفرع — عدّل واحفظ لو احتجت"
    : "لسا ما تحفظ شي لهذا اليوم لهذا الفرع";
}

function applyDayData(val) {
  if (!val) return;
  if (val.meta) currentDayMeta = { ...currentDayMeta, ...val.meta };
  if (val.items && val.items.length) {
    const map = {};
    val.items.forEach(it => { map[it.itemId] = { received: it.received, returned: it.returned, notes: it.notes, cookName: it.cookName, confirmed: it.confirmed === true || it.confirmed === "TRUE" }; });
    currentEntry = map;
  }
}

// حفظ فوري (بدون انتظار ضغطة زر) — كل قيمة (استلام صباحاً، إرجاع بعد الظهر، أي حقل) تنحفظ لحالها أول ما تتغير
function saveEntryNow(showStatus) {
  if (!currentBranch) {
    document.getElementById("saveStatus").textContent = "⚠ ما تحفظ — اختر الفرع أولاً";
    if (showStatus) showToast("اختر الفرع أولاً");
    return;
  }
  const employeeName = document.getElementById("employeeSelect").value;
  if (!employeeName) {
    document.getElementById("saveStatus").textContent = "⚠ ما تحفظ — اختر اسم الموظف أولاً";
    if (showStatus) showToast("اختر اسم الموظف قبل الحفظ");
    return;
  }
  Employee.set(employeeName);
  const salesReportLink = document.getElementById("salesLink").value.trim();
  const paymentsReportLink = document.getElementById("paymentsLink").value.trim();

  const items = Items.current
    .filter(it => currentEntry[it.id] && (currentEntry[it.id].received !== "" || currentEntry[it.id].returned !== "" || currentEntry[it.id].notes || currentEntry[it.id].confirmed))
    .map(it => ({
      itemId: it.id, itemName: it.name, unit: it.unit,
      confirmed: !!currentEntry[it.id].confirmed,
      received: currentEntry[it.id].received, returned: currentEntry[it.id].returned,
      cookName: currentEntry[it.id].cookName || "", notes: currentEntry[it.id].notes || ""
    }));

  const payload = { date: currentEntryDate, branch: currentBranch, employeeName, salesReportLink, paymentsReportLink, items };
  Sync.enqueue("saveDay:" + currentEntryDate + ":" + currentBranch, "saveDay", payload);
  Sync.cacheSet("day:" + currentEntryDate + ":" + currentBranch, { date: currentEntryDate, branch: currentBranch, meta: { employeeName, salesReportLink, paymentsReportLink }, items });
  document.getElementById("saveStatus").textContent = "✅ محفوظ — بتتزامن " + new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
  if (showStatus) showToast("تم حفظ بيانات اليوم");
}

let autoSaveTimer = null;
function scheduleAutoSave() {
  document.getElementById("saveStatus").textContent = "جاري الحفظ...";
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => saveEntryNow(false), 900);
}

function initEntryTab() {
  const dateInput = document.getElementById("dateInput");
  dateInput.value = currentEntryDate;
  dateInput.addEventListener("change", (e) => {
    currentEntryDate = e.target.value;
    loadEntryDay(currentEntryDate);
  });

  document.getElementById("saveBtn").addEventListener("click", () => saveEntryNow(true));

  loadEntryDay(currentEntryDate);
}
