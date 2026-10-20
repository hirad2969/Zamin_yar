# نسخه‌ی اندروید زمین‌یار

## راه ۱ — نصب مثل برنامه (PWA) — بدون ساخت APK
1. پوشه‌ی پروژه را (فایل‌های index.html، core.js، js، vendor، icons، sw.js، manifest.webmanifest، style.css) روی یک میزبان **HTTPS** بگذارید (GitHub Pages، Netlify، Cloudflare Pages، یا سرور خودتان).
   GPS مرورگر فقط روی HTTPS کار می‌کند؛ `http://آی‌پی‌رایانه` روی گوشی GPS نمی‌دهد.
2. در Chrome اندروید نشانی را باز کنید ← منو ⋮ ← «Install app / افزودن به صفحه‌ی اصلی».
3. بار اول با اینترنت باز کنید؛ از آن پس برنامه بدون اینترنت هم باز می‌شود (نقشه فقط برای مناطقی که قبلاً دیده‌اید در حافظه است).

## راه ۲ — ساخت APK واقعی (Capacitor)
نیازمند: **Node 22+** (Capacitor 8 به Node ۲۲ یا جدیدتر نیاز دارد)، Android Studio با Android SDK (پلتفرم API 36)، JDK 21.
    npm install
    npm run android:sync      # کپی برنامه‌ی وب به پروژه‌ی اندروید
    npm run android:open      # بازشدن در Android Studio
سپس در Android Studio: Build ← Build Bundle(s)/APK(s) ← Build APK(s). فایل خروجی:
`android/app/build/outputs/apk/debug/app-debug.apk` را روی گوشی نصب کنید (نصب از منبع ناشناس).
مجوز موقعیت (GPS) در AndroidManifest اضافه شده است؛ هنگام اولین استفاده گوشی اجازه می‌پرسد.
برای انتشار در بازار (Google Play / کافه‌بازار) باید APK/AAB امضا شود.

> توجه: ساخت Gradle در GitHub Actions با موفقیت انجام شد و APK ساخته می‌شود (راه ۳). نصب و اجرای APK روی دستگاه واقعی هنوز توسط خودتان آزمایش نشده است؛ لطفاً پیش از تکیه‌ی کامل، یک‌بار روی گوشی امتحان کنید.

## لینک مستقیم دانلود اندروید (ساده‌ترین راه) ⬇️

فایل APK هر بار که `main` به‌روز می‌شود دوباره ساخته و روی همین نشانی گذاشته می‌شود:

    https://github.com/hirad2969/Zamin_yar/releases/latest/download/zamin-yar.apk

این نشانی عمومی است (برای دانلود لازم نیست وارد حساب GitHub شوید). روی گوشی بازش کنید، دانلود شود، بعد «نصب از منبع ناشناس» را برای مرورگر اجازه بدهید. صفحه‌ی همه‌ی نسخه‌ها: <https://github.com/hirad2969/Zamin_yar/releases>

> اگر نشانی بالا فایلی نداد، یعنی هنوز اولین انتشار انجام نشده است: در تب **Actions** گردش‌کار **Build Android APK** را روی `main` یک‌بار دستی اجرا کنید (دکمه‌ی *Run workflow*)؛ در پایان همان اجرا، فایل روی Releases قرار می‌گیرد.

## راه ۳ — ساخت APK در ابر، بدون Android Studio (آزمایش‌شده ✅)
گردش‌کار «Build Android APK» در تب Actions روی هر push به `main` (و هر PR) اجرا می‌شود و APK می‌سازد:

1. در مخزن، تب **Actions** ← گردش‌کار **Build Android APK** ← آخرین اجرای سبز روی `main` را باز کنید.
2. پایین صفحه، در بخش **Artifacts**، فایل `zamin-yar-apk` را دانلود کنید (zip شامل `app-debug.apk`، حدود ۴٫۳ مگابایت).
3. zip را باز کنید و `app-debug.apk` را روی گوشی نصب کنید (اجازه‌ی «نصب از منبع ناشناس»).

نکته‌ها:
- این APK **debug و بدون امضا** است؛ برای نصب مستقیم روی گوشی کافی است، ولی برای انتشار در Google Play یا کافه‌بازار باید با کلید خودتان امضا شود (`assembleRelease` + `keystore`).
- مجوز موقعیت (GPS) در `AndroidManifest.xml` هست؛ در اولین استفاده گوشی اجازه می‌پرسد.
- Android SDK روی تصویر `ubuntu-latest` از پیش نصب است؛ گردش‌کار فقط `platforms;android-36` و `build-tools;36.0.0` را آماده می‌کند.
- همین گردش‌کار در پایان، APK را با نام `zamin-yar.apk` در انتشار (Release) با برچسب `android-latest` می‌گذارد تا لینک دانلود همیشه ثابت بماند (روی PRها انتشار انجام نمی‌شود).

## نسخه‌های اندروید
حداقل: Android 7.0 (API 24) — هدف و کامپایل: API 36. روی نسخه‌های بین این دو و جدیدتر اجرا می‌شود.
برای دستگاه‌های قدیمی‌تر از ۷ از راه ۱ (مرورگر) استفاده کنید.
