import { expect, test, type Page } from '@playwright/test'
import { imageSize } from 'image-size'
import { createServer } from 'vite'
import { mockDetection } from '../mock/detection'

async function portraitPhoto(page: Page, size: number) {
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
  // JPEG comments change the file size while preserving its pixels.
  const padding: Buffer[] = []
  let bytesLeft = size - jpeg.length - orientation.length
  while (bytesLeft > 0) {
    const length = bytesLeft > 60_004 ? Math.min(60_004, bytesLeft - 4) : bytesLeft
    const comment = Buffer.alloc(length)
    comment.writeUInt16BE(0xfffe, 0)
    comment.writeUInt16BE(length - 2, 2)
    padding.push(comment)
    bytesLeft -= length
  }
  return Buffer.concat([jpeg.subarray(0, 2), orientation, ...padding, jpeg.subarray(2)])
}

test('compresses a large portrait at its original resolution and preserves the one MiB boundary', async ({ page }, testInfo) => {
  let upload: { body: Uint8Array; contentType: string } | undefined
  function takeUpload() {
    if (!upload) throw new Error('The mock server did not receive an upload')
    const received = upload
    upload = undefined
    return new Response(new Uint8Array(received.body), { headers: { 'content-type': received.contentType } }).formData()
  }
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
    const photo = await portraitPhoto(page, 4 * 1024 * 1024)

    await page.locator('input[type=file]').setInputFiles({ name: 'iphone.jpg', mimeType: 'image/jpeg', buffer: photo })
    const preview = page.getByRole('img', { name: 'Ảnh đã chọn: iphone.jpg' })
    await expect(preview).toHaveJSProperty('naturalWidth', 1800)
    await page.getByRole('button', { name: 'Nhận diện', exact: false }).click()
    await expect(preview).toHaveJSProperty('naturalWidth', 1800)
    await expect(preview).toHaveJSProperty('naturalHeight', 2400)
    const box = page.locator('.detection-box')
    await expect(box).toHaveCount(1)
    expect(await box.evaluate(element => (element as HTMLElement).style.left)).toBe('20%')
    expect(await box.evaluate(element => (element as HTMLElement).style.top)).toBe('10%')

    const form = await takeUpload()
    expect([...form.keys()]).toEqual(['image'])
    const uploadedFile = form.get('image')
    if (!(uploadedFile instanceof File)) throw new Error('Expected a file in the image field')
    expect(uploadedFile.name).toBe('iphone.jpg')
    expect(uploadedFile.type).toBe('image/jpeg')
    expect(uploadedFile.size).toBeGreaterThan(0)
    expect(uploadedFile.size).toBeLessThan(photo.length)
    const encoded = imageSize(new Uint8Array(await uploadedFile.arrayBuffer()))
    expect(encoded).toMatchObject({ width: 1800, height: 2400, type: 'jpg' })
    await expect(page.locator('.file-info')).toContainText(`Gửi ${Math.ceil(uploadedFile.size / 1024)} KB sau khi nén`)
    testInfo.annotations.push({ type: 'upload', description: `${photo.length} → ${uploadedFile.size} bytes` })

    const small = await portraitPhoto(page, 1024 * 1024)
    await page.locator('input[type=file]').setInputFiles({ name: 'small.jpg', mimeType: 'image/jpeg', buffer: small })
    await expect(page.getByRole('img', { name: 'Ảnh đã chọn: small.jpg' })).toHaveJSProperty('naturalWidth', 1800)
    await page.getByRole('button', { name: 'Nhận diện', exact: false }).click()
    await expect(box).toHaveCount(1)
    const original = await takeUpload()
    const originalFile = original.get('image')
    if (!(originalFile instanceof File)) throw new Error('Expected a file in the image field')
    expect(originalFile.name).toBe('small.jpg')
    expect(Buffer.from(await originalFile.arrayBuffer()).equals(small)).toBe(true)
    await expect(page.locator('.file-info')).not.toContainText('sau khi nén')
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
  const large = await portraitPhoto(page, 2 * 1024 * 1024)
  await page.locator('input[type=file]').setInputFiles({ name: 'sample.jpg', mimeType: 'image/jpeg', buffer: large })
  await page.getByRole('button', { name: 'Nhận diện', exact: false }).click()
  await expect(page.locator('.notice')).toContainText('Không thể nén ảnh')
  expect(uploads).toBe(0)
})
