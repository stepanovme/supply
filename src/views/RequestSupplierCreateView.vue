<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TopNav from '../components/layout/TopNav.vue'
import { mainNavLinks } from '../constants/mainNav'
import { useAuthStore } from '../stores/auth'
import { buildRequestSupplierEmailHtml } from '../helpers/requestSupplierEmailTemplate'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const navLinks = mainNavLinks
const SENT_STATUS_ID = '5ce7f285-5e9c-11f1-9492-bc241127d0bd'

const loading = ref(false)
const loadError = ref('')
const saveError = ref('')
const sendError = ref('')
const sendSuccess = ref('')
const previewError = ref('')
const sending = ref(false)
const previewing = ref(false)
const locked = ref(false)

const sourceRequest = ref(null)
const requestSupplierId = ref(String(route.params.supplierId || ''))
const requestId = computed(() => String(route.params.requestId || sourceRequest.value?.id || ''))

const requestObjects = ref([])
const warehouses = ref([])
const counterparties = ref([])
const persons = ref([])
const smtpOptions = ref([])
const smtpLoading = ref(false)
const objectLevelCache = new Map()

const payerQuery = ref('')
const consigneeQuery = ref('')
const projectQuery = ref('')
const deliveryToQuery = ref('')
const senderQuery = ref('')
const recipientQuery = ref('')

const payerOpen = ref(false)
const consigneeOpen = ref(false)
const projectOpen = ref(false)
const deliveryToOpen = ref(false)
const senderOpen = ref(false)
const recipientOpen = ref(false)

const selectedPayer = ref(null)
const selectedConsignee = ref(null)
const selectedProject = ref(null)
const selectedDeliveryTo = ref(null)

const deliveryRequired = ref(true)
const deliveryDate = ref('')
const paymentDelayDays = ref('')
const deadline = ref('')
const commentRequest = ref('')
const commentSupplier = ref('')
const requestStatusId = ref('')
const sentAt = ref('')
const sentBy = ref('')

const itemRows = ref([])
const senderRows = ref([])
const recipientRows = ref([])
const fileRows = ref([])
const fileInputRef = ref(null)
const deliveryDatePickerRef = ref(null)
const deliveryDateDisplay = ref('')

const normalizeArray = (payload) => {
  if (Array.isArray(payload)) return payload
  return payload?.items || payload?.data || payload?.results || []
}

const normalizeSingleOrArray = (payload) => {
  if (Array.isArray(payload)) return payload
  if (payload && typeof payload === 'object' && (payload.id || payload.email || payload.user_id)) return [payload]
  return normalizeArray(payload)
}

const normalizeText = (value) => String(value ?? '').trim()

const generateLinkCode = (length = 10) => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const chars = []
  const cryptoObject = globalThis.crypto || globalThis.msCrypto
  if (cryptoObject?.getRandomValues) {
    const buffer = new Uint32Array(length)
    cryptoObject.getRandomValues(buffer)
    for (let i = 0; i < length; i += 1) {
      chars.push(alphabet[buffer[i] % alphabet.length])
    }
    return chars.join('')
  }
  for (let i = 0; i < length; i += 1) {
    chars.push(alphabet[Math.floor(Math.random() * alphabet.length)])
  }
  return chars.join('')
}

const toDateInput = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

const toDateTimeInput = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 16)
}

const formatDateDisplay = (value) => {
  if (!value) return ''
  const text = normalizeText(value)
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(text)) return text
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split('-')
    return `${day}.${month}.${year}`
  }
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return text
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  return `${day}.${month}.${year}`
}

const parseDeliveryDateInput = (value) => {
  const text = normalizeText(value)
  if (!text) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(text)) {
    const [day, month, year] = text.split('.')
    return `${year}-${month}-${day}`
  }
  const digits = text.replace(/\D/g, '')
  if (digits.length === 8) {
    const day = digits.slice(0, 2)
    const month = digits.slice(2, 4)
    const year = digits.slice(4, 8)
    return `${year}-${month}-${day}`
  }
  return text
}

const formatDateTime = (value) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return normalizeText(value) || '—'
  return date.toLocaleString('ru-RU')
}

const readResponseError = async (response, fallbackMessage) => {
  if (!response) return fallbackMessage
  try {
    const contentType = response.headers?.get?.('content-type') || ''
    if (contentType.includes('application/json')) {
      const json = await response.json()
      return normalizeText(json?.message || json?.detail || json?.error || JSON.stringify(json)) || fallbackMessage
    }
    const text = normalizeText(await response.text())
    return text || fallbackMessage
  } catch (_) {
    return fallbackMessage
  }
}

const buildPlaceLabel = (item) => {
  const name = normalizeText(item?.name || item?.short_name || item?.full_name)
  const address = normalizeText(item?.address || item?.full_address || item?.location)
  if (!name && !address) return ''
  if (!address) return name
  if (!name) return address
  return `${name} — ${address}`
}

const buildDeliveryAddress = (item) => normalizeText(item?.address || item?.full_address || item?.location || '')

const normalizeObjectLevel = (item) => ({
  id: String(item?.id || item?.level_id || item?.object_level_id || ''),
  name: normalizeText(
    item?.name
    || item?.object?.short_name
    || item?.object?.full_name
    || item?.short_name
    || item?.full_name
    || item?.title
    || ''
  ),
  address: normalizeText(
    item?.address
    || item?.object?.address
    || item?.full_address
    || item?.object?.full_address
    || item?.location
    || item?.object?.location
    || ''
  ),
})

const loadObjectLevelDetails = async (levelId) => {
  const id = String(levelId || '').trim()
  if (!id) return null
  if (objectLevelCache.has(id)) return objectLevelCache.get(id)
  try {
    const res = await fetch(`/apiref/ref/objects/object-levels/${encodeURIComponent(id)}`, { credentials: 'include' })
    if (!res.ok) return null
    const data = normalizeObjectLevel(await res.json())
    if (data?.id) {
      objectLevelCache.set(id, data)
      return data
    }
  } catch (_) {
    return null
  }
  return null
}

const buildCounterpartyLabel = (item) => normalizeText(item?.name || item?.short_name || item?.full_name)

const buildCounterpartySearchText = (item) => normalizeText([
  item?.short_name,
  item?.name,
  item?.full_name,
  item?.inn,
  item?.kpp,
  item?.email,
  item?.phone,
  item?.phone_work,
  item?.address,
].filter(Boolean).join(' ')).toLowerCase()

const buildPersonLabel = (item) => {
  const fio = normalizeText(
    item?.full_name
    || [item?.last_name, item?.name, item?.middle_name].filter(Boolean).join(' ')
  )
  const email = normalizeText(item?.email_work || item?.email || item?.email_personal)
  const company = normalizeText(
    item?.companies?.[0]?.company_name
    || item?.company_name
    || item?.counterparty_name
  )
  if (!fio && !email && !company) return ''
  const parts = [fio]
  if (email) parts.push(email)
  if (company) parts.push(`(${company})`)
  return parts.join(' ')
}

const buildSmtpLabel = (item) => {
  return normalizeText(item?.email)
}

const filteredCounterparties = computed(() => {
  const q = normalizeText(payerQuery.value).toLowerCase()
  if (!q) return counterparties.value
  return counterparties.value.filter((item) => buildCounterpartySearchText(item).includes(q))
})

const filteredConsignees = computed(() => {
  const q = normalizeText(consigneeQuery.value).toLowerCase()
  if (!q) return counterparties.value
  return counterparties.value.filter((item) => buildCounterpartySearchText(item).includes(q))
})

const filteredProjects = computed(() => {
  const q = normalizeText(projectQuery.value).toLowerCase()
  if (!q) return requestObjects.value
  return requestObjects.value.filter((item) => buildPlaceLabel(item).toLowerCase().includes(q))
})

const filteredDeliveryPlaces = computed(() => {
  const q = normalizeText(deliveryToQuery.value).toLowerCase()
  if (!q) return [
    ...requestObjects.value.map((item) => ({ ...item, kind: 'project' })),
    ...warehouses.value.map((item) => ({ ...item, kind: 'warehouse' })),
  ]
  const source = [
    ...requestObjects.value.map((item) => ({ ...item, kind: 'project' })),
    ...warehouses.value.map((item) => ({ ...item, kind: 'warehouse' })),
  ]
  return source.filter((item) => buildPlaceLabel(item).toLowerCase().includes(q))
})

const filteredSmtp = computed(() => {
  const q = normalizeText(senderQuery.value).toLowerCase()
  if (!q) return smtpOptions.value
  return smtpOptions.value.filter((item) => buildSmtpLabel(item).toLowerCase().includes(q))
})

const filteredPersons = computed(() => {
  const q = normalizeText(recipientQuery.value).toLowerCase()
  if (!q) return persons.value
  return persons.value.filter((item) => buildPersonLabel(item).toLowerCase().includes(q))
})

const selectedItemIds = computed(() => {
  const raw = String(route.query.items || '').trim()
  if (!raw) return []
  return raw.split(',').map((item) => item.trim()).filter(Boolean)
})

const canSend = computed(() => Boolean(requestId.value && itemRows.value.length && !sending.value))

const currentUserId = computed(() => String(auth.user?.id || auth.user?.user_id || ''))

const closeDropdowns = (event) => {
  const target = event.target
  if (!(target instanceof Node)) return
  const lookupSelectors = [
    ['payerOpen', '.payer-lookup'],
    ['consigneeOpen', '.consignee-lookup'],
    ['projectOpen', '.project-lookup'],
    ['deliveryToOpen', '.delivery-to-lookup'],
    ['senderOpen', '.sender-lookup'],
    ['recipientOpen', '.recipient-lookup'],
  ]
  lookupSelectors.forEach(([key, selector]) => {
    const el = document.querySelector(selector)
    if (!el || !el.contains(target)) {
      if (key === 'payerOpen') payerOpen.value = false
      if (key === 'consigneeOpen') consigneeOpen.value = false
      if (key === 'projectOpen') projectOpen.value = false
      if (key === 'deliveryToOpen') deliveryToOpen.value = false
      if (key === 'senderOpen') senderOpen.value = false
      if (key === 'recipientOpen') recipientOpen.value = false
    }
  })
}

const loadData = async () => {
  loading.value = true
  loadError.value = ''
  try {
    const requestIdValue = String(route.params.requestId || '')
    const supplierIdValue = String(route.params.supplierId || '')
    if (!requestIdValue) throw new Error('missing request id')

    const [sourceRes, objectsRes, warehousesRes, counterpartiesRes, personsRes, smtpRes, supplierRes, supplierItemsRes, supplierSendersRes, supplierRecipientsRes, supplierFilesRes] = await Promise.all([
      fetch(`/apisup/supply/requests/my/${encodeURIComponent(requestIdValue)}`, { credentials: 'include' }),
      fetch('/apisup/supply/request-objects/my', { credentials: 'include' }),
      fetch('/apisup/supply/warehouses', { credentials: 'include' }),
      fetch('/apiref/ref/counterparties', { credentials: 'include' }),
      fetch('/apiref/ref/persons', { credentials: 'include' }),
      currentUserId.value
        ? fetch(`/apisup/supply/smtp/by-user/${encodeURIComponent(currentUserId.value)}`, { credentials: 'include' }).catch(() => null)
        : Promise.resolve(null),
      supplierIdValue
        ? fetch(`/apisup/supply/request-suppliers/${encodeURIComponent(supplierIdValue)}`, { credentials: 'include' })
        : Promise.resolve(null),
      supplierIdValue
        ? fetch(`/apisup/supply/request-suppliers/${encodeURIComponent(supplierIdValue)}/items`, { credentials: 'include' })
        : Promise.resolve(null),
      supplierIdValue
        ? fetch(`/apisup/supply/request-suppliers/${encodeURIComponent(supplierIdValue)}/email-senders`, { credentials: 'include' })
        : Promise.resolve(null),
      supplierIdValue
        ? fetch(`/apisup/supply/request-suppliers/${encodeURIComponent(supplierIdValue)}/recipients`, { credentials: 'include' })
        : Promise.resolve(null),
      supplierIdValue
        ? fetch(`/apisup/supply/request-suppliers/${encodeURIComponent(supplierIdValue)}/files`, { credentials: 'include' })
        : Promise.resolve(null),
    ])

    if (!sourceRes.ok) throw new Error('request load failed')
    sourceRequest.value = await sourceRes.json()

    requestObjects.value = objectsRes?.ok
      ? normalizeArray(await objectsRes.json()).map((item) => normalizeObjectLevel(item)).filter((item) => item.id && item.name)
      : []

    await Promise.all(
      requestObjects.value.map(async (item) => {
        const details = await loadObjectLevelDetails(item.id)
        if (details?.address) {
          item.address = details.address
        }
      })
    )

    warehouses.value = warehousesRes?.ok
      ? normalizeArray(await warehousesRes.json()).map((item) => ({
        id: String(item?.id || ''),
        name: normalizeText(item?.name || item?.short_name || ''),
        address: normalizeText(item?.address || item?.full_address || item?.location || ''),
        kind: 'warehouse',
      })).filter((item) => item.id && item.name)
      : []

    counterparties.value = counterpartiesRes?.ok
      ? normalizeArray(await counterpartiesRes.json()).map((item) => ({
        id: String(item?.id || item?.counterparty_id || item?.uuid || ''),
        name: normalizeText(item?.short_name || item?.name || item?.full_name),
        short_name: normalizeText(item?.short_name || ''),
        full_name: normalizeText(item?.full_name || item?.name || ''),
        inn: normalizeText(item?.inn || ''),
        kpp: normalizeText(item?.kpp || ''),
        email: normalizeText(item?.email || item?.email_work || ''),
        phone: normalizeText(item?.phone || item?.phone_work || ''),
        address: normalizeText(item?.address || item?.full_address || ''),
      })).filter((item) => item.id && item.name)
      : []

    persons.value = personsRes?.ok
      ? normalizeArray(await personsRes.json()).map((item) => ({
        id: String(item?.id || item?.person_id || ''),
        full_name: normalizeText(item?.full_name || [item?.last_name, item?.name, item?.middle_name].filter(Boolean).join(' ')),
        last_name: item?.last_name || '',
        name: item?.name || '',
        middle_name: item?.middle_name || '',
        email: normalizeText(item?.email_work || item?.email || item?.email_personal),
        company_name: normalizeText(item?.companies?.[0]?.company_name || item?.counterparty_name || ''),
        companies: Array.isArray(item?.companies) ? item.companies : [],
      })).filter((item) => item.id && item.full_name)
      : []

    smtpOptions.value = smtpRes?.ok ? normalizeSingleOrArray(await smtpRes.json()).map((item) => ({
      id: String(item?.id || item?.smtp_id || ''),
      email: normalizeText(item?.email || ''),
      port: Number(item?.port || 0),
      security: normalizeText(item?.security || 'none'),
    })).filter((item) => item.id && item.email) : []

    const supplierJson = supplierRes?.ok ? await supplierRes.json() : null
    const supplierItems = supplierItemsRes?.ok ? normalizeArray(await supplierItemsRes.json()) : []
    const supplierSenders = supplierSendersRes?.ok ? normalizeArray(await supplierSendersRes.json()) : []
    const supplierRecipients = supplierRecipientsRes?.ok ? normalizeArray(await supplierRecipientsRes.json()) : []
    const supplierFiles = supplierFilesRes?.ok ? normalizeArray(await supplierFilesRes.json()) : []

    requestSupplierId.value = String(supplierJson?.id || supplierJson?.request_supplier_id || supplierIdValue || '')

    const sourceItems = normalizeArray(sourceRequest.value?.items)
    const selected = selectedItemIds.value.length
      ? sourceItems.filter((item) => {
        const key = String(item?.id || item?.item_id || item?.num || '')
        return selectedItemIds.value.includes(key)
      })
      : sourceItems

    itemRows.value = supplierItems.length
      ? supplierItems.map((item, idx) => ({
        id: String(item?.id || item?.item_id || item?.row_id || idx + 1),
        name: normalizeText(item?.name || item?.nomenclature?.name || ''),
        unit_name: normalizeText(item?.unit_name || item?.unit?.name || item?.nomenclature?.unit?.name || ''),
        quantity: String(item?.quantity ?? ''),
        comment: normalizeText(item?.comment || ''),
      }))
      : selected.map((item, idx) => ({
        id: String(item?.id || item?.item_id || item?.num || idx + 1),
        name: normalizeText(item?.name || item?.nomenclature?.name || ''),
        unit_name: normalizeText(item?.unit?.name || item?.nomenclature?.unit?.name || ''),
        quantity: String(item?.quantity ?? ''),
        comment: normalizeText(item?.comment || ''),
      }))

    selectedProject.value =
      requestObjects.value.find((item) => String(item.id) === String(supplierJson?.project_levels_id || sourceRequest.value?.object_levels_id || ''))
      || ((supplierJson?.project_levels_id || sourceRequest.value?.object_levels_id)
        ? {
            id: String(supplierJson?.project_levels_id || sourceRequest.value?.object_levels_id || ''),
            name: normalizeText(supplierJson?.project_name || sourceRequest.value?.project_name || 'Проект'),
            address: '',
            kind: 'project',
          }
        : null)

    if (selectedProject.value?.id && !selectedProject.value.address) {
      const projectDetails = await loadObjectLevelDetails(selectedProject.value.id)
      if (projectDetails?.address) {
        selectedProject.value = {
          ...selectedProject.value,
          ...projectDetails,
          kind: 'project',
        }
      }
    }
    projectQuery.value = selectedProject.value?.name || normalizeText(supplierJson?.project_name || sourceRequest.value?.project_name || '')

    const sourceDeliveryTo = normalizeText(supplierJson?.delivery_to || sourceRequest.value?.delivery_to || selectedProject.value?.address || selectedProject.value?.name || '')
    selectedDeliveryTo.value =
      filteredDeliveryPlaces.value.find((item) => String(item.id) === sourceDeliveryTo)
      || filteredDeliveryPlaces.value.find((item) => buildPlaceLabel(item) === sourceDeliveryTo)
      || selectedProject.value
      || null
    deliveryToQuery.value = selectedDeliveryTo.value ? buildDeliveryAddress(selectedDeliveryTo.value) : sourceDeliveryTo

    const payerId = String(supplierJson?.payer_id || sourceRequest.value?.payer_id || '')
    const recipientId = String(supplierJson?.recipient_id || sourceRequest.value?.recipient_id || '')
    selectedPayer.value = counterparties.value.find((item) => item.id === payerId) || null
    selectedConsignee.value = counterparties.value.find((item) => item.id === recipientId) || null
    payerQuery.value = selectedPayer.value?.name || normalizeText(supplierJson?.payer_name || '')
    consigneeQuery.value = selectedConsignee.value?.name || normalizeText(supplierJson?.recipient_name || '')

    commentRequest.value = normalizeText(supplierJson?.comment_request ?? sourceRequest.value?.comment ?? '')
    commentSupplier.value = normalizeText(supplierJson?.comment_supplier ?? sourceRequest.value?.comment_supplier ?? '')
    deliveryRequired.value = supplierJson?.delivery_required ?? sourceRequest.value?.delivery_required !== false
    deliveryDate.value = toDateInput(supplierJson?.delivery_date || sourceRequest.value?.delivery_date || sourceRequest.value?.deadline || sourceRequest.value?.requested_delivery_date)
    deliveryDateDisplay.value = formatDateDisplay(deliveryDate.value)
    paymentDelayDays.value = String(supplierJson?.days_delay ?? sourceRequest.value?.days_delay ?? '')
    deadline.value = toDateTimeInput(supplierJson?.deadline || sourceRequest.value?.deadline)
    sentAt.value = String(supplierJson?.sent_at || sourceRequest.value?.sent_at || '')
    sentBy.value = String(supplierJson?.sent_by || sourceRequest.value?.sent_by || '')
    requestStatusId.value = String(supplierJson?.status?.id || supplierJson?.status_id || sourceRequest.value?.status?.id || '')

    senderRows.value = supplierSenders.map((item, idx) => ({
      id: String(item?.id || item?.row_id || idx + 1),
      smtp_id: String(item?.smtp_id || item?.id || ''),
      email: normalizeText(item?.email || ''),
    })).filter((item) => item.email)

    recipientRows.value = supplierRecipients.map((item, idx) => ({
      id: String(item?.id || item?.row_id || idx + 1),
      email: normalizeText(item?.email || ''),
      fio: normalizeText(item?.fio || ''),
      company_name: normalizeText(item?.company_name || ''),
    })).filter((item) => item.email)

    fileRows.value = supplierFiles.length
      ? supplierFiles.map((item, idx) => ({
        id: String(item?.id || item?.row_id || idx + 1),
        original_name: normalizeText(item?.original_name || item?.name || ''),
        storage_name: normalizeText(item?.storage_name || ''),
        file_path: normalizeText(item?.file_path || ''),
        uploaded_by: normalizeText(item?.uploaded_by || ''),
      })).filter((item) => item.id || item.original_name)
      : normalizeArray(sourceRequest.value?.files).map((item) => ({
        id: String(item?.id || item?.row_id || ''),
        original_name: normalizeText(item?.original_name || item?.name || ''),
        storage_name: normalizeText(item?.storage_name || ''),
        file_path: normalizeText(item?.file_path || ''),
        uploaded_by: normalizeText(item?.uploaded_by || ''),
      })).filter((item) => item.id || item.original_name)

    locked.value = String(supplierJson?.status?.id || supplierJson?.status_id || sourceRequest.value?.status?.id || '') === SENT_STATUS_ID || Boolean(supplierJson?.sent_at || sourceRequest.value?.sent_at)
  } catch (error) {
    loadError.value = normalizeText(error?.message) || 'Не удалось загрузить данные для запроса поставщику.'
  } finally {
    loading.value = false
  }
}

const selectPayer = (item) => {
  selectedPayer.value = item
  payerQuery.value = buildCounterpartyLabel(item) || ''
  payerOpen.value = false
}

const selectConsignee = (item) => {
  selectedConsignee.value = item
  consigneeQuery.value = buildCounterpartyLabel(item) || ''
  consigneeOpen.value = false
}

const selectProject = (item) => {
  const id = String(item?.id || '')
  const cached = objectLevelCache.get(id)
  selectedProject.value = cached ? { ...item, ...cached } : item
  projectQuery.value = selectedProject.value?.name || ''
  projectOpen.value = false
  if (!selectedDeliveryTo.value || String(selectedDeliveryTo.value?.kind || '') === 'project') {
    selectedDeliveryTo.value = selectedProject.value
    deliveryToQuery.value = buildDeliveryAddress(selectedProject.value)
  }
}

const selectDeliveryTo = (item) => {
  selectedDeliveryTo.value = item
  deliveryToQuery.value = buildDeliveryAddress(item)
  deliveryToOpen.value = false
}

const addSender = (item) => {
  if (!item?.id) return
  if (senderRows.value.some((row) => String(row.smtp_id) === String(item.id))) return
  senderRows.value.push({
    id: `tmp-sender-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    smtp_id: String(item.id),
    email: item.email,
  })
  senderQuery.value = ''
  senderOpen.value = false
}

const removeSender = (id) => {
  senderRows.value = senderRows.value.filter((row) => row.id !== id)
}

const addRecipient = (item) => {
  const email = normalizeText(item?.email || '')
  if (!email) return
  if (recipientRows.value.some((row) => String(row.email || '').toLowerCase() === email.toLowerCase())) return
  recipientRows.value.push({
    id: `tmp-rec-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    email,
    fio: normalizeText(item?.full_name || buildPersonLabel(item) || ''),
    company_name: normalizeText(item?.company_name || item?.companies?.[0]?.company_name || ''),
  })
  recipientQuery.value = ''
  recipientOpen.value = false
}

const addRecipientByEmail = () => {
  const email = normalizeText(recipientQuery.value)
  if (!email) return
  if (recipientRows.value.some((row) => String(row.email || '').toLowerCase() === email.toLowerCase())) return
  recipientRows.value.push({
    id: `tmp-rec-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    email,
    fio: '',
    company_name: '',
  })
  recipientQuery.value = ''
  recipientOpen.value = false
}

const removeRecipient = (id) => {
  recipientRows.value = recipientRows.value.filter((row) => row.id !== id)
}

const removeItemRow = (id) => {
  itemRows.value = itemRows.value.filter((row) => row.id !== id)
}

const addSelectedFile = (event) => {
  const files = Array.from(event.target.files || [])
  event.target.value = ''
  files.forEach((file) => {
    fileRows.value.push({
      id: `tmp-file-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      original_name: file.name,
      file,
    })
  })
}

const openFilePicker = () => {
  fileInputRef.value?.click()
}

const openDeliveryDatePicker = () => {
  const el = deliveryDatePickerRef.value
  if (!el) return
  if (typeof el.showPicker === 'function') {
    el.showPicker()
    return
  }
  el.click()
}

const removeFileRow = (id) => {
  fileRows.value = fileRows.value.filter((row) => row.id !== id)
}

const buildPreviewPayload = () => ({
  requestNumber: requestId.value,
  requestDate: sourceRequest.value?.created_at || sourceRequest.value?.createdAt || sourceRequest.value?.date || '',
  projectName: selectedProject.value?.name || sourceRequest.value?.project_name || sourceRequest.value?.projectName || '',
  payerName: selectedPayer.value?.name || '',
  recipientName: selectedConsignee.value?.name || '',
  deliveryRequired: deliveryRequired.value,
  deliveryDate: deliveryDate.value,
  deadline: deadline.value,
  daysDelay: paymentDelayDays.value,
  deliveryTo: buildPlaceLabel(selectedDeliveryTo.value),
  commentRequest: commentRequest.value,
  commentSupplier: commentSupplier.value,
  senderEmail: senderRows.value[0]?.email || '',
  recipients: recipientRows.value,
  items: itemRows.value,
})

const setDeliveryDateValue = (value) => {
  const parsed = parseDeliveryDateInput(value)
  deliveryDate.value = parsed
  deliveryDateDisplay.value = formatDateDisplay(parsed || value)
}

const onDeliveryDateInput = (value) => {
  const text = normalizeText(value)
  deliveryDateDisplay.value = text
  const parsed = parseDeliveryDateInput(text)
  if (/^\d{4}-\d{2}-\d{2}$/.test(parsed)) {
    deliveryDate.value = parsed
    deliveryDateDisplay.value = formatDateDisplay(parsed)
  } else if (!text) {
    deliveryDate.value = ''
  }
}

const onDeliveryDateBlur = () => {
  deliveryDateDisplay.value = formatDateDisplay(deliveryDate.value || deliveryDateDisplay.value)
}

const openEmailPreview = () => {
  previewError.value = ''
  previewing.value = true
  try {
    const html = buildRequestSupplierEmailHtml(buildPreviewPayload())
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const previewUrl = URL.createObjectURL(blob)
    const previewWindow = window.open(previewUrl, '_blank', 'noopener,noreferrer')
    if (!previewWindow) {
      URL.revokeObjectURL(previewUrl)
      throw new Error('Не удалось открыть окно предпросмотра. Разрешите всплывающие окна.')
    }
    previewWindow.focus()
    setTimeout(() => URL.revokeObjectURL(previewUrl), 1000)
  } catch (error) {
    previewError.value = normalizeText(error?.message) || 'Не удалось открыть предпросмотр письма.'
  } finally {
    previewing.value = false
  }
}

const buildRequestSupplierCreatePayload = () => ({
  request_id: Number(requestId.value) || requestId.value,
  delivery_date: deliveryDate.value || null,
  project_levels_id: String(selectedProject.value?.id || ''),
  delivery_to: String(selectedDeliveryTo.value?.id || ''),
  delivery_to_type: String(selectedDeliveryTo.value?.kind || 'project'),
  comment_request: commentRequest.value || '',
  status_id: requestStatusId.value || String(sourceRequest.value?.status?.id || ''),
})

const buildSupplierUpdatePayload = () => ({
  request_id: Number(requestId.value) || requestId.value,
  payer_id: selectedPayer.value?.id || '',
  recipient_id: selectedConsignee.value?.id || '',
  delivery_required: Boolean(deliveryRequired.value),
  delivery_date: deliveryDate.value || null,
  days_delay: paymentDelayDays.value ? Number(paymentDelayDays.value) : 0,
  deadline: deadline.value ? new Date(deadline.value).toISOString() : null,
  project_levels_id: String(selectedProject.value?.id || ''),
  delivery_to: String(selectedDeliveryTo.value?.id || ''),
  delivery_to_type: String(selectedDeliveryTo.value?.kind || 'project'),
  comment_request: commentRequest.value || '',
  comment_supplier: commentSupplier.value || '',
  sent_at: sentAt.value || null,
  sent_by: sentBy.value || currentUserId.value || '',
  status_id: requestStatusId.value || SENT_STATUS_ID,
})

const parseCreatedSupplierId = async (response) => {
  if (!response) return ''
  try {
    const contentType = response.headers?.get?.('content-type') || ''
    if (contentType.includes('application/json')) {
      const json = await response.json()
      return String(json?.id || json?.request_supplier_id || json?.data?.id || '')
    }
    const text = normalizeText(await response.text())
    return text
  } catch (_) {
    return ''
  }
}

const removeBackendRows = async (supplierIdValue, endpoint) => {
  const res = await fetch(`/apisup/supply/request-suppliers/${encodeURIComponent(supplierIdValue)}/${endpoint}`, {
    credentials: 'include',
  })
  if (!res.ok) return
  const rows = normalizeArray(await res.json())
  for (const row of rows) {
    const rowId = String(row?.id || row?.row_id || '')
    if (!rowId) continue
    // eslint-disable-next-line no-await-in-loop
    const deleteRes = await fetch(`/apisup/supply/request-suppliers/${encodeURIComponent(supplierIdValue)}/${endpoint}/${encodeURIComponent(rowId)}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    if (!deleteRes.ok) {
      throw new Error(`failed to delete ${endpoint}`)
    }
  }
}

const saveItemRows = async (supplierIdValue, replaceExisting = false) => {
  if (replaceExisting) {
    await removeBackendRows(supplierIdValue, 'items')
  }
  for (const row of itemRows.value) {
    const payload = {
      name: normalizeText(row.name),
      unit_name: normalizeText(row.unit_name),
      quantity: Number(String(row.quantity || '0').replace(',', '.')) || 0,
      comment: normalizeText(row.comment),
    }
    // eslint-disable-next-line no-await-in-loop
    const res = await fetch(`/apisup/supply/request-suppliers/${encodeURIComponent(supplierIdValue)}/items`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error(await readResponseError(res, 'supplier item save failed'))
  }
}

const saveSenderRows = async (supplierIdValue, replaceExisting = false) => {
  if (replaceExisting) {
    await removeBackendRows(supplierIdValue, 'email-senders')
  }
  for (const row of senderRows.value) {
    // eslint-disable-next-line no-await-in-loop
    const res = await fetch(`/apisup/supply/request-suppliers/${encodeURIComponent(supplierIdValue)}/email-senders`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        smtp_id: row.smtp_id,
        email: row.email,
      }),
    })
    if (!res.ok) throw new Error(await readResponseError(res, 'sender save failed'))
  }
}

const saveRecipientRows = async (supplierIdValue, replaceExisting = false) => {
  if (replaceExisting) {
    await removeBackendRows(supplierIdValue, 'recipients')
  }
  for (const row of recipientRows.value) {
    // eslint-disable-next-line no-await-in-loop
    const res = await fetch(`/apisup/supply/request-suppliers/${encodeURIComponent(supplierIdValue)}/recipients`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: row.email,
        fio: row.fio || '',
        company_name: row.company_name || '',
      }),
    })
    if (!res.ok) throw new Error(await readResponseError(res, 'recipient save failed'))
  }
}

const createRecipientLinks = async (supplierIdValue) => {
  const recipientsRes = await fetch(`/apisup/supply/request-suppliers/${encodeURIComponent(supplierIdValue)}/recipients`, {
    credentials: 'include',
  })
  if (!recipientsRes.ok) throw new Error(await readResponseError(recipientsRes, 'recipient load failed'))
  const savedRecipients = normalizeArray(await recipientsRes.json())
  const recipientByEmail = new Map(
    savedRecipients
      .map((item) => ({
        id: String(item?.id || item?.row_id || ''),
        email: normalizeText(item?.email || '').toLowerCase(),
      }))
      .filter((item) => item.id && item.email)
      .map((item) => [item.email, item.id])
  )

  for (const row of recipientRows.value) {
    const recipientId = recipientByEmail.get(normalizeText(row.email).toLowerCase())
    if (!recipientId) continue
    // eslint-disable-next-line no-await-in-loop
    const linkRes = await fetch(`/apisup/supply/request-suppliers/${encodeURIComponent(supplierIdValue)}/links`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request_supplier_recipient_id: recipientId,
        code: generateLinkCode(10),
        status: 'active',
      }),
    })
    if (!linkRes.ok) throw new Error(await readResponseError(linkRes, 'link create failed'))
  }
}

const submitSupplierRequest = async () => {
  if (!requestId.value) {
    sendError.value = 'Не указан запрос-источник.'
    return
  }
  if (!itemRows.value.length) {
    sendError.value = 'Добавьте хотя бы одну позицию.'
    return
  }
  if (!selectedPayer.value) {
    sendError.value = 'Выберите плательщика.'
    return
  }
  if (!selectedConsignee.value) {
    sendError.value = 'Выберите грузополучателя.'
    return
  }
  if (!selectedProject.value) {
    sendError.value = 'Выберите проект.'
    return
  }
  if (!selectedDeliveryTo.value) {
    sendError.value = 'Выберите адрес доставки.'
    return
  }
  if (!senderRows.value.length) {
    sendError.value = 'Добавьте хотя бы одну почту отправителя.'
    return
  }
  if (!recipientRows.value.length) {
    sendError.value = 'Добавьте хотя бы одного поставщика.'
    return
  }

  sending.value = true
  sendError.value = ''
  saveError.value = ''
  const existingSupplierBeforeSave = Boolean(requestSupplierId.value)
  try {
    const createPayload = buildRequestSupplierCreatePayload()
    const updatePayload = buildSupplierUpdatePayload()

    let supplierKey = String(requestSupplierId.value || '')
    if (!supplierKey) {
      const supplierRes = await fetch('/apisup/supply/request-suppliers', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createPayload),
      })
      if (!supplierRes.ok) {
        throw new Error(await readResponseError(supplierRes, 'supplier create failed'))
      }
      supplierKey = await parseCreatedSupplierId(supplierRes)
      if (!supplierKey) {
        throw new Error('supplier id missing')
      }
      requestSupplierId.value = supplierKey
      await router.replace({
        name: 'request-supplier-create',
        params: {
          requestId: requestId.value,
          supplierId: supplierKey,
        },
        query: selectedItemIds.value.length ? { items: selectedItemIds.value.join(',') } : {},
      })
    } else {
      const supplierRes = await fetch(`/apisup/supply/request-suppliers/${encodeURIComponent(supplierKey)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload),
      })
      if (!supplierRes.ok) {
        throw new Error(await readResponseError(supplierRes, 'supplier save failed'))
      }
    }

    await saveItemRows(supplierKey, existingSupplierBeforeSave)
    await saveSenderRows(supplierKey, existingSupplierBeforeSave)
    await saveRecipientRows(supplierKey, existingSupplierBeforeSave)
    await createRecipientLinks(supplierKey)

    const sendRes = await fetch(`/apisup/supply/request-suppliers/${encodeURIComponent(supplierKey)}/send`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    })
    if (!sendRes.ok) throw new Error(await readResponseError(sendRes, 'supplier send failed'))

    const sentAtValue = new Date().toISOString()
    const patchRes = await fetch(`/apisup/supply/request-suppliers/${encodeURIComponent(supplierKey)}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...updatePayload,
        status_id: SENT_STATUS_ID,
        sent_at: sentAtValue,
        sent_by: currentUserId.value,
      }),
    })
    if (!patchRes.ok) throw new Error(await readResponseError(patchRes, 'supplier final patch failed'))

    requestStatusId.value = SENT_STATUS_ID
    sentAt.value = sentAtValue
    sentBy.value = currentUserId.value
    locked.value = true
    sendSuccess.value = 'Запрос отправлен, письмо поставщикам направлено и статус переведён в финальный.'
    setTimeout(() => {
      sendSuccess.value = ''
    }, 3000)
  } catch (error) {
    saveError.value = normalizeText(error?.message) || 'Не удалось отправить запрос поставщику.'
  } finally {
    sending.value = false
  }
}

const openBack = () => {
  router.back()
}

const handleOutsideClick = (event) => {
  const target = event.target
  if (!(target instanceof Node)) return
  const selectors = [
    [payerOpen, '.payer-lookup'],
    [consigneeOpen, '.consignee-lookup'],
    [projectOpen, '.project-lookup'],
    [deliveryToOpen, '.delivery-to-lookup'],
    [senderOpen, '.sender-lookup'],
    [recipientOpen, '.recipient-lookup'],
  ]
  selectors.forEach(([stateRef, selector]) => {
    const el = document.querySelector(selector)
    if (!el || !el.contains(target)) stateRef.value = false
  })
}

onMounted(() => {
  loadData()
  window.addEventListener('mousedown', handleOutsideClick)
})

onBeforeUnmount(() => {
  window.removeEventListener('mousedown', handleOutsideClick)
})
</script>

<template>
  <div class="page">
    <TopNav :links="navLinks" />
    <main class="main-content">
      <header class="page-head">
        <button type="button" class="back-btn" @click="openBack">
          <i class="fas fa-arrow-left"></i>
          Вернуться
        </button>
        <div class="page-head-content">
          <div class="title-line">
            <h1 class="page-title">Запрос поставщику к заявке</h1>
            <RouterLink class="request-link" :to="{ name: 'request-detail', params: { requestId } }">
              №{{ requestId }}
            </RouterLink>
          </div>
          <p class="page-subtitle">Создание запроса из выбранной заявки и её позиций</p>
        </div>
      </header>

      <div v-if="loading" class="inline-state">Загрузка...</div>
      <div v-else-if="loadError" class="inline-state error">{{ loadError }}</div>

      <section v-else class="supplier-layout" :class="{ locked }">
        <div v-if="locked" class="locked-banner full-width">
          Редактирование заблокировано после отправки запроса.
        </div>

        <section class="card section-card request-card full-width">
          <div class="section-head">
            <div>
              <h2 class="section-title">Информация о заявке</h2>
              <p class="section-subtitle">Источник: №{{ requestId }} · Статус: {{ locked ? 'Отправлен' : 'Черновик' }} · Обновлено: {{ formatDateTime(sentAt) }}</p>
            </div>
          </div>

          <div class="request-info-grid">
            <label class="field">
              <span>Плательщик</span>
              <div class="lookup-wrap payer-lookup">
                <input
                  v-model="payerQuery"
                  class="input"
                  type="text"
                  placeholder="Выберите компанию..."
                  :disabled="locked"
                  autocomplete="off"
                  spellcheck="false"
                  @focus="payerOpen = true"
                  @input="payerOpen = true"
                >
                <div v-if="payerOpen && !locked" class="lookup-list">
                  <button
                    v-for="item in filteredCounterparties"
                    :key="`payer-${item.id}`"
                    class="lookup-item"
                    type="button"
                    @click="selectPayer(item)"
                  >
                    {{ buildCounterpartyLabel(item) }}
                  </button>
                  <div v-if="!filteredCounterparties.length" class="lookup-empty">Ничего не найдено</div>
                </div>
              </div>
            </label>

            <label class="field">
              <span>Грузополучатель</span>
              <div class="lookup-wrap consignee-lookup">
                <input
                  v-model="consigneeQuery"
                  class="input"
                  type="text"
                  placeholder="Выберите компанию..."
                  :disabled="locked"
                  autocomplete="off"
                  spellcheck="false"
                  @focus="consigneeOpen = true"
                  @input="consigneeOpen = true"
                >
                <div v-if="consigneeOpen && !locked" class="lookup-list">
                  <button
                    v-for="item in filteredConsignees"
                    :key="`consignee-${item.id}`"
                    class="lookup-item"
                    type="button"
                    @click="selectConsignee(item)"
                  >
                    {{ buildCounterpartyLabel(item) }}
                  </button>
                  <div v-if="!filteredConsignees.length" class="lookup-empty">Ничего не найдено</div>
                </div>
              </div>
            </label>

            <div class="field">
              <span>Требуется доставка</span>
              <div class="btn-row">
                <button class="choice-btn" :class="{ active: deliveryRequired === true }" type="button" :disabled="locked" @click="deliveryRequired = true">Да</button>
                <button class="choice-btn" :class="{ active: deliveryRequired === false }" type="button" :disabled="locked" @click="deliveryRequired = false">Нет</button>
              </div>
            </div>

            <label class="field">
              <span>Требуемая дата доставки</span>
              <div class="date-input-wrap">
                <input
                  :value="deliveryDateDisplay"
                  class="input"
                  type="text"
                  inputmode="numeric"
                  placeholder="24.11.2025"
                  :disabled="locked"
                  autocomplete="off"
                  spellcheck="false"
                  @input="(e) => onDeliveryDateInput(e.target.value)"
                  @blur="onDeliveryDateBlur"
                >
                <button class="date-picker-btn" type="button" :disabled="locked" @click="openDeliveryDatePicker">
                  <i class="fas fa-calendar-alt"></i>
                </button>
                <input
                  ref="deliveryDatePickerRef"
                  class="hidden-date-input"
                  type="date"
                  :value="deliveryDate"
                  :disabled="locked"
                  tabindex="-1"
                  aria-hidden="true"
                  @change="(e) => setDeliveryDateValue(e.target.value)"
                >
              </div>
            </label>

            <label class="field">
              <span>Требуется отсрочка платежа (дней)</span>
              <input v-model="paymentDelayDays" class="input" type="number" min="0" :disabled="locked" placeholder="0">
            </label>

            <label class="field">
              <span>Срок подачи предложения до</span>
              <input v-model="deadline" class="input" type="datetime-local" :disabled="locked">
            </label>

            <label class="field">
              <span>Проект</span>
              <div class="lookup-wrap project-lookup">
                <input
                  v-model="projectQuery"
                  class="input"
                  type="text"
                  placeholder="Выберите проект..."
                  :disabled="locked"
                  autocomplete="off"
                  spellcheck="false"
                  @focus="projectOpen = true"
                  @input="projectOpen = true"
                >
                <div v-if="projectOpen && !locked" class="lookup-list">
                  <button
                    v-for="item in filteredProjects"
                    :key="`project-${item.id}`"
                    class="lookup-item"
                    type="button"
                    @click="selectProject(item)"
                  >
                    {{ buildPlaceLabel(item) }}
                  </button>
                  <div v-if="!filteredProjects.length" class="lookup-empty">Ничего не найдено</div>
                </div>
              </div>
            </label>

            <label class="field">
              <span>Адрес доставки</span>
              <div class="lookup-wrap delivery-to-lookup">
                <input
                  v-model="deliveryToQuery"
                  class="input"
                  type="text"
                  placeholder="Выберите адрес доставки..."
                  :disabled="locked"
                  autocomplete="off"
                  spellcheck="false"
                  @focus="deliveryToOpen = true"
                  @input="deliveryToOpen = true"
                >
                <div v-if="deliveryToOpen && !locked" class="lookup-list">
                  <button
                    v-for="item in filteredDeliveryPlaces"
                    :key="`delivery-${item.kind}-${item.id}`"
                    class="lookup-item"
                    type="button"
                    @click="selectDeliveryTo(item)"
                  >
                    {{ item.kind === 'warehouse' ? `Склад: ${buildPlaceLabel(item)}` : `Проект: ${buildPlaceLabel(item)}` }}
                  </button>
                  <div v-if="!filteredDeliveryPlaces.length" class="lookup-empty">Ничего не найдено</div>
                </div>
              </div>
            </label>

            <label class="field field-wide">
              <span>Комментарий к заявке</span>
              <textarea v-model="commentRequest" class="textarea" rows="3" :disabled="locked"></textarea>
            </label>

            <label class="field field-wide">
              <span>Комментарий к поставщику</span>
              <textarea v-model="commentSupplier" class="textarea" rows="3" :disabled="locked"></textarea>
            </label>
          </div>
        </section>

        <section class="card section-card full-width">
          <div class="section-head">
            <div>
              <h2 class="section-title">Позиции заявки</h2>
              <p class="section-subtitle">Выбранные позиции или все позиции заявки</p>
            </div>
          </div>
          <div class="table-wrap">
            <table class="items-table">
              <thead>
                <tr>
                  <th>Наименование</th>
                  <th>Кол-во</th>
                  <th>Ед. изм.</th>
                  <th>Комментарий</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in itemRows" :key="row.id">
                  <td>{{ row.name || '—' }}</td>
                  <td>
                    <input v-model="row.quantity" class="cell-input" type="text" :disabled="locked">
                  </td>
                  <td>{{ row.unit_name || '—' }}</td>
                  <td>
                    <input v-model="row.comment" class="cell-input" type="text" :disabled="locked">
                  </td>
                  <td>
                    <button class="row-delete" type="button" :disabled="locked" @click="removeItemRow(row.id)">
                      ×
                    </button>
                  </td>
                </tr>
                <tr v-if="!itemRows.length">
                  <td colspan="5" class="empty-row">Нет выбранных позиций.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="card section-card full-width">
          <div class="section-head">
            <div>
              <h2 class="section-title">Файлы</h2>
              <p class="section-subtitle">Список файлов можно подготовить здесь. Подключение загрузки файла к storage endpoint добавим следующим шагом.</p>
            </div>
          </div>
          <div class="files-actions">
            <input ref="fileInputRef" class="hidden-input" type="file" multiple @change="addSelectedFile">
            <button class="btn" type="button" :disabled="locked" @click="openFilePicker">Прикрепить</button>
          </div>
          <div v-if="fileRows.length" class="file-list">
            <div v-for="file in fileRows" :key="file.id" class="file-item">
              <span>{{ file.original_name }}</span>
              <button class="row-delete" type="button" :disabled="locked" @click="removeFileRow(file.id)">×</button>
            </div>
          </div>
        </section>

        <section class="card section-card full-width">
          <div class="section-head">
            <div>
              <h2 class="section-title">Почта отправителя</h2>
              <p class="section-subtitle">Выберите подключённую SMTP-почту</p>
            </div>
          </div>
          <div class="lookup-wrap sender-lookup">
            <input
              v-model="senderQuery"
              class="input"
              type="text"
              placeholder="Поиск почты..."
              :disabled="locked"
              autocomplete="off"
              spellcheck="false"
              @focus="senderOpen = true"
              @input="senderOpen = true"
            >
            <div v-if="senderOpen && !locked" class="lookup-list">
              <button
                v-for="item in filteredSmtp"
                :key="`smtp-${item.id}`"
                class="lookup-item"
                type="button"
                @click="addSender(item)"
              >
                {{ buildSmtpLabel(item) }}
              </button>
              <div v-if="smtpLoading" class="lookup-empty">Загрузка...</div>
              <div v-if="!smtpLoading && !filteredSmtp.length" class="lookup-empty">Ничего не найдено</div>
            </div>
          </div>
          <div class="chip-list">
            <div v-for="row in senderRows" :key="row.id" class="chip-item">
              <span>{{ row.email }}</span>
              <button class="row-delete" type="button" :disabled="locked" @click="removeSender(row.id)">×</button>
            </div>
          </div>
        </section>

        <section class="card section-card full-width">
          <div class="section-head">
            <div>
              <h2 class="section-title">Поставщик</h2>
              <p class="section-subtitle">Можно добавить по email или выбрать физлицо из справочника</p>
            </div>
          </div>
          <div class="lookup-wrap recipient-lookup">
            <input
              v-model="recipientQuery"
              class="input"
              type="text"
              placeholder="Введите email или начните поиск по ФИО..."
              :disabled="locked"
              autocomplete="off"
              spellcheck="false"
              @focus="recipientOpen = true"
              @keydown.enter.prevent="addRecipientByEmail"
              @input="recipientOpen = true"
            >
            <div v-if="recipientOpen && !locked" class="lookup-list">
              <button
                v-for="item in filteredPersons"
                :key="`person-${item.id}`"
                class="lookup-item"
                type="button"
                @click="addRecipient(item)"
              >
                {{ buildPersonLabel(item) }}
              </button>
              <button v-if="recipientQuery.trim()" class="lookup-item lookup-create" type="button" @click="addRecipientByEmail">
                + Добавить email {{ recipientQuery.trim() }}
              </button>
              <div v-if="!filteredPersons.length" class="lookup-empty">Ничего не найдено</div>
            </div>
          </div>
          <div class="recipient-grid">
            <div class="recipient-head">Email</div>
            <div class="recipient-head">ФИО</div>
            <div class="recipient-head">Компания</div>
            <div class="recipient-head"></div>
            <template v-for="row in recipientRows" :key="row.id">
              <input v-model="row.email" class="cell-input" type="text" :disabled="locked">
              <input v-model="row.fio" class="cell-input" type="text" :disabled="locked">
              <input v-model="row.company_name" class="cell-input" type="text" :disabled="locked">
              <button class="row-delete" type="button" :disabled="locked" @click="removeRecipient(row.id)">×</button>
            </template>
          </div>
          <div v-if="!recipientRows.length" class="empty-row">Поставщики пока не добавлены.</div>
        </section>

        <div v-if="sendError" class="inline-state error">{{ sendError }}</div>
        <div v-if="sendSuccess" class="inline-state success">{{ sendSuccess }}</div>
        <div v-if="saveError" class="inline-state error">{{ saveError }}</div>
        <div v-if="previewError" class="inline-state error">{{ previewError }}</div>

        <div class="actions full-width">
          <button class="btn" type="button" @click="openBack">Отмена</button>
          <button class="btn" type="button" :disabled="previewing || loading" @click="openEmailPreview">
            {{ previewing ? 'Открываем предпросмотр...' : 'Предпросмотр письма' }}
          </button>
          <button class="btn btn-primary" type="button" :disabled="!canSend || locked" @click="submitSupplierRequest">
            {{ sending ? 'Отправка...' : 'Послать запрос' }}
          </button>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.main-content {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  padding: 24px 32px;
  gap: 16px;
  min-height: 0;
}

.page-head {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 16px;
}

.page-head-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.title-line {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 10px;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--border-light);
  background: var(--bg-surface);
  color: var(--text-primary);
  border-radius: 12px;
  padding: 10px 12px;
  cursor: pointer;
}

.page-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
}

.request-link {
  color: var(--brand-primary);
  font-weight: 700;
  text-decoration: none;
}

.request-link:hover {
  text-decoration: underline;
}

.page-subtitle,
.section-subtitle {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.inline-state {
  font-size: 12px;
  color: var(--text-secondary);
}

.inline-state.error {
  color: var(--danger-text);
}

.inline-state.success {
  color: #059669;
}

.supplier-layout {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.card {
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.full-width {
  width: 100%;
}

.request-info-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px 14px;
}

.field > span,
.recipient-head {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--text-secondary);
  letter-spacing: 0.3px;
}

.locked-banner {
  margin-top: 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(245, 158, 11, 0.12);
  color: #b45309;
  font-size: 12px;
  font-weight: 600;
}

.card {
  padding: 16px;
}

.section-card {
  width: 100%;
}

.request-card {
  padding-bottom: 18px;
}

.request-card .field-wide {
  grid-column: 1 / -1;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
}

.field-wide {
  grid-column: 1 / -1;
}

.date-input-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.date-input-wrap .input {
  flex: 1 1 auto;
}

.date-picker-btn {
  flex: 0 0 auto;
  width: 42px;
  height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: var(--bg-surface);
  color: var(--text-primary);
  cursor: pointer;
}

.date-picker-btn:hover {
  background: var(--bg-subtle);
}

.hidden-date-input {
  position: fixed;
  left: -9999px;
  top: -9999px;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.input,
.textarea,
.cell-input {
  width: 100%;
  min-height: 40px;
  border-radius: 12px;
  border: 1px solid var(--border-light);
  background: #f8fafc;
  color: var(--text-primary);
  padding: 9px 12px;
  font: inherit;
  font-size: 13px;
  box-sizing: border-box;
}

.textarea {
  resize: vertical;
  min-height: 92px;
}

.input:focus,
.textarea:focus,
.cell-input:focus {
  outline: none;
  border-color: var(--brand-primary);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}

.lookup-wrap {
  position: relative;
}

.lookup-list {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 6px);
  z-index: 40;
  max-height: 240px;
  overflow: auto;
  border: 1px solid var(--border-light);
  border-radius: 14px;
  background: var(--bg-surface);
  box-shadow: var(--shadow-md);
  padding: 6px;
}

.lookup-item {
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  color: var(--text-primary);
  padding: 8px 10px;
  border-radius: 10px;
  font-size: 13px;
  cursor: pointer;
}

.lookup-item:hover,
.lookup-create:hover {
  background: var(--bg-subtle);
}

.lookup-create {
  color: var(--brand-primary);
  font-weight: 600;
}

.lookup-empty {
  padding: 8px 10px;
  font-size: 12px;
  color: var(--text-secondary);
}

.btn-row {
  display: flex;
  gap: 8px;
}

.choice-btn {
  min-width: 62px;
  height: 34px;
  border: 1px solid var(--border-light);
  background: var(--bg-surface);
  color: var(--text-secondary);
  border-radius: 10px;
  cursor: pointer;
}

.choice-btn.active {
  border-color: var(--brand-primary);
  background: var(--brand-light);
  color: var(--brand-primary);
  font-weight: 600;
}

.section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.section-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
}

.table-wrap {
  overflow: auto;
  border: 1px solid var(--border-light);
  border-radius: 14px;
}

.items-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 12px;
}

.items-table th,
.items-table td {
  border-bottom: 1px solid var(--border-light);
  padding: 10px 12px;
  text-align: left;
  vertical-align: top;
}

.items-table th {
  background: var(--bg-subtle);
  color: var(--text-secondary);
  font-weight: 700;
  font-size: 11px;
  text-transform: uppercase;
}

.row-delete {
  border: 1px solid var(--border-light);
  background: var(--bg-surface);
  color: var(--danger-text);
  width: 32px;
  height: 32px;
  border-radius: 10px;
  cursor: pointer;
}

.row-delete:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.section-block {
  margin-top: 16px;
}

.hidden-input {
  display: none;
}

.files-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.file-list,
.chip-list {
  display: grid;
  gap: 8px;
}

.file-item,
.chip-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--border-light);
  background: var(--bg-subtle);
}

.recipient-grid {
  display: grid;
  grid-template-columns: 1.2fr 1.3fr 1.2fr auto;
  gap: 8px;
  align-items: center;
}

.recipient-head {
  margin-top: 8px;
}

.empty-row {
  padding: 14px 12px;
  color: var(--text-secondary);
  text-align: center;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.actions.full-width {
  width: 100%;
}

@media (max-width: 1280px) {
  .request-info-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .main-content {
    padding: 16px;
  }

  .request-info-grid,
  .recipient-grid {
    grid-template-columns: 1fr;
  }
}
</style>
