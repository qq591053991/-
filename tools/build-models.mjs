/**
 * 把下载的原始 GLB（tools/fetch-models.sh 下载到 .model-src/）裁剪成游戏用的轻量模型：
 *  - 去掉不需要的武器 / 配件节点
 *  - 只保留需要的动画（站立 / 移动 / 攻击），并统一重命名为 Idle / Walk / Attack
 *  - 清理未引用数据、合并重复数据、重采样动画
 * 输出到 public/models/，并生成 manifest.json。
 *
 * 用法：npm run models:fetch && npm run models:build
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, resample, weld } from '@gltf-transform/functions';
import fs from 'node:fs/promises';
import path from 'node:path';

const SRC = path.resolve('.model-src');
const OUT = path.resolve('public/models');

/**
 * 角色 → 素材映射。
 * keep：保留的非蒙皮配件节点（武器 / 帽子 / 盾）；未列出的配件全部移除（蒙皮身体部件始终保留）
 * hide：额外移除的节点
 * clips：游戏动作 → 源动画名
 * tint / opacity / emissive：运行时着色（写入 manifest）
 */
const ROLES = {
  player:   { src: 'Rogue.glb',            keep: ['Knife', 'Rogue_Cape'],                                clips: { Idle: 'Idle', Walk: 'Running_A', Attack: '1H_Melee_Attack_Stab' } },
  bandit:   { src: 'Barbarian.glb',        keep: ['1H_Axe', 'Barbarian_Hat', 'Barbarian_Cape'],          clips: { Idle: 'Idle', Walk: 'Walking_A', Attack: '1H_Melee_Attack_Chop' } },
  archer:   { src: 'Rogue_Hooded.glb',     keep: ['2H_Crossbow', 'Rogue_Cape'],                          clips: { Idle: '2H_Ranged_Aiming', Walk: 'Walking_A', Attack: '2H_Ranged_Shoot' } },
  demon:    { src: 'Skeleton_Mage.glb',    keep: ['Skeleton_Mage_Hat'],                                  clips: { Idle: 'Idle', Walk: 'Walking_A', Attack: 'Spellcast_Shoot' } },
  pirate:   { src: 'Knight.glb',           keep: ['1H_Sword', 'Round_Shield', 'Knight_Cape'],            clips: { Idle: 'Idle', Walk: 'Walking_A', Attack: '1H_Melee_Attack_Slice_Diagonal' } },
  corpse:   { src: 'Skeleton_Warrior.glb', keep: ['Skeleton_Warrior_Helmet'],                            clips: { Idle: 'Idle_Combat', Walk: 'Walking_D_Skeletons', Attack: 'Unarmed_Melee_Attack_Punch_A' } },
  ghost:    { src: 'Skeleton_Minion.glb',  keep: [],                                                     clips: { Idle: 'Idle_B', Walk: 'Running_C', Attack: 'Unarmed_Melee_Attack_Punch_B' },
              opacity: 0.68, emissive: '#3a46a0', tint: '#b8c4ff' },
  wolf:     { src: 'Fox.glb',              keep: [],                                                     clips: { Idle: 'Survey', Walk: 'Run' }, tint: '#9aa6b0', height: 26 },
  beast:    { src: 'Fox.glb',              keep: [],                                                     clips: { Idle: 'Survey', Walk: 'Walk' }, tint: '#e0694a', height: 32 },
  modaifu:  { src: 'Mage.glb',             keep: ['2H_Staff', 'Mage_Hat', 'Mage_Cape'],                  clips: { Idle: 'Idle', Walk: 'Walking_A', Attack: 'Spellcast_Shoot' }, tint: '#8a8a96' },
  wangchan: { src: 'Rogue_Hooded.glb',     keep: ['Knife', 'Knife_Offhand', 'Rogue_Cape'],               clips: { Idle: 'Idle', Walk: 'Running_A', Attack: 'Dualwield_Melee_Attack_Slice' }, tint: '#ffb0b8' },
  jiyin:    { src: 'Skeleton_Rogue.glb',   keep: ['Skeleton_Rogue_Hood', 'Skeleton_Rogue_Cape'],         clips: { Idle: 'Idle', Walk: 'Walking_D_Skeletons', Attack: 'Spellcast_Summon' },
              tint: '#9a8ee0', emissive: '#1c0f3a' },
};

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
await fs.mkdir(OUT, { recursive: true });
const manifest = { models: {} };

for (const [id, cfg] of Object.entries(ROLES)) {
  const doc = await io.read(path.join(SRC, cfg.src));
  const root = doc.getRoot();

  // 1) 配件：非蒙皮、带网格的节点视为配件，只保留白名单
  for (const node of root.listNodes()) {
    if (!node.getMesh() || node.getSkin()) continue;
    if (!cfg.keep.includes(node.getName())) node.dispose();
  }
  // 斗篷等蒙皮配件也可能不在白名单内：对带 Cape/Hat/Helmet/Hood 的蒙皮节点同样按白名单处理
  for (const node of root.listNodes()) {
    if (!node.getMesh() || !node.getSkin()) continue;
    if (/Cape|Hat|Helmet|Hood$|Cloak/.test(node.getName()) && !cfg.keep.includes(node.getName()) && !/Cloak/.test(node.getName())) node.dispose();
  }

  // 2) 动画：只保留需要的，并重命名
  const wanted = new Map(Object.entries(cfg.clips).map(([k, v]) => [v, k]));
  const found = new Set();
  for (const anim of root.listAnimations()) {
    const as = wanted.get(anim.getName());
    if (!as || found.has(as)) {
      // Animation.dispose() 不会释放子对象，需显式释放通道与采样器，prune 才能清掉关键帧数据
      for (const c of anim.listChannels()) c.dispose();
      for (const sm of anim.listSamplers()) sm.dispose();
      anim.dispose();
    } else {
      anim.setName(as);
      found.add(as);
    }
  }
  for (const k of Object.keys(cfg.clips)) if (!found.has(k)) throw new Error(`${id}: 缺少动画 ${cfg.clips[k]}`);

  await doc.transform(resample(), weld(), dedup(), prune());
  const file = `${id}.glb`;
  await io.write(path.join(OUT, file), doc);
  const stat = await fs.stat(path.join(OUT, file));

  const entry = { file };
  for (const k of ['tint', 'opacity', 'emissive', 'height']) if (cfg[k] !== undefined) entry[k] = cfg[k];
  entry.source = cfg.src;
  manifest.models[id] = entry;
  console.log(`${id.padEnd(9)} ← ${cfg.src.padEnd(22)} ${(stat.size / 1024).toFixed(0).padStart(5)} KB  clips: ${[...found].join(', ')}`);
}

await fs.writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`\n已写入 ${path.join(OUT, 'manifest.json')}`);
