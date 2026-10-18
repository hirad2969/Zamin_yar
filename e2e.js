/* آزمون سرتاسری مرورگر (Playwright): نقشه، ورود مختصات، ثبت، ذخیره/بازیابی، قیمت‌گذاری */
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const proj4 = require('proj4'); proj4.defs('EPSG:32639', '+proj=utm +zone=39 +datum=WGS84 +units=m +no_defs');
const URL = process.env.URL || 'http://localhost:8765/index.html';
const out = []; let fails = 0;
const T = async (name, fn) => { try { await fn(); out.push('✔ ' + name); } catch (e) { fails++; out.push('✘ ' + name + ' — ' + e.message.split('\n')[0]); } };
const ok = (c, m) => { if (!c) throw new Error(m || 'شرط برقرار نیست'); };
const near = (a, b, t, m) => { if (!isFinite(a) || Math.abs(a - b) > t) throw new Error((m || '') + ` انتظار ${b}±${t} ولی ${a}`); };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] }).catch(() => chromium.launch({ args: ['--no-sandbox'] }));
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 }, locale: 'fa-IR' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push('console: ' + m.text()); });
  // شبکه‌ی خارجی بسته است ⇒ کاشی‌ها شکست می‌خورند (حالت «نقشه در دسترس نیست»)
  await page.route(/^https?:\/\/(?!localhost)/, r => r.abort());
  await page.goto(URL);
  await page.waitForSelector('#form-root .sec');

  const sqUTM = [[500000, 3600000], [500100, 3600000], [500100, 3600100], [500000, 3600100]];
  const sqLL = sqUTM.map(p => proj4('EPSG:32639', 'EPSG:4326', p));
  const csv = 'lon,lat\n' + sqLL.map(p => p[0].toFixed(8) + ',' + p[1].toFixed(8)).join('\n');

  await T('بارگذاری برنامه: فارسی، راست‌چین، بدون خطای اسکریپت', async () => {
    ok(await page.evaluate(() => document.documentElement.dir === 'rtl' && document.documentElement.lang === 'fa'));
    ok(await page.evaluate(() => !!window.App && !!App.map.map && document.querySelectorAll('.leaflet-container').length === 1));
    ok(errors.length === 0, errors.join(' | '));
  });
  await T('نقشه‌ی غیرقابل‌دسترس ⇒ هشدار شفاف نمایش داده شود', async () => {
    await page.waitForFunction(() => !document.getElementById('map-banner').hidden, null, { timeout: 15000 });
    ok((await page.textContent('#map-banner')).includes('بارگذاری نشد'));
  });
  await T('جست‌وجوی مختصات: نقشه به محل برود', async () => {
    await page.fill('#search-q', '۳۲٫۵۳۷، ۵۱٫۰۰۰');
    await page.click('#search-form button');
    await page.waitForTimeout(400);
    const c = await page.evaluate(() => { const c = App.map.map.getCenter(); return [c.lat, c.lng, App.map.map.getZoom()]; });
    near(c[0], 32.537, 0.01); near(c[1], 51.0, 0.01); ok(c[2] >= 16);
  });
  await T('جست‌وجوی نام بدون اینترنت ⇒ پیام خطای شفاف، نه نتیجه‌ی ساختگی', async () => {
    await page.fill('#search-q', 'روستای نمونه');
    await page.click('#search-form button');
    await page.waitForFunction(() => /در دسترس نیست/.test(document.getElementById('search-results').textContent), null, { timeout: 15000 });
  });

  /* ---- آزمون ۴: مختصات معتبر ---- */
  await T('آزمون ۴: ورود CSV معتبر ⇒ پیش‌نمایش با تعداد نقاط، مساحت، اعتبار و سیستم مختصات', async () => {
    await page.click('text=ورود مختصات آماده');
    await page.fill('#imp-text', csv);
    await page.click('text=تحلیل متن');
    await page.waitForSelector('#imp-result table');
    const t = await page.textContent('#imp-result');
    ok(t.includes('۴') && t.includes('معتبر') && t.includes('WGS84'), t);
    ok(/۱۰٬?۰۰۸/.test(t), 'مساحت: ' + t);
    // پیش‌نمایش روی نقشه است و بر محل درست
    const prev = await page.evaluate(() => { let b = null; App.map.map.eachLayer(l => { if (l instanceof L.Polygon && l.options.color === '#e65100') b = l.getBounds().getCenter(); }); return b && [b.lat, b.lng]; });
    ok(prev, 'چندضلعی پیش‌نمایش پیدا نشد');
    near(prev[0], (sqLL[0][1] + sqLL[2][1]) / 2, 1e-4); near(prev[1], (sqLL[0][0] + sqLL[2][0]) / 2, 1e-4);
    await page.click('text=تأیید و استفاده به‌عنوان مرز زمین');
    const b = await page.evaluate(() => App.map.getBoundary());
    ok(b.valid && b.count === 4 && Math.abs(b.ring[0][0] - 51) < 1e-7, JSON.stringify(b).slice(0, 200));
    const c = await page.evaluate(() => { const c = App.map.map.getBounds().getCenter(); return [c.lat, c.lng]; });
    near(c[0], sqLL[0][1], 0.01); near(c[1], sqLL[0][0], 0.01);
  });

  /* ---- ثبت زمین (آزمون ۱: ۱۰۰۰۰ م² × ۱۵۰۰۰۰) با قیمت دستی ---- */
  await T('آزمون ۱ در رابط: اطراف روستا، آبی، درجه ۱ ویژه ⇒ قیمت ۱۵۰٬۰۰۰ و ارزش ≈ مساحت × قیمت', async () => {
    await page.click('.choice:has-text("اطراف روستا")');
    await page.selectOption('#form-root select >> nth=1', 'grade1'); // نوع=آبی (اول)، درجه (دوم)
    await page.click('.choice:has-text("ویژه")');
    const sum = await page.textContent('#f-sum');
    ok(sum.includes('۱۵۰٬۰۰۰'), sum);
    const v = await page.evaluate(() => { const p = App.form.cur; return C = null; }).catch(() => null);
    await page.fill('#f-name', 'زمین آزمون ۱');
    await page.click('text=ثبت زمین >> nth=-1');
    const p = await page.evaluate(() => App.S.parcels[0]);
    ok(p && p.valuation.pricePerM2 === 150000, JSON.stringify(p && p.valuation));
    near(p.valuation.total, p.valuation.area * 150000, 1);
    ok(p.geometry.ring.length === 4 && p.gradeReason && p.specialReason, 'علت درجه و ویژه ذخیره نشد');
  });

  /* ---- آزمون ۵: نامعتبر ---- */
  await T('آزمون ۵: فایل خودمتقاطع (پاپیونی) ⇒ خطا و دکمه‌ی تأیید غیرفعال', async () => {
    await page.click('.btn:has-text("＋ زمین جدید")');
    await page.click('text=ورود مختصات آماده');
    await page.fill('#imp-text', 'lon,lat\n51.0,32.5\n51.001,32.501\n51.001,32.5\n51.0,32.501');
    await page.click('text=تحلیل متن');
    await page.waitForSelector('#imp-result .box.err');
    const t = await page.textContent('#imp-result');
    ok(t.includes('نامعتبر') && t.includes('قطع'), t);
    ok(await page.isDisabled('text=تأیید و استفاده به‌عنوان مرز زمین'));
    ok(await page.evaluate(() => App.map.getBoundary().count === 0), 'هندسه‌ی نامعتبر نباید ثبت شود');
  });
  await T('آزمون ۵: مقدار غیرعددی ⇒ خطا با شماره‌ی ردیف', async () => {
    await page.fill('#imp-text', 'lon,lat\n51.0,32.5\nabc,32.5\n51.1,32.6');
    await page.click('text=تحلیل متن');
    await page.waitForSelector('#imp-result .box.err');
    ok((await page.textContent('#imp-result')).includes('ردیف'));
  });
  await T('UTM با منطقه‌ی نامشخص ⇒ سؤال از کاربر، سپس نمایش در محل درست', async () => {
    await page.fill('#imp-text', 'x,y\n' + sqUTM.map(p => p.join(',')).join('\n'));
    await page.click('text=تحلیل متن');
    await page.waitForSelector('#imp-result .box.warn');
    ok((await page.textContent('#imp-result')).includes('سیستم مختصات'));
    await page.selectOption('#imp-result select >> nth=-1', 'EPSG:32639');
    await page.waitForSelector('#imp-result table');
    const t = await page.textContent('#imp-result'); ok(t.includes('معتبر') && /۱۰٬?۰۰۸/.test(t), t);
    await page.click('text=تأیید و استفاده به‌عنوان مرز زمین');
    near(await page.evaluate(() => App.map.getBoundary().ring[0][0]), sqLL[0][0], 1e-6);
  });

  /* ---- آزمون ۶: مسکونی نامشخص ---- */
  await T('آزمون ۶: داخل روستا + مسکونی نامشخص ⇒ فرض مسکونی نشود، نیازمند تعیین دستی/موقت', async () => {
    await page.click('.choice:has-text("داخل محدوده روستا")');
    const t = await page.textContent('#f-sugg'); ok(t.includes('نیازمند تعیین دستی'), t);
    const s = await page.textContent('#f-sum'); ok(!s.includes('قطعی') || s.includes('ناقص') || s.includes('موقت'), s);
    // تأیید مسکونی و آبی ⇒ پیشنهاد درجه یک
    await page.selectOption('#form-root select >> nth=0', 'confirmed');
    await page.selectOption('#form-root select >> nth=1', 'irrigated');
    const t2 = await page.textContent('#f-sugg'); ok(t2.includes('درجه یک'), t2);
  });

  /* ---- آزمون ۸: ترسیم با ماوس، ذخیره، بستن و بازکردن ---- */
  await T('آزمون ۸: ترسیم با کلیک روی نقشه، مساحت زنده، ذخیره', async () => {
    await page.click('.btn:has-text("＋ زمین جدید")');
    page.once('dialog', d => d.accept());
    await page.evaluate(() => App.map.map.setView([32.537, 51.0], 17));
    await page.waitForTimeout(300);
    await page.click('text=ترسیم مرز روی نقشه');
    const box = await page.locator('#map').boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const pts = [[-80, -60], [90, -50], [100, 70], [-70, 80]];
    for (const [dx, dy] of pts) { await page.mouse.click(cx + dx, cy + dy); await page.waitForTimeout(80); }
    const live = await page.textContent('#draw-live'); ok(live.includes('۴') && live.includes('مساحت'), live);
    await page.click('#draw-bar >> text=پایان ترسیم');
    // جابه‌جایی یک رأس با ماوس
    const before = await page.evaluate(() => JSON.stringify(App.map.getBoundary().ring));
    await page.mouse.move(cx + 90, cy - 50); await page.mouse.down(); await page.mouse.move(cx + 120, cy - 70, { steps: 5 }); await page.mouse.up();
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => JSON.stringify(App.map.getBoundary().ring));
    ok(before !== after, 'رأس با ماوس جابه‌جا نشد');
    ok(await page.evaluate(() => document.body.classList.contains('map-focus')), 'ترسیم باید تمام‌صفحه باشد');
    await page.click('#focus-toggle'); // بازگشت به فرم
    ok(await page.evaluate(() => !document.body.classList.contains('map-focus')), 'بازگشت به فرم کار نکرد');
    await page.click('.choice:has-text("اطراف روستا")');
    await page.selectOption('#form-root select >> nth=1', 'grade2');
    await page.fill('#f-name', 'ترسیمی');
    await page.click('text=ثبت زمین >> nth=-1');
    const p = await page.evaluate(() => App.S.parcels.find(x => x.name === 'ترسیمی'));
    ok(p && p.geometry.ring.length === 4 && p.valuation.area > 1000, JSON.stringify(p && p.valuation));
    global.drawn = p;
  });
  await T('آزمون ۸: بستن و بازکردن دوباره‌ی برنامه ⇒ هندسه و اطلاعات دقیقاً بازیابی شود', async () => {
    const ring = JSON.stringify(global.drawn.geometry.ring);
    await page.close();
    const p2 = await ctx.newPage(); p2.on('pageerror', e => errors.push('pageerror: ' + e.message));
    await p2.route(/^https?:\/\/(?!localhost)/, r => r.abort());
    await p2.goto(URL); await p2.waitForSelector('#form-root .sec');
    const r = await p2.evaluate(() => { const p = App.S.parcels.find(x => x.name === 'ترسیمی'); App.form.open(p.id, true); return { ring: JSON.stringify(p.geometry.ring), shown: JSON.stringify(App.map.getBoundary().ring), area: p.valuation.area, shownArea: App.map.getBoundary().area, grade: App.form.cur.grade, total: p.valuation.total }; });
    ok(r.ring === ring, 'هندسه‌ی ذخیره‌شده تغییر کرده');
    ok(r.shown === ring, 'مرز روی نقشه با ذخیره‌شده یکی نیست');
    near(r.shownArea, r.area, 1e-6); ok(r.grade === 'grade2');
    // زمین ذخیره‌شده روی نقشه دیده می‌شود
    await p2.evaluate(() => App.form.newParcel(true));
    ok(await p2.evaluate(() => { let n = 0; App.map.map.eachLayer(l => { if (l instanceof L.Polygon && l.options.weight === 3 && l.options.fillOpacity === 0.18) n++; }); return n >= 2; }), 'زمین‌های ثبت‌شده روی نقشه نیستند');
    global.page2 = p2;
  });

  /* ---- آزمون ۷: تغییر قیمت درجه ---- */
  await T('آزمون ۷: تغییر قیمت درجه و حفظ قیمت زمین‌های قدیمی بدون اجازه', async () => {
    const p2 = global.page2;
    await p2.click('#tabs >> text=تنظیمات ارزش‌گذاری');
    await p2.click('.tabs2 >> text=اطراف روستا');
    // درجه یک ویژه: ردیف اول جدول، ستون قیمت ثابت
    await p2.fill('table.t tbody tr:first-child td:nth-child(2) input', '200000');
    await p2.click('text=ذخیره‌ی تنظیمات');
    await p2.click('.modal .btn:has-text("ثبت")');
    const r = await p2.evaluate(() => ({ v: App.S.settings.version, prices: App.S.parcels.map(p => [p.name, p.valuation.pricePerM2, p.valuation.settingsVersion]) }));
    ok(r.v === 2, 'نسخه‌ی تنظیمات 2 نشد: ' + JSON.stringify(r));
    const a = r.prices.find(x => x[0] === 'زمین آزمون ۱'); ok(a[1] === 150000 && a[2] === 1, 'قیمت قدیمی بدون اجازه تغییر کرد: ' + JSON.stringify(a));
    // زمین جدید با قیمت جدید
    const nv = await p2.evaluate(() => { const C = App.C; const p = C.newParcel({ scope: 'rural_outside', grade: 'grade1', special: true, areaComputed: 100, attrs: { farmType: 'irrigated' } }); return C.valuate(p, App.S.settings).price; });
    ok(nv === 200000, 'قیمت جدید اعمال نشد: ' + nv);
    // در فرم، زمین قدیمی هشدار می‌دهد ولی قیمتش را عوض نمی‌کند
    await p2.click('#tabs >> text=زمین‌ها');
    ok((await p2.textContent('#parcels-root')).includes('قدیمی'));
    await p2.evaluate(() => { App.tab('map'); App.form.open(App.S.parcels.find(x => x.name === 'زمین آزمون ۱').id); });
    const s = await p2.textContent('#f-sum'); ok(s.includes('۱۵۰٬۰۰۰') && s.includes('محاسبه‌ی مجدد'), s.slice(0, 300));
    // با اجازه‌ی صریح، محاسبه‌ی مجدد
    await p2.click('#f-recalc');
    ok((await p2.textContent('#f-sum')).includes('۲۰۰٬۰۰۰'));
    await p2.click('text=ذخیره‌ی تغییرات');
    ok(await p2.evaluate(() => App.S.parcels.find(x => x.name === 'زمین آزمون ۱').valuation.pricePerM2) === 200000);
  });

  /* ---- تقسیم ---- */
  await T('تقسیم: اشخاص و سناریو ⇒ اختلاف ارزش سهم و عکس قیمت‌های قدیمی', async () => {
    const p2 = global.page2;
    await p2.click('#tabs >> text=اشخاص و تقسیم');
    for (const n of ['علی', 'رضا']) { await p2.fill('#people-root input[placeholder="نام شخص"]', n); await p2.click('#people-root >> text=افزودن >> nth=0'); }
    await p2.fill('#people-root input[placeholder^="نام سناریو"]', 'تقسیم اول');
    await p2.click('text=ساخت سناریوی جدید از همه‌ی زمین‌ها');
    const r = await p2.evaluate(() => { const sc = App.S.scenarios[0]; return { v: sc.settingsVersion, n: Object.keys(sc.parcels).length }; });
    ok(r.v === 2 && r.n === 2, JSON.stringify(r));
    // همه‌ی زمین اول به علی
    const ids = await p2.evaluate(() => Object.keys(App.S.scenarios[0].parcels));
    await p2.evaluate(([a, b]) => { const sc = App.S.scenarios[0]; App.C.setAllocation(sc, a, App.S.persons[0].id, 1); App.C.setAllocation(sc, b, App.S.persons[1].id, 1); App.save(); }, ids);
    const ev = await p2.evaluate(() => { const ev = App.C.evaluateScenario(App.S, App.S.scenarios[0]); return { pool: ev.pool, un: ev.unallocated.length, r: ev.results.map(x => [x.person.name, x.entitled, x.received, x.diff]) }; });
    // دو زمین با ارزش‌های متفاوت به دو نفر با سهم برابر: اختلاف‌ها قرینه‌اند و مجموعشان صفر است
    ok(ev.un === 0 && ev.r[0][2] + ev.r[1][2] === ev.pool && Math.abs(ev.r[0][3] + ev.r[1][3]) <= 2 && ev.r[0][3] !== 0, JSON.stringify(ev));
  });

  await T('بدون خطای اسکریپت در کل جلسه', async () => { ok(errors.length === 0, errors.join(' | ')); });

  await page.screenshot({ path: '/tmp/e2e-1.png' }).catch(() => {});
  if (global.page2) await global.page2.screenshot({ path: '/tmp/e2e-2.png' }).catch(() => {});
  console.log(out.join('\n') + `\n\nموفق: ${out.length - fails}  ناموفق: ${fails}`);
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
