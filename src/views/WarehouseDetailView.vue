<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TopNav from '../components/layout/TopNav.vue'
import { buildWarehouseCategoryTree } from '../helpers/warehouseCategoryTree'
import { mainNavLinks } from '../constants/mainNav'

const route = useRoute()
const router = useRouter()

const navLinks = mainNavLinks

const warehouseId = computed(() => String(route.params.warehouseId || ''))
const allowedSections = ['stock', 'nomenclature', 'categories', 'incoming', 'outgoing', 'returns', 'inventory', 'deliveries', 'documents']

const tabs = [
  { key: 'stock', label: 'Склад' },
  { key: 'nomenclature', label: 'Номенклатура' },
  { key: 'categories', label: 'Товарная категория' },
  { key: 'incoming', label: 'Приходные накладные' },
  { key: 'outgoing', label: 'Расходные накладные' },
  { key: 'returns', label: 'Возвратные накладные' },
  { key: 'inventory', label: 'Накладные инвентаризации' },
  { key: 'deliveries', label: 'Доставки' },
  { key: 'documents', label: 'Документы' },
]

const loading = ref(false)
const error = ref('')
const warehouseName = ref('Склад')
const warehouseType = ref('')
const hideZeroStock = ref(true)
const nomenclatureMissingPriceOpt1 = ref(false)
const nomenclatureMissingPriceOpt2 = ref(false)
const nomenclatureMissingPriceRetail = ref(false)
const nomenclatureExportOpen = ref(false)
const nomenclatureExportLoading = ref(false)
const filters = ref({
  stockName: '',
  stockObject: '',
  stockCategory: '',
  stockToll: '',
  stockTollCompany: '',
  nomenclatureName: '',
  nomenclatureCategory: '',
  categoryName: '',
  incomingNumber: '',
  incomingCreatedAt: '',
  incomingConductedAt: '',
  incomingCounterparty: '',
  incomingTo: '',
  incomingObject: '',
  incomingStatus: '',
  incomingToll: '',
  incomingTollCompany: '',
  outgoingNumber: '',
  outgoingCreatedAt: '',
  outgoingConductedAt: '',
  outgoingCounterparty: '',
  outgoingWhoWriteOff: '',
  outgoingObject: '',
  outgoingStatus: '',
  returnsNumber: '',
  returnsCreatedAt: '',
  returnsConductedAt: '',
  returnsCounterparty: '',
  returnsStatus: '',
  inventoryNumber: '',
  inventoryCreatedAt: '',
  inventoryConductedAt: '',
  inventoryStatus: '',
  documentsNumber: '',
  documentsPayer: '',
  documentsProvider: '',
  documentsCreator: '',
  documentsCreatedAt: '',
  documentsStatus: '',
})
const activeFilterDropdown = ref('')
const stockRows = ref([])
const nomenclatureRows = ref([])
const categoryRows = ref([])
const incomingRows = ref([])
const outgoingRows = ref([])
const returnRows = ref([])
const inventoryRows = ref([])
const incomingDeliveryRows = ref([])
const outgoingDeliveryRows = ref([])
const documentRows = ref([])
const deliveriesSubtab = ref('incoming')
const nomenclatureMetaById = ref(new Map())
const uploadModalOpen = ref(false)
const uploadError = ref('')
const uploadLoading = ref(false)
const uploadFile = ref(null)
const uploadInputRef = ref(null)
const uploadProvider = ref({ id: '', name: '' })
const uploadPayer = ref({ id: '', name: '' })
const uploadProviderOpen = ref(false)
const uploadPayerOpen = ref(false)
const uploadProviderLoading = ref(false)
const uploadPayerLoading = ref(false)
const uploadProviderOptions = ref([])
const uploadPayerOptions = ref([])
const loadedSections = ref(new Set())
let stockPhotoLoadSeq = 0
let nomenclaturePhotoLoadSeq = 0
let stockPhotoAbortController = null
let nomenclaturePhotoAbortController = null

const nomenclatureExportColumns = ref([
  { key: 'number', label: '№', enabled: true },
  { key: 'name', label: 'Название', enabled: true },
  { key: 'categoryPath', label: 'Категория', enabled: true },
  { key: 'unit', label: 'Еденица Изм.', enabled: true },
  { key: 'priceOpt1', label: 'Цена опт1', enabled: true },
  { key: 'priceOpt2', label: 'Цена опт2', enabled: true },
  { key: 'priceRetail', label: 'Цена розница', enabled: true },
])

const normalizeArray = (payload) => {
  if (Array.isArray(payload)) return payload
  return payload?.items || payload?.data || payload?.results || []
}

const normalizeType = (value) => {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return ''
  if (raw.includes('приоб') || raw.includes('on-site')) return 'Приобъектный склад'
  if (raw.includes('объект') || raw.includes('warehouse') || raw.includes('склад')) return 'Склад'
  return value
}

const formatNumber = (value) => {
  const n = Number(value)
  if (!Number.isFinite(n)) return '0'
  return n.toLocaleString('ru-RU')
}

const hasPriceValue = (value) => {
  if (value == null || value === '') return false
  const normalized = String(value).trim().replace(',', '.')
  const num = Number(normalized)
  return Number.isFinite(num) && num !== 0
}

const formatDate = (value) => {
  if (!value) return '—'
  const source = String(value)
  const dateOnly = source.length >= 10 ? source.slice(0, 10) : source
  const parts = dateOnly.split('-')
  if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`
  return source
}

const normalizeDateFilterValue = (value) => {
  if (!value) return ''
  const source = String(value)
  return source.length >= 10 ? source.slice(0, 10) : source
}

const titleText = computed(() => {
  const type = warehouseType.value ? ` • ${warehouseType.value}` : ''
  return `${warehouseName.value}${type}`
})
const sectionTitle = computed(() => {
  const map = {
    stock: 'Склад',
    nomenclature: 'Номенклатура',
    categories: 'Товарная категория',
    incoming: 'Приходные накладные',
    outgoing: 'Расходные накладные',
    returns: 'Возвратные накладные',
    inventory: 'Накладные инвентаризации',
    deliveries: 'Доставки',
    documents: 'Документы',
  }
  return map[activeTab.value] || 'Склад'
})
const activeTab = computed(() => {
  const section = String(route.params.section || 'stock')
  return allowedSections.includes(section) ? section : 'stock'
})

const categoryTreeMeta = computed(() => buildWarehouseCategoryTree(categoryRows.value))
const categoryTreeRows = computed(() => categoryTreeMeta.value.flat.map((item, index) => ({
  ...item,
  number: index + 1,
})))

const parentNameById = computed(() => {
  const map = new Map()
  categoryTreeMeta.value.flat.forEach((row) => {
    map.set(String(row.id), row.pathLabel)
  })
  return map
})
const filteredStockRows = computed(() => {
  const nameQ = String(filters.value.stockName || '').trim().toLowerCase()
  const objectQ = String(filters.value.stockObject || '').trim().toLowerCase()
  const categoryQ = String(filters.value.stockCategory || '').trim().toLowerCase()
  const tollRaw = String(filters.value.stockToll || '').trim().toLowerCase()
  const tollQ = tollRaw.startsWith('д') || tollRaw === 'yes' ? 'yes' : tollRaw.startsWith('н') || tollRaw === 'no' ? 'no' : ''
  const tollCompanyQ = String(filters.value.stockTollCompany || '').trim().toLowerCase()
  return stockRows.value.filter((row) => {
    const zeroOk = !hideZeroStock.value || Number(row.quantity || 0) !== 0
    const nameOk = !nameQ || String(row.name || '').toLowerCase().includes(nameQ)
    const objectOk = !objectQ || row.reservedLines.some((item) => String(item.label || '').toLowerCase().includes(objectQ))
    const stockCategory = String(row.categoryPath || nomenclatureMetaById.value.get(String(row.id || ''))?.categoryPath || '').toLowerCase()
    const categoryOk = !categoryQ || stockCategory.includes(categoryQ)
    const tollOk = !tollQ || (tollQ === 'yes' ? row.tollLines.length > 0 : row.tollLines.length === 0)
    const tollCompanyOk = !tollCompanyQ || row.tollLines.some((item) => String(item.companyName || '').toLowerCase().includes(tollCompanyQ))
    return zeroOk && nameOk && objectOk && categoryOk && tollOk && tollCompanyOk
  })
})
const filteredNomenclatureRows = computed(() => {
  const q = String(filters.value.nomenclatureName || '').trim().toLowerCase()
  const categoryQ = String(filters.value.nomenclatureCategory || '').trim().toLowerCase()
  return nomenclatureRows.value.filter((row) =>
    (!q
      || String(row.name || '').toLowerCase().includes(q)
      || String(row.unit || '').toLowerCase().includes(q))
    && (!categoryQ || String(row.categoryPath || '').toLowerCase().includes(categoryQ))
    && (!nomenclatureMissingPriceOpt1.value || !hasPriceValue(row.priceOpt1))
    && (!nomenclatureMissingPriceOpt2.value || !hasPriceValue(row.priceOpt2))
    && (!nomenclatureMissingPriceRetail.value || !hasPriceValue(row.priceRetail))
  )
})
const filteredCategoryTreeRows = computed(() => {
  const q = String(filters.value.categoryName || '').trim().toLowerCase()
  if (!q) return categoryTreeRows.value
  return categoryTreeRows.value.filter((row) =>
    String(row.name || '').toLowerCase().includes(q)
    || String(row.pathLabel || '').toLowerCase().includes(q)
  )
})
const filteredIncomingRows = computed(() => {
  return incomingRows.value.filter((row) => {
    const numberOk = !filters.value.incomingNumber || String(row.number || '').toLowerCase().includes(String(filters.value.incomingNumber).toLowerCase())
    const createdOk = !filters.value.incomingCreatedAt || normalizeDateFilterValue(row.createdAt) === String(filters.value.incomingCreatedAt)
    const conductedOk = !filters.value.incomingConductedAt || normalizeDateFilterValue(row.conductedAt) === String(filters.value.incomingConductedAt)
    const counterpartyOk = !filters.value.incomingCounterparty || String(row.counterparty || '').toLowerCase().includes(String(filters.value.incomingCounterparty).toLowerCase())
    const toOk = !filters.value.incomingTo || String(row.toName || '').toLowerCase().includes(String(filters.value.incomingTo).toLowerCase())
    const objectOk = !filters.value.incomingObject || String(row.objectName || '').toLowerCase().includes(String(filters.value.incomingObject).toLowerCase())
    const statusOk = !filters.value.incomingStatus || String(row.status.label || '').toLowerCase().includes(String(filters.value.incomingStatus).toLowerCase())
    const tollRaw = String(filters.value.incomingToll || '').trim().toLowerCase()
    const tollQ = tollRaw.startsWith('д') || tollRaw === 'yes' ? 'yes' : tollRaw.startsWith('н') || tollRaw === 'no' ? 'no' : ''
    const tollOk = !tollQ || (tollQ === 'yes' ? row.toll : !row.toll)
    const tollCompanyOk = !filters.value.incomingTollCompany || String(row.tollCompanyName || '').toLowerCase().includes(String(filters.value.incomingTollCompany).toLowerCase())
    return numberOk && createdOk && conductedOk && counterpartyOk && toOk && objectOk && statusOk && tollOk && tollCompanyOk
  })
})
const filteredOutgoingRows = computed(() => {
  return outgoingRows.value.filter((row) => {
    const numberOk = !filters.value.outgoingNumber || String(row.number || '').toLowerCase().includes(String(filters.value.outgoingNumber).toLowerCase())
    const createdOk = !filters.value.outgoingCreatedAt || normalizeDateFilterValue(row.createdAt) === String(filters.value.outgoingCreatedAt)
    const conductedOk = !filters.value.outgoingConductedAt || normalizeDateFilterValue(row.conductedAt) === String(filters.value.outgoingConductedAt)
    const counterpartyOk = !filters.value.outgoingCounterparty || String(row.counterparty || '').toLowerCase().includes(String(filters.value.outgoingCounterparty).toLowerCase())
    const whoWriteOffOk = !filters.value.outgoingWhoWriteOff || String(row.whoWriteOff || '').toLowerCase().includes(String(filters.value.outgoingWhoWriteOff).toLowerCase())
    const objectOk = !filters.value.outgoingObject || String(row.objectName || '').toLowerCase().includes(String(filters.value.outgoingObject).toLowerCase())
    const statusOk = !filters.value.outgoingStatus || String(row.status.label || '').toLowerCase().includes(String(filters.value.outgoingStatus).toLowerCase())
    return numberOk && createdOk && conductedOk && counterpartyOk && whoWriteOffOk && objectOk && statusOk
  })
})
const filteredReturnRows = computed(() => {
  return returnRows.value.filter((row) => {
    const numberOk = !filters.value.returnsNumber || String(row.number || '').toLowerCase().includes(String(filters.value.returnsNumber).toLowerCase())
    const createdOk = !filters.value.returnsCreatedAt || normalizeDateFilterValue(row.createdAt) === String(filters.value.returnsCreatedAt)
    const conductedOk = !filters.value.returnsConductedAt || normalizeDateFilterValue(row.conductedAt) === String(filters.value.returnsConductedAt)
    const counterpartyOk = !filters.value.returnsCounterparty || String(row.counterparty || '').toLowerCase().includes(String(filters.value.returnsCounterparty).toLowerCase())
    const statusOk = !filters.value.returnsStatus || String(row.status.label || '').toLowerCase().includes(String(filters.value.returnsStatus).toLowerCase())
    return numberOk && createdOk && conductedOk && counterpartyOk && statusOk
  })
})

const filteredDocumentRows = computed(() => {
  return documentRows.value.filter((row) => {
    const numberOk = !filters.value.documentsNumber || String(row.number || '').toLowerCase().includes(String(filters.value.documentsNumber).toLowerCase())
    const payerOk = !filters.value.documentsPayer || String(row.payerName || '').toLowerCase().includes(String(filters.value.documentsPayer).toLowerCase())
    const providerOk = !filters.value.documentsProvider || String(row.providerName || '').toLowerCase().includes(String(filters.value.documentsProvider).toLowerCase())
    const creatorOk = !filters.value.documentsCreator || String(row.creator || '').toLowerCase().includes(String(filters.value.documentsCreator).toLowerCase())
    const createdOk = !filters.value.documentsCreatedAt || normalizeDateFilterValue(row.createdAt) === String(filters.value.documentsCreatedAt)
    const statusOk = !filters.value.documentsStatus || String(row.status.label || '').toLowerCase().includes(String(filters.value.documentsStatus).toLowerCase())
    return numberOk && payerOk && providerOk && creatorOk && createdOk && statusOk
  })
})

const filteredInventoryRows = computed(() => {
  return inventoryRows.value.filter((row) => {
    const numberOk = !filters.value.inventoryNumber || String(row.number || '').toLowerCase().includes(String(filters.value.inventoryNumber).toLowerCase())
    const createdOk = !filters.value.inventoryCreatedAt || normalizeDateFilterValue(row.createdAt) === String(filters.value.inventoryCreatedAt)
    const conductedOk = !filters.value.inventoryConductedAt || normalizeDateFilterValue(row.conductedAt) === String(filters.value.inventoryConductedAt)
    const statusOk = !filters.value.inventoryStatus || String(row.status.label || '').toLowerCase().includes(String(filters.value.inventoryStatus).toLowerCase())
    return numberOk && createdOk && conductedOk && statusOk
  })
})

const uniqueStrings = (values) => [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))]
  .sort((a, b) => a.localeCompare(b, 'ru'))

const buildNomenclaturePhotoUrl = (nomenclatureId, fileId) =>
  `/apisup/supply/nomenclature/${encodeURIComponent(nomenclatureId)}/photos/${encodeURIComponent(fileId)}/download`

const fetchNomenclaturePhotoMap = async (ids, signal) => {
  const uniqueIds = [...new Set(ids.map((value) => String(value || '').trim()).filter(Boolean))]
  const maxConcurrency = 2
  const out = []
  let cursor = 0
  const workers = Array.from({ length: Math.min(maxConcurrency, uniqueIds.length) }, async () => {
    while (cursor < uniqueIds.length) {
      if (signal?.aborted) return
      const index = cursor
      cursor += 1
      const id = uniqueIds[index]
      try {
        const res = await fetch(`/apisup/supply/nomenclature/${encodeURIComponent(id)}/photos`, {
          credentials: 'include',
          signal,
        })
        if (!res.ok) {
          out[index] = [id, '']
          continue
        }
        const payload = await res.json()
        const list = Array.isArray(payload) ? payload : (payload?.items || [])
        const first = list[0]
        const fileId = String(first?.id || first?.file_id || '')
        out[index] = [id, fileId ? buildNomenclaturePhotoUrl(id, fileId) : '']
      } catch {
        out[index] = [id, '']
      }
    }
  })
  await Promise.all(workers)
  const entries = out.filter(Boolean)
  return new Map(entries)
}

const filterLabels = {
  stockName: 'Название',
  stockObject: 'Объект',
  stockCategory: 'Товарная категория',
  stockToll: 'Давальческое сырьё',
  stockTollCompany: 'Компания предоставляющая давальческое сырьё',
  nomenclatureName: 'Название',
  nomenclatureCategory: 'Товарная категория',
  categoryName: 'Категория',
  incomingNumber: 'Номер',
  incomingCreatedAt: 'Дата создания',
  incomingConductedAt: 'Дата проведения',
  incomingCounterparty: 'От кого',
  incomingTo: 'На кого',
  incomingObject: 'Объект строительства',
  incomingStatus: 'Статус',
  incomingToll: 'Давальческое сырьё',
  incomingTollCompany: 'Компания предоставляющая давальческое сырьё',
  outgoingNumber: 'Номер',
  outgoingCreatedAt: 'Дата создания',
  outgoingConductedAt: 'Дата проведения',
  outgoingCounterparty: 'Кому',
  outgoingWhoWriteOff: 'На кого списывать',
  outgoingObject: 'Объект строительства',
  outgoingStatus: 'Статус',
  returnsNumber: 'Номер',
  returnsCreatedAt: 'Дата создания',
  returnsConductedAt: 'Дата проведения',
  returnsCounterparty: 'От кого',
  returnsStatus: 'Статус',
  inventoryNumber: 'Номер',
  inventoryCreatedAt: 'Дата создания',
  inventoryConductedAt: 'Дата проведения',
  inventoryStatus: 'Статус',
  documentsNumber: 'Номер',
  documentsPayer: 'Покупатель',
  documentsProvider: 'Поставщик',
  documentsCreator: 'Создатель',
  documentsCreatedAt: 'Дата',
  documentsStatus: 'Статус',
}

const getFilterOptions = (key) => {
  switch (key) {
    case 'stockName':
      return uniqueStrings(stockRows.value.map((row) => row.name))
    case 'stockObject':
      return uniqueStrings(stockRows.value.flatMap((row) => row.reservedLines.map((item) => item.label)))
    case 'stockCategory':
      return uniqueStrings(stockRows.value.map((row) => row.categoryPath || nomenclatureMetaById.value.get(String(row.id || ''))?.categoryPath || ''))
    case 'stockToll':
      return ['Да', 'Нет']
    case 'stockTollCompany':
      return uniqueStrings(stockRows.value.flatMap((row) => row.tollLines.map((item) => item.companyName)))
    case 'nomenclatureName':
      return uniqueStrings(nomenclatureRows.value.map((row) => row.name))
    case 'nomenclatureCategory':
      return uniqueStrings(nomenclatureRows.value.map((row) => row.categoryPath))
    case 'categoryName':
      return uniqueStrings(categoryTreeRows.value.map((row) => row.pathLabel))
    case 'incomingNumber':
      return uniqueStrings(incomingRows.value.map((row) => row.number))
    case 'incomingCreatedAt':
      return uniqueStrings(incomingRows.value.map((row) => normalizeDateFilterValue(row.createdAt)))
    case 'incomingConductedAt':
      return uniqueStrings(incomingRows.value.map((row) => normalizeDateFilterValue(row.conductedAt)))
    case 'incomingCounterparty':
      return uniqueStrings(incomingRows.value.map((row) => row.counterparty))
    case 'incomingTo':
      return uniqueStrings(incomingRows.value.map((row) => row.toName))
    case 'incomingObject':
      return uniqueStrings(incomingRows.value.map((row) => row.objectName))
    case 'incomingStatus':
      return uniqueStrings(incomingRows.value.map((row) => row.status.label))
    case 'incomingToll':
      return ['Да', 'Нет']
    case 'incomingTollCompany':
      return uniqueStrings(incomingRows.value.map((row) => row.tollCompanyName))
    case 'outgoingNumber':
      return uniqueStrings(outgoingRows.value.map((row) => row.number))
    case 'outgoingCreatedAt':
      return uniqueStrings(outgoingRows.value.map((row) => normalizeDateFilterValue(row.createdAt)))
    case 'outgoingConductedAt':
      return uniqueStrings(outgoingRows.value.map((row) => normalizeDateFilterValue(row.conductedAt)))
    case 'outgoingCounterparty':
      return uniqueStrings(outgoingRows.value.map((row) => row.counterparty))
    case 'outgoingWhoWriteOff':
      return uniqueStrings(outgoingRows.value.map((row) => row.whoWriteOff))
    case 'outgoingObject':
      return uniqueStrings(outgoingRows.value.map((row) => row.objectName))
    case 'outgoingStatus':
      return uniqueStrings(outgoingRows.value.map((row) => row.status.label))
    case 'returnsNumber':
      return uniqueStrings(returnRows.value.map((row) => row.number))
    case 'returnsCreatedAt':
      return uniqueStrings(returnRows.value.map((row) => normalizeDateFilterValue(row.createdAt)))
    case 'returnsConductedAt':
      return uniqueStrings(returnRows.value.map((row) => normalizeDateFilterValue(row.conductedAt)))
    case 'returnsCounterparty':
      return uniqueStrings(returnRows.value.map((row) => row.counterparty))
    case 'returnsStatus':
      return uniqueStrings(returnRows.value.map((row) => row.status.label))
    case 'inventoryNumber':
      return uniqueStrings(inventoryRows.value.map((row) => row.number))
    case 'inventoryCreatedAt':
      return uniqueStrings(inventoryRows.value.map((row) => normalizeDateFilterValue(row.createdAt)))
    case 'inventoryConductedAt':
      return uniqueStrings(inventoryRows.value.map((row) => normalizeDateFilterValue(row.conductedAt)))
    case 'inventoryStatus':
      return uniqueStrings(inventoryRows.value.map((row) => row.status.label))
    case 'documentsNumber':
      return uniqueStrings(documentRows.value.map((row) => row.number))
    case 'documentsPayer':
      return uniqueStrings(documentRows.value.map((row) => row.payerName))
    case 'documentsProvider':
      return uniqueStrings(documentRows.value.map((row) => row.providerName))
    case 'documentsCreator':
      return uniqueStrings(documentRows.value.map((row) => row.creator))
    case 'documentsCreatedAt':
      return uniqueStrings(documentRows.value.map((row) => normalizeDateFilterValue(row.createdAt)))
    case 'documentsStatus':
      return uniqueStrings(documentRows.value.map((row) => row.status.label))
    default:
      return []
  }
}

const getFilterMatches = (key) => {
  const query = String(filters.value[key] || '').trim().toLowerCase()
  const options = getFilterOptions(key)
  if (!query) return options
  return options.filter((item) => item.toLowerCase().includes(query))
}

const getFilterPlaceholder = (key) => `${filterLabels[key] || 'Значение'}...`

const openFilterDropdown = (key) => {
  activeFilterDropdown.value = key
}

const updateFilterValue = (key, value) => {
  filters.value[key] = value
  activeFilterDropdown.value = key
}

const selectFilterValue = (key, value) => {
  filters.value[key] = value
  activeFilterDropdown.value = ''
}

const clearSectionFilters = (prefix) => {
  Object.keys(filters.value).forEach((key) => {
    if (key.startsWith(prefix)) filters.value[key] = ''
  })
}

const handleDocumentClick = (event) => {
  const target = event.target
  if (!(target instanceof Element)) return
  if (target.closest('.filter-lookup')) return
  activeFilterDropdown.value = ''
}

const normalizeDocumentStatus = (value, statusId = '') => {
  const raw = String(value || '').toLowerCase()
  if (String(statusId || '') === 'f5533f42-3972-11f1-b5d7-bc241127d0bd' || raw.includes('обработке') || raw.includes('processing')) {
    return { key: 'processing', label: value || 'В обработке' }
  }
  if (raw.includes('обработ') || raw.includes('ready') || raw.includes('done')) {
    return { key: 'posted', label: value || 'Обработан' }
  }
  if (raw.includes('ошиб') || raw.includes('error')) {
    return { key: 'error', label: value || 'Ошибка' }
  }
  return { key: 'draft', label: value || 'Загружен' }
}

const mapDocumentRows = (list) => normalizeArray(list)
  .filter((item) => {
    const warehouseRef = String(item?.warehouse_id || item?.warehouseId || '')
    return !warehouseRef || warehouseRef === String(warehouseId.value || '')
  })
  .map((item) => ({
    documentId: String(item?.id || item?.document_id || ''),
    number: String(item?.num || item?.number || '—'),
    creator: String(
      item?.created_by_user?.short_fio
      || item?.uploaded_by_user?.short_fio
      || item?.created_by_name
      || item?.uploaded_by_name
      || '—'
    ),
    providerName: String(item?.provider_name || item?.provider?.short_name || '—'),
    payerName: String(item?.payer_name || item?.payer?.short_name || '—'),
    createdAt: item?.created_at || item?.uploaded_at || item?.date || '',
    status: normalizeDocumentStatus(item?.status_name || item?.status || '', item?.status_id || item?.statusId || ''),
  }))
  .sort((a, b) => String(b.documentId || '').localeCompare(String(a.documentId || '')))
  .map((item, index) => ({
    ...item,
    id: index + 1,
  }))

const loadDocuments = async () => {
  try {
    const res = await fetch(`/apisup/supply/upd-documents?warehouse_id=${encodeURIComponent(warehouseId.value)}`, {
      credentials: 'include',
    })
    if (!res.ok) throw new Error('documents load failed')
    const payload = await res.json()
    documentRows.value = mapDocumentRows(payload)
  } catch {
    documentRows.value = []
  }
}

const openUploadModal = () => {
  uploadError.value = ''
  uploadFile.value = null
  uploadProvider.value = { id: '', name: '' }
  uploadPayer.value = { id: '', name: '' }
  uploadProviderOptions.value = []
  uploadPayerOptions.value = []
  uploadProviderOpen.value = false
  uploadPayerOpen.value = false
  uploadModalOpen.value = true
}

const closeUploadModal = () => {
  if (uploadLoading.value) return
  uploadModalOpen.value = false
  uploadError.value = ''
  uploadFile.value = null
  uploadProvider.value = { id: '', name: '' }
  uploadPayer.value = { id: '', name: '' }
  uploadProviderOptions.value = []
  uploadPayerOptions.value = []
  uploadProviderOpen.value = false
  uploadPayerOpen.value = false
  if (uploadInputRef.value) uploadInputRef.value.value = ''
}

const onPickUploadFile = (event) => {
  const file = event?.target?.files?.[0] || null
  uploadFile.value = file
}

const normalizeCounterpartySearch = (payload) => normalizeArray(payload).map((item) => ({
  id: String(item?.id || ''),
  name: String(item?.short_name || item?.full_name || '').trim(),
})).filter((item) => item.id && item.name)

const searchUploadCounterparty = async (kind) => {
  const isProvider = kind === 'provider'
  const target = isProvider ? uploadProvider : uploadPayer
  const optionsRef = isProvider ? uploadProviderOptions : uploadPayerOptions
  const loadingRef = isProvider ? uploadProviderLoading : uploadPayerLoading
  const query = String(target.value.name || '').trim()

  loadingRef.value = true
  try {
    const res = await fetch(`/apiref/ref/counterparties/search?q=${encodeURIComponent(query)}`, {
      credentials: 'include',
    })
    if (!res.ok) throw new Error('counterparty search failed')
    optionsRef.value = normalizeCounterpartySearch(await res.json())
  } catch {
    optionsRef.value = []
  } finally {
    loadingRef.value = false
  }
}

const onUploadCounterpartyInput = async (kind, event) => {
  const value = event?.target?.value || ''
  if (kind === 'provider') {
    uploadProvider.value = { id: '', name: value }
    uploadProviderOpen.value = true
  } else {
    uploadPayer.value = { id: '', name: value }
    uploadPayerOpen.value = true
  }
  await searchUploadCounterparty(kind)
}

const openUploadCounterpartyDropdown = async (kind) => {
  if (kind === 'provider') uploadProviderOpen.value = true
  else uploadPayerOpen.value = true
  await searchUploadCounterparty(kind)
}

const selectUploadCounterparty = (kind, option) => {
  if (kind === 'provider') {
    uploadProvider.value = { id: option.id, name: option.name }
    uploadProviderOpen.value = false
  } else {
    uploadPayer.value = { id: option.id, name: option.name }
    uploadPayerOpen.value = false
  }
}

const openCreateCounterparty = () => {
  window.open('/organizations/create', '_blank', 'noopener')
}

const submitUpload = async () => {
  if (!uploadFile.value) {
    uploadError.value = 'Выберите PDF файл.'
    return
  }
  const isPdf = String(uploadFile.value.type || '').includes('pdf') || String(uploadFile.value.name || '').toLowerCase().endsWith('.pdf')
  if (!isPdf) {
    uploadError.value = 'Можно загрузить только PDF файл.'
    return
  }

  const body = new FormData()
  body.append('file', uploadFile.value, uploadFile.value.name)
  body.append('warehouse_id', warehouseId.value)
  if (uploadProvider.value.id) body.append('provider_id', uploadProvider.value.id)
  if (uploadPayer.value.id) body.append('payer_id', uploadPayer.value.id)

  uploadLoading.value = true
  uploadError.value = ''
  const existingDocumentIds = new Set(documentRows.value.map((item) => String(item?.documentId || '')))
  try {
    const res = await fetch('/apisup/supply/upd-documents/with-file', {
      method: 'POST',
      credentials: 'include',
      headers: {
        accept: 'application/json',
      },
      body,
    })
    if (!res.ok) throw new Error('upload failed')
    let payload = null
    try {
      payload = await res.json()
    } catch {
      payload = null
    }
    await loadDocuments()
    uploadLoading.value = false
    closeUploadModal()

    const uploadedItem = Array.isArray(payload) ? payload[0] : payload
    const uploadedDocumentId = String(uploadedItem?.id || uploadedItem?.document_id || '')
    const createdDocumentId = String(
      documentRows.value.find((item) => !existingDocumentIds.has(String(item?.documentId || '')))?.documentId || ''
    )
    const targetDocumentId = uploadedDocumentId || createdDocumentId

    if (targetDocumentId) {
      router.push({
        name: 'warehouse-document-detail',
        params: {
          warehouseId: warehouseId.value,
          documentId: targetDocumentId,
        },
      })
    }
  } catch {
    uploadError.value = 'Не удалось загрузить документ.'
  } finally {
    if (uploadLoading.value) uploadLoading.value = false
  }
}

const goBack = () => {
  router.push('/warehouses')
}

const openDocument = (row) => {
  const id = String(row?.documentId || '')
  if (!id) return
  router.push({
    name: 'warehouse-document-detail',
    params: {
      warehouseId: warehouseId.value,
      documentId: id,
    },
  })
}

const openDelivery = (row) => {
  const id = String(row?.id || '')
  if (!id) return
  router.push({
    path: `/deliveries/${encodeURIComponent(id)}`,
    query: {
      back: route.fullPath,
      warehouse_id: warehouseId.value,
    },
  })
}

const openSection = (section) => {
  const target = String(section || 'stock')
  if (!allowedSections.includes(target)) return
  const current = activeTab.value
  if (current !== target) {
    if (current === 'stock') clearSectionFilters('stock')
    if (current === 'nomenclature') clearSectionFilters('nomenclature')
    if (current === 'categories') clearSectionFilters('category')
    if (current === 'incoming') clearSectionFilters('incoming')
    if (current === 'outgoing') clearSectionFilters('outgoing')
    if (current === 'returns') clearSectionFilters('returns')
    if (current === 'inventory') clearSectionFilters('inventory')
    if (current === 'deliveries') deliveriesSubtab.value = 'incoming'
  }
  router.push({
    name: 'warehouse-section',
    params: {
      warehouseId: warehouseId.value,
      section: target,
    },
    query: route.query,
  })
  activeFilterDropdown.value = ''
}

const openCreateNomenclature = () => {
  router.push({
    path: '/nomenclature/new',
    query: {
      back: route.fullPath,
      warehouse_id: warehouseId.value,
    },
  })
}

const closeNomenclatureExportModal = () => {
  if (nomenclatureExportLoading.value) return
  nomenclatureExportOpen.value = false
}

const exportNomenclatureRows = async () => {
  const enabledColumns = nomenclatureExportColumns.value.filter((column) => column.enabled)
  if (!enabledColumns.length || !filteredNomenclatureRows.value.length) return
  nomenclatureExportLoading.value = true
  try {
    const ExcelJS = await import('exceljs')
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Nomenclature', {
      pageSetup: {
        paperSize: 9,
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: {
          left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2,
        },
      },
      views: [{ state: 'frozen', ySplit: 1 }],
    })

    const header = enabledColumns.map((column) => column.label)
    const rowsData = filteredNomenclatureRows.value.map((row) => enabledColumns.map((column) => {
      if (column.key === 'priceOpt1') return hasPriceValue(row.priceOpt1) ? Number(String(row.priceOpt1).replace(',', '.')) : ''
      if (column.key === 'priceOpt2') return hasPriceValue(row.priceOpt2) ? Number(String(row.priceOpt2).replace(',', '.')) : ''
      if (column.key === 'priceRetail') return hasPriceValue(row.priceRetail) ? Number(String(row.priceRetail).replace(',', '.')) : ''
      return row[column.key] ?? ''
    }))

    sheet.addRow(header)
    rowsData.forEach((row) => sheet.addRow(row))

    const borderStyle = {
      top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    }

    sheet.getRow(1).eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { bold: true, color: { argb: 'FF0F172A' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
      cell.border = borderStyle
    })

    sheet.eachRow((row, rowNumber) => {
      row.height = rowNumber === 1 ? 24 : undefined
      row.eachCell({ includeEmpty: true }, (cell) => {
        if (rowNumber !== 1) {
          cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true }
          cell.border = borderStyle
        }
      })
    })

    const colCount = header.length
    for (let col = 1; col <= colCount; col += 1) {
      const values = [header[col - 1], ...rowsData.map((r) => r[col - 1])]
      const maxLen = values.reduce((acc, value) => Math.max(acc, String(value ?? '').length), 0)
      sheet.getColumn(col).width = Math.min(42, Math.max(12, maxLen + 2))
    }

    const nameColIndex = enabledColumns.findIndex((column) => column.key === 'name') + 1
    if (nameColIndex > 0) {
      sheet.getColumn(nameColIndex).width = Math.max(sheet.getColumn(nameColIndex).width || 12, 36)
    }

    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `nomenclature_${new Date().toISOString().slice(0, 10)}.xlsx`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    nomenclatureExportOpen.value = false
  } catch {
    error.value = 'Не удалось экспортировать номенклатуру в .xlsx.'
  } finally {
    nomenclatureExportLoading.value = false
  }
}

const openNomenclature = (row) => {
  const id = String(row?.id || '')
  if (!id) return
  router.push({
    path: `/nomenclature/${encodeURIComponent(id)}/view`,
    query: {
      back: route.fullPath,
      warehouse_id: warehouseId.value,
    },
  })
}

const openCreateCategory = () => {
  router.push({
    path: '/warehouse-categories/new',
    query: {
      back: route.fullPath,
      warehouse_id: warehouseId.value,
    },
  })
}

const openEditCategory = (row) => {
  const id = String(row?.id || '')
  if (!id) return
  router.push({
    path: `/warehouse-categories/${encodeURIComponent(id)}`,
    query: {
      back: route.fullPath,
      warehouse_id: warehouseId.value,
    },
  })
}

const openCreateWaybill = (type) => {
  const raw = String(type || '').toLowerCase()
  const mode = raw === 'outgoing' || raw === 'returns' || raw === 'inventory' ? raw : 'incoming'
  router.push({
    path: `/warehouses/${encodeURIComponent(warehouseId.value)}/waybills/${mode}/new`,
    query: {
      back: route.fullPath,
      warehouse_name: warehouseName.value,
    },
  })
}

const openWaybill = (row, type) => {
  const raw = String(type || '').toLowerCase()
  const mode = raw === 'outgoing' || raw === 'returns' || raw === 'inventory' ? raw : 'incoming'
  const id = String(row?.id || '')
  if (!id) return
  router.push({
    path: `/warehouses/${encodeURIComponent(warehouseId.value)}/waybills/${mode}/${encodeURIComponent(id)}`,
    query: {
      back: route.fullPath,
      warehouse_name: warehouseName.value,
    },
  })
}

const mapStockRows = (list, photoMap = new Map()) => {
  const groups = new Map()

  normalizeArray(list).forEach((item) => {
    const nomenclatureId = String(item?.nomenclature_id || item?.id || item?.nomenclature?.id || '')
    const name = String(item?.nomenclature_name || item?.name || item?.nomenclature?.name || item?.title || '—')
    const unit = String(item?.unit_name || item?.unit?.name || item?.measure || '—')
    const key = `${nomenclatureId}::${name}::${unit}`
    const row = groups.get(key) || {
      id: nomenclatureId || key,
      photoUrl: photoMap.get(nomenclatureId) || '',
      categoryPath: String(item?.warehouse_category_path || item?.warehouse_category_name || item?.nomenclature?.warehouse_category?.name || ''),
      name,
      unit,
      quantity: 0,
      reserved: 0,
      free: 0,
      reservedLines: [],
      tollLines: [],
    }

    const quantity = Number(item?.quantity ?? 0) || 0
    const totalQuantity = Number(item?.total_quantity ?? 0) || 0
    const objectRef = String(item?.object_levels_id || item?.object_id || '').trim()
    const projectName = String(item?.project_name || item?.object_name || '').trim()
    const isReserved = Boolean(objectRef)
    const isToll = Boolean(item?.toll)
    const tollCompanyId = String(item?.toll_company_id || '')
    const tollCompanyName = String(item?.toll_company_name || '').trim()

    row.quantity = Math.max(row.quantity, totalQuantity || quantity)

    if (isReserved) {
      row.reserved += quantity
      row.reservedLines.push({
        key: `${key}-${row.reservedLines.length}`,
        quantity,
        label: projectName || 'Резерв',
      })
    } else {
      row.free += quantity
    }

    if (isToll) {
      const companyKey = tollCompanyId || tollCompanyName || 'unknown'
      const existingLine = row.tollLines.find((line) => line.companyKey === companyKey)
      if (existingLine) {
        existingLine.quantity += quantity
      } else {
        row.tollLines.push({
          key: `${key}-toll-${row.tollLines.length}`,
          companyKey,
          companyName: tollCompanyName || 'Компания не указана',
          quantity,
        })
      }
    }

    groups.set(key, row)
  })

  return Array.from(groups.values())
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
    .map((item, index) => ({
      ...item,
      number: index + 1,
    }))
}

const mapNomenclatureRows = (list, photoMap = new Map()) => normalizeArray(list).map((item, idx) => ({
  id: String(item?.id || idx + 1),
  number: idx + 1,
  photoUrl: photoMap.get(String(item?.id || '')) || '',
  name: item?.name || item?.title || '—',
  description: item?.description || '—',
  categoryPath: String(item?.warehouse_category_path || item?.warehouse_category?.path_label || item?.warehouse_category?.name || ''),
  unit: item?.unit?.name || item?.unit_name || item?.measure || '—',
  priceOpt1: item?.price_opt ?? item?.priceOpt1 ?? '',
  priceOpt2: item?.price_opt2 ?? item?.priceOpt2 ?? '',
  priceRetail: item?.price_retail ?? item?.priceRetail ?? '',
}))

const mapCategoryRows = (list) => normalizeArray(list).map((item, idx) => ({
  id: String(item?.id || idx + 1),
  number: idx + 1,
  name: String(item?.name || '—'),
  parentId: String(item?.parent_id || ''),
}))

const normalizeWaybillStatus = (item) => {
  const statusRaw = String(item?.status_name || item?.status || '').toLowerCase()
  const isPosted = Boolean(item?.is_posted || item?.conducted_at || item?.posted_at || statusRaw.includes('провед'))
    || statusRaw.includes('заверш')
  if (isPosted) return { key: 'posted', label: 'Проведен' }
  return { key: 'draft', label: 'Черновик' }
}

const mapWaybillRows = (list, type) => normalizeArray(list).map((item) => {
  const status = normalizeWaybillStatus(item)
  const number = String(item?.num || item?.number || item?.id || '—')
  const createdAt = item?.created_at || item?.date_created || item?.created
  const conductedAt = item?.date_arrival || item?.date_completed || item?.conducted_at || item?.posted_at || item?.date_conducted || null
  const counterparty = type === 'inventory'
    ? '—'
    : type === 'incoming'
    ? String(
      item?.from_name
      || item?.provider_name
      || item?.supplier_name
      || item?.from_counterparty_name
      || '—'
    )
    : type === 'returns'
      ? String(
        item?.from_name
        || item?.from
        || item?.provider_name
        || '—'
      )
      : String(
      item?.to_name
      || item?.recipient_name
      || item?.to
      || item?.from_name
      || '—'
    )
  const whoWriteOff = String(
    item?.who_write_off_name
    || item?.who_write_off
    || '—'
  )
  const toName = String(
    item?.to_name
    || item?.to
    || '—'
  )
  const objectName = String(
    item?.object_name
    || item?.project_name
    || item?.object_levels_name
    || item?.warehouse_name
    || warehouseName.value
    || '—'
  )
  const deliveryId = String(
    item?.delivery_id
    || item?.source_delivery_id
    || item?.based_on_delivery_id
    || ''
  )
  const toll = Boolean(item?.toll)
  const tollCompanyName = String(item?.toll_company_name || item?.toll_company?.name || '').trim()
  return {
    id: String(item?.id || `${type}-${number}`),
    number,
    createdAt,
    conductedAt,
    counterparty,
    toName,
    whoWriteOff,
    objectName,
    status,
    deliveryId,
    toll,
    tollCompanyName,
  }
})

const mapDeliveryRows = (list, mode) => normalizeArray(list).map((item) => {
  const createdAt = item?.created_at || item?.date_created || null
  const pickUpDate = item?.pick_up_date_planned || item?.pick_up_date || null
  const deliveryFrom = item?.planned_delivery_from || null
  const deliveryTo = item?.planned_delivery_to || null
  return {
    id: String(item?.id || ''),
    number: String(item?.num || item?.id || '—'),
    projectName: String(item?.project_name || item?.object_name || '—'),
    carrier: String(item?.carrier_name || item?.provider_name || '—'),
    fromName: String(item?.delivery_from_name || item?.from_name || '—'),
    toName: String(item?.delivery_to_name || item?.to_name || '—'),
    invoiceName: String(item?.invoice_num || item?.invoice_id || '—'),
    requestName: String(item?.request_num || item?.request_id || '—'),
    driver: String(item?.driver_name || '—'),
    createdAt,
    pickUpDate,
    deliveryFrom,
    deliveryTo,
    mode,
  }
})

const loadWarehouseMeta = async () => {
  const id = warehouseId.value
  const hintName = String(route.query.name || '').trim()
  const hintType = String(route.query.type || '').trim()
  if (hintName) warehouseName.value = hintName
  if (hintType) warehouseType.value = hintType

  try {
    const res = await fetch('/apisup/supply/warehouses', { credentials: 'include' })
    if (!res.ok) return
    const list = normalizeArray(await res.json())
    const found = list.find((item) => String(item?.id || '') === id)
    if (!found) return
    warehouseName.value = String(found?.name || warehouseName.value || 'Склад')
    warehouseType.value = normalizeType(found?.type_name || found?.type || '')
  } catch {
    // noop
  }
}

const loadStock = async () => {
  const id = warehouseId.value
  const seq = ++stockPhotoLoadSeq
  if (stockPhotoAbortController) stockPhotoAbortController.abort()
  stockPhotoAbortController = new AbortController()
  try {
    const res = await fetch(`/apisup/supply/warehouses/${encodeURIComponent(id)}/list`, { credentials: 'include' })
    if (!res.ok) throw new Error('warehouse')
    const payload = await res.json()
    if (payload?.warehouse) {
      warehouseName.value = String(payload.warehouse?.name || warehouseName.value || 'Склад')
      warehouseType.value = normalizeType(payload.warehouse?.type_name || payload.warehouse?.type || '')
    }
    const items = normalizeArray(payload?.items || [])
    stockRows.value = mapStockRows(items)
    fetchNomenclaturePhotoMap(items.map((item) => item?.nomenclature_id), stockPhotoAbortController.signal)
      .then((photoMap) => {
        if (seq !== stockPhotoLoadSeq || id !== warehouseId.value) return
        stockRows.value = mapStockRows(items, photoMap)
      })
      .catch(() => {})
  } catch {
    stockRows.value = []
  }
}

const loadNomenclature = async () => {
  const id = warehouseId.value
  const seq = ++nomenclaturePhotoLoadSeq
  if (nomenclaturePhotoAbortController) nomenclaturePhotoAbortController.abort()
  nomenclaturePhotoAbortController = new AbortController()
  const endpoints = [
    `/apisup/supply/warehouses/${encodeURIComponent(id)}/nomenclature`,
    `/apisup/supply/warehouse-nomenclature?warehouse_id=${encodeURIComponent(id)}`,
    '/apisup/supply/nomenclature',
  ]

  for (const endpoint of endpoints) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const res = await fetch(endpoint, { credentials: 'include' })
      if (!res.ok) continue
      // eslint-disable-next-line no-await-in-loop
      const payload = await res.json()
      const items = normalizeArray(payload)
      nomenclatureMetaById.value = new Map(items.map((item) => [
        String(item?.id || ''),
        {
          categoryPath: String(item?.warehouse_category_path || item?.warehouse_category?.path_label || item?.warehouse_category?.name || ''),
          description: String(item?.description || ''),
        },
      ]))
      nomenclatureRows.value = mapNomenclatureRows(items)
      fetchNomenclaturePhotoMap(items.map((item) => item?.id), nomenclaturePhotoAbortController.signal)
        .then((photoMap) => {
          if (seq !== nomenclaturePhotoLoadSeq || id !== warehouseId.value) return
          nomenclatureRows.value = mapNomenclatureRows(items, photoMap)
        })
        .catch(() => {})
      return
    } catch {
      // try next
    }
  }
  nomenclatureRows.value = []
  nomenclatureMetaById.value = new Map()
}

const loadCategories = async () => {
  const endpoints = ['/apisup/supply/warehouse-categories']
  for (const endpoint of endpoints) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const res = await fetch(endpoint, { credentials: 'include' })
      if (!res.ok) continue
      // eslint-disable-next-line no-await-in-loop
      const payload = await res.json()
      categoryRows.value = mapCategoryRows(payload)
      return
    } catch {
      // try next
    }
  }
  categoryRows.value = []
}

const loadIncomingWaybills = async () => {
  try {
    const res = await fetch('/apisup/supply/warehouse-receipts', { credentials: 'include' })
    if (!res.ok) throw new Error('receipts')
    const payload = await res.json()
    const list = normalizeArray(payload).filter(
      (item) => String(item?.warehouse_id || '') === String(warehouseId.value || '')
    )
    list.sort((a, b) => Number(b?.num || 0) - Number(a?.num || 0))
    incomingRows.value = mapWaybillRows(list, 'incoming')
  } catch {
    incomingRows.value = []
  }
}

const loadOutgoingWaybills = async () => {
  try {
    const res = await fetch('/apisup/supply/warehouse-receipts/outgoing', { credentials: 'include' })
    if (!res.ok) throw new Error('outgoing receipts')
    const payload = await res.json()
    const list = normalizeArray(payload).filter(
      (item) => String(item?.warehouse_id || '') === String(warehouseId.value || '')
    )
    list.sort((a, b) => Number(b?.num || 0) - Number(a?.num || 0))
    outgoingRows.value = mapWaybillRows(list, 'outgoing')
  } catch {
    outgoingRows.value = []
  }
}

const loadReturnWaybills = async () => {
  try {
    const res = await fetch('/apisup/supply/warehouse-receipts/returns', { credentials: 'include' })
    if (!res.ok) throw new Error('return receipts')
    const payload = await res.json()
    const list = normalizeArray(payload).filter(
      (item) => String(item?.warehouse_id || '') === String(warehouseId.value || '')
    )
    list.sort((a, b) => Number(b?.num || 0) - Number(a?.num || 0))
    returnRows.value = mapWaybillRows(list, 'returns')
  } catch {
    returnRows.value = []
  }
}

const loadInventoryWaybills = async () => {
  try {
    const res = await fetch('/apisup/supply/warehouse-receipts/inventory', { credentials: 'include' })
    if (!res.ok) throw new Error('inventory receipts')
    const payload = await res.json()
    const list = normalizeArray(payload).filter(
      (item) => String(item?.warehouse_id || '') === String(warehouseId.value || '')
    )
    list.sort((a, b) => Number(b?.num || 0) - Number(a?.num || 0))
    inventoryRows.value = mapWaybillRows(list, 'inventory')
  } catch {
    inventoryRows.value = []
  }
}

const loadDeliveries = async () => {
  try {
    const incomingRes = await fetch(`/apisup/supply/deliveries?delivery_to=${encodeURIComponent(warehouseId.value)}`, { credentials: 'include' })
    if (!incomingRes.ok) throw new Error('incoming deliveries')
    const incomingPayload = await incomingRes.json()
    const incomingList = normalizeArray(incomingPayload)
    incomingList.sort((a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime())
    incomingDeliveryRows.value = mapDeliveryRows(incomingList, 'incoming')
  } catch {
    incomingDeliveryRows.value = []
  }

  try {
    const outgoingRes = await fetch(`/apisup/supply/deliveries?delivery_from=${encodeURIComponent(warehouseId.value)}`, { credentials: 'include' })
    if (!outgoingRes.ok) throw new Error('outgoing deliveries')
    const outgoingPayload = await outgoingRes.json()
    const outgoingList = normalizeArray(outgoingPayload)
    outgoingList.sort((a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime())
    outgoingDeliveryRows.value = mapDeliveryRows(outgoingList, 'outgoing')
  } catch {
    outgoingDeliveryRows.value = []
  }
}

const loadPage = async () => {
  if (!warehouseId.value) return
  loading.value = true
  error.value = ''
  const section = String(activeTab.value || 'stock')
  try {
    await loadWarehouseMeta()
    if (!loadedSections.value.has(section)) {
      if (section === 'stock') await Promise.all([loadStock(), loadNomenclature()])
      else if (section === 'nomenclature') await loadNomenclature()
      else if (section === 'categories') await loadCategories()
      else if (section === 'incoming') await loadIncomingWaybills()
      else if (section === 'outgoing') await loadOutgoingWaybills()
      else if (section === 'returns') await loadReturnWaybills()
      else if (section === 'inventory') await loadInventoryWaybills()
      else if (section === 'deliveries') await loadDeliveries()
      else if (section === 'documents') await loadDocuments()
      loadedSections.value.add(section)
    }
  } catch {
    error.value = 'Не удалось загрузить данные склада.'
  } finally {
    loading.value = false
  }
}

watch(() => route.params.warehouseId, () => {
  loadedSections.value = new Set()
  stockRows.value = []
  nomenclatureRows.value = []
  categoryRows.value = []
  incomingRows.value = []
  outgoingRows.value = []
  returnRows.value = []
  inventoryRows.value = []
  incomingDeliveryRows.value = []
  outgoingDeliveryRows.value = []
  documentRows.value = []
  loadPage()
})

watch(() => route.params.section, () => {
  const section = String(route.params.section || '')
  if (section !== 'stock' && stockPhotoAbortController) stockPhotoAbortController.abort()
  if (section !== 'nomenclature' && nomenclaturePhotoAbortController) nomenclaturePhotoAbortController.abort()
  loadPage()
})

onMounted(() => {
  loadPage()
  window.addEventListener('mousedown', handleDocumentClick)
})

onBeforeUnmount(() => {
  if (stockPhotoAbortController) stockPhotoAbortController.abort()
  if (nomenclaturePhotoAbortController) nomenclaturePhotoAbortController.abort()
  window.removeEventListener('mousedown', handleDocumentClick)
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
        <div>
          <h1 class="page-title">{{ titleText }}</h1>
          <div class="page-subtitle">{{ sectionTitle }}</div>
        </div>
      </header>

      <div class="tabs">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          type="button"
          class="tab-btn"
          :class="{ active: activeTab === tab.key }"
          @click="openSection(tab.key)"
        >
          {{ tab.label }}
        </button>
      </div>

      <div v-if="loading" class="table-state">Загрузка...</div>
      <div v-else-if="error" class="table-state error">{{ error }}</div>

      <template v-else>
        <section v-if="activeTab === 'stock'" class="table-wrapper">
          <div class="table-toolbar table-toolbar-filters">
            <label class="filter-lookup">
              <span class="filter-label">Название</span>
              <input
                :value="filters.stockName"
                type="text"
                class="filter-input"
                :placeholder="getFilterPlaceholder('stockName')"
                @focus="openFilterDropdown('stockName')"
                @input="(e) => updateFilterValue('stockName', e.target.value)"
              >
              <div v-if="activeFilterDropdown === 'stockName'" class="filter-dropdown">
                <button
                  v-for="item in getFilterMatches('stockName')"
                  :key="`stock-name-${item}`"
                  type="button"
                  class="filter-dropdown-item"
                  @mousedown.prevent
                  @click="selectFilterValue('stockName', item)"
                >
                  {{ item }}
                </button>
                <div v-if="!getFilterMatches('stockName').length" class="filter-dropdown-empty">Совпадений нет</div>
              </div>
            </label>
            <label class="filter-lookup">
              <span class="filter-label">Объект</span>
              <input
                :value="filters.stockObject"
                type="text"
                class="filter-input"
                :placeholder="getFilterPlaceholder('stockObject')"
                @focus="openFilterDropdown('stockObject')"
                @input="(e) => updateFilterValue('stockObject', e.target.value)"
              >
              <div v-if="activeFilterDropdown === 'stockObject'" class="filter-dropdown">
                <button
                  v-for="item in getFilterMatches('stockObject')"
                  :key="`stock-object-${item}`"
                  type="button"
                  class="filter-dropdown-item"
                  @mousedown.prevent
                  @click="selectFilterValue('stockObject', item)"
                >
                  {{ item }}
                </button>
                <div v-if="!getFilterMatches('stockObject').length" class="filter-dropdown-empty">Совпадений нет</div>
              </div>
            </label>
            <label class="filter-lookup">
              <span class="filter-label">Товарная категория</span>
              <input
                :value="filters.stockCategory"
                type="text"
                class="filter-input"
                :placeholder="getFilterPlaceholder('stockCategory')"
                @focus="openFilterDropdown('stockCategory')"
                @input="(e) => updateFilterValue('stockCategory', e.target.value)"
              >
              <div v-if="activeFilterDropdown === 'stockCategory'" class="filter-dropdown">
                <button
                  v-for="item in getFilterMatches('stockCategory')"
                  :key="`stock-category-${item}`"
                  type="button"
                  class="filter-dropdown-item"
                  @mousedown.prevent
                  @click="selectFilterValue('stockCategory', item)"
                >
                  {{ item }}
                </button>
                <div v-if="!getFilterMatches('stockCategory').length" class="filter-dropdown-empty">Совпадений нет</div>
              </div>
            </label>
            <label class="filter-lookup">
              <span class="filter-label">Давальческое сырьё</span>
              <select
                v-model="filters.stockToll"
                class="filter-input"
                @focus="activeFilterDropdown = ''"
              >
                <option value="">Все</option>
                <option value="Да">Да</option>
                <option value="Нет">Нет</option>
              </select>
            </label>
            <label class="filter-lookup">
              <span class="filter-label">Компания предоставляющая давальческое сырьё</span>
              <input
                :value="filters.stockTollCompany"
                type="text"
                class="filter-input"
                :placeholder="getFilterPlaceholder('stockTollCompany')"
                @focus="openFilterDropdown('stockTollCompany')"
                @input="(e) => updateFilterValue('stockTollCompany', e.target.value)"
              >
              <div v-if="activeFilterDropdown === 'stockTollCompany'" class="filter-dropdown">
                <button
                  v-for="item in getFilterMatches('stockTollCompany')"
                  :key="`stock-toll-company-${item}`"
                  type="button"
                  class="filter-dropdown-item"
                  @mousedown.prevent
                  @click="selectFilterValue('stockTollCompany', item)"
                >
                  {{ item }}
                </button>
                <div v-if="!getFilterMatches('stockTollCompany').length" class="filter-dropdown-empty">Совпадений нет</div>
              </div>
            </label>
            <label class="filter-toggle">
              <input v-model="hideZeroStock" type="checkbox">
              <span>Не показывать нулевые остатки</span>
            </label>
          </div>
          <table class="table">
            <thead>
              <tr>
                <th>№</th>
                <th>Фото</th>
                <th>Название</th>
                <th>Ед. изм.</th>
                <th>Кол-во</th>
                <th>Давальческое сырьё</th>
                <th>Зарезервировано</th>
                <th>Свободно</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in filteredStockRows" :key="`stock-${row.id}`">
                <td>{{ row.number }}</td>
                <td>
                  <img v-if="row.photoUrl" :src="row.photoUrl" alt="" class="nomenclature-thumb">
                  <div v-else class="thumb-placeholder">
                    <i class="fas fa-image"></i>
                  </div>
                </td>
                <td>
                  <button type="button" class="name-link" @click="openNomenclature(row)">
                    {{ row.name }}
                  </button>
                </td>
                <td>{{ row.unit }}</td>
                <td>{{ formatNumber(row.quantity) }}</td>
                <td>
                  <div v-if="row.tollLines.length" class="reserve-list">
                    <div v-for="item in row.tollLines" :key="item.key" class="reserve-item">
                      <span class="reserve-qty">{{ formatNumber(item.quantity) }}</span>
                      <span class="reserve-sep">—</span>
                      <span class="reserve-label">{{ item.companyName }}</span>
                    </div>
                  </div>
                  <span v-else class="reserve-empty">Нет</span>
                </td>
                <td>
                  <div v-if="row.reservedLines.length" class="reserve-list">
                    <div v-for="item in row.reservedLines" :key="item.key" class="reserve-item">
                      <span class="reserve-qty">{{ formatNumber(item.quantity) }}</span>
                      <span class="reserve-sep">—</span>
                      <span class="reserve-label">{{ item.label }}</span>
                    </div>
                  </div>
                  <span v-else class="reserve-empty">Не зарезервировано</span>
                </td>
                <td>{{ formatNumber(row.free) }}</td>
              </tr>
              <tr v-if="!filteredStockRows.length">
                <td colspan="8" class="table-empty">Данные отсутствуют</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section v-else-if="activeTab === 'nomenclature'" class="table-wrapper">
          <div class="table-toolbar">
            <div class="table-title">Номенклатура</div>
            <div class="toolbar-actions">
              <button type="button" class="secondary-btn" @click="nomenclatureExportOpen = true">
                <i class="fas fa-file-excel"></i>
                Экспорт
              </button>
              <button type="button" class="create-btn" @click="openCreateNomenclature">
                <i class="fas fa-plus"></i>
                Создать номенклатуру
              </button>
            </div>
          </div>
          <div class="table-toolbar table-toolbar-filters">
            <label class="filter-lookup">
              <span class="filter-label">Название</span>
              <input
                :value="filters.nomenclatureName"
                type="text"
                class="filter-input"
                :placeholder="getFilterPlaceholder('nomenclatureName')"
                @focus="openFilterDropdown('nomenclatureName')"
                @input="(e) => updateFilterValue('nomenclatureName', e.target.value)"
              >
              <div v-if="activeFilterDropdown === 'nomenclatureName'" class="filter-dropdown">
                <button
                  v-for="item in getFilterMatches('nomenclatureName')"
                  :key="`nom-name-${item}`"
                  type="button"
                  class="filter-dropdown-item"
                  @mousedown.prevent
                  @click="selectFilterValue('nomenclatureName', item)"
                >
                  {{ item }}
                </button>
                <div v-if="!getFilterMatches('nomenclatureName').length" class="filter-dropdown-empty">Совпадений нет</div>
              </div>
            </label>
            <label class="filter-lookup">
              <span class="filter-label">Товарная категория</span>
              <input
                :value="filters.nomenclatureCategory"
                type="text"
                class="filter-input"
                :placeholder="getFilterPlaceholder('nomenclatureCategory')"
                @focus="openFilterDropdown('nomenclatureCategory')"
                @input="(e) => updateFilterValue('nomenclatureCategory', e.target.value)"
              >
              <div v-if="activeFilterDropdown === 'nomenclatureCategory'" class="filter-dropdown">
                <button
                  v-for="item in getFilterMatches('nomenclatureCategory')"
                  :key="`nomenclature-category-${item}`"
                  type="button"
                  class="filter-dropdown-item"
                  @mousedown.prevent
                  @click="selectFilterValue('nomenclatureCategory', item)"
                >
                  {{ item }}
                </button>
                <div v-if="!getFilterMatches('nomenclatureCategory').length" class="filter-dropdown-empty">Совпадений нет</div>
              </div>
            </label>
            <label class="filter-toggle">
              <input v-model="nomenclatureMissingPriceOpt1" type="checkbox">
              <span>Отсутствует цена опт1</span>
            </label>
            <label class="filter-toggle">
              <input v-model="nomenclatureMissingPriceOpt2" type="checkbox">
              <span>Отсутствует цена опт2</span>
            </label>
            <label class="filter-toggle">
              <input v-model="nomenclatureMissingPriceRetail" type="checkbox">
              <span>Отсутствует цена розница</span>
            </label>
          </div>
          <table class="table">
            <thead>
              <tr>
                <th>№</th>
                <th>Фото</th>
                <th>Название</th>
                <th>Категория</th>
                <th>Ед. изм.</th>
                <th>Цена опт1</th>
                <th>Цена опт2</th>
                <th>Цена розница</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in filteredNomenclatureRows" :key="`nom-${row.id}`">
                <td>{{ row.number }}</td>
                <td>
                  <img v-if="row.photoUrl" :src="row.photoUrl" alt="" class="nomenclature-thumb">
                  <div v-else class="thumb-placeholder">
                    <i class="fas fa-image"></i>
                  </div>
                </td>
                <td>
                  <button type="button" class="name-link" @click="openNomenclature(row)">
                    {{ row.name }}
                  </button>
                </td>
                <td>{{ row.categoryPath || '—' }}</td>
                <td>{{ row.unit }}</td>
                <td>{{ hasPriceValue(row.priceOpt1) ? formatNumber(row.priceOpt1) : '—' }}</td>
                <td>{{ hasPriceValue(row.priceOpt2) ? formatNumber(row.priceOpt2) : '—' }}</td>
                <td>{{ hasPriceValue(row.priceRetail) ? formatNumber(row.priceRetail) : '—' }}</td>
              </tr>
              <tr v-if="!filteredNomenclatureRows.length">
                <td colspan="8" class="table-empty">Данные отсутствуют</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section v-else-if="activeTab === 'categories'" class="table-wrapper">
          <div class="table-toolbar">
            <div class="table-title">Товарные категории</div>
            <button type="button" class="create-btn" @click="openCreateCategory">
              <i class="fas fa-plus"></i>
              Создать категорию
            </button>
          </div>
          <div class="table-toolbar table-toolbar-filters">
            <label class="filter-lookup">
              <span class="filter-label">Категория</span>
              <input
                :value="filters.categoryName"
                type="text"
                class="filter-input"
                :placeholder="getFilterPlaceholder('categoryName')"
                @focus="openFilterDropdown('categoryName')"
                @input="(e) => updateFilterValue('categoryName', e.target.value)"
              >
              <div v-if="activeFilterDropdown === 'categoryName'" class="filter-dropdown">
                <button
                  v-for="item in getFilterMatches('categoryName')"
                  :key="`category-name-${item}`"
                  type="button"
                  class="filter-dropdown-item"
                  @mousedown.prevent
                  @click="selectFilterValue('categoryName', item)"
                >
                  {{ item }}
                </button>
                <div v-if="!getFilterMatches('categoryName').length" class="filter-dropdown-empty">Совпадений нет</div>
              </div>
            </label>
          </div>
          <table class="table">
            <thead>
              <tr>
                <th>№</th>
                <th>Название</th>
                <th>Полный путь</th>
                <th>Родительская категория</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in filteredCategoryTreeRows" :key="`cat-${row.id}`">
                <td>{{ row.number }}</td>
                <td>
                  <span class="tree-name" :style="{ paddingLeft: `${row.depth * 16}px` }">{{ row.name }}</span>
                </td>
                <td>{{ row.pathLabel }}</td>
                <td>{{ parentNameById.get(row.parentId) || '—' }}</td>
                <td>
                  <button type="button" class="name-link" @click="openEditCategory(row)">Изменить</button>
                </td>
              </tr>
              <tr v-if="!filteredCategoryTreeRows.length">
                <td colspan="6" class="table-empty">Данные отсутствуют</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section v-else-if="activeTab === 'incoming'" class="table-wrapper">
          <div class="table-toolbar">
            <div class="table-title">Приходные накладные</div>
            <div class="toolbar-actions">
              <button type="button" class="secondary-btn" @click="clearSectionFilters('incoming')">Сбросить фильтры</button>
              <button type="button" class="create-btn" @click="openCreateWaybill('incoming')">
                <i class="fas fa-plus"></i>
                Создать накладную
              </button>
            </div>
          </div>
          <div class="table-toolbar table-toolbar-filters">
            <label class="filter-lookup">
              <span class="filter-label">Номер</span>
              <input
                :value="filters.incomingNumber"
                type="text"
                class="filter-input"
                :placeholder="getFilterPlaceholder('incomingNumber')"
                @focus="openFilterDropdown('incomingNumber')"
                @input="(e) => updateFilterValue('incomingNumber', e.target.value)"
              >
              <div v-if="activeFilterDropdown === 'incomingNumber'" class="filter-dropdown">
                <button v-for="item in getFilterMatches('incomingNumber')" :key="`incoming-number-${item}`" type="button" class="filter-dropdown-item" @mousedown.prevent @click="selectFilterValue('incomingNumber', item)">{{ item }}</button>
                <div v-if="!getFilterMatches('incomingNumber').length" class="filter-dropdown-empty">Совпадений нет</div>
              </div>
            </label>
            <label class="filter-lookup">
              <span class="filter-label">Дата создания</span>
              <input
                :value="filters.incomingCreatedAt"
                type="date"
                class="filter-input"
                @input="(e) => updateFilterValue('incomingCreatedAt', e.target.value)"
              >
            </label>
            <label class="filter-lookup">
              <span class="filter-label">Дата проведения</span>
              <input
                :value="filters.incomingConductedAt"
                type="date"
                class="filter-input"
                @input="(e) => updateFilterValue('incomingConductedAt', e.target.value)"
              >
            </label>
            <label class="filter-lookup">
              <span class="filter-label">От кого</span>
              <input
                :value="filters.incomingCounterparty"
                type="text"
                class="filter-input"
                :placeholder="getFilterPlaceholder('incomingCounterparty')"
                @focus="openFilterDropdown('incomingCounterparty')"
                @input="(e) => updateFilterValue('incomingCounterparty', e.target.value)"
              >
              <div v-if="activeFilterDropdown === 'incomingCounterparty'" class="filter-dropdown">
                <button v-for="item in getFilterMatches('incomingCounterparty')" :key="`incoming-counterparty-${item}`" type="button" class="filter-dropdown-item" @mousedown.prevent @click="selectFilterValue('incomingCounterparty', item)">{{ item }}</button>
                <div v-if="!getFilterMatches('incomingCounterparty').length" class="filter-dropdown-empty">Совпадений нет</div>
              </div>
            </label>
            <label class="filter-lookup">
              <span class="filter-label">На кого</span>
              <input
                :value="filters.incomingTo"
                type="text"
                class="filter-input"
                :placeholder="getFilterPlaceholder('incomingTo')"
                @focus="openFilterDropdown('incomingTo')"
                @input="(e) => updateFilterValue('incomingTo', e.target.value)"
              >
              <div v-if="activeFilterDropdown === 'incomingTo'" class="filter-dropdown">
                <button v-for="item in getFilterMatches('incomingTo')" :key="`incoming-to-${item}`" type="button" class="filter-dropdown-item" @mousedown.prevent @click="selectFilterValue('incomingTo', item)">{{ item }}</button>
                <div v-if="!getFilterMatches('incomingTo').length" class="filter-dropdown-empty">Совпадений нет</div>
              </div>
            </label>
            <label class="filter-lookup">
              <span class="filter-label">Объект строительства</span>
              <input
                :value="filters.incomingObject"
                type="text"
                class="filter-input"
                :placeholder="getFilterPlaceholder('incomingObject')"
                @focus="openFilterDropdown('incomingObject')"
                @input="(e) => updateFilterValue('incomingObject', e.target.value)"
              >
              <div v-if="activeFilterDropdown === 'incomingObject'" class="filter-dropdown">
                <button v-for="item in getFilterMatches('incomingObject')" :key="`incoming-object-${item}`" type="button" class="filter-dropdown-item" @mousedown.prevent @click="selectFilterValue('incomingObject', item)">{{ item }}</button>
                <div v-if="!getFilterMatches('incomingObject').length" class="filter-dropdown-empty">Совпадений нет</div>
              </div>
            </label>
            <label class="filter-lookup">
              <span class="filter-label">Статус</span>
              <select
                :value="filters.incomingStatus"
                class="filter-input"
                @change="updateFilterValue('incomingStatus', $event.target.value)"
              >
                <option value="">Все статусы</option>
                <option v-for="item in getFilterOptions('incomingStatus')" :key="`incoming-status-${item}`" :value="item">{{ item }}</option>
              </select>
            </label>
            <label class="filter-lookup">
              <span class="filter-label">Давальческое сырьё</span>
              <select
                v-model="filters.incomingToll"
                class="filter-input"
                @focus="activeFilterDropdown = ''"
              >
                <option value="">Все</option>
                <option value="Да">Да</option>
                <option value="Нет">Нет</option>
              </select>
            </label>
            <label class="filter-lookup">
              <span class="filter-label">Компания предоставляющая давальческое сырьё</span>
              <input
                :value="filters.incomingTollCompany"
                type="text"
                class="filter-input"
                :placeholder="getFilterPlaceholder('incomingTollCompany')"
                @focus="openFilterDropdown('incomingTollCompany')"
                @input="(e) => updateFilterValue('incomingTollCompany', e.target.value)"
              >
              <div v-if="activeFilterDropdown === 'incomingTollCompany'" class="filter-dropdown">
                <button v-for="item in getFilterMatches('incomingTollCompany')" :key="`incoming-toll-company-${item}`" type="button" class="filter-dropdown-item" @mousedown.prevent @click="selectFilterValue('incomingTollCompany', item)">{{ item }}</button>
                <div v-if="!getFilterMatches('incomingTollCompany').length" class="filter-dropdown-empty">Совпадений нет</div>
              </div>
            </label>
          </div>
          <table class="table">
            <thead>
              <tr>
                <th>Номер</th>
                <th>Даты</th>
                <th>От кого</th>
                <th>На кого</th>
                <th>Объект строительства</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in filteredIncomingRows" :key="`incoming-${row.id}`">
                <td>
                  <div class="waybill-number">
                    <button type="button" class="waybill-link" @click="openWaybill(row, 'incoming')">
                      {{ row.number }}
                    </button>
                    <span
                      v-if="row.toll"
                      class="toll-badge"
                      :title="row.tollCompanyName || 'Давальческое сырьё'"
                    >
                      ДС
                    </span>
                  </div>
                  <div v-if="row.deliveryId" class="delivery-badge">На основании доставки #{{ row.deliveryId }}</div>
                </td>
                <td>
                  <div class="date-line"><span>Дата создания:</span> {{ formatDate(row.createdAt) }}</div>
                  <div class="date-line"><span>Дата проведения:</span> {{ formatDate(row.conductedAt) }}</div>
                </td>
                <td>{{ row.counterparty }}</td>
                <td>{{ row.toName || '—' }}</td>
                <td>{{ row.objectName }}</td>
                <td>
                  <span class="status-pill" :class="`status-${row.status.key}`">{{ row.status.label }}</span>
                </td>
              </tr>
              <tr v-if="!filteredIncomingRows.length">
                <td colspan="6" class="table-empty">Данные отсутствуют</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section v-else-if="activeTab === 'outgoing'" class="table-wrapper">
          <div class="table-toolbar">
            <div class="table-title">Расходные накладные</div>
            <div class="toolbar-actions">
              <button type="button" class="secondary-btn" @click="clearSectionFilters('outgoing')">Сбросить фильтры</button>
              <button type="button" class="create-btn" @click="openCreateWaybill('outgoing')">
                <i class="fas fa-plus"></i>
                Создать накладную
              </button>
            </div>
          </div>
          <div class="table-toolbar table-toolbar-filters">
            <label class="filter-lookup">
              <span class="filter-label">Номер</span>
              <input
                :value="filters.outgoingNumber"
                type="text"
                class="filter-input"
                :placeholder="getFilterPlaceholder('outgoingNumber')"
                @focus="openFilterDropdown('outgoingNumber')"
                @input="(e) => updateFilterValue('outgoingNumber', e.target.value)"
              >
              <div v-if="activeFilterDropdown === 'outgoingNumber'" class="filter-dropdown">
                <button v-for="item in getFilterMatches('outgoingNumber')" :key="`outgoing-number-${item}`" type="button" class="filter-dropdown-item" @mousedown.prevent @click="selectFilterValue('outgoingNumber', item)">{{ item }}</button>
                <div v-if="!getFilterMatches('outgoingNumber').length" class="filter-dropdown-empty">Совпадений нет</div>
              </div>
            </label>
            <label class="filter-lookup">
              <span class="filter-label">Дата создания</span>
              <input
                :value="filters.outgoingCreatedAt"
                type="date"
                class="filter-input"
                @input="(e) => updateFilterValue('outgoingCreatedAt', e.target.value)"
              >
            </label>
            <label class="filter-lookup">
              <span class="filter-label">Дата проведения</span>
              <input
                :value="filters.outgoingConductedAt"
                type="date"
                class="filter-input"
                @input="(e) => updateFilterValue('outgoingConductedAt', e.target.value)"
              >
            </label>
            <label class="filter-lookup">
              <span class="filter-label">Кому</span>
              <input
                :value="filters.outgoingCounterparty"
                type="text"
                class="filter-input"
                :placeholder="getFilterPlaceholder('outgoingCounterparty')"
                @focus="openFilterDropdown('outgoingCounterparty')"
                @input="(e) => updateFilterValue('outgoingCounterparty', e.target.value)"
              >
              <div v-if="activeFilterDropdown === 'outgoingCounterparty'" class="filter-dropdown">
                <button v-for="item in getFilterMatches('outgoingCounterparty')" :key="`outgoing-counterparty-${item}`" type="button" class="filter-dropdown-item" @mousedown.prevent @click="selectFilterValue('outgoingCounterparty', item)">{{ item }}</button>
                <div v-if="!getFilterMatches('outgoingCounterparty').length" class="filter-dropdown-empty">Совпадений нет</div>
              </div>
            </label>
            <label class="filter-lookup">
              <span class="filter-label">На кого списывать</span>
              <input
                :value="filters.outgoingWhoWriteOff"
                type="text"
                class="filter-input"
                :placeholder="getFilterPlaceholder('outgoingWhoWriteOff')"
                @focus="openFilterDropdown('outgoingWhoWriteOff')"
                @input="(e) => updateFilterValue('outgoingWhoWriteOff', e.target.value)"
              >
              <div v-if="activeFilterDropdown === 'outgoingWhoWriteOff'" class="filter-dropdown">
                <button v-for="item in getFilterMatches('outgoingWhoWriteOff')" :key="`outgoing-writeoff-${item}`" type="button" class="filter-dropdown-item" @mousedown.prevent @click="selectFilterValue('outgoingWhoWriteOff', item)">{{ item }}</button>
                <div v-if="!getFilterMatches('outgoingWhoWriteOff').length" class="filter-dropdown-empty">Совпадений нет</div>
              </div>
            </label>
            <label class="filter-lookup">
              <span class="filter-label">Объект строительства</span>
              <input
                :value="filters.outgoingObject"
                type="text"
                class="filter-input"
                :placeholder="getFilterPlaceholder('outgoingObject')"
                @focus="openFilterDropdown('outgoingObject')"
                @input="(e) => updateFilterValue('outgoingObject', e.target.value)"
              >
              <div v-if="activeFilterDropdown === 'outgoingObject'" class="filter-dropdown">
                <button v-for="item in getFilterMatches('outgoingObject')" :key="`outgoing-object-${item}`" type="button" class="filter-dropdown-item" @mousedown.prevent @click="selectFilterValue('outgoingObject', item)">{{ item }}</button>
                <div v-if="!getFilterMatches('outgoingObject').length" class="filter-dropdown-empty">Совпадений нет</div>
              </div>
            </label>
            <label class="filter-lookup">
              <span class="filter-label">Статус</span>
              <select
                :value="filters.outgoingStatus"
                class="filter-input"
                @change="updateFilterValue('outgoingStatus', $event.target.value)"
              >
                <option value="">Все статусы</option>
                <option v-for="item in getFilterOptions('outgoingStatus')" :key="`outgoing-status-${item}`" :value="item">{{ item }}</option>
              </select>
            </label>
          </div>
          <table class="table">
            <thead>
              <tr>
                <th>Номер</th>
                <th>Даты</th>
                <th>Кому</th>
                <th>На кого списывать</th>
                <th>Объект строительства</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in filteredOutgoingRows" :key="`outgoing-${row.id}`">
                <td>
                  <button type="button" class="waybill-link" @click="openWaybill(row, 'outgoing')">
                    {{ row.number }}
                  </button>
                  <div v-if="row.deliveryId" class="delivery-badge">На основании доставки #{{ row.deliveryId }}</div>
                </td>
                <td>
                  <div class="date-line"><span>Дата создания:</span> {{ formatDate(row.createdAt) }}</div>
                  <div class="date-line"><span>Дата проведения:</span> {{ formatDate(row.conductedAt) }}</div>
                </td>
                <td>{{ row.counterparty }}</td>
                <td>{{ row.whoWriteOff || '—' }}</td>
                <td>{{ row.objectName }}</td>
                <td>
                  <span class="status-pill" :class="`status-${row.status.key}`">{{ row.status.label }}</span>
                </td>
              </tr>
              <tr v-if="!filteredOutgoingRows.length">
                <td colspan="5" class="table-empty">Данные отсутствуют</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section v-else-if="activeTab === 'returns'" class="table-wrapper">
          <div class="table-toolbar">
            <div class="table-title">Возвратные накладные</div>
            <button type="button" class="create-btn" @click="openCreateWaybill('returns')">
              <i class="fas fa-plus"></i>
              Создать накладную
            </button>
          </div>
          <div class="table-toolbar table-toolbar-filters">
            <label class="filter-lookup">
              <span class="filter-label">Номер</span>
              <input
                :value="filters.returnsNumber"
                type="text"
                class="filter-input"
                :placeholder="getFilterPlaceholder('returnsNumber')"
                @focus="openFilterDropdown('returnsNumber')"
                @input="(e) => updateFilterValue('returnsNumber', e.target.value)"
              >
              <div v-if="activeFilterDropdown === 'returnsNumber'" class="filter-dropdown">
                <button v-for="item in getFilterMatches('returnsNumber')" :key="`returns-number-${item}`" type="button" class="filter-dropdown-item" @mousedown.prevent @click="selectFilterValue('returnsNumber', item)">{{ item }}</button>
                <div v-if="!getFilterMatches('returnsNumber').length" class="filter-dropdown-empty">Совпадений нет</div>
              </div>
            </label>
            <label class="filter-lookup">
              <span class="filter-label">Дата создания</span>
              <input
                :value="filters.returnsCreatedAt"
                type="date"
                class="filter-input"
                @input="(e) => updateFilterValue('returnsCreatedAt', e.target.value)"
              >
            </label>
            <label class="filter-lookup">
              <span class="filter-label">Дата проведения</span>
              <input
                :value="filters.returnsConductedAt"
                type="date"
                class="filter-input"
                @input="(e) => updateFilterValue('returnsConductedAt', e.target.value)"
              >
            </label>
            <label class="filter-lookup">
              <span class="filter-label">От кого</span>
              <input
                :value="filters.returnsCounterparty"
                type="text"
                class="filter-input"
                :placeholder="getFilterPlaceholder('returnsCounterparty')"
                @focus="openFilterDropdown('returnsCounterparty')"
                @input="(e) => updateFilterValue('returnsCounterparty', e.target.value)"
              >
              <div v-if="activeFilterDropdown === 'returnsCounterparty'" class="filter-dropdown">
                <button v-for="item in getFilterMatches('returnsCounterparty')" :key="`returns-counterparty-${item}`" type="button" class="filter-dropdown-item" @mousedown.prevent @click="selectFilterValue('returnsCounterparty', item)">{{ item }}</button>
                <div v-if="!getFilterMatches('returnsCounterparty').length" class="filter-dropdown-empty">Совпадений нет</div>
              </div>
            </label>
            <label class="filter-lookup">
              <span class="filter-label">Статус</span>
              <select
                :value="filters.returnsStatus"
                class="filter-input"
                @change="updateFilterValue('returnsStatus', $event.target.value)"
              >
                <option value="">Все статусы</option>
                <option v-for="item in getFilterOptions('returnsStatus')" :key="`returns-status-${item}`" :value="item">{{ item }}</option>
              </select>
            </label>
          </div>
          <table class="table">
            <thead>
              <tr>
                <th>Номер</th>
                <th>Даты</th>
                <th>От кого</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in filteredReturnRows" :key="`returns-${row.id}`">
                <td>
                  <button type="button" class="waybill-link" @click="openWaybill(row, 'returns')">
                    {{ row.number }}
                  </button>
                  <div v-if="row.deliveryId" class="delivery-badge">На основании доставки #{{ row.deliveryId }}</div>
                </td>
                <td>
                  <div class="date-line"><span>Дата создания:</span> {{ formatDate(row.createdAt) }}</div>
                  <div class="date-line"><span>Дата проведения:</span> {{ formatDate(row.conductedAt) }}</div>
                </td>
                <td>{{ row.counterparty }}</td>
                <td>
                  <span class="status-pill" :class="`status-${row.status.key}`">{{ row.status.label }}</span>
                </td>
              </tr>
              <tr v-if="!filteredReturnRows.length">
                <td colspan="4" class="table-empty">Данные отсутствуют</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section v-else-if="activeTab === 'inventory'" class="table-wrapper">
          <div class="table-toolbar">
            <div class="table-title">Накладные инвентаризации</div>
            <div class="toolbar-actions">
              <button type="button" class="secondary-btn" @click="clearSectionFilters('inventory')">Сбросить фильтры</button>
              <button type="button" class="create-btn" @click="openCreateWaybill('inventory')">
                <i class="fas fa-plus"></i>
                Создать накладную
              </button>
            </div>
          </div>
          <div class="table-toolbar table-toolbar-filters">
            <label class="filter-lookup">
              <span class="filter-label">Номер</span>
              <input
                :value="filters.inventoryNumber"
                type="text"
                class="filter-input"
                :placeholder="getFilterPlaceholder('inventoryNumber')"
                @focus="openFilterDropdown('inventoryNumber')"
                @input="(e) => updateFilterValue('inventoryNumber', e.target.value)"
              >
              <div v-if="activeFilterDropdown === 'inventoryNumber'" class="filter-dropdown">
                <button v-for="item in getFilterMatches('inventoryNumber')" :key="`inventory-number-${item}`" type="button" class="filter-dropdown-item" @mousedown.prevent @click="selectFilterValue('inventoryNumber', item)">{{ item }}</button>
                <div v-if="!getFilterMatches('inventoryNumber').length" class="filter-dropdown-empty">Совпадений нет</div>
              </div>
            </label>
            <label class="filter-lookup">
              <span class="filter-label">Дата создания</span>
              <input
                :value="filters.inventoryCreatedAt"
                type="date"
                class="filter-input"
                @input="(e) => updateFilterValue('inventoryCreatedAt', e.target.value)"
              >
            </label>
            <label class="filter-lookup">
              <span class="filter-label">Дата проведения</span>
              <input
                :value="filters.inventoryConductedAt"
                type="date"
                class="filter-input"
                @input="(e) => updateFilterValue('inventoryConductedAt', e.target.value)"
              >
            </label>
            <label class="filter-lookup">
              <span class="filter-label">Статус</span>
              <select
                :value="filters.inventoryStatus"
                class="filter-input"
                @change="updateFilterValue('inventoryStatus', $event.target.value)"
              >
                <option value="">Все статусы</option>
                <option v-for="item in getFilterOptions('inventoryStatus')" :key="`inventory-status-${item}`" :value="item">{{ item }}</option>
              </select>
            </label>
          </div>
          <table class="table">
            <thead>
              <tr>
                <th>Номер</th>
                <th>Даты</th>
                <th>Объект строительства</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in filteredInventoryRows" :key="`inventory-${row.id}`">
                <td>
                  <button type="button" class="waybill-link" @click="openWaybill(row, 'inventory')">
                    {{ row.number }}
                  </button>
                </td>
                <td>
                  <div class="date-line"><span>Дата создания:</span> {{ formatDate(row.createdAt) }}</div>
                  <div class="date-line"><span>Дата проведения:</span> {{ formatDate(row.conductedAt) }}</div>
                </td>
                <td>{{ row.objectName }}</td>
                <td>
                  <span class="status-pill" :class="`status-${row.status.key}`">{{ row.status.label }}</span>
                </td>
              </tr>
              <tr v-if="!filteredInventoryRows.length">
                <td colspan="4" class="table-empty">Данные отсутствуют</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section v-else-if="activeTab === 'deliveries'" class="table-wrapper">
          <div class="table-toolbar">
            <div class="table-title">Доставки</div>
          </div>
          <div class="delivery-subtabs">
            <button
              type="button"
              class="delivery-subtab"
              :class="{ active: deliveriesSubtab === 'incoming' }"
              @click="deliveriesSubtab = 'incoming'"
            >
              Ожидающие доставки
            </button>
            <button
              type="button"
              class="delivery-subtab"
              :class="{ active: deliveriesSubtab === 'outgoing' }"
              @click="deliveriesSubtab = 'outgoing'"
            >
              Ожидающие отправления
            </button>
          </div>
          <table class="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Проект</th>
                <th>Заявка / Счет</th>
                <th>Откуда</th>
                <th>Куда</th>
                <th>Перевозчик / Водитель</th>
                <th>Даты</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in (deliveriesSubtab === 'incoming' ? incomingDeliveryRows : outgoingDeliveryRows)"
                :key="`delivery-${deliveriesSubtab}-${row.id}`"
              >
                <td>
                  <button type="button" class="waybill-link" @click="openDelivery(row)">
                    {{ row.number }}
                  </button>
                </td>
                <td>{{ row.projectName }}</td>
                <td>
                  <div class="date-line"><span>Заявка:</span> {{ row.requestName }}</div>
                  <div class="date-line"><span>Счёт:</span> {{ row.invoiceName }}</div>
                </td>
                <td>{{ row.fromName }}</td>
                <td>{{ row.toName }}</td>
                <td>
                  <div>{{ row.carrier }}</div>
                  <div class="subtle-line">{{ row.driver }}</div>
                </td>
                <td>
                  <div class="date-line"><span>Создано:</span> {{ formatDate(row.createdAt) }}</div>
                  <div class="date-line"><span>Забрать:</span> {{ formatDate(row.pickUpDate) }}</div>
                  <div class="date-line"><span>Доставка:</span> {{ formatDate(row.deliveryFrom) }}<template v-if="row.deliveryTo && formatDate(row.deliveryTo) !== formatDate(row.deliveryFrom)"> — {{ formatDate(row.deliveryTo) }}</template></div>
                </td>
              </tr>
              <tr v-if="!(deliveriesSubtab === 'incoming' ? incomingDeliveryRows : outgoingDeliveryRows).length">
                <td colspan="7" class="table-empty">Данные отсутствуют</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section v-else-if="activeTab === 'documents'" class="table-wrapper">
          <div class="table-toolbar">
            <div class="table-title">Документы</div>
            <div class="toolbar-actions">
              <button type="button" class="secondary-btn" @click="clearSectionFilters('documents')">Сбросить фильтры</button>
              <button type="button" class="create-btn" @click="openUploadModal">
                <i class="fas fa-plus"></i>
                Добавить
              </button>
            </div>
          </div>
          <div class="table-toolbar table-toolbar-filters">
            <label class="filter-lookup">
              <span class="filter-label">Номер</span>
              <input
                :value="filters.documentsNumber"
                type="text"
                class="filter-input"
                :placeholder="getFilterPlaceholder('documentsNumber')"
                @focus="openFilterDropdown('documentsNumber')"
                @input="(e) => updateFilterValue('documentsNumber', e.target.value)"
              >
              <div v-if="activeFilterDropdown === 'documentsNumber'" class="filter-dropdown">
                <button v-for="item in getFilterMatches('documentsNumber')" :key="`documents-number-${item}`" type="button" class="filter-dropdown-item" @mousedown.prevent @click="selectFilterValue('documentsNumber', item)">{{ item }}</button>
                <div v-if="!getFilterMatches('documentsNumber').length" class="filter-dropdown-empty">Совпадений нет</div>
              </div>
            </label>
            <label class="filter-lookup">
              <span class="filter-label">Покупатель</span>
              <input
                :value="filters.documentsPayer"
                type="text"
                class="filter-input"
                :placeholder="getFilterPlaceholder('documentsPayer')"
                @focus="openFilterDropdown('documentsPayer')"
                @input="(e) => updateFilterValue('documentsPayer', e.target.value)"
              >
              <div v-if="activeFilterDropdown === 'documentsPayer'" class="filter-dropdown">
                <button v-for="item in getFilterMatches('documentsPayer')" :key="`documents-payer-${item}`" type="button" class="filter-dropdown-item" @mousedown.prevent @click="selectFilterValue('documentsPayer', item)">{{ item }}</button>
                <div v-if="!getFilterMatches('documentsPayer').length" class="filter-dropdown-empty">Совпадений нет</div>
              </div>
            </label>
            <label class="filter-lookup">
              <span class="filter-label">Поставщик</span>
              <input
                :value="filters.documentsProvider"
                type="text"
                class="filter-input"
                :placeholder="getFilterPlaceholder('documentsProvider')"
                @focus="openFilterDropdown('documentsProvider')"
                @input="(e) => updateFilterValue('documentsProvider', e.target.value)"
              >
              <div v-if="activeFilterDropdown === 'documentsProvider'" class="filter-dropdown">
                <button v-for="item in getFilterMatches('documentsProvider')" :key="`documents-provider-${item}`" type="button" class="filter-dropdown-item" @mousedown.prevent @click="selectFilterValue('documentsProvider', item)">{{ item }}</button>
                <div v-if="!getFilterMatches('documentsProvider').length" class="filter-dropdown-empty">Совпадений нет</div>
              </div>
            </label>
            <label class="filter-lookup">
              <span class="filter-label">Создатель</span>
              <input
                :value="filters.documentsCreator"
                type="text"
                class="filter-input"
                :placeholder="getFilterPlaceholder('documentsCreator')"
                @focus="openFilterDropdown('documentsCreator')"
                @input="(e) => updateFilterValue('documentsCreator', e.target.value)"
              >
              <div v-if="activeFilterDropdown === 'documentsCreator'" class="filter-dropdown">
                <button v-for="item in getFilterMatches('documentsCreator')" :key="`documents-creator-${item}`" type="button" class="filter-dropdown-item" @mousedown.prevent @click="selectFilterValue('documentsCreator', item)">{{ item }}</button>
                <div v-if="!getFilterMatches('documentsCreator').length" class="filter-dropdown-empty">Совпадений нет</div>
              </div>
            </label>
            <label class="filter-lookup">
              <span class="filter-label">Дата</span>
              <input
                :value="filters.documentsCreatedAt"
                type="date"
                class="filter-input"
                @input="(e) => updateFilterValue('documentsCreatedAt', e.target.value)"
              >
            </label>
            <label class="filter-lookup">
              <span class="filter-label">Статус</span>
              <select
                :value="filters.documentsStatus"
                class="filter-input"
                @change="updateFilterValue('documentsStatus', $event.target.value)"
              >
                <option value="">Все статусы</option>
                <option v-for="item in getFilterOptions('documentsStatus')" :key="`documents-status-${item}`" :value="item">{{ item }}</option>
              </select>
            </label>
          </div>
          <table class="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Номер</th>
                <th>Покупатель</th>
                <th>Поставщик</th>
                <th>Создатель</th>
                <th>Дата</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in filteredDocumentRows" :key="`doc-${row.documentId}`">
                <td>
                  <button type="button" class="waybill-link" @click="openDocument(row)">
                    {{ row.id || '—' }}
                  </button>
                </td>
                <td>{{ row.number }}</td>
                <td>{{ row.payerName }}</td>
                <td>{{ row.providerName }}</td>
                <td>{{ row.creator }}</td>
                <td>{{ formatDate(row.createdAt) }}</td>
                <td>
                  <span class="status-pill" :class="`status-${row.status.key}`">{{ row.status.label }}</span>
                </td>
              </tr>
              <tr v-if="!filteredDocumentRows.length">
                <td colspan="7" class="table-empty">Документы пока не загружены</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section v-else class="stub-card">
          Раздел будет добавлен следующим этапом.
        </section>
      </template>
    </main>

    <div v-if="uploadModalOpen" class="modal-overlay" @click.self="closeUploadModal">
      <div class="modal-card">
        <div class="modal-head">
          <h2>Добавить документ</h2>
          <button type="button" class="modal-close" @click="closeUploadModal">
            <i class="fas fa-xmark"></i>
          </button>
        </div>
        <div class="modal-body">
          <label class="modal-field modal-lookup-field">
            <span>Продавец</span>
            <input
              :value="uploadProvider.name"
              type="text"
              class="modal-text-input"
              placeholder="Начните вводить продавца"
              @focus="openUploadCounterpartyDropdown('provider')"
              @input="onUploadCounterpartyInput('provider', $event)"
              @blur="setTimeout(() => { uploadProviderOpen = false }, 150)"
            >
            <div v-if="uploadProviderOpen" class="modal-dropdown">
              <button type="button" class="modal-dropdown-item create" @mousedown.prevent="openCreateCounterparty">
                + Создать контрагента
              </button>
              <div v-if="uploadProviderLoading" class="modal-dropdown-empty">Загрузка...</div>
              <template v-else>
                <button
                  v-for="item in uploadProviderOptions"
                  :key="`provider-${item.id}`"
                  type="button"
                  class="modal-dropdown-item"
                  @mousedown.prevent="selectUploadCounterparty('provider', item)"
                >
                  {{ item.name }}
                </button>
                <div v-if="!uploadProviderOptions.length" class="modal-dropdown-empty">Совпадений нет</div>
              </template>
            </div>
          </label>

          <label class="modal-field modal-lookup-field">
            <span>Покупатель</span>
            <input
              :value="uploadPayer.name"
              type="text"
              class="modal-text-input"
              placeholder="Начните вводить покупателя"
              @focus="openUploadCounterpartyDropdown('payer')"
              @input="onUploadCounterpartyInput('payer', $event)"
              @blur="setTimeout(() => { uploadPayerOpen = false }, 150)"
            >
            <div v-if="uploadPayerOpen" class="modal-dropdown">
              <button type="button" class="modal-dropdown-item create" @mousedown.prevent="openCreateCounterparty">
                + Создать контрагента
              </button>
              <div v-if="uploadPayerLoading" class="modal-dropdown-empty">Загрузка...</div>
              <template v-else>
                <button
                  v-for="item in uploadPayerOptions"
                  :key="`payer-${item.id}`"
                  type="button"
                  class="modal-dropdown-item"
                  @mousedown.prevent="selectUploadCounterparty('payer', item)"
                >
                  {{ item.name }}
                </button>
                <div v-if="!uploadPayerOptions.length" class="modal-dropdown-empty">Совпадений нет</div>
              </template>
            </div>
          </label>

          <label class="modal-field">
            <span>PDF файл</span>
            <input ref="uploadInputRef" type="file" accept="application/pdf,.pdf" @change="onPickUploadFile">
          </label>
          <div v-if="uploadFile" class="file-note">{{ uploadFile.name }}</div>
          <div v-if="uploadError" class="upload-error">{{ uploadError }}</div>
        </div>
        <div class="modal-actions">
          <button type="button" class="ghost-btn" :disabled="uploadLoading" @click="closeUploadModal">Отмена</button>
          <button type="button" class="create-btn" :disabled="uploadLoading" @click="submitUpload">
            {{ uploadLoading ? 'Загрузка...' : 'Загрузить' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="uploadLoading" class="screen-loader">
      <div class="screen-loader__card">
        <div class="screen-loader__spinner"></div>
        <div>Загружаем документ, пожалуйста подождите...</div>
      </div>
    </div>

    <div v-if="nomenclatureExportOpen" class="modal-overlay" @click.self="closeNomenclatureExportModal">
      <div class="modal-card">
        <div class="modal-head">
          <h2>Экспорт номенклатуры</h2>
          <button type="button" class="modal-close" @click="closeNomenclatureExportModal">
            <i class="fas fa-xmark"></i>
          </button>
        </div>
        <div class="modal-body">
          <div class="modal-note">Будут экспортированы только строки с учетом текущих фильтров.</div>
          <label v-for="column in nomenclatureExportColumns" :key="column.key" class="modal-checkbox">
            <input v-model="column.enabled" type="checkbox">
            <span>{{ column.label }}</span>
          </label>
        </div>
        <div class="modal-actions">
          <button type="button" class="ghost-btn" :disabled="nomenclatureExportLoading" @click="closeNomenclatureExportModal">Отмена</button>
          <button type="button" class="create-btn" :disabled="nomenclatureExportLoading" @click="exportNomenclatureRows">
            {{ nomenclatureExportLoading ? 'Экспорт...' : 'Скачать .xlsx' }}
          </button>
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

.page-subtitle {
  margin-top: 4px;
  font-size: 13px;
  color: var(--text-secondary);
}

.tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.tab-btn {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  padding: 7px 11px;
  cursor: pointer;
  font-size: 13px;
}

.tab-btn.active {
  border-color: var(--brand-primary);
  background: color-mix(in srgb, var(--brand-primary) 12%, #fff);
  color: var(--brand-primary);
  font-weight: 600;
}

.table-wrapper {
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: 12px;
  overflow: auto;
}

.table-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-bottom: 1px solid var(--border-light);
}

.table-toolbar-filters {
  justify-content: flex-start;
  border-bottom: 1px solid var(--border-light);
  background: var(--bg-surface);
  flex-wrap: wrap;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.secondary-btn {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 11px;
  font-size: 13px;
  cursor: pointer;
}

.secondary-btn:hover {
  border-color: var(--brand-primary);
  color: var(--brand-primary);
}

.filter-lookup {
  position: relative;
  min-width: 180px;
  flex: 0 1 220px;
}

.filter-toggle {
  min-height: 36px;
  align-self: flex-end;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 2px 2px;
  color: var(--text-secondary);
  font-size: 13px;
  user-select: none;
}

.filter-toggle input {
  width: 16px;
  height: 16px;
  accent-color: var(--brand-primary);
}

.filter-label {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.filter-input {
  min-height: 36px;
  border-radius: 8px;
  border: 1px solid var(--border-light);
  background: var(--bg-subtle);
  color: var(--text-primary);
  padding: 0 10px;
  width: 100%;
}

.filter-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: 30;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background: var(--bg-surface);
  box-shadow: 0 18px 36px rgba(15, 23, 42, 0.12);
  overflow: hidden;
  max-height: 280px;
  overflow-y: auto;
}

.filter-dropdown-item {
  width: 100%;
  border: none;
  background: transparent;
  text-align: left;
  padding: 10px 12px;
  cursor: pointer;
  color: var(--text-primary);
}

.filter-dropdown-item:hover {
  background: var(--bg-subtle);
}

.filter-dropdown-empty {
  padding: 10px 12px;
  color: var(--text-tertiary);
  font-size: 12px;
}

.table-title {
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 600;
}

.delivery-subtabs {
  display: flex;
  gap: 8px;
  padding: 12px;
  border-bottom: 1px solid var(--border-light);
  background: var(--bg-subtle);
}

.delivery-subtab {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  padding: 7px 11px;
  cursor: pointer;
  font-size: 13px;
}

.delivery-subtab.active {
  border-color: var(--brand-primary);
  background: color-mix(in srgb, var(--brand-primary) 12%, #fff);
  color: var(--brand-primary);
  font-weight: 600;
}

.create-btn {
  border: 1px solid var(--brand-primary);
  border-radius: 8px;
  background: var(--brand-primary);
  color: #fff;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 11px;
  font-size: 13px;
  cursor: pointer;
}

.name-link {
  border: none;
  background: transparent;
  padding: 0;
  color: var(--brand-primary);
  cursor: pointer;
  text-decoration: none;
}

.tree-name {
  display: inline-block;
}

.waybill-link {
  border: none;
  background: transparent;
  padding: 0;
  font-weight: 600;
  color: var(--brand-primary);
  cursor: pointer;
  text-decoration: none;
}

.waybill-number {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.toll-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--warning-bg) 70%, #fff);
  color: var(--warning-text);
  border: 1px solid color-mix(in srgb, var(--warning-text) 28%, var(--border-light));
  font-size: 10px;
  font-weight: 700;
  cursor: help;
}

.delivery-badge {
  margin-top: 6px;
  display: inline-flex;
  align-items: center;
  border: 1px solid color-mix(in srgb, var(--brand-primary) 35%, var(--border-light));
  border-radius: 999px;
  background: color-mix(in srgb, var(--brand-primary) 8%, #fff);
  color: var(--brand-primary);
  font-size: 11px;
  padding: 2px 8px;
}

.date-line {
  font-size: 12px;
  color: var(--text-secondary);
}

.date-line + .date-line {
  margin-top: 4px;
}

.date-line span {
  color: var(--text-tertiary);
}

.subtle-line {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.status-pill {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 12px;
  border: 1px solid transparent;
}

.status-draft {
  background: #f1f5f9;
  color: #475569;
  border-color: #cbd5e1;
}

.status-posted {
  background: #ecfdf5;
  color: #166534;
  border-color: #86efac;
}

.status-processing {
  background: #fff7ed;
  color: #c2410c;
  border-color: #fdba74;
}

.status-error {
  background: #fef2f2;
  color: #b91c1c;
  border-color: #fca5a5;
}

.nomenclature-thumb,
.thumb-placeholder {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  border: 1px solid var(--border-light);
  background: var(--bg-subtle);
}

.nomenclature-thumb {
  display: block;
  object-fit: cover;
}

.thumb-placeholder {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
}

.table {
  width: 100%;
  border-collapse: collapse;
  min-width: 760px;
}

.table th,
.table td {
  border-bottom: 1px solid var(--border-light);
  padding: 12px;
  text-align: left;
  vertical-align: top;
}

.table th {
  background: var(--bg-subtle);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.table td {
  font-size: 13px;
  color: var(--text-primary);
}

.table tr:last-child td {
  border-bottom: none;
}

.table-state {
  padding: 18px 14px;
  color: var(--text-secondary);
}

.table-state.error {
  color: var(--danger-text);
}

.table-empty {
  text-align: center;
  color: var(--text-tertiary);
}

.reserve-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.reserve-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  padding: 6px 8px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--brand-primary) 8%, #fff);
  border: 1px solid color-mix(in srgb, var(--brand-primary) 18%, var(--border-light));
}

.reserve-qty {
  font-weight: 600;
  color: var(--text-primary);
}

.reserve-sep {
  color: var(--text-tertiary);
}

.reserve-label {
  color: var(--text-secondary);
}

.reserve-empty {
  color: var(--text-tertiary);
}

.stub-card {
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: var(--bg-surface);
  padding: 18px 14px;
  color: var(--text-secondary);
}

.modal-overlay,
.screen-loader {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.36);
}

.modal-card,
.screen-loader__card {
  width: min(100%, 480px);
  border-radius: 16px;
  background: var(--bg-surface);
  box-shadow: 0 24px 48px rgba(15, 23, 42, 0.22);
}

.modal-head,
.modal-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
}

.modal-head {
  border-bottom: 1px solid var(--border-light);
}

.modal-head h2 {
  margin: 0;
  font-size: 18px;
}

.modal-body {
  padding: 18px;
  display: grid;
  gap: 12px;
}

.modal-note {
  font-size: 13px;
  color: var(--text-secondary);
}

.modal-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  color: var(--text-primary);
}

.modal-checkbox input {
  width: 16px;
  height: 16px;
  accent-color: var(--brand-primary);
}

.modal-field {
  display: grid;
  gap: 8px;
}

.modal-field span {
  font-size: 12px;
  color: var(--text-secondary);
}

.modal-field input[type="file"] {
  min-height: 40px;
  border-radius: 10px;
  border: 1px solid var(--border-light);
  background: var(--bg-subtle);
  padding: 8px 10px;
}

.modal-text-input {
  min-height: 40px;
  border-radius: 10px;
  border: 1px solid var(--border-light);
  background: #fff;
  padding: 8px 10px;
  width: 100%;
}

.modal-lookup-field {
  position: relative;
}

.modal-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 120;
  max-height: 240px;
  overflow: auto;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background: var(--bg-surface);
  box-shadow: var(--shadow-md);
}

.modal-dropdown-item,
.modal-dropdown-empty {
  display: block;
  width: 100%;
  border: none;
  background: transparent;
  padding: 10px 12px;
  text-align: left;
  font: inherit;
}

.modal-dropdown-item {
  cursor: pointer;
}

.modal-dropdown-item:hover,
.modal-dropdown-item.create:hover {
  background: var(--bg-subtle);
}

.modal-dropdown-item.create {
  color: var(--brand-primary);
  font-weight: 600;
}

.modal-dropdown-empty {
  color: var(--text-tertiary);
}

.modal-close,
.ghost-btn {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  cursor: pointer;
}

.modal-close {
  width: 32px;
  height: 32px;
}

.ghost-btn {
  padding: 8px 12px;
}

.file-note {
  font-size: 12px;
  color: var(--text-secondary);
}

.upload-error {
  color: var(--danger-text);
  font-size: 12px;
}

.screen-loader__card {
  padding: 24px;
  display: grid;
  justify-items: center;
  gap: 14px;
  text-align: center;
  color: var(--text-primary);
}

.screen-loader__spinner {
  width: 42px;
  height: 42px;
  border-radius: 999px;
  border: 3px solid var(--border-light);
  border-top-color: var(--brand-primary);
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 900px) {
  .table-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .filter-lookup {
    flex-basis: 100%;
  }
}
</style>
