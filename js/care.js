/* 前台计时与备份校验；不依赖 DOM。配色设置不代表医疗护眼效果。 */
(function (root) {
  'use strict';
  function defaults() { return { theme: 'light', font: 'normal', breakEnabled: true, breakMinutes: 20, restSeconds: 20, dailyMinutes: 30, days: {}, sinceBreak: 0, lastSeen: 0, restUntil: 0 }; }
  function eyeOn(state) { return state.theme === 'warm' && state.font === 'large' && state.breakEnabled; }
  function toggleEye(state) {
    var enabled = !eyeOn(state);
    state.theme = enabled ? 'warm' : 'light'; state.font = enabled ? 'large' : 'normal'; state.breakEnabled = enabled;
    state.sinceBreak = 0; state.restUntil = 0;
    return enabled;
  }
  function dayKey(time) { var d = new Date(time); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function Tracker(state, now, visible) {
    this.state = state; this.last = now; this.active = visible;
    if (!state.restUntil && now - state.lastSeen >= state.restSeconds * 1000) state.sinceBreak = 0;
  }
  Tracker.prototype.reason = function (now) {
    var s = this.state;
    if (s.dailyMinutes && (s.days[dayKey(now)] || 0) >= s.dailyMinutes * 60000) return 'daily';
    if (s.restUntil) return 'rest';
    return '';
  };
  Tracker.prototype.sync = function (now, visible) {
    var s = this.state, delta = Math.min(5000, Math.max(0, now - this.last));
    // 长时间没有心跳按挂起处理，不把锁屏或系统休眠整段计入。
    if (this.active && !this.reason(this.last)) {
      var from = now - delta;
      while (from < now) {
        var end = new Date(from); end.setHours(24, 0, 0, 0);
        var until = Math.min(now, end.getTime()), key = dayKey(from);
        s.days[key] = (s.days[key] || 0) + until - from;
        from = until;
      }
      s.sinceBreak += delta;
      s.lastSeen = now;
    }
    if (visible && !this.active && !s.restUntil && now - s.lastSeen >= s.restSeconds * 1000) s.sinceBreak = 0;
    this.last = now; this.active = visible;
    if (s.breakEnabled && !s.restUntil && s.sinceBreak >= s.breakMinutes * 60000) s.restUntil = now + s.restSeconds * 1000;
    var keys = Object.keys(s.days).sort(function (a, b) { return new Date(b).getTime() - new Date(a).getTime(); });
    keys.slice(30).forEach(function (key) { delete s.days[key]; });
    return this.reason(now);
  };
  Tracker.prototype.finishRest = function (now) {
    if (!this.state.restUntil || now < this.state.restUntil) return false;
    this.state.restUntil = 0; this.state.sinceBreak = 0; this.last = now;
    return true;
  };
  function object(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
  function number(x) { return typeof x === 'number' && isFinite(x) && x >= 0 && x <= 1e15; }
  function word(x) { return typeof x === 'string' && /^[A-Za-z][A-Za-z '\-/]*$/.test(x) && x.length <= 80; }
  function check(ok) { if (!ok) throw new Error('备份格式或内容不符合当前 App 要求，未修改现有进度。'); }
  function safeTree(value, depth) {
    check(depth <= 10);
    if (typeof value === 'number') check(number(value));
    else if (typeof value === 'string') check(value.length <= 2000 && !/[<>]/.test(value));
    else if (value && typeof value === 'object') Object.keys(value).forEach(function (key) {
      check(['__proto__', 'prototype', 'constructor'].indexOf(key) < 0);
      safeTree(value[key], depth + 1);
    });
  }
  function records(map) {
    check(object(map) && Object.keys(map).length <= 3000);
    Object.keys(map).forEach(function (key) {
      var r = map[key]; check(word(key) && object(r) && number(r.level) && r.level <= 5 && number(r.due) && number(r.last));
      if (r.skills !== undefined) {
        check(object(r.skills));
        Object.keys(r.skills).forEach(function (skill) {
          check(['listen', 'meaning', 'spelling', 'use'].indexOf(skill) >= 0);
          var s = r.skills[skill];
          check(object(s) && number(s.level) && s.level <= 5 && number(s.due) && number(s.last) && number(s.lastCredit) && number(s.attempts) && number(s.right) && s.right <= s.attempts && typeof s.lastOk === 'boolean');
        });
      }
    });
  }
  function validCare(s) {
    check(object(s) && ['light', 'warm', 'dark'].indexOf(s.theme) >= 0 && ['normal', 'large'].indexOf(s.font) >= 0 && typeof s.breakEnabled === 'boolean');
    check([5, 10, 15, 20, 30].indexOf(s.breakMinutes) >= 0 && [20, 30, 60].indexOf(s.restSeconds) >= 0 && [0, 15, 30, 45, 60].indexOf(s.dailyMinutes) >= 0);
    check(object(s.days) && number(s.sinceBreak) && number(s.lastSeen) && number(s.restUntil));
    Object.keys(s.days).forEach(function (key) { check(/^\d{4}-\d{1,2}-\d{1,2}$/.test(key) && number(s.days[key]) && s.days[key] <= 86400000); });
  }
  function encode(data) { return JSON.stringify({ app: 'EnglishQuest', format: 1, exportedAt: new Date().toISOString(), data: data }); }
  function decode(text, base) {
    check(typeof text === 'string' && text.length <= 2000000);
    var envelope = JSON.parse(text); check(envelope.app === 'EnglishQuest' && envelope.format === 1 && object(envelope.data));
    var d = envelope.data; safeTree(d, 0);
    check(number(d.coins) && number(d.streak) && typeof d.last === 'string' && object(d.stars) && object(d.wrong) && object(d.phonics));
    Object.keys(d.stars).forEach(function (key) { check(/^g[123]u\d+$/.test(key) && Number.isInteger(d.stars[key]) && d.stars[key] <= 3); });
    Object.keys(d.wrong).forEach(function (key) { var w = d.wrong[key]; check(word(key) && object(w) && w.word === key && typeof w.zh === 'string'); });
    if (d.lessons !== undefined) {
      check(object(d.lessons));
      Object.keys(d.lessons).forEach(function (key) { check(/^g[123]u\d+$/.test(key) && object(d.lessons[key])); Object.keys(d.lessons[key]).forEach(function (stage) { check(['learn', 'listen', 'spell', 'sentence', 'check'].indexOf(stage) >= 0 && typeof d.lessons[key][stage] === 'boolean'); }); });
    }
    if (d.review !== undefined) records(d.review);
    if (d.course !== undefined) check(object(d.course) && ['g1', 'g2', 'g3'].indexOf(d.course.grade) >= 0 && Number.isInteger(d.course.unit) && d.course.unit >= 0);
    if (d.vocab !== undefined) {
      check(object(d.vocab) && [3, 4, 5, 6].indexOf(d.vocab.grade) >= 0 && typeof d.vocab.day === 'string' && Array.isArray(d.vocab.newToday) && d.vocab.newToday.length <= 5 && d.vocab.newToday.every(word));
      records(d.vocab.records);
    }
    if (d.history !== undefined) {
      check(Array.isArray(d.history) && d.history.length <= 1000);
      d.history.forEach(function (h) { check(object(h) && number(h.time) && word(h.word) && ['listen', 'zh', 'write', 'dictate', 'sentence'].indexOf(h.type) >= 0 && typeof h.correct === 'boolean' && typeof h.delayed === 'boolean' && ['course', 'vocab'].indexOf(h.scope) >= 0); });
    }
    if (d.care !== undefined) validCare(d.care);
    Object.keys(base).forEach(function (key) { if (d[key] !== undefined) base[key] = d[key]; });
    return base;
  }
  root.Care = { defaults: defaults, eyeOn: eyeOn, toggleEye: toggleEye, dayKey: dayKey, Tracker: Tracker, encode: encode, decode: decode };
})(typeof window === 'undefined' ? globalThis : window);
