<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TopNav from '../components/layout/TopNav.vue'
import ChatPanel from '../components/chat/ChatPanel.vue'
import { useChatStore } from '../stores/chat'
import { mainNavLinks } from '../constants/mainNav'

const route = useRoute()
const router = useRouter()
const chat = useChatStore()

const navLinks = mainNavLinks

const loading = ref(false)
const loadError = ref('')
const rows = ref([])
const resolvingProjectLink = ref(false)
const structureCache = ref(new Map())
const isCreateInvoiceModalOpen = ref(false)
const createInvoiceError = ref('')
const parsingInvoice = ref(false)
const duplicateInfo = ref(null)
const parseError = ref('')
const isCreateInvoiceSubmitting = ref(false)
const invoiceFiles = ref([])
const invoiceFilesInputRef = ref(null)
const counterparties = ref([])
const counterpartiesLoading = ref(false)
const counterpartiesError = ref('')
const projectObjects = ref([])
const projectObjectsLoading = ref(false)
const projectObjectsError = ref('')
const objects = ref([])
const objectsLoading = ref(false)
const objectsError = ref('')
const selectedProjectType = ref('')
const supplierQuery = ref('')
const payerQuery = ref('')
const projectQuery = ref('')
const selectedSupplierId = ref('')
const selectedPayerId = ref('')
const selectedProjectObjectId = ref('')
const isSupplierDropdownOpen = ref(false)
const isPayerDropdownOpen = ref(false)
const isProjectDropdownOpen = ref(false)
const deliveryIncluded = ref(null)
const prepaymentRequired = ref(null)
const prepaymentPercent = ref('')
const defermentProvided = ref(null)
const defermentDays = ref('')
const invoiceValidityDays = ref('')
const urgentInvoice = ref(null)
const createInvoiceComment = ref('')
const supplierLookupRef = ref(null)
const payerLookupRef = ref(null)
const projectLookupRef = ref(null)
const allUsers = ref([])
const allUsersLoading = ref(false)
const allUsersError = ref('')
const selectedFromByUserId = ref('')
const fromByUserQuery = ref('')
const isFromByUserDropdownOpen = ref(false)
const fromByUserLookupRef = ref(null)
let lastCounterpartiesRefreshAt = 0
let lastProjectObjectsRefreshAt = 0
const filterDropdowns = ref({
  provider: false,
  payer: false,
  participants: false,
  approvals: false,
  project: false,
  request: false,
})
const filterSearch = ref({
  provider: '',
  payer: '',
  participants: '',
  approvals: '',
  project: '',
  request: '',
})
const filterRefs = ref({
  provider: null,
  payer: null,
  participants: null,
  approvals: null,
  project: null,
  request: null,
})
const filters = ref({
  invoiceText: '',
  providers: [],
  payers: [],
  participants: [],
  approvals: [],
  projects: [],
  requests: [],
  dateExact: '',
  dateFrom: '',
  dateTo: '',
  paymentPaid: false,
  paymentPartial: false,
  paymentUnpaid: false,
  paymentPlanned: false,
  paymentNotPlanned: false,
  paymentDue: false,
  urgent: false,
  notSentApproval: false,
  statusApproved: false,
  statusPending: false,
  statusRejected: false,
})

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

const toMoneyNumber = (value) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

const shortFio = (user) => {
  if (!user) return '—'
  if (user.short_fio) return user.short_fio
  const surname = user.surname || ''
  const name = user.name ? `${user.name[0]}.` : ''
  const patronymic = user.patronymic ? ` ${user.patronymic[0]}.` : ''
  const out = `${surname} ${name}${patronymic}`.trim()
  return out || '—'
}

const fullFio = (user) => {
  if (!user) return '—'
  if (user.fio) return user.fio
  const parts = [user.surname || '', user.name || '', user.patronymic || ''].filter(Boolean)
  return parts.length ? parts.join(' ') : user.short_fio || '—'
}

const statusClassFromName = (name) => {
  const val = String(name || '').toLowerCase()
  if (val.includes('нов')) return 'row-new'
  if (val.includes('процесс') || val.includes('работ')) return 'row-work'
  if (val.includes('соглас')) return 'row-done'
  if (val.includes('отклон')) return 'row-wait'
  return 'row-new'
}

const approvalVariant = (statusName) => {
  const status = String(statusName || '').toLowerCase()
  if (status.includes('approved')) return 'st-green'
  if (status.includes('reject')) return 'st-red'
  return 'st-amber'
}

const firstPlannedPaymentDate = (payments) => {
  const list = normalizeArray(payments).filter((item) => item?.date_plan)
  if (!list.length) return ''
  const sorted = list.slice().sort((a, b) => new Date(a.date_plan).getTime() - new Date(b.date_plan).getTime())
  return sorted[0]?.date_plan || ''
}

const isUuid = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''))

const loadInvoicesRegistry = async () => {
  loading.value = true
  loadError.value = ''
  try {
    const res = await fetch('/apisup/supply/invoices/my', { credentials: 'include' })
    if (!res.ok) throw new Error('invoices load failed')
    const payload = await res.json()
    const invoices = normalizeArray(payload)

    rows.value = invoices.map((invoice) => ({
      totalAmountNum: toMoneyNumber(invoice?.total_amount),
      key: String(invoice?.id || ''),
      isUrgent: Boolean(invoice?.is_urgent),
      requestId: invoice?.request_id,
      objectLevelsId: invoice?.object_levels_id,
      invoiceId: invoice?.id,
      statusName: String(invoice?.status_name || ''),
      statusClass: statusClassFromName(invoice?.status_name),
      invoiceName: `Счет ${invoice?.num || 'без номера'} от ${formatDate(invoice?.date)}`,
      invoiceNameRaw: String(invoice?.num || ''),
      amount: formatMoney(invoice?.total_amount),
      paidAmountNum: normalizeArray(invoice?.payments).reduce((acc, payment) => acc + toMoneyNumber(payment?.paid), 0),
      participants: [
        { icon: 'fas fa-plus', name: shortFio(invoice?.created_by_user) },
        ...normalizeArray(invoice?.planning).map((item) => ({ icon: 'fas fa-calendar-lines-pen', name: shortFio(item?.user) })),
        ...normalizeArray(invoice?.payment).map((item) => ({ icon: 'fas fa-ruble-sign', name: shortFio(item?.user) })),
      ].filter((item) => item.name !== '—'),
      approvals: normalizeArray(invoice?.approvals).map((approval) => ({
        name: approval?.user?.short_fio || shortFio(approval?.user),
        variant: approvalVariant(approval?.status_name || approval?.answer),
      })),
      providerId: invoice?.provider_id,
      provider: invoice?.provider_name || '—',
      payerId: invoice?.payer_id,
      payer: invoice?.payer_name || '—',
      fromByUserId: invoice?.from_by,
      fromByUser: invoice?.from_by_user?.short_fio || '—',
      invoiceDate: formatDate(invoice?.date),
      createdDate: formatDate(invoice?.created_at),
      plannedDate: formatDate(firstPlannedPaymentDate(invoice?.payments)),
      paymentsCount: normalizeArray(invoice?.payments).length,
      paidPaymentsCount: normalizeArray(invoice?.payments).filter((item) => toMoneyNumber(item?.paid) > 0).length,
      rawInvoiceDate: String(invoice?.date || ''),
      rawCreatedDate: String(invoice?.created_at || ''),
      paymentLines: normalizeArray(invoice?.payments).map((payment) => ({
        amount: formatMoney(payment?.value),
        date: formatDate(payment?.paid_at || payment?.date_plan),
        rawDate: String(payment?.paid_at || payment?.date_plan || ''),
        isPaid: toMoneyNumber(payment?.paid) > 0 || Boolean(payment?.paid_at),
      })),
      project: invoice?.project_name || '—',
      requestName: invoice?.request_name || `Заявка #${invoice?.request_id || ''}`,
      chatId: invoice?.chat_id || null,
      comment: String(invoice?.comment || ''),
    }))

    nextTick(() => {
      for (const row of rows.value) {
        if (row.chatId) {
          chat.fetchBadge(row.chatId)
        }
      }
    })
  } catch {
    rows.value = []
    loadError.value = 'Не удалось загрузить реестр счетов.'
  } finally {
    loading.value = false
  }
}

const openInvoice = (row, mode = 'view') => {
  if (!row?.invoiceId) return
  router.push({
    path: `/invoices/${encodeURIComponent(String(row.invoiceId))}`,
    query: { back: route.fullPath, mode },
  })
}

const getBadge = (chatId) => {
  if (!chatId) return null
  const b = chat.badges[chatId]
  if (!b || b.loading) return null
  return b.mention || b.unread ? b : null
}

const handleCloseChat = () => {
  const chatId = chat.currentChatId
  chat.closePanel()
  if (chatId) {
    chat.refreshBadge(chatId)
  }
}

const openCounterparty = (counterpartyId) => {
  if (!counterpartyId) return
  router.push(`/counterparties/profile/${encodeURIComponent(String(counterpartyId))}`)
}

const openRequest = (requestId) => {
  if (!requestId) return
  router.push({
    path: `/requests/${encodeURIComponent(String(requestId))}`,
    query: { back: route.fullPath },
  })
}

const goCreateInvoice = () => {
  openCreateInvoiceModal()
}

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
  const q = projectQuery.value.trim().toLowerCase()
  if (!q) return combinedProjectItems.value
  return combinedProjectItems.value.filter((item) => String(item.name || '').toLowerCase().includes(q))
})

const filteredFromByUsers = computed(() => {
  const q = fromByUserQuery.value.trim().toLowerCase()
  if (!q) return allUsers.value
  return allUsers.value.filter((user) => {
    const full = [user.surname, user.name, user.patronymic, user.fio, user.short_fio].filter(Boolean).join(' ').toLowerCase()
    return full.includes(q)
  })
})

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

const loadProjectObjects = async () => {
  lastProjectObjectsRefreshAt = Date.now()
  projectObjectsLoading.value = true
  projectObjectsError.value = ''
  try {
    const res = await fetch('/apisup/supply/request-objects/my', { credentials: 'include' })
    if (!res.ok) throw new Error('project objects load failed')
    projectObjects.value = normalizeArray(await res.json())
  } catch {
    projectObjects.value = []
    projectObjectsError.value = 'Не удалось загрузить список проектов.'
  } finally {
    projectObjectsLoading.value = false
  }
}

const loadObjects = async () => {
  objectsLoading.value = true
  objectsError.value = ''
  try {
    const res = await fetch('/apiref/ref/objects', { credentials: 'include' })
    if (!res.ok) throw new Error('objects load failed')
    objects.value = normalizeArray(await res.json())
  } catch {
    objects.value = []
    objectsError.value = 'Не удалось загрузить список объектов.'
  } finally {
    objectsLoading.value = false
  }
}

const loadAllUsers = async () => {
  allUsersLoading.value = true
  allUsersError.value = ''
  try {
    const res = await fetch('/api/as/users/all', { credentials: 'include' })
    if (!res.ok) throw new Error('users load failed')
    allUsers.value = normalizeArray(await res.json())
  } catch {
    allUsers.value = []
    allUsersError.value = 'Не удалось загрузить список пользователей.'
  } finally {
    allUsersLoading.value = false
  }
}

const openCounterpartyCreate = () => {
  window.open('/organizations/create', '_blank', 'noopener')
}

const refreshCounterpartiesOnFocus = async () => {
  if (!isCreateInvoiceModalOpen.value) return
  if (Date.now() - lastCounterpartiesRefreshAt < 800) return
  await loadCounterparties()
}

const refreshProjectObjectsOnFocus = async () => {
  if (!isCreateInvoiceModalOpen.value) return
  if (Date.now() - lastProjectObjectsRefreshAt < 800) return
  await loadProjectObjects()
}

const openCreateInvoiceModal = async () => {
  isCreateInvoiceModalOpen.value = true
  createInvoiceError.value = ''
  invoiceFiles.value = []
  parsingInvoice.value = false
  duplicateInfo.value = null
  parseError.value = ''
  supplierQuery.value = ''
  payerQuery.value = ''
  projectQuery.value = ''
  selectedSupplierId.value = ''
  selectedPayerId.value = ''
  selectedProjectObjectId.value = ''
  selectedProjectType.value = ''
  selectedFromByUserId.value = ''
  fromByUserQuery.value = ''
  isFromByUserDropdownOpen.value = false
  isSupplierDropdownOpen.value = false
  isPayerDropdownOpen.value = false
  isProjectDropdownOpen.value = false
  deliveryIncluded.value = null
  prepaymentRequired.value = null
  prepaymentPercent.value = ''
  defermentProvided.value = null
  defermentDays.value = ''
  invoiceValidityDays.value = ''
  urgentInvoice.value = null
  createInvoiceComment.value = ''
  await Promise.all([loadCounterparties(), loadProjectObjects(), loadObjects(), loadAllUsers()])
}

const closeCreateInvoiceModal = () => {
  isCreateInvoiceModalOpen.value = false
  duplicateInfo.value = null
  parseError.value = ''
  createInvoiceComment.value = ''
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

const selectFromByUser = (item) => {
  selectedFromByUserId.value = String(item.id || item.user_id || '')
  fromByUserQuery.value = [item.surname, item.name, item.patronymic].filter(Boolean).join(' ') || item.fio || item.short_fio || ''
  isFromByUserDropdownOpen.value = false
}

const onProjectInput = () => {
  selectedProjectObjectId.value = ''
  selectedProjectType.value = ''
  isProjectDropdownOpen.value = true
}

const selectProjectObject = (item) => {
  selectedProjectObjectId.value = String(item.id || '')
  selectedProjectType.value = item.type || 'object_levels_id'
  projectQuery.value = item.name || ''
  isProjectDropdownOpen.value = false
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
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
        await Promise.all([loadCounterparties(), loadProjectObjects()])
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
        await Promise.all([loadCounterparties(), loadProjectObjects()])
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

const submitCreateInvoice = async () => {
  createInvoiceError.value = ''
  if (!selectedSupplierId.value) {
    createInvoiceError.value = 'Укажите поставщика.'
    return
  }
  if (!selectedPayerId.value) {
    createInvoiceError.value = 'Выберите плательщика.'
    return
  }
  if (!isUuid(selectedSupplierId.value) || !isUuid(selectedPayerId.value)) {
    createInvoiceError.value = 'Поставщик и плательщик должны иметь UUID.'
    return
  }
  if (prepaymentRequired.value === true) {
    const val = Number(prepaymentPercent.value)
    if (!Number.isFinite(val) || val < 1 || val > 100) {
      createInvoiceError.value = 'Предоплата должна быть в диапазоне от 1 до 100%.'
      return
    }
  }
  if (defermentProvided.value === true) {
    const val = Number(defermentDays.value)
    if (!Number.isFinite(val) || val < 1) {
      createInvoiceError.value = 'Отсрочка должна быть положительным числом дней.'
      return
    }
  }

  const payload = {
    provider_id: String(selectedSupplierId.value),
    payer_id: String(selectedPayerId.value),
    is_delivery_included: deliveryIncluded.value === true,
    prepayment_percent: prepaymentRequired.value === true ? Number(prepaymentPercent.value) : 0,
    due_days: defermentProvided.value === true ? Number(defermentDays.value) : 0,
    valid_until: Number(invoiceValidityDays.value || 0),
    is_urgent: urgentInvoice.value === true,
    comment: String(createInvoiceComment.value || ''),
  }
  if (selectedProjectObjectId.value) {
    payload.object_levels_id = String(selectedProjectObjectId.value)
    payload.object_type = selectedProjectType.value || 'object_levels_id'
  }
  if (selectedFromByUserId.value) {
    payload.from_by = String(selectedFromByUserId.value)
  }

  isCreateInvoiceSubmitting.value = true
  try {
    let res
    if (invoiceFiles.value.length) {
      const formData = new FormData()
      formData.append('payload_json', JSON.stringify(payload))
      formData.append('file', invoiceFiles.value[0])
      res = await fetch('/apisup/supply/invoices/with-file', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      })
    } else {
      res = await fetch('/apisup/supply/invoices', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const formData = new FormData()
        formData.append('payload_json', JSON.stringify(payload))
        res = await fetch('/apisup/supply/invoices/with-file', {
          method: 'POST',
          credentials: 'include',
          body: formData,
        })
      }
    }
    if (!res.ok) throw new Error('invoice create failed')
    const body = await res.json().catch(() => ({}))
    const invoiceId = body?.id || body?.invoice_id || body?.data?.id
    if (!invoiceId) throw new Error('invoice id missing')
    closeCreateInvoiceModal()
    await loadInvoicesRegistry()
    router.push({
      path: `/invoices/${encodeURIComponent(String(invoiceId))}/process`,
      query: { back: route.fullPath, ...(invoiceFiles.value.length ? { auto_parse: '1' } : {}) },
    })
  } catch {
    createInvoiceError.value = 'Не удалось создать счет. Проверьте поля и повторите попытку.'
  } finally {
    isCreateInvoiceSubmitting.value = false
  }
}

const handleWindowClick = (event) => {
  const target = event?.target
  if (!(target instanceof Node)) return
  const supplierEl = supplierLookupRef.value
  if (!supplierEl || !supplierEl.contains(target)) {
    isSupplierDropdownOpen.value = false
  }
  const payerEl = payerLookupRef.value
  if (!payerEl || !payerEl.contains(target)) {
    isPayerDropdownOpen.value = false
  }
  const projectEl = projectLookupRef.value
  if (!projectEl || !projectEl.contains(target)) {
    isProjectDropdownOpen.value = false
  }
  const fromByUserEl = fromByUserLookupRef.value
  if (!fromByUserEl || !fromByUserEl.contains(target)) {
    isFromByUserDropdownOpen.value = false
  }
  Object.entries(filterRefs.value).forEach(([key, el]) => {
    if (!el || !el.contains(target)) {
      filterDropdowns.value[key] = false
    }
  })
}

const normalizeChildren = (payload) => {
  if (Array.isArray(payload)) return payload
  return Array.isArray(payload?.children) ? payload.children : []
}

const findNodeById = (nodes, targetId) => {
  const list = normalizeChildren(nodes)
  for (const node of list) {
    if (String(node?.id || '') === String(targetId || '')) return node
    const found = findNodeById(node?.children, targetId)
    if (found) return found
  }
  return null
}

const openProjectFromInvoiceRow = async (row) => {
  const objectLevelId = String(row?.objectLevelsId || '')
  if (!objectLevelId || resolvingProjectLink.value) return
  resolvingProjectLink.value = true
  try {
    const projectsRes = await fetch('/apisup/supply/projects', { credentials: 'include' })
    if (!projectsRes.ok) throw new Error('projects load failed')
    const projects = normalizeArray(await projectsRes.json())

    for (const project of projects) {
      const objectId = String(project?.object_id || '')
      const projectId = String(project?.id || '')
      if (!objectId || !projectId) continue

      let structure = structureCache.value.get(objectId)
      if (!structure) {
        // eslint-disable-next-line no-await-in-loop
        const structureRes = await fetch(`/apiref/ref/objects/${encodeURIComponent(objectId)}/structure`, {
          credentials: 'include',
        })
        if (!structureRes.ok) continue
        // eslint-disable-next-line no-await-in-loop
        structure = await structureRes.json()
        structureCache.value.set(objectId, structure)
      }

      const foundNode = findNodeById(structure, objectLevelId)
      if (!foundNode) continue

      router.push({
        path: `/projects/${encodeURIComponent(projectId)}/works/${encodeURIComponent(objectLevelId)}`,
        query: { object_id: objectId },
      })
      return
    }

    router.push('/projects')
  } catch {
    router.push('/projects')
  } finally {
    resolvingProjectLink.value = false
  }
}

const paidPercent = (row) => {
  const total = toMoneyNumber(row?.totalAmountNum)
  const paid = toMoneyNumber(row?.paidAmountNum)
  if (total <= 0 || paid <= 0) return 0
  return Math.max(0, Math.min(100, (paid / total) * 100))
}

const rowsCountText = computed(() => `${filteredRows.value.length} счетов`)

const paymentStateOfRow = (row) => {
  const paid = toMoneyNumber(row?.paidAmountNum)
  const total = toMoneyNumber(row?.totalAmountNum)
  if (paid <= 0) return 'unpaid'
  if (total > 0 && paid < total) return 'partial'
  return 'paid'
}

const statusStateOfRow = (row) => {
  const status = String(row?.statusName || '').toLowerCase()
  if (status.includes('отклон')) return 'rejected'
  if (status.includes('соглас')) return 'approved'
  return 'pending'
}

const optionList = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'ru', { sensitivity: 'base' }))

const filterOptions = computed(() => ({
  provider: optionList(rows.value.map((row) => row.provider).filter((v) => v && v !== '—')),
  payer: optionList(rows.value.map((row) => row.payer).filter((v) => v && v !== '—')),
  participants: optionList(rows.value.flatMap((row) => row.participants.map((item) => item.name)).filter((v) => v && v !== '—')),
  approvals: optionList(rows.value.flatMap((row) => row.approvals.map((item) => item.name)).filter((v) => v && v !== '—')),
  project: optionList(rows.value.map((row) => row.project).filter((v) => v && v !== '—')),
  request: optionList(rows.value.map((row) => row.requestName).filter((v) => v && v !== '—')),
}))

const filteredDropdownOptions = (key) => {
  const query = String(filterSearch.value[key] || '').trim().toLowerCase()
  const list = filterOptions.value[key] || []
  if (!query) return list
  return list.filter((item) => String(item).toLowerCase().includes(query))
}

const selectedCountLabel = (key, emptyLabel) => {
  const count = normalizeArray(filters.value[key]).length
  return count ? `${emptyLabel} (${count})` : emptyLabel
}

const toggleFilterDropdown = (key) => {
  Object.keys(filterDropdowns.value).forEach((name) => {
    filterDropdowns.value[name] = name === key ? !filterDropdowns.value[name] : false
  })
}

const setFilterRef = (key, el) => {
  filterRefs.value[key] = el
}

const toggleMultiFilterValue = (key, value) => {
  const current = new Set(filters.value[key] || [])
  if (current.has(value)) current.delete(value)
  else current.add(value)
  filters.value[key] = [...current]
}

const clearInvoiceFilters = () => {
  filters.value = {
    invoiceText: '',
    providers: [],
    payers: [],
    participants: [],
    approvals: [],
    projects: [],
    requests: [],
    dateExact: '',
    dateFrom: '',
    dateTo: '',
    paymentPaid: false,
    paymentPartial: false,
    paymentUnpaid: false,
    paymentPlanned: false,
    paymentNotPlanned: false,
    paymentDue: false,
    urgent: false,
    notSentApproval: false,
    statusApproved: false,
    statusPending: false,
    statusRejected: false,
  }
  Object.keys(filterSearch.value).forEach((key) => { filterSearch.value[key] = '' })
  Object.keys(filterDropdowns.value).forEach((key) => { filterDropdowns.value[key] = false })
}

const filteredRows = computed(() => {
  const textQuery = String(filters.value.invoiceText || '').trim().toLowerCase()
  const paymentStates = [
    filters.value.paymentPaid && 'paid',
    filters.value.paymentPartial && 'partial',
    filters.value.paymentUnpaid && 'unpaid',
  ].filter(Boolean)
  const statusStates = [
    filters.value.statusApproved && 'approved',
    filters.value.statusPending && 'pending',
    filters.value.statusRejected && 'rejected',
  ].filter(Boolean)
  const exactDate = filters.value.dateExact
  const dateFrom = filters.value.dateFrom
  const dateTo = filters.value.dateTo

  return rows.value.filter((row) => {
    if (textQuery) {
      const haystack = [
        row.invoiceName,
        row.invoiceNameRaw,
        row.provider,
        row.payer,
        row.project,
        row.requestName,
        row.statusName,
      ].join(' ').toLowerCase()
      if (!haystack.includes(textQuery)) return false
    }
    if (filters.value.paymentPlanned && !row.paymentLines.some((l) => !l.isPaid)) return false
    if (filters.value.paymentNotPlanned && row.paymentLines.some((l) => !l.isPaid)) return false
    if (filters.value.paymentDue) {
      const paid = toMoneyNumber(row?.paidAmountNum)
      const total = toMoneyNumber(row?.totalAmountNum)
      const needsPayment = total > 0 && paid < total
      if (!needsPayment) return false
    }
    if (filters.value.urgent && !row.isUrgent) return false
    if (filters.value.notSentApproval && (row.approvals.length > 0 || statusStateOfRow(row) !== 'pending')) return false
    if (filters.value.providers.length && !filters.value.providers.includes(row.provider)) return false
    if (filters.value.payers.length && !filters.value.payers.includes(row.payer)) return false
    if (filters.value.projects.length && !filters.value.projects.includes(row.project)) return false
    if (filters.value.requests.length && !filters.value.requests.includes(row.requestName)) return false
    if (filters.value.participants.length && !row.participants.some((item) => filters.value.participants.includes(item.name))) return false
    if (filters.value.approvals.length && !row.approvals.some((item) => filters.value.approvals.includes(item.name))) return false
    if (paymentStates.length && !paymentStates.includes(paymentStateOfRow(row))) return false
    if (statusStates.length && !statusStates.includes(statusStateOfRow(row))) return false

    if (exactDate || dateFrom || dateTo) {
      const dateValues = [
        row.rawInvoiceDate,
        row.rawCreatedDate,
        ...row.paymentLines.map((line) => line.rawDate),
      ].map((value) => String(value || '').slice(0, 10)).filter(Boolean)
      const matchesDate = dateValues.some((value) => {
        if (exactDate && value !== exactDate) return false
        if (dateFrom && value < dateFrom) return false
        if (dateTo && value > dateTo) return false
        return true
      })
      if (!matchesDate) return false
    }
    return true
  })
})

onMounted(() => {
  window.addEventListener('mousedown', handleWindowClick)
  window.addEventListener('focus', refreshCounterpartiesOnFocus)
  window.addEventListener('focus', refreshProjectObjectsOnFocus)
  loadInvoicesRegistry()
})

onBeforeUnmount(() => {
  window.removeEventListener('mousedown', handleWindowClick)
  window.removeEventListener('focus', refreshCounterpartiesOnFocus)
  window.removeEventListener('focus', refreshProjectObjectsOnFocus)
})
</script>

<template>
  <div class="page">
    <TopNav :links="navLinks" />

    <main class="main-content invoices-main">
      <header class="page-head">
        <div>
          <h1 class="page-title">Реестр счетов</h1>
          <p class="page-subtitle">{{ rowsCountText }}</p>
        </div>
        <button class="create-btn" type="button" @click="goCreateInvoice">
          <i class="fas fa-plus"></i>
          Создать счет
        </button>
      </header>

      <div v-if="loading" class="inline-state">Загрузка счетов...</div>
      <div v-else-if="loadError" class="inline-state error">{{ loadError }}</div>

      <template v-else>
        <div class="filters-panel">
          <div class="filters-grid">
            <label class="filter-field">
              <span>Счёт</span>
              <input v-model="filters.invoiceText" class="filter-input" type="text" placeholder="Поиск по счёту">
            </label>

            <div v-for="item in [
              ['provider', 'Поставщик', 'providers'],
              ['payer', 'Плательщик', 'payers'],
              ['participants', 'Участники', 'participants'],
              ['approvals', 'Согласующие', 'approvals'],
              ['project', 'Проект', 'projects'],
              ['request', 'Заявка', 'requests'],
            ]" :key="item[0]" :ref="(el) => setFilterRef(item[0], el)" class="filter-field lookup-wrap">
              <span>{{ item[1] }}</span>
              <button type="button" class="filter-select-btn" @click="toggleFilterDropdown(item[0])">
                <span>{{ selectedCountLabel(item[2], item[1]) }}</span>
                <i class="fas fa-chevron-down"></i>
              </button>
              <div v-if="filterDropdowns[item[0]]" class="lookup-list lookup-list-overlay filter-dropdown">
                <input
                  v-model="filterSearch[item[0]]"
                  class="form-input filter-search"
                  type="text"
                  placeholder="Поиск..."
                >
                <label v-for="option in filteredDropdownOptions(item[0])" :key="`${item[0]}-${option}`" class="filter-option">
                  <input
                    :checked="filters[item[2]].includes(option)"
                    type="checkbox"
                    @change="toggleMultiFilterValue(item[2], option)"
                  >
                  <span>{{ option }}</span>
                </label>
                <div v-if="!filteredDropdownOptions(item[0]).length" class="lookup-empty">Ничего не найдено</div>
              </div>
            </div>

            <label class="filter-field">
              <span>Дата</span>
              <input v-model="filters.dateExact" class="filter-input" type="date">
            </label>

            <label class="filter-field">
              <span>Период: с</span>
              <input v-model="filters.dateFrom" class="filter-input" type="date">
            </label>

            <label class="filter-field">
              <span>Период: по</span>
              <input v-model="filters.dateTo" class="filter-input" type="date">
            </label>
          </div>

          <div class="filter-groups">
            <div class="check-group">
              <span class="check-group-title">Оплата</span>
              <label class="check-option"><input v-model="filters.paymentPaid" type="checkbox"> <span>Оплачены</span></label>
              <label class="check-option"><input v-model="filters.paymentPartial" type="checkbox"> <span>Частично оплачены</span></label>
              <label class="check-option"><input v-model="filters.paymentUnpaid" type="checkbox"> <span>Неоплачены</span></label>
              <label class="check-option"><input v-model="filters.paymentPlanned" type="checkbox"> <span>Запланированы платежи</span></label>
              <label class="check-option"><input v-model="filters.paymentNotPlanned" type="checkbox"> <span>Не запланированы платежи</span></label>
              <label class="check-option"><input v-model="filters.paymentDue" type="checkbox"> <span>Требуют оплаты</span></label>
            </div>

            <div class="check-group">
              <span class="check-group-title">Прочее</span>
              <label class="check-option"><input v-model="filters.urgent" type="checkbox"> <span>🔥 Срочный счёт</span></label>
              <label class="check-option"><input v-model="filters.notSentApproval" type="checkbox"> <span>Не отправлены на согласование</span></label>
            </div>

            <div class="check-group">
              <span class="check-group-title">Статус</span>
              <label class="check-option"><input v-model="filters.statusApproved" type="checkbox"> <span>Согласованные</span></label>
              <label class="check-option"><input v-model="filters.statusPending" type="checkbox"> <span>На рассмотрении</span></label>
              <label class="check-option"><input v-model="filters.statusRejected" type="checkbox"> <span>Отклоненные</span></label>
            </div>

            <button class="btn" type="button" @click="clearInvoiceFilters">Сбросить фильтры</button>
          </div>
        </div>

        <div class="table-wrapper">
          <div class="table-scroll">
            <table>
            <colgroup>
              <col class="col-check">
              <col class="col-id">
              <col class="col-invoice">
              <col class="col-sum">
              <col class="col-provider">
              <col class="col-payer">
              <col class="col-from-by">
              <col class="col-participants">
              <col class="col-approval">
              <col class="col-dates-pay">
              <col class="col-project">
              <col class="col-comment">
            </colgroup>
            <thead>
              <tr>
                <th><input type="checkbox"></th>
                <th>ID</th>
                <th>Счет</th>
                <th>Сумма</th>
                <th>Поставщик</th>
                <th>Плательщик</th>
                <th>От кого</th>
                <th>Участники</th>
                <th>Согласование</th>
                <th>Даты и платежи</th>
                <th>Проект / Заявка</th>
                <th>Комментарий</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in filteredRows" :key="row.key">
                <td class="check-cell">
                  <div class="left-marker">
                    <div class="left-marker-solid" :class="`solid-${row.statusClass}`"></div>
                  </div>
                  <input type="checkbox">
                </td>
                <td>
                  <a href="#" class="id-link" @click.prevent="openInvoice(row, 'view')">#{{ row.invoiceId }}</a>
                </td>
                <td>
                  <div class="invoice-main"><span v-if="row.isUrgent" class="urgent-dot" title="Срочный счёт">🔥</span>{{ row.invoiceName }}</div>
                  <button type="button" class="chat-icon-btn" title="Чат счета" @click="chat.openPanel('invoice', String(row.invoiceId), row.chatId, row.invoiceName)">
                    <span class="chat-icon-wrap">
                      <i class="fas fa-comment-dots"></i>
                      <span v-if="getBadge(row.chatId)" class="chat-badge badge-red"></span>
                    </span>
                  </button>
                </td>
                <td class="sum-cell">
                  <div class="sum-lines">
                    <div class="sum-row">
                      <span>Сумма:</span>
                      <div class="sum-value">{{ row.amount }}</div>
                    </div>
                    <div class="sum-row">
                      <span>Оплачено:</span>
                      <div class="sum-value">{{ formatMoney(row.paidAmountNum) }}</div>
                    </div>
                  </div>
                  <div class="payment-progress">
                    <div class="payment-track">
                      <div class="payment-fill" :style="{ width: `${paidPercent(row)}%` }"></div>
                    </div>
                    <div class="payment-caption">{{ formatMoney(row.paidAmountNum) }} из {{ row.amount }}</div>
                  </div>
                </td>
                <td>
                  <a href="#" class="name-link" @click.prevent="openCounterparty(row.providerId)">{{ row.provider }}</a>
                </td>
                <td>
                  <a href="#" class="name-link" @click.prevent="openCounterparty(row.payerId)">{{ row.payer }}</a>
                </td>
                <td>
                  <span>{{ row.fromByUser }}</span>
                </td>
                <td>
                  <div v-for="(item, idx) in row.participants" :key="`p-${row.key}-${idx}`" class="user-row">
                    <i :class="['user-icon', item.icon]"></i> {{ item.name }}
                  </div>
                  <div v-if="!row.participants.length" class="empty">—</div>
                </td>
                <td>
                  <div
                    v-for="(item, idx) in row.approvals"
                    :key="`a-${row.key}-${idx}`"
                    class="status-pill"
                    :class="item.variant"
                  >
                    <span class="st-dot"></span> {{ item.name }}
                  </div>
                  <div v-if="!row.approvals.length" class="empty">—</div>
                </td>
                <td>
                  <div class="dates-pay-row"><span>Счет:</span> {{ row.invoiceDate }}</div>
                  <div class="dates-pay-row"><span>Создан:</span> {{ row.createdDate }}</div>
                  <div v-if="row.paymentLines.length" class="dates-pay-list">
                    <div
                      v-for="(line, idx) in row.paymentLines"
                      :key="`pl-${row.key}-${idx}`"
                      class="dates-pay-line"
                      :class="line.isPaid ? 'pay-paid' : 'pay-planned'"
                    >
                      <span>{{ line.amount }}</span> - <span>{{ line.date }}</span>
                    </div>
                  </div>
                  <div v-else class="dates-pay-row"><span>Платежи:</span> —</div>
                </td>
                <td>
                  <div class="entity-label">Проект:</div>
                  <a href="#" class="name-link project-line" @click.prevent="openProjectFromInvoiceRow(row)">{{ row.project }}</a>
                  <div class="entity-label">Заявка:</div>
                  <a href="#" class="name-link request-line" @click.prevent="openRequest(row.requestId)">{{ row.requestName }}</a>
                </td>
                <td class="comment-cell">
                  <span class="comment-text">{{ row.comment || '—' }}</span>
                </td>
              </tr>
              <tr v-if="!filteredRows.length">
                <td colspan="12" class="empty-row">Ничего не найдено по текущим фильтрам.</td>
              </tr>
            </tbody>
            </table>
          </div>
        </div>
      </template>
    </main>

    <div v-if="isCreateInvoiceModalOpen" class="modal-backdrop" @click="closeCreateInvoiceModal">
      <div v-if="parsingInvoice" class="fullscreen-loader">
        <i class="fas fa-spinner fa-spin"></i> Разбор файла...
      </div>
      <div class="modal-card invoice-modal" @click.stop>
        <div class="modal-title">Создать счет</div>

        <div class="modal-field">
          <span>1. Прикрепите файл (необязательно)</span>
          <input ref="invoiceFilesInputRef" class="hidden-input" type="file" accept=".pdf,.jpg,.jpeg,.png" @change="onInvoiceFilesPicked">
          <button class="btn" type="button" :disabled="parsingInvoice || isCreateInvoiceSubmitting" @click="triggerInvoiceFilesInput">{{ parsingInvoice ? 'Разбор файла...' : 'Прикрепить файл' }}</button>
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
          <span>4. От кого</span>
          <div ref="fromByUserLookupRef" class="lookup-wrap">
            <div class="input-with-icon">
              <input
                v-model="fromByUserQuery"
                class="form-input"
                type="text"
                placeholder="Поиск пользователя..."
                @focus="isFromByUserDropdownOpen = true"
                @input="() => { selectedFromByUserId = ''; isFromByUserDropdownOpen = true }"
              >
              <button class="field-icon-btn" type="button" @click="isFromByUserDropdownOpen = !isFromByUserDropdownOpen">
                <i class="fas fa-chevron-down"></i>
              </button>
            </div>
            <div v-if="isFromByUserDropdownOpen" class="lookup-list lookup-list-overlay">
              <div v-if="allUsersLoading" class="lookup-empty">Загрузка...</div>
              <div v-else-if="allUsersError" class="lookup-empty error">{{ allUsersError }}</div>
              <button
                v-for="item in filteredFromByUsers"
                :key="`u-${item.id}`"
                class="lookup-item"
                type="button"
                @click="selectFromByUser(item)"
              >
                {{ fullFio(item) }}
              </button>
              <div v-if="!allUsersLoading && !allUsersError && filteredFromByUsers.length === 0" class="lookup-empty">
                Ничего не найдено
              </div>
            </div>
          </div>
        </div>

        <div class="modal-field">
          <span>5. Укажите проект счёта</span>
          <!-- Note: step numbers shifted: 6=delivery, 7=prepayment, 8=deferment, 9=validity, 10=urgent -->
          <div ref="projectLookupRef" class="lookup-wrap">
            <div class="input-with-icon">
              <input
                v-model="projectQuery"
                class="form-input"
                type="text"
                placeholder="Поиск проекта или объекта..."
                @focus="isProjectDropdownOpen = true"
                @input="onProjectInput"
              >
              <button class="field-icon-btn" type="button" @click="isProjectDropdownOpen = !isProjectDropdownOpen">
                <i class="fas fa-chevron-down"></i>
              </button>
            </div>
            <div v-if="isProjectDropdownOpen" class="lookup-list lookup-list-overlay">
              <div v-if="projectObjectsLoading || objectsLoading" class="lookup-empty">Загрузка...</div>
              <div v-else-if="projectObjectsError && objectsError" class="lookup-empty error">{{ projectObjectsError || objectsError }}</div>
              <button
                v-for="item in filteredProjectObjects"
                :key="`${item.type}-${item.id}`"
                class="lookup-item"
                type="button"
                @click="selectProjectObject(item)"
              >
                <span v-if="item.type === 'object'" class="item-badge">Объект</span>
                <span v-else class="item-badge">Проект</span>
                {{ item.name }}
              </button>
              <div v-if="!projectObjectsLoading && !objectsLoading && filteredProjectObjects.length === 0" class="lookup-empty">
                Ничего не найдено
              </div>
            </div>
          </div>
        </div>

        <div class="modal-field">
          <span>6. Включена ли стоимость доставки?</span>
          <div class="option-row">
            <button class="option-btn" :class="{ active: deliveryIncluded === true }" type="button" @click="deliveryIncluded = true">Да</button>
            <button class="option-btn" :class="{ active: deliveryIncluded === false }" type="button" @click="deliveryIncluded = false">Нет</button>
          </div>
        </div>

        <div class="modal-field">
          <span>7. Требуется ли предоплата, %?</span>
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
          <span>8. Представлена ли отсрочка, дней?</span>
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
          <span>9. Срок действия счета, дней?</span>
          <input v-model="invoiceValidityDays" class="form-input" type="text" placeholder="Например: 10">
        </div>

        <div class="modal-field">
          <span>10. Срочный счет?</span>
          <div class="option-row">
            <button class="option-btn" :class="{ active: urgentInvoice === true }" type="button" @click="urgentInvoice = true">Да</button>
            <button class="option-btn" :class="{ active: urgentInvoice === false }" type="button" @click="urgentInvoice = false">Нет</button>
          </div>
        </div>

        <div class="modal-field">
          <span>11. Комментарий</span>
          <textarea
            v-model="createInvoiceComment"
            class="form-input modal-textarea"
            placeholder="Дополнительная информация по счету"
            rows="3"
          ></textarea>
        </div>

        <div v-if="createInvoiceError" class="lookup-empty error modal-error">{{ createInvoiceError }}</div>

        <div class="modal-actions">
          <button class="btn" type="button" :disabled="isCreateInvoiceSubmitting" @click="closeCreateInvoiceModal">Отменить</button>
          <button class="btn btn-primary" type="button" :disabled="parsingInvoice || isCreateInvoiceSubmitting" @click="submitCreateInvoice">
            {{ isCreateInvoiceSubmitting ? 'Создание...' : 'Создать' }}
          </button>
        </div>
      </div>
    </div>

    <ChatPanel v-if="chat.panelOpen" @close="handleCloseChat" />
  </div>
</template>

<style scoped>
.invoices-main {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.page-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.page-title {
  margin: 0;
  font-size: 24px;
  color: var(--text-primary);
}

.page-subtitle {
  margin: 4px 0 0;
  color: var(--text-tertiary);
}

.create-btn {
  border: 1px solid var(--brand-primary);
  background: var(--brand-primary);
  color: #fff;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  white-space: nowrap;
}

.create-btn:hover {
  filter: brightness(0.96);
}

.filters-panel {
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  box-shadow: var(--shadow-sm);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.filters-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(220px, 1fr));
  gap: 12px;
}

.filter-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.filter-input,
.filter-search,
.filter-select-btn {
  min-height: 38px;
  border-radius: 10px;
  border: 1px solid var(--border-light);
  background: #fff;
  font: inherit;
}

.filter-input,
.filter-search {
  padding: 0 10px;
}

.filter-select-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 12px;
  color: var(--text-primary);
  cursor: pointer;
}

.filter-dropdown {
  padding: 8px;
}

.filter-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 4px;
  font-size: 13px;
  color: var(--text-primary);
}

.filter-groups {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.check-group {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 14px;
  align-items: center;
}

.check-group-title {
  grid-column: 1 / -1;
  margin-bottom: 2px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary);
}

.check-option {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-primary);
}

.table-wrapper {
  background: var(--bg-surface);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-light);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

.table-scroll {
  overflow: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 11px;
}

colgroup col.col-check { width: 40px; }
colgroup col.col-id { width: 56px; }
colgroup col.col-invoice { width: 170px; }
colgroup col.col-sum { width: 125px; }
colgroup col.col-provider { width: 140px; }
colgroup col.col-payer { width: 140px; }
colgroup col.col-from-by { width: 130px; }
colgroup col.col-participants { width: 130px; }
colgroup col.col-approval { width: 150px; }
colgroup col.col-dates-pay { width: 145px; }
colgroup col.col-project { width: 210px; }
colgroup col.col-comment { width: 180px; }

.comment-cell {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.comment-text {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}

th,
td {
  border: 1px solid var(--border-light);
  padding: 8px;
  vertical-align: top;
}

.empty-row {
  text-align: center;
  color: var(--text-tertiary);
  padding: 18px 12px;
}

th {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--bg-subtle);
  text-transform: uppercase;
  letter-spacing: .4px;
  font-size: 11px;
  color: var(--text-secondary);
}

tbody tr:hover td {
  background: var(--bg-subtle);
}

.check-cell {
  position: relative;
  text-align: center;
}

.left-marker {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
}

.left-marker-solid {
  width: 100%;
  height: 100%;
}

.solid-row-new {
  background: #94a3b8;
}

.solid-row-work {
  background: var(--brand-primary);
}

.solid-row-wait {
  background: #f59e0b;
}

.solid-row-done {
  background: #10b981;
}

.id-link {
  color: var(--brand-primary);
  text-decoration: none;
  font-weight: 600;
  white-space: nowrap;
}

.name-link {
  color: var(--brand-primary);
  text-decoration: none;
}

.invoice-main {
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 6px;
  line-height: 1.35;
}

.urgent-dot {
  margin-right: 4px;
  font-size: 13px;
}

.chat-icon-btn {
  border: none;
  background: transparent;
  color: #94a3b8;
  font-size: 14px;
  cursor: pointer;
  padding: 2px 6px;
  display: inline-flex;
  align-items: center;
  margin-top: 4px;
  position: relative;
}

.chat-icon-wrap {
  position: relative;
  display: inline-flex;
}

.chat-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.chat-badge.badge-blue {
  background: #3b82f6;
}

.chat-badge.badge-red {
  background: #ef4444;
}

.chat-icon-btn:hover {
  color: #3b82f6;
}

.sum-cell {
  color: var(--text-primary);
}

.sum-lines {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
}

.sum-row {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

.sum-row span {
  color: var(--text-tertiary);
  font-size: 11px;
}

.sum-value {
  font-size: 12px;
  color: var(--text-primary);
  font-weight: 400;
}

.payment-progress {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.payment-track {
  width: 100%;
  height: 8px;
  border-radius: 999px;
  background: var(--bg-subtle);
  overflow: hidden;
}

.payment-fill {
  height: 100%;
  background: #22c55e;
  border-radius: 999px;
}

.payment-caption {
  font-size: 11px;
  color: var(--text-tertiary);
}

.user-row,
.project-line,
.request-line {
  line-height: 1.35;
  margin-bottom: 4px;
}

.entity-label {
  color: var(--text-tertiary);
  font-size: 11px;
  margin-bottom: 2px;
}

.user-icon {
  color: var(--text-tertiary);
  width: 14px;
  margin-right: 4px;
}

.status-pill {
  margin-bottom: 6px;
  border-radius: 999px;
  padding: 4px 8px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
}

.st-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: currentColor;
}

.st-green { background: #dcfce7; color: #166534; }
.st-red { background: #fee2e2; color: #991b1b; }
.st-amber { background: #fef3c7; color: #92400e; }

.request-line {
  color: var(--text-secondary);
}

.empty {
  color: var(--text-tertiary);
}

.dates-pay-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  line-height: 1.35;
  margin-bottom: 3px;
  color: var(--text-primary);
}

.dates-pay-row:last-child {
  margin-bottom: 0;
}

.dates-pay-row span {
  color: var(--text-tertiary);
}

.dates-pay-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dates-pay-line {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  max-width: 100%;
  line-height: 1.35;
  color: var(--text-primary);
  white-space: normal;
  word-break: break-word;
  border-radius: 6px;
  padding: 4px 6px;
}

.dates-pay-line.pay-paid {
  background: #dcfce7;
  color: #166534;
}

.dates-pay-line.pay-planned {
  background: #e5e7eb;
  color: #334155;
}

tr:hover td {
  background: var(--bg-subtle);
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
  background: rgba(15, 23, 42, 0.45);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.modal-card {
  width: min(760px, 100%);
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: 20px;
}

.invoice-modal {
  max-height: calc(100vh - 40px);
  overflow: auto;
}

.modal-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
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

.btn {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  padding: 8px 12px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  font-weight: 600;
  cursor: pointer;
}

.btn:hover {
  border-color: var(--brand-primary);
  color: var(--brand-primary);
}

.btn-primary {
  border-color: var(--brand-primary);
  background: var(--brand-primary);
  color: #fff;
}

.btn-primary:hover {
  color: #fff;
  filter: brightness(0.96);
}

.hidden-input {
  display: none;
}

.picked-files {
  margin-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.picked-file {
  font-size: 12px;
  color: var(--text-secondary);
}

.option-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.option-btn {
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  color: var(--text-secondary);
  padding: 7px 12px;
  font-size: 12px;
  cursor: pointer;
}

.option-btn.active {
  border-color: var(--brand-primary);
  color: var(--brand-primary);
  background: var(--brand-soft);
}

.option-input-row {
  align-items: center;
}

.short-input {
  max-width: 130px;
}

@media (max-width: 1100px) {
  .filters-grid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 860px) {
  .page-head {
    flex-direction: column;
    align-items: stretch;
  }

  .filters-grid {
    grid-template-columns: 1fr;
  }

  .filter-groups {
    flex-direction: column;
  }
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

.item-badge {
  display: inline-block;
  padding: 1px 6px;
  margin-right: 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  background: #e8e8e8;
  color: #666;
}
</style>
