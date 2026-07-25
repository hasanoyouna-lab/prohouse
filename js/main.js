// ==================== التنقل بين التابات + الإقلاع ====================

function setActiveTab(tab) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));

  document.getElementById("entryView").classList.toggle("hidden", tab !== "entry");
  document.getElementById("tomorrowView").classList.toggle("hidden", tab !== "tomorrow");
  document.getElementById("reportContainer").classList.toggle("hidden", tab !== "report");
  document.getElementById("itemsView").classList.toggle("hidden", tab !== "items");
  document.getElementById("settingsView").classList.toggle("hidden", tab !== "settings");

  document.getElementById("entryDateBar").classList.toggle("hidden", tab !== "entry");
  document.getElementById("tomorrowDateBar").classList.toggle("hidden", tab !== "tomorrow");

  document.getElementById("saveBarEntry").classList.toggle("hidden", tab !== "entry");
  document.getElementById("saveBarTomorrow").classList.toggle("hidden", tab !== "tomorrow");

  if (tab === "items") { Items.load().then(renderItemsAdminView); }
  if (tab === "settings") { loadSettings().then(renderSettingsView); }
}

document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => setActiveTab(btn.dataset.tab));
});

// ---- شارة حالة المزامنة ----
function updateSyncBadge({ pending }) {
  const el = document.getElementById("syncBadge");
  if (!API_URL) {
    el.textContent = "⚙ لسا ما انربط الباك اند";
    el.classList.remove("ok");
    return;
  }
  if (pending > 0) {
    el.textContent = `🔄 ${pending} بانتظار المزامنة`;
    el.classList.remove("ok");
  } else {
    el.textContent = "✅ كل شي متزامن";
    el.classList.add("ok");
  }
}
Sync.onStatusChange(updateSyncBadge);
document.getElementById("syncBadge").addEventListener("click", () => Sync.flushQueue());

// ---- بانر أوفلاين ----
function updateOfflineBanner() {
  document.getElementById("offlineBanner").classList.toggle("hidden", navigator.onLine);
}
window.addEventListener("online", updateOfflineBanner);
window.addEventListener("offline", updateOfflineBanner);

// ---- تسجيل Service Worker (يخلي التطبيق نفسه يفتح بدون إنترنت) ----
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW register failed:", e));
}

// ---- الإقلاع ----
updateOfflineBanner();
updateSyncBadge({ pending: Sync.getQueue().length });
loadSettings();
Sync.get("getEmployees", {}, "employees");
initEntryTab();
initTomorrowTab();
initReportTab();
