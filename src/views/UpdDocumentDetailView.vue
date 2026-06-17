<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TopNav from '../components/layout/TopNav.vue'
import CustomPdfPreview from '../components/pdf/CustomPdfPreview.vue'
import { mainNavLinks } from '../constants/mainNav'

const route = useRoute()
const router = useRouter()

const navLinks = mainNavLinks

const warehouseId = computed(() => String(route.params.warehouseId || ''))
const documentId = computed(() => String(route.params.documentId || ''))
const step = ref(1)
const loading = ref(false)
const error = ref('')
const payload = ref(null)
const pdfUrl = ref('')
const reparsing = ref(false)
const saving = ref(false)
const mappingsLoading = ref(false)
const autoMatching = ref(false)
const finishing = ref(false)
const mappingRows = ref([])
const selectedDocumentItemId = ref('')
const hideLinkedMappings = ref(false)
const documentSort = ref({ key: 'displayIndex', dir: 'asc' })
const mappingSort = ref({ key: 'group_number', dir: 'asc' })
const objects = ref([])
const tempMappingSeq = ref(1)
const nomenclatureLookupRowId = ref('')
const nomenclatureLookupLoadingRowId = ref('')
const nomenclatureLookupResults = ref([])
const objectLookupRowId = ref('')
const autoMatchModalOpen = ref(false)
const autoMatchObjectOpen = ref(false)
const autoMatchForm = ref({
  object_id: '',
  object_name: '',
  attribute: '',
})

const attributeOptions = ['Закупка', 'Давальческий']

const closeAllLookups = () => {
  nomenclatureLookupRowId.value = ''
  objectLookupRowId.value = ''
  autoMatchObjectOpen.value = false
}

const onGlobalPointerDown = (event) => {
  const target = event?.target
  if (!(target instanceof Element)) {
    closeAllLookups()
    return
  }

  if (target.closest('.lookup-field')) return

  closeAllLookups()
}

const stepLabel = computed(() => {
  if (step.value === 1) return 'Реквизиты'
  if (step.value === 2) return 'Позиции'
  return 'Сопоставление'
})

const items = computed(() => {
  const source = Array.isArray(payload.value?.items) ? [...payload.value.items] : []
  source.sort((a, b) => {
    const ap = Number(a?.position || 0)
    const bp = Number(b?.position || 0)
    if (ap && bp) return ap - bp
    if (ap) return -1
    if (bp) return 1
    return 0
  })
  return source
})

const normalizeArray = (data) => {
  if (Array.isArray(data)) return data
  return data?.items || data?.data || data?.results || []
}

const normalizeInputDate = (value) => {
  if (!value) return ''
  const source = String(value)
  return source.length >= 10 ? source.slice(0, 10) : source
}

const jsonHeaders = {
  'Content-Type': 'application/json',
}

const toNumberOrZero = (value) => {
  const num = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(num) ? num : 0
}

const formatMaybeNumber = (value) => {
  if (value == null || value === '') return '—'
  const num = Number(value)
  if (!Number.isFinite(num)) return String(value)
  return num.toLocaleString('ru-RU')
}

const roundToPricePrecision = (value) => {
  const num = Number(value)
  if (!Number.isFinite(num)) return 0
  return Math.round(num * 100000000) / 100000000
}

const autoResizeTextarea = (el) => {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.max(34, el.scrollHeight)}px`
}

const onCellTextInput = (event) => {
  autoResizeTextarea(event?.target)
}

const onMappingNameInput = (event, row) => {
  onCellTextInput(event)
  searchNomenclature(row)
}

const resizeDocumentTextareas = async () => {
  await nextTick()
  const nodes = document.querySelectorAll('.cell-textarea')
  for (const node of nodes) autoResizeTextarea(node)
}

const goBack = () => {
  router.push({
    name: 'warehouse-section',
    params: {
      warehouseId: warehouseId.value,
      section: 'documents',
    },
  })
}

const composeAttribute = (base, objectName) => {
  const cleanBase = String(base || '').trim()
  const cleanObject = String(objectName || '').trim()
  if (!cleanBase) return ''
  if (!cleanObject) return cleanBase
  return `${cleanBase}; ${cleanObject}`
}

const parseAttributeBase = (value) => {
  const [base] = String(value || '').split(';')
  return String(base || '').trim()
}

const objectNameById = (objectId) => {
  const id = String(objectId || '')
  if (!id) return ''
  return String(objects.value.find((item) => String(item.id) === id)?.name || '')
}

const filteredObjects = (query) => {
  const normalized = String(query || '').trim().toLowerCase()
  if (!normalized) return objects.value
  return objects.value.filter((item) => item.search.includes(normalized))
}

const linkedDocumentItemById = (documentItemId) =>
  items.value.find((entry) => String(entry?.id || '') === String(documentItemId || ''))

const selectedDocumentRowNumber = computed(() => {
  if (!selectedDocumentItemId.value) return 0
  const item = items.value.find((entry) => String(entry?.id || '') === String(selectedDocumentItemId.value))
  return Number(item?.position || 0) || (items.value.findIndex((entry) => String(entry?.id || '') === String(selectedDocumentItemId.value)) + 1)
})

const getNextGroupNumber = () => mappingRows.value.reduce((max, row) => {
  const value = Number(row?.group_number || 0)
  return Number.isFinite(value) && value > max ? value : max
}, 0) + 1

const rowSum = (row) => toNumberOrZero(row?.mapped_quantity) * toNumberOrZero(row?.price)

const normalizeSortValue = (value) => {
  if (value == null || value === '') return ''
  const num = Number(value)
  if (Number.isFinite(num)) return num
  return String(value).toLowerCase()
}

const sortRowValue = (row, key) => {
  if (key === 'sum' && row) {
    if ('mapped_quantity' in row || 'group_number' in row) return rowSum(row)
    return toNumberOrZero(row?.sum)
  }
  return row?.[key]
}

const sortRows = (rows, state) => {
  const { key, dir } = state || {}
  if (!key || !dir) return rows
  return [...rows].sort((a, b) => {
    const av = normalizeSortValue(sortRowValue(a, key))
    const bv = normalizeSortValue(sortRowValue(b, key))
    if (av === bv) return 0
    return av > bv ? (dir === 'asc' ? 1 : -1) : (dir === 'asc' ? -1 : 1)
  })
}

const documentGroupMap = computed(() => {
  const map = new Map()
  for (const row of mappingRows.value) {
    const documentItemId = String(row?.upd_documents_item_id || '')
    const groupNumber = Number(row?.group_number || 0)
    if (!documentItemId || !groupNumber) continue
    map.set(documentItemId, groupNumber)
  }
  return map
})

const documentRowsStage3 = computed(() => items.value.map((item, index) => ({
  ...item,
  displayIndex: Number(item?.position || 0) || (index + 1),
  groupNumber: documentGroupMap.value.get(String(item?.id || '')) || '',
})))

const visibleDocumentRowsStage3 = computed(() => {
  if (!hideLinkedMappings.value) return documentRowsStage3.value
  return documentRowsStage3.value.filter((row) => !row.groupNumber)
})

const visibleMappingRows = computed(() => {
  if (!hideLinkedMappings.value) return mappingRows.value
  return mappingRows.value.filter((row) => !row.group_number)
})

const sortedVisibleDocumentRowsStage3 = computed(() => sortRows(visibleDocumentRowsStage3.value, documentSort.value))
const sortedVisibleMappingRows = computed(() => sortRows(visibleMappingRows.value, mappingSort.value))

const toggleDocumentSort = (key) => {
  if (documentSort.value.key !== key) {
    documentSort.value = { key, dir: 'asc' }
    return
  }
  documentSort.value = { key, dir: documentSort.value.dir === 'asc' ? 'desc' : 'asc' }
}

const toggleMappingSort = (key) => {
  if (mappingSort.value.key !== key) {
    mappingSort.value = { key, dir: 'asc' }
    return
  }
  mappingSort.value = { key, dir: mappingSort.value.dir === 'asc' ? 'desc' : 'asc' }
}

const sortMark = (state, key) => {
  if (state?.key !== key) return ''
  return state?.dir === 'asc' ? '▲' : '▼'
}

const groupPalette = [
  { bg: '#fee2e2', text: '#991b1b', border: '#fecaca' },
  { bg: '#dbeafe', text: '#1e3a8a', border: '#bfdbfe' },
  { bg: '#dcfce7', text: '#166534', border: '#bbf7d0' },
  { bg: '#fef3c7', text: '#92400e', border: '#fde68a' },
  { bg: '#ede9fe', text: '#5b21b6', border: '#ddd6fe' },
  { bg: '#fce7f3', text: '#9d174d', border: '#fbcfe8' },
  { bg: '#cffafe', text: '#155e75', border: '#a5f3fc' },
]

const groupColorStyle = (groupNumber) => {
  const group = Number(groupNumber || 0)
  if (!group) return {}
  const color = groupPalette[(group - 1) % groupPalette.length]
  return {
    background: color.bg,
    color: color.text,
    borderColor: color.border,
  }
}

const linkedDocumentUnitByMappingRow = (row) => {
  const item = linkedDocumentItemById(row?.upd_documents_item_id)
  return String(item?.unit_name || '')
}

const linkedDocumentSumByMappingRow = (row) => {
  const item = linkedDocumentItemById(row?.upd_documents_item_id)
  return toNumberOrZero(item?.sum)
}

const calculatePriceFromDocumentSum = (row) => {
  const qty = toNumberOrZero(row?.mapped_quantity)
  if (!qty) return toNumberOrZero(row?.price)
  const linkedSum = linkedDocumentSumByMappingRow(row)
  return roundToPricePrecision(linkedSum / qty)
}

const isUnitMismatch = (row) => {
  const linkedUnit = linkedDocumentUnitByMappingRow(row).trim().toLowerCase()
  const mappingUnit = String(row?.unit_name || '').trim().toLowerCase()
  if (!linkedUnit || !mappingUnit) return false
  return linkedUnit !== mappingUnit
}

const isSumMismatch = (row) => {
  if (!row?.upd_documents_item_id) return false
  return linkedDocumentSumByMappingRow(row) !== rowSum(row)
}

const filteredAutoMatchObjects = computed(() => filteredObjects(autoMatchForm.value.object_name))

const loadObjects = async () => {
  try {
    const res = await fetch('/apiref/ref/objects', { credentials: 'include' })
    if (!res.ok) throw new Error('objects')
    const data = await res.json()
    objects.value = normalizeArray(data).map((item) => {
      const name = String(item?.short_name || item?.full_name || '').trim()
      return {
        id: String(item?.id || ''),
        name,
        search: `${name} ${String(item?.full_name || '')}`.toLowerCase(),
      }
    }).filter((item) => item.id && item.name)
  } catch {
    objects.value = []
  }
}

const buildMappingRow = (mapping) => {
  const objectId = String(mapping?.object_id || '')
  const objectName = objectNameById(objectId)
  const attributeBase = parseAttributeBase(mapping?.attribute)
  const row = {
    id: String(mapping?.id || ''),
    mappingId: String(mapping?.id || ''),
    isDraft: false,
    upd_documents_item_id: String(mapping?.upd_documents_item_id || ''),
    nomenclature_id: String(mapping?.nomenclature_id || ''),
    name: String(mapping?.nomenclature?.name || ''),
    unit_name: String(mapping?.nomenclature?.unit_name || ''),
    mapped_quantity: mapping?.mapped_quantity ?? '',
    price: mapping?.price ?? 0,
    attributeBase,
    object_id: objectId,
    object_name: objectName,
    warehouse_id: String(mapping?.warehouse_id || warehouseId.value || ''),
    group_number: Number(mapping?.group_number || 0),
    match_type: String(mapping?.match_type || 'direct'),
  }
  if (row.upd_documents_item_id && toNumberOrZero(row.mapped_quantity) > 0) {
    row.price = calculatePriceFromDocumentSum(row)
  }
  return row
}

const loadDocument = async () => {
  loading.value = true
  error.value = ''
  try {
    const res = await fetch(`/apisup/supply/upd-documents/${encodeURIComponent(documentId.value)}`, {
      credentials: 'include',
    })
    if (!res.ok) throw new Error('document load failed')
    const data = await res.json()
    payload.value = data
    pdfUrl.value = `/apisup/supply/upd-documents/${encodeURIComponent(documentId.value)}/file/download`
    await resizeDocumentTextareas()
  } catch {
    payload.value = null
    pdfUrl.value = ''
    error.value = 'Не удалось загрузить документ.'
  } finally {
    loading.value = false
  }
}

const loadMappings = async () => {
  mappingsLoading.value = true
  try {
    const res = await fetch(`/apisup/supply/upd-item-mappings?upd_documents_id=${encodeURIComponent(documentId.value)}`, {
      credentials: 'include',
    })
    if (!res.ok) throw new Error('mappings load failed')
    const data = await res.json()
    mappingRows.value = normalizeArray(data).map(buildMappingRow)
    selectedDocumentItemId.value = ''
  } catch {
    mappingRows.value = []
  } finally {
    mappingsLoading.value = false
  }
}

const loadPage = async () => {
  await Promise.all([loadObjects(), loadDocument()])
  await loadMappings()
}

const openCreateNomenclature = () => {
  const query = new URLSearchParams({
    back: route.fullPath,
    warehouse_id: warehouseId.value,
  })
  window.open(`/nomenclature/new?${query.toString()}`, '_blank', 'noopener')
}

const patchDocument = async (patch) => {
  saving.value = true
  try {
    const res = await fetch(`/apisup/supply/upd-documents/${encodeURIComponent(documentId.value)}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: jsonHeaders,
      body: JSON.stringify(patch),
    })
    if (!res.ok) throw new Error('patch failed')
  } catch {
    error.value = 'Не удалось сохранить данные документа.'
    await loadDocument()
  } finally {
    saving.value = false
  }
}

const onDocumentDateInput = (event) => {
  if (!payload.value) return
  payload.value.date = event.target.value
}

const onDocumentDateBlur = async () => {
  if (!payload.value) return
  await patchDocument({ date: payload.value.date || null })
}

const onDocumentNumberBlur = async () => {
  if (!payload.value) return
  await patchDocument({ num: payload.value.num || '' })
}

const reparseItems = async () => {
  if (reparsing.value) return
  reparsing.value = true
  error.value = ''
  try {
    const res = await fetch(`/apisup/supply/upd-documents/${encodeURIComponent(documentId.value)}/reparse-items`, {
      method: 'POST',
      credentials: 'include',
    })
    if (!res.ok) throw new Error('reparse failed')
    await loadDocument()
    await loadMappings()
  } catch {
    error.value = 'Не удалось выполнить автораспознавание документа.'
  } finally {
    reparsing.value = false
  }
}

const createItem = async () => {
  error.value = ''
  try {
    const res = await fetch(`/apisup/supply/upd-documents/${encodeURIComponent(documentId.value)}/items`, {
      method: 'POST',
      credentials: 'include',
      headers: jsonHeaders,
      body: JSON.stringify({
        name: 'Новая позиция',
        unit_name: 'шт',
        quantity: 1,
        price: 0,
        vat_rate: 0,
        sum: 0,
      }),
    })
    if (!res.ok) throw new Error('create item failed')
    await loadDocument()
  } catch {
    error.value = 'Не удалось добавить позицию документа.'
  }
}

const updateItem = async (row) => {
  const itemId = String(row?.id || '')
  if (!itemId) return
  try {
    const res = await fetch(`/apisup/supply/upd-documents/${encodeURIComponent(documentId.value)}/items/${encodeURIComponent(itemId)}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: jsonHeaders,
      body: JSON.stringify({
        name: row?.name || '',
        unit_name: row?.unit_name || '',
        quantity: row?.quantity == null || row?.quantity === '' ? 0 : Number(row.quantity),
        price: row?.price == null || row?.price === '' ? 0 : Number(row.price),
        vat_rate: row?.vat_rate == null || row?.vat_rate === '' ? 0 : Number(row.vat_rate),
        sum: row?.sum == null || row?.sum === '' ? 0 : Number(row.sum),
      }),
    })
    if (!res.ok) throw new Error('update item failed')
  } catch {
    error.value = 'Не удалось обновить позицию документа.'
    await loadDocument()
  }
}

const deleteItem = async (row) => {
  const itemId = String(row?.id || '')
  if (!itemId) return
  try {
    const res = await fetch(`/apisup/supply/upd-documents/${encodeURIComponent(documentId.value)}/items/${encodeURIComponent(itemId)}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    if (!res.ok) throw new Error('delete item failed')
    await loadDocument()
    await loadMappings()
  } catch {
    error.value = 'Не удалось удалить позицию документа.'
  }
}

const deleteAllItems = async () => {
  try {
    const res = await fetch(`/apisup/supply/upd-documents/${encodeURIComponent(documentId.value)}/items`, {
      method: 'DELETE',
      credentials: 'include',
    })
    if (!res.ok) throw new Error('delete all items failed')
    await loadDocument()
    await loadMappings()
  } catch {
    error.value = 'Не удалось удалить все позиции документа.'
  }
}

const addMappingDraft = () => {
  mappingRows.value.push({
    id: `tmp-map-${tempMappingSeq.value++}`,
    mappingId: '',
    isDraft: true,
    upd_documents_item_id: '',
    nomenclature_id: '',
    name: '',
    unit_name: '',
    mapped_quantity: '',
    price: 0,
    attributeBase: '',
    object_id: '',
    object_name: '',
    warehouse_id: warehouseId.value,
    group_number: 0,
    match_type: 'direct',
  })
}

const unlinkDocumentRow = async (documentRow) => {
  const documentItemId = String(documentRow?.id || '')
  if (!documentItemId) return
  const linkedRows = mappingRows.value.filter((row) => String(row?.upd_documents_item_id || '') === documentItemId && row?.mappingId)
  if (!linkedRows.length) return

  try {
    for (const row of linkedRows) {
      // eslint-disable-next-line no-await-in-loop
      const res = await fetch(`/apisup/supply/upd-item-mappings/${encodeURIComponent(row.mappingId)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: jsonHeaders,
        body: JSON.stringify({
          upd_documents_item_id: '',
          group_number: 0,
          match_type: 'direct',
        }),
      })
      if (!res.ok) throw new Error('unlink mapping failed')
    }
    selectedDocumentItemId.value = ''
    await loadMappings()
  } catch {
    error.value = 'Не удалось снять связку.'
  }
}

const onDocumentMappingClick = async (row) => {
  if (row?.groupNumber) {
    await unlinkDocumentRow(row)
    return
  }
  selectedDocumentItemId.value = String(row?.id || '')
}

const deleteMapping = async (row) => {
  if (row?.isDraft || !row?.mappingId) {
    mappingRows.value = mappingRows.value.filter((item) => item.id !== row.id)
    return
  }
  try {
    const res = await fetch(`/apisup/supply/upd-item-mappings/${encodeURIComponent(row.mappingId)}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    if (!res.ok) throw new Error('delete mapping failed')
    await loadMappings()
  } catch {
    error.value = 'Не удалось удалить сопоставление.'
  }
}

const deleteAllMappings = async () => {
  try {
    const persistedRows = mappingRows.value.filter((row) => row?.mappingId && !row?.isDraft)
    for (const row of persistedRows) {
      // eslint-disable-next-line no-await-in-loop
      const res = await fetch(`/apisup/supply/upd-item-mappings/${encodeURIComponent(row.mappingId)}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error('delete mapping failed')
    }
    mappingRows.value = []
    selectedDocumentItemId.value = ''
    await loadMappings()
  } catch {
    error.value = 'Не удалось удалить все связки.'
  }
}

const unbindConflictingRows = async (documentItemId, currentRowId) => {
  const conflicts = mappingRows.value.filter((row) =>
    String(row?.upd_documents_item_id || '') === String(documentItemId || '')
    && String(row?.id || '') !== String(currentRowId || '')
  )
  for (const row of conflicts) {
    if (row.isDraft || !row.mappingId) {
      row.upd_documents_item_id = ''
      row.group_number = 0
      continue
    }
    const res = await fetch(`/apisup/supply/upd-item-mappings/${encodeURIComponent(row.mappingId)}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    if (!res.ok) throw new Error('delete conflicting mapping failed')
  }
}

const persistMappingRow = async (row, options = {}) => {
  const { reload = true } = options
  if (!row?.nomenclature_id || !row?.upd_documents_item_id) return
  const body = {
    upd_documents_id: documentId.value,
    upd_documents_item_id: row.upd_documents_item_id,
    nomenclature_id: row.nomenclature_id,
    group_number: Number(row.group_number || 0),
    match_type: 'direct',
    mapped_quantity: toNumberOrZero(row.mapped_quantity),
    object_id: row.object_id || null,
    price: toNumberOrZero(row.price),
    warehouse_id: row.warehouse_id || warehouseId.value,
    attribute: composeAttribute(row.attributeBase, row.object_name),
  }

  try {
    if (row.isDraft || !row.mappingId) {
      const res = await fetch('/apisup/supply/upd-item-mappings', {
        method: 'POST',
        credentials: 'include',
        headers: jsonHeaders,
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('create mapping failed')
    } else {
      const res = await fetch(`/apisup/supply/upd-item-mappings/${encodeURIComponent(row.mappingId)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: jsonHeaders,
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('update mapping failed')
    }
    if (reload) await loadMappings()
  } catch {
    error.value = 'Не удалось сохранить сопоставление.'
    if (reload) await loadMappings()
  }
}

const bindMappingRow = async (row) => {
  if (!selectedDocumentItemId.value) return
  const groupNumber = getNextGroupNumber()
  if (!groupNumber) return
  try {
    await unbindConflictingRows(selectedDocumentItemId.value, row.id)
    row.upd_documents_item_id = selectedDocumentItemId.value
    row.group_number = groupNumber
    if (row.nomenclature_id) {
      row.price = calculatePriceFromDocumentSum(row)
      await persistMappingRow(row)
    }
    selectedDocumentItemId.value = ''
  } catch {
    error.value = 'Не удалось связать позиции.'
    await loadMappings()
  }
}

const searchNomenclature = async (row) => {
  const query = String(row?.name || '').trim()
  nomenclatureLookupRowId.value = String(row?.id || '')
  if (!query) {
    nomenclatureLookupResults.value = []
    return
  }
  nomenclatureLookupLoadingRowId.value = String(row?.id || '')
  try {
    const res = await fetch(`/apisup/supply/nomenclature?search=${encodeURIComponent(query)}`, {
      credentials: 'include',
    })
    if (!res.ok) throw new Error('nomenclature search failed')
    const data = await res.json()
    nomenclatureLookupResults.value = normalizeArray(data).map((item) => ({
      id: String(item?.id || ''),
      name: String(item?.name || ''),
      unit_name: String(item?.unit?.name || item?.unit_name || ''),
    })).filter((item) => item.id && item.name)
  } catch {
    nomenclatureLookupResults.value = []
  } finally {
    nomenclatureLookupLoadingRowId.value = ''
  }
}

const chooseNomenclature = async (row, option) => {
  row.nomenclature_id = option.id
  row.name = option.name
  row.unit_name = option.unit_name
  if (row.mapped_quantity === '' || row.mapped_quantity == null) row.mapped_quantity = 1
  if (row.upd_documents_item_id) row.price = calculatePriceFromDocumentSum(row)
  nomenclatureLookupRowId.value = ''
  nomenclatureLookupResults.value = []
  if (row.upd_documents_item_id) await persistMappingRow(row)
}

const filteredRowObjects = (row) => filteredObjects(row?.object_name)

const chooseRowObject = async (row, option) => {
  row.object_id = option.id
  row.object_name = option.name
  objectLookupRowId.value = ''
  if (row.upd_documents_item_id && row.nomenclature_id) await persistMappingRow(row)
}

const clearRowObject = async (row) => {
  row.object_id = ''
  row.object_name = ''
  objectLookupRowId.value = ''
  if (row.upd_documents_item_id && row.nomenclature_id && !row.isDraft) await persistMappingRow(row)
}

const onRowFieldBlur = async (row) => {
  if (row.upd_documents_item_id && row.nomenclature_id) await persistMappingRow(row)
}

const onMappedQuantityInput = (row) => {
  row.price = calculatePriceFromDocumentSum(row)
}

const onMappedQuantityBlur = async (row) => {
  row.price = calculatePriceFromDocumentSum(row)
  await onRowFieldBlur(row)
}

const openAutoMatchModal = () => {
  autoMatchForm.value = {
    object_id: '',
    object_name: '',
    attribute: '',
  }
  autoMatchObjectOpen.value = false
  autoMatchModalOpen.value = true
}

const chooseAutoMatchObject = (option) => {
  autoMatchForm.value.object_id = option.id
  autoMatchForm.value.object_name = option.name
  autoMatchObjectOpen.value = false
}

const submitAutoMatch = async () => {
  if (autoMatching.value) return
  autoMatching.value = true
  autoMatchModalOpen.value = false
  autoMatchObjectOpen.value = false
  try {
    const res = await fetch('/apisup/supply/upd-item-mappings/auto-match', {
      method: 'POST',
      credentials: 'include',
      headers: jsonHeaders,
      body: JSON.stringify({
        upd_documents_id: documentId.value,
        warehouse_id: warehouseId.value,
        object_id: autoMatchForm.value.object_id || null,
        attribute: autoMatchForm.value.attribute || null,
      }),
    })
    if (!res.ok) throw new Error('auto match failed')
    await loadMappings()
    const linkedRows = mappingRows.value.filter((row) =>
      row?.mappingId && row?.upd_documents_item_id && toNumberOrZero(row?.mapped_quantity) > 0
    )
    for (const row of linkedRows) {
      row.price = calculatePriceFromDocumentSum(row)
      // eslint-disable-next-line no-await-in-loop
      await persistMappingRow(row, { reload: false })
    }
    await loadMappings()
  } catch {
    autoMatchModalOpen.value = true
    error.value = 'Не удалось выполнить автосопоставление.'
  } finally {
    autoMatching.value = false
  }
}

const normalizeReceiptRows = (payload) => {
  if (Array.isArray(payload)) return payload
  return payload?.items || payload?.data || payload?.results || []
}

const buildReceiptGroups = () => {
  const persistedMappings = mappingRows.value.filter((row) =>
    row?.mappingId
    && row?.nomenclature_id
    && row?.upd_documents_item_id
    && Number(row?.group_number || 0) > 0
  )

  const groups = new Map()
  for (const row of persistedMappings) {
    const objectId = String(row?.object_id || '')
    const key = objectId || '__no_object__'
    if (!groups.has(key)) {
      groups.set(key, {
        object_id: objectId || null,
        rows: [],
      })
    }
    groups.get(key).rows.push(row)
  }
  return [...groups.values()]
}

const finishDocument = async () => {
  if (finishing.value) return
  const groups = buildReceiptGroups()
  if (!groups.length) {
    error.value = 'Нет сопоставленных позиций для завершения документа.'
    return
  }

  finishing.value = true
  error.value = ''
  try {
    const receiptListRes = await fetch(`/apisup/supply/warehouse-receipts?warehouse_id=${encodeURIComponent(warehouseId.value)}`, {
      credentials: 'include',
    })
    if (!receiptListRes.ok) throw new Error('warehouse receipts load failed')
    const receiptListPayload = await receiptListRes.json()
    const receiptRows = normalizeReceiptRows(receiptListPayload)
    let nextNum = receiptRows.reduce((max, item) => Math.max(max, Number(item?.num || 0)), 0) + 1
    const documentDate = normalizeInputDate(payload.value?.date) || new Date().toISOString().slice(0, 10)

    for (const group of groups) {
      const receiptCreateRes = await fetch('/apisup/supply/warehouse-receipts', {
        method: 'POST',
        credentials: 'include',
        headers: jsonHeaders,
        body: JSON.stringify({
          num: nextNum,
          from: payload.value?.provider_id || null,
          to: payload.value?.payer_id || null,
          type: 1,
          object_id: group.object_id,
          warehouse_id: warehouseId.value,
          status_id: 'ff28cc86-1968-11f1-aa8c-bc241127d0bd',
          upd_documents_id: documentId.value,
        }),
      })
      if (!receiptCreateRes.ok) throw new Error('warehouse receipt create failed')
      const receiptPayload = await receiptCreateRes.json().catch(() => null)
      const receiptId = String(receiptPayload?.id || receiptPayload?.warehouse_receipt_id || '')
      if (!receiptId) throw new Error('warehouse receipt id missing')

      const receiptLogRes = await fetch(`/apisup/supply/warehouse-receipts/${encodeURIComponent(receiptId)}/logs`, {
        method: 'POST',
        credentials: 'include',
        headers: jsonHeaders,
        body: JSON.stringify({
          warehouse_id: warehouseId.value,
        }),
      })
      if (!receiptLogRes.ok) throw new Error('warehouse receipt log create failed')

      for (const row of group.rows) {
        const itemRes = await fetch(`/apisup/supply/warehouse-receipts/${encodeURIComponent(receiptId)}/items`, {
          method: 'POST',
          credentials: 'include',
          headers: jsonHeaders,
          body: JSON.stringify({
            nomenclature_id: row.nomenclature_id,
            quantity: toNumberOrZero(row.mapped_quantity),
            price: toNumberOrZero(row.price),
            upd_item_mapping_id: row.mappingId,
            object_id: row.object_id || null,
            attribute: composeAttribute(row.attributeBase, row.object_name),
          }),
        })
        if (!itemRes.ok) throw new Error('warehouse receipt item create failed')
        const itemPayload = await itemRes.json().catch(() => null)
        const itemId = String(itemPayload?.id || itemPayload?.warehouse_receipt_item_id || '')
        if (!itemId) throw new Error('warehouse receipt item id missing')

        const itemLogRes = await fetch(`/apisup/supply/warehouse-receipts/${encodeURIComponent(receiptId)}/items/${encodeURIComponent(itemId)}/logs`, {
          method: 'POST',
          credentials: 'include',
          headers: jsonHeaders,
          body: JSON.stringify({
            warehouse_id: warehouseId.value,
          }),
        })
        if (!itemLogRes.ok) throw new Error('warehouse receipt item log create failed')

        const stockRes = await fetch(`/apisup/supply/warehouses/${encodeURIComponent(warehouseId.value)}/list`, {
          method: 'POST',
          credentials: 'include',
          headers: jsonHeaders,
          body: JSON.stringify({
            nomenclature_id: row.nomenclature_id,
            quantity: toNumberOrZero(row.mapped_quantity),
            price: toNumberOrZero(row.price),
            upd_item_mapping_id: row.mappingId,
            attribute: composeAttribute(row.attributeBase, row.object_name),
            date: documentDate,
            object_id: row.object_id || null,
          }),
        })
        if (!stockRes.ok) throw new Error('warehouse stock create failed')
      }

      nextNum += 1
    }

    const patchRes = await fetch(`/apisup/supply/upd-documents/${encodeURIComponent(documentId.value)}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: jsonHeaders,
      body: JSON.stringify({
        status: '8d77ebe9-3a75-11f1-b298-bc241127d0bd',
      }),
    })
    if (!patchRes.ok) throw new Error('document status patch failed')

    router.push({
      name: 'warehouse-section',
      params: {
        warehouseId: warehouseId.value,
        section: 'documents',
      },
    })
  } catch {
    error.value = 'Не удалось завершить документ.'
  } finally {
    finishing.value = false
  }
}

const nextStep = () => {
  if (step.value < 3) step.value += 1
}

const prevStep = () => {
  if (step.value > 1) step.value -= 1
}

const openDownload = () => {
  if (!pdfUrl.value) return
  window.open(pdfUrl.value, '_blank', 'noopener')
}

watch(() => route.params.documentId, () => {
  step.value = 1
  loadPage()
})

watch(step, async (value) => {
  if (value === 2 || value === 3) await resizeDocumentTextareas()
})

watch(items, async () => {
  if (step.value === 2 || step.value === 3) await resizeDocumentTextareas()
}, { deep: true })

watch(mappingRows, async () => {
  if (step.value === 3) await resizeDocumentTextareas()
}, { deep: true })

onMounted(() => {
  document.addEventListener('pointerdown', onGlobalPointerDown)
  loadPage()
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onGlobalPointerDown)
})
</script>

<template>
  <div class="page">
    <TopNav :links="navLinks" />

    <div v-if="reparsing || autoMatching || finishing" class="page-loader">
      <div class="loader-card">
        <div class="loader-spinner"></div>
        <div class="loader-text">
          {{
            reparsing
              ? 'Выполняем автораспознавание документа, пожалуйста подождите...'
              : autoMatching
                ? 'Выполняем автосопоставление документа, пожалуйста подождите...'
                : 'Завершаем документ и создаём приходные накладные, пожалуйста подождите...'
          }}
        </div>
      </div>
    </div>

    <div v-if="autoMatchModalOpen" class="modal-backdrop" @click.self="autoMatchModalOpen = false">
      <div class="modal-card">
        <div class="modal-header">
          <h3>Автосопоставление</h3>
          <button type="button" class="icon-btn" @click="autoMatchModalOpen = false">
            <i class="fa-regular fa-xmark"></i>
          </button>
        </div>
        <div class="modal-body">
          <label class="modal-field lookup-field">
            <span>Объект</span>
            <input
              v-model="autoMatchForm.object_name"
              type="text"
              class="modal-input"
              placeholder="Выберите объект"
              @focus="autoMatchObjectOpen = true"
              @input="autoMatchObjectOpen = true"
              @blur="setTimeout(() => { autoMatchObjectOpen = false }, 150)"
            >
            <div v-if="autoMatchObjectOpen" class="lookup-menu modal-lookup">
              <button type="button" class="lookup-item ghost" @mousedown.prevent="autoMatchForm.object_id = ''; autoMatchForm.object_name = ''; autoMatchObjectOpen = false">
                Не выбран
              </button>
              <button
                v-for="option in filteredAutoMatchObjects"
                :key="option.id"
                type="button"
                class="lookup-item"
                @mousedown.prevent="chooseAutoMatchObject(option)"
              >
                {{ option.name }}
              </button>
            </div>
          </label>

          <label class="modal-field">
            <span>Атрибут</span>
            <select v-model="autoMatchForm.attribute" class="modal-input">
              <option value="">Не выбран</option>
              <option v-for="option in attributeOptions" :key="option" :value="option">{{ option }}</option>
            </select>
          </label>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn" @click="autoMatchModalOpen = false">Отмена</button>
          <button type="button" class="btn btn-primary" @click="submitAutoMatch">Запустить</button>
        </div>
      </div>
    </div>

    <main class="main-content">
      <div v-if="loading" class="inline-state">Загрузка документа...</div>
      <div v-else-if="error" class="inline-state error">{{ error }}</div>

      <div class="step-header">
        <div class="step-chip" :class="{ active: step === 1 }">1. Реквизиты</div>
        <span class="step-arrow">→</span>
        <div class="step-chip" :class="{ active: step === 2 }">2. Позиции</div>
        <span class="step-arrow">→</span>
        <div class="step-chip" :class="{ active: step === 3 }">3. Сопоставление</div>
      </div>

      <div class="step-title">
        <button type="button" class="back-link-btn" @click="goBack">
          <i class="fas fa-arrow-left"></i>
          Назад
        </button>
        <button type="button" class="title-link" @click="openDownload">Документ #{{ documentId }}</button> • Этап: {{ stepLabel }}
        <span v-if="payload?.status_name"> • Статус: {{ payload.status_name }}</span>
        <span v-if="saving"> • Сохранение...</span>
      </div>

      <template v-if="payload">
        <section v-if="step === 1" class="stage-layout">
          <div class="pdf-pane">
            <div class="pdf-title">PDF документа</div>
            <div class="pdf-placeholder">
              <CustomPdfPreview :src="pdfUrl" viewport-max-height="calc(100vh - 260px)" />
            </div>
          </div>

          <div class="stage-body">
            <div class="card-block">
              <h3>1. Выберите и сравните данные ПОСТАВЩИКА</h3>
              <div class="field-grid">
                <label>ИНН<input :value="payload.provider?.inn || ''" type="text" readonly></label>
                <label>Наименование<input :value="payload.provider_name || payload.provider?.short_name || ''" type="text" readonly></label>
              </div>
            </div>

            <div class="card-block">
              <h3>2. Выберите и сравните данные ПОКУПАТЕЛЯ</h3>
              <div class="field-grid">
                <label>ИНН<input :value="payload.payer?.inn || ''" type="text" readonly></label>
                <label>Наименование<input :value="payload.payer_name || payload.payer?.short_name || ''" type="text" readonly></label>
              </div>
            </div>

            <div class="card-block">
              <h3>3. Проверьте дату и номер документа</h3>
              <div class="field-grid two-cols">
                <label>Дата документа<input :value="normalizeInputDate(payload.date)" type="date" @input="onDocumentDateInput" @blur="onDocumentDateBlur"></label>
                <label>Номер документа<input v-model="payload.num" type="text" @blur="onDocumentNumberBlur"></label>
              </div>
            </div>
          </div>
        </section>

        <section v-else-if="step === 2" class="stage-layout">
          <div class="pdf-pane">
            <div class="pdf-title">PDF документа</div>
            <div class="pdf-placeholder">
              <CustomPdfPreview :src="pdfUrl" viewport-max-height="calc(100vh - 260px)" />
            </div>
          </div>

          <div class="stage-body">
            <div class="card-block invoice-items-card">
              <div class="card-title-row">
                <h3>Позиции из документа</h3>
                <div class="card-title-actions">
                  <button class="icon-btn" type="button" title="Добавить строку" @click="createItem">
                    <i class="fa-regular fa-plus"></i>
                  </button>
                  <button class="icon-btn danger" type="button" title="Удалить все позиции" @click="deleteAllItems">
                    <i class="fa-regular fa-trash"></i>
                  </button>
                </div>
              </div>
              <div class="table-wrap invoice-items-wrap">
                <table class="data-table stage2-document-table">
                  <colgroup>
                    <col class="col-narrow">
                    <col class="col-name-wide">
                    <col class="col-small">
                    <col class="col-small">
                    <col class="col-small">
                    <col class="col-small">
                    <col class="col-small">
                    <col class="col-narrow">
                  </colgroup>
                  <thead>
                    <tr>
                      <th>№</th>
                      <th>Название позиций документа</th>
                      <th>Кол-во</th>
                      <th>Ед. изм.</th>
                      <th>Цена</th>
                      <th>НДС</th>
                      <th>Сумма</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, index) in items" :key="row.id || index">
                      <td>{{ row.position || index + 1 }}</td>
                      <td><textarea v-model="row.name" class="cell-input cell-textarea" rows="1" lang="ru" spellcheck="true" autocapitalize="off" autocomplete="off" @input="onCellTextInput" @blur="updateItem(row)"></textarea></td>
                      <td><input v-model="row.quantity" class="cell-input" type="number" min="0" @blur="updateItem(row)"></td>
                      <td><input v-model="row.unit_name" class="cell-input" type="text" @blur="updateItem(row)"></td>
                      <td><input v-model="row.price" class="cell-input" type="number" min="0" step="any" @blur="updateItem(row)"></td>
                      <td><input v-model="row.vat_rate" class="cell-input" type="number" min="0" step="any" @blur="updateItem(row)"></td>
                      <td><input v-model="row.sum" class="cell-input" type="number" min="0" step="any" @blur="updateItem(row)"></td>
                      <td>
                        <button class="icon-btn danger" type="button" @click="deleteItem(row)">
                          <i class="fa-regular fa-trash"></i>
                        </button>
                      </td>
                    </tr>
                    <tr v-if="!items.length">
                      <td colspan="8" class="table-empty">Позиции отсутствуют</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        <section v-else class="stage-three">
          <div class="card-title-row tables-toolbar">
            <div class="table-title table-title-inline">Сопоставление документа</div>
            <div class="card-title-actions">
              <button class="btn" type="button" @click="hideLinkedMappings = !hideLinkedMappings">
                {{ hideLinkedMappings ? 'Показать все связки' : 'Скрыть все связки' }}
              </button>
              <button class="btn danger-btn" type="button" @click="deleteAllMappings">Удалить все связки</button>
            </div>
          </div>
          <div class="tables-grid two-tables">
            <div class="table-card">
              <div class="table-title">Позиции из документа #{{ payload.num || documentId }}</div>
              <div class="table-wrap">
                <table class="data-table stage3-document-table">
                  <colgroup>
                    <col class="col-narrow">
                    <col class="col-name-wide">
                    <col class="col-small">
                    <col class="col-small">
                    <col class="col-small">
                    <col class="col-small">
                    <col class="col-narrow">
                  </colgroup>
                  <thead>
                    <tr>
                      <th><button type="button" class="sort-btn" @click="toggleDocumentSort('displayIndex')"># {{ sortMark(documentSort, 'displayIndex') }}</button></th>
                      <th><button type="button" class="sort-btn" @click="toggleDocumentSort('name')">Наименование позиций документа {{ sortMark(documentSort, 'name') }}</button></th>
                      <th><button type="button" class="sort-btn" @click="toggleDocumentSort('quantity')">Кол-во {{ sortMark(documentSort, 'quantity') }}</button></th>
                      <th><button type="button" class="sort-btn" @click="toggleDocumentSort('unit_name')">Ед. изм. {{ sortMark(documentSort, 'unit_name') }}</button></th>
                      <th><button type="button" class="sort-btn" @click="toggleDocumentSort('price')">Цена {{ sortMark(documentSort, 'price') }}</button></th>
                      <th><button type="button" class="sort-btn" @click="toggleDocumentSort('sum')">Сумма {{ sortMark(documentSort, 'sum') }}</button></th>
                      <th><button type="button" class="sort-btn" @click="toggleDocumentSort('groupNumber')">№ {{ sortMark(documentSort, 'groupNumber') }}</button></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="row in sortedVisibleDocumentRowsStage3"
                      :key="row.id || row.displayIndex"
                      :class="{ selected: String(selectedDocumentItemId || '') === String(row.id || '') }"
                    >
                      <td>{{ row.displayIndex }}</td>
                      <td>{{ row.name || '—' }}</td>
                      <td>{{ formatMaybeNumber(row.quantity) }}</td>
                      <td>{{ row.unit_name || '—' }}</td>
                      <td>{{ formatMaybeNumber(row.price) }}</td>
                      <td>{{ formatMaybeNumber(row.sum) }}</td>
                      <td>
                        <button type="button" class="group-cell-btn" @click="onDocumentMappingClick(row)">
                          <span class="group-badge" :style="groupColorStyle(row.groupNumber)" :class="{ empty: !row.groupNumber, active: String(selectedDocumentItemId || '') === String(row.id || '') }">
                            {{ row.groupNumber || '—' }}
                          </span>
                        </button>
                      </td>
                    </tr>
                    <tr v-if="!visibleDocumentRowsStage3.length">
                      <td colspan="7" class="table-empty">Позиции отсутствуют</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div class="table-card">
              <div class="card-title-row">
                <div class="table-title table-title-inline">Позиции из номенклатуры</div>
                <div class="card-title-actions">
                  <button class="icon-btn" type="button" title="Добавить строку" @click="addMappingDraft">
                    <i class="fa-regular fa-plus"></i>
                  </button>
                </div>
              </div>
              <div class="table-wrap">
                <table class="data-table stage3-mapping-table">
                  <colgroup>
                    <col class="col-narrow">
                    <col class="col-name-wide stage3-map-name">
                    <col class="col-small">
                    <col class="col-small">
                    <col class="col-small">
                    <col class="col-small">
                    <col class="col-small">
                    <col class="col-small">
                  </colgroup>
                  <thead>
                    <tr>
                      <th><button type="button" class="sort-btn" @click="toggleMappingSort('group_number')">№ {{ sortMark(mappingSort, 'group_number') }}</button></th>
                      <th><button type="button" class="sort-btn" @click="toggleMappingSort('name')">Наименование {{ sortMark(mappingSort, 'name') }}</button></th>
                      <th><button type="button" class="sort-btn" @click="toggleMappingSort('mapped_quantity')">Прив. кол-во {{ sortMark(mappingSort, 'mapped_quantity') }}</button></th>
                      <th><button type="button" class="sort-btn" @click="toggleMappingSort('unit_name')">Прив. ед. изм. {{ sortMark(mappingSort, 'unit_name') }}</button></th>
                      <th><button type="button" class="sort-btn" @click="toggleMappingSort('price')">Прив. цена {{ sortMark(mappingSort, 'price') }}</button></th>
                      <th><button type="button" class="sort-btn" @click="toggleMappingSort('sum')">Сумма {{ sortMark(mappingSort, 'sum') }}</button></th>
                      <th><button type="button" class="sort-btn" @click="toggleMappingSort('attributeBase')">Атрибут {{ sortMark(mappingSort, 'attributeBase') }}</button></th>
                      <th><button type="button" class="sort-btn" @click="toggleMappingSort('object_name')">Объект {{ sortMark(mappingSort, 'object_name') }}</button></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, index) in sortedVisibleMappingRows" :key="row.id || index">
                      <td>
                        <button type="button" class="group-cell-btn" @click="bindMappingRow(row)">
                          <span class="group-badge" :style="groupColorStyle(row.group_number)" :class="{ empty: !row.group_number }">{{ row.group_number || '—' }}</span>
                        </button>
                      </td>
                      <td>
                        <div class="lookup-field">
                          <textarea
                            v-model="row.name"
                            class="cell-input cell-textarea mapping-name-textarea"
                            rows="1"
                            placeholder="Начните вводить наименование"
                            @focus="searchNomenclature(row)"
                            @input="onMappingNameInput($event, row)"
                            @blur="setTimeout(() => { if (nomenclatureLookupRowId === row.id) nomenclatureLookupRowId = '' }, 150)"
                          ></textarea>
                          <div v-if="nomenclatureLookupRowId === row.id" class="lookup-menu">
                            <button
                              type="button"
                              class="lookup-item ghost"
                              @mousedown.prevent="openCreateNomenclature"
                            >
                              + Создать товар
                            </button>
                            <div v-if="nomenclatureLookupLoadingRowId === row.id" class="lookup-empty">Загрузка...</div>
                            <button
                              v-for="option in nomenclatureLookupResults"
                              :key="option.id"
                              type="button"
                              class="lookup-item"
                              @mousedown.prevent="chooseNomenclature(row, option)"
                            >
                              {{ option.name }}
                            </button>
                            <div v-if="!nomenclatureLookupLoadingRowId && !nomenclatureLookupResults.length" class="lookup-empty">
                              Ничего не найдено
                            </div>
                          </div>
                        </div>
                      </td>
                      <td><input v-model="row.mapped_quantity" class="cell-input" type="number" min="0" step="any" @input="onMappedQuantityInput(row)" @blur="onMappedQuantityBlur(row)"></td>
                      <td :class="{ 'mismatch-cell': isUnitMismatch(row) }"><input :value="row.unit_name || '—'" class="cell-input readonly" type="text" readonly></td>
                      <td><input v-model="row.price" class="cell-input" type="number" min="0" step="any" @blur="onRowFieldBlur(row)"></td>
                      <td :class="{ 'mismatch-cell': isSumMismatch(row) }"><input :value="formatMaybeNumber(rowSum(row))" class="cell-input readonly" type="text" readonly></td>
                      <td>
                        <select v-model="row.attributeBase" class="cell-input cell-select" @change="onRowFieldBlur(row)">
                          <option value="">Не выбрано</option>
                          <option v-for="option in attributeOptions" :key="option" :value="option">{{ option }}</option>
                        </select>
                      </td>
                      <td>
                        <div class="lookup-field">
                          <input
                            v-model="row.object_name"
                            class="cell-input"
                            type="text"
                            placeholder="Выберите объект"
                            @focus="objectLookupRowId = row.id"
                            @input="objectLookupRowId = row.id"
                            @blur="setTimeout(() => { if (objectLookupRowId === row.id) objectLookupRowId = '' }, 150)"
                          >
                          <div v-if="objectLookupRowId === row.id" class="lookup-menu">
                            <button type="button" class="lookup-item ghost" @mousedown.prevent="clearRowObject(row)">Без объекта</button>
                            <button
                              v-for="option in filteredRowObjects(row)"
                              :key="option.id"
                              type="button"
                              class="lookup-item"
                              @mousedown.prevent="chooseRowObject(row, option)"
                            >
                              {{ option.name }}
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                    <tr v-if="!visibleMappingRows.length && !mappingsLoading">
                      <td colspan="8" class="table-empty">Сопоставления отсутствуют</td>
                    </tr>
                    <tr v-if="mappingsLoading">
                      <td colspan="8" class="table-empty">Загрузка сопоставлений...</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      </template>
    </main>

    <footer class="invoice-footer">
      <div class="footer-left">
        <button class="btn" type="button" @click="openDownload">Скачать документ</button>
        <button v-if="step === 2" class="btn" type="button" :disabled="reparsing" @click="reparseItems">Автораспознование</button>
        <button v-if="step === 3" class="btn" type="button" :disabled="autoMatching" @click="openAutoMatchModal">Автосопоставление</button>
      </div>

      <div class="footer-right">
        <button v-if="step > 1" class="btn" type="button" @click="prevStep">Назад</button>
        <button v-if="step === 3" class="btn btn-primary" type="button" :disabled="finishing" @click="finishDocument">Завершить</button>
        <button v-if="step < 3" class="btn btn-primary" type="button" @click="nextStep">Продолжить</button>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.page {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.page-loader,
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: color-mix(in srgb, #0f172a 38%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.loader-card,
.modal-card {
  border-radius: 12px;
  border: 1px solid var(--border-light);
  background: var(--bg-surface);
  box-shadow: var(--shadow-md);
}

.loader-card {
  min-width: 320px;
  max-width: 460px;
  padding: 18px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.modal-card {
  width: min(520px, calc(100vw - 32px));
  padding: 16px;
}

.modal-header,
.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.modal-header {
  margin-bottom: 14px;
}

.modal-header h3 {
  margin: 0;
  font-size: 16px;
}

.modal-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.modal-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.modal-input {
  width: 100%;
  min-height: 38px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-light);
  background: #fff;
  padding: 0 10px;
}

.modal-footer {
  margin-top: 16px;
  justify-content: flex-end;
}

.loader-spinner {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid color-mix(in srgb, var(--brand-primary) 25%, #cbd5e1);
  border-top-color: var(--brand-primary);
  animation: spin 0.8s linear infinite;
}

.loader-text {
  font-size: 13px;
  color: var(--text-primary);
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px 24px 8px;
  min-height: 0;
  overflow: hidden;
}

.step-header {
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  min-height: 48px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.step-chip {
  height: 30px;
  border-radius: 16px;
  border: 1px solid var(--border-light);
  background: var(--bg-subtle);
  color: var(--text-secondary);
  font-size: 12px;
  padding: 0 10px;
  display: inline-flex;
  align-items: center;
}

.step-chip.active {
  border-color: var(--brand-primary);
  background: var(--brand-light);
  color: var(--brand-primary);
  font-weight: 600;
}

.step-arrow {
  color: var(--text-tertiary);
}

.step-title {
  font-size: 13px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.title-link {
  border: none;
  background: transparent;
  color: var(--brand-primary);
  font-size: 13px;
  cursor: pointer;
  padding: 0;
}

.title-link:hover {
  text-decoration: underline;
}

.back-link-btn {
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  background: var(--bg-surface);
  color: var(--text-secondary);
  min-height: 30px;
  padding: 0 10px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  margin-right: 4px;
}

.back-link-btn:hover {
  border-color: var(--brand-primary);
  color: var(--brand-primary);
}

.inline-state {
  font-size: 12px;
  color: var(--text-secondary);
}

.inline-state.error {
  color: var(--danger-text);
}

.stage-layout {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(300px, 42%) minmax(420px, 58%);
  gap: 14px;
}

.stage-three {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.pdf-pane {
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  box-shadow: var(--shadow-sm);
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.pdf-title {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-light);
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 600;
}

.pdf-placeholder {
  flex: 1;
  min-height: 260px;
  overflow: hidden;
  background: #e2e8f0;
}

.stage-body {
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.card-block,
.table-card {
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  box-shadow: var(--shadow-sm);
  padding: 12px;
}

.card-block h3,
.table-title {
  margin: 0 0 10px;
  font-size: 13px;
  color: var(--text-primary);
}

.table-title-inline {
  margin-bottom: 0;
}

.card-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.card-title-row h3 {
  margin: 0;
}

.card-title-actions {
  display: flex;
  gap: 8px;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(160px, 1fr));
  gap: 10px;
}

.field-grid.two-cols {
  grid-template-columns: repeat(2, minmax(120px, 260px));
}

.field-grid label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.field-grid input {
  width: 100%;
  min-height: 36px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-light);
  background: var(--bg-subtle);
  padding: 0 10px;
}

.icon-btn {
  width: 30px;
  height: 30px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  background: var(--bg-surface);
  color: var(--text-secondary);
  cursor: pointer;
}

.icon-btn:hover {
  background: var(--bg-subtle);
}

.icon-btn.danger {
  color: var(--danger-text);
  border-color: color-mix(in srgb, var(--danger-text) 40%, var(--border-light));
}

.table-wrap {
  overflow: visible;
}

.invoice-items-card {
  display: flex;
  flex-direction: column;
  min-height: fit-content;
  flex: 0 0 auto;
  overflow: visible;
}

.invoice-items-wrap {
  flex: 0 0 auto;
  min-height: 0;
  max-height: none;
  overflow: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 12px;
}

.data-table col.col-narrow {
  width: 56px;
}

.data-table col.col-name-wide {
  width: auto;
}

.data-table col.col-small {
  width: 100px;
}

.stage2-document-table col.col-narrow:last-child {
  width: 52px;
}

.stage2-document-table col.col-narrow,
.stage3-document-table col.col-narrow,
.stage3-mapping-table col.col-narrow {
  width: 52px;
}

.stage3-document-table col.col-name-wide {
  width: 42%;
}

.stage3-mapping-table col.col-name-wide {
  width: 40%;
}

.stage3-mapping-table col.col-small {
  width: 98px;
}

.data-table th,
.data-table td {
  border: 1px solid var(--border-light);
  padding: 8px;
  text-align: left;
  vertical-align: top;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.data-table th {
  background: var(--bg-subtle);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.sort-btn {
  border: none;
  background: transparent;
  padding: 0;
  margin: 0;
  color: inherit;
  font: inherit;
  font-weight: inherit;
  text-transform: inherit;
  letter-spacing: inherit;
  cursor: pointer;
}

.sort-btn:hover {
  color: var(--brand-primary);
}

.stage2-document-table td,
.stage3-document-table td,
.stage3-mapping-table td {
  height: auto;
}

.cell-input {
  display: block;
  width: 100%;
  min-height: 38px;
  height: auto;
  box-sizing: border-box;
  border: 1px solid transparent;
  background: transparent;
  border-radius: 6px;
  padding: 6px 8px;
  color: var(--text-primary);
  font: inherit;
  line-height: 1.4;
  overflow: visible;
}

.cell-input:focus,
.modal-input:focus {
  border-color: var(--brand-primary);
  background: var(--bg-subtle);
  outline: none;
}

.cell-input.readonly {
  color: var(--text-secondary);
}

.cell-select {
  appearance: none;
  background: #fff;
}

.cell-textarea {
  resize: none;
  overflow: hidden;
  height: auto !important;
  line-height: 1.4;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.lookup-field {
  position: relative;
}

.lookup-menu {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 4px);
  z-index: 220;
  max-height: 220px;
  overflow: auto;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background: var(--bg-surface);
  box-shadow: var(--shadow-md);
}

.modal-lookup {
  z-index: 420;
}

.lookup-item,
.lookup-empty {
  width: 100%;
  padding: 9px 10px;
  border: none;
  background: transparent;
  text-align: left;
  font: inherit;
  color: var(--text-primary);
}

.lookup-item {
  cursor: pointer;
}

.lookup-item:hover,
.lookup-item.ghost:hover {
  background: var(--bg-subtle);
}

.lookup-item.ghost {
  color: var(--brand-primary);
}

.lookup-empty {
  color: var(--text-tertiary);
}

.group-cell-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
}

.group-badge {
  min-width: 32px;
  height: 28px;
  border-radius: 999px;
  border: 1px solid #bfdbfe;
  background: #dbeafe;
  color: #1d4ed8;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
}

.group-badge.empty {
  border-color: var(--border-light);
  background: var(--bg-subtle);
  color: var(--text-tertiary);
}

.group-badge.active {
  border-color: #2563eb;
  background: #2563eb;
  color: #fff;
}

.mapping-name-textarea {
  min-height: 42px;
}

.tables-toolbar {
  margin-bottom: 12px;
}

.danger-btn {
  border-color: color-mix(in srgb, var(--danger-text) 35%, var(--border-light));
  color: var(--danger-text);
}

.data-table tr.selected td {
  background: color-mix(in srgb, var(--brand-primary) 7%, #fff);
}

.table-empty {
  text-align: center;
  color: var(--text-tertiary);
}

.mismatch-cell {
  background: #fef2f2;
}

.tables-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
  flex: 1;
  min-height: 0;
}

.tables-grid.two-tables {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.18fr);
}

.stage-three .table-card {
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.stage-three .table-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.invoice-footer {
  border-top: 1px solid var(--border-light);
  background: var(--bg-surface);
  padding: 10px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.footer-left,
.footer-right {
  display: flex;
  gap: 10px;
}

@media (max-width: 1280px) {
  .tables-grid.two-tables,
  .stage-layout {
    grid-template-columns: 1fr;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
