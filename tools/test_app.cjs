/* 先启动 python -m http.server 8123；通过 NODE_PATH 提供 playwright。 */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = 'http://127.0.0.1:8123';
(async function () {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      const original = window.setTimeout;
      window.setTimeout = (fn, ms, ...args) => original(fn, ms === 750 || ms === 1400 ? 5 : ms, ...args);
      window.Audio = function () { this.play = () => Promise.resolve(); this.pause = () => {}; };
    });
    // 只在测试响应中开放状态检查，不向生产文件添加调试接口。
    await page.route('**/js/app.js', route => {
      const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
      route.fulfill({ contentType: 'application/javascript', body: source.replace(/  showHome\(\);\r?\n  startEyeTimer\(\);/, '  if (!sessionStorage.getItem("legacyTestStarted")) { save.course = { grade: "g1", unit: 0 }; persist(); sessionStorage.setItem("legacyTestStarted", "yes"); }\n  window.__test = { state: function () { return { quiz: quiz, save: save, phq: phq }; }, quiz: startQuiz, fixture: function (data) { save = newSave(); save.course = { grade: "g1", unit: 0 }; for (var k in save) if (data[k] !== undefined) save[k] = data[k]; persist(); } };\n  showHome();\n  startEyeTimer();') });
    });
    await page.goto(base);
    await page.locator('#continueBtn').waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: process.env.APP_SCREENSHOT || 'release/learning-home-preview.png', fullPage: true });
    await page.locator('#continueBtn').click();
    assert.equal(await page.locator('.stage:disabled').count(), 4);
    await page.locator('[data-stage=learn]').click();
    assert.equal(await page.locator('#startQuiz').isDisabled(), true);
    const count = await page.evaluate(() => DB.g1.units[0].words.length);
    for (let i = 1; i < count; i++) await page.locator('#nextCard').click();
    assert.equal(await page.locator('#startQuiz').isEnabled(), true);
    await page.locator('#startQuiz').click();
    assert.equal(await page.locator('.stage:disabled').count(), 3);
    async function completeQuiz(correct) {
      while (await page.evaluate(() => !!__test.state().quiz)) {
        const state = await page.evaluate(() => { const q = __test.state().quiz; return { index: q.idx, total: q.qs.length, answer: q.qs[q.idx].ans, type: q.qs[q.idx].type }; });
        const shouldBeCorrect = typeof correct === 'function' ? correct(state) : correct;
        if (state.type === 'write' || state.type === 'dictate') {
          assert.equal(await page.locator('.opt').count(), 0, '完整拼写不能提供选项');
          await page.locator('#recallInput').fill(shouldBeCorrect ? state.answer : 'incorrect-answer');
          await page.locator('#submitRecall').click();
        } else {
          const options = await page.locator('.opt').allTextContents();
          const pick = options.findIndex(o => shouldBeCorrect ? o === state.answer : o !== state.answer);
          await page.locator('.opt').nth(pick).click();
        }
        if (await page.locator('#nextQuestion').count()) await page.locator('#nextQuestion').click();
        await page.waitForFunction(index => { const q = __test.state().quiz; return !q || q.idx !== index; }, state.index);
      }
    }
    await page.locator('[data-stage=listen]').click();
    assert.equal(await page.evaluate(() => __test.state().quiz.qs.length), count);
    await completeQuiz(false);
    assert.match(await page.locator('.rmsg').textContent(), /还差一点/);
    assert.equal(await page.evaluate(() => !!__test.state().save.lessons.g1u0.listen), false);
    assert.equal(await page.evaluate(() => Object.keys(__test.state().save.wrong).length), count);
    await page.locator('#backMap').click();
    for (const stage of ['listen', 'spell', 'sentence', 'check']) {
      await page.locator('[data-stage=' + stage + ']').click();
      assert.equal(await page.evaluate(() => __test.state().quiz.qs.length), stage === 'check' ? count * 2 : count);
      if (stage === 'sentence') assert.equal(await page.locator('.sentence-context').count(), 1);
      await completeQuiz(true);
      await page.locator('#backMap').click();
    }
    assert.equal(await page.evaluate(() => __test.state().save.lessons.g1u0.check), true);
    assert.equal(await page.evaluate(() => __test.state().save.stars.g1u0), 3);
    await page.reload();
    await page.locator('#continueBtn').click();
    assert.match(await page.locator('.topbar h2').textContent(), /我的身体/);
    await page.locator('#back').click();
    assert.equal(await page.locator('.unit.locked').count(), 6);
    // 全部主题的句子练习都能出题，且答案存在于候选项中。
    const dataChecks = await page.evaluate(() => {
      const failures = [];
      for (const gid of ['g1', 'g2', 'g3']) DB[gid].units.forEach((u, i) => {
        const s = __test.state().save;
        s.course = { grade: gid, unit: i };
        s.lessons[Learning.key(gid, i)] = { learn: true, listen: true, spell: true };
        __test.quiz(gid, i, 'sentence');
        const qs = __test.state().quiz.qs;
        if (qs.length !== u.words.length || qs.some(q => q.type !== 'sentence' || !q.sentence || !q.opts.includes(q.ans))) failures.push(gid + ':' + i);
      });
      return failures;
    });
    assert.deepEqual(dataChecks, []);
    // 回答后立即退出，不应被旧计时器带回答题页。
    await page.evaluate(() => __test.quiz('g3', DB.g3.units.length - 1, 'listen'));
    await page.locator('.opt').first().click();
    await page.locator('#quitQuiz').click();
    await page.waitForTimeout(100);
    assert.equal(await page.locator('.stage-list').count(), 1);
    // 旧存档兼容、课程设置和多尺寸无溢出。
    await page.evaluate(() => __test.fixture({ coins: 17, stars: { g1u0: 2 }, wrong: {}, streak: 2, last: '', phonics: {} }));
    await page.reload();
    assert.equal(await page.evaluate(() => __test.state().save.coins), 17);
    assert.equal(await page.evaluate(() => __test.state().save.stars.g1u0), 2);
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, '首页溢出：' + width);
    }
    await page.locator('#courseBtn').click();
    await page.locator('#gradeSelect').selectOption('g3');
    await page.locator('#unitSelect').selectOption('4');
    await page.locator('#saveCourse').click();
    await page.reload();
    assert.deepEqual(await page.evaluate(() => __test.state().save.course), { grade: 'g3', unit: 4 });
    await page.locator('#reviewBtn').click();
    assert.match(await page.locator('#app').textContent(), /暂时没有到期/);
    // 检测全错时不能得星或解锁；旧错词只有 1 个时也能回练。
    await page.evaluate(() => {
      __test.fixture({ lessons: { g1u0: { learn: true, listen: true, spell: true, sentence: true } }, wrong: { hello: { word: 'hello', zh: '你好' } } });
    });
    await page.reload();
    await page.locator('#continueBtn').click();
    await page.locator('[data-stage=check]').click();
    await completeQuiz(false);
    assert.equal(await page.evaluate(() => __test.state().save.stars.g1u0 || 0), 0);
    assert.equal(await page.evaluate(() => !!__test.state().save.lessons.g1u0.check), false);
    await page.locator('#backMap').click();
    await page.locator('#back').click();
    assert.equal(await page.locator('.unit.locked').count(), 7);
    await page.locator('.unit[data-u="0"]').click();
    await page.locator('[data-stage=check]').click();
    assert.ok(await page.evaluate(() => __test.state().quiz.qs.slice(0, 2).every(q => q.type === 'write' || q.type === 'dictate')));
    await completeQuiz(state => state.index >= 2);
    assert.ok(await page.evaluate(() => { const s = __test.state().save; return !s.stars.g1u0 && !s.lessons.g1u0.check; }), '总分 16/18 但拼写 7/9 时不能解锁');
    await page.evaluate(() => __test.fixture({ wrong: { hello: { word: 'hello', zh: '你好' } }, review: { hello: { level: 0, due: 1, last: 0 } } }));
    await page.reload();
    await page.locator('#reviewBtn').click();
    await page.locator('#reviewStart').click();
    await completeQuiz(true);
    assert.equal(await page.evaluate(() => Object.keys(__test.state().save.wrong).length), 0);
    assert.equal(await page.evaluate(() => __test.state().save.review.hello.due > Date.now()), true);
    await page.locator('#backMap').click();
    assert.match(await page.locator('#app').textContent(), /暂时没有到期/);
    await page.locator('#back').click();
    await page.locator('#phonicsBtn').click();
    await page.locator('#phQuizBtn').click();
    for (let i = 0; i < 6; i++) {
      const q = await page.evaluate(() => __test.state().phq.qs[__test.state().phq.idx]);
      assert.equal(q.word.toLowerCase().includes(q.ans.toLowerCase()), true);
      assert.equal(q.opts.filter(o => q.word.toLowerCase().includes(o.toLowerCase())).length, 1, '字母题只能有一个正确选项');
      await page.locator('[data-l="' + q.ans + '"]').click();
      await page.waitForFunction(index => { const q = __test.state().phq; return !q || q.idx !== index; }, i);
    }
    assert.match(await page.locator('.rmsg').textContent(), /6\/6/);
    await page.goto(base + '/test.html');
    await page.locator('#continueBtn').waitFor();
    assert.deepEqual(await page.evaluate(() => window._errs), []);
    await page.locator('#parentBtn').click();
    assert.match(await page.locator('#app').textContent(), /版本与更新/);
    await page.locator('#checkUpd').click();
    assert.match(await page.locator('#updBox').textContent(), /网页预览不支持/);
    await page.locator('#back').click();
    const courseBefore = await page.evaluate(() => JSON.stringify({ lessons: __test.state().save.lessons, stars: __test.state().save.stars, wrong: __test.state().save.wrong, review: __test.state().save.review }));
    await page.locator('#vocabBtn').click();
    assert.equal(await page.locator('.vocab-word').count(), 40);
    await page.locator('#vocabSearch').fill('苹果');
    assert.equal(await page.locator('.vocab-word').count(), 1);
    await page.locator('#vocabSearch').fill('');
    await page.locator('[data-vgrade="6"]').click();
    assert.match(await page.locator('.vocab-summary h2').textContent(), /582/);
    await page.locator('[data-vgrade="3"]').click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'release/vocabulary-preview.png', fullPage: false });
    await page.locator('#vocabNew').click();
    for (let i = 0; i < 5; i++) await page.locator('#vocabNext').click();
    assert.equal(await page.evaluate(() => __test.state().quiz.qs.length), 15);
    await completeQuiz(true);
    assert.equal(await page.evaluate(() => Object.keys(__test.state().save.vocab.records).length), 5);
    assert.equal(await page.evaluate(() => __test.state().save.vocab.newToday.length), 5);
    const courseAfter = await page.evaluate(() => JSON.stringify({ lessons: __test.state().save.lessons, stars: __test.state().save.stars, wrong: __test.state().save.wrong, review: __test.state().save.review }));
    assert.equal(courseAfter, courseBefore, '独立积累不改变课程进度、星星、错词或复习记录');
    await page.locator('#backMap').click();
    assert.equal(await page.locator('#vocabNew').isDisabled(), true);
    assert.equal(await page.locator('.vocab-stats strong').nth(1).textContent(), '0', '同日练习不计入稳固掌握');
    await page.locator('[data-vgrade="6"]').click();
    assert.equal(await page.locator('#vocabNew').isDisabled(), true, '切换年级不能绕过每日新词上限');
    await page.reload();
    await page.locator('#vocabBtn').click();
    assert.equal(await page.locator('[data-vgrade="6"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => Object.keys(__test.state().save.vocab.records).length), 5);
    await page.evaluate(() => {
      const save = JSON.parse(localStorage.getItem('eq_save_v1'));
      save.vocab.day = 'yesterday';
      const r = save.vocab.records[Object.keys(save.vocab.records)[0]];
      r.due = 1; r.last = 2;
      __test.fixture(save);
    });
    await page.reload();
    await page.locator('#vocabBtn').click();
    assert.equal(await page.locator('#vocabNew').isEnabled(), true, '跨日恢复新词额度');
    await page.locator('#vocabReview').click();
    assert.ok(await page.evaluate(() => __test.state().quiz.qs.some(q => q.type === 'dictate')));
    await completeQuiz(true);
    await page.locator('#backMap').click();
    assert.equal(await page.locator('#vocabReview').isDisabled(), true);
    await page.locator('#vocabNew').click();
    for (let i = 0; i < 5; i++) await page.locator('#vocabNext').click();
    await completeQuiz(false);
    assert.equal(await page.evaluate(() => __test.state().save.vocab.newToday.length), 5);
    assert.equal(await page.evaluate(() => Object.keys(__test.state().save.wrong).length), 0, '积累薄弱词不混入课程错词');
    await page.locator('#backMap').click();
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, '积累页溢出：' + width);
    }
    await page.locator('#vocabReportBtn').click();
    assert.match(await page.locator('#app').textContent(), /各项能力的练习表现/);
    assert.equal(await page.locator('.vocab-stats strong').nth(1).textContent(), '0', '同日练习不能冒充延迟复测');
    assert.equal(await page.locator('.vocab-stats strong').nth(2).textContent(), '—');
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, '掌握报告溢出：' + width);
    }
    await page.evaluate(() => {
      const store = { review: {} }, past = Date.now() - 2 * 86400000;
      for (const type of ['listen', 'zh', 'write']) Learning.recordAttempt(store, 'apple', type, true, past);
      __test.fixture({ vocab: { grade: 3, day: '', newToday: [], records: store.review } });
    });
    await page.reload();
    await page.locator('#vocabBtn').click();
    await page.locator('#vocabReview').click();
    assert.equal(await page.locator('#recallInput').count(), 1, '复测必须先做无选项输出');
    assert.equal(await page.locator('.opt').count(), 0);
    const beforeEmpty = await page.evaluate(() => __test.state().save.history.length);
    await page.locator('#submitRecall').click();
    assert.equal(await page.evaluate(() => __test.state().save.history.length), beforeEmpty, '空白提交不生成成绩');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => document.getElementById('toast').classList.contains('hidden'));
    await page.screenshot({ path: 'release/recall-preview.png', fullPage: false });
    await completeQuiz(true);
    await page.locator('#backMap').click();
    await page.locator('#vocabReportBtn').click();
    assert.equal(await page.locator('.vocab-stats strong').nth(1).textContent(), '1', '同一词随后已受提示的题目不能重复算延迟复测');
    assert.equal(await page.locator('.vocab-stats strong').nth(2).textContent(), '100%');
    await page.screenshot({ path: 'release/mastery-report-preview.png', fullPage: true });
    await page.locator('#reportScope').selectOption('course');
    assert.equal(await page.locator('.vocab-stats strong').first().textContent(), '0', '课程报告不能混入积累记录');
    await page.locator('#back').click();
    await page.locator('#masteryReportBtn').click();
    assert.equal(await page.locator('.vocab-stats strong').first().textContent(), '3');
    // 旧等级只保留历史，不自动变成新的分项掌握。
    await page.evaluate(() => __test.fixture({ vocab: { grade: 3, records: { apple: { level: 5, due: 1, last: 1 } }, day: '', newToday: [] } }));
    await page.reload();
    await page.locator('#vocabBtn').click();
    assert.equal(await page.locator('.vocab-stats strong').nth(1).textContent(), '0');
    await page.locator('#vocabReview').click();
    await page.locator('#forgetRecall').click();
    assert.equal(await page.locator('.correct-word').textContent(), 'apple');
    assert.equal(await page.evaluate(() => __test.state().save.history.at(-1).correct), false);
    await page.locator('#quitQuiz').click();
    await page.reload();
    assert.equal(await page.evaluate(() => __test.state().save.vocab.records.apple.skills.spelling.lastOk), false, '中途退出仍保存真实作答');

    // 模拟已安装的安卓桥接，走真实更新界面及重载入口。
    const phone = await browser.newPage();
    phone.on('pageerror', e => errors.push(e.message));
    await phone.addInitScript(() => {
      const original = window.setTimeout;
      window.setTimeout = (fn, ms, ...args) => ms === 3000 ? 0 : original(fn, ms, ...args);
      window.nativeCalls = [];
      window.AndroidBridge = {
        versionInfo: () => JSON.stringify({ name: '1.0.2', code: 102 }),
        startCheck: () => nativeCalls.push('check'),
        applyUpdate: () => nativeCalls.push('apply')
      };
    });
    await phone.goto(base);
    await phone.locator('#parentBtn').click();
    assert.match(await phone.locator('#app').textContent(), /1\.0\.2/);
    await phone.locator('#checkUpd').click();
    await phone.evaluate(() => __updCb({ state: 'found', version: '1.0.3', notes: '更新测试' }));
    await phone.locator('#doUpd').click();
    assert.match(await phone.locator('#updBox').textContent(), /下载并安装/);
    await phone.evaluate(() => __updCb({ state: 'error', msg: '网络暂不可用' }));
    assert.match(await phone.locator('#updBox').textContent(), /网络暂不可用/);
    await phone.locator('#checkUpd').click();
    await phone.evaluate(() => __updCb({ state: 'found', version: '1.0.3', notes: '更新测试' }));
    await phone.locator('#doUpd').click();
    await phone.evaluate(() => __updCb({ state: 'done', version: '1.0.3' }));
    await phone.locator('#continueBtn').waitFor();
    await phone.close();

    const startup = await browser.newPage();
    startup.on('pageerror', e => errors.push(e.message));
    await startup.addInitScript(() => {
      const original = window.setTimeout;
      window.setTimeout = (fn, ms, ...args) => original(fn, ms === 3000 ? 10 : ms, ...args);
      window.wifiDownload = 0;
      window.AndroidBridge = { versionInfo: () => '{"name":"1.0.2"}', networkType: () => 'wifi', startCheck: () => {}, applyUpdate: () => {}, applyWifiUpdate: () => { window.wifiDownload++; } };
    });
    await startup.goto(base);
    await startup.waitForFunction(() => typeof window.__updCb === 'function');
    await startup.evaluate(() => __updCb({ state: 'found', version: '1.0.3' }));
    assert.equal(await startup.evaluate(() => window.wifiDownload), 1, 'Wi-Fi 自动下载不需要点击');
    assert.match(await startup.locator('#updateOverlay').textContent(), /下载并安装/);
    await startup.evaluate(() => __updCb({ state: 'done', version: '1.0.3' }));
    await startup.locator('#continueBtn').waitFor();
    await startup.close();
    const audioFailures = await page.evaluate(async () => {
      const context = new AudioContext();
      const failures = [];
      const queue = Vocabulary.words.slice();
      async function worker() {
        while (queue.length) {
          const word = queue.shift().w;
          const slug = word.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
          try {
            const response = await fetch('audio/words/' + slug + '.mp3');
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const buffer = await context.decodeAudioData(await response.arrayBuffer());
            if (buffer.duration <= 0 || buffer.duration > 30) throw new Error('异常音频时长');
          } catch (e) { failures.push(word + ': ' + e.message); }
        }
      }
      await Promise.all(Array.from({ length: 8 }, worker));
      await context.close();
      return failures;
    });
    assert.deepEqual(audioFailures, [], '全部积累词的内置音频必须能解码');
    assert.deepEqual(errors, []);
    console.log('浏览器验证通过：学习路线、独立积累与复习、每日额度、存档兼容、自动及手动更新、原生重载、4 种宽度与 582 词音频解码。');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
