// 导入 Tripo 生成的角色：FBX / GLB → 精简后的 GLB，并打包进 assets/tripo.js。仅开发时使用。
//
// 准备：npm i @gltf-transform/core @gltf-transform/functions @gltf-transform/extensions sharp fbx2gltf
// 用法：node tools/import-tripo.mjs <名字> <模型文件 .fbx 或 .glb>
//   例：node tools/import-tripo.mjs modaifu ~/Downloads/tripo_convert_xxx.fbx
//   名字是角色键名（player 是玩家形象；敌人的键名见 js/data.js，如 modaifu、thug、wangchan）
//
// 做了什么：
//   1. FBX 用 FBX2glTF 转成 GLB（贴图在同名 .fbm 目录里会被自动带上）；
//   2. 贴图缩到 1024×1024 的 JPEG（Tripo 导出的是 8K，5MB 以上）；
//   3. 网格量化压缩，输出 assets/tripo/<名字>.glb；
//   4. 把 assets/tripo/ 下所有 GLB 以 base64 打包成 assets/tripo.js（这样 file:// 下也能加载）。
//
// 游戏里对骨骼的要求：Tripo 绑骨时选 Mixamo 骨骼规范（骨骼名形如 mixamorig:Hips）。不需要带动画，动作由 js/assets.js 程序化生成。
import { NodeIO } from '@gltf-transform/core';
import { KHRMeshQuantization } from '@gltf-transform/extensions';
import { prune, dedup, quantize, textureCompress } from '@gltf-transform/functions';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import sharp from 'sharp';
import fs from 'fs';
import os from 'os';
import path from 'path';

const [name, src] = process.argv.slice(2);
if (!name || !src) { console.error('用法: node tools/import-tripo.mjs <名字> <模型文件 .fbx 或 .glb>'); process.exit(1); }
const ROOT = process.env.GAME_ROOT || path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const outDir = path.join(ROOT, 'assets', 'tripo');
fs.mkdirSync(outDir, { recursive: true });

let glb = src;
if (/\.fbx$/i.test(src)) {
  const require = createRequire(import.meta.url);
  const pkg = path.dirname(require.resolve('fbx2gltf/package.json'));
  const bin = path.join(pkg, 'bin', { linux: 'Linux', darwin: 'Darwin', win32: 'Windows_NT' }[process.platform], process.platform === 'win32' ? 'FBX2glTF.exe' : 'FBX2glTF');
  fs.chmodSync(bin, 0o755);
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tripo-')), 'model');
  execFileSync(bin, ['--binary', '--input', src, '--output', tmp], { stdio: 'ignore' });
  glb = tmp + '.glb';
}

const io = new NodeIO().registerExtensions([KHRMeshQuantization]);
const doc = await io.read(glb), root = doc.getRoot();
for (const m of root.listMaterials()) { m.setMetallicFactor(0); m.setRoughnessFactor(1); }
await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'jpeg', resize: [1024, 1024], quality: 86 }), prune(), dedup(), quantize());
const out = path.join(outDir, name + '.glb');
await io.write(out, doc);
const joints = root.listSkins().flatMap((s) => s.listJoints().map((j) => j.getName()));
console.log(`${name}.glb  ${(fs.statSync(out).size / 1024).toFixed(0)} KB  顶点 ${root.listMeshes().flatMap((m) => m.listPrimitives()).reduce((n, p) => n + p.getAttribute('POSITION').getCount(), 0)}  骨骼 ${joints.length}  动画 ${root.listAnimations().length}`);
if (!joints.some((j) => /mixamorig:?Hips/.test(j))) console.warn('  注意：没有找到 Mixamo 命名的骨骼（mixamorig:Hips），游戏里将只能作为静态模型使用。');

let js = `'use strict';
/* Tripo 生成的角色模型（自动生成，请勿手改；生成方式见 tools/import-tripo.mjs）。内容为精简后的 GLB（base64）。 */
window.G_TRIPO_DATA = {\n`;
for (const f of fs.readdirSync(outDir).filter((f) => f.endsWith('.glb')).sort()) js += `  ${JSON.stringify(f.replace(/\.glb$/, ''))}: '${fs.readFileSync(path.join(outDir, f)).toString('base64')}',\n`;
js += '};\n';
fs.writeFileSync(path.join(ROOT, 'assets', 'tripo.js'), js);
console.log('已更新 assets/tripo.js', (js.length / 1024).toFixed(0) + ' KB');
