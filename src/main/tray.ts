import { Menu, Tray, app, nativeImage } from 'electron'
import { join } from 'path'
import { Mode } from './store'

export interface TrayDeps {
  pets: { id: string; name: string }[]
  getMode: () => Mode
  setMode: (m: Mode) => void
  isVisible: (id: string) => boolean
  setVisible: (id: string, v: boolean) => void
  getScale: () => number
  setScale: (s: number) => void
}

const SCALE_OPTIONS: { label: string; value: number }[] = [
  { label: '小', value: 0.75 },
  { label: '标准', value: 1 },
  { label: '大', value: 1.25 },
  { label: '特大', value: 1.5 },
]

let tray: Tray | null = null

function trayIcon(): Electron.NativeImage {
  // macOS 用菜单栏 emoji 标题；Windows/Linux 用打包进 resources 的猫咪图标
  if (process.platform === 'darwin') return nativeImage.createEmpty()
  const p = app.isPackaged
    ? join(process.resourcesPath, 'tray.png')
    : join(app.getAppPath(), 'resources', 'tray.png')
  const icon = nativeImage.createFromPath(p)
  return icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 16, height: 16 })
}

export function createTray(deps: TrayDeps): void {
  tray = new Tray(trayIcon())
  if (process.platform === 'darwin') tray.setTitle('🐈')
  tray.setToolTip('Little Desktop Buddy')
  rebuildMenu(deps)
}

export function rebuildMenu(deps: TrayDeps): void {
  if (!tray) return
  const mode = deps.getMode()
  const menu = Menu.buildFromTemplate([
    {
      label: '自动吸附',
      type: 'radio',
      checked: mode === 'snap',
      click: () => deps.setMode('snap'),
    },
    {
      label: '自由放置',
      type: 'radio',
      checked: mode === 'free',
      click: () => deps.setMode('free'),
    },
    { type: 'separator' },
    {
      label: '宠物大小',
      submenu: SCALE_OPTIONS.map((o) => ({
        label: o.label,
        type: 'radio' as const,
        checked: Math.abs(deps.getScale() - o.value) < 0.01,
        click: () => deps.setScale(o.value),
      })),
    },
    { type: 'separator' },
    ...deps.pets.map((p) => ({
      label: p.name,
      type: 'checkbox' as const,
      checked: deps.isVisible(p.id),
      click: () => deps.setVisible(p.id, !deps.isVisible(p.id)),
    })),
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ])
  tray.setContextMenu(menu)
}
