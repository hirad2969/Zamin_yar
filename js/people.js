/* تقسیم زمین‌ها — یک صفحه‌ی ساده (نسخه‌ی ۲)
   هر زمین: «دسته»، «دست کی است»، «قفل» و «در فهرست تقسیم». همه‌ی عددها (ارزش = مساحت × قیمت هر متر، حق، اعتبار، مانده)
   با «ماشین‌حساب دقیق» (کسر دقیق، core.js: divisionLive) و زنده حساب می‌شود؛ هیچ عدد حفظ‌شده‌ای در محاسبه دخیل نیست. */
(function () {
  'use strict';
  const App = window.App, C = App.C, el = App.el, fa = App.fa;
  const root = () => document.getElementById('people-root');
  const ui = { q: '', flt: 'all', mode: 'free', maxMoves: 10, plan: null, planRoot: '' };
  const S = () => App.S;
  function R(f) {
    if (!f) return 0;
    const neg = f.n < 0n, n = neg ? -f.n : f.n;
    const q = (2n * n + f.d) / (2n * f.d);
    return Number(neg ? -q : q);
  }
  const money = (f) => App.n(R(f), 0);
  const signed = (f) => { const v = R(f); return (v > 0 ? '+' : v < 0 ? '−' : '') + App.n(Math.abs(v), 0); };
  const pName = (id) => { const p = S().persons.find(x => x.id === id); return p ? p.name : '—'; };
  const L = (p) => C.parcelLive(p, S().settings);
  const SC = C.SCOPES, GR = C.GRADES;
  function ev() { try { return C.divisionLive(S()); } catch (e) { console.error(e); return null; } }
  function save() { App.save(); }
  const catNameOf = (st, p) => { const e = C.findEstate(st, p.estateId); return e ? e.name : '—'; };
  const chk = (label, on, fn, cls) => el('label', { class: 'chk' + (cls ? ' ' + cls : ''), style: 'display:flex;gap:4px;align-items:center' }, [el('input', { type: 'checkbox', class: cls || '', checked: on ? true : null, onchange: (e) => fn(e.target.checked) }), label]);

  function render() {
    const r = root(); r.innerHTML = '';
    const st = S();
    App.normalize(st);
    r.appendChild(el('h2', { text: 'تقسیم زمین‌ها' }));
    r.appendChild(el('div', { class: 'note', text: 'هر عدد اینجا خودکار و دقیق حساب می‌شود: ارزش هر زمین = مساحت × قیمت هر متر؛ حق هر نفر = ارزش دسته × سهم او؛ مانده = حق + خانه‌ی شهر + سایر − ارزش زمین‌هایی که دستش است. مساحت و قیمت را همین‌جا در لیست زمین‌ها هم می‌توانید اصلاح کنید.' }));
    const strip = el('div', { id: 'strip-box', class: 'strip' });
    const mk = (id) => el('div', { class: 'card', id });
    const bPool = mk('pool-box'), bCat = mk('cat-box'), bHouse = mk('house-box'), bPeople = mk('sum-box'), bAuto = mk('auto-box'), bPick = mk('pick-box'),
      bRes = mk('res-box'), bAud = mk('audit-box'), bCode = mk('code-box'), bPer = mk('persons-box');
    let data = null; const rows = {};
    const refresh = () => { save(); data = ev(); drawStrip(); drawPool(); drawCat(); drawPeople(); drawHouse(); drawAuto(); drawRes(); drawAudit(); markRows(); };
    const full = () => { save(); ui.plan = null; render(); };

    function drawStrip() {
      strip.innerHTML = '';
      if (!data) return;
      data.people.forEach(x => {
        const v = R(x.remaining);
        strip.appendChild(el('span', { class: 'chip ' + (v < 0 ? 'neg' : 'pos'), 'data-pid': x.person.id }, [el('b', { text: x.person.name + ': ' }), (v < 0 ? 'کسری ' : 'مانده ') + App.n(Math.abs(v), 0)]));
      });
    }

    /* ۰) فهرست تقسیم: کدام زمین‌ها در تقسیم شرکت کنند */
    function drawPool() {
      bPool.innerHTML = '';
      bPool.appendChild(el('h3', { style: 'margin-top:0', text: '۰) کدام زمین‌ها تقسیم شوند؟' }));
      const pl = st.pool = st.pool || {};
      const grp = (title, key, opts) => {
        const cur = Array.isArray(pl[key]) ? pl[key] : null;
        return el('div', { class: 'row facet', style: 'gap:10px;align-items:center' }, [el('b', { text: title })].concat(opts.map(o =>
          chk(o[1], !cur || cur.indexOf(o[0]) >= 0, (on) => {
            let a = Array.isArray(pl[key]) ? pl[key].slice() : opts.map(x => x[0]);
            a = a.filter(x => x !== o[0]); if (on) a.push(o[0]);
            pl[key] = a.length === opts.length ? undefined : a; if (pl[key] === undefined) delete pl[key];
            full();
          }, 'pf-' + key))));
      };
      bPool.appendChild(el('div', { class: 'note', text: 'پیش‌فرض همه‌ی زمین‌ها انتخاب است. با برداشتن تیک، آن گروه از تقسیم و همه‌ی حساب‌ها بیرون می‌رود؛ در لیست پایین هم برای هر زمین می‌توانید جدا تیک بزنید یا بردارید.' }));
      bPool.appendChild(el('div', { id: 'division-selection' }, [grp('محدوده:', 'scopes', Object.keys(SC).map(k => [k, SC[k]])), grp('درجه:', 'grades', Object.keys(GR).map(k => [k, GR[k]])), grp('نوع:', 'specials', [['normal', 'عادی'], ['special', 'ویژه']])]));
      const inP = st.parcels.filter(p => C.inPool(st, p));
      let V = C.frac(0); inP.forEach(p => { V = C.fAdd(V, C.frac(L(p).total)); });
      bPool.appendChild(el('div', { class: 'row', style: 'margin-top:6px' }, [
        el('span', { id: 'pool-stat', class: 'note', text: App.n(inP.length, 0) + ' از ' + App.n(st.parcels.length, 0) + ' زمین در تقسیم است — ارزش ' + money(V) + ' تومان' }),
        el('button', { class: 'btn sm sec2', id: 'pool-all', text: 'انتخاب همه', onclick: () => { st.pool = {}; full(); } })]));
    }

    /* ۱) دسته‌ها */
    function drawCat() {
      bCat.innerHTML = '';
      bCat.appendChild(el('h3', { style: 'margin-top:0', text: '۱) دسته‌ها و سهم هر نفر' }));
      if (!data) return;
      const tree = C.personTree(st), persons = tree.roots;
      bCat.appendChild(el('div', { class: 'note', text: 'هر سطر یک دسته است: ارزشش جمع ارزش زمین‌های همان دسته (در فهرست تقسیم) است و ضریب هر نفر را می‌توانید عوض کنید (مثلاً ۸، ۸، ۱، ۴ یا ۱/۷). سهم = ضریب ÷ جمع ضریب‌ها. اگر شخصی زیرمجموعه دارد، سهمش بین اعضا تقسیم می‌شود.' }));
      const head = ['دسته', 'زمین', 'متر', 'میانگین قیمت هر متر', 'ارزش دسته (تومان)'].concat(persons.map(p => p.name)).concat(['']);
      const tb = el('tbody');
      data.cats.forEach((c, ci) => {
        const e = st.estates[ci];
        const tr = el('tr', { 'data-est': c.id }, [
          el('td', null, el('input', { type: 'text', value: c.name, style: 'min-width:100px', onchange: (x) => { e.name = x.target.value || e.name; full(); } })),
          el('td', { text: App.n(c.count, 0) }), el('td', { text: App.n(c.area, 0) }),
          el('td', { text: c.area > 0 ? App.n(R(C.fDiv(c.value, C.frac(Math.max(1, Math.round(c.area))))), 0) : '—' }),
          el('td', { class: 'val', text: money(c.value) }),
        ]);
        persons.forEach((p, i) => {
          const ws = C.fText(c.weights[i]);
          const inp = el('input', { type: 'text', dir: 'ltr', class: 'w', 'data-est': c.id, 'data-pid': p.id, value: ws === '0' ? '' : ws, placeholder: '0', style: 'width:60px', onchange: (x) => {
            const raw = x.target.value, t = App.num(raw) == null ? raw : String(App.num(raw));
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
        const base = st.estates.find(x => x !== e && /پدری/.test(x.name)) || st.estates.find(x => x !== e);
        if (base && base.weights) e.weights = C.clone(base.weights);
        full();
      } })]));
      if (data.unclassified.length) bCat.appendChild(el('div', { class: 'box warn', text: data.unclassified.length + ' زمین هنوز دسته ندارد (ارزش: ' + money(data.unclassifiedValue) + ' تومان) و در هیچ سهمی حساب نمی‌شود؛ در لیست پایین برایشان دسته انتخاب کنید.' }));
      data.errors.forEach(t => bCat.appendChild(el('div', { class: 'box err', text: t })));
    }

    /* ۲) خانه‌ی شهر: چند فروشنده، چند خریدار */
    function drawHouse() {
      bHouse.innerHTML = '';
      bHouse.appendChild(el('h3', { style: 'margin-top:0', text: '۲) خانه‌ی شهر' }));
      const h = st.house, roots = C.personTree(st).roots;
      bHouse.appendChild(el('div', { class: 'note', text: 'هر فروشنده مبلغ زیر را می‌گیرد؛ جمع پرداختی را خریداران به نسبت «سهم خرید» می‌دهند (خالی = برابر). زمین‌های خریداران برای بقیه قابل برداشتن است.' }));
      const amt = el('input', { type: 'text', id: 'house-amt', dir: 'ltr', value: h.amount || '', placeholder: 'مثلاً 3000000000 یا 3 میلیارد', style: 'max-width:200px', onchange: (x) => { if (C.parseAdjust(x.target.value) == null) { App.toast('مبلغ نامعتبر است', 'warn'); return; } h.amount = x.target.value; refresh(); } });
      bHouse.appendChild(el('label', { class: 'f' }, [el('span', { text: 'سهم هر فروشنده از خانه‌ی شهر (تومان)' }), amt]));
      bHouse.appendChild(el('div', { class: 'row', style: 'gap:10px;margin-top:6px' }, [el('b', { text: 'فروشنده‌ها (می‌گیرند):' })].concat(roots.map(p =>
        el('label', { class: 'chk hs', style: 'display:flex;gap:4px;align-items:center' }, [el('input', { type: 'checkbox', class: 'hs', 'data-pid': p.id, checked: h.sellers.indexOf(p.id) >= 0 ? true : null, onchange: (x) => { h.sellers = h.sellers.filter(id => id !== p.id); if (x.target.checked) h.sellers.push(p.id); refresh(); } }), p.name])))));
      bHouse.appendChild(el('div', { class: 'row', style: 'gap:10px;margin-top:6px' }, [el('b', { text: 'خریدارها (می‌پردازند):' })].concat(roots.map(p => {
        const on = h.buyers.indexOf(p.id) >= 0;
        return el('span', { style: 'display:flex;gap:4px;align-items:center' }, [
          el('label', { class: 'chk hb', style: 'display:flex;gap:4px;align-items:center' }, [el('input', { type: 'checkbox', class: 'hb', 'data-pid': p.id, checked: on ? true : null, onchange: (x) => { h.buyers = h.buyers.filter(id => id !== p.id); if (x.target.checked) h.buyers.push(p.id); full(); } }), p.name]),
          on ? el('input', { type: 'text', dir: 'ltr', class: 'hbs', 'data-pid': p.id, placeholder: 'سهم', value: h.buyerShares[p.id] || '', style: 'width:54px', onchange: (x) => { const t = x.target.value; if (t && C.toFrac(t) == null) { App.toast('سهم خرید باید عدد مثبت باشد', 'warn'); return; } if (t) h.buyerShares[p.id] = t; else delete h.buyerShares[p.id]; refresh(); } }) : null]);
      }))));
      if (data) {
        const hh = data.house;
        bHouse.appendChild(el('div', { class: 'note', id: 'house-note', text: hh.sellers.length && hh.buyers.length ? 'جمع پرداختی: ' + money(hh.total) + ' تومان؛ ' + hh.sellers.map(id => pName(id) + ' ' + signed(hh.amount)).join('، ') + '؛ ' + hh.buyers.map(id => { const x = data.groups.find(g => g.root.id === id); return pName(id) + ' ' + signed(x ? x.house : C.frac(0)); }).join('، ') + '.' : 'فروشنده‌ها و خریدارها را انتخاب کنید تا مبلغ به حقشان اضافه/کم شود.' }));
        data.warns.forEach(t => bHouse.appendChild(el('div', { class: 'box warn', text: t })));
      }
    }

    /* ۳) حساب هر نفر و زیرمجموعه‌ها */
    function adjInput(pid) {
      return el('input', { type: 'text', dir: 'ltr', value: (st.adjust[pid] || ''), placeholder: 'مثلاً +2 میلیارد', class: 'adj', 'data-pid': pid, onchange: (e) => {
        if (C.parseAdjust(e.target.value) == null) { App.toast('مبلغ نامعتبر است (مثل +3000000000-500000000)', 'warn'); return; }
        st.adjust[pid] = e.target.value; refresh();
      } });
    }
    function drawPeople() {
      bPeople.innerHTML = '';
      bPeople.appendChild(el('h3', { style: 'margin-top:0', text: '۳) حساب هر نفر' }));
      if (!data) { bPeople.appendChild(el('div', { class: 'box err', text: 'محاسبه ممکن نشد.' })); return; }
      const grid = el('div', { class: 'pgrid', id: 'sum-table' });
      data.groups.forEach(g => {
        const x = g.members.length === 1 && !g.members[0].isSub ? g.members[0] : null;
        const rem = R(g.remaining);
        const lines = [];
        g.parts.forEach(pt => lines.push(el('div', { class: 'ln' }, [el('span', { text: pt.name + ' (' + fa(C.fText(pt.share)) + ')' }), el('b', { text: money(pt.value) })])));
        lines.push(el('div', { class: 'ln sum' }, [el('span', { text: 'جمع حق از زمین‌ها' }), el('b', { text: money(g.entitlement) })]));
        lines.push(el('div', { class: 'ln' }, [el('span', { text: 'خانه‌ی شهر' }), el('b', { class: 'ltr', text: signed(g.house) })]));
        lines.push(el('div', { class: 'ln' }, [el('span', { text: 'سایر (+/−)' }), adjInput(g.root.id)]));
        lines.push(el('div', { class: 'ln sum' }, [el('span', { text: '= اعتبار کل (تومان)' }), el('b', { class: 'cred', text: money(g.credit) })]));
        lines.push(el('div', { class: 'ln' }, [el('span', { text: 'زمین‌های دستش (' + App.n(g.members.reduce((s, m) => s + m.held.length, 0), 0) + ' قطعه)' }), el('b', { text: '− ' + money(g.heldValue) })]));
        lines.push(el('div', { class: 'ln big ' + (rem < 0 ? 'neg' : 'pos') }, [el('span', { text: rem < 0 ? 'کسری (بیش از حق برداشته)' : 'مانده‌ی اعتبار خرید' }), el('b', { class: 'rem', text: money(C.fAbs(g.remaining)) })]));
        const card = el('div', { class: 'pcard', 'data-pid': g.root.id }, [el('h4', { text: g.root.name })].concat(lines));
        // زیرمجموعه‌ها
        const kids = st.persons.filter(p => p.parentId === g.root.id);
        const sub = el('div', { class: 'sub', style: 'margin-top:8px;border-top:1px dashed #bbb;padding-top:6px' });
        sub.appendChild(el('b', { text: 'اعضای این سهم' + (kids.length ? '' : ' (اختیاری)') }));
        if (!kids.length) sub.appendChild(el('div', { class: 'note', text: 'اگر این سهم بین چند نفر خانواده تقسیم می‌شود، عضو اضافه کنید و «تعداد سهم» هر نفر را بنویسید (مثلاً مرد ۲، زن ۱).' }));
        g.members.filter(m => m.isSub).forEach(m => {
          const v = R(m.remaining);
          sub.appendChild(el('div', { class: 'row subrow', 'data-pid': m.person.id, style: 'align-items:center;gap:4px;margin:4px 0' }, [
            el('input', { type: 'text', class: 'sub-name', value: m.person.name, style: 'width:90px', onchange: (e) => { m.person.name = e.target.value || m.person.name; full(); } }),
            el('input', { type: 'text', dir: 'ltr', class: 'sub-share', value: m.person.subShare || '1', style: 'width:44px', title: 'تعداد سهم', onchange: (e) => { const f = C.toFrac(e.target.value); if (!f || C.fSign(f) <= 0) { App.toast('تعداد سهم باید عدد مثبت باشد', 'warn'); return; } m.person.subShare = e.target.value; refresh(); } }),
            el('span', { class: 'note', text: '= ' + fa(C.fText(m.subShare)) + ' · اعتبار ' + money(m.credit) }),
            el('b', { class: v < 0 ? 'neg' : 'pos', text: (v < 0 ? 'کسری ' : 'مانده ') + money(C.fAbs(m.remaining)) }),
            adjInput(m.person.id),
            el('button', { class: 'btn sm dng', text: '✕', title: 'حذف عضو', onclick: () => App.confirm('حذف عضو', 'عضو «' + App.esc(m.person.name) + '» حذف شود؟ زمین‌هایش به عضو دیگر می‌رود.', () => { C.removeSubPerson(st, m.person.id); full(); }, 'حذف') })]));
        });
        const nm = el('input', { type: 'text', class: 'sub-new', placeholder: 'نام عضو', style: 'width:90px' }), sh = el('input', { type: 'text', dir: 'ltr', class: 'sub-new-share', placeholder: 'سهم', value: '1', style: 'width:44px' });
        sub.appendChild(el('div', { class: 'row', style: 'gap:4px;margin-top:4px' }, [nm, sh, el('button', { class: 'btn sm sub-add', text: '＋ عضو', onclick: () => {
          if (!nm.value.trim()) { App.toast('نام عضو را بنویسید', 'warn'); return; }
          const f = C.toFrac(sh.value || '1'); if (!f || C.fSign(f) <= 0) { App.toast('تعداد سهم باید عدد مثبت باشد', 'warn'); return; }
          if (!kids.length) { const a = C.addSubPerson(st, g.root.id, nm.value.trim(), sh.value || '1'); if (a) full(); return; }
          C.addSubPerson(st, g.root.id, nm.value.trim(), sh.value || '1'); full();
        } })].concat(g.members.length > 1 ? [el('button', { class: 'btn sm sec2 sub-fair', text: '⚖ تقسیم عادلانه بین اعضا', onclick: () => { const pl = C.balancePlan(st, { rootId: g.root.id }); if (!pl.ok) { App.toast(pl.error, 'warn'); return; } ui.plan = pl; ui.planRoot = g.root.id; drawAuto(); const a = document.getElementById('auto-box'); if (a) a.scrollIntoView({ behavior: 'smooth' }); } })] : [])));
        card.appendChild(sub);
        grid.appendChild(card);
      });
      bPeople.appendChild(grid);
      bPeople.appendChild(el('div', { class: 'note', text: 'جمع ارزش زمین‌های فهرست تقسیم: ' + money(data.total) + ' تومان — دست کسی نیست: ' + App.n(data.free.length, 0) + ' قطعه (' + money(data.freeValue) + ') — جمع مانده‌ها: ' + signed(data.sumRemaining) }));
    }

    /* ۴) تقسیم خودکار متوازن */
    function drawAuto() {
      bAuto.innerHTML = '';
      bAuto.appendChild(el('h3', { style: 'margin-top:0', text: '۴) تقسیم خودکار و جبران کسری‌ها' }));
      bAuto.appendChild(el('div', { class: 'note', text: 'هدف: ارزش زمین هر نفر تا حد ممکن برابر حقِ نهایی‌اش (اعتبار) شود تا کمترین طلب/بدهی نقدی بماند. زمین‌های قفل‌شده (🔒) هرگز جابه‌جا نمی‌شوند. اول پیش‌نمایش می‌بینید، بعد اعمال می‌کنید.' }));
      const mode = el('select', { id: 'auto-mode' }, [['free', 'فقط زمین‌های آزاد را پخش کن (دست‌ها را عوض نکن)'], ['compensate', 'آزادها + چند جابه‌جایی برای جبران (از پرزمین‌ها به کم‌زمین‌ها)'], ['reset', 'همه‌چیز را از نو تقسیم کن (به‌جز قفل‌ها)']].map(a => el('option', { value: a[0], text: a[1] })));
      mode.value = ui.mode; mode.onchange = () => { ui.mode = mode.value; };
      const mm = el('input', { type: 'text', id: 'auto-max', dir: 'ltr', value: String(ui.maxMoves), style: 'width:50px', onchange: (e) => { ui.maxMoves = Math.max(0, parseInt(e.target.value, 10) || 0); } });
      bAuto.appendChild(el('div', { class: 'row', style: 'align-items:center' }, [el('div', { class: 'grow' }, mode), el('label', { class: 'f' }, [el('span', { text: 'حداکثر جابه‌جایی جبرانی' }), mm]),
        el('button', { class: 'btn', id: 'auto-run', text: '🔍 پیش‌نمایش', onclick: () => { ui.maxMoves = Math.max(0, parseInt(mm.value, 10) || 0); const pl = C.balancePlan(st, { mode: ui.mode, maxMoves: ui.maxMoves }); if (!pl.ok) { App.toast(pl.error, 'warn'); return; } ui.plan = pl; ui.planRoot = ''; drawAuto(); } })]));
      const pl = ui.plan;
      if (pl && pl.ok) {
        const before = data, after = pl.after, tb = el('tbody');
        after.people.forEach(a => {
          const b = before.people.find(x => x.person.id === a.person.id);
          if (ui.planRoot && a.root.id !== ui.planRoot) return;
          tb.appendChild(el('tr', null, [el('td', { text: a.person.name }), el('td', { text: money(a.credit) }), el('td', { text: money(b.heldValue) }), el('td', { class: R(b.remaining) < 0 ? 'neg' : 'pos', text: signed(b.remaining) }), el('td', { text: money(a.heldValue) }), el('td', { class: 'rem-after ' + (R(a.remaining) < 0 ? 'neg' : 'pos'), text: signed(a.remaining) })]));
        });
        let sb = C.frac(0), sa = C.frac(0); before.people.forEach(x => { sb = C.fAdd(sb, C.fAbs(x.remaining)); }); after.people.forEach(x => { sa = C.fAdd(sa, C.fAbs(x.remaining)); });
        bAuto.appendChild(el('div', { class: 'box info', id: 'auto-sum', text: 'پیش‌نمایش: ' + App.n(pl.moves.length, 0) + ' زمین جابه‌جا/ثبت می‌شود. جمع |مانده‌ها| از ' + money(sb) + ' به ' + money(sa) + ' تومان می‌رسد.' }));
        bAuto.appendChild(el('div', { class: 'scroll' }, el('table', { class: 't', id: 'auto-table' }, [el('thead', null, el('tr', null, ['شخص', 'اعتبار', 'زمین فعلی', 'مانده فعلی', 'زمین بعد از طرح', 'مانده بعد از طرح'].map(h => el('th', { text: h })))), tb])));
        if (pl.moves.length) bAuto.appendChild(el('details', null, [el('summary', { text: 'فهرست جابه‌جایی‌ها' }), el('ul', { class: 'hist' }, pl.moves.map(m => { const p = st.parcels.find(x => x.id === m.parcelId); return el('li', { text: (p ? p.name : m.parcelId) + ' (' + App.n(m.value, 0) + '): ' + (m.from ? pName(m.from) : 'آزاد') + ' ← ' + pName(m.to) }); }))]));
        if (after.settlement.length) bAuto.appendChild(el('div', { class: 'note', text: 'تسویه‌ی نقدی باقی‌مانده بعد از طرح: ' + after.settlement.map(s => pName(s.from) + ' → ' + pName(s.to) + ': ' + money(s.amount)).join('، ') }));
        bAuto.appendChild(el('div', { class: 'row' }, [el('button', { class: 'btn', id: 'auto-apply', text: '✔ اعمال طرح', onclick: () => { C.applyPlan(st, pl); ui.plan = null; full(); App.toast('طرح اعمال شد', 'ok'); } }), el('button', { class: 'btn sec2', text: 'انصراف', onclick: () => { ui.plan = null; drawAuto(); } })]));
      }
      if (data && data.settlement.length) bAuto.appendChild(el('div', { class: 'note', id: 'settle-now', text: 'تسویه‌ی نقدی فعلی (بدهکار → بستانکار): ' + data.settlement.map(s => pName(s.from) + ' → ' + pName(s.to) + ': ' + money(s.amount)).join('، ') }));
    }

    /* ۵) لیست زمین‌ها */
    function numIn(cls, val, onset, w) {
      return el('input', { type: 'text', inputmode: 'decimal', dir: 'ltr', class: cls, value: val, style: 'width:' + (w || 84) + 'px', onchange: (e) => { const v = App.num(e.target.value); if (v == null || v < 0) { App.toast('عدد معتبر بنویسید', 'warn'); markRows(); return; } onset(v); } });
    }
    function drawPick() {
      bPick.innerHTML = '';
      bPick.appendChild(el('h3', { style: 'margin-top:0', text: '۵) زمین‌ها: مساحت، قیمت، دسته و «دست کی است»' }));
      bPick.appendChild(el('div', { class: 'note', text: 'ارزش هر زمین همیشه «مساحت × قیمت هر متر» است؛ هر کدام را اینجا عوض کنید همه‌ی عددهای صفحه فوراً دوباره حساب می‌شود. 🔒 یعنی این زمین برای همان نفر ثبت شده و تقسیم خودکار و دیگران دست نمی‌زنند. تیک «در تقسیم» را بردارید تا این زمین از تقسیم بیرون بماند.' }));
      const q = el('input', { type: 'search', id: 'pick-q', placeholder: 'جست‌وجوی نام زمین…', value: ui.q });
      const tree = C.personTree(st);
      const flt = el('select', { id: 'pick-flt' }, [['all', 'همه'], ['free', 'فقط آزادها'], ['buyable', 'قابل برداشتن'], ['locked', 'قفل‌شده‌ها'], ['out', 'بیرون از تقسیم']].concat(tree.leaves.map(p => ['p:' + p.id, 'دست ' + p.name])).map(a => el('option', { value: a[0], text: a[1] })));
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
        const touch = () => {            // ارزش ثبت‌شده را با مساحت و قیمت زنده هم‌رنگ می‌کنیم (قیمت را از تنظیمات دوباره نمی‌خوانیم تا زیر دست کاربر عوض نشود)
          const lv = L(p); p.valuation = Object.assign({}, p.valuation || {}, { area: lv.area, pricePerM2: lv.price, total: lv.total }); p.updatedAt = C.nowIso(); refresh(); };
        const area = numIn('in-area', '', (v) => { p.areaOverride = v > 0 ? v : null; touch(); }, 78);
        const price = numIn('in-price', '', (v) => { p.pricing = p.pricing || {}; p.pricing.override = v; touch(); }, 92);
        const lock = el('input', { type: 'checkbox', class: 'lock', title: 'قفل', onchange: (e) => { p.locked = e.target.checked; refresh(); } });
        const inp = el('input', { type: 'checkbox', class: 'inpool', title: 'در تقسیم', onchange: (e) => {
          const pl = st.pool = st.pool || {}; pl.off = (pl.off || []).filter(x => x !== p.id); pl.on = (pl.on || []).filter(x => x !== p.id);
          if (e.target.checked) { if (!C.inPool(st, p)) pl.on.push(p.id); } else if (C.inPool(st, p)) pl.off.push(p.id);
          refresh();
        } });
        const del = el('button', { class: 'btn sm dng del', text: '🗑', title: 'حذف زمین', onclick: () => App.confirm('حذف زمین', 'زمین «' + App.esc(p.name || p.id) + '» برای همیشه حذف شود؟', () => { C.removeParcel(st, p.id); full(); }, 'حذف') });
        const rw = el('div', { class: 'prow', 'data-pid': p.id }, [
          el('div', { class: 'pn' }, [el('b', { text: p.name || p.id })]),
          el('label', { class: 'mini' }, [el('span', { text: 'متر' }), area]), el('label', { class: 'mini' }, [el('span', { text: 'قیمت هر متر' }), price]),
          el('div', { class: 'mini' }, [el('span', { text: 'ارزش' }), el('b', { class: 'pv' })]),
          el('label', { class: 'mini' }, [el('span', { text: 'دسته' }), dSel]), el('label', { class: 'mini' }, [el('span', { text: 'دست کی' }), hSel]),
          el('label', { class: 'mini' }, [el('span', { text: '🔒' }), lock]), el('label', { class: 'mini' }, [el('span', { text: 'در تقسیم' }), inp]), del,
          el('span', { class: 'tag' }),
        ]);
        rows[p.id] = { el: rw, hSel, p, area, price, lock, inp };
        list.appendChild(rw);
      });
      bPick.appendChild(list);
      const apply = () => { ui.q = q.value; ui.flt = flt.value; markRows(); };
      q.addEventListener('input', apply); flt.addEventListener('change', apply);
    }
    function markRows() {
      const tree = C.personTree(st), qq = (ui.q || '').trim(), buy = C.buyerIds(st);
      st.parcels.forEach(p => {
        const rw = rows[p.id]; if (!rw) return;
        const cur = C.holderOfParcel(st, p, tree), lv = L(p);
        rw.hSel.innerHTML = '';
        [['', '— آزاد (دست هیچ‌کس) —']].concat(tree.leaves.map(x => [x.id, (tree.rootOf[x.id] !== x.id ? pName(tree.rootOf[x.id]) + ' / ' : '') + x.name])).forEach(o => {
          const op = el('option', { value: o[0], text: o[1] });
          if (o[0] && !C.canTake(st, p.id, o[0]).ok) { op.disabled = true; op.textContent = o[1] + ' (ممکن نیست)'; }
          rw.hSel.appendChild(op);
        });
        rw.hSel.value = cur;
        const buyable = !cur || buy.indexOf(tree.rootOf[cur]) >= 0;
        const tag = rw.el.querySelector('.tag');
        tag.textContent = cur ? (buyable ? 'دست خریدار خانه — قابل برداشتن' : 'دست ' + pName(cur)) : 'آزاد';
        tag.className = 'tag ' + (cur ? (buyable ? 'sell' : 'own') : 'free');
        rw.el.querySelector('.pv').textContent = App.n(lv.total, 0);
        const setIf = (inp, v) => { if (document.activeElement !== inp) inp.value = String(Math.round(v * 100) / 100); };
        setIf(rw.area, lv.area); setIf(rw.price, lv.price);
        rw.lock.checked = !!p.locked; rw.inp.checked = C.inPool(st, p);
        rw.el.classList.toggle('outpool', !rw.inp.checked);
        const dsel = rw.el.querySelector('.est-sel'); if (dsel && dsel.value !== (p.estateId || '')) dsel.value = p.estateId || '';
        let ok = true;
        if (qq && (p.name || '').indexOf(qq) < 0) ok = false;
        if (ui.flt === 'free' && cur) ok = false;
        if (ui.flt === 'buyable' && !buyable) ok = false;
        if (ui.flt === 'locked' && !p.locked) ok = false;
        if (ui.flt === 'out' && rw.inp.checked) ok = false;
        if (ui.flt.indexOf('p:') === 0 && cur !== ui.flt.slice(2)) ok = false;
        rw.el.style.display = ok ? '' : 'none';
      });
    }

    /* ۶) لیست نهایی هر نفر + دانلودها */
    function drawRes() {
      bRes.innerHTML = '';
      bRes.appendChild(el('h3', { style: 'margin-top:0', text: '۶) لیست نهایی زمین‌های هر نفر' }));
      if (!data) return;
      bRes.appendChild(el('div', { class: 'row' }, [
        el('button', { class: 'btn', text: '🖨 چاپ همه', onclick: () => App.printHtml(sheetHtml(data, st)) }),
        el('button', { class: 'btn sec2', id: 'dl-html', text: '💾 برگه‌ی همه (HTML)', onclick: () => App.download('تقسیم-زمین‌ها.html', App.sheetDoc('تقسیم زمین‌ها', sheetHtml(data, st)), 'text/html') }),
        el('button', { class: 'btn sec2', id: 'dl-xlsx', text: '📊 اکسل همه', onclick: () => exportXlsx(data, st) }),
        el('button', { class: 'btn sec2', id: 'dl-zip', text: '🗜 فایل جدا برای هر نفر (ZIP)', onclick: () => exportZip(data, st) }),
        el('button', { class: 'btn sec2', text: '📋 کپی متن', onclick: () => copyText(textOf(data)) })]));
      data.people.forEach(x => {
        const pct = R(C.fDiv(C.fMul(x.heldValue, C.frac(10000)), C.fSign(data.total) > 0 ? data.total : C.frac(1))) / 100;
        const w = el('div', { class: 'card', 'data-pid': x.person.id, style: 'break-inside:avoid' });
        w.appendChild(el('h4', { style: 'margin:0 0 6px', text: personTitle(x, st) + ' — ' + App.n(x.held.length, 0) + ' قطعه، ' + App.n(x.heldArea, 0) + ' م²، ارزش ' + money(x.heldValue) + ' تومان (' + App.n(pct, 2) + '٪ از کل)' }));
        if (x.held.length) w.appendChild(el('table', { class: 't' }, [el('thead', null, el('tr', null, ['#', 'زمین', 'دسته', 'مساحت', 'قیمت هر متر', 'ارزش'].map(h => el('th', { text: h })))),
          el('tbody', null, x.held.map((p, i) => { const lv = L(p); return el('tr', null, [el('td', { text: App.n(i + 1, 0) }), el('td', { class: 'l', text: p.name }), el('td', { text: catNameOf(st, p) }), el('td', null, el('input', { type: 'text', inputmode: 'decimal', dir: 'ltr', class: 'final-area', value: String(Math.round(lv.area * 100) / 100), style: 'width:84px', onchange: (e) => { const v = App.num(e.target.value); if (v == null || !(v > 0)) { App.toast('متراژ باید عددی بزرگ‌تر از صفر باشد', 'warn'); e.target.value = String(lv.area); return; } p.areaOverride = v; const n2 = L(p); p.valuation = Object.assign({}, p.valuation || {}, { area: n2.area, pricePerM2: n2.price, total: n2.total }); p.updatedAt = C.nowIso(); refresh(); } })), el('td', { text: App.n(lv.price, 0) }), el('td', { text: App.n(lv.total, 0) })]); }))]));
        else w.appendChild(el('div', { class: 'note', text: 'زمینی دستش نیست.' }));
        const v = R(x.remaining);
        w.appendChild(el('div', { class: v < 0 ? 'neg' : 'pos', text: 'اعتبار ' + money(x.credit) + ' − زمین‌ها ' + money(x.heldValue) + ' = ' + (v < 0 ? 'کسری ' : 'مانده ') + money(C.fAbs(x.remaining)) + ' تومان' }));
        w.appendChild(el('div', { class: 'row', style: 'margin-top:6px' }, [
          el('button', { class: 'btn sm sec2 dl-p-html', text: '💾 برگه‌ی ' + x.person.name, onclick: () => App.download('زمین‌های-' + x.person.name + '.html', App.sheetDoc('زمین‌های ' + x.person.name, personHtml(x, st)), 'text/html') }),
          el('button', { class: 'btn sm sec2 dl-p-xlsx', text: '📊 اکسل ' + x.person.name, onclick: () => App.downloadBlob('زمین‌های-' + x.person.name + '.xlsx', new Blob([personXlsx(x, st)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })) })]));
        bRes.appendChild(w);
      });
      if (data.free.length) bRes.appendChild(el('div', { class: 'box info', text: 'زمین‌های آزاد (دست کسی نیست): ' + data.free.map(p => p.name).join('، ') }));
      if (data.settlement.length) bRes.appendChild(el('div', { class: 'box info', text: 'تسویه‌ی نقدی: ' + data.settlement.map(s => pName(s.from) + ' ← ' + pName(s.to) + ' ' + money(s.amount)).join('؛ ') }));
    }

    /* ۷) بازرسی */
    function drawAudit() {
      bAud.innerHTML = '';
      bAud.appendChild(el('h3', { style: 'margin-top:0', text: '۷) بازرسی محاسبات' }));
      const items = C.auditState(st);
      const bad = items.filter(x => x.level === 'err').length, warn = items.filter(x => x.level === 'warn').length;
      bAud.appendChild(el('div', { class: 'box ' + (bad ? 'err' : warn ? 'warn' : 'ok'), id: 'audit-sum', text: bad ? bad + ' خطا و ' + warn + ' هشدار' : warn ? 'خطایی نیست؛ ' + warn + ' هشدار' : 'همه‌چیز درست است' }));
      items.forEach(x => bAud.appendChild(el('div', { class: 'ln audit-' + x.level, text: (x.level === 'ok' ? '✔ ' : x.level === 'warn' ? '⚠ ' : '✘ ') + x.msg.replace(/^[✔✘] /, '') })));
      if (items.some(x => x.fix === 'recalc')) bAud.appendChild(el('button', { class: 'btn sm sec2', id: 'audit-fix', text: 'همسان‌سازی ارزش‌های ثبت‌شده با متراژ × قیمت', onclick: () => { C.recalcAllValuations(st); full(); } }));
    }

    /* ۶) ارسال و دریافت انتخاب شرکا */
    const b64e = (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o))));
    const b64d = (t) => JSON.parse(decodeURIComponent(escape(atob(t))));
    function drawCode() {
      bCode.innerHTML = '';
      bCode.appendChild(el('h3', { style: 'margin-top:0', text: '۸) ارسال انتخاب من / دریافت انتخاب شرکا' }));
      bCode.appendChild(el('div', { class: 'note', text: 'انتخاب‌های هرکس روی گوشی خودش می‌ماند. شریک «کد انتخاب» می‌سازد و می‌فرستد؛ نسخه‌ی اصلی آن را اینجا وارد می‌کند تا زمین‌های او ثبت شود.' }));
      const who = el('select', { id: 'code-who' }, C.personTree(st).roots.map(x => el('option', { value: x.id, text: x.name })));
      const out = el('textarea', { id: 'code-out', readonly: true, style: 'min-height:60px;direction:ltr;font-size:11px', placeholder: 'کد اینجا ساخته می‌شود' });
      bCode.appendChild(el('div', { class: 'f' }, [el('span', { text: 'من کیستم؟' }), who]));
      bCode.appendChild(el('div', { class: 'row' }, [
        el('button', { class: 'btn', id: 'code-make', text: 'ساخت کد انتخاب من', onclick: () => {
          const x = data && data.groups.find(q => q.root.id === who.value); if (!x) return;
          out.value = 'ZY2:' + b64e({ v: 2, who: x.root.name, at: C.nowIso(), credit: R(x.creditAll), picks: [].concat(...x.members.map(m => m.held)).map(p => [p.name, L(p).total]) });
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
        const person = C.personTree(st).roots.find(p => p.name === d.who) || st.persons.find(p => p.name === d.who);
        if (!person) { rep.appendChild(el('div', { class: 'box err', text: 'شخص «' + d.who + '» در این نسخه نیست.' })); return; }
        const warns = []; let n = 0;
        const names = (d.picks || []).map(x => x[0]);
        st.parcels.forEach(p => { if (C.personTree(st).rootOf[p.holderId] === person.id && names.indexOf(p.name) < 0) { p.holderId = null; warns.push('«' + p.name + '» آزاد شد'); } });
        (d.picks || []).forEach(pk => {
          const pc = st.parcels.find(p => p.name === pk[0]);
          if (!pc) { warns.push('زمین «' + pk[0] + '» پیدا نشد'); return; }
          if (L(pc).total !== Math.round(pk[1])) warns.push('ارزش «' + pk[0] + '» با نسخه‌ی شریک فرق دارد');
          const res = C.setHolder(st, pc.id, C.personTree(st).leafIds[person.id] ? person.id : (C.personTree(st).kids[person.id] || [{ id: person.id }])[0].id);
          if (!res.ok) warns.push('«' + pc.name + '»: ' + res.reason); else n++;
        });
        const mine = ev().groups.find(x => x.root.id === person.id);
        if (mine && Math.abs(R(mine.creditAll) - d.credit) > 1) warns.push('اعتبار او در نسخه‌ی شریک ' + App.n(d.credit, 0) + ' بوده و در نسخه‌ی شما ' + money(mine.creditAll) + ' است');
        st.received[person.id] = { at: d.at || C.nowIso(), n, warn: warns.join('؛ ') };
        rep.appendChild(el('div', { class: 'box ' + (warns.length ? 'warn' : 'ok'), text: person.name + ': ' + App.n(n, 0) + ' زمین ثبت شد' + (warns.length ? ' — ' + warns.join('؛ ') : '') }));
      });
    }

    /* ۷) اشخاص */
    function drawPersons() {
      bPer.innerHTML = '';
      bPer.appendChild(el('h3', { style: 'margin-top:0', text: '۹) اشخاص' }));
      C.personTree(st).roots.forEach(p => bPer.appendChild(el('div', { class: 'row', style: 'margin:3px 0' }, [
        el('input', { type: 'text', value: p.name, class: 'grow', onchange: (e) => { p.name = e.target.value || p.name; full(); } }),
        el('button', { class: 'btn sm dng', text: 'حذف', onclick: () => App.confirm('حذف شخص', '«' + App.esc(p.name) + '» و سهم‌ها و زمین‌های دستش حذف شود؟', () => { C.removePerson(st, p.id); full(); }, 'حذف') })])));
      const nm = el('input', { type: 'text', placeholder: 'نام شخص تازه', id: 'per-new' });
      bPer.appendChild(el('div', { class: 'row', style: 'margin-top:8px' }, [el('div', { class: 'grow' }, nm), el('button', { class: 'btn', id: 'per-add', text: 'افزودن', onclick: () => { if (!nm.value.trim()) { App.toast('نام را بنویسید', 'warn'); return; } C.addPerson(st, nm.value.trim(), 1); full(); } })]));
    }

    data = ev();
    drawStrip(); drawPool(); drawCat(); drawHouse(); drawPeople(); drawAuto(); drawPick(); markRows(); drawRes(); drawAudit(); drawCode(); drawPersons();
    [strip, bPool, bCat, bHouse, bPeople, bAuto, bPick, bRes, bAud, bCode, bPer].forEach(b => r.appendChild(b));
  }

  /* ---------- خروجی‌ها ---------- */
  function personTitle(x, st) { return x.isSub ? x.root.name + ' / ' + x.person.name : x.person.name; }
  function textOf(d) {
    const st = S();
    const T = [ 'ارزش کل زمین‌های فهرست تقسیم: ' + money(d.total) + ' تومان', ''];
    d.cats.forEach(c => T.push('دسته‌ی ' + c.name + ': ' + c.count + ' زمین — ' + money(c.value) + ' تومان'));
    T.push('');
    d.people.forEach(x => {
      T.push('■ ' + personTitle(x, st) + ' — حق: ' + money(x.entitlement) + ' | خانه‌ی شهر: ' + signed(x.house) + (R(x.adjust) ? ' | سایر: ' + signed(x.adjust) : '') + ' | اعتبار: ' + money(x.credit));
      x.held.forEach((p, i) => { const lv = L(p); T.push('  ' + App.n(i + 1, 0) + ') ' + p.name + ' — ' + App.n(lv.area, 0) + ' م² × ' + App.n(lv.price, 0) + ' = ' + App.n(lv.total, 0) + ' تومان'); });
      T.push('  جمع زمین‌ها: ' + money(x.heldValue) + ' — ' + (R(x.remaining) < 0 ? 'کسری: ' : 'مانده: ') + money(C.fAbs(x.remaining)) + ' تومان', '');
    });
    if (d.free.length) T.push('آزاد: ' + d.free.map(p => p.name).join('، '));
    return T.join('\n');
  }
  function copyText(t) {
    const ok = () => App.toast('کپی شد', 'ok');
    const fb = () => { const ta = el('textarea', { style: 'position:fixed;top:0;left:0;opacity:.01' }); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); ok(); } catch (e) { App.modal({ title: 'متن را کپی کنید', body: el('textarea', { style: 'min-height:200px', value: t }) }); } ta.remove(); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok, fb); else fb();
  }
  function heldTable(x, st) {
    const E = App.esc;
    return x.held.length ? '<table><thead><tr><th>#</th><th class="l">زمین</th><th>دسته</th><th>مساحت (م²)</th><th>قیمت هر متر</th><th>ارزش (تومان)</th></tr></thead><tbody>' + x.held.map((p, i) => { const lv = L(p); return '<tr><td>' + App.n(i + 1, 0) + '</td><td class="l">' + E(p.name) + '</td><td>' + E(catNameOf(st, p)) + '</td><td>' + App.n(lv.area, 0) + '</td><td>' + App.n(lv.price, 0) + '</td><td>' + App.n(lv.total, 0) + '</td></tr>'; }).join('') + '<tr><th colspan="3">جمع</th><th>' + App.n(x.heldArea, 0) + '</th><th></th><th>' + money(x.heldValue) + '</th></tr></tbody></table>' : '<div class="note">زمینی ندارد.</div>';
  }
  function personHtml(x, st) {
    const E = App.esc, v = R(x.remaining);
    return '<h1>زمین‌های ' + E(personTitle(x, st)) + '</h1><div class="note">حق از زمین‌ها: ' + money(x.entitlement) + ' | خانه‌ی شهر: ' + signed(x.house) + ' | سایر: ' + signed(x.adjust) + ' | اعتبار کل: ' + money(x.credit) + ' تومان</div>' + heldTable(x, st) +
      '<div class="' + (v < 0 ? 'neg' : 'pos') + '">اعتبار ' + money(x.credit) + ' − زمین‌ها ' + money(x.heldValue) + ' = ' + (v < 0 ? 'کسری ' : 'مانده ') + money(C.fAbs(x.remaining)) + ' تومان</div>';
  }
  function sheetHtml(d, st) {
    const E = App.esc;
    let h = '<h1>تقسیم زمین‌ها</h1><div class="note">ارزش کل: ' + money(d.total) + ' تومان</div>';
    h += '<h2>دسته‌ها</h2><table><thead><tr><th class="l">دسته</th><th>زمین</th><th>ارزش (تومان)</th></tr></thead><tbody>' + d.cats.map(c => '<tr><td class="l">' + E(c.name) + '</td><td>' + App.n(c.count, 0) + '</td><td>' + money(c.value) + '</td></tr>').join('') + '</tbody></table>';
    h += '<h2>حساب هر نفر</h2><table><thead><tr><th class="l">شخص</th><th>حق از زمین‌ها</th><th>خانه‌ی شهر</th><th>سایر</th><th>اعتبار</th><th>ارزش زمین‌های دستش</th><th>مانده / کسری</th></tr></thead><tbody>' +
      d.people.map(x => '<tr><td class="l">' + E(personTitle(x, st)) + '</td><td>' + money(x.entitlement) + '</td><td>' + signed(x.house) + '</td><td>' + signed(x.adjust) + '</td><td>' + money(x.credit) + '</td><td>' + money(x.heldValue) + '</td><td class="' + (R(x.remaining) < 0 ? 'neg' : 'pos') + '">' + (R(x.remaining) < 0 ? 'کسری ' : 'مانده ') + money(C.fAbs(x.remaining)) + '</td></tr>').join('') + '</tbody></table>';
    d.people.forEach(x => { h += '<div class="person"><h3>' + E(personTitle(x, st)) + ' — ' + money(x.heldValue) + ' تومان، ' + App.n(x.heldArea, 0) + ' م²</h3>' + heldTable(x, st) + '</div>'; });
    return h;
  }
  function personSheet(x, st) {
    const rows = [['زمین', 'دسته', 'مساحت (م²)', 'قیمت هر متر', 'ارزش (تومان)']];
    x.held.forEach(p => { const lv = L(p); rows.push([p.name, catNameOf(st, p), Math.round(lv.area * 100) / 100, lv.price, lv.total]); });
    rows.push(['جمع', '', Math.round(x.heldArea), '', R(x.heldValue)], [], ['حق از زمین‌ها', R(x.entitlement)], ['خانه‌ی شهر', R(x.house)], ['سایر', R(x.adjust)], ['اعتبار کل', R(x.credit)], ['ارزش زمین‌های دستش', R(x.heldValue)], ['مانده (+) / کسری (−)', R(x.remaining)]);
    return XLSX.utils.aoa_to_sheet(rows);
  }
  function personXlsx(x, st) {
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, personSheet(x, st), 'زمین‌ها');
    return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  }
  function summarySheet(d, st) {
    const sum = [['شخص', 'حق از زمین‌ها', 'خانه‌ی شهر', 'سایر', 'اعتبار', 'ارزش زمین‌های دستش', 'مانده (+) / کسری (−)']];
    d.people.forEach(x => sum.push([personTitle(x, st), R(x.entitlement), R(x.house), R(x.adjust), R(x.credit), R(x.heldValue), R(x.remaining)]));
    return XLSX.utils.aoa_to_sheet(sum);
  }
  function exportXlsx(d, st) {
    if (!window.XLSX) { App.toast('کتابخانه‌ی اکسل بارگذاری نشده', 'err'); return; }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, summarySheet(d, st), 'خلاصه');
    const lst = [['شخص', 'زمین', 'دسته', 'مساحت (م²)', 'قیمت هر متر', 'ارزش (تومان)']];
    d.people.forEach(x => { x.held.forEach(p => { const lv = L(p); lst.push([personTitle(x, st), p.name, catNameOf(st, p), Math.round(lv.area * 100) / 100, lv.price, lv.total]); }); lst.push([personTitle(x, st) + ' — جمع', '', '', Math.round(x.heldArea), '', R(x.heldValue)]); });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(lst), 'لیست نهایی');
    App.downloadBlob('تقسیم-زمین‌ها.xlsx', new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  }
  async function exportZip(d, st) {
    if (!window.JSZip || !window.XLSX) { App.toast('کتابخانه‌ی فشرده‌سازی بارگذاری نشده', 'err'); return; }
    const z = new JSZip();
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, summarySheet(d, st), 'خلاصه');
    z.file('خلاصه.xlsx', XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
    z.file('همه.html', App.sheetDoc('تقسیم زمین‌ها', sheetHtml(d, st)));
    d.people.forEach((x, i) => { const nm = (i + 1) + '-' + personTitle(x, st).replace(/[\\/:*?"<>|]/g, '_'); z.file(nm + '.html', App.sheetDoc('زمین‌های ' + personTitle(x, st), personHtml(x, st))); z.file(nm + '.xlsx', personXlsx(x, st)); });
    App.downloadBlob('زمین‌های-هر-نفر.zip', await z.generateAsync({ type: 'blob' }));
  }

  App.share = { render, textOf, R };
  App.on('tab', (t) => { if (t === 'people') render(); });
  App.on('state', () => { if (App.curTab === 'people') render(); });
})();
