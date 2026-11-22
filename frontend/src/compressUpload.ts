const maxUploadBytes = 500 * 1024
const compressionSettings = [
  { maxEdge: 1280, quality: 0.8 },
  { maxEdge: 1280, quality: 0.65 },
  { maxEdge: 960, quality: 0.7 },
  { maxEdge: 640, quality: 0.6 },
]

export async function compressUpload(file: File, signal: AbortSignal): Promise<File> {
  signal.throwIfAborted()
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

    for (const { maxEdge, quality } of compressionSettings) {
      const scale = Math.min(1, maxEdge / Math.max(width, height))
      canvas.width = Math.max(1, Math.round(width * scale))
      canvas.height = Math.max(1, Math.round(height * scale))
      // JPEG needs an opaque background for transparent PNG input.
      context.fillStyle = '#fff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)

      const encoded = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
      signal.throwIfAborted()
      if (!encoded?.size || encoded.type !== 'image/jpeg') throw new Error('Không thể mã hóa ảnh JPG.')
      if (encoded.size <= maxUploadBytes) {
        const name = file.name.replace(/\.(?:jpe?g|png)$/i, '') + '.jpg'
        return new File([encoded], name, { type: encoded.type })
      }
    }
  } catch (error) {
    if (signal.aborted) throw error
    throw new Error('Không thể nén ảnh. Vui lòng chọn ảnh JPG hoặc PNG khác.')
  } finally {
    URL.revokeObjectURL(url)
    canvas.width = 0
    canvas.height = 0
  }

  throw new Error('Ảnh sau khi nén vẫn vượt quá 500 KB. Vui lòng chọn ảnh nhỏ hơn.')
}
