import { useCallback, useEffect, useRef, useState } from 'react'
import { detectImage, DetectionError, type Result } from './detection'

type State = { status: 'idle' | 'starting' | 'running' | 'retrying' | 'failed'; result: Result | null; message: string; latency: number | null; fps: number | null }
const initial: State = { status: 'idle', result: null, message: '', latency: null, fps: null }
const interval = 1000 / 3
const maxAge = 1500

function cameraMessage(error: unknown) {
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Quyền camera bị từ chối. Hãy cho phép camera trong cài đặt trang rồi thử lại.'
  if (name === 'NotFoundError') return 'Không tìm thấy camera trên thiết bị.'
  if (name === 'NotReadableError') return 'Không mở được camera. Hãy đóng ứng dụng khác đang dùng camera rồi thử lại.'
  return error instanceof Error ? error.message : 'Không thể mở camera.'
}

export function useWebcam() {
  const video = useRef<HTMLVideoElement>(null)
  const cleanup = useRef<(() => void) | null>(null)
  const [state, setState] = useState<State>(initial)

  const stop = useCallback(() => {
    cleanup.current?.(); cleanup.current = null
    setState(initial)
  }, [])

  const start = useCallback(async () => {
    stop()
    let active = true
    let stream: MediaStream | null = null
    let request: AbortController | null = null
    const timers = new Set<ReturnType<typeof setTimeout>>()
    const later = (fn: () => void, delay: number) => {
      const id = setTimeout(() => { timers.delete(id); if (active) fn() }, delay)
      timers.add(id); return id
    }
    const cancelTimer = (id: ReturnType<typeof setTimeout>) => { clearTimeout(id); timers.delete(id) }
    const dispose = () => {
      active = false
      timers.forEach(clearTimeout); timers.clear()
      request?.abort()
      stream?.getTracks().forEach(track => track.stop())
      if (video.current?.srcObject === stream) video.current.srcObject = null
    }
    cleanup.current = dispose
    setState({ ...initial, status: 'starting', message: 'Đang xin quyền và mở camera…' })
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('Hãy mở ứng dụng bằng localhost hoặc HTTPS để dùng camera.')
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { width: { ideal: 640 }, height: { ideal: 480 } } })
      // Permission can resolve after the user has already stopped this session.
      if (!active) { stream.getTracks().forEach(track => track.stop()); return }
      const element = video.current
      if (!element) { dispose(); return }
      stream.getVideoTracks().forEach(track => track.addEventListener('ended', () => {
        if (!active) return
        dispose(); setState({ ...initial, status: 'failed', message: 'Camera đã bị ngắt. Hãy kết nối lại rồi thử lại.' })
      }, { once: true }))
      element.srcObject = stream
      await element.play()
      if (!active) return
      setState({ ...initial, status: 'running', message: 'Đang nhận diện liên tục' })
      const canvas = document.createElement('canvas')
      let failures = 0, lastSuccess = 0
      let staleTimer: ReturnType<typeof setTimeout> | undefined

      const tick = async () => {
        if (!active) return
        const captured = performance.now()
        let timedOut = false
        const controller = new AbortController(); request = controller
        const timeout = later(() => { timedOut = true; controller.abort() }, 12000)
        try {
          if (!element.videoWidth || !element.videoHeight) throw new DetectionError('Camera chưa có hình ảnh. Hãy thử lại.')
          const scale = Math.min(1, 640 / Math.max(element.videoWidth, element.videoHeight))
          canvas.width = Math.max(1, Math.round(element.videoWidth * scale))
          canvas.height = Math.max(1, Math.round(element.videoHeight * scale))
          const context = canvas.getContext('2d')
          if (!context) throw new DetectionError('Trình duyệt không hỗ trợ xử lý hình ảnh camera.')
          context.drawImage(element, 0, 0, canvas.width, canvas.height)
          const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8))
          if (!active) return
          if (!blob) throw new DetectionError('Không thể chụp khung hình camera.')
          const result = await detectImage(blob, 'webcam.jpg', controller.signal)
          if (!active) return
          const now = performance.now(), age = now - captured
          failures = 0
          if (staleTimer) cancelTimer(staleTimer)
          setState({ status: 'running', result: age < maxAge ? result : null, message: age < maxAge ? 'Đang nhận diện liên tục' : 'Kết quả chậm — đang chờ khung mới', latency: Math.round(age), fps: lastSuccess ? 1000 / (now - lastSuccess) : null })
          lastSuccess = now
          if (age < maxAge) staleTimer = later(() => setState(previous => ({ ...previous, result: null, message: 'Kết quả chậm — đang chờ khung mới' })), maxAge - age)
          later(() => { void tick() }, Math.max(0, Math.ceil(interval - age)))
        } catch (error) {
          if (!active) return
          if (staleTimer) cancelTimer(staleTimer)
          const retryable = timedOut || (error instanceof DetectionError && error.retryable)
          const message = timedOut ? 'Dịch vụ nhận diện phản hồi quá chậm.' : error instanceof Error ? error.message : 'Không thể nhận diện.'
          if (retryable && failures < 3) {
            const delay = 1000 * 2 ** failures++
            setState(previous => ({ ...previous, result: null, status: 'retrying', message: `${message} Thử lại sau ${delay / 1000} giây (${failures}/3).` }))
            later(() => { void tick() }, delay)
          } else setState(previous => ({ ...previous, result: null, status: 'failed', message }))
        } finally {
          cancelTimer(timeout)
          if (request === controller) request = null
        }
      }
      void tick()
    } catch (error) {
      if (!active) return
      dispose()
      setState({ ...initial, status: 'failed', message: cameraMessage(error) })
    }
  }, [stop])

  useEffect(() => {
    const hide = () => { if (document.hidden) stop() }
    document.addEventListener('visibilitychange', hide)
    window.addEventListener('pagehide', stop)
    return () => { document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', stop); cleanup.current?.() }
  }, [stop])
  return { ...state, video, start, stop }
}
