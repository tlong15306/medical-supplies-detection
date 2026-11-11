import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { binInfo, binKey, binOrder, BinIcon } from './bins'
import './style.css'

type Detection = { class_id: number; class_name: string; confidence: number; bin?: string | null; bbox: [number, number, number, number] }
type Result = { image_width: number; image_height: number; detections: Detection[] }
const names = ['Bơm tiêm', 'Bộ dây truyền', 'Gạc', 'Vật sắc nhọn', 'Găng tay', 'Khẩu trang', 'Thuốc']
const limit = 10 * 1024 * 1024

function App() {
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')
  const [imageError, setImageError] = useState('')
  const [loading, setLoading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [selected, setSelected] = useState<number | null>(null)
  const request = useRef<AbortController | null>(null)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { if (!file) { setUrl(''); return }; const objectUrl = URL.createObjectURL(file); setUrl(objectUrl); return () => URL.revokeObjectURL(objectUrl) }, [file])
  useEffect(() => () => request.current?.abort(), [])

  function choose(next?: File) {
    request.current?.abort(); request.current = null; setLoading(false); setResult(null); setSelected(null); setError(''); setImageError(''); setFile(null)
    if (!next) return
    if (!['image/jpeg', 'image/png'].includes(next.type)) { setImageError('Chỉ hỗ trợ ảnh JPG hoặc PNG. Vui lòng chọn ảnh khác.'); return }
    if (next.size > limit) { setImageError('Ảnh vượt quá 10 MiB. Vui lòng chọn ảnh nhỏ hơn.'); return }
    setFile(next)
  }
  async function detect() {
    if (!file || loading) return
    const controller = new AbortController(); request.current = controller
    setLoading(true); setResult(null); setSelected(null); setError('')
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
  const heading = loading ? 'Đang phân tích ảnh' : error ? 'Cần kiểm tra lại' : result ? (result.detections.length ? 'Đã hoàn tất nhận diện' : 'Không tìm thấy vật tư') : file ? 'Ảnh đã sẵn sàng' : 'Bắt đầu với một bức ảnh'
  const subtitle = loading ? 'Vui lòng chờ trong giây lát.' : error ? 'Vui lòng kiểm tra thông báo bên dưới và thử lại.' : result ? 'Bạn có thể đổi ảnh hoặc nhận diện lại.' : file ? 'Nhấn Nhận diện để xem kết quả phân tích.' : 'Chọn một ảnh để bắt đầu nhận diện vật tư.'
  return <div className="app">
    <a className="skip-link" href="#main">Chuyển đến nội dung chính</a>
    <header className="topbar"><div className="header-inner"><div className="brand"><span className="brand-icon" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M6 12V8a2 2 0 0 1 2-2h4M20 6h4a2 2 0 0 1 2 2v4M26 20v4a2 2 0 0 1-2 2h-4M12 26H8a2 2 0 0 1-2-2v-4"/><path d="M16 11v10m-5-5h10"/></svg></span><div><strong>MedScan</strong><small>NHẬN DIỆN VẬT TƯ Y TẾ</small></div></div><div className="header-end">{import.meta.env.VITE_USE_MOCK === '1' && <span className="mock"><i aria-hidden="true"/>Dữ liệu mô phỏng</span>}<span className="header-caption">CÔNG CỤ NHẬN DIỆN ẢNH</span></div></div></header>
    <main id="main"><div className="intro"><div><h1>Nhận diện vật tư y tế</h1><p>Tải ảnh lên để xác định và đánh dấu vật tư y tế xuất hiện trong ảnh.</p></div><div className="intro-note"><span className="note-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="m8.5 12 2.3 2.3 4.7-4.7"/></svg></span><span><strong>Đơn giản, trực quan</strong><br/>Chọn ảnh · Nhận diện · Xem kết quả</span></div></div>
    <div className="layout"><section className="panel image-panel" aria-labelledby="image-title"><div className="panel-title"><div className="title-group"><span className="step">01</span><div><h2 id="image-title">Hình ảnh</h2><p>Chọn ảnh cần phân tích</p></div></div><span className="format-chip">JPG / PNG</span></div>
      {!url ? <div className={'upload' + (dragging ? ' dragging' : '')} onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false) }} onDrop={e => { e.preventDefault(); setDragging(false); choose(e.dataTransfer.files[0]) }}><span className="upload-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 16V4m0 0L8 8m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg></span><strong>Kéo thả ảnh vào đây</strong><span>hoặc chọn ảnh từ thiết bị của bạn</span><button className="choose-button" onClick={() => input.current?.click()}>Chọn ảnh <span aria-hidden="true">→</span></button><small>JPG hoặc PNG · Tối đa 10 MiB</small></div> : <div className={'preview-area' + (dragging ? ' dragging' : '')} onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false) }} onDrop={e => { e.preventDefault(); setDragging(false); choose(e.dataTransfer.files[0]) }}><div className="image-wrap"><img src={url} alt={`Ảnh đã chọn: ${file?.name || ''}`} onError={() => { setImageError('Không thể đọc ảnh này. Vui lòng chọn ảnh khác.'); setFile(null); setResult(null) }}/>{result && result.detections.map((d, i) => { const [x1,y1,x2,y2] = d.bbox; const bin = binKey(d.bin); return <button type="button" key={i} className={'detection-box' + (selected === i ? ' selected' : '')} style={{left:`${x1/result.image_width*100}%`,top:`${y1/result.image_height*100}%`,width:`${(x2-x1)/result.image_width*100}%`,height:`${(y2-y1)/result.image_height*100}%`}} onClick={() => setSelected(i)} aria-pressed={selected === i} aria-label={`Vật thể ${i+1}: ${names[d.class_id] || d.class_name}, ${binInfo[bin].label}`}><span className={'box-label' + (x1 / result.image_width > .55 ? ' label-right' : '') + (y1 / result.image_height > .75 ? ' label-bottom' : '')}><strong>#{i+1} {names[d.class_id] || d.class_name} · {(d.confidence*100).toFixed(1)}%</strong><span>{binInfo[bin].label}</span></span></button> })}</div></div>}
      <input ref={input} type="file" accept="image/jpeg,image/png" hidden onChange={e => { choose(e.target.files?.[0]); e.target.value = '' }}/>
      {url && <div className="file-row"><span className="file-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 5h16v14H4zM4 16l5-5 3 3 2-2 6 5M15 9h.01"/></svg></span><div className="file-info"><strong>{file?.name}</strong><small>{file && (file.size < 1024 * 1024 ? `${Math.max(1, Math.round(file.size/1024))} KB` : `${(file.size/1024/1024).toFixed(2)} MiB`)}</small></div><button className="text-button" onClick={() => input.current?.click()}>Đổi ảnh <span aria-hidden="true">↗</span></button></div>}
      {imageError ? <p className="image-error" role="alert">{imageError}</p> : <p className="image-hint">Chọn ảnh rõ nét, đủ sáng để dễ quan sát kết quả.</p>}</section>
      <aside className="panel results" aria-labelledby="results-title"><div className="panel-title"><div className="title-group"><span className="step">02</span><div><h2 id="results-title">Kết quả nhận diện</h2><p>Vật tư được tìm thấy</p></div></div></div><div className="results-body"><div className="result-heading"><span className="spark" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 4.5 4.5M8 10.5h5m-2.5-2.5v5"/></svg></span><h3>{heading}</h3><p>{subtitle}</p></div><button className="detect" onClick={detect} disabled={!file || loading}>{loading ? 'Đang xử lý…' : 'Nhận diện'} <span aria-hidden="true">{loading ? '◌' : '→'}</span></button>
      <div className="status" role="status" aria-live="polite" aria-atomic="true">{error ? <div className="notice error"><strong>Không thể xử lý ảnh</strong><p>{error}</p></div> : loading ? <div className="notice"><strong>Đang xử lý ảnh</strong><p>Vui lòng chờ trong giây lát.</p></div> : result ? result.detections.length ? <><div className="result-label"><span>VẬT TƯ ĐƯỢC PHÁT HIỆN</span><b>{result.detections.length}</b></div>{result.detections.map((d,i) => { const kind = binKey(d.bin); return <button type="button" className={'detection-row' + (selected === i ? ' selected' : '')} key={i} onClick={() => setSelected(i)} aria-pressed={selected === i}><span className="item-index">#{i+1}</span><span className="row-content"><span className="row-top"><strong>{names[d.class_id] || d.class_name}</strong><b>{(d.confidence*100).toFixed(1)}%</b></span><span className="row-bin"><BinIcon kind={kind}/><span>{binInfo[kind].label}</span></span></span></button> })}</> : <div className="notice"><strong>Không phát hiện vật tư</strong><p>Không tìm thấy vật tư y tế trong ảnh này.</p></div> : <div className="empty"><span className="empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 5h16v14H4zM8 15l3-3 2 2 2-2 3 3M9 9h.01"/></svg></span><strong>Chưa có kết quả</strong><p>Kết quả nhận diện sẽ xuất hiện tại đây.</p></div>}</div></div></aside></div>
    {result && result.detections.length > 0 && <section className="bin-groups" aria-labelledby="bin-groups-title"><div className="bin-groups-head"><div><h2 id="bin-groups-title">Phân nhóm thùng chứa</h2><p>Vật tư được phân nhóm theo kết quả nhận diện.</p></div><span>{result.detections.length} vật thể</span></div><div className="bin-grid">{[...binOrder, ...(result.detections.some(d => binKey(d.bin) === 'unknown') ? ['unknown' as const] : [])].map(kind => { const members = result.detections.map((d,i) => ({d,i})).filter(({d}) => binKey(d.bin) === kind); return <div key={kind} className={'bin-group' + (selected !== null && binKey(result.detections[selected].bin) === kind ? ' selected' : '')}><div className="bin-group-head"><BinIcon kind={kind}/><div><strong>{binInfo[kind].label}</strong><small>{binInfo[kind].detail}</small></div><b>{members.length}</b></div><div className="bin-members">{members.length ? members.map(({d,i}) => <button type="button" key={i} className={selected === i ? 'selected' : ''} onClick={() => setSelected(i)} aria-pressed={selected === i}>#{i+1} {names[d.class_id] || d.class_name}</button>) : <span>Chưa có vật tư</span>}</div></div> })}</div></section>}
    <footer><span>MEDSCAN <span aria-hidden="true">/</span> NHẬN DIỆN VẬT TƯ Y TẾ</span><span>PHÂN TÍCH HÌNH ẢNH</span></footer></main></div>
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
