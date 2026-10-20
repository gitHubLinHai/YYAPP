# -*- coding: utf-8 -*-
"""刷新 jsDelivr 对 release/version.json 的缓存（发版后如手机迟迟查不到更新，可运行本脚本）"""
import json, urllib.request

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

# 再验证 fastly 是否已能读到
try:
    op2 = urllib.request.build_opener(urllib.request.ProxyHandler({}))  # 直连，模拟手机
    r2 = op2.open('https://fastly.jsdelivr.net/gh/gitHubLinHai/YYAPP@main/release/version.json?t=%d' % 0, timeout=15)
    print('fastly 直连验证 OK:', r2.read().decode()[:120])
except Exception as e:
    print('fastly 直连验证:', e)
