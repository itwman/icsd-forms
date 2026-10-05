/* رفتارهای عمومی: پیام‌ها، تقویم شمسی، کپی، تأیید حذف */
(function () {
  'use strict';
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  window.toast = function (msg, kind) {
    var box = document.getElementById('toasts'); if (!box) return;
    var t = document.createElement('div'); t.className = 'toast-i ' + (kind || 'success'); t.textContent = msg;
    var b = document.createElement('button'); b.type = 'button'; b.textContent = '✕'; t.appendChild(b); box.appendChild(t);
    setTimeout(function () { t.remove(); }, 4500);
  };
  $$('#toasts .toast-i').forEach(function (t, i) { setTimeout(function () { t.remove(); }, 5500 + i * 500); });
  document.addEventListener('click', function (e) {
    var x = e.target.closest('.toast-i button'); if (x) x.parentNode.remove();
    var c = e.target.closest('[data-copy]');
    if (c) {
      e.preventDefault();
      var v = c.dataset.copy || (document.querySelector(c.dataset.copyFrom) || {}).value || '';
      (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(function () { window.toast('کپی شد'); },
        function () { window.prompt('کپی کنید:', v); });
    }
    var cf = e.target.closest('[data-confirm]');
    if (cf && !window.confirm(cf.dataset.confirm)) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  if (window.jalaliDatepicker) {
    jalaliDatepicker.startWatch({ persianDigits: true, autoShow: true, autoHide: true, showTodayBtn: true, showEmptyBtn: true,
                                  hideAfterChange: true, time: true, hasSecond: false, separatorChar: '/' });
  }
  // ارقام فارسی → لاتین پیش از ارسال
  var en = function (s) { return s.replace(/[۰-۹]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'.indexOf(d); }).replace(/[٠-٩]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(d); }); };
  document.addEventListener('submit', function (e) {
    $$('input[inputmode="numeric"], [data-jdp]', e.target).forEach(function (i) { i.value = en(i.value); });
  }, true);
  window.faNum = function (n) { return String(n).replace(/\d/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[d]; }); };
})();
