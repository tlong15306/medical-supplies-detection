import { expect, test, type Page } from '@playwright/test'
import { imageSize } from 'image-size'
import type { Detection } from '../src/detection'

const result = (detections: Detection[] = [{ class_id: 0, class_name: 'syringe', confidence: .95, bbox: [64, 48, 320, 240], bin: 'yellow_sharps' }]) => ({ Status: 'success', Data: { image_width: 640, image_height: 480, detections } })

async function camera(page: Page, options: { denied?: boolean; pending?: boolean } = {}) {
  await page.addInitScript(({ denied, pending }) => {
    const state = window as typeof window & { stopped: number; grantCamera: () => void; endCamera: () => void }
    state.stopped = 0
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
      if (denied) throw new DOMException('denied', 'NotAllowedError')
      if (pending) await new Promise<void>(resolve => { state.grantCamera = resolve })
      const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480
      const context = canvas.getContext('2d')!; context.fillStyle = '#dbe8e3'; context.fillRect(0, 0, 640, 480)
      const stream = canvas.captureStream(10)
      const track = stream.getTracks()[0], original = track.stop.bind(track)
      track.stop = () => { state.stopped++; original() }
      state.endCamera = () => { original(); track.dispatchEvent(new Event('ended')) }
      return stream
    } })
  }, options)
}
async function open(page: Page) {
  await page.goto('/'); await page.getByRole('button', { name: 'Webcam', exact: true }).click()
  await page.getByRole('button', { name: 'Bật webcam', exact: true }).click()
}

test('serial requests, JPEG dimensions, boxes, resize, current-frame counts and stop', async ({ page }, testInfo) => {
  await camera(page)
  let inFlight = 0, maximum = 0, calls = 0
  const times: number[] = []
  await page.route('**/api/v1/detections', async route => {
    inFlight++; maximum = Math.max(maximum, inFlight); calls++; times.push(Date.now())
    expect(route.request().headers()['content-type']).toContain('multipart/form-data')
    const body = route.request().postDataBuffer()!
    expect(body.toString('latin1')).toContain('filename="webcam.jpg"')
    expect(body.toString('latin1')).toContain('image/jpeg')
    const size = imageSize(body.subarray(body.indexOf(Buffer.from([0xff, 0xd8]))))
    expect(size.width).toBe(640); expect(size.height).toBe(480)
    await new Promise(resolve => setTimeout(resolve, 400))
    inFlight--
    await route.fulfill({ json: result() })
  })
  await open(page)
  await expect(page.locator('.detection-box')).toHaveCount(1)
  await expect.poll(() => calls).toBeGreaterThanOrEqual(3)
  expect(maximum).toBe(1)
  expect(times.slice(1).every((time, index) => time - times[index] >= 320)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('webcam.png'), fullPage: true })
  await page.setViewportSize({ width: 900, height: 800 })
  const geometry = await page.locator('.webcam-image').evaluate(el => {
    const video = el.querySelector('video')!.getBoundingClientRect(), box = el.querySelector('.detection-box')!.getBoundingClientRect()
    return { x: (box.x - video.x) / video.width, width: box.width / video.width }
  })
  expect(geometry.x).toBeCloseTo(.1, 1); expect(geometry.width).toBeCloseTo(.4, 1)
  await page.getByRole('button', { name: 'Tắt webcam' }).click()
  const stoppedCalls = calls
  await expect(page.locator('.detection-box')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => (window as any).stopped)).toBe(1)
  await page.waitForTimeout(600); expect(calls).toBe(stoppedCalls)
})

test('permission denied gives actionable message', async ({ page }) => {
  await camera(page, { denied: true }); await open(page)
  await expect(page.locator('.webcam-status')).toContainText('Quyền camera bị từ chối')
  await expect(page.getByRole('button', { name: 'Thử lại', exact: true })).toBeVisible()
})

test('late permission grant releases the camera without sending a frame', async ({ page }) => {
  await camera(page, { pending: true }); let calls = 0
  await page.route('**/api/v1/detections', async route => { calls++; await route.fulfill({ json: result() }) })
  await open(page)
  await expect.poll(() => page.evaluate(() => typeof (window as any).grantCamera)).toBe('function')
  await page.getByRole('button', { name: 'Tắt webcam' }).click()
  await page.evaluate(() => (window as any).grantCamera())
  await expect.poll(() => page.evaluate(() => (window as any).stopped)).toBe(1)
  expect(calls).toBe(0)
})

test('busy retries then replaces count with empty frame', async ({ page }) => {
  await camera(page); let calls = 0
  await page.route('**/api/v1/detections', async route => {
    calls++
    if (calls === 1) return route.fulfill({ status: 429, json: { Error: 'Model đang bận' } })
    await route.fulfill({ json: calls === 2 ? result() : result([]) })
  })
  await open(page)
  await expect(page.locator('.webcam-status')).toContainText('Thử lại sau 1 giây')
  await expect(page.locator('.detection-box')).toHaveCount(1)
  await expect(page.locator('.detection-box')).toHaveCount(0)
  await expect(page.locator('.notice')).toContainText('Không phát hiện rác')
})

test('stale boxes expire and old response cannot revive stopped session', async ({ page }) => {
  await camera(page); let calls = 0
  await page.route('**/api/v1/detections', async route => {
    calls++
    if (calls > 1) await new Promise(resolve => setTimeout(resolve, 2200))
    await route.fulfill({ json: result() })
  })
  await open(page)
  await expect(page.locator('.detection-box')).toHaveCount(1)
  await expect(page.locator('.detection-box')).toHaveCount(0)
  await expect(page.locator('.webcam-status')).toContainText('Kết quả chậm')
  await page.getByRole('button', { name: 'Tải ảnh', exact: true }).click()
  await page.waitForTimeout(2300)
  await expect(page.locator('.detection-box')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => (window as any).stopped)).toBe(1)
})

test('three retries then manual retry', async ({ page }) => {
  await camera(page); let calls = 0
  await page.route('**/api/v1/detections', async route => { calls++; await route.fulfill({ status: 502, json: { Error: 'Tạm thời không khả dụng' } }) })
  await open(page)
  await expect(page.getByRole('button', { name: 'Thử lại', exact: true })).toBeVisible({ timeout: 12000 })
  expect(calls).toBe(4)
  await page.waitForTimeout(500); expect(calls).toBe(4)
})

test('camera track ending stops inference', async ({ page }) => {
  await camera(page)
  await page.route('**/api/v1/detections', route => route.fulfill({ json: result() }))
  await open(page); await expect(page.locator('.detection-box')).toHaveCount(1)
  await page.evaluate(() => (window as any).endCamera())
  await expect(page.locator('.webcam-status')).toContainText('Camera đã bị ngắt')
  await expect(page.locator('.detection-box')).toHaveCount(0)
})

test('upload still works after switching away from webcam', async ({ page }) => {
  await camera(page); await page.route('**/api/v1/detections', route => route.fulfill({ json: result() }))
  await open(page); await expect(page.locator('.detection-box')).toHaveCount(1)
  await page.getByRole('button', { name: 'Tải ảnh', exact: true }).click()
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5O0AAAAASUVORK5CYII=', 'base64')
  await page.locator('input[type=file]').setInputFiles({ name: 'sample.png', mimeType: 'image/png', buffer: png })
  await page.getByRole('button', { name: 'Nhận diện', exact: false }).click()
  await expect(page.locator('.detection-box')).toHaveCount(1)
  await expect(page.locator('.detection-row')).toHaveCount(1)
})

test('hidden page releases camera and does not restart automatically', async ({ page }) => {
  await camera(page); let calls = 0
  await page.route('**/api/v1/detections', route => { calls++; return route.fulfill({ json: result() }) })
  await open(page); await expect(page.locator('.detection-box')).toHaveCount(1)
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(page.getByRole('button', { name: 'Bật webcam', exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => (window as any).stopped)).toBe(1)
  const previous = calls
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false }); document.dispatchEvent(new Event('visibilitychange')) })
  await page.waitForTimeout(500); expect(calls).toBe(previous)
})

test('multiple detections including unknown bin replace previous frame', async ({ page }) => {
  await camera(page)
  await page.route('**/api/v1/detections', route => route.fulfill({ json: result([
    { class_id: 0, class_name: 'syringe', confidence: .95, bbox: [64, 48, 320, 240], bin: 'yellow_sharps' },
    { class_id: 5, class_name: 'mask', confidence: .9, bbox: [350, 60, 600, 250], bin: null },
  ]) }))
  await open(page)
  await expect(page.locator('.detection-box')).toHaveCount(2)
  await expect(page.locator('.detection-row')).toHaveCount(2)
  await expect(page.locator('.bin-group').filter({ hasText: 'Chưa xác định thùng' })).toBeVisible()
})

test('malformed success response stops without retrying', async ({ page }) => {
  await camera(page); let calls = 0
  await page.route('**/api/v1/detections', route => { calls++; return route.fulfill({ json: { Status: 'success', Data: { image_width: 0, detections: [] } } }) })
  await open(page)
  await expect(page.getByRole('button', { name: 'Thử lại', exact: true })).toBeVisible()
  await expect(page.locator('.webcam-status')).toContainText('không hợp lệ')
  await page.waitForTimeout(500); expect(calls).toBe(1)
})

test('request exceeding twelve seconds is aborted and retried', async ({ page }) => {
  await camera(page); let calls = 0
  await page.route('**/api/v1/detections', async route => {
    calls++
    if (calls === 1) await new Promise(resolve => setTimeout(resolve, 13500))
    await route.fulfill({ json: result() })
  })
  await open(page)
  await expect(page.locator('.webcam-status')).toContainText('phản hồi quá chậm', { timeout: 15000 })
  await expect(page.locator('.detection-box')).toHaveCount(1)
  expect(calls).toBeGreaterThanOrEqual(2)
})
