# -*- coding: utf-8 -*-
"""一键本地打包 APK（无需 HBuilderX / DCloud 账号）。

用法: D:\\SC2地图工坊\\py\\python.exe tools\\build_apk.py
1. 从 manifest.json 读版本号（versionName/versionCode）
2. 把网页资源同步进 android-shell/app/src/main/assets/www
3. 生成 app/build.gradle、AndroidManifest.xml（版本号注入）
4. 调用本机 Gradle 6.1.1 + JDK8 + Android SDK 构建 debug APK
5. 产物复制到 release/英语拼读闯关-v{版本}.apk

首次构建需联网（走 Clash 代理下载 Gradle 依赖），之后可离线构建。
"""
import json, os, shutil, subprocess, sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHELL = os.path.join(BASE, 'android-shell')
APP = os.path.join(SHELL, 'app')
MAIN = os.path.join(APP, 'src', 'main')

JAVA_HOME = r'C:\Program Files\Java\jdk-1.8'
SDK_DIR = r'D:\unity2021.3.27f1\SDK'
GRADLE = r'D:\unity2021.3.27f1\gradle\bin\gradle.bat'
PKG = 'com.family.englishquest'
APP_NAME = '英语拼读闯关'

man = json.load(open(os.path.join(BASE, 'manifest.json'), encoding='utf-8'))
vc, vn = man['versionCode'], man['versionName']
print('== 打包 %s v%s (versionCode=%d) ==' % (APP_NAME, vn, vc))

# 1. 同步网页资源
www = os.path.join(MAIN, 'assets', 'www')
if os.path.exists(www):
    shutil.rmtree(www)
os.makedirs(www)
for item in ['index.html', 'css', 'js', 'data', 'audio', 'manifest.json']:
    src = os.path.join(BASE, item)
    dst = os.path.join(www, item)
    if os.path.isdir(src):
        shutil.copytree(src, dst)
    else:
        shutil.copy2(src, dst)
open(os.path.join(www, 'eq_version.txt'), 'w').write(str(vc))
open(os.path.join(www, 'eq_version_name.txt'), 'w').write(vn)
print('[1/4] 网页资源已同步 (%.1f MB)' % (sum(
    os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(www) for f in fs) / 1048576))

# 2. 图标
icon_dir = os.path.join(MAIN, 'res', 'mipmap-xxhdpi')
os.makedirs(icon_dir, exist_ok=True)
shutil.copy2(os.path.join(BASE, 'icon.png'), os.path.join(icon_dir, 'icon.png'))

# 3. 生成构建配置
os.makedirs(os.path.join(APP, 'src', 'main', 'res', 'values'), exist_ok=True)
with open(os.path.join(APP, 'build.gradle'), 'w', encoding='utf-8') as f:
    f.write('''apply plugin: 'com.android.application'

android {
    compileSdkVersion 29
    buildToolsVersion "29.0.3"
    defaultConfig {
        applicationId "%s"
        minSdkVersion 21
        targetSdkVersion 29
        versionCode %d
        versionName "%s"
    }
    buildTypes {
        release { minifyEnabled false }
    }
    compileOptions {
        sourceCompatibility JavaVersion.VERSION_1_8
        targetCompatibility JavaVersion.VERSION_1_8
    }
}

dependencies {}
''' % (PKG, vc, vn))
with open(os.path.join(MAIN, 'AndroidManifest.xml'), 'w', encoding='utf-8') as f:
    f.write('''<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="%s" android:versionCode="%d" android:versionName="%s">
    <uses-permission android:name="android.permission.INTERNET"/>
    <application
        android:label="@string/app_name"
        android:icon="@mipmap/icon"
        android:allowBackup="true"
        android:theme="@android:style/Theme.Black.NoTitleBar.Fullscreen">
        <activity android:name=".MainActivity"
            android:exported="true"
            android:screenOrientation="portrait"
            android:configChanges="orientation|screenSize|keyboardHidden">
            <intent-filter>
                <action android:name="android.intent.action.MAIN"/>
                <category android:name="android.intent.category.LAUNCHER"/>
            </intent-filter>
        </activity>
    </application>
</manifest>
''' % (PKG, vc, vn))
with open(os.path.join(MAIN, 'res', 'values', 'strings.xml'), 'w', encoding='utf-8') as f:
    f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <string name="app_name">%s</string>\n</resources>\n' % APP_NAME)
with open(os.path.join(SHELL, 'local.properties'), 'w') as f:
    f.write('sdk.dir=%s\n' % (SDK_DIR.replace('\\', '/').replace(':', '\\:')))
print('[2/4] 构建配置已生成')

# 4. Gradle 构建
env = dict(os.environ)
env['JAVA_HOME'] = JAVA_HOME
env['PATH'] = JAVA_HOME + '\\bin;' + env.get('PATH', '')
print('[3/4] Gradle 构建中（首次约3-8分钟，需代理在线）...')
r = subprocess.run([GRADLE, 'assembleDebug', '--no-daemon'],
                   cwd=SHELL, env=env, capture_output=True, text=True)
tail = '\n'.join((r.stdout or '').splitlines()[-12:])
print(tail)
if r.returncode != 0:
    print('构建失败，错误输出末尾：')
    print('\n'.join((r.stderr or '').splitlines()[-25:]))
    sys.exit(1)

# 5. 复制产物
out = os.path.join(APP, 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')
rel = os.path.join(BASE, 'release')
os.makedirs(rel, exist_ok=True)
apk = os.path.join(rel, '%s-v%s.apk' % (APP_NAME, vn))
shutil.copy2(out, apk)
print('[4/4] APK 已生成: %s (%.1f MB)' % (apk, os.path.getsize(apk) / 1048576))
