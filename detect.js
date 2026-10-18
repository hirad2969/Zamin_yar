/* تشخیص مرز زمین از روی تصویر: رشد ناحیه از نقطه‌ی مرکز (Region growing) در فضای رنگ Lab
 * بدون وابستگی به DOM؛ ورودی: پیکسل‌های RGBA و نقطه‌ی مرکز؛ خروجی: حلقه‌ی مرز به پیکسل.
 * این روش «تقریبی» است: وقتی زمین از اطرافش رنگ/بافت متفاوت دارد خوب کار می‌کند؛
 * وقتی زمین‌های هم‌رنگ کنار هم باشند مرز را نمی‌بیند و کاربر باید اصلاح کند. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LandDetect = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* سطح حساسیت: tol = بیشینه‌ی اختلاف رنگ (ΔE) با رنگ مرکز، g = بیشینه‌ی شیب (لبه) مجاز */
  const LEVELS = [
    { tol: 6, g: 2.5 }, { tol: 9, g: 3.5 }, { tol: 13, g: 5 },
    { tol: 18, g: 7 }, { tol: 24, g: 9.5 }, { tol: 31, g: 12 },
  ];
  const MIN_AREA = 250;        // پیکسل؛ کوچک‌تر از آن «زمین» حساب نمی‌شود
  const MAX_VERTS = 45;

  const LIN = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const c = i / 255; LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  const f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;

  function toLab(data, n) {
    const Lc = new Float32Array(n), Ac = new Float32Array(n), Bc = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const r = LIN[data[4 * i]], g = LIN[data[4 * i + 1]], b = LIN[data[4 * i + 2]];
      const fx = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
      const fy = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
      const fz = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
      Lc[i] = 116 * fy - 16; Ac[i] = 500 * (fx - fy); Bc[i] = 200 * (fy - fz);
    }
    return [Lc, Ac, Bc];
  }

  /* فیلتر میانگین جداشدنی با شعاع r */
  function boxBlur(src, w, h, r) {
    if (r <= 0) return src;
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h), win = 2 * r + 1;
    for (let y = 0; y < h; y++) {
      const o = y * w; let s = 0;
      for (let k = -r; k <= r; k++) s += src[o + Math.min(w - 1, Math.max(0, k))];
      for (let x = 0; x < w; x++) {
        tmp[o + x] = s / win;
        s += src[o + Math.min(w - 1, x + r + 1)] - src[o + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += tmp[Math.min(h - 1, Math.max(0, k)) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = s / win;
        s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
      }
    }
    return out;
  }

  /* مجموع پنجره‌ای با تصویر انتگرالی */
  function integral(mask, w, h) {
    const W = w + 1, I = new Int32Array(W * (h + 1));
    for (let y = 0; y < h; y++) {
      let row = 0;
      for (let x = 0; x < w; x++) { row += mask[y * w + x]; I[(y + 1) * W + x + 1] = I[y * W + x + 1] + row; }
    }
    return I;
  }
  function winCount(I, w, h, x, y, r) {
    const W = w + 1, x0 = Math.max(0, x - r), y0 = Math.max(0, y - r), x1 = Math.min(w, x + r + 1), y1 = Math.min(h, y + r + 1);
    return I[y1 * W + x1] - I[y0 * W + x1] - I[y1 * W + x0] + I[y0 * W + x0];
  }
  /* باز کردن مورفولوژیک (فرسایش سپس انبساط) برای حذف راه‌های باریکِ نشتی */
  function open(mask, w, h, r) {
    const full = (2 * r + 1) * (2 * r + 1);
    let I = integral(mask, w, h);
    const er = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      // کنار تصویر را «پر» فرض می‌کنیم تا زمین چسبیده به لبه کوچک نشود
      const x0 = x - r, y0 = y - r, x1 = x + r, y1 = y + r;
      const inside = x0 >= 0 && y0 >= 0 && x1 < w && y1 < h;
      if (inside ? winCount(I, w, h, x, y, r) === full : winCount(I, w, h, x, y, r) === (Math.min(w - 1, x1) - Math.max(0, x0) + 1) * (Math.min(h - 1, y1) - Math.max(0, y0) + 1)) er[y * w + x] = 1;
    }
    I = integral(er, w, h);
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x] && winCount(I, w, h, x, y, r) > 0) out[y * w + x] = 1;
    return out;
  }

  function erode(mask, w, h, r) {
    const I = integral(mask, w, h), er = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r), x1 = Math.min(w - 1, x + r), y1 = Math.min(h - 1, y + r);
      if (winCount(I, w, h, x, y, r) === (x1 - x0 + 1) * (y1 - y0 + 1)) er[y * w + x] = 1; // بیرونِ تصویر «پر» فرض می‌شود
    }
    return er;
  }
  function dilate(mask, w, h, r) {
    const I = integral(mask, w, h), out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (winCount(I, w, h, x, y, r) > 0) out[y * w + x] = 1;
    return out;
  }

  function fillHoles(mask, w, h) {
    const seen = new Uint8Array(w * h), st = [];
    const push = (x, y) => { const i = y * w + x; if (!mask[i] && !seen[i]) { seen[i] = 1; st.push(i); } };
    for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
    for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
    while (st.length) {
      const i = st.pop(), x = i % w, y = (i / w) | 0;
      if (x > 0) push(x - 1, y); if (x < w - 1) push(x + 1, y); if (y > 0) push(x, y - 1); if (y < h - 1) push(x, y + 1);
    }
    const out = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) out[i] = (mask[i] || !seen[i]) ? 1 : 0;
    return out;
  }

  /* مولفه‌ی همبند شامل نقطه‌ی (sx,sy) */
  function component(mask, w, h, sx, sy) {
    const out = new Uint8Array(w * h), st = [sy * w + sx];
    if (!mask[sy * w + sx]) return null;
    out[sy * w + sx] = 1;
    while (st.length) {
      const i = st.pop(), x = i % w, y = (i / w) | 0;
      if (x > 0 && mask[i - 1] && !out[i - 1]) { out[i - 1] = 1; st.push(i - 1); }
      if (x < w - 1 && mask[i + 1] && !out[i + 1]) { out[i + 1] = 1; st.push(i + 1); }
      if (y > 0 && mask[i - w] && !out[i - w]) { out[i - w] = 1; st.push(i - w); }
      if (y < h - 1 && mask[i + w] && !out[i + w]) { out[i + w] = 1; st.push(i + w); }
    }
    return out;
  }

  /* ردیابی مرز بیرونی (Moore-neighbor) */
  const DX = [1, 1, 0, -1, -1, -1, 0, 1], DY = [0, 1, 1, 1, 0, -1, -1, -1];
  function trace(mask, w, h) {
    let sx = -1, sy = -1;
    outer: for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) { sx = x; sy = y; break outer; }
    if (sx < 0) return [];
    const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
    const pts = [[sx, sy]];
    let cx = sx, cy = sy, bdir = 4, firstX = null, firstY = null;
    for (let guard = 0; guard < w * h * 4; guard++) {
      let found = -1;
      for (let k = 1; k <= 8; k++) { const d = (bdir + k) % 8; if (inside(cx + DX[d], cy + DY[d])) { found = d; break; } }
      if (found < 0) break; // پیکسل تنها
      const bx = cx + DX[(found + 7) % 8], by = cy + DY[(found + 7) % 8];
      const nx = cx + DX[found], ny = cy + DY[found];
      if (firstX === null) { firstX = nx; firstY = ny; }
      else if (cx === sx && cy === sy && nx === firstX && ny === firstY) break;
      let nb = 0; for (let d = 0; d < 8; d++) if (DX[d] === bx - nx && DY[d] === by - ny) { nb = d; break; }
      cx = nx; cy = ny; bdir = nb;
      if (cx === sx && cy === sy) { if (pts.length > 1 && firstX !== null) { /* ادامه تا شرط Jacob */ } }
      else pts.push([cx, cy]);
    }
    return pts;
  }

  /* ساده‌سازی Douglas–Peucker برای حلقه‌ی بسته */
  function dp(pts, eps) {
    if (pts.length < 4) return pts.slice();
    const keep = new Uint8Array(pts.length);
    const dist = (p, a, b) => {
      const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
      if (l2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
      return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
    };
    let far = 0, fd = -1;
    for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]); if (d > fd) { fd = d; far = i; } }
    keep[0] = 1; keep[far] = 1;
    const rec = (a, b) => { // b می‌تواند pts.length باشد (بازگشت به نقطه‌ی ۰)
      let m = -1, md = eps;
      const A = pts[a], B = pts[b % pts.length];
      for (let i = a + 1; i < b; i++) { const d = dist(pts[i], A, B); if (d > md) { md = d; m = i; } }
      if (m >= 0) { keep[m] = 1; rec(a, m); rec(m, b); }
    };
    rec(0, far); rec(far, pts.length);
    return pts.filter((_, i) => keep[i]);
  }

  function segInt(a, b, c, d) {
    const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
    return (o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0) && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
  }
  function selfIntersects(r) {
    const n = r.length;
    for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segInt(r[i], r[(i + 1) % n], r[j], r[(j + 1) % n])) return true;
    }
    return false;
  }
  function simplify(pts, area) {
    let eps = Math.max(1.5, Math.sqrt(area) * 0.012), out = dp(pts, eps);
    for (let k = 0; k < 14 && (out.length > MAX_VERTS || selfIntersects(out)); k++) { eps *= 1.3; out = dp(pts, eps); }
    return out;
  }


  /* صف اولویت (هیپ دودویی) برای رشد ناحیه‌ی «ساحل‌به‌ساحل» */
  function Heap(cap) { this.k = new Float64Array(cap); this.v = new Int32Array(cap); this.n = 0; }
  Heap.prototype.push = function (key, val) {
    let i = this.n++; const k = this.k, v = this.v;
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
    k[i] = key; v[i] = val;
  };
  Heap.prototype.pop = function () {
    const k = this.k, v = this.v, top = v[0], key = k[--this.n], val = v[this.n];
    let i = 0;
    for (;;) { let c = 2 * i + 1; if (c >= this.n) break; if (c + 1 < this.n && k[c + 1] < k[c]) c++; if (k[c] >= key) break; k[i] = k[c]; v[i] = v[c]; i = c; }
    if (this.n > 0) { k[i] = key; v[i] = val; }
    return top;
  };

  function ringArea(r) { let s = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; s += p[0] * q[1] - q[0] * p[1]; } return Math.abs(s) / 2; }

  /**
   * @param {{data:Uint8ClampedArray|Uint8Array,width:number,height:number}} img تصویر RGBA
   * @param {{x:number,y:number}} seed نقطه‌ی مرکز زمین (پیکسل)
   */
  function prepare(img, seed) {
    const w = img.width, h = img.height, n = w * h;
    const sx = Math.max(0, Math.min(w - 1, Math.round(seed.x))), sy = Math.max(0, Math.min(h - 1, Math.round(seed.y)));
    const lab = toLab(img.data, n);
    const col = lab.map(c => boxBlur(c, w, h, 2));      // رنگ هموار
    const fine = lab.map(c => boxBlur(c, w, h, 1));     // برای لبه
    const grad = new Float32Array(n);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x; let s = 0;
      for (let c = 0; c < 3; c++) { const gx = fine[c][i + 1] - fine[c][i - 1], gy = fine[c][i + w] - fine[c][i - w]; s += gx * gx + gy * gy; }
      grad[i] = Math.sqrt(s);
    }
    // رنگ مرجع: میانگین پنجره‌ی ۹×۹ دور نقطه‌ی مرکز
    let m0 = 0, m1 = 0, m2 = 0, cnt = 0;
    for (let y = Math.max(0, sy - 4); y <= Math.min(h - 1, sy + 4); y++) for (let x = Math.max(0, sx - 4); x <= Math.min(w - 1, sx + 4); x++) { const i = y * w + x; m0 += col[0][i]; m1 += col[1][i]; m2 += col[2][i]; cnt++; }
    m0 /= cnt; m1 /= cnt; m2 /= cnt;

    function maskAt(level) {
      const { tol, g } = LEVELS[level], step = tol * 0.6, tol2 = tol * tol, step2 = step * step;
      const mask = new Uint8Array(n), st = new Int32Array(n); let sp = 0;
      const si = sy * w + sx; mask[si] = 1; st[sp++] = si;
      const L = col[0], A = col[1], B = col[2];
      while (sp) {
        const i = st[--sp], x = i % w, y = (i / w) | 0;
        for (let d = 0; d < 4; d++) {
          let q;
          if (d === 0) { if (x === 0) continue; q = i - 1; } else if (d === 1) { if (x === w - 1) continue; q = i + 1; }
          else if (d === 2) { if (y === 0) continue; q = i - w; } else { if (y === h - 1) continue; q = i + w; }
          if (mask[q] || grad[q] > g) continue;
          const dl = L[q] - m0, da = A[q] - m1, db = B[q] - m2;
          if (dl * dl + da * da + db * db > tol2) continue;
          const el = L[q] - L[i], ea = A[q] - A[i], eb = B[q] - B[i];
          if (el * el + ea * ea + eb * eb > step2) continue;
          mask[q] = 1; st[sp++] = q;
        }
      }
      // پاک‌سازی: باز کردن (حذف راه‌های باریک) و پرکردن حفره‌ها
      let m = mask;
      const op = open(mask, w, h, 2), comp = component(op, w, h, sx, sy);
      if (comp) m = comp;
      m = dilate(fillHoles(m, w, h), w, h, 2); // لبه‌ی محو (blur) کنار مرز را جبران می‌کند
      let area = 0, touches = false;
      for (let i = 0; i < n; i++) if (m[i]) area++;
      for (let x = 0; x < w && !touches; x++) if (m[x] || m[(h - 1) * w + x]) touches = true;
      for (let y = 0; y < h && !touches; y++) if (m[y * w] || m[y * w + w - 1]) touches = true;
      return { mask: m, area, touches };
    }

    function result(level, r) {
      if (r.area < MIN_AREA) return { level, ok: false, reason: 'small', areaPx: r.area, touchesEdge: r.touches, ring: [] };
      const raw = trace(r.mask, w, h);
      const ring = simplify(raw, r.area);
      return { level, ok: ring.length >= 3, areaPx: r.area, touchesEdge: r.touches, ring, ringAreaPx: ringArea(ring) };
    }


    /* ---- رشد با مساحت تخمینی: برای زمین‌هایی که رنگ‌شان با اطراف تقریباً یکی است ----
     * ناحیه از مرکز به‌سمت پیکسل‌هایی رشد می‌کند که «مانع» کمتری دارند (لبه + فاصله‌ی رنگ)،
     * پس مرز کمرنگ هم دیرتر از داخل زمین رد می‌شود؛ رشد با رسیدن به مساحت تخمینی متوقف می‌شود. */
    let ord = null, costMap = null;
    function floodOrder(maxK) {
      maxK = Math.min(n, Math.max(100, Math.round(maxK)));
      if (ord && (ord.len >= maxK || ord.full)) return ord;
      const order = new Int32Array(maxK), seen = new Uint8Array(n), heap = new Heap(n + 8);
      const si = sy * w + sx;
      if (!costMap) { // هزینه‌ی عبور از هر پیکسل = لبه + فاصله‌ی رنگ؛ کمی هموار تا جبهه‌ی رشد دندانه‌دار نشود
        const L = col[0], A = col[1], B = col[2], c0 = new Float32Array(n);
        for (let q = 0; q < n; q++) { const dl = L[q] - m0, da = A[q] - m1, db = B[q] - m2; c0[q] = grad[q] + 0.6 * Math.sqrt(dl * dl + da * da + db * db); }
        costMap = boxBlur(c0, w, h, 1);
      }
      const cost = (q) => costMap[q];
      let cnt = 0, seq = 0; seen[si] = 1; heap.push(0, si);
      const keyOf = new Float64Array(n);
      while (heap.n && cnt < maxK) {
        const i = heap.pop(), x = i % w, y = (i / w) | 0, ki = keyOf[i];
        order[cnt++] = i;
        for (let d = 0; d < 4; d++) {
          let q;
          if (d === 0) { if (x === 0) continue; q = i - 1; } else if (d === 1) { if (x === w - 1) continue; q = i + 1; }
          else if (d === 2) { if (y === 0) continue; q = i - w; } else { if (y === h - 1) continue; q = i + w; }
          if (seen[q]) continue; seen[q] = 1;
          const kq = Math.max(ki, cost(q)); keyOf[q] = kq;
          heap.push(kq + (++seq) * 1e-9, q); // ترتیب ورود برای شکستن تساوی (رشد گرد و یکنواخت)
        }
      }
      ord = { order, len: cnt, full: cnt < maxK };
      return ord;
    }
    function maskPrefix(k) {
      const o = floodOrder(k * 3 + 500), m = new Uint8Array(n), kk = Math.min(k, o.len);
      for (let i = 0; i < kk; i++) m[o.order[i]] = 1;
      // بسته کردن (closing) دندانه‌های جبهه‌ی رشد را صاف می‌کند؛ باز کردن اینجا نباید باشد چون گردنِ باریک به زمین کناری را می‌برد
      let mm = erode(dilate(m, w, h, 3), w, h, 3);
      mm = fillHoles(mm, w, h);
      const comp = component(mm, w, h, sx, sy); if (comp) mm = comp;
      mm = dilate(mm, w, h, 2);
      let area = 0, touches = false;
      for (let i = 0; i < n; i++) if (mm[i]) area++;
      for (let x = 0; x < w && !touches; x++) if (mm[x] || mm[(h - 1) * w + x]) touches = true;
      for (let y = 0; y < h && !touches; y++) if (mm[y * w] || mm[y * w + w - 1]) touches = true;
      return { mask: mm, area, touches };
    }

    const cache = {};
    const get = (level) => cache[level] || (cache[level] = maskAt(level));
    return {
      levels: LEVELS.length,
      /** نزدیک‌ترین مرز به مساحت تخمینی (پیکسل)؛ برای تصحیح اثر پاک‌سازی چند بار تنظیم می‌شود */
      byArea(targetPx) {
        targetPx = Math.max(MIN_AREA, targetPx);
        let k = targetPx / 1.04, r = maskPrefix(k);
        for (let it = 0; it < 6 && r.area > 0; it++) {
          const ratio = targetPx / r.area; if (Math.abs(ratio - 1) < 0.012) break;
          k = Math.min(n * 0.9, k * ratio); r = maskPrefix(k);
        }
        const out = result(-1, r); out.mode = 'area'; out.targetPx = targetPx; return out;
      },
      run(level) { level = Math.max(0, Math.min(LEVELS.length - 1, level)); return result(level, get(level)); },
      /** بهترین سطح: جایی که مساحت «پایدار» است (کمترین جهش به سطح بعدی) */
      auto() {
        const areas = [], touch = [];
        for (let i = 0; i < LEVELS.length; i++) { const r = get(i); areas.push(r.area); touch.push(r.touches); if (r.touches) break; }
        let best = -1, bestS = Infinity;
        for (let i = 0; i < areas.length; i++) {
          if (areas[i] < MIN_AREA || touch[i]) continue;
          const s = i + 1 < areas.length ? areas[i + 1] / areas[i] : Infinity;
          // پله‌ی آخرِ بدون لبه‌ی تصویر هم اگر بعدش جهشی نبود پایدار است
          if (s < bestS || (s === bestS)) { bestS = s; best = i; }
        }
        let out;
        if (best < 0) {
          // یا همه کوچک‌اند یا همه به لبه می‌رسند
          const anyTouch = touch.some(Boolean);
          const lvl = anyTouch ? Math.max(0, touch.findIndex(Boolean)) : LEVELS.length - 1;
          out = this.run(lvl); out.areas = areas; out.touchesEdge = out.touchesEdge || anyTouch;
          return out;
        }
        // در ناحیه‌ی پایدار، سطح بالاتر (ملایم‌تر) را بگیر تا لبه‌های هموار هم داخل شوند، به شرط عدم جهش
        if (best + 1 < areas.length && !touch[best + 1] && areas[best + 1] / areas[best] < 1.08) best++;
        out = this.run(best); out.areas = areas; out.stability = bestS;
        return out;
      },
    };
  }

  /* ---- تبدیل پیکسل کاشی ↔ مختصات جغرافیایی (وب‌مرکاتور، کاشی ۲۵۶) ---- */
  function worldPx(lng, lat, z) {
    const s = 256 * Math.pow(2, z), sn = Math.sin(lat * Math.PI / 180);
    return [(lng + 180) / 360 * s, (0.5 - Math.log((1 + sn) / (1 - sn)) / (4 * Math.PI)) * s];
  }
  function lngLat(X, Y, z) {
    const s = 256 * Math.pow(2, z), lng = X / s * 360 - 180, n = Math.PI - 2 * Math.PI * Y / s;
    return [lng, 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))];
  }

  return { prepare, worldPx, lngLat, LEVELS, ringArea };
});
