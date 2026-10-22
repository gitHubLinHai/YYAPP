package com.family.englishquest;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.security.MessageDigest;
import java.util.Enumeration;
import java.util.HashSet;
import java.util.zip.CRC32;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/** 在临时目录验证更新包，不触碰当前使用的资源。 */
public final class UpdatePackage {
    private static final String[] CORE_FILES = {
            "index.html", "manifest.json", "css/style.css", "css/learning.css", "css/care.css",
            "js/app.js", "js/update.js", "js/learning.js", "js/care.js", "data/grade1.js",
            "data/grade2.js", "data/grade3.js", "data/phonics.js", "data/vocabulary.js", "data/textbook.js"
    };

    public static void verifyAndExtract(File archive, File target, long expectedSize, String expectedHash) throws Exception {
        if (expectedSize <= 0 || !expectedHash.matches("[a-fA-F0-9]{64}"))
            throw new IOException("更新信息缺少有效的完整性校验，请稍后重试");
        if (archive.length() != expectedSize) throw new IOException("更新包大小不符，旧版已保留");
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] buffer = new byte[16384];
        try (InputStream input = new FileInputStream(archive)) {
            int n;
            while ((n = input.read(buffer)) != -1) digest.update(buffer, 0, n);
        }
        StringBuilder actualHash = new StringBuilder();
        for (byte b : digest.digest()) actualHash.append(String.format("%02x", b & 255));
        if (!actualHash.toString().equalsIgnoreCase(expectedHash)) throw new IOException("更新包校验失败，旧版已保留");

        HashSet<String> paths = new HashSet<>();
        String root = target.getCanonicalPath() + File.separator;
        try (ZipFile zip = new ZipFile(archive)) {
            Enumeration<? extends ZipEntry> entries = zip.entries();
            while (entries.hasMoreElements()) {
                ZipEntry entry = entries.nextElement();
                File out = new File(target, entry.getName());
                String path = out.getCanonicalPath();
                if (!path.startsWith(root) || !paths.add(path)) throw new IOException("更新包路径无效或重复");
                if (entry.isDirectory()) { out.mkdirs(); continue; }
                out.getParentFile().mkdirs();
                CRC32 crc = new CRC32();
                long written = 0;
                try (InputStream input = zip.getInputStream(entry); FileOutputStream output = new FileOutputStream(out)) {
                    int n;
                    while ((n = input.read(buffer)) != -1) {
                        output.write(buffer, 0, n); crc.update(buffer, 0, n); written += n;
                    }
                }
                if (written != entry.getSize() || crc.getValue() != entry.getCrc()) throw new IOException("更新包文件损坏，旧版已保留");
            }
        }
        for (String name : CORE_FILES) {
            File file = new File(target, name);
            if (!file.isFile() || file.length() == 0) throw new IOException("更新包缺少必要文件：" + name);
        }
    }
}
