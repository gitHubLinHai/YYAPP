/* 热更新模块：APK外壳只装一次，资源包在线更新。
   支持三种运行环境（自动探测）：
   1. 原生安卓外壳  —— window.AndroidBridge（本机 Gradle 打包的 APK），下载/解压由 Java 完成
   2. HBuilderX 5+App —— window.plus（wgt 方案，备用）
   3. 浏览器预览    —— 都没有时静默跳过，不影响本地开发 */
window.AppUpdate = (function () {
  'use strict';
  // 更新文件托管在 GitHub 仓库 release/ 目录，经 jsDelivr CDN 分发（并行检查最高有效版本）
  // fastly 节点在国内可直连，放最前
  var CDNS = [
    'https://fastly.jsdelivr.net/gh/gitHubLinHai/YYAPP@main/release/',
    'https://cdn.jsdelivr.net/gh/gitHubLinHai/YYAPP@main/release/',
    'https://raw.githubusercontent.com/gitHubLinHai/YYAPP/main/release/'
  ];

  function env() {
    if (typeof window.AndroidBridge !== 'undefined' && window.AndroidBridge.startCheck) return 'native';
    if (typeof window.plus !== 'undefined' && window.plus.runtime) return 'hbuilder';
    return 'preview';
  }

  function version() {
    if (env() === 'native') {
      try {
        var vi = JSON.parse(window.AndroidBridge.versionInfo());
        return vi.name || ('code ' + vi.code);
      } catch (e) { return '未知'; }
    }
    if (env() === 'hbuilder') return plus.runtime.version;
    return '网页预览';
  }

  /* ---------- HBuilderX plus 环境 ---------- */
  function fetchJson(url, timeoutMs) {
    return new Promise(function (resolve, reject) {
      try {
        var xhr = new XMLHttpRequest();
        xhr.timeout = timeoutMs || 8000;
        xhr.ontimeout = function () { reject(new Error('检查更新超时')); };
        xhr.onload = function () {
          if (xhr.status === 200) { try { resolve(JSON.parse(xhr.responseText)); } catch (e) { reject(e); } }
          else reject(new Error('HTTP ' + xhr.status));
        };
        xhr.onerror = function () { reject(new Error('network')); };
        xhr.open('GET', url + '?t=' + Date.now(), true);
        xhr.send();
      } catch (e) { reject(e); }
    });
  }
  function getRemoteInfo() {
    return Promise.all(CDNS.map(function (base) {
      return fetchJson(base + 'version.json').then(function (info) {
        if (!Number.isInteger(info.versionCode) || info.versionCode <= 0 || !info.versionName
            || !/^[A-Za-z0-9._-]+\.wgt$/.test(info.wgt)) return null;
        return { info: info, base: base };
      }).catch(function () { return null; });
    })).then(function (results) {
      var best = null;
      results.forEach(function (r) { if (r && (!best || r.info.versionCode > best.info.versionCode)) best = r; });
      if (!best) throw new Error('所有更新源均不可用，请稍后重试');
      return best;
    });
  }
  function downloadWgt(url, onProgress) {
    return new Promise(function (resolve, reject) {
      var dtask = plus.downloader.createDownload(url, { filename: '_doc/update/', retry: 1, retryInterval: 2000 }, function (d, status) {
        if (status === 200) resolve(d.filename);
        else reject(new Error('下载失败 status=' + status));
      });
      if (onProgress) dtask.addEventListener('statechanged', function (task) {
        if (task.state === 3 && task.total > 0) onProgress(task.downloaded / task.total);
      });
      dtask.start();
    });
  }
  function checkPlus(silent, cb) {
    getRemoteInfo().then(function (r) {
      var info = r.info;
      var cur = parseInt(plus.runtime.versionCode, 10) || 0;
      var next = parseInt(info.versionCode, 10) || 0;
      if (next < cur) throw new Error('更新源版本落后于当前 v' + version() + '，暂时无法确认更新，请稍后重试');
      if (next === cur) {
        cb({ state: 'uptodate', version: version() });
        return;
      }
      cb({ state: 'found', version: info.versionName, notes: info.notes || '', go: function () {
        cb({ state: 'downloading', progress: 0 });
        var wgtUrl = r.base + info.wgt + '?t=' + Date.now();
        downloadWgt(wgtUrl, function (p) { cb({ state: 'downloading', progress: p }); })
          .then(function (path) {
            plus.runtime.install(path, { force: false }, function () {
              cb({ state: 'installed', version: info.versionName });
            }, function (e) { cb({ state: 'error', msg: '安装失败：' + (e && e.message || e) }); });
          })
          .catch(function (e) { cb({ state: 'error', msg: (e && e.message) || '下载出错' }); });
      } });
    }).catch(function (e) {
      cb({ state: 'error', msg: e.message });
    });
  }

  /* ---------- 原生安卓外壳环境（Java 负责网络与解压） ---------- */
  function checkNative(silent, cb) {
    var nativeCb = function (st) {
      if (st.state === 'uptodate') {
        // 兼容旧外壳：旧源回报更低版本时，不能显示为当前最新版本。
        var current = version();
        if (st.version !== current) cb({ state: 'error', msg: '更新源版本与当前 v' + current + ' 不一致，暂时无法确认更新；旧安装包请覆盖安装新版 APK。' });
        else cb({ state: 'uptodate', version: current });
      }
      else if (st.state === 'found') {
        cb({
          state: 'found', version: st.version, notes: st.notes || '',
          go: function (wifiOnly) { window.__updCb = nativeCb; if (wifiOnly) window.AndroidBridge.applyWifiUpdate('__updCb'); else window.AndroidBridge.applyUpdate('__updCb'); }
        });
      } else if (st.state === 'downloading') { cb({ state: 'downloading', progress: st.progress }); }
      else if (st.state === 'done') { cb({ state: 'installed', version: st.version }); }
      else if (st.state === 'waitingwifi') { cb({ state: 'waitingwifi' }); }
      else if (st.state === 'error') { cb({ state: 'error', msg: st.msg }); }
    };
    window.__updCb = nativeCb;
    window.AndroidBridge.startCheck('__updCb');
  }

  var busy = false, waiting = null, lastFoundGo = null, lastFoundVersion = '', autoCb = null, autoTimer = null, lastAutoCheck = 0, retryAfter = 0;
  function network() {
    try {
      if (env() === 'native' && window.AndroidBridge.networkType) return window.AndroidBridge.networkType();
      if (env() === 'hbuilder' && plus.networkinfo) return plus.networkinfo.getCurrentType() === plus.networkinfo.CONNECTION_WIFI ? 'wifi' : 'other';
    } catch (e) { }
    return 'unknown';
  }
  function canAuto() {
    // 旧外壳无法把下载绑定到 Wi-Fi，必须先覆盖安装新 APK。
    return env() === 'native' && !!window.AndroidBridge.applyWifiUpdate && network() === 'wifi';
  }
  function tickAuto() {
    if (!autoCb || busy || (window.document && window.document.hidden) || Date.now() < retryAfter) return;
    if (waiting && canAuto()) { waiting(true); return; }
    if (Date.now() - lastAutoCheck >= 300000 && network() === 'wifi') check(true, autoCb);
  }
  function startAuto(cb) {
    autoCb = cb;
    if (autoTimer) return;
    check(true, cb);
    autoTimer = window.setInterval(tickAuto, 5000);
    window.addEventListener('online', tickAuto);
    if (window.document) window.document.addEventListener('visibilitychange', tickAuto);
  }
  /* silent=true: 启动时自动检查，只在新版本时提示；false: 家长中心手动检查，给完整反馈 */
  function check(silent, uiCb) {
    var cb = uiCb || function () { };
    var m = env();
    if (m === 'preview') { if (!silent) cb({ state: 'nopreview' }); return; }
    if (busy) { if (!silent) cb({ state: 'busy' }); return; }
    busy = true; lastAutoCheck = Date.now();
    function notify(st) {
      if (st.state !== 'downloading') busy = false;
      if (st.state === 'downloading') st.progress = Math.max(0, Math.min(1, Number(st.progress) || 0));
      if (st.state === 'found') {
        var go = st.go;
        st.go = function (wifiOnly) {
          if (busy) { cb({ state: 'busy' }); return; }
          busy = true;
          cb({ state: 'downloading', progress: 0 });
          waiting = null;
          try { go(wifiOnly === true); } catch (e) { notify({ state: 'error', msg: e.message || '启动更新失败' }); }
        };
      }
      if (st.state === 'found') {
        waiting = lastFoundGo = st.go; lastFoundVersion = st.version;
        if (canAuto()) { waiting(true); return; }
        st.state = 'waitingwifi';
        st.msg = env() === 'native' && !window.AndroidBridge.applyWifiUpdate ? '当前安装包需覆盖安装新版 APK，才能启用 Wi-Fi 自动更新。也可手动更新资源。' : '等待连接 Wi-Fi 后自动更新；现在也可手动使用移动网络更新。';
      } else if (st.state === 'waitingwifi') {
        // 下载期间 Wi-Fi 断开；重连后重新检查、下载，不转用移动网络。
        waiting = lastFoundGo; st.go = lastFoundGo; st.version = lastFoundVersion;
        st.msg = 'Wi-Fi 已断开，等待重连后自动更新；也可手动使用移动网络更新。';
        retryAfter = Date.now() + 10000; lastAutoCheck = 0;
      } else if (st.state === 'error') {
        waiting = null; retryAfter = Date.now() + 60000; lastAutoCheck = 0;
      } else if (st.state === 'installed' || st.state === 'uptodate') waiting = null;
      cb(st);
    }
    cb({ state: 'checking' });
    try {
      if (m === 'native') return checkNative(silent, notify);
      return checkPlus(silent, notify);
    } catch (e) { notify({ state: 'error', msg: e.message || '检查更新失败' }); }
  }

  function restart() {
    if (env() === 'hbuilder') plus.runtime.restart();
    else {
      var url = new URL(window.location.href);
      url.searchParams.set('eqReload', String(Date.now()));
      window.location.replace(url.href);
    }
  }
  return { check: check, startAuto: startAuto, network: network, env: env, version: version, restart: restart };
})();
