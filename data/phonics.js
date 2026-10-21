// 字母名称与例词中的发音分开学习；提示只描述所列例词，音标以英式为主。
window.DB = window.DB || {};
window.DB.phonics = {
  "letters": [
    {"l": "A", "zh": "apple 中 a 表示 /æ/，嘴张开，短音；字母名称 A 是 /eɪ/。", "words": ["apple", "ant"]},
    {"l": "B", "zh": "bag 中 b 表示 /b/：双唇闭合后放开，声带振动，不加汉语韵母。", "words": ["bag", "bird"]},
    {"l": "C", "zh": "cat 中 c 表示 /k/，舌后部抬起后释放；不是汉语拼音 c。", "words": ["cat", "cake"]},
    {"l": "D", "zh": "dog 中 d 表示 /d/：舌尖抵上齿龈后放开，声带振动。", "words": ["dog", "duck"]},
    {"l": "E", "zh": "egg 中 e 表示 /e/，嘴微张，短音；字母名称 E 是 /iː/。", "words": ["egg", "elephant"]},
    {"l": "F", "zh": "fish 中 f 表示 /f/：上齿轻触下唇，气流持续通过。", "words": ["fish", "five"]},
    {"l": "G", "zh": "girl 中 g 表示 /ɡ/：舌后部抬起，声带振动。", "words": ["girl", "green"]},
    {"l": "H", "zh": "hat 中 h 表示 /h/：轻轻呼气，不加汉语韵母。", "words": ["hat", "hand"]},
    {"l": "I", "zh": "pig 中 i 表示 /ɪ/，短促、放松；字母名称 I 是 /aɪ/。", "words": ["pig", "big"]},
    {"l": "J", "zh": "jam 中 j 表示 /dʒ/，先阻气再摩擦，声带振动。", "words": ["jam", "jump"]},
    {"l": "K", "zh": "kite 中 k 表示 /k/：与 cat 的首音相同。", "words": ["kite", "key"]},
    {"l": "L", "zh": "lion 中 l 表示 /l/：舌尖抵上齿龈，让气流从舌两侧通过。", "words": ["lion", "leg"]},
    {"l": "M", "zh": "monkey 中 m 表示 /m/：双唇闭合，声音从鼻腔出来。", "words": ["monkey", "milk"]},
    {"l": "N", "zh": "nose 中 n 表示 /n/：舌尖抵上齿龈，声音从鼻腔出来。", "words": ["nose", "nine"]},
    {"l": "O", "zh": "on 中 o 表示 /ɒ/（英式），短音；字母名称 O 是 /əʊ/。", "words": ["orange", "on"]},
    {"l": "P", "zh": "pen 中 p 表示 /p/：双唇闭合后放开，声带不振动。", "words": ["pen", "pig"]},
    {"l": "Q", "zh": "queen 中 qu 常一起表示 /kw/；先发 /k/ 再接 /w/。", "words": ["queen", "quiet"]},
    {"l": "R", "zh": "red 中 r 表示 /r/，舌头不碰上颚；不是小舌音。", "words": ["red", "run"]},
    {"l": "S", "zh": "sun 中 s 表示 /s/：气流从舌尖附近通过，声带不振动。", "words": ["sun", "six"]},
    {"l": "T", "zh": "tiger 中 t 表示 /t/：舌尖抵上齿龈后放开，声带不振动。", "words": ["tiger", "ten"]},
    {"l": "U", "zh": "umbrella 中 u 表示 /ʌ/，嘴自然张开，短音；不是 /uː/。", "words": ["umbrella", "up"]},
    {"l": "V", "zh": "van 中 v 表示 /v/，上齿轻触下唇，声带振动；与 /f/ 不同。", "words": ["van", "five"]},
    {"l": "W", "zh": "water 中 w 表示 /w/，双唇先收圆再打开；字母名称不同。", "words": ["water", "window"]},
    {"l": "X", "zh": "box 中 x 表示 /ks/，出现在词尾；不是字母名称 /eks/。", "words": ["box", "fox"]},
    {"l": "Y", "zh": "yes 中 y 表示 /j/：舌面抬起后滑向后面的元音。", "words": ["yellow", "yes"]},
    {"l": "Z", "zh": "zoo 中 z 表示 /z/，与 /s/ 口形相近，但声带振动。", "words": ["zoo", "zero"]}
  ],
  "combos": [
    {"s": "sh", "zh": "sheep、ship 中 sh 表示 /ʃ/，轻轻送气。", "words": ["sheep", "ship"]},
    {"s": "ch", "zh": "chair、lunch 中 ch 表示 /tʃ/，先阻气再释放。", "words": ["chair", "lunch"]},
    {"s": "th", "zh": "three、mouth 中 th 表示 /θ/：舌尖轻放两齿之间送气；其他词中也可能读 /ð/。", "words": ["three", "mouth"]},
    {"s": "ee", "zh": "green、three 中 ee 表示长音 /iː/。", "words": ["green", "three"]},
    {"s": "oo", "zh": "oo 有不同发音：book /bʊk/ 是 /ʊ/；zoo /zuː/ 是 /uː/。", "words": ["book", "zoo"]},
    {"s": "ai", "zh": "rain、train 中 ai 表示双元音 /eɪ/。", "words": ["rain", "train"]},
    {"s": "oa", "zh": "boat、coat 中 oa 表示 /əʊ/（英式）。", "words": ["boat", "coat"]},
    {"s": "ck", "zh": "duck、clock 中 ck 一起表示 /k/。", "words": ["duck", "clock"]},
    {"s": "ng", "zh": "sing、king 中 ng 表示 /ŋ/，舌后部抬起，从鼻腔出声。", "words": ["sing", "king"]},
    {"s": "or", "zh": "fork、horse 中 or 表示 /ɔː/（英式）；结合完整例词听辨。", "words": ["fork", "horse"]}
  ]
};
