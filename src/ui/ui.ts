import { ITEM_BY_ID } from '../data/items';
import { RARITY_COLORS, RARITY_NAMES, TIER_NAMES } from '../data/rarity';
import { realmName } from '../data/realms';
import { TOTAL_WAVES } from '../data/waves';
import { MAX_WEAPONS, WEAPONS, weaponSummary, type WeaponId } from '../data/weapons';
import type { Game } from '../game/game';
import type { Rarity } from '../game/types';

const START_WEAPONS: WeaponId[] = ['jinfu', 'huodan', 'fengren'];

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

function rarityStyle(r: Rarity): string {
  return `style="--rc:${RARITY_COLORS[r]}"`;
}

function statRows(g: Game): string {
  const s = g.stats;
  const rows: [string, string][] = [
    ['境界', g.realm()],
    ['气血上限', String(s.maxHp)],
    ['生命回复', `${s.regen.toFixed(2)}/秒`],
    ['护甲', `${s.armor}（减伤 ${Math.round((1 - g.armorFactor()) * 100)}%）`],
    ['伤害', `${s.damage >= 0 ? '+' : ''}${s.damage}%`],
    ['攻速', `${s.attackSpeed >= 0 ? '+' : ''}${s.attackSpeed}%`],
    ['暴击率', `${Math.round(s.crit * 100)}%`],
    ['暴击伤害', `×${(1 + s.critDmg).toFixed(2)}`],
    ['移速', `${s.speed >= 0 ? '+' : ''}${s.speed}%`],
    ['神识（拾取）', String(s.pickup)],
    ['吸血', `${Math.round(s.lifesteal * 100)}%`],
    ['机缘', String(s.luck)],
    ['修为获取', `+${s.expGain}%`],
    ['灵石获取', `+${s.goldGain}%`],
    ['罗烟步冷却', `${g.dashCooldown().toFixed(2)}s`],
    ['青元剑芒', `伤害 ${g.main.damage} · ${g.main.projectiles} 道 · 穿透 ${g.main.pierce}`],
  ];
  return `<table class="stats">${rows.map(([k, v]) => `<tr><td>${k}</td><td>${esc(v)}</td></tr>`).join('')}</table>`;
}

function itemChips(g: Game): string {
  const ids = Object.keys(g.items);
  if (!ids.length) return '<div class="muted">尚无丹药宝物</div>';
  return `<div class="chips">${ids
    .map((id) => {
      const it = ITEM_BY_ID[id];
      return `<span class="chip" ${rarityStyle(it.rarity)} title="${esc(it.name)}：${esc(it.desc)}"><b>${it.glyph}</b>${esc(it.name)}${g.items[id] > 1 ? ` ×${g.items[id]}` : ''}</span>`;
    })
    .join('')}</div>`;
}

export class UI {
  constructor(private readonly root: HTMLElement, private readonly g: Game) {
    root.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!btn || btn.hasAttribute('disabled')) return;
      this.act(btn.dataset.act as string, Number(btn.dataset.i ?? -1), btn.dataset.id);
    });
  }

  private act(act: string, i: number, id?: string): void {
    const g = this.g;
    switch (act) {
      case 'start': g.goSelect(); break;
      case 'pick-start': g.newRun(id as WeaponId); break;
      case 'level': g.chooseLevel(i); break;
      case 'level-reroll': g.rerollLevel(); break;
      case 'buy': g.buy(i); break;
      case 'reroll': g.reroll(); break;
      case 'sell': g.sellWeapon(i); break;
      case 'lingye-up': g.upgradeWithLingye(i); break;
      case 'lingye-sell': g.sellLingye(); break;
      case 'next': g.nextWave(); break;
      case 'resume': g.togglePause(); break;
      case 'title': g.toTitle(); break;
    }
  }

  render(): void {
    const g = this.g;
    let html = '';
    switch (g.state) {
      case 'title': html = this.title(); break;
      case 'select': html = this.select(); break;
      case 'levelup': html = this.levelup(); break;
      case 'shop': html = this.shop(); break;
      case 'paused': html = this.paused(); break;
      case 'gameover':
      case 'victory': html = this.end(g.state === 'victory'); break;
      case 'playing': html = ''; break;
    }
    this.root.innerHTML = html;
    this.root.classList.toggle('show', html !== '');
  }

  private title(): string {
    const best = this.g.bestWave;
    return `<div class="panel title-panel">
      <h1>凡人修仙传</h1>
      <h2>斗法录 · Roguelike</h2>
      <p class="intro">你本是山村少年韩立，误入七玄门，得一神秘小瓶。<br/>资质平平，唯有步步谨慎、积攒资源，方能在这弱肉强食的修仙界活下去。</p>
      <button class="primary big" data-act="start">踏入仙途</button>
      <div class="controls">
        <div><kbd>WASD</kbd> 移动</div>
        <div><kbd>鼠标</kbd> 瞄准 · <kbd>左键</kbd> 青元剑芒</div>
        <div><kbd>空格</kbd>/<kbd>右键</kbd> 罗烟步（闪避无敌）</div>
        <div><kbd>F</kbd> 自动施法 · <kbd>Esc</kbd> 暂停 · <kbd>M</kbd> 静音</div>
      </div>
      <p class="muted">${TOTAL_WAVES} 波 · 三大地图 · 三位首领${best ? ` · 最佳记录：第 ${best} 波` : ''}</p>
      <p class="fine">同人作品，仅供学习交流，非商业用途。原著版权归作者忘语及相关权利方所有。</p>
    </div>`;
  }

  private select(): string {
    const cards = START_WEAPONS.map((id) => {
      const w = WEAPONS[id];
      return `<button class="card" data-act="pick-start" data-id="${id}" ${rarityStyle(0)}>
        <div class="glyph" style="color:${w.color}">${w.glyph}</div>
        <div class="name">${esc(w.name)}</div>
        <div class="desc">${esc(w.desc)}</div>
        <div class="sub">${weaponSummary(id, 0)}</div>
      </button>`;
    }).join('');
    return `<div class="panel">
      <h2>择一件起始法宝</h2>
      <p class="muted">法宝会自动攻击附近敌人；青元剑芒需你亲手瞄准释放。</p>
      <div class="cards">${cards}</div>
      <button data-act="title">返回</button>
    </div>`;
  }

  private levelup(): string {
    const g = this.g;
    const cost = g.levelRerollCost();
    const cards = g.levelChoices.map((c, i) => `<button class="card" data-act="level" data-i="${i}" ${rarityStyle(c.rarity)}>
        <div class="rarity">${RARITY_NAMES[c.rarity]}</div>
        <div class="name">${esc(c.name)}</div>
        <div class="desc">${esc(c.desc)}</div>
      </button>`).join('');
    return `<div class="panel">
      <h2>修为精进 · ${esc(realmName(g.level))}</h2>
      <p class="muted">参悟功法，择一而修（剩余 ${g.pendingLevels} 次）</p>
      <div class="cards four">${cards}</div>
      <button data-act="level-reroll" ${g.gold < cost ? 'disabled' : ''}>重新参悟（${cost} 灵石）</button>
      <span class="gold">◆ ${Math.floor(g.gold)}</span>
    </div>`;
  }

  private shop(): string {
    const g = this.g;
    const offers = g.offers.map((o, i) => {
      let glyph: string, name: string, desc: string, sub: string, color: string;
      if (o.kind === 'weapon') {
        const w = WEAPONS[o.id as WeaponId];
        const owned = g.weapons.find((x) => x.id === o.id);
        glyph = w.glyph;
        color = w.color;
        name = `${w.name} · ${TIER_NAMES[o.tier]}`;
        desc = w.desc;
        sub = owned
          ? `已持有（${TIER_NAMES[owned.tier]}）→ 购买后升至 ${TIER_NAMES[Math.min(3, Math.max(o.tier, owned.tier + 1))]}`
          : weaponSummary(o.id as WeaponId, o.tier);
      } else {
        const it = ITEM_BY_ID[o.id];
        glyph = it.glyph;
        color = '#d9cfa8';
        name = it.name;
        desc = it.desc;
        sub = `丹药宝物 · 已有 ${g.items[o.id] ?? 0}`;
      }
      const label = o.sold ? '已售' : `${o.price} 灵石`;
      return `<div class="card offer ${o.sold ? 'sold' : ''}" ${rarityStyle(o.tier)}>
        <div class="rarity">${o.kind === 'weapon' ? '法宝' : '宝物'} · ${RARITY_NAMES[o.tier]}</div>
        <div class="glyph" style="color:${color}">${glyph}</div>
        <div class="name">${esc(name)}</div>
        <div class="desc">${esc(desc)}</div>
        <div class="sub">${esc(sub)}</div>
        <button class="primary" data-act="buy" data-i="${i}" ${g.canBuy(o) ? '' : 'disabled'}>${label}</button>
      </div>`;
    }).join('');

    const weapons = g.weapons.map((w, i) => {
      const def = WEAPONS[w.id];
      const cost = g.lingyeCost(w);
      return `<div class="wrow" ${rarityStyle(w.tier)}>
        <span class="wg" style="color:${def.color}">${def.glyph}</span>
        <span class="wn">${esc(def.name)}<small>${TIER_NAMES[w.tier]} · ${weaponSummary(w.id, w.tier)}</small></span>
        <button data-act="lingye-up" data-i="${i}" ${w.tier >= 3 || g.lingye < cost ? 'disabled' : ''} title="以掌天瓶灵液催熟，提升一阶">${w.tier >= 3 ? '已极品' : `催熟 ♦${cost}`}</button>
        <button data-act="sell" data-i="${i}" ${g.weapons.length <= 1 ? 'disabled' : ''}>售 ${g.weaponSellValue(w)}</button>
      </div>`;
    }).join('');

    const rc = g.rerollCost();
    return `<div class="panel shop">
      <div class="shop-head">
        <h2>坊市 · 第 ${g.wave} 波已过</h2>
        <span class="gold">◆ 灵石 ${Math.floor(g.gold)}</span>
        <span class="lingye">♦ 灵液 ${g.lingye}</span>
      </div>
      <div class="shop-body">
        <div class="shop-left">
          <div class="cards four">${offers}</div>
          <div class="row">
            <button data-act="reroll" ${g.gold < rc ? 'disabled' : ''}>刷新货架（${rc} 灵石）</button>
            <button class="primary big" data-act="next">出发 · 第 ${g.wave + 1} 波 ›</button>
          </div>
          <h3>掌天瓶</h3>
          <p class="muted">每过一波，小瓶凝出一滴灵液。可催熟法宝提升品阶，或催熟灵药换取灵石。</p>
          <div class="row">
            <button data-act="lingye-sell" ${g.lingye < 1 ? 'disabled' : ''}>催熟灵药出售：♦1 → ◆${g.lingyeValue()}</button>
          </div>
        </div>
        <div class="shop-right">
          <h3>法宝（${g.weapons.length}/${MAX_WEAPONS}）</h3>
          ${weapons}
          <h3>丹药宝物</h3>
          ${itemChips(g)}
          <h3>属性</h3>
          ${statRows(g)}
        </div>
      </div>
    </div>`;
  }

  private paused(): string {
    const g = this.g;
    return `<div class="panel narrow">
      <h2>闭关调息</h2>
      ${statRows(g)}
      ${itemChips(g)}
      <div class="row">
        <button class="primary" data-act="resume">继续斗法</button>
        <button data-act="title">放弃本局</button>
      </div>
    </div>`;
  }

  private end(win: boolean): string {
    const g = this.g;
    const m = Math.floor(g.elapsed / 60);
    const s = Math.floor(g.elapsed % 60);
    return `<div class="panel narrow">
      <h1>${win ? '飞升有望' : '身死道消'}</h1>
      <p class="intro">${win ? '极阴老祖伏诛，乱星海一役名动天下。' : `止步于第 ${g.wave} 波。修仙之路，本就九死一生。`}</p>
      <table class="stats">
        <tr><td>最终境界</td><td>${esc(g.realm())}</td></tr>
        <tr><td>到达波次</td><td>${g.wave} / ${TOTAL_WAVES}</td></tr>
        <tr><td>斩敌</td><td>${g.kills}</td></tr>
        <tr><td>斗法时长</td><td>${m}分${s}秒</td></tr>
        <tr><td>法宝</td><td>${g.weapons.map((w) => `${WEAPONS[w.id].name}(${TIER_NAMES[w.tier]})`).join('、')}</td></tr>
      </table>
      <div class="row">
        <button class="primary big" data-act="start">再入仙途</button>
        <button data-act="title">回到标题</button>
      </div>
    </div>`;
  }
}
