/* صفحه‌ی نتایج: نمودار روند ۳۰ روزه، نمودار دایره‌ای سؤال‌های گزینه‌ای، فیلتر وابسته‌ی سؤال ← گزینه */
(function () {
  'use strict';
  var fa = function (n) { return String(n).replace(/\d/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[d]; }); };
  var readJSON = function (id) {
    var el = document.getElementById(id); if (!el) return null;
    try { var v = JSON.parse(el.textContent); return typeof v === 'string' ? JSON.parse(v) : v; } catch (e) { return null; }
  };
  var css = getComputedStyle(document.documentElement);
  var cv = function (name, fb) { return (css.getPropertyValue(name) || '').trim() || fb; };
  var P = cv('--p', '#1E9E7B');
  var PALETTE = [P, cv('--p2', '#16A9C7'), cv('--zaferan', '#F2A83B'), cv('--golab', '#F05C7E'), '#7C6FE0', '#5B8DEF', '#94A3B8', '#2BB673', '#E0742F', '#A855F7'];
  // رنگ‌ها را برای نوارهای افقی هم در دسترس CSS بگذار (--c0 ... --c9)
  PALETTE.forEach(function (c, i) { document.documentElement.style.setProperty('--c' + i, c); });

  // ─── فیلتر وابسته: فقط گزینه‌های سؤال انتخاب‌شده ───
  var fq = document.getElementById('fq'), fv = document.getElementById('fv');
  if (fq && fv) {
    var sync = function (reset) {
      var q = fq.value, any = false;
      Array.prototype.forEach.call(fv.options, function (o) {
        if (!o.dataset.q) return;
        var show = o.dataset.q === q; o.hidden = !show; o.disabled = !show; if (show) any = true;
      });
      fv.disabled = !q || !any;
      if (reset) fv.value = '';
    };
    sync(false);
    fq.addEventListener('change', function () { sync(true); });
    fq.form.addEventListener('submit', function () { if (!fq.value || !fv.value) { fq.disabled = true; fv.disabled = true; } });
  }

  if (!window.Chart) return;
  var C = window.Chart;
  C.defaults.font.family = 'Vazirmatn, Tahoma, sans-serif';
  C.defaults.font.size = 12;
  C.defaults.color = cv('--t2', '#4C646C');
  C.defaults.borderColor = cv('--line', '#E2E7E3');
  var tip = {
    rtl: true, textDirection: 'rtl', backgroundColor: cv('--t', '#16303A'), padding: 10, cornerRadius: 10,
    titleFont: { family: 'Vazirmatn', weight: '700' }, bodyFont: { family: 'Vazirmatn' }, displayColors: false
  };

  // ─── روند ۳۰ روزه ───
  var tl = readJSON('rs-timeline'), tlc = document.getElementById('tlChart');
  if (tl && tlc) {
    var grad = function (c) {
      var a = c.chart.chartArea; if (!a) return hexA(P, 0.15);
      var g = c.chart.ctx.createLinearGradient(0, a.top, 0, a.bottom);
      g.addColorStop(0, hexA(P, 0.28)); g.addColorStop(1, hexA(P, 0)); return g;
    };
    new C(tlc, {
      type: 'line',
      data: { labels: tl.labels, datasets: [{ label: 'پاسخ کامل', data: tl.values, borderColor: P, backgroundColor: grad, fill: true, tension: 0.3, cubicInterpolationMode: 'monotone',
        borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 5, pointBackgroundColor: P }] },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: false },
          tooltip: Object.assign({}, tip, { callbacks: { title: function (it) { return it[0].label; }, label: function (it) { return fa(it.parsed.y) + ' پاسخ'; } } }) },
        scales: {
          x: { reverse: true, grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
          y: { beginAtZero: true, position: 'right', ticks: { precision: 0, callback: function (v) { return fa(v); } }, grid: { color: cv('--line', '#E2E7E3') } }
        }
      }
    });
  }

  // ─── نمودار دایره‌ای سؤال‌های گزینه‌ای ───
  var charts = readJSON('rs-charts') || {};
  Array.prototype.forEach.call(document.querySelectorAll('canvas[data-chart]'), function (cn) {
    var d = charts[cn.dataset.chart]; if (!d) return;
    var total = d.values.reduce(function (a, b) { return a + b; }, 0);
    if (!total) { cn.parentNode.innerHTML = '<p class="muted small text-center m-0">هنوز داده‌ای برای نمودار نیست.</p>'; return; }
    new C(cn, {
      type: 'doughnut',
      data: { labels: d.labels, datasets: [{ data: d.values, backgroundColor: d.values.map(function (_, i) { return PALETTE[i % PALETTE.length]; }),
        borderColor: cv('--card', '#fff'), borderWidth: 2, hoverOffset: 6 }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '62%',
        plugins: {
          legend: { display: false },
          tooltip: Object.assign({}, tip, { displayColors: true, callbacks: {
            label: function (it) { return ' ' + it.label + ': ' + fa(it.parsed) + ' (' + fa(Math.round(it.parsed * 100 / total)) + '٪)'; } } })
        }
      },
      plugins: [{ id: 'center', afterDraw: function (ch) {
        var a = ch.chartArea, c = ch.ctx; if (!a) return;
        c.save(); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = cv('--t', '#16303A');
        c.font = '900 20px Vazirmatn, Tahoma'; c.fillText(fa(total), (a.left + a.right) / 2, (a.top + a.bottom) / 2 - 7);
        c.font = '600 11px Vazirmatn, Tahoma'; c.fillStyle = cv('--t3', '#8A9DA3'); c.fillText('پاسخ', (a.left + a.right) / 2, (a.top + a.bottom) / 2 + 13);
        c.restore();
      } }]
    });
  });

  function hexA(hex, a) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return 'rgba(30,158,123,' + a + ')';
    var n = parseInt(m[1], 16);
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
  }
})();
