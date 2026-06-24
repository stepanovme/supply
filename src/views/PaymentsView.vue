<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import TopNav from '../components/layout/TopNav.vue'
import { mainNavLinks } from '../constants/mainNav'
import { priorityStyle } from '../utils/priorityColor'

const navLinks = mainNavLinks
const router = useRouter()

const loading = ref(false)
const loadError = ref('')
const payments = ref([])

// ── View mode ─────────────────────────────────────────────
// 'all' | 'recent-paid'
const viewMode = ref('all')

// ── Date filters ──────────────────────────────────────────
const planDateFrom = ref('')
const planDateTo = ref('')
const paidDateFrom = ref('')
const paidDateTo = ref('')

// ── Text search ───────────────────────────────────────────
const search = ref('')

// ── Column filter dropdowns ───────────────────────────────
const filterDropdownOpen = ref('')

const activeFilters = ref({
  providers: [],
  payers: [],
  fromBy: [],
  invoiceNums: [],
  planners: [],
  paidBy: [],
  statuses: [],
})

const filterSearch = ref({
  providers: '',
  payers: '',
  fromBy: '',
  invoiceNums: '',
  planners: '',
  paidBy: '',
  statuses: '',
})

// ── Checkboxes ────────────────────────────────────────────
const checkedIds = ref(new Set())

// ── Helpers ───────────────────────────────────────────────
const formatDate = (val) => {
  if (!val) return '—'
  const d = new Date(val)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('ru-RU')
}

const formatMoney = (v) => {
  if (v == null || v === '') return '—'
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) + ' ₽'
}

const userName = (user) => {
  if (!user) return ''
  return [user.surname, user.name, user.patronymic].filter(Boolean).join(' ') || user.id || ''
}

const statusLabel = (p) => {
  if (p.paid != null && Number(p.paid) > 0) return 'Оплачено'
  return 'Запланировано'
}

// ── Map API → rows ────────────────────────────────────────
const rows = computed(() =>
  payments.value.map((item) => {
    const p = item.payment || {}
    const inv = item.invoice || {}
    const sl = statusLabel(p)
    return {
      id: String(p.id || ''),
      datePlan: String(p.date_plan || ''),
      paidAt: p.paid_at ? String(p.paid_at).slice(0, 10) : '',
      value: p.value != null ? Number(p.value) : null,
      paid: p.paid != null ? Number(p.paid) : null,
      paidType: p.paid_type === 'non-cash' ? 'Безналичный' : p.paid_type === 'cash' ? 'Наличные' : '',
      invoiceId: String(inv.id || ''),
      invoiceNum: String(inv.num || ''),
      invoiceDate: inv.date ? String(inv.date).slice(0, 10) : '',
      invoiceTotal: inv.total_amount != null ? Number(inv.total_amount) : null,
      providerName: String(inv.provider_name || '—'),
      payerName: String(inv.payer_name || '—'),
      fromBy: String(inv.from_by_user?.short_fio || ''),
      plannedBy: userName(p.created_by_user) || '—',
      paidBy: userName(p.paid_by_user) || '—',
      statusLabel: sl,
      priority: p.priority ?? null,
      isUnpaid: !(p.paid != null && Number(p.paid) > 0),
    }
  }),
)

// ── Option lists for column filters ──────────────────────
const filterOptions = computed(() => {
  const providers = new Set()
  const payers = new Set()
  const fromBySet = new Set()
  const invoiceNumsSet = new Set()
  const planners = new Set()
  const paidBySet = new Set()
  const statuses = new Set()
  for (const r of rows.value) {
    providers.add(r.providerName)
    payers.add(r.payerName)
    if (r.fromBy) fromBySet.add(r.fromBy)
    if (r.invoiceNum) invoiceNumsSet.add(r.invoiceNum)
    planners.add(r.plannedBy)
    paidBySet.add(r.paidBy)
    statuses.add(r.statusLabel)
  }
  return {
    providers: [...providers].sort(),
    payers: [...payers].sort(),
    fromBy: [...fromBySet].sort(),
    invoiceNums: [...invoiceNumsSet].sort(),
    planners: [...planners].sort(),
    paidBy: [...paidBySet].sort(),
    statuses: [...statuses].sort(),
  }
})

const filteredOptionList = (key) => {
  const q = filterSearch.value[key].toLowerCase()
  return filterOptions.value[key].filter(v => v.toLowerCase().includes(q))
}

// ── Filtered + sorted rows ────────────────────────────────
const filteredRows = computed(() => {
  const q = search.value.toLowerCase()

  let result = rows.value.filter((r) => {
    // recent-paid mode: only paid, sorted desc by paidAt
    if (viewMode.value === 'recent-paid' && !r.paidAt) return false

    // text search
    if (q && ![r.invoiceNum, r.providerName, r.payerName, r.plannedBy, r.paidBy]
      .some(v => v.toLowerCase().includes(q))) return false
    // date plan range
    if (planDateFrom.value && r.datePlan && r.datePlan < planDateFrom.value) return false
    if (planDateTo.value && r.datePlan && r.datePlan > planDateTo.value) return false
    // date paid range
    if (paidDateFrom.value && (!r.paidAt || r.paidAt < paidDateFrom.value)) return false
    if (paidDateTo.value && (!r.paidAt || r.paidAt > paidDateTo.value)) return false
    // column filters
    if (activeFilters.value.providers.length && !activeFilters.value.providers.includes(r.providerName)) return false
    if (activeFilters.value.payers.length && !activeFilters.value.payers.includes(r.payerName)) return false
    if (activeFilters.value.fromBy.length && !activeFilters.value.fromBy.includes(r.fromBy)) return false
    if (activeFilters.value.invoiceNums.length && !activeFilters.value.invoiceNums.includes(r.invoiceNum)) return false
    if (activeFilters.value.planners.length && !activeFilters.value.planners.includes(r.plannedBy)) return false
    if (activeFilters.value.paidBy.length && !activeFilters.value.paidBy.includes(r.paidBy)) return false
    if (activeFilters.value.statuses.length && !activeFilters.value.statuses.includes(r.statusLabel)) return false
    return true
  })

  if (viewMode.value === 'recent-paid') {
    result = [...result].sort((a, b) => (b.paidAt > a.paidAt ? 1 : b.paidAt < a.paidAt ? -1 : 0))
  } else {
    // Sort by priority: unpaid with priority first (ascending), rest after
    result = [...result].sort((a, b) => {
      const ap = a.isUnpaid && a.priority != null ? a.priority : null
      const bp = b.isUnpaid && b.priority != null ? b.priority : null
      if (ap != null && bp != null) return ap - bp
      if (ap != null) return -1
      if (bp != null) return 1
      return 0
    })
  }

  return result
})

// ── Selection helpers ─────────────────────────────────────
const visibleIds = computed(() => filteredRows.value.map(r => r.id))
const checkedAll = computed(() =>
  visibleIds.value.length > 0 && visibleIds.value.every(id => checkedIds.value.has(id)),
)
const toggleAll = (val) => {
  if (val) visibleIds.value.forEach(id => checkedIds.value.add(id))
  else visibleIds.value.forEach(id => checkedIds.value.delete(id))
}
const toggleOne = (id) => {
  if (checkedIds.value.has(id)) checkedIds.value.delete(id)
  else checkedIds.value.add(id)
}

// ── Selection-aware summary ───────────────────────────────
const activeRows = computed(() =>
  checkedIds.value.size > 0
    ? filteredRows.value.filter(r => checkedIds.value.has(r.id))
    : filteredRows.value,
)

const totalPlanned = computed(() => activeRows.value.reduce((s, r) => s + (r.value || 0), 0))
const totalPaid = computed(() => activeRows.value.reduce((s, r) => s + (r.paid || 0), 0))
const selectionLabel = computed(() =>
  checkedIds.value.size > 0 ? `Выбрано: ${checkedIds.value.size}` : `Всего: ${filteredRows.value.length}`,
)

// ── Dropdown helpers ──────────────────────────────────────
const toggleDropdown = (key) => {
  filterDropdownOpen.value = filterDropdownOpen.value === key ? '' : key
}

const toggleFilterOption = (key, val) => {
  const arr = activeFilters.value[key]
  const idx = arr.indexOf(val)
  if (idx >= 0) arr.splice(idx, 1)
  else arr.push(val)
}

const clearFilter = (key) => {
  activeFilters.value[key] = []
  filterSearch.value[key] = ''
}

const hasAnyFilter = computed(() =>
  Object.values(activeFilters.value).some(a => a.length) ||
  planDateFrom.value || planDateTo.value ||
  paidDateFrom.value || paidDateTo.value ||
  search.value,
)

const clearAllFilters = () => {
  search.value = ''
  planDateFrom.value = ''
  planDateTo.value = ''
  paidDateFrom.value = ''
  paidDateTo.value = ''
  for (const k of Object.keys(activeFilters.value)) {
    activeFilters.value[k] = []
    filterSearch.value[k] = ''
  }
}

const closeDropdowns = (e) => {
  if (!(e.target instanceof Element) || !e.target.closest('.filter-dropdown-wrap')) {
    filterDropdownOpen.value = ''
  }
}

// ── Load ──────────────────────────────────────────────────
const load = async () => {
  loading.value = true
  loadError.value = ''
  try {
    const res = await fetch('/apisup/supply/invoices/my/payments', { credentials: 'include' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    payments.value = await res.json()
  } catch (e) {
    loadError.value = 'Не удалось загрузить платежи'
    console.error(e)
  } finally {
    loading.value = false
  }
}

const goToInvoice = (invoiceId) => {
  if (!invoiceId) return
  router.push({ name: 'invoice-detail', params: { invoiceId } })
}

// ── Excel export ──────────────────────────────────────────
const exportLoading = ref(false)

const fmtD = (val) => {
  if (!val) return ''
  const d = new Date(val)
  if (Number.isNaN(d.getTime())) return String(val)
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`
}

const PALETTE = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4','#F97316','#84CC16','#EC4899','#6366F1','#14B8A6','#E11D48']

const drawPie = (slices, title, w = 400, h = 340) => {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, w, h)

  const total = slices.reduce((s, d) => s + d.v, 0)
  if (total === 0) return null

  // title
  ctx.fillStyle = '#1E293B'
  ctx.font = 'bold 15px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(title, w / 2, 22)

  const cx = w / 2, cy = 150, r = 100
  let ang = -Math.PI / 2

  slices.forEach((d, i) => {
    const sweep = (d.v / total) * 2 * Math.PI
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, r, ang, ang + sweep)
    ctx.closePath()
    ctx.fillStyle = PALETTE[i % PALETTE.length]
    ctx.fill()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    ctx.stroke()

    // label inside slice if big enough
    if (sweep > 0.35) {
      const mid = ang + sweep / 2
      const lx = cx + Math.cos(mid) * r * 0.65
      const ly = cy + Math.sin(mid) * r * 0.65
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 11px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const pct = Math.round((d.v / total) * 100)
      ctx.fillText(`${pct}%`, lx, ly)
    }
    ang += sweep
  })

  // legend
  const legendX = 12, legendStartY = cy + r + 18
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  slices.forEach((d, i) => {
    const row = Math.floor(i / 2)
    const col = i % 2
    const lx = legendX + col * (w / 2)
    const ly = legendStartY + row * 20
    ctx.fillStyle = PALETTE[i % PALETTE.length]
    ctx.fillRect(lx, ly - 6, 12, 12)
    ctx.fillStyle = '#334155'
    ctx.font = '10px sans-serif'
    const label = d.label.length > 18 ? d.label.slice(0, 17) + '…' : d.label
    ctx.fillText(label, lx + 16, ly)
  })

  return canvas.toDataURL('image/png').split(',')[1]
}

const applyBorderToRange = (ws, startRow, endRow, startCol, endCol) => {
  const thin = { style: 'thin', color: { argb: 'FFCBD5E1' } }
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      ws.getCell(r, c).border = { top: thin, left: thin, bottom: thin, right: thin }
    }
  }
}

const autoWidth = (ws, startCol, endCol, minW = 10, maxW = 50) => {
  for (let c = startCol; c <= endCol; c++) {
    let max = minW
    ws.getColumn(c).eachCell({ includeEmpty: false }, (cell) => {
      const v = cell.value == null ? '' : String(cell.value)
      if (v.length > max) max = v.length
    })
    ws.getColumn(c).width = Math.min(max + 2, maxW)
  }
}

const buildPivot = (rows, groupKey, label) => {
  const map = new Map()
  for (const r of rows) {
    const key = r[groupKey]
    if (!map.has(key)) map.set(key, { label: key, planned: 0, paid: 0 })
    const e = map.get(key)
    e.planned += r.value || 0
    e.paid += r.paid || 0
  }
  return [...map.values()].sort((a, b) => b.planned - a.planned)
}

const writePivotSheet = async (wb, sheetName, pivotData, colLabel, wb64Planned, wb64Paid) => {
  const ws = wb.addWorksheet(sheetName)

  const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }
  const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
  const TOTAL_FILL  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } }
  const TOTAL_FONT  = { bold: true, size: 11 }
  const numFmt = '#,##0.00 ₽'

  // header
  const hdr = ws.getRow(1)
  hdr.getCell(1).value = colLabel
  hdr.getCell(2).value = 'Запланировано'
  hdr.getCell(3).value = 'Оплачено'
  hdr.getCell(4).value = 'Остаток'
  ;[1,2,3,4].forEach(c => {
    hdr.getCell(c).fill = HEADER_FILL
    hdr.getCell(c).font = HEADER_FONT
    hdr.getCell(c).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  })
  hdr.height = 24

  let rowIdx = 2
  for (const p of pivotData) {
    const row = ws.getRow(rowIdx)
    row.getCell(1).value = p.label
    row.getCell(2).value = p.planned
    row.getCell(3).value = p.paid
    row.getCell(4).value = p.planned - p.paid
    row.getCell(2).numFmt = numFmt
    row.getCell(3).numFmt = numFmt
    row.getCell(4).numFmt = numFmt
    row.getCell(4).font = { color: { argb: p.planned - p.paid > 0 ? 'FFEF4444' : 'FF16A34A' } }
    const evenFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowIdx % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF' } }
    ;[1,2,3,4].forEach(c => { row.getCell(c).fill = evenFill })
    rowIdx++
  }

  // totals
  const totalPlanned = pivotData.reduce((s, p) => s + p.planned, 0)
  const totalPaid    = pivotData.reduce((s, p) => s + p.paid, 0)
  const tRow = ws.getRow(rowIdx)
  tRow.getCell(1).value = 'ИТОГО'
  tRow.getCell(2).value = totalPlanned
  tRow.getCell(3).value = totalPaid
  tRow.getCell(4).value = totalPlanned - totalPaid
  ;[1,2,3,4].forEach(c => { tRow.getCell(c).fill = TOTAL_FILL; tRow.getCell(c).font = TOTAL_FONT })
  tRow.getCell(2).numFmt = numFmt
  tRow.getCell(3).numFmt = numFmt
  tRow.getCell(4).numFmt = numFmt

  applyBorderToRange(ws, 1, rowIdx, 1, 4)
  autoWidth(ws, 1, 4)

  // embed charts
  const chartRow = rowIdx + 2
  if (wb64Planned) {
    const imgIdP = wb.addImage({ base64: wb64Planned, extension: 'png' })
    ws.addImage(imgIdP, { tl: { col: 0, row: chartRow - 1 }, br: { col: 4, row: chartRow + 17 } })
  }
  if (wb64Paid) {
    const imgIdPd = wb.addImage({ base64: wb64Paid, extension: 'png' })
    ws.addImage(imgIdPd, { tl: { col: 5, row: chartRow - 1 }, br: { col: 9, row: chartRow + 17 } })
  }

  ws.views = [{ state: 'frozen', ySplit: 1 }]
}

const exportExcel = async () => {
  exportLoading.value = true
  try {
    const ExcelJS = await import('exceljs')
    const wb = new ExcelJS.Workbook()
    wb.creator = 'Supply'
    wb.created = new Date()

    const data = activeRows.value

    // ─── Sheet 1: Реестр ───────────────────────────────────
    const ws = wb.addWorksheet('Реестр платежей')

    const COLS = [
      { header: 'Дата плана',       key: 'datePlan',     w: 14 },
      { header: 'Дата оплаты',      key: 'paidAt',       w: 14 },
      { header: 'Счёт',             key: 'invoiceNum',   w: 14 },
      { header: 'Поставщик',        key: 'providerName', w: 30 },
      { header: 'Плательщик',       key: 'payerName',    w: 30 },
      { header: 'Сумма план',       key: 'value',        w: 18 },
      { header: 'Сумма факт',       key: 'paid',         w: 18 },
      { header: 'Вид оплаты',       key: 'paidType',     w: 14 },
      { header: 'Кто запланировал', key: 'plannedBy',    w: 24 },
      { header: 'Кто оплатил',      key: 'paidBy',       w: 24 },
      { header: 'Статус',           key: 'statusLabel',  w: 16 },
    ]

    const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }
    const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    const numFmt = '#,##0.00 ₽'

    // title row
    ws.mergeCells(1, 1, 1, COLS.length)
    const titleCell = ws.getCell(1, 1)
    titleCell.value = `Реестр платежей — сформировано ${fmtD(new Date().toISOString())}`
    titleCell.font = { bold: true, size: 13, color: { argb: 'FF1E3A5F' } }
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } }
    ws.getRow(1).height = 28

    // header row
    const hRow = ws.getRow(2)
    COLS.forEach((col, i) => {
      const cell = hRow.getCell(i + 1)
      cell.value = col.header
      cell.fill = HEADER_FILL
      cell.font = HEADER_FONT
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    })
    hRow.height = 28

    // data rows
    data.forEach((r, idx) => {
      const row = ws.getRow(idx + 3)
      const vals = [
        fmtD(r.datePlan), fmtD(r.paidAt), r.invoiceNum,
        r.providerName, r.payerName,
        r.value ?? 0, r.paid ?? 0,
        r.paidType, r.plannedBy, r.paidBy, r.statusLabel,
      ]
      vals.forEach((v, ci) => {
        row.getCell(ci + 1).value = v
      })
      // money columns
      row.getCell(6).numFmt = numFmt
      row.getCell(7).numFmt = numFmt
      // status color
      const sCell = row.getCell(11)
      if (r.statusLabel === 'Оплачено') {
        sCell.font = { color: { argb: 'FF16A34A' }, bold: true }
      } else {
        sCell.font = { color: { argb: 'FFB45309' }, bold: true }
      }
      // zebra
      const fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 === 0 ? 'FFFFFFFF' : 'FFF8FAFC' } }
      COLS.forEach((_, ci) => { row.getCell(ci + 1).fill = fill })
    })

    // total row
    const totalRowN = data.length + 3
    const tRow = ws.getRow(totalRowN)
    ws.mergeCells(totalRowN, 1, totalRowN, 5)
    tRow.getCell(1).value = 'ИТОГО'
    tRow.getCell(6).value = totalPlanned.value
    tRow.getCell(7).value = totalPaid.value
    tRow.getCell(6).numFmt = numFmt
    tRow.getCell(7).numFmt = numFmt
    const totalFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } }
    const totalFont = { bold: true, size: 11, color: { argb: 'FF1E3A5F' } }
    COLS.forEach((_, ci) => {
      tRow.getCell(ci + 1).fill = totalFill
      tRow.getCell(ci + 1).font = totalFont
    })
    tRow.height = 22

    // borders + autowidth
    applyBorderToRange(ws, 2, totalRowN, 1, COLS.length)
    COLS.forEach((col, i) => { ws.getColumn(i + 1).width = col.w })
    autoWidth(ws, 1, COLS.length)

    ws.views = [{ state: 'frozen', ySplit: 2 }]

    // ─── Pivot data ────────────────────────────────────────
    const pivotProvider = buildPivot(data, 'providerName', 'Поставщик')
    const pivotPayer    = buildPivot(data, 'payerName',    'Плательщик')

    // ─── Charts ────────────────────────────────────────────
    const topN = (arr, n = 10) => arr.slice(0, n)

    const b64_prov_planned = drawPie(
      topN(pivotProvider).map(p => ({ label: p.label, v: p.planned })),
      'Запланировано по поставщикам',
    )
    const b64_prov_paid = drawPie(
      topN(pivotProvider.filter(p => p.paid > 0)).map(p => ({ label: p.label, v: p.paid })),
      'Оплачено по поставщикам',
    )
    const b64_payer_planned = drawPie(
      topN(pivotPayer).map(p => ({ label: p.label, v: p.planned })),
      'Запланировано по плательщикам',
    )
    const b64_payer_paid = drawPie(
      topN(pivotPayer.filter(p => p.paid > 0)).map(p => ({ label: p.label, v: p.paid })),
      'Оплачено по плательщикам',
    )

    // ─── Sheet 2: По поставщикам ───────────────────────────
    await writePivotSheet(wb, 'По поставщикам', pivotProvider, 'Поставщик', b64_prov_planned, b64_prov_paid)

    // ─── Sheet 3: По плательщикам ──────────────────────────
    await writePivotSheet(wb, 'По плательщикам', pivotPayer, 'Плательщик', b64_payer_planned, b64_payer_paid)

    // ─── Download ──────────────────────────────────────────
    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Платежи_${fmtD(new Date().toISOString())}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    console.error('[export] payments excel error:', e)
  } finally {
    exportLoading.value = false
  }
}

onMounted(() => {
  load()
  window.addEventListener('mousedown', closeDropdowns)
})
onBeforeUnmount(() => window.removeEventListener('mousedown', closeDropdowns))
</script>

<template>
  <div class="page-wrap">
    <TopNav :links="navLinks" />

    <div class="page-body">

      <!-- ── Toolbar ── -->
      <div class="toolbar">
        <h1 class="page-title">Платежи</h1>
        <div class="toolbar-controls">
          <!-- View mode toggle -->
          <div class="view-toggle">
            <button
              class="view-toggle-btn"
              :class="{ active: viewMode === 'all' }"
              @click="viewMode = 'all'"
            >Все</button>
            <button
              class="view-toggle-btn"
              :class="{ active: viewMode === 'recent-paid' }"
              @click="viewMode = 'recent-paid'"
            ><i class="fas fa-clock"></i> Последние оплаты</button>
          </div>
          <input v-model="search" class="search-input" type="search" placeholder="Поиск...">
          <button
            class="btn-action"
            :disabled="exportLoading"
            @click="exportExcel"
          >
            <i class="fas fa-file-excel"></i>
            {{ exportLoading ? 'Формируем...' : 'Экспорт в Excel' }}
          </button>
          <button v-if="hasAnyFilter || checkedIds.size > 0" class="btn-reset" @click="clearAllFilters(); checkedIds.clear()">
            <i class="fas fa-times"></i> Сбросить
          </button>
        </div>
      </div>

      <!-- ── Date filters ── -->
      <div class="date-filters">
        <div class="date-filter-group">
          <span class="date-filter-label">Дата плана</span>
          <div class="date-filter-inputs">
            <input v-model="planDateFrom" class="date-input" type="date">
            <span class="date-sep">—</span>
            <input v-model="planDateTo" class="date-input" type="date">
          </div>
        </div>
        <div class="date-filter-group">
          <span class="date-filter-label">Дата оплаты</span>
          <div class="date-filter-inputs">
            <input v-model="paidDateFrom" class="date-input" type="date">
            <span class="date-sep">—</span>
            <input v-model="paidDateTo" class="date-input" type="date">
          </div>
        </div>
      </div>

      <!-- ── Summary bar ── -->
      <div class="summary-bar">
        <div class="summary-item">
          <span class="summary-label">{{ selectionLabel }}</span>
          <span class="summary-value neutral">{{ selectionLabel }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Записей</span>
          <span class="summary-value neutral">{{ activeRows.length }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Запланировано</span>
          <span class="summary-value">{{ formatMoney(totalPlanned) }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Оплачено</span>
          <span class="summary-value accent">{{ formatMoney(totalPaid) }}</span>
        </div>
        <div v-if="checkedIds.size > 0" class="summary-item summary-item-clear">
          <button class="btn-clear-sel" @click="checkedIds.clear()">
            <i class="fas fa-times"></i> Снять выбор
          </button>
        </div>
      </div>

      <!-- ── State ── -->
      <div v-if="loading" class="state-msg">Загрузка...</div>
      <div v-else-if="loadError" class="state-msg state-error">{{ loadError }}</div>

      <!-- ── Table ── -->
      <div v-else class="table-wrap">
        <table>
          <colgroup>
            <col style="width:40px">
            <col style="width:130px">
            <col style="width:150px">
            <col style="width:130px">
            <col>
            <col>
            <col style="width:150px">
            <col style="width:150px">
            <col style="width:120px">
          </colgroup>
          <thead>
            <tr>

              <!-- Checkbox all -->
              <th class="th-check">
                <input
                  type="checkbox"
                  :checked="checkedAll"
                  @change="toggleAll($event.target.checked)"
                >
              </th>

              <!-- Дата -->
              <th><div class="th-inner"><span>Дата</span></div></th>

              <!-- Сумма -->
              <th><div class="th-inner"><span>Сумма</span></div></th>

              <!-- Счёт / От кого -->
              <th>
                <div class="filter-dropdown-wrap">
                  <div class="th-inner th-inner-filter" @click.stop="toggleDropdown('invoice-col')">
                    <span>Счёт / От кого</span>
                    <i class="fas fa-filter" :class="{ 'filter-active': activeFilters.fromBy.length || activeFilters.invoiceNums.length }"></i>
                  </div>
                  <div v-if="filterDropdownOpen === 'invoice-col'" class="col-dropdown" @mousedown.stop @click.stop>
                    <div class="col-dropdown-section-label">Номер счёта</div>
                    <input v-model="filterSearch.invoiceNums" class="col-dropdown-search" type="text" placeholder="Поиск...">
                    <div class="col-dropdown-list">
                      <label v-for="opt in filteredOptionList('invoiceNums')" :key="opt" class="col-dropdown-opt">
                        <input type="checkbox" :checked="activeFilters.invoiceNums.includes(opt)" @change="toggleFilterOption('invoiceNums', opt)">
                        <span>{{ opt }}</span>
                      </label>
                    </div>
                    <button v-if="activeFilters.invoiceNums.length" class="col-dropdown-clear" @click.stop="clearFilter('invoiceNums')">Сбросить</button>
                    <div class="col-dropdown-divider"></div>
                    <div class="col-dropdown-section-label">От кого</div>
                    <input v-model="filterSearch.fromBy" class="col-dropdown-search" type="text" placeholder="Поиск...">
                    <div class="col-dropdown-list">
                      <label v-for="opt in filteredOptionList('fromBy')" :key="opt" class="col-dropdown-opt">
                        <input type="checkbox" :checked="activeFilters.fromBy.includes(opt)" @change="toggleFilterOption('fromBy', opt)">
                        <span>{{ opt }}</span>
                      </label>
                    </div>
                    <button v-if="activeFilters.fromBy.length" class="col-dropdown-clear" @click.stop="clearFilter('fromBy')">Сбросить</button>
                  </div>
                </div>
              </th>

              <!-- Поставщик -->
              <th>
                <div class="filter-dropdown-wrap">
                  <div class="th-inner th-inner-filter" @click.stop="toggleDropdown('providers')">
                    <span>Поставщик</span>
                    <i class="fas fa-filter" :class="{ 'filter-active': activeFilters.providers.length }"></i>
                  </div>
                  <div v-if="filterDropdownOpen === 'providers'" class="col-dropdown" @mousedown.stop @click.stop>
                    <input v-model="filterSearch.providers" class="col-dropdown-search" type="text" placeholder="Поиск...">
                    <div class="col-dropdown-list">
                      <label v-for="opt in filteredOptionList('providers')" :key="opt" class="col-dropdown-opt">
                        <input type="checkbox" :checked="activeFilters.providers.includes(opt)" @change="toggleFilterOption('providers', opt)">
                        <span>{{ opt }}</span>
                      </label>
                    </div>
                    <button v-if="activeFilters.providers.length" class="col-dropdown-clear" @click.stop="clearFilter('providers')">Сбросить</button>
                  </div>
                </div>
              </th>

              <!-- Плательщик -->
              <th>
                <div class="filter-dropdown-wrap">
                  <div class="th-inner th-inner-filter" @click.stop="toggleDropdown('payers')">
                    <span>Плательщик</span>
                    <i class="fas fa-filter" :class="{ 'filter-active': activeFilters.payers.length }"></i>
                  </div>
                  <div v-if="filterDropdownOpen === 'payers'" class="col-dropdown" @mousedown.stop @click.stop>
                    <input v-model="filterSearch.payers" class="col-dropdown-search" type="text" placeholder="Поиск...">
                    <div class="col-dropdown-list">
                      <label v-for="opt in filteredOptionList('payers')" :key="opt" class="col-dropdown-opt">
                        <input type="checkbox" :checked="activeFilters.payers.includes(opt)" @change="toggleFilterOption('payers', opt)">
                        <span>{{ opt }}</span>
                      </label>
                    </div>
                    <button v-if="activeFilters.payers.length" class="col-dropdown-clear" @click.stop="clearFilter('payers')">Сбросить</button>
                  </div>
                </div>
              </th>

              <!-- Кто запланировал -->
              <th>
                <div class="filter-dropdown-wrap">
                  <div class="th-inner th-inner-filter" @click.stop="toggleDropdown('planners')">
                    <span>Кто запланировал</span>
                    <i class="fas fa-filter" :class="{ 'filter-active': activeFilters.planners.length }"></i>
                  </div>
                  <div v-if="filterDropdownOpen === 'planners'" class="col-dropdown" @mousedown.stop @click.stop>
                    <input v-model="filterSearch.planners" class="col-dropdown-search" type="text" placeholder="Поиск...">
                    <div class="col-dropdown-list">
                      <label v-for="opt in filteredOptionList('planners')" :key="opt" class="col-dropdown-opt">
                        <input type="checkbox" :checked="activeFilters.planners.includes(opt)" @change="toggleFilterOption('planners', opt)">
                        <span>{{ opt }}</span>
                      </label>
                    </div>
                    <button v-if="activeFilters.planners.length" class="col-dropdown-clear" @click.stop="clearFilter('planners')">Сбросить</button>
                  </div>
                </div>
              </th>

              <!-- Кто оплатил -->
              <th>
                <div class="filter-dropdown-wrap">
                  <div class="th-inner th-inner-filter" @click.stop="toggleDropdown('paidBy')">
                    <span>Кто оплатил</span>
                    <i class="fas fa-filter" :class="{ 'filter-active': activeFilters.paidBy.length }"></i>
                  </div>
                  <div v-if="filterDropdownOpen === 'paidBy'" class="col-dropdown col-dropdown-right" @mousedown.stop @click.stop>
                    <input v-model="filterSearch.paidBy" class="col-dropdown-search" type="text" placeholder="Поиск...">
                    <div class="col-dropdown-list">
                      <label v-for="opt in filteredOptionList('paidBy')" :key="opt" class="col-dropdown-opt">
                        <input type="checkbox" :checked="activeFilters.paidBy.includes(opt)" @change="toggleFilterOption('paidBy', opt)">
                        <span>{{ opt }}</span>
                      </label>
                    </div>
                    <button v-if="activeFilters.paidBy.length" class="col-dropdown-clear" @click.stop="clearFilter('paidBy')">Сбросить</button>
                  </div>
                </div>
              </th>

              <!-- Статус -->
              <th>
                <div class="filter-dropdown-wrap">
                  <div class="th-inner th-inner-filter" @click.stop="toggleDropdown('statuses')">
                    <span>Статус</span>
                    <i class="fas fa-filter" :class="{ 'filter-active': activeFilters.statuses.length }"></i>
                  </div>
                  <div v-if="filterDropdownOpen === 'statuses'" class="col-dropdown col-dropdown-right" @mousedown.stop @click.stop>
                    <div class="col-dropdown-list">
                      <label v-for="opt in filteredOptionList('statuses')" :key="opt" class="col-dropdown-opt">
                        <input type="checkbox" :checked="activeFilters.statuses.includes(opt)" @change="toggleFilterOption('statuses', opt)">
                        <span>{{ opt }}</span>
                      </label>
                    </div>
                    <button v-if="activeFilters.statuses.length" class="col-dropdown-clear" @click.stop="clearFilter('statuses')">Сбросить</button>
                  </div>
                </div>
              </th>

            </tr>
          </thead>
          <tbody>
            <tr v-if="!filteredRows.length">
              <td colspan="9" class="empty-cell">Платежей не найдено</td>
            </tr>
            <tr
              v-for="row in filteredRows"
              :key="row.id"
              :class="{ 'row-checked': checkedIds.has(row.id) }"
            >

              <!-- Checkbox -->
              <td class="td-check">
                <input
                  type="checkbox"
                  :checked="checkedIds.has(row.id)"
                  @change="toggleOne(row.id)"
                >
              </td>

              <!-- Дата -->
              <td>
                <div class="cell-stack">
                  <span class="cell-main">{{ formatDate(row.datePlan) }}</span>
                  <span v-if="row.paidAt" class="cell-sub">Опл.: {{ formatDate(row.paidAt) }}</span>
                </div>
              </td>

              <!-- Сумма -->
              <td>
                <div class="cell-stack">
                  <span class="cell-main mono">{{ formatMoney(row.value) }}</span>
                  <span v-if="row.paid != null && row.paid > 0" class="cell-sub mono accent">Факт: {{ formatMoney(row.paid) }}</span>
                  <span v-if="row.paidType" class="cell-sub">{{ row.paidType }}</span>
                </div>
              </td>

              <!-- Счёт -->
              <td>
                <div class="cell-stack">
                  <div class="invoice-num-row">
                    <span v-if="row.isUnpaid && row.priority != null" class="pay-priority-badge" :style="priorityStyle(row.priority)" :title="`Приоритет: ${row.priority}`">{{ row.priority }}</span>
                    <button
                      v-if="row.invoiceId"
                      class="invoice-link"
                      @click="goToInvoice(row.invoiceId)"
                    >{{ row.invoiceNum || `#${row.invoiceId}` }}</button>
                    <span v-else class="cell-main">—</span>
                  </div>
                  <span v-if="row.invoiceDate" class="cell-sub">{{ formatDate(row.invoiceDate) }}</span>
                  <span v-if="row.fromBy" class="cell-sub">{{ row.fromBy }}</span>
                </div>
              </td>

              <!-- Поставщик -->
              <td class="td-text">{{ row.providerName }}</td>

              <!-- Плательщик -->
              <td class="td-text">{{ row.payerName }}</td>

              <!-- Кто запланировал -->
              <td class="td-text">{{ row.plannedBy }}</td>

              <!-- Кто оплатил -->
              <td class="td-text">{{ row.paidBy }}</td>

              <!-- Статус -->
              <td>
                <span class="status-badge" :class="row.statusLabel === 'Оплачено' ? 'status-paid' : 'status-planned'">
                  {{ row.statusLabel }}
                </span>
              </td>

            </tr>
          </tbody>
        </table>
      </div>

    </div>
  </div>
</template>

<style scoped>
.page-wrap {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg-page, #f1f5f9);
}

.page-body {
  flex: 1;
  overflow: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* ── Toolbar ── */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.toolbar-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.page-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.search-input {
  height: 34px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  padding: 0 10px;
  font-size: 13px;
  color: var(--text-primary);
  width: 180px;
  outline: none;
}
.search-input:focus { border-color: var(--brand-primary); }

.btn-reset {
  height: 34px;
  padding: 0 12px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
}
.btn-reset:hover { background: var(--bg-subtle); }

.btn-action {
  height: 34px;
  padding: 0 12px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
}
.btn-action:hover { background: var(--bg-subtle); }
.btn-action:disabled { opacity: 0.6; cursor: default; }

/* ── View toggle ── */
.view-toggle {
  display: flex;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.view-toggle-btn {
  height: 34px;
  padding: 0 12px;
  border: none;
  background: var(--bg-surface);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 5px;
  transition: background 0.15s, color 0.15s;
}
.view-toggle-btn:not(:last-child) {
  border-right: 1px solid var(--border-light);
}
.view-toggle-btn.active {
  background: var(--brand-primary);
  color: #fff;
}
.view-toggle-btn:not(.active):hover {
  background: var(--bg-subtle);
  color: var(--text-primary);
}

/* ── Date filters ── */
.date-filters {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  padding: 12px 16px;
  box-shadow: var(--shadow-sm);
}

.date-filter-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.date-filter-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.date-filter-inputs {
  display: flex;
  align-items: center;
  gap: 6px;
}

.date-input {
  height: 32px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--bg-subtle);
  padding: 0 8px;
  font-size: 12px;
  color: var(--text-primary);
  outline: none;
}
.date-input:focus { border-color: var(--brand-primary); background: var(--bg-surface); }

.date-sep {
  color: var(--text-tertiary);
  font-size: 14px;
}

/* ── Summary bar ── */
.summary-bar {
  display: flex;
  align-items: center;
  gap: 24px;
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  padding: 12px 20px;
  box-shadow: var(--shadow-sm);
}

.summary-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.summary-item-clear {
  margin-left: auto;
}

.summary-label {
  font-size: 11px;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
}

.summary-value {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  font-family: "JetBrains Mono", monospace;
}
.summary-value.accent { color: var(--brand-primary); }
.summary-value.neutral { color: var(--text-secondary); }

.btn-clear-sel {
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--bg-subtle);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 5px;
}
.btn-clear-sel:hover { background: var(--bg-page, #f1f5f9); }

/* ── State ── */
.state-msg {
  text-align: center;
  padding: 40px;
  color: var(--text-secondary);
  font-size: 14px;
}
.state-error { color: var(--danger-text, #ef4444); }

/* ── Table ── */
.table-wrap {
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  overflow: auto;
  flex: 1;
}

table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 13px;
}

th {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--bg-subtle);
  padding: 0;
  border-bottom: 1px solid var(--border-light);
}

th:not(:last-child) { border-right: 1px solid var(--border-light); }
td:not(:last-child) { border-right: 1px solid var(--border-light); }

.th-check {
  text-align: center;
  padding: 0 8px;
}

td {
  padding: 9px 10px;
  border-bottom: 1px solid var(--border-light);
  color: var(--text-primary);
  vertical-align: top;
}

.td-check {
  text-align: center;
  vertical-align: middle;
  padding: 0 8px;
}

tr:last-child td { border-bottom: none; }
tr:hover td { background: var(--bg-subtle); }
tr.row-checked td { background: var(--brand-light, #eff6ff); }

.empty-cell {
  text-align: center;
  color: var(--text-tertiary);
  padding: 40px;
  border-right: none !important;
}

.td-text {
  font-size: 13px;
  white-space: normal;
  word-break: break-word;
}

/* ── Column filter ── */
.filter-dropdown-wrap {
  position: relative;
}

.th-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 9px 10px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-secondary);
  white-space: nowrap;
  user-select: none;
}

.th-inner-filter {
  cursor: pointer;
}
.th-inner-filter:hover { background: var(--bg-page, #f1f5f9); }

.th-inner .fas.fa-filter {
  font-size: 10px;
  color: var(--text-tertiary);
  flex-shrink: 0;
}
.th-inner .fas.fa-filter.filter-active { color: var(--brand-primary); }

.col-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 50;
  min-width: 220px;
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  padding: 6px;
}

.col-dropdown-right {
  left: auto;
  right: 0;
}

.col-dropdown-search {
  width: 100%;
  box-sizing: border-box;
  height: 30px;
  border: 1px solid var(--border-light);
  border-radius: 6px;
  padding: 0 8px;
  font-size: 12px;
  margin-bottom: 4px;
  outline: none;
  background: var(--bg-subtle);
  color: var(--text-primary);
}

.col-dropdown-list {
  max-height: 200px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.col-dropdown-opt {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 5px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-primary);
  user-select: none;
  text-align: left;
}
.col-dropdown-opt:hover { background: var(--bg-subtle); }
.col-dropdown-opt input[type="checkbox"] { flex-shrink: 0; margin-top: 2px; }
.col-dropdown-opt span { word-break: break-word; }

.col-dropdown-section-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-tertiary);
  padding: 4px 8px 2px;
}

.col-dropdown-divider {
  height: 1px;
  background: var(--border-light);
  margin: 6px 0;
}

.col-dropdown-clear {
  margin-top: 4px;
  width: 100%;
  padding: 5px;
  font-size: 11px;
  border: none;
  background: none;
  color: var(--danger-text, #ef4444);
  cursor: pointer;
  border-radius: 6px;
  text-align: left;
}
.col-dropdown-clear:hover { background: var(--bg-subtle); }

/* ── Cell content ── */
.cell-stack {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.cell-main {
  font-weight: 600;
  color: var(--text-primary);
}

.cell-sub {
  font-size: 11px;
  color: var(--text-secondary);
}

.mono { font-family: "JetBrains Mono", monospace; }
.accent { color: var(--brand-primary) !important; }

/* ── Invoice num row ── */
.invoice-num-row {
  display: flex;
  align-items: center;
  gap: 5px;
}

.pay-priority-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  font-size: 10px;
  font-weight: 700;
  flex-shrink: 0;
}

/* ── Invoice link ── */
.invoice-link {
  background: none;
  border: none;
  padding: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--brand-primary);
  cursor: pointer;
  text-decoration: none;
  text-align: left;
}
.invoice-link:hover { opacity: 0.75; }

/* ── Status badges ── */
.status-badge {
  display: inline-block;
  padding: 3px 9px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.status-paid {
  background: #dcfce7;
  color: #16a34a;
}

.status-planned {
  background: #fef9c3;
  color: #a16207;
}
</style>
