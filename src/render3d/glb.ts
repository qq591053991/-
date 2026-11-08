import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { AnimState, Model } from './models';

/**
 * 可选：用外部 GLB 模型替换程序化模型。
 * 在 public/models/manifest.json 中登记，例如：
 *   { "models": { "player": "hanli.glb", "modaifu": { "file": "mo.glb", "yaw": 90, "height": 130 } } }
 * - 模型按 glTF 惯例以 +Z 为正前方；若朝向不对，用 yaw（角度）修正
 * - 自动缩放到该角色的标准高度（或 height 指定），脚底贴地
 * - 若带动画，按名称自动挑选：walk/run（移动）、idle（站立）、attack/cast（施法）
 */

interface Cfg {
  file: string;
  height?: number;
  yaw?: number;
}

const loaded = new Map<string, { gltf: GLTF; cfg: Cfg }>();

export async function loadModelOverrides(base = 'models/'): Promise<string[]> {
  let manifest: { models?: Record<string, string | Cfg> };
  try {
    const res = await fetch(`${base}manifest.json`, { cache: 'no-cache' });
    if (!res.ok) return [];
    manifest = await res.json();
  } catch {
    return [];
  }
  const loader = new GLTFLoader();
  const ids: string[] = [];
  await Promise.all(
    Object.entries(manifest.models ?? {}).map(async ([id, v]) => {
      const cfg: Cfg = typeof v === 'string' ? { file: v } : v;
      try {
        const gltf = await loader.loadAsync(base + cfg.file);
        loaded.set(id, { gltf, cfg });
        ids.push(id);
      } catch (err) {
        console.warn(`[models] 加载 ${cfg.file} 失败，继续使用内置模型`, err);
      }
    }),
  );
  return ids;
}

export function hasOverride(id: string): boolean {
  return loaded.has(id);
}

function findClip(clips: THREE.AnimationClip[], re: RegExp): THREE.AnimationClip | undefined {
  return clips.find((c) => re.test(c.name));
}

export function glbModel(id: string, defaultHeight: number): Model | null {
  const entry = loaded.get(id);
  if (!entry) return null;
  const { gltf, cfg } = entry;
  const scene = skeletonClone(gltf.scene);

  // 每个实例独立材质，便于闪白 / 着色
  const mats: { m: THREE.MeshStandardMaterial; base: THREE.Color; baseI: number }[] = [];
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const cloned = list.map((m) => {
      const c = m.clone() as THREE.MeshStandardMaterial;
      if (c.emissive) mats.push({ m: c, base: c.emissive.clone(), baseI: c.emissiveIntensity ?? 1 });
      return c;
    });
    mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0];
  });

  const height = cfg.height ?? defaultHeight;
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const k = size.y > 0 ? height / size.y : 1;
  const inner = new THREE.Group();
  inner.add(scene);
  scene.scale.setScalar(k);
  scene.position.y = -box.min.y * k;
  // glTF 前方 +Z → 本游戏前方 +X
  inner.rotation.y = Math.PI / 2 + ((cfg.yaw ?? 0) * Math.PI) / 180;
  const root = new THREE.Group();
  root.add(inner);

  const clips = gltf.animations;
  const mixer = clips.length ? new THREE.AnimationMixer(scene) : null;
  const walk = mixer && (findClip(clips, /walk|run|move/i) ?? clips[0]);
  const idle = mixer && (findClip(clips, /idle|stand/i) ?? walk);
  const attack = mixer && findClip(clips, /attack|cast|shoot/i);
  const actions = new Map<THREE.AnimationClip, THREE.AnimationAction>();
  const act = (c: THREE.AnimationClip) => {
    let a = actions.get(c);
    if (!a && mixer) {
      a = mixer.clipAction(c);
      actions.set(c, a);
    }
    return a;
  };
  let current: THREE.AnimationAction | undefined;
  const play = (c: THREE.AnimationClip | null | undefined) => {
    if (!c) return;
    const a = act(c);
    if (!a || a === current) return;
    a.reset().play();
    if (current) current.crossFadeTo(a, 0.2, false);
    current = a;
  };
  if (idle) play(idle);

  let tint: THREE.Color | null = null;
  const applyEmissive = (flash: number) => {
    for (const e of mats) {
      if (flash > 0) {
        e.m.emissive.setRGB(1, 1, 1);
        e.m.emissiveIntensity = 0.85 * flash;
      } else if (tint) {
        e.m.emissive.copy(tint);
        e.m.emissiveIntensity = 0.5;
      } else {
        e.m.emissive.copy(e.base);
        e.m.emissiveIntensity = e.baseI;
      }
    }
  };

  return {
    root,
    height,
    update(s: AnimState) {
      if (mixer) {
        play(s.action > 0.6 && attack ? attack : s.speed > 0.15 ? walk : idle);
        mixer.update(s.dt);
      }
      inner.rotation.z = -0.35 * s.lean;
    },
    setFlash: applyEmissive,
    setTint(c) {
      tint = c ? new THREE.Color(c) : null;
      applyEmissive(0);
    },
    setOpacity(a) {
      for (const e of mats) {
        e.m.transparent = a < 1;
        e.m.opacity = a;
      }
    },
  };
}
