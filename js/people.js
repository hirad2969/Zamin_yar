/* اشخاص، دسته‌های اموال (چند منبع با سهم متفاوت)، سناریوهای تقسیم و برگه‌ی نهایی
   همه‌ی محاسبه‌ها داخل خود برنامه و با «کسر دقیق» انجام می‌شود (core.js):
   سهم‌ها مثل ۱/۸ بدون گردکردن نگهداری می‌شوند و جمع آن‌ها همیشه کنترل می‌شود.
   موتور تقسیم هیچ وابستگی به اینترنت یا هوش مصنوعی ندارد. */
(function () {
  'use strict';
  const App = window.App, C = App.C, el = App.el;
  const root = () => document.getElementById('people-root');
  let curSc = null;
  const fa = App.fa;
  const estates = () => (App.S.estates = App.S.estates || []);
  const money = (x) => App.n(Math.round(x || 0), 0);

  /* گزینه‌های انتخاب دسته‌ی اموال (با «دسته‌بندی‌نشده») */
  function estateSelect(value, onchange, style) {
    const s = el('select', { style: style || 'min-width:130px' }, [el('option', { value: '', text: C.NO_ESTATE_NAME })]
      .concat(estates().map(e => el('option', { value: e.id, text: e.name }))));
    s.value = value || '';
    s.addEventListener('change', () => onchange(s.value || null));
    return s;
  }

  function render() {
    const S = App.S, r = root(); r.innerHTML = '';
    r.appendChild(el('h2', { text: 'اشخاص و تقسیم زمین‌ها' }));
    r.appendChild(el('div', { class: 'box info', html: 'محاسبه‌ها در خود برنامه انجام می‌شود، نه در اینترنت یا هوش مصنوعی: مساحت، ارزش هر زمین، جمع کل، سهم هر نفر، دریافتی، بستانکاری و بدهکاری — همه با <b>کسر دقیق</b> (مثل ۱/۸) حساب می‌شوند و گردکردن فقط در نمایش است. می‌توانید <b>چند دسته‌ی اموال</b> (مثلاً «اموال پدری» و «اموال دره‌گرمی») با سهم‌های متفاوت تعریف کنید و هم جدا و هم با هم حساب کنید؛ حق هرکس جمعِ سهمش در همه‌ی دسته‌هاست.' }));
    r.appendChild(personsCard(S));
    r.appendChild(estatesCard(S));
    if (App.cases) App.cases.mount(r, render);
    const old = el('details', { class: 'card', id: 'old-scenarios', open: S.scenarios.some(x => !x.live && x.id === curSc) ? true : null }, [el('summary', { text: 'سناریوهای قدیمی (روش پیشین؛ برای کار تازه «پرونده‌ی زنده» را بسازید)' })]);
    old.appendChild(scenariosCard(S));
    const sc = S.scenarios.find(x => x.id === curSc && !x.live);
    if (sc) old.appendChild(scenarioView(sc));
    r.appendChild(old);
  }

  /* ------------------------------ اشخاص ------------------------------ */
  function personsCard(S) {
    const nm = el('input', { type: 'text', placeholder: 'نام شخص' }), wt = el('input', { type: 'text', dir: 'ltr', value: '1', placeholder: 'سهم نسبی' });
    return el('div', { class: 'card' }, [
      el('h3', { text: 'اشخاص' }),
      el('div', { class: 'note', text: '«سهم پیش‌فرض» نسبت حق هر شخص است وقتی برای یک دسته‌ی اموال سهم جداگانه ثبت نشده باشد (مثلاً ۱، ۱، ۲ یعنی نفر سوم دو برابر). می‌توانید کسر دقیق هم بنویسید: ۳/۲ یا 1.5.' }),
      el('div', { class: 'row' }, [el('div', { class: 'grow' }, nm), el('div', { style: 'width:110px' }, wt), el('button', { class: 'btn', text: 'افزودن', onclick: () => {
        if (!nm.value.trim()) { App.toast('نام را وارد کنید', 'warn'); return; }
        const w = C.toFrac(App.num(wt.value) == null ? wt.value : App.num(wt.value));
        if (!w || C.fSign(w) <= 0) { App.toast('سهم نسبی باید عدد یا کسر مثبت باشد (مثلاً ۱، ۱٫۵ یا ۳/۲)', 'warn'); return; }
        C.addPerson(S, nm.value.trim(), w); nm.value = ''; wt.value = '1'; App.save(); render();
      } })]),
      S.persons.length ? el('table', { class: 't', style: 'margin-top:8px' }, [el('thead', null, el('tr', null, ['نام', 'سهم پیش‌فرض', 'حق از کل (کسر دقیق)', 'درصد حق', ''].map(h => el('th', { text: h })))),
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
            el('td', null, el('button', { class: 'btn sm dng', text: 'حذف', onclick: () => App.confirm('حذف شخص', 'شخص «' + App.esc(p.name) + '» و سهم‌های او در دسته‌ها و سناریوها حذف شود؟', () => {
              C.removePerson(S, p.id);
              App.save(); render();
            }, 'حذف') })),
          ]);
        }))]) : el('div', { class: 'note', text: 'هنوز شخصی ثبت نشده است.' }),
    ]);
  }

  /* ------------------- دسته‌های اموال (منابع) ------------------- */
  function estateParcelCount(id) { return App.S.parcels.filter(p => (p.estateId || '') === (id || '')).length; }

  function estatesCard(S) {
    const list = estates();
    const nm = el('input', { type: 'text', placeholder: 'نام دسته (مثلاً «اموال پدری» یا «اموال دره‌گرمی»)' });
    const kids = [
      el('h3', { text: 'دسته‌های اموال (منابع تقسیم)' }),
      el('div', { class: 'note', html: 'هر دسته می‌تواند <b>سهم‌بندی خودش</b> را داشته باشد. مثال: در «اموال پدری» سهم هر پسر ۱ است (یعنی هرکس ۱/۷)، ولی در «اموال دره‌گرمی» دو پسری که با پدر شریک بوده‌اند یک‌سوم بیشتر می‌برند ⇒ سهم آن‌ها <b>۴/۳</b> و بقیه ۱. تعداد دسته‌ها محدودیتی ندارد. هر زمین به یک دسته تعلق دارد (ستون «دسته» در تب «زمین‌ها» یا در جدول سناریو) و زمین‌های بدون دسته در «' + C.NO_ESTATE_NAME + '» با سهم پیش‌فرض اشخاص حساب می‌شوند.' }),
      el('div', { class: 'row' }, [el('div', { class: 'grow' }, nm), el('button', { class: 'btn', text: 'افزودن دسته', onclick: () => {
        const name = nm.value.trim();
        if (!name) { App.toast('نام دسته را بنویسید', 'warn'); return; }
        const e = C.addEstate(S, name);
        if (S.persons.length) C.setEstateEqualWeights(S, e.id, S.persons.map(p => p.id));
        nm.value = ''; App.save(); render();
        App.toast('دسته‌ی «' + name + '» ساخته شد؛ سهم اشخاص در آن را می‌توانید تغییر دهید.', 'ok');
      } })]),
    ];
    if (!list.length) {
      kids.push(el('div', { class: 'note', text: 'هنوز دسته‌ای ثبت نشده است؛ همه‌ی زمین‌ها در «' + C.NO_ESTATE_NAME + '» با سهم پیش‌فرض اشخاص حساب می‌شوند.' }));
      return el('div', { class: 'card' }, kids);
    }
    /* جدول مدیریت دسته‌ها */
    kids.push(el('div', { class: 'scroll' }, el('table', { class: 't', style: 'margin-top:8px' }, [
      el('thead', null, el('tr', null, ['نام دسته', 'توضیح', 'تعداد زمین', 'جمع سهم‌ها', ''].map(h => el('th', { text: h })))),
      el('tbody', null, list.map(e => {
        const w = C.estateWeights(S, e.id);
        return el('tr', null, [
          el('td', null, el('input', { type: 'text', value: e.name, onchange: (ev2) => { e.name = ev2.target.value.trim() || e.name; App.save(); render(); } })),
          el('td', null, el('input', { type: 'text', value: e.note || '', placeholder: 'اختیاری', onchange: (ev2) => { e.note = ev2.target.value; App.save(); } })),
          el('td', { text: App.n(estateParcelCount(e.id), 0) }),
          el('td', { html: fa(C.fText(w.sum)) + (w.usedDefault ? '<span class="sub">سهمی ثبت نشده؛ سهم پیش‌فرض اشخاص به کار می‌رود</span>' : '') }),
          el('td', null, el('div', { class: 'row' }, [
            el('button', { class: 'btn sm sec2', text: 'همه برابر', title: 'سهم همه‌ی اشخاص در این دسته = ۱', onclick: () => { C.setEstateEqualWeights(S, e.id, S.persons.map(p => p.id)); App.save(); render(); } }),
            el('button', { class: 'btn sm sec2', text: 'سهم مضاعف', title: 'افزودن سهم بیشتر به چند نفر در همین دسته (مثلاً یک‌سوم بیشتر)', onclick: () => bonusModal(e) }),
            el('button', { class: 'btn sm sec2', text: 'پاک‌کردن سهم‌ها', onclick: () => { e.weights = {}; App.save(); render(); } }),
            el('button', { class: 'btn sm dng', text: 'حذف دسته', onclick: () => App.confirm('حذف دسته', 'دسته‌ی «' + App.esc(e.name) + '» حذف شود؟ زمین‌های آن «' + C.NO_ESTATE_NAME + '» می‌شوند و هیچ زمینی پاک نمی‌شود.', () => { C.removeEstate(S, e.id); App.save(); render(); }, 'حذف') }),
          ])),
        ]);
      })),
    ])));
    /* ماتریس سهم اشخاص در هر دسته */
    if (S.persons.length) {
      const head = ['شخص', 'سهم پیش‌فرض'].concat(list.map(e => e.name));
      kids.push(el('h3', { text: 'سهم هر شخص در هر دسته' }));
      kids.push(el('div', { class: 'note', text: 'عدد یا کسر بنویسید (۱، ۴/۳، ۱٫۵)؛ خالی یا صفر یعنی از این دسته سهمی ندارد. زیر هر خانه، درصد واقعی همان دسته نوشته شده است.' }));
      kids.push(el('div', { class: 'scroll' }, el('table', { class: 't mx' }, [
        el('thead', null, el('tr', null, head.map(h => el('th', { text: h })))),
        el('tbody', null, S.persons.map(p => el('tr', null, [
          el('td', { class: 'l', text: p.name }),
          el('td', { text: fa(C.fText(C.personWeightFrac(p))) }),
        ].concat(list.map(e => {
          const w = C.estateWeightFrac(e, p.id);
          const sum = C.estateWeights(S, e.id);
          const share = C.fSign(sum.sum) > 0 && !sum.usedDefault ? C.fDiv(w, sum.sum) : C.frac(0);
          return el('td', null, [
            el('input', { type: 'text', dir: 'ltr', value: C.fSign(w) > 0 ? C.fText(w) : '', placeholder: '۰', onchange: (ev2) => {
              const r2 = C.setEstateWeight(S, e.id, p.id, ev2.target.value.trim());
              if (r2 === null) App.toast('سهم باید عدد یا کسر مثبت باشد (مثلاً ۱ یا ۴/۳)', 'warn');
              App.save(); render();
            } }),
            el('span', { class: 'sub', text: sum.usedDefault ? 'پیش‌فرض' : fa(C.fText(share)) + ' = ' + fa(C.fPct(share, 3)) + '٪' }),
          ]);
        }))))),
        el('tfoot', null, el('tr', null, [el('th', { class: 'l', text: 'جمع سهم‌ها' }), el('th', { text: fa(C.fText(S.persons.reduce((s, q) => C.fAdd(s, C.personWeightFrac(q)), C.frac(0)))) })]
          .concat(list.map(e => el('th', { text: fa(C.fText(C.estateWeights(S, e.id).sum)) }))))),
      ])));
    }
    return el('div', { class: 'card' }, kids);
  }

  /** «سهم مضاعف»: به چند نفر در یک دسته سهم بیشتری می‌دهد (مثلاً یک‌سوم بیشتر از بقیه) */
  function bonusModal(e) {
    const S = App.S;
    if (!S.persons.length) { App.toast('ابتدا اشخاص را ثبت کنید', 'warn'); return; }
    const picks = {};
    const amount = el('input', { type: 'text', dir: 'ltr', value: '1/3', placeholder: '1/3' });
    let mode = 'add';
    const radio = (v, label, hint) => {
      const inp = el('input', { type: 'radio', name: 'bonus-mode', checked: v === mode ? true : null, onchange: () => { mode = v; } });
      return el('label', { style: 'display:block;margin:4px 0' }, [inp, ' ', el('b', { text: label }), el('div', { class: 'note', text: hint })]);
    };
    App.modal({
      title: 'سهم مضاعف در دسته‌ی «' + e.name + '»',
      body: el('div', null, [
        el('div', { class: 'note', text: 'مثال: دو پسری که در این اموال با پدر شریک بوده‌اند یک‌سوم بیشتر می‌برند ⇒ مقدار «۱/۳» و گزینه‌ی «اضافه به سهم فعلی». سهم بقیه دست‌نخورده می‌ماند.' }),
        el('div', { class: 'row' }, S.persons.map(p => {
          const cb = el('input', { type: 'checkbox', onchange: (ev2) => { picks[p.id] = ev2.target.checked; } });
          return el('label', { class: 'choice', style: 'display:flex;gap:6px;align-items:center' }, [cb, el('span', { text: p.name + ' (' + fa(C.fText(C.estateWeightFrac(e, p.id))) + ')' })]);
        })),
        el('label', { class: 'f' }, [el('span', { text: 'مقدار (عدد یا کسر)' }), amount]),
        radio('add', 'اضافه به سهم فعلی (+)', 'سهم ۱ با مقدار ۱/۳ می‌شود ۴/۳ — یعنی یک‌سوم بیشتر از بقیه.'),
        radio('mul', 'ضرب در سهم فعلی (×)', 'سهم ۱ با مقدار ۲ می‌شود ۲ — یعنی دو برابر بقیه.'),
      ]),
      buttons: [
        { label: 'اعمال', onClick: () => {
          const f = C.toFrac(amount.value.trim());
          if (!f || C.fSign(f) <= 0) { App.toast('مقدار باید عدد یا کسر مثبت باشد (مثلاً ۱/۳ یا ۲)', 'warn'); return false; }
          const ids = S.persons.filter(p => picks[p.id]).map(p => p.id);
          if (!ids.length) { App.toast('حداقل یک نفر را انتخاب کنید', 'warn'); return false; }
          ids.forEach(id => {
            let w = C.estateWeightFrac(e, id);
            if (C.fSign(w) <= 0) w = C.frac(1);
            const nw = mode === 'add' ? C.fAdd(w, f) : C.fMul(w, f);
            C.setEstateWeight(S, e.id, id, C.fText(nw));
          });
          // اشخاصی که سهمی ندارند، سهم پایه‌ی ۱ بگیرند تا نسبت‌ها معنا داشته باشد
          S.persons.forEach(p => { if (C.fSign(C.estateWeightFrac(e, p.id)) <= 0) C.setEstateWeight(S, e.id, p.id, '1'); });
          App.save(); render();
          App.toast('سهم ' + App.n(ids.length, 0) + ' نفر در دسته‌ی «' + e.name + '» بیشتر شد.', 'ok');
        } },
        { label: 'انصراف', cls: 'sec2' },
      ],
    });
  }

  /* ------------------------------ سناریوها ------------------------------ */
  function scenariosCard(S) {
    const sname = el('input', { type: 'text', placeholder: 'نام سناریو (مثلاً «تقسیم اول»)' });
    return el('div', { class: 'card' }, [
      el('h3', { text: 'سناریوهای تقسیم' }),
      el('div', { class: 'note', text: 'هر سناریو هنگام ساخت یک «عکس» از قیمت‌های همان لحظه می‌گیرد، ولی در خود سناریو می‌توانید «مبنای قیمت» را عوض کنید (قیمت‌های فعلی، نسخه‌ی دیگری از تنظیمات، سطح حداقل/حداکثر یا ضریب) و همه‌ی محاسبه‌ها بلافاصله با نرخ‌های تازه انجام می‌شود.' }),
      el('div', { class: 'row' }, [el('div', { class: 'grow' }, sname), el('button', { class: 'btn', text: 'ساخت سناریوی جدید از همه‌ی زمین‌ها', onclick: () => {
        if (!S.parcels.length) { App.toast('ابتدا زمین ثبت کنید', 'warn'); return; }
        const sc = C.createScenario(S, sname.value.trim() || 'سناریو ' + App.n(S.scenarios.length + 1, 0)); curSc = sc.id; App.save(); render();
      } })]),
      S.scenarios.some(x => !x.live) ? el('table', { class: 't', style: 'margin-top:8px' }, [el('thead', null, el('tr', null, ['نام', 'زمان ساخت', 'مبنای قیمت', 'تعداد زمین', ''].map(h => el('th', { text: h })))),
        el('tbody', null, S.scenarios.filter(x => !x.live).map(sc => el('tr', { style: sc.id === curSc ? 'background:var(--sel)' : '' }, [
          el('td', { class: 'l', text: sc.name }), el('td', { text: App.fmtDate(sc.createdAt) }),
          el('td', { class: 'l', text: fa(C.basisText(S, sc.priceBasis)) }), el('td', { text: App.n(Object.keys(sc.parcels).length, 0) }),
          el('td', null, el('div', { class: 'row' }, [
            el('button', { class: 'btn sm', text: 'باز کردن', onclick: () => { curSc = sc.id; render(); } }),
            el('button', { class: 'btn sm sec2', text: 'تبدیل به پرونده‌ی زنده', onclick: () => { const c = C.convertScenarioToCase(S, sc.id); if (c) { App.cases.open(c.id); App.save(); render(); App.toast('پرونده‌ی زنده ساخته شد؛ در بخش «پرونده‌های زنده» باز است.', 'ok'); } } }),
            el('button', { class: 'btn sm sec2', text: 'نسخه‌ی جدید با قیمت‌های فعلی', onclick: () => {
              const n = C.createScenario(S, sc.name + ' (قیمت‌های جدید)', Object.keys(sc.parcels).filter(id => S.parcels.some(p => p.id === id)));
              Object.keys(sc.allocations).forEach(pid => { if (n.parcels[pid]) n.allocations[pid] = C.clone(sc.allocations[pid]); });
              if (Array.isArray(sc.estates)) n.estates = sc.estates.slice();
              curSc = n.id; App.save(); render();
            } }),
            el('button', { class: 'btn sm dng', text: 'حذف', onclick: () => App.confirm('حذف سناریو', 'سناریوی «' + App.esc(sc.name) + '» حذف شود؟', () => { S.scenarios = S.scenarios.filter(x => x.id !== sc.id); if (curSc === sc.id) curSc = null; App.save(); render(); }, 'حذف') }),
          ])),
        ])))]) : el('div', { class: 'note', text: 'هنوز سناریویی ساخته نشده است.' }),
    ]);
  }

  /* --------------------- مبنای قیمت (نرخ‌های مرجع) --------------------- */
  function basisBar(sc, refresh) {
    const S = App.S;
    const b = C.normBasis(sc.priceBasis);
    const apply = (patch) => { C.setScenarioBasis(sc, patch); App.save(); refresh(); };
    const snapPool = Object.keys(sc.parcels).reduce((s, id) => s + (sc.parcels[id].total || 0), 0);
    const priced = C.scenarioPrices(S, sc);
    const nowPool = Object.keys(priced).reduce((s, id) => s + (priced[id].total || 0), 0);
    const d = nowPool - snapPool;

    const modeSel = el('select', null, App.opts(C.PRICE_MODES, b.mode));
    modeSel.value = b.mode;
    modeSel.addEventListener('change', () => apply({ mode: modeSel.value, version: modeSel.value === 'version' ? (b.version == null ? S.settings.version : b.version) : b.version }));

    const vers = {};
    (S.settingsHistory || []).slice().reverse().forEach(h => { vers[String(h.version)] = 'نسخه‌ی ' + App.n(h.version, 0) + ' — ' + (h.reason || '') + ' (' + App.fmtDate(h.at) + ')'; });
    const verSel = el('select', null, App.opts(vers, String(b.version == null ? S.settings.version : b.version)));
    verSel.value = String(b.version == null ? S.settings.version : b.version);
    verSel.disabled = b.mode !== 'version';
    verSel.addEventListener('change', () => apply({ version: Number(verSel.value) }));

    const lvlSel = el('select', null, App.opts(C.PRICE_LEVELS, b.level));
    lvlSel.value = b.level; lvlSel.disabled = b.mode === 'snapshot';
    lvlSel.addEventListener('change', () => apply({ level: lvlSel.value }));

    const fac = el('input', { type: 'text', dir: 'ltr', value: String(b.factor), title: 'ضریب تعدیل روی قیمت هر مترمربع (مثلاً 1.2 یعنی ۲۰٪ بیشتر)' });
    fac.disabled = b.mode === 'snapshot';
    fac.addEventListener('change', () => {
      const v = App.num(fac.value);
      if (v == null || !(v > 0)) { App.toast('ضریب باید عددی بزرگ‌تر از صفر باشد', 'warn'); fac.value = String(b.factor); return; }
      apply({ factor: v });
    });

    const ovr = el('input', { type: 'checkbox', checked: b.ignoreOverride ? true : null });
    ovr.disabled = b.mode === 'snapshot';
    ovr.addEventListener('change', () => apply({ ignoreOverride: ovr.checked }));
    const manual = App.S.parcels.filter(p => p.pricing && p.pricing.override != null).length;

    return el('div', { class: 'basis' }, [
      el('b', { text: 'سطح قیمت‌های مرجع (مبنای محاسبه)' }),
      el('div', { class: 'row', style: 'margin-top:6px' }, [
        el('label', { class: 'f grow' }, [el('span', { text: 'منبع قیمت' }), modeSel]),
        el('label', { class: 'f grow' }, [el('span', { text: 'نسخه‌ی تنظیمات' }), verSel]),
        el('label', { class: 'f grow' }, [el('span', { text: 'سطح قیمت' }), lvlSel]),
        el('label', { class: 'f', style: 'width:110px' }, [el('span', { text: 'ضریب' }), fac]),
      ]),
      el('label', { style: 'display:flex;gap:6px;align-items:center;margin:4px 0' }, [ovr, 'قیمت‌های دستیِ زمین‌ها نادیده گرفته شود' + (manual ? ' (' + App.n(manual, 0) + ' زمین قیمت دستی دارد)' : '')]),
      el('div', { class: 'row' }, [
        el('div', { class: 'grow', html: 'ارزش کل با این مبنا: <b>' + App.toman(nowPool) + '</b>' + (d !== 0 ? ' — نسبت به قیمت‌های ثبت‌شده‌ی سناریو: <b class="' + (d > 0 ? 'pos' : 'neg') + '">' + (d > 0 ? '+' : '') + App.n(d, 0) + '</b> تومان' + (snapPool ? ' (' + (d > 0 ? '+' : '') + App.n(d / snapPool * 100, 1) + '٪)' : '') : ' — برابر با قیمت‌های ثبت‌شده‌ی سناریو') }),
        el('button', { class: 'btn sm sec2', text: 'ثبت این قیمت‌ها در عکس سناریو', title: 'قیمت‌های محاسبه‌شده با مبنای فعلی به‌عنوان قیمت ثابت سناریو ذخیره می‌شود', onclick: () => App.confirm('ثبت قیمت‌ها در سناریو', 'قیمت‌های محاسبه‌شده با مبنای «' + App.esc(fa(C.basisText(S, sc.priceBasis))) + '» در خود سناریو ثبت شود؟ پس از آن مبنا روی «قیمت‌های ثبت‌شده» می‌رود.', () => {
          Object.keys(priced).forEach(id => { sc.parcels[id] = Object.assign({}, sc.parcels[id], { area: priced[id].area, pricePerM2: priced[id].pricePerM2, total: priced[id].total, status: priced[id].status, estateId: priced[id].estateId || null }); });
          C.setScenarioBasis(sc, { mode: 'snapshot', level: 'base', factor: 1, ignoreOverride: false });
          App.save(); refresh(); App.toast('قیمت‌ها در سناریو ثبت شد.', 'ok');
        }, 'ثبت شود') }),
      ]),
      el('div', { class: 'note', text: 'با تغییر هر کدام از این گزینه‌ها، ارزش همه‌ی زمین‌ها، حق هر شخص، دریافتی، بستانکاری و بدهکاری بلافاصله با نرخ‌های تازه دوباره محاسبه می‌شود. «حداقل/حداکثر» یعنی قیمت همان سطحِ بازه‌ی هر ردیف در تنظیمات. مساحت‌ها تغییر نمی‌کنند.' }),
    ]);
  }

  /* --------------------- دسته‌های درگیر در سناریو --------------------- */
  function estatesFilter(sc, refresh, priced) {
    const S = App.S;
    const present = [];
    Object.keys(priced).forEach(id => { const e = C.estateIdOf(priced[id]); if (present.indexOf(e) < 0) present.push(e); });
    const incl = Array.isArray(sc.estates) ? sc.estates.map(x => (x == null ? '' : String(x))) : null;
    const isOn = (e) => !incl || incl.indexOf(e) >= 0;
    const setOn = (e, on) => {
      let next = present.filter(x => (x === e ? on : isOn(x)));
      sc.estates = next.length === present.length ? null : next;
      App.save(); refresh();
    };
    const sumOf = (e) => Object.keys(priced).filter(id => C.estateIdOf(priced[id]) === e).reduce((s, id) => s + (priced[id].total || 0), 0);
    const kids = present.map(e => {
      const cb = el('input', { type: 'checkbox', checked: isOn(e) ? true : null });
      cb.addEventListener('change', () => setOn(e, cb.checked));
      const nm = e ? (C.findEstate(S, e) || {}).name || C.NO_ESTATE_NAME : C.NO_ESTATE_NAME;
      const cnt = Object.keys(priced).filter(id => C.estateIdOf(priced[id]) === e).length;
      return el('label', { class: 'choice' + (isOn(e) ? ' on' : ''), style: 'display:flex;gap:6px;align-items:center;text-align:start' }, [cb, el('span', { html: '<b>' + App.esc(nm) + '</b><span class="sub">' + App.n(cnt, 0) + ' زمین — ' + App.toman(sumOf(e)) + '</span>' })]);
    });
    if (present.length < 2) return null;
    return el('div', { class: 'card' }, [
      el('h3', { text: 'دسته‌های اموال در این محاسبه' }),
      el('div', { class: 'note', text: 'تیک هر دسته را بردارید تا فقط با دسته‌های دیگر حساب شود. وقتی چند دسته با هم تیک دارند، حق هر شخص = جمع سهم او در همه‌ی دسته‌های تیک‌خورده و بستانکاری/بدهکاری روی همین مجموع حساب می‌شود.' }),
      el('div', { class: 'row' }, kids.concat([
        el('button', { class: 'btn sm sec2', text: 'همه', onclick: () => { sc.estates = null; App.save(); refresh(); } }),
      ])),
    ]);
  }

  /* ------------------------------ نمای سناریو ------------------------------ */
  function scenarioView(sc) {
    const S = App.S;
    const box = el('div', { class: 'card' });
    const basisBox = el('div'), filterBox = el('div'), tableBox = el('div'), resBox = el('div');
    const refresh = () => {
      basisBox.innerHTML = ''; basisBox.appendChild(basisBar(sc, refresh));
      const priced = C.scenarioPrices(S, sc);
      filterBox.innerHTML = '';
      const f = estatesFilter(sc, refresh, priced);
      if (f) filterBox.appendChild(f);
      drawTable(priced); evalNow();
    };

    function drawTable(priced) {
      tableBox.innerHTML = '';
      if (!S.persons.length) { tableBox.appendChild(el('div', { class: 'box warn', text: 'ابتدا اشخاص را ثبت کنید.' })); return; }
      const head = ['زمین', 'دسته‌ی اموال', 'نوع', 'مساحت (م²)', 'قیمت هر م²', 'ارزش', 'جمع سهم‌ها'].concat(S.persons.map(p => p.name + ' ٪'));
      const rows = Object.keys(sc.parcels).map(id => {
        const sp = priced[id];
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
          el('td', { class: 'l', text: sp.name }),
          el('td', null, estateSelect(C.estateIdOf(sp), (v) => {
            sc.parcels[id].estateId = v; C.setParcelEstate(S, id, v, false);
            App.save(); refresh();
          })),
          el('td', { class: 'l', text: C.SCOPES[sp.scope] + ' — ' + typ }),
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
      tableBox.appendChild(el('div', { class: 'note', text: 'سهم را به درصد بنویسید (۱۲٫۵) یا به کسر دقیق (۱/۸) — هر دو دقیقاً یک‌اند. جمع هر ردیف باید ۱۰۰٪ شود؛ ستون «جمع سهم‌ها» با کسر دقیق کنترل می‌کند و اگر کم یا زیاد باشد همان‌جا می‌نویسد. ستون «دسته‌ی اموال» تعیین می‌کند حق هر شخص از کدام سهم‌بندی حساب شود.' }));
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
      (ev.warnings || []).forEach(e => resBox.appendChild(el('div', { class: 'box warn', text: e })));
      if (ev.skipped && ev.skipped.length) resBox.appendChild(el('div', { class: 'box info', text: 'خارج از این محاسبه (دسته‌ی تیک‌نخورده): ' + ev.skipped.join('، ') }));
      resBox.appendChild(el('div', { class: 'box info', html: 'مبنای قیمت: <b>' + App.esc(fa(ev.basisText)) + '</b> — ارزش کل مجموعه: <b>' + App.toman(ev.pool) + '</b> — ارزش واگذارشده: <b>' + App.toman(Math.round(ev.results.reduce((s, r) => s + r.receivedExact, 0))) + '</b>' }));

      /* سهم هر دسته */
      if (ev.estates.length) {
        resBox.appendChild(el('div', { class: 'scroll' }, el('table', { class: 't' }, [
          el('thead', null, el('tr', null, ['دسته‌ی اموال', 'تعداد زمین', 'ارزش دسته', 'جمع سهم‌ها'].concat(S.persons.map(p => p.name)).map(h => el('th', { text: h })))),
          el('tbody', null, ev.estates.map(g => el('tr', null, [
            el('td', { class: 'l', html: App.esc(g.name) + (g.usedDefaultWeights ? '<span class="sub">سهم پیش‌فرض اشخاص</span>' : '') }),
            el('td', { text: App.n(g.parcelCount, 0) }), el('td', { text: money(g.pool) }), el('td', { text: fa(g.weightSumText) }),
          ].concat(g.persons.map(x => el('td', { html: fa(x.shareText) + '<span class="sub">' + fa(x.sharePct) + '٪ = ' + money(x.entitled) + '</span>' })))))),
        ])));
        resBox.appendChild(el('div', { class: 'note', text: 'حق هر شخص = جمع «ارزش هر دسته × سهم او در همان دسته». اگر فقط یک دسته در محاسبه باشد، همان سهم‌بندی ملاک است.' }));
      }

      /* نتیجه‌ی هر شخص */
      resBox.appendChild(el('div', { class: 'scroll' }, el('table', { class: 't' }, [
        el('thead', null, el('tr', null, ['شخص', 'حق از کل (کسر)', 'سهم مستحق (تومان)', 'ارزش دریافتی', 'اختلاف', 'وضعیت', 'مبلغ تسویه', 'مساحت دریافتی (م²)', 'ارزش ویژه'].map(h => el('th', { text: h })))),
        el('tbody', null, ev.results.map(x => el('tr', null, [
          el('td', { class: 'l', text: x.person.name }),
          el('td', { text: fa(x.entitledFracText) + ' (' + fa(x.entitledPct) + '٪)' }),
          el('td', { text: App.n(x.entitled, 0) }), el('td', { text: App.n(x.received, 0) }),
          el('td', { class: x.diff > 0 ? 'neg' : x.diff < 0 ? 'pos' : '', text: (x.diff > 0 ? '+' : '') + App.n(x.diff, 0) }),
          el('td', { class: x.settle === 'بدهکار' ? 'neg' : x.settle === 'بستانکار' ? 'pos' : '', text: x.settle }),
          el('td', { text: x.diff === 0 ? '—' : App.n(Math.abs(x.diff), 0) }),
          el('td', { text: App.n(x.area, 1) }), el('td', { text: App.n(x.specialValue, 0) }),
        ]))),
        el('tfoot', null, el('tr', null, [
          el('th', { class: 'l', text: 'جمع' }), el('th', { text: fa(C.fText(C.frac(1))) }),
          el('th', { text: App.n(ev.results.reduce((s, r) => s + r.entitled, 0), 0) }),
          el('th', { text: App.n(ev.results.reduce((s, r) => s + r.received, 0), 0) }),
          el('th'), el('th'),
          el('th', { text: App.n(ev.results.reduce((s, r) => s + r.credit, 0), 0) }),
          el('th', { colspan: 2 }),
        ])),
      ])));
      resBox.appendChild(el('div', { class: 'note', text: '«بدهکار» یعنی بیش از حقش دریافت کرده و باید به دیگران بپردازد؛ «بستانکار» یعنی کمتر از حقش گرفته و باید دریافت کند. جمع بستانکاری‌ها و بدهکاری‌ها همیشه با هم برابر است.' }));
      const notes = ev.results.filter(r => r.diffNote).map(r => r.person.name + ': ' + r.diffNote);
      if (notes.length) resBox.appendChild(el('div', { class: 'note', text: notes.join(' — ') }));

      /* برگه‌ی نهایی */
      resBox.appendChild(el('div', { class: 'row', style: 'margin:10px 0' }, [
        el('button', { class: 'btn', text: '🧾 برگه‌ی نهایی تقسیم (لیست زمین‌های هر نفر)', onclick: () => sheetModal(sc) }),
        el('span', { class: 'note', text: 'برگه‌ای که در آن برای هر شخص، فهرست زمین‌های رسیده، جمع کل، بستانکاری و بدهکاری نوشته می‌شود — قابل چاپ و ذخیره.' }),
      ]));

      if (ev.unallocated.length) resBox.appendChild(el('div', { class: 'box warn', html: '<b>سهم واگذارنشده:</b> ' + ev.unallocated.map(u => App.esc(u.name) + ' (' + fa(u.remainingPct) + '٪ = ' + fa(u.remainingFrac) + ' ≈ ' + App.n(u.value, 0) + ' تومان)').join('، ') }));
      if (ev.over && ev.over.length) resBox.appendChild(el('div', { class: 'box err', html: '<b>واگذاری بیش از ۱۰۰٪:</b> ' + ev.over.map(o => App.esc(o.name) + ' (' + fa(C.fPct(o.sum, 4)) + '٪)').join('، ') }));
      if (ev.orphan && ev.orphan.length) resBox.appendChild(el('div', { class: 'box err', text: ev.orphan.length + ' سهم به شخص حذف‌شده تعلق دارد و در جمع لحاظ نشد؛ سناریو را بازبینی کنید.' }));

      // ریز تفکیک هر شخص
      const det = ev.results.filter(x => x.parcels.length).map(x => el('details', null, [el('summary', { text: x.person.name + ' — تفکیک زمین‌ها (' + App.n(x.parcels.length, 0) + ' زمین، ' + App.toman(x.received) + ')' }),
        el('div', { class: 'scroll' }, el('table', { class: 't' }, [el('thead', null, el('tr', null, ['زمین', 'دسته', 'سهم (کسر دقیق)', 'درصد', 'مساحت (م²)', 'قیمت هر م²', 'ارزش'].map(h => el('th', { text: h })))),
          el('tbody', null, x.parcels.map(q => el('tr', null, [el('td', { class: 'l', text: q.name }), el('td', { class: 'l', text: q.estateName }), el('td', { text: fa(q.fractionText) }), el('td', { text: fa(q.pct) + '٪' }), el('td', { text: App.n(q.area, 1) }), el('td', { text: App.n(q.pricePerM2, 0) }), el('td', { text: App.n(q.value, 0) })])))])),
        el('div', { class: 'note', text: 'حق او به تفکیک دسته: ' + x.byEstate.map(b => b.name + ': ' + App.n(b.entitled, 0) + ' (دریافتی ' + App.n(b.received, 0) + ')').join(' — ') }),
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
    box.appendChild(el('div', { class: 'note', text: 'این سناریو در ' + App.fmtDate(sc.createdAt) + ' با تنظیمات نسخه‌ی ' + App.n(sc.settingsVersion, 0) + ' ساخته شده است. سهم هر شخص از هر زمین را به درصد یا کسر دقیق بنویسید (جمع هر ردیف حداکثر ۱۰۰٪).' }));
    box.appendChild(basisBox);
    box.appendChild(filterBox);
    box.appendChild(tableBox);
    box.appendChild(el('h3', { text: 'نتیجه' }));
    box.appendChild(resBox);
    refresh();
    return box;
  }

  /* ------------------------ برگه‌ی نهایی تقسیم ------------------------ */
  function sheetHtml(sh) {
    const m = (x) => fa(App.n(Math.round(x || 0), 0));
    const a = (x) => fa(App.n(x || 0, 1));
    const h = [];
    h.push('<h1>برگه‌ی نهایی تقسیم — ' + App.esc(sh.scenario.name) + '</h1>');
    h.push('<div class="note">تاریخ تهیه: ' + App.esc(App.fmtDate(sh.at)) + ' — مبنای قیمت: ' + App.esc(fa(sh.basisText))
      + ' — ارزش کل مجموعه: <b>' + m(sh.pool) + ' تومان</b> — تعداد زمین: ' + fa(App.n(sh.totals.lands, 0))
      + ' — مساحت کل: ' + a(sh.totals.area) + ' م²</div>');

    if (sh.estates.length) {
      h.push('<h2>دسته‌های اموال و سهم‌بندی</h2><table><thead><tr><th class="l">دسته</th><th>تعداد زمین</th><th>ارزش دسته (تومان)</th>'
        + sh.estates[0].persons.map(p => '<th>' + App.esc(p.name) + '</th>').join('') + '</tr></thead><tbody>'
        + sh.estates.map(g => '<tr><td class="l">' + App.esc(g.name) + '</td><td>' + fa(App.n(g.parcelCount, 0)) + '</td><td>' + m(g.pool) + '</td>'
          + g.persons.map(p => '<td>' + fa(p.shareText) + '<br><span class="note">' + fa(p.sharePct) + '٪ = ' + m(p.entitled) + '</span></td>').join('') + '</tr>').join('')
        + '</tbody></table>');
    }

    h.push('<h2>برگه‌ی هر شخص</h2>');
    sh.persons.forEach(p => {
      h.push('<div class="person"><h3>' + App.esc(p.name) + '</h3>');
      h.push('<div class="note">حق او از کل: <b>' + m(p.entitled) + '</b> تومان (' + fa(p.shareFracText) + ' = ' + fa(p.sharePct) + '٪)'
        + ' — ارزش اموالی که به او رسیده: <b>' + m(p.received) + '</b> تومان'
        + ' — وضعیت: <b class="' + (p.settle === 'بدهکار' ? 'neg' : p.settle === 'بستانکار' ? 'pos' : '') + '">' + p.settle
        + (p.diff === 0 ? '' : ' ' + m(Math.abs(p.diff)) + ' تومان') + '</b></div>');
      if (p.byEstate && p.byEstate.length > 1) {
        h.push('<div class="note">به تفکیک دسته: ' + p.byEstate.map(b => App.esc(b.name) + ' — سهم ' + fa(b.shareText) + '، حق ' + m(b.entitled) + '، دریافتی ' + m(b.received)).join(' | ') + '</div>');
      }
      if (p.lands.length) {
        h.push('<table><thead><tr><th>#</th><th class="l">زمین</th><th class="l">دسته</th><th class="l">محدوده</th><th>سهم</th><th>درصد</th><th>مساحت سهم (م²)</th><th>قیمت هر م² (تومان)</th><th>ارزش سهم (تومان)</th></tr></thead><tbody>'
          + p.lands.map((l, i) => '<tr><td>' + fa(App.n(i + 1, 0)) + '</td><td class="l">' + App.esc(l.name || '—') + '</td><td class="l">' + App.esc(l.estateName) + '</td><td class="l">' + App.esc(l.scopeName) + '</td><td>' + fa(l.shareText) + '</td><td>' + fa(l.sharePct) + '٪</td><td>' + a(l.area) + '</td><td>' + m(l.pricePerM2) + '</td><td>' + m(l.value) + '</td></tr>').join('')
          + '</tbody><tfoot><tr><th colspan="6" class="l">جمع ' + fa(App.n(p.totals.lands, 0)) + ' زمین</th><th>' + a(p.totals.area) + '</th><th></th><th>' + m(p.totals.value) + '</th></tr></tfoot></table>');
      } else {
        h.push('<div class="note">هیچ زمینی به این شخص واگذار نشده است؛ تمام حق او (' + m(p.entitled) + ' تومان) بستانکاری است.</div>');
      }
      h.push('<div class="sign"><span>امضا: ....................</span><span>تاریخ: ....................</span></div>');
      h.push('</div>');
    });

    h.push('<h2>فهرست نهایی زمین‌ها — هر زمین به چه کسی رسید</h2>');
    h.push('<table><thead><tr><th>#</th><th class="l">زمین</th><th class="l">دسته</th><th>مساحت (م²)</th><th>قیمت هر م²</th><th>ارزش کل</th><th class="l">سهم‌داران</th></tr></thead><tbody>'
      + sh.lands.map((l, i) => '<tr><td>' + fa(App.n(i + 1, 0)) + '</td><td class="l">' + App.esc(l.name || '—') + '</td><td class="l">' + App.esc(l.estateName) + '</td><td>' + a(l.area) + '</td><td>' + m(l.pricePerM2) + '</td><td>' + m(l.total) + '</td><td class="l">'
        + (l.parts.length ? l.parts.map(x => App.esc(x.person) + ' (' + fa(x.shareText) + ' = ' + fa(x.sharePct) + '٪، ' + m(x.value) + ')').join('، ') : '—')
        + (l.remainingPct ? ' <b class="neg">— واگذارنشده: ' + fa(l.remainingPct) + '٪ (' + m(l.remainingValue) + ')</b>' : '') + '</td></tr>').join('')
      + '</tbody><tfoot><tr><th colspan="3" class="l">جمع</th><th>' + a(sh.totals.area) + '</th><th></th><th>' + m(sh.totals.value) + '</th><th></th></tr></tfoot></table>');

    h.push('<h2>خلاصه‌ی تسویه</h2><table><thead><tr><th class="l">شخص</th><th>حق از کل</th><th>دریافتی</th><th>بستانکار</th><th>بدهکار</th></tr></thead><tbody>'
      + sh.persons.map(p => '<tr><td class="l">' + App.esc(p.name) + '</td><td>' + m(p.entitled) + '</td><td>' + m(p.received) + '</td><td class="pos">' + (p.credit ? m(p.credit) : '—') + '</td><td class="neg">' + (p.debit ? m(p.debit) : '—') + '</td></tr>').join('')
      + '</tbody><tfoot><tr><th class="l">جمع</th><th>' + m(sh.totals.value) + '</th><th>' + m(sh.totals.received) + '</th><th>' + m(sh.totals.credit) + '</th><th>' + m(sh.totals.debit) + '</th></tr></tfoot></table>');

    const bad = (sh.checks || []).filter(c => !c.ok);
    if (bad.length) h.push('<div class="note"><b>هشدار:</b> ' + bad.map(c => App.esc(c.msg)).join(' — ') + '</div>');
    h.push('<div class="note">ارزش‌ها بر اساس تنظیمات ارزش‌گذاری خودتان محاسبه شده‌اند (نه قیمت رسمی بازار). همه‌ی سهم‌ها با کسر دقیق حساب شده و گردکردن فقط در نمایش است. این برگه سند رسمی نیست.</div>');
    return h.join('\n');
  }

  function sheetModal(sc) {
    const sh = C.buildDivisionSheets(App.S, sc);
    const html = sheetHtml(sh);
    const name = 'barge-taghsim-' + (sc.name || '').replace(/\s+/g, '-') + '-' + new Date().toISOString().slice(0, 10) + '.html';
    App.modal({
      title: 'برگه‌ی نهایی تقسیم', wide: true,
      body: el('div', { class: 'sheet', html: html }),
      buttons: [
        { label: '🖨 چاپ برگه', onClick: () => { App.printHtml(html); return false; } },
        { label: '💾 ذخیره‌ی برگه (HTML)', cls: 'sec2', onClick: () => { App.download(name, App.sheetDoc('برگه‌ی نهایی تقسیم — ' + (sc.name || ''), html), 'text/html'); return false; } },
        { label: 'بستن', cls: 'sec2' },
      ],
    });
  }

  App.people = { render, sheetHtml, sheetModal };
  App.on('tab', (t) => { if (t === 'people') render(); });
  App.on('state', () => { if (App.curTab === 'people') render(); });
})();
