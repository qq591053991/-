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
  bladeTexture, bossTexture, bugTexture, crossTexture, glowTexture, groundTexture, repaintAll,
  shadowTexture, swordTexture, telegraphTexture, tokenTexture, windTexture,
} from './textures';

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

  private readonly matCache = new Map<string, THREE.SpriteMaterial>();
  private readonly enemyPool: Pool<THREE.Sprite>;
  private readonly bossAura: THREE.Mesh;
  private readonly player: THREE.Sprite;
  private readonly playerSword: THREE.Mesh;
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
    this.enemyPool = new Pool(s, () => new THREE.Sprite(spriteMat(tokenTexture('匪', '#000'))));
    this.player = new THREE.Sprite(spriteMat(tokenTexture('韩', PLAYER_COLOR, false, '#f4efe1')));
    s.add(this.player);
    const swordGeo = new THREE.BoxGeometry(26, 2, 4);
    swordGeo.translate(13, 0, 0);
    this.playerSword = new THREE.Mesh(swordGeo, new THREE.MeshLambertMaterial({ color: '#8fe3d2', emissive: '#2a8c7a', emissiveIntensity: 0.4 }));
    s.add(this.playerSword);

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
      blade: new Pool(s, flat(bladeTexture(), 26, 26)),
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
      const m = flatMesh(swordTexture(), 34, 10);
      return m;
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
    this.trailPool = new Pool(s, () => new THREE.Sprite(spriteMat(tokenTexture('韩', PLAYER_COLOR, false, '#f4efe1'), 0.4)));
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
      pose = { x: cx, y: cy, h: 0, yaw: this.time * 0.08, pitch: 0.42, dist: 1250, fov: 42, roll: 0 };
    } else {
      pose = g.cine.pose(gameplayPose(PRESETS[g.camPreset], g.player.x, g.player.y));
    }
    this.applyPose(pose, menu ? 0 : g.shake);

    const showWorld = !menu;
    this.syncEntities(g, showWorld);
    this.renderer.render(this.scene, this.camera);
  }

  private enemyMaterial(e: Enemy): THREE.SpriteMaterial {
    const flash = e.flash > 0;
    const key = `${e.def.id}:${flash}:${e.enraged}`;
    let m = this.matCache.get(key);
    if (!m) {
      const tex = e.boss
        ? bossTexture(e.def.glyph, e.enraged ? '#5a0f1e' : e.def.color, e.enraged ? '#e0283c' : '#c9a227', flash)
        : tokenTexture(e.def.glyph, e.def.color, flash);
      m = spriteMat(tex, e.def.behavior === 'ghost' ? 0.75 : 1);
      this.matCache.set(key, m);
    }
    return m;
  }

  private syncEntities(g: Game, show: boolean): void {
    const t = this.time;
    let sh = 0;
    const addShadow = (x: number, y: number, r: number) => {
      if (sh >= 400) return;
      this.tmpM.compose(this.tmpV.set(x, 0.6, y), this.tmpQ.identity(), this.tmpS.set(r * 2.2, 1, r * 1.4));
      this.shadows.setMatrixAt(sh++, this.tmpM);
    };

    // 玩家
    const p = g.player;
    const pAlive = show && g.state !== 'gameover';
    this.player.visible = pAlive;
    this.playerSword.visible = pAlive;
    if (pAlive) {
      const blink = p.iframes > 0 && p.dashT <= 0 && Math.floor(g.time * 20) % 2 === 0;
      this.player.material.opacity = blink ? 0.4 : 1;
      const size = p.r * 2.4;
      const bob = p.moving ? Math.abs(Math.sin(g.time * 12)) * 4 : 0;
      this.player.scale.set(size, size, 1);
      this.player.position.set(p.x, size / 2 + bob, p.y);
      this.playerSword.position.set(p.x, 18, p.y);
      this.playerSword.rotation.set(0, -p.aim, 0);
      addShadow(p.x, p.y, p.r);
    }

    // 敌人
    this.enemyPool.begin();
    let boss: Enemy | null = null;
    if (show) {
      for (const e of g.enemies) {
        const sp = this.enemyPool.get();
        sp.material = this.enemyMaterial(e);
        if (e.boss) {
          boss = e;
          const hgt = e.r * 3.6;
          sp.scale.set(hgt * 0.8, hgt, 1);
          sp.position.set(e.x, hgt / 2, e.y);
        } else {
          const size = e.r * 2.4;
          const float = e.def.behavior === 'ghost' ? 14 + Math.sin(t * 3 + e.wobble) * 5 : 0;
          const hop = e.def.behavior === 'charger' && e.state === 2 ? 6 : 0;
          sp.scale.set(size, size, 1);
          sp.position.set(e.x, size / 2 + float + hop, e.y);
        }
        addShadow(e.x, e.y, e.r);
      }
    }
    this.enemyPool.end();

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
        m.position.set(p.x + Math.cos(a) * rad, 20, p.y + Math.sin(a) * rad);
        m.rotation.set(0, -(a + Math.PI / 2), 0);
        (m.material as THREE.MeshBasicMaterial).color.set(fy.tier > 0 ? RARITY_COLORS[fy.tier] : '#ffffff');
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
