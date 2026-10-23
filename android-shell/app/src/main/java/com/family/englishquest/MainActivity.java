package com.family.englishquest;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.os.Bundle;
import android.os.Build;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkInfo;
import android.view.KeyEvent;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * 英语拼读闯关 - WebView 外壳
 * 资源优先加载 files/www（热更后目录），首次启动从 assets/www 拷贝。
 * 热更流程：JS 调 AndroidBridge.startCheck → 拉各CDN version.json 比对版本
 *          → JS 调 applyUpdate → 流式下载 wgt(zip) 解压到 update_tmp → 原子替换 www → JS reload。
 */
public class MainActivity extends Activity {

    /** 与 js/update.js 保持一致的三源列表（并行检查，选取最高有效版本） */
    private static final String[] CDNS = {
            "https://fastly.jsdelivr.net/gh/gitHubLinHai/YYAPP@main/release/",
            "https://cdn.jsdelivr.net/gh/gitHubLinHai/YYAPP@main/release/",
            "https://raw.githubusercontent.com/gitHubLinHai/YYAPP/main/release/"
    };

    private static final AtomicBoolean UPDATING = new AtomicBoolean();
    private WebView web;
    private File wwwDir;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        wwwDir = new File(getFilesDir(), "www");
        try {
            android.content.pm.PackageInfo pkg = getPackageManager().getPackageInfo(getPackageName(), 0);
            synchronized (UpdateStorage.class) {
                UpdateStorage.recover(getFilesDir());
                if (!new File(wwwDir, "index.html").exists() || pkg.versionCode > activeCode()) {
                    File bundled = new File(getFilesDir(), "bundled_tmp");
                    deleteRecursive(bundled);
                    copyAssets("www", bundled);
                    UpdateStorage.install(bundled, wwwDir);
                }
            }
        } catch (Exception e) { throw new RuntimeException("初始化资源失败", e); }
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient());
        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        setContentView(web);
        web.loadUrl("file://" + wwwDir.getAbsolutePath() + "/index.html");
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (event.getRepeatCount() == 0) onBackPressed();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    /** 系统返回键及边缘返回手势统一交给网页导航，首页也不退出 Activity。 */
    @Override
    public void onBackPressed() {
        if (web != null) web.evaluateJavascript("if(window.AppNav){window.AppNav.back();}else{window.history.back();}", null);
    }

    /** 递归拷贝 assets 资源到内部存储 */
    private void copyAssets(String assetDir, File target) {
        try {
            String[] list = getAssets().list(assetDir);
            if (!target.exists()) target.mkdirs();
            for (String name : list) {
                String sub = assetDir + "/" + name;
                File out = new File(target, name);
                if (getAssets().list(sub).length > 0) {
                    copyAssets(sub, out);
                } else {
                    InputStream in = getAssets().open(sub);
                    FileOutputStream fo = new FileOutputStream(out);
                    byte[] buf = new byte[8192];
                    int n;
                    while ((n = in.read(buf)) > 0) fo.write(buf, 0, n);
                    fo.close();
                    in.close();
                }
            }
        } catch (Exception e) {
            throw new RuntimeException("初始化资源失败", e);
        }
    }

    private void jsCallback(final String cb, final JSONObject obj) {
        runOnUiThread(new Runnable() {
            public void run() {
                if (web != null) {
                    web.evaluateJavascript(
                            "if(window.__updCb){window.__updCb(" + obj.toString() + ");}", null);
                }
            }
        });
    }

    private Network wifiNetwork() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        if (cm == null) return null;
        if (Build.VERSION.SDK_INT >= 23) {
            Network n = cm.getActiveNetwork();
            if (n == null) return null;
            NetworkCapabilities caps = cm.getNetworkCapabilities(n);
            return caps != null && caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
                    && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) ? n : null;
        }
        NetworkInfo active = cm.getActiveNetworkInfo();
        if (active == null || !active.isConnected() || active.getType() != ConnectivityManager.TYPE_WIFI) return null;
        for (Network n : cm.getAllNetworks()) {
            NetworkInfo info = cm.getNetworkInfo(n);
            if (info != null && info.isConnected() && info.getType() == ConnectivityManager.TYPE_WIFI) return n;
        }
        return null;
    }

    private class Bridge {
        private volatile JSONObject recentUpdate;
        private volatile long recentAt;
        /** 网页完成首页二次返回确认并保存进度后关闭应用。 */
        @JavascriptInterface
        public void exitApp() {
            runOnUiThread(new Runnable() {
                public void run() { MainActivity.this.finishAndRemoveTask(); }
            });
        }

        @JavascriptInterface
        public String networkType() {
            try {
                if (wifiNetwork() != null) return "wifi";
                ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
                NetworkInfo info = cm.getActiveNetworkInfo();
                return info != null && info.isConnected() ? "other" : "none";
            } catch (Exception e) { return "unknown"; }
        }

        @JavascriptInterface
        public void applyWifiUpdate(final String cb) { update(cb, true); }

        @JavascriptInterface
        public boolean supportsResume() { return true; }


        /** 当前生效资源版本，供 JS 显示在家长中心 */
        @JavascriptInterface
        public String versionInfo() {
            try {
                JSONObject o = new JSONObject();
                o.put("code", activeCode());
                o.put("name", activeName());
                return o.toString();
            } catch (Exception e) {
                return "{}";
            }
        }

        /** 异步检查更新，状态通过 window.__updCb(JSON) 回调 */
        @JavascriptInterface
        public void startCheck(final String cb) {
            new Thread(new Runnable() {
                public void run() {
                    try {
                        JSONObject remote = fetchVersionJson();
                        if (remote == null) {
                            cbError(cb, "所有更新源都连不上");
                            return;
                        }
                        int next = remote.optInt("versionCode", 0);
                        recentUpdate = remote; recentAt = android.os.SystemClock.elapsedRealtime();
                        JSONObject o = new JSONObject();
                        if (next < activeCode()) {
                            cbError(cb, "更新源版本落后于当前 v" + activeName() + "，暂时无法确认更新，请稍后重试");
                            return;
                        }
                        if (next == activeCode()) {
                            o.put("state", "uptodate");
                        } else {
                            o.put("state", "found");
                        }
                        o.put("version", next == activeCode() ? activeName() : remote.optString("versionName"));
                        o.put("notes", remote.optString("notes"));
                        jsCallback(cb, o);
                    } catch (Exception e) {
                        cbError(cb, String.valueOf(e));
                    }
                }
            }).start();
        }

        /** 异步执行更新：下载 wgt → 解压 → 替换 www */
        @JavascriptInterface
        public void applyUpdate(final String cb) { update(cb, false); }

        private void update(final String cb, final boolean wifiOnly) {
            if (!UPDATING.compareAndSet(false, true)) {
                cbError(cb, "正在更新，请稍后重试");
                return;
            }
            new Thread(new Runnable() {
                public void run() {
                    File tmp = new File(getFilesDir(), "update_tmp");
                    File archive = new File(getFilesDir(), "update.wgt");
                    try {
                        Network wifi = wifiOnly ? wifiNetwork() : null;
                        if (wifiOnly && wifi == null) { waitingWifi(cb); return; }
                        JSONObject remote = recentUpdate;
                        if (remote == null || android.os.SystemClock.elapsedRealtime() - recentAt >= 60000)
                            remote = fetchVersionJson(wifi);
                        if (remote == null) {
                            cbError(cb, "网络不通，稍后再试");
                            return;
                        }
                        if (remote.optInt("versionCode") < activeCode()) {
                            cbError(cb, "更新源版本落后于当前 v" + activeName() + "，暂时无法确认更新，请稍后重试");
                            return;
                        }
                        if (remote.optInt("versionCode") == activeCode()) {
                            JSONObject current = new JSONObject(); current.put("state", "uptodate");
                            current.put("version", activeName()); jsCallback(cb, current); return;
                        }
                        long expectedSize = remote.optLong("wgtSize", 0);
                        String expectedHash = remote.optString("wgtSha256", "");
                        if (expectedSize <= 0 || !expectedHash.matches("[a-fA-F0-9]{64}")) throw new Exception("更新信息缺少有效的完整性校验，请稍后重试");
                        downloadUpdate(remote, archive, tmp, wifi, wifiOnly, cb);
                        JSONObject packaged = new JSONObject(readLocal(new File(tmp, "manifest.json")));
                        if (packaged.optInt("versionCode") != remote.optInt("versionCode")
                                || !packaged.optString("versionName").equals(remote.optString("versionName"))) {
                            UpdateDownload.discard(archive);
                            throw new Exception("更新包版本与更新信息不一致，旧版已保留");
                        }
                        if (wifiOnly && !wifi.equals(wifiNetwork())) { waitingWifi(cb); return; }
                        UpdateStorage.install(tmp, wwwDir);
                        try { UpdateDownload.discard(archive); } catch (java.io.IOException ignored) { }
                        getSharedPreferences("eq_update", MODE_PRIVATE).edit().remove("pending").commit();
                        JSONObject ok = new JSONObject();
                        ok.put("state", "done");
                        ok.put("version", remote.optString("versionName"));
                        jsCallback(cb, ok);
                    } catch (Exception ex) {
                        if (wifiOnly && wifiNetwork() == null) waitingWifi(cb);
                        else cbError(cb, String.valueOf(ex));
                    } finally {
                        deleteRecursive(tmp);
                        UPDATING.set(false);
                    }
                }
            }).start();
        }

        private void downloadUpdate(JSONObject remote, File archive, File tmp, final Network wifi,
                                    final boolean wifiOnly, final String cb) throws Exception {
            long expectedSize = remote.optLong("wgtSize", 0);
            String expectedHash = remote.optString("wgtSha256", "");
            List<String> bases = new ArrayList<>();
            bases.add(remote.optString("_base", CDNS[0]));
            for (String base : CDNS) if (!bases.contains(base)) bases.add(base);
            Exception failure = null;
            for (String base : bases) {
                if (wifiOnly && !wifi.equals(wifiNetwork())) throw new java.io.IOException("Wi-Fi 已断开，等待重连后重试");
                deleteRecursive(tmp);
                if (!tmp.mkdirs()) throw new java.io.IOException("无法创建更新目录，请检查存储空间");
                URL u = new URL(base + remote.optString("wgt"));
                try {
                    UpdateDownload.fetch(u, archive, expectedSize, expectedHash,
                            new UpdateDownload.Connection() {
                                public HttpURLConnection open(URL url) throws Exception {
                                    return (HttpURLConnection) (wifi == null ? url.openConnection() : wifi.openConnection(url));
                                }
                            },
                            new UpdateDownload.Check() {
                                public void run() throws java.io.IOException {
                                    if (wifiOnly && !wifi.equals(wifiNetwork())) throw new java.io.IOException("Wi-Fi 已断开");
                                }
                            },
                            new UpdateDownload.Progress() {
                                public void update(long done, long total) throws Exception {
                                    JSONObject p = new JSONObject(); p.put("state", "downloading");
                                    p.put("progress", (double) done / total); jsCallback(cb, p);
                                }
                            });
                    try { UpdatePackage.verifyAndExtract(archive, tmp, expectedSize, expectedHash); }
                    catch (Exception invalid) { UpdateDownload.discard(archive); throw invalid; }
                    return;
                } catch (Exception e) { failure = e; }
            }
            throw new java.io.IOException("所有更新包下载源均失败，当前版本已保留，请稍后重试", failure);
        }

        private void waitingWifi(String cb) {
            try { JSONObject o = new JSONObject(); o.put("state", "waitingwifi"); jsCallback(cb, o); }
            catch (Exception ignored) { }
        }

        private void cbError(String cb, String msg) {
            try {
                JSONObject o = new JSONObject();
                o.put("state", "error");
                o.put("msg", msg);
                jsCallback(cb, o);
            } catch (Exception ignored) {
            }
        }
    }

    private int activeCode() {
        try {
            int code = new JSONObject(readLocal(new File(wwwDir, "manifest.json"))).optInt("versionCode");
            if (code > 0) return code;
        } catch (Exception ignored) { }
        int c = getSharedPreferences("app", MODE_PRIVATE).getInt("code", -1);
        if (c > 0) return c;
        try {
            return Integer.parseInt(readLocal(new File(wwwDir, "eq_version.txt")).trim());
        } catch (Exception e) {
            return 0;
        }
    }

    private String activeName() {
        try {
            String name = new JSONObject(readLocal(new File(wwwDir, "manifest.json"))).optString("versionName");
            if (!name.isEmpty()) return name;
        } catch (Exception ignored) { }
        String n = getSharedPreferences("app", MODE_PRIVATE).getString("name", null);
        if (n != null) return n;
        try {
            return readLocal(new File(wwwDir, "eq_version_name.txt")).trim();
        } catch (Exception e) {
            return "";
        }
    }

    private String readLocal(File f) throws Exception {
        FileInputStream fi = new FileInputStream(f);
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] b = new byte[4096];
        int n;
        while ((n = fi.read(b)) > 0) bo.write(b, 0, n);
        fi.close();
        return new String(bo.toByteArray(), "UTF-8");
    }

    /** 已经发现的新版本持久保存，旧CDN响应或暂时离线不能抹掉待完成更新。 */
    private JSONObject pendingUpdate() {
        try {
            String text = getSharedPreferences("eq_update", MODE_PRIVATE).getString("pending", "");
            if (text.isEmpty()) return null;
            JSONObject o = new JSONObject(text);
            if (o.optInt("versionCode") <= activeCode()) {
                getSharedPreferences("eq_update", MODE_PRIVATE).edit().remove("pending").commit();
                return null;
            }
            if (o.optString("wgt").matches("[A-Za-z0-9._-]+\\.wgt") && o.optLong("wgtSize", 0) > 0
                    && o.optString("wgtSha256").matches("[a-fA-F0-9]{64}")) return o;
        } catch (Exception ignored) { }
        return null;
    }

    /** 并行读取各源，缓存旧版本不能遮住其他源的新版本。 */
    private JSONObject fetchVersionJson() throws Exception { return fetchVersionJson(null); }

    private JSONObject fetchVersionJson(final Network wifi) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(CDNS.length);
        List<Callable<JSONObject>> tasks = new ArrayList<>();
        for (final String base : CDNS) {
            tasks.add(new Callable<JSONObject>() {
                public JSONObject call() throws Exception {
                    URL u = new URL(base + "version.json?t=" + System.currentTimeMillis());
                    HttpURLConnection c = (HttpURLConnection) (wifi == null ? u.openConnection() : wifi.openConnection(u));
                    c.setConnectTimeout(4000);
                    c.setReadTimeout(4000);
                    c.setUseCaches(false);
                    try {
                        if (c.getResponseCode() != 200) return null;
                        ByteArrayOutputStream bo = new ByteArrayOutputStream();
                        try (InputStream in = c.getInputStream()) {
                            byte[] b = new byte[4096];
                            int n;
                            while ((n = in.read(b)) != -1) {
                                if (bo.size() + n > 65536) return null;
                                bo.write(b, 0, n);
                            }
                        }
                        JSONObject o = new JSONObject(new String(bo.toByteArray(), "UTF-8"));
                        if (o.optInt("versionCode", 0) <= 0 || o.optString("versionName").trim().isEmpty()
                                || !o.optString("wgt").matches("[A-Za-z0-9._-]+\\.wgt")) return null;
                        // 新版本只有具备完整校验信息才可作为可安装候选。
                        if (o.optInt("versionCode") > activeCode() && (o.optLong("wgtSize", 0) <= 0
                                || !o.optString("wgtSha256").matches("[a-fA-F0-9]{64}"))) return null;
                        o.put("_base", base);
                        return o;
                    } finally { c.disconnect(); }
                }
            });
        }
        try {
            JSONObject best = pendingUpdate();
            for (Future<JSONObject> result : pool.invokeAll(tasks, 9, TimeUnit.SECONDS)) {
                if (result.isCancelled()) continue;
                try {
                    JSONObject candidate = result.get();
                    if (candidate != null && (best == null || candidate.optInt("versionCode") > best.optInt("versionCode")))
                        best = candidate;
                } catch (Exception ignored) { }
            }
            if (best != null && best.optInt("versionCode") > activeCode())
                getSharedPreferences("eq_update", MODE_PRIVATE).edit().putString("pending", best.toString()).commit();
            return best;
        } finally { pool.shutdownNow(); }
    }

    private void deleteRecursive(File f) {
        if (f == null || !f.exists()) return;
        File[] kids = f.listFiles();
        if (kids != null) {
            for (File k : kids) deleteRecursive(k);
        }
        f.delete();
    }
}
