/* آزمون تشخیص خودکار مرز + حالت تمام‌صفحه‌ی نقشه (با کاشی‌های مصنوعی) */
const { chromium, devices } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const URL = process.env.URL || 'http://localhost:8765/index.html';
const out = []; let fails = 0;
const T = async (n, f) => { try { await f(); out.push('✔ ' + n); } catch (e) { fails++; out.push('✘ ' + n + ' — ' + e.message.split('\n')[0]); } };
const ok = (c, m) => { if (!c) throw new Error(m || 'شرط برقرار نیست'); };
const wait = (ms) => new Promise(r => setTimeout(r, ms));

// زمین مصنوعی ۱۲۰×۸۰ متر (سبز) روی زمینه‌ی خاکی
const lat0 = 35, lon0 = 51, dLat = 80 / 110950, dLon = 120 / (111320 * Math.cos(lat0 * Math.PI / 180));
const corners = [[lon0, lat0], [lon0 + dLon, lat0], [lon0 + dLon, lat0 + dLat], [lon0, lat0 + dLat]];
const center = [lat0 + dLat / 2, lon0 + dLon / 2];

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ ...devices['Pixel 7'], locale: 'fa-IR', serviceWorkers: 'block' });
  const helper = await ctx.newPage(); await helper.goto('about:blank');
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
  let tilesMode = 'ok', tileReqs = 0;
  await page.route(/^https?:\/\/(?!localhost)/, async (r) => {
    const u = r.request().url();
    const m = u.match(/arcgisonline\.com.*\/tile\/(\d+)\/(\d+)\/(\d+)/);
    if (!m || tilesMode !== 'ok') return r.abort();
    tileReqs++;
    const [z, y, x] = [+m[1], +m[2], +m[3]];
    const b64 = await helper.evaluate(([z, x, y, c]) => {
      const s = 256 * Math.pow(2, z), wp = (lng, lat) => { const sn = Math.sin(lat * Math.PI / 180); return [(lng + 180) / 360 * s, (0.5 - Math.log((1 + sn) / (1 - sn)) / (4 * Math.PI)) * s]; };
      const a = wp(c[0][0], c[0][1]), b = wp(c[2][0], c[2][1]);
      const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
      const cv = document.createElement('canvas'); cv.width = cv.height = 256; const cx = cv.getContext('2d'), im = cx.createImageData(256, 256);
      for (let py = 0; py < 256; py++) for (let px = 0; px < 256; px++) {
        const X = x * 256 + px, Y = y * 256 + py, inside = X >= x0 && X < x1 && Y >= y0 && Y < y1, n = (Math.random() - .5) * 10, i = (py * 256 + px) * 4;
        im.data[i] = (inside ? 70 : 150) + n; im.data[i + 1] = (inside ? 120 : 120) + n; im.data[i + 2] = (inside ? 50 : 80) + n; im.data[i + 3] = 255;
      }
      cx.putImageData(im, 0, 0); return cv.toDataURL('image/png').split(',')[1];
    }, [z, x, y, corners]);
    r.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: Buffer.from(b64, 'base64') });
  });
  await page.goto(URL); await page.waitForSelector('#form-root .sec');
  const trueArea = await page.evaluate((c) => App.C.areaM2(c), corners);
  const focused = () => page.evaluate(() => document.body.classList.contains('map-focus'));
  const mapBox = () => page.evaluate(() => { const r = document.getElementById('map').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, ih: innerHeight }; });
  const bnd = () => page.evaluate(() => { const b = App.map.getBoundary(); return { n: b.count, area: b.area, src: b.source, valid: b.valid }; });

  await T('تشخیص خودکار: حالت تمام‌صفحه می‌شود و منوها پنهان‌اند', async () => {
    await page.evaluate((c) => App.map.map.setView(c, 18), center);
    const before = await mapBox();
    await page.click('text=تشخیص خودکار مرز');
    ok(await focused(), 'map-focus فعال نشد');
    const hidden = await page.evaluate(() => ['header.top', '#side', '#maptools'].map(s => getComputedStyle(document.querySelector(s)).display));
    ok(hidden.every(d => d === 'none'), 'منوها پنهان نشدند: ' + hidden);
    await wait(500);
    const after = await mapBox();
    ok(after.h > before.h * 1.7, `نقشه بزرگ نشد: ${before.h} → ${after.h}`);
    ok(after.h >= after.ih - 2, `نقشه تمام ارتفاع نیست: ${after.h}/${after.ih}`);
    ok((await page.textContent('#detect-bar')).includes('مرکز زمین'), 'راهنما نیست');
    await page.screenshot({ path: '/tmp/d1.png' });
  });

  await T('لمس مرکز: مرز با مساحت درست پیشنهاد می‌شود', async () => {
    await page.evaluate((c) => App.map.map.setView(c, 18, { animate: false }), center); await wait(400);
    const b = await mapBox();
    await page.mouse.click(b.x + b.w / 2, b.y + b.h / 2);
    await page.waitForFunction(() => App.map.getBoundary().count >= 3, null, { timeout: 25000 });
    const r = await bnd();
    ok(r.src === 'auto' && r.valid, JSON.stringify(r));
    const err = Math.abs(r.area - trueArea) / trueArea;
    ok(err < 0.08, `خطای مساحت ${(err * 100).toFixed(1)}٪ (${r.area.toFixed(0)} از ${trueArea.toFixed(0)})`);
    ok(r.n <= 12, 'رأس زیاد: ' + r.n);
    ok(await focused(), 'تمام‌صفحه پس از تشخیص باید بماند تا بشود ویرایش کرد');
    const bar = await page.textContent('#draw-bar');
    ok(/حساسیت/.test(bar) && /بازگشت به فرم/.test(bar), 'دکمه‌ها نیست: ' + bar);
    await page.screenshot({ path: '/tmp/d2.png' });
  });

  await T('حساسیت: تغییر سطح و حفظ ویرایش‌پذیری', async () => {
    const l0 = await page.evaluate(() => App.detect.st.level);
    await page.click('text=بیشتر (مرز گشادتر)').catch(async () => { await page.click('text=کمتر (مرز تنگ‌تر)'); });
    const l1 = await page.evaluate(() => App.detect.st.level);
    ok(l1 !== l0, 'سطح عوض نشد'); const r = await bnd(); ok(r.n >= 3 && r.valid, JSON.stringify(r));
    // ویرایش یک رأس با کشیدن/تنظیم مستقیم
    const moved = await page.evaluate(() => { const D = App.map.D; const a = D.pts[0][0]; D.pts[0][0] += 0.00002; return D.pts[0][0] !== a; });
    ok(moved, 'ویرایش نقاط ممکن نیست');
  });

  await T('بازگشت به فرم: پنل کناری و منوها برمی‌گردند و مرز بماند', async () => {
    await page.click('#focus-toggle');
    ok(!(await focused()), 'هنوز تمام‌صفحه است');
    const vis = await page.evaluate(() => getComputedStyle(document.getElementById('side')).display !== 'none' && getComputedStyle(document.querySelector('header.top')).display !== 'none');
    ok(vis, 'منو/فرم برنگشت');
    ok((await bnd()).n >= 3, 'مرز از دست رفت');
    await wait(300); const m = await mapBox(); ok(m.h < m.ih * 0.7, 'ارتفاع نقشه برنگشت: ' + m.h);
  });

  await T('ترسیم دستی هم تمام‌صفحه می‌شود و با پایان ترسیم ویرایش ادامه دارد', async () => {
    await page.click('text=ترسیم مرز روی نقشه');
    ok(await focused(), 'ترسیم تمام‌صفحه نشد');
    await wait(300); const b = await mapBox();
    for (const [dx, dy] of [[-60, -40], [60, -40], [60, 40]]) await page.mouse.click(b.x + b.w / 2 + dx, b.y + b.h / 2 + dy);
    await page.click('text=پایان ترسیم');
    ok(await focused(), 'پس از پایان ترسیم باید برای ویرایش بماند');
    ok((await bnd()).n === 3, 'نقاط ناقص');
    await page.click('#focus-toggle'); ok(!(await focused()), 'بازگشت کار نکرد');
  });

  await T('انصراف: Esc در حالت انتظار تمام‌صفحه را می‌بندد و چیزی نمی‌سازد', async () => {
    await page.click('text=پاک‌کردن مرز').catch(() => {});
    await page.evaluate(() => App.map.clearBoundary && App.map.clearBoundary());
    await page.click('text=تشخیص خودکار مرز'); ok(await focused());
    await page.keyboard.press('Escape'); await wait(200);
    ok(!(await focused()), 'Esc کار نکرد'); ok((await bnd()).n === 0, 'مرز ساخته شد');
  });

  await T('بدون اینترنت: پیام روشن و برنامه سالم می‌ماند', async () => {
    tilesMode = 'fail';
    await page.evaluate((c) => App.map.map.setView(c, 17, { animate: false }), center);
    await page.click('text=تشخیص خودکار مرز'); await wait(300);
    const b = await mapBox(); await page.mouse.click(b.x + b.w / 2, b.y + b.h / 2);
    await page.waitForSelector('.toast.err', { timeout: 15000 });
    const t = await page.textContent('.toast.err'); ok(/اینترنت|کاشی/.test(t), t);
    ok((await page.textContent('#detect-bar')).includes('مرکز زمین'), 'بعد از خطا باید دوباره منتظر لمس باشد');
    await page.keyboard.press('Escape'); tilesMode = 'ok';
  });

  await T('بدون خطای جاوااسکریپت', async () => { ok(errs.length === 0, errs.join(' | ')); });

  console.log(out.join('\n')); console.log(fails ? `\n${fails} ناموفق` : '\nهمه موفق');
  await browser.close(); process.exit(fails ? 1 : 0);
})();
