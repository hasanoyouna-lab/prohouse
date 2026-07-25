// ==================== شاشة طلبية الغد ====================
// ملاحظة: هاي الشاشة تعرض كل الأصناف دايماً بغض النظر عن فلترة الفروع (الفلترة تخص شاشة الاستلام بس)

let currentTomorrowDate = addDaysStr(todayStr(), 1);
let currentTomorrowOrder = {}; // itemId -> {qty, notes}
let currentTomorrowBranch = "";

function renderTomorrowView() {
  const view = document.getElementById("tomorrowView");
  if (!view) return;
  view.innerHTML = "";

  const branchCard = document.createElement("div");
  branchCard.className = "item-card";
  branchCard.innerHTML = `
    <div class="inputs-row">
      <div class="field">
        <label>الفرع</label>
        <select id="tomorrowBranchSelect">${branchOptionsHtml(currentTomorrowBranch)}</select>
      </div>
    </div>
  `;
  view.appendChild(branchCard);
  document.getElementById("tomorrowBranchSelect").addEventListener("change", (e) => {
    currentTomorrowBranch = e.target.value;
    Branch.set(currentTomorrowBranch);
    loadTomorrowOrder(currentTomorrowDate);
  });

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
    const entry = currentTomorrowOrder[item.id] || { qty: "", notes: "" };
    const card = document.createElement("div");
    card.className = "item-card";
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
    view.appendChild(card);
  });

  view.querySelectorAll("input[data-field]").forEach(inp => {
    inp.addEventListener("input", (e) => {
      const id = e.target.dataset.id;
      const field = e.target.dataset.field;
      if (!currentTomorrowOrder[id]) currentTomorrowOrder[id] = { qty: "", notes: "" };
      currentTomorrowOrder[id][field] = e.target.value;
      document.getElementById("tomorrowStatus").textContent = "فيه تعديلات لسا ما تحفظت";
    });
  });
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

function initTomorrowTab() {
  const dateInput = document.getElementById("tomorrowDateInput");
  dateInput.value = currentTomorrowDate;
  dateInput.addEventListener("change", (e) => {
    currentTomorrowDate = e.target.value;
    loadTomorrowOrder(currentTomorrowDate);
  });

  document.getElementById("tomorrowSaveBtn").addEventListener("click", () => {
    if (!currentTomorrowBranch) { showToast("اختر الفرع أولاً"); return; }
    const employeeName = Employee.get();
    if (!employeeName) { showToast("اختر اسم الموظف من تاب طلبية اليوم أولاً"); return; }

    const items = Items.current
      .filter(it => currentTomorrowOrder[it.id] && currentTomorrowOrder[it.id].qty !== "")
      .map(it => ({ itemId: it.id, itemName: it.name, unit: it.unit, qty: currentTomorrowOrder[it.id].qty, notes: currentTomorrowOrder[it.id].notes || "" }));

    const payload = { date: currentTomorrowDate, branch: currentTomorrowBranch, employeeName, items };
    Sync.enqueue("saveTomorrowOrder:" + currentTomorrowDate + ":" + currentTomorrowBranch, "saveTomorrowOrder", payload);
    Sync.cacheSet("tomorrow:" + currentTomorrowDate + ":" + currentTomorrowBranch, items);
    document.getElementById("tomorrowStatus").textContent = "✅ محفوظ محلياً — بتتزامن " + new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
    showToast("تم حفظ طلبية الغد");
  });

  loadTomorrowOrder(currentTomorrowDate);
}
