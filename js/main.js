// ==================== التنقل بين التابات + الإقلاع + تسجيل الدخول ====================

const TAB_ROLE_ACCESS = {
  dashboard: ["owner", "manager", "chef", "employee"],
  receiving: ["owner", "manager", "chef", "employee"],
  remaining: ["owner", "manager", "chef", "employee"],
  entry: ["owner", "manager", "chef", "employee"],
  tomorrow: ["owner", "manager", "chef", "employee"],
  juices: ["owner", "manager", "employee"],
  checklist: ["owner", "manager", "chef", "employee"],
  report: ["owner", "manager", "chef"],
  items: ["owner", "manager", "employee"],
  settings: ["owner"]
};

function tabAllowed(tab) {
  const role = Auth.role();
  return !!(role && TAB_ROLE_ACCESS[tab] && TAB_ROLE_ACCESS[tab].includes(role));
}

function openMobileSidebar() {
  const sidebar = document.getElementById("appSidebar");
  const backdrop = document.getElementById("sidebarBackdrop");
  if (sidebar) sidebar.classList.add("mobile-open");
  if (backdrop) backdrop.classList.add("active");
}

function closeMobileSidebar() {
  const sidebar = document.getElementById("appSidebar");
  const backdrop = document.getElementById("sidebarBackdrop");
  if (sidebar) sidebar.classList.remove("mobile-open");
  if (backdrop) backdrop.classList.remove("active");
}

function setActiveTab(tab) {
  if (!tabAllowed(tab)) tab = "dashboard";
  closeMobileSidebar();

  document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));

  const receivingView = document.getElementById("receivingView");
  const remainingView = document.getElementById("remainingView");
  if (receivingView) receivingView.classList.toggle("hidden", tab !== "receiving");
  if (remainingView) remainingView.classList.toggle("hidden", tab !== "remaining");

  document.getElementById("dashboardView").classList.toggle("hidden", tab !== "dashboard");
  document.getElementById("entryView").classList.toggle("hidden", tab !== "entry");
  document.getElementById("tomorrowView").classList.toggle("hidden", tab !== "tomorrow");
  document.getElementById("juicesView").classList.toggle("hidden", tab !== "juices");
  document.getElementById("checklistView").classList.toggle("hidden", tab !== "checklist");
  document.getElementById("reportContainer").classList.toggle("hidden", tab !== "report");
  document.getElementById("itemsView").classList.toggle("hidden", tab !== "items");
  document.getElementById("settingsView").classList.toggle("hidden", tab !== "settings");

  const recDateBar = document.getElementById("receivingDateBar");
  const remDateBar = document.getElementById("remainingDateBar");
  if (recDateBar) recDateBar.classList.toggle("hidden", tab !== "receiving");
  if (remDateBar) remDateBar.classList.toggle("hidden", tab !== "remaining");

  document.getElementById("entryDateBar").classList.toggle("hidden", tab !== "entry");
  document.getElementById("tomorrowDateBar").classList.toggle("hidden", tab !== "tomorrow");
  document.getElementById("juiceDateBar").classList.toggle("hidden", tab !== "juices");
  document.getElementById("checklistDateBar").classList.toggle("hidden", tab !== "checklist");

  const saveBarReceiving = document.getElementById("saveBarReceiving");
  const saveBarRemaining = document.getElementById("saveBarRemaining");
  if (saveBarReceiving) saveBarReceiving.classList.toggle("hidden", tab !== "receiving" || Auth.isViewOnlyEntry());
  if (saveBarRemaining) saveBarRemaining.classList.toggle("hidden", tab !== "remaining" || Auth.isViewOnlyEntry());

  document.getElementById("saveBarEntry").classList.toggle("hidden", tab !== "entry" || Auth.isViewOnlyEntry());
  document.getElementById("saveBarTomorrow").classList.toggle("hidden", tab !== "tomorrow" || Auth.isViewOnlyTomorrow());
  document.getElementById("saveBarJuices").classList.toggle("hidden", tab !== "juices" || Auth.isViewOnlyEntry());
  document.getElementById("saveBarChecklist").classList.toggle("hidden", tab !== "checklist" || Auth.isViewOnlyEntry());

  if (tab === "receiving") { loadReceivingData(currentReceivingDate, currentReceivingBranch); }
  if (tab === "remaining") { loadRemainingData(currentRemainingDate, currentRemainingBranch); }
  if (tab === "dashboard") { renderDashboard(); }
  if (tab === "checklist") { renderChecklistView(); }
  if (tab === "report") {
    loadReportLibs().then(() => {
      if (!document.getElementById("reportContainer").classList.contains("hidden")) redrawTrendChartIfReady();
    });
  }
  if (tab === "juices" && currentJuiceBranch !== Branch.get()) { loadJuiceDay(currentJuiceDate); }
  if (tab === "items") { Items.load().then(renderItemsAdminView); }
  if (tab === "settings") { Promise.all([loadSettings(), Items.load()]).then(renderSettingsView); }
}

document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => setActiveTab(btn.dataset.tab));
});

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("mobileToggleBtn")?.addEventListener("click", openMobileSidebar);
  document.getElementById("sidebarCloseBtn")?.addEventListener("click", closeMobileSidebar);
  document.getElementById("sidebarBackdrop")?.addEventListener("click", closeMobileSidebar);
});

// يخفي التابات الممنوعة حسب دور المستخدم المسجّل دخول
function applyRoleUiGating() {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.classList.toggle("hidden", !tabAllowed(btn.dataset.tab));
  });
  const emp = Auth.getEmployee();
  const roleLabel = { owner: "مالك", manager: "مدير فرع", chef: "شيف", employee: "موظف" };
  document.getElementById("userBarName").textContent = emp ? emp.name : "";
  document.getElementById("userBarRole").textContent = emp ? (roleLabel[emp.role] || emp.role) : "";
  document.getElementById("userBar").classList.remove("hidden");
}

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
    el.classList.add("pending");
  } else {
    el.textContent = "✅ كل شي متزامن";
    el.classList.add("ok");
    el.classList.remove("pending");
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

// ---- تسجيل Service Worker و Manifest (فقط عند النشر على سيرفر HTTP/HTTPS لتجنب أخطاء CORS عند الفتح المباشر) ----
if (location.protocol !== "file:") {
  const manifestLink = document.createElement("link");
  manifestLink.rel = "manifest";
  manifestLink.href = "manifest.json";
  document.head.appendChild(manifestLink);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW register failed:", e));
  }
}

// ---- تسجيل الدخول ----
function showLoginView() {
  document.getElementById("loginView").classList.remove("hidden");
  document.querySelector("header").classList.add("hidden");
  document.querySelector("main").classList.add("hidden");
}
function hideLoginView() {
  document.getElementById("loginView").classList.add("hidden");
  document.querySelector("header").classList.remove("hidden");
  document.querySelector("main").classList.remove("hidden");
}

function initChecklistTab() {
  const el = document.getElementById("checklistDateInput");
  if (el) {
    el.value = currentChecklistDate;
    el.addEventListener("change", (e) => {
      currentChecklistDate = e.target.value;
      renderChecklistView();
    });
  }
}

function initReceivingTab() {
  initReceivingModule();
  const dateEl = document.getElementById("receivingDateInput");
  if (dateEl) {
    dateEl.value = currentReceivingDate;
    dateEl.addEventListener("change", () => {
      currentReceivingDate = dateEl.value;
      loadReceivingData(currentReceivingDate, currentReceivingBranch);
    });
  }
}

function initRemainingTab() {
  initRemainingModule();
  const dateEl = document.getElementById("remainingDateInput");
  if (dateEl) {
    dateEl.value = currentRemainingDate;
    dateEl.addEventListener("change", () => {
      currentRemainingDate = dateEl.value;
      loadRemainingData(currentRemainingDate, currentRemainingBranch);
    });
  }
}

function startApp() {
  hideLoginView();
  applyRoleUiGating();
  updateOfflineBanner();
  updateSyncBadge({ pending: Sync.getQueue().length });
  loadSettings();
  initReceivingTab();
  initRemainingTab();
  initDashboardTab();
  initEntryTab();
  initTomorrowTab();
  if (tabAllowed("juices")) initJuicesTab();
  initChecklistTab();
  initReportTab();
  setActiveTab("dashboard");
}

async function doLoginSubmit() {
  const pin = document.getElementById("loginPinInput").value.trim();
  const errEl = document.getElementById("loginError");
  errEl.classList.add("hidden");
  if (!pin) return;
  const btn = document.getElementById("loginSubmitBtn");
  btn.disabled = true;
  try {
    await Auth.login(pin);
    startApp();
  } catch (e) {
    errEl.textContent = String(e).replace(/^(Error:\s*)+/, "");
    errEl.classList.remove("hidden");
  } finally {
    btn.disabled = false;
  }
}
document.getElementById("loginSubmitBtn").addEventListener("click", doLoginSubmit);
document.getElementById("loginPinInput").addEventListener("keydown", (e) => { if (e.key === "Enter") doLoginSubmit(); });

// ---- تغيير الرقم السري ----
function togglePinDialog(show) {
  document.getElementById("pinDialog").classList.toggle("hidden", !show);
  document.getElementById("pinError").classList.add("hidden");
  if (show) {
    ["pinCurrent", "pinNew", "pinConfirm"].forEach(id => { document.getElementById(id).value = ""; });
    document.getElementById("pinCurrent").focus();
  }
}
document.getElementById("changePinBtn").addEventListener("click", () => togglePinDialog(true));
document.getElementById("pinCancelBtn").addEventListener("click", () => togglePinDialog(false));

document.getElementById("pinSaveBtn").addEventListener("click", async () => {
  const currentPin = document.getElementById("pinCurrent").value.trim();
  const newPin = document.getElementById("pinNew").value.trim();
  const confirmPin = document.getElementById("pinConfirm").value.trim();
  const errEl = document.getElementById("pinError");
  const showErr = (msg) => { errEl.textContent = msg; errEl.classList.remove("hidden"); };

  if (!currentPin || !newPin) return showErr("عبّي كل الخانات");
  if (newPin !== confirmPin) return showErr("الرقم الجديد ما تطابق بالخانتين");
  if (!/^\d{4,8}$/.test(newPin)) return showErr("الرقم الجديد لازم يكون من ٤ لـ ٨ أرقام");

  const btn = document.getElementById("pinSaveBtn");
  btn.disabled = true;
  try {
    await Auth.changePin(currentPin, newPin);
    alert("تم تغيير رقمك. سجّل دخول بالرقم الجديد.");
    location.reload(); // الجلسات القديمة انلغت عالسيرفر — لازم دخول جديد
  } catch (e) {
    showErr(String(e).replace(/^(Error:\s*)+/, ""));
  } finally {
    btn.disabled = false;
  }
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  if (!confirm("تسجيل الخروج؟")) return;
  await Auth.logout();
  location.reload();
});

// ---- الإقلاع ----
(async function boot() {
  if (!Auth.isLoggedIn()) { showLoginView(); return; }
  await Auth.verify(); // يحدّث الدور/الفروع لو تغيّرت، وبيرجع لتسجيل الدخول لو الجلسة انتهت
  if (!Auth.isLoggedIn()) { showLoginView(); return; }
  startApp();
})();
