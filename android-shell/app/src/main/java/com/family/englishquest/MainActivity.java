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
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * 英语拼读闯关 - WebView 外壳
 * 资源优先加载 files/www（热更后目录），首次启动从 assets/www 拷贝。
 * 热更流程：JS 调 AndroidBridge.startCheck → 拉各CDN version.json 比对版本
 *          → JS 调 applyUpdate → 流式下载 wgt(zip) 解压到 update_tmp → 原子替换 www → JS reload。
 */
public class MainActivity extends Activity {

    /** 与 js/update.js 保持一致的三源列表（fastly 在国内可直连，放最前） */
    private static final String[] CDNS = {
            "https://fastly.jsdelivr.net/gh/gitHubLinHai/YYAPP@main/release/",
            "https://cdn.jsdelivr.net/gh/gitHubLinHai/YYAPP@main/release/",
            "https://raw.githubusercontent.com/gitHubLinHai/YYAPP/main/release/"
    };

    private WebView web;
    private File wwwDir;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        wwwDir = new File(getFilesDir(), "www");
        try {
            android.content.pm.PackageInfo pkg = getPackageManager().getPackageInfo(getPackageName(), 0);
            if (!new File(wwwDir, "index.html").exists() || pkg.versionCode > activeCode()) {
                copyAssets("www", wwwDir);
                getSharedPreferences("app", MODE_PRIVATE).edit().putInt("code", pkg.versionCode)
                        .putString("name", pkg.versionName).commit();
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
                        JSONObject o = new JSONObject();
                        if (next <= activeCode()) {
                            o.put("state", "uptodate");
                        } else {
                            o.put("state", "found");
                        }
                        o.put("version", remote.optString("versionName"));
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
            new Thread(new Runnable() {
                public void run() {
                    File tmp = new File(getFilesDir(), "update_tmp");
                    try {
                        Network wifi = wifiOnly ? wifiNetwork() : null;
                        if (wifiOnly && wifi == null) { waitingWifi(cb); return; }
                        JSONObject remote = fetchVersionJson(wifi);
                        if (remote == null) {
                            cbError(cb, "网络不通，稍后再试");
                            return;
                        }
                        String base = remote.optString("_base", CDNS[0]);
                        deleteRecursive(tmp);
                        tmp.mkdirs();

                        URL u = new URL(base + remote.optString("wgt") + "?t=" + System.currentTimeMillis());
                        HttpURLConnection c = (HttpURLConnection) (wifi == null ? u.openConnection() : wifi.openConnection(u));
                        c.setConnectTimeout(10000);
                        c.setReadTimeout(30000);
                        if (c.getResponseCode() != 200) {
                            cbError(cb, "下载失败 HTTP " + c.getResponseCode());
                            return;
                        }
                        long total = c.getContentLength();
                        long done = 0, lastPost = 0;
                        ZipInputStream z = new ZipInputStream(c.getInputStream());
                        byte[] buf = new byte[16384];
                        ZipEntry entry;
                        while ((entry = z.getNextEntry()) != null) {
                            File out = new File(tmp, entry.getName());
                            if (!out.getCanonicalPath().startsWith(tmp.getCanonicalPath() + File.separator)) throw new Exception("更新包路径无效");
                            if (entry.isDirectory()) {
                                out.mkdirs();
                                continue;
                            }
                            out.getParentFile().mkdirs();
                            FileOutputStream fo = new FileOutputStream(out);
                            int n;
                            while ((n = z.read(buf)) > 0) {
                                if (wifiOnly && !wifi.equals(wifiNetwork())) { fo.close(); z.close(); c.disconnect(); deleteRecursive(tmp); waitingWifi(cb); return; }
                                fo.write(buf, 0, n);
                                done += n;
                            }
                            fo.close();
                            if (total > 0 && System.currentTimeMillis() - lastPost > 300) {
                                lastPost = System.currentTimeMillis();
                                JSONObject p = new JSONObject();
                                p.put("state", "downloading");
                                p.put("progress", (double) done / (double) total);
                                jsCallback(cb, p);
                            }
                        }
                        z.close();

                        if (!new File(tmp, "index.html").exists()) {
                            cbError(cb, "更新包内容不完整");
                            return;
                        }
                        File old = new File(getFilesDir(), "www_old");
                        deleteRecursive(old);
                        if (!wwwDir.renameTo(old)) {
                            cbError(cb, "资源被占用，请重启应用后再试");
                            return;
                        }
                        if (!tmp.renameTo(wwwDir)) {
                            old.renameTo(wwwDir);
                            cbError(cb, "替换资源失败");
                            return;
                        }
                        deleteRecursive(old);
                        getSharedPreferences("app", MODE_PRIVATE).edit()
                                .putInt("code", remote.optInt("versionCode"))
                                .putString("name", remote.optString("versionName"))
                                .commit();
                        JSONObject ok = new JSONObject();
                        ok.put("state", "done");
                        ok.put("version", remote.optString("versionName"));
                        jsCallback(cb, ok);
                    } catch (Exception ex) {
                        deleteRecursive(tmp);
                        if (wifiOnly && wifiNetwork() == null) waitingWifi(cb);
                        else cbError(cb, String.valueOf(ex));
                    }
                }
            }).start();
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
        int c = getSharedPreferences("app", MODE_PRIVATE).getInt("code", -1);
        if (c > 0) return c;
        try {
            return Integer.parseInt(readLocal(new File(wwwDir, "eq_version.txt")).trim());
        } catch (Exception e) {
            return 0;
        }
    }

    private String activeName() {
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

    /** 依次尝试各 CDN 拉取 version.json，成功时把命中的源写进 _base 字段 */
    private JSONObject fetchVersionJson() throws Exception { return fetchVersionJson(null); }

    private JSONObject fetchVersionJson(Network wifi) throws Exception {
        for (String base : CDNS) {
            try {
                URL u = new URL(base + "version.json?t=" + System.currentTimeMillis());
                HttpURLConnection c = (HttpURLConnection) (wifi == null ? u.openConnection() : wifi.openConnection(u));
                c.setConnectTimeout(8000);
                c.setReadTimeout(8000);
                if (c.getResponseCode() == 200) {
                    InputStream in = c.getInputStream();
                    ByteArrayOutputStream bo = new ByteArrayOutputStream();
                    byte[] b = new byte[4096];
                    int n;
                    while ((n = in.read(b)) > 0) bo.write(b, 0, n);
                    in.close();
                    JSONObject o = new JSONObject(new String(bo.toByteArray(), "UTF-8"));
                    o.put("_base", base);
                    return o;
                }
            } catch (Exception ignored) {
            }
        }
        return null;
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
