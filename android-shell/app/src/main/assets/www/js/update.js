/* 热更新模块：APK外壳只装一次，资源包在线更新。
   支持三种运行环境（自动探测）：
   1. 原生安卓外壳  —— window.AndroidBridge（本机 Gradle 打包的 APK），下载/解压由 Java 完成
   2. HBuilderX 5+App —— window.plus（wgt 方案，备用）
   3. 浏览器预览    —— 都没有时静默跳过，不影响本地开发 */
window.AppUpdate = (function () {
  'use strict';
  // 更新文件托管在 GitHub 仓库 release/ 目录，经 jsDelivr CDN 分发（按顺序尝试）
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
    var i = 0;
    function tryNext() {
      if (i >= CDNS.length) return Promise.reject(new Error('所有更新源都连不上'));
      return fetchJson(CDNS[i] + 'version.json')
        .then(function (info) { return { info: info, base: CDNS[i] }; })
        .catch(function () { i++; return tryNext(); });
    }
    return tryNext();
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
      if (next <= cur) {
        if (!silent) cb({ state: 'uptodate', version: info.versionName });
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
      if (!silent) cb({ state: 'error', msg: e.message });
    });
  }

  /* ---------- 原生安卓外壳环境（Java 负责网络与解压） ---------- */
  function checkNative(silent, cb) {
    window.__updCb = function (st) {
      if (st.state === 'uptodate') { cb({ state: 'uptodate', version: st.version }); }
      else if (st.state === 'found') {
        cb({
          state: 'found', version: st.version, notes: st.notes || '',
          go: function () { window.AndroidBridge.applyUpdate('__updCb'); }
        });
      } else if (st.state === 'downloading') { cb({ state: 'downloading', progress: st.progress }); }
      else if (st.state === 'done') { cb({ state: 'installed', version: st.version }); }
      else if (st.state === 'error') { cb({ state: 'error', msg: st.msg }); }
    };
    window.AndroidBridge.startCheck('__updCb');
  }

  /* silent=true: 启动时自动检查，只在新版本时提示；false: 家长中心手动检查，给完整反馈 */
  function check(silent, uiCb) {
    var cb = uiCb || function () { };
    var m = env();
    if (m === 'native') return checkNative(silent, cb);
    if (m === 'hbuilder') return checkPlus(silent, cb);
    if (!silent) cb({ state: 'nopreview' });
  }

  return { check: check, env: env, version: version };
})();
