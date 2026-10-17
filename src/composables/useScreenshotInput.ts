import { onBeforeUnmount, onMounted, ref } from 'vue'
import { isImageFile } from '../screenshots/image'

/**
 * Page-wide screenshot input: Ctrl+V anywhere, and drag-and-drop anywhere on the page.
 * `dragging` drives the drop overlay.
 */
export function useScreenshotInput(onImage: (file: File) => void, enabled: () => boolean) {
  const dragging = ref(false)
  let depth = 0

  const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')

  function onPaste(e: ClipboardEvent): void {
    if (!enabled()) return
    const file = Array.from(e.clipboardData?.files ?? []).find(isImageFile)
    if (!file) return // plain text (e.g. pasting an API key) passes through untouched
    e.preventDefault()
    onImage(file)
  }

  function onDragEnter(e: DragEvent): void {
    if (!enabled() || !hasFiles(e)) return
    e.preventDefault()
    depth++
    dragging.value = true
  }

  function onDragOver(e: DragEvent): void {
    if (!enabled() || !hasFiles(e)) return
    e.preventDefault()
    e.dataTransfer!.dropEffect = 'copy'
  }

  function onDragLeave(): void {
    depth = Math.max(0, depth - 1)
    if (depth === 0) dragging.value = false
  }

  function onDrop(e: DragEvent): void {
    if (!hasFiles(e)) return
    e.preventDefault()
    depth = 0
    dragging.value = false
    if (!enabled()) return
    const file = Array.from(e.dataTransfer?.files ?? []).find(isImageFile)
    if (file) onImage(file)
  }

  onMounted(() => {
    window.addEventListener('paste', onPaste)
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('paste', onPaste)
    window.removeEventListener('dragenter', onDragEnter)
    window.removeEventListener('dragover', onDragOver)
    window.removeEventListener('dragleave', onDragLeave)
    window.removeEventListener('drop', onDrop)
  })

  return { dragging }
}
