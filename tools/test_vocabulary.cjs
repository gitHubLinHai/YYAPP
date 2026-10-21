const assert = require('node:assert/strict');
globalThis.window = {};
require('../data/vocabulary.js');
const V = window.Vocabulary;
const fs = require('node:fs'), path = require('node:path');
assert.equal(V.words.filter(w => w.source === 'standard2022-level2').length, 505);
assert.equal(V.words.filter(w => w.source === 'standard2022-supplement').length, 77);
assert.equal(new Set(V.words.map(w => w.w)).size, V.words.length);
for (const w of V.words) {
  assert.ok(w.w && w.zh && /[\u4e00-\u9fff]/.test(w.zh));
  assert.ok([3, 4, 5, 6].includes(w.grade));
  const slug = w.w.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const audio = path.join(__dirname, '../audio/words', slug + '.mp3');
  assert.ok(fs.existsSync(audio) && fs.statSync(audio).size > 500, '缺少内置音频：' + w.w);
}
let previous = [];
for (const g of [3, 4, 5, 6]) {
  const words = V.forGrade(g);
  assert.ok(words.length > previous.length);
  assert.ok(previous.every(w => words.some(v => v.w === w.w)), '高年级应包含此前基础词');
  assert.ok(words.every((w, i) => i === 0 || w.grade >= words[i - 1].grade), '先积累基础词再进阶');
  previous = words;
}
assert.equal(V.forGrade(6).length, 582);
for (const w of ['hello', 'family', 'school', 'one', 'Monday']) assert.ok(V.forGrade(4).some(x => x.w === w));
console.log('积累词库通过：505 课标词目、77 补充词、唯一性、释义完整与三至六年级累计范围。');
