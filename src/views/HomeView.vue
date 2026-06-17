<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TopNav from '../components/layout/TopNav.vue'
import ContentHeader from '../components/layout/ContentHeader.vue'
import FilterTabs from '../components/filters/FilterTabs.vue'
import RequestsTable from '../components/table/RequestsTable.vue'
import ChatPanel from '../components/chat/ChatPanel.vue'
import notificationSoundUrl from '../assets/sounds/notification.mp3'
import { mainNavLinks } from '../constants/mainNav'
import { useChatStore } from '../stores/chat'

const navLinks = mainNavLinks
const chat = useChatStore()

const rows = ref([])
const allRows = ref([])
const loading = ref(false)
const loadError = ref('')
const expandedRows = reactive({})
const supplierRequestLoading = ref(false)
const supplierRequestError = ref('')

const isCreateRequestModalOpen = ref(false)
const requestObjectQuery = ref('')
const selectedRequestObjectId = ref('')
const requestObjects = ref([])
const isRequestObjectsLoading = ref(false)
const requestObjectsError = ref('')
const isRequestObjectDropdownOpen = ref(false)
const isSubmittingRequest = ref(false)
const createRequestError = ref('')
const requestLookupRef = ref(null)
const isAttachInvoiceModalOpen = ref(false)
const attachInvoiceRequestId = ref(null)
const invoiceFiles = ref([])
const counterparties = ref([])
const counterpartiesLoading = ref(false)
const counterpartiesError = ref('')
const supplierQuery = ref('')
const payerQuery = ref('')
const selectedSupplierId = ref('')
const selectedPayerId = ref('')
const isSupplierDropdownOpen = ref(false)
const isPayerDropdownOpen = ref(false)
const supplierLookupRef = ref(null)
const payerLookupRef = ref(null)
const invoiceFilesInputRef = ref(null)
const deliveryIncluded = ref(null)
const prepaymentRequired = ref(null)
const prepaymentPercent = ref('')
const defermentProvided = ref(null)
const defermentDays = ref('')
const invoiceValidityDays = ref('')
const urgentInvoice = ref(null)
const stockState = ref('')
const attachInvoiceError = ref('')
const parseError = ref('')
const parsingInvoice = ref(false)
const duplicateInfo = ref(null)
const isAttachInvoiceSubmitting = ref(false)
const checkedAll = ref(false)
const activeQuickFilter = ref('all')
const filters = ref({
  id: '',
  projects: [],
  creators: [],
  statuses: [],
})
const filterDropdownOpen = ref('')
const colFilterValues = ref({ agreed: [], answered: [], stock: [], paid: [], delivered: [] })

const notificationCounts = ref({
  requests: 0,
  invoices: 0,
  deliveries: 0,
})

const notificationAudio = ref(null)
let lastCounterpartiesRefreshAt = 0

const router = useRouter()
const route = useRoute()

const tabKeys = ['all', 'approval', 'response', 'payment', 'delivery', 'archive']
const tabLabels = {
  all: 'Все заявки',
  approval: 'На согласовании',
  response: 'Ожидают ответа',
  payment: 'Ожидают оплаты',
  delivery: 'В доставке',
  archive: 'Архив',
}

const rowMatchesQuickFilter = (row, key) => {
  const status = String(row.statusText || '').toLowerCase()
  if (key === 'all') return true
  if (key === 'approval') return status.includes('соглас')
  if (key === 'response') return status.includes('ответ')
  if (key === 'payment') return status.includes('оплат')
  if (key === 'delivery') return status.includes('достав') || status.includes('в пути')
  if (key === 'archive') return status.includes('архив') || status.includes('заверш') || status.includes('отклон')
  return true
}

const filterTabs = computed(() =>
  tabKeys.map((key) => ({
    key,
    label: tabLabels[key],
    count: allRows.value.filter((row) => rowMatchesQuickFilter(row, key)).length,
    active: activeQuickFilter.value === key,
  })))

const projectOptions = computed(() => [...new Set(allRows.value.flatMap((row) => row.projects || []).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru')))
const creatorOptions = computed(() => [...new Set(allRows.value.map((row) => row.users?.[0]?.name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru')))
const statusOptions = computed(() => [...new Set(allRows.value.map((row) => row.statusText).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru')))

const filteredRows = computed(() => {
  const idQ = String(filters.value.id || '').trim().toLowerCase()
  const projectSet = new Set(filters.value.projects || [])
  const creatorSet = new Set(filters.value.creators || [])
  const statusSet = new Set(filters.value.statuses || [])
  const {
    agreed: agreedF, answered: answeredF,
    stock: stockF, paid: paidF, delivered: deliveredF,
  } = colFilterValues.value
  return allRows.value.filter((row) => {
    if (!rowMatchesQuickFilter(row, activeQuickFilter.value)) return false
    if (idQ && !String(row.id || '').toLowerCase().includes(idQ)) return false
    if (projectSet.size > 0 && !(row.projects || []).some((project) => projectSet.has(project))) return false
    if (creatorSet.size > 0 && !creatorSet.has(String(row.users?.[0]?.name || ''))) return false
    if (statusSet.size > 0 && !statusSet.has(String(row.statusText || ''))) return false
    if (agreedF.length > 0) {
      const isAgreed = row.statusBars?.[0]?.height === '100%'
      if (!((agreedF.includes('pending') && !isAgreed) || (agreedF.includes('done') && isAgreed))) return false
    }
    if (answeredF.length > 0) {
      const allAnswered = row.statusBars?.[1]?.height === '100%'
      if (!((answeredF.includes('waiting') && !allAnswered) || (answeredF.includes('all') && allAnswered))) return false
    }
    if (stockF.length > 0) {
      const hasStock = row.statusBars?.[2]?.variant === 'fill-stock'
      if (!((stockF.includes('missing') && !hasStock) || (stockF.includes('present') && hasStock))) return false
    }
    if (paidF.length > 0) {
      const isPaid = row.statusBars?.[3]?.variant === 'fill-success'
      if (!((paidF.includes('unpaid') && !isPaid) || (paidF.includes('all') && isPaid))) return false
    }
    if (deliveredF.length > 0) {
      const isDelivered = row.statusBars?.[4]?.variant === 'fill-success'
      if (!((deliveredF.includes('undelivered') && !isDelivered) || (deliveredF.includes('delivered') && isDelivered))) return false
    }
    return true
  })
})

const selectedCount = computed(() => allRows.value.filter((row) => row.checked).length)

const normalizeArray = (payload) => {
  if (Array.isArray(payload)) return payload
  return payload?.items || payload?.data || payload?.results || []
}

const mapAttachment = (item) => ({
  id: item?.id || item?.file_id || item?.uuid || item?.key || '',
  name:
    item?.name
    || item?.file_name
    || item?.filename
    || item?.original_name
    || `Файл ${item?.id || ''}`.trim(),
})

const mapInvoiceStatusClass = (statusName) => {
  const value = String(statusName || '').toLowerCase()
  if (value.includes('нов')) return 'ds-blue'
  if (value.includes('процесс') || value.includes('работ')) return 'ds-process'
  if (value.includes('соглас') || value.includes('оплач') || value.includes('заверш')) return 'ds-ok'
  return ''
}

const mapInvoiceDoc = (invoice) => ({
  id: invoice?.id,
  icon: 'fas fa-file-invoice-dollar',
  title: `Счет ${invoice?.num || '—'} от ${formatDate(invoice?.date)}`,
  num: invoice?.num || '—',
  date: formatDate(invoice?.date),
  payerName: invoice?.payer_name || '—',
  providerName: invoice?.provider_name || '—',
  statusName: invoice?.status_name || '—',
  status: mapInvoiceStatusClass(invoice?.status_name),
})

const formatDate = (value) => {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('ru-RU')
}

const statusClassFromName = (statusName) => {
  const val = String(statusName || '').toLowerCase()
  if (val.includes('нов')) return 'row-new'
  if (val.includes('отклон')) return 'row-wait'
  if (val.includes('в работе') || val.includes('в процессе') || val.includes('process')) return 'row-work'
  if (val.includes('соглас')) return 'row-wait'
  if (val.includes('выполн') || val.includes('заверш')) return 'row-done'
  return 'row-work'
}

const getAnswerProgress = (request) => {
  const answered = Number(request?.answered_positions || 0)
  const total = Number(request?.total_positions || 0)
  const safeAnswered = Number.isFinite(answered) && answered > 0 ? answered : 0
  const safeTotal = Number.isFinite(total) && total > 0 ? total : 0
  const percent = safeTotal > 0 ? Math.max(0, Math.min(100, (safeAnswered / safeTotal) * 100)) : 0
  return {
    answered: safeAnswered,
    total: safeTotal,
    percent,
    tooltip: `Получен ответ на ${safeAnswered}/${safeTotal} позиций`,
    variant: percent > 0 ? 'fill-answer' : 'fill-muted',
  }
}

const clampPercent = (current, total) => {
  const safeCurrent = Number(current || 0)
  const safeTotal = Number(total || 0)
  if (!Number.isFinite(safeCurrent) || !Number.isFinite(safeTotal) || safeTotal <= 0) return 0
  return Math.max(0, Math.min(100, (safeCurrent / safeTotal) * 100))
}

const formatQty = (value) => {
  const num = Number(value || 0)
  if (!Number.isFinite(num)) return '0'
  return num.toLocaleString('ru-RU', { maximumFractionDigits: 3 })
}

const statusBarsFromRequest = (request) => {
  const approved = request?.approved_at || request?.rejected_at ? '100%' : '0%'
  const approvedVariant = request?.rejected_at ? 'fill-warn' : (approved === '100%' ? 'fill-success' : '')
  const delivered = request?.completed_at ? '100%' : '0%'
  const answer = getAnswerProgress(request)
  const stockCount = Number(request?.warehouse_positions_on_stock || 0)
  const deliveredCount = Number(request?.warehouse_positions_delivered || 0)
  const stockTotal = Number(request?.warehouse_positions_total || request?.total_positions || 0)
  const stockPercent = clampPercent(stockCount, stockTotal)
  const deliveredPercent = clampPercent(deliveredCount, stockTotal)
  return [
    { height: approved, variant: approvedVariant },
    { height: `${answer.percent}%`, variant: answer.variant, title: answer.tooltip },
    {
      height: `${stockPercent}%`,
      variant: stockCount > 0 ? 'fill-stock' : 'fill-muted',
      label: stockCount > 0 ? formatQty(stockCount) : '',
      title: `На складе ${formatQty(stockCount)}/${formatQty(stockTotal)} позиций`,
    },
    { height: '0%', variant: '' },
    {
      height: `${deliveredPercent}%`,
      variant: deliveredCount > 0 ? 'fill-success' : 'fill-muted',
      label: deliveredCount > 0 ? formatQty(deliveredCount) : '',
      title: `Доставлено ${formatQty(deliveredCount)}/${formatQty(stockTotal)} позиций`,
    },
  ]
}

const statusBarsForPosition = (request, item) => {
  const approvedHeight = request?.approved_at || request?.rejected_at ? '100%' : '0%'
  const approvedVariant = request?.rejected_at ? 'fill-warn' : (approvedHeight === '100%' ? 'fill-success' : '')
  const deliveryHeight = request?.completed_at ? '100%' : '0%'
  const answer = getAnswerProgress(request)
  const stockQty = Number(item?.request_warehouse_quantity || 0)
  const totalQty = Number(item?.quantity || 0)
  const warehouseStatus = String(item?.warehouse_status || '').trim().toLowerCase()
  const isDelivered = warehouseStatus.includes('достав')
  const stockPercent = clampPercent(stockQty, totalQty)
  const hasStock = !isDelivered && (stockQty > 0 || warehouseStatus)
  const deliveredPercent = isDelivered ? stockPercent : 0
  return [
    { type: 'bar', height: approvedHeight, variant: approvedVariant },
    { type: 'bar', height: `${answer.percent}%`, variant: answer.variant, title: answer.tooltip },
    {
      type: 'bar',
      height: `${stockPercent}%`,
      variant: hasStock ? 'fill-stock' : 'fill-muted',
      label: stockQty > 0 ? formatQty(stockQty) : '',
      title: `${item?.warehouse_status || 'Не на складе'}: ${formatQty(stockQty)}/${formatQty(totalQty)}`,
    },
    { type: 'bar', height: '0%', variant: '' },
    {
      type: 'bar',
      height: `${deliveredPercent}%`,
      variant: isDelivered ? 'fill-success' : 'fill-muted',
      label: isDelivered && stockQty > 0 ? formatQty(stockQty) : '',
      title: `${item?.warehouse_status || 'Не доставлено'}: ${formatQty(isDelivered ? stockQty : 0)}/${formatQty(totalQty)}`,
    },
  ]
}

const buildLeftIndicator = (request, statusClass) => {
  const statusName = String(request?.status?.name || '').toLowerCase()
  if (!statusName.includes('нов')) {
    return { type: 'solid', statusClass }
  }

  const segments = (request?.logs || []).map((log) => {
    const value = String(log?.status_name || '').toLowerCase()
    if (value.includes('approved') || value.includes('ok')) return { status: 'approved' }
    if (value.includes('reject')) return { status: 'rejected' }
    return { status: 'pending' }
  })
  return { type: 'segments', segments: segments.length ? segments : [{ status: 'pending' }] }
}

const mapAcceptor = (log) => {
  const status = String(log?.status_name || '').toLowerCase()
  let variant = 'st-amber'
  if (status.includes('approved') || status.includes('ok')) variant = 'st-green'
  if (status.includes('reject')) variant = 'st-red'
  return {
    variant,
    name: log?.user?.short_fio || `${log?.user?.surname || ''} ${log?.user?.name || ''}`.trim() || '—',
    date: log?.date_response ? formatDate(log.date_response) : null,
  }
}

const buildDates = (request) => {
  const dates = []
  if (request?.created_at) dates.push({ label: 'Создана', value: formatDate(request.created_at) })
  if (request?.started_at) dates.push({ label: 'Передана в работу', value: formatDate(request.started_at) })
  if (request?.approved_at) dates.push({ label: 'Согласована', value: formatDate(request.approved_at) })
  if (request?.rejected_at) dates.push({ label: 'Отклонена', value: formatDate(request.rejected_at) })
  if (request?.deadline) dates.push({ label: 'Требуется', value: formatDate(request.deadline), color: 'var(--brand-primary)' })
  return dates
}

const mapExpanded = (request, statusClass) => ({
  open: false,
  type: 'table',
  title: 'Позиции заявки',
  theme:
    statusClass === 'row-new'
      ? 'expanded-theme-new'
      : statusClass === 'row-done'
        ? 'expanded-theme-done'
        : statusClass === 'row-wait'
          ? 'expanded-theme-wait'
          : 'expanded-theme-work',
  // Keep status columns aligned with parent request row:
  // widths before statuses sum to 870px (same as parent before status stack).
  colWidths: ['40px', '70px', '320px', '130px', '80px', '110px', '120px', '36px', '36px', '36px', '36px', '36px', '100px', '60px'],
  columns: [
    { label: '' },
    { label: '№' },
    { label: 'Наименование' },
    { label: 'Категория' },
    { label: 'Кол-во' },
    { label: 'Ед. изм.' },
    { label: 'Доставка' },
    { label: 'Согласовано', vertical: true },
    { label: 'Ответ', vertical: true },
    { label: 'На складе', vertical: true },
    { label: 'Оплачено', vertical: true },
    { label: 'Доставлено', vertical: true },
    { label: 'Док-ты' },
    { label: '' },
  ],
  rows: (request.items || [])
    .slice()
    .sort((a, b) => (a.num || 0) - (b.num || 0))
    .map((item, idx) => [
      {
        type: 'checkbox',
        checked: false,
        requestId: String(request.id || ''),
        itemId: String(item.id || item.item_id || item.nomenclature?.id || item.nomenclature_id || item.num || idx + 1),
      },
      String(item.num ?? idx + 1),
      item.name || item.nomenclature?.name || '—',
      item.nomenclature?.warehouse_category?.name || item.warehouse_category?.name || '—',
      item.quantity ?? '—',
      item.unit?.name || item.nomenclature?.unit?.name || '—',
      item.delivery_date ? formatDate(item.delivery_date) : (request.deadline ? formatDate(request.deadline) : '—'),
      ...statusBarsForPosition(request, item),
      '',
      '',
    ]),
})

const loadRequests = async () => {
  loading.value = true
  loadError.value = ''
  try {
    const res = await fetch('/apisup/supply/requests/my', { credentials: 'include' })
    if (!res.ok) throw new Error('requests load failed')
    const payload = await res.json()
    const list = normalizeArray(payload)

    const mappedRows = list.map((request) => {
      const statusName = request?.status?.name || ''
      const statusClass = statusClassFromName(statusName)
      const apiItems = Array.isArray(request.items) ? request.items : []
      const sortedItems = [...apiItems].sort((a, b) => (a?.num || 0) - (b?.num || 0))
      const normalizedItems = sortedItems.map((item, idx) => ({
        id: String(item?.id || item?.item_id || item?.nomenclature?.id || item?.nomenclature_id || item?.num || idx + 1),
        num: item?.num ?? idx + 1,
        name: item?.name || item?.nomenclature?.name || '—',
        unit_name: item?.unit?.name || item?.nomenclature?.unit?.name || '—',
        quantity: item?.quantity ?? '',
        comment: item?.comment || '',
      }))
      expandedRows[request.id] = mapExpanded({ ...request, items: sortedItems }, statusClass)
      return {
        id: request.id,
        checked: false,
        statusClass,
        statusText: statusName || '—',
        title: request.name || `Заявка #${request.id}`,
        positions: `${(request.items || []).length} позиций`,
        items: normalizedItems,
        projects: request.project_name ? [request.project_name] : [],
        users: [
          {
            icon: 'fas fa-plus',
            name: request.created_by_user?.short_fio
              || `${request.created_by_user?.surname || ''} ${request.created_by_user?.name || ''}`.trim()
              || '—',
          },
          {
            icon: 'fas fa-briefcase',
            name: request.executor_user?.short_fio
              || `${request.executor_user?.surname || ''} ${request.executor_user?.name || ''}`.trim()
              || '—',
          },
        ],
        acceptors: (request.logs || []).map(mapAcceptor),
        dates: buildDates(request),
        leftIndicator: buildLeftIndicator(request, statusClass),
        statusBars: statusBarsFromRequest(request),
        docs: normalizeArray(request?.documents?.invoices).map(mapInvoiceDoc),
        attachments: [],
        chat_id: request.chat_id,
      }
  })
    allRows.value = mappedRows
    rows.value = filteredRows.value

    const attachmentsByRequestId = Object.create(null)
    await Promise.all(
      mappedRows.map(async (row) => {
        try {
          const aRes = await fetch(`/apisup/supply/requests/${encodeURIComponent(row.id)}/attachments`, {
            credentials: 'include',
          })
          if (!aRes.ok) {
            attachmentsByRequestId[row.id] = []
            return
          }
          const aPayload = await aRes.json()
          attachmentsByRequestId[row.id] = normalizeArray(aPayload)
            .map(mapAttachment)
            .filter((file) => file.id)
        } catch {
          attachmentsByRequestId[row.id] = []
        }
      })
    )

    allRows.value = allRows.value.map((row) => ({
      ...row,
      attachments: attachmentsByRequestId[row.id] || [],
    }))
    rows.value = filteredRows.value

    nextTick(() => {
      for (const row of rows.value) {
        if (row.chat_id) chat.fetchBadge(row.chat_id)
      }
    })
  } catch {
    rows.value = []
    allRows.value = []
    loadError.value = 'Не удалось загрузить список заявок.'
  } finally {
    loading.value = false
  }
}

const getSelectedSupplierTarget = () => {
  const checkedRequests = allRows.value.filter((row) => row.checked)
  if (checkedRequests.length > 1) {
    return { kind: 'error', message: 'Можно выбрать только одну заявку.' }
  }
  if (checkedRequests.length === 1) {
    return {
      kind: 'request',
      requestId: String(checkedRequests[0].id || ''),
      itemIds: [],
    }
  }

  const selectedFromExpanded = []
  allRows.value.forEach((row) => {
    const expanded = expandedRows[row.id]
    if (!expanded?.rows?.length) return
    const selectedItems = expanded.rows
      .map((line) => line?.[0])
      .filter((cell) => cell?.type === 'checkbox' && cell.checked && cell.requestId)
    if (!selectedItems.length) return
    selectedFromExpanded.push({
      requestId: String(row.id || ''),
      itemIds: selectedItems.map((cell) => String(cell.itemId || '')).filter(Boolean),
    })
  })

  if (!selectedFromExpanded.length) {
    return { kind: 'empty', message: 'Выберите заявку или хотя бы одну позицию.' }
  }
  if (selectedFromExpanded.length > 1) {
    return { kind: 'error', message: 'Позиции можно выбрать только из одной заявки.' }
  }
  return { kind: 'items', ...selectedFromExpanded[0] }
}

const canOpenSupplierRequest = computed(() => {
  const target = getSelectedSupplierTarget()
  return target.kind === 'request' || target.kind === 'items'
})

const openSelectFromRemainders = () => {
  const target = getSelectedSupplierTarget()
  if (target.kind === 'empty' || target.kind === 'error') {
    supplierRequestError.value = target.message || 'Выберите заявку или позиции из заявки.'
    return
  }
  router.push({
    name: 'request-select-stock',
    params: { requestId: target.requestId },
    query: target.kind === 'items' && target.itemIds.length
      ? { items: target.itemIds.join(',') }
      : {},
  })
}

const openSupplierRequest = () => {
  supplierRequestError.value = ''
  const target = getSelectedSupplierTarget()
  if (target.kind === 'empty' || target.kind === 'error') {
    supplierRequestError.value = target.message || 'Выберите заявку или позиции из заявки.'
    return
  }
  supplierRequestLoading.value = true
  try {
    router.push({
      name: 'request-supplier-create',
      params: {
        requestId: target.requestId,
      },
      query: target.kind === 'items' && target.itemIds.length
        ? { items: target.itemIds.join(',') }
        : {},
    })
  } finally {
    supplierRequestLoading.value = false
  }
}

const getFilenameFromDisposition = (headerValue) => {
  if (!headerValue) return ''
  const utfMatch = headerValue.match(/filename\*=UTF-8''([^;]+)/i)
  if (utfMatch?.[1]) return decodeURIComponent(utfMatch[1])
  const asciiMatch = headerValue.match(/filename=\"?([^\";]+)\"?/i)
  return asciiMatch?.[1] || ''
}

const downloadAttachment = async ({ requestId, file }) => {
  if (!requestId || !file?.id) return
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
  } catch {
    // noop
  }
}

const filteredRequestObjects = computed(() => {
  const query = requestObjectQuery.value.trim().toLowerCase()
  if (!query) return requestObjects.value
  return requestObjects.value.filter((item) => String(item.name || '').toLowerCase().includes(query))
})

const filteredSuppliers = computed(() => {
  const q = supplierQuery.value.trim().toLowerCase()
  if (!q) return counterparties.value
  return counterparties.value.filter((item) => String(item.name || '').toLowerCase().includes(q))
})

const filteredPayers = computed(() => {
  const q = payerQuery.value.trim().toLowerCase()
  if (!q) return counterparties.value
  return counterparties.value.filter((item) => String(item.name || '').toLowerCase().includes(q))
})

const loadRequestObjects = async () => {
  isRequestObjectsLoading.value = true
  requestObjectsError.value = ''
  try {
    const res = await fetch('/apisup/supply/request-objects/my', { credentials: 'include' })
    if (!res.ok) throw new Error('request objects load failed')
    requestObjects.value = normalizeArray(await res.json())
  } catch {
    requestObjects.value = []
    requestObjectsError.value = 'Не удалось загрузить список проектов.'
  } finally {
    isRequestObjectsLoading.value = false
  }
}

const playNotificationSound = () => {
  if (!notificationAudio.value) return
  try {
    notificationAudio.value.currentTime = 0
    const p = notificationAudio.value.play()
    if (p && typeof p.catch === 'function') p.catch(() => {})
  } catch {
    // ignore autoplay restrictions/errors
  }
}

const loadPendingApprovalsCount = async ({ playSoundOnChange = false } = {}) => {
  const prevCount = Number(notificationCounts.value.requests || 0)
  try {
    const res = await fetch('/apisup/supply/requests/my/approvals?status_name=pending', {
      credentials: 'include',
    })
    if (!res.ok) throw new Error('pending approvals failed')
    const payload = await res.json()
    const nextCount = Number(payload?.pending_count || 0)
    notificationCounts.value = {
      ...notificationCounts.value,
      requests: nextCount,
    }
    if (playSoundOnChange && nextCount !== prevCount) {
      playNotificationSound()
    }
  } catch {
    notificationCounts.value = {
      ...notificationCounts.value,
      requests: 0,
    }
  }
}

const isUuid = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''))

const loadCounterparties = async () => {
  lastCounterpartiesRefreshAt = Date.now()
  counterpartiesLoading.value = true
  counterpartiesError.value = ''
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
          id: String(id),
          name: item?.short_name || item?.full_name || '',
        }
      })
      .filter((item) => isUuid(item.id) && item.name)
  } catch {
    counterparties.value = []
    counterpartiesError.value = 'Не удалось загрузить список контрагентов.'
  } finally {
    counterpartiesLoading.value = false
  }
}

const openCounterpartyCreate = () => {
  window.open('/organizations/create', '_blank', 'noopener')
}

const refreshCounterpartiesOnFocus = async () => {
  if (!isAttachInvoiceModalOpen.value) return
  if (Date.now() - lastCounterpartiesRefreshAt < 800) return
  await loadCounterparties()
}

const openCreateRequestModal = async () => {
  isCreateRequestModalOpen.value = true
  requestObjectQuery.value = ''
  selectedRequestObjectId.value = ''
  createRequestError.value = ''
  isRequestObjectDropdownOpen.value = false
  await loadRequestObjects()
}

const closeCreateRequestModal = () => {
  isCreateRequestModalOpen.value = false
  requestObjectQuery.value = ''
  selectedRequestObjectId.value = ''
  requestObjectsError.value = ''
  createRequestError.value = ''
  isRequestObjectDropdownOpen.value = false
}

const openAttachInvoiceModal = async (requestId) => {
  attachInvoiceRequestId.value = requestId
  isAttachInvoiceModalOpen.value = true
  attachInvoiceError.value = ''
  invoiceFiles.value = []
  parsingInvoice.value = false
  duplicateInfo.value = null
  parseError.value = ''
  supplierQuery.value = ''
  payerQuery.value = ''
  selectedSupplierId.value = ''
  selectedPayerId.value = ''
  isSupplierDropdownOpen.value = false
  isPayerDropdownOpen.value = false
  deliveryIncluded.value = null
  prepaymentRequired.value = null
  prepaymentPercent.value = ''
  defermentProvided.value = null
  defermentDays.value = ''
  invoiceValidityDays.value = ''
  urgentInvoice.value = null
  stockState.value = ''
  await loadCounterparties()
}

const closeAttachInvoiceModal = () => {
  isAttachInvoiceModalOpen.value = false
  attachInvoiceRequestId.value = null
  duplicateInfo.value = null
  parseError.value = ''
}

const selectSupplier = (item) => {
  selectedSupplierId.value = item.id
  supplierQuery.value = item.name
  isSupplierDropdownOpen.value = false
}

const selectPayer = (item) => {
  selectedPayerId.value = item.id
  payerQuery.value = item.name
  isPayerDropdownOpen.value = false
}

const triggerInvoiceFilesInput = () => {
  if (invoiceFilesInputRef.value) invoiceFilesInputRef.value.click()
}

const onInvoiceFilesPicked = (event) => {
  const picked = Array.from(event.target.files || [])
  event.target.value = ''
  if (!picked.length) return
  invoiceFiles.value = picked
  parsingInvoice.value = true
  duplicateInfo.value = null
  parseError.value = ''
  parseInvoiceFile(picked[0])
}

const parseInvoiceFile = async (file) => {
  try {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch('/apisup/supply/invoices/parse-counterparty', {
      method: 'POST',
      credentials: 'include',
      body: formData,
    })
    if (!res.ok) {
      parseError.value = 'Не удалось разобрать файл счёта.'
      return
    }
    const data = await res.json()

    if (data?.seller?.id) {
      const match = counterparties.value.find(
        (c) => String(c.id) === String(data.seller.id)
      )
      if (match) {
        selectSupplier(match)
      } else if (data.seller.short_name) {
        supplierQuery.value = data.seller.short_name
        selectedSupplierId.value = String(data.seller.id)
      }
    } else if (data?.seller_inn) {
      const cp = await findOrCreateCounterparty(data.seller_inn, data?.seller?.short_name || '')
      if (cp) {
        selectSupplier(cp)
        await loadCounterparties()
      }
    }

    if (data?.buyer?.id) {
      const match = counterparties.value.find(
        (c) => String(c.id) === String(data.buyer.id)
      )
      if (match) {
        selectPayer(match)
      } else if (data.buyer.short_name) {
        payerQuery.value = data.buyer.short_name
        selectedPayerId.value = String(data.buyer.id)
      }
    } else if (data?.buyer_inn) {
      const cp = await findOrCreateCounterparty(data.buyer_inn, data?.buyer?.short_name || '')
      if (cp) {
        selectPayer(cp)
        await loadCounterparties()
      }
    }

    if (data?.duplicate) {
      duplicateInfo.value = data.duplicate
    }
  } catch {
    // parse failed silently
  } finally {
    parsingInvoice.value = false
  }
}

const findOrCreateCounterparty = async (inn, fallbackName) => {
  if (!inn) return null
  try {
    const searchRes = await fetch(`/apiref/ref/counterparties/search?q=${encodeURIComponent(inn)}`, {
      credentials: 'include',
    })
    if (searchRes.ok) {
      const searchData = await searchRes.json()
      const list = normalizeArray(searchData)
      if (list.length > 0) {
        const existing = list[0]
        return { id: existing.id, name: existing.short_name || existing.name || existing.full_name || fallbackName }
      }
    }

    const isCompany = String(inn).length === 10
    let checkoData = null
    try {
      const checkoUrl = isCompany
        ? `https://api.checko.ru/v2/company?key=KH5xnbpESrTvNr4Z&inn=${encodeURIComponent(inn)}`
        : `https://api.checko.ru/v2/entrepreneur?key=KH5xnbpESrTvNr4Z&inn=${encodeURIComponent(inn)}`
      const checkoRes = await fetch(checkoUrl)
      if (checkoRes.ok) {
        const checkoJson = await checkoRes.json()
        checkoData = checkoJson?.data
      }
    } catch {
      // checko unavailable
    }

    const shortName = checkoData
      ? (checkoData.НаимСокр || checkoData.ФИО || fallbackName)
      : fallbackName
    const fullName = checkoData
      ? (checkoData.НаимПолн || checkoData.ФИО || fallbackName)
      : fallbackName

    const cpRes = await fetch('/apiref/ref/counterparties', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        type: isCompany ? 'LLC' : 'IP',
        short_name: shortName,
        full_name: fullName,
        is_internal: false,
      }),
    })
    if (!cpRes.ok) return null
    const cpJson = await cpRes.json()
    const counterpartyId = cpJson.id || cpJson.counterparty_id
    if (!counterpartyId) return null

    let personId = null
    if (checkoData) {
      let fio = { lastName: '', firstName: '', middleName: '' }
      if (isCompany && Array.isArray(checkoData.Руковод) && checkoData.Руковод.length > 0) {
        const parts = (checkoData.Руковод[0].ФИО || '').trim().split(/\s+/)
        fio = { lastName: parts[0] || '', firstName: parts[1] || '', middleName: parts[2] || '' }
      } else if (!isCompany) {
        const parts = (checkoData.ФИО || '').trim().split(/\s+/)
        fio = { lastName: parts[0] || '', firstName: parts[1] || '', middleName: parts[2] || '' }
      }
      if (fio.lastName || fio.firstName) {
        const personRes = await fetch('/apiref/ref/persons', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            name: fio.firstName,
            last_naem: fio.lastName,
            middle_name: fio.middleName,
          }),
        })
        const personJson = personRes.ok ? await personRes.json() : null
        personId = personJson?.id || personJson?.person_id
      }
    }

    const fmt = (v) => {
      if (!v) return ''
      if (typeof v === 'string') return v
      return `${v.Код || ''} - ${v.Наим || ''}`.trim()
    }

    if (isCompany) {
      await fetch('/apiref/ref/counterparties/llc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          counterparties_id: counterpartyId,
          inn,
          kpp: checkoData?.КПП || '',
          ogrn: checkoData?.ОГРН || '',
          okpo: fmt(checkoData?.ОКПО),
          okogu: fmt(checkoData?.ОКОГУ),
          okato: fmt(checkoData?.ОКАТО),
          oktmo: fmt(checkoData?.ОКТМО),
          okfs: fmt(checkoData?.ОКФС),
          okopf: fmt(checkoData?.ОКОПФ),
          tax_system: Array.isArray(checkoData?.Налоги?.ОсобРежим) ? checkoData.Налоги.ОсобРежим.join(', ') : '',
          okved: checkoData?.ОКВЭД ? `${checkoData.ОКВЭД.Код || ''} - ${checkoData.ОКВЭД.Наим || ''}`.trim() : '',
          legal_address: checkoData?.ЮрАдрес?.АдресРФ || '',
          actual_address: '',
          postal_address: '',
          director_person_id: personId,
          director_basis: '',
        }),
      }).catch(() => {})
    } else {
      await fetch('/apiref/ref/counterparties/ip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          counterparty_id: counterpartyId,
          inn,
          ogrnip: checkoData?.ОГРНИП || '',
          okpo: fmt(checkoData?.ОКПО),
          okved: checkoData?.ОКВЭД ? `${checkoData.ОКВЭД.Код || ''} - ${checkoData.ОКВЭД.Наим || ''}`.trim() : '',
          okopf: fmt(checkoData?.ОКОПФ),
          okfs: fmt(checkoData?.ОКФС),
          okogu: fmt(checkoData?.ОКОГУ),
          okato: fmt(checkoData?.ОКАТО),
          oktmo: fmt(checkoData?.ОКТМО),
          person_id: personId,
        }),
      }).catch(() => {})
    }

    return { id: counterpartyId, name: shortName || fallbackName }
  } catch {
    return null
  }
}

const submitAttachInvoice = async () => {
  attachInvoiceError.value = ''
  if (!invoiceFiles.value.length) {
    attachInvoiceError.value = 'Прикрепите файл счета.'
    return
  }
  if (!selectedSupplierId.value) {
    attachInvoiceError.value = 'Укажите поставщика.'
    return
  }
  if (!selectedPayerId.value) {
    attachInvoiceError.value = 'Выберите плательщика.'
    return
  }
  if (!isUuid(selectedSupplierId.value) || !isUuid(selectedPayerId.value)) {
    attachInvoiceError.value = 'Поставщик и плательщик должны иметь UUID.'
    return
  }
  if (prepaymentRequired.value === true) {
    const val = Number(prepaymentPercent.value)
    if (!Number.isFinite(val) || val < 1 || val > 100) {
      attachInvoiceError.value = 'Предоплата должна быть в диапазоне от 1 до 100%.'
      return
    }
  }
  if (defermentProvided.value === true) {
    const val = Number(defermentDays.value)
    if (!Number.isFinite(val) || val < 1) {
      attachInvoiceError.value = 'Отсрочка должна быть положительным числом дней.'
      return
    }
  }
  const requestId = Number(attachInvoiceRequestId.value || 0)
  const payload = {
    request_id: requestId,
    provider_id: String(selectedSupplierId.value),
    payer_id: String(selectedPayerId.value),
    is_delivery_included: deliveryIncluded.value === true,
    prepayment_percent: prepaymentRequired.value === true ? Number(prepaymentPercent.value) : 0,
    due_days: defermentProvided.value === true ? Number(defermentDays.value) : 0,
    valid_until: Number(invoiceValidityDays.value || 0),
    is_urgent: urgentInvoice.value === true,
  }

  const formData = new FormData()
  formData.append('payload_json', JSON.stringify(payload))
  formData.append('file', invoiceFiles.value[0])

  isAttachInvoiceSubmitting.value = true
  try {
    const res = await fetch('/apisup/supply/invoices/with-file', {
      method: 'POST',
      credentials: 'include',
      body: formData,
    })
    if (!res.ok) throw new Error('invoice with file create failed')
    const body = await res.json().catch(() => ({}))
    const invoiceId = body?.id || body?.invoice_id || body?.data?.id
    if (!invoiceId) throw new Error('invoice id missing')
    closeAttachInvoiceModal()
    router.push({
      path: `/invoices/${encodeURIComponent(String(invoiceId))}/process`,
      query: { request_id: String(requestId || '') },
    })
  } catch {
    attachInvoiceError.value = 'Не удалось прикрепить счет. Проверьте поля и повторите попытку.'
  } finally {
    isAttachInvoiceSubmitting.value = false
  }
}

const onRequestObjectInput = () => {
  selectedRequestObjectId.value = ''
  createRequestError.value = ''
  isRequestObjectDropdownOpen.value = true
}

const selectRequestObject = (item) => {
  selectedRequestObjectId.value = item.id
  requestObjectQuery.value = item.name || ''
  isRequestObjectDropdownOpen.value = false
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
}

const submitCreateRequest = () => {
  createRequestError.value = ''
  if (!selectedRequestObjectId.value) {
    createRequestError.value = 'Выберите проект из списка.'
    return
  }
  isSubmittingRequest.value = true
  fetch('/apisup/supply/requests', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ object_levels_id: selectedRequestObjectId.value }),
  })
    .then(async (res) => {
      if (!res.ok) throw new Error('request create failed')
      const payload = await res.json()
      const requestId = payload?.id || payload?.request_id || payload?.data?.id
      if (!requestId) throw new Error('missing request id')
      closeCreateRequestModal()
      await loadRequests()
      router.push({ path: `/requests/${requestId}`, query: { back: route.fullPath } })
    })
    .catch(() => {
      createRequestError.value = 'Не удалось создать заявку.'
    })
    .finally(() => {
      isSubmittingRequest.value = false
    })
}

const handleWindowClick = (event) => {
  const lookupEl = requestLookupRef.value
  const target = event.target
  if (!(target instanceof Node)) return

  if (!lookupEl || !lookupEl.contains(target)) {
    isRequestObjectDropdownOpen.value = false
  }

  const supplierEl = supplierLookupRef.value
  if (!supplierEl || !supplierEl.contains(target)) {
    isSupplierDropdownOpen.value = false
  }

  const payerEl = payerLookupRef.value
  if (!payerEl || !payerEl.contains(target)) {
    isPayerDropdownOpen.value = false
  }

  if (!(target instanceof Element) || !target.closest('.multi-filter')) {
    filterDropdownOpen.value = ''
  }
}

const toggleRow = (id) => {
  if (!expandedRows[id]) return
  expandedRows[id].open = !expandedRows[id].open
}

const openRequest = (id) => {
  router.push({
    path: `/requests/${id}`,
    query: { back: route.fullPath },
  })
}

const setQuickFilterTab = (key) => {
  activeQuickFilter.value = tabKeys.includes(key) ? key : 'all'
}

const toggleFilterDropdown = (key) => {
  filterDropdownOpen.value = filterDropdownOpen.value === key ? '' : key
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

const toggleAllRows = (checked) => {
  const next = Boolean(checked)
  const visibleIds = new Set(filteredRows.value.map((row) => String(row.id)))
  allRows.value.forEach((row) => {
    if (visibleIds.has(String(row.id))) row.checked = next
  })
  rows.value = filteredRows.value
  checkedAll.value = next
}

const toggleRowCheck = (payload = {}) => {
  const { id, checked, itemId } = payload
  if (itemId) {
    const expanded = expandedRows[id]
    if (!expanded?.rows?.length) return
    expanded.rows.forEach((line) => {
      const cell = line?.[0]
      if (cell?.type === 'checkbox' && String(cell.itemId || '') === String(itemId || '')) {
        cell.checked = Boolean(checked)
      }
    })
    const requestRow = allRows.value.find((item) => String(item.id) === String(id))
    if (requestRow) requestRow.checked = false
    checkedAll.value = false
    rows.value = filteredRows.value
    return
  }

  const row = allRows.value.find((item) => String(item.id) === String(id))
  if (!row) return
  row.checked = Boolean(checked)
  if (row.checked) {
    const expanded = expandedRows[id]
    if (expanded?.rows?.length) {
      expanded.rows.forEach((line) => {
        const cell = line?.[0]
        if (cell?.type === 'checkbox') cell.checked = false
      })
    }
  }
  rows.value = filteredRows.value
  const visible = filteredRows.value
  checkedAll.value = visible.length > 0 && visible.every((item) => item.checked)
}

const resetFilters = () => {
  filters.value = { id: '', projects: [], creators: [], statuses: [] }
  activeQuickFilter.value = 'all'
  filterDropdownOpen.value = ''
  rows.value = filteredRows.value
}

const getDateByLabel = (row, label) => {
  const item = (row.dates || []).find((d) => String(d?.label || '').toLowerCase() === label)
  return item?.value || ''
}

const exportRows = async () => {
  const selected = allRows.value.filter((row) => row.checked)
  const dataset = selected.length ? selected : filteredRows.value
  if (!dataset.length) return
  const header = ['ID', 'Заявка', 'Проект', 'Создатель', 'Исполнитель', 'Статус', 'Создана', 'Передана в работу', 'Согласована', 'Отклонена', 'Требуется', 'Завершена']
  const rowsData = dataset.map((row) => ([
    row.id,
    row.title || '',
    (row.projects || []).join(', '),
    row.users?.[0]?.name || '',
    row.users?.[1]?.name || '',
    row.statusText || '',
    getDateByLabel(row, 'создана'),
    getDateByLabel(row, 'передана в работу'),
    getDateByLabel(row, 'согласована'),
    getDateByLabel(row, 'отклонена'),
    getDateByLabel(row, 'требуется'),
    getDateByLabel(row, 'завершена'),
  ]))
  try {
    const ExcelJS = await import('exceljs')
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Requests', {
      pageSetup: {
        paperSize: 9, // A4
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
      const width = Math.min(42, Math.max(10, maxLen + 2))
      sheet.getColumn(col).width = width
    }

    // Для длинного названия заявки даем чуть больше места и перенос строк.
    const requestColIndex = header.indexOf('Заявка') + 1
    if (requestColIndex > 0) sheet.getColumn(requestColIndex).width = Math.max(sheet.getColumn(requestColIndex).width || 10, 38)

    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `requests_${new Date().toISOString().slice(0, 10)}.xlsx`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  } catch {
    loadError.value = 'Не удалось экспортировать .xlsx. Проверьте установку зависимости exceljs.'
  }
}

const openInvoicesCompare = (id) => {
  router.push({
    path: `/requests/${id}/invoices/compare`,
    query: { back: route.fullPath },
  })
}

onMounted(() => {
  notificationAudio.value = new Audio(notificationSoundUrl)
  notificationAudio.value.preload = 'auto'
  loadRequests()
  loadPendingApprovalsCount()
  window.addEventListener('mousedown', handleWindowClick)
  window.addEventListener('focus', refreshCounterpartiesOnFocus)
})

watch(filteredRows, (next) => {
  rows.value = next
  checkedAll.value = next.length > 0 && next.every((row) => row.checked)
}, { deep: true })

onBeforeUnmount(() => {
  notificationAudio.value = null
  window.removeEventListener('mousedown', handleWindowClick)
  window.removeEventListener('focus', refreshCounterpartiesOnFocus)
})

const getBadge = (chatId) => {
  if (!chatId) return null
  const b = chat.badges[chatId]
  return b && b.mention ? 'mention' : b?.unread ? 'unread' : null
}

const handleChatOpen = ({ chatId, requestId, title }) => {
  chat.openPanel('request', String(requestId), chatId, title)
}

const handleCloseChat = () => {
  const chatId = chat.currentChatId
  chat.closePanel()
  if (chatId) chat.refreshBadge(chatId)
}
</script>

<template>
  <div class="page">
    <TopNav :links="navLinks" :notification-counts="notificationCounts" />
    <main class="main-content">
      <ContentHeader :selected-count="selectedCount" @create-request="openCreateRequestModal" @export="exportRows" />
      <div class="registry-filters">
        <input v-model="filters.id" class="form-input" type="text" placeholder="Фильтр: ID">
        <div class="multi-filter">
          <button class="multi-filter-btn" type="button" @click.stop="toggleFilterDropdown('projects')">
            {{ filters.projects.length ? `Проекты (${filters.projects.length})` : 'Проекты' }}
          </button>
          <div v-if="filterDropdownOpen === 'projects'" class="multi-filter-list">
            <button v-for="item in projectOptions" :key="`project-${item}`" class="multi-filter-item" type="button" @click.stop="toggleMultiFilterValue('projects', item)">
              <input type="checkbox" :checked="filters.projects.includes(item)"> <span>{{ item }}</span>
            </button>
          </div>
        </div>
        <div class="multi-filter">
          <button class="multi-filter-btn" type="button" @click.stop="toggleFilterDropdown('creators')">
            {{ filters.creators.length ? `Создатели (${filters.creators.length})` : 'Создатели' }}
          </button>
          <div v-if="filterDropdownOpen === 'creators'" class="multi-filter-list">
            <button v-for="item in creatorOptions" :key="`creator-${item}`" class="multi-filter-item" type="button" @click.stop="toggleMultiFilterValue('creators', item)">
              <input type="checkbox" :checked="filters.creators.includes(item)"> <span>{{ item }}</span>
            </button>
          </div>
        </div>
        <div class="multi-filter">
          <button class="multi-filter-btn" type="button" @click.stop="toggleFilterDropdown('statuses')">
            {{ filters.statuses.length ? `Статусы (${filters.statuses.length})` : 'Статусы' }}
          </button>
          <div v-if="filterDropdownOpen === 'statuses'" class="multi-filter-list">
            <button v-for="item in statusOptions" :key="`status-${item}`" class="multi-filter-item" type="button" @click.stop="toggleMultiFilterValue('statuses', item)">
              <input type="checkbox" :checked="filters.statuses.includes(item)"> <span>{{ item }}</span>
            </button>
          </div>
        </div>
        <button class="btn" type="button" @click="resetFilters">Сброс</button>
      </div>
      <FilterTabs :tabs="filterTabs" @select="setQuickFilterTab" @reset="resetFilters" />
      <RequestsTable
        :rows="rows"
        :expanded-rows="expandedRows"
        :checked-all="checkedAll"
        :col-filters="colFilterValues"
        @toggle="toggleRow"
        @toggle-all="toggleAllRows"
        @toggle-check="toggleRowCheck"
        @open-request="openRequest"
        @download-attachment="downloadAttachment"
        @attach-invoice="openAttachInvoiceModal"
        @compare-invoices="openInvoicesCompare"
        @update:col-filters="colFilterValues = $event"
        @chat-open="handleChatOpen"
      >
        <template #bar>
          <div class="sticky-bar-wrap">
            <div class="supplier-request-bar">
              <button
                class="btn btn-primary"
                type="button"
                :disabled="!canOpenSupplierRequest"
                @click="openSelectFromRemainders"
              >
                Выбрать из остатков
              </button>
              <button
                class="btn btn-primary"
                type="button"
                :disabled="!canOpenSupplierRequest || supplierRequestLoading"
                @click="openSupplierRequest"
              >
                {{ supplierRequestLoading ? 'Открываем...' : 'Отправить запрос' }}
              </button>
              <span v-if="supplierRequestError" class="supplier-request-error">{{ supplierRequestError }}</span>
            </div>
            <div v-if="loading" class="inline-state">Загрузка заявок...</div>
            <div v-else-if="loadError" class="inline-state error">{{ loadError }}</div>
          </div>
        </template>
      </RequestsTable>
    </main>

    <ChatPanel v-if="chat.panelOpen" @close="handleCloseChat" />

    <div v-if="isCreateRequestModalOpen" class="modal-backdrop" @click="closeCreateRequestModal">
      <div class="modal-card" @click.stop="isRequestObjectDropdownOpen = false">
        <div class="modal-title">Создать заявку</div>
        <div class="modal-subtitle">Выберите проект (уровень вида работ)</div>

        <div class="modal-field">
          <span>Проект</span>
          <div ref="requestLookupRef" class="lookup-wrap" @click.stop>
            <div class="input-with-icon">
              <input
                v-model="requestObjectQuery"
                class="form-input"
                type="text"
                placeholder="Начните вводить название проекта..."
                @focus="isRequestObjectDropdownOpen = true"
                @input="onRequestObjectInput"
              >
              <button class="field-icon-btn" type="button" @click="isRequestObjectDropdownOpen = !isRequestObjectDropdownOpen">
                <i class="fas fa-chevron-down"></i>
              </button>
            </div>

            <div
              v-if="isRequestObjectDropdownOpen"
              class="lookup-list lookup-list-overlay select-dropdown"
            >
              <div v-if="isRequestObjectsLoading" class="lookup-empty">Загрузка...</div>
              <div v-else-if="requestObjectsError" class="lookup-empty error">{{ requestObjectsError }}</div>
              <button
                v-for="item in filteredRequestObjects"
                :key="item.id"
                class="lookup-item"
                type="button"
                @click="selectRequestObject(item)"
              >
                {{ item.name || 'Без названия' }}
              </button>
              <div
                v-if="!isRequestObjectsLoading && !requestObjectsError && filteredRequestObjects.length === 0"
                class="lookup-empty"
              >
                Ничего не найдено
              </div>
            </div>
          </div>
        </div>

        <div v-if="createRequestError" class="lookup-empty error modal-error">{{ createRequestError }}</div>

        <div class="modal-actions">
          <button class="btn" type="button" @click="closeCreateRequestModal">Отмена</button>
          <button
            class="btn btn-primary"
            type="button"
            :disabled="!selectedRequestObjectId || isSubmittingRequest"
            @click="submitCreateRequest"
          >
            {{ isSubmittingRequest ? 'Создание...' : 'Создать' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="isAttachInvoiceModalOpen" class="modal-backdrop" @click="closeAttachInvoiceModal">
      <div v-if="parsingInvoice" class="fullscreen-loader">
        <i class="fas fa-spinner fa-spin"></i> Разбор файла...
      </div>
      <div class="modal-card invoice-modal" @click.stop>
        <div class="modal-title">Прикрепить счет</div>
        <div class="modal-subtitle">Заявка #{{ attachInvoiceRequestId }}</div>

        <div class="modal-field">
          <span>1. Прикрепите файл (счет или предложение)</span>
          <input ref="invoiceFilesInputRef" class="hidden-input" type="file" accept=".pdf,.jpg,.jpeg,.png" @change="onInvoiceFilesPicked">
          <button class="btn" type="button" :disabled="parsingInvoice || isAttachInvoiceSubmitting" @click="triggerInvoiceFilesInput">{{ parsingInvoice ? 'Разбор файла...' : 'Прикрепить файл' }}</button>
          <div v-if="invoiceFiles.length" class="picked-files">
            <div v-for="file in invoiceFiles" :key="file.name + file.size" class="picked-file">{{ file.name }}</div>
          </div>
          <div v-if="duplicateInfo" class="duplicate-warning">
            <i class="fas fa-exclamation-triangle"></i>
            Обнаружен дубликат счета
            <a :href="`/invoices/${encodeURIComponent(String(duplicateInfo.id))}`" class="duplicate-link" target="_blank">
              #{{ duplicateInfo.num }} от {{ formatDate(duplicateInfo.date) }}
            </a>
          </div>
          <div v-if="parseError" class="parse-error">{{ parseError }}</div>
        </div>

        <div class="modal-field">
          <span>2. Укажите поставщика</span>
          <div ref="supplierLookupRef" class="lookup-wrap">
            <div class="input-with-icon">
              <input
                v-model="supplierQuery"
                class="form-input"
                type="text"
                placeholder="Поиск поставщика..."
                @focus="isSupplierDropdownOpen = true"
                @input="() => { selectedSupplierId = ''; isSupplierDropdownOpen = true }"
              >
              <button class="field-icon-btn" type="button" @click="isSupplierDropdownOpen = !isSupplierDropdownOpen">
                <i class="fas fa-chevron-down"></i>
              </button>
            </div>
            <div v-if="isSupplierDropdownOpen" class="lookup-list lookup-list-overlay">
              <button class="lookup-item create-counterparty-item" type="button" @click="openCounterpartyCreate">
                + Создать контрагента
              </button>
              <div v-if="counterpartiesLoading" class="lookup-empty">Загрузка...</div>
              <div v-else-if="counterpartiesError" class="lookup-empty error">{{ counterpartiesError }}</div>
              <button
                v-for="item in filteredSuppliers"
                :key="`s-${item.id}`"
                class="lookup-item"
                type="button"
                @click="selectSupplier(item)"
              >
                {{ item.name }}
              </button>
            </div>
          </div>
        </div>

        <div class="modal-field">
          <span>3. Выберите плательщика</span>
          <div ref="payerLookupRef" class="lookup-wrap">
            <div class="input-with-icon">
              <input
                v-model="payerQuery"
                class="form-input"
                type="text"
                placeholder="Поиск плательщика..."
                @focus="isPayerDropdownOpen = true"
                @input="() => { selectedPayerId = ''; isPayerDropdownOpen = true }"
              >
              <button class="field-icon-btn" type="button" @click="isPayerDropdownOpen = !isPayerDropdownOpen">
                <i class="fas fa-chevron-down"></i>
              </button>
            </div>
            <div v-if="isPayerDropdownOpen" class="lookup-list lookup-list-overlay">
              <button class="lookup-item create-counterparty-item" type="button" @click="openCounterpartyCreate">
                + Создать контрагента
              </button>
              <div v-if="counterpartiesLoading" class="lookup-empty">Загрузка...</div>
              <div v-else-if="counterpartiesError" class="lookup-empty error">{{ counterpartiesError }}</div>
              <button
                v-for="item in filteredPayers"
                :key="`p-${item.id}`"
                class="lookup-item"
                type="button"
                @click="selectPayer(item)"
              >
                {{ item.name }}
              </button>
            </div>
          </div>
        </div>

        <div class="modal-field">
          <span>4. Включена ли стоимость доставки?</span>
          <div class="option-row">
            <button class="option-btn" :class="{ active: deliveryIncluded === true }" type="button" @click="deliveryIncluded = true">Да</button>
            <button class="option-btn" :class="{ active: deliveryIncluded === false }" type="button" @click="deliveryIncluded = false">Нет</button>
          </div>
        </div>

        <div class="modal-field">
          <span>5. Требуется ли предоплата, %?</span>
          <div class="option-row">
            <button class="option-btn" :class="{ active: prepaymentRequired === true }" type="button" @click="prepaymentRequired = true">Да</button>
            <button class="option-btn" :class="{ active: prepaymentRequired === false }" type="button" @click="prepaymentRequired = false">Нет</button>
          </div>
          <div v-if="prepaymentRequired === true" class="option-row option-input-row">
            <input
              v-model="prepaymentPercent"
              class="form-input short-input"
              type="number"
              min="1"
              max="100"
              placeholder="1-100"
            >
            <button class="option-btn" :class="{ active: prepaymentPercent === '30' }" type="button" @click="prepaymentPercent = '30'">30%</button>
            <button class="option-btn" :class="{ active: prepaymentPercent === '50' }" type="button" @click="prepaymentPercent = '50'">50%</button>
            <button class="option-btn" :class="{ active: prepaymentPercent === '100' }" type="button" @click="prepaymentPercent = '100'">100%</button>
          </div>
        </div>

        <div class="modal-field">
          <span>6. Представлена ли отсрочка, дней?</span>
          <div class="option-row">
            <button class="option-btn" :class="{ active: defermentProvided === true }" type="button" @click="defermentProvided = true">Да</button>
            <button class="option-btn" :class="{ active: defermentProvided === false }" type="button" @click="defermentProvided = false">Нет</button>
          </div>
          <div v-if="defermentProvided === true" class="option-row option-input-row">
            <input
              v-model="defermentDays"
              class="form-input short-input"
              type="number"
              min="1"
              placeholder="Дней"
            >
            <button class="option-btn" :class="{ active: defermentDays === '30' }" type="button" @click="defermentDays = '30'">30</button>
            <button class="option-btn" :class="{ active: defermentDays === '45' }" type="button" @click="defermentDays = '45'">45</button>
            <button class="option-btn" :class="{ active: defermentDays === '60' }" type="button" @click="defermentDays = '60'">60</button>
            <button class="option-btn" :class="{ active: defermentDays === '90' }" type="button" @click="defermentDays = '90'">90</button>
            <button class="option-btn" :class="{ active: defermentDays === '120' }" type="button" @click="defermentDays = '120'">120</button>
          </div>
        </div>

        <div class="modal-field">
          <span>7. Срок действия счета, дней?</span>
          <input v-model="invoiceValidityDays" class="form-input" type="text" placeholder="Например: 10">
        </div>

        <div class="modal-field">
          <span>8. Срочный счет?</span>
          <div class="option-row">
            <button class="option-btn" :class="{ active: urgentInvoice === true }" type="button" @click="urgentInvoice = true">Да</button>
            <button class="option-btn" :class="{ active: urgentInvoice === false }" type="button" @click="urgentInvoice = false">Нет</button>
          </div>
        </div>

        <div class="modal-field">
          <span>9. Всё в наличие?</span>
          <div class="option-row">
            <button class="option-btn" :class="{ active: stockState === 'yes' }" type="button" @click="stockState = 'yes'">Да</button>
            <button class="option-btn" :class="{ active: stockState === 'no' }" type="button" @click="stockState = 'no'">Нет</button>
            <button class="option-btn" :class="{ active: stockState === 'partial' }" type="button" @click="stockState = 'partial'">Частично</button>
          </div>
        </div>

        <div v-if="attachInvoiceError" class="lookup-empty error modal-error">{{ attachInvoiceError }}</div>

        <div class="modal-actions">
          <button class="btn" type="button" :disabled="isAttachInvoiceSubmitting" @click="closeAttachInvoiceModal">Отменить</button>
          <button class="btn btn-primary" type="button" :disabled="isAttachInvoiceSubmitting || parsingInvoice" @click="submitAttachInvoice">
            {{ isAttachInvoiceSubmitting ? 'Отправка...' : 'Отправить' }}
          </button>
        </div>
      </div>
    </div>
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
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  padding: 24px 32px;
  min-height: 0;
  overflow: hidden;
}

.registry-filters {
  display: grid;
  grid-template-columns: repeat(4, minmax(180px, 1fr)) auto;
  gap: 10px;
  align-items: center;
  margin-bottom: 10px;
  padding: 12px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  box-shadow: var(--shadow-sm);
}

.multi-filter {
  position: relative;
}

.multi-filter-btn {
  width: 100%;
  min-height: 40px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-light);
  background: var(--bg-subtle);
  color: var(--text-primary);
  padding: 0 12px;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.multi-filter-btn:hover {
  border-color: color-mix(in srgb, var(--brand-primary) 35%, var(--border-light));
}

.multi-filter-list {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 60;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  box-shadow: var(--shadow-md);
  max-height: 220px;
  overflow: auto;
  padding: 6px;
}

.multi-filter-item {
  width: 100%;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
  text-align: left;
  cursor: pointer;
}

.multi-filter-item:hover {
  background: var(--bg-subtle);
}

@media (max-width: 1100px) {
  .registry-filters {
    grid-template-columns: repeat(2, minmax(180px, 1fr));
  }
}

.inline-state {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 8px 0 12px;
}

.inline-state.error {
  color: var(--danger-text);
}

.supplier-request-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
}

.sticky-bar-wrap {
  position: sticky;
  top: 0;
  z-index: 25;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-light);
}

.inline-state {
  font-size: 12px;
  color: var(--text-secondary);
  padding: 4px 12px 8px;
}

.inline-state.error {
  color: var(--danger-text);
}

.supplier-request-error {
  font-size: 12px;
  color: var(--danger-text);
}

.supplier-request-bar .btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.modal-card {
  width: min(560px, 100%);
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: 20px;
}

.invoice-modal {
  width: min(760px, 100%);
  max-height: calc(100vh - 40px);
  overflow: auto;
}

.modal-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
}

.modal-subtitle {
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 12px;
}

.modal-field {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.modal-field > span {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 600;
}

.lookup-wrap {
  position: relative;
}

.input-with-icon {
  display: flex;
  align-items: center;
  position: relative;
}

.form-input {
  width: 100%;
  min-height: 40px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-light);
  background: var(--bg-body);
  color: var(--text-primary);
  padding: 0 38px 0 12px;
  font-size: 14px;
  outline: none;
}

.form-input:focus {
  border-color: var(--brand-primary);
  box-shadow: 0 0 0 2px var(--brand-soft);
  background: var(--bg-surface);
}

.field-icon-btn {
  position: absolute;
  right: 6px;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
}

.field-icon-btn:hover {
  background: var(--bg-subtle);
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
  z-index: 120;
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

.create-counterparty-item {
  font-weight: 600;
  color: var(--brand-primary);
  border-bottom: 1px solid var(--border-light);
}

.lookup-empty {
  padding: 10px 12px;
  color: var(--text-secondary);
  font-size: 12px;
}

.lookup-empty.error {
  color: var(--danger-text);
}

.modal-error {
  margin-top: 10px;
}

.modal-actions {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.hidden-input {
  display: none;
}

.picked-files {
  margin-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.picked-file {
  font-size: 12px;
  color: var(--text-primary);
  background: var(--bg-subtle);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  padding: 6px 8px;
}

.option-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.option-input-row {
  align-items: center;
}

.short-input {
  width: 120px;
  min-height: 32px;
  padding: 0 10px;
  font-size: 13px;
}

.option-btn {
  min-width: 64px;
  height: 32px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-light);
  background: var(--bg-surface);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  padding: 0 10px;
}

.option-btn:hover {
  background: var(--bg-subtle);
  color: var(--text-primary);
}

.option-btn.active {
  border-color: var(--brand-primary);
  background: var(--brand-light);
  color: var(--brand-primary);
  font-weight: 600;
}

.duplicate-warning {
  margin-top: 8px;
  padding: 8px 10px;
  background: var(--warning-bg);
  border: 1px solid var(--warning-text);
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--warning-text);
  display: flex;
  align-items: center;
  gap: 6px;
}

.duplicate-link {
  color: var(--brand-primary);
  text-decoration: underline;
  font-weight: 600;
}

.parse-error {
  margin-top: 8px;
  padding: 8px 10px;
  background: var(--danger-bg);
  border: 1px solid var(--danger-text);
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--danger-text);
}

.fullscreen-loader {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-size: 16px;
  z-index: 9999;
}
</style>
