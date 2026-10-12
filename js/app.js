/* =========================================================
   app.js — منطق التطبيق
   1) التنقل بين الأقسام   2) التحضير اليومي (إنشاء/تعديل/حذف/بحث/طباعة)
   3) التخطيط               4) بنك الأنشطة   5) الملاحظات
   6) البيانات الأساسية والنسخ الاحتياطي
   ========================================================= */

/* ---------------- أدوات مساعدة ---------------- */
function $(sel, root) { return (root || document).querySelector(sel); }
function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

function esc(s) {
  return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function uid() {
  return 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

var AR_MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
var SCHOOL_MONTHS = ['سبتمبر','أكتوبر','نوفمبر','ديسمبر','يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس'];
var WEEK_DAYS = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس'];

function formatArabicDate(iso) {
  if (!iso) return '';
  var p = String(iso).split('-');
  if (p.length !== 3) return iso;
  var m = parseInt(p[1], 10) - 1;
  return parseInt(p[2], 10) + ' ' + (AR_MONTHS[m] || '') + ' ' + p[0];
}

function todayISO() {
  var d = new Date();
  var mm = String(d.getMonth() + 1).padStart(2, '0');
  var dd = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + mm + '-' + dd;
}

var toastTimer = null;
function notify(msg, isError) {
  var t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.toggle('is-error', !!isError);
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.hidden = true; }, 3200);
}
window.App = { notify: notify };

function showOk(elId) {
  var el = $('#' + elId);
  if (!el) return;
  el.hidden = false;
  setTimeout(function () { el.hidden = true; }, 2500);
}

/* =========================================================
   1) التنقل بين الأقسام
   ========================================================= */
function route() {
  var hash = (location.hash || '').replace(/^#\/?/, '');
  var names = $$('[data-section]').map(function (s) { return s.getAttribute('data-section'); });
  if (names.indexOf(hash) === -1) hash = 'home';

  $$('[data-section]').forEach(function (s) {
    s.classList.toggle('hidden', s.getAttribute('data-section') !== hash);
  });
  $$('.main-nav a').forEach(function (a) {
    a.classList.toggle('is-active', a.getAttribute('data-nav') === hash);
  });

  $('#mainNav').classList.remove('is-open');
  $('#navToggle').setAttribute('aria-expanded', 'false');
  window.scrollTo({ top: 0, behavior: 'auto' });

  // إعادة رسم محتوى القسم عند دخوله (يضمن عرض أحدث البيانات دائمًا)
  if (hash === 'home') refreshStats();
  if (hash === 'prep' && typeof renderPrepList === 'function') renderPrepList();
  if (hash === 'activities' && typeof renderActList === 'function') renderActList();
  if (hash === 'notes' && typeof renderNoteList === 'function') renderNoteList();
  if (hash === 'plans' && typeof renderYearList === 'function') renderYearList();
  if (hash === 'assess' && typeof renderQList === 'function') {
    renderQList(); renderExamBuilder(); renderExmList();
  }
  if (hash === 'students' && typeof renderStuList === 'function') {
    renderStuList(); studentsDatalist(); classOptionsInto('classesList');
  }
  if (hash === 'diffs' && typeof renderDiffList === 'function') renderDiffList();
}

function initNav() {
  $('#navToggle').addEventListener('click', function () {
    var nav = $('#mainNav');
    var open = nav.classList.toggle('is-open');
    this.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  window.addEventListener('hashchange', route);
}

function refreshStats() {
  var preps = Store.get('preps', []);
  var acts = Store.get('activities', []);
  var b = Store.get('basics', {});
  $('#statPreps').textContent = preps.length;
  $('#statActivities').textContent = acts.length;
  $('#statYear').textContent = b.year && String(b.year).trim() ? String(b.year).trim() : '—';
  $('#statStorage').textContent = Store.isMemoryOnly() ? 'غير متاح' : Store.usageText();
}

/* =========================================================
   2) البيانات الأساسية + النسخ الاحتياطي
   ========================================================= */
var BASICS_FIELDS = ['b_teacher', 'b_school', 'b_year', 'b_subject', 'b_classes', 'b_extra', 'b_notes'];

function loadBasics() {
  var b = Store.get('basics', {});
  BASICS_FIELDS.forEach(function (id) {
    var el = $('#' + id);
    if (el && typeof b[id] === 'string') el.value = b[id];
  });
}

function initBasics() {
  loadBasics();

  $('#basicsForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var b = {};
    BASICS_FIELDS.forEach(function (id) { b[id] = $('#' + id).value; });
    if (Store.set('basics', b)) {
      showOk('basicsOk');
      notify('✓ حُفظت البيانات الأساسية');
    }
    refreshStats();
  });

  $('#basicsReset').addEventListener('click', function () {
    if (!confirm('هل تريد تفريغ حقول البيانات الأساسية؟')) return;
    BASICS_FIELDS.forEach(function (id) { var el = $('#' + id); if (el) el.value = ''; });
    Store.remove('basics');
    notify('تم تفريغ الحقول');
    refreshStats();
  });

  $('#exportBtn').addEventListener('click', function () {
    try {
      var json = Store.exportJSON();
      var blob = new Blob([json], { type: 'application/json;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'نسخة-احتياطية-كراسة-المعلم-' + todayISO() + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
      notify('✓ تم إنشاء ملف النسخة الاحتياطية');
    } catch (e) {
      notify('تعذّر إنشاء الملف: ' + e.message, true);
    }
  });

  $('#importFile').addEventListener('change', function (e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var n = Store.importJSON(String(reader.result));
        if (!confirm('تم استيراد ' + n + ' عنصرًا. سيتم إعادة تحميل الصفحة لعرض البيانات. هل تريد المتابعة؟')) {
          e.target.value = '';
          return;
        }
        location.reload();
      } catch (err) {
        notify('الملف غير صالح: ' + err.message, true);
      }
      e.target.value = '';
    };
    reader.onerror = function () { notify('تعذّرت قراءة الملف', true); };
    reader.readAsText(file, 'utf-8');
  });
}

/* =========================================================
   3) التخطيط: أسبوعي / شهري / سنوي
   ========================================================= */
function initPlanTabs() {
  $$('[data-plan-tab]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var key = btn.getAttribute('data-plan-tab');
      $$('[data-plan-tab]').forEach(function (b) { b.classList.toggle('is-active', b === btn); });
      ['week', 'month', 'year'].forEach(function (k) {
        $('#plan-' + k).classList.toggle('hidden', k !== key);
      });
    });
  });
}

function buildWeekTable() {
  var saved = Store.get('planWeek', null);
  var tbody = $('#weekTable tbody');
  tbody.innerHTML = '';
  WEEK_DAYS.forEach(function (day, r) {
    var tr = document.createElement('tr');
    var th = document.createElement('th');
    th.textContent = day;
    tr.appendChild(th);
    for (var c = 0; c < 6; c++) {
      var td = document.createElement('td');
      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'week-cell';
      input.setAttribute('data-r', r);
      input.setAttribute('data-c', c);
      input.dir = 'auto';
      if (saved && saved[r] && saved[r][c]) input.value = saved[r][c];
      td.appendChild(input);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  });
}

function initPlans() {
  initPlanTabs();
  buildWeekTable();

  $('#weekSave').addEventListener('click', function () {
    var rows = [];
    $$('#weekTable .week-cell').forEach(function (inp) {
      var r = +inp.getAttribute('data-r'), c = +inp.getAttribute('data-c');
      rows[r] = rows[r] || [];
      rows[r][c] = inp.value;
    });
    if (Store.set('planWeek', rows)) { showOk('weekOk'); notify('✓ حُفظ الجدول الأسبوعي'); }
  });

  // الشهري
  var monthSel = $('#monthSelect');
  var yearSel = $('#y_month');
  SCHOOL_MONTHS.forEach(function (m) {
    var o1 = document.createElement('option'); o1.value = m; o1.textContent = m; monthSel.appendChild(o1);
    var o2 = document.createElement('option'); o2.value = m; o2.textContent = m; yearSel.appendChild(o2);
  });

  function loadMonth() {
    var data = Store.get('planMonths', {});
    $('#monthText').value = data[monthSel.value] || '';
  }
  monthSel.addEventListener('change', loadMonth);
  loadMonth();

  $('#monthSave').addEventListener('click', function () {
    var data = Store.get('planMonths', {});
    data[monthSel.value] = $('#monthText').value;
    if (Store.set('planMonths', data)) { showOk('monthOk'); notify('✓ حُفظت ملاحظات شهر ' + monthSel.value); }
  });

  // السنوي
  $('#yearForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var title = $('#y_title').value.trim();
    if (!title) { notify('اكتب اسم الدرس أولًا', true); return; }
    var items = Store.get('planYear', []);
    items.push({
      id: uid(),
      title: title,
      month: $('#y_month').value,
      week: $('#y_week').value,
      status: $('#y_status').value
    });
    Store.set('planYear', items);
    $('#y_title').value = ''; $('#y_week').value = '';
    $('#yearSearch').value = '';
    renderYearList();
    notify('✓ أُضيف إلى الخطة السنوية');
  });

  $('#yearSearch').addEventListener('input', renderYearList);
  renderYearList();
}

function renderYearList() {
  var q = ($('#yearSearch').value || '').trim().toLowerCase();
  var items = Store.get('planYear', []).slice().reverse();
  var box = $('#yearList');

  var shown = items.filter(function (it) {
    if (!q) return true;
    return (it.title + ' ' + it.month + ' ' + it.status).toLowerCase().indexOf(q) !== -1;
  });

  if (!shown.length) {
    box.innerHTML = '<div class="empty-state"><span class="big">🗓️</span>' +
      (items.length ? 'لا نتائج مطابقة لبحثك.' : 'لا توجد دروس في الخطة السنوية بعد.') + '</div>';
    return;
  }

  box.innerHTML = shown.map(function (it) {
    return '<div class="item-card">' +
      '<div class="item-top">' +
        '<div><h4 class="item-title">' + esc(it.title) + '</h4>' +
        '<div class="item-meta"><span class="tag">' + esc(it.month) + '</span>' +
        (it.week ? '<span class="tag">الحصة ' + esc(it.week) + '</span>' : '') +
        '<span class="tag tag-gold">' + esc(it.status) + '</span></div></div>' +
        '<div class="item-actions"><button type="button" class="btn btn-sm btn-danger" data-year-del="' + esc(it.id) + '">حذف</button></div>' +
      '</div></div>';
  }).join('');

  $$('[data-year-del]', box).forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (!confirm('حذف هذا الدرس من الخطة السنوية؟')) return;
      var items2 = Store.get('planYear', []).filter(function (x) { return x.id !== btn.getAttribute('data-year-del'); });
      Store.set('planYear', items2);
      renderYearList();
      notify('تم الحذف');
    });
  });
}

/* =========================================================
   4) التحضير اليومي
   ========================================================= */
function stepRow(text, time) {
  var div = document.createElement('div');
  div.className = 'step-row';
  div.innerHTML =
    '<span class="step-num"></span>' +
    '<input type="text" class="step-text" dir="auto" placeholder="وصف الخطوة / نشاط المعلم أو التلميذ" value="' + esc(text || '') + '">' +
    '<input type="text" class="step-time" dir="auto" placeholder="الزمن (د)" value="' + esc(time || '') + '">' +
    '<button type="button" class="btn btn-sm btn-danger btn-remove" title="حذف الخطوة">✕</button>';
  div.querySelector('.btn-remove').addEventListener('click', function () {
    div.remove();
    renumberSteps();
  });
  return div;
}

function renumberSteps() {
  $$('#prepSteps .step-row').forEach(function (row, i) {
    row.querySelector('.step-num').textContent = i + 1;
  });
}

function addStep(text, time) {
  $('#prepSteps').appendChild(stepRow(text, time));
  renumberSteps();
}

function readSteps() {
  return $$('#prepSteps .step-row').map(function (row) {
    return {
      text: row.querySelector('.step-text').value.trim(),
      time: row.querySelector('.step-time').value.trim()
    };
  }).filter(function (s) { return s.text; });
}

function readStrategies() {
  return $$('input[name="p_strategy"]:checked').map(function (c) { return c.value; });
}

function collectPrepForm() {
  return {
    cls: $('#p_class').value.trim(),
    date: $('#p_date').value,
    period: $('#p_period').value.trim(),
    title: $('#p_title').value.trim(),
    know: $('#p_know').value,
    skill: $('#p_skill').value,
    att: $('#p_att').value,
    warm: $('#p_warm').value,
    tools: $('#p_tools').value,
    strategies: readStrategies(),
    steps: readSteps(),
    eval: $('#p_eval').value,
    evalKind: $('#p_evalKind').value,
    homework: $('#p_homework').value,
    notes: $('#p_notes').value
  };
}

function fillPrepForm(d) {
  $('#p_id').value = d.id || '';
  $('#p_class').value = d.cls || '';
  $('#p_date').value = d.date || todayISO();
  $('#p_period').value = d.period || '';
  $('#p_title').value = d.title || '';
  $('#p_know').value = d.know || '';
  $('#p_skill').value = d.skill || '';
  $('#p_att').value = d.att || '';
  $('#p_warm').value = d.warm || '';
  $('#p_tools').value = d.tools || '';
  $('#p_eval').value = d.eval || '';
  $('#p_evalKind').value = d.evalKind || 'تقويم تكويني (أثناء التعلم)';
  $('#p_homework').value = d.homework || '';
  $('#p_notes').value = d.notes || '';

  $$('input[name="p_strategy"]').forEach(function (c) {
    c.checked = (d.strategies || []).indexOf(c.value) !== -1;
  });

  $('#prepSteps').innerHTML = '';
  var steps = d.steps && d.steps.length ? d.steps : [{ text: '', time: '' }];
  steps.forEach(function (s) { addStep(s.text, s.time); });

  $('#prepSave').textContent = d.id ? '💾 تحديث التحضير' : '💾 حفظ التحضير';
}

function resetPrepForm(keepDate) {
  var date = keepDate ? $('#p_date').value : todayISO();
  fillPrepForm({ date: date || todayISO() });
  $('#p_id').value = '';
  $('#prepSave').textContent = '💾 حفظ التحضير';
  $$('.item-card.is-editing').forEach(function (c) { c.classList.remove('is-editing'); });
}

function initPrep() {
  resetPrepForm(false);

  $('#addStep').addEventListener('click', function () { addStep('', ''); });

  $('#prepForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var form = e.target;
    if (!form.checkValidity()) { form.reportValidity(); return; }

    var data = collectPrepForm();
    var id = $('#p_id').value;
    var items = Store.get('preps', []);

    if (id) {
      var found = false;
      items = items.map(function (it) {
        if (it.id === id) { found = true; return Object.assign({}, it, data, { updatedAt: new Date().toISOString() }); }
        return it;
      });
      if (!found) { notify('لم يعد هذا التحضير موجودًا، تم إنشاء نسخة جديدة', true); data.id = uid(); items.push(data); }
      Store.set('preps', items);
      notify('✓ تم تحديث التحضير');
    } else {
      data.id = uid();
      data.createdAt = new Date().toISOString();
      items.push(data);
      Store.set('preps', items);
      notify('✓ حُفظ التحضير');
    }

    showOk('prepOk');
    resetPrepForm(true);
    $('#prepSearch').value = '';
    renderPrepList();
    refreshStats();
  });

  $('#prepReset').addEventListener('click', function () {
    if (!confirm('تفريغ النموذج ومسح ما هو مكتوب فيه؟')) return;
    resetPrepForm(false);
    notify('تم تفريغ النموذج');
  });

  $('#prepNew').addEventListener('click', function () {
    resetPrepForm(false);
    $('#p_title').focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  $('#prepSearch').addEventListener('input', renderPrepList);

  $('#prepPrint').addEventListener('click', function () {
    var form = $('#prepForm');
    if (!form.checkValidity()) { form.reportValidity(); notify('أكمل الحقول المطلوبة قبل الطباعة', true); return; }
    var d = collectPrepForm();
    d.id = $('#p_id').value || null;
    printPrep(d);
  });

  renderPrepList();
}

function renderPrepList() {
  var q = ($('#prepSearch').value || '').trim().toLowerCase();
  var items = Store.get('preps', []).slice().reverse();
  var editingId = $('#p_id').value;

  var shown = items.filter(function (it) {
    if (!q) return true;
    var hay = (it.title + ' ' + it.cls + ' ' + it.date + ' ' + formatArabicDate(it.date) + ' ' + (it.period || '')).toLowerCase();
    return hay.indexOf(q) !== -1;
  });

  $('#prepCount').textContent = items.length;
  var box = $('#prepList');

  if (!shown.length) {
    box.innerHTML = '<div class="empty-state"><span class="big">📝</span>' +
      (items.length ? 'لا نتائج مطابقة لبحثك.' : 'لا توجد تحضيرات محفوظة بعد — ابدأ بزر «＋ تحضير جديد» بالأعلى.') +
      '</div>';
    return;
  }

  box.innerHTML = shown.map(function (it) {
    var body = [];
    if (it.know) body.push('الأهداف المعرفية: ' + it.know);
    if (it.homework) body.push('الواجب: ' + it.homework);
    return '<div class="item-card' + (it.id === editingId ? ' is-editing' : '') + '" data-id="' + esc(it.id) + '">' +
      '<div class="item-top">' +
        '<div>' +
          '<h4 class="item-title">' + esc(it.title) + '</h4>' +
          '<div class="item-meta">' +
            '<span class="tag">' + esc(it.cls) + '</span>' +
            '<span class="tag tag-gold">' + esc(formatArabicDate(it.date)) + '</span>' +
            (it.period ? '<span class="tag">' + esc(it.period) + '</span>' : '') +
            '<span class="tag">' + (it.steps ? it.steps.length : 0) + ' خطوة</span>' +
            (it.strategies && it.strategies.length ? '<span class="tag">' + it.strategies.length + ' استراتيجية</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="item-actions">' +
          '<button type="button" class="btn btn-sm btn-ghost" data-act="edit">✏️ تعديل</button>' +
          '<button type="button" class="btn btn-sm btn-navy" data-act="print">🖨️ طباعة</button>' +
          '<button type="button" class="btn btn-sm btn-danger" data-act="del">حذف</button>' +
        '</div>' +
      '</div>' +
      (body.length ? '<div class="item-body">' + esc(body.join('\n')) + '</div>' : '') +
    '</div>';
  }).join('');

  $$('.item-card', box).forEach(function (card) {
    var id = card.getAttribute('data-id');
    var item = items.filter(function (x) { return x.id === id; })[0];
    if (!item) return;

    var editBtn = card.querySelector('[data-act="edit"]');
    var printBtn = card.querySelector('[data-act="print"]');
    var delBtn = card.querySelector('[data-act="del"]');

    editBtn.addEventListener('click', function () {
      fillPrepForm(item);
      $$('.item-card.is-editing').forEach(function (c) { c.classList.remove('is-editing'); });
      card.classList.add('is-editing');
      $('#sec-prep').scrollIntoView({ behavior: 'smooth', block: 'start' });
      notify('جارٍ تعديل التحضير: ' + item.title);
    });

    printBtn.addEventListener('click', function () { printPrep(item); });

    delBtn.addEventListener('click', function () {
      if (!confirm('حذف التحضير «' + item.title + '» نهائيًا من هذا المتصفح؟')) return;
      var rest = Store.get('preps', []).filter(function (x) { return x.id !== id; });
      Store.set('preps', rest);
      if ($('#p_id').value === id) resetPrepForm(true);
      renderPrepList();
      refreshStats();
      notify('تم حذف التحضير');
    });
  });
}

/* =========================================================
   5) الطباعة (A4)
   ========================================================= */
function prBlock(title, text) {
  return '<section class="pr-block"><h2>' + esc(title) + '</h2>' +
         '<div class="pr-inner">' + esc(text || '') + '</div></section>';
}

function buildPrepPrint(d) {
  var b = Store.get('basics', {});
  var subject = b.b_subject || 'الرياضيات';

  var info = [
    ['المعلم', b.b_teacher],
    ['المدرسة', b.b_school],
    ['السنة الدراسية', b.b_year],
    ['المادة', subject],
    ['الصف', d.cls],
    ['التاريخ', formatArabicDate(d.date)],
    ['رقم الحصة', d.period],
    ['عدد الخطوات', (d.steps && d.steps.length) || 0]
  ].map(function (p) {
    return '<div><b>' + esc(p[0]) + ':</b> ' + esc(p[1] || '—') + '</div>';
  }).join('');

  var goals =
    '<div class="pr-goals">' +
      '<div class="pr-goal"><h2>الأهداف المعرفية</h2><div class="pr-inner">' + esc(d.know || '') + '</div></div>' +
      '<div class="pr-goal"><h2>الأهداف المهارية</h2><div class="pr-inner">' + esc(d.skill || '') + '</div></div>' +
      '<div class="pr-goal"><h2>الأهداف الوجدانية</h2><div class="pr-inner">' + esc(d.att || '') + '</div></div>' +
    '</div>';

  var strategies = (d.strategies && d.strategies.length)
    ? '<section class="pr-block"><h2>استراتيجيات التدريس</h2><div class="pr-inner"><div class="pr-chips">' +
      d.strategies.map(function (s) { return '<span class="pr-chip">' + esc(s) + '</span>'; }).join('') +
      '</div></div></section>'
    : '';

  var stepsHtml = '';
  if (d.steps && d.steps.length) {
    stepsHtml = '<section class="pr-block"><h2>خطوات الدرس</h2><table class="pr-table">' +
      '<thead><tr><th style="width:34px">م</th><th>الخطوة / النشاط</th><th style="width:90px">الزمن (د)</th></tr></thead><tbody>' +
      d.steps.map(function (s, i) {
        return '<tr><td class="num">' + (i + 1) + '</td><td>' + esc(s.text) + '</td><td class="time">' + esc(s.time || '') + '</td></tr>';
      }).join('') +
      '</tbody></table></section>';
  }

  var extra = [];
  if (d.evalKind) extra.push('نوع التقويم: ' + d.evalKind);
  if (b.b_extra) extra.push(b.b_extra);
  if (b.b_notes) extra.push(b.b_notes);

  return '<article class="pr-sheet">' +
    '<header class="pr-header">' +
      '<h1>تحضير درس — كراسة المعلم الليبي الرقمية</h1>' +
      '<p class="pr-sub">' + esc(subject) + ' · المرحلة الإعدادية' + (b.b_school ? ' · ' + esc(b.b_school) : '') + '</p>' +
    '</header>' +
    '<div class="pr-info">' + info + '</div>' +
    '<div class="pr-title">عنوان الدرس: ' + esc(d.title || '—') + '</div>' +
    goals +
    prBlock('التمهيد', d.warm) +
    prBlock('الوسائل والأدوات', d.tools) +
    strategies +
    stepsHtml +
    prBlock('التقويم' + (d.evalKind ? ' (' + d.evalKind + ')' : ''), d.eval) +
    prBlock('الواجب المنزلي', d.homework) +
    prBlock('ملاحظات معلّقة', d.notes) +
    '<div class="pr-sign"><div>توقيع المعلم/ة</div><div>اعتماد قائد المدرسة / الموجّه التربوي</div></div>' +
    (extra.length ? '<div class="pr-warn">' + esc(extra.join(' · ')) + '</div>' : '') +
    '<div class="pr-foot">طُبع من «كراسة المعلم الليبي الرقمية – رياضيات المرحلة الإعدادية» · ' +
      esc(formatArabicDate(todayISO())) + '</div>' +
  '</article>';
}

function printPrep(d) {
  try {
    var html = buildPrepPrint(d);
    $('#print-area').innerHTML = html;
    window.print();
  } catch (e) {
    notify('تعذّرت الطباعة: ' + e.message, true);
  }
}

/* =========================================================
   6) بنك الأنشطة
   ========================================================= */
function initActivities() {
  var form = $('#actForm');

  $('#actToggle').addEventListener('click', function () {
    form.classList.toggle('hidden');
    if (!form.classList.contains('hidden')) $('#a_title').focus();
  });
  $('#actCancel').addEventListener('click', function () {
    form.reset(); $('#a_id').value = ''; form.classList.add('hidden');
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!form.checkValidity()) { form.reportValidity(); return; }
    var items = Store.get('activities', []);
    var id = $('#a_id').value;
    var data = {
      title: $('#a_title').value.trim(),
      cls: $('#a_class').value.trim(),
      time: $('#a_time').value.trim(),
      tools: $('#a_tools').value.trim(),
      desc: $('#a_desc').value
    };
    if (id) {
      items = items.map(function (it) { return it.id === id ? Object.assign({}, it, data) : it; });
      notify('✓ تم تحديث النشاط');
    } else {
      data.id = uid();
      data.createdAt = new Date().toISOString();
      items.push(data);
      notify('✓ حُفظ النشاط');
    }
    Store.set('activities', items);
    form.reset(); $('#a_id').value = ''; form.classList.add('hidden');
    renderActList();
    refreshStats();
  });

  $('#actSearch').addEventListener('input', renderActList);
  renderActList();
}

function renderActList() {
  var q = ($('#actSearch').value || '').trim().toLowerCase();
  var items = Store.get('activities', []).slice().reverse();
  var editingId = $('#a_id').value;

  var shown = items.filter(function (it) {
    if (!q) return true;
    return (it.title + ' ' + it.cls + ' ' + it.desc + ' ' + it.tools).toLowerCase().indexOf(q) !== -1;
  });

  var box = $('#actList');
  if (!shown.length) {
    box.innerHTML = '<div class="empty-state"><span class="big">🧩</span>' +
      (items.length ? 'لا نتائج مطابقة لبحثك.' : 'بنك الأنشطة فارغ — اضغط «＋ نشاط جديد».') + '</div>';
    return;
  }

  box.innerHTML = shown.map(function (it) {
    return '<div class="item-card' + (it.id === editingId ? ' is-editing' : '') + '" data-id="' + esc(it.id) + '">' +
      '<div class="item-top">' +
        '<div><h4 class="item-title">' + esc(it.title) + '</h4><div class="item-meta">' +
          (it.cls ? '<span class="tag">' + esc(it.cls) + '</span>' : '') +
          (it.time ? '<span class="tag tag-gold">' + esc(it.time) + '</span>' : '') +
          (it.tools ? '<span class="tag">' + esc(it.tools) + '</span>' : '') +
        '</div></div>' +
        '<div class="item-actions">' +
          '<button type="button" class="btn btn-sm btn-ghost" data-act="edit">✏️ تعديل</button>' +
          '<button type="button" class="btn btn-sm btn-danger" data-act="del">حذف</button>' +
        '</div>' +
      '</div>' +
      (it.desc ? '<div class="item-body">' + esc(it.desc) + '</div>' : '') +
    '</div>';
  }).join('');

  $$('.item-card', box).forEach(function (card) {
    var id = card.getAttribute('data-id');
    var item = items.filter(function (x) { return x.id === id; })[0];
    if (!item) return;

    card.querySelector('[data-act="edit"]').addEventListener('click', function () {
      $('#a_id').value = item.id;
      $('#a_title').value = item.title || '';
      $('#a_class').value = item.cls || '';
      $('#a_time').value = item.time || '';
      $('#a_tools').value = item.tools || '';
      $('#a_desc').value = item.desc || '';
      formVisible('#actForm');
      renderActList();
      $('#sec-activities').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    card.querySelector('[data-act="del"]').addEventListener('click', function () {
      if (!confirm('حذف النشاط «' + item.title + '»؟')) return;
      var rest = Store.get('activities', []).filter(function (x) { return x.id !== id; });
      Store.set('activities', rest);
      renderActList();
      refreshStats();
      notify('تم الحذف');
    });
  });
}

function formVisible(sel) {
  var f = $(sel);
  if (f) f.classList.remove('hidden');
}

/* =========================================================
   7) الملاحظات
   ========================================================= */
function initNotes() {
  var form = $('#noteForm');

  $('#noteToggle').addEventListener('click', function () {
    form.classList.toggle('hidden');
    if (!form.classList.contains('hidden')) $('#n_title').focus();
  });
  $('#noteCancel').addEventListener('click', function () {
    form.reset(); $('#n_id').value = ''; form.classList.add('hidden');
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!form.checkValidity()) { form.reportValidity(); return; }
    var items = Store.get('notes', []);
    var id = $('#n_id').value;
    var data = {
      title: $('#n_title').value.trim(),
      kind: $('#n_kind').value,
      cls: $('#n_class').value.trim(),
      body: $('#n_body').value
    };
    if (id) {
      items = items.map(function (it) { return it.id === id ? Object.assign({}, it, data) : it; });
      notify('✓ تم تحديث الملاحظة');
    } else {
      data.id = uid();
      data.date = todayISO();
      items.push(data);
      notify('✓ حُفظت الملاحظة');
    }
    Store.set('notes', items);
    form.reset(); $('#n_id').value = ''; form.classList.add('hidden');
    renderNoteList();
  });

  $('#noteSearch').addEventListener('input', renderNoteList);
  renderNoteList();
}

function renderNoteList() {
  var q = ($('#noteSearch').value || '').trim().toLowerCase();
  var items = Store.get('notes', []).slice().reverse();

  var shown = items.filter(function (it) {
    if (!q) return true;
    return (it.title + ' ' + it.body + ' ' + it.cls + ' ' + it.kind).toLowerCase().indexOf(q) !== -1;
  });

  var box = $('#noteList');
  if (!shown.length) {
    box.innerHTML = '<div class="empty-state"><span class="big">🗒️</span>' +
      (items.length ? 'لا نتائج مطابقة لبحثك.' : 'لا توجد ملاحظات بعد.') + '</div>';
    return;
  }

  box.innerHTML = shown.map(function (it) {
    return '<div class="item-card" data-id="' + esc(it.id) + '">' +
      '<div class="item-top">' +
        '<div><h4 class="item-title">' + esc(it.title) + '</h4><div class="item-meta">' +
          '<span class="tag tag-gold">' + esc(it.kind) + '</span>' +
          (it.cls ? '<span class="tag">' + esc(it.cls) + '</span>' : '') +
          '<span class="tag">' + esc(formatArabicDate(it.date)) + '</span>' +
        '</div></div>' +
        '<div class="item-actions">' +
          '<button type="button" class="btn btn-sm btn-ghost" data-act="edit">✏️ تعديل</button>' +
          '<button type="button" class="btn btn-sm btn-danger" data-act="del">حذف</button>' +
        '</div>' +
      '</div>' +
      (it.body ? '<div class="item-body">' + esc(it.body) + '</div>' : '') +
    '</div>';
  }).join('');

  $$('.item-card', box).forEach(function (card) {
    var id = card.getAttribute('data-id');
    var item = items.filter(function (x) { return x.id === id; })[0];
    if (!item) return;

    card.querySelector('[data-act="edit"]').addEventListener('click', function () {
      $('#n_id').value = item.id;
      $('#n_title').value = item.title || '';
      $('#n_kind').value = item.kind || 'ملاحظة صفية';
      $('#n_class').value = item.cls || '';
      $('#n_body').value = item.body || '';
      formVisible('#noteForm');
      renderNoteList();
      $('#sec-notes').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    card.querySelector('[data-act="del"]').addEventListener('click', function () {
      if (!confirm('حذف الملاحظة «' + item.title + '»؟')) return;
      var rest = Store.get('notes', []).filter(function (x) { return x.id !== id; });
      Store.set('notes', rest);
      renderNoteList();
      notify('تم الحذف');
    });
  });
}

/* =========================================================
   8) تبويبات داخلية عامة
   ========================================================= */
function initSubTabs(attr, ids, prefix) {
  $$('[' + attr + ']').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var key = btn.getAttribute(attr);
      $$('[' + attr + ']').forEach(function (b) { b.classList.toggle('is-active', b === btn); });
      ids.forEach(function (k) {
        var panel = $('#' + prefix + k);
        if (panel) panel.classList.toggle('hidden', k !== key);
      });
    });
  });
}

function getQuestion(id) {
  return Store.get('questions', []).filter(function (q) { return q.id === id; })[0] || null;
}

function classOptionsInto(listId) {
  var datalist = $('#' + listId);
  if (!datalist) return;
  var current = $$('option', datalist).map(function (o) { return o.value; });
  var extras = [];
  Store.get('students', []).forEach(function (s) { if (s.cls && extras.indexOf(s.cls) === -1) extras.push(s.cls); });
  Store.get('preps', []).forEach(function (p) { if (p.cls && extras.indexOf(p.cls) === -1) extras.push(p.cls); });
  var b = Store.get('basics', {});
  if (b.b_classes) {
    String(b.b_classes).split(/[–,،;\-|]+/).forEach(function (x) {
      x = x.trim(); if (x && extras.indexOf(x) === -1) extras.push(x);
    });
  }
  extras.forEach(function (v) {
    if (current.indexOf(v) === -1) {
      var o = document.createElement('option');
      o.value = v;
      datalist.appendChild(o);
    }
  });
}

function studentsDatalist() {
  var dl = $('#studentsList');
  if (!dl) return;
  dl.innerHTML = '';
  Store.get('students', []).forEach(function (s) {
    var o = document.createElement('option');
    o.value = s.name;
    dl.appendChild(o);
  });
}

/* =========================================================
   9) التقويم والاختبارات: بنك الأسئلة + بناء الاختبار
   ========================================================= */
var examDraft = { title: '', cls: '', date: '', duration: '45', instructions: '', qids: [] };

function examDraftTotals() {
  var qs = examDraft.qids.map(getQuestion).filter(Boolean);
  var total = qs.reduce(function (sum, q) { return sum + (parseFloat(q.marks) || 0); }, 0);
  return { count: qs.length, total: total };
}

function renderExamBuilder() {
  var qs = examDraft.qids.map(getQuestion);
  var keep = [];
  qs.forEach(function (q, i) { if (q) keep.push(q); });
  examDraft.qids = keep.map(function (q) { return q.id; });

  var t = examDraftTotals();
  $('#e_count').textContent = t.count + ' سؤال';
  $('#e_total').textContent = (Math.round(t.total * 100) / 100) + ' درجة';

  var box = $('#e_list');
  if (!keep.length) {
    box.innerHTML = '<div class="empty-state"><span class="big">📋</span>لا توجد أسئلة في الاختبار بعد.</div>';
    return;
  }

  box.innerHTML = keep.map(function (q, i) {
    return '<div class="item-card" data-qid="' + esc(q.id) + '">' +
      '<div class="item-top">' +
        '<div><h4 class="item-title">' + (i + 1) + '. ' + esc(q.text) + '</h4>' +
        '<div class="item-meta"><span class="tag">' + esc(q.type) + '</span>' +
          (q.cls ? '<span class="tag">' + esc(q.cls) + '</span>' : '') +
          '<span class="marks-pill">' + esc(q.marks || 1) + ' درجة</span></div></div>' +
        '<div class="item-actions">' +
          '<button type="button" class="btn btn-sm btn-ghost" data-exm-act="up">⬆️ لأعلى</button>' +
          '<button type="button" class="btn btn-sm btn-danger" data-exm-act="out">إزالة</button>' +
        '</div>' +
      '</div></div>';
  }).join('');

  $$('[data-exm-act]', box).forEach(function (btn) {
    var qid = btn.closest('.item-card').getAttribute('data-qid');
    btn.addEventListener('click', function () {
      var idx = examDraft.qids.indexOf(qid);
      if (idx === -1) return;
      if (btn.getAttribute('data-exm-act') === 'out') {
        examDraft.qids.splice(idx, 1);
      } else if (idx > 0) {
        var tmp = examDraft.qids[idx - 1];
        examDraft.qids[idx - 1] = examDraft.qids[idx];
        examDraft.qids[idx] = tmp;
      }
      renderExamBuilder();
    });
  });
}

function initAssess() {
  initSubTabs('data-exam-tab', ['bank', 'builder', 'exams'], 'exm-');

  /* ---- بنك الأسئلة ---- */
  $('#qToggle').addEventListener('click', function () {
    var f = $('#qForm');
    f.classList.toggle('hidden');
    if (!f.classList.contains('hidden')) $('#q_text').focus();
  });
  $('#qCancel').addEventListener('click', function () {
    $('#qForm').reset(); $('#q_id').value = ''; $('#qForm').classList.add('hidden');
  });

  $('#qForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!e.target.checkValidity()) { e.target.reportValidity(); return; }
    var items = Store.get('questions', []);
    var id = $('#q_id').value;
    var data = {
      text: $('#q_text').value.trim(),
      type: $('#q_type').value,
      marks: $('#q_marks').value || '1',
      cls: $('#q_class').value.trim(),
      lesson: $('#q_lesson').value.trim(),
      level: $('#q_level').value,
      answer: $('#q_answer').value.trim(),
      options: $('#q_options').value
    };
    if (id) {
      items = items.map(function (q) { return q.id === id ? Object.assign({}, q, data) : q; });
      notify('✓ تم تحديث السؤال');
    } else {
      data.id = uid();
      data.createdAt = new Date().toISOString();
      items.push(data);
      notify('✓ حُفظ السؤال في البنك');
    }
    Store.set('questions', items);
    $('#qForm').reset(); $('#q_id').value = ''; $('#qForm').classList.add('hidden');
    $('#qSearch').value = '';
    renderQList();
    renderExamBuilder();
  });

  $('#qSearch').addEventListener('input', renderQList);
  renderQList();

  /* ---- بناء الاختبار ---- */
  ['e_title', 'e_class', 'e_date', 'e_duration', 'e_instructions'].forEach(function (id) {
    $('#' + id).addEventListener('input', function () {
      examDraft.title = $('#e_title').value;
      examDraft.cls = $('#e_class').value;
      examDraft.date = $('#e_date').value;
      examDraft.duration = $('#e_duration').value;
      examDraft.instructions = $('#e_instructions').value;
    });
  });
  $('#e_date').value = todayISO();

  $('#e_clear').addEventListener('click', function () {
    if (!examDraft.qids.length && !$('#e_title').value) return;
    if (!confirm('تفريغ الاختبار الحالي (الأسئلة والبيانات)؟')) return;
    examDraft = { title: '', cls: '', date: todayISO(), duration: '45', instructions: '', qids: [] };
    $('#examMeta').reset();
    $('#e_date').value = todayISO();
    $('#e_duration').value = '45';
    renderExamBuilder();
    notify('تم تفريغ الاختبار');
  });

  $('#e_save').addEventListener('click', function () {
    if (!examDraft.title) { notify('اكتب عنوان الاختبار أولًا', true); $('#e_title').focus(); return; }
    if (!examDraft.qids.length) { notify('أضِف سؤالًا واحدًا على الأقل', true); return; }
    var t = examDraftTotals();
    var exams = Store.get('exams', []);
    var existing = exams.filter(function (x) { return x.title === examDraft.title && x.cls === examDraft.cls; })[0];
    var rec = {
      id: existing ? existing.id : uid(),
      title: examDraft.title,
      cls: examDraft.cls,
      date: examDraft.date,
      duration: examDraft.duration,
      instructions: examDraft.instructions,
      qids: examDraft.qids.slice(),
      total: t.total,
      count: t.count,
      updatedAt: new Date().toISOString()
    };
    if (existing) exams = exams.map(function (x) { return x.id === existing.id ? rec : x; });
    else { rec.createdAt = new Date().toISOString(); exams.push(rec); }
    Store.set('exams', exams);
    renderExmList();
    notify(existing ? '✓ تم تحديث الاختبار المحفوظ' : '✓ حُفظ الاختبار في «اختباراتي»');
  });

  $('#e_print').addEventListener('click', function () {
    if (!examDraft.title) { notify('اكتب عنوان الاختبار أولًا', true); return; }
    if (!examDraft.qids.length) { notify('أضِف سؤالًا واحدًا على الأقل', true); return; }
    try {
      $('#print-area').innerHTML = buildExamPrint(examDraft);
      window.print();
    } catch (err) {
      notify('تعذّرت الطباعة: ' + err.message, true);
    }
  });

  $('#exmSearch').addEventListener('input', renderExmList);
  renderExamBuilder();
  renderExmList();
}

function renderQList() {
  var q = ($('#qSearch').value || '').trim().toLowerCase();
  var items = Store.get('questions', []).slice().reverse();
  var editingId = $('#q_id').value;

  var shown = items.filter(function (it) {
    if (!q) return true;
    return (it.text + ' ' + it.cls + ' ' + it.lesson + ' ' + it.type).toLowerCase().indexOf(q) !== -1;
  });

  var box = $('#qList');
  if (!shown.length) {
    box.innerHTML = '<div class="empty-state"><span class="big">❓</span>' +
      (items.length ? 'لا نتائج مطابقة لبحثك.' : 'بنك الأسئلة فارغ — اضغط «＋ سؤال جديد».') + '</div>';
    return;
  }

  box.innerHTML = shown.map(function (it) {
    var opts = (it.options || '').split('\n').filter(function (x) { return x.trim(); });
    return '<div class="item-card' + (it.id === editingId ? ' is-editing' : '') + '" data-id="' + esc(it.id) + '">' +
      '<div class="item-top">' +
        '<div><h4 class="item-title">' + esc(it.text) + '</h4><div class="item-meta">' +
          '<span class="tag">' + esc(it.type) + '</span>' +
          (it.cls ? '<span class="tag">' + esc(it.cls) + '</span>' : '') +
          (it.lesson ? '<span class="tag">' + esc(it.lesson) + '</span>' : '') +
          '<span class="tag">' + esc(it.level || 'متوسط') + '</span>' +
          '<span class="marks-pill">' + esc(it.marks || 1) + ' درجة</span>' +
        '</div></div>' +
        '<div class="item-actions">' +
          '<button type="button" class="btn btn-sm btn-gold" data-act="toexam">＋ إضافة للاختبار</button>' +
          '<button type="button" class="btn btn-sm btn-ghost" data-act="edit">✏️ تعديل</button>' +
          '<button type="button" class="btn btn-sm btn-danger" data-act="del">حذف</button>' +
        '</div>' +
      '</div>' +
      (it.answer ? '<div class="item-body">الإجابة: ' + esc(it.answer) + '</div>' : '') +
      (opts.length ? '<ol class="q-options-view">' + opts.map(function (o) { return '<li>' + esc(o.replace(/^[أ-ي]\)\s*/, '')) + '</li>'; }).join('') + '</ol>' : '') +
    '</div>';
  }).join('');

  $$('.item-card', box).forEach(function (card) {
    var id = card.getAttribute('data-id');
    var item = items.filter(function (x) { return x.id === id; })[0];
    if (!item) return;

    card.querySelector('[data-act="toexam"]').addEventListener('click', function () {
      if (examDraft.qids.indexOf(id) !== -1) { notify('هذا السؤال مضاف للاختبار بالفعل', true); return; }
      examDraft.qids.push(id);
      renderExamBuilder();
      notify('✓ أُضيف السؤال إلى الاختبار (' + examDraft.qids.length + ')');
    });

    card.querySelector('[data-act="edit"]').addEventListener('click', function () {
      $('#q_id').value = item.id;
      $('#q_text').value = item.text || '';
      $('#q_type').value = item.type || 'مقالي';
      $('#q_marks').value = item.marks || '1';
      $('#q_class').value = item.cls || '';
      $('#q_lesson').value = item.lesson || '';
      $('#q_level').value = item.level || 'متوسط';
      $('#q_answer').value = item.answer || '';
      $('#q_options').value = item.options || '';
      $('#qForm').classList.remove('hidden');
      renderQList();
      $('#sec-assess').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    card.querySelector('[data-act="del"]').addEventListener('click', function () {
      if (!confirm('حذف هذا السؤال من البنك؟')) return;
      Store.set('questions', Store.get('questions', []).filter(function (x) { return x.id !== id; }));
      examDraft.qids = examDraft.qids.filter(function (x) { return x !== id; });
      renderQList();
      renderExamBuilder();
      notify('تم الحذف');
    });
  });
}

function renderExmList() {
  var q = ($('#exmSearch').value || '').trim().toLowerCase();
  var items = Store.get('exams', []).slice().reverse();
  var shown = items.filter(function (it) {
    if (!q) return true;
    return (it.title + ' ' + it.cls).toLowerCase().indexOf(q) !== -1;
  });

  var box = $('#exmList');
  if (!shown.length) {
    box.innerHTML = '<div class="empty-state"><span class="big">📄</span>' +
      (items.length ? 'لا نتائج مطابقة لبحثك.' : 'لا توجد اختبارات محفوظة بعد.') + '</div>';
    return;
  }

  box.innerHTML = shown.map(function (it) {
    return '<div class="item-card" data-id="' + esc(it.id) + '">' +
      '<div class="item-top">' +
        '<div><h4 class="item-title">' + esc(it.title) + '</h4><div class="item-meta">' +
          (it.cls ? '<span class="tag">' + esc(it.cls) + '</span>' : '') +
          '<span class="tag tag-gold">' + esc(formatArabicDate(it.date)) + '</span>' +
          '<span class="tag">' + esc(it.count || 0) + ' سؤال</span>' +
          '<span class="marks-pill">' + esc(it.total || 0) + ' درجة</span>' +
        '</div></div>' +
        '<div class="item-actions">' +
          '<button type="button" class="btn btn-sm btn-ghost" data-ex="open">📂 فتح للتعديل</button>' +
          '<button type="button" class="btn btn-sm btn-navy" data-ex="print">🖨️ طباعة</button>' +
          '<button type="button" class="btn btn-sm btn-danger" data-ex="del">حذف</button>' +
        '</div>' +
      '</div></div>';
  }).join('');

  $$('.item-card', box).forEach(function (card) {
    var id = card.getAttribute('data-id');
    var item = items.filter(function (x) { return x.id === id; })[0];
    if (!item) return;

    card.querySelector('[data-ex="open"]').addEventListener('click', function () {
      examDraft = {
        title: item.title || '', cls: item.cls || '', date: item.date || todayISO(),
        duration: item.duration || '45', instructions: item.instructions || '',
        qids: (item.qids || []).slice()
      };
      $('#e_title').value = examDraft.title;
      $('#e_class').value = examDraft.cls;
      $('#e_date').value = examDraft.date;
      $('#e_duration').value = examDraft.duration;
      $('#e_instructions').value = examDraft.instructions;
      renderExamBuilder();
      $$('[data-exam-tab]').forEach(function (b) {
        var on = b.getAttribute('data-exam-tab') === 'builder';
        b.classList.toggle('is-active', on);
      });
      ['bank', 'builder', 'exams'].forEach(function (k) {
        $('#exm-' + k).classList.toggle('hidden', k !== 'builder');
      });
      notify('فُتح الاختبار في «بناء اختبار»');
      $('#sec-assess').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    card.querySelector('[data-ex="print"]').addEventListener('click', function () {
      try {
        $('#print-area').innerHTML = buildExamPrint(item);
        window.print();
      } catch (err) { notify('تعذّرت الطباعة: ' + err.message, true); }
    });

    card.querySelector('[data-ex="del"]').addEventListener('click', function () {
      if (!confirm('حذف الاختبار «' + item.title + '»؟')) return;
      Store.set('exams', Store.get('exams', []).filter(function (x) { return x.id !== id; }));
      renderExmList();
      notify('تم الحذف');
    });
  });
}

function buildExamPrint(exam) {
  var b = Store.get('basics', {});
  var qs = (exam.qids || []).map(getQuestion).filter(Boolean);
  var total = qs.reduce(function (s, q) { return s + (parseFloat(q.marks) || 0); }, 0);

  var meta = [
    ['الصف', exam.cls], ['المدة', (exam.duration || '45') + ' د'],
    ['التاريخ', formatArabicDate(exam.date)], ['عدد الأسئلة', qs.length],
    ['الدرجة الكلية', (Math.round(total * 100) / 100)]
  ].map(function (p) { return '<div><b>' + esc(p[0]) + ':</b> ' + esc(p[1] || '—') + '</div>'; }).join('');

  var letters = ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح', 'ط', 'ي'];
  var questionsHtml = qs.map(function (q, i) {
    var opts = (q.options || '').split('\n').filter(function (x) { return x.trim(); });
    var body = '';
    if (q.type === 'اختيار من متعدد' && opts.length) {
      body = '<div class="exm-opts">' + opts.map(function (o, oi) {
        var txt = o.replace(/^[أ-يa-z]\s*[).:]\s*/i, '');
        return '<div><b>' + (letters[oi] || (oi + 1)) + ') </b>' + esc(txt) + '</div>';
      }).join('') + '</div>';
    } else if (q.type === 'صواب وخطأ') {
      body = '<div class="exm-lines" style="margin-top:6px">صح ( &nbsp;&nbsp; ) &nbsp;&nbsp;&nbsp; خطأ ( &nbsp;&nbsp; )</div>';
    } else if (q.type === 'مقالي') {
      body = '<div class="exm-lines"><span></span><span></span><span></span></div>';
    } else if (q.type === 'إكمال الفراغ') {
      body = '<div class="exm-lines" style="margin-top:6px">الإجابة: <span class="exm-blank">&nbsp;</span></div>';
    }

    return '<div class="exm-q">' +
      '<div class="exm-q-top"><span>سؤال ' + (i + 1) + ' ' +
        '<span class="exm-q-type">(' + esc(q.type) + (q.level ? ' · ' + esc(q.level) : '') + ')</span></span>' +
        '<span>[' + esc(q.marks || 1) + ' درجة]</span></div>' +
      '<div class="exm-q-text">' + esc(q.text) + '</div>' + body +
    '</div>';
  }).join('');

  var withAnswers = qs.filter(function (q) { return q.answer; });
  var keyHtml = withAnswers.length
    ? '<div class="exm-key"><h3>نموذج الإجابة (للمعلم — لا يُطبع للتلاميذ في الورقة الأساسية)</h3>' +
      withAnswers.map(function (q, i) {
        var idx = qs.indexOf(q) + 1;
        return 'سؤال ' + idx + ': ' + esc(q.answer);
      }).join(' · ') + '</div>'
    : '';

  return '<article class="exm-sheet">' +
    '<header class="exm-header">' +
      '<h1>' + esc(exam.title || 'اختبار') + '</h1>' +
      '<p class="exm-sub">' + esc(b.b_subject || 'الرياضيات') + ' · المرحلة الإعدادية' +
        (b.b_school ? ' · ' + esc(b.b_school) : '') + '</p>' +
    '</header>' +
    '<div class="exm-meta">' +
      '<div><b>المعلم:</b> ' + esc(b.b_teacher || '—') + '</div>' + meta +
    '</div>' +
    '<div class="exm-meta"><div><b>السنة الدراسية:</b> ' + esc(b.b_year || '—') + '</div>' +
      '<div style="grid-column:2 / -1"><b>الاسم والشعبة:</b> <span class="exm-blank" style="min-width:60%">&nbsp;</span></div></div>' +
    (exam.instructions ? '<div class="exm-instructions"><b>تعليمات:</b> ' + esc(exam.instructions) + '</div>' : '') +
    questionsHtml +
    keyHtml +
    '<div class="exm-sign"><div>توقيع التلميذ</div><div>مصحح الورقة</div><div>توقيع المعلم/ة</div></div>' +
    '<div class="exm-foot">طُبع من «كراسة المعلم الليبي الرقمية – رياضيات المرحلة الإعدادية»</div>' +
  '</article>';
}

/* =========================================================
   10) متابعة التلاميذ: القوائم + الدرجات
   ========================================================= */
function initStudents() {
  initSubTabs('data-stu-tab', ['list', 'grades'], 'stu-');

  /* ---- التلاميذ ---- */
  $('#stuToggle').addEventListener('click', function () {
    var f = $('#stuForm');
    f.classList.toggle('hidden');
    if (!f.classList.contains('hidden')) $('#s_name').focus();
  });
  $('#stuCancel').addEventListener('click', function () {
    $('#stuForm').reset(); $('#s_id').value = ''; $('#stuForm').classList.add('hidden');
  });

  $('#stuForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!e.target.checkValidity()) { e.target.reportValidity(); return; }
    var items = Store.get('students', []);
    var id = $('#s_id').value;
    var data = {
      name: $('#s_name').value.trim(),
      cls: $('#s_class').value.trim(),
      section: $('#s_section').value.trim(),
      notes: $('#s_notes').value.trim()
    };
    if (id) {
      items = items.map(function (s) { return s.id === id ? Object.assign({}, s, data) : s; });
      notify('✓ تم تحديث بيانات التلميذ');
    } else {
      data.id = uid();
      items.push(data);
      notify('✓ أُضيف التلميذ');
    }
    Store.set('students', items);
    $('#stuForm').reset(); $('#s_id').value = ''; $('#stuForm').classList.add('hidden');
    $('#stuSearch').value = '';
    renderStuList();
    studentsDatalist();
    classOptionsInto('classesList');
  });

  $('#stuSearch').addEventListener('input', renderStuList);
  renderStuList();

  /* ---- الدرجات ---- */
  $('#g_load').addEventListener('click', loadGradeSheet);
  $('#g_save').addEventListener('click', saveGradeSheet);
  $('#g_print').addEventListener('click', printGradeSheet);
  $('#g_xlsx').addEventListener('click', function () { exportXlsx(gradeSheetXlsxBytes); });
  $('#g_xlsx_all').addEventListener('click', function () { exportXlsx(allGradesXlsxBytes); });
}

function gradeKey(cls, test) { return cls + '||' + test; }

function loadGradeSheet() {
  var cls = $('#g_class').value.trim();
  var test = $('#g_test').value.trim();
  var wrap = $('#gradeWrap');
  if (!cls || !test) { notify('اكتب الصف واسم التحصيل أولًا', true); return; }

  var students = Store.get('students', []).filter(function (s) { return s.cls === cls; });
  if (!students.length) {
    wrap.innerHTML = '<div class="empty-state"><span class="big">👥</span>لا يوجد تلاميذ مسجّلون في صف «' +
      esc(cls) + '». أضِفهم أولًا من تبويب «التلاميذ».</div>';
    $('#grStats').hidden = true;
    return;
  }

  var saved = Store.get('grades', {})[gradeKey(cls, test)] || {};

  wrap.innerHTML = '<table class="grade-table"><thead><tr>' +
    '<th style="width:46px">م</th><th>اسم التلميذ</th><th style="width:90px">الشعبة</th>' +
    '<th style="width:140px">الدرجة</th></tr></thead><tbody>' +
    students.map(function (s, i) {
      var g = saved[s.id];
      return '<tr data-sid="' + esc(s.id) + '">' +
        '<td>' + (i + 1) + '</td>' +
        '<td>' + esc(s.name) + (s.notes ? ' <span class="tag">' + esc(s.notes) + '</span>' : '') + '</td>' +
        '<td>' + esc(s.section || '—') + '</td>' +
        '<td><input type="number" class="grade-input" dir="ltr" min="0" step="0.5" placeholder="—" value="' +
          esc(g === undefined || g === null ? '' : g) + '"></td>' +
      '</tr>';
    }).join('') +
    '</tbody><tfoot><tr><td colspan="3">المعدل العام للصف</td><td id="g_avgCell">—</td></tr></tfoot></table>';

  $$('#gradeWrap .grade-input').forEach(function (inp) {
    inp.addEventListener('input', updateGradeStats);
  });
  updateGradeStats();
}

function readGradeValues() {
  var out = {};
  $$('#gradeWrap tbody tr').forEach(function (tr) {
    var v = tr.querySelector('.grade-input').value;
    if (v !== '') out[tr.getAttribute('data-sid')] = v;
  });
  return out;
}

function gradeNumbers() {
  return $$('#gradeWrap .grade-input')
    .map(function (i) { return i.value; })
    .filter(function (v) { return v !== '' && !isNaN(parseFloat(v)); })
    .map(function (v) { return parseFloat(v); });
}

function updateGradeStats() {
  var nums = gradeNumbers();
  var box = $('#grStats');
  if (!nums.length) {
    box.hidden = true;
    var c0 = $('#g_avgCell'); if (c0) c0.textContent = '—';
    return;
  }
  box.hidden = false;
  var sum = nums.reduce(function (a, b) { return a + b; }, 0);
  var avg = sum / nums.length;
  $('#grCount').textContent = nums.length;
  $('#grAvg').textContent = Math.round(avg * 100) / 100;
  $('#grMax').textContent = Math.max.apply(null, nums);
  $('#grMin').textContent = Math.min.apply(null, nums);
  var cell = $('#g_avgCell');
  if (cell) cell.textContent = Math.round(avg * 100) / 100;
}

function saveGradeSheet() {
  var cls = $('#g_class').value.trim();
  var test = $('#g_test').value.trim();
  if (!cls || !test) { notify('اكتب الصف واسم التحصيل أولًا', true); return; }
  if (!$('#gradeWrap tbody')) { notify('اضغط «عرض الكشف» أولًا', true); return; }
  var all = Store.get('grades', {});
  all[gradeKey(cls, test)] = readGradeValues();
  if (Store.set('grades', all)) notify('✓ حُفظت درجات «' + test + '» لصف ' + cls);
}

function printGradeSheet() {
  var cls = $('#g_class').value.trim();
  var test = $('#g_test').value.trim();
  if (!cls || !test) { notify('اكتب الصف واسم التحصيل أولًا', true); return; }
  if (!$('#gradeWrap tbody')) { notify('اضغط «عرض الكشف» أولًا', true); return; }

  var b = Store.get('basics', {});
  var rows = $$('#gradeWrap tbody tr').map(function (tr, i) {
    var name = tr.children[1].textContent;
    var section = tr.children[2].textContent;
    var g = tr.querySelector('.grade-input').value;
    return '<tr><td class="num">' + (i + 1) + '</td><td>' + esc(name) + '</td>' +
      '<td class="time">' + esc(section) + '</td><td class="time">' + esc(g || '—') + '</td></tr>';
  }).join('');

  var nums = gradeNumbers();
  var stats = nums.length
    ? 'العدد: ' + nums.length + ' · المعدل: ' + (Math.round(nums.reduce(function (a, c) { return a + c; }, 0) / nums.length * 100) / 100) +
      ' · أعلى: ' + Math.max.apply(null, nums) + ' · أدنى: ' + Math.min.apply(null, nums)
    : 'لم تُدخل درجات بعد';

  $('#print-area').innerHTML =
    '<article class="pr-sheet">' +
      '<header class="pr-header"><h1>كشف الدرجات — ' + esc(test) + '</h1>' +
        '<p class="pr-sub">' + esc(b.b_subject || 'الرياضيات') + ' · المرحلة الإعدادية' +
        (b.b_school ? ' · ' + esc(b.b_school) : '') + '</p></header>' +
      '<div class="pr-info">' +
        '<div><b>المعلم:</b> ' + esc(b.b_teacher || '—') + '</div>' +
        '<div><b>الصف:</b> ' + esc(cls) + '</div>' +
        '<div><b>السنة الدراسية:</b> ' + esc(b.b_year || '—') + '</div>' +
        '<div><b>التاريخ:</b> ' + esc(formatArabicDate(todayISO())) + '</div>' +
      '</div>' +
      '<table class="pr-table"><thead><tr><th style="width:34px">م</th><th>اسم التلميذ</th>' +
        '<th style="width:70px">الشعبة</th><th style="width:80px">الدرجة</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table>' +
      '<div class="pr-warn"><b>الإحصاء:</b> ' + esc(stats) + '</div>' +
      '<div class="pr-sign"><div>توقيع المعلم/ة</div><div>اعتماد قائد المدرسة</div></div>' +
    '</article>';
  window.print();
}

function renderStuList() {
  var q = ($('#stuSearch').value || '').trim().toLowerCase();
  var items = Store.get('students', []).slice().reverse();
  var editingId = $('#s_id').value;

  var shown = items.filter(function (it) {
    if (!q) return true;
    return (it.name + ' ' + it.cls + ' ' + (it.section || '') + ' ' + (it.notes || '')).toLowerCase().indexOf(q) !== -1;
  });

  $('#stuSummary').textContent = 'عدد التلاميذ: ' + items.length +
    (items.length ? ' · الصفوف: ' + (function () {
      var cs = [];
      items.forEach(function (s) { if (s.cls && cs.indexOf(s.cls) === -1) cs.push(s.cls); });
      return cs.join('، ');
    })() : '');

  var box = $('#stuList');
  if (!shown.length) {
    box.innerHTML = '<div class="empty-state"><span class="big">👥</span>' +
      (items.length ? 'لا نتائج مطابقة لبحثك.' : 'لا توجد قوائم تلاميذ بعد — اضغط «＋ تلميذ جديد».') + '</div>';
    return;
  }

  box.innerHTML = shown.map(function (it) {
    return '<div class="item-card' + (it.id === editingId ? ' is-editing' : '') + '" data-id="' + esc(it.id) + '">' +
      '<div class="item-top">' +
        '<div><h4 class="item-title">' + esc(it.name) + '</h4><div class="item-meta">' +
          '<span class="tag">' + esc(it.cls) + '</span>' +
          (it.section ? '<span class="tag">شعبة ' + esc(it.section) + '</span>' : '') +
          (it.notes ? '<span class="tag tag-gold">' + esc(it.notes) + '</span>' : '') +
        '</div></div>' +
        '<div class="item-actions">' +
          '<button type="button" class="btn btn-sm btn-ghost" data-st="edit">✏️ تعديل</button>' +
          '<button type="button" class="btn btn-sm btn-danger" data-st="del">حذف</button>' +
        '</div>' +
      '</div></div>';
  }).join('');

  $$('.item-card', box).forEach(function (card) {
    var id = card.getAttribute('data-id');
    var item = items.filter(function (x) { return x.id === id; })[0];
    if (!item) return;

    card.querySelector('[data-st="edit"]').addEventListener('click', function () {
      $('#s_id').value = item.id;
      $('#s_name').value = item.name || '';
      $('#s_class').value = item.cls || '';
      $('#s_section').value = item.section || '';
      $('#s_notes').value = item.notes || '';
      $('#stuForm').classList.remove('hidden');
      renderStuList();
      $('#sec-students').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    card.querySelector('[data-st="del"]').addEventListener('click', function () {
      if (!confirm('حذف التلميذ «' + item.name + '» من القائمة؟ (لن تُحذف درجاته المسجلة)')) return;
      Store.set('students', Store.get('students', []).filter(function (x) { return x.id !== id; }));
      renderStuList();
      studentsDatalist();
      notify('تم الحذف');
    });
  });
}

/* =========================================================
   11) الفروق الفردية
   ========================================================= */
function initDiffs() {
  $('#diffToggle').addEventListener('click', function () {
    var f = $('#diffForm');
    f.classList.toggle('hidden');
    if (!f.classList.contains('hidden')) $('#d_student').focus();
  });
  $('#diffCancel').addEventListener('click', function () {
    $('#diffForm').reset(); $('#d_id').value = ''; $('#diffForm').classList.add('hidden');
  });

  $('#diffForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!e.target.checkValidity()) { e.target.reportValidity(); return; }
    var items = Store.get('diffs', []);
    var id = $('#d_id').value;
    var data = {
      student: $('#d_student').value.trim(),
      cls: $('#d_class').value.trim(),
      kind: $('#d_kind').value,
      status: $('#d_status').value,
      need: $('#d_need').value,
      plan: $('#d_plan').value,
      follow: $('#d_follow').value
    };
    if (id) {
      items = items.map(function (x) { return x.id === id ? Object.assign({}, x, data) : x; });
      notify('✓ تم تحديث السجل');
    } else {
      data.id = uid();
      data.createdAt = new Date().toISOString();
      items.push(data);
      notify('✓ حُفظ سجل الفروق الفردية');
    }
    Store.set('diffs', items);
    $('#diffForm').reset(); $('#d_id').value = ''; $('#diffForm').classList.add('hidden');
    $('#diffSearch').value = '';
    renderDiffList();
  });

  $('#diffSearch').addEventListener('input', renderDiffList);
  renderDiffList();
}

function renderDiffList() {
  var q = ($('#diffSearch').value || '').trim().toLowerCase();
  var items = Store.get('diffs', []).slice().reverse();
  var editingId = $('#d_id').value;

  var shown = items.filter(function (it) {
    if (!q) return true;
    return (it.student + ' ' + it.cls + ' ' + it.kind + ' ' + it.status).toLowerCase().indexOf(q) !== -1;
  });

  var box = $('#diffList');
  if (!shown.length) {
    box.innerHTML = '<div class="empty-state"><span class="big">🎯</span>' +
      (items.length ? 'لا نتائج مطابقة لبحثك.' : 'لا توجد سجلات فروق فردية بعد.') + '</div>';
    return;
  }

  box.innerHTML = shown.map(function (it) {
    return '<div class="item-card' + (it.id === editingId ? ' is-editing' : '') + '" data-id="' + esc(it.id) + '">' +
      '<div class="item-top">' +
        '<div><h4 class="item-title">' + esc(it.student) + '</h4><div class="item-meta">' +
          (it.cls ? '<span class="tag">' + esc(it.cls) + '</span>' : '') +
          '<span class="tag tag-gold">' + esc(it.kind) + '</span>' +
          '<span class="tag">' + esc(it.status) + '</span>' +
        '</div></div>' +
        '<div class="item-actions">' +
          '<button type="button" class="btn btn-sm btn-ghost" data-df="edit">✏️ تعديل</button>' +
          '<button type="button" class="btn btn-sm btn-danger" data-df="del">حذف</button>' +
        '</div>' +
      '</div>' +
      (it.need ? '<div class="item-body"><b>الملاحظة:</b> ' + esc(it.need) + '</div>' : '') +
      (it.plan ? '<div class="item-body"><b>خطة التدخّل:</b> ' + esc(it.plan) + '</div>' : '') +
      (it.follow ? '<div class="item-body"><b>المتابعة:</b> ' + esc(it.follow) + '</div>' : '') +
    '</div>';
  }).join('');

  $$('.item-card', box).forEach(function (card) {
    var id = card.getAttribute('data-id');
    var item = items.filter(function (x) { return x.id === id; })[0];
    if (!item) return;

    card.querySelector('[data-df="edit"]').addEventListener('click', function () {
      $('#d_id').value = item.id;
      $('#d_student').value = item.student || '';
      $('#d_class').value = item.cls || '';
      $('#d_kind').value = item.kind || 'متفوق';
      $('#d_status').value = item.status || 'قيد التنفيذ';
      $('#d_need').value = item.need || '';
      $('#d_plan').value = item.plan || '';
      $('#d_follow').value = item.follow || '';
      $('#diffForm').classList.remove('hidden');
      renderDiffList();
      $('#sec-diffs').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    card.querySelector('[data-df="del"]').addEventListener('click', function () {
      if (!confirm('حذف سجل «' + item.student + '»؟')) return;
      Store.set('diffs', Store.get('diffs', []).filter(function (x) { return x.id !== id; }));
      renderDiffList();
      notify('تم الحذف');
    });
  });
}

/* =========================================================
   12) تصدير الدرجات إلى Excel (.xlsx) — بدون مكتبات خارجية
   ========================================================= */

/* ترميز نص إلى بايتات UTF-8 */
function utf8Bytes(str) {
  var out = [];
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    if (c < 0x80) { out.push(c); }
    else if (c < 0x800) { out.push(0xC0 | (c >> 6), 0x80 | (c & 63)); }
    else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < str.length) {
      var c2 = str.charCodeAt(++i);
      var cp = 0x10000 + ((c - 0xD800) << 10) + (c2 - 0xDC00);
      out.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    } else if (c >= 0xD800 && c <= 0xDFFF) { out.push(0xEF, 0xBF, 0xBD); }
    else { out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); }
  }
  return new Uint8Array(out);
}

/* جدول CRC32 (لملفات ZIP) */
var CRC_TABLE = (function () {
  var t = new Uint32Array(256);
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  var c = 0xFFFFFFFF;
  for (var i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/* بناء ملف ZIP بدون ضغط (مناسب لملفات xlsx الصغيرة) */
function zipStore(files) {
  function u16(v) { return [v & 255, (v >>> 8) & 255]; }
  function u32(v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; }

  var now = new Date();
  var dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF;
  var dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;

  var parts = [], central = [], offset = 0;

  files.forEach(function (f) {
    var nameBytes = utf8Bytes(f.name);
    var data = f.data;
    var crc = crc32(data);
    var header = [].concat(
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(dosTime), u16(dosDate),
      u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0)
    );
    parts.push(new Uint8Array(header), nameBytes, data);
    central.push({ name: nameBytes, crc: crc, size: data.length, offset: offset });
    offset += header.length + nameBytes.length + data.length;
  });

  var cdParts = [], cdSize = 0;
  central.forEach(function (e) {
    var h = [].concat(
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(dosTime), u16(dosDate),
      u32(e.crc), u32(e.size), u32(e.size),
      u16(e.name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(e.offset)
    );
    cdParts.push(new Uint8Array(h), e.name);
    cdSize += h.length + e.name.length;
  });

  var eocd = new Uint8Array([].concat(
    u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length),
    u32(cdSize), u32(offset), u16(0)
  ));

  var all = parts.concat(cdParts, [eocd]);
  var total = 0;
  all.forEach(function (a) { total += a.length; });
  var out = new Uint8Array(total), pos = 0;
  all.forEach(function (a) { out.set(a, pos); pos += a.length; });
  return out;
}

function xmlEsc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function colLetter(i) {
  var s = '';
  i = i + 1;
  while (i > 0) {
    var m = (i - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

/* خلية: نص عادي {v:'...'} أو رقم {v:12, n:true} أو مع تنسيق {v:'...', s:1} */
function cellXml(ref, cell) {
  if (cell === null || cell === undefined || cell === '') return '';
  var style = cell.s || 0;
  if (cell.n === true) return '<c r="' + ref + '" s="' + style + '"><v>' + cell.v + '</v></c>';
  return '<c r="' + ref + '" s="' + style + '" t="inlineStr"><is><t xml:space="preserve">' +
    xmlEsc(cell.v) + '</t></is></c>';
}

function buildSheetXml(rows, widths, rtl) {
  var maxCols = 0;
  var data = rows.map(function (cells, ri) {
    maxCols = Math.max(maxCols, cells.length);
    var inner = '';
    cells.forEach(function (c, ci) {
      inner += cellXml(colLetter(ci) + (ri + 1), c);
    });
    return inner ? '<row r="' + (ri + 1) + '">' + inner + '</row>' : '';
  }).join('');

  var cols = (widths && widths.length)
    ? '<cols>' + widths.map(function (w, i) {
        return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>';
      }).join('') + '</cols>'
    : '';

  var ref = 'A1:' + colLetter(Math.max(0, maxCols - 1)) + Math.max(1, rows.length);

  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<dimension ref="' + ref + '"/>' +
    '<sheetViews><sheetView workbookViewId="0"' + (rtl ? ' rightToLeft="1"' : '') + '/></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="16"/>' + cols +
    '<sheetData>' + data + '</sheetData>' +
    '</worksheet>';
}

function stylesXml() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="3">' +
      '<font><sz val="11"/><color rgb="FF1E2430"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="13"/><color rgb="FF0B2545"/><name val="Calibri"/></font>' +
    '</fonts>' +
    '<fills count="3">' +
      '<fill><patternFill patternType="none"/></fill>' +
      '<fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FF0B2545"/><bgColor indexed="64"/></patternFill></fill>' +
    '</fills>' +
    '<borders count="2">' +
      '<border><left/><right/><top/><bottom/><diagonal/></border>' +
      '<border><left style="thin"><color rgb="FFBBBBBB"/></left><right style="thin"><color rgb="FFBBBBBB"/></right>' +
      '<top style="thin"><color rgb="FFBBBBBB"/></top><bottom style="thin"><color rgb="FFBBBBBB"/></bottom><diagonal/></border>' +
    '</borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="4">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' +
        '<alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1">' +
        '<alignment horizontal="center" vertical="center"/></xf>' +
      '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';
}

function safeSheetName(name) {
  var s = String(name || 'الورقة').replace(/[[\]:*?\\/]/g, ' ').trim();
  if (!s) s = 'الورقة';
  return s.slice(0, 31);
}

/* بناء ملف xlsx كامل: يُعيد Uint8Array */
function buildXlsx(sheetName, rows, widths, rtl) {
  var files = [
    {
      name: '[Content_Types].xml',
      data: utf8Bytes('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '</Types>')
    },
    {
      name: '_rels/.rels',
      data: utf8Bytes('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>')
    },
    {
      name: 'xl/workbook.xml',
      data: utf8Bytes('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheets><sheet name="' + xmlEsc(safeSheetName(sheetName)) + '" sheetId="1" r:id="rId1"/></sheets>' +
        '</workbook>')
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: utf8Bytes('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>')
    },
    { name: 'xl/styles.xml', data: utf8Bytes(stylesXml()) },
    { name: 'xl/worksheets/sheet1.xml', data: utf8Bytes(buildSheetXml(rows, widths, rtl)) }
  ];
  return zipStore(files);
}

function bytesToB64(u8) {
  var s = '';
  for (var i = 0; i < u8.length; i += 4096) {
    s += String.fromCharCode.apply(null, u8.subarray(i, Math.min(i + 4096, u8.length)));
  }
  return btoa(s);
}

function downloadBlob(blob, fileName) {
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
}

function safeFileName(s) {
  return String(s || 'file').replace(/[\\\/:*?"<>|]/g, '').replace(/\s+/g, '-').slice(0, 60) || 'file';
}

function numberOrText(v) {
  if (v === '' || v === null || v === undefined) return { v: '', s: 2 };
  var n = parseFloat(v);
  if (!isNaN(n) && String(v).trim() !== '') return { v: n, n: true, s: 2 };
  return { v: String(v), s: 2 };
}

function statsOf(nums) {
  if (!nums.length) return null;
  var sum = nums.reduce(function (a, b) { return a + b; }, 0);
  return {
    count: nums.length,
    avg: Math.round((sum / nums.length) * 100) / 100,
    max: Math.max.apply(null, nums),
    min: Math.min.apply(null, nums)
  };
}

/* تصدير الكشف المعروض حاليًا */
function gradeSheetXlsxBytes() {
  var cls = $('#g_class').value.trim();
  var test = $('#g_test').value.trim();
  if (!cls || !test) throw new Error('اكتب الصف واسم التحصيل أولًا');
  if (!$('#gradeWrap tbody')) throw new Error('اضغط «عرض الكشف» أولًا');

  var b = Store.get('basics', {});
  var trs = $$('#gradeWrap tbody tr');
  var rows = [], nums = [];

  rows.push([{ v: 'كشف الدرجات — ' + test, s: 3 }]);
  rows.push([{ v: 'الصف: ' + cls + '   |   التاريخ: ' + formatArabicDate(todayISO()) +
              '   |   المعلم: ' + (b.b_teacher || '—') +
              '   |   السنة الدراسية: ' + (b.b_year || '—') + '   |   المادة: ' + (b.b_subject || 'الرياضيات') }]);
  rows.push([{ v: 'م', s: 1 }, { v: 'اسم التلميذ', s: 1 }, { v: 'الشعبة', s: 1 }, { v: 'الدرجة', s: 1 }]);

  trs.forEach(function (tr, i) {
    var name = tr.children[1] ? tr.children[1].textContent : '';
    var section = tr.children[2] ? tr.children[2].textContent : '';
    var g = tr.querySelector('.grade-input') ? tr.querySelector('.grade-input').value : '';
    if (g !== '' && !isNaN(parseFloat(g))) nums.push(parseFloat(g));
    rows.push([{ v: i + 1, n: true, s: 2 }, { v: name, s: 2 }, { v: section || '', s: 2 }, numberOrText(g)]);
  });

  var st = statsOf(nums);
  rows.push([]);
  rows.push([{ v: 'الإحصاء', s: 3 }]);
  if (st) {
    rows.push([{ v: 'عدد التلاميذ الذين أُدرجت درجاتهم', s: 2 }, { v: st.count, n: true, s: 2 }]);
    rows.push([{ v: 'المعدل', s: 2 }, { v: st.avg, n: true, s: 2 }]);
    rows.push([{ v: 'أعلى درجة', s: 2 }, { v: st.max, n: true, s: 2 }]);
    rows.push([{ v: 'أدنى درجة', s: 2 }, { v: st.min, n: true, s: 2 }]);
  } else {
    rows.push([{ v: 'لم تُدخل درجات بعد', s: 2 }]);
  }

  return { bytes: buildXlsx(test + ' - ' + cls, rows, [6, 34, 10, 14], true),
           fileName: 'درجات-' + safeFileName(cls) + '-' + safeFileName(test) + '-' + todayISO() + '.xlsx' };
}

/* تصدير كل الكشوف المحفوظة */
function allGradesXlsxBytes() {
  var grades = Store.get('grades', {});
  var students = Store.get('students', []);
  var byId = {};
  students.forEach(function (s) { byId[s.id] = s; });

  var keys = Object.keys(grades);
  if (!keys.length) throw new Error('لا توجد كشوف درجات محفوظة بعد');

  var rows = [];
  rows.push([{ v: 'جميع كشوف الدرجات — كراسة المعلم الليبي الرقمية', s: 3 }]);
  var b = Store.get('basics', {});
  rows.push([{ v: 'المعلم: ' + (b.b_teacher || '—') + '   |   السنة الدراسية: ' + (b.b_year || '—') +
                  '   |   تاريخ التصدير: ' + formatArabicDate(todayISO()) }]);
  rows.push([]);
  rows.push([{ v: 'الصف', s: 1 }, { v: 'التحصيل', s: 1 }, { v: 'م', s: 1 },
             { v: 'اسم التلميذ', s: 1 }, { v: 'الشعبة', s: 1 }, { v: 'الدرجة', s: 1 }]);

  keys.sort().forEach(function (key) {
    var parts = key.split('||');
    var cls = parts[0], test = parts[1] || '';
    var map = grades[key] || {};
    var ids = Object.keys(map);
    if (!ids.length) {
      rows.push([{ v: cls, s: 2 }, { v: test, s: 2 }, { v: '', s: 2 },
                 { v: 'لا توجد درجات محفوظة في هذا الكشف', s: 2 }, { v: '', s: 2 }, { v: '', s: 2 }]);
      return;
    }
    ids.forEach(function (sid, i) {
      var st = byId[sid];
      rows.push([
        { v: cls, s: 2 }, { v: test, s: 2 }, { v: i + 1, n: true, s: 2 },
        { v: st ? st.name : '(تلميذ حُذف من القائمة)', s: 2 },
        { v: st && st.section ? st.section : '', s: 2 },
        numberOrText(map[sid])
      ]);
    });
  });

  return { bytes: buildXlsx('كل الكشوف', rows, [16, 26, 6, 34, 10, 12], true),
           fileName: 'كل-الكشوف-' + todayISO() + '.xlsx' };
}

function exportXlsx(builder) {
  try {
    var r = builder();
    var blob = new Blob([r.bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    downloadBlob(blob, r.fileName);
    notify('✓ أُنشئ ملف Excel: ' + r.fileName);
  } catch (e) {
    notify(e.message, true);
  }
}

/* =========================================================
   الإقلاع
   ========================================================= */
document.addEventListener('DOMContentLoaded', function () {
  initNav();
  initBasics();
  initPlans();
  initPrep();
  initActivities();
  initNotes();
  initAssess();
  initStudents();
  initDiffs();
  studentsDatalist();
  classOptionsInto('classesList');
  route();
  refreshStats();

  if (Store.isMemoryOnly()) {
    notify('⚠️ التخزين المحلي غير متاح في هذا المتصفح — لن تُحفظ بياناتك', true);
  }
});
