// ==================== تسجيل الدخول والجلسة (رقم سري لكل موظف) ====================
// الجلسة محفوظة محلياً 30 يوم، وبتشتغل حتى بدون نت (offline-first) — التحقق الحقيقي
// من الصلاحيات دايماً عالسيرفر (Code.gs)، هون بس عشان نتحكم بشكل الواجهة.

const Auth = (() => {
  const TOKEN_KEY = "ph_token";
  const EMPLOYEE_KEY = "ph_employee_v2";

  function getToken() { return localStorage.getItem(TOKEN_KEY) || ""; }
  function getEmployee() {
    try { return JSON.parse(localStorage.getItem(EMPLOYEE_KEY)) || null; }
    catch (e) { return null; }
  }
  function isLoggedIn() { return !!(getToken() && getEmployee()); }

  function setSession(token, employee) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(EMPLOYEE_KEY, JSON.stringify(employee));
  }
  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EMPLOYEE_KEY);
  }
  let reloadingForAuth = false;
  function clearSessionAndReload() {
    if (reloadingForAuth) return;
    reloadingForAuth = true;
    clearSession();
    location.reload();
  }

  async function login(pin) {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "login", payload: { pin } })
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "فشل تسجيل الدخول");
    setSession(json.data.token, json.data.employee);
    return json.data.employee;
  }

  async function logout() {
    const token = getToken();
    clearSession();
    if (!API_URL || !token) return;
    try {
      await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "logout", token })
      });
    } catch (e) { /* أوفلاين — بلا فرق، الجلسة انمسحت محلياً أصلاً */ }
  }

  // بتتحقق من الجلسة عالسيرفر (مرة وحدة وقت الإقلاع) وبتحدّث بيانات الموظف محلياً
  // (مفيد لو الدور أو الفروع تغيّرت من المالك). لو فشل التحقق بسبب نت، بتكمل بالجلسة المحفوظة.
  async function verify() {
    if (!API_URL || !getToken()) return isLoggedIn();
    try {
      const qs = new URLSearchParams({ action: "me", token: getToken() }).toString();
      const res = await fetch(API_URL + "?" + qs);
      const json = await res.json();
      if (!json.ok) { clearSession(); return false; }
      setSession(getToken(), json.data);
      return true;
    } catch (e) {
      return isLoggedIn(); // ما في نت — نكمل بالجلسة المحفوظة محلياً
    }
  }

  function role() { const e = getEmployee(); return e ? e.role : null; }
  function branches() { const e = getEmployee(); return e ? (e.branches || []) : []; }
  function isOwner() { return role() === "owner"; }
  function canSeeAllBranches() { return role() === "owner" || role() === "chef"; }
  function canEditBranch(branch) { return canSeeAllBranches() || branches().includes(branch); }
  function isViewOnlyEntry() { return role() === "chef"; }
  function isViewOnlyTomorrow() { return role() === "chef"; }
  function canSeeReports() { return role() === "owner" || role() === "manager" || role() === "chef"; }
  function canManageItems() { return role() === "owner" || role() === "manager" || role() === "employee"; }
  function canManageSettings() { return role() === "owner"; }

  return {
    getToken, getEmployee, isLoggedIn, login, logout, verify, clearSessionAndReload,
    role, branches, isOwner, canSeeAllBranches, canEditBranch,
    isViewOnlyEntry, isViewOnlyTomorrow, canSeeReports, canManageItems, canManageSettings
  };
})();
