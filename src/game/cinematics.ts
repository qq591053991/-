import { ARENA } from './constants';
import { easeInOut, type CamPose, type Focus, type Shot } from './camera';

/**
 * 首领演出脚本：开场亮相、半血狂暴、伏诛。
 * 每个镜头描述“看哪里、从什么角度、多远、多长”，Director 负责硬切 / 过渡。
 */

const deg = (d: number): number => (d * Math.PI) / 180;
const L = (a: number, b: number, t: number): number => a + (b - a) * t;

function at(f: Focus, o: Partial<CamPose>): CamPose {
  return { x: f.x, y: f.y, h: f.h, yaw: 0, pitch: deg(20), dist: 300, fov: 40, roll: 0, ...o };
}

/** 回到战斗视角：游戏恢复流速，镜头平滑落回玩家。 */
const backToGame = (dur = 0.8): Shot => ({
  dur,
  blend: dur,
  timeScale: 1,
  letterbox: false,
  pose: (_f, _t, game) => game,
});

const arenaCenter = { x: ARENA.x + ARENA.w / 2, y: ARENA.y + ARENA.h / 2 };

export type BossKey = 'modaifu' | 'wangchan' | 'jiyin';

interface BossLines {
  title: string;
  place: string;
  intro: string;
  rage: string;
  rageSub: string;
  death: string;
}

export const BOSS_LINES: Record<BossKey, BossLines> = {
  modaifu: {
    title: '墨大夫',
    place: '七玄门 · 神手谷',
    intro: '“好徒儿，为师这副残躯，就借你的身子一用。”',
    rage: '夺舍',
    rageSub: '墨大夫神魂离体，欲夺你肉身！',
    death: '墨大夫 · 神魂俱灭',
  },
  wangchan: {
    title: '鬼灵门少主 · 王蝉',
    place: '血色禁地',
    intro: '“区区黄枫谷弟子，也敢坏我好事？”',
    rage: '血灵钻',
    rageSub: '王蝉祭出血灵钻，血光贯日！',
    death: '王蝉 · 伏诛',
  },
  jiyin: {
    title: '极阴老祖',
    place: '乱星海 · 极阴岛',
    intro: '“小辈，老夫的玄阴魔功，正缺一具上好的炉鼎。”',
    rage: '玄阴魔功',
    rageSub: '阴风蔽日，万魂嚎哭！',
    death: '极阴老祖 · 形神俱灭',
  },
};

/** 开场亮相：远景全貌 → 硬切低角度特写推近 → 回到战斗。 */
export function introShots(key: BossKey): Shot[] {
  const lines = BOSS_LINES[key];
  const establish: Shot = {
    dur: 1.3,
    blend: 0,
    timeScale: 0,
    pose: (f, t) => ({
      x: L(arenaCenter.x, f.x, 0.4),
      y: L(arenaCenter.y, f.y, 0.4),
      h: 0,
      // 反打：从竞技场北侧回望，缓慢摇镜
      yaw: Math.PI + L(-0.35, -0.1, easeInOut(t)),
      pitch: deg(L(32, 26, t)),
      dist: L(1150, 1000, t),
      fov: 42,
      roll: 0,
    }),
    subtitle: lines.place,
  };

  const closeUp: Shot = {
    dur: key === 'jiyin' ? 2.4 : 2.0,
    blend: 0,
    timeScale: 0,
    shake: key === 'jiyin' ? 6 : 0,
    title: lines.title,
    subtitle: lines.intro,
    pose: (f, t) => {
      const e = easeInOut(t);
      if (key === 'wangchan') {
        // 侧面低机位横移
        return at(f, { yaw: L(deg(60), deg(25), e), pitch: deg(6), dist: L(340, 270, e), fov: 34, h: f.h * 1.1 });
      }
      if (key === 'jiyin') {
        // 仰拍 + 缓慢环绕，压迫感
        return at(f, { yaw: L(deg(-40), deg(40), e), pitch: deg(L(2, 10, e)), dist: L(330, 260, e), fov: 38, h: f.h * 1.2 });
      }
      // 墨大夫：正面推近
      return at(f, { yaw: 0, pitch: deg(L(8, 14, e)), dist: L(320, 245, e), fov: 35, h: f.h * 1.1 });
    },
  };

  return [establish, closeUp, backToGame(0.9)];
}

/** 半血狂暴：每位首领一套专属运镜。 */
export function enrageShots(key: BossKey): Shot[] {
  const lines = BOSS_LINES[key];
  if (key === 'modaifu') {
    // 夺舍：硬切侧面特写 + 荷兰角倾斜 + 推近
    return [
      {
        dur: 1.6,
        blend: 0,
        timeScale: 0,
        shake: 8,
        flash: 0.6,
        title: lines.rage,
        subtitle: lines.rageSub,
        pose: (f, t) => {
          const e = easeInOut(t);
          return at(f, { yaw: deg(50), pitch: deg(12), dist: L(320, 240, e), fov: 36, roll: L(0, deg(14), e), h: f.h });
        },
      },
      backToGame(0.6),
    ];
  }
  if (key === 'wangchan') {
    // 血灵钻：低机位侧拍 → 甩镜到另一侧 → 回到战斗
    return [
      {
        dur: 0.9,
        blend: 0,
        timeScale: 0,
        flash: 0.5,
        title: lines.rage,
        subtitle: lines.rageSub,
        pose: (f, t) => at(f, { yaw: deg(90), pitch: deg(5), dist: L(360, 300, t), fov: 34, h: f.h }),
      },
      {
        dur: 0.9,
        blend: 0.25,
        timeScale: 0,
        shake: 10,
        title: lines.rage,
        subtitle: lines.rageSub,
        pose: (f, t) => at(f, { yaw: deg(-80), pitch: deg(10), dist: L(300, 250, t), fov: 36, roll: deg(-8), h: f.h }),
      },
      backToGame(0.6),
    ];
  }
  // 极阴老祖：从近处升至正上方并旋转 180°，俯瞰整片弹幕战场
  return [
    {
      dur: 2.2,
      blend: 0,
      timeScale: 0,
      shake: 6,
      flash: 0.4,
      title: lines.rage,
      subtitle: lines.rageSub,
      pose: (f, t) => {
        const e = easeInOut(t);
        return at(f, { yaw: L(0, Math.PI, e), pitch: deg(L(12, 88, e)), dist: L(300, 640, e), fov: 42, h: f.h * (1 - e) });
      },
    },
    backToGame(0.8),
  ];
}

/** 伏诛：慢动作环绕首领，随后回到战斗。 */
export function deathShots(key: BossKey): Shot[] {
  const lines = BOSS_LINES[key];
  return [
    {
      dur: 2.4,
      blend: 0.3,
      timeScale: 0.2,
      flash: 0.8,
      shake: 12,
      title: lines.death,
      pose: (f, t) => at(f, { yaw: L(deg(-30), deg(200), t), pitch: deg(L(18, 30, t)), dist: L(260, 340, t), fov: 40, h: f.h * 0.6 }),
    },
    backToGame(0.9),
  ];
}
