// ==================== الإعدادات (اسم الفرع/المطعم، الشعار، نسخ احتياطي/استعادة) ====================

let currentSettings = {};

async function loadSettings() {
  const data = await Sync.get("getSettings", {}, "settings", (val) => { currentSettings = val || {}; applyBrandingFromSettings(); });
  currentSettings = data || currentSettings;
  applyBrandingFromSettings();
  return currentSettings;
}

function applyBrandingFromSettings() {
  if (currentSettings.restaurantName) {
    document.querySelectorAll(".brand-name").forEach(el => el.textContent = currentSettings.restaurantName);
  }
  if (currentSettings.branchName) {
    document.querySelectorAll(".brand-branch").forEach(el => el.textContent = currentSettings.branchName);
  }
  if (currentSettings.logoUrl) {
    const img = document.getElementById("headerLogoImg");
    if (img) { img.src = currentSettings.logoUrl; img.classList.remove("hidden"); }
    const textLogo = document.getElementById("headerLogoText");
    if (textLogo) textLogo.classList.add("hidden");
  }
}

function renderSettingsView() {
  const view = document.getElementById("settingsView");
  if (!view) return;
  view.innerHTML = `
    <div class="settings-card">
      <h3>هوية المطعم</h3>
      <div class="field"><label>اسم النظام/المطعم</label><input type="text" id="setRestaurantName" value="${currentSettings.restaurantName || "Pro House"}"></div>
      <div class="field"><label>اسم الفرع</label><input type="text" id="setBranchName" value="${currentSettings.branchName || ""}"></div>
      <div class="field"><label>رابط صورة الشعار (اختياري)</label><input type="url" id="setLogoUrl" value="${currentSettings.logoUrl || ""}"></div>
      <button class="btn gold" id="saveBrandBtn">حفظ</button>
    </div>

    <div class="settings-card">
      <h3>أعتاب التنبيهات</h3>
      <div class="inputs-row">
        <div class="field"><label>نسبة النقص</label><input type="number" step="0.01" id="setShortage" value="${currentSettings.shortageThresholdPct ?? -0.20}"></div>
        <div class="field"><label>نسبة الزيادة</label><input type="number" step="0.01" id="setSurplus" value="${currentSettings.surplusThresholdPct ?? 0.25}"></div>
        <div class="field"><label>نسبة الإرجاع</label><input type="number" step="0.01" id="setReturn" value="${currentSettings.returnThresholdPct ?? 0.30}"></div>
      </div>
      <button class="btn gold" id="saveThresholdsBtn" style="margin-top:8px;">حفظ الأعتاب</button>
    </div>

    <div class="settings-card">
      <h3>إدارة الأصناف</h3>
      <button class="btn primary" id="gotoItemsBtn">فتح شاشة إدارة الأصناف</button>
    </div>

    <div class="settings-card">
      <h3>نسخ احتياطي / استعادة</h3>
      <div class="toolbar">
        <button class="btn" id="backupBtn">⬇ تصدير نسخة احتياطية</button>
        <label class="btn" style="cursor:pointer;">
          ⬆ استيراد نسخة احتياطية
          <input type="file" id="restoreFile" accept="application/json" style="display:none;">
        </label>
      </div>
      <div class="save-status" id="backupStatus"></div>
    </div>
  `;

  document.getElementById("saveBrandBtn").addEventListener("click", () => {
    const payload = {
      restaurantName: document.getElementById("setRestaurantName").value.trim(),
      branchName: document.getElementById("setBranchName").value.trim(),
      logoUrl: document.getElementById("setLogoUrl").value.trim()
    };
    currentSettings = { ...currentSettings, ...payload };
    Sync.cacheSet("settings", currentSettings);
    Sync.enqueue("saveSettings:brand", "saveSettings", payload);
    applyBrandingFromSettings();
    showToast("تم حفظ الهوية");
  });

  document.getElementById("saveThresholdsBtn").addEventListener("click", () => {
    const payload = {
      shortageThresholdPct: document.getElementById("setShortage").value,
      surplusThresholdPct: document.getElementById("setSurplus").value,
      returnThresholdPct: document.getElementById("setReturn").value
    };
    currentSettings = { ...currentSettings, ...payload };
    Sync.cacheSet("settings", currentSettings);
    Sync.enqueue("saveSettings:thresholds", "saveSettings", payload);
    showToast("تم حفظ الأعتاب");
  });

  document.getElementById("gotoItemsBtn").addEventListener("click", () => {
    document.querySelector('.tab-btn[data-tab="items"]').click();
  });

  document.getElementById("backupBtn").addEventListener("click", doBackup);
  document.getElementById("restoreFile").addEventListener("change", doRestore);
}

async function doBackup() {
  const status = document.getElementById("backupStatus");
  if (!API_URL) { status.textContent = "⚠ لسا ما انربط رابط الباك اند (API_URL)"; return; }
  status.textContent = "جاري التصدير…";
  try {
    const qs = new URLSearchParams({ action: "backupAll" }).toString();
    const res = await fetch(API_URL + "?" + qs);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error);
    const blob = new Blob([JSON.stringify(json.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `prohouse-backup-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    status.textContent = "✅ تم التصدير";
  } catch (e) {
    status.textContent = "⚠ فشل التصدير: " + e;
  }
}

async function doRestore(e) {
  const file = e.target.files[0];
  if (!file) return;
  const status = document.getElementById("backupStatus");
  if (!API_URL) { status.textContent = "⚠ لسا ما انربط رابط الباك اند (API_URL)"; return; }
  if (!confirm("استعادة النسخة الاحتياطية بتستبدل كل البيانات الحالية بالشيت. متأكد؟")) { e.target.value = ""; return; }
  status.textContent = "جاري الاستعادة…";
  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "restoreAll", payload })
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error);
    status.textContent = "✅ تمت الاستعادة — أعد فتح الصفحة";
    showToast("تمت الاستعادة بنجاح");
  } catch (err) {
    status.textContent = "⚠ فشلت الاستعادة: " + err;
  } finally {
    e.target.value = "";
  }
}
