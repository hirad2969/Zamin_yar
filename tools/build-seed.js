/* ساخت js/seed.js: فهرست پیش‌فرض زمین‌ها و ارزش‌ها (برای نسخه‌ی وب/اندروید وقتی برنامه خالی باز می‌شود)
   اجرا: node tools/build-seed.js   — ورودی: tools/seed-source.json */
const fs = require('fs'), path = require('path');
const C = require('../core.js');
const rows = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed-source.json'), 'utf8'));
const st = C.newState();
const estD = C.addEstate(st, 'دره گرمی'), estP = C.addEstate(st, 'پدری'), estS = C.addEstate(st, 'محدوده سد');   // سد: بدون زمین؛ سهم‌بندی مثل پدری
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
[[8, 8, 1, 4], [1, 1, 1, 4], [1, 1, 1, 4]].forEach((ws, i) => P.forEach((p, j) => C.setEstateWeight(st, [estD, estP, estS][i].id, p.id, String(ws[j]))));
// سهم هر پسر از خانه‌ی شهر: ۳ میلیارد؛ از سهم مهدی (خریدار خانه) کم می‌شود؛ زمین‌های مهدی قابل خرید است
st.house = { amount: '3000000000', receivers: [P[0].id, P[1].id, P[2].id], payer: P[3].id };
st.adjust = {};
st.log = [{ at: C.nowIso(), msg: 'فهرست پیش‌فرض زمین‌ها بارگذاری شد' }];
fs.writeFileSync(path.join(__dirname, '..', 'js', 'seed.js'), '/* فهرست پیش‌فرض زمین‌ها (ساخته‌شده با tools/build-seed.js) */\nwindow.ZY_SEED = ' + JSON.stringify(st) + ';\n');
const d = C.divisionLive(st);
console.log('زمین:', st.parcels.length, ' ارزش کل:', d.total.n / d.total.d);
d.people.forEach(x => console.log(x.person.name, 'حق', Math.round(Number(x.entitlement.n) / Number(x.entitlement.d)), 'اعتبار', Math.round(Number(x.credit.n) / Number(x.credit.d))));
console.log('خطا:', d.errors.join(' | ') || 'ندارد', '| هشدار:', d.warns.join(' | ') || 'ندارد');
