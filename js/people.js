/* اشخاص، سناریوهای تقسیم و مقایسه‌ی ارزش سهم‌ها (موتور تقسیم در core.js حفظ شده است) */
(function () {
  'use strict';
  const App = window.App, C = App.C, el = App.el;
  const root = () => document.getElementById('people-root');
  let curSc = null;

  function render() {
    const S = App.S, r = root(); r.innerHTML = '';
    r.appendChild(el('h2', { text: 'اشخاص و تقسیم زمین‌ها' }));
    /* اشخاص */
    const nm = el('input', { type: 'text', placeholder: 'نام شخص' }), wt = el('input', { type: 'text', dir: 'ltr', value: '1', placeholder: 'سهم نسبی' });
    r.appendChild(el('div', { class: 'card' }, [
      el('h3', { text: 'اشخاص' }),
      el('div', { class: 'note', text: '«سهم نسبی» نسبت حق هر شخص از مجموع ارزش است (مثلاً ۱، ۱، ۲ یعنی نفر سوم دو برابر).' }),
      el('div', { class: 'row' }, [el('div', { class: 'grow' }, nm), el('div', { style: 'width:110px' }, wt), el('button', { class: 'btn', text: 'افزودن', onclick: () => {
        if (!nm.value.trim()) { App.toast('نام را وارد کنید', 'warn'); return; }
        const w = App.num(wt.value); if (!(w > 0)) { App.toast('سهم نسبی باید عدد مثبت باشد', 'warn'); return; }
        C.addPerson(S, nm.value.trim(), w); App.save(); render();
      } })]),
      S.persons.length ? el('table', { class: 't', style: 'margin-top:8px' }, [el('thead', null, el('tr', null, ['نام', 'سهم نسبی', ''].map(h => el('th', { text: h })))),
        el('tbody', null, S.persons.map(p => el('tr', null, [
          el('td', null, el('input', { type: 'text', value: p.name, onchange: (e) => { p.name = e.target.value; App.save(); render(); } })),
          el('td', null, el('input', { type: 'text', dir: 'ltr', value: p.weight, onchange: (e) => { const w = App.num(e.target.value); if (w > 0) p.weight = w; App.save(); render(); } })),
          el('td', null, el('button', { class: 'btn sm dng', text: 'حذف', onclick: () => App.confirm('حذف شخص', 'شخص «' + App.esc(p.name) + '» و سهم‌های او در سناریوها حذف شود؟', () => {
            S.persons = S.persons.filter(x => x.id !== p.id);
            S.scenarios.forEach(sc => Object.keys(sc.allocations).forEach(k => { sc.allocations[k] = sc.allocations[k].filter(a => a.personId !== p.id); if (!sc.allocations[k].length) delete sc.allocations[k]; }));
            App.save(); render();
          }, 'حذف') })),
        ])))]) : el('div', { class: 'note', text: 'هنوز شخصی ثبت نشده است.' }),
    ]));
    /* سناریوها */
    const sname = el('input', { type: 'text', placeholder: 'نام سناریو (مثلاً «تقسیم اول»)' });
    r.appendChild(el('div', { class: 'card' }, [
      el('h3', { text: 'سناریوهای تقسیم' }),
      el('div', { class: 'note', text: 'هر سناریو هنگام ساخت یک «عکس» از قیمت‌ها و ارزش‌های همان لحظه می‌گیرد؛ تغییر قیمت بعدی روی سناریوهای قدیمی اثر ندارد و فقط در سناریوهای جدید دیده می‌شود.' }),
      el('div', { class: 'row' }, [el('div', { class: 'grow' }, sname), el('button', { class: 'btn', text: 'ساخت سناریوی جدید از همه‌ی زمین‌ها', onclick: () => {
        if (!S.parcels.length) { App.toast('ابتدا زمین ثبت کنید', 'warn'); return; }
        const sc = C.createScenario(S, sname.value.trim() || 'سناریو ' + App.n(S.scenarios.length + 1, 0)); curSc = sc.id; App.save(); render();
      } })]),
      S.scenarios.length ? el('table', { class: 't', style: 'margin-top:8px' }, [el('thead', null, el('tr', null, ['نام', 'زمان ساخت', 'نسخه‌ی قیمت‌ها', 'تعداد زمین', ''].map(h => el('th', { text: h })))),
        el('tbody', null, S.scenarios.map(sc => el('tr', { style: sc.id === curSc ? 'background:var(--sel)' : '' }, [
          el('td', { class: 'l', text: sc.name }), el('td', { text: App.fmtDate(sc.createdAt) }), el('td', { text: App.n(sc.settingsVersion, 0) + (sc.settingsVersion !== S.settings.version ? ' (قدیمی)' : '') }), el('td', { text: App.n(Object.keys(sc.parcels).length, 0) }),
          el('td', null, el('div', { class: 'row' }, [
            el('button', { class: 'btn sm', text: 'باز کردن', onclick: () => { curSc = sc.id; render(); } }),
            el('button', { class: 'btn sm sec2', text: 'نسخه‌ی جدید با قیمت‌های فعلی', onclick: () => {
              const n = C.createScenario(S, sc.name + ' (قیمت‌های جدید)', Object.keys(sc.parcels).filter(id => S.parcels.some(p => p.id === id)));
              Object.keys(sc.allocations).forEach(pid => { if (n.parcels[pid]) n.allocations[pid] = C.clone(sc.allocations[pid]); });
              curSc = n.id; App.save(); render();
            } }),
            el('button', { class: 'btn sm dng', text: 'حذف', onclick: () => App.confirm('حذف سناریو', 'سناریوی «' + App.esc(sc.name) + '» حذف شود؟', () => { S.scenarios = S.scenarios.filter(x => x.id !== sc.id); if (curSc === sc.id) curSc = null; App.save(); render(); }, 'حذف') }),
          ])),
        ])))]) : el('div', { class: 'note', text: 'هنوز سناریویی ساخته نشده است.' }),
    ]));
    const sc = S.scenarios.find(x => x.id === curSc);
    if (sc) r.appendChild(scenarioView(sc));
  }

  function scenarioView(sc) {
    const S = App.S;
    const box = el('div', { class: 'card' });
    const resBox = el('div');
    const evalNow = () => {
      resBox.innerHTML = '';
      if (!S.persons.length) { resBox.appendChild(el('div', { class: 'box warn', text: 'برای محاسبه‌ی اختلاف ارزش، ابتدا اشخاص را ثبت کنید.' })); return; }
      const ev = C.evaluateScenario(S, sc);
      ev.errors.forEach(e => resBox.appendChild(el('div', { class: 'box err', text: e })));
      resBox.appendChild(el('div', { class: 'box info', html: 'ارزش کل مجموعه: <b>' + App.toman(ev.pool) + '</b>' }));
      resBox.appendChild(el('div', { class: 'scroll' }, el('table', { class: 't' }, [
        el('thead', null, el('tr', null, ['شخص', 'سهم مستحق (تومان)', 'ارزش دریافتی', 'اختلاف', 'اختلاف ٪', 'مساحت دریافتی (م²)', 'ارزش آبی', 'ارزش دیم', 'ارزش ویژه'].map(h => el('th', { text: h })))),
        el('tbody', null, ev.results.map(x => el('tr', null, [
          el('td', { class: 'l', text: x.person.name }), el('td', { text: App.n(x.entitled, 0) }), el('td', { text: App.n(x.received, 0) }),
          el('td', { class: x.diff > 0 ? 'pos' : x.diff < 0 ? 'neg' : '', text: (x.diff > 0 ? '+' : '') + App.n(x.diff, 0) }), el('td', { text: App.n(x.diffPct, 1) + '٪' }),
          el('td', { text: App.n(x.area, 1) }), el('td', { text: App.n((x.byAgri.irrigated || {}).value || 0, 0) }), el('td', { text: App.n((x.byAgri.dry || {}).value || 0, 0) }), el('td', { text: App.n(x.specialValue, 0) }),
        ]))),
      ])));
      resBox.appendChild(el('div', { class: 'note', text: 'اختلاف مثبت = بیش از سهم مستحق دریافت کرده؛ منفی = کمتر. ارزش‌ها بر اساس قیمت‌های تنظیم‌شده‌ی خودتان است، نه قیمت بازار.' }));
      if (ev.unallocated.length) resBox.appendChild(el('div', { class: 'box warn', html: '<b>سهم واگذارنشده:</b> ' + ev.unallocated.map(u => App.esc(u.name) + ' (' + App.n(u.remaining * 100, 0) + '٪ ≈ ' + App.n(u.value, 0) + ' تومان)').join('، ') }));
      // ریز تفکیک
      const det = ev.results.filter(x => x.parcels.length).map(x => el('details', null, [el('summary', { text: x.person.name + ' — تفکیک زمین‌ها' }),
        el('table', { class: 't' }, [el('thead', null, el('tr', null, ['زمین', 'سهم', 'مساحت (م²)', 'ارزش'].map(h => el('th', { text: h })))), el('tbody', null, x.parcels.map(q => el('tr', null, [el('td', { class: 'l', text: q.name }), el('td', { text: App.n(q.fraction * 100, 1) + '٪' }), el('td', { text: App.n(q.area, 1) }), el('td', { text: App.n(q.value, 0) })])))]),
        el('div', { class: 'note', text: 'به تفکیک محدوده: ' + Object.keys(x.byScope).map(k => C.SCOPES[k] + ' (' + App.n(x.byScope[k].area, 0) + ' م²، ' + App.n(x.byScope[k].value, 0) + ' تومان)').join(' — ') })]));
      det.forEach(d => resBox.appendChild(d));
    };
    box.appendChild(el('h3', { text: 'سناریو: ' + sc.name }));
    box.appendChild(el('div', { class: 'note', text: 'قیمت‌های این سناریو مربوط به نسخه‌ی ' + App.n(sc.settingsVersion, 0) + ' تنظیمات است. سهم هر شخص از هر زمین را به درصد بنویسید (جمع هر ردیف حداکثر ۱۰۰٪).' }));
    if (!S.persons.length) box.appendChild(el('div', { class: 'box warn', text: 'ابتدا اشخاص را ثبت کنید.' }));
    else {
      const head = ['زمین', 'نوع', 'مساحت (م²)', 'قیمت هر م²', 'ارزش'].concat(S.persons.map(p => p.name + ' ٪'));
      const rows = Object.keys(sc.parcels).map(id => {
        const sp = sc.parcels[id];
        const cells = S.persons.map(p => {
          const a = (sc.allocations[id] || []).find(x => x.personId === p.id);
          return el('td', null, el('input', { type: 'text', dir: 'ltr', value: a ? +(a.fraction * 100).toFixed(4) : '', style: 'min-width:70px', onchange: (e) => {
            const v = App.num(e.target.value);
            if (v == null) C.setAllocation(sc, id, p.id, 0);
            else if (!isFinite(v) || v < 0 || v > 100) { App.toast('درصد باید بین ۰ و ۱۰۰ باشد', 'warn'); e.target.value = ''; C.setAllocation(sc, id, p.id, 0); }
            else C.setAllocation(sc, id, p.id, v / 100);
            App.save(); evalNow();
          } }));
        });
        const typ = sp.scope === 'urban' ? C.URBAN_USES[sp.urbanUse] : (C.GRADES[sp.grade] || '—') + (sp.agri ? ' / ' + (C.FARM[sp.agri] || C.AGRI[sp.agri] || '') : '') + (sp.special ? ' / ویژه' : '');
        return el('tr', null, [el('td', { class: 'l', text: sp.name }), el('td', { class: 'l', text: C.SCOPES[sp.scope] + ' — ' + typ }), el('td', { text: App.n(sp.area, 1) }), el('td', { text: App.n(sp.pricePerM2, 0) }), el('td', { text: App.n(sp.total, 0) }), ...cells]);
      });
      box.appendChild(el('div', { class: 'scroll' }, el('table', { class: 't' }, [el('thead', null, el('tr', null, head.map(h => el('th', { text: h })))), el('tbody', null, rows)])));
    }
    box.appendChild(el('h3', { text: 'نتیجه' }));
    box.appendChild(resBox);
    evalNow();
    return box;
  }
  App.on('tab', (t) => { if (t === 'people') render(); });
  App.on('state', () => { if (App.curTab === 'people') render(); });
})();
