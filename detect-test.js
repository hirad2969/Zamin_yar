/* تست الگوریتم تشخیص مرز روی تصویر مصنوعی: node detect-test.js */
const D = require('./detect.js');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } }
let seedR = 12345; const rnd = () => (seedR = (seedR * 1664525 + 1013904223) >>> 0) / 4294967296;

function make(w, h, painter) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = painter(x, y), i = (y * w + x) * 4, n = (rnd() - 0.5) * 2;
    data[i] = c[0] + n * (c[3] || 6); data[i + 1] = c[1] + n * (c[3] || 6); data[i + 2] = c[2] + n * (c[3] || 6); data[i + 3] = 255;
  }
  return { data, width: w, height: h };
}
const GREEN = [70, 120, 50], BROWN = [150, 120, 80], ROAD = [190, 185, 175];
const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x < x1 && y >= y0 && y < y1;
const area = (r) => D.ringArea(r);

console.log('۱) مستطیل سبز روی زمینه‌ی خاکی');
{
  const img = make(512, 512, (x, y) => inRect(x, y, 150, 120, 350, 300) ? GREEN : BROWN);
  const det = D.prepare(img, { x: 250, y: 210 }); const r = det.auto();
  ok(r.ok, 'تشخیص موفق'); ok(!r.touchesEdge, 'به لبه نخورده');
  const truth = 200 * 180, a = area(r.ring);
  ok(Math.abs(a - truth) / truth < 0.04, 'مساحت درون ۴٪ حقیقت (' + a.toFixed(0) + ' از ' + truth + ')');
  ok(r.ring.length <= 12, 'تعداد رأس کم: ' + r.ring.length);
}
console.log('۲) زمین ناصاف (چندضلعی مورب)');
{
  const poly = [[100, 200], [260, 90], [420, 160], [380, 380], [180, 400]];
  const inside = (x, y) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
  const img = make(512, 512, (x, y) => inside(x, y) ? GREEN : BROWN);
  const r = D.prepare(img, { x: 260, y: 250 }).auto();
  let truth = 0; for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) if (inside(x, y)) truth++;
  const a = area(r.ring);
  ok(r.ok && Math.abs(a - truth) / truth < 0.05, 'مساحت درون ۵٪ (' + a.toFixed(0) + ' از ' + truth + ')');
}
console.log('۳) راه خاکی باریکِ متصل نباید نشتی بدهد');
{
  const img = make(512, 512, (x, y) => {
    if (inRect(x, y, 150, 150, 330, 330)) return GREEN;
    if (inRect(x, y, 330, 235, 512, 242)) return GREEN; // نوار سبز باریک متصل (نشتی احتمالی)
    return BROWN;
  });
  const r = D.prepare(img, { x: 240, y: 240 }).auto();
  const truth = 180 * 180, a = area(r.ring);
  ok(r.ok && a < truth * 1.1 && a > truth * 0.93, 'نشتی حذف شد (' + a.toFixed(0) + ' از ' + truth + ')');
}
console.log('۴) دو زمین هم‌رنگ با جاده‌ی روشن بین‌شان: فقط زمین مرکز');
{
  const img = make(512, 512, (x, y) => inRect(x, y, 100, 100, 250, 400) ? GREEN : inRect(x, y, 250, 100, 262, 400) ? ROAD : inRect(x, y, 262, 100, 420, 400) ? GREEN : BROWN);
  const r = D.prepare(img, { x: 170, y: 250 }).auto();
  const truth = 150 * 300, a = area(r.ring);
  ok(r.ok && Math.abs(a - truth) / truth < 0.05, 'فقط زمین چپ (' + a.toFixed(0) + ' از ' + truth + ')');
}
console.log('۵) زمینِ بافت‌دار (نویز زیاد) و حفره‌ی درخت');
{
  const img = make(512, 512, (x, y) => {
    if (Math.hypot(x - 260, y - 240) < 14) return [30, 70, 30, 4]; // درخت درون زمین
    return inRect(x, y, 120, 120, 400, 360) ? [70, 120, 50, 14] : [150, 120, 80, 10];
  });
  const r = D.prepare(img, { x: 200, y: 300 }).auto();
  const truth = 280 * 240, a = area(r.ring);
  ok(r.ok && Math.abs(a - truth) / truth < 0.06, 'درخت درونی پر شد (' + a.toFixed(0) + ' از ' + truth + ')');
}
console.log('۶) زمین بزرگ‌تر از پنجره: به لبه خورده گزارش شود');
{
  const img = make(512, 512, (x, y) => inRect(x, y, -10, 200, 700, 700) ? GREEN : BROWN);
  const r = D.prepare(img, { x: 250, y: 400 }).auto();
  ok(r.touchesEdge === true, 'touchesEdge=true');
}
console.log('۷) نقطه‌ی مرکز روی تصویر بی‌ساختار: نتیجه‌ی ناموفق یا لبه، بدون خطا');
{
  const img = make(256, 256, () => [100, 100, 100, 30]);
  let r; try { r = D.prepare(img, { x: 128, y: 128 }).auto(); ok(true, 'بدون استثنا'); } catch (e) { ok(false, 'استثنا: ' + e.message); }
}
console.log('۸) مختصات کاشی رفت‌وبرگشت');
{
  const [X, Y] = D.worldPx(51.67, 32.65, 18), [lng, lat] = D.lngLat(X, Y, 18);
  ok(Math.abs(lng - 51.67) < 1e-9 && Math.abs(lat - 32.65) < 1e-9, 'رفت‌وبرگشت دقیق');
  const [X2] = D.worldPx(51.67 + 0.001, 32.65, 18); const m = (X2 - X) * 0.507 * 1; // ~متر
  const real = 0.001 * 111320 * Math.cos(32.65 * Math.PI / 180);
  ok(Math.abs(m - real) / real < 0.02, 'مقیاس پیکسل≈0.507m (' + m.toFixed(1) + ' از ' + real.toFixed(1) + ')');
}

console.log('۹) دو زمین تقریباً هم‌رنگ (اختلاف کم) با متراژ تخمینی');
{
  const A1 = [70, 120, 50, 5], A2 = [75, 122, 54, 5];
  const img = make(512, 512, (x, y) => inRect(x, y, 100, 100, 260, 400) ? A1 : inRect(x, y, 260, 100, 420, 400) ? A2 : BROWN);
  const truth = 160 * 300;
  const r = D.prepare(img, { x: 180, y: 250 }).byArea(truth * 0.95); // کاربر ۵٪ کم تخمین زده
  const a = area(r.ring);
  ok(r.ok && Math.abs(a - truth) / truth < 0.08, 'مرز روی خط جداکننده‌ی کمرنگ (' + a.toFixed(0) + ' از ' + truth + ')');
  const xs = r.ring.map(p => p[0]); ok(Math.max.apply(null, xs) < 275 && Math.max.apply(null, xs) > 245, 'لبه‌ی راست نزدیک x=260: ' + Math.max.apply(null, xs).toFixed(0));
}
console.log('۱۰) دو زمین هم‌رنگ با خط کمرنگ باریک بین‌شان');
{
  const img = make(512, 512, (x, y) => inRect(x, y, 258, 100, 261, 400) ? [58, 108, 40, 5] : inRect(x, y, 100, 100, 420, 400) ? GREEN : BROWN);
  const truth = 158 * 300;
  const r = D.prepare(img, { x: 180, y: 250 }).byArea(truth);
  const a = area(r.ring);
  ok(r.ok && Math.abs(a - truth) / truth < 0.08, 'مرز روی خط کمرنگ (' + a.toFixed(0) + ' از ' + truth + ')');
}
console.log('۱۱) تخمین مساحت ۲۰٪ بیشتر از واقعیت: مرز نباید فاجعه شود');
{
  const img = make(512, 512, (x, y) => inRect(x, y, 150, 120, 350, 300) ? GREEN : BROWN);
  const truth = 200 * 180, r = D.prepare(img, { x: 250, y: 210 }).byArea(truth * 1.2), a = area(r.ring);
  ok(r.ok && a < truth * 1.4 && a > truth * 0.95, 'مساحت معقول (' + a.toFixed(0) + ' از ' + truth + ')');
}

console.log('\nنتیجه:', pass, 'موفق،', fail, 'ناموفق');
process.exit(fail ? 1 : 0);
