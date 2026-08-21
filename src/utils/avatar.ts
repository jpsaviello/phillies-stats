// Downscales a picked image file to a small square-ish JPEG data URL before it
// ever leaves the browser, so POST /api/profile/avatar carries ~15-25KB
// instead of the original file. No dependency: createImageBitmap and <canvas>
// are both baseline in every browser this app already requires.

const MAX_SOURCE_BYTES = 8 * 1024 * 1024
const MAX_EDGE_PX = 256
const JPEG_QUALITY = 0.82

export async function fileToAvatarDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file.')
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error('That image is too large — please choose one under 8MB.')
  }

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error("Couldn't read that image — try a different file.")
  }

  try {
    const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (ctx === null) throw new Error("Couldn't process that image — try a different file.")
    ctx.drawImage(bitmap, 0, 0, width, height)

    return canvas.toDataURL('image/jpeg', JPEG_QUALITY)
  } finally {
    bitmap.close()
  }
}
