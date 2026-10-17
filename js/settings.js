/* تنظیمات موتور ارزش‌گذاری: روش، قیمت‌ها، ضرایب، امتیازها، تاریخچه‌ی نسخه‌ها */
(function () {
  'use strict';
  const App = window.App, C = App.C, el = App.el;
  const root = () => document.getElementById('settings-root');
  let draft = null, gtab = 'rural_outside', baseJson = '';

  const norm = (s) => { const c = C.clone(s); delete c.updatedAt; delete c.version; return JSON.stringify(c); };
  function reset() { draft = C.clone(App.S.settings); baseJson = norm(draft); }

  function numInput(obj, key, ph) {
    const v = obj[key];
    return el('input', { type: 'text', dir: 'ltr', value: v == null ? '' : v, placeholder: ph || '', oninput: (e) => { const x = App.num(e.target.value); obj[key] = x == null || !isFinite(x) ? null : x; } });
  }
  function keysFor(scope) {
    if (scope === 'urban') { const o = []; Object.keys(C.URBAN_USES).forEach(u => ['normal', 'special'].forEach(s => o.push(u + '_' + s))); return o; }
    const o = []; ['grade1', 'grade2', 'grade3'].forEach(g => ['special', 'normal'].forEach(s => o.push(g + '_' + s))); return o;
  }
  const labelOf = (k) => { const [a, b] = k.split('_'); return (C.GRADES[a] || C.URBAN_USES[a]) + ' ' + (b === 'special' ? 'ویژه' : 'معمولی'); };

  function pricesTable(scope) {
    const g = draft.groups[scope];
    g.cells = g.cells || {}; g.byType = g.byType || {}; g.byType.irrigated = g.byType.irrigated || {}; g.byType.dry = g.byType.dry || {};
    const head = ['ردیف', 'قیمت ثابت', 'حداقل', 'حداکثر', 'آبی: ثابت', 'آبی: حداقل', 'آبی: حداکثر', 'دیم: ثابت', 'دیم: حداقل', 'دیم: حداکثر'];
    const rows = keysFor(scope).map(k => {
      g.cells[k] = g.cells[k] || { fixed: null, min: null, max: null };
      g.byType.irrigated[k] = g.byType.irrigated[k] || {}; g.byType.dry[k] = g.byType.dry[k] || {};
      const td = (o, f) => el('td', null, numInput(o, f));
      return el('tr', null, [el('td', { class: 'l', text: labelOf(k) }), td(g.cells[k], 'fixed'), td(g.cells[k], 'min'), td(g.cells[k], 'max'),
        td(g.byType.irrigated[k], 'fixed'), td(g.byType.irrigated[k], 'min'), td(g.byType.irrigated[k], 'max'),
        td(g.byType.dry[k], 'fixed'), td(g.byType.dry[k], 'min'), td(g.byType.dry[k], 'max')]);
    });
    return el('div', { class: 'scroll' }, el('table', { class: 't' }, [el('thead', null, el('tr', null, head.map(h => el('th', { text: h })))), el('tbody', null, rows)]));
  }

  function groupPanel() {
    const g = draft.groups[gtab];
    const kids = [];
    kids.push(el('div', { class: 'card' }, [
      el('div', { class: 'row' }, [
        el('label', { class: 'f grow' }, [el('span', { text: 'روش محاسبه‌ی قیمت' }), (() => { const s = el('select', null, App.opts(C.METHODS, g.method)); s.value = g.method; s.addEventListener('change', () => { g.method = s.value; render(); }); return s; })()]),
        el('label', { style: 'display:flex;gap:6px;align-items:center' }, [el('input', { type: 'checkbox', checked: g.specialEnabled ? true : null, onchange: (e) => { g.specialEnabled = e.target.checked; } }), 'وضعیت «ویژه» فعال باشد']),
      ]),
      el('div', { class: 'note', html: ({
        fixed: '<b>قیمت ثابت:</b> قیمت همان ردیف (ستون «قیمت ثابت») اعمال می‌شود و امتیاز ویژگی‌ها پنهانی روی آن اثری ندارد.',
        range: '<b>حداقل/حداکثر:</b> بازه‌ی هر ردیف را تعریف می‌کنید و قیمت نهایی را هنگام ثبت زمین خودتان در بازه انتخاب می‌کنید (خارج از بازه هشدار می‌گیرید).',
        score: '<b>بر اساس امتیاز:</b> سیستم قیمت پیشنهادی را از حداقل تا حداکثر ردیف، متناسب با امتیاز ویژگی‌های زمین (بخش «امتیازها») پیشنهاد می‌دهد؛ فرمول در کارت خلاصه نمایش داده می‌شود و قیمت نهایی همیشه قابل ویرایش است.'
      })[g.method] }),
    ]));
    if (gtab === 'rural_inside') {
      kids.push(el('div', { class: 'card' }, [
        el('h3', { text: 'قیمت پایه و ضرایب رده‌ها (روستا)' }),
        el('div', { class: 'note', text: 'اگر برای یک ردیف قیمت ثابت ننوشته باشید، قیمت = قیمت پایه × ضریب درجه. ضرایب نمونه‌اند و قابل تغییرند.' }),
        el('div', { class: 'row' }, [
          el('label', { class: 'f' }, [el('span', { text: 'قیمت پایه‌ی هر مترمربع (تومان)' }), numInput(g, 'basePrice')]),
          ...['grade1', 'grade2', 'grade3'].map(k => el('label', { class: 'f' }, [el('span', { text: 'ضریب ' + C.GRADES[k] }), numInput(g.coefficients, k)])),
        ]),
        el('h3', { text: 'قاعده‌های رده‌بندی اولیه (به ترتیب بررسی؛ اولین تطابق برنده است)' }),
        rulesTable(g),
        el('div', { class: 'note', text: 'اگر ترکیب مشخصاتِ یک زمین با هیچ قاعده‌ای نخواند، سیستم رده را اجباراً تعیین نمی‌کند و «نیازمند تعیین دستی» نشان می‌دهد. مسکونی «نامشخص» هرگز مسکونی فرض نمی‌شود.' }),
      ]));
    }
    kids.push(el('div', { class: 'card' }, [el('h3', { text: 'جدول قیمت‌ها (تومان بر مترمربع)' }),
      el('div', { class: 'note', text: gtab === 'urban' ? 'برای کاربری‌های شهری قیمتی پیش‌فرض تعریف نشده است؛ خودتان وارد کنید یا هنگام ثبت قیمت دستی بدهید.' : 'ستون‌های «آبی» و «دیم» اختیاری‌اند؛ اگر خالی باشند از قیمت پایه‌ی همان ردیف استفاده می‌شود.' }),
      pricesTable(gtab)]));
    return el('div', null, kids);
  }

  function rulesTable(g) {
    const ANY = { any: 'هر وضعیت' };
    const body = el('tbody');
    const draw = () => {
      body.innerHTML = '';
      g.rules.forEach((r, i) => {
        const mk = (map, f) => { const s = el('select', null, App.opts(map, r[f])); s.value = r[f]; s.addEventListener('change', () => { r[f] = s.value; }); return s; };
        body.appendChild(el('tr', null, [
          el('td', { text: App.n(i + 1, 0) }),
          el('td', null, mk(Object.assign({}, ANY, C.RES), 'res')), el('td', null, mk(Object.assign({}, ANY, C.AGRI), 'agri')), el('td', null, mk(C.GRADES, 'grade')),
          el('td', null, el('div', { class: 'row' }, [
            el('button', { class: 'btn sm sec2', text: '↑', onclick: () => { if (i > 0) { g.rules.splice(i - 1, 0, g.rules.splice(i, 1)[0]); draw(); } } }),
            el('button', { class: 'btn sm sec2', text: '↓', onclick: () => { if (i < g.rules.length - 1) { g.rules.splice(i + 1, 0, g.rules.splice(i, 1)[0]); draw(); } } }),
            el('button', { class: 'btn sm dng', text: 'حذف', onclick: () => { g.rules.splice(i, 1); draw(); } }),
          ])),
        ]));
      });
    };
    draw();
    return el('div', { class: 'scroll' }, [el('table', { class: 't' }, [el('thead', null, el('tr', null, ['#', 'قابلیت مسکونی', 'کشاورزی', 'رده'].concat(['']).map(h => el('th', { text: h })))), body]),
      el('button', { class: 'btn sm sec2', style: 'margin-top:6px', text: 'افزودن قاعده', onclick: () => { g.rules.push({ res: 'confirmed', agri: 'any', grade: 'grade3' }); draw(); } })]);
  }

  function scoringPanel() {
    const sc = draft.scoring;
    const rows = sc.features.map(f => el('tr', null, [
      el('td', { class: 'l', text: f.label }), el('td', null, numInput(f, 'points')),
      el('td', null, el('input', { type: 'checkbox', checked: sc.coveredBySpecial.includes(f.key) ? true : null, onchange: (e) => { sc.coveredBySpecial = sc.coveredBySpecial.filter(k => k !== f.key); if (e.target.checked) sc.coveredBySpecial.push(f.key); } })),
    ]));
    return el('div', { class: 'card' }, [
      el('h3', { text: 'امتیازها (برای روش «بر اساس امتیاز» و پیشنهاد وضعیت ویژه)' }),
      el('div', { class: 'note', text: 'ستون «در ویژه لحاظ می‌شود»: اگر زمین «ویژه» باشد، این ویژگی دیگر امتیاز مستقل نمی‌گیرد تا دوبار محاسبه نشود.' }),
      el('div', { class: 'scroll' }, el('table', { class: 't' }, [el('thead', null, el('tr', null, ['ویژگی', 'امتیاز', 'در ویژه لحاظ می‌شود'].map(h => el('th', { text: h })))), el('tbody', null, rows)])),
      el('div', { class: 'row' }, [
        el('label', { class: 'f' }, [el('span', { text: 'آستانه‌ی «پیشنهاد» وضعیت ویژه (مجموع امتیاز)' }), numInput(sc, 'specialSuggestThreshold')]),
        el('label', { class: 'f' }, [el('span', { text: 'گردکردن قیمت به مضرب (تومان)' }), numInput(draft, 'roundTo')]),
      ]),
    ]);
  }

  function validate() {
    const errs = [];
    Object.keys(draft.groups).forEach(gk => {
      const g = draft.groups[gk];
      const chk = (o, label) => {
        ['fixed', 'min', 'max'].forEach(f => { if (o && o[f] != null && o[f] < 0) errs.push(C.SCOPES[gk] + ' — ' + label + ': مقدار منفی مجاز نیست'); });
        if (o && o.min != null && o.max != null && o.min > o.max) errs.push(C.SCOPES[gk] + ' — ' + label + ': حداقل از حداکثر بیشتر است');
      };
      Object.keys(g.cells || {}).forEach(k => { chk(g.cells[k], labelOf(k)); ['irrigated', 'dry'].forEach(t => chk((g.byType[t] || {})[k], labelOf(k) + ' (' + (t === 'dry' ? 'دیم' : 'آبی') + ')')); });
    });
    if (!(draft.roundTo > 0)) draft.roundTo = 1;
    return errs;
  }

  function save() {
    const errs = validate();
    if (errs.length) { App.modal({ title: 'خطا در تنظیمات', body: el('ul', null, errs.slice(0, 12).map(e => el('li', { text: e }))) }); return; }
    if (norm(draft) === baseJson) { App.toast('تغییری برای ذخیره وجود ندارد.'); return; }
    const n = App.S.parcels.length;
    let policy = 'keep';
    const reason = el('input', { type: 'text', placeholder: 'علت تغییر (اختیاری)' });
    const mk = (v, t, d) => el('label', { style: 'display:block;margin:6px 0;padding:8px;border:1px solid var(--line);border-radius:8px' }, [el('input', { type: 'radio', name: 'pol', checked: v === 'keep' ? true : null, onchange: () => { policy = v; } }), ' ', el('b', { text: t }), el('div', { class: 'note', text: d })]);
    App.modal({
      title: 'ثبت نسخه‌ی جدید تنظیمات', body: el('div', null, [
        el('p', { html: 'در حال حاضر <b>' + App.n(n, 0) + '</b> زمین ثبت شده است. با قیمت‌های زمین‌های ثبت‌شده چه شود؟' }),
        mk('keep', 'حفظ قیمت‌های ثبت‌شده (پیشنهادی)', 'فقط زمین‌ها و سناریوهای جدید از قیمت‌های تازه استفاده می‌کنند.'),
        mk('recalc', 'محاسبه‌ی مجدد همه‌ی زمین‌ها با قیمت‌های جدید', 'قیمت زمین‌های ثبت‌شده عوض می‌شود (تغییر در تاریخچه‌ی هر زمین ثبت می‌گردد). سناریوهای قدیمی نسخه‌ی قبلی را نگه می‌دارند.'),
        el('label', { class: 'f' }, [el('span', { text: 'علت' }), reason]),
      ]),
      buttons: [{ label: 'ثبت', onClick: () => { const r = C.updateSettings(App.S, draft, policy, null, reason.value || 'تغییر تنظیمات'); App.save(); App.emit('state'); reset(); render(); App.toast('نسخه‌ی ' + App.n(r.version, 0) + ' ثبت شد' + (policy === 'recalc' ? ' — ' + App.n(r.changed, 0) + ' زمین تغییر قیمت داد.' : '؛ قیمت زمین‌های ثبت‌شده حفظ شد.')); } }, { label: 'انصراف', cls: 'sec2' }],
    });
  }

  function render() {
    if (!draft) reset();
    const r = root(); r.innerHTML = '';
    r.appendChild(el('h2', { text: 'تنظیمات موتور ارزش‌گذاری' }));
    r.appendChild(el('div', { class: 'box warn', text: draft.note || '' }));
    r.appendChild(el('div', { class: 'tabs2' }, Object.keys(C.SCOPES).map(k => el('button', { class: gtab === k ? 'on' : '', text: C.SCOPES[k], onclick: () => { gtab = k; render(); } })).concat([el('button', { class: gtab === 'scoring' ? 'on' : '', text: 'امتیازها', onclick: () => { gtab = 'scoring'; render(); } }), el('button', { class: gtab === 'history' ? 'on' : '', text: 'تاریخچه‌ی نسخه‌ها', onclick: () => { gtab = 'history'; render(); } })])));
    if (gtab === 'scoring') r.appendChild(scoringPanel());
    else if (gtab === 'history') r.appendChild(historyPanel());
    else r.appendChild(groupPanel());
    r.appendChild(el('div', { class: 'row', style: 'margin:12px 0' }, [
      el('button', { class: 'btn', text: '💾 ذخیره‌ی تنظیمات (نسخه‌ی جدید)', onclick: save }),
      el('button', { class: 'btn sec2', text: 'لغو تغییرات ذخیره‌نشده', onclick: () => { reset(); render(); } }),
      el('span', { class: 'note', text: 'نسخه‌ی فعلی: ' + App.n(App.S.settings.version, 0) }),
    ]));
  }
  function historyPanel() {
    const h = App.S.settingsHistory.slice().reverse();
    return el('div', { class: 'card' }, [el('table', { class: 't' }, [el('thead', null, el('tr', null, ['نسخه', 'زمان', 'علت', 'رفتار قیمت زمین‌ها', ''].map(x => el('th', { text: x })))),
      el('tbody', null, h.map(x => el('tr', null, [el('td', { text: App.n(x.version, 0) }), el('td', { text: App.fmtDate(x.at) }), el('td', { class: 'l', text: x.reason || '' }), el('td', { text: x.policy === 'recalc' ? 'محاسبه‌ی مجدد' : (x.policy === 'keep' ? 'حفظ' : '—') }),
        el('td', null, x.version === App.S.settings.version ? el('span', { class: 'mut', text: 'فعلی' }) : el('button', { class: 'btn sm sec2', text: 'بارگذاری در ویرایشگر', onclick: () => { draft = C.clone(x.settings); gtab = 'rural_outside'; render(); App.toast('مقادیر این نسخه بارگذاری شد؛ برای اعمال، «ذخیره» را بزنید.'); } }))])))])]);
  }
  App.on('tab', (t) => { if (t === 'settings') { reset(); render(); } });
  App.on('state', () => { reset(); if (App.curTab === 'settings') render(); });
})();
