<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TopNav from '../components/layout/TopNav.vue'
import ChatPanel from '../components/chat/ChatPanel.vue'
import { mainNavLinks } from '../constants/mainNav'
import { useChatStore } from '../stores/chat'

const navLinks = mainNavLinks
const route = useRoute()
const router = useRouter()
const chat = useChatStore()
const loading = ref(false)
const loadError = ref('')
const deals = ref([])
const filterDropdownOpen = ref('')
const filters = ref({
  name: '',
  dateFrom: '',
  dateTo: '',
  sellers: [],
  buyers: [],
  creators: [],
  statuses: [],
})
const filterSearch = ref({
  sellers: '',
  buyers: '',
  creators: '',
  statuses: '',
})

const statusClassByName = (value) => {
  const normalized = String(value || '').toLowerCase()
  if (normalized.includes('заверш')) return 'status-completed'
  if (normalized.includes('отклон')) return 'status-rejected'
  if (normalized.includes('процесс') || normalized.includes('коммерчес')) return 'status-progress'
  return 'status-new'
}

const formatDate = (value) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('ru-RU')
}

const formatSum = (value) => {
  if (!value) return '—'
  return new Intl.NumberFormat('ru-RU', {
    style: 'decimal',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value) + ' ₽'
}

const formatMoney = (v) =>
  new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) + ' ₽'

const rows = computed(() =>
  deals.value.map((deal, index) => ({
    order: index + 1,
    id: String(deal?.id || ''),
    name: String(deal?.name || '—'),
    seller: String(deal?.counterparties_from_name || '—'),
    buyer: String(deal?.counterparties_to_name || '—'),
    creator: String(deal?.created_by_user?.short_fio || deal?.created_by || '—'),
    createdAt: String(deal?.created_at || ''),
    date: String(deal?.date || ''),
    dateEvent: String(deal?.date_event || ''),
    dateCompleted: String(deal?.date_completed || ''),
    statusName: String(deal?.status_name || '—'),
    statusClass: statusClassByName(deal?.status_name),
    sumDeal: Number(deal?.sum_deal) || 0,
    netProfit: Number(deal?.net_profit) || 0,
    paymentMode: String(deal?.payment_mode || 'cash'),
    paymentModeLabel: deal?.payment_mode === 'non-cash' ? 'Безналичный' : 'Наличные',
    chat_id: deal?.chat_id || null,
  })),
)

const sellerOptions = computed(() => [...new Set(rows.value.map((row) => row.seller).filter((v) => v && v !== '—'))].sort((a, b) => a.localeCompare(b, 'ru')))
const buyerOptions = computed(() => [...new Set(rows.value.map((row) => row.buyer).filter((v) => v && v !== '—'))].sort((a, b) => a.localeCompare(b, 'ru')))
const creatorOptions = computed(() => [...new Set(rows.value.map((row) => row.creator).filter((v) => v && v !== '—'))].sort((a, b) => a.localeCompare(b, 'ru')))
const statusOptions = computed(() => [...new Set(rows.value.map((row) => row.statusName).filter((v) => v && v !== '—'))].sort((a, b) => a.localeCompare(b, 'ru')))
const searchedSellerOptions = computed(() => sellerOptions.value.filter((v) => v.toLowerCase().includes(String(filterSearch.value.sellers || '').trim().toLowerCase())))
const searchedBuyerOptions = computed(() => buyerOptions.value.filter((v) => v.toLowerCase().includes(String(filterSearch.value.buyers || '').trim().toLowerCase())))
const searchedCreatorOptions = computed(() => creatorOptions.value.filter((v) => v.toLowerCase().includes(String(filterSearch.value.creators || '').trim().toLowerCase())))
const searchedStatusOptions = computed(() => statusOptions.value.filter((v) => v.toLowerCase().includes(String(filterSearch.value.statuses || '').trim().toLowerCase())))

const filteredRows = computed(() => {
  const sellerSet = new Set(filters.value.sellers)
  const buyerSet = new Set(filters.value.buyers)
  const creatorSet = new Set(filters.value.creators)
  const statusSet = new Set(filters.value.statuses)
  const nameQ = String(filters.value.name || '').trim().toLowerCase()
  const from = filters.value.dateFrom
  const to = filters.value.dateTo
  return rows.value.filter((row) => {
    if (nameQ && !String(row.name || '').toLowerCase().includes(nameQ)) return false
    if (sellerSet.size > 0 && !sellerSet.has(row.seller)) return false
    if (buyerSet.size > 0 && !buyerSet.has(row.buyer)) return false
    if (creatorSet.size > 0 && !creatorSet.has(row.creator)) return false
    if (statusSet.size > 0 && !statusSet.has(row.statusName)) return false
    if (from && row.createdAt && new Date(row.createdAt) < new Date(from)) return false
    if (to && row.createdAt && new Date(row.createdAt) > new Date(to + 'T23:59:59')) return false
    return true
  })
})

// ── Checkboxes ────────────────────────────────────────────────────────────────
const selectedIds = ref(new Set())
const allVisibleChecked = computed(() =>
  filteredRows.value.length > 0 && filteredRows.value.every(r => selectedIds.value.has(r.id))
)
const toggleAll = () => {
  const ids = new Set(selectedIds.value)
  if (allVisibleChecked.value) {
    filteredRows.value.forEach(r => ids.delete(r.id))
  } else {
    filteredRows.value.forEach(r => ids.add(r.id))
  }
  selectedIds.value = ids
}
const toggleRow = (id) => {
  const ids = new Set(selectedIds.value)
  if (ids.has(id)) ids.delete(id)
  else ids.add(id)
  selectedIds.value = ids
}
const selectedRows = computed(() => filteredRows.value.filter(r => selectedIds.value.has(r.id)))

// ── Canvas pie chart helper ───────────────────────────────────────────────────
function drawPieChart(title, segments) {
  const COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#8b5cf6', '#dc2626', '#06b6d4']
  const total = segments.reduce((s, seg) => s + seg.value, 0)

  // Layout constants
  const W = 680
  const TITLE_H = 44
  const PIE_R = 130
  const PIE_CX = 180
  const PIE_CY = TITLE_H + PIE_R + 24
  const LEG_X = PIE_CX + PIE_R + 36        // legend starts right of pie
  const LEG_LINE_H = 56                     // height per legend item
  const LEG_W = W - LEG_X - 16             // available legend width
  const H = Math.max(PIE_CY + PIE_R + 28, TITLE_H + segments.length * LEG_LINE_H + 28)

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  // Background
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)

  // Title
  ctx.fillStyle = '#0f172a'
  ctx.font = 'bold 16px Arial'
  ctx.textAlign = 'center'
  ctx.fillText(title, W / 2, 28)

  // Separator line under title
  ctx.strokeStyle = '#e2e8f0'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(16, TITLE_H - 6)
  ctx.lineTo(W - 16, TITLE_H - 6)
  ctx.stroke()

  if (total === 0) {
    ctx.fillStyle = '#94a3b8'
    ctx.font = '14px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('Нет данных', PIE_CX, PIE_CY)
    return canvas.toDataURL('image/png')
  }

  // ── Pie slices ──────────────────────────────────────────────────────────────
  let startAngle = -Math.PI / 2
  segments.forEach((seg, i) => {
    const angle = (seg.value / total) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(PIE_CX, PIE_CY)
    ctx.arc(PIE_CX, PIE_CY, PIE_R, startAngle, startAngle + angle)
    ctx.closePath()
    ctx.fillStyle = COLORS[i % COLORS.length]
    ctx.fill()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2.5
    ctx.stroke()

    // % label inside slice (only if slice is big enough)
    const pct = (seg.value / total) * 100
    if (pct >= 8) {
      const midAngle = startAngle + angle / 2
      const lx = PIE_CX + Math.cos(midAngle) * (PIE_R * 0.62)
      const ly = PIE_CY + Math.sin(midAngle) * (PIE_R * 0.62)
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 14px Arial'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`${pct.toFixed(1)}%`, lx, ly)
    }
    startAngle += angle
  })

  // Pie border
  ctx.beginPath()
  ctx.arc(PIE_CX, PIE_CY, PIE_R, 0, Math.PI * 2)
  ctx.strokeStyle = '#e2e8f0'
  ctx.lineWidth = 1
  ctx.stroke()

  // ── Legend (right side, stacked vertically) ─────────────────────────────────
  ctx.textBaseline = 'alphabetic'
  const legStartY = TITLE_H + 12
  segments.forEach((seg, i) => {
    const y = legStartY + i * LEG_LINE_H
    const pct = ((seg.value / total) * 100).toFixed(1)
    const color = COLORS[i % COLORS.length]

    // Color swatch
    const swatchSize = 14
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.roundRect(LEG_X, y + 2, swatchSize, swatchSize, 3)
    ctx.fill()

    // Label (способ оплаты)
    ctx.fillStyle = '#475569'
    ctx.font = '12px Arial'
    ctx.textAlign = 'left'
    ctx.fillText(seg.label, LEG_X + swatchSize + 8, y + 13)

    // Amount
    ctx.fillStyle = '#0f172a'
    ctx.font = 'bold 14px Arial'
    ctx.fillText(seg.formatted, LEG_X + swatchSize + 8, y + 31)

    // Percentage badge (right-aligned in legend area)
    const pctText = `${pct}%`
    ctx.font = 'bold 13px Arial'
    const pctW = ctx.measureText(pctText).width + 14
    const pctX = LEG_X + LEG_W - pctW
    const pctY = y + 4

    ctx.fillStyle = color + '22'  // 13% opacity background
    ctx.beginPath()
    ctx.roundRect(pctX, pctY, pctW, 20, 4)
    ctx.fill()

    ctx.fillStyle = color
    ctx.textAlign = 'center'
    ctx.fillText(pctText, pctX + pctW / 2, pctY + 14)

    // Separator line between legend items
    if (i < segments.length - 1) {
      ctx.strokeStyle = '#f1f5f9'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(LEG_X, y + LEG_LINE_H - 4)
      ctx.lineTo(W - 16, y + LEG_LINE_H - 4)
      ctx.stroke()
    }
  })

  return canvas.toDataURL('image/png')
}

// ── Report generation ─────────────────────────────────────────────────────────
const generateReport = async () => {
  const rows = selectedRows.value
  if (!rows.length) return

  const ExcelJS = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Supply'

  const ws = wb.addWorksheet('Отчёт по сделкам', {
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.5, right: 0.5, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
    },
  })

  // Columns — widths will be auto-fitted after all rows are added
  ws.columns = Array.from({ length: 10 }, () => ({ width: 10 }))

  // Title
  const reportTitle = ws.addRow(['Отчёт по сделкам'])
  ws.mergeCells(`A${reportTitle.number}:J${reportTitle.number}`)
  reportTitle.getCell(1).font = { bold: true, size: 14 }
  reportTitle.getCell(1).alignment = { horizontal: 'center' }
  reportTitle.height = 24

  // Date range subtitle
  const dateRange = [filters.value.dateFrom, filters.value.dateTo].filter(Boolean)
  if (dateRange.length) {
    const subRow = ws.addRow([`Период: ${dateRange.join(' — ')}`])
    ws.mergeCells(`A${subRow.number}:J${subRow.number}`)
    subRow.getCell(1).font = { size: 11, color: { argb: 'FF64748B' } }
    subRow.getCell(1).alignment = { horizontal: 'center' }
  }

  ws.addRow([]) // spacer

  // Header
  const headerRow = ws.addRow(['№', 'Название сделки', 'Продавец', 'Покупатель', 'Создатель', 'Дата создания', 'Сумма сделки', 'Чистая прибыль', 'Способ оплаты', 'Статус'])
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FF1E293B' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    }
  })
  headerRow.height = 32

  // Data rows
  let totalSum = 0
  let totalProfit = 0
  rows.forEach((row, idx) => {
    const dr = ws.addRow([
      idx + 1,
      row.name,
      row.seller,
      row.buyer,
      row.creator,
      formatDate(row.createdAt),
      row.sumDeal,
      row.netProfit,
      row.paymentModeLabel,
      row.statusName,
    ])
    totalSum += row.sumDeal
    totalProfit += row.netProfit

    dr.eachCell((cell, colNum) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      }
      if (colNum === 1) cell.alignment = { horizontal: 'center' }
      if (colNum === 7 || colNum === 8) {
        cell.numFmt = '#,##0.00 ₽'
        cell.alignment = { horizontal: 'right' }
      }
      if (colNum === 9) cell.alignment = { horizontal: 'center' }
    })
    dr.height = 22
    // Zebra
    if (idx % 2 === 1) {
      dr.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
      })
    }
  })

  // Total row
  const totalRow = ws.addRow(['', 'ИТОГО', '', '', '', '', totalSum, totalProfit, '', ''])
  totalRow.eachCell((cell, colNum) => {
    cell.font = { bold: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } }
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF2563EB' } },
      bottom: { style: 'medium', color: { argb: 'FF2563EB' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    }
    if (colNum === 7 || colNum === 8) {
      cell.numFmt = '#,##0.00 ₽'
      cell.alignment = { horizontal: 'right' }
    }
  })
  totalRow.height = 26

  ws.addRow([])
  ws.addRow([])

  // ── Group by payment mode ─────────────────────────────────────────────────
  const byMode = {}
  rows.forEach((r) => {
    const key = r.paymentModeLabel
    if (!byMode[key]) byMode[key] = { sum: 0, profit: 0 }
    byMode[key].sum += r.sumDeal
    byMode[key].profit += r.netProfit
  })
  const modeKeys = Object.keys(byMode)

  // ── Summary table header ──────────────────────────────────────────────────
  const summaryHeaderStyle = (cell) => {
    cell.font = { bold: true, color: { argb: 'FF1E293B' }, size: 11 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    }
  }
  const summaryCellStyle = (cell, isNum = false) => {
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    }
    cell.alignment = { horizontal: isNum ? 'right' : 'left', vertical: 'middle' }
    if (isNum) cell.numFmt = '#,##0.00 ₽'
  }

  // Table 1 — суммы по способу оплаты (cols A-D)
  // Table 2 — прибыль по способу оплаты (cols F-I)
  const tblRow1 = ws.addRow([
    'Способ оплаты', 'Сумма сделок', '% от итого', '',
    '', 'Способ оплаты', 'Чистая прибыль', '% от итого',
  ])
  tblRow1.height = 26
  ;[1, 2, 3, 6, 7, 8].forEach(c => summaryHeaderStyle(tblRow1.getCell(c)))

  let sumTableTotal = 0
  let profitTableTotal = 0
  modeKeys.forEach((k) => { sumTableTotal += byMode[k].sum; profitTableTotal += byMode[k].profit })

  modeKeys.forEach((k, idx) => {
    const pctSum = sumTableTotal > 0 ? ((byMode[k].sum / sumTableTotal) * 100).toFixed(1) + '%' : '0.0%'
    const pctProfit = profitTableTotal !== 0 ? ((byMode[k].profit / Math.abs(profitTableTotal)) * 100).toFixed(1) + '%' : '0.0%'
    const dr = ws.addRow([
      k, byMode[k].sum, pctSum, '',
      '', k, byMode[k].profit, pctProfit,
    ])
    dr.height = 22
    summaryCellStyle(dr.getCell(1))
    summaryCellStyle(dr.getCell(2), true)
    summaryCellStyle(dr.getCell(3))
    dr.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' }
    summaryCellStyle(dr.getCell(6))
    summaryCellStyle(dr.getCell(7), true)
    summaryCellStyle(dr.getCell(8))
    dr.getCell(8).alignment = { horizontal: 'center', vertical: 'middle' }
    // Zebra
    if (idx % 2 === 1) {
      [1, 2, 3, 6, 7, 8].forEach(c => {
        dr.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
      })
    }
  })

  // Total row for summary tables
  const sumTotalRow = ws.addRow([
    'ИТОГО', sumTableTotal, '100%', '',
    '', 'ИТОГО', profitTableTotal, '100%',
  ])
  sumTotalRow.height = 24
  ;[1, 2, 3, 6, 7, 8].forEach(c => {
    const cell = sumTotalRow.getCell(c)
    cell.font = { bold: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } }
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF2563EB' } },
      bottom: { style: 'medium', color: { argb: 'FF2563EB' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    }
    if (c === 2 || c === 7) { cell.numFmt = '#,##0.00 ₽'; cell.alignment = { horizontal: 'right' } }
    if (c === 3 || c === 8) cell.alignment = { horizontal: 'center' }
  })

  ws.addRow([])
  ws.addRow([])

  // ── Pie charts ────────────────────────────────────────────────────────────
  const chart1Data = modeKeys.map((k) => ({ label: k, value: byMode[k].sum, formatted: formatMoney(byMode[k].sum) }))
  const chart1Url = drawPieChart('Сумма сделок по способу оплаты', chart1Data)

  const chart2Data = modeKeys.map((k) => ({ label: k, value: Math.max(0, byMode[k].profit), formatted: formatMoney(byMode[k].profit) }))
  const chart2Url = drawPieChart('Чистая прибыль по способу оплаты', chart2Data)

  const toBuffer = (dataUrl) => {
    const base64 = dataUrl.split(',')[1]
    const bin = atob(base64)
    const arr = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
    return arr.buffer
  }

  const img1Id = wb.addImage({ buffer: toBuffer(chart1Url), extension: 'png' })
  const img2Id = wb.addImage({ buffer: toBuffer(chart2Url), extension: 'png' })

  const chartStartRow = ws.lastRow.number + 1
  const chartH = Math.max(280, 44 + modeKeys.length * 56 + 28)   // match canvas height
  ws.addImage(img1Id, {
    tl: { col: 0, row: chartStartRow - 1 },
    ext: { width: 680, height: chartH },
  })
  ws.addImage(img2Id, {
    tl: { col: 5, row: chartStartRow - 1 },
    ext: { width: 680, height: chartH },
  })

  // Reserve rows for images (~21px per row)
  const rowsNeeded = Math.ceil(chartH / 21) + 2
  for (let i = 0; i < rowsNeeded; i++) ws.addRow([])

  // ── Auto-fit column widths based on all cell content ─────────────────────
  // Approximate char widths: number cells use formatted string length
  const MIN_COL_W = 8
  const MAX_COL_W = 55
  const PADDING = 3
  ws.columns.forEach((col) => {
    let maxLen = 0
    col.eachCell({ includeEmpty: false }, (cell) => {
      let text = ''
      if (cell.value === null || cell.value === undefined) return
      if (typeof cell.value === 'number') {
        // Use formatted string length (rough estimate for currency)
        text = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2 }).format(cell.value) + ' ₽'
      } else if (cell.value instanceof Date) {
        text = cell.value.toLocaleDateString('ru-RU')
      } else {
        text = String(cell.value)
      }
      // Bold text is ~1.15× wider
      const mult = cell.font?.bold ? 1.15 : 1
      maxLen = Math.max(maxLen, Math.ceil(text.length * mult))
    })
    col.width = Math.min(Math.max(maxLen + PADDING, MIN_COL_W), MAX_COL_W)
  })

  // ── Auto-fit row heights based on content length vs column width ──────────
  ws.eachRow((row) => {
    // Skip rows that already have an explicit height set (title, header, total)
    if (row.height && row.height > 24) return
    let maxLines = 1
    row.eachCell({ includeEmpty: false }, (cell, colNum) => {
      if (!cell.alignment?.wrapText) return
      const colWidth = ws.getColumn(colNum).width || 20
      const text = String(cell.value || '')
      const lines = Math.ceil(text.length / colWidth) || 1
      maxLines = Math.max(maxLines, lines)
    })
    if (maxLines > 1) row.height = Math.min(maxLines * 15, 90)
  })

  // Save
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Отчёт_сделки_${new Date().toISOString().slice(0, 10)}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

const toggleFilterDropdown = (key) => {
  filterDropdownOpen.value = filterDropdownOpen.value === key ? '' : key
  if (filterDropdownOpen.value !== key && filterSearch.value[key] != null) {
    filterSearch.value[key] = ''
  }
}

const toggleMultiFilterValue = (key, value) => {
  const current = new Set(filters.value[key] || [])
  if (current.has(value)) current.delete(value)
  else current.add(value)
  filters.value = {
    ...filters.value,
    [key]: Array.from(current),
  }
}

const resetFilters = () => {
  filters.value = {
    name: '',
    dateFrom: '',
    dateTo: '',
    sellers: [],
    buyers: [],
    creators: [],
    statuses: [],
  }
  filterSearch.value = {
    sellers: '',
    buyers: '',
    creators: '',
    statuses: '',
  }
  filterDropdownOpen.value = ''
}

const onWindowMouseDown = (event) => {
  const target = event?.target
  if (!(target instanceof Element) || !target.closest('.multi-filter')) {
    filterDropdownOpen.value = ''
  }
}

const openDeal = (dealId) => {
  router.push({
    path: `/deals/${encodeURIComponent(String(dealId))}`,
    query: { back: route.fullPath },
  })
}

const createDeal = async () => {
  try {
    const res = await fetch('/apisup/supply/deals', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Новая сделка',
        status_id: '662ce068-3fc1-11f1-b298-bc241127d0bd',
      }),
    })
    if (!res.ok) throw new Error('deal create failed')
    const created = await res.json()
    const dealId = String(created?.id || '')
    if (dealId) {
      router.push(`/deals/${encodeURIComponent(dealId)}`)
      return
    }
    await loadDeals()
  } catch {
    loadError.value = 'Не удалось создать сделку.'
  }
}

const loadDeals = async () => {
  loading.value = true
  loadError.value = ''
  try {
    const res = await fetch('/apisup/supply/deals', { credentials: 'include' })
    if (!res.ok) throw new Error('deals load failed')
    const payload = await res.json()
    deals.value = Array.isArray(payload) ? payload : (payload?.items || [])
    nextTick(() => {
      for (const deal of deals.value) {
        if (deal.chat_id) chat.fetchBadge(deal.chat_id)
      }
    })
  } catch {
    deals.value = []
    loadError.value = 'Не удалось загрузить сделки.'
  } finally {
    loading.value = false
  }
}

const getBadge = (chatId) => {
  if (!chatId) return null
  const b = chat.badges[chatId]
  return b && b.mention ? 'mention' : b?.unread ? 'unread' : null
}

const handleChatOpen = ({ chatId, dealId, name }) => {
  chat.openPanel('deal', String(dealId), chatId, name)
}

const handleCloseChat = () => {
  const chatId = chat.currentChatId
  chat.closePanel()
  if (chatId) chat.refreshBadge(chatId)
}

const DEALS_SCROLL_KEY = 'deals-registry-scroll'

const scheduleScrollRestore = (key) => {
  const saved = sessionStorage.getItem(key)
  if (!saved) return
  const top = Number(saved)
  const tryScroll = (attemptsLeft) => {
    const pageHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)
    if (pageHeight >= top + window.innerHeight || attemptsLeft <= 0) {
      window.scrollTo(0, top)
      document.documentElement.scrollTop = top
      document.body.scrollTop = top
      sessionStorage.removeItem(key)
    } else {
      setTimeout(() => tryScroll(attemptsLeft - 1), 60)
    }
  }
  nextTick(() => nextTick(() => tryScroll(10)))
}

onMounted(() => {
  window.addEventListener('mousedown', onWindowMouseDown)
  loadDeals().then(() => scheduleScrollRestore(DEALS_SCROLL_KEY))
})

onBeforeUnmount(() => {
  window.removeEventListener('mousedown', onWindowMouseDown)
  const scrollTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop
  sessionStorage.setItem(DEALS_SCROLL_KEY, String(scrollTop))
})
</script>

<template>
  <div class="layout-shell">
    <TopNav :links="navLinks" />

    <main class="page-shell">
      <header class="page-head">
        <div>
          <p class="eyebrow">Коммерческий блок</p>
          <h1>Реестр сделок</h1>
        </div>
        <div class="head-actions">
          <button
            type="button"
            class="report-btn"
            :disabled="!selectedRows.length"
            @click="generateReport"
          >
            Сформировать отчёт{{ selectedRows.length ? ` (${selectedRows.length})` : '' }}
          </button>
          <button type="button" class="primary-btn" @click="createDeal">Создать сделку</button>
        </div>
      </header>

      <section class="registry-card">
        <div class="registry-filters">
          <input v-model="filters.name" class="form-input date-input" type="text" placeholder="Наименование сделки">
          <input v-model="filters.dateFrom" class="form-input date-input" type="date" placeholder="От">
          <input v-model="filters.dateTo" class="form-input date-input" type="date" placeholder="До">

          <div class="multi-filter">
            <button class="multi-filter-btn" type="button" @click.stop="toggleFilterDropdown('sellers')">
              {{ filters.sellers.length ? `Продавец (${filters.sellers.length})` : 'Продавец' }}
            </button>
            <div v-if="filterDropdownOpen === 'sellers'" class="multi-filter-list">
              <input v-model="filterSearch.sellers" class="multi-filter-search" type="text" placeholder="Поиск...">
              <button v-for="item in searchedSellerOptions" :key="`seller-${item}`" class="multi-filter-item" type="button" @click.stop="toggleMultiFilterValue('sellers', item)">
                <input type="checkbox" :checked="filters.sellers.includes(item)"> <span>{{ item }}</span>
              </button>
            </div>
          </div>

          <div class="multi-filter">
            <button class="multi-filter-btn" type="button" @click.stop="toggleFilterDropdown('buyers')">
              {{ filters.buyers.length ? `Покупатель (${filters.buyers.length})` : 'Покупатель' }}
            </button>
            <div v-if="filterDropdownOpen === 'buyers'" class="multi-filter-list">
              <input v-model="filterSearch.buyers" class="multi-filter-search" type="text" placeholder="Поиск...">
              <button v-for="item in searchedBuyerOptions" :key="`buyer-${item}`" class="multi-filter-item" type="button" @click.stop="toggleMultiFilterValue('buyers', item)">
                <input type="checkbox" :checked="filters.buyers.includes(item)"> <span>{{ item }}</span>
              </button>
            </div>
          </div>

          <div class="multi-filter">
            <button class="multi-filter-btn" type="button" @click.stop="toggleFilterDropdown('creators')">
              {{ filters.creators.length ? `Создатель (${filters.creators.length})` : 'Создатель' }}
            </button>
            <div v-if="filterDropdownOpen === 'creators'" class="multi-filter-list">
              <input v-model="filterSearch.creators" class="multi-filter-search" type="text" placeholder="Поиск...">
              <button v-for="item in searchedCreatorOptions" :key="`creator-${item}`" class="multi-filter-item" type="button" @click.stop="toggleMultiFilterValue('creators', item)">
                <input type="checkbox" :checked="filters.creators.includes(item)"> <span>{{ item }}</span>
              </button>
            </div>
          </div>

          <div class="multi-filter">
            <button class="multi-filter-btn" type="button" @click.stop="toggleFilterDropdown('statuses')">
              {{ filters.statuses.length ? `Статус (${filters.statuses.length})` : 'Статус' }}
            </button>
            <div v-if="filterDropdownOpen === 'statuses'" class="multi-filter-list">
              <input v-model="filterSearch.statuses" class="multi-filter-search" type="text" placeholder="Поиск...">
              <button v-for="item in searchedStatusOptions" :key="`status-${item}`" class="multi-filter-item" type="button" @click.stop="toggleMultiFilterValue('statuses', item)">
                <input type="checkbox" :checked="filters.statuses.includes(item)"> <span>{{ item }}</span>
              </button>
            </div>
          </div>

          <button type="button" class="reset-btn" @click="resetFilters">Сбросить</button>
        </div>

        <table class="registry-table">
          <colgroup>
            <col class="col-check">
            <col class="col-id">
            <col>
            <col class="col-party">
            <col class="col-party">
            <col class="col-creator">
            <col class="col-dates">
            <col class="col-sum">
            <col class="col-status">
          </colgroup>
          <thead>
            <tr>
              <th class="th-check">
                <input type="checkbox" :checked="allVisibleChecked" @change="toggleAll">
              </th>
              <th>№</th>
              <th>Сделка</th>
              <th>Продавец</th>
              <th>Покупатель</th>
              <th>Создатель</th>
              <th>Даты</th>
              <th class="th-num">Сумма</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in filteredRows" :key="row.id" :class="{ 'row-selected': selectedIds.has(row.id) }">
              <td class="td-check" @click.stop>
                <input type="checkbox" :checked="selectedIds.has(row.id)" @change="toggleRow(row.id)">
              </td>
              <td class="mono">
                <a href="#" class="deal-link" @click.prevent="openDeal(row.id)">{{ row.order }}</a>
              </td>
              <td>
                <div class="deal-name">{{ row.name }}</div>
                <button
                  class="deal-chat-btn"
                  type="button"
                  title="Чат сделки"
                  @click.stop="handleChatOpen({ chatId: row.chat_id, dealId: row.id, name: row.name })"
                >
                  <span class="deal-chat-icon-wrap">
                    <i class="fas fa-comment-dots"></i>
                    <span v-if="row.chat_id && getBadge(row.chat_id)" class="deal-chat-badge badge-red"></span>
                  </span>
                </button>
              </td>
              <td>{{ row.seller }}</td>
              <td>{{ row.buyer }}</td>
              <td>{{ row.creator }}</td>
              <td>
                <div class="date-stack">
                  <span>Создана: {{ formatDate(row.createdAt) }}</span>
                  <span v-if="row.date">Сделка: {{ formatDate(row.date) }}</span>
                  <span v-if="row.dateEvent">Проведена: {{ formatDate(row.dateEvent) }}</span>
                  <span v-if="row.dateCompleted">Завершена: {{ formatDate(row.dateCompleted) }}</span>
                </div>
              </td>
              <td class="mono">{{ formatSum(row.sumDeal) }}</td>
              <td>
                <span class="status-chip" :class="row.statusClass">
                  {{ row.statusName }}
                </span>
              </td>
            </tr>
            <tr v-if="loading">
              <td colspan="9" class="empty-state">Загружаем сделки...</td>
            </tr>
            <tr v-else-if="loadError">
              <td colspan="9" class="empty-state">{{ loadError }}</td>
            </tr>
            <tr v-else-if="!filteredRows.length">
              <td colspan="9" class="empty-state">Сделок пока нет.</td>
            </tr>
          </tbody>
        </table>
      </section>
    </main>

    <ChatPanel v-if="chat.panelOpen" @close="handleCloseChat" />
  </div>
</template>

<style scoped>
.page-shell {
  padding: 24px;
}

.form-input {
  width: 100%;
  min-height: 40px;
  border-radius: 10px;
  border: 1px solid var(--border-light);
  background: var(--bg-body);
  color: var(--text-primary);
  padding: 0 12px;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
}

.form-input:focus {
  border-color: var(--brand-primary);
  box-shadow: 0 0 0 2px var(--brand-soft);
  background: var(--bg-surface);
}

.page-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.head-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.eyebrow {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--brand-primary);
}

h1 {
  margin: 0;
  font-size: 28px;
  line-height: 1.1;
}

.primary-btn {
  border: none;
  border-radius: 12px;
  padding: 11px 16px;
  background: var(--brand-primary);
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}

.primary-btn:hover {
  background: var(--brand-hover);
}

.report-btn {
  border: none;
  border-radius: 12px;
  padding: 11px 16px;
  background: #16a34a;
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}

.report-btn:hover:not(:disabled) {
  background: #15803d;
}

.report-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.registry-card {
  border: 1px solid var(--border-light);
  border-radius: 18px;
  background: var(--bg-surface);
  overflow: hidden;
}

.registry-filters {
  display: grid;
  grid-template-columns: minmax(200px, 1fr) 150px 150px repeat(4, minmax(160px, 1fr)) 120px;
  gap: 12px;
  padding: 14px;
  border-bottom: 1px solid var(--border-light);
  background: #f8fafc;
}

.date-input,
.multi-filter-btn,
.reset-btn {
  height: 40px;
}

.date-input {
  border: 1px solid var(--border-light);
  border-radius: 10px;
  padding: 0 12px;
  background: #fff;
  color: var(--text-primary);
}

.multi-filter {
  position: relative;
}

.multi-filter-btn {
  width: 100%;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background: #fff;
  padding: 0 12px;
  text-align: left;
  cursor: pointer;
  font-weight: 600;
  color: var(--text-primary);
}

.multi-filter-list {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: 20;
  max-height: 260px;
  overflow: auto;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.12);
}

.multi-filter-search {
  width: calc(100% - 16px);
  margin: 8px;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  padding: 8px 10px;
  background: #fff;
}

.multi-filter-item {
  width: 100%;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  text-align: left;
  cursor: pointer;
}

.multi-filter-item:hover {
  background: #f1f5f9;
}

.reset-btn {
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background: #fff;
  cursor: pointer;
  font-weight: 600;
}

.registry-table {
  width: 100%;
  border-collapse: collapse;
}

.registry-table th,
.registry-table td {
  padding: 16px 18px;
  border: 1px solid var(--border-light);
  text-align: left;
  vertical-align: top;
}

.registry-table th {
  background: #f8fafc;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-secondary);
}

.registry-table tbody tr:last-child td {
  border-bottom: none;
}

.col-check {
  width: 44px;
}

.th-check,
.td-check {
  text-align: center;
  padding: 8px;
}

.row-selected td {
  background: #eff6ff !important;
}

.col-id {
  width: 120px;
}

.col-party {
  width: 220px;
}

.col-creator {
  width: 200px;
}

.col-dates {
  width: 180px;
}

.col-sum {
  width: 140px;
}

.col-status {
  width: 180px;
}

.mono {
  font-family: 'JetBrains Mono', monospace;
}

.deal-link {
  color: var(--brand-primary);
  text-decoration: none;
  font-weight: 700;
}

.deal-name {
  margin-bottom: 4px;
}

.deal-chat-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 2px;
  color: var(--text-secondary, #64748b);
}

.deal-chat-btn:hover {
  color: var(--brand-primary, #3b82f6);
}

.deal-chat-icon-wrap {
  position: relative;
  display: inline-flex;
}

.deal-chat-badge {
  position: absolute;
  top: -2px;
  right: -4px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.deal-chat-badge.badge-red {
  background: #ef4444;
}

.date-stack {
  display: grid;
  gap: 4px;
  color: var(--text-secondary);
  font-size: 13px;
}

.status-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 7px 14px;
  min-width: 220px;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.status-new {
  background: #dbeafe;
  color: #1d4ed8;
}

.status-progress {
  background: #fef3c7;
  color: #b45309;
}

.status-completed {
  background: #dcfce7;
  color: #15803d;
}

.status-rejected {
  background: #fee2e2;
  color: #b91c1c;
}

.empty-state {
  text-align: center;
  color: var(--text-secondary);
  padding: 28px 18px;
}

@media (max-width: 1320px) {
  .registry-filters {
    grid-template-columns: repeat(2, minmax(200px, 1fr));
  }
}
</style>
