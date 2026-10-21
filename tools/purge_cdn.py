# -*- coding: utf-8 -*-
"""刷新 jsDelivr 对 release/version.json 的缓存（发版后如手机迟迟查不到更新，可运行本脚本）"""
import json, urllib.request, time
from pathlib import Path

PURGE_URL = 'https://purge.jsdelivr.net/gh/gitHubLinHai/YYAPP@main/release/version.json'
PROXY = 'http://127.0.0.1:7897'   # 本机 Clash Verge 混合端口；没有代理软件时改为 None

opener = urllib.request.build_opener(
    urllib.request.ProxyHandler({'http': PROXY, 'https': PROXY} if PROXY else {}))
try:
    r = opener.open(PURGE_URL, timeout=15)
    data = json.loads(r.read().decode())
    print('purge 结果:', json.dumps(data, ensure_ascii=False)[:300])
except Exception as e:
    print('purge 失败:', e)

# 清缓存接口成功不代表所有节点已更新；按实际返回版本逐源核对。
expected = json.loads((Path(__file__).resolve().parents[1] / 'release/version.json').read_text(encoding='utf-8'))['versionCode']
op2 = urllib.request.build_opener(urllib.request.ProxyHandler({}))
for base in ['https://fastly.jsdelivr.net/gh/gitHubLinHai/YYAPP@main/release/',
             'https://cdn.jsdelivr.net/gh/gitHubLinHai/YYAPP@main/release/',
             'https://raw.githubusercontent.com/gitHubLinHai/YYAPP/main/release/']:
    try:
        with op2.open(base + 'version.json?t=%d' % int(time.time() * 1000), timeout=15) as response:
            info = json.load(response)
        print(base, '已同步' if info.get('versionCode') == expected else '尚未同步', info.get('versionCode'), '目标', expected)
    except Exception as e:
        print(base, '验证失败:', e)
