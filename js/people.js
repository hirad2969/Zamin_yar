/* صفحه‌ی تقسیم زنده — انتخاب همه/زیرمجموعه، محاسبه‌ی جاری، تخصیص، خانواده و خروجی */
(function () {
  'use strict';
  const App = window.App, C = App.C, el = App.el, fa = App.fa;
  const root = () => document.getElementById('people-root');
  const S = () => App.S;
  const ui = { q: '', flt: 'all' };

  function R(f) {
    if (f == null) return 0;
    if (typeof f === 'number') return Math.round(f);
    if (!f || typeof f.n !== 'bigint') return 0;
    const neg = f.n < 0n, n = neg ? -f.n : f.n;
    const q = (2n * n + f.d) / (2n * f.d);
    return Number(neg ? -q : q);
  }
  const money = (f) => App.n(R(f), 0);
  const signed = (f) => { const v = R(f); return (v > 0 ? '+' : v < 0 ? '−' : '') + App.n(Math.abs(v), 0); };
  const pName = (id) => { const p = (S().persons || []).find(x => x.id === id); return p ? p.name : '—'; };
  const liveV = (p) => C.currentValuation ? C.currentValuation(p, S().settings) : (p.valuation || {});
  function selectedIds() { return C.divisionParcelIds(S(), S().divisionSelection); }
  function ev() {
    try { const x = C.normalizeDivisionSelection(S(), S().divisionSelection); return C.divisionLive(S(), { parcelIds: selectedIds(), includeUnclassified: x.includeUnclassified }); }
    catch (e) { console.error(e); return null; }
  }
  function save() { App.save(); }
  function safeFile(s) { return String(s || 'زمین').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, '-').slice(0, 80); }

  function selectionLabel() {
    const n = selectedIds().length, total = S().parcels.length;
    return App.n(n, 0) + ' از ' + App.n(total, 0) + ' زمین انتخاب شده است';
  }
  function checkbox(label, checked, id, onchange, cls) {
    return el('label', { class: cls || 'checkline' }, [el('input', { type: 'checkbox', id, checked: checked ? true : null, onchange }), el('span', { text: label })]);
  }

  function render() {
    const r = root(); r.innerHTML = '';
    const st = S();
    st.house = st.house || { amount: '', receivers: [], payer: '' };
    st.adjust = st.adjust || {};
    st.familySplits = st.familySplits || {};
    if (!st.divisionSelection) st.divisionSelection = { mode: 'all', scopes: [], grades: [], types: [], estates: [], ids: null, excludedIds: [], includeUnclassified: true };

    r.appendChild(el('h2', { text: 'تقسیم زمین‌ها' }));
    r.appendChild(el('div', { class: 'note', text: 'همه‌ی عددها هر بار از متراژ جاری و نرخ جاری هر زمین با ماشین‌حساب دقیق به‌دست می‌آیند. «همه» به‌صورت پیش‌فرض فعال است؛ برای محاسبه‌ی جداگانه می‌توانید فیلتر بزنید یا حتی یک زمین را بردارید.' }));
    const strip = el('div', { id: 'strip-box', class: 'strip' });
    const bSelect = el('div', { class: 'card division-select-card', id: 'division-selection' });
    const bAuto = el('div', { class: 'card auto-policy-card', id: 'auto-box' });
    const bCat = el('div', { class: 'card', id: 'cat-box' });
    const bHouse = el('div', { class: 'card', id: 'house-box' });
    const bPeople = el('div', { class: 'card', id: 'sum-box' });
    const bPick = el('div', { class: 'card', id: 'pick-box' });
    const bRes = el('div', { class: 'card', id: 'res-box' });
    const bFamily = el('div', { class: 'card', id: 'family-box' });
    const bCode = el('div', { class: 'card', id: 'code-box' });
    const bPer = el('div', { class: 'card', id: 'persons-box' });
    let data = null;
    const rows = {};

    const refresh = () => { save(); data = ev(); drawStrip(); drawSelection(); drawAuto(); drawCat(); drawPeople(); drawHouse(); drawPick(); drawRes(); drawFamily(); markRows(); };
    const full = () => { save(); render(); };
    function editFinalArea(p, raw) {
      // divisionLive برای ایمنی، زمین‌های دست هر شخص را به شکل shallow copy
      // برمی‌گرداند؛ ویرایش نهایی باید حتماً روی زمین اصلی پروژه اعمال شود.
      const target = st.parcels.find(q => q.id === p.id) || p;
      const text = String(raw == null ? '' : raw).trim();
      if (!text) target.areaOverride = null;
      else { const n = App.num(text); if (!(n > 0) || !isFinite(n)) { App.toast('متراژ باید عددی بزرگ‌تر از صفر باشد.', 'warn'); return false; } target.areaOverride = n; }
      C.applyValuation(target, st.settings, 'اصلاح متراژ از فهرست نهایی تقسیم'); save(); App.emit('state'); return true;
    }

    function drawStrip() {
      strip.innerHTML = '';
      if (!data) return;
      data.people.forEach(x => {
        const v = R(x.remaining);
        strip.appendChild(el('span', { class: 'chip ' + (v < 0 ? 'neg' : 'pos'), 'data-pid': x.person.id }, [el('b', { text: x.person.name + ': ' }), (v < 0 ? 'کسری ' : 'مانده ') + App.n(Math.abs(v), 0)]));
      });
    }

    function resetAll() {
      C.setDivisionSelection(st, { mode: 'all', scopes: [], grades: [], types: [], estates: [], ids: null, excludedIds: [], includeUnclassified: true });
      full();
    }
    function typeOptions() {
      const m = new Map();
      (st.parcels || []).forEach(p => { const k = C.divisionTypeKey ? C.divisionTypeKey(p) : String(p.scope || 'unknown'); if (!m.has(k)) m.set(k, C.divisionTypeLabel ? C.divisionTypeLabel(p) : k); });
      return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1], 'fa'));
    }
    function facetValues(field) {
      if (field === 'scopes') return Object.keys(C.SCOPES || {});
      if (field === 'grades') return ['grade1', 'grade2', 'grade3', 'manual'];
      if (field === 'types') return typeOptions().map(x => x[0]);
      return (st.estates || []).map(ea => String(ea.id)).concat(['']);
    }
    function toggleFacet(field, value, checked) {
      const x = C.normalizeDivisionSelection(st, st.divisionSelection);
      const wasAll = x.mode === 'all' && !x.scopes.length && !x.grades.length && !x.types.length && !x.estates.length;
      x.mode = 'filters'; x.ids = null; x.excludedIds = [];
      const v = String(value), all = facetValues(field);
      let a = x[field] || [];
      const none = a.length === all.length && all.every(q => a.indexOf(q) >= 0);
      // در حالت پیش‌فرض هر گزینه واقعاً تیک‌خورده دیده می‌شود؛ با برداشتن
      // اولین گزینه، فهرست همان گروه را صریحاً به «همه به‌جز آن» تبدیل می‌کنیم.
      if (none && checked) a = [v];
      else if (wasAll && !checked) a = all.filter(q => q !== v);
      else if (checked) a = a.concat(a.indexOf(v) < 0 ? [v] : []);
      else a = a.filter(q => q !== v);
      // آرایه‌ی خالی یعنی «همه»؛ برای «هیچ گزینه» آرایه‌ی کامل را نگه می‌داریم.
      if (!checked && !a.length && all.length) a = all.slice();
      const fullSet = a.length === all.length && all.every(q => a.indexOf(q) >= 0);
      // مجموعه‌ی کامل هنگام روشن‌کردن آخرین گزینه همان «بدون فیلتر» است.
      x[field] = checked && fullSet ? [] : a;
      if (!x.scopes.length && !x.grades.length && !x.types.length && !x.estates.length) x.mode = 'all';
      C.setDivisionSelection(st, x); full();
    }
    function toggleParcel(id, checked) {
      const x = C.normalizeDivisionSelection(st, st.divisionSelection);
      const cur = new Set(C.divisionParcelIds(st, x).map(String));
      const sid = String(id);
      if (x.mode !== 'custom') { x.mode = 'custom'; x.ids = Array.from(cur); x.excludedIds = []; }
      const set = new Set((x.ids || []).map(String));
      if (checked) set.add(sid); else set.delete(sid);
      x.ids = Array.from(set); C.setDivisionSelection(st, x); full();
    }
    function drawSelection() {
      bSelect.innerHTML = '';
      bSelect.appendChild(el('h3', { style: 'margin-top:0', text: '۱) محدوده‌ی محاسبه — همه یا انتخابی' }));
      bSelect.appendChild(el('div', { class: 'note', text: 'تیک «همه» پیش‌فرض است و با اضافه‌شدن زمین جدید هم فعال می‌ماند. با انتخاب چند فیلتر، تقاطع فیلترها محاسبه می‌شود؛ فهرست موردی پایین اجازه می‌دهد هر زمین را جداگانه اضافه/حذف کنید.' }));
      const x = C.normalizeDivisionSelection(st, st.divisionSelection);
      const ids = selectedIds(), all = st.parcels.map(p => String(p.id));
      const allOn = x.mode === 'all' && x.includeUnclassified && !x.scopes.length && !x.grades.length && !x.types.length && !x.estates.length && !x.excludedIds.length;
      bSelect.appendChild(el('div', { class: 'select-toolbar row' }, [
        checkbox('همه‌ی اموال (پیش‌فرض)', allOn, 'division-all', e => { if (e.target.checked) resetAll(); }),
        el('span', { class: 'tag final', id: 'division-count', text: selectionLabel() }),
        el('button', { class: 'btn sm sec2', text: 'انتخاب همه', onclick: resetAll }),
        el('button', { class: 'btn sm sec2', text: 'پاک‌کردن انتخاب‌ها', onclick: () => { C.setDivisionSelection(st, { mode: 'custom', ids: [], scopes: [], grades: [], types: [], estates: [], excludedIds: [], includeUnclassified: true }); full(); } }),
      ]));
      const scopes = Object.keys(C.SCOPES || {});
      const grades = ['grade1', 'grade2', 'grade3', 'manual'];
      const facetOn = (field, value) => { const a = x[field] || [], all = facetValues(field); if (x.mode === 'all' || !a.length) return true; if (a.length === all.length && all.every(q => a.indexOf(q) >= 0)) return false; return a.indexOf(String(value)) >= 0; };
      const facet = el('div', { class: 'facet-grid' });
      facet.appendChild(el('div', { class: 'facet' }, [el('b', { text: 'محدوده' }), ...scopes.map(k => checkbox(C.SCOPES[k], facetOn('scopes', k), 'division-scope-' + k, e => toggleFacet('scopes', k, e.target.checked)))]));
      facet.appendChild(el('div', { class: 'facet' }, [el('b', { text: 'درجه' }), ...grades.map(k => checkbox(C.GRADES[k] || 'دستی/نامشخص', facetOn('grades', k), 'division-grade-' + k, e => toggleFacet('grades', k, e.target.checked)))]));
      const types = typeOptions();
      if (types.length) facet.appendChild(el('div', { class: 'facet' }, [el('b', { text: 'نوع زمین / کاربری' }), ...types.map(([k, label], i) => checkbox(label, facetOn('types', k), 'division-type-' + i, e => toggleFacet('types', k, e.target.checked)))]));
      if (st.estates.length) facet.appendChild(el('div', { class: 'facet' }, [el('b', { text: 'دسته‌ی اموال' }), ...st.estates.map(ea => checkbox(ea.name, facetOn('estates', ea.id), 'division-estate-' + ea.id, e => toggleFacet('estates', ea.id, e.target.checked))), checkbox(C.NO_ESTATE_NAME, facetOn('estates', ''), 'division-estate-none', e => toggleFacet('estates', '', e.target.checked))]));
      facet.appendChild(el('div', { class: 'facet' }, [el('b', { text: 'زیرمجموعه‌های آماده' }),
        el('div', { class: 'note', text: 'نمونه: داخل روستا + درجه یک، یا اطراف روستا + درجه دو. قیمت و جمع این انتخاب در همان لحظه محاسبه می‌شود.' }),
        checkbox('زمین‌های بدون دسته هم در «همه» حساب شوند', x.includeUnclassified, 'division-unclassified', e => { x.includeUnclassified = e.target.checked; C.setDivisionSelection(st, x); full(); })]));
      bSelect.appendChild(facet);
      const custom = el('details', { class: 'custom-picks', open: x.mode === 'custom' ? true : null });
      custom.appendChild(el('summary', { text: 'انتخاب تک‌تک زمین‌ها (' + selectionLabel() + ')' }));
      const list = el('div', { class: 'parcel-check-grid' });
      const sorted = C.sortDivisionParcels(st, st.parcels);
      sorted.forEach(p => list.appendChild(checkbox((p.name || p.id) + ' — ' + App.area(liveV(p).area) + ' — ' + App.toman(liveV(p).total), ids.indexOf(String(p.id)) >= 0, 'division-parcel-' + p.id, e => toggleParcel(p.id, e.target.checked), 'checkline parcel-checkline')));
      custom.appendChild(list); bSelect.appendChild(custom);
      // این جمع باید دقیقاً با مبنای محاسبه یکی باشد؛ وقتی «بدون دسته» خاموش
      // است، ارزش آن زمین‌ها نباید فقط به‌خاطر تیک فهرست وارد خلاصه شود.
      const selectedValue = data && data.total ? R(data.total) : ids.reduce((sum, id) => { const p = st.parcels.find(q => String(q.id) === String(id)); const v = p && liveV(p); return sum + (v && isFinite(v.total) ? v.total : 0); }, 0);
      bSelect.appendChild(el('div', { class: 'box info', id: 'division-selection-summary', html: 'انتخاب فعلی: <b>' + selectionLabel() + '</b> — ارزش جاری انتخاب: <b>' + App.toman(selectedValue) + '</b><br><span class="note">زمین‌ها در فهرست تقسیم به ترتیب اطراف روستا و درجه ۱، ۲، ۳ و سپس داخل روستا مرتب می‌شوند؛ داخل هر گروه ارزش جاری بیشتر اول می‌آید.</span>' }));
      bSelect.appendChild(el('div', { class: 'row' }, [
        el('button', { class: 'btn', id: 'random-divide', text: '🎲 تقسیم رندومِ انتخاب فعلی', onclick: randomDivide }),
        el('span', { class: 'note', text: 'فقط زمین‌های تیک‌خورده جابه‌جا می‌شوند؛ زمین‌های خارج از انتخاب دست‌نخورده می‌مانند و کسری نقدی پیشنهادی جداگانه گزارش می‌شود.' }),
      ]));
      if (st.randomDivision) bSelect.appendChild(el('div', { class: 'note' }, ['آخرین تخصیص رندوم با شناسه‌ی محاسباتی ', el('code', { text: String(st.randomDivision.seed) }), ' در ', App.fmtDate(st.randomDivision.at), ' ثبت شده است؛ با تغییر زمین/نرخ، عددها دوباره از نو محاسبه می‌شوند.']));
    }
    function randomDivide() {
      const ids = selectedIds();
      if (!ids.length) { App.toast('ابتدا حداقل یک زمین را تیک بزنید.', 'warn'); return; }
      App.confirm('تقسیم رندوم انتخاب فعلی', 'فقط ' + App.n(ids.length, 0) + ' زمین انتخابی چندبار با ترتیب تصادفی امتحان می‌شود و نزدیک‌ترین تقسیم به حق‌های محاسبه‌شده ثبت می‌گردد. زمین‌های خارج از انتخاب تغییر نمی‌کنند. ادامه؟', () => {
        const out = C.randomAllocate(st, ids, { attempts: 80, includeUnclassified: C.normalizeDivisionSelection(st, st.divisionSelection).includeUnclassified });
        if (!out.ok) { App.modal({ title: 'تقسیم انجام نشد', body: el('div', null, (out.errors || []).map(t => el('div', { class: 'box err', text: t }))) }); return; }
        App.save(); App.emit('state');
        const lines = (out.settlement || []).map(x => el('div', { class: 'ln' }, [el('span', { text: x.fromName + ' ← ' + x.toName }), el('b', { text: App.toman(x.amount) })]));
        const residuals = (out.residual || []).map(x => el('div', { class: 'ln' }, [el('span', { text: x.name + ' — ' + (x.amount >= 0 ? 'دریافت ' : 'پرداخت ') }), el('b', { text: App.toman(Math.abs(x.amount)) })]));
        App.modal({ title: 'تقسیم رندوم انجام شد', wide: true, body: el('div', null, [el('div', { class: 'box ok', text: 'تخصیص فقط روی زمین‌های انتخابی انجام شد. خطای مجموع تقریبی: ' + App.toman(out.score) }), el('div', null, [el('h4', { text: 'مانده‌ی دقیق هر شخص پس از تخصیص' }), ...residuals]), lines.length ? el('div', null, [el('h4', { text: 'تسویه‌ی نقدی پیشنهادی (حداقل‌سازی‌شده)' }), ...lines]) : el('div', { class: 'box ok', text: 'با همین زمین‌های کامل، تسویه‌ی نقدی لازم نیست.' }), el('div', { class: 'note', text: 'این مبلغ پیشنهاد است و با تغییر متراژ یا نرخ، از نو محاسبه می‌شود؛ منبع عددی از پیش ذخیره نشده است.' })]) });
        render();
      }, 'تقسیم شود');
    }

    function policyText(policy) { return C.ALLOCATION_MODES && C.ALLOCATION_MODES[policy.mode] ? C.ALLOCATION_MODES[policy.mode] : policy.mode; }
    function allocationSummary(plan) {
      const rows = (plan.targets || []).map(x => '<tr><td class="l">' + App.esc(x.name) + '</td><td>' + App.n(C.fToNumber(C.toFrac(x.share)) * 100, 2) + '٪</td><td>' + money(C.toFrac(x.landTarget)) + '</td><td>' + money(C.toFrac(x.finalTarget)) + '</td></tr>').join('');
      const cash = (plan.cash || []).map(x => '<tr><td class="l">' + App.esc(x.name) + '</td><td class="' + (x.amount >= 0 ? 'pos' : 'neg') + '">' + (x.amount >= 0 ? 'دریافت ' : 'پرداخت ') + App.toman(Math.abs(x.amount)) + '</td></tr>').join('');
      const shared = (plan.coownerships || []).map(x => x.parcelName).join('، ');
      return '<div class="box info"><b>پیشنهاد فقط بر پایه‌ی محاسبه‌ی جاری است.</b><br>امتیاز اختلاف زمینی: ' + App.toman(plan.score || 0) + '</div>' + (shared ? '<div class="box warn"><b>هشدار مشاع:</b> «' + App.esc(shared) + '» فقط با تأیید همین دکمه ثبت می‌شود؛ سهم‌های مشاع در خروجی هر شخص جداگانه نمایش داده می‌شوند.</div>' : '') +
        '<h4>هدف هر شخص</h4><table class="t"><thead><tr><th class="l">شخص</th><th>نسبت</th><th>هدف زمین</th><th>اعتبار نهایی</th></tr></thead><tbody>' + rows + '</tbody></table>' +
        '<h4>تسویه‌ی پیشنهادی</h4><table class="t"><thead><tr><th class="l">شخص</th><th>مانده</th></tr></thead><tbody>' + cash + '</tbody></table>';
    }
    function runAutomatic(policy) {
      policy = C.normalizeAllocationPolicy(st, policy); st.allocationPolicy = policy; save();
      const ids = selectedIds(); if (!ids.length) { App.toast('ابتدا زمین‌های تقسیم را انتخاب کنید.', 'warn'); return; }
      const plan = C.automaticAllocationPlan(st, { selectedIds: ids, policy });
      if (!plan.ok) { App.modal({ title: 'تخصیص خودکار انجام نشد', body: el('div', null, (plan.errors || []).map(x => el('div', { class: 'box err', text: x }))) }); return; }
      if (plan.requiresInput) {
        const q = plan.request;
        const body = el('div', null, [el('div', { class: 'box warn', text: q.message + ' «' + q.parcelName + '» — ارزش جاری ' + money(C.toFrac(q.value)) + ' تومان — مساحت ' + App.area(q.area) }), el('div', { class: 'note', text: q.canPhysical ? 'اگر مرز معتبر باشد، درصدی و متری با برش واقعی انجام می‌شود؛ در غیر این صورت تسویه‌ی نقدی پیشنهاد می‌شود.' : 'برای این زمین مرز معتبر وجود ندارد؛ فقط تسویه‌ی نقدی قابل ثبت است.' }), el('table', { class: 't' }, [el('thead', null, el('tr', null, ['شخص', 'قسمت پیشنهادی'].map(h => el('th', { text: h })))), el('tbody', null, (q.portions || []).map(x => el('tr', null, [el('td', { class: 'l', text: x.personName }), el('td', { text: money(C.toFrac(x.value)) + ' تومان — ' + App.n(C.fToNumber(C.toFrac(x.share)) * 100, 2) + '٪' })])))] )]);
        const choose = (mode, close) => { const next = C.clone(policy); next.resolutions = Object.assign({}, policy.resolutions || {}, { [q.parcelId]: mode }); close(); setTimeout(() => runAutomatic(next), 0); };
        const buttons = q.canPhysical ? [{ label: 'تقسیم متری', onClick: close => choose('area', close) }, { label: 'تقسیم درصدی', onClick: close => choose('percent', close) }, { label: 'تسویه‌ی نقدی', cls: 'sec2', onClick: close => choose('cash', close) }] : [{ label: 'تسویه‌ی نقدی', onClick: close => choose('cash', close) }];
        if ((q.options || []).indexOf('coownership') >= 0) buttons.push({ label: 'مشاع — تأیید نهایی لازم است', cls: 'dng', onClick: close => choose('coownership', close) });
        App.modal({ title: 'انتخاب روش برای ملک بزرگ', wide: true, body, buttons: buttons.concat([{ label: 'لغو', cls: 'sec2' }]) }); return;
      }
      const msg = allocationSummary(plan) + (plan.warnings || []).map(x => '<div class="box warn">' + App.esc(x) + '</div>').join('');
      App.confirm('پیشنهاد تخصیص خودکار — ' + policyText(policy), msg, () => { const out = C.applyAutomaticAllocation(st, plan); if (!out.ok) { App.toast((out.errors || ['ثبت تخصیص ناموفق بود']).join('؛ '), 'err'); return; } st.allocationPolicy = policy; save(); App.emit('state'); App.toast('تخصیص خودکار با ثبت حسابرسی شد', 'ok'); }, 'ثبت تخصیص');
    }
    function drawAuto() {
      bAuto.innerHTML = ''; bAuto.appendChild(el('h3', { style: 'margin-top:0', text: '۲) تخصیص خودکار حرفه‌ای و قابل حسابرسی' }));
      bAuto.appendChild(el('div', { class: 'note', text: 'این بخش ابتدا پیشنهاد می‌سازد و تا تأیید شما هیچ زمینی را جابه‌جا نمی‌کند. ابتدا تقسیمات موجود حفظ می‌شوند؛ هدف نقدی هر سهم از محاسبه‌ی زنده به‌دست می‌آید. اگر یک ملک برای چند سهم بزرگ باشد، برنامه قبل از ثبت روش متری/درصدی/نقدی را می‌پرسد.' }));
      const p = C.normalizeAllocationPolicy(st, st.allocationPolicy || {}); st.allocationPolicy = p;
      const mode = el('select', { id: 'allocation-mode', onchange: e => { p.mode = e.target.value; save(); drawAuto(); } }, Object.keys(C.ALLOCATION_MODES || {}).map(k => el('option', { value: k, text: C.ALLOCATION_MODES[k], selected: p.mode === k ? true : null })));
      const split = el('select', { id: 'allocation-split-mode', onchange: e => { p.splitMode = e.target.value; p.indivisible = e.target.value === 'cash' ? 'cash_only' : 'physical_then_cash'; save(); } }, Object.keys(C.ALLOCATION_SPLITS || {}).map(k => el('option', { value: k, text: C.ALLOCATION_SPLITS[k], selected: p.splitMode === k ? true : null })));
      const keep = el('input', { type: 'checkbox', checked: p.preserveExisting ? true : null, onchange: e => { p.preserveExisting = e.target.checked; save(); } });
      const co = el('input', { type: 'checkbox', checked: p.allowCoownership ? true : null, onchange: e => { p.allowCoownership = e.target.checked; save(); } });
      bAuto.appendChild(el('div', { class: 'row auto-fields' }, [el('label', { class: 'f' }, [el('span', { text: 'ملاک تخصیص' }), mode]), el('label', { class: 'f' }, [el('span', { text: 'روش ملک بزرگ' }), split]), el('label', { class: 'checkline' }, [keep, 'حفظ تقسیمات ثبت‌شده و فقط تکمیل باقی‌مانده']), el('label', { class: 'checkline' }, [co, 'مشاع فقط به‌عنوان آخرین راه و با تأیید جداگانه'])]));
      if (p.mode === 'equal_mix') {
        const names = { scope: 'محدوده/داخل و اطراف روستا', grade: 'درجه', type: 'نوع/کاربری', special: 'ویژه/معمولی', estate: 'دسته‌ی اموال' };
        const mixKids = [el('b', { text: 'سطوحی که باید بین اشخاص متوازن شود' })];
        Object.keys(names).forEach(k => mixKids.push(el('label', { class: 'checkline' }, [el('input', { type: 'checkbox', checked: p.mixKeys.indexOf(k) >= 0 ? true : null, onchange: e => { p.mixKeys = e.target.checked ? p.mixKeys.concat(p.mixKeys.indexOf(k) < 0 ? [k] : []) : p.mixKeys.filter(x => x !== k); save(); } }), names[k]])));
        bAuto.appendChild(el('div', { class: 'facet mix-policy' }, mixKids));
      }
      if (p.mode === 'law_ratio' || p.mode === 'custom') {
        const rule = st.inheritanceRule || (st.inheritanceRule = C.defaultInheritanceRule());
        const relNames = { son: 'پسر', daughter: 'دختر', spouse: 'همسر', father: 'پدر', mother: 'مادر', other: 'سایر' };
        bAuto.appendChild(el('div', { class: 'box warn', text: p.mode === 'law_ratio' ? 'الگوی حقوقی فقط نسبت‌های ثبت‌شده را وارد موتور می‌کند؛ قبل از ثبت، وراث، دیون، وصیت و jurisdiction را با کارشناس حقوقی کنترل کنید.' : 'قانون سفارشی است؛ نسبت هر شخص را صریح وارد کنید.' }));
        bAuto.appendChild(el('div', { class: 'row' }, [el('label', { class: 'f' }, [el('span', { text: 'حوزه‌ی الگو' }), el('select', { onchange: e => { rule.jurisdiction = e.target.value; save(); } }, [el('option', { value: 'iran_shia', text: 'ایران — شیعه (نیازمند بازبینی)', selected: rule.jurisdiction === 'iran_shia' ? true : null }), el('option', { value: 'custom', text: 'سفارشی', selected: rule.jurisdiction === 'custom' ? true : null })])]), el('label', { class: 'checkline' }, [el('input', { type: 'checkbox', checked: rule.legalReviewed ? true : null, onchange: e => { rule.legalReviewed = e.target.checked; save(); } }), 'بازبینی حقوقی انجام شد'])]));
        const tb = el('tbody'); st.persons.forEach(person => { const wi = el('input', { type: 'text', dir: 'ltr', value: p.personWeights[person.id] == null ? (rule.ratios[person.id] || '') : p.personWeights[person.id], placeholder: 'مثلاً ۲ یا ۱/۲', onchange: e => { p.personWeights[person.id] = e.target.value; rule.ratios[person.id] = e.target.value; rule.relations[person.id] = rule.relations[person.id] || 'other'; save(); } }); const rs = el('select', { onchange: e => { rule.relations[person.id] = e.target.value; save(); } }, Object.keys(relNames).map(k => el('option', { value: k, text: relNames[k], selected: (rule.relations[person.id] || 'other') === k ? true : null }))); tb.appendChild(el('tr', null, [el('td', { class: 'l', text: person.name }), el('td', null, wi), el('td', null, rs)])); });
        bAuto.appendChild(el('table', { class: 't law-table' }, [el('thead', null, el('tr', null, ['شخص', 'وزن/نسبت', 'رابطه برای گزارش'].map(h => el('th', { text: h })))), tb]));
        if (p.mode === 'law_ratio') bAuto.appendChild(el('button', { class: 'btn sm sec2', text: 'پیشنهاد ساده‌ی فرزندان: پسر ۲، دختر ۱', onclick: () => { const rels = st.persons.map(x => rule.relations[x.id]); if (!rels.length || rels.some(x => x !== 'son' && x !== 'daughter') || !rels.includes('son') || !rels.includes('daughter')) { App.toast('این پیشنهاد فقط وقتی فعال است که همه‌ی اشخاص رابطه‌ی پسر/دختر داشته باشند؛ همسر/والدین باید با کارشناس حقوقی بررسی شوند.', 'warn'); return; } st.persons.forEach(x => { const w = rule.relations[x.id] === 'son' ? '2' : '1'; p.personWeights[x.id] = w; rule.ratios[x.id] = w; }); save(); drawAuto(); } }));
        bAuto.appendChild(el('div', { class: 'note', text: 'دیون و وصیت را فعلاً در «خانه/سایر (+/−)» وارد کنید؛ در مرحله‌ی بعد به ورودی‌های رسمی قانون ارث تبدیل می‌شوند. برنامه در این نسخه حکم حقوقی صادر نمی‌کند.' }));
      }
      bAuto.appendChild(el('button', { class: 'btn', id: 'auto-allocate', text: '🧮 ساخت پیشنهاد تخصیص برای زمین‌های انتخابی', onclick: () => runAutomatic(C.clone(p)) }));
      if (st.allocationRun) bAuto.appendChild(el('div', { class: 'note' }, ['آخرین ثبت تخصیص: ', el('b', { text: policyText(st.allocationRun) }), ' — ', App.fmtDate(st.allocationRun.at), '؛ با تغییر متراژ/نرخ باید پیشنهاد را دوباره بررسی کنید.']));
    }
    function drawCat() {
      bCat.innerHTML = '';
      bCat.appendChild(el('h3', { style: 'margin-top:0', text: '۲) دسته‌ها و سهم هر نفر' }));
      if (!data) return;
      const persons = st.persons;
      bCat.appendChild(el('div', { class: 'note', text: 'هر سطر یک منبع است. حق هر نفر از هر منبع جداگانه با وزن همان منبع محاسبه و در پایان با همه‌ی منابع جمع می‌شود.' }));
      const head = ['دسته', 'زمین', 'متر', 'میانگین قیمت جاری', 'ارزش جاری دسته (تومان)'].concat(persons.map(p => p.name)).concat(['']);
      const tb = el('tbody');
      data.cats.forEach(c => {
        const estate = st.estates.find(ea => String(ea.id) === String(c.id));
        const tr = el('tr', { 'data-est': c.id }, [
          el('td', null, estate ? el('input', { type: 'text', value: c.name, style: 'min-width:100px', onchange: (x) => { estate.name = x.target.value || estate.name; full(); } }) : el('span', { text: c.name })),
          el('td', { text: App.n(c.count, 0) }), el('td', { text: App.n(c.area, 1) }),
          el('td', { text: c.area > 0 ? App.n(Number(c.value.n) / Number(c.value.d) / c.area, 0) : '—' }),
          el('td', { class: 'val', text: money(c.value) }),
        ]);
        persons.forEach((p, i) => {
          const ws = C.fText(c.weights[i]);
          const inp = el('input', { type: 'text', dir: 'ltr', class: 'w', 'data-est': c.id, 'data-pid': p.id, value: ws === '0' ? '' : ws, placeholder: '۰', style: 'width:60px', onchange: (x) => {
            const raw = x.target.value; const n = App.num(raw); const t = n == null ? raw : String(n);
            if (estate && C.setEstateWeight(st, estate.id, p.id, t) == null) App.toast('ضریب باید عدد یا کسر مثبت باشد (مثلاً ۴ یا ۱/۷)', 'warn');
            full();
          } });
          tr.appendChild(el('td', null, [inp, el('div', { class: 'note', text: fa(C.fText(c.shares[i])) + ' = ' + money(C.fMul(c.value, c.shares[i])) })]));
        });
        tr.appendChild(el('td', null, estate ? el('button', { class: 'btn sm dng', text: 'حذف', onclick: () => App.confirm('حذف دسته', 'دسته‌ی «' + App.esc(c.name) + '» حذف شود؟ زمین‌هایش «بدون دسته» می‌شوند.', () => { C.removeEstate(st, c.id); full(); }, 'حذف') }) : null));
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
      if (data.unclassified.length && !data.includeUnclassified) bCat.appendChild(el('div', { class: 'box warn', text: data.unclassified.length + ' زمین دسته‌بندی‌نشده در این محاسبه وارد نشده است.' }));
      data.errors.forEach(t => bCat.appendChild(el('div', { class: 'box err', text: t })));
    }

    function drawHouse() {
      bHouse.innerHTML = '';
      bHouse.appendChild(el('h3', { style: 'margin-top:0', text: '۳) خانه‌ی شهر و طلب/بدهی نقدی (اختیاری)' }));
      bHouse.appendChild(el('div', { class: 'note', text: 'خالی گذاشتن این گزینه‌ها یعنی صفر؛ هیچ مبلغی از قبل به‌صورت پنهان در محاسبه وارد نمی‌شود.' }));
      const h = st.house;
      const amt = el('input', { type: 'text', id: 'house-amt', dir: 'ltr', value: h.amount || '', placeholder: 'خالی = بدون مبلغ', style: 'max-width:200px', onchange: (x) => { if (String(x.target.value).trim() && C.parseAdjust(x.target.value) == null) { App.toast('مبلغ نامعتبر است', 'warn'); return; } h.amount = x.target.value; refresh(); } });
      const payer = el('select', { id: 'house-payer', onchange: (x) => { h.payer = x.target.value; h.receivers = (h.receivers || []).filter(id => id !== h.payer); full(); } }, [el('option', { value: '', text: '— بدون پرداخت‌کننده —' })].concat(st.persons.map(p => el('option', { value: p.id, text: p.name }))));
      payer.value = h.payer || '';
      bHouse.appendChild(el('div', { class: 'row' }, [el('label', { class: 'f' }, [el('span', { text: 'مبلغ خانه (تومان، اختیاری)' }), amt]), el('label', { class: 'f' }, [el('span', { text: 'پرداخت‌کننده' }), payer])]));
      bHouse.appendChild(el('div', { class: 'row', style: 'gap:10px;margin-top:6px' }, [el('span', { text: 'دریافت‌کنندگان:' })].concat(st.persons.filter(p => p.id !== h.payer).map(p => el('label', { style: 'display:flex;gap:4px;align-items:center' }, [el('input', { type: 'checkbox', checked: (h.receivers || []).indexOf(p.id) >= 0 ? true : null, onchange: (x) => { h.receivers = (h.receivers || []).filter(id => id !== p.id); if (x.target.checked) h.receivers.push(p.id); refresh(); } }), p.name])))));
      if (data) {
        const n = data.house.receivers.length;
        bHouse.appendChild(el('div', { class: 'note', text: n && data.house.payer ? 'هر دریافت‌کننده ' + signed(data.house.amount) + ' و پرداخت‌کننده ' + pName(data.house.payer) + ' ' + signed(C.fNeg(C.fMul(data.house.amount, C.frac(n)))) + ' (جمع صفر).' : 'پرداخت‌کننده و دریافت‌کنندگان را انتخاب کنید؛ یا مبلغ را خالی بگذارید.' }));
        data.warns.forEach(t => bHouse.appendChild(el('div', { class: 'box warn', text: t })));
      }
    }

    function drawPeople() {
      bPeople.innerHTML = '';
      bPeople.appendChild(el('h3', { style: 'margin-top:0', text: '۴) حساب دقیق هر نفر' }));
      if (!data) { bPeople.appendChild(el('div', { class: 'box err', text: 'محاسبه ممکن نشد.' })); return; }
      const grid = el('div', { class: 'pgrid', id: 'sum-table' });
      data.people.forEach(x => {
        const v = R(x.remaining);
        const adj = el('input', { type: 'text', dir: 'ltr', value: (st.adjust[x.person.id] || ''), placeholder: 'خالی = صفر', class: 'adj', 'data-pid': x.person.id, onchange: (e) => {
          if (String(e.target.value).trim() && C.parseAdjust(e.target.value) == null) { App.toast('مبلغ نامعتبر است (مثل +3000000000-500000000)', 'warn'); return; }
          st.adjust[x.person.id] = e.target.value; refresh();
        } });
        const L = [];
        x.parts.forEach(pt => L.push(el('div', { class: 'ln' }, [el('span', { text: pt.name + ' (' + fa(C.fText(pt.share)) + ')' }), el('b', { text: money(pt.value) })])));
        L.push(el('div', { class: 'ln sum' }, [el('span', { text: 'جمع حق از زمین‌ها' }), el('b', { text: money(x.entitlement) })]));
        L.push(el('div', { class: 'ln' }, [el('span', { text: 'خانه‌ی شهر' }), el('b', { class: 'ltr', text: signed(x.house) })]));
        L.push(el('div', { class: 'ln' }, [el('span', { text: 'سایر (+/−) — طلب/بدهی دیگر (خالی = صفر)' }), adj]));
        L.push(el('div', { class: 'ln sum' }, [el('span', { text: '= اعتبار کل' }), el('b', { class: 'cred', text: money(x.credit) })]));
        L.push(el('div', { class: 'ln' }, [el('span', { text: 'زمین‌های دستش (' + App.n(x.held.length, 0) + ' قطعه)' }), el('b', { text: '− ' + money(x.heldValue) })]));
        L.push(el('div', { class: 'ln big ' + (v < 0 ? 'neg' : 'pos') }, [el('span', { text: v < 0 ? 'کسری (بیش از حق برداشته)' : 'مانده‌ی اعتبار خرید' }), el('b', { class: 'rem', text: money(C.fAbs(x.remaining)) })]));
        const card = el('div', { class: 'pcard', 'data-pid': x.person.id }, [el('h4', { text: x.person.name }), ...L]);
        if (x.family && x.family.length) card.appendChild(el('div', { class: 'family-mini' }, [el('b', { text: 'تقسیم سهم این شخص بین خانواده:' }), ...x.family.map(f => el('div', { class: 'ln' }, [el('span', { text: f.name + ' (' + fa(f.sharePct) + '٪)' }), el('b', { text: money(f.value) })]))]));
        grid.appendChild(card);
      });
      bPeople.appendChild(grid);
      bPeople.appendChild(el('div', { class: 'note' }, ['جمع ارزش انتخاب: ', money(data.total), ' تومان — آزاد: ', App.n(data.free.length, 0), ' قطعه — جمع مانده‌ها: ', signed(data.sumRemaining)]));
    }

    function drawPick() {
      bPick.innerHTML = '';
      bPick.appendChild(el('h3', { style: 'margin-top:0', text: '۵) فهرست مرتب‌شده‌ی زمین‌ها و تیک هر زمین' }));
      bPick.appendChild(el('div', { class: 'note', text: 'درجه یک اطراف روستا، سپس درجه دو و سه و بعد داخل روستا کنار هم آمده‌اند؛ داخل هر گروه ارزش جاری بیشتر اول است. تیک کنار هر ردیف تعیین می‌کند به جمع انتخاب فعلی برود یا نه.' }));
      const q = el('input', { type: 'search', id: 'pick-q', placeholder: 'جست‌وجوی نام زمین…', value: ui.q });
      const flt = el('select', { id: 'pick-flt' }, [['all', 'همه'], ['selected', 'فقط انتخاب‌شده‌ها'], ['free', 'فقط آزادها'], ['buyable', 'قابل برداشتن']].concat(st.persons.map(p => ['p:' + p.id, 'دست ' + p.name])).map(a => el('option', { value: a[0], text: a[1] })));
      flt.value = ui.flt;
      bPick.appendChild(el('div', { class: 'row' }, [el('div', { class: 'grow' }, q), flt]));
      const list = el('div', { id: 'pick-list' });
      C.sortDivisionParcels(st, st.parcels).forEach(p => {
        const v = liveV(p);
        const check = el('input', { type: 'checkbox', class: 'parcel-check', 'data-id': p.id, checked: selectedIds().indexOf(String(p.id)) >= 0 ? true : null, onchange: e => toggleParcel(p.id, e.target.checked) });
        const dSel = el('select', { class: 'est-sel', onchange: (e) => { p.estateId = e.target.value || null; refresh(); } }, [el('option', { value: '', text: C.NO_ESTATE_NAME })].concat(st.estates.map(ea => el('option', { value: ea.id, text: ea.name }))));
        dSel.value = p.estateId || '';
        const hSel = el('select', { class: 'hold-sel', onchange: (e) => { const res = C.setHolder(st, p.id, e.target.value || null); if (!res.ok) { App.toast(res.reason, 'warn'); e.target.value = C.holderOfParcel(st, p); return; } refresh(); } });
        const rw = el('div', { class: 'prow', 'data-pid': p.id }, [
          el('label', { class: 'parcel-tick', title: 'افزودن/حذف از محاسبه' }, [check, 'تیک']),
          el('div', { class: 'pn' }, [el('b', { text: p.name || p.id }), el('span', { class: 'note', text: ' ' + App.n(v.area, 1) + ' م² × ' + App.n(v.price != null ? v.price : v.pricePerM2, 0) + ' = ' }), el('b', { class: 'pv', text: App.n(v.total, 0) })]),
          el('label', { class: 'mini' }, [el('span', { text: 'دسته' }), dSel]), el('label', { class: 'mini' }, [el('span', { text: 'دست کی' }), hSel]), el('span', { class: 'tag' }),
        ]);
        rows[p.id] = { el: rw, hSel, p, check, dSel };
        list.appendChild(rw);
      });
      bPick.appendChild(list);
      const apply = () => { ui.q = q.value; ui.flt = flt.value; markRows(); };
      q.addEventListener('input', apply); flt.addEventListener('change', apply);
    }
    function markRows() {
      const seller = C.sellerId(st), qq = (ui.q || '').trim(), selected = new Set(selectedIds().map(String));
      st.parcels.forEach(p => {
        const rw = rows[p.id]; if (!rw) return;
        const cur = C.holderOfParcel(st, p), co = C.coOwnersOfParcel ? C.coOwnersOfParcel(st, p) : [];
        rw.hSel.innerHTML = '';
        [['', '— آزاد (دست هیچ‌کس) —']].concat(st.persons.map(x => [x.id, x.name])).forEach(o => { const op = el('option', { value: o[0], text: o[1] }); if (o[0] && !C.canTake(st, p.id, o[0]).ok) { op.disabled = true; op.textContent = o[1] + ' (ممکن نیست)'; } rw.hSel.appendChild(op); });
        rw.hSel.value = cur; rw.hSel.disabled = co.length > 0; rw.check.checked = selected.has(String(p.id));
        const buyable = !cur && !co.length || cur === seller, tag = rw.el.querySelector('.tag');
        if (co.length) { tag.textContent = 'مشاع: ' + co.map(o => pName(o.personId) + ' ' + fa(C.fText(o.share))).join('، '); tag.className = 'tag own'; }
        else { tag.textContent = cur ? (cur === seller ? 'دست پرداخت‌کننده — قابل برداشتن' : 'دست ' + pName(cur)) : 'آزاد'; tag.className = 'tag ' + (cur ? (buyable ? 'sell' : 'own') : 'free'); }
        const v = liveV(p); rw.el.querySelector('.pv').textContent = App.n(v.total, 0); rw.el.querySelector('.pn .note').textContent = ' ' + App.n(v.area, 1) + ' م² × ' + App.n(v.price != null ? v.price : v.pricePerM2, 0) + ' = ';
        let ok = true; if (qq && (p.name || '').indexOf(qq) < 0) ok = false; if (ui.flt === 'selected' && !selected.has(String(p.id))) ok = false; if (ui.flt === 'free' && (cur || co.length)) ok = false; if (ui.flt === 'buyable' && !buyable) ok = false; if (ui.flt.indexOf('p:') === 0 && cur !== ui.flt.slice(2)) ok = false;
        rw.el.style.display = ok ? '' : 'none'; if (rw.dSel.value !== (p.estateId || '')) rw.dSel.value = p.estateId || '';
      });
    }
    function catName(p) { const e = C.findEstate(st, p.estateId); return e ? e.name : C.NO_ESTATE_NAME; }

    function checkHtml() {
      if (!data) return '';
      const total = data.total, held = data.sumHeld, free = data.freeValue;
      const checks = [
        ['تراز ارزش انتخاب', C.fEq(C.fAdd(held, free), total), 'ارزش زمین‌های دست افراد + آزاد = ارزش انتخاب'],
        ['تراز حق‌ها', C.fEq(data.sumEntitlement, total), 'جمع حق اشخاص = ارزش انتخاب (حتی با زمین بدون دسته)'],
        ['بدون قیمت ناقص', data.errors.filter(x => /ارزش|قیمت/.test(x)).length === 0, 'هر زمین انتخابی باید مساحت و قیمت قابل محاسبه داشته باشد'],
      ];
      return '<div class="calc-checks"><b>کنترل‌های محاسباتی</b>' + checks.map(x => '<div class="check ' + (x[1] ? 'ok' : 'bad') + '">' + (x[1] ? '✔' : '✘') + ' ' + App.esc(x[0]) + ' — ' + App.esc(x[2]) + '</div>').join('') + '</div>';
    }

    function drawRes() {
      bRes.innerHTML = '';
      bRes.appendChild(el('h3', { style: 'margin-top:0', text: '۶) لیست نهایی زمین‌های هر نفر و کنترل‌ها' }));
      if (!data) return;
      bRes.appendChild(el('div', { class: 'row' }, [el('button', { class: 'btn', text: '🖨 چاپ', onclick: () => App.printHtml(sheetHtml(data)) }), el('button', { class: 'btn sec2', text: '💾 ذخیره‌ی برگه', onclick: () => App.download('تقسیم-زمین‌ها.html', App.sheetDoc('تقسیم زمین‌ها', sheetHtml(data)), 'text/html') }), el('button', { class: 'btn sec2', text: '📊 اکسل', onclick: () => exportXlsx(data) }), el('button', { class: 'btn sec2', id: 'download-all-persons', text: '📦 دانلود فایل جداگانه‌ی همه', onclick: () => downloadAll(data) }), el('button', { class: 'btn sec2', text: '📋 کپی متن', onclick: () => copyText(textOf(data)) })]));
      bRes.appendChild(el('div', { class: 'basis note', html: 'مبنای این برگه: <b>متراژ و نرخ جاری زمین‌ها</b> — ' + App.esc(selectionLabel()) }));
      data.people.forEach(x => {
        const w = el('div', { class: 'card', style: 'break-inside:avoid' });
        const pct = data.total && data.total.n ? Number(x.heldValue.n) / Number(x.heldValue.d) / (Number(data.total.n) / Number(data.total.d)) * 100 : 0;
        w.appendChild(el('h4', { style: 'margin:0 0 6px', text: x.person.name + ' — ' + App.n(x.held.length, 0) + ' قطعه، ' + App.n(x.heldArea, 1) + ' م²، ارزش ' + money(x.heldValue) + ' تومان (' + App.n(pct, 2) + '٪ از کل)' }));
        w.appendChild(el('div', { class: 'row' }, [el('button', { class: 'btn sm sec2', text: 'دانلود فایل ' + x.person.name, onclick: () => downloadPerson(x) })]));
        const lands = (x.held || []).slice().sort((a, b) => (liveV(b).total || 0) - (liveV(a).total || 0));
        if (lands.length) w.appendChild(el('table', { class: 't' }, [el('thead', null, el('tr', null, ['#', 'زمین', 'دسته', 'مساحت جاری/اصلاح', 'قیمت هر متر', 'ارزش جاری'].map(h => el('th', { text: h })))), el('tbody', null, lands.map((p, i) => { const v = liveV(p), sh = p.coOwnerShare ? C.toFrac(p.coOwnerShare) : null, shownArea = sh ? v.area * C.fToNumber(sh) : v.area, shownTotal = sh ? v.total * C.fToNumber(sh) : v.total; const ai = el('input', { class: 'final-area', type: 'text', dir: 'ltr', inputmode: 'decimal', value: shownArea == null ? '' : shownArea, title: sh ? 'مساحت کل زمین مشاع است؛ سهم با کسر دقیق نمایش داده می‌شود' : 'خالی = مساحت هندسه', disabled: sh ? true : null, onchange: e => editFinalArea(p, e.target.value) }); return el('tr', null, [el('td', { text: App.n(i + 1, 0) }), el('td', { class: 'l', text: p.name + (sh ? ' — مشاع ' + fa(C.fText(sh)) : '') }), el('td', { text: catName(p) }), el('td', null, ai), el('td', { text: App.n(v.price != null ? v.price : v.pricePerM2, 0) }), el('td', { text: App.n(shownTotal, 0) })]); }))]));
        else w.appendChild(el('div', { class: 'note', text: 'زمینی دستش نیست.' }));
        const v = R(x.remaining); w.appendChild(el('div', { class: v < 0 ? 'neg' : 'pos', text: 'اعتبار ' + money(x.credit) + ' − زمین‌ها ' + money(x.heldValue) + ' = ' + (v < 0 ? 'کسری ' : 'مانده ') + money(C.fAbs(x.remaining)) + ' تومان' }));
        bRes.appendChild(w);
      });
      if (data.free.length) bRes.appendChild(el('div', { class: 'box info', text: 'زمین‌های آزادِ داخل انتخاب (دست کسی نیست): ' + data.free.map(p => p.name).join('، ') }));
      bRes.insertAdjacentHTML('beforeend', checkHtml());
    }

    function drawFamily() {
      bFamily.innerHTML = '';
      bFamily.appendChild(el('h3', { style: 'margin-top:0', text: '۷) تقسیم سهم مصطفی/امیر یا هر شخص بین خانواده' }));
      bFamily.appendChild(el('div', { class: 'note', text: 'این بخش سهم محاسبه‌شده‌ی هر شخص را به تعداد سهم‌های خانوادگی تقسیم می‌کند؛ وزن‌ها دقیق‌اند و در صورت نیاز نام هر عضو را عوض کنید. اگر خالی/صفر بماند، سهم به خود شخص تعلق دارد و هیچ عدد مخفی اضافه نمی‌شود.' }));
      st.persons.forEach(p => {
        const f = st.familySplits[p.id]; const count = f && f.enabled ? f.members.length : 0;
        const cnt = el('input', { type: 'number', min: '0', max: '100', step: '1', id: 'family-count-' + p.id, value: count || '', placeholder: 'تعداد سهم', style: 'width:100px' });
        const card = el('div', { class: 'family-row' }, [el('b', { text: p.name }), cnt, el('button', { class: 'btn sm sec2', text: count ? 'به‌روزرسانی تعداد سهم' : 'تقسیم سهم', onclick: () => { const n = Number(cnt.value); if (!Number.isInteger(n) || n < 0) { App.toast('تعداد سهم باید عدد صحیح صفر یا بیشتر باشد.', 'warn'); return; } C.setFamilySplitCount(st, p.id, n); full(); } })]);
        if (count) {
          const table = el('table', { class: 't family-table' }, [el('thead', null, el('tr', null, ['عضو خانواده', 'وزن/تعداد سهم', 'سهم دقیق'].map(h => el('th', { text: h }))))]);
          const tb = el('tbody'); f.members.forEach(m => { const weight = (m.wnum && m.wden) ? m.wnum + (m.wden !== '1' ? '/' + m.wden : '') : (m.weight || '1'); const ni = el('input', { type: 'text', value: m.name, class: 'family-name' }); const wi = el('input', { type: 'text', dir: 'ltr', value: weight, class: 'family-weight' }); const commit = () => { const out = C.setFamilyMember(st, p.id, m.id, { name: ni.value, weight: wi.value }); if (!out) { App.toast('نام/وزن خانواده معتبر نیست.', 'warn'); return; } full(); }; ni.addEventListener('change', commit); wi.addEventListener('change', commit); tb.appendChild(el('tr', null, [el('td', null, ni), el('td', null, wi), el('td', { text: 'پس از ثبت محاسبه می‌شود' })])); }); table.appendChild(tb); card.appendChild(table);
        }
        bFamily.appendChild(card);
      });
    }

    const b64e = (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o))));
    const b64d = (t) => JSON.parse(decodeURIComponent(escape(atob(t))));
    function drawCode() {
      bCode.innerHTML = '';
      bCode.appendChild(el('h3', { style: 'margin-top:0', text: '۸) ارسال انتخاب من / دریافت انتخاب شرکا' }));
      bCode.appendChild(el('div', { class: 'note', text: 'انتخاب‌های هرکس روی گوشی خودش می‌ماند. کد فقط نام/زمین‌های انتخابی و ارزش جاری لحظه‌ی ساخت را حمل می‌کند؛ نسخه‌ی اصلی هنگام دریافت دوباره ارزش را محاسبه و اختلاف را هشدار می‌دهد.' }));
      const who = el('select', { id: 'code-who' }, st.persons.map(x => el('option', { value: x.id, text: x.name })));
      const out = el('textarea', { id: 'code-out', readonly: true, style: 'min-height:60px;direction:ltr;font-size:11px', placeholder: 'کد اینجا ساخته می‌شود' });
      bCode.appendChild(el('div', { class: 'f' }, [el('span', { text: 'من کیستم؟' }), who]));
      bCode.appendChild(el('div', { class: 'row' }, [el('button', { class: 'btn', id: 'code-make', text: 'ساخت کد انتخاب من', onclick: () => { const x = data && data.people.find(q => q.person.id === who.value); if (!x) return; out.value = 'ZY2:' + b64e({ v: 3, who: x.person.name, at: C.nowIso(), credit: R(x.credit), picks: x.held.map(p => { const v = liveV(p); return [p.name, Math.round(v.total || 0), v.area]; }) }); out.select(); } }), el('button', { class: 'btn sec2', text: 'کپی', onclick: () => { if (out.value) copyText(out.value); } })]));
      bCode.appendChild(out);
      const inp = el('textarea', { id: 'code-in', style: 'min-height:70px;direction:ltr;font-size:11px;margin-top:10px', placeholder: 'کدهای شرکا را اینجا بچسبانید (چند کد پشت سر هم هم می‌شود)' });
      const rep = el('div', { id: 'code-report' });
      bCode.appendChild(el('div', { class: 'note', style: 'margin-top:10px', text: 'فقط برای نسخه‌ی اصلی: دریافت انتخاب شرکا' })); bCode.appendChild(inp); bCode.appendChild(el('button', { class: 'btn sec2', id: 'code-apply', text: 'اعمال انتخاب‌های دریافتی', onclick: () => { rep.innerHTML = ''; applyCodes(inp.value, rep); inp.value = ''; save(); refresh(); drawCode(); bCode.appendChild(rep); } })); bCode.appendChild(rep);
      const got = Object.keys(st.received || {}); if (got.length) bCode.appendChild(el('ul', { class: 'hist' }, got.map(pid => el('li', { text: pName(pid) + ' — ' + App.n(st.received[pid].n, 0) + ' زمین — ' + App.fmtDate(st.received[pid].at) + (st.received[pid].warn ? ' ⚠ ' + st.received[pid].warn : ' ✔') }))));
    }
    function applyCodes(text, rep) {
      const codes = String(text || '').split(/\s+/).filter(t => /^ZY[23]:/.test(t));
      if (!codes.length) { rep.appendChild(el('div', { class: 'box warn', text: 'کدی پیدا نشد (باید با ZY2: شروع شود).' })); return; }
      st.received = st.received || {};
      codes.forEach(c => { let d; try { d = b64d(c.slice(4)); } catch (e) { rep.appendChild(el('div', { class: 'box err', text: 'یک کد خراب است و نادیده گرفته شد.' })); return; } const person = st.persons.find(p => p.name === d.who); if (!person) { rep.appendChild(el('div', { class: 'box err', text: 'شخص «' + d.who + '» در این نسخه نیست.' })); return; } const warns = []; let n = 0; const names = (d.picks || []).map(x => x[0]); st.parcels.forEach(p => { if (p.holderId === person.id && names.indexOf(p.name) < 0) { p.holderId = null; warns.push('«' + p.name + '» آزاد شد'); } }); (d.picks || []).forEach(pk => { const pc = st.parcels.find(p => p.name === pk[0]); if (!pc) { warns.push('زمین «' + pk[0] + '» پیدا نشد'); return; } const v = liveV(pc); if (v.total != null && Math.round(v.total) !== Math.round(pk[1])) warns.push('ارزش «' + pk[0] + '» با ارزش جاری فرق دارد'); const res = C.setHolder(st, pc.id, person.id); if (!res.ok) warns.push('«' + pc.name + '»: ' + res.reason); else n++; }); const mine = ev().people.find(x => x.person.id === person.id); if (mine && Math.abs(R(mine.credit) - d.credit) > 1) warns.push('اعتبار او در نسخه‌ی شریک متفاوت است'); st.received[person.id] = { at: d.at || C.nowIso(), n, warn: warns.join('؛ ') }; rep.appendChild(el('div', { class: 'box ' + (warns.length ? 'warn' : 'ok'), text: person.name + ': ' + App.n(n, 0) + ' زمین ثبت شد' + (warns.length ? ' — ' + warns.join('؛ ') : '') })); });
    }

    function drawPersons() {
      bPer.innerHTML = ''; bPer.appendChild(el('h3', { style: 'margin-top:0', text: '۹) اشخاص' }));
      st.persons.forEach(p => bPer.appendChild(el('div', { class: 'row', style: 'margin:3px 0' }, [el('input', { type: 'text', value: p.name, class: 'grow', onchange: (e) => { p.name = e.target.value || p.name; full(); } }), el('button', { class: 'btn sm dng', text: 'حذف', onclick: () => App.confirm('حذف شخص', '«' + App.esc(p.name) + '» و سهم‌ها و زمین‌های دستش حذف شود؟', () => { C.removePerson(st, p.id); full(); }, 'حذف') })])));
      const nm = el('input', { type: 'text', placeholder: 'نام شخص تازه', id: 'per-new' });
      bPer.appendChild(el('div', { class: 'row', style: 'margin-top:8px' }, [el('div', { class: 'grow' }, nm), el('button', { class: 'btn', id: 'per-add', text: 'افزودن', onclick: () => { if (!nm.value.trim()) { App.toast('نام را بنویسید', 'warn'); return; } C.addPerson(st, nm.value.trim(), 1); full(); } })]));
    }

    data = ev();
    drawStrip(); drawSelection(); drawAuto(); drawCat(); drawHouse(); drawPeople(); drawPick(); drawRes(); drawFamily(); drawCode(); drawPersons(); markRows();
    [strip, bSelect, bAuto, bCat, bHouse, bPeople, bPick, bRes, bFamily, bCode, bPer].forEach(b => r.appendChild(b));
  }

  function textOf(d) {
    const L = ['ارزش جاری انتخاب: ' + money(d.total) + ' تومان', ''];
    d.cats.forEach(c => L.push('دسته‌ی ' + c.name + ': ' + c.count + ' زمین — ' + money(c.value) + ' تومان'));
    L.push('');
    d.people.forEach(x => { L.push('■ ' + x.person.name + ' — حق: ' + money(x.entitlement) + ' | خانه: ' + signed(x.house) + ' | سایر: ' + signed(x.adjust) + ' | اعتبار: ' + money(x.credit)); x.held.forEach((p, i) => { const v = liveV(p), sh = p.coOwnerShare ? C.toFrac(p.coOwnerShare) : null, k = sh ? C.fToNumber(sh) : 1; L.push('  ' + App.n(i + 1, 0) + ') ' + p.name + (sh ? ' — مشاع ' + fa(C.fText(sh)) : '') + ' — ' + App.n(v.area * k, 1) + ' م² — ' + App.n(v.total * k, 0) + ' تومان'); }); L.push('  جمع زمین‌ها: ' + money(x.heldValue) + ' — ' + (R(x.remaining) < 0 ? 'کسری: ' : 'مانده: ') + money(C.fAbs(x.remaining)) + ' تومان', ''); });
    if (d.free.length) L.push('آزاد: ' + d.free.map(p => p.name).join('، '));
    return L.join('\n');
  }
  function copyText(t) { const ok = () => App.toast('کپی شد', 'ok'); const fb = () => { const ta = el('textarea', { style: 'position:fixed;top:0;left:0;opacity:.01' }); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); ok(); } catch (e) { App.modal({ title: 'متن را کپی کنید', body: el('textarea', { style: 'min-height:200px', value: t }) }); } ta.remove(); }; if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok, fb); else fb(); }

  function sheetHtml(d) {
    const E = App.esc; let h = '<h1>تقسیم زمین‌ها</h1><div class="note">ارزش جاری انتخاب: ' + money(d.total) + ' تومان — ' + E(selectionLabel()) + '</div>';
    h += '<h2>دسته‌ها</h2><table><thead><tr><th class="l">دسته</th><th>زمین</th><th>متر</th><th>ارزش (تومان)</th></tr></thead><tbody>' + d.cats.map(c => '<tr><td class="l">' + E(c.name) + '</td><td>' + App.n(c.count, 0) + '</td><td>' + App.n(c.area, 1) + '</td><td>' + money(c.value) + '</td></tr>').join('') + '</tbody></table>';
    h += '<h2>حساب هر نفر</h2><table><thead><tr><th class="l">شخص</th><th>حق زمین‌ها</th><th>خانه</th><th>سایر</th><th>اعتبار</th><th>ارزش زمین‌های دستش</th><th>مانده/کسری</th></tr></thead><tbody>' + d.people.map(x => '<tr><td class="l">' + E(x.person.name) + '</td><td>' + money(x.entitlement) + '</td><td>' + signed(x.house) + '</td><td>' + signed(x.adjust) + '</td><td>' + money(x.credit) + '</td><td>' + money(x.heldValue) + '</td><td>' + (R(x.remaining) < 0 ? 'کسری ' : 'مانده ') + money(C.fAbs(x.remaining)) + '</td></tr>').join('') + '</tbody></table>';
    d.people.forEach(x => { h += '<div class="person"><h3>' + E(x.person.name) + ' — ' + money(x.heldValue) + ' تومان، ' + App.n(x.heldArea, 1) + ' م²</h3>'; h += x.held.length ? '<table><thead><tr><th>#</th><th class="l">زمین</th><th>مساحت جاری</th><th>قیمت هر متر</th><th>ارزش جاری</th></tr></thead><tbody>' + x.held.map((p, i) => { const v = liveV(p), sh = p.coOwnerShare ? C.toFrac(p.coOwnerShare) : null, k = sh ? C.fToNumber(sh) : 1; return '<tr><td>' + App.n(i + 1, 0) + '</td><td class="l">' + E(p.name) + (sh ? ' — مشاع ' + E(fa(C.fText(sh))) : '') + '</td><td>' + App.n(v.area * k, 1) + '</td><td>' + App.n(v.price != null ? v.price : v.pricePerM2, 0) + '</td><td>' + App.n(v.total * k, 0) + '</td></tr>'; }).join('') + '</tbody></table>' : '<div class="note">زمینی ندارد.</div>'; if (x.family && x.family.length) h += '<div class="note"><b>خانواده:</b> ' + x.family.map(f => E(f.name) + ' ' + fa(f.sharePct) + '٪ = ' + money(f.value)).join('؛ ') + '</div>'; h += '</div>'; });
    return h;
  }
  function csvForPerson(x) {
    const lines = [['شخص', 'زمین', 'دسته', 'مساحت جاری مترمربع', 'قیمت هر متر تومان', 'ارزش جاری تومان', 'سهم']];
    (x.held || []).forEach(p => { const v = liveV(p), sh = p.coOwnerShare ? C.toFrac(p.coOwnerShare) : null, k = sh ? C.fToNumber(sh) : 1; lines.push([x.person.name, p.name, C.findEstate(S(), p.estateId) ? C.findEstate(S(), p.estateId).name : C.NO_ESTATE_NAME, v.area == null ? '' : v.area * k, v.price != null ? v.price : (v.pricePerM2 || ''), v.total == null ? '' : v.total * k, sh ? fa(C.fText(sh)) : '۱۰۰٪']); });
    lines.push(['جمع', '', '', x.heldArea, '', R(x.heldValue), '']);
    return '\uFEFF' + lines.map(row => row.map(v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(',')).join('\n');
  }
  function downloadPerson(x) { App.download('تقسیم-' + safeFile(x.person.name) + '.csv', csvForPerson(x), 'text/csv;charset=utf-8'); }
  function downloadAll(d) {
    if (!window.JSZip) { d.people.forEach(downloadPerson); return; }
    const z = new JSZip(); d.people.forEach(x => z.file('تقسیم-' + safeFile(x.person.name) + '.csv', csvForPerson(x))); z.file('خلاصه-تقسیم.txt', textOf(d));
    z.generateAsync({ type: 'blob' }).then(blob => App.downloadBlob('فهرست-نهایی-هر-شخص.zip', blob));
  }
  function exportXlsx(d) {
    const estateName = (p) => { const e = C.findEstate(S(), p.estateId); return e ? e.name : C.NO_ESTATE_NAME; };
    if (!window.XLSX) { App.toast('کتابخانه‌ی اکسل بارگذاری نشده', 'err'); return; }
    const wb = XLSX.utils.book_new();
    const sum = [['شخص', 'حق از زمین‌ها', 'خانه', 'سایر', 'اعتبار', 'ارزش زمین‌های دستش', 'مانده/کسری']];
    d.people.forEach(x => sum.push([x.person.name, R(x.entitlement), R(x.house), R(x.adjust), R(x.credit), R(x.heldValue), R(x.remaining)])); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sum), 'خلاصه');
    const lst = [['شخص', 'زمین', 'دسته', 'مساحت جاری', 'قیمت هر متر', 'ارزش جاری']];
    d.people.forEach(x => { x.held.forEach(p => { const v = liveV(p), sh = p.coOwnerShare ? C.toFrac(p.coOwnerShare) : null, k = sh ? C.fToNumber(sh) : 1; lst.push([x.person.name, p.name + (sh ? ' — مشاع ' + fa(C.fText(sh)) : ''), estateName(p), v.area == null ? '' : v.area * k, v.price != null ? v.price : v.pricePerM2 || '', v.total == null ? '' : v.total * k]); }); lst.push([x.person.name + ' — جمع', '', '', x.heldArea, '', R(x.heldValue)]); }); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(lst), 'لیست نهایی');
    const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }); App.downloadBlob('تقسیم-زمین‌ها.xlsx', new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  }

  App.share = { render, textOf, R };
  App.on('tab', t => { if (t === 'people') render(); });
  App.on('state', () => { if (App.curTab === 'people') render(); });
})();
