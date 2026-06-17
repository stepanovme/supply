<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TopNav from '../components/layout/TopNav.vue'
import CategoryTreePickerModal from '../components/CategoryTreePickerModal.vue'
import ChatPanel from '../components/chat/ChatPanel.vue'
import { buildWarehouseCategoryTree } from '../helpers/warehouseCategoryTree'
import { mainNavLinks } from '../constants/mainNav'
import { useChatStore } from '../stores/chat'

const route = useRoute()
const router = useRouter()
const chat = useChatStore()
const backLink = route.query.back || '/projects'
const budgetId = String(route.params.budgetId || '')
const navLinks = mainNavLinks

const normalizeArray = (payload) => {
  if (Array.isArray(payload)) return payload
  return payload?.items || payload?.data || payload?.results || []
}

const createEmptyRows = (size = 500) =>
  Array.from({ length: size }, (_, i) => ({
    index: i + 1,
    id: '',
    nomenclatureId: '',
    item: '',
    unitId: '',
    qty: '',
    categoryId: '',
    comment: '',
    sectionName: '',
    price: '',
    sum: '',
    __dirty: false,
  }))

const budget = ref({
  id: '',
  name: '',
  comment: '',
  object_levels_id: '',
  project_name: '',
  created_at: '',
  created_by_user: '',
  status_name: '',
  status_id: '',
  files: [],
})

const budgetLoading = ref(false)
const budgetError = ref('')
const budgetSaveState = ref('')
let budgetSaveMessageTimer = null
let budgetSaveDebounceTimer = null

const items = ref(createEmptyRows())
const itemsLoading = ref(false)
const itemsError = ref('')
const rowContextMenu = ref({ open: false, x: 0, y: 0, rowIndex: null })
const summaryData = ref({}) // specification_item_id -> { ordered_quantity, warehouse_quantity }
const showSummaryColumns = computed(() => {
  const sid = budget.value.status_id
  const sname = String(budget.value.status_name || '').toLowerCase()
  return sid === 'c532989f-17ba-11f1-aa8c-bc241127d0bd' || sname.includes('согласован') || sname.includes('актив')
})
const saveQueue = new Map()
const saveTimers = new Map()
const suppressItemBlurSaveRowIndex = ref(null)
const activeNomenclatureRow = ref(null)
const nomenclatureItems = ref([])
const nomenclatureLoading = ref(false)
const nomenclatureError = ref('')
let nomenclatureSearchTimer = null
let tableResizeObserver = null

const files = ref([])
const filesLoading = ref(false)
const filesError = ref('')
const filesUploading = ref(false)
const uploadInputRef = ref(null)
const pageBusy = ref(false)
const pageBusyText = ref('Загрузка...')
const rowValidationMessage = ref('')
const rowValidationRowIndex = ref(null)
const fillDownState = ref({
  active: false,
  startRow: 0,
  endRow: 0,
  key: '',
  value: '',
})
const fillDownPointer = ref({ x: 0, y: 0 })
let fillDownScrollTimer = null
let rowValidationTimer = null

const unitOptions = ref([])
const categoryOptions = ref([])
const categoryTreeMeta = computed(() => buildWarehouseCategoryTree(categoryOptions.value))
const categoryModalOpen = ref(false)
const categoryModalRowIndex = ref(null)

const unitsLoading = ref(false)
const categoriesLoading = ref(false)

const requestIdInput = computed(() => budgetId)

const formatShortDateTime = (value) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

const budgetStatusClass = (statusName = '') => {
  const value = String(statusName).toLowerCase()
  if (value.includes('черновик')) return 'st-amber'
  if (value.includes('актив')) return 'st-green'
  if (value.includes('закры')) return 'st-red'
  return 'st-amber'
}

const getFileName = (file) =>
  file?.original_name || file?.name || file?.file_name || file?.title || 'Файл'

const getFilenameFromDisposition = (headerValue) => {
  if (!headerValue) return ''
  const utfMatch = headerValue.match(/filename\*=UTF-8''([^;]+)/i)
  if (utfMatch?.[1]) return decodeURIComponent(utfMatch[1])
  const asciiMatch = headerValue.match(/filename=\"?([^\";]+)\"?/i)
  return asciiMatch?.[1] || ''
}

const resizeTextareaElement = (event) => {
  const el = event?.target
  if (!el) return
  el.style.height = '0px'
  el.style.height = `${Math.max(el.scrollHeight, 30)}px`
}

const showRowValidationError = (message, rowIndex = null) => {
  rowValidationMessage.value = message
  rowValidationRowIndex.value = rowIndex
  if (rowValidationTimer) clearTimeout(rowValidationTimer)
  rowValidationTimer = setTimeout(() => {
    rowValidationMessage.value = ''
    rowValidationRowIndex.value = null
  }, 2800)
}

const rowHasNonCommentData = (row) =>
  Boolean(
    row?.id
    || row?.nomenclatureId
    || String(row?.item || '').trim()
    || String(row?.unitId || '').trim()
    || String(row?.qty || '').trim()
    || String(row?.categoryId || '').trim()
    || String(row?.price || '').trim()
    || String(row?.sum || '').trim()
  )

const isSectionRow = (row) => Boolean(String(row?.sectionName || '').trim())

const canEditField = (row, key) => {
  if (key === 'comment') return true
  if (key === 'section') return !rowHasNonCommentData(row) || isSectionRow(row)
  return !isSectionRow(row)
}

const setRowField = (row, key, value, event = null) => {
  if (!row) return false
  const nextValue = String(value ?? '')
  const currentValue = key === 'section' ? String(row?.sectionName ?? '') : String(row?.[key] ?? '')

  if (key === 'section') {
    const trimmed = nextValue.trim()
    if (trimmed && rowHasNonCommentData(row) && !isSectionRow(row)) {
      showRowValidationError('Название раздела и товарные данные не могут быть в одной строке.', row.index)
      if (event?.target) event.target.value = currentValue
      return false
    }
    row.sectionName = nextValue
    row.__dirty = true
    queueRowSave(row)
    if (event?.target) event.target.value = row.sectionName
    return true
  }

  if (key !== 'comment' && isSectionRow(row)) {
    showRowValidationError('В строке с названием раздела можно редактировать только комментарий.', row.index)
    if (event?.target) event.target.value = currentValue
    return false
  }

  if (key === 'item') {
    row.item = nextValue
    row.nomenclatureId = ''
  } else if (key === 'qty') {
    row.qty = nextValue.replace(/\./g, ',').replace(/[^0-9,\-]/g, '')
  } else if (key === 'unit') {
    row.unitId = nextValue
    row.nomenclatureId = ''
  } else if (key === 'category') {
    row.categoryId = nextValue
    row.nomenclatureId = ''
  } else if (key === 'comment') {
    row.comment = nextValue
  } else {
    row[key] = nextValue
  }

  row.__dirty = true
  queueRowSave(row)
  if (event?.target) event.target.value = row[key]
  return true
}

const getRowTextareaElements = (rowIndexes = []) => {
  const elements = []
  rowIndexes.forEach((rowIndex) => {
    const rowEl = document.querySelector(`tr[data-row="${rowIndex}"]`)
    if (!rowEl) return
    elements.push(...rowEl.querySelectorAll('.cell-textarea'))
  })
  return elements
}

const yieldFrame = () => new Promise((resolve) => requestAnimationFrame(resolve))

const toNumberOrNull = (value) => {
  const normalized = String(value ?? '').trim().replace(/\r/g, '')
  if (!normalized) return null
  const parsed = Number(normalized.replace(',', '.').replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

const waitForLayout = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

const hasAnyRowData = (row) =>
  Boolean(
    row?.id
    || row?.nomenclatureId
    || String(row?.item || '').trim()
    || String(row?.qty || '').trim()
    || row?.unitId
    || row?.categoryId
    || String(row?.comment || '').trim()
    || String(row?.sectionName || '').trim()
    || String(row?.price || '').trim()
    || String(row?.sum || '').trim()
  )

const clearRowSaveTimer = (rowIndex) => {
  const timer = saveTimers.get(rowIndex)
  if (timer) {
    clearTimeout(timer)
    saveTimers.delete(rowIndex)
  }
}

const clearAllRowSaveTimers = () => {
  saveTimers.forEach((timer) => clearTimeout(timer))
  saveTimers.clear()
}

const resizeTextareas = async (rowIndexes = null) => {
  await nextTick()
  await waitForLayout()
  const elements = Array.isArray(rowIndexes) && rowIndexes.length
    ? getRowTextareaElements(rowIndexes)
    : Array.from(document.querySelectorAll('.cell-textarea'))
  const chunkSize = 40
  for (let i = 0; i < elements.length; i += chunkSize) {
    elements.slice(i, i + chunkSize).forEach((el) => {
      el.style.height = '0px'
      el.style.height = `${Math.max(el.scrollHeight, 30)}px`
    })
    if (i + chunkSize < elements.length) {
      await yieldFrame()
    }
  }
}

const clearFillDownTimer = () => {
  if (fillDownScrollTimer) {
    window.clearInterval(fillDownScrollTimer)
    fillDownScrollTimer = null
  }
}

const updateFillDownTargetFromPoint = (x, y) => {
  const wrapper = document.querySelector('.table-wrapper')
  const rect = wrapper?.getBoundingClientRect?.()
  const pointX = rect ? Math.min(Math.max(x, rect.left + 1), rect.right - 1) : x
  const pointY = rect ? Math.min(Math.max(y, rect.top + 1), rect.bottom - 1) : y
  const el = document.elementFromPoint(pointX, pointY)
  const rowEl = el?.closest?.('tr[data-row]')
  if (!rowEl) return
  const nextRowIndex = Number(rowEl.dataset.row || 0)
  if (nextRowIndex) fillDownState.value.endRow = nextRowIndex
}

const resetFillDown = () => {
  fillDownState.value = {
    active: false,
    startRow: 0,
    endRow: 0,
    key: '',
    value: '',
  }
  clearFillDownTimer()
}

const startFillDown = (event, rowIndex, key, value) => {
  if (event?.button != null && event.button !== 0) return
  if (!canEditField(items.value[rowIndex - 1], key)) return
  fillDownPointer.value = { x: event?.clientX || 0, y: event?.clientY || 0 }
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
      const wrapper = document.querySelector('.table-wrapper')
      const rect = wrapper?.getBoundingClientRect?.()
      const edge = 56
      const step = 18
      if (wrapper && rect) {
        if (y < rect.top + edge) {
          wrapper.scrollTop -= step
        } else if (y > rect.bottom - edge) {
          wrapper.scrollTop += step
        }
      }
      updateFillDownTargetFromPoint(x, y)
    }, 40)
  }
}

const onFillRowHover = (rowIndex) => {
  if (!fillDownState.value.active) return
  fillDownState.value.endRow = rowIndex
}

const onFillMouseMove = (event) => {
  if (!fillDownState.value.active) return
  event.preventDefault()
  fillDownPointer.value = { x: event.clientX, y: event.clientY }
  updateFillDownTargetFromPoint(event.clientX, event.clientY)
}

const stopFillDown = () => {
  if (!fillDownState.value.active) return
  const { startRow, endRow, key, value } = fillDownState.value
  const from = Math.min(startRow, endRow)
  const to = Math.max(startRow, endRow)
  const touchedRows = []
  for (let i = from; i <= to; i += 1) {
    const row = items.value[i - 1]
    if (!row) continue
    if (!setRowField(row, key, value)) continue
    touchedRows.push(row.index)
  }
  if (touchedRows.length && (key === 'section' || key === 'item' || key === 'comment')) {
    resizeTextareas(touchedRows).catch(() => {})
  }
  resetFillDown()
}

const isFillPreviewCell = (rowIndex, colKey) => {
  if (!fillDownState.value.active) return false
  if (fillDownState.value.key !== colKey) return false
  const from = Math.min(fillDownState.value.startRow, fillDownState.value.endRow)
  const to = Math.max(fillDownState.value.startRow, fillDownState.value.endRow)
  return rowIndex >= from && rowIndex <= to
}

const observeTableResize = () => {
  if (typeof ResizeObserver === 'undefined') return
  const tableWrapper = document.querySelector('.table-wrapper')
  if (!tableWrapper) return
  if (tableResizeObserver) {
    tableResizeObserver.disconnect()
    tableResizeObserver = null
  }
  tableResizeObserver = new ResizeObserver(() => {
    resizeTextareas().catch(() => {})
  })
  tableResizeObserver.observe(tableWrapper)
}

const normalizeRowModel = (item = {}, fallbackIndex = 1) => ({
  index: Number(item?.num || fallbackIndex),
  id: String(item?.id || ''),
  nomenclatureId: String(item?.nomenclature_id || ''),
  item: String(item?.name || ''),
  unitId: String(item?.unit_id || ''),
  qty: item?.quantity ?? '',
  categoryId: String(item?.warehouse_category_id || ''),
  comment: String(item?.comment || ''),
  sectionName: String(item?.section_name || ''),
  price: item?.price ?? '',
  sum: item?.sum ?? '',
  __dirty: false,
})

const assignItemToRow = (row, item) => {
  const next = normalizeRowModel(item, row.index)
  row.id = next.id
  row.nomenclatureId = next.nomenclatureId
  row.item = next.item
  row.unitId = next.unitId
  row.qty = next.qty
  row.categoryId = next.categoryId
  row.comment = next.comment
  row.sectionName = next.sectionName
  row.price = next.price
  row.sum = next.sum
  row.__dirty = false
}

const cloneRowData = (row) => ({
  id: row.id || '',
  nomenclatureId: row.nomenclatureId || '',
  item: row.item || '',
  unitId: row.unitId || '',
  qty: row.qty || '',
  categoryId: row.categoryId || '',
  comment: row.comment || '',
  sectionName: row.sectionName || '',
  price: row.price || '',
  sum: row.sum || '',
})

const setRowData = (row, data) => {
  row.id = data.id || ''
  row.nomenclatureId = data.nomenclatureId || ''
  row.item = data.item || ''
  row.unitId = data.unitId || ''
  row.qty = data.qty || ''
  row.categoryId = data.categoryId || ''
  row.comment = data.comment || ''
  row.sectionName = data.sectionName || ''
  row.price = data.price || ''
  row.sum = data.sum || ''
}

const clearRowData = (row) => {
  row.id = ''
  row.nomenclatureId = ''
  row.item = ''
  row.unitId = ''
  row.qty = ''
  row.categoryId = ''
  row.comment = ''
  row.sectionName = ''
  row.price = ''
  row.sum = ''
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

const setBudgetState = (message) => {
  budgetSaveState.value = message
  if (budgetSaveMessageTimer) clearTimeout(budgetSaveMessageTimer)
  budgetSaveMessageTimer = setTimeout(() => {
    budgetSaveState.value = ''
  }, 2200)
}

const persistBudget = async () => {
  if (!budget.value.id) return
  try {
    const res = await fetch(`/apisup/supply/specifications/${encodeURIComponent(budget.value.id)}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: budget.value.name || '',
        comment: budget.value.comment || '',
      }),
    })
    if (!res.ok) throw new Error('budget save failed')
    setBudgetState('Сохранено')
  } catch (error) {
    budgetSaveState.value = 'Не удалось сохранить спецификацию.'
  }
}

const scheduleBudgetSave = () => {
  if (!budget.value.id) return
  if (budgetSaveDebounceTimer) clearTimeout(budgetSaveDebounceTimer)
  budgetSaveDebounceTimer = setTimeout(() => {
    persistBudget().catch(() => {})
  }, 500)
}

const loadBudget = async () => {
  budgetLoading.value = true
  budgetError.value = ''
  try {
    const res = await fetch(`/apisup/supply/specifications/${encodeURIComponent(budgetId)}`, {
      credentials: 'include',
    })
    if (!res.ok) throw new Error('budget load failed')
    const payload = await res.json()
    budget.value = {
      id: payload?.id || budgetId,
      name: payload?.name || '',
      comment: payload?.comment || '',
      object_levels_id: payload?.object_levels_id || '',
      project_name: payload?.project_name || '',
      created_at: payload?.created_at || '',
      created_by_user: payload?.created_by_user || '',
      status_name: payload?.status_name || '',
      status_id: String(payload?.status_id || payload?.status?.id || ''),
      files: Array.isArray(payload?.files) ? payload.files : [],
    }
  } catch (error) {
    budgetError.value = 'Не удалось загрузить спецификацию.'
  } finally {
    budgetLoading.value = false
  }
}

const loadItems = async () => {
  itemsLoading.value = true
  itemsError.value = ''
  try {
    const res = await fetch(`/apisup/supply/specifications/${encodeURIComponent(budgetId)}/items`, {
      credentials: 'include',
    })
    if (!res.ok) throw new Error('items load failed')
    const payload = normalizeArray(await res.json())
    const nextRows = createEmptyRows(500)
    const sorted = [...payload].sort((a, b) => Number(a?.num || 0) - Number(b?.num || 0))
    const used = new Set()
    let fallback = 0
    sorted.forEach((item) => {
      let target = Number(item?.num || 0)
      if (!Number.isInteger(target) || target < 1 || target > 500 || used.has(target)) {
        while (fallback < 500 && used.has(fallback + 1)) fallback += 1
        target = fallback + 1
      }
      if (target < 1 || target > 500 || used.has(target)) return
      used.add(target)
      assignItemToRow(nextRows[target - 1], item)
    })
    items.value = nextRows
    await resizeTextareas(nextRows.filter(hasAnyRowData).map((row) => row.index))
  } catch (error) {
    items.value = createEmptyRows(500)
    itemsError.value = 'Не удалось загрузить позиции спецификации.'
  } finally {
    itemsLoading.value = false
  }
}

const loadSummary = async () => {
  try {
    const res = await fetch(`/apisup/supply/specifications/${encodeURIComponent(budgetId)}/summary`, {
      credentials: 'include',
    })
    if (!res.ok) throw new Error()
    const payload = await res.json()
    const list = Array.isArray(payload) ? payload : []
    const map = {}
    for (const item of list) {
      const id = String(item?.specification_item_id || '')
      if (id) {
        map[id] = {
          ordered_quantity: item?.ordered_quantity ?? '',
          warehouse_quantity: item?.warehouse_quantity ?? '',
        }
      }
    }
    summaryData.value = map
  } catch {
    summaryData.value = {}
  }
}

const loadUnits = async () => {
  unitsLoading.value = true
  try {
    const res = await fetch('/apisup/supply/units', { credentials: 'include' })
    if (!res.ok) throw new Error('units load failed')
    unitOptions.value = normalizeArray(await res.json())
      .map((item) => ({
        id: String(item?.id || ''),
        name: String(item?.name || ''),
      }))
      .filter((item) => item.id)
  } catch (error) {
    unitOptions.value = []
  } finally {
    unitsLoading.value = false
  }
}

const loadCategories = async () => {
  categoriesLoading.value = true
  try {
    const res = await fetch('/apisup/supply/warehouse-categories', { credentials: 'include' })
    if (!res.ok) throw new Error('categories load failed')
    categoryOptions.value = normalizeArray(await res.json())
      .map((item) => ({
        id: String(item?.id || ''),
        name: String(item?.name || ''),
        parent_id: String(item?.parent_id || ''),
      }))
      .filter((item) => item.id)
  } catch (error) {
    categoryOptions.value = []
  } finally {
    categoriesLoading.value = false
  }
}

const loadFiles = async () => {
  filesLoading.value = true
  filesError.value = ''
  try {
    const res = await fetch(`/apisup/supply/specifications/${encodeURIComponent(budgetId)}/files`, {
      credentials: 'include',
    })
    if (!res.ok) throw new Error('files load failed')
    files.value = normalizeArray(await res.json())
  } catch (error) {
    files.value = []
    filesError.value = 'Не удалось загрузить файлы спецификации.'
  } finally {
    filesLoading.value = false
  }
}

const openUploadPicker = () => {
  uploadInputRef.value?.click()
}

const uploadFiles = async (event) => {
  const picked = Array.from(event.target.files || [])
  event.target.value = ''
  if (!picked.length) return
  filesUploading.value = true
  filesError.value = ''
  try {
    for (const file of picked) {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`/apisup/supply/specifications/${encodeURIComponent(budgetId)}/files`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      })
      if (!res.ok) throw new Error('file upload failed')
    }
    await loadFiles()
  } catch (error) {
    filesError.value = 'Не удалось загрузить файл.'
  } finally {
    filesUploading.value = false
  }
}

const deleteFile = async (file) => {
  const fileId = file?.id || file?.file_id
  if (!fileId) return
  filesError.value = ''
  try {
    const res = await fetch(`/apisup/supply/specifications/${encodeURIComponent(budgetId)}/files/${encodeURIComponent(fileId)}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    if (!res.ok) throw new Error('file delete failed')
    await loadFiles()
  } catch (error) {
    filesError.value = 'Не удалось удалить файл.'
  }
}

const downloadFile = async (file) => {
  const fileId = file?.id || file?.file_id
  if (!fileId) return
  filesError.value = ''
  try {
    const res = await fetch(
      `/apisup/supply/specifications/${encodeURIComponent(budgetId)}/files/${encodeURIComponent(fileId)}/download`,
      { credentials: 'include' }
    )
    if (!res.ok) throw new Error('file download failed')
    const blob = await res.blob()
    const contentDisposition = res.headers.get('content-disposition')
    const downloadName = getFilenameFromDisposition(contentDisposition) || getFileName(file)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = downloadName
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  } catch (error) {
    filesError.value = 'Не удалось скачать файл.'
  }
}

const buildItemPayload = (row) => {
  if (!hasAnyRowData(row)) return null
  if (isSectionRow(row)) {
    return {
      num: row.index,
      section_name: row.sectionName || '',
      name: '',
      nomenclature_id: '',
      unit_name: '',
      unit_id: '',
      quantity: null,
      price: null,
      sum: null,
      warehouse_category_name: '',
      warehouse_category_id: '',
      comment: row.comment || '',
    }
  }
  const payload = {
    num: row.index,
    section_name: row.sectionName || '',
    name: row.item || '',
    nomenclature_id: row.nomenclatureId || '',
    unit_name: row.unitId ? (unitOptions.value.find((unit) => unit.id === String(row.unitId))?.name || '') : '',
    unit_id: row.unitId || '',
    quantity: toNumberOrNull(row.qty),
    price: toNumberOrNull(row.price),
    sum: toNumberOrNull(row.sum),
    warehouse_category_name: row.categoryId ? categoryLabelById(row.categoryId, '') : '',
    warehouse_category_id: row.categoryId || '',
    comment: row.comment || '',
  }
  return payload
}

const saveRowPayload = async (row) => {
  if (!budget.value.id) return
  const payload = buildItemPayload(row)
  if (!payload) {
    if (row.id) {
      const res = await fetch(`/apisup/supply/specifications/${encodeURIComponent(budgetId)}/items/${encodeURIComponent(row.id)}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error('item delete failed')
      clearRowData(row)
    }
    return
  }

  let res
  if (row.id) {
    res = await fetch(`/apisup/supply/specifications/${encodeURIComponent(budgetId)}/items/${encodeURIComponent(row.id)}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } else {
    res = await fetch(`/apisup/supply/specifications/${encodeURIComponent(budgetId)}/items`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  }
  if (!res.ok) throw new Error('item save failed')
  if (!row.id) {
    const created = await res.json().catch(() => null)
    const createdId = created?.id || created?.item_id || created?.data?.id
    if (createdId) row.id = createdId
  }
  row.__dirty = false
}

const queueRowSave = (row, delay = 450) => {
  if (!row) return
  clearRowSaveTimer(row.index)
  const timer = window.setTimeout(() => {
    saveQueue.set(row.index, (saveQueue.get(row.index) || Promise.resolve())
      .catch(() => {})
      .then(() => saveRowPayload(row)))
    saveQueue.get(row.index).catch(() => {})
  }, delay)
  saveTimers.set(row.index, timer)
}

const flushRowSave = async (row) => {
  if (!row) return
  clearRowSaveTimer(row.index)
  const queue = (saveQueue.get(row.index) || Promise.resolve())
    .catch(() => {})
    .then(() => saveRowPayload(row))
  saveQueue.set(row.index, queue)
  try {
    await queue
  } catch (error) {
    itemsError.value = 'Не удалось сохранить позицию.'
  }
}

const openCategoryModal = (rowIndex = null) => {
  if (rowIndex != null && !canEditField(items.value[Number(rowIndex) - 1], 'category')) return
  categoryModalRowIndex.value = rowIndex
  categoryModalOpen.value = true
}

const closeCategoryModal = () => {
  categoryModalOpen.value = false
  categoryModalRowIndex.value = null
}

const applyCategoryFromModal = (item) => {
  const id = String(item || item?.id || '')
  if (categoryModalRowIndex.value == null) {
    closeCategoryModal()
    return
  }
  const row = items.value[Number(categoryModalRowIndex.value) - 1]
  if (!row) {
    closeCategoryModal()
    return
  }
  if (!setRowField(row, 'category', id)) {
    closeCategoryModal()
    return
  }
  resizeTextareas([row.index]).catch(() => {})
  closeCategoryModal()
}

const openCategoryCreate = () => {
  window.open('/warehouse-categories/new', '_blank', 'noopener')
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

const onItemFocus = (row) => {
  if (!canEditField(row, 'item')) return
  activeNomenclatureRow.value = row.index
  if (String(row.item || '').trim().length >= 2) {
    searchNomenclature(row.item)
  }
}

const onItemInput = (row, value, event) => {
  if (!setRowField(row, 'item', value, event)) return
  suppressItemBlurSaveRowIndex.value = null
  if (nomenclatureSearchTimer) clearTimeout(nomenclatureSearchTimer)
  nomenclatureSearchTimer = setTimeout(() => {
    searchNomenclature(value)
  }, 180)
  if (event) {
    const el = event.target
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }
}

const onNomenclaturePointerDown = (row) => {
  suppressItemBlurSaveRowIndex.value = row.index
}

const selectNomenclature = (row, item) => {
  if (!canEditField(row, 'item')) return
  row.nomenclatureId = String(item?.id || '')
  row.item = String(item?.name || row.item || '')
  row.unitId = String(item?.unit_id || item?.unit?.id || row.unitId || '')
  row.categoryId = String(item?.warehouse_category_id || item?.warehouse_category?.id || row.categoryId || '')
  row.__dirty = true
  closeNomenclatureDropdown()
  resizeTextareas([row.index]).catch(() => {})
  flushRowSave(row).catch(() => {})
}

const onItemBlur = (row) => {
  if (suppressItemBlurSaveRowIndex.value === row.index) {
    suppressItemBlurSaveRowIndex.value = null
    return
  }
  queueRowSave(row)
  if (activeNomenclatureRow.value === row.index) closeNomenclatureDropdown()
}

const onUnitChange = (row, value) => {
  if (!setRowField(row, 'unit', String(value || ''))) return
  flushRowSave(row).catch(() => {})
}

const onCategoryChange = (row, value) => {
  if (!setRowField(row, 'category', String(value || ''))) return
  flushRowSave(row).catch(() => {})
}

const onQtyInput = (row, value) => {
  setRowField(row, 'qty', String(value || ''))
}

const onCommentInput = (row, value, event) => {
  setRowField(row, 'comment', value, event)
  resizeTextareaElement(event)
}

const onSectionInput = (row, value, event) => {
  if (!setRowField(row, 'section', value, event)) return
  resizeTextareaElement(event)
}

const handlePaste = async (event) => {
  const target = event.target
  if (!target || !target.dataset) return
  const startRow = Number(target.dataset.row)
  const startCol = target.dataset.col
  if (!startRow || !startCol) return
  const clipboard = event.clipboardData?.getData('text')
  if (!clipboard) return
  event.preventDefault()

  const columnOrder = ['section', 'item', 'qty', 'unit', 'category', 'comment']
  const startColIndex = columnOrder.indexOf(startCol)
  if (startColIndex === -1) return

  const rowLines = clipboard.replace(/\r/g, '').split('\n').filter((line) => line.length > 0).map((line) => line.split('\t'))
  const hasTableData = rowLines.some((cols) => cols.length > 1)
  const touchedRows = new Set()

  if (!hasTableData && rowLines.length > 1) {
    for (let rIdx = 0; rIdx < rowLines.length; rIdx += 1) {
      const cols = rowLines[rIdx]
      const rowIndex = startRow - 1 + rIdx
      const row = items.value[rowIndex]
      if (!row) continue
      const value = cols[0] ?? ''
      const key = startCol
      const applied = setRowField(
        row,
        key,
        key === 'unit'
          ? (unitIdByName(value) || value)
          : key === 'category'
            ? (categoryIdByName(value) || value)
            : value
      )
      if (applied) touchedRows.add(rowIndex + 1)
      if (rIdx > 0 && rIdx % 20 === 0) {
        // Даем браузеру отрисовать изменения при массовой вставке.
        // eslint-disable-next-line no-await-in-loop
        await yieldFrame()
      }
    }
  } else if (!hasTableData) {
    const row = items.value[startRow - 1]
    if (!row) return
    const value = clipboard.replace(/\n+/g, ' ').trim()
    const applied = setRowField(
      row,
      startCol,
      startCol === 'unit'
        ? (unitIdByName(value) || value)
        : startCol === 'category'
          ? (categoryIdByName(value) || value)
          : value
    )
    if (applied) touchedRows.add(startRow)
  } else {
    for (let rIdx = 0; rIdx < rowLines.length; rIdx += 1) {
      const cols = rowLines[rIdx]
      const rowIndex = startRow - 1 + rIdx
      const row = items.value[rowIndex]
      if (!row) continue
      let rowChanged = false
      for (let cIdx = 0; cIdx < cols.length; cIdx += 1) {
        const cell = cols[cIdx]
        const colKey = columnOrder[startColIndex + cIdx]
        if (!colKey) continue
        const applied = setRowField(
          row,
          colKey,
          colKey === 'unit'
            ? (unitIdByName(cell) || cell)
            : colKey === 'category'
              ? (categoryIdByName(cell) || cell)
              : cell
        )
        if (applied) rowChanged = true
      }
      if (rowChanged) touchedRows.add(rowIndex + 1)
      if (rIdx > 0 && rIdx % 20 === 0) {
        // Даем браузеру отрисовать изменения при массовой вставке.
        // eslint-disable-next-line no-await-in-loop
        await yieldFrame()
      }
    }
  }

  void resizeTextareas(Array.from(touchedRows)).catch(() => {})
  touchedRows.forEach((rowNum) => {
    const row = items.value[rowNum - 1]
    if (row) flushRowSave(row).catch(() => {})
  })
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
  const res = await fetch(`/apisup/supply/specifications/${encodeURIComponent(requestIdInput.value)}/items/${encodeURIComponent(itemId)}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!res.ok) throw new Error('item delete failed')
}

const deleteRowOnly = async (rowIndex) => {
  const row = items.value[rowIndex - 1]
  if (!row) return
  try {
    clearRowSaveTimer(row.index)
    if (row.id) {
      await deleteItemById(row.id)
    }
    clearRowData(row)
    row.__dirty = false
  } catch (error) {
    itemsError.value = 'Не удалось удалить строку.'
  } finally {
    closeRowContextMenu()
  }
}

const deleteRowWithShiftUp = async (rowIndex) => {
  const idx = rowIndex - 1
  const current = items.value[idx]
  if (!current) return
  try {
    clearAllRowSaveTimers()
    if (current.id) {
      await deleteItemById(current.id)
    }
    for (let i = idx; i < items.value.length - 1; i += 1) {
      setRowData(items.value[i], cloneRowData(items.value[i + 1]))
      items.value[i].__dirty = true
    }
    clearRowData(items.value[items.value.length - 1])
    items.value[items.value.length - 1].__dirty = false

    for (let i = idx; i < items.value.length; i += 1) {
      const row = items.value[i]
      if (!hasAnyRowData(row)) continue
      // eslint-disable-next-line no-await-in-loop
      await flushRowSave(row)
    }
  } catch (error) {
    itemsError.value = 'Не удалось удалить строку со сдвигом.'
  } finally {
    closeRowContextMenu()
    void resizeTextareas(
      items.value
        .slice(idx)
        .map((item) => item.index)
        .filter((rowIndex) => hasAnyRowData(items.value[rowIndex - 1]))
    ).catch(() => {})
  }
}

const handleRowAction = async (action) => {
  const rowIndex = rowContextMenu.value.rowIndex
  if (!rowIndex) return
  if (action === 'delete') {
    await deleteRowOnly(rowIndex)
    return
  }
  if (action === 'delete-shift') {
    await deleteRowWithShiftUp(rowIndex)
  }
}

const getItemDisplay = (row) => {
  if (row.nomenclatureId && !row.item) return row.item
  return row.item
}

const openNomenclatureFromRow = (row) => {
  if (!canEditField(row, 'item')) return
  activeNomenclatureRow.value = row.index
  if (String(row.item || '').trim().length >= 2) searchNomenclature(row.item)
}

const goBack = () => router.push(backLink)

const handleGlobalClick = (event) => {
  const target = event.target
  if (!target) return
  if (target.closest?.('.row-context-menu')) return
  if (target.closest?.('.nomenclature-dropdown')) return
  if (target.closest?.('.cell-item-wrap')) return
  closeRowContextMenu()
  closeNomenclatureDropdown()
}

const handleGlobalKeydown = (event) => {
  if (event.key === 'Escape') {
    resetFillDown()
    closeRowContextMenu()
    closeNomenclatureDropdown()
  }
}

onMounted(async () => {
  pageBusy.value = true
  pageBusyText.value = 'Загрузка спецификации...'
  window.addEventListener('click', handleGlobalClick)
  window.addEventListener('keydown', handleGlobalKeydown)
  window.addEventListener('mousemove', onFillMouseMove)
  window.addEventListener('mouseup', stopFillDown)
  await nextTick()
  await waitForLayout()
  try {
    await Promise.all([loadBudget(), loadItems(), loadFiles(), loadUnits(), loadCategories()])
    if (showSummaryColumns.value) {
      await loadSummary()
    }
    observeTableResize()
  } finally {
    pageBusy.value = false
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('click', handleGlobalClick)
  window.removeEventListener('keydown', handleGlobalKeydown)
  window.removeEventListener('mousemove', onFillMouseMove)
  window.removeEventListener('mouseup', stopFillDown)
  resetFillDown()
  if (tableResizeObserver) {
    tableResizeObserver.disconnect()
    tableResizeObserver = null
  }
  if (budgetSaveMessageTimer) clearTimeout(budgetSaveMessageTimer)
  if (budgetSaveDebounceTimer) clearTimeout(budgetSaveDebounceTimer)
  if (nomenclatureSearchTimer) clearTimeout(nomenclatureSearchTimer)
  clearAllRowSaveTimers()
})
</script>

<template>
  <div class="page" :class="{ 'is-fill-dragging': fillDownState.active }">
    <TopNav :links="navLinks" />
    <div v-if="pageBusy" class="page-loader-overlay" aria-live="polite" aria-busy="true">
      <div class="page-loader-card">
        <div class="page-loader-spinner"></div>
        <div class="page-loader-text">{{ pageBusyText }}</div>
      </div>
    </div>
    <main class="main-content">
      <div class="content-header">
        <div class="title-row">
          <button class="back-btn" type="button" @click="goBack" aria-label="Вернуться назад">
            <i class="fas fa-chevron-left"></i>
            <span>Вернуться</span>
          </button>
          <button type="button" class="chat-btn" title="Чат спецификации" @click="chat.openPanel('specification', budgetId)">
            <i class="fas fa-comment-dots"></i>
          </button>
          <div>
            <h1 class="page-title">{{ budget.name || 'Спецификация' }}</h1>
            <div class="page-subtitle">{{ budget.project_name || 'Проект не указан' }}</div>
          </div>
        </div>
      </div>

      <div v-if="budgetLoading" class="panel inline-state">Загрузка...</div>
      <div v-else class="panel stack-panel">
        <div v-if="budgetError" class="inline-state error">{{ budgetError }}</div>
        <div v-if="budgetSaveState" class="inline-state success">{{ budgetSaveState }}</div>
        <div class="budget-meta-grid">
          <div class="field wide">
            <label>Наименование</label>
            <input
              v-model="budget.name"
              type="text"
              placeholder="Название спецификации"
              @input="scheduleBudgetSave"
            >
          </div>
          <div class="field wide">
            <label>Комментарий</label>
            <textarea
              v-model="budget.comment"
              rows="3"
              placeholder="Комментарий к спецификации"
              @input="scheduleBudgetSave"
            ></textarea>
          </div>
          <div class="meta-card">
            <div class="meta-label">Статус</div>
            <span class="status-pill" :class="budgetStatusClass(budget.status_name)">
              <span class="st-dot"></span> {{ budget.status_name || '—' }}
            </span>
          </div>
          <div class="meta-card">
            <div class="meta-label">Создана</div>
            <div class="meta-value">{{ formatShortDateTime(budget.created_at) }}</div>
          </div>
          <div class="meta-card">
            <div class="meta-label">Автор</div>
            <div class="meta-value">{{ budget.created_by_user || '—' }}</div>
          </div>
          <div class="meta-card">
            <div class="meta-label">Проект</div>
            <div class="meta-value">{{ budget.project_name || '—' }}</div>
          </div>
        </div>
      </div>

      <section class="panel section-block">
        <div class="section-header">
          <h2>Файлы</h2>
          <div class="section-actions">
            <input ref="uploadInputRef" type="file" multiple class="hidden-file" @change="uploadFiles">
            <button class="btn btn-primary" :disabled="filesUploading" @click="openUploadPicker">
              <i class="fas fa-paperclip"></i>
              {{ filesUploading ? 'Загрузка...' : 'Прикрепить файл' }}
            </button>
          </div>
        </div>
        <div v-if="filesLoading" class="inline-state">Загрузка файлов...</div>
        <div v-else-if="filesError" class="inline-state error">{{ filesError }}</div>
        <div v-else class="files-list">
          <div v-if="!files.length" class="empty-row">Файлы отсутствуют</div>
          <div v-for="file in files" :key="file.id || file.file_id || getFileName(file)" class="file-row">
            <div class="file-name">{{ getFileName(file) }}</div>
            <div class="file-actions">
              <button class="file-action-btn" type="button" @click="downloadFile(file)" title="Скачать файл">
                <i class="fas fa-download"></i>
              </button>
              <button class="file-action-btn danger" type="button" @click="deleteFile(file)" title="Удалить файл">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </div>
        </div>
      </section>

      <section class="panel section-block">
        <div class="section-header">
          <h2>Позиции спецификации</h2>
          <div class="section-actions">
            <span v-if="rowValidationMessage" class="inline-state error row-validation-message">{{ rowValidationMessage }}</span>
            <span v-if="itemsError" class="inline-state error">{{ itemsError }}</span>
          </div>
        </div>
        <div v-if="itemsLoading" class="inline-state">Загрузка позиций...</div>
        <div v-else class="table-wrapper" @paste="handlePaste">
          <table class="budget-table">
            <colgroup>
              <col class="col-index">
              <col class="col-section">
              <col class="col-item">
              <col class="col-qty">
              <col class="col-unit">
              <col v-if="showSummaryColumns" class="col-ordered">
              <col v-if="showSummaryColumns" class="col-warehouse">
              <col class="col-category">
              <col class="col-comment">
            </colgroup>
            <thead>
              <tr>
                <th>№</th>
                <th>Название раздела</th>
                <th>Товар</th>
                <th>Количество</th>
                <th>Ед. изм.</th>
                <th v-if="showSummaryColumns">Заказно</th>
                <th v-if="showSummaryColumns">На складах</th>
                <th>Товарная категория</th>
                <th>Комментарий</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in items"
                :key="row.index"
                :data-row="row.index"
                :class="{ 'section-row': isSectionRow(row), 'row-error': rowValidationRowIndex === row.index }"
                @contextmenu="openRowContextMenu($event, row)"
                @mouseenter="onFillRowHover(row.index)"
              >
                <td class="mono">{{ row.index }}</td>
                <td :class="{ 'cell-fill-preview': isFillPreviewCell(row.index, 'section') }">
                  <div class="cell-with-handle">
                    <textarea
                      class="cell-textarea"
                      rows="1"
                      :value="row.sectionName"
                      :data-row="row.index"
                      data-col="section"
                      :disabled="!canEditField(row, 'section')"
                      @input="(e) => onSectionInput(row, e.target.value, e)"
                      @blur="flushRowSave(row)"
                    ></textarea>
                    <span
                      v-if="canEditField(row, 'section')"
                      class="fill-handle"
                      @mousedown.prevent="(e) => startFillDown(e, row.index, 'section', row.sectionName)"
                    ></span>
                  </div>
                </td>
                <td :class="{ 'cell-fill-preview': isFillPreviewCell(row.index, 'item') }">
                  <div class="cell-with-handle">
                    <div class="cell-item-wrap">
                      <textarea
                        class="cell-textarea cell-item"
                        rows="1"
                        :value="getItemDisplay(row)"
                        :data-row="row.index"
                        data-col="item"
                        :disabled="!canEditField(row, 'item')"
                        @focus="onItemFocus(row)"
                        @input="(e) => onItemInput(row, e.target.value, e)"
                        @mousedown="openNomenclatureFromRow(row)"
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
                            {{ item.unit?.name || '—' }} |
                            {{ categoryLabelById(item.warehouse_category?.id || item.warehouse_category_id, item.warehouse_category?.name || '—') }}
                          </span>
                        </button>
                      </div>
                    </div>
                    <span
                      v-if="canEditField(row, 'item')"
                      class="fill-handle"
                      @mousedown.prevent="(e) => startFillDown(e, row.index, 'item', row.item)"
                    ></span>
                  </div>
                </td>
                <td :class="{ 'cell-fill-preview': isFillPreviewCell(row.index, 'qty') }">
                  <div class="cell-with-handle">
                    <input
                      class="cell-input"
                      type="text"
                      :value="row.qty"
                      :data-row="row.index"
                      data-col="qty"
                      :disabled="!canEditField(row, 'qty')"
                      @input="(e) => onQtyInput(row, e.target.value)"
                      @blur="flushRowSave(row)"
                    >
                    <span
                      v-if="canEditField(row, 'qty')"
                      class="fill-handle"
                      @mousedown.prevent="(e) => startFillDown(e, row.index, 'qty', row.qty)"
                    ></span>
                  </div>
                </td>
                <td :class="{ 'cell-fill-preview': isFillPreviewCell(row.index, 'unit') }">
                  <div class="cell-with-handle">
                    <select
                      class="cell-select"
                      :value="row.unitId"
                      :data-row="row.index"
                      data-col="unit"
                      :disabled="!canEditField(row, 'unit')"
                      @change="(e) => onUnitChange(row, e.target.value)"
                    >
                      <option value=""></option>
                      <option v-for="unit in unitOptions" :key="unit.id" :value="unit.id">{{ unit.name }}</option>
                    </select>
                    <span
                      v-if="canEditField(row, 'unit')"
                      class="fill-handle"
                      @mousedown.prevent="(e) => startFillDown(e, row.index, 'unit', row.unitId)"
                    ></span>
                  </div>
                </td>
                <td v-if="showSummaryColumns" class="cell-summary">
                  {{ summaryData[row.id]?.ordered_quantity ?? '' }}
                </td>
                <td v-if="showSummaryColumns" class="cell-summary">
                  {{ summaryData[row.id]?.warehouse_quantity ?? '' }}
                </td>
                <td :class="{ 'cell-fill-preview': isFillPreviewCell(row.index, 'category') }">
                  <div class="cell-with-handle">
                    <button
                      class="cell-category-btn"
                      type="button"
                      :data-row="row.index"
                      data-col="category"
                      :disabled="!canEditField(row, 'category')"
                      @click="openCategoryModal(row.index)"
                    >
                      {{ categoryLabelById(row.categoryId, '') || 'Выбрать категорию' }}
                    </button>
                    <span
                      v-if="canEditField(row, 'category')"
                      class="fill-handle"
                      @mousedown.prevent="(e) => startFillDown(e, row.index, 'category', row.categoryId)"
                    ></span>
                  </div>
                </td>
                <td :class="{ 'cell-fill-preview': isFillPreviewCell(row.index, 'comment') }">
                  <div class="cell-with-handle">
                    <textarea
                      class="cell-textarea"
                      rows="1"
                      :value="row.comment"
                      :data-row="row.index"
                      data-col="comment"
                      @input="(e) => onCommentInput(row, e.target.value, e)"
                      @blur="flushRowSave(row)"
                    ></textarea>
                    <span
                      class="fill-handle"
                      @mousedown.prevent="(e) => startFillDown(e, row.index, 'comment', row.comment)"
                    ></span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </main>

    <CategoryTreePickerModal
      :open="categoryModalOpen"
      title="Выберите товарную категорию"
      :categories="categoryOptions"
      :selected-id="categoryModalRowIndex == null ? '' : (items[Number(categoryModalRowIndex) - 1]?.categoryId || '')"
      :allow-none="true"
      none-label="Без категории"
      :show-create="true"
      create-label="+ Создать товарную категорию"
      @close="closeCategoryModal"
      @select="applyCategoryFromModal"
      @create="openCategoryCreate"
    />

    <div
      v-if="rowContextMenu.open"
      class="row-context-menu"
      :style="{ left: `${rowContextMenu.x}px`, top: `${rowContextMenu.y}px` }"
      @click.stop
    >
      <button type="button" class="context-item" @click="handleRowAction('delete')">Удалить строку</button>
      <button type="button" class="context-item danger" @click="handleRowAction('delete-shift')">
        Удалить строку со сдвигом вверх
      </button>
    </div>
  </div>
  <ChatPanel v-if="chat.panelOpen" @close="chat.closePanel()" />
</template>

<style scoped>
.page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
}

.page.is-fill-dragging {
  user-select: none;
  cursor: ns-resize;
}

.page.is-fill-dragging * {
  cursor: ns-resize !important;
}

.page-loader-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(244, 247, 250, 0.82);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.page-loader-card {
  min-width: 220px;
  padding: 18px 22px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-light);
  background: var(--bg-surface);
  box-shadow: var(--shadow-md);
  display: flex;
  align-items: center;
  gap: 14px;
}

.page-loader-spinner {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid var(--border-light);
  border-top-color: var(--brand-primary);
  animation: budget-spin 0.8s linear infinite;
  flex-shrink: 0;
}

.page-loader-text {
  font-size: 13px;
  color: var(--text-primary);
  font-weight: 500;
}

.main-content {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  padding: 24px 32px;
  gap: 16px;
}

@keyframes budget-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.content-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}

.page-subtitle {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
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

.chat-btn {
  height: 32px;
  padding: 0 10px;
  border-radius: var(--radius-sm);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  border: 1px solid var(--border-light);
  background: var(--bg-surface);
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}

.chat-btn:hover {
  background: var(--bg-subtle);
  color: var(--brand-primary);
}

.panel {
  background: var(--bg-surface);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-light);
  box-shadow: var(--shadow-sm);
  padding: 16px;
}

.stack-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.inline-state {
  font-size: 12px;
  color: var(--text-secondary);
}

.inline-state.error {
  color: var(--danger-text);
}

.inline-state.success {
  color: var(--success-text);
}

.budget-meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field.wide {
  grid-column: 1 / -1;
}

.field label {
  font-size: 12px;
  color: var(--text-secondary);
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

.meta-card {
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: 12px;
  background: var(--bg-subtle);
}

.meta-label {
  font-size: 11px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.meta-value {
  font-size: 13px;
  color: var(--text-primary);
  font-weight: 500;
}

.section-block {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.section-header h2 {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

.section-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.row-validation-message {
  max-width: 420px;
}

.files-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.file-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  background: var(--bg-subtle);
}

.file-name {
  font-size: 13px;
  color: var(--text-primary);
  word-break: break-word;
}

.file-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.file-action-btn {
  width: 34px;
  height: 34px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--bg-subtle);
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: none;
  padding: 0;
}

.file-action-btn:hover {
  background: var(--bg-surface);
  color: var(--text-primary);
  border-color: var(--brand-muted);
  transform: translateY(-1px);
}

.file-action-btn:active {
  transform: translateY(0);
}

.file-action-btn.danger:hover {
  background: var(--danger-bg);
  color: var(--danger-text);
  border-color: var(--danger-text);
}

.hidden-file {
  display: none;
}

.table-wrapper {
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  overflow: auto;
  max-height: calc(100vh - 360px);
  overscroll-behavior: contain;
}

.budget-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  min-width: 1560px;
}

.budget-table th,
.budget-table td {
  border: 1px solid var(--border-light);
  padding: 6px 8px;
  vertical-align: top;
  white-space: normal;
  word-break: break-word;
  overflow: visible;
}

.budget-table th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--bg-subtle);
  color: var(--text-secondary);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  height: 32px;
  text-align: left;
}

.budget-table tbody tr.section-row td {
  background: color-mix(in srgb, var(--brand-light) 42%, var(--bg-surface));
  border-top-color: color-mix(in srgb, var(--brand-primary) 28%, var(--border-light));
  border-bottom-color: color-mix(in srgb, var(--brand-primary) 28%, var(--border-light));
}

.budget-table tbody tr.section-row:hover td {
  background: color-mix(in srgb, var(--brand-light) 52%, var(--bg-surface));
}

.budget-table tbody tr.section-row td:first-child {
  box-shadow: inset 4px 0 0 color-mix(in srgb, var(--brand-primary) 72%, #2563eb);
}

.budget-table tbody tr.section-row .cell-input,
.budget-table tbody tr.section-row .cell-textarea,
.budget-table tbody tr.section-row .cell-select,
.budget-table tbody tr.section-row .cell-category-btn {
  font-weight: 700;
  color: var(--text-primary);
}

.budget-table tbody tr.row-error td {
  background: color-mix(in srgb, var(--danger-bg) 24%, var(--bg-surface));
}

.budget-table tbody tr.row-error:hover td {
  background: color-mix(in srgb, var(--danger-bg) 30%, var(--bg-surface));
}

.mono {
  font-family: 'JetBrains Mono', monospace;
  color: var(--text-secondary);
  text-align: center;
  font-size: 12px;
}

.col-index {
  width: 56px;
}

.col-section {
  width: 330px;
}

.col-item {
  width: 440px;
}

.col-qty {
  width: 78px;
}

.col-unit {
  width: 86px;
}

.col-ordered {
  width: 100px;
}

.col-warehouse {
  width: 100px;
}

.col-category {
  width: 240px;
}

.col-comment {
  width: 280px;
}

.budget-table td.cell-summary {
  text-align: right;
  font-family: "JetBrains Mono", monospace;
  font-size: 12px;
  color: var(--text-primary);
  padding: 6px 10px;
  white-space: nowrap;
}

.cell-item-wrap {
  position: relative;
}

.cell-with-handle {
  position: relative;
  display: block;
}

.cell-input,
.cell-textarea,
.cell-select,
.cell-category-btn {
  width: 100%;
  border: none;
  background: transparent;
  font-size: 12px;
  color: var(--text-primary);
  outline: none;
  font-family: inherit;
  box-sizing: border-box;
  line-height: 1.35;
}

.cell-input,
.cell-select,
.cell-category-btn {
  min-height: 28px;
  padding: 6px 8px;
}

.cell-textarea {
  resize: none;
  min-height: 34px;
  overflow: hidden;
  padding: 6px 8px;
  display: block;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.cell-select {
  appearance: none;
  padding-right: 20px;
}

.cell-category-btn {
  text-align: left;
  cursor: pointer;
  display: block;
  white-space: normal;
  overflow-wrap: anywhere;
}

.cell-input:disabled,
.cell-textarea:disabled,
.cell-select:disabled,
.cell-category-btn:disabled {
  color: var(--text-secondary);
  cursor: not-allowed;
  opacity: 0.75;
}

.fill-handle {
  position: absolute;
  right: 2px;
  bottom: 2px;
  width: 9px;
  height: 9px;
  border: 1px solid #0f172a;
  background: var(--bg-surface);
  cursor: ns-resize;
  z-index: 5;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.cell-with-handle:hover .fill-handle,
.page.is-fill-dragging .fill-handle,
td:hover .fill-handle {
  opacity: 1;
}

.cell-fill-preview {
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--brand-primary) 45%, #93c5fd);
  background: color-mix(in srgb, #dbeafe 45%, transparent);
}

.cell-category-btn:hover {
  color: var(--brand-primary);
}

.nomenclature-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 25;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  box-shadow: var(--shadow-md);
  max-height: 240px;
  overflow-y: auto;
  padding: 4px;
}

.nomenclature-item {
  width: 100%;
  border: none;
  background: transparent;
  text-align: left;
  padding: 7px 8px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nomenclature-item:hover {
  background: var(--bg-subtle);
}

.nomenclature-name {
  font-size: 12px;
  color: var(--text-primary);
}

.nomenclature-meta {
  font-size: 10px;
  color: var(--text-secondary);
}

.nomenclature-empty {
  padding: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}

.nomenclature-empty.error {
  color: var(--danger-text);
}

.row-context-menu {
  position: fixed;
  z-index: 60;
  min-width: 220px;
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  overflow: hidden;
}

.context-item {
  width: 100%;
  display: block;
  text-align: left;
  border: none;
  background: transparent;
  padding: 10px 12px;
  font-size: 12px;
  color: var(--text-primary);
  cursor: pointer;
}

.context-item:hover {
  background: var(--bg-subtle);
}

.context-item.danger {
  color: var(--danger-text);
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-weight: 500;
  width: fit-content;
  flex-wrap: wrap;
}

.st-green {
  background: var(--success-bg);
  color: var(--success-text);
}

.st-amber {
  background: var(--warning-bg);
  color: var(--warning-text);
}

.st-red {
  background: var(--danger-bg);
  color: var(--danger-text);
}

.st-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}
</style>
