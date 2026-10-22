/* 用真实浏览器HTTP缓存复现：磁盘新版本、页面仍运行旧脚本。测试中不拦截请求，以免关闭浏览器缓存。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const old = new Map(), requests = new Map();
let phase = 'old';
function oldFile(file) {
  if (!old.has(file)) old.set(file, execFileSync('git', ['show', '9a56c61:' + file], {cwd:root, stdio:['ignore','pipe','pipe']}));
  return old.get(file);
}
const server = http.createServer((req,res) => {
  const url = new URL(req.url, 'http://127.0.0.1'), file = url.pathname.slice(1) || 'index.html';
  const target = path.resolve(root,file);
  if (!target.startsWith(root + path.sep)) {res.writeHead(403).end();return;}
  try {
    let data = phase === 'old' ? oldFile(file) : fs.readFileSync(target);
    if (file === 'index.html' && phase === 'stale') data = Buffer.from(data.toString().replace(/\?v=\d+/g,''));
    requests.set(url.pathname + url.search, (requests.get(url.pathname + url.search) || 0) + 1);
    res.writeHead(200, {
      'Content-Type': file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html',
      'Cache-Control': file.endsWith('.html') ? 'no-store' : 'public, max-age=31536000, immutable'
    }); res.end(data);
  } catch(e) {res.writeHead(404).end();}
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try {
    const page = await browser.newPage({viewport:{width:390,height:844}}), errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(({name,code})=>{
      window.Audio=function(){this.play=()=>Promise.resolve();this.pause=()=>{};};
      if(!localStorage.getItem('eq_save_v1')) localStorage.setItem('eq_save_v1',JSON.stringify({coins:37,stars:{nse3b25u0:2}}));
      window.AndroidBridge={versionInfo:()=>JSON.stringify({name,code}),startCheck:()=>{},networkType:()=> 'other',applyUpdate:()=>{}};
    },{name:manifest.versionName,code:manifest.versionCode});
    const base='http://127.0.0.1:'+server.address().port+'/index.html';
    await page.goto(base); await page.locator('#courseBtn').click();
    assert.equal(await page.locator('#gradeSelect option').count(),4);
    // 服务端已换新文件，入口也重载了，但相同子资源URL仍命中旧缓存。
    phase='stale'; await page.goto(base+'?probe=stale');
    await page.locator('#courseBtn').click();
    assert.equal(await page.locator('#gradeSelect option').count(),4,'复现旧页面没有三下及四上');
    assert.equal(requests.get('/js/app.js'),1,'旧脚本来自真实浏览器缓存');
    assert.equal(await page.evaluate(()=>AppUpdate.version()),manifest.versionName,'磁盘版本已新、页面内容仍旧');
    // 正式入口为每份静态资源附上当前版本，仍使用同一个浏览器进程和缓存。
    phase='fixed'; await page.goto(base+'?probe=fixed');
    await page.locator('#courseBtn').click();
    assert.equal(await page.locator('#gradeSelect option').count(),6);
    assert.equal(requests.get('/js/app.js?v='+manifest.versionCode),1);
    await page.locator('#gradeSelect').selectOption('nse3b25');
    await page.locator('#saveCourse').click(); await page.locator('#eyeToggle').click();
    const saved=await page.evaluate(()=>localStorage.getItem('eq_save_v1'));
    await page.evaluate(()=>AppUpdate.restart());
    await page.waitForURL(url=>url.searchParams.has('eqReload')); await page.locator('#continueBtn').waitFor();
    assert.equal(new URL(page.url()).searchParams.get('probe'),'fixed');
    const restored=await page.evaluate(()=>JSON.parse(localStorage.getItem('eq_save_v1'))), before=JSON.parse(saved);
    assert.equal(restored.course.grade,'nse3b25'); assert.equal(restored.coins,37); assert.equal(restored.stars.nse3b25u0,2);
    assert.equal(restored.care.theme,before.care.theme);
    await page.locator('#courseBtn').click(); assert.equal(await page.locator('#gradeSelect option').count(),6);
    assert.deepEqual(errors,[]);
    // 安卓入口使用file协议；另验实际file URL带查询后可载入资源并保留本地进度。
    const local=await browser.newPage();
    await local.goto(pathToFileURL(path.join(root,'index.html')).href);
    await local.locator('#courseBtn').click(); await local.locator('#gradeSelect').selectOption('nse4a25');
    await local.locator('#saveCourse').click(); await local.evaluate(()=>AppUpdate.restart());
    await local.waitForURL(url=>url.searchParams.has('eqReload')); await local.locator('#continueBtn').waitFor();
    assert.match(await local.locator('.course-strip').textContent(),/四年级上册/);
    console.log('更新缓存回归通过：真实缓存复现版本新/界面旧；带版本资源立即显示三下四上；强制换入口URL生效，HTTP/file协议均保留学习记录，无需杀进程。');
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
