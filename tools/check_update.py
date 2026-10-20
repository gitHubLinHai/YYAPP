# -*- coding: utf-8 -*-
"""检查热更新 CDN 是否在线（模拟手机上的检查流程）"""
import urllib.request

URLS = [
    ('jsdelivr主源', 'https://cdn.jsdelivr.net/gh/gitHubLinHai/YYAPP@main/release/version.json'),
    ('jsdelivr备用', 'https://fastly.jsdelivr.net/gh/gitHubLinHai/YYAPP@main/release/version.json'),
    ('github直连', 'https://raw.githubusercontent.com/gitHubLinHai/YYAPP/main/release/version.json'),
]
for name, url in URLS:
    try:
        r = urllib.request.urlopen(url, timeout=12)
        print(name, 'OK:', r.read().decode()[:110])
    except Exception as e:
        print(name, 'FAIL:', e)
