// ==================== شاشة طلبية الغد (نفس بنية طلبية اليوم بالظبط) ====================
// ملاحظة: هاي الشاشة تعرض كل الأصناف دايماً بغض النظر عن فلترة الفروع (الفلترة تخص شاشة الاستلام بس)

let currentTomorrowDate = addDaysStr(todayStr(), 1);
let currentTomorrowOrder = {}; // itemId -> {qty, notes}
let currentTomorrowBranch = "";
let tomorrowCategoryCollapsed = {};
let currentTomorrowGroups = [];

function isTomorrowItemFilled(id) {
  const e = currentTomorrowOrder[id];
  return !!(e && e.qty !== "" && e.qty !== null && e.qty !== undefined);
}

function renderTomorrowView() {
  const view = document.getElementById("tomorrowView");
  if (!view) return;
  view.innerHTML = "";

  const metaCard = document.createElement("div");
  metaCard.className = "item-card";
  metaCard.innerHTML = `
    <div class="inputs-row">
      <div class="field">
        <label>الموظف</label>
        <select id="tomorrowEmployeeSelect">${employeeOptionsHtml()}</select>
      </div>
      <div class="field">
        <label>الفرع</label>
        <select id="tomorrowBranchSelect">${branchOptionsHtml(currentTomorrowBranch)}</select>
      </div>
    </div>
  `;
  view.appendChild(metaCard);
  document.getElementById("tomorrowEmployeeSelect").addEventListener("change", (e) => {
    Employee.set(e.target.value);
    scheduleTomorrowAutoSave();
  });
  document.getElementById("tomorrowBranchSelect").addEventListener("change", (e) => {
    currentTomorrowBranch = e.target.value;
    Branch.set(currentTomorrowBranch);
    loadTomorrowOrder(currentTomorrowDate);
  });

  if (!Items.current.length) {
    view.insertAdjacentHTML("beforeend", '<div class="empty-state">لا يوجد أصناف بعد. ضيف أصناف من تاب "إدارة الأصناف"، أو تأكد إن الباك اند مربوط (js/config.js).</div>');
    return;
  }

  const progressWrap = document.createElement("div");
  progressWrap.className = "progress-bar-wrap";
  progressWrap.id = "tomorrowProgressWrap";
  view.appendChild(progressWrap);

  const groups = [];
  Items.current.forEach(item => {
    const last = groups[groups.length - 1];
    if (last && last.category === item.category) last.items.push(item);
    else groups.push({ category: item.category, items: [item] });
  });

  groups.forEach(group => {
    const section = document.createElement("div");
    section.className = "category-section";
    section.dataset.cat = group.category;
    if (tomorrowCategoryCollapsed[group.category]) section.classList.add("collapsed");

    const header = document.createElement("div");
    header.className = "category-header";
    header.innerHTML = `
      <span class="cat-label">${group.category}</span>
      <span style="display:flex;align-items:center;">
        <span class="cat-count" id="tomcatcount-${cssId(group.category)}"></span>
        <span class="chevron">▾</span>
      </span>
    `;
    header.addEventListener("click", () => {
      tomorrowCategoryCollapsed[group.category] = !tomorrowCategoryCollapsed[group.category];
      section.classList.toggle("collapsed", !!tomorrowCategoryCollapsed[group.category]);
    });
    section.appendChild(header);

    const body = document.createElement("div");
    body.className = "category-body";
    const inner = document.createElement("div");
    body.appendChild(inner);
    section.appendChild(body);

    group.items.forEach(item => {
      const entry = currentTomorrowOrder[item.id] || { qty: "", notes: "" };
      const card = document.createElement("div");
      card.className = "item-card";
      card.id = "tomcard-" + item.id;
      card.innerHTML = `
        <div class="item-name">${item.name} <span class="item-unit">(${item.unit})</span></div>
        <div class="inputs-row">
          <div class="field">
            <label>الكمية المطلوبة</label>
            <input type="number" inputmode="decimal" data-id="${item.id}" data-field="qty" value="${entry.qty}">
          </div>
        </div>
        <div class="notes-row">
          <input type="text" placeholder="ملاحظة (اختياري)" data-id="${item.id}" data-field="notes" value="${entry.notes || ""}">
        </div>
      `;
      inner.appendChild(card);
    });

    view.appendChild(section);
  });

  view.querySelectorAll("input[data-field]").forEach(inp => {
    inp.addEventListener("input", onTomorrowFieldChange);
  });

  currentTomorrowGroups = groups;
  updateTomorrowCategoryCounts(groups);
  updateTomorrowProgressBar();
}

function updateTomorrowCategoryCounts(groups) {
  groups.forEach(group => {
    const el = document.getElementById("tomcatcount-" + cssId(group.category));
    if (!el) return;
    const filled = group.items.filter(it => isTomorrowItemFilled(it.id)).length;
    el.textContent = `${filled}/${group.items.length}`;
  });
}

function updateTomorrowProgressBar() {
  const wrap = document.getElementById("tomorrowProgressWrap");
  if (!wrap) return;
  const total = Items.current.length;
  const filled = Items.current.filter(it => isTomorrowItemFilled(it.id)).length;
  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
  wrap.innerHTML = `
    <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
    <div class="progress-bar-label">${filled} صنف طُلب من أصل ${total}</div>
  `;
}

function onTomorrowFieldChange(e) {
  const id = e.target.dataset.id;
  const field = e.target.dataset.field;
  if (!currentTomorrowOrder[id]) currentTomorrowOrder[id] = { qty: "", notes: "" };
  currentTomorrowOrder[id][field] = e.target.value;

  const group = currentTomorrowGroups.find(g => g.items.some(it => it.id === id));
  if (group) updateTomorrowCategoryCounts([group]);
  updateTomorrowProgressBar();

  scheduleTomorrowAutoSave();
}

async function loadTomorrowOrder(dateStr) {
  currentTomorrowBranch = Branch.get();
  await Items.load();

  if (!currentTomorrowBranch) {
    currentTomorrowOrder = {};
    renderTomorrowView();
    document.getElementById("tomorrowStatus").textContent = "اختر الفرع أولاً";
    return;
  }

  document.getElementById("tomorrowView").innerHTML = '<div class="loader">جاري التحميل…</div>';
  currentTomorrowOrder = {};

  const cacheKey = "tomorrow:" + dateStr + ":" + currentTomorrowBranch;
  const data = await Sync.get("getTomorrowOrder", { date: dateStr, branch: currentTomorrowBranch }, cacheKey, applyTomorrowData);
  applyTomorrowData(data);

  renderTomorrowView();
  const hasData = Object.keys(currentTomorrowOrder).length > 0;
  document.getElementById("tomorrowStatus").textContent = hasData
    ? "تم تحميل طلبية محفوظة لهذا اليوم لهذا الفرع"
    : "لسا ما فيه طلبية محفوظة لهذا اليوم لهذا الفرع";
}

function applyTomorrowData(list) {
  if (!list || !list.length) return;
  const map = {};
  list.forEach(it => { map[it.itemId] = { qty: it.qty, notes: it.notes }; });
  currentTomorrowOrder = map;
}

// حفظ فوري بدون انتظار ضغطة زر — نفس فلسفة شاشة طلبية اليوم
function saveTomorrowNow(showStatus) {
  const employeeName = document.getElementById("tomorrowEmployeeSelect") ? document.getElementById("tomorrowEmployeeSelect").value : Employee.get();
  const branch = currentTomorrowBranch || "";

  const items = Items.current
    .filter(it => currentTomorrowOrder[it.id] && currentTomorrowOrder[it.id].qty !== "")
    .map(it => ({ itemId: it.id, itemName: it.name, unit: it.unit, qty: currentTomorrowOrder[it.id].qty, notes: currentTomorrowOrder[it.id].notes || "" }));

  const payload = { date: currentTomorrowDate, branch, employeeName, items };
  Sync.enqueue("saveTomorrowOrder:" + currentTomorrowDate + ":" + branch, "saveTomorrowOrder", payload);
  Sync.cacheSet("tomorrow:" + currentTomorrowDate + ":" + branch, items);

  const missing = [];
  if (!branch) missing.push("الفرع");
  if (!employeeName) missing.push("الموظف");
  const savedAtText = new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
  document.getElementById("tomorrowStatus").textContent = missing.length
    ? `✅ محفوظ (بدون ${missing.join(" و")} — كمّلهم أول ما تقدر) — ${savedAtText}`
    : "✅ محفوظ — بتتزامن " + savedAtText;
  if (showStatus) showToast("تم حفظ طلبية الغد");
}

let tomorrowAutoSaveTimer = null;
function scheduleTomorrowAutoSave() {
  document.getElementById("tomorrowStatus").textContent = "جاري الحفظ...";
  clearTimeout(tomorrowAutoSaveTimer);
  tomorrowAutoSaveTimer = setTimeout(() => saveTomorrowNow(false), 900);
}

function initTomorrowTab() {
  const dateInput = document.getElementById("tomorrowDateInput");
  dateInput.value = currentTomorrowDate;
  dateInput.addEventListener("change", (e) => {
    currentTomorrowDate = e.target.value;
    loadTomorrowOrder(currentTomorrowDate);
  });

  document.getElementById("tomorrowSaveBtn").addEventListener("click", () => saveTomorrowNow(true));

  loadTomorrowOrder(currentTomorrowDate);
}
