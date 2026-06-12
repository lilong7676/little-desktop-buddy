import { BrowserWindow, screen } from 'electron'

export const SNAP_THRESHOLD = 48

export interface Anchor {
  id: string
  x: number
  y: number
}

// 四角 + 四边中点，基于 workArea（自动避开任务栏 / Dock）
export function anchorsFor(winW: number, winH: number, display: Electron.Display): Anchor[] {
  const wa = display.workArea
  const xl = wa.x
  const xc = wa.x + Math.round((wa.width - winW) / 2)
  const xr = wa.x + wa.width - winW
  const yt = wa.y
  const ym = wa.y + Math.round((wa.height - winH) / 2)
  const yb = wa.y + wa.height - winH
  return [
    { id: 'tl', x: xl, y: yt },
    { id: 'tc', x: xc, y: yt },
    { id: 'tr', x: xr, y: yt },
    { id: 'ml', x: xl, y: ym },
    { id: 'mr', x: xr, y: ym },
    { id: 'bl', x: xl, y: yb },
    { id: 'bc', x: xc, y: yb },
    { id: 'br', x: xr, y: yb },
  ]
}

export function anchorById(winW: number, winH: number, display: Electron.Display, id: string): Anchor {
  const anchors = anchorsFor(winW, winH, display)
  return anchors.find((a) => a.id === id) ?? anchors[anchors.length - 1]
}

export function nearestAnchor(win: BrowserWindow): (Anchor & { dist: number }) | null {
  const [x, y] = win.getPosition()
  const [w, h] = win.getSize()
  const display = screen.getDisplayMatching(win.getBounds())
  let best: (Anchor & { dist: number }) | null = null
  for (const a of anchorsFor(w, h, display)) {
    const dist = Math.hypot(a.x - x, a.y - y)
    if (!best || dist < best.dist) best = { ...a, dist }
  }
  return best
}

const anims = new Map<number, NodeJS.Timeout>()

export function cancelAnim(win: BrowserWindow): void {
  const t = anims.get(win.id)
  if (t) {
    clearInterval(t)
    anims.delete(win.id)
  }
}

export function animateTo(win: BrowserWindow, tx: number, ty: number, ms = 180, onDone?: () => void): void {
  cancelAnim(win)
  const [sx, sy] = win.getPosition()
  const t0 = Date.now()
  const timer = setInterval(() => {
    if (win.isDestroyed()) {
      clearInterval(timer)
      return
    }
    const t = Math.min(1, (Date.now() - t0) / ms)
    const e = 1 - Math.pow(1 - t, 3)
    win.setPosition(Math.round(sx + (tx - sx) * e), Math.round(sy + (ty - sy) * e), false)
    if (t >= 1) {
      clearInterval(timer)
      anims.delete(win.id)
      onDone?.()
    }
  }, 16)
  anims.set(win.id, timer)
}
