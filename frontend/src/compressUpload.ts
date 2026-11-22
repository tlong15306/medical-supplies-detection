const mebibyte = 1024 * 1024
const maxCanvasPixels = 16_000_000
const maxCanvasEdge = 4096
const compressionSettings = [
  { scale: 1, quality: 0.92 },
  { scale: 1, quality: 0.89 },
  { scale: 1, quality: 0.86 },
  { scale: 0.85, quality: 0.91 },
  { scale: 0.75, quality: 0.91 },
]

export async function compressUpload(file: File, signal: AbortSignal): Promise<File> {
  signal.throwIfAborted()
  if (file.size <= mebibyte) return file

  const targetRatio = file.size > 5 * mebibyte ? 0.65 : file.size > 2 * mebibyte ? 0.75 : 0.85
  const targetBytes = file.size * targetRatio
  const url = URL.createObjectURL(file)
  const image = new Image()
  const canvas = document.createElement('canvas')

  try {
    image.src = url
    await image.decode()
    signal.throwIfAborted()

    const { naturalWidth: width, naturalHeight: height } = image
    const context = canvas.getContext('2d')
    if (!context || !width || !height) throw new Error('Không thể đọc kích thước ảnh.')

    const canvasScale = Math.min(1, maxCanvasEdge / Math.max(width, height), Math.sqrt(maxCanvasPixels / (width * height)))
    let currentScale = 0
    let smallest: Blob = file
    for (const { scale, quality } of compressionSettings) {
      // Prefer a smaller JPEG at the current resolution over extra downscaling.
      if (scale < 1 && smallest !== file) break
      if (currentScale !== scale) {
        currentScale = scale
        canvas.width = Math.max(1, Math.floor(width * canvasScale * scale))
        canvas.height = Math.max(1, Math.floor(height * canvasScale * scale))
        // JPEG needs an opaque background for transparent PNG input.
        context.fillStyle = '#fff'
        context.fillRect(0, 0, canvas.width, canvas.height)
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
      }

      const encoded = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
      signal.throwIfAborted()
      if (!encoded?.size || encoded.type !== 'image/jpeg') throw new Error('Không thể mã hóa ảnh JPG.')
      if (encoded.size < smallest.size) smallest = encoded
      if (encoded.size <= targetBytes) break
    }

    if (smallest === file) return file
    const name = file.name.replace(/\.(?:jpe?g|png)$/i, '') + '.jpg'
    return new File([smallest], name, { type: smallest.type })
  } catch (error) {
    if (signal.aborted) throw error
    throw new Error('Không thể nén ảnh. Vui lòng chọn ảnh JPG hoặc PNG khác.')
  } finally {
    URL.revokeObjectURL(url)
    canvas.width = 0
    canvas.height = 0
  }
}
