const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const context = { window: {} }; vm.createContext(context);
for (const f of ['data/phonics.js', 'data/textbooks.js', 'js/learning.js', 'js/care.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), context);
context.DB = context.window.DB;
const { DB, Phonics: P } = context.window;
assert.equal(DB.phonics.course.length, 20);
const save = { phonics: {} }, now = 1800000000000;
assert.equal(P.open(save, 1), false);
assert.equal(P.mark(save, 0, 'check', 10, 10, now), false);
for (let i = 0; i < DB.phonics.course.length; i++) {
  const lesson = DB.phonics.course[i];
  for (const m of lesson.models) assert.equal(m.parts.join(''), m.w);
  assert.ok(lesson.transfer.every(w => !lesson.practice.includes(w) && !lesson.models.some(m => m.w === w)));
  assert.ok(lesson.transfer.every(w => !new RegExp('\\b'+w+'\\b','i').test(lesson.hint)), '迁移词不能提前出现在规则提示里');
  for (const stage of P.stages) {
    assert.equal(P.mark(save, i, stage, 3, 4, now), false);
    assert.equal(P.mark(save, i, stage, 4, 5, now), true);
  }
  const r = P.state(save, lesson.id);
  assert.equal(r.due, now + 86400000);
  P.mark(save, i, 'check', 5, 5, now + 1000); assert.equal(r.reviews, 1);
  P.mark(save, i, 'check', 5, 5, now + 86400000); assert.equal(r.reviews, 2);
  assert.equal(r.due, now + 4 * 86400000);
}
assert.equal(DB.textbooks.nse3b25.units.flatMap(u => u.words).length, 199);
assert.equal(DB.textbooks.nse4a25.units.flatMap(u => u.words).length, 72);
for (const book of Object.values(DB.textbooks)) {
  assert.equal(book.chapters.length, 6); assert.equal(book.chapters[5].pages, '62–74');
  for (const c of book.chapters) {
    assert.deepEqual(Array.from(book.units.filter(u => u.chapter === c.number).flatMap(u => u.words), w => w.w), Array.from(c.words));
  }
  for (const u of book.units) {
    assert.ok(u.words.length >= 4 && u.words.length <= 6);
    for (const w of u.words) assert.ok(w.zh && w.ex.toLowerCase().includes(w.w.toLowerCase()), w.w);
  }
}
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } }), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      const original = setTimeout;
      window.setTimeout = (fn, ms, ...args) => original(fn, ms === 750 || ms === 1400 ? 10 : ms, ...args);
      window.played = []; window.Audio = function (url) { this.play = () => { played.push(url); return Promise.resolve(); }; this.pause = () => {}; };
    });
    await page.route('**/js/app.js', route => route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(root, 'js/app.js'), 'utf8').replace('  initNavigation();', '  window.__newTest = { state: () => ({save, phq, quiz}), practice: startPhonicsPractice, lesson: showPhonicsLesson, home: showHome, sync: syncCare, persist, quiz: startQuiz };\n  initNavigation();') }));
    await page.goto('http://127.0.0.1:8123');
    await page.locator('#courseBtn').click();
    assert.equal(await page.locator('#gradeSelect option').count(), 6);
    for (const gid of ['nse3b25', 'nse4a25']) {
      await page.locator('#gradeSelect').selectOption(gid);
      assert.ok((await page.locator('#bookCoverage').textContent()).length > 30);
      await page.locator('#saveCourse').click();
      await page.locator('#continueBtn').click();
      assert.match(await page.locator('.textbook-note').textContent(), /2–13页/);
      await page.evaluate(() => { const s = __newTest.state().save; s.lessons[s.course.grade + 'u0'] = {learn:true,listen:true,spell:true}; __newTest.quiz(s.course.grade,0,'sentence'); });
      assert.ok(await page.locator('.sentence-context').count());
      await page.evaluate(() => __newTest.home());
      const backup = await page.evaluate(() => { const s = __newTest.state().save; return Care.decode(Care.encode(s), JSON.parse(JSON.stringify(s))); });
      assert.equal(backup.course.grade, gid);
      await page.locator('#courseBtn').click();
    }
    const invalidQuestions = await page.evaluate(() => {
      const s=__newTest.state().save, bad=[];
      for(const [gid,b] of Object.entries(DB.textbooks)) {
        b.units.forEach((u,i)=>{s.lessons[gid+'u'+i]={learn:true,listen:true,spell:true,sentence:true};});
        b.units.forEach((u,i)=>{
          __newTest.quiz(gid,i,'sentence');
          const q=__newTest.state().quiz;
          if(!q || q.qs.length!==u.words.length || q.qs.some(x=>!x.sentence || !x.opts.includes(x.ans) || x.opts.filter(v=>v===x.ans).length!==1))bad.push(gid+':'+i);
        });
      }
      return bad;
    });
    assert.deepEqual(invalidQuestions,[]);
    await page.reload();
    await page.locator('#phonicsBtn').click();
    assert.equal(await page.locator('[data-phlesson]:disabled').count(), 19);
    await page.screenshot({ path: 'tmp/phonics-route.png', fullPage: false });
    await page.locator('[data-phlesson="0"]').click();
    assert.equal(await page.locator('#phLearnDone').isDisabled(), true);
    for (const b of await page.locator('[data-phdemo]').all()) await b.click();
    await page.locator('#phLearnDone').click();
    assert.equal(await page.locator('[data-phstage="listen"]').isEnabled(), true);
    await page.screenshot({ path: 'tmp/phonics-lesson.png', fullPage: true });
    async function finish(stage, correct) {
      await page.locator('[data-phstage="' + stage + '"]').click();
      while (await page.evaluate(() => !!__newTest.state().phq)) {
        const q = await page.evaluate(() => { const p = __newTest.state().phq; return {...p.qs[p.idx], idx:p.idx}; });
        if (q.type === 'spell') {
          assert.equal(await page.locator('[data-phanswer]').count(), 0);
          await page.locator('#phInput').fill(correct ? q.ans : 'wrong');
          await page.locator('#phForm button').click();
        } else {
          if (q.type === 'read') { assert.equal(await page.locator('#phReplay').count(), 0); assert.equal(await page.locator('.ph-read-word').textContent(), q.word); }
          await page.locator('[data-phanswer="' + (correct ? q.ans : q.opts.find(w => w !== q.ans)) + '"]').click();
        }
        await page.waitForFunction(i => { const p = __newTest.state().phq; return !p || p.idx !== i; }, q.idx);
      }
      assert.match(await page.locator('h2').textContent(), correct ? /本步通过/ : /再练/);
      await page.locator('#phLessonBack').click();
    }
    await finish('listen', false);
    assert.equal(await page.locator('[data-phstage="spell"]').isDisabled(), true);
    await finish('listen', true); await finish('spell', true); await finish('check', true);
    assert.equal(await page.evaluate(() => Phonics.open(__newTest.state().save, 1)), true);
    const restored = await page.evaluate(() => { const s = __newTest.state().save; return Care.decode(Care.encode(s), JSON.parse(JSON.stringify(s))); });
    assert.equal(restored.phonics.route1.satp.check, true);
    // 所有课的题型与迁移隔离，题目与分项判定都来自实际生产代码。
    for (let i = 0; i < 20; i++) for (const stage of ['listen','spell','check']) {
      const result = await page.evaluate(({i,stage}) => {
        const s=__newTest.state().save;
        DB.phonics.course.forEach(l => { s.phonics.route1[l.id]={learn:true,listen:true,spell:true,check:true}; });
        __newTest.practice(i,stage);
        const p=__newTest.state().phq, l=DB.phonics.course[i];
        return {types:p.qs.map(q=>q.type), words:p.qs.map(q=>q.word), practice:l.practice, transfer:l.transfer, valid:p.qs.every(q=>!q.opts || new Set(q.opts).size===q.opts.length && q.opts.includes(q.ans))};
      },{i,stage});
      assert.equal(result.valid,true);
      assert.ok(result.words.every(w => (stage==='check'?result.transfer:result.practice).includes(w)));
      assert.ok(result.types.every(t => stage==='check'?['spell','read'].includes(t):t===(stage==='listen'?'listen':'spell')));
    }
    // 后退、前进仍保留未提交拼写。
    await page.reload(); await page.locator('#phonicsBtn').click();
    await page.locator('[data-phlesson="0"]').click(); await page.locator('[data-phstage="spell"]').click();
    await page.locator('#phInput').fill('partial'); await page.evaluate(() => AppNav.back());
    await page.locator('#phLearnDone').waitFor(); await page.evaluate(() => AppNav.forward());
    await page.locator('#phInput').waitFor(); assert.equal(await page.locator('#phInput').inputValue(),'partial');
    for (const theme of ['warm','dark']) {
      await page.evaluate(t=>{document.documentElement.dataset.theme=t; __newTest.lesson(0);},theme);
      await page.setViewportSize({width:320,height:740});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      const colour=await page.locator('.ph-segments span').first().evaluate(e=>getComputedStyle(e).backgroundColor);
      assert.notEqual(colour,'rgb(255, 255, 255)');
    }
    await page.screenshot({path:'tmp/phonics-dark.png',fullPage:true});
    await page.reload(); assert.equal(await page.evaluate(()=>__newTest.state().save.phonics.route1.satp.check),true);
    assert.deepEqual(errors,[]);
    // 音频必须存在且可以真实解码，不能以mock播放代替资源检查。
    const failures=await page.evaluate(async()=>{
      const files=new Set(), slug=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
      for(const b of Object.values(DB.textbooks)) for(const u of b.units) for(const w of u.words){files.add('audio/words/'+slug(w.w)+'.mp3');files.add('audio/sent/'+slug(w.ex)+'.mp3');}
      for(const l of DB.phonics.course) for(const w of [...l.practice,...l.transfer,...l.models.map(m=>m.w)]) files.add('audio/phonics/'+slug(w)+'.mp3');
      const queue=[...files], bad=[],ctx=new AudioContext();
      await Promise.all(Array.from({length:8},async()=>{while(queue.length){const url=queue.shift();try{const r=await fetch(url);if(!r.ok)throw Error(r.status);const a=await ctx.decodeAudioData(await r.arrayBuffer());if(a.duration<=0||a.duration>30)throw Error('duration');}catch(e){bad.push(url+': '+e.message);}}}));
      await ctx.close();return bad;
    });
    assert.deepEqual(failures,[]);
    console.log('新增教材与20课拼读通过：词表/分组/例句、前置与80%门槛、迁移隔离、复测、实际题型、备份、导航、窄屏护眼和全部音频解码。');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
