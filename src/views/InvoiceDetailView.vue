<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TopNav from '../components/layout/TopNav.vue'
import CustomPdfPreview from '../components/pdf/CustomPdfPreview.vue'
import { useAuthStore } from '../stores/auth'
import { useChatStore } from '../stores/chat'
import { mainNavLinks } from '../constants/mainNav'
import ChatPanel from '../components/chat/ChatPanel.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const chat = useChatStore()

const navLinks = mainNavLinks

const loading = ref(false)
const error = ref('')
const invoice = ref(null)
const requestName = ref('')
const projectName = ref('')
const invoicePdfUrl = ref('')
const invoiceFileDownloadUrl = ref('')
const planningUsers = ref([])
const paymentUsers = ref([])
const activeTab = ref('general')
const paymentRows = ref([])
const paymentSaving = ref(false)
const paymentSaveMessage = ref('')
const paymentSaveError = ref('')
const paymentMethods = [
  { value: 'account', label: 'Расчетный счет' },
  { value: 'cash', label: 'Наличные' },
  { value: 'mutual settlement', label: 'Взаиморасчет' },
  { value: 'by debit card', label: 'Перевод по карте' },
]
const paymentFilesMap = ref({})
const paymentFileInputs = ref({})
const paymentFileUploading = ref(false)
const decisionLoading = ref(false)
const STATUS_ID_INVOICE_APPROVED = 'c532989f-17ba-11f1-aa8c-bc241127d0bd'
const STATUS_ID_INVOICE_REJECTED = '1ff33ee2-1312-11f1-aa8c-bc241127d0bd'
const STATUS_ID_INVOICE_NEW = '1ff34436-1312-11f1-aa8c-bc241127d0bd'
const STATUS_ID_INVOICE_PAID = '0e8a7b59-55b6-11f1-8707-bc241127d0bd'
const sendModalOpen = ref(false)
const sendingApprovals = ref(false)
const approverOptions = ref([])
const approverQuery = ref('')
const approverDropdownOpen = ref(false)
const selectedApproverIds = ref([])
const inlineApproverOpen = ref(false)
const editingComment = ref(false)
const savingComment = ref(false)
const FIXED_PLANNING_USER_ID = '8f1d6ffd-6652-4719-a426-5b21412d7c56'
const FIXED_PAYMENT_USER_ID = '06968a8b-e24c-4099-998d-3d4c16ebc63a'

const normalizeArray = (payload) => {
  if (Array.isArray(payload)) return payload
  return payload?.items || payload?.data || payload?.results || []
}

const formatDate = (value) => {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('ru-RU')
}

const formatMoney = (value) => {
  const n = Number(value)
  if (!Number.isFinite(n)) return '0,00 ₽'
  return `${n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`
}

const formatDateShort = (value) => {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('ru-RU')
}

const statusText = computed(() => invoice.value?.status_name || '—')
const invoiceTitle = computed(() => {
  const num = invoice.value?.num || 'без номера'
  const date = formatDate(invoice.value?.date)
  return `Счет ${num} от ${date}`
})

const items = computed(() => normalizeArray(invoice.value?.items))
const approvals = computed(() => normalizeArray(invoice.value?.approvals))
const vatText = computed(() => {
  const rate = Number(invoice.value?.vat_rate || 0)
  if (!Number.isFinite(rate) || rate <= 0) return 'Без НДС'
  return `НДС ${rate}%`
})

const payments = computed(() => normalizeArray(invoice.value?.payments))
const totalAmountNum = computed(() => Number(invoice.value?.total_amount || 0) || 0)
const paidAmountNum = computed(() => payments.value.reduce((acc, item) => acc + (Number(item?.paid || 0) || 0), 0))
const paidPercent = computed(() => {
  if (totalAmountNum.value <= 0 || paidAmountNum.value <= 0) return 0
  return Math.max(0, Math.min(100, (paidAmountNum.value / totalAmountNum.value) * 100))
})
const plannedAmountNum = computed(() => paymentRows.value.reduce((acc, item) => acc + (Number(item?.value || 0) || 0), 0))
const paidRowsAmountNum = computed(() => paymentRows.value.reduce((acc, item) => {
  if (!item?.isPaid) return acc
  return acc + (Number(item?.value || 0) || 0)
}, 0))
const leftToPlanNum = computed(() => Math.max(0, totalAmountNum.value - plannedAmountNum.value))
const leftToPayNum = computed(() => Math.max(0, totalAmountNum.value - paidRowsAmountNum.value))
const currentUserId = computed(() => String(auth?.user?.id || ''))
const myPendingInvoiceApproval = computed(() =>
  approvals.value.find((log) =>
    String(log?.user_id || '') === currentUserId.value
    && String(log?.status_name || '').toLowerCase() === 'pending')
)
const canRespondInvoice = computed(() =>
  Boolean(invoice.value?.id)
  && Boolean(currentUserId.value)
  && Boolean(myPendingInvoiceApproval.value?.id)
)
const canOpenPaymentsTab = computed(() => {
  const userId = currentUserId.value
  if (userId) {
    const isPlanner = planningUsers.value.some((item) => String(item?.user_id || '') === userId)
    const isPayer = paymentUsers.value.some((item) => String(item?.user_id || '') === userId)
    if (isPlanner || isPayer) return true
  }
  const rawStatus = invoice.value?.status
  const statusId = String(
    (rawStatus && typeof rawStatus === 'object' ? rawStatus.id : rawStatus)
      || invoice.value?.status_id
      || ''
  ).toLowerCase()
  const statusName = String(invoice.value?.status_name || '').toLowerCase()
  if (statusId === STATUS_ID_INVOICE_NEW.toLowerCase()) return false
  if (statusId === STATUS_ID_INVOICE_REJECTED.toLowerCase()) return false
  if (statusName.includes('нов')) return false
  if (statusName.includes('отклон')) return false
  return true
})
const canSendForApproval = computed(() =>
  String(invoice.value?.status || '') === STATUS_ID_INVOICE_NEW
  && approvals.value.length === 0
)
const canManageApprovers = computed(() =>
  Boolean(invoice.value?.id) && Boolean(myPendingInvoiceApproval.value?.id)
)
const filteredApproverOptions = computed(() => {
  const q = String(approverQuery.value || '').trim().toLowerCase()
  if (!q) return approverOptions.value
  return approverOptions.value.filter((item) =>
    String(item?.fio || '').toLowerCase().includes(q))
})
const availableApproverOptions = computed(() => {
  const existing = new Set(
    approvals.value
      .filter((log) => String(log?.status_name || '').toLowerCase() !== 'removed')
      .map((log) => String(log?.user_id || ''))
  )
  return filteredApproverOptions.value.filter((item) => !existing.has(String(item.id)))
})

const approvalVariant = (statusName) => {
  const status = String(statusName || '').toLowerCase()
  if (status.includes('approved')) return 'st-green'
  if (status.includes('reject')) return 'st-red'
  return 'st-amber'
}

const isPaymentLocked = (row) => Boolean(row?.id) && Boolean(row?.isPaid)

const paymentHasData = (row) => {
  if (!row) return false
  return Boolean(row.datePlan || Number(row.value || 0) > 0 || row.method || row.isPaid)
}

const toNumberOrZero = (value) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

const roundToTwo = (value) => Math.round((Number(value) || 0) * 100) / 100
const parsePercentInput = (value) => {
  const normalized = String(value ?? '').replace(',', '.').replace(/[^0-9.]/g, '')
  const num = Number(normalized)
  if (!Number.isFinite(num)) return null
  return Math.max(0, Math.min(100, num))
}

const normalizePaymentRows = (list) => {
  const rows = normalizeArray(list).map((item) => ({
    id: item?.id ?? null,
    createdAt: formatDateShort(item?.created_at),
    createdBy: item?.created_by_user?.short_fio || '',
    datePlan: item?.date_plan ? String(item.date_plan).slice(0, 10) : '',
    value: item?.value == null ? '' : Number(item.value),
    percentChoice: '',
    method: String(item?.paid_type || ''),
    isPaid: Number(item?.paid || 0) > 0,
    paidAt: formatDateShort(item?.paid_at),
    paidAtIso: item?.paid_at ? String(item.paid_at) : '',
    paidAtInput: item?.paid_at ? String(item.paid_at).slice(0, 10) : '',
    paidBy: item?.paid_by_user?.short_fio || '',
  }))
  rows.push({
    id: null,
    createdAt: '',
    createdBy: '',
    datePlan: '',
    value: '',
    percentChoice: '',
    method: '',
    isPaid: false,
    paidAt: '',
    paidAtIso: '',
    paidAtInput: '',
    paidBy: '',
  })
  return rows
}

const maxPlannableForRow = (targetRow) => {
  const total = Number(totalAmountNum.value || 0) || 0
  const others = paymentRows.value.reduce((acc, row) => {
    if (row === targetRow) return acc
    return acc + toNumberOrZero(row?.value)
  }, 0)
  return Math.max(0, total - others)
}

const syncTrailingPaymentRow = () => {
  if (!paymentRows.value.length) {
    paymentRows.value = normalizePaymentRows([])
    return
  }
  while (paymentRows.value.length > 1) {
    const last = paymentRows.value[paymentRows.value.length - 1]
    const prev = paymentRows.value[paymentRows.value.length - 2]
    if (!paymentHasData(last) && !paymentHasData(prev)) {
      paymentRows.value.pop()
      continue
    }
    break
  }

  const hasRoomToPlan = leftToPlanNum.value > 0.0000001
  const last = paymentRows.value[paymentRows.value.length - 1]
  if (hasRoomToPlan && paymentHasData(last)) {
    paymentRows.value.push({
      id: null,
      createdAt: '',
      createdBy: '',
      datePlan: '',
      value: '',
      percentChoice: '',
      method: '',
      isPaid: false,
      paidAt: '',
      paidAtIso: '',
      paidAtInput: '',
      paidBy: '',
    })
  }
  if (!hasRoomToPlan && !paymentHasData(last) && paymentRows.value.length > 1) {
    paymentRows.value.pop()
  }
}

const onPaymentRowInput = () => {
  syncTrailingPaymentRow()
}

const onPaymentValueInput = (row) => {
  const max = maxPlannableForRow(row)
  let value = toNumberOrZero(row?.value)
  if (value < 0) value = 0
  if (value > max) value = max
  row.value = value === 0 && !paymentHasData(row) ? '' : value
  row.percentChoice = ''
  syncTrailingPaymentRow()
}

const onPaymentPercentChange = (row) => {
  if (isPaymentLocked(row)) return
  const percent = parsePercentInput(row.percentChoice)
  const max = maxPlannableForRow(row)
  if (percent == null || percent <= 0) {
    row.value = ''
    row.percentChoice = ''
    syncTrailingPaymentRow()
    return
  }
  row.percentChoice = String(percent).replace('.', ',')
  row.value = roundToTwo((max * percent) / 100)
  syncTrailingPaymentRow()
}

const onPaymentPaidToggle = (row) => {
  if (!row.isPaid) {
    row.paidAtInput = ''
    row.paidAtIso = ''
  } else if (!row.paidAtInput) {
    row.paidAtInput = new Date().toISOString().slice(0, 10)
  }
  onPaymentRowInput()
}

const revokePdfUrl = () => {
  invoiceFileDownloadUrl.value = ''
  if (invoicePdfUrl.value) {
    URL.revokeObjectURL(invoicePdfUrl.value)
    invoicePdfUrl.value = ''
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
      if (!blob || blob.size <= 0) continue
      invoicePdfUrl.value = URL.createObjectURL(blob)
      invoiceFileDownloadUrl.value = url
      return
    } catch {
      // try next candidate
    }
  }
}

const openCounterparty = (counterpartyId) => {
  if (!counterpartyId) return
  router.push(`/counterparties/profile/${encodeURIComponent(String(counterpartyId))}`)
}

const downloadInvoiceFile = async () => {
  const url = invoiceFileDownloadUrl.value
  if (!url) return
  try {
    const res = await fetch(url, { credentials: 'include' })
    if (!res.ok) return
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = `invoice_${invoice.value?.id || 'download'}.pdf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(blobUrl)
  } catch {
    // fallback: открыть в новой вкладке
    window.open(url, '_blank')
  }
}

const openRequest = () => {
  const requestId = invoice.value?.request_id
  if (!requestId) return
  router.push({
    path: `/requests/${encodeURIComponent(String(requestId))}`,
    query: { back: route.fullPath },
  })
}

const goBack = () => {
  const back = String(route.query.back || '')
  if (back) {
    router.push(back)
    return
  }
  router.push('/invoices')
}

const openDeliveryPlanning = () => {
  const id = String(invoice.value?.id || '')
  if (!id) return
  router.push({
    path: `/invoices/${encodeURIComponent(id)}/delivery-plan`,
    query: { back: route.fullPath },
  })
}

const openProject = async () => {
  const objectLevelId = String(invoice.value?.object_levels_id || '')
  if (!objectLevelId) return
  try {
    const projectsRes = await fetch('/apisup/supply/projects', { credentials: 'include' })
    if (!projectsRes.ok) throw new Error('projects load failed')
    const projects = normalizeArray(await projectsRes.json())
    for (const project of projects) {
      const objectId = String(project?.object_id || '')
      const projectId = String(project?.id || '')
      if (!objectId || !projectId) continue
      // eslint-disable-next-line no-await-in-loop
      const structureRes = await fetch(`/apiref/ref/objects/${encodeURIComponent(objectId)}/structure`, {
        credentials: 'include',
      })
      if (!structureRes.ok) continue
      // eslint-disable-next-line no-await-in-loop
      const structure = await structureRes.json()
      const stack = Array.isArray(structure) ? [...structure] : [...(structure?.children || [])]
      while (stack.length) {
        const node = stack.shift()
        if (String(node?.id || '') === objectLevelId) {
          router.push({
            path: `/projects/${encodeURIComponent(projectId)}/works/${encodeURIComponent(objectLevelId)}`,
            query: { object_id: objectId },
          })
          return
        }
        if (Array.isArray(node?.children) && node.children.length) stack.push(...node.children)
      }
    }
    router.push('/projects')
  } catch {
    router.push('/projects')
  }
}

const loadLinkedRequestInfo = async (requestId) => {
  requestName.value = ''
  projectName.value = ''
  if (!requestId) return
  try {
    const res = await fetch(`/apisup/supply/requests/my/${encodeURIComponent(String(requestId))}`, { credentials: 'include' })
    if (!res.ok) return
    const data = await res.json()
    requestName.value = data?.name || ''
    projectName.value = data?.project_name || ''
  } catch {
    requestName.value = ''
    projectName.value = ''
  }
}

const loadInvoiceMeta = async (invoiceId) => {
  planningUsers.value = []
  paymentUsers.value = []
  if (!invoiceId) return
  try {
    const res = await fetch('/apisup/supply/invoices/my', { credentials: 'include' })
    if (!res.ok) return
    const list = normalizeArray(await res.json())
    const current = list.find((item) => String(item?.id || '') === String(invoiceId))
    planningUsers.value = normalizeArray(current?.planning)
    paymentUsers.value = normalizeArray(current?.payment)
  } catch {
    planningUsers.value = []
    paymentUsers.value = []
  }
}

const saveComment = async () => {
  if (!invoice.value?.id || savingComment.value) return
  savingComment.value = true
  try {
    const res = await fetch(`/apisup/supply/invoices/${encodeURIComponent(String(invoice.value.id))}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment: String(invoice.value.comment || '') }),
    })
    if (!res.ok) throw new Error('comment save failed')
    editingComment.value = false
  } catch {
    // ignore
  } finally {
    savingComment.value = false
  }
}

const startEditComment = () => {
  invoice.value._commentBackup = invoice.value.comment
  editingComment.value = true
}

const loadInvoice = async () => {
  const id = String(route.params.invoiceId || '')
  if (!id) return
  loading.value = true
  error.value = ''
  try {
    const res = await fetch(`/apisup/supply/invoices/${encodeURIComponent(id)}`, { credentials: 'include' })
    if (!res.ok) throw new Error('invoice load failed')
    const data = await res.json()
    invoice.value = data
    paymentRows.value = normalizePaymentRows(data?.payments || [])
    syncTrailingPaymentRow()
    paymentSaveMessage.value = ''
    paymentSaveError.value = ''
    await Promise.all([
      loadLinkedRequestInfo(data?.request_id),
      loadInvoicePdf(id),
      loadInvoiceMeta(id),
      getAllPaymentFiles(),
    ])
  } catch {
    error.value = 'Не удалось загрузить данные счета.'
    invoice.value = null
    revokePdfUrl()
  } finally {
    loading.value = false
  }
}

const savePayments = async () => {
  if (!invoice.value?.id || paymentSaving.value) return
  const keepPaymentsTab = activeTab.value === 'payments'
  paymentSaving.value = true
  paymentSaveMessage.value = ''
  paymentSaveError.value = ''
  try {
    const invoiceId = String(invoice.value.id)
    const rowsToSave = paymentRows.value.filter((row) => paymentHasData(row))
    for (const row of rowsToSave) {
      const paidValue = row.isPaid ? (Number(row.value || 0) || 0) : 0
      const paidAtValue = row.isPaid
        ? (row.paidAtInput ? `${row.paidAtInput}T00:00:00.000Z` : (row.paidAtIso || new Date().toISOString()))
        : null
      const payload = {
        value: Number(row.value || 0) || 0,
        date_plan: row.datePlan || null,
        paid: paidValue,
        paid_type: row.method || 'account',
        paid_by: row.isPaid ? String(currentUserId.value || '') : null,
        paid_at: paidAtValue,
      }
      if (row.id) {
        // eslint-disable-next-line no-await-in-loop
        const res = await fetch(`/apisup/supply/invoices/${encodeURIComponent(invoiceId)}/payments/${encodeURIComponent(String(row.id))}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error('payment patch failed')
      } else {
        // eslint-disable-next-line no-await-in-loop
        const res = await fetch(`/apisup/supply/invoices/${encodeURIComponent(invoiceId)}/payments`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error('payment create failed')
      }
    }
    await loadInvoice()
    if (keepPaymentsTab) {
      activeTab.value = 'payments'
      router.replace({
        query: {
          ...route.query,
          tab: 'payments',
        },
      })
    }
    if ((Number(totalAmountNum.value || 0) > 0) && (Number(paidAmountNum.value || 0) >= Number(totalAmountNum.value || 0))) {
      const statusRes = await fetch(`/apisup/supply/invoices/${encodeURIComponent(String(invoice.value.id))}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: STATUS_ID_INVOICE_PAID,
        }),
      })
      if (!statusRes.ok) throw new Error('invoice paid status patch failed')
      await loadInvoice()
    }
    paymentSaveMessage.value = 'Платежи сохранены.'
  } catch {
    paymentSaveError.value = 'Не удалось сохранить платежи.'
  } finally {
    paymentSaving.value = false
  }
}

const loadPaymentFiles = async (paymentId) => {
  if (!paymentId) return
  try {
    const res = await fetch(`/apisup/supply/invoice-payment-files?invoice_payment_id=${encodeURIComponent(String(paymentId))}`, { credentials: 'include' })
    if (!res.ok) return
    const data = await res.json()
    const files = normalizeArray(data)
    paymentFilesMap.value = { ...paymentFilesMap.value, [String(paymentId)]: files }
  } catch {
    // ignore
  }
}

const getAllPaymentFiles = async () => {
  const ids = paymentRows.value.map((row) => row.id).filter(Boolean)
  await Promise.all(ids.map((id) => loadPaymentFiles(id)))
}

const uploadPaymentFile = async (paymentId, file) => {
  if (!paymentId || !file) return
  paymentFileUploading.value = true
  try {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`/apisup/supply/invoice-payment-files?invoice_payment_id=${encodeURIComponent(String(paymentId))}`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    })
    if (!res.ok) throw new Error('upload failed')
    await loadPaymentFiles(paymentId)
  } catch {
    // ignore
  } finally {
    paymentFileUploading.value = false
  }
}

const triggerPaymentFileInput = (paymentId) => {
  const el = paymentFileInputs.value[String(paymentId)]
  if (el) el.click()
}

const onPaymentFilePicked = async (paymentId, event) => {
  const file = event?.target?.files?.[0]
  if (!file) return
  event.target.value = ''
  await uploadPaymentFile(paymentId, file)
}

const paymentFileDownloadUrl = (fileItem) => {
  if (!fileItem?.id) return ''
  return `/apisup/supply/invoice-payment-files/${encodeURIComponent(String(fileItem.id))}/download`
}

const downloadPaymentFile = async (fileItem) => {
  const url = paymentFileDownloadUrl(fileItem)
  if (!url) return
  try {
    const res = await fetch(url, { credentials: 'include' })
    if (!res.ok) return
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = fileItem.original_name || 'payment_file'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(blobUrl)
  } catch {
    window.open(url, '_blank')
  }
}

const closeSendModal = () => {
  sendModalOpen.value = false
  approverDropdownOpen.value = false
  approverQuery.value = ''
  selectedApproverIds.value = []
}

const loadApproverOptions = async () => {
  approverOptions.value = []
  const uniq = new Map()
  try {
    const usersRes = await fetch('/api/as/users/service/7dd8be78-cf3a-423a-852f-eab3511fbe30?page=1&limit=100', {
      credentials: 'include',
    })
    if (usersRes.ok) {
      const usersData = await usersRes.json()
      const users = normalizeArray(usersData?.items || usersData)
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
  const existingPending = approvals.value
    .filter((log) => String(log?.type || '').toLowerCase() === 'approval' && String(log?.status_name || '').toLowerCase() === 'pending')
    .map((log) => String(log?.user_id || ''))
    .filter(Boolean)
  selectedApproverIds.value = Array.from(new Set(existingPending))
  sendModalOpen.value = true
}

const openInlineApproverPicker = async () => {
  await loadApproverOptions()
  approverQuery.value = ''
  inlineApproverOpen.value = true
}

const addApproverInline = async (userId) => {
  if (!invoice.value?.id || !userId) return
  try {
    const invoiceId = String(invoice.value.id)
    const res = await fetch(`/apisup/supply/invoices/${encodeURIComponent(invoiceId)}/logs`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: String(userId),
        type: 'approval',
        status_name: 'pending',
        date_response: new Date().toISOString(),
      }),
    })
    if (!res.ok) throw new Error('add approver failed')
    inlineApproverOpen.value = false
    approverQuery.value = ''
    await loadInvoice()
  } catch {
    error.value = 'Не удалось добавить согласующего.'
  }
}

const removeApproverInline = async (approvalLogId) => {
  if (!invoice.value?.id || !approvalLogId) return
  try {
    const invoiceId = String(invoice.value.id)
    const res = await fetch(`/apisup/supply/invoices/${encodeURIComponent(invoiceId)}/logs/${encodeURIComponent(String(approvalLogId))}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    if (!res.ok) throw new Error('remove approver failed')
    await loadInvoice()
  } catch {
    error.value = 'Не удалось удалить согласующего.'
  }
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
  if (!invoice.value?.id || sendingApprovals.value) return
  const ids = selectedApproverIds.value.filter(Boolean)
  sendingApprovals.value = true
  try {
    const invoiceId = String(invoice.value.id)
    const existingApprovalLogs = approvals.value.filter((log) =>
      String(log?.type || '').toLowerCase() === 'approval'
      && String(log?.status_name || '').toLowerCase() === 'pending')
    const existingUserIds = new Set(existingApprovalLogs.map((log) => String(log?.user_id || '')).filter(Boolean))
    const selectedUserIds = new Set(ids)

    const toAdd = ids.filter((userId) => !existingUserIds.has(String(userId)))
    const toRemove = existingApprovalLogs.filter((log) => !selectedUserIds.has(String(log?.user_id || '')))

    for (const userId of toAdd) {
      // eslint-disable-next-line no-await-in-loop
      const res = await fetch(`/apisup/supply/invoices/${encodeURIComponent(invoiceId)}/logs`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: String(userId),
          type: 'approval',
          status_name: 'pending',
          date_response: new Date().toISOString(),
        }),
      })
      if (!res.ok) throw new Error('invoice approval create failed')
    }

    for (const log of toRemove) {
      const logId = String(log?.id || '')
      if (!logId) continue
      // eslint-disable-next-line no-await-in-loop
      let delRes = await fetch(`/apisup/supply/invoices/${encodeURIComponent(invoiceId)}/logs/${encodeURIComponent(logId)}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!delRes.ok) {
        // fallback: mark removed if API doesn't support DELETE
        // eslint-disable-next-line no-await-in-loop
        delRes = await fetch(`/apisup/supply/invoices/${encodeURIComponent(invoiceId)}/logs/${encodeURIComponent(logId)}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: String(log?.user_id || ''),
            status_name: 'removed',
          }),
        })
      }
      if (!delRes.ok) throw new Error('invoice approval remove failed')
    }

    if (approvals.value.length === 0) {
      const planningRes = await fetch(`/apisup/supply/invoices/${encodeURIComponent(invoiceId)}/logs`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: FIXED_PLANNING_USER_ID,
          type: 'planing',
        }),
      })
      if (!planningRes.ok) throw new Error('invoice planning log create failed')

      const paymentRes = await fetch(`/apisup/supply/invoices/${encodeURIComponent(invoiceId)}/logs`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: FIXED_PAYMENT_USER_ID,
          type: 'payment',
        }),
      })
      if (!paymentRes.ok) throw new Error('invoice payment log create failed')
    }

    closeSendModal()
    await loadInvoice()
  } catch {
    error.value = 'Не удалось передать счет на согласование.'
  } finally {
    sendingApprovals.value = false
  }
}

const handleWindowClick = (event) => {
  const target = event?.target
  if (!(target instanceof Element)) return
  if (approverDropdownOpen.value && !target.closest('.approver-select')) {
    approverDropdownOpen.value = false
  }
  if (inlineApproverOpen.value && !target.closest('.approvals-add')) {
    inlineApproverOpen.value = false
  }
}

const openInvoiceEdit = () => {
  if (!invoice.value?.id) return
  router.push({
    path: `/invoices/${encodeURIComponent(String(invoice.value.id))}/process`,
    query: {
      request_id: String(invoice.value.request_id || ''),
      mode: 'edit',
      back: route.fullPath,
    },
  })
}

const respondInvoice = async (statusName) => {
  if (!canRespondInvoice.value || !myPendingInvoiceApproval.value?.id || !invoice.value?.id) return
  decisionLoading.value = true
  try {
    const responseDateIso = new Date().toISOString()
    const res = await fetch(
      `/apisup/supply/invoices/${encodeURIComponent(String(invoice.value.id))}/logs/${encodeURIComponent(String(myPendingInvoiceApproval.value.id))}`,
      {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status_name: statusName,
          date_response: responseDateIso,
        }),
      }
    )
    if (!res.ok) throw new Error('invoice approver patch failed')
    const invoiceStatusId = String(statusName || '').toLowerCase() === 'approved'
      ? STATUS_ID_INVOICE_APPROVED
      : STATUS_ID_INVOICE_REJECTED
    const statusRes = await fetch(`/apisup/supply/invoices/${encodeURIComponent(String(invoice.value.id))}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: invoiceStatusId,
      }),
    })
    if (!statusRes.ok) throw new Error('invoice status patch failed')

    await loadInvoice()
  } catch {
    error.value = 'Не удалось отправить решение по согласованию счета.'
  } finally {
    decisionLoading.value = false
  }
}

const setTab = (tab) => {
  activeTab.value = tab
  router.replace({
    query: {
      ...route.query,
      tab,
    },
  })
}

watch(() => route.params.invoiceId, () => {
  loadInvoice()
})

watch(() => route.query.tab, (tab) => {
  const value = String(tab || '').toLowerCase()
  if (value === 'payments' && canOpenPaymentsTab.value) {
    activeTab.value = 'payments'
    return
  }
  if (value === 'general') {
    activeTab.value = 'general'
  }
})

watch(canOpenPaymentsTab, (allowed) => {
  if (allowed && String(route.query.tab || '').toLowerCase() === 'payments') {
    activeTab.value = 'payments'
    return
  }
  if (!allowed && activeTab.value === 'payments') {
    activeTab.value = 'general'
  }
})

onMounted(() => {
  window.addEventListener('mousedown', handleWindowClick)
  loadInvoice()
  const tab = String(route.query.tab || '').toLowerCase()
  if (tab === 'payments' && canOpenPaymentsTab.value) {
    activeTab.value = 'payments'
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('mousedown', handleWindowClick)
  revokePdfUrl()
})
</script>

<template>
  <div class="page">
    <TopNav :links="navLinks" />

    <main class="main-content invoice-main">
      <div v-if="loading" class="inline-state">Загрузка счета...</div>
      <div v-else-if="error" class="inline-state error">{{ error }}</div>

      <template v-else-if="invoice">
        <header class="invoice-head">
          <div class="head-left">
            <button type="button" class="back-btn" @click="goBack">
              <i class="fas fa-arrow-left"></i>
              Вернуться
            </button>
            <button type="button" class="chat-btn" title="Чат счета" @click="chat.openPanel('invoice', String(route.params.invoiceId))">
              <i class="fas fa-comment-dots"></i>
            </button>
            <h1 class="page-title">{{ invoiceTitle }}<span v-if="invoice?.is_urgent" class="urgent-indicator" title="Срочный счёт">🔥</span></h1>
          </div>
          <div class="head-right">
            <span v-if="invoice?.project_name" class="project-label">{{ invoice.project_name }}</span>
            <span class="status-chip">{{ statusText }}</span>
          </div>
        </header>

        <div class="tabs">
          <button type="button" class="tab-btn" :class="{ active: activeTab === 'general' }" @click="setTab('general')">
            Общая информация
          </button>
          <button
            type="button"
            class="tab-btn"
            :class="{ active: activeTab === 'payments' }"
            :disabled="!canOpenPaymentsTab"
            @click="canOpenPaymentsTab && setTab('payments')"
          >
            Платежи
          </button>
        </div>

        <template v-if="activeTab === 'general'">
        <section class="info-grid">
          <div class="info-item">
            <span class="block-title-small">Плательщик</span>
            <div class="kv-row">
              <span class="label">Название</span>
              <a href="#" class="value-link" @click.prevent="openCounterparty(invoice.payer_id)">{{ invoice.payer?.short_name || '—' }}</a>
            </div>
            <div class="kv-row">
              <span class="label">ИНН</span>
              <span class="value">{{ invoice.payer?.inn || '—' }}</span>
            </div>
            <div class="kv-row">
              <span class="label">КПП</span>
              <span class="value">{{ invoice.payer?.kpp || '—' }}</span>
            </div>
            <div class="kv-row">
              <span class="label">РС</span>
              <span class="value">{{ invoice.payer?.checking_account || '—' }}</span>
            </div>
          </div>
          <div class="info-item">
            <span class="block-title-small">Поставщик</span>
            <div class="kv-row">
              <span class="label">Название</span>
              <a href="#" class="value-link" @click.prevent="openCounterparty(invoice.provider_id)">{{ invoice.provider?.short_name || '—' }}</a>
            </div>
            <div class="kv-row">
              <span class="label">ИНН</span>
              <span class="value">{{ invoice.provider?.inn || '—' }}</span>
            </div>
            <div class="kv-row">
              <span class="label">КПП</span>
              <span class="value">{{ invoice.provider?.kpp || '—' }}</span>
            </div>
            <div class="kv-row">
              <span class="label">РС</span>
              <span class="value">{{ invoice.provider?.checking_account || '—' }}</span>
            </div>
          </div>
          <div class="info-item">
            <span class="label">Проект</span>
            <a v-if="projectName" href="#" class="value-link" @click.prevent="openProject">{{ projectName }}</a>
            <span v-else class="value">{{ invoice.object_name || invoice.object_short_name || invoice.project_name || '—' }}</span>
          </div>
          <div class="info-item">
            <span class="label">От кого</span>
            <span class="value">{{ invoice.from_by_user?.short_fio || '—' }}</span>
          </div>
          <div class="info-item">
            <span class="label">Заявка</span>
            <a href="#" class="value-link" @click.prevent="openRequest">{{ requestName || `Заявка #${invoice.request_id || '—'}` }}</a>
          </div>
          <div class="info-item info-item-comment">
            <span class="label">Комментарий</span>
            <div v-if="editingComment" class="comment-edit-wrap">
              <textarea
                v-model="invoice.comment"
                class="form-input"
                rows="3"
                placeholder="Комментарий к счету"
              ></textarea>
              <div class="comment-edit-actions">
                <button type="button" class="btn btn-primary" :disabled="savingComment" @click="saveComment">Сохранить</button>
                <button type="button" class="btn" @click="editingComment = false; invoice.comment = invoice._commentBackup">Отмена</button>
              </div>
            </div>
            <div v-else class="comment-display">
              <span class="value">{{ invoice.comment || '—' }}</span>
              <button
                v-if="invoice.comment"
                type="button"
                class="comment-edit-btn"
                title="Редактировать комментарий"
                @click="startEditComment"
              >
                <i class="fas fa-pen"></i>
              </button>
              <button
                v-else
                type="button"
                class="comment-add-btn"
                @click="startEditComment"
              >
                + Добавить комментарий
              </button>
            </div>
          </div>
        </section>

        <section class="block">
          <h2 class="block-title">Оплата</h2>
          <div class="pay-summary">
            <div>Оплачено: {{ formatMoney(paidAmountNum) }} из {{ formatMoney(totalAmountNum) }}</div>
          </div>
          <div class="pay-track">
            <div class="pay-fill" :style="{ width: `${paidPercent}%` }"></div>
          </div>
        </section>

        <section class="block">
          <h2 class="block-title">Участники платежей</h2>
          <div class="roles-grid">
            <div class="role-col">
              <div class="role-title">Планируют платежи</div>
              <div v-if="planningUsers.length" class="role-list">
                <span v-for="item in planningUsers" :key="item.id" class="role-chip">{{ item.user?.short_fio || '—' }}</span>
              </div>
              <div v-else class="empty">Нет назначенных</div>
            </div>
            <div class="role-col">
              <div class="role-title">Ответственные за оплату</div>
              <div v-if="paymentUsers.length" class="role-list">
                <span v-for="item in paymentUsers" :key="item.id" class="role-chip">{{ item.user?.short_fio || '—' }}</span>
              </div>
              <div v-else class="empty">Нет назначенных</div>
            </div>
          </div>
        </section>

        <section class="block">
          <h2 class="block-title">Согласование</h2>
          <div v-if="approvals.length" class="approvals approvals-inline">
            <div v-for="approval in approvals" :key="approval.id" class="approval-item">
              <span class="st-dot" :class="approvalVariant(approval.status_name || approval.answer)"></span>
              <span class="approval-name">{{ approval.user?.short_fio || '—' }}</span>
              <button
                v-if="canManageApprovers && String(approval.status_name || '').toLowerCase() === 'pending'"
                type="button"
                class="approval-remove"
                title="Убрать согласующего"
                @click="removeApproverInline(approval.id)"
              >
                <i class="fas fa-times"></i>
              </button>
            </div>
            <div v-if="canManageApprovers" class="approvals-add">
              <button type="button" class="approval-add-btn" @click.stop="openInlineApproverPicker">+</button>
              <div v-if="inlineApproverOpen" class="approver-dropdown approver-dropdown-inline">
                <input
                  v-model="approverQuery"
                  class="form-input approver-inline-input"
                  type="text"
                  placeholder="Поиск пользователя..."
                >
                <button
                  v-for="opt in availableApproverOptions"
                  :key="`inline-${opt.id}`"
                  type="button"
                  class="approver-option"
                  @click="addApproverInline(opt.id)"
                >
                  <span>{{ opt.fio }}</span>
                </button>
                <div v-if="!availableApproverOptions.length" class="empty">Нет доступных пользователей</div>
              </div>
            </div>
          </div>
          <div v-else class="empty approvals-empty">
            Нет согласующих
            <span v-if="canManageApprovers" class="approvals-add">
              <button type="button" class="approval-add-btn" @click.stop="openInlineApproverPicker">+</button>
              <div v-if="inlineApproverOpen" class="approver-dropdown approver-dropdown-inline">
                <input
                  v-model="approverQuery"
                  class="form-input approver-inline-input"
                  type="text"
                  placeholder="Поиск пользователя..."
                >
                <button
                  v-for="opt in availableApproverOptions"
                  :key="`inline-empty-${opt.id}`"
                  type="button"
                  class="approver-option"
                  @click="addApproverInline(opt.id)"
                >
                  <span>{{ opt.fio }}</span>
                </button>
                <div v-if="!availableApproverOptions.length" class="empty">Нет доступных пользователей</div>
              </div>
            </span>
          </div>
        </section>

        <section class="block">
          <h2 class="block-title">Позиции счета</h2>
          <div class="table-wrap">
            <table class="items-table">
              <thead>
                <tr>
                  <th>№</th>
                  <th>Наименование</th>
                  <th>Ед. изм</th>
                  <th>Кол-во</th>
                  <th>Цена</th>
                  <th>Сумма</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, idx) in items" :key="row.id || idx">
                  <td>{{ idx + 1 }}</td>
                  <td class="name-cell">{{ row.name || '' }}</td>
                  <td>{{ row.unit_name || '' }}</td>
                  <td>{{ row.quantity ?? '' }}</td>
                  <td>{{ row.price ?? '' }}</td>
                  <td>{{ row.sum ?? '' }}</td>
                </tr>
                <tr v-if="!items.length">
                  <td colspan="6" class="empty">Позиции отсутствуют</td>
                </tr>
                <tr class="summary-row">
                  <td colspan="5">НДС</td>
                  <td>{{ vatText }}</td>
                </tr>
                <tr class="summary-row">
                  <td colspan="5">Итого</td>
                  <td>{{ formatMoney(invoice.total_amount) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <div class="page-actions">
          <button type="button" class="action-btn action-delivery" @click="openDeliveryPlanning">
            Запланировать доставку
          </button>
          <button v-if="canSendForApproval" type="button" class="action-btn action-send" @click="openSendModal">
            Передать на согласование
          </button>
          <button type="button" class="action-btn action-edit" @click="openInvoiceEdit">
            Изменить
          </button>
          <button
            v-if="canRespondInvoice"
            type="button"
            class="action-btn action-approve"
            :disabled="decisionLoading"
            @click="respondInvoice('approved')"
          >
            Согласовать
          </button>
          <button
            v-if="canRespondInvoice"
            type="button"
            class="action-btn action-reject"
            :disabled="decisionLoading"
            @click="respondInvoice('rejected')"
          >
            Не согласовать
          </button>
        </div>

        <section class="block pdf-block">
          <div class="pdf-block__header">
            <h2 class="block-title">PDF счета</h2>
            <button
              v-if="invoiceFileDownloadUrl"
              class="btn btn-outline btn-sm"
              type="button"
              @click="downloadInvoiceFile"
            >
              <i class="fas fa-download"></i> Скачать
            </button>
          </div>
          <CustomPdfPreview :src="invoicePdfUrl" viewport-max-height="calc(100vh - 260px)" />
        </section>
        </template>

        <template v-else>
          <div class="payments-layout">
            <div class="payments-head-grid">
              <div class="info-item payment-info-card">
                <span class="block-title-small">Плательщик</span>
                <div class="kv-row"><span class="label">Название</span><span class="value">{{ invoice.payer?.short_name || '—' }}</span></div>
                <div class="kv-row"><span class="label">ИНН</span><span class="value">{{ invoice.payer?.inn || '—' }}</span></div>
                <div class="kv-row"><span class="label">КПП</span><span class="value">{{ invoice.payer?.kpp || '—' }}</span></div>
                <div class="kv-row"><span class="label">РС</span><span class="value">{{ invoice.payer?.checking_account || '—' }}</span></div>
              </div>
              <div class="info-item payment-info-card">
                <span class="block-title-small">Поставщик</span>
                <div class="kv-row"><span class="label">Название</span><span class="value">{{ invoice.provider?.short_name || '—' }}</span></div>
                <div class="kv-row"><span class="label">ИНН</span><span class="value">{{ invoice.provider?.inn || '—' }}</span></div>
                <div class="kv-row"><span class="label">КПП</span><span class="value">{{ invoice.provider?.kpp || '—' }}</span></div>
                <div class="kv-row"><span class="label">РС</span><span class="value">{{ invoice.provider?.checking_account || '—' }}</span></div>
              </div>
              <div class="info-item prepay-card payment-info-card">
                <span class="block-title-small">Предоплата</span>
                <div class="prepay-value">{{ Number(invoice.prepayment_percent || 0) }}%</div>
              </div>
              <div class="info-item payment-info-card">
                <span class="block-title-small">Проект / Объект</span>
                <span class="value">{{ invoice.object_name || invoice.object_short_name || invoice.project_name || projectName || '—' }}</span>
              </div>
              <div class="info-item payment-info-card">
                <span class="block-title-small">От кого</span>
                <span class="value">{{ [invoice.from_by_user?.surname, invoice.from_by_user?.name, invoice.from_by_user?.patronymic].filter(Boolean).join(' ') || invoice.from_by_user?.short_fio || '—' }}</span>
              </div>
            </div>

            <div class="payments-editor">
              <div class="payment-row-head">
                <div>Дата создания</div>
                <div>План дата</div>
                <div>Сумма платежа</div>
                <div>% от остатка</div>
                <div>Кто создал платеж</div>
                <div>Способ платежа</div>
                <div>Оплачено</div>
                <div>Дата оплаты</div>
                <div>Кто оплатил</div>
                <div>Файл платежа</div>
              </div>
              <div class="payment-rows">
                <div v-for="(row, idx) in paymentRows" :key="row.id || `new-${idx}`" class="payment-row" :class="{ locked: isPaymentLocked(row) }">
                  <input :value="row.createdAt" class="form-input" type="text" readonly>
                  <input v-model="row.datePlan" class="form-input" type="date" :disabled="isPaymentLocked(row)" @input="onPaymentRowInput">
                  <input
                    v-model="row.value"
                    class="form-input"
                    type="number"
                    min="0"
                    :max="maxPlannableForRow(row)"
                    step="0.01"
                    :disabled="isPaymentLocked(row)"
                    @input="onPaymentValueInput(row)"
                  >
                  <input
                    v-model="row.percentChoice"
                    class="form-input"
                    type="text"
                    placeholder="например 33,33"
                    :disabled="isPaymentLocked(row)"
                    @input="onPaymentPercentChange(row)"
                  >
                  <input :value="row.createdBy" class="form-input" type="text" readonly>
                  <select v-model="row.method" class="form-input" :disabled="isPaymentLocked(row)" @change="onPaymentRowInput">
                    <option value="">Не выбрано</option>
                    <option v-for="opt in paymentMethods" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                  </select>
                  <label class="paid-check" :class="{ locked: isPaymentLocked(row) }">
                    <input
                      v-model="row.isPaid"
                      type="checkbox"
                      :disabled="isPaymentLocked(row)"
                      @change="onPaymentPaidToggle(row)"
                    >
                    <span>Оплачено</span>
                  </label>
                  <input
                    v-model="row.paidAtInput"
                    class="form-input"
                    type="date"
                    :disabled="isPaymentLocked(row) || !row.isPaid"
                    @input="onPaymentRowInput"
                  >
                  <input :value="row.paidBy" class="form-input" type="text" readonly>
                  <div class="payment-file-cell">
                    <template v-if="paymentFilesMap[row.id]?.length">
                      <span
                        v-for="file in paymentFilesMap[row.id]"
                        :key="file.id"
                        class="file-icon-wrap"
                        :title="file.original_name"
                      >
                        <i
                          class="fas fa-paperclip file-icon"
                          @click="downloadPaymentFile(file)"
                        ></i>
                      </span>
                    </template>
                    <template v-else-if="row.id && !isPaymentLocked(row)">
                      <input
                        :ref="(el) => { paymentFileInputs[row.id] = el }"
                        type="file"
                        class="hidden-input"
                        @change="(e) => onPaymentFilePicked(row.id, e)"
                      >
                      <span
                        class="file-icon-wrap"
                        title="Загрузить файл платежа"
                      >
                        <i
                          v-if="paymentFileUploading"
                          class="fas fa-spinner fa-spin file-icon file-icon-empty"
                        ></i>
                        <i
                          v-else
                          class="fas fa-paperclip file-icon file-icon-empty"
                          @click="triggerPaymentFileInput(row.id)"
                        ></i>
                      </span>
                    </template>
                    <span v-else class="file-icon-wrap file-icon-empty">—</span>
                  </div>
                  <span v-if="isPaymentLocked(row)" class="locked-badge">Зафиксировано</span>
                </div>
              </div>
            </div>

            <div class="payments-summary">
              <div class="summary-item">
                <span class="label">Сумма счета</span>
                <span>{{ formatMoney(totalAmountNum) }}</span>
              </div>
              <div class="summary-item">
                <span class="label">Запланировано платежей</span>
                <span>{{ formatMoney(plannedAmountNum) }}</span>
              </div>
              <div class="summary-item">
                <span class="label">Осталось запланировать</span>
                <span>{{ formatMoney(leftToPlanNum) }}</span>
              </div>
              <div class="summary-item">
                <span class="label">Оплачено</span>
                <span>{{ formatMoney(paidRowsAmountNum) }}</span>
              </div>
              <div class="summary-item">
                <span class="label">Осталось оплатить</span>
                <span>{{ formatMoney(leftToPayNum) }}</span>
              </div>
            </div>

            <div class="payments-actions">
              <button type="button" class="save-btn" :disabled="paymentSaving" @click="savePayments">
                {{ paymentSaving ? 'Сохранение...' : 'Сохранить' }}
              </button>
              <span v-if="paymentSaveMessage" class="save-ok">{{ paymentSaveMessage }}</span>
              <span v-if="paymentSaveError" class="save-err">{{ paymentSaveError }}</span>
            </div>
          </div>
        </template>
      </template>

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
            <button type="button" class="action-btn" @click="closeSendModal">Отмена</button>
            <button type="button" class="action-btn action-send" :disabled="sendingApprovals || !selectedApproverIds.length" @click="submitApprovers">
              {{ sendingApprovals ? 'Отправка...' : 'Передать' }}
            </button>
          </div>
        </div>
      </div>
    </main>
  </div>
  <ChatPanel v-if="chat.panelOpen" @close="chat.closePanel()" />
</template>

<style scoped>
.invoice-main {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.invoice-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.head-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.back-btn {
  border: 1px solid var(--border-light);
  background: var(--bg-surface);
  color: var(--text-secondary);
  border-radius: 8px;
  padding: 6px 10px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  flex-shrink: 0;
}

.back-btn:hover {
  background: var(--bg-subtle);
  color: var(--text-primary);
}

.chat-btn {
  border: 1px solid var(--border-light);
  background: var(--bg-surface);
  color: var(--text-secondary);
  border-radius: 8px;
  padding: 6px 10px;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.2s;
}

.chat-btn:hover {
  background: var(--bg-subtle);
  color: var(--brand-primary);
}

.page-title {
  margin: 0;
  font-size: 24px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.urgent-indicator {
  margin-left: 8px;
  font-size: 22px;
}

.status-chip {
  background: #eff6ff;
  color: #1d4ed8;
  border: 1px solid #bfdbfe;
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 12px;
}

.head-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.project-label {
  font-size: 13px;
  color: var(--text-secondary);
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: 999px;
  padding: 6px 10px;
}

.page-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.action-btn {
  border: 1px solid var(--border-light);
  background: #fff;
  color: var(--text-primary);
  border-radius: 8px;
  padding: 7px 12px;
  cursor: pointer;
}

.action-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.action-edit {
  border-color: var(--brand-primary);
  color: var(--brand-primary);
}

.action-approve {
  border-color: #10b981;
  color: #047857;
  background: #ecfdf5;
}

.action-reject {
  border-color: #ef4444;
  color: #b91c1c;
  background: #fef2f2;
}

.action-send {
  border-color: #0ea5e9;
  color: #0369a1;
  background: #f0f9ff;
}

.action-delivery {
  border-color: #14b8a6;
  color: #0f766e;
  background: #f0fdfa;
}

.tabs {
  display: inline-flex;
  gap: 6px;
}

.tab-btn {
  border: 1px solid var(--border-light);
  background: var(--bg-surface);
  color: var(--text-secondary);
  border-radius: 8px;
  padding: 7px 12px;
  cursor: pointer;
}

.tab-btn.active {
  border-color: var(--brand-primary);
  color: var(--brand-primary);
  background: #eff6ff;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.info-item {
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: 10px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.label {
  color: var(--text-tertiary);
  font-size: 12px;
}

.value {
  color: var(--text-primary);
}

.block-title-small {
  font-size: 13px;
  color: var(--text-primary);
  font-weight: 600;
  margin-bottom: 6px;
}

.kv-row {
  display: grid;
  grid-template-columns: 80px minmax(0, 1fr);
  align-items: start;
  gap: 6px;
}

.value-link {
  color: var(--brand-primary);
  text-decoration: none;
}

.block {
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: 12px;
  padding: 12px;
}

.pay-summary {
  font-size: 13px;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.pay-track {
  width: 100%;
  height: 10px;
  border-radius: 999px;
  background: var(--bg-subtle);
  overflow: hidden;
}

.pay-fill {
  height: 100%;
  background: #22c55e;
}

.roles-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.role-col {
  border: 1px solid var(--border-light);
  border-radius: 10px;
  padding: 10px;
}

.role-title {
  color: var(--text-secondary);
  font-size: 12px;
  margin-bottom: 6px;
}

.role-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.role-chip {
  border: 1px solid var(--border-light);
  border-radius: 999px;
  padding: 4px 8px;
  font-size: 12px;
  color: var(--text-primary);
  background: var(--bg-subtle);
}

.block-title {
  margin: 0 0 10px;
  font-size: 16px;
  color: var(--text-primary);
}

.approvals {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 6px;
}

.approval-item {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  padding: 6px 28px 6px 10px;
  display: inline-flex;
  gap: 8px;
  align-items: center;
  font-size: 13px;
  position: relative;
}

.approval-name {
  color: var(--text-primary);
}

.st-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  display: inline-block;
}

.st-green { background: #10b981; }
.st-red { background: #ef4444; }
.st-amber { background: #f59e0b; }

.approval-remove {
  position: absolute;
  right: 4px;
  top: 4px;
  width: 16px;
  height: 16px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-tertiary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  cursor: pointer;
  transition: opacity .16s ease, background .16s ease, color .16s ease;
}

.approval-item:hover .approval-remove {
  opacity: 1;
}

.approval-remove:hover {
  background: #fee2e2;
  color: #b91c1c;
}

.approvals-add {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.approvals-empty {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.approval-add-btn {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 1px dashed var(--brand-primary);
  background: #eff6ff;
  color: var(--brand-primary);
  font-weight: 700;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}

.approver-dropdown-inline {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  min-width: 320px;
  z-index: 40;
}

.approver-inline-input {
  margin: 8px;
  width: calc(100% - 16px);
}

.table-wrap {
  overflow: auto;
}

.items-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 12px;
}

.items-table th,
.items-table td {
  border: 1px solid var(--border-light);
  padding: 8px 10px;
  vertical-align: top;
}

.items-table th {
  background: var(--bg-subtle);
  color: var(--text-secondary);
  text-transform: uppercase;
  font-size: 11px;
  letter-spacing: .4px;
}

.name-cell {
  white-space: pre-wrap;
  word-break: break-word;
}

.summary-row td {
  background: var(--bg-subtle);
  font-weight: 600;
}

.pdf-block :deep(.pdf-viewer) {
  min-height: 320px;
}

.pdf-block__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.pdf-block__header .block-title {
  margin-bottom: 0;
}

.payments-head-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 220px;
  gap: 10px;
  margin-bottom: 14px;
}

.payments-layout {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.prepay-card {
  justify-content: center;
}

.prepay-value {
  font-size: 28px;
  color: var(--text-primary);
  font-weight: 600;
  line-height: 1.1;
}

.payment-info-card {
  background: #fff;
}

.payments-editor {
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: #fff;
  padding: 10px;
}

.payment-row-head {
  display: grid;
  grid-template-columns: 120px 130px 140px 120px 180px 160px 110px 120px 160px;
  gap: 10px;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 8px;
  padding: 0 2px;
}

.payment-rows {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.payment-row {
  display: grid;
  grid-template-columns: 120px 130px 140px 120px 180px 160px 110px 120px 160px 140px;
  gap: 10px;
  align-items: center;
  padding: 6px;
  border: 1px solid transparent;
  border-radius: 10px;
}

.payment-row.locked {
  border-color: #d1d5db;
  background: #f9fafb;
}

.form-input {
  width: 100%;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  padding: 8px 10px;
  background: var(--bg-surface);
  color: var(--text-primary);
}

.form-input:disabled {
  background: #f3f4f6;
  color: #6b7280;
  cursor: not-allowed;
}

.paid-check {
  min-height: 38px;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  padding: 8px 10px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-primary);
}

.paid-check.locked {
  background: #f3f4f6;
  color: #6b7280;
}

.payment-file-cell {
  display: flex;
  align-items: center;
  gap: 4px;
}

.file-icon-wrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.file-icon {
  cursor: pointer;
  color: #3b82f6;
  font-size: 16px;
  transition: opacity 0.15s;
}

.file-icon:hover {
  opacity: 0.7;
}

.file-icon-empty {
  color: #9ca3af;
  cursor: pointer;
}

.file-icon-empty:hover {
  color: var(--accent);
}

.payment-row .hidden-input {
  display: none;
}

.locked-badge {
  grid-column: 1 / -1;
  font-size: 11px;
  color: #6b7280;
  margin-top: -2px;
  padding-left: 2px;
}

.payments-summary {
  margin-top: 12px;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  padding: 12px;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
  background: #fff;
}

.summary-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 13px;
  color: var(--text-primary);
  padding: 8px;
  border-radius: 8px;
  background: #ffffff;
  border: 1px solid var(--border-light);
}

.payments-actions {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.save-btn {
  border: 1px solid var(--brand-primary);
  background: var(--brand-primary);
  color: #fff;
  border-radius: 8px;
  padding: 8px 14px;
  cursor: pointer;
}

.save-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.save-ok {
  color: #15803d;
  font-size: 13px;
}

.save-err {
  color: #b91c1c;
  font-size: 13px;
}

.inline-state {
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: 10px;
  padding: 14px;
  color: var(--text-secondary);
}

.inline-state.error {
  color: #b91c1c;
  border-color: #fecaca;
  background: #fef2f2;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.35);
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.modal-card {
  width: min(680px, 100%);
  max-height: 85vh;
  overflow: visible;
  background: #fff;
  border: 1px solid var(--border-light);
  border-radius: 12px;
  padding: 14px;
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.22);
  display: flex;
  flex-direction: column;
  gap: 10px;
  position: relative;
}

.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.modal-title {
  margin: 0;
  font-size: 18px;
  color: var(--text-primary);
}

.modal-close {
  width: 30px;
  height: 30px;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: #fff;
  color: var(--text-secondary);
  cursor: pointer;
}

.approver-select {
  position: relative;
}

.approver-dropdown {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 6px);
  z-index: 1301;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.16);
  max-height: 240px;
  overflow: auto;
  padding: 6px;
}

.approver-option {
  width: 100%;
  border: 0;
  background: #fff;
  border-radius: 8px;
  padding: 8px 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  text-align: left;
}

.approver-option:hover {
  background: #f8fafc;
}

.modal-selected {
  border-top: 1px dashed var(--border-light);
  padding-top: 8px;
}

.role-chip-removable {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding-right: 6px;
}

.chip-remove {
  border: 0;
  background: transparent;
  color: var(--text-tertiary);
  width: 18px;
  height: 18px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.chip-remove:hover {
  background: #eef2f7;
  color: var(--text-primary);
}

.modal-actions {
  margin-top: 2px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.empty {
  color: var(--text-tertiary);
}

@media (max-width: 1024px) {
  .info-grid {
    grid-template-columns: 1fr;
  }
  .roles-grid {
    grid-template-columns: 1fr;
  }
  .payments-head-grid {
    grid-template-columns: 1fr;
  }
  .payment-row-head,
  .payment-row {
    grid-template-columns: 1fr;
  }
  .payments-summary {
    grid-template-columns: 1fr;
  }
}

.info-item-comment {
  grid-column: 1 / -1;
}

.comment-display {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.comment-edit-wrap {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.comment-edit-wrap textarea {
  width: 100%;
  box-sizing: border-box;
}

.comment-edit-actions {
  display: flex;
  gap: 8px;
}

.comment-edit-btn {
  border: none;
  background: none;
  cursor: pointer;
  color: var(--text-tertiary);
  padding: 2px 4px;
  font-size: 12px;
}

.comment-edit-btn:hover {
  color: var(--brand-primary);
}

.comment-add-btn {
  border: 1px dashed var(--border-light);
  background: none;
  cursor: pointer;
  color: var(--text-tertiary);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
}

.comment-add-btn:hover {
  border-color: var(--brand-primary);
  color: var(--brand-primary);
}
</style>
