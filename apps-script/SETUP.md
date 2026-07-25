# إعداد باك اند Pro House (Google Sheet + Apps Script)

## 1) إنشاء الشيت

أنشئ Google Sheet جديد (مثلاً باسم "Pro House DB")، وأنشئ بداخله 6 تبويبات بهاي الأسماء بالظبط (حساسة لحالة الأحرف):

`Items` , `DailyEntries` , `DayMeta` , `TomorrowOrders` , `Employees` , `Settings`

بكل تبويب، حط بالصف الأول (Row 1) أسماء الأعمدة هاي بالظبط:

- **Items**: `id`, `category`, `name`, `unit`, `hasCustomName`, `active`, `sortOrder`, `updatedAt`
- **DailyEntries**: `date`, `itemId`, `itemName`, `unit`, `received`, `returned`, `cookName`, `notes`, `savedAt`
- **DayMeta**: `date`, `employeeName`, `salesReportLink`, `paymentsReportLink`, `savedAt`, `updatedAt`
- **TomorrowOrders**: `date`, `itemId`, `itemName`, `unit`, `qty`, `notes`, `employeeName`, `savedAt`
- **Employees**: `name`, `active`
- **Settings**: `key`, `value`, `updatedAt`

⚠️ مهم: حدد عمود `date` بكل تبويب وخليه **Plain text** (من القائمة: Format → Number → Plain text) قبل ما تحط أي بيانات فيه، حتى Google Sheets ما يحول التاريخ لصيغة رقمية.

## 2) تعبئة بيانات أولية

### Items (الصق هاي البيانات بالخلية A2 بتبويب Items — انسخ الجدول كامل والصقه):

```
id	category	name	unit	hasCustomName	active	sortOrder	updatedAt
dd3cc4c6-e8a3-422a-b61e-dfa4dddd7167	دجاج	دجاج تندر	1/3	FALSE	TRUE	1	
3ddb0006-e437-413c-9f80-ea3cd0cfbbfc	دجاج	دجاج باربكيو	1/3	FALSE	TRUE	2	
fe5bee6b-cffc-45b4-9991-ba2e80ff59b5	دجاج	دجاج بينك صوص	1/3	FALSE	TRUE	3	
0a7c46d4-f04f-4b93-b855-568b6c184af4	دجاج	دجاج الشيف	1/3	TRUE	TRUE	4	
d7b163b1-62e1-499a-86bd-12bedb72b8d2	بحري	لحم الشيف	1/3	TRUE	TRUE	1	
b2cce518-1f38-4df5-b036-1765a29c09ea	بحري	سالمون	1/3	FALSE	TRUE	2	
548cfbcb-75f0-494c-b5eb-9b5abff821ec	بحري	سمك الشيف (جمبو)	1/3	FALSE	TRUE	3	
5bf08ab6-eb85-4f4f-a4e7-f2f0f4d15190	بحري	جمبري بروفنسال	1/3	FALSE	TRUE	4	
9be02712-74ca-4efc-bca4-27c1ae15f02f	كارب	رز أبيض	1/2	FALSE	TRUE	1	
2dc9520f-4f13-4a74-82a4-9ed90980f183	كارب	رز الشيف	1/2	FALSE	TRUE	2	
77562615-17b2-48cf-8ee3-f9e0fe788835	كارب	بطاطس ويدجز	1	FALSE	TRUE	3	
803f7d7f-b4f2-4481-9c52-fdfe614f6166	كارب	مكرونة الشيف	1/3	FALSE	TRUE	4	
2d9ec409-17e8-49e2-af72-c7202edbaf10	كارب	كارب الشيف	1/3	FALSE	TRUE	5	
b79d55cf-075a-428e-9e09-943ca7b690d6	السلطات	سلطة تونا	طاسة	FALSE	TRUE	1	
c50e1048-bf90-4520-80e9-de8f68b04db9	السلطات	سلطة فتوش	طاسة	FALSE	TRUE	2	
1833c83c-87b7-4efa-a177-64c945b3a333	السلطات	سلطة سيزر	طاسة	FALSE	TRUE	3	
a45287d2-275e-455c-8d8b-049e82332a20	الحلويات	كوكيز	حبة	FALSE	TRUE	1	
051158f9-4054-4534-9f95-93f9d8b6c9cf	الحلويات	براونيز	حبة	FALSE	TRUE	2	
1386377d-4d29-4cc1-87bd-44fee0ce4917	الحلويات	سينابون	حبة	FALSE	TRUE	3	
e952ad99-ce8e-414b-824f-133846252411	الحلويات	حلى الشيف	صينية	FALSE	TRUE	4	
b297db06-b718-4a87-a48c-1ad3c940d40d	فطور	ساندويتش روستيد	ساندويتش	FALSE	TRUE	1	
ebf81abc-90c4-458a-97d5-a06bb4442339	فطور	ساندويتش صن رايز	ساندويتش	FALSE	TRUE	2	
f560b2db-8c58-49d7-843c-33027d3aed4e	فطور	صن رايز بدون ديك رومي	ساندويتش	FALSE	TRUE	3	
751b4e2a-70eb-4c43-868e-932889cbc48a	فطور	ساندويتش تونا	ساندويتش	FALSE	TRUE	4	
fb5bd1bf-44d2-4709-8c02-0540fac1d07e	فطور	ساندويتش كساديا	ساندويتش	FALSE	TRUE	5	
7bd4fc33-652b-477f-bd00-13840d2f4134	فطور	ساندويتش كروك ديلوكس	ساندويتش	FALSE	TRUE	6	
8227be0a-ae30-4b31-9d6b-c7b67bd9990c	فطور	كرواسون بيض بالتيركي	ساندويتش	FALSE	TRUE	7	
d352e3c0-16b0-4635-ad9b-107cce3ff1aa	فطور	ساندويتش حلوم	ساندويتش	FALSE	TRUE	8	
f17b20d3-adbe-4533-85eb-22768ef1bcd5	فطور	كلوب ساندويتش	ساندويتش	FALSE	TRUE	9	
aae0acb0-f7b4-4b71-941a-28fd9bfe2827	معدات	سفنديشات الفطور	-	FALSE	TRUE	1	
```

ملاحظة: "دجاج الشيف" و"لحم الشيف" صاروا صنف واحد عام لكل منهم (`hasCustomName=TRUE`) بدل الأصناف الثابتة القديمة، وبيطلب النظام اسم الطبخة يدوياً وقت التعبئة — هذا حسب طلبك بالمواصفات.

### Employees (الصق بـ A2 بتبويب Employees):

```
name	active
موظف 1	TRUE
موظف 2	TRUE
موظف 3	TRUE
موظف 4	TRUE
موظف 5	TRUE
موظف 6	TRUE
موظف 7	TRUE
```

عدّل الأسماء لاحقاً بالشيت مباشرة (استبدل "موظف 1" إلخ بالأسماء الحقيقية) — ما بتحتاج تعديل كود.

### Settings (الصق بـ A2 بتبويب Settings):

```
key	value	updatedAt
restaurantName	Pro House	
branchName	عبداللطيف جميل - الروضة	
logoUrl		
shortageThresholdPct	-0.20	
surplusThresholdPct	0.25	
returnThresholdPct	0.30	
```

## 2.5) نسخ كود السيرفر

من داخل نفس الشيت: **Extensions → Apps Script**. احذف أي كود موجود بـ `Code.gs` والصق مكانه محتوى ملف `Code.gs` الموجود بهاد المجلد (`apps-script/Code.gs`).

اضغط ▶ Run مرة وحدة على أي دالة (مثلاً `getSettings`) عشان يطلبلك يوافق على صلاحيات الوصول للشيت — وافق.

## 3) النشر (Deploy)

1. Deploy → New deployment.
2. اختر النوع (Select type) → **Web app**.
3. Execute as: **Me**.
4. Who has access: **Anyone**.
5. Deploy، وسينك النظام صلاحيات — وافق.
6. انسخ الرابط الناتج (ينتهي بـ `/exec`).

## 4) ربط الرابط بالموقع

الصق الرابط جوا `js/config.js` بمكان `API_URL`، بعدها ادفعلي التعديل أو خبرني وأنا بحطه وبرفعه.

## ملاحظات مهمة

- **أي تعديل على كود Code.gs لازم نسخة نشر جديدة**: Deploy → Manage deployments → ✏️ → New version، وإلا التعديل ما بينعكس على الرابط الحي.
- النظام حالياً **مو محمي** (أي حدا معه رابط الـ API يقدر يقرأ/يكتب) — هذا قرار مؤقت متفق عليه، ممكن نضيف حماية (تسجيل دخول Google) لاحقاً بدون إعادة هيكلة.
- بعد ما تعطيني رابط `/exec`، منقدر نختبر سوا حفظ حقيقي وقراءة حقيقية من الشيت.
