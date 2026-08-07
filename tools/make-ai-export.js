// ==================== تحضير نسخة بيانات آمنة للرفع على ذكاء اصطناعي خارجي ====================
//
// النسخة الاحتياطية الكاملة (زر "⬇ تصدير نسخة احتياطية" بشاشة الإعدادات) بتحتوي على
// بصمات الأرقام السرية للموظفين وتوكن التكامل وتوكن الواتساب. رفعها كما هي لأي خدمة
// خارجية بيسرّب مفاتيح بتمنح صلاحية كتابة على النظام.
//
// هالسكربت بيقرأ ملف النسخة الاحتياطية وبيطلع نسخة نظيفة صالحة للتحليل:
//   • بيشيل كل بصمات الأرقام السرية والتوكنات
//   • بيشيل الجلسات بالكامل
//   • (اختياري) بيستبدل أسماء الموظفين برموز
//
// الاستخدام:
//   node tools/make-ai-export.js prohouse-backup-2026-08-07.json
//   node tools/make-ai-export.js prohouse-backup-2026-08-07.json --anonymize

const fs = require("fs");
const path = require("path");

const SECRET_SETTING_KEYS = ["integrationToken", "whatsappToken", "whatsappInstanceId"];

const inputPath = process.argv[2];
const anonymize = process.argv.includes("--anonymize");

if (!inputPath) {
  console.error("الاستخدام: node tools/make-ai-export.js <ملف-النسخة-الاحتياطية.json> [--anonymize]");
  process.exit(1);
}
if (!fs.existsSync(inputPath)) {
  console.error("ما لقيت الملف: " + inputPath);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const removed = [];

// ---- الموظفون: نشيل البصمة دايماً، والاسم لو طُلب الإخفاء ----
const nameMap = {};
if (Array.isArray(data.employees)) {
  data.employees = data.employees.map((e, i) => {
    const clean = { ...e };
    delete clean.pin;
    if (anonymize) {
      const alias = "موظف-" + (i + 1);
      nameMap[e.name] = alias;
      clean.name = alias;
    }
    return clean;
  });
  removed.push("بصمات الأرقام السرية (" + data.employees.length + " موظف)");
}

// أسماء الموظفين مكرّرة بجداول تانية — لازم تتبدّل بنفس الرمز وإلا الإخفاء بلا معنى
if (anonymize) {
  ["dayMeta", "tomorrowOrders", "juiceCounts"].forEach(t => {
    if (!Array.isArray(data[t])) return;
    data[t] = data[t].map(r => (r.employeeName && nameMap[r.employeeName])
      ? { ...r, employeeName: nameMap[r.employeeName] }
      : r);
  });
  removed.push("أسماء الموظفين مستبدلة برموز");
}

// ---- الإعدادات: نشيل المفاتيح السرية ----
if (Array.isArray(data.settings)) {
  const before = data.settings.length;
  data.settings = data.settings.filter(s => !SECRET_SETTING_KEYS.includes(s.key));
  const dropped = before - data.settings.length;
  if (dropped) removed.push(dropped + " مفتاح سري من الإعدادات");
}

// ---- الجلسات: ما إلها أي قيمة تحليلية وكلها توكنات ----
if (data.sessions) { delete data.sessions; removed.push("جدول الجلسات"); }

// ---- فحص أخير: أي حقل اسمه يوحي بسر لسا موجود؟ ----
const suspicious = [];
JSON.stringify(data, (k, v) => {
  if (/pin|token|secret|password|apikey/i.test(k) && v) suspicious.push(k);
  return v;
});

const outPath = path.join(
  path.dirname(inputPath),
  path.basename(inputPath, ".json") + (anonymize ? "-ai-anon.json" : "-ai.json")
);
fs.writeFileSync(outPath, JSON.stringify(data, null, 2), "utf8");

console.log("✅ تم إنشاء نسخة آمنة:\n   " + outPath + "\n");
console.log("انشال منها:");
removed.forEach(r => console.log("   • " + r));

if (suspicious.length) {
  console.log("\n⚠️ لسا في حقول اسمها يوحي بسر — راجعها قبل الرفع:");
  [...new Set(suspicious)].forEach(k => console.log("   • " + k));
  process.exitCode = 2;
} else {
  console.log("\n✅ ما بقي أي حقل يوحي بسر. النسخة جاهزة للرفع.");
}

const counts = Object.keys(data).filter(k => Array.isArray(data[k]));
console.log("\nمحتوى النسخة:");
counts.forEach(k => console.log(`   ${String(data[k].length).padStart(6)} صف — ${k}`));
