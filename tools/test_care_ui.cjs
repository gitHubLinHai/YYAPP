const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = 'http://127.0.0.1:8123';
(async function () {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      const original = window.setTimeout;
      window.setTimeout = (fn, ms, ...args) => original(fn, ms === 750 || ms === 1400 ? 5000 : ms, ...args);
      window.audioPauses = 0;
      window.Audio = function () { this.play = () => Promise.resolve(); this.pause = () => audioPauses++; };
      window.__hidden = false;
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__hidden });
    });
    await page.route('**/js/app.js*', route => {
      const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
      route.fulfill({ contentType: 'application/javascript', body: source.replace(/  showHome\(\);\r?\n  startEyeTimer\(\);/, '  window.__careTest = { state: function () { return { save: save, quiz: quiz }; }, sync: syncCare, quiz: startQuiz };\n  showHome();\n  startEyeTimer();') });
    });
    await page.goto(base);
    await page.locator('#eyeToggle').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'warm');
    assert.equal(await page.locator('html').getAttribute('data-font'), 'large');
    assert.equal(await page.locator('#eyeToggle').getAttribute('aria-pressed'), 'true');
    await page.reload();
    assert.equal(await page.locator('#eyeToggle').getAttribute('aria-pressed'), 'true');
    await page.screenshot({ path: 'release/eye-care-preview.png', fullPage: false });
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, '暖纸大字首页溢出 ' + width);
    }
    await page.locator('#eyeToggle').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    assert.equal(await page.evaluate(() => __careTest.state().save.care.breakEnabled), false);
    assert.equal(await page.evaluate(() => __careTest.state().save.care.dailyMinutes), 30);
    await page.locator('#parentBtn').click();
    await page.locator('#careSettingsBtn').click();
    await page.locator('#careTheme').selectOption('dark');
    await page.locator('#careFont').selectOption('large');
    await page.locator('#careBreak').check();
    await page.locator('#careInterval').selectOption('5');
    await page.locator('#careLimit').selectOption('15');
    await page.locator('#careForm button[type=submit]').click();
    await page.reload();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    assert.equal(await page.evaluate(() => __careTest.state().save.care.dailyMinutes), 15);

    // 模拟 Page Visibility 事件，后台期间不能累计前台时长。
    await page.evaluate(() => { window.__hidden = true; document.dispatchEvent(new Event('visibilitychange')); });
    const used = await page.evaluate(() => __careTest.state().save.care.days[Care.dayKey(Date.now())] || 0);
    await page.waitForTimeout(1100);
    assert.equal(await page.evaluate(() => __careTest.state().save.care.days[Care.dayKey(Date.now())] || 0), used);
    await page.evaluate(() => { window.__hidden = false; document.dispatchEvent(new Event('visibilitychange')); });

    await page.evaluate(() => { __careTest.state().save.lessons.g1u0 = { learn: true }; __careTest.quiz('g1', 0, 'listen'); });
    const answer = await page.evaluate(() => __careTest.state().quiz.qs[0].ans);
    await page.getByRole('button', { name: answer, exact: true }).click();
    await page.evaluate(() => { __careTest.state().save.care.sinceBreak = 5 * 60000; __careTest.sync(); });
    await page.locator('#careOverlay').waitFor();
    assert.equal(await page.locator('#careContinue').isDisabled(), true);
    const beforeRest = await page.evaluate(() => __careTest.state().quiz.idx);
    await page.waitForTimeout(1100);
    assert.equal(await page.evaluate(() => __careTest.state().quiz.idx), beforeRest, '休息中不得自动跳题');
    assert.ok(await page.evaluate(() => audioPauses > 0));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'release/rest-preview.png', fullPage: false });
    await page.evaluate(() => { __careTest.state().save.care.restUntil = Date.now() - 1; __careTest.sync(); });
    await page.locator('#careContinue').click();
    await page.waitForFunction(index => __careTest.state().quiz.idx === index + 1, beforeRest);
    assert.equal(await page.locator('#careOverlay').count(), 0);

    const q = await page.evaluate(() => __careTest.state().quiz.qs[__careTest.state().quiz.idx].ans);
    await page.getByRole('button', { name: q, exact: true }).click();
    await page.evaluate(() => { window.__hidden = true; document.dispatchEvent(new Event('visibilitychange')); });
    const index = await page.evaluate(() => __careTest.state().quiz.idx);
    await page.waitForTimeout(1100);
    assert.equal(await page.evaluate(() => __careTest.state().quiz.idx), index, '后台不能自动跳题');
    await page.evaluate(() => { window.__hidden = false; document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForFunction(index => __careTest.state().quiz.idx === index + 1, index);
    await page.evaluate(() => { __careTest.state().save.care.days[Care.dayKey(Date.now())] = 15 * 60000; __careTest.sync(); });
    assert.match(await page.locator('#careOverlay').textContent(), /今天先学到这里/);
    await page.locator('#careParent').click();
    assert.equal(await page.evaluate(() => __careTest.state().quiz), null, '家长调整明确退出本轮，不留下自动跳题任务');
    await page.locator('#careLimit').selectOption('0');
    await page.locator('#careForm button[type=submit]').click();
    await page.waitForTimeout(200);
    assert.equal(await page.locator('#careSettingsBtn').count(), 1);
    assert.equal(await page.locator('#careOverlay').count(), 0);

    await page.evaluate(() => { __careTest.state().save.coins = 42; });
    await page.locator('#backupBtn').click();
    await page.locator('#makeBackup').click();
    const text = await page.locator('#backupText').inputValue();
    assert.equal(JSON.parse(text).data.coins, 42);
    await page.locator('#restoreText').fill('{}');
    await page.locator('#checkBackup').click();
    assert.equal(await page.locator('#confirmRestore').count(), 0);
    assert.equal(await page.evaluate(() => __careTest.state().save.coins), 42);
    const changed = JSON.parse(text); changed.data.coins = 77;
    await page.locator('#restoreText').fill(JSON.stringify(changed));
    await page.locator('#checkBackup').click();
    assert.match(await page.locator('#restorePreview').textContent(), /77 金币/);
    assert.equal(await page.evaluate(() => __careTest.state().save.coins), 42, '预览不得覆盖当前进度');
    await page.locator('#confirmRestore').click();
    assert.equal(await page.evaluate(() => __careTest.state().save.coins), 77);
    await page.reload();
    assert.equal(await page.evaluate(() => __careTest.state().save.coins), 77);
    await page.locator('#parentBtn').click(); await page.locator('#backupBtn').click();
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#undoRestore').click();
    assert.equal(await page.evaluate(() => __careTest.state().save.coins), 42);
    await page.locator('#parentBtn').click(); await page.locator('#backupBtn').click();
    await page.locator('#restoreFile').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(changed)) });
    await page.locator('#confirmRestore').waitFor();
    assert.equal(await page.evaluate(() => __careTest.state().save.coins), 42);
    await page.locator('#confirmRestore').click();
    assert.equal(await page.evaluate(() => __careTest.state().save.coins), 77);
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 900 });
      await page.locator('#parentBtn').click(); await page.locator('#backupBtn').click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, '深色大字备份页溢出 ' + width);
      await page.locator('#back').click(); await page.locator('#back').click();
    }
    assert.deepEqual(errors, []);
    console.log('护眼界面通过：一键方案、配色字号保存、前后台计时、休息/后台暂停原题、每日上限、文本及文件恢复、预览确认、撤销恢复与窄屏布局。');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
