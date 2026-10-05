/* پنل مدیریت ICSD — رفتارهای رابط کاربری (بدون کتابخانه به‌جز Bootstrap، Tom Select و jalalidatepicker) */
(function () {
  'use strict';
  var P = window.PANEL || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var FA = function (n) { return String(n).replace(/\d/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[d]; }); };

  function post(url, data, json) {
    var opts = { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRFToken': P.csrf } };
    if (json) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(data); }
    else { var fd = new FormData(); Object.keys(data || {}).forEach(function (k) { fd.append(k, data[k]); }); opts.body = fd; }
    return fetch(url, opts).then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'خطا'); return d; }); });
  }

  function toast(msg, kind) {
    var box = $('#toasts'); if (!box) return;
    var t = document.createElement('div'); t.className = 'toast-i ' + (kind || 'success');
    t.textContent = msg; var b = document.createElement('button'); b.type = 'button'; b.textContent = '✕'; t.appendChild(b);
    box.appendChild(t); setTimeout(function () { t.remove(); }, 4200);
  }
  window.panelToast = toast;

  // ─── چارچوب ───
  $$('#toasts .toast-i').forEach(function (t, i) { setTimeout(function () { t.remove(); }, 5000 + i * 600); });
  document.addEventListener('click', function (e) { if (e.target.closest('.toast-i button')) e.target.closest('.toast-i').remove(); });
  var burger = $('#burger');
  if (burger) burger.addEventListener('click', function () { document.body.classList.toggle('side-open'); });
  document.addEventListener('click', function (e) {
    if (document.body.classList.contains('side-open') && !e.target.closest('#side') && !e.target.closest('#burger')) document.body.classList.remove('side-open');
  });
  var themeBtn = $('#theme');
  if (themeBtn) themeBtn.addEventListener('click', function () {
    var d = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', d);
    try { localStorage.setItem('panel-theme', d); } catch (e) {}
  });

  // ─── جستجوی سراسری ───
  var gq = $('#gq'), gres = $('#gres'), gt;
  if (gq) {
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K' || e.key === 'ک')) { e.preventDefault(); gq.focus(); gq.select(); }
    });
    gq.addEventListener('input', function () {
      clearTimeout(gt);
      var q = gq.value.trim();
      if (q.length < 2) { gres.classList.remove('on'); return; }
      gt = setTimeout(function () {
        fetch(P.search + '?format=json&q=' + encodeURIComponent(q), { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (d) {
          var h = '';
          d.results.forEach(function (g) {
            h += '<h6>' + g.group + '</h6>';
            g.items.forEach(function (it) { h += '<a href="' + it.url + '"></a>'; });
          });
          gres.innerHTML = h || '<div class="p-3 muted small">نتیجه‌ای نیست.</div>';
          var i = 0; d.results.forEach(function (g) { g.items.forEach(function (it) { gres.querySelectorAll('a')[i++].textContent = it.text; }); });
          gres.classList.add('on');
        });
      }, 220);
    });
    gq.addEventListener('keydown', function (e) {
      var links = $$('a', gres); if (!links.length) return;
      var cur = links.findIndex(function (a) { return a.classList.contains('on'); });
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); if (cur >= 0) links[cur].classList.remove('on');
        cur = e.key === 'ArrowDown' ? Math.min(links.length - 1, cur + 1) : Math.max(0, cur - 1);
        links[cur].classList.add('on'); links[cur].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter' && cur >= 0) { e.preventDefault(); location.href = links[cur].href; }
      else if (e.key === 'Escape') gres.classList.remove('on');
    });
    document.addEventListener('click', function (e) { if (!e.target.closest('.gsearch')) gres.classList.remove('on'); });
  }

  // ─── فهرست: انتخاب گروهی ───
  var selAll = $('#selAll'), bulk = $('#bulk');
  function syncBulk() {
    var n = $$('.rowchk:checked').length;
    if (bulk) { bulk.classList.toggle('on', n > 0); $('#selN').textContent = FA(n); }
    $$('.rowchk').forEach(function (c) { c.closest('tr').classList.toggle('sel', c.checked); });
  }
  if (selAll) selAll.addEventListener('change', function () { $$('.rowchk').forEach(function (c) { c.checked = selAll.checked; }); syncBulk(); });
  document.addEventListener('change', function (e) { if (e.target.classList.contains('rowchk')) syncBulk(); });

  // ─── سوییچ‌های سریع و انتخاب وضعیت ───
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.classList.contains('js-toggle')) {
      post(t.dataset.url).then(function (d) {
        t.checked = !!d.value;
        if (t.hasAttribute('data-row-off')) { var it = t.closest('.sb__it'); if (it) it.classList.toggle('off', !d.value); }
        toast('ذخیره شد'); reloadPreview();
      }).catch(function (err) { t.checked = !t.checked; toast(err.message, 'error'); });
    }
    if (t.classList.contains('js-choice')) {
      post(t.dataset.url, { value: t.value }).then(function () { toast('وضعیت به‌روز شد'); }).catch(function (err) { toast(err.message, 'error'); });
    }
  });

  // ─── کشیدن و رها کردن برای ترتیب ───
  function sortable(container, itemSel, url) {
    var drag = null;
    container.addEventListener('dragstart', function (e) {
      var it = e.target.closest(itemSel); if (!it) return;
      drag = it; it.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', it.dataset.id); e.dataTransfer.setDragImage(it, 20, 20); } catch (x) {}
    });
    container.addEventListener('dragover', function (e) {
      if (!drag) return; e.preventDefault();
      var over = e.target.closest(itemSel); if (!over || over === drag || !over.dataset.id) return;
      $$('.drop-on', container).forEach(function (x) { x.classList.remove('drop-on'); });
      over.classList.add('drop-on');
      var r = over.getBoundingClientRect();
      over.parentNode.insertBefore(drag, (e.clientY - r.top) > r.height / 2 ? over.nextSibling : over);
    });
    container.addEventListener('dragend', function () {
      if (!drag) return; drag.classList.remove('dragging'); drag = null;
      $$('.drop-on', container).forEach(function (x) { x.classList.remove('drop-on'); });
      var ids = $$(itemSel, container).map(function (x) { return x.dataset.id; }).filter(Boolean);
      post(url, { ids: ids }, true).then(function () { toast('ترتیب ذخیره شد'); reloadPreview(); }).catch(function (err) { toast(err.message, 'error'); });
    });
  }
  var st = $('table[data-sortable]'); if (st) sortable(st.tBodies[0], 'tr', st.dataset.sortable);
  var sb = $('#sb[data-reorder]'); if (sb) sortable(sb, '.sb__it', sb.dataset.reorder);

  // پیش‌نمایش صفحه‌ساز
  var prev = $('#prev');
  function reloadPreview() { if (prev) { try { prev.contentWindow.location.reload(); } catch (e) { prev.src = prev.src; } } }
  var rp = $('#reloadPrev'); if (rp) rp.addEventListener('click', reloadPreview);

  // ─── فرم‌ها ───
  function initWidgets(root) {
    if (window.TomSelect) $$('select.ts', root).forEach(function (s) {
      if (s.tomselect || s.closest('template')) return;
      var opt = { plugins: s.multiple ? ['remove_button'] : [], maxOptions: 300, create: false,
                  render: { no_results: function () { return '<div class="no-results">موردی نیست</div>'; } } };
      if (!s.multiple && !s.required) opt.allowEmptyOption = true;
      if (s.dataset.ac) {
        opt.valueField = 'value'; opt.labelField = 'text'; opt.searchField = 'text';
        opt.load = function (q, cb) { fetch(P.ac + s.dataset.ac + '/?q=' + encodeURIComponent(q), { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (d) { cb(d.results); }).catch(function () { cb(); }); };
      }
      try { new TomSelect(s, opt); } catch (e) {}
    });
    if (window.jalaliDatepicker) { try { jalaliDatepicker.startWatch({ time: true, hasSecond: false, autoShow: true, autoHide: true, persianDigits: true }); } catch (e) {} }
  }
  initWidgets(document);

  // تب‌ها
  $$('.tabs').forEach(function (tabs) {
    tabs.addEventListener('click', function (e) {
      var b = e.target.closest('[data-tab]'); if (!b) return;
      $$('[data-tab]', tabs).forEach(function (x) { x.classList.toggle('on', x === b); });
      var box = tabs.parentNode;
      $$('.tabpane', box).forEach(function (p) { p.classList.toggle('on', p.id === b.dataset.tab); });
      try { history.replaceState(null, '', '#' + b.dataset.tab); } catch (x) {}
    });
    var h = location.hash.slice(1); var b = h && $('[data-tab="' + h + '"]', tabs); if (b) b.click();
    // اگر خطا در تبی پنهان است، همان تب را باز کن
    var err = $('.tabpane .has-err'); if (err) { var pane = err.closest('.tabpane'); var tb = $('[data-tab="' + pane.id + '"]', tabs); if (tb) tb.click(); }
  });

  // نامک خودکار
  var form = $('#mainform');
  if (form && form.dataset.prepopulate) {
    var map = {}; try { map = JSON.parse(form.dataset.prepopulate); } catch (e) {}
    Object.keys(map).forEach(function (target) {
      var t = $('#id_' + target), src = $('#id_' + map[target]) || $('#id_title') || $('#id_name');
      if (!t || !src) return;
      var touched = !!t.value;
      t.addEventListener('input', function () { touched = true; });
      src.addEventListener('input', function () {
        if (touched) return;
        t.value = src.value.trim().toLowerCase().replace(/[‌\s_]+/g, '-').replace(/[^\w؀-ۿ-]+/g, '')
                           .replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, parseInt(t.getAttribute('maxlength') || 100, 10));
      });
    });
  }

  // هشدار تغییرات ذخیره‌نشده
  if (form) {
    var dirty = false;
    form.addEventListener('input', function () { dirty = true; });
    form.addEventListener('submit', function () { dirty = false; });
    window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'س')) { e.preventDefault(); var b = $('button[type=submit].b--p', form); if (b) b.click(); }
    });
  }

  // زیرفرم‌ها: افزودن ردیف
  $$('[data-inline]').forEach(function (box) {
    var btn = $('[data-add-row]', box), tpl = $('template[data-empty]', box), rows = $('[data-rows]', box);
    var total = $('input[name="' + box.dataset.inline + '-TOTAL_FORMS"]', box);
    if (!btn || !tpl || !rows || !total) return;
    btn.addEventListener('click', function () {
      var i = parseInt(total.value, 10);
      var html = tpl.innerHTML.replace(/__prefix__/g, i);
      var tmp = document.createElement(rows.tagName === 'TBODY' ? 'tbody' : 'div'); tmp.innerHTML = html;
      var row = tmp.firstElementChild; rows.appendChild(row); total.value = i + 1;
      initWidgets(row); bindFiles(row);
      var first = $('input:not([type=hidden]),textarea,select', row); if (first) first.focus();
    });
  });

  // ─── فیلد فایل: پیش‌نمایش و انتخاب از کتابخانه ───
  var pickTarget = null, modal = null;
  function setPreview(box, url, isImg, name) {
    var p = $('[data-prev]', box), n = $('[data-name]', box);
    p.innerHTML = isImg ? '<img alt="">' : '<span class="mono">' + (name.split('.').pop() || '').toUpperCase() + '</span>';
    if (isImg) p.firstChild.src = url;
    n.textContent = name;
  }
  function bindFiles(root) {
    $$('[data-file]', root).forEach(function (box) {
      if (box._bound) return; box._bound = true;
      var inp = $('input[type=file]', box);
      if (inp) inp.addEventListener('change', function () {
        var f = inp.files[0]; if (!f) return;
        $('[data-pickval]', box).value = '';
        setPreview(box, URL.createObjectURL(f), /^image\//.test(f.type), f.name);
      });
      var pb = $('[data-pick]', box);
      if (pb) pb.addEventListener('click', function () { pickTarget = box; openMedia(''); });
    });
  }
  bindFiles(document);

  var mmState = { dir: '', q: '', page: 1 };
  function openMedia(dir) {
    var el = $('#mediaModal'); if (!el || !window.bootstrap) return;
    modal = modal || new bootstrap.Modal(el);
    mmState.dir = dir || ''; mmState.page = 1; loadMedia(); modal.show();
  }
  function loadMedia() {
    var url = P.media + '?format=json&dir=' + encodeURIComponent(mmState.dir) + '&q=' + encodeURIComponent(mmState.q) + '&page=' + mmState.page;
    fetch(url, { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (d) {
      var g = $('#mmgrid'); g.innerHTML = '';
      $('#mmpath').textContent = '/media/' + (d.dir || '');
      if (d.dir) g.appendChild(mkDir('↑ بالا', d.dir.split('/').slice(0, -1).join('/')));
      if (!mmState.q) d.dirs.forEach(function (x) { g.appendChild(mkDir('📁 ' + x.name, x.rel)); });
      d.files.forEach(function (f) {
        var it = document.createElement('div'); it.className = 'mi pick';
        it.innerHTML = '<div class="mi__p"></div><div class="mi__m"><b></b><span></span></div>';
        var p = it.firstChild;
        if (f.img) { var im = document.createElement('img'); im.loading = 'lazy'; im.src = f.url; p.appendChild(im); }
        else p.innerHTML = '<span class="ext">' + f.ext + '</span>';
        $('b', it).textContent = f.name; $('span', it.lastChild).textContent = f.size;
        it.addEventListener('click', function () { choose(f); });
        g.appendChild(it);
      });
      if (!g.children.length) g.innerHTML = '<div class="empty" style="grid-column:1/-1">فایلی نیست.</div>';
      var pg = $('#mmpager'); pg.innerHTML = '';
      if (d.pages > 1) {
        if (d.page > 1) pg.appendChild(mkBtn('قبلی', function () { mmState.page--; loadMedia(); }));
        pg.appendChild(document.createTextNode(FA(d.page) + ' / ' + FA(d.pages)));
        if (d.page < d.pages) pg.appendChild(mkBtn('بعدی', function () { mmState.page++; loadMedia(); }));
      }
    });
  }
  function mkDir(label, rel) { var a = document.createElement('div'); a.className = 'md'; a.style.cursor = 'pointer'; a.textContent = label; a.addEventListener('click', function () { mmState.dir = rel; mmState.page = 1; mmState.q = ''; $('#mmq').value = ''; loadMedia(); }); return a; }
  function mkBtn(t, fn) { var b = document.createElement('button'); b.type = 'button'; b.className = 'b b--sm'; b.textContent = t; b.addEventListener('click', fn); return b; }
  function choose(f) {
    if (!pickTarget) { copy(f.url); return; }
    $('[data-pickval]', pickTarget).value = f.rel;
    var inp = $('input[type=file]', pickTarget); if (inp) inp.value = '';
    setPreview(pickTarget, f.url, f.img, f.name);
    if (form) form.dispatchEvent(new Event('input'));
    modal.hide(); toast('فایل انتخاب شد؛ فرم را ذخیره کنید.');
  }
  var mmq = $('#mmq'), mmt;
  if (mmq) mmq.addEventListener('input', function () { clearTimeout(mmt); mmt = setTimeout(function () { mmState.q = mmq.value.trim(); mmState.page = 1; loadMedia(); }, 300); });
  var mmup = $('#mmup');
  if (mmup) mmup.addEventListener('change', function () {
    var fd = new FormData(); Array.prototype.forEach.call(mmup.files, function (f) { fd.append('files', f); });
    fetch(P.upload, { method: 'POST', body: fd, credentials: 'same-origin', headers: { 'X-CSRFToken': P.csrf, 'X-Requested-With': 'fetch' } })
      .then(function (r) { return r.json(); }).then(function (d) {
        d.errors.forEach(function (e) { toast(e, 'error'); });
        if (d.saved.length) { toast(FA(d.saved.length) + ' فایل آپلود شد'); var dir = d.saved[0].rel.split('/').slice(0, -1).join('/'); mmState.dir = dir; mmState.q = ''; loadMedia(); }
        mmup.value = '';
      });
  });

  // ─── صفحه‌ی رسانه ───
  function copy(text) {
    var full = location.origin + text;
    (navigator.clipboard ? navigator.clipboard.writeText(full) : Promise.reject()).then(function () { toast('آدرس کپی شد'); }, function () { prompt('آدرس فایل:', full); });
  }
  document.addEventListener('click', function (e) { var b = e.target.closest('[data-copy]'); if (b) { e.preventDefault(); copy(b.dataset.copy); } });
  var drop = $('#drop');
  if (drop) {
    ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
    drop.addEventListener('drop', function (e) { var inp = $('input[type=file]', drop); inp.files = e.dataTransfer.files; $('#upform').submit(); });
  }

  // ─── ماتریس مجوزها ───
  $$('.pm [data-col]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      var boxes = a.dataset.col === 'all' ? $$('.pm input[name=perms]') : $$('.pm input[data-a="' + a.dataset.col + '"]');
      var on = boxes.some(function (b) { return !b.checked; }); boxes.forEach(function (b) { b.checked = on; });
    });
  });
  $$('.pm [data-rowall]').forEach(function (c) {
    var row = $$('input[name=perms]', c.closest('tr'));
    c.checked = row.length && row.every(function (b) { return b.checked; });
    c.addEventListener('change', function () { row.forEach(function (b) { b.checked = c.checked; }); });
  });
})();
