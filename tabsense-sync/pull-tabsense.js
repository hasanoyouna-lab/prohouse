// ==================== سحب تلقائي لتقرير "المبيعات حسب التصنيف" من تابسنس ====================
// سكربت غير رسمي (مو API رسمي) — بيسجل دخول فعلي ويحاكي نقرات المستخدم.
// كلمة المرور تُقرأ من config.json المحلي فقط — هاد الملف ما بينرفع أبداً لأي مكان (مضاف لـ .gitignore).
//
// نقاط محتاجة تعديل لو أول تشغيل فشل (معلّمة CONFIG_ME تحت):
//   1. LOGIN_SELECTORS: أسماء حقول الإيميل/الباسورد/زر الدخول الفعلية بصفحة تابسنس.
//   2. DATE_RANGE: طريقة تعبئة خانة التاريخ (بعض الأنظمة بتحتاج نقر على تقويم منبثق بدل الكتابة المباشرة).
//   3. EXPORT_BUTTON: هل النقر عالأيقونة الحمراء بيصدّر PDF مباشرة، أو بيفتح قائمة فيها خيار CSV؟
//
// التشغيل: node pull-tabsense.js  (أو عبر Windows Task Scheduler يومياً — شوف README.md)

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.join(__dirname, "config.json");
if (!fs.existsSync(CONFIG_PATH)) {
  console.error("ما في ملف config.json — انسخ config.example.json وعبّي بياناتك فيه.");
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));

const LOGIN_URL = "https://app.tabsense.ai/prohouse/dashboard/login";
const CATEGORY_REPORT_URL = "https://app.tabsense.ai/prohouse/dashboard/reports/sales-by-category";
const PRODUCT_REPORT_URL = "https://app.tabsense.ai/prohouse/dashboard/reports/sales-by-product";
const DOWNLOAD_DIR = path.join(__dirname, "downloads");

// تصنيفات تابسنس اللي بتهمّنا بس (نفس الأصناف اللي عندنا "عدد الوجبات" لها)
const CATEGORY_MAP = {
  "أطباق الدجاج": "دجاج",
  "أطباق اللحم": "لحم",
  "أطباق المأكولات البحرية": "بحري"
};

// نصف الساندويتش بينسجل بالكاشير تحت منتج "أم علي" (تصنيفه بتابسنس "الحلويات" غلط) —
// نلقط كميته من تقرير "المبيعات حسب المنتج" ونحطه تحت تصنيف "فطور" عندنا.
const UMM_ALI_PRODUCT_NAME = "ام علي"; // بدون همزة متل ما طلع بالتصدير الفعلي
const UMM_ALI_TARGET_CATEGORY = "فطور";

function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return { display: `${mm}/${dd}/${yyyy}`, iso: `${yyyy}-${mm}-${dd}` };
}

// يفكّك ملف CSV تابسنس (فيه صفوف بيانات وصفية بالأعلى قبل صف العناوين الحقيقي)
function parseTabsenseCategoryCsv(csvText) {
  const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const headerIdx = lines.findIndex(l => l.includes("التصنيف") && l.includes("إجمالي الكمية"));
  if (headerIdx === -1) throw new Error("ما لقيت صف العناوين بالملف — شكل الملف تغيّر، لازم نعدّل الكود.");
  const headers = splitCsvLine(lines[headerIdx]);
  const qtyCol = headers.findIndex(h => h.includes("إجمالي الكمية"));
  const catCol = headers.findIndex(h => h.includes("التصنيف"));
  const rows = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (!cols[catCol]) continue;
    rows.push({ category: cols[catCol], qty: Number(cols[qtyCol]) || 0 });
  }
  return rows;
}
function splitCsvLine(line) {
  return line.split(",").map(c => c.replace(/^"|"$/g, "").trim());
}

// يفكّك ملف CSV "المبيعات حسب المنتج" ويرجع كمية منتج معيّن بالاسم (تطابق مرن بدون همزات)
function normalizeArabic(s) {
  return String(s || "").replace(/[أإآ]/g, "ا").trim();
}
function findProductQty(csvText, productName) {
  const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const headerIdx = lines.findIndex(l => l.includes("المنتج") && l.includes("الكمية"));
  if (headerIdx === -1) throw new Error("ما لقيت صف العناوين بملف المنتجات — شكل الملف تغيّر.");
  const headers = splitCsvLine(lines[headerIdx]);
  const nameCol = headers.findIndex(h => h === "المنتج");
  const qtyCol = headers.findIndex(h => h === "الكمية");
  const target = normalizeArabic(productName);
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (normalizeArabic(cols[nameCol]) === target) return Number(cols[qtyCol]) || 0;
  }
  return 0; // المنتج ما انباع هالفترة — صفر منطقي، مو خطأ
}

// خطوات مشتركة: يفتح تقرير، يحدد فترة أمس، يضغط تطبيق، وينزّل CSV
async function exportReportCsv(page, reportUrl, dateDisplay) {
  await page.goto(reportUrl, { waitUntil: "networkidle" });
  await page.locator("text=/\\d{2}\\/\\d{2}\\/\\d{4} - \\d{2}\\/\\d{2}\\/\\d{4}/").first().click().catch(() => {});
  await page.keyboard.type(`${dateDisplay} - ${dateDisplay}`).catch(() => {});
  await page.click('button:has-text("تطبيق")');
  await page.waitForTimeout(2000);

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    page.locator('[class*="export"], button:near(:text("تطبيق"))').first().click()
  ]);
  const downloadPath = path.join(DOWNLOAD_DIR, download.suggestedFilename() || "export.csv");
  await download.saveAs(downloadPath);
  if (!downloadPath.toLowerCase().endsWith(".csv")) {
    throw new Error(`الملف اللي انسحب من ${reportUrl} مو CSV (${downloadPath}).`);
  }
  return fs.readFileSync(downloadPath, "utf8");
}

async function run() {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  try {
    // ---- 1) تسجيل الدخول ----
    await page.goto(LOGIN_URL, { waitUntil: "networkidle" });

    // CONFIG_ME: عدّل هاي الـ selectors لو ما لقت الحقول
    await page.fill('input[type="email"], input[name="email"]', config.email);
    await page.fill('input[type="password"], input[name="password"]', config.password);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle" }).catch(() => {}),
      page.click('button[type="submit"], button:has-text("تسجيل الدخول"), button:has-text("Login")')
    ]);

    // ---- 2) تحديد الفترة = أمس، وتصدير تقرير "المبيعات حسب التصنيف" ----
    const { display, iso } = yesterdayStr();
    const categoryCsv = await exportReportCsv(page, CATEGORY_REPORT_URL, display);
    const categoryRows = parseTabsenseCategoryCsv(categoryCsv);
    const mappedRows = categoryRows
      .filter(r => CATEGORY_MAP[r.category])
      .map(r => ({ category: CATEGORY_MAP[r.category], qty: r.qty }));

    // ---- 3) تصدير تقرير "المبيعات حسب المنتج" لسحب كمية "أم علي" (= نصف ساندويتش لكل حبة) ----
    const productCsv = await exportReportCsv(page, PRODUCT_REPORT_URL, display);
    const ummAliQty = findProductQty(productCsv, UMM_ALI_PRODUCT_NAME);
    const sandwichesFromUmmAli = ummAliQty / 2; // كل 2 "أم علي" = ساندويتش واحد
    if (sandwichesFromUmmAli > 0) {
      const existing = mappedRows.find(r => r.category === UMM_ALI_TARGET_CATEGORY);
      if (existing) existing.qty += sandwichesFromUmmAli;
      else mappedRows.push({ category: UMM_ALI_TARGET_CATEGORY, qty: sandwichesFromUmmAli });
    }

    // ---- 4) إرسال النتيجة النهائية لموقع برو هاوس ----
    const res = await fetch(config.prohouseApiUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "importSalesByCategory",
        integrationToken: config.integrationToken,
        payload: { date: iso, branch: config.branch, rows: mappedRows }
      })
    });
    const json = await res.json();
    if (!json.ok) throw new Error("رفض السيرفر البيانات: " + json.error);

    console.log(`✅ تم سحب وإرسال بيانات ${iso} لفرع ${config.branch}:`, mappedRows);
  } catch (err) {
    console.error("❌ فشل السحب:", err.message);
    await page.screenshot({ path: path.join(DOWNLOAD_DIR, "error-screenshot.png") }).catch(() => {});
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

run();
