<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TopNav from '../components/layout/TopNav.vue'
import CustomPdfPreview from '../components/pdf/CustomPdfPreview.vue'
import { mainNavLinks } from '../constants/mainNav'

const route = useRoute()
const router = useRouter()

const navLinks = mainNavLinks

const requestIdValue = ref(String(route.query.request_id || ''))
const requestId = computed(() => String(requestIdValue.value || '—'))
const invoiceId = computed(() => String(route.params.invoiceId || 'new'))
const hasRequest = computed(() => {
  const raw = String(requestIdValue.value ?? '').trim().toLowerCase()
  return raw !== '' && raw !== '0' && raw !== 'null' && raw !== 'undefined'
})
const maxStep = computed(() => (hasRequest.value ? 3 : 2))
const invoiceLoading = ref(false)
const invoiceError = ref('')
const invoiceStatusName = ref('')
const invoiceFileName = ref('')
const invoicePdfUrl = ref('')
const invoiceFilePath = ref('')
const invoiceFileInput = ref(null)
const invoiceFileUploading = ref(false)
const saving = ref(false)
const recognizing = ref(false)
const autoMatching = ref(false)
const isHydratingInvoice = ref(false)
const autoSavePending = ref(false)
let autoSaveTimer = null

const step = ref(1)
const showPdf = ref(true)
const showPdfBeforeStep3 = ref(true)
const hideLinkedPositions = ref(false)
const matchingMode = ref('1to1')

const supplier = ref({
  inn: '',
  kpp: '',
  name: '',
  account: '',
})

const payer = ref({
  inn: '',
  kpp: '',
  name: '',
  account: '',
})

const invoiceDate = ref('')
const invoiceNumber = ref('')

const vatMode = ref('line')
const vatCommon = ref('no')
const vatRate = ref('')
const vatAmount = ref('')
const invoiceAmount = ref('')
const deliveryIncluded = ref(false)
const prepaymentRequired = ref(false)
const prepaymentPercent = ref('')
const defermentProvided = ref(false)
const defermentDays = ref('')
const invoiceValidityDays = ref('')
const urgentInvoice = ref(false)

const sendModalOpen = ref(false)
const sendingApprovals = ref(false)
const selectedApproverIds = ref([])
const approverQuery = ref('')
const approverDropdownOpen = ref(false)
const approverOptions = ref([])
const FIXED_PLANNING_USER_ID = '8f1d6ffd-6652-4719-a426-5b21412d7c56'
const FIXED_PAYMENT_USER_ID = '06968a8b-e24c-4099-998d-3d4c16ebc63a'

const fromByUserId = ref('')
const fromByUserQuery = ref('')
const fromByUserOpen = ref(false)
const allUsers = ref([])
const allUsersLoading = ref(false)

const projectObjectId = ref('')
const projectObjectQuery = ref('')
const projectObjectOpen = ref(false)
const projectObjects = ref([])
const projectObjectsLoading = ref(false)

const selectedObjectId = ref('')
const objects = ref([])
const objectsLoading = ref(false)

const filteredFromByUsers = computed(() => {
  const q = fromByUserQuery.value.trim().toLowerCase()
  if (!q) return allUsers.value
  return allUsers.value.filter((user) => {
    const full = [user.surname, user.name, user.patronymic, user.fio, user.short_fio].filter(Boolean).join(' ').toLowerCase()
    return full.includes(q)
  })
})

const combinedProjectItems = computed(() => {
  const items = []
  for (const obj of objects.value) {
    items.push({ id: obj.id, name: obj.short_name || obj.name || '—', type: 'object' })
  }
  for (const proj of projectObjects.value) {
    items.push({ id: proj.id, name: proj.name || '—', type: 'object_levels_id' })
  }
  return items
})

const filteredProjectObjects = computed(() => {
  const q = projectObjectQuery.value.trim().toLowerCase()
  if (!q) return combinedProjectItems.value
  return combinedProjectItems.value.filter((item) => String(item.name || '').toLowerCase().includes(q))
})

const counterparties = ref([])
const counterpartiesLoading = ref(false)
const supplierQuery = ref('')
const payerQuery = ref('')
const supplierOpen = ref(false)
const payerOpen = ref(false)

const filteredSuppliers = computed(() => {
  const q = supplierQuery.value.trim().toLowerCase()
  if (!q) return counterparties.value
  return counterparties.value.filter((item) =>
    String(item.name || '').toLowerCase().includes(q)
    || String(item.inn || '').toLowerCase().includes(q))
})

const filteredPayers = computed(() => {
  const q = payerQuery.value.trim().toLowerCase()
  if (!q) return counterparties.value
  return counterparties.value.filter((item) =>
    String(item.name || '').toLowerCase().includes(q)
    || String(item.inn || '').toLowerCase().includes(q))
})
const toast = ref({
  open: false,
  message: '',
  closing: false,
  key: 0,
})

let toastTimer = null
let toastCloseTimer = null

const invoicePositions = ref([
  { id: 'tmp-1', idx: 1, name: '', qty: '', unit: '', price: '', sum: '', vat: '' },
])

const requestPositions = ref([
  { id: 'req-1', idx: 1, title: 'Фасадная панель', qty: 120, unit: 'м2', comment: 'Основная партия', num: 1 },
  { id: 'req-2', idx: 2, title: 'Крепеж фасадный', qty: 500, unit: 'шт', comment: 'Комплект', num: 2 },
])

const billPositions = ref([
  { id: 'inv-1', idx: 1, title: 'Фасадная панель', convQty: 120, convUnit: 'м2', qty: 120, unit: 'м2', price: '2 400', sum: '288 000' },
  { id: 'inv-2', idx: 2, title: 'Крепеж фасадный', convQty: 500, convUnit: 'шт', qty: 500, unit: 'шт', price: '45', sum: '22 500' },
])
const itemMappings = ref([])
const itemMappingsSnapshot = ref([])
const mappingSelectedRequestId = ref('')
const mappingSelectedInvoiceIds = ref([])
const mappingSessionGroupNumber = ref(null)
const requestSort = ref({ key: 'idx', dir: 'asc' })
const billSort = ref({ key: 'idx', dir: 'asc' })
let tempMappingSeq = 1
const tempItemSeq = ref(1)
const invoiceItemsSnapshot = ref([])
const deletedInvoiceItemIds = ref(new Set())
const rowMenu = ref({ open: false, x: 0, y: 0, rowId: '' })

const supplierPrint = computed(() => `${supplier.value.inn || ''} | ${supplier.value.kpp || ''} | ${supplier.value.name || ''} | ${supplier.value.account || ''}`)
const payerPrint = computed(() => `${payer.value.inn || ''} | ${payer.value.kpp || ''} | ${payer.value.name || ''} | ${payer.value.account || ''}`)

const stepLabel = computed(() => {
  if (step.value === 1) return 'Реквизиты'
  if (step.value === 2) return 'Позиции'
  return 'Сопоставление'
})

const togglePdf = () => {
  showPdf.value = !showPdf.value
}

const nextStep = () => {
  if (step.value < maxStep.value) step.value += 1
}

const prevStep = () => {
  if (step.value > 1) step.value -= 1
}

const clampStep = () => {
  if (step.value > maxStep.value) step.value = maxStep.value
  if (step.value < 1) step.value = 1
}

const showToast = (message) => {
  toast.value = {
    open: true,
    message,
    closing: false,
    key: toast.value.key + 1,
  }
  if (toastCloseTimer) clearTimeout(toastCloseTimer)
  if (toastTimer) clearTimeout(toastTimer)
  toastCloseTimer = setTimeout(() => {
    toast.value = { ...toast.value, closing: true }
  }, 2200)
  toastTimer = setTimeout(() => {
    toast.value = { open: false, message: '', closing: false, key: toast.value.key }
  }, 2600)
}

const recognizePositions = async () => {
  const id = String(invoiceId.value || '')
  if (!id || id === 'new' || recognizing.value) return
  if (!invoiceFilePath.value) {
    invoiceError.value = 'Не удалось распознать позиции: отсутствует путь к файлу счета.'
    return
  }
  recognizing.value = true
  invoiceError.value = ''
  try {
    const deleteIds = invoicePositions.value
      .map((row) => String(row.id || ''))
      .filter((rowId) => rowId && !rowId.startsWith('tmp-'))

    for (const itemId of deleteIds) {
      // eslint-disable-next-line no-await-in-loop
      const res = await fetch(`/apisup/supply/invoices/${encodeURIComponent(id)}/items/${encodeURIComponent(itemId)}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error('delete before parse failed')
    }

    const parseRes = await fetch(`/apisup/supply/invoices/${encodeURIComponent(id)}/parse-file`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_path: invoiceFilePath.value,
      }),
    })
    if (!parseRes.ok) throw new Error('parse file failed')

    await loadInvoice()
  } catch {
    invoiceError.value = 'Не удалось распознать позиции счета.'
  } finally {
    recognizing.value = false
  }
}

const autoMatch = async () => {
  const invId = Number(invoiceId.value || 0)
  const reqId = Number(requestIdValue.value || 0)
  if (!invId || !reqId || autoMatching.value) return
  autoMatching.value = true
  invoiceError.value = ''
  try {
    const idsFromSnapshot = (itemMappingsSnapshot.value || [])
      .map((item) => String(item?.id || ''))
      .filter((id) => id && !id.startsWith('tmp-map-'))
    const idsFromCurrent = (itemMappings.value || [])
      .map((item) => String(item?.id || ''))
      .filter((id) => id && !id.startsWith('tmp-map-'))
    const idsToDelete = [...new Set([...idsFromSnapshot, ...idsFromCurrent])]

    for (const mappingId of idsToDelete) {
      // eslint-disable-next-line no-await-in-loop
      const res = await fetch(`/apisup/supply/item-mappings/${encodeURIComponent(mappingId)}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error('item mapping delete failed')
    }

    const autoRes = await fetch('/apisup/supply/item-mappings/auto-match', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request_id: reqId,
        invoice_id: invId,
      }),
    })
    if (!autoRes.ok) throw new Error('auto match failed')

    await loadItemMappings(String(invId))
    clearMappingSelection()
  } catch {
    invoiceError.value = 'Не удалось выполнить автосопоставление.'
  } finally {
    autoMatching.value = false
  }
}

const loadApproverOptions = async () => {
  approverOptions.value = []
  const uniq = new Map()
  try {
    const res = await fetch('/api/as/users/service/7dd8be78-cf3a-423a-852f-eab3511fbe30?page=1&limit=100', { credentials: 'include' })
    if (res.ok) {
      const data = await res.json()
      const users = normalizeArray(data?.items || data)
      for (const user of users) {
        const userId = String(user?.id || '')
        if (!userId || uniq.has(userId)) continue
        const fio = [user?.surname, user?.name, user?.patronymic].filter(Boolean).join(' ').trim() || userId
        uniq.set(userId, { id: userId, fio })
      }
    }
  } catch {
    // noop
  }
  approverOptions.value = Array.from(uniq.values())
}

const openSendModal = async () => {
  await loadApproverOptions()
  selectedApproverIds.value = []
  sendModalOpen.value = true
  approverQuery.value = ''
}

const closeSendModal = () => {
  sendModalOpen.value = false
  approverDropdownOpen.value = false
  approverQuery.value = ''
  selectedApproverIds.value = []
}

const toggleApprover = (id) => {
  const key = String(id || '')
  if (!key) return
  if (selectedApproverIds.value.includes(key)) {
    selectedApproverIds.value = selectedApproverIds.value.filter((x) => x !== key)
  } else {
    selectedApproverIds.value = [...selectedApproverIds.value, key]
  }
}

const removeSelectedApprover = (id) => {
  const key = String(id || '')
  if (!key) return
  selectedApproverIds.value = selectedApproverIds.value.filter((x) => x !== key)
}

const submitApprovers = async () => {
  const invId = String(invoiceId.value || '')
  if (!invId || invId === 'new' || sendingApprovals.value) return
  const ids = selectedApproverIds.value.filter(Boolean)
  sendingApprovals.value = true
  try {
    for (const userId of ids) {
      const res = await fetch(`/apisup/supply/invoices/${encodeURIComponent(invId)}/logs`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: String(userId), type: 'approval', status_name: 'pending', date_response: new Date().toISOString() }),
      })
      if (!res.ok) throw new Error('invoice approval create failed')
    }
    await fetch(`/apisup/supply/invoices/${encodeURIComponent(invId)}/logs`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: FIXED_PLANNING_USER_ID, type: 'planing' }),
    })
    await fetch(`/apisup/supply/invoices/${encodeURIComponent(invId)}/logs`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: FIXED_PAYMENT_USER_ID, type: 'payment' }),
    })
    closeSendModal()
    const id = String(invoiceId.value || '')
    if (id && id !== 'new') {
      router.push(`/invoices/${encodeURIComponent(id)}`)
    }
  } catch {
    invoiceError.value = 'Не удалось передать счет на согласование.'
  } finally {
    sendingApprovals.value = false
  }
}

const filteredApproverOptions = computed(() => {
  const q = String(approverQuery.value || '').trim().toLowerCase()
  if (!q) return approverOptions.value
  return approverOptions.value.filter((item) => item.fio.toLowerCase().includes(q))
})

const finishProcess = async () => {
  // После завершения распознавания/сопоставления не отправляем счет на согласование автоматически.
  const id = String(invoiceId.value || '')
  if (id && id !== 'new') {
    router.push(`/invoices/${encodeURIComponent(id)}`)
  } else {
    router.push('/')
  }
}

const openInvoiceLink = () => {
  if (!invoicePdfUrl.value) return
  window.open(invoicePdfUrl.value, '_blank', 'noopener')
}

const selectSupplier = (item) => {
  supplierQuery.value = item.name
  supplier.value.name = item.name
  supplierOpen.value = false
  saveProviderId(item.id)
}

const selectPayer = (item) => {
  payerQuery.value = item.name
  payer.value.name = item.name
  payerOpen.value = false
  savePayerId(item.id)
}

const saveProviderId = async (providerId) => {
  const id = String(invoiceId.value || route.params.invoiceId || '')
  if (!id || !providerId) return
  try {
    const res = await fetch(`/apisup/supply/invoices/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider_id: String(providerId) }),
    })
    if (!res.ok) throw new Error('provider save failed')
    await loadInvoice()
  } catch {
    // ignore
  }
}

const savePayerId = async (payerId) => {
  const id = String(invoiceId.value || route.params.invoiceId || '')
  if (!id || !payerId) return
  try {
    const res = await fetch(`/apisup/supply/invoices/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payer_id: String(payerId) }),
    })
    if (!res.ok) throw new Error('payer save failed')
    await loadInvoice()
  } catch {
    // ignore
  }
}

const loadCounterparties = async () => {
  counterpartiesLoading.value = true
  try {
    let res = await fetch('/apiref/ref/counterparties', { credentials: 'include' })
    if (!res.ok) {
      res = await fetch('/apiref/ref/counterparties/summary', { credentials: 'include' })
    }
    if (!res.ok) throw new Error('counterparties load failed')
    counterparties.value = normalizeArray(await res.json())
      .map((item) => {
        const id = item?.id || item?.counterparty_id || item?.uuid || ''
        return {
          id,
          name: item?.name || item?.short_name || item?.caption || '—',
          inn: item?.inn || '',
        }
      })
      .filter((item) => item.id)
  } catch {
    counterparties.value = []
  } finally {
    counterpartiesLoading.value = false
  }
}

const selectFromByUser = (item) => {
  fromByUserId.value = String(item.id || item.user_id || '')
  fromByUserQuery.value = [item.surname, item.name, item.patronymic].filter(Boolean).join(' ') || item.fio || item.short_fio || ''
  fromByUserOpen.value = false
}

const selectProjectObject = (item) => {
  projectObjectId.value = String(item.id || '')
  projectObjectQuery.value = item.name || ''
  selectedObjectId.value = item.type || 'object_levels_id'
  projectObjectOpen.value = false
}

const normalizeArray = (payload) => {
  if (Array.isArray(payload)) return payload
  return payload?.items || payload?.data || payload?.results || []
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

const formatNum = (value) => {
  const num = Number(value)
  if (!Number.isFinite(num)) return String(value || '')
  return num.toLocaleString('ru-RU')
}

const emptyIfZero = (value) => {
  if (value == null || value === '') return ''
  const num = Number(value)
  if (Number.isFinite(num) && num === 0) return ''
  return value
}

const normalizeDecimalInput = (value) => String(value ?? '')
  .replace(/[бБюЮ]/g, ',')
  .replace(/\./g, ',')
  .replace(/[^0-9,]/g, '')
  .replace(/,(?=.*?,)/g, '')

const parseDecimal = (value) => {
  const normalized = String(value ?? '').replace(/\s/g, '').replace(',', '.')
  const num = Number(normalized)
  return Number.isFinite(num) ? num : null
}

const formatDecimalForInput = (value) => {
  if (!Number.isFinite(value)) return ''
  const rounded = Math.round(value * 100) / 100
  let out = String(rounded).replace('.', ',')
  out = out.replace(/,0+$/, '').replace(/(\,\d*[1-9])0+$/, '$1')
  return out
}

const recalcRowSum = (row) => {
  const qty = parseDecimal(row.qty)
  const price = parseDecimal(row.price)
  if (qty == null || price == null) {
    row.sum = ''
    return
  }
  row.sum = formatDecimalForInput(qty * price)
}

const autoResizeTextarea = (el) => {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.max(30, el.scrollHeight)}px`
}

const onCellTextInput = (event, row, field) => {
  row[field] = event?.target?.value ?? ''
  autoResizeTextarea(event?.target)
}

const resizeInvoiceTextareas = () => {
  const nodes = document.querySelectorAll('.cell-textarea')
  for (const node of nodes) autoResizeTextarea(node)
}

const onRowNumericInput = (row, field) => {
  row[field] = normalizeDecimalInput(row[field])
  if (field === 'sum') {
    row.sumManual = String(row.sum || '').length > 0
    return
  }
  if ((field === 'qty' || field === 'price') && !row.sumManual) {
    recalcRowSum(row)
  }
}

const toNumberOrZero = (value) => {
  const normalized = String(value ?? '').replace(/\s/g, '').replace(',', '.')
  const num = Number(normalized)
  return Number.isFinite(num) ? num : 0
}

const reindexInvoiceRows = () => {
  invoicePositions.value = invoicePositions.value.map((row, idx) => ({
    ...row,
    idx: idx + 1,
  }))
}

const mapInvoiceItems = (items) => normalizeArray(items).map((item, idx) => ({
  id: String(item?.id || `tmp-${tempItemSeq.value++}`),
  idx: item?.num ?? idx + 1,
  name: item?.name || item?.nomenclature?.name || '',
  qty: emptyIfZero(item?.quantity),
  unit: item?.unit_name || item?.unit?.name || item?.nomenclature?.unit?.name || '',
  price: emptyIfZero(item?.price),
  sum: emptyIfZero(item?.sum),
  vat: emptyIfZero(item?.nds),
  sumManual: false,
}))

const mapBillItems = (items) => normalizeArray(items).map((item, idx) => ({
  id: String(item?.id || `inv-${idx + 1}`),
  idx: item?.num ?? idx + 1,
  title: item?.name || item?.nomenclature?.name || '',
  convQty: item?.converted_quantity ?? item?.quantity ?? 0,
  convUnit: item?.unit_converted_name || item?.converted_unit?.name || item?.unit_name || item?.unit?.name || item?.nomenclature?.unit?.name || '',
  qty: item?.quantity ?? 0,
  unit: item?.unit_name || item?.unit?.name || item?.nomenclature?.unit?.name || '',
  price: formatNum(item?.price ?? 0),
  sum: formatNum(item?.sum ?? 0),
}))

const mapRequestItems = (items) => normalizeArray(items).map((item, idx) => ({
  id: String(item?.id || `req-${idx + 1}`),
  idx: item?.num ?? idx + 1,
  title: item?.name || item?.nomenclature?.name || '',
  qty: item?.quantity ?? 0,
  unit: item?.unit?.name || item?.nomenclature?.unit?.name || '',
  unitId: String(item?.unit_id || item?.unit?.id || item?.nomenclature?.unit?.id || ''),
  comment: item?.comment || '',
  num: item?.num ?? idx + 1,
}))

const mapBillItemsFromRows = (rows) => rows.map((row) => ({
  id: String(row.id || `inv-${row.idx}`),
  idx: row.idx,
  title: row.name || '',
  convQty: row.qty ?? '',
  convUnit: row.unit || '',
  qty: row.qty ?? '',
  unit: row.unit || '',
  price: row.price === '' || row.price == null ? '' : formatNum(row.price),
  sum: row.sum === '' || row.sum == null ? '' : formatNum(row.sum),
}))

const normalizeMatchType = (mode) => {
  if (mode === 'sum') return 'sum'
  if (mode === 'kit') return 'kit'
  return 'direct'
}

const getNextGroupNumber = () => {
  let maxGroup = 0
  for (const item of itemMappings.value) {
    const group = Number(item?.group_number)
    if (Number.isFinite(group) && group > maxGroup) maxGroup = group
  }
  return maxGroup + 1
}

const getRequestQtyById = (requestItemId) => {
  const row = requestPositions.value.find((item) => String(item.id) === String(requestItemId))
  return toNumberOrZero(row?.qty)
}

const getRequestUnitIdById = (requestItemId) => {
  const row = requestPositions.value.find((item) => String(item.id) === String(requestItemId))
  return String(row?.unitId || '')
}

const getRequestUnitNameById = (requestItemId) => {
  const row = requestPositions.value.find((item) => String(item.id) === String(requestItemId))
  return String(row?.unit || '')
}

const getInvoiceMappedQtyById = (invoiceItemId) => {
  const row = billPositions.value.find((item) => String(item.id) === String(invoiceItemId))
  const preferred = row?.convQty === '' || row?.convQty == null ? row?.qty : row?.convQty
  return toNumberOrZero(preferred)
}

const removeMappingsByRequestId = (requestItemId) => {
  const key = String(requestItemId)
  itemMappings.value = itemMappings.value.filter((item) => String(item?.request_item_id || '') !== key)
}

const removeMappingsByInvoiceId = (invoiceItemId) => {
  const key = String(invoiceItemId)
  itemMappings.value = itemMappings.value.filter((item) => String(item?.invoice_item_id || '') !== key)
}

const clearMappingSelection = () => {
  mappingSelectedRequestId.value = ''
  mappingSelectedInvoiceIds.value = []
  mappingSessionGroupNumber.value = null
}

const syncSelectionGroupNumber = () => {
  if (mappingSessionGroupNumber.value != null) return
  mappingSessionGroupNumber.value = getNextGroupNumber()
}

const addDraftMapping = ({ requestItemId, invoiceItemId, groupNumber, matchType, mappedQuantity }) => {
  const requestIdNum = Number(requestIdValue.value || 0)
  const invoiceIdNum = Number(invoiceId.value || 0)
  itemMappings.value.push({
    id: `tmp-map-${tempMappingSeq++}`,
    request_id: requestIdNum,
    invoice_id: invoiceIdNum,
    unit_id: getRequestUnitIdById(requestItemId),
    unit_id_name: getRequestUnitNameById(requestItemId),
    request_item_id: String(requestItemId),
    invoice_item_id: String(invoiceItemId),
    group_number: Number(groupNumber),
    match_type: String(matchType),
    mapped_quantity: Number(mappedQuantity || 0),
  })
}

const applyDirectDraft = () => {
  if (!mappingSelectedRequestId.value || mappingSelectedInvoiceIds.value.length !== 1) return
  const requestItemId = mappingSelectedRequestId.value
  const invoiceItemId = mappingSelectedInvoiceIds.value[0]
  const groupNumber = getNextGroupNumber()
  removeMappingsByRequestId(requestItemId)
  removeMappingsByInvoiceId(invoiceItemId)
  addDraftMapping({
    requestItemId,
    invoiceItemId,
    groupNumber,
    matchType: 'direct',
    mappedQuantity: getRequestQtyById(requestItemId),
  })
  clearMappingSelection()
}

const hasDraftMapping = (requestItemId, invoiceItemId, groupNumber) => itemMappings.value.some((item) =>
  String(item?.request_item_id || '') === String(requestItemId || '')
  && String(item?.invoice_item_id || '') === String(invoiceItemId || '')
  && Number(item?.group_number || 0) === Number(groupNumber || 0))

const applySumDraft = (invoiceIdsOverride = null) => {
  const requestItemId = mappingSelectedRequestId.value
  const invoiceIds = Array.isArray(invoiceIdsOverride) ? invoiceIdsOverride : mappingSelectedInvoiceIds.value
  if (!requestItemId || !invoiceIds.length) return
  syncSelectionGroupNumber()
  for (const invoiceItemId of invoiceIds) {
    if (hasDraftMapping(requestItemId, invoiceItemId, mappingSessionGroupNumber.value)) continue
    removeMappingsByInvoiceId(invoiceItemId)
    addDraftMapping({
      requestItemId,
      invoiceItemId,
      groupNumber: mappingSessionGroupNumber.value,
      matchType: 'sum',
      mappedQuantity: getInvoiceMappedQtyById(invoiceItemId),
    })
  }
}

const applyKitDraft = (invoiceIdsOverride = null) => {
  const requestItemId = mappingSelectedRequestId.value
  const invoiceIds = Array.isArray(invoiceIdsOverride) ? invoiceIdsOverride : mappingSelectedInvoiceIds.value
  if (!requestItemId || !invoiceIds.length) return
  syncSelectionGroupNumber()

  const currentGroupMappings = itemMappings.value.filter((item) =>
    String(item?.request_item_id || '') === String(requestItemId)
    && Number(item?.group_number || 0) === Number(mappingSessionGroupNumber.value))
  const hasHead = currentGroupMappings.some((item) => String(item?.match_type || '').toLowerCase() === 'kit_head')

  invoiceIds.forEach((invoiceItemId, idx) => {
    if (hasDraftMapping(requestItemId, invoiceItemId, mappingSessionGroupNumber.value)) return
    removeMappingsByInvoiceId(invoiceItemId)
    const isHead = !hasHead && idx === 0 && currentGroupMappings.length === 0
    addDraftMapping({
      requestItemId,
      invoiceItemId,
      groupNumber: mappingSessionGroupNumber.value,
      matchType: isHead ? 'kit_head' : 'kit_component',
      mappedQuantity: isHead ? getRequestQtyById(requestItemId) : 0,
    })
  })
}

const onRequestMappingCellClick = (row) => {
  const requestItemId = String(row?.id || '')
  if (!requestItemId) return
  const mode = normalizeMatchType(matchingMode.value)
  if (mode === 'direct') {
    removeMappingsByRequestId(requestItemId)
    mappingSelectedRequestId.value = requestItemId
    applyDirectDraft()
    return
  }

  if (mappingSelectedRequestId.value && mappingSelectedRequestId.value !== requestItemId) {
    clearMappingSelection()
  }
  removeMappingsByRequestId(requestItemId)
  mappingSelectedRequestId.value = requestItemId
  syncSelectionGroupNumber()
  if (mappingSelectedInvoiceIds.value.length) {
    if (mode === 'sum') applySumDraft()
    else applyKitDraft()
  }
}

const onInvoiceMappingCellClick = (row) => {
  const invoiceItemId = String(row?.id || '')
  if (!invoiceItemId) return
  const mode = normalizeMatchType(matchingMode.value)
  if (mode === 'direct') {
    removeMappingsByInvoiceId(invoiceItemId)
    mappingSelectedInvoiceIds.value = [invoiceItemId]
    applyDirectDraft()
    return
  }

  if (!mappingSelectedInvoiceIds.value.includes(invoiceItemId)) {
    mappingSelectedInvoiceIds.value = [...mappingSelectedInvoiceIds.value, invoiceItemId]
  } else {
    mappingSelectedInvoiceIds.value = mappingSelectedInvoiceIds.value.filter((id) => id !== invoiceItemId)
    return
  }
  if (!mappingSelectedRequestId.value) return
  removeMappingsByInvoiceId(invoiceItemId)
  syncSelectionGroupNumber()
  if (mode === 'sum') applySumDraft([invoiceItemId])
  else applyKitDraft([invoiceItemId])
}

const clearAllMappings = () => {
  itemMappings.value = []
  clearMappingSelection()
}

const isRequestSelected = (requestItemId) => String(mappingSelectedRequestId.value || '') === String(requestItemId || '')

const isInvoiceSelected = (invoiceItemId) => mappingSelectedInvoiceIds.value.includes(String(invoiceItemId || ''))

const groupPalette = [
  { bg: '#fee2e2', text: '#991b1b', border: '#fecaca' },
  { bg: '#dbeafe', text: '#1e3a8a', border: '#bfdbfe' },
  { bg: '#dcfce7', text: '#166534', border: '#bbf7d0' },
  { bg: '#fef3c7', text: '#92400e', border: '#fde68a' },
  { bg: '#ede9fe', text: '#5b21b6', border: '#ddd6fe' },
  { bg: '#fce7f3', text: '#9d174d', border: '#fbcfe8' },
  { bg: '#cffafe', text: '#155e75', border: '#a5f3fc' },
]

const groupColorStyle = (groupNumber, matchType = '') => {
  const group = Number(groupNumber)
  if (!Number.isFinite(group) || group <= 0) return {}
  const color = groupPalette[(group - 1) % groupPalette.length]
  const isComponent = String(matchType || '').toLowerCase() === 'kit_component'
  return {
    background: color.bg,
    color: color.text,
    borderColor: color.border,
    opacity: isComponent ? 0.56 : 1,
  }
}

const mappingsByRequestItem = computed(() => {
  const map = new Map()
  for (const item of itemMappings.value) {
    const itemId = String(item?.request_item_id || '')
    const groupNumber = Number(item?.group_number)
    if (!itemId || !Number.isFinite(groupNumber) || groupNumber <= 0) continue
    if (!map.has(itemId)) map.set(itemId, [])
    const groups = map.get(itemId)
    const existing = groups.find((g) => g.groupNumber === groupNumber)
    if (!existing) {
      groups.push({
        groupNumber,
        matchType: String(item?.match_type || ''),
      })
      continue
    }
    // Request-side group badge for kit should always look like head.
    const incoming = String(item?.match_type || '').toLowerCase()
    const current = String(existing.matchType || '').toLowerCase()
    if (incoming === 'kit_head' || current === 'kit_head') {
      existing.matchType = 'kit_head'
    }
  }
  return map
})

const mappingsByInvoiceItem = computed(() => {
  const map = new Map()
  for (const item of itemMappings.value) {
    const itemId = String(item?.invoice_item_id || '')
    const groupNumber = Number(item?.group_number)
    if (!itemId || !Number.isFinite(groupNumber) || groupNumber <= 0) continue
    if (!map.has(itemId)) map.set(itemId, { groups: [], mappedQty: null, unitName: '' })
    const acc = map.get(itemId)
    if (!acc.groups.some((g) => g.groupNumber === groupNumber)) {
      acc.groups.push({
        groupNumber,
        matchType: String(item?.match_type || ''),
      })
    }
    const qty = item?.mapped_quantity
    if (acc.mappedQty == null && qty != null && qty !== '') acc.mappedQty = qty
    const unitName = String(item?.unit_id_name || '')
    if (!acc.unitName && unitName) acc.unitName = unitName
  }
  return map
})

const requestRowsStage3 = computed(() => requestPositions.value.map((row) => ({
  ...row,
  groupNumbers: mappingsByRequestItem.value.get(String(row.id)) || [],
})))

const billRowsStage3 = computed(() => billPositions.value.map((row) => {
  const mapped = mappingsByInvoiceItem.value.get(String(row.id))
  return {
    ...row,
    groupNumbers: mapped?.groups || [],
    convQty: mapped?.mappedQty ?? '',
    convUnit: mapped?.unitName ?? '',
  }
}))

const visibleRequestRowsStage3 = computed(() => {
  if (!hideLinkedPositions.value) return requestRowsStage3.value
  return requestRowsStage3.value.filter((row) => !row.groupNumbers?.length)
})

const visibleBillRowsStage3 = computed(() => {
  if (!hideLinkedPositions.value) return billRowsStage3.value
  return billRowsStage3.value.filter((row) => !row.groupNumbers?.length)
})

const normalizeSortValue = (value) => {
  if (value == null) return ''
  const num = parseDecimal(value)
  if (num != null) return num
  return String(value).toLowerCase()
}

const sortRows = (rows, sortState) => {
  const { key, dir } = sortState || {}
  if (!key || !dir) return rows
  const list = [...rows]
  list.sort((a, b) => {
    const av = normalizeSortValue(a?.[key])
    const bv = normalizeSortValue(b?.[key])
    if (av === bv) return 0
    if (av > bv) return dir === 'asc' ? 1 : -1
    return dir === 'asc' ? -1 : 1
  })
  return list
}

const sortedVisibleRequestRowsStage3 = computed(() => sortRows(visibleRequestRowsStage3.value, requestSort.value))
const sortedVisibleBillRowsStage3 = computed(() => sortRows(visibleBillRowsStage3.value, billSort.value))

const toggleRequestSort = (key) => {
  if (requestSort.value.key !== key) {
    requestSort.value = { key, dir: 'asc' }
    return
  }
  requestSort.value = { key, dir: requestSort.value.dir === 'asc' ? 'desc' : 'asc' }
}

const toggleBillSort = (key) => {
  if (billSort.value.key !== key) {
    billSort.value = { key, dir: 'asc' }
    return
  }
  billSort.value = { key, dir: billSort.value.dir === 'asc' ? 'desc' : 'asc' }
}

const sortMark = (state, key) => {
  if (state.key !== key) return ''
  return state.dir === 'asc' ? '↑' : '↓'
}

const isMappedQuantityMismatch = (row) => {
  if (row?.convQty == null || row?.convQty === '') return false
  const mappedQty = parseDecimal(row.convQty)
  const qty = parseDecimal(row.qty)
  if (mappedQty == null || qty == null) return false
  return Math.abs(mappedQty - qty) > 0.0001
}

const calculatedInvoiceSum = computed(() => {
  const rowsSum = invoicePositions.value.reduce((acc, row) => acc + (parseDecimal(row.sum) || 0), 0)
  const vat = parseDecimal(vatAmount.value) || 0
  return vatCommon.value === 'yes' ? rowsSum : (rowsSum + vat)
})

const invoiceTotalDifference = computed(() => {
  const total = parseDecimal(invoiceAmount.value)
  if (total == null) return null
  const diff = total - calculatedInvoiceSum.value
  return Math.abs(diff) > 0.0001 ? diff : null
})

const invoiceDifferenceText = computed(() => {
  if (invoiceTotalDifference.value == null) return ''
  const absDiff = Math.abs(invoiceTotalDifference.value)
  return `Сумма отличается от расчетной на ${absDiff.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`
})

const loadRequestPositions = async (requestIdRaw) => {
  const rid = Number(requestIdRaw)
  if (!Number.isFinite(rid) || rid <= 0) return
  try {
    const res = await fetch(`/apisup/supply/requests/my/${encodeURIComponent(rid)}`, { credentials: 'include' })
    if (!res.ok) return
    const data = await res.json()
    requestPositions.value = mapRequestItems(data?.items || [])
  } catch {
    // keep existing fallback
  }
}

const revokePdfUrl = () => {
  if (invoicePdfUrl.value) {
    URL.revokeObjectURL(invoicePdfUrl.value)
    invoicePdfUrl.value = ''
  }
}

const triggerInvoiceFileUpload = () => {
  if (invoiceFileInput.value) invoiceFileInput.value.click()
}

const onInvoiceFilePicked = async () => {
  const file = invoiceFileInput.value?.files?.[0]
  if (!file) return
  const id = String(invoiceId.value || '')
  if (!id || id === 'new') return
  invoiceFileUploading.value = true
  try {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`/apisup/supply/invoices/${encodeURIComponent(id)}/file`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    })
    if (!res.ok) throw new Error('upload failed')
    const refreshRes = await fetch(`/apisup/supply/invoices/${encodeURIComponent(id)}`, { credentials: 'include' })
    if (refreshRes.ok) {
      const data = await refreshRes.json()
      invoiceFileName.value = data?.file?.original_name || file.name
      invoiceFilePath.value = String(data?.file?.file_path || '')
    }
    await loadInvoicePdf(id)
  } catch {
    // ignore
  } finally {
    invoiceFileUploading.value = false
    if (invoiceFileInput.value) invoiceFileInput.value.value = ''
  }
}

const loadInvoicePdf = async (id) => {
  revokePdfUrl()
  const candidates = [
    `/apisup/supply/invoices/${encodeURIComponent(id)}/download`,
    `/apisup/supply/invoices/${encodeURIComponent(id)}/file/download`,
    `/apisup/supply/invoices/${encodeURIComponent(id)}/file`,
  ]
  for (const url of candidates) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const res = await fetch(url, { credentials: 'include' })
      if (!res.ok) continue
      // eslint-disable-next-line no-await-in-loop
      const blob = await res.blob()
      if (blob.size <= 0) continue
      invoicePdfUrl.value = URL.createObjectURL(blob)
      return
    } catch {
      // try next endpoint
    }
  }
}

const loadItemMappings = async (invoiceIdRaw) => {
  const invId = String(invoiceIdRaw || '')
  if (!invId || invId === 'new') {
    itemMappings.value = []
    return
  }
  try {
    const res = await fetch(`/apisup/supply/item-mappings?invoice_id=${encodeURIComponent(invId)}`, {
      credentials: 'include',
    })
    if (!res.ok) {
      itemMappings.value = []
      return
    }
    const data = await res.json()
    itemMappings.value = normalizeArray(data)
    itemMappingsSnapshot.value = JSON.parse(JSON.stringify(itemMappings.value))
    clearMappingSelection()
  } catch {
    itemMappings.value = []
    itemMappingsSnapshot.value = []
    clearMappingSelection()
  }
}

const loadInvoice = async () => {
  const id = String(invoiceId.value || '')
  if (!id || id === 'new') return
  isHydratingInvoice.value = true
  invoiceLoading.value = true
  invoiceError.value = ''
  try {
    const res = await fetch(`/apisup/supply/invoices/${encodeURIComponent(id)}`, { credentials: 'include' })
    if (!res.ok) throw new Error('invoice load failed')
    const data = await res.json()

    requestIdValue.value = String(data?.request_id || requestIdValue.value || '')
    invoiceStatusName.value = String(data?.status_name || '')
    invoiceFileName.value = data?.file?.original_name || ''
    invoiceFilePath.value = String(data?.file?.file_path || '')

    supplier.value = {
      inn: data?.provider?.inn || '',
      kpp: data?.provider?.kpp || '',
      name: data?.provider?.short_name || '',
      account: data?.provider?.checking_account || '',
    }
    payer.value = {
      inn: data?.payer?.inn || '',
      kpp: data?.payer?.kpp || '',
      name: data?.payer?.short_name || '',
      account: data?.payer?.checking_account || '',
    }
    supplierQuery.value = supplier.value.name
    payerQuery.value = payer.value.name

    invoiceDate.value = toInputDate(data?.date)
    invoiceNumber.value = String(data?.num || '')
    deliveryIncluded.value = Boolean(data?.is_delivery_included)

    const prepayment = Number(data?.prepayment_percent || 0)
    prepaymentRequired.value = prepayment > 0
    prepaymentPercent.value = prepayment > 0 ? String(prepayment) : ''

    const dueDays = Number(data?.due_days || 0)
    defermentProvided.value = dueDays > 0
    defermentDays.value = dueDays > 0 ? String(dueDays) : ''

    invoiceValidityDays.value = String(data?.valid_until ?? '')
    urgentInvoice.value = Boolean(data?.is_urgent)
    invoiceAmount.value = String(data?.total_amount ?? 0)
    vatAmount.value = String(data?.vat_amount ?? 0)
    vatRate.value = String(data?.vat_rate ?? '')
    vatCommon.value = Number(data?.vat_rate || 0) > 0 ? 'yes' : 'no'
    vatMode.value = Number(data?.vat_rate || 0) > 0 ? 'total' : 'line'

    fromByUserId.value = data?.from_by ? String(data.from_by) : ''
    fromByUserQuery.value = data?.from_by_user?.short_fio || ''

    if (data?.object) {
      projectObjectId.value = String(data.object)
      projectObjectQuery.value = data?.object_name || data?.object_short_name || data?.project_name || ''
      selectedObjectId.value = 'object'
    } else if (data?.object_levels_id) {
      projectObjectId.value = String(data.object_levels_id)
      projectObjectQuery.value = data?.object_levels_name || data?.project_name || ''
      selectedObjectId.value = 'object_levels_id'
    } else {
      projectObjectId.value = ''
      projectObjectQuery.value = data?.project_name || ''
      selectedObjectId.value = ''
    }

    const mappedInvoiceItems = mapInvoiceItems(data?.items || [])
    invoicePositions.value = mappedInvoiceItems
    if (!invoicePositions.value.length) {
      invoicePositions.value = [{ id: `tmp-${tempItemSeq.value++}`, idx: 1, name: '', qty: '', unit: '', price: '', sum: '', vat: '', sumManual: false }]
    }
    billPositions.value = mapBillItems(data?.items || [])
    invoiceItemsSnapshot.value = JSON.parse(JSON.stringify(invoicePositions.value))
    deletedInvoiceItemIds.value = new Set()
    closeRowMenu()
    await nextTick()
    resizeInvoiceTextareas()
    await loadItemMappings(id)

    await loadRequestPositions(data?.request_id)
    await loadInvoicePdf(id)
  } catch {
    invoiceError.value = 'Не удалось загрузить данные счета.'
  } finally {
    invoiceLoading.value = false
    setTimeout(() => {
      isHydratingInvoice.value = false
    }, 0)
  }
}

const rowToPayload = (row) => ({
  name: String(row.name || '').trim(),
  unit_name: String(row.unit || '').trim(),
  quantity: toNumberOrZero(row.qty),
  price: toNumberOrZero(row.price),
  sum: toNumberOrZero(row.sum),
  nds: toNumberOrZero(row.vat),
})

const payloadEquals = (a, b) => (
  String(a.name || '') === String(b.name || '')
  && String(a.unit_name || '') === String(b.unit_name || '')
  && Number(a.quantity || 0) === Number(b.quantity || 0)
  && Number(a.price || 0) === Number(b.price || 0)
  && Number(a.sum || 0) === Number(b.sum || 0)
  && Number(a.nds || 0) === Number(b.nds || 0)
)

const addInvoiceRow = () => {
  invoicePositions.value.push({
    id: `tmp-${tempItemSeq.value++}`,
    idx: invoicePositions.value.length + 1,
    name: '',
    qty: '',
    unit: '',
    price: '',
    sum: '',
    vat: '',
    sumManual: false,
  })
  nextTick(() => resizeInvoiceTextareas())
}

const clearInvoiceRows = () => {
  for (const row of invoicePositions.value) {
    if (!String(row.id || '').startsWith('tmp-')) {
      deletedInvoiceItemIds.value.add(String(row.id))
    }
  }
  invoicePositions.value = []
  billPositions.value = []
  closeRowMenu()
}

const removeInvoiceRow = (rowId, shiftUp) => {
  const index = invoicePositions.value.findIndex((row) => String(row.id) === String(rowId))
  if (index < 0) return
  const row = invoicePositions.value[index]
  if (!String(row.id || '').startsWith('tmp-')) {
    deletedInvoiceItemIds.value.add(String(row.id))
  }
  invoicePositions.value.splice(index, 1)
  if (shiftUp) reindexInvoiceRows()
  closeRowMenu()
}

const closeRowMenu = () => {
  rowMenu.value = { open: false, x: 0, y: 0, rowId: '' }
}

const openRowMenu = (event, row) => {
  event.preventDefault()
  const menuWidth = 210
  const menuHeight = 94
  const x = Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8))
  const y = Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8))
  rowMenu.value = { open: true, x, y, rowId: String(row.id) }
}

const handleWindowClick = (event) => {
  const target = event?.target
  if (rowMenu.value.open && !target?.closest?.('.row-action-menu')) {
    closeRowMenu()
  }
  if (supplierOpen.value && !target?.closest?.('.supplier-lookup')) {
    supplierOpen.value = false
  }
  if (payerOpen.value && !target?.closest?.('.payer-lookup')) {
    payerOpen.value = false
  }
  if (fromByUserOpen.value && !target?.closest?.('.from-by-lookup')) {
    fromByUserOpen.value = false
  }
  if (projectObjectOpen.value && !target?.closest?.('.project-lookup')) {
    projectObjectOpen.value = false
  }
  if (approverDropdownOpen.value && !target?.closest?.('.approver-select')) {
    approverDropdownOpen.value = false
  }
}

const handleWindowKeydown = (event) => {
  if (event?.key !== 'Escape') return
  clearMappingSelection()
}

const scheduleAutoSave = () => {
  const id = String(invoiceId.value || '')
  if (!id || id === 'new' || isHydratingInvoice.value || recognizing.value || autoMatching.value) return
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(async () => {
    autoSaveTimer = null
    if (isHydratingInvoice.value) return
    await saveDraft({ silent: true, refreshAfterSave: false, fromAuto: true })
  }, 650)
}

const saveDraft = async ({ silent = false, refreshAfterSave = true, fromAuto = false } = {}) => {
  const id = String(invoiceId.value || '')
  if (!id || id === 'new') return
  if (saving.value) {
    if (fromAuto) autoSavePending.value = true
    return
  }
  saving.value = true
  invoiceError.value = ''
  try {
    const patchHeaderRes = await fetch(`/apisup/supply/invoices/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        num: String(invoiceNumber.value || ''),
        date: String(invoiceDate.value || ''),
        from_by: fromByUserId.value || null,
        object_levels_id: projectObjectId.value || null,
        object_type: selectedObjectId.value || null,
      }),
    })
    if (!patchHeaderRes.ok) throw new Error('invoice header patch failed')

    const vatRateValue = vatMode.value === 'total' ? toNumberOrZero(vatRate.value) : 0
    const vatAmountValue = vatMode.value === 'none' ? 0 : toNumberOrZero(vatAmount.value)
    const patchInvoiceRes = await fetch(`/apisup/supply/invoices/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        total_amount: toNumberOrZero(invoiceAmount.value),
        vat_rate: vatRateValue,
        vat_amount: vatAmountValue,
      }),
    })
    if (!patchInvoiceRes.ok) throw new Error('invoice patch failed')

    const deletedIds = Array.from(deletedInvoiceItemIds.value.values())
    for (const itemId of deletedIds) {
      // eslint-disable-next-line no-await-in-loop
      const deleteRes = await fetch(`/apisup/supply/invoices/${encodeURIComponent(id)}/items/${encodeURIComponent(itemId)}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!deleteRes.ok) throw new Error('invoice item delete failed')
    }

    const snapshotById = new Map(invoiceItemsSnapshot.value.map((row) => [String(row.id), rowToPayload(row)]))
    for (const row of invoicePositions.value) {
      const payload = rowToPayload(row)
      const hasValue = Object.values(payload).some((v) => v !== '' && Number(v) !== 0)
      if (String(row.id || '').startsWith('tmp-')) {
        if (!hasValue) continue
        // eslint-disable-next-line no-await-in-loop
        const createRes = await fetch(`/apisup/supply/invoices/${encodeURIComponent(id)}/items`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!createRes.ok) throw new Error('invoice item create failed')
        // eslint-disable-next-line no-await-in-loop
        const created = await createRes.json().catch(() => ({}))
        row.id = String(created?.id || row.id)
        continue
      }
      const prev = snapshotById.get(String(row.id))
      if (!prev || payloadEquals(prev, payload)) continue
      // eslint-disable-next-line no-await-in-loop
      const patchRes = await fetch(`/apisup/supply/invoices/${encodeURIComponent(id)}/items/${encodeURIComponent(String(row.id))}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!patchRes.ok) throw new Error('invoice item patch failed')
    }

    const currentMapIds = new Set(itemMappings.value.map((item) => String(item?.id || '')))
    const mappingsToDelete = itemMappingsSnapshot.value
      .map((item) => String(item?.id || ''))
      .filter((id) => id && !id.startsWith('tmp-map-') && !currentMapIds.has(id))
    for (const mappingId of mappingsToDelete) {
      // eslint-disable-next-line no-await-in-loop
      const res = await fetch(`/apisup/supply/item-mappings/${encodeURIComponent(mappingId)}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error('mapping delete failed')
    }

    const mappingsToCreate = itemMappings.value.filter((item) => String(item?.id || '').startsWith('tmp-map-'))
    const requestIdNum = Number(requestIdValue.value || 0)
    const invoiceIdNum = Number(invoiceId.value || 0)
    for (const mapping of mappingsToCreate) {
      // eslint-disable-next-line no-await-in-loop
      const res = await fetch('/apisup/supply/item-mappings', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: Number(mapping?.request_id || requestIdNum || 0),
          invoice_id: Number(mapping?.invoice_id || invoiceIdNum || 0),
          unit_id: String(mapping?.unit_id || ''),
          request_item_id: String(mapping?.request_item_id || ''),
          invoice_item_id: String(mapping?.invoice_item_id || ''),
          group_number: Number(mapping?.group_number || 0),
          match_type: String(mapping?.match_type || 'direct'),
          mapped_quantity: Number(mapping?.mapped_quantity || 0),
        }),
      })
      if (!res.ok) throw new Error('mapping create failed')
      // eslint-disable-next-line no-await-in-loop
      const created = await res.json().catch(() => ({}))
      mapping.id = String(created?.id || mapping.id)
    }

    deletedInvoiceItemIds.value = new Set()
    invoiceItemsSnapshot.value = JSON.parse(JSON.stringify(invoicePositions.value))
    itemMappingsSnapshot.value = JSON.parse(JSON.stringify(itemMappings.value))
    if (refreshAfterSave) await loadInvoice()
    if (!silent) showToast('Данные успешно сохранены.')
  } catch {
    invoiceError.value = 'Не удалось сохранить данные счета.'
  } finally {
    saving.value = false
    if (autoSavePending.value) {
      autoSavePending.value = false
      scheduleAutoSave()
    }
  }
}

const loadAllUsers = async () => {
  allUsersLoading.value = true
  try {
    const res = await fetch('/api/as/users/all', { credentials: 'include' })
    if (!res.ok) throw new Error('users load failed')
    allUsers.value = normalizeArray(await res.json())
  } catch {
    allUsers.value = []
  } finally {
    allUsersLoading.value = false
  }
}

const loadProjectObjects = async () => {
  projectObjectsLoading.value = true
  try {
    const res = await fetch('/apisup/supply/request-objects/my', { credentials: 'include' })
    if (!res.ok) throw new Error('project objects load failed')
    projectObjects.value = normalizeArray(await res.json())
  } catch {
    projectObjects.value = []
  } finally {
    projectObjectsLoading.value = false
  }
}

const loadObjects = async () => {
  objectsLoading.value = true
  try {
    const res = await fetch('/apiref/ref/objects', { credentials: 'include' })
    if (!res.ok) throw new Error('objects load failed')
    objects.value = normalizeArray(await res.json())
  } catch {
    objects.value = []
  } finally {
    objectsLoading.value = false
  }
}

onMounted(() => {
  window.addEventListener('mousedown', handleWindowClick)
  window.addEventListener('keydown', handleWindowKeydown)
  window.addEventListener('scroll', closeRowMenu, true)
  window.addEventListener('resize', resizeInvoiceTextareas)
  loadInvoice().then(() => {
    if (route.query.auto_parse === '1') {
      recognizePositions()
    }
  })
  loadAllUsers()
  loadProjectObjects()
  loadObjects()
  loadCounterparties()
})

watch(() => route.params.invoiceId, () => {
  step.value = 1
  loadInvoice()
})

watch(hasRequest, () => {
  clampStep()
})

watch(step, (value, oldValue) => {
  if (value === 3 && hasRequest.value) {
    showPdfBeforeStep3.value = showPdf.value
    showPdf.value = false
    return
  }
  if (value === 2) {
    nextTick(() => resizeInvoiceTextareas())
  }
  if (oldValue === 3) {
    showPdf.value = showPdfBeforeStep3.value
  }
})

watch(vatMode, (value) => {
  if (value === 'none') {
    vatAmount.value = '0'
    vatCommon.value = 'no'
    vatRate.value = '0'
  } else if (value === 'line' && !vatRate.value) {
    vatRate.value = '0'
  }
})

watch(invoicePositions, (rows) => {
  billPositions.value = mapBillItemsFromRows(rows)
  scheduleAutoSave()
}, { deep: true })

watch(matchingMode, () => {
  clearMappingSelection()
})

watch([
  supplier,
  payer,
  invoiceDate,
  invoiceNumber,
  vatMode,
  vatCommon,
  vatRate,
  vatAmount,
  invoiceAmount,
], () => {
  scheduleAutoSave()
}, { deep: true })

watch(itemMappings, () => {
  scheduleAutoSave()
}, { deep: true })

onBeforeUnmount(() => {
  window.removeEventListener('mousedown', handleWindowClick)
  window.removeEventListener('keydown', handleWindowKeydown)
  window.removeEventListener('scroll', closeRowMenu, true)
  window.removeEventListener('resize', resizeInvoiceTextareas)
  if (toastTimer) clearTimeout(toastTimer)
  if (toastCloseTimer) clearTimeout(toastCloseTimer)
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  revokePdfUrl()
})
</script>

<template>
  <div class="page">
    <TopNav :links="navLinks" />

    <div v-if="recognizing || autoMatching" class="page-loader">
      <div class="loader-card">
        <div class="loader-spinner"></div>
        <div class="loader-text">
          {{ recognizing ? 'Распознаем позиции счета, пожалуйста подождите...' : 'Выполняем автосопоставление, пожалуйста подождите...' }}
        </div>
      </div>
    </div>

    <main class="main-content">
      <div v-if="invoiceLoading" class="inline-state">Загрузка счета...</div>
      <div v-else-if="invoiceError" class="inline-state error">{{ invoiceError }}</div>
      <div class="step-header">
        <div class="step-chip" :class="{ active: step === 1 }">1. Реквизиты</div>
        <span class="step-arrow">→</span>
        <div class="step-chip" :class="{ active: step === 2 }">2. Позиции</div>
        <template v-if="hasRequest">
          <span class="step-arrow">→</span>
          <div class="step-chip" :class="{ active: step === 3 }">3. Сопоставление</div>
        </template>
      </div>

      <div class="step-title">
        <button type="button" class="title-link" @click="openInvoiceLink">Счёт #{{ invoiceId }}</button> • Этап: {{ stepLabel }}
        <span v-if="invoiceStatusName"> • Статус: {{ invoiceStatusName }}</span>
        <span v-if="projectObjectQuery"> • {{ projectObjectQuery }}</span>
      </div>

      <section v-if="step === 1" class="stage-layout">
        <div v-if="showPdf" class="pdf-pane">
          <div class="pdf-title">
            <span>PDF счёта</span>
            <input ref="invoiceFileInput" type="file" class="hidden-input" accept=".pdf,.jpg,.jpeg,.png" @change="onInvoiceFilePicked">
            <button
              v-if="invoiceId !== 'new'"
              class="upload-btn"
              type="button"
              :disabled="invoiceFileUploading"
              @click="triggerInvoiceFileUpload"
            >
              <i class="fas fa-upload"></i> {{ invoiceFileName ? 'Заменить файл' : 'Загрузить файл' }}
            </button>
          </div>
          <div v-if="invoiceFileName" class="pdf-file-name">{{ invoiceFileName }}</div>
          <div class="pdf-placeholder">
            <CustomPdfPreview :src="invoicePdfUrl" />
          </div>
        </div>

        <div class="stage-body">
          <div class="card-block">
            <h3>1. Выберите и сравните банковские счета ПОСТАВЩИКА</h3>
            <div class="field-grid">
              <label>ИНН<input v-model="supplier.inn" type="text"></label>
              <label>КПП<input v-model="supplier.kpp" type="text"></label>
              <label>Наименование
                <div class="lookup-wrap supplier-lookup">
                  <input v-model="supplierQuery" type="text" placeholder="Начните вводить название" @focus="supplierOpen = true" @input="supplierOpen = true">
                  <div v-if="supplierOpen" class="lookup-list">
                    <div v-if="counterpartiesLoading" class="lookup-empty">Загрузка...</div>
                    <button v-for="item in filteredSuppliers" :key="item.id" type="button" class="lookup-item" @click="selectSupplier(item)">{{ item.name }} <span v-if="item.inn" class="lookup-inn">({{ item.inn }})</span></button>
                    <div v-if="!counterpartiesLoading && !filteredSuppliers.length" class="lookup-empty">Ничего не найдено</div>
                  </div>
                </div>
              </label>
              <label>Расчётный счёт<input v-model="supplier.account" type="text"></label>
            </div>
            <div class="print-line">{{ supplierPrint }}</div>
          </div>

          <div class="card-block">
            <h3>2. Выберите и сравните банковские счета ПЛАТЕЛЬЩИКА</h3>
            <div class="field-grid">
              <label>ИНН<input v-model="payer.inn" type="text"></label>
              <label>КПП<input v-model="payer.kpp" type="text"></label>
              <label>Наименование
                <div class="lookup-wrap payer-lookup">
                  <input v-model="payerQuery" type="text" placeholder="Начните вводить название" @focus="payerOpen = true" @input="payerOpen = true">
                  <div v-if="payerOpen" class="lookup-list">
                    <div v-if="counterpartiesLoading" class="lookup-empty">Загрузка...</div>
                    <button v-for="item in filteredPayers" :key="item.id" type="button" class="lookup-item" @click="selectPayer(item)">{{ item.name }} <span v-if="item.inn" class="lookup-inn">({{ item.inn }})</span></button>
                    <div v-if="!counterpartiesLoading && !filteredPayers.length" class="lookup-empty">Ничего не найдено</div>
                  </div>
                </div>
              </label>
              <label>Расчётный счёт<input v-model="payer.account" type="text"></label>
            </div>
          </div>

          <div class="card-block">
            <h3>3. Проверьте дату и номер счёта</h3>
            <div class="field-grid two-cols">
              <label>Дата счёта<input v-model="invoiceDate" type="date"></label>
              <label>Номер счёта<input v-model="invoiceNumber" type="text"></label>
            </div>
          </div>

          <div class="card-block">
            <h3>4. От кого</h3>
            <div class="field-grid">
              <label>Пользователь
                <div class="lookup-wrap from-by-lookup">
                  <input v-model="fromByUserQuery" type="text" @focus="fromByUserOpen = true" @input="fromByUserOpen = true">
                  <div v-if="fromByUserOpen" class="lookup-list">
                    <div v-if="allUsersLoading" class="lookup-empty">Загрузка...</div>
                    <button v-for="item in filteredFromByUsers" :key="item.id" type="button" class="lookup-item" @click="selectFromByUser(item)">{{ [item.surname, item.name, item.patronymic].filter(Boolean).join(' ') || item.fio || item.short_fio || '—' }}</button>
                    <div v-if="!allUsersLoading && !filteredFromByUsers.length" class="lookup-empty">Ничего не найдено</div>
                  </div>
                </div>
              </label>
            </div>
          </div>

          <div class="card-block">
            <h3>5. Проект</h3>
            <div class="field-grid">
              <label>Проект / Объект
                <div class="lookup-wrap project-lookup">
                  <input v-model="projectObjectQuery" type="text" @focus="projectObjectOpen = true" @input="projectObjectOpen = true">
                  <div v-if="projectObjectOpen" class="lookup-list">
                    <div v-if="projectObjectsLoading || objectsLoading" class="lookup-empty">Загрузка...</div>
                    <button
                      v-for="item in filteredProjectObjects"
                      :key="`${item.type}-${item.id}`"
                      type="button"
                      class="lookup-item"
                      @click="selectProjectObject(item)"
                    >
                      <span v-if="item.type === 'object'" class="item-badge">Объект</span>
                      <span v-else class="item-badge">Проект</span>
                      {{ item.name }}
                    </button>
                    <div v-if="!projectObjectsLoading && !objectsLoading && !filteredProjectObjects.length" class="lookup-empty">Ничего не найдено</div>
                  </div>
                </div>
              </label>
            </div>
          </div>
        </div>
      </section>

      <section v-else-if="step === 2" class="stage-layout">
        <div v-if="showPdf" class="pdf-pane">
          <div class="pdf-title">
            <span>PDF счёта</span>
            <input ref="invoiceFileInput" type="file" class="hidden-input" accept=".pdf,.jpg,.jpeg,.png" @change="onInvoiceFilePicked">
            <button
              v-if="invoiceId !== 'new'"
              class="upload-btn"
              type="button"
              :disabled="invoiceFileUploading"
              @click="triggerInvoiceFileUpload"
            >
              <i class="fas fa-upload"></i> {{ invoiceFileName ? 'Заменить файл' : 'Загрузить файл' }}
            </button>
          </div>
          <div v-if="invoiceFileName" class="pdf-file-name">{{ invoiceFileName }}</div>
          <div class="pdf-placeholder">
            <CustomPdfPreview :src="invoicePdfUrl" />
          </div>
        </div>

        <div class="stage-body">
          <div class="card-block invoice-items-card">
            <div class="card-title-row">
              <h3>Позиции из счёта</h3>
              <div class="card-title-actions">
                <button class="icon-btn" type="button" title="Добавить строку" @click="addInvoiceRow">
                  <i class="fa-regular fa-plus"></i>
                </button>
                <button class="icon-btn danger" type="button" title="Удалить все позиции" @click="clearInvoiceRows">
                  <i class="fa-regular fa-trash"></i>
                </button>
              </div>
            </div>
            <div class="table-wrap invoice-items-wrap">
              <table class="data-table stage2-invoice-table">
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
                    <th>№</th>
                    <th>Название позиций счёта</th>
                    <th>Кол-во</th>
                    <th>Ед. изм.</th>
                    <th>Цена</th>
                    <th>Сумма</th>
                    <th>НДС</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in invoicePositions" :key="`inv-${row.id}`" @contextmenu="openRowMenu($event, row)">
                    <td>{{ row.idx }}</td>
                    <td>
                      <textarea
                        :value="row.name"
                        class="cell-input cell-textarea"
                        rows="1"
                        @input="onCellTextInput($event, row, 'name')"
                      ></textarea>
                    </td>
                    <td><input v-model="row.qty" class="cell-input" type="text" @input="onRowNumericInput(row, 'qty')"></td>
                    <td><input v-model="row.unit" class="cell-input" type="text"></td>
                    <td><input v-model="row.price" class="cell-input" type="text" @input="onRowNumericInput(row, 'price')"></td>
                    <td><input v-model="row.sum" class="cell-input" type="text" @input="onRowNumericInput(row, 'sum')"></td>
                    <td><input v-model="row.vat" class="cell-input" type="text" @input="row.vat = normalizeDecimalInput(row.vat)"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="card-block">
            <div class="field-stack">
              <label>НДС включен</label>
              <div class="option-row">
                <button class="option-btn" :class="{ active: vatMode === 'line' }" type="button" @click="vatMode = 'line'">В позиции</button>
                <button class="option-btn" :class="{ active: vatMode === 'total' }" type="button" @click="vatMode = 'total'">На весь счет</button>
                <button class="option-btn" :class="{ active: vatMode === 'none' }" type="button" @click="vatMode = 'none'">Без НДС</button>
              </div>

              <template v-if="vatMode !== 'none'">
                <template v-if="vatMode === 'total'">
                  <label>Ставка НДС, %</label>
                  <input v-model="vatRate" type="text" placeholder="Ставка НДС, %" @input="vatRate = normalizeDecimalInput(vatRate)">
                </template>

                <label>НДС включён в стоимость</label>
                <div class="option-row">
                  <button class="option-btn" :class="{ active: vatCommon === 'no' }" type="button" @click="vatCommon = 'no'">Нет</button>
                  <button class="option-btn" :class="{ active: vatCommon === 'yes' }" type="button" @click="vatCommon = 'yes'">Да</button>
                </div>

                <label>Размер НДС, руб</label>
                <input v-model="vatAmount" type="text" placeholder="Размер НДС, руб" @input="vatAmount = normalizeDecimalInput(vatAmount)">
              </template>

              <label>Сумма счета (С НДС), руб</label>
              <input v-model="invoiceAmount" type="text" placeholder="Сумма счета (С НДС), руб" @input="invoiceAmount = normalizeDecimalInput(invoiceAmount)">
              <div v-if="invoiceDifferenceText" class="sum-hint">{{ invoiceDifferenceText }}</div>
            </div>
          </div>
        </div>
      </section>

      <section v-else-if="hasRequest" class="stage-three">
        <div class="match-head">
          <div class="match-head-left">
            <select v-model="matchingMode" class="mode-select">
            <option value="1to1">1 к 1</option>
            <option value="kit">Комплект</option>
            <option value="sum">Сумма</option>
            </select>
            <button class="btn" type="button" @click="clearAllMappings">Удалить все связки</button>
          </div>
          <button class="btn" type="button" @click="hideLinkedPositions = !hideLinkedPositions">
            {{ hideLinkedPositions ? 'Показать связанные позиции' : 'Скрыть связанные позиции' }}
          </button>
        </div>

        <div v-if="showPdf" class="pdf-inline">
          <div class="pdf-title">
            <span>PDF счёта</span>
            <input ref="invoiceFileInput" type="file" class="hidden-input" accept=".pdf,.jpg,.jpeg,.png" @change="onInvoiceFilePicked">
            <button
              v-if="invoiceId !== 'new'"
              class="upload-btn"
              type="button"
              :disabled="invoiceFileUploading"
              @click="triggerInvoiceFileUpload"
            >
              <i class="fas fa-upload"></i> {{ invoiceFileName ? 'Заменить файл' : 'Загрузить файл' }}
            </button>
          </div>
          <div v-if="invoiceFileName" class="pdf-file-name">{{ invoiceFileName }}</div>
          <div class="pdf-placeholder">
            <CustomPdfPreview :src="invoicePdfUrl" />
          </div>
        </div>

        <div class="tables-grid">
          <div class="table-card">
            <div class="table-title">Позиции из заявки #{{ requestId }}</div>
            <div class="table-wrap">
              <table class="data-table stage3-request-table">
                <colgroup>
                  <col class="col-narrow">
                  <col class="col-name-wide">
                  <col class="col-small">
                  <col class="col-small">
                  <col class="col-small">
                  <col class="col-narrow">
                </colgroup>
                <thead>
                  <tr>
                    <th><button type="button" class="th-sort-btn" @click="toggleRequestSort('idx')"># {{ sortMark(requestSort, 'idx') }}</button></th>
                    <th><button type="button" class="th-sort-btn" @click="toggleRequestSort('title')">Позиция заявки {{ sortMark(requestSort, 'title') }}</button></th>
                    <th><button type="button" class="th-sort-btn" @click="toggleRequestSort('qty')">Кол-во {{ sortMark(requestSort, 'qty') }}</button></th>
                    <th><button type="button" class="th-sort-btn" @click="toggleRequestSort('unit')">Ед. изм {{ sortMark(requestSort, 'unit') }}</button></th>
                    <th><button type="button" class="th-sort-btn" @click="toggleRequestSort('comment')">Комментарий {{ sortMark(requestSort, 'comment') }}</button></th>
                    <th><button type="button" class="th-sort-btn" @click="toggleRequestSort('num')">№ {{ sortMark(requestSort, 'num') }}</button></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in sortedVisibleRequestRowsStage3" :key="`req-${row.id}`">
                    <td>{{ row.idx }}</td>
                    <td>{{ row.title }}</td>
                    <td>{{ row.qty }}</td>
                    <td>{{ row.unit }}</td>
                    <td>{{ row.comment }}</td>
                    <td
                      class="mapping-cell"
                      :class="{ selected: isRequestSelected(row.id) }"
                      @click="onRequestMappingCellClick(row)"
                    >
                      <div class="group-badges">
                        <span
                          v-for="group in row.groupNumbers"
                          :key="`rq-g-${row.id}-${group.groupNumber}`"
                          class="group-badge"
                          :class="{ 'group-badge-kit-head': String(group.matchType).toLowerCase() === 'kit_head' }"
                          :style="groupColorStyle(group.groupNumber, group.matchType)"
                        >
                          <span class="group-badge-text">{{ group.groupNumber }}</span>
                        </span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="table-card">
            <div class="table-title">Позиции из счёта #{{ invoiceId }}</div>
            <div class="table-wrap">
              <table class="data-table stage3-invoice-table">
                <colgroup>
                  <col class="col-narrow">
                  <col class="col-name-wide">
                  <col class="col-small">
                  <col class="col-small">
                  <col class="col-small">
                  <col class="col-small">
                  <col class="col-small">
                  <col class="col-small">
                </colgroup>
                <thead>
                  <tr>
                    <th><button type="button" class="th-sort-btn" @click="toggleBillSort('idx')">№ {{ sortMark(billSort, 'idx') }}</button></th>
                    <th><button type="button" class="th-sort-btn" @click="toggleBillSort('title')">Наименование позиций счета {{ sortMark(billSort, 'title') }}</button></th>
                    <th><button type="button" class="th-sort-btn" @click="toggleBillSort('convQty')">Прив. кол-во {{ sortMark(billSort, 'convQty') }}</button></th>
                    <th><button type="button" class="th-sort-btn" @click="toggleBillSort('convUnit')">Прив. ед. изм {{ sortMark(billSort, 'convUnit') }}</button></th>
                    <th><button type="button" class="th-sort-btn" @click="toggleBillSort('qty')">Кол-во {{ sortMark(billSort, 'qty') }}</button></th>
                    <th><button type="button" class="th-sort-btn" @click="toggleBillSort('unit')">Ед. изм {{ sortMark(billSort, 'unit') }}</button></th>
                    <th><button type="button" class="th-sort-btn" @click="toggleBillSort('price')">Цена {{ sortMark(billSort, 'price') }}</button></th>
                    <th><button type="button" class="th-sort-btn" @click="toggleBillSort('sum')">Сумма {{ sortMark(billSort, 'sum') }}</button></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in sortedVisibleBillRowsStage3" :key="`bill-${row.id}`">
                    <td
                      class="mapping-cell"
                      :class="{ selected: isInvoiceSelected(row.id) }"
                      @click="onInvoiceMappingCellClick(row)"
                    >
                      <div class="group-badges">
                        <span
                          v-for="group in row.groupNumbers"
                          :key="`inv-g-${row.id}-${group.groupNumber}`"
                          class="group-badge"
                          :class="{ 'group-badge-kit-head': String(group.matchType).toLowerCase() === 'kit_head' }"
                          :style="groupColorStyle(group.groupNumber, group.matchType)"
                        >
                          <span class="group-badge-text">{{ group.groupNumber }}</span>
                        </span>
                      </div>
                    </td>
                    <td>{{ row.title }}</td>
                    <td :class="{ 'mapped-mismatch': isMappedQuantityMismatch(row) }">{{ row.convQty }}</td>
                    <td>{{ row.convUnit }}</td>
                    <td>{{ row.qty }}</td>
                    <td>{{ row.unit }}</td>
                    <td>{{ row.price }}</td>
                    <td>{{ row.sum }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <div
        v-if="rowMenu.open"
        class="row-action-menu"
        :style="{ left: `${rowMenu.x}px`, top: `${rowMenu.y}px` }"
        @mousedown.stop
      >
        <button class="row-action-item" type="button" @click="removeInvoiceRow(rowMenu.rowId, false)">Удалить строку</button>
        <button class="row-action-item" type="button" @click="removeInvoiceRow(rowMenu.rowId, true)">Удалить строку со сдвигом вверх</button>
      </div>
    </main>

    <div v-if="sendModalOpen" class="modal-backdrop" @click.self="closeSendModal">
      <div class="modal-card">
        <div class="modal-head">
          <h3 class="modal-title">Передать на согласование</h3>
          <button type="button" class="modal-close" @click="closeSendModal">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <label class="label">Согласующие</label>
        <div class="approver-select">
          <input
            v-model="approverQuery"
            class="form-input"
            type="text"
            placeholder="Поиск пользователя..."
            @focus="approverDropdownOpen = true"
          >
          <div v-if="approverDropdownOpen" class="approver-dropdown">
            <button
              v-for="opt in filteredApproverOptions"
              :key="opt.id"
              type="button"
              class="approver-option"
              @click="toggleApprover(opt.id)"
            >
              <input type="checkbox" :checked="selectedApproverIds.includes(opt.id)" readonly>
              <span>{{ opt.fio }}</span>
            </button>
            <div v-if="!filteredApproverOptions.length" class="empty">Ничего не найдено</div>
          </div>
        </div>

        <div v-if="selectedApproverIds.length" class="role-list modal-selected">
          <span
            v-for="id in selectedApproverIds"
            :key="id"
            class="role-chip role-chip-removable"
          >
            <span>{{ approverOptions.find((u) => u.id === id)?.fio || id }}</span>
            <button type="button" class="chip-remove" @click="removeSelectedApprover(id)">
              <i class="fas fa-times"></i>
            </button>
          </span>
        </div>

        <div class="modal-actions">
          <button type="button" class="btn" @click="closeSendModal">Отмена</button>
          <button type="button" class="btn btn-primary" :disabled="sendingApprovals || !selectedApproverIds.length" @click="submitApprovers">
            {{ sendingApprovals ? 'Отправка...' : 'Передать' }}
          </button>
        </div>
      </div>
    </div>

    <footer class="invoice-footer">
      <div class="footer-left">
        <button class="btn" type="button" @click="togglePdf">
          {{ showPdf ? 'Скрыть счет' : 'Показать счет' }}
        </button>
        <button v-if="step === 2" class="btn" type="button" :disabled="recognizing" @click="recognizePositions">Распознать позиции</button>
        <button v-if="step === 3 && hasRequest" class="btn" type="button" :disabled="autoMatching" @click="autoMatch">Автосопоставление</button>
      </div>

      <div class="footer-right">
        <button class="btn" type="button" :disabled="saving" @click="saveDraft">{{ saving ? 'Сохранение...' : 'Сохранить' }}</button>
        <button v-if="step > 1" class="btn" type="button" @click="prevStep">Назад</button>
        <button v-if="step < maxStep" class="btn btn-primary" type="button" @click="nextStep">Продолжить</button>
        <template v-else>
          <button class="btn btn-primary" type="button" @click="openSendModal">Отправить на согласование</button>
          <button class="btn" type="button" @click="finishProcess">Завершить</button>
        </template>
      </div>
    </footer>

    <transition name="toast-fade">
      <div v-if="toast.open" :key="toast.key" class="toast" :class="{ closing: toast.closing }">
        {{ toast.message }}
        <div class="toast-timer"></div>
      </div>
    </transition>
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

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px 24px 8px;
  min-height: 0;
  overflow: hidden;
}

.page-loader {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: color-mix(in srgb, #0f172a 38%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.loader-card {
  min-width: 320px;
  max-width: 460px;
  border-radius: 12px;
  border: 1px solid var(--border-light);
  background: var(--bg-surface);
  box-shadow: var(--shadow-md);
  padding: 18px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
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

.form-input {
  width: 100%;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: 8px 10px;
  font-size: 13px;
  color: var(--text-primary);
  background: var(--bg-surface);
  outline: none;
  transition: border-color 0.2s;
}

.form-input:focus {
  border-color: var(--brand-primary);
}

.item-badge {
  display: inline-block;
  padding: 1px 6px;
  margin-right: 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  background: var(--bg-subtle);
  color: var(--text-secondary);
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

.modal-card {
  border-radius: 12px;
  border: 1px solid var(--border-light);
  background: var(--bg-surface);
  box-shadow: var(--shadow-md);
  width: min(520px, calc(100vw - 32px));
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.modal-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-title {
  margin: 0;
  font-size: 17px;
  color: var(--text-primary);
}

.modal-close {
  background: none;
  border: none;
  color: var(--text-tertiary);
  font-size: 18px;
  cursor: pointer;
  padding: 4px;
  line-height: 1;
}

.modal-close:hover {
  color: var(--text-primary);
}

.label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.approver-select {
  position: relative;
}

.approver-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 10;
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  max-height: 200px;
  overflow-y: auto;
  margin-top: 2px;
}

.approver-option {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  border: none;
  background: transparent;
  padding: 8px 12px;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  color: var(--text-primary);
}

.approver-option:hover {
  background: var(--bg-hover);
}

.approver-dropdown .empty {
  padding: 12px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 13px;
}

.role-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.role-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.role-chip-removable {
  background: var(--brand-bg);
  border: 1px solid var(--brand-primary);
}

.chip-remove {
  background: none;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  font-size: 12px;
  padding: 0;
  line-height: 1;
}

.chip-remove:hover {
  color: var(--danger);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-light);
}

.modal-selected {
  margin-top: 4px;
}

.empty {
  padding: 12px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 13px;
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

.field-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.field-stack > label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.field-stack input {
  width: 100%;
  min-height: 36px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-light);
  background: var(--bg-subtle);
  padding: 0 10px;
}

.option-row {
  display: flex;
  gap: 6px;
}

.option-btn {
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  background: var(--bg-surface);
  color: var(--text-secondary);
  min-height: 32px;
  padding: 0 12px;
  font-size: 12px;
  cursor: pointer;
}

.option-btn.active {
  border-color: var(--brand-primary);
  background: var(--brand-light);
  color: var(--brand-primary);
  font-weight: 600;
}

.sum-hint {
  font-size: 11px;
  color: var(--danger-text);
  padding: 4px 2px 0;
}

.btn {
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  background: var(--bg-surface);
  color: var(--text-secondary);
  min-height: 30px;
  padding: 0 12px;
  font-size: 12px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.btn-primary {
  border-color: var(--brand-primary);
  background: var(--brand-primary);
  color: #fff;
}

.toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  padding: 10px 18px;
  border-radius: var(--radius-md);
  background: #1e293b;
  color: #f1f5f9;
  font-size: 13px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  gap: 10px;
  overflow: hidden;
}

.toast-timer {
  width: 4px;
  height: 100%;
  background: var(--brand-primary);
  position: absolute;
  left: 0;
  top: 0;
  animation: toast-shrink 3s linear forwards;
}

@keyframes toast-shrink {
  from { width: 100%; }
  to { width: 0%; }
}

.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: opacity 0.3s, transform 0.3s;
}

.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(10px);
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

.table-wrap {
  overflow: visible;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 12px;
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

.cell-input:focus {
  border-color: var(--brand-primary);
  background: var(--bg-subtle);
  outline: none;
}

.cell-input.readonly {
  color: var(--text-secondary);
}

.cell-select {
  appearance: none;
  background: var(--bg-surface);
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

.lookup-item:hover {
  background: var(--bg-subtle);
}

.lookup-empty {
  color: var(--text-tertiary);
}

.lookup-inn {
  color: var(--text-tertiary);
  font-size: 12px;
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

.title-link:hover {
  text-decoration: underline;
}

.inline-state {
  font-size: 12px;
  color: var(--text-secondary);
}

.inline-state.error {
  color: var(--danger-text);
}

.danger-btn {
  border-color: color-mix(in srgb, var(--danger-text) 35%, var(--border-light));
  color: var(--danger-text);
}

.match-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}

.match-head-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mode-select {
  min-height: 36px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  background: var(--bg-surface);
  padding: 0 10px;
  font-size: 13px;
  color: var(--text-primary);
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

.stage2-invoice-table col.col-narrow:last-child {
  width: 52px;
}

.stage3-request-table col.col-narrow,
.stage3-invoice-table col.col-narrow {
  width: 52px;
}

.stage3-request-table col.col-name-wide {
  width: 42%;
}

.stage3-invoice-table col.col-name-wide {
  width: 40%;
}

.stage3-invoice-table col.col-small {
  width: 98px;
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

.data-table tr.selected td {
  background: color-mix(in srgb, var(--brand-primary) 7%, #fff);
}

.table-empty {
  text-align: center;
  color: var(--text-tertiary);
}

.hidden-input {
  display: none;
}

.upload-btn {
  border: 1px solid var(--brand-primary);
  border-radius: var(--radius-sm);
  background: var(--brand-light);
  color: var(--brand-primary);
  min-height: 26px;
  padding: 0 8px;
  font-size: 11px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.upload-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.pdf-file-name {
  font-size: 11px;
  color: var(--text-tertiary);
  padding: 4px 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background: var(--bg-subtle);
  border-bottom: 1px solid var(--border-light);
}

.print-line {
  font-size: 11px;
  color: var(--text-tertiary);
  padding-top: 6px;
  border-top: 1px dashed var(--border-light);
  margin-top: 4px;
  font-family: monospace;
}

.lookup-wrap {
  position: relative;
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

@media (max-width: 1280px) {
  .tables-grid.two-tables,
  .stage-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 1200px) {
  .stage-layout {
    grid-template-columns: 1fr;
  }

  .tables-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 1512px) {
  .stage3-invoice-table col.col-name-wide {
    width: 38%;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>