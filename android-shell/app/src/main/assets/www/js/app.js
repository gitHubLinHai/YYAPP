/* 英语拼读闯关 - 主逻辑
   数据在 data/*.js 中（window.DB），进度存 localStorage */
(function () {
  'use strict';

  var AUDIO_EXT = '.mp3';           // 打包内置音频后缀；若无内置音频会自动回退到系统TTS
  var app = document.getElementById('app');
  var QUIZ_LEN = 10;                // 每关题数

  /* ================= 进度存取 ================= */
  var KEY = 'eq_save_v1';
  var save = { coins: 0, stars: {}, wrong: {}, streak: 0, last: '', phonics: {} };
  try { var raw = localStorage.getItem(KEY); if (raw) { var d = JSON.parse(raw); for (var k in save) if (d[k] !== undefined) save[k] = d[k]; } } catch (e) { }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { } }
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
    try {
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US'; u.rate = 0.8;
      window.speechSynthesis.speak(u);
    } catch (e) { }
  };
  function say(text, kind) {
    kind = kind || 'words';
    var url = 'audio/' + kind + '/' + slug(text) + AUDIO_EXT;
    try {
      var a = new Audio(url);
      a.play().catch(function () { speakFallback(text); });
    } catch (e) { speakFallback(text); }
  }
  var sfxCtx = null;
  function chime(ok) {
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
    ['g1', 'g2', 'g3'].forEach(function (g) {
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
    var gcards = ['g1', 'g2', 'g3'].map(function (gid) {
      var g = window.DB[gid];
      var done = g.units.filter(function (u, i) { return (save.stars[gid + 'u' + i] || 0) > 0; }).length;
      return '<div class="grade-card hl" data-grade="' + gid + '">' +
        '<div class="gicon">' + g.icon + '</div><div class="gname">' + g.title + '</div>' +
        '<div class="gprog">已通过 ' + done + '/' + g.units.length + ' 关</div></div>';
    }).join('');
    app.innerHTML =
      '<div class="hero"><h1>英语拼读闯关</h1><p>外研版新标准 · 一到三年级</p></div>' +
      '<div class="panda-row"><div class="panda">🐼</div>' +
      '<div class="panda-info"><div class="pname">' + pandaTitle() + '</div>' +
      '<div class="gprog">⭐ ' + totalStars() + ' 颗星，继续加油！</div></div></div>' +
      '<div class="stat-row"><div class="stat">💰 金币 ' + save.coins + '</div>' +
      '<div class="stat">⭐ 星星 ' + totalStars() + '</div>' +
      '<div class="stat">🔥 连续打卡 ' + save.streak + ' 天</div></div>' +
      '<div class="grade-grid">' + gcards + '</div>' +
      '<div class="menu-grid">' +
      '<div class="menu-card" data-go="phonics"><div class="micon">🔤</div><div class="mname">自然拼读</div><div class="mdesc">字母发音小课堂</div></div>' +
      '<div class="menu-card" data-go="wrong"><div class="micon">📕</div><div class="mname">错题本</div><div class="mdesc">' + Object.keys(save.wrong).length + ' 个词要复习</div></div>' +
      '</div>' +
      '<div style="text-align:center;margin-top:16px"><button class="btn small ghost" id="parentBtn">👑 家长中心</button></div>';
    $all('.grade-card').forEach(function (el) {
      el.onclick = function () { showMap(el.getAttribute('data-grade')); };
    });
    $('[data-go=phonics]').onclick = function () { showPhonics(); };
    $('[data-go=wrong]').onclick = function () { showWrong(); };
    $('#parentBtn').onclick = function () { showParent(); };
  }

  /* ================= 家长中心 ================= */
  function showParent() {
    var rows = ['g1', 'g2', 'g3'].map(function (gid) {
      var g = window.DB[gid];
      var stars = g.units.map(function (u, i) {
        var st = save.stars[gid + 'u' + i] || 0;
        return '<span class="rp-star' + (st ? ' on' : '') + '">' + (st ? '★'.repeat(st) : '·') + '</span>';
      }).join('');
      return '<div class="rp-row"><div class="rp-g">' + g.icon + g.title + '</div><div class="rp-stars">' + stars + '</div></div>';
    }).join('');
    var doneCnt = 0, totalUnits = 0;
    ['g1', 'g2', 'g3'].forEach(function (gid) {
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
      '<div class="card"><div class="rp-title">🔄 版本与更新</div>' +
      '<div class="rp-note">当前版本：' + (window.AppUpdate ? window.AppUpdate.version() : '未知') +
      (window.AppUpdate && window.AppUpdate.inApp() ? '' : '<br>（网页预览不支持在线更新，手机上可用）') + '</div>' +
      '<button class="btn blue" id="checkUpd">检查更新</button>' +
      '<div id="updBox" style="margin-top:10px"></div></div>' +
      '<div class="card"><div class="rp-title">⚠️ 危险操作</div>' +
      '<button class="btn ghost" id="resetBtn">清空所有进度（重置）</button></div>';
    $('#back').onclick = showHome;
    $('#resetBtn').onclick = function () {
      if (confirm('确定要清空所有闯关进度、金币和错题本吗？')) { save = { coins: 0, stars: {}, wrong: {}, streak: 0, last: '', phonics: {} }; persist(); toast('已重置'); showParent(); }
    };
    $('#checkUpd').onclick = function () {
      var box = $('#updBox');
      window.AppUpdate.check(false, function (st) {
        if (st.state === 'uptodate') { toast('已是最新版本 v' + st.version); }
        else if (st.state === 'nopreview') { toast('网页预览不支持，请在手机App里检查'); }
        else if (st.state === 'error') { toast(st.msg || '检查失败，请检查网络'); }
        else if (st.state === 'found') {
          box.innerHTML = '<div class="upd-found">发现新版本 v' + st.version + '<br><span style="font-size:13px;color:#888">' + st.notes + '</span></div>' +
            '<button class="btn green" id="doUpd">立即更新</button>';
          $('#doUpd').onclick = function () { st.go(); };
        } else if (st.state === 'downloading') {
          box.innerHTML = '<div class="qbar"><i style="width:' + Math.round(st.progress * 100) + '%"></i></div>' +
            '<div style="text-align:center;font-size:13px;color:#888">下载中 ' + Math.round(st.progress * 100) + '%</div>';
        } else if (st.state === 'installed') {
          box.innerHTML = '<div class="upd-found">✅ 更新完成！</div><button class="btn green" id="restartApp">重启应用生效</button>';
          $('#restartApp').onclick = function () { plus.runtime.restart(); };
        }
      });
    };
  }

  /* ================= 渲染：关卡地图 ================= */
  function showMap(gid) {
    var g = window.DB[gid];
    var rows = g.units.map(function (u, i) {
      var id = gid + 'u' + i;
      var st = save.stars[id] || 0;
      var locked = i > 0 && (save.stars[gid + 'u' + (i - 1)] || 0) < 1;
      var stars = '<span class="' + (st >= 1 ? 'on' : '') + '">★</span><span class="' + (st >= 2 ? 'on' : '') + '">★</span><span class="' + (st >= 3 ? 'on' : '') + '">★</span>';
      return '<div class="unit' + (locked ? ' locked' : '') + '" data-u="' + i + '">' +
        '<div class="uicon">' + (locked ? '🔒' : u.icon) + '</div>' +
        '<div class="uinfo"><div class="utitle">' + (i + 1) + '. ' + u.title + '</div>' +
        '<div class="uen">' + u.en + ' · ' + u.words.length + '词</div>' +
        '<div class="ustars">' + stars + '</div></div>' +
        (locked ? '<div class="lock">🔒</div>' : '<div class="go">▶</div>') + '</div>';
    }).join('');
    app.innerHTML =
      '<div class="topbar"><button class="back" id="back">←</button><h2>' + g.icon + ' ' + g.title + '</h2>' +
      '<span class="coins">💰 ' + save.coins + '</span></div>' +
      '<div class="unit-grid">' + rows + '</div>';
    $('#back').onclick = showHome;
    $all('.unit').forEach(function (el) {
      el.onclick = function () {
        var i = +el.getAttribute('data-u');
        if (i > 0 && (save.stars[gid + 'u' + (i - 1)] || 0) < 1) { toast('先拿到上一关的星星才能解锁哦～'); return; }
        showLearn(gid, i);
      };
    });
  }

  /* ================= 渲染：学词卡片 ================= */
  var learn = null;
  function showLearn(gid, ui) {
    var g = window.DB[gid], u = g.units[ui];
    learn = { gid: gid, ui: ui, idx: 0 };
    app.innerHTML =
      '<div class="topbar"><button class="back" id="back">←</button><h2>' + u.icon + ' ' + u.title + '</h2>' +
      '<span class="coins">💰 ' + save.coins + '</span></div>' +
      '<div class="flashcard" id="card"></div>' +
      '<div class="dots" id="dots"></div>' +
      '<div class="nav-row"><button class="nav-btn" id="prev">‹</button>' +
      '<button class="btn green" id="nextCard" style="flex:1">下一个 ▶</button>' +
      '<button class="nav-btn" id="skip">🎯</button></div>' +
      '<button class="btn blue" id="startQuiz" style="margin-top:12px">开始闯关！</button>';
    $('#back').onclick = function () { showMap(gid); };
    $('#prev').onclick = function () { moveCard(-1); };
    $('#nextCard').onclick = function () { moveCard(1); };
    $('#skip').onclick = function () { startQuiz(gid, ui); };
    $('#startQuiz').onclick = function () { startQuiz(gid, ui); };
    renderCard();
  }
  function renderCard() {
    var u = window.DB[learn.gid].units[learn.ui];
    var w = u.words[learn.idx];
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
    $('#nextCard').textContent = last ? '去闯关 🎯' : '下一个 ▶';
    $all('.speaker', $('#card')).forEach(function (b) {
      b.onclick = function (e) { e.stopPropagation(); say(w.ex, 'sent'); };
    });
    $('#card').onclick = function () { say(w.w, 'words'); };
    say(w.w, 'words');
  }
  function moveCard(d) {
    var u = window.DB[learn.gid].units[learn.ui];
    var n = learn.idx + d;
    if (n >= u.words.length) { startQuiz(learn.gid, learn.ui); return; }
    if (n < 0) return;
    learn.idx = n; renderCard();
  }

  /* ================= 闯关出题 ================= */
  var quiz = null;
  function startQuiz(gid, ui, mode) {
    var words;
    if (mode === 'wrong') {
      var found = [];
      Object.keys(save.wrong).forEach(function (k) {
        var it = save.wrong[k];
        ['g1', 'g2', 'g3'].forEach(function (g) {
          window.DB[g].units.forEach(function (u) {
            u.words.forEach(function (x) { if (x.w === it.word && found.indexOf(x) < 0) found.push(x); });
          });
        });
      });
      words = shuffle(found).slice(0, QUIZ_LEN);
    } else {
      var u = window.DB[gid].units[ui];
      words = shuffle(u.words).slice(0, QUIZ_LEN);
    }
    if (!words.length) { toast('没有单词可练'); return; }
    var pool = mode === 'wrong' ? [].concat(allWords('g1'), allWords('g2'), allWords('g3')) : allWords(gid);
    var qs = [];
    var typeRound = 0;
    while (qs.length < QUIZ_LEN) {
      var roundWords = shuffle(words);
      for (var i = 0; i < roundWords.length && qs.length < QUIZ_LEN; i++) {
        var w = roundWords[i];
        var types = ['listen', 'zh'];
        if (w.emoji) types.push('pic');
        if (/^[a-zA-Z][a-zA-Z'\- ]*$/.test(w.w) && w.w.replace(/[^a-zA-Z]/g, '').length >= 3) types.push('spell');
        var t = types[(typeRound + i) % types.length];
        qs.push(makeQ(w, t, pool));
      }
      typeRound++;
      if (typeRound > 6) break;
    }
    quiz = { gid: gid, ui: ui, mode: mode || 'unit', qs: qs, idx: 0, right: 0, wrongList: [], locked: false };
    renderQ();
  }
  function makeQ(w, type, pool) {
    var q = { w: w, type: type };
    var others = sample(pool, 6, [w]);
    var seen = {};
    if (type === 'listen' || type === 'pic') {
      q.opts = [w.w]; q.ans = w.w;
      others.forEach(function (o) { if (q.opts.length < 4 && !seen[o.w] && o.w !== w.w) { seen[o.w] = 1; q.opts.push(o.w); } });
    } else if (type === 'zh') {
      q.opts = [w.zh]; q.ans = w.zh;
      others.forEach(function (o) { if (q.opts.length < 4 && !seen[o.zh] && o.zh !== w.zh) { seen[o.zh] = 1; q.opts.push(o.zh); } });
    } else { // spell：挖掉一个字母
      var letters = w.w.replace(/[^a-zA-Z]/g, '');
      var pos = Math.floor(Math.random() * letters.length);
      q.blank = pos; q.ans = letters[pos].toLowerCase();
      var parts = w.w.split('');
      var rawIdx = -1, bi = -1;
      for (var i2 = 0; i2 < parts.length; i2++) {
        if (/[a-zA-Z]/.test(parts[i2])) { rawIdx++; if (rawIdx === pos) { bi = i2; break; } }
      }
      q.missingChar = parts[bi];
      parts[bi] = '_';
      q.display = parts.join('');
      var al = 'abcdefghijklmnopqrstuvwxyz';
      var opts = [q.ans]; var guard = 0;
      while (opts.length < 4 && guard++ < 60) {
        var c = al[Math.floor(Math.random() * 26)];
        if (opts.indexOf(c) < 0) opts.push(c);
      }
      q.opts = shuffle(opts);
    }
    if (q.type !== 'spell') q.opts = shuffle(q.opts); // 打乱选项，正确答案位置随机
    return q;
  }
  function renderQ() {
    var q = quiz.qs[quiz.idx];
    quiz.locked = false;
    var head =
      '<div class="topbar" style="margin-bottom:8px"><button class="back" id="quitQuiz">✕</button>' +
      '<h2 style="font-size:17px">' + (quiz.mode === 'wrong' ? '📕 错词复习' : '🎯 闯关中') + '</h2>' +
      '<span class="coins">💰 ' + save.coins + '</span></div>' +
      '<div class="qbar"><i style="width:' + (quiz.idx / quiz.qs.length * 100) + '%"></i></div>' +
      '<div class="qcount">第 ' + (quiz.idx + 1) + ' / ' + quiz.qs.length + ' 题</div>';
    var body = '';
    if (q.type === 'listen') {
      body = '<div class="qprompt">🎧 听一听，选出你听到的单词</div>' +
        '<div class="replay"><button id="replay">🔊</button></div>';
    } else if (q.type === 'pic') {
      body = '<div class="qprompt">👀 看图片，选出对应的单词</div>' +
        '<div class="qbig">' + (q.w.emoji || '🔤') + '</div>';
    } else if (q.type === 'zh') {
      body = '<div class="qprompt">📖 这个单词是什么意思？</div>' +
        '<div class="qwordbox"><div class="qw">' + q.w.w + '</div>' +
        '<div><button class="speaker" id="replay2">🔊 读一读</button></div></div>';
    } else {
      body = '<div class="qprompt">✏️ 哪个字母能拼好这个单词？</div>' +
        '<div class="qbig">' + (q.w.emoji || '🔤') + '</div>' +
        '<div class="qwordbox"><div class="qzh">' + q.w.zh + '</div></div>' +
        '<div class="qspell">' + q.display.replace('_', '<b>_</b>') + '</div>' +
        '<div style="text-align:center"><button class="speaker" id="replay3">🔊 听单词</button></div>';
    }
    var optsHtml = q.opts.map(function (o, i) {
      return '<div class="opt' + (q.type === 'spell' ? ' big' : '') + '" data-i="' + i + '">' + o + '</div>';
    }).join('');
    app.innerHTML = head + body + '<div class="opts">' + optsHtml + '</div>';
    // 绑定
    $('#quitQuiz').onclick = function () {
      var m = quiz && quiz.mode, g = quiz && quiz.gid;
      quiz = null;
      if (m === 'wrong') showWrong(); else if (g) showMap(g);
    };
    if (q.type === 'listen') { $('#replay').onclick = function () { say(q.w.w, 'words'); }; say(q.w.w, 'words'); }
    if (q.type === 'zh') { $('#replay2').onclick = function () { say(q.w.w, 'words'); }; }
    if (q.type === 'spell') { $('#replay3').onclick = function () { say(q.w.w, 'words'); }; }
    $all('.opt').forEach(function (el) {
      el.onclick = function () { answer(el, q); };
    });
  }
  function answer(el, q) {
    if (quiz.locked) return;
    quiz.locked = true;
    var pick = q.type === 'spell' ? el.textContent : el.textContent;
    var ok = (pick === q.ans) || (q.type === 'spell' && pick.toLowerCase() === q.ans);
    if (ok) {
      el.classList.add('correct'); chime(true); quiz.right++;
    } else {
      el.classList.add('wrong'); chime(false);
      var key = q.w.w;
      save.wrong[key] = { word: q.w.w, zh: q.w.zh, emoji: q.w.emoji || '', t: Date.now() };
      persist();
      // 高亮正确项
      $all('.opt').forEach(function (o2) { if (o2.textContent === q.ans) o2.classList.add('correct'); else o2.classList.add('dim'); });
    }
    setTimeout(function () {
      quiz.idx++;
      if (quiz.idx >= quiz.qs.length) finishQuiz(); else renderQ();
    }, ok ? 750 : 1400);
  }
  function finishQuiz() {
    var total = quiz.qs.length;
    var wrongCnt = total - quiz.right;
    var stars = wrongCnt <= 1 ? 3 : (wrongCnt <= 3 ? 2 : 1);
    var gained = quiz.right;
    save.coins += gained;
    var isUnit = quiz.mode === 'unit';
    var id = quiz.gid + 'u' + quiz.ui;
    if (isUnit) save.stars[id] = Math.max(save.stars[id] || 0, stars);
    persist();
    touchStreak();
    var last = quiz; quiz = null;
    showResult(last, stars, gained, isUnit);
  }
  function showResult(r, stars, gained, isUnit) {
    if (stars === 3) confetti();
    var starHtml = '<span class="' + (stars >= 1 ? 'on' : '') + '">★</span><span class="' + (stars >= 2 ? 'on' : '') + '">★</span><span class="' + (stars >= 3 ? 'on' : '') + '">★</span>';
    var msg = stars === 3 ? '太棒了，全对！' : (stars === 2 ? '很棒，继续加油！' : '过关啦，再练一次拿满星！');
    var wrongTip = (r.wrongList && r.wrongList.length) ? '错词已收进错题本 📕' : '';
    app.innerHTML =
      '<div class="result-card card">' +
      '<div style="font-size:70px">' + (stars === 3 ? '🎉' : '🌟') + '</div>' +
      '<div class="rstars">' + starHtml + '</div>' +
      '<div class="rmsg">' + msg + '</div>' +
      '<div class="rcoins">答对 ' + r.right + '/' + r.qs.length + ' 题 · 获得 💰' + gained + ' 金币</div>' +
      '<div class="rwrong">' + wrongTip + '</div>' +
      '<button class="btn green" id="again">再来一次 🔁</button>' +
      '<button class="btn ghost" id="backMap" style="margin-top:10px">返回</button></div>';
    $('#again').onclick = function () { if (r.mode === 'wrong') startQuiz(r.gid, r.ui, 'wrong'); else { showLearn(r.gid, r.ui); } };
    $('#backMap').onclick = function () { if (r.mode === 'wrong') showWrong(); else showMap(r.gid); };
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
    var quizBtn = keys.length >= 4 ?
      '<button class="btn blue" id="wrongQuiz">复习闯关（' + Math.min(QUIZ_LEN, keys.length) + ' 题）🎯</button>' :
      '<div class="empty">错题攒到 4 个就能开启复习闯关啦</div>';
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
  var phTab = 'letters';
  function showPhonics() {
    var ph = window.DB.phonics;
    var items = ph[phTab].map(function (it, i) {
      var label = phTab === 'letters' ? it.l : it.s;
      var low = phTab === 'letters' ? label.toLowerCase() : label;
      return '<div class="ph-item" data-i="' + i + '"><div class="pl">' + label + ' <span style="color:#8ab">' + low + '</span></div>' +
        '<div class="pz">' + it.words[0] + '</div></div>';
    }).join('');
    app.innerHTML =
      '<div class="topbar"><button class="back" id="back">←</button><h2>🔤 自然拼读</h2></div>' +
      '<div class="tabs"><div class="tab' + (phTab === 'letters' ? ' on' : '') + '" data-t="letters">字母 A-Z</div>' +
      '<div class="tab' + (phTab === 'combos' ? ' on' : '') + '" data-t="combos">字母组合</div></div>' +
      '<div class="ph-grid">' + items + '</div>' +
      '<div id="phDetail"></div>' +
      (phTab === 'letters' ? '<button class="btn blue" id="phQuizBtn" style="margin-top:6px">拼读小测验 🎯（听音选字母）</button>' : '');
    $('#back').onclick = showHome;
    var pq = $('#phQuizBtn');
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

  /* ================= 拼读小测验 ================= */
  var phq = null;
  function startPhQuiz() {
    var letters = shuffle(window.DB.phonics.letters).slice(0, 6);
    var qs = letters.map(function (it) {
      var word = it.words[Math.floor(Math.random() * it.words.length)];
      var others = sample(window.DB.phonics.letters, 3, [it]).map(function (o) { return o.l; });
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
      '<div class="qprompt">🎧 听单词，它开头的字母是？</div>' +
      '<div class="replay"><button id="replay">🔊</button></div>' +
      '<div class="opts">' + q.opts.map(function (o) {
        return '<div class="opt big" data-l="' + o + '">' + o + ' ' + o.toLowerCase() + '</div>';
      }).join('') + '</div>';
    $('#quitQuiz').onclick = function () { phq = null; showPhonics(); };
    $('#replay').onclick = function () { say(q.word, 'words'); };
    say(q.word, 'words');
    $all('.opt').forEach(function (el) {
      el.onclick = function () {
        if (phq.locked) return;
        phq.locked = true;
        var ok = el.getAttribute('data-l') === q.ans;
        if (ok) { el.classList.add('correct'); chime(true); phq.right++; }
        else {
          el.classList.add('wrong'); chime(false);
          $all('.opt').forEach(function (o2) {
            if (o2.getAttribute('data-l') === q.ans) o2.classList.add('correct'); else o2.classList.add('dim');
          });
        }
        setTimeout(function () {
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

  /* ================= 护眼提醒（每20分钟休息20秒） ================= */
  var eyeTimer = null;
  function startEyeTimer() {
    clearTimeout(eyeTimer);
    eyeTimer = setTimeout(showEyeRest, 20 * 60 * 1000);
  }
  function showEyeRest() {
    var left = 20;
    var ov = document.createElement('div');
    ov.id = 'eyeOverlay';
    ov.innerHTML = '<div class="eye-card"><div style="font-size:60px">👀</div>' +
      '<div class="eye-title">小眼睛，休息一下～</div>' +
      '<div class="eye-sub">看看窗外最远的地方，数到 20</div>' +
      '<div class="eye-count" id="eyeCount">20</div></div>';
    document.body.appendChild(ov);
    var iv = setInterval(function () {
      left--;
      var el = $('#eyeCount');
      if (el) el.textContent = left;
      if (left <= 0) { clearInterval(iv); ov.remove(); startEyeTimer(); }
    }, 1000);
  }

  /* ================= 启动 ================= */
  window.addEventListener('error', function (e) { if (window.console) console.error('AppError:', e.message); });
  showHome();
  startEyeTimer();
  // 启动后静默检查热更新（有新版本才弹提示）
  if (window.AppUpdate) {
    setTimeout(function () {
      window.AppUpdate.check(true, function (st) {
        if (st.state === 'found' && !$('#eyeOverlay')) {
          var ov = document.createElement('div');
          ov.id = 'eyeOverlay';
          ov.innerHTML = '<div class="eye-card"><div style="font-size:56px">🎉</div>' +
            '<div class="eye-title">发现新版本 v' + st.version + '</div>' +
            '<div class="eye-sub">' + (st.notes || '') + '</div>' +
            '<button class="btn green" id="updNow" style="width:auto;padding:11px 30px;margin-top:14px">立即更新</button>' +
            '<div style="margin-top:10px"><span class="eye-skip" id="updLater">稍后再说</span></div></div>';
          document.body.appendChild(ov);
          $('#updNow').onclick = function () { st.go(); };
          $('#updLater').onclick = function () { ov.remove(); };
        }
      });
    }, 3000);
  }
})();
