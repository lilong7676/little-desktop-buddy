import { BrowserWindow, app, ipcMain, screen } from 'electron'
import { join } from 'path'
import { ALL_PETS, DUO, PETS, PetDef, windowSizeFor } from './pets'
import { SNAP_THRESHOLD, anchorById, anchorsFor, animateTo, cancelAnim, nearestAnchor } from './snap'
import { Mode, flush, loadSettings, saveSettings } from './store'
import { createTray, rebuildMenu } from './tray'

type PetState = 'idle' | 'sleep'

const wins = new Map<string, BrowserWindow>()
const petStates = new Map<string, PetState>()
const dragTimers = new Map<number, NodeJS.Timeout>()
const walkAnims = new Map<number, NodeJS.Timeout>()
const walkSchedules = new Map<string, NodeJS.Timeout>()
const physTimers = new Map<number, NodeJS.Timeout>()
const dragHist = new Map<number, { x: number; y: number; t: number }[]>()

const WALK_SPEED = 45 // px/s
const GROUND_EPS = 8
// 扔猫物理参数
const GRAVITY = 3500 // px/s²
const THROW_MIN_SPEED = 500 // px/s，低于此速度松手不算“扔”
const BOUNCE = 0.45
const WALL_BOUNCE = 0.6

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function petIdOf(win: BrowserWindow): string | undefined {
  for (const [id, w] of wins) if (w === win) return id
  return undefined
}

function winOf(e: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(e.sender)
}

function rectsIntersect(a: Electron.Rectangle, b: Electron.Rectangle): boolean {
  return (
    a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
  )
}

function savePosition(win: BrowserWindow): void {
  const id = petIdOf(win)
  if (!id || win.isDestroyed()) return
  const [x, y] = win.getPosition()
  const display = screen.getDisplayMatching(win.getBounds())
  saveSettings({ pets: { [id]: { x, y, displayId: display.id, visible: win.isVisible() } } })
}

function clampToWorkArea(x: number, y: number, w: number, h: number, wa: Electron.Rectangle) {
  return {
    x: Math.min(Math.max(x, wa.x), wa.x + wa.width - w),
    y: Math.min(Math.max(y, wa.y), wa.y + wa.height - h),
  }
}

function initialPosition(def: PetDef, width: number, height: number): { x: number; y: number } {
  const saved = loadSettings().pets[def.id]
  if (saved) {
    const rect = { x: saved.x, y: saved.y, width, height }
    const display = screen.getDisplayMatching(rect)
    if (rectsIntersect(rect, display.workArea)) return { x: saved.x, y: saved.y }
  }
  const a = anchorById(width, height, screen.getPrimaryDisplay(), def.defaultAnchor)
  return { x: a.x, y: a.y }
}

function createPet(def: PetDef, visible: boolean): void {
  const { width, height } = windowSizeFor(def, loadSettings().scale)
  const { x, y } = initialPosition(def, width, height)
  const win = new BrowserWindow({
    x,
    y,
    width,
    height,
    transparent: true,
    frame: false,
    resizable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: process.platform !== 'darwin',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
    },
  })
  win.setAlwaysOnTop(true, 'floating')
  if (process.platform === 'darwin') {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  }
  win.setIgnoreMouseEvents(true, { forward: true })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/?pet=${def.id}`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { query: { pet: def.id } })
  }

  win.once('ready-to-show', () => {
    if (visible) win.showInactive()
  })
  wins.set(def.id, win)
  petStates.set(def.id, 'idle')
}

function snapWindow(win: BrowserWindow, force: boolean): void {
  const a = nearestAnchor(win)
  if (!a) return
  if (!force && a.dist > SNAP_THRESHOLD) {
    savePosition(win)
    return
  }
  animateTo(win, a.x, a.y, 180, () => savePosition(win))
}

// ---------- 贴边散步 ----------

function isOnGround(win: BrowserWindow): boolean {
  const [, y] = win.getPosition()
  const [, h] = win.getSize()
  const wa = screen.getDisplayMatching(win.getBounds()).workArea
  return Math.abs(y + h - (wa.y + wa.height)) <= GROUND_EPS
}

function cancelWalk(win: BrowserWindow): void {
  const t = walkAnims.get(win.id)
  if (t) {
    clearInterval(t)
    walkAnims.delete(win.id)
    win.webContents.send('pet:walking', false)
  }
}

function cancelPhysics(win: BrowserWindow): void {
  const t = physTimers.get(win.id)
  if (t) {
    clearInterval(t)
    physTimers.delete(win.id)
    if (!win.isDestroyed()) win.webContents.send('pet:thrown', false)
  }
}

// ---------- 扔猫物理：惯性抛出 + 重力 + 落地弹跳 ----------

function physicsThrow(win: BrowserWindow, vx0: number, vy0: number): void {
  cancelPhysics(win)
  let [x, y] = win.getPosition().map(Number) as [number, number]
  let vx = vx0
  let vy = vy0
  const dt = 0.016
  win.webContents.send('pet:thrown', true)
  const timer = setInterval(() => {
    if (win.isDestroyed() || dragTimers.has(win.id)) {
      clearInterval(timer)
      physTimers.delete(win.id)
      return
    }
    const [w, h] = win.getSize()
    const wa = screen.getDisplayMatching(win.getBounds()).workArea
    const floor = wa.y + wa.height - h
    vy += GRAVITY * dt
    x += vx * dt
    y += vy * dt
    if (y >= floor) {
      y = floor
      vy = -vy * BOUNCE
      vx *= 0.85
      if (Math.abs(vy) < 140) vy = 0
    }
    if (y < wa.y) {
      y = wa.y
      vy = -vy * BOUNCE
    }
    if (x < wa.x) {
      x = wa.x
      vx = -vx * WALL_BOUNCE
    }
    if (x > wa.x + wa.width - w) {
      x = wa.x + wa.width - w
      vx = -vx * WALL_BOUNCE
    }
    win.setPosition(Math.round(x), Math.round(y), false)
    const settled = y >= floor - 0.5 && vy === 0 && Math.abs(vx) < 40
    if (settled) {
      clearInterval(timer)
      physTimers.delete(win.id)
      win.webContents.send('pet:thrown', false)
      if (loadSettings().mode === 'snap') snapWindow(win, false)
      else savePosition(win)
    }
  }, 16)
  physTimers.set(win.id, timer)
}

function releaseVelocity(winId: number): { vx: number; vy: number; speed: number } {
  const hist = dragHist.get(winId) ?? []
  const now = Date.now()
  const recent = hist.filter((p) => now - p.t <= 120)
  if (recent.length < 2) return { vx: 0, vy: 0, speed: 0 }
  const a = recent[0]
  const b = recent[recent.length - 1]
  const dt = (b.t - a.t) / 1000
  if (dt <= 0) return { vx: 0, vy: 0, speed: 0 }
  const vx = (b.x - a.x) / dt
  const vy = (b.y - a.y) / dt
  return { vx, vy, speed: Math.hypot(vx, vy) }
}

function tryWalk(id: string): void {
  const win = wins.get(id)
  if (!win || win.isDestroyed() || !win.isVisible()) return
  if (loadSettings().merged) return
  if (dragTimers.has(win.id) || walkAnims.has(win.id)) return
  if (petStates.get(id) === 'sleep') return
  if (!isOnGround(win)) return

  const [sx, sy] = win.getPosition()
  const [w] = win.getSize()
  const wa = screen.getDisplayMatching(win.getBounds()).workArea
  const dx = rand(60, 200) * (Math.random() < 0.5 ? -1 : 1)
  const tx = Math.min(Math.max(sx + dx, wa.x), wa.x + wa.width - w)
  if (Math.abs(tx - sx) < 30) return

  const ms = (Math.abs(tx - sx) / WALK_SPEED) * 1000
  const t0 = Date.now()
  win.webContents.send('pet:walking', true)
  const timer = setInterval(() => {
    if (win.isDestroyed() || dragTimers.has(win.id)) {
      clearInterval(timer)
      walkAnims.delete(win.id)
      return
    }
    const t = Math.min(1, (Date.now() - t0) / ms)
    win.setPosition(Math.round(sx + (tx - sx) * t), sy, false)
    if (t >= 1) {
      clearInterval(timer)
      walkAnims.delete(win.id)
      win.webContents.send('pet:walking', false)
      savePosition(win)
    }
  }, 16)
  walkAnims.set(win.id, timer)
}

function scheduleWalk(def: PetDef): void {
  const [lo, hi] = def.personality.walkDelaySec
  if (hi <= 0) return
  const prev = walkSchedules.get(def.id)
  if (prev) clearTimeout(prev)
  const timer = setTimeout(() => {
    tryWalk(def.id)
    scheduleWalk(def)
  }, rand(lo, hi) * 1000)
  walkSchedules.set(def.id, timer)
}

// ---------- 合体彩蛋 ----------

function overlapEnough(a: Electron.Rectangle, b: Electron.Rectangle): boolean {
  const ow = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const oh = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  if (ow <= 0 || oh <= 0) return false
  return ow > Math.min(a.width, b.width) * 0.45 && oh > Math.min(a.height, b.height) * 0.5
}

function mergePets(draggedWin: BrowserWindow): void {
  const duo = wins.get(DUO.id)
  if (!duo) return
  for (const w of wins.values()) {
    cancelWalk(w)
    cancelAnim(w)
    cancelPhysics(w)
  }
  const bounds = draggedWin.getBounds()
  const { width, height } = windowSizeFor(DUO, loadSettings().scale)
  const wa = screen.getDisplayMatching(bounds).workArea
  const { x, y } = clampToWorkArea(
    Math.round(bounds.x + bounds.width / 2 - width / 2),
    bounds.y + bounds.height - height,
    width,
    height,
    wa
  )
  for (const p of PETS) wins.get(p.id)?.hide()
  duo.setPosition(x, y, false)
  duo.showInactive()
  saveSettings({ merged: true })
  savePosition(duo)
  rebuildMenu(trayDeps)
}

function splitDuo(): void {
  const duo = wins.get(DUO.id)
  if (!duo || !loadSettings().merged) return
  cancelWalk(duo)
  cancelAnim(duo)
  cancelPhysics(duo)
  const b = duo.getBounds()
  const wa = screen.getDisplayMatching(b).workArea
  duo.hide()
  const centerX = b.x + b.width / 2
  const bottom = b.y + b.height
  const offsets: Record<string, number> = { tabby: 20, siamese: -20 }
  for (const p of PETS) {
    const win = wins.get(p.id)
    if (!win) continue
    const { width, height } = windowSizeFor(p, loadSettings().scale)
    const targetX = p.id === 'tabby' ? centerX + offsets[p.id] : centerX - width + offsets[p.id]
    const { x, y } = clampToWorkArea(targetX, bottom - height, width, height, wa)
    win.setPosition(x, y, false)
    win.showInactive()
    savePosition(win)
  }
  saveSettings({ merged: false })
  rebuildMenu(trayDeps)
}

// ---------- 模式与托盘 ----------

function setMode(mode: Mode): void {
  saveSettings({ mode })
  if (mode === 'snap') {
    for (const win of wins.values()) {
      if (win.isVisible() && !dragTimers.has(win.id)) {
        cancelWalk(win)
        cancelPhysics(win)
        snapWindow(win, true)
      }
    }
  }
  rebuildMenu(trayDeps)
}

function setScale(scale: number): void {
  saveSettings({ scale })
  for (const def of ALL_PETS) {
    const win = wins.get(def.id)
    if (!win || win.isDestroyed()) continue
    cancelWalk(win)
    cancelAnim(win)
    cancelPhysics(win)
    const { width, height } = windowSizeFor(def, scale)
    const b = win.getBounds()
    const wa = screen.getDisplayMatching(b).workArea
    // 以底边中心为锚点缩放，猫的“脚”位置不动
    const { x, y } = clampToWorkArea(
      Math.round(b.x + b.width / 2 - width / 2),
      b.y + b.height - height,
      width,
      height,
      wa
    )
    win.setBounds({ x, y, width, height })
    win.webContents.send('pet:scale', scale)
    savePosition(win)
  }
  rebuildMenu(trayDeps)
}

function setVisible(id: string, visible: boolean): void {
  if (loadSettings().merged) splitDuo()
  const win = wins.get(id)
  if (!win) return
  if (visible) win.showInactive()
  else {
    cancelWalk(win)
    cancelPhysics(win)
    win.hide()
  }
  savePosition(win)
  rebuildMenu(trayDeps)
}

const trayDeps = {
  pets: PETS.map((p) => ({ id: p.id, name: p.name })),
  getMode: () => loadSettings().mode,
  setMode,
  isVisible: (id: string) =>
    loadSettings().merged ? true : (wins.get(id)?.isVisible() ?? false),
  setVisible,
  getScale: () => loadSettings().scale,
  setScale,
}

// ---------- IPC ----------

function registerIpc(): void {
  ipcMain.handle('pet:info', (_e, id: string) => {
    const def = ALL_PETS.find((p) => p.id === id) ?? PETS[0]
    return {
      id: def.id,
      name: def.name,
      sprites: def.sprites,
      animations: def.animations ?? [],
      dispH: def.dispH,
      isDuo: def.id === DUO.id,
      sleepAfterSec: def.personality.sleepAfterSec,
      scale: loadSettings().scale,
      quotes: def.quotes,
    }
  })

  ipcMain.on('pet:set-ignore', (e, ignore: boolean) => {
    winOf(e)?.setIgnoreMouseEvents(ignore, { forward: true })
  })

  ipcMain.on('pet:state-changed', (e, state: PetState) => {
    const win = winOf(e)
    const id = win && petIdOf(win)
    if (id) petStates.set(id, state)
  })

  ipcMain.on('pet:split', () => splitDuo())

  ipcMain.on('pet:drag-start', (e, offset: { ox: number; oy: number }) => {
    const win = winOf(e)
    if (!win) return
    cancelAnim(win)
    cancelWalk(win)
    cancelPhysics(win)
    dragHist.set(win.id, [])
    const prev = dragTimers.get(win.id)
    if (prev) clearInterval(prev)
    const timer = setInterval(() => {
      if (win.isDestroyed()) {
        clearInterval(timer)
        return
      }
      const c = screen.getCursorScreenPoint()
      const x = Math.round(c.x - offset.ox)
      const y = Math.round(c.y - offset.oy)
      win.setPosition(x, y, false)
      const hist = dragHist.get(win.id)
      if (hist) {
        hist.push({ x, y, t: Date.now() })
        if (hist.length > 12) hist.shift()
      }
    }, 12)
    dragTimers.set(win.id, timer)
  })

  ipcMain.on('pet:drag-end', (e) => {
    const win = winOf(e)
    if (!win) return
    const timer = dragTimers.get(win.id)
    if (timer) {
      clearInterval(timer)
      dragTimers.delete(win.id)
    }

    // 拖到另一只猫身上 → 合体
    const id = petIdOf(win)
    if (id && id !== DUO.id && !loadSettings().merged) {
      const other = PETS.find((p) => p.id !== id)
      const otherWin = other && wins.get(other.id)
      if (otherWin?.isVisible() && overlapEnough(win.getBounds(), otherWin.getBounds())) {
        mergePets(win)
        return
      }
    }

    // 带着速度松手 → 扔出去
    const v = releaseVelocity(win.id)
    dragHist.delete(win.id)
    if (v.speed > THROW_MIN_SPEED) {
      physicsThrow(win, v.vx, v.vy)
      return
    }

    if (loadSettings().mode === 'snap') snapWindow(win, false)
    else savePosition(win)
  })
}

// ---------- 启动 ----------

app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock?.hide()
  registerIpc()
  const settings = loadSettings()
  for (const def of PETS) {
    const visible = !settings.merged && (settings.pets[def.id]?.visible ?? true)
    createPet(def, visible)
    scheduleWalk(def)
  }
  createPet(DUO, settings.merged)
  createTray(trayDeps)
})

// 猫全部隐藏时应用仍通过托盘常驻
app.on('window-all-closed', () => {})

app.on('before-quit', () => {
  for (const win of wins.values()) {
    if (!win.isDestroyed() && win.isVisible()) savePosition(win)
  }
  flush()
})
