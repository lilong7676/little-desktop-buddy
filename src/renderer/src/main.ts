import type { AnimDef, BuddyApi, PetInfo } from '../../preload/index'

declare global {
  interface Window {
    buddy: BuddyApi
  }
}

const api = window.buddy
const img = document.getElementById('pet') as HTMLImageElement
const stage = document.getElementById('stage') as HTMLDivElement
const bubble = document.getElementById('bubble') as HTMLDivElement

let info: PetInfo
let state: 'idle' | 'sleep' = 'idle'
let ignoring = true
let dragging = false
let walking = false
let flourishing = false
let scale = 1
let currentAnim: AnimDef | null = null
let sleepTimer: ReturnType<typeof setTimeout> | null = null
let flourishEnd: ReturnType<typeof setTimeout> | null = null
let pressAt = { x: 0, y: 0, t: 0 }

function applyHeight(): void {
  const h = currentAnim?.dispH ?? info.dispH
  img.style.height = `${Math.round(h * scale)}px`
}

function rand(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo)
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

// ---------- 像素级命中：只有猫身上的不透明像素才接管鼠标 ----------

const hitCanvas = document.createElement('canvas')
let hitCtx: CanvasRenderingContext2D | null = null

img.addEventListener('load', () => {
  if (!img.naturalWidth) return
  hitCanvas.width = img.naturalWidth
  hitCanvas.height = img.naturalHeight
  hitCtx = hitCanvas.getContext('2d', { willReadFrequently: true })
  if (!hitCtx) return
  hitCtx.clearRect(0, 0, hitCanvas.width, hitCanvas.height)
  try {
    hitCtx.drawImage(img, 0, 0)
  } catch {
    hitCtx = null
  }
})

function opaqueAt(e: MouseEvent): boolean {
  if (!hitCtx) return true
  const r = img.getBoundingClientRect()
  if (!r.width || !r.height) return false
  const x = Math.floor(((e.clientX - r.left) / r.width) * hitCanvas.width)
  const y = Math.floor(((e.clientY - r.top) / r.height) * hitCanvas.height)
  if (x < 0 || y < 0 || x >= hitCanvas.width || y >= hitCanvas.height) return false
  try {
    return hitCtx.getImageData(x, y, 1, 1).data[3] > 16
  } catch {
    return true
  }
}

// ---------- 说话气泡 ----------

let bubbleTimer: ReturnType<typeof setTimeout> | null = null

function speak(text: string): void {
  bubble.textContent = text
  bubble.classList.remove('show')
  void bubble.offsetWidth
  bubble.classList.add('show')
  if (bubbleTimer) clearTimeout(bubbleTimer)
  bubbleTimer = setTimeout(() => bubble.classList.remove('show'), 2400)
}

function scheduleIdleSpeech(): void {
  setTimeout(
    () => {
      if (state === 'idle' && !dragging && !walking && !flourishing && info.quotes.idle.length) {
        speak(pick(info.quotes.idle))
      }
      scheduleIdleSpeech()
    },
    rand(60, 200) * 1000
  )
}

function setIgnore(v: boolean): void {
  if (ignoring === v) return
  ignoring = v
  api.setIgnore(v)
}

// ---------- 睡觉 ----------

function resetSleepTimer(): void {
  if (sleepTimer) clearTimeout(sleepTimer)
  sleepTimer = setTimeout(enterSleep, info.sleepAfterSec * 1000)
}

function enterSleep(): void {
  if (state === 'sleep' || dragging) return
  cancelFlourish()
  state = 'sleep'
  if (info.sprites.sleep) img.src = info.sprites.sleep.src
  document.body.classList.add('sleep')
  api.stateChanged('sleep')
}

function wake(): void {
  if (state === 'sleep') {
    state = 'idle'
    img.src = info.sprites.idle.src
    document.body.classList.remove('sleep')
    api.stateChanged('idle')
  }
  resetSleepTimer()
}

// ---------- 闲置小动画（AI 生成的伸懒腰等，播放一次后回到 idle） ----------

function restoreIdleSprite(): void {
  document.body.classList.remove('flourish')
  currentAnim = null
  img.src = info.sprites.idle.src
  applyHeight()
}

function cancelFlourish(): void {
  if (!flourishing) return
  flourishing = false
  if (flourishEnd) clearTimeout(flourishEnd)
  restoreIdleSprite()
}

function playFlourish(anim: AnimDef): void {
  if (flourishing || dragging || walking || state === 'sleep') return
  flourishing = true
  document.body.classList.add('flourish')
  currentAnim = anim
  // 加时间戳避免缓存命中导致 loop=1 的动图不重播
  img.src = `${anim.src}?t=${Date.now()}`
  applyHeight()
  resetSleepTimer()
  flourishEnd = setTimeout(() => {
    flourishing = false
    restoreIdleSprite()
  }, anim.durMs)
}

function scheduleFlourish(anim: AnimDef): void {
  const [lo, hi] = anim.delaySec
  setTimeout(
    () => {
      playFlourish(anim)
      scheduleFlourish(anim)
    },
    (lo + Math.random() * (hi - lo)) * 1000
  )
}

// ---------- 点击反应 ----------

function spawnEmojis(emoji: string, count: number): void {
  for (let i = 0; i < count; i++) {
    const h = document.createElement('span')
    h.className = 'heart'
    h.textContent = emoji
    h.style.left = `${42 + Math.random() * 16}%`
    h.style.animationDelay = `${i * 120}ms`
    stage.appendChild(h)
    h.addEventListener('animationend', () => h.remove())
  }
}

function react(): void {
  cancelFlourish()
  wake()
  spawnEmojis('❤️', 3)
  if (Math.random() < 0.6 && info.quotes.pet.length) speak(pick(info.quotes.pet))
  document.body.classList.add('react')
  setTimeout(() => document.body.classList.remove('react'), 350)
}

// ---------- 输入 ----------

img.addEventListener('mousemove', (e) => {
  if (!dragging) setIgnore(!opaqueAt(e))
})

img.addEventListener('mouseenter', () => {
  if (!dragging) wake()
})

img.addEventListener('mouseleave', () => {
  if (!dragging) setIgnore(true)
})

window.addEventListener('mouseout', (e) => {
  if (!dragging && !e.relatedTarget) setIgnore(true)
})

img.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return
  e.preventDefault()
  cancelFlourish()
  dragging = true
  pressAt = { x: e.screenX, y: e.screenY, t: Date.now() }
  img.setPointerCapture(e.pointerId)
  document.body.classList.add('dragging')
  api.dragStart({ ox: e.clientX, oy: e.clientY })
})

img.addEventListener('pointerup', (e) => {
  if (!dragging) return
  dragging = false
  img.releasePointerCapture(e.pointerId)
  document.body.classList.remove('dragging')
  api.dragEnd()
  const moved = Math.hypot(e.screenX - pressAt.x, e.screenY - pressAt.y)
  if (moved < 4 && Date.now() - pressAt.t < 350) react()
  else wake()
})

img.addEventListener('dblclick', () => {
  if (info?.isDuo) {
    api.split()
    return
  }
  // 双击点播：立刻表演一个随机小动画
  if (info.animations.length) {
    cancelFlourish()
    wake()
    playFlourish(pick(info.animations))
  }
})

api.onThrown((thrown) => {
  document.body.classList.toggle('thrown', thrown)
  if (thrown) {
    cancelFlourish()
    resetSleepTimer()
  } else {
    spawnEmojis('💫', 2)
  }
})

// ---------- 散步动画 ----------

api.onWalking((w) => {
  walking = w
  document.body.classList.toggle('walking', w)
  if (w) {
    cancelFlourish()
    resetSleepTimer()
  }
})

// ---------- 初始化 ----------

async function init(): Promise<void> {
  const petId = new URLSearchParams(location.search).get('pet') ?? 'tabby'
  info = await api.getInfo(petId)
  // 打包后页面经 file:// 加载，绝对路径 /sprites/... 会解析到文件系统根，统一改为相对路径
  info.sprites.idle.src = info.sprites.idle.src.replace(/^\//, '')
  if (info.sprites.sleep) info.sprites.sleep.src = info.sprites.sleep.src.replace(/^\//, '')
  for (const a of info.animations) a.src = a.src.replace(/^\//, '')
  scale = info.scale
  img.src = info.sprites.idle.src
  applyHeight()
  document.title = info.name
  resetSleepTimer()
  for (const anim of info.animations) scheduleFlourish(anim)
  scheduleIdleSpeech()
  api.onScale((s) => {
    scale = s
    applyHeight()
  })
}

init()
