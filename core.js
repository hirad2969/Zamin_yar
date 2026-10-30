/* هسته‌ی زمین‌یار هوشمند — مستقل از DOM و قابل آزمون در Node
   شامل: هندسه و مساحت، سیستم مختصات، ورودی مختصات (متن/CSV/Excel/GeoJSON/KML)،
   موتور ارزش‌گذاری قابل تنظیم، تاریخچه‌ی قیمت، اشخاص و موتور تقسیم. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LandCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  let proj4 = (typeof self !== 'undefined' && self.proj4) || null;
  function setProj4(p) { proj4 = p; registerDefs(); }

  /* ---------------------------------------------------------------- */
  /* ابزارهای عمومی                                                    */
  /* ---------------------------------------------------------------- */
  const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
  const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
  function normDigits(s) {
    return String(s == null ? '' : s)
      .replace(/[۰-۹]/g, d => FA_DIGITS.indexOf(d))
      .replace(/[٠-٩]/g, d => AR_DIGITS.indexOf(d))
      .replace(/٫/g, '.').replace(/٬/g, '').replace(/−/g, '-');
  }
  function toNum(s) {
    if (typeof s === 'number') return s;
    const t = normDigits(s).trim().replace(/,/g, '');
    if (t === '' || !/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return NaN;
    return parseFloat(t);
  }
  const uid = (p) => (p || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const nowIso = () => new Date().toISOString();
  const clone = (o) => JSON.parse(JSON.stringify(o));

  /* ---------------------------------------------------------------- */
  /* کسر دقیق                                                          */
  /* سهم‌ها به‌صورت کسر صحیح (صورت/مخرج با BigInt) نگهداری می‌شوند تا      */
  /* جمع و تفریق آن‌ها هیچ خطای گردکردن نداشته باشد (مثلاً ۱/۸ + ۳/۸ = ۱/۲ */
  /* دقیقاً، و سه‌تا ۱/۳ دقیقاً ۱). گردکردن فقط هنگام نمایش انجام می‌شود.  */
  /* ---------------------------------------------------------------- */
  const BI = (x) => (typeof x === 'bigint' ? x : BigInt(x));
  function gcdBig(a, b) {
    a = a < 0n ? -a : a; b = b < 0n ? -b : b;
    while (b !== 0n) { const t = a % b; a = b; b = t; }
    return a === 0n ? 1n : a;
  }
  /** ساخت کسر کاهش‌یافته؛ مخرج پیش‌فرض ۱ */
  function frac(n, d) {
    let nn = BI(n); const dd = d === undefined ? 1n : BI(d);
    if (dd === 0n) throw new Error('مخرج کسر نمی‌تواند صفر باشد');
    if (dd < 0n) { nn = -nn; }
    const dd2 = dd < 0n ? -dd : dd;
    const g = gcdBig(nn, dd2);
    return { n: nn / g, d: dd2 / g };
  }
  const isFrac = (x) => !!x && typeof x === 'object' && typeof x.n === 'bigint' && typeof x.d === 'bigint';
  const fAdd = (a, b) => frac(a.n * b.d + b.n * a.d, a.d * b.d);
  const fSub = (a, b) => frac(a.n * b.d - b.n * a.d, a.d * b.d);
  const fMul = (a, b) => frac(a.n * b.n, a.d * b.d);
  function fDiv(a, b) { if (b.n === 0n) throw new Error('تقسیم بر کسر صفر'); return frac(a.n * b.d, a.d * b.n); }
  const fNeg = (a) => ({ n: -a.n, d: a.d });
  const fAbs = (a) => ({ n: a.n < 0n ? -a.n : a.n, d: a.d });
  function fCmp(a, b) { const x = a.n * b.d, y = b.n * a.d; return x < y ? -1 : (x > y ? 1 : 0); }
  const fEq = (a, b) => fCmp(a, b) === 0;
  const fSign = (a) => (a.n > 0n ? 1 : (a.n < 0n ? -1 : 0));
  const fToNumber = (a) => Number(a.n) / Number(a.d);
  const F0 = () => frac(0);
  const F1 = () => frac(1);

  /** کسر دقیق از رشته‌ی اعشاری: «12.5» ⇒ ۲۵/۲ (بدون هیچ تقریب) */
  function fFromDecimal(t) {
    const m = /^([-+]?)(\d*)(?:\.(\d*))?(?:[eE]([-+]?\d+))?$/.exec(t);
    if (!m || (m[2] === '' && (m[3] == null || m[3] === ''))) return null;
    const sign = m[1] === '-' ? -1n : 1n;
    const ip = m[2] || '0', fp = m[3] || '';
    let n = BI(ip + fp);
    let d = 10n ** BI(fp.length);
    if (m[4]) { const e = Number(m[4]); if (e >= 0) n = n * (10n ** BI(e)); else d = d * (10n ** BI(-e)); }
    const f = frac(sign * n, d);
    return f;
  }
  /**
   * کسر دقیق از هر ورودی: عدد، رشته‌ی فارسی/انگلیسی، کسر «1/8»، درصد «12.5%»،
   * عدد مخلوط «3 1/4»، یا بسته‌ی ذخیره‌شده {num,den} / {n,d}
   */
  function toFrac(v) {
    if (v == null || v === '') return null;
    if (isFrac(v)) return v;
    if (typeof v === 'number') return isFinite(v) ? fFromDecimal(String(v)) : null;
    if (typeof v === 'object') {
      if (v.num != null && v.den != null) { try { return frac(BI(String(v.num).trim()), BI(String(v.den).trim())); } catch (e) { return null; } }
      if (v.n != null && v.d != null) { try { return frac(BI(String(v.n).trim()), BI(String(v.d).trim())); } catch (e) { return null; } }
      return null;
    }
    let s = normDigits(v).replace(/[\u066B\u066C]/g, '').trim();
    const pct = /[٪%]/.test(s);
    s = s.replace(/[٪%]/g, '').replace(/,/g, '').trim();
    if (s === '') return null;
    for (let i = 1; i < s.length; i++) {
      if (s[i] === '+' && !/[eE]/.test(s[i - 1])) {
        const a = toFrac(s.slice(0, i)), b = toFrac(s.slice(i + 1));
        if (!a || !b) return null;
        const sum = fAdd(a, b);
        return pct ? fDiv(sum, frac(100)) : sum;
      }
    }
    let f = null;
    if (s.indexOf('/') >= 0) {
      // «3 1/4» (عدد مخلوط) یا «1/8» یا «12.5/100»
      const parts = s.split(/\s+/).filter(Boolean);
      const withSlash = parts.filter(p => p.indexOf('/') >= 0);
      if (withSlash.length !== 1) return null;
      const ab = withSlash[0].split('/');
      if (ab.length !== 2) return null;
      const fa = fFromDecimal(ab[0].trim()), fb = fFromDecimal(ab[1].trim());
      if (!fa || !fb || fb.n === 0n) return null;
      f = fDiv(fa, fb);
      for (const p of parts) {
        if (p.indexOf('/') >= 0) continue;
        const w = fFromDecimal(p.trim());
        if (!w) return null;
        f = fAdd(f, w);
      }
    } else {
      f = fFromDecimal(s);
    }
    if (!f) return null;
    return pct ? fDiv(f, frac(100)) : f;
  }
  /** بسته‌بندی کسر برای ذخیره در JSON (BigInt مستقیم ذخیره نمی‌شود) */
  const fPack = (f) => ({ num: String(f.n), den: String(f.d) });
  /** نمایش کسر: «5» یا «1/8» یا «5/4» (همیشه کسر ساده، بدون عدد مخلوط؛ چون در ورودی هم قابل خواندن است) */
  function fText(f) {
    if (!isFrac(f)) return '—';
    if (f.d === 1n) return String(f.n);
    return String(f.n) + '/' + String(f.d);
  }
  /** نمایش با عدد مخلوط برای متن‌های تشریحی («۱ و ۱/۴») */
  function fMixed(f) {
    if (!isFrac(f)) return '—';
    if (f.d === 1n) return String(f.n);
    const w = f.n / f.d, r = f.n % f.d;
    if (r === 0n) return String(w);
    if (w !== 0n && (w > 0n) === (r > 0n)) return String(w) + ' و ' + (r < 0n ? -r : r) + '/' + String(f.d);
    return fText(f);
  }
  const trim0 = (s) => s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  /** نمایش درصدی کسر با حداکثر d رقم اعشار (اعداد به‌صورت لاتین؛ فارسی‌سازی در رابط) */
  function fPct(f, d) {
    if (!isFrac(f)) return '—';
    const x = fToNumber(fMul(f, frac(100)));
    const dd = d == null ? 6 : d;
    return trim0(x.toFixed(dd));
  }
  /** نمایش عدد/کسر به‌صورت خوانا برای متن‌های هسته */
  function fNum(f, d) {
    if (!isFrac(f)) return '—';
    return f.d === 1n ? String(f.n) : trim0(fToNumber(f).toFixed(d == null ? 4 : d));
  }
  /**
   * تجزیه‌ی ورودی «سهم» کاربر در جدول تقسیم:
   * «12.5» یا «۱۲٫۵٪» ⇒ درصدی از زمین؛ «1/8» یا «۱/۸» ⇒ کسر دقیق از زمین
   */
  function parseShare(v) {
    if (v == null) return null;
    const s = normDigits(String(v)).trim();
    if (s === '') return { empty: true };
    const hasPct = /[٪%]/.test(s);
    const hasSlash = s.indexOf('/') >= 0 && !hasPct;
    const f = toFrac(s.replace(/[٪%]/g, ''));
    if (!f) return { error: 'عدد یا کسر معتبر نیست' };
    if (fSign(f) < 0) return { error: 'سهم منفی ممکن نیست' };
    return hasSlash ? { frac: f, kind: 'ratio', text: fText(f), pct: fPct(f, 4) }
      : { frac: fDiv(f, frac(100)), kind: 'percent', text: fText(fDiv(f, frac(100))), pct: fPct(fDiv(f, frac(100)), 4) };
  }

  /* ---------------------------------------------------------------- */
  /* سیستم مختصات                                                      */
  /* ---------------------------------------------------------------- */
  const CRS_LIST = [
    { id: 'EPSG:4326', label: 'WGS84 جغرافیایی (طول و عرض به درجه)' },
    { id: 'EPSG:32637', label: 'UTM منطقه ۳۷ شمالی (WGS84)' },
    { id: 'EPSG:32638', label: 'UTM منطقه ۳۸ شمالی (WGS84)' },
    { id: 'EPSG:32639', label: 'UTM منطقه ۳۹ شمالی (WGS84)' },
    { id: 'EPSG:32640', label: 'UTM منطقه ۴۰ شمالی (WGS84)' },
    { id: 'EPSG:32641', label: 'UTM منطقه ۴۱ شمالی (WGS84)' },
    { id: 'EPSG:32642', label: 'UTM منطقه ۴۲ شمالی (WGS84)' },
    { id: 'EPSG:3857', label: 'Web Mercator (EPSG:3857)' },
  ];
  function registerDefs() {
    if (!proj4) return;
    for (let z = 37; z <= 42; z++) proj4.defs('EPSG:326' + z, `+proj=utm +zone=${z} +datum=WGS84 +units=m +no_defs`);
    proj4.defs('EPSG:3857', '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs');
  }
  registerDefs();

  /** تلاش برای تشخیص سیستم مختصات از روی خود اعداد (برای ایران) */
  function detectCRS(points) {
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    const mm = (a) => [Math.min.apply(null, a), Math.max.apply(null, a)];
    const [x0, x1] = mm(xs), [y0, y1] = mm(ys);
    if (!isFinite(x0 + x1 + y0 + y1)) return { status: 'unknown', reason: 'مقادیر عددی نامعتبر' };
    if (Math.abs(x0) <= 180 && Math.abs(x1) <= 180 && Math.abs(y0) <= 90 && Math.abs(y1) <= 90) {
      const lonLike = (a, b) => a >= 43 && b <= 64.5, latLike = (a, b) => a >= 24 && b <= 40;
      if (lonLike(x0, x1) && latLike(y0, y1)) return { status: 'ok', crs: 'EPSG:4326', swap: false, reason: 'درجه‌ی جغرافیایی (طول، عرض) در محدوده‌ی ایران' };
      if (latLike(x0, x1) && lonLike(y0, y1)) return { status: 'ok', crs: 'EPSG:4326', swap: true, reason: 'درجه‌ی جغرافیایی؛ ترتیب (عرض، طول) تشخیص داده شد و جابه‌جا می‌شود' };
      return { status: 'axis', crs: 'EPSG:4326', reason: 'درجه‌ی جغرافیایی است اما ترتیب طول/عرض یا موقعیت (خارج از ایران) مشخص نیست' };
    }
    if (x0 >= 4.4e6 && x1 <= 7.6e6 && y0 >= 2.8e6 && y1 <= 5.3e6)
      return { status: 'ok', crs: 'EPSG:3857', swap: false, reason: 'مقادیر در محدوده‌ی Web Mercator برای ایران' };
    if (x0 >= 1e5 && x1 <= 9e5 && y0 >= 2.5e6 && y1 <= 4.6e6)
      return { status: 'utm', candidates: ['EPSG:32638', 'EPSG:32639', 'EPSG:32640', 'EPSG:32641'], reason: 'مختصات متری UTM است ولی شماره‌ی منطقه (۳۸ تا ۴۱) از روی اعداد مشخص نیست' };
    return { status: 'unknown', reason: 'مقادیر با هیچ سیستم مختصات شناخته‌شده‌ای سازگار نیست' };
  }
  /** سرنخ سیستم مختصات از متن فایل/سرستون‌ها */
  function sniffCrsText(text) {
    const t = normDigits(text).toUpperCase();
    let m = t.match(/EPSG\s*[:\/]*\s*(4326|3857|3263[7-9]|3264[0-2])/);
    if (m) return 'EPSG:' + m[1];
    m = t.match(/UTM[^0-9]{0,12}(3[7-9]|4[0-2])\s*N?/) || t.match(/ZONE\s*(3[7-9]|4[0-2])/);
    if (m) return 'EPSG:326' + m[1];
    if (/WGS\s*-?\s*84/.test(t) && !/UTM/.test(t)) return 'EPSG:4326';
    return null;
  }
  /** تبدیل به WGS84 [lon,lat] */
  function toWGS84(points, crsId, swap) {
    return points.map(p => {
      let [x, y] = p;
      if (crsId === 'EPSG:4326') return swap ? [y, x] : [x, y];
      if (!proj4) throw new Error('کتابخانه‌ی تبدیل مختصات (proj4) بارگذاری نشده است');
      const r = proj4(crsId, 'EPSG:4326', [x, y]);
      return [r[0], r[1]];
    });
  }

  /* ---------------------------------------------------------------- */
  /* هندسه                                                             */
  /* ---------------------------------------------------------------- */
  function openRing(ring) {
    const r = ring.slice();
    if (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r.pop();
    return r;
  }
  /** مساحت (مترمربع) روی بیضوی WGS84 با تصویر هم‌مساحت لامبرت (دقیق) */
  function areaM2(ringLonLat) {
    const r = openRing(ringLonLat);
    if (r.length < 3) return 0;
    const cx = r.reduce((s, p) => s + p[0], 0) / r.length;
    const cy = r.reduce((s, p) => s + p[1], 0) / r.length;
    let pts;
    if (proj4) {
      const def = `+proj=laea +lat_0=${cy} +lon_0=${cx} +x_0=0 +y_0=0 +ellps=WGS84 +units=m +no_defs`;
      pts = r.map(p => proj4('EPSG:4326', def, p));
      if (pts.some(q => !isFinite(q[0]) || !isFinite(q[1]))) return NaN;
    } else { // جایگزین: کره‌ی هم‌مساحت
      const Ra = 6371007.2, rad = Math.PI / 180;
      pts = r.map(p => [Ra * (p[0] - cx) * rad * Math.cos(cy * rad), Ra * (p[1] - cy) * rad]);
    }
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      s += a[0] * b[1] - b[0] * a[1];
    }
    return Math.abs(s) / 2;
  }
  function segIntersect(a, b, c, d) {
    const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
    if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) return true;
    const on = (p, q, r) => Math.min(p[0], q[0]) <= r[0] && r[0] <= Math.max(p[0], q[0]) && Math.min(p[1], q[1]) <= r[1] && r[1] <= Math.max(p[1], q[1]);
    if (o1 === 0 && on(a, b, c)) return true;
    if (o2 === 0 && on(a, b, d)) return true;
    if (o3 === 0 && on(c, d, a)) return true;
    if (o4 === 0 && on(c, d, b)) return true;
    return false;
  }
  /** اعتبارسنجی هندسه. هیچ نقطه‌ای ساخته یا اصلاح نمی‌شود (جز حذف نقطه‌ی بستن/تکراری متوالی). */
  function validateRing(ringLonLat) {
    const errors = [], warnings = [];
    let r = (ringLonLat || []).slice();
    if (!r.length) return { valid: false, errors: ['هیچ نقطه‌ای وجود ندارد'], warnings, ring: [], area: 0, count: 0 };
    for (let i = 0; i < r.length; i++) {
      const p = r[i];
      if (!p || !isFinite(p[0]) || !isFinite(p[1])) errors.push(`نقطه‌ی ${i + 1}: مقدار عددی نامعتبر`);
      else if (Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90) errors.push(`نقطه‌ی ${i + 1}: خارج از بازه‌ی طول (±۱۸۰) یا عرض (±۹۰) جغرافیایی`);
    }
    if (errors.length) return { valid: false, errors, warnings, ring: r, area: 0, count: r.length };
    const before = r.length;
    r = openRing(r);
    const dd = [];
    for (let i = 0; i < r.length; i++) {
      const prev = dd[dd.length - 1];
      if (!prev || prev[0] !== r[i][0] || prev[1] !== r[i][1]) dd.push(r[i]);
    }
    r = openRing(dd);
    if (r.length !== before) warnings.push('نقطه‌ی بستن یا نقاط تکراری متوالی حذف شد (' + (before - r.length) + ' نقطه)');
    if (r.length < 3) errors.push('برای تشکیل مرز حداقل ۳ نقطه‌ی متمایز لازم است (تعداد: ' + r.length + ')');
    let area = 0;
    if (!errors.length) {
      const n = r.length;
      outer: for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue;
          if (segIntersect(r[i], r[(i + 1) % n], r[j], r[(j + 1) % n])) {
            errors.push(`مرز خودش را قطع می‌کند (بین ضلع ${i + 1} و ضلع ${j + 1}) — چندضلعی نامعتبر است`);
            break outer;
          }
        }
      }
      area = areaM2(r);
      if (!errors.length && area < 1) errors.push('مساحت صفر یا کمتر از ۱ مترمربع است (نقاط روی یک خط‌اند)');
      if (area > 5e9) warnings.push('مساحت بسیار بزرگ است (بیش از ۵۰۰٬۰۰۰ هکتار)؛ سیستم مختصات را بررسی کنید');
    }
    return { valid: errors.length === 0, errors, warnings, ring: r, area, count: r.length };
  }

  /* ---------------------------------------------------------------- */
  /* برش زمین با خط مستقیم: «تقسیم یک زمین به دو قسمت با متراژ مشخص»     */
  /* خط جداکننده دقیقاً جایی گذاشته می‌شود که مساحت یک قسمت برابر متراژ   */
  /* خواسته‌شده شود (جست‌وجوی دوتایی روی جابه‌جایی خط) و جهت آن گردان است. */
  /* چون تصویر محلی هم‌مساحت (LAEA) است، مساحت در صفحه = مساحت واقعی زمین. */
  /* ---------------------------------------------------------------- */
  const fmtM2 = (x) => (isFinite(x) ? x.toLocaleString('en', { maximumFractionDigits: 2 }) : '—');

  /** تصویر محلی هم‌مساحت حول مرکز حلقه + تبدیل معکوس */
  function localPlane(ringLonLat) {
    const r = openRing(ringLonLat);
    const cx = r.reduce((s, p) => s + p[0], 0) / r.length;
    const cy = r.reduce((s, p) => s + p[1], 0) / r.length;
    if (proj4) {
      const def = `+proj=laea +lat_0=${cy} +lon_0=${cx} +x_0=0 +y_0=0 +ellps=WGS84 +units=m +no_defs`;
      const conv = proj4('EPSG:4326', def);
      const fwd = typeof conv === 'function' ? conv : (p) => conv.forward(p);
      const inv = typeof conv === 'function' ? (q) => proj4(def, 'EPSG:4326', q) : (q) => conv.inverse(q);
      return { toXY: (p) => fwd([p[0], p[1]]), toLonLat: (q) => inv([q[0], q[1]]), center: [cx, cy], kind: 'laea' };
    }
    const Ra = 6371007.2, rad = Math.PI / 180, k = Ra * rad * Math.cos(cy * rad), k2 = Ra * rad;
    return {
      toXY: (p) => [k * (p[0] - cx), k2 * (p[1] - cy)],
      toLonLat: (q) => [cx + q[0] / k, cy + q[1] / k2],
      center: [cx, cy], kind: 'sphere',
    };
  }
  function ringAreaXY(pts) {
    let s = 0;
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - b[0] * a[1]; }
    return Math.abs(s) / 2;
  }
  /** مرکز سطحی چندضلعی (نه میانگین رأس‌ها) تا خط با جابه‌جایی صفر زمین را نصف کند */
  function centroidXY(pts) {
    let a2 = 0, sx = 0, sy = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length], cr = p[0] * q[1] - q[0] * p[1];
      a2 += cr; sx += (p[0] + q[0]) * cr; sy += (p[1] + q[1]) * cr;
    }
    if (Math.abs(a2) < 1e-12) {
      const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length, my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      return [mx, my];
    }
    return [sx / (3 * a2), sy / (3 * a2)];
  }
  function dedupeXY(pts) {
    const EPS = 1e-9, out = [];
    for (const p of pts) {
      const q = out[out.length - 1];
      if (!q || Math.abs(q[0] - p[0]) > EPS || Math.abs(q[1] - p[1]) > EPS) out.push([p[0], p[1]]);
    }
    while (out.length > 1) {
      const a = out[0], b = out[out.length - 1];
      if (Math.abs(a[0] - b[0]) <= EPS && Math.abs(a[1] - b[1]) <= EPS) out.pop(); else break;
    }
    return out;
  }
  /** برش با نیم‌صفحه‌ی (p−c)·u ≤ t (ساترلند–هاجمن برای یک نیم‌صفحه) */
  function clipHalfPlane(pts, u, c, t, keepBelow) {
    const EPS = 1e-9;
    const val = (p) => { const s = (p[0] - c[0]) * u[0] + (p[1] - c[1]) * u[1] - t; return keepBelow ? s : -s; };
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const A = pts[i], B = pts[(i + 1) % pts.length];
      const va = val(A), vb = val(B);
      if (va <= EPS) out.push([A[0], A[1]]);
      if ((va < -EPS && vb > EPS) || (va > EPS && vb < -EPS)) {
        const k = va / (va - vb);
        out.push([A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k]);
      }
    }
    return out;
  }
  /**
   * محورهای برش. azimuth = جهت «خط جداکننده» به درجه، از شمال در جهت ساعتگرد
   * (۰ ⇒ خط شمالی–جنوبی، ۹۰ ⇒ خط شرقی–غربی). u = بردار عمود بر خط.
   */
  function splitAxes(azimuth) {
    const az = ((azimuth % 360) + 360) % 360, rad = Math.PI / 180;
    const d = [Math.sin(az * rad), Math.cos(az * rad)];
    return { az, d, u: [d[1], -d[0]] };
  }
  const splitNormal = (opts) => {
    const ax = splitAxes(isNum(opts.azimuth) ? opts.azimuth : 0);
    const flip = opts.side === 'b' || opts.side === -1;
    return { az: ax.az, d: ax.d, u: flip ? [-ax.u[0], -ax.u[1]] : ax.u, side: flip ? 'b' : 'a' };
  };

  /** آماده‌سازی مرز برای برش (یک بار برای هر مرز؛ بعد فقط متراژ/جهت عوض می‌شود) */
  function splitPrepare(ringLonLat) {
    const warnings = [];
    const v = validateRing(ringLonLat);
    if (!v.valid) return { ok: false, reason: 'invalid', errors: v.errors, warnings: v.warnings };
    v.warnings.forEach(w => warnings.push(w));
    const ring = v.ring, pl = localPlane(ring);
    const pts = ring.map(p => pl.toXY(p));
    if (pts.some(q => !isFinite(q[0]) || !isFinite(q[1]))) return { ok: false, reason: 'projection', errors: ['تبدیل مختصات به صفحه‌ی محلی ناموفق بود'], warnings };
    const total = ringAreaXY(pts);
    if (!(total > 0)) return { ok: false, reason: 'area', errors: ['مساحت زمین صفر است'], warnings };
    const c = centroidXY(pts);
    return { ok: true, ring, plane: pl, pts, c, total, totalArea: areaM2(ring), warnings, projection: pl.kind };
  }
  /** بازه‌ی مجاز جابه‌جایی خط برش (متر، نسبت به مرکز سطحی) */
  function splitOffsetRange(pre, opts) {
    const { u } = splitNormal(opts || {}), c = pre.c;
    let lo = Infinity, hi = -Infinity;
    pre.pts.forEach(p => { const s = (p[0] - c[0]) * u[0] + (p[1] - c[1]) * u[1]; if (s < lo) lo = s; if (s > hi) hi = s; });
    return { min: lo, max: hi, u };
  }
  /** برش در جابه‌جایی مشخص (متر)؛ targetM2 فقط برای گزارش اختلاف است */
  function splitCut(pre, offsetM, opts, targetM2, iterations) {
    opts = opts || {};
    const ax = splitNormal(opts), u = ax.u, c = pre.c, t = isNum(offsetM) ? offsetM : 0;
    const warnings = pre.warnings.slice();
    const pa = dedupeXY(clipHalfPlane(pre.pts, u, c, t, true));
    const pb = dedupeXY(clipHalfPlane(pre.pts, u, c, t, false));
    if (pa.length < 3 || pb.length < 3) {
      return { ok: false, reason: 'degenerate', errors: ['در این جهت/جابه‌جایی، خط برش زمین را به دو قسمت معتبر تقسیم نمی‌کند (یک طرف خالی است). جهت را تغییر دهید یا متراژ را کم/زیاد کنید.'], warnings, azimuth: ax.az, side: ax.side, offset: t, totalArea: pre.totalArea };
    }
    // خط جداکننده = پاره‌خط مشترک دو قسمت: برخورد خط بی‌نهایت با ضلع‌های مرز
    const hits = [];
    const proj = (p) => (p[0] - c[0]) * u[0] + (p[1] - c[1]) * u[1] - t;
    for (let i = 0; i < pre.pts.length; i++) {
      const A = pre.pts[i], B = pre.pts[(i + 1) % pre.pts.length];
      const sa = proj(A), sb = proj(B);
      if (Math.abs(sa) <= 1e-9 && Math.abs(sb) <= 1e-9) { hits.push([A[0], A[1]], [B[0], B[1]]); continue; }
      if ((sa <= 0 && sb >= 0) || (sa >= 0 && sb <= 0)) {
        if (sa === sb) continue;
        const k = sa / (sa - sb);
        hits.push([A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k]);
      }
    }
    let lineXY = [];
    if (hits.length >= 2) {
      let w0 = Infinity, w1 = -Infinity, p0 = null, p1 = null;
      hits.forEach(h => { const w = (h[0] - c[0]) * ax.d[0] + (h[1] - c[1]) * ax.d[1]; if (w < w0) { w0 = w; p0 = h; } if (w > w1) { w1 = w; p1 = h; } });
      lineXY = [p0, p1];
      const uniq = hits.filter((h, i) => hits.findIndex(q => Math.abs(q[0] - h[0]) < 1e-6 && Math.abs(q[1] - h[1]) < 1e-6) === i);
      if (uniq.length > 2) warnings.push('خط برش مرز را بیش از دو بار قطع می‌کند (زمین غیرمحدب است)؛ ممکن است یک قسمت چندتکه باشد. نتیجه را روی نقشه ببینید.');
    } else warnings.push('نقطه‌ی برخورد خط برش با مرز پیدا نشد.');

    const partA = pa.map(q => pre.plane.toLonLat(q));
    const partB = pb.map(q => pre.plane.toLonLat(q));
    const line = lineXY.map(q => pre.plane.toLonLat(q));
    const areaAXY = ringAreaXY(pa), areaBXY = ringAreaXY(pb);
    const areaA = partA.length >= 3 ? areaM2(partA) : 0;
    const areaB = partB.length >= 3 ? areaM2(partB) : 0;
    const cutLengthM = lineXY.length === 2 ? Math.hypot(lineXY[1][0] - lineXY[0][0], lineXY[1][1] - lineXY[0][1]) : 0;
    [partA, partB].forEach((ring, i) => {
      const vv = validateRing(ring);
      if (!vv.valid && !/مساحت صفر/.test(vv.errors[0] || '')) warnings.push('قسمت ' + (i + 1) + ' هندسه‌ی نامعتبر دارد: ' + vv.errors[0]);
      else if (!vv.valid) warnings.push('قسمت ' + (i + 1) + ' بسیار کوچک است (' + fmtM2(i ? areaB : areaA) + ' مترمربع).');
    });
    if (Math.abs(areaAXY + areaBXY - pre.total) > Math.max(1e-6, pre.total * 1e-9)) warnings.push('کنترل داخلی: جمع مساحت دو قسمت با مساحت کل برابر نشد.');
    return {
      ok: true, partA, partB, line, areaA, areaB, areaAXY, areaBXY, cutLengthM,
      totalArea: pre.totalArea, targetM2: isNum(targetM2) ? targetM2 : null,
      errorM2: isNum(targetM2) ? areaA - targetM2 : null,
      ratioA: pre.totalArea ? areaA / pre.totalArea : null,
      azimuth: ax.az, side: ax.side, offset: t, iterations: iterations == null ? null : iterations,
      center: c, u, warnings, sourceRing: pre.ring,
    };
  }
  /** برش با متراژ مشخصِ قسمت اول: جابه‌جایی خط با جست‌وجوی دوتایی پیدا می‌شود */
  function splitByArea(pre, targetM2, opts) {
    opts = opts || {};
    if (!pre || !pre.ok) return pre || { ok: false, reason: 'invalid', errors: ['مرز آماده‌سازی نشده است'] };
    let target = toFrac(targetM2);
    const tm = target ? fToNumber(target) : NaN;
    if (!isFinite(tm)) return { ok: false, reason: 'target', errors: ['متراژ خواسته‌شده عدد معتبر نیست'], warnings: pre.warnings, totalArea: pre.totalArea };
    if (tm <= 0) return { ok: false, reason: 'too_small', errors: ['متراژ قسمت اول باید بیشتر از صفر باشد'], warnings: pre.warnings, totalArea: pre.totalArea };
    if (tm >= pre.total - 1e-9) return { ok: false, reason: 'too_big', errors: ['متراژ خواسته‌شده (' + fmtM2(tm) + ' م²) از مساحت کل زمین (' + fmtM2(pre.total) + ' م²) کمتر نیست. عدد کوچک‌تری بنویسید.'], warnings: pre.warnings, totalArea: pre.totalArea };
    const rg = splitOffsetRange(pre, opts);
    const areaAt = (t) => ringAreaXY(clipHalfPlane(pre.pts, rg.u, pre.c, t, true));
    const tol = isNum(opts.tolM2) ? opts.tolM2 : Math.max(1e-7, pre.total * 1e-12);
    let lo = rg.min, hi = rg.max, t = (lo + hi) / 2, it = 0;
    const maxIter = isNum(opts.maxIter) ? opts.maxIter : 100;
    for (; it < maxIter; it++) {
      t = (lo + hi) / 2;
      const A = areaAt(t);
      if (Math.abs(A - tm) <= tol) break;
      if (A < tm) lo = t; else hi = t;
      if (hi - lo <= 1e-9) break;
    }
    const out = splitCut(pre, t, opts, tm, it + 1);
    if (out.ok && Math.abs(out.errorM2) > Math.max(0.05, tm * 1e-6)) out.warnings.push('دقت برش: اختلاف ' + fmtM2(out.errorM2) + ' مترمربع با متراژ خواسته‌شده.');
    return out;
  }
  /** برش با جابه‌جایی خط (متر) — برای کشیدن خط با ماوس/انگشت */
  function splitByOffset(pre, offsetM, opts) {
    if (!pre || !pre.ok) return pre || { ok: false, reason: 'invalid', errors: ['مرز آماده‌سازی نشده است'] };
    const out = splitCut(pre, offsetM, opts, null, null);
    if (out.ok) out.targetM2 = out.areaA;
    return out;
  }
  /** تابع ساده: مرز + متراژ ⇒ دو قسمت (بدون نیاز به آماده‌سازی جداگانه) */
  function splitRingByArea(ringLonLat, targetM2, opts) {
    const pre = splitPrepare(ringLonLat);
    if (!pre.ok) return pre;
    return splitByArea(pre, targetM2, opts);
  }
  /** جهت پیشنهادی خط برش: عمود بر کشیدگی زمین (برای زمین‌های دراز، برش عرضی) */
  /**
   * تقسیم یک زمین به چند قسمت به نسبت دلخواه (مثلاً «1:1:1» یا «8:8:1:4»): با چند برش موازی پشت سر هم؛
   * هر برش با جست‌وجوی دوتایی روی مساحت واقعی. سهم هر قسمت = مساحت کل × (وزن ÷ جمع وزن‌ها) با کسر دقیق.
   */
  function splitMulti(ringLonLat, weights, opts) {
    opts = opts || {};
    const ws = (weights || []).map(toFrac);
    if (ws.length < 2 || ws.some(f => !f || fSign(f) <= 0)) return { ok: false, errors: ['نسبت‌ها باید دست‌کم دو عدد مثبت باشند (مثلاً 1:1:1)'] };
    let sum = F0(); ws.forEach(f => { sum = fAdd(sum, f); });
    let pre = splitPrepare(ringLonLat); if (!pre.ok) return pre;
    const total = pre.totalArea, parts = [], warnings = [];
    let rem = pre.ring;
    for (let i = 0; i < ws.length; i++) {
      const targetF = fMul(frac(Math.round(total * 1e6), 1000000), fDiv(ws[i], sum)), target = fToNumber(targetF);
      if (i === ws.length - 1) { const a = areaM2(rem); parts.push({ ring: rem, area: a, target, share: fDiv(ws[i], sum), errorM2: a - target }); break; }
      const p = splitPrepare(rem); if (!p.ok) return p;
      const r = splitByArea(p, target, { azimuth: opts.azimuth, side: 'a' });
      if (!r.ok) return r;
      (r.warnings || []).forEach(w => warnings.push(w));
      parts.push({ ring: r.partA, area: r.areaA, target, share: fDiv(ws[i], sum), errorM2: r.areaA - target, line: r.line });
      rem = r.partB;
    }
    return { ok: true, parts, totalArea: total, azimuth: opts.azimuth, warnings, sumAreas: parts.reduce((a, p) => a + p.area, 0) };
  }
  function principalAzimuth(ringLonLat) {
    const pre = splitPrepare(ringLonLat);
    if (!pre.ok) return null;
    const pts = pre.pts, c = pre.c;
    let a2 = 0, mxx = 0, myy = 0, mxy = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length], cr = p[0] * q[1] - q[0] * p[1];
      a2 += cr;
      mxx += cr * (p[0] * p[0] + p[0] * q[0] + q[0] * q[0]) / 12;
      myy += cr * (p[1] * p[1] + p[1] * q[1] + q[1] * q[1]) / 12;
      mxy += cr * (p[0] * q[1] + 2 * p[0] * p[1] + 2 * q[0] * q[1] + q[0] * p[1]) / 24;
    }
    const sgn = a2 >= 0 ? 1 : -1, A = a2 / 2;
    const Mxx = sgn * (mxx - A * c[0] * c[0]), Myy = sgn * (myy - A * c[1] * c[1]), Mxy = sgn * (mxy - A * c[0] * c[1]);
    if (!(isFinite(Mxx) && isFinite(Myy) && isFinite(Mxy))) return null;
    const norm = (az) => ((az % 360) + 360) % 360;
    // زمین تقریباً متقارن (مثلاً مربع): محور کشیدگی یکتا نیست ⇒ عمود بر بلندترین ضلع مرز
    const mean = (Mxx + Myy) / 2, gap = Math.hypot((Mxx - Myy) / 2, Mxy);
    if (mean > 0 && gap / mean < 1e-6) {
      let best = -1, bi = 0;
      pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; const L = Math.hypot(q[0] - p[0], q[1] - p[1]); if (L > best) { best = L; bi = i; } });
      const p = pts[bi], q = pts[(bi + 1) % pts.length];
      return norm(Math.atan2(q[0] - p[0], q[1] - p[1]) * 180 / Math.PI + 90);
    }
    const th = 0.5 * Math.atan2(2 * Mxy, Mxx - Myy);          // جهت کشیدگی (بیشترین گسترش)
    let az = norm(-th * 180 / Math.PI);                        // خط برش عمود بر آن
    [0, 45, 90, 135, 180, 225, 270, 315, 360].forEach(k => { if (Math.abs(az - k) < 0.05) az = k % 360; });
    return az;
  }

  /* ---------------------------------------------------------------- */
  /* ورودی مختصات                                                      */
  /* ---------------------------------------------------------------- */
  function parseDMS(str) {
    // 35°41'30.5"N  یا  35 41 30.5 N
    const s = normDigits(str);
    const m = s.match(/(\d+(?:\.\d+)?)\s*[°º]\s*(?:(\d+(?:\.\d+)?)\s*['′’]\s*)?(?:(\d+(?:\.\d+)?)\s*["″”]\s*)?([NSEW])?/i);
    if (!m) return NaN;
    let v = parseFloat(m[1]) + (m[2] ? parseFloat(m[2]) / 60 : 0) + (m[3] ? parseFloat(m[3]) / 3600 : 0);
    if (m[4] && /[SW]/i.test(m[4])) v = -v;
    return v;
  }
  function splitDelimited(text) {
    const lines = normDigits(text).replace(/\r/g, '').split('\n').filter(l => l.trim() !== '');
    if (!lines.length) return [];
    const sample = lines.slice(0, 5).join('\n');
    const cnt = (ch) => (sample.match(new RegExp(ch === '\t' ? '\\t' : '\\' + ch, 'g')) || []).length;
    let delim = null;
    for (const d of ['\t', ';', ',']) if (cnt(d) >= Math.max(1, lines.slice(0, 5).length - 1) && (!delim || cnt(d) > cnt(delim))) delim = d;
    const rows = lines.map(l => {
      if (!delim) return l.trim().split(/\s+/);
      const out = []; let cur = '', q = false;
      for (let i = 0; i < l.length; i++) {
        const c = l[i];
        if (c === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
        else if (c === delim && !q) { out.push(cur.trim()); cur = ''; }
        else cur += c;
      }
      out.push(cur.trim());
      return out;
    });
    return rows;
  }
  const LON_NAMES = /^(lon|lng|long|longitude|x|east|easting|e|طول|طول جغرافیایی|ایکس)$/i;
  const LAT_NAMES = /^(lat|latitude|y|north|northing|n|عرض|عرض جغرافیایی|وای)$/i;

  /** ورودی جدولی: rows آرایه‌ای از آرایه‌های رشته‌ای است */
  function importTable(rows, opts) {
    opts = opts || {};
    rows = rows.filter(r => r.some(c => String(c == null ? '' : c).trim() !== '')).map(r => r.map(c => c == null ? '' : String(c)));
    if (!rows.length) return { ok: false, errors: ['ورودی خالی است'] };
    const ncol = Math.max.apply(null, rows.map(r => r.length));
    const first = rows[0];
    const isNumCell = (c) => { const t = String(c).trim(); return t !== '' && (isFinite(toNum(t)) || /[°º]/.test(t)); };
    const hasHeader = first.some(c => String(c).trim() !== '' && !isNumCell(c));
    const headers = hasHeader ? first.map((c, i) => String(c).trim() || 'ستون ' + (i + 1)) : Array.from({ length: ncol }, (_, i) => 'ستون ' + (i + 1));
    const data = hasHeader ? rows.slice(1) : rows;
    const hintCrs = sniffCrsText(hasHeader ? first.join(' ') : '');
    let cx = opts.colX, cy = opts.colY;
    if (cx == null || cy == null) {
      const li = headers.findIndex(h => LON_NAMES.test(h.trim())), la = headers.findIndex(h => LAT_NAMES.test(h.trim()));
      if (li >= 0 && la >= 0 && li !== la) { cx = li; cy = la; }
      else {
        const numericCols = headers.map((_, i) => i).filter(i => data.length && data.every(r => r[i] === undefined || r[i] === '' || isNumCell(r[i])) && data.some(r => isNumCell(r[i])));
        if (ncol === 2 && numericCols.length === 2) { cx = 0; cy = 1; }
        else return { ok: false, needsColumns: true, headers, sample: data.slice(0, 5), message: 'ستون‌های طول و عرض جغرافیایی (یا X و Y) به‌طور قطعی تشخیص داده نشد؛ لطفاً انتخاب کنید.' };
      }
    }
    const pts = [], errors = [];
    data.forEach((r, i) => {
      const a = r[cx], b = r[cy];
      const lineNo = i + 1 + (hasHeader ? 1 : 0);
      const conv = (v) => /[°º]/.test(v) ? parseDMS(v) : toNum(v);
      const x = conv(String(a == null ? '' : a)), y = conv(String(b == null ? '' : b));
      if (!isFinite(x) || !isFinite(y)) errors.push(`ردیف ${lineNo}: مقدار مختصات عددی نیست («${a}» ، «${b}»)`);
      else pts.push([x, y]);
    });
    if (errors.length) return { ok: false, errors: errors.slice(0, 12).concat(errors.length > 12 ? ['… و ' + (errors.length - 12) + ' خطای دیگر'] : []), partialCount: pts.length };
    return { ok: true, candidates: [{ name: 'مرز واردشده', points: pts }], hintCrs, headers, colX: cx, colY: cy };
  }
  function importText(text, opts) {
    const rows = splitDelimited(text);
    if (!rows.length) return { ok: false, errors: ['کادر متنی خالی است'] };
    const r = importTable(rows, opts);
    if (r.needsColumns || !r.ok) {
      // اگر فقط یک عدد در هر خط است
      return r;
    }
    r.hintCrs = r.hintCrs || sniffCrsText(text);
    return r;
  }
  function pointsFromGeometry(g, out, name) {
    if (!g) return;
    if (g.type === 'Polygon') {
      if (g.coordinates && g.coordinates[0]) out.push({ name, points: g.coordinates[0].map(c => [c[0], c[1]]), holes: g.coordinates.length - 1 });
    } else if (g.type === 'MultiPolygon') {
      (g.coordinates || []).forEach((poly, i) => out.push({ name: (name || 'چندضلعی') + ' (' + (i + 1) + ')', points: poly[0].map(c => [c[0], c[1]]), holes: poly.length - 1 }));
    } else if (g.type === 'LineString') {
      const c = g.coordinates || [];
      if (c.length >= 4 && c[0][0] === c[c.length - 1][0] && c[0][1] === c[c.length - 1][1]) out.push({ name, points: c.map(p => [p[0], p[1]]) });
    } else if (g.type === 'GeometryCollection') (g.geometries || []).forEach(x => pointsFromGeometry(x, out, name));
  }
  function importGeoJSON(textOrObj) {
    let o;
    try { o = typeof textOrObj === 'string' ? JSON.parse(textOrObj) : textOrObj; } catch (e) { return { ok: false, errors: ['فایل GeoJSON معتبر نیست (JSON خراب است): ' + e.message] }; }
    const out = [];
    if (o.type === 'FeatureCollection') (o.features || []).forEach((f, i) => pointsFromGeometry(f.geometry, out, (f.properties && (f.properties.name || f.properties.Name)) || 'عارضه ' + (i + 1)));
    else if (o.type === 'Feature') pointsFromGeometry(o.geometry, out, (o.properties && o.properties.name) || 'عارضه');
    else pointsFromGeometry(o, out, 'چندضلعی');
    if (!out.length) return { ok: false, errors: ['هیچ چندضلعی (Polygon) در فایل GeoJSON پیدا نشد'] };
    let hint = null;
    if (o.crs && o.crs.properties && o.crs.properties.name) hint = sniffCrsText(o.crs.properties.name);
    const warnings = [];
    if (out.some(c => c.holes)) warnings.push('چندضلعی دارای سوراخ (حفره) است؛ فقط مرز بیرونی وارد می‌شود.');
    return { ok: true, candidates: out, hintCrs: hint, warnings, defaultCrs: hint || 'EPSG:4326' };
  }
  function importKML(text) {
    const out = [], warnings = [];
    const parseCoords = (s) => normDigits(s).trim().split(/\s+/).filter(Boolean).map(t => t.split(',').map(Number)).filter(a => a.length >= 2).map(a => [a[0], a[1]]);
    const placemarks = text.match(/<Placemark[\s\S]*?<\/Placemark>/gi) || [text];
    placemarks.forEach((pm, i) => {
      const nm = (pm.match(/<name[^>]*>([\s\S]*?)<\/name>/i) || [])[1];
      const name = (nm ? nm.replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '') || 'عارضه ' + (i + 1);
      const polys = pm.match(/<Polygon[\s\S]*?<\/Polygon>/gi) || [];
      polys.forEach((pg, k) => {
        const ob = (pg.match(/<outerBoundaryIs[\s\S]*?<\/outerBoundaryIs>/i) || [pg])[0];
        const c = (ob.match(/<coordinates[^>]*>([\s\S]*?)<\/coordinates>/i) || [])[1];
        if (c) out.push({ name: polys.length > 1 ? name + ' (' + (k + 1) + ')' : name, points: parseCoords(c), holes: (pg.match(/<innerBoundaryIs/gi) || []).length });
      });
      if (!polys.length) {
        const ls = pm.match(/<(?:LinearRing|LineString)[\s\S]*?<coordinates[^>]*>([\s\S]*?)<\/coordinates>/i);
        if (ls) { const c = parseCoords(ls[1]); if (c.length >= 4 && c[0][0] === c[c.length - 1][0] && c[0][1] === c[c.length - 1][1]) out.push({ name, points: c }); }
      }
    });
    if (!out.length) {
      const ptsList = (text.match(/<Point[\s\S]*?<coordinates[^>]*>([\s\S]*?)<\/coordinates>/gi) || []).map(m => parseCoords(m.replace(/[\s\S]*?<coordinates[^>]*>/i, '').replace(/<\/coordinates>/i, ''))[0]).filter(Boolean);
      if (ptsList.length >= 3) {
        out.push({ name: 'نقاط فایل (به ترتیب فایل)', points: ptsList });
        warnings.push('در فایل KML چندضلعی نبود؛ نقاط (Point) به همان ترتیب فایل به‌عنوان رأس‌های مرز استفاده شدند. ترتیب را در پیش‌نمایش بررسی کنید.');
      }
    }
    if (!out.length) return { ok: false, errors: ['در فایل KML هیچ چندضلعی یا نقاط کافی پیدا نشد'] };
    if (out.some(c => c.holes)) warnings.push('چندضلعی دارای سوراخ است؛ فقط مرز بیرونی وارد می‌شود.');
    return { ok: true, candidates: out, hintCrs: 'EPSG:4326', defaultCrs: 'EPSG:4326', warnings };
  }

  /** ساخت پیش‌نمایش از یک کاندید: crs و swap را (در صورت نیاز) از کاربر می‌گیرد */
  function buildPreview(candidate, o) {
    o = o || {};
    const pts = candidate.points;
    if (!pts || !pts.length) return { ok: false, errors: ['نقطه‌ای وجود ندارد'] };
    let crs = o.crs || o.hintCrs || o.defaultCrs, swap = !!o.swap, detected = null, reason = '';
    const det = detectCRS(pts);
    if (!o.crs) {
      if (o.defaultCrs && o.defaultCrs !== 'EPSG:4326' && o.defaultCrs !== undefined) { crs = o.defaultCrs; reason = 'از سرنخ فایل'; }
      else if (det.status === 'ok') { crs = det.crs; swap = det.swap; reason = det.reason; detected = det; }
      else if (o.hintCrs && o.hintCrs !== 'EPSG:4326' && det.status === 'utm') { crs = o.hintCrs; reason = 'از سرنخ فایل'; }
      else if (o.hintCrs === 'EPSG:4326' && (det.status === 'axis' || det.status === 'ok')) { crs = 'EPSG:4326'; swap = det.status === 'ok' ? det.swap : false; reason = 'فایل WGS84 اعلام کرده است'; }
      else {
        return { ok: false, needsCRS: true, detection: det, candidates: det.candidates, message: 'سیستم مختصات فایل مشخص نیست: ' + det.reason + '. لطفاً سیستم مختصات (و در صورت نیاز ترتیب طول/عرض) را انتخاب کنید.' };
      }
    } else reason = 'انتخاب کاربر';
    if (crs === 'EPSG:4326' && o.crs && o.swap == null && det.status === 'ok') swap = det.swap;
    let ll;
    try { ll = toWGS84(pts, crs, swap); } catch (e) { return { ok: false, errors: ['خطا در تبدیل مختصات: ' + e.message] }; }
    const v = validateRing(ll);
    const warnings = (candidate.warnings || []).concat(v.warnings);
    if (v.valid) {
      const c = v.ring[0];
      if (!(c[0] >= 43 && c[0] <= 64.5 && c[1] >= 24 && c[1] <= 40.5)) warnings.push('موقعیت خارج از محدوده‌ی تقریبی ایران است؛ سیستم مختصات انتخاب‌شده را دوباره بررسی کنید.');
    }
    return { ok: v.valid, errors: v.errors, warnings, ring: v.ring, area: v.area, count: v.count, crs, swap, reason, validity: v.valid ? 'معتبر' : 'نامعتبر' };
  }

  /* ---------------------------------------------------------------- */
  /* موتور ارزش‌گذاری                                                  */
  /* ---------------------------------------------------------------- */
  const SCOPES = { rural_inside: 'داخل محدوده روستا', rural_outside: 'اطراف روستا', urban: 'داخل محدوده شهر' };
  const GRADES = { grade1: 'درجه یک', grade2: 'درجه دو', grade3: 'درجه سه' };
  const AGRI = { irrigated: 'کشاورزی آبی', dry: 'کشاورزی دیم', none: 'بدون کاربری کشاورزی', other: 'سایر' };
  const FARM = { irrigated: 'زراعی آبی', dry: 'زراعی دیم', other: 'سایر' };
  const RES = { confirmed: 'دارای قابلیت مسکونی تأییدشده', denied: 'فاقد قابلیت مسکونی تأییدشده', unknown: 'نامشخص' };
  const URBAN_USES = { residential: 'مسکونی', commercial: 'تجاری', mixed: 'مسکونی و تجاری', agri: 'کشاورزی', other: 'سایر کاربری‌ها' };
  const METHODS = { fixed: 'قیمت ثابت برای هر درجه', range: 'حداقل/حداکثر و انتخاب قیمت توسط کاربر', score: 'پیشنهاد سیستم بر اساس امتیاز' };

  function defaultSettings() {
    const cells = (map) => { const o = {}; Object.keys(map).forEach(k => o[k] = { fixed: map[k], min: null, max: null }); return o; };
    return {
      version: 1,
      updatedAt: nowIso(),
      note: 'قیمت‌ها و ضرایب پیش‌فرض صرفاً نمونه‌ی اولیه‌اند و منبع بازار یا قانونی ندارند؛ حتماً مطابق نظر خود تنظیم کنید.',
      scoring: {
        features: [
          { key: 'asphalt', label: 'دسترسی به جاده آسفالت', points: 10 },
          { key: 'water', label: 'دسترسی به آب', points: 10 },
          { key: 'electricity', label: 'دسترسی به برق', points: 5 },
          { key: 'gas', label: 'دسترسی به گاز', points: 5 },
          { key: 'facilities', label: 'نزدیکی به تأسیسات', points: 5 },
          { key: 'soil', label: 'شرایط خاص خاک', points: 5 },
          { key: 'location', label: 'موقعیت جغرافیایی ممتاز', points: 10 },
          { key: 'agriSpecial', label: 'امکان استفاده کشاورزی ویژه', points: 10 },
          { key: 'other', label: 'سایر امکانات', points: 5 },
        ],
        // ویژگی‌هایی که اگر در «وضعیت ویژه» لحاظ شده باشند دوباره امتیاز نمی‌گیرند
        coveredBySpecial: ['asphalt', 'water'],
        // پیشنهاد (نه اجبار) وضعیت ویژه: اگر مجموع امتیاز ویژگی‌ها ≥ آستانه
        specialSuggestThreshold: 20,
      },
      roundTo: 1,
      groups: {
        rural_inside: {
          method: 'fixed', specialEnabled: true, basePrice: 10000,
          coefficients: { grade1: 8, grade2: 3, grade3: 1 },
          // قاعده‌ها به ترتیب بررسی می‌شوند؛ اولین تطابق برنده است. بدون تطابق ⇒ «نیازمند تعیین دستی»
          rules: [
            { res: 'confirmed', agri: 'irrigated', grade: 'grade1' },
            { res: 'confirmed', agri: 'dry', grade: 'grade2' },
            { res: 'confirmed', agri: 'none', grade: 'grade2' },
            { res: 'denied', agri: 'irrigated', grade: 'grade2' },
            { res: 'denied', agri: 'dry', grade: 'grade3' },
          ],
          cells: {}, byType: { irrigated: {}, dry: {} },
        },
        rural_outside: {
          method: 'fixed', specialEnabled: true,
          cells: Object.assign(cells({ grade1_special: 150000, grade1_normal: 120000, grade2_special: 120000, grade2_normal: 60000, grade3_normal: 30000, grade3_special: 30000 })),
          byType: { irrigated: {}, dry: {} },
        },
        urban: {
          method: 'fixed', specialEnabled: true,
          cells: {}, byType: {},
        },
      },
      urbanUnpricedNote: 'قیمت کاربری‌های شهری پیش‌فرض ندارد؛ در تنظیمات تعریف کنید یا هنگام ثبت قیمت دستی بدهید.',
    };
  }

  function cellKey(parcel) {
    const sp = parcel.special ? 'special' : 'normal';
    if (parcel.scope === 'urban') return (parcel.attrs.urbanUse || 'other') + '_' + sp;
    return parcel.grade + '_' + sp;
  }
  const isNum = (v) => typeof v === 'number' && isFinite(v);

  /** قاعده‌ی رده‌بندی اولیه‌ی زمین داخل روستا */
  function suggestRuralGrade(settings, attrs) {
    const g = settings.groups.rural_inside;
    for (const r of g.rules) {
      if ((r.res === 'any' || r.res === attrs.residential) && (r.agri === 'any' || r.agri === attrs.agri)) {
        return { grade: r.grade, manual: false, reason: `قاعده: ${RES[r.res] || 'هر وضعیت مسکونی'} + ${AGRI[r.agri] || 'هر وضعیت کشاورزی'} ⇒ ${GRADES[r.grade]}` };
      }
    }
    const why = attrs.residential === 'unknown' || !attrs.residential
      ? 'قابلیت مسکونی «نامشخص» است و با هیچ قاعده‌ای تطبیق نیافت'
      : 'ترکیب «' + (RES[attrs.residential] || '—') + ' + ' + (AGRI[attrs.agri] || '—') + '» با هیچ رده‌ای سازگار نیست';
    return { grade: null, manual: true, reason: why + ' — نیازمند تعیین دستی' };
  }

  function featureScore(settings, parcel) {
    const sc = settings.scoring, lines = [];
    let total = 0, max = 0;
    sc.features.forEach(f => {
      max += f.points;
      const on = parcel.features && parcel.features[f.key] && parcel.features[f.key].on;
      if (!on) return;
      if (parcel.special && sc.coveredBySpecial.indexOf(f.key) >= 0 && settings.groups[parcel.scope].specialEnabled) {
        lines.push({ label: f.label, points: 0, note: 'قبلاً در تعیین «وضعیت ویژه» لحاظ شده؛ دوباره امتیاز نمی‌گیرد' });
      } else { total += f.points; lines.push({ label: f.label, points: f.points }); }
    });
    return { total, max, lines };
  }

  /** تابع خالص ارزش‌گذاری */
  function valuate(parcel, settings) {
    const out = { warnings: [], needs: [], explain: [], provisional: false };
    const grp = settings.groups[parcel.scope];
    const area = isNum(parcel.areaOverride) && parcel.areaOverride > 0 ? parcel.areaOverride : parcel.areaComputed;
    out.area = area; out.method = grp.method;
    if (!isNum(area) || area <= 0) out.needs.push('مساحت مبنا مشخص نیست');
    const fs = featureScore(settings, parcel);
    out.score = fs.total; out.scoreMax = fs.max; out.scoreLines = fs.lines;
    if (parcel.scope === 'rural_inside') {
      if (parcel.attrs.residential === 'unknown' || !parcel.attrs.residential) { out.provisional = true; out.explain.push('قابلیت مسکونی «نامشخص» است و مسکونی فرض نشده است'); }
    }
    if (!parcel.grade || parcel.grade === 'manual') {
      if (parcel.scope !== 'urban') { out.needs.push('درجه تعیین نشده است (نیازمند تعیین دستی)'); out.provisional = true; }
    }
    if (parcel.scope !== 'urban' && grp.method === 'score' && !parcel.featuresReviewed) { out.provisional = true; out.explain.push('ویژگی‌ها هنوز بررسی نشده‌اند ⇒ امتیاز موقت'); }
    if (parcel.scope === 'urban' && !parcel.attrs.urbanUse) out.needs.push('کاربری شهری انتخاب نشده است');

    // یافتن سلول قیمت
    let key = null;
    if (parcel.scope === 'urban' ? !!parcel.attrs.urbanUse : (parcel.grade && parcel.grade !== 'manual')) {
      const p2 = Object.assign({}, parcel, { special: grp.specialEnabled ? parcel.special : false });
      key = cellKey(p2);
    }
    out.cellKey = key;
    let fixed = null, min = null, max = null;
    if (key) {
      const typ = parcel.scope === 'rural_inside' ? parcel.attrs.agri : (parcel.scope === 'rural_outside' ? parcel.attrs.farmType : parcel.attrs.urbanUse === 'agri' ? parcel.attrs.agri : null);
      const base = grp.cells[key] || {};
      const ov = (typ && grp.byType && grp.byType[typ] && grp.byType[typ][key]) || {};
      const pick = (f) => isNum(ov[f]) ? ov[f] : (isNum(base[f]) ? base[f] : null);
      fixed = pick('fixed');
      out.priceSource = isNum(ov.fixed) ? 'قیمت جداگانه‌ی ' + (typ === 'irrigated' ? 'آبی' : 'دیم') : 'قیمت پایه‌ی درجه';
      if (fixed == null && parcel.scope === 'rural_inside') {
        const g = key.split('_')[0];
        if (isNum(grp.coefficients[g]) && isNum(grp.basePrice)) { fixed = grp.basePrice * grp.coefficients[g]; out.priceSource = `قیمت پایه ${grp.basePrice.toLocaleString('en')} × ضریب ${grp.coefficients[g]}`; }
      }
      min = pick('min'); max = pick('max');
      if (min == null) min = fixed; if (max == null) max = fixed;
      if (parcel.scope === 'rural_inside' && fixed != null) { // بازه‌ی پیش‌فرض: همان قیمت
        if (min == null) min = fixed; if (max == null) max = fixed;
      }
    }
    out.cell = { fixed, min, max };
    // قیمت پیشنهادی
    let suggested = null;
    if (key) {
      if (grp.method === 'fixed') {
        suggested = fixed;
        out.explain.push(fixed != null ? `روش «قیمت ثابت»: ${out.priceSource}؛ امتیازها روی قیمت اثری ندارند` : 'برای این درجه/کاربری قیمت ثابت تعریف نشده است');
      } else if (grp.method === 'range') {
        out.explain.push(`روش «حداقل/حداکثر»: بازه ${min != null ? min.toLocaleString('en') : '؟'} تا ${max != null ? max.toLocaleString('en') : '؟'} تومان؛ قیمت را کاربر تعیین می‌کند`);
        if (isNum(parcel.pricing.userPrice)) suggested = parcel.pricing.userPrice;
      } else if (grp.method === 'score') {
        if (min != null && max != null && fs.max > 0) {
          const ratio = Math.min(1, fs.total / fs.max);
          suggested = min + (max - min) * ratio;
          out.explain.push(`روش «امتیاز»: ${min.toLocaleString('en')} + (${max.toLocaleString('en')} − ${min.toLocaleString('en')}) × (${fs.total}/${fs.max}) = ${Math.round(suggested).toLocaleString('en')} تومان`);
        } else out.explain.push('برای روش امتیاز حداقل/حداکثر تعریف نشده است');
      }
      if (suggested != null) suggested = Math.round(suggested / (settings.roundTo || 1)) * (settings.roundTo || 1);
    }
    out.suggested = suggested;
    // قیمت نهایی: ویرایش دستی همیشه برنده است
    const ov = parcel.pricing && parcel.pricing.override;
    if (isNum(ov) && ov >= 0) { out.price = ov; out.priceKind = 'دستی'; out.explain.push('قیمت نهایی را کاربر دستی تعیین کرده است'); }
    else { out.price = suggested; out.priceKind = suggested != null ? 'محاسبه‌شده' : null; }
    if (grp.method === 'range' && out.price != null && min != null && max != null && (out.price < min || out.price > max)) out.warnings.push('قیمت خارج از بازه‌ی تعریف‌شده است');
    if (out.price == null) out.needs.push('قیمت نهایی مشخص نیست');
    out.total = out.price != null && isNum(area) && area > 0 ? Math.round(area * out.price) : null;
    if (out.needs.length) out.provisional = true;
    out.status = out.total == null ? 'ناقص' : (out.provisional ? 'موقت' : 'قطعی');
    return out;
  }

  /**
   * ارزش جاری زمین — منبع حقیقت همه‌ی فهرست‌ها.
   * `valuation` هنوز برای سازگاری/تاریخچه ذخیره می‌شود، اما هیچ صفحه‌ای نباید
   * برای مساحت یا مبلغ فعلی آن را به‌عنوان عدد قطعی بخواند؛ هر بار باید از
   * هندسه/متراژ مبنا و تنظیمات فعلی دوباره محاسبه شود.
   * برای فایل‌های قدیمی که فقط عکس ارزش‌گذاری دارند، تا وقتی اطلاعات پایه
   * موجود نیست همان عکس به‌عنوان سازگاری موقت برگردانده می‌شود.
   */
  function currentValuation(parcel, settings) {
    if (!parcel) return { area: null, price: null, total: null, status: 'ناقص', warnings: [], needs: ['زمین پیدا نشد'] };
    if (settings && settings.groups && settings.groups[parcel.scope]) {
      const live = valuate(parcel, settings);
      live.pricePerM2 = live.price;
      const hasBase = (isNum(parcel.areaOverride) && parcel.areaOverride > 0) || isNum(parcel.areaComputed);
      if (hasBase || live.total != null || !parcel.valuation) return live;
    }
    const v = parcel.valuation || {};
    return {
      area: v.area != null ? v.area : (parcel.areaOverride || parcel.areaComputed || null),
      price: v.pricePerM2 != null ? v.pricePerM2 : null,
      pricePerM2: v.pricePerM2 != null ? v.pricePerM2 : null,
      total: v.total != null ? v.total : null,
      priceKind: v.priceKind, status: v.status || (v.total != null ? 'قطعی' : 'ناقص'),
      provisional: !!v.provisional, score: v.score || 0, scoreMax: v.scoreMax || 0,
      warnings: v.warnings || [], needs: v.needs || [], explain: v.explain || [],
    };
  }
  function currentParcelValueF(state, parcel) {
    const v = currentValuation(parcel, state && state.settings);
    return isNum(v.total) ? frac(Math.round(v.total)) : F0();
  }

  /** ثبت نتیجه‌ی ارزش‌گذاری در خود زمین (snapshot) */
  function applyValuation(parcel, settings, reason) {
    const v = valuate(parcel, settings);
    const prev = parcel.valuation;
    parcel.valuation = {
      pricePerM2: v.price, priceKind: v.priceKind, total: v.total, area: v.area, score: v.score, scoreMax: v.scoreMax,
      status: v.status, provisional: v.provisional, settingsVersion: settings.version, method: v.method,
      cellKey: v.cellKey, explain: v.explain, scoreLines: v.scoreLines, warnings: v.warnings, needs: v.needs,
      calculatedAt: nowIso(),
    };
    parcel.updatedAt = nowIso();
    parcel.history = parcel.history || [];
    if (!prev || prev.pricePerM2 !== v.price || prev.total !== v.total || reason) {
      parcel.history.push({ at: nowIso(), type: 'valuation', reason: reason || 'محاسبه', from: prev ? prev.pricePerM2 : null, to: v.price, settingsVersion: settings.version });
    }
    return v;
  }

  function newParcel(init) {
    const t = nowIso();
    return Object.assign({
      id: uid('land'), name: '', scope: 'rural_inside', estateId: null, holderId: null, coOwners: [],
      geometry: null, areaComputed: null, areaOverride: null,
      attrs: { residential: 'unknown', agri: 'none', farmType: 'irrigated', urbanUse: 'residential' },
      grade: 'manual', gradeSource: 'auto', gradeReason: '', special: false, specialReason: '',
      features: {}, featuresReviewed: false, notes: '',
      pricing: { override: null, userPrice: null }, priceMode: 'frozen',
      valuation: null, history: [], createdAt: t, updatedAt: t,
    }, init || {});
  }

  /* ---------------------------------------------------------------- */
  /* وضعیت کل برنامه، تنظیمات و تاریخچه‌ی قیمت                         */
  /* ---------------------------------------------------------------- */
  function defaultInheritanceRule() {
    return { mode: 'iran_preset', jurisdiction: 'iran_shia', legalReviewed: false, ratios: {}, relations: {}, debt: '', will: '', note: '' };
  }
  function defaultAllocationPolicy() {
    return { mode: 'ask', preserveExisting: true, indivisible: 'physical_then_cash', splitMode: 'area', allowCoownership: false, mixKeys: ['scope', 'grade', 'type', 'special'], personWeights: {}, resolutions: {}, includeUnclassified: true };
  }
  function ensureTrash(state) {
    state.trash = state.trash || { parcels: [], persons: [], estates: [] };
    state.trash.parcels = Array.isArray(state.trash.parcels) ? state.trash.parcels : [];
    state.trash.persons = Array.isArray(state.trash.persons) ? state.trash.persons : [];
    state.trash.estates = Array.isArray(state.trash.estates) ? state.trash.estates : [];
    return state.trash;
  }
  function newProfileMeta(name, parentId) {
    const t = nowIso(); return { id: uid('profile'), name: name || 'پرونده‌ی جدید', parentId: parentId || null, createdAt: t, updatedAt: t };
  }
  /** ساخت فایل پروفایل مستقل از زیرمجموعه‌ی فعلی؛ ارزش‌ها در پروفایل مقصد دوباره محاسبه می‌شوند. */
  function createProfilePackage(state, opts) {
    opts = opts || {};
    const ids = Array.isArray(opts.parcelIds) ? new Set(opts.parcelIds.map(String)) : new Set((state.parcels || []).map(p => String(p.id)));
    const raw = clone(state), usedEstates = new Set();
    raw.parcels = raw.parcels.filter(p => ids.has(String(p.id)));
    raw.parcels.forEach(p => { if (p.estateId) usedEstates.add(p.estateId); });
    const personIds = Array.isArray(opts.personIds) ? new Set(opts.personIds) : new Set(raw.persons.map(person => person.id));
    raw.persons = raw.persons.filter(p => personIds.has(p.id));
    raw.estates = raw.estates.filter(e => usedEstates.has(e.id));
    raw.house = clone(state.house || { amount: '', receivers: [], payer: '' });
    raw.house.receivers = (raw.house.receivers || []).filter(id => personIds.has(id)); if (!personIds.has(raw.house.payer)) raw.house.payer = '';
    raw.adjust = Object.keys(state.adjust || {}).reduce((out, id) => { if (personIds.has(id)) out[id] = state.adjust[id]; return out; }, {});
    raw.familySplits = Object.keys(state.familySplits || {}).reduce((out, id) => { if (personIds.has(id)) out[id] = clone(state.familySplits[id]); return out; }, {});
    raw.inheritanceRule = clone(state.inheritanceRule || defaultInheritanceRule());
    raw.inheritanceRule.ratios = Object.keys(raw.inheritanceRule.ratios || {}).reduce((out, id) => { if (personIds.has(id)) out[id] = raw.inheritanceRule.ratios[id]; return out; }, {});
    raw.inheritanceRule.relations = Object.keys(raw.inheritanceRule.relations || {}).reduce((out, id) => { if (personIds.has(id)) out[id] = raw.inheritanceRule.relations[id]; return out; }, {});
    raw.allocationPolicy = clone(state.allocationPolicy || defaultAllocationPolicy());
    raw.allocationPolicy.personWeights = Object.keys(raw.allocationPolicy.personWeights || {}).reduce((out, id) => { if (personIds.has(id)) out[id] = raw.allocationPolicy.personWeights[id]; return out; }, {});
    raw.scenarios = (raw.scenarios || []).filter(sc => !Array.isArray(sc.parcelIds) || sc.parcelIds.some(id => ids.has(String(id)))).map(sc => { const out = clone(sc); if (Array.isArray(out.parcelIds)) out.parcelIds = out.parcelIds.filter(id => ids.has(String(id))); if (Array.isArray(out.personIds)) out.personIds = out.personIds.filter(id => personIds.has(id)); return out; });
    raw.randomDivision = raw.randomDivision && (!Array.isArray(raw.randomDivision.selectedIds) || raw.randomDivision.selectedIds.some(id => ids.has(String(id)))) ? raw.randomDivision : null;
    raw.allocationRun = raw.allocationRun ? clone(raw.allocationRun) : null;
    raw.divisionSelection = { mode: 'all', scopes: [], grades: [], types: [], estates: [], ids: null, excludedIds: [], includeUnclassified: true };
    raw.profile = newProfileMeta(opts.name || 'پروفایل جدید', state.profile && state.profile.id); raw.profile.note = opts.note || 'ساخته‌شده از زیرمجموعه‌ی پروفایل مادر';
    raw.trash = { parcels: [], persons: [], estates: [] }; raw.log = (raw.log || []).slice(-200).concat([{ at: nowIso(), msg: 'ساخت پروفایل مستقل' }]);
    return raw;
  }
  function inheritanceRatios(state) {
    const rule = state && state.inheritanceRule || {}, r = rule.ratios && typeof rule.ratios === 'object' ? rule.ratios : {};
    const explicit = Object.keys(r).some(id => { const f = toFrac(r[id]); return f && fSign(f) > 0; });
    if (explicit) return r;
    // تنها preset خودکارِ کم‌ابهام: فرزندانِ پسر/دختر در نبود همسر/والدین
    // با واحدهای ۲ و ۱ پیشنهاد می‌شوند؛ این «حکم حقوقی» نیست و باید تأیید شود.
    if (rule.jurisdiction === 'iran_shia' && state && Array.isArray(state.persons) && state.persons.length && Object.keys(rule.relations || {}).length === state.persons.length) {
      const rels = state.persons.map(p => rule.relations[p.id]);
      if (rels.every(x => x === 'son' || x === 'daughter') && rels.some(x => x === 'son') && rels.some(x => x === 'daughter')) {
        const out = {}; state.persons.forEach(p => { out[p.id] = rule.relations[p.id] === 'son' ? '2' : '1'; }); return out;
      }
    }
    return {};
  }

  function newState() {
    const s = defaultSettings();
    return {
      schema: 1, settings: s,
      settingsHistory: [{ version: s.version, at: s.updatedAt, settings: clone(s), reason: 'نسخه‌ی اولیه' }],
      parcels: [], persons: [], estates: [], scenarios: [], log: [],
      profile: newProfileMeta('پرونده‌ی اصلی', null),
      trash: { parcels: [], persons: [], estates: [] },
      inheritanceRule: defaultInheritanceRule(), allocationPolicy: defaultAllocationPolicy(), allocationRun: null,
      house: { amount: '', receivers: [], payer: '' }, adjust: {},
      // حالت تقسیم زنده: همه‌ی زمین‌ها از ابتدا انتخاب‌اند؛ کاربر می‌تواند
      // فیلتر یا حذف موردی بسازد بدون این‌که ترتیب/داده‌ی زمین‌ها تغییر کند.
      divisionSelection: { mode: 'all', scopes: [], grades: [], types: [], estates: [], ids: null, excludedIds: [], includeUnclassified: true },
      familySplits: {}, randomDivision: null,
    };
  }
  function addParcel(state, parcel) {
    applyValuation(parcel, state.settings, 'ثبت اولیه');
    state.parcels.push(parcel);
    state.log.push({ at: nowIso(), msg: 'ثبت زمین «' + (parcel.name || parcel.id) + '»' });
    return parcel;
  }
  function saveParcel(state, parcel, reason) {
    const i = state.parcels.findIndex(p => p.id === parcel.id);
    applyValuation(parcel, state.settings, reason || 'ویرایش');
    if (i >= 0) state.parcels[i] = parcel; else state.parcels.push(parcel);
    state.log.push({ at: nowIso(), msg: 'ذخیره‌ی زمین «' + (parcel.name || parcel.id) + '»' });
  }
  /** حذف یک زمین از فهرست فعال؛ پرونده‌های زنده هم از شناسه‌ی آن پاک می‌شوند. */
  function removeParcel(state, parcelId) {
    const before = (state.parcels || []).length, removed = (state.parcels || []).find(p => p.id === parcelId);
    if (!removed) return false;
    ensureTrash(state).parcels.push({ deletedAt: nowIso(), item: clone(removed) });
    state.parcels = (state.parcels || []).filter(p => p.id !== parcelId);
    if (state.parcels.length === before) return false;
    (state.scenarios || []).forEach(sc => {
      if (sc.live) {
        sc.parcelIds = (sc.parcelIds || []).filter(id => id !== parcelId);
        (sc.sections || []).forEach(sec => { sec.parcelIds = (sec.parcelIds || []).filter(id => id !== parcelId); });
        if (sc.allocations) delete sc.allocations[parcelId];
      }
    });
    if (state.divisionSelection) {
      if (Array.isArray(state.divisionSelection.ids)) state.divisionSelection.ids = state.divisionSelection.ids.filter(id => id !== parcelId);
      if (Array.isArray(state.divisionSelection.excludedIds)) state.divisionSelection.excludedIds = state.divisionSelection.excludedIds.filter(id => id !== parcelId);
    }
    state.log = state.log || [];
    state.log.push({ at: nowIso(), msg: 'حذف زمین «' + parcelId + '»' });
    return true;
  }

  /** اعمال تنظیمات جدید. policy: 'keep' = حفظ قیمت قبلی (پیش‌فرض)، 'recalc' = محاسبه‌ی مجدد (همه یا ids) */
  function updateSettings(state, newSettings, policy, ids, reason) {
    policy = policy || 'keep';
    const s = clone(newSettings);
    s.version = state.settings.version + 1;
    s.updatedAt = nowIso();
    state.settings = s;
    state.settingsHistory.push({ version: s.version, at: s.updatedAt, settings: clone(s), reason: reason || 'تغییر تنظیمات', policy });
    let changed = 0;
    if (policy === 'recalc') {
      state.parcels.forEach(p => {
        if (ids && ids.indexOf(p.id) < 0) return;
        const before = p.valuation && p.valuation.pricePerM2;
        applyValuation(p, s, 'محاسبه‌ی مجدد با قیمت‌های نسخه‌ی ' + s.version);
        p.priceMode = 'live';
        if (before !== p.valuation.pricePerM2) changed++;
      });
    }
    state.log.push({ at: nowIso(), msg: `تنظیمات به نسخه‌ی ${s.version} رسید (${policy === 'recalc' ? 'محاسبه‌ی مجدد: ' + changed + ' زمین تغییر کرد' : 'قیمت زمین‌های ثبت‌شده حفظ شد'})` });
    return { version: s.version, changed };
  }

  /* ---------------------------------------------------------------- */
  /* اشخاص و موتور تقسیم                                               */
  /* همه‌ی محاسبه‌ها (حق هر شخص، سهم دریافتی، اختلاف، جمع سهم‌ها) با کسر   */
  /* دقیق انجام می‌شود و هیچ‌جا به هوش مصنوعی یا سرویس بیرونی نیاز ندارد. */
  /* ---------------------------------------------------------------- */
  /** کسر وزن شخص: از ذخیره‌ی دقیق (wnum/wden) یا از عدد weight */
  function personWeightFrac(p) {
    if (!p) return F1();
    const packed = (p.wnum != null && p.wden != null) ? toFrac({ num: p.wnum, den: p.wden }) : null;
    const f = packed || toFrac(p.weight) || F1();
    return fSign(f) > 0 ? f : F1();
  }
  function addPerson(state, name, weight) {
    let w = toFrac(weight);
    if (!w || fSign(w) <= 0) w = F1();
    const p = { id: uid('p'), name: name, weight: fToNumber(w), wnum: String(w.n), wden: String(w.d) };
    state.persons.push(p); return p;
  }
  /** تغییر سهم نسبی با ورودی دقیق («1.5» یا «3/2» یا «۱٫۵»)؛ اگر معتبر نباشد null */
  function setPersonWeight(state, personId, weight) {
    const p = (state.persons || []).find(x => x.id === personId);
    if (!p) return null;
    const w = toFrac(weight);
    if (!w || fSign(w) <= 0) return null;
    p.weight = fToNumber(w); p.wnum = String(w.n); p.wden = String(w.d);
    return w;
  }
  /** ساخت سناریو با «عکس» قیمت‌های فعلی؛ سناریوهای قدیمی دست‌نخورده می‌مانند */
  function createScenario(state, name, parcelIds) {
    const snap = {};
    state.parcels.filter(p => !parcelIds || parcelIds.indexOf(p.id) >= 0).forEach(p => {
      const v = currentValuation(p, state.settings);
      snap[p.id] = {
        name: p.name, scope: p.scope, area: v.area, pricePerM2: v.pricePerM2, total: v.total, special: !!p.special,
        agri: p.scope === 'rural_outside' ? p.attrs.farmType : (p.scope === 'rural_inside' || p.attrs.urbanUse === 'agri' ? p.attrs.agri : null),
        grade: p.grade, urbanUse: p.attrs.urbanUse, status: v.status, estateId: p.estateId || null,
      };
    });
    const sc = {
      id: uid('sc'), name: name || 'سناریو', createdAt: nowIso(), settingsVersion: state.settings.version,
      parcels: snap, allocations: {},
      // مبنای قیمت: پیش‌فرض همان «عکس» لحظه‌ی ساخت؛ کاربر می‌تواند زنده یا نسخه‌ی دیگری را انتخاب کند
      priceBasis: { mode: 'snapshot', level: 'base', version: state.settings.version, factor: 1, ignoreOverride: false },
      estates: null,   // null = همه‌ی دسته‌های اموال در محاسبه هستند
    };
    state.scenarios.push(sc); return sc;
  }

  /* ---------------------------------------------------------------- */
  /* دسته‌های اموال (منابع) — سهم متفاوت هر شخص در هر دسته               */
  /* مثال: «اموال پدری» هر پسر ۱، «اموال دره‌گرمی» دو پسرِ شریک ۴/۳.      */
  /* محاسبه‌ی مشترک = جمعِ حقِ هر نفر در همه‌ی دسته‌ها (بدون محدودیت تعداد). */
  /* ---------------------------------------------------------------- */
  const NO_ESTATE = '';
  const NO_ESTATE_NAME = 'دسته‌بندی‌نشده';
  /** شناسه‌ی دسته‌ی یک زمین (زمین بدون دسته ⇒ رشته‌ی خالی) */
  const estateIdOf = (x) => (x && x.estateId) ? String(x.estateId) : NO_ESTATE;

  function newEstate(name, note) {
    return { id: uid('est'), name: name || 'دسته‌ی اموال', note: note || '', weights: {}, createdAt: nowIso() };
  }
  function addEstate(state, name, note) {
    state.estates = state.estates || [];
    const e = newEstate(name, note);
    state.estates.push(e);
    if (state.log) state.log.push({ at: nowIso(), msg: 'ثبت دسته‌ی اموال «' + e.name + '»' });
    return e;
  }
  function findEstate(state, id) { return id ? ((state.estates || []).find(e => e.id === id) || null) : null; }
  /** حذف دسته: زمین‌ها و سناریوها «دسته‌بندی‌نشده» می‌شوند (هیچ داده‌ای گم نمی‌شود) */
  function removeEstate(state, id) {
    const removed = (state.estates || []).find(e => e.id === id); if (!removed) return false;
    const affectedParcelIds = (state.parcels || []).filter(p => p.estateId === id).map(p => p.id);
    ensureTrash(state).estates.push({ deletedAt: nowIso(), item: clone(removed), affectedParcelIds });
    state.estates = (state.estates || []).filter(e => e.id !== id);
    (state.parcels || []).forEach(p => { if (p.estateId === id) p.estateId = null; });
    (state.scenarios || []).forEach(sc => {
      Object.keys(sc.parcels || {}).forEach(k => { if (sc.parcels[k].estateId === id) sc.parcels[k].estateId = null; });
      if (Array.isArray(sc.estates)) sc.estates = sc.estates.filter(x => x !== id);
    });
    return true;
  }
  /** سهم نسبی یک شخص در یک دسته (کسر دقیق؛ ثبت‌نشده = صفر) */
  function estateWeightFrac(estate, personId) {
    if (!estate || !estate.weights) return F0();
    const w = estate.weights[personId];
    if (w == null || w === '') return F0();
    const f = toFrac(w);
    return f && fSign(f) > 0 ? f : F0();
  }
  /** ثبت سهم نسبی شخص در یک دسته؛ ورودی «1»، «4/3»، «۱٫۵» یا خالی/صفر برای حذف. نامعتبر ⇒ null */
  function setEstateWeight(state, estateId, personId, weight) {
    const e = findEstate(state, estateId);
    if (!e) return null;
    e.weights = e.weights || {};
    if (weight == null || weight === '') { delete e.weights[personId]; return F0(); }
    const f = toFrac(weight);
    if (!f || fSign(f) < 0) return null;
    if (fSign(f) === 0) { delete e.weights[personId]; return F0(); }
    e.weights[personId] = fPack(f);
    return f;
  }
  /** همه‌ی اشخاص با سهم برابر در یک دسته */
  function setEstateEqualWeights(state, estateId, personIds) {
    const e = findEstate(state, estateId);
    if (!e) return null;
    e.weights = {};
    (personIds || (state.persons || []).map(p => p.id)).forEach(id => { e.weights[id] = fPack(F1()); });
    return e.weights;
  }
  /**
   * وزن مؤثر اشخاص در یک دسته:
   * اگر برای دسته‌ای هیچ سهمی ثبت نشده باشد، از «سهم پیش‌فرض» خود اشخاص استفاده می‌شود
   * (تا پروژه‌های قدیمی و دسته‌های تازه‌ساخته بدون تنظیم هم درست محاسبه شوند).
   */
  function estateWeights(state, estateId) {
    const persons = state.persons || [];
    const est = findEstate(state, estateId);
    let ws = persons.map(p => estateWeightFrac(est, p.id));
    let sum = F0(); ws.forEach(w => { sum = fAdd(sum, w); });
    let usedDefault = false;
    if (fSign(sum) <= 0) {
      ws = persons.map(personWeightFrac);
      sum = F0(); ws.forEach(w => { sum = fAdd(sum, w); });
      usedDefault = true;
    }
    return { id: estateId || NO_ESTATE, name: est ? est.name : NO_ESTATE_NAME, estate: est, weights: ws, sum, usedDefault };
  }
  /** انتساب زمین به یک دسته (زمین اصلی و در صورت نیاز عکس سناریوها) */
  function setParcelEstate(state, parcelId, estateId, alsoScenarios) {
    const p = (state.parcels || []).find(x => x.id === parcelId);
    if (p) p.estateId = estateId || null;
    if (alsoScenarios) (state.scenarios || []).forEach(sc => { if (sc.parcels && sc.parcels[parcelId]) sc.parcels[parcelId].estateId = estateId || null; });
    return p || null;
  }

  /* ---------------------------------------------------------------- */
  /* مبنای قیمت سناریو: با تغییر آن، همه‌ی محاسبه‌ها دوباره انجام می‌شود   */
  /* ---------------------------------------------------------------- */
  const PRICE_MODES = { snapshot: 'قیمت‌های ثبت‌شده در سناریو', live: 'قیمت‌های فعلی برنامه', version: 'نسخه‌ی مشخصی از تنظیمات' };
  const PRICE_LEVELS = { base: 'قیمت پایه‌ی هر ردیف', min: 'حداقلِ بازه', max: 'حداکثرِ بازه' };

  function normBasis(b) {
    const x = b || {};
    const factor = (typeof x.factor === 'number' && isFinite(x.factor) && x.factor > 0) ? x.factor : 1;
    return {
      mode: PRICE_MODES[x.mode] ? x.mode : 'snapshot',
      level: PRICE_LEVELS[x.level] ? x.level : 'base',
      version: x.version == null ? null : Number(x.version),
      factor, ignoreOverride: !!x.ignoreOverride,
    };
  }
  /** تغییر مبنای قیمت سناریو (همیشه نرمال و معتبر ذخیره می‌شود) */
  function setScenarioBasis(sc, patch) {
    sc.priceBasis = normBasis(Object.assign({}, normBasis(sc.priceBasis), patch || {}));
    return sc.priceBasis;
  }
  /** تنظیماتِ نسخه‌ی موردنظر مبنا (نسخه‌ی گم‌شده ⇒ تنظیمات فعلی + هشدار) */
  function basisSettings(state, basis) {
    const b = normBasis(basis);
    if (b.mode === 'version' && b.version != null) {
      const h = (state.settingsHistory || []).find(x => x.version === b.version);
      if (h && h.settings) return { settings: h.settings, version: h.version, missing: false };
      return { settings: state.settings, version: state.settings.version, missing: true };
    }
    return { settings: state.settings, version: state.settings.version, missing: false };
  }
  /**
   * «سطح قیمت مرجع»: جدول قیمت‌ها را روی حداقل یا حداکثرِ بازه‌ی هر ردیف می‌نشاند.
   * base ⇒ بدون تغییر. min/max ⇒ قیمت همان سطح، روش «ثابت» (تا امتیاز/بازه دوباره دخالت نکند).
   */
  function priceLevelSettings(settings, level) {
    if (!level || level === 'base') return settings;
    const s = clone(settings);
    Object.keys(s.groups || {}).forEach(gk => {
      const g = s.groups[gk];
      g.method = 'fixed';
      const fix = (cell) => { if (cell && isNum(cell[level])) cell.fixed = cell[level]; };
      Object.keys(g.cells || {}).forEach(k => fix(g.cells[k]));
      Object.keys(g.byType || {}).forEach(t => Object.keys(g.byType[t] || {}).forEach(k => fix(g.byType[t][k])));
    });
    return s;
  }
  /** شرح فارسی مبنای قیمت برای نمایش و برگه‌ی چاپی */
  function basisText(state, basis) {
    const b = normBasis(basis);
    const bs = basisSettings(state, b);
    let t = b.mode === 'snapshot' ? 'قیمت‌های ثبت‌شده در خود سناریو'
      : b.mode === 'live' ? 'قیمت‌های فعلی برنامه (نسخه‌ی ' + bs.version + ' تنظیمات)'
        : 'تنظیمات نسخه‌ی ' + bs.version;
    if (b.mode !== 'snapshot') {
      if (b.level !== 'base') t += ' — سطح ' + PRICE_LEVELS[b.level];
      if (b.factor !== 1) t += ' — ضریب ' + trim0(b.factor.toFixed(4)) + '×';
      if (b.ignoreOverride) t += ' — بدون قیمت‌های دستی';
    }
    return t;
  }
  /**
   * قیمت و ارزش هر زمین سناریو بر پایه‌ی مبنای انتخابی.
   * خروجی هم‌شکلِ عکسِ سناریو است تا بقیه‌ی محاسبه‌ها دست‌نخورده بماند.
   */
  function scenarioPrices(state, sc) {
    const b = normBasis(sc.priceBasis);
    const out = {};
    if (b.mode === 'snapshot') {
      Object.keys(sc.parcels || {}).forEach(id => { out[id] = Object.assign({}, sc.parcels[id], { priceFrom: 'snapshot' }); });
      return out;
    }
    const bs = basisSettings(state, b);
    const st = priceLevelSettings(bs.settings, b.level);
    const rt = (st.roundTo && st.roundTo > 0) ? st.roundTo : 1;
    Object.keys(sc.parcels || {}).forEach(id => {
      const snap = sc.parcels[id];
      const live = (state.parcels || []).find(p => p.id === id);
      if (!live) { out[id] = Object.assign({}, snap, { priceFrom: 'snapshot', missingParcel: true }); return; }
      const p2 = clone(live);
      if (b.ignoreOverride) p2.pricing = Object.assign({}, p2.pricing || {}, { override: null });
      const v = valuate(p2, st);
      let price = v.price;
      if (isNum(price) && b.factor !== 1) price = Math.round((price * b.factor) / rt) * rt;
      const area = isNum(v.area) ? v.area : snap.area;
      const total = (isNum(price) && isNum(area) && area > 0) ? Math.round(area * price) : null;
      out[id] = {
        name: live.name || snap.name, scope: live.scope, area, pricePerM2: price, total,
        special: !!live.special,
        agri: live.scope === 'rural_outside' ? live.attrs.farmType : (live.scope === 'rural_inside' || live.attrs.urbanUse === 'agri' ? live.attrs.agri : null),
        grade: live.grade, urbanUse: live.attrs.urbanUse,
        status: total == null ? 'ناقص' : v.status,
        estateId: live.estateId || snap.estateId || null,
        priceFrom: b.mode, priceKind: v.priceKind, settingsVersion: bs.version, level: b.level, factor: b.factor,
      };
    });
    return out;
  }
  /**
   * ثبت سهم یک شخص از یک زمین با کسر دقیق.
   * ورودی: عدد (۰٫۱۲۵)، رشته‌ی درصد («12.5» یا «۱۲٫۵٪»)، کسر («1/8»، «۱/۸») یا کسر بسته‌بندی‌شده.
   * opts.percent = true ⇒ عدد/رشته «درصد» تلقی می‌شود (پیش‌فرض برای ورودی بدون «/»).
   */
  function setAllocation(scenario, parcelId, personId, fraction, opts) {
    const list = (scenario.allocations[parcelId] || []).filter(x => x.personId !== personId);
    let f = null;
    // رشته‌ی خالی از کاربر یعنی «درصد» (۱۲٫۵ ⇒ ۱/۸)؛ با opts.share=false کسر مستقیم تلقی می‌شود
    if (typeof fraction === 'string' && !(opts && opts.share === false)) {
      const s = parseShare(fraction);
      if (s && s.frac) f = s.frac;
    }
    if (!f) f = toFrac(fraction);
    if (f && fSign(f) > 0) {
      const a = scenario.allocations[parcelId] = list;
      a.push(Object.assign({ personId, fraction: fToNumber(f), shareText: (opts && opts.text) || fText(f) }, fPack(f)));
    } else if (list.length) scenario.allocations[parcelId] = list;
    if (scenario.allocations[parcelId] && !scenario.allocations[parcelId].length) delete scenario.allocations[parcelId];
  }
  /** کسر دقیق یک رکورد سهم (با سازگاری فایل‌های قدیمی که فقط fraction اعشاری دارند) */
  function allocFrac(a) {
    if (!a) return F0();
    const packed = (a.num != null && a.den != null) ? toFrac({ num: a.num, den: a.den }) : null;
    return packed || toFrac(a.fraction) || F0();
  }
  /** جمع دقیق سهم‌های یک زمین */
  function allocSum(scenario, parcelId) {
    return (scenario.allocations[parcelId] || []).reduce((s, a) => fAdd(s, allocFrac(a)), F0());
  }
  /** سهم برابر و دقیق بین n نفر (مثلاً ۳ نفر ⇒ هرکس دقیقاً ۱/۳) */
  function setEqualAllocation(scenario, parcelId, personIds) {
    const n = (personIds || []).length;
    if (!n) return null;
    const f = frac(1, n);
    scenario.allocations[parcelId] = personIds.map(id => Object.assign({ personId: id, fraction: fToNumber(f), shareText: fText(f) }, fPack(f)));
    return f;
  }

  /**
   * ارزیابی سناریو با حساب دقیق:
   * pool (ارزش کل)، حق هر شخص، دریافتی، اختلاف، جمع سهم‌ها و کنترل‌های درستی.
   * گردکردن فقط در فیلدهای نمایشی (entitled/received/diff) انجام می‌شود.
   */
  function evaluateScenario(state, sc) {
    if (sc && sc.live) return evaluateCase(state, sc);
    const persons = state.persons || [];
    const basis = normBasis(sc.priceBasis);
    // قیمت هر زمین بر پایه‌ی «مبنای قیمت» انتخابی (عکس سناریو، قیمت فعلی یا نسخه‌ای از تنظیمات)
    const priced = scenarioPrices(state, sc);
    const allIds = Object.keys(sc.parcels);
    const incl = Array.isArray(sc.estates) ? sc.estates.map(x => (x == null ? NO_ESTATE : String(x))) : null;
    const poolIds = incl ? allIds.filter(id => incl.indexOf(estateIdOf(priced[id])) >= 0) : allIds;
    const skipped = incl ? allIds.filter(id => poolIds.indexOf(id) < 0).map(id => (priced[id].name || id)) : [];
    const errors = [], warnings = [];
    // ارزش کل مجموعه: total ها عدد صحیح‌اند ⇒ جمع دقیق
    let poolF = F0();
    const incomplete = [];
    const estateBuckets = {};
    poolIds.forEach(id => {
      const sp = priced[id];
      const eid = estateIdOf(sp);
      (estateBuckets[eid] = estateBuckets[eid] || []).push(id);
      const tt = sp.total;
      if (isNum(tt)) poolF = fAdd(poolF, frac(Math.round(tt)));
      else incomplete.push(sp.name || id);
    });
    if (incomplete.length) errors.push('زمین‌های بدون ارزش قطعی در مجموع لحاظ نشده‌اند: ' + incomplete.join('، '));
    if (priced && Object.keys(priced).some(id => priced[id].missingParcel)) warnings.push('بعضی زمین‌های این سناریو دیگر در فهرست زمین‌ها نیستند؛ برای آن‌ها قیمت ثبت‌شده‌ی خود سناریو به کار رفت.');

    // وزن پیش‌فرض اشخاص (برای دسته‌بندی‌نشده‌ها و پروژه‌های قدیمی)
    const wFs = persons.map(personWeightFrac);
    let wSum = F0(); wFs.forEach(w => { wSum = fAdd(wSum, w); });

    /* حق هر شخص = جمعِ «ارزش هر دسته × سهم او در همان دسته»  */
    const estateIds = Object.keys(estateBuckets);
    const groups = estateIds.map(eid => {
      const ids = estateBuckets[eid];
      let pf = F0();
      ids.forEach(id => { const tt = priced[id].total; if (isNum(tt)) pf = fAdd(pf, frac(Math.round(tt))); });
      const w = estateWeights(state, eid || null);
      return { id: eid, name: w.name, poolF: pf, weights: w.weights, weightSum: w.sum, usedDefault: w.usedDefault, parcelIds: ids };
    });
    const entitledF = persons.map(() => F0());
    const perEstate = persons.map(() => []);
    groups.forEach(g => {
      const noW = fSign(g.weightSum) <= 0;
      if (noW && fSign(g.poolF) > 0) errors.push('برای دسته‌ی «' + g.name + '» هیچ سهمی ثبت نشده است؛ ارزش آن (' + Math.round(fToNumber(g.poolF)).toLocaleString('en') + ' تومان) بین کسی تقسیم نشد.');
      else if (g.usedDefault && g.id) warnings.push('برای دسته‌ی «' + g.name + '» سهم جداگانه‌ای ثبت نشده است؛ «سهم پیش‌فرض» اشخاص به کار رفت.');
      persons.forEach((p, i) => {
        const share = noW ? F0() : fDiv(g.weights[i], g.weightSum);
        const val = fMul(g.poolF, share);
        entitledF[i] = fAdd(entitledF[i], val);
        perEstate[i].push({
          id: g.id, name: g.name, weightFrac: g.weights[i], weightText: fText(g.weights[i]),
          shareFrac: share, shareText: fText(share), sharePct: fPct(share, 4),
          poolF: g.poolF, pool: Math.round(fToNumber(g.poolF)),
          entitledF: val, entitled: Math.round(fToNumber(val)), receivedF: F0(), received: 0, parcelCount: g.parcelIds.length,
        });
      });
    });

    const res = persons.map((p, i) => ({
      person: p, index: i, weightFrac: wFs[i],
      entitledShare: fSign(poolF) > 0 ? fDiv(entitledF[i], poolF) : (fSign(wSum) > 0 ? fDiv(wFs[i], wSum) : F0()),
      entitledF: entitledF[i], receivedF: F0(),
      area: 0, byScope: {}, byAgri: {}, specialValueF: F0(), parcels: [], byEstate: perEstate[i],
    }));

    const used = {}, orphan = [], over = [], under = [];
    let allocatedF = F0();
    const alloc = sc.allocations || {};
    poolIds.forEach(id => {
      const al = alloc[id] || [];
      const sp = priced[id];
      const eid = estateIdOf(sp);
      const gname = (groups.find(g => g.id === eid) || {}).name || NO_ESTATE_NAME;
      const totalF = isNum(sp.total) ? frac(Math.round(sp.total)) : F0();
      let sum = F0();
      al.forEach(x => {
        const f = allocFrac(x);
        sum = fAdd(sum, f);
        const r = res.find(z => z.person.id === x.personId);
        if (!r) { orphan.push({ id, personId: x.personId, frac: f }); return; }
        if (fSign(f) < 0) errors.push(`سهم منفی برای «${sp.name}» ثبت شده است`);
        const valF = fMul(totalF, f);
        r.receivedF = fAdd(r.receivedF, valF);
        allocatedF = fAdd(allocatedF, valF);
        const ar = (isNum(sp.area) ? sp.area : 0) * fToNumber(f);
        r.area += ar;
        r.byScope[sp.scope] = r.byScope[sp.scope] || { area: 0, value: 0 };
        r.byScope[sp.scope].area += ar; r.byScope[sp.scope].value += fToNumber(valF);
        const ak = sp.agri || 'بدون';
        r.byAgri[ak] = r.byAgri[ak] || { area: 0, value: 0 };
        r.byAgri[ak].area += ar; r.byAgri[ak].value += fToNumber(valF);
        if (sp.special) r.specialValueF = fAdd(r.specialValueF, valF);
        const be = r.byEstate.find(z => z.id === eid);
        if (be) { be.receivedF = fAdd(be.receivedF, valF); be.received = Math.round(fToNumber(be.receivedF)); }
        r.parcels.push({
          id, name: sp.name, estateId: eid, estateName: gname, scope: sp.scope,
          fraction: fToNumber(f), fractionText: fText(f), pct: fPct(f, 4),
          value: fToNumber(valF), valueF: valF, area: ar,
          parcelArea: isNum(sp.area) ? sp.area : null, pricePerM2: isNum(sp.pricePerM2) ? sp.pricePerM2 : null,
          parcelTotal: isNum(sp.total) ? sp.total : null, status: sp.status || null,
        });
      });
      used[id] = sum;
      if (fCmp(sum, F1()) > 0) {
        over.push({ id, name: sp.name, sum, extra: fSub(sum, F1()) });
        errors.push(`مجموع سهم‌های زمین «${sp.name}» ${fPct(sum, 4)}٪ است (بیش از ۱۰۰٪ — ${fPct(fSub(sum, F1()), 4)}٪ اضافه)`);
      } else if (fSign(sum) < 0) errors.push(`مجموع سهم‌های زمین «${sp.name}» منفی است`);
      else if (fCmp(sum, F1()) < 0) {
        const rem = fSub(F1(), sum);
        under.push({ id, name: sp.name, remaining: rem, value: fMul(totalF, rem) });
      }
    });
    if (orphan.length) errors.push('سهم‌هایی به اشخاص حذف‌شده تعلق دارند و در جمع لحاظ نشدند (' + orphan.length + ' مورد) — آن‌ها را پاک یا شخص را دوباره ثبت کنید.');

    const unallocated = under.map(u => ({
      id: u.id, name: u.name, remaining: fToNumber(u.remaining),
      remainingPct: fPct(u.remaining, 4), remainingFrac: fText(u.remaining),
      value: Math.round(fToNumber(fMul(priced[u.id].total != null ? frac(Math.round(priced[u.id].total)) : F0(), u.remaining))),
      valueF: u.value,
    }));
    // ارزش واگذارنشده (دقیق) برای کنترل تراز
    let unallocatedF = F0();
    under.forEach(u => { unallocatedF = fAdd(unallocatedF, u.value); });

    // جمع‌های دقیق (پیش از گردکردن نمایشی) برای کنترل تراز
    let recvTotal = F0(), entTotal = F0();
    res.forEach(r => { recvTotal = fAdd(recvTotal, r.receivedF); entTotal = fAdd(entTotal, r.entitledF); });

    /* گردکردن نمایشی با حفظ جمع (بزرگ‌ترین باقی‌مانده): جمع ستون‌های جدول و
       جمع بستانکاری‌ها/بدهکاری‌ها دقیقاً می‌خواند و یک‌تومان اختلاف گردکردن پیدا نمی‌شود. */
    function roundKeepSum(fracs, target) {
      const xs = fracs.map(f => fToNumber(f));
      const out = xs.map(x => Math.floor(x));
      let rem = Math.round(target - out.reduce((s, v) => s + v, 0));
      const order = xs.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((a, b) => b.r - a.r);
      for (let k = 0; rem > 0 && k < order.length; k++, rem--) out[order[k].i]++;
      for (let k = order.length - 1; rem < 0 && k >= 0; k--, rem++) out[order[k].i]--;
      return out;
    }
    const entRound = roundKeepSum(res.map(r => r.entitledF), Math.round(fToNumber(entTotal)));
    const recvRound = roundKeepSum(res.map(r => r.receivedF), Math.round(fToNumber(recvTotal)));

    // گردکردن فقط برای نمایش
    res.forEach((r, ri) => {
      const diffF = fSub(r.receivedF, r.entitledF);
      r.entitledExact = fToNumber(r.entitledF); r.receivedExact = fToNumber(r.receivedF); r.diffExact = fToNumber(diffF);
      r.entitled = entRound[ri];
      r.received = recvRound[ri];
      r.diff = r.received - r.entitled;
      r.diffFrac = fText(diffF);
      r.entitledFracText = fText(r.entitledShare);
      r.entitledPct = fPct(r.entitledShare, 4);
      r.diffPct = fSign(r.entitledF) !== 0 ? fToNumber(fDiv(diffF, r.entitledF)) * 100 : 0;
      r.specialValue = Math.round(fToNumber(r.specialValueF));
      // اگر گردکردنِ نمایشی با اختلاف دقیق یکی نباشد، همان مقدار دقیق ملاک است
      if (Math.round(r.diffExact) !== r.diff) r.diffNote = 'اختلاف دقیق: ' + fNum(diffF, 2) + ' تومان (نمایش گردشده تا جمع ستون‌ها دقیق بخواند)';
      /* بستانکاری و بدهکاری: مثبت = بیش از حقش گرفته (بدهکار)، منفی = کمتر (بستانکار) */
      r.debit = r.diff > 0 ? r.diff : 0;
      r.credit = r.diff < 0 ? -r.diff : 0;
      r.settle = r.diff === 0 ? 'تراز' : (r.diff > 0 ? 'بدهکار' : 'بستانکار');
      r.byEstate.forEach(b => {
        b.diff = b.received - b.entitled;
        b.settle = b.diff === 0 ? 'تراز' : (b.diff > 0 ? 'بدهکار' : 'بستانکار');
        delete b.weightFrac; delete b.shareFrac; delete b.poolF; delete b.entitledF; delete b.receivedF;
      });
      delete r.weightFrac; delete r.entitledF; delete r.receivedF; delete r.specialValueF;
      r.parcels.forEach(q => { q.value = Math.round(q.value); delete q.valueF; });
      Object.keys(r.byScope).forEach(k => { r.byScope[k].value = Math.round(r.byScope[k].value); });
      Object.keys(r.byAgri).forEach(k => { r.byAgri[k].value = Math.round(r.byAgri[k].value); });
    });

    /* کنترل‌های درستی محاسبه (همیشه اجرا می‌شوند) */
    const pool = fToNumber(poolF);
    const checks = [
      {
        id: 'no_over', ok: over.length === 0,
        msg: over.length === 0 ? 'هیچ زمینی بیش از ۱۰۰٪ واگذار نشده است'
          : 'واگذاری بیش از ۱۰۰٪: ' + over.map(o => o.name + ' (' + fPct(o.sum, 4) + '٪)').join('، '),
      },
      {
        id: 'full', ok: under.length === 0,
        msg: under.length === 0 ? 'جمع سهم‌های همه‌ی زمین‌ها دقیقاً ۱۰۰٪ است'
          : 'سهم واگذارنشده: ' + under.map(u => u.name + ' (' + fPct(u.remaining, 4) + '٪ ≈ ' + Math.round(fToNumber(u.value)).toLocaleString('en') + ' تومان)').join('، '),
      },
      {
        id: 'known_persons', ok: orphan.length === 0,
        msg: orphan.length === 0 ? 'همه‌ی سهم‌ها به اشخاص ثبت‌شده تعلق دارند' : orphan.length + ' سهم به شخص حذف‌شده تعلق دارد',
      },
      {
        id: 'value_balance', ok: fEq(fAdd(recvTotal, unallocatedF), poolF),
        msg: 'مجموع ارزش دریافتی (' + Math.round(fToNumber(recvTotal)).toLocaleString('en') + ') + واگذارنشده (' + Math.round(fToNumber(unallocatedF)).toLocaleString('en') + ') = ارزش کل (' + Math.round(pool).toLocaleString('en') + ') — بدون خطای گردکردن',
      },
      {
        id: 'entitled_balance', ok: fSign(wSum) > 0 && fEq(entTotal, poolF),
        msg: fSign(wSum) > 0 ? 'مجموع حق اشخاص = ارزش کل مجموعه (' + Math.round(pool).toLocaleString('en') + ' تومان)' : 'وزنی ثبت نشده است',
      },
      {
        id: 'totals_ready', ok: incomplete.length === 0,
        msg: incomplete.length === 0 ? 'همه‌ی زمین‌های سناریو ارزش قطعی دارند' : incomplete.length + ' زمین ارزش قطعی ندارد: ' + incomplete.join('، '),
      },
      {
        id: 'estate_weights', ok: groups.every(g => fSign(g.weightSum) > 0 || fSign(g.poolF) <= 0),
        msg: groups.every(g => fSign(g.weightSum) > 0 || fSign(g.poolF) <= 0)
          ? (groups.length > 1
            ? 'سهم اشخاص در هر ' + groups.length + ' دسته‌ی اموال ثبت شده و حقِ هرکس جمعِ سهمش در همه‌ی دسته‌هاست'
            : 'سهم اشخاص برای دسته‌ی اموال ثبت شده است')
          : 'دسته‌های بدون سهم: ' + groups.filter(g => fSign(g.weightSum) <= 0 && fSign(g.poolF) > 0).map(g => g.name).join('، '),
      },
    ];
    const exact = {
      poolFrac: fText(poolF), allocatedFrac: fText(allocatedF), unallocatedFrac: fText(unallocatedF),
      sums: poolIds.map(id => ({ id, name: priced[id].name, sum: fText(used[id]), pct: fPct(used[id], 4), full: fEq(used[id], F1()) })),
      weights: persons.map((p, i) => ({ id: p.id, name: p.name, weight: fText(wFs[i]), share: fText(fSign(wSum) > 0 ? fDiv(wFs[i], wSum) : F0()), pct: fSign(wSum) > 0 ? fPct(fDiv(wFs[i], wSum), 4) : '0' })),
      weightSum: fText(wSum),
      estates: groups.map(g => ({
        id: g.id, name: g.name, pool: fText(g.poolF), weightSum: fText(g.weightSum),
        weights: persons.map((p, i) => ({ id: p.id, name: p.name, weight: fText(g.weights[i]), share: fSign(g.weightSum) > 0 ? fText(fDiv(g.weights[i], g.weightSum)) : '0' })),
      })),
    };
    /* خلاصه‌ی دسته‌های اموال (برای نمایش و برگه‌ی نهایی) */
    const estates = groups.map(g => ({
      id: g.id, name: g.name, parcelCount: g.parcelIds.length, parcelIds: g.parcelIds.slice(),
      pool: Math.round(fToNumber(g.poolF)), poolFracText: fText(g.poolF),
      weightSumText: fText(g.weightSum), usedDefaultWeights: !!g.usedDefault && !!g.id,
      persons: persons.map((p, i) => {
        const share = fSign(g.weightSum) > 0 ? fDiv(g.weights[i], g.weightSum) : F0();
        return {
          id: p.id, name: p.name, weightText: fText(g.weights[i]), shareText: fText(share), sharePct: fPct(share, 4),
          entitled: Math.round(fToNumber(fMul(g.poolF, share))),
        };
      }),
    }));
    return {
      pool: Math.round(pool), poolExact: pool, results: res, unallocated, over, orphan, errors, warnings, checks, exact,
      estates, basis, basisText: basisText(state, basis), parcelPrices: priced, includedIds: poolIds, skipped,
    };
  }

  /* ---------------------------------------------------------------- */
  /* برگه‌ی نهایی تقسیم: برای هر شخص، فهرست زمین‌هایی که به او رسیده،      */
  /* جمع کل، و بستانکاری/بدهکاری — به‌علاوه‌ی فهرست «هر زمین به چه کسی».   */
  /* ---------------------------------------------------------------- */
  function buildDivisionSheets(state, sc) {
    const ev = evaluateScenario(state, sc);
    const priced = ev.parcelPrices;
    const persons = ev.results.map(r => ({
      id: r.person.id, name: r.person.name,
      entitled: r.entitled, received: r.received, diff: r.diff,
      credit: r.credit, debit: r.debit, settle: r.settle,
      sharePct: r.entitledPct, shareFracText: r.entitledFracText,
      area: r.area, byEstate: r.byEstate,
      lands: r.parcels.map(q => ({
        id: q.id, name: q.name, estateId: q.estateId, estateName: q.estateName,
        scope: q.scope, scopeName: SCOPES[q.scope] || '—',
        shareText: q.fractionText, sharePct: q.pct, area: q.area, parcelArea: q.parcelArea,
        pricePerM2: q.pricePerM2, value: q.value, parcelTotal: q.parcelTotal, status: q.status,
      })),
      totals: {
        lands: r.parcels.length,
        area: r.parcels.reduce((s, q) => s + (q.area || 0), 0),
        value: r.parcels.reduce((s, q) => s + (q.value || 0), 0),
      },
    }));
    const lands = ev.includedIds.map(id => {
      const sp = priced[id];
      const parts = [];
      ev.results.forEach(r => r.parcels.forEach(q => { if (q.id === id) parts.push({ personId: r.person.id, person: r.person.name, shareText: q.fractionText, sharePct: q.pct, area: q.area, value: q.value }); }));
      const un = ev.unallocated.find(u => u.id === id);
      return {
        id, name: sp.name, estateId: estateIdOf(sp), estateName: (ev.estates.find(g => g.id === estateIdOf(sp)) || {}).name || NO_ESTATE_NAME,
        scope: sp.scope, scopeName: SCOPES[sp.scope] || '—', area: sp.area, pricePerM2: sp.pricePerM2, total: sp.total, status: sp.status,
        parts, remainingPct: un ? un.remainingPct : null, remainingValue: un ? un.value : 0,
      };
    });
    return {
      scenario: { id: sc.id, name: sc.name, createdAt: sc.createdAt, settingsVersion: sc.settingsVersion },
      basis: ev.basis, basisText: ev.basisText, at: nowIso(),
      pool: ev.pool, estates: ev.estates, persons, lands,
      totals: {
        lands: lands.length,
        area: lands.reduce((s, l) => s + (isNum(l.area) ? l.area : 0), 0),
        value: ev.pool,
        received: persons.reduce((s, p) => s + p.received, 0),
        credit: persons.reduce((s, p) => s + p.credit, 0),
        debit: persons.reduce((s, p) => s + p.debit, 0),
      },
      checks: ev.checks, errors: ev.errors, warnings: ev.warnings, unallocated: ev.unallocated,
    };
  }

  function parcelSnap(p, state) {
    const v = currentValuation(p, state && state.settings), at = p.attrs || {};
    return {
      name: p.name, scope: p.scope, area: v.area, pricePerM2: v.price != null ? v.price : v.pricePerM2, total: v.total, special: !!p.special,
      agri: p.scope === 'rural_outside' ? at.farmType : (p.scope === 'rural_inside' || at.urbanUse === 'agri' ? at.agri : null),
      grade: p.grade, urbanUse: at.urbanUse, status: v.status,
    };
  }

  /* ---------------------------------------------------------------- */
  /* پرونده‌ی زنده                                                      */
  /* برخلاف سناریوی قدیمی «عکس ثابت» نمی‌گیرد: زمین‌ها، مساحت و ارزش‌ها     */
  /* هر بار از اطلاعات فعلی خوانده می‌شوند؛ با عوض‌شدن هر قیمت یا مساحت     */
  /* همه‌ی جمع‌ها، حق‌ها و مانده‌ها خودبه‌خود دوباره حساب می‌شوند.          */
  /* هر پرونده زمین‌ها و اشخاص مستقل خودش را دارد.                          */
  /* ---------------------------------------------------------------- */
  /** زمین‌های پرونده با مقدارهای فعلی (به شکل همان «عکس» سناریو، ولی تازه) */
  function caseParcels(state, sc) {
    const want = sc.parcelIds || [], out = {};
    state.parcels.forEach(p => { if (want.indexOf(p.id) >= 0) out[p.id] = parcelSnap(p, state); });
    return out;
  }
  function addSection(sc, name, opts) {
    const o = opts || {};
    const sec = { id: uid('sec'), name: name || 'بخش', rest: !!o.rest, parcelIds: (o.parcelIds || []).slice(), weights: {} };
    (sc.personIds || []).forEach(pid => { sec.weights[pid] = Object.assign({ text: '1' }, fPack(F1())); });
    (sc.sections = sc.sections || []).push(sec);
    return sec;
  }
  /** ثبت سهم نسبی یک شخص در یک بخش؛ ورودی عدد، کسر یا جمع کسرها («1/3+1/21»)؛ خالی = بدون سهم؛ نامعتبر ⇒ null */
  function setSectionWeight(sc, secId, personId, input) {
    const sec = (sc.sections || []).find(s => s.id === secId);
    if (!sec) return null;
    const txt = String(input == null ? '' : input).trim();
    if (txt === '') { delete sec.weights[personId]; return F0(); }
    const f = toFrac(txt);
    if (!f || fSign(f) < 0) return null;
    sec.weights[personId] = Object.assign({ text: txt }, fPack(f));
    return f;
  }
  function sectionWeightFrac(sec, personId) {
    const w = sec && sec.weights && sec.weights[personId];
    const f = w ? toFrac(w) : null;
    return f && fSign(f) > 0 ? f : F0();
  }
  /** پرونده‌ی زنده‌ی تازه: زمین‌ها و اشخاص انتخابی، یک بخش «همه‌ی زمین‌ها» با سهم مساوی */
  function createCase(state, name, parcelIds, personIds) {
    const ids = (parcelIds || state.parcels.map(p => p.id)).filter(id => state.parcels.some(p => p.id === id));
    const pids = ((personIds && personIds.length) ? personIds : state.persons.map(p => p.id)).filter(id => state.persons.some(p => p.id === id));
    const sc = { id: uid('sc'), name: name || 'پرونده', createdAt: nowIso(), live: true, parcelIds: ids, personIds: pids, sections: [], deals: [], allocations: {}, parcels: {}, settingsVersion: state.settings.version };
    addSection(sc, 'همه‌ی زمین‌ها', { rest: true });
    state.scenarios.push(sc); return sc;
  }
  /** تبدیل سناریوی قدیمی به پرونده‌ی زنده (واگذاری‌ها و سهم نسبی اشخاص حفظ می‌شود) */
  function convertScenarioToCase(state, scenarioId, name) {
    const old = state.scenarios.find(x => x.id === scenarioId);
    if (!old || old.live) return null;
    const ids = Object.keys(old.parcels || {}).filter(id => state.parcels.some(p => p.id === id));
    const sc = createCase(state, name || old.name + ' (زنده)', ids, null);
    const sec = sc.sections[0];
    state.persons.forEach(p => { if (sc.personIds.indexOf(p.id) >= 0) { const w = personWeightFrac(p); sec.weights[p.id] = Object.assign({ text: fText(w) }, fPack(w)); } });
    ids.forEach(id => { if (old.allocations && old.allocations[id]) sc.allocations[id] = clone(old.allocations[id]); });
    sc.sourceScenario = old.id;
    return sc;
  }
  /** ساخت بخش‌های پرونده از «دسته‌های اموال» برنامه: هر دسته یک بخش با همان سهم‌های اشخاص؛ زمین‌های بدون دسته در «بقیه» می‌مانند */
  function sectionsFromEstates(state, sc) {
    const inCase = new Set(sc.parcelIds || []); let n = 0;
    sc.sections = (sc.sections || []).filter(x => !x.fromEstate);
    (state.estates || []).forEach(e => {
      const ids = state.parcels.filter(p => p.estateId === e.id && inCase.has(p.id)).map(p => p.id);
      if (!ids.length) return;
      sc.sections.forEach(x => { if (x.parcelIds) x.parcelIds = x.parcelIds.filter(id => ids.indexOf(id) < 0); });
      const sec = addSection(sc, e.name, { parcelIds: ids }); sec.fromEstate = e.id; n++;
      (sc.personIds || []).forEach(pid => { const w = estateWeightFrac(e, pid); if (fSign(w) > 0) setSectionWeight(sc, sec.id, pid, fText(w)); else delete sec.weights[pid]; });
    });
    const taken = new Set(); sc.sections.forEach(x => { if (!x.rest) (x.parcelIds || []).forEach(id => taken.add(id)); });
    const leftover = (sc.parcelIds || []).some(id => !taken.has(id));
    sc.sections = sc.sections.filter(x => !x.rest);                 // «بقیه» فقط وقتی لازم است بماند
    if (leftover) { const r = addSection(sc, 'بقیه‌ی زمین‌ها', { rest: true }); sc.sections.unshift(sc.sections.pop()); (sc.personIds || []).forEach(pid => { const w = personWeightFrac((state.persons || []).find(p => p.id === pid) || {}); if (fSign(w) > 0) setSectionWeight(sc, r.id, pid, fText(w)); }); }
    return n;
  }
  /** ثبت معامله‌ی جانبی: {kind:'parcel', from, to, parcelId, all|num/den|frac} یا {kind:'cash', from, to, amount} */
  function addDeal(sc, d) {
    const deal = { id: uid('deal'), kind: d.kind === 'cash' ? 'cash' : 'parcel', from: d.from, to: d.to, note: d.note || '' };
    if (deal.kind === 'cash') deal.amount = d.amount;
    else {
      deal.parcelId = d.parcelId;
      const f = d.all ? null : toFrac(d.frac);
      if (d.all || !f) deal.all = true; else { deal.num = String(f.n); deal.den = String(f.d); deal.shareText = d.text || fText(f); }
    }
    (sc.deals = sc.deals || []).push(deal); return deal;
  }
  /** حذف کامل یک شخص از همه‌جا (واگذاری‌ها، بخش‌ها، معامله‌ها و عضویت پرونده‌ها) */
  function removePerson(state, personId) {
    const removed = (state.persons || []).find(x => x.id === personId); if (!removed) return false;
    ensureTrash(state).persons.push({ deletedAt: nowIso(), item: clone(removed) });
    state.persons = state.persons.filter(x => x.id !== personId);
    (state.parcels || []).forEach(p => {
      if (p.holderId === personId) p.holderId = null;
      if (Array.isArray(p.coOwners)) { p.coOwners = p.coOwners.filter(x => x && x.personId !== personId); if (p.coOwners.length === 1 && p.coOwners[0].share && fEq(toFrac(p.coOwners[0].share), F1())) { p.holderId = p.coOwners[0].personId; p.coOwners = []; } }
    });
    if (state.adjust) delete state.adjust[personId];
    if (state.familySplits) delete state.familySplits[personId];
    if (state.house) { if (state.house.payer === personId) state.house.payer = ''; state.house.receivers = (state.house.receivers || []).filter(id => id !== personId); }
    (state.estates || []).forEach(e => { if (e.weights) delete e.weights[personId]; });
    (state.scenarios || []).forEach(sc => {
      Object.keys(sc.allocations || {}).forEach(k => {
        sc.allocations[k] = sc.allocations[k].filter(a => a.personId !== personId);
        if (!sc.allocations[k].length) delete sc.allocations[k];
      });
      if (sc.personIds) sc.personIds = sc.personIds.filter(id => id !== personId);
      (sc.sections || []).forEach(s => { if (s.weights) delete s.weights[personId]; });
      if (sc.deals) sc.deals = sc.deals.filter(d => d.from !== personId && d.to !== personId);
    });
    return true;
  }
  /** بازگردانی مورد حذف‌شده؛ شناسه‌ی اصلی حفظ می‌شود مگر آن‌که تعارض داشته باشد. */
  function restoreFromTrash(state, kind, id) {
    ensureTrash(state); const list = state.trash[kind + 's']; if (!Array.isArray(list)) return null;
    const i = list.findIndex(x => x.item && x.item.id === id); if (i < 0) return null;
    const item = clone(list[i].item);
    if ((state[kind + 's'] || []).some(x => x.id === item.id)) item.id = uid(kind);
    state[kind + 's'].push(item);
    if (kind === 'estate' && Array.isArray(list[i].affectedParcelIds)) list[i].affectedParcelIds.forEach(pid => { const p = (state.parcels || []).find(x => x.id === pid); if (p && !p.estateId) p.estateId = item.id; });
    list.splice(i, 1); state.log = state.log || []; state.log.push({ at: nowIso(), msg: 'بازگردانی ' + kind + ' «' + (item.name || item.id) + '»' }); return item;
  }

  function sectionPlan(sc, snap, persons, poolF, errors) {
    const ids = Object.keys(snap), secs = sc.sections, owner = {}, dups = [];
    let issues = 0;
    secs.forEach((s, si) => {
      if (s.rest) return;
      (s.parcelIds || []).forEach(id => { if (!snap[id]) return; if (owner[id] != null) dups.push(snap[id].name || id); else owner[id] = si; });
    });
    const restIdx = secs.findIndex(s => s.rest);
    const unassigned = [];
    ids.forEach(id => { if (owner[id] == null) { if (restIdx >= 0) owner[id] = restIdx; else unassigned.push(snap[id].name || id); } });
    if (dups.length) { issues++; errors.push('زمین در بیش از یک بخش آمده است: ' + dups.join('، ')); }
    if (unassigned.length) { issues++; errors.push('زمین بدون بخش (در هیچ بخشی نیست و بخش «بقیه‌ی زمین‌ها» هم تعریف نشده): ' + unassigned.join('، ')); }
    const entitledF = persons.map(() => F0());
    const perPerson = persons.map(() => []);
    const out = secs.map((s, si) => {
      let pool = F0(), area = 0; const members = [];
      ids.forEach(id => {
        if (owner[id] !== si) return;
        members.push(id);
        const t = snap[id].total;
        if (isNum(t)) pool = fAdd(pool, frac(Math.round(t)));
        if (isNum(snap[id].area)) area += snap[id].area;
      });
      const ws = persons.map(p => sectionWeightFrac(s, p.id));
      let wsum = F0(); ws.forEach(w => { wsum = fAdd(wsum, w); });
      if (fSign(wsum) <= 0 && fSign(pool) > 0) { issues++; errors.push('برای بخش «' + s.name + '» سهمی برای هیچ‌کس تعیین نشده است'); }
      const poolShare = fSign(poolF) > 0 ? fDiv(pool, poolF) : F0();
      const rows = persons.map((p, i) => {
        const share = fSign(wsum) > 0 ? fDiv(ws[i], wsum) : F0();
        const val = fMul(pool, share);
        entitledF[i] = fAdd(entitledF[i], val);
        const row = { personId: p.id, name: p.name, weightText: fText(ws[i]), fracText: fText(share), pct: fPct(share, 4), value: Math.round(fToNumber(val)), valueExact: fToNumber(val) };
        perPerson[i].push(Object.assign({ id: s.id, sectionName: s.name }, row));
        return row;
      });
      return { id: s.id, name: s.name, rest: !!s.rest, count: members.length, area, parcelIds: members, pool: Math.round(fToNumber(pool)), poolExact: fToNumber(pool), poolPct: fPct(poolShare, 4), weightSum: fText(wsum), rows };
    });
    return { sections: out, entitledF, perPerson, issues };
  }
  /** تسویه‌ی پیشنهادی: بدهکارها (بیش از حق برداشته‌اند) به طلبکارها (کمتر از حق دارند) پول بدهند؛ کمترین تعداد پرداخت به‌صورت حریصانه */
  function settlementPlan(res, diffs) {
    const cred = [], debt = [];
    res.forEach((r, i) => { const d = diffs[i]; if (fSign(d) < 0) cred.push({ i, amt: fNeg(d) }); else if (fSign(d) > 0) debt.push({ i, amt: d }); });
    cred.sort((a, b) => fCmp(b.amt, a.amt)); debt.sort((a, b) => fCmp(b.amt, a.amt));
    const out = []; let ci = 0, di = 0;
    while (ci < cred.length && di < debt.length) {
      const c = cred[ci], d = debt[di], m = fCmp(c.amt, d.amt) < 0 ? c.amt : d.amt;
      out.push({ from: res[d.i].person.id, fromName: res[d.i].person.name, to: res[c.i].person.id, toName: res[c.i].person.name, amount: Math.round(fToNumber(m)), amountExact: fToNumber(m) });
      c.amt = fSub(c.amt, m); d.amt = fSub(d.amt, m);
      if (fSign(c.amt) === 0) ci++;
      if (fSign(d.amt) === 0) di++;
    }
    return out;
  }

  /** ارزیابی «پرونده‌ی زنده» (جدا از سناریوی قدیمی) */
  function evaluateCase(state, sc) {
    // پرونده‌ی زنده: زمین‌ها از اطلاعات فعلی خوانده می‌شوند؛ سناریوی قدیمی: عکس ثابت
    const live = !!sc.live;
    const snap = live ? caseParcels(state, sc) : sc.parcels;
    const allPersons = state.persons || [];
    const persons = sc.personIds ? allPersons.filter(p => sc.personIds.indexOf(p.id) >= 0) : allPersons;
    const poolIds = Object.keys(snap);
    const errors = [];
    if (live) {
      const gone = (sc.parcelIds || []).filter(id => !snap[id]);
      if (gone.length) errors.push(gone.length + ' زمین این پرونده از برنامه حذف شده است؛ از فهرست پرونده خارجش کنید.');
    }
    // ارزش کل مجموعه: total ها عدد صحیح‌اند ⇒ جمع دقیق
    let poolF = F0(), areaAll = 0;
    const incomplete = [];
    poolIds.forEach(id => {
      const tt = snap[id].total;
      if (isNum(tt)) poolF = fAdd(poolF, frac(Math.round(tt)));
      else incomplete.push(snap[id].name || id);
      if (isNum(snap[id].area)) areaAll += snap[id].area;
    });
    if (incomplete.length) errors.push('زمین‌های بدون ارزش قطعی در مجموع لحاظ نشده‌اند: ' + incomplete.join('، '));

    // حق هر شخص (دقیق): یا از بخش‌ها (جمع وزنی بخش‌ها) یا از سهم نسبی ساده‌ی شخص
    let wFs, wSum, entitledF, sectionsOut = null, secShare = null, sectionIssues = 0;
    if (sc.sections && sc.sections.length) {
      const plan = sectionPlan(sc, snap, persons, poolF, errors);
      sectionsOut = plan.sections; entitledF = plan.entitledF; secShare = plan.perPerson; sectionIssues = plan.issues;
      wSum = F1();
      wFs = persons.map((p, i) => (fSign(poolF) > 0 ? fDiv(entitledF[i], poolF) : F0()));
    } else {
      wFs = persons.map(personWeightFrac);
      wSum = F0(); wFs.forEach(w => { wSum = fAdd(wSum, w); });
      entitledF = persons.map((p, i) => (fSign(wSum) > 0 ? fDiv(fMul(poolF, wFs[i]), wSum) : F0()));
    }

    // تعدیل‌های جمع و تفریقی هر نفر (مثلاً «-9000000000» بابت خرید یا «+3000000000» بابت فروش)
    // «خانه‌ی شهر»: هر گیرنده مبلغ ثابتی می‌گیرد و پرداخت‌کننده مجموع آن را از سهم خود می‌دهد
    const houseF = persons.map(() => F0());
    if (sc.house && sc.house.amount != null && String(sc.house.amount).trim() !== '') {
      const amt = parseAdjust(sc.house.amount);
      if (amt === null || fSign(amt) < 0) errors.push('مبلغ «سهم هر پسر از خانه‌ی شهر» نامعتبر است');
      else if (fSign(amt) > 0) {
        const rec = persons.map((p, i) => ((sc.house.receivers || []).indexOf(p.id) >= 0 ? i : -1)).filter(i => i >= 0);
        const pi = persons.findIndex(p => p.id === sc.house.payer);
        rec.forEach(i => { houseF[i] = fAdd(houseF[i], amt); });
        if (pi >= 0) houseF[pi] = fSub(houseF[pi], fMul(amt, frac(rec.filter(i => i !== pi).length)));
      }
    }
    const adjF = persons.map((p, i) => {
      const txt = (sc.adjust || {})[p.id];
      const f = parseAdjust(txt);
      if (f === null) { errors.push('تعدیل «' + p.name + '» نامعتبر است («' + txt + '»)؛ مثل +3000000000 یا -9000000000 بنویسید'); return houseF[i]; }
      return fAdd(f, houseF[i]);
    });
    const res = persons.map((p, i) => ({
      person: p, index: i, weightFrac: wFs[i],
      entitledShare: fSign(wSum) > 0 ? fDiv(wFs[i], wSum) : F0(),
      entitledF: entitledF[i], adjF: adjF[i], receivedF: F0(),
      area: 0, byScope: {}, byAgri: {}, specialValueF: F0(), parcels: [],
    }));

    const used = {}, orphan = [], over = [], under = [];
    let allocatedF = F0();
    const alloc = sc.allocations || {};
    poolIds.forEach(id => {
      const al = alloc[id] || [];
      const sp = snap[id];
      const totalF = isNum(sp.total) ? frac(Math.round(sp.total)) : F0();
      let sum = F0();
      al.forEach(x => {
        const f = allocFrac(x);
        sum = fAdd(sum, f);
        const r = res.find(z => z.person.id === x.personId);
        if (!r) { orphan.push({ id, personId: x.personId, frac: f }); return; }
        if (fSign(f) < 0) errors.push(`سهم منفی برای «${sp.name}» ثبت شده است`);
        const valF = fMul(totalF, f);
        r.receivedF = fAdd(r.receivedF, valF);
        allocatedF = fAdd(allocatedF, valF);
        const ar = (isNum(sp.area) ? sp.area : 0) * fToNumber(f);
        r.area += ar;
        r.byScope[sp.scope] = r.byScope[sp.scope] || { area: 0, value: 0 };
        r.byScope[sp.scope].area += ar; r.byScope[sp.scope].value += fToNumber(valF);
        const ak = sp.agri || 'بدون';
        r.byAgri[ak] = r.byAgri[ak] || { area: 0, value: 0 };
        r.byAgri[ak].area += ar; r.byAgri[ak].value += fToNumber(valF);
        if (sp.special) r.specialValueF = fAdd(r.specialValueF, valF);
        r.parcels.push({ id, name: sp.name, fraction: fToNumber(f), fractionText: fText(f), pct: fPct(f, 4), value: fToNumber(valF), valueF: valF, area: ar });
      });
      used[id] = sum;
      if (fCmp(sum, F1()) > 0) {
        over.push({ id, name: sp.name, sum, extra: fSub(sum, F1()) });
        errors.push(`مجموع سهم‌های زمین «${sp.name}» ${fPct(sum, 4)}٪ است (بیش از ۱۰۰٪ — ${fPct(fSub(sum, F1()), 4)}٪ اضافه)`);
      } else if (fSign(sum) < 0) errors.push(`مجموع سهم‌های زمین «${sp.name}» منفی است`);
      else if (fCmp(sum, F1()) < 0) {
        const rem = fSub(F1(), sum);
        under.push({ id, name: sp.name, remaining: rem, value: fMul(totalF, rem) });
      }
    });
    if (orphan.length) errors.push('سهم‌هایی به اشخاص حذف‌شده یا خارج از پرونده تعلق دارند و در جمع لحاظ نشدند (' + orphan.length + ' مورد) — آن‌ها را پاک یا شخص را به پرونده اضافه کنید.');

    /* معامله‌های جانبی (زمین یا پول بین دو نفر) و فهرست نهایی زمین‌های هر شخص */
    const hold = {}, notes = {}, cashNet = {}, dealLines = {}, dealErrors = [];
    res.forEach(r => { hold[r.person.id] = {}; notes[r.person.id] = {}; cashNet[r.person.id] = F0(); dealLines[r.person.id] = []; });
    poolIds.forEach(id => (alloc[id] || []).forEach(x => {
      if (!hold[x.personId]) return;
      const f = allocFrac(x);
      if (fSign(f) > 0) hold[x.personId][id] = fAdd(hold[x.personId][id] || F0(), f);
    }));
    const nameOf = (pid) => { const r = res.find(z => z.person.id === pid); return r ? r.person.name : '؟'; };
    (sc.deals || []).forEach((d, di) => {
      const tag = 'معامله‌ی ' + (di + 1);
      if (!hold[d.from] || !hold[d.to] || d.from === d.to) { dealErrors.push(tag + ': طرفین معامله باید دو نفر متفاوت از اعضای پرونده باشند'); return; }
      if (d.kind === 'cash') {
        const m = toFrac(d.amount);
        if (!m || fSign(m) <= 0) { dealErrors.push(tag + ': مبلغ نامعتبر است'); return; }
        cashNet[d.from] = fSub(cashNet[d.from], m); cashNet[d.to] = fAdd(cashNet[d.to], m);
        const mt = Math.round(fToNumber(m)).toLocaleString('en');
        dealLines[d.from].push('پرداخت ' + mt + ' تومان به ' + nameOf(d.to) + (d.note ? ' (' + d.note + ')' : ''));
        dealLines[d.to].push('دریافت ' + mt + ' تومان از ' + nameOf(d.from) + (d.note ? ' (' + d.note + ')' : ''));
        return;
      }
      const sp = snap[d.parcelId];
      if (!sp) { dealErrors.push(tag + ': زمین معامله در پرونده نیست'); return; }
      const have = hold[d.from][d.parcelId] || F0();
      const f = d.all ? have : toFrac({ num: d.num, den: d.den });
      if (!f || fSign(f) <= 0) { dealErrors.push(tag + ': ' + nameOf(d.from) + ' سهمی از «' + sp.name + '» ندارد'); return; }
      if (fCmp(f, have) > 0) { dealErrors.push(tag + ': سهم واگذارشده‌ی «' + sp.name + '» (' + fText(f) + ') از سهم ' + nameOf(d.from) + ' (' + fText(have) + ') بیشتر است'); return; }
      const left = fSub(have, f);
      if (fSign(left) === 0) delete hold[d.from][d.parcelId]; else hold[d.from][d.parcelId] = left;
      hold[d.to][d.parcelId] = fAdd(hold[d.to][d.parcelId] || F0(), f);
      (notes[d.to][d.parcelId] = notes[d.to][d.parcelId] || []).push(fText(f) + ' از ' + nameOf(d.from));
      (notes[d.from][d.parcelId] = notes[d.from][d.parcelId] || []).push(fText(f) + ' به ' + nameOf(d.to) + ' واگذار شد');
      dealLines[d.from].push('واگذاری ' + fText(f) + ' از «' + sp.name + '» به ' + nameOf(d.to) + (d.note ? ' (' + d.note + ')' : ''));
      dealLines[d.to].push('دریافت ' + fText(f) + ' از «' + sp.name + '» از ' + nameOf(d.from) + (d.note ? ' (' + d.note + ')' : ''));
    });
    dealErrors.forEach(e => errors.push(e));
    res.forEach(r => {
      const h = hold[r.person.id]; let valF = F0(), area = 0; const lines = [];
      poolIds.forEach(id => {
        const f = h[id]; if (!f || fSign(f) <= 0) return;
        const sp = snap[id], totalF = isNum(sp.total) ? frac(Math.round(sp.total)) : F0();
        const v = fMul(totalF, f), ar = (isNum(sp.area) ? sp.area : 0) * fToNumber(f);
        valF = fAdd(valF, v); area += ar;
        lines.push({ id, name: sp.name, scope: sp.scope, fractionText: fText(f), pct: fPct(f, 4), area: ar, value: Math.round(fToNumber(v)), valueExact: fToNumber(v), note: (notes[r.person.id][id] || []).join('؛ ') });
      });
      r.finalLines = lines; r.finalValueF = valF; r.finalArea = area; r.cashNetF = cashNet[r.person.id]; r.dealLines = dealLines[r.person.id];
    });

    const unallocated = under.map(u => ({
      id: u.id, name: u.name, remaining: fToNumber(u.remaining),
      remainingPct: fPct(u.remaining, 4), remainingFrac: fText(u.remaining),
      value: Math.round(fToNumber(fMul(snap[u.id].total != null ? frac(Math.round(snap[u.id].total)) : F0(), u.remaining))),
      valueF: u.value,
    }));
    // ارزش واگذارنشده (دقیق) برای کنترل تراز
    let unallocatedF = F0();
    under.forEach(u => { unallocatedF = fAdd(unallocatedF, u.value); });

    // جمع‌های دقیق (پیش از گردکردن نمایشی) برای کنترل تراز
    let recvTotal = F0(), entTotal = F0();
    res.forEach(r => { recvTotal = fAdd(recvTotal, r.receivedF); entTotal = fAdd(entTotal, r.entitledF); });

    // مانده‌ی نهایی هر شخص پس از معامله‌ها: ارزش زمین‌های فعلی + پول دریافتی − پول پرداختی − حق او (مثبت = بیش از حق، منفی = کسری)
    const finalDiffF = res.map(r => fAdd(fSub(r.finalValueF, fAdd(r.entitledF, r.adjF)), r.cashNetF));
    let diffTotalF = F0(); finalDiffF.forEach(d => { diffTotalF = fAdd(diffTotalF, d); });
    const avgPrice = areaAll > 0 ? fToNumber(poolF) / areaAll : 0;
    const settlement = settlementPlan(res, finalDiffF);
    // گردکردن فقط برای نمایش
    res.forEach(r => {
      const diffF = fSub(r.receivedF, r.entitledF);
      r.entitledExact = fToNumber(r.entitledF); r.receivedExact = fToNumber(r.receivedF); r.diffExact = fToNumber(diffF);
      r.entitled = Math.round(r.entitledExact);
      r.received = Math.round(r.receivedExact);
      r.diff = Math.round(r.diffExact);
      r.diffFrac = fText(diffF);
      r.entitledFracText = fText(r.entitledShare);
      r.entitledPct = fPct(r.entitledShare, 4);
      r.diffPct = fSign(r.entitledF) !== 0 ? fToNumber(fDiv(diffF, r.entitledF)) * 100 : 0;
      r.specialValue = Math.round(fToNumber(r.specialValueF));
      const fd = finalDiffF[r.index];
      r.finalValue = Math.round(fToNumber(r.finalValueF)); r.cashNet = Math.round(fToNumber(r.cashNetF));
      r.finalDiffExact = fToNumber(fd); r.finalDiff = Math.round(r.finalDiffExact);
      r.short = -r.finalDiff;                       // مثبت: هنوز باید بگیرد، منفی: بیش از حق دارد
      r.houseAdj = Math.round(fToNumber(houseF[r.index])); r.adjust = Math.round(fToNumber(r.adjF)); r.otherAdj = r.adjust - r.houseAdj; r.adjustText = (sc.adjust || {})[r.person.id] || '';
      r.creditExact = r.entitledExact + fToNumber(r.adjF); r.credit = Math.round(r.creditExact); r.remaining = -r.finalDiff;
      r.shortPct = r.creditExact ? (-r.finalDiffExact / r.creditExact) * 100 : 0;
      r.shortArea = avgPrice > 0 ? -r.finalDiffExact / avgPrice : 0;   // معادل تقریبی مساحت با میانگین قیمت همین پرونده
      r.sections = secShare ? secShare[r.index] : [];
      // اگر گردکردنِ نمایشی با اختلاف دقیق یکی نباشد، همان مقدار دقیق ملاک است
      if (r.received - r.entitled !== r.diff) r.diffNote = 'اختلاف دقیق: ' + fNum(diffF, 2) + ' تومان (نمایش گردشده)';
      delete r.weightFrac; delete r.entitledF; delete r.adjF; delete r.receivedF; delete r.specialValueF; delete r.finalValueF; delete r.cashNetF;
      r.parcels.forEach(q => { q.value = Math.round(q.value); delete q.valueF; });
      Object.keys(r.byScope).forEach(k => { r.byScope[k].value = Math.round(r.byScope[k].value); });
      Object.keys(r.byAgri).forEach(k => { r.byAgri[k].value = Math.round(r.byAgri[k].value); });
    });

    /* کنترل‌های درستی محاسبه (همیشه اجرا می‌شوند) */
    const pool = fToNumber(poolF);
    const checks = [
      {
        id: 'no_over', ok: over.length === 0,
        msg: over.length === 0 ? 'هیچ زمینی بیش از ۱۰۰٪ واگذار نشده است'
          : 'واگذاری بیش از ۱۰۰٪: ' + over.map(o => o.name + ' (' + fPct(o.sum, 4) + '٪)').join('، '),
      },
      {
        id: 'full', ok: under.length === 0,
        msg: under.length === 0 ? 'جمع سهم‌های همه‌ی زمین‌ها دقیقاً ۱۰۰٪ است'
          : under.length > 4 ? 'هنوز ' + under.length + ' زمین کاملاً واگذار نشده است (ارزش ≈ ' + Math.round(fToNumber(unallocatedF)).toLocaleString('en') + ' تومان)' : 'سهم واگذارنشده: ' + under.map(u => u.name + ' (' + fPct(u.remaining, 4) + '٪ ≈ ' + Math.round(fToNumber(u.value)).toLocaleString('en') + ' تومان)').join('، '),
      },
      {
        id: 'known_persons', ok: orphan.length === 0,
        msg: orphan.length === 0 ? 'همه‌ی سهم‌ها به اشخاص ثبت‌شده تعلق دارند' : orphan.length + ' سهم به شخص حذف‌شده تعلق دارد',
      },
      {
        id: 'value_balance', ok: fEq(fAdd(recvTotal, unallocatedF), poolF),
        msg: 'مجموع ارزش دریافتی (' + Math.round(fToNumber(recvTotal)).toLocaleString('en') + ') + واگذارنشده (' + Math.round(fToNumber(unallocatedF)).toLocaleString('en') + ') = ارزش کل (' + Math.round(pool).toLocaleString('en') + ') — بدون خطای گردکردن',
      },
      {
        id: 'entitled_balance', ok: fSign(wSum) > 0 && fEq(entTotal, poolF),
        msg: fSign(wSum) > 0 ? 'مجموع حق اشخاص = ارزش کل مجموعه (' + Math.round(pool).toLocaleString('en') + ' تومان)' : 'وزنی ثبت نشده است',
      },
      {
        id: 'totals_ready', ok: incomplete.length === 0,
        msg: incomplete.length === 0 ? 'همه‌ی زمین‌های سناریو ارزش قطعی دارند' : incomplete.length + ' زمین ارزش قطعی ندارد: ' + incomplete.join('، '),
      },
    ];
    if (sectionsOut) checks.push({
      id: 'sections_ok', ok: sectionIssues === 0,
      msg: sectionIssues === 0 ? 'هر زمین دقیقاً در یک بخش است و برای هر بخش سهم تعیین شده' : 'مشکل در بخش‌ها (بالا ببینید)',
    });
    if ((sc.deals || []).length) checks.push({
      id: 'deals_ok', ok: dealErrors.length === 0,
      msg: dealErrors.length === 0 ? 'معامله‌های جانبی درست‌اند (' + (sc.deals || []).length + ' مورد)' : dealErrors.join(' — '),
    });
    let adjTotal = F0(); adjF.forEach(a => { adjTotal = fAdd(adjTotal, a); });
    if (fSign(adjTotal) !== 0) checks.push({ id: 'adjust_balance', ok: false, msg: 'جمع تعدیل‌ها صفر نیست (' + Math.round(fToNumber(adjTotal)).toLocaleString('en') + ' تومان)؛ معمولاً آنچه یکی می‌پردازد دیگران می‌گیرند' });
    const exact = {
      poolFrac: fText(poolF), allocatedFrac: fText(allocatedF), unallocatedFrac: fText(unallocatedF),
      sums: poolIds.map(id => ({ id, name: snap[id].name, sum: fText(used[id]), pct: fPct(used[id], 4), full: fEq(used[id], F1()) })),
      weights: persons.map((p, i) => ({ id: p.id, name: p.name, weight: fText(wFs[i]), share: fText(fSign(wSum) > 0 ? fDiv(wFs[i], wSum) : F0()), pct: fSign(wSum) > 0 ? fPct(fDiv(wFs[i], wSum), 4) : '0' })),
      weightSum: fText(wSum),
    };
    return {
      pool: Math.round(pool), poolExact: pool, results: res, unallocated, over, orphan, errors, checks, exact,
      live, sections: sectionsOut, settlement, settlementBalanced: fSign(diffTotalF) === 0,
      unsettled: Math.round(-fToNumber(diffTotalF)), area: areaAll, avgPricePerM2: avgPrice,
    };
  }


  /** مبلغ‌های جمع و تفریقی دقیق: «+3000000000-500000000» یا «-9 میلیارد» ⇒ کسر دقیق (تومان)؛ خالی ⇒ صفر؛ نامعتبر ⇒ null */
  function parseAdjust(text) {
    let s = normDigits(String(text == null ? '' : text)).replace(/[\u066B\u066C,٬\s]/g, '').replace(/[−–—]/g, '-').replace(/＋/g, '+');
    if (s === '') return F0();
    if (!/^[+-]/.test(s)) s = '+' + s;
    const terms = s.match(/[+-][^+-]+/g);
    if (!terms || terms.join('') !== s) return null;
    let sum = F0();
    for (const tm of terms) {
      const sign = tm[0] === '-' ? -1 : 1; let body = tm.slice(1), mul = frac(1);
      if (/میلیارد$/.test(body)) { mul = frac(1000000000); body = body.slice(0, -'میلیارد'.length); }
      else if (/میلیون$/.test(body)) { mul = frac(1000000); body = body.slice(0, -6); }
      else if (/هزار$/.test(body)) { mul = frac(1000); body = body.slice(0, -4); }
      const f = toFrac(body);
      if (!f || fSign(f) < 0) return null;
      const v = fMul(f, mul);
      sum = sign < 0 ? fSub(sum, v) : fAdd(sum, v);
    }
    return sum;
  }

  /* ---------------------------------------------------------------- */
  /* انتخاب زیرمجموعه، تقسیم خانوادگی و تخصیص تقریبی                       */
  /* ---------------------------------------------------------------- */
  const DIVISION_SCOPE_ORDER = { rural_outside: 0, rural_inside: 1, urban: 2 };
  const DIVISION_GRADE_ORDER = { grade1: 0, grade2: 1, grade3: 2, manual: 9 };

  function normalizeDivisionSelection(state, selection) {
    const all = (state && state.parcels) || [];
    const src = selection || (state && state.divisionSelection) || {};
    const x = {
      mode: src.mode === 'custom' ? 'custom' : (src.mode === 'filters' ? 'filters' : 'all'),
      scopes: Array.isArray(src.scopes) ? src.scopes.map(String) : [],
      grades: Array.isArray(src.grades) ? src.grades.map(String) : [],
      types: Array.isArray(src.types) ? src.types.map(String) : [],
      estates: Array.isArray(src.estates) ? src.estates.map(x => x == null ? '' : String(x)) : [],
      ids: Array.isArray(src.ids) ? src.ids.map(String) : null,
      excludedIds: Array.isArray(src.excludedIds) ? src.excludedIds.map(String) : [],
      includeUnclassified: src.includeUnclassified !== false,
    };
    const known = new Set(all.map(p => String(p.id)));
    x.excludedIds = x.excludedIds.filter(id => known.has(id));
    if (x.ids) x.ids = x.ids.filter(id => known.has(id));
    return x;
  }
  function divisionTypeKey(p) {
    const a = p && p.attrs || {};
    if (!p || p.scope === 'rural_inside') return 'inside:' + (a.residential || 'unknown') + ':' + (a.agri || 'none');
    if (p.scope === 'rural_outside') return 'outside:' + (a.farmType || 'other');
    return 'urban:' + (a.urbanUse || 'unknown');
  }
  function divisionTypeLabel(p) {
    const a = p && p.attrs || {}, k = divisionTypeKey(p), bits = k.split(':');
    if (bits[0] === 'inside') return 'داخل روستا — ' + (RES[bits[1]] || 'وضعیت مسکونی نامشخص') + ' / ' + (AGRI[bits[2]] || 'نوع کشاورزی نامشخص');
    if (bits[0] === 'outside') return 'اطراف روستا — ' + (FARM[bits[1]] || 'نوع زمین نامشخص');
    return 'داخل شهر — ' + (URBAN_USES[bits.slice(1).join(':')] || a.urbanUse || 'کاربری نامشخص');
  }
  function parcelMatchesDivisionFilter(p, selection) {
    if (!p) return false;
    const x = selection || {};
    if (x.scopes && x.scopes.length && x.scopes.indexOf(String(p.scope)) < 0) return false;
    if (x.grades && x.grades.length && x.grades.indexOf(String(p.grade || 'manual')) < 0) return false;
    if (x.types && x.types.length && x.types.indexOf(divisionTypeKey(p)) < 0) return false;
    const eid = p.estateId ? String(p.estateId) : '';
    if (x.estates && x.estates.length && x.estates.indexOf(eid) < 0) return false;
    return true;
  }
  /** فهرست فعلی زمین‌های انتخاب‌شده؛ حالت «همه» با اضافه‌شدن زمین جدید هم زنده می‌ماند. */
  function divisionParcelIds(state, selection) {
    const all = (state && state.parcels) || [];
    const x = normalizeDivisionSelection(state, selection);
    let ids;
    if (x.mode === 'custom' && x.ids) ids = x.ids.slice();
    else ids = all.filter(p => parcelMatchesDivisionFilter(p, x)).map(p => String(p.id));
    const excluded = new Set(x.excludedIds || []);
    ids = ids.filter(id => !excluded.has(String(id)));
    return ids.filter(id => all.some(p => String(p.id) === String(id)));
  }
  function setDivisionSelection(state, selection) {
    const x = normalizeDivisionSelection(state, selection);
    state.divisionSelection = x;
    return x;
  }
  /**
   * ترتیب حسابرسی‌پذیر فهرست تقسیم: اطراف روستا، درجه ۱ سپس ۲ و ۳؛
   * داخل روستا و شهری بعد از آن. در هر گروه ارزش فعلی نزولی است، نه عدد ذخیره‌شده.
   */
  function sortDivisionParcels(state, parcels) {
    const arr = (parcels || []).slice();
    arr.sort((a, b) => {
      const sa = DIVISION_SCOPE_ORDER[a.scope] == null ? 8 : DIVISION_SCOPE_ORDER[a.scope];
      const sb = DIVISION_SCOPE_ORDER[b.scope] == null ? 8 : DIVISION_SCOPE_ORDER[b.scope];
      if (sa !== sb) return sa - sb;
      const ga = DIVISION_GRADE_ORDER[a.grade] == null ? 9 : DIVISION_GRADE_ORDER[a.grade];
      const gb = DIVISION_GRADE_ORDER[b.grade] == null ? 9 : DIVISION_GRADE_ORDER[b.grade];
      if (ga !== gb) return ga - gb;
      const va = currentValuation(a, state && state.settings), vb = currentValuation(b, state && state.settings);
      const ta = isNum(va.total) ? va.total : -Infinity, tb = isNum(vb.total) ? vb.total : -Infinity;
      if (ta !== tb) return tb - ta;
      return String(a.name || a.id).localeCompare(String(b.name || b.id), 'fa');
    });
    return arr;
  }

  function familyConfig(state, personId) {
    const x = state && state.familySplits && state.familySplits[personId];
    if (!x || !x.enabled || !Array.isArray(x.members) || !x.members.length) return null;
    return x;
  }
  /** ایجاد تعداد سهم‌های برابر برای سهم یک شخص؛ نام/وزن‌ها بعداً قابل ویرایش‌اند. */
  function setFamilySplitCount(state, personId, count) {
    const p = (state.persons || []).find(x => x.id === personId);
    const n = Math.max(0, Math.min(100, Math.floor(Number(count) || 0)));
    if (!p) return null;
    state.familySplits = state.familySplits || {};
    if (!n) { delete state.familySplits[personId]; return null; }
    const old = familyConfig(state, personId);
    const members = [];
    for (let i = 0; i < n; i++) {
      const prev = old && old.members && old.members[i];
      members.push({ id: prev && prev.id || uid('fm'), name: prev && prev.name || ((p.name || 'عضو') + ' — سهم ' + (i + 1)), weight: prev && prev.weight != null ? prev.weight : 1, wnum: prev && prev.wnum || '1', wden: prev && prev.wden || '1' });
    }
    state.familySplits[personId] = { enabled: true, ownerId: personId, members };
    return state.familySplits[personId];
  }
  function setFamilyMember(state, personId, memberId, patch) {
    const f = familyConfig(state, personId); if (!f) return null;
    const m = f.members.find(x => x.id === memberId); if (!m) return null;
    if (patch && patch.name != null) m.name = String(patch.name).trim() || m.name;
    if (patch && patch.weight != null) {
      const w = toFrac(patch.weight); if (!w || fSign(w) <= 0) return null;
      m.weight = fToNumber(w); m.wnum = String(w.n); m.wden = String(w.d);
    }
    return m;
  }
  function familyBreakdown(state, personId, entitlement) {
    const f = familyConfig(state, personId); if (!f) return [];
    let sum = F0(); const ws = f.members.map(m => {
      const w = (m.wnum != null && m.wden != null) ? toFrac({ num: m.wnum, den: m.wden }) : toFrac(m.weight);
      return w && fSign(w) > 0 ? w : F0();
    });
    ws.forEach(w => { sum = fAdd(sum, w); });
    if (fSign(sum) <= 0) return [];
    return f.members.map((m, i) => {
      const share = fDiv(ws[i], sum), value = fMul(entitlement || F0(), share);
      return { id: m.id, name: m.name, weightText: fText(ws[i]), shareText: fText(share), sharePct: fPct(share, 4), value, valueExact: fToNumber(value), valueRounded: Math.round(fToNumber(value)) };
    });
  }

  function cashSettlementFromNumbers(rows) {
    const credit = rows.filter(x => x.amount > 0).map(x => ({ id: x.id, name: x.name, amount: x.amount }));
    const debit = rows.filter(x => x.amount < 0).map(x => ({ id: x.id, name: x.name, amount: -x.amount }));
    const out = []; let i = 0, j = 0;
    while (i < debit.length && j < credit.length) {
      const amount = Math.min(debit[i].amount, credit[j].amount);
      if (amount > 0) out.push({ from: debit[i].id, fromName: debit[i].name, to: credit[j].id, toName: credit[j].name, amount: Math.round(amount) });
      debit[i].amount -= amount; credit[j].amount -= amount;
      if (debit[i].amount <= 0.5) i++;
      if (credit[j].amount <= 0.5) j++;
    }
    return out;
  }
  /**
   * واگذاری تصادفیِ قابل تکرار: فقط زمین‌های انتخابی جابه‌جا می‌شوند؛ زمین‌های
   * خارج از انتخاب دست‌نخورده می‌مانند. چند ترتیب تصادفی امتحان و کمترین
   * مجموع اختلاف ارزش با حق محاسبه‌شده انتخاب می‌شود. اعداد ذخیره نمی‌شوند.
   */
  function randomAllocate(state, parcelIds, opts) {
    opts = opts || {};
    // آرایه‌ی خالی یعنی انتخاب خالی؛ فقط نبودن آرگومان اجازه می‌دهد
    // انتخاب جاری پروژه به‌عنوان پیش‌فرض استفاده شود.
    const ids = (Array.isArray(parcelIds) ? parcelIds : divisionParcelIds(state)).map(String);
    const includeUnclassified = opts.includeUnclassified !== false;
    const selected = ids.map(id => (state.parcels || []).find(p => String(p.id) === id)).filter(Boolean);
    const ps = includeUnclassified ? selected : selected.filter(p => findEstate(state, p.estateId));
    if (!ps.length) return { ok: false, errors: ['هیچ زمینِ دسته‌بندی‌شده‌ای برای تقسیم انتخاب نشده است'] };
    const live = divisionLive(state, { parcelIds: ps.map(p => p.id), includeUnclassified });
    if (!live || live.errors.some(e => /ارزش|مبلغ .*نامعتبر|سهم/.test(e))) return { ok: false, errors: (live && live.errors.length ? live.errors : ['محاسبه‌ی ارزش زمین‌ها کامل نیست']) };
    const persons = state.persons || [];
    if (!persons.length) return { ok: false, errors: ['ابتدا اشخاص را ثبت کنید'] };
    const values = ps.map(p => { const v = currentValuation(p, state.settings); return isNum(v.total) ? Math.round(v.total) : null; });
    if (values.some(v => v == null)) return { ok: false, errors: ['همه‌ی زمین‌های انتخابی ارزش قابل محاسبه ندارند'] };
    const targets = persons.map(p => {
      const r = live.people.find(x => x.person.id === p.id);
      return r ? Number(r.entitlementExact != null ? r.entitlementExact : fToNumber(r.entitlement || F0())) : 0;
    });
    const seed = Number.isFinite(Number(opts.seed)) ? (Number(opts.seed) >>> 0) : ((Date.now() ^ ps.length * 2654435761) >>> 0);
    function rndFactory(seed0) { let q = seed0 || 1; return () => { q = (q + 0x6D2B79F5) | 0; let t = Math.imul(q ^ q >>> 15, 1 | q); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
    const attempts = Math.max(8, Math.min(160, Number(opts.attempts) || 48));
    let best = null;
    for (let a = 0; a < attempts; a++) {
      const rand = rndFactory(seed + a * 1013904223), order = ps.map((p, i) => i);
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      order.sort((i, j) => values[j] - values[i] || (rand() - .5));
      const got = persons.map(() => 0), assigned = [];
      order.forEach(i => {
        let max = -Infinity, candidates = [];
        persons.forEach((p, k) => { const deficit = targets[k] - got[k]; if (deficit > max + 0.0001) { max = deficit; candidates = [k]; } else if (Math.abs(deficit - max) <= 0.0001) candidates.push(k); });
        const k = candidates[Math.floor(rand() * candidates.length)] || 0;
        got[k] += values[i]; assigned[i] = k;
      });
      const score = got.reduce((sum, x, k) => sum + Math.abs(x - targets[k]), 0);
      if (!best || score < best.score) best = { score, assigned, got };
    }
    ps.forEach((p, i) => setHolder(state, p.id, persons[best.assigned[i]].id, true));
    // برای تسویه، خانه/طلب/بدهی هم در اعتبار نهایی وارد می‌شود؛ خود تخصیص
    // زمین اما بر پایه‌ی حق زمین انجام شده تا مبلغ نقدیِ ناشی از آن شفاف بماند.
    const residual = persons.map((p, i) => {
      const r = live.people.find(x => x.person.id === p.id);
      const target = r && r.creditExact != null ? r.creditExact : targets[i];
      return { id: p.id, name: p.name, amount: target - best.got[i], target, landEntitlement: targets[i], got: best.got[i] };
    });
    const settlement = cashSettlementFromNumbers(residual);
    state.randomDivision = { seed, selectedIds: ps.map(p => p.id), at: nowIso() };
    return { ok: true, seed, selectedIds: ps.map(p => p.id), assignments: ps.map((p, i) => ({ parcelId: p.id, personId: persons[best.assigned[i]].id })), residual, settlement, score: best.score, live: divisionLive(state, { parcelIds: ps.map(p => p.id), includeUnclassified }) };
  }

  /* ---------------------------------------------------------------- */
  /* تخصیص تجاریِ خودکار: حفظ تقسیمات موجود، تنوع اموال و تسویه‌ی دقیق    */
  /* این بخش «پیشنهاد» را از «ثبت» جدا می‌کند تا هیچ تخصیص یا برش مهمی     */
  /* بدون تأیید کاربر وارد پروژه نشود.                                    */
  /* ---------------------------------------------------------------- */
  const ALLOCATION_MODES = { ask: 'انتخاب ملاک در هر نوبت', equal_value: 'برابری در ارزش نهایی', equal_mix: 'برابری در ترکیب اموال', law_ratio: 'نسبت قانونی/ارث', custom: 'قانون سفارشی' };
  const ALLOCATION_SPLITS = { area: 'تقسیم متری', percent: 'تقسیم درصدی', cash: 'تسویه‌ی نقدی' };
  function allocationValueF(state, p) {
    const v = currentValuation(p, state && state.settings);
    return isNum(v.total) ? frac(Math.round(v.total)) : F0();
  }
  function normalizeAllocationPolicy(state, policy) {
    const src = policy || {};
    const out = Object.assign({
      mode: state && state.allocationPolicy && state.allocationPolicy.mode ? state.allocationPolicy.mode : 'ask',
      preserveExisting: true,
      indivisible: 'physical_then_cash',
      splitMode: 'area',
      allowCoownership: false,
      mixKeys: ['scope', 'grade', 'type', 'special'],
      personWeights: {},
      resolutions: {},
      includeUnclassified: true,
    }, src);
    if (!ALLOCATION_MODES[out.mode]) out.mode = 'equal_value';
    if (['area', 'percent', 'cash'].indexOf(out.splitMode) < 0) out.splitMode = 'area';
    if (out.splitMode === 'cash') out.indivisible = 'cash_only';
    else if (out.splitMode === 'area' || out.splitMode === 'percent') out.indivisible = 'physical_then_cash';
    if (['physical_then_cash', 'cash_only'].indexOf(out.indivisible) < 0) out.indivisible = 'physical_then_cash';
    out.mixKeys = Array.isArray(out.mixKeys) ? out.mixKeys.filter(k => ['scope', 'grade', 'type', 'special', 'estate'].indexOf(k) >= 0) : ['scope', 'grade', 'type', 'special'];
    out.personWeights = out.personWeights && typeof out.personWeights === 'object' ? out.personWeights : {};
    out.resolutions = out.resolutions && typeof out.resolutions === 'object' ? out.resolutions : {};
    out.includeUnclassified = out.includeUnclassified !== false;
    out.preserveExisting = out.preserveExisting !== false;
    return out;
  }
  function allocationClassKey(p, policy) {
    const keys = policy.mixKeys || [];
    if (!keys.length) return 'all';
    return keys.map(k => {
      if (k === 'scope') return String(p.scope || 'unknown');
      if (k === 'grade') return String(p.grade || 'manual');
      if (k === 'type') return divisionTypeKey(p);
      if (k === 'special') return p.special ? 'special' : 'normal';
      if (k === 'estate') return estateIdOf(p) || 'unclassified';
      return '';
    }).join('|');
  }
  function allocationShareFractions(state, persons, live, policy) {
    let ws = persons.map(() => F0());
    if (policy.mode === 'equal_value' || policy.mode === 'equal_mix') {
      ws = persons.map(() => frac(1));
    } else {
      ws = persons.map((p, i) => {
        const law = inheritanceRatios(state);
        const raw = policy.personWeights[p.id] != null ? policy.personWeights[p.id] : (law[p.id] != null ? law[p.id] : null);
        if (raw != null) { const f = toFrac(raw); if (f && fSign(f) > 0) return f; }
        const r = live.people[i];
        return r && r.entitlement ? r.entitlement : F0();
      });
    }
    let sum = F0(); ws.forEach(w => { sum = fAdd(sum, w); });
    if (fSign(sum) <= 0) { ws = persons.map(() => frac(1)); sum = frac(persons.length || 1); }
    return { weights: ws, sum, shares: ws.map(w => fDiv(w, sum)) };
  }
  function allocationPersonName(state, id) { const p = (state.persons || []).find(x => x.id === id); return p ? p.name : '—'; }
  function allocationRank(persons, targetLand, held, classDesired, classHeld, classKey, mode) {
    return persons.map((p, i) => {
      const overall = fSub(targetLand[i], held[i]);
      const cTarget = classDesired[classKey] ? classDesired[classKey][i] : F0();
      const cHeld = classHeld[classKey] ? classHeld[classKey][i] : F0();
      const cDef = fSub(cTarget, cHeld);
      return { p, i, overall, cDef, positiveOverall: fSign(overall) > 0, positiveClass: fSign(cDef) > 0 };
    }).sort((a, b) => {
      if (mode === 'equal_mix') {
        if (a.positiveClass !== b.positiveClass) return a.positiveClass ? -1 : 1;
        const c = fCmp(b.cDef, a.cDef); if (c) return c;
      }
      const o = fCmp(b.overall, a.overall); if (o) return o;
      return String(a.p.name || a.p.id).localeCompare(String(b.p.name || b.p.id), 'fa');
    });
  }
  function allocationPortions(value, area, ranks, held, targetLand, classDesired, classHeld, classKey, mode) {
    let remaining = value, out = [];
    for (const r of ranks) {
      const d = fSub(targetLand[r.i], held[r.i]);
      if (fSign(d) <= 0) continue;
      const take = fCmp(remaining, d) <= 0 ? remaining : d;
      if (fSign(take) <= 0) continue;
      const share = fDiv(take, value);
      out.push({ personId: r.p.id, personName: r.p.name, value: fPack(take), share: fPack(share), area: area == null ? null : fToNumber(fMul(frac(Math.round(area * 1000000), 1000000), share)) });
      remaining = fSub(remaining, take);
      if (fSign(remaining) <= 0) break;
    }
    if (fSign(remaining) > 0) {
      const r = ranks[0];
      if (r) {
        const existing = out.find(x => x.personId === r.p.id);
        if (existing) existing.value = fPack(fAdd(toFrac(existing.value), remaining));
        else out.push({ personId: r.p.id, personName: r.p.name, value: fPack(remaining), share: fPack(fDiv(remaining, value)), area: area == null ? null : fToNumber(fMul(frac(Math.round(area * 1000000), 1000000), fDiv(remaining, value))) });
      }
    }
    // کسرهای هر بخش را دقیقاً به یک برسان؛ بخش اضافه‌ی ناشی از گردکردن فقط در نمایش رخ می‌دهد.
    let ss = F0(); out.forEach(x => { ss = fAdd(ss, toFrac(x.share)); });
    if (out.length && !fEq(ss, F1())) { const last = out[out.length - 1]; last.share = fPack(fAdd(toFrac(last.share), fSub(F1(), ss))); }
    return out;
  }
  function allocationCashRows(state, persons, targetFinal, held) {
    return persons.map((p, i) => {
      const amount = fSub(targetFinal[i], held[i]);
      return { id: p.id, name: p.name, amountExact: fPack(amount), amount: fToNumber(amount) };
    });
  }
  /**
   * محاسبه‌ی پیشنهاد تخصیص؛ هیچ‌چیز را در state تغییر نمی‌دهد.
   * اگر ملک بزرگ‌تر از کسری چند نفر باشد، requiresInput=true برمی‌گرداند و
   * رابط باید برای همان ملک «متری/درصدی/نقدی» را از کاربر بپرسد.
   */
  function automaticAllocationPlan(state, opts) {
    opts = opts || {};
    const policy = normalizeAllocationPolicy(state, opts.policy || opts);
    if (policy.mode === 'ask') return { ok: false, errors: ['ابتدا ملاک تقسیم را انتخاب کنید: برابری در ارزش، برابری در ترکیب اموال، نسبت قانونی یا قانون سفارشی.'] };
    const ids = Array.isArray(opts.selectedIds) ? opts.selectedIds.map(String) : divisionParcelIds(state, state.divisionSelection);
    const selected = ids.map(id => (state.parcels || []).find(p => String(p.id) === id)).filter(Boolean);
    if (!selected.length) return { ok: false, errors: ['هیچ زمینی برای تخصیص خودکار انتخاب نشده است'] };
    const live = divisionLive(state, { parcelIds: selected.map(p => p.id), includeUnclassified: policy.includeUnclassified });
    if (!live) return { ok: false, errors: ['محاسبه‌ی زنده انجام نشد'] };
    if (live.errors.length) return { ok: false, errors: live.errors.slice() };
    const persons = state.persons || [];
    if (!persons.length) return { ok: false, errors: ['ابتدا اشخاص/ورثه را ثبت کنید'] };
    const effective = policy.includeUnclassified ? selected : selected.filter(p => findEstate(state, p.estateId));
    const values = effective.map(p => allocationValueF(state, p));
    if (values.some(v => fSign(v) < 0)) return { ok: false, errors: ['ارزش منفی در زمین‌ها مجاز نیست'] };
    const shares = allocationShareFractions(state, persons, live, policy);
    let totalF = F0(); values.forEach(v => { totalF = fAdd(totalF, v); });
    const targetLand = shares.shares.map(s => fMul(totalF, s));
    const targetFinal = persons.map((p, i) => {
      const r = live.people.find(x => x.person.id === p.id);
      return fAdd(targetLand[i], r ? fAdd(r.house || F0(), r.adjust || F0()) : F0());
    });
    const held = persons.map(() => F0()), classHeld = {}, classDesired = {},
      classKeys = new Set(), whole = [], splits = [], coownerships = [], free = [];
    const holderFor = p => policy.preserveExisting ? holderOfParcel(state, p) : '';
    effective.forEach(p => {
      const v = allocationValueF(state, p), h = holderFor(p), co = coOwnersOfParcel(state, p), ck = allocationClassKey(p, policy);
      classKeys.add(ck);
      if (!classDesired[ck]) classDesired[ck] = persons.map(() => F0());
      persons.forEach((_, i) => { classDesired[ck][i] = fAdd(classDesired[ck][i], fMul(v, shares.shares[i])); });
      if (h) {
        const i = persons.findIndex(x => x.id === h);
        if (i >= 0) {
          held[i] = fAdd(held[i], v); if (!classHeld[ck]) classHeld[ck] = persons.map(() => F0()); classHeld[ck][i] = fAdd(classHeld[ck][i], v);
        } else free.push(p);
      } else if (co.length) {
        co.forEach(o => { const i = persons.findIndex(x => x.id === o.personId); if (i >= 0) { const ov = fMul(v, o.share); held[i] = fAdd(held[i], ov); if (!classHeld[ck]) classHeld[ck] = persons.map(() => F0()); classHeld[ck][i] = fAdd(classHeld[ck][i], ov); } });
      } else free.push(p);
    });
    // اگر حفظ تقسیمات خاموش باشد، همه‌ی زمین‌های انتخابی از نو قابل تخصیص‌اند.
    if (!policy.preserveExisting) { free.length = 0; effective.forEach(p => free.push(p)); for (let i = 0; i < held.length; i++) held[i] = F0(); }
    const virtual = held.slice(), virtualClass = {};
    Object.keys(classHeld).forEach(k => { virtualClass[k] = classHeld[k].slice(); });
    const addVirtual = (i, ck, v) => { virtual[i] = fAdd(virtual[i], v); if (!virtualClass[ck]) virtualClass[ck] = persons.map(() => F0()); virtualClass[ck][i] = fAdd(virtualClass[ck][i], v); };
    const sortFree = free.slice().sort((a, b) => fToNumber(allocationValueF(state, b)) - fToNumber(allocationValueF(state, a)));
    for (const p of sortFree) {
      const v = allocationValueF(state, p), ck = allocationClassKey(p, policy);
      const ranks = allocationRank(persons, targetLand, virtual, classDesired, virtualClass, ck, policy.mode);
      const best = ranks[0]; if (!best) continue;
      const positive = ranks.filter(r => r.positiveOverall);
      const bestDef = positive.length ? fSub(targetLand[best.i], virtual[best.i]) : F0();
      const oversized = positive.length > 1 && fCmp(v, bestDef) > 0;
      const resolution = policy.resolutions[String(p.id)] || null;
      const canPhysical = !!(p.geometry && p.geometry.ring && p.geometry.ring.length >= 3 && isNum(currentValuation(p, state.settings).area));
      if (oversized && policy.indivisible === 'physical_then_cash' && !resolution && canPhysical) {
        const portions = allocationPortions(v, currentValuation(p, state.settings).area, ranks, virtual, targetLand, classDesired, virtualClass, ck, policy.mode);
        const options = ['area', 'percent', 'cash']; if (policy.allowCoownership) options.push('coownership');
        return { ok: true, requiresInput: true, selectedIds: effective.map(x => x.id), policy, live, request: { parcelId: p.id, parcelName: p.name, value: fPack(v), area: currentValuation(p, state.settings).area, canPhysical, options, portions, anchorPersonId: best.p.id, anchorPersonName: best.p.name, message: 'این ملک از کسری یک نفر بزرگ‌تر است؛ روش تقسیم را انتخاب کنید.' }, partial: { whole, splits, coownerships }, targets: persons.map((x, i) => ({ id: x.id, name: x.name, share: fPack(shares.shares[i]), landTarget: fPack(targetLand[i]), finalTarget: fPack(targetFinal[i]) })) };
      }
      if (oversized && resolution === 'coownership') {
        const portions = allocationPortions(v, currentValuation(p, state.settings).area, ranks, virtual, targetLand, classDesired, virtualClass, ck, policy.mode);
        coownerships.push({ parcelId: p.id, parcelName: p.name, portions, value: fPack(v) });
        portions.forEach(x => { const i = persons.findIndex(y => y.id === x.personId); addVirtual(i, ck, toFrac(x.value)); });
      } else if (oversized && (resolution === 'area' || resolution === 'percent') && canPhysical) {
        const portions = allocationPortions(v, currentValuation(p, state.settings).area, ranks, virtual, targetLand, classDesired, virtualClass, ck, policy.mode);
        splits.push({ parcelId: p.id, parcelName: p.name, mode: resolution, portions, anchorPersonId: best.p.id, shares: portions.map(x => x.share) });
        portions.forEach(x => { const i = persons.findIndex(y => y.id === x.personId); addVirtual(i, ck, toFrac(x.value)); });
      } else {
        whole.push({ parcelId: p.id, parcelName: p.name, personId: best.p.id, personName: best.p.name, value: fPack(v), classKey: ck });
        addVirtual(best.i, ck, v);
      }
    }
    const cash = allocationCashRows(state, persons, targetFinal, virtual);
    const score = persons.reduce((sum, p, i) => sum + Math.abs(fToNumber(fSub(targetLand[i], virtual[i]))), 0);
    const sumCash = cash.reduce((s, x) => s + x.amount, 0);
    return { ok: true, requiresInput: false, selectedIds: effective.map(x => x.id), policy, live, targets: persons.map((x, i) => ({ id: x.id, name: x.name, share: fPack(shares.shares[i]), landTarget: fPack(targetLand[i]), finalTarget: fPack(targetFinal[i]) })), whole, splits, coownerships, cash, settlement: cashSettlementFromNumbers(cash), score, balanced: Math.abs(sumCash) < 0.5, warnings: Math.abs(sumCash) >= 0.5 ? ['جمع مانده‌های نقدی صفر نیست؛ تعدیل/خانه/بدهی‌ها باید جداگانه بررسی شود.'] : [] };
  }
  function applyAutomaticAllocation(state, plan, opts) {
    opts = opts || {};
    if (!plan || !plan.ok) return { ok: false, errors: ['طرح تخصیص معتبر نیست'] };
    if (plan.requiresInput) return { ok: false, requiresInput: true, request: plan.request, errors: ['برای ملک «' + plan.request.parcelName + '» روش تقسیم انتخاب نشده است'] };
    const changed = [], splitParts = [];
    (plan.whole || []).forEach(x => { const r = setHolder(state, x.parcelId, x.personId, true); if (r.ok) changed.push(x.parcelId); });
    (plan.splits || []).forEach(x => {
      const p = state.parcels.find(q => q.id === x.parcelId); if (!p) return;
      if (!p.geometry || !p.geometry.ring) { setHolder(state, p.id, x.anchorPersonId, true); changed.push(p.id); return; }
      const rings = splitMulti(p.geometry.ring, x.shares, { azimuth: principalAzimuth(p.geometry.ring) });
      if (!rings.ok) { setHolder(state, p.id, x.anchorPersonId, true); changed.push(p.id); return; }
      const idx = state.parcels.findIndex(q => q.id === p.id), base = clone(p), made = [];
      rings.parts.forEach((part, i) => {
        const portion = x.portions[i], q = clone(base);
        q.id = i === 0 ? p.id : uid('land'); q.name = (base.name || base.id) + ' — بخش ' + (i + 1);
        q.geometry = { ring: part.ring, source: 'auto-split', meta: { parentId: base.id, allocationMode: x.mode, note: 'برش خودکار پس از تأیید کاربر' } };
        q.areaComputed = part.area; q.areaOverride = null; q.holderId = portion.personId; q.valuation = null;
        q.history = (base.history || []).slice(); applyValuation(q, state.settings, 'تقسیم خودکار ملک با روش ' + (x.mode === 'percent' ? 'درصدی' : 'متری'));
        made.push(q);
      });
      state.parcels.splice(idx, 1, ...made); splitParts.push({ parentId: p.id, ids: made.map(q => q.id) }); changed.push(p.id);
      if (state.divisionSelection && Array.isArray(state.divisionSelection.ids)) { state.divisionSelection.ids = state.divisionSelection.ids.filter(id => id !== p.id).concat(made.map(q => q.id)); }
    });
    (plan.coownerships || []).forEach(x => {
      const p = state.parcels.find(q => q.id === x.parcelId); if (!p || !Array.isArray(x.portions) || !x.portions.length) return;
      p.holderId = null; p.coOwners = x.portions.map(part => ({ personId: part.personId, share: clone(part.share), value: clone(part.value) })); changed.push(p.id);
    });
    state.allocationRun = { id: uid('alloc'), at: nowIso(), mode: plan.policy.mode, selectedIds: plan.selectedIds.slice(), preserveExisting: plan.policy.preserveExisting, allowCoownership: plan.policy.allowCoownership, splitMode: plan.policy.splitMode, resolutions: clone(plan.policy.resolutions || {}) };
    state.log = state.log || []; state.log.push({ at: nowIso(), msg: 'ثبت تخصیص خودکار (' + (ALLOCATION_MODES[plan.policy.mode] || plan.policy.mode) + ')' });
    return { ok: true, changed, splitParts, cash: plan.cash, settlement: plan.settlement, score: plan.score, warnings: plan.warnings || [] };
  }

  /* ---------------------------------------------------------------- */
  /* تقسیم زنده: همه‌چیز مستقیم از «دسته‌ی هر زمین» و «دست کی بودن» حساب می‌شود */
  /* هیچ فهرست یا عدد حفظ‌شده‌ای وجود ندارد؛ با هر تغییر، همه‌چیز از نو محاسبه می‌شود */
  /* ---------------------------------------------------------------- */
  const parcelValueF = (p, state) => currentParcelValueF(state, p);
  /** کسی که زمین‌هایش قابل خرید است (کسی که در «خانه‌ی شهر» بدهکار است) */
  const sellerId = (state) => (state.house && state.house.payer) || '';
  /** دست چه کسی است؟ شناسه‌ی نامعتبر = آزاد */
  function coOwnersOfParcel(state, p) {
    return (p && Array.isArray(p.coOwners) ? p.coOwners : []).filter(x => x && x.personId && (state.persons || []).some(person => person.id === x.personId)).map(x => Object.assign({}, x, { share: toFrac(x.share) || F0() }));
  }
  function holderOfParcel(state, p) {
    return coOwnersOfParcel(state, p).length ? '' : ((p && p.holderId && (state.persons || []).some(x => x.id === p.holderId)) ? p.holderId : '');
  }
  /** آیا شخص می‌تواند این زمین را بردارد؟ فقط زمینِ فروشنده یا زمین آزاد (مشاع باید صریحاً شکسته شود) */
  function canTake(state, parcelId, personId) {
    const p = (state.parcels || []).find(x => x.id === parcelId);
    if (!p) return { ok: false, reason: 'زمین پیدا نشد' };
    const co = coOwnersOfParcel(state, p);
    if (co.length && personId) return { ok: false, reason: 'این زمین مشاع است؛ برای تغییر، ابتدا سهم‌های مشاع را در برگه‌ی تأییدشده بررسی و آزاد کنید' };
    const cur = holderOfParcel(state, p);
    if (!personId || cur === personId) return { ok: true };
    if (!cur || cur === sellerId(state)) return { ok: true };
    const o = (state.persons || []).find(x => x.id === cur);
    return { ok: false, reason: 'این زمین دست «' + (o ? o.name : '؟') + '» است؛ تا او آزادش نکند قابل خرید نیست' };
  }
  /** تغییر «دست کی»؛ force برای ثبت اولیه‌ی زمین (بدون محدودیت) */
  function setHolder(state, parcelId, personId, force) {
    const p = (state.parcels || []).find(x => x.id === parcelId);
    if (!p) return { ok: false, reason: 'زمین پیدا نشد' };
    const chk = force ? { ok: true } : canTake(state, parcelId, personId);
    if (!chk.ok) return chk;
    p.coOwners = []; p.holderId = personId || null;
    return { ok: true };
  }
  /**
   * محاسبه‌ی کامل با کسر دقیق:
   *  حق از هر دسته = ارزش دسته × (وزن شخص ÷ جمع وزن‌ها)
   *  اعتبار = جمع حق‌ها + خانه‌ی شهر + «سایر» ؛ مانده = اعتبار − ارزش زمین‌های دستش
   */
  function divisionLive(state, opts) {
    opts = opts || {};
    const persons = state.persons || [], allParcels = state.parcels || [], estates = state.estates || [];
    const requested = Array.isArray(opts.parcelIds) ? new Set(opts.parcelIds.map(String)) : null;
    const candidates = requested ? allParcels.filter(p => requested.has(String(p.id))) : allParcels.slice();
    const includeUnclassified = opts.includeUnclassified === true;
    const errors = [], warns = [], incompleteNames = [];
    const gid = (p) => p && p.estateId && estates.some(e => e.id === p.estateId) ? String(p.estateId) : '';
    // در رابط انتخابی، برداشتن تیک «بدون دسته» آن زمین را واقعاً از جمع کل خارج می‌کند.
    // حالت قدیمیِ بدون opts عمداً برای سازگاری هشدار می‌دهد ولی کل فهرست را نشان می‌دهد.
    const parcels = requested && !includeUnclassified ? candidates.filter(p => !!gid(p)) : candidates;
    parcels.forEach(p => { const co = coOwnersOfParcel(state, p); if (co.length) { let sum = F0(); co.forEach(o => { sum = fAdd(sum, o.share); }); if (!fEq(sum, F1())) errors.push('سهم‌های مشاعِ «' + (p.name || p.id) + '» باید دقیقاً ۱۰۰٪ باشند'); } });
    const valueOf = (p) => currentValuation(p, state.settings);
    const valueF = (p) => { const v = valueOf(p); if (isNum(v.total)) return frac(Math.round(v.total)); const nm = p.name || p.id; if (incompleteNames.indexOf(nm) < 0) incompleteNames.push(nm); return F0(); };
    const areaOf = (p) => { const v = valueOf(p); return isNum(v.area) ? v.area : 0; };

    // هر بار از اطلاعات جاری زمین حساب می‌شود؛ valuation فقط سازگاری فایل قدیمی است.
    const cats = estates.map(e => {
      const ps = parcels.filter(p => gid(p) === String(e.id));
      let V = F0(), area = 0;
      ps.forEach(p => { V = fAdd(V, valueF(p)); area += areaOf(p); });
      const w = estateWeights(state, e.id);
      const shares = persons.map((x, i) => fSign(w.sum) > 0 ? fDiv(w.weights[i], w.sum) : F0());
      if (ps.length && fSign(w.sum) <= 0) errors.push('برای دسته‌ی «' + e.name + '» سهمی ثبت نشده است');
      return { id: String(e.id), name: e.name, count: ps.length, area, value: V, weights: w.weights, weightSum: w.sum, usedDefault: w.usedDefault, shares };
    });
    // در محاسبه‌ی انتخابی، زمین‌های بدون دسته فقط از جمع حذف می‌شوند اما
    // همچنان در گزارش «خارج از انتخاب» دیده می‌شوند؛ در حالت قدیمیِ بدون
    // parcelIds رفتار قبلی (نمایش هشدار و حضور در کل پایه) حفظ می‌شود.
    const unc = requested ? candidates.filter(p => !gid(p)) : parcels.filter(p => !gid(p));
    let uncV = F0();
    if (!requested || includeUnclassified) unc.forEach(p => { uncV = fAdd(uncV, valueF(p)); });
    if (unc.length && !includeUnclassified) warns.push(unc.length + ' زمین «دسته‌بندی‌نشده» است و در هیچ سهمی حساب نمی‌شود');
    if (incompleteNames.length) errors.push('زمین‌های انتخابی بدون مساحت یا قیمت قابل محاسبه‌اند: ' + incompleteNames.join('، '));
    if (includeUnclassified && unc.length) {
      const w = estateWeights(state, null);
      const shares = persons.map((x, i) => fSign(w.sum) > 0 ? fDiv(w.weights[i], w.sum) : F0());
      cats.push({ id: '', name: NO_ESTATE_NAME, count: unc.length, area: unc.reduce((a, p) => a + areaOf(p), 0), value: uncV,
        weights: w.weights, weightSum: w.sum, usedDefault: true, shares });
    }

    const h = state.house || {};
    let amount = F0();
    if (h.amount != null && String(h.amount).trim() !== '') { amount = parseAdjust(h.amount); if (!amount) { errors.push('مبلغ خانه‌ی شهر نامعتبر است'); amount = F0(); } }
    const recv = (h.receivers || []).filter(id => persons.some(x => x.id === id));
    const houseOf = (id) => recv.indexOf(id) >= 0 ? amount : (id === h.payer ? fNeg(fMul(amount, frac(recv.length))) : F0());

    const people = persons.map((x, i) => {
      let ent = F0();
      const parts = cats.map(c => {
        const v = fMul(c.value, c.shares[i]); ent = fAdd(ent, v);
        return { id: c.id, name: c.name, weight: c.weights[i], share: c.shares[i], value: v };
      });
      const hf = houseOf(x.id);
      let adj = parseAdjust((state.adjust || {})[x.id]);
      if (!adj) { errors.push('مبلغ «سایر» ' + x.name + ' نامعتبر است'); adj = F0(); }
      const credit = fAdd(fAdd(ent, hf), adj);
      const held = [];
      parcels.forEach(p => {
        if (holderOfParcel(state, p) === x.id) { const q = Object.assign({}, p); q.valuation = valueOf(p); held.push(q); return; }
        coOwnersOfParcel(state, p).filter(o => o.personId === x.id).forEach(o => { const q = Object.assign({}, p, { coOwnerShare: o.share }); q.valuation = valueOf(p); held.push(q); });
      });
      let heldV = F0(), heldArea = 0;
      held.forEach(p => { const share = p.coOwnerShare || F1(); heldV = fAdd(heldV, fMul(valueF(p), share)); heldArea += areaOf(p) * fToNumber(share); });
      const remaining = fSub(credit, heldV);
      return { person: x, parts, entitlement: ent, entitlementExact: fToNumber(ent), house: hf, adjust: adj,
        credit, creditExact: fToNumber(credit), held, heldValue: heldV, heldArea, remaining, remainingNum: fToNumber(remaining),
        family: [] };
    });
    people.forEach(r => { r.family = familyBreakdown(state, r.person.id, r.entitlement); });

    let total = F0(); parcels.forEach(p => { total = fAdd(total, valueF(p)); });
    const free = parcels.filter(p => !holderOfParcel(state, p) && !coOwnersOfParcel(state, p).length);
    let freeV = F0(); free.forEach(p => { freeV = fAdd(freeV, valueF(p)); });
    let sumAdj = F0(), sumRem = F0(), sumCredit = F0(), sumHeld = F0(), sumEnt = F0();
    people.forEach(r => { sumAdj = fAdd(sumAdj, fAdd(r.house, r.adjust)); sumRem = fAdd(sumRem, r.remaining); sumCredit = fAdd(sumCredit, r.credit); sumHeld = fAdd(sumHeld, r.heldValue); sumEnt = fAdd(sumEnt, r.entitlement); });
    if (fSign(sumAdj) !== 0) warns.push('جمع «خانه‌ی شهر + سایر» صفر نیست (' + fToNumber(sumAdj).toLocaleString('en') + ' تومان)؛ یعنی کسی طلب یا بدهی بی‌طرف دارد');
    if (!unc.length && persons.length && fSign(sumRem) !== 0 && !free.length && fSign(sumAdj) === 0) errors.push('خطای حساب: همه‌ی زمین‌ها دست کسی است و جمع مانده‌ها صفر نشد');
    return { cats, people, total, free, freeValue: freeV, unclassified: unc, unclassifiedValue: uncV,
      sumEntitlement: sumEnt, sumCredit, sumHeld, sumAdjust: sumAdj, sumRemaining: sumRem,
      errors, warns, seller: sellerId(state), house: { amount, receivers: recv, payer: h.payer || '' },
      selectedIds: parcels.map(p => p.id), includeUnclassified, valuationSource: 'live' };
  }

  /* ---------------------------------------------------------------- */
  return {
    setProj4, normDigits, toNum, uid, nowIso, clone,
    // کسر دقیق
    frac, isFrac, toFrac, fPack, fAdd, fSub, fMul, fDiv, fNeg, fAbs, fCmp, fEq, fSign, fToNumber,
    fText, fMixed, fPct, fNum, parseShare,
    CRS_LIST, detectCRS, sniffCrsText, toWGS84,
    areaM2, validateRing, openRing, localPlane,
    // برش زمین با خط مستقیم (تقسیم به دو قسمت با متراژ مشخص)
    splitMulti, splitAxes, splitPrepare, splitOffsetRange, splitByArea, splitByOffset, splitRingByArea, principalAzimuth,
    splitDelimited, importTable, importText, importGeoJSON, importKML, buildPreview,
    SCOPES, GRADES, AGRI, FARM, RES, URBAN_USES, METHODS,
    defaultSettings, cellKey, suggestRuralGrade, featureScore, valuate, currentValuation, applyValuation, newParcel,
    newState, addParcel, saveParcel, removeParcel, updateSettings, defaultInheritanceRule, defaultAllocationPolicy, createProfilePackage, restoreFromTrash, inheritanceRatios,
    addPerson, setPersonWeight, personWeightFrac, createScenario,
    setAllocation, setEqualAllocation, allocFrac, allocSum, evaluateScenario,
    // دسته‌های اموال (چند منبع با سهم متفاوت) و مبنای قیمت سناریو
    NO_ESTATE, NO_ESTATE_NAME, PRICE_MODES, PRICE_LEVELS,
    newEstate, addEstate, findEstate, removeEstate, estateIdOf, estateWeightFrac, setEstateWeight,
    setEstateEqualWeights, estateWeights, setParcelEstate,
    normBasis, setScenarioBasis, basisSettings, priceLevelSettings, basisText, scenarioPrices,
    buildDivisionSheets,
    // پرونده‌ی زنده
    parcelSnap, caseParcels, createCase, convertScenarioToCase, addSection, setSectionWeight, sectionWeightFrac, addDeal, removePerson, evaluateCase, parseAdjust, sectionsFromEstates,
    // تقسیم زنده‌ی ساده (دسته + دست کی) و ابزارهای انتخاب/تخصیص
    divisionLive, canTake, setHolder, holderOfParcel, coOwnersOfParcel, sellerId,
    normalizeDivisionSelection, parcelMatchesDivisionFilter, divisionTypeKey, divisionTypeLabel, divisionParcelIds, setDivisionSelection, sortDivisionParcels,
    setFamilySplitCount, setFamilyMember, familyBreakdown, randomAllocate,
    ALLOCATION_MODES, ALLOCATION_SPLITS, normalizeAllocationPolicy, automaticAllocationPlan, applyAutomaticAllocation,
  };
});
