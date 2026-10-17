import { bytesToBase64 } from '../audio/encoding'

export interface PreparedImage {
  /** Base64 JPEG without the data: prefix */
  base64: string
  /** Object URL for the on-screen thumbnail */
  previewUrl: string
}

const IMAGE_TYPES = /^image\/(png|jpe?g|webp|bmp|gif)$/i
const MAX_SIDE = 1280

export function isImageFile(file: File): boolean {
  return IMAGE_TYPES.test(file.type) || /\.(png|jpe?g|webp|bmp)$/i.test(file.name)
}

/** Downscales to at most 1280 px on the long side (keeps UI text readable) and encodes JPEG. */
export async function prepareImage(blob: Blob): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(blob)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const jpeg = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read this image.'))), 'image/jpeg', 0.85),
  )
  return {
    base64: bytesToBase64(new Uint8Array(await jpeg.arrayBuffer())),
    previewUrl: URL.createObjectURL(jpeg),
  }
}
