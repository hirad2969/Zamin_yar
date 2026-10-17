/* اندازه‌گیری حضوری با GPS گوشی: «گوشه به گوشه» (میانگین‌گیری چند ثانیه‌ای) یا «مسیر خودکار» (دور زدن) */
(function () {
  'use strict';
  const App = window.App, C = App.C, el = App.el, M = App.map;
  const G = App.gps = { st: null };
  const panel = () => document.getElementById('gps-panel');
  let layer = null, meMark = null, meCircle = null, track = null, shape = null, vmarks = [], timer = null;

  const R = 6371008.8, rad = Math.PI / 180;
  function dist(a, b) { // هاورساین، متر؛ نقطه‌ها [lon,lat]
    const dLat = (b[1] - a[1]) * rad, dLon = (b[0] - a[0]) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  G.dist = dist;
  function perimeter(pts, closed) { let s = 0; for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1], pts[i]); if (closed && pts.length > 2) s += dist(pts[pts.length - 1], pts[0]); return s; }
  /** سادەسازی داگلاس-پویکر در صفحه‌ی محلی (متر) */
  function simplify(pts, tol) {
    if (pts.length < 4) return pts.slice();
    const lat0 = pts[0][1], lon0 = pts[0][0], kx = 111320 * Math.cos(lat0 * rad), ky = 110574;
    const P = pts.map(p => [(p[0] - lon0) * kx, (p[1] - lat0) * ky]);
    const keep = new Array(P.length).fill(false); keep[0] = keep[P.length - 1] = true;
    const stack = [[0, P.length - 1]];
    while (stack.length) {
      const [s, e] = stack.pop(); let md = 0, mi = -1;
      const A = P[s], B = P[e], dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy;
      for (let i = s + 1; i < e; i++) {
        const t = L2 ? Math.max(0, Math.min(1, ((P[i][0] - A[0]) * dx + (P[i][1] - A[1]) * dy) / L2)) : 0;
        const d = Math.hypot(P[i][0] - (A[0] + t * dx), P[i][1] - (A[1] + t * dy));
        if (d > md) { md = d; mi = i; }
      }
      if (md > tol && mi > 0) { keep[mi] = true; stack.push([s, mi], [mi, e]); }
    }
    return pts.filter((_, i) => keep[i]);
  }
  G.simplify = simplify;

  function initLayer() {
    if (layer) return;
    layer = L.featureGroup().addTo(M.map);
  }

  G.open = function () {
    if (!window.isSecureContext) {
      App.modal({ title: 'GPS نیازمند اتصال امن است', body: el('div', { class: 'note', html: 'مرورگرها GPS را فقط در صفحه‌های <b>HTTPS</b> (یا localhost / برنامه‌ی نصب‌شده‌ی اندروید) اجازه می‌دهند. برنامه را از نشانی https میزبانی کنید یا نسخه‌ی اندروید را نصب کنید.' }) });
      return;
    }
    if (!navigator.geolocation) { App.toast('این دستگاه یا مرورگر GPS را پشتیبانی نمی‌کند.', 'err'); return; }
    if (App.importer && document.getElementById('import-panel') && !document.getElementById('import-panel').hidden) App.importer.close();
    if (M.D.pts.length >= 3 && !window.confirm('مرز فعلی با مرز GPS جایگزین می‌شود (تا زمانی که پایان ندهید دست‌نخورده می‌ماند). ادامه؟')) return;
    initLayer();
    G.st = { mode: 'corner', pts: [], accs: [], pos: null, paused: false, running: false, sampling: null, maxAcc: 15, minDist: 4, sampleSec: 6, watchId: null, wake: null, err: null, fixes: 0 };
    render();
    start();
  };

  function start() {
    const st = G.st;
    st.watchId = navigator.geolocation.watchPosition(onFix, onErr, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
    try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(w => { st.wake = w; }).catch(() => {}); } catch (e) { /* اختیاری */ }
    timer = setInterval(tick, 250);
  }
  function stop(keepLayer) {
    const st = G.st; if (!st) return;
    if (st.watchId != null) navigator.geolocation.clearWatch(st.watchId);
    try { if (st.wake) st.wake.release(); } catch (e) { /* */ }
    clearInterval(timer); timer = null;
    if (!keepLayer && layer) { layer.clearLayers(); meMark = meCircle = track = shape = null; vmarks = []; }
    G.st = null; panel().hidden = true;
  }
  G.close = () => stop(false);

  function onErr(e) {
    const st = G.st; if (!st) return;
    st.err = e.code === 1 ? 'اجازه‌ی دسترسی به موقعیت داده نشد. در تنظیمات مرورگر/برنامه، «موقعیت مکانی» را فعال کنید.' :
      e.code === 2 ? 'موقعیت در دسترس نیست (GPS خاموش است یا سیگنال ضعیف است).' :
      e.code === 3 ? 'دریافت موقعیت زمان‌بر شد؛ به فضای باز بروید.' : 'خطای موقعیت: ' + e.message;
    update();
  }
  function onFix(p) {
    const st = G.st; if (!st) return;
    const c = p.coords;
    st.err = null; st.fixes++;
    st.pos = { lon: c.longitude, lat: c.latitude, acc: c.accuracy, t: p.timestamp || Date.now() };
    if (st.sampling) st.sampling.fixes.push(st.pos);
    if (st.mode === 'auto' && st.running && !st.paused && c.accuracy <= st.maxAcc) {
      const last = st.pts[st.pts.length - 1];
      const q = [c.longitude, c.latitude];
      if (!last || dist(last, q) >= Math.max(st.minDist, 0)) { st.pts.push(q); st.accs.push(c.accuracy); }
    }
    update();
  }
  function tick() {
    const st = G.st; if (!st || !st.sampling) return;
    const s = st.sampling, left = st.sampleSec - (Date.now() - s.t0) / 1000;
    if (left <= 0) finishSample(); else { const b = document.getElementById('gps-cnt'); if (b) b.textContent = 'در حال میانگین‌گیری… ' + App.n(Math.ceil(left), 0) + ' ثانیه (بی‌حرکت بایستید)'; }
  }
  function finishSample() {
    const st = G.st, s = st.sampling; st.sampling = null;
    const good = s.fixes.filter(f => f.acc <= st.maxAcc);
    if (!good.length) { App.toast('در این چند ثانیه موقعیتی با دقت کافی (بهتر از ±' + App.n(st.maxAcc, 0) + ' متر) دریافت نشد. چند ثانیه صبر کنید یا «حداکثر خطا» را بیشتر کنید.', 'warn'); update(); return; }
    let sw = 0, sx = 0, sy = 0;
    good.forEach(f => { const w = 1 / (f.acc * f.acc); sw += w; sx += w * f.lon; sy += w * f.lat; });
    const acc = Math.sqrt(1 / sw) ; // دقت ترکیبی تقریبی (با فرض استقلال؛ خوش‌بینانه)
    st.pts.push([sx / sw, sy / sw]); st.accs.push(Math.max(acc, Math.min.apply(null, good.map(f => f.acc)) / 2));
    App.toast('گوشه‌ی ' + App.n(st.pts.length, 0) + ' ثبت شد (از ' + App.n(good.length, 0) + ' نمونه).');
    update();
  }

  /* ---------------- رابط ---------------- */
  function render() {
    const p = panel(); p.hidden = false; p.innerHTML = '';
    const st = G.st;
    const modeSel = el('div', { class: 'choices c2' }, [
      el('div', { id: 'gps-m-corner', class: 'choice', text: 'گوشه به گوشه (دقیق‌تر)', onclick: () => setMode('corner') }),
      el('div', { id: 'gps-m-auto', class: 'choice', text: 'مسیر خودکار (دور زدن)', onclick: () => setMode('auto') }),
    ]);
    const numField = (label, key, step) => el('label', { class: 'f' }, [el('span', { text: label }), el('input', { type: 'text', dir: 'ltr', value: st[key], onchange: (e) => { const v = App.num(e.target.value); if (v > 0) st[key] = v; else e.target.value = st[key]; update(); } })]);
    p.appendChild(el('div', { class: 'row' }, [el('h3', { style: 'margin:0', class: 'grow', text: '📍 اندازه‌گیری با GPS' }), el('button', { class: 'btn sm sec2', text: 'بستن', onclick: () => { if (st.pts.length && !window.confirm('نقطه‌های ثبت‌شده از بین می‌رود. بسته شود؟')) return; G.close(); } })]));
    p.appendChild(el('div', { id: 'gps-stat', class: 'box info' }));
    p.appendChild(modeSel);
    p.appendChild(el('div', { id: 'gps-help', class: 'note', style: 'margin:6px 0' }));
    p.appendChild(el('div', { id: 'gps-actions', class: 'row', style: 'margin:8px 0' }));
    p.appendChild(el('div', { id: 'gps-cnt', class: 'note' }));
    p.appendChild(el('div', { id: 'gps-live', class: 'box ok' }));
    p.appendChild(el('details', null, [el('summary', { text: 'تنظیمات دقت' }),
      numField('حداکثر خطای مجاز GPS (متر) — نقطه‌های بدتر ثبت نمی‌شوند', 'maxAcc'),
      numField('مسیر خودکار: حداقل فاصله‌ی ثبت نقطه (متر)', 'minDist'),
      numField('گوشه به گوشه: مدت میانگین‌گیری (ثانیه)', 'sampleSec')]));
    p.appendChild(el('div', { class: 'note', style: 'margin-top:6px', text: 'دقت GPS گوشی معمولاً ۳ تا ۱۰ متر در فضای باز است؛ برای زمین‌های کوچک خطای مساحت قابل‌توجه می‌شود. زیر درخت یا کنار ساختمان بلند دقت بدتر می‌شود. نتیجه را روی نقشه بررسی و در صورت نیاز اصلاح کنید.' }));
    setMode(st.mode, true);
  }
  function setMode(m, init) {
    const st = G.st; if (!st) return;
    if (!init && st.pts.length && st.mode !== m && !window.confirm('با تغییر روش، نقطه‌های ثبت‌شده پاک می‌شود. ادامه؟')) return;
    if (st.mode !== m) { st.pts = []; st.accs = []; }
    st.mode = m; st.running = false; st.paused = false;
    document.getElementById('gps-m-corner').classList.toggle('on', m === 'corner');
    document.getElementById('gps-m-auto').classList.toggle('on', m === 'auto');
    document.getElementById('gps-help').textContent = m === 'corner'
      ? 'کنار هر گوشه‌ی زمین بایستید، منتظر بمانید دقت سبز شود و «ثبت گوشه» را بزنید. برنامه چند ثانیه موقعیت را میانگین می‌گیرد تا خطا کم شود. گوشه‌ها را به ترتیب (پشت‌سرهم دور زمین) ثبت کنید.'
      : '«شروع» را بزنید و آرام دور زمین راه بروید (نزدیک مرز). برنامه نقطه‌ها را خودکار ثبت می‌کند و در پایان مسیر را ساده می‌کند.';
    update();
  }
  function btn(txt, cls, fn, dis) { return el('button', { class: 'btn ' + (cls || ''), text: txt, disabled: dis ? true : null, onclick: fn }); }
  function update() {
    const st = G.st; if (!st || !panel() || panel().hidden) return;
    const stat = document.getElementById('gps-stat'); if (!stat) return;
    const pos = st.pos;
    if (st.err) { stat.className = 'box err'; stat.textContent = st.err; }
    else if (!pos) { stat.className = 'box warn'; stat.textContent = 'در انتظار اولین موقعیت GPS… (اگر پیام اجازه آمد «اجازه دادن» را بزنید)'; }
    else {
      const a = pos.acc, good = a <= 5, ok = a <= st.maxAcc;
      stat.className = 'box ' + (good ? 'ok' : ok ? 'warn' : 'err');
      stat.innerHTML = 'دقت فعلی: <b>±' + App.n(a, 1) + ' متر</b> — ' + (good ? 'عالی' : ok ? 'قابل‌قبول' : 'ضعیف (بیشتر از حد مجاز؛ ثبت نمی‌شود)') + '<br><span class="note">' + App.n(pos.lat, 6) + '، ' + App.n(pos.lon, 6) + '</span>';
      drawMe(pos);
    }
    const act = document.getElementById('gps-actions'); act.innerHTML = '';
    const canFix = !!pos && pos.acc <= st.maxAcc;
    if (st.mode === 'corner') {
      act.appendChild(btn(st.sampling ? 'در حال ثبت…' : '＋ ثبت گوشه', '', () => { st.sampling = { fixes: pos && Date.now() - pos.t < 2500 ? [pos] : [], t0: Date.now() }; update(); }, !pos || !!st.sampling));
    } else if (!st.running) act.appendChild(btn('▶ شروع مسیر', '', () => { st.running = true; st.paused = false; update(); }, !pos));
    else {
      act.appendChild(btn(st.paused ? '▶ ادامه' : '⏸ توقف موقت', 'sec2', () => { st.paused = !st.paused; update(); }));
    }
    act.appendChild(btn('↶ حذف آخرین نقطه', 'sec2 sm', () => { st.pts.pop(); st.accs.pop(); update(); }, !st.pts.length));
    act.appendChild(btn('✔ پایان و ساخت مرز', '', finish, st.pts.length < 3));
    act.appendChild(btn('پاک‌کردن همه', 'dng sm', () => { st.pts = []; st.accs = []; update(); }, !st.pts.length));
    const cnt = document.getElementById('gps-cnt');
    if (cnt && !st.sampling) cnt.textContent = st.mode === 'auto' && st.running ? (st.paused ? 'متوقف شد' : 'در حال ثبت مسیر… ' + (canFix ? '' : '(دقت کافی نیست؛ نقطه ثبت نمی‌شود)')) : '';
    const live = document.getElementById('gps-live');
    const n = st.pts.length;
    const meanAcc = n ? st.accs.reduce((s, x) => s + x, 0) / n : 0;
    let h = 'نقطه‌ها: <b>' + App.n(n, 0) + '</b>';
    if (n >= 2) h += ' — طول مسیر: <b>' + App.n(perimeter(st.pts, false), 1) + ' م</b>';
    if (n >= 3) {
      const a = C.areaM2(st.pts), per = perimeter(st.pts, true);
      h += '<br>مساحت (در صورت بستن): <b>' + App.area(a) + '</b> — محیط: ' + App.n(per, 1) + ' م<br><span class="note">میانگین دقت نقطه‌ها ±' + App.n(meanAcc, 1) + ' م؛ خطای تقریبی مساحت حدود ±' + App.n(per * meanAcc / 2, 0) + ' مترمربع (برآورد تقریبی)</span>';
    }
    live.innerHTML = h;
    drawShape();
  }
  function drawMe(pos) {
    const ll = [pos.lat, pos.lon];
    if (!meMark) {
      meCircle = L.circle(ll, { radius: pos.acc, color: '#1976d2', weight: 1, fillOpacity: 0.12, interactive: false }).addTo(layer);
      meMark = L.circleMarker(ll, { radius: 7, color: '#fff', weight: 3, fillColor: '#1976d2', fillOpacity: 1, interactive: false }).addTo(layer);
      M.map.setView(ll, Math.max(M.map.getZoom(), 18));
    } else { meCircle.setLatLng(ll).setRadius(pos.acc); meMark.setLatLng(ll); }
  }
  function drawShape() {
    const st = G.st; if (!st || !layer) return;
    if (shape) { shape.remove(); shape = null; }
    vmarks.forEach(m => m.remove()); vmarks = [];
    const ll = st.pts.map(p => [p[1], p[0]]);
    if (ll.length >= 3) shape = L.polygon(ll, { color: '#e65100', weight: 3, fillOpacity: 0.12, interactive: false }).addTo(layer);
    else if (ll.length) shape = L.polyline(ll, { color: '#e65100', weight: 3, interactive: false }).addTo(layer);
    if (st.mode === 'corner') ll.forEach((q, i) => vmarks.push(L.circleMarker(q, { radius: 6, color: '#e65100', fillColor: '#fff', fillOpacity: 1, weight: 3, interactive: false }).bindTooltip(String(i + 1), { permanent: true, direction: 'top', className: 'fa', offset: [0, -4] }).addTo(layer)));
  }

  function finish() {
    const st = G.st; if (!st) return;
    let ring = st.pts.map(p => [p[0], p[1]]);
    const raw = ring.length;
    if (st.mode === 'auto') ring = simplify(C.openRing(ring), Math.max(1, Math.min(3, st.minDist / 3)));
    const v = C.validateRing(ring);
    if (!v.valid) { App.modal({ title: 'مرز GPS معتبر نیست', body: el('div', null, [el('ul', null, v.errors.map(e => el('li', { text: e }))), el('div', { class: 'note', text: 'معمولاً به‌خاطر خطای GPS یا دورزدن نادرست است. نقطه‌های اشتباه را با «حذف آخرین نقطه» پاک و ادامه دهید، یا دوباره اندازه‌گیری کنید.' })]) }); return; }
    const meta = { method: 'gps-' + st.mode, points: v.count, rawPoints: raw, meanAccuracy: +(st.accs.reduce((s, x) => s + x, 0) / st.accs.length).toFixed(2), maxAccuracy: +Math.max.apply(null, st.accs).toFixed(2), at: new Date().toISOString() };
    stop(false);
    M.setBoundary(v.ring, { source: 'gps', meta });
    App.toast('مرز GPS با ' + App.n(v.count, 0) + ' نقطه ثبت شد؛ مساحت ' + App.area(v.area) + '. می‌توانید نقاط را روی نقشه اصلاح کنید.');
  }
  G._finish = finish;
})();
