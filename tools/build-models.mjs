// 把 KayKit 角色包（CC0）精简并打包成 assets/models.js。仅开发时使用，游戏运行不依赖它。
//
// 用法：
//   git clone --depth 1 https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 adv
//   git clone --depth 1 https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0 skel
//   npm i @gltf-transform/core @gltf-transform/functions @gltf-transform/extensions
//   node tools/build-models.mjs adv skel
//
// 做了什么：
//   1. 9 个角色共用同一套骨骼，所以动画只保留用到的十几段，单独存一份（anims）；
//   2. 每个角色去掉全部动画，网格做量化压缩（KHR_mesh_quantization，three.js 原生支持）；
//   3. 全部以 base64 写进一个 JS 文件，这样双击打开 index.html（file://）也能加载。
import { NodeIO } from '@gltf-transform/core';
import { KHRMeshQuantization } from '@gltf-transform/extensions';
import { prune, dedup, resample, quantize } from '@gltf-transform/functions';
import fs from 'fs';
import path from 'path';

const [adv, skel] = process.argv.slice(2);
if (!adv || !skel) { console.error('用法: node tools/build-models.mjs <Adventurers 仓库目录> <Skeletons 仓库目录>'); process.exit(1); }
const A = path.join(adv, 'addons/kaykit_character_pack_adventures/Characters/gltf');
const K = path.join(skel, 'addons/kaykit_character_pack_skeletons/Characters/gltf');
const CHARS = {
  Mage: path.join(A, 'Mage.glb'), Barbarian: path.join(A, 'Barbarian.glb'), Knight: path.join(A, 'Knight.glb'),
  Rogue: path.join(A, 'Rogue.glb'), Rogue_Hooded: path.join(A, 'Rogue_Hooded.glb'), Skeleton_Warrior: path.join(K, 'Skeleton_Warrior.glb'),
};
const KEEP = ['Idle', 'Walking_A', 'Running_A', '1H_Melee_Attack_Chop', '2H_Melee_Attack_Chop', '1H_Ranged_Shoot', '2H_Ranged_Shoot',
  'Spellcast_Shoot', 'Spellcast_Raise', 'Spellcasting', 'Unarmed_Melee_Attack_Punch_A', 'Dodge_Forward', 'Hit_A', 'Cheer', 'Throw'];

const io = new NodeIO().registerExtensions([KHRMeshQuantization]);
const kill = (a) => { for (const c of a.listChannels()) c.dispose(); for (const s of a.listSamplers()) s.dispose(); a.dispose(); };
const out = {};

for (const [name, file] of Object.entries(CHARS)) {
  const doc = await io.read(file);
  for (const a of doc.getRoot().listAnimations()) kill(a);
  await doc.transform(prune(), dedup(), quantize());
  out[name] = Buffer.from(await io.writeBinary(doc));
  console.log(name.padEnd(18), (out[name].length / 1024).toFixed(0) + ' KB');
}
{
  const doc = await io.read(CHARS.Mage), root = doc.getRoot();
  for (const a of root.listAnimations()) {
    if (!KEEP.includes(a.getName())) { kill(a); continue; }
    // 缩放轨道恒为 1，去掉
    for (const ch of a.listChannels()) if (ch.getTargetPath() === 'scale') { const s = ch.getSampler(); ch.dispose(); if (s && s.listParents().length <= 2) s.dispose(); }
  }
  for (const n of root.listNodes()) { n.setMesh(null); n.setSkin(null); }
  for (const x of [...root.listMeshes(), ...root.listSkins(), ...root.listMaterials(), ...root.listTextures()]) x.dispose();
  await doc.transform(resample(), prune({ keepLeaves: true }), dedup());
  out.anims = Buffer.from(await io.writeBinary(doc));
  console.log('anims'.padEnd(18), (out.anims.length / 1024).toFixed(0) + ' KB', '(' + root.listAnimations().length + ' 段)');
}

let js = `'use strict';
/* 社区模型数据（自动生成，请勿手改；生成方式见 tools/build-models.mjs）。
   来源：KayKit Character Pack: Adventurers / Skeletons，作者 Kay Lousberg（www.kaylousberg.com），CC0 许可。
   内容为精简后的 GLB（base64）。 */
window.G_MODEL_DATA = {\n`;
for (const [k, buf] of Object.entries(out)) js += `  ${k}: '${buf.toString('base64')}',\n`;
js += '};\n';
const dst = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'assets', 'models.js');
fs.mkdirSync(path.dirname(dst), { recursive: true });
fs.writeFileSync(dst, js);
console.log('已写入', path.relative(process.cwd(), dst), (js.length / 1024 / 1024).toFixed(2) + ' MB');
