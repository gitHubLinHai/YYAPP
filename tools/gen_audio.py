# -*- coding: utf-8 -*-
"""批量生成单词/例句/字母发音 MP3。
用法: D:\\SC2地图工坊\\py\\python.exe tools\\gen_audio.py
- 数据来源: ../data/*.js (纯JSON内嵌)
- 输出:     ../audio/words/、../audio/sent/、../audio/letters/
- 已存在的文件会跳过，可重复运行
"""
import asyncio, json, os, re, sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(BASE, 'data')
VOICE_WORD = 'en-US-AnaNeural'    # 童声，适合小学生
VOICE_SENT = 'en-US-AnaNeural'
RATE_WORD = '-15%'
RATE_SENT = '-8%'

# phonics 里用到但不在年级词库里的例词，也要生成音频
EXTRA_WORDS = ['girl', 'jam', 'key', 'queen', 'quiet', 'umbrella', 'van',
               'fox', 'zero', 'horse', 'sheep', 'ant', 'up', 'lunch',
               'king', 'fork', 'rain', 'coat']


def slug(t):
    return re.sub(r'[^a-z0-9]+', '-', t.lower()).strip('-')


def load_js(path):
    txt = open(path, encoding='utf-8').read()
    m = re.search(r'window\.DB\.\w+\s*=\s*', txt)
    start = txt.index('{', m.end())
    return json.JSONDecoder().raw_decode(txt[start:])[0]


def collect():
    words, sents = {}, {}
    for f in ('grade1.js', 'grade2.js', 'grade3.js', 'textbook.js'):
        db = load_js(os.path.join(DATA, f))
        for u in db['units']:
            for w in u['words']:
                words[w['w']] = True
                sents[w['ex']] = True
    for db in load_js(os.path.join(DATA, 'textbooks.js')).values():
        for u in db['units']:
            for w in u['words']:
                words[w['w']] = True
                sents[w['ex']] = True
    ph = load_js(os.path.join(DATA, 'phonics.js'))
    for grp in ('letters', 'combos'):
        for it in ph[grp]:
            for w in it['words']:
                words[w] = True
    for w in EXTRA_WORDS:
        words[w] = True
    # 独立积累词库使用紧凑的“英文|释义|建议年级”数据，不属于课程单元。
    vocab = open(os.path.join(DATA, 'vocabulary.js'), encoding='utf-8').read()
    for block in re.findall(r'var (?:rows|extra) = `([^`]+)`', vocab):
        for row in block.splitlines():
            words[row.split('|')[0]] = True
    return sorted(words), sorted(sents)


async def gen_one(sem, text, voice, rate, path):
    if os.path.exists(path) and os.path.getsize(path) > 500:
        return 0
    async with sem:
        import edge_tts
        for attempt in range(3):
            try:
                tts = edge_tts.Communicate(text, voice, rate=rate, proxy=os.environ.get('EDGE_TTS_PROXY'))
                await tts.save(path + '.part')
                if os.path.getsize(path + '.part') <= 500:
                    raise ValueError('生成的音频为空或不完整')
                os.replace(path + '.part', path)
                return 1
            except Exception as e:
                if attempt == 2:
                    if os.path.exists(path + '.part'):
                        os.remove(path + '.part')
                    print('FAIL %s: %s' % (path, type(e).__name__))
                    return -1
                await asyncio.sleep(1.5)


async def main():
    try:
        import edge_tts  # noqa
    except ImportError:
        print('请先安装: python -m pip install edge-tts')
        sys.exit(1)

    words, sents = collect()
    letters = [chr(c) for c in range(ord('A'), ord('Z') + 1)]
    tasks = []
    sem = asyncio.Semaphore(6)

    out_w = os.path.join(BASE, 'audio', 'words'); os.makedirs(out_w, exist_ok=True)
    out_s = os.path.join(BASE, 'audio', 'sent'); os.makedirs(out_s, exist_ok=True)
    out_l = os.path.join(BASE, 'audio', 'letters'); os.makedirs(out_l, exist_ok=True)

    seen = set()
    for w in words:
        if slug(w) in seen:
            continue
        seen.add(slug(w))
        spoken = {'a/an': 'a, an', 'PE': 'P E', 'TV': 'T V'}.get(w, w)
        tasks.append(gen_one(sem, spoken, VOICE_WORD, RATE_WORD, os.path.join(out_w, slug(w) + '.mp3')))
    for s in sents:
        tasks.append(gen_one(sem, s, VOICE_SENT, RATE_SENT, os.path.join(out_s, slug(s) + '.mp3')))
    for l in letters:
        tasks.append(gen_one(sem, l, VOICE_WORD, '+0%', os.path.join(out_l, l.lower() + '.mp3')))
    out_ph = os.path.join(BASE, 'audio', 'phonics'); os.makedirs(out_ph, exist_ok=True)
    phonics = load_js(os.path.join(DATA, 'phonics.js'))
    ph_words = set()
    for lesson in phonics['course']:
        ph_words.update(lesson['practice'] + lesson['transfer'] + [m['w'] for m in lesson['models']])
    for w in sorted(ph_words):
        tasks.append(gen_one(sem, w, 'en-GB-SoniaNeural', RATE_WORD, os.path.join(out_ph, slug(w) + '.mp3')))

    print('共 %d 个音频任务(单词%d 例句%d 字母26)...' % (len(tasks), len(words), len(sents)))
    done, failed = 0, 0
    for i, r in enumerate(asyncio.as_completed(tasks)):
        if await r < 0:
            failed += 1
        done += 1
        if done % 50 == 0:
            print('进度 %d/%d' % (done, len(tasks)))
    if failed:
        print('音频未全部完成：%d 个失败，请重试。' % failed)
        sys.exit(1)
    print('完成！输出目录:', os.path.join(BASE, 'audio'))

if __name__ == '__main__':
    asyncio.run(main())
