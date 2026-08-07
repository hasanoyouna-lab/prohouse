// إعدادات الاتصال بالباك اند. الصق رابط /exec من Apps Script هون بعد النشر (راجع apps-script/SETUP.md).
const API_URL = "https://script.google.com/macros/s/AKfycbykhtn0VUleuPkNYAKutt6AFrpl-atN5dmruiRGTSkK8ejYZxzbsZ71AZyDQD_LMbe_/exec";

const APP_VERSION = "2.1.0";

// ---- دوال التاريخ المشتركة ----
// موجودة هون (بأول ملف بينحمّل) مو بـ entry.js عن قصد: عدة وحدات (الاستلام، المتبقي، الهدر)
// بتناديها بأول سطر فيها وقت التحميل، فلو كانت بملف بينحمّل بعدهم بتنهار الوحدات كلها
// بخطأ "todayStr is not defined" وبتطلع الشاشات فاضية. صار فعلاً وكلّف تشخيص.
function todayStr() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function addDaysStr(dateStr, delta) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

// قائمة افتراضية للفروع (تُستبدل بقيمة إعداد "branches" من شاشة الإعدادات إذا كانت محفوظة)
const DEFAULT_BRANCHES_FALLBACK = "الروضة,الشاطئ,عبداللطيف جميل";

// ترتيب افتراضي للتصنيفات (يُستبدل بقيمة إعداد "categoryOrder" من شاشة الإعدادات لو محفوظة — قابل للتعديل بالكامل من هناك)
const DEFAULT_CATEGORY_ORDER_FALLBACK = "دجاج,لحم,بحري,ساندويتشات,كارب,السلطات,الحلويات,فطور,معدات";
function categoryOrderList() {
  const raw = (typeof currentSettings !== "undefined" && currentSettings.categoryOrder) || DEFAULT_CATEGORY_ORDER_FALLBACK;
  return raw.split(",").map(s => s.trim()).filter(Boolean);
}
function categoryRank(cat) {
  const list = categoryOrderList();
  const i = list.indexOf(cat);
  return i === -1 ? list.length : i;
}
