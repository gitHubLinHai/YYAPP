# -*- coding: utf-8 -*-
"""生成热更新资源包(.wgt) + 版本信息(version.json)，并自动升版本号。

用法:
  D:\\SC2地图工坊\\py\\python.exe tools\\make_wgt.py            # 版本号+1，打新包
  D:\\SC2地图工坊\\py\\python.exe tools\\make_wgt.py --no-bump   # 用当前版本号重新打包

产物在 release/ 目录:
  EnglishQuest-v{版本}.wgt   资源包（APK不用重装，手机自动下载替换）
  version.json               版本信息（App 据此判断是否有新版本）

发版流程: 生成wgt → git add release manifest.json → git push → 手机上等1分钟或点"检查更新"
"""
import argparse, json, os, zipfile

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(BASE, 'manifest.json')
OUT = os.path.join(BASE, 'release')

INCLUDE = ['index.html', 'manifest.json']
DIRS = ['css', 'js', 'data', 'audio']

parser = argparse.ArgumentParser(description='生成 App 热更新资源包')
parser.add_argument('--no-bump', action='store_true', help='使用当前版本重新打包')
parser.add_argument('--notes', default='词库与游戏资源更新', help='手机更新提示中的版本说明')
args = parser.parse_args()
bump = not args.no_bump

man = json.load(open(MANIFEST, encoding='utf-8'))
if bump:
    codes = man['versionName'].split('.')
    codes[-1] = str(int(codes[-1]) + 1)
    man['versionName'] = '.'.join(codes)
    man['versionCode'] = int(man.get('versionCode', 100)) + 1
    json.dump(man, open(MANIFEST, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print('版本已升级: %s (versionCode=%d)' % (man['versionName'], man['versionCode']))

wgt_name = 'EnglishQuest-v%s.wgt' % man['versionName']
os.makedirs(OUT, exist_ok=True)
wgt_path = os.path.join(OUT, wgt_name)
if os.path.exists(wgt_path):
    os.remove(wgt_path)

with zipfile.ZipFile(wgt_path, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for f in INCLUDE:
        z.write(os.path.join(BASE, f), f)
    for d in DIRS:
        src = os.path.join(BASE, d)
        for root, _, files in os.walk(src):
            for fn in files:
                p = os.path.join(root, fn)
                z.write(p, os.path.relpath(p, BASE))

info = {
    'versionName': man['versionName'],
    'versionCode': man['versionCode'],
    'wgt': wgt_name,
    'notes': args.notes,
}
with open(os.path.join(OUT, 'version.json'), 'w', encoding='utf-8') as f:
    json.dump(info, f, ensure_ascii=False, indent=2)

size_mb = os.path.getsize(wgt_path) / 1048576
print('已生成: release/%s (%.1f MB)' % (wgt_name, size_mb))
print('已生成: release/version.json')
print('发版: git add -A && git commit -m "v%s" && git push' % man['versionName'])
