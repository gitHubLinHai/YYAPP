/* 英语拼读闯关 - 主逻辑
   数据在 data/*.js 中（window.DB），进度存 localStorage */
(function () {
  'use strict';

  var AUDIO_EXT = '.mp3';           // 打包内置音频后缀；若无内置音频会自动回退到系统TTS
  var app = document.getElementById('app');
  var BOOK_ID = 'nse3a24';
  Object.keys(window.DB.textbooks).forEach(function (id) { window.DB[id] = window.DB.textbooks[id]; });
  var COURSE_IDS = [BOOK_ID].concat(Object.keys(window.DB.textbooks), ['g1', 'g2', 'g3']);
  function isTextbook(gid) { return !!window.DB[gid].chapters; }
  var QUIZ_LEN = 10;                // 每关题数

  /* ================= 进度存取 ================= */
  var KEY = 'eq_save_v1';
  function newSave() { return { coins: 0, stars: {}, wrong: {}, streak: 0, last: '', phonics: {}, lessons: {}, review: {}, course: { grade: BOOK_ID, unit: 0 }, textbookVersion: BOOK_ID, vocab: { grade: 3, records: {}, day: '', newToday: [] }, history: [], care: Care.defaults() }; }
  var save = newSave();
  try { var raw = localStorage.getItem(KEY); if (raw) { var d = JSON.parse(raw); for (var k in save) if (d[k] !== undefined) save[k] = d[k]; } } catch (e) { }
  if (!d || d.textbookVersion !== BOOK_ID) { save.course = { grade: BOOK_ID, unit: 0 }; save.textbookVersion = BOOK_ID; persist(); }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); return true; } catch (e) { return false; } }
  function totalStars() { var s = 0; for (var k in save.stars) s += save.stars[k]; return s; }
  function pandaTitle() {
    var s = totalStars();
    if (s >= 60) return '熊猫博士';
    if (s >= 30) return '熊猫学长';
    if (s >= 10) return '熊猫小学生';
    return '熊猫宝宝';
  }
  function touchStreak() {
    var today = new Date(); var t = today.getFullYear() + '-' + (today.getMonth() + 1) + '-' + today.getDate();
    if (save.last === t) return;
    var y = new Date(today.getTime() - 86400000);
    var ys = (y.getFullYear() + '-' + (y.getMonth() + 1) + '-' + y.getDate());
    save.streak = (save.last === ys) ? (save.streak + 1) : 1;
    save.last = t; persist();
  }

  /* ================= 音频 ================= */
  function slug(t) {
    return t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  var speakFallback = function (text) {
    if (studyPaused()) return;
    try {
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US'; u.rate = 0.8;
      window.speechSynthesis.speak(u);
    } catch (e) { }
  };
  var currentAudio = null;
  function say(text, kind) {
    if (studyPaused()) return;
    kind = kind || 'words';
    var url = 'audio/' + kind + '/' + slug(text) + AUDIO_EXT;
    try {
      if (currentAudio) currentAudio.pause();
      var a = new Audio(url);
      currentAudio = a;
      a.play().catch(function () { if (currentAudio === a && !studyPaused()) speakFallback(text); });
    } catch (e) { speakFallback(text); }
  }
  var sfxCtx = null;
  function chime(ok) {
    if (studyPaused()) return;
    try {
      sfxCtx = sfxCtx || new (window.AudioContext || window.webkitAudioContext)();
      var t = sfxCtx.currentTime;
      if (ok) {
        [[660, 0], [880, .09]].forEach(function (p) {
          var o = sfxCtx.createOscillator(), g = sfxCtx.createGain();
          o.frequency.value = p[0]; o.type = 'sine';
          g.gain.setValueAtTime(.25, t + p[1]); g.gain.exponentialRampToValueAtTime(.001, t + p[1] + .22);
          o.connect(g); g.connect(sfxCtx.destination); o.start(t + p[1]); o.stop(t + p[1] + .25);
        });
      } else {
        var o2 = sfxCtx.createOscillator(), g2 = sfxCtx.createGain();
        o2.frequency.value = 160; o2.type = 'square';
        g2.gain.setValueAtTime(.12, t); g2.gain.exponentialRampToValueAtTime(.001, t + .3);
        o2.connect(g2); g2.connect(sfxCtx.destination); o2.start(t); o2.stop(t + .32);
      }
    } catch (e) { }
  }

  /* ================= 小工具 ================= */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function shuffle(arr) { var a = arr.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function sample(arr, n, not) {
    var pool = arr.filter(function (x) { return !not || not.indexOf(x) < 0; });
    return shuffle(pool).slice(0, n);
  }
  function toast(msg) {
    var el = $('#toast'); el.textContent = msg; el.classList.remove('hidden');
    clearTimeout(el._t); el._t = setTimeout(function () { el.classList.add('hidden'); }, 1800);
  }
  function wordEmoji(w) {
    var hit = null;
    COURSE_IDS.forEach(function (g) {
      window.DB[g].units.forEach(function (u) {
        u.words.forEach(function (x) { if (!hit && x.w === w && x.emoji) hit = x.emoji; });
      });
    });
    return hit || '';
  }
  function allWords(gid) {
    var out = [];
    window.DB[gid].units.forEach(function (u) { u.words.forEach(function (w) { out.push(w); }); });
    return out;
  }
  function allCourseWords() { return COURSE_IDS.reduce(function (out, gid) { return out.concat(allWords(gid)); }, []); }
  function courseTitle(gid) { return isTextbook(gid) ? '外研新标准 · ' + (window.DB[gid].shortTitle || '三年级上册') : '拓展主题 · ' + window.DB[gid].title; }
  function confetti() {
    var layer = $('#confetti'); layer.innerHTML = '';
    var colors = ['#ffb400', '#ff6b6b', '#6fd28c', '#58aaf5', '#c084fc', '#ff9214'];
    for (var i = 0; i < 40; i++) {
      var c = document.createElement('i'); c.className = 'confetti';
      c.style.left = Math.random() * 100 + '%';
      c.style.background = colors[i % colors.length];
      c.style.animationDuration = (1.6 + Math.random() * 1.4) + 's';
      c.style.animationDelay = (Math.random() * .5) + 's';
      layer.appendChild(c);
    }
    setTimeout(function () { layer.innerHTML = ''; }, 3500);
  }

  /* ================= 渲染：首页 ================= */
  function showHome() {
    var gid = save.course.grade, g = window.DB[gid];
    var ui = currentUnit(gid), u = g.units[ui];
    var completed = g.units.filter(function (x, i) { return !!Learning.progress(save, gid, i).check; }).length;
    var due = Learning.due(save, Date.now()).length;
    var done = Learning.stages.filter(function (st) { return Learning.progress(save, gid, ui)[st.id]; }).length;
    app.innerHTML = '<header class="brand"><a class="brand-name" href="#">🐼 熊猫英语<span>ENGLISH QUEST</span></a><button class="profile" id="parentBtn" aria-label="家长中心">家长中心 ↗</button></header>' +
      '<button class="eye-quick" id="eyeToggle" aria-pressed="' + Care.eyeOn(save.care) + '"><span>◉ 一键护眼</span><small>' + (Care.eyeOn(save.care) ? '已开启 · 点此关闭' : '暖纸 · 大字 · 定时休息') + '</small><b>' + (Care.eyeOn(save.care) ? '开' : '关') + '</b></button>' +
      '<div class="greeting"><span class="eyebrow">每天一点，慢慢走远</span><h1>今天，也进步一点点。</h1><p>听懂一个词，再用它说一句话。</p></div>' +
      '<div class="course-strip"><div><span class="label">我的课程</span><strong>' + courseTitle(gid) + '</strong><small>' + (isTextbook(gid) ? (gid === BOOK_ID ? '三年级起点 · 2024新版 · 单元词汇同步' : gid === 'nse4a25' ? '三年级起点 · 新版 · 核心词起步包' : '三年级起点 · 新版 · 单元词表已核对') : '按主题编排的拓展练习') + '</small></div><button class="text-btn" id="courseBtn">调整 ›</button></div>' +
      '<section class="today-card"><div class="today-copy"><span class="pill">今日学习 · 建议 10–15 分钟</span><h2>' + (isTextbook(gid) ? g.chapters[u.chapter].title : u.title) + '</h2><p>' + (isTextbook(gid) ? g.chapters[u.chapter].label + ' · 第' + u.group + '组' : u.en) + ' · ' + u.words.length + ' 个单词</p><button class="btn green" id="continueBtn">' + (done ? '继续学习' : '开始今天的学习') + ' <span>→</span></button></div><div class="book-art" aria-hidden="true"><span class="art-star">✦</span><div class="book-face">Aa<small>HELLO, WORLD</small></div><span class="art-leaf">🌱</span></div><div class="today-progress"><span>' + (isTextbook(gid) ? '当前学习组' : '当前主题') + ' · 已完成 ' + done + '/5 步</span><div class="thin-track"><i style="width:' + done * 20 + '%"></i></div></div></section>' +
      '<div class="section-title"><h2>一步一步，学得扎实</h2><button class="text-btn" id="routeBtn">' + (isTextbook(gid) ? '课本目录 ↗' : '全部主题 ↗') + '</button></div>' +
      '<div class="mini-route">' + Learning.stages.map(function (st, i) { return '<div class="mini-step ' + (Learning.progress(save, gid, ui)[st.id] ? 'done' : '') + '"><span>' + (Learning.progress(save, gid, ui)[st.id] ? '✓' : '0' + (i + 1)) + '</span><b>' + ['认词', '听辨', '拼写', '用句', '检测'][i] + '</b></div>'; }).join('') + '</div>' +
      '<div class="section-title"><h2>把学过的，记得更久</h2></div><div class="practice-grid"><button class="practice-card" id="reviewBtn"><span class="practice-icon">↻</span><strong>到期复习 <em>' + due + '</em></strong><p>' + (due ? '先复习，再学新内容' : '学过的词会在这里等你') + '</p></button><button class="practice-card" id="phonicsBtn"><span class="practice-icon peach">Aa</span><strong>系统自然拼读</strong><p>20课循序学习，合音读词与拆音拼写</p></button></div>' +
      '<button class="vocab-entry" id="vocabBtn"><span>🌱</span><span><strong>年级词汇积累</strong><small>三至六年级 · 独立词库 · 为后续学习打基础</small></span><b>→</b></button>' +
      '<div class="week-note"><span>✦</span><p>已完成 <b>' + completed + '</b> 个' + (isTextbook(gid) ? '学习组' : '主题') + '检测 · 连续学习 <b>' + save.streak + '</b> 天<br><small>认真学完一小步，就值得被看见。</small></p><span class="note-stars">' + totalStars() + ' ★</span></div>' +
      '<nav class="bottom-nav"><button class="active" id="homeNav">⌂<span>今日</span></button><button id="mapNav">☷<span>学习路线</span></button><button id="vocabNav">♧<span>词汇积累</span></button><button id="wrongNav">▤<span>错词本</span></button><button id="parentNav">♙<span>我的</span></button></nav>';
    $('#eyeToggle').onclick = function () { syncCare(); Care.toggleEye(save.care); applyReading(); persist(); showHome(); syncCare(); };
    $('#continueBtn').onclick = function () { showLesson(gid, ui); };
    $('#routeBtn').onclick = $('#mapNav').onclick = function () { showMap(gid); };
    $('#courseBtn').onclick = showCourse;
    $('#reviewBtn').onclick = showReview;
    $('#phonicsBtn').onclick = showPhonics;
    $('#wrongNav').onclick = showWrong;
    $('#vocabBtn').onclick = $('#vocabNav').onclick = showVocabulary;
    $('#homeNav').onclick = showHome;
    $('#parentBtn').onclick = $('#parentNav').onclick = showParent;
  }
  function currentUnit(gid) {
    var start = save.course.grade === gid ? save.course.unit : 0;
    for (var i = start; i < window.DB[gid].units.length; i++) {
      if (!Learning.progress(save, gid, i).check) return i;
    }
    return start;
  }
  function unitOpen(gid, ui) {
    return ui === 0 || (save.course.grade === gid && ui === save.course.unit) ||
      !!Learning.progress(save, gid, ui).learn || !!Learning.progress(save, gid, ui - 1).check ||
      (save.stars[gid + 'u' + (ui - 1)] || 0) > 0;
  }
  function showCourse() {
    app.innerHTML = '<div class="topbar"><button class="back" id="back" aria-label="返回">←</button><h2>课程与课堂进度</h2></div><div class="card"><span class="eyebrow">外研新标准 · 三年级起点 · 孙有中主编</span><h2>跟着课本，分组练习</h2><p class="helper">三上为2024年7月第1版（ISBN 978-7-5213-5489-8），2026年是重印年份。后续册次按同系列新版核对，各册实际收录范围见下方。每组为App划分，不是课本课时编号；选择起点不授予掌握记录。</p><label for="gradeSelect">教材或拓展主题</label><select id="gradeSelect">' + COURSE_IDS.map(function (g) { return '<option value="' + g + '"' + (save.course.grade === g ? ' selected' : '') + '>' + courseTitle(g) + '</option>'; }).join('') + '</select><p class="helper" id="bookCoverage"></p><a id="bookSource" class="source-link" target="_blank" rel="noopener">教材核对来源 ↗</a><label for="unitSelect">课堂对应学习组</label><select id="unitSelect"></select><button class="btn green" id="saveCourse">保存学习起点</button></div><div class="card"><h3>同步范围</h3><p class="helper">词汇巩固不替代课文和课堂活动；例句与分组为App自编。戏剧、歌曲、课文朗读请结合纸质教材完成。</p></div>' + window.DB.textbookCatalog.map(function (b) { return '<div class="card"><h3>' + b.title + ' · 目录已核对</h3><p class="helper">' + b.chapters.map(function (t, i) { return 'Unit ' + (i + 1) + ' · ' + t; }).join('<br>') + '</p><p class="helper">词表仍在整理，暂未开放学习，避免混用旧版内容。</p><a class="source-link" target="_blank" rel="noopener" href="' + b.source + '">国家平台教材来源 ↗</a></div>'; }).join('');
    function options() { var gid = $('#gradeSelect').value, b = window.DB[gid]; $('#bookCoverage').textContent = b.coverage || (isTextbook(gid) ? 'Welcome及Unit 1–6单元词表已核对。' : '按主题编排的拓展练习。'); $('#bookSource').hidden = !isTextbook(gid); $('#bookSource').href = b.source || 'https://www.fltrp.com/upload/resources/file/2024/08/01/92191.pdf'; $('#unitSelect').innerHTML = b.units.map(function (u, i) { return '<option value="' + i + '"' + (gid === save.course.grade && i === save.course.unit ? ' selected' : '') + '>' + (i + 1) + '. ' + (isTextbook(gid) ? b.chapters[u.chapter].label + ' · 第' + u.group + '组 · ' : '') + u.title + '</option>'; }).join(''); }
    options(); $('#gradeSelect').onchange = options;
    $('#back').onclick = showHome;
    $('#saveCourse').onclick = function () { save.course = { grade: $('#gradeSelect').value, unit: +$('#unitSelect').value }; persist(); showHome(); };
  }
  function textbookNote(gid, unit) {
    if (!isTextbook(gid)) return '';
    var chapter = window.DB[gid].chapters[unit.chapter];
    return '<div class="card textbook-note"><span class="eyebrow">' + chapter.label + ' · 课本第' + chapter.pages + '页</span><h3>' + chapter.en + '</h3><p class="helper">本单元目标：' + chapter.goal + '</p><p class="helper">' + chapter.patterns.join('<br>') + '</p><p class="helper">课本配合任务：' + chapter.task + '</p><small>下方五步用于词汇巩固，不替代课文和课堂活动；例句为App自编，跟读由孩子或家长检查。</small></div>';
  }
  function showLesson(gid, ui) {
    if (!unitOpen(gid, ui)) { toast('先完成上一主题检测'); return; }
    var u = window.DB[gid].units[ui], p = Learning.progress(save, gid, ui);
    app.innerHTML = '<div class="topbar"><button class="back" id="back" aria-label="返回">←</button><h2>' + (isTextbook(gid) ? window.DB[gid].chapters[u.chapter].label + ' · 第' + u.group + '组' : u.title) + '</h2></div><div class="lesson-intro"><span class="eyebrow">' + window.DB[gid].title + ' · 学习组 ' + (ui + 1) + '</span><h1>从听懂，到会用。</h1><p>' + u.words.length + ' 个词 · 可以分几次学完</p></div>' + textbookNote(gid, u) + '<div class="stage-list">' + Learning.stages.map(function (st) {
      var open = Learning.available(save, gid, ui, st.id);
      return '<button class="stage ' + (p[st.id] ? 'complete' : '') + '" data-stage="' + st.id + '"' + (open ? '' : ' disabled') + '><span class="stage-number">' + (p[st.id] ? '✓' : st.icon) + '</span><span><strong>' + (isTextbook(gid) && st.id === 'check' ? '本组小检测' : isTextbook(gid) && st.id === 'learn' ? '认识本组词语' : st.title) + '</strong><small>' + st.desc + '</small></span><span class="stage-arrow">' + (open ? '›' : '待解锁') + '</span></button>';
    }).join('') + '</div><p class="helper">每步覆盖本学习组全部单词；检测要求总体与独立拼写正确率都达到 80%。例句跟读由孩子或家长自行检查，本 App 不进行口语评分。</p>';
    $('#back').onclick = function () { showMap(gid); };
    $all('[data-stage]').forEach(function (b) { b.onclick = function () { var st = b.getAttribute('data-stage'); if (st === 'learn') showLearn(gid, ui); else startQuiz(gid, ui, st); }; });
  }
  function showReview() {
    var due = Learning.due(save, Date.now());
    app.innerHTML = '<div class="topbar"><button class="back" id="back" aria-label="返回">←</button><h2>到期复习</h2></div><div class="card"><span class="eyebrow">温故知新</span><h1>' + due.length + ' 个词，等你回想</h1><p class="helper">答对后逐步安排到 1、3、7、14、30 天后复习；答错的词 10 分钟后再练。这是可用的初始间隔，不代表每个人的最佳记忆周期。每轮最多 10 个词。</p>' + (due.length ? '<button class="btn green" id="reviewStart">开始回忆练习 →</button>' : '<p class="empty">暂时没有到期的词，去学一个新主题吧。</p>') + '</div>';
    $('#back').onclick = showHome;
    if ($('#reviewStart')) $('#reviewStart').onclick = function () { startQuiz(null, null, 'review'); };
  }

  /* ================= 独立年级词汇积累 ================= */
  var vocabSession = null;
  function vocabDay() {
    var now = new Date();
    var day = now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate();
    if (save.vocab.day !== day) { save.vocab.day = day; save.vocab.newToday = []; persist(); }
  }
  function showVocabulary() {
    vocabDay();
    var words = Vocabulary.forGrade(save.vocab.grade), records = save.vocab.records;
    var practiced = words.filter(function (w) { return !!records[w.w]; }).length;
    var steady = words.filter(function (w) { return Learning.steady(records[w.w]); }).length;
    var due = words.filter(function (w) { return records[w.w] && records[w.w].due <= Date.now(); }).length;
    app.innerHTML = '<div class="topbar"><button class="back" id="back" aria-label="返回首页">←</button><h2>年级词汇积累</h2><span class="vocab-tag">独立于课程</span></div>' +
      '<div class="lesson-intro"><span class="eyebrow">一点点积累，为下一程准备</span><h1>把单词，变成自己的。</h1><p>从基础到进阶，先复习，再学新词。</p></div>' +
      '<div class="vocab-grades" aria-label="目标年级">' + [3, 4, 5, 6].map(function (g) { return '<button data-vgrade="' + g + '" aria-pressed="' + (g === save.vocab.grade) + '" class="' + (g === save.vocab.grade ? 'selected' : '') + '">' + ['三', '四', '五', '六'][g - 3] + '年级</button>'; }).join('') + '</div>' +
      '<div class="card vocab-summary"><span class="eyebrow">截至本年级的建议累计范围</span><h2>' + words.length + ' 个词 <small>包含前面年级基础词</small></h2><div class="vocab-stats"><div><strong>' + practiced + '</strong><span>已练习</span></div><div><strong>' + steady + '</strong><span>较稳固</span></div><div><strong>' + due + '</strong><span>到期复习</span></div></div><div class="thin-track"><i style="width:' + (steady / words.length * 100) + '%"></i></div><p class="helper">听辨、词义、独立拼写都需至少 3 次正确记录，每次升级相隔至少 24 小时；旧版记录需补测，不直接认定稳固。</p><button class="btn green" id="vocabNew">学习新词 · 今日还可学 ' + Math.max(0, 5 - save.vocab.newToday.length) + ' 个 →</button><button class="btn ghost" id="vocabReview" style="margin-top:12px">先复习到期词 · ' + due + ' 个</button></div>' +
      '<button class="btn ghost" id="vocabReportBtn" style="margin-bottom:18px">查看积累掌握报告 ↗</button><details class="vocab-source"><summary>这些词为什么值得积累？</summary><p>词库收录课标二级表的 505 个词目，以及数词、月份、星期补充词。三至六年级的分配是本 App 的学习建议，课标本身按学段设置目标。它为后续教材学习和考试打基础，不是学校逐年级必考清单，也不替代老师的考试范围。</p><p>基础词可能有多种含义，当前练习侧重常见中文词义、听辨、完整拼写和听写，不等同于已掌握全部用法。</p><a class="source-link" href="' + Vocabulary.source.url + '" target="_blank" rel="noopener">查看课标原文 ↗</a><p>' + Vocabulary.source.pages + ' · 核对于 ' + Vocabulary.source.checked + '</p></details>' +
      '<div class="section-title"><h2>我的积累词库</h2><span class="label">共 ' + words.length + ' 词</span></div><label for="vocabSearch" class="sr-only">搜索英文或中文</label><input id="vocabSearch" class="vocab-search" type="search" placeholder="搜索单词或中文意思" autocomplete="off"><label for="vocabFilter" class="sr-only">筛选积累状态</label><select id="vocabFilter"><option value="all">全部单词</option><option value="new">还未练习</option><option value="due">到期复习</option><option value="steady">较稳固</option></select><div id="vocabWords"></div><button class="btn ghost" id="vocabMore">再看 40 个词</button>';
    $('#back').onclick = showHome;
    $all('[data-vgrade]').forEach(function (b) { b.onclick = function () { save.vocab.grade = +b.getAttribute('data-vgrade'); persist(); showVocabulary(); }; });
    $('#vocabNew').disabled = save.vocab.newToday.length >= 5 || practiced >= words.length;
    $('#vocabReview').disabled = !due;
    $('#vocabReportBtn').onclick = function () { showMasteryReport('vocab'); };
    $('#vocabNew').onclick = function () {
      vocabDay();
      var fresh = words.filter(function (w) { return !records[w.w]; }).slice(0, Math.max(0, 5 - save.vocab.newToday.length));
      if (!fresh.length) { showVocabulary(); return; }
      vocabSession = { words: fresh, index: 0, mode: 'new' };
      renderVocabCard();
    };
    $('#vocabReview').onclick = function () {
      var scheduled = words.filter(function (w) { return records[w.w] && records[w.w].due <= Date.now(); }).sort(function (a, b) { return records[a.w].due - records[b.w].due; }).slice(0, 10);
      if (!scheduled.length) { showVocabulary(); return; }
      vocabSession = { words: scheduled, mode: 'review' };
      startQuiz(null, null, 'vocab');
    };
    var limit = 40;
    function renderList() {
      var query = $('#vocabSearch').value.trim().toLowerCase(), filter = $('#vocabFilter').value;
      var filtered = words.filter(function (w) {
        var r = records[w.w];
        return (!query || (w.w + w.zh).toLowerCase().indexOf(query) >= 0) && (filter === 'all' || (filter === 'new' && !r) || (filter === 'due' && r && r.due <= Date.now()) || (filter === 'steady' && Learning.steady(r)));
      });
      $('#vocabWords').innerHTML = filtered.slice(0, limit).map(function (w) {
        var r = records[w.w];
        return '<div class="vocab-word"><div><strong>' + w.w + '</strong><small>' + w.zh + '</small></div><span>' + (!r ? '待积累' : Learning.steady(r) ? '较稳固' : '巩固中') + '</span><button class="speaker" data-vocab-say="' + w.w + '" aria-label="朗读 ' + w.w + '">🔊</button></div>';
      }).join('') || '<p class="empty">没有符合条件的单词</p>';
      $('#vocabMore').hidden = filtered.length <= limit;
      $all('[data-vocab-say]').forEach(function (b) { b.onclick = function () { say(b.getAttribute('data-vocab-say'), 'words'); }; });
    }
    $('#vocabSearch').oninput = $('#vocabFilter').onchange = function () { limit = 40; renderList(); };
    $('#vocabMore').onclick = function () { limit += 40; renderList(); };
    renderList();
  }
  function renderVocabCard() {
    var w = vocabSession.words[vocabSession.index];
    app.innerHTML = '<div class="topbar"><button class="back" id="back" aria-label="返回积累页">←</button><h2>认识新词</h2><span class="label">' + (vocabSession.index + 1) + ' / ' + vocabSession.words.length + '</span></div><div class="flashcard"><span class="eyebrow">看一看，听一听，再回想</span><div class="fword">' + w.w + '</div><div class="fzh">' + w.zh + '</div><p class="helper">' + (w.source === 'standard2022-level2' ? '来源：课标二级词汇表' : '来源：课标数词、月份或星期表') + '</p><button class="speaker" id="vocabSay">🔊 再听一遍</button></div><button class="btn green" id="vocabNext">' + (vocabSession.index + 1 === vocabSession.words.length ? '开始回忆练习 →' : '下一个单词 →') + '</button><p class="helper">每次作答即时保存，完成整轮后结算奖励。每词练完整拼写、听辨和词义；复习加入听写。不影响课程解锁。</p>';
    $('#back').onclick = showVocabulary;
    $('#vocabSay').onclick = function () { say(w.w, 'words'); };
    $('#vocabNext').onclick = function () { vocabSession.index++; if (vocabSession.index < vocabSession.words.length) renderVocabCard(); else startQuiz(null, null, 'vocab'); };
    say(w.w, 'words');
  }

  function showMasteryReport(scope) {
    $('#confetti').innerHTML = '';
    $('#toast').classList.add('hidden');
    var cutoff = Date.now() - 7 * 86400000;
    var recent = save.history.filter(function (h) { return h.time >= cutoff && (scope === 'all' || h.scope === scope); });
    var delayed = recent.filter(function (h) { return h.delayed; });
    function score(list) { return list.length ? Math.round(list.filter(function (h) { return h.correct; }).length / list.length * 100) + '%' : '暂无记录'; }
    var types = [{ id: 'listen', name: '听辨' }, { id: 'zh', name: '词义辨认' }, { id: 'write', name: '完整拼写' }, { id: 'dictate', name: '听写' }, { id: 'sentence', name: '例句理解' }];
    var weak = [];
    [{ id: 'course', records: save.review }, { id: 'vocab', records: save.vocab.records }].forEach(function (group) {
      if (scope !== 'all' && scope !== group.id) return;
      Object.keys(group.records).forEach(function (word) {
        var record = group.records[word];
        if (!Learning.steady(record) || Learning.needsWork(record)) weak.push({ word: word, scope: group.id, record: record });
      });
    });
    weak.sort(function (a, b) { return Number(Learning.needsWork(b.record)) - Number(Learning.needsWork(a.record)) || a.record.due - b.record.due; });
    app.innerHTML = '<div class="topbar"><button class="back" id="back" aria-label="返回">←</button><h2>真实掌握报告</h2></div><div class="lesson-intro"><span class="eyebrow">最近 7 天 · 以答题记录为依据</span><h1>记住，比做完更重要。</h1><p>分清认得、会写与过一段时间还记得。</p></div><label for="reportScope">报告范围</label><select id="reportScope"><option value="all">全部学习</option><option value="course">课程学习</option><option value="vocab">独立词汇积累</option></select>' +
      '<div class="card"><div class="vocab-stats"><div><strong>' + recent.length + '</strong><span>答题次数</span></div><div><strong>' + delayed.length + '</strong><span>延迟复测次数</span></div><div><strong>' + (delayed.length ? score(delayed) : '—') + '</strong><span>延迟复测正确率</span></div></div><p class="helper">延迟复测要求距该词上次练习、该技能上次作答都至少 24 小时。同一轮看过答案后，后面的题不重复计入。它反映抽查结果，不是整个词库的记忆率。</p></div>' +
      '<div class="card"><h3>各项能力的练习表现</h3>' + types.map(function (type) {
        var rows = recent.filter(function (h) { return h.type === type.id; });
        var right = rows.filter(function (h) { return h.correct; }).length;
        return '<div class="skill-report-row"><span>' + type.name + '</span><b>' + score(rows) + '</b><small>' + (rows.length ? right + '/' + rows.length + ' 次答对' : '尚未练习') + '</small></div>';
      }).join('') + '<p class="helper">选择题与独立输入分别统计。拼写判分接受常见英美拼写差异，大小写不扣分；句中运用和口语能力仍需另行观察。</p></div>' +
      '<div class="section-title"><h2>接下来重点巩固</h2><span class="label">当前最优先的 8 个词</span></div>' + (weak.length ? weak.slice(0, 8).map(function (item) {
        var skills = item.record.skills || {};
        return '<div class="card weak-word"><strong>' + item.word + '</strong><span class="label">' + (item.scope === 'course' ? '课程' : '独立积累') + '</span><p>' + Learning.coreSkills.map(function (key) { return Learning.skillNames[key] + '：' + (!skills[key] ? '待检测' : skills[key].lastOk === false ? '最近答错' : skills[key].level >= 3 ? '较稳固' : '巩固中'); }).join(' · ') + (skills.use && skills.use.lastOk === false ? ' · 例句理解：最近答错' : '') + '</p></div>';
      }).join('') : '<div class="card helper">当前没有待巩固记录。先完成练习，再隔一段时间回来复测。</div>') +
      '<button class="btn green" id="reportPractice">' + (scope === 'vocab' ? '返回积累，复习到期词 →' : '查看课程到期复习 →') + '</button><p class="helper">报告使用本机最近 1000 次作答中近 7 天的数据；旧版只有汇总等级的记录会显示待检测。学习节奏采用透明的初始规则，尚未进行真实学习效果实验。</p>';
    $('#reportScope').value = scope;
    $('#reportScope').onchange = function () { showMasteryReport(this.value); };
    $('#back').onclick = scope === 'vocab' ? showVocabulary : showParent;
    $('#reportPractice').onclick = scope === 'vocab' ? showVocabulary : showReview;
  }

  /* ================= 家长中心 ================= */
  function showParent() {
    var rows = COURSE_IDS.map(function (gid) {
      var g = window.DB[gid];
      var stars = g.units.map(function (u, i) {
        var st = save.stars[gid + 'u' + i] || 0;
        return '<span class="rp-star' + (st ? ' on' : '') + '">' + (st ? '★'.repeat(st) : '·') + '</span>';
      }).join('');
      return '<div class="rp-row"><div class="rp-g">' + g.icon + g.title + '</div><div class="rp-stars">' + stars + '</div></div>';
    }).join('');
    var doneCnt = 0, totalUnits = 0;
    COURSE_IDS.forEach(function (gid) {
      totalUnits += window.DB[gid].units.length;
      window.DB[gid].units.forEach(function (u, i) { if ((save.stars[gid + 'u' + i] || 0) > 0) doneCnt++; });
    });
    app.innerHTML =
      '<div class="topbar"><button class="back" id="back">←</button><h2>👑 家长中心</h2></div>' +
      '<div class="card"><div class="rp-title">📊 学习报告</div>' +
      '<div class="stat-row" style="justify-content:flex-start;margin:10px 0">' +
      '<div class="stat">🔥 连续 ' + save.streak + ' 天</div>' +
      '<div class="stat">⭐ ' + totalStars() + ' 星</div>' +
      '<div class="stat">✅ ' + doneCnt + '/' + totalUnits + ' 关</div>' +
      '<div class="stat">📕 错词 ' + Object.keys(save.wrong).length + '</div></div>' +
      rows + '</div>' +
      '<button class="vocab-entry" id="masteryReportBtn"><span>▥</span><span><strong>真实掌握报告</strong><small>分项表现、延迟复测与薄弱词</small></span><b>→</b></button><div class="card"><div class="rp-title">学习路线与复习</div><p class="helper">五步依次完成；检测总体与独立拼写正确率都达到 80% 后进阶。旧版星星保留，但不代表已完成新版五步学习。当前共有 ' + Object.keys(save.lessons).filter(function (id) { return save.lessons[id].check; }).length + ' 个学习组/主题完成检测，' + Learning.due(save, Date.now()).length + ' 个词到期复习。<br>教材：外研新标准（三起）2024版三年级上册，已核对目录与单元词表。口语跟读请由孩子或家长检查。</p><a class="source-link" href="https://ies.ed.gov/ncee/wwc/PracticeGuide/1" target="_blank" rel="noopener">学习设计参考：IES 间隔学习与主动回忆指南 ↗</a></div>' +
      '<div class="card"><div class="rp-title">护眼、时长与进度保护</div><button class="btn green" id="careSettingsBtn">护眼与使用时长</button><button class="btn ghost" id="backupBtn" style="margin-top:14px">备份与恢复进度</button></div>' +
      '<div class="card"><div class="rp-title">🔄 版本与更新</div>' +
      '<div class="rp-note">当前版本：' + (window.AppUpdate ? window.AppUpdate.version() : '未知') +
      (window.AppUpdate && window.AppUpdate.env() !== 'preview' ? '' : '<br>（网页预览不支持在线更新，手机上可用）') + '</div>' +
      '<button class="btn blue" id="checkUpd">检查更新</button>' +
      '<div id="updBox" style="margin-top:10px"></div></div>' +
      '<div class="card"><div class="rp-title">⚠️ 危险操作</div>' +
      '<button class="btn ghost" id="resetBtn">清空所有进度（重置）</button></div>';
    $('#back').onclick = showHome;
    $('#resetBtn').onclick = function () {
      if (confirm('确定要清空所有课程进度、词汇积累、作答记录、金币和错题本吗？护眼设置和使用时长保留。')) { var careState = save.care; save = newSave(); save.care = careState; persist(); resetNavigation(); toast('已重置'); showHome(); }
    };
    $('#careSettingsBtn').onclick = showCareSettings;
    $('#backupBtn').onclick = showBackup;
    $('#masteryReportBtn').onclick = function () { showMasteryReport('all'); };
    $('#checkUpd').onclick = function () {
      var box = $('#updBox');
      window.AppUpdate.check(false, function (st) {
        if (!box.isConnected && st.state !== 'installed') return;
        renderUpdateState(box, st, false);
      });
    };
  }
  function renderUpdateState(box, st, startup) {
    if (st.state === 'checking') { box.textContent = '正在检查更新…'; }
    else if (st.state === 'busy') { toast('正在检查或下载更新，请稍候'); }
    else if (st.state === 'uptodate') { box.textContent = '当前版本 v' + st.version + '，暂未发现更高版本'; }
    else if (st.state === 'nopreview') { box.textContent = '网页预览不支持，请在手机 App 里检查更新。'; }
    else if (st.state === 'error') {
      box.innerHTML = '<p class="helper" role="alert"></p><button class="btn ghost" id="closeUpdate">稍后重试</button>';
      $('p', box).textContent = st.msg || '更新失败，请检查网络后重试';
      $('#closeUpdate', box).onclick = function () { if (startup) box.parentNode.remove(); else box.textContent = ''; };
    } else if (st.state === 'found' || st.state === 'waitingwifi') {
      box.innerHTML = '<div class="upd-found"></div><p class="helper"></p><button class="btn green" id="doUpd">立即更新</button>' + (startup ? '<button class="btn ghost" id="updLater" style="margin-top:12px">稍后再说</button>' : '');
      $('.upd-found', box).textContent = '发现新版本 v' + st.version;
      $('p', box).textContent = st.msg || st.notes || '学习内容与功能更新';
      $('#doUpd', box).textContent = st.state === 'waitingwifi' ? '手动更新（可用移动流量）' : '立即更新';
      $('#doUpd', box).disabled = !st.go;
      $('#doUpd', box).onclick = function () { if (st.go) st.go(); };
      if (startup) $('#updLater', box).onclick = function () { box.parentNode.remove(); };
    } else if (st.state === 'downloading') {
      box.innerHTML = '<div class="qbar"><i></i></div><p aria-live="polite">正在下载并安装更新，请稍候…</p>';
      $('i', box).style.width = Math.round(st.progress * 100) + '%';
    } else if (st.state === 'installed') {
      box.textContent = '更新已安装，正在自动载入新版…';
      persist();
      window.AppUpdate.restart();
    }
  }

  /* ================= 渲染：关卡地图 ================= */
  function showMap(gid) {
    var g = window.DB[gid];
    var rows = g.units.map(function (u, i) {
      var id = gid + 'u' + i;
      var st = save.stars[id] || 0;
      var locked = !unitOpen(gid, i);
      var stars = '<span class="' + (st >= 1 ? 'on' : '') + '">★</span><span class="' + (st >= 2 ? 'on' : '') + '">★</span><span class="' + (st >= 3 ? 'on' : '') + '">★</span>';
      var heading = isTextbook(gid) && (i === 0 || g.units[i - 1].chapter !== u.chapter) ? '<div class="textbook-chapter"><h3>' + g.chapters[u.chapter].label + ' · ' + g.chapters[u.chapter].title + '</h3><p class="helper">课本第' + u.pages + '页</p></div>' : '';
      return heading + '<button type="button" class="unit' + (locked ? ' locked' : '') + '" data-u="' + i + '"' + (locked ? ' disabled' : '') + '>' +
        '<div class="uicon">' + (locked ? '🔒' : u.icon) + '</div>' +
        '<div class="uinfo"><div class="utitle">' + (isTextbook(gid) ? '第' + u.group + '组 · ' + u.words.length + '个词' : (i + 1) + '. ' + u.title) + '</div>' +
        '<div class="uen">' + (isTextbook(gid) ? u.words.slice(0, 3).map(function (w) { return w.w; }).join(' · ') : u.en + ' · ' + u.words.length + '词') + '</div>' +
        '<div class="ustars">' + stars + '</div></div>' +
        (locked ? '<div class="lock">🔒</div>' : '<div class="go">▶</div>') + '</button>';
    }).join('');
    app.innerHTML =
      '<div class="topbar"><button class="back" id="back">←</button><h2>' + g.icon + ' ' + g.title + '</h2>' +
      '<span class="coins">💰 ' + save.coins + '</span></div>' +
      '<p class="helper">' + (isTextbook(gid) ? '按本册目录顺序学习；每组4–6词，先完成本组五步再前进。可在课程设置选择课堂起点。' : '拓展主题练习；每个主题包含5个步骤。') + '</p><div class="unit-grid">' + rows + '</div>';
    $('#back').onclick = showHome;
    $all('.unit').forEach(function (el) {
      el.onclick = function () {
        var i = +el.getAttribute('data-u');
        if (!unitOpen(gid, i)) { toast('先完成上一主题的单元检测'); return; }
        showLesson(gid, i);
      };
    });
  }

  /* ================= 渲染：学词卡片 ================= */
  var learn = null;
  function showLearn(gid, ui) {
    var g = window.DB[gid], u = g.units[ui];
    learn = { gid: gid, ui: ui, idx: 0, seen: {} };
    app.innerHTML =
      '<div class="topbar"><button class="back" id="back">←</button><h2>' + u.icon + ' ' + u.title + '</h2>' +
      '<span class="coins">💰 ' + save.coins + '</span></div>' +
      '<div class="flashcard" id="card"></div>' +
      '<div class="dots" id="dots"></div>' +
      '<div class="nav-row"><button class="nav-btn" id="prev">‹</button>' +
      '<button class="btn green" id="nextCard" style="flex:1">下一个 ▶</button>' +
      '</div>' +
      '<button class="btn blue" id="startQuiz" style="margin-top:12px">完成词卡，进入听辨</button>';
    $('#back').onclick = function () { showLesson(gid, ui); };
    $('#prev').onclick = function () { moveCard(-1); };
    $('#nextCard').onclick = function () { moveCard(1); };
    $('#startQuiz').onclick = completeCards;
    renderCard();
  }
  function renderCard() {
    var u = window.DB[learn.gid].units[learn.ui];
    var w = u.words[learn.idx];
    learn.seen[learn.idx] = true;
    $('#startQuiz').disabled = Object.keys(learn.seen).length < u.words.length;
    var em = w.emoji ? '<div class="femoji">' + w.emoji + '</div>' : '<div class="femoji">🔤</div>';
    $('#card').innerHTML = em +
      '<div class="fword">' + w.w + '</div><div class="fipa">' + (w.ipa || '') + '</div>' +
      '<div class="fzh">' + w.zh + '</div>' +
      '<div class="fex">💬 ' + w.ex + ' <button class="speaker" data-ex="1">🔊</button></div>';
    var dots = '';
    for (var i = 0; i < u.words.length; i++) dots += '<span class="' + (i === learn.idx ? 'on' : '') + '"></span>';
    $('#dots').innerHTML = dots;
    $('#prev').disabled = learn.idx === 0;
    var last = learn.idx === u.words.length - 1;
    $('#nextCard').textContent = last ? '完成词卡 ✓' : '下一个 ▶';
    $all('.speaker', $('#card')).forEach(function (b) {
      b.onclick = function (e) { e.stopPropagation(); say(w.ex, 'sent'); };
    });
    $('#card').onclick = function () { say(w.w, 'words'); };
    say(w.w, 'words');
  }
  function moveCard(d) {
    var u = window.DB[learn.gid].units[learn.ui];
    var n = learn.idx + d;
    if (n >= u.words.length) { completeCards(); return; }
    if (n < 0) return;
    learn.idx = n; renderCard();
  }

  function completeCards() {
    var u = window.DB[learn.gid].units[learn.ui];
    if (Object.keys(learn.seen).length < u.words.length) return;
    Learning.mark(save, learn.gid, learn.ui, 'learn'); persist(); touchStreak();
    showLesson(learn.gid, learn.ui);
  }

  /* ================= 闯关出题 ================= */
  var quiz = null;
  function startQuiz(gid, ui, mode) {
    syncCare(); if (studyPaused()) return;
    if (gid && (!unitOpen(gid, ui) || !Learning.available(save, gid, ui, mode || 'check'))) return;
    var words;
    if (mode === 'vocab') {
      words = vocabSession ? vocabSession.words : [];
    } else if (mode === 'review') {
      var due = Learning.due(save, Date.now()).slice(0, QUIZ_LEN);
      var catalog = allCourseWords();
      words = due.map(function (w) { return catalog.find(function (x) { return x.w === w; }); }).filter(Boolean);
    } else if (mode === 'wrong') {
      var found = [];
      Object.keys(save.wrong).forEach(function (k) {
        var it = save.wrong[k];
        COURSE_IDS.forEach(function (g) {
          window.DB[g].units.forEach(function (u) {
            u.words.forEach(function (x) { if (x.w === it.word && !found.some(function (v) { return v.w === x.w; })) found.push(x); });
          });
        });
      });
      words = shuffle(found).slice(0, QUIZ_LEN);
    } else {
      var u = window.DB[gid].units[ui];
      words = shuffle(u.words);
    }
    if (!words.length) { toast('没有单词可练'); return; }
    var pool = mode === 'vocab' ? Vocabulary.words : (mode === 'wrong' || mode === 'review') ? allCourseWords() : allWords(gid);
    var qs = [];
    words.forEach(function (w, i) {
      var reviewing = mode === 'review' || mode === 'wrong' || (mode === 'vocab' && vocabSession.mode === 'review');
      var record = (mode === 'vocab' ? save.vocab.records : save.review)[w.w];
      if (reviewing) {
        Learning.planTypes(record, !!w.ex).forEach(function (type) { qs.push(makeQ(w, type, pool)); });
      } else if (mode === 'vocab') {
        ['write', 'listen', 'zh'].forEach(function (type) { qs.push(makeQ(w, type, pool)); });
      } else {
        var type = mode === 'listen' ? 'listen' : mode === 'spell' ? 'write' : mode === 'sentence' ? 'sentence' : ['listen', 'zh', 'sentence'][i % 3];
        qs.push(makeQ(w, type, pool));
        if (mode === 'check') qs.push(makeQ(w, i % 2 ? 'write' : 'dictate', pool));
      }
    });
    // 复测先完成无选项输出，避免前一道词义题直接展示答案。
    if (mode !== 'vocab' || vocabSession.mode === 'review') qs.sort(function (a, b) { return Number(b.type === 'write' || b.type === 'dictate') - Number(a.type === 'write' || a.type === 'dictate'); });
    quiz = { gid: gid, ui: ui, mode: mode || 'check', vocabMode: mode === 'vocab' ? vocabSession.mode : '', qs: qs, idx: 0, right: 0, wrongList: [], outcomes: {}, bySkill: {}, locked: false };
    renderQ();
  }
  function makeQ(w, type, pool) {
    var q = { w: w, type: type };
    if (type === 'write' || type === 'dictate') { q.ans = w.w; return q; }
    var others = sample(pool, 6, [w]);
    var seen = {};
    if (type === 'listen' || type === 'pic' || type === 'sentence') {
      q.opts = [w.w]; q.ans = w.w;
      others.forEach(function (o) { if (q.opts.length < 4 && !seen[o.w] && o.w !== w.w) { seen[o.w] = 1; q.opts.push(o.w); } });
    } else if (type === 'zh') {
      q.opts = [w.zh]; q.ans = w.zh;
      others.forEach(function (o) { if (q.opts.length < 4 && !seen[o.zh] && o.zh !== w.zh) { seen[o.zh] = 1; q.opts.push(o.zh); } });
    }
    if (type === 'sentence') {
      var escaped = w.w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var re = new RegExp('\\b' + escaped + '\\b', 'i');
      q.sentence = re.test(w.ex) ? w.ex.replace(re, '______') : '';
      // 例句可能用复数或时态变化，保留原句做语境理解，不生成错误的填空。
      if (!q.sentence) { q.sentence = w.ex; q.contextMeaning = true; q.opts = [w.zh]; q.ans = w.zh; others.forEach(function (o) { if (q.opts.length < 4 && q.opts.indexOf(o.zh) < 0) q.opts.push(o.zh); }); }
    }
    q.opts = shuffle(q.opts); // 打乱选项，正确答案位置随机
    return q;
  }
  function renderQ() {
    var q = quiz.qs[quiz.idx];
    quiz.locked = false;
    var head =
      '<div class="topbar" style="margin-bottom:8px"><button class="back" id="quitQuiz">✕</button>' +
      '<h2 style="font-size:17px">' + (quiz.mode === 'vocab' ? '积累回忆练习' : quiz.mode === 'wrong' ? '错词复习' : quiz.mode === 'review' ? '到期复习' : '主题练习') + '</h2>' +
      '<span class="coins">💰 ' + save.coins + '</span></div>' +
      '<div class="qbar"><i style="width:' + (quiz.idx / quiz.qs.length * 100) + '%"></i></div>' +
      '<div class="qcount">第 ' + (quiz.idx + 1) + ' / ' + quiz.qs.length + ' 题</div>';
    var body = '';
    if (q.type === 'listen') {
      body = '<div class="qprompt">🎧 听一听，选出你听到的单词</div>' +
        '<div class="replay"><button id="replay">🔊</button></div>';
    } else if (q.type === 'sentence') {
      body = '<div class="qprompt">' + (q.contextMeaning ? '读句子，选择 ' + q.w.w + ' 在句中的意思' : '把单词放进句子中') + '</div><div class="sentence-context">' + q.sentence + '</div><p class="helper">' + (q.contextMeaning ? '结合句子理解词义' : '提示：' + q.w.zh) + ' · 完成后听例句并跟读</p>';
    } else if (q.type === 'pic') {
      body = '<div class="qprompt">👀 看图片，选出对应的单词</div>' +
        '<div class="qbig">' + (q.w.emoji || '🔤') + '</div>';
    } else if (q.type === 'zh') {
      body = '<div class="qprompt">📖 这个单词是什么意思？</div>' +
        '<div class="qwordbox"><div class="qw">' + q.w.w + '</div>' +
        '<div><button class="speaker" id="replay2">🔊 读一读</button></div></div>';
    } else if (q.type === 'write' || q.type === 'dictate') {
      body = '<div class="qprompt">' + (q.type === 'dictate' ? '听音，写出完整英文' : '看词义，独立写出完整英文') + '</div><div class="recall-cue">' + q.w.zh.replace(/[（(][^）)]*[A-Za-z][^）)]*[）)]/g, '') + '</div>' +
        (q.type === 'dictate' ? '<div class="replay"><button id="dictateReplay" aria-label="重听单词">🔊</button></div>' : '') +
        '<p class="helper">没有选项和字母提示。词组保留空格，注意撇号；大小写不扣分。</p>';
    }
    var written = q.type === 'write' || q.type === 'dictate';
    var controls = written ? '<form id="recallForm"><label for="recallInput">你的答案</label><input id="recallInput" class="recall-input" type="text" maxlength="80" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="done"><button class="btn green" id="submitRecall" type="submit">检查答案</button><button class="btn ghost" id="forgetRecall" type="button" style="margin-top:12px">暂时想不起来，学习答案</button></form>' : '<div class="opts">' + q.opts.map(function (o, i) {
      return '<button type="button" class="opt" data-i="' + i + '">' + o + '</button>';
    }).join('') + '</div>';
    app.innerHTML = head + body + controls;
    q.started = Date.now();
    // 绑定
    $('#quitQuiz').onclick = function () {
      var m = quiz && quiz.mode, g = quiz && quiz.gid, quizUnit = quiz && quiz.ui;
      if (m === 'vocab') showVocabulary(); else if (m === 'wrong') showWrong(); else if (m === 'review') showReview(); else if (g) showLesson(g, quizUnit);
    };
    if (q.type === 'listen') { $('#replay').onclick = function () { say(q.w.w, 'words'); }; say(q.w.w, 'words'); }
    if (q.type === 'zh') { $('#replay2').onclick = function () { say(q.w.w, 'words'); }; }
    if (q.type === 'dictate') { $('#dictateReplay').onclick = function () { say(q.w.w, 'words'); }; say(q.w.w, 'words'); }
    if (written) {
      $('#recallForm').onsubmit = function (e) { e.preventDefault(); var input = $('#recallInput'); if (!input.value.trim()) { toast('先写下你的答案，或选择暂时想不起来'); return; } answer(input, q, input.value); };
      $('#forgetRecall').onclick = function () { answer($('#recallInput'), q, ''); };
    }
    $all('.opt').forEach(function (el) {
      el.onclick = function () { answer(el, q); };
    });
  }
  function answer(el, q, typed) {
    syncCare();
    if (studyPaused() || quiz.locked) return;
    quiz.locked = true;
    $('#toast').classList.add('hidden');
    var written = q.type === 'write' || q.type === 'dictate';
    var pick = written ? typed : el.textContent;
    var ok = written ? Learning.spellingCorrect(pick, q.ans) : pick === q.ans;
    var skill = Learning.skillOf(q.type);
    quiz.bySkill[skill] = quiz.bySkill[skill] || { right: 0, total: 0 };
    quiz.bySkill[skill].total++; if (ok) quiz.bySkill[skill].right++;
    var store = quiz.mode === 'vocab' ? { review: save.vocab.records } : save;
    var evidence = Learning.recordAttempt(store, q.w.w, q.type, ok, Date.now());
    evidence.scope = quiz.mode === 'vocab' ? 'vocab' : 'course';
    evidence.elapsed = Math.max(0, Date.now() - q.started);
    save.history.push(evidence); save.history = save.history.slice(-1000);
    if (quiz.mode === 'vocab' && quiz.vocabMode === 'new') { vocabDay(); if (save.vocab.newToday.indexOf(q.w.w) < 0) save.vocab.newToday.push(q.w.w); }
    quiz.outcomes[q.w.w] = quiz.outcomes[q.w.w] !== false && ok;
    if (q.type === 'sentence') say(q.w.ex, 'sent');
    if (ok) {
      el.classList.add('correct'); chime(true); quiz.right++;
    } else {
      el.classList.add('wrong'); chime(false);
      quiz.wrongList.push(q.w.w);
      var key = q.w.w;
      if (quiz.mode !== 'vocab') save.wrong[key] = { word: q.w.w, zh: q.w.zh, emoji: q.w.emoji || '', t: Date.now() };
      persist();
      // 高亮正确项
      $all('.opt').forEach(function (o2) { if (o2.textContent === q.ans) o2.classList.add('correct'); else o2.classList.add('dim'); });
    }
    persist();
    var activeQuiz = quiz;
    function nextQuestion() {
      if (studyPaused() || quiz !== activeQuiz) return;
      quiz.idx++;
      if (quiz.idx >= quiz.qs.length) finishQuiz(); else renderQ();
    }
    if (written) {
      $('#recallInput').disabled = true; $('#submitRecall').disabled = true; $('#forgetRecall').disabled = true;
      var feedback = document.createElement('div'); feedback.className = 'card recall-feedback';
      feedback.innerHTML = '<strong role="status"></strong><p class="correct-word"></p><p class="helper"></p><button class="speaker" id="recallReplay">🔊 听正确发音</button><button class="btn green" id="nextQuestion" style="margin-top:16px">下一题 →</button>';
      $('strong', feedback).textContent = ok ? '独立完成，做得好！' : '这次没记住，一起再看一遍';
      $('.correct-word', feedback).textContent = q.w.w;
      $('.helper', feedback).textContent = ok ? '这次记录已保存；隔一段时间再回想，才能验证是否记牢。' : '正确写法已显示。现在看懂不计为独立掌握，稍后会再次练习。';
      app.appendChild(feedback);
      $('#recallReplay').onclick = function () { say(q.w.w, 'words'); };
      $('#nextQuestion').onclick = nextQuestion;
      feedback.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else if (q.type === 'sentence') {
      var feedback = document.createElement('div');
      feedback.className = 'card sentence-feedback';
      feedback.innerHTML = '<p>' + q.w.ex + '</p><button class="speaker" id="sentenceReplay">🔊 再听例句</button><p class="helper">先听一遍，再跟读一遍。准备好后继续。</p><button class="btn green" id="nextQuestion">下一题 →</button>';
      app.appendChild(feedback);
      $('#sentenceReplay').onclick = function () { say(q.w.ex, 'sent'); };
      $('#nextQuestion').onclick = nextQuestion;
    } else scheduleAdvance(nextQuestion, ok ? 750 : 1400);
  }
  function finishQuiz() {
    var total = quiz.qs.length;
    var passed = quiz.right / total >= 0.8;
    if (quiz.mode === 'check' && quiz.bySkill.spelling) passed = passed && quiz.bySkill.spelling.right / quiz.bySkill.spelling.total >= 0.8;
    var stars = !passed ? 0 : quiz.right === total ? 3 : (quiz.right / total >= 0.9 ? 2 : 1);
    var gained = quiz.right;
    save.coins += gained;
    if (quiz.gid && passed) Learning.mark(save, quiz.gid, quiz.ui, quiz.mode);
    Object.keys(quiz.outcomes).forEach(function (w) {
      if (quiz.mode !== 'vocab' && quiz.outcomes[w] && !Learning.needsWork(save.review[w])) delete save.wrong[w];
    });
    var id = quiz.gid + 'u' + quiz.ui;
    if (quiz.mode === 'check' && passed) save.stars[id] = Math.max(save.stars[id] || 0, stars);
    persist();
    touchStreak();
    var last = quiz; quiz = null;
    showResult(last, stars, gained);
  }
  function showResult(r, stars, gained) {
    if (stars === 3) confetti();
    var starHtml = '<span class="' + (stars >= 1 ? 'on' : '') + '">★</span><span class="' + (stars >= 2 ? 'on' : '') + '">★</span><span class="' + (stars >= 3 ? 'on' : '') + '">★</span>';
    var msg = stars === 3 ? '太棒了，全对！' : (stars ? '已达标，继续下一步！' : '还差一点，巩固后再试试');
    var wrongTip = (r.wrongList && r.wrongList.length) ? (r.mode === 'vocab' ? '薄弱词已安排再次复习，不影响课程进度' : '错词已收进错题本 📕') : '';
    app.innerHTML =
      '<div class="result-card card">' +
      '<div style="font-size:70px">' + (stars === 3 ? '🎉' : '🌟') + '</div>' +
      '<div class="rstars">' + starHtml + '</div>' +
      '<div class="rmsg">' + msg + '</div>' +
      '<div class="rcoins">答对 ' + r.right + '/' + r.qs.length + ' 题 · 获得 💰' + gained + ' 金币</div>' +
      '<div class="rwrong">' + wrongTip + '</div>' +
      '<div class="result-skills">' + Object.keys(r.bySkill).map(function (k) { return '<span>' + Learning.skillNames[k] + ' ' + r.bySkill[k].right + '/' + r.bySkill[k].total + '</span>'; }).join('') + '</div>' +
      '<p class="helper">' + (r.mode === 'check' ? '检测要求：总体及独立拼写正确率都达到 80%。' : '本轮成绩不等于长期掌握，记得回来做延迟复测。') + '</p><button class="btn green" id="again">再练一次 🔁</button>' +
      '<button class="btn ghost" id="backMap" style="margin-top:10px">返回</button></div>';
    $('#again').onclick = function () { startQuiz(r.gid, r.ui, r.mode); };
    $('#backMap').onclick = function () { if (r.mode === 'vocab') showVocabulary(); else if (r.mode === 'wrong') showWrong(); else if (r.mode === 'review') showReview(); else showLesson(r.gid, r.ui); };
  }

  /* ================= 错题本 ================= */
  function showWrong() {
    var keys = Object.keys(save.wrong);
    var rows = keys.map(function (k) {
      var it = save.wrong[k];
      return '<div class="wrong-row"><div class="wemoji">' + (it.emoji || '🔤') + '</div>' +
        '<div><div class="ww">' + it.word + '</div><div class="wzh">' + it.zh + '</div></div>' +
        '<div class="wgrow"></div><button class="speaker" data-say="' + it.word + '">🔊</button>' +
        '<button class="del" data-del="' + k + '">✕</button></div>';
    }).join('');
    var quizBtn = keys.length > 0 ?
      '<button class="btn blue" id="wrongQuiz">复习闯关（' + Math.min(QUIZ_LEN, keys.length) + ' 题）🎯</button>' :
      '<div class="empty">暂时没有需要回练的错词</div>';
    app.innerHTML =
      '<div class="topbar"><button class="back" id="back">←</button><h2>📕 错题本</h2>' +
      '<span class="coins">' + keys.length + ' 词</span></div>' +
      (keys.length ? rows : '<div class="empty"><div class="eicon">🎊</div>太厉害了，还没有错题！</div>') +
      '<div style="margin-top:12px">' + quizBtn + '</div>';
    $('#back').onclick = showHome;
    $all('[data-say]').forEach(function (b) { b.onclick = function () { say(b.getAttribute('data-say'), 'words'); }; });
    $all('[data-del]').forEach(function (b) {
      b.onclick = function () { delete save.wrong[b.getAttribute('data-del')]; persist(); showWrong(); };
    });
    var wq = $('#wrongQuiz');
    if (wq) wq.onclick = function () { startQuiz(null, null, 'wrong'); };
  }

  /* ================= 自然拼读 ================= */
  var phTab = 'course';
  function showPhonics() {
    if (phTab === 'course') { renderPhonicsRoute(); return; }
    var ph = window.DB.phonics;
    var items = ph[phTab].map(function (it, i) {
      var label = phTab === 'letters' ? it.l : it.s;
      var low = phTab === 'letters' ? label.toLowerCase() : label;
      return '<div class="ph-item" data-i="' + i + '"><div class="pl">' + label + ' <span style="color:#8ab">' + low + '</span></div>' +
        '<div class="pz">' + it.words[0] + '</div></div>';
    }).join('');
    app.innerHTML =
      '<div class="topbar"><button class="back" id="back">←</button><h2>🔤 自然拼读</h2></div>' +
      '<button class="btn ghost" id="phRouteBack">← 系统拼读路线</button><div class="tabs"><div class="tab' + (phTab === 'letters' ? ' on' : '') + '" data-t="letters">字母 A-Z</div>' +
      '<div class="tab' + (phTab === 'combos' ? ' on' : '') + '" data-t="combos">字母组合</div></div>' +
      '<p class="helper">字母按钮播放字母名称，例词播放完整单词。名称不等于单词中的发音，请结合例词听辨。</p><div class="ph-grid">' + items + '</div>' +
      '<div id="phDetail"></div>' +
      (phTab === 'letters' ? '<button class="btn blue" id="phQuizBtn" style="margin-top:6px">拼读小测验 🎯（听单词找字母）</button>' : '');
    $('#back').onclick = showHome;
    var pq = $('#phQuizBtn');
    $('#phRouteBack').onclick = function () { phTab = 'course'; showPhonics(); };
    if (pq) pq.onclick = startPhQuiz;
    $all('.tab').forEach(function (t) {
      t.onclick = function () { phTab = t.getAttribute('data-t'); showPhonics(); };
    });
    $all('.ph-item').forEach(function (el) {
      el.onclick = function () { showPhItem(+el.getAttribute('data-i')); };
    });
  }
  function showPhItem(i) {
    var it = window.DB.phonics[phTab][i];
    var label = phTab === 'letters' ? it.l : it.s;
    var box = $('#phDetail');
    var chips = it.words.map(function (w) {
      var em = wordEmoji(w);
      return '<div class="chip" data-w="' + w + '">' + (em ? '<span class="cemo">' + em + '</span>' : '') + w + ' 🔊</div>';
    }).join('');
    box.innerHTML = '<div class="ph-detail card">' +
      '<div class="bigl">' + label + '</div>' +
      '<div class="zh-hint">' + it.zh + '</div>' +
      '<div><button class="btn small blue" id="phSay">🔊 读一读</button></div>' +
      '<div class="chips">' + chips + '</div></div>';
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    $('#phSay').onclick = function () { sayPhonic(it, label); };
    $all('.chip', box).forEach(function (c) {
      c.onclick = function () { say(c.getAttribute('data-w'), 'words'); };
    });
    sayPhonic(it, label);
  }
  function sayPhonic(it, label) {
    if (phTab === 'letters') say(label, 'letters');
    else { // 组合没有单独音频，读第一个例词
      say(it.words[0], 'words');
    }
  }

  var phStageNames = { learn: '① 学规则与合音', listen: '② 听音辨词', spell: '③ 拆音拼写', check: '④ 新词迁移检测' };
  function renderPhonicsRoute() {
    app.innerHTML = '<div class="topbar"><button class="back" id="back">←</button><h2>系统自然拼读</h2></div>' +
      '<div class="card phonics-intro"><span class="eyebrow">从声音走向独立读词</span><h2>听清楚，再拼起来</h2><p>学规则和合音 → 听辨 → 拆音拼写 → 新词迁移。听辨、拼写和迁移检测均至少80%才前进，通过后次日回来复测。</p><p class="helper">本路线独立于教材。音标帮助家长辨音，不要求孩子先背音标。示范按钮播放完整单词，不冒充单独音素录音。跟读由孩子或家长检查，不自动给口语打分。</p></div>' +
      '<div class="ph-route">' + DB.phonics.course.map(function (lesson, i) {
        var r = Phonics.state(save, lesson.id), unlocked = Phonics.open(save, i);
        return '<button class="ph-route-item" data-phlesson="' + i + '"' + (unlocked ? '' : ' disabled') + '><span class="ph-num">' + (r.check ? '✓' : i + 1) + '</span><span><strong>' + lesson.title + '</strong><small>' + (r.check ? (r.due <= Date.now() ? '到期复测' : '本课通过 · 按计划再复测') : unlocked ? '按四步练习' : '先通过上一课') + '</small></span><b>' + (unlocked ? '›' : '🔒') + '</b></button>';
      }).join('') + '</div><button class="btn ghost" id="phReference">字母与组合参考表</button><p class="helper">' + DB.phonics.source.note + '</p><a class="source-link" href="' + DB.phonics.source.url + '" target="_blank" rel="noopener">学习设计参考 ↗</a>';
    $('#back').onclick = showHome;
    $('#phReference').onclick = function () { phTab = 'letters'; showPhonics(); };
    $all('[data-phlesson]').forEach(function (b) { b.onclick = function () { showPhonicsLesson(+b.dataset.phlesson); }; });
  }
  function showPhonicsLesson(i) {
    if (!Phonics.open(save, i)) return;
    var lesson = DB.phonics.course[i], r = Phonics.state(save, lesson.id), seen = {};
    app.innerHTML = '<div class="topbar"><button class="back" id="back">←</button><h2>第' + (i + 1) + '课</h2></div><div class="card"><h2>' + lesson.title + '</h2><p>' + lesson.hint + '</p><div class="ph-sounds">' + lesson.sounds.map(function (s) { return '<span>' + s.replace(':', ' ') + '</span>'; }).join('') + '</div><p class="helper">手指从左向右移动，先尝试发出词中每个音，再连成整词。每个格子显示一个拼写部分，结合本课规则听音、合读。</p>' +
      lesson.models.map(function (m, n) { return '<div class="ph-model"><div class="ph-segments">' + m.parts.map(function (p) { return '<span>' + p + '</span>'; }).join('') + '</div><button class="btn small ghost" data-phdemo="' + n + '">听整词 ' + m.w + ' 🔊</button></div>'; }).join('') +
      '<p class="helper">逐个听示范词，自己合音、连读；听后再点完成。可反复回看本课规则。</p><button class="btn green" id="phLearnDone"' + (r.learn ? '' : ' disabled') + '>完成示范练习</button></div><div class="lesson-stages">' + Phonics.stages.slice(1).map(function (stage) { return '<button class="btn blue ph-stage" data-phstage="' + stage + '"' + (Phonics.ready(save, i, stage) ? '' : ' disabled') + '>' + phStageNames[stage] + (r[stage] ? ' ✓' : '') + '</button>'; }).join('') + '</div>';
    $('#back').onclick = function () { phTab = 'course'; showPhonics(); };
    $all('[data-phdemo]').forEach(function (b) { b.onclick = function () { var n = +b.dataset.phdemo; seen[n] = true; say(lesson.models[n].w, 'phonics'); b.classList.add('heard'); $('#phLearnDone').disabled = Object.keys(seen).length !== lesson.models.length; }; });
    $('#phLearnDone').onclick = function () { Phonics.mark(save, i, 'learn', 1, 1, Date.now()); persist(); showPhonicsLesson(i); };
    $all('[data-phstage]').forEach(function (b) { b.onclick = function () { startPhonicsPractice(i, b.dataset.phstage); }; });
  }
  function startPhonicsPractice(i, stage) {
    syncCare(); if (studyPaused() || !Phonics.ready(save, i, stage)) return;
    var lesson = DB.phonics.course[i], words = stage === 'check' ? lesson.transfer : lesson.practice;
    var pool = stage === 'check' ? lesson.practice.concat(lesson.transfer) : lesson.practice, qs = [];
    words.forEach(function (word) {
      var opts = shuffle([word].concat(sample(pool.filter(function (w) { return w !== word; }), 2)));
      if (stage !== 'listen') qs.push({ type: 'spell', word: word, ans: word });
      if (stage !== 'spell') qs.push({ type: stage === 'check' ? 'read' : 'listen', word: word, opts: opts, ans: word });
    });
    phq = { course: i, stage: stage, qs: qs, idx: 0, right: 0, spellRight: 0, spellTotal: 0, readRight: 0, readTotal: 0, locked: false };
    renderPhonicsPractice();
  }
  function renderPhonicsPractice() {
    var q = phq.qs[phq.idx], writing = q.type === 'spell', reading = q.type === 'read';
    phq.locked = false;
    app.innerHTML = '<div class="topbar"><button class="back" id="phQuit">✕</button><h2>' + phStageNames[phq.stage] + '</h2></div><div class="qcount">' + (phq.idx + 1) + ' / ' + phq.qs.length + '</div><div class="card"><p class="qprompt">' + (writing ? '听完整词，自己拆成声音，再独立拼写' : '听示范词，选出对应拼写') + '</p><button class="btn ghost" id="phReplay">🔊 再听一次</button>' + (writing ? '<form id="phForm"><label for="phInput">独立拼写</label><input id="phInput" class="recall-input" autocomplete="off" autocapitalize="none" spellcheck="false"><button class="btn green" type="submit">提交拼写</button></form>' : '<div class="opts">' + q.opts.map(function (w) { return '<button class="opt" data-phanswer="' + w + '">' + w + '</button>'; }).join('') + '</div>') + '<p id="phFeedback" aria-live="polite"></p></div>';
    $('#phQuit').onclick = function () { showPhonicsLesson(phq.course); };
    if (reading) {
      $('.qprompt').textContent = '先自己拼读这个新词，再听选项，选出相符的读音';
      $('#phReplay').outerHTML = '<div class="ph-read-word">' + q.word + '</div>';
      $('.opts').innerHTML = q.opts.map(function (word, i) { return '<div class="ph-audio-option"><button class="btn ghost" data-phsound="' + word + '">试听 ' + String.fromCharCode(65 + i) + ' 🔊</button><button class="btn blue" data-phanswer="' + word + '">选择 ' + String.fromCharCode(65 + i) + '</button></div>'; }).join('');
      $all('[data-phsound]').forEach(function (b) { b.onclick = function () { say(b.dataset.phsound, 'phonics'); }; });
    }
    if (!reading) $('#phReplay').onclick = function () { say(q.word, 'phonics'); };
    if (writing) $('#phForm').onsubmit = function (e) { e.preventDefault(); answerPhonics($('#phInput').value); };
    else $all('[data-phanswer]').forEach(function (b) { b.onclick = function () { answerPhonics(b.dataset.phanswer); }; });
    if (!reading) say(q.word, 'phonics');
  }
  function answerPhonics(answer) {
    syncCare(); if (studyPaused() || !phq || phq.locked) return;
    var run = phq, q = run.qs[run.idx], correct = Learning.spellingCorrect(answer, q.ans);
    run.locked = true; if (correct) run.right++;
    if (q.type === 'spell') { run.spellTotal++; if (correct) run.spellRight++; }
    if (q.type === 'read') { run.readTotal++; if (correct) run.readRight++; }
    $('#phFeedback').textContent = correct ? '正确，试着再读一遍。' : '正确拼写：' + q.ans + '。听后重新拆音，再合起来读。';
    chime(correct);
    scheduleAdvance(function () {
      if (phq !== run) return;
      if (++run.idx < run.qs.length) { renderPhonicsPractice(); return; }
      var passed = run.right / run.qs.length >= 0.8 && (!run.spellTotal || run.spellRight / run.spellTotal >= 0.8) && (!run.readTotal || run.readRight / run.readTotal >= 0.8);
      if (passed) Phonics.mark(save, run.course, run.stage, run.right, run.qs.length, Date.now());
      persist(); phq = null;
      app.innerHTML = '<div class="result-card card"><h2>' + (passed ? '本步通过' : '再练一轮') + '</h2><p>答对 ' + run.right + ' / ' + run.qs.length + (run.spellTotal ? '，独立拼写 ' + run.spellRight + ' / ' + run.spellTotal : '') + (run.readTotal ? '，读音辨认 ' + run.readRight + ' / ' + run.readTotal : '') + '</p><p class="helper">听辨和拼写是可记录的练习结果，不代表口语发音已被评分。新词读音还请自己或家长检查。</p><button class="btn green" id="phLessonBack">返回本课，继续学习</button></div>';
      $('#phLessonBack').onclick = function () { showPhonicsLesson(run.course); };
    }, correct ? 750 : 1400);
  }

  /* ================= 拼读小测验 ================= */
  var phq = null;
  function startPhQuiz() {
    syncCare(); if (studyPaused()) return;
    var letters = shuffle(window.DB.phonics.letters).slice(0, 6);
    var qs = letters.map(function (it) {
      var word = it.words[0];
      var others = sample(window.DB.phonics.letters.filter(function (o) { return word.toLowerCase().indexOf(o.l.toLowerCase()) < 0; }), 3, [it]).map(function (o) { return o.l; });
      return { it: it, word: word, ans: it.l, opts: shuffle([it.l].concat(others)) };
    });
    phq = { qs: qs, idx: 0, right: 0, locked: false };
    renderPhQ();
  }
  function renderPhQ() {
    var q = phq.qs[phq.idx];
    phq.locked = false;
    app.innerHTML =
      '<div class="topbar" style="margin-bottom:8px"><button class="back" id="quitQuiz">✕</button>' +
      '<h2 style="font-size:17px">🔤 拼读小测验</h2><span class="coins">💰 ' + save.coins + '</span></div>' +
      '<div class="qbar"><i style="width:' + (phq.idx / phq.qs.length * 100) + '%"></i></div>' +
      '<div class="qcount">第 ' + (phq.idx + 1) + ' / ' + phq.qs.length + ' 题</div>' +
      '<div class="qprompt">🎧 听单词，它包含哪个字母？</div>' +
      '<div class="replay"><button id="replay">🔊</button></div>' +
      '<div class="opts">' + q.opts.map(function (o) {
        return '<div class="opt big" data-l="' + o + '">' + o + ' ' + o.toLowerCase() + '</div>';
      }).join('') + '</div>';
    $('#quitQuiz').onclick = showPhonics;
    $('#replay').onclick = function () { say(q.word, 'words'); };
    say(q.word, 'words');
    $all('.opt').forEach(function (el) {
      el.onclick = function () {
        syncCare();
        if (studyPaused() || phq.locked) return;
        phq.locked = true;
        var ok = el.getAttribute('data-l') === q.ans;
        if (ok) { el.classList.add('correct'); chime(true); phq.right++; }
        else {
          el.classList.add('wrong'); chime(false);
          $all('.opt').forEach(function (o2) {
            if (o2.getAttribute('data-l') === q.ans) o2.classList.add('correct'); else o2.classList.add('dim');
          });
        }
        var activePhq = phq;
        scheduleAdvance(function () {
          if (phq !== activePhq) return;
          phq.idx++;
          if (phq.idx >= phq.qs.length) {
            save.coins += phq.right; persist(); touchStreak();
            var right = phq.right; phq = null;
            if (right === 6) confetti();
            app.innerHTML =
              '<div class="result-card card"><div style="font-size:70px">' + (right >= 5 ? '🏆' : '🌟') + '</div>' +
              '<div class="rmsg">答对 ' + right + '/6 题</div>' +
              '<div class="rcoins">获得 💰' + right + ' 金币</div>' +
              '<button class="btn green" id="phAgain">再来一轮 🔁</button>' +
              '<button class="btn ghost" id="phBack" style="margin-top:10px">返回拼读课堂</button></div>';
            $('#phAgain').onclick = startPhQuiz;
            $('#phBack').onclick = showPhonics;
          } else renderPhQ();
        }, ok ? 750 : 1400);
      };
    });
  }

  /* ================= 护眼、前台时长与暂停 ================= */
  var care = null, careTimer = null, careTicks = 0, careSettingsOpen = false, backupOpen = false;
  var pendingAdvance = null, pauseStarted = 0, focusBeforeRest = null;
  function studyPaused() { return document.hidden || careSettingsOpen || backupOpen || !!(care && care.reason(Date.now())); }
  function cancelAdvance() { if (pendingAdvance) clearTimeout(pendingAdvance.id); pendingAdvance = null; }
  function armAdvance() {
    if (!pendingAdvance || pendingAdvance.id !== null) return;
    pendingAdvance.at = Date.now();
    pendingAdvance.id = setTimeout(function () {
      var task = pendingAdvance;
      if (!task) return;
      if (studyPaused()) { pauseStudy(); return; }
      pendingAdvance = null; task.fn();
    }, pendingAdvance.remaining);
  }
  function scheduleAdvance(fn, delay) { cancelAdvance(); pendingAdvance = { fn: fn, remaining: delay, at: Date.now(), id: null }; if (!studyPaused()) armAdvance(); }
  function pauseStudy() {
    if (!pauseStarted) pauseStarted = Date.now();
    if (pendingAdvance && pendingAdvance.id !== null) {
      clearTimeout(pendingAdvance.id);
      pendingAdvance.remaining = Math.max(0, pendingAdvance.remaining - (Date.now() - pendingAdvance.at));
      pendingAdvance.id = null;
    }
    if (currentAudio) currentAudio.pause();
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }
  function resumeStudy() {
    if (pauseStarted && quiz) quiz.qs[quiz.idx].started += Date.now() - pauseStarted;
    pauseStarted = 0; armAdvance();
  }
  function applyReading() {
    document.documentElement.setAttribute('data-theme', save.care.theme);
    document.documentElement.setAttribute('data-font', save.care.font);
  }
  function timeLabel(ms) { var sec = Math.floor(ms / 1000); return Math.floor(sec / 60) + ' 分 ' + sec % 60 + ' 秒'; }
  function renderCareOverlay() {
    var reason = care.reason(Date.now()), overlay = $('#careOverlay');
    if (!reason || careSettingsOpen || backupOpen || document.hidden) {
      if (overlay) { overlay.remove(); app.inert = false; if (focusBeforeRest && document.contains(focusBeforeRest)) focusBeforeRest.focus(); focusBeforeRest = null; }
      return;
    }
    if (!overlay || overlay.getAttribute('data-reason') !== reason) {
      if (overlay) overlay.remove(); else focusBeforeRest = document.activeElement;
      overlay = document.createElement('div'); overlay.id = 'careOverlay'; overlay.setAttribute('data-reason', reason);
      overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-labelledby', 'careTitle');
      overlay.innerHTML = '<div class="card care-dialog"><div class="care-mark">' + (reason === 'rest' ? '◉' : '☾') + '</div><h2 id="careTitle" tabindex="-1">' + (reason === 'rest' ? '休息一下，再继续' : '今天先学到这里') + '</h2><p class="helper">' + (reason === 'rest' ? '离开屏幕，看看远处或走动一下。答题和声音已暂停。' : '已达到家长设置的今日前台使用时长。进度已保存，明天可以继续。') + '</p><div id="careCountdown" class="care-count"></div>' + (reason === 'rest' ? '<button class="btn green" id="careContinue">休息后继续原题</button>' : '') + '<button class="btn ghost" id="careParent" style="margin-top:14px">家长调整设置（退出本轮）</button></div>';
      document.body.appendChild(overlay); app.inert = true; $('#careTitle').focus();
      $('#careParent').onclick = showCareSettings;
      if ($('#careContinue')) $('#careContinue').onclick = function () { if (care.finishRest(Date.now())) { persist(); syncCare(); } };
      overlay.onkeydown = function (event) {
        if (event.key !== 'Tab') return;
        var buttons = $all('button:not(:disabled)', overlay); if (!buttons.length) return;
        var first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      };
    }
    if (reason === 'rest') {
      var left = Math.max(0, Math.ceil((save.care.restUntil - Date.now()) / 1000));
      $('#careCountdown').textContent = left ? left + ' 秒' : '休息完成';
      $('#careContinue').disabled = left > 0;
    } else $('#careCountdown').textContent = timeLabel(save.care.days[Care.dayKey(Date.now())] || 0);
  }
  function syncCare() {
    if (!care) return;
    care.sync(Date.now(), !document.hidden && !careSettingsOpen && !backupOpen);
    if (studyPaused()) pauseStudy(); else resumeStudy();
    renderCareOverlay();
  }
  function startEyeTimer() {
    clearInterval(careTimer);
    care = new Care.Tracker(save.care, Date.now(), !document.hidden);
    applyReading(); syncCare();
    careTimer = setInterval(function () { syncCare(); if (++careTicks % 15 === 0) persist(); }, 1000);
  }
  document.addEventListener('visibilitychange', function () { syncCare(); persist(); });
  window.addEventListener('pagehide', function () { if (care) care.sync(Date.now(), false); pauseStudy(); persist(); });
  window.addEventListener('pageshow', syncCare);
  function leavePractice() { cancelAdvance(); quiz = null; phq = null; }
  function showCareSettings() {
    leavePractice(); careSettingsOpen = true; backupOpen = false; syncCare();
    var s = save.care;
    function options(values, current, suffix) { return values.map(function (v) { return '<option value="' + v + '"' + (v === current ? ' selected' : '') + '>' + (v === 0 ? '不设上限' : v + suffix) + '</option>'; }).join(''); }
    var week = [];
    for (var i = 6; i >= 0; i--) { var d = new Date(); d.setDate(d.getDate() - i); week.push('<div class="usage-row"><span>' + (d.getMonth() + 1) + '/' + d.getDate() + '</span><strong>' + timeLabel(s.days[Care.dayKey(d.getTime())] || 0) + '</strong></div>'); }
    app.innerHTML = '<div class="topbar"><button class="back" id="back" aria-label="返回家长中心">←</button><h2>护眼与使用时长</h2></div><div class="card"><h2>一键设置，轻松开始</h2><p class="helper">首页“一键护眼”同时启用暖纸、大字与休息提醒。关闭时恢复浅色、标准字号并关闭休息提醒；今日时长上限不变。配色只改变显示，不代表能预防近视。</p><button class="btn green" id="carePreset">' + (Care.eyeOn(s) ? '关闭一键护眼方案' : '一键开启护眼方案') + '</button></div><form class="card" id="careForm"><h3>详细设置</h3><label for="careTheme">阅读配色</label><select id="careTheme"><option value="light">浅色</option><option value="warm">暖纸</option><option value="dark">深色</option></select><label for="careFont">字号</label><select id="careFont"><option value="normal">标准</option><option value="large">大字</option></select><label class="check-row"><input type="checkbox" id="careBreak"> 开启定时休息</label><label for="careInterval">连续前台使用多久后提醒</label><select id="careInterval">' + options([5, 10, 15, 20, 30], s.breakMinutes, ' 分钟') + '</select><label for="careRest">每次至少休息</label><select id="careRest">' + options([20, 30, 60], s.restSeconds, ' 秒') + '</select><label for="careLimit">每日前台使用上限</label><select id="careLimit">' + options([0, 15, 30, 45, 60], s.dailyMinutes, ' 分钟') + '</select><p class="helper">默认每日 30 分钟；后台、休息和本设置页不计时。按本机日期统计，重开 App 不会重置当天时长。这是本地使用管理，不是带身份验证的家长锁。</p><button class="btn green" type="submit">保存设置</button></form><div class="card"><h3>近 7 天前台使用</h3>' + week.join('') + '</div>';
    $('#careTheme').value = s.theme; $('#careFont').value = s.font; $('#careBreak').checked = s.breakEnabled;
    $('#carePreset').onclick = function () { Care.toggleEye(s); applyReading(); persist(); showCareSettings(); };
    $('#back').onclick = function () { careSettingsOpen = false; showParent(); syncCare(); };
    $('#careForm').onsubmit = function (event) {
      event.preventDefault(); s.theme = $('#careTheme').value; s.font = $('#careFont').value;
      s.breakEnabled = $('#careBreak').checked; s.breakMinutes = +$('#careInterval').value; s.restSeconds = +$('#careRest').value; s.dailyMinutes = +$('#careLimit').value;
      if (!s.breakEnabled) { s.restUntil = 0; s.sinceBreak = 0; }
      applyReading(); if (!persist()) { toast('保存失败，请先导出进度备份'); return; }
      careSettingsOpen = false; showParent(); syncCare(); toast('设置已保存');
    };
  }

  /* ================= 本地备份与恢复 ================= */
  var restoreCandidate = null;
  function showBackup() {
    leavePractice(); backupOpen = true; careSettingsOpen = false; syncCare();
    var browserFiles = !window.AppUpdate || window.AppUpdate.env() === 'preview';
    app.innerHTML = '<div class="topbar"><button class="back" id="back" aria-label="返回家长中心">←</button><h2>备份与恢复进度</h2></div><div class="card"><h3>保存一份自己的备份</h3><p class="helper">包含课程、词汇积累、作答记录、金币、星星和护眼设置。只生成本地文本，不上传到服务器。请把文本存到你自己的安全位置；换机后可粘贴恢复。</p><button class="btn green" id="makeBackup">生成备份文本</button><label for="backupText">备份文本</label><textarea class="backup-text" id="backupText" readonly></textarea><button class="btn ghost" id="copyBackup">选中并复制</button>' + (browserFiles ? '<button class="btn ghost" id="downloadBackup" style="margin-top:12px">下载 JSON 文件</button>' : '<p class="helper">手机版请复制文本保存；如果自动复制不可用，可以长按文本全选复制。</p>') + '</div><div class="card"><h3>从备份恢复</h3><p class="helper">恢复会覆盖当前进度。先校验并展示摘要，再由你确认；覆盖前会在本机额外保留恢复前的进度。</p><label for="restoreText">粘贴备份文本</label><textarea class="backup-text" id="restoreText" placeholder="在这里粘贴完整备份"></textarea>' + (browserFiles ? '<label for="restoreFile">也可以选择备份 JSON 文件</label><input id="restoreFile" type="file" accept="application/json,.json">' : '') + '<button class="btn blue" id="checkBackup" style="margin-top:16px">校验备份并预览</button><div id="restorePreview" aria-live="polite"></div></div>' + (localStorage.getItem(KEY + '_before_restore') ? '<div class="card"><button class="btn ghost" id="undoRestore">恢复上一次覆盖前的进度</button></div>' : '');
    restoreCandidate = null;
    $('#back').onclick = function () { backupOpen = false; showParent(); syncCare(); };
    function exportText() { syncCare(); var text = Care.encode(save); $('#backupText').value = text; return text; }
    $('#makeBackup').onclick = exportText;
    $('#copyBackup').onclick = function () {
      if (!$('#backupText').value) exportText();
      $('#backupText').focus(); $('#backupText').select(); $('#backupText').setSelectionRange(0, $('#backupText').value.length);
      var copied = false; try { copied = document.execCommand('copy'); } catch (e) { }
      toast(copied ? '已复制，请保存到自己的备份位置' : '文本已选中，请长按并选择复制');
    };
    if ($('#downloadBackup')) $('#downloadBackup').onclick = function () {
      var url = URL.createObjectURL(new Blob([exportText()], { type: 'application/json;charset=utf-8' }));
      var a = document.createElement('a'); a.href = url; a.download = 'EnglishQuest-backup-' + Care.dayKey(Date.now()) + '.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    };
    function preview(text) {
      try {
        restoreCandidate = Care.decode(text, newSave());
        if (!window.DB[restoreCandidate.course.grade].units[restoreCandidate.course.unit]) throw new Error('备份中的课程起点不在当前词库内');
        $('#restorePreview').innerHTML = '<p class="helper"></p><button class="btn green" id="confirmRestore">确认覆盖并恢复</button>';
        $('p', $('#restorePreview')).textContent = '校验通过：' + restoreCandidate.coins + ' 金币，' + Object.keys(restoreCandidate.lessons).length + ' 个学习组/主题有学习记录，' + Object.keys(restoreCandidate.vocab.records).length + ' 个积累词有记录。';
        $('#confirmRestore').onclick = function () { commitRestore(restoreCandidate, false); };
      } catch (e) { restoreCandidate = null; $('#restorePreview').textContent = e.message || '备份无效，现有进度未修改'; }
    }
    $('#restoreText').oninput = function () { restoreCandidate = null; $('#restorePreview').textContent = ''; };
    $('#checkBackup').onclick = function () { preview($('#restoreText').value); };
    if ($('#restoreFile')) $('#restoreFile').onchange = function () {
      var file = this.files[0]; if (!file) return;
      if (file.size > 2000000) { toast('文件过大，请选择本 App 的备份文件'); return; }
      var reader = new FileReader(); reader.onload = function () { $('#restoreText').value = reader.result; preview(reader.result); }; reader.onerror = function () { toast('文件读取失败，现有进度未修改'); }; reader.readAsText(file);
    };
    if ($('#undoRestore')) $('#undoRestore').onclick = function () {
      try { var previous = Care.decode(localStorage.getItem(KEY + '_before_restore'), newSave()); if (confirm('恢复为上一次覆盖前的进度？当前进度会被替换。')) commitRestore(previous, true); }
      catch (e) { toast('恢复前的备份不可用，当前进度未修改'); }
    };
  }
  function commitRestore(data, undo) {
    if (!data) return;
    try {
      if (!undo) localStorage.setItem(KEY + '_before_restore', Care.encode(save));
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) { toast('存储空间不足，未覆盖当前进度；请先导出备份'); return; }
    save = data; restoreCandidate = null;
    if (undo) localStorage.removeItem(KEY + '_before_restore');
    backupOpen = false; careSettingsOpen = false; leavePractice(); resetNavigation(); showHome(); startEyeTimer(); toast('进度已恢复');
  }

  /* ================= 页面历史与横向手势 ================= */
  var navigation = { entries: [], index: -1, replaying: false, moving: false, exitAt: 0, token: Date.now() };
  function navigationBlocked() { return !!$('#careOverlay') || !!$('#updateOverlay'); }
  function capturePage() {
    var entry = navigation.entries[navigation.index];
    if (!entry) return;
    entry.scroll = window.scrollY;
    if (entry.cached) {
      pauseStudy();
      entry.snapshot = { nodes: Array.prototype.slice.call(app.childNodes), quiz: quiz, phq: phq, learn: learn, vocab: vocabSession,
        task: pendingAdvance ? { fn: pendingAdvance.fn, remaining: pendingAdvance.remaining } : null, time: Date.now() };
    }
  }
  function stopPage() {
    pauseStudy(); cancelAdvance(); quiz = null; phq = null; pauseStarted = 0;
    careSettingsOpen = false; backupOpen = false;
  }
  function restorePage(entry) {
    stopPage(); navigation.replaying = true;
    if (entry.snapshot) {
      var snap = entry.snapshot;
      app.replaceChildren.apply(app, snap.nodes);
      quiz = snap.quiz; phq = snap.phq; learn = snap.learn; vocabSession = snap.vocab;
      careSettingsOpen = entry.name === 'care'; backupOpen = entry.name === 'backup';
      if (quiz) quiz.qs[quiz.idx].started += Date.now() - snap.time;
      if (snap.task) scheduleAdvance(snap.task.fn, snap.task.remaining);
    } else entry.render();
    navigation.replaying = false;
    window.scrollTo(0, entry.scroll || 0); syncCare();
  }
  function goPage(delta) {
    if (navigation.moving || navigationBlocked()) return false;
    var next = navigation.index + delta;
    if (next < 0) {
      var now = Date.now();
      if (navigation.exitAt && now - navigation.exitAt < 3000) {
        navigation.exitAt = 0; syncCare(); persist();
        if (window.AndroidBridge && window.AndroidBridge.exitApp) window.AndroidBridge.exitApp();
        else toast(window.AndroidBridge ? '请覆盖安装新版 APK，以启用返回退出' : '网页预览不退出，请关闭浏览器标签页');
      } else { navigation.exitAt = now; toast('已经是第一页，再返回一次退出'); }
      return false;
    }
    if (next >= navigation.entries.length) { toast('没有可前进的页面'); return false; }
    navigation.exitAt = 0; navigation.moving = true; window.history.go(delta); return true;
  }
  function trackPage(name, render, cached) {
    return function () {
      var args = Array.prototype.slice.call(arguments);
      if (args[0] instanceof Event) args = [];
      var key = name + (cached || name === 'result' ? '' : JSON.stringify(args));
      if (navigation.replaying) return render.apply(null, args);
      var current = navigation.entries[navigation.index];
      if (navigation.index > 0 && navigation.entries[navigation.index - 1].key === key && name !== 'result') { goPage(-1); return; }
      navigation.exitAt = 0; capturePage(); stopPage();
      var entry = { name: name, key: key, cached: cached, render: function () { render.apply(null, args); } };
      navigation.replaying = true; entry.render(); navigation.replaying = false;
      var replace = current && (current.key === key || (name === 'result' && current.name === 'quiz'));
      if (replace) navigation.entries[navigation.index] = entry;
      else { navigation.entries = navigation.entries.slice(0, navigation.index + 1); navigation.entries.push(entry); navigation.index++; }
      window.history[replace ? 'replaceState' : 'pushState']({ eqPage: navigation.index, token: navigation.token }, '');
      window.scrollTo(0, 0); syncCare();
    };
  }
  function resetNavigation() {
    navigation.entries = []; navigation.index = -1; navigation.exitAt = 0; navigation.token = Date.now() + Math.random();
    window.history.replaceState({ eqPage: -1, token: navigation.token }, '');
  }
  function initNavigation() {
    window.history.replaceState({ eqPage: -1, token: navigation.token }, '');
    document.addEventListener('visibilitychange', function () { navigation.exitAt = 0; });
    window.AppNav = { back: function () { return goPage(-1); }, forward: function () { return goPage(1); } };
    window.addEventListener('popstate', function (event) {
      var state = event.state;
      if (state && state.token === navigation.token && state.eqPage === navigation.index) { navigation.moving = false; return; }
      if (state && state.token === navigation.token && state.eqPage < 0 && !navigationBlocked()) goPage(-1);
      if (!state || state.token !== navigation.token || state.eqPage < 0 || navigationBlocked()) {
        navigation.moving = true; window.history.go(state && state.token === navigation.token && state.eqPage > navigation.index ? -1 : 1); return;
      }
      navigation.exitAt = 0; capturePage(); navigation.index = state.eqPage;
      restorePage(navigation.entries[navigation.index]); navigation.moving = false;
    });
    showHome = trackPage('home', showHome);
    showMap = trackPage('map', showMap);
    showLesson = trackPage('lesson', showLesson);
    showCourse = trackPage('course', showCourse, true);
    showReview = trackPage('review', showReview);
    showVocabulary = trackPage('vocabulary', showVocabulary);
    showMasteryReport = trackPage('report', showMasteryReport);
    showParent = trackPage('parent', showParent);
    showWrong = trackPage('wrong', showWrong);
    showPhonics = trackPage('phonics', showPhonics);
    showPhonicsLesson = trackPage('phlesson', showPhonicsLesson);
    startPhonicsPractice = trackPage('phpractice', startPhonicsPractice, true);
    showLearn = trackPage('learn', showLearn, true);
    renderVocabCard = trackPage('vocabcard', renderVocabCard, true);
    startQuiz = trackPage('quiz', startQuiz, true);
    startPhQuiz = trackPage('phquiz', startPhQuiz, true);
    showResult = trackPage('result', showResult);
    showCareSettings = trackPage('care', showCareSettings, true);
    showBackup = trackPage('backup', showBackup, true);
    var touch = null;
    app.addEventListener('touchstart', function (event) {
      var t = event.touches[0];
      touch = event.touches.length === 1 && !event.target.closest('input,textarea,select,button,[contenteditable]') ? { x: t.clientX, y: t.clientY, at: Date.now() } : null;
    }, { passive: true });
    app.addEventListener('touchend', function (event) {
      if (!touch || event.touches.length) { touch = null; return; }
      var t = event.changedTouches[0], dx = t.clientX - touch.x, dy = t.clientY - touch.y, elapsed = Date.now() - touch.at;
      touch = null;
      if (elapsed < 900 && Math.abs(dx) >= 80 && Math.abs(dx) > Math.abs(dy) * 1.8) goPage(dx > 0 ? -1 : 1);
    }, { passive: true });
    app.addEventListener('touchcancel', function () { touch = null; }, { passive: true });
  }

  /* ================= 启动 ================= */
  window.addEventListener('error', function (e) { if (window.console) console.error('AppError:', e.message); });
  applyReading();
  initNavigation();
  showHome();
  startEyeTimer();
  // Wi-Fi 自动下载安装并载入；移动网络保留手动入口。
  if (window.AppUpdate) {
    setTimeout(function () {
      var updateBox = null;
      window.AppUpdate.startAuto(function (st) {
        if (st.state === 'uptodate' && updateBox && updateBox.isConnected) {
          updateBox.parentNode.remove();
          updateBox = null;
        }
        if ((st.state === 'waitingwifi' || st.state === 'downloading' || st.state === 'installed') && (!updateBox || !updateBox.isConnected)) {
          var overlay = document.createElement('div');
          overlay.id = 'updateOverlay';
          updateBox = document.createElement('div');
          updateBox.className = 'card update-dialog';
          overlay.appendChild(updateBox);
          document.body.appendChild(overlay);
        }
        if (updateBox && updateBox.isConnected) renderUpdateState(updateBox, st, true);
      });
    }, 3000);
  }
})();
