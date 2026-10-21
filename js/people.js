/* اشخاص، سناریوهای تقسیم و مقایسه‌ی ارزش سهم‌ها
   همه‌ی محاسبه‌ها داخل خود برنامه و با «کسر دقیق» انجام می‌شود (core.js):
   سهم‌ها مثل ۱/۸ بدون گردکردن نگهداری می‌شوند و جمع آن‌ها همیشه کنترل می‌شود.
   موتور تقسیم هیچ وابستگی به اینترنت یا هوش مصنوعی ندارد. */
(function () {
  'use strict';
  const App = window.App, C = App.C, el = App.el;
  const root = () => document.getElementById('people-root');
  let curSc = null;
  const fa = App.fa;

  function render() {
    const S = App.S, r = root(); r.innerHTML = '';
    r.appendChild(el('h2', { text: 'اشخاص و تقسیم زمین‌ها' }));
    r.appendChild(el('div', { class: 'box info', html: 'محاسبه‌ها در خود برنامه انجام می‌شود، نه در اینترنت یا هوش مصنوعی: مساحت، ارزش هر زمین، جمع کل، سهم هر نفر، دریافتی و اختلاف با حق هرکس — همه با <b>کسر دقیق</b> (مثل ۱/۸) حساب می‌شوند و گردکردن فقط در نمایش است. جمع سهم‌های هر زمین همیشه کنترل می‌شود و نتیجه در «کنترل‌های محاسباتی» می‌آید.' }));
    /* اشخاص */
    const nm = el('input', { type: 'text', placeholder: 'نام شخص' }), wt = el('input', { type: 'text', dir: 'ltr', value: '1', placeholder: 'سهم نسبی' });
    r.appendChild(el('div', { class: 'card' }, [
      el('h3', { text: 'اشخاص' }),
      el('div', { class: 'note', text: '«سهم نسبی» نسبت حق هر شخص از مجموع ارزش است (مثلاً ۱، ۱، ۲ یعنی نفر سوم دو برابر). می‌توانید کسر دقیق هم بنویسید: ۳/۲ یا 1.5.' }),
      el('div', { class: 'row' }, [el('div', { class: 'grow' }, nm), el('div', { style: 'width:110px' }, wt), el('button', { class: 'btn', text: 'افزودن', onclick: () => {
        if (!nm.value.trim()) { App.toast('نام را وارد کنید', 'warn'); return; }
        const w = C.toFrac(App.num(wt.value) == null ? wt.value : App.num(wt.value));
        if (!w || C.fSign(w) <= 0) { App.toast('سهم نسبی باید عدد یا کسر مثبت باشد (مثلاً ۱، ۱٫۵ یا ۳/۲)', 'warn'); return; }
        C.addPerson(S, nm.value.trim(), w); nm.value = ''; wt.value = '1'; App.save(); render();
      } })]),
      S.persons.length ? el('table', { class: 't', style: 'margin-top:8px' }, [el('thead', null, el('tr', null, ['نام', 'سهم نسبی', 'حق از کل (کسر دقیق)', 'درصد حق', ''].map(h => el('th', { text: h })))),
        el('tbody', null, S.persons.map(p => {
          const w = C.personWeightFrac(p), sum = S.persons.reduce((s, q) => C.fAdd(s, C.personWeightFrac(q)), C.frac(0));
          const share = C.fSign(sum) > 0 ? C.fDiv(w, sum) : C.frac(0);
          return el('tr', null, [
            el('td', null, el('input', { type: 'text', value: p.name, onchange: (e) => { p.name = e.target.value; App.save(); render(); } })),
            el('td', null, el('input', { type: 'text', dir: 'ltr', value: C.fText(w), onchange: (e) => {
              const ok = C.setPersonWeight(S, p.id, e.target.value);
              if (!ok) App.toast('سهم نسبی باید عدد یا کسر مثبت باشد', 'warn');
              App.save(); render();
            } })),
            el('td', { text: fa(C.fText(share)) }), el('td', { text: fa(C.fPct(share, 4)) + '٪' }),
            el('td', null, el('button', { class: 'btn sm dng', text: 'حذف', onclick: () => App.confirm('حذف شخص', 'شخص «' + App.esc(p.name) + '» و سهم‌های او در سناریوها حذف شود؟', () => {
              C.removePerson(S, p.id);
              App.save(); render();
            }, 'حذف') })),
          ]);
        }))]) : el('div', { class: 'note', text: 'هنوز شخصی ثبت نشده است.' }),
    ]));
    /* پرونده‌های زنده */
    if (App.cases) App.cases.mount(r, render);
    /* سناریوها (قدیمی: عکس ثابت از قیمت‌ها) */
    const sname = el('input', { type: 'text', placeholder: 'نام سناریو (مثلاً «تقسیم اول»)' });
    r.appendChild(el('div', { class: 'card' }, [
      el('h3', { text: 'سناریوهای قدیمی (عکس ثابت)' }),
      el('div', { class: 'note', text: 'هر سناریو هنگام ساخت یک «عکس» از قیمت‌ها و ارزش‌های همان لحظه می‌گیرد؛ تغییر قیمت بعدی روی سناریوهای قدیمی اثر ندارد و فقط در سناریوهای جدید دیده می‌شود.' }),
      el('div', { class: 'row' }, [el('div', { class: 'grow' }, sname), el('button', { class: 'btn', text: 'ساخت سناریوی جدید از همه‌ی زمین‌ها', onclick: () => {
        if (!S.parcels.length) { App.toast('ابتدا زمین ثبت کنید', 'warn'); return; }
        const sc = C.createScenario(S, sname.value.trim() || 'سناریو ' + App.n(S.scenarios.length + 1, 0)); curSc = sc.id; App.save(); render();
      } })]),
      S.scenarios.some(x => !x.live) ? el('table', { class: 't', style: 'margin-top:8px' }, [el('thead', null, el('tr', null, ['نام', 'زمان ساخت', 'نسخه‌ی قیمت‌ها', 'تعداد زمین', ''].map(h => el('th', { text: h })))),
        el('tbody', null, S.scenarios.filter(x => !x.live).map(sc => el('tr', { style: sc.id === curSc ? 'background:var(--sel)' : '' }, [
          el('td', { class: 'l', text: sc.name }), el('td', { text: App.fmtDate(sc.createdAt) }), el('td', { text: App.n(sc.settingsVersion, 0) + (sc.settingsVersion !== S.settings.version ? ' (قدیمی)' : '') }), el('td', { text: App.n(Object.keys(sc.parcels).length, 0) }),
          el('td', null, el('div', { class: 'row' }, [
            el('button', { class: 'btn sm', text: 'باز کردن', onclick: () => { curSc = sc.id; render(); } }),
            el('button', { class: 'btn sm sec2', text: 'تبدیل به پرونده‌ی زنده', onclick: () => { const c = C.convertScenarioToCase(S, sc.id); if (c) { App.cases.open(c.id); App.save(); render(); App.toast('پرونده‌ی زنده ساخته شد؛ در بخش بالا باز شده است.', 'ok'); } } }),
            el('button', { class: 'btn sm sec2', text: 'نسخه‌ی جدید با قیمت‌های فعلی', onclick: () => {
              const n = C.createScenario(S, sc.name + ' (قیمت‌های جدید)', Object.keys(sc.parcels).filter(id => S.parcels.some(p => p.id === id)));
              Object.keys(sc.allocations).forEach(pid => { if (n.parcels[pid]) n.allocations[pid] = C.clone(sc.allocations[pid]); });
              curSc = n.id; App.save(); render();
            } }),
            el('button', { class: 'btn sm dng', text: 'حذف', onclick: () => App.confirm('حذف سناریو', 'سناریوی «' + App.esc(sc.name) + '» حذف شود؟', () => { S.scenarios = S.scenarios.filter(x => x.id !== sc.id); if (curSc === sc.id) curSc = null; App.save(); render(); }, 'حذف') }),
          ])),
        ])))]) : el('div', { class: 'note', text: 'هنوز سناریویی ساخته نشده است.' }),
    ]));
    const sc = S.scenarios.find(x => x.id === curSc && !x.live);
    if (sc) r.appendChild(scenarioView(sc));
  }

  function scenarioView(sc) {
    const S = App.S;
    const box = el('div', { class: 'card' });
    const tableBox = el('div');
    const resBox = el('div');
    const refresh = () => { drawTable(); evalNow(); };
    function drawTable() {
      tableBox.innerHTML = '';
      if (!S.persons.length) { tableBox.appendChild(el('div', { class: 'box warn', text: 'ابتدا اشخاص را ثبت کنید.' })); return; }
      const head = ['زمین', 'نوع', 'مساحت (م²)', 'قیمت هر م²', 'ارزش', 'جمع سهم‌ها'].concat(S.persons.map(p => p.name + ' ٪'));
      const rows = Object.keys(sc.parcels).map(id => {
        const sp = sc.parcels[id];
        const sum = C.allocSum(sc, id);
        const cmp = C.fCmp(sum, C.frac(1));
        const sumCell = el('td', {
          class: cmp === 0 ? 'pos' : cmp > 0 ? 'neg' : '',
          html: '<b>' + fa(C.fPct(sum, 4)) + '٪</b>' + (cmp === 0 ? '<br><span class="note">کسر دقیق: ' + fa(C.fText(sum)) + '</span>'
            : cmp > 0 ? '<br><span class="note">' + fa(C.fPct(C.fSub(sum, C.frac(1)), 4)) + '٪ اضافه</span>'
              : '<br><span class="note">مانده ' + fa(C.fPct(C.fSub(C.frac(1), sum), 4)) + '٪</span>'),
        });
        const cells = S.persons.map(p => {
          const a = ((sc.allocations || {})[id] || []).find(x => x.personId === p.id);
          const f = a ? C.allocFrac(a) : null;
          const inp = el('input', {
            type: 'text', dir: 'ltr', style: 'min-width:70px',
            value: f ? C.fPct(f, 4) : '',
            title: f ? 'کسر دقیق: ' + C.fText(f) + ' — درصد بنویسید (12.5) یا کسر دقیق (1/8)' : 'درصد بنویسید (مثلاً 12.5) یا کسر دقیق (مثلاً 1/8)',
            onchange: (e) => {
              const txt = e.target.value;
              const s = C.parseShare(txt);
              if (!s || s.empty) { C.setAllocation(sc, id, p.id, 0); }
              else if (s.error) { App.toast(s.error, 'warn'); }
              else if (C.fCmp(s.frac, C.frac(1)) > 0) App.toast('سهم یک نفر از یک زمین نمی‌تواند بیشتر از ۱۰۰٪ باشد', 'warn');
              else C.setAllocation(sc, id, p.id, s.frac, { text: s.kind === 'ratio' ? s.text : s.pct });
              App.save(); refresh();
            },
          });
          return el('td', null, inp);
        });
        const typ = sp.scope === 'urban' ? C.URBAN_USES[sp.urbanUse] : (C.GRADES[sp.grade] || '—') + (sp.agri ? ' / ' + (C.FARM[sp.agri] || C.AGRI[sp.agri] || '') : '') + (sp.special ? ' / ویژه' : '');
        return el('tr', null, [
          el('td', { class: 'l', text: sp.name }), el('td', { class: 'l', text: C.SCOPES[sp.scope] + ' — ' + typ }),
          el('td', { text: App.n(sp.area, 1) }), el('td', { text: App.n(sp.pricePerM2, 0) }), el('td', { text: App.n(sp.total, 0) }),
          sumCell, ...cells,
          el('td', null, el('button', { class: 'btn sm sec2', text: 'تقسیم برابر', title: 'سهم دقیق ۱/n بین همه‌ی اشخاص', onclick: () => {
            C.setEqualAllocation(sc, id, S.persons.map(p => p.id));
            App.save(); refresh();
            App.toast('زمین «' + sp.name + '» به‌طور دقیق بین ' + App.n(S.persons.length, 0) + ' نفر تقسیم شد (هرکس ' + fa(C.fText(C.frac(1, S.persons.length))) + ').', 'ok');
          } })),
        ]);
      });
      tableBox.appendChild(el('div', { class: 'scroll' }, el('table', { class: 't alloc', id: 'alloc-table' }, [
        el('thead', null, el('tr', null, head.concat(['']).map(h => el('th', { text: h })))),
        el('tbody', null, rows),
      ])));
      tableBox.appendChild(el('div', { class: 'note', text: 'سهم را به درصد بنویسید (۱۲٫۵) یا به کسر دقیق (۱/۸) — هر دو دقیقاً یک‌اند. جمع هر ردیف باید ۱۰۰٪ شود؛ ستون «جمع سهم‌ها» با کسر دقیق کنترل می‌کند و اگر کم یا زیاد باشد همان‌جا می‌نویسد.' }));
    }
    function evalNow() {
      resBox.innerHTML = '';
      if (!S.persons.length) { resBox.appendChild(el('div', { class: 'box warn', text: 'برای محاسبه‌ی اختلاف ارزش، ابتدا اشخاص را ثبت کنید.' })); return; }
      const ev = C.evaluateScenario(S, sc);
      /* کنترل‌های محاسباتی */
      const bad = ev.checks.filter(c => !c.ok);
      resBox.appendChild(el('div', { class: 'box ' + (bad.length ? 'err' : 'ok') }, [
        el('b', { text: 'کنترل‌های محاسباتی (کسر دقیق، بدون خطای گردکردن)' }),
        el('ul', { class: 'hist', style: 'margin:4px 0 0' }, ev.checks.map(c => el('li', null, [(c.ok ? '✔ ' : '✘ ') + c.msg]))),
      ]));
      ev.errors.forEach(e => resBox.appendChild(el('div', { class: 'box err', text: e })));
      resBox.appendChild(el('div', { class: 'box info', html: 'ارزش کل مجموعه: <b>' + App.toman(ev.pool) + '</b> — ارزش واگذارشده: <b>' + App.toman(Math.round(ev.results.reduce((s, r) => s + r.receivedExact, 0))) + '</b>' }));
      resBox.appendChild(el('div', { class: 'scroll' }, el('table', { class: 't' }, [
        el('thead', null, el('tr', null, ['شخص', 'حق از کل (کسر)', 'سهم مستحق (تومان)', 'ارزش دریافتی', 'اختلاف', 'اختلاف ٪', 'مساحت دریافتی (م²)', 'ارزش آبی', 'ارزش دیم', 'ارزش ویژه'].map(h => el('th', { text: h })))),
        el('tbody', null, ev.results.map(x => el('tr', null, [
          el('td', { class: 'l', text: x.person.name }),
          el('td', { text: fa(x.entitledFracText) + ' (' + fa(x.entitledPct) + '٪)' }),
          el('td', { text: App.n(x.entitled, 0) }), el('td', { text: App.n(x.received, 0) }),
          el('td', { class: x.diff > 0 ? 'pos' : x.diff < 0 ? 'neg' : '', text: (x.diff > 0 ? '+' : '') + App.n(x.diff, 0) }), el('td', { text: App.n(x.diffPct, 1) + '٪' }),
          el('td', { text: App.n(x.area, 1) }), el('td', { text: App.n((x.byAgri.irrigated || {}).value || 0, 0) }), el('td', { text: App.n((x.byAgri.dry || {}).value || 0, 0) }), el('td', { text: App.n(x.specialValue, 0) }),
        ]))),
        el('tfoot', null, el('tr', null, [
          el('th', { class: 'l', text: 'جمع' }), el('th', { text: fa(C.fText(C.frac(1))) }),
          el('th', { text: App.n(ev.results.reduce((s, r) => s + r.entitled, 0), 0) }),
          el('th', { text: App.n(ev.results.reduce((s, r) => s + r.received, 0), 0) }),
          el('th', { colspan: 6 }),
        ])),
      ])));
      const notes = ev.results.filter(r => r.diffNote).map(r => r.person.name + ': ' + r.diffNote);
      if (notes.length) resBox.appendChild(el('div', { class: 'note', text: notes.join(' — ') }));
      resBox.appendChild(el('div', { class: 'note', text: 'اختلاف مثبت = بیش از سهم مستحق دریافت کرده؛ منفی = کمتر. ارزش‌ها بر اساس قیمت‌های تنظیم‌شده‌ی خودتان است، نه قیمت بازار. عدد جدول گردشده است؛ محاسبه‌ی داخلی با کسر دقیق انجام می‌شود.' }));
      if (ev.unallocated.length) resBox.appendChild(el('div', { class: 'box warn', html: '<b>سهم واگذارنشده:</b> ' + ev.unallocated.map(u => App.esc(u.name) + ' (' + fa(u.remainingPct) + '٪ = ' + fa(u.remainingFrac) + ' ≈ ' + App.n(u.value, 0) + ' تومان)').join('، ') }));
      if (ev.over && ev.over.length) resBox.appendChild(el('div', { class: 'box err', html: '<b>واگذاری بیش از ۱۰۰٪:</b> ' + ev.over.map(o => App.esc(o.name) + ' (' + fa(C.fPct(o.sum, 4)) + '٪)').join('، ') }));
      if (ev.orphan && ev.orphan.length) resBox.appendChild(el('div', { class: 'box err', text: ev.orphan.length + ' سهم به شخص حذف‌شده تعلق دارد و در جمع لحاظ نشد؛ سناریو را بازبینی کنید.' }));
      // ریز تفکیک
      const det = ev.results.filter(x => x.parcels.length).map(x => el('details', null, [el('summary', { text: x.person.name + ' — تفکیک زمین‌ها' }),
        el('table', { class: 't' }, [el('thead', null, el('tr', null, ['زمین', 'سهم (کسر دقیق)', 'درصد', 'مساحت (م²)', 'ارزش'].map(h => el('th', { text: h })))), el('tbody', null, x.parcels.map(q => el('tr', null, [el('td', { class: 'l', text: q.name }), el('td', { text: fa(q.fractionText) }), el('td', { text: fa(q.pct) + '٪' }), el('td', { text: App.n(q.area, 1) }), el('td', { text: App.n(q.value, 0) })])))]),
        el('div', { class: 'note', text: 'به تفکیک محدوده: ' + Object.keys(x.byScope).map(k => C.SCOPES[k] + ' (' + App.n(x.byScope[k].area, 0) + ' م²، ' + App.n(x.byScope[k].value, 0) + ' تومان)').join(' — ') })]));
      det.forEach(d => resBox.appendChild(d));
      // ریز کنترل جمع سهم‌ها برای هر زمین
      resBox.appendChild(el('details', null, [el('summary', { text: 'جمع سهم‌های هر زمین (کسر دقیق)' }),
        el('table', { class: 't' }, [el('thead', null, el('tr', null, ['زمین', 'جمع سهم‌ها', 'درصد', 'کامل؟'].map(h => el('th', { text: h })))),
          el('tbody', null, ev.exact.sums.map(s => el('tr', null, [el('td', { class: 'l', text: s.name }), el('td', { text: fa(s.sum) }), el('td', { text: fa(s.pct) + '٪' }), el('td', { html: s.full ? '<span class="pos">✔ ۱۰۰٪</span>' : '<span class="neg">✘</span>' })])))]),
        el('div', { class: 'note', text: 'ارزش کل (دقیق): ' + fa(ev.exact.poolFrac) + ' تومان — واگذارشده: ' + fa(ev.exact.allocatedFrac) + ' — واگذارنشده: ' + fa(ev.exact.unallocatedFrac) + ' — جمع وزن اشخاص: ' + fa(ev.exact.weightSum) }),
      ]));
    }
    box.appendChild(el('h3', { text: 'سناریو: ' + sc.name }));
    box.appendChild(el('div', { class: 'note', text: 'قیمت‌های این سناریو مربوط به نسخه‌ی ' + App.n(sc.settingsVersion, 0) + ' تنظیمات است. سهم هر شخص از هر زمین را به درصد یا کسر دقیق بنویسید (جمع هر ردیف حداکثر ۱۰۰٪).' }));
    box.appendChild(tableBox);
    box.appendChild(el('h3', { text: 'نتیجه' }));
    box.appendChild(resBox);
    refresh();
    return box;
  }
  App.on('tab', (t) => { if (t === 'people') render(); });
  App.on('state', () => { if (App.curTab === 'people') render(); });
})();
