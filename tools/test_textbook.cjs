const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const window = {};
for (const file of ['data/textbook.js', 'js/learning.js', 'js/care.js']) vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), { window });
const book = window.DB.nse3a24;
assert.equal(book.isbn, '978-7-5213-5489-8');
assert.deepEqual(Array.from(book.chapters, c => c.pages), ['2–5', '6–17', '18–29', '30–41', '42–53', '54–65', '66–78']);
assert.equal(book.chapters.length, 7);
assert.equal(book.units.length, 37);
for (const c of book.chapters) {
  const groups = book.units.filter(u => u.chapter === c.number);
  assert.deepEqual(Array.from(groups.flatMap(u => u.words), w => w.w), [...c.words, ...(c.review || [])]);
  for (const u of groups) {
    assert.ok(u.words.length >= 4 && u.words.length <= 6);
    for (const w of u.words) assert.ok(w.zh && w.ex && /^[A-Za-z][A-Za-z '\-/]*$/.test(w.w), w.w);
  }
}
const numberWords = book.units.filter(u => u.chapter === 4).flatMap(u => u.words.map(w => w.w));
for (const n of ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']) assert.ok(numberWords.includes(n));
assert.equal(window.Learning.spellingCorrect('let us', "let's"), true);
assert.equal(window.Learning.spellingCorrect('father', 'dad'), true);

const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      const original = setTimeout;
      window.setTimeout = (fn, ms, ...args) => original(fn, ms === 750 || ms === 1400 ? 5 : ms, ...args);
      window.Audio = function () { this.play = () => Promise.resolve(); this.pause = () => {}; };
    });
    await page.route('**/js/app.js', route => {
      const s = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
      return route.fulfill({ contentType: 'application/javascript', body: s.replace('  initNavigation();', '  window.__bookTest = { state: () => ({save, quiz}), quiz: startQuiz, persist: persist };\n  initNavigation();') });
    });
    await page.goto('http://127.0.0.1:8123');
    assert.match(await page.locator('.course-strip').textContent(), /三年级起点.*2024/);
    await page.screenshot({ path: 'release/textbook-home-preview.png', fullPage: false });
    await page.locator('#routeBtn').click();
    assert.equal(await page.locator('.textbook-chapter').count(), 7);
    assert.equal(await page.locator('.unit').count(), 37);
    assert.equal(await page.locator('.unit.locked').count(), 36);
    await page.screenshot({ path: 'release/textbook-map-preview.png', fullPage: false });
    await page.locator('.unit').first().click();
    assert.match(await page.locator('.textbook-note').textContent(), /2–5页/);
    await page.screenshot({ path: 'release/textbook-lesson-preview.png', fullPage: true });
    await page.locator('[data-stage=learn]').click();
    const count = book.units[0].words.length;
    for (let i = 1; i < count; i++) await page.locator('#nextCard').click();
    await page.locator('#startQuiz').click();
    for (const stage of ['listen', 'spell', 'sentence', 'check']) {
      await page.locator('[data-stage=' + stage + ']').click();
      while (await page.evaluate(() => !!__bookTest.state().quiz)) {
        const q = await page.evaluate(() => { const s = __bookTest.state().quiz; return { index: s.idx, type: s.qs[s.idx].type, ans: s.qs[s.idx].ans }; });
        if (q.type === 'write' || q.type === 'dictate') {
          await page.locator('#recallInput').fill(q.ans); await page.locator('#submitRecall').click();
        } else {
          const opts = await page.locator('.opt').allTextContents();
          await page.locator('.opt').nth(opts.indexOf(q.ans)).click();
        }
        if (await page.locator('#nextQuestion').count()) await page.locator('#nextQuestion').click();
        await page.waitForFunction(i => { const q = __bookTest.state().quiz; return !q || q.idx !== i; }, q.index);
      }
      await page.locator('#backMap').click();
    }
    assert.equal(await page.evaluate(() => __bookTest.state().save.stars.nse3a24u0), 3);
    // 所有学习组都能生成完整的句子题，答题池与单元顺序独立于旧主题。
    const failures = await page.evaluate(() => {
      const out = [], s = __bookTest.state().save;
      DB.nse3a24.units.forEach((u, i) => {
        s.course = { grade: 'nse3a24', unit: i }; s.lessons['nse3a24u' + i] = { learn: true, listen: true, spell: true };
        __bookTest.quiz('nse3a24', i, 'sentence');
        const qs = __bookTest.state().quiz.qs;
        if (qs.length !== u.words.length || qs.some(q => !q.sentence || !q.opts.includes(q.ans))) out.push(i);
      });
      return out;
    });
    assert.deepEqual(failures, []);
    // 单独浏览器上下文模拟尚未升级的旧用户，不让 pagehide 写回覆盖夹具。
    const old = await browser.newPage();
    await old.addInitScript(() => {
      if (!localStorage.getItem('eq_save_v1')) localStorage.setItem('eq_save_v1', JSON.stringify({ coins: 17, stars: {g1u0: 3}, lessons: {g1u0: {check: true}}, course: {grade: 'g3', unit: 2} }));
      window.Audio = function () { this.play = () => Promise.resolve(); this.pause = () => {}; };
    });
    await old.goto('http://127.0.0.1:8123');
    const migrated = await old.evaluate(() => JSON.parse(localStorage.getItem('eq_save_v1')));
    assert.deepEqual(migrated.course, { grade: 'nse3a24', unit: 0 });
    assert.equal(migrated.coins, 17); assert.equal(migrated.stars.g1u0, 3); assert.equal(migrated.lessons.g1u0.check, true);
    assert.equal(migrated.lessons.nse3a24u0, undefined);
    await old.locator('#courseBtn').click();
    await old.locator('#gradeSelect').selectOption('g3'); await old.locator('#unitSelect').selectOption('2');
    await old.locator('#saveCourse').click(); await old.reload();
    assert.match(await old.locator('.course-strip').textContent(), /拓展主题/);
    await old.close();
    await page.reload(); await page.locator('#courseBtn').click();
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, '教材设置溢出 ' + width);
    }
    const audioFailures = await page.evaluate(async () => {
      const files = new Map(), failures = [], context = new AudioContext();
      DB.nse3a24.units.forEach(u => u.words.forEach(w => {
        for (const [kind, text] of [['words', w.w], ['sent', w.ex]]) {
          const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
          files.set(kind + '/' + slug, 'audio/' + kind + '/' + slug + '.mp3');
        }
      }));
      const queue = Array.from(files.values());
      await Promise.all(Array.from({ length: 8 }, async () => {
        while (queue.length) {
          const url = queue.shift();
          try {
            const response = await fetch(url); if (!response.ok) throw new Error('HTTP ' + response.status);
            const audio = await context.decodeAudioData(await response.arrayBuffer());
            if (!audio.duration || audio.duration > 30) throw new Error('invalid duration');
          } catch (e) { failures.push(url + ': ' + e.message); }
        }
      }));
      await context.close(); return failures;
    });
    assert.deepEqual(audioFailures, [], '教材所有词汇与例句音频可解码');
    const backup = await page.evaluate(() => {
      const s = __bookTest.state().save; return Care.decode(Care.encode(s), JSON.parse(JSON.stringify(s)));
    });
    assert.equal(backup.course.grade, 'nse3a24');
    assert.equal(backup.stars.nse3a24u0, 3);
    assert.deepEqual(errors, []);
    console.log('教材同步通过：7个目录项、37个4–6词学习组、完整五步、全组句子题、旧记录迁移隔离、切回拓展、备份兼容及窄屏。');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
