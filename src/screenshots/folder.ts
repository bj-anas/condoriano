/**
 * Optional: watch the BDO screenshot folder (Documents/Black Desert/ScreenShot) with the
 * File System Access API, so pressing Print Screen in game sends the picture to Condoriano.
 * Chrome and Edge only. The folder handle is kept in IndexedDB so it survives reloads.
 */
import { isImageFile } from './image'

type PermissionMode = { mode: 'read' }
interface DirHandle extends FileSystemDirectoryHandle {
  queryPermission(opts: PermissionMode): Promise<PermissionState>
  requestPermission(opts: PermissionMode): Promise<PermissionState>
  values(): AsyncIterableIterator<FileSystemHandle>
}

const DB = 'condoriano'
const STORE = 'handles'
const KEY = 'screenshot-folder'

export const folderAccessSupported = (): boolean => 'showDirectoryPicker' in window

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idb<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => resolve(req.result as T)
    req.onerror = () => reject(req.error)
  })
}

export async function pickScreenshotFolder(): Promise<string> {
  const picker = (window as unknown as { showDirectoryPicker(o: object): Promise<DirHandle> }).showDirectoryPicker
  const handle = await picker({ id: 'bdo-screenshots', mode: 'read', startIn: 'documents' })
  await idb('readwrite', (s) => s.put(handle, KEY))
  return handle.name
}

export async function savedFolder(): Promise<DirHandle | null> {
  try {
    return (await idb<DirHandle | undefined>('readonly', (s) => s.get(KEY))) ?? null
  } catch {
    return null
  }
}

export async function forgetScreenshotFolder(): Promise<void> {
  await idb('readwrite', (s) => s.delete(KEY))
}

/** `prompt` means the browser needs a click before we can read the folder again. */
export async function folderPermission(handle: DirHandle, ask: boolean): Promise<PermissionState> {
  const state = await handle.queryPermission({ mode: 'read' })
  if (state === 'prompt' && ask) return handle.requestPermission({ mode: 'read' })
  return state
}

/**
 * Polls the folder while a call is active and reports images added after watching began.
 * Existing names are snapshotted once, so each poll only opens files it has never seen.
 */
export class FolderWatcher {
  private timer: ReturnType<typeof setInterval> | undefined
  private seen = new Set<string>()
  private scanning = false
  private stopped = false
  private handle: DirHandle
  private onImage: (file: File) => void

  constructor(handle: DirHandle, onImage: (file: File) => void) {
    this.handle = handle
    this.onImage = onImage
  }

  async start(): Promise<void> {
    for await (const entry of this.handle.values()) this.seen.add(entry.name)
    if (this.stopped) return
    this.timer = setInterval(() => void this.scan(), 2000)
  }

  stop(): void {
    this.stopped = true
    clearInterval(this.timer)
  }

  private async scan(): Promise<void> {
    if (this.scanning) return
    this.scanning = true
    try {
      const fresh: FileSystemFileHandle[] = []
      for await (const entry of this.handle.values()) {
        if (entry.kind === 'file' && !this.seen.has(entry.name)) fresh.push(entry as FileSystemFileHandle)
      }
      if (!fresh.length) return
      fresh.forEach((h) => this.seen.add(h.name))
      // BDO may still be writing the file; read it once it has settled, newest only.
      await new Promise((r) => setTimeout(r, 500))
      const files = (await Promise.all(fresh.map((h) => h.getFile()))).filter(isImageFile)
      const newest = files.sort((a, b) => b.lastModified - a.lastModified)[0]
      if (newest && !this.stopped) this.onImage(newest)
    } catch {
      // permission revoked or folder gone; the next call will ask again
    } finally {
      this.scanning = false
    }
  }
}
