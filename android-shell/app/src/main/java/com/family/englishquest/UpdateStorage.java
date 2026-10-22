package com.family.englishquest;

import java.io.File;
import java.io.IOException;

/** 资源目录切换与进程中断后的恢复；学习存档位于 WebView 数据目录，不在这里。 */
public final class UpdateStorage {
    public static synchronized void recover(File root) throws IOException {
        File current = new File(root, "www");
        File old = new File(root, "www_old");
        if (!current.exists() && old.exists() && !old.renameTo(current))
            throw new IOException("恢复旧版资源失败，请重启应用");
        // current 已存在表示目录切换完成，版本以其中的 manifest 为准。
        if (current.exists()) remove(old);
    }

    public static synchronized void install(File incoming, File current) throws IOException {
        File old = new File(current.getParentFile(), "www_old");
        remove(old);
        boolean hadCurrent = current.exists();
        if (hadCurrent && !current.renameTo(old)) throw new IOException("资源被占用，请重启应用后再试");
        if (!incoming.renameTo(current)) {
            if (hadCurrent && !old.renameTo(current))
                throw new IOException("替换资源失败，旧版已保留，下次启动自动恢复");
            throw new IOException("替换资源失败，旧版已恢复");
        }
        // 保留 old 到下次启动；中断发生在两次 rename 之间时可恢复。
    }

    private static void remove(File file) throws IOException {
        if (!file.exists()) return;
        File[] children = file.listFiles();
        if (children != null) for (File child : children) remove(child);
        if (!file.delete()) throw new IOException("无法清理旧版资源，请重启应用后再试");
    }
}
