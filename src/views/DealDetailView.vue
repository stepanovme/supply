<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TopNav from '../components/layout/TopNav.vue'
import ChatPanel from '../components/chat/ChatPanel.vue'
import { mainNavLinks } from '../constants/mainNav'
import { useChatStore } from '../stores/chat'
import { useAuthStore } from '../stores/auth'

const navLinks = mainNavLinks
const route = useRoute()
const router = useRouter()
const chat = useChatStore()

const activeSection = ref('items')
const loading = ref(false)
const loadError = ref('')
const deal = ref(null)
const productSavingMap = ref({})
const serviceSavingMap = ref({})
const nomenclaturePricingMap = ref({})
const productPickerOpen = ref(false)
const productPickerLoading = ref(false)
const productPickerSaving = ref(false)
const productPickerError = ref('')
const productPickerQuery = ref('')
const productPickerGroups = ref([])
const allWarehouseItems = ref([])
const selectedWarehouseItem = ref(null)
const selectedWarehouseItemQty = ref(1)
const productContextMenu = ref({ open: false, x: 0, y: 0, rowId: '' })
const deleteProductModalOpen = ref(false)
const deleteProductTargetId = ref('')
const serviceContextMenu = ref({ open: false, x: 0, y: 0, rowId: '' })
const deleteServiceModalOpen = ref(false)
const deleteServiceTargetId = ref('')
const deliverySavingMap = ref({})
const deliveryContextMenu = ref({ open: false, x: 0, y: 0, rowId: '' })
const deleteDeliveryModalOpen = ref(false)
const deleteDeliveryTargetId = ref('')
const counterparties = ref([])
const counterpartiesLoading = ref(false)
const objects = ref([])
const companyDropdownOpen = ref(false)
const clientDropdownOpen = ref(false)
const objectDropdownOpen = ref(false)
const unlockedSectionIndex = ref(0)
const paymentMode = ref('cash')
const agencyMode = ref('without_agent')

// ── Deal status IDs ──────────────────────────────────────────────────────────
const STATUS_READY_TO_CONDUCT = '662ce068-3fc1-11f1-b298-bc241127d0bd'
const STATUS_CONDUCTED        = 'ff28cc86-1968-11f1-aa8c-bc241127d0bd'
const STATUS_PAID             = '1ff32c4b-1312-11f1-aa8c-bc241127d0bd'

// Users allowed to confirm payment
const PAYMENT_CONFIRM_USER_IDS = [
  '122d844d-b3be-42d9-8b5b-8a0058edb2d8',
  '8f1d6ffd-6652-4719-a426-5b21412d7c56',
  '680ae643-038d-488f-91c6-5b4eb2791b0c',
  '3aae2232-5196-4b8a-bba5-99c5d131c710',
]

const authStore = useAuthStore()
const currentUserId = computed(() => authStore.user?.id || '')

const ALLOWED_COMPANY_IDS = [
  '18e8bdb8-6795-47d7-b7c5-960daab2ba56',
  'b53c259a-10a1-11f1-aa8c-bc241127d0bd',
  '76ae3b05-ad72-400f-b41a-fa8e0ed5f0c8',
]

const PRICE_ACCOUNT_OPTIONS = [
  { value: 'price_opt', label: 'Оптовая' },
  { value: 'price_opt2', label: 'Оптовая2' },
  { value: 'price_retail', label: 'Розница' },
  { value: 'free', label: 'Свободная' },
]

const availableSections = [
  { key: 'info', label: 'Информация' },
  { key: 'items', label: 'Товары' },
  { key: 'services', label: 'Услуги' },
  { key: 'deliveries', label: 'Доставка' },
  { key: 'calculation', label: 'Калькуляция' },
]

const formatDate = (value) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('ru-RU')
}

const normalizeMoney = (value) => {
  const num = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(num) ? num : 0
}

const roundToTwo = (value) => Number(normalizeMoney(value).toFixed(2))

const money = (value) => `${Number(value || 0).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`

const normalizeVatRate = (value) => {
  if (value === null || value === undefined || value === '') return null
  const num = Number(String(value).replace(',', '.'))
  return Number.isFinite(num) ? num : null
}

const hasVat = (value) => {
  const rate = normalizeVatRate(value)
  return rate !== null && rate > 0
}

const formatVatLabel = (value) => {
  const rate = normalizeVatRate(value)
  if (rate === null || rate <= 0) return 'Без НДС'
  return `С НДС ${rate}%`
}

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;')

const calculateMarkupPercent = (purchase, sale) => {
  const purchaseNum = normalizeMoney(purchase)
  const saleNum = normalizeMoney(sale)
  if (!purchaseNum) return 0
  return roundToTwo(((saleNum - purchaseNum) / purchaseNum) * 100)
}

const formatMarkup = (purchase, sale) => {
  const diff = calculateMarkupPercent(purchase, sale)
  return `${diff > 0 ? '+' : ''}${diff.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
}

const statusClass = computed(() => {
  const normalized = String(deal.value?.statusName || '').toLowerCase()
  return {
    'status-new': !normalized || normalized.includes('нов'),
    'status-progress': normalized.includes('процесс') || normalized.includes('коммерчес'),
    'status-completed': normalized.includes('заверш'),
    'status-rejected': normalized.includes('отклон'),
  }
})

const itemBase = computed(() => (deal.value?.items || []).reduce((sum, row) => sum + Number(row.quantity || 0) * Number(row.pricePurchase || 0), 0))
const serviceBase = computed(() => (deal.value?.services || []).reduce((sum, row) => sum + Number(row.quantity || 0) * Number(row.pricePurchase || 0), 0))
const deliveryBase = computed(() => (deal.value?.deliveries || []).reduce((sum, row) => sum + Number(row.pricePurchase || 0), 0))

const itemTotal = computed(() => (deal.value?.items || []).reduce((sum, row) => sum + Number(row.quantity || 0) * Number(row.price || 0), 0))
const serviceTotal = computed(() => (deal.value?.services || []).reduce((sum, row) => sum + Number(row.quantity || 0) * Number(row.price || 0), 0))
const deliveryTotal = computed(() => (deal.value?.deliveries || []).reduce((sum, row) => sum + Number(row.price || 0), 0))
const subtotal = computed(() => itemTotal.value + serviceTotal.value + deliveryTotal.value)
const totalPurchase = computed(() => itemBase.value + serviceBase.value + deliveryBase.value)
const companyCounterparties = computed(() =>
  counterparties.value.filter((item) => ALLOWED_COMPANY_IDS.includes(String(item?.id || '')))
)
const canAddSelectedWarehouseItem = computed(() => {
  const qty = normalizeMoney(selectedWarehouseItemQty.value)
  return !!selectedWarehouseItem.value && qty > 0
})
const infoReady = computed(() => !!deal.value?.title?.trim() && !!deal.value?.sellerId && !!deal.value?.buyerId)
const allSectionsUnlocked = computed(() => activeSection.value === 'calculation' || unlockedSectionIndex.value >= availableSections.length - 1)
const filteredCompanyCounterparties = computed(() => {
  const query = String(deal.value?.seller || '').trim().toLowerCase()
  if (!query) return companyCounterparties.value
  return companyCounterparties.value.filter((item) =>
    String(item?.short_name || '').toLowerCase().includes(query)
    || String(item?.full_name || '').toLowerCase().includes(query)
  )
})
const filteredClientCounterparties = computed(() => {
  const query = String(deal.value?.buyer || '').trim().toLowerCase()
  if (!query) return counterparties.value
  return counterparties.value.filter((item) =>
    String(item?.short_name || '').toLowerCase().includes(query)
    || String(item?.full_name || '').toLowerCase().includes(query)
  )
})
const filteredObjects = computed(() => {
  const query = String(deal.value?.object || '').trim().toLowerCase()
  if (!query) return objects.value
  return objects.value.filter((item) =>
    String(item?.short_name || '').toLowerCase().includes(query)
    || String(item?.full_name || '').toLowerCase().includes(query)
  )
})

const selectedCompanyId = computed(() => String(deal.value?.sellerId || ''))
const isAgencyCompany = computed(() => selectedCompanyId.value === '76ae3b05-ad72-400f-b41a-fa8e0ed5f0c8')

const itemVatTax = computed(() => {
  if (selectedCompanyId.value !== '18e8bdb8-6795-47d7-b7c5-960daab2ba56') return 0
  return (deal.value?.items || []).reduce((sum, row) => {
    const rate = normalizeVatRate(row?.vatRate)
    const lineTotal = Number(row.quantity || 0) * Number(row.price || 0)
    if (rate === 20 || rate === 22) return sum
    return sum + lineTotal * 0.22
  }, 0)
})

const itemVatBase = computed(() => {
  if (selectedCompanyId.value !== '18e8bdb8-6795-47d7-b7c5-960daab2ba56') return 0
  return (deal.value?.items || []).reduce((sum, row) => {
    const rate = normalizeVatRate(row?.vatRate)
    const lineTotal = Number(row.quantity || 0) * Number(row.price || 0)
    if (rate === 20 || rate === 22) return sum
    return sum + lineTotal
  }, 0)
})

const serviceVatTax = computed(() => {
  if (selectedCompanyId.value !== '18e8bdb8-6795-47d7-b7c5-960daab2ba56') return 0
  return serviceTotal.value * 0.22
})

const osnTotalTax = computed(() => itemVatTax.value + serviceVatTax.value)

const usnExpenseTax = computed(() => {
  if (selectedCompanyId.value !== 'b53c259a-10a1-11f1-aa8c-bc241127d0bd') return 0
  return Math.max(subtotal.value - totalPurchase.value, 0) * 0.15
})

const usnExpenseBase = computed(() => {
  if (selectedCompanyId.value !== 'b53c259a-10a1-11f1-aa8c-bc241127d0bd') return 0
  return Math.max(subtotal.value - totalPurchase.value, 0)
})

const usnVatTax = computed(() => {
  if (selectedCompanyId.value !== 'b53c259a-10a1-11f1-aa8c-bc241127d0bd') return 0
  return subtotal.value * 0.05
})

const agencyBase = computed(() => {
  if (selectedCompanyId.value !== '76ae3b05-ad72-400f-b41a-fa8e0ed5f0c8') return 0
  return agencyMode.value === 'with_agent' ? subtotal.value * 0.1 : subtotal.value
})

const agencyTax = computed(() => {
  if (selectedCompanyId.value !== '76ae3b05-ad72-400f-b41a-fa8e0ed5f0c8') return 0
  return agencyBase.value * 0.07
})

const agencyUsnTax = computed(() => {
  if (selectedCompanyId.value !== '76ae3b05-ad72-400f-b41a-fa8e0ed5f0c8') return 0
  return agencyBase.value * 0.06
})

const agencyPfrTax = computed(() => {
  if (selectedCompanyId.value !== '76ae3b05-ad72-400f-b41a-fa8e0ed5f0c8') return 0
  return agencyBase.value * 0.01
})

const acquiringTax = computed(() => (
  paymentMode.value === 'non-cash' ? subtotal.value * 0.012 : 0
))

const taxes = computed(() => {
  if (selectedCompanyId.value === '18e8bdb8-6795-47d7-b7c5-960daab2ba56') {
    return {
      lines: [
        {
          label: 'НДС на материалы 22%',
          value: itemVatTax.value,
          details: [
            { label: 'База для НДС по материалам', value: itemVatBase.value },
            { label: 'Начисление 22% на материалы', value: itemVatTax.value },
          ],
        },
        {
          label: 'НДС на услуги 22%',
          value: serviceVatTax.value,
          details: [
            { label: 'База для НДС по услугам', value: serviceTotal.value },
            { label: 'Начисление 22% на услуги', value: serviceVatTax.value },
          ],
        },
      ],
      total: osnTotalTax.value,
    }
  }
  if (selectedCompanyId.value === 'b53c259a-10a1-11f1-aa8c-bc241127d0bd') {
    return {
      lines: [
        {
          label: 'УСН 15% с доходы - расходы',
          value: usnExpenseTax.value,
          details: [
            { label: 'База доходы - расходы', value: usnExpenseBase.value },
            { label: '15% УСН', value: usnExpenseTax.value },
          ],
        },
        {
          label: 'НДС 5% со суммы сделки',
          value: usnVatTax.value,
          details: [
            { label: 'База НДС 5%', value: subtotal.value },
            { label: '5% НДС', value: usnVatTax.value },
          ],
        },
      ],
      total: usnExpenseTax.value + usnVatTax.value,
    }
  }
  if (selectedCompanyId.value === '76ae3b05-ad72-400f-b41a-fa8e0ed5f0c8') {
    return {
      lines: [
        {
          label: agencyMode.value === 'with_agent'
            ? 'Налоги с 10% агентского вознаграждения (6% УСН + 1% ПФР)'
            : 'УСН 6% + 1% ПФР',
          value: agencyTax.value,
          details: [
            ...(agencyMode.value === 'with_agent'
              ? [
                  { label: '10% агентское вознаграждение', value: agencyBase.value },
                ]
              : [
                  { label: 'База налогообложения', value: agencyBase.value },
                ]),
            { label: '6% УСН', value: agencyUsnTax.value },
            { label: '1% ПФР', value: agencyPfrTax.value },
          ],
        },
      ],
      total: agencyTax.value,
    }
  }
  return { lines: [], total: 0 }
})

const extraTaxes = computed(() => {
  const lines = [...taxes.value.lines]
  if (acquiringTax.value > 0) {
    lines.push({
      label: 'Эквайринг 1.2%',
      value: acquiringTax.value,
      details: [
        { label: 'База эквайринга', value: subtotal.value },
        { label: '1.2% эквайринг', value: acquiringTax.value },
      ],
    })
  }
  return lines
})

const totalTax = computed(() => taxes.value.total + acquiringTax.value)
const netProfit = computed(() => subtotal.value - totalPurchase.value - totalTax.value)

// ── Deal locking / status actions ────────────────────────────────────────────
const isDealLocked = computed(() =>
  deal.value?.statusId === STATUS_CONDUCTED || deal.value?.statusId === STATUS_PAID,
)
const canConductDeal = computed(() => deal.value?.statusId === STATUS_READY_TO_CONDUCT)
const canConfirmPayment = computed(() =>
  deal.value?.statusId === STATUS_CONDUCTED &&
  PAYMENT_CONFIRM_USER_IDS.includes(currentUserId.value),
)

const conductLoading = ref(false)
const payLoading = ref(false)
const dealDate = ref('')

const patchDealModes = async () => {
  if (!deal.value?.id) return
  await fetch(`/apisup/supply/deals/${encodeURIComponent(deal.value.id)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      payment_mode: paymentMode.value,
      taxes: agencyMode.value === 'with_agent' ? 'agreement' : 'non-agreement',
    }),
  })
}

const patchDealStatus = async (statusId) => {
  if (!deal.value?.id) return
  await fetch(`/apisup/supply/deals/${encodeURIComponent(deal.value.id)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status_id: statusId }),
  })
}

const patchDealField = async (fields) => {
  if (!deal.value?.id) return
  await fetch(`/apisup/supply/deals/${encodeURIComponent(deal.value.id)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  })
}

const onDealDateBlur = async () => {
  await patchDealField({ date: dealDate.value || null })
}

const conductDeal = async () => {
  conductLoading.value = true
  try {
    const today = new Date().toISOString().slice(0, 10)
    await Promise.all([
      patchDealStatus(STATUS_CONDUCTED),
      patchDealField({ date_event: today }),
    ])
    if (deal.value) deal.value.statusId = STATUS_CONDUCTED
  } finally {
    conductLoading.value = false
  }
}

const confirmPayment = async () => {
  payLoading.value = true
  try {
    const today = new Date().toISOString().slice(0, 10)
    await Promise.all([
      patchDealStatus(STATUS_PAID),
      patchDealField({ date_completed: today }),
    ])
    if (deal.value) deal.value.statusId = STATUS_PAID
  } finally {
    payLoading.value = false
  }
}

const mapDeal = (payload) => {
  // Sync local refs that live outside the deal object
  paymentMode.value = payload?.payment_mode === 'non-cash' ? 'non-cash' : 'cash'
  agencyMode.value  = (payload?.taxes === 'agreement' || payload?.taxes === 'agreement') ? 'with_agent' : 'without_agent'
  dealDate.value = payload?.date ? String(payload.date).slice(0, 10) : ''
  return {
  id: String(payload?.id || ''),
  title: String(payload?.name || 'Сделка'),
  statusId: String(payload?.status_id || ''),
  statusName: String(payload?.status_name || '—'),
  sellerId: String(payload?.counterparties_from || ''),
  seller: String(payload?.counterparties_from_name || '—'),
  buyerId: String(payload?.counterparties_to || ''),
  buyer: String(payload?.counterparties_to_name || '—'),
  objectId: String(payload?.object_id || ''),
  object: String(payload?.object_name || ''),
  creator: String(payload?.created_by_user?.short_fio || payload?.created_by || '—'),
  createdAt: String(payload?.created_at || ''),
  items: (Array.isArray(payload?.products) ? payload.products : []).map((row) => ({
    id: String(row?.id || ''),
    nomenclatureId: String(row?.nomenclature_id || ''),
    warehouseId: String(row?.warehouse_id || ''),
    warehouseName: String(row?.warehouse_name || '—'),
    productName: String(row?.nomenclature_name || '—'),
    unitName: String(row?.unit_name || '—'),
    quantity: Number(row?.quantity || 0),
    pricePurchase: Number(row?.price_purchase || 0),
    price: roundToTwo(row?.price || 0),
    vatRate: normalizeVatRate(row?.vat_rate),
    priceAccount: 'free',
    markupPercent: calculateMarkupPercent(row?.price_purchase, row?.price),
    qtyError: '',
  })),
  services: (Array.isArray(payload?.services) ? payload.services : []).map((row) => ({
    id: String(row?.id || ''),
    name: String(row?.name || '—'),
    unitName: String(row?.unit_name || '—'),
    quantity: Number(row?.quantity || 0),
    pricePurchase: Number(row?.price_purchase || 0),
    price: roundToTwo(row?.price || 0),
    markupPercent: calculateMarkupPercent(row?.price_purchase, row?.price),
  })),
  deliveries: (Array.isArray(payload?.deliveries) ? payload.deliveries : []).map((row) => ({
    id: String(row?.id || ''),
    type: String(row?.type || ''),
    pricePurchase: Number(row?.price_purchase || 0),
    price: roundToTwo(row?.price || 0),
    markupPercent: calculateMarkupPercent(row?.price_purchase, row?.price),
    comment: String(row?.comment || ''),
  })),
  }
}

const deliveryTypeLabel = (value) => (value === 'internal' ? 'Внутренняя доставка' : value === 'external' ? 'Внешняя доставка' : value || '—')
const deriveUnlockedSectionIndex = (currentDeal) => {
  if (!currentDeal) return 0
  const hasInfo = !!String(currentDeal.title || '').trim() && !!String(currentDeal.sellerId || '').trim() && !!String(currentDeal.buyerId || '').trim()
  if (!hasInfo) return 0
  let index = 1
  if (Array.isArray(currentDeal.items) && currentDeal.items.length) index = 2
  if (Array.isArray(currentDeal.services) && currentDeal.services.length) index = 3
  if (Array.isArray(currentDeal.deliveries) && currentDeal.deliveries.length) index = 4
  return index
}
const isSectionUnlocked = (_key) => true

const goToSection = (key) => {
  activeSection.value = key
}

const goNextSection = () => {
  const currentIndex = availableSections.findIndex((item) => item.key === activeSection.value)
  if (currentIndex === -1 || currentIndex >= availableSections.length - 1) return
  unlockedSectionIndex.value = Math.max(unlockedSectionIndex.value, currentIndex + 1)
  activeSection.value = availableSections[currentIndex + 1].key
}

const openCreateCounterparty = () => {
  window.open('/organizations/create', '_blank', 'noopener')
}

const flattenWarehouseGroups = (groups) =>
  (Array.isArray(groups) ? groups : []).flatMap((group) =>
    (Array.isArray(group?.items) ? group.items : []).map((item) => ({
      warehouse_id: String(item?.warehouse_id || group?.warehouse?.id || ''),
      warehouse_name: String(item?.warehouse_name || group?.warehouse?.name || ''),
      nomenclature_id: String(item?.nomenclature_id || ''),
      nomenclature_name: String(item?.nomenclature_name || ''),
      unit_name: String(item?.unit_name || '—'),
      quantity: normalizeMoney(item?.quantity),
      price: normalizeMoney(item?.price),
      vat_rate: normalizeVatRate(item?.vat_rate),
      date: String(item?.date || ''),
    }))
  )

const getProductStockKey = (item) => [
  String(item?.warehouseId || item?.warehouse_id || ''),
  String(item?.nomenclatureId || item?.nomenclature_id || ''),
  String(normalizeMoney(item?.pricePurchase ?? item?.price)),
].join('::')

const stockTotalsByKey = computed(() => {
  const map = new Map()
  for (const item of allWarehouseItems.value) {
    const key = getProductStockKey(item)
    map.set(key, (map.get(key) || 0) + normalizeMoney(item.quantity))
  }
  return map
})

const usedQuantitiesByKey = computed(() => {
  const map = new Map()
  for (const row of (deal.value?.items || [])) {
    const key = getProductStockKey(row)
    map.set(key, (map.get(key) || 0) + normalizeMoney(row.quantity))
  }
  return map
})

const getStockQuantityForKey = (key) => stockTotalsByKey.value.get(key) || 0

const getUsedQuantityForKey = (key, excludeRowId = '') => {
  if (!excludeRowId) return usedQuantitiesByKey.value.get(key) || 0
  let total = 0
  for (const row of (deal.value?.items || [])) {
    if (String(row.id) === String(excludeRowId)) continue
    if (getProductStockKey(row) === key) total += normalizeMoney(row.quantity)
  }
  return total
}

const getRemainingStockForRow = (row) => {
  const key = getProductStockKey(row)
  const total = getStockQuantityForKey(key)
  const usedByOthers = getUsedQuantityForKey(key, row?.id)
  return Math.max(total - usedByOthers, 0)
}

const getAdditionalRemainingForRow = (row) => Math.max(getRemainingStockForRow(row) - normalizeMoney(row.quantity), 0)

const getRemainingStockForCandidate = (item) => {
  const key = getProductStockKey(item)
  return Math.max((stockTotalsByKey.value.get(key) || 0) - (usedQuantitiesByKey.value.get(key) || 0), 0)
}

const resolveVatRateForDealItem = (row) => {
  const directVatRate = normalizeVatRate(row?.vatRate)
  if (directVatRate !== null) return directVatRate

  const matchedStockRow = allWarehouseItems.value.find((item) =>
    String(item?.warehouse_id || '') === String(row?.warehouseId || '')
    && String(item?.nomenclature_id || '') === String(row?.nomenclatureId || '')
    && normalizeMoney(item?.price) === normalizeMoney(row?.pricePurchase)
  )
  if (matchedStockRow) return normalizeVatRate(matchedStockRow?.vat_rate)

  const cachedPricing = nomenclaturePricingMap.value[String(row?.nomenclatureId || '')]
  if (cachedPricing) return normalizeVatRate(cachedPricing?.vat_rate)

  return null
}

const validateProductQuantity = (row) => {
  row.qtyError = ''
  return true
}

const setProductSaving = (productId, value) => {
  productSavingMap.value = {
    ...productSavingMap.value,
    [productId]: value,
  }
}

const setServiceSaving = (serviceId, value) => {
  serviceSavingMap.value = {
    ...serviceSavingMap.value,
    [serviceId]: value,
  }
}

const setDeliverySaving = (deliveryId, value) => {
  deliverySavingMap.value = {
    ...deliverySavingMap.value,
    [deliveryId]: value,
  }
}

const loadCounterparties = async (query = '') => {
  counterpartiesLoading.value = true
  try {
    const url = query
      ? `/apiref/ref/counterparties/search?q=${encodeURIComponent(query)}`
      : '/apiref/ref/counterparties'
    const res = await fetch(url, { credentials: 'include' })
    if (!res.ok) throw new Error('counterparties failed')
    const payload = await res.json()
    counterparties.value = Array.isArray(payload) ? payload : (payload?.items || [])
  } catch {
    counterparties.value = []
  } finally {
    counterpartiesLoading.value = false
  }
}

const loadObjects = async (query = '') => {
  try {
    const url = query
      ? `/apiref/ref/objects?search=${encodeURIComponent(query)}`
      : '/apiref/ref/objects'
    const res = await fetch(url, { credentials: 'include' })
    if (!res.ok) throw new Error('objects failed')
    const payload = await res.json()
    const items = Array.isArray(payload) ? payload : (payload?.items || [])
    objects.value = items.map((item) => ({
      id: String(item?.id || ''),
      short_name: String(item?.short_name || ''),
      full_name: String(item?.full_name || ''),
    }))
  } catch {
    objects.value = []
  }
}

const getNomenclaturePricing = async (nomenclatureId) => {
  const id = String(nomenclatureId || '')
  if (!id) return null
  if (nomenclaturePricingMap.value[id]) return nomenclaturePricingMap.value[id]
  const res = await fetch(`/apisup/supply/nomenclature/${encodeURIComponent(id)}`, { credentials: 'include' })
  if (!res.ok) throw new Error('nomenclature detail failed')
  const payload = await res.json()
  const pricing = {
    price_opt: normalizeMoney(payload?.price_opt),
    price_opt2: normalizeMoney(payload?.price_opt2),
    price_retail: normalizeMoney(payload?.price_retail),
    vat_rate: normalizeVatRate(payload?.vat_rate),
  }
  nomenclaturePricingMap.value = {
    ...nomenclaturePricingMap.value,
    [id]: pricing,
  }
  return pricing
}

const inferPriceAccount = async (row) => {
  if (!row?.nomenclatureId) {
    row.priceAccount = 'free'
    return
  }
  try {
    const pricing = await getNomenclaturePricing(row.nomenclatureId)
    const currentPrice = normalizeMoney(row.price)
    row.vatRate = normalizeVatRate(pricing?.vat_rate ?? row.vatRate)
    if (pricing && currentPrice === pricing.price_opt) row.priceAccount = 'price_opt'
    else if (pricing && currentPrice === pricing.price_opt2) row.priceAccount = 'price_opt2'
    else if (pricing && currentPrice === pricing.price_retail) row.priceAccount = 'price_retail'
    else row.priceAccount = 'free'
  } catch {
    row.priceAccount = 'free'
  }
}

const patchDealProduct = async (row, overrides = {}) => {
  if (!deal.value?.id || !row?.id) return
  setProductSaving(row.id, true)
  try {
    const res = await fetch(
      `/apisup/supply/deals/${encodeURIComponent(deal.value.id)}/products/${encodeURIComponent(row.id)}`,
      {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantity: overrides.quantity ?? normalizeMoney(row.quantity),
          price: overrides.price ?? roundToTwo(row.price),
        }),
      }
    )
    if (!res.ok) throw new Error('product patch failed')
  } finally {
    setProductSaving(row.id, false)
  }
}

const deleteDealProduct = async (productId) => {
  if (!deal.value?.id || !productId) return false
  setProductSaving(productId, true)
  try {
    const res = await fetch(
      `/apisup/supply/deals/${encodeURIComponent(deal.value.id)}/products/${encodeURIComponent(productId)}`,
      {
        method: 'DELETE',
        credentials: 'include',
      }
    )
    return res.ok
  } catch {
    return false
  } finally {
    setProductSaving(productId, false)
  }
}

const patchDealInfo = async () => {
  if (!deal.value?.id) return
  try {
    await fetch(`/apisup/supply/deals/${encodeURIComponent(deal.value.id)}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: deal.value.title || '',
        counterparties_to: deal.value.buyerId || '',
        counterparties_from: deal.value.sellerId || '',
        object_id: deal.value.objectId || '',
      }),
    })
  } catch {
    // noop
  }
}

const onDealNameBlur = async () => {
  await patchDealInfo()
}

const onSellerInput = async () => {
  if (!deal.value) return
  deal.value.sellerId = ''
  companyDropdownOpen.value = true
  await loadCounterparties(deal.value.seller || '')
}

const onBuyerInput = async () => {
  if (!deal.value) return
  deal.value.buyerId = ''
  clientDropdownOpen.value = true
  await loadCounterparties(deal.value.buyer || '')
}

const onObjectInput = async () => {
  if (!deal.value) return
  deal.value.objectId = ''
  objectDropdownOpen.value = true
  await loadObjects(deal.value.object || '')
}

const clearObject = async () => {
  if (!deal.value) return
  deal.value.objectId = ''
  deal.value.object = ''
  objectDropdownOpen.value = false
  await patchDealInfo()
}

const selectSellerCounterparty = async (item) => {
  if (!deal.value) return
  deal.value.sellerId = String(item?.id || '')
  deal.value.seller = String(item?.short_name || item?.full_name || '')
  companyDropdownOpen.value = false
  await patchDealInfo()
  await loadDeal()
}

const selectBuyerCounterparty = async (item) => {
  if (!deal.value) return
  deal.value.buyerId = String(item?.id || '')
  deal.value.buyer = String(item?.short_name || item?.full_name || '')
  clientDropdownOpen.value = false
  await patchDealInfo()
}

const selectObject = async (item) => {
  if (!deal.value) return
  deal.value.objectId = String(item?.id || '')
  deal.value.object = String(item?.short_name || item?.full_name || '')
  objectDropdownOpen.value = false
  await patchDealInfo()
}

const requestDeleteProduct = (rowId) => {
  deleteProductTargetId.value = String(rowId || '')
  deleteProductModalOpen.value = true
  productContextMenu.value.open = false
}

const closeDeleteProductModal = () => {
  deleteProductModalOpen.value = false
  deleteProductTargetId.value = ''
}

const requestDeleteService = (rowId) => {
  deleteServiceTargetId.value = String(rowId || '')
  deleteServiceModalOpen.value = true
  serviceContextMenu.value.open = false
}

const closeDeleteServiceModal = () => {
  deleteServiceModalOpen.value = false
  deleteServiceTargetId.value = ''
}

const requestDeleteDelivery = (rowId) => {
  deleteDeliveryTargetId.value = String(rowId || '')
  deleteDeliveryModalOpen.value = true
  deliveryContextMenu.value.open = false
}

const closeDeleteDeliveryModal = () => {
  deleteDeliveryModalOpen.value = false
  deleteDeliveryTargetId.value = ''
}

const confirmDeleteProduct = async () => {
  const targetId = String(deleteProductTargetId.value || '')
  if (!targetId) return
  const deleted = await deleteDealProduct(targetId)
  if (deleted) {
    await loadDeal()
  }
  closeDeleteProductModal()
}

const confirmDeleteService = async () => {
  const targetId = String(deleteServiceTargetId.value || '')
  if (!targetId) return
  await deleteDealService(targetId)
  closeDeleteServiceModal()
}

const confirmDeleteDelivery = async () => {
  const targetId = String(deleteDeliveryTargetId.value || '')
  if (!targetId) return
  await deleteDealDelivery(targetId)
  closeDeleteDeliveryModal()
}

const onProductQuantityBlur = async (row) => {
  row.quantity = normalizeMoney(row.quantity)
  if (row.quantity <= 0) {
    requestDeleteProduct(row.id)
    return
  }
  await patchDealProduct(row, { quantity: row.quantity })
}

const onProductPriceBlur = async (row) => {
  row.price = normalizeMoney(row.price)
  row.price = roundToTwo(row.price)
  row.markupPercent = calculateMarkupPercent(row.pricePurchase, row.price)
  row.priceAccount = 'free'
  await patchDealProduct(row, { price: row.price, quantity: row.quantity })
}

const onProductMarkupBlur = async (row) => {
  const markup = roundToTwo(row.markupPercent)
  row.markupPercent = markup
  row.price = roundToTwo(normalizeMoney(row.pricePurchase) * (1 + markup / 100))
  row.priceAccount = 'free'
  await patchDealProduct(row, { price: row.price, quantity: row.quantity })
}

const onPriceAccountChange = async (row) => {
  if (!row?.nomenclatureId) return
  if (row.priceAccount === 'free') {
    await patchDealProduct(row, { price: normalizeMoney(row.price), quantity: row.quantity })
    return
  }
  const pricing = await getNomenclaturePricing(row.nomenclatureId)
  if (!pricing) return
  row.price = roundToTwo(pricing[row.priceAccount])
  row.markupPercent = calculateMarkupPercent(row.pricePurchase, row.price)
  await patchDealProduct(row, { price: row.price, quantity: row.quantity })
}

const mapServices = (items) =>
  (Array.isArray(items) ? items : []).map((row) => ({
    id: String(row?.id || ''),
    name: String(row?.name || '—'),
    unitName: String(row?.unit_name || '—'),
    quantity: Number(row?.quantity || 0),
    pricePurchase: Number(row?.price_purchase || 0),
    price: Number(row?.price || 0),
    markupPercent: calculateMarkupPercent(row?.price_purchase, row?.price),
  }))

const loadDealServices = async () => {
  if (!deal.value?.id) return
  try {
    const res = await fetch(`/apisup/supply/deals/${encodeURIComponent(deal.value.id)}/services`, { credentials: 'include' })
    if (!res.ok) throw new Error('services load failed')
    const payload = await res.json()
    deal.value.services = mapServices(Array.isArray(payload) ? payload : (payload?.items || []))
  } catch {
    // noop, оставляем услуги из общей сделки
  }
}

const patchDealService = async (row, overrides = {}) => {
  if (!deal.value?.id || !row?.id) return
  setServiceSaving(row.id, true)
  try {
    const res = await fetch(
      `/apisup/supply/deals/${encodeURIComponent(deal.value.id)}/services/${encodeURIComponent(row.id)}`,
      {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: overrides.name ?? row.name ?? '',
          unit_name: overrides.unit_name ?? row.unitName ?? '',
          quantity: overrides.quantity ?? normalizeMoney(row.quantity),
          price_purchase: overrides.price_purchase ?? normalizeMoney(row.pricePurchase),
          price: overrides.price ?? roundToTwo(row.price),
        }),
      }
    )
    if (!res.ok) throw new Error('service patch failed')
  } finally {
    setServiceSaving(row.id, false)
  }
}

const createDealService = async () => {
  if (!deal.value?.id) return
  try {
    const res = await fetch(`/apisup/supply/deals/${encodeURIComponent(deal.value.id)}/services`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Новая услуга',
        unit_name: 'шт',
        quantity: 1,
        price_purchase: 0,
        price: 0,
      }),
    })
    if (!res.ok) throw new Error('service create failed')
    await loadDealServices()
  } catch {
    // noop
  }
}

const deleteDealService = async (serviceId) => {
  if (!deal.value?.id || !serviceId) return
  setServiceSaving(serviceId, true)
  try {
    const res = await fetch(
      `/apisup/supply/deals/${encodeURIComponent(deal.value.id)}/services/${encodeURIComponent(serviceId)}`,
      {
        method: 'DELETE',
        credentials: 'include',
      }
    )
    if (!res.ok) throw new Error('service delete failed')
    await loadDealServices()
  } finally {
    setServiceSaving(serviceId, false)
  }
}

const onServiceFieldBlur = async (row) => {
  row.quantity = normalizeMoney(row.quantity)
  if (row.quantity <= 0) {
    requestDeleteService(row.id)
    return
  }
  row.pricePurchase = normalizeMoney(row.pricePurchase)
  row.price = roundToTwo(row.price)
  row.markupPercent = calculateMarkupPercent(row.pricePurchase, row.price)
  await patchDealService(row)
}

const onServiceMarkupBlur = async (row) => {
  const markup = roundToTwo(row.markupPercent)
  row.markupPercent = markup
  row.price = roundToTwo(normalizeMoney(row.pricePurchase) * (1 + markup / 100))
  await patchDealService(row, { price: row.price })
}

const mapDeliveries = (items) =>
  (Array.isArray(items) ? items : []).map((row) => ({
    id: String(row?.id || ''),
    type: String(row?.type || 'internal'),
    pricePurchase: Number(row?.price_purchase || 0),
    price: roundToTwo(row?.price || 0),
    markupPercent: calculateMarkupPercent(row?.price_purchase, row?.price),
    comment: String(row?.comment || ''),
  }))

const loadDealDeliveries = async () => {
  if (!deal.value?.id) return
  try {
    const res = await fetch(`/apisup/supply/deals/${encodeURIComponent(deal.value.id)}/deliveries`, { credentials: 'include' })
    if (!res.ok) throw new Error('deliveries load failed')
    const payload = await res.json()
    deal.value.deliveries = mapDeliveries(Array.isArray(payload) ? payload : (payload?.items || []))
  } catch {
    // noop
  }
}

const patchDealDelivery = async (row, overrides = {}) => {
  if (!deal.value?.id || !row?.id) return
  setDeliverySaving(row.id, true)
  try {
    const res = await fetch(
      `/apisup/supply/deals/${encodeURIComponent(deal.value.id)}/deliveries/${encodeURIComponent(row.id)}`,
      {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: overrides.type ?? row.type ?? 'internal',
          price_purchase: overrides.price_purchase ?? normalizeMoney(row.pricePurchase),
          price: overrides.price ?? roundToTwo(row.price),
          comment: overrides.comment ?? row.comment ?? '',
        }),
      }
    )
    if (!res.ok) throw new Error('delivery patch failed')
  } finally {
    setDeliverySaving(row.id, false)
  }
}

const createDealDelivery = async () => {
  if (!deal.value?.id) return
  try {
    const res = await fetch(`/apisup/supply/deals/${encodeURIComponent(deal.value.id)}/deliveries`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'internal',
        price_purchase: 0,
        price: 0,
        comment: '',
      }),
    })
    if (!res.ok) throw new Error('delivery create failed')
    await loadDealDeliveries()
  } catch {
    // noop
  }
}

const deleteDealDelivery = async (deliveryId) => {
  if (!deal.value?.id || !deliveryId) return
  setDeliverySaving(deliveryId, true)
  try {
    const res = await fetch(
      `/apisup/supply/deals/${encodeURIComponent(deal.value.id)}/deliveries/${encodeURIComponent(deliveryId)}`,
      {
        method: 'DELETE',
        credentials: 'include',
      }
    )
    if (!res.ok) throw new Error('delivery delete failed')
    await loadDealDeliveries()
  } finally {
    setDeliverySaving(deliveryId, false)
  }
}

const onDeliveryFieldBlur = async (row) => {
  row.pricePurchase = normalizeMoney(row.pricePurchase)
  row.price = roundToTwo(row.price)
  row.markupPercent = calculateMarkupPercent(row.pricePurchase, row.price)
  await patchDealDelivery(row)
}

const onDeliveryMarkupBlur = async (row) => {
  const markup = roundToTwo(row.markupPercent)
  row.markupPercent = markup
  row.price = roundToTwo(normalizeMoney(row.pricePurchase) * (1 + markup / 100))
  await patchDealDelivery(row, { price: row.price })
}

const buildCommercialRowsHtml = (rows, kind, startIndex = 0, extraById = {}) => rows.map((row, index) => {
  const name = kind === 'service' ? row.name : row.productName
  const unitName = row.unitName || '—'
  const qtyNum = Number(row.quantity || 0)
  const baseSum = qtyNum * Number(row.price || 0)
  const extraSum = Number(extraById[String(row.id || '')] || 0)
  const finalSum = baseSum + extraSum
  const finalPrice = qtyNum > 0 ? finalSum / qtyNum : Number(row.price || 0)
  const quantity = qtyNum.toLocaleString('ru-RU', { maximumFractionDigits: 3 })
  const price = money(finalPrice)
  const sum = money(finalSum)
  return `
    <tr>
      <td class="num-cell">${startIndex + index + 1}</td>
      <td>${escapeHtml(name)}</td>
      <td class="type-cell">${kind === 'service' ? 'Услуга' : 'Товар'}</td>
      <td class="qty-cell">${quantity}</td>
      <td class="unit-cell">${escapeHtml(unitName)}</td>
      <td class="price-cell">${price}</td>
      <td class="sum-cell">${sum}</td>
    </tr>
  `
}).join('')

const printCommercialProposal = () => {
  if (!deal.value) return
  const proposalRows = [
    ...((deal.value.items || []).map((row) => ({ ...row, __kind: 'product' }))),
    ...((deal.value.services || []).map((row) => ({ ...row, __kind: 'service' }))),
  ]
  if (!proposalRows.length) return

  const itemRows = deal.value.items || []
  const serviceRows = deal.value.services || []
  const deliveryToSpread = Number(deliveryTotal.value || 0)
  const itemSumBase = itemRows.reduce((sum, row) => sum + Number(row.quantity || 0) * Number(row.price || 0), 0)
  const itemDeliverySpread = {}
  if (deliveryToSpread > 0 && itemRows.length > 0 && itemSumBase > 0) {
    let allocated = 0
    itemRows.forEach((row, index) => {
      const rowId = String(row.id || '')
      const rowBase = Number(row.quantity || 0) * Number(row.price || 0)
      if (!rowId || rowBase <= 0) return
      const isLast = index === itemRows.length - 1
      const rawShare = isLast
        ? (deliveryToSpread - allocated)
        : roundToTwo((rowBase / itemSumBase) * deliveryToSpread)
      const share = roundToTwo(rawShare)
      itemDeliverySpread[rowId] = share
      allocated = roundToTwo(allocated + share)
    })
    const drift = roundToTwo(deliveryToSpread - allocated)
    if (drift !== 0) {
      const lastWithId = [...itemRows].reverse().find((row) => String(row.id || ''))
      if (lastWithId) {
        const k = String(lastWithId.id || '')
        itemDeliverySpread[k] = roundToTwo(Number(itemDeliverySpread[k] || 0) + drift)
      }
    }
  }

  const itemsHtml = buildCommercialRowsHtml(itemRows, 'product', 0, itemDeliverySpread)
  const servicesHtml = buildCommercialRowsHtml(serviceRows, 'service', itemRows.length)
  const mergedRowsHtml = `${itemsHtml}${servicesHtml}`
  const objectLabel = String(deal.value.object || '').trim() || '—'
  const proposalDate = formatDate(new Date().toISOString())
  const managerLabel = String(deal.value.creator || '').trim() || 'Фамилия И. О'

  const proposalHtml = `
    <!doctype html>
    <html lang="ru">
      <head>
        <meta charset="UTF-8" />
        <title>Коммерческое предложение — ${escapeHtml(deal.value.title || 'Сделка')}</title>
        <style>
          @page { size: A4; margin: 16mm; }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            font-family: Arial, sans-serif;
            color: #0f172a;
            font-size: 13px;
            line-height: 1.45;
          }
          .sheet { display: flex; flex-direction: column; gap: 18px; }
          .header {
            border-bottom: 2px solid #1d4ed8;
            padding-bottom: 14px;
            display: flex;
            flex-direction: column;
            gap: 6px;
          }
          .title {
            margin: 0;
            font-size: 26px;
            line-height: 1.1;
          }
          .subtitle {
            color: #475569;
            font-size: 14px;
          }
          .meta {
            width: 100%;
            border-collapse: collapse;
          }
          .meta td {
            padding: 8px 10px;
            border: 1px solid #cbd5e1;
            vertical-align: top;
          }
          .meta .label {
            width: 180px;
            background: #f8fafc;
            color: #475569;
            font-weight: 700;
          }
          .section-title {
            margin: 0 0 8px;
            font-size: 18px;
          }
          .proposal-table {
            width: 100%;
            border-collapse: collapse;
          }
          .proposal-table th,
          .proposal-table td {
            border: 1px solid #cbd5e1;
            padding: 9px 10px;
          }
          .proposal-table th {
            background: #eff6ff;
            color: #1e3a8a;
            text-align: left;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.04em;
          }
          .num-cell, .qty-cell, .unit-cell, .price-cell, .sum-cell, .type-cell {
            white-space: nowrap;
            text-align: center;
          }
          .total-row td {
            background: #eff6ff;
            font-weight: 700;
          }
          .proposal-footnote {
            margin-top: 16px;
            color: #334155;
            font-size: 13px;
          }
          .signature-row {
            margin-top: 26px;
            display: flex;
            align-items: flex-end;
            gap: 8px;
            font-size: 14px;
          }
          .signature-line {
            width: 260px;
            min-height: 20px;
            border-bottom: 1px solid #0f172a;
          }
        </style>
      </head>
      <body>
        <div class="sheet">
          <div class="header">
            <h1 class="title">Коммерческое предложение</h1>
            <div class="subtitle">от ${proposalDate}</div>
          </div>

          <table class="meta">
            <tr>
              <td class="label">Компания</td>
              <td>${escapeHtml(deal.value.seller || '—')}</td>
            </tr>
            <tr>
              <td class="label">Клиент</td>
              <td>${escapeHtml(deal.value.buyer || '—')}</td>
            </tr>
            <tr>
              <td class="label">Объект</td>
              <td>${escapeHtml(objectLabel)}</td>
            </tr>
          </table>

          <section>
            <table class="proposal-table">
              <thead>
                <tr>
                  <th>№</th>
                  <th>Наименование</th>
                  <th>Тип</th>
                  <th>Кол-во</th>
                  <th>Ед. изм.</th>
                  <th>Цена</th>
                  <th>Сумма</th>
                </tr>
              </thead>
              <tbody>
                ${mergedRowsHtml}
                <tr class="total-row">
                  <td colspan="6">Итого</td>
                  <td class="sum-cell">${money(subtotal.value)}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <div class="proposal-footnote">
            Коммерческое предложение действительно в течение 5 дней.
          </div>

          <div class="signature-row">
            <span>Менеджер ${escapeHtml(managerLabel)}</span>
            <span class="signature-line"></span>
          </div>
        </div>
      </body>
    </html>
  `

  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  iframe.setAttribute('aria-hidden', 'true')
  document.body.appendChild(iframe)

  const cleanup = () => {
    setTimeout(() => {
      try {
        iframe.remove()
      } catch {
        // noop
      }
    }, 1500)
  }

  try {
    const doc = iframe.contentWindow?.document
    if (!doc) {
      cleanup()
      return
    }
    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus()
        iframe.contentWindow?.print()
      } finally {
        cleanup()
      }
    }
    doc.open()
    doc.write(proposalHtml)
    doc.close()
  } catch {
    cleanup()
  }
}

const loadWarehouseAllItems = async () => {
  productPickerLoading.value = true
  productPickerError.value = ''
  try {
    const query = String(productPickerQuery.value || '').trim()
    const url = query
      ? `/apisup/supply/warehouses/list/all?search=${encodeURIComponent(query)}`
      : '/apisup/supply/warehouses/list/all'
    const res = await fetch(url, { credentials: 'include' })
    if (!res.ok) throw new Error('warehouse all items failed')
    const payload = await res.json()
    productPickerGroups.value = Array.isArray(payload) ? payload : (payload?.items || [])
    if (!query) allWarehouseItems.value = flattenWarehouseGroups(productPickerGroups.value)
  } catch {
    productPickerGroups.value = []
    productPickerError.value = 'Не удалось загрузить список товаров.'
  } finally {
    productPickerLoading.value = false
  }
}

const openProductPicker = async () => {
  productPickerOpen.value = true
  productPickerQuery.value = ''
  productPickerError.value = ''
  selectedWarehouseItem.value = null
  selectedWarehouseItemQty.value = 1
  await loadWarehouseAllItems()
}

const closeProductPicker = () => {
  productPickerOpen.value = false
  productPickerError.value = ''
  productPickerQuery.value = ''
  selectedWarehouseItem.value = null
  selectedWarehouseItemQty.value = 1
}

const openProductContextMenu = (event, row) => {
  event.preventDefault()
  productContextMenu.value = {
    open: true,
    x: event.clientX,
    y: event.clientY,
    rowId: String(row?.id || ''),
  }
}

const openServiceContextMenu = (event, row) => {
  event.preventDefault()
  serviceContextMenu.value = {
    open: true,
    x: event.clientX,
    y: event.clientY,
    rowId: String(row?.id || ''),
  }
}

const openDeliveryContextMenu = (event, row) => {
  event.preventDefault()
  deliveryContextMenu.value = {
    open: true,
    x: event.clientX,
    y: event.clientY,
    rowId: String(row?.id || ''),
  }
}

const closeContextMenus = () => {
  productContextMenu.value.open = false
  serviceContextMenu.value.open = false
  deliveryContextMenu.value.open = false
  companyDropdownOpen.value = false
  clientDropdownOpen.value = false
  objectDropdownOpen.value = false
}

const selectWarehouseTreeItem = (group, item) => {
  const nomenclatureId = String(item?.nomenclature_id || '')
  if (nomenclatureId) {
    nomenclaturePricingMap.value = {
      ...nomenclaturePricingMap.value,
      [nomenclatureId]: {
        ...(nomenclaturePricingMap.value[nomenclatureId] || {}),
        vat_rate: normalizeVatRate(item?.vat_rate),
      },
    }
  }
  selectedWarehouseItem.value = {
    warehouse_id: String(item?.warehouse_id || group?.warehouse?.id || ''),
    warehouse_name: String(item?.warehouse_name || group?.warehouse?.name || ''),
    nomenclature_id: String(item?.nomenclature_id || ''),
    nomenclature_name: String(item?.nomenclature_name || ''),
    unit_name: String(item?.unit_name || '—'),
    quantity: normalizeMoney(item?.quantity),
    price: normalizeMoney(item?.price),
    vat_rate: normalizeVatRate(item?.vat_rate),
  }
  selectedWarehouseItemQty.value = getRemainingStockForCandidate(selectedWarehouseItem.value) > 0 ? 1 : 0
}

const addSelectedWarehouseItem = async () => {
  if (!deal.value?.id || !selectedWarehouseItem.value || !canAddSelectedWarehouseItem.value || productPickerSaving.value) return
  productPickerSaving.value = true
  productPickerError.value = ''
  try {
    const pricePurchase = normalizeMoney(selectedWarehouseItem.value.price)
    const price = pricePurchase
    const quantity = normalizeMoney(selectedWarehouseItemQty.value)
    const res = await fetch(`/apisup/supply/deals/${encodeURIComponent(deal.value.id)}/products`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nomenclature_id: selectedWarehouseItem.value.nomenclature_id,
        warehouse_id: selectedWarehouseItem.value.warehouse_id,
        price_purchase: pricePurchase,
        price,
        quantity,
      }),
    })
    if (!res.ok) throw new Error('deal product create failed')
    await loadDeal()
    await loadWarehouseAllItems()
    closeProductPicker()
  } catch {
    productPickerError.value = 'Не удалось добавить товар в сделку.'
  } finally {
    productPickerSaving.value = false
  }
}

const loadDeal = async () => {
  loading.value = true
  loadError.value = ''
  try {
    const res = await fetch(`/apisup/supply/deals/${encodeURIComponent(String(route.params.dealId || ''))}`, { credentials: 'include' })
    if (!res.ok) throw new Error('deal load failed')
    const payload = await res.json()
    deal.value = mapDeal(payload)
    ;(deal.value.items || []).forEach((row) => {
      row.vatRate = resolveVatRateForDealItem(row)
    })
    unlockedSectionIndex.value = deriveUnlockedSectionIndex(deal.value)
    if (!isSectionUnlocked(activeSection.value)) {
      activeSection.value = availableSections[Math.min(unlockedSectionIndex.value, availableSections.length - 1)].key
    }
    await Promise.all((deal.value.items || []).map((row) => inferPriceAccount(row)))
    await loadDealServices()
    await loadDealDeliveries()
    unlockedSectionIndex.value = deriveUnlockedSectionIndex(deal.value)
    await Promise.all([loadCounterparties(), loadObjects()])
    if (!allWarehouseItems.value.length) await loadWarehouseAllItems()
  } catch {
    deal.value = null
    loadError.value = 'Не удалось загрузить сделку.'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadDeal()
  window.addEventListener('mousedown', closeContextMenus)
})

onBeforeUnmount(() => {
  window.removeEventListener('mousedown', closeContextMenus)
})
</script>

<template>
  <div class="layout-shell">
    <TopNav :links="navLinks" />

    <main class="page-shell">
      <div v-if="loading" class="state-card">Загружаем сделку...</div>
      <div v-else-if="loadError || !deal" class="state-card">{{ loadError || 'Сделка не найдена.' }}</div>

      <template v-else>
        <header class="page-head">
          <div class="page-head__main">
            <button type="button" class="back-btn" @click="router.push(String(route.query.back || '/deals'))">
              <i class="fas fa-arrow-left"></i>
              Назад
            </button>
            <button type="button" class="chat-btn" title="Чат сделки" @click="chat.openPanel('deal', String(deal.id))">
              <i class="fas fa-comment-dots"></i>
            </button>
            <div class="title-wrap">
              <h1 class="title-text">{{ deal.title }}</h1>
              <div class="meta-line">
                <span class="mono">ID {{ deal.id }}</span>
                <span>Продавец: {{ deal.seller }}</span>
                <span>Покупатель: {{ deal.buyer }}</span>
                <span>Создатель: {{ deal.creator }}</span>
                <span>Создана: {{ formatDate(deal.createdAt) }}</span>
              </div>
            </div>
          </div>
          <span class="status-chip" :class="statusClass">{{ deal.statusName }}</span>
        </header>

        <div class="section-tabs">
          <button
            v-for="section in availableSections"
            :key="section.key"
            type="button"
            class="section-tab"
            :class="{ active: activeSection === section.key, disabled: !isSectionUnlocked(section.key) }"
            :disabled="!isSectionUnlocked(section.key)"
            @click="goToSection(section.key)"
          >
            {{ section.label }}
          </button>
        </div>

        <section v-if="activeSection === 'info'" class="card-shell">
          <div class="section-head">
            <div>
              <h2>Информация</h2>
              <p>Заполните основную информацию о сделке, компании и клиенте.</p>
            </div>
          </div>

          <div class="info-grid">
            <label class="field-group">
              <span>Название сделки</span>
              <input v-model="deal.title" class="field-control" type="text" :disabled="isDealLocked" @blur="onDealNameBlur">
            </label>

            <label class="field-group">
              <span>Дата сделки</span>
              <input v-model="dealDate" class="field-control" type="date" :disabled="isDealLocked" @blur="onDealDateBlur">
            </label>

            <label class="field-group">
              <span>Компания</span>
              <div class="lookup-wrap">
                <input
                  v-model="deal.seller"
                  class="field-control"
                  type="text"
                  placeholder="Начните писать компанию..."
                  :disabled="isDealLocked"
                  @focus="!isDealLocked && onSellerInput()"
                  @input="!isDealLocked && onSellerInput()"
                >
                <div v-if="companyDropdownOpen" class="lookup-menu">
                  <button type="button" class="lookup-option lookup-option-create" @mousedown.prevent="openCreateCounterparty">
                    + Создать контрагента
                  </button>
                  <button
                    v-for="item in filteredCompanyCounterparties"
                    :key="`seller-${item.id}`"
                    type="button"
                    class="lookup-option"
                    @mousedown.prevent="selectSellerCounterparty(item)"
                  >
                    <span>{{ item.short_name || item.full_name }}</span>
                  </button>
                </div>
              </div>
              <small class="field-hint">Доступны только выбранные компании группы.</small>
            </label>

            <label class="field-group">
              <span>Клиент</span>
              <div class="lookup-wrap">
                <input
                  v-model="deal.buyer"
                  class="field-control"
                  type="text"
                  placeholder="Начните писать клиента..."
                  :disabled="isDealLocked"
                  @focus="!isDealLocked && onBuyerInput()"
                  @input="!isDealLocked && onBuyerInput()"
                >
                <div v-if="clientDropdownOpen" class="lookup-menu">
                  <button type="button" class="lookup-option lookup-option-create" @mousedown.prevent="openCreateCounterparty">
                    + Создать контрагента
                  </button>
                  <button
                    v-for="item in filteredClientCounterparties"
                    :key="`buyer-${item.id}`"
                    type="button"
                    class="lookup-option"
                    @mousedown.prevent="selectBuyerCounterparty(item)"
                  >
                    <span>{{ item.short_name || item.full_name }}</span>
                  </button>
                </div>
              </div>
            </label>

            <label class="field-group">
              <span>Объект</span>
              <div class="lookup-wrap">
                <input
                  v-model="deal.object"
                  class="field-control"
                  type="text"
                  placeholder="Начните писать объект..."
                  :disabled="isDealLocked"
                  @focus="!isDealLocked && onObjectInput()"
                  @input="!isDealLocked && onObjectInput()"
                >
                <div v-if="objectDropdownOpen" class="lookup-menu">
                  <button
                    type="button"
                    class="lookup-option lookup-option-create"
                    @mousedown.prevent="clearObject"
                  >
                    Без объекта
                  </button>
                  <button
                    v-for="item in filteredObjects"
                    :key="`object-${item.id}`"
                    type="button"
                    class="lookup-option"
                    @mousedown.prevent="selectObject(item)"
                  >
                    <span>{{ item.short_name || item.full_name }}</span>
                  </button>
                </div>
              </div>
            </label>
          </div>

          <div v-if="!isDealLocked" class="section-footer">
            <button type="button" class="primary-btn" :disabled="!infoReady" @click="goNextSection">Далее</button>
          </div>
        </section>

        <section v-else-if="activeSection === 'items'" class="card-shell">
          <div class="section-head">
            <div>
              <h2>Товары</h2>
              <p>Позиции сделки по складам с закупочной и продажной ценой.</p>
            </div>
            <button v-if="!isDealLocked" type="button" class="primary-btn" @click="openProductPicker">Добавить товар</button>
          </div>

          <table class="deal-table">
            <thead>
              <tr>
                <th>Склад</th>
                <th>Товар</th>
                <th>Ед. изм.</th>
                <th>Кол-во</th>
                <th>Ост.</th>
                <th>Цена закупа</th>
                <th>НДС</th>
                <th>Цена продажи</th>
                <th>Наценка, %</th>
                <th>Счёт</th>
                <th>Сумма закупа</th>
                <th>Сумма продажи</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in deal.items" :key="row.id" @contextmenu="openProductContextMenu($event, row)">
                <td>{{ row.warehouseName }}</td>
                <td>
                  <div class="product-name-wrap">
                    <span>{{ row.productName }}</span>
                    <small v-if="productSavingMap[row.id]">Сохраняем...</small>
                  </div>
                </td>
                <td>{{ row.unitName }}</td>
                <td>
                  <input
                    v-model.number="row.quantity"
                    class="field-control qty-input"
                    type="number"
                    min="0"
                    step="any"
                    :disabled="isDealLocked"
                    @blur="onProductQuantityBlur(row)"
                  >

                </td>
                <td>{{ getAdditionalRemainingForRow(row) }}</td>
                <td>{{ money(row.pricePurchase) }}</td>
                <td>
                  <span class="vat-badge" :class="{ 'vat-badge--active': hasVat(row.vatRate) }">
                    {{ formatVatLabel(row.vatRate) }}
                  </span>
                </td>
                <td>
                  <input
                    v-model.number="row.price"
                    class="field-control price-input"
                    type="number"
                    min="0"
                    step="any"
                    :disabled="isDealLocked"
                    @input="row.priceAccount = 'free'"
                    @blur="onProductPriceBlur(row)"
                  >
                </td>
                <td>
                  <input
                    v-model.number="row.markupPercent"
                    class="field-control markup-input"
                    :class="{ 'field-control-negative': normalizeMoney(row.markupPercent) < 0 }"
                    type="number"
                    step="any"
                    :disabled="isDealLocked"
                    @blur="onProductMarkupBlur(row)"
                  >
                </td>
                <td>
                  <select
                    v-model="row.priceAccount"
                    class="field-control"
                    :disabled="isDealLocked"
                    @change="onPriceAccountChange(row)"
                  >
                    <option v-for="option in PRICE_ACCOUNT_OPTIONS" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </option>
                  </select>
                </td>
                <td>{{ money(row.quantity * row.pricePurchase) }}</td>
                <td>{{ money(row.quantity * row.price) }}</td>
              </tr>
              <tr v-if="!deal.items.length">
                <td colspan="12" class="empty-row">Пока нет товаров.</td>
              </tr>
            </tbody>
          </table>

          <div v-if="!isDealLocked" class="section-footer">
            <button type="button" class="primary-btn" @click="goNextSection">Далее</button>
          </div>
        </section>

        <section v-else-if="activeSection === 'services'" class="card-shell">
          <div class="section-head">
            <div>
              <h2>Услуги</h2>
              <p>Услуги сделки с закупочной и продажной ценой.</p>
            </div>
            <button v-if="!isDealLocked" type="button" class="primary-btn" @click="createDealService">Добавить услугу</button>
          </div>

          <table class="deal-table">
            <thead>
              <tr>
                <th>Услуга</th>
                <th>Ед. изм.</th>
                <th>Кол-во</th>
                <th>Цена закупа</th>
                <th>Цена продажи</th>
                <th>Наценка, %</th>
                <th>Сумма закупа</th>
                <th>Сумма продажи</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in deal.services" :key="row.id" @contextmenu="openServiceContextMenu($event, row)">
                <td>
                  <input v-model="row.name" class="field-control" type="text" :disabled="isDealLocked" @blur="onServiceFieldBlur(row)">
                  <small v-if="serviceSavingMap[row.id]">Сохраняем...</small>
                </td>
                <td><input v-model="row.unitName" class="field-control" type="text" :disabled="isDealLocked" @blur="onServiceFieldBlur(row)"></td>
                <td>
                  <input v-model.number="row.quantity" class="field-control qty-input" type="number" min="0" step="any" :disabled="isDealLocked" @blur="onServiceFieldBlur(row)">
                </td>
                <td><input v-model.number="row.pricePurchase" class="field-control price-input" type="number" min="0" step="any" :disabled="isDealLocked" @blur="onServiceFieldBlur(row)"></td>
                <td><input v-model.number="row.price" class="field-control price-input" type="number" min="0" step="any" :disabled="isDealLocked" @blur="onServiceFieldBlur(row)"></td>
                <td>
                  <input
                    v-model.number="row.markupPercent"
                    class="field-control markup-input"
                    :class="{ 'field-control-negative': normalizeMoney(row.markupPercent) < 0 }"
                    type="number"
                    step="any"
                    :disabled="isDealLocked"
                    @blur="onServiceMarkupBlur(row)"
                  >
                </td>
                <td>{{ money(row.quantity * row.pricePurchase) }}</td>
                <td>{{ money(row.quantity * row.price) }}</td>
                <td></td>
              </tr>
              <tr v-if="!deal.services.length">
                <td colspan="9" class="empty-row">Пока нет услуг.</td>
              </tr>
            </tbody>
          </table>

          <div v-if="!isDealLocked" class="section-footer">
            <button type="button" class="primary-btn" @click="goNextSection">Далее</button>
          </div>
        </section>

        <section v-else-if="activeSection === 'deliveries'" class="card-shell">
          <div class="section-head">
            <div>
              <h2>Доставка</h2>
              <p>Внутренняя или внешняя доставка с закупочной и продажной стоимостью.</p>
            </div>
            <button v-if="!isDealLocked" type="button" class="primary-btn" @click="createDealDelivery">Добавить доставку</button>
          </div>

          <table class="deal-table">
            <thead>
              <tr>
                <th>Тип доставки</th>
                <th>Цена закупа</th>
                <th>Наценка, %</th>
                <th>Цена продажи</th>
                <th>Комментарий</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in deal.deliveries" :key="row.id" @contextmenu="openDeliveryContextMenu($event, row)">
                <td>
                  <select v-model="row.type" class="field-control" :disabled="isDealLocked" @change="onDeliveryFieldBlur(row)">
                    <option value="internal">Внутренняя доставка</option>
                    <option value="external">Внешняя доставка</option>
                  </select>
                </td>
                <td><input v-model.number="row.pricePurchase" class="field-control price-input" type="number" min="0" step="any" :disabled="isDealLocked" @blur="onDeliveryFieldBlur(row)"></td>
                <td>
                  <input
                    v-model.number="row.markupPercent"
                    class="field-control markup-input"
                    :class="{ 'field-control-negative': normalizeMoney(row.markupPercent) < 0 }"
                    type="number"
                    step="any"
                    :disabled="isDealLocked"
                    @blur="onDeliveryMarkupBlur(row)"
                  >
                </td>
                <td><input v-model.number="row.price" class="field-control price-input" type="number" min="0" step="any" :disabled="isDealLocked" @blur="onDeliveryFieldBlur(row)"></td>
                <td>
                  <input v-model="row.comment" class="field-control" type="text" :disabled="isDealLocked" @blur="onDeliveryFieldBlur(row)">
                  <small v-if="deliverySavingMap[row.id]">Сохраняем...</small>
                </td>
              </tr>
              <tr v-if="!deal.deliveries.length">
                <td colspan="5" class="empty-row">Пока нет доставок.</td>
              </tr>
            </tbody>
          </table>

          <div v-if="!isDealLocked" class="section-footer">
            <button type="button" class="primary-btn" @click="goNextSection">Далее</button>
          </div>
        </section>

        <section v-else class="card-shell">
          <div class="section-head">
            <div>
              <h2>Калькуляция</h2>
              <p>Итоги по закупке, продаже и прибыли по разделам.</p>
            </div>
            <div class="section-head-actions">
              <button type="button" class="secondary-btn" :disabled="!deal || (!deal.items.length && !deal.services.length)" @click="printCommercialProposal">
                Сформировать КП
              </button>
              <button
                v-if="canConductDeal"
                type="button"
                class="primary-btn conduct-btn"
                :disabled="conductLoading"
                @click="conductDeal"
              >
                {{ conductLoading ? 'Проводим...' : 'Провести сделку' }}
              </button>
              <button
                v-if="canConfirmPayment"
                type="button"
                class="primary-btn confirm-pay-btn"
                :disabled="payLoading"
                @click="confirmPayment"
              >
                {{ payLoading ? 'Сохраняем...' : 'Подтвердить оплату' }}
              </button>
            </div>
          </div>

          <div class="calc-settings">
            <label class="field-group">
              <span>Способ оплаты</span>
              <select v-model="paymentMode" class="field-control" @change="patchDealModes">
                <option value="cash">Наличный</option>
                <option value="non-cash">Безналичный</option>
              </select>
            </label>

            <label v-if="isAgencyCompany" class="field-group">
              <span>Расчёт</span>
              <select v-model="agencyMode" class="field-control" @change="patchDealModes">
                <option value="without_agent">Без агентского договора</option>
                <option value="with_agent">С агентским договором</option>
              </select>
            </label>
          </div>

          <!-- Карточки по разделам -->
          <div class="calc-grid">
            <article class="calc-card calc-card--items">
              <div class="calc-card-header">
                <div class="calc-card-icon calc-card-icon--items">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                </div>
                <div>
                  <div class="calc-card-title">Товары</div>
                  <div class="calc-card-badge" :class="(itemTotal - itemBase) >= 0 ? 'badge-profit' : 'badge-loss'">
                    {{ itemTotal > 0 ? (((itemTotal - itemBase) / itemTotal) * 100).toFixed(1) + '% маржа' : '—' }}
                  </div>
                </div>
              </div>
              <div class="calc-amount">{{ money(itemTotal) }}</div>
              <div class="calc-divider"></div>
              <div class="calc-row">
                <span class="calc-row-label">Себестоимость</span>
                <span class="calc-row-value">{{ money(itemBase) }}</span>
              </div>
              <div class="calc-row calc-row--profit">
                <span class="calc-row-label">Прибыль</span>
                <span class="calc-row-value" :class="(itemTotal - itemBase) >= 0 ? 'text-profit' : 'text-loss'">{{ money(itemTotal - itemBase) }}</span>
              </div>
              <div class="calc-bar-wrap">
                <div class="calc-bar" :style="{ width: itemTotal > 0 ? Math.min(((itemTotal - itemBase) / itemTotal * 100), 100) + '%' : '0%' }" :class="(itemTotal - itemBase) >= 0 ? 'calc-bar--green' : 'calc-bar--red'"></div>
              </div>
            </article>

            <article class="calc-card calc-card--services">
              <div class="calc-card-header">
                <div class="calc-card-icon calc-card-icon--services">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07M8.46 8.46a5 5 0 0 0 0 7.07"/></svg>
                </div>
                <div>
                  <div class="calc-card-title">Услуги</div>
                  <div class="calc-card-badge" :class="(serviceTotal - serviceBase) >= 0 ? 'badge-profit' : 'badge-loss'">
                    {{ serviceTotal > 0 ? (((serviceTotal - serviceBase) / serviceTotal) * 100).toFixed(1) + '% маржа' : '—' }}
                  </div>
                </div>
              </div>
              <div class="calc-amount">{{ money(serviceTotal) }}</div>
              <div class="calc-divider"></div>
              <div class="calc-row">
                <span class="calc-row-label">Себестоимость</span>
                <span class="calc-row-value">{{ money(serviceBase) }}</span>
              </div>
              <div class="calc-row calc-row--profit">
                <span class="calc-row-label">Прибыль</span>
                <span class="calc-row-value" :class="(serviceTotal - serviceBase) >= 0 ? 'text-profit' : 'text-loss'">{{ money(serviceTotal - serviceBase) }}</span>
              </div>
              <div class="calc-bar-wrap">
                <div class="calc-bar" :style="{ width: serviceTotal > 0 ? Math.min(((serviceTotal - serviceBase) / serviceTotal * 100), 100) + '%' : '0%' }" :class="(serviceTotal - serviceBase) >= 0 ? 'calc-bar--green' : 'calc-bar--red'"></div>
              </div>
            </article>

            <article class="calc-card calc-card--delivery">
              <div class="calc-card-header">
                <div class="calc-card-icon calc-card-icon--delivery">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
                </div>
                <div>
                  <div class="calc-card-title">Доставка</div>
                  <div class="calc-card-badge" :class="(deliveryTotal - deliveryBase) >= 0 ? 'badge-profit' : 'badge-loss'">
                    {{ deliveryTotal > 0 ? (((deliveryTotal - deliveryBase) / deliveryTotal) * 100).toFixed(1) + '% маржа' : '—' }}
                  </div>
                </div>
              </div>
              <div class="calc-amount">{{ money(deliveryTotal) }}</div>
              <div class="calc-divider"></div>
              <div class="calc-row">
                <span class="calc-row-label">Себестоимость</span>
                <span class="calc-row-value">{{ money(deliveryBase) }}</span>
              </div>
              <div class="calc-row calc-row--profit">
                <span class="calc-row-label">Прибыль</span>
                <span class="calc-row-value" :class="(deliveryTotal - deliveryBase) >= 0 ? 'text-profit' : 'text-loss'">{{ money(deliveryTotal - deliveryBase) }}</span>
              </div>
              <div class="calc-bar-wrap">
                <div class="calc-bar" :style="{ width: deliveryTotal > 0 ? Math.min(((deliveryTotal - deliveryBase) / deliveryTotal * 100), 100) + '%' : '0%' }" :class="(deliveryTotal - deliveryBase) >= 0 ? 'calc-bar--green' : 'calc-bar--red'"></div>
              </div>
            </article>
          </div>

          <!-- Итоговая карточка -->
          <div class="summary-card">
            <div class="summary-top">
              <div class="summary-top-left">
                <div class="summary-label">Чистая прибыль</div>
                <div class="summary-profit" :class="netProfit >= 0 ? 'text-profit' : 'text-loss'">
                  {{ money(netProfit) }}
                </div>
                <div class="summary-margin" v-if="subtotal > 0">
                  Маржа: <strong :class="netProfit >= 0 ? 'text-profit' : 'text-loss'">{{ ((netProfit / subtotal) * 100).toFixed(1) }}%</strong>
                </div>
              </div>
              <div class="summary-donut-wrap">
                <svg class="summary-donut" viewBox="0 0 64 64" width="80" height="80">
                  <circle cx="32" cy="32" r="26" fill="none" stroke="var(--border-light)" stroke-width="8"/>
                  <circle
                    cx="32" cy="32" r="26" fill="none"
                    :stroke="netProfit >= 0 ? 'var(--calc-profit)' : 'var(--calc-loss)'"
                    stroke-width="8"
                    stroke-linecap="round"
                    :stroke-dasharray="`${subtotal > 0 ? Math.min(Math.abs(netProfit / subtotal) * 163.36, 163.36) : 0} 163.36`"
                    stroke-dashoffset="40.84"
                    style="transition: stroke-dasharray 0.6s ease"
                  />
                </svg>
                <div class="summary-donut-label">{{ subtotal > 0 ? ((Math.abs(netProfit) / subtotal) * 100).toFixed(0) + '%' : '—' }}</div>
              </div>
            </div>

            <div class="summary-rows">
              <div class="summary-row">
                <span>Общая себестоимость</span>
                <strong>{{ money(totalPurchase) }}</strong>
              </div>
              <div class="summary-row">
                <span>Стоимость продажи</span>
                <strong>{{ money(subtotal) }}</strong>
              </div>
              <div
                v-for="taxLine in extraTaxes"
                :key="taxLine.label"
                class="tax-group"
              >
                <div class="summary-row">
                  <span>{{ taxLine.label }}</span>
                  <strong>{{ money(taxLine.value) }}</strong>
                </div>
                <div
                  v-for="detail in taxLine.details || []"
                  :key="`${taxLine.label}-${detail.label}`"
                  class="summary-subrow"
                >
                  <span>{{ detail.label }}</span>
                  <strong>{{ money(detail.value) }}</strong>
                </div>
              </div>
              <div class="summary-row">
                <span>Сумма налогов</span>
                <strong>{{ money(totalTax) }}</strong>
              </div>
            </div>
          </div>
        </section>
      </template>
    </main>

    <div v-if="productPickerOpen" class="modal-backdrop" @click.self="closeProductPicker">
      <div class="modal-card modal-card-wide">
        <div class="modal-header">
          <div>
            <h3>Добавить товар</h3>
            <p>Выберите позицию со склада и укажите количество.</p>
          </div>
          <button type="button" class="icon-close" @click="closeProductPicker">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <div class="picker-search-row">
          <input
            v-model="productPickerQuery"
            class="field-control"
            type="text"
            placeholder="Поиск по складам и товарам..."
            @input="loadWarehouseAllItems"
          >
        </div>

        <div class="picker-layout">
          <div class="picker-tree">
            <div v-if="productPickerLoading" class="picker-state">Загружаем товары...</div>
            <div v-else-if="productPickerError" class="picker-state">{{ productPickerError }}</div>
            <div v-else-if="!productPickerGroups.length" class="picker-state">Ничего не найдено.</div>
            <div v-else class="warehouse-tree">
              <section
                v-for="group in productPickerGroups"
                :key="group?.warehouse?.id || group?.warehouse?.name"
                class="warehouse-group"
              >
                <header class="warehouse-group__title">{{ group?.warehouse?.name || 'Склад' }}</header>
                <button
                  v-for="item in (Array.isArray(group?.items) ? group.items : [])"
                  :key="`${group?.warehouse?.id}-${item?.nomenclature_id}-${item?.id || item?.row_ids?.[0] || ''}`"
                  type="button"
                  class="warehouse-item-btn"
                  :class="{ active: selectedWarehouseItem?.nomenclature_id === item?.nomenclature_id && selectedWarehouseItem?.warehouse_id === item?.warehouse_id }"
                  @click="selectWarehouseTreeItem(group, item)"
                >
                  <span class="warehouse-item-name">{{ item?.nomenclature_name || 'Без названия' }}</span>
                  <small>
                    Доступно: {{ getRemainingStockForCandidate(item) }} {{ item?.unit_name || '' }}
                    · Закуп: {{ money(item?.price) }}
                    · {{ formatVatLabel(item?.vat_rate) }}
                  </small>
                </button>
              </section>
            </div>
          </div>

          <aside class="picker-sidebar">
            <div class="picker-summary">
              <h4>{{ selectedWarehouseItem?.nomenclature_name || 'Выберите товар' }}</h4>
              <p v-if="selectedWarehouseItem">Склад: {{ selectedWarehouseItem.warehouse_name }}</p>
              <p v-if="selectedWarehouseItem">Доступно: {{ getRemainingStockForCandidate(selectedWarehouseItem) }} {{ selectedWarehouseItem.unit_name }}</p>
              <p v-if="selectedWarehouseItem">Цена закупа: {{ money(selectedWarehouseItem.price) }}</p>
              <p v-if="selectedWarehouseItem">НДС: {{ formatVatLabel(selectedWarehouseItem.vat_rate) }}</p>
            </div>

            <label class="picker-qty-label">
              Количество
              <input
                v-model.number="selectedWarehouseItemQty"
                class="field-control"
                type="number"
                min="0"
                step="any"
                :disabled="!selectedWarehouseItem"
              >
            </label>

            <div class="modal-actions">
              <button type="button" class="secondary-btn" @click="closeProductPicker">Отмена</button>
              <button type="button" class="primary-btn" :disabled="!canAddSelectedWarehouseItem || productPickerSaving" @click="addSelectedWarehouseItem">
                {{ productPickerSaving ? 'Добавляем...' : 'Добавить' }}
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>

    <div
      v-if="productContextMenu.open"
      class="context-menu"
      @mousedown.stop
      :style="{ left: `${productContextMenu.x}px`, top: `${productContextMenu.y}px` }"
    >
      <button type="button" class="context-menu__item context-menu__item--danger" @click="requestDeleteProduct(productContextMenu.rowId)">
        Удалить
      </button>
    </div>

    <div
      v-if="serviceContextMenu.open"
      class="context-menu"
      @mousedown.stop
      :style="{ left: `${serviceContextMenu.x}px`, top: `${serviceContextMenu.y}px` }"
    >
      <button type="button" class="context-menu__item context-menu__item--danger" @click="requestDeleteService(serviceContextMenu.rowId)">
        Удалить
      </button>
    </div>

    <div
      v-if="deliveryContextMenu.open"
      class="context-menu"
      @mousedown.stop
      :style="{ left: `${deliveryContextMenu.x}px`, top: `${deliveryContextMenu.y}px` }"
    >
      <button type="button" class="context-menu__item context-menu__item--danger" @click="requestDeleteDelivery(deliveryContextMenu.rowId)">
        Удалить
      </button>
    </div>

    <div v-if="deleteProductModalOpen" class="modal-backdrop" @click.self="closeDeleteProductModal">
      <div class="modal-card modal-card-small">
        <div class="modal-header">
          <div>
            <h3>Удалить позицию</h3>
            <p>Позиция будет удалена из сделки. Продолжаем?</p>
          </div>
        </div>

        <div class="modal-actions">
          <button type="button" class="secondary-btn" @click="closeDeleteProductModal">Отмена</button>
          <button type="button" class="primary-btn danger-primary" @click="confirmDeleteProduct">Удалить</button>
        </div>
      </div>
    </div>

    <div v-if="deleteServiceModalOpen" class="modal-backdrop" @click.self="closeDeleteServiceModal">
      <div class="modal-card modal-card-small">
        <div class="modal-header">
          <div>
            <h3>Удалить услугу</h3>
            <p>Услуга будет удалена из сделки. Продолжаем?</p>
          </div>
        </div>

        <div class="modal-actions">
          <button type="button" class="secondary-btn" @click="closeDeleteServiceModal">Отмена</button>
          <button type="button" class="primary-btn danger-primary" @click="confirmDeleteService">Удалить</button>
        </div>
      </div>
    </div>

    <div v-if="deleteDeliveryModalOpen" class="modal-backdrop" @click.self="closeDeleteDeliveryModal">
      <div class="modal-card modal-card-small">
        <div class="modal-header">
          <div>
            <h3>Удалить доставку</h3>
            <p>Строка доставки будет удалена из сделки. Продолжаем?</p>
          </div>
        </div>

        <div class="modal-actions">
          <button type="button" class="secondary-btn" @click="closeDeleteDeliveryModal">Отмена</button>
          <button type="button" class="primary-btn danger-primary" @click="confirmDeleteDelivery">Удалить</button>
        </div>
      </div>
    </div>
  </div>
  <ChatPanel v-if="chat.panelOpen" @close="chat.closePanel()" />
</template>

<style scoped>
.layout-shell {
  width: 100%;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-body);
}

.page-shell {
  flex: 1;
  padding: 24px;
  overflow: auto;
}

.state-card,
.page-head,
.calc-grid,
.summary-card {
  margin-bottom: 18px;
}

.state-card {
  border: 1px solid var(--border-light);
  border-radius: 18px;
  background: var(--bg-surface);
  padding: 28px;
  color: var(--text-secondary);
}

.page-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 18px;
}

.page-head__main {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.title-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.title-text {
  margin: 0;
  font-size: 24px;
  line-height: 1.2;
  color: var(--text-primary);
}

.meta-line {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.meta-line > span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.mono {
  font-family: 'JetBrains Mono', monospace;
  font-weight: 500;
  color: var(--text-secondary);
}

.back-btn {
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: var(--bg-surface);
  padding: 10px 12px;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease;
}

.back-btn:hover {
  background: var(--bg-subtle);
  border-color: var(--border-hover);
}

.chat-btn {
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: var(--bg-surface);
  padding: 10px 12px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  color: var(--text-secondary);
  transition: all 0.2s;
  flex-shrink: 0;
}

.chat-btn:hover {
  background: var(--bg-subtle);
  color: var(--brand-primary);
}

.status-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  flex-shrink: 0;
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

.section-tabs {
  display: flex;
  gap: 4px;
  background: var(--bg-subtle);
  border-radius: var(--radius-lg);
  padding: 4px;
  margin-bottom: 18px;
}

.section-tab {
  flex: 1;
  border: none;
  background: transparent;
  padding: 10px 16px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.section-tab.active {
  background: var(--bg-surface);
  color: var(--text-primary);
  box-shadow: var(--shadow-sm);
}

.section-tab.disabled {
  opacity: 0.5;
  cursor: default;
}

.card-shell {
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: 18px;
  padding: 24px;
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 18px;
}

.section-head h2 {
  margin: 0 0 4px;
  font-size: 18px;
  color: var(--text-primary);
}

.section-head p {
  margin: 0;
  font-size: 13px;
  color: var(--text-tertiary);
}

.section-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 18px;
  padding-top: 18px;
  border-top: 1px solid var(--border-light);
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-group > span {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.field-hint {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-top: 2px;
}

.field-control {
  width: 100%;
  min-height: 40px;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background: var(--bg-surface);
  color: var(--text-primary);
  padding: 0 12px;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.field-control:focus {
  border-color: var(--brand-primary);
  box-shadow: 0 0 0 2px var(--brand-soft);
  background: var(--bg-surface);
}

select.field-control {
  padding: 8px 12px;
}

.qty-input,
.price-input,
.markup-input {
  width: 100%;
  min-height: 32px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  background: var(--bg-surface);
  color: var(--text-primary);
  padding: 0 8px;
  font-size: 13px;
  outline: none;
  box-sizing: border-box;
  text-align: right;
}

.qty-input:focus,
.price-input:focus,
.markup-input:focus {
  border-color: var(--brand-primary);
  box-shadow: 0 0 0 2px var(--brand-soft);
}

.qty-error {
  display: block;
  font-size: 11px;
  color: var(--danger-text);
  margin-top: 2px;
}

.lookup-wrap {
  position: relative;
}

.lookup-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 50;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  box-shadow: var(--shadow-md);
  max-height: 220px;
  overflow: auto;
  padding: 6px;
}

.lookup-option {
  width: 100%;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  text-align: left;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-primary);
}

.lookup-option:hover {
  background: var(--bg-subtle);
}

.lookup-option-create {
  font-weight: 600;
  color: var(--brand-primary);
  border-bottom: 1px solid var(--border-light);
  margin-bottom: 4px;
  padding-bottom: 10px;
}

.deal-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.deal-table th,
.deal-table td {
  padding: 10px 12px;
  border: 1px solid var(--border-light);
  text-align: left;
  vertical-align: middle;
}

.deal-table th {
  background: var(--bg-subtle);
  font-weight: 700;
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.deal-table td:has(.qty-input),
.deal-table td:has(.price-input),
.deal-table td:has(.markup-input) {
  padding: 4px 6px;
}

.product-name-wrap {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.product-name-wrap small {
  font-size: 11px;
  color: var(--text-tertiary);
}

.empty-row {
  text-align: center;
  padding: 24px 12px;
  color: var(--text-tertiary);
  font-size: 13px;
}

.vat-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-weight: 500;
  background: var(--bg-subtle);
  color: var(--text-tertiary);
  border: 1px solid var(--border-light);
}

/* ── Calc variables ── */
.card-shell {
  --calc-profit: #16a34a;
  --calc-loss: #dc2626;
}

/* ── Settings row ── */
.calc-settings {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
}

/* ── Section cards grid ── */
.calc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 14px;
  margin-top: 10px;
  margin-bottom: 16px;
}

.calc-card {
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  padding: 20px;
  background: var(--bg-surface);
  box-shadow: var(--shadow-sm);
  transition: box-shadow 0.2s, transform 0.2s;
  position: relative;
  overflow: hidden;
}
.calc-card:hover {
  box-shadow: var(--shadow-md, 0 4px 16px rgba(0,0,0,.08));
  transform: translateY(-1px);
}

/* left accent stripe */
.calc-card::before {
  content: '';
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 3px;
  border-radius: 3px 0 0 3px;
}
.calc-card--items::before    { background: #3b82f6; }
.calc-card--services::before { background: #8b5cf6; }
.calc-card--delivery::before { background: #f59e0b; }

.calc-card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}
.calc-card-icon {
  width: 30px;
  height: 30px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.calc-card-icon--items    { background: rgba(59,130,246,.12); color: #3b82f6; }
.calc-card-icon--services { background: rgba(139,92,246,.12); color: #8b5cf6; }
.calc-card-icon--delivery { background: rgba(245,158,11,.12); color: #f59e0b; }
.calc-card-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.2;
}
.calc-card-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 100px;
  margin-top: 3px;
  display: inline-block;
}
.badge-profit { background: rgba(22,163,74,.12); color: var(--calc-profit); }
.badge-loss   { background: rgba(220,38,38,.12); color: var(--calc-loss); }

.calc-amount {
  font-size: 22px;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: -0.5px;
  margin-bottom: 12px;
}

.calc-divider {
  height: 1px;
  background: var(--border-light);
  margin-bottom: 10px;
}

.calc-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
}
.calc-row-label {
  font-size: 12px;
  color: var(--text-secondary);
}
.calc-row-value {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}
.calc-row--profit {
  margin-top: 2px;
}
.text-profit { color: var(--calc-profit) !important; }
.text-loss   { color: var(--calc-loss)   !important; }

/* mini progress bar */
.calc-bar-wrap {
  height: 4px;
  background: var(--border-light);
  border-radius: 4px;
  margin-top: 12px;
  overflow: hidden;
}
.calc-bar {
  height: 100%;
  border-radius: 4px;
  transition: width 0.6s ease;
}
.calc-bar--green { background: var(--calc-profit); }
.calc-bar--red   { background: var(--calc-loss); }

/* ── Summary card ── */
.summary-card {
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

.summary-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  background: var(--bg-subtle);
  border-bottom: 1px solid var(--border-light);
  gap: 16px;
}
.summary-top-left {
  flex: 1;
}
.summary-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary);
  margin-bottom: 4px;
}
.summary-profit {
  font-size: 28px;
  font-weight: 800;
  letter-spacing: -1px;
  line-height: 1.1;
}
.summary-margin {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}

/* donut */
.summary-donut-wrap {
  position: relative;
  width: 80px;
  height: 80px;
  flex-shrink: 0;
}
.summary-donut {
  transform: rotate(-90deg);
}
.summary-donut-label {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}

/* rows section */
.summary-rows {
  padding: 8px 24px 16px;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  font-size: 13px;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-light);
}
.summary-row:last-of-type {
  border-bottom: none;
}
.summary-row strong {
  color: var(--text-primary);
  font-weight: 600;
}

.summary-subrow {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0 4px 12px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.tax-group {
  border-top: 1px solid var(--border-light);
  padding-top: 4px;
  margin-top: 4px;
}

.section-head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.primary-btn {
  border: none;
  border-radius: var(--radius-md);
  padding: 10px 18px;
  background: var(--brand-primary);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.primary-btn:hover {
  background: var(--brand-hover);
}

.primary-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.conduct-btn {
  background: #16a34a;
}
.conduct-btn:hover:not(:disabled) {
  background: #15803d;
}

.confirm-pay-btn {
  background: #7c3aed;
}
.confirm-pay-btn:hover:not(:disabled) {
  background: #6d28d9;
}

.secondary-btn {
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: 10px 18px;
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: var(--shadow-sm);
}

.secondary-btn:hover {
  background: var(--bg-subtle);
  border-color: var(--border-hover);
}

.picker-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  padding: 20px;
}

.modal-card,
.modal-card-wide {
  background: var(--bg-surface);
  border-radius: var(--radius-lg);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
  max-height: 90vh;
  width: 480px;
}

.modal-card-wide {
  width: 820px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 20px 24px 0;
}

.modal-header h3 {
  margin: 0 0 4px;
  font-size: 17px;
  color: var(--text-primary);
}

.modal-header p {
  margin: 0;
  font-size: 13px;
  color: var(--text-tertiary);
}

.icon-close {
  background: none;
  border: none;
  color: var(--text-tertiary);
  font-size: 18px;
  cursor: pointer;
  padding: 4px;
  line-height: 1;
}

.icon-close:hover {
  color: var(--text-primary);
}

.picker-search-row {
  padding: 16px 24px 0;
}

.picker-tree {
  overflow-y: auto;
  max-height: 50vh;
  padding: 0 8px 0 24px;
}

.picker-sidebar {
  padding: 0 24px 16px 8px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.picker-summary h4 {
  margin: 0 0 6px;
  font-size: 14px;
  color: var(--text-primary);
}

.picker-summary p {
  margin: 2px 0;
  font-size: 13px;
  color: var(--text-tertiary);
}

.picker-qty-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.picker-state {
  text-align: center;
  padding: 40px 0;
  color: var(--text-tertiary);
  font-size: 14px;
}

.warehouse-tree {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.warehouse-group {
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.warehouse-group__title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-tertiary);
  padding: 8px 12px;
  background: var(--bg-subtle);
  border-bottom: 1px solid var(--border-light);
}

.warehouse-item-btn {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  border: none;
  border-bottom: 1px solid var(--border-light);
  padding: 8px 12px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s;
}

.warehouse-item-btn:last-child {
  border-bottom: none;
}

.warehouse-item-btn:hover {
  background: var(--bg-hover);
}

.warehouse-item-btn.active {
  background: var(--brand-bg);
  border-left: 3px solid var(--brand-primary);
}

.warehouse-item-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.warehouse-item-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.warehouse-item-btn small {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-top: 2px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 24px;
  border-top: 1px solid var(--border-light);
}

.context-menu {
  position: fixed;
  z-index: 1100;
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  min-width: 140px;
}

.context-menu__item {
  display: block;
  width: 100%;
  border: none;
  background: transparent;
  padding: 10px 16px;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  color: var(--text-primary);
}

.context-menu__item:hover {
  background: var(--bg-hover);
}

.context-menu__item--danger {
  color: var(--danger);
}

.context-menu__item--danger:hover {
  background: var(--danger-bg);
}

.qty-error {
  display: block;
  color: var(--danger);
  font-size: 11px;
  margin-top: 2px;
}
</style>
