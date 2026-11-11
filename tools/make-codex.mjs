// 由 js/data.js 生成 docs/codex.md（图鉴）。用法：node tools/make-codex.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ctx = { window: {}, Math, console };
ctx.window.G = { U: {}, TAU: Math.PI * 2 };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js/data.js'), 'utf8'), ctx);
const G = ctx.window.G;

const sch = (k) => (k && k !== 'misc' ? G.Schools[k].name : '—');
const RAR = ['', '凡品', '珍品', '至宝'];
const out = [];
out.push('# 图鉴', '', '> 本文件由 `tools/make-codex.mjs` 从 `js/data.js` 生成，请勿手改。', '');
out.push('游戏里所有能拿到的东西。名目取自《凡人修仙传》，效果是为这款游戏重新设计的。', '');
out.push('- **功法**：被动，改变你的根基。', '- **神通**：主动施放，至多同修三门（`Q` `E` `R`），每门可升至三重。栏满后再得新神通，需舍弃一门。',
  '- **法宝**：一部分是被动；标着「自动祭出」的会按各自的间隔自行出手，不占神通栏，不耗法力。', '- **灵宠**：常驻身侧、自行作战，不会受伤。灵兽袋至多带三只（驱虫术二重后四只）。',
  '- **技艺**：炼丹、炼器、阵法、傀儡、制符、驱虫，各可修至三重。', '- **丹药**：一次性的永久增益。', '');

const skills = Object.values(G.Skills);
out.push(`## 神通（${skills.length}）`, '', '| 名称 | 流派 | 法力 | 冷却 | 第一重效果 |', '| --- | --- | --- | --- | --- |');
for (const s of skills) out.push(`| ${s.name} | ${sch(s.sch)} | ${s.mp} | ${s.cd} 秒 | ${s.desc(1)} |`);
out.push('');

out.push('## 主修与本命', '', '| 名称 | 说明 |', '| --- | --- |');
out.push('| 择一门主修 | 筑基之后在三门里择一门，一经选定此生只修这一门；之后升层时有机会参悟下一层，结丹时炼成这一门的本命法宝。 |');
out.push(`| 青元剑诀（六层，剑修） | ${G.Qingyuan.map((x, i) => `第${G.CN_NUM[i + 1]}层【${x.name}】${x.desc}`).join('；')}。 |`);
out.push('| 青竹蜂云剑 | 青元剑诀的本命法宝，结丹后炼成。飞剑命中积攒剑意，满后按 `V` 施展蜂云剑阵；得到【大庚剑阵】后改为布阵。 |');
out.push(`| 墨氏毒经（六层，毒修） | ${G.Dujing.map((x, i) => `第${G.CN_NUM[i + 1]}层【${x.name}】${x.desc}`).join('；')}。 |`);
out.push('| 万毒幡 | 墨氏毒经的本命法宝，结丹后炼成。飞剑命中积攒毒煞，满后按 `V` 放出万毒瘴：毒瘴随身七秒，瘴中敌人每半秒叠三层毒。 |');
out.push(`| 大衍诀（六层，神识） | ${G.Dayan.map((x, i) => `第${G.CN_NUM[i + 1]}层【${x.name}】${x.desc}`).join('；')}。 |`);
out.push('| 大衍傀儡 | 大衍诀的本命法宝，结丹后炼成。飞剑命中积攒神识，满后按 `V`「傀儡齐出」：四具傀儡同时现身，所有自动祭出的法宝立刻再出手一次。 |', '');

const relics = Object.values(G.Relics);
for (const kind of Object.keys(G.KIND)) {
  const list = relics.filter((r) => r.kind === kind);
  out.push(`## ${G.KIND[kind]}（${list.length}）`, '', '| 名称 | 流派 | 品阶 | 效果 |', '| --- | --- | --- | --- |');
  for (const r of list) out.push(`| ${r.name}${r.auto ? '（自动祭出）' : ''} | ${sch(r.sch)} | ${RAR[r.rar]} | ${r.desc} |`);
  out.push('');
}

out.push('## 灵药（药园，用灵露催熟）', '', '| 名称 | 灵露 | 效果 |', '| --- | --- | --- |');
for (const h of G.Herbs) out.push(`| ${h.name} | ${h.cost} | ${h.desc} |`);
out.push('');

out.push('## 尚未收录', '', '原著里的东西远不止这些。下面这些是已经想到、但这一版还没有做进来的，按大类列出：', '',
  '- **人界篇**：神风舟等飞行法器、无形针与各类符宝、天都尸火、五子同心魔、冰魄寒光、鬼灵门与合欢宗的各式魔器、古修士的阵旗阵盘（除颠倒五行阵外）、通天灵宝的其余仿制品、虚天殿与昆吾山的其余宝物。',
  '- **灵界篇**：涅槃圣体与真灵血脉的其余变化、玄天如意刃等玄天之宝、噬金虫王与成熟体、啼魂兽的进阶形态、广寒界与魔界所得的诸般宝物、各族的天赋神通。',
  '- **仙界篇**：全部未收录。',
  '- **功法**：主修线目前有青元剑诀（剑修）、墨氏毒经（毒修）、大衍诀（神识：法宝、灵宠、傀儡）三门；其余功法只是被动。大衍诀书里有（大衍神君所创、专修神识），各层的效果和本命法宝【大衍傀儡】是为游戏拟的；墨氏毒经与【万毒幡】是按墨大夫一脉的毒术拟的，书里并没有这样一部功法。',
  '- **技艺**：目前是被动加成，没有做成需要材料与配方的炼制玩法。', '');
out.push(`合计：神通 ${skills.length} 门，功法 / 法宝 / 灵宠 / 技艺 / 丹药 共 ${relics.length} 种，灵药 ${G.Herbs.length} 种。`, '');
fs.writeFileSync(path.join(root, 'docs/codex.md'), out.join('\n'));
console.log('docs/codex.md:', skills.length, 'skills,', relics.length, 'items');
