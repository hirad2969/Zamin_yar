/* تقسیم زمین‌ها — یک صفحه‌ی ساده
   هر زمین دو چیز دارد: «دسته» (دره گرمی، پدری، محدوده سد، …) و «دست کی است».
   همه‌ی عددها با «ماشین‌حساب دقیق» (کسر دقیق، core.js: divisionLive) و زنده از همین دو چیز حساب می‌شود؛
   هیچ فهرست یا عدد حفظ‌شده‌ای وجود ندارد، پس جابه‌جا کردن یک زمین بین دسته‌ها یا بین آدم‌ها فوراً در همه‌ی عددها اثر می‌گذارد. */
(function () {
  'use strict';
  const App = window.App, C = App.C, el = App.el, fa = App.fa;
  const root = () => document.getElementById('people-root');
  const ui = { q: '', flt: 'all' };
  const S = () => App.S;

  /** گردکردن کسر دقیق به نزدیک‌ترین عدد صحیح (فقط برای نمایش) */
  function R(f) {
    if (!f) return 0;
    const neg = f.n < 0n, n = neg ? -f.n : f.n;
    const q = (2n * n + f.d) / (2n * f.d);
    return Number(neg ? -q : q);
  }
  const money = (f) => App.n(R(f), 0);
  const signed = (f) => { const v = R(f); return (v > 0 ? '+' : v < 0 ? '−' : '') + App.n(Math.abs(v), 0); };
  const pName = (id) => { const p = S().persons.find(x => x.id === id); return p ? p.name : '—'; };
  function ev() { try { return C.divisionLive(S()); } catch (e) { console.error(e); return null; } }
  function save() { App.save(); }

  function render() {
    const r = root(); r.innerHTML = '';
    const st = S();
    st.house = st.house || { amount: '', receivers: [], payer: '' };
    st.adjust = st.adjust || {};
    r.appendChild(el('h2', { text: 'تقسیم زمین‌ها' }));
    r.appendChild(el('div', { class: 'note', text: 'هر عدد اینجا خودکار و دقیق حساب می‌شود: ارزش هر زمین = مساحت × قیمت هر متر (از «زمین‌ها» و «تنظیمات»)؛ حق هر نفر = ارزش دسته × سهم او؛ مانده = حق + خانه‌ی شهر − ارزش زمین‌هایی که دستش است.' }));
    const strip = el('div', { id: 'strip-box', class: 'strip' });
    const bCat = el('div', { class: 'card', id: 'cat-box' }), bHouse = el('div', { class: 'card', id: 'house-box' }),
      bPeople = el('div', { class: 'card', id: 'sum-box' }), bPick = el('div', { class: 'card', id: 'pick-box' }),
      bRes = el('div', { class: 'card', id: 'res-box' }), bCode = el('div', { class: 'card', id: 'code-box' }), bPer = el('div', { class: 'card', id: 'persons-box' });
    let data = null;
    const rows = {};
    // با هر تغییر فقط عددها دوباره حساب و رسم می‌شوند (لیست زمین‌ها دست نمی‌خورد تا جای صفحه نپرد)
    const refresh = () => { save(); data = ev(); drawStrip(); drawCat(); drawPeople(); drawHouse(); drawRes(); markRows(); };
    const full = () => { save(); render(); };

    function drawStrip() {
      strip.innerHTML = '';
      if (!data) return;
      data.people.forEach(x => {
        const v = R(x.remaining);
        strip.appendChild(el('span', { class: 'chip ' + (v < 0 ? 'neg' : 'pos'), 'data-pid': x.person.id }, [el('b', { text: x.person.name + ': ' }), (v < 0 ? 'کسری ' : 'مانده ') + App.n(Math.abs(v), 0)]));
      });
    }

    /* ۱) دسته‌ها: در هر سطر ارزش و ضریب سهم هر نفر */
    function drawCat() {
      bCat.innerHTML = '';
      bCat.appendChild(el('h3', { style: 'margin-top:0', text: '۱) دسته‌ها و سهم هر نفر' }));
      if (!data) return;
      const persons = st.persons;
      bCat.appendChild(el('div', { class: 'note', text: 'هر سطر یک دسته است: ارزشش جمع ارزش زمین‌های همان دسته است و ضریب هر نفر را می‌توانید عوض کنید (مثلاً ۸، ۸، ۱، ۴ یا ۱/۷). سهم = ضریب ÷ جمع ضریب‌ها؛ زیر هر ضریب سهم و مبلغ تومانی نوشته می‌شود.' }));
      const head = ['دسته', 'زمین', 'متر', 'میانگین قیمت هر متر', 'ارزش دسته (تومان)'].concat(persons.map(p => p.name)).concat(['']);
      const tb = el('tbody');
      data.cats.forEach((c, ci) => {
        const e = st.estates[ci];
        const tr = el('tr', { 'data-est': c.id }, [
          el('td', null, el('input', { type: 'text', value: c.name, style: 'min-width:100px', onchange: (x) => { e.name = x.target.value || e.name; full(); } })),
          el('td', { text: App.n(c.count, 0) }),
          el('td', { text: App.n(c.area, 0) }),
          el('td', { text: c.area > 0 ? App.n(R(C.fDiv(c.value, C.frac(Math.max(1, Math.round(c.area))))), 0) : '—' }),
          el('td', { class: 'val', text: money(c.value) }),
        ]);
        persons.forEach((p, i) => {
          const ws = C.fText(c.weights[i]);
          const inp = el('input', { type: 'text', dir: 'ltr', class: 'w', 'data-est': c.id, 'data-pid': p.id, value: ws === '0' ? '' : ws, placeholder: '0', style: 'width:60px', onchange: (x) => {
            const raw = x.target.value;
            const t = App.num(raw) == null ? raw : String(App.num(raw));
            if (C.setEstateWeight(st, c.id, p.id, t) == null) App.toast('ضریب باید عدد یا کسر مثبت باشد (مثلاً ۴ یا ۱/۷)', 'warn');
            full();
          } });
          tr.appendChild(el('td', null, [inp, el('div', { class: 'note', text: fa(C.fText(c.shares[i])) + ' = ' + money(C.fMul(c.value, c.shares[i])) })]));
        });
        tr.appendChild(el('td', null, el('button', { class: 'btn sm dng', text: 'حذف', onclick: () => App.confirm('حذف دسته', 'دسته‌ی «' + App.esc(c.name) + '» حذف شود؟ زمین‌هایش «بدون دسته» می‌شوند.', () => { C.removeEstate(st, c.id); full(); }, 'حذف') })));
        tb.appendChild(tr);
      });
      bCat.appendChild(el('div', { class: 'scroll' }, el('table', { class: 't', id: 'cat-table' }, [el('thead', null, el('tr', null, head.map(h => el('th', { text: h })))), tb])));
      const nm = el('input', { type: 'text', id: 'cat-new', placeholder: 'نام دسته‌ی تازه (مثلاً محدوده سد)', style: 'max-width:240px' });
      bCat.appendChild(el('div', { class: 'row', style: 'margin-top:8px' }, [nm, el('button', { class: 'btn sm', id: 'cat-add', text: '＋ دسته‌ی تازه', onclick: () => {
        if (!nm.value.trim()) { App.toast('نام دسته را بنویسید', 'warn'); return; }
        const e = C.addEstate(st, nm.value.trim());
        const base = st.estates.find(x => x !== e && /پدری/.test(x.name)) || st.estates.find(x => x !== e);   // سهم‌بندی پیش‌فرض: مثل پدری
        if (base && base.weights) e.weights = C.clone(base.weights);
        full();
      } })]));
      if (data.unclassified.length) bCat.appendChild(el('div', { class: 'box warn', text: data.unclassified.length + ' زمین هنوز دسته ندارد (ارزش: ' + money(data.unclassifiedValue) + ' تومان) و در هیچ سهمی حساب نمی‌شود؛ در لیست پایین برایشان دسته انتخاب کنید.' }));
      data.errors.forEach(t => bCat.appendChild(el('div', { class: 'box err', text: t })));
    }

    /* ۲) خانه‌ی شهر */
    function drawHouse() {
      bHouse.innerHTML = '';
      bHouse.appendChild(el('h3', { style: 'margin-top:0', text: '۲) خانه‌ی شهر' }));
      const h = st.house;
      const amt = el('input', { type: 'text', id: 'house-amt', dir: 'ltr', value: h.amount || '', placeholder: 'مثلاً 3000000000 یا 3 میلیارد', style: 'max-width:200px', onchange: (x) => { if (C.parseAdjust(x.target.value) == null) { App.toast('مبلغ نامعتبر است', 'warn'); return; } h.amount = x.target.value; refresh(); } });
      const payer = el('select', { id: 'house-payer', onchange: (x) => { h.payer = x.target.value; h.receivers = (h.receivers || []).filter(id => id !== h.payer); full(); } }, [el('option', { value: '', text: '— کسی نیست —' })].concat(st.persons.map(p => el('option', { value: p.id, text: p.name }))));
      payer.value = h.payer || '';
      bHouse.appendChild(el('div', { class: 'row' }, [el('label', { class: 'f' }, [el('span', { text: 'سهم هر نفر از خانه‌ی شهر (تومان)' }), amt]), el('label', { class: 'f' }, [el('span', { text: 'خریدار خانه (پرداخت می‌کند؛ فقط زمین‌های او قابل خرید است)' }), payer])]));
      bHouse.appendChild(el('div', { class: 'row', style: 'gap:10px;margin-top:6px' }, [el('span', { text: 'دریافت‌کنندگان:' })].concat(st.persons.filter(p => p.id !== h.payer).map(p =>
        el('label', { style: 'display:flex;gap:4px;align-items:center' }, [el('input', { type: 'checkbox', checked: (h.receivers || []).indexOf(p.id) >= 0 ? true : null, onchange: (x) => { h.receivers = (h.receivers || []).filter(id => id !== p.id); if (x.target.checked) h.receivers.push(p.id); refresh(); } }), p.name])))));
      if (data) {
        const n = data.house.receivers.length;
        bHouse.appendChild(el('div', { class: 'note', text: n && data.house.payer ? 'هر دریافت‌کننده ' + signed(data.house.amount) + ' و ' + pName(data.house.payer) + ' ' + signed(C.fNeg(C.fMul(data.house.amount, C.frac(n)))) + ' (جمع صفر).' : 'خریدار و دریافت‌کنندگان را انتخاب کنید تا مبلغ به حقشان اضافه/کم شود.' }));
        data.warns.forEach(t => bHouse.appendChild(el('div', { class: 'box warn', text: t })));
      }
    }

    /* ۳) حساب هر نفر */
    function drawPeople() {
      bPeople.innerHTML = '';
      bPeople.appendChild(el('h3', { style: 'margin-top:0', text: '۳) حساب هر نفر' }));
      if (!data) { bPeople.appendChild(el('div', { class: 'box err', text: 'محاسبه ممکن نشد.' })); return; }
      const grid = el('div', { class: 'pgrid', id: 'sum-table' });
      data.people.forEach(x => {
        const v = R(x.remaining);
        const adj = el('input', { type: 'text', dir: 'ltr', value: (st.adjust[x.person.id] || ''), placeholder: 'مثلاً +2 میلیارد', class: 'adj', 'data-pid': x.person.id, onchange: (e) => {
          if (C.parseAdjust(e.target.value) == null) { App.toast('مبلغ نامعتبر است (مثل +3000000000-500000000)', 'warn'); return; }
          st.adjust[x.person.id] = e.target.value; refresh();
        } });
        const L = [];
        x.parts.forEach(pt => L.push(el('div', { class: 'ln' }, [el('span', { text: pt.name + ' (' + fa(C.fText(pt.share)) + ')' }), el('b', { text: money(pt.value) })])));
        L.push(el('div', { class: 'ln sum' }, [el('span', { text: 'جمع حق از زمین‌ها' }), el('b', { text: money(x.entitlement) })]));
        L.push(el('div', { class: 'ln' }, [el('span', { text: 'خانه‌ی شهر' }), el('b', { class: 'ltr', text: signed(x.house) })]));
        L.push(el('div', { class: 'ln' }, [el('span', { text: 'سایر (+/−)' }), adj]));
        L.push(el('div', { class: 'ln sum' }, [el('span', { text: '= اعتبار کل (تومان)' }), el('b', { class: 'cred', text: money(x.credit) })]));
        L.push(el('div', { class: 'ln' }, [el('span', { text: 'زمین‌های دستش (' + App.n(x.held.length, 0) + ' قطعه)' }), el('b', { text: '− ' + money(x.heldValue) })]));
        L.push(el('div', { class: 'ln big ' + (v < 0 ? 'neg' : 'pos') }, [el('span', { text: v < 0 ? 'کسری (بیش از حق برداشته)' : 'مانده‌ی اعتبار خرید' }), el('b', { class: 'rem', text: money(C.fAbs(x.remaining)) })]));
        grid.appendChild(el('div', { class: 'pcard', 'data-pid': x.person.id }, [el('h4', { text: x.person.name }), ...L]));
      });
      bPeople.appendChild(grid);
      bPeople.appendChild(el('div', { class: 'note', text: 'جمع ارزش همه‌ی زمین‌ها: ' + money(data.total) + ' تومان — دست کسی نیست: ' + App.n(data.free.length, 0) + ' قطعه (' + money(data.freeValue) + ') — جمع مانده‌ها: ' + signed(data.sumRemaining) }));
    }

    /* ۴) لیست زمین‌ها: دسته و «دست کی» */
    function drawPick() {
      bPick.innerHTML = '';
      bPick.appendChild(el('h3', { style: 'margin-top:0', text: '۴) زمین‌ها: دسته و «دست کی است»' }));
      bPick.appendChild(el('div', { class: 'note', text: 'برای هر زمین نام کسی را که برمی‌دارد انتخاب کنید؛ ارزشش از اعتبارش کم می‌شود. فقط زمین‌های «خریدار خانه» یا زمین‌های آزاد قابل برداشتن‌اند، مگر کسی زمینی را «آزاد» کرده باشد. دسته را هم همین‌جا می‌توان عوض کرد؛ عددها فوراً دوباره حساب می‌شوند.' }));
      const q = el('input', { type: 'search', id: 'pick-q', placeholder: 'جست‌وجوی نام زمین…', value: ui.q });
      const flt = el('select', { id: 'pick-flt' }, [['all', 'همه'], ['free', 'فقط آزادها'], ['buyable', 'قابل برداشتن']].concat(st.persons.map(p => ['p:' + p.id, 'دست ' + p.name])).map(a => el('option', { value: a[0], text: a[1] })));
      flt.value = ui.flt;
      bPick.appendChild(el('div', { class: 'row' }, [el('div', { class: 'grow' }, q), flt]));
      const list = el('div', { id: 'pick-list' });
      st.parcels.forEach(p => {
        const dSel = el('select', { class: 'est-sel', onchange: (e) => { p.estateId = e.target.value || null; refresh(); } }, [el('option', { value: '', text: C.NO_ESTATE_NAME })].concat(st.estates.map(e => el('option', { value: e.id, text: e.name }))));
        dSel.value = p.estateId || '';
        const hSel = el('select', { class: 'hold-sel', onchange: (e) => {
          const res = C.setHolder(st, p.id, e.target.value || null);
          if (!res.ok) { App.toast(res.reason, 'warn'); e.target.value = C.holderOfParcel(st, p); return; }
          refresh();
        } });
        const rw = el('div', { class: 'prow', 'data-pid': p.id }, [
          el('div', { class: 'pn' }, [el('b', { text: p.name || p.id }), el('span', { class: 'note', text: ' ' + App.n(p.valuation && p.valuation.area, 0) + ' م² × ' + App.n(p.valuation && p.valuation.pricePerM2, 0) + ' = ' }), el('b', { class: 'pv', text: App.n(p.valuation && p.valuation.total, 0) })]),
          el('label', { class: 'mini' }, [el('span', { text: 'دسته' }), dSel]),
          el('label', { class: 'mini' }, [el('span', { text: 'دست کی' }), hSel]),
          el('span', { class: 'tag' }),
        ]);
        rows[p.id] = { el: rw, hSel, p };
        list.appendChild(rw);
      });
      bPick.appendChild(list);
      const apply = () => { ui.q = q.value; ui.flt = flt.value; markRows(); };
      q.addEventListener('input', apply); flt.addEventListener('change', apply);
    }
    /** وضعیت هر ردیف را از روی داده‌ی زنده تازه می‌کند (انتخاب‌های غیرمجاز غیرفعال می‌شوند) */
    function markRows() {
      const seller = C.sellerId(st), qq = (ui.q || '').trim();
      st.parcels.forEach(p => {
        const rw = rows[p.id]; if (!rw) return;
        const cur = C.holderOfParcel(st, p);
        rw.hSel.innerHTML = '';
        [['', '— آزاد (دست هیچ‌کس) —']].concat(st.persons.map(x => [x.id, x.name])).forEach(o => {
          const op = el('option', { value: o[0], text: o[1] });
          if (o[0] && !C.canTake(st, p.id, o[0]).ok) { op.disabled = true; op.textContent = o[1] + ' (ممکن نیست)'; }
          rw.hSel.appendChild(op);
        });
        rw.hSel.value = cur;
        const buyable = !cur || cur === seller;
        const tag = rw.el.querySelector('.tag');
        tag.textContent = cur ? (cur === seller ? 'دست خریدار خانه — قابل برداشتن' : 'دست ' + pName(cur)) : 'آزاد';
        tag.className = 'tag ' + (cur ? (buyable ? 'sell' : 'own') : 'free');
        rw.el.querySelector('.pv').textContent = App.n(p.valuation && p.valuation.total, 0);
        let ok = true;
        if (qq && (p.name || '').indexOf(qq) < 0) ok = false;
        if (ui.flt === 'free' && cur) ok = false;
        if (ui.flt === 'buyable' && !buyable) ok = false;
        if (ui.flt.indexOf('p:') === 0 && cur !== ui.flt.slice(2)) ok = false;
        rw.el.style.display = ok ? '' : 'none';
        const dsel = rw.el.querySelector('.est-sel'); if (dsel && dsel.value !== (p.estateId || '')) dsel.value = p.estateId || '';
      });
    }
    const catName = (p) => { const e = C.findEstate(st, p.estateId); return e ? e.name : '—'; };

    /* ۵) لیست نهایی هر نفر */
    function drawRes() {
      bRes.innerHTML = '';
      bRes.appendChild(el('h3', { style: 'margin-top:0', text: '۵) لیست نهایی زمین‌های هر نفر' }));
      if (!data) return;
      bRes.appendChild(el('div', { class: 'row' }, [
        el('button', { class: 'btn', text: '🖨 چاپ', onclick: () => App.printHtml(sheetHtml(data)) }),
        el('button', { class: 'btn sec2', text: '💾 ذخیره‌ی برگه', onclick: () => App.download('تقسیم-زمین‌ها.html', App.sheetDoc('تقسیم زمین‌ها', sheetHtml(data)), 'text/html') }),
        el('button', { class: 'btn sec2', text: '📊 اکسل', onclick: () => exportXlsx(data) }),
        el('button', { class: 'btn sec2', text: '📋 کپی متن', onclick: () => copyText(textOf(data)) })]));
      data.people.forEach(x => {
        const pct = R(C.fDiv(C.fMul(x.heldValue, C.frac(10000)), C.fSign(data.total) > 0 ? data.total : C.frac(1))) / 100;
        const w = el('div', { class: 'card', style: 'break-inside:avoid' });
        w.appendChild(el('h4', { style: 'margin:0 0 6px', text: x.person.name + ' — ' + App.n(x.held.length, 0) + ' قطعه، ' + App.n(x.heldArea, 0) + ' م²، ارزش ' + money(x.heldValue) + ' تومان (' + App.n(pct, 2) + '٪ از کل)' }));
        if (x.held.length) w.appendChild(el('table', { class: 't' }, [el('thead', null, el('tr', null, ['#', 'زمین', 'دسته', 'مساحت', 'ارزش'].map(h => el('th', { text: h })))),
          el('tbody', null, x.held.map((p, i) => el('tr', null, [el('td', { text: App.n(i + 1, 0) }), el('td', { class: 'l', text: p.name }), el('td', { text: catName(p) }), el('td', { text: App.n(p.valuation && p.valuation.area, 0) }), el('td', { text: App.n(p.valuation && p.valuation.total, 0) })])))]));
        else w.appendChild(el('div', { class: 'note', text: 'زمینی دستش نیست.' }));
        const v = R(x.remaining);
        w.appendChild(el('div', { class: v < 0 ? 'neg' : 'pos', text: 'اعتبار ' + money(x.credit) + ' − زمین‌ها ' + money(x.heldValue) + ' = ' + (v < 0 ? 'کسری ' : 'مانده ') + money(C.fAbs(x.remaining)) + ' تومان' }));
        bRes.appendChild(w);
      });
      if (data.free.length) bRes.appendChild(el('div', { class: 'box info', text: 'زمین‌های آزاد (دست کسی نیست): ' + data.free.map(p => p.name).join('، ') }));
    }

    /* ۶) ارسال و دریافت انتخاب شرکا */
    const b64e = (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o))));
    const b64d = (t) => JSON.parse(decodeURIComponent(escape(atob(t))));
    function drawCode() {
      bCode.innerHTML = '';
      bCode.appendChild(el('h3', { style: 'margin-top:0', text: '۶) ارسال انتخاب من / دریافت انتخاب شرکا' }));
      bCode.appendChild(el('div', { class: 'note', text: 'انتخاب‌های هرکس روی گوشی خودش می‌ماند. شریک «کد انتخاب» می‌سازد و می‌فرستد؛ نسخه‌ی اصلی آن را اینجا وارد می‌کند تا زمین‌های او ثبت شود.' }));
      const who = el('select', { id: 'code-who' }, st.persons.map(x => el('option', { value: x.id, text: x.name })));
      const out = el('textarea', { id: 'code-out', readonly: true, style: 'min-height:60px;direction:ltr;font-size:11px', placeholder: 'کد اینجا ساخته می‌شود' });
      bCode.appendChild(el('div', { class: 'f' }, [el('span', { text: 'من کیستم؟' }), who]));
      bCode.appendChild(el('div', { class: 'row' }, [
        el('button', { class: 'btn', id: 'code-make', text: 'ساخت کد انتخاب من', onclick: () => {
          const x = data && data.people.find(q => q.person.id === who.value); if (!x) return;
          out.value = 'ZY2:' + b64e({ v: 2, who: x.person.name, at: C.nowIso(), credit: R(x.credit), picks: x.held.map(p => [p.name, Math.round((p.valuation && p.valuation.total) || 0)]) });
          out.select();
        } }),
        el('button', { class: 'btn sec2', text: 'کپی', onclick: () => { if (out.value) copyText(out.value); } })]));
      bCode.appendChild(out);
      const inp = el('textarea', { id: 'code-in', style: 'min-height:70px;direction:ltr;font-size:11px;margin-top:10px', placeholder: 'کدهای شرکا را اینجا بچسبانید (چند کد پشت سر هم هم می‌شود)' });
      const rep = el('div', { id: 'code-report' });
      bCode.appendChild(el('div', { class: 'note', style: 'margin-top:10px', text: 'فقط برای نسخه‌ی اصلی: دریافت انتخاب شرکا' }));
      bCode.appendChild(inp);
      bCode.appendChild(el('button', { class: 'btn sec2', id: 'code-apply', text: 'اعمال انتخاب‌های دریافتی', onclick: () => { rep.innerHTML = ''; applyCodes(inp.value, rep); inp.value = ''; save(); refresh(); drawCode(); bCode.appendChild(rep); } }));
      bCode.appendChild(rep);
      const got = Object.keys(st.received || {});
      if (got.length) bCode.appendChild(el('ul', { class: 'hist' }, got.map(pid => el('li', { text: pName(pid) + ' — ' + App.n(st.received[pid].n, 0) + ' زمین — ' + App.fmtDate(st.received[pid].at) + (st.received[pid].warn ? ' ⚠ ' + st.received[pid].warn : ' ✔') }))));
    }
    function applyCodes(text, rep) {
      const codes = String(text || '').split(/\s+/).filter(t => /^ZY2:/.test(t));
      if (!codes.length) { rep.appendChild(el('div', { class: 'box warn', text: 'کدی پیدا نشد (باید با ZY2: شروع شود).' })); return; }
      st.received = st.received || {};
      codes.forEach(c => {
        let d; try { d = b64d(c.slice(4)); } catch (e) { rep.appendChild(el('div', { class: 'box err', text: 'یک کد خراب است و نادیده گرفته شد.' })); return; }
        const person = st.persons.find(p => p.name === d.who);
        if (!person) { rep.appendChild(el('div', { class: 'box err', text: 'شخص «' + d.who + '» در این نسخه نیست.' })); return; }
        const warns = []; let n = 0;
        const names = (d.picks || []).map(x => x[0]);
        st.parcels.forEach(p => { if (p.holderId === person.id && names.indexOf(p.name) < 0) { p.holderId = null; warns.push('«' + p.name + '» آزاد شد'); } });
        (d.picks || []).forEach(pk => {
          const pc = st.parcels.find(p => p.name === pk[0]);
          if (!pc) { warns.push('زمین «' + pk[0] + '» پیدا نشد'); return; }
          if (pc.valuation && Math.round(pc.valuation.total) !== Math.round(pk[1])) warns.push('ارزش «' + pk[0] + '» با نسخه‌ی شریک فرق دارد');
          const res = C.setHolder(st, pc.id, person.id);
          if (!res.ok) warns.push('«' + pc.name + '»: ' + res.reason); else n++;
        });
        const mine = ev().people.find(x => x.person.id === person.id);
        if (mine && Math.abs(R(mine.credit) - d.credit) > 1) warns.push('اعتبار او در نسخه‌ی شریک ' + App.n(d.credit, 0) + ' بوده و در نسخه‌ی شما ' + money(mine.credit) + ' است');
        st.received[person.id] = { at: d.at || C.nowIso(), n, warn: warns.join('؛ ') };
        rep.appendChild(el('div', { class: 'box ' + (warns.length ? 'warn' : 'ok'), text: person.name + ': ' + App.n(n, 0) + ' زمین ثبت شد' + (warns.length ? ' — ' + warns.join('؛ ') : '') }));
      });
    }

    /* ۷) اشخاص */
    function drawPersons() {
      bPer.innerHTML = '';
      bPer.appendChild(el('h3', { style: 'margin-top:0', text: '۷) اشخاص' }));
      st.persons.forEach(p => bPer.appendChild(el('div', { class: 'row', style: 'margin:3px 0' }, [
        el('input', { type: 'text', value: p.name, class: 'grow', onchange: (e) => { p.name = e.target.value || p.name; full(); } }),
        el('button', { class: 'btn sm dng', text: 'حذف', onclick: () => App.confirm('حذف شخص', '«' + App.esc(p.name) + '» و سهم‌ها و زمین‌های دستش حذف شود؟', () => { C.removePerson(st, p.id); full(); }, 'حذف') })])));
      const nm = el('input', { type: 'text', placeholder: 'نام شخص تازه', id: 'per-new' });
      bPer.appendChild(el('div', { class: 'row', style: 'margin-top:8px' }, [el('div', { class: 'grow' }, nm), el('button', { class: 'btn', id: 'per-add', text: 'افزودن', onclick: () => { if (!nm.value.trim()) { App.toast('نام را بنویسید', 'warn'); return; } C.addPerson(st, nm.value.trim(), 1); full(); } })]));
    }

    data = ev();
    drawStrip(); drawCat(); drawHouse(); drawPeople(); drawPick(); markRows(); drawRes(); drawCode(); drawPersons();
    [strip, bCat, bHouse, bPeople, bPick, bRes, bCode, bPer].forEach(b => r.appendChild(b));
  }

  /* ---------- خروجی‌ها ---------- */
  function textOf(d) {
    const L = ['ارزش کل زمین‌ها: ' + money(d.total) + ' تومان', ''];
    d.cats.forEach(c => L.push('دسته‌ی ' + c.name + ': ' + c.count + ' زمین — ' + money(c.value) + ' تومان'));
    L.push('');
    d.people.forEach(x => {
      L.push('■ ' + x.person.name + ' — حق: ' + money(x.entitlement) + ' | خانه‌ی شهر: ' + signed(x.house) + (R(x.adjust) ? ' | سایر: ' + signed(x.adjust) : '') + ' | اعتبار: ' + money(x.credit));
      x.held.forEach((p, i) => L.push('  ' + App.n(i + 1, 0) + ') ' + p.name + ' — ' + App.n(p.valuation && p.valuation.area, 0) + ' م² — ' + App.n(p.valuation && p.valuation.total, 0) + ' تومان'));
      L.push('  جمع زمین‌ها: ' + money(x.heldValue) + ' — ' + (R(x.remaining) < 0 ? 'کسری: ' : 'مانده: ') + money(C.fAbs(x.remaining)) + ' تومان', '');
    });
    if (d.free.length) L.push('آزاد: ' + d.free.map(p => p.name).join('، '));
    return L.join('\n');
  }
  function copyText(t) {
    const ok = () => App.toast('کپی شد', 'ok');
    const fb = () => { const ta = el('textarea', { style: 'position:fixed;top:0;left:0;opacity:.01' }); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); ok(); } catch (e) { App.modal({ title: 'متن را کپی کنید', body: el('textarea', { style: 'min-height:200px', value: t }) }); } ta.remove(); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok, fb); else fb();
  }
  function sheetHtml(d) {
    const E = App.esc;
    let h = '<h1>تقسیم زمین‌ها</h1><div class="note">ارزش کل: ' + money(d.total) + ' تومان</div>';
    h += '<h2>دسته‌ها</h2><table><thead><tr><th class="l">دسته</th><th>زمین</th><th>ارزش (تومان)</th></tr></thead><tbody>' + d.cats.map(c => '<tr><td class="l">' + E(c.name) + '</td><td>' + App.n(c.count, 0) + '</td><td>' + money(c.value) + '</td></tr>').join('') + '</tbody></table>';
    h += '<h2>حساب هر نفر</h2><table><thead><tr><th class="l">شخص</th><th>حق از زمین‌ها</th><th>خانه‌ی شهر</th><th>سایر</th><th>اعتبار</th><th>ارزش زمین‌های دستش</th><th>مانده / کسری</th></tr></thead><tbody>' +
      d.people.map(x => '<tr><td class="l">' + E(x.person.name) + '</td><td>' + money(x.entitlement) + '</td><td>' + signed(x.house) + '</td><td>' + signed(x.adjust) + '</td><td>' + money(x.credit) + '</td><td>' + money(x.heldValue) + '</td><td class="' + (R(x.remaining) < 0 ? 'neg' : 'pos') + '">' + (R(x.remaining) < 0 ? 'کسری ' : 'مانده ') + money(C.fAbs(x.remaining)) + '</td></tr>').join('') + '</tbody></table>';
    d.people.forEach(x => {
      h += '<div class="person"><h3>' + E(x.person.name) + ' — ' + money(x.heldValue) + ' تومان، ' + App.n(x.heldArea, 0) + ' م²</h3>';
      h += x.held.length ? '<table><thead><tr><th>#</th><th class="l">زمین</th><th>مساحت (م²)</th><th>ارزش (تومان)</th></tr></thead><tbody>' + x.held.map((p, i) => '<tr><td>' + App.n(i + 1, 0) + '</td><td class="l">' + E(p.name) + '</td><td>' + App.n(p.valuation && p.valuation.area, 0) + '</td><td>' + App.n(p.valuation && p.valuation.total, 0) + '</td></tr>').join('') + '</tbody></table>' : '<div class="note">زمینی ندارد.</div>';
      h += '</div>';
    });
    return h;
  }
  function exportXlsx(d) {
    if (!window.XLSX) { App.toast('کتابخانه‌ی اکسل بارگذاری نشده', 'err'); return; }
    const wb = XLSX.utils.book_new();
    const sum = [['شخص', 'حق از زمین‌ها', 'خانه‌ی شهر', 'سایر', 'اعتبار', 'ارزش زمین‌های دستش', 'مانده (+) / کسری (−)']];
    d.people.forEach(x => sum.push([x.person.name, R(x.entitlement), R(x.house), R(x.adjust), R(x.credit), R(x.heldValue), R(x.remaining)]));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sum), 'خلاصه');
    const lst = [['شخص', 'زمین', 'مساحت (م²)', 'ارزش (تومان)']];
    d.people.forEach(x => { x.held.forEach(p => lst.push([x.person.name, p.name, Math.round(((p.valuation && p.valuation.area) || 0) * 10) / 10, (p.valuation && p.valuation.total) || 0])); lst.push([x.person.name + ' — جمع', '', Math.round(x.heldArea), R(x.heldValue)]); });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(lst), 'لیست نهایی');
    const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    App.downloadBlob('تقسیم-زمین‌ها.xlsx', new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  }

  App.share = { render, textOf, R };
  App.on('tab', (t) => { if (t === 'people') render(); });
  App.on('state', () => { if (App.curTab === 'people') render(); });
})();
