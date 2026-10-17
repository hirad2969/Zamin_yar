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
      id: uid('land'), name: '', scope: 'rural_inside',
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
  function newState() {
    const s = defaultSettings();
    return { schema: 1, settings: s, settingsHistory: [{ version: s.version, at: s.updatedAt, settings: clone(s), reason: 'نسخه‌ی اولیه' }], parcels: [], persons: [], scenarios: [], log: [] };
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
  /* ---------------------------------------------------------------- */
  function addPerson(state, name, weight) {
    const p = { id: uid('p'), name: name, weight: isFinite(weight) && weight > 0 ? weight : 1 };
    state.persons.push(p); return p;
  }
  /** ساخت سناریو با «عکس» قیمت‌های فعلی؛ سناریوهای قدیمی دست‌نخورده می‌مانند */
  function createScenario(state, name, parcelIds) {
    const snap = {};
    state.parcels.filter(p => !parcelIds || parcelIds.indexOf(p.id) >= 0).forEach(p => {
      const v = p.valuation || {};
      snap[p.id] = {
        name: p.name, scope: p.scope, area: v.area, pricePerM2: v.pricePerM2, total: v.total, special: !!p.special,
        agri: p.scope === 'rural_outside' ? p.attrs.farmType : (p.scope === 'rural_inside' || p.attrs.urbanUse === 'agri' ? p.attrs.agri : null),
        grade: p.grade, urbanUse: p.attrs.urbanUse, status: v.status,
      };
    });
    const sc = { id: uid('sc'), name: name || 'سناریو', createdAt: nowIso(), settingsVersion: state.settings.version, parcels: snap, allocations: {} };
    state.scenarios.push(sc); return sc;
  }
  function setAllocation(scenario, parcelId, personId, fraction) {
    const a = scenario.allocations[parcelId] = (scenario.allocations[parcelId] || []).filter(x => x.personId !== personId);
    if (fraction > 0) a.push({ personId, fraction });
    if (!a.length) delete scenario.allocations[parcelId];
  }
  function evaluateScenario(state, sc) {
    const persons = state.persons;
    const totalWeight = persons.reduce((s, p) => s + p.weight, 0) || 1;
    const poolIds = Object.keys(sc.parcels);
    const pool = poolIds.reduce((s, id) => s + (sc.parcels[id].total || 0), 0);
    const errors = [];
    const res = persons.map(p => ({ person: p, entitled: pool * p.weight / totalWeight, received: 0, area: 0, byScope: {}, byAgri: {}, specialValue: 0, parcels: [] }));
    const used = {};
    poolIds.forEach(id => {
      const al = sc.allocations[id] || [];
      const sum = al.reduce((s, x) => s + x.fraction, 0);
      used[id] = sum;
      if (sum > 1 + 1e-9) errors.push(`مجموع سهم‌های زمین «${sc.parcels[id].name}» بیش از ۱۰۰٪ است`);
      al.forEach(x => {
        const r = res.find(z => z.person.id === x.personId); if (!r) return;
        const sp = sc.parcels[id], val = (sp.total || 0) * x.fraction, ar = (sp.area || 0) * x.fraction;
        r.received += val; r.area += ar;
        r.byScope[sp.scope] = r.byScope[sp.scope] || { area: 0, value: 0 }; r.byScope[sp.scope].area += ar; r.byScope[sp.scope].value += val;
        const ak = sp.agri || 'بدون';
        r.byAgri[ak] = r.byAgri[ak] || { area: 0, value: 0 }; r.byAgri[ak].area += ar; r.byAgri[ak].value += val;
        if (sp.special) r.specialValue += val;
        r.parcels.push({ id, name: sp.name, fraction: x.fraction, value: val, area: ar });
      });
    });
    res.forEach(r => { r.diff = Math.round(r.received - r.entitled); r.diffPct = r.entitled ? r.diff / r.entitled * 100 : 0; r.received = Math.round(r.received); r.entitled = Math.round(r.entitled); });
    const unallocated = poolIds.filter(id => used[id] < 1 - 1e-9).map(id => ({ id, name: sc.parcels[id].name, remaining: 1 - used[id], value: Math.round((sc.parcels[id].total || 0) * (1 - used[id])) }));
    const incomplete = poolIds.filter(id => sc.parcels[id].total == null).map(id => sc.parcels[id].name);
    if (incomplete.length) errors.push('زمین‌های بدون ارزش قطعی در مجموع لحاظ نشده‌اند: ' + incomplete.join('، '));
    return { pool: Math.round(pool), results: res, unallocated, errors };
  }

  /* ---------------------------------------------------------------- */
  return {
    setProj4, normDigits, toNum, uid, nowIso, clone,
    CRS_LIST, detectCRS, sniffCrsText, toWGS84,
    areaM2, validateRing, openRing,
    splitDelimited, importTable, importText, importGeoJSON, importKML, buildPreview,
    SCOPES, GRADES, AGRI, FARM, RES, URBAN_USES, METHODS,
    defaultSettings, cellKey, suggestRuralGrade, featureScore, valuate, applyValuation, newParcel,
    newState, addParcel, saveParcel, updateSettings,
    addPerson, createScenario, setAllocation, evaluateScenario,
  };
});
