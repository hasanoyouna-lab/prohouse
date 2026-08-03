@echo off
chcp 65001 >nul
cd /d "%~dp0"

REM يرفع Code.gs للسيرفر وبينشر نسخة جديدة على نفس رابط /exec (الرابط ما بيتغيّر أبداً).
REM بديل عن فتح محرر Apps Script ولصق الكود يدوياً بعد كل تحديث.

set DEPLOYMENT_ID=AKfycbykhtn0VUleuPkNYAKutt6AFrpl-atN5dmruiRGTSkK8ejYZxzbsZ71AZyDQD_LMbe_

echo [1/2] رفع الكود...
call clasp push --force || goto :fail

echo [2/2] نشر نسخة جديدة...
call clasp redeploy %DEPLOYMENT_ID% -d "auto deploy" || goto :fail

echo.
echo تم النشر بنجاح. الرابط نفسه ما تغيّر.
pause
exit /b 0

:fail
echo.
echo فشل النشر. لو الرسالة عن تسجيل الدخول، شغّل: clasp login
pause
exit /b 1
