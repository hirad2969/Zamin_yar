/* ساخت js/seed.js: فهرست پیش‌فرض زمین‌ها و ارزش‌ها (برای نسخه‌ی وب/اندروید وقتی برنامه خالی باز می‌شود)
   اجرا: node tools/build-seed.js   — ورودی: tools/seed-source.json */
const fs = require('fs'), path = require('path');
const C = require('../core.js');
const rows = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed-source.json'), 'utf8'));
const st = C.newState();
const estP = C.addEstate(st, 'اموال پدری'), estD = C.addEstate(st, 'اموال دره گرمی');
const bad = [];
rows.forEach(r => {
  const attrs = { residential: r.residential || 'unknown', agri: r.agri || 'none', farmType: r.farmType || 'irrigated', urbanUse: 'residential' };
  const p = C.newParcel({ name: r.name, scope: r.scope, estateId: r.estate === 'پدری' ? estP.id : estD.id, attrs, grade: r.grade, gradeSource: 'manual', special: !!r.special, featuresReviewed: true, priceMode: 'frozen', pricing: { override: r.price, userPrice: null } });
  if (r.coords) { const v = C.validateRing(r.coords.map(c => [c[0], c[1]])); if (v.valid) { p.geometry = { ring: v.ring, source: 'seed', meta: null }; p.areaComputed = v.area; } }
  p.areaOverride = r.total / r.price;                 // مبنا: ارزش کل ثبت‌شده‌ی شما دقیقاً حفظ می‌شود
  C.addParcel(st, p);
  if (p.valuation.total !== r.total) bad.push(r.name + ': ' + p.valuation.total + ' ≠ ' + r.total);
  if (p.valuation.status !== 'قطعی') bad.push(r.name + ': وضعیت ' + p.valuation.status);
});
if (bad.length) { console.error('ناهمخوانی:\n' + bad.join('\n')); process.exit(1); }
const names = ['مصطفی', 'اسفندیار', 'امیر', 'مهدی (و شرکا)'];
const P = names.map(n => C.addPerson(st, n, 1));
[[8, 8, 1, 4], [1, 1, 1, 4]].forEach((ws, i) => P.forEach((p, j) => C.setEstateWeight(st, i === 0 ? estD.id : estP.id, p.id, String(ws[j]))));
const sc = C.createCase(st, 'تقسیم نهایی همه‌ی زمین‌ها', st.parcels.map(p => p.id), P.map(p => p.id));
C.sectionsFromEstates(st, sc);
st.log = [{ at: C.nowIso(), msg: 'فهرست پیش‌فرض زمین‌ها بارگذاری شد' }];
fs.writeFileSync(path.join(__dirname, '..', 'js', 'seed.js'), '/* فهرست پیش‌فرض زمین‌ها (ساخته‌شده با tools/build-seed.js) */\nwindow.ZY_SEED = ' + JSON.stringify(st) + ';\n');
const ev = C.evaluateScenario(st, sc);
console.log('زمین:', st.parcels.length, ' ارزش کل:', ev.pool);
ev.results.forEach(r => console.log(r.person.name, r.entitledPct + '٪', Math.round(r.entitledExact)));
console.log('بدون خطا:', ev.errors.length === 0 ? 'بله' : ev.errors.join(' | '));
