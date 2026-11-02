/* ساخت js/seed.js از آخرین فایل پروژه (tools/project-source.json): ۵۸ زمین با مرز، دارنده، دسته‌ها، خانه و اشخاص.
   سناریو/تاریخچه حذف شده؛ همه‌ی اعداد در برنامه زنده از «متراژ × قیمت» حساب می‌شود. اجرا: node tools/build-seed.js */
const fs = require('fs'), path = require('path');
const C = require('../core.js');
const st = JSON.parse(fs.readFileSync(path.join(__dirname, 'project-source.json'), 'utf8'));
st.log = [{ at: C.nowIso(), msg: 'فهرست پیش‌فرض زمین‌ها بارگذاری شد' }];
fs.writeFileSync(path.join(__dirname, '..', 'js', 'seed.js'), '/* فهرست پیش‌فرض زمین‌ها (ساخته‌شده با tools/build-seed.js) */\nwindow.ZY_SEED = ' + JSON.stringify(st) + ';\n');
const d = C.divisionLive(st);
const N = (f) => Number(f.n) / Number(f.d);
console.log('زمین:', st.parcels.length, ' ارزش کل:', N(d.total));
d.people.forEach(x => console.log(x.person.name, 'حق', Math.round(N(x.entitlement)), 'اعتبار', Math.round(N(x.credit)), 'زمین', Math.round(N(x.heldValue)), 'مانده', Math.round(x.remainingNum)));
console.log('خطا:', d.errors.join(' | ') || 'ندارد', '| هشدار:', d.warns.join(' | ') || 'ندارد');
