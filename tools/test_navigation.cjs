const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      window.exitCalls = 0;
      window.AndroidBridge = { exitApp: () => { window.exitCalls++; } };
      window.Audio = function () { this.play = () => Promise.resolve(); this.pause = () => {}; };
    });
    await page.route('**/js/app.js*', route => {
      const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
      return route.fulfill({ contentType: 'application/javascript', body: source.replace('  initNavigation();', '  window.__navTest = { state: () => ({ quiz, phq, save, navigation, pendingAdvance }), quiz: startQuiz, sync: syncCare };\n  initNavigation();') });
    });
    await page.goto('http://127.0.0.1:8123');
    async function swipe(dx, dy = 0, selector = '#app') {
      await page.locator(selector).evaluate((el, { dx, dy }) => {
        const start = new Touch({ identifier: 1, target: el, clientX: 150, clientY: 200 });
        const end = new Touch({ identifier: 1, target: el, clientX: 150 + dx, clientY: 200 + dy });
        el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [start] }));
        el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [end] }));
      }, { dx, dy });
      await page.waitForTimeout(100);
    }
    await page.locator('#parentBtn').click();
    await page.locator('#careSettingsBtn').click();
    await page.locator('#careTheme').selectOption('dark');
    await swipe(120);
    await page.locator('#careSettingsBtn').waitFor();
    await swipe(-120);
    await page.locator('#careTheme').waitFor();
    assert.equal(await page.locator('#careTheme').inputValue(), 'dark', '前进保留未保存表单');
    await swipe(120, 180);
    assert.equal(await page.locator('#careTheme').count(), 1, '纵向滚动不导航');
    await swipe(120, 0, '#careTheme');
    assert.equal(await page.locator('#careTheme').count(), 1, '表单手势不导航');
    await page.evaluate(() => AppNav.back());
    await page.locator('#careSettingsBtn').waitFor();
    await page.goBack();
    await page.locator('#continueBtn').waitFor();
    await page.evaluate(() => AppNav.back());
    assert.match(await page.locator('#toast').textContent(), /已经是第一页/);
    assert.equal(await page.evaluate(() => exitCalls), 0, '首次返回只提醒');
    await page.evaluate(() => { __navTest.state().navigation.exitAt -= 4000; AppNav.back(); });
    assert.equal(await page.evaluate(() => exitCalls), 0, '超时重新提醒');
    await page.goBack();
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => exitCalls), 1, '浏览器返回和应用返回共享二次确认');
    assert.equal(await page.locator('#continueBtn').count(), 1, '测试替身保留页面');
    assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('eq_save_v1')).care), '退出前保存进度');
    await page.evaluate(() => AppNav.back());
    await page.evaluate(() => AppNav.forward());
    await page.locator('#careSettingsBtn').waitFor();
    await page.locator('#back').click();
    await page.locator('#continueBtn').waitFor();
    await swipe(120);
    assert.equal(await page.evaluate(() => exitCalls), 1, '进入其他页后确认状态重置');
    await swipe(120);
    assert.equal(await page.evaluate(() => exitCalls), 2, '页面右滑也支持二次返回退出');
    await page.locator('#vocabBtn').click();
    const key = await page.evaluate(() => __navTest.state().navigation.entries[__navTest.state().navigation.index].name);
    assert.equal(key, 'vocabulary');
    assert.equal(await page.evaluate(() => AppNav.forward()), false, '新分支清除旧前进记录');
    await page.locator('#vocabNew').click();
    for (let i = 0; i < 5; i++) await page.locator('#vocabNext').click();
    await page.locator('#recallInput').fill('unfinished');
    await swipe(120);
    await page.locator('#vocabNext').waitFor();
    await swipe(-120);
    await page.locator('#recallInput').waitFor();
    assert.equal(await page.locator('#recallInput').inputValue(), 'unfinished', '前进恢复原题输入');
    assert.equal(await page.evaluate(() => __navTest.state().save.history.length), 0, '导航不产生作答或奖励');
    await page.locator('#forgetRecall').click();
    const before = await page.evaluate(() => ({ records: __navTest.state().save.history.length, coins: __navTest.state().save.coins }));
    await swipe(120); await page.locator('#vocabNext').waitFor();
    await swipe(-120); await page.locator('#nextQuestion').waitFor();
    assert.equal(await page.locator('#recallInput').isDisabled(), true, '返回再前进不解锁已作答题');
    assert.deepEqual(await page.evaluate(() => ({ records: __navTest.state().save.history.length, coins: __navTest.state().save.coins })), before);
    await page.locator('#nextQuestion').click();
    const index = await page.evaluate(() => __navTest.state().quiz.idx);
    await page.locator('.opt').first().click();
    await swipe(120); await page.locator('#vocabNext').waitFor();
    await page.waitForTimeout(1600);
    await swipe(-120);
    assert.equal(await page.evaluate(() => __navTest.state().quiz.idx), index, '离开后自动跳题暂停');
    await page.waitForFunction(i => __navTest.state().quiz.idx !== i, index);
    // 休息弹层不能被返回手势绕过。
    await page.evaluate(() => {
      const s = __navTest.state().save.care; s.breakEnabled = true; s.restUntil = Date.now() + 20000; __navTest.sync();
    });
    assert.equal(await page.evaluate(() => AppNav.back()), false);
    await page.goBack(); await page.waitForTimeout(100);
    assert.equal(await page.locator('#careOverlay').count(), 1);
    assert.equal(await page.evaluate(() => __navTest.state().navigation.entries[__navTest.state().navigation.index].name), 'quiz');
    await page.evaluate(() => { __navTest.state().save.care.restUntil = 0; __navTest.sync(); });
    while (await page.evaluate(() => !!__navTest.state().quiz)) {
      const q = await page.evaluate(() => { const s = __navTest.state().quiz; return { index: s.idx, answer: s.qs[s.idx].ans, type: s.qs[s.idx].type, locked: s.locked }; });
      if (!q.locked) {
        if (q.type === 'write' || q.type === 'dictate') {
          await page.locator('#recallInput').fill(q.answer); await page.locator('#submitRecall').click();
        } else await page.locator('.opt').filter({ hasText: q.answer }).first().click();
      }
      if (await page.locator('#nextQuestion').count()) await page.locator('#nextQuestion').click();
      await page.waitForFunction(i => { const s = __navTest.state().quiz; return !s || s.idx !== i; }, q.index);
    }
    await page.locator('.rcoins').waitFor();
    const reward = await page.evaluate(() => __navTest.state().save.coins);
    await swipe(120); await page.locator('#vocabNext').waitFor();
    await swipe(-120); await page.locator('.rcoins').waitFor();
    assert.equal(await page.evaluate(() => __navTest.state().save.coins), reward, '结果页前后导航不重复结算');
    assert.equal(await page.evaluate(() => __navTest.state().quiz), null, '完成后不复活已结束练习');
    assert.deepEqual(errors, []);
    console.log('导航验证通过：左右滑动、浏览器和系统返回入口、首页首次提醒和二次退出、超时及页面切换重置、前进分支、表单和原题恢复、奖励去重、跳题暂停及休息拦截。');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
