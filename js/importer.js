/* ورود مختصات آماده: متن، دستی، CSV، Excel، GeoJSON، KML، KMZ — با پیش‌نمایش و تشخیص سیستم مختصات */
(function () {
  'use strict';
  const App = window.App, C = App.C, el = App.el;
  const I = App.importer = {};
  let ctx = null;

  function panel() { return document.getElementById('import-panel'); }
  I.close = function () { panel().hidden = true; App.map.clearPreview(); ctx = null; };

  I.open = function () {
    ctx = { kind: null, payload: null, fileName: '', cols: {}, cand: 0, crs: 'auto', swap: null, res: null, pv: null };
    const p = panel(); p.hidden = false; p.innerHTML = '';
    const manualRows = [['', ''], ['', ''], ['', '']];
    const manualBody = el('tbody');
    const drawManual = () => {
      manualBody.innerHTML = '';
      manualRows.forEach((r, i) => manualBody.appendChild(el('tr', null, [
        el('td', { text: App.n(i + 1, 0) }),
        el('td', null, el('input', { type: 'text', dir: 'ltr', value: r[0], placeholder: 'طول/X', oninput: (e) => { r[0] = e.target.value; } })),
        el('td', null, el('input', { type: 'text', dir: 'ltr', value: r[1], placeholder: 'عرض/Y', oninput: (e) => { r[1] = e.target.value; } })),
      ])));
    };
    drawManual();
    const ta = el('textarea', { id: 'imp-text', dir: 'ltr', placeholder: 'هر خط یک نقطه، مثلاً:\n51.6700 32.6500\n51.6712 32.6500\n51.6712 32.6510\n(جداکننده: فاصله، تب، ویرگول یا ;  — ارقام فارسی هم پذیرفته می‌شود)' });
    const file = el('input', { type: 'file', id: 'imp-file', accept: '.csv,.tsv,.txt,.xlsx,.xls,.geojson,.json,.kml,.kmz' });
    file.addEventListener('change', () => { if (file.files[0]) I.loadFile(file.files[0]); });
    p.appendChild(el('div', { class: 'row' }, [el('h3', { style: 'margin:0', class: 'grow', text: 'ورود مختصات آماده' }), el('button', { class: 'btn sm sec2', text: 'بستن', onclick: I.close })]));
    p.appendChild(el('div', { class: 'note', text: 'مرز زمین را از فایل یا متن وارد کنید. ابتدا پیش‌نمایش نشان داده می‌شود و فقط پس از تأیید شما ثبت می‌گردد. هیچ مختصاتی حدس زده یا ساخته نمی‌شود.' }));
    p.appendChild(el('h4', { text: '۱) فایل' }));
    p.appendChild(file);
    p.appendChild(el('div', { class: 'note', text: 'CSV / Excel (xlsx, xls) / GeoJSON / KML / KMZ / TXT' }));
    p.appendChild(el('h4', { text: '۲) چسباندن متن' }));
    p.appendChild(ta);
    p.appendChild(el('button', { class: 'btn sm', style: 'margin-top:4px', text: 'تحلیل متن', onclick: () => { ctx.fileName = 'متن'; I.start('text', ta.value); } }));
    p.appendChild(el('details', null, [
      el('summary', { text: '۳) واردکردن دستی نقطه‌ها' }),
      el('table', { class: 't' }, [el('thead', null, el('tr', null, ['#', 'طول / X', 'عرض / Y'].map(h => el('th', { text: h })))), manualBody]),
      el('div', { class: 'row', style: 'margin-top:4px' }, [
        el('button', { class: 'btn sm sec2', text: 'افزودن ردیف', onclick: () => { manualRows.push(['', '']); drawManual(); } }),
        el('button', { class: 'btn sm', text: 'تحلیل نقطه‌ها', onclick: () => {
          const t = manualRows.filter(r => r[0].trim() || r[1].trim()).map(r => r[0].trim() + '\t' + r[1].trim()).join('\n');
          ctx.fileName = 'دستی'; I.start('text', 'x\ty\n' + t, true);
        } }),
      ]),
    ]));
    p.appendChild(el('div', { id: 'imp-result', style: 'margin-top:10px' }));
  };

  I.loadFile = async function (f) {
    ctx.fileName = f.name;
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    try {
      if (ext === 'xlsx' || ext === 'xls') {
        const buf = await f.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const name = wb.SheetNames.find(n => { const r = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: '' }); return r.length; }) || wb.SheetNames[0];
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: '' });
        I.start('table', rows);
      } else if (ext === 'kmz') {
        const z = await JSZip.loadAsync(await f.arrayBuffer());
        const n = Object.keys(z.files).find(k => /\.kml$/i.test(k));
        if (!n) throw new Error('داخل فایل KMZ هیچ فایل KML پیدا نشد');
        I.start('kml', await z.files[n].async('string'));
      } else {
        const text = await f.text();
        if (ext === 'kml') I.start('kml', text);
        else if (ext === 'geojson' || ext === 'json' || /^\s*[{\[]/.test(text)) I.start('geojson', text);
        else I.start('text', text);
      }
    } catch (e) {
      ctx.res = { ok: false, errors: ['خواندن فایل ممکن نشد: ' + e.message] }; ctx.pv = null; render();
    }
  };

  I.start = function (kind, payload, noHeaderGuess) {
    ctx.kind = kind; ctx.payload = payload; ctx.cols = {}; ctx.cand = 0; ctx.crs = 'auto'; ctx.swap = null;
    run();
  };
  function run() {
    let res;
    try {
      if (ctx.kind === 'text') res = C.importText(ctx.payload, ctx.cols);
      else if (ctx.kind === 'table') res = C.importTable(ctx.payload, ctx.cols);
      else if (ctx.kind === 'geojson') res = C.importGeoJSON(ctx.payload);
      else res = C.importKML(ctx.payload);
    } catch (e) { res = { ok: false, errors: ['خطای غیرمنتظره: ' + e.message] }; }
    ctx.res = res; ctx.pv = null;
    if (res.ok) {
      const cand = res.candidates[Math.min(ctx.cand, res.candidates.length - 1)];
      const o = Object.assign({}, res);
      if (ctx.crs !== 'auto') { o.crs = ctx.crs; if (ctx.swap != null) o.swap = ctx.swap; }
      ctx.pv = C.buildPreview(cand, o);
    }
    render();
  }

  function render() {
    const box = document.getElementById('imp-result'); if (!box) return;
    box.innerHTML = '';
    const { res, pv } = ctx;
    box.appendChild(el('h4', { text: 'نتیجه‌ی تحلیل' + (ctx.fileName ? ' — ' + ctx.fileName : '') }));
    if (!res.ok) {
      if (res.needsColumns) {
        const sx = el('select', null, res.headers.map((h, i) => el('option', { value: i, text: h })));
        const sy = el('select', null, res.headers.map((h, i) => el('option', { value: i, text: h, selected: i === 1 ? true : null })));
        box.appendChild(el('div', { class: 'box warn', text: res.message }));
        box.appendChild(el('label', { class: 'f' }, [el('span', { text: 'ستون طول جغرافیایی (X / lon)' }), sx]));
        box.appendChild(el('label', { class: 'f' }, [el('span', { text: 'ستون عرض جغرافیایی (Y / lat)' }), sy]));
        box.appendChild(sampleTable(res));
        box.appendChild(el('button', { class: 'btn sm', text: 'اعمال انتخاب ستون‌ها', onclick: () => {
          if (sx.value === sy.value) { App.toast('دو ستون باید متفاوت باشند', 'warn'); return; }
          ctx.cols = { colX: +sx.value, colY: +sy.value }; run();
        } }));
        return;
      }
      box.appendChild(el('div', { class: 'box err' }, [el('b', { text: 'ورودی نامعتبر است — چیزی ثبت نمی‌شود' }), el('ul', null, (res.errors || ['خطای نامشخص']).map(e => el('li', { text: e })))]));
      App.map.clearPreview();
      return;
    }
    if (res.candidates.length > 1) {
      const sel = el('select', null, res.candidates.map((c, i) => el('option', { value: i, text: (c.name || 'چندضلعی ' + (i + 1)) + ' — ' + App.n(c.points.length, 0) + ' نقطه', selected: i === ctx.cand ? true : null })));
      sel.addEventListener('change', () => { ctx.cand = +sel.value; ctx.crs = 'auto'; ctx.swap = null; run(); });
      box.appendChild(el('label', { class: 'f' }, [el('span', { text: 'فایل چند چندضلعی دارد؛ کدام را وارد کنیم؟' }), sel]));
    }
    (res.warnings || []).forEach(w => box.appendChild(el('div', { class: 'box warn', text: w })));
    // انتخاب سیستم مختصات
    const crsSel = el('select', null, [el('option', { value: 'auto', text: 'تشخیص خودکار' })].concat(C.CRS_LIST.map(c => el('option', { value: c.id, text: c.label, selected: ctx.crs === c.id ? true : null }))));
    crsSel.value = ctx.crs;
    crsSel.addEventListener('change', () => { ctx.crs = crsSel.value; run(); });
    const swapCb = el('input', { type: 'checkbox', checked: (ctx.swap != null ? ctx.swap : (pv && pv.swap)) ? true : null });
    swapCb.addEventListener('change', () => { if (ctx.crs === 'auto') ctx.crs = (pv && pv.crs) || 'EPSG:4326'; ctx.swap = swapCb.checked; run(); });
    if (pv && pv.needsCRS) {
      box.appendChild(el('div', { class: 'box warn', text: pv.message }));
      box.appendChild(el('label', { class: 'f' }, [el('span', { text: 'سیستم مختصات فایل' }), crsSel]));
      App.map.clearPreview();
      return;
    }
    if (pv && pv.errors && !pv.ring) { box.appendChild(el('div', { class: 'box err', text: pv.errors.join('، ') })); return; }
    box.appendChild(el('label', { class: 'f' }, [el('span', { text: 'سیستم مختصات (در صورت نادرست‌بودن تشخیص، اصلاح کنید)' }), crsSel]));
    box.appendChild(el('label', { style: 'display:flex;gap:6px;align-items:center;margin:4px 0' }, [swapCb, 'ترتیب ستون‌ها «عرض، طول» است (جابه‌جا شود)']));
    // پیش‌نمایش
    const rows = [
      ['تعداد نقاط مرزی', App.n(pv.count, 0)],
      ['مساحت محاسبه‌شده', pv.ok ? App.area(pv.area) : '—'],
      ['وضعیت اعتبار هندسه', pv.ok ? '✔ معتبر' : '✘ نامعتبر'],
      ['سیستم مختصات تشخیص‌داده‌شده', (C.CRS_LIST.find(c => c.id === pv.crs) || { label: pv.crs }).label + (pv.reason ? ' (' + pv.reason + ')' : '')],
    ];
    box.appendChild(el('table', { class: 't' }, el('tbody', null, rows.map(r => el('tr', null, [el('th', { class: 'l', text: r[0] }), el('td', { class: 'l', text: r[1] })])))));
    (pv.warnings || []).forEach(w => box.appendChild(el('div', { class: 'box warn', text: w })));
    if (!pv.ok) box.appendChild(el('div', { class: 'box err' }, [el('b', { text: 'این مرز ثبت نمی‌شود:' }), el('ul', null, (pv.errors || []).map(e => el('li', { text: e })))]));
    App.map.showPreview(pv.ring, pv.ok, true);
    box.appendChild(el('div', { class: 'row', style: 'margin-top:8px' }, [
      el('button', { class: 'btn', disabled: pv.ok ? null : true, text: 'تأیید و استفاده به‌عنوان مرز زمین', onclick: confirmUse }),
      el('button', { class: 'btn sec2', text: 'انصراف', onclick: I.close }),
    ]));
    box.appendChild(el('div', { class: 'note', text: 'پس از تأیید می‌توانید نقاط را روی نقشه بکشید یا در «ویرایش دقیق نقاط» اصلاح کنید.' }));
  }
  function sampleTable(res) {
    return el('div', { class: 'scroll' }, el('table', { class: 't' }, [
      el('thead', null, el('tr', null, res.headers.map(h => el('th', { text: h })))),
      el('tbody', null, (res.sample || []).map(r => el('tr', null, res.headers.map((_, i) => el('td', { text: r[i] == null ? '' : r[i] }))))),
    ]));
  }
  function confirmUse() {
    const pv = ctx.pv; if (!pv || !pv.ok) return;
    const name = ctx.res.candidates[ctx.cand] && ctx.res.candidates[ctx.cand].name;
    App.map.clearPreview();
    App.map.setBoundary(pv.ring, { source: 'import', meta: { file: ctx.fileName, crs: pv.crs, swap: pv.swap, name } });
    App.emit('imported', { name });
    I.close();
    App.toast('مرز با ' + App.n(pv.count, 0) + ' نقطه و مساحت ' + App.area(pv.area) + ' ثبت شد؛ اکنون مشخصات زمین را کامل کنید.');
  }
})();
