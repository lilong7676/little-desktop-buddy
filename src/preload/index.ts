import { contextBridge, ipcRenderer } from 'electron'

export interface SpriteDef {
  src: string
  natW: number
  natH: number
}

export interface AnimDef extends SpriteDef {
  key: string
  durMs: number
  delaySec: [number, number]
  dispH?: number
}

export interface PetQuotes {
  idle: string[]
  pet: string[]
}

export interface PetInfo {
  id: string
  name: string
  sprites: { idle: SpriteDef; sleep?: SpriteDef }
  animations: AnimDef[]
  dispH: number
  isDuo: boolean
  sleepAfterSec: number
  scale: number
  quotes: PetQuotes
}

const api = {
  getInfo: (id: string): Promise<PetInfo> => ipcRenderer.invoke('pet:info', id),
  setIgnore: (ignore: boolean): void => ipcRenderer.send('pet:set-ignore', ignore),
  dragStart: (offset: { ox: number; oy: number }): void =>
    ipcRenderer.send('pet:drag-start', offset),
  dragEnd: (): void => ipcRenderer.send('pet:drag-end'),
  stateChanged: (state: 'idle' | 'sleep'): void => ipcRenderer.send('pet:state-changed', state),
  split: (): void => ipcRenderer.send('pet:split'),
  onWalking: (cb: (walking: boolean) => void): void => {
    ipcRenderer.on('pet:walking', (_e, walking: boolean) => cb(walking))
  },
  onScale: (cb: (scale: number) => void): void => {
    ipcRenderer.on('pet:scale', (_e, scale: number) => cb(scale))
  },
  onThrown: (cb: (thrown: boolean) => void): void => {
    ipcRenderer.on('pet:thrown', (_e, thrown: boolean) => cb(thrown))
  },
}

export type BuddyApi = typeof api

contextBridge.exposeInMainWorld('buddy', api)
