import { Audio } from '../core/audio';
import { Input } from '../core/input';
import { TAU, clamp, dist2, pickWeighted, rand, randInt } from '../core/math';
import { ENEMIES, type EnemyDef } from '../data/enemies';
import { ITEM_BY_ID } from '../data/items';
import { expToNext, majorBreakthrough, realmName } from '../data/realms';
import { STAGES, TOTAL_WAVES, WAVES, enemyScale, stageOf } from '../data/waves';
import { WEAPONS, TIER_PRICE_MULT, type WeaponId } from '../data/weapons';
import {
  ARENA, DASH_BASE_CD, DASH_IFRAMES, DASH_SPEED, DASH_TIME, H, HURT_IFRAMES, MAX_ENEMIES, PLAYER_BASE_SPEED, W,
} from './constants';
import { updateEnemy } from './enemyAI';
import { Director, PRESETS } from './camera';
import { deathShots, enrageShots, introShots, type BossKey } from './cinematics';
import {
  applyWeaponPurchase, genLevelChoices, genOffers, lingyeSellValue, lingyeUpgradeCost, rerollCostFor,
} from './shop';
import {
  baseStats,
  type Bolt, type Bullet, type Enemy, type FloatText, type GameState, type LevelChoice, type MainAttack,
  type Offer, type Particle, type Pickup, type Player, type Projectile, type SpawnMarker, type Stats, type WeaponInst,
} from './types';
import { updateWeapons } from './weaponsys';

export interface UIHooks {
  render(): void;
}

/** 渲染层接口（3D 场景实现），游戏逻辑不直接依赖渲染库。 */
export interface View {
  draw(g: Game, realDt: number): void;
  screenToGround(sx: number, sy: number): { x: number; y: number };
}

export interface Overlay {
  draw(g: Game, realDt: number): void;
}

const BEST_KEY = 'fanren-roguelike-best';

function defaultMain(): MainAttack {
  return { damage: 10, rate: 3.5, projectiles: 1, pierce: 0, speed: 640, life: 0.6 };
}

function newPlayer(): Player {
  return {
    x: ARENA.x + ARENA.w / 2, y: ARENA.y + ARENA.h / 2, r: 14, hp: 60, aim: 0,
    iframes: 0, dashT: 0, dashCd: 0, dashX: 1, dashY: 0, fireCd: 0, moving: false,
  };
}

export class Game {
  state: GameState = 'title';
  readonly input: Input;
  readonly audio = new Audio();
  ui: UIHooks = { render: () => {} };
  view: View | null = null;
  hud: Overlay | null = null;
  /** 首领演出导演（多机位切换） */
  readonly cine = new Director();
  /** 当前战斗视角（V 键切换） */
  camPreset = 0;
  /** 鼠标指向的地面坐标 */
  aimWorld = { x: 0, y: 0 };

  stats: Stats = baseStats();
  main: MainAttack = defaultMain();
  player: Player = newPlayer();
  weapons: WeaponInst[] = [];
  items: Record<string, number> = {};

  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  bullets: Bullet[] = [];
  pickups: Pickup[] = [];
  spawns: SpawnMarker[] = [];
  particles: Particle[] = [];
  texts: FloatText[] = [];
  bolts: Bolt[] = [];
  trail: { x: number; y: number; life: number }[] = [];

  orbitAngle = 0;
  wave = 1;
  waveTime = 0;
  spawnTimer = 0;
  boss: Enemy | null = null;
  bossDeadT = 0;
  gold = 0;
  level = 0;
  exp = 0;
  pendingLevels = 0;
  lingye = 0;
  kills = 0;
  elapsed = 0;
  time = 0;
  shake = 0;
  autoFire = false;
  banner: { text: string; sub: string; t: number; dur: number } | null = null;

  offers: Offer[] = [];
  rerolls = 0;
  levelChoices: LevelChoice[] = [];
  levelRerolls = 0;
  bestWave = 0;

  private lastT = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.input = new Input(canvas, W, H);
    try {
      this.bestWave = Number(localStorage.getItem(BEST_KEY) ?? 0) || 0;
    } catch {
      this.bestWave = 0;
    }
    this.cine.setListener((shot) => {
      if (shot.shake) this.shake = Math.max(this.shake, shot.shake);
    });
  }

  // ───────────────────────── 派生数值 ─────────────────────────
  atkMult(): number {
    return Math.max(0.3, 1 + this.stats.attackSpeed / 100);
  }
  dmgMult(): number {
    return Math.max(0.1, 1 + this.stats.damage / 100);
  }
  moveSpeed(): number {
    return Math.max(80, PLAYER_BASE_SPEED * (1 + this.stats.speed / 100));
  }
  dashCooldown(): number {
    return Math.max(0.3, DASH_BASE_CD * (1 - Math.min(70, this.stats.dashCd) / 100));
  }
  armorFactor(): number {
    const a = this.stats.armor;
    return a >= 0 ? 15 / (15 + a) : 1 + -a / 15;
  }
  stageIndex(): number {
    return stageOf(this.wave);
  }
  realm(): string {
    return realmName(this.level);
  }
  expNeed(): number {
    return expToNext(this.level);
  }

  // ───────────────────────── 流程 ─────────────────────────
  start(): void {
    const loop = (t: number) => {
      const dt = Math.min(1 / 30, (t - (this.lastT || t)) / 1000);
      this.lastT = t;
      this.time += dt;
      this.frame(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  setState(s: GameState): void {
    this.state = s;
    this.ui.render();
  }

  goSelect(): void {
    this.setState('select');
  }

  newRun(startWeapon: WeaponId): void {
    this.stats = baseStats();
    this.main = defaultMain();
    this.player = newPlayer();
    this.player.hp = this.stats.maxHp;
    this.weapons = [{ id: startWeapon, tier: 0, cd: 0 }];
    this.items = {};
    this.gold = 0;
    this.level = 0;
    this.exp = 0;
    this.pendingLevels = 0;
    this.lingye = 0;
    this.kills = 0;
    this.elapsed = 0;
    this.wave = 1;
    this.autoFire = false;
    this.startWave();
  }

  private clearField(): void {
    this.enemies = [];
    this.projectiles = [];
    this.bullets = [];
    this.pickups = [];
    this.spawns = [];
    this.bolts = [];
    this.trail = [];
    this.boss = null;
    this.bossDeadT = 0;
    this.cine.stop();
  }

  startWave(): void {
    this.clearField();
    const def = WAVES[this.wave - 1];
    this.waveTime = def.duration;
    this.spawnTimer = 0.6;
    this.player.x = ARENA.x + ARENA.w / 2;
    this.player.y = ARENA.y + ARENA.h / 2;
    this.player.iframes = 1;
    this.player.dashCd = 0;
    for (const w of this.weapons) w.cd = 0.3;
    const stage = STAGES[this.stageIndex()];
    if (def.boss) {
      const bdef = ENEMIES[def.boss];
      // 首领现身时触发开场演出（见 spawnEnemy）
      this.addSpawnMarker(bdef, ARENA.x + ARENA.w / 2, ARENA.y + 130, true, 0.7);
      this.audio.play('boss');
    } else {
      this.showBanner(`第${this.wave}波`, `${stage.name} · ${stage.subtitle}`, 2);
    }
    this.setState('playing');
  }

  private endWave(): void {
    // 场上灵石自动收入囊中
    for (const pk of this.pickups) this.collect(pk.value, false);
    this.clearField();
    this.lingye += 1;
    this.player.hp = this.stats.maxHp;
    this.texts = [];
    if (this.wave >= TOTAL_WAVES) {
      this.saveBest(this.wave);
      this.setState('victory');
      return;
    }
    this.saveBest(this.wave);
    this.afterWave();
  }

  private afterWave(): void {
    if (this.pendingLevels > 0) {
      this.levelRerolls = 0;
      this.levelChoices = genLevelChoices(this.stats, this.main, this.level);
      this.setState('levelup');
    } else {
      this.openShop();
    }
  }

  chooseLevel(i: number): void {
    const c = this.levelChoices[i];
    if (!c) return;
    c.apply();
    this.audio.play('levelup');
    this.pendingLevels--;
    this.syncHp();
    if (this.pendingLevels > 0) {
      this.levelRerolls = 0;
      this.levelChoices = genLevelChoices(this.stats, this.main, this.level);
      this.ui.render();
    } else {
      this.openShop();
    }
  }

  levelRerollCost(): number {
    return rerollCostFor(this.wave, this.levelRerolls);
  }

  rerollLevel(): void {
    const cost = this.levelRerollCost();
    if (this.gold < cost) return;
    this.gold -= cost;
    this.levelRerolls++;
    this.levelChoices = genLevelChoices(this.stats, this.main, this.level);
    this.ui.render();
  }

  private openShop(): void {
    this.rerolls = 0;
    this.offers = genOffers(this.shopCtx());
    this.setState('shop');
  }

  private shopCtx() {
    return { wave: this.wave + 1, stats: this.stats, weapons: this.weapons };
  }

  rerollCost(): number {
    return rerollCostFor(this.wave, this.rerolls);
  }

  reroll(): void {
    const cost = this.rerollCost();
    if (this.gold < cost) return;
    this.gold -= cost;
    this.rerolls++;
    this.offers = genOffers(this.shopCtx());
    this.audio.play('buy');
    this.ui.render();
  }

  canBuy(o: Offer): boolean {
    if (o.sold || this.gold < o.price) return false;
    if (o.kind === 'weapon') {
      const owned = this.weapons.find((w) => w.id === o.id);
      return owned ? owned.tier < 3 : this.weapons.length < 6;
    }
    return true;
  }

  buy(i: number): void {
    const o = this.offers[i];
    if (!o || !this.canBuy(o)) return;
    if (o.kind === 'weapon') {
      if (!applyWeaponPurchase(this.weapons, o.id, o.tier)) return;
    } else {
      ITEM_BY_ID[o.id].apply(this.stats);
      this.items[o.id] = (this.items[o.id] ?? 0) + 1;
      this.syncHp();
    }
    this.gold -= o.price;
    o.sold = true;
    this.audio.play('buy');
    this.ui.render();
  }

  weaponSellValue(w: WeaponInst): number {
    return Math.round(WEAPONS[w.id].basePrice * TIER_PRICE_MULT[w.tier] * 0.4 * (1 + 0.12 * (this.wave - 1)));
  }

  sellWeapon(i: number): void {
    const w = this.weapons[i];
    if (!w || this.weapons.length <= 1) return;
    this.gold += this.weaponSellValue(w);
    this.weapons.splice(i, 1);
    this.audio.play('buy');
    this.ui.render();
  }

  lingyeCost(w: WeaponInst): number {
    return lingyeUpgradeCost(w.tier);
  }

  /** 掌天瓶灵液催熟：提升一件法宝的品阶。 */
  upgradeWithLingye(i: number): void {
    const w = this.weapons[i];
    if (!w || w.tier >= 3) return;
    const cost = this.lingyeCost(w);
    if (this.lingye < cost) return;
    this.lingye -= cost;
    w.tier = (w.tier + 1) as WeaponInst['tier'];
    this.audio.play('levelup');
    this.ui.render();
  }

  lingyeValue(): number {
    return lingyeSellValue(this.wave);
  }

  /** 掌天瓶灵液催熟灵药出售，换取灵石。 */
  sellLingye(): void {
    if (this.lingye < 1) return;
    this.lingye -= 1;
    this.gold += this.lingyeValue();
    this.audio.play('buy');
    this.ui.render();
  }

  nextWave(): void {
    this.wave++;
    this.startWave();
  }

  togglePause(): void {
    if (this.state === 'playing') this.setState('paused');
    else if (this.state === 'paused') this.setState('playing');
  }

  toTitle(): void {
    this.clearField();
    this.setState('title');
  }

  private saveBest(wave: number): void {
    if (wave <= this.bestWave) return;
    this.bestWave = wave;
    try {
      localStorage.setItem(BEST_KEY, String(wave));
    } catch {
      /* 存储不可用时忽略 */
    }
  }

  private syncHp(): void {
    this.player.hp = Math.min(this.player.hp, this.stats.maxHp);
  }

  showBanner(text: string, sub: string, dur: number): void {
    this.banner = { text, sub, t: 0, dur };
  }

  // ───────────────────────── 主循环 ─────────────────────────
  private frame(dt: number): void {
    const inp = this.input;
    if (inp.wasPressed('KeyM')) this.audio.muted = !this.audio.muted;
    const c = this.cine;
    const skippable = this.state === 'playing' && c.active && c.idx < c.shots.length - 1;
    if (skippable && inp.wasPressed('Space', 'Enter', 'Escape', 'Dash')) {
      c.skip();
      inp.endFrame(); // 吞掉这次按键，避免同时触发闪避 / 暂停
    } else if (inp.wasPressed('Escape', 'KeyP')) {
      this.togglePause();
    }
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 30);
    if (this.state === 'playing') {
      if (inp.wasPressed('KeyF')) this.autoFire = !this.autoFire;
      if (inp.wasPressed('KeyV') && !c.active) this.camPreset = (this.camPreset + 1) % PRESETS.length;
      c.update(dt);
      if (this.view) this.aimWorld = this.view.screenToGround(inp.mouse.x, inp.mouse.y);
      const ts = c.active ? c.timeScale : 1;
      if (ts > 0) this.update(dt * ts);
    } else {
      c.update(0);
    }
    this.view?.draw(this, dt);
    this.hud?.draw(this, dt);
    inp.endFrame();
  }

  /** 播放首领演出：开场 / 狂暴 / 伏诛，各有专属机位脚本。 */
  playBossCine(e: Enemy, kind: 'intro' | 'enrage' | 'death'): void {
    const key = (e.def.bossKey ?? 'modaifu') as BossKey;
    const shots = kind === 'intro' ? introShots(key) : kind === 'enrage' ? enrageShots(key) : deathShots(key);
    this.cine.play(shots, { x: e.x, y: e.y, h: e.r * 2 });
  }

  onBossEnrage(e: Enemy): void {
    this.audio.play('boss');
    this.playBossCine(e, 'enrage');
  }

  private update(dt: number): void {
    this.elapsed += dt;
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t > this.banner.dur) this.banner = null;
    }
    this.updatePlayer(dt);
    updateWeapons(this, dt);
    this.updateSpawner(dt);
    for (const e of this.enemies) if (!e.dead) updateEnemy(this, e, dt);
    this.separateEnemies();
    this.updateProjectiles(dt);
    this.updateBullets(dt);
    this.contactDamage();
    this.updatePickups(dt);
    this.updateFx(dt);

    this.enemies = this.enemies.filter((e) => !e.dead);
    this.projectiles = this.projectiles.filter((p) => !p.dead);
    this.bullets = this.bullets.filter((b) => !b.dead);

    if (this.state !== 'playing') return; // 可能在本帧阵亡

    const p = this.player;
    if (this.stats.regen > 0) p.hp = Math.min(this.stats.maxHp, p.hp + this.stats.regen * dt);

    if (this.bossDeadT > 0) {
      this.bossDeadT -= dt;
      if (this.bossDeadT <= 0) this.endWave();
    } else if (WAVES[this.wave - 1].duration > 0 && this.waveTime <= 0) {
      this.endWave();
    }
  }

  private updatePlayer(dt: number): void {
    const p = this.player;
    const inp = this.input;
    let mx = 0;
    let my = 0;
    if (inp.down('KeyW', 'ArrowUp')) my -= 1;
    if (inp.down('KeyS', 'ArrowDown')) my += 1;
    if (inp.down('KeyA', 'ArrowLeft')) mx -= 1;
    if (inp.down('KeyD', 'ArrowRight')) mx += 1;
    const len = Math.hypot(mx, my);
    if (len > 0) {
      mx /= len;
      my /= len;
    }
    p.moving = len > 0;
    p.aim = Math.atan2(this.aimWorld.y - p.y, this.aimWorld.x - p.x);

    if (p.iframes > 0) p.iframes -= dt;
    if (p.dashCd > 0) p.dashCd -= dt;

    if (inp.wasPressed('Space', 'ShiftLeft', 'Dash') && p.dashCd <= 0 && p.dashT <= 0) {
      if (len > 0) {
        p.dashX = mx;
        p.dashY = my;
      } else {
        p.dashX = Math.cos(p.aim);
        p.dashY = Math.sin(p.aim);
      }
      p.dashT = DASH_TIME;
      p.iframes = Math.max(p.iframes, DASH_IFRAMES);
      p.dashCd = this.dashCooldown();
      this.audio.play('dash');
    }

    if (p.dashT > 0) {
      p.dashT -= dt;
      p.x += p.dashX * DASH_SPEED * dt;
      p.y += p.dashY * DASH_SPEED * dt;
      this.trail.push({ x: p.x, y: p.y, life: 0.25 });
    } else {
      const spd = this.moveSpeed();
      p.x += mx * spd * dt;
      p.y += my * spd * dt;
    }
    this.clampToArena(p, p.r);

    // 主修：青元剑芒
    if (p.fireCd > 0) p.fireCd -= dt;
    if ((inp.mouseDown || this.autoFire) && p.fireCd <= 0) {
      const m = this.main;
      p.fireCd = 1 / (m.rate * this.atkMult());
      const n = m.projectiles;
      const arc = n > 1 ? 0.14 * (n - 1) : 0;
      for (let i = 0; i < n; i++) {
        const a = p.aim + (n > 1 ? -arc / 2 + (arc * i) / (n - 1) : 0);
        this.projectiles.push({
          kind: 'sword', x: p.x + Math.cos(a) * 16, y: p.y + Math.sin(a) * 16,
          vx: Math.cos(a) * m.speed, vy: Math.sin(a) * m.speed, r: 6, dmg: m.damage,
          pierce: m.pierce, life: m.life, hit: new Set(), color: '#2a8c7a',
        });
      }
      this.audio.play('shoot');
    }
  }

  clampToArena(o: { x: number; y: number }, r: number): void {
    o.x = clamp(o.x, ARENA.x + r, ARENA.x + ARENA.w - r);
    o.y = clamp(o.y, ARENA.y + r, ARENA.y + ARENA.h - r);
  }

  // ───────────────────────── 刷怪 ─────────────────────────
  private updateSpawner(dt: number): void {
    const def = WAVES[this.wave - 1];
    if (def.duration > 0) this.waveTime -= dt;

    for (const s of this.spawns) {
      s.t -= dt;
      if (s.t <= 0) this.spawnEnemy(s.def, s.x, s.y, s.boss);
    }
    this.spawns = this.spawns.filter((s) => s.t > 0);

    if (this.bossDeadT > 0) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    const progress = def.duration > 0 ? 1 - this.waveTime / def.duration : 0.5;
    this.spawnTimer = def.interval * (1 - 0.35 * clamp(progress, 0, 1));
    if (def.duration > 0 && this.waveTime < 1) return; // 波次末尾不再刷怪
    if (this.enemies.length + this.spawns.length >= MAX_ENEMIES) return;

    const p = this.player;
    let cx = 0;
    let cy = 0;
    for (let tries = 0; tries < 20; tries++) {
      cx = rand(ARENA.x + 60, ARENA.x + ARENA.w - 60);
      cy = rand(ARENA.y + 60, ARENA.y + ARENA.h - 60);
      if (dist2(cx, cy, p.x, p.y) > 260 * 260) break;
    }
    const n = randInt(def.group[0], def.group[1]);
    for (let i = 0; i < n; i++) {
      const id = pickWeighted(def.pool.map((e) => ({ item: e.id, w: e.w })));
      this.addSpawnMarker(ENEMIES[id], cx + rand(-50, 50), cy + rand(-50, 50), false, 0.9);
    }
  }

  addSpawnMarker(def: EnemyDef, x: number, y: number, boss: boolean, t: number): void {
    const m = { x, y, t, def, boss };
    this.clampToArena(m, def.r);
    this.spawns.push(m);
  }

  private spawnEnemy(def: EnemyDef, x: number, y: number, boss: boolean): void {
    const sc = enemyScale(this.wave);
    const hp = boss ? def.hp : def.hp * sc.hp;
    const e: Enemy = {
      def, x, y, r: def.r, hp, maxHp: hp,
      speed: def.speed * rand(0.92, 1.08), dmg: Math.round(def.dmg * (boss ? 1 : sc.dmg)),
      kbx: 0, kby: 0, flash: 0, shootCd: def.shoot ? rand(0.8, def.shoot.cd) : 0,
      state: 0, stateT: rand(0, 1), dirX: 0, dirY: 0, orbitCd: 0, wobble: rand(0, TAU),
      dead: false, boss, pIdx: 0, pT: 0, pSub: 0, pTimer: 0.8, spin: 0, enraged: false,
    };
    this.enemies.push(e);
    if (boss) {
      this.boss = e;
      this.playBossCine(e, 'intro');
    }
  }

  private separateEnemies(): void {
    const es = this.enemies;
    for (let i = 0; i < es.length; i++) {
      const a = es[i];
      for (let j = i + 1; j < es.length; j++) {
        const b = es[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const rr = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const push = (rr - d) * 0.5;
        const ux = dx / d;
        const uy = dy / d;
        const wa = a.boss ? 0 : b.boss ? 2 : 1;
        const wb = b.boss ? 0 : a.boss ? 2 : 1;
        a.x -= ux * push * wa;
        a.y -= uy * push * wa;
        b.x += ux * push * wb;
        b.y += uy * push * wb;
      }
    }
  }

  // ───────────────────────── 战斗 ─────────────────────────
  nearestEnemy(x: number, y: number, range: number): Enemy | null {
    let best: Enemy | null = null;
    let bd = range * range;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = dist2(x, y, e.x, e.y);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  damageEnemy(e: Enemy, base: number, sx: number, sy: number, kb: number): void {
    if (e.dead) return;
    let dmg = base * this.dmgMult();
    const crit = Math.random() < this.stats.crit;
    if (crit) dmg *= 1 + this.stats.critDmg;
    const final = Math.max(1, Math.round(dmg));
    e.hp -= final;
    e.flash = 0.08;
    if (!e.boss) {
      const a = Math.atan2(e.y - sy, e.x - sx);
      const k = e.def.behavior === 'tank' ? kb * 0.3 : kb;
      e.kbx += Math.cos(a) * k;
      e.kby += Math.sin(a) * k;
    }
    this.texts.push({
      x: e.x + rand(-8, 8), y: e.y - e.r, text: String(final), life: 0.6,
      color: crit ? '#e0701a' : '#2b2b2b', size: crit ? 20 : 15,
    });
    if (this.stats.lifesteal > 0 && Math.random() < this.stats.lifesteal) {
      this.player.hp = Math.min(this.stats.maxHp, this.player.hp + 1);
    }
    this.audio.play('hit');
    if (e.hp <= 0) this.killEnemy(e);
  }

  private killEnemy(e: Enemy): void {
    e.dead = true;
    this.kills++;
    this.burst(e.x, e.y, e.boss ? 60 : 10, e.def.color, e.boss ? 260 : 140);
    this.audio.play('kill');
    const drops = e.boss ? 0 : e.def.drop;
    for (let i = 0; i < drops; i++) this.dropPickup(e.x, e.y, 1);
    if (e.boss) {
      const bossValue = 30 + this.wave * 6;
      for (let i = 0; i < 20; i++) this.dropPickup(e.x, e.y, Math.ceil(bossValue / 20));
      for (const o of this.enemies) {
        if (!o.dead && o !== e) {
          o.dead = true;
          this.burst(o.x, o.y, 8, o.def.color, 120);
        }
      }
      this.spawns = [];
      this.bullets = [];
      this.boss = null;
      this.bossDeadT = 1.8;
      this.shake = 16;
      this.playBossCine(e, 'death');
      this.audio.play('boom');
    }
  }

  private dropPickup(x: number, y: number, value: number): void {
    const a = rand(0, TAU);
    const s = rand(40, 140);
    this.pickups.push({ x, y, value, magnet: false, vx: Math.cos(a) * s, vy: Math.sin(a) * s });
  }

  private collect(value: number, sound = true): void {
    this.gold += value * (1 + this.stats.goldGain / 100);
    this.gainExp(value * (1 + this.stats.expGain / 100));
    if (sound) this.audio.play('pickup');
  }

  private gainExp(v: number): void {
    this.exp += v;
    while (this.exp >= this.expNeed()) {
      this.exp -= this.expNeed();
      this.level++;
      this.pendingLevels++;
      this.stats.maxHp += 1;
      this.player.hp += 1;
      const major = majorBreakthrough(this.level);
      if (major) {
        this.stats.maxHp += 10;
        this.stats.damage += 5;
        this.player.hp = this.stats.maxHp;
        if (this.state === 'playing') this.showBanner(`突破！${major}`, '气血 +10，伤害 +5%', 2);
      }
      this.texts.push({ x: this.player.x, y: this.player.y - 30, text: this.realm(), life: 1.2, color: '#2a8c7a', size: 18 });
      this.audio.play('levelup');
    }
  }

  hurtPlayer(dmg: number): void {
    const p = this.player;
    if (p.iframes > 0 || this.state !== 'playing' || this.bossDeadT > 0) return;
    const final = Math.max(1, Math.round(dmg * this.armorFactor()));
    p.hp -= final;
    p.iframes = HURT_IFRAMES;
    this.shake = Math.max(this.shake, 8);
    this.texts.push({ x: p.x, y: p.y - 24, text: `-${final}`, life: 0.8, color: '#c0392b', size: 20 });
    this.audio.play('hurt');
    if (p.hp <= 0) {
      p.hp = 0;
      this.burst(p.x, p.y, 40, '#2a8c7a', 200);
      this.saveBest(this.wave - 1);
      this.setState('gameover');
    }
  }

  fireBullet(x: number, y: number, ang: number, speed: number, dmg: number, r: number, color: string, accel = 0): void {
    this.bullets.push({ x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, r, dmg, life: 7, color, accel });
  }

  spreadBullets(x: number, y: number, ang: number, n: number, arc: number, speed: number, dmg: number, color: string): void {
    for (let i = 0; i < n; i++) {
      const a = n > 1 ? ang - arc / 2 + (arc * i) / (n - 1) : ang;
      this.fireBullet(x, y, a, speed, dmg, 6, color);
    }
  }

  ringBullets(x: number, y: number, n: number, speed: number, dmg: number, offset: number, color: string, accel = 0): void {
    for (let i = 0; i < n; i++) this.fireBullet(x, y, offset + (i * TAU) / n, speed, dmg, 6, color, accel);
  }

  private updateProjectiles(dt: number): void {
    const p = this.player;
    for (const pr of this.projectiles) {
      if (pr.dead) continue;
      if (pr.kind === 'bug') {
        if (!pr.target || pr.target.dead) pr.target = this.nearestEnemy(pr.x, pr.y, 500);
        if (pr.target) {
          const a = Math.atan2(pr.target.y - pr.y, pr.target.x - pr.x);
          const cur = Math.atan2(pr.vy, pr.vx);
          let diff = a - cur;
          while (diff > Math.PI) diff -= TAU;
          while (diff < -Math.PI) diff += TAU;
          const na = cur + clamp(diff, -6 * dt, 6 * dt);
          pr.vx = Math.cos(na) * 340;
          pr.vy = Math.sin(na) * 340;
        }
      } else if (pr.kind === 'blade') {
        const sp = Math.hypot(pr.vx, pr.vy);
        pr.travel = (pr.travel ?? 0) + sp * dt;
        if (!pr.returning && pr.travel >= (pr.maxTravel ?? 300)) {
          pr.returning = true;
          pr.hit.clear();
        }
        if (pr.returning) {
          const a = Math.atan2(p.y - pr.y, p.x - pr.x);
          pr.vx = Math.cos(a) * 640;
          pr.vy = Math.sin(a) * 640;
          if (dist2(pr.x, pr.y, p.x, p.y) < (p.r + 12) ** 2) pr.dead = true;
        }
      }
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.life -= dt;
      if (pr.life <= 0) {
        if (pr.kind === 'fire') this.explode(pr);
        pr.dead = true;
        continue;
      }
      if (pr.kind !== 'blade' && pr.kind !== 'bug' && (pr.x < ARENA.x || pr.x > ARENA.x + ARENA.w || pr.y < ARENA.y || pr.y > ARENA.y + ARENA.h)) {
        pr.dead = true;
        continue;
      }
      for (const e of this.enemies) {
        if (e.dead || pr.hit.has(e)) continue;
        const rr = pr.r + e.r;
        if (dist2(pr.x, pr.y, e.x, e.y) >= rr * rr) continue;
        if (pr.kind === 'fire') {
          this.explode(pr);
          pr.dead = true;
          break;
        }
        pr.hit.add(e);
        this.damageEnemy(e, pr.dmg, pr.x, pr.y, pr.kind === 'sword' ? 70 : 50);
        pr.pierce--;
        if (pr.pierce < 0) {
          pr.dead = true;
          break;
        }
      }
    }
  }

  private explode(pr: Projectile): void {
    const r = pr.explode ?? 50;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const rr = r + e.r;
      if (dist2(pr.x, pr.y, e.x, e.y) < rr * rr) this.damageEnemy(e, pr.dmg, pr.x, pr.y, 140);
    }
    this.burst(pr.x, pr.y, 14, '#e8582a', 180);
    this.particles.push({ x: pr.x, y: pr.y, vx: 0, vy: 0, life: 0.25, maxLife: 0.25, size: r, color: 'ring:#e8582a' });
    this.audio.play('boom');
  }

  private updateBullets(dt: number): void {
    const p = this.player;
    for (const b of this.bullets) {
      if (b.accel) {
        const sp = Math.hypot(b.vx, b.vy);
        const k = (sp + b.accel * dt) / (sp || 1);
        b.vx *= k;
        b.vy *= k;
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < ARENA.x - 20 || b.x > ARENA.x + ARENA.w + 20 || b.y < ARENA.y - 20 || b.y > ARENA.y + ARENA.h + 20) {
        b.dead = true;
        continue;
      }
      const rr = b.r + p.r - 4; // 判定略小于外观，更易闪避
      if (dist2(b.x, b.y, p.x, p.y) < rr * rr && p.iframes <= 0) {
        b.dead = true;
        this.hurtPlayer(b.dmg);
      }
    }
  }

  private contactDamage(): void {
    const p = this.player;
    if (p.iframes > 0) return;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const rr = e.r + p.r - 2;
      if (dist2(e.x, e.y, p.x, p.y) < rr * rr) {
        this.hurtPlayer(e.dmg);
        return;
      }
    }
  }

  private updatePickups(dt: number): void {
    const p = this.player;
    const range = this.bossDeadT > 0 ? 9999 : this.stats.pickup;
    const kept: Pickup[] = [];
    for (const pk of this.pickups) {
      const d2 = dist2(pk.x, pk.y, p.x, p.y);
      if (!pk.magnet && d2 < range * range) pk.magnet = true;
      if (pk.magnet) {
        const d = Math.sqrt(d2) || 1;
        const sp = 520;
        pk.vx = ((p.x - pk.x) / d) * sp;
        pk.vy = ((p.y - pk.y) / d) * sp;
      } else {
        const f = Math.min(1, dt * 4);
        pk.vx -= pk.vx * f;
        pk.vy -= pk.vy * f;
      }
      pk.x += pk.vx * dt;
      pk.y += pk.vy * dt;
      this.clampToArena(pk, 6);
      if (d2 < (p.r + 8) ** 2) {
        this.collect(pk.value);
        continue;
      }
      kept.push(pk);
    }
    this.pickups = kept;
  }

  burst(x: number, y: number, n: number, color: string, speed: number): void {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const s = rand(speed * 0.3, speed);
      const life = rand(0.3, 0.7);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, maxLife: life, size: rand(2, 5), color });
    }
  }

  private updateFx(dt: number): void {
    for (const pt of this.particles) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 1 - Math.min(1, dt * 3);
      pt.vy *= 1 - Math.min(1, dt * 3);
      pt.life -= dt;
    }
    this.particles = this.particles.filter((pt) => pt.life > 0);
    if (this.particles.length > 600) this.particles.splice(0, this.particles.length - 600);
    for (const t of this.texts) {
      t.y -= 40 * dt;
      t.life -= dt;
    }
    this.texts = this.texts.filter((t) => t.life > 0);
    if (this.texts.length > 120) this.texts.splice(0, this.texts.length - 120);
    for (const b of this.bolts) b.life -= dt;
    this.bolts = this.bolts.filter((b) => b.life > 0);
    for (const t of this.trail) t.life -= dt;
    this.trail = this.trail.filter((t) => t.life > 0);
  }
}
