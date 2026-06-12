import { app } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'

export type Mode = 'free' | 'snap'

export interface PetState {
  x: number
  y: number
  displayId: number
  visible: boolean
}

export interface Settings {
  mode: Mode
  /** 双猫是否处于合体状态 */
  merged: boolean
  /** 宠物显示缩放（1 = 标准） */
  scale: number
  pets: Record<string, PetState>
}

const settingsFile = (): string => join(app.getPath('userData'), 'settings.json')

let cache: Settings | null = null
let flushTimer: NodeJS.Timeout | null = null

export function loadSettings(): Settings {
  if (cache) return cache
  try {
    cache = JSON.parse(readFileSync(settingsFile(), 'utf8')) as Settings
  } catch {
    cache = { mode: 'snap', merged: false, scale: 1, pets: {} }
  }
  if (!cache.mode) cache.mode = 'snap'
  if (typeof cache.merged !== 'boolean') cache.merged = false
  if (typeof cache.scale !== 'number' || !(cache.scale > 0)) cache.scale = 1
  if (!cache.pets) cache.pets = {}
  return cache
}

export function saveSettings(patch: Partial<Settings>): void {
  const cur = loadSettings()
  cache = {
    ...cur,
    ...patch,
    pets: { ...cur.pets, ...(patch.pets ?? {}) },
  }
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = setTimeout(flush, 150)
}

export function flush(): void {
  if (!cache) return
  try {
    mkdirSync(dirname(settingsFile()), { recursive: true })
    writeFileSync(settingsFile(), JSON.stringify(cache, null, 2))
  } catch {
    // 持久化失败不影响运行
  }
}
