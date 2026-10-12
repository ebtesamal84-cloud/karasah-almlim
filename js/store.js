/* =========================================================
   store.js — طبقة التخزين المحلي في المتصفح
   كل بيانات التطبيق تُحفظ هنا داخل localStorage
   (لا خادم، لا إنترنت، لا قواعد بيانات خارجية)
   ========================================================= */

var Store = (function () {
  var PREFIX = 'karasah.';
  var memoryOnly = false;   // تُفعَّل إذا تعذّر التخزين في المتصفح
  var memory = {};          // نسخة مؤقتة داخل الذاكرة

  /* هل التخزين المحلي متاح فعلاً؟ */
  function isAvailable() {
    try {
      var t = PREFIX + '__probe__';
      window.localStorage.setItem(t, '1');
      window.localStorage.removeItem(t);
      return true;
    } catch (e) {
      return false;
    }
  }
  memoryOnly = !isAvailable();

  /* قراءة قيمة */
  function get(key, fallback) {
    var raw;
    try {
      raw = memoryOnly ? memory[key] : window.localStorage.getItem(PREFIX + key);
    } catch (e) { raw = null; }
    if (raw === null || raw === undefined || raw === '') return fallback;
    try { return JSON.parse(raw); }
    catch (e) { return fallback; }
  }

  /* حفظ قيمة — يُعيد true عند النجاح و false عند الفشل */
  function set(key, value) {
    var raw;
    try { raw = JSON.stringify(value); }
    catch (e) { return false; }
    memory[key] = value;
    if (memoryOnly) return false;
    try {
      window.localStorage.setItem(PREFIX + key, raw);
      return true;
    } catch (e) {
      // الامتلاء أو منع التخزين
      window.App && window.App.notify && window.App.notify('تعذّر الحفظ: امتلأ مساحة المتصفح أو مُنع التخزين.', true);
      return false;
    }
  }

  function remove(key) {
    delete memory[key];
    try { window.localStorage.removeItem(PREFIX + key); } catch (e) {}
  }

  /* كل المفاتيح الخاصة بالتطبيق */
  function keys() {
    var out = [];
    try {
      for (var i = 0; i < window.localStorage.length; i++) {
        var k = window.localStorage.key(i);
        if (k && k.indexOf(PREFIX) === 0) out.push(k.slice(PREFIX.length));
      }
    } catch (e) {}
    for (var m in memory) { if (out.indexOf(m) === -1) out.push(m); }
    return out;
  }

  /* مقدار البايتات المستخدمة */
  function usageBytes() {
    var total = 0, ks = keys();
    for (var i = 0; i < ks.length; i++) {
      try {
        var v = memoryOnly ? memory[ks[i]] : window.localStorage.getItem(PREFIX + ks[i]);
        total += (v ? v.length * 2 : 0) + ks[i].length * 2;
      } catch (e) {}
    }
    return total;
  }

  /* تنسيق حجم التخزين */
  function usageText() {
    var b = usageBytes();
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    return (b / (1024 * 1024)).toFixed(2) + ' MB';
  }

  /* تصدير كل البيانات كنص JSON */
  function exportJSON() {
    var out = { _app: 'karasah-almlim', _version: 1, _exportedAt: new Date().toISOString(), data: {} };
    var ks = keys();
    for (var i = 0; i < ks.length; i++) out.data[ks[i]] = get(ks[i], null);
    return JSON.stringify(out, null, 2);
  }

  /* استيراد بيانات من نص JSON — يُعيد عدد المفاتيح المستوردة */
  function importJSON(text) {
    var obj = JSON.parse(text);               // قد يرمي خطأ
    if (!obj || typeof obj !== 'object' || !obj.data || typeof obj.data !== 'object') {
      throw new Error('الملف غير صالح');
    }
    var count = 0;
    for (var k in obj.data) {
      if (Object.prototype.hasOwnProperty.call(obj.data, k)) {
        set(k, obj.data[k]);
        count++;
      }
    }
    return count;
  }

  return {
    get: get,
    set: set,
    remove: remove,
    keys: keys,
    usageText: usageText,
    usageBytes: usageBytes,
    exportJSON: exportJSON,
    importJSON: importJSON,
    isMemoryOnly: function () { return memoryOnly; }
  };
})();
