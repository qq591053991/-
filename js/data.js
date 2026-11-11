'use strict';
/* 凡人问道 —— 数据：剧情、章节、敌人、神通、法宝、感悟、灵药、奇遇
   故事背景取材自小说《凡人修仙传》（忘语 著），本文件全部文案为同人原创改写。 */
(function () {
  const G = window.G, U = G.U;

  G.REALMS = ['炼气期', '筑基期', '结丹期', '元婴期'];
  G.POTION_MAX = 5; // 丹药携带上限

  G.Story = {
    intro: [
      '越国，镜州。\n你和这世上大多数人一样：出身寻常，资质寻常，连名字都寻常得没人记得住。',
      '十岁那年，你被带上彩霞山，成了七玄门的一名记名弟子，\n又被神手谷的墨大夫挑中，日复一日苦修一套无名口诀。',
      '后来你才知道，这世上真有御剑飞天、移山填海的人。\n他们把你这样的人，叫作「凡人」。',
      '修哪一门功法，走哪一条路，没有人替你安排。\n凡人问道，从这一步开始。',
    ],
    ending: [
      '天都尸火渐渐熄灭，极阴祖师的遁光消失在殿外。\n你带着鼎中至宝离开虚天殿，寻了一处无人海岛闭关。',
      '不知多少寒暑之后，洞府石门缓缓开启。\n丹破婴生——元婴，已成。',
      '凡人之躯，亦可问道长生。\n此后的路还很长，但那已是另一个故事了。',
    ],
  };

  /* ---------------- 章节 ---------------- */
  G.Chapters = [
    {
      name: '神手谷', title: '第一章 · 七玄门', theme: 0, music: 'ch0',
      card: '口诀已练至第四层，墨大夫看你的眼神却愈发炽热。\n野狼帮趁夜攻山，谷中杀机四伏——\n活下去，然后弄清师父的真面目。',
      pool: ['thug', 'archer', 'wolf', 'ironslave'],
      boss: 'modaifu', rooms: 9,
      bossIntro: [
        ['墨大夫', '好徒儿……长春功第四层。为师等这一天，足足等了四年。'],
        ['你', '师父传我口诀，原来只为今日夺我肉身。'],
        ['墨大夫', '乖乖站着别动。你这副身躯，为师用得上。'],
      ],
      bossOutro: '墨大夫体内的残魂尖啸着溃散。\n你收起他留下的遗物，背上行囊，头也不回地离开了七玄门。\n山外，是修仙者的世界。',
      breakthrough: { realm: false, title: '长春功 · 大成', desc: '功法圆满，气血上限 +25，伤害 +12%，气血法力尽复。' },
    },
    {
      name: '血色禁地', title: '第二章 · 血色禁地', theme: 1, music: 'ch1',
      card: '你拜入黄枫谷，成了药园里一名不起眼的杂役弟子。\n为求一枚筑基丹，你随众人踏入七派共掌的血色禁地。\n此间灵药遍生，妖兽横行——而同道，比妖兽更加危险。',
      pool: ['bat', 'toad', 'centipede', 'flower', 'disciple'],
      boss: 'mojiao', rooms: 10,
      bossIntro: [
        ['旁白', '湖心石台上灵药生辉。水面无风起浪，一头墨色蛟龙自水底缓缓睁开了眼。'],
        ['你', '守护灵药的妖兽……竟是一头墨蛟。'],
      ],
      bossOutro: '墨蛟伏诛，湖水尽染墨色。\n你带着满囊灵药走出禁地，换来了那枚梦寐以求的筑基丹。',
      breakthrough: { realm: true, title: '服筑基丹 · 突破筑基', desc: '灵力化液，寿元大增。气血上限 +40，法力上限 +30，伤害 +20%。\n筑基已成，可择一门【主修功法】：一经选定，此生只修这一门。' },
    },
    {
      name: '燕翎堡', title: '第三章 · 魔焰滔天', theme: 2, music: 'ch2',
      card: '魔道六宗大举入侵越国。\n已经筑基的你奉命驰援燕翎堡，\n却撞进了鬼灵门少主布下的杀局。',
      pool: ['ghostcult', 'bloodguard', 'ironcorpse', 'flamecult', 'wraith'],
      boss: 'wangchan', rooms: 10,
      bossIntro: [
        ['王蝉', '黄枫谷的小辈？来得正好。本少主的血灵大法，还缺几道生魂祭炼。'],
        ['你', '鬼灵门少主……看来今日难以善了。'],
      ],
      bossOutro: '血光散尽，王蝉重伤遁走。可七派败局已定。\n你启动了那座尘封的古传送阵——\n阵光亮起，再睁眼，已是万里之外的乱星海。',
      breakthrough: { realm: true, title: '海外苦修 · 凝结金丹', desc: (p) => '金丹一成，方算踏入大道。气血上限 +50，法力上限 +40，伤害 +22%，冷却 -8%。\n' + (p.main === 'du'
        ? '以百毒祭炼成本命法宝【万毒幡】：飞剑命中积攒毒煞，\n满后按 V 放出「万毒瘴」——毒瘴随身七秒，瘴中敌人层层中毒。'
        : '以万年天雷竹炼成本命法宝【青竹蜂云剑】：飞剑命中有几率引动辟邪神雷；\n命中积攒剑意，满后按 V 施展「蜂云剑阵」——七十二口飞剑齐出。') },
    },
    {
      name: '虚天殿', title: '第四章 · 虚天残图', theme: 3, music: 'ch3',
      card: '乱星海三百年一开的虚天殿现世。\n结丹有成的你混在寻宝的众修之中，闯过冰火两道——\n内殿深处，元婴老怪极阴祖师已等候多时。',
      pool: ['icepuppet', 'firespirit', 'puppetarcher', 'golem', 'yinhun'],
      boss: 'jiyin', rooms: 11,
      bossIntro: [
        ['极阴祖师', '区区结丹小辈，也敢觊觎虚天鼎？把你身上的宝物和秘密，一并留下吧。'],
        ['你', '前辈以大欺小，晚辈也只好拼死一搏了。'],
      ],
      bossOutro: '',
      breakthrough: { realm: true, title: '丹破婴生 · 元婴大成', desc: '' },
    },
  ];

  /* ---------------- 敌人 ----------------
     ai: melee 近战 / charger 冲锋 / ranged 远程 / lobber 抛射 / caster 落雷 /
         swarm 飞扑 / turret 炮台 / tank 重击 / teleporter 瞬移 / exploder 自爆 / summoner 召唤 */
  G.Enemies = {
    // —— 第一章 ——
    thug: { name: '野狼帮众', gl: { v: 'thug', show: ['Barbarian_Hat', '1H_Axe'], atk: 'chop1' }, ai: 'melee', hp: 30, spd: 108, dmg: 8, r: 13, xp: 5, cost: 1,
      draw: 'human', look: { robe: '#6a5038', trim: '#33261a', hat: 'band', weapon: 'saber', skin: '#d9a877' } },
    archer: { name: '野狼帮弓手', gl: { v: 'archer', show: ['2H_Crossbow'], atk: 'shoot2' }, ai: 'ranged', hp: 22, spd: 92, dmg: 7, r: 12, xp: 6, cost: 1.4, keep: 300,
      shot: { kind: 'arrow', spd: 400, n: 1, cd: 2.3 },
      draw: 'human', look: { robe: '#4d5a3a', trim: '#262e1c', hat: 'bamboo', weapon: 'bow', skin: '#d9a877' } },
    wolf: { name: '灰狼', ai: 'charger', hp: 26, spd: 125, dmg: 10, r: 13, xp: 5, cost: 1.2,
      draw: 'wolf', look: { fur: '#7d7f86', dark: '#4a4c54', eye: '#ffd45e' } },
    ironslave: { name: '铁奴', gl: { v: 'ironslave', show: ['Knight_Helmet'], atk: 'chop2', s: 1.22, walk: 1 }, ai: 'tank', hp: 95, spd: 62, dmg: 14, r: 19, xp: 14, cost: 3,
      draw: 'brute', look: { body: '#5d6470', dark: '#343943', eye: '#ff5a3c', skin: '#8c8f96' } },
    // —— 第二章 ——
    bat: { name: '血蝠', ai: 'swarm', hp: 15, spd: 190, dmg: 7, r: 10, xp: 3, cost: 0.7, fly: true,
      draw: 'bat', look: { body: '#6e1f2a', wing: '#3d0f18', eye: '#ffcf4a' } },
    toad: { name: '毒蟾', ai: 'lobber', hp: 42, spd: 55, dmg: 10, r: 15, xp: 8, cost: 1.8,
      draw: 'toad', look: { body: '#5b7a3a', dark: '#34491f', spot: '#b7d65a', eye: '#ffb03a' } },
    centipede: { name: '铁背蜈蚣', ai: 'charger', hp: 60, spd: 110, dmg: 13, r: 15, xp: 9, cost: 2,
      draw: 'centipede', look: { body: '#4a3a5c', dark: '#2a2036', leg: '#c9853a', eye: '#ff4d4d' } },
    flower: { name: '食人妖花', ai: 'turret', hp: 50, spd: 0, dmg: 8, r: 15, xp: 8, cost: 1.8, pattern: 'ring', pn: 8, pcd: 3.0,
      draw: 'flower', look: { petal: '#c23a5a', dark: '#7a1f38', stem: '#3f6a34', core: '#ffd45e' } },
    disciple: { name: '掩月宗弟子', gl: { v: 'disciple', show: ['1H_Wand'], atk: 'cast' }, ai: 'ranged', hp: 46, spd: 100, dmg: 9, r: 13, xp: 9, cost: 2, keep: 280,
      shot: { kind: 'fire', spd: 330, n: 3, spread: 0.22, cd: 2.6 },
      draw: 'human', look: { robe: '#7a5fa8', trim: '#e5d7ff', hat: 'bun', weapon: 'staff', skin: '#f0cfae' } },
    // —— 第三章 ——
    ghostcult: { name: '鬼灵门弟子', gl: { v: 'ghostcult', show: ['Rogue_Cape'], atk: 'raise' }, ai: 'summoner', hp: 70, spd: 85, dmg: 10, r: 13, xp: 11, cost: 2.2, keep: 320, evil: true,
      draw: 'human', look: { robe: '#2f3b33', trim: '#7dffb0', hat: 'hood', weapon: 'staff', skin: '#b9c7b5' } },
    bloodguard: { name: '血侍', gl: { v: 'bloodguard', show: ['Knife', 'Knife_Offhand'], atk: 'chop1' }, ai: 'melee', hp: 85, spd: 150, dmg: 14, r: 13, xp: 10, cost: 2, lunge: true, evil: true,
      draw: 'human', look: { robe: '#7a1a22', trim: '#2a0a0e', hat: 'mask', weapon: 'saber', skin: '#d0a6a0' } },
    ironcorpse: { name: '铁尸', gl: { v: 'ironcorpse', show: ['Skeleton_Warrior_Helmet'], atk: 'chop2', s: 1.2, walk: 1 }, ai: 'tank', hp: 210, spd: 58, dmg: 20, r: 19, xp: 18, cost: 3.2, evil: true,
      draw: 'brute', look: { body: '#3f5548', dark: '#22302a', eye: '#9dff6a', skin: '#7c9484', talisman: true } },
    flamecult: { name: '魔焰门修士', gl: { v: 'flamecult', show: ['2H_Staff'], atk: 'raise' }, ai: 'caster', hp: 75, spd: 88, dmg: 15, r: 13, xp: 11, cost: 2.3, keep: 300, evil: true,
      draw: 'human', look: { robe: '#3b2a55', trim: '#ff7b3a', hat: 'hood', weapon: 'staff', skin: '#c9b0a8' } },
    wraith: { name: '鬼影', ai: 'teleporter', hp: 55, spd: 120, dmg: 13, r: 13, xp: 9, cost: 1.8, fly: true, evil: true,
      draw: 'ghost', look: { body: '#9dffd0', dark: '#2f6a58', eye: '#ffffff' } },
    skull: { name: '噬魂鬼首', ai: 'swarm', hp: 16, spd: 170, dmg: 9, r: 9, xp: 1, cost: 0.5, fly: true, evil: true, minion: true,
      draw: 'skull', look: { body: '#b8ffd8', dark: '#3c7a60', eye: '#ff4d6a' } },
    // —— 第四章 ——
    icepuppet: { name: '玄冰傀儡', ai: 'turret', hp: 150, spd: 0, dmg: 14, r: 16, xp: 13, cost: 2.2, pattern: 'aim3', pcd: 2.4,
      draw: 'crystal', look: { body: '#9fe0ff', dark: '#3f7fb0', core: '#ffffff' } },
    firespirit: { name: '火灵', ai: 'exploder', hp: 70, spd: 165, dmg: 22, r: 12, xp: 9, cost: 1.5, fly: true,
      draw: 'flame', look: { body: '#ff8a2a', dark: '#c2360f', core: '#fff0a0' } },
    puppetarcher: { name: '机关傀儡', ai: 'ranged', hp: 130, spd: 105, dmg: 14, r: 14, xp: 13, cost: 2.4, keep: 300,
      shot: { kind: 'bolt', spd: 460, n: 1, burst: 3, cd: 2.6 },
      draw: 'puppet', look: { body: '#b89a5a', dark: '#6a5428', eye: '#6affea' } },
    golem: { name: '镇殿石卫', gl: { v: 'golem', show: ['Knight_Helmet', '2H_Sword'], atk: 'chop2', s: 1.36, walk: 1 }, ai: 'tank', hp: 380, spd: 60, dmg: 26, r: 21, xp: 22, cost: 3.5,
      draw: 'brute', look: { body: '#7f8fa8', dark: '#465066', eye: '#6ad0ff', skin: '#aab8cc', stone: true } },
    yinhun: { name: '玄阴魂', ai: 'teleporter', hp: 110, spd: 130, dmg: 18, r: 13, xp: 12, cost: 2, fly: true, evil: true,
      draw: 'ghost', look: { body: '#b79dff', dark: '#3d2f7a', eye: '#ffe07a' } },
    corpse: { name: '铜甲尸', gl: { v: 'corpse', show: [], atk: 'punch', s: 1.12 }, ai: 'melee', hp: 260, spd: 110, dmg: 22, r: 16, xp: 10, cost: 2.5, evil: true, minion: true,
      draw: 'brute', look: { body: '#8a6a3a', dark: '#4a3618', eye: '#a0ff6a', skin: '#8f9a7a', talisman: true } },
  };

  G.Bosses = {
    modaifu: { name: '墨大夫', gl: { v: 'modaifu', show: [], atk: 'punch', s: 1.2 }, title: '神手谷主 · 夺舍者', xp: 60, hp: 2800, r: 16, spd: 120, dmg: 14, evil: false,
      draw: 'human', scale: 1.25,
      look: { robe: '#4a4f58', trim: '#c9ccd4', hat: 'elder', weapon: 'silverhand', skin: '#cdbfa8', hair: '#9a9a9a' } },
    mojiao: { name: '墨蛟', title: '禁地湖主', xp: 110, hp: 5400, r: 26, spd: 150, dmg: 22, evil: false, draw: 'jiao',
      look: { body: '#232838', dark: '#0e111a', belly: '#5a6a8a', eye: '#ffd45e' } },
    wangchan: { name: '王蝉', gl: { v: 'wangchan', show: ['Knight_Cape'], atk: 'cast', s: 1.22 }, title: '鬼灵门少主', xp: 160, hp: 18500, r: 16, spd: 140, dmg: 30, evil: true,
      draw: 'human', scale: 1.25,
      look: { robe: '#5a0f1a', trim: '#ff5a6a', hat: 'crown', weapon: 'none', skin: '#e6d0d0', hair: '#1a0a0e' } },
    jiyin: { name: '极阴祖师', gl: { v: 'jiyin', show: ['2H_Staff', 'Mage_Cape'], atk: 'raise', s: 1.3 }, title: '极阴岛主 · 元婴老怪', xp: 0, hp: 56000, r: 17, spd: 130, dmg: 40, evil: true,
      draw: 'human', scale: 1.35,
      look: { robe: '#1c2a24', trim: '#6aff9a', hat: 'elder', weapon: 'none', skin: '#a9b8a6', hair: '#d8e0d8' } },
  };

  /* ---------------- 流派 ----------------
     玩家不是谁的替身：修哪一门功法、走哪一条路都由自己构筑。
     每门神通、每件法宝都归属一个流派；流派决定它的色相与形（见 docs/art-philosophy.md）。
     目前打磨完成的是「青竹一脉」——剑、雷、虫、傀这几路，也就是韩立所修的那一套。 */
  G.Schools = {
    sword:   { name: '剑', color: '#6effc8' },
    thunder: { name: '雷', color: '#ffe36a' },
    fire:    { name: '火', color: '#ff9a3c' },
    ice:     { name: '冰', color: '#8fd8ff' },
    bug:     { name: '虫', color: '#e0b040' },
    puppet:  { name: '傀', color: '#ffbe5a' },
    body:    { name: '体', color: '#c8d4e8' },
    blood:   { name: '魔', color: '#e8305a' },
    poison:  { name: '毒', color: '#9ac832' },
    earth:   { name: '土', color: '#d0a858' },
    ghost:   { name: '鬼', color: '#9a78ff' },
    misc:    { name: '杂', color: '#b8b0a0' },
  };

  /* ---------------- 神通（主动技能） ---------------- */
  G.Skills = {
    fireball: { name: '火弹术', sch: 'fire', glyph: '火', color: '#ff7a2a', mp: 16, cd: 2.4,
      desc: (lv) => `掷出火弹，命中后爆炸，造成 ${Math.round(30 * (1 + 0.35 * (lv - 1)))} 点范围伤害并灼烧。` },
    ice: { name: '冰锥术', sch: 'ice', glyph: '冰', color: '#7ad0ff', mp: 20, cd: 4,
      desc: (lv) => `扇形射出 ${4 + lv} 枚冰锥，各造成 ${Math.round(13 * (1 + 0.3 * (lv - 1)))} 点伤害并减速。` },
    formation: { name: '青元剑阵', sch: 'sword', glyph: '阵', color: '#6affc0', mp: 28, cd: 10,
      desc: (lv) => `${4 + lv * 2} 柄飞剑环身飞旋 6 秒，持续绞杀近身之敌。` },
    thunder: { name: '辟邪神雷', sch: 'thunder', glyph: '雷', color: '#ffe36a', mp: 26, cd: 6,
      desc: (lv) => `金色神雷劈向目标附近至多 ${3 + lv} 个敌人，造成 ${Math.round(34 * (1 + 0.35 * (lv - 1)))} 点伤害并短暂麻痹；对鬼、尸、魔修伤害 +60%。` },
    giant: { name: '巨剑术', sch: 'sword', glyph: '剑', color: '#a8e0ff', mp: 32, cd: 8,
      desc: (lv) => `一柄巨剑自天而降，对落点造成 ${Math.round(95 * (1 + 0.35 * (lv - 1)))} 点大范围伤害。` },
    beetles: { name: '噬金虫群', sch: 'bug', glyph: '虫', color: '#ffd24a', mp: 28, cd: 11,
      desc: (lv) => `放出 ${5 + lv * 2} 只噬金虫，自行追咬敌人，每只可啃噬多次。` },
    shield: { name: '玄铁盾', sch: 'body', glyph: '盾', color: '#c9d4e8', mp: 24, cd: 13,
      desc: (lv) => `祭出飞天盾，5 秒内吸收 ${35 + lv * 20} 点伤害；破碎或结束时震退周围敌人。` },
    puppet: { name: '傀儡术', sch: 'puppet', glyph: '傀', color: '#e0b46a', mp: 36, cd: 16,
      desc: (lv) => `放出一具机关傀儡，${10 + lv * 2} 秒内自动射击附近敌人。` },
    wuxing: { name: '颠倒五行阵', sch: 'earth', glyph: '五', color: '#e8d08a', mp: 30, cd: 14,
      desc: (lv) => `在脚下布下颠倒五行阵 ${6 + lv * 2} 秒：阵中敌人迟滞难行，你在阵中受到的伤害 -25%。` },
    tulao: { name: '土牢术', sch: 'earth', glyph: '牢', color: '#d0a858', mp: 22, cd: 9,
      desc: (lv) => `在目标处升起土牢，困住范围内的敌人 ${(1.6 + lv * 0.4).toFixed(1)} 秒，并造成 ${Math.round(22 * (1 + 0.35 * (lv - 1)))} 点伤害。` },
    xueying: { name: '血影遁', sch: 'blood', glyph: '影', color: '#e8305a', mp: 10, cd: 7,
      desc: (lv) => `燃血化影，远遁而去（消耗 8% 气血）；留在原地的血影随即爆开，造成 ${Math.round(60 * (1 + 0.35 * (lv - 1)))} 点范围伤害。` },
    xuezuan: { name: '血灵钻', sch: 'blood', glyph: '钻', color: '#ff5a7a', mp: 20, cd: 5,
      desc: (lv) => `射出一道血灵钻，贯穿沿途所有敌人，造成 ${Math.round(42 * (1 + 0.35 * (lv - 1)))} 点伤害；每贯穿一个敌人回复 2 点气血。` },
    jingzhe: { name: '惊蛰十二变', sch: 'body', glyph: '变', color: '#e0b878', mp: 40, cd: 22,
      desc: (lv) => `化身山岳巨猿 ${6 + lv * 2} 秒：伤害 +${40 + lv * 20}%，受到的伤害 -30%。` },
    duzhang: { name: '毒瘴', sch: 'poison', glyph: '瘴', color: '#9ac832', mp: 20, cd: 8,
      desc: (lv) => `在目标处放出一片毒瘴，持续 5 秒：瘴中敌人每半秒叠 ${lv >= 3 ? 2 : 1} 层毒，并受到 ${Math.round(5 * (1 + 0.3 * (lv - 1)))} 点伤害。` },
    shigu: { name: '蚀骨针', sch: 'poison', glyph: '针', color: '#b4e04a', mp: 16, cd: 5,
      desc: (lv) => `扇形射出 ${4 + lv} 枚毒针，每枚造成 ${Math.round(14 * (1 + 0.3 * (lv - 1)))} 点伤害并叠 3 层毒，可穿透两个敌人。` },
    blink: { name: '风雷翅', sch: 'thunder', glyph: '翅', color: '#b79dff', mp: 14, cd: 5,
      desc: (lv) => `化作雷光闪至目标位置，沿途造成 ${Math.round(26 * (1 + 0.35 * (lv - 1)))} 点雷击伤害，其间无敌。` },
  };

  /* ---------------- 法宝 / 功法（被动） ----------------
     rar: 1 凡品 2 珍品 3 至宝 */
  const R = (G.Relics = {
    changchun: { name: '长春功', kind: 'gong', sch: 'body', glyph: '春', rar: 1, desc: '每秒回复 1.2 点气血。', apply: (p) => { p.hpRegen += 1.2; } },
    zhayan: { name: '眨眼剑法', kind: 'gong', sch: 'sword', glyph: '瞬', rar: 1, desc: '暴击率 +12%。', apply: (p) => { p.crit += 0.12; } },
    luoyan: { name: '罗烟步', kind: 'gong', sch: 'body', glyph: '烟', rar: 2, desc: '遁术可用次数 +1。', apply: (p) => { p.dashMax += 1; p.dashN += 1; } },
    dayan: { name: '大衍诀', kind: 'gong', sch: 'puppet', glyph: '衍', rar: 2, desc: '神识大涨，神通冷却 -18%。', apply: (p) => { p.cdr += 0.18; } },
    jinlei: { name: '金雷竹', kind: 'bao', sch: 'thunder', glyph: '竹', rar: 3, desc: '飞剑命中有 25% 几率引动辟邪神雷，在敌人间跳跃 3 次。', apply: (p) => { p.flags.thunder = (p.flags.thunder || 0) + 1; } },
    chongluan: { name: '噬金虫', kind: 'pet', sch: 'bug', glyph: '虫', rar: 2, desc: '灵虫。一群金银相间的甲虫常驻身侧，自行追咬敌人；击杀敌人时有 40% 几率再孵出一只。', apply: (p) => { p.flags.beetle = 1; } },
    bingyan: { name: '乾蓝冰焰', kind: 'bao', sch: 'ice', glyph: '焰', rar: 2, desc: '飞剑附带冰焰：命中使敌人减速并持续灼伤。', apply: (p) => { p.flags.iceflame = 1; } },
    feitiandun: { name: '飞天盾', kind: 'bao', sch: 'body', glyph: '御', rar: 2, desc: '每 12 秒自动抵挡一次伤害。', apply: (p) => { p.flags.autoShield = 1; p.autoShieldT = 0; } },
    pingshan: { name: '平山印', kind: 'bao', sch: 'misc', glyph: '印', rar: 2, desc: '伤害 +10%；对精英与首领再 +20%。', apply: (p) => { p.dmgMul += 0.1; p.flags.bossBane = 1; } },
    zhizhu: { name: '血玉蜘蛛', kind: 'pet', sch: 'bug', glyph: '蛛', rar: 2, desc: '灵虫。跟在身侧，不时向敌人喷吐蛛网，网中敌人迟滞并持续中毒；你施展遁术后原地也会留下蛛网。', apply: (p) => { p.flags.web = 1; } },
    sanzhuan: { name: '三转重元功', kind: 'gong', sch: 'body', glyph: '转', rar: 1, desc: '法力上限 +40，法力回复 +35%。', apply: (p) => { p.maxMp += 40; p.mp += 40; p.mpRegen *= 1.35; } },
    lingshui: { name: '明清灵水', kind: 'dan', sch: 'misc', glyph: '明', rar: 1, desc: '灵目洞明：显露本层全部房间，灵石获取 +40%。', apply: (p) => { p.flags.reveal = 1; p.stoneMul += 0.4; } },
    lingru: { name: '万年灵乳', kind: 'dan', sch: 'misc', glyph: '乳', rar: 3, desc: '气血归零时，立刻回复全部气血法力（仅一次）。', apply: (p) => { p.flags.revive = (p.flags.revive || 0) + 1; } },
    zhuji: { name: '定灵丹', kind: 'dan', sch: 'misc', glyph: '丹', rar: 1, desc: '气血上限 +30，并回复等量气血。', apply: (p) => { p.maxHp += 30; p.hp += 30; }, stack: 9 },
    lianqi: { name: '敛气术', kind: 'gong', sch: 'body', glyph: '敛', rar: 1, desc: '对每个敌人的首次命中必定暴击。', apply: (p) => { p.flags.firstCrit = 1; } },
    zimu: { name: '金蚨子母刃', kind: 'bao', sch: 'sword', glyph: '蚨', rar: 2, desc: '飞剑命中后分出两柄子刃，向两侧激射。', apply: (p) => { p.flags.split = 1; } },
    tianjia: { name: '六丁天甲符', kind: 'bao', sch: 'body', glyph: '甲', rar: 2, desc: '受到的伤害 -15%，受击后的无敌时间延长。', apply: (p) => { p.armor += 0.15; p.invDur += 0.35; } },
    tihun: { name: '啼魂兽', kind: 'pet', sch: 'ghost', glyph: '魂', rar: 3, desc: '灵宠。专克阴魂：一声啼叫震慑身周的鬼、尸、魔修，并吞噬其中气血不足两成半者。你对它们的伤害 +40%。', apply: (p) => { p.flags.evilBane = 1; } },
    juling: { name: '聚灵阵盘', kind: 'bao', sch: 'misc', glyph: '聚', rar: 1, desc: '站立不动时，法力回复速度变为 3 倍。', apply: (p) => { p.flags.focus = 1; } },
    huixuan: { name: '回旋剑意', kind: 'gong', sch: 'sword', glyph: '旋', rar: 2, desc: '飞剑飞至尽头后折返，归途同样伤敌。', apply: (p) => { p.flags.boomerang = 1; } },
    xuemo: { name: '煞气诀', kind: 'gong', sch: 'blood', glyph: '煞', rar: 2, desc: '气血低于 40% 时，伤害 +40%。', apply: (p) => { p.flags.rage = 1; } },
    xutian: { name: '虚天残图', kind: 'bao', sch: 'misc', glyph: '图', rar: 3, desc: '伤害 +12%，气血上限 +25，冷却 -8%，移速 +6%。', apply: (p) => { p.dmgMul += 0.12; p.maxHp += 25; p.hp += 25; p.cdr += 0.08; p.speed *= 1.06; } },
    xueling: { name: '嗜血环', kind: 'bao', sch: 'blood', glyph: '嗜', rar: 2, desc: '每击杀一个敌人回复 2 点气血。', apply: (p) => { p.flags.leech = (p.flags.leech || 0) + 2; } },
    zhangtian: { name: '掌天瓶', kind: 'bao', sch: 'misc', glyph: '瓶', rar: 3, desc: '来历不明的碧绿小瓶，夜吸月华。每清空一间房多凝一滴灵露；药园里催熟灵药少费一滴（最少一滴）。', apply: (p) => { p.flags.vial = 1; } },
    // —— 功法 ——
    mingwang: { name: '明王诀', kind: 'gong', sch: 'body', glyph: '王', rar: 2, desc: '佛门炼体之术。受到的伤害 -12%，气血上限 +25。', apply: (p) => { p.armor += 0.12; p.maxHp += 25; p.hp += 25; } },
    fansheng: { name: '梵圣真魔功', kind: 'gong', sch: 'body', glyph: '梵', rar: 3, desc: '上古魔功炼体。气血上限 +60；受击时法相一震，击退身周敌人并反震伤害。', apply: (p) => { p.maxHp += 60; p.hp += 60; p.flags.fansheng = 1; } },
    baimai: { name: '百脉炼宝诀', kind: 'gong', sch: 'misc', glyph: '脉', rar: 2, desc: '以身养宝。每拥有一件法宝，伤害 +3%。', apply: (p) => { p.flags.baimai = 1; } },
    xuanyin: { name: '玄阴经', kind: 'gong', sch: 'blood', glyph: '阴', rar: 2, desc: '玄阴魔气护体。击杀敌人回复 3 点气血、4 点法力；魔、鬼两道的神通与法宝伤害 +25%。', apply: (p) => { p.flags.xuanyin = 1; p.schMul.blood = (p.schMul.blood || 0) + 0.25; p.schMul.ghost = (p.schMul.ghost || 0) + 0.25; } },
    xuelingfa: { name: '血灵大法', kind: 'gong', sch: 'blood', glyph: '灵', rar: 3, desc: '以血养法。气血越低出手越快：每损失一成气血，攻击速度 +6%。', apply: (p) => { p.flags.bloodHaste = 1; } },
    yuanci: { name: '元磁神光', kind: 'gong', sch: 'earth', glyph: '磁', rar: 2, desc: '周身元磁之力流转。靠近你的敌方弹幕减速四成。', apply: (p) => { p.flags.yuanci = 1; } },
    dageng: { name: '大庚剑阵', kind: 'gong', sch: 'sword', glyph: '庚', rar: 3, req: (p) => p.fy, desc: '以七十二口青竹蜂云剑布成的上古剑阵。蜂云剑阵化为大庚剑阵：在目标处布阵 7 秒，困住阵中敌人，万千剑丝往复绞杀，收阵时降下辟邪神雷。', apply: (p) => { p.dageng = 1; } },
    // —— 法宝：自动祭出 ——
    jinguang: { name: '金光砖', kind: 'bao', sch: 'earth', glyph: '砖', rar: 1, auto: 7, desc: '符宝。每 7 秒自动祭出：一块金砖砸向目标，造成 60 点范围伤害并震晕。', apply: () => {} },
    wulong: { name: '乌龙夺', kind: 'bao', sch: 'misc', glyph: '夺', rar: 1, auto: 4, desc: '每 4 秒自动祭出：一对乌钩飞旋而出，贯穿沿途敌人后折返，往返各造成 18 点伤害。', apply: () => {} },
    qingjiao: { name: '青蛟旗', kind: 'bao', sch: 'ice', glyph: '蛟', rar: 2, auto: 9, desc: '每 9 秒自动祭出：旗中青蛟冲出，贯穿一线，造成 45 点伤害并撞退敌人。', apply: () => {} },
    hunyuan: { name: '混元钵', kind: 'bao', sch: 'body', glyph: '钵', rar: 2, desc: '铜钵绕身飞旋，收走碰到的敌方弹幕。每 10 秒至多收 12 枚。', apply: (p) => { p.flags.bowl = 1; p.bowlN = 12; p.bowlT = 0; } },
    tianleizi: { name: '天雷子', kind: 'bao', sch: 'thunder', glyph: '子', rar: 2, auto: 8, desc: '每 8 秒自动掷出：一枚天雷子在目标处炸开，造成 70 点范围伤害并麻痹。', apply: () => {} },
    sanyan: { name: '三焰扇', kind: 'bao', sch: 'fire', glyph: '扇', rar: 3, auto: 11, desc: '每 11 秒自动祭出：一扇之下，赤、金、蓝三色灵焰成扇面席卷而出，灼烧沿途一切敌人。', apply: () => {} },
    baling: { name: '八灵尺', kind: 'bao', sch: 'misc', glyph: '尺', rar: 3, auto: 13, desc: '每 13 秒自动祭出：尺中八道兽灵向八方奔出，各造成 35 点贯穿伤害。', apply: () => {} },
    guiluo: { name: '鬼罗幡', kind: 'bao', sch: 'ghost', glyph: '幡', rar: 2, auto: 9, desc: '每 9 秒自动祭出：幡中飞出五只鬼头，追噬敌人，各造成 20 点伤害。', apply: () => {} },
    xuemojian: { name: '血魔剑', kind: 'bao', sch: 'blood', glyph: '魔', rar: 2, auto: 3.2, desc: '每 3 秒自动挥出：一道血色剑光横扫前方，造成 30 点贯穿伤害；每斩中一个敌人回复 1 点气血。', apply: () => {} },
    yuancishan: { name: '元磁神山', kind: 'bao', sch: 'earth', glyph: '山', rar: 3, auto: 10, desc: '每 10 秒自动祭出：小山当空压下，先将周围敌人吸向落点，再造成 90 点范围伤害。', apply: () => {} },
    ziluo: { name: '紫罗极火', kind: 'bao', sch: 'fire', glyph: '极', rar: 3, desc: '紫色寒焰环身不熄：身周敌人持续受到灼伤并迟滞。', apply: (p) => { p.flags.ziluo = 1; } },
    xuejing: { name: '雪晶珠', kind: 'bao', sch: 'ice', glyph: '珠', rar: 2, auto: 9, desc: '每 9 秒自动催动：寒气四散，冻结身周敌人 1.2 秒并造成 30 点伤害。', apply: () => {} },
    heifeng: { name: '黑风旗', kind: 'bao', sch: 'misc', glyph: '旗', rar: 3, auto: 12, desc: '每 12 秒自动祭出：撕开一道空间裂缝，贯穿目标所在的一线，造成 110 点伤害。', apply: () => {} },
    xuantian: { name: '玄天斩灵剑', kind: 'bao', sch: 'sword', glyph: '玄', rar: 3, auto: 14, desc: '玄天之宝。每 14 秒自动斩出：一道横贯全场的巨大剑光，造成 150 点伤害。', apply: () => {} },
    // —— 法宝：被动 ——
    huanglin: { name: '皇鳞甲', kind: 'bao', sch: 'body', glyph: '鳞', rar: 2, desc: '受到的伤害 -10%；每 8 秒凝出一层可吸收 20 点伤害的鳞光。', apply: (p) => { p.armor += 0.1; p.flags.huanglin = 1; p.linT = 0; } },
    xutianding: { name: '虚天鼎', kind: 'bao', sch: 'misc', glyph: '鼎', rar: 3, desc: '每间房一次：受到致命伤害时遁入鼎中，免去这一击，无敌 2.5 秒并回复 25% 气血。', apply: (p) => { p.flags.ding = 1; p.dingReady = true; } },
    // —— 灵宠 / 灵虫 ——
    shuangwu: { name: '六翼霜蚣', kind: 'pet', sch: 'ice', glyph: '蚣', rar: 2, desc: '灵虫。振翅随行，每隔数秒向敌人喷出一片冰锥，冻伤并迟滞。', apply: () => {} },
    yinyue: { name: '银月', kind: 'pet', sch: 'misc', glyph: '月', rar: 3, desc: '器灵，化形为一只银狐。每 10 秒施展迷魂之术，令周围敌人失神 1.6 秒；法力回复 +25%。', apply: (p) => { p.mpRegen *= 1.25; } },
    tujia: { name: '土甲龙', kind: 'pet', sch: 'earth', glyph: '甲', rar: 1, desc: '灵宠。善于钻地：不时从敌人脚下破土而出，将其掀翻；还会刨出灵石，灵石获取 +30%。', apply: (p) => { p.stoneMul += 0.3; } },
    baolin: { name: '豹麟兽', kind: 'pet', sch: 'thunder', glyph: '麟', rar: 3, desc: '灵宠。迅疾如电，每隔数秒扑向目标，沿途撞伤并击退敌人；你的移动速度 +8%。', apply: (p) => { p.speed *= 1.08; } },
    quhun: { name: '曲魂', kind: 'pet', sch: 'ghost', glyph: '曲', rar: 2, desc: '炼尸。铜皮铁骨、力大无穷，会主动上前与敌人近身缠斗，替你挡在前面。', apply: () => {} },
    qidu: { name: '七毒水', kind: 'dan', sch: 'poison', glyph: '七', rar: 1, stack: 3, desc: '淬在剑上的七种毒。飞剑命中有三成几率叠一层毒（可叠加：每多一份多叠一层）。', apply: (p) => { p.flags.qidu = (p.flags.qidu || 0) + 1; } },
    wudu: { name: '五毒珠', kind: 'bao', sch: 'poison', glyph: '珠', rar: 2, desc: '以五种毒虫的内丹炼成。毒伤 +50%，毒层上限 +2。', req: (p) => p.psn > 0 || p.flags.qidu || p.skills.some((x) => x.id === 'duzhang' || x.id === 'shigu'), apply: (p) => { p.psnMul += 0.5; p.psnCap += 2; } },
    fugu: { name: '腐骨毒砂', kind: 'bao', sch: 'poison', glyph: '砂', rar: 2, desc: '遁术所过之处撒下一片毒砂，持续 4 秒：踩入的敌人迟滞，每 0.4 秒叠一层毒。', apply: (p) => { p.flags.psnDash = 1; } },
    shichong: { name: '尸虫丸', kind: 'dan', sch: 'poison', glyph: '虫', rar: 2, desc: '墨大夫用来控制人的毒丸，反过来也能养人。带毒的敌人死去时，为你回复 2 点气血、4 点法力。', req: (p) => p.psn > 0 || p.flags.qidu || p.skills.some((x) => x.id === 'duzhang' || x.id === 'shigu'), apply: (p) => { p.flags.psnFeed = 1; } },
    chanxiang: { name: '缠香丝', kind: 'bao', sch: 'poison', glyph: '丝', rar: 3, desc: '无色无味的奇毒。敌人的毒叠满时被缠住，定身 1.2 秒（同一个敌人 8 秒一次，首领不受影响）。', req: (p) => p.psn > 0 || p.flags.qidu || p.skills.some((x) => x.id === 'duzhang' || x.id === 'shigu'), apply: (p) => { p.flags.psnRoot = 1; } },
    renxing: { name: '人形傀儡', kind: 'pet', sch: 'puppet', glyph: '偶', rar: 3, desc: '大衍神君所留的傀儡，随行左右，持弓连射破灵箭，箭可贯穿两个敌人。', apply: () => {} },
    // —— 技艺（可修至三重） ——
    liandan: { name: '炼丹术', kind: 'craft', sch: 'misc', glyph: '炼', rar: 1, stack: 3, desc: '丹药回复量 +15%；清空房间时有一成几率炼成一枚丹药。每重叠加。', apply: (p) => { p.potionMul += 0.15; p.craft.dan = (p.craft.dan || 0) + 1; } },
    lianqi2: { name: '炼器术', kind: 'craft', sch: 'misc', glyph: '器', rar: 1, stack: 3, desc: '自动祭出的法宝伤害 +20%，间隔 -8%。每重叠加。', apply: (p) => { p.baoMul += 0.2; p.baoCd *= 0.92; } },
    zhenfa: { name: '阵法', kind: 'craft', sch: 'earth', glyph: '阵', rar: 2, stack: 3, desc: '每进入一处险地，自动在脚下布下颠倒五行阵（6 秒，每重 +2 秒）。', apply: (p) => { p.craft.zhen = (p.craft.zhen || 0) + 1; } },
    kuilei: { name: '傀儡术', kind: 'craft', sch: 'puppet', glyph: '傀', rar: 1, stack: 3, desc: '傀儡（神通与灵宠）伤害 +25%，机关傀儡的存在时间 +3 秒。每重叠加。', apply: (p) => { p.kuiMul += 0.25; p.craft.kui = (p.craft.kui || 0) + 1; } },
    zhifu: { name: '制符术', kind: 'craft', sch: 'fire', glyph: '符', rar: 1, stack: 3, desc: '每 12 秒（每重 -2 秒）自动打出一张符箓：火弹符或冰锥符，不耗法力。', apply: (p) => { p.craft.fu = (p.craft.fu || 0) + 1; } },
    quchong: { name: '驱虫术', kind: 'craft', sch: 'bug', glyph: '驱', rar: 1, stack: 3, desc: '灵宠灵虫伤害 +20%，噬金虫群 +2 只。修至第二重时，可多带一只灵宠。', apply: (p) => { p.petMul += 0.2; p.craft.chong = (p.craft.chong || 0) + 1; if (p.craft.chong === 2) p.petCap += 1; } },
    // —— 丹药 / 奇物 ——
    butian: { name: '补天丹', kind: 'dan', sch: 'misc', glyph: '补', rar: 3, desc: '洗髓伐骨，资质蜕变。修为获取 +30%，并立刻提升一层。', apply: (p) => { p.xpMul += 0.3; G.Game.gainXp(p.xpNeed - p.xp + 0.01, true); } },
    jiuqu: { name: '九曲灵参', kind: 'dan', sch: 'misc', glyph: '参', rar: 2, desc: '气血上限 +45，并回满气血。', apply: (p) => { p.maxHp += 45; p.hp = p.maxHp; } },
    yanghun: { name: '养魂木', kind: 'dan', sch: 'misc', glyph: '木', rar: 2, desc: '温养神魂。神通冷却 -10%，法力上限 +20。', apply: (p) => { p.cdr += 0.1; p.maxMp += 20; p.mp += 20; } },
    huiyang: { name: '回阳水', kind: 'dan', sch: 'misc', glyph: '阳', rar: 2, desc: '气血归零时回复五成气血（仅一次）。', apply: (p) => { p.flags.huiyang = (p.flags.huiyang || 0) + 1; } },
    qingsuo: { name: '青索飞剑', kind: 'bao', sch: 'sword', glyph: '索', rar: 1, desc: '攻击速度 +18%。', apply: (p) => { p.atkSpd *= 1.18; }, stack: 3 },
  });
  for (const k in R) R[k].id = k;
  G.KIND = { gong: '功法', bao: '法宝', pet: '灵宠', craft: '技艺', dan: '丹药' };

  /* ---------------- 青元剑诀（功法）----------------
     筑基后习得第一层；此后升层时有机会参悟下一层。 */
  G.Qingyuan = [
    { name: '剑光分化', desc: '飞剑 +1', apply: (p) => { p.swords += 1; } },
    { name: '青元剑气', desc: '飞剑伤害 +15%，射程 +10%', apply: (p) => { p.swordMul += 0.15; p.rangeMul += 0.1; } },
    { name: '剑光再分', desc: '飞剑 +1', apply: (p) => { p.swords += 1; } },
    { name: '剑芒吞吐', desc: '飞剑穿透 +1，暴击率 +5%', apply: (p) => { p.pierce += 1; p.crit += 0.05; } },
    { name: '三分剑光', desc: '飞剑 +1', apply: (p) => { p.swords += 1; } },
    { name: '剑诀大成', desc: '攻击速度 +20%，飞剑伤害 +15%', apply: (p) => { p.atkSpd *= 1.2; p.swordMul += 0.15; } },
  ];
  G.CN_NUM = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

  /* 墨氏毒经：墨大夫遗下的手札，医毒同源。毒一层层叠上去——
     每层每秒造成 3 点伤害（吃伤害加成与毒伤加成），持续 4 秒，再中毒则续上 */
  G.Dujing = [
    { name: '淬毒', desc: '飞剑淬毒：每次命中叠一层毒（每层每秒 3 点伤害，持续 4 秒，至多 6 层）', apply: (p) => { p.psn += 1; } },
    { name: '七毒水', desc: '毒伤 +40%，毒层上限 +3', apply: (p) => { p.psnMul += 0.4; p.psnCap += 3; } },
    { name: '缠香丝', desc: '中毒的敌人移速 -30%，受到的一切伤害 +12%', apply: (p) => { p.flags.psnSlow = 1; p.psnVuln += 0.12; } },
    { name: '蚀骨', desc: '每次命中多叠一层毒，毒伤 +30%', apply: (p) => { p.psn += 1; p.psnMul += 0.3; } },
    { name: '尸毒相传', desc: '带毒的敌人死去时毒爆，把一半毒层传给周围的敌人', apply: (p) => { p.flags.psnBurst = 1; } },
    { name: '毒经大成', desc: '毒伤 +50%，毒层上限 +4；毒满层的敌人每秒再损失 1% 最大气血', apply: (p) => { p.psnMul += 0.5; p.psnCap += 4; p.flags.psnRot = 1; } },
  ];
  /* 主修功法：筑基时择一门，此后升级时只会参悟到这一门的后续层数；结丹时炼成各自的本命法宝 */
  G.Mains = {
    qy: { name: '青元剑诀', glyph: '元', sch: 'sword', lv: G.Qingyuan, bao: '青竹蜂云剑', intro: '剑修的路子：剑光一分再分，飞剑越来越多。结丹后以天雷竹炼成本命法宝【青竹蜂云剑】。' },
    du: { name: '墨氏毒经', glyph: '毒', sch: 'poison', lv: G.Dujing, bao: '万毒幡', intro: '墨大夫遗下的手札，医毒同源：飞剑淬毒，一层层叠上去把敌人磨死。结丹后炼成本命法宝【万毒幡】。' },
  };

  /* ---------------- 青竹蜂云剑（本命法宝）----------------
     结丹后炼成。飞剑命中积攒剑意，满 100 可施展「蜂云剑阵」：七十二口飞剑倾巢而出。 */
  G.Fengyun = { swords: 72, bites: 4, life: 7.5, dmgMul: 0.45, thunder: 0.1, perHit: 0.5, perKill: 1.5 };

  /* ---------------- 修为感悟（升级三选一） ---------------- */
  G.Upgrades = [
    { id: 'sword', name: '剑气淬炼', glyph: '锐', v: 12, desc: (v) => `飞剑伤害 +${v}%`, apply: (p, v) => { p.swordMul += v / 100; } },
    { id: 'aspd', name: '运剑如飞', glyph: '疾', v: 10, desc: (v) => `攻击速度 +${v}%`, apply: (p, v) => { p.atkSpd *= 1 + v / 100; } },
    { id: 'hp', name: '气血充盈', glyph: '血', v: 18, desc: (v) => `气血上限 +${v}，并回复等量气血`, apply: (p, v) => { p.maxHp += v; p.hp += v; } },
    { id: 'spell', name: '法力精纯', glyph: '法', v: 15, desc: (v) => `神通伤害 +${v}%`, apply: (p, v) => { p.spellMul += v / 100; } },
    { id: 'cdr', name: '神识增长', glyph: '识', v: 7, desc: (v) => `神通冷却 -${v}%`, apply: (p, v) => { p.cdr += v / 100; } },
    { id: 'mp', name: '灵力绵长', glyph: '灵', v: 20, desc: (v) => `法力上限 +${v}，法力回复 +${Math.round(v / 2)}%`, apply: (p, v) => { p.maxMp += v; p.mp += v; p.mpRegen *= 1 + v / 200; } },
    { id: 'crit', name: '洞察破绽', glyph: '察', v: 6, desc: (v) => `暴击率 +${v}%`, apply: (p, v) => { p.crit += v / 100; } },
    { id: 'critd', name: '一击致命', glyph: '绝', v: 22, desc: (v) => `暴击伤害 +${v}%`, apply: (p, v) => { p.critMul += v / 100; } },
    { id: 'spd', name: '身轻如燕', glyph: '燕', v: 7, desc: (v) => `移动速度 +${v}%`, apply: (p, v) => { p.speed *= 1 + v / 100; } },
    { id: 'range', name: '御剑千里', glyph: '远', v: 15, desc: (v) => `飞剑射程与速度 +${v}%`, apply: (p, v) => { p.rangeMul += v / 100; } },
    { id: 'armor', name: '护体灵光', glyph: '护', v: 5, desc: (v) => `受到的伤害 -${v}%`, apply: (p, v) => { p.armor += v / 100; } },
    { id: 'dash', name: '遁术精进', glyph: '遁', v: 14, desc: (v) => `遁术冷却 -${v}%`, apply: (p, v) => { p.dashCd *= 1 - v / 100; } },
  ];
  G.RARITY = [
    { name: '寻常', mul: 1, w: 62, cls: 'r1' },
    { name: '精妙', mul: 1.6, w: 28, cls: 'r2' },
    { name: '顿悟', mul: 2.4, w: 10, cls: 'r3' },
  ];

  /* ---------------- 灵药（药园，用玉瓶里攒下的灵露催熟） ---------------- */
  G.Herbs = [
    { id: 'huanglong', name: '黄龙草', glyph: '草', cost: 1, desc: '炼成黄龙丹：丹药 +2（上限 5）。', run: (p) => { p.potions = Math.min(G.POTION_MAX, p.potions + 2); } },
    { id: 'ningxue', name: '凝血草', glyph: '凝', cost: 1, desc: '立刻回复 50% 气血。', run: (p) => { p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.5); } },
    { id: 'lingzhi', name: '千年灵芝', glyph: '芝', cost: 2, desc: '气血上限 +30，并回满气血。', run: (p) => { p.maxHp += 30; p.hp = p.maxHp; } },
    { id: 'jinsui', name: '金髓果', glyph: '髓', cost: 2, desc: '伤害永久 +10%。', run: (p) => { p.dmgMul += 0.1; } },
    { id: 'tianling', name: '天灵果', glyph: '果', cost: 2, desc: '法力上限 +30，神通冷却 -6%。', run: (p) => { p.maxMp += 30; p.mp += 30; p.cdr += 0.06; } },
    { id: 'zihou', name: '紫猴花', glyph: '花', cost: 3, desc: '修为暴涨：立刻提升一层。', run: (p) => { G.Game.gainXp(p.xpNeed - p.xp + 0.01, true); } },
    { id: 'longlin', name: '龙鳞果', glyph: '鳞', cost: 3, desc: '受到的伤害 -10%，气血上限 +20。', run: (p) => { p.armor += 0.1; p.maxHp += 20; p.hp += 20; } },
  ];

  /* ---------------- 奇遇 ---------------- */
  G.Events = [
    {
      title: '月下凝露', glyph: '月',
      text: '夜色正浓。腰间那只聚露的玉瓶微微发凉，瓶口竟在一丝一丝地吞吐月华。',
      options: [
        { label: '静坐守瓶', hint: '灵露 +2', run: (g, p) => { p.drops += 2; return '月华如水，尽数没入瓶中。瓶底又多了两滴清亮的灵露。'; } },
        { label: '趁夜赶路', hint: '灵石 +45', run: (g, p) => { g.addStones(45, true); return '你压下好奇继续赶路，半途在草丛里拾到一只无主的储物袋。'; } },
      ],
    },
    {
      title: '重伤的散修', glyph: '伤',
      text: '一名散修倒在血泊里，气息奄奄。他的储物袋就挂在腰间，触手可及。',
      options: [
        { label: '赠他一枚丹药', hint: '消耗 1 枚丹药，得其回报', can: (p) => p.potions > 0,
          run: (g, p) => { p.potions--; const r = g.randomRelic(2); g.giveRelic(r); return `散修服下丹药缓过气来，郑重取出一物相赠：【${G.Relics[r].name}】。`; } },
        { label: '取走储物袋', hint: '灵石 +70，但会遭到反扑', run: (g, p) => { g.addStones(70, true); p.hp = Math.max(1, p.hp - p.maxHp * 0.18); return '你刚扯下储物袋，那散修拼死祭出一张符箓。你被火光燎伤，带着灵石匆匆离去。'; } },
        { label: '转身离去', hint: '修仙界少管闲事', run: (g, p) => { g.gainXp(p.xpNeed * 0.25, true); return '你绕道而行。一路默想得失，心境反倒通透了几分。'; } },
      ],
    },
    {
      title: '古修禁制', glyph: '禁',
      text: '石壁之后隐有灵光透出，一道残破的上古禁制挡在面前，忽明忽暗。',
      options: [
        { label: '强行破禁', hint: '可能得宝，也可能遭反噬', run: (g, p) => {
          if (U.chance(0.58)) { const r = g.randomRelic(2); g.giveRelic(r); return `禁制应声而碎。石室中央的玉台上，静静躺着【${G.Relics[r].name}】。`; }
          p.hp = Math.max(1, p.hp - p.maxHp * 0.25); return '禁制骤然反卷，一道灵光狠狠撞在你胸口。你咳出一口血，只得作罢。'; } },
        { label: '以神识慢慢消磨', hint: '耗尽法力，稳妥取物', run: (g, p) => { p.mp = 0; g.addStones(35, true); g.gainXp(p.xpNeed * 0.3, true); return '你耗了小半个时辰才磨开一条缝隙。室内只剩些灵石，倒是这番水磨工夫让神识凝练了不少。'; } },
        { label: '离开', hint: '', run: () => '你看了片刻，转身离开。' },
      ],
    },
    {
      title: '灵眼之泉', glyph: '泉',
      text: '乱石间藏着一汪泉眼，灵气氤氲成雾，是难得一见的灵眼之泉。',
      options: [
        { label: '掬水而饮', hint: '回复 45% 气血', run: (g, p) => { p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.45); return '泉水入喉，一股暖流散入四肢百骸，伤势好了大半。'; } },
        { label: '就地打坐', hint: '法力上限 +25', run: (g, p) => { p.maxMp += 25; p.mp = p.maxMp; return '你在泉边吐纳了一个周天，丹田内的灵力又浑厚了一分。'; } },
      ],
    },
    {
      title: '坊市暗拍', glyph: '拍',
      text: '一个斗篷人拦住你，压低了声音：“道友，可要看看好东西？灵石够，什么都好说。”',
      options: [
        { label: '买下不知名的玉盒', hint: '80 灵石 → 一件至宝', can: (p) => p.stones >= 80,
          run: (g, p) => { p.stones -= 80; const r = g.randomRelic(3, true); g.giveRelic(r); return `玉盒开启，宝光一闪——竟是【${G.Relics[r].name}】！`; } },
        { label: '买下功法玉简', hint: '50 灵石 → 一门神通', can: (p) => p.stones >= 50,
          run: (g, p) => { p.stones -= 50; const s = g.randomSkill([], true);
            if (!s) { const r = g.randomRelic(2); g.giveRelic(r); return `玉简里记的不是法诀，而是一处藏宝之地。你按图索骥，寻到了【${G.Relics[r].name}】。`; }
            g.giveSkill(s); return `玉简贴上眉心，一篇法诀涌入识海：【${G.Skills[s].name}】。`; } },
        { label: '摇头离开', hint: '', run: () => '斗篷人耸耸肩，身影没入暗处。' },
      ],
    },
    {
      title: '剑修拦路', glyph: '试',
      text: '一名背剑的青年修士挡住去路，抱拳道：“在下别无他意，只想与道友印证一番剑术。”',
      options: [
        { label: '全力切磋', hint: '伤害 +7%，损失 15% 气血', run: (g, p) => { p.dmgMul += 0.07; p.hp = Math.max(1, p.hp - p.maxHp * 0.15); return '百招之后两人各退三步。你肩头见血，却也从对方剑路里悟出了些东西。'; } },
        { label: '点到为止', hint: '暴击率 +4%', run: (g, p) => { p.crit += 0.04; return '你只守不攻，暗中记下了对方每一处发力的关窍。'; } },
      ],
    },
    {
      title: '青衫客', glyph: '客',
      text: '路边站着一个相貌平平的青衫修士，正低头看一株不起眼的野草。他身上的气息收敛得一丝不漏——若不是亲眼看见，你根本察觉不到那里有人。',
      options: [
        { label: '上前见礼', hint: '或许能得一句指点', run: (g, p) => { g.gainXp(p.xpNeed * 0.35, true); p.crit += 0.03; return '那人只说了一句“修仙一途，无非谨慎二字”，便转身走了。你回味良久，受益匪浅。后来才听人说起，黄枫谷有位姓韩的师兄，也是这副模样。'; } },
        { label: '低头绕开', hint: '多一事不如少一事', run: (g, p) => { p.drops = Math.min(9, p.drops + 2); return '你低头绕了过去。走出很远再回头，那人已经不见了，原地留着一只小玉盒，盒里封着两滴灵露。'; } },
      ],
    },
    {
      title: '枯树虫卵', glyph: '虫',
      text: '枯树洞里有一窝奇异的虫卵，金银二色，连树心都被啃噬得千疮百孔。',
      options: [
        { label: '小心收起', hint: '获得灵虫【噬金虫】', run: (g, p) => {
          if (p.relics.chongluan || p.pets.length >= p.petCap) { g.addStones(60, true); return '你的灵兽袋里已经没有空位，便把这些虫卵转手卖给了路过的修士。'; }
          g.giveRelic('chongluan'); return '你用玉盒将虫卵尽数收起。没过多久，一群金银相间的甲虫便破卵而出。'; } },
        { label: '不碰来历不明之物', hint: '修为小幅增长', run: (g, p) => { g.gainXp(p.xpNeed * 0.2, true); return '谨慎，是你活到今天最大的倚仗。'; } },
      ],
    },
  ];

  /* ---------------- 轮回感悟（局外成长） ---------------- */
  G.Meta = [
    { id: 'body', name: '淬体', glyph: '体', max: 5, cost: (l) => 6 + l * 6, desc: (l) => `初始气血上限 +${l * 12}` },
    { id: 'root', name: '灵根', glyph: '根', max: 5, cost: (l) => 8 + l * 7, desc: (l) => `所有伤害 +${l * 5}%` },
    { id: 'wit', name: '悟性', glyph: '悟', max: 5, cost: (l) => 6 + l * 6, desc: (l) => `修为获取 +${l * 8}%` },
    { id: 'bag', name: '行囊', glyph: '囊', max: 3, cost: (l) => 8 + l * 8, desc: (l) => `初始丹药 +${l}` },
    { id: 'luck', name: '福缘', glyph: '福', max: 4, cost: (l) => 5 + l * 5, desc: (l) => `初始灵石 +${l * 30}` },
    { id: 'vial', name: '温养玉瓶', glyph: '瓶', max: 3, cost: (l) => 10 + l * 8, desc: (l) => `初始灵露 +${l}` },
  ];

  G.Tips = [
    '遁术（空格）全程无敌，可以直接穿过弹幕与冲撞。',
    '飞剑会自动锁定最近的敌人；想打别的目标，按住鼠标左键手动瞄准。',
    '每清空一间房，玉瓶里都会凝出一滴灵露——带去药园催熟灵药。',
    '功法没有高下，只有合不合用。神通与法宝上都标着流派，同一流派越多越顺手。',
    '辟邪神雷专克鬼、尸与魔修。',
    '红色的圈与线是敌人的招式预警，离开即可。',
    '房间不必全清，但机缘、坊市与药园往往值得绕路。',
    '重复获得同一门神通会令其升阶。',
    '陨落后会获得道心，可在洞府中永久强化根基。',
    '筑基之后择一门主修功法：青元剑诀走剑修的路子，墨氏毒经走毒修的路子。结丹时各炼成一件本命法宝。',
    '毒是一层层叠上去的：每层每秒 3 点伤害，持续 4 秒，再中毒就续上。打得快的飞剑最适合淬毒。',
    '青竹蜂云剑的剑意靠飞剑命中积攒，满了按 V —— 七十二口飞剑齐出。',
    '炼成青竹蜂云剑之后，留意首领遗物里的【大庚剑阵】阵图：七十二口飞剑布阵困敌。',
    '标着"自动祭出"的法宝会自己出手，不占神通栏，也不耗法力。炼器术能让它们更快、更狠。',
    '灵兽袋至多带三只灵宠。它们不会受伤，放心让曲魂顶在前面。',
    '神通只能同修三门。栏满之后再得新神通，要舍弃一门来换。',
    '山野里的图很大，没有地图。留意身边的光点往哪边飘、落花往哪边吹。',
    '想看本章各处怎么连通，按住 Tab 展开舆图（触屏点右上角的地名）。',
    '场上没有活着的敌人时，脚下生风、走得更快——大图里赶路不必慢慢挪。',
    '有的场子中间垒着台地：坡走不上去，要从台阶上下；飞剑和法术不受高低阻挡。',
    '冒黑烟的空地里有埋伏；桥头的幡变成金色、火盆点燃，才说明那条路能走了。',
    '啼魂兽专吞鬼物：气血不足两成半的鬼、尸、魔修会被它一口吞掉。',
  ];
})();
