<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TopNav from '../components/layout/TopNav.vue'
import CategoryTreePickerModal from '../components/CategoryTreePickerModal.vue'
import { buildWarehouseCategoryTree } from '../helpers/warehouseCategoryTree'
import { mainNavLinks } from '../constants/mainNav'

const route = useRoute()
const router = useRouter()

const navLinks = mainNavLinks

const warehouseId = computed(() => String(route.params.warehouseId || ''))
const mode = computed(() => String(route.params.mode || '').toLowerCase())
const isIncoming = computed(() => mode.value === 'incoming')
const isReturn = computed(() => mode.value === 'returns')
const isInventory = computed(() => mode.value === 'inventory')

const title = computed(() => {
  const base = isInventory.value
    ? 'Накладная инвентаризации'
    : isIncoming.value ? 'Приходная накладная' : isReturn.value ? 'Возвратная накладная' : 'Расходная накладная'
  const number = String(receiptNum.value || '').trim()
  return number ? `${base} № ${number}` : `${base} № —`
})
const dateLabel = computed(() => (isInventory.value ? 'Дата инвентаризации' : isIncoming.value ? 'Дата прихода' : isReturn.value ? 'Дата возврата' : 'Дата расхода'))
const incomingStatusId = 'ff28c5a3-1968-11f1-aa8c-bc241127d0bd'
const postedIncomingStatusId = 'ff28cc86-1968-11f1-aa8c-bc241127d0bd'
const outgoingTypeId = 2
const returnTypeId = 3
const inventoryTypeId = 4

const form = ref({
  date: '',
  from: '',
  fromId: '',
  to: '',
  toId: '',
  whoWriteOff: '',
  whoWriteOffId: '',
  areaName: '',
  document: '',
  object: String(route.query.object || route.query.warehouse_name || ''),
  objectId: '',
  toll: false,
  tollCompanyId: '',
  tollCompanyName: '',
  file: null,
})

const rows = ref([
  {
    id: 1,
    name: '',
    unit: '',
    qty: '',
    comment: '',
    price: '',
    priceOpt: '',
    nomenclatureId: '',
    itemId: '',
    rowId: '',
  },
])

const fileName = computed(() => {
  if (attachmentsUploading.value) return 'Файлы загружаются...'
  if (attachments.value.length) return `Прикреплено файлов: ${attachments.value.length}`
  return 'Можно выбрать несколько файлов'
})
const receiptId = ref('')
const receiptNum = ref('')
const receiptCreating = ref(false)
const receiptError = ref('')
const receiptIdParam = computed(() => String(route.params.receiptId || ''))
const receiptLoading = ref(false)
const receiptStatusId = ref('')
const receiptStatusName = ref('')
const activeRowId = ref(null)
const suggestions = ref([])
const suggestionsLoading = ref(false)
const suggestionsError = ref('')
let suggestionTimer = null
let receiptPatchTimer = null
const commentPatchTimers = new Map()
const rowContextMenu = ref({
  open: false,
  x: 0,
  y: 0,
  rowId: null,
})
const confirmDeleteOpen = ref(false)
const deleteTargetRowId = ref(null)

const createModalOpen = ref(false)
const createRowId = ref(null)
const createForm = ref({
  name: '',
  unit_id: '',
  warehouse_category_id: '',
})
const createSaving = ref(false)
const createError = ref('')

const units = ref([])
const categoryOptions = ref([])
const categoryPickerOpen = ref(false)
const counterparties = ref([])
const counterpartiesLoading = ref(false)
const counterpartiesError = ref('')
const isFromDropdownOpen = ref(false)
const isTollCompanyDropdownOpen = ref(false)
const isWhoWriteOffDropdownOpen = ref(false)
const objects = ref([])
const objectsLoading = ref(false)
const objectsError = ref('')
const isObjectDropdownOpen = ref(false)
const receiptParties = ref([])
const receiptPartiesLoading = ref(false)
const receiptPartiesError = ref('')
const isToDropdownOpen = ref(false)
const createObjectModalOpen = ref(false)
const createObjectSaving = ref(false)
const createObjectError = ref('')
const createObjectShortName = ref('')
const attachments = ref([])
const attachmentsLoading = ref(false)
const attachmentsUploading = ref(false)
const attachmentsError = ref('')
const postingReceipt = ref(false)
const unpostingReceipt = ref(false)
const warehouseStockItems = ref([])
const insufficientRowIds = ref([])
const categoryMeta = computed(() => buildWarehouseCategoryTree(categoryOptions.value))
const selectedCategoryLabel = computed(() => {
  const selected = categoryMeta.value.byId.get(String(createForm.value.warehouse_category_id || ''))
  return selected?.pathLabel || ''
})
const filterCounterpartiesByQuery = (query) => {
  const normalized = String(query || '').trim().toLowerCase()
  if (!normalized) return counterparties.value
  return counterparties.value.filter((item) => {
    const shortName = String(item?.short_name || '').toLowerCase()
    const fullName = String(item?.full_name || '').toLowerCase()
    return shortName.includes(normalized) || fullName.includes(normalized)
  })
}

const filteredCounterparties = computed(() => filterCounterpartiesByQuery(form.value.from))
const filteredTollCompanies = computed(() => filterCounterpartiesByQuery(form.value.tollCompanyName))
const filteredToCounterparties = computed(() => filterCounterpartiesByQuery(form.value.to))
const filteredWhoWriteOffCounterparties = computed(() => filterCounterpartiesByQuery(form.value.whoWriteOff))
const filteredObjects = computed(() => {
  const query = String(form.value.object || '').trim().toLowerCase()
  if (!query) return objects.value
  return objects.value.filter((item) => {
    const shortName = String(item?.short_name || '').toLowerCase()
    const fullName = String(item?.full_name || '').toLowerCase()
    return shortName.includes(query) || fullName.includes(query)
  })
})
const filteredReceiptParties = computed(() => {
  const query = String(form.value.to || '').trim().toLowerCase()
  if (!query) return receiptParties.value
  return receiptParties.value.filter((item) => String(item?.value || '').toLowerCase().includes(query))
})
const isReceiptLocked = computed(() => (
  String(receiptStatusId.value || '') === postedIncomingStatusId
  || String(receiptStatusName.value || '').trim().toLowerCase().includes('провед')
  || String(receiptStatusName.value || '').trim().toLowerCase().includes('заверш')
))
const fromLabel = computed(() => 'От кого')
const toLabel = computed(() => {
  if (isIncoming.value) return 'На кого'
  if (isReturn.value) return 'От кого'
  if (isInventory.value) return 'На кого'
  return 'Кому'
})
const showInventoryColumns = computed(() => isInventory.value)
const inventoryStockByNomenclature = computed(() => {
  const map = new Map()
  warehouseStockItems.value.forEach((item) => {
    const nomenclatureId = String(item?.nomenclature_id || '')
    if (!nomenclatureId) return
    const qty = Number(item?.quantity || item?.total_quantity || 0) || 0
    map.set(nomenclatureId, (map.get(nomenclatureId) || 0) + qty)
  })
  return map
})
const freeStockByNomenclature = computed(() => {
  const map = new Map()
  warehouseStockItems.value.forEach((item) => {
    const nomenclatureId = String(item?.nomenclature_id || '')
    if (!nomenclatureId) return
    const objectRef = String(item?.object_id || item?.object_levels_id || '').trim()
    if (objectRef) return
    const qty = Number(item?.quantity || 0) || 0
    map.set(nomenclatureId, (map.get(nomenclatureId) || 0) + qty)
  })
  return map
})
const displayedRows = computed(() =>
  isReceiptLocked.value
    ? rows.value.filter((row) => row.itemId || hasRowData(row))
    : rows.value
)

// Дублирующиеся номенклатуры в инвентаризации
const duplicateNomenclatureIds = computed(() => {
  if (!isInventory.value) return new Set()
  const seen = new Set()
  const dupes = new Set()
  rows.value.forEach((row) => {
    const id = String(row.nomenclatureId || '')
    if (!id) return
    if (seen.has(id)) dupes.add(id)
    else seen.add(id)
  })
  return dupes
})

const clearInsufficientRow = (rowId) => {
  insufficientRowIds.value = insufficientRowIds.value.filter((id) => id !== rowId)
}

const getWarehouseListRowId = (item) =>
  String(
    (Array.isArray(item?.row_ids) && item.row_ids[0])
    || item?.id
    || item?.row_id
    || item?.list_row_id
    || item?.warehouse_list_id
    || item?.warehouse_item_id
    || ''
  )

const goBack = () => {
  const back = String(route.query.back || '')
  if (back) {
    router.push(back)
    return
  }
  router.push(`/warehouses/${encodeURIComponent(warehouseId.value)}/${isIncoming.value ? 'incoming' : isReturn.value ? 'returns' : isInventory.value ? 'inventory' : 'outgoing'}`)
}

const hasRowData = (row) =>
  Boolean(
    String(row?.name || '').trim()
    || String(row?.unit || '').trim()
    || String(row?.qty || '').trim()
    || String(row?.comment || '').trim()
  )

const ensureTrailingRow = () => {
  if (isReceiptLocked.value) return
  if (!rows.value.length) {
    rows.value.push({
      id: 1,
      name: '',
      unit: '',
      qty: '',
      comment: '',
      price: '',
      priceOpt: '',
      nomenclatureId: '',
      itemId: '',
      rowId: '',
    })
    return
  }
  const last = rows.value[rows.value.length - 1]
  if (hasRowData(last)) {
    rows.value.push({
      id: rows.value.length + 1,
      name: '',
      unit: '',
      qty: '',
      comment: '',
      price: '',
      priceOpt: '',
      nomenclatureId: '',
      itemId: '',
      rowId: '',
    })
  }
}

const clearSuggestionTimer = () => {
  if (suggestionTimer) window.clearTimeout(suggestionTimer)
  suggestionTimer = null
}

const normalizeMoney = (value) => {
  if (value === '' || value == null) return ''
  const num = Number(String(value).replace(',', '.'))
  if (!Number.isFinite(num)) return ''
  return String(num)
}

const formatMoney = (value) => {
  const num = Number(value)
  if (!Number.isFinite(num)) return '0'
  return num.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 8 })
}

const showOutgoingPricing = computed(() => !isIncoming.value && !isReturn.value && !isInventory.value && isReceiptLocked.value)
const outgoingTotals = computed(() => {
  if (!showOutgoingPricing.value) return { purchase: 0, opt: 0, profit: 0 }
  const totals = displayedRows.value.reduce((acc, row) => {
    const qty = Number(String(row.qty || '').replace(',', '.'))
    const price = Number(String(row.price || '').replace(',', '.'))
    const priceOpt = Number(String(row.priceOpt || '').replace(',', '.'))
    if (Number.isFinite(qty) && Number.isFinite(price)) acc.purchase += qty * price
    if (Number.isFinite(qty) && Number.isFinite(priceOpt)) acc.opt += qty * priceOpt
    return acc
  }, { purchase: 0, opt: 0 })
  return {
    purchase: totals.purchase,
    opt: totals.opt,
    profit: totals.opt - totals.purchase,
  }
})

const loadNomenclaturePricing = async (id) => {
  const nomenclatureId = String(id || '')
  if (!nomenclatureId) return { priceOpt: '', price: '' }
  try {
    const res = await fetch(`/apisup/supply/nomenclature/${encodeURIComponent(nomenclatureId)}`, { credentials: 'include' })
    if (!res.ok) throw new Error('nomenclature detail failed')
    const data = await res.json()
    return {
      priceOpt: normalizeMoney(data?.price_opt),
      price: normalizeMoney(data?.price),
    }
  } catch {
    return { priceOpt: '', price: '' }
  }
}

const buildReceiptItemPayload = (row, overrides = {}) => {
  const priceValue = Number(String(row.price || '').replace(',', '.'))
  const priceOptValue = Number(String(row.priceOpt || '').replace(',', '.'))
  return {
    nomenclature_id: overrides.nomenclature_id ?? row.nomenclatureId ?? null,
    quantity: overrides.quantity ?? (Number(String(row.qty || '').replace(',', '.')) || 0),
    price: overrides.price ?? (Number.isFinite(priceValue) ? priceValue : null),
    price_opt: overrides.price_opt ?? (Number.isFinite(priceOptValue) ? priceOptValue : null),
    price_opt2: overrides.price_opt2 ?? null,
    price_retail: overrides.price_retail ?? null,
    upd_item_mapping: overrides.upd_item_mapping ?? null,
    object_id: overrides.object_id ?? form.value.objectId ?? null,
    comment: overrides.comment ?? row.comment ?? '',
    attribute: overrides.attribute ?? null,
  }
}

const patchReceiptItem = async (itemId, row, overrides = {}) => {
  if (!receiptId.value || !itemId || isReceiptLocked.value) return false
  try {
    const res = await fetch(
      `/apisup/supply/warehouse-receipts/${encodeURIComponent(receiptId.value)}/items/${encodeURIComponent(itemId)}`,
      {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildReceiptItemPayload(row, overrides)),
      }
    )
    return res.ok
  } catch {
    return false
  }
}

const createAdditionalReceiptItem = async (row, overrides = {}) => {
  if (!receiptId.value || !row?.nomenclatureId || isReceiptLocked.value) return ''
  try {
    const createRes = await fetch(`/apisup/supply/warehouse-receipts/${encodeURIComponent(receiptId.value)}/items`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nomenclature_id: row.nomenclatureId,
        quantity: overrides.quantity ?? (Number(String(row.qty || '').replace(',', '.')) || 0),
      }),
    })
    if (!createRes.ok) throw new Error('create extra item failed')
    const created = await createRes.json()
    const newItemId = String(created?.id || '')
    if (!newItemId) return ''
    await patchReceiptItem(newItemId, row, overrides)
    return newItemId
  } catch {
    return ''
  }
}

const syncOutgoingPriceOpt = async (row) => {
  if (!row?.nomenclatureId || isIncoming.value || isReturn.value) return
  const pricing = await loadNomenclaturePricing(row.nomenclatureId)
  if (pricing.priceOpt !== '') row.priceOpt = pricing.priceOpt
}

const parseNumericValue = (value) => {
  const num = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(num) ? num : 0
}

const getInventoryStockQuantity = (row) => {
  const nomenclatureId = String(row?.nomenclatureId || '')
  if (!nomenclatureId) return 0
  return inventoryStockByNomenclature.value.get(nomenclatureId) || 0
}

const getInventoryStockPrice = (row) => {
  const nomenclatureId = String(row?.nomenclatureId || '')
  if (!nomenclatureId) return ''
  const stockRow = warehouseStockItems.value.find((item) => String(item?.nomenclature_id || '') === nomenclatureId && item?.price != null)
  return normalizeMoney(stockRow?.price)
}

const getOutgoingStockPools = (stockItems, nomenclatureId, objectId) => {
  const itemNomenclatureId = String(nomenclatureId || '')
  const currentObjectId = String(objectId || '')
  const reservedRows = currentObjectId
    ? stockItems.filter((item) =>
      String(item?.nomenclature_id || '') === itemNomenclatureId
      && String(item?.object_id || item?.object_levels_id || '') === currentObjectId
    )
    : []
  const freeRows = stockItems.filter((item) =>
    String(item?.nomenclature_id || '') === itemNomenclatureId
    && !String(item?.object_id || item?.object_levels_id || '').trim()
  )
  return { reservedRows, freeRows }
}

const groupOutgoingConsumptionsByPrice = (consumptions) => {
  const groups = []
  consumptions.forEach((entry) => {
    const priceKey = normalizeMoney(entry.price) || '0'
    const existing = groups.find((group) => group.priceKey === priceKey)
    if (existing) {
      existing.quantity += entry.quantity
      existing.rows.push(entry)
      return
    }
    groups.push({
      priceKey,
      price: entry.price,
      quantity: entry.quantity,
      rows: [entry],
    })
  })
  return groups
}


const loadUnits = async () => {
  try {
    const res = await fetch('/apisup/supply/units', { credentials: 'include' })
    if (!res.ok) throw new Error('units')
    const data = await res.json()
    units.value = Array.isArray(data) ? data : (data?.items || [])
  } catch {
    units.value = []
  }
}

const loadCategories = async () => {
  try {
    const res = await fetch('/apisup/supply/warehouse-categories', { credentials: 'include' })
    if (!res.ok) throw new Error('categories')
    const data = await res.json()
    categoryOptions.value = (Array.isArray(data) ? data : (data?.items || []))
      .map((item) => ({
        id: String(item?.id || ''),
        name: String(item?.name || ''),
        parent_id: String(item?.parent_id || ''),
      }))
      .filter((item) => item.id)
  } catch {
    categoryOptions.value = []
  }
}

const loadCounterparties = async () => {
  counterpartiesLoading.value = true
  counterpartiesError.value = ''
  try {
    const res = await fetch('/apiref/ref/counterparties', { credentials: 'include' })
    if (!res.ok) throw new Error('counterparties')
    const data = await res.json()
    const items = Array.isArray(data) ? data : (data?.items || [])
    counterparties.value = items.map((item) => ({
      id: String(item?.id || ''),
      short_name: String(item?.short_name || ''),
      full_name: String(item?.full_name || ''),
    })).filter((item) => item.id)
    syncCounterpartyLabels()
  } catch {
    counterparties.value = []
    counterpartiesError.value = 'Не удалось загрузить контрагентов.'
  } finally {
    counterpartiesLoading.value = false
  }
}

const findCounterpartyLabel = (value) => {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const found = counterparties.value.find((item) => item.id === raw)
  return found?.short_name || found?.full_name || raw
}

const syncCounterpartyLabels = () => {
  if (form.value.fromId) {
    form.value.from = findCounterpartyLabel(form.value.fromId)
  }
  if (form.value.toId) {
    form.value.to = findCounterpartyLabel(form.value.toId)
  }
  if (form.value.whoWriteOffId) {
    form.value.whoWriteOff = findCounterpartyLabel(form.value.whoWriteOffId)
  }
}

const loadObjects = async () => {
  objectsLoading.value = true
  objectsError.value = ''
  try {
    const res = await fetch('/apiref/ref/objects', { credentials: 'include' })
    if (!res.ok) throw new Error('objects')
    const data = await res.json()
    const items = Array.isArray(data) ? data : (data?.items || [])
    objects.value = items.map((item) => ({
      id: String(item?.id || ''),
      short_name: String(item?.short_name || ''),
      full_name: String(item?.full_name || ''),
    })).filter((item) => item.id)
  } catch {
    objects.value = []
    objectsError.value = 'Не удалось загрузить объекты.'
  } finally {
    objectsLoading.value = false
  }
}

const loadReceiptParties = async () => {
  receiptPartiesLoading.value = true
  receiptPartiesError.value = ''
  try {
    const res = await fetch('/apisup/supply/warehouse-receipts/receipt-parties', { credentials: 'include' })
    if (!res.ok) throw new Error('receipt-parties')
    const data = await res.json()
    const items = Array.isArray(data) ? data : (data?.items || [])
    receiptParties.value = items
      .map((item) => ({ value: String(item?.value || '').trim() }))
      .filter((item) => item.value)
  } catch {
    receiptParties.value = []
    receiptPartiesError.value = 'Не удалось загрузить варианты.'
  } finally {
    receiptPartiesLoading.value = false
  }
}

const loadAttachments = async () => {
  if (!receiptId.value) {
    attachments.value = []
    return
  }
  attachmentsLoading.value = true
  attachmentsError.value = ''
  try {
    const res = await fetch(`/apisup/supply/warehouse-receipts/${encodeURIComponent(receiptId.value)}/attachments`, {
      credentials: 'include',
    })
    if (!res.ok) throw new Error('attachments')
    const data = await res.json()
    attachments.value = Array.isArray(data) ? data : (data?.items || [])
  } catch {
    attachments.value = []
    attachmentsError.value = 'Не удалось загрузить файлы.'
  } finally {
    attachmentsLoading.value = false
  }
}

const loadWarehouseStock = async () => {
  if (!warehouseId.value) {
    warehouseStockItems.value = []
    return
  }
  try {
    const res = await fetch(`/apisup/supply/warehouses/${encodeURIComponent(warehouseId.value)}/list`, {
      credentials: 'include',
    })
    if (!res.ok) throw new Error('warehouse list')
    const data = await res.json()
    warehouseStockItems.value = Array.isArray(data) ? data : (data?.items || [])
  } catch {
    warehouseStockItems.value = []
  }
}

const patchReceipt = async (payload) => {
  if (!receiptId.value || isReceiptLocked.value) return
  try {
    await fetch(`/apisup/supply/warehouse-receipts/${encodeURIComponent(receiptId.value)}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    // noop
  }
}

const queuePatchReceipt = (payload) => {
  if (receiptPatchTimer) window.clearTimeout(receiptPatchTimer)
  receiptPatchTimer = window.setTimeout(() => {
    patchReceipt(payload)
  }, 250)
}

const findRowById = (id) => rows.value.find((row) => row.id === id)

const fetchSuggestions = async (query) => {
  suggestionsLoading.value = true
  suggestionsError.value = ''
  try {
    const res = await fetch(`/apisup/supply/nomenclature?search=${encodeURIComponent(query)}`, {
      credentials: 'include',
    })
    if (!res.ok) throw new Error('suggestions')
    const data = await res.json()
    const items = Array.isArray(data) ? data : (data?.items || [])
    suggestions.value = items
  } catch {
    suggestions.value = []
    suggestionsError.value = 'Не удалось загрузить номенклатуру.'
  } finally {
    suggestionsLoading.value = false
  }
}

const onNameInput = (row, value) => {
  if (isReceiptLocked.value) return
  clearInsufficientRow(row.id)
  row.name = value
  if (row.nomenclatureId) row.nomenclatureId = ''
  ensureTrailingRow()

  const query = value.trim()
  if (!query) {
    activeRowId.value = null
    suggestions.value = []
    clearSuggestionTimer()
    return
  }
  activeRowId.value = row.id
  clearSuggestionTimer()
  suggestionTimer = window.setTimeout(() => {
    fetchSuggestions(query)
  }, 300)
}

const onArrivalDateChange = (value) => {
  if (isReceiptLocked.value) return
  form.value.date = value
  patchReceipt({ date_arrival: value || null })
}

const onFromInput = (value) => {
  if (isReceiptLocked.value) return
  form.value.from = value
  form.value.fromId = ''
  isFromDropdownOpen.value = true
}

const onTollChange = (value) => {
  if (isReceiptLocked.value) return
  form.value.toll = Boolean(value)
  if (!form.value.toll) {
    form.value.tollCompanyId = ''
    form.value.tollCompanyName = ''
    isTollCompanyDropdownOpen.value = false
  }
  patchReceipt({
    toll: form.value.toll,
    toll_company_id: form.value.toll ? (form.value.tollCompanyId || null) : null,
  })
}

const onTollCompanyInput = (value) => {
  if (isReceiptLocked.value) return
  form.value.tollCompanyName = value
  form.value.tollCompanyId = ''
  isTollCompanyDropdownOpen.value = true
}

const onObjectInput = (value) => {
  if (isReceiptLocked.value) return
  form.value.object = value
  form.value.objectId = ''
  isObjectDropdownOpen.value = true
}

const onAreaNameInput = (value) => {
  if (isReceiptLocked.value) return
  form.value.areaName = value
  queuePatchReceipt({ area_name: value || null })
}

const onDocumentInput = (value) => {
  if (isReceiptLocked.value) return
  form.value.document = value
  queuePatchReceipt({ document: value || null })
}

const onToInput = (value) => {
  if (isReceiptLocked.value) return
  form.value.to = value
  form.value.toId = ''
  if (isReturn.value) {
    isToDropdownOpen.value = filteredReceiptParties.value.length > 0
    queuePatchReceipt({ to: value || null })
    return
  }
  isToDropdownOpen.value = true
}

const onWhoWriteOffInput = (value) => {
  if (isReceiptLocked.value) return
  form.value.whoWriteOff = value
  form.value.whoWriteOffId = ''
  isWhoWriteOffDropdownOpen.value = true
}

const selectFromCounterparty = (item) => {
  if (isReceiptLocked.value) return
  const label = item?.short_name || item?.full_name || ''
  const id = String(item?.id || '')
  form.value.from = label
  form.value.fromId = id
  isFromDropdownOpen.value = false
  patchReceipt({ from: form.value.fromId || null })
}

const selectTollCompany = (item) => {
  if (isReceiptLocked.value) return
  form.value.tollCompanyName = item?.short_name || item?.full_name || ''
  form.value.tollCompanyId = String(item?.id || '')
  isTollCompanyDropdownOpen.value = false
  patchReceipt({
    toll: true,
    toll_company_id: form.value.tollCompanyId || null,
  })
}

const selectToCounterparty = (item) => {
  if (isReceiptLocked.value) return
  const label = item?.short_name || item?.full_name || ''
  const id = String(item?.id || '')
  form.value.to = label
  form.value.toId = id
  isToDropdownOpen.value = false
  patchReceipt({ to: form.value.toId || null })
}

const selectWhoWriteOffCounterparty = (item) => {
  if (isReceiptLocked.value) return
  const label = item?.short_name || item?.full_name || ''
  const id = String(item?.id || '')
  form.value.whoWriteOff = label
  form.value.whoWriteOffId = id
  isWhoWriteOffDropdownOpen.value = false
  patchReceipt({ who_write_off: form.value.whoWriteOffId || null })
}

const selectObject = (item) => {
  if (isReceiptLocked.value) return
  form.value.object = item?.short_name || item?.full_name || ''
  form.value.objectId = String(item?.id || '')
  isObjectDropdownOpen.value = false
  patchReceipt({ object_id: form.value.objectId || null })
}

const openCreateCounterparty = () => {
  window.open('/organizations/create', '_blank', 'noopener')
}

const selectReceiptParty = (value) => {
  if (isReceiptLocked.value) return
  form.value.to = value
  form.value.toId = ''
  isToDropdownOpen.value = false
  patchReceipt({ to: value || null })
}

const openCreateObjectModal = () => {
  if (isReceiptLocked.value) return
  createObjectShortName.value = String(form.value.object || '').trim()
  createObjectError.value = ''
  isObjectDropdownOpen.value = false
  createObjectModalOpen.value = true
}

const closeCreateObjectModal = () => {
  createObjectModalOpen.value = false
  createObjectShortName.value = ''
  createObjectError.value = ''
}

const saveCreatedObject = async () => {
  if (createObjectSaving.value || isReceiptLocked.value) return
  const shortName = String(createObjectShortName.value || '').trim()
  if (!shortName) {
    createObjectError.value = 'Введите короткое наименование объекта.'
    return
  }
  createObjectSaving.value = true
  createObjectError.value = ''
  try {
    const res = await fetch('/apiref/ref/objects', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ short_name: shortName }),
    })
    if (!res.ok) throw new Error('object create failed')
    const created = await res.json()
    const objectItem = {
      id: String(created?.id || ''),
      short_name: String(created?.short_name || shortName),
      full_name: String(created?.full_name || ''),
    }
    if (objectItem.id) {
      objects.value = [objectItem, ...objects.value.filter((item) => item.id !== objectItem.id)]
      selectObject(objectItem)
    }
    closeCreateObjectModal()
  } catch {
    createObjectError.value = 'Не удалось создать объект.'
  } finally {
    createObjectSaving.value = false
  }
}

const selectSuggestion = async (row, item) => {
  if (isReceiptLocked.value) return
  const newId = String(item?.id || '')
  // В инвентаризации запрещаем выбор дублирующейся номенклатуры
  if (isInventory.value && newId && newId !== String(row.nomenclatureId || '')) {
    const usedByOther = rows.value.some((r) => r.id !== row.id && String(r.nomenclatureId || '') === newId)
    if (usedByOther) {
      activeRowId.value = null
      suggestions.value = []
      return
    }
  }
  if (row.itemId && row.nomenclatureId && row.nomenclatureId !== newId) {
    deleteReceiptItem(row.itemId)
    row.itemId = ''
  }
  row.nomenclatureId = item?.id || ''
  row.name = item?.name || row.name
  row.unit = item?.unit?.name || row.unit
  row.qty = row.qty || '1'
  if (isInventory.value && !String(row.price || '').trim()) {
    row.price = getInventoryStockPrice(row)
  }
  if (!isIncoming.value && !isReturn.value && !isInventory.value) {
    await syncOutgoingPriceOpt(row)
  }
  activeRowId.value = null
  suggestions.value = []
  ensureTrailingRow()
  if (receiptId.value) await createReceiptItem(row)
}

const openCreateModal = (row) => {
  if (isReceiptLocked.value) return
  createRowId.value = row.id
  createForm.value = {
    name: String(row?.name || '').trim(),
    unit_id: '',
    warehouse_category_id: '',
  }
  createError.value = ''
  createModalOpen.value = true
}

const closeCreateModal = () => {
  createModalOpen.value = false
  createRowId.value = null
}

const saveCreatedNomenclature = async () => {
  if (createSaving.value || isReceiptLocked.value) return
  if (!createForm.value.name.trim()) {
    createError.value = 'Введите название.'
    return
  }
  if (!createForm.value.unit_id) {
    createError.value = 'Выберите единицу измерения.'
    return
  }
  if (!createForm.value.warehouse_category_id) {
    createError.value = 'Выберите товарную категорию.'
    return
  }

  createSaving.value = true
  createError.value = ''
  try {
    const payload = {
      name: createForm.value.name.trim(),
      unit_id: createForm.value.unit_id,
      warehouse_category_id: createForm.value.warehouse_category_id,
      description: null,
      article: null,
      length: 0,
      width: 0,
      height: 0,
      weight: 0,
    }
    const res = await fetch('/apisup/supply/nomenclature', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error('create failed')
    const created = await res.json()
    const row = findRowById(createRowId.value)
    if (row) {
      row.nomenclatureId = created?.id || ''
      row.name = created?.name || row.name
      row.unit = created?.unit?.name || row.unit
      row.qty = row.qty || '1'
      if (isInventory.value && !String(row.price || '').trim()) {
        row.price = getInventoryStockPrice(row)
      }
      if (!isIncoming.value && !isReturn.value && !isInventory.value) {
        await syncOutgoingPriceOpt(row)
      }
      if (receiptId.value) await createReceiptItem(row)
    }
    createModalOpen.value = false
  } catch {
    createError.value = 'Не удалось создать номенклатуру.'
  } finally {
    createSaving.value = false
  }
}

const queuePatchReceiptItemComment = (row) => {
  if (!receiptId.value || !row?.itemId || isReceiptLocked.value) return
  const rowKey = String(row.itemId)
  const existingTimer = commentPatchTimers.get(rowKey)
  if (existingTimer) window.clearTimeout(existingTimer)
  const timer = window.setTimeout(async () => {
    try {
      await fetch(
        `/apisup/supply/warehouse-receipts/${encodeURIComponent(receiptId.value)}/items/${encodeURIComponent(row.itemId)}`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildReceiptItemPayload(row, { comment: row.comment || '' })),
        }
      )
    } catch {
      // noop
    } finally {
      commentPatchTimers.delete(rowKey)
    }
  }, 300)
  commentPatchTimers.set(rowKey, timer)
}

const onAttachmentInput = async (event) => {
  const files = Array.from(event.target?.files || [])
  if (!receiptId.value || !files.length) return
  attachmentsUploading.value = true
  attachmentsError.value = ''
  try {
    const formData = new FormData()
    files.forEach((file) => formData.append('files', file))
    const res = await fetch(`/apisup/supply/warehouse-receipts/${encodeURIComponent(receiptId.value)}/attachments`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    })
    if (!res.ok) throw new Error('upload failed')
    await loadAttachments()
  } catch {
    attachmentsError.value = 'Не удалось загрузить файлы.'
  } finally {
    attachmentsUploading.value = false
    if (event.target) event.target.value = ''
  }
}

const downloadAttachment = async (fileId) => {
  if (!receiptId.value || !fileId) return
  window.open(
    `/apisup/supply/warehouse-receipts/${encodeURIComponent(receiptId.value)}/attachments/${encodeURIComponent(fileId)}/download`,
    '_blank'
  )
}

const deleteAttachment = async (fileId) => {
  if (!receiptId.value || !fileId || isReceiptLocked.value) return
  try {
    await fetch(
      `/apisup/supply/warehouse-receipts/${encodeURIComponent(receiptId.value)}/attachments/${encodeURIComponent(fileId)}`,
      {
        method: 'DELETE',
        credentials: 'include',
      }
    )
    await loadAttachments()
  } catch {
    attachmentsError.value = 'Не удалось удалить файл.'
  }
}

const handleDocumentClick = (event) => {
  const target = event.target
  if (!(target instanceof Element)) return
  if (target.closest('.name-cell')) return
  if (target.closest('.lookup-field')) return
  if (target.closest('.row-context-menu')) return
  activeRowId.value = null
  isFromDropdownOpen.value = false
  isTollCompanyDropdownOpen.value = false
  isWhoWriteOffDropdownOpen.value = false
  isObjectDropdownOpen.value = false
  isToDropdownOpen.value = false
  rowContextMenu.value.open = false
}

const onPrint = () => {
  const formatPrintDate = (value) => {
    const raw = String(value || '').slice(0, 10)
    if (!raw) return '—'
    const [year, month, day] = raw.split('-').map(Number)
    if (!year || !month || !day) return raw
    const date = new Date(year, month - 1, day)
    return date.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
  }

  const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

  const printableRows = rows.value
    .filter((row) => row.itemId || hasRowData(row))
    .map((row, index) => ({
      number: index + 1,
      name: row.name || '',
      qty: row.qty || '',
      unit: row.unit || '',
    }))
  const rowsPerPage = 12
  const pages = []
  for (let i = 0; i < printableRows.length || i === 0; i += rowsPerPage) {
    const chunk = printableRows.slice(i, i + rowsPerPage)
    while (chunk.length < rowsPerPage) {
      chunk.push({
        number: i + chunk.length + 1,
        name: '',
        qty: '',
        unit: '',
      })
    }
    pages.push(chunk)
  }

  const titleText = isIncoming.value ? 'Приходная накладная' : isReturn.value ? 'Возвратная накладная' : 'Расходная накладная'
  const partyLabel = isIncoming.value ? 'От кого' : isReturn.value ? 'От кого' : 'Кому'
  const partyValue = isIncoming.value ? form.value.from : form.value.to
  const printWindow = window.open('', '_blank', 'width=1100,height=900')
  if (!printWindow) return
  const pagesHtml = pages.map((pageRows, pageIndex) => {
    const rowsHtml = pageRows.map((row) => `
      <tr>
        <td class="num-cell">${escapeHtml(row.number)}</td>
        <td>${escapeHtml(row.name)}</td>
        <td class="qty-cell">${escapeHtml(row.qty)}</td>
        <td class="unit-cell">${escapeHtml(row.unit)}</td>
      </tr>
    `).join('')

    return `
      <div class="sheet ${pageIndex > 0 ? 'sheet-break' : ''}">
        <div class="title">
          ${pageIndex === 0 ? escapeHtml(titleText) : `Продолжение ${escapeHtml(titleText.toLowerCase())}`} № ${escapeHtml(receiptNum.value || '000000')} от ${escapeHtml(formatPrintDate(form.value.date))} г.
        </div>

        <table class="meta-table">
          <tr>
            <td class="meta-label">${isIncoming.value ? 'Склад приёмки' : isReturn.value ? 'Склад возврата' : 'Склад загрузки'}</td>
            <td>${escapeHtml(String(route.query.warehouse_name || route.query.name || '')) || escapeHtml('—')}</td>
          </tr>
          ${isReturn.value ? '' : `
          <tr>
            <td class="meta-label">Объект строительства</td>
            <td>${escapeHtml(form.value.object || '—')}</td>
          </tr>`}
          <tr>
            <td class="meta-label">${escapeHtml(partyLabel)}</td>
            <td>${escapeHtml(partyValue || '—')}</td>
          </tr>
          ${!isIncoming.value && !isReturn.value ? `
            <tr>
              <td class="meta-label">Участок</td>
              <td>${escapeHtml(form.value.areaName || '—')}</td>
            </tr>
            <tr>
              <td class="meta-label">Основание</td>
              <td>${escapeHtml(form.value.document || '—')}</td>
            </tr>
          ` : ''}
        </table>

        <table class="items-table">
          <thead>
            <tr>
              <th>№</th>
              <th>Наименование</th>
              <th>Кол-во</th>
              <th>Ед. изм.</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        ${pageIndex === pages.length - 1 ? `
          <div class="signatures">
            <div class="signature">
              <span>${isIncoming.value ? 'Принял:' : 'Отпустил:'}</span>
              <span class="signature-line"></span>
            </div>
            <div class="signature">
              <span>${isIncoming.value ? 'Сдал:' : 'Получил:'}</span>
              <span class="signature-line"></span>
            </div>
          </div>
        ` : ''}
      </div>
    `
  }).join('')

  printWindow.document.write(`
    <!doctype html>
    <html lang="ru">
      <head>
        <meta charset="UTF-8">
        <title>${escapeHtml(titleText)} № ${escapeHtml(receiptNum.value || '—')}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 10mm;
          }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            font-family: Arial, sans-serif;
            color: #111827;
            background:
              linear-gradient(#dbe4ef 1px, transparent 1px),
              linear-gradient(90deg, #dbe4ef 1px, transparent 1px);
            background-size: 16px 16px;
          }
          .sheet {
            width: 100%;
            min-height: 100vh;
            padding: 8px;
          }
          .sheet-break {
            page-break-before: always;
          }
          .title {
            font-size: 18px;
            font-weight: 700;
            margin-bottom: 8px;
          }
          .meta-table,
          .items-table {
            width: 100%;
            border-collapse: collapse;
            background: rgba(255,255,255,0.9);
          }
          .meta-table td,
          .items-table th,
          .items-table td {
            border: 1px solid #111827;
            padding: 6px 8px;
            font-size: 14px;
            vertical-align: top;
          }
          .meta-label {
            width: 180px;
            font-weight: 400;
          }
          .items-table {
            margin-top: 10px;
          }
          .items-table th {
            font-weight: 700;
            text-align: center;
          }
          .num-cell,
          .qty-cell,
          .unit-cell {
            text-align: center;
            white-space: nowrap;
          }
          .num-cell { width: 48px; }
          .qty-cell { width: 110px; }
          .unit-cell { width: 110px; }
          .signatures {
            margin-top: 28px;
            display: flex;
            justify-content: space-between;
            gap: 24px;
            font-size: 14px;
          }
          .signature {
            flex: 1;
            display: flex;
            align-items: flex-end;
            gap: 12px;
          }
          .signature-line {
            flex: 1;
            border-bottom: 1px solid #111827;
            min-height: 22px;
          }
        </style>
      </head>
      <body>
        ${pagesHtml}
      </body>
    </html>
  `)
  printWindow.document.close()
  printWindow.focus()
  printWindow.onload = () => {
    printWindow.print()
  }
}

const onPost = () => {
  if (!isIncoming.value || !receiptId.value || postingReceipt.value) return
  ;(async () => {
    if (form.value.toll && !form.value.tollCompanyId) {
      receiptError.value = 'Выберите компанию, предоставившую давальческое сырьё.'
      return
    }
    postingReceipt.value = true
    receiptError.value = ''
    try {
      const warehouseRes = await fetch(`/apisup/supply/warehouses/${encodeURIComponent(warehouseId.value)}/list`, {
        credentials: 'include',
      })
      if (!warehouseRes.ok) throw new Error('warehouse list failed')
      const warehousePayload = await warehouseRes.json()
      const stockItems = Array.isArray(warehousePayload)
        ? warehousePayload
        : (Array.isArray(warehousePayload?.items) ? warehousePayload.items : [])

      const actualRows = rows.value.filter((row) => row.itemId && row.nomenclatureId)
      const receiptDate = form.value.date || new Date().toISOString().slice(0, 10)
      const matchedObject = objects.value.find((item) => {
        const shortName = String(item?.short_name || '').trim()
        const fullName = String(item?.full_name || '').trim()
        const currentName = String(form.value.object || '').trim()
        return currentName && (currentName === shortName || currentName === fullName)
      })
      const objectId = form.value.objectId || matchedObject?.id || null

      for (const row of actualRows) {
        const qty = Number(String(row.qty || '').replace(',', '.'))
        if (!Number.isFinite(qty) || qty <= 0) continue

        const existing = stockItems.find((item) =>
          String(item?.nomenclature_id || '') === String(row.nomenclatureId || '')
          && String(item?.object_id || item?.object_levels_id || '') === String(objectId || '')
          && Boolean(item?.toll) === Boolean(form.value.toll)
          && String(item?.toll_company_id || '') === String(form.value.toll ? form.value.tollCompanyId : '')
        )

        const existingRowId = getWarehouseListRowId(existing)
        if (existingRowId) {
          const nextQty = (Number(existing?.quantity || 0) || 0) + qty
          const res = await fetch(
            `/apisup/supply/warehouses/${encodeURIComponent(warehouseId.value)}/list/${encodeURIComponent(existingRowId)}`,
            {
              method: 'PATCH',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                nomenclature_id: row.nomenclatureId,
                quantity: nextQty,
                date: receiptDate,
                object_id: objectId,
                toll: Boolean(form.value.toll),
                toll_company_id: form.value.toll ? form.value.tollCompanyId : null,
              }),
            }
          )
          if (!res.ok) throw new Error('warehouse row patch failed')
        } else {
          const res = await fetch(`/apisup/supply/warehouses/${encodeURIComponent(warehouseId.value)}/list`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              nomenclature_id: row.nomenclatureId,
              quantity: qty,
              date: receiptDate,
              object_id: objectId,
              toll: Boolean(form.value.toll),
              toll_company_id: form.value.toll ? form.value.tollCompanyId : null,
            }),
          })
          if (!res.ok) throw new Error('warehouse row create failed')
        }
      }

      const statusRes = await fetch(`/apisup/supply/warehouse-receipts/${encodeURIComponent(receiptId.value)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status_id: postedIncomingStatusId,
          date_arrival: receiptDate,
          toll: Boolean(form.value.toll),
          toll_company_id: form.value.toll ? form.value.tollCompanyId : null,
        }),
      })
      if (!statusRes.ok) throw new Error('receipt status patch failed')

      receiptStatusId.value = postedIncomingStatusId
      receiptStatusName.value = 'Проведен'
      form.value.date = receiptDate
    } catch {
      receiptError.value = 'Не удалось провести приходную накладную.'
    } finally {
      postingReceipt.value = false
    }
  })()
}

const postOutgoingReceipt = () => {
  if (isIncoming.value || !receiptId.value || postingReceipt.value) return
  ;(async () => {
    postingReceipt.value = true
    receiptError.value = ''
    insufficientRowIds.value = []
    try {
      const warehouseRes = await fetch(`/apisup/supply/warehouses/${encodeURIComponent(warehouseId.value)}/list`, {
        credentials: 'include',
      })
      if (!warehouseRes.ok) throw new Error('warehouse list failed')
      const warehousePayload = await warehouseRes.json()
      const stockItems = Array.isArray(warehousePayload)
        ? warehousePayload
        : (Array.isArray(warehousePayload?.items) ? warehousePayload.items : [])

      const actualRows = rows.value.filter((row) => row.itemId && row.nomenclatureId)
      const matchedObject = objects.value.find((item) => {
        const shortName = String(item?.short_name || '').trim()
        const fullName = String(item?.full_name || '').trim()
        const currentName = String(form.value.object || '').trim()
        return currentName && (currentName === shortName || currentName === fullName)
      })
      const objectId = form.value.objectId || matchedObject?.id || null
      if (!actualRows.length) {
        receiptError.value = 'В расходной накладной нет позиций для проведения.'
        return
      }

      const receiptDate = form.value.date || new Date().toISOString().slice(0, 10)
      const loggedItemIds = new Set()

      for (const row of actualRows) {
        if (!row.itemId) await createReceiptItem(row)
        let remaining = parseNumericValue(row.qty)
        if (!Number.isFinite(remaining) || remaining <= 0) continue

        if (!row.priceOpt) {
          const pricing = await loadNomenclaturePricing(row.nomenclatureId)
          if (pricing.priceOpt !== '') row.priceOpt = pricing.priceOpt
        }
        const priceOptValue = parseNumericValue(row.priceOpt)

        const { reservedRows, freeRows } = getOutgoingStockPools(stockItems, row.nomenclatureId, objectId)
        const consumptions = []

        for (const stockRow of [...reservedRows, ...freeRows]) {
          if (remaining <= 0) break
          const currentQty = Number(stockRow?.quantity || 0) || 0
          if (currentQty <= 0) continue
          const stockRowId = getWarehouseListRowId(stockRow)
          if (!stockRowId) throw new Error('warehouse row id missing')

          const used = Math.min(currentQty, remaining)
          const nextQty = currentQty - used
          const stockPrice = parseNumericValue(stockRow?.price)
          consumptions.push({
            rowId: stockRowId,
            quantity: used,
            price: stockPrice,
            objectId: stockRow?.object_id || stockRow?.object_levels_id || null,
          })

          const res = await fetch(
            `/apisup/supply/warehouses/${encodeURIComponent(warehouseId.value)}/list/${encodeURIComponent(stockRowId)}`,
            {
              method: 'PATCH',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                nomenclature_id: row.nomenclatureId,
                quantity: nextQty,
                date: receiptDate,
                object_id: stockRow?.object_id || stockRow?.object_levels_id || null,
              }),
            }
          )
          if (!res.ok) throw new Error('warehouse row patch failed')
          stockRow.quantity = nextQty
          remaining -= used
        }

        if (remaining > 0) {
          const fallbackRow = reservedRows[0] || freeRows[0] || null
          const fallbackRowId = getWarehouseListRowId(fallbackRow)
          if (fallbackRowId) {
            const currentQty = Number(fallbackRow?.quantity || 0) || 0
            const nextQty = currentQty - remaining
            const stockPrice = parseNumericValue(fallbackRow?.price)
            consumptions.push({
              rowId: fallbackRowId,
              quantity: remaining,
              price: stockPrice,
              objectId: fallbackRow?.object_id || fallbackRow?.object_levels_id || null,
            })

            const res = await fetch(
              `/apisup/supply/warehouses/${encodeURIComponent(warehouseId.value)}/list/${encodeURIComponent(fallbackRowId)}`,
              {
                method: 'PATCH',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  nomenclature_id: row.nomenclatureId,
                  quantity: nextQty,
                  date: receiptDate,
                  object_id: fallbackRow?.object_id || fallbackRow?.object_levels_id || null,
                }),
              }
            )
            if (!res.ok) throw new Error('warehouse fallback row patch failed')
            fallbackRow.quantity = nextQty
          } else {
            const res = await fetch(`/apisup/supply/warehouses/${encodeURIComponent(warehouseId.value)}/list`, {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                nomenclature_id: row.nomenclatureId,
                quantity: -remaining,
                date: receiptDate,
                object_id: null,
              }),
            })
            if (!res.ok) throw new Error('warehouse negative row create failed')
            consumptions.push({
              rowId: '',
              quantity: remaining,
              price: 0,
              objectId: null,
            })
          }
          remaining = 0
        }

        const groups = groupOutgoingConsumptionsByPrice(consumptions)
        if (!groups.length) continue

        const [firstGroup, ...extraGroups] = groups
        row.qty = String(firstGroup.quantity)
        row.price = normalizeMoney(firstGroup.price)
        row.priceOpt = normalizeMoney(priceOptValue)

        const patched = await patchReceiptItem(row.itemId, row, {
          quantity: firstGroup.quantity,
          price: firstGroup.price,
          price_opt: priceOptValue,
          object_id: objectId,
          comment: row.comment || '',
        })
        if (!patched) throw new Error('receipt item patch failed')
        loggedItemIds.add(String(row.itemId))

        for (const group of extraGroups) {
          const newItemId = await createAdditionalReceiptItem(row, {
            quantity: group.quantity,
            price: group.price,
            price_opt: priceOptValue,
            object_id: objectId,
            comment: row.comment || '',
          })
          if (!newItemId) throw new Error('receipt extra item create failed')
          loggedItemIds.add(String(newItemId))
        }
      }

      const receiptLogRes = await fetch(
        `/apisup/supply/warehouse-receipts/${encodeURIComponent(receiptId.value)}/logs`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ warehouse_id: warehouseId.value }),
        }
      )
      if (!receiptLogRes.ok) throw new Error('receipt log create failed')

      for (const itemId of loggedItemIds) {
        const itemLogRes = await fetch(
          `/apisup/supply/warehouse-receipts/${encodeURIComponent(receiptId.value)}/items/${encodeURIComponent(itemId)}/logs`,
          {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ warehouse_id: warehouseId.value }),
          }
        )
        if (!itemLogRes.ok) throw new Error('receipt item log create failed')
      }

      const statusRes = await fetch(`/apisup/supply/warehouse-receipts/${encodeURIComponent(receiptId.value)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status_id: postedIncomingStatusId,
        }),
      })
      if (!statusRes.ok) throw new Error('receipt status patch failed')

      receiptStatusId.value = postedIncomingStatusId
      receiptStatusName.value = 'Проведен'
      await loadWarehouseStock()
      await loadReceipt(receiptId.value)
    } catch (error) {
      receiptError.value = error instanceof Error && error.message
        ? error.message
        : 'Не удалось провести расходную накладную.'
    } finally {
      postingReceipt.value = false
    }
  })()
}

const postReturnReceipt = () => {
  if (!isReturn.value || !receiptId.value || postingReceipt.value) return
  ;(async () => {
    postingReceipt.value = true
    receiptError.value = ''
    try {
      const warehouseRes = await fetch(`/apisup/supply/warehouses/${encodeURIComponent(warehouseId.value)}/list`, {
        credentials: 'include',
      })
      if (!warehouseRes.ok) throw new Error('warehouse list failed')
      const warehousePayload = await warehouseRes.json()
      const stockItems = Array.isArray(warehousePayload)
        ? warehousePayload
        : (Array.isArray(warehousePayload?.items) ? warehousePayload.items : [])

      const actualRows = rows.value.filter((row) => row.itemId && row.nomenclatureId)
      if (!actualRows.length) {
        receiptError.value = 'В возвратной накладной нет позиций для проведения.'
        return
      }

      const receiptDate = form.value.date || new Date().toISOString().slice(0, 10)

      for (const row of actualRows) {
        const qty = Number(String(row.qty || '').replace(',', '.'))
        if (!Number.isFinite(qty) || qty <= 0) continue
        const stockRow = stockItems.find((item) =>
          String(item?.nomenclature_id || '') === String(row.nomenclatureId || '')
          && !String(item?.object_id || item?.object_levels_id || '').trim()
        )
        if (stockRow) {
          const stockRowId = getWarehouseListRowId(stockRow)
          if (!stockRowId) throw new Error('warehouse row id missing')
          const nextQty = (Number(stockRow?.quantity || 0) || 0) + qty
          const res = await fetch(
            `/apisup/supply/warehouses/${encodeURIComponent(warehouseId.value)}/list/${encodeURIComponent(stockRowId)}`,
            {
              method: 'PATCH',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                nomenclature_id: row.nomenclatureId,
                quantity: nextQty,
                date: receiptDate,
                object_id: null,
              }),
            }
          )
          if (!res.ok) throw new Error('warehouse row patch failed')
        } else {
          const res = await fetch(`/apisup/supply/warehouses/${encodeURIComponent(warehouseId.value)}/list`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              nomenclature_id: row.nomenclatureId,
              quantity: qty,
              date: receiptDate,
              object_id: null,
            }),
          })
          if (!res.ok) throw new Error('warehouse row create failed')
        }
      }

      const statusRes = await fetch(`/apisup/supply/warehouse-receipts/${encodeURIComponent(receiptId.value)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status_id: postedIncomingStatusId,
          date_arrival: receiptDate,
        }),
      })
      if (!statusRes.ok) throw new Error('receipt status patch failed')

      receiptStatusId.value = postedIncomingStatusId
      receiptStatusName.value = 'Проведен'
      form.value.date = receiptDate
      await loadWarehouseStock()
    } catch (error) {
      receiptError.value = error instanceof Error && error.message
        ? error.message
        : 'Не удалось провести возвратную накладную.'
    } finally {
      postingReceipt.value = false
    }
  })()
}

const postInventoryReceipt = () => {
  if (!isInventory.value || !receiptId.value || postingReceipt.value) return
  ;(async () => {
    postingReceipt.value = true
    receiptError.value = ''
    try {
      const warehouseRes = await fetch(`/apisup/supply/warehouses/${encodeURIComponent(warehouseId.value)}/list`, {
        credentials: 'include',
      })
      if (!warehouseRes.ok) throw new Error('warehouse list failed')
      const warehousePayload = await warehouseRes.json()
      const stockItems = Array.isArray(warehousePayload)
        ? warehousePayload
        : (Array.isArray(warehousePayload?.items) ? warehousePayload.items : [])

      const actualRows = rows.value.filter((row) => row.itemId && row.nomenclatureId)
      if (!actualRows.length) {
        receiptError.value = 'В накладной инвентаризации нет позиций для проведения.'
        return
      }

      const receiptDate = form.value.date || new Date().toISOString().slice(0, 10)
      const groupedRows = new Map()
      actualRows.forEach((row) => {
        const nomenclatureId = String(row.nomenclatureId || '')
        if (!nomenclatureId) return
        const qty = Number(String(row.qty || '').replace(',', '.'))
        const price = Number(String(row.price || '').replace(',', '.'))
        const prev = groupedRows.get(nomenclatureId)
        groupedRows.set(nomenclatureId, {
          nomenclatureId,
          quantity: (prev?.quantity || 0) + (Number.isFinite(qty) ? qty : 0),
          price: Number.isFinite(price) ? price : (prev?.price || 0),
        })
      })

      for (const [nomenclatureId, grouped] of groupedRows.entries()) {
        const matchingStockRows = stockItems.filter((item) => String(item?.nomenclature_id || '') === nomenclatureId)
        for (const stockRow of matchingStockRows) {
          const stockRowId = getWarehouseListRowId(stockRow)
          if (!stockRowId) continue
          const deleteRes = await fetch(
            `/apisup/supply/warehouses/${encodeURIComponent(warehouseId.value)}/list/${encodeURIComponent(stockRowId)}`,
            {
              method: 'DELETE',
              credentials: 'include',
            }
          )
          if (!deleteRes.ok) throw new Error('warehouse row delete failed')
        }

        if (grouped.quantity > 0) {
          const createRes = await fetch(`/apisup/supply/warehouses/${encodeURIComponent(warehouseId.value)}/list`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              nomenclature_id: grouped.nomenclatureId,
              quantity: grouped.quantity,
              price: grouped.price,
              date: receiptDate,
              object_id: null,
            }),
          })
          if (!createRes.ok) throw new Error('warehouse row create failed')
        }
      }

      const receiptLogRes = await fetch(
        `/apisup/supply/warehouse-receipts/${encodeURIComponent(receiptId.value)}/logs`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ warehouse_id: warehouseId.value }),
        }
      )
      if (!receiptLogRes.ok) throw new Error('receipt log create failed')

      for (const row of actualRows) {
        const itemLogRes = await fetch(
          `/apisup/supply/warehouse-receipts/${encodeURIComponent(receiptId.value)}/items/${encodeURIComponent(row.itemId)}/logs`,
          {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ warehouse_id: warehouseId.value }),
          }
        )
        if (!itemLogRes.ok) throw new Error('receipt item log create failed')
      }

      const statusRes = await fetch(`/apisup/supply/warehouse-receipts/${encodeURIComponent(receiptId.value)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status_id: postedIncomingStatusId,
          date_arrival: receiptDate,
        }),
      })
      if (!statusRes.ok) throw new Error('receipt status patch failed')

      receiptStatusId.value = postedIncomingStatusId
      receiptStatusName.value = 'Проведен'
      form.value.date = receiptDate
      await loadWarehouseStock()
      await loadReceipt(receiptId.value)
    } catch (error) {
      receiptError.value = error instanceof Error && error.message
        ? error.message
        : 'Не удалось провести накладную инвентаризации.'
    } finally {
      postingReceipt.value = false
    }
  })()
}

const unpostInventoryReceipt = () => {
  if (!isInventory.value || !receiptId.value || unpostingReceipt.value) return
  ;(async () => {
    unpostingReceipt.value = true
    receiptError.value = ''
    try {
      const res = await fetch(`/apisup/supply/warehouse-receipts/${encodeURIComponent(receiptId.value)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status_id: incomingStatusId }),
      })
      if (!res.ok) throw new Error('receipt unpost failed')

      receiptStatusId.value = incomingStatusId
      receiptStatusName.value = 'Черновик'
      await loadWarehouseStock()
      await loadReceipt(receiptId.value)
    } catch (error) {
      receiptError.value = error instanceof Error && error.message
        ? error.message
        : 'Не удалось распровести накладную.'
    } finally {
      unpostingReceipt.value = false
    }
  })()
}

const loadReceipt = async (id) => {
  if (!id) return
  receiptLoading.value = true
  receiptError.value = ''
  try {
    const res = await fetch(`/apisup/supply/warehouse-receipts/${encodeURIComponent(id)}`, {
      credentials: 'include',
    })
    if (!res.ok) throw new Error('receipt load failed')
    const data = await res.json()
    receiptId.value = String(data?.id || id)
    receiptNum.value = String(data?.num || '')
    receiptStatusId.value = String(data?.status_id || '')
    receiptStatusName.value = String(data?.status_name || '')
    form.value.fromId = String(data?.from || '')
    form.value.from = String(data?.from_name || findCounterpartyLabel(form.value.fromId) || data?.from || '')
    form.value.toId = String(data?.to || '')
    form.value.to = String(data?.to_name || findCounterpartyLabel(form.value.toId) || data?.to || '')
    form.value.whoWriteOffId = String(data?.who_write_off || '')
    form.value.whoWriteOff = String(data?.who_write_off_name || findCounterpartyLabel(form.value.whoWriteOffId) || data?.who_write_off || '')
    form.value.areaName = String(data?.area_name || '')
    form.value.document = String(data?.document || '')
    form.value.object = String(data?.object_name || '')
    form.value.objectId = String(data?.object_id || '')
    form.value.toll = Boolean(data?.toll)
    form.value.tollCompanyId = String(data?.toll_company_id || '')
    form.value.tollCompanyName = String(data?.toll_company_name || findCounterpartyLabel(form.value.tollCompanyId) || '')
    if (isReturn.value) {
      form.value.object = ''
      form.value.objectId = ''
      form.value.areaName = ''
      form.value.document = ''
    }
    form.value.date = String(data?.date_arrival || '').slice(0, 10)
    const items = Array.isArray(data?.items) ? data.items : []
    rows.value = items.map((item, idx) => ({
      id: idx + 1,
      name: String(item?.nomenclature_name || ''),
      unit: String(item?.unit_name || ''),
      qty: item?.quantity != null ? String(item.quantity) : '',
      comment: String(item?.comment || ''),
      price: normalizeMoney(item?.price),
      priceOpt: normalizeMoney(item?.price_opt),
      nomenclatureId: String(item?.nomenclature_id || ''),
      itemId: String(item?.id || ''),
      rowId: '',
    }))
    ensureTrailingRow()
    await loadAttachments()
    await loadWarehouseStock()
  } catch {
    receiptError.value = 'Не удалось загрузить приходную накладную.'
  } finally {
    receiptLoading.value = false
  }
}

const createIncomingReceipt = async () => {
  if (!warehouseId.value || receiptCreating.value) return
  receiptCreating.value = true
  receiptError.value = ''
  try {
    const resList = await fetch('/apisup/supply/warehouse-receipts', { credentials: 'include' })
    let nextNum = 1
    if (resList.ok) {
      const payload = await resList.json()
      const list = Array.isArray(payload) ? payload : (payload?.items || [])
      const currentNums = list
        .filter((item) => String(item?.warehouse_id || '') === String(warehouseId.value || ''))
        .map((item) => Number(item?.num || 0))
        .filter((value) => Number.isFinite(value))
      const maxNum = currentNums.length ? Math.max(...currentNums) : 0
      nextNum = maxNum + 1
    }

    const res = await fetch('/apisup/supply/warehouse-receipts', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        num: nextNum,
        warehouse_id: warehouseId.value,
        status_id: incomingStatusId,
      }),
    })
    if (!res.ok) throw new Error('create receipt failed')
    const created = await res.json()
    receiptId.value = String(created?.id || '')
    receiptNum.value = String(created?.num || nextNum)
    receiptStatusId.value = String(created?.status_id || incomingStatusId)
    receiptStatusName.value = String(created?.status_name || 'Черновик')
    await loadAttachments()
    await loadWarehouseStock()
  } catch {
    receiptError.value = 'Не удалось создать приходную накладную.'
  } finally {
    receiptCreating.value = false
  }
}

const createOutgoingReceipt = async () => {
  if (!warehouseId.value || receiptCreating.value) return
  receiptCreating.value = true
  receiptError.value = ''
  try {
    const resList = await fetch('/apisup/supply/warehouse-receipts/outgoing', { credentials: 'include' })
    let nextNum = 1
    if (resList.ok) {
      const payload = await resList.json()
      const list = Array.isArray(payload) ? payload : (payload?.items || [])
      const currentNums = list
        .filter((item) => String(item?.warehouse_id || '') === String(warehouseId.value || ''))
        .map((item) => Number(item?.num || 0))
        .filter((value) => Number.isFinite(value))
      const maxNum = currentNums.length ? Math.max(...currentNums) : 0
      nextNum = maxNum + 1
    }

    const res = await fetch('/apisup/supply/warehouse-receipts/outgoing', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        num: nextNum,
        type: outgoingTypeId,
        warehouse_id: warehouseId.value,
        who_write_off: form.value.whoWriteOffId || null,
        status_id: incomingStatusId,
      }),
    })
    if (!res.ok) throw new Error('create outgoing receipt failed')
    const created = await res.json()
    receiptId.value = String(created?.id || '')
    receiptNum.value = String(created?.num || nextNum)
    receiptStatusId.value = String(created?.status_id || incomingStatusId)
    receiptStatusName.value = String(created?.status_name || 'Черновик')
    await loadAttachments()
    await loadWarehouseStock()
  } catch {
    receiptError.value = 'Не удалось создать расходную накладную.'
  } finally {
    receiptCreating.value = false
  }
}

const createReturnReceipt = async () => {
  if (!warehouseId.value || receiptCreating.value) return
  receiptCreating.value = true
  receiptError.value = ''
  try {
    const resList = await fetch('/apisup/supply/warehouse-receipts/returns', { credentials: 'include' })
    let nextNum = 1
    if (resList.ok) {
      const payload = await resList.json()
      const list = Array.isArray(payload) ? payload : (payload?.items || [])
      const currentNums = list
        .filter((item) => String(item?.warehouse_id || '') === String(warehouseId.value || ''))
        .map((item) => Number(item?.num || 0))
        .filter((value) => Number.isFinite(value))
      const maxNum = currentNums.length ? Math.max(...currentNums) : 0
      nextNum = maxNum + 1
    }

    const res = await fetch('/apisup/supply/warehouse-receipts/returns', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        num: nextNum,
        type: returnTypeId,
        warehouse_id: warehouseId.value,
        status_id: incomingStatusId,
      }),
    })
    if (!res.ok) throw new Error('create return receipt failed')
    const created = await res.json()
    receiptId.value = String(created?.id || '')
    receiptNum.value = String(created?.num || nextNum)
    receiptStatusId.value = String(created?.status_id || incomingStatusId)
    receiptStatusName.value = String(created?.status_name || 'Черновик')
    await loadAttachments()
    await loadWarehouseStock()
  } catch {
    receiptError.value = 'Не удалось создать возвратную накладную.'
  } finally {
    receiptCreating.value = false
  }
}

const createInventoryReceipt = async () => {
  if (!warehouseId.value || receiptCreating.value) return
  receiptCreating.value = true
  receiptError.value = ''
  try {
    const resList = await fetch('/apisup/supply/warehouse-receipts/inventory', { credentials: 'include' })
    let nextNum = 1
    if (resList.ok) {
      const payload = await resList.json()
      const list = Array.isArray(payload) ? payload : (payload?.items || [])
      const currentNums = list
        .filter((item) => String(item?.warehouse_id || '') === String(warehouseId.value || ''))
        .map((item) => Number(item?.num || 0))
        .filter((value) => Number.isFinite(value))
      const maxNum = currentNums.length ? Math.max(...currentNums) : 0
      nextNum = maxNum + 1
    }

    const res = await fetch('/apisup/supply/warehouse-receipts/inventory', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        num: nextNum,
        type: inventoryTypeId,
        warehouse_id: warehouseId.value,
        status_id: incomingStatusId,
      }),
    })
    if (!res.ok) throw new Error('create inventory receipt failed')
    const created = await res.json()
    receiptId.value = String(created?.id || '')
    receiptNum.value = String(created?.num || nextNum)
    receiptStatusId.value = String(created?.status_id || incomingStatusId)
    receiptStatusName.value = String(created?.status_name || 'Черновик')
    await loadAttachments()
    await loadWarehouseStock()
  } catch {
    receiptError.value = 'Не удалось создать накладную инвентаризации.'
  } finally {
    receiptCreating.value = false
  }
}

const createReceiptItem = async (row) => {
  if (!receiptId.value || !row.nomenclatureId || isReceiptLocked.value) return
  try {
    const res = await fetch(`/apisup/supply/warehouse-receipts/${encodeURIComponent(receiptId.value)}/items`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nomenclature_id: row.nomenclatureId,
        quantity: Number(row.qty || 1) || 1,
      }),
    })
    if (!res.ok) throw new Error('item create failed')
    const created = await res.json()
    row.itemId = String(created?.id || row.itemId || '')
    if (isInventory.value && !String(row.price || '').trim()) {
      row.price = normalizeMoney(created?.inventory_last_price ?? created?.price)
    }
    if ((!isIncoming.value || isInventory.value) && !isReturn.value && row.itemId) {
      await patchReceiptItem(row.itemId, row)
    }
  } catch {
    // noop
  }
}

const patchReceiptItemQty = async (row) => {
  if (!receiptId.value || !row.itemId || isReceiptLocked.value) return
  const qty = Number(String(row.qty || '').replace(',', '.'))
  if (!Number.isFinite(qty)) return
  await patchReceiptItem(row.itemId, row, { quantity: qty })
}


const onQtyInput = (row) => {
  if (isReceiptLocked.value) return
  clearInsufficientRow(row.id)
}

const patchReceiptItemPrice = async (row) => {
  if (!receiptId.value || !row.itemId || isReceiptLocked.value) return
  await patchReceiptItem(row.itemId, row, {
    price: Number(String(row.price || '').replace(',', '.')) || 0,
  })
}

const deleteReceiptItem = async (itemId) => {
  if (!receiptId.value || !itemId || isReceiptLocked.value) return
  try {
    await fetch(
      `/apisup/supply/warehouse-receipts/${encodeURIComponent(receiptId.value)}/items/${encodeURIComponent(itemId)}`,
      {
        method: 'DELETE',
        credentials: 'include',
      }
    )
  } catch {
    // noop
  }
}

const openRowContextMenu = (event, row) => {
  if (isReceiptLocked.value) return
  event.preventDefault()
  rowContextMenu.value = {
    open: true,
    x: event.clientX,
    y: event.clientY,
    rowId: row.id,
  }
}

const requestDeleteRow = () => {
  deleteTargetRowId.value = rowContextMenu.value.rowId
  rowContextMenu.value.open = false
  confirmDeleteOpen.value = true
}

const confirmDeleteRow = async () => {
  const row = findRowById(deleteTargetRowId.value)
  if (row?.itemId) await deleteReceiptItem(row.itemId)
  if (row) {
    row.name = ''
    row.unit = ''
    row.qty = ''
    row.comment = ''
    row.price = ''
    row.priceOpt = ''
    row.nomenclatureId = ''
    row.itemId = ''
  }
  confirmDeleteOpen.value = false
  deleteTargetRowId.value = null
}

onMounted(() => {
  loadUnits()
  loadCategories()
  loadCounterparties()
  loadObjects()
  loadReceiptParties()
  loadWarehouseStock()
  window.addEventListener('mousedown', handleDocumentClick)
  if (!receiptIdParam.value) {
    if (isIncoming.value) createIncomingReceipt()
    else if (isReturn.value) createReturnReceipt()
    else if (isInventory.value) createInventoryReceipt()
    else createOutgoingReceipt()
  }
  if (receiptIdParam.value) loadReceipt(receiptIdParam.value)
})

onBeforeUnmount(() => {
  window.removeEventListener('mousedown', handleDocumentClick)
  clearSuggestionTimer()
  if (receiptPatchTimer) window.clearTimeout(receiptPatchTimer)
  commentPatchTimers.forEach((timer) => window.clearTimeout(timer))
  commentPatchTimers.clear()
})

watch(receiptIdParam, (value) => {
  if (value) loadReceipt(value)
})
</script>

<template>
  <div class="page">
    <TopNav :links="navLinks" />

    <main class="main-content">
      <header class="page-head">
        <button type="button" class="back-btn" @click="goBack">
          <i class="fas fa-arrow-left"></i>
          Назад
        </button>
        <h1 class="page-title">{{ title }}</h1>
      </header>

      <section class="form-card">
        <div class="form-grid">
          <label class="field">
            <span>{{ dateLabel }}</span>
            <input :value="form.date" :disabled="isReceiptLocked" type="date" class="field-input" @input="(e) => onArrivalDateChange(e.target.value)">
          </label>

          <label v-if="isIncoming" class="field lookup-field">
            <span>{{ fromLabel }}</span>
              <input
                :value="form.from"
              type="text"
              class="field-input"
              :disabled="isReceiptLocked"
              :placeholder="fromLabel"
              @focus="isFromDropdownOpen = true"
              @input="(e) => onFromInput(e.target.value)"
            >
            <div v-if="isFromDropdownOpen && !isReceiptLocked" class="lookup-list">
              <template v-if="isIncoming">
                <button type="button" class="lookup-create" @mousedown.prevent @click="openCreateCounterparty">
                  + Создать контрагента
                </button>
                <div v-if="counterpartiesLoading" class="lookup-empty">Загрузка...</div>
                <div v-else-if="counterpartiesError" class="lookup-empty error">{{ counterpartiesError }}</div>
                <button
                  v-for="item in filteredCounterparties"
                  :key="item.id"
                  type="button"
                  class="lookup-item"
                  @mousedown.prevent
                  @click="selectFromCounterparty(item)"
                >
                  <span class="lookup-title">{{ item.short_name || item.full_name }}</span>
                  <span v-if="item.full_name && item.full_name !== item.short_name" class="lookup-meta">{{ item.full_name }}</span>
                </button>
              </template>
              <template v-else>
                <button type="button" class="lookup-create" @mousedown.prevent @click="openCreateCounterparty">
                  + Создать контрагента
                </button>
                <div v-if="counterpartiesLoading" class="lookup-empty">Загрузка...</div>
                <div v-else-if="counterpartiesError" class="lookup-empty error">{{ counterpartiesError }}</div>
                <button
                  v-for="item in filteredCounterparties"
                  :key="item.id"
                  type="button"
                  class="lookup-item"
                  @mousedown.prevent
                  @click="selectFromCounterparty(item)"
                >
                  <span class="lookup-title">{{ item.short_name || item.full_name }}</span>
                  <span v-if="item.full_name && item.full_name !== item.short_name" class="lookup-meta">{{ item.full_name }}</span>
                </button>
              </template>
            </div>
          </label>

          <label v-if="!isInventory" class="field">
            <span>{{ toLabel }}</span>
            <div class="lookup-field">
              <input :value="form.to" :disabled="isReceiptLocked" type="text" class="field-input" :placeholder="toLabel" @focus="isToDropdownOpen = true" @input="(e) => onToInput(e.target.value)">
              <div v-if="isToDropdownOpen && !isReceiptLocked" class="lookup-list">
                <template v-if="isReturn">
                  <div v-if="receiptPartiesLoading" class="lookup-empty">Загрузка...</div>
                  <div v-else-if="receiptPartiesError" class="lookup-empty error">{{ receiptPartiesError }}</div>
                  <button
                    v-for="item in filteredReceiptParties"
                    :key="item.value"
                    type="button"
                    class="lookup-item"
                    @mousedown.prevent
                    @click="selectReceiptParty(item.value)"
                  >
                    <span class="lookup-title">{{ item.value }}</span>
                  </button>
                </template>
                <template v-else>
                  <button type="button" class="lookup-create" @mousedown.prevent @click="openCreateCounterparty">
                    + Создать контрагента
                  </button>
                  <div v-if="counterpartiesLoading" class="lookup-empty">Загрузка...</div>
                  <div v-else-if="counterpartiesError" class="lookup-empty error">{{ counterpartiesError }}</div>
                  <button
                    v-for="item in filteredToCounterparties"
                    :key="item.id"
                    type="button"
                    class="lookup-item"
                    @mousedown.prevent
                    @click="selectToCounterparty(item)"
                  >
                    <span class="lookup-title">{{ item.short_name || item.full_name }}</span>
                    <span v-if="item.full_name && item.full_name !== item.short_name" class="lookup-meta">{{ item.full_name }}</span>
                  </button>
                </template>
              </div>
            </div>
          </label>

          <label v-if="!isIncoming && !isReturn && !isInventory" class="field">
            <span>На кого списывать</span>
            <div class="lookup-field">
              <input
                :value="form.whoWriteOff"
                :disabled="isReceiptLocked"
                type="text"
                class="field-input"
                placeholder="На кого списывать"
                @focus="isWhoWriteOffDropdownOpen = true"
                @input="(e) => onWhoWriteOffInput(e.target.value)"
              >
              <div v-if="isWhoWriteOffDropdownOpen && !isReceiptLocked" class="lookup-list">
                <button type="button" class="lookup-create" @mousedown.prevent @click="openCreateCounterparty">
                  + Создать контрагента
                </button>
                <div v-if="counterpartiesLoading" class="lookup-empty">Загрузка...</div>
                <div v-else-if="counterpartiesError" class="lookup-empty error">{{ counterpartiesError }}</div>
                <button
                  v-for="item in filteredWhoWriteOffCounterparties"
                  :key="item.id"
                  type="button"
                  class="lookup-item"
                  @mousedown.prevent
                  @click="selectWhoWriteOffCounterparty(item)"
                >
                  <span class="lookup-title">{{ item.short_name || item.full_name }}</span>
                  <span v-if="item.full_name && item.full_name !== item.short_name" class="lookup-meta">{{ item.full_name }}</span>
                </button>
              </div>
            </div>
          </label>

          <label v-if="!isReturn && !isInventory" class="field">
            <span>Объект строительства</span>
            <div class="lookup-field">
              <input
                :value="form.object"
                type="text"
                class="field-input"
                :disabled="isReceiptLocked"
                placeholder="Название объекта строительства"
                @focus="isObjectDropdownOpen = true"
                @input="(e) => onObjectInput(e.target.value)"
              >
              <div v-if="isObjectDropdownOpen && !isReceiptLocked" class="lookup-list">
                <button type="button" class="lookup-create" @mousedown.prevent @click="openCreateObjectModal">
                  + Создать объект
                </button>
                <div v-if="objectsLoading" class="lookup-empty">Загрузка...</div>
                <div v-else-if="objectsError" class="lookup-empty error">{{ objectsError }}</div>
                <button
                  v-for="item in filteredObjects"
                  :key="item.id"
                  type="button"
                  class="lookup-item"
                  @mousedown.prevent
                  @click="selectObject(item)"
                >
                  <span class="lookup-title">{{ item.short_name || item.full_name }}</span>
                  <span v-if="item.full_name && item.full_name !== item.short_name" class="lookup-meta">{{ item.full_name }}</span>
                </button>
              </div>
            </div>
          </label>

          <label v-if="isIncoming" class="field">
            <span>Давальческое сырьё</span>
            <select
              class="field-input"
              :value="form.toll ? 'yes' : 'no'"
              :disabled="isReceiptLocked"
              @change="(e) => onTollChange(e.target.value === 'yes')"
            >
              <option value="no">Нет</option>
              <option value="yes">Да</option>
            </select>
          </label>

          <label v-if="isIncoming && form.toll" class="field">
            <span>Компания, предоставившая сырьё</span>
            <div class="lookup-field">
              <input
                :value="form.tollCompanyName"
                type="text"
                class="field-input"
                :disabled="isReceiptLocked"
                placeholder="Выберите компанию"
                required
                @focus="isTollCompanyDropdownOpen = true"
                @input="(e) => onTollCompanyInput(e.target.value)"
              >
              <div v-if="isTollCompanyDropdownOpen && !isReceiptLocked" class="lookup-list">
                <button type="button" class="lookup-create" @mousedown.prevent @click="openCreateCounterparty">
                  + Создать контрагента
                </button>
                <div v-if="counterpartiesLoading" class="lookup-empty">Загрузка...</div>
                <div v-else-if="counterpartiesError" class="lookup-empty error">{{ counterpartiesError }}</div>
                <button
                  v-for="item in filteredTollCompanies"
                  :key="item.id"
                  type="button"
                  class="lookup-item"
                  @mousedown.prevent
                  @click="selectTollCompany(item)"
                >
                  <span class="lookup-title">{{ item.short_name || item.full_name }}</span>
                  <span v-if="item.full_name && item.full_name !== item.short_name" class="lookup-meta">{{ item.full_name }}</span>
                </button>
              </div>
            </div>
          </label>

          <label v-if="!isIncoming && !isReturn && !isInventory" class="field">
            <span>Участок</span>
            <input
              :value="form.areaName"
              :disabled="isReceiptLocked"
              type="text"
              class="field-input"
              placeholder="Участок"
              @input="(e) => onAreaNameInput(e.target.value)"
            >
          </label>

          <label v-if="!isIncoming && !isReturn && !isInventory" class="field">
            <span>Основание</span>
            <input
              :value="form.document"
              :disabled="isReceiptLocked"
              type="text"
              class="field-input"
              placeholder="Основание"
              @input="(e) => onDocumentInput(e.target.value)"
            >
          </label>

          <label class="field">
            <span>Файл</span>
            <label class="file-trigger">
              <input type="file" multiple class="file-input" @change="onAttachmentInput">
              <i class="fas fa-paperclip"></i>
              {{ attachmentsUploading ? 'Загрузка...' : 'Прикрепить файлы' }}
            </label>
            <div class="file-name">{{ fileName }}</div>
            <div class="attachment-list">
              <div v-if="attachmentsLoading" class="lookup-empty">Загрузка файлов...</div>
              <div v-else-if="attachmentsError" class="lookup-empty error">{{ attachmentsError }}</div>
              <div v-else-if="!attachments.length" class="lookup-empty">Файлы не прикреплены</div>
              <div v-for="item in attachments" :key="item.id" class="attachment-item">
                <button type="button" class="attachment-link" @click="downloadAttachment(item.id)">
                  {{ item.original_name || item.name || `Файл ${item.id}` }}
                </button>
                <button v-if="!isReceiptLocked" type="button" class="attachment-delete" @click="deleteAttachment(item.id)">
                  <i class="fas fa-trash"></i>
                </button>
              </div>
            </div>
          </label>
        </div>
      </section>

      <div v-if="receiptError" class="form-error-banner">{{ receiptError }}</div>

      <section class="table-wrapper">
        <table class="table">
          <thead>
            <tr>
              <th>Наименование</th>
              <th>Ед. изм.</th>
              <th>Кол-во</th>
              <th v-if="showInventoryColumns">Кол-во на складе</th>
              <th v-if="showInventoryColumns">Цена</th>
              <th v-if="showOutgoingPricing">Цена закупа</th>
              <th v-if="showOutgoingPricing">Цена опт</th>
              <th>Комментарий</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in displayedRows"
              :key="row.id"
              :class="{ 'row-duplicate': isInventory && row.nomenclatureId && duplicateNomenclatureIds.has(row.nomenclatureId) }"
              @contextmenu="openRowContextMenu($event, row)"
            >
              <td class="name-cell">
                <input
                  v-model="row.name"
                  type="text"
                  class="cell-input"
                  :disabled="isReceiptLocked"
                  placeholder="Наименование"
                  @input="(e) => onNameInput(row, e.target.value)"
                >
                <div v-if="activeRowId === row.id && !isReceiptLocked" class="name-dropdown">
                  <div v-if="suggestionsLoading" class="dropdown-empty">Загрузка...</div>
                  <div v-else-if="suggestionsError" class="dropdown-empty error">{{ suggestionsError }}</div>
                  <button
                    v-for="item in suggestions"
                    :key="item.id"
                    type="button"
                    class="dropdown-item"
                    @mousedown.prevent
                    @click="selectSuggestion(row, item)"
                  >
                    <span class="dropdown-title">{{ item.name }}</span>
                    <span class="dropdown-meta">{{ item.unit?.name || '—' }}</span>
                  </button>
                  <button type="button" class="dropdown-create" @mousedown.prevent @click="openCreateModal(row)">
                    + Создать номенклатуру
                  </button>
                </div>
              </td>
              <td>
                <input v-model="row.unit" :disabled="isReceiptLocked" type="text" class="cell-input" placeholder="Ед. изм." @input="ensureTrailingRow">
              </td>
              <td>
                <input
                  v-model="row.qty"
                  type="text"
                  :disabled="isReceiptLocked"
                  class="cell-input"
                  :class="{ 'cell-input-error': insufficientRowIds.includes(row.id) }"
                  placeholder="0"
                  @input="() => { onQtyInput(row); ensureTrailingRow() }"
                  @blur="patchReceiptItemQty(row)"
                >
              </td>
              <td v-if="showInventoryColumns" class="price-cell">{{ formatMoney(getInventoryStockQuantity(row)) }}</td>
              <td v-if="showInventoryColumns">
                <input
                  v-model="row.price"
                  type="text"
                  :disabled="isReceiptLocked"
                  class="cell-input"
                  placeholder="0"
                  @input="ensureTrailingRow"
                  @blur="patchReceiptItemPrice(row)"
                >
              </td>
              <td v-if="showOutgoingPricing" class="price-cell">{{ formatMoney(row.price) }}</td>
              <td v-if="showOutgoingPricing" class="price-cell">{{ formatMoney(row.priceOpt) }}</td>
              <td>
                <input
                  v-model="row.comment"
                  type="text"
                  :disabled="isReceiptLocked"
                  class="cell-input"
                  placeholder="Комментарий"
                  @input="() => { ensureTrailingRow(); queuePatchReceiptItemComment(row) }"
                >
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section v-if="showOutgoingPricing" class="totals-card">
        <div class="totals-row"><span>Итого по цене закупа</span><strong>{{ formatMoney(outgoingTotals.purchase) }}</strong></div>
        <div class="totals-row"><span>Итого по цене опт</span><strong>{{ formatMoney(outgoingTotals.opt) }}</strong></div>
        <div class="totals-row totals-profit"><span>Прибыль</span><strong>{{ formatMoney(outgoingTotals.profit) }}</strong></div>
      </section>

      <footer class="actions">
        <button
          v-if="!isReceiptLocked"
          type="button"
          class="btn btn-primary"
          :disabled="postingReceipt"
          @click="isIncoming ? onPost() : isReturn ? postReturnReceipt() : isInventory ? postInventoryReceipt() : postOutgoingReceipt()"
        >
          {{ postingReceipt ? 'Проведение...' : 'Провести' }}
        </button>
        <button
          v-if="isInventory && isReceiptLocked"
          type="button"
          class="btn btn-danger"
          :disabled="unpostingReceipt"
          @click="unpostInventoryReceipt"
        >
          {{ unpostingReceipt ? 'Распроведение...' : 'Распровести' }}
        </button>
        <button type="button" class="btn" @click="onPrint">Распечатать</button>
      </footer>
    </main>

    <div v-if="createModalOpen" class="modal-backdrop" @click.self="closeCreateModal">
      <div class="modal-card">
        <div class="modal-head">
          <h3>Создать номенклатуру</h3>
          <button type="button" class="modal-close" @click="closeCreateModal">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body">
          <label class="field">
            <span>Название</span>
            <input v-model="createForm.name" type="text" class="field-input">
          </label>
          <label class="field">
            <span>Ед. изм.</span>
            <select v-model="createForm.unit_id" class="field-input">
              <option value="">Выберите ед. изм.</option>
              <option v-for="item in units" :key="item.id" :value="item.id">{{ item.name }}</option>
            </select>
          </label>
          <label class="field">
            <span>Товарная категория</span>
            <button type="button" class="field-input picker-trigger" @click="categoryPickerOpen = true">
              {{ selectedCategoryLabel || 'Выберите категорию' }}
            </button>
          </label>
          <div v-if="createError" class="modal-error">{{ createError }}</div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-primary" :disabled="createSaving" @click="saveCreatedNomenclature">
            {{ createSaving ? 'Создание...' : 'Создать' }}
          </button>
          <button type="button" class="btn" @click="closeCreateModal">Отмена</button>
        </div>
      </div>
    </div>

    <CategoryTreePickerModal
      :open="categoryPickerOpen"
      title="Выбор товарной категории"
      :categories="categoryOptions"
      :selected-id="createForm.warehouse_category_id"
      :allow-none="false"
      @close="categoryPickerOpen = false"
      @select="(id) => { createForm.warehouse_category_id = id }"
    />

    <div v-if="createObjectModalOpen" class="modal-backdrop" @click.self="closeCreateObjectModal">
      <div class="modal-card">
        <div class="modal-head">
          <h3>Создать объект</h3>
          <button type="button" class="modal-close" @click="closeCreateObjectModal">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body">
          <label class="field">
            <span>Короткое наименование объекта</span>
            <input v-model="createObjectShortName" type="text" class="field-input">
          </label>
          <div v-if="createObjectError" class="modal-error">{{ createObjectError }}</div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-primary" :disabled="createObjectSaving" @click="saveCreatedObject">
            {{ createObjectSaving ? 'Создание...' : 'Создать' }}
          </button>
          <button type="button" class="btn" @click="closeCreateObjectModal">Отмена</button>
        </div>
      </div>
    </div>

    <div
      v-if="rowContextMenu.open"
      class="row-context-menu"
      :style="{ left: `${rowContextMenu.x}px`, top: `${rowContextMenu.y}px` }"
    >
      <button type="button" class="row-context-item" @click="requestDeleteRow">Удалить</button>
    </div>

    <div v-if="confirmDeleteOpen" class="modal-backdrop" @click.self="confirmDeleteOpen = false">
      <div class="modal-card">
        <div class="modal-head">
          <h3>Удалить позицию?</h3>
          <button type="button" class="modal-close" @click="confirmDeleteOpen = false">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body">
          Подтвердите удаление выбранной позиции из накладной.
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-danger" @click="confirmDeleteRow">Удалить</button>
          <button type="button" class="btn" @click="confirmDeleteOpen = false">Отмена</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.main-content {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.page-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.back-btn {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  padding: 7px 10px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.back-btn:hover {
  border-color: var(--brand-primary);
  color: var(--brand-primary);
}

.page-title {
  margin: 0;
  font-size: 24px;
  color: var(--text-primary);
}

.form-card {
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: var(--bg-surface);
  padding: 12px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.field-input {
  width: 100%;
  min-height: 36px;
  border-radius: 8px;
  border: 1px solid var(--border-light);
  background: var(--bg-subtle);
  color: var(--text-primary);
  padding: 0 10px;
}

.file-input {
  display: none;
}

.file-trigger {
  min-height: 36px;
  border-radius: 8px;
  border: 1px dashed var(--border-light);
  background: var(--bg-subtle);
  color: var(--text-secondary);
  padding: 0 12px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.file-name {
  font-size: 12px;
  color: var(--text-tertiary);
}

.form-error-banner {
  border: 1px solid #fecaca;
  background: #fef2f2;
  color: #b91c1c;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 13px;
}

.attachment-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 6px;
}

.attachment-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--bg-subtle);
  padding: 6px 8px;
}

.attachment-link {
  border: none;
  background: transparent;
  color: var(--brand-primary);
  text-align: left;
  cursor: pointer;
  padding: 0;
}

.attachment-delete {
  border: none;
  background: transparent;
  color: var(--danger-text);
  cursor: pointer;
}

.lookup-field {
  position: relative;
}

.lookup-list {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 3200;
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: 10px;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.15);
  padding: 6px;
  max-height: 280px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.lookup-create,
.lookup-item {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--bg-surface);
  padding: 6px 8px;
  text-align: left;
  cursor: pointer;
}

.lookup-create {
  border-style: dashed;
  background: var(--bg-subtle);
  color: var(--text-secondary);
}

.lookup-title {
  display: block;
  font-size: 13px;
  color: var(--text-primary);
}

.lookup-meta {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
}

.lookup-empty {
  font-size: 12px;
  color: var(--text-secondary);
  padding: 6px 8px;
}

.lookup-empty.error {
  color: var(--danger-text);
}

.table-wrapper {
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: 12px;
  overflow: visible;
}

.table {
  width: 100%;
  border-collapse: collapse;
  min-width: 760px;
}

.table th,
.table td {
  border-bottom: 1px solid var(--border-light);
  padding: 10px;
  text-align: left;
  vertical-align: top;
}

.table th {
  background: var(--bg-subtle);
  color: var(--text-secondary);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.cell-input-error {
  background: #fef2f2;
  box-shadow: inset 0 0 0 1px #fca5a5;
}

.row-duplicate td {
  background: #fef2f2 !important;
}

.table tr:last-child td {
  border-bottom: none;
}

.price-cell {
  white-space: nowrap;
}

.totals-card {
  align-self: flex-end;
  min-width: 320px;
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: var(--bg-surface);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.totals-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  color: var(--text-primary);
}

.totals-profit strong {
  color: #166534;
}

.cell-input {
  width: 100%;
  min-height: 34px;
  border-radius: 0;
  border: none;
  background: transparent;
  color: var(--text-primary);
  padding: 0 10px;
}

.name-cell {
  position: relative;
}

.name-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 3000;
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: 10px;
  width: min(420px, 90vw);
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.15);
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dropdown-item {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--bg-surface);
  text-align: left;
  padding: 6px 8px;
  cursor: pointer;
}

.dropdown-title {
  display: block;
  font-size: 13px;
  color: var(--text-primary);
}

.dropdown-meta {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
}

.dropdown-create {
  border: 1px dashed var(--border-light);
  border-radius: 8px;
  background: var(--bg-subtle);
  color: var(--text-secondary);
  padding: 6px 8px;
  text-align: left;
  cursor: pointer;
}

.dropdown-empty {
  font-size: 12px;
  color: var(--text-secondary);
  padding: 6px 8px;
}

.dropdown-empty.error {
  color: var(--danger-text);
}

.row-context-menu {
  position: fixed;
  z-index: 3100;
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: 10px;
  padding: 6px;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.15);
}

.row-context-item {
  border: none;
  background: transparent;
  padding: 6px 10px;
  cursor: pointer;
  color: var(--text-primary);
  text-align: left;
  width: 100%;
}

.row-context-item:hover {
  background: var(--bg-subtle);
  border-radius: 6px;
}

.btn-danger {
  border-color: #ef4444;
  background: #fef2f2;
  color: #b91c1c;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 4000;
  padding: 18px;
}

.modal-card {
  width: min(520px, 100%);
  border-radius: 12px;
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  box-shadow: 0 20px 40px rgba(15, 23, 42, 0.25);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.modal-head h3 {
  margin: 0;
  font-size: 16px;
  color: var(--text-primary);
}

.modal-close {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--bg-surface);
  width: 30px;
  height: 30px;
  cursor: pointer;
}

.modal-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.modal-error {
  font-size: 12px;
  color: var(--danger-text);
}

.modal-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.btn {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  padding: 7px 12px;
  cursor: pointer;
}

.btn-primary {
  border-color: var(--brand-primary);
  background: var(--brand-primary);
  color: #fff;
}

@media (max-width: 900px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
