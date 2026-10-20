// 自然拼读数据：26个字母（发音用中文提示+例词）+ 常见字母组合；可自行增删改
window.DB = window.DB || {};
window.DB.phonics = {
  "letters": [
    {"l": "A", "zh": "发\"哎\"（嘴巴张大）", "words": ["apple", "ant"]},
    {"l": "B", "zh": "像拼音 b（啵）", "words": ["bag", "bird"]},
    {"l": "C", "zh": "像拼音 c（呲）", "words": ["cat", "cake"]},
    {"l": "D", "zh": "像拼音 d（得）", "words": ["dog", "duck"]},
    {"l": "E", "zh": "发\"诶\"（嘴巴扁扁）", "words": ["egg", "elephant"]},
    {"l": "F", "zh": "像拼音 f（夫）", "words": ["fish", "five"]},
    {"l": "G", "zh": "像拼音 g（哥）", "words": ["girl", "green"]},
    {"l": "H", "zh": "像拼音 h（喝）", "words": ["hat", "hand"]},
    {"l": "I", "zh": "发\"衣\"（短促一点）", "words": ["pig", "big"]},
    {"l": "J", "zh": "像拼音 j（机）", "words": ["jam", "jump"]},
    {"l": "K", "zh": "像拼音 k（科）", "words": ["kite", "key"]},
    {"l": "L", "zh": "像拼音 l（勒）", "words": ["lion", "leg"]},
    {"l": "M", "zh": "像拼音 m（摸）", "words": ["monkey", "milk"]},
    {"l": "N", "zh": "像拼音 n（讷）", "words": ["nose", "nine"]},
    {"l": "O", "zh": "发\"欧\"（嘴巴圆圆）", "words": ["orange", "on"]},
    {"l": "P", "zh": "像拼音 p（泼）", "words": ["pen", "pig"]},
    {"l": "Q", "zh": "读\"阔一\"连起来", "words": ["queen", "quiet"]},
    {"l": "R", "zh": "像\"若\"（小舌头发音）", "words": ["red", "run"]},
    {"l": "S", "zh": "像拼音 s（丝）", "words": ["sun", "six"]},
    {"l": "T", "zh": "像拼音 t（特）", "words": ["tiger", "ten"]},
    {"l": "U", "zh": "发\"乌\"（短促一点）", "words": ["umbrella", "up"]},
    {"l": "V", "zh": "上牙咬住下唇再发\"夫\"", "words": ["van", "five"]},
    {"l": "W", "zh": "读\"屋-不溜\"连快些", "words": ["water", "window"]},
    {"l": "X", "zh": "读\"克斯\"", "words": ["box", "fox"]},
    {"l": "Y", "zh": "像\"叶\"的声母 y", "words": ["yellow", "yes"]},
    {"l": "Z", "zh": "像拼音 z（兹）", "words": ["zoo", "zero"]}
  ],
  "combos": [
    {"s": "sh", "zh": "发\"嘘——\"（像让别人安静）", "words": ["sheep", "ship"]},
    {"s": "ch", "zh": "像拼音 ch（吃）", "words": ["chair", "lunch"]},
    {"s": "th", "zh": "轻轻咬住舌尖再发音", "words": ["three", "mouth"]},
    {"s": "ee", "zh": "拖长的\"衣——\"", "words": ["green", "three"]},
    {"s": "oo", "zh": "短短的\"乌\"", "words": ["book", "zoo"]},
    {"s": "ai", "zh": "读\"诶——\"", "words": ["rain", "train"]},
    {"s": "oa", "zh": "拖长的\"欧——\"", "words": ["boat", "coat"]},
    {"s": "ck", "zh": "短短促的\"克\"", "words": ["duck", "clock"]},
    {"s": "ng", "zh": "鼻音\"哼\"（拼音后鼻音）", "words": ["sing", "king"]},
    {"s": "or", "zh": "拖长的\"奥——\"", "words": ["fork", "horse"]}
  ]
};
