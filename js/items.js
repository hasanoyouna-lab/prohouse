// ==================== إدارة الأصناف (قاعدة بيانات الأصناف + شاشة الإدارة) ====================

const Items = (() => {
  let current = [];
  let loadingPromise = null;

  function isActive(it) { return it.active !== false && it.active !== "FALSE"; }

  async function load() {
    if (loadingPromise) return loadingPromise; // يتفادى نداءات متزامنة مكررة (تنادى من إدخال اليوم/طلبية الغد/إدارة الأصناف بنفس الوقت)
    loadingPromise = (async () => {
      const data = await Sync.get("getItems", { all: "1" }, "items", (val) => {
        current = (val || []).filter(isActive);
        renderIfActive();
      });
      if (data) current = data.filter(isActive);
      renderIfActive();
      return current;
    })();
    try { return await loadingPromise; }
    finally { loadingPromise = null; }
  }

  function byId(id) { return current.find(it => it.id === id); }

  function newId() {
    return (crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now() + "-" + Math.random().toString(36).slice(2));
  }

  function save(item) {
    if (!item.id) item.id = newId();
    item.hasCustomName = !!item.hasCustomName;
    item.active = true;
    const idx = current.findIndex(it => it.id === item.id);
    if (idx >= 0) current[idx] = { ...current[idx], ...item };
    else current.push(item);
    Sync.cacheSet("items", current);
    Sync.enqueue("saveItem:" + item.id, "saveItem", item);
    return item;
  }

  function remove(id) {
    current = current.filter(it => it.id !== id);
    Sync.cacheSet("items", current);
    Sync.enqueue("deleteItem:" + id, "deleteItem", { id });
  }

  let renderIfActive = () => {};
  function setRenderer(fn) { renderIfActive = fn; }

  return { load, byId, save, remove, newId, get current() { return current; }, setRenderer };
})();

function renderItemsAdminView() {
  const view = document.getElementById("itemsView");
  if (!view || view.classList.contains("hidden")) return;

  const cats = [...new Set(Items.current.map(it => it.category))];

  view.innerHTML = `
    <div class="toolbar">
      <button class="btn primary" id="addItemBtn">+ إضافة صنف جديد</button>
    </div>
    <div id="itemAddForm" class="settings-card hidden">
      <h3>صنف جديد</h3>
      <div class="field"><label>التصنيف</label><input type="text" id="newCat" list="catList"></div>
      <datalist id="catList">${cats.map(c => `<option value="${c}">`).join("")}</datalist>
      <div class="field"><label>اسم الصنف</label><input type="text" id="newName"></div>
      <div class="field"><label>الوحدة</label><input type="text" id="newUnit"></div>
      <div class="field" style="display:flex;align-items:center;gap:8px;">
        <input type="checkbox" id="newCustomName" style="width:auto;">
        <label style="margin:0;" for="newCustomName">اسم الطبخة يُكتب يدوياً كل مرة (مثل دجاج الشيف/لحم الشيف)</label>
      </div>
      <button class="btn gold" id="saveNewItemBtn">حفظ الصنف</button>
    </div>
    <div id="itemsList"></div>
  `;

  document.getElementById("addItemBtn").addEventListener("click", () => {
    document.getElementById("itemAddForm").classList.toggle("hidden");
  });
  document.getElementById("saveNewItemBtn").addEventListener("click", () => {
    const category = document.getElementById("newCat").value.trim();
    const name = document.getElementById("newName").value.trim();
    const unit = document.getElementById("newUnit").value.trim();
    const hasCustomName = document.getElementById("newCustomName").checked;
    if (!category || !name) { showToast("لازم تعبي التصنيف واسم الصنف"); return; }
    Items.save({ category, name, unit, hasCustomName, sortOrder: Items.current.length + 1 });
    document.getElementById("itemAddForm").classList.add("hidden");
    renderItemsAdminView();
    showToast("انضاف الصنف");
  });

  const list = document.getElementById("itemsList");
  let lastCat = null;
  Items.current.slice().sort((a, b) => a.category.localeCompare(b.category)).forEach(item => {
    if (item.category !== lastCat) {
      list.insertAdjacentHTML("beforeend", `<div class="cat-title">${item.category}</div>`);
      lastCat = item.category;
    }
    const card = document.createElement("div");
    card.className = "item-card";
    card.innerHTML = `
      <div class="inputs-row">
        <div class="field"><label>الاسم</label><input type="text" data-f="name" value="${item.name}"></div>
        <div class="field"><label>الوحدة</label><input type="text" data-f="unit" value="${item.unit}"></div>
      </div>
      <div class="inputs-row" style="margin-top:8px;">
        <div class="field"><label>التصنيف</label><input type="text" data-f="category" value="${item.category}"></div>
      </div>
      <div class="badges">
        <label class="badge neutral" style="cursor:pointer;">
          <input type="checkbox" data-f="hasCustomName" ${item.hasCustomName ? "checked" : ""} style="width:auto;margin-left:4px;">
          اسم يدوي كل مرة
        </label>
      </div>
      <div class="toolbar" style="margin-top:10px;margin-bottom:0;">
        <button class="btn gold" data-act="save">حفظ التعديل</button>
        <button class="btn danger" data-act="del">حذف الصنف</button>
      </div>
    `;
    card.querySelector('[data-act="save"]').addEventListener("click", () => {
      const updated = {
        id: item.id,
        name: card.querySelector('[data-f="name"]').value.trim(),
        unit: card.querySelector('[data-f="unit"]').value.trim(),
        category: card.querySelector('[data-f="category"]').value.trim(),
        hasCustomName: card.querySelector('[data-f="hasCustomName"]').checked,
        sortOrder: item.sortOrder
      };
      Items.save(updated);
      showToast("تم حفظ التعديل");
      renderItemsAdminView();
    });
    card.querySelector('[data-act="del"]').addEventListener("click", () => {
      if (!confirm(`متأكد من حذف "${item.name}"؟`)) return;
      Items.remove(item.id);
      renderItemsAdminView();
      showToast("تم حذف الصنف");
    });
    list.appendChild(card);
  });

  if (!Items.current.length) {
    list.innerHTML = '<div class="empty-state">لا يوجد أصناف بعد.</div>';
  }
}

Items.setRenderer(renderItemsAdminView);
