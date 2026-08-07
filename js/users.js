// ==================== وحدة إدارة المستخدمين والصلاحيات (Users & Access Control Module) ====================

const ROLE_LABELS = {
  owner: "مالك للنظام (Full Access)",
  admin: "مدير عام تشغيلي (Operations Admin)",
  manager: "مدير فرع (Branch Manager)",
  chef: "شيف مطبخ (Kitchen Chef)",
  employee: "موظف فرع (Branch Staff)",
  viewer: "مراقب وقارئ (Read-Only Viewer)"
};

let usersListState = [];

async function loadUsersData() {
  const data = await Sync.get("getEmployees", {}, "employees");
  if (data && Array.isArray(data) && data.length > 0) {
    usersListState = data;
  } else {
    // قائمة الموظفين الافتراضية
    usersListState = typeof EMPLOYEES_FALLBACK !== "undefined" ? EMPLOYEES_FALLBACK : [
      { pin: "1111", name: "صاحب المطعم (المالك)", role: "owner", branches: "" },
      { pin: "2222", name: "الشيف الرئيسي", role: "chef", branches: "" },
      { pin: "3333", name: "مدير فرع الروضة", role: "manager", branches: "الروضة" },
      { pin: "4444", name: "موظف الشاطئ", role: "employee", branches: "الشاطئ" },
      { pin: "5555", name: "موظف عبداللطيف جميل", role: "employee", branches: "عبداللطيف جميل" }
    ];
  }
}

async function renderUsersView() {
  const view = document.getElementById("usersView");
  if (!view) return;

  view.innerHTML = '<div class="loader">جاري تحميل قائمة المستخدمين والصلاحيات…</div>';
  await loadUsersData();

  const allBranches = branchList();

  let html = `
    <div class="users-header-panel">
      <div class="users-title-row">
        <div>
          <h2>👥 إدارة المستخدمين وصلاحيات الأدوار</h2>
          <div class="sub-text">التحكم في أدوار موظفي الفروع والرقم السري والصلاحيات التشغيلية</div>
        </div>
      </div>

      <div class="users-roster-card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <h3>📋 قائمة حسابات موظفي برو هاوس</h3>
          <button class="btn gold" onclick="openAddUserModal()">➕ إضافة موظف جديد</button>
        </div>

        <div class="order-table-wrap">
          <table class="order-table">
            <thead>
              <tr>
                <th>اسم الموظف</th>
                <th>الدور والصلاحية</th>
                <th>الرمز السري PIN</th>
                <th>الفروع المصرحة</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              ${usersListState.map((u, idx) => `
                <tr>
                  <td><strong>${u.name}</strong></td>
                  <td><span class="badge ${u.role === 'owner' ? 'ok' : (u.role === 'chef' ? 'warn' : 'neutral')}">${ROLE_LABELS[u.role] || u.role}</span></td>
                  <td><code>${u.pin}</code></td>
                  <td>${u.branches ? u.branches : 'كل الفروع'}</td>
                  <td>
                    <button class="btn primary" style="padding:4px 8px;font-size:11px;" onclick="editUserRole(${idx})">تعديل</button>
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  view.innerHTML = html;
}

function openAddUserModal() {
  showToast("ℹ️ يمكنك إضافة موظف جديد وتخصيص رمزه السري وفروعه المسموحة.");
}

function editUserRole(idx) {
  const u = usersListState[idx];
  if (!u) return;
  const newPin = prompt(`تعديل الرمز السري للموظف (${u.name}):`, u.pin);
  if (newPin && newPin.trim()) {
    u.pin = newPin.trim();
    showToast("✓ تم تحديث الرمز السري بنجاح!");
    renderUsersView();
  }
}
