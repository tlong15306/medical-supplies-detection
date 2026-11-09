import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './style.css'

type Detection = { class_id: number; class_name: string; confidence: number; bbox: [number, number, number, number] }
type Result = { image_width: number; image_height: number; detections: Detection[] }
const names = ['Bơm tiêm', 'Bộ dây truyền', 'Gạc', 'Vật sắc nhọn', 'Găng tay', 'Khẩu trang', 'Thuốc']
const limit = 10 * 1024 * 1024

function App() {
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const request = useRef<AbortController | null>(null)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { if (!file) { setUrl(''); return }; const objectUrl = URL.createObjectURL(file); setUrl(objectUrl); return () => URL.revokeObjectURL(objectUrl) }, [file])
  useEffect(() => () => request.current?.abort(), [])

  function choose(next?: File) {
    request.current?.abort(); request.current = null; setLoading(false); setResult(null); setError(''); setFile(null)
    if (!next) return
    if (!['image/jpeg', 'image/png'].includes(next.type)) { setError('Chỉ hỗ trợ ảnh JPG hoặc PNG.'); return }
    if (next.size > limit) { setError('Ảnh phải có dung lượng tối đa 10 MiB.'); return }
    setFile(next)
  }
  async function detect() {
    if (!file || loading) return
    const controller = new AbortController(); request.current = controller
    setLoading(true); setResult(null); setError('')
    const form = new FormData(); form.append('image', file)
    try {
      const response = await fetch('/api/v1/detections', { method: 'POST', body: form, signal: controller.signal })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.Error || 'Không thể nhận diện ảnh.')
      if (payload.Status !== 'success' || !payload.Data || !Array.isArray(payload.Data.detections) || !payload.Data.image_width || !payload.Data.image_height) throw new Error('Dữ liệu trả về không hợp lệ.')
      if (request.current === controller) setResult(payload.Data)
    } catch (e) {
      if (!controller.signal.aborted && request.current === controller) setError(e instanceof Error ? e.message : 'Đã xảy ra lỗi. Vui lòng thử lại.')
    } finally { if (request.current === controller) { setLoading(false); request.current = null } }
  }
  return <div className="app"><header><div className="brand"><span className="brand-icon">✚</span><div><strong>MEDSCAN</strong><small>NHẬN DIỆN VẬT TƯ Y TẾ</small></div></div>{import.meta.env.VITE_USE_MOCK === '1' && <span className="mock"><i/> Dữ liệu mô phỏng</span>}</header>
    <main><div className="intro"><span className="eyebrow">CÔNG CỤ NHẬN DIỆN  /  01</span><h1>Nhận diện vật tư<br/><em>trong hình ảnh.</em></h1><p>Tải ảnh lên để xác định và đánh dấu các vật tư y tế xuất hiện trong ảnh.</p></div>
    <div className="layout"><section className="panel image-panel"><div className="panel-title"><div><span className="step">01</span><strong>Hình ảnh</strong></div><span>JPG, PNG · TỐI ĐA 10 MiB</span></div>
      {!url ? <button className="upload" onClick={() => input.current?.click()}><span className="upload-icon">↑</span><strong>Chọn ảnh để bắt đầu</strong><span>Chọn một ảnh JPG hoặc PNG từ thiết bị</span><b>Chọn ảnh <span>↗</span></b></button> : <div className="preview-area"><div className="image-wrap"><img src={url} alt="Ảnh đã chọn" onError={() => { setError('Không thể đọc ảnh này. Vui lòng chọn ảnh khác.'); setFile(null) }}/>{result && result.detections.map((d, i) => { const [x1,y1,x2,y2] = d.bbox; return <div key={i} className="box" style={{left:`${x1/result.image_width*100}%`,top:`${y1/result.image_height*100}%`,width:`${(x2-x1)/result.image_width*100}%`,height:`${(y2-y1)/result.image_height*100}%`}}><span>{names[d.class_id] || d.class_name} · {(d.confidence*100).toFixed(1)}%</span></div> })}</div></div>}
      <input ref={input} type="file" accept="image/jpeg,image/png" hidden onChange={e => { choose(e.target.files?.[0]); e.target.value = '' }}/>
      {url && <div className="file-row"><div><strong>{file?.name}</strong><small>{file && (file.size/1024/1024).toFixed(2)} MiB</small></div><button className="text-button" onClick={() => input.current?.click()}>Đổi ảnh ↗</button></div>}</section>
      <aside className="panel results"><div className="panel-title"><div><span className="step">02</span><strong>Kết quả</strong></div><span>PHÂN TÍCH ẢNH</span></div><div className="results-body"><div className="result-heading"><span className="spark">✳</span><h2>Sẵn sàng phân tích</h2><p>Nhấn nhận diện để xem các vật tư được tìm thấy trên ảnh.</p></div><button className="detect" onClick={detect} disabled={!file || loading}>{loading ? 'Đang xử lý…' : 'Nhận diện'} <span>{loading ? '◌' : '↗'}</span></button>
      <div className="status" role="status" aria-live="polite">{error ? <div className="notice error"><strong>Không thể xử lý</strong><p>{error}</p></div> : loading ? <div className="notice"><strong>Đang xử lý ảnh</strong><p>Vui lòng chờ trong giây lát.</p></div> : result ? result.detections.length ? <><div className="result-label">ĐÃ TÌM THẤY <b>{result.detections.length}</b></div>{result.detections.map((d,i) => <div className="item" key={i}><span className="item-index">{String(i+1).padStart(2,'0')}</span><strong>{names[d.class_id] || d.class_name}</strong><b>{(d.confidence*100).toFixed(1)}%</b></div>)}</> : <div className="notice"><strong>Không phát hiện vật tư</strong><p>Không tìm thấy vật tư y tế trong ảnh này.</p></div> : <div className="empty"><span>◎</span><p>Kết quả nhận diện sẽ xuất hiện tại đây</p></div>}</div></div></aside></div>
    <footer><span>MEDSCAN / CÔNG CỤ NHẬN DIỆN</span><span>HỖ TRỢ PHÂN LOẠI VẬT TƯ Y TẾ</span></footer></main></div>
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
