"""在 JVM 执行实际安卓多源选择方法；仅替换 Android Network、JSON 和 HTTP 边界。"""
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
java = Path(r'C:\Program Files\Unity 6000.0.59f2\Editor\Data\PlaybackEngines\AndroidPlayer\OpenJDK\bin')
source = (root / 'android-shell/app/src/main/java/com/family/englishquest/MainActivity.java').read_text(encoding='utf-8')
start = source.index('    private JSONObject fetchVersionJson()')
method = source[start:source.index('    private void deleteRecursive', start)]
harness = r'''
import java.io.*;
import java.net.*;
import java.util.*;
import java.util.concurrent.*;
public class NativeUpdateTest {
    static String[] CDNS = {"https://one/", "https://two/", "https://three/"};
    static volatile String[] replies;
    static CountDownLatch started;
    static int activeCode() { return 105; }
    static class Network {
        URLConnection openConnection(URL u) throws Exception { return u.openConnection(); }
    }
    // 固定响应夹具不测试平台 JSON 解析器；参与选择的是实际生产方法。
    static class JSONObject {
        final Map<String,Object> values = new HashMap<>();
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
                    public void connect() {}
                    public void disconnect() {}
                    public boolean usingProxy() { return false; }
                    public int getResponseCode() throws IOException {
                        started.countDown();
                        try { if (!started.await(2, TimeUnit.SECONDS)) throw new AssertionError("Sources were checked serially"); }
                        catch (InterruptedException e) { throw new IOException(e); }
                        return 200;
                    }
                    public InputStream getInputStream() throws IOException {
                        int index = Arrays.asList("one", "two", "three").indexOf(url.getHost());
                        String reply = replies[index];
                        if (reply == null) throw new SocketTimeoutException("fixture timeout");
                        return new ByteArrayInputStream(reply.getBytes("UTF-8"));
                    }
                };
            }
        });
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
harness = harness.replace('    public static void main', method + '\n    public static void main')
with tempfile.TemporaryDirectory(prefix='yyapp-update-') as temp:
    work = Path(temp)
    (work / 'NativeUpdateTest.java').write_text(harness, encoding='utf-8')
    subprocess.run([str(java / 'javac.exe'), '-encoding', 'UTF-8', str(work / 'NativeUpdateTest.java')], check=True)
    subprocess.run([str(java / 'java.exe'), '-cp', str(work), 'NativeUpdateTest'], check=True)
