<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TopNav from '../components/layout/TopNav.vue'
import CategoryTreePickerModal from '../components/CategoryTreePickerModal.vue'
import { useAuthStore } from '../stores/auth'
import { buildWarehouseCategoryTree } from '../helpers/warehouseCategoryTree'
import { mainNavLinks } from '../constants/mainNav'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const STATUS_ID_REJECTED = '1ff33ee2-1312-11f1-aa8c-bc241127d0bd'
const STATUS_ID_IN_PROGRESS = '1ff33333-1312-11f1-aa8c-bc241127d0bd'

const requestId = route.params.requestId
const isCreateMode = route.name === 'request-create'
const backLink = route.query.back || '/'

const navLinks = mainNavLinks

const requestName = ref('')
const requestProject = ref(String(route.query.project_name || ''))
const requestExecutor = ref('')
const requiredDate = ref('')
const requestComment = ref('')
const loading = ref(false)
const loadError = ref('')
const saveLoading = ref(false)
const saveError = ref('')
const saveSuccess = ref('')
const submitLoading = ref(false)
const decisionLoading = ref(false)
const hasApprovers = ref(false)
const requestLogs = ref([])
const requestStatusName = ref('')
const toast = ref({
  open: false,
  message: '',
  type: 'success',
  closing: false,
  key: 0,
})
let toastTimer = null
let toastCloseTimer = null

const attachments = ref([])
const attachmentsLoading = ref(false)
const attachmentsError = ref('')
const attachmentsUploading = ref(false)

const requestObjects = ref([])
const requestObjectsLoading = ref(false)
const requestObjectsError = ref('')
const selectedObjectLevelId = ref(String(route.query.object_levels_id || ''))
const isProjectDropdownOpen = ref(false)
const projectLookupRef = ref(null)

const requesterUsers = ref([])
const requesterUsersLoading = ref(false)
const requesterUsersError = ref('')
const selectedExecutorId = ref('')
const initialObjectLevelId = ref('')
const initialExecutorId = ref('')
const isExecutorDropdownOpen = ref(false)
const executorLookupRef = ref(null)
const requiredDateRef = ref(null)

const unitOptions = ref([])
const categoryOptions = ref([])
const categoryTreeMeta = computed(() => buildWarehouseCategoryTree(categoryOptions.value))

const activeNomenclatureRow = ref(null)
const nomenclatureItems = ref([])
const nomenclatureLoading = ref(false)
const nomenclatureError = ref('')
let nomenclatureSearchTimer = null
const rowSaveQueue = new Map()
const suppressItemBlurSaveRowIndex = ref(null)
const rowContextMenu = ref({
  open: false,
  x: 0,
  y: 0,
  rowIndex: null,
})
const categoryModalOpen = ref(false)
const categoryModalRowIndex = ref(null)
const categoryFilterLabel = ref('')

const filters = ref({
  item: '',
  unitId: '',
  qty: '',
  categoryId: '',
  extComment: '',
})
const checkedAllRows = ref(false)
const fillDownState = ref({
  active: false,
  startRow: 0,
  endRow: 0,
  key: '',
  value: '',
})
const fillDownPointer = ref({ x: 0, y: 0 })
let fillDownScrollTimer = null
const activeCell = ref({ row: 0, col: '' })
const printModalOpen = ref(false)
const printOptions = ref({
  headerName: true,
  headerProject: true,
  headerExecutor: true,
  headerDate: true,
  headerComment: false,
  colIndex: true,
  colItem: true,
  colUnit: true,
  colQty: true,
  colCategory: true,
  colComment: true,
})

const rows = ref(
  Array.from({ length: 500 }, (_, i) => ({
    index: i + 1,
    checked: false,
    itemId: '',
    nomenclatureId: '',
    item: '',
    unitId: '',
    qty: '',
    categoryId: '',
    extComment: '',
  }))
)

const specificationsMap = ref({})

const specModalOpen = ref(false)
const specItemModalOpen = ref(false)
const deleteConfirmOpen = ref(false)
const specSearchQuery = ref('')
const specItemSearchQuery = ref('')
const specList = ref([])
const specItemList = ref([])
const selectedSpecId = ref('')
const selectedSpecName = ref('')
const specRowIndex = ref(null)
const specActionMode = ref('') // 'link' or 'edit'
const specLoading = ref(false)
const specItemLoading = ref(false)
const specSaving = ref(false)
const collapsedSections = ref(new Set())

const objectLevelId = computed(() => selectedObjectLevelId.value || initialObjectLevelId.value)

const filteredSpecList = computed(() => {
  const q = specSearchQuery.value.trim().toLowerCase()
  if (!q) return specList.value
  return specList.value.filter((s) => String(s?.name || '').toLowerCase().includes(q))
})

const groupedSpecItems = computed(() => {
  const items = specItemList.value
  const q = specItemSearchQuery.value.trim().toLowerCase()
  const groups = []
  let currentSection = null

  for (const item of items) {
    const name = String(item?.name || '').trim()
    const sectionName = String(item?.section_name || '').trim()

    if (sectionName) {
      currentSection = { section_name: sectionName, items: [] }
      groups.push(currentSection)
    }

    if (currentSection) {
      if (sectionName) {
        continue
      }
      if (q && !name.toLowerCase().includes(q) && !currentSection.section_name.toLowerCase().includes(q)) {
        continue
      }
      currentSection.items.push(item)
    }
  }

  return groups.filter((g) => g.items.length > 0)
})

const openSpecModal = (rowIndex, mode) => {
  specRowIndex.value = rowIndex
  specActionMode.value = mode
  specSearchQuery.value = ''
  specList.value = []
  specModalOpen.value = true
  loadSpecList()
}

const loadSpecList = async () => {
  const oid = objectLevelId.value
  if (!oid) return
  specLoading.value = true
  try {
    const res = await fetch(
      `/apisup/supply/specifications/by-object-levels/${encodeURIComponent(oid)}?status_id=c532989f-17ba-11f1-aa8c-bc241127d0bd`,
      { credentials: 'include' }
    )
    if (!res.ok) throw new Error()
    const payload = await res.json()
    specList.value = Array.isArray(payload) ? payload : []
  } catch {
    specList.value = []
  } finally {
    specLoading.value = false
  }
}

const selectSpecification = async (spec) => {
  selectedSpecId.value = String(spec?.id || '')
  selectedSpecName.value = String(spec?.name || '')
  specItemSearchQuery.value = ''
  specItemList.value = []
  collapsedSections.value = new Set()
  specModalOpen.value = false
  specItemModalOpen.value = true
  await loadSpecItems()
}

const loadSpecItems = async () => {
  if (!selectedSpecId.value) return
  specItemLoading.value = true
  try {
    const res = await fetch(`/apisup/supply/specifications/${encodeURIComponent(selectedSpecId.value)}/items`, {
      credentials: 'include',
    })
    if (!res.ok) throw new Error()
    const payload = await res.json()
    const items = Array.isArray(payload) ? payload : (payload?.items || payload?.data || [])
    specItemList.value = items
  } catch {
    specItemList.value = []
  } finally {
    specItemLoading.value = false
  }
}

const toggleSection = (sectionName) => {
  const next = new Set(collapsedSections.value)
  if (next.has(sectionName)) {
    next.delete(sectionName)
  } else {
    next.add(sectionName)
  }
  collapsedSections.value = next
}

const selectSpecItem = async (item) => {
  if (!item?.id || item?.section_name) return
  specSaving.value = true
  try {
    const rowIndex = specRowIndex.value
    if (!rowIndex) return
    const row = rows.value[rowIndex - 1]
    if (!row) return

    const body = {
      request_id: Number(requestId),
      request_item_id: row.itemId,
      specification_id: selectedSpecId.value,
      specification_item_id: item.id,
    }

    let savedRowId = ''
    if (specActionMode.value === 'edit') {
      const existing = specificationsMap.value[row.itemId]
      if (existing?.row_id) {
        const res = await fetch(`/apisup/supply/request-specifications/${encodeURIComponent(existing.row_id)}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error()
        savedRowId = existing.row_id
      }
    } else {
      const res = await fetch('/apisup/supply/request-specifications', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
      const created = await res.json().catch(() => null)
      savedRowId = String(created?.request_specification_id || created?.id || '')
    }

    specificationsMap.value = {
      ...specificationsMap.value,
      [row.itemId]: {
        row_id: savedRowId,
        spec_id: selectedSpecId.value,
        spec_item_id: item.id,
        spec_item_name: String(item?.name || ''),
      },
    }

    specItemModalOpen.value = false
    selectedSpecId.value = ''
    selectedSpecName.value = ''
  } catch {
    // silent
  } finally {
    specSaving.value = false
  }
}

const openDeleteConfirm = () => {
  deleteConfirmOpen.value = true
}

const confirmDeleteSpec = async () => {
  const rowIndex = specRowIndex.value
  if (!rowIndex) return
  const row = rows.value[rowIndex - 1]
  if (!row) return
  const existing = specificationsMap.value[row.itemId]
  if (!existing?.row_id) return

  specSaving.value = true
  try {
    const res = await fetch(`/apisup/supply/request-specifications/${encodeURIComponent(existing.row_id)}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    if (!res.ok) throw new Error()

    const next = { ...specificationsMap.value }
    delete next[row.itemId]
    specificationsMap.value = next
    deleteConfirmOpen.value = false
  } catch {
    // silent
  } finally {
    specSaving.value = false
  }
}

const createEmptyRows = (size = 500) =>
  Array.from({ length: size }, (_, i) => ({
    index: i + 1,
    checked: false,
    itemId: '',
    nomenclatureId: '',
    item: '',
    unitId: '',
    qty: '',
    categoryId: '',
    extComment: '',
  }))

const formatUserFio = (user) => `${user?.surname || ''} ${user?.name || ''}`.trim()

const uniqueByUserId = (list) => {
  const map = new Map()
  list.forEach((item) => {
    const id = item?.user_id
    if (!id || map.has(id)) return
    map.set(id, item)
  })
  return Array.from(map.values())
}

const filteredRequestObjects = computed(() => {
  const q = requestProject.value.trim().toLowerCase()
  if (!q) return requestObjects.value
  return requestObjects.value.filter((item) => String(item.name || '').toLowerCase().includes(q))
})

const filteredRequesterUsers = computed(() => {
  const q = requestExecutor.value.trim().toLowerCase()
  if (!q) return requesterUsers.value
  return requesterUsers.value.filter((item) => String(item.fio || '').toLowerCase().includes(q))
})

const visibleRows = computed(() => {
  const itemQ = String(filters.value.item || '').trim().toLowerCase()
  const qtyQ = String(filters.value.qty || '').trim().toLowerCase()
  const commentQ = String(filters.value.extComment || '').trim().toLowerCase()
  const categoryId = String(filters.value.categoryId || '')
  const unitId = String(filters.value.unitId || '')
  return rows.value.filter((row) => {
    if (itemQ && !String(row.item || '').toLowerCase().includes(itemQ)) return false
    if (qtyQ && !String(row.qty || '').toLowerCase().includes(qtyQ)) return false
    if (commentQ && !String(row.extComment || '').toLowerCase().includes(commentQ)) return false
    if (categoryId && String(row.categoryId || '') !== categoryId) return false
    if (unitId && String(row.unitId || '') !== unitId) return false
    return true
  })
})

const checkedRows = computed(() => rows.value.filter((row) => row.checked))
const printRows = computed(() => {
  const selected = rows.value.filter((row) => row.checked && hasAnyItemData(row))
  if (selected.length) return [...selected].sort((a, b) => a.index - b.index)
  return visibleRows.value.filter((row) => hasAnyItemData(row))
})

const isRequestEditable = computed(() => {
  if (isCreateMode) return true
  const status = String(requestStatusName.value || '').trim().toLowerCase()
  return status.includes('нов')
})

const normalizeNumericInput = (value) => value.replace(/\./g, ',').replace(/[^0-9,]/g, '')

const parseNumber = (value) => {
  if (!value) return 0
  const normalized = value.replace(/\s/g, '').replace(',', '.')
  const num = Number(normalized)
  return Number.isFinite(num) ? num : 0
}

const formatNumber = (value) =>
  value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const formatField = (value) => {
  const num = parseNumber(value)
  return num ? formatNumber(num) : ''
}

const autosize = (event) => {
  const el = event.target
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

const columnOrder = ['item', 'qty', 'unit', 'category', 'extComment']

const setCell = (row, key, value) => {
  if (!isRequestEditable.value) return
  if (key === 'qty') {
    row[key] = normalizeNumericInput(value)
    return
  }
  if (key === 'unit') {
    const direct = unitOptions.value.some((item) => String(item.id) === String(value)) ? String(value) : unitIdByName(value)
    row.unitId = direct
    if (row.nomenclatureId && row.unitId) row.nomenclatureId = ''
    return
  }
  if (key === 'category') {
    const direct = categoryTreeMeta.value.byId.has(String(value)) ? String(value) : categoryIdByName(value)
    row.categoryId = direct
    if (row.nomenclatureId && row.categoryId) row.nomenclatureId = ''
    return
  }
  if (key === 'item') {
    row.nomenclatureId = ''
  }
  row[key] = value
}

const handlePaste = async (event) => {
  if (!isRequestEditable.value) return
  const target = event.target
  if (!target || !target.dataset) return

  const startRow = Number(target.dataset.row)
  const startCol = target.dataset.col
  if (!startRow || !startCol) return

  const clipboard = event.clipboardData?.getData('text')
  if (!clipboard) return
  event.preventDefault()

  const startColIndex = columnOrder.indexOf(startCol)
  if (startColIndex === -1) return

  const normalized = clipboard.replace(/\r/g, '')
  const rowLines = normalized.split('\n').filter((line) => line.length > 0).map((line) => line.split('\t'))
  const hasTableData = rowLines.some((cols) => cols.length > 1)
  const touchedRows = new Set()
  if (!hasTableData && rowLines.length > 1) {
    rowLines.forEach((cols, rIdx) => {
      const rowIndex = startRow - 1 + rIdx
      const rowObj = rows.value[rowIndex]
      if (!rowObj) return
      setCell(rowObj, startCol, cols[0] ?? '')
      touchedRows.add(rowIndex + 1)
    })
  } else if (!hasTableData) {
    const rowObj = rows.value[startRow - 1]
    if (!rowObj) return
    setCell(rowObj, startCol, normalized.replace(/\n+/g, ' ').trim())
    touchedRows.add(startRow)
  } else {
    rowLines.forEach((cols, rIdx) => {
      const rowIndex = startRow - 1 + rIdx
      const rowObj = rows.value[rowIndex]
      if (!rowObj) return

      cols.forEach((cell, cIdx) => {
        const colKey = columnOrder[startColIndex + cIdx]
        if (!colKey) return
        setCell(rowObj, colKey, cell)
      })
      touchedRows.add(rowIndex + 1)
    })
  }

  await nextTick()
  touchedRows.forEach((rowNum) => {
    const row = rows.value[rowNum - 1]
    if (row) queueSaveRow(row).catch(() => {})
    document.querySelectorAll(`.cell-textarea[data-row="${rowNum}"]`).forEach((el) => {
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    })
  })
}

const resetFilters = () => {
  filters.value = {
    item: '',
    unitId: '',
    qty: '',
    categoryId: '',
    extComment: '',
  }
  categoryFilterLabel.value = ''
}

const openCategoryModal = (rowIndex = null) => {
  categoryModalRowIndex.value = rowIndex
  categoryModalOpen.value = true
}

const closeCategoryModal = () => {
  categoryModalOpen.value = false
  categoryModalRowIndex.value = null
}

const applyCategoryFromModal = (item) => {
  const id = String(item?.id || '')
  if (categoryModalRowIndex.value == null) {
    filters.value.categoryId = id
    categoryFilterLabel.value = id ? categoryLabelById(id, item?.name || '') : ''
    closeCategoryModal()
    return
  }
  const row = rows.value[Number(categoryModalRowIndex.value) - 1]
  if (!row) {
    closeCategoryModal()
    return
  }
  onCategoryChange(row, id)
  closeCategoryModal()
}

const openCategoryCreate = () => {
  window.open('/warehouse-categories/new', '_blank', 'noopener')
}

const toggleAllRowsChecked = () => {
  const next = Boolean(checkedAllRows.value)
  visibleRows.value.forEach((row) => {
    row.checked = next
  })
}

const syncCheckedAll = () => {
  const list = visibleRows.value
  checkedAllRows.value = list.length > 0 && list.every((row) => row.checked)
}

const deleteCheckedRows = async (shiftUp = false) => {
  const selected = rows.value.filter((row) => row.checked).sort((a, b) => a.index - b.index)
  if (!selected.length) return
  if (shiftUp) {
    for (let i = selected.length - 1; i >= 0; i -= 1) {
      // eslint-disable-next-line no-await-in-loop
      await deleteRowWithShiftUp(selected[i].index)
    }
  } else {
    for (let i = 0; i < selected.length; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await deleteRowOnly(selected[i].index)
    }
  }
  rows.value.forEach((row) => { row.checked = false })
  checkedAllRows.value = false
}

const startFillDown = (rowIndex, key, value) => {
  if (!isRequestEditable.value) return
  fillDownState.value = {
    active: true,
    startRow: rowIndex,
    endRow: rowIndex,
    key,
    value,
  }
  if (!fillDownScrollTimer) {
    fillDownScrollTimer = window.setInterval(() => {
      if (!fillDownState.value.active) return
      const { x, y } = fillDownPointer.value
      const edge = 80
      const step = 20
      if (y < edge) {
        window.scrollBy(0, -step)
      } else if (y > window.innerHeight - edge) {
        window.scrollBy(0, step)
      }
      const el = document.elementFromPoint(x, y)
      const rowEl = el?.closest?.('tr[data-row]')
      if (rowEl) {
        const rowIndex = Number(rowEl.dataset.row || 0)
        if (rowIndex) fillDownState.value.endRow = rowIndex
      }
    }, 40)
  }
}

const onFillRowHover = (rowIndex) => {
  if (!fillDownState.value.active) return
  fillDownState.value.endRow = rowIndex
}

const onFillMouseMove = (event) => {
  if (!fillDownState.value.active) return
  fillDownPointer.value = { x: event.clientX, y: event.clientY }
  const el = document.elementFromPoint(event.clientX, event.clientY)
  const rowEl = el?.closest?.('tr[data-row]')
  if (rowEl) {
    const rowIndex = Number(rowEl.dataset.row || 0)
    if (rowIndex) fillDownState.value.endRow = rowIndex
  }
}

const stopFillDown = () => {
  if (!fillDownState.value.active) return
  const { startRow, endRow, key, value } = fillDownState.value
  const from = Math.min(startRow, endRow)
  const to = Math.max(startRow, endRow)
  for (let i = from; i <= to; i += 1) {
    const row = rows.value[i - 1]
    if (!row) continue
    setCell(row, key, value)
    if (key === 'qty') row.qty = formatField(row.qty)
    queueSaveRow(row).catch(() => {})
  }
  fillDownState.value = {
    active: false,
    startRow: 0,
    endRow: 0,
    key: '',
    value: '',
  }
  if (fillDownScrollTimer) {
    window.clearInterval(fillDownScrollTimer)
    fillDownScrollTimer = null
  }
}

const isFillPreviewCell = (rowIndex, colKey) => {
  if (!fillDownState.value.active) return false
  if (fillDownState.value.key !== colKey) return false
  const from = Math.min(fillDownState.value.startRow, fillDownState.value.endRow)
  const to = Math.max(fillDownState.value.startRow, fillDownState.value.endRow)
  return rowIndex >= from && rowIndex <= to
}

const setActiveCell = (rowIndex, colKey) => {
  activeCell.value = { row: rowIndex, col: colKey }
}

const openPrintModal = () => {
  printModalOpen.value = true
}

const closePrintModal = () => {
  printModalOpen.value = false
}

const buildPrintTableHeaders = () => {
  const headers = []
  if (printOptions.value.colIndex) headers.push('№')
  if (printOptions.value.colItem) headers.push('Товар')
  if (printOptions.value.colUnit) headers.push('Ед. изм.')
  if (printOptions.value.colQty) headers.push('Количество')
  if (printOptions.value.colCategory) headers.push('Товарная категория')
  if (printOptions.value.colComment) headers.push('Комментарий внешний')
  return headers
}

const buildPrintRowCells = (row) => {
  const cells = []
  if (printOptions.value.colIndex) cells.push(String(row.index))
  if (printOptions.value.colItem) cells.push(String(row.item || ''))
  if (printOptions.value.colUnit) cells.push(String(unitOptions.value.find((u) => String(u.id) === String(row.unitId))?.name || ''))
  if (printOptions.value.colQty) cells.push(String(row.qty || ''))
  if (printOptions.value.colCategory) cells.push(String(categoryLabelById(row.categoryId, '')))
  if (printOptions.value.colComment) cells.push(String(row.extComment || ''))
  return cells
}

const escapeHtml = (value) => String(value || '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;')

const printRequestPdf = () => {
  const headers = buildPrintTableHeaders()
  if (!headers.length) return
  const rowsHtml = printRows.value
    .map((row) => `<tr>${buildPrintRowCells(row).map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
    .join('')
  const metaRows = []
  if (printOptions.value.headerName) metaRows.push(`<div><b>Название заявки:</b> ${escapeHtml(requestName.value)}</div>`)
  if (printOptions.value.headerProject) metaRows.push(`<div><b>Проект заявки:</b> ${escapeHtml(requestProject.value)}</div>`)
  if (printOptions.value.headerExecutor) metaRows.push(`<div><b>Исполнитель заявки:</b> ${escapeHtml(requestExecutor.value)}</div>`)
  if (printOptions.value.headerDate) metaRows.push(`<div><b>Требуемая дата:</b> ${escapeHtml(requiredDate.value)}</div>`)
  if (printOptions.value.headerComment) metaRows.push(`<div><b>Комментарий:</b> ${escapeHtml(requestComment.value)}</div>`)

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Заявка</title>
  <style>
  body{font-family:Arial,sans-serif;padding:24px;color:#0f172a}
  h1{font-size:22px;margin:0 0 14px}
  .meta{display:grid;gap:6px;margin-bottom:14px;font-size:13px}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th,td{border:1px solid #cbd5e1;padding:6px 8px;vertical-align:top}
  th{background:#f1f5f9;text-align:left}
  .print-helper{position:fixed;right:16px;top:16px;padding:8px 12px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;cursor:pointer}
  @media print { body{padding:0} }
  </style></head><body>
  <h1>Заявка</h1>
  <div class="meta">${metaRows.join('')}</div>
  <table><thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${rowsHtml}</tbody></table>
  </body></html>`
  const w = window.open('about:blank', '_blank')
  if (!w) {
    showToast('Браузер заблокировал окно печати.', 'error')
    return
  }
  w.document.open()
  w.document.write(html)
  w.document.close()
  const tryPrint = () => {
    try {
      w.focus()
      w.print()
    } catch {
      // noop
    }
  }
  // На macOS/Safari иногда первый вызов блокируется, пробуем несколько раз.
  setTimeout(tryPrint, 50)
  setTimeout(tryPrint, 250)
  setTimeout(tryPrint, 600)
  closePrintModal()
}

const normalizeArray = (payload) => {
  if (Array.isArray(payload)) return payload
  return payload?.items || payload?.data || payload?.results || []
}

const loadRequestObjects = async () => {
  requestObjectsLoading.value = true
  requestObjectsError.value = ''
  try {
    const res = await fetch('/apisup/supply/request-objects/my', {
      credentials: 'include',
    })
    if (!res.ok) throw new Error('request objects load failed')
    const payload = await res.json()
    requestObjects.value = normalizeArray(payload).map((item) => ({
      id: item?.id || '',
      name: item?.name || '',
    })).filter((item) => item.id)
  } catch (error) {
    requestObjects.value = []
    requestObjectsError.value = 'Не удалось загрузить список проектов.'
  } finally {
    requestObjectsLoading.value = false
  }
}

const loadUnits = async () => {
  try {
    const res = await fetch('/apisup/supply/units', { credentials: 'include' })
    if (!res.ok) throw new Error('units load failed')
    unitOptions.value = normalizeArray(await res.json())
      .map((item) => ({
        id: item?.id || '',
        name: item?.name || '',
      }))
      .filter((item) => item.id)
  } catch (error) {
    unitOptions.value = []
  }
}

const loadWarehouseCategories = async () => {
  try {
    const res = await fetch('/apisup/supply/warehouse-categories', { credentials: 'include' })
    if (!res.ok) throw new Error('categories load failed')
    categoryOptions.value = normalizeArray(await res.json())
      .map((item) => ({
        id: item?.id || '',
        name: item?.name || '',
        parent_id: item?.parent_id || '',
      }))
      .filter((item) => item.id)
  } catch (error) {
    categoryOptions.value = []
  }
}

const unitIdByName = (name) => {
  const val = String(name || '').trim().toLowerCase()
  if (!val) return ''
  const found = unitOptions.value.find((item) => String(item.name || '').trim().toLowerCase() === val)
  return found?.id || ''
}

const categoryIdByName = (name) => {
  const val = String(name || '').trim().toLowerCase().replace(/\s+/g, ' ')
  if (!val) return ''
  const found = categoryTreeMeta.value.flat.find((item) => {
    const rawName = String(item.name || '').trim().toLowerCase().replace(/\s+/g, ' ')
    const pathName = String(item.pathLabel || '').trim().toLowerCase().replace(/\s+/g, ' ')
    const candidates = [rawName, pathName].filter(Boolean)
    return candidates.some((candidate) => candidate === val || candidate.includes(val) || val.includes(candidate))
  })
  return found?.id || ''
}

const categoryLabelById = (id, fallback = '') => {
  const key = String(id || '')
  if (!key) return fallback
  const found = categoryTreeMeta.value.byId.get(key)
  return found?.pathLabel || fallback
}

const hasAnyItemData = (row) =>
  Boolean(
    row?.nomenclatureId
    || String(row?.item || '').trim()
    || String(row?.qty || '').trim()
    || row?.unitId
    || row?.categoryId
    || String(row?.extComment || '').trim()
  )

const buildItemPayload = (row) => {
  if (!hasAnyItemData(row)) return null
  const quantity = parseNumber(String(row.qty || ''))
  const payload = {
    num: row.index,
    quantity: Number.isFinite(quantity) ? quantity : 0,
  }

  if (row.nomenclatureId) {
    payload.nomenclature_id = row.nomenclatureId
  } else {
    payload.nomenclature_id = null
    const name = String(row.item || '').trim()
    if (!name) return null
    payload.name = name
    if (row.unitId) payload.unit_id = row.unitId
    if (row.categoryId) payload.warehouse_category_id = row.categoryId
  }

  const comment = String(row.extComment || '').trim()
  if (comment) payload.comment = comment
  return payload
}

const cloneRowData = (row) => ({
  itemId: row.itemId || '',
  nomenclatureId: row.nomenclatureId || '',
  item: row.item || '',
  unitId: row.unitId || '',
  qty: row.qty || '',
  categoryId: row.categoryId || '',
  extComment: row.extComment || '',
})

const assignRowData = (target, source) => {
  target.itemId = source.itemId || ''
  target.nomenclatureId = source.nomenclatureId || ''
  target.item = source.item || ''
  target.unitId = source.unitId || ''
  target.qty = source.qty || ''
  target.categoryId = source.categoryId || ''
  target.extComment = source.extComment || ''
}

const clearRowData = (row) => {
  row.itemId = ''
  row.nomenclatureId = ''
  row.item = ''
  row.unitId = ''
  row.qty = ''
  row.categoryId = ''
  row.extComment = ''
}

const saveRowItem = async (row) => {
  if (isCreateMode || !requestId) return
  const payload = buildItemPayload(row)
  if (!payload) return

  let res
  if (row.itemId) {
    res = await fetch(
      `/apisup/supply/requests/${encodeURIComponent(requestId)}/items/${encodeURIComponent(row.itemId)}`,
      {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    )
  } else {
    res = await fetch(`/apisup/supply/requests/${encodeURIComponent(requestId)}/items`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  }
  if (!res.ok) throw new Error('item save failed')
  if (!row.itemId) {
    const created = await res.json().catch(() => null)
    const id = created?.id || created?.item_id || created?.data?.id
    if (id) row.itemId = id
  }
}

const queueSaveRow = (row) => {
  const key = row.index
  const prev = rowSaveQueue.get(key) || Promise.resolve()
  const next = prev.catch(() => {}).then(() => saveRowItem(row))
  rowSaveQueue.set(key, next)
  return next
}

const loadRequesterUsers = async (objectLevelId) => {
  if (!objectLevelId) {
    requesterUsers.value = []
    selectedExecutorId.value = ''
    return
  }
  requesterUsersLoading.value = true
  requesterUsersError.value = ''
  try {
    const res = await fetch(
      `/apisup/supply/project-user-roles/${encodeURIComponent(objectLevelId)}?role=Requester`,
      { credentials: 'include' }
    )
    if (!res.ok) throw new Error('requesters load failed')
    const payload = await res.json()
    requesterUsers.value = uniqueByUserId(normalizeArray(payload)).map((item) => ({
      id: item.user_id,
      fio: formatUserFio(item.user),
    })).filter((item) => item.id)
    if (selectedExecutorId.value && !requesterUsers.value.some((u) => u.id === selectedExecutorId.value)) {
      selectedExecutorId.value = ''
      requestExecutor.value = ''
    }
  } catch (error) {
    requesterUsers.value = []
    requesterUsersError.value = 'Не удалось загрузить исполнителей.'
  } finally {
    requesterUsersLoading.value = false
  }
}

const loadRequestApprovers = async (objectLevelId) => {
  const role = encodeURIComponent('Request approver')
  const res = await fetch(
    `/apisup/supply/project-user-roles/${encodeURIComponent(objectLevelId)}?role=${role}`,
    { credentials: 'include' }
  )
  if (!res.ok) throw new Error('approvers load failed')
  return uniqueByUserId(normalizeArray(await res.json()))
}

const attachmentName = (item) =>
  item?.name
  || item?.file_name
  || item?.filename
  || item?.original_name
  || `Файл ${item?.id || ''}`.trim()

const mapAttachment = (item) => ({
  id: item?.id || item?.file_id || item?.uuid || item?.key || '',
  name: attachmentName(item),
})

const loadAttachments = async () => {
  if (isCreateMode || !requestId) {
    attachments.value = []
    return
  }
  attachmentsLoading.value = true
  attachmentsError.value = ''
  try {
    const res = await fetch(`/apisup/supply/requests/${encodeURIComponent(requestId)}/attachments`, {
      credentials: 'include',
    })
    if (!res.ok) throw new Error('attachments load failed')
    const payload = await res.json()
    attachments.value = normalizeArray(payload)
      .map(mapAttachment)
      .filter((item) => item.id)
  } catch (error) {
    attachments.value = []
    attachmentsError.value = 'Не удалось загрузить вложения.'
  } finally {
    attachmentsLoading.value = false
  }
}

const uploadAttachment = async (file) => {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch(`/apisup/supply/requests/${encodeURIComponent(requestId)}/attachments`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  if (!res.ok) throw new Error('attachment upload failed')
}

const handleFilePick = async (event) => {
  const picked = Array.from(event.target.files || [])
  event.target.value = ''
  if (!picked.length || isCreateMode || !requestId || !isRequestEditable.value) return
  attachmentsUploading.value = true
  attachmentsError.value = ''
  try {
    for (const file of picked) {
      // API принимает загрузку по одному файлу.
      // eslint-disable-next-line no-await-in-loop
      await uploadAttachment(file)
    }
    await loadAttachments()
  } catch (error) {
    attachmentsError.value = 'Не удалось загрузить один или несколько файлов.'
  } finally {
    attachmentsUploading.value = false
  }
}

const getFilenameFromDisposition = (headerValue) => {
  if (!headerValue) return ''
  const utfMatch = headerValue.match(/filename\*=UTF-8''([^;]+)/i)
  if (utfMatch?.[1]) return decodeURIComponent(utfMatch[1])
  const asciiMatch = headerValue.match(/filename=\"?([^\";]+)\"?/i)
  return asciiMatch?.[1] || ''
}

const downloadAttachment = async (file) => {
  if (!file?.id || isCreateMode || !requestId) return
  attachmentsError.value = ''
  try {
    const res = await fetch(
      `/apisup/supply/requests/${encodeURIComponent(requestId)}/attachments/${encodeURIComponent(file.id)}/download`,
      { credentials: 'include' }
    )
    if (!res.ok) throw new Error('attachment download failed')
    const blob = await res.blob()
    const contentDisposition = res.headers.get('content-disposition')
    const downloadName = getFilenameFromDisposition(contentDisposition) || file.name || 'attachment'
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = downloadName
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  } catch (error) {
    attachmentsError.value = 'Не удалось скачать файл.'
  }
}

const selectProject = async (item) => {
  if (!isRequestEditable.value) return
  selectedObjectLevelId.value = item.id
  requestProject.value = item.name || ''
  isProjectDropdownOpen.value = false
  selectedExecutorId.value = ''
  requestExecutor.value = ''
  await loadRequesterUsers(item.id)
}

const onProjectInput = () => {
  if (!isRequestEditable.value) return
  selectedObjectLevelId.value = ''
  selectedExecutorId.value = ''
  requestExecutor.value = ''
  requesterUsers.value = []
  isProjectDropdownOpen.value = true
}

const selectExecutor = (item) => {
  if (!isRequestEditable.value) return
  selectedExecutorId.value = item.id
  requestExecutor.value = item.fio || ''
  isExecutorDropdownOpen.value = false
}

const onExecutorInput = () => {
  if (!isRequestEditable.value) return
  selectedExecutorId.value = ''
  isExecutorDropdownOpen.value = true
}

const openRequiredDatePicker = () => {
  const el = requiredDateRef.value
  if (!el) return
  if (typeof el.showPicker === 'function') {
    try {
      el.showPicker()
      return
    } catch {
      // fallback to focus/click
    }
  }
  el.focus()
  el.click()
}

const closeNomenclatureDropdown = () => {
  activeNomenclatureRow.value = null
  nomenclatureItems.value = []
  nomenclatureLoading.value = false
  nomenclatureError.value = ''
}

const searchNomenclature = async (query) => {
  const q = String(query || '').trim()
  if (q.length < 2) {
    nomenclatureItems.value = []
    nomenclatureLoading.value = false
    nomenclatureError.value = ''
    return
  }
  nomenclatureLoading.value = true
  nomenclatureError.value = ''
  try {
    const res = await fetch(`/apisup/supply/nomenclature?search=${encodeURIComponent(q)}`, {
      credentials: 'include',
    })
    if (!res.ok) throw new Error('nomenclature search failed')
    nomenclatureItems.value = normalizeArray(await res.json())
  } catch (error) {
    nomenclatureItems.value = []
    nomenclatureError.value = 'Не удалось загрузить номенклатуру.'
  } finally {
    nomenclatureLoading.value = false
  }
}

const onItemInput = (row, value, event) => {
  if (!isRequestEditable.value) return
  suppressItemBlurSaveRowIndex.value = null
  setCell(row, 'item', value)
  autosize(event)
  activeNomenclatureRow.value = row.index
  if (nomenclatureSearchTimer) clearTimeout(nomenclatureSearchTimer)
  nomenclatureSearchTimer = setTimeout(() => {
    searchNomenclature(value)
  }, 180)
}

const onItemFocus = (row) => {
  if (!isRequestEditable.value) return
  activeNomenclatureRow.value = row.index
  if (String(row.item || '').trim().length >= 2) {
    searchNomenclature(row.item)
  }
}

const selectNomenclature = async (row, item) => {
  row.nomenclatureId = item?.id || ''
  row.item = item?.name || row.item
  row.unitId = item?.unit_id || item?.unit?.id || row.unitId
  row.categoryId = item?.warehouse_category_id || item?.warehouse_category?.id || row.categoryId
  closeNomenclatureDropdown()
  queueSaveRow(row).catch(() => {})
  await nextTick()
  const el = document.querySelector(`.cell-textarea[data-row="${row.index}"][data-col="item"]`)
  if (el) {
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }
}

const onNomenclaturePointerDown = (row) => {
  suppressItemBlurSaveRowIndex.value = row.index
}

const onItemBlur = (row) => {
  if (!isRequestEditable.value) return
  if (suppressItemBlurSaveRowIndex.value === row.index) {
    suppressItemBlurSaveRowIndex.value = null
    return
  }
  queueSaveRow(row).catch(() => {})
}

const onUnitChange = (row, value) => {
  if (!isRequestEditable.value) return
  row.unitId = value || ''
  if (row.nomenclatureId) row.nomenclatureId = ''
  queueSaveRow(row).catch(() => {})
}

const onCategoryChange = (row, value) => {
  if (!isRequestEditable.value) return
  row.categoryId = value || ''
  if (row.nomenclatureId) row.nomenclatureId = ''
  queueSaveRow(row).catch(() => {})
}

const onQtyBlur = (row) => {
  if (!isRequestEditable.value) return
  row.qty = formatField(row.qty)
  queueSaveRow(row).catch(() => {})
}

const onCommentBlur = (row) => {
  if (!isRequestEditable.value) return
  queueSaveRow(row).catch(() => {})
}

const deleteAttachment = async (file) => {
  if (!isRequestEditable.value) return
  if (!file?.id || isCreateMode || !requestId) return
  attachmentsError.value = ''
  try {
    const res = await fetch(
      `/apisup/supply/requests/${encodeURIComponent(requestId)}/attachments/${encodeURIComponent(file.id)}`,
      {
        method: 'DELETE',
        credentials: 'include',
      }
    )
    if (!res.ok) throw new Error('attachment delete failed')
    await loadAttachments()
  } catch (error) {
    attachmentsError.value = 'Не удалось удалить файл.'
  }
}

const closeRowContextMenu = () => {
  rowContextMenu.value.open = false
  rowContextMenu.value.rowIndex = null
}

const openRowContextMenu = (event, row) => {
  event.preventDefault()
  rowContextMenu.value = {
    open: true,
    x: event.clientX,
    y: event.clientY,
    rowIndex: row.index,
  }
}

const deleteItemById = async (itemId) => {
  const res = await fetch(
    `/apisup/supply/requests/${encodeURIComponent(requestId)}/items/${encodeURIComponent(itemId)}`,
    {
      method: 'DELETE',
      credentials: 'include',
    }
  )
  if (!res.ok) throw new Error('item delete failed')
}

const deleteRowOnly = async (rowIndex) => {
  const row = rows.value[rowIndex - 1]
  if (!row) return
  try {
    if (!isCreateMode && requestId && row.itemId) {
      await deleteItemById(row.itemId)
    }
    clearRowData(row)
  } catch (error) {
    saveError.value = 'Не удалось удалить строку.'
  } finally {
    closeRowContextMenu()
  }
}

const deleteRowWithShiftUp = async (rowIndex) => {
  const idx = rowIndex - 1
  const current = rows.value[idx]
  if (!current) return

  try {
    if (!isCreateMode && requestId && current.itemId) {
      await deleteItemById(current.itemId)
    }

    for (let i = idx; i < rows.value.length - 1; i += 1) {
      const nextData = cloneRowData(rows.value[i + 1])
      assignRowData(rows.value[i], nextData)
    }
    clearRowData(rows.value[rows.value.length - 1])

    // After shift, persisted items got new num (row index). Update them in order.
    for (let i = idx; i < rows.value.length; i += 1) {
      const row = rows.value[i]
      if (!row.itemId) continue
      if (isCreateMode || !requestId) continue
      // eslint-disable-next-line no-await-in-loop
      await saveRowItem(row)
    }
  } catch (error) {
    saveError.value = 'Не удалось удалить строку со сдвигом.'
  } finally {
    closeRowContextMenu()
  }
}

const handleRowAction = async (action) => {
  const rowIndex = rowContextMenu.value.rowIndex
  if (!rowIndex) return
  if (action === 'delete') {
    await deleteRowOnly(rowIndex)
    closeRowContextMenu()
    return
  }
  if (action === 'delete-shift') {
    await deleteRowWithShiftUp(rowIndex)
    closeRowContextMenu()
    return
  }
  if (action === 'link-spec') {
    closeRowContextMenu()
    openSpecModal(rowIndex, 'link')
    return
  }
  if (action === 'edit-spec') {
    closeRowContextMenu()
    openSpecModal(rowIndex, 'edit')
    return
  }
  if (action === 'unlink-spec') {
    specRowIndex.value = rowIndex
    openDeleteConfirm()
    closeRowContextMenu()
    return
  }
}

const triggerFileDialog = () => {
  if (isCreateMode || !isRequestEditable.value) return
  const el = document.getElementById('request-files-input')
  if (el) el.click()
}

const goBack = () => router.push(backLink)
const saveRequest = async () => {
  if (isCreateMode || !requestId || !isRequestEditable.value) return
  saveError.value = ''
  saveSuccess.value = ''
  if (!requestName.value.trim()) {
    saveError.value = 'Введите название заявки.'
    return
  }
  saveLoading.value = true
  try {
    const objectLevelId = selectedObjectLevelId.value || initialObjectLevelId.value || null
    const executorId = selectedExecutorId.value || initialExecutorId.value || null
    const deadlineIso = requiredDate.value ? `${requiredDate.value}T00:00:00.000Z` : null
    const body = {
      object_levels_id: objectLevelId,
      name: requestName.value.trim(),
      executor: executorId,
      deadline: deadlineIso,
      comment: requestComment.value || '',
    }
    let res = await fetch(`/apisup/supply/requests/my/${encodeURIComponent(requestId)}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      res = await fetch(`/apisup/supply/requests/${encodeURIComponent(requestId)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    }
    if (!res.ok) throw new Error('request patch failed')
    saveSuccess.value = 'Изменения сохранены.'
    setTimeout(() => {
      saveSuccess.value = ''
    }, 2000)
  } catch (error) {
    saveError.value = 'Не удалось сохранить заявку.'
  } finally {
    saveLoading.value = false
  }
}

const showToast = (message, type = 'success') => {
  toast.value = {
    open: true,
    message,
    type,
    closing: false,
    key: toast.value.key + 1,
  }
  if (toastTimer) clearTimeout(toastTimer)
  if (toastCloseTimer) clearTimeout(toastCloseTimer)
  toastCloseTimer = setTimeout(() => {
    toast.value = { ...toast.value, closing: true }
  }, 2300)
  toastTimer = setTimeout(() => {
    toast.value = { open: false, message: '', type: 'success', closing: false, key: toast.value.key }
  }, 2600)
}

const sendRequestToApprovers = async () => {
  if (isCreateMode || !requestId || !isRequestEditable.value) return
  const objectLevelId = selectedObjectLevelId.value || initialObjectLevelId.value
  if (!objectLevelId) {
    showToast('Не выбран проект заявки.', 'error')
    return
  }

  submitLoading.value = true
  try {
    const approvers = await loadRequestApprovers(objectLevelId)
    if (!approvers.length) {
      showToast('Для проекта нет согласующих (Request approver).', 'error')
      return
    }

    for (const approver of approvers) {
      const userId = approver?.user_id
      if (!userId) continue
      // API ожидает добавление согласующих по одному.
      // eslint-disable-next-line no-await-in-loop
      const res = await fetch(`/apisup/supply/requests/${encodeURIComponent(requestId)}/approvers`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          status_name: 'pending',
        }),
      })
      if (!res.ok) throw new Error('approver create failed')
    }

    const patchRes = await fetch(`/apisup/supply/requests/${encodeURIComponent(requestId)}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        started_at: new Date().toISOString(),
      }),
    })
    if (!patchRes.ok) throw new Error('request patch started_at failed')

    hasApprovers.value = true
    await loadRequest()
    showToast('Заявка отправлена на согласование.', 'success')
  } catch (error) {
    showToast('Не удалось отправить заявку на согласование.', 'error')
  } finally {
    submitLoading.value = false
  }
}

const toInputDate = (value) => {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const toQtyString = (value) => {
  if (value === null || value === undefined || value === '') return ''
  const num = Number(value)
  if (!Number.isFinite(num)) return String(value)
  return String(num).replace('.', ',')
}

const mapItemToRow = (item, index) => ({
  index,
  checked: false,
  itemId: item?.id || '',
  nomenclatureId: item?.nomenclature?.id || '',
  item: item?.name || item?.nomenclature?.name || '',
  unitId: item?.unit?.id || item?.nomenclature?.unit?.id || '',
  qty: toQtyString(item?.quantity),
  categoryId: item?.warehouse_category?.id || item?.nomenclature?.warehouse_category?.id || '',
  extComment: item?.comment || '',
})

const loadRequest = async () => {
  if (isCreateMode) {
    requestStatusName.value = 'Новая'
    requestName.value = ''
    requestLogs.value = []
    hasApprovers.value = false
    if (selectedObjectLevelId.value) {
      const selectedProject = requestObjects.value.find((item) => item.id === selectedObjectLevelId.value)
      if (selectedProject?.name) {
        requestProject.value = selectedProject.name
      }
      await loadRequesterUsers(selectedObjectLevelId.value)
    }
    rows.value = createEmptyRows()
    checkedAllRows.value = false
    attachments.value = []
    return
  }
  if (!requestId) {
    requestStatusName.value = ''
    loadError.value = 'Не указан идентификатор заявки.'
    requestLogs.value = []
    hasApprovers.value = false
    rows.value = createEmptyRows()
    checkedAllRows.value = false
    return
  }

  loading.value = true
  loadError.value = ''
  try {
    let res = await fetch(`/apisup/supply/requests/my/${encodeURIComponent(requestId)}`, {
      credentials: 'include',
    })
    if (!res.ok) {
      res = await fetch(`/apisup/requests/my/${encodeURIComponent(requestId)}`, {
        credentials: 'include',
      })
    }
    if (!res.ok) throw new Error('request load failed')
    const payload = await res.json()

    requestName.value = payload?.name || `Заявка #${requestId}`
    requestStatusName.value = String(payload?.status?.name || '')
    selectedObjectLevelId.value = payload?.object_levels_id || selectedObjectLevelId.value || ''
    initialObjectLevelId.value = selectedObjectLevelId.value || ''
    requestProject.value = payload?.project_name || requestProject.value || ''
    selectedExecutorId.value = payload?.executor || ''
    initialExecutorId.value = selectedExecutorId.value || ''
    requestExecutor.value =
      payload?.executor_user?.short_fio
      || `${payload?.executor_user?.surname || ''} ${payload?.executor_user?.name || ''}`.trim()
      || ''
    requiredDate.value = toInputDate(payload?.deadline)
    requestComment.value = payload?.comment || ''
    hasApprovers.value = Array.isArray(payload?.logs) && payload.logs.length > 0
    requestLogs.value = Array.isArray(payload?.logs) ? payload.logs : []

    const apiItems = Array.isArray(payload?.items) ? payload.items : []
    const sortedItems = [...apiItems].sort((a, b) => {
      const aNum = Number(a?.num ?? Number.MAX_SAFE_INTEGER)
      const bNum = Number(b?.num ?? Number.MAX_SAFE_INTEGER)
      return aNum - bNum
    })
    const mapped = sortedItems.map((item, idx) => mapItemToRow(item, idx + 1))
    const filler = createEmptyRows(Math.max(0, 500 - mapped.length)).map((row, idx) => ({
      ...row,
      index: mapped.length + idx + 1,
    }))
    rows.value = [...mapped, ...filler]
    checkedAllRows.value = false
    if (selectedObjectLevelId.value) {
      await loadRequesterUsers(selectedObjectLevelId.value)
      if (!requestExecutor.value && selectedExecutorId.value) {
        const found = requesterUsers.value.find((u) => u.id === selectedExecutorId.value)
        requestExecutor.value = found?.fio || ''
      }
    }
    await loadAttachments()
  } catch (error) {
    requestStatusName.value = ''
    requestLogs.value = []
    hasApprovers.value = false
    rows.value = createEmptyRows()
    checkedAllRows.value = false
    loadError.value = 'Не удалось загрузить заявку.'
  } finally {
    loading.value = false
  }
}

const currentUserId = computed(() => String(auth?.user?.id || ''))

const myPendingLog = computed(() =>
  requestLogs.value.find((log) =>
    String(log?.user_id || '') === currentUserId.value
    && String(log?.status_name || '').toLowerCase() === 'pending')
)

const canRespondToRequest = computed(() =>
  !isCreateMode
  && Boolean(requestId)
  && Boolean(currentUserId.value)
  && Boolean(myPendingLog.value?.id)
)

const patchRequestByMajority = async (logs, responseDateIso) => {
  const total = logs.length
  if (!total) return
  const approvedCount = logs.filter((log) => String(log?.status_name || '').toLowerCase() === 'approved').length
  const rejectedCount = logs.filter((log) => String(log?.status_name || '').toLowerCase() === 'rejected').length
  const majorityCount = Math.floor(total / 2) + 1

  if (approvedCount < majorityCount && rejectedCount < majorityCount) return

  const body = approvedCount >= majorityCount
    ? {
      status_id: STATUS_ID_IN_PROGRESS,
      approved_at: responseDateIso,
    }
    : {
      status_id: STATUS_ID_REJECTED,
      rejected_at: responseDateIso,
    }

  const res = await fetch(`/apisup/supply/requests/${encodeURIComponent(requestId)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('request status patch failed')
}

const respondRequest = async (statusName) => {
  if (!canRespondToRequest.value || !myPendingLog.value?.id) return

  decisionLoading.value = true
  const responseDateIso = new Date().toISOString()
  try {
    const res = await fetch(
      `/apisup/supply/requests/${encodeURIComponent(requestId)}/approvers/${encodeURIComponent(myPendingLog.value.id)}`,
      {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: currentUserId.value,
          status_name: statusName,
          date_response: responseDateIso,
        }),
      }
    )
    if (!res.ok) throw new Error('approver response patch failed')

    const nextLogs = requestLogs.value.map((log) =>
      String(log?.id || '') === String(myPendingLog.value.id)
        ? { ...log, status_name: statusName, date_response: responseDateIso }
        : log)

    await patchRequestByMajority(nextLogs, responseDateIso)
    await loadRequest()
    showToast(statusName === 'approved' ? 'Заявка согласована.' : 'Заявка отклонена.', 'success')
  } catch (error) {
    showToast('Не удалось отправить решение по заявке.', 'error')
  } finally {
    decisionLoading.value = false
  }
}

const closeDropdownsOnOutside = (event) => {
  const target = event.target
  if (!(target instanceof Node)) return
  if (projectLookupRef.value && !projectLookupRef.value.contains(target)) {
    isProjectDropdownOpen.value = false
  }
  if (executorLookupRef.value && !executorLookupRef.value.contains(target)) {
    isExecutorDropdownOpen.value = false
  }
  if (!(target instanceof Element) || !target.closest('.nomenclature-wrap')) {
    closeNomenclatureDropdown()
  }
  if (!(target instanceof Element) || !target.closest('.row-context-menu')) {
    closeRowContextMenu()
  }
}

const refreshCategoriesOnFocus = async () => {
  if (!categoryModalOpen.value) return
  await loadWarehouseCategories()
}

onBeforeUnmount(() => {
  attachments.value = []
  if (nomenclatureSearchTimer) clearTimeout(nomenclatureSearchTimer)
  if (toastTimer) clearTimeout(toastTimer)
  if (toastCloseTimer) clearTimeout(toastCloseTimer)
  window.removeEventListener('mousedown', closeDropdownsOnOutside)
  window.removeEventListener('mousemove', onFillMouseMove)
  window.removeEventListener('mouseup', stopFillDown)
  window.removeEventListener('focus', refreshCategoriesOnFocus)
})

const loadSpecifications = async () => {
  const rid = String(requestId || '')
  if (!rid) {
    specificationsMap.value = {}
    return
  }
  try {
    const res = await fetch(`/apisup/supply/request-specifications?request_id=${encodeURIComponent(rid)}`, {
      credentials: 'include',
    })
    if (!res.ok) throw new Error('specifications load failed')
    const payload = await res.json()
    const list = Array.isArray(payload) ? payload : []
    const map = {}
    for (const spec of list) {
      const rid = String(spec?.request_item_id || '')
      if (rid) {
        map[rid] = {
          row_id: String(spec?.request_specification_id || ''),
          spec_id: String(spec?.specification_id || ''),
          spec_item_id: String(spec?.specification_item_id || ''),
          spec_item_name: String(spec?.specification_item_name || ''),
        }
      }
    }
    specificationsMap.value = map
  } catch {
    specificationsMap.value = {}
  }
}

onMounted(async () => {
  await Promise.all([loadRequestObjects(), loadUnits(), loadWarehouseCategories()])
  await loadRequest()
  await loadSpecifications()
  window.addEventListener('mousedown', closeDropdownsOnOutside)
  window.addEventListener('mousemove', onFillMouseMove)
  window.addEventListener('mouseup', stopFillDown)
  window.addEventListener('focus', refreshCategoriesOnFocus)
  await nextTick()
  document.querySelectorAll('.cell-textarea[data-col="item"]').forEach((el) => {
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  })
})
</script>

<template>
  <div class="page">
    <div v-if="loading" class="fullscreen-loader">
      <div class="loader-spinner"></div>
      <span>Загрузка заявки...</span>
    </div>
    <template v-else>
      <TopNav :links="navLinks" />
      <main class="main-content">
        <div v-if="loadError" class="inline-state error">{{ loadError }}</div>
        <div class="content-header">
        <div class="header-fields">
          <button class="back-btn" type="button" @click="goBack" aria-label="Вернуться назад">
            <i class="fas fa-chevron-left"></i>
            <span>Вернуться</span>
          </button>

          <div class="field">
            <label>Название заявки</label>
            <input v-model="requestName" :disabled="!isRequestEditable" type="text" placeholder="Введите название заявки">
          </div>

          <div class="field">
            <label>Проект заявки</label>
            <div ref="projectLookupRef" class="lookup-wrap">
              <div class="input-with-icon">
                <input
                  v-model="requestProject"
                  type="text"
                  class="lookup-input"
                  placeholder="Выберите проект заявки"
                  :disabled="!isRequestEditable"
                  @focus="isProjectDropdownOpen = true"
                  @input="onProjectInput"
                >
                <button class="field-icon-btn" type="button" :disabled="!isRequestEditable" @click="isProjectDropdownOpen = !isProjectDropdownOpen">
                  <i class="fas fa-chevron-down"></i>
                </button>
              </div>
              <div v-if="isProjectDropdownOpen" class="lookup-list lookup-list-overlay">
                <div v-if="requestObjectsLoading" class="lookup-empty">Загрузка...</div>
                <div v-else-if="requestObjectsError" class="lookup-empty error">{{ requestObjectsError }}</div>
                <button
                  v-for="item in filteredRequestObjects"
                  :key="item.id"
                  class="lookup-item"
                  type="button"
                  @click="selectProject(item)"
                >
                  {{ item.name }}
                </button>
                <div v-if="!requestObjectsLoading && !requestObjectsError && filteredRequestObjects.length === 0" class="lookup-empty">
                  Ничего не найдено
                </div>
              </div>
            </div>
          </div>

          <div class="field-row">
            <div class="field">
              <label>Исполнитель заявки</label>
              <div ref="executorLookupRef" class="lookup-wrap">
              <div class="input-with-icon">
                <input
                  v-model="requestExecutor"
                  type="text"
                  class="lookup-input"
                  placeholder="Выберите исполнителя"
                  :disabled="!selectedObjectLevelId || !isRequestEditable"
                  @focus="isExecutorDropdownOpen = true"
                  @input="onExecutorInput"
                >
                <button
                  class="field-icon-btn"
                  type="button"
                  :disabled="!selectedObjectLevelId || !isRequestEditable"
                  @click="isExecutorDropdownOpen = !isExecutorDropdownOpen"
                >
                  <i class="fas fa-chevron-down"></i>
                </button>
              </div>
              <div v-if="isExecutorDropdownOpen" class="lookup-list lookup-list-overlay">
                <div v-if="requesterUsersLoading" class="lookup-empty">Загрузка...</div>
                <div v-else-if="requesterUsersError" class="lookup-empty error">{{ requesterUsersError }}</div>
                <button
                  v-for="item in filteredRequesterUsers"
                  :key="item.id"
                  class="lookup-item"
                  type="button"
                  @click="selectExecutor(item)"
                >
                  {{ item.fio }}
                </button>
                <div v-if="!requesterUsersLoading && !requesterUsersError && filteredRequesterUsers.length === 0" class="lookup-empty">
                  Ничего не найдено
                </div>
              </div>
            </div>
          </div>

          <div class="field">
            <label>Требуемая дата поставки</label>
            <input
              ref="requiredDateRef"
              v-model="requiredDate"
              :disabled="!isRequestEditable"
              type="date"
              @focus="openRequiredDatePicker"
              @click="openRequiredDatePicker"
            >
          </div>
          </div>

          <div class="field">
            <label>Комментарий к заявке</label>
            <textarea v-model="requestComment" :disabled="!isRequestEditable" rows="3" placeholder="Добавьте комментарий"></textarea>
          </div>

          <div class="files-block">
            <div class="files-title">Файлы заявки</div>
            <input id="request-files-input" class="hidden-input" type="file" multiple @change="handleFilePick">
            <div class="files-dropzone" :class="{ disabled: isCreateMode || !isRequestEditable }" @click="triggerFileDialog">
              <i class="fas fa-paperclip"></i>
              <span>{{ isCreateMode ? 'Сначала сохраните заявку' : (!isRequestEditable ? 'Редактирование недоступно' : 'Прикрепить файлы') }}</span>
            </div>
            <div v-if="attachmentsUploading" class="files-hint">Загрузка файлов...</div>
            <div v-if="attachmentsLoading" class="files-hint">Загрузка вложений...</div>
            <div v-else-if="attachmentsError" class="files-hint error">{{ attachmentsError }}</div>
            <div v-if="!attachmentsLoading && attachments.length" class="files-list">
              <div v-for="file in attachments" :key="file.id" class="file-item">
                <span class="file-name" :title="file.name">{{ file.name }}</span>
                <div class="file-actions">
                  <button class="file-download" type="button" @click="downloadAttachment(file)">
                    <i class="fas fa-download"></i>
                  </button>
                  <button class="file-delete" type="button" :disabled="!isRequestEditable" @click="deleteAttachment(file)">
                    <i class="fas fa-trash"></i>
                  </button>
                </div>
              </div>
            </div>
            <div v-else-if="!attachmentsLoading && !attachmentsError && !isCreateMode" class="files-hint">
              Файлы не прикреплены
            </div>
          </div>

          <div class="save-row">
            <button class="btn btn-primary" type="button" :disabled="saveLoading || isCreateMode || !isRequestEditable" @click="saveRequest">
              {{ saveLoading ? 'Сохранение...' : 'Сохранить' }}
            </button>
            <transition name="send-btn-fade">
              <button
                v-if="canRespondToRequest"
                class="btn btn-success"
                type="button"
                :disabled="decisionLoading || submitLoading || isCreateMode"
                @click="respondRequest('approved')"
              >
                {{ decisionLoading ? 'Отправка...' : 'Согласовать' }}
              </button>
            </transition>
            <transition name="send-btn-fade">
              <button
                v-if="canRespondToRequest"
                class="btn btn-danger"
                type="button"
                :disabled="decisionLoading || submitLoading || isCreateMode"
                @click="respondRequest('rejected')"
              >
                {{ decisionLoading ? 'Отправка...' : 'Отклонить' }}
              </button>
            </transition>
            <transition name="send-btn-fade">
              <button
                v-if="!hasApprovers && isRequestEditable"
                class="btn"
                type="button"
                :disabled="submitLoading || isCreateMode"
                @click="sendRequestToApprovers"
              >
                {{ submitLoading ? 'Отправка...' : 'Отправить заявку' }}
              </button>
            </transition>
            <button
              v-if="isRequestEditable && checkedRows.length"
              class="btn btn-danger"
              type="button"
              @click="deleteCheckedRows(false)"
            >
              Удалить выбранные ({{ checkedRows.length }})
            </button>
            <button
              v-if="isRequestEditable && checkedRows.length"
              class="btn"
              type="button"
              @click="deleteCheckedRows(true)"
            >
              Удалить со сдвигом ({{ checkedRows.length }})
            </button>
            <button class="btn" type="button" @click="resetFilters">
              Сбросить фильтры
            </button>
            <button class="btn" type="button" @click="openPrintModal">
              Распечатать
            </button>
            <span v-if="saveError" class="save-state error">{{ saveError }}</span>
            <span v-else-if="saveSuccess" class="save-state success">{{ saveSuccess }}</span>
          </div>
        </div>
      </div>

      <div class="table-wrapper" @paste="handlePaste">
        <table class="request-table">
          <colgroup>
            <col class="col-check">
            <col class="col-index">
            <col>
            <col class="col-qty">
            <col class="col-unit">
            <col>
            <col>
          </colgroup>
          <thead>
            <tr>
              <th><input v-model="checkedAllRows" type="checkbox" aria-label="Выбрать все позиции" @change="toggleAllRowsChecked"></th>
              <th>№</th>
              <th>Товар</th>
              <th>Количество</th>
              <th>Ед. изм.</th>
              <th>Товарная категория</th>
              <th>Комментарий внешний</th>
            </tr>
            <tr class="filter-row">
              <th></th>
              <th></th>
              <th><input v-model="filters.item" class="filter-input" type="text" placeholder="Поиск товара"></th>
              <th><input v-model="filters.qty" class="filter-input" type="text" placeholder="Кол-во"></th>
              <th>
                <select v-model="filters.unitId" class="filter-input">
                  <option value="">Все</option>
                  <option v-for="unit in unitOptions" :key="`filter-unit-${unit.id}`" :value="unit.id">{{ unit.name }}</option>
                </select>
              </th>
              <th>
                <button class="filter-category-btn" type="button" @click="openCategoryModal(null)">
                  {{ categoryFilterLabel || 'Выбрать категорию' }}
                </button>
              </th>
              <th><input v-model="filters.extComment" class="filter-input" type="text" placeholder="Комментарий"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in visibleRows" :key="row.index" :data-row="row.index" @contextmenu="openRowContextMenu($event, row)" @mouseenter="onFillRowHover(row.index)">
              <td class="check-cell">
                <input v-model="row.checked" type="checkbox" :aria-label="`Выбрать строку ${row.index}`" @change="syncCheckedAll">
              </td>
              <td class="mono">
                <span class="mono-num">{{ row.index }}</span>
                <span v-if="specificationsMap[row.itemId]" class="spec-indicator">
                  <i class="fas fa-link"></i>
                  <span class="spec-tooltip">{{ specificationsMap[row.itemId].spec_item_name }}</span>
                </span>
              </td>
              <td :class="{ 'cell-active': activeCell.row === row.index && activeCell.col === 'item', 'cell-fill-preview': isFillPreviewCell(row.index, 'item') }">
                <div class="nomenclature-wrap">
                  <textarea
                    class="cell-textarea"
                    rows="1"
                    :value="row.item"
                    :data-row="row.index"
                    data-col="item"
                    :disabled="!isRequestEditable"
                    @focus="onItemFocus(row)"
                    @input="(e) => onItemInput(row, e.target.value, e)"
                    @mousedown="setActiveCell(row.index, 'item')"
                    @blur="onItemBlur(row)"
                  ></textarea>
                  <div v-if="activeNomenclatureRow === row.index" class="nomenclature-dropdown">
                    <div v-if="nomenclatureLoading" class="nomenclature-empty">Загрузка...</div>
                    <div v-else-if="nomenclatureError" class="nomenclature-empty error">{{ nomenclatureError }}</div>
                    <button
                      v-for="item in nomenclatureItems"
                      :key="item.id"
                      class="nomenclature-item"
                      type="button"
                      @mousedown="onNomenclaturePointerDown(row)"
                      @click="selectNomenclature(row, item)"
                    >
                      <span class="nomenclature-name">{{ item.name }}</span>
                      <span class="nomenclature-meta">
                        {{
                          item.unit?.name || '—'
                        }} | {{
                          categoryLabelById(item.warehouse_category?.id || item.warehouse_category_id, item.warehouse_category?.name || '—')
                        }}
                      </span>
                    </button>
                  </div>
                </div>
                <span
                  v-if="isRequestEditable"
                  class="fill-handle"
                  @mousedown.prevent="startFillDown(row.index, 'item', row.item)"
                ></span>
              </td>
              <td :class="{ 'cell-active': activeCell.row === row.index && activeCell.col === 'qty', 'cell-fill-preview': isFillPreviewCell(row.index, 'qty') }">
                <div class="cell-with-handle">
                <input
                  class="cell-input"
                  type="text"
                  :value="row.qty"
                  :data-row="row.index"
                  data-col="qty"
                  :disabled="!isRequestEditable"
                  @mousedown="setActiveCell(row.index, 'qty')"
                  @input="(e) => { setCell(row, 'qty', e.target.value); e.target.value = row.qty }"
                  @blur="(e) => { onQtyBlur(row); e.target.value = row.qty }"
                >
                <span
                  v-if="isRequestEditable"
                  class="fill-handle"
                  @mousedown.prevent="startFillDown(row.index, 'qty', row.qty)"
                ></span>
                </div>
              </td>
              <td :class="{ 'cell-active': activeCell.row === row.index && activeCell.col === 'unit', 'cell-fill-preview': isFillPreviewCell(row.index, 'unit') }">
                <div class="cell-with-handle">
                <select
                  class="cell-select"
                  :value="row.unitId"
                  :data-row="row.index"
                  data-col="unit"
                  :disabled="!isRequestEditable"
                  @mousedown="setActiveCell(row.index, 'unit')"
                  @change="(e) => onUnitChange(row, e.target.value)"
                >
                  <option value=""></option>
                  <option v-for="unit in unitOptions" :key="unit.id" :value="unit.id">{{ unit.name }}</option>
                </select>
                <span
                  v-if="isRequestEditable"
                  class="fill-handle"
                  @mousedown.prevent="startFillDown(row.index, 'unit', row.unitId)"
                ></span>
                </div>
              </td>
              <td :class="{ 'cell-active': activeCell.row === row.index && activeCell.col === 'category', 'cell-fill-preview': isFillPreviewCell(row.index, 'category') }">
                <div class="cell-with-handle">
                  <button class="cell-category-btn" type="button" :disabled="!isRequestEditable" @mousedown="setActiveCell(row.index, 'category')" @click="openCategoryModal(row.index)">
                    {{ categoryLabelById(row.categoryId, '') || 'Выбрать категорию' }}
                  </button>
                  <span
                    v-if="isRequestEditable"
                    class="fill-handle"
                    @mousedown.prevent="startFillDown(row.index, 'category', row.categoryId)"
                  ></span>
                </div>
              </td>
              <td :class="{ 'cell-active': activeCell.row === row.index && activeCell.col === 'extComment', 'cell-fill-preview': isFillPreviewCell(row.index, 'extComment') }">
                <div class="cell-with-handle">
                  <textarea
                    class="cell-textarea"
                    rows="1"
                    :value="row.extComment"
                    :data-row="row.index"
                    data-col="extComment"
                    :disabled="!isRequestEditable"
                    @mousedown="setActiveCell(row.index, 'extComment')"
                    @input="(e) => { setCell(row, 'extComment', e.target.value); autosize(e) }"
                    @blur="onCommentBlur(row)"
                  ></textarea>
                  <span
                    v-if="isRequestEditable"
                    class="fill-handle"
                    @mousedown.prevent="startFillDown(row.index, 'extComment', row.extComment)"
                  ></span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <CategoryTreePickerModal
        :open="categoryModalOpen"
        title="Выберите товарную категорию"
        :categories="categoryOptions"
        :selected-id="categoryModalRowIndex == null ? filters.categoryId : (rows[Number(categoryModalRowIndex) - 1]?.categoryId || '')"
        :allow-none="true"
        none-label="Без категории"
        :show-create="true"
        create-label="+ Создать товарную категорию"
        @close="closeCategoryModal"
        @select="(id) => applyCategoryFromModal({ id })"
        @create="openCategoryCreate"
      />

      <div v-if="printModalOpen" class="modal-backdrop" @click="closePrintModal">
        <div class="modal-card print-modal-card" @click.stop>
          <div class="modal-title">Печать заявки</div>
          <div class="print-hint">
            {{ rows.some((r) => r.checked) ? `На печать пойдут только отмеченные строки: ${printRows.length}` : `На печать пойдут все отфильтрованные непустые строки: ${printRows.length}` }}
          </div>
          <div class="print-section-title">Поля шапки</div>
          <div class="print-grid">
            <label class="print-option"><input v-model="printOptions.headerName" type="checkbox"> Название заявки</label>
            <label class="print-option"><input v-model="printOptions.headerProject" type="checkbox"> Проект заявки</label>
            <label class="print-option"><input v-model="printOptions.headerExecutor" type="checkbox"> Исполнитель заявки</label>
            <label class="print-option"><input v-model="printOptions.headerDate" type="checkbox"> Требуемая дата поставки</label>
            <label class="print-option"><input v-model="printOptions.headerComment" type="checkbox"> Комментарий к заявке</label>
          </div>
          <div class="print-section-title">Столбцы таблицы</div>
          <div class="print-grid">
            <label class="print-option"><input v-model="printOptions.colIndex" type="checkbox"> Столбец №</label>
            <label class="print-option"><input v-model="printOptions.colItem" type="checkbox"> Столбец Товар</label>
            <label class="print-option"><input v-model="printOptions.colUnit" type="checkbox"> Столбец Ед. изм.</label>
            <label class="print-option"><input v-model="printOptions.colQty" type="checkbox"> Столбец Количество</label>
            <label class="print-option"><input v-model="printOptions.colCategory" type="checkbox"> Столбец Товарная категория</label>
            <label class="print-option"><input v-model="printOptions.colComment" type="checkbox"> Столбец Комментарий внешний</label>
          </div>
          <div class="modal-actions">
            <button class="btn" type="button" @click="closePrintModal">Отмена</button>
            <button class="btn btn-primary" type="button" @click="printRequestPdf">Сформировать PDF</button>
          </div>
        </div>
      </div>

      <div
        v-if="rowContextMenu.open"
        class="row-context-menu"
        :style="{ left: `${rowContextMenu.x}px`, top: `${rowContextMenu.y}px` }"
      >
        <button v-if="isRequestEditable" class="row-context-item" type="button" @click="handleRowAction('delete')">
          Удалить строку
        </button>
        <button v-if="isRequestEditable" class="row-context-item" type="button" @click="handleRowAction('delete-shift')">
          Удалить строку со сдвигом вверх
        </button>
        <div v-if="isRequestEditable" class="row-context-divider"></div>
        <template v-if="rowContextMenu.rowIndex">
          <button
            v-if="!specificationsMap[rows[rowContextMenu.rowIndex - 1]?.itemId]"
            class="row-context-item"
            type="button"
            @click="handleRowAction('link-spec')"
          >
            Привязать позицию к спецификации
          </button>
          <button
            v-else
            class="row-context-item"
            type="button"
            @click="handleRowAction('edit-spec')"
          >
            Изменить связь с спецификацией
          </button>
          <button
            v-if="specificationsMap[rows[rowContextMenu.rowIndex - 1]?.itemId]"
            class="row-context-item row-context-item-danger"
            type="button"
            @click="handleRowAction('unlink-spec')"
          >
            Удалить связь с спецификацией
          </button>
        </template>
      </div>

      <div v-if="specModalOpen" class="modal-backdrop" @click.self="specModalOpen = false">
        <div class="modal-card">
          <div class="modal-header">
            <h3>Выбор спецификации</h3>
            <button class="icon-close" type="button" @click="specModalOpen = false"><i class="fas fa-times"></i></button>
          </div>
          <div class="modal-search">
            <input v-model="specSearchQuery" class="field-control" type="text" placeholder="Поиск по названию спецификации...">
          </div>
          <div class="modal-list">
            <div v-if="specLoading" class="modal-state">Загрузка...</div>
            <div v-else-if="!filteredSpecList.length" class="modal-state">Ничего не найдено.</div>
            <button
              v-for="spec in filteredSpecList"
              :key="spec.id"
              class="modal-item"
              type="button"
              @click="selectSpecification(spec)"
            >
              <span class="modal-item-name">{{ spec.name }}</span>
              <small class="modal-item-meta">{{ spec.project_name || '' }}</small>
            </button>
          </div>
        </div>
      </div>

      <div v-if="specItemModalOpen" class="modal-backdrop" @click.self="specItemModalOpen = false">
        <div class="modal-card modal-card-wide">
          <div class="modal-header">
            <div>
              <h3>Выбор позиции спецификации</h3>
              <p class="modal-subtitle">{{ selectedSpecName }}</p>
            </div>
            <button class="icon-close" type="button" @click="specItemModalOpen = false"><i class="fas fa-times"></i></button>
          </div>
          <div class="modal-search">
            <input v-model="specItemSearchQuery" class="field-control" type="text" placeholder="Поиск по разделам и позициям...">
          </div>
          <div class="modal-list">
            <div v-if="specItemLoading" class="modal-state">Загрузка...</div>
            <div v-else-if="!groupedSpecItems.length" class="modal-state">Ничего не найдено.</div>
            <template v-for="group in groupedSpecItems" :key="group.section_name">
              <div
                class="spec-section-header"
                type="button"
                @click="toggleSection(group.section_name)"
              >
                <i class="fas" :class="collapsedSections.has(group.section_name) ? 'fa-chevron-right' : 'fa-chevron-down'"></i>
                {{ group.section_name }}
              </div>
              <template v-if="!collapsedSections.has(group.section_name)">
                <button
                  v-for="item in group.items"
                  :key="item.id"
                  class="modal-item modal-item-indent"
                  type="button"
                  :disabled="!item?.id"
                  @click="selectSpecItem(item)"
                >
                  <span class="modal-item-name">{{ item.name || item.section_name || '—' }}</span>
                  <span v-if="item.unit_name || item.quantity" class="modal-item-meta">
                    {{ item.unit_name || '' }}{{ item.unit_name && item.quantity ? ' · ' : '' }}{{ item.quantity || '' }}
                  </span>
                </button>
              </template>
            </template>
          </div>
        </div>
      </div>

      <div v-if="deleteConfirmOpen" class="modal-backdrop" @click.self="deleteConfirmOpen = false">
        <div class="modal-card modal-card-sm">
          <div class="modal-header">
            <h3>Удаление связи</h3>
            <button class="icon-close" type="button" @click="deleteConfirmOpen = false"><i class="fas fa-times"></i></button>
          </div>
          <p class="confirm-text">Вы уверены, что хотите удалить связь с спецификацией?</p>
          <div class="modal-actions">
            <button class="secondary-btn" type="button" @click="deleteConfirmOpen = false">Отмена</button>
            <button class="danger-btn" type="button" :disabled="specSaving" @click="confirmDeleteSpec">
              {{ specSaving ? 'Удаление...' : 'Удалить' }}
            </button>
          </div>
        </div>
      </div>

      <div
        v-if="toast.open"
        :key="toast.key"
        class="toast"
        :class="[
          toast.type === 'error' ? 'toast-error' : 'toast-success',
          toast.closing ? 'toast-closing' : 'toast-enter',
        ]"
      >
        {{ toast.message }}
        <div class="toast-timer"></div>
      </div>
    </main>
  </template>
  </div>
</template>

<style scoped>
.page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
}

.fullscreen-loader {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  background: var(--bg-body);
  color: var(--text-secondary);
  font-size: 14px;
}

.loader-spinner {
  width: 36px;
  height: 36px;
  border: 3px solid var(--border-light);
  border-top-color: var(--brand-primary);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.main-content {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  padding: 24px 32px;
  gap: 16px;
  overflow-y: auto;
}

.inline-state {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.inline-state.error {
  color: var(--danger-text);
}

.content-header {
  display: flex;
  justify-content: flex-start;
  align-items: flex-start;
}

.header-fields {
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
}

.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.field label,
.files-title {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.field input,
.field textarea {
  width: 100%;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-light);
  background: var(--bg-subtle);
  font-size: 13px;
  font-family: inherit;
}

.lookup-wrap {
  position: relative;
}

.input-with-icon {
  position: relative;
}

.lookup-input {
  width: 100%;
  padding: 10px 36px 10px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-light);
  background: var(--bg-subtle);
  font-size: 13px;
  font-family: inherit;
}

.lookup-input:focus {
  outline: none;
  border-color: var(--brand-primary);
  box-shadow: 0 0 0 2px var(--brand-soft);
  background: var(--bg-surface);
}

.lookup-input:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.field-icon-btn {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
}

.field-icon-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.field-icon-btn:hover:not(:disabled) {
  background: var(--bg-surface);
}

.lookup-list {
  margin-top: 6px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  box-shadow: var(--shadow-md);
  max-height: 240px;
  overflow: auto;
}

.lookup-list-overlay {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 2px);
  z-index: 70;
}

.lookup-item {
  width: 100%;
  text-align: left;
  padding: 10px 12px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
}

.lookup-item:hover {
  background: var(--bg-subtle);
}

.lookup-empty {
  padding: 10px 12px;
  color: var(--text-secondary);
  font-size: 12px;
}

.lookup-empty.error {
  color: var(--danger-text);
}

.files-block {
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  padding: 10px;
}

.hidden-input {
  display: none;
}

.files-dropzone {
  min-height: 44px;
  border: 1px dashed var(--border-light);
  border-radius: var(--radius-md);
  background: var(--bg-subtle);
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  cursor: pointer;
}

.files-dropzone:hover {
  border-color: var(--brand-primary);
  color: var(--text-primary);
}

.files-dropzone.disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.files-list {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.files-hint {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}

.files-hint.error {
  color: var(--danger-text);
}

.file-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-light);
  background: var(--bg-subtle);
}

.file-name {
  font-size: 12px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-download {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
}

.file-download:hover {
  background: var(--bg-subtle);
  color: var(--brand-primary);
}

.file-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.file-delete {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
}

.file-delete:hover {
  background: var(--danger-bg);
  color: var(--danger-text);
}

.file-delete:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.file-delete:disabled:hover {
  background: transparent;
  color: var(--text-tertiary);
}

.save-row {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.save-state {
  font-size: 12px;
}

.save-state.error {
  color: var(--danger-text);
}

.save-state.success {
  color: var(--success-text);
}

.send-btn-fade-enter-active,
.send-btn-fade-leave-active {
  transition: opacity 0.24s ease, transform 0.24s ease;
}

.send-btn-fade-enter-from,
.send-btn-fade-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

.table-wrapper {
  background: var(--bg-surface);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-light);
  box-shadow: var(--shadow-sm);
  overflow: auto;
  max-height: calc(100vh - 320px);
}

.request-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  min-width: 980px;
  table-layout: auto;
}

.request-table th,
.request-table td {
  border: 1px solid var(--border-light);
  padding: 6px 8px;
  white-space: normal;
  word-break: break-word;
}

.request-table td {
  padding: 0;
  position: relative;
}

.request-table th {
  background: var(--bg-subtle);
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  position: sticky;
  top: 0;
  z-index: 1;
  height: 32px;
}

.request-table thead tr.filter-row th {
  position: sticky;
  top: 32px;
  z-index: 2;
}

.filter-row th {
  background: var(--bg-surface);
  padding: 6px 8px;
  height: 39.3px;
}

.filter-input {
  width: 100%;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-light);
  background: var(--bg-subtle);
  font-size: 11px;
  min-height: 28px;
}

.filter-category-btn {
  width: 100%;
  min-height: 28px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  background: var(--bg-subtle);
  font-size: 11px;
  color: var(--text-primary);
  text-align: left;
  padding: 6px 8px;
  cursor: pointer;
}

.filter-input:focus {
  outline: none;
  border-color: var(--brand-primary);
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
  background: var(--bg-surface);
}

.col-index {
  width: 48px;
}

.col-check {
  width: 38px;
}

.col-unit {
  width: 90px;
}

.col-qty {
  width: 120px;
}

.mono {
  font-family: "JetBrains Mono", monospace;
  color: var(--text-secondary);
  text-align: center;
  vertical-align: middle;
}

.mono .mono-num {
  display: block;
  line-height: 1;
}

.mono .spec-indicator {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  font-size: 10px;
  color: var(--brand-primary);
  background: var(--brand-light);
  cursor: pointer;
  flex-shrink: 0;
}

.spec-tooltip {
  position: absolute;
  left: calc(100% + 8px);
  top: 50%;
  transform: translateY(-50%);
  padding: 5px 10px;
  border-radius: 6px;
  background: #1e293b;
  color: #fff;
  font-size: 11px;
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  font-weight: 400;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.15s, visibility 0.15s;
  z-index: 200;
}

.spec-tooltip::after {
  content: '';
  position: absolute;
  top: 50%;
  right: 100%;
  transform: translateY(-50%);
  border: 5px solid transparent;
  border-right-color: #1e293b;
}

.spec-indicator:hover .spec-tooltip {
  opacity: 1;
  visibility: visible;
}

.spec-tooltip {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 8px);
  transform: translateX(-50%);
  padding: 6px 12px;
  border-radius: 6px;
  background: #1e293b;
  color: #fff;
  font-size: 11px;
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  font-weight: 400;
  white-space: normal;
  max-width: min(320px, calc(100vw - 40px));
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.15s, visibility 0.15s;
  z-index: 200;
  word-break: break-word;
}

.spec-tooltip::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 5px solid transparent;
  border-top-color: #1e293b;
}

.spec-indicator {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  font-size: 10px;
  color: var(--brand-primary);
  background: var(--brand-light);
  cursor: pointer;
  flex-shrink: 0;
}

.spec-indicator:hover .spec-tooltip {
  opacity: 1;
  visibility: visible;
}

.check-cell {
  text-align: center;
  vertical-align: middle !important;
  padding: 0 4px !important;
}

.cell-input {
  width: 100%;
  height: 100%;
  border: none;
  background: transparent;
  font-size: 12px;
  color: var(--text-primary);
  outline: none;
  padding: 6px 8px;
  display: block;
}

.cell-textarea {
  width: 100%;
  height: 100%;
  border: none;
  background: transparent;
  font-size: 12px;
  color: var(--text-primary);
  outline: none;
  resize: vertical;
  min-height: 22px;
  height: auto;
  overflow: hidden;
  padding: 6px 8px;
  display: block;
}

.nomenclature-wrap {
  position: relative;
}

.nomenclature-dropdown {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 1px);
  z-index: 80;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--bg-surface);
  box-shadow: var(--shadow-md);
  max-height: 220px;
  overflow: auto;
}

.nomenclature-item {
  width: 100%;
  border: none;
  background: transparent;
  text-align: left;
  padding: 8px 10px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.nomenclature-item:hover {
  background: var(--bg-subtle);
}

.nomenclature-name {
  font-size: 12px;
  color: var(--text-primary);
}

.nomenclature-meta {
  font-size: 11px;
  color: var(--text-secondary);
}

.nomenclature-empty {
  padding: 8px 10px;
  font-size: 12px;
  color: var(--text-secondary);
}

.nomenclature-empty.error {
  color: var(--danger-text);
}

.cell-select {
  width: 100%;
  height: 100%;
  border: none;
  background: transparent;
  font-size: 12px;
  color: var(--text-primary);
  outline: none;
  appearance: none;
  padding: 6px 8px;
  display: block;
}

.cell-with-handle {
  position: relative;
}

.cell-category-btn {
  width: 100%;
  min-height: 32px;
  border: none;
  background: transparent;
  font-size: 12px;
  color: var(--text-primary);
  text-align: left;
  padding: 6px 8px;
  cursor: pointer;
}

.fill-handle {
  position: absolute;
  right: 2px;
  bottom: 2px;
  width: 8px;
  height: 8px;
  border: 1px solid #0f172a;
  background: #fff;
  cursor: ns-resize;
  z-index: 5;
}

.cell-active {
  box-shadow: inset 0 0 0 2px var(--brand-primary);
  background: color-mix(in srgb, var(--brand-light) 26%, transparent);
}

.cell-fill-preview {
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--brand-primary) 45%, #93c5fd);
  background: color-mix(in srgb, #dbeafe 45%, transparent);
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 220;
  background: rgba(15, 23, 42, 0.32);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.modal-card {
  width: min(760px, 96vw);
  max-height: 82vh;
  overflow: auto;
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  box-shadow: var(--shadow-lg);
  padding: 16px;
}

.modal-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 12px;
}

.modal-list {
  max-height: 52vh;
}

.create-item {
  color: var(--brand-primary);
  font-weight: 600;
  border-bottom: 1px solid var(--border-light);
}

.modal-actions {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.print-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: 8px 12px;
}

.print-grid label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.print-modal-card {
  width: min(820px, 96vw);
}

.print-hint {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-light);
}

.print-section-title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-secondary);
  margin: 10px 0 8px;
}

.print-option {
  min-height: 34px;
  padding: 8px 10px;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--bg-subtle);
}

.row-context-menu {
  position: fixed;
  z-index: 180;
  min-width: 220px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  box-shadow: var(--shadow-md);
  padding: 4px;
}

.row-context-item {
  width: 100%;
  border: none;
  background: transparent;
  text-align: left;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-primary);
  cursor: pointer;
}

.row-context-item:hover {
  background: var(--bg-subtle);
}

.row-context-divider {
  height: 1px;
  margin: 4px 0;
  background: var(--border-light);
}

.row-context-item-danger {
  color: var(--danger-text, #dc2626) !important;
}

.row-context-item-danger:hover {
  background: var(--danger-bg, #fef2f2) !important;
}

.modal-card-wide {
  width: min(620px, 96vw);
}

.modal-card-sm {
  width: min(400px, 96vw);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}

.modal-header h3 {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.modal-subtitle {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 2px 0 0;
}

.icon-close {
  background: none;
  border: none;
  font-size: 16px;
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 2px;
  flex-shrink: 0;
}

.icon-close:hover {
  color: var(--text-primary);
}

.modal-search {
  margin-bottom: 10px;
}

.modal-search .field-control {
  width: 100%;
  min-height: 38px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-light);
  background: var(--bg-body);
  color: var(--text-primary);
  padding: 0 12px;
  font-size: 13px;
}

.modal-search .field-control:focus {
  border-color: var(--brand-primary);
  box-shadow: 0 0 0 2px var(--brand-soft);
  background: var(--bg-surface);
}

.modal-state {
  padding: 20px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
}

.modal-item {
  width: 100%;
  text-align: left;
  padding: 10px 12px;
  border: none;
  border-bottom: 1px solid var(--border-light);
  background: transparent;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.modal-item:last-child {
  border-bottom: none;
}

.modal-item:hover {
  background: var(--bg-subtle);
}

.modal-item:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.modal-item-indent {
  padding-left: 28px;
}

.modal-item-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.modal-item-meta {
  font-size: 11px;
  color: var(--text-tertiary);
}

.spec-section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  background: var(--bg-subtle);
  cursor: pointer;
  border-bottom: 1px solid var(--border-light);
  user-select: none;
}

.spec-section-header i {
  font-size: 10px;
  width: 10px;
}

.spec-section-header:hover {
  background: var(--border-light);
}

.confirm-text {
  font-size: 13px;
  color: var(--text-primary);
  margin: 0 0 16px;
  line-height: 1.4;
}

.secondary-btn {
  padding: 8px 16px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-light);
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
}

.secondary-btn:hover {
  background: var(--bg-subtle);
}

.danger-btn {
  padding: 8px 16px;
  border-radius: var(--radius-md);
  border: none;
  background: var(--danger-text, #dc2626);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.danger-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.danger-btn:hover:not(:disabled) {
  opacity: 0.85;
}

.toast {
  position: fixed;
  right: 20px;
  bottom: 20px;
  min-width: 260px;
  max-width: 420px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  z-index: 220;
  font-size: 12px;
  line-height: 1.35;
  border: 1px solid transparent;
  overflow: hidden;
  transform: translateY(10px);
  opacity: 0;
  transition: opacity 0.28s ease, transform 0.28s ease;
}

.toast-success {
  background: var(--success-bg);
  color: var(--success-text);
  border-color: #86efac;
}

.toast-error {
  background: var(--danger-bg);
  color: var(--danger-text);
  border-color: #fecaca;
}

.toast-enter {
  transform: translateY(0);
  opacity: 1;
}

.toast-closing {
  transform: translateY(6px);
  opacity: 0;
}

.toast-timer {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 3px;
  width: 100%;
  background: currentColor;
  transform-origin: left center;
  animation: toast-progress 2.6s linear forwards;
  opacity: 0.45;
}

@keyframes toast-progress {
  from {
    transform: scaleX(0);
  }
  to {
    transform: scaleX(1);
  }
}

.back-btn {
  height: 32px;
  padding: 0 10px;
  border-radius: var(--radius-sm);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--text-secondary);
  border: 1px solid var(--border-light);
  background: var(--bg-surface);
  transition: all 0.2s;
  text-decoration: none;
  width: fit-content;
}

.back-btn:hover {
  background: var(--bg-subtle);
  color: var(--text-primary);
}

.btn-success {
  background: var(--success-bg);
  color: var(--success-text);
  border-color: #86efac;
}

.btn-success:hover {
  background: #dcfce7;
}

.btn-danger {
  background: var(--danger-bg);
  color: var(--danger-text);
  border-color: #fecaca;
}

.btn-danger:hover {
  background: #fee2e2;
}
</style>