/* کنترل نسخه‌ی وب: باز شدن با فهرست کامل ۵۸ زمین، صفحه‌ی تقسیم، تقسیم خودکار، بدون خطای اسکریپت */
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 390, height: 800 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('http://localhost:8765/index.html'); await pg.waitForTimeout(800);
  const n = await pg.evaluate(() => App.S.parcels.length); const ok = [];
  const t = (name, c) => { ok.push(c); console.log((c ? '✔ ' : '✘ ') + name); };
  t('باز شدن با ۵۸ زمین', n === 58);
  await pg.evaluate(() => App.tab('people')); await pg.waitForTimeout(300);
  t('کارت‌های ۴ نفر', (await pg.$$('#sum-table .pcard')).length === 4);
  t('۵۸ ردیف زمین', (await pg.$$('#pick-list .prow')).length === 58);
  t('بدون سرریز افقی', await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
  
  await pg.evaluate(() => { document.getElementById('auto-mode').value = 'compensate'; document.getElementById('auto-mode').dispatchEvent(new Event('change')); });
  await pg.click('#auto-run'); await pg.waitForSelector('#auto-table');
  await pg.click('#auto-apply'); await pg.waitForTimeout(200);
  const rem = await pg.evaluate(() => App.C.divisionLive(App.S).people.map(x => Number(x.remaining.n) / Number(x.remaining.d)));
  console.log('مانده‌ها (میلیون):', rem.map(v => Math.round(v / 1e6)).join(' '));
  t('پس از جبران، همه‌ی مانده‌ها زیر ۵۰ میلیون', rem.every(v => Math.abs(v) < 5e7));
  t('خطای اسکریپت ندارد', errs.length === 0); if (errs.length) console.log(errs);
  // حالت شریک از طریق پیوند
  const pid = await pg.evaluate(() => App.S.persons[2].id);
  const pp = await b.newPage({ viewport: { width: 390, height: 800 } }); const perrs = []; pp.on('pageerror', e => perrs.push(e.message));
  await pp.goto('http://localhost:8765/index.html?role=partner&me=' + encodeURIComponent(pid)); await pp.waitForTimeout(900);
  t('شریک: فقط تب تقسیم دیده می‌شود', (await pp.$$eval('#tabs button', bs => bs.filter(x => x.offsetParent).length)) === 1);
  t('شریک: ۵۸ زمین از نسخه‌ی منتشرشده', (await pp.evaluate(() => App.S.parcels.length)) === 58);
  t('شریک: فیلتر و تقسیم خودکار ندارد', (await pp.$('#pool-box')) === null && (await pp.$('#auto-box')) === null);
  t('شریک: ضرایب قفل', await pp.$$eval('#cat-table input', is => is.length > 0 && is.every(i => i.disabled)));
  t('شریک: ذخیره‌ی جدا از مدیر', await pp.evaluate(() => !!localStorage.getItem('zamin-yar-state-v1-partner')));
  t('شریک: بدون خطای اسکریپت', perrs.length === 0); if (perrs.length) console.log(perrs);
  await b.close(); process.exit(ok.every(Boolean) ? 0 : 1);
})();
