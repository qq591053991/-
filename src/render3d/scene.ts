import * as THREE from 'three';
import { TAU, rand } from '../core/math';
import { STAGES } from '../data/waves';
import { WEAPONS } from '../data/weapons';
import { RARITY_COLORS } from '../data/rarity';
import { gameplayPose, PRESETS, type CamPose } from '../game/camera';
import { ARENA, H, W } from '../game/constants';
import { isTelegraphing } from '../game/enemyAI';
import type { Game, View } from '../game/game';
import type { Enemy, ProjKind } from '../game/types';
import { orbitRadius } from '../game/weaponsys';
import {
  bugTexture, crossTexture, glowTexture, groundTexture, repaintAll,
  shadowTexture, swordTexture, telegraphTexture, windTexture,
} from './textures';
import { createModel, flyingSwordGeometry, shurikenGeometry, vertexColorMaterial, type Model } from './models';

interface Inst {
  model: Model;
  id: string;
  x: number;
  y: number;
  face: number;
  phase: number;
  action: number;
  enraged: boolean;
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * t;
}

/**
 * 2.5D 渲染：游戏逻辑仍在二维平面 (x, y) 上运行，
 * 这里把它映射到三维世界 (X = x, Z = y, Y = 高度)，角色以“剪纸立牌”形式立在地面上。
 */

const PLAYER_COLOR = '#2a8c7a';

/** 简单对象池：每帧 begin → get… → end，多余对象隐藏。 */
class Pool<T extends THREE.Object3D> {
  private items: T[] = [];
  private used = 0;
  constructor(private readonly parent: THREE.Object3D, private readonly make: () => T) {}
  begin(): void {
    this.used = 0;
  }
  get(): T {
    if (this.used >= this.items.length) {
      const o = this.make();
      this.parent.add(o);
      this.items.push(o);
    }
    const o = this.items[this.used++];
    o.visible = true;
    return o;
  }
  end(): void {
    for (let i = this.used; i < this.items.length; i++) this.items[i].visible = false;
  }
}

function spriteMat(tex: THREE.Texture, opacity = 1): THREE.SpriteMaterial {
  return new THREE.SpriteMaterial({ map: tex, transparent: true, opacity, depthWrite: false });
}

/** 平铺在地面上的贴片（XZ 平面）。 */
function flatMesh(tex: THREE.Texture, w: number, h: number, color = '#ffffff', opacity = 1): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(w, h);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, opacity, depthWrite: false });
  return new THREE.Mesh(geo, mat);
}

export class Renderer3D implements View {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, W / H, 10, 6000);
  private readonly raycaster = new THREE.Raycaster();
  private readonly aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -16);

  private stage = -1;
  private readonly stageGroup = new THREE.Group();
  private ground!: THREE.Mesh;

  private readonly modelFree = new Map<string, Model[]>();
  private readonly enemyInst = new Map<Enemy, Inst>();
  private readonly playerInst: Inst;
  private readonly showcase: { inst: Inst; x: number; y: number }[] = [];
  private readonly bossAura: THREE.Mesh;
  private readonly shadows: THREE.InstancedMesh;
  private readonly pickups: THREE.InstancedMesh;
  private readonly bulletGlow: THREE.Points;
  private readonly bulletCore: THREE.Points;
  private readonly particles: THREE.Points;
  private readonly projPools: Record<ProjKind, Pool<THREE.Object3D>>;
  private readonly orbitPool: Pool<THREE.Mesh>;
  private readonly spawnPool: Pool<THREE.Mesh>;
  private readonly telePool: Pool<THREE.Mesh>;
  private readonly ringPool: Pool<THREE.Mesh>;
  private readonly trailPool: Pool<THREE.Sprite>;
  private readonly boltPool: Pool<THREE.Line>;
  private readonly tmpM = new THREE.Matrix4();
  private readonly tmpV = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpS = new THREE.Vector3();
  private readonly tmpColor = new THREE.Color();
  private lastPose: CamPose = gameplayPose(PRESETS[0], ARENA.x + ARENA.w / 2, ARENA.y + ARENA.h / 2);
  private time = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(W, H, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    const s = this.scene;
    s.add(this.stageGroup);
    s.add(new THREE.HemisphereLight('#fffaf0', '#6b6152', 1.6));
    const sun = new THREE.DirectionalLight('#fff3dc', 1.4);
    sun.position.set(-400, 900, 500);
    s.add(sun);

    // 角色
    this.playerInst = this.newInst('player', ARENA.x + ARENA.w / 2, ARENA.y + ARENA.h / 2);

    const auraGeo = new THREE.RingGeometry(1, 1.12, 48);
    auraGeo.rotateX(-Math.PI / 2);
    this.bossAura = new THREE.Mesh(auraGeo, new THREE.MeshBasicMaterial({ color: '#c9a227', transparent: true, opacity: 0.8, depthWrite: false }));
    s.add(this.bossAura);

    // 影子（实例化）
    const shGeo = new THREE.PlaneGeometry(1, 1);
    shGeo.rotateX(-Math.PI / 2);
    this.shadows = new THREE.InstancedMesh(shGeo, new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }), 400);
    this.shadows.frustumCulled = false;
    this.shadows.renderOrder = 1;
    s.add(this.shadows);

    // 灵石（实例化八面体）
    this.pickups = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(1),
      new THREE.MeshLambertMaterial({ color: '#3fb68b', emissive: '#1d5e47', emissiveIntensity: 0.5 }),
      800,
    );
    this.pickups.frustumCulled = false;
    s.add(this.pickups);

    // 弹幕：两层点精灵（彩色光晕 + 白色内核）
    this.bulletGlow = this.makePoints(1200, 26, true);
    this.bulletCore = this.makePoints(1200, 9, false);
    this.particles = this.makePoints(800, 9, true);
    s.add(this.bulletGlow, this.bulletCore, this.particles);

    // 法术投射物
    const flat = (tex: THREE.Texture, w: number, h: number) => () => flatMesh(tex, w, h);
    this.projPools = {
      sword: new Pool(s, flat(swordTexture(), 44, 12)),
      wind: new Pool(s, flat(windTexture(), 30, 30)),
      blade: new Pool(s, () => new THREE.Mesh(shurikenGeometry(), vertexColorMaterial('#5a3a00', 0.4))),
      fire: new Pool(s, () => {
        const sp = new THREE.Sprite(spriteMat(glowTexture()));
        sp.material.color.set('#ff7a3a');
        sp.scale.set(26, 26, 1);
        return sp;
      }),
      bug: new Pool(s, () => {
        const sp = new THREE.Sprite(spriteMat(bugTexture()));
        sp.scale.set(16, 16, 1);
        return sp;
      }),
    };
    this.orbitPool = new Pool(s, () => {
      const mat = vertexColorMaterial('#1e6e4a', 0.35);
      return new THREE.Mesh(flyingSwordGeometry(), mat);
    });
    this.spawnPool = new Pool(s, () => flatMesh(crossTexture(), 1, 1, '#b03a2e'));
    this.telePool = new Pool(s, () => {
      const m = flatMesh(telegraphTexture(), 1, 1);
      (m.geometry as THREE.PlaneGeometry).translate(0.5, 0, 0);
      return m;
    });
    this.ringPool = new Pool(s, () => {
      const geo = new THREE.RingGeometry(0.85, 1, 40);
      geo.rotateX(-Math.PI / 2);
      return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#e8582a', transparent: true, depthWrite: false }));
    });
    this.trailPool = new Pool(s, () => {
      const sp = new THREE.Sprite(spriteMat(glowTexture(), 0.4));
      sp.material.color.set(PLAYER_COLOR);
      return sp;
    });
    this.boltPool = new Pool(s, () => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 64), 3));
      return new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#d8d8ff', transparent: true }));
    });

    void document.fonts?.ready.then(() => repaintAll());
  }

  private makePoints(max: number, size: number, vertexColors: boolean): THREE.Points {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 3), 3));
    if (vertexColors) geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(max * 3), 3));
    geo.setDrawRange(0, 0);
    const mat = new THREE.PointsMaterial({
      size, map: glowTexture(), transparent: true, depthWrite: false, vertexColors, sizeAttenuation: true,
      color: vertexColors ? '#ffffff' : '#fff6ea',
    });
    const p = new THREE.Points(geo, mat);
    p.frustumCulled = false;
    p.renderOrder = 3;
    return p;
  }

  // ───────────────────────── 场景布置 ─────────────────────────
  private buildStage(stage: number): void {
    this.stage = stage;
    const grp = this.stageGroup;
    for (const c of [...grp.children]) {
      grp.remove(c);
      c.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
    }
    const st = STAGES[stage];
    const paper = new THREE.Color(st.paper);
    this.scene.background = paper.clone().multiplyScalar(0.92);
    this.scene.fog = new THREE.Fog(paper.clone().multiplyScalar(0.92), 1400, 3600);

    // 远处地面
    const outer = new THREE.Mesh(
      new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: stage === 2 ? '#7d98a6' : paper.clone().multiplyScalar(0.78) }),
    );
    outer.position.set(ARENA.x + ARENA.w / 2, -2, ARENA.y + ARENA.h / 2);
    grp.add(outer);

    // 竞技场地面
    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(ARENA.w, ARENA.h).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ map: groundTexture(stage) }),
    );
    this.ground.position.set(ARENA.x + ARENA.w / 2, 0, ARENA.y + ARENA.h / 2);
    grp.add(this.ground);

    // 矮墙
    const wallMat = new THREE.MeshLambertMaterial({ color: st.ink });
    const capMat = new THREE.MeshLambertMaterial({ color: stage === 1 ? '#7a2630' : '#a58a3c' });
    const t = 14;
    const hgt = 22;
    const walls: [number, number, number, number][] = [
      [ARENA.x + ARENA.w / 2, ARENA.y - t / 2, ARENA.w + t * 2, t],
      [ARENA.x + ARENA.w / 2, ARENA.y + ARENA.h + t / 2, ARENA.w + t * 2, t],
      [ARENA.x - t / 2, ARENA.y + ARENA.h / 2, t, ARENA.h],
      [ARENA.x + ARENA.w + t / 2, ARENA.y + ARENA.h / 2, t, ARENA.h],
    ];
    for (const [x, z, w, d] of walls) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, d), wallMat);
      m.position.set(x, hgt / 2, z);
      grp.add(m);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 4, 4, d + 4), capMat);
      cap.position.set(x, hgt + 2, z);
      grp.add(cap);
    }
    // 四角石柱
    for (const [x, z] of [[ARENA.x, ARENA.y], [ARENA.x + ARENA.w, ARENA.y], [ARENA.x, ARENA.y + ARENA.h], [ARENA.x + ARENA.w, ARENA.y + ARENA.h]]) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(16, 20, 90, 8), wallMat);
      pillar.position.set(x, 45, z);
      grp.add(pillar);
      const top = new THREE.Mesh(new THREE.ConeGeometry(26, 26, 4), capMat);
      top.position.set(x, 103, z);
      top.rotation.y = Math.PI / 4;
      grp.add(top);
    }

    this.addProps(stage);
    this.addMountains(stage);
  }

  /** 竞技场外的布景：松树、石灯 / 血晶、枯木 / 礁石。 */
  private addProps(stage: number): void {
    const grp = this.stageGroup;
    const ink = new THREE.Color(STAGES[stage].ink);
    const place = (): [number, number] => {
      for (;;) {
        const x = rand(ARENA.x - 700, ARENA.x + ARENA.w + 700);
        const z = rand(ARENA.y - 600, ARENA.y + ARENA.h + 500);
        const inside = x > ARENA.x - 60 && x < ARENA.x + ARENA.w + 60 && z > ARENA.y - 60 && z < ARENA.y + ARENA.h + 60;
        if (!inside) return [x, z];
      }
    };
    const rockMat = new THREE.MeshLambertMaterial({ color: ink.clone().lerp(new THREE.Color('#888070'), 0.5), flatShading: true });
    for (let i = 0; i < 70; i++) {
      const [x, z] = place();
      const kind = Math.random();
      if (kind < 0.35) {
        const r = rand(14, 40);
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rockMat);
        rock.position.set(x, r * 0.5, z);
        rock.rotation.set(rand(0, TAU), rand(0, TAU), 0);
        rock.scale.y = rand(0.5, 0.9);
        grp.add(rock);
        continue;
      }
      if (stage === 0) {
        // 松树
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(4, 6, 40, 6), new THREE.MeshLambertMaterial({ color: '#4a3a2a' }));
        trunk.position.set(x, 20, z);
        grp.add(trunk);
        const leaf = new THREE.MeshLambertMaterial({ color: '#3d5a3a', flatShading: true });
        for (let k = 0; k < 3; k++) {
          const cone = new THREE.Mesh(new THREE.ConeGeometry(34 - k * 8, 40, 7), leaf);
          cone.position.set(x, 50 + k * 22, z);
          grp.add(cone);
        }
      } else if (stage === 1) {
        // 血晶
        const crystalMat = new THREE.MeshLambertMaterial({ color: '#a3212e', emissive: '#4a0a10', flatShading: true });
        for (let k = 0; k < 3; k++) {
          const h = rand(30, 80);
          const c = new THREE.Mesh(new THREE.ConeGeometry(rand(8, 14), h, 5), crystalMat);
          c.position.set(x + rand(-14, 14), h / 2, z + rand(-14, 14));
          c.rotation.set(rand(-0.3, 0.3), 0, rand(-0.3, 0.3));
          grp.add(c);
        }
      } else {
        // 礁石柱
        const h = rand(40, 120);
        const reef = new THREE.Mesh(new THREE.CylinderGeometry(rand(8, 14), rand(18, 30), h, 6), new THREE.MeshLambertMaterial({ color: '#3b5560', flatShading: true }));
        reef.position.set(x, h / 2 - 10, z);
        grp.add(reef);
      }
    }
  }

  private addMountains(stage: number): void {
    const color = new THREE.Color(STAGES[stage].ink).lerp(new THREE.Color(STAGES[stage].paper), 0.55);
    const mat = new THREE.MeshLambertMaterial({ color, flatShading: true });
    const cx = ARENA.x + ARENA.w / 2;
    const cz = ARENA.y + ARENA.h / 2;
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * TAU + rand(-0.1, 0.1);
      const d = rand(1700, 2400);
      const h = stage === 2 ? rand(60, 160) : rand(300, 800);
      const m = new THREE.Mesh(new THREE.ConeGeometry(rand(250, 450), h, 6), mat);
      m.position.set(cx + Math.cos(a) * d, h / 2 - 20, cz + Math.sin(a) * d);
      this.stageGroup.add(m);
    }
  }

  // ───────────────────────── 摄像机 ─────────────────────────
  private applyPose(p: CamPose, shake: number): void {
    const target = new THREE.Vector3(p.x, p.h, p.y);
    const cp = Math.cos(p.pitch);
    const pos = new THREE.Vector3(
      p.x + Math.sin(p.yaw) * cp * p.dist,
      p.h + Math.sin(p.pitch) * p.dist,
      p.y + Math.cos(p.yaw) * cp * p.dist,
    );
    if (shake > 0) {
      pos.x += rand(-shake, shake) * 0.6;
      pos.y += rand(-shake, shake) * 0.6;
      target.x += rand(-shake, shake) * 0.3;
    }
    const cam = this.camera;
    cam.position.copy(pos);
    cam.up.set(0, 1, 0);
    // 近乎正俯视时用“北”为上方向，避免万向锁
    if (p.pitch > 1.45) cam.up.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
    cam.lookAt(target);
    if (p.roll) cam.rotateZ(p.roll);
    if (cam.fov !== p.fov) {
      cam.fov = p.fov;
      cam.updateProjectionMatrix();
    }
    this.lastPose = p;
  }

  // ───────────────────────── View 接口 ─────────────────────────
  screenToGround(sx: number, sy: number): { x: number; y: number } {
    const ndc = new THREE.Vector2((sx / W) * 2 - 1, -(sy / H) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.aimPlane, hit)) return { x: this.lastPose.x, y: this.lastPose.y };
    return { x: hit.x, y: hit.z };
  }

  worldToScreen(x: number, y: number, h: number): { x: number; y: number; visible: boolean } {
    const v = this.tmpV.set(x, h, y).project(this.camera);
    return { x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * H, visible: v.z < 1 && v.z > -1 };
  }

  draw(g: Game, realDt: number): void {
    this.time += realDt;
    const stage = g.state === 'title' || g.state === 'select' ? 0 : g.stageIndex();
    if (stage !== this.stage) this.buildStage(stage);

    const menu = g.state === 'title' || g.state === 'select';
    let pose: CamPose;
    if (menu) {
      // 标题画面：缓慢环绕竞技场
      const cx = ARENA.x + ARENA.w / 2;
      const cy = ARENA.y + ARENA.h / 2;
      pose = { x: cx, y: cy, h: 40, yaw: Math.sin(this.time * 0.15) * 0.25, pitch: 0.3, dist: 760, fov: 42, roll: 0 };
    } else {
      pose = g.cine.pose(gameplayPose(PRESETS[g.camPreset], g.player.x, g.player.y));
    }
    this.applyPose(pose, menu ? 0 : g.shake);

    const showWorld = !menu;
    this.syncShowcase(menu, realDt);
    this.syncEntities(g, showWorld, realDt);
    this.renderer.render(this.scene, this.camera);
  }

  // ───────────────────────── 模型实例 ─────────────────────────
  private newInst(id: string, x: number, y: number): Inst {
    const free = this.modelFree.get(id);
    const model = free?.pop() ?? createModel(id);
    if (!model.root.parent) this.scene.add(model.root);
    model.root.visible = true;
    return { model, id, x, y, face: Math.PI / 2, phase: rand(0, TAU), action: 0, enraged: false };
  }

  private release(inst: Inst): void {
    inst.model.root.visible = false;
    inst.model.setFlash(0);
    inst.model.setTint(null);
    let list = this.modelFree.get(inst.id);
    if (!list) this.modelFree.set(inst.id, (list = []));
    list.push(inst.model);
  }

  /** 更新一个模型实例：根据位移推算步伐，朝向平滑转向。 */
  private drive(inst: Inst, x: number, y: number, face: number | null, dt: number, action: number, lean: number, lift = 0): void {
    const dx = x - inst.x;
    const dy = y - inst.y;
    const moved = Math.hypot(dx, dy);
    inst.x = x;
    inst.y = y;
    const speed = dt > 0 ? Math.min(1, moved / dt / 110) : 0;
    inst.phase += moved * 0.22;
    const target = face ?? (moved > 0.2 ? Math.atan2(dy, dx) : inst.face);
    inst.face = lerpAngle(inst.face, target, Math.min(1, dt * 12));
    inst.action += (action - inst.action) * Math.min(1, dt * 10);
    const m = inst.model;
    m.root.position.set(x, lift, y);
    m.root.rotation.set(0, -inst.face, 0);
    m.update({ t: this.time, dt, phase: inst.phase, speed, action: inst.action, lean });
  }

  private syncShowcase(menu: boolean, dt: number): void {
    if (menu && !this.showcase.length) {
      const cx = ARENA.x + ARENA.w / 2;
      const cy = ARENA.y + ARENA.h / 2;
      const layout: [string, number, number][] = [
        ['modaifu', -440, -60],
        ['player', -300, 120],
        ['wangchan', 330, -40],
        ['jiyin', 470, 110],
      ];
      for (const [id, ox, oy] of layout) this.showcase.push({ inst: this.newInst(id, cx + ox, cy + oy), x: cx + ox, y: cy + oy });
    }
    if (!menu && this.showcase.length) {
      for (const s of this.showcase) this.release(s.inst);
      this.showcase.length = 0;
    }
    for (const s of this.showcase) this.drive(s.inst, s.x, s.y, Math.PI / 2, dt, 0.3 + Math.sin(this.time * 1.3 + s.x) * 0.3, 0);
  }

  private syncEntities(g: Game, show: boolean, dt: number): void {
    const t = this.time;
    let sh = 0;
    const addShadow = (x: number, y: number, r: number) => {
      if (sh >= 400) return;
      this.tmpM.compose(this.tmpV.set(x, 0.6, y), this.tmpQ.identity(), this.tmpS.set(r * 2.2, 1, r * 1.4));
      this.shadows.setMatrixAt(sh++, this.tmpM);
    };

    // 玩家（韩立）
    const p = g.player;
    const pAlive = show && g.state !== 'gameover';
    const pm = this.playerInst.model;
    pm.root.visible = pAlive;
    if (pAlive) {
      const blink = p.iframes > 0 && p.dashT <= 0 && Math.floor(g.time * 20) % 2 === 0;
      const firing = (g.input.mouseDown || g.autoFire) && g.state === 'playing' && !g.cine.active;
      this.drive(this.playerInst, p.x, p.y, p.aim, dt, firing ? 1 : 0, p.dashT > 0 ? 1 : 0);
      pm.setOpacity(blink ? 0.45 : 1);
      addShadow(p.x, p.y, p.r);
    }

    // 敌人：每个敌人绑定一个模型实例，敌人消失后模型回收
    const seen = new Set<Enemy>();
    let boss: Enemy | null = null;
    if (show) {
      for (const e of g.enemies) {
        seen.add(e);
        let inst = this.enemyInst.get(e);
        if (!inst) {
          inst = this.newInst(e.def.id, e.x, e.y);
          inst.face = Math.atan2(p.y - e.y, p.x - e.x);
          this.enemyInst.set(e, inst);
        }
        if (e.boss) boss = e;
        const toPlayer = Math.atan2(p.y - e.y, p.x - e.x);
        const beh = e.def.behavior;
        const dashing = e.state === 2 && (beh === 'charger' || beh === 'boss');
        const telegraph = isTelegraphing(e);
        let face: number | null = null;
        if (dashing || telegraph) face = Math.atan2(e.dirY, e.dirX);
        else if (beh === 'ranged' || beh === 'boss') face = toPlayer;
        let action = 0;
        if (telegraph) action = 1;
        else if (beh === 'ranged' && e.def.shoot) action = e.shootCd < 0.35 ? 1 : 0;
        else if (beh === 'boss') action = e.pTimer > 0 && e.pTimer < 0.2 ? 1 : 0.35;
        const lift = beh === 'ghost' ? 10 + Math.sin(t * 3 + e.wobble) * 4 : 0;
        this.drive(inst, e.x, e.y, face, dt, action, dashing ? 1 : 0, lift);
        inst.model.setFlash(e.flash > 0 ? 1 : 0);
        if (e.enraged !== inst.enraged) {
          inst.enraged = e.enraged;
          inst.model.setTint(e.enraged ? '#6a0010' : null);
        }
        addShadow(e.x, e.y, e.r);
      }
    }
    for (const [e, inst] of this.enemyInst) {
      if (!seen.has(e)) {
        this.release(inst);
        this.enemyInst.delete(e);
      }
    }

    this.bossAura.visible = !!boss;
    if (boss) {
      const r = boss.r * 1.6 + Math.sin(t * 6) * 3;
      this.bossAura.position.set(boss.x, 1, boss.y);
      this.bossAura.scale.set(r, 1, r);
      this.bossAura.rotation.y = t;
      (this.bossAura.material as THREE.MeshBasicMaterial).color.set(boss.enraged ? '#d01c34' : '#c9a227');
    }

    // 预警带
    this.telePool.begin();
    if (show) {
      for (const e of g.enemies) {
        if (!isTelegraphing(e)) continue;
        const m = this.telePool.get();
        const len = e.boss ? 280 : 230;
        m.position.set(e.x, 0.9, e.y);
        m.scale.set(len, 1, e.r * 1.6);
        m.rotation.y = -Math.atan2(e.dirY, e.dirX);
      }
    }
    this.telePool.end();

    // 刷怪标记
    this.spawnPool.begin();
    if (show) {
      for (const s of g.spawns) {
        const m = this.spawnPool.get();
        const k = Math.max(0, Math.min(1, 1 - s.t));
        const r = s.def.r * (1.2 + k * 1.2);
        m.position.set(s.x, 0.8, s.y);
        m.scale.set(r, 1, r);
        (m.material as THREE.MeshBasicMaterial).opacity = 0.4 + 0.4 * Math.sin(t * 20);
      }
    }
    this.spawnPool.end();

    // 残影
    this.trailPool.begin();
    if (show) {
      for (const tr of g.trail) {
        const sp = this.trailPool.get();
        const size = p.r * 2.2;
        sp.scale.set(size, size, 1);
        sp.position.set(tr.x, size / 2, tr.y);
        sp.material.opacity = tr.life * 1.4;
      }
    }
    this.trailPool.end();

    // 环绕飞剑
    this.orbitPool.begin();
    const fy = g.weapons.find((w) => w.id === 'fengyun');
    if (show && fy) {
      const n = WEAPONS.fengyun.extra[fy.tier];
      const rad = orbitRadius(n);
      for (let i = 0; i < n; i++) {
        const a = g.orbitAngle + (i * TAU) / n;
        const m = this.orbitPool.get();
        m.position.set(p.x + Math.cos(a) * rad, 22 + Math.sin(t * 4 + i) * 2, p.y + Math.sin(a) * rad);
        m.rotation.set(0.5, -(a + Math.PI / 2), 0, 'YXZ');
        (m.material as THREE.MeshLambertMaterial).color.set(fy.tier > 0 ? RARITY_COLORS[fy.tier] : '#ffffff');
      }
    }
    this.orbitPool.end();

    // 投射物
    for (const pool of Object.values(this.projPools)) pool.begin();
    if (show) {
      for (const pr of g.projectiles) {
        const o = this.projPools[pr.kind].get();
        const ang = Math.atan2(pr.vy, pr.vx);
        o.position.set(pr.x, pr.kind === 'bug' ? 14 : 16, pr.y);
        if (pr.kind === 'blade') o.rotation.set(0, t * 18, 0);
        else if (pr.kind === 'sword' || pr.kind === 'wind') o.rotation.set(0, -ang, 0);
        if (pr.kind === 'bug') (o as THREE.Sprite).material.rotation = t * 10;
      }
    }
    for (const pool of Object.values(this.projPools)) pool.end();

    // 爆炸环（来自粒子中的 ring: 标记）
    this.ringPool.begin();
    const pts = this.particles.geometry;
    const pPos = pts.getAttribute('position') as THREE.BufferAttribute;
    const pCol = pts.getAttribute('color') as THREE.BufferAttribute;
    let np = 0;
    if (show) {
      for (const pt of g.particles) {
        const k = pt.life / pt.maxLife;
        if (pt.color.startsWith('ring:')) {
          const m = this.ringPool.get();
          const r = pt.size * (1.2 - k * 0.4);
          m.position.set(pt.x, 1.2, pt.y);
          m.scale.set(r, 1, r);
          const mat = m.material as THREE.MeshBasicMaterial;
          mat.color.set(pt.color.slice(5));
          mat.opacity = k;
          continue;
        }
        if (np >= 800) continue;
        pPos.setXYZ(np, pt.x, 8 + (1 - k) * 22, pt.y);
        this.tmpColor.set(pt.color).multiplyScalar(0.5 + k * 0.5);
        pCol.setXYZ(np, this.tmpColor.r, this.tmpColor.g, this.tmpColor.b);
        np++;
      }
    }
    pts.setDrawRange(0, np);
    pPos.needsUpdate = true;
    pCol.needsUpdate = true;
    this.ringPool.end();

    // 敌方弹幕
    const gPos = this.bulletGlow.geometry.getAttribute('position') as THREE.BufferAttribute;
    const gCol = this.bulletGlow.geometry.getAttribute('color') as THREE.BufferAttribute;
    const cPos = this.bulletCore.geometry.getAttribute('position') as THREE.BufferAttribute;
    let nb = 0;
    if (show) {
      for (const b of g.bullets) {
        if (nb >= 1200) break;
        gPos.setXYZ(nb, b.x, 14, b.y);
        cPos.setXYZ(nb, b.x, 14.5, b.y);
        this.tmpColor.set(b.color);
        gCol.setXYZ(nb, this.tmpColor.r, this.tmpColor.g, this.tmpColor.b);
        nb++;
        addShadow(b.x, b.y, 4);
      }
    }
    this.bulletGlow.geometry.setDrawRange(0, nb);
    this.bulletCore.geometry.setDrawRange(0, nb);
    gPos.needsUpdate = true;
    gCol.needsUpdate = true;
    cPos.needsUpdate = true;

    // 灵石
    let nk = 0;
    if (show) {
      for (const pk of g.pickups) {
        if (nk >= 800) break;
        const s = 4 + Math.min(4, pk.value);
        this.tmpQ.setFromAxisAngle(this.tmpV.set(0, 1, 0), t * 2 + pk.x);
        this.tmpM.compose(this.tmpV.set(pk.x, 8 + Math.sin(t * 4 + pk.y) * 2, pk.y), this.tmpQ, this.tmpS.set(s * 0.7, s, s * 0.7));
        this.pickups.setMatrixAt(nk++, this.tmpM);
      }
    }
    this.pickups.count = nk;
    this.pickups.instanceMatrix.needsUpdate = true;

    // 雷电
    this.boltPool.begin();
    if (show) {
      for (const b of g.bolts) {
        for (let layer = 0; layer < 2; layer++) {
          const line = this.boltPool.get();
          const pos = line.geometry.getAttribute('position') as THREE.BufferAttribute;
          let n = 0;
          for (let i = 0; i < b.points.length - 1 && n < 60; i++) {
            const a = b.points[i];
            const c = b.points[i + 1];
            for (let s = 0; s <= 5; s++) {
              const k = s / 5;
              const j = s === 0 || s === 5 ? 0 : 10;
              pos.setXYZ(n++, a.x + (c.x - a.x) * k + rand(-j, j), 18 + rand(-j, j) * 0.5, a.y + (c.y - a.y) * k + rand(-j, j));
            }
          }
          pos.needsUpdate = true;
          line.geometry.setDrawRange(0, n);
          const mat = line.material as THREE.LineBasicMaterial;
          mat.color.set(layer ? '#ffffff' : '#7a7cff');
          mat.opacity = Math.min(1, b.life / 0.15);
        }
      }
    }
    this.boltPool.end();

    this.shadows.count = sh;
    this.shadows.instanceMatrix.needsUpdate = true;
  }
}
