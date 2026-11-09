import type { Plugin } from 'vite'
import Busboy from 'busboy'
import { imageSize } from 'image-size'

const MAX = 10 * 1024 * 1024
export function mockDetection(scenario: string): Plugin {
  return { name: 'mock-detection', configureServer(server) {
    server.middlewares.use('/api/v1/detections', (req, res, next) => {
      if (req.method !== 'POST') return next()
      const send = (status: number, body: object) => { if (!res.writableEnded) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)) } }
      let parser: ReturnType<typeof Busboy>
      try { parser = Busboy({ headers: req.headers, limits: { fileSize: MAX, files: 1 } }) }
      catch { send(400, { Error: 'Yêu cầu phải là multipart/form-data.', Code: 'INVALID_MULTIPART' }); return }
      let file: Buffer | undefined, invalid = false, tooLarge = false
      parser.on('file', (name, stream, info) => {
        const chunks: Buffer[] = []
        if (name !== 'image' || !['image/jpeg', 'image/png'].includes(info.mimeType)) invalid = true
        stream.on('data', (chunk: Buffer) => chunks.push(chunk))
        stream.on('limit', () => { tooLarge = true })
        stream.on('end', () => { file = Buffer.concat(chunks) })
      })
      parser.on('filesLimit', () => { invalid = true })
      parser.on('error', () => send(400, { Error: 'Dữ liệu tải lên không hợp lệ.', Code: 'INVALID_MULTIPART' }))
      parser.on('finish', () => {
        if (tooLarge) return send(413, { Error: 'Ảnh vượt quá 10 MiB.', Code: 'FILE_TOO_LARGE' })
        if (invalid || !file) return send(400, { Error: 'Vui lòng gửi ảnh JPG hoặc PNG trong field image.', Code: 'INVALID_IMAGE' })
        let width: number, height: number
        try {
          const size = imageSize(file)
          if (!size.width || !size.height || !['jpg', 'png'].includes(size.type || '')) throw new Error()
          width = size.width; height = size.height
        } catch { return send(400, { Error: 'Không đọc được ảnh JPG hoặc PNG.', Code: 'INVALID_IMAGE' }) }
        setTimeout(() => {
          if (scenario === 'error') return send(502, { Error: 'Dịch vụ nhận diện tạm thời không khả dụng.', Code: 'DETECTION_UNAVAILABLE' })
          const detections = scenario === 'empty' ? [] : [{ class_id: 0, class_name: 'syringe', confidence: 0.9508, bbox: [width * .2, height * .1, width * .72, height * .9] }]
          send(200, { Status: 'success', Data: { image_width: width, image_height: height, detections } })
        }, 500)
      })
      req.pipe(parser)
    })
  } }
}
