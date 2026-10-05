/* ═══════════════ فرم‌ساز ICSD — اجراکننده‌ی عمومی فرم (صفحه‌ی پاسخ‌دهی) ═══════════════
   منطق شرط/پرش/متغیر/پایان آینه‌ی دقیق apps/surveys/engine.py است؛ هر تغییری آنجا، اینجا هم لازم است.
   بدون jQuery و بدون هیچ منبع خارجی. */
(function () {
  'use strict';

  // ───────────────────────── راه‌اندازی ─────────────────────────
  var app = document.getElementById('app');
  var BOOT;
  try {
    // ویو رشته‌ی JSON می‌فرستد و json_script دوباره آن را JSON می‌کند؛ هر دو حالت را بپذیر
    BOOT = JSON.parse(document.getElementById('boot').textContent);
    if (typeof BOOT === 'string') BOOT = JSON.parse(BOOT);
  } catch (e) { BOOT = null; }
  if (!BOOT || !BOOT.schema) { app.innerHTML = '<div class="rn-noscript">بارگذاری فرم ممکن نشد. صفحه را دوباره باز کنید.</div>'; return; }

  var S = BOOT.schema, MODE = BOOT.mode || 'live', URLS = BOOT.urls || {};
  var THEME = S.theme || {}, SET = S.settings || {};
  var IS_TEMPLATE = MODE === 'template' || !URLS.start, IS_PREVIEW = MODE === 'preview';
  var LAYOUT = THEME.layout === 'all' ? 'all' : 'one';
  var NUMERIC = { number: 1, price: 1, rating: 1, scale: 1 };
  var QS = (S.questions || []).slice();
  var QMAP = {};
  QS.forEach(function (q) { q.opt = q.opt || {}; QMAP[q.id] = q; });
  var IN_FRAME = (function () { try { return window.self !== window.top; } catch (e) { return true; } })();
  var COARSE = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DEVICE_KEY = 'icsd_done_' + (BOOT.code || '');

  function answerable(q) { return q && q.type !== 'statement'; }

  // ترتیب نمایش: درهم‌ریختن سؤال‌ها فقط وقتی فرم شرط و پرش ندارد (موتور سرور ترتیب را ثابت فرض می‌کند)
  var ORDER = QS.slice();
  if (SET.shuffle && !QS.some(function (q) { return q.show_if || (q.jumps && q.jumps.length); })) ORDER = shuffle(ORDER);

  // ───────────────────────── ابزار ─────────────────────────
  var FA_D = '۰۱۲۳۴۵۶۷۸۹', AR_D = '٠١٢٣٤٥٦٧٨٩';
  function fa(s) { return String(s == null ? '' : s).replace(/\d/g, function (d) { return FA_D[d]; }); }
  function en(s) {
    return String(s == null ? '' : s).replace(/[۰-۹]/g, function (d) { return FA_D.indexOf(d); })
      .replace(/[٠-٩]/g, function (d) { return AR_D.indexOf(d); });
  }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  // آینه‌ی engine.is_empty
  function isEmpty(v) { return v == null || v === '' || v === false || (Array.isArray(v) && !v.length) || (isObj(v) && !Object.keys(v).length); }
  // آینه‌ی engine._num
  function num(v, def) {
    if (def === undefined) def = null;
    if (v == null || v === '') return def;
    if (typeof v === 'number') return isFinite(v) ? v : def;
    if (typeof v !== 'string') return def;
    var s = en(v).trim();
    if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return def;
    var f = parseFloat(s);
    return isFinite(f) ? f : def;
  }
  // str() پایتون برای مقایسه‌ی متنی
  function pyStr(v) {
    if (v === true) return 'True';
    if (v === false) return 'False';
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
    if (typeof v === 'string') return v;
    try { return JSON.stringify(v); } catch (e) { return String(v); }
  }
  function dkey(s) {
    var p = en(s).replace(/-/g, '/').split('/').slice(0, 3);
    if (p.length < 3 || !p.every(function (x) { return /^\s*[+-]?\d+\s*$/.test(x); })) return 0;
    return parseInt(p[0], 10) * 10000 + parseInt(p[1], 10) * 100 + parseInt(p[2], 10);
  }
  function jLeap(y) { return [1, 5, 9, 13, 17, 22, 26, 30].indexOf(((y % 33) + 33) % 33) >= 0; }
  function parseJalali(v) {
    var p = en(v).trim().replace(/[-.]/g, '/').split('/');
    if (p.length < 3) return null;
    var n = p.slice(0, 3).map(function (x) { return /^\s*\d+\s*$/.test(x) ? parseInt(x, 10) : NaN; });
    var y = n[0], m = n[1], d = n[2];
    if (isNaN(y) || isNaN(m) || isNaN(d) || y < 1 || y > 9377 || m < 1 || m > 12 || d < 1) return null;
    var max = m <= 6 ? 31 : m <= 11 ? 30 : (jLeap(y) ? 30 : 29);
    if (d > max) return null;
    return [y, m, d];
  }
  function pad(n, w) { n = String(n); while (n.length < w) n = '0' + n; return n; }
  function g2j(gy, gm, gd) {
    var gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    var gy2 = gm > 2 ? gy + 1 : gy;
    var days = 355666 + 365 * gy + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400) + gd + gdm[gm - 1];
    var jy = -1595 + 33 * Math.floor(days / 12053); days %= 12053;
    jy += 4 * Math.floor(days / 1461); days %= 1461;
    if (days > 365) { jy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
    var jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
    var jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
    return [jy, jm, jd];
  }
  function todayJ() { var d = new Date(), j = g2j(d.getFullYear(), d.getMonth() + 1, d.getDate()); return j[0] + '/' + pad(j[1], 2) + '/' + pad(j[2], 2); }
  function groupDigits(n) { return fa(String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '٬')); }
  function normFa(s) { return String(s || '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[‌‏‎]/g, '').replace(/\s+/g, ' ').toLowerCase().trim(); }
  function safeUrl(u) {
    u = String(u || '').trim();
    if (/^(https?:)?\/\//i.test(u) || /^\/(?!\/)/.test(u)) return u;
    if (/^data:image\//i.test(u)) return u;
    return '';
  }
  function csrf() { var m = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/); return m ? decodeURIComponent(m[1]) : ''; }
  function fmtSize(b) { return b >= 1048576 ? fa((b / 1048576).toFixed(1)) + ' مگابایت' : fa(Math.max(1, Math.round(b / 1024))) + ' کیلوبایت'; }
  var uidN = 0;
  function uid(p) { uidN += 1; return (p || 'rn') + '-' + uidN; }

  // سازنده‌ی DOM
  function h(tag, attrs, kids) {
    var e = document.createElement(tag), k, v;
    if (attrs) {
      for (k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k === 'html') e.innerHTML = v; // فقط برای آیکون‌های SVG داخلی
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else if (k === 'value') e.value = v;
        else if (k === 'checked' || k === 'disabled' || k === 'selected') e[k] = !!v;
        else e.setAttribute(k, v === true ? '' : v);
      }
    }
    add(e, kids);
    return e;
  }
  function add(e, kids) {
    if (kids == null || kids === false) return e;
    if (Array.isArray(kids)) { kids.forEach(function (c) { add(e, c); }); return e; }
    e.appendChild(typeof kids === 'string' || typeof kids === 'number' ? document.createTextNode(String(kids)) : kids);
    return e;
  }
  // متن چندخطی امن
  function rich(text, cls, tag) {
    var e = h(tag || 'p', { class: cls });
    String(text || '').split('\n').forEach(function (line, i) { if (i) e.appendChild(h('br')); e.appendChild(document.createTextNode(line)); });
    return e;
  }

  var IC = {
    check: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7"/></svg>',
    x: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    up: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 6l-6 6 6 6"/></svg>',
    next: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
    grip: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>',
    upload: '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>',
    file: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>',
    lock: '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>',
    phone: '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18h3"/></svg>',
    alert: '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/></svg>',
    star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.9l2.8 5.7 6.3.9-4.55 4.45 1.07 6.27L12 17.27 6.38 20.22l1.07-6.27L2.9 9.5l6.3-.9z"/></svg>',
    heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.4s-7.4-4.5-9.1-9.2C1.7 7.8 3.9 4.6 7.3 4.6c1.9 0 3.5 1 4.7 2.7 1.2-1.7 2.8-2.7 4.7-2.7 3.4 0 5.6 3.2 4.4 6.6-1.7 4.7-9.1 9.2-9.1 9.2z"/></svg>',
    like: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 10.2V20H4.2a1 1 0 0 1-1-1v-7.8a1 1 0 0 1 1-1zM9.5 20h7.7a2.2 2.2 0 0 0 2.15-1.75l1.25-6A2.2 2.2 0 0 0 18.45 9.6H14.2l.6-3.1a2.1 2.1 0 0 0-1.1-2.25l-.55-.27L9.5 9.6z"/></svg>',
    send: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 4L9.5 14.5M20 4l-6.5 16-4-5.5L4 10.5z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/></svg>',
    clock: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
    list: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01"/></svg>',
    enter: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 5v6a3 3 0 0 1-3 3H5m0 0l4-4m-4 4l4 4"/></svg>'
  };
  function ic(name, cls) { return h('span', { class: 'rn-ic ' + (cls || ''), html: IC[name], 'aria-hidden': 'true' }); }

  // ───────────────────────── آینه‌ی موتور (engine.py) ─────────────────────────
  function valueOf(src, answers, vars, hidden) {
    if (src.indexOf('var:') === 0) { var vv = vars[src.slice(4)]; return [vv === undefined ? null : vv, typeof vv === 'number' ? 'number' : 'text']; }
    if (src.indexOf('hidden:') === 0) { var hv = hidden[src.slice(7)]; return [hv == null ? '' : hv, 'text']; }
    var q = QMAP[src];
    if (!q) return [null, 'text'];
    var v = answers[src];
    if (v === undefined) v = null;
    if (NUMERIC[q.type]) return [num(v), 'number'];
    if (q.type === 'date') return [v ? dkey(v) : null, 'date'];
    if (q.type === 'choice' && q.opt.multiple) return [Array.isArray(v) ? v : [], 'list'];
    if (q.type === 'location') return [isObj(v) ? (v.province || '') : '', 'text'];
    if (q.type === 'ranking') return [v || [], 'list'];
    return [v, 'text'];
  }

  function evalCond(c, answers, vars, hidden) {
    var r = valueOf(c.src, answers, vars, hidden), v = r[0], kind = r[1], op = c.op, target = c.value;
    if (op === 'answered') return !isEmpty(v);
    if (op === 'not_answered') return isEmpty(v);
    if (kind === 'list') {
      var tl = Array.isArray(target) ? target : [target];
      var hit = tl.some(function (x) { return v.indexOf(x) >= 0; });
      if (op === 'eq' || op === 'contains' || op === 'in') return hit;
      if (op === 'neq' || op === 'not_contains') return !hit;
      return false;
    }
    if (op === 'gt' || op === 'gte' || op === 'lt' || op === 'lte') {
      var a = v, b = kind === 'date' ? dkey(target) : num(target);
      if (kind !== 'date') a = num(v);
      if (a == null || b == null) return false;
      return op === 'gt' ? a > b : op === 'gte' ? a >= b : op === 'lt' ? a < b : a <= b;
    }
    if (kind === 'number' && num(target) != null && v != null && (op === 'eq' || op === 'neq')) {
      var eq = Number(v) === Number(num(target));
      return op === 'eq' ? eq : !eq;
    }
    var sv = v == null ? '' : pyStr(v).trim().toLowerCase();
    if (op === 'in') {
      var list = Array.isArray(target) ? target : String(target == null ? 'None' : pyStr(target)).split(',').map(function (x) { return x.trim(); });
      return list.map(function (x) { return pyStr(x).trim().toLowerCase(); }).indexOf(sv) >= 0;
    }
    var st_ = target == null ? '' : pyStr(target).trim().toLowerCase();
    if (kind === 'date' && (op === 'eq' || op === 'neq')) st_ = String(dkey(target));
    if (op === 'eq') return sv === st_;
    if (op === 'neq') return sv !== st_;
    if (op === 'contains') return sv.indexOf(st_) >= 0;
    if (op === 'not_contains') return sv.indexOf(st_) < 0;
    return false;
  }

  function evalGroup(g, answers, vars, hidden) {
    if (!g || !g.conds || !g.conds.length) return true;
    if (g.match === 'any') return g.conds.some(function (c) { return evalCond(c, answers, vars, hidden); });
    return g.conds.every(function (c) { return evalCond(c, answers, vars, hidden); });
  }

  function computeVars(answers, visited, hidden) {
    var v = { score: 0 };
    (S.variables || []).forEach(function (x) { v[x.name] = Object.prototype.hasOwnProperty.call(x, 'initial') ? x.initial : (x.type === 'number' ? 0 : ''); });
    visited.forEach(function (qid) {
      var q = QMAP[qid], a = answers[qid];
      if (!q || isEmpty(a)) return;
      var o = q.opt || {}, sc = {};
      if (q.type === 'choice' || q.type === 'dropdown') {
        (o.choices || []).forEach(function (c) { sc[c.id] = c.score || 0; });
        (Array.isArray(a) ? a : [a]).forEach(function (x) { v.score += sc[x] || 0; });
      } else if (q.type === 'matrix' && isObj(a)) {
        (o.cols || []).forEach(function (c) { sc[c.id] = c.score || 0; });
        Object.keys(a).forEach(function (r) { var c = a[r]; (Array.isArray(c) ? c : [c]).forEach(function (x) { v.score += sc[x] || 0; }); });
      } else if (NUMERIC[q.type] && o.add_to_score) {
        v.score += num(a, 0) || 0;
      }
    });
    var vis = {};
    visited.forEach(function (k) { if (Object.prototype.hasOwnProperty.call(answers, k)) vis[k] = answers[k]; });
    (S.calcs || []).forEach(function (c) {
      if (c.conds && c.conds.length && !evalGroup(c, vis, v, hidden)) return;
      var name = c['var'], op = c.op, val = c.value;
      if (typeof val === 'string' && val.charAt(0) === '@') {
        var ref = val.slice(1);
        if (QMAP[ref]) val = vis[ref] === undefined ? null : vis[ref];
        else { val = v[ref.replace('var:', '')]; if (val === undefined) val = null; }
      }
      var cur = v[name];
      if (op === 'set') v[name] = val;
      else {
        var a = num(cur, 0) || 0, b = num(val, 0) || 0;
        v[name] = op === 'add' ? a + b : op === 'sub' ? a - b : op === 'mul' ? a * b : (b ? a / b : a);
      }
    });
    return v;
  }

  // مسیر طی‌شده؛ noBreak: پس از سؤال الزامیِ بی‌پاسخ هم ادامه بده (برای نمایش «همه در یک صفحه» و تخمین پیشرفت)
  function walk(answers, noBreak) {
    var hidden = st.hidden, index = {}, visited = [], forced = null, i = 0, guard = 0;
    ORDER.forEach(function (q, k) { index[q.id] = k; });
    function visA() { var o = {}; visited.forEach(function (k) { o[k] = answers[k] === undefined ? null : answers[k]; }); return o; }
    while (i < ORDER.length && guard < 1000) {
      guard += 1;
      var q = ORDER[i];
      var vars = computeVars(answers, visited, hidden);
      if (q.show_if && !evalGroup(q.show_if, visA(), vars, hidden)) { i += 1; continue; }
      visited.push(q.id);
      if (!noBreak && answerable(q) && isEmpty(answers[q.id]) && q.required) break;
      var nxt = i + 1, va = visA();
      vars = computeVars(answers, visited, hidden);
      var jumps = q.jumps || [];
      for (var j = 0; j < jumps.length; j++) {
        if (evalGroup(jumps[j], va, vars, hidden)) {
          var g = jumps[j].goto;
          if (g === 'end') nxt = ORDER.length;
          else if (g.indexOf('ending:') === 0) { forced = g.slice(7); nxt = ORDER.length; }
          else if (index[g] !== undefined && index[g] > i) nxt = index[g];
          break;
        }
      }
      i = nxt;
    }
    return { visited: visited, forced: forced };
  }

  function chooseEnding(answers, vars, forced) {
    var ends = (S.endings && S.endings.length) ? S.endings : [{ id: 'e_default', title: 'ممنون از وقتی که گذاشتید!', text: 'پاسخ شما ثبت شد.' }];
    var i;
    if (forced) for (i = 0; i < ends.length; i++) if (ends[i].id === forced) return ends[i];
    for (i = 0; i < ends.length; i++) if (ends[i].when && evalGroup(ends[i].when, answers, vars, st.hidden)) return ends[i];
    for (i = 0; i < ends.length; i++) if (!ends[i].when) return ends[i];
    return ends[0];
  }

  function display(q, v, answers) {
    if (isEmpty(v)) return '';
    var t = q.type, o = q.opt || {}, m = {};
    if (t === 'choice' || t === 'dropdown') {
      (o.choices || []).forEach(function (c) { m[c.id] = c.label; });
      var other = (answers || {})[q.id + '__other'] || '';
      m.__other__ = other ? (o.other_label || 'سایر') + ': ' + other : (o.other_label || 'سایر');
      return (Array.isArray(v) ? v : [v]).map(function (x) { return m[x] != null ? m[x] : x; }).join('، ');
    }
    if (t === 'yes_no') return v === 'yes' ? (o.yes_label || 'بله') : (o.no_label || 'خیر');
    if (t === 'matrix' && isObj(v)) {
      var rows = {}, cols = {};
      (o.rows || []).forEach(function (r) { rows[r.id] = r.label; });
      (o.cols || []).forEach(function (c) { cols[c.id] = c.label; });
      return Object.keys(v).map(function (r) { return (rows[r] || r) + ': ' + (Array.isArray(v[r]) ? v[r] : [v[r]]).map(function (x) { return cols[x] || x; }).join('، '); }).join(' | ');
    }
    if (t === 'ranking') { var it = {}; (o.items || []).forEach(function (x) { it[x.id] = x.label; }); return v.map(function (x) { return it[x] || x; }).join(' ← '); }
    if (t === 'location' && isObj(v)) return [v.province, v.city].filter(Boolean).join('، ');
    if ((t === 'file' || t === 'signature') && isObj(v)) return v.name || 'فایل';
    if (t === 'consent') return 'تأیید شد';
    if (t === 'price') { var n = num(String(v).replace(/[,٬]/g, '')); return n == null ? String(v) : groupDigits(Math.trunc(n)) + ' ' + (o.unit || 'تومان'); }
    if (t === 'number') return fa(String(v)) + (o.unit ? ' ' + o.unit : '');
    if (t === 'date' || t === 'mobile' || t === 'phone' || t === 'national_code' || t === 'rating' || t === 'scale') return fa(String(v));
    return pyStr(v);
  }

  function pipe(text, answers, vars) {
    return String(text || '').replace(/\{\{\s*(q|var|hidden):([A-Za-z0-9_-]+)\s*\}\}/g, function (_, kind, key) {
      if (kind === 'q' && QMAP[key]) return display(QMAP[key], answers[key], answers);
      if (kind === 'var') { var v = vars[key]; return v == null ? '' : fa(pyStr(v)); }
      if (kind === 'hidden') return st.hidden[key] == null ? '' : String(st.hidden[key]);
      return '';
    });
  }

  // ───────────────────────── اعتبارسنجی (آینه‌ی validate_answer) ─────────────────────────
  var REQ = 'پاسخ به این سؤال الزامی است.';
  function validNC(c) {
    c = en(c).trim();
    if (!/^\d{10}$/.test(c) || /^(\d)\1{9}$/.test(c)) return false;
    var s = 0; for (var i = 0; i < 9; i++) s += parseInt(c[i], 10) * (10 - i);
    s %= 11; var k = parseInt(c[9], 10);
    return (s < 2 && k === s) || (s >= 2 && k === 11 - s);
  }
  function normMobile(v) { v = en(v).trim().replace(/ /g, ''); if (v.indexOf('+98') === 0) v = '0' + v.slice(3); return v; }
  function normUrl(v) { v = String(v).trim().slice(0, 500); if (v && !/^https?:\/\//.test(v)) v = 'https:' + '//' + v; return v; }

  function validate(q, v) {
    var t = q.type, o = q.opt || {};
    if ((t === 'short_text' || t === 'long_text' || t === 'email' || t === 'url' || t === 'mobile' || t === 'phone' || t === 'national_code' || t === 'number' || t === 'price' || t === 'date') && typeof v === 'string' && !v.trim()) v = '';
    if (isEmpty(v)) return q.required ? REQ : null;
    var n, ids;
    switch (t) {
      case 'short_text': case 'long_text':
        var s = String(v).trim(), len = Array.from(s).length;
        if (o.min_len && len < o.min_len) return 'دست‌کم ' + fa(o.min_len) + ' کاراکتر بنویسید.';
        if (o.max_len && len > o.max_len) return 'حداکثر ' + fa(o.max_len) + ' کاراکتر مجاز است.';
        return null;
      case 'number': case 'price':
        n = num(String(v).replace(/[,٬]/g, '').replace(/٫/g, '.'));
        if (n == null) return 'عدد معتبر وارد کنید.';
        if (t === 'price' || !o.decimals) n = Math.trunc(n);
        if (o.min != null && n < o.min) return 'عدد باید دست‌کم ' + fa(o.min) + ' باشد.';
        if (o.max != null && n > o.max) return 'عدد باید حداکثر ' + fa(o.max) + ' باشد.';
        return null;
      case 'email': return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(v).trim()) ? null : 'ایمیل معتبر نیست.';
      case 'mobile': var mv = normMobile(v); return (/^09\d{9}$/.test(mv)) ? null : 'شماره موبایل باید ۱۱ رقم و با ۰۹ شروع شود.';
      case 'phone': return /^0\d{7,11}$/.test(en(v).trim().replace(/[ -]/g, '')) ? null : 'شماره تلفن را با کد شهر وارد کنید.';
      case 'national_code': return validNC(v) ? null : 'کد ملی معتبر نیست.';
      case 'url': return /^https?:\/\/[^\s/$.?#][^\s]*\.[^\s]{2,}$/.test(normUrl(v)) ? null : 'آدرس معتبر نیست.';
      case 'date':
        var p = parseJalali(String(v).replace(/-/g, '/'));
        if (!p) return 'تاریخ معتبر نیست.';
        var k = p[0] * 10000 + p[1] * 100 + p[2];
        if (o.min && k < dkey(o.min)) return 'تاریخ قبل از بازه‌ی مجاز است.';
        if (o.max && k > dkey(o.max)) return 'تاریخ بعد از بازه‌ی مجاز است.';
        return null;
      case 'choice': case 'dropdown':
        ids = (o.choices || []).map(function (c) { return c.id; });
        if (o.other) ids.push('__other__');
        if (o.multiple) {
          var vals = (Array.isArray(v) ? v : [v]).filter(function (x) { return ids.indexOf(x) >= 0; });
          if (!vals.length) return q.required ? REQ : null;
          if (o.min_select && vals.length < o.min_select) return 'دست‌کم ' + fa(o.min_select) + ' گزینه انتخاب کنید.';
          if (o.max_select && vals.length > o.max_select) return 'حداکثر ' + fa(o.max_select) + ' گزینه مجاز است.';
          return null;
        }
        var one = Array.isArray(v) ? v[0] : v;
        return ids.indexOf(one) >= 0 ? null : 'گزینه‌ی معتبری انتخاب کنید.';
      case 'yes_no': return (v === 'yes' || v === 'no') ? null : 'بله یا خیر را انتخاب کنید.';
      case 'rating': n = num(v); return (n != null && n >= 1 && n <= (o.max || 5)) ? null : 'امتیاز معتبر نیست.';
      case 'scale': n = num(v); return (n != null && n >= (o.min == null ? 1 : o.min) && n <= (o.max || 10)) ? null : 'مقدار معتبر نیست.';
      case 'matrix':
        if (!isObj(v)) return 'پاسخ معتبر نیست.';
        var rows = (o.rows || []).map(function (r) { return r.id; }), cols = (o.cols || []).map(function (c) { return c.id; }), cnt = 0;
        Object.keys(v).forEach(function (r) {
          if (rows.indexOf(r) < 0) return;
          var c = v[r];
          if (o.multiple) { if ((Array.isArray(c) ? c : [c]).some(function (x) { return cols.indexOf(x) >= 0; })) cnt++; }
          else if (cols.indexOf(c) >= 0) cnt++;
        });
        if (q.required && cnt < rows.length) return 'به همه‌ی ردیف‌ها پاسخ دهید.';
        return null;
      case 'ranking':
        var items = (o.items || []).map(function (x) { return x.id; });
        var rv = (Array.isArray(v) ? v : []).filter(function (x) { return items.indexOf(x) >= 0; });
        return rv.slice().sort().join('\u0001') === items.slice().sort().join('\u0001') ? null : 'همه‌ی موارد را مرتب کنید.';
      case 'location':
        if (!isObj(v) || !BOOT.provinces || !Object.prototype.hasOwnProperty.call(BOOT.provinces, String(v.province || ''))) return 'استان را انتخاب کنید.';
        if (o.ask_city !== false && q.required && !String(v.city || '').trim()) return 'شهر را وارد کنید.';
        return null;
      case 'file': case 'signature': return (isObj(v) && v.id) ? null : 'فایل معتبر نیست.';
      case 'consent': return (v === true || v === 'true' || v === '1' || v === 'on' || v === 1) ? null : 'برای ادامه باید تأیید کنید.';
    }
    return null;
  }

  // ───────────────────────── وضعیت ─────────────────────────
  var st = {
    token: null, answers: {}, hidden: {}, cur: null, hist: [], screen: '', password: '', busy: false, lock: false,
    pending: {}, errors: {}, corder: {}, keyHandler: null, last: null, dirty: false, ranked: {}, saveT: null, mobile: ''
  };
  (function readHidden() {
    var qp;
    try { qp = new URLSearchParams(window.location.search); } catch (e) { return; }
    (BOOT.hidden_fields || []).forEach(function (n) { var v = qp.get(n); if (v) st.hidden[n] = v.slice(0, 200); });
    if (IS_TEMPLATE || IS_PREVIEW) qp.forEach(function (v, k) { if (k !== 'embed' && v && st.hidden[k] == null) st.hidden[k] = v.slice(0, 200); });
  })();

  // ───────────────────────── شبکه ─────────────────────────
  var NET_ERR = 'اتصال به سرور برقرار نشد؛ اینترنت خود را بررسی کنید و دوباره تلاش کنید.';
  function api(url, data, keepalive) {
    return fetch(url, {
      method: 'POST', credentials: 'same-origin', keepalive: !!keepalive,
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf(), 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json' },
      body: JSON.stringify(data)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok && !j.error) j.error = r.status === 403 ? 'دسترسی رد شد؛ صفحه را دوباره بارگذاری کنید.' : 'خطایی رخ داد (کد ' + fa(r.status) + '). دوباره تلاش کنید.';
        return { ok: r.ok, status: r.status, data: j };
      });
    }, function () { return { ok: false, status: 0, data: { error: NET_ERR } }; });
  }
  function upload(fd, onProgress) {
    return new Promise(function (resolve, reject) {
      var x = new XMLHttpRequest();
      x.open('POST', URLS.upload);
      x.setRequestHeader('X-CSRFToken', csrf());
      x.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
      if (x.upload && onProgress) x.upload.onprogress = function (e) { if (e.lengthComputable) onProgress(e.loaded / e.total); };
      x.onload = function () {
        var j = {}; try { j = JSON.parse(x.responseText); } catch (e) { /* */ }
        if (x.status >= 200 && x.status < 300 && j.id) resolve(j);
        else reject(j.error || ('بارگذاری ناموفق بود (کد ' + fa(x.status) + ').'));
      };
      x.onerror = function () { reject(NET_ERR); };
      fd.append('mode', IS_PREVIEW ? 'preview' : 'live');
      if (st.token) fd.append('token', st.token);
      x.send(fd);
    });
  }
  function canSave() { return !!(st.token && URLS.save && (BOOT.save_partial || IS_PREVIEW)); }
  function scheduleSave() {
    if (!canSave()) return;
    st.dirty = true;
    clearTimeout(st.saveT);
    st.saveT = setTimeout(flushSave, 1400);
  }
  function flushSave(keepalive) {
    clearTimeout(st.saveT);
    if (!st.dirty || !canSave()) return;
    st.dirty = false;
    api(URLS.save, { token: st.token, answers: st.answers, current: st.cur || st.last || '' }, keepalive);
  }
  window.addEventListener('pagehide', function () { flushSave(true); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flushSave(true); });

  // ───────────────────────── پوسته و ظاهر ─────────────────────────
  function lum(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return 0.5;
    var n = parseInt(m[1], 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (x) { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function applyTheme() {
    var root = document.documentElement, b = document.body;
    var hex = function (v, d) { return /^#[0-9a-f]{6}$/i.test(v || '') ? v : d; };
    root.style.setProperty('--p', hex(THEME.primary, '#1E9E7B'));
    root.style.setProperty('--bg', hex(THEME.bg, '#F6F7F4'));
    root.style.setProperty('--card', hex(THEME.card, '#FFFFFF'));
    root.style.setProperty('--t', hex(THEME.text, '#16303A'));
    root.style.setProperty('--on-p', lum(THEME.primary) > 0.4 ? '#14232a' : '#ffffff');
    if (lum(THEME.bg) < 0.2) b.classList.add('is-dark');
    b.classList.add('fs-' + ({ sm: 'sm', md: 'md', lg: 'lg', xl: 'lg' }[THEME.font_size] || 'md'));
    b.classList.add('rad-' + ({ none: 'none', sm: 'sm', md: 'md', lg: 'lg', xl: 'xl', full: 'xl' }[THEME.radius] || 'lg'));
    if (THEME.align === 'center') b.classList.add('al-center');
    b.classList.add('lay-' + LAYOUT);
    var bgi = safeUrl(THEME.bg_image);
    if (bgi) { document.getElementById('rn-bg').style.backgroundImage = 'url(' + JSON.stringify(bgi) + ')'; b.classList.add('has-bgimg'); }
    if (IN_FRAME) b.classList.add('is-embed');
    if (COARSE) b.classList.add('is-touch');
  }

  var shell = {};
  function buildShell() {
    app.innerHTML = '';
    var logo = safeUrl(THEME.logo);
    shell.bar = h('i');
    shell.progTxt = h('span', { class: 'rn-prog__txt', 'aria-live': 'polite' });
    shell.prog = h('div', { class: 'rn-prog', role: 'progressbar', 'aria-label': 'پیشرفت پاسخ‌دهی', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' }, [h('div', { class: 'rn-prog__track' }, shell.bar)]);
    if (SET.progress === false) shell.prog.hidden = true;
    shell.head = h('header', { class: 'rn-head' }, [
      logo ? h('img', { class: 'rn-logo', src: logo, alt: BOOT.title || 'لوگو' }) : null,
      h('span', { class: 'rn-head__sp' }),
      SET.progress === false ? null : shell.progTxt
    ]);
    shell.stage = h('div', { class: 'rn-stage', id: 'stage' });
    shell.prev = h('button', { type: 'button', class: 'rn-navbtn', 'aria-label': 'سؤال قبلی', title: 'قبلی', onclick: function () { prev(); } }, ic('up'));
    shell.next = h('button', { type: 'button', class: 'rn-navbtn', 'aria-label': 'سؤال بعدی', title: 'بعدی', onclick: function () { next(); } }, ic('down'));
    shell.nav = h('div', { class: 'rn-nav', hidden: true }, [shell.prev, shell.next]);
    var brand = BOOT.branding ? h('a', { class: 'rn-brand', href: window.RN_HOME || '/', target: '_blank', rel: 'noopener' }, ['ساخته‌شده با ', h('b', { text: 'فرم‌ساز ICSD' })]) : h('span');
    shell.foot = h('footer', { class: 'rn-foot' }, [brand, shell.nav]);
    shell.live = h('div', { class: 'rn-sr', 'aria-live': 'assertive', role: 'status' });
    add(app, [shell.prog, shell.head, shell.stage, shell.foot, shell.live]);
  }
  function announce(msg) { shell.live.textContent = ''; setTimeout(function () { shell.live.textContent = msg; }, 30); }

  function setProgress(p) {
    p = Math.max(0, Math.min(1, p));
    shell.bar.style.width = (p * 100).toFixed(1) + '%';
    shell.prog.setAttribute('aria-valuenow', String(Math.round(p * 100)));
  }

  // جابه‌جایی صفحه با انیمیشن
  function swap(el, dir, after) {
    var old = shell.stage.firstElementChild;
    st.lock = true;
    hideJdp();
    function put() {
      shell.stage.innerHTML = '';
      el.classList.add(dir < 0 ? 'in-down' : 'in-up');
      shell.stage.appendChild(el);
      hideJdp();
      window.scrollTo(0, 0);
      setTimeout(function () { st.lock = false; el.classList.remove('in-down', 'in-up'); }, REDUCED ? 0 : 340);
      if (after) after();
      postHeight();
    }
    if (old && !REDUCED) { old.classList.add(dir < 0 ? 'out-down' : 'out-up'); setTimeout(put, 170); }
    else put();
  }

  function hideJdp() {
    if (!window.jalaliDatepicker || !document.querySelector('jdp-container')) return;
    try { window.jalaliDatepicker.hide(); } catch (x) { /* */ }
    Array.prototype.forEach.call(document.querySelectorAll('jdp-container, jdp-overlay'), function (e) { e.style.display = 'none'; });
  }
  function screen(cls, kids) { return h('section', { class: 'rn-screen ' + (cls || '') }, kids); }

  function btn(label, opts) {
    opts = opts || {};
    return h('button', { type: opts.type || 'button', class: 'rn-btn ' + (opts.ghost ? 'rn-btn--g' : 'rn-btn--p') + (opts.cls ? ' ' + opts.cls : ''), onclick: opts.onclick, disabled: opts.disabled },
      [opts.icon ? ic(opts.icon) : null, h('span', { text: label })]);
  }
  function setBusy(b, on, label) {
    if (!b) return;
    b.disabled = !!on;
    b.classList.toggle('is-busy', !!on);
    if (label) b.querySelector('span:last-child').textContent = label;
  }

  // ───────────────────────── صفحه‌ی خوش‌آمد ─────────────────────────
  // تعداد پرسش‌های مسیر پیش‌فرض (پرسش‌های شرطیِ پنهان شمرده نمی‌شوند)
  function countQ() { return walk({}, true).visited.filter(function (id) { return answerable(QMAP[id]); }).length; }
  function showWelcome() {
    st.screen = 'welcome';
    shell.nav.hidden = true;
    setProgress(0);
    shell.progTxt.textContent = '';
    var w = S.welcome || {};
    var n = countQ(), mins = Math.max(1, Math.round(n * 0.25));
    var img = safeUrl(w.image);
    var go = btn(w.button || 'شروع', { cls: 'rn-btn--lg', onclick: function () { begin(go); } });
    var el = screen('rn-welcome', [
      img ? h('img', { class: 'rn-welcome__img', src: img, alt: '' }) : null,
      h('h1', { class: 'rn-welcome__title', text: pipe(w.title || BOOT.title || document.title, {}, computeVars({}, [], st.hidden)) }),
      w.text ? rich(pipe(w.text, {}, computeVars({}, [], st.hidden)), 'rn-welcome__text') : null,
      h('div', { class: 'rn-welcome__go' }, [go, COARSE ? null : h('span', { class: 'rn-hint' }, ['یا ', h('kbd', {}, ['Enter ', ic('enter')]), ' را بزنید'])]),
      n ? h('div', { class: 'rn-welcome__meta' }, [h('span', {}, [ic('list'), fa(n) + ' پرسش']), h('span', {}, [ic('clock'), 'حدود ' + fa(mins) + ' دقیقه'])]) : null
    ]);
    swap(el, 1);
  }

  // ───────────────────────── دروازه‌ها: رمز و تأیید موبایل ─────────────────────────
  function begin(b) {
    if (IS_TEMPLATE) { enterForm(); return; }
    if (BOOT.password && !st.password) { showPassword(); return; }
    if (BOOT.verify_mobile && !st.mobile) { showMobile(); return; }
    doStart(b);
  }

  function gate(icon, title, text, body) {
    return screen('rn-gate', [h('div', { class: 'rn-gate__icon' }, ic(icon)), h('h1', { class: 'rn-gate__title', text: title }), text ? h('p', { class: 'rn-gate__text', text: text }) : null, body]);
  }

  function showPassword(msg) {
    st.screen = 'gate';
    var err = h('div', { class: 'rn-err', role: 'alert', text: msg || '' });
    var inp = h('input', { class: 'rn-input', type: 'password', id: 'rn-pw', autocomplete: 'current-password', 'aria-describedby': 'rn-pw-err', placeholder: 'رمز فرم', dir: 'auto' });
    err.id = 'rn-pw-err';
    var b = btn('ورود به فرم', { type: 'submit' });
    var f = h('form', { class: 'rn-gate__form', novalidate: true, onsubmit: function (e) {
      e.preventDefault();
      if (!inp.value.trim()) { err.textContent = 'رمز را وارد کنید.'; inp.focus(); return; }
      st.password = inp.value;
      if (BOOT.verify_mobile && !st.mobile) { showMobile(); return; }
      doStart(b);
    } }, [h('label', { class: 'rn-sr', for: 'rn-pw', text: 'رمز فرم' }), inp, err, b]);
    swap(gate('lock', 'این فرم رمز دارد', 'برای پاسخ‌دادن، رمزی را که برگزارکننده در اختیارتان گذاشته وارد کنید.', f), 1, function () { inp.focus({ preventScroll: true }); });
  }

  function showMobile(msg) {
    st.screen = 'gate';
    var step = 1, timer = null, mobile = '';
    var err = h('div', { class: 'rn-err', role: 'alert', id: 'rn-otp-err', text: msg || '' });
    var mob = h('input', { class: 'rn-input rn-input--ltr', type: 'tel', id: 'rn-mob', inputmode: 'numeric', autocomplete: 'tel', placeholder: '۰۹۱۲ ۱۲۳ ۴۵۶۷', maxlength: '13', dir: 'ltr', 'aria-describedby': 'rn-otp-err' });
    var code = h('input', { class: 'rn-input rn-input--ltr rn-input--code', type: 'text', id: 'rn-code', inputmode: 'numeric', autocomplete: 'one-time-code', placeholder: '– – – – – –', maxlength: '6', dir: 'ltr', 'aria-describedby': 'rn-otp-err' });
    faDigitsLive(mob); faDigitsLive(code);
    var codeWrap = h('div', { class: 'rn-otp__code', hidden: true }, [h('label', { class: 'rn-lbl', for: 'rn-code', text: 'کد پیامک‌شده' }), code]);
    var info = h('p', { class: 'rn-gate__note' });
    var resend = h('button', { type: 'button', class: 'rn-link', hidden: true, onclick: function () { send(true); } }, 'ارسال دوباره‌ی کد');
    var edit = h('button', { type: 'button', class: 'rn-link', hidden: true, onclick: function () { step = 1; codeWrap.hidden = true; mob.disabled = false; edit.hidden = true; resend.hidden = true; info.textContent = ''; setBusy(b, false, 'دریافت کد تأیید'); mob.focus(); } }, 'ویرایش شماره');
    var b = btn('دریافت کد تأیید', { type: 'submit' });
    function tick(n) {
      clearInterval(timer); resend.disabled = true; resend.textContent = 'ارسال دوباره تا ' + fa(n) + ' ثانیه';
      timer = setInterval(function () { n -= 1; if (n <= 0) { clearInterval(timer); resend.disabled = false; resend.textContent = 'ارسال دوباره‌ی کد'; } else resend.textContent = 'ارسال دوباره تا ' + fa(n) + ' ثانیه'; }, 1000);
    }
    function send() {
      mobile = normMobile(mob.value);
      if (!/^09\d{9}$/.test(mobile)) { err.textContent = 'شماره موبایل باید ۱۱ رقم و با ۰۹ شروع شود.'; mob.focus(); return; }
      err.textContent = ''; setBusy(b, true);
      api(URLS.otp, { mobile: mobile }).then(function (r) {
        setBusy(b, false);
        if (!r.ok) { err.textContent = r.data.error; return; }
        step = 2; codeWrap.hidden = false; mob.disabled = true; edit.hidden = false; resend.hidden = false;
        info.textContent = 'کد ۶ رقمی به ' + fa(mobile) + ' پیامک شد.';
        setBusy(b, false, 'تأیید و ادامه'); tick(60); code.value = ''; code.focus();
      });
    }
    function verify() {
      var c = en(code.value).replace(/\D/g, '');
      if (c.length < 4) { err.textContent = 'کد تأیید را وارد کنید.'; code.focus(); return; }
      err.textContent = ''; setBusy(b, true);
      api(URLS.otp, { mobile: mobile, code: c }).then(function (r) {
        if (!r.ok) { setBusy(b, false); err.textContent = r.data.error; code.select(); return; }
        clearInterval(timer); st.mobile = mobile; doStart(b);
      });
    }
    var f = h('form', { class: 'rn-gate__form', novalidate: true, onsubmit: function (e) { e.preventDefault(); if (step === 1) send(); else verify(); } },
      [h('label', { class: 'rn-lbl', for: 'rn-mob', text: 'شماره موبایل' }), mob, codeWrap, info, err, b, h('div', { class: 'rn-gate__links' }, [edit, resend])]);
    swap(gate('phone', 'تأیید شماره موبایل', 'برای جلوگیری از پاسخ‌های تکراری، شماره‌ی موبایل خود را با کد پیامکی تأیید کنید.', f), 1, function () { mob.focus({ preventScroll: true }); });
  }

  function deviceDone() { try { return !!window.localStorage.getItem(DEVICE_KEY); } catch (e) { return false; } }
  function markDevice() { if (!BOOT.one_per_device) return; try { window.localStorage.setItem(DEVICE_KEY, String(Date.now())); } catch (e) { /* */ } }

  function doStart(b) {
    if (st.token) { enterForm(); return; }
    setBusy(b, true);
    api(URLS.start, { mode: IS_PREVIEW ? 'preview' : 'live', password: st.password, device_done: BOOT.one_per_device ? deviceDone() : false, hidden: st.hidden }).then(function (r) {
      setBusy(b, false);
      if (r.ok && r.data.token) { st.token = r.data.token; enterForm(); return; }
      var d = r.data || {};
      if (d.need_password) { st.password = ''; showPassword(d.error); return; }
      if (d.need_mobile) {
        // در iframe سایت دیگر، کوکی نشست ارسال نمی‌شود و تأیید موبایل ماندگار نمی‌ماند
        if (st.mobile && IN_FRAME) { showFatal('تأیید شماره موبایل در فرم جاسازی‌شده ممکن نیست؛ لطفاً فرم را در صفحه‌ی کامل باز کنید.', false, window.location.href.replace(/([?&])embed=1&?/, '$1').replace(/[?&]$/, '')); return; }
        st.mobile = ''; showMobile(d.error); return;
      }
      showFatal(d.error || NET_ERR, r.status === 0 || r.status === 429);
    });
  }

  function showFatal(msg, retry, openUrl) {
    st.screen = 'fatal';
    shell.nav.hidden = true;
    swap(screen('rn-gate rn-fatal', [h('div', { class: 'rn-gate__icon rn-gate__icon--bad' }, ic('alert')), h('h1', { class: 'rn-gate__title', text: 'امکان ادامه نیست' }),
      h('p', { class: 'rn-gate__text', text: msg }), retry ? btn('تلاش دوباره', { onclick: function () { begin(this); } }) : null,
      openUrl ? h('a', { class: 'rn-btn rn-btn--p', href: openUrl, target: '_blank', rel: 'noopener' }, h('span', { text: 'باز کردن فرم در صفحه‌ی جدید' })) : null]), 1);
  }

  // ───────────────────────── ورود به فرم ─────────────────────────
  function enterForm() {
    if (!ORDER.length) { submit(); return; }
    if (LAYOUT === 'all') { renderAll(); return; }
    st.hist = [];
    var first = walk(st.answers).visited[0];
    if (!first) { submit(); return; }
    goTo(first, 1);
  }

  function pathInfo() {
    var full = walk(st.answers, true).visited;
    var ans = full.filter(function (id) { return answerable(QMAP[id]); });
    return { full: full, ans: ans };
  }
  function pipeCtx() {
    var path = walk(st.answers, true).visited, a = {};
    path.forEach(function (k) { if (st.answers[k] !== undefined) a[k] = st.answers[k]; if (st.answers[k + '__other'] !== undefined) a[k + '__other'] = st.answers[k + '__other']; });
    return { answers: a, vars: computeVars(a, path, st.hidden) };
  }

  // ───────────────────────── بلوک سؤال (مشترک دو چیدمان) ─────────────────────────
  var blocks = {}; // qid → {el, err, title, num, field, q}

  function buildBlock(q, number) {
    var ctxp = pipeCtx();
    var tid = 'qt-' + q.id, did = 'qd-' + q.id, eid = 'qe-' + q.id;
    var numEl = h('span', { class: 'rn-q__num', 'aria-hidden': 'true' });
    var titleTxt = h('span', { class: 'rn-q__ttxt' });
    var title = h(LAYOUT === 'one' ? 'h1' : 'h2', { class: 'rn-q__title', id: tid, tabindex: '-1' }, [numEl, titleTxt, q.required ? h('span', { class: 'rn-req', title: 'الزامی', 'aria-label': '(الزامی)', text: '*' }) : null]);
    var desc = h('p', { class: 'rn-q__desc', id: did });
    var err = h('div', { class: 'rn-err', id: eid, role: 'alert' });
    var img = safeUrl(q.image);
    var b = { q: q, title: title, titleTxt: titleTxt, num: numEl, desc: desc, err: err };
    b.paint = function (ctx) {
      titleTxt.textContent = pipe(q.title, ctx.answers, ctx.vars) || (q.type === 'statement' ? '' : 'بدون عنوان');
      var d = pipe(q.description, ctx.answers, ctx.vars);
      desc.textContent = '';
      d.split('\n').forEach(function (line, i) { if (i) desc.appendChild(h('br')); desc.appendChild(document.createTextNode(line)); });
      desc.hidden = !d;
    };
    b.setNum = function (n) {
      numEl.innerHTML = '';
      if (SET.numbering === false || !n) { numEl.hidden = true; return; }
      numEl.hidden = false;
      add(numEl, [h('span', { text: fa(n) }), ic('arrow')]);
    };
    b.paint(ctxp);
    b.setNum(number);
    var ctl = makeCtl(q, b);
    b.ctl = ctl;
    blocks[q.id] = b;
    b.field = renderField(q, ctl);
    b.el = h('section', { class: 'rn-q rn-q--' + q.type, 'data-q': q.id, 'aria-labelledby': tid, 'aria-describedby': did + ' ' + eid }, [
      h('div', { class: 'rn-q__head' }, [title, desc]),
      img ? h('img', { class: 'rn-q__img', src: img, alt: '' }) : null,
      q.type === 'statement' ? null : h('div', { class: 'rn-q__field' }, b.field),
      err
    ]);
    if (st.errors[q.id]) showErr(q.id, st.errors[q.id]);
    return b;
  }

  function showErr(qid, msg) {
    var b = blocks[qid]; if (!b) return;
    b.err.textContent = msg || '';
    b.el && b.el.classList.toggle('has-err', !!msg);
    if (msg) { b.err.classList.remove('shake'); void b.err.offsetWidth; b.err.classList.add('shake'); }
  }

  // کنترل‌گر هر سؤال: نوشتن پاسخ و واکنش‌ها
  function makeCtl(q) {
    return {
      get: function () { return st.answers[q.id]; },
      set: function (v, quiet) {
        if (isEmpty(v)) delete st.answers[q.id]; else st.answers[q.id] = v;
        st.last = q.id;
        if (st.errors[q.id]) { delete st.errors[q.id]; showErr(q.id, ''); }
        if (!quiet) changed(q);
      },
      extra: function (key, v) {
        if (v == null || v === '') delete st.answers[key]; else st.answers[key] = v;
        scheduleSave();
      },
      auto: function () { if (LAYOUT === 'one') autoNext(q.id); },
      flash: function (msg) { showErr(q.id, msg); }
    };
  }

  function changed() {
    scheduleSave();
    if (LAYOUT === 'all') refreshAll();
    else refreshOne();
  }

  // ───────────────────────── فیلدها ─────────────────────────
  function keyLabel(i, n) { return n <= 9 ? fa(i + 1) : String.fromCharCode(65 + i); }
  function keyIndex(e, n) {
    var c = e.code || '', k = e.key || '', m;
    if (n <= 9) {
      if ((m = /^(?:Digit|Numpad)([1-9])$/.exec(c))) return +m[1] - 1;
      if (/^[1-9]$/.test(k)) return +k - 1;
      if (FA_D.indexOf(k) > 0) return FA_D.indexOf(k) - 1;
      return -1;
    }
    if ((m = /^Key([A-Z])$/.exec(c))) return m[1].charCodeAt(0) - 65;
    return -1;
  }
  function digitKey(e) {
    var c = e.code || '', k = e.key || '', m;
    if ((m = /^(?:Digit|Numpad)(\d)$/.exec(c))) return +m[1];
    if (/^\d$/.test(k)) return +k;
    if (FA_D.indexOf(k) >= 0) return FA_D.indexOf(k);
    return -1;
  }

  // ارقام فارسی هنگام تایپ (با حفظ مکان‌نما)
  function faDigitsLive(inp) {
    inp.addEventListener('input', function () {
      var s = inp.selectionStart, e = inp.selectionEnd, v = inp.value, f = fa(en(v));
      if (f !== v) { inp.value = f; try { inp.setSelectionRange(s, e); } catch (x) { /* */ } }
    });
  }

  function renderField(q, ctl) {
    var f = FIELDS[q.type] || FIELDS.short_text;
    return f(q, ctl);
  }

  function textInput(q, ctl, o) {
    o = o || {};
    var v = ctl.get();
    var inp = h(o.tag || 'input', {
      class: 'rn-input' + (o.ltr ? ' rn-input--ltr' : '') + (o.cls ? ' ' + o.cls : ''), id: 'in-' + q.id, type: o.tag ? null : (o.type || 'text'),
      inputmode: o.inputmode, autocomplete: o.autocomplete || 'off', dir: o.ltr ? 'ltr' : 'auto', maxlength: o.maxlength,
      placeholder: q.opt.placeholder ? fa(q.opt.placeholder) : (o.placeholder || 'پاسخ خود را بنویسید…'), 'aria-labelledby': 'qt-' + q.id, 'aria-required': q.required ? 'true' : null,
      rows: o.tag === 'textarea' ? '3' : null, enterkeyhint: o.tag === 'textarea' ? 'enter' : 'next', spellcheck: o.ltr ? 'false' : null
    });
    if (v != null) inp.value = o.show ? o.show(v) : String(v);
    if (o.fa) faDigitsLive(inp);
    inp.addEventListener('input', function () { ctl.set(o.read ? o.read(inp.value) : inp.value); });
    inp.addEventListener('blur', function (ev) {
      if (LAYOUT !== 'all' || (ev.relatedTarget && ev.relatedTarget.closest && ev.relatedTarget.closest('button'))) return;
      var cur = ctl.get();
      if (cur != null && !isEmpty(cur)) { var e2 = validate(q, cur); if (e2 && e2 !== REQ) ctl.flash(e2); }
    });
    return inp;
  }

  var FIELDS = {
    short_text: function (q, ctl) {
      var o = q.opt, inp = textInput(q, ctl, { maxlength: o.max_len ? String(o.max_len) : '500' });
      return counterWrap(inp, o.max_len);
    },
    long_text: function (q, ctl) {
      var o = q.opt, ta = textInput(q, ctl, { tag: 'textarea', maxlength: o.max_len ? String(o.max_len) : '5000', cls: 'rn-input--area' });
      var grow = function () { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight + 2, 420) + 'px'; };
      ta.addEventListener('input', grow); setTimeout(grow, 0);
      var wrap = counterWrap(ta, o.max_len);
      if (!COARSE && LAYOUT === 'one') add(wrap, h('div', { class: 'rn-hint rn-hint--sm' }, [h('kbd', { text: 'Shift' }), ' + ', h('kbd', { text: 'Enter' }), ' برای رفتن به خط بعد']));
      return wrap;
    },
    email: function (q, ctl) { return textInput(q, ctl, { type: 'email', inputmode: 'email', ltr: true, autocomplete: 'email', placeholder: 'name@example.com' }); },
    url: function (q, ctl) { return textInput(q, ctl, { type: 'url', inputmode: 'url', ltr: true, autocomplete: 'url', placeholder: 'example.com' }); },
    mobile: function (q, ctl) {
      return textInput(q, ctl, { type: 'tel', inputmode: 'numeric', ltr: true, autocomplete: 'tel', maxlength: '13', placeholder: '۰۹۱۲۳۴۵۶۷۸۹', fa: true, show: fa, read: function (s) { return normMobile(s); } });
    },
    phone: function (q, ctl) {
      return textInput(q, ctl, { type: 'tel', inputmode: 'numeric', ltr: true, autocomplete: 'tel', maxlength: '14', placeholder: '۰۲۱۱۲۳۴۵۶۷۸', fa: true, show: fa, read: function (s) { return en(s).trim().replace(/[ -]/g, ''); } });
    },
    national_code: function (q, ctl) {
      return textInput(q, ctl, { inputmode: 'numeric', ltr: true, maxlength: '10', placeholder: '۱۰ رقم بدون خط تیره', fa: true, show: fa, read: function (s) { return en(s).trim(); } });
    },
    number: function (q, ctl) {
      var o = q.opt;
      var inp = textInput(q, ctl, {
        inputmode: o.decimals ? 'decimal' : 'numeric', ltr: true, fa: true, placeholder: 'عدد را وارد کنید', cls: 'rn-input--num',
        show: function (v) { return fa(String(v).replace('.', '٫')); },
        read: function (s) {
          var r = en(s).replace(/٫/g, '.').replace(/[,٬\s]/g, '');
          if (r === '') return '';
          var n = num(r);
          return n == null ? r : (o.decimals ? n : Math.trunc(n));
        }
      });
      var hint = rangeHint(o);
      return h('div', { class: 'rn-numwrap' }, [h('div', { class: 'rn-affix' }, [inp, o.unit ? h('span', { class: 'rn-affix__u', text: o.unit }) : null]), hint ? h('div', { class: 'rn-hint rn-hint--sm', text: hint }) : null]);
    },
    price: function (q, ctl) {
      var o = q.opt, unit = o.unit || 'تومان';
      var words = h('div', { class: 'rn-price__words', 'aria-live': 'polite' });
      var inp = h('input', { class: 'rn-input rn-input--ltr rn-input--num', id: 'in-' + q.id, type: 'text', inputmode: 'numeric', dir: 'ltr', autocomplete: 'off', placeholder: o.placeholder ? fa(o.placeholder) : '۰', 'aria-labelledby': 'qt-' + q.id, enterkeyhint: 'next' });
      var paint = function (n) { words.textContent = n ? priceWords(n, unit) : ''; };
      var v = ctl.get();
      if (v != null && num(v) != null) { inp.value = groupDigits(Math.trunc(num(v))); paint(Math.trunc(num(v))); }
      inp.addEventListener('input', function () {
        var pos = inp.selectionStart || 0, before = en(inp.value.slice(0, pos)).replace(/\D/g, '').length;
        var digits = en(inp.value).replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 15);
        var out = digits ? groupDigits(digits) : '';
        inp.value = out;
        var i = 0, seen = 0;
        while (i < out.length && seen < before) { if (/[۰-۹]/.test(out[i])) seen++; i++; }
        try { inp.setSelectionRange(i, i); } catch (x) { /* */ }
        var n = digits ? parseInt(digits, 10) : null;
        paint(n);
        ctl.set(n == null ? '' : n);
      });
      var hint = rangeHint(o, true);
      return h('div', { class: 'rn-numwrap' }, [h('div', { class: 'rn-affix' }, [inp, h('span', { class: 'rn-affix__u', text: unit })]), words, hint ? h('div', { class: 'rn-hint rn-hint--sm', text: hint }) : null]);
    },
    date: function (q, ctl) {
      var o = q.opt, min = o.min || '', max = o.max || '';
      if (o.birth) { min = min || '1300/01/01'; max = max || todayJ(); }
      var v = ctl.get();
      var inp = h('input', {
        class: 'rn-input rn-input--ltr rn-input--date', id: 'in-' + q.id, type: 'text', 'data-jdp': '', 'data-jdp-only-date': '', inputmode: 'none', autocomplete: 'off', dir: 'ltr',
        placeholder: o.birth ? '۱۳۷۰/۰۱/۰۱' : fa(todayJ()), 'aria-labelledby': 'qt-' + q.id, 'data-jdp-min-date': min || null, 'data-jdp-max-date': max || null,
        value: v ? fa(v) : ''
      });
      if (!COARSE) inp.removeAttribute('inputmode');
      var sync = function () {
        var raw = en(inp.value).trim().replace(/-/g, '/');
        var p = parseJalali(raw);
        var norm = p ? p[0] + '/' + pad(p[1], 2) + '/' + pad(p[2], 2) : raw;
        ctl.set(norm);
        if (p && inp.value !== fa(norm)) inp.value = fa(norm);
      };
      inp.addEventListener('input', sync);
      inp.addEventListener('change', sync);
      // تقویم مقدار را با ارقام لاتین می‌خواند؛ پیش از باز شدنش لاتین و پس از آن فارسی نمایش بده
      inp.addEventListener('focusin', function () { inp.value = en(inp.value); });
      inp.addEventListener('blur', function () { inp.value = fa(inp.value); });
      var hint = o.birth ? 'سال را از فهرست بالای تقویم انتخاب کنید.' : (min || max ? 'بازه‌ی مجاز: ' + (min ? 'از ' + fa(min) + ' ' : '') + (max ? 'تا ' + fa(max) : '') : 'روی کادر بزنید تا تقویم باز شود.');
      return h('div', { class: 'rn-datewrap' }, [h('div', { class: 'rn-affix' }, [inp, h('span', { class: 'rn-affix__u rn-affix__ic', html: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>' })]),
        h('div', { class: 'rn-hint rn-hint--sm', text: hint })]);
    },
    choice: function (q, ctl) { return choiceField(q, ctl); },
    dropdown: function (q, ctl) { return dropdownField(q, ctl); },
    yes_no: function (q, ctl) {
      var o = q.opt;
      var list = [{ id: 'yes', label: o.yes_label || 'بله', icon: 'check' }, { id: 'no', label: o.no_label || 'خیر', icon: 'x' }];
      var tiles = [];
      var wrap = h('div', { class: 'rn-choices rn-choices--yn', role: 'radiogroup', 'aria-labelledby': 'qt-' + q.id });
      function paint() { tiles.forEach(function (t) { var on = ctl.get() === t.dataset.id; t.classList.toggle('on', on); t.setAttribute('aria-checked', on ? 'true' : 'false'); }); }
      function pick(id) { ctl.set(id); paint(); ctl.auto(); }
      list.forEach(function (c, i) {
        var t = h('button', { type: 'button', class: 'rn-opt rn-opt--yn', role: 'radio', 'data-id': c.id, onclick: function () { pick(c.id); } },
          [h('span', { class: 'rn-key', text: keyLabel(i, 2) }), h('span', { class: 'rn-opt__ic' }, ic(c.icon)), h('span', { class: 'rn-opt__lbl', text: c.label })]);
        tiles.push(t); wrap.appendChild(t);
      });
      paint();
      ctl.keys = function (e) { var i = keyIndex(e, 2); if (i >= 0 && i < 2) { pick(list[i].id); return true; } return false; };
      wrap._keys = ctl.keys;
      return wrap;
    },
    rating: function (q, ctl) {
      var o = q.opt, max = o.max || 5, shape = o.shape || 'star', btns = [];
      var wrap = h('div', { class: 'rn-rating rn-rating--' + shape + (max > 6 ? ' rn-rating--many' : ''), role: 'radiogroup', 'aria-labelledby': 'qt-' + q.id });
      function paint(hv) {
        var v = num(ctl.get()) || 0, lit = hv || v;
        btns.forEach(function (b, i) { b.classList.toggle('lit', i < lit); b.classList.toggle('on', i + 1 === v); b.setAttribute('aria-checked', i + 1 === v ? 'true' : 'false'); });
      }
      function pick(n) { ctl.set(n); paint(); ctl.auto(); }
      for (var i = 1; i <= max; i++) {
        (function (n) {
          var b = h('button', { type: 'button', class: 'rn-rate', role: 'radio', 'aria-label': fa(n) + ' از ' + fa(max), onclick: function () { pick(n); },
            onmouseenter: function () { paint(n); }, onfocus: function () { paint(n); }, onblur: function () { paint(0); } },
            shape === 'number' ? h('span', { class: 'rn-rate__n', text: fa(n) }) : [h('span', { class: 'rn-rate__ic', html: IC[shape] || IC.star }), h('span', { class: 'rn-rate__k', text: fa(n) })]);
          btns.push(b); wrap.appendChild(b);
        })(i);
      }
      wrap.addEventListener('mouseleave', function () { paint(0); });
      paint();
      ctl.keys = function (e) { var d = digitKey(e); if (d === 0 && max === 10) d = 10; if (d >= 1 && d <= max) { pick(d); return true; } return false; };
      wrap._keys = ctl.keys;
      var label = h('div', { class: 'rn-rating__val', 'aria-hidden': 'true' });
      var out = h('div', { class: 'rn-ratingwrap' }, [wrap, label]);
      return out;
    },
    scale: function (q, ctl) {
      var o = q.opt, min = o.min == null ? 1 : o.min, max = o.max || 10, btns = [];
      var wrap = h('div', { class: 'rn-scale' + (o.nps ? ' rn-scale--nps' : ''), role: 'radiogroup', 'aria-labelledby': 'qt-' + q.id, style: '--n:' + (max - min + 1) });
      function paint() { var v = num(ctl.get()); btns.forEach(function (b) { var on = v === +b.dataset.v; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); }); }
      function pick(n) { ctl.set(n); paint(); ctl.auto(); }
      for (var i = min; i <= max; i++) {
        (function (n) {
          var tone = o.nps ? (n <= 6 ? 'det' : n <= 8 ? 'pas' : 'pro') : '';
          var b = h('button', { type: 'button', class: 'rn-sc' + (tone ? ' rn-sc--' + tone : ''), role: 'radio', 'data-v': String(n), 'aria-label': fa(n), onclick: function () { pick(n); } }, h('span', { text: fa(n) }));
          btns.push(b); wrap.appendChild(b);
        })(i);
      }
      paint();
      ctl.keys = function (e) { var d = digitKey(e); if (d >= min && d <= max && d <= 9) { pick(d); return true; } return false; };
      wrap._keys = ctl.keys;
      var labels = (o.min_label || o.max_label) ? h('div', { class: 'rn-scale__lbl' }, [h('span', { text: o.min_label ? fa(min) + ' — ' + o.min_label : '' }), h('span', { text: o.max_label ? o.max_label + ' — ' + fa(max) : '' })]) : null;
      var legend = o.nps ? h('div', { class: 'rn-scale__legend', 'aria-hidden': 'true' }, [h('span', { class: 'det' }, 'ناراضی'), h('span', { class: 'pas' }, 'بی‌تفاوت'), h('span', { class: 'pro' }, 'مشتاق')]) : null;
      return h('div', { class: 'rn-scalewrap' }, [wrap, labels, legend]);
    },
    matrix: function (q, ctl) { return matrixField(q, ctl); },
    ranking: function (q, ctl) { return rankingField(q, ctl); },
    location: function (q, ctl) { return locationField(q, ctl); },
    file: function (q, ctl) { return fileField(q, ctl); },
    signature: function (q, ctl) { return signatureField(q, ctl); },
    consent: function (q, ctl) {
      var o = q.opt, id = 'in-' + q.id;
      var cb = h('input', { type: 'checkbox', id: id, class: 'rn-cb__in', checked: ctl.get() === true });
      cb.addEventListener('change', function () { ctl.set(cb.checked ? true : null); lab.classList.toggle('on', cb.checked); });
      var lab = h('label', { class: 'rn-consent' + (ctl.get() === true ? ' on' : ''), for: id }, [cb, h('span', { class: 'rn-cb', 'aria-hidden': 'true' }, ic('check')), h('span', { class: 'rn-consent__t', text: o.label || 'شرایط را خواندم و می‌پذیرم.' })]);
      return lab;
    },
    statement: function () { return h('span'); }
  };

  function rangeHint(o, money) {
    var f = function (n) { return money ? groupDigits(n) : fa(n); };
    if (o.min != null && o.max != null) return 'بین ' + f(o.min) + ' تا ' + f(o.max);
    if (o.min != null) return 'دست‌کم ' + f(o.min);
    if (o.max != null) return 'حداکثر ' + f(o.max);
    return '';
  }
  function priceWords(n, unit) {
    var parts = [], units = [[1e12, 'هزار میلیارد'], [1e9, 'میلیارد'], [1e6, 'میلیون'], [1e3, 'هزار']];
    var r = n;
    units.forEach(function (u) { var k = Math.floor(r / u[0]); if (k) { parts.push(fa(k) + ' ' + u[1]); r -= k * u[0]; } });
    if (r) parts.push(fa(r));
    return parts.join(' و ') + ' ' + unit;
  }
  function counterWrap(inp, max) {
    if (!max) return inp;
    var c = h('div', { class: 'rn-count', 'aria-hidden': 'true' });
    var paint = function () { var n = Array.from(inp.value).length; c.textContent = fa(n) + ' / ' + fa(max); c.classList.toggle('over', n > max); };
    inp.addEventListener('input', paint); paint();
    return h('div', { class: 'rn-countwrap' }, [inp, c]);
  }

  // ─── چندگزینه‌ای ───
  function choiceList(q) {
    var o = q.opt;
    if (!st.corder[q.id]) st.corder[q.id] = o.shuffle ? shuffle(o.choices || []) : (o.choices || []).slice();
    var list = st.corder[q.id].slice();
    if (o.other) list.push({ id: '__other__', label: o.other_label || 'سایر', other: true });
    return list;
  }
  function choiceField(q, ctl) {
    var o = q.opt, multi = !!o.multiple, list = choiceList(q), tiles = [];
    var hasImg = list.some(function (c) { return c.image; });
    var lay = hasImg ? 'img' : (o.layout || 'list');
    var wrap = h('div', { class: 'rn-choices rn-choices--' + lay, role: multi ? 'group' : 'radiogroup', 'aria-labelledby': 'qt-' + q.id });
    var otherInp = h('input', { class: 'rn-input rn-other', type: 'text', maxlength: '500', placeholder: 'بنویسید…', 'aria-label': o.other_label || 'سایر', value: st.answers[q.id + '__other'] || '' });
    otherInp.addEventListener('input', function () { ctl.extra(q.id + '__other', otherInp.value); if (st.errors[q.id]) { delete st.errors[q.id]; showErr(q.id, ''); } });
    var otherWrap = h('div', { class: 'rn-otherwrap', hidden: true }, otherInp);
    function sel() { var v = ctl.get(); return multi ? (Array.isArray(v) ? v : []) : (v == null ? [] : [v]); }
    function paint() {
      var s = sel();
      tiles.forEach(function (t) { var on = s.indexOf(t.dataset.id) >= 0; t.classList.toggle('on', on); t.setAttribute('aria-checked', on ? 'true' : 'false'); });
      otherWrap.hidden = s.indexOf('__other__') < 0;
    }
    function pick(id) {
      var s = sel().slice();
      if (multi) {
        var i = s.indexOf(id);
        if (i >= 0) s.splice(i, 1);
        else {
          if (o.max_select && s.length >= o.max_select) { ctl.flash('حداکثر ' + fa(o.max_select) + ' گزینه می‌توانید انتخاب کنید.'); return; }
          s.push(id);
        }
        ctl.set(s);
      } else ctl.set(id);
      paint();
      if (id === '__other__' && sel().indexOf('__other__') >= 0) { setTimeout(function () { otherInp.focus(); }, 30); return; }
      if (!multi) ctl.auto();
    }
    list.forEach(function (c, i) {
      var img = safeUrl(c.image);
      var t = h('button', { type: 'button', class: 'rn-opt' + (img ? ' rn-opt--img' : ''), role: multi ? 'checkbox' : 'radio', 'data-id': c.id, onclick: function () { pick(c.id); } }, [
        img ? h('span', { class: 'rn-opt__media' }, h('img', { src: img, alt: '', loading: 'lazy' })) : null,
        h('span', { class: 'rn-opt__row' }, [h('span', { class: 'rn-key', text: keyLabel(i, list.length) }), h('span', { class: 'rn-opt__lbl', text: c.label || '—' }), h('span', { class: 'rn-opt__mark' + (multi ? ' sq' : '') }, ic('check'))])
      ]);
      tiles.push(t); wrap.appendChild(t);
    });
    paint();
    ctl.keys = function (e) { var i = keyIndex(e, list.length); if (i >= 0 && i < list.length) { pick(list[i].id); return true; } return false; };
    wrap._keys = ctl.keys;
    var meta = null;
    if (multi) {
      var t = q.description ? '' : 'چند گزینه را می‌توانید انتخاب کنید';
      if (o.min_select && o.max_select) t = 'بین ' + fa(o.min_select) + ' تا ' + fa(o.max_select) + ' گزینه انتخاب کنید';
      else if (o.max_select) t = 'حداکثر ' + fa(o.max_select) + ' گزینه انتخاب کنید';
      else if (o.min_select) t = 'دست‌کم ' + fa(o.min_select) + ' گزینه انتخاب کنید';
      if (t) meta = h('div', { class: 'rn-meta' }, t);
    }
    var out = h('div', {}, [meta, wrap, otherWrap]);
    out._keys = ctl.keys;
    return out;
  }

  // ─── لیست کشویی جست‌وجوپذیر ───
  function dropdownField(q, ctl) {
    var o = q.opt, list = choiceList(q), lid = 'dl-' + q.id, active = -1, shown = [];
    var inp = h('input', { class: 'rn-input rn-dd__in', id: 'in-' + q.id, type: 'text', role: 'combobox', 'aria-expanded': 'false', 'aria-controls': lid, 'aria-autocomplete': 'list',
      'aria-labelledby': 'qt-' + q.id, autocomplete: 'off', placeholder: 'جست‌وجو یا انتخاب کنید…', 'data-noenter': '1', enterkeyhint: 'done' });
    var ul = h('ul', { class: 'rn-dd__list', id: lid, role: 'listbox', hidden: true, 'aria-labelledby': 'qt-' + q.id });
    var tog = h('button', { type: 'button', class: 'rn-dd__tog', tabindex: '-1', 'aria-label': 'نمایش گزینه‌ها', onclick: function () { if (ul.hidden) { open(true); inp.focus(); } else close(); } }, ic('down'));
    var otherInp = h('input', { class: 'rn-input rn-other', type: 'text', maxlength: '500', placeholder: 'بنویسید…', 'aria-label': o.other_label || 'سایر', value: st.answers[q.id + '__other'] || '' });
    otherInp.addEventListener('input', function () { ctl.extra(q.id + '__other', otherInp.value); });
    var otherWrap = h('div', { class: 'rn-otherwrap', hidden: true }, otherInp);
    function labelOf(id) { var c = list.filter(function (x) { return x.id === id; })[0]; return c ? c.label : ''; }
    function syncInput() { inp.value = labelOf(ctl.get()) || ''; otherWrap.hidden = ctl.get() !== '__other__'; wrap.classList.toggle('has-val', !!ctl.get()); }
    function render(filter) {
      var f = normFa(filter);
      shown = list.filter(function (c) { return !f || normFa(c.label).indexOf(f) >= 0; });
      ul.innerHTML = '';
      if (!shown.length) ul.appendChild(h('li', { class: 'rn-dd__empty', text: 'موردی پیدا نشد' }));
      shown.forEach(function (c, i) {
        var on = ctl.get() === c.id;
        ul.appendChild(h('li', { id: lid + '-' + i, role: 'option', class: 'rn-dd__opt' + (on ? ' on' : '') + (i === active ? ' act' : ''), 'aria-selected': on ? 'true' : 'false',
          onmousedown: function (e) { e.preventDefault(); choose(c.id); } }, [h('span', { text: c.label }), on ? ic('check') : null]));
      });
      if (active >= 0) inp.setAttribute('aria-activedescendant', lid + '-' + active); else inp.removeAttribute('aria-activedescendant');
    }
    function open(all) { active = -1; render(all ? '' : inp.value); ul.hidden = false; inp.setAttribute('aria-expanded', 'true'); wrap.classList.add('open'); postHeight(); }
    function close() { ul.hidden = true; inp.setAttribute('aria-expanded', 'false'); wrap.classList.remove('open'); postHeight(); }
    function choose(id) {
      ctl.set(id); close(); syncInput();
      if (id === '__other__') setTimeout(function () { otherInp.focus(); }, 30);
    }
    function filt() { return inp.value === labelOf(ctl.get()) ? '' : inp.value; }
    inp.addEventListener('focus', function () { inp.select(); open(true); });
    inp.addEventListener('click', function () { if (ul.hidden) open(true); });
    inp.addEventListener('input', function () {
      if (ul.hidden) { ul.hidden = false; inp.setAttribute('aria-expanded', 'true'); wrap.classList.add('open'); }
      active = 0; render(inp.value); postHeight();
    });
    inp.addEventListener('blur', function () { setTimeout(function () { close(); var t = normFa(inp.value); if (!t) { if (ctl.get()) ctl.set(null); } syncInput(); }, 120); });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (ul.hidden) open(true); active = Math.min(shown.length - 1, active + 1); render(filt()); scrollAct(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (ul.hidden) open(true); active = Math.max(0, active - 1); render(filt()); scrollAct(); }
      else if (e.key === 'Enter') {
        if (!ul.hidden && shown[active]) { e.preventDefault(); e.stopPropagation(); choose(shown[active].id); }
        else if (!ul.hidden && shown.length === 1) { e.preventDefault(); e.stopPropagation(); choose(shown[0].id); }
        else if (!ul.hidden) { e.preventDefault(); e.stopPropagation(); close(); }
        else { e.preventDefault(); e.stopPropagation(); if (LAYOUT === 'one') next(); }
      } else if (e.key === 'Escape') { close(); syncInput(); }
    });
    function scrollAct() { var a = ul.querySelector('.act'); if (a && a.scrollIntoView) a.scrollIntoView({ block: 'nearest' }); }
    var wrap = h('div', { class: 'rn-dd' }, [h('div', { class: 'rn-dd__box' }, [inp, tog]), ul]);
    syncInput();
    return h('div', {}, [wrap, otherWrap]);
  }

  // ─── ماتریسی ───
  function matrixField(q, ctl) {
    var o = q.opt, rows = o.rows || [], cols = o.cols || [], multi = !!o.multiple, cells = [];
    var mc = cols.length <= 3 ? Math.max(1, cols.length) : 2;  // ستون‌های گزینه در نمای کارتی موبایل
    var grid = h('div', { class: 'rn-mx rn-mx--c' + mc, style: '--cols:' + cols.length, role: 'table', 'aria-labelledby': 'qt-' + q.id });
    grid.appendChild(h('div', { class: 'rn-mx__head', role: 'row' }, [h('span', { class: 'rn-mx__corner', role: 'columnheader' })].concat(cols.map(function (c) { return h('span', { class: 'rn-mx__ch', role: 'columnheader', text: c.label }); }))));
    function val() { var v = ctl.get(); return isObj(v) ? JSON.parse(JSON.stringify(v)) : {}; }
    function paint() {
      var v = val();
      cells.forEach(function (c) {
        var cur = v[c.dataset.r], on = multi ? (Array.isArray(cur) && cur.indexOf(c.dataset.c) >= 0) : cur === c.dataset.c;
        c.classList.toggle('on', on); c.setAttribute('aria-checked', on ? 'true' : 'false');
      });
      rowsEls.forEach(function (r) { r.classList.toggle('done', !!v[r.dataset.r] && (!multi || v[r.dataset.r].length)); });
    }
    function pick(r, c) {
      var v = val();
      if (multi) { var a = Array.isArray(v[r]) ? v[r] : []; var i = a.indexOf(c); if (i >= 0) a.splice(i, 1); else a.push(c); if (a.length) v[r] = a; else delete v[r]; }
      else v[r] = c;
      ctl.set(v); paint();
      if (!multi && LAYOUT === 'one' && q.required && rows.every(function (rr) { return v[rr.id]; })) ctl.auto();
    }
    var rowsEls = [];
    rows.forEach(function (r) {
      var rg = h('div', { class: 'rn-mx__cells', role: multi ? 'group' : 'radiogroup', 'aria-label': r.label });
      cols.forEach(function (c) {
        var cell = h('button', { type: 'button', class: 'rn-mx__cell', role: multi ? 'checkbox' : 'radio', 'data-r': r.id, 'data-c': c.id, 'aria-label': r.label + ': ' + c.label, onclick: function () { pick(r.id, c.id); } },
          [h('span', { class: 'rn-mx__dot' + (multi ? ' sq' : '') }, ic('check')), h('span', { class: 'rn-mx__cl', text: c.label })]);
        cells.push(cell); rg.appendChild(cell);
      });
      var row = h('div', { class: 'rn-mx__row', role: 'row', 'data-r': r.id }, [h('div', { class: 'rn-mx__rl', role: 'rowheader', text: r.label }), rg]);
      rowsEls.push(row); grid.appendChild(row);
    });
    paint();
    return h('div', { class: 'rn-mxwrap' }, grid);
  }

  // ─── رتبه‌بندی ───
  function rankingField(q, ctl) {
    var o = q.opt, items = o.items || [], map = {};
    items.forEach(function (x) { map[x.id] = x; });
    var cur = Array.isArray(ctl.get()) ? ctl.get().filter(function (x) { return map[x]; }) : [];
    var order = cur.length === items.length ? cur.slice() : items.map(function (x) { return x.id; });
    var ul = h('ol', { class: 'rn-rank', 'aria-labelledby': 'qt-' + q.id });
    var status = h('div', { class: 'rn-meta' });
    function commit() { ctl.set(order.slice()); st.ranked[q.id] = true; paint(); }
    function move(i, d) {
      var j = i + d; if (j < 0 || j >= order.length) return;
      var t = order[i]; order[i] = order[j]; order[j] = t; commit(); build();
      var btns = ul.children[j] && ul.children[j].querySelector(d < 0 ? '.rn-rank__up' : '.rn-rank__dn');
      if (btns && !btns.disabled) btns.focus(); else if (ul.children[j]) ul.children[j].querySelector('button:not([disabled])').focus();
      announce(map[order[j]].label + ' — رتبه‌ی ' + fa(j + 1));
    }
    function paint() {
      var done = Array.isArray(ctl.get());
      status.textContent = done ? 'ترتیب شما ثبت شد؛ هر وقت خواستید دوباره جابه‌جا کنید.' : 'گزینه‌ها را با کشیدن یا دکمه‌های بالا و پایین مرتب کنید.';
      ul.classList.toggle('done', done);
    }
    function build() {
      ul.innerHTML = '';
      order.forEach(function (id, i) {
        ul.appendChild(h('li', { class: 'rn-rank__it', 'data-id': id }, [
          h('span', { class: 'rn-rank__grip', title: 'بکشید', 'aria-hidden': 'true' }, ic('grip')),
          h('span', { class: 'rn-rank__n', text: fa(i + 1) }),
          h('span', { class: 'rn-rank__lbl', text: map[id].label }),
          h('span', { class: 'rn-rank__btns' }, [
            h('button', { type: 'button', class: 'rn-rank__up', 'aria-label': 'بالاتر: ' + map[id].label, disabled: i === 0, onclick: function () { move(i, -1); } }, ic('up')),
            h('button', { type: 'button', class: 'rn-rank__dn', 'aria-label': 'پایین‌تر: ' + map[id].label, disabled: i === order.length - 1, onclick: function () { move(i, 1); } }, ic('down'))
          ])
        ]));
      });
    }
    build(); paint();
    if (window.Sortable) {
      window.Sortable.create(ul, {
        animation: 160, handle: COARSE ? '.rn-rank__grip' : '.rn-rank__it', filter: 'button', preventOnFilter: false, ghostClass: 'is-ghost', chosenClass: 'is-chosen',
        onEnd: function () { order = Array.prototype.map.call(ul.children, function (li) { return li.dataset.id; }); commit(); build(); }
      });
    }
    var confirmBtn = h('button', { type: 'button', class: 'rn-link', onclick: function () { commit(); } }, 'همین ترتیب درست است');
    var wrap = h('div', { class: 'rn-rankwrap' }, [status, ul, h('div', { class: 'rn-rank__foot' }, confirmBtn)]);
    wrap._commitDefault = function () { if (!Array.isArray(ctl.get())) commit(); };
    return wrap;
  }

  // ─── استان و شهر ───
  function locationField(q, ctl) {
    var o = q.opt, P = BOOT.provinces || {}, askCity = o.ask_city !== false;
    var v = isObj(ctl.get()) ? ctl.get() : {};
    var pid = 'in-' + q.id, cid = 'ct-' + q.id;
    var ps = h('select', { class: 'rn-input rn-select', id: pid, 'aria-label': 'استان' }, [h('option', { value: '', text: 'انتخاب استان…' })].concat(Object.keys(P).map(function (p) { return h('option', { value: p, text: p, selected: v.province === p }); })));
    var cs = h('select', { class: 'rn-input rn-select', id: cid, 'aria-label': 'شهر' });
    var ct = h('input', { class: 'rn-input', type: 'text', maxlength: '80', placeholder: 'نام شهر را بنویسید', 'aria-label': 'نام شهر' });
    var ctWrap = h('div', { class: 'rn-loc__other', hidden: true }, ct);
    function fillCities(p, city) {
      cs.innerHTML = '';
      var list = P[p] || [];
      cs.appendChild(h('option', { value: '', text: p ? 'انتخاب شهر…' : 'ابتدا استان را انتخاب کنید' }));
      list.forEach(function (c) { cs.appendChild(h('option', { value: c, text: c, selected: city === c })); });
      if (p) cs.appendChild(h('option', { value: '__other', text: 'شهر دیگر…', selected: !!city && list.indexOf(city) < 0 }));
      cs.disabled = !p;
      ctWrap.hidden = !(city && list.indexOf(city) < 0);
      if (!ctWrap.hidden) ct.value = city;
    }
    function commit() {
      var p = ps.value, c = cs.value === '__other' ? ct.value.trim() : cs.value;
      ctl.set(p ? { province: p, city: askCity ? (c || '') : '' } : null);
    }
    ps.addEventListener('change', function () { fillCities(ps.value, ''); commit(); if (askCity && ps.value) cs.focus(); });
    cs.addEventListener('change', function () { ctWrap.hidden = cs.value !== '__other'; if (!ctWrap.hidden) { ct.value = ''; ct.focus(); } commit(); });
    ct.addEventListener('input', commit);
    fillCities(v.province || '', v.city || '');
    return h('div', { class: 'rn-loc' + (askCity ? '' : ' rn-loc--one') }, [
      h('div', { class: 'rn-loc__f' }, [h('label', { class: 'rn-lbl', for: pid, text: 'استان' }), h('div', { class: 'rn-selwrap' }, [ps, ic('down', 'rn-selwrap__ic')])]),
      askCity ? h('div', { class: 'rn-loc__f' }, [h('label', { class: 'rn-lbl', for: cid, text: 'شهر' }), h('div', { class: 'rn-selwrap' }, [cs, ic('down', 'rn-selwrap__ic')]), ctWrap]) : null
    ]);
  }

  // ─── آپلود فایل ───
  function fileField(q, ctl) {
    var o = q.opt, types = o.types || [], maxMb = o.max_mb || 5, id = 'in-' + q.id;
    var inp = h('input', { type: 'file', id: id, class: 'rn-file__in', accept: types.map(function (t) { return '.' + t; }).join(','), 'aria-labelledby': 'qt-' + q.id });
    var bar = h('i');
    var prog = h('div', { class: 'rn-file__prog', hidden: true }, bar);
    var drop = h('label', { class: 'rn-drop', for: id }, [
      ic('upload', 'rn-drop__ic'),
      h('span', { class: 'rn-drop__t' }, [h('b', { text: 'انتخاب فایل' }), ' یا رها کردن آن در این کادر']),
      h('span', { class: 'rn-drop__s', text: 'حداکثر ' + fa(maxMb) + ' مگابایت — قالب‌های مجاز: ' + types.map(function (t) { return t.toUpperCase(); }).join('، ') })
    ]);
    var chip = h('div', { class: 'rn-file__chip', hidden: true });
    var wrap = h('div', { class: 'rn-file' }, [inp, drop, prog, chip]);
    function paint() {
      var v = ctl.get();
      chip.innerHTML = '';
      chip.hidden = !isObj(v);
      drop.hidden = isObj(v);
      if (isObj(v)) {
        add(chip, [ic('file', 'rn-file__fic'), h('span', { class: 'rn-file__name' }, [v.url ? h('a', { href: v.url, target: '_blank', rel: 'noopener', text: v.name || 'فایل' }) : h('span', { text: v.name || 'فایل' }), v._size ? h('small', { text: fmtSize(v._size) }) : null]),
          h('button', { type: 'button', class: 'rn-iconbtn', 'aria-label': 'حذف فایل', title: 'حذف', onclick: function () { ctl.set(null); inp.value = ''; paint(); } }, ic('trash'))]);
      }
      postHeight();
    }
    function take(f) {
      if (!f) return;
      var ext = f.name.indexOf('.') >= 0 ? f.name.split('.').pop().toLowerCase() : '';
      if (types.indexOf(ext) < 0) { ctl.flash('این نوع فایل مجاز نیست. قالب‌های مجاز: ' + types.join('، ')); return; }
      if (f.size > maxMb * 1048576) { ctl.flash('حجم فایل حداکثر ' + fa(maxMb) + ' مگابایت است.'); return; }
      ctl.flash('');
      if (IS_TEMPLATE) { ctl.set({ id: 'local', name: f.name, url: '', _size: f.size }); paint(); return; }
      var fd = new FormData(); fd.append('q', q.id); fd.append('file', f);
      prog.hidden = false; bar.style.width = '4%'; drop.classList.add('is-busy');
      var p = upload(fd, function (x) { bar.style.width = Math.max(4, x * 100) + '%'; }).then(function (r) {
        ctl.set({ id: r.id, name: r.name, url: r.url, _size: f.size });
      }, function (msg) { ctl.flash(String(msg)); }).then(function () { prog.hidden = true; drop.classList.remove('is-busy'); delete st.pending[q.id]; paint(); });
      st.pending[q.id] = p;
    }
    inp.addEventListener('change', function () { take(inp.files && inp.files[0]); });
    ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('is-over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('is-over'); }); });
    drop.addEventListener('drop', function (e) { take(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]); });
    paint();
    return wrap;
  }

  // ─── امضا ───
  function signatureField(q, ctl) {
    var cv = h('canvas', { class: 'rn-sig__cv', 'aria-label': 'کادر امضا؛ با ماوس یا انگشت امضا کنید', role: 'img' });
    var ph = h('span', { class: 'rn-sig__ph', 'aria-hidden': 'true', text: 'اینجا امضا کنید' });
    var prevImg = h('img', { class: 'rn-sig__img', alt: 'امضای ثبت‌شده', hidden: true });
    var status = h('span', { class: 'rn-sig__st', 'aria-live': 'polite' });
    var pad_ = h('div', { class: 'rn-sig__pad' }, [cv, prevImg, ph, h('span', { class: 'rn-sig__line', 'aria-hidden': 'true' })]);
    var clear = h('button', { type: 'button', class: 'rn-btn rn-btn--g rn-btn--sm', onclick: function () { reset(); } }, [ic('trash'), h('span', { text: 'پاک کردن' })]);
    var wrap = h('div', { class: 'rn-sig' }, [pad_, h('div', { class: 'rn-sig__bar' }, [status, clear])]);
    var ctx2 = null, drawing = false, dirty = false, unsaved = false, last = null, t = null, ratio = 1;
    function ink() { return getComputedStyle(document.documentElement).getPropertyValue('--t').trim() || '#16303A'; }
    function size() {
      var r = cv.getBoundingClientRect(); if (!r.width) return;
      ratio = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
      var old = dirty ? cv.toDataURL() : null;
      cv.width = Math.round(r.width * ratio); cv.height = Math.round(r.height * ratio);
      ctx2 = cv.getContext('2d'); ctx2.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx2.lineCap = 'round'; ctx2.lineJoin = 'round'; ctx2.strokeStyle = ink(); ctx2.lineWidth = 2.4;
      if (old) { var im = new Image(); im.onload = function () { ctx2.drawImage(im, 0, 0, r.width, r.height); }; im.src = old; }
    }
    function pt(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    cv.addEventListener('pointerdown', function (e) {
      var rr = cv.getBoundingClientRect();
      if (!ctx2 || Math.abs(cv.width - Math.round(rr.width * ratio)) > 2) size();
      e.preventDefault(); drawing = true; last = pt(e); try { cv.setPointerCapture(e.pointerId); } catch (x) { /* */ }
      ctx2.beginPath(); ctx2.arc(last.x, last.y, 1.2, 0, Math.PI * 2); ctx2.fillStyle = ink(); ctx2.fill();
      dirty = true; unsaved = true; wrap.classList.add('has-ink'); clearTimeout(t);
    });
    cv.addEventListener('pointermove', function (e) {
      if (!drawing) return;
      e.preventDefault();
      var p = pt(e), w = e.pressure && e.pointerType === 'pen' ? 1.2 + e.pressure * 2.4 : 2.4;
      ctx2.lineWidth = w; ctx2.beginPath(); ctx2.moveTo(last.x, last.y);
      var mx = (last.x + p.x) / 2, my = (last.y + p.y) / 2; ctx2.quadraticCurveTo(last.x, last.y, mx, my); ctx2.lineTo(p.x, p.y); ctx2.stroke();
      last = p;
    });
    function end() { if (!drawing) return; drawing = false; clearTimeout(t); t = setTimeout(save, 700); status.textContent = ''; }
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end); cv.addEventListener('pointerleave', end);
    function save() {
      clearTimeout(t); t = null;
      if (!dirty || !unsaved) return;
      unsaved = false;
      var data = cv.toDataURL('image/png');
      if (IS_TEMPLATE) { ctl.set({ id: 'local', name: 'امضا.png', url: '' }); status.textContent = 'امضا ثبت شد ✓'; return; }
      status.textContent = 'در حال ذخیره‌ی امضا…';
      var fd = new FormData(); fd.append('q', q.id); fd.append('data', data);
      var p = upload(fd).then(function (r) { ctl.set({ id: r.id, name: r.name, url: r.url }); status.textContent = 'امضا ثبت شد ✓'; },
        function (msg) { status.textContent = ''; ctl.flash(String(msg)); }).then(function () { delete st.pending[q.id]; });
      st.pending[q.id] = p;
    }
    function reset() {
      clearTimeout(t); dirty = false; unsaved = false; prevImg.hidden = true; cv.hidden = false; wrap.classList.remove('has-ink');
      if (ctx2) ctx2.clearRect(0, 0, cv.width, cv.height);
      status.textContent = ''; ctl.set(null); size();
    }
    var v = ctl.get();
    if (isObj(v) && v.url) { prevImg.src = v.url; prevImg.hidden = false; cv.hidden = true; wrap.classList.add('has-ink'); status.textContent = 'امضا ثبت شد ✓'; }
    else if (isObj(v)) { wrap.classList.add('has-ink'); status.textContent = 'امضا ثبت شد ✓'; }
    wrap._flush = function () { if (unsaved && !drawing) save(); return st.pending[q.id]; };
    wrap._mount = function () { size(); };
    window.addEventListener('resize', function () { if (document.body.contains(cv)) size(); });
    return wrap;
  }

  // ───────────────────────── چیدمان «یک سؤال در هر صفحه» ─────────────────────────
  function refreshOne() {
    var b = blocks[st.cur]; if (!b) return;
    var pi = pathInfo();
    var idx = pi.ans.indexOf(st.cur);
    setProgress(pi.ans.length ? Math.max(0, idx) / pi.ans.length : 0);
    if (SET.progress !== false) shell.progTxt.textContent = idx >= 0 ? fa(idx + 1) + ' از ' + fa(pi.ans.length) : '';
    var isLast = pi.full[pi.full.length - 1] === st.cur;
    if (b.okBtn) b.okBtn.querySelector('span:last-child').textContent = isLast ? 'ارسال پاسخ‌ها' : (b.q.type === 'statement' ? (b.q.opt.button || 'ادامه') : 'تأیید');
    if (b.okBtn) b.okBtn.classList.toggle('is-final', isLast);
    shell.prev.disabled = SET.allow_back === false || !st.hist.length;
  }

  function goTo(qid, dir, msg) {
    var q = QMAP[qid]; if (!q) return;
    st.screen = 'q'; st.cur = qid;
    var pi = pathInfo();
    var number = answerable(q) ? pi.ans.indexOf(qid) + 1 : 0;
    var b = buildBlock(q, number);
    var ok = btn('تأیید', { cls: 'rn-ok', onclick: function () { next(); } });
    ok.insertBefore(ic('check', 'rn-ok__ic'), ok.firstChild);
    b.okBtn = ok;
    var actions = h('div', { class: 'rn-q__actions' }, [ok, COARSE ? null : h('span', { class: 'rn-hint' }, ['یا ', h('kbd', {}, ['Enter ', ic('enter')])])]);
    b.el.appendChild(actions);
    var scr = h('div', { class: 'rn-screen rn-screen--q' }, b.el);
    st.keyHandler = b.ctl.keys || null;
    shell.nav.hidden = false;
    swap(scr, dir, function () {
      refreshOne();
      if (b.field && b.field._mount) b.field._mount();
      if (msg) showErr(qid, msg);
      var focusEl = !COARSE && b.el.querySelector('.rn-q__field input:not([type=file]):not([type=checkbox]):not([data-jdp]), .rn-q__field textarea');
      if (focusEl && !msg) focusEl.focus({ preventScroll: true });
      else b.title.focus({ preventScroll: true });
    });
    // هر جابه‌جایی یک نقطه‌ی ذخیره است (current = پرسش فعلی)
    if (canSave()) { st.dirty = true; flushSave(); }
  }

  function autoNext(qid) {
    // روی آخرین پرسش خودکار ارسال نکن؛ پاسخ‌دهنده خودش «ارسال پاسخ‌ها» را می‌زند
    var path = walk(st.answers).visited, i = path.indexOf(qid);
    if (i < 0 || i === path.length - 1) { var b = blocks[qid]; if (b && b.okBtn && !REDUCED) { b.okBtn.classList.remove('pulse'); void b.okBtn.offsetWidth; b.okBtn.classList.add('pulse'); } return; }
    var v = JSON.stringify(st.answers[qid]);
    setTimeout(function () { if (st.cur === qid && st.screen === 'q' && JSON.stringify(st.answers[qid]) === v && !st.lock) next(); }, REDUCED ? 120 : 420);
  }

  function prepare(q, b) {
    // پیش از اعتبارسنجی: ترتیب پیش‌فرض رتبه‌بندی الزامی و امضای در حال ذخیره
    if (b && b.field) {
      if (q.type === 'ranking' && q.required && b.field._commitDefault) b.field._commitDefault();
      if (b.field._flush) b.field._flush();
    }
    return st.pending[q.id] || Promise.resolve();
  }

  function fullCheck(q) {
    var v = st.answers[q.id];
    var e = validate(q, v);
    if (!e && (q.type === 'choice' || q.type === 'dropdown')) {
      var sel = Array.isArray(v) ? v : [v];
      if (sel.indexOf('__other__') >= 0 && !String(st.answers[q.id + '__other'] || '').trim()) e = 'متن گزینه‌ی «' + (q.opt.other_label || 'سایر') + '» را بنویسید.';
    }
    return e;
  }

  function next() {
    if (LAYOUT !== 'one' || st.screen !== 'q' || st.lock || st.busy) return;
    var q = QMAP[st.cur], b = blocks[st.cur];
    st.busy = true;
    if (b && b.okBtn) setBusy(b.okBtn, true);
    prepare(q, b).then(function () {
      st.busy = false;
      if (b && b.okBtn) setBusy(b.okBtn, false);
      if (st.cur !== q.id) return;
      var e = fullCheck(q);
      if (e) {
        showErr(q.id, e); announce(e);
        var fi = b && b.el.querySelector('.rn-q__field input:not([type=file]):not([type=checkbox]):not([data-jdp]), .rn-q__field textarea');
        if (fi && !COARSE) fi.focus({ preventScroll: true });
        return;
      }
      var path = walk(st.answers).visited, i = path.indexOf(q.id);
      if (i >= 0 && i + 1 < path.length) { st.hist.push(q.id); goTo(path[i + 1], 1); }
      else if (i < 0 && path.length && path[path.length - 1] !== q.id) { st.hist.push(q.id); goTo(path[path.length - 1], 1); }
      else submit();
    });
  }

  function prev() {
    if (LAYOUT !== 'one' || st.screen !== 'q' || st.lock || SET.allow_back === false || !st.hist.length) return;
    goTo(st.hist.pop(), -1);
  }

  // ───────────────────────── چیدمان «همه در یک صفحه» ─────────────────────────
  var allForm = null;
  function renderAll() {
    st.screen = 'all'; st.keyHandler = null;
    shell.nav.hidden = true;
    blocks = {};
    var w = S.welcome || {}, logo = null;
    var title = BOOT.title || w.title || document.title;
    var list = h('div', { class: 'rn-all__list' });
    ORDER.forEach(function (q) {
      var b = buildBlock(q, 0);
      b.el.classList.add('rn-card');
      list.appendChild(b.el);
      if (b.field && b.field._mount) setTimeout(b.field._mount, 30);
    });
    var send = btn('ارسال پاسخ‌ها', { cls: 'rn-btn--lg', icon: 'send', type: 'submit' });
    allForm = h('form', { class: 'rn-screen rn-all', novalidate: true, onsubmit: function (e) { e.preventDefault(); submitAll(send); } }, [
      h('header', { class: 'rn-all__head rn-card' }, [logo, h('h1', { class: 'rn-all__title', text: pipe(title, {}, computeVars({}, [], st.hidden)) }), (!w.enabled && w.text) ? rich(w.text, 'rn-all__text') : null]),
      list,
      h('div', { class: 'rn-all__foot' }, [send])
    ]);
    allForm.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'submit' && !e.target.dataset.noenter) e.preventDefault();
    });
    swap(allForm, 1, function () { refreshAll(); });
  }

  function refreshAll() {
    var pi = pathInfo(), vis = {}, n = 0, done = 0;
    pi.full.forEach(function (id) { vis[id] = 1; });
    var ctx = pipeCtx();
    ORDER.forEach(function (q) {
      var b = blocks[q.id]; if (!b) return;
      var show = !!vis[q.id];
      if (b.el.hidden === show) { b.el.hidden = !show; if (show) { b.el.classList.remove('reveal'); void b.el.offsetWidth; b.el.classList.add('reveal'); } }
      if (show && answerable(q)) { n++; b.setNum(n); if (!isEmpty(st.answers[q.id])) done++; }
      b.paint(ctx);
    });
    setProgress(n ? done / n : 0);
    if (SET.progress !== false) shell.progTxt.textContent = n ? fa(done) + ' از ' + fa(n) + ' پاسخ داده شده' : '';
    postHeight();
  }

  function submitAll(btnEl) {
    if (st.busy) return;
    var pi = pathInfo(), first = null;
    var ps = pi.full.map(function (id) { return prepare(QMAP[id], blocks[id]); });
    setBusy(btnEl, true);
    Promise.all(ps).then(function () {
      setBusy(btnEl, false);
      pi = pathInfo();
      pi.full.forEach(function (id) {
        var e = fullCheck(QMAP[id]);
        st.errors[id] = e || undefined;
        if (!e) delete st.errors[id];
        showErr(id, e || '');
        if (e && !first) first = id;
      });
      if (first) { focusBlock(first); announce('برخی پاسخ‌ها کامل نیستند.'); return; }
      submit(btnEl);
    });
  }
  function focusBlock(qid) {
    var b = blocks[qid]; if (!b) return;
    b.el.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'center' });
    setTimeout(function () { b.title.focus({ preventScroll: true }); }, REDUCED ? 0 : 350);
  }

  // ───────────────────────── ارسال نهایی ─────────────────────────
  function payload() {
    var walked = walk(st.answers), path = walked.visited, out = {};
    Object.keys(st.answers).forEach(function (k) {
      if (path.indexOf(k.split('__')[0]) < 0) return;
      var v = st.answers[k];
      if (isObj(v) && (v.id || v._size)) { v = { id: v.id, name: v.name, url: v.url }; }
      out[k] = v;
    });
    return { answers: out, path: path, forced: walked.forced };
  }

  function submit(btnEl) {
    if (st.busy && !btnEl) return;
    var pl = payload();
    clearTimeout(st.saveT); st.dirty = false;
    if (IS_TEMPLATE) {
      var vars = computeVars(pl.answers, pl.path, st.hidden);
      var e = chooseEnding(pl.answers, vars, pl.forced);
      showEnding({ title: pipe(e.title, pl.answers, vars), text: pipe(e.text, pl.answers, vars), button_text: e.button_text, button_url: e.button_url, redirect_url: e.redirect_url, show_score: e.show_score }, vars);
      return;
    }
    if (!st.token) { showFatal('نشست پاسخ‌دهی آغاز نشده است؛ صفحه را دوباره باز کنید.'); return; }
    st.busy = true;
    var b = btnEl || (blocks[st.cur] && blocks[st.cur].okBtn);
    setBusy(b, true);
    showSending(true);
    api(URLS.submit, { token: st.token, answers: pl.answers }).then(function (r) {
      st.busy = false; setBusy(b, false); showSending(false);
      if (r.ok && r.data.ok) { markDevice(); showEnding(r.data.ending || {}, r.data.variables || {}); return; }
      if (r.status === 422 && r.data.errors) {
        st.errors = r.data.errors;
        var ids = Object.keys(r.data.errors);
        var first = null;
        ORDER.forEach(function (q) { if (!first && ids.indexOf(q.id) >= 0) first = q.id; });
        if (!first) { showFatal(r.data.error || 'برخی پاسخ‌ها معتبر نیستند.'); return; }
        if (LAYOUT === 'all') { ids.forEach(function (id) { showErr(id, st.errors[id]); }); focusBlock(first); }
        else {
          var path = walk(st.answers).visited, k = path.indexOf(first);
          st.hist = k > 0 ? path.slice(0, k) : [];
          goTo(first, -1, st.errors[first]);
        }
        announce(r.data.error || st.errors[first]);
        return;
      }
      if (r.status === 0) { toast(r.data.error); return; }
      showFatal(r.data.error || 'ارسال پاسخ ممکن نشد.');
    });
  }

  var sendingEl = null;
  function showSending(on) {
    if (on) { sendingEl = h('div', { class: 'rn-sending', role: 'status' }, [h('span', { class: 'rn-spin' }), h('span', { text: 'در حال ارسال پاسخ‌ها…' })]); document.body.appendChild(sendingEl); }
    else if (sendingEl) { sendingEl.remove(); sendingEl = null; }
  }
  function toast(msg) {
    var t = h('div', { class: 'rn-toast', role: 'alert', text: msg });
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 400); }, 4200);
  }

  function showEnding(e, vars) {
    st.screen = 'end'; st.keyHandler = null;
    shell.nav.hidden = true;
    setProgress(1);
    shell.progTxt.textContent = '';
    var redirect = safeUrl(e.redirect_url), bUrl = safeUrl(e.button_url);
    var score = vars && vars.score != null ? vars.score : null;
    var kids = [
      h('div', { class: 'rn-end__mark', 'aria-hidden': 'true', html: '<svg viewBox="0 0 64 64" width="64" height="64"><circle cx="32" cy="32" r="29" fill="none" stroke="currentColor" stroke-width="3.5" class="c"/><path d="M19 33.5l9 9 17-19" fill="none" stroke="currentColor" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round" class="k"/></svg>' }),
      h('h1', { class: 'rn-end__title', text: fa(e.title || 'ممنون از وقتی که گذاشتید!') }),
      e.text ? rich(fa(e.text), 'rn-end__text') : null,
      e.show_score && score != null ? h('div', { class: 'rn-end__score' }, [h('span', { text: 'امتیاز شما' }), h('b', { text: fa(pyStr(score)) })]) : null,
      e.button_text && bUrl ? h('a', { class: 'rn-btn rn-btn--p rn-btn--lg', href: bUrl, target: IN_FRAME ? '_top' : null, rel: 'noopener' }, h('span', { text: e.button_text })) : null,
      redirect ? h('p', { class: 'rn-end__redir' }, [h('span', { class: 'rn-spin rn-spin--sm' }), ' در حال انتقال…']) : null,
      IS_TEMPLATE ? h('p', { class: 'rn-end__note', text: 'این پیش‌نمایش قالب است؛ پاسخ شما در جایی ذخیره نشد.' }) : null,
      (IS_TEMPLATE || IS_PREVIEW) ? btn('شروع دوباره', { ghost: true, onclick: restart }) : null
    ];
    swap(screen('rn-end', kids), 1, function () { var t = app.querySelector('.rn-end__title'); if (t) { t.setAttribute('tabindex', '-1'); t.focus({ preventScroll: true }); } });
    if (redirect) setTimeout(function () { try { if (IN_FRAME) window.top.location.href = redirect; else window.location.href = redirect; } catch (x) { window.location.href = redirect; } }, 2000);
  }

  function restart() {
    st.token = null; st.answers = {}; st.errors = {}; st.hist = []; st.cur = null; st.ranked = {}; st.corder = {}; st.busy = false; st.dirty = false;
    blocks = {};
    start();
  }

  // ───────────────────────── صفحه‌کلید ─────────────────────────
  document.addEventListener('keydown', function (e) {
    if (e.isComposing || e.keyCode === 229) return;
    var t = e.target, tag = (t && t.tagName) || '';
    if (st.screen === 'welcome') {
      if (e.key === 'Enter' && tag !== 'BUTTON' && tag !== 'A') { e.preventDefault(); var b = app.querySelector('.rn-welcome .rn-btn'); if (b) b.click(); }
      return;
    }
    if (st.screen !== 'q' || LAYOUT !== 'one') return;
    if (t && t.closest && t.closest('jdp-container')) return;
    if (e.key === 'Enter') {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (tag === 'TEXTAREA') { if (e.shiftKey || COARSE) return; e.preventDefault(); next(); return; }
      if (t.dataset && t.dataset.noenter) return;
      if (tag === 'BUTTON' || tag === 'A') {
        if (t.classList.contains('rn-opt') && t.getAttribute('aria-checked') === 'true') { e.preventDefault(); next(); }
        return;
      }
      if (tag === 'SELECT') return;
      e.preventDefault(); next(); return;
    }
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (st.keyHandler && st.keyHandler(e)) { e.preventDefault(); return; }
    if (e.key === 'ArrowUp' && e.altKey) prev();
  });

  // ───────────────────────── ارتفاع در iframe ─────────────────────────
  var lastH = 0, hT = null;
  function postHeight() {
    if (!IN_FRAME) return;
    clearTimeout(hT);
    hT = setTimeout(function () {
      var hgt = Math.ceil(document.body.getBoundingClientRect().height);
      if (Math.abs(hgt - lastH) < 2) return;
      lastH = hgt;
      try { window.parent.postMessage({ icsdHeight: hgt }, '*'); } catch (x) { /* */ }
    }, 60);
  }
  if (IN_FRAME) {
    if (window.ResizeObserver) new ResizeObserver(postHeight).observe(document.body);
    window.addEventListener('load', postHeight);
  }

  // ───────────────────────── تقویم شمسی ─────────────────────────
  function initDatepicker() {
    if (!window.jalaliDatepicker) return;
    try {
      window.jalaliDatepicker.startWatch({
        persianDigits: true, autoShow: true, autoHide: true, hideAfterChange: true, showTodayBtn: true, showEmptyBtn: true, showCloseBtn: true,
        minDate: 'attr', maxDate: 'attr', time: false, date: true, useDropDownYears: true, zIndex: 3000, changeMonthRotateYear: true,
        separatorChars: { date: '/', between: ' ', time: ':' }
      });
    } catch (e) { /* */ }
  }

  // ───────────────────────── شروع ─────────────────────────
  function start() {
    var w = S.welcome || {};
    if (w.enabled !== false) showWelcome();
    else begin();
  }

  document.addEventListener('click', function (e) { var r = e.target.closest && e.target.closest('[data-restart]'); if (r) { e.preventDefault(); restart(); } });

  applyTheme();
  buildShell();
  initDatepicker();
  start();
})();
