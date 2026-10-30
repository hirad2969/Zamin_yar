/* تشخیص خودکار مرز: کاربر مرکز زمین را روی نقشه‌ی ماهواره‌ای لمس می‌کند؛ مرز از روی تصویر پیشنهاد می‌شود و قابل ویرایش است */
(function () {
  'use strict';
  const App = window.App, el = App.el, M = App.map, LD = window.LandDetect;
  const AD = App.detect = { active: false, st: null };
  const ZOOMS = [18, 17, 16];       // اگر زمین از پنجره بزرگ‌تر بود، یک پله دورتر می‌رویم
  const WIN = 1024;                 // پنجره‌ی تحلیل (پیکسل)
  let busy = false;

  const bar = () => document.getElementById('detect-bar');
  const ll = (p) => [p[1], p[0]];
  function say(nodes) { const b = bar(); b.hidden = false; b.innerHTML = ''; [].concat(nodes).filter(Boolean).forEach(n => b.appendChild(typeof n === 'string' ? el('span', { text: n }) : n)); }
  function hideBar() { bar().hidden = true; bar().innerHTML = ''; }

  AD.start = function () {
    if (!window.LandDetect) { App.toast('ماژول تشخیص بارگذاری نشد.', 'err'); return; }
    const D = M.D;
    if (D.pts.length && !window.confirm('مرز فعلی پاک شود و تشخیص خودکار انجام شود؟')) return;
    M.clearBoundary();
    AD.active = true; AD.st = null;
    M.focus(true);
    M.map.getContainer().style.cursor = 'crosshair';
    if (M.layers && !M.map.hasLayer(M.layers.sat)) { Object.values(M.layers).forEach(l => M.map.hasLayer(l) && M.map.removeLayer(l)); M.layers.sat.addTo(M.map); }
    waiting();
    if (M.map.getZoom() < 16) App.toast('برای دقت بیشتر ابتدا روی زمین زوم کنید (حداقل در حدی که زمین دیده شود)، سپس مرکز آن را لمس کنید.', 'warn');
  };
  AD.hint = { text: '', unit: 'm2' };
  function hintInput() {
    const inp = el('input', { type: 'text', id: 'detect-area', inputmode: 'decimal', dir: 'ltr', placeholder: 'اختیاری', value: AD.hint.text, style: 'width:90px', oninput: (e) => { AD.hint.text = e.target.value; } });
    const sel = el('select', { id: 'detect-unit', style: 'width:auto', onchange: (e) => { AD.hint.unit = e.target.value; } }, [el('option', { value: 'm2', text: 'متر مربع' }), el('option', { value: 'ha', text: 'هکتار' })]);
    sel.value = AD.hint.unit;
    return el('label', { class: 'note', style: 'display:flex;gap:4px;align-items:center' }, ['متراژ تخمینی:', inp, sel]);
  }
  /** متراژ تخمینی واردشده (مترمربع) یا null */
  function hintM2() {
    const v = App.num(AD.hint.text);
    if (v == null || !isFinite(v) || v <= 0) return null;
    return AD.hint.unit === 'ha' ? v * 10000 : v;
  }
  function waiting(extra) {
    say([el('b', { text: '🎯 مرکز زمین را لمس کنید' }), hintInput(),
      el('span', { class: 'note', text: 'متراژ را می‌دانید؟ عدد را در کادر «متراژ تخمینی» بنویسید تا مرز با همان مساحت ساخته شود و روی خطوط کمرنگ هم بنشیند. متراژ را نمی‌دانید؟ کادر را خالی بگذارید و با GPS (دور زدن) یا ترسیم دستی اندازه بگیرید.' }),
      extra || null,
      el('button', { class: 'btn sm sec2', text: 'انصراف', onclick: () => AD.cancel() })]);
  }
  /** وقتی مرز روی عکس هیچ نشانه‌ای ندارد: راه‌حل دقیق‌تر، برش با متراژ مشخص است */
  function splitHint() {
    const has = M.D.pts.length >= 3;
    return el('span', { class: 'note' }, [
      has ? 'مرز کل زمین را دارید؟ ' : 'اگر مرز کل زمین را بکشید یا وارد کنید، ',
      el('button', { class: 'btn sm sec2', text: '✂️ تقسیم به دو قسمت با متراژ مشخص', disabled: has ? null : true, onclick: () => { AD.cancel(true); App.split.openCurrent(); } }),
      has ? ' خط جداکننده را دقیقاً سر متراژ درست می‌کشد.' : ' می‌توانید یک قسمت را با متراژ مشخص از آن جدا کنید.',
    ]);
  }
  AD.cancel = function (silent) {
    if (!AD.active && !busy) return;
    AD.active = false; busy = false; AD.st = null; hideBar();
    if (M.map) M.map.getContainer().style.cursor = '';
    if (!silent && !M.D.pts.length) M.focus(false);
  };

  App.on('init', function () {
    M.map.on('click', (e) => { if (AD.active && !busy) run(e.latlng); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && AD.active) AD.cancel(); });
  });

  function loadTile(z, x, y) {
    return new Promise((res) => {
      const im = new Image(); im.crossOrigin = 'anonymous';
      im.onload = () => res(im); im.onerror = () => res(null);
      im.src = M.SAT_URL.replace('{z}', z).replace('{y}', y).replace('{x}', x);
    });
  }
  const tick = () => new Promise(r => setTimeout(r, 30));

  /** تصویر WIN×WIN با مرکز نقطه‌ی لمس‌شده */
  async function grab(latlng, z) {
    const [X, Y] = LD.worldPx(latlng.lng, latlng.lat, z), x0 = X - WIN / 2, y0 = Y - WIN / 2;
    const tx0 = Math.floor(x0 / 256), ty0 = Math.floor(y0 / 256), tx1 = Math.floor((x0 + WIN - 1) / 256), ty1 = Math.floor((y0 + WIN - 1) / 256);
    const max = Math.pow(2, z), jobs = [];
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) jobs.push(loadTile(z, ((tx % max) + max) % max, ty).then(im => ({ im, tx, ty })));
    const tiles = await Promise.all(jobs);
    const miss = tiles.filter(t => !t.im).length;
    if (miss) throw new Error('tiles:' + miss + '/' + tiles.length);
    const cv = document.createElement('canvas'); cv.width = cv.height = WIN;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    tiles.forEach(t => cx.drawImage(t.im, Math.round(t.tx * 256 - x0), Math.round(t.ty * 256 - y0)));
    let img;
    try { img = cx.getImageData(0, 0, WIN, WIN); } catch (e) { throw new Error('cors'); }
    return { img, x0, y0 };
  }

  async function run(latlng) {
    busy = true;
    say([el('b', { text: '⏳ در حال تحلیل تصویر ماهواره‌ای…' })]);
    await tick();
    let last = null;
    try {
      const est = hintM2();
      const mpp = (z) => 156543.03392804097 * Math.cos(latlng.lat * Math.PI / 180) / Math.pow(2, z);
      // با متراژ تخمینی: دورترین زومی که زمین کمتر از ۳۰٪ پنجره را بگیرد؛ بدون آن: از زوم ۱۸
      let startZi = 0;
      if (est) { startZi = ZOOMS.findIndex(z => est / (mpp(z) * mpp(z)) <= 0.3 * WIN * WIN); if (startZi < 0) startZi = ZOOMS.length - 1; }
      for (let zi = startZi; zi < ZOOMS.length; zi++) {
        const z = ZOOMS[zi];
        const g = await grab(latlng, z); await tick();
        const det = LD.prepare(g.img, { x: WIN / 2, y: WIN / 2 });
        const targetPx = est ? est / (mpp(z) * mpp(z)) : null;
        let r = est ? det.byArea(targetPx) : det.autoStable();
        if (!est && !r.ok) r = det.auto();
        last = { z, g, det, r, est, targetPx, mpp: mpp(z) };
        if (r.ok && !r.touchesEdge) break;
        if (zi < ZOOMS.length - 1) { say([el('b', { text: '⏳ زمین بزرگ‌تر از پنجره است؛ با دید وسیع‌تر دوباره تحلیل می‌شود…' })]); await tick(); }
      }
    } catch (e) {
      busy = false;
      const msg = /cors/.test(e.message) ? 'سرویس نقشه اجازه‌ی خواندن تصویر برای تحلیل را نداد.' : /tiles/.test(e.message) ? 'کاشی‌های نقشه بارگذاری نشد (اینترنت یا سرویس نقشه در دسترس نیست). تشخیص خودکار نیازمند اینترنت است.' : 'خطا در تحلیل: ' + e.message;
      App.toast(msg, 'err'); waiting(splitHint()); return;
    }
    busy = false;
    const r = last.r;
    if (!r.ok) {
      App.toast(r.reason === 'small' ? 'ناحیه‌ی همرنگ اطراف این نقطه خیلی کوچک است. نقطه‌ی دیگری از داخل زمین را لمس کنید یا مرز را دستی بکشید.' : 'مرز مشخصی تشخیص داده نشد. اگر مرز روی عکس نشانه‌ای ندارد، مرز کل زمین را بکشید و با «تقسیم به دو قسمت با متراژ مشخص» قسمت موردنظر را جدا کنید.', 'warn');
      waiting(splitHint()); return;
    }
    AD.st = { latlng, z: last.z, g: last.g, det: last.det, level: r.level, est: last.est, targetPx: last.targetPx, mpp: last.mpp, mode: last.est ? 'area' : (last.r.mode === 'stable' ? 'stable' : 'level'), snap: true };
    apply(r, true);
    AD.active = false; M.map.getContainer().style.cursor = ''; hideBar();
    if (r.touchesEdge) App.toast('زمین از محدوده‌ی تحلیل بزرگ‌تر است؛ مرز کامل نیست. مرز را دستی کامل کنید.', 'warn');
    else App.toast('مرز پیشنهادی ساخته شد. با چشم بررسی کنید؛ نقطه‌ها را بکشید یا حساسیت را تغییر دهید.', 'ok');
  }

  function apply(r, fit) {
    const s = AD.st;
    s.last = r;
    const useRect = s.snap && r.rect && (r.rectOk || r.rectFill >= 0.88);          // زمین کشاورزی معمولاً مستطیلی است
    const pix = useRect ? r.rect : r.ring;
    const ring = pix.map(p => LD.lngLat(s.g.x0 + p[0] + 0.5, s.g.y0 + p[1] + 0.5, s.z));
    s.level = r.level;
    M.setBoundary(ring, { source: 'auto', meta: { method: (s.mode === 'area' ? 'تشخیص خودکار با متراژ تخمینی (جست‌وجو در مستطیل اطراف نقطه، لبه‌ی باریک)' : 'تشخیص خودکار از تصویر ماهواره‌ای (پایدارترین ناحیه)') + (useRect ? ' — مستطیل' : ''), zoom: s.z, level: r.level, estimateM2: s.est || null, note: 'تقریبی؛ باید با چشم بررسی شود' }, fit: false });
    if (fit) M.map.fitBounds(L.latLngBounds(ring.map(ll)), { maxZoom: 19, padding: [60, 60] });
  }

  /** دکمه‌های حساسیت در نوار ویرایش (فراخوانی از map.js) */
  AD.bar = function (b) {
    const s = AD.st; if (!s) return;
    if (s.mode === 'area') {
      b.appendChild(el('span', { class: 'note', text: 'تشخیص با متراژ تخمینی ' + App.area(s.est) }));
      b.appendChild(el('button', { class: 'btn sm sec2', text: '− ۱۰٪ کوچک‌تر', onclick: () => stepArea(1 / 1.1) }));
      b.appendChild(el('button', { class: 'btn sm sec2', text: '+ ۱۰٪ بزرگ‌تر', onclick: () => stepArea(1.1) }));
    } else if (s.mode === 'stable') {
      const cur = s.last && s.last.idx != null ? s.last.idx : 0, cnt = s.last && s.last.count || 1;
      b.appendChild(el('span', { class: 'note', text: 'تشخیص خودکار — ناحیه ' + App.n(cur + 1, 0) + ' از ' + App.n(cnt, 0) + ' (با متراژ تخمینی دقیق‌تر می‌شود)' }));
      b.appendChild(el('button', { class: 'btn sm sec2', text: '− ناحیه‌ی کوچک‌تر', disabled: cur <= 0 ? true : null, onclick: () => stepStable(cur - 1) }));
      b.appendChild(el('button', { class: 'btn sm sec2', text: '+ ناحیه‌ی بزرگ‌تر', disabled: cur >= cnt - 1 ? true : null, onclick: () => stepStable(cur + 1) }));
    } else {
      b.appendChild(el('span', { class: 'note', text: 'تشخیص خودکار — حساسیت ' + App.n(s.level + 1, 0) + ' از ' + App.n(s.det.levels, 0) }));
      b.appendChild(el('button', { class: 'btn sm sec2', text: '− کمتر (مرز تنگ‌تر)', disabled: s.level <= 0, onclick: () => step(-1) }));
      b.appendChild(el('button', { class: 'btn sm sec2', text: '+ بیشتر (مرز گشادتر)', disabled: s.level >= s.det.levels - 1, onclick: () => step(1) }));
    }
    if (s.last && s.last.rect && (s.last.rectOk || s.last.rectFill >= 0.88) || !s.snap) b.appendChild(el('button', { class: 'btn sm sec2', id: 'detect-rect', text: s.snap ? '✎ شکل آزاد' : '▭ مستطیل', onclick: () => { s.snap = !s.snap; apply(s.last, false); M.refreshBar && M.refreshBar(); } }));
    b.appendChild(el('button', { class: 'btn sm sec2', text: '🎯 نقطه‌ی دیگر', onclick: () => AD.start() }));
  };
  function stepStable(i) {
    const s = AD.st; if (!s) return;
    const r = s.det.autoStable(i);
    if (!r.ok) { App.toast('ناحیه‌ی دیگری پیدا نشد.', 'warn'); return; }
    apply(r, false);
  }
  function stepArea(f) {
    const s = AD.st; if (!s) return;
    s.est = s.est * f; s.targetPx = s.targetPx * f;
    const r = s.det.byArea(s.targetPx);
    if (!r.ok) { App.toast('در این اندازه ناحیه‌ی معتبری پیدا نشد.', 'warn'); s.est /= f; s.targetPx /= f; return; }
    s.snap = false;                       // تغییر دستیِ اندازه: شکل آزاد (برگشت به مستطیل با دکمه‌ی «▭ مستطیل»)
    apply(r, false);
    if (r.touchesEdge) App.toast('مرز به لبه‌ی محدوده‌ی تحلیل رسید؛ احتمالاً به زمین کناری نشت کرده.', 'warn');
  }
  function step(d) {
    const s = AD.st; if (!s) return;
    const r = s.det.run(s.level + d);
    if (!r.ok) { App.toast('در این حساسیت ناحیه‌ی معتبری پیدا نشد.', 'warn'); return; }
    apply(r, false);
    if (r.touchesEdge) App.toast('در این حساسیت مرز به لبه‌ی محدوده‌ی تحلیل رسید (احتمالاً به زمین کناری نشت کرده).', 'warn');
  }
})();
