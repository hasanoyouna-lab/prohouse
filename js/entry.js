// ==================== شاشة إدخال اليوم (استلام / إرجاع) ====================

const SHORTAGE_THRESHOLD_DEFAULT = -0.20;
const SURPLUS_THRESHOLD_DEFAULT  = 0.25;
const RETURN_THRESHOLD_DEFAULT   = 0.30;

// الوجبة عند برو هاوس ~150 جرام — نحسب عدد الوجبات للأصناف اللي بتتوزن (دجاج/لحم/بحري) فقط
const MEAL_WEIGHT_G = 150;
const MEAL_CATEGORIES = ["دجاج", "لحم", "بحري", "ساندويتشات"];
function isMealCategory(cat) { return MEAL_CATEGORIES.includes(cat); }
function mealsCount(grams) {
  const n = Number(grams);
  if (grams === "" || grams === null || grams === undefined || isNaN(n)) return "";
  return (n / MEAL_WEIGHT_G).toFixed(1);
}

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
let requestedQty = {};   // itemId -> الكمية المطلوبة (من طلبية الغد يلي انحطت أمس لهاليوم)
let currentBranch = "";

const Branch = {
  get() { return localStorage.getItem("ph_branch") || ""; },
  set(name) { localStorage.setItem("ph_branch", name); }
};

function branchList() {
  const raw = (typeof currentSettings !== "undefined" && currentSettings.branches) || DEFAULT_BRANCHES_FALLBACK;
  return raw.split(",").map(s => s.trim()).filter(Boolean);
}

// الفروع المسموحة للمستخدم المسجّل دخول (مالك/شيف بيشوفوا الكل، الباقي بس فروعهم)
function allowedBranchList() {
  const all = branchList();
  if (Auth.canSeeAllBranches()) return all;
  const mine = Auth.branches();
  return all.filter(b => mine.includes(b));
}

function branchOptionsHtml(selected) {
  const current = selected || Branch.get();
  return `<option value="">اختر الفرع</option>` + allowedBranchList().map(b =>
    `<option value="${b}" ${b === current ? "selected" : ""}>${b}</option>`
  ).join("");
}

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}

// الكمية المطلوبة (من طلبية الغد يلي انحطت أمس مستهدفة هالتاريخ + هالفرع بالظبط)
async function loadRequestedQty(date, branch) {
  const data = await Sync.get("getTomorrowOrder", { date, branch }, "tomorrow:" + date + ":" + branch);
  const map = {};
  (data || []).forEach(it => { map[it.itemId] = it.qty; });
  return map;
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

let categoryCollapsed = {}; // فئة -> مطوية أو لا (افتراضياً كل الفئات مفتوحة، متل ورقة كاملة)
let currentEntryGroups = []; // [{category, items}] — آخر تجميع اترسم، نعتمد عليه بالتحديثات الجزئية بدون إعادة رسم كامل
let currentVisibleItems = [];

function isItemConfirmed(id) { return !!(currentEntry[id] && currentEntry[id].confirmed); }
function isItemWarnEmpty(id) {
  const e = currentEntry[id];
  return !!(e && e.confirmed && (e.received === "" || e.received === null || e.received === undefined));
}

function renderEntryView() {
  const view = document.getElementById("entryView");
  if (!view) return;
  view.innerHTML = "";

  const myBranches = allowedBranchList();
  const branchLocked = myBranches.length <= 1;

  const metaCard = document.createElement("div");
  metaCard.className = "item-card";
  metaCard.innerHTML = `
    <div class="inputs-row">
      <div class="field">
        <label>الموظف</label>
        <div class="readonly-field">${Auth.getEmployee() ? Auth.getEmployee().name : ""}</div>
      </div>
      <div class="field">
        <label>الفرع</label>
        ${branchLocked
          ? `<div class="readonly-field">${myBranches[0] || "لا يوجد فرع مرتبط بحسابك"}</div>`
          : `<select id="branchSelect">${branchOptionsHtml(currentBranch)}</select>`}
      </div>
    </div>
    ${Auth.isViewOnlyEntry() ? '<div class="badges"><span class="badge neutral">👁 عرض فقط — الشيف ما بيعدّل هون</span></div>' : ""}
  `;
  view.appendChild(metaCard);
  if (!branchLocked) {
    document.getElementById("branchSelect").addEventListener("change", (e) => {
      currentBranch = e.target.value;
      Branch.set(currentBranch);
      loadEntryDay(currentEntryDate);
    });
  }

  // فلترة الأصناف حسب الفرع — فقط بشاشة الاستلام (طلبية الغد بتضل تعرض كل الأصناف)
  const visibleItems = Items.current.filter(item => {
    const list = (item.branches || "").split(",").map(s => s.trim()).filter(Boolean);
    return list.length === 0 || list.includes(currentBranch);
  });

  if (!visibleItems.length) {
    view.insertAdjacentHTML("beforeend", '<div class="empty-state">لا يوجد أصناف مفعّلة لهذا الفرع. راجع "إدارة الأصناف" وحدد الفروع لكل صنف، أو تأكد إن الباك اند مربوط (js/config.js).</div>');
    return;
  }

  // شريط تقدّم عام فوق كل شي
  const progressWrap = document.createElement("div");
  progressWrap.className = "progress-bar-wrap";
  progressWrap.id = "entryProgressWrap";
  view.appendChild(progressWrap);

  const ro = Auth.isViewOnlyEntry() ? "disabled" : "";

  // تجميع الأصناف حسب الفئة بنفس ترتيبها القادم من السيرفر
  const groups = [];
  visibleItems.forEach(item => {
    const last = groups[groups.length - 1];
    if (last && last.category === item.category) last.items.push(item);
    else groups.push({ category: item.category, items: [item] });
  });

  groups.forEach(group => {
    const section = document.createElement("div");
    section.className = "category-section";
    section.dataset.cat = group.category;
    if (categoryCollapsed[group.category]) section.classList.add("collapsed");

    const header = document.createElement("div");
    header.className = "category-header";
    header.innerHTML = `
      <span class="cat-label">${group.category}</span>
      <span style="display:flex;align-items:center;">
        <span class="cat-count" id="catcount-${cssId(group.category)}"></span>
        <span class="chevron">▾</span>
      </span>
    `;
    header.addEventListener("click", () => {
      categoryCollapsed[group.category] = !categoryCollapsed[group.category];
      section.classList.toggle("collapsed", !!categoryCollapsed[group.category]);
    });
    section.appendChild(header);

    const body = document.createElement("div");
    body.className = "category-body";
    const inner = document.createElement("div");
    body.appendChild(inner);
    section.appendChild(body);

    group.items.forEach(item => {
      const entry = currentEntry[item.id] || { received: "", returned: "", notes: "", cookName: "", confirmed: false };
      const card = document.createElement("div");
      card.className = "item-card";
      card.id = "card-" + item.id;
      card.innerHTML = `
        <div class="item-name" style="display:flex;align-items:center;justify-content:space-between;">
          <span>${item.name} <span class="item-unit">(${item.unit})</span></span>
          <label style="display:flex;align-items:center;gap:5px;font-size:12.5px;font-weight:700;cursor:pointer;">
            <input type="checkbox" data-id="${item.id}" data-field="confirmed" ${entry.confirmed ? "checked" : ""} style="width:20px;height:20px;" ${ro}>
            تم الاستلام
          </label>
        </div>
        ${item.hasCustomName ? `
          <div class="cookname-row">
            <input type="text" placeholder="اسم الطبخة (مطلوب)" data-id="${item.id}" data-field="cookName" value="${entry.cookName || ""}" ${ro}>
          </div>` : ""}
        ${requestedQty[item.id] !== undefined && requestedQty[item.id] !== "" ? `
          <div class="badges" style="margin-top:0;">
            <span class="badge neutral">📦 مطلوب: ${requestedQty[item.id]} ${item.unit}</span>
          </div>` : ""}
        <div class="inputs-row">
          <div class="field">
            <label>الكمية المستلمة (جم)</label>
            <input type="number" inputmode="decimal" data-id="${item.id}" data-field="received" value="${entry.received}" ${ro}>
          </div>
          <div class="field">
            <label>الكمية المرتجعة (جم)</label>
            <input type="number" inputmode="decimal" data-id="${item.id}" data-field="returned" value="${entry.returned}" ${ro}>
          </div>
        </div>
        ${isMealCategory(item.category) ? `
          <div class="badges" style="margin-top:0;">
            <span class="badge neutral" id="meals-${item.id}">🍽 عدد الوجبات: ${mealsCount(entry.received) || "—"}</span>
          </div>` : ""}
        <div class="notes-row">
          <input type="text" placeholder="ملاحظة (اختياري)" data-id="${item.id}" data-field="notes" value="${entry.notes || ""}" ${ro}>
        </div>
        <div class="badges" id="badges-${item.id}"></div>
      `;
      if (isItemWarnEmpty(item.id)) card.classList.add("warn-empty");
      inner.appendChild(card);
    });

    view.appendChild(section);
  });

  if (Auth.canManageItems() && currentBranch) {
    const quickAdd = document.createElement("div");
    quickAdd.className = "item-card";
    quickAdd.id = "quickAddCard";
    const cats = [...new Set(Items.current.map(it => it.category).filter(Boolean))].sort((a, b) => categoryRank(a) - categoryRank(b));
    quickAdd.innerHTML = `
      <button type="button" class="btn" id="quickAddToggle">+ إضافة صنف استلمته خارج القائمة</button>
      <div id="quickAddForm" class="hidden" style="margin-top:10px;">
        <div class="field" id="quickAddCatGroup"><label>التصنيف</label>${categorySelectHtml(cats, "")}</div>
        <div class="field"><label>اسم الصنف</label><input type="text" id="quickAddName"></div>
        <div class="field"><label>الوحدة</label><input type="text" id="quickAddUnit" placeholder="مثال: كغم"></div>
        <button class="btn gold" id="quickAddSaveBtn">إضافة للقائمة</button>
      </div>
    `;
    view.appendChild(quickAdd);
    wireCategoryGroup(document.getElementById("quickAddCatGroup"));
    document.getElementById("quickAddToggle").addEventListener("click", () => {
      document.getElementById("quickAddForm").classList.toggle("hidden");
    });
    document.getElementById("quickAddSaveBtn").addEventListener("click", () => {
      const category = categoryValue(document.getElementById("quickAddCatGroup"));
      const name = document.getElementById("quickAddName").value.trim();
      const unit = document.getElementById("quickAddUnit").value.trim();
      if (!category || !name) { showToast("لازم تعبي التصنيف واسم الصنف"); return; }
      Items.save({ category, name, unit, hasCustomName: false, branches: currentBranch, sortOrder: Items.current.length + 1 });
      showToast("انضاف الصنف للقائمة");
      renderEntryView();
    });
  }

  view.querySelectorAll("input[data-field]").forEach(inp => {
    const evt = inp.type === "checkbox" ? "change" : "input";
    inp.addEventListener(evt, onFieldChange);
  });

  visibleItems.forEach(item => updateBadges(item.id));
  currentEntryGroups = groups;
  currentVisibleItems = visibleItems;
  updateCategoryCounts(groups);
  updateProgressBar(visibleItems);
}

function cssId(str) { return str.replace(/[^a-zA-Z0-9_؀-ۿ]/g, "_"); }

function updateCategoryCounts(groups) {
  groups.forEach(group => {
    const el = document.getElementById("catcount-" + cssId(group.category));
    if (!el) return;
    const confirmed = group.items.filter(it => isItemConfirmed(it.id)).length;
    el.textContent = `${confirmed}/${group.items.length}`;
  });
}

function updateProgressBar(visibleItems) {
  const wrap = document.getElementById("entryProgressWrap");
  if (!wrap) return;
  const total = visibleItems.length;
  const confirmed = visibleItems.filter(it => isItemConfirmed(it.id)).length;
  const pct = total > 0 ? Math.round((confirmed / total) * 100) : 0;
  wrap.innerHTML = `
    <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
    <div class="progress-bar-label">${confirmed} من ${total} صنف تم استلامه (${pct}%)</div>
  `;
}

function onFieldChange(e) {
  const id = e.target.dataset.id;
  const field = e.target.dataset.field;
  if (!currentEntry[id]) currentEntry[id] = { received: "", returned: "", notes: "", cookName: "", confirmed: false };
  currentEntry[id][field] = e.target.type === "checkbox" ? e.target.checked : e.target.value;
  updateBadges(id);

  if (field === "received") {
    const mealsEl = document.getElementById("meals-" + id);
    if (mealsEl) mealsEl.textContent = "🍽 عدد الوجبات: " + (mealsCount(currentEntry[id].received) || "—");
  }

  const card = document.getElementById("card-" + id);
  if (card) card.classList.toggle("warn-empty", isItemWarnEmpty(id));

  const group = currentEntryGroups.find(g => g.items.some(it => it.id === id));
  if (group) updateCategoryCounts([group]);
  updateProgressBar(currentVisibleItems);

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
  const myBranches = allowedBranchList();
  // مو مالك/شيف وعنده فرع واحد بس — نحدده تلقائياً، ما في داعي يختار
  if (myBranches.length === 1 && currentBranch !== myBranches[0]) currentBranch = myBranches[0];
  if (currentBranch && !Auth.canSeeAllBranches() && !myBranches.includes(currentBranch)) currentBranch = myBranches[0] || "";
  Branch.set(currentBranch);
  await Items.load();

  if (!currentBranch) {
    // ما فيه فرع محدد بعد — نطلب اختياره قبل ما نجيب/نعرض بيانات أي فرع
    currentEntry = {};
    currentDayMeta = { employeeName: (Auth.getEmployee() || {}).name || "", salesReportLink: "", paymentsReportLink: "" };
    renderEntryView();
    document.getElementById("saveStatus").textContent = "اختر الفرع أولاً";
    return;
  }

  document.getElementById("entryView").innerHTML = '<div class="loader">جاري التحميل…</div>';
  currentEntry = {};
  currentDayMeta = { employeeName: (Auth.getEmployee() || {}).name || "", salesReportLink: "", paymentsReportLink: "" };

  const cacheKey = "day:" + dateStr + ":" + currentBranch;
  const dayData = await Sync.get("getDay", { date: dateStr, branch: currentBranch }, cacheKey, (val) => applyDayData(val));
  applyDayData(dayData);

  historicalAvg = await loadHistoricalAverages(dateStr, currentBranch);
  requestedQty = await loadRequestedQty(dateStr, currentBranch);
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
  if (Auth.isViewOnlyEntry()) return; // الشيف عرض بس، ما بيحفظ

  // نحفظ دايماً حتى لو الفرع لسا ما انحدد (بيانات ناقصة أحسن من ولا بيانات) —
  // بس بنحط تنبيه بسيط يفكّر المستخدم يكمّله، بدون ما يمنع الحفظ.
  const employeeName = (Auth.getEmployee() || {}).name || "";
  const branch = currentBranch || "";

  const salesReportLink = document.getElementById("salesLink") ? document.getElementById("salesLink").value.trim() : "";
  const paymentsReportLink = document.getElementById("paymentsLink") ? document.getElementById("paymentsLink").value.trim() : "";

  const items = Items.current
    .filter(it => currentEntry[it.id] && (currentEntry[it.id].received !== "" || currentEntry[it.id].returned !== "" || currentEntry[it.id].notes || currentEntry[it.id].confirmed))
    .map(it => ({
      itemId: it.id, itemName: it.name, unit: it.unit,
      confirmed: !!currentEntry[it.id].confirmed,
      received: currentEntry[it.id].received, returned: currentEntry[it.id].returned,
      cookName: currentEntry[it.id].cookName || "", notes: currentEntry[it.id].notes || ""
    }));

  const payload = { date: currentEntryDate, branch, employeeName, salesReportLink, paymentsReportLink, items };
  Sync.enqueue("saveDay:" + currentEntryDate + ":" + branch, "saveDay", payload);
  Sync.cacheSet("day:" + currentEntryDate + ":" + branch, { date: currentEntryDate, branch, meta: { employeeName, salesReportLink, paymentsReportLink }, items });

  const missing = [];
  if (!branch) missing.push("الفرع");
  const savedAtText = new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
  document.getElementById("saveStatus").textContent = missing.length
    ? `✅ محفوظ (بدون ${missing.join(" و")} — كمّلهم أول ما تقدر) — ${savedAtText}`
    : "✅ محفوظ — بتتزامن " + savedAtText;
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
