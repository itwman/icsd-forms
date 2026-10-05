/* فرم‌ساز — ویرایشگر سه‌ستونه‌ی پرسشنامه (بدون وابستگی؛ فقط Sortable محلی).
   ساختار داده همان engine.py است؛ سرور با clean_schema همه‌چیز را دوباره پاک‌سازی می‌کند. */
(function () {
  'use strict';
  var root = document.getElementById('builder');
  if (!root) return;

  // ───────────────────────── ابزار ─────────────────────────
  var B = JSON.parse(root.dataset.boot || '{}');
  var PLAN = B.plan || {};
  var URLS = B.urls || {};
  var FA_D = '۰۱۲۳۴۵۶۷۸۹';
  var fa = function (v) { return String(v == null ? '' : v).replace(/\d/g, function (d) { return FA_D[d]; }); };
  var en = function (v) {
    return String(v == null ? '' : v).replace(/[۰-۹]/g, function (d) { return FA_D.indexOf(d); })
      .replace(/[٠-٩]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(d); });
  };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  var toast = function (m, k) { if (window.toast) window.toast(m, k); };
  function uid(p) {
    var a = new Uint8Array(3);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return (p || 'q') + '_' + Array.prototype.map.call(a, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
  }
  function stable(o) {
    if (Array.isArray(o)) return '[' + o.map(stable).join(',') + ']';
    if (o && typeof o === 'object') {
      return '{' + Object.keys(o).sort().filter(function (k) { return o[k] !== undefined; })
        .map(function (k) { return JSON.stringify(k) + ':' + stable(o[k]); }).join(',') + '}';
    }
    return JSON.stringify(o === undefined ? null : o);
  }
  function parseNum(v) {
    v = en(v).replace(/[,٬\s]/g, '').replace('٫', '.').trim();
    if (v === '' || v === '-') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }
  function csrf() {
    var m = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
    if (m) return decodeURIComponent(m[1]);
    var i = $('input[name=csrfmiddlewaretoken]', root);
    return i ? i.value : '';
  }
  var ICONS = {};
  $$('#bIcons [data-i]').forEach(function (i) { ICONS[i.dataset.i] = i.innerHTML.trim(); });
  function icon(name, size) {
    var t = document.createElement('span');
    t.innerHTML = ICONS[name] || ICONS.dots || '';
    var s = t.firstElementChild;
    if (!s) return document.createTextNode('');
    if (size) { s.setAttribute('width', size); s.setAttribute('height', size); }
    return s;
  }
  // ساخت عنصر: h('div', {class:'x', on:{click:fn}}, child, ...)
  function h(tag, p) {
    var el = document.createElement(tag);
    p = p || {};
    Object.keys(p).forEach(function (k) {
      var v = p[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'on') Object.keys(v).forEach(function (e) { el.addEventListener(e, v[e]); });
      else if (k === 'data') Object.keys(v).forEach(function (d) { el.dataset[d] = v[d]; });
      else if (k === 'style') el.setAttribute('style', v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'hidden') el[k] = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { add(el, x); }); return; }
    el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }

  // ───────────────────────── انواع سؤال ─────────────────────────
  var TYPES = B.types || {};
  var TI = { short_text: 'menu', long_text: 'article', number: 'chart', price: 'cart', email: 'mail', mobile: 'phone', phone: 'phone',
    national_code: 'shield', url: 'link', date: 'clock', choice: 'list', dropdown: 'chevron-down', yes_no: 'check', rating: 'star',
    scale: 'bars', matrix: 'layout', ranking: 'award', location: 'map', file: 'upload', signature: 'edit', consent: 'handshake', statement: 'doc' };
  var GROUPS = [['choice', 'گزینه‌ای'], ['text', 'متن، عدد و تاریخ'], ['scale', 'امتیاز و طیف'], ['contact', 'اطلاعات تماس'], ['other', 'سایر']];
  var GCOLOR = { text: '#1E9E7B', contact: '#16A9C7', choice: '#7C5CFF', scale: '#E8961E', other: '#F05C7E' };
  var NUMERIC = ['number', 'price', 'rating', 'scale'];
  var FILE_TYPES = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'rar', 'txt', 'mp3', 'mp4'];
  var answerable = function (q) { return q.type !== 'statement'; };
  var tLabel = function (t) { return (TYPES[t] || {}).label || t; };
  var tGroup = function (t) { return (TYPES[t] || {}).group || 'other'; };

  function items(prefix, labels, score) {
    return labels.map(function (l) { var o = { id: uid(prefix), label: l }; if (score) o.score = 0; return o; });
  }
  function defaultOpt(t) {
    var o = {};
    if (['short_text', 'long_text', 'email', 'url', 'phone', 'mobile', 'national_code', 'number', 'price'].indexOf(t) >= 0) o.placeholder = '';
    if (t === 'short_text' || t === 'long_text') { o.min_len = null; o.max_len = null; }
    if (t === 'number' || t === 'price') { o.min = null; o.max = null; o.unit = ''; o.decimals = false; o.add_to_score = false; }
    if (t === 'date') { o.min = ''; o.max = ''; o.birth = false; }
    if (t === 'choice' || t === 'dropdown') {
      o.choices = items('c', ['گزینه‌ی ۱', 'گزینه‌ی ۲', 'گزینه‌ی ۳'], true);
      o.multiple = false; o.min_select = null; o.max_select = null; o.other = false; o.other_label = 'سایر'; o.shuffle = false; o.layout = 'list';
    }
    if (t === 'yes_no') { o.yes_label = 'بله'; o.no_label = 'خیر'; }
    if (t === 'rating') { o.max = 5; o.shape = 'star'; o.add_to_score = false; }
    if (t === 'scale') { o.min = 1; o.max = 10; o.min_label = ''; o.max_label = ''; o.nps = false; o.add_to_score = false; }
    if (t === 'matrix') { o.rows = items('r', ['ردیف ۱', 'ردیف ۲']); o.cols = items('c', ['ضعیف', 'متوسط', 'خوب'], true); o.multiple = false; }
    if (t === 'ranking') o.items = items('i', ['مورد ۱', 'مورد ۲', 'مورد ۳']);
    if (t === 'file') { o.max_mb = 5; o.types = ['pdf', 'jpg', 'jpeg', 'png', 'docx', 'xlsx', 'zip']; }
    if (t === 'location') o.ask_city = true;
    if (t === 'consent') o.label = 'شرایط را خواندم و می‌پذیرم.';
    if (t === 'statement') o.button = 'ادامه';
    return o;
  }
  function newQuestion(t) {
    return { id: uid('q'), type: t, title: '', description: '', required: t !== 'statement', image: '', opt: defaultOpt(t), show_if: null, jumps: [] };
  }

  // ───────────────────────── وضعیت ─────────────────────────
  var DEF_THEME = { primary: '#1E9E7B', bg: '#F6F7F4', card: '#FFFFFF', text: '#16303A', bg_image: '', font_size: 'md', radius: 'lg', layout: 'one', logo: '', align: 'right' };
  var DEF_SET = { progress: true, allow_back: true, numbering: true, shuffle: false, show_branding: true };
  function normalize(s) {
    s = s && typeof s === 'object' ? s : {};
    s.questions = Array.isArray(s.questions) ? s.questions : [];
    s.questions.forEach(function (q) {
      q.opt = Object.assign(defaultOpt(q.type), q.opt || {});
      q.jumps = q.jumps || []; q.show_if = q.show_if || null;
      q.title = q.title || ''; q.description = q.description || ''; q.image = q.image || '';
    });
    s.variables = s.variables || []; s.calcs = s.calcs || [];
    s.welcome = Object.assign({ enabled: true, title: '', text: '', button: 'شروع', image: '' }, s.welcome || {});
    s.endings = (s.endings && s.endings.length) ? s.endings : [{ id: 'e_default', title: 'ممنون از وقتی که گذاشتید!', text: 'پاسخ شما ثبت شد.', button_text: '', button_url: '', redirect_url: '', show_score: false, when: null }];
    s.theme = Object.assign({}, DEF_THEME, s.theme || {});
    s.settings = Object.assign({}, DEF_SET, s.settings || {});
    return s;
  }
  var st = { schema: normalize(B.schema), title: B.title || '' };
  var S = function () { return st.schema; };
  var sel = st.schema.questions.length ? { k: 'q', id: st.schema.questions[0].id } : { k: 'welcome' };
  var cvSel = sel;           // آخرین چیزی که در پیش‌نمایش نشان داده شد
  var insTab = 'q';          // سؤال | منطق
  var scoreOn = {};          // نمایش ستون امتیاز در ویرایشگر گزینه‌ها
  var hasUnpub = !!B.has_unpublished;
  var version = B.version || 0;

  var qIndex = function (id) { for (var i = 0; i < S().questions.length; i++) if (S().questions[i].id === id) return i; return -1; };
  var qById = function (id) { return S().questions[qIndex(id)]; };
  var endById = function (id) { return S().endings.filter(function (e) { return e.id === id; })[0]; };
  function qNumber(q) { // شماره‌ی نمایشی (فقط سؤال‌های پاسخ‌دار)
    var n = 0;
    for (var i = 0; i < S().questions.length; i++) { var x = S().questions[i]; if (answerable(x)) n++; if (x.id === q.id) return answerable(q) ? n : 0; }
    return 0;
  }
  function qName(q) { return (q.title || '').replace(/\{\{[^}]*\}\}/g, '…').trim() || 'بدون عنوان'; }
  function shortName(q, n) { var t = qName(q); n = n || 38; return t.length > n ? t.slice(0, n) + '…' : t; }
  function fixSel() {
    if (sel.k === 'q' && !qById(sel.id)) sel = S().questions.length ? { k: 'q', id: S().questions[Math.min(Math.max(0, lastIdx), S().questions.length - 1)].id } : { k: 'welcome' };
    if (sel.k === 'ending' && !endById(sel.id)) sel = { k: 'ending', id: S().endings[0].id };
    if (cvSel.k === 'q' && !qById(cvSel.id)) cvSel = sel.k === 'q' ? sel : { k: 'welcome' };
    if (cvSel.k === 'ending' && !endById(cvSel.id)) cvSel = { k: 'ending', id: S().endings[0].id };
  }
  var lastIdx = 0;

  // ───────────────────────── تاریخچه (واگرد/ازنو) ─────────────────────────
  var hist = [snap()], hi = 0, hTimer = null;
  function snap() { return JSON.stringify({ s: st.schema, t: st.title }); }
  function pushHist() {
    clearTimeout(hTimer); hTimer = null;
    var cur = snap();
    if (cur === hist[hi]) return;
    hist = hist.slice(0, hi + 1); hist.push(cur);
    if (hist.length > 150) hist.shift();
    hi = hist.length - 1; updUndo();
  }
  function restore(str) {
    var o = JSON.parse(str);
    st.schema = normalize(o.s); st.title = o.t;
    fixSel(); markDirty(); renderAll(); updUndo();
    var ti = $('#bTitle'); if (ti && document.activeElement !== ti) ti.value = st.title;
  }
  function undo() { pushHist(); if (hi <= 0) return; hi--; restore(hist[hi]); }
  function redo() { if (hi >= hist.length - 1) return; hi++; restore(hist[hi]); }
  function updUndo() { $('#bUndo').disabled = hi <= 0 && !hTimer; $('#bRedo').disabled = hi >= hist.length - 1; }

  // هر تغییر: علامت تغییر، ذخیره‌ی خودکار، تاریخچه و بازترسیم
  function change(o) {
    o = o || {};
    markDirty();
    if (o.typing) { clearTimeout(hTimer); hTimer = setTimeout(pushHist, 700); updUndo(); } else pushHist();
    if (o.ins) renderIns();
    schedule();
  }
  var rafId = 0;
  function schedule() {
    if (rafId) return;
    rafId = requestAnimationFrame(function () { rafId = 0; renderOutline(); renderCanvas(); });
  }

  // ───────────────────────── ذخیره ─────────────────────────
  var dirty = false, saving = null, saveTimer = null, editSeq = 0, retryT = null;
  function setSave(s) {
    var el = $('#bSave'); el.dataset.state = s;
    el.lastElementChild.textContent = { saved: 'ذخیره شد', saving: 'در حال ذخیره…', dirty: 'تغییرات ذخیره نشده', error: 'ذخیره نشد؛ تلاش دوباره…' }[s];
  }
  function markDirty() { dirty = true; editSeq++; setSave('dirty'); clearTimeout(saveTimer); saveTimer = setTimeout(save, 1200); }
  function save() {
    clearTimeout(saveTimer); clearTimeout(retryT);
    if (saving) return saving.then(function () { return dirty ? save() : true; });
    if (!dirty) return Promise.resolve(true);
    var seq = editSeq;
    setSave('saving');
    saving = fetch(URLS.save, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf(), 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ schema: st.schema, title: st.title })
    }).then(function (r) {
      return r.json().catch(function () { return { error: r.status === 403 ? 'نشست شما منقضی شده؛ صفحه را دوباره باز کنید.' : 'پاسخ نامعتبر از سرور' }; })
        .then(function (j) { return { ok: r.ok, j: j }; });
    }).then(function (res) {
      saving = null;
      if (!res.ok || !res.j.ok) throw new Error(res.j.error || 'خطا در ذخیره');
      hasUnpub = true; updPub();
      if (seq === editSeq) { dirty = false; setSave('saved'); adopt(res.j.schema); } else saveTimer = setTimeout(save, 600);
      return true;
    }).catch(function (e) {
      saving = null; setSave('error');
      toast(e.message && /[؀-ۿ]/.test(e.message) ? e.message : 'اتصال برقرار نشد؛ تغییرات ذخیره نشد.', 'error');
      retryT = setTimeout(save, 6000);
      return false;
    });
    return saving;
  }
  // سرور ساختار پاک‌شده را برمی‌گرداند؛ اگر چیزی عوض شده، همان را مبنا قرار بده.
  function adopt(server) {
    if (!server) return;
    if (stable(server) === stable(st.schema)) return;
    st.schema = normalize(server);
    hist[hi] = snap();
    fixSel(); renderAll();
  }
  window.addEventListener('beforeunload', function (e) {
    if (dirty || saving) { e.preventDefault(); e.returnValue = ''; }
  });

  // ───────────────────────── انتشار و پیش‌نمایش ─────────────────────────
  function updPub() {
    $('#bUnpub').hidden = !hasUnpub || !version;
    $('#bUnpub').title = 'تغییرات منتشرنشده — برای اعمال روی فرم، دوباره منتشر کنید';
    var b = $('#bPublish');
    b.title = version ? 'نسخه‌ی منتشرشده: ' + fa(version) : 'هنوز منتشر نشده';
    b.lastElementChild.textContent = version && !hasUnpub ? 'منتشر شده' : 'انتشار';
    b.classList.toggle('is-done', !!version && !hasUnpub);
  }
  function publish() {
    var b = $('#bPublish'); b.disabled = true;
    var probs = [];
    S().questions.forEach(function (q) { qProblems(q).forEach(function (p) { probs.push(p); }); });
    pushHist();
    save().then(function (ok) {
      if (!ok) throw new Error('ابتدا باید تغییرات ذخیره شود.');
      return fetch(URLS.publish, { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRFToken': csrf(), 'X-Requested-With': 'XMLHttpRequest' } })
        .then(function (r) { return r.json().catch(function () { return { error: 'خطا در انتشار' }; }); });
    }).then(function (j) {
      b.disabled = false;
      if (!j.ok) {
        toast(j.error || 'انتشار انجام نشد.', 'error');
        var bad = S().questions.filter(function (q) { return qProblems(q).length; })[0];
        if (bad) { select({ k: 'q', id: bad.id }); insTab = 'q'; renderIns(); setTimeout(function () { toast('سؤال‌های دارای علامت ⚠ را کامل کنید: ' + probs.slice(0, 2).join(' · '), 'warning'); }, 300); }
        return;
      }
      version = j.version; hasUnpub = false; updPub();
      var pill = $('.shead__in > .pill');
      if (pill) { pill.className = 'pill pill--' + j.status; pill.textContent = { published: 'منتشر شده', closed: 'بسته', draft: 'پیش‌نویس' }[j.status] || j.status; }
      toast('نسخه ' + fa(j.version) + ' منتشر شد', 'success');
    }).catch(function (e) { b.disabled = false; toast(e.message, 'error'); });
  }
  function preview() {
    var w = window.open('about:blank', '_blank');
    pushHist();
    save().then(function () { if (w) w.location = URLS.preview; else window.open(URLS.preview, '_blank'); });
  }

  // ───────────────────────── بارگذاری تصویر ─────────────────────────
  var fileIn = $('#bFile');
  function upload(cb) {
    fileIn.value = '';
    fileIn.onchange = function () {
      var f = fileIn.files[0]; if (!f) return;
      if (f.size > 3 * 1024 * 1024) { toast('حجم تصویر حداکثر ۳ مگابایت است.', 'error'); return; }
      var fd = new FormData(); fd.append('file', f);
      toast('در حال بارگذاری تصویر…', 'info');
      fetch(URLS.image, { method: 'POST', body: fd, credentials: 'same-origin', headers: { 'X-CSRFToken': csrf() } })
        .then(function (r) { return r.json(); })
        .then(function (j) { if (j.url) cb(j.url); else toast(j.error || 'بارگذاری نشد.', 'error'); })
        .catch(function () { toast('بارگذاری نشد.', 'error'); });
    };
    fileIn.click();
  }

  // ───────────────────────── پنجره‌ها ─────────────────────────
  var dlg = $('#bDlg');
  function ask(title, body, okLabel, danger) {
    return new Promise(function (res) {
      $('#bDlgT').textContent = title;
      var bd = $('#bDlgB'); bd.innerHTML = ''; add(bd, typeof body === 'string' ? h('p', { text: body }) : body);
      var ok = $('#bDlgOk'); ok.textContent = okLabel || 'تأیید'; ok.className = 'b ' + (danger ? 'b--d bd-dlg__danger' : 'b--p');
      dlg.returnValue = '';
      dlg.onclose = function () { res(dlg.returnValue === 'ok'); };
      if (dlg.showModal) dlg.showModal(); else res(window.confirm(title));
    });
  }
  var pop = $('#bPop');
  function showPop(anchor, list) {
    pop.innerHTML = '';
    list.forEach(function (it) {
      if (it.head) { pop.appendChild(h('div', { class: 'bd-pop__h', text: it.head })); return; }
      pop.appendChild(h('button', { type: 'button', class: 'bd-pop__i', on: { click: function () { closePop(); it.run(); } } },
        it.icon ? icon(it.icon, 15) : null, h('span', { text: it.label }), it.sub ? h('small', { class: 'mono', text: it.sub }) : null));
    });
    if (!list.length) pop.appendChild(h('div', { class: 'bd-pop__h', text: 'موردی نیست' }));
    pop.hidden = false;
    var r = anchor.getBoundingClientRect(), pw = Math.min(300, window.innerWidth - 16);
    pop.style.width = pw + 'px';
    var left = Math.min(Math.max(8, r.right - pw), window.innerWidth - pw - 8);
    var top = r.bottom + 6;
    pop.style.left = left + 'px'; pop.style.top = top + 'px';
    var ph = pop.offsetHeight;
    if (top + ph > window.innerHeight - 8) pop.style.top = Math.max(8, r.top - ph - 6) + 'px';
    var f = pop.querySelector('button'); if (f) f.focus();
  }
  function closePop() { pop.hidden = true; }
  document.addEventListener('mousedown', function (e) { if (!pop.hidden && !pop.contains(e.target) && !e.target.closest('[data-pop]')) closePop(); });

  // ───────────────────────── جاگذاری پاسخ‌ها (piping) ─────────────────────────
  var TOKEN = /\{\{\s*(q|var|hidden):([A-Za-z0-9_-]+)\s*\}\}/g;
  function knownHidden() {
    var set = {}, txt = JSON.stringify(st.schema);
    txt.replace(/hidden:([A-Za-z0-9_-]+)/g, function (_, n) { set[n] = 1; });
    return Object.keys(set);
  }
  function pipeBtn(input, beforeQ) {
    return h('button', { type: 'button', class: 'bd-pipe', title: 'درج پاسخ یا متغیر در متن', 'aria-label': 'درج پاسخ یا متغیر', data: { pop: '1' }, on: { click: function (e) {
      var list = [], qs = S().questions, stop = beforeQ ? qIndex(beforeQ) : qs.length;
      list.push({ head: 'پاسخ سؤال‌ها' });
      qs.slice(0, stop < 0 ? qs.length : stop).filter(answerable).forEach(function (q) {
        list.push({ label: fa(qNumber(q)) + '. ' + shortName(q, 34), icon: TI[q.type], run: function () { insertAt(input, '{{q:' + q.id + '}}'); } });
      });
      if (list.length === 1) list.push({ head: '— سؤال قبلی وجود ندارد —' });
      list.push({ head: 'متغیرها' });
      list.push({ label: 'امتیاز کل', sub: 'score', icon: 'award', run: function () { insertAt(input, '{{var:score}}'); } });
      S().variables.forEach(function (v) { list.push({ label: v.label || v.name, sub: v.name, icon: 'database', run: function () { insertAt(input, '{{var:' + v.name + '}}'); } }); });
      list.push({ head: 'فیلدهای مخفی (از آدرس لینک)' });
      knownHidden().forEach(function (n) { list.push({ label: n, icon: 'tag', run: function () { insertAt(input, '{{hidden:' + n + '}}'); } }); });
      list.push({ label: 'فیلد مخفی دیگر…', icon: 'plus', run: function () {
        var n = (window.prompt('نام فیلد مخفی (حروف انگلیسی، مثل ref):') || '').trim();
        if (/^[A-Za-z0-9_-]+$/.test(n)) insertAt(input, '{{hidden:' + n + '}}'); else if (n) toast('نام فقط با حروف انگلیسی، عدد و _ مجاز است.', 'error');
      } });
      showPop(e.currentTarget, list);
    } } }, icon('code', 15));
  }
  function insertAt(input, text) {
    var s = input.selectionStart == null ? input.value.length : input.selectionStart, e2 = input.selectionEnd == null ? s : input.selectionEnd;
    input.value = input.value.slice(0, s) + text + input.value.slice(e2);
    input.focus(); input.setSelectionRange(s + text.length, s + text.length);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function tokenLabel(kind, key) {
    if (kind === 'q') { var q = qById(key); return q ? 'پاسخ: ' + shortName(q, 22) : 'سؤال حذف‌شده'; }
    if (kind === 'var') { if (key === 'score') return 'امتیاز'; var v = S().variables.filter(function (x) { return x.name === key; })[0]; return v ? (v.label || v.name) : key; }
    return key;
  }
  function piped(text, ph) {
    var f = document.createDocumentFragment(), last = 0, m;
    text = text || '';
    if (!text.trim()) { f.appendChild(h('span', { class: 'cv-ph', text: ph || '' })); return f; }
    TOKEN.lastIndex = 0;
    while ((m = TOKEN.exec(text))) {
      if (m.index > last) f.appendChild(document.createTextNode(text.slice(last, m.index)));
      f.appendChild(h('span', { class: 'tok tok--' + m[1], text: tokenLabel(m[1], m[2]) }));
      last = m.index + m[0].length;
    }
    if (last < text.length) f.appendChild(document.createTextNode(text.slice(last)));
    return f;
  }

  // ───────────────────────── عملیات روی سؤال‌ها ─────────────────────────
  function select(s, opts) {
    opts = opts || {};
    sel = s;
    if (s.k === 'q' || s.k === 'welcome' || s.k === 'ending') cvSel = s;
    if (s.k === 'q') lastIdx = qIndex(s.id);
    renderAll();
    if (opts.mobile !== false && isMobile()) setMTab(opts.mtab || 'ins');
  }
  function addQuestion(t, at) {
    if (t === 'file' && !PLAN.file_upload) { lockToast('سؤال آپلود فایل'); return; }
    var q = newQuestion(t), qs = S().questions;
    if (at == null) { var i = sel.k === 'q' ? qIndex(sel.id) : -1; at = i >= 0 ? i + 1 : qs.length; }
    qs.splice(at, 0, q);
    sel = cvSel = { k: 'q', id: q.id }; insTab = 'q'; lastIdx = at;
    change({ ins: true });
    if (isMobile()) setMTab('ins');
    var ti = $('[data-k="q.title"]', $('#bIns')); if (ti) ti.focus();
    setTimeout(function () { var li = $('.ol-q[data-id="' + q.id + '"]'); if (li) li.scrollIntoView({ block: 'nearest' }); }, 40);
  }
  function remapIds(q) {
    var o = q.opt, map = {};
    ['choices', 'rows', 'cols', 'items'].forEach(function (k) {
      if (Array.isArray(o[k])) o[k].forEach(function (c) { var n = uid(c.id.split('_')[0] || 'c'); map[c.id] = n; c.id = n; });
    });
    return map;
  }
  function duplicate(id) {
    var i = qIndex(id); if (i < 0) return;
    var q = clone(S().questions[i]), old = q.id;
    q.id = uid('q');
    var map = remapIds(q);
    var fix = function (g) { if (g) g.conds.forEach(function (c) { if (c.src === old) { c.src = q.id; if (map[c.value]) c.value = map[c.value]; } }); };
    fix(q.show_if); q.jumps.forEach(fix);
    S().questions.splice(i + 1, 0, q);
    sel = cvSel = { k: 'q', id: q.id };
    change({ ins: true });
    toast('کپی سؤال ساخته شد');
  }
  function move(id, d) {
    var qs = S().questions, i = qIndex(id), j = i + d;
    if (i < 0 || j < 0 || j >= qs.length) return;
    qs.splice(j, 0, qs.splice(i, 1)[0]);
    change();
    setTimeout(function () { var li = $('.ol-q[data-id="' + id + '"]'); if (li) li.focus(); }, 30);
  }
  // همه‌ی جاهایی که به یک منبع (سؤال/متغیر/پایان) ارجاع داده‌اند
  function groupsOf(s) {
    var out = [];
    s.questions.forEach(function (q) {
      if (q.show_if) out.push({ g: q.show_if, kind: 'show', q: q });
      q.jumps.forEach(function (j) { out.push({ g: j, kind: 'jump', q: q }); });
    });
    s.endings.forEach(function (e) { if (e.when) out.push({ g: e.when, kind: 'end', e: e }); });
    s.calcs.forEach(function (c) { out.push({ g: c, kind: 'calc', c: c }); });
    return out;
  }
  function refsTo(src, tokenRe) {
    var n = 0, s = S();
    groupsOf(s).forEach(function (x) { x.g.conds.forEach(function (c) { if (c.src === src) n++; }); });
    s.calcs.forEach(function (c) { if (c.value === '@' + src) n++; });
    if (tokenRe) {
      var texts = [s.welcome.title, s.welcome.text];
      s.questions.forEach(function (q) { texts.push(q.title, q.description); });
      s.endings.forEach(function (e) { texts.push(e.title, e.text); });
      texts.forEach(function (t) { var m = (t || '').match(tokenRe); if (m) n += m.length; });
    }
    return n;
  }
  function stripRefs(src, tokenRe) {
    var s = S();
    var clean = function (g) { g.conds = g.conds.filter(function (c) { return c.src !== src; }); return g.conds.length > 0; };
    s.questions.forEach(function (q) {
      if (q.show_if && !clean(q.show_if)) q.show_if = null;
      q.jumps = q.jumps.filter(function (j) { return clean(j); });
    });
    s.endings.forEach(function (e) { if (e.when && !clean(e.when)) e.when = null; });
    s.calcs = s.calcs.filter(function (c) {
      var had = c.conds.length;
      return clean(c) || !had ? c.value !== '@' + src : false;
    });
    if (tokenRe) {
      var f = function (t) { return (t || '').replace(tokenRe, ''); };
      s.welcome.title = f(s.welcome.title); s.welcome.text = f(s.welcome.text);
      s.questions.forEach(function (q) { q.title = f(q.title); q.description = f(q.description); });
      s.endings.forEach(function (e) { e.title = f(e.title); e.text = f(e.text); });
    }
  }
  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function delQuestion(id) {
    var q = qById(id); if (!q) return;
    var re = new RegExp('\\{\\{\\s*q:' + esc(id) + '\\s*\\}\\}', 'g');
    var n = refsTo(id, re), gotoN = 0;
    S().questions.forEach(function (x) { x.jumps.forEach(function (j) { if (j.goto === id) gotoN++; }); });
    var go = function () {
      lastIdx = qIndex(id);
      stripRefs(id, re);
      S().questions.forEach(function (x) { x.jumps = x.jumps.filter(function (j) { return j.goto !== id; }); });
      S().questions.splice(qIndex(id), 1);
      fixSel(); change({ ins: true });
    };
    if (n + gotoN) {
      ask('حذف سؤال «' + shortName(q, 30) + '»',
        h('div', {}, h('p', { text: 'این سؤال در ' + fa(n + gotoN) + ' جای منطق، محاسبه یا متن فرم استفاده شده است.' }),
          h('p', { class: 'muted small', text: 'با حذف، این شرط‌ها، پرش‌ها و ارجاع‌ها هم پاک می‌شوند. (با Ctrl+Z برمی‌گردد.)' })), 'حذف سؤال و ارجاع‌ها', true)
        .then(function (ok) { if (ok) go(); });
    } else go();
  }
  function delEnding(id) {
    if (S().endings.length < 2) { toast('دست‌کم یک صفحه‌ی پایان لازم است.', 'warning'); return; }
    var n = 0;
    S().questions.forEach(function (q) { q.jumps.forEach(function (j) { if (j.goto === 'ending:' + id) n++; }); });
    var go = function () {
      S().questions.forEach(function (q) { q.jumps = q.jumps.filter(function (j) { return j.goto !== 'ending:' + id; }); });
      S().endings = S().endings.filter(function (e) { return e.id !== id; });
      sel = cvSel = { k: 'ending', id: S().endings[0].id };
      change({ ins: true });
    };
    if (n) ask('حذف صفحه‌ی پایان', fa(n) + ' قاعده‌ی پرش به این صفحه می‌رسد و با حذف آن پاک می‌شود.', 'حذف', true).then(function (ok) { if (ok) go(); });
    else go();
  }
  function addEnding() {
    var e = { id: uid('e'), title: 'صفحه‌ی پایان جدید', text: '', button_text: '', button_url: '', redirect_url: '', show_score: false, when: null };
    S().endings.push(e);
    sel = cvSel = { k: 'ending', id: e.id };
    change({ ins: true });
    if (isMobile()) setMTab('ins');
  }
  function changeType(q, t) {
    if (t === q.type) return;
    if (t === 'file' && !PLAN.file_upload) { lockToast('سؤال آپلود فایل'); renderIns(); return; }
    var old = q.opt; q.opt = defaultOpt(t);
    var same = ['choice', 'dropdown'];
    if (same.indexOf(t) >= 0 && same.indexOf(q.type) >= 0) { q.opt.choices = old.choices; q.opt.other = old.other; q.opt.other_label = old.other_label; q.opt.shuffle = old.shuffle; }
    else if (t === 'ranking' && old.choices) q.opt.items = old.choices.map(function (c) { return { id: c.id, label: c.label }; });
    else if (same.indexOf(t) >= 0 && old.items) q.opt.choices = old.items.map(function (c) { return { id: c.id, label: c.label, score: 0 }; });
    if ('placeholder' in old && 'placeholder' in q.opt) q.opt.placeholder = old.placeholder;
    q.type = t;
    if (t === 'statement') q.required = false;
    change({ ins: true });
  }
  function lockToast(what) { toast((what ? what + ' ' : '') + 'در پلن «' + (B.plan_name || '') + '» فعال نیست؛ برای استفاده پلن را ارتقا دهید.', 'warning'); }
  function lockBadge() {
    return h('a', { class: 'lock bd-lock', href: URLS.billing, target: '_blank', title: 'مشاهده‌ی پلن‌ها' }, icon('lock', 12), ' نیاز به ارتقا');
  }
  function qProblems(q) {
    var p = [], o = q.opt || {}, n = '«' + shortName(q, 24) + '»';
    if (!q.title.trim()) p.push('سؤالی بدون عنوان هست');
    if ((q.type === 'choice' || q.type === 'dropdown') && !(o.choices || []).length) p.push(n + ' گزینه ندارد');
    if ((q.type === 'choice' || q.type === 'dropdown') && (o.choices || []).some(function (c) { return !c.label.trim(); })) p.push(n + ' گزینه‌ی بدون متن دارد');
    if (q.type === 'matrix' && (!(o.rows || []).length || !(o.cols || []).length)) p.push(n + ' ردیف یا ستون ندارد');
    if (q.type === 'ranking' && (o.items || []).length < 2) p.push(n + ' دست‌کم دو مورد لازم دارد');
    if (q.type === 'file' && !PLAN.file_upload) p.push(n + ' در پلن فعلی ذخیره نمی‌شود');
    return p;
  }

  // ───────────────────────── موبایل ─────────────────────────
  var mq = window.matchMedia('(max-width: 979.98px)');
  var isMobile = function () { return mq.matches; };
  function setMTab(t) {
    root.dataset.mtab = t;
    if (t === 'canvas') { lastScrolled = null; renderCanvas(); }
    $$('.bd-mtabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.mt === t); });
  }
  $$('.bd-mtabs button').forEach(function (b) { b.addEventListener('click', function () { setMTab(b.dataset.mt); }); });

  // ───────────────────────── ستون ۱: انواع سؤال ─────────────────────────
  function renderPalette() {
    var box = $('#bPalList'); box.innerHTML = '';
    GROUPS.forEach(function (g) {
      var list = h('div', { class: 'pal-l', data: { group: g[0] } });
      Object.keys(TYPES).filter(function (t) { return TYPES[t].group === g[0]; }).forEach(function (t) {
        var locked = t === 'file' && !PLAN.file_upload;
        list.appendChild(h('button', { type: 'button', class: 'pal-i' + (locked ? ' is-locked' : ''), data: { type: t }, title: 'افزودن «' + tLabel(t) + '»' + (locked ? ' — نیاز به ارتقا' : ''),
          style: '--gc:' + GCOLOR[g[0]], on: { click: function () { if (locked) lockToast('سؤال آپلود فایل'); else addQuestion(t); } } },
          h('span', { class: 'pal-ic' }, icon(TI[t], 16)), h('span', { class: 'pal-t', text: tLabel(t) }), locked ? icon('lock', 13) : null));
      });
      box.appendChild(h('div', { class: 'pal-g' }, h('div', { class: 'pal-h', text: g[1] }), list));
      if (window.Sortable) {
        new window.Sortable(list, { group: { name: 'types', pull: 'clone', put: false }, sort: false, animation: 150, delay: 120, delayOnTouchOnly: true,
          filter: '.is-locked', fallbackOnBody: true, ghostClass: 'pal-ghost' });
      }
    });
    box.appendChild(h('p', { class: 'help bd-tip', text: 'روی هر نوع کلیک کنید یا آن را به «ساختار فرم» بکشید.' }));
  }

  // ───────────────────────── ستون ۲: ساختار ─────────────────────────
  var olSortable = null, endSortable = null;
  function olItem(opts) {
    return h('button', { type: 'button', class: 'ol-sp' + (opts.on ? ' on' : ''), on: { click: opts.click } },
      h('span', { class: 'ol-sp__i' }, icon(opts.icon, 16)), h('span', { class: 'ol-t', text: opts.label }), opts.extra || null);
  }
  function renderOutline() {
    var box = $('#bOutList'), s = S(), scrollTop = box.scrollTop;
    var act = document.activeElement, actId = act && act.closest && act.closest('.ol-q') ? act.closest('.ol-q').dataset.id : null;
    box.innerHTML = '';
    $('#bCount').textContent = fa(s.questions.filter(answerable).length) + ' سؤال';

    box.appendChild(olItem({ icon: 'home', label: 'صفحه‌ی خوش‌آمد', on: sel.k === 'welcome', click: function () { select({ k: 'welcome' }); },
      extra: s.welcome.enabled ? null : h('span', { class: 'pill', text: 'خاموش' }) }));

    box.appendChild(h('div', { class: 'ol-h' }, h('span', { text: 'سؤال‌ها' })));
    var ol = h('ol', { class: 'ol-qs', id: 'olQs', 'aria-label': 'سؤال‌ها' });
    s.questions.forEach(function (q) {
      var n = qNumber(q), probs = qProblems(q), g = tGroup(q.type);
      var badges = h('span', { class: 'ol-bd' });
      if (q.show_if) badges.appendChild(h('span', { class: 'ol-b ol-b--if', title: 'نمایش شرطی' }, icon('filter', 12)));
      if (q.jumps.length) badges.appendChild(h('span', { class: 'ol-b ol-b--jump', title: fa(q.jumps.length) + ' قاعده‌ی پرش' }, icon('redirect', 12), q.jumps.length > 1 ? fa(q.jumps.length) : null));
      if (probs.length) badges.appendChild(h('span', { class: 'ol-b ol-b--warn', title: probs.join('، ') }, icon('alert', 12)));
      var li = h('li', { class: 'ol-q' + (sel.k === 'q' && sel.id === q.id ? ' on' : ''), tabindex: '0', role: 'button', data: { id: q.id },
        'aria-label': (n ? 'سؤال ' + fa(n) + ': ' : '') + qName(q), style: '--gc:' + GCOLOR[g],
        on: { click: function () { select({ k: 'q', id: q.id }); }, keydown: function (e) { olKey(e, q.id); } } },
        h('span', { class: 'ol-grip', title: 'جابه‌جا کنید' }, icon('grip', 14)),
        h('span', { class: 'ol-n', title: tLabel(q.type) }, icon(TI[q.type], 13), h('b', { text: n ? fa(n) : '' })),
        h('span', { class: 'ol-t' + (q.title.trim() ? '' : ' is-empty') }, q.title.trim() ? piped(q.title) : 'بدون عنوان', q.required ? h('span', { class: 'ol-req', text: '*' }) : null),
        badges,
        h('span', { class: 'ol-a' },
          h('button', { type: 'button', class: 'ol-ab', title: 'کپی (Ctrl+D)', 'aria-label': 'کپی', on: { click: function (e) { e.stopPropagation(); duplicate(q.id); } } }, icon('copy', 14)),
          h('button', { type: 'button', class: 'ol-ab ol-ab--d', title: 'حذف (Delete)', 'aria-label': 'حذف', on: { click: function (e) { e.stopPropagation(); delQuestion(q.id); } } }, icon('trash', 14))));
      ol.appendChild(li);
    });
    box.appendChild(ol);
    if (!s.questions.length) box.appendChild(h('p', { class: 'ol-empty', text: 'هنوز سؤالی ندارید. از ستون «افزودن سؤال» یک نوع را انتخاب کنید یا به اینجا بکشید.' }));
    box.appendChild(h('button', { type: 'button', class: 'ol-add', data: { pop: '1' }, on: { click: function (e) { addMenu(e.currentTarget); } } }, icon('plus', 15), ' افزودن سؤال'));

    box.appendChild(h('div', { class: 'ol-h' }, h('span', { text: 'صفحه‌های پایان' }),
      h('button', { type: 'button', class: 'ol-hb', title: 'افزودن صفحه‌ی پایان', on: { click: addEnding } }, icon('plus', 14))));
    var de = defaultEnding();
    var eol = h('ol', { class: 'ol-ends' });
    s.endings.forEach(function (e) {
      eol.appendChild(h('li', { class: 'ol-sp ol-end' + (sel.k === 'ending' && sel.id === e.id ? ' on' : ''), tabindex: '0', role: 'button', data: { id: e.id },
        on: { click: function () { select({ k: 'ending', id: e.id }); }, keydown: function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); select({ k: 'ending', id: e.id }); } } } },
        h('span', { class: 'ol-sp__i' }, icon('flag', 16)), h('span', { class: 'ol-t' }, piped(e.title, 'بدون عنوان')),
        e.when ? h('span', { class: 'ol-b ol-b--if', title: 'شرطی' }, icon('filter', 12)) : null,
        e === de ? h('span', { class: 'pill pill--p', text: 'پیش‌فرض' }) : null));
    });
    box.appendChild(eol);

    box.appendChild(h('div', { class: 'ol-h' }, h('span', { text: 'تنظیمات فرم' })));
    box.appendChild(olItem({ icon: 'database', label: 'متغیرها و محاسبات', on: sel.k === 'vars', click: function () { select({ k: 'vars' }); },
      extra: PLAN.calcs ? (S().variables.length || S().calcs.length ? h('span', { class: 'pill', text: fa(S().calcs.length) + ' محاسبه' }) : null) : icon('lock', 13) }));
    box.appendChild(olItem({ icon: 'palette', label: 'ظاهر و رنگ‌ها', on: sel.k === 'theme', click: function () { select({ k: 'theme' }); },
      extra: h('span', { class: 'ol-sw', style: 'background:' + S().theme.primary }) }));
    box.appendChild(olItem({ icon: 'settings', label: 'تنظیمات نمایش', on: sel.k === 'settings', click: function () { select({ k: 'settings' }); } }));

    box.scrollTop = scrollTop;
    if (actId) { var f = $('.ol-q[data-id="' + actId + '"]', box); if (f) f.focus({ preventScroll: true }); }

    if (window.Sortable) {
      if (olSortable) olSortable.destroy();
      olSortable = new window.Sortable(ol, { group: { name: 'qs', put: ['types'] }, handle: '.ol-grip', animation: 160, ghostClass: 'ol-ghost', fallbackOnBody: true,
        onAdd: function (ev) { var t = ev.item.dataset.type; ev.item.remove(); if (t) addQuestion(t, ev.newIndex); },
        onEnd: function (ev) {
          if (ev.from !== ev.to || ev.oldIndex === ev.newIndex) return;
          var qs = S().questions; qs.splice(ev.newIndex, 0, qs.splice(ev.oldIndex, 1)[0]); change();
        } });
      if (endSortable) endSortable.destroy();
      endSortable = new window.Sortable(eol, { animation: 160, ghostClass: 'ol-ghost', onEnd: function (ev) {
        if (ev.oldIndex === ev.newIndex) return;
        var es = S().endings; es.splice(ev.newIndex, 0, es.splice(ev.oldIndex, 1)[0]); change({ ins: sel.k === 'ending' });
      } });
    }
  }
  function defaultEnding() { return S().endings.filter(function (e) { return !e.when; })[0] || S().endings[0]; }
  function addMenu(anchor) {
    var list = [];
    GROUPS.forEach(function (g) {
      list.push({ head: g[1] });
      Object.keys(TYPES).filter(function (t) { return TYPES[t].group === g[0]; }).forEach(function (t) {
        list.push({ label: tLabel(t) + (t === 'file' && !PLAN.file_upload ? ' 🔒' : ''), icon: TI[t], run: function () { addQuestion(t); } });
      });
    });
    showPop(anchor, list);
  }
  function olKey(e, id) {
    var i = qIndex(id), qs = S().questions, mod = e.ctrlKey || e.metaKey;
    if (e.target !== e.currentTarget) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      var d = e.key === 'ArrowDown' ? 1 : -1;
      if (e.altKey) { move(id, d); return; }
      var n = qs[i + d]; if (!n) return;
      select({ k: 'q', id: n.id }, { mobile: false });
      var li = $('.ol-q[data-id="' + n.id + '"]'); if (li) li.focus();
    } else if (e.key === 'Delete') { e.preventDefault(); delQuestion(id); }
    else if (mod && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); duplicate(id); }
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault(); select({ k: 'q', id: id });
      setTimeout(function () { var t = $('[data-k="q.title"]'); if (t) t.focus(); }, 20);
    }
  }

  // ───────────────────────── ستون ۳: پیش‌نمایش ─────────────────────────
  var RAD = { none: '0px', sm: '6px', md: '12px', lg: '18px' }, FS = { sm: '14px', md: '16px', lg: '18px' };
  var CONTACT_PH = { email: 'name@example.com', mobile: '۰۹۱۲ ۳۴۵ ۶۷۸۹', phone: '۰۳۱ ۵۵۵۵ ۵۵۵۵', national_code: '۰۰۱۲۳۴۵۶۷۸', url: 'www.example.com' };
  function focusField(k, s) {
    return function (e) {
      e.stopPropagation();
      if (s && (sel.k !== s.k || sel.id !== s.id)) select(s, { mobile: false });
      if (isMobile()) setMTab('ins');
      if (k.indexOf('q.opt') === 0 || k.indexOf('it.') === 0) insTab = 'q';
      var f = $('[data-k="' + k + '"]', $('#bIns'));
      if (!f && insTab !== 'q') { insTab = 'q'; renderIns(); f = $('[data-k="' + k + '"]', $('#bIns')); }
      if (f) { f.focus(); f.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    };
  }
  function cvInput(q) {
    var o = q.opt || {}, t = q.type, s = { k: 'q', id: q.id };
    var line = function (ph, cls) { return h('div', { class: 'cv-line ' + (cls || ''), on: { click: focusField('q.opt.placeholder', s) } }, h('span', { text: ph })); };
    if (t === 'short_text') return line(o.placeholder || 'پاسخ خود را بنویسید…');
    if (t === 'long_text') return line(o.placeholder || 'پاسخ خود را بنویسید…', 'cv-area');
    if (t === 'number' || t === 'price') return h('div', { class: 'cv-line', on: { click: focusField('q.opt.placeholder', s) } }, h('span', { text: o.placeholder || (t === 'price' ? '۰' : 'عدد را وارد کنید') }), h('b', { class: 'cv-unit', text: t === 'price' ? 'تومان' : (o.unit || '') }));
    if (CONTACT_PH[t]) return h('div', { class: 'cv-line cv-ltr', on: { click: focusField('q.opt.placeholder', s) } }, h('span', { text: o.placeholder || CONTACT_PH[t] }));
    if (t === 'date') return h('div', { class: 'cv-line' }, icon('clock', 18), h('span', { text: '۱۴۰۵/۰۱/۰۱' + (o.birth ? ' — تاریخ تولد' : '') }));
    if (t === 'choice') {
      var box = h('div', { class: 'cv-ch cv-ch--' + (o.layout || 'list') + (o.multiple ? ' is-multi' : '') });
      (o.choices || []).forEach(function (c, i) {
        box.appendChild(h('div', { class: 'cv-opt' + (c.image ? ' has-img' : ''), on: { click: focusField('it.' + c.id, s) } },
          c.image ? h('img', { src: c.image, alt: '' }) : null,
          h('span', { class: 'cv-key', text: fa(i + 1) }), h('span', { class: 'cv-ol' }, c.label || h('i', { class: 'cv-ph', text: 'گزینه‌ی بدون متن' }))));
      });
      if (o.other) box.appendChild(h('div', { class: 'cv-opt', on: { click: focusField('q.opt.other_label', s) } }, h('span', { class: 'cv-key', text: fa((o.choices || []).length + 1) }), h('span', { text: (o.other_label || 'سایر') + '…' })));
      var hint = o.multiple ? (o.max_select ? 'حداکثر ' + fa(o.max_select) + ' گزینه' : 'چند گزینه قابل انتخاب است') + (o.min_select ? ' · دست‌کم ' + fa(o.min_select) : '') : '';
      return h('div', {}, hint ? h('div', { class: 'cv-hint', text: hint }) : null, box);
    }
    if (t === 'dropdown') return h('div', {}, h('div', { class: 'cv-line cv-select' }, h('span', { text: 'انتخاب کنید…' }), icon('chevron-down', 18)),
      h('div', { class: 'cv-hint', text: fa((o.choices || []).length) + ' گزینه' + (o.other ? ' + «' + (o.other_label || 'سایر') + '»' : '') }));
    if (t === 'yes_no') return h('div', { class: 'cv-yn' }, h('div', { class: 'cv-opt', on: { click: focusField('q.opt.yes_label', s) } }, icon('check', 18), o.yes_label || 'بله'), h('div', { class: 'cv-opt', on: { click: focusField('q.opt.no_label', s) } }, icon('x', 18), o.no_label || 'خیر'));
    if (t === 'rating') {
      var r = h('div', { class: 'cv-rate cv-rate--' + o.shape });
      for (var i = 1; i <= (o.max || 5); i++) r.appendChild(h('span', { class: i <= 3 ? 'on' : '' }, o.shape === 'number' ? fa(i) : o.shape === 'heart' ? '♥' : o.shape === 'like' ? '👍' : '★'));
      return r;
    }
    if (t === 'scale') {
      var sc = h('div', { class: 'cv-scale' + (o.nps ? ' is-nps' : '') });
      for (var k = o.min; k <= o.max; k++) sc.appendChild(h('span', { class: o.nps ? (k <= 6 ? 'n-d' : k <= 8 ? 'n-p' : 'n-g') : '', text: fa(k) }));
      return h('div', {}, sc, (o.min_label || o.max_label) ? h('div', { class: 'cv-scale-l' }, h('span', { text: o.min_label }), h('span', { text: o.max_label })) : null);
    }
    if (t === 'matrix') {
      var tb = h('table', { class: 'cv-mx' }), tr = h('tr', {}, h('th'));
      (o.cols || []).forEach(function (c) { tr.appendChild(h('th', { on: { click: focusField('it.' + c.id, s) } }, c.label)); });
      tb.appendChild(h('thead', {}, tr));
      var body = h('tbody');
      (o.rows || []).forEach(function (rw) {
        var row = h('tr', {}, h('td', { on: { click: focusField('it.' + rw.id, s) } }, rw.label));
        (o.cols || []).forEach(function () { row.appendChild(h('td', {}, h('i', { class: o.multiple ? 'cv-cb' : 'cv-rd' }))); });
        body.appendChild(row);
      });
      tb.appendChild(body);
      return h('div', { class: 'cv-mx-w' }, tb);
    }
    if (t === 'ranking') return h('div', { class: 'cv-rank' }, (o.items || []).map(function (it, i) {
      return h('div', { class: 'cv-opt', on: { click: focusField('it.' + it.id, s) } }, icon('grip', 16), h('span', { class: 'cv-key', text: fa(i + 1) }), it.label);
    }));
    if (t === 'location') return h('div', { class: 'cv-loc' }, h('div', { class: 'cv-line cv-select' }, h('span', { text: 'استان' }), icon('chevron-down', 16)),
      o.ask_city ? h('div', { class: 'cv-line' }, h('span', { text: 'شهر' })) : null);
    if (t === 'file') return h('div', { class: 'cv-drop' }, icon('upload', 26), h('b', { text: 'فایل را اینجا رها کنید یا انتخاب کنید' }),
      h('small', { class: 'cv-ltr', text: (o.types || []).join(', ') }), h('small', { text: 'حداکثر ' + fa(o.max_mb || 5) + ' مگابایت' }));
    if (t === 'signature') return h('div', { class: 'cv-drop cv-sign' }, icon('edit', 22), h('small', { text: 'اینجا امضا کنید' }));
    if (t === 'consent') return h('label', { class: 'cv-consent', on: { click: focusField('q.opt.label', s) } }, h('i', { class: 'cv-cb' }), h('span', { text: o.label || '' }));
    return null;
  }
  function cvQuestion(q, opts) {
    opts = opts || {};
    var th = S().theme, set = S().settings, n = qNumber(q), s = { k: 'q', id: q.id };
    return h('div', { class: 'cv-q' + (opts.on ? ' on' : ''), data: { qid: q.id }, on: opts.all ? { click: function () { if (sel.id !== q.id) select(s, { mobile: false, keepTab: true }); } } : null },
      h('div', { class: 'cv-qh' },
        set.numbering && n ? h('span', { class: 'cv-num' }, fa(n), h('i', { text: '←' })) : null,
        h('h3', { class: 'cv-title', on: { click: focusField('q.title', s) } }, piped(q.title, 'عنوان سؤال را بنویسید…'), q.required ? h('span', { class: 'cv-req', text: '*' }) : null)),
      (q.description || '').trim() ? h('p', { class: 'cv-desc', on: { click: focusField('q.description', s) } }, piped(q.description)) : null,
      q.image ? h('img', { class: 'cv-img', src: q.image, alt: '' }) : null,
      cvInput(q),
      opts.all ? null : h('div', { class: 'cv-btns' + (th.align === 'center' ? ' is-c' : '') },
        h('span', { class: 'cv-btn', on: q.type === 'statement' ? { click: focusField('q.opt.button', s) } : null, text: q.type === 'statement' ? (q.opt.button || 'ادامه') : 'تأیید' }),
        h('span', { class: 'cv-enter', text: 'یا Enter را بزنید' })));
  }
  function renderCanvas() {
    var cv = $('#bCanvas'), frame = $('#bFrame'), th = S().theme, set = S().settings, qs = S().questions;
    var keep = $('.bd-cv-scroll').scrollTop;
    frame.style.setProperty('--tbg', th.bg);
    frame.style.backgroundImage = th.bg_image ? 'url("' + th.bg_image.replace(/"/g, '%22') + '")' : '';
    cv.setAttribute('style', '--tp:' + th.primary + ';--tcard:' + th.card + ';--tt:' + th.text + ';--tr:' + (RAD[th.radius] || '18px') + ';--tfs:' + (FS[th.font_size] || '16px'));
    cv.className = 'cv' + (th.align === 'center' ? ' is-center' : '');
    cv.innerHTML = '';
    var crumb = $('#bCrumb'), idx = cvSel.k === 'q' ? qIndex(cvSel.id) : -1;
    crumb.innerHTML = '';
    var page = h('div', { class: 'cv-page' });
    if (th.logo) page.appendChild(h('img', { class: 'cv-logo', src: th.logo, alt: '' }));
    if (cvSel.k === 'q' && idx >= 0) {
      var q = qs[idx];
      add(crumb, [h('span', { class: 'bd-dot', style: 'background:' + GCOLOR[tGroup(q.type)] }), h('b', { text: tLabel(q.type) }), h('span', { class: 'muted', text: ' · ' + fa(idx + 1) + ' از ' + fa(qs.length) })]);
      if (set.progress && th.layout !== 'all') page.appendChild(h('div', { class: 'cv-prog' }, h('i', { style: 'width:' + Math.round(idx / Math.max(1, qs.length) * 100) + '%' })));
      var card = h('div', { class: 'cv-card' });
      if (th.layout === 'all') {
        if (S().welcome.enabled && S().welcome.title) card.appendChild(h('h2', { class: 'cv-ftitle' }, piped(S().welcome.title)));
        qs.forEach(function (x) { card.appendChild(cvQuestion(x, { all: true, on: x.id === q.id })); });
        card.appendChild(h('div', { class: 'cv-btns' }, h('span', { class: 'cv-btn', text: 'ارسال پاسخ‌ها' })));
      } else {
        if (q.show_if) card.appendChild(h('div', { class: 'cv-flag' }, icon('filter', 13), 'این سؤال فقط با برقراری شرط نمایش داده می‌شود'));
        card.appendChild(cvQuestion(q));
        if (set.allow_back && idx > 0) card.appendChild(h('span', { class: 'cv-back', title: 'بازگشت' }, icon('chevron', 16)));
      }
      page.appendChild(card);
    } else if (cvSel.k === 'ending' && endById(cvSel.id)) {
      var e = endById(cvSel.id);
      add(crumb, [h('span', { class: 'bd-dot', style: 'background:#7C5CFF' }), h('b', { text: 'صفحه‌ی پایان' }), e === defaultEnding() ? h('span', { class: 'muted', text: ' · پیش‌فرض' }) : null]);
      var es = { k: 'ending', id: e.id };
      page.appendChild(h('div', { class: 'cv-card cv-end' },
        h('div', { class: 'cv-endic' }, icon('check', 30)),
        h('h2', { class: 'cv-title', on: { click: focusField('e.title', es) } }, piped(e.title, 'عنوان صفحه‌ی پایان')),
        (e.text || '').trim() ? h('p', { class: 'cv-desc cv-pre', on: { click: focusField('e.text', es) } }, piped(e.text)) : null,
        e.show_score ? h('div', { class: 'cv-score' }, h('small', { text: 'امتیاز شما' }), h('b', { text: '۸' })) : null,
        e.button_text ? h('div', { class: 'cv-btns is-c' }, h('span', { class: 'cv-btn', text: e.button_text })) : null,
        e.redirect_url ? h('div', { class: 'cv-hint' }, icon('external', 13), ' انتقال خودکار به ', h('span', { class: 'cv-ltr', text: e.redirect_url })) : null));
    } else {
      var w = S().welcome, ws = { k: 'welcome' };
      add(crumb, [h('span', { class: 'bd-dot', style: 'background:' + th.primary }), h('b', { text: 'صفحه‌ی خوش‌آمد' }), w.enabled ? null : h('span', { class: 'muted', text: ' · غیرفعال' })]);
      page.appendChild(h('div', { class: 'cv-card cv-welcome' + (w.enabled ? '' : ' is-off') },
        w.image ? h('img', { class: 'cv-img', src: w.image, alt: '' }) : null,
        h('h2', { class: 'cv-title', on: { click: focusField('w.title', ws) } }, piped(w.title, st.title || 'عنوان خوش‌آمد')),
        h('p', { class: 'cv-desc cv-pre', on: { click: focusField('w.text', ws) } }, piped(w.text, 'متن معرفی فرم…')),
        h('div', { class: 'cv-btns' + (th.align === 'center' ? ' is-c' : '') }, h('span', { class: 'cv-btn', on: { click: focusField('w.button', ws) }, text: w.button || 'شروع' }),
          h('span', { class: 'cv-enter', text: fa(qs.filter(answerable).length) + ' سؤال' })),
        w.enabled ? null : h('div', { class: 'cv-off', text: 'صفحه‌ی خوش‌آمد غیرفعال است؛ فرم مستقیم با سؤال اول شروع می‌شود.' })));
    }
    if (set.show_branding) page.appendChild(h('div', { class: 'cv-brand', text: 'ساخته‌شده با ' + (root.dataset.brand || 'فرم‌ساز') }));
    cv.appendChild(page);
    $('.bd-cv-scroll').scrollTop = keep;
    if (th.layout === 'all' && cvSel.k === 'q') {
      var on = $('.cv-q.on', cv);
      if (on && cvSel.id !== lastScrolled) {
        lastScrolled = cvSel.id;
        var sc = $('.bd-cv-scroll'), r1 = on.getBoundingClientRect(), r0 = sc.getBoundingClientRect();
        sc.scrollTop += (r1.top - r0.top) - Math.max(16, (sc.clientHeight - r1.height) / 2);
      }
    }
    $('#bPrev').disabled = !prevTarget(); $('#bNext').disabled = !nextTarget();
  }
  var lastScrolled = null;
  function seq() {
    var a = [{ k: 'welcome' }];
    S().questions.forEach(function (q) { a.push({ k: 'q', id: q.id }); });
    S().endings.forEach(function (e) { a.push({ k: 'ending', id: e.id }); });
    return a;
  }
  function curPos() { var a = seq(); for (var i = 0; i < a.length; i++) if (a[i].k === cvSel.k && a[i].id === cvSel.id) return i; return 0; }
  function prevTarget() { return seq()[curPos() - 1]; }
  function nextTarget() { return seq()[curPos() + 1]; }
  $('#bPrev').addEventListener('click', function () { var t = prevTarget(); if (t) select(t, { mobile: false }); });
  $('#bNext').addEventListener('click', function () { var t = nextTarget(); if (t) select(t, { mobile: false }); });
  $$('.bd-seg [data-dev]').forEach(function (b) {
    b.addEventListener('click', function () {
      $$('.bd-seg [data-dev]').forEach(function (x) { x.classList.toggle('on', x === b); });
      $('#bFrame').classList.toggle('is-mob', b.dataset.dev === 'mob');
    });
  });

  // ───────────────────────── ستون ۴: ابزار فرم ─────────────────────────
  function fld(label, ctrl, help, extra) {
    return h('div', { class: 'f' }, label ? h('label', { class: 'f-l' }, label, extra || null) : null, ctrl, help ? h('div', { class: 'help', text: help }) : null);
  }
  function inp(k, val, on, o) {
    o = o || {};
    var el = h(o.area ? 'textarea' : 'input', { class: 'form-control form-control-sm' + (o.cls ? ' ' + o.cls : ''), data: { k: k }, value: val == null ? '' : val,
      placeholder: o.ph || '', type: o.area ? null : (o.type || 'text'), rows: o.area ? (o.rows || 2) : null, dir: o.dir || null, maxlength: o.max || null,
      inputmode: o.mode || null, disabled: o.disabled, 'aria-label': o.aria || null,
      on: { input: function () { on(el.value, el); change({ typing: true }); if (o.area) grow(el); } } });
    if (o.jdp) { el.setAttribute('data-jdp', ''); el.setAttribute('data-jdp-only-date', ''); el.setAttribute('autocomplete', 'off'); }
    if (o.area) setTimeout(function () { grow(el); }, 0);
    return el;
  }
  function grow(el) { el.style.height = 'auto'; el.style.height = Math.min(320, el.scrollHeight + 2) + 'px'; }
  function withPipe(el, beforeQ) { return h('div', { class: 'f-pipe' }, el, pipeBtn(el, beforeQ)); }
  function numIn(k, val, on, o) {
    o = o || {};
    return inp(k, val == null ? '' : fa(val), function (v) { on(parseNum(v)); }, { ph: o.ph, mode: 'decimal', cls: 'f-num', disabled: o.disabled, aria: o.aria });
  }
  function sw(label, on, cb, o) {
    o = o || {};
    var id = 'sw_' + Math.random().toString(36).slice(2, 8);
    var input = h('input', { class: 'form-check-input', type: 'checkbox', role: 'switch', id: id, checked: on, disabled: o.disabled,
      data: { k: o.k || '' }, on: { change: function () { cb(input.checked); change({ ins: o.ins !== false }); } } });
    return h('label', { class: 'f-sw' + (o.disabled ? ' is-off' : ''), for: id }, h('span', { class: 'f-sw__t' }, h('b', { text: label }), o.help ? h('small', { text: o.help }) : null), o.badge || null, h('span', { class: 'form-check form-switch m-0' }, input));
  }
  function seg(opts, val, cb, o) {
    o = o || {};
    return h('div', { class: 'f-seg' + (o.cls ? ' ' + o.cls : ''), role: 'group' }, opts.map(function (x) {
      return h('button', { type: 'button', class: x[0] === val ? 'on' : '', disabled: o.disabled, 'aria-pressed': x[0] === val ? 'true' : 'false', title: x[2] || null,
        on: { click: function () { cb(x[0]); change({ ins: true }); } } }, x[1]);
    }));
  }
  function selIn(k, opts, val, cb, o) {
    o = o || {};
    var s = h('select', { class: 'form-select form-select-sm' + (o.cls ? ' ' + o.cls : ''), data: { k: k }, disabled: o.disabled, 'aria-label': o.aria || null,
      on: { change: function () { cb(s.value); change({ ins: o.ins !== false }); } } });
    fillOpts(s, opts, val);
    return s;
  }
  function fillOpts(s, opts, val) {
    opts.forEach(function (x) {
      if (x.group) { var g = h('optgroup', { label: x.group }); fillOpts(g, x.opts, val); if (x.opts.length) s.appendChild(g); return; }
      s.appendChild(h('option', { value: x[0], selected: String(x[0]) === String(val), disabled: x[2] === 'disabled' }, x[1]));
    });
  }
  function imgField(val, cb, label) {
    return h('div', { class: 'f-img' },
      val ? h('div', { class: 'f-img__p' }, h('img', { src: val, alt: '' }),
        h('button', { type: 'button', class: 'f-img__x', title: 'حذف تصویر', 'aria-label': 'حذف تصویر', on: { click: function () { cb(''); change({ ins: true }); } } }, icon('x', 14))) : null,
      h('button', { type: 'button', class: 'b b--sm', on: { click: function () { upload(function (u) { cb(u); change({ ins: true }); }); } } }, icon('image', 15), val ? 'تغییر تصویر' : (label || 'افزودن تصویر')));
  }
  function sec(title, body, o) {
    o = o || {};
    return h('section', { class: 'ins-sec' + (o.locked ? ' is-locked' : '') }, title ? h('h4', { class: 'ins-sec__h' }, o.icon ? icon(o.icon, 15) : null, h('span', { text: title }), o.locked ? lockBadge() : null, o.extra || null) : null, body);
  }

  // ویرایشگر فهرست گزینه/ردیف/ستون/مورد
  function itemsEd(list, o) {
    var box = h('div', { class: 'it' }), rows = h('div', { class: 'it-rows' });
    var focusAt = function (id) { var f = $('[data-k="it.' + id + '"]', $('#bIns')); if (f) { f.focus(); f.select(); } };
    var addAfter = function (i, label) {
      var n = { id: uid(o.prefix), label: label || '' }; if (o.score) n.score = 0;
      list.splice(i + 1, 0, n); change({ ins: true }); focusAt(n.id);
    };
    list.forEach(function (c, i) {
      var lab = h('input', { class: 'form-control form-control-sm', value: c.label, data: { k: 'it.' + c.id }, placeholder: o.ph + ' ' + fa(i + 1), maxlength: '300', 'aria-label': o.ph + ' ' + fa(i + 1),
        on: { input: function () { c.label = lab.value; change({ typing: true }); },
          keydown: function (e) {
            if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); addAfter(i); }
            else if (e.key === 'Backspace' && !lab.value && list.length > 1) { e.preventDefault(); list.splice(i, 1); change({ ins: true }); var p = list[Math.max(0, i - 1)]; if (p) focusAt(p.id); }
            else if (e.key === 'ArrowDown' && list[i + 1]) { e.preventDefault(); focusAt(list[i + 1].id); }
            else if (e.key === 'ArrowUp' && list[i - 1]) { e.preventDefault(); focusAt(list[i - 1].id); }
          },
          paste: function (e) {
            var t = (e.clipboardData || window.clipboardData).getData('text');
            if (t && /\n/.test(t.trim())) {
              e.preventDefault();
              var lines = t.split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean);
              if (!lab.value.trim()) { c.label = lines.shift(); }
              lines.reverse().forEach(function (l) { var n = { id: uid(o.prefix), label: l }; if (o.score) n.score = 0; list.splice(i + 1, 0, n); });
              change({ ins: true }); toast(fa(lines.length + 1) + ' مورد افزوده شد');
            }
          } } });
      var row = h('div', { class: 'it-row', data: { id: c.id } },
        h('span', { class: 'it-grip', title: 'جابه‌جا کنید' }, icon('grip', 14)), lab,
        o.showScore ? h('input', { class: 'form-control form-control-sm it-score', title: 'امتیاز', 'aria-label': 'امتیاز', inputmode: 'decimal', value: fa(c.score || 0), data: { k: 'sc.' + c.id },
          on: { input: function (e) { c.score = parseNum(e.target.value) || 0; change({ typing: true }); } } }) : null,
        o.image ? (c.image ? h('button', { type: 'button', class: 'it-thumb', title: 'حذف تصویر گزینه', on: { click: function () { delete c.image; change({ ins: true }); } } }, h('img', { src: c.image, alt: '' }), h('i', {}, icon('x', 12)))
          : h('button', { type: 'button', class: 'it-b', title: 'تصویر گزینه', 'aria-label': 'تصویر گزینه', on: { click: function () { upload(function (u) { c.image = u; change({ ins: true }); }); } } }, icon('image', 15))) : null,
        h('button', { type: 'button', class: 'it-b it-b--d', title: 'حذف', 'aria-label': 'حذف', disabled: list.length <= (o.min || 0), on: { click: function () { list.splice(i, 1); change({ ins: true }); } } }, icon('x', 15)));
      rows.appendChild(row);
    });
    box.appendChild(rows);
    if (o.showScore) rows.classList.add('has-score');
    var bulk = h('div', { class: 'it-bulk', hidden: true });
    var ta = h('textarea', { class: 'form-control form-control-sm', rows: '5', placeholder: 'هر خط یک ' + o.ph });
    add(bulk, [ta, h('div', { class: 'it-bulk__a' },
      h('button', { type: 'button', class: 'b b--sm b--p', on: { click: function () { bulkApply(true); } } }, 'جایگزینی همه'),
      h('button', { type: 'button', class: 'b b--sm', on: { click: function () { bulkApply(false); } } }, 'افزودن به انتها'),
      h('button', { type: 'button', class: 'b b--sm b--g', on: { click: function () { bulk.hidden = true; } } }, 'بستن'))]);
    function bulkApply(replace) {
      var lines = ta.value.split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean);
      if (!lines.length) { toast('متنی وارد نشده است.', 'warning'); return; }
      var news = lines.map(function (l) { var n = { id: uid(o.prefix), label: l }; if (o.score) n.score = 0; return n; });
      if (replace) list.splice.apply(list, [0, list.length].concat(news)); else Array.prototype.push.apply(list, news);
      change({ ins: true }); toast(fa(news.length) + ' مورد ثبت شد');
    }
    box.appendChild(h('div', { class: 'it-foot' },
      h('button', { type: 'button', class: 'b b--sm b--g it-add', disabled: o.max && list.length >= o.max, on: { click: function () { addAfter(list.length - 1); } } }, icon('plus', 15), 'افزودن ' + o.ph),
      h('button', { type: 'button', class: 'b b--sm b--g', on: { click: function () { bulk.hidden = !bulk.hidden; ta.value = list.map(function (c) { return c.label; }).join('\n'); if (!bulk.hidden) ta.focus(); } } }, icon('list', 15), 'ورود گروهی')));
    box.appendChild(bulk);
    if (window.Sortable) new window.Sortable(rows, { handle: '.it-grip', animation: 140, ghostClass: 'ol-ghost', onEnd: function (ev) {
      if (ev.oldIndex === ev.newIndex) return; list.splice(ev.newIndex, 0, list.splice(ev.oldIndex, 1)[0]); change({ ins: true });
    } });
    return box;
  }

  // ─── شرط‌ها ───
  var OPL = { eq: 'برابر باشد با', neq: 'برابر نباشد با', gt: 'بیشتر از', gte: 'بیشتر یا مساوی', lt: 'کمتر از', lte: 'کمتر یا مساوی',
    contains: 'شامل', not_contains: 'شامل نباشد', in: 'یکی از (با کاما)', answered: 'پاسخ داده شده باشد', not_answered: 'پاسخ داده نشده باشد' };
  var OPS = { choice: ['eq', 'neq', 'answered', 'not_answered'], multi: ['contains', 'not_contains', 'answered', 'not_answered'],
    num: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'answered', 'not_answered'], date: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'answered', 'not_answered'],
    loc: ['eq', 'neq', 'answered', 'not_answered'], text: ['eq', 'neq', 'contains', 'not_contains', 'in', 'answered', 'not_answered'], presence: ['answered', 'not_answered'] };
  function srcInfo(src) {
    if (src.indexOf('var:') === 0) {
      var name = src.slice(4), v = S().variables.filter(function (x) { return x.name === name; })[0];
      return { kind: name === 'score' || (v && v.type === 'number') ? 'num' : 'text' };
    }
    if (src.indexOf('hidden:') === 0) return { kind: 'text' };
    var q = qById(src); if (!q) return { kind: 'text', missing: true };
    var o = q.opt || {}, t = q.type;
    if (t === 'yes_no') return { kind: 'choice', q: q, choices: [['yes', o.yes_label || 'بله'], ['no', o.no_label || 'خیر']] };
    if ((t === 'choice' && o.multiple)) return { kind: 'multi', q: q, choices: (o.choices || []).map(function (c) { return [c.id, c.label]; }).concat(o.other ? [['__other__', o.other_label || 'سایر']] : []) };
    if (t === 'ranking') return { kind: 'multi', q: q, choices: (o.items || []).map(function (c) { return [c.id, c.label]; }) };
    if (t === 'choice' || t === 'dropdown') return { kind: 'choice', q: q, choices: (o.choices || []).map(function (c) { return [c.id, c.label]; }).concat(o.other ? [['__other__', o.other_label || 'سایر']] : []) };
    if (t === 'rating') return { kind: 'num', q: q, range: [1, o.max || 5] };
    if (t === 'scale') return { kind: 'num', q: q, range: [o.min, o.max] };
    if (NUMERIC.indexOf(t) >= 0) return { kind: 'num', q: q };
    if (t === 'date') return { kind: 'date', q: q };
    if (t === 'location') return { kind: 'loc', q: q };
    if (['matrix', 'file', 'signature', 'consent'].indexOf(t) >= 0) return { kind: 'presence', q: q };
    return { kind: 'text', q: q };
  }
  function defaultValue(info) {
    if (info.choices) return info.choices.length ? info.choices[0][0] : '';
    if (info.range) return info.range[1];
    if (info.kind === 'loc') return (B.provinces || [''])[0];
    return '';
  }
  function newCond(src) { var info = srcInfo(src); return { src: src, op: OPS[info.kind][0], value: defaultValue(info) }; }
  // سؤال‌هایی که می‌شود منبع شرط باشند. scope: 'before' (پیش از سؤال)، 'upto' (تا خود سؤال)، 'all'
  function srcOptions(ctx, current) {
    var qs = S().questions, stop = qs.length;
    if (ctx.q) stop = qIndex(ctx.q.id) + (ctx.scope === 'upto' ? 1 : 0);
    var qo = [], found = false;
    qs.slice(0, stop).filter(answerable).forEach(function (q) { if (q.id === current) found = true; qo.push([q.id, fa(qNumber(q)) + '. ' + shortName(q, 40)]); });
    if (current && !found && current.indexOf(':') < 0) { var cq = qById(current); qo.push([current, '⚠ ' + (cq ? shortName(cq, 34) + ' (بعد از این سؤال)' : 'سؤال حذف‌شده')]); }
    var vo = [['var:score', 'امتیاز کل (score)']].concat(S().variables.map(function (v) { return ['var:' + v.name, (v.label || v.name) + ' (' + v.name + ')']; }));
    var ho = knownHidden().map(function (n) { return ['hidden:' + n, n]; });
    if (current && current.indexOf('hidden:') === 0 && !ho.some(function (x) { return x[0] === current; })) ho.push([current, current.slice(7)]);
    ho.push(['__newhidden', '+ فیلد مخفی جدید…']);
    return [{ group: 'سؤال‌ها', opts: qo }, { group: 'متغیرها', opts: vo }, { group: 'فیلدهای مخفی (از لینک)', opts: ho }];
  }
  function firstSrc(ctx) {
    var qs = S().questions, stop = ctx.q ? qIndex(ctx.q.id) + (ctx.scope === 'upto' ? 1 : 0) : qs.length;
    var c = qs.slice(0, stop).filter(answerable);
    return c.length ? c[c.length - 1].id : 'var:score';
  }
  function condRow(g, c, i, ctx) {
    var info = srcInfo(c.src), ops = OPS[info.kind], dis = ctx.disabled;
    if (ops.indexOf(c.op) < 0) ops = ops.concat([c.op]);
    var srcSel = selIn('', srcOptions(ctx, c.src), c.src, function (v) {
      if (v === '__newhidden') {
        var n = (window.prompt('نام فیلد مخفی (همان که در آدرس لینک می‌آید، مثل ref):') || '').trim();
        if (!/^[A-Za-z0-9_-]+$/.test(n)) { if (n) toast('نام فقط با حروف انگلیسی، عدد و _ مجاز است.', 'error'); return; }
        v = 'hidden:' + n;
      }
      var nc = newCond(v); c.src = nc.src; c.op = nc.op; c.value = nc.value;
    }, { cls: 'cg-src', disabled: dis, aria: 'منبع شرط' });
    var opSel = selIn('', ops.map(function (o) { return [o, info.kind === 'date' ? ({ gt: 'بعد از', gte: 'از تاریخ', lt: 'قبل از', lte: 'تا تاریخ' }[o] || OPL[o]) : OPL[o]]; }), c.op, function (v) {
      c.op = v; if (v === 'answered' || v === 'not_answered') c.value = ''; else if (c.value === '' || c.value == null) c.value = defaultValue(info);
    }, { cls: 'cg-op', disabled: dis, aria: 'نوع مقایسه' });
    var val = null;
    if (c.op !== 'answered' && c.op !== 'not_answered') {
      if (info.choices) val = selIn('', info.choices.map(function (x) { return [x[0], x[1] || '(بدون متن)']; }), c.value, function (v) { c.value = v; }, { cls: 'cg-val', disabled: dis, ins: false, aria: 'مقدار' });
      else if (info.range && ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'].indexOf(c.op) >= 0) {
        var r = []; for (var k = info.range[0]; k <= info.range[1]; k++) r.push([k, fa(k)]);
        val = selIn('', r, c.value, function (v) { c.value = Number(v); }, { cls: 'cg-val', disabled: dis, ins: false, aria: 'مقدار' });
      } else if (info.kind === 'loc') val = selIn('', (B.provinces || []).map(function (p) { return [p, p]; }), c.value, function (v) { c.value = v; }, { cls: 'cg-val', disabled: dis, ins: false, aria: 'استان' });
      else if (info.kind === 'date') val = inp('', fa(c.value || ''), function (v) { c.value = en(v); }, { cls: 'cg-val', jdp: true, ph: '۱۴۰۵/۰۱/۰۱', disabled: dis });
      else if (info.kind === 'num') val = inp('', c.value === '' || c.value == null ? '' : fa(c.value), function (v) { var n = parseNum(v); c.value = n == null ? '' : n; }, { cls: 'cg-val', mode: 'decimal', ph: 'عدد', disabled: dis });
      else val = inp('', c.value, function (v) { c.value = v; }, { cls: 'cg-val', ph: c.op === 'in' ? 'الف، ب، ج' : 'مقدار', disabled: dis });
      if (val && val.tagName === 'INPUT' && info.kind === 'date') { val.addEventListener('change', function () { c.value = en(val.value); change(); }); }
    }
    return h('div', { class: 'cg-r' },
      h('span', { class: 'cg-and', text: i === 0 ? 'اگر' : (g.match === 'any' ? 'یا' : 'و') }),
      h('div', { class: 'cg-f' }, srcSel, h('div', { class: 'cg-f2' }, opSel, val)),
      h('button', { type: 'button', class: 'it-b it-b--d', title: 'حذف شرط', 'aria-label': 'حذف شرط', disabled: dis, on: { click: function () {
        g.conds.splice(i, 1);
        if (!g.conds.length && ctx.onEmpty) ctx.onEmpty();
        change({ ins: true });
      } } }, icon('x', 15)));
  }
  function groupEd(g, ctx) {
    var box = h('div', { class: 'cg' + (ctx.disabled ? ' is-off' : '') });
    if (g.conds.length > 1) box.appendChild(h('div', { class: 'cg-m' }, 'برقرار باشد', seg([['all', 'همه‌ی شرط‌ها'], ['any', 'دست‌کم یکی']], g.match || 'all', function (v) { g.match = v; }, { disabled: ctx.disabled })));
    g.conds.forEach(function (c, i) { box.appendChild(condRow(g, c, i, ctx)); });
    box.appendChild(h('button', { type: 'button', class: 'b b--sm b--g cg-add', disabled: ctx.disabled || g.conds.length >= 20, on: { click: function () { g.conds.push(newCond(firstSrc(ctx))); change({ ins: true }); } } }, icon('plus', 14), 'شرط دیگر'));
    return box;
  }

  // ─── ابزار سؤال ───
  function insQuestion(q) {
    var o = q.opt, box = h('div', { class: 'ins-b' });
    var tsel = selIn('q.type', GROUPS.map(function (g) {
      return { group: g[1], opts: Object.keys(TYPES).filter(function (t) { return TYPES[t].group === g[0]; }).map(function (t) { return [t, tLabel(t) + (t === 'file' && !PLAN.file_upload ? ' 🔒' : '')]; }) };
    }), q.type, function (v) { changeType(q, v); }, { ins: false, aria: 'نوع سؤال' });
    box.appendChild(sec('', h('div', {},
      fld('عنوان سؤال', withPipe(inp('q.title', q.title, function (v) { q.title = v; }, { area: true, rows: 2, ph: 'مثلاً: از خدمات ما چقدر راضی هستید؟', max: 1000 }), q.id)),
      fld('توضیح (اختیاری)', withPipe(inp('q.description', q.description, function (v) { q.description = v; }, { area: true, rows: 1, ph: 'راهنمای کوتاه زیر عنوان', max: 2000 }), q.id)),
      h('div', { class: 'f-row' }, fld('نوع سؤال', tsel), answerable(q) ? h('div', { class: 'f' }, sw('پاسخ الزامی', q.required, function (v) { q.required = v; }, { k: 'q.required' })) : null),
      fld('تصویر سؤال', imgField(q.image, function (u) { q.image = u; })))));
    if (q.type === 'file' && !PLAN.file_upload) box.appendChild(h('div', { class: 'ins-warn' }, icon('alert', 16), h('span', {}, 'سؤال آپلود فایل در پلن فعلی پشتیبانی نمی‌شود و هنگام ذخیره حذف می‌شود. ', lockBadge())));
    var tb = typeOptions(q, o);
    if (tb) box.appendChild(sec('تنظیمات «' + tLabel(q.type) + '»', tb, { icon: TI[q.type] }));
    return box;
  }
  function typeOptions(q, o) {
    var t = q.type, b = h('div', {});
    var phField = function () { return fld('متن راهنما داخل کادر', inp('q.opt.placeholder', o.placeholder, function (v) { o.placeholder = v; }, { ph: 'مثلاً: نام خود را بنویسید', max: 120 })); };
    if ('placeholder' in o) b.appendChild(phField());
    if (t === 'short_text' || t === 'long_text') {
      b.appendChild(h('div', { class: 'f-row' },
        fld('حداقل طول', numIn('q.opt.min_len', o.min_len, function (v) { o.min_len = v; }, { ph: 'بدون محدودیت' })),
        fld('حداکثر طول', numIn('q.opt.max_len', o.max_len, function (v) { o.max_len = v; }, { ph: 'بدون محدودیت' }))));
    }
    if (t === 'number' || t === 'price') {
      b.appendChild(h('div', { class: 'f-row' },
        fld('کمترین مقدار', numIn('q.opt.min', o.min, function (v) { o.min = v; }, { ph: '—' })),
        fld('بیشترین مقدار', numIn('q.opt.max', o.max, function (v) { o.max = v; }, { ph: '—' }))));
      if (t === 'number') {
        b.appendChild(fld('واحد', inp('q.opt.unit', o.unit, function (v) { o.unit = v; }, { ph: 'مثلاً: سال، کیلوگرم، نفر', max: 30 })));
        b.appendChild(sw('اعداد اعشاری مجاز است', o.decimals, function (v) { o.decimals = v; }));
      }
      b.appendChild(sw('افزودن به امتیاز کل', o.add_to_score, function (v) { o.add_to_score = v; }, { help: 'عدد واردشده به متغیر score اضافه می‌شود.' }));
    }
    if (t === 'date') {
      b.appendChild(h('div', { class: 'f-row' },
        fld('از تاریخ', dateIn('q.opt.min', o, 'min')), fld('تا تاریخ', dateIn('q.opt.max', o, 'max'))));
      b.appendChild(sw('تاریخ تولد است', o.birth, function (v) { o.birth = v; }, { help: 'انتخاب سال در تقویم ساده‌تر می‌شود.' }));
    }
    if (t === 'choice' || t === 'dropdown') {
      var hasScore = scoreOn[q.id] != null ? scoreOn[q.id] : (o.choices || []).some(function (c) { return c.score; });
      b.appendChild(fld('گزینه‌ها', itemsEd(o.choices, { prefix: 'c', ph: 'گزینه', score: true, showScore: hasScore, image: t === 'choice', min: 1 }), 'Enter = گزینه‌ی بعدی · چسباندن چندخطی = چند گزینه'));
      b.appendChild(sw('امتیازدهی گزینه‌ها', hasScore, function (v) { scoreOn[q.id] = v; if (!v) o.choices.forEach(function (c) { c.score = 0; }); }, { help: 'برای آزمون و محاسبه‌ی امتیاز کل (score).' }));
      if (t === 'choice') {
        b.appendChild(sw('چند انتخابی', o.multiple, function (v) { o.multiple = v; if (!v) { o.min_select = null; o.max_select = null; } }));
        if (o.multiple) b.appendChild(h('div', { class: 'f-row' },
          fld('حداقل انتخاب', numIn('q.opt.min_select', o.min_select, function (v) { o.min_select = v; }, { ph: '—' })),
          fld('حداکثر انتخاب', numIn('q.opt.max_select', o.max_select, function (v) { o.max_select = v; }, { ph: '—' }))));
      }
      b.appendChild(sw('گزینه‌ی «سایر» با متن دلخواه', o.other, function (v) { o.other = v; }));
      if (o.other) b.appendChild(fld('عنوان گزینه‌ی سایر', inp('q.opt.other_label', o.other_label, function (v) { o.other_label = v; }, { max: 60 })));
      b.appendChild(sw('ترتیب تصادفی گزینه‌ها', o.shuffle, function (v) { o.shuffle = v; }));
      if (t === 'choice') b.appendChild(fld('چیدمان گزینه‌ها', seg([['list', 'فهرست'], ['grid', 'دوستونه'], ['inline', 'افقی']], o.layout, function (v) { o.layout = v; })));
    }
    if (t === 'yes_no') b.appendChild(h('div', { class: 'f-row' },
      fld('برچسب بله', inp('q.opt.yes_label', o.yes_label, function (v) { o.yes_label = v; }, { max: 40 })),
      fld('برچسب خیر', inp('q.opt.no_label', o.no_label, function (v) { o.no_label = v; }, { max: 40 }))));
    if (t === 'rating') {
      b.appendChild(fld('شکل', seg([['star', '★ ستاره'], ['heart', '♥ قلب'], ['like', '👍 لایک'], ['number', '۱۲ عدد']], o.shape, function (v) { o.shape = v; })));
      var mx = []; for (var i = 3; i <= 10; i++) mx.push([i, fa(i)]);
      b.appendChild(fld('بیشترین امتیاز', selIn('q.opt.max', mx, o.max, function (v) { o.max = Number(v); })));
      b.appendChild(sw('افزودن به امتیاز کل', o.add_to_score, function (v) { o.add_to_score = v; }));
    }
    if (t === 'scale') {
      b.appendChild(sw('شاخص NPS (۰ تا ۱۰)', o.nps, function (v) { o.nps = v; if (v) { o.min = 0; o.max = 10; } }, { help: 'دسته‌بندی منتقد، خنثی و مروج در نتایج.' }));
      var mx2 = []; for (var j = 3; j <= 10; j++) mx2.push([j, fa(j)]);
      b.appendChild(h('div', { class: 'f-row' },
        fld('شروع از', selIn('q.opt.min', [[0, '۰'], [1, '۱']], o.min, function (v) { o.min = Number(v); if (o.min !== 0) o.nps = false; }, { disabled: o.nps })),
        fld('تا', selIn('q.opt.max', mx2, o.max, function (v) { o.max = Number(v); if (o.max !== 10) o.nps = false; }, { disabled: o.nps }))));
      b.appendChild(h('div', { class: 'f-row' },
        fld('برچسب ابتدا', inp('q.opt.min_label', o.min_label, function (v) { o.min_label = v; }, { ph: 'مثلاً: اصلاً', max: 60 })),
        fld('برچسب انتها', inp('q.opt.max_label', o.max_label, function (v) { o.max_label = v; }, { ph: 'مثلاً: حتماً', max: 60 }))));
      b.appendChild(sw('افزودن به امتیاز کل', o.add_to_score, function (v) { o.add_to_score = v; }));
    }
    if (t === 'matrix') {
      var ms = scoreOn[q.id] != null ? scoreOn[q.id] : (o.cols || []).some(function (c) { return c.score; });
      b.appendChild(fld('ردیف‌ها (موضوع‌ها)', itemsEd(o.rows, { prefix: 'r', ph: 'ردیف', min: 1 })));
      b.appendChild(fld('ستون‌ها (گزینه‌ها)', itemsEd(o.cols, { prefix: 'c', ph: 'ستون', score: true, showScore: ms, min: 1, max: 12 })));
      b.appendChild(sw('امتیاز ستون‌ها', ms, function (v) { scoreOn[q.id] = v; if (!v) o.cols.forEach(function (c) { c.score = 0; }); }));
      b.appendChild(sw('چند انتخاب در هر ردیف', o.multiple, function (v) { o.multiple = v; }));
    }
    if (t === 'ranking') b.appendChild(fld('موارد رتبه‌بندی', itemsEd(o.items, { prefix: 'i', ph: 'مورد', min: 2, max: 30 })));
    if (t === 'file') {
      b.appendChild(fld('حداکثر حجم (مگابایت)', numIn('q.opt.max_mb', o.max_mb, function (v) { o.max_mb = v == null ? 5 : Math.max(1, Math.min(50, v)); })));
      b.appendChild(fld('پسوندهای مجاز', h('div', { class: 'f-chips' }, FILE_TYPES.map(function (x) {
        var on = o.types.indexOf(x) >= 0;
        return h('button', { type: 'button', class: 'f-chip' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false', on: { click: function () {
          if (on) { if (o.types.length > 1) o.types.splice(o.types.indexOf(x), 1); } else o.types.push(x);
          change({ ins: true });
        } } }, x);
      }))));
    }
    if (t === 'location') b.appendChild(sw('پرسیدن شهر', o.ask_city, function (v) { o.ask_city = v; }, { help: 'در غیر این صورت فقط استان پرسیده می‌شود.' }));
    if (t === 'consent') b.appendChild(fld('متن تأیید', inp('q.opt.label', o.label, function (v) { o.label = v; }, { area: true, max: 300 })));
    if (t === 'statement') b.appendChild(fld('متن دکمه', inp('q.opt.button', o.button, function (v) { o.button = v; }, { max: 40 })));
    if (t === 'signature') b.appendChild(h('p', { class: 'help m-0', text: 'پاسخ‌دهنده با انگشت یا ماوس امضا می‌کند و تصویر امضا ذخیره می‌شود.' }));
    return b.childNodes.length ? b : null;
  }
  function dateIn(k, o, key) {
    var el = inp(k, fa(o[key] || ''), function (v) { o[key] = en(v).trim(); }, { jdp: true, ph: '۱۴۰۵/۰۱/۰۱' });
    el.addEventListener('change', function () { o[key] = en(el.value).trim(); change(); });
    return el;
  }

  function insLogic(q) {
    var box = h('div', { class: 'ins-b' }), dis = !PLAN.logic;
    if (dis) box.appendChild(h('div', { class: 'ins-warn' }, icon('lock', 16), h('span', {}, 'منطق شرطی و پرش در پلن «' + (B.plan_name || '') + '» فعال نیست. ', lockBadge())));
    // نمایش شرطی
    var ctxShow = { q: q, scope: 'before', disabled: dis, onEmpty: function () { q.show_if = null; } };
    var hasPrev = qIndex(q.id) > 0;
    var showBody = h('div', {},
      sw('نمایش این سؤال فقط در صورت برقراری شرط', !!q.show_if, function (v) { q.show_if = v ? { match: 'all', conds: [newCond(firstSrc(ctxShow))] } : null; }, { disabled: dis, help: hasPrev ? null : 'شرط می‌تواند روی پاسخ سؤال‌های قبلی، متغیرها یا فیلدهای مخفی باشد.' }),
      q.show_if ? groupEd(q.show_if, ctxShow) : null);
    box.appendChild(sec('نمایش شرطی', showBody, { icon: 'filter', locked: dis }));
    // پرش‌ها
    var jb = h('div', {});
    var gotoOpts = function () {
      var after = S().questions.slice(qIndex(q.id) + 1).map(function (x) { return [x.id, (qNumber(x) ? fa(qNumber(x)) + '. ' : '') + shortName(x, 40)]; });
      return [{ group: 'رفتن به سؤال', opts: after }, { group: 'پایان', opts: [['end', 'پایان فرم (صفحه‌ی پایان خودکار)']].concat(S().endings.map(function (e) { return ['ending:' + e.id, 'صفحه‌ی پایان: ' + ((e.title || '').replace(/\{\{[^}]*\}\}/g, '…').slice(0, 34) || 'بدون عنوان')]; })) }];
    };
    q.jumps.forEach(function (j, i) {
      var ctxJ = { q: q, scope: 'upto', disabled: dis, onEmpty: function () { q.jumps.splice(q.jumps.indexOf(j), 1); } };
      var gs = selIn('', gotoOpts(), j.goto, function (v) { j.goto = v; }, { disabled: dis, cls: 'cg-goto', aria: 'مقصد پرش' });
      jb.appendChild(h('div', { class: 'jr' },
        h('div', { class: 'jr-h' }, h('b', { text: 'قاعده‌ی ' + fa(i + 1) }),
          h('span', { class: 'jr-a' },
            i > 0 ? h('button', { type: 'button', class: 'it-b', title: 'اولویت بالاتر', disabled: dis, on: { click: function () { q.jumps.splice(i - 1, 0, q.jumps.splice(i, 1)[0]); change({ ins: true }); } } }, h('span', { class: 'bd-up' }, icon('chevron', 13))) : null,
            h('button', { type: 'button', class: 'it-b it-b--d', title: 'حذف قاعده', 'aria-label': 'حذف قاعده', disabled: dis, on: { click: function () { q.jumps.splice(i, 1); change({ ins: true }); } } }, icon('trash', 14)))),
        groupEd(j, ctxJ),
        h('div', { class: 'jr-go' }, icon('redirect', 15), h('span', { text: 'برو به' }), gs)));
    });
    if (!q.jumps.length) jb.appendChild(h('p', { class: 'help', text: 'بدون قاعده، پس از این سؤال سؤال بعدی نمایش داده می‌شود. قاعده‌ها به ترتیب بررسی می‌شوند و اولین قاعده‌ی برقرار اجرا می‌شود.' }));
    jb.appendChild(h('button', { type: 'button', class: 'b b--sm', disabled: dis || q.jumps.length >= 20, on: { click: function () {
      var src = answerable(q) ? q.id : firstSrc({ q: q, scope: 'upto' });
      q.jumps.push({ match: 'all', conds: [newCond(src)], goto: 'end' }); change({ ins: true });
    } } }, icon('plus', 15), 'افزودن قاعده‌ی پرش'));
    box.appendChild(sec('پرش (رفتن به سؤال یا پایان)', jb, { icon: 'redirect', locked: dis }));
    return box;
  }

  function insWelcome() {
    var w = S().welcome;
    return h('div', { class: 'ins-b' }, sec('', h('div', {},
      sw('نمایش صفحه‌ی خوش‌آمد', w.enabled, function (v) { w.enabled = v; }, { help: 'اگر خاموش باشد، فرم مستقیم از سؤال اول شروع می‌شود.' }),
      fld('عنوان', withPipe(inp('w.title', w.title, function (v) { w.title = v; }, { ph: st.title, max: 300 }))),
      fld('متن معرفی', withPipe(inp('w.text', w.text, function (v) { w.text = v; }, { area: true, rows: 4, ph: 'هدف فرم، زمان تقریبی و محرمانگی پاسخ‌ها…', max: 3000 }))),
      fld('متن دکمه‌ی شروع', inp('w.button', w.button, function (v) { w.button = v; }, { max: 40, ph: 'شروع' })),
      fld('تصویر', imgField(w.image, function (u) { w.image = u; })))));
  }
  function insEnding(e) {
    var dis = !PLAN.logic, isDef = e === defaultEnding();
    var ctx = { scope: 'all', disabled: dis, onEmpty: function () { e.when = null; } };
    var cond = h('div', {},
      sw('فقط وقتی این صفحه نمایش داده شود که…', !!e.when, function (v) { e.when = v ? { match: 'all', conds: [newCond(S().variables.length || !S().questions.length ? 'var:score' : firstSrc(ctx))] } : null; }, { disabled: dis,
        help: 'صفحه‌های شرطی به ترتیب بررسی می‌شوند؛ اگر هیچ‌کدام برقرار نبود، اولین صفحه‌ی بدون شرط (پیش‌فرض) نمایش داده می‌شود.' }),
      e.when ? groupEd(e.when, ctx) : null);
    return h('div', { class: 'ins-b' },
      sec('', h('div', {},
        isDef ? h('div', { class: 'ins-note' }, icon('flag', 15), 'این صفحه‌ی پایان پیش‌فرض است.') : null,
        fld('عنوان', withPipe(inp('e.title', e.title, function (v) { e.title = v; }, { max: 300 }))),
        fld('متن', withPipe(inp('e.text', e.text, function (v) { e.text = v; }, { area: true, rows: 4, max: 3000, ph: 'مثلاً: {{var:score}} امتیاز گرفتید.' }))),
        sw('نمایش امتیاز کل (score)', e.show_score, function (v) { e.show_score = v; }),
        h('div', { class: 'f-row' },
          fld('متن دکمه', inp('e.button_text', e.button_text, function (v) { e.button_text = v; }, { max: 40, ph: 'بدون دکمه' })),
          fld('لینک دکمه', inp('e.button_url', e.button_url, function (v) { e.button_url = v; }, { dir: 'ltr', ph: 'example.com/page', max: 500 }))),
        fld('انتقال خودکار به آدرس', inp('e.redirect_url', e.redirect_url, function (v) { e.redirect_url = v; }, { dir: 'ltr', ph: 'example.com/thanks', max: 500 }), 'اگر پر شود، پاسخ‌دهنده پس از چند ثانیه به این آدرس منتقل می‌شود.'))),
      sec('شرط نمایش', cond, { icon: 'filter', locked: dis }),
      h('div', { class: 'ins-foot' }, h('button', { type: 'button', class: 'b b--sm b--d', disabled: S().endings.length < 2, on: { click: function () { delEnding(e.id); } } }, icon('trash', 15), 'حذف این صفحه‌ی پایان')));
  }
  var VAR_RE = /^[A-Za-z][A-Za-z0-9_]{0,29}$/;
  function renameVar(v, nn) {
    var old = v.name, s = S();
    if (nn === old) return true;
    if (!VAR_RE.test(nn) || nn === 'score' || s.variables.some(function (x) { return x !== v && x.name === nn; })) return false;
    groupsOf(s).forEach(function (x) { x.g.conds.forEach(function (c) { if (c.src === 'var:' + old) c.src = 'var:' + nn; }); });
    s.calcs.forEach(function (c) { if (c.var === old) c.var = nn; if (c.value === '@var:' + old) c.value = '@var:' + nn; });
    var re = new RegExp('\\{\\{\\s*var:' + esc(old) + '\\s*\\}\\}', 'g'), rep = function (t) { return (t || '').replace(re, '{{var:' + nn + '}}'); };
    s.welcome.title = rep(s.welcome.title); s.welcome.text = rep(s.welcome.text);
    s.questions.forEach(function (q) { q.title = rep(q.title); q.description = rep(q.description); });
    s.endings.forEach(function (e) { e.title = rep(e.title); e.text = rep(e.text); });
    v.name = nn;
    return true;
  }
  function insVars() {
    var s = S(), dis = !PLAN.calcs, box = h('div', { class: 'ins-b' });
    if (dis) box.appendChild(h('div', { class: 'ins-warn' }, icon('lock', 16), h('span', {}, 'متغیر و محاسبه در پلن «' + (B.plan_name || '') + '» فعال نیست؛ امتیاز گزینه‌ها (score) همچنان محاسبه می‌شود. ', lockBadge())));
    var vb = h('div', { class: 'bvar-list' });
    vb.appendChild(h('div', { class: 'bvar bvar--sys' }, h('code', { class: 'mono', text: 'score' }), h('span', { text: 'امتیاز کل — خودکار از امتیاز گزینه‌ها' })));
    s.variables.forEach(function (v, i) {
      var name = h('input', { class: 'form-control form-control-sm mono', dir: 'ltr', value: v.name, data: { k: 'v.' + i + '.name' }, disabled: dis, 'aria-label': 'نام متغیر', maxlength: '30',
        on: { change: function () {
          var nn = name.value.trim();
          if (!renameVar(v, nn)) { toast('نام متغیر باید با حرف انگلیسی شروع شود، فقط حروف/عدد/_ داشته باشد و تکراری نباشد.', 'error'); name.value = v.name; return; }
          change({ ins: true });
        } } });
      vb.appendChild(h('div', { class: 'bvar' },
        h('div', { class: 'f-row f-row--3' },
          fld('نام (انگلیسی)', name),
          fld('برچسب', inp('v.' + i + '.label', v.label, function (x) { v.label = x; }, { disabled: dis, max: 80 })),
          fld('نوع', selIn('v.' + i + '.type', [['text', 'متنی'], ['number', 'عددی']], v.type, function (x) { v.type = x; v.initial = x === 'number' ? (parseNum(v.initial) || 0) : String(v.initial == null ? '' : v.initial); }, { disabled: dis }))),
        h('div', { class: 'bvar-b' },
          fld('مقدار اولیه', v.type === 'number' ? numIn('v.' + i + '.initial', v.initial, function (x) { v.initial = x == null ? 0 : x; }, { disabled: dis }) : inp('v.' + i + '.initial', v.initial, function (x) { v.initial = x; }, { disabled: dis, max: 100 })),
          h('button', { type: 'button', class: 'it-b it-b--d', title: 'حذف متغیر', 'aria-label': 'حذف متغیر', disabled: dis, on: { click: function () {
            var re = new RegExp('\\{\\{\\s*var:' + esc(v.name) + '\\s*\\}\\}', 'g'), n = refsTo('var:' + v.name, re) + s.calcs.filter(function (c) { return c.var === v.name; }).length;
            var go = function () { stripRefs('var:' + v.name, re); s.calcs = s.calcs.filter(function (c) { return c.var !== v.name; }); s.variables.splice(s.variables.indexOf(v), 1); change({ ins: true }); };
            if (n) ask('حذف متغیر «' + v.name + '»', 'این متغیر در ' + fa(n) + ' شرط، محاسبه یا متن استفاده شده و آن‌ها هم پاک می‌شوند.', 'حذف', true).then(function (ok) { if (ok) go(); }); else go();
          } } }, icon('trash', 14)))));
    });
    vb.appendChild(h('button', { type: 'button', class: 'b b--sm', disabled: dis || s.variables.length >= 30, on: { click: function () {
      var n = 1; while (s.variables.some(function (x) { return x.name === 'var' + n; })) n++;
      s.variables.push({ name: 'var' + n, label: 'متغیر ' + fa(n), type: 'number', initial: 0 }); change({ ins: true });
    } } }, icon('plus', 15), 'متغیر جدید'));
    box.appendChild(sec('متغیرها', vb, { icon: 'database', locked: dis }));

    var cb = h('div', {});
    var VOPS = [['set', 'برابر شود با'], ['add', 'اضافه شود'], ['sub', 'کم شود'], ['mul', 'ضرب شود در'], ['div', 'تقسیم شود بر']];
    s.calcs.forEach(function (c, i) {
      var mode = typeof c.value === 'string' && c.value.indexOf('@var:') === 0 ? 'var' : (typeof c.value === 'string' && c.value.charAt(0) === '@' ? 'q' : 'const');
      var valCtrl;
      if (mode === 'q') valCtrl = selIn('', S().questions.filter(answerable).map(function (q) { return ['@' + q.id, fa(qNumber(q)) + '. ' + shortName(q, 30)]; }), c.value, function (v) { c.value = v; }, { disabled: dis, ins: false, aria: 'سؤال' });
      else if (mode === 'var') valCtrl = selIn('', [['@var:score', 'score']].concat(s.variables.map(function (v) { return ['@var:' + v.name, v.name]; })), c.value, function (v) { c.value = v; }, { disabled: dis, ins: false, aria: 'متغیر' });
      else valCtrl = inp('c.' + i + '.value', typeof c.value === 'number' ? fa(c.value) : c.value, function (v) { var n = parseNum(v); c.value = n != null && en(v).trim() !== '' ? n : v; }, { disabled: dis, ph: 'مقدار', max: 100 });
      var ctx = { scope: 'all', disabled: dis };
      cb.appendChild(h('div', { class: 'jr' },
        h('div', { class: 'jr-h' }, h('b', { text: 'محاسبه‌ی ' + fa(i + 1) }),
          h('span', { class: 'jr-a' }, h('button', { type: 'button', class: 'it-b it-b--d', title: 'حذف محاسبه', 'aria-label': 'حذف محاسبه', disabled: dis, on: { click: function () { s.calcs.splice(i, 1); change({ ins: true }); } } }, icon('trash', 14)))),
        h('div', { class: 'calc' },
          selIn('', [['score', 'score']].concat(s.variables.map(function (v) { return [v.name, v.name + (v.label && v.label !== v.name ? ' — ' + v.label : '')]; })), c.var, function (v) { c.var = v; }, { disabled: dis, aria: 'متغیر', cls: 'mono-ish' }),
          selIn('', VOPS, c.op, function (v) { c.op = v; }, { disabled: dis, aria: 'عمل' }),
          selIn('', [['const', 'مقدار ثابت'], ['q', 'پاسخ سؤال'], ['var', 'مقدار متغیر']], mode, function (v) {
            if (v === 'const') c.value = ''; else if (v === 'q') { var fq = S().questions.filter(answerable)[0]; c.value = fq ? '@' + fq.id : ''; } else c.value = '@var:score';
          }, { disabled: dis, aria: 'نوع مقدار' }),
          valCtrl),
        sw('فقط اگر شرط برقرار باشد', c.conds.length > 0, function (v) { c.conds = v ? [newCond(firstSrc(ctx))] : []; c.match = 'all'; }, { disabled: dis }),
        c.conds.length ? groupEd(c, ctx) : null));
    });
    if (!s.calcs.length) cb.appendChild(h('p', { class: 'help', text: 'مثال: «اگر پاسخ سؤال فروش = بیش از ۳ میلیارد، متغیر level برابر A+ شود». محاسبه‌ها به ترتیب اجرا می‌شوند.' }));
    cb.appendChild(h('button', { type: 'button', class: 'b b--sm', disabled: dis || s.calcs.length >= 100, on: { click: function () {
      s.calcs.push({ match: 'all', conds: [], var: s.variables.length ? s.variables[0].name : 'score', op: s.variables.length ? 'set' : 'add', value: s.variables.length ? '' : 1 });
      change({ ins: true });
    } } }, icon('plus', 15), 'محاسبه‌ی جدید'));
    box.appendChild(sec('محاسبه‌ها', cb, { icon: 'chart', locked: dis }));
    return box;
  }
  var PRESETS = [
    ['سبز فیروزه‌ای', '#1E9E7B', '#F6F7F4', '#FFFFFF', '#16303A'], ['آبی آسمانی', '#2563EB', '#EFF4FF', '#FFFFFF', '#172554'],
    ['بنفش', '#7C3AED', '#F5F3FF', '#FFFFFF', '#2E1065'], ['زعفرانی', '#D97706', '#FFF8EB', '#FFFFFF', '#3B2405'],
    ['گلبهی', '#E11D48', '#FFF1F3', '#FFFFFF', '#4C0519'], ['لاجوردی شب', '#38BDF8', '#0F172A', '#1E293B', '#E2E8F0'],
    ['فیروزه‌ی کاشان', '#0E7490', '#ECFEFF', '#FFFFFF', '#083344'], ['خاکی', '#8B5E34', '#F5EFE6', '#FFFDF9', '#3A2A1A']];
  function insTheme() {
    var th = S().theme, ct = !!PLAN.custom_theme;
    var pre = h('div', { class: 'th-pre' }, PRESETS.map(function (p) {
      var on = th.primary.toLowerCase() === p[1].toLowerCase() && th.bg.toLowerCase() === p[2].toLowerCase();
      return h('button', { type: 'button', class: 'th-p' + (on ? ' on' : ''), title: p[0], 'aria-label': 'پالت ' + p[0], style: 'background:' + p[2] + ';color:' + p[4],
        on: { click: function () { th.primary = p[1]; th.bg = p[2]; th.card = p[3]; th.text = p[4]; change({ ins: true }); } } },
        h('span', { class: 'th-p__c', style: 'background:' + p[3] }, h('i', { style: 'background:' + p[1] })), h('small', { text: p[0] }));
    }));
    var colors = h('div', { class: 'th-cols' }, [['primary', 'رنگ اصلی'], ['bg', 'پس‌زمینه'], ['card', 'کارت'], ['text', 'متن']].map(function (x) {
      var hex = h('input', { class: 'form-control form-control-sm mono', dir: 'ltr', value: th[x[0]], maxlength: '7', disabled: !ct, 'aria-label': x[1], data: { k: 't.' + x[0] },
        on: { input: function () { if (/^#[0-9A-Fa-f]{6}$/.test(hex.value)) { th[x[0]] = hex.value; col.value = hex.value; change({ typing: true }); } } } });
      var col = h('input', { type: 'color', class: 'th-color', value: th[x[0]], disabled: !ct, 'aria-label': x[1],
        on: { input: function () { th[x[0]] = col.value.toUpperCase(); hex.value = th[x[0]]; change({ typing: true }); } } });
      return h('label', { class: 'th-c' }, col, h('span', {}, h('b', { text: x[1] }), hex));
    }));
    return h('div', { class: 'ins-b' },
      sec('پالت‌های آماده', pre, { icon: 'sparkle' }),
      sec('رنگ‌های اختصاصی', colors, { icon: 'palette', locked: !ct }),
      sec('تصاویر', h('div', {},
        fld('لوگو', imgField(th.logo, function (u) { th.logo = u; }, 'بارگذاری لوگو')),
        fld('تصویر پس‌زمینه', ct ? imgField(th.bg_image, function (u) { th.bg_image = u; }, 'بارگذاری تصویر') : h('div', { class: 'help' }, 'فقط در پلن‌های دارای طراحی اختصاصی. ', lockBadge()))), { icon: 'image' }),
      sec('چیدمان و متن', h('div', {},
        fld('نمایش سؤال‌ها', seg([['one', 'یک سؤال در هر صفحه'], ['all', 'همه در یک صفحه']], th.layout, function (v) { th.layout = v; }, { cls: 'f-seg--w' })),
        fld('اندازه‌ی متن', seg([['sm', 'کوچک'], ['md', 'متوسط'], ['lg', 'بزرگ']], th.font_size, function (v) { th.font_size = v; })),
        fld('گردی گوشه‌ها', seg([['none', 'تیز'], ['sm', 'کم'], ['md', 'متوسط'], ['lg', 'زیاد']], th.radius, function (v) { th.radius = v; })),
        fld('چینش', seg([['right', 'راست‌چین'], ['center', 'وسط‌چین']], th.align, function (v) { th.align = v; }))), { icon: 'layout' }));
  }
  function insSettings() {
    var se = S().settings, rb = !!PLAN.remove_branding;
    return h('div', { class: 'ins-b' },
      sec('', h('div', { class: 'f-list' },
        sw('نوار پیشرفت', se.progress, function (v) { se.progress = v; }, { help: 'میزان پیشرفت بالای فرم نشان داده می‌شود.' }),
        sw('دکمه‌ی بازگشت', se.allow_back, function (v) { se.allow_back = v; }, { help: 'پاسخ‌دهنده می‌تواند به سؤال قبلی برگردد.' }),
        sw('شماره‌گذاری سؤال‌ها', se.numbering, function (v) { se.numbering = v; }),
        sw('ترتیب تصادفی سؤال‌ها', se.shuffle, function (v) { se.shuffle = v; }, { help: 'برای فرم‌های دارای پرش یا شرط توصیه نمی‌شود.' }),
        sw('نمایش «ساخته‌شده با …»', rb ? se.show_branding : true, function (v) { se.show_branding = v; }, { disabled: !rb, badge: rb ? null : lockBadge() }))),
      h('a', { class: 'ins-link', href: URLS.settings }, icon('settings', 16), h('span', {}, h('b', { text: 'تنظیمات پاسخ‌گیری' }), h('small', { text: 'زمان شروع و پایان، سقف پاسخ، رمز، فیلدهای مخفی، اعلان‌ها و…' })), h('span', { class: 'bd-flip' }, icon('chevron', 16))));
  }

  function renderIns() {
    var pane = $('#bIns');
    var a = document.activeElement, k = a && pane.contains(a) && a.dataset ? a.dataset.k : null, ss = k && a.selectionStart, se = k && a.selectionEnd;
    var ikey = sel.k + ':' + (sel.id || '') + ':' + insTab;
    var scroll = ikey === lastInsKey ? (($('.ins-scroll', pane) || {}).scrollTop || 0) : 0;
    lastInsKey = ikey;
    pane.innerHTML = '';
    var head, body, tabs = null;
    if (sel.k === 'q' && qById(sel.id)) {
      var q = qById(sel.id), n = qNumber(q), lc = (q.show_if ? 1 : 0) + q.jumps.length;
      head = [h('span', { class: 'ins-ic', style: 'background:' + GCOLOR[tGroup(q.type)] }, icon(TI[q.type], 16)), h('div', { class: 'ins-t' }, h('b', { text: n ? 'سؤال ' + fa(n) : 'متن توضیحی' }), h('small', { text: tLabel(q.type) })),
        h('span', { class: 'ins-ha' },
          h('button', { type: 'button', class: 'b b--sm b--g bd-ib', title: 'کپی سؤال', 'aria-label': 'کپی سؤال', on: { click: function () { duplicate(q.id); } } }, icon('copy', 16)),
          h('button', { type: 'button', class: 'b b--sm b--g bd-ib bd-ib--d', title: 'حذف سؤال', 'aria-label': 'حذف سؤال', on: { click: function () { delQuestion(q.id); } } }, icon('trash', 16)))];
      tabs = h('div', { class: 'ins-tabs', role: 'tablist' },
        h('button', { type: 'button', role: 'tab', class: insTab === 'q' ? 'on' : '', 'aria-selected': insTab === 'q' ? 'true' : 'false', on: { click: function () { insTab = 'q'; renderIns(); } } }, icon('edit', 15), 'سؤال'),
        h('button', { type: 'button', role: 'tab', class: insTab === 'logic' ? 'on' : '', 'aria-selected': insTab === 'logic' ? 'true' : 'false', on: { click: function () { insTab = 'logic'; renderIns(); } } }, icon('redirect', 15), 'منطق',
          lc ? h('span', { class: 'ins-cnt', text: fa(lc) }) : null, PLAN.logic ? null : icon('lock', 12)));
      body = insTab === 'logic' ? insLogic(q) : insQuestion(q);
    } else {
      var M = { welcome: ['home', 'صفحه‌ی خوش‌آمد', 'اولین چیزی که پاسخ‌دهنده می‌بیند', insWelcome], ending: ['flag', 'صفحه‌ی پایان', 'پس از ارسال پاسخ', function () { return insEnding(endById(sel.id)); }],
        vars: ['database', 'متغیرها و محاسبات', 'امتیازدهی، سطح‌بندی و محاسبه', insVars], theme: ['palette', 'ظاهر و رنگ‌ها', 'هماهنگ با برند شما', insTheme],
        settings: ['settings', 'تنظیمات نمایش', 'رفتار فرم هنگام پاسخ‌دهی', insSettings] }[sel.k] || ['home', '', '', insWelcome];
      head = [h('span', { class: 'ins-ic', style: 'background:var(--p)' }, icon(M[0], 16)), h('div', { class: 'ins-t' }, h('b', { text: M[1] }), h('small', { text: M[2] }))];
      if (sel.k === 'ending') head.push(h('span', { class: 'ins-ha' }, h('button', { type: 'button', class: 'b b--sm b--g bd-ib', title: 'صفحه‌ی پایان جدید', on: { click: addEnding } }, icon('plus', 16))));
      body = M[3]();
    }
    pane.appendChild(h('div', { class: 'ins-h' }, head));
    if (tabs) pane.appendChild(tabs);
    var sc = h('div', { class: 'ins-scroll' }, body);
    pane.appendChild(sc);
    sc.scrollTop = scroll;
    if (k) {
      var f = $('[data-k="' + k + '"]', pane);
      if (f) { f.focus({ preventScroll: true }); try { if (ss != null) f.setSelectionRange(ss, se); } catch (e) { /* select */ } }
    }
  }
  var lastInsKey = '';
  function renderAll() { renderOutline(); renderCanvas(); renderIns(); }

  // ───────────────────────── سربرگ ─────────────────────────
  function mountHeader() {
    var hd = $('.shead__in'), act = $('#bAct');
    if (!hd) { root.insertBefore(act, root.firstChild); return; }
    var h1 = $('h1', hd);
    if (h1) {
      var ti = h('input', { class: 'bd-title', id: 'bTitle', value: st.title, maxlength: '200', 'aria-label': 'عنوان فرم', title: 'عنوان فرم — برای ویرایش کلیک کنید',
        on: { input: function () { st.title = ti.value; change({ typing: true }); fit(); }, blur: function () { if (!ti.value.trim()) { ti.value = st.title = B.title || 'فرم بدون عنوان'; change(); } },
          keydown: function (e) { if (e.key === 'Enter') { e.preventDefault(); ti.blur(); } } } });
      var fit = function () { ti.style.width = Math.min(360, Math.max(120, ti.value.length * 8.4 + 30)) + 'px'; };
      h1.replaceWith(ti); fit();
    }
    var pv = $('a[href="' + URLS.preview + '"]', hd);
    if (pv) pv.remove();
    hd.appendChild(act);
  }
  function setTop() { root.style.setProperty('--bd-top', Math.max(0, root.getBoundingClientRect().top + window.scrollY) + 'px'); }

  // ───────────────────────── کلیدها ─────────────────────────
  document.addEventListener('keydown', function (e) {
    var mod = e.ctrlKey || e.metaKey, k = (e.key || '').toLowerCase();
    if (dlg.open) return;
    if (e.key === 'Escape' && !pop.hidden) { closePop(); return; }
    if (mod && k === 'z' && !e.altKey) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    else if (mod && k === 'y') { e.preventDefault(); redo(); }
    else if (mod && k === 's') { e.preventDefault(); pushHist(); save().then(function (ok) { if (ok) toast('ذخیره شد'); }); }
  });
  $('#bUndo').addEventListener('click', undo);
  $('#bRedo').addEventListener('click', redo);
  $('#bPublish').addEventListener('click', publish);
  $('#bPreview').addEventListener('click', preview);

  // ───────────────────────── شروع ─────────────────────────
  mountHeader();
  renderPalette();
  renderAll();
  updUndo(); updPub(); setSave('saved');
  setTop();
  window.addEventListener('resize', setTop);
  if (window.ResizeObserver && $('.shead')) new ResizeObserver(setTop).observe($('.shead'));
  // اگر ساختار اولیه با پاک‌سازی سرور فرق دارد، یک بار ذخیره نشود؛ فقط با اولین تغییر کاربر ذخیره می‌شود.
})();
