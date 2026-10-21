const assert = require('node:assert/strict');
require('../js/learning.js');
const L = globalThis.Learning;
const save = { lessons: {}, review: {} };
assert.equal(L.mark(save, 'g1', 0, 'check'), false, '不能跳过前置学习');
for (const stage of L.stages) {
  assert.equal(L.available(save, 'g1', 0, stage.id), true);
  assert.equal(L.mark(save, 'g1', 0, stage.id), true);
}
assert.equal(L.progress(save, 'g1', 0).check, true);
assert.deepEqual(L.progress(save, 'g1', 1), {}, '主题进度独立');
let now = new Date(2026, 9, 21, 10).getTime();
L.recordAttempt(save, 'hello', 'listen', true, now);
assert.equal(save.review.hello.due, now + 86400000);
L.recordAttempt(save, 'hello', 'listen', true, now + 1000);
assert.equal(save.review.hello.skills.listen.level, 1, '同一天不能重复刷高掌握等级');
assert.deepEqual(L.due(save, now), []);
now += 86400000;
assert.deepEqual(L.due(save, now), ['hello']);
L.recordAttempt(save, 'hello', 'listen', true, now);
assert.equal(save.review.hello.due, now + 3 * 86400000);
L.recordAttempt(save, 'hello', 'listen', false, now + 1000);
assert.equal(save.review.hello.skills.listen.level, 0);
assert.deepEqual(L.due(save, now + 601000), ['hello']);
L.recordAttempt(save, 'hello', 'listen', true, now + 602000);
assert.equal(save.review.hello.skills.listen.level, 1, '纠错后的首次独立答对仍只是初学等级');
assert.equal(save.review.hello.due, now + 602000 + 86400000, '同日纠错成功后不应一直重复显示到期');
now = save.review.hello.due;
for (const days of [3, 7, 14, 30, 30]) {
  L.recordAttempt(save, 'hello', 'listen', true, now);
  assert.equal(save.review.hello.due, now + days * 86400000);
  now = save.review.hello.due;
}
console.log('学习路线、前置条件、复习间隔、同日去重与错题重置：通过');
