const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/update.js'), 'utf8');
function native(type) {
  let net = type || 'unknown', now = Date.now(); const timers = [];
  const calls = [];
  const window = { setInterval(fn) { timers.push(fn); return 1; }, addEventListener() {}, location: { reload() { calls.push('reload'); } }, AndroidBridge: {
    startCheck() { calls.push('check'); }, applyUpdate() { calls.push('apply'); },
    networkType() { return net; }, applyWifiUpdate() { calls.push('wifiApply'); },
    versionInfo() { return JSON.stringify({ name: '1.0.2', code: 102 }); }
  } };
  vm.runInNewContext(source, { window, Date: { now: () => now } });
  return { window, calls, update: window.AppUpdate, tick: () => timers[0](), network: t => { net = t; }, advance: ms => { now += ms; } };
}
(async function () {
  const { window, calls, update } = native();
  assert.equal(update.env(), 'native');
  assert.equal(update.version(), '1.0.2');
  const states = [];
  update.check(false, st => states.push(st));
  update.check(false, st => assert.equal(st.state, 'busy'));
  assert.equal(calls.filter(x => x === 'check').length, 1, '并发检查不得覆盖原生回调');
  window.__updCb({ state: 'found', version: '1.0.3', notes: 'test' });
  const found = states.find(st => st.state === 'waitingwifi');
  // 第二次检查完成后，第一次的下载按钮也必须恢复它自己的回调。
  update.check(false, () => {});
  window.__updCb({ state: 'uptodate', version: '1.0.2' });
  found.go();
  assert.equal(calls.at(-1), 'apply');
  found.go();
  assert.equal(calls.filter(x => x === 'apply').length, 1, '重复点击只允许一次下载');
  window.__updCb({ state: 'downloading', progress: 2.5 });
  assert.equal(states.at(-1).progress, 1, '原生解压字节不能显示成大于 100%');
  window.__updCb({ state: 'done', version: '1.0.3' });
  assert.equal(states.at(-1).state, 'installed');
  update.restart();
  assert.equal(calls.at(-1), 'reload', '原生安卓重新加载页面，不调用 plus');
  update.check(false, st => states.push(st));
  window.__updCb({ state: 'error', msg: 'offline' });
  update.check(false, st => states.push(st));
  assert.equal(states.at(-1).state, 'checking', '失败后允许重试');

  const wifi = native('wifi'), wifiStates = [];
  wifi.update.startAuto(st => wifiStates.push(st));
  wifi.window.__updCb({ state: 'found', version: '1.0.4' });
  assert.equal(wifi.calls.at(-1), 'wifiApply', 'Wi-Fi 自动下载，不要求点击');
  assert.equal(wifiStates.at(-1).state, 'downloading');
  wifi.window.__updCb({ state: 'done' });
  assert.equal(wifiStates.at(-1).state, 'installed');
  const mobile = native('other'), mobileStates = [];
  mobile.update.startAuto(st => mobileStates.push(st));
  mobile.window.__updCb({ state: 'found', version: '1.0.4' });
  assert.equal(mobileStates.at(-1).state, 'waitingwifi');
  mobile.tick();
  assert.equal(mobile.calls.includes('apply') || mobile.calls.includes('wifiApply'), false, '4G 不自动下载');
  mobile.network('wifi'); mobile.tick();
  assert.equal(mobile.calls.at(-1), 'wifiApply', '等待期间连上 Wi-Fi 自动更新');
  mobile.network('other'); mobile.window.__updCb({ state: 'waitingwifi' });
  assert.equal(mobileStates.at(-1).state, 'waitingwifi');
  const pausedCalls = mobile.calls.length;
  mobile.advance(11000); mobile.tick();
  assert.equal(mobile.calls.length, pausedCalls, 'Wi-Fi 中断后保持等待');
  mobile.network('wifi'); mobile.tick();
  assert.equal(mobile.calls.at(-1), 'wifiApply', 'Wi-Fi 恢复后自动重试');
  mobile.window.__updCb({ state: 'error', msg: 'timeout' });
  mobile.tick(); assert.equal(mobile.calls.at(-1), 'wifiApply', '失败后退避');
  mobile.advance(61000); mobile.tick();
  assert.equal(mobile.calls.at(-1), 'check', '网络错误后重新检查');
  const manual = native('other'), manualStates = [];
  manual.update.startAuto(st => manualStates.push(st));
  manual.window.__updCb({ state: 'found' }); manualStates.at(-1).go();
  assert.equal(manual.calls.at(-1), 'apply', '4G 手动允许下载');
  const unknown = native(), unknownStates = [];
  delete unknown.window.AndroidBridge.applyWifiUpdate;
  unknown.update.check(true, st => unknownStates.push(st));
  unknown.window.__updCb({ state: 'found' });
  assert.match(unknownStates.at(-1).msg, /APK/);
  assert.equal(unknown.calls.includes('apply'), false, '旧桥接不猜测 Wi-Fi');

  const preview = { location: { reload() {} } };
  vm.runInNewContext(source, { window: preview });
  preview.AppUpdate.check(false, st => assert.equal(st.state, 'nopreview'));

  let attempts = 0;
  const plus = { runtime: { version: '1.0.2', versionCode: '102', restart() {} } };
  const h5 = { plus };
  function XMLHttpRequest() {
    this.open = () => {};
    this.send = () => { attempts++; queueMicrotask(() => this.ontimeout()); };
  }
  vm.runInNewContext(source, { window: h5, plus, XMLHttpRequest });
  const outcome = await new Promise(resolve => h5.AppUpdate.check(true, st => { if (st.state === 'error') resolve(st); }));
  assert.equal(outcome.state, 'error');
  assert.equal(attempts, 3, '超时后尝试后续更新源');
  await new Promise(resolve => h5.AppUpdate.check(false, st => { if (st.state === 'error') resolve(st); }));
  assert.equal(attempts, 6, '静默检查失败后不会永久占用更新锁');
  console.log('更新逻辑通过：并发保护、旧按钮回调、重复下载、进度限制、安卓重载、Wi-Fi 自动下载及断网恢复、移动网络等待和手动下载、旧外壳兼容、失败重试与 H5 超时换源。');
})().catch(e => { console.error(e); process.exitCode = 1; });
