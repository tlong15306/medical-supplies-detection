import type { ReactNode } from 'react'

export type BinKey = 'yellow_sharps' | 'yellow_infectious' | 'black_hazardous' | 'unknown'
export const binOrder: BinKey[] = ['yellow_sharps', 'yellow_infectious', 'black_hazardous']
export const binInfo: Record<BinKey, { label: string; detail: string }> = {
  yellow_sharps: { label: 'Hộp vàng · sắc nhọn', detail: 'Thành cứng' },
  yellow_infectious: { label: 'Thùng vàng · lây nhiễm', detail: 'Chất thải lây nhiễm' },
  black_hazardous: { label: 'Thùng đen · nguy hại', detail: 'Chất thải nguy hại' },
  unknown: { label: 'Chưa xác định thùng', detail: 'Chưa có thông tin phân loại' },
}
export function binKey(value?: string | null): BinKey {
  return value === 'yellow_sharps' || value === 'yellow_infectious' || value === 'black_hazardous' ? value : 'unknown'
}
export function BinIcon({ kind }: { kind: BinKey }): ReactNode {
  return <span className={'bin-icon ' + kind} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {kind === 'yellow_sharps' ? <><path d="M4 7h16l-1 13H5L4 7ZM3 7V5h18v2M9 5V3h6v2"/><path d="M12 10v4m0 3h.01"/></> : kind === 'yellow_infectious' ? <><circle cx="12" cy="12" r="2"/><path d="M12 10a4 4 0 1 1 4-6M10.3 13a4 4 0 1 1-5.2-2.3M13.7 13a4 4 0 1 0 5.2-2.3"/></> : kind === 'black_hazardous' ? <><path d="m12 3 9 16H3L12 3Z"/><path d="M12 9v4m0 3h.01"/></> : <><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.3 2.3 0 1 1 3.7 1.8c-1 .7-1.5 1.2-1.5 2.2m0 3h.01"/></>}
  </svg></span>
}
