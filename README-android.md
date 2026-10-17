# نسخه‌ی اندروید زمین‌یار

## راه ۱ — نصب مثل برنامه (PWA) — بدون ساخت APK
1. پوشه‌ی پروژه را (فایل‌های index.html، core.js، js، vendor، icons، sw.js، manifest.webmanifest، style.css) روی یک میزبان **HTTPS** بگذارید (GitHub Pages، Netlify، Cloudflare Pages، یا سرور خودتان).
   GPS مرورگر فقط روی HTTPS کار می‌کند؛ `http://آی‌پی‌رایانه` روی گوشی GPS نمی‌دهد.
2. در Chrome اندروید نشانی را باز کنید ← منو ⋮ ← «Install app / افزودن به صفحه‌ی اصلی».
3. بار اول با اینترنت باز کنید؛ از آن پس برنامه بدون اینترنت هم باز می‌شود (نقشه فقط برای مناطقی که قبلاً دیده‌اید در حافظه است).

## راه ۲ — ساخت APK واقعی (Capacitor)
نیازمند: Node 18+، Android Studio (با Android SDK)، JDK 17.
    npm install
    npm run android:sync      # کپی برنامه‌ی وب به پروژه‌ی اندروید
    npm run android:open      # بازشدن در Android Studio
سپس در Android Studio: Build ← Build Bundle(s)/APK(s) ← Build APK(s). فایل خروجی:
`android/app/build/outputs/apk/debug/app-debug.apk` را روی گوشی نصب کنید (نصب از منبع ناشناس).
مجوز موقعیت (GPS) در AndroidManifest اضافه شده است؛ هنگام اولین استفاده گوشی اجازه می‌پرسد.
برای انتشار در بازار (Google Play / کافه‌بازار) باید APK/AAB امضا شود.

> توجه: این پروژه‌ی اندروید در محیط توسعه ساخته (generate) شد ولی ساخت Gradle در آن محیط ممکن نبود (SDK موجود نبود)؛ بنابراین APK نهایی هنوز آزمایش نشده است.

## راه ۳ — ساخت APK در ابر، بدون Android Studio
پروژه را در یک مخزن GitHub بگذارید؛ در تب Actions گردش‌کار «Build Android APK» را اجرا کنید و فایل `zamin-yar-apk` را دانلود کنید.
(این گردش‌کار نوشته شده ولی هنوز اجرا و آزمایش نشده است.)

## نسخه‌های اندروید
حداقل: Android 7.0 (API 24) — هدف و کامپایل: API 36. روی نسخه‌های بین این دو و جدیدتر اجرا می‌شود.
برای دستگاه‌های قدیمی‌تر از ۷ از راه ۱ (مرورگر) استفاده کنید.
