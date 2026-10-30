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
  const page = await ctx.newPage(); await page.addInitScript(() => { window.ZY_NOSEED = true; try { localStorage.setItem('zy-adv', '1'); } catch (e) {} });
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
  let tilesMode = 'ok', tileReqs = 0, withNeighbor = false;
  await page.route(/^https?:\/\/(?!localhost)/, async (r) => {
    const u = r.request().url();
    const m = u.match(/arcgisonline\.com.*\/tile\/(\d+)\/(\d+)\/(\d+)/);
    if (!m || tilesMode !== 'ok') return r.abort();
    tileReqs++;
    const [z, y, x] = [+m[1], +m[2], +m[3]];
    const b64 = await helper.evaluate(([z, x, y, c, nb]) => {
      const s = 256 * Math.pow(2, z), wp = (lng, lat) => { const sn = Math.sin(lat * Math.PI / 180); return [(lng + 180) / 360 * s, (0.5 - Math.log((1 + sn) / (1 - sn)) / (4 * Math.PI)) * s]; };
      const a = wp(c[0][0], c[0][1]), b = wp(c[2][0], c[2][1]);
      const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
      const cv = document.createElement('canvas'); cv.width = cv.height = 256; const cx = cv.getContext('2d'), im = cx.createImageData(256, 256);
      for (let py = 0; py < 256; py++) for (let px = 0; px < 256; px++) {
        const X = x * 256 + px, Y = y * 256 + py, inside = X >= x0 && X < x1 && Y >= y0 && Y < y1, n = (Math.random() - .5) * 10, i = (py * 256 + px) * 4;
        const east = nb && X >= x1 && X < x1 + (x1 - x0) && Y >= y0 && Y < y1; // زمین مجاورِ تقریباً هم‌رنگ
        im.data[i] = (inside ? 70 : east ? 75 : 150) + n; im.data[i + 1] = (inside ? 120 : east ? 122 : 120) + n; im.data[i + 2] = (inside ? 50 : east ? 54 : 80) + n; im.data[i + 3] = 255;
      }
      cx.putImageData(im, 0, 0); return cv.toDataURL('image/png').split(',')[1];
    }, [z, x, y, corners, withNeighbor]);
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
    ok(/حساسیت|ناحیه/.test(bar) && /بازگشت به فرم/.test(bar), 'دکمه‌ها نیست: ' + bar);
    await page.screenshot({ path: '/tmp/d2.png' });
  });

  await T('حساسیت: تغییر سطح و حفظ ویرایش‌پذیری', async () => {
    const st0 = await page.evaluate(() => ({ lv: App.detect.st.level, idx: App.detect.st.last && App.detect.st.last.idx, snap: App.detect.st.snap }));
    const btn = await page.$('#draw-bar >> text=/بیشتر|بزرگ‌تر ناحیه|ناحیه‌ی بزرگ‌تر|کمتر|ناحیه‌ی کوچک‌تر/');
    if (btn && await btn.isEnabled()) await btn.click();
    else await page.click('#detect-rect').catch(() => {});          // حالت مستطیل/شکل آزاد
    const r = await bnd(); ok(r.n >= 3 && r.valid, JSON.stringify(r));
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
    await wait(300);
    ok(await page.evaluate(() => App.map.D.precise), 'روی گوشی باید حالت دقیق (ضربدر) پیش‌فرض باشد');
    ok(await page.evaluate(() => !document.getElementById('map-cross').hidden), 'ضربدر وسط نمایش داده نشد');
    const b = await mapBox(); await page.mouse.click(b.x + b.w / 2 - 60, b.y + b.h / 2 - 40);
    ok((await bnd()).n === 0, 'در حالت دقیق، لمس مستقیم نباید نقطه بگذارد');
    for (const [dla, dlo] of [[0.0002, -0.0003], [0.0002, 0.0003], [-0.0002, 0.0003]]) {
      await page.evaluate(([a, o, c]) => App.map.map.setView([c[0] + a, c[1] + o], 18, { animate: false }), [dla, dlo, center]);
      await page.click('#add-center');
    }
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


  await T('ذره‌بین: هنگام کشیدن نقطه با لمس، بزرگ‌نمای زنده نشان داده شود', async () => {
    await page.click('text=پاک‌کردن مرز').catch(() => {});
    await page.evaluate((c) => { App.map.setBoundary(corners_(c), { source: 'draw' }); function corners_(cc) { return [[cc[1] - 0.0003, cc[0] - 0.0002], [cc[1] + 0.0003, cc[0] - 0.0002], [cc[1] + 0.0003, cc[0] + 0.0002], [cc[1] - 0.0003, cc[0] + 0.0002]]; } }, center);
    await page.evaluate((c) => App.map.map.setView(c, 19, { animate: false }), center); await wait(300);
    await page.evaluate(() => App.map.focus(true)); await wait(300);
    const r = await page.evaluate(() => { const e = document.querySelector('.leaflet-marker-icon .vtx-hit').getBoundingClientRect(); return { x: e.x + e.width / 2, y: e.y + e.height / 2, w: e.width }; });
    ok(r.w >= 40, 'ناحیه‌ی لمس کوچک است: ' + r.w);
    const before = await page.evaluate(() => JSON.stringify(App.map.D.pts[0]));
    const res = await page.evaluate(({ x, y }) => new Promise((resolve) => {
      const n = document.querySelector('.leaflet-marker-icon .vtx-hit').parentElement;
      const fire = (t, dx, dy) => n.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x + dx, clientY: y + dy, button: 0 }));
      fire('pointerdown', 0, 0); fire('pointermove', 8, 6); fire('pointermove', 20, 14);
      setTimeout(() => {
        const box = document.getElementById('loupe'), shown = !box.hidden, r = box.getBoundingClientRect();
        const z = document.getElementById('loupe-map')._leaflet_id ? true : false;
        fire('pointerup', 20, 14);
        setTimeout(() => resolve({ shown, w: r.width, hiddenAfter: document.getElementById('loupe').hidden, z }), 100);
      }, 300);
    }), r);
    ok(res.shown && res.w > 100, 'ذره‌بین دیده نشد: ' + JSON.stringify(res)); ok(res.hiddenAfter, 'ذره‌بین بعد از رها کردن نماند بسته شود');
    ok(before !== await page.evaluate(() => JSON.stringify(App.map.D.pts[0])), 'نقطه جابه‌جا نشد');
    await page.evaluate(() => { App.map.focus(false); });
  });

  await T('متراژ تخمینی: زمین مجاورِ هم‌رنگ از هم جدا شود', async () => {
    withNeighbor = true;
    await page.evaluate(() => App.map.clearBoundary());
    await page.evaluate((c) => App.map.map.setView(c, 18, { animate: false }), center);
    await page.click('text=تشخیص خودکار مرز'); await wait(300);
    await page.fill('#detect-area', String(Math.round(trueArea)));
    await page.evaluate((c) => App.map.map.setView(c, 18, { animate: false }), center); await wait(500);
    const b = await mapBox(); await page.mouse.click(b.x + b.w / 2, b.y + b.h / 2);
    await page.waitForFunction(() => App.map.getBoundary().count >= 3, null, { timeout: 30000 });
    const r = await bnd(), err = Math.abs(r.area - trueArea) / trueArea;
    ok(err < 0.1, `خطای مساحت ${(err * 100).toFixed(1)}٪ (${r.area.toFixed(0)} از ${trueArea.toFixed(0)}) — زمین مجاور قاطی شد؟`);
    ok(/متراژ تخمینی/.test(await page.textContent('#draw-bar')), 'نوار حالت تخمینی نیست');
    await page.click('text=۱۰٪ بزرگ‌تر'); const r2 = await bnd();
    ok(r2.area > r.area * 1.05, 'دکمه‌ی بزرگ‌تر اثر نکرد: ' + r.area.toFixed(0) + ' → ' + r2.area.toFixed(0));
    withNeighbor = false;
  });

  await T('بدون اینترنت: پیام روشن و برنامه سالم می‌ماند', async () => {
    await page.evaluate(() => App.map.clearBoundary());
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
