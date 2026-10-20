# -*- coding: utf-8 -*-
"""诊断 jsDelivr 对本仓库的同步状态"""
import urllib.request

TESTS = [
    ('仓库文件(index.html)', 'https://fastly.jsdelivr.net/gh/gitHubLinHai/YYAPP@main/index.html'),
    ('版本信息(release)', 'https://fastly.jsdelivr.net/gh/gitHubLinHai/YYAPP@main/release/version.json'),
    ('jsDelivr状态接口', 'https://data.jsdelivr.com/v1/packages/gh/gitHubLinHai/YYAPP@main?structure=flat'),
]
for name, url in TESTS:
    try:
        r = urllib.request.urlopen(url, timeout=15)
        body = r.read().decode()
        print(name, 'OK:', body[:130].replace('\n', ' '))
    except Exception as e:
        print(name, 'FAIL:', e)
