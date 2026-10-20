/* 热更新模块（wgt）：APK外壳只装一次，资源包在线更新。
   流程：启动/手动检查 → 拉 release/version.json（多CDN轮询）→ 比对 versionCode
        → 下载 .wgt → plus.runtime.install → 重启生效。
   网页预览（无 plus 环境）自动跳过，不影响本地测试。 */
window.AppUpdate = (function () {
  'use strict';
  // 更新文件托管在 GitHub 仓库 release/ 目录，经 jsDelivr CDN 分发（按顺序尝试）
  var CDNS = [
    'https://cdn.jsdelivr.net/gh/gitHubLinHai/YYAPP@main/release/',
    'https://fastly.jsdelivr.net/gh/gitHubLinHai/YYAPP@main/release/',
    'https://raw.githubusercontent.com/gitHubLinHai/YYAPP/main/release/'
  ];

  function inApp() { return typeof window.plus !== 'undefined' && window.plus.runtime; }

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
      var opt = { filename: '_doc/update/', retry: 1, retryInterval: 2000 };
      var dtask = plus.downloader.createDownload(url, opt, function (d, status) {
        if (status === 200) resolve(d.filename);
        else reject(new Error('下载失败 status=' + status));
      });
      if (onProgress) dtask.addEventListener('statechanged', function (task) {
        if (task.state === 3 && task.total > 0) onProgress(task.downloaded / task.total);
      });
      dtask.start();
    });
  }

  /* silent=true: 启动时自动检查，只在有新版本时提示；silent=false: 手动检查，给完整反馈 */
  function check(silent, uiCb) {
    var cb = uiCb || function () { };
    if (!inApp()) {
      if (!silent) cb({ state: 'nopreview' });
      return;
    }
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

  return { check: check, inApp: inApp, version: function () { return inApp() ? plus.runtime.version : '网页预览'; } };
})();
