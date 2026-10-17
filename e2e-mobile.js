/* آزمون موبایل: GPS شبیه‌سازی‌شده، دقت، رد خطاها، PWA آفلاین، چیدمان گوشی */
const { chromium, devices } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const URL = process.env.URL || 'http://localhost:8765/index.html';
const out = []; let fails = 0;
const T = async (n, f) => { try { await f(); out.push('✔ ' + n); } catch (e) { fails++; out.push('✘ ' + n + ' — ' + e.message.split('\n')[0]); } };
const ok = (c, m) => { if (!c) throw new Error(m || 'شرط برقرار نیست'); };
const near = (a, b, t, m) => { if (!isFinite(a) || Math.abs(a - b) > t) throw new Error((m || '') + ` انتظار ${b}±${t} ولی ${a}`); };
const wait = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const dev = devices['Pixel 7'];
  const ctx = await browser.newContext({ ...dev, locale: 'fa-IR', geolocation: { latitude: 35, longitude: 51, accuracy: 5 }, permissions: ['geolocation'] });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
  await page.route(/^https?:\/\/(?!localhost)/, r => r.abort());
  await page.goto(URL); await page.waitForSelector('#form-root .sec');

  // مربع زمینیِ ۱۰۰×۱۰۰ متر: درجه‌ی عرض ≈ 110.6 km، طول در عرض ۳۵° ≈ 91.2 km
  const lat0 = 35, lon0 = 51, dLat = 100 / 110950, dLon = 100 / (111320 * Math.cos(lat0 * Math.PI / 180));
  const corners = [[lon0, lat0], [lon0 + dLon, lat0], [lon0 + dLon, lat0 + dLat], [lon0, lat0 + dLat]];
  const trueArea = await page.evaluate((c) => App.C.areaM2(c), corners);
  const setPos = (lon, lat, acc) => ctx.setGeolocation({ longitude: lon, latitude: lat, accuracy: acc });

  await T('چیدمان گوشی: بدون اسکرول افقی، نقشه بالا و فرم پایین', async () => {
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, mapTop: document.getElementById('mapwrap').getBoundingClientRect().top, sideTop: document.getElementById('side').getBoundingClientRect().top }));
    ok(m.sw <= m.iw + 1, 'اسکرول افقی: ' + JSON.stringify(m)); ok(m.mapTop < m.sideTop, JSON.stringify(m));
    await page.screenshot({ path: '/tmp/m1.png' });
  });

  await T('GPS گوشه‌به‌گوشه: میانگین‌گیری نمونه‌های نویزی و مساحت درست', async () => {
    await page.click('text=اندازه‌گیری با GPS');
    await page.waitForSelector('#gps-stat');
    await page.evaluate(() => { App.gps.st.sampleSec = 1.6; });
    await page.click('#gps-m-corner');
    await setPos(corners[0][0], corners[0][1], 4); await wait(600);
    const st1 = await page.textContent('#gps-stat'); ok(st1.includes('±') && st1.includes('عالی'), st1);
    const jit = 3 / 111320; // ≈ ۳ متر
    for (let i = 0; i < 4; i++) {
      const [lo, la] = corners[i];
      await setPos(lo, la, 4); await wait(450);
      await page.click('text=＋ ثبت گوشه');
      for (const [dx, dy] of [[jit, 0], [-jit, 0], [0, jit], [0, -jit]]) { await setPos(lo + dx, la + dy, 5); await wait(250); }
      await page.waitForFunction((n) => App.gps.st && App.gps.st.pts.length === n, i + 1, { timeout: 6000 });
    }
    const pts = await page.evaluate(() => App.gps.st.pts);
    const err = await page.evaluate(([p, c]) => p.map((q, i) => App.gps.dist(q, c[i])), [pts, corners]);
    ok(Math.max(...err) < 2, 'خطای گوشه‌ها بعد از میانگین‌گیری: ' + err.map(x => x.toFixed(2)).join(','));
    const live = await page.textContent('#gps-live'); ok(live.includes('مساحت') && live.includes('محیط'), live);
    await page.click('text=پایان و ساخت مرز');
    const b = await page.evaluate(() => { const b = App.map.getBoundary(); return { valid: b.valid, count: b.count, area: b.area, source: b.source, meta: b.meta }; });
    ok(b.valid && b.count === 4 && b.source === 'gps' && b.meta.method === 'gps-corner', JSON.stringify(b));
    near(b.area, trueArea, trueArea * 0.01, 'مساحت');
    ok(await page.evaluate(() => document.getElementById('gps-panel').hidden), 'پنل باید بسته شود');
  });

  await T('GPS مسیر خودکار: دور زدن، نقطه با دقت بد رد شود، سادەسازی، مساحت درست', async () => {
    await page.click('.btn:has-text("＋ زمین جدید")');
    await page.evaluate(() => { App.form.cur && (App.form.dirty = false); });
    await page.click('text=اندازه‌گیری با GPS');
    await page.waitForSelector('#gps-m-auto'); await page.click('#gps-m-auto');
    await setPos(corners[0][0], corners[0][1], 4); await wait(500);
    await page.click('text=▶ شروع مسیر');
    // گشت دور مربع با گام ≈ ۵ متر + نویز ≈ ۰٫۶ متر
    const path = []; const N = 20;
    for (let e = 0; e < 4; e++) { const a = corners[e], b = corners[(e + 1) % 4]; for (let i = 0; i < N; i++) path.push([a[0] + (b[0] - a[0]) * i / N, a[1] + (b[1] - a[1]) * i / N]); }
    let k = 0;
    for (const [lo, la] of path) {
      const nz = 0.6 / 111320 * (((k++ * 7919) % 11) / 5 - 1);
      await setPos(lo + nz, la - nz, 4); await wait(70);
      if (k === 30) { await setPos(lo + 0.01, la + 0.01, 60); await wait(120); } // پرتِ بسیار بد: باید رد شود
    }
    const raw = await page.evaluate(() => App.gps.st.pts.length);
    ok(raw >= 60 && raw <= 85, 'تعداد نقطه‌ی خام: ' + raw);
    ok(await page.evaluate(() => App.gps.st.pts.every(p => Math.abs(p[0] - 51) < 0.002 && Math.abs(p[1] - 35) < 0.002)), 'نقطه‌ی با دقت بد (۶۰ متر) ثبت شده است');
    await page.click('text=پایان و ساخت مرز');
    const b = await page.evaluate(() => { const b = App.map.getBoundary(); return { valid: b.valid, count: b.count, area: b.area, meta: b.meta }; });
    ok(b.valid && b.count < raw && b.count >= 4 && b.count <= 12, 'پس از سادەسازی: ' + JSON.stringify(b));
    near(b.area, trueArea, trueArea * 0.03, 'مساحت مسیر خودکار');
  });

  await T('ذخیره‌ی زمینِ اندازه‌گیری‌شده با GPS و بازیابی علت/منبع', async () => {
    await page.click('.choice:has-text("اطراف روستا")');
    await page.selectOption('#form-root select >> nth=1', 'grade1');
    await page.click('text=ثبت زمین >> nth=-1');
    const p = await page.evaluate(() => App.S.parcels[0]);
    ok(p && p.geometry.source === 'gps' && p.geometry.meta.method === 'gps-auto' && p.valuation.total > 0, JSON.stringify(p && p.geometry && p.geometry.meta));
  });

  await T('مرز خودمتقاطع از GPS (دور اشتباه) ⇒ ساخت مرز رد شود', async () => {
    await page.click('.btn:has-text("＋ زمین جدید")');
    await page.click('text=اندازه‌گیری با GPS'); await page.waitForSelector('#gps-m-corner');
    await page.evaluate(() => { App.gps.st.sampleSec = 1; });
    const bow = [corners[0], corners[2], corners[1], corners[3]];
    for (let i = 0; i < 4; i++) { await setPos(bow[i][0], bow[i][1], 4); await wait(400); await page.click('text=＋ ثبت گوشه'); await page.waitForFunction((n) => App.gps.st.pts.length === n, i + 1, { timeout: 5000 }); }
    await page.click('text=پایان و ساخت مرز');
    await page.waitForSelector('.modal');
    ok((await page.textContent('.modal')).includes('معتبر نیست'));
    ok(await page.evaluate(() => App.map.getBoundary().count === 0), 'مرز نامعتبر نباید ثبت شود');
    await page.click('.modal .btn'); await page.click('#gps-panel >> text=بستن');
  });

  /* ---- PWA ---- */
  await T('PWA: مانیفست و سرویس‌ورکر، و بازشدن بدون اینترنت', async () => {
    const p2 = await ctx.newPage(); await p2.route(/^https?:\/\/(?!localhost)/, r => r.abort());
    await p2.goto(URL); await p2.waitForSelector('#form-root .sec');
    await p2.waitForFunction(() => navigator.serviceWorker.ready.then(r => !!r.active), null, { timeout: 15000 });
    await p2.waitForFunction(async () => (await caches.keys()).includes('zy-v1') && (await (await caches.open('zy-v1')).keys()).length >= 20, null, { timeout: 15000 });
    const man = await p2.evaluate(async () => { const m = await (await fetch(document.querySelector('link[rel=manifest]').href)).json(); return m; });
    ok(man.display === 'standalone' && man.dir === 'rtl' && man.lang === 'fa' && man.icons.length >= 2);
    await ctx.setOffline(true);
    await p2.reload(); await p2.waitForSelector('#form-root .sec', { timeout: 10000 });
    ok(await p2.evaluate(() => !!window.App && !!App.gps && !!L), 'برنامه بدون اینترنت کامل بالا نیامد');
    ok(await p2.evaluate(() => App.S.parcels.length) >= 1, 'داده‌ها بدون اینترنت باز نشد');
    await ctx.setOffline(false); await p2.close();
  });

  /* ---- رد اجازه‌ی مکان ---- */
  await T('اجازه‌ی مکان داده نشود ⇒ پیام شفاف فارسی', async () => {
    const c2 = await browser.newContext({ ...dev, locale: 'fa-IR' }); const p3 = await c2.newPage();
    await p3.route(/^https?:\/\/(?!localhost)/, r => r.abort());
    await p3.goto(URL); await p3.waitForSelector('#form-root .sec');
    await p3.click('text=اندازه‌گیری با GPS');
    await p3.waitForFunction(() => /اجازه/.test(document.getElementById('gps-stat').textContent), null, { timeout: 8000 });
    ok(await p3.isDisabled('text=＋ ثبت گوشه'));
    await c2.close();
  });

  await T('بدون خطای اسکریپت', async () => ok(errs.length === 0, errs.join('|')));
  console.log(out.join('\n') + `\n\nموفق: ${out.length - fails}  ناموفق: ${fails}`);
  await browser.close(); process.exit(fails ? 1 : 0);
})();
