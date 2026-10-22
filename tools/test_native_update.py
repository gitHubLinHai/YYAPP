"""在 JVM 执行实际安卓多源选择方法；仅替换 Android Network、JSON 和 HTTP 边界。"""
from pathlib import Path
import subprocess
import tempfile
import zipfile
import hashlib

root = Path(__file__).resolve().parents[1]
java = Path(r'C:\Program Files\Unity 6000.0.59f2\Editor\Data\PlaybackEngines\AndroidPlayer\OpenJDK\bin')
source = (root / 'android-shell/app/src/main/java/com/family/englishquest/MainActivity.java').read_text(encoding='utf-8')
start = source.index('    private JSONObject fetchVersionJson()')
method = source[start:source.index('    private void deleteRecursive', start)]
download = source[source.index('        private void downloadUpdate('):source.index('        private void waitingWifi')]
versions = source[source.index('    private int activeCode()'):source.index('    /** 并行读取各源')]
delete = source[source.index('    private void deleteRecursive'):source.rfind('}')]
harness = r'''
import java.io.*;
import java.net.*;
import java.util.*;
import java.util.concurrent.*;
import java.nio.file.*;
import com.family.englishquest.UpdatePackage;
import com.family.englishquest.UpdateStorage;
public class NativeUpdateTest {
    static String[] CDNS = {"https://one/", "https://two/", "https://three/"};
    static volatile String[] replies;
    static CountDownLatch started;
    static String[] packageReplies;
    static byte[] packageBytes;
    static int packageAttempts;
    static Network connectedWifi;
    static Network wifiNetwork() { return connectedWifi; }
    static void jsCallback(String cb, JSONObject value) { }
    static void require(boolean value, String message) { if (!value) throw new AssertionError(message); }
    static void write(File file, String content) throws Exception {
        file.getParentFile().mkdirs(); Files.write(file.toPath(), content.getBytes("UTF-8"));
    }
    static void storageTests(File root) throws Exception {
        File current = new File(root, "www"), old = new File(root, "www_old"), incoming = new File(root, "incoming");
        write(new File(current, "index.html"), "old");
        require(current.renameTo(old), "simulate kill between renames");
        UpdateStorage.recover(root);
        require(new File(current, "index.html").isFile(), "recover previous resources");
        write(new File(incoming, "index.html"), "new");
        write(new File(incoming, "manifest.json"), "109");
        UpdateStorage.install(incoming, current);
        // 进程在安装完成、任何版本偏好写入之前被杀，重启应保留实际新资源。
        UpdateStorage.recover(root);
        NativeUpdateTest activity = new NativeUpdateTest(); activity.wwwDir = current;
        require(activity.activeCode() == 109, "manifest overrides stale version preferences");
        require(activity.activeName().equals("1.0.9"), "version name follows committed manifest");
        require(new String(Files.readAllBytes(new File(current, "index.html").toPath()), "UTF-8").equals("new"), "keep committed new resources");
        require(new File(current, "manifest.json").isFile(), "manifest follows actual resources");
        try { UpdateStorage.install(incoming, current); throw new AssertionError("missing incoming should fail"); }
        catch (IOException expected) { }
        require(new File(current, "index.html").isFile(), "restore after rename failure");
        require(!old.exists(), "rollback restores original path");
    }
    static void downloadTests(File root, String hash) throws Exception {
        JSONObject remote = new JSONObject("109");
        remote.put("wgtSize", packageBytes.length); remote.put("wgtSha256", hash);
        remote.put("_base", CDNS[0]);
        NativeUpdateTest test = new NativeUpdateTest();
        File archive = new File(root, "test.wgt"), tmp = new File(root, "incoming");
        for (String first : new String[]{"404", "timeout", "corrupt"}) {
            packageReplies = new String[]{first, "ok", "ok"}; packageAttempts = 0;
            test.downloadUpdate(remote, archive, tmp, null, false, "cb");
            require(packageAttempts == 2, "fallback after " + first);
            require(new File(tmp, "data/textbook.js").isFile(), "verified complete package");
        }
        packageReplies = new String[]{"404", "timeout", "corrupt"}; packageAttempts = 0;
        try { test.downloadUpdate(remote, archive, tmp, null, false, "cb"); throw new AssertionError("all sources failed"); }
        catch (IOException expected) { }
        require(packageAttempts == 3, "try all download sources");
        Network wifi = new Network(); connectedWifi = wifi;
        packageReplies = new String[]{"dropwifi", "ok", "ok"}; packageAttempts = 0;
        try { test.downloadUpdate(remote, archive, tmp, wifi, true, "cb"); throw new AssertionError("wifi disconnect must stop"); }
        catch (IOException expected) { }
        require(packageAttempts == 1, "must not switch to mobile or another network after wifi loss");
    }
    File wwwDir;
    static final int MODE_PRIVATE = 0;
    static class Prefs {
        int getInt(String key, int fallback) { return 105; }
        String getString(String key, String fallback) { return "1.0.5"; }
    }
    Prefs getSharedPreferences(String name, int mode) { return new Prefs(); }
    static class Network {
        URLConnection openConnection(URL u) throws Exception { return u.openConnection(); }
    }
    // 固定响应夹具不测试平台 JSON 解析器；参与选择的是实际生产方法。
    static class JSONObject {
        final Map<String,Object> values = new HashMap<>();
        JSONObject() { }
        JSONObject(String body) {
            int code = Integer.parseInt(body);
            values.put("versionCode", code);
            values.put("versionName", "1.0." + (code - 100));
            values.put("wgt", "EnglishQuest.wgt");
            if (code != 999) {
                values.put("wgtSize", 123);
                values.put("wgtSha256", String.join("", Collections.nCopies(64, "a")));
            }
        }
        int optInt(String key) { return optInt(key, 0); }
        int optInt(String key, int fallback) { Object v=values.get(key); return v instanceof Number ? ((Number)v).intValue() : fallback; }
        long optLong(String key, long fallback) { return optInt(key, (int)fallback); }
        String optString(String key) { Object v=values.get(key); return v == null ? "" : v.toString(); }
        String optString(String key, String fallback) { return values.containsKey(key) ? optString(key) : fallback; }
        void put(String key, Object value) { values.put(key, value); }
    }
    static void verify(String[] data, int expected, String host, boolean wifi) throws Exception {
        replies = data; started = new CountDownLatch(3);
        JSONObject result = new NativeUpdateTest().fetchVersionJson(wifi ? new Network() : null);
        if (expected == 0) {
            if (result != null) throw new AssertionError("Expected no usable source");
        } else if (result == null || result.optInt("versionCode") != expected || !result.optString("_base").equals("https://" + host + "/")) {
            throw new AssertionError("Wrong selected source/version");
        }
    }
    public static void main(String[] args) throws Exception {
        URL.setURLStreamHandlerFactory(protocol -> new URLStreamHandler() {
            protected URLConnection openConnection(URL url) {
                return new HttpURLConnection(url) {
                    boolean counted;
                    public void connect() {}
                    public void disconnect() {}
                    public boolean usingProxy() { return false; }
                    public int getResponseCode() throws IOException {
                        if (url.getPath().endsWith(".wgt")) {
                            if (!counted) { packageAttempts++; counted = true; }
                            int index = Arrays.asList("one", "two", "three").indexOf(url.getHost());
                            String reply = packageReplies[index];
                            if (reply.equals("timeout")) throw new SocketTimeoutException("fixture timeout");
                            if (reply.equals("404")) return 404;
                            if (reply.equals("dropwifi")) connectedWifi = null;
                            return 200;
                        }
                        started.countDown();
                        try { if (!started.await(2, TimeUnit.SECONDS)) throw new AssertionError("Sources were checked serially"); }
                        catch (InterruptedException e) { throw new IOException(e); }
                        return 200;
                    }
                    public InputStream getInputStream() throws IOException {
                        int index = Arrays.asList("one", "two", "three").indexOf(url.getHost());
                        if (url.getPath().endsWith(".wgt")) {
                            byte[] bytes = packageBytes.clone();
                            if (packageReplies[index].equals("corrupt")) bytes[0] ^= 1;
                            return new ByteArrayInputStream(bytes);
                        }
                        String reply = replies[index];
                        if (reply == null) throw new SocketTimeoutException("fixture timeout");
                        return new ByteArrayInputStream(reply.getBytes("UTF-8"));
                    }
                };
            }
        });
        packageBytes = Files.readAllBytes(Paths.get(args[0]));
        storageTests(new File(args[1], "storage"));
        downloadTests(new File(args[1], "download"), args[2]);
        verify(new String[]{"103", "108", "107"}, 108, "two", false);
        verify(new String[]{"103", null, "108"}, 108, "three", false);
        verify(new String[]{"999", "108", null}, 108, "two", false);
        verify(new String[]{"103", "104", null}, 104, "two", false);
        verify(new String[]{null, null, null}, 0, "", false);
        verify(new String[]{"108", "107", "103"}, 108, "one", true);
        System.out.println("Native source selection passed: parallel, stale primary, timeout, invalid integrity, all stale, all offline, Wi-Fi binding path.");
    }
'''
harness += '\n}\n'
harness = harness.replace('    public static void main', method + versions + download + delete + '\n    public static void main')
with tempfile.TemporaryDirectory(prefix='yyapp-update-') as temp:
    work = Path(temp)
    (work / 'NativeUpdateTest.java').write_text(harness, encoding='utf-8')
    subprocess.run([str(java / 'javac.exe'), '-encoding', 'UTF-8', '-d', str(work), str(root / 'android-shell/app/src/main/java/com/family/englishquest/UpdatePackage.java'), str(root / 'android-shell/app/src/main/java/com/family/englishquest/UpdateStorage.java'), str(work / 'NativeUpdateTest.java')], check=True)
    package = work / 'fixture.wgt'
    core = ['index.html', 'manifest.json', 'css/style.css', 'css/learning.css', 'css/care.css',
            'js/app.js', 'js/update.js', 'js/learning.js', 'js/care.js', 'data/grade1.js',
            'data/grade2.js', 'data/grade3.js', 'data/phonics.js', 'data/vocabulary.js', 'data/textbook.js']
    with zipfile.ZipFile(package, 'w') as z:
        for name in core:
            z.writestr(name, b'fixture')
    subprocess.run([str(java / 'java.exe'), '-cp', str(work), 'NativeUpdateTest', str(package),
                    str(work), hashlib.sha256(package.read_bytes()).hexdigest()], check=True)
    print('Download failover, corrupt package rejection, Wi-Fi loss, interrupted swap recovery and rollback passed.')
