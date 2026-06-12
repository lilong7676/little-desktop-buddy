export interface SpriteDef {
  src: string
  natW: number
  natH: number
}

/** AI 生成的一次性小动画（伸懒腰、打哈欠等），闲置时随机播放 */
export interface AnimDef extends SpriteDef {
  key: string
  durMs: number
  /** 两次播放之间的随机间隔（秒） */
  delaySec: [number, number]
  /** 动画画布的显示高度（让动画里的猫和静态姿势等大），缺省用宠物 dispH */
  dispH?: number
}

export interface Personality {
  /** 闲置多久进入睡觉（秒） */
  sleepAfterSec: number
  /** 两次散步之间的随机间隔（秒） */
  walkDelaySec: [number, number]
}

export interface PetDef {
  id: string
  name: string
  sprites: { idle: SpriteDef; sleep?: SpriteDef }
  animations?: AnimDef[]
  quotes: PetQuotes
  dispH: number
  defaultAnchor: string
  personality: Personality
}

export interface PetQuotes {
  idle: string[]
  pet: string[]
}

// 窗口比 sprite 大一圈：左右给倾斜动画留溢出，顶部给说话气泡留位置
export const PAD_X = 24
export const PAD_TOP = 44

export const PETS: PetDef[] = [
  {
    id: 'tabby',
    name: '淘淘',
    sprites: {
      // AI 重打光的明亮坐姿（取自歪头动画序列第 1 帧，与动画完美衔接）
      idle: { src: '/sprites/tabby_sit.png', natW: 279, natH: 512 },
      sleep: { src: '/sprites/tabby_sprawl.png', natW: 1548, natH: 2600 },
    },
    quotes: {
      idle: ['喵！', '陪我玩嘛~', '看我看我！', '有小鱼干吗？', '无聊喵……'],
      pet: ['咕噜咕噜~', '好舒服喵~', '再摸摸！', '蹭蹭你'],
    },
    dispH: 240,
    defaultAnchor: 'br',
    // 淘气粘人款：睡得晚、散步勤
    personality: { sleepAfterSec: 300, walkDelaySec: [25, 75] },
    animations: [
      {
        key: 'stretch',
        src: '/sprites/taotao_stretch_anim.webp',
        natW: 442,
        natH: 490,
        // 动画首帧坐姿猫高 450/490，放大画布使猫与 idle 的 240px 等大
        dispH: 261,
        durMs: 1750,
        delaySec: [45, 110],
      },
      {
        key: 'tilt',
        src: '/sprites/taotao_tilt_anim.webp',
        natW: 342,
        natH: 512,
        dispH: 243,
        durMs: 1850,
        delaySec: [60, 150],
      },
    ],
  },
  {
    id: 'siamese',
    name: '墨墨',
    sprites: {
      // AI 基于合照生成的单独坐姿肖像（cats/generated/momo_sit_portrait.png）
      idle: { src: '/sprites/siamese_sit.png', natW: 673, natH: 1476 },
    },
    quotes: {
      idle: ['喵。', '本喵在思考', '晒太阳真好', '……'],
      pet: ['咕噜……', '勉强让你摸', '哼，还行', '别停。'],
    },
    dispH: 235,
    defaultAnchor: 'bl',
    // 文静款：睡得早、散步少
    personality: { sleepAfterSec: 150, walkDelaySec: [70, 180] },
    animations: [
      {
        key: 'groom',
        src: '/sprites/momo_groom_anim.webp',
        natW: 309,
        natH: 491,
        dispH: 248,
        durMs: 1750,
        delaySec: [50, 130],
      },
      {
        key: 'yawn',
        src: '/sprites/momo_yawn_anim.webp',
        natW: 251,
        natH: 493,
        dispH: 244,
        durMs: 2000,
        delaySec: [90, 200],
      },
    ],
  },
]

// 合体彩蛋：两只拖到一起时显示，闲置后切换成抱睡照片
export const DUO: PetDef = {
  id: 'duo',
  name: '淘淘 & 墨墨',
  sprites: {
    idle: { src: '/sprites/duo_sit.png', natW: 2238, natH: 3792 },
    sleep: { src: '/sprites/duo_sleep.png', natW: 2887, natH: 3092 },
  },
  quotes: {
    idle: ['我们是最好的朋友！', '贴贴~', '一起晒太阳', '双倍可爱'],
    pet: ['一起摸！', '咕噜咕噜 ×2', '都要摸到哦'],
  },
  dispH: 300,
  defaultAnchor: 'br',
  personality: { sleepAfterSec: 180, walkDelaySec: [0, 0] },
}

export const ALL_PETS: PetDef[] = [...PETS, DUO]

export function windowSizeFor(p: PetDef, scale = 1): { width: number; height: number } {
  const entries: { s: SpriteDef; h: number }[] = [
    { s: p.sprites.idle, h: p.dispH },
    ...(p.sprites.sleep ? [{ s: p.sprites.sleep, h: p.dispH }] : []),
    ...(p.animations ?? []).map((a) => ({ s: a as SpriteDef, h: a.dispH ?? p.dispH })),
  ]
  const width = Math.max(...entries.map((e) => Math.round((e.s.natW / e.s.natH) * e.h * scale)))
  const height = Math.max(...entries.map((e) => Math.round(e.h * scale)))
  return { width: width + PAD_X * 2, height: height + PAD_TOP }
}
