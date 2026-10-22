/* پرونده‌های زنده: چند فهرست مستقل از زمین‌ها، بخش‌بندی با وزن، واگذاری، معامله‌ی جانبی،
   کسری هر نفر به تومان و فهرست نهایی زیر نام هر شخص.
   هیچ عددی ذخیره نمی‌شود؛ همه‌چیز در هر نمایش از قیمت‌ها و مساحت‌های فعلی دوباره حساب می‌شود. */
(function () {
  'use strict';
  const App = window.App, C = App.C, el = App.el, fa = App.fa;
  let curId = null, curTab = 'setup';
  const TABS = { setup: '۱) زمین‌ها و اشخاص', sections: '۲) بخش‌ها و سهم‌ها', alloc: '۳) واگذاری زمین‌ها', deals: '۴) معامله‌های جانبی', result: '۵) نتیجه و لیست نهایی' };

  const toman = (x) => App.n(Math.round(x), 0);
  const pName = (id) => { const p = App.S.persons.find(x => x.id === id); return p ? p.name : '؟'; };
  const parcelOf = (id) => App.S.parcels.find(p => p.id === id);
  function evalSafe(sc) { try { return C.evaluateScenario(App.S, sc); } catch (e) { console.error(e); return null; } }

  /* ---------- فهرست انتخاب زمین‌ها با جست‌وجو ---------- */
  function pickList(list, selected, onChange, label) {
    const sel = new Set(selected);
    const q = el('input', { type: 'search', placeholder: 'جست‌وجو در نام و توضیحات (مثلاً «دره گرمی»)' });
    const scopeSel = el('select', null, [el('option', { value: '', text: 'همه‌ی محدوده‌ها' })].concat(Object.keys(C.SCOPES).map(k => el('option', { value: k, text: C.SCOPES[k] }))));
    const count = el('span', { class: 'note' });
    const rows = list.map(p => {
      const cb = el('input', { type: 'checkbox' }); cb.checked = sel.has(p.id);
      const v = p.valuation || {};
      const row = el('label', { style: 'display:flex;gap:8px;align-items:center;padding:4px 6px;border-bottom:1px dotted var(--line);cursor:pointer' }, [
        cb, el('span', { class: 'grow', style: 'flex:1' }, [el('b', { text: p.name || '—' }), p.notes ? el('span', { class: 'note', text: ' — ' + String(p.notes).slice(0, 60) }) : null, label ? el('span', { class: 'note', text: label(p) }) : null]),
        el('span', { class: 'note', text: App.n(v.area, 0) + ' م² · ' + toman(v.total || 0) }),
      ]);
      cb.addEventListener('change', () => { if (cb.checked) sel.add(p.id); else sel.delete(p.id); upd(); onChange(Array.from(sel)); });
      row._p = p; row._cb = cb; return row;
    });
    const visible = () => rows.filter(r => r.style.display !== 'none');
    function apply() {
      const t = C.normDigits(q.value).trim().toLowerCase(), sc = scopeSel.value;
      rows.forEach(r => { const p = r._p; const hay = ((p.name || '') + ' ' + (p.notes || '')).toLowerCase(); r.style.display = (!t || hay.indexOf(t) >= 0) && (!sc || p.scope === sc) ? '' : 'none'; });
      upd();
    }
    function upd() { count.textContent = App.n(sel.size, 0) + ' انتخاب‌شده از ' + App.n(list.length, 0) + ' — ' + App.n(visible().length, 0) + ' نمایش داده می‌شود'; }
    q.addEventListener('input', apply); scopeSel.addEventListener('change', apply);
    const setVis = (on) => { visible().forEach(r => { r._cb.checked = on; if (on) sel.add(r._p.id); else sel.delete(r._p.id); }); upd(); onChange(Array.from(sel)); };
    upd();
    return el('div', null, [
      el('div', { class: 'row' }, [el('div', { class: 'grow' }, q), el('div', { style: 'width:150px' }, scopeSel)]),
      el('div', { class: 'row', style: 'margin:6px 0' }, [
        el('button', { class: 'btn sm sec2', text: 'انتخاب همه‌ی نمایش‌داده‌شده‌ها', onclick: () => setVis(true) }),
        el('button', { class: 'btn sm sec2', text: 'برداشتن همه‌ی نمایش‌داده‌شده‌ها', onclick: () => setVis(false) }), count]),
      el('div', { class: 'scroll', style: 'max-height:320px;border:1px solid var(--line);border-radius:8px;background:#fff' }, rows),
    ]);
  }


  /* ---------- «حساب هر نفر»: حق + تعدیل (+/−) − زمین‌های انتخاب‌شده = مانده‌ی اعتبار ---------- */
  function creditPanel(sc, ev, onAdj) {
    const wrap = el('div', { class: 'card', id: 'credit-panel', style: 'background:#f8faf5;border:2px solid var(--pri)' });
    wrap.appendChild(el('h3', { style: 'margin-top:0', text: 'حساب هر نفر (زنده)' }));
    wrap.appendChild(el('div', { class: 'note', text: 'جلوی «تعدیل» می‌توانید + یا − بنویسید؛ مثلاً -9000000000 بابت خرید (کم می‌شود) یا +3000000000 بابت فروش (اضافه می‌شود). هر زمینی که برای کسی انتخاب شود همین‌جا کنار نامش می‌آید و ارزشش از اعتبارش کم می‌شود.' }));
    if (!ev) { wrap.appendChild(el('div', { class: 'box err', text: 'محاسبه ممکن نشد.' })); return wrap; }
    wrap.appendChild(el('div', { id: 'credit-table', style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px' }, ev.results.map(x => {
      const rem = x.remaining;
      const row = (k, v, cls) => el('div', { style: 'display:flex;justify-content:space-between;gap:8px;border-bottom:1px dotted var(--line);padding:3px 0' }, [el('span', { class: 'note', text: k }), el('b', { class: cls || '', text: v })]);
      return el('div', { 'data-pid': x.person.id, style: 'background:#fff;border:1px solid var(--line);border-radius:10px;padding:10px' }, [
        el('div', { style: 'font-size:16px;font-weight:700;margin-bottom:4px', text: x.person.name }),
        row('حق از بخش‌ها', toman(x.entitledExact) + ' تومان'),
        el('div', { style: 'display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px dotted var(--line)' }, [el('span', { class: 'note', style: 'white-space:nowrap', text: 'تعدیل (+/−)' }),
          el('input', { type: 'text', dir: 'ltr', value: x.adjustText || '', placeholder: 'مبلغ با + یا −', onchange: (e) => {
            const v = e.target.value.trim();
            if (C.parseAdjust(v) === null) { App.toast('نامعتبر است؛ مثل +3000000000 یا -9000000000 بنویسید', 'warn'); return; }
            sc.adjust = sc.adjust || {}; if (v) sc.adjust[x.person.id] = v; else delete sc.adjust[x.person.id];
            App.save(); onAdj();
          } })]),
        row('اعتبار خرید', toman(x.creditExact) + ' تومان'),
        el('div', { class: 'note', style: 'margin-top:4px', text: 'زمین‌های انتخاب‌شده:' }),
        x.finalLines.length ? el('div', { style: 'max-height:150px;overflow:auto' }, x.finalLines.map(l => el('div', { style: 'font-size:12px;border-bottom:1px dotted var(--line);padding:2px 0' }, l.name + (l.fractionText !== '1' ? ' (' + fa(l.fractionText) + ')' : '') + ' — ' + toman(l.valueExact)))) : el('div', { class: 'note', text: '— هنوز زمینی نگرفته —' }),
        row('جمع ارزش زمین‌ها', toman(x.finalValue) + ' تومان'),
        el('div', { class: rem >= 0 ? 'pos' : 'neg', style: 'font-size:17px;margin-top:6px;text-align:center', html: (rem >= 0 ? 'مانده‌ی اعتبار: ' : 'بیش از اعتبار: ') + '<b>' + toman(Math.abs(rem)) + '</b> تومان' }),
      ]);
    })));
    return wrap;
  }

  /* ---------- صفحه‌ی اصلی بخش پرونده‌ها ---------- */
  function mount(r, rerenderAll) {
    const S = App.S;
    const live = S.scenarios.filter(s => s.live);
    const nm = el('input', { type: 'text', placeholder: 'نام پرونده (مثلاً «زمین‌های پدری و دره گرمی»)' });
    r.appendChild(el('div', { class: 'card', id: 'cases-card' }, [
      el('h3', { text: 'پرونده‌های زنده (پیشنهادی)' }),
      el('div', { class: 'note', text: 'هر پرونده یک فهرست مستقل از زمین‌ها و افراد است؛ چند پرونده‌ی بی‌ربط به هم می‌توانید داشته باشید. در پرونده‌ی زنده هیچ عددی ثابت نمی‌ماند: با عوض‌شدن قیمت یا مساحت هر زمین، حق‌ها، کسری‌ها و لیست نهایی خودکار دوباره حساب می‌شوند.' }),
      el('div', { class: 'row' }, [el('div', { class: 'grow' }, nm), el('button', { class: 'btn', id: 'case-new', text: 'ساخت پرونده‌ی جدید', onclick: () => {
        if (!S.parcels.length) { App.toast('ابتدا زمین ثبت کنید', 'warn'); return; }
        const sc = C.createCase(S, nm.value.trim() || 'پرونده ' + App.n(live.length + 1, 0), [], null);
        sc.parcelIds = []; curId = sc.id; curTab = 'setup'; App.save(); rerenderAll();
      } })]),
      live.length ? el('table', { class: 't', style: 'margin-top:8px' }, [el('thead', null, el('tr', null, ['نام', 'تعداد زمین', 'تعداد اشخاص', ''].map(h => el('th', { text: h })))),
        el('tbody', null, live.map(sc => el('tr', { style: sc.id === curId ? 'background:var(--sel)' : '' }, [
          el('td', { class: 'l', text: sc.name }), el('td', { text: App.n((sc.parcelIds || []).length, 0) }), el('td', { text: App.n((sc.personIds || []).length, 0) }),
          el('td', null, el('div', { class: 'row' }, [
            el('button', { class: 'btn sm', text: 'باز کردن', onclick: () => { curId = sc.id; rerenderAll(); } }),
            el('button', { class: 'btn sm dng', text: 'حذف', onclick: () => App.confirm('حذف پرونده', 'پرونده‌ی «' + App.esc(sc.name) + '» حذف شود؟ (زمین‌ها و اشخاص حذف نمی‌شوند)', () => { S.scenarios = S.scenarios.filter(x => x.id !== sc.id); if (curId === sc.id) curId = null; App.save(); rerenderAll(); }, 'حذف') }),
          ])),
        ])))]) : el('div', { class: 'note', text: 'هنوز پرونده‌ای ساخته نشده است.' }),
    ]));
    const sc = live.find(s => s.id === curId);
    if (sc) r.appendChild(caseView(sc, rerenderAll));
  }

  function caseView(sc, rerenderAll) {
    const S = App.S;
    const box = el('div', { class: 'card', id: 'case-view' });
    const body = el('div');
    const save = () => App.save();
    const redraw = () => { draw(); };
    box.appendChild(el('h3', { text: 'پرونده: ' + sc.name }));
    box.appendChild(el('div', { class: 'row' }, [el('div', { class: 'grow' }, el('input', { type: 'text', value: sc.name, onchange: (e) => { sc.name = e.target.value || sc.name; save(); rerenderAll(); } }))]));
    box.appendChild(el('div', { class: 'tabs2' }, Object.keys(TABS).map(k => el('button', { class: k === curTab ? 'on' : '', 'data-ct': k, text: TABS[k], onclick: () => { curTab = k; rerenderAll(); } }))));
    box.appendChild(body);

    function draw() {
      body.innerHTML = '';
      ({ setup: drawSetup, sections: drawSections, alloc: drawAlloc, deals: drawDeals, result: drawResult })[curTab]();
    }

    /* --- ۱) زمین‌ها و اشخاص --- */
    function drawSetup() {
      body.appendChild(el('h3', { text: 'زمین‌های این پرونده' }));
      body.appendChild(el('div', { class: 'note', text: 'زمین‌هایی را که در همین فهرست حساب می‌شوند تیک بزنید. می‌توانید با جست‌وجو (مثلاً «دره گرمی») گروهی انتخاب کنید.' }));
      body.appendChild(pickList(S.parcels, sc.parcelIds || [], (ids) => { sc.parcelIds = ids; save(); }));
      body.appendChild(el('h3', { text: 'اشخاص این پرونده' }));
      if (!S.persons.length) body.appendChild(el('div', { class: 'box warn', text: 'ابتدا در بخش «اشخاص» بالا، افراد را ثبت کنید.' }));
      body.appendChild(el('div', { class: 'row' }, S.persons.map(p => {
        const cb = el('input', { type: 'checkbox' }); cb.checked = (sc.personIds || []).indexOf(p.id) >= 0;
        cb.addEventListener('change', () => {
          const set = new Set(sc.personIds || []);
          if (cb.checked) { set.add(p.id); (sc.sections || []).forEach(s => { if (!s.weights[p.id]) Object.assign(s.weights, { [p.id]: Object.assign({ text: '1' }, C.fPack(C.frac(1))) }); }); } else set.delete(p.id);
          sc.personIds = S.persons.filter(x => set.has(x.id)).map(x => x.id); save();
        });
        return el('label', { class: 'choice', style: 'display:inline-flex;gap:6px;align-items:center' }, [cb, p.name]);
      })));
    }

    /* --- ۲) بخش‌ها --- */
    function drawSections() {
      const ev = evalSafe(sc);
      const persons = S.persons.filter(p => (sc.personIds || []).indexOf(p.id) >= 0);
      body.appendChild(el('div', { class: 'box info', html: 'زمین‌ها را در <b>بخش</b> دسته‌بندی کنید (مثلاً «دره گرمی» و «پدری»). برای هر بخش سهم نسبی هر نفر را بنویسید (<b>1/3</b>، <b>8</b>، <b>1/3+1/21</b>…). سهم هر نفر از کل = جمع (سهم او در هر بخش × ارزش آن بخش). بخشی که «بقیه‌ی زمین‌ها» باشد هر زمینی را که در جای دیگر نیامده می‌گیرد.' }));
      if (!(sc.parcelIds || []).length) body.appendChild(el('div', { class: 'box warn', text: 'ابتدا در مرحله‌ی ۱ زمین‌ها را انتخاب کنید.' }));
      const caseParcels = S.parcels.filter(p => (sc.parcelIds || []).indexOf(p.id) >= 0);
      (sc.sections || []).forEach((sec, si) => {
        const evs = ev && ev.sections ? ev.sections.find(x => x.id === sec.id) : null;
        const card = el('div', { class: 'card', style: 'background:#fafcf7' });
        card.appendChild(el('div', { class: 'row' }, [
          el('div', { class: 'grow' }, el('input', { type: 'text', value: sec.name, onchange: (e) => { sec.name = e.target.value || sec.name; save(); redraw(); } })),
          el('label', { class: 'note' }, [(() => { const cb = el('input', { type: 'checkbox' }); cb.checked = !!sec.rest; cb.addEventListener('change', () => { if (cb.checked) (sc.sections || []).forEach(s => { s.rest = s === sec; }); else sec.rest = false; save(); redraw(); }); return cb; })(), ' بقیه‌ی زمین‌ها']),
          el('button', { class: 'btn sm dng', text: 'حذف بخش', onclick: () => { sc.sections = sc.sections.filter(s => s !== sec); save(); redraw(); } }),
        ]));
        if (evs) card.appendChild(el('div', { class: 'note', html: 'تعداد زمین: <b>' + App.n(evs.count, 0) + '</b> — مساحت: <b>' + App.n(evs.area, 0) + ' م²</b> — ارزش بخش: <b>' + toman(evs.poolExact) + ' تومان</b> — <b>' + fa(evs.poolPct) + '٪</b> از کل پرونده' }));
        if (!sec.rest) {
          const owner = (id) => { const o = (sc.sections || []).find(s => s !== sec && !s.rest && (s.parcelIds || []).indexOf(id) >= 0); return o ? o.name : null; };
          card.appendChild(el('details', { open: (sec.parcelIds || []).length === 0 ? true : null }, [el('summary', { text: 'زمین‌های این بخش (' + App.n((sec.parcelIds || []).length, 0) + ')' }),
            pickList(caseParcels, sec.parcelIds || [], (ids) => {
              ids.forEach(id => (sc.sections || []).forEach(s => { if (s !== sec && s.parcelIds) s.parcelIds = s.parcelIds.filter(x => x !== id); }));
              sec.parcelIds = ids; save();
            }, (p) => { const o = owner(p.id); return o ? ' (در «' + o + '»)' : ''; })]));
        }
        card.appendChild(el('div', { class: 'scroll' }, el('table', { class: 't' }, [
          el('thead', null, el('tr', null, ['شخص', 'سهم نسبی در این بخش', 'کسر دقیق', 'درصد از بخش', 'ارزش (تومان)'].map(h => el('th', { text: h })))),
          el('tbody', null, persons.map(p => {
            const row = evs ? evs.rows.find(x => x.personId === p.id) : null;
            const w = sec.weights[p.id];
            return el('tr', null, [el('td', { class: 'l', text: p.name }),
              el('td', null, el('input', { type: 'text', dir: 'ltr', value: w ? w.text : '', placeholder: 'خالی = بدون سهم', onchange: (e) => { if (C.setSectionWeight(sc, sec.id, p.id, e.target.value) === null) App.toast('سهم نامعتبر است (مثلاً 1/3، 8 یا 1/3+1/21)', 'warn'); save(); redraw(); } })),
              el('td', { text: row ? fa(row.fracText) : '—' }), el('td', { text: row ? fa(row.pct) + '٪' : '—' }), el('td', { text: row ? toman(row.valueExact) : '—' })]);
          })),
        ])));
        body.appendChild(card);
      });
      const est = (S.estates || []);
      const fromEstates = est.length ? el('button', { class: 'btn sec2', id: 'sec-estates', text: 'گرفتن بخش‌ها از «دسته‌های اموال»', onclick: () => {
        const n = C.sectionsFromEstates(S, sc); save(); redraw(); App.toast(App.n(n, 0) + ' بخش از دسته‌های اموال ساخته شد', 'ok');
      } }) : null;
      const phrase = el('input', { type: 'text', placeholder: 'ساخت بخش از زمین‌هایی که توضیحاتشان شامل این عبارت است' });
      body.appendChild(el('div', { class: 'row' }, [
        fromEstates,
        el('button', { class: 'btn sec2', id: 'sec-add', text: '+ بخش خالی', onclick: () => { C.addSection(sc, 'بخش ' + App.n((sc.sections || []).length + 1, 0)); save(); redraw(); } }),
        el('div', { class: 'grow' }, phrase),
        el('button', { class: 'btn sec2', text: 'ساخت بخش با عبارت', onclick: () => {
          const t = C.normDigits(phrase.value).trim().toLowerCase(); if (!t) { App.toast('عبارت را بنویسید', 'warn'); return; }
          const ids = caseParcels.filter(p => (((p.name || '') + ' ' + (p.notes || '')).toLowerCase()).indexOf(t) >= 0).map(p => p.id);
          if (!ids.length) { App.toast('زمینی با این عبارت در پرونده نیست', 'warn'); return; }
          (sc.sections || []).forEach(s => { if (s.parcelIds) s.parcelIds = s.parcelIds.filter(x => ids.indexOf(x) < 0); });
          C.addSection(sc, phrase.value.trim(), { parcelIds: ids }); save(); redraw(); App.toast(App.n(ids.length, 0) + ' زمین در بخش جدید قرار گرفت', 'ok');
        } })]));
      body.appendChild(creditPanel(sc, ev, redraw));
      if (ev && ev.errors.length) ev.errors.forEach(e => body.appendChild(el('div', { class: 'box err', text: e })));
    }

    /* --- ۳) واگذاری --- */
    function drawAlloc() {
      const persons = S.persons.filter(p => (sc.personIds || []).indexOf(p.id) >= 0);
      const ps = S.parcels.filter(p => (sc.parcelIds || []).indexOf(p.id) >= 0);
      if (!persons.length || !ps.length) { body.appendChild(el('div', { class: 'box warn', text: 'زمین و اشخاص پرونده را در مرحله‌ی ۱ انتخاب کنید.' })); return; }
      body.appendChild(el('div', { class: 'box info', text: 'هر زمین را به هرکس که الان در دست اوست بدهید. سهم را به کسر دقیق (۱/۳) یا درصد (۵۰) بنویسید؛ «کل زمین» یعنی ۱۰۰٪ به یک نفر. این جدول «وضعیت فعلی» است؛ کسری هر نفر در مرحله‌ی ۵ نسبت به حق او نشان داده می‌شود.' }));
      const panelBox = el('div');
      const refreshPanel = () => { panelBox.innerHTML = ''; panelBox.appendChild(creditPanel(sc, evalSafe(sc), refreshPanel)); };
      body.appendChild(panelBox); refreshPanel();
      const rows = ps.map(p => {
        const v = p.valuation || {};
        const sum = C.allocSum(sc, p.id), cmp = C.fCmp(sum, C.frac(1));
        const whole = el('select', { onchange: (e) => { if (!e.target.value) return; C.setAllocation(sc, p.id, e.target.value, 1); (sc.allocations[p.id] || []).forEach(() => { }); const keep = (sc.allocations[p.id] || []).filter(a => a.personId === e.target.value); sc.allocations[p.id] = keep; save(); redraw(); } },
          [el('option', { value: '', text: 'کل زمین به…' })].concat(persons.map(q => el('option', { value: q.id, text: q.name }))));
        const sumTd = el('td', { class: cmp === 0 ? 'pos' : cmp > 0 ? 'neg' : '', text: fa(C.fPct(sum, 2)) + '٪' });
        return el('tr', null, [el('td', { class: 'l', text: p.name || '—' }), el('td', { text: App.n(v.area, 0) }), el('td', { text: toman(v.total || 0) }),
          sumTd,
          ...persons.map(q => {
            const a = ((sc.allocations || {})[p.id] || []).find(x => x.personId === q.id);
            const f = a ? C.allocFrac(a) : null;
            return el('td', null, el('input', { type: 'text', dir: 'ltr', style: 'min-width:60px', value: f ? C.fText(f) : '', title: 'کسر دقیق یا درصد', onchange: (e) => {
              const s = C.parseShare(e.target.value);
              if (!s || s.empty) C.setAllocation(sc, p.id, q.id, 0);
              else if (s.error) App.toast(s.error, 'warn');
              else if (C.fCmp(s.frac, C.frac(1)) > 0) App.toast('بیشتر از ۱۰۰٪ نمی‌شود', 'warn');
              else C.setAllocation(sc, p.id, q.id, s.frac, { text: s.kind === 'ratio' ? s.text : s.pct });
              save(); refreshPanel();
              const sm = C.allocSum(sc, p.id); sumTd.textContent = fa(C.fPct(sm, 2)) + '٪'; sumTd.className = C.fCmp(sm, C.frac(1)) === 0 ? 'pos' : C.fCmp(sm, C.frac(1)) > 0 ? 'neg' : '';
            } }));
          }),
          el('td', null, el('div', { class: 'row' }, [whole, el('button', { class: 'btn sm sec2', text: 'برابر', onclick: () => { C.setEqualAllocation(sc, p.id, persons.map(x => x.id)); save(); redraw(); } })]))]);
      });
      body.appendChild(el('div', { class: 'scroll' }, el('table', { class: 't', id: 'case-alloc' }, [
        el('thead', null, el('tr', null, ['زمین', 'مساحت', 'ارزش', 'جمع'].concat(persons.map(p => p.name), ['']).map(h => el('th', { text: h })))), el('tbody', null, rows)])));
    }

    /* --- ۴) معامله‌های جانبی --- */
    function drawDeals() {
      const persons = S.persons.filter(p => (sc.personIds || []).indexOf(p.id) >= 0);
      const ps = S.parcels.filter(p => (sc.parcelIds || []).indexOf(p.id) >= 0);
      body.appendChild(el('div', { class: 'box info', text: 'اینجا توافق‌های جانبی را بنویسید: مثلاً «مهدی یک زمین را به امیر می‌دهد» یا «مصطفی ۵۰۰ میلیون به اسفندیار می‌پردازد». بعد از ثبت، لیست نهایی و کسری هر نفر خودکار اصلاح می‌شود.' }));
      const kind = el('select', null, [el('option', { value: 'parcel', text: 'واگذاری زمین' }), el('option', { value: 'cash', text: 'پرداخت پول' })]);
      const from = el('select', null, persons.map(p => el('option', { value: p.id, text: p.name })));
      const to = el('select', null, persons.map((p, i) => el('option', { value: p.id, text: p.name, selected: i === 1 ? true : null })));
      const parcel = el('select', null, ps.map(p => el('option', { value: p.id, text: p.name })));
      const part = el('input', { type: 'text', dir: 'ltr', placeholder: 'سهم (خالی = تمام سهم او؛ مثلاً 1/2)' });
      const amount = el('input', { type: 'text', dir: 'ltr', placeholder: 'مبلغ (تومان)' });
      const note = el('input', { type: 'text', placeholder: 'توضیح (اختیاری)' });
      const parcelBox = el('div', { class: 'row' }, [el('div', { class: 'grow' }, parcel), el('div', { class: 'grow' }, part)]);
      const cashBox = el('div', { class: 'row', hidden: true }, [el('div', { class: 'grow' }, amount)]);
      kind.addEventListener('change', () => { parcelBox.hidden = kind.value === 'cash'; cashBox.hidden = kind.value !== 'cash'; });
      body.appendChild(el('div', { class: 'card' }, [
        el('div', { class: 'row' }, [kind, el('span', { text: 'از' }), from, el('span', { text: 'به' }), to]),
        parcelBox, cashBox, el('div', { style: 'margin-top:6px' }, note),
        el('button', { class: 'btn', id: 'deal-add', style: 'margin-top:6px', text: 'ثبت معامله', onclick: () => {
          if (from.value === to.value) { App.toast('دو طرف باید متفاوت باشند', 'warn'); return; }
          if (kind.value === 'cash') {
            const m = C.toFrac(C.normDigits(amount.value).replace(/[,٬]/g, ''));
            if (!m || C.fSign(m) <= 0) { App.toast('مبلغ نامعتبر است', 'warn'); return; }
            C.addDeal(sc, { kind: 'cash', from: from.value, to: to.value, amount: C.fPack(m), note: note.value });
          } else {
            if (!parcel.value) { App.toast('زمینی انتخاب نشده', 'warn'); return; }
            const t = part.value.trim();
            if (t) { const s = C.parseShare(t); if (!s || s.error || s.empty) { App.toast('سهم نامعتبر است', 'warn'); return; } C.addDeal(sc, { kind: 'parcel', from: from.value, to: to.value, parcelId: parcel.value, frac: s.frac, text: t, note: note.value }); }
            else C.addDeal(sc, { kind: 'parcel', from: from.value, to: to.value, parcelId: parcel.value, all: true, note: note.value });
          }
          save(); redraw();
        } })]));
      body.appendChild(el('h3', { text: 'معامله‌های ثبت‌شده' }));
      if (!(sc.deals || []).length) body.appendChild(el('div', { class: 'note', text: 'معامله‌ای ثبت نشده.' }));
      (sc.deals || []).forEach((d, i) => {
        const pn = d.kind === 'cash' ? '' : ((parcelOf(d.parcelId) || {}).name || '؟');
        const what = d.kind === 'cash' ? 'پرداخت ' + toman(C.fToNumber(C.toFrac(d.amount))) + ' تومان' : (d.all ? 'تمام سهم' : fa(d.shareText || (d.num + '/' + d.den))) + ' از «' + pn + '»';
        body.appendChild(el('div', { class: 'row', style: 'border-bottom:1px dotted var(--line);padding:4px 0' }, [
          el('span', { class: 'grow', style: 'flex:1', text: App.n(i + 1, 0) + ') ' + pName(d.from) + ' ← ' + what + ' → ' + pName(d.to) + (d.note ? ' — ' + d.note : '') }),
          el('button', { class: 'btn sm dng', text: 'حذف', onclick: () => { sc.deals.splice(i, 1); save(); redraw(); } })]));
      });
    }

    /* --- ۵) نتیجه --- */
    function drawResult() {
      const ev = evalSafe(sc);
      if (!ev) { body.appendChild(el('div', { class: 'box err', text: 'محاسبه ممکن نشد؛ ورودی‌ها را بازبینی کنید.' })); return; }
      body.appendChild(el('div', { class: 'row' }, [
        el('button', { class: 'btn', id: 'res-print', text: '🖨 چاپ', onclick: () => printResult(sc, ev) }),
        el('button', { class: 'btn sec2', id: 'res-html', text: '💾 ذخیره‌ی برگه', onclick: () => saveSheet(sc, ev) }),
        el('button', { class: 'btn sec2', id: 'res-xlsx', text: '📊 خروجی اکسل', onclick: () => exportXlsx(sc, ev) }),
        el('button', { class: 'btn sec2', id: 'res-copy', text: '📋 کپی متن', onclick: () => copyText(sc, ev) })]));
      const bad = ev.checks.filter(c => !c.ok);
      body.appendChild(el('div', { class: 'box ' + (bad.length ? 'warn' : 'ok') }, [el('b', { text: 'کنترل‌ها' }), el('ul', { class: 'hist', style: 'margin:4px 0 0' }, ev.checks.map(c => el('li', { text: (c.ok ? '✔ ' : '✘ ') + c.msg })))]));
      ev.errors.forEach(e => body.appendChild(el('div', { class: 'box err', text: e })));
      body.appendChild(el('div', { class: 'box info', html: 'ارزش کل پرونده: <b>' + toman(ev.poolExact) + ' تومان</b> — مساحت: <b>' + App.n(ev.area, 0) + ' م²</b> — میانگین هر مترمربع: <b>' + toman(ev.avgPricePerM2) + ' تومان</b>' }));
      if (ev.sections) body.appendChild(el('div', { class: 'scroll' }, el('table', { class: 't' }, [
        el('thead', null, el('tr', null, ['بخش', 'زمین', 'مساحت (م²)', 'ارزش (تومان)', '٪ از کل'].map(h => el('th', { text: h })))),
        el('tbody', null, ev.sections.map(s => el('tr', null, [el('td', { class: 'l', text: s.name }), el('td', { text: App.n(s.count, 0) }), el('td', { text: App.n(s.area, 0) }), el('td', { text: toman(s.poolExact) }), el('td', { text: fa(s.poolPct) + '٪' })])))])));
      body.appendChild(el('h3', { text: 'حق هر نفر و کسری' }));
      body.appendChild(el('div', { class: 'scroll' }, el('table', { class: 't', id: 'res-table' }, [
        el('thead', null, el('tr', null, ['شخص', 'حق از کل (٪)', 'حق (تومان)', 'تعدیل', 'اعتبار', 'ارزش زمین‌های فعلی', 'پول (+دریافت/−پرداخت)', 'وضعیت', 'مبلغ (تومان)', '٪ حق', '≈ مساحت (م²)'].map(h => el('th', { text: h })))),
        el('tbody', null, ev.results.map(x => {
          const short = x.short > 0 ? 'کسری دارد' : x.short < 0 ? 'بیش از حق دارد' : 'تسویه';
          return el('tr', null, [el('td', { class: 'l', text: x.person.name }), el('td', { text: fa(x.entitledPct) + '٪' }), el('td', { text: toman(x.entitledExact) }), el('td', { text: (x.adjust > 0 ? '+' : '') + toman(x.adjust) }), el('td', { text: toman(x.creditExact) }), el('td', { text: toman(x.finalValue) }), el('td', { text: (x.cashNet > 0 ? '+' : '') + toman(x.cashNet) }),
            el('td', { class: x.short > 0 ? 'neg' : x.short < 0 ? 'pos' : '', text: short }), el('td', { class: x.short > 0 ? 'neg' : 'pos', text: toman(Math.abs(x.short)) }), el('td', { text: App.n(Math.abs(x.shortPct), 2) + '٪' }), el('td', { text: App.n(Math.abs(x.shortArea), 0) })]);
        }))])));
      body.appendChild(el('div', { class: 'note', text: 'کسری = مقداری که این نفر هنوز باید بگیرد تا به حق خود برسد؛ «بیش از حق» یعنی باید به دیگران بدهد. مساحت معادل با میانگین قیمت همین پرونده تقریب زده می‌شود.' }));
      if (ev.settlement.length) {
        body.appendChild(el('h3', { text: 'پیشنهاد تسویه (کمترین تعداد پرداخت)' }));
        body.appendChild(el('ul', { class: 'hist' }, ev.settlement.map(s => el('li', { text: s.fromName + ' ← پرداخت ' + toman(s.amountExact) + ' تومان به ' + s.toName }))));
      } else if (ev.results.length) body.appendChild(el('div', { class: 'box ok', text: 'همه دقیقاً به حق خود رسیده‌اند.' }));
      body.appendChild(el('h3', { text: 'لیست نهایی؛ زمین‌های هر نفر زیر نام خودش' }));
      ev.results.forEach(x => body.appendChild(personList(x)));
    }

    draw();
    return box;
  }

  function personList(x) {
    const wrap = el('div', { class: 'card', style: 'break-inside:avoid' });
    wrap.appendChild(el('h3', { style: 'margin-top:0', text: x.person.name + ' — جمع: ' + toman(x.finalValue) + ' تومان، ' + App.n(x.finalArea, 0) + ' م²' }));
    if (x.finalLines.length) wrap.appendChild(el('div', { class: 'scroll' }, el('table', { class: 't' }, [
      el('thead', null, el('tr', null, ['#', 'زمین', 'سهم', 'مساحت (م²)', 'ارزش (تومان)', 'توضیح'].map(h => el('th', { text: h })))),
      el('tbody', null, x.finalLines.map((l, i) => el('tr', null, [el('td', { text: App.n(i + 1, 0) }), el('td', { class: 'l', text: l.name }), el('td', { text: fa(l.fractionText) }), el('td', { text: App.n(l.area, 1) }), el('td', { text: toman(l.valueExact) }), el('td', { class: 'l', text: l.note })])))])));
    else wrap.appendChild(el('div', { class: 'note', text: 'زمینی ندارد.' }));
    if (x.dealLines.length) wrap.appendChild(el('div', { class: 'note', text: 'معامله‌ها: ' + x.dealLines.join(' | ') }));
    wrap.appendChild(el('div', { class: x.short > 0 ? 'neg' : 'pos', text: 'حق: ' + toman(x.entitledExact) + (x.adjust ? ' ' + (x.adjust > 0 ? '+' : '−') + ' ' + toman(Math.abs(x.adjust)) + ' = ' + toman(x.creditExact) : '') + ' تومان — ' + (x.short > 0 ? 'کسری: ' + toman(x.short) + ' تومان' : x.short < 0 ? 'بیش از حق: ' + toman(-x.short) + ' تومان' : 'تسویه') }));
    return wrap;
  }

  /* ---------- خروجی‌ها ---------- */
  function textOf(sc, ev) {
    const L = ['پرونده: ' + sc.name, 'ارزش کل: ' + toman(ev.poolExact) + ' تومان', ''];
    ev.results.forEach(x => {
      L.push('■ ' + x.person.name + ' — حق: ' + fa(x.entitledPct) + '٪ = ' + toman(x.entitledExact) + ' تومان' + (x.adjust ? ' | تعدیل: ' + (x.adjust > 0 ? '+' : '−') + toman(Math.abs(x.adjust)) + ' | اعتبار: ' + toman(x.creditExact) : ''));
      x.finalLines.forEach((l, i) => L.push('  ' + App.n(i + 1, 0) + ') ' + l.name + ' — سهم ' + fa(l.fractionText) + ' — ' + App.n(l.area, 1) + ' م² — ' + toman(l.valueExact) + ' تومان' + (l.note ? ' (' + l.note + ')' : '')));
      x.dealLines.forEach(d => L.push('  ◦ ' + d));
      L.push('  جمع زمین‌ها: ' + toman(x.finalValue) + ' تومان — ' + (x.short > 0 ? 'کسری: ' + toman(x.short) + ' تومان' : x.short < 0 ? 'بیش از حق: ' + toman(-x.short) + ' تومان' : 'تسویه'), '');
    });
    if (ev.settlement.length) { L.push('تسویه:'); ev.settlement.forEach(s => L.push('  ' + s.fromName + ' → ' + s.toName + ': ' + toman(s.amountExact) + ' تومان')); }
    return L.join('\n');
  }
  function copyText(sc, ev) {
    const t = textOf(sc, ev);
    const ok = () => App.toast('متن کپی شد', 'ok');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok, () => fallbackCopy(t, ok)); else fallbackCopy(t, ok);
  }
  function fallbackCopy(t, ok) {
    const ta = el('textarea', { style: 'position:fixed;top:0;left:0;opacity:.01' }); ta.value = t; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); ok(); } catch (e) { App.modal({ title: 'متن را کپی کنید', body: el('textarea', { style: 'min-height:260px', value: t }) }); }
    ta.remove();
  }
  function sheetHtml(sc, ev) {
    const E = App.esc, T = toman;
    let h = '<h1>' + E(sc.name) + '</h1><div class="note">ارزش کل: ' + T(ev.poolExact) + ' تومان — مساحت: ' + App.n(ev.area, 0) + ' م²</div>';
    h += '<h2>خلاصه‌ی حساب هر نفر</h2><table><thead><tr><th class="l">شخص</th><th>حق (تومان)</th><th>تعدیل</th><th>اعتبار</th><th>ارزش زمین‌ها</th><th>مانده / کسری</th></tr></thead><tbody>';
    ev.results.forEach(x => { h += '<tr><td class="l">' + E(x.person.name) + '</td><td>' + T(x.entitledExact) + '</td><td>' + (x.adjust > 0 ? '+' : '') + T(x.adjust) + '</td><td>' + T(x.creditExact) + '</td><td>' + T(x.finalValue) + '</td><td class="' + (x.short > 0 ? 'neg' : 'pos') + '">' + (x.short > 0 ? 'کسری ' + T(x.short) : x.short < 0 ? 'بیش از حق ' + T(-x.short) : 'تسویه') + '</td></tr>'; });
    h += '</tbody></table>';
    ev.results.forEach(x => {
      h += '<div class="person"><h3>' + E(x.person.name) + ' — جمع: ' + T(x.finalValue) + ' تومان، ' + App.n(x.finalArea, 0) + ' م²</h3>';
      if (x.finalLines.length) { h += '<table><thead><tr><th>#</th><th class="l">زمین</th><th>سهم</th><th>مساحت (م²)</th><th>ارزش (تومان)</th><th class="l">توضیح</th></tr></thead><tbody>';
        x.finalLines.forEach((l, i) => { h += '<tr><td>' + App.n(i + 1, 0) + '</td><td class="l">' + E(l.name) + '</td><td>' + E(fa(l.fractionText)) + '</td><td>' + App.n(l.area, 1) + '</td><td>' + T(l.valueExact) + '</td><td class="l">' + E(l.note) + '</td></tr>'; });
        h += '</tbody></table>'; } else h += '<div class="note">زمینی ندارد.</div>';
      if (x.dealLines.length) h += '<div class="note">معامله‌ها: ' + E(x.dealLines.join(' | ')) + '</div>';
      h += '</div>';
    });
    if (ev.settlement.length) h += '<h2>تسویه</h2><ul>' + ev.settlement.map(s => '<li>' + E(s.fromName) + ' ← پرداخت ' + T(s.amountExact) + ' تومان به ' + E(s.toName) + '</li>').join('') + '</ul>';
    return h;
  }
  function printResult(sc, ev) { App.printHtml(sheetHtml(sc, ev)); }
  function saveSheet(sc, ev) { App.download((sc.name || 'پرونده') + '.html', App.sheetDoc(sc.name, sheetHtml(sc, ev)), 'text/html'); }
  function exportXlsx(sc, ev) {
    if (!window.XLSX) { App.toast('کتابخانه‌ی اکسل بارگذاری نشده', 'err'); return; }
    const wb = XLSX.utils.book_new();
    const sum = [['شخص', 'حق (٪)', 'حق (تومان)', 'ارزش زمین‌های فعلی', 'پول خالص', 'کسری (+) / بیش از حق (−)', 'کسری ٪', '≈ مساحت (م²)']];
    ev.results.forEach(x => sum.push([x.person.name, x.entitledPct, x.entitled, x.finalValue, x.cashNet, x.short, Math.round(x.shortPct * 100) / 100, Math.round(x.shortArea)]));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sum), 'خلاصه');
    const lst = [['شخص', 'زمین', 'سهم', 'مساحت (م²)', 'ارزش (تومان)', 'توضیح']];
    ev.results.forEach(x => { x.finalLines.forEach(l => lst.push([x.person.name, l.name, l.fractionText, Math.round(l.area * 10) / 10, l.value, l.note])); lst.push([x.person.name + ' — جمع', '', '', Math.round(x.finalArea), x.finalValue, '']); });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(lst), 'لیست نهایی');
    if (ev.settlement.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['پرداخت‌کننده', 'دریافت‌کننده', 'مبلغ']].concat(ev.settlement.map(s => [s.fromName, s.toName, s.amount]))), 'تسویه');
    const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    App.downloadBlob((sc.name || 'پرونده') + '.xlsx', new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  }

  App.cases = { mount, textOf, open: (id) => { curId = id; curTab = 'setup'; } };
})();
