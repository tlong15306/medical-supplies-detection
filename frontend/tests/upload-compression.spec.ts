import { expect, test } from '@playwright/test'
import { imageSize } from 'image-size'
import { createServer } from 'vite'
import { mockDetection } from '../mock/detection'

test('compresses an iPhone-sized portrait before upload and positions its detection box', async ({ page }, testInfo) => {
  let upload: { body: Uint8Array; contentType: string } | undefined
  const server = await createServer({
    plugins: [
      {
        name: 'capture-test-upload',
        configureServer(vite) {
          vite.middlewares.use('/api/v1/detections', (request, _response, next) => {
            const chunks: Buffer[] = []
            request.on('data', (chunk: Buffer) => chunks.push(chunk))
            request.once('end', () => {
              upload = {
                body: new Uint8Array(Buffer.concat(chunks)),
                contentType: request.headers['content-type'] ?? '',
              }
            })
            next()
          })
        },
      },
      mockDetection('success'),
    ],
    server: { host: '127.0.0.1', port: 0, hmr: false, watch: null },
  })

  try {
    await server.listen()
    await page.goto(server.resolvedUrls!.local[0])
    const jpegData = await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 2400
      canvas.height = 1800
      const context = canvas.getContext('2d')!
      context.fillStyle = '#357b5d'
      context.fillRect(0, 0, 2400, 1800)
      context.fillStyle = '#f5d470'
      context.fillRect(0, 0, 1200, 900)
      return canvas.toDataURL('image/jpeg').split(',')[1]
    })
    const jpeg = Buffer.from(jpegData, 'base64')
    // EXIF orientation 6 represents a portrait stored as landscape pixel data.
    const orientation = Buffer.from('ffe1002245786966000049492a0008000000010012010300010000000600000000000000', 'hex')
    // JPEG comments inflate the file to 4 MiB while preserving its pixels.
    const padding: Buffer[] = []
    let bytesLeft = 4 * 1024 * 1024 - jpeg.length - orientation.length
    while (bytesLeft > 0) {
      const length = Math.min(bytesLeft, 60_004)
      const comment = Buffer.alloc(length)
      comment.writeUInt16BE(0xfffe, 0)
      comment.writeUInt16BE(length - 2, 2)
      padding.push(comment)
      bytesLeft -= length
    }
    const photo = Buffer.concat([jpeg.subarray(0, 2), orientation, ...padding, jpeg.subarray(2)])

    await page.locator('input[type=file]').setInputFiles({ name: 'iphone.jpg', mimeType: 'image/jpeg', buffer: photo })
    const preview = page.getByRole('img', { name: 'Ảnh đã chọn: iphone.jpg' })
    await expect(preview).toHaveJSProperty('naturalWidth', 1800)
    await page.getByRole('button', { name: 'Nhận diện', exact: false }).click()
    await expect(preview).toHaveJSProperty('naturalWidth', 960)
    await expect(preview).toHaveJSProperty('naturalHeight', 1280)
    const box = page.locator('.detection-box')
    await expect(box).toHaveCount(1)
    expect(await box.evaluate(element => (element as HTMLElement).style.left)).toBe('20%')
    expect(await box.evaluate(element => (element as HTMLElement).style.top)).toBe('10%')

    if (!upload) throw new Error('The mock server did not receive an upload')
    const multipart = new Response(new Uint8Array(upload.body), { headers: { 'content-type': upload.contentType } })
    const form = await multipart.formData()
    expect([...form.keys()]).toEqual(['image'])
    const uploadedFile = form.get('image')
    if (!(uploadedFile instanceof File)) throw new Error('Expected a file in the image field')
    expect(uploadedFile.name).toBe('iphone.jpg')
    expect(uploadedFile.type).toBe('image/jpeg')
    expect(uploadedFile.size).toBeGreaterThan(0)
    expect(uploadedFile.size).toBeLessThanOrEqual(500 * 1024)
    const encoded = imageSize(new Uint8Array(await uploadedFile.arrayBuffer()))
    expect(encoded).toMatchObject({ width: 960, height: 1280, type: 'jpg' })
    await expect(page.locator('.file-info')).toContainText(`Gửi ${Math.ceil(uploadedFile.size / 1024)} KB sau khi nén`)
    testInfo.annotations.push({ type: 'upload', description: `${photo.length} → ${uploadedFile.size} bytes` })
  } finally {
    await server.close()
  }
})

test('rejects the upload when JPEG encoding fails', async ({ page }) => {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.toBlob = callback => callback(null)
  })
  let uploads = 0
  await page.route('**/api/v1/detections', route => {
    uploads++
    return route.abort()
  })
  await page.goto('/')
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5O0AAAAASUVORK5CYII=', 'base64')
  await page.locator('input[type=file]').setInputFiles({ name: 'sample.png', mimeType: 'image/png', buffer: png })
  await page.getByRole('button', { name: 'Nhận diện', exact: false }).click()
  await expect(page.locator('.notice')).toContainText('Không thể nén ảnh')
  expect(uploads).toBe(0)
})
