// ==================== سحب تلقائي لتقرير "المبيعات حسب التصنيف" من تابسنس ====================
// سكربت أتمتة غير رسمي لسحب التقرير اليومي ليوم أمس وإرساله لـ Pro House.

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

// تصنيفات تابسنس المتطابقة مع الأصناف عندنا
const CATEGORY_MAP = {
  "أطباق الدجاج": "دجاج",
  "أطباق اللحم": "لحم",
  "أطباق المأكولات البحرية": "بحري",
  "الدجاج": "دجاج",
  "اللحم": "لحم",
  "المأكولات البحرية": "بحري",
  "Chicken": "دجاج",
  "Chicken Dishes": "دجاج",
  "Meat": "لحم",
  "Meat Dishes": "لحم",
  "Seafood": "بحري",
  "Seafood Dishes": "بحري"
};

const UMM_ALI_PRODUCT_NAME = "ام علي";
const UMM_ALI_TARGET_CATEGORY = "فطور";

function getTargetDateStr() {
  // إذا تم تحديد تاريخ معين بالأمر نسحبه، وإلا نأخذ تاريخ اليوم نفسه كافتراضي
  const customDate = process.argv[2]; // مثال: node pull-tabsense.js 07/30/2026
  if (customDate && /\d{2}\/\d{2}\/\d{4}/.test(customDate)) {
    const parts = customDate.split("/");
    return { display: customDate, iso: `${parts[2]}-${parts[0]}-${parts[1]}` };
  }

  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return { display: `${mm}/${dd}/${yyyy}`, iso: `${yyyy}-${mm}-${dd}` };
}

function normalizeArabic(s) {
  return String(s || "").replace(/[أإآ]/g, "ا").trim();
}

async function prepareReportPageAndSetDate(page, reportUrl, dateDisplay) {
  await page.goto(reportUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);

  // تحويل اللغة للعربية لو ظهر زر "ع"
  const arLangBtn = page.locator('a:has-text("ع"), button:has-text("ع")').first();
  if (await arLangBtn.isVisible().catch(() => false)) {
    await arLangBtn.click().catch(() => {});
    await page.waitForTimeout(2000);
  }

  // ضبط حقل التاريخ والتطبيق
  await page.evaluate((d) => {
    const el = $('input[name="datefilter"]');
    if (el.length && el.data('daterangepicker')) {
      const picker = el.data('daterangepicker');
      picker.setStartDate(d);
      picker.setEndDate(d);
      el.val(d + ' - ' + d);
    } else {
      const input = document.querySelector('input[name="datefilter"]');
      if (input) {
        input.value = d + ' - ' + d;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    const btn = document.querySelector('#applyChartFilter') || document.querySelector('#applyChartFilterBlur') || document.querySelector('.applyBtn');
    if (btn) btn.click();
  }, dateDisplay);

  await page.waitForTimeout(3500);
}

async function extractCategoryTable(page) {
  return await page.evaluate(() => {
    const table = document.querySelector('table');
    if (!table) return [];
    const headers = Array.from(table.querySelectorAll('thead th, thead td')).map(th => th.innerText.trim());
    const catIdx = headers.findIndex(h => h.includes('التصنيف') || h.toLowerCase().includes('category'));
    const qtyIdx = headers.findIndex(h => h.includes('الكمية') || h.toLowerCase().includes('qty') || h.toLowerCase().includes('quantity'));
    
    const rows = [];
    const trs = Array.from(table.querySelectorAll('tbody tr'));
    for (const tr of trs) {
      const tds = Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim());
      if (tds[catIdx]) {
        const qtyStr = tds[qtyIdx] ? tds[qtyIdx].replace(/,/g, '') : '0';
        rows.push({
          category: tds[catIdx],
          qty: parseFloat(qtyStr) || 0
        });
      }
    }
    return rows;
  });
}

async function extractProductQty(page, productName) {
  const products = await page.evaluate(() => {
    const table = document.querySelector('table');
    if (!table) return [];
    const headers = Array.from(table.querySelectorAll('thead th, thead td')).map(th => th.innerText.trim());
    const nameIdx = headers.findIndex(h => h.includes('المنتج') || h.toLowerCase().includes('product') || h.toLowerCase().includes('item'));
    const qtyIdx = headers.findIndex(h => h.includes('الكمية') || h.toLowerCase().includes('qty') || h.toLowerCase().includes('quantity'));
    
    const rows = [];
    const trs = Array.from(table.querySelectorAll('tbody tr'));
    for (const tr of trs) {
      const tds = Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim());
      if (tds[nameIdx]) {
        const qtyStr = tds[qtyIdx] ? tds[qtyIdx].replace(/,/g, '') : '0';
        rows.push({
          name: tds[nameIdx],
          qty: parseFloat(qtyStr) || 0
        });
      }
    }
    return rows;
  });

  const target = normalizeArabic(productName);
  const found = products.find(p => normalizeArabic(p.name) === target || normalizeArabic(p.name).includes("ام علي"));
  return found ? found.qty : 0;
}

async function run() {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1600, height: 900 } });
  const page = await context.newPage();

  try {
    const { display, iso } = getTargetDateStr();
    console.log(`🔑 جاري تسجيل الدخول بتابسنس...`);
    await page.goto(LOGIN_URL, { waitUntil: "networkidle" });
    await page.fill('input[type="email"], input[name="email"]', config.email);
    await page.fill('input[type="password"], input[name="password"]', config.password);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle" }).catch(() => {}),
      page.click('button[type="submit"], button:has-text("تسجيل الدخول"), button:has-text("Login")')
    ]);

    // ---- 1) تقرير "المبيعات حسب التصنيف" ----
    console.log(`📊 جاري سحب تقرير المبيعات حسب التصنيف ليوم ${display}...`);
    await prepareReportPageAndSetDate(page, CATEGORY_REPORT_URL, display);
    const categoryRows = await extractCategoryTable(page);
    console.log("جدول التصنيفات المستخرج:", categoryRows);

    const mappedRows = categoryRows
      .filter(r => CATEGORY_MAP[r.category])
      .map(r => ({ category: CATEGORY_MAP[r.category], qty: r.qty }));

    // ---- 2) تقرير "المبيعات حسب المنتج" لـ "أم علي" ----
    console.log("🍩 جاري سحب تقرير المبيعات حسب المنتج لمنتج (أم علي)...");
    await prepareReportPageAndSetDate(page, PRODUCT_REPORT_URL, display);
    const ummAliQty = await extractProductQty(page, UMM_ALI_PRODUCT_NAME);
    console.log(`كمية منتج أم علي المباعة: ${ummAliQty}`);
    
    const sandwichesFromUmmAli = ummAliQty / 2;
    if (sandwichesFromUmmAli > 0) {
      const existing = mappedRows.find(r => r.category === UMM_ALI_TARGET_CATEGORY);
      if (existing) existing.qty += sandwichesFromUmmAli;
      else mappedRows.push({ category: UMM_ALI_TARGET_CATEGORY, qty: sandwichesFromUmmAli });
    }

    // ---- 3) إرسال النتيجة لموقع برو هاوس ----
    console.log(`🚀 جاري إرسال البيانات لموقع Pro House (فرع ${config.branch} - تاريخ ${iso})...`);
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

    console.log(`🎉 تم سحب وإرسال بيانات ${iso} لفرع ${config.branch} بنجاح!`, mappedRows);
  } catch (err) {
    console.error("❌ فشل السحب:", err.message);
    await page.screenshot({ path: path.join(DOWNLOAD_DIR, "error-screenshot.png") }).catch(() => {});
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

run();
