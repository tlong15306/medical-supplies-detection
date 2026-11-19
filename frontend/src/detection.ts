export type Detection = { class_id: number; class_name: string; confidence: number; bin?: string | null; bbox: [number, number, number, number] }
export type Result = { image_width: number; image_height: number; detections: Detection[] }

export class DetectionError extends Error {
  constructor(message: string, public retryable = false) { super(message) }
}

export async function detectImage(image: Blob, filename: string, signal: AbortSignal): Promise<Result> {
  const apiBase = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')
  const form = new FormData(); form.append('image', image, filename)
  let response: Response
  try {
    response = await fetch(`${apiBase}/api/v1/detections`, {
      method: 'POST',
      body: form,
      signal,
    })
  } catch (error) {
    if (signal.aborted) throw error
    throw new DetectionError('Không kết nối được dịch vụ nhận diện.', true)
  }
  let payload
  try { payload = await response.json() }
  catch { throw new DetectionError('Dịch vụ trả về dữ liệu không hợp lệ.', [429, 502, 504].includes(response.status)) }
  if (!response.ok) throw new DetectionError(payload?.Error || 'Không thể nhận diện ảnh.', [429, 502, 504].includes(response.status))
  const data = payload?.Data
  if (payload?.Status !== 'success' || !data || !Number.isInteger(data.image_width) || data.image_width <= 0 || !Number.isInteger(data.image_height) || data.image_height <= 0 || !Array.isArray(data.detections) || !data.detections.every((d: Detection) => d && Number.isInteger(d.class_id) && typeof d.class_name === 'string' && Number.isFinite(d.confidence) && d.confidence >= 0 && d.confidence <= 1 && Array.isArray(d.bbox) && d.bbox.length === 4 && d.bbox.every(Number.isFinite) && d.bbox[0] >= 0 && d.bbox[1] >= 0 && d.bbox[2] >= d.bbox[0] && d.bbox[3] >= d.bbox[1] && d.bbox[2] <= data.image_width && d.bbox[3] <= data.image_height)) {
    throw new DetectionError('Dữ liệu nhận diện trả về không hợp lệ.')
  }
  return data
}
