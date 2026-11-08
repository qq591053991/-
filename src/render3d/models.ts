import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TAU } from '../core/math';
import { glbModel } from './glb';

/**
 * 程序化低多边形 3D 模型。
 * 每个模型的静态部分合并成一个带顶点色的网格，四肢等需要动画的部分单独成网格并挂在关节（Group）上。
 * 所有模型局部坐标：+X 为正前方，+Y 向上，+Z 为右手侧；脚底在 y = 0。
 */

export interface AnimState {
  t: number; // 全局时间（秒）
  dt: number; // 本帧真实时间
  phase: number; // 步伐相位（随移动距离累加）
  speed: number; // 0..1 移动强度
  action: number; // 0..1 施法 / 蓄力
  lean: number; // 0..1 冲刺前倾
}

export interface Model {
  root: THREE.Group;
  height: number;
  update(s: AnimState): void;
  /** 受击闪白 0..1 */
  setFlash(k: number): void;
  /** 狂暴等状态的整体着色；null 取消 */
  setTint(color: string | null): void;
  setOpacity(a: number): void;
}

type V3 = [number, number, number];

// ───────────────────────── 几何拼装工具 ─────────────────────────

class Shape {
  private parts: THREE.BufferGeometry[] = [];

  add(g: THREE.BufferGeometry, color: string, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], scl: V3 = [1, 1, 1]): this {
    const geo = g.index ? g.toNonIndexed() : g.clone();
    g.dispose();
    geo.deleteAttribute('uv');
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(...pos),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
      new THREE.Vector3(...scl),
    );
    geo.applyMatrix4(m);
    const c = new THREE.Color(color);
    const n = geo.getAttribute('position').count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = c.r;
      arr[i * 3 + 1] = c.g;
      arr[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    this.parts.push(geo);
    return this;
  }

  build(): THREE.BufferGeometry {
    const g = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    if (!g) throw new Error('mergeGeometries failed');
    g.computeBoundingSphere();
    return g;
  }
}

const geoCache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => Shape): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    g = make().build();
    geoCache.set(key, g);
  }
  return g;
}

const Box = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z);
const Cyl = (rt: number, rb: number, h: number, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg);
const Sph = (r: number, ws = 10, hs = 8, thetaLen = Math.PI) => new THREE.SphereGeometry(r, ws, hs, 0, TAU, 0, thetaLen);
const Cone = (r: number, h: number, seg = 6) => new THREE.ConeGeometry(r, h, seg);

class Mat {
  readonly m: THREE.MeshLambertMaterial;
  private readonly baseEmissive: THREE.Color;
  private readonly baseIntensity: number;
  private tint: THREE.Color | null = null;

  constructor(opts: { emissive?: string; emissiveIntensity?: number; opacity?: number } = {}) {
    this.m = new THREE.MeshLambertMaterial({
      vertexColors: true,
      flatShading: true,
      emissive: opts.emissive ?? '#000000',
      emissiveIntensity: opts.emissiveIntensity ?? 1,
      transparent: (opts.opacity ?? 1) < 1,
      opacity: opts.opacity ?? 1,
    });
    this.baseEmissive = this.m.emissive.clone();
    this.baseIntensity = this.m.emissiveIntensity;
  }

  flash(k: number): void {
    if (k > 0) {
      this.m.emissive.setRGB(1, 1, 1);
      this.m.emissiveIntensity = 0.85 * k;
    } else if (this.tint) {
      this.m.emissive.copy(this.tint);
      this.m.emissiveIntensity = 0.55;
    } else {
      this.m.emissive.copy(this.baseEmissive);
      this.m.emissiveIntensity = this.baseIntensity;
    }
  }

  setTint(c: string | null): void {
    this.tint = c ? new THREE.Color(c) : null;
    this.flash(0);
  }

  setOpacity(a: number, baseTransparent: boolean): void {
    this.m.opacity = a;
    this.m.transparent = baseTransparent || a < 1;
  }
}

function mesh(geo: THREE.BufferGeometry, mat: Mat): THREE.Mesh {
  return new THREE.Mesh(geo, mat.m);
}

function baseModel(root: THREE.Group, height: number, mat: Mat, update: (s: AnimState) => void, transparent = false): Model {
  return {
    root,
    height,
    update,
    setFlash: (k) => mat.flash(k),
    setTint: (c) => mat.setTint(c),
    setOpacity: (a) => mat.setOpacity(a, transparent),
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ───────────────────────── 人形（修士 / 弟子 / 僵尸 / 首领） ─────────────────────────

type Hat = 'bun' | 'headband' | 'hood' | 'douli' | 'crown' | 'longhair' | 'official';
type Weapon = 'sword' | 'saber' | 'staff' | 'bow' | 'none';

interface HumanoidOpts {
  scale: number;
  robe: string;
  trim: string;
  sash: string;
  skin: string;
  hair: string;
  hat: Hat;
  hatColor?: string;
  beard?: string;
  weapon: Weapon;
  orb?: string;
  armor?: string;
  talisman?: boolean;
  zombie?: boolean;
  bulky?: boolean;
  emissive?: string;
  extra?: (root: THREE.Group, body: THREE.Group, mat: Mat) => (s: AnimState) => void;
}

const HUMAN_H = 46;

function humanoidBase(o: HumanoidOpts): Shape {
  const s = new Shape();
  const w = o.bulky ? 1.25 : 1;
  s.add(Cyl(7 * w, 11 * w, 18), o.robe, [0, 9, 0]); // 下摆
  s.add(Cyl(11.3 * w, 11.6 * w, 1.6), o.trim, [0, 0.9, 0]);
  s.add(Cyl(7.4 * w, 6.6 * w, 13), o.robe, [0, 24.5, 0]); // 上身
  s.add(Cyl(7.1 * w, 7.1 * w, 2.6), o.sash, [0, 19.4, 0]); // 腰带
  s.add(Box(0.8, 10, 3), o.trim, [6.9 * w, 25.5, 1.2], [0.35, 0, 0.05]); // 交领
  s.add(Box(0.8, 10, 3), o.trim, [6.9 * w, 25.5, -1.2], [-0.35, 0, 0.05]);
  s.add(Cyl(4.2, 5.8 * w, 2), o.trim, [0, 31.6, 0]);
  s.add(Sph(5.4), o.skin, [0.3, 37.6, 0]); // 头
  s.add(Box(0.6, 1.3, 1.1), '#1a1410', [5.5, 38.3, 1.9]);
  s.add(Box(0.6, 1.3, 1.1), '#1a1410', [5.5, 38.3, -1.9]);

  const hair = o.hair;
  const cap = () => s.add(Sph(5.75, 10, 8, Math.PI * 0.55), hair, [-0.2, 38.1, 0], [0, 0, 0.35]);
  switch (o.hat) {
    case 'bun':
      cap();
      s.add(Sph(2.7), hair, [-1.6, 44, 0]);
      s.add(Cyl(0.35, 0.35, 9, 5), '#c9a227', [-1.6, 44.2, 0], [Math.PI / 2, 0, 0]);
      break;
    case 'headband':
      cap();
      s.add(Cyl(5.8, 5.8, 1.6, 10), o.hatColor ?? '#a8322a', [0.2, 39.8, 0]);
      s.add(Box(1, 5, 2), o.hatColor ?? '#a8322a', [-6, 37.5, 0], [0, 0, -0.4]);
      break;
    case 'hood':
      s.add(Sph(6.7, 10, 8, Math.PI * 0.62), o.hatColor ?? o.robe, [-0.5, 37.8, 0], [0, 0, 0.3]);
      s.add(Cone(3, 6, 6), o.hatColor ?? o.robe, [-4.5, 43.5, 0], [0, 0, 0.9]);
      break;
    case 'douli':
      cap();
      s.add(Cone(14, 6.5, 12), o.hatColor ?? '#b89b5e', [0, 45.2, 0]);
      s.add(Cyl(1.2, 1.2, 1.5, 6), '#7a6232', [0, 48.8, 0]);
      break;
    case 'crown':
      cap();
      s.add(Cyl(3, 3.5, 3, 8), '#d4a72c', [-0.5, 44, 0]);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU;
        s.add(Cone(0.9, 3, 4), '#d4a72c', [-0.5 + Math.cos(a) * 2.6, 46.8, Math.sin(a) * 2.6]);
      }
      s.add(Sph(1.1, 6, 4), '#c0142a', [2.6, 44.3, 0]);
      break;
    case 'longhair':
      cap();
      s.add(Box(3, 16, 9.5), hair, [-5.2, 33, 0]);
      s.add(Sph(2.2), hair, [-1, 43.6, 0]);
      break;
    case 'official':
      s.add(Cyl(6.4, 6.4, 5, 10), o.hatColor ?? '#22201c', [0, 43, 0]);
      s.add(Cyl(8.2, 8.2, 0.9, 10), o.hatColor ?? '#22201c', [0, 40.8, 0]);
      s.add(Sph(1.4, 6, 4), '#c0142a', [0, 46.2, 0]);
      break;
  }
  if (o.beard) s.add(Cone(2.6, 8, 6), o.beard, [5, 31.5, 0], [0, 0, Math.PI]);
  if (o.armor) {
    s.add(Box(2, 11, 12 * w), o.armor, [6.6 * w, 25, 0]);
    s.add(Box(8, 3, 6), o.armor, [0, 31, 8.6 * w]);
    s.add(Box(8, 3, 6), o.armor, [0, 31, -8.6 * w]);
  }
  if (o.talisman) s.add(Box(0.5, 6.5, 2.6), '#e8c547', [5.9, 37.5, 0], [0, 0, 0.12]);
  return s;
}

function armShape(o: HumanoidOpts, right: boolean): Shape {
  const s = new Shape();
  const w = o.bulky ? 1.2 : 1;
  s.add(Cyl(2.4 * w, 3.9 * w, 12, 7), o.robe, [0, -6, 0]);
  s.add(Cyl(4 * w, 4 * w, 1, 7), o.trim, [0, -11.7, 0]);
  s.add(Sph(1.9, 6, 5), o.skin, [0, -13.2, 0]);
  if (right) {
    switch (o.weapon) {
      case 'sword':
        s.add(Box(1.6, 5, 1.6), '#3a2a1e', [0, -13.5, 0]);
        s.add(Box(1.4, 1, 5.5), '#c9a227', [0, -16, 0]);
        s.add(Box(0.7, 22, 2), '#d6efe9', [0, -27.5, 0]);
        s.add(Cone(1, 3, 4), '#d6efe9', [0, -40, 0], [Math.PI, 0, 0]);
        break;
      case 'saber':
        s.add(Box(1.4, 1, 4.5), '#5a4a30', [0, -15.5, 0]);
        s.add(Box(0.7, 17, 3.2), '#bdbdbd', [0, -24.5, 0.5]);
        break;
      case 'staff':
        s.add(Cyl(0.9, 0.9, 56, 6), '#5a4026', [0, -3, 0]);
        s.add(Sph(3.4, 8, 6), o.orb ?? '#3fb68b', [0, 27, 0]);
        s.add(Cyl(2.2, 0.9, 3, 6), '#c9a227', [0, 24, 0]);
        break;
      default:
        break;
    }
  } else if (o.weapon === 'bow') {
    s.add(new THREE.TorusGeometry(10, 0.7, 4, 14, Math.PI), '#6b4a28', [2, -13, 0], [0, 0, -Math.PI / 2]);
    s.add(Box(0.25, 20, 0.25), '#e8e1c8', [2, -13, 0]);
  }
  return s;
}

function humanoid(key: string, o: HumanoidOpts): Model {
  const mat = new Mat({ emissive: o.emissive, emissiveIntensity: o.emissive ? 0.35 : 1 });
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(o.scale);
  root.add(body);
  const torso = new THREE.Group(); // 前倾 / 起伏
  body.add(torso);
  torso.add(mesh(cached(`${key}.base`, () => humanoidBase(o)), mat));

  const w = o.bulky ? 1.25 : 1;
  const armL = new THREE.Group();
  armL.position.set(0, 29.5, -8.2 * w);
  armL.add(mesh(cached(`${key}.armL`, () => armShape(o, false)), mat));
  const armR = new THREE.Group();
  armR.position.set(0, 29.5, 8.2 * w);
  armR.add(mesh(cached(`${key}.armR`, () => armShape(o, true)), mat));
  torso.add(armL, armR);

  const footGeo = cached(`foot`, () => new Shape().add(Box(4.6, 2, 3.2), '#2a2420', [1.2, 1, 0]));
  const footL = mesh(footGeo, mat);
  const footR = mesh(footGeo, mat);
  footL.position.z = -3.6 * w;
  footR.position.z = 3.6 * w;
  body.add(footL, footR);

  const extraUpdate = o.extra?.(root, torso, mat);

  return baseModel(root, HUMAN_H * o.scale, mat, (s) => {
    const sw = Math.sin(s.phase);
    if (o.zombie) {
      // 僵尸：双臂前伸、并脚跳
      const hop = s.speed > 0.05 ? Math.abs(Math.sin(s.t * 7)) * 6 : 0;
      torso.position.y = hop;
      footL.position.y = footR.position.y = hop;
      footL.position.x = footR.position.x = 0;
      armL.rotation.z = armR.rotation.z = 1.45 + Math.sin(s.t * 3) * 0.05;
    } else {
      torso.position.y = Math.abs(sw) * 1.4 * s.speed + Math.sin(s.t * 2) * 0.25;
      footL.position.x = sw * 3.2 * s.speed;
      footR.position.x = -sw * 3.2 * s.speed;
      footL.position.y = Math.max(0, -sw) * 1.5 * s.speed;
      footR.position.y = Math.max(0, sw) * 1.5 * s.speed;
      const swing = sw * 0.55 * s.speed;
      armL.rotation.z = -swing + (o.weapon === 'bow' ? s.action * 1.4 : 0);
      armR.rotation.z = lerp(swing, 1.45, s.action);
      armL.rotation.x = -0.12;
      armR.rotation.x = 0.12;
    }
    torso.rotation.z = -0.35 * s.lean;
    extraUpdate?.(s);
  });
}

// ───────────────────────── 四足兽（妖狼 / 赤鳞兽） ─────────────────────────

interface QuadOpts {
  scale: number;
  body: string;
  belly: string;
  dark: string;
  eye: string;
  spikes?: boolean;
  horn?: boolean;
}

function quadruped(key: string, o: QuadOpts): Model {
  const mat = new Mat();
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(o.scale);
  root.add(body);
  const trunk = new THREE.Group();
  body.add(trunk);
  trunk.add(
    mesh(
      cached(`${key}.body`, () => {
        const s = new Shape();
        s.add(Box(18, 8, 9), o.body, [0, 11, 0]);
        s.add(Box(16, 2, 7), o.belly, [0, 6.8, 0]);
        s.add(Box(8, 9.5, 10), o.body, [6, 12, 0]);
        s.add(Box(5, 5, 6), o.body, [10, 14.5, 0], [0, 0, 0.5]);
        s.add(Box(7.5, 6.5, 7), o.body, [13.5, 16.5, 0]);
        s.add(Box(5.5, 3.6, 4.4), o.belly, [18.2, 15.2, 0]);
        s.add(Box(1.2, 1.5, 1.8), o.dark, [21, 16.1, 0]);
        s.add(Box(0.8, 1.3, 1.3), o.eye, [17.3, 18, 2.3]);
        s.add(Box(0.8, 1.3, 1.3), o.eye, [17.3, 18, -2.3]);
        s.add(Cone(1.9, 4.5, 4), o.dark, [12.3, 21.6, 2.2]);
        s.add(Cone(1.9, 4.5, 4), o.dark, [12.3, 21.6, -2.2]);
        s.add(Cone(2.2, 13, 5), o.body, [-13, 13.5, 0], [0, 0, 1.95]);
        if (o.spikes) for (let i = 0; i < 5; i++) s.add(Cone(1.7, 5.5, 4), o.dark, [-7 + i * 3.6, 16.6, 0]);
        if (o.horn) s.add(Cone(1.3, 7, 5), '#e8dcc0', [16, 21.5, 0], [0, 0, -0.55]);
        return s;
      }),
      mat,
    ),
  );
  const legGeo = cached(`${key}.leg`, () =>
    new Shape().add(Box(2.7, 9, 2.7), o.body, [0, -4.5, 0]).add(Box(3.4, 1.5, 3.4), o.dark, [0.6, -8.8, 0]),
  );
  const legs: THREE.Group[] = [];
  for (const [x, z] of [[6.5, 3.4], [6.5, -3.4], [-6.5, 3.4], [-6.5, -3.4]] as const) {
    const g = new THREE.Group();
    g.position.set(x, 9.3, z);
    g.add(mesh(legGeo, mat));
    body.add(g);
    legs.push(g);
  }
  return baseModel(root, 22 * o.scale, mat, (s) => {
    const sw = Math.sin(s.phase * 1.3);
    const amp = 0.75 * s.speed;
    legs[0].rotation.z = sw * amp;
    legs[3].rotation.z = sw * amp;
    legs[1].rotation.z = -sw * amp;
    legs[2].rotation.z = -sw * amp;
    trunk.position.y = Math.abs(Math.cos(s.phase * 1.3)) * 1.2 * s.speed;
    // 蓄力：压低身体
    body.position.y = -s.action * 2;
    trunk.rotation.z = s.action * 0.12 - s.lean * 0.1;
  });
}

// ───────────────────────── 血纹蛛 ─────────────────────────

function spider(key: string, scale: number): Model {
  const mat = new Mat({ emissive: '#2a0006', emissiveIntensity: 0.4 });
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(scale);
  root.add(body);
  body.add(
    mesh(
      cached(`${key}.body`, () => {
        const s = new Shape();
        s.add(Sph(7.5), '#4a1218', [-7, 9.5, 0], [0, 0, 0], [1.2, 0.9, 1]);
        s.add(Box(7, 0.8, 1.4), '#d0303e', [-7, 16.2, 0], [0, 0, 0.1]);
        s.add(Box(1.4, 0.8, 7), '#d0303e', [-8, 15.8, 0]);
        s.add(Sph(4.7), '#3a0e12', [1, 8, 0]);
        s.add(Sph(3.3), '#3a0e12', [5, 8, 0]);
        for (const z of [-1.3, 1.3]) {
          s.add(Sph(0.9, 6, 4), '#ff4040', [7.8, 9, z]);
          s.add(Sph(0.6, 6, 4), '#ff4040', [7.1, 10.3, z * 0.6]);
          s.add(Cone(0.8, 3, 4), '#d8c8b0', [7.6, 5.6, z * 0.8], [0, 0, Math.PI]);
        }
        return s;
      }),
      mat,
    ),
  );
  const legGeo = cached(`${key}.leg`, () =>
    new Shape()
      .add(Box(1.3, 1.3, 10.4), '#2a0a0e', [0, 2.5, 4.5], [-0.507, 0, 0])
      .add(Box(1.1, 1.1, 13.5), '#2a0a0e', [0, -1.25, 11.5], [1.19, 0, 0]),
  );
  const fan = [0.7, 0.25, -0.2, -0.6];
  const legs: { g: THREE.Group; base: number; i: number; side: number }[] = [];
  [3.5, 1.5, -0.5, -2.5].forEach((x, i) => {
    for (const side of [1, -1]) {
      const g = new THREE.Group();
      g.position.set(x, 7.5, side * 2.2);
      const base = side > 0 ? fan[i] : Math.PI - fan[i];
      g.rotation.y = base;
      g.add(mesh(legGeo, mat));
      body.add(g);
      legs.push({ g, base, i, side });
    }
  });
  return baseModel(root, 18 * scale, mat, (s) => {
    for (const l of legs) {
      const ph = s.phase * 1.6 + l.i * (Math.PI / 2) + (l.side > 0 ? 0 : Math.PI);
      l.g.rotation.y = l.base + Math.sin(ph) * 0.3 * s.speed * l.side;
      l.g.rotation.x = Math.max(0, Math.cos(ph)) * 0.25 * s.speed * l.side;
    }
    body.position.y = Math.sin(s.t * 3) * 0.3 + s.action * 1.5;
  });
}

// ───────────────────────── 阴魂 ─────────────────────────

function ghost(key: string, scale: number): Model {
  const mat = new Mat({ emissive: '#4a52a8', emissiveIntensity: 0.45, opacity: 0.72 });
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(scale);
  root.add(body);
  const core = mesh(
    cached(`${key}.body`, () => {
      const s = new Shape();
      s.add(Sph(8, 12, 10), '#c9cde8', [0, 16, 0], [0, 0, 0], [1, 1.1, 1]);
      s.add(Cone(7.8, 16, 10), '#a9aed8', [0, 4.5, 0], [Math.PI, 0, 0]);
      s.add(Sph(1.6, 6, 4), '#14102a', [6.9, 18, 2.6]);
      s.add(Sph(1.6, 6, 4), '#14102a', [6.9, 18, -2.6]);
      s.add(Box(1, 2.6, 3), '#14102a', [7.4, 13.5, 0]);
      s.add(Cone(1.8, 9, 5), '#b9bde0', [5, 11, 7], [0.4, 0, -1.9]);
      s.add(Cone(1.8, 9, 5), '#b9bde0', [5, 11, -7], [-0.4, 0, -1.9]);
      return s;
    }),
    mat,
  );
  body.add(core);
  return baseModel(
    root,
    24 * scale,
    mat,
    (s) => {
      core.rotation.x = Math.sin(s.t * 3) * 0.15;
      core.rotation.z = -0.25 * s.speed;
      const p = 1 + Math.sin(s.t * 5) * 0.04;
      core.scale.set(p, 1 / p, p);
    },
    true,
  );
}

// ───────────────────────── 海中妖蛟 ─────────────────────────

function jiao(key: string, scale: number): Model {
  const mat = new Mat({ emissive: '#05202e', emissiveIntensity: 0.5 });
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(scale);
  root.add(body);
  const head = mesh(
    cached(`${key}.head`, () => {
      const s = new Shape();
      s.add(Box(10, 6.5, 7.5), '#1f4e6b', [3, 0, 0]);
      s.add(Box(7, 4, 5.6), '#1f4e6b', [10.5, -0.6, 0]);
      s.add(Box(7, 1.6, 5), '#9fc7c9', [10, -3.3, 0]);
      s.add(Sph(1.2, 6, 4), '#ffd23a', [7.5, 2.4, 3.2]);
      s.add(Sph(1.2, 6, 4), '#ffd23a', [7.5, 2.4, -3.2]);
      s.add(Cone(1.3, 9, 5), '#e8dcc0', [0, 5, 2.4], [0.2, 0, 1.15]);
      s.add(Cone(1.3, 9, 5), '#e8dcc0', [0, 5, -2.4], [-0.2, 0, 1.15]);
      s.add(Box(10, 0.4, 0.4), '#9fc7c9', [15, -1.2, 3.6], [0, -0.45, 0]);
      s.add(Box(10, 0.4, 0.4), '#9fc7c9', [15, -1.2, -3.6], [0, 0.45, 0]);
      for (let i = 0; i < 3; i++) s.add(Cone(1.2, 4, 4), '#3f8fb0', [-1 + i * 3, 4.2, 0]);
      return s;
    }),
    mat,
  );
  body.add(head);
  const segs: THREE.Mesh[] = [];
  const n = 7;
  for (let i = 0; i < n; i++) {
    const r = 5.6 - i * 0.55;
    const geo = cached(`${key}.seg${i}`, () => {
      const s = new Shape().add(Sph(r, 8, 6), '#1f4e6b', [0, 0, 0], [0, 0, 0], [1.25, 1, 1]);
      s.add(Cone(1, 3.4, 4), '#3f8fb0', [0, r * 0.95, 0]);
      if (i === n - 1) s.add(Cone(r * 0.9, 9, 5), '#3f8fb0', [-6, 0, 0], [0, 0, Math.PI / 2]);
      return s;
    });
    const m = mesh(geo, mat);
    body.add(m);
    segs.push(m);
  }
  return baseModel(root, 20 * scale, mat, (s) => {
    const wiggle = 0.35 + 0.65 * s.speed;
    head.position.set(0, 14 - s.action * 3, Math.sin(s.t * 7) * 1.2 * wiggle);
    head.rotation.z = s.action * 0.3 - s.lean * 0.2;
    for (let i = 0; i < n; i++) {
      segs[i].position.set(-6 - i * 6.8, 11.5 - i * 1.5, Math.sin(s.t * 7 - (i + 1) * 0.9) * (1 + i * 0.9) * wiggle);
      segs[i].rotation.y = Math.cos(s.t * 7 - (i + 1) * 0.9) * 0.4 * wiggle;
    }
  });
}

// ───────────────────────── 首领附件 ─────────────────────────

/** 王蝉：手边悬浮旋转的血灵钻。 */
function bloodDrill(root: THREE.Group, body: THREE.Group): (s: AnimState) => void {
  const mat = new Mat({ emissive: '#ff1030', emissiveIntensity: 0.6 });
  const drill = mesh(
    cached('drill', () => {
      const s = new Shape();
      s.add(Cone(4, 18, 6), '#a3102a', [0, 0, 0], [0, 0, -Math.PI / 2]);
      for (let i = 0; i < 3; i++) s.add(Box(10, 0.6, 1.2), '#ff6070', [-1 + i * 2, 0, 0], [i * 1.05, 0, 0]);
      return s;
    }),
    mat,
  );
  drill.position.set(10, 34, 16);
  body.add(drill);
  void root;
  return (s) => {
    drill.rotation.x = s.t * 14;
    drill.position.y = 34 + Math.sin(s.t * 3) * 2;
    drill.position.x = 10 + s.action * 8;
  };
}

/** 极阴老祖：环绕的骷髅 + 悬浮。 */
function skulls(root: THREE.Group, body: THREE.Group): (s: AnimState) => void {
  const mat = new Mat({ emissive: '#7b2fa0', emissiveIntensity: 0.35 });
  const geo = cached('skull', () =>
    new Shape()
      .add(Sph(3.2, 8, 6), '#ece6d6', [0, 0, 0])
      .add(Box(2.6, 1.6, 3.2), '#ece6d6', [1.2, -2.4, 0])
      .add(Sph(0.8, 5, 4), '#1a1028', [2.6, 0.4, 1.1])
      .add(Sph(0.8, 5, 4), '#1a1028', [2.6, 0.4, -1.1]),
  );
  const list = [0, 1, 2].map(() => {
    const m = mesh(geo, mat);
    body.add(m);
    return m;
  });
  return (s) => {
    for (let i = 0; i < list.length; i++) {
      const a = s.t * 1.6 + (i * TAU) / list.length;
      list[i].position.set(Math.cos(a) * 18, 30 + Math.sin(s.t * 2 + i) * 3, Math.sin(a) * 18);
      list[i].rotation.y = -a;
    }
    root.position.y += 4 + Math.sin(s.t * 1.5) * 2; // 悬浮（叠加在渲染器设定的位置上）
  };
}

// ───────────────────────── 注册表 ─────────────────────────

const BUILDERS: Record<string, () => Model> = {
  player: () =>
    humanoid('player', {
      scale: 1, robe: '#2f7f6d', trim: '#e9e1c8', sash: '#1f3d36', skin: '#e6c9a3', hair: '#151515', hat: 'bun', weapon: 'sword',
    }),
  bandit: () =>
    humanoid('bandit', {
      scale: 1.05, robe: '#6b4a32', trim: '#3a2a1e', sash: '#a8322a', skin: '#c9a27c', hair: '#1c1612', hat: 'headband', weapon: 'saber',
    }),
  archer: () =>
    humanoid('archer', {
      scale: 1, robe: '#7a6a3e', trim: '#3d3420', sash: '#2f4a2a', skin: '#c9a27c', hair: '#1c1612', hat: 'headband', hatColor: '#2f4a2a', weapon: 'bow',
    }),
  demon: () =>
    humanoid('demon', {
      scale: 1.12, robe: '#4a2850', trim: '#8a4a9a', sash: '#1a0a1e', skin: '#b8a6b0', hair: '#111', hat: 'hood', weapon: 'staff', orb: '#b13cff', emissive: '#2a0a3a',
    }),
  pirate: () =>
    humanoid('pirate', {
      scale: 1.05, robe: '#2c5a5a', trim: '#c9c0a0', sash: '#16302f', skin: '#c9a27c', hair: '#1c1612', hat: 'douli', weapon: 'sword',
    }),
  corpse: () =>
    humanoid('corpse', {
      scale: 1.25, robe: '#2f3a30', trim: '#7a2a2a', sash: '#1a1a1a', skin: '#8fa08a', hair: '#1a1a1a', hat: 'official', weapon: 'none',
      armor: '#6b6f72', talisman: true, zombie: true, bulky: true,
    }),
  wolf: () => quadruped('wolf', { scale: 1, body: '#5d6670', belly: '#a9b0b6', dark: '#2a2e33', eye: '#ffcc33' }),
  beast: () => quadruped('beast', { scale: 1.35, body: '#8a3a1e', belly: '#d08a5a', dark: '#3a1408', eye: '#ffe040', spikes: true, horn: true }),
  spider: () => spider('spider', 1.1),
  ghost: () => ghost('ghost', 1),
  jiao: () => jiao('jiao', 1.15),
  modaifu: () =>
    humanoid('modaifu', {
      scale: 2.65, robe: '#262626', trim: '#6b6b6b', sash: '#4a3a20', skin: '#d9c2a0', hair: '#9a9a9a', hat: 'longhair', beard: '#a8a8a8',
      weapon: 'staff', orb: '#3fb68b',
    }),
  wangchan: () =>
    humanoid('wangchan', {
      scale: 2.65, robe: '#7a1022', trim: '#d4a72c', sash: '#2a0a10', skin: '#e0c4a4', hair: '#111', hat: 'crown', weapon: 'none',
      extra: bloodDrill,
    }),
  jiyin: () =>
    humanoid('jiyin', {
      scale: 2.95, robe: '#1d1b3a', trim: '#6b5fb0', sash: '#0d0c1c', skin: '#cfc2b8', hair: '#ececec', hat: 'longhair', beard: '#ececec',
      weapon: 'staff', orb: '#7b2fa0', bulky: true, emissive: '#120a2a', extra: skulls,
    }),
};

/** 目标高度（用于 GLB 替换模型时统一缩放）。 */
const HEIGHTS: Record<string, number> = {
  player: 46, bandit: 48, archer: 46, demon: 52, pirate: 48, corpse: 58, wolf: 22, beast: 30, spider: 20, ghost: 24, jiao: 23,
  modaifu: 122, wangchan: 122, jiyin: 136,
};

export const MODEL_IDS = Object.keys(BUILDERS);

/** 创建模型：若 public/models 里提供了同名 GLB 则优先使用，否则用程序化模型。 */
export function createModel(id: string): Model {
  const glb = glbModel(id, HEIGHTS[id] ?? 46);
  if (glb) return glb;
  const b = BUILDERS[id] ?? BUILDERS.bandit;
  return b();
}

/** 3D 飞剑（环绕飞剑用），沿 +X。 */
export function flyingSwordGeometry(): THREE.BufferGeometry {
  return cached('flysword', () =>
    new Shape()
      .add(Box(22, 0.8, 2.4), '#dff5ee', [3, 0, 0])
      .add(Cone(1.2, 4, 4), '#dff5ee', [16, 0, 0], [0, 0, -Math.PI / 2], [1, 1, 0.6])
      .add(Box(1.6, 1.6, 6), '#3aa76d', [-8.5, 0, 0])
      .add(Box(6, 1.6, 1.6), '#2a5a3c', [-12, 0, 0])
      .add(Sph(1.2, 6, 4), '#3aa76d', [-15.5, 0, 0]),
  );
}

/** 金蚨子母刃（飞刃）：四叶飞镖。 */
export function shurikenGeometry(): THREE.BufferGeometry {
  return cached('shuriken', () => {
    const s = new Shape();
    for (let k = 0; k < 4; k++) {
      const a = (k * TAU) / 4;
      s.add(Cone(3, 12, 4), '#d9a520', [Math.cos(a) * 6, 0, Math.sin(a) * 6], [0, -a, -Math.PI / 2], [1, 1, 0.35]);
    }
    s.add(Cyl(3, 3, 1.6, 8), '#6b4e0b');
    return s;
  });
}

export function vertexColorMaterial(emissive = '#000000', intensity = 1): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive, emissiveIntensity: intensity });
}
