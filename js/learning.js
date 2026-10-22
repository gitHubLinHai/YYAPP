/* 学习路线与复习调度：不依赖界面，可离线使用。 */
(function (root) {
  'use strict';
  var stages = [
    { id: 'learn', title: '认识新朋友', desc: '听单词、看词义，跟读例句', icon: '01' },
    { id: 'listen', title: '听音辨词', desc: '先听声音，再找出对应单词', icon: '02' },
    { id: 'spell', title: '完整拼写', desc: '不看选项，独立写出完整单词', icon: '03' },
    { id: 'sentence', title: '放进句子里', desc: '在例句中选择合适的单词', icon: '04' },
    { id: 'check', title: '单元小检测', desc: '混合练习，正确率达到 80% 后进阶', icon: '05' }
  ];
  var intervals = [1, 3, 7, 14, 30];
  function key(gid, ui) { return gid + 'u' + ui; }
  function progress(save, gid, ui) { return save.lessons[key(gid, ui)] || {}; }
  function available(save, gid, ui, stage) {
    var index = stages.map(function (s) { return s.id; }).indexOf(stage);
    return index >= 0 && (index === 0 || !!progress(save, gid, ui)[stages[index - 1].id]);
  }
  function mark(save, gid, ui, stage) {
    if (!available(save, gid, ui, stage)) return false;
    var id = key(gid, ui);
    save.lessons[id] = save.lessons[id] || {};
    save.lessons[id][stage] = true;
    return true;
  }
  function due(save, now) {
    return Object.keys(save.review).filter(function (w) { return save.review[w].due <= now; })
      .sort(function (a, b) { return save.review[a].due - save.review[b].due; });
  }
  var coreSkills = ['listen', 'meaning', 'spelling'];
  var skillNames = { listen: '听辨', meaning: '词义', spelling: '独立拼写', use: '例句理解' };
  function skillOf(type) {
    return type === 'zh' ? 'meaning' : (type === 'write' || type === 'dictate') ? 'spelling' : type === 'sentence' ? 'use' : type;
  }
  function normal(text) { return String(text).trim().toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' '); }
  function spellingCorrect(input, target) {
    var aliases = {
      'a/an': ['a', 'an'], "let's": ['let us'], dad: ['father'], mum: ['mother', 'mom'], grandpa: ['grandfather'], grandma: ['grandmother'], daddy: ['dad', 'father'], mummy: ['mum', 'mother', 'mom'], colour: ['color'], colourful: ['colorful'], favourite: ['favorite'], maths: ['math', 'mathematics'],
      bike: ['bicycle'], father: ['dad'], mother: ['mum', 'mom'], grandfather: ['grandpa'], grandmother: ['grandma'],
      goodbye: ['bye'], photo: ['photograph'], tv: ['television'], pe: ['physical education']
    };
    var answer = normal(input), word = normal(target);
    return answer === word || (aliases[word] || []).indexOf(answer) >= 0;
  }
  function steady(record) {
    return !!record && !!record.skills && coreSkills.every(function (k) { return record.skills[k] && record.skills[k].level >= 3; });
  }
  function needsWork(record) {
    return !!record && !!record.skills && Object.keys(record.skills).some(function (k) { return record.skills[k].lastOk === false; });
  }
  function recordAttempt(store, word, type, correct, now) {
    var record = store.review[word] || { level: 0, due: now, last: 0 };
    record.skills = record.skills || {};
    var key = skillOf(type), s = record.skills[key] || { level: 0, due: now, last: 0, lastCredit: 0, attempts: 0, right: 0 };
    // 同一轮刚看过答案后，其他题型不能再冒充独立的延迟复测。
    var delayed = !!s.last && now - s.last >= 86400000 && now - record.last >= 86400000;
    s.attempts++; if (correct) s.right++;
    if (!correct) { s.level = 0; s.lastCredit = 0; s.due = now + 600000; }
    else if (!s.lastCredit || now - s.lastCredit >= 86400000) {
      s.level = Math.min(s.level + 1, intervals.length);
      s.lastCredit = now;
      s.due = now + intervals[s.level - 1] * 86400000;
    } else if (s.due <= now) s.due = now + 86400000;
    s.last = now; s.lastOk = correct; s.lastType = type;
    record.skills[key] = s;
    record.last = now;
    record.due = Math.min.apply(null, Object.keys(record.skills).map(function (k) { return record.skills[k].due; }));
    record.level = Math.min.apply(null, coreSkills.map(function (k) { return record.skills[k] ? record.skills[k].level : 0; }));
    store.review[word] = record;
    return { time: now, word: word, type: type, correct: correct, delayed: delayed };
  }
  function planTypes(record, hasExample, now) {
    if (!record || !record.skills) return ['dictate', 'listen', 'zh'];
    var skills = record.skills;
    var ranked = coreSkills.slice().sort(function (a, b) {
      function weight(k) { return skills[k] && skills[k].lastOk === false ? -1 : skills[k] ? skills[k].level : 0; }
      return weight(a) - weight(b);
    });
    var selected = [ranked[0]];
    // 每轮至少一次无选项输出，另练最薄弱的理解技能。
    selected.push(ranked[0] === 'spelling' ? ranked[1] : 'spelling');
    now = now === undefined ? Date.now() : now;
    coreSkills.forEach(function (k) { if ((!skills[k] || skills[k].due <= now) && selected.indexOf(k) < 0) selected.push(k); });
    var types = selected.map(function (k) {
      if (k === 'meaning') return 'zh';
      if (k === 'spelling') return skills.spelling && skills.spelling.lastType === 'dictate' ? 'write' : 'dictate';
      return k;
    }).sort(function (a, b) { return Number(b === 'write' || b === 'dictate') - Number(a === 'write' || a === 'dictate'); });
    if (hasExample && skills.use && skills.use.lastOk === false) types.push('sentence');
    return types;
  }
  root.Learning = { stages: stages, key: key, progress: progress, available: available, mark: mark, due: due,
    coreSkills: coreSkills, skillNames: skillNames, skillOf: skillOf, spellingCorrect: spellingCorrect, steady: steady, needsWork: needsWork, recordAttempt: recordAttempt, planTypes: planTypes };
})(typeof window === 'undefined' ? globalThis : window);
// 独立自然拼读进度；与旧字母小测、教材星星分别记录。
(typeof window === 'undefined' ? globalThis : window).Phonics = (function () {
  'use strict';
  var stages = ['learn', 'listen', 'spell', 'check'];
  function records(save) { return save.phonics.route1 || (save.phonics.route1 = {}); }
  function state(save, id) { return records(save)[id] || {}; }
  function open(save, i) { return i === 0 || !!state(save, DB.phonics.course[i - 1].id).check; }
  function ready(save, i, stage) {
    var n = stages.indexOf(stage);
    return n >= 0 && open(save, i) && (n === 0 || !!state(save, DB.phonics.course[i].id)[stages[n - 1]]);
  }
  function mark(save, i, stage, right, total, now) {
    if (!ready(save, i, stage) || total < 1 || right / total < 0.8) return false;
    var id = DB.phonics.course[i].id, all = records(save), r = all[id] || (all[id] = {});
    r[stage] = true;
    if (stage === 'check' && (!r.lastReview || now - r.lastReview >= 86400000)) {
      r.reviews = (r.reviews || 0) + 1; r.lastReview = now;
      r.due = now + [1, 3, 7, 14, 30][Math.min(r.reviews - 1, 4)] * 86400000;
    }
    return true;
  }
  return { stages: stages, state: state, open: open, ready: ready, mark: mark };
})();
