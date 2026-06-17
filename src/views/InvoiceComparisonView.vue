<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TopNav from '../components/layout/TopNav.vue'
import { useAuthStore } from '../stores/auth'
import { mainNavLinks } from '../constants/mainNav'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const navLinks = mainNavLinks

const loading = ref(false)
const loadError = ref('')
const requestData = ref(null)
const invoices = ref([])
const mappings = ref([])
const sendModalOpen = ref(false)
const sendTargetInvoice = ref(null)
const sendingApprovals = ref(false)
const approverOptions = ref([])
const approverQuery = ref('')
const approverDropdownOpen = ref(false)
const selectedApproverIds = ref([])
const FIXED_PLANNING_USER_ID = '8f1d6ffd-6652-4719-a426-5b21412d7c56'
const FIXED_PAYMENT_USER_ID = '06968a8b-e24c-4099-998d-3d4c16ebc63a'
const STATUS_ID_INVOICE_NEW = '1ff34436-1312-11f1-aa8c-bc241127d0bd'
const STATUS_ID_INVOICE_APPROVED = 'c532989f-17ba-11f1-aa8c-bc241127d0bd'
const STATUS_ID_INVOICE_REJECTED = '1ff33ee2-1312-11f1-aa8c-bc241127d0bd'
const decisionLoadingInvoiceId = ref('')

const requestId = computed(() => String(route.params.requestId || ''))

const normalizeArray = (payload) => {
  if (Array.isArray(payload)) return payload
  return payload?.items || payload?.data || payload?.results || []
}

const formatNumber = (value) => {
  const n = Number(value)
  if (!Number.isFinite(n)) return ''
  return n.toLocaleString('ru-RU')
}

const formatMoney = (value) => {
  const n = Number(value)
  if (!Number.isFinite(n)) return ''
  return `${n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`
}

const statusClass = (name) => {
  const val = String(name || '').toLowerCase()
  if (val.includes('соглас')) return 'st-approve'
  if (val.includes('процесс') || val.includes('работ')) return 'st-work'
  if (val.includes('нов')) return 'st-new'
  if (val.includes('отклон')) return 'st-reject'
  return 'st-new'
}

const requestItems = computed(() => {
  const items = normalizeArray(requestData.value?.items)
  return items.slice().sort((a, b) => (a?.num || 0) - (b?.num || 0))
})

const supplierLine = computed(() => {
  const names = new Set()
  invoices.value.forEach((invoice) => {
    if (invoice?.provider?.short_name) names.add(invoice.provider.short_name)
    else if (invoice?.provider_name) names.add(invoice.provider_name)
  })
  return Array.from(names)
})

const visibleInvoices = computed(() => invoices.value.filter((i) => i && i.id))

const LEFT_COL_WIDTH = 620
const INVOICE_COL_WIDTH = 370

const compareGridStyle = computed(() => ({
  gridTemplateColumns: `${LEFT_COL_WIDTH}px repeat(${Math.max(visibleInvoices.value.length, 1)}, ${INVOICE_COL_WIDTH}px)`,
}))

const mappingKey = (requestItemId, invoiceId) => `${String(requestItemId)}|${String(invoiceId)}`

const mappingsByRequestInvoice = computed(() => {
  const map = new Map()
  normalizeArray(mappings.value).forEach((item) => {
    const key = mappingKey(item?.request_item_id, item?.invoice_id)
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(item)
  })
  map.forEach((list, key) => {
    list.sort((a, b) => {
      const order = { direct: 0, kit_head: 1, sum: 2, kit_component: 3 }
      const oa = order[String(a?.match_type || '')] ?? 10
      const ob = order[String(b?.match_type || '')] ?? 10
      if (oa !== ob) return oa - ob
      return String(a?.id || '').localeCompare(String(b?.id || ''))
    })
    map.set(key, list)
  })
  return map
})

const invoiceItemsForRequest = (invoice, requestItemId) => {
  if (!invoice?.id || !requestItemId) return null
  const mappingList = mappingsByRequestInvoice.value.get(mappingKey(requestItemId, invoice.id))
  if (!mappingList?.length) return []
  const items = normalizeArray(invoice?.items)
  return mappingList
    .map((mapping) => {
      let invoiceItem = null
      if (mapping?.invoice_item_id) {
        invoiceItem = items.find((item) => String(item?.id || '') === String(mapping.invoice_item_id)) || null
      }
      if (!invoiceItem && mapping?.invoice_item) invoiceItem = mapping.invoice_item
      if (!invoiceItem) return null
      return { mapping, invoiceItem }
    })
    .filter(Boolean)
}

const selectedInvoiceItemKeys = ref(new Set())
const highlightedRequestRows = ref(new Set())
const highlightedInvoiceColumns = ref(new Set())

const invoiceItemKey = (mappingId) => String(mappingId || '')

const isInvoiceItemSelected = (mappingId) => selectedInvoiceItemKeys.value.has(invoiceItemKey(mappingId))

const toggleInvoiceItemSelection = (mappingId) => {
  const key = invoiceItemKey(mappingId)
  const next = new Set(selectedInvoiceItemKeys.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  selectedInvoiceItemKeys.value = next
}

const invoiceSelectableItemsCount = (invoice) => {
  let count = 0
  requestItems.value.forEach((requestItem) => {
    count += invoiceItemsForRequest(invoice, requestItem.id).length
  })
  return count
}

const isInvoiceFullySelected = (invoice) => {
  const selectable = invoiceSelectableItemsCount(invoice)
  if (!selectable) return false
  let selected = 0
  requestItems.value.forEach((requestItem) => {
    invoiceItemsForRequest(invoice, requestItem.id).forEach((entry) => {
      if (isInvoiceItemSelected(entry.mapping?.id)) selected += 1
    })
  })
  return selected === selectable
}

const toggleInvoiceSelectionAll = (invoice) => {
  const next = new Set(selectedInvoiceItemKeys.value)
  const makeSelected = !isInvoiceFullySelected(invoice)
  requestItems.value.forEach((requestItem) => {
    invoiceItemsForRequest(invoice, requestItem.id).forEach((entry) => {
      const key = invoiceItemKey(entry.mapping?.id)
      if (makeSelected) next.add(key)
      else next.delete(key)
    })
  })
  selectedInvoiceItemKeys.value = next
}

const isRequestRowHighlighted = (requestItemId) => highlightedRequestRows.value.has(String(requestItemId))

const toggleRequestRowHighlight = (requestItemId) => {
  const key = String(requestItemId)
  const next = new Set(highlightedRequestRows.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  highlightedRequestRows.value = next
}

const isInvoiceColumnHighlighted = (invoiceId) => highlightedInvoiceColumns.value.has(String(invoiceId))

const toggleInvoiceColumnHighlight = (invoiceId) => {
  const key = String(invoiceId)
  const next = new Set(highlightedInvoiceColumns.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  highlightedInvoiceColumns.value = next
}

const selectedInvoicesBudgetSum = computed(() => {
  let total = 0
  visibleInvoices.value.forEach((invoice) => {
    requestItems.value.forEach((requestItem) => {
      invoiceItemsForRequest(invoice, requestItem.id).forEach((entry) => {
        if (!isInvoiceItemSelected(entry.mapping?.id)) return
        const value = Number(entry?.invoiceItem?.sum || 0)
        if (Number.isFinite(value)) total += value
      })
    })
  })
  return total
})

const invoiceVatLabel = (invoice) => {
  const rate = Number(invoice?.vat_rate || 0)
  if (!Number.isFinite(rate) || rate === 0) return 'без НДС'
  return `НДС ${formatNumber(rate)}%`
}

const prepaymentClass = (invoice) => {
  const value = Number(invoice?.prepayment_percent || 0)
  if (!Number.isFinite(value)) return 'state-warn'
  if (value <= 0) return 'state-good'
  if (value >= 100) return 'state-bad'
  return 'state-warn'
}

const defermentClass = (invoice) => {
  const value = Number(invoice?.due_days || 0)
  if (!Number.isFinite(value)) return 'state-bad'
  if (value <= 0) return 'state-bad'
  if (value <= 30) return 'state-warn'
  return 'state-good'
}

const deliveryClass = (invoice) => (invoice?.is_delivery_included ? 'state-good' : 'state-bad')

const priceStatsByRow = computed(() => {
  const stats = new Map()
  requestItems.value.forEach((requestItem) => {
    const requestKey = String(requestItem.id)
    const entriesByInvoice = new Map()
    visibleInvoices.value.forEach((invoice) => {
      entriesByInvoice.set(String(invoice.id), invoiceItemsForRequest(invoice, requestItem.id))
    })

    const isComplex = Array.from(entriesByInvoice.values()).some((entries) =>
      entries.some((entry) => String(entry?.mapping?.match_type || '') !== 'direct')
    )

    const valueByInvoice = new Map()
    entriesByInvoice.forEach((entries, invoiceKey) => {
      if (!entries.length) return
      if (isComplex) {
        const total = entries.reduce((acc, entry) => {
          const val = Number(entry?.invoiceItem?.sum || 0)
          return Number.isFinite(val) ? acc + val : acc
        }, 0)
        if (Number.isFinite(total)) valueByInvoice.set(invoiceKey, total)
        return
      }

      // direct mode: compare by unit price
      const firstPrice = Number(entries[0]?.invoiceItem?.price)
      if (Number.isFinite(firstPrice)) valueByInvoice.set(invoiceKey, firstPrice)
    })

    const values = Array.from(valueByInvoice.values()).filter((value) => Number.isFinite(value))
    if (!values.length) return

    stats.set(requestKey, {
      isComplex,
      min: Math.min(...values),
      max: Math.max(...values),
      valueByInvoice,
    })
  })
  return stats
})

const isComplexRow = (requestItemId) => Boolean(priceStatsByRow.value.get(String(requestItemId))?.isComplex)

const canSendInvoiceForApproval = (invoice) =>
  String(invoice?.status || '') === STATUS_ID_INVOICE_NEW
  && normalizeArray(invoice?.approvals).length === 0

const currentUserId = computed(() => String(auth?.user?.id || ''))

const myPendingInvoiceLog = (invoice) => normalizeArray(invoice?.approvals).find((log) =>
  String(log?.user_id || '') === currentUserId.value
  && String(log?.status_name || '').toLowerCase() === 'pending')

const canRespondInvoice = (invoice) => Boolean(myPendingInvoiceLog(invoice)?.id)

const respondInvoice = async (invoice, statusName) => {
  const invoiceId = String(invoice?.id || '')
  const myLog = myPendingInvoiceLog(invoice)
  if (!invoiceId || !myLog?.id) return
  decisionLoadingInvoiceId.value = invoiceId
  try {
    const responseDateIso = new Date().toISOString()
    const res = await fetch(
      `/apisup/supply/invoices/${encodeURIComponent(invoiceId)}/logs/${encodeURIComponent(String(myLog.id))}`,
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
    if (!res.ok) throw new Error('invoice log patch failed')

    const nextLogs = normalizeArray(invoice?.approvals).map((log) =>
      String(log?.id || '') === String(myLog.id)
        ? { ...log, status_name: statusName, date_response: responseDateIso }
        : log
    )
    const total = nextLogs.length
    if (total > 0) {
      const pendingCount = nextLogs.filter((log) => String(log?.status_name || '').toLowerCase() === 'pending').length
      const approvedCount = nextLogs.filter((log) => String(log?.status_name || '').toLowerCase() === 'approved').length
      const rejectedCount = nextLogs.filter((log) => String(log?.status_name || '').toLowerCase() === 'rejected').length

      let invoiceStatusId = ''
      if (pendingCount === 0 && approvedCount === total) invoiceStatusId = STATUS_ID_INVOICE_APPROVED
      if (pendingCount === 0 && rejectedCount > 0) invoiceStatusId = STATUS_ID_INVOICE_REJECTED

      if (invoiceStatusId) {
        const statusRes = await fetch(`/apisup/supply/invoices/${encodeURIComponent(invoiceId)}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: invoiceStatusId }),
        })
        if (!statusRes.ok) throw new Error('invoice status patch failed')
      }
    }

    await loadComparison()
  } catch {
    loadError.value = 'Не удалось отправить решение по согласованию счета.'
  } finally {
    decisionLoadingInvoiceId.value = ''
  }
}

const compareClassForCell = (requestItemId, invoiceId, cellType = 'price') => {
  const stats = priceStatsByRow.value.get(String(requestItemId))
  if (!stats) return ''
  if (stats.min === stats.max) return ''

  // direct rows: highlight only price cell; complex rows: highlight only sum cell
  if (!stats.isComplex && cellType !== 'price') return ''
  if (stats.isComplex && cellType !== 'sum') return ''

  const value = Number(stats.valueByInvoice.get(String(invoiceId)))
  if (!Number.isFinite(value)) return ''
  if (value === stats.min) return 'price-best'
  if (value === stats.max) return 'price-worst'
  return ''
}

const totalSumForEntries = (entries) =>
  entries.reduce((acc, entry) => {
    const value = Number(entry?.invoiceItem?.sum || 0)
    return Number.isFinite(value) ? acc + value : acc
  }, 0)

const closeSendModal = () => {
  sendModalOpen.value = false
  sendTargetInvoice.value = null
  approverQuery.value = ''
  selectedApproverIds.value = []
  approverDropdownOpen.value = false
}

const filteredApproverOptions = computed(() => {
  const q = String(approverQuery.value || '').trim().toLowerCase()
  if (!q) return approverOptions.value
  return approverOptions.value.filter((item) => String(item?.fio || '').toLowerCase().includes(q))
})

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

const openSendModal = async (invoice) => {
  sendTargetInvoice.value = invoice || null
  await loadApproverOptions()
  sendModalOpen.value = true
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
  if (!sendTargetInvoice.value?.id || sendingApprovals.value) return
  const ids = selectedApproverIds.value.filter(Boolean)
  if (!ids.length) return
  sendingApprovals.value = true
  try {
    const invoiceId = String(sendTargetInvoice.value.id)
    for (const userId of ids) {
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

    closeSendModal()
    await loadComparison()
  } catch {
    loadError.value = 'Не удалось передать счет на согласование.'
  } finally {
    sendingApprovals.value = false
  }
}

const goBack = () => {
  const back = String(route.query.back || '/')
  router.push(back)
}

const openRequestFromSummary = () => {
  router.push({
    path: `/requests/${requestId.value}`,
    query: { back: route.fullPath },
  })
}

const openDeliveryPlanning = (invoice) => {
  const invoiceId = String(invoice?.id || '')
  if (!invoiceId) return
  router.push({
    path: `/invoices/${encodeURIComponent(invoiceId)}/delivery-plan`,
    query: {
      back: route.fullPath,
    },
  })
}

const loadComparison = async () => {
  loading.value = true
  loadError.value = ''
  try {
    const requestRes = await fetch(`/apisup/supply/requests/my/${encodeURIComponent(requestId.value)}`, {
      credentials: 'include',
    })
    if (!requestRes.ok) throw new Error('request load failed')
    const requestPayload = await requestRes.json()
    requestData.value = requestPayload

    const [mappingsRes, requestInvoices] = await Promise.all([
      fetch(`/apisup/supply/item-mappings?request_id=${encodeURIComponent(requestId.value)}`, {
        credentials: 'include',
      }).catch(() => null),
      Promise.resolve(normalizeArray(requestPayload?.documents?.invoices)),
    ])

    if (mappingsRes?.ok) {
      mappings.value = normalizeArray(await mappingsRes.json())
    } else {
      mappings.value = []
    }

    if (!requestInvoices.length) {
      invoices.value = []
      return
    }

    const details = await Promise.all(
      requestInvoices.map(async (doc) => {
        const invoiceId = doc?.id
        if (!invoiceId) return null
        try {
          const invoiceRes = await fetch(`/apisup/supply/invoices/${encodeURIComponent(String(invoiceId))}`, {
            credentials: 'include',
          })
          if (!invoiceRes.ok) return { ...doc, items: [] }
          const invoicePayload = await invoiceRes.json()
          return {
            ...doc,
            ...invoicePayload,
            items: normalizeArray(invoicePayload?.items),
          }
        } catch {
          return { ...doc, items: [] }
        }
      })
    )

    invoices.value = details.filter(Boolean)
  } catch {
    loadError.value = 'Не удалось загрузить данные сравнения счетов.'
    requestData.value = null
    invoices.value = []
    mappings.value = []
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  window.addEventListener('mousedown', handleWindowClick)
  loadComparison()
})

const handleWindowClick = (event) => {
  const target = event?.target
  if (!(target instanceof Element)) return
  if (approverDropdownOpen.value && !target.closest('.approver-select')) {
    approverDropdownOpen.value = false
  }
}

onBeforeUnmount(() => {
  window.removeEventListener('mousedown', handleWindowClick)
})
</script>

<template>
  <div class="page compare-page">
    <TopNav :links="navLinks" />

    <main class="main-content compare-content">
      <header class="compare-header">
        <button class="back-btn" type="button" @click="goBack">
          <i class="fas fa-chevron-left"></i>
          Назад
        </button>
        <div>
          <h1 class="page-title">Сравнение счетов</h1>
          <p class="page-subtitle">Заявка #{{ requestId }}</p>
        </div>
      </header>

      <div v-if="loading" class="inline-state">Загрузка...</div>
      <div v-else-if="loadError" class="inline-state error">{{ loadError }}</div>

      <template v-else>
        <div class="compare-grid-scroll">
          <section class="compare-grid top-compare" :style="compareGridStyle">
            <article class="summary-card">
              <div class="summary-head">
                <h2>Общая информация</h2>
                <button class="summary-request-link" type="button" @click="openRequestFromSummary">
                  Заявка #{{ requestId }}
                </button>
              </div>
              <div class="summary-split"></div>
              <div class="summary-line">
                <span class="summary-line-label">Цены от поставщиков:</span>
                <span class="supplier-list">{{ supplierLine.join(', ') }}</span>
              </div>
              <div class="summary-split"></div>
              <div class="summary-bottom">
                <div class="summary-left">Всего позиций: <b>{{ requestItems.length }}</b></div>
                <div class="summary-right">
                  <div class="summary-right-title">Сумма по выделенным позициям:</div>
                  <div class="summary-right-row">
                    <span>По бюджету в заявке:</span>
                    <b>{{ formatMoney(0) }}</b>
                  </div>
                  <div class="summary-right-row">
                    <span>По бюджету в счетах:</span>
                    <b>{{ formatMoney(selectedInvoicesBudgetSum) }}</b>
                  </div>
                </div>
              </div>
            </article>

            <template v-if="visibleInvoices.length">
              <div v-for="invoice in visibleInvoices" :key="invoice.id" class="invoice-top-col">
                <button
                  class="column-highlight-btn"
                  type="button"
                  :class="{ active: isInvoiceColumnHighlighted(invoice.id) }"
                  @click="toggleInvoiceColumnHighlight(invoice.id)"
                  title="Подсветить столбец счета"
                >
                  <i class="fas fa-grip-lines-vertical"></i>
                </button>
                <article class="invoice-card" :class="{ 'column-highlighted': isInvoiceColumnHighlighted(invoice.id) }">
                  <div class="invoice-card-head">
                    <div class="invoice-name">
                      <input
                        type="checkbox"
                        :checked="isInvoiceFullySelected(invoice)"
                        @change="toggleInvoiceSelectionAll(invoice)"
                      >
                      <span>Счет {{ invoice.num || invoice.id }}</span>
                    </div>
                    <div class="invoice-status" :class="statusClass(invoice.status_name)">{{ invoice.status_name || 'Новая' }}</div>
                  </div>
                  <div class="invoice-split"></div>
                  <div class="invoice-meta"><span>Поставщик:</span> {{ invoice.provider?.short_name || invoice.provider_name || '' }}</div>
                  <div class="invoice-meta"><span>Плательщик:</span> {{ invoice.payer?.short_name || invoice.payer_name || '' }}</div>
                  <div class="invoice-split"></div>
                  <div class="invoice-inline-meta">
                    <span>Поз.: <b>{{ normalizeArray(invoice.items).length }}</b></span>
                    <span class="meta-separator">|</span>
                    <span>{{ invoiceVatLabel(invoice) }}</span>
                    <span class="meta-separator">|</span>
                    <span>Итого: <b>{{ formatMoney(invoice.total_amount) || '0,00 ₽' }}</b></span>
                  </div>
                  <div class="invoice-split"></div>
                  <div class="invoice-inline-meta invoice-inline-meta-bottom">
                    <span class="meta-stack" :class="prepaymentClass(invoice)">
                      <small>Предоплата</small>
                      <b>{{ formatNumber(invoice.prepayment_percent || 0) }}%</b>
                    </span>
                    <span class="meta-stack" :class="defermentClass(invoice)">
                      <small>Отсрочка</small>
                      <b>{{ formatNumber(invoice.due_days || 0) }} дней</b>
                    </span>
                    <span class="meta-separator">|</span>
                    <span class="meta-delivery" :class="deliveryClass(invoice)"><b>{{ invoice.is_delivery_included ? 'доставка включена' : 'доставка не включена' }}</b></span>
                  </div>
                </article>
                <div class="invoice-actions single-action outside-action" :class="{ 'column-highlighted': isInvoiceColumnHighlighted(invoice.id) }">
                  <button
                    class="btn btn-delivery"
                    type="button"
                    @click="openDeliveryPlanning(invoice)"
                  >
                    Запланировать доставку
                  </button>
                  <button
                    v-if="canSendInvoiceForApproval(invoice)"
                    class="btn btn-primary"
                    type="button"
                    @click="openSendModal(invoice)"
                  >
                    Отправить на согласование
                  </button>
                  <template v-if="canRespondInvoice(invoice)">
                    <button
                      class="btn btn-success"
                      type="button"
                      :disabled="decisionLoadingInvoiceId === String(invoice.id)"
                      @click="respondInvoice(invoice, 'approved')"
                    >
                      Согласовать
                    </button>
                    <button
                      class="btn btn-danger"
                      type="button"
                      :disabled="decisionLoadingInvoiceId === String(invoice.id)"
                      @click="respondInvoice(invoice, 'rejected')"
                    >
                      Не согласовать
                    </button>
                  </template>
                </div>
              </div>
            </template>
            <article v-else class="invoice-card invoice-card-empty">
              Счета не прикреплены
            </article>
          </section>

          <section class="compare-grid bottom-compare" :style="compareGridStyle">
            <template v-for="(requestItem, idx) in requestItems" :key="`row-${requestItem.id}`">
              <div class="request-item-card" :class="{ 'row-highlighted': isRequestRowHighlighted(requestItem.id) }">
                <div class="request-item-head">
                  <span>№</span>
                  <span>Наименование</span>
                  <span>Кол-во</span>
                  <span>Бюджетная<br>стоимость</span>
                  <span>Итого по<br>бюджету</span>
                </div>
                <div class="request-item-values">
                  <span class="request-num-cell">
                    <strong>{{ requestItem.num }}</strong>
                    <button
                      class="row-highlight-btn"
                      type="button"
                      :class="{ active: isRequestRowHighlighted(requestItem.id) }"
                      @click="toggleRequestRowHighlight(requestItem.id)"
                      title="Подсветить строку"
                    >
                      <i class="fas fa-highlighter"></i>
                    </button>
                  </span>
                  <span>{{ requestItem.name || requestItem.nomenclature?.name || '' }}</span>
                  <span>
                    {{ formatNumber(requestItem.quantity) }}
                    {{ requestItem.unit?.name || requestItem.nomenclature?.unit?.name || '' }}
                  </span>
                  <span></span>
                  <span></span>
                </div>
              </div>

              <template v-if="visibleInvoices.length">
                <div
                  v-for="invoice in visibleInvoices"
                  :key="`inv-${invoice.id}-req-${requestItem.id}`"
                  class="invoice-item-card"
                  :class="{
                    'row-highlighted': isRequestRowHighlighted(requestItem.id),
                    'column-highlighted': isInvoiceColumnHighlighted(invoice.id),
                  }"
                >
                  <template v-if="invoiceItemsForRequest(invoice, requestItem.id).length">
                    <div
                      v-for="entry in invoiceItemsForRequest(invoice, requestItem.id)"
                      :key="`map-${entry.mapping?.id}`"
                      class="mapped-item-block"
                    >
                      <label class="item-card-title">
                        <input
                          type="checkbox"
                          :checked="isInvoiceItemSelected(entry.mapping?.id)"
                          @change="toggleInvoiceItemSelection(entry.mapping?.id)"
                        >
                        <span>{{ entry.invoiceItem?.name || '' }}</span>
                      </label>
                      <div class="item-card-head">
                        <span>Цена</span>
                        <span>Кол-во</span>
                        <span>Стоимость</span>
                      </div>
                      <div class="item-card-values">
                        <span :class="compareClassForCell(requestItem.id, invoice.id, 'price')">
                          {{ formatMoney(entry.invoiceItem?.price) }}
                        </span>
                        <span>
                          {{ formatNumber(entry.invoiceItem?.quantity) }}
                          {{ entry.invoiceItem?.unit_name || '' }}
                        </span>
                        <span>{{ formatMoney(entry.invoiceItem?.sum) }}</span>
                      </div>
                    </div>
                    <div
                      v-if="isComplexRow(requestItem.id)"
                      class="mapped-total"
                      :class="compareClassForCell(requestItem.id, invoice.id, 'sum')"
                    >
                      <span>Итоговая стоимость</span>
                      <b>{{ formatMoney(totalSumForEntries(invoiceItemsForRequest(invoice, requestItem.id))) }}</b>
                    </div>
                  </template>
                  <template v-else>
                    <div class="item-card-empty"></div>
                  </template>
                </div>
              </template>
              <div v-else class="invoice-item-card"><div class="item-card-empty"></div></div>
            </template>
          </section>
        </div>
      </template>

      <div v-if="sendModalOpen" class="modal-backdrop" @click.self="closeSendModal">
        <div class="modal-card">
          <div class="modal-head">
            <h3 class="modal-title">Передать счет на согласование</h3>
            <button type="button" class="modal-close" @click="closeSendModal">
              <i class="fas fa-times"></i>
            </button>
          </div>

          <label class="modal-label">Согласующие</label>
          <div class="approver-select">
            <input
              v-model="approverQuery"
              class="modal-input"
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
              <div v-if="!filteredApproverOptions.length" class="empty-item">Ничего не найдено</div>
            </div>
          </div>

          <div v-if="selectedApproverIds.length" class="selected-list">
            <span v-for="id in selectedApproverIds" :key="id" class="selected-chip">
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
    </main>
  </div>
</template>

<style scoped>
.compare-page {
  min-height: 100vh;
  background: var(--bg-body);
}

.compare-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
}

.compare-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.back-btn {
  border: 1px solid var(--border-light);
  background: var(--bg-surface);
  color: var(--text-secondary);
  border-radius: 8px;
  padding: 8px 12px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.back-btn:hover {
  color: var(--brand-primary);
  border-color: var(--brand-primary);
}

.page-title {
  margin: 0;
  font-size: 22px;
  font-weight: 800;
  color: var(--text-primary);
}

.page-subtitle {
  margin: 4px 0 0;
  color: var(--text-tertiary);
}

.summary-card,
.invoice-card,
.request-item-card,
.invoice-item-card {
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background: var(--bg-surface);
  box-shadow: var(--shadow-sm);
}

.compare-grid-scroll {
  overflow: auto;
  max-width: 100%;
}

.compare-grid {
  display: grid;
  gap: 12px;
  width: max-content;
  min-width: 100%;
}

.top-compare {
  margin-bottom: 12px;
}

.bottom-compare {
  row-gap: 10px;
  align-items: stretch;
}

.summary-card {
  padding: 0;
  overflow: hidden;
}

.summary-head {
  padding: 12px 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.summary-head h2 {
  margin: 0;
  font-size: 17px;
}

.summary-request-link {
  border: none;
  background: transparent;
  padding: 0;
  color: var(--brand-primary);
  font-weight: 700;
  cursor: pointer;
  text-decoration: underline;
}

.summary-split {
  border-top: 1px solid var(--border-light);
}

.summary-line {
  padding: 10px 14px;
  color: var(--text-secondary);
  line-height: 1.35;
}

.summary-line-label {
  color: var(--text-secondary);
  margin-right: 6px;
}

.supplier-list {
  color: var(--text-primary);
}

.summary-bottom {
  display: grid;
  grid-template-columns: 1fr 1.15fr;
}

.summary-left,
.summary-right {
  padding: 10px 14px;
}

.summary-left {
  color: var(--text-secondary);
  border-right: 1px solid var(--border-light);
}

.summary-left b {
  color: var(--text-primary);
}

.summary-right {
  color: var(--text-secondary);
}

.summary-right-title {
  margin-bottom: 6px;
}

.summary-right-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 4px;
}

.summary-right-row:last-child {
  margin-bottom: 0;
}

.summary-right-row b {
  color: var(--text-primary);
}

.invoice-card {
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.invoice-top-col {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.column-highlight-btn {
  width: 30px;
  height: 26px;
  border: 1px solid var(--border-light);
  border-radius: 7px;
  background: var(--bg-surface);
  color: var(--text-tertiary);
  cursor: pointer;
}

.column-highlight-btn.active {
  color: #92400e;
  border-color: #f59e0b;
  background: #fef3c7;
}

.invoice-card-empty {
  color: var(--text-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 120px;
}

.invoice-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.invoice-name {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 800;
  color: var(--brand-primary);
}

.invoice-status {
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 700;
}

.st-new {
  background: #e5e7eb;
  color: #334155;
}

.st-work {
  background: #dbeafe;
  color: #1d4ed8;
}

.st-approve {
  background: #dcfce7;
  color: #15803d;
}

.st-reject {
  background: #fee2e2;
  color: #dc2626;
}

.invoice-meta {
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.35;
}

.invoice-meta span {
  color: var(--text-tertiary);
}

.invoice-split {
  border-top: 1px solid var(--border-light);
}

.invoice-inline-meta {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  gap: 10px;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.35;
  flex-wrap: nowrap;
}

.invoice-inline-meta b {
  color: var(--text-primary);
}

.meta-separator {
  color: var(--text-tertiary);
  font-weight: 600;
}

.invoice-inline-meta-bottom {
  gap: 10px;
}

.meta-stack {
  display: inline-flex;
  flex-direction: column;
  gap: 1px;
  min-width: 88px;
  padding: 4px 6px;
  border-radius: 6px;
}

.meta-stack small {
  color: var(--text-tertiary);
  font-size: 10px;
  line-height: 1.2;
}

.meta-delivery {
  margin-left: 2px;
  padding: 4px 6px;
  border-radius: 6px;
}

.state-good {
  background: #dcfce7;
  color: #166534;
}

.state-warn {
  background: #fef3c7;
  color: #92400e;
}

.state-bad {
  background: #fee2e2;
  color: #991b1b;
}

.invoice-actions {
  margin-top: auto;
  display: flex;
  gap: 8px;
}

.invoice-actions.single-action .btn {
  width: auto;
  align-self: flex-start;
}

.invoice-actions.outside-action {
  margin-top: 0;
  padding-left: 2px;
}

.row-highlighted {
  background: #fff8dc;
  border-color: #facc15;
}

.column-highlighted {
  background: #fff7e6;
  border-color: #f59e0b;
}

.btn {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  padding: 7px 10px;
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
  background: var(--brand-primary);
  border-color: var(--brand-primary);
  color: #fff;
}

.btn-primary:hover {
  filter: brightness(0.96);
  color: #fff;
}

.btn-success {
  border-color: #10b981;
  color: #047857;
  background: #ecfdf5;
}

.btn-danger {
  border-color: #ef4444;
  color: #b91c1c;
  background: #fef2f2;
}

.btn-delivery {
  border-color: #14b8a6;
  color: #0f766e;
  background: #f0fdfa;
}

.request-item-card {
  overflow: hidden;
}

.request-item-head,
.request-item-values {
  display: grid;
  grid-template-columns: 56px 274px 90px 100px 100px;
}

.request-item-head {
  background: var(--bg-subtle);
  border-bottom: 1px solid var(--border-light);
}

.request-item-head span {
  padding: 8px;
  font-size: 11px;
  color: var(--text-secondary);
  text-transform: uppercase;
  line-height: 1.2;
  border-right: 1px solid var(--border-light);
}

.request-item-head span:last-child {
  border-right: none;
}

.request-item-values span {
  padding: 9px 8px;
  font-size: 12px;
  color: var(--text-primary);
  border-right: 1px solid var(--border-light);
  min-height: 38px;
  display: flex;
  align-items: center;
  white-space: normal;
  word-break: break-word;
}

.request-item-values span:last-child {
  border-right: none;
}

.request-num-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.row-highlight-btn {
  width: 24px;
  height: 22px;
  border: 1px solid var(--border-light);
  border-radius: 6px;
  background: var(--bg-subtle);
  color: var(--text-tertiary);
  cursor: pointer;
  font-size: 11px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.row-highlight-btn.active {
  color: #92400e;
  border-color: #f59e0b;
  background: #fde68a;
}

.invoice-item-card {
  overflow: hidden;
  align-self: stretch;
}

.mapped-item-block {
  border-bottom: 10px solid transparent;
}

.mapped-item-block:last-child {
  border-bottom: none;
}

.mapped-total {
  border-top: 1px dashed var(--border-light);
  padding: 8px 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  color: var(--text-secondary);
  font-size: 12px;
}

.mapped-total b {
  color: var(--text-primary);
}

.item-card-title {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.35;
}

.item-card-title input {
  margin-top: 2px;
}

.item-card-head,
.item-card-values {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
}

.item-card-head {
  border-top: 1px solid var(--border-light);
  border-bottom: 1px solid var(--border-light);
  background: var(--bg-subtle);
}

.item-card-head span {
  padding: 8px;
  font-size: 11px;
  text-transform: uppercase;
  color: var(--text-secondary);
  border-right: 1px solid var(--border-light);
}

.item-card-head span:last-child {
  border-right: none;
}

.item-card-values span {
  padding: 9px 8px;
  font-size: 12px;
  color: var(--text-primary);
  border-right: 1px solid var(--border-light);
  min-height: 38px;
  display: flex;
  align-items: center;
  white-space: normal;
  word-break: break-word;
}

.item-card-values span:last-child {
  border-right: none;
}

.item-card-values span.price-best {
  background: #dcfce7;
  color: #166534;
  font-weight: 700;
}

.item-card-values span.price-worst {
  background: #fee2e2;
  color: #991b1b;
  font-weight: 700;
}

.mapped-total.price-best {
  background: #dcfce7;
  color: #166534;
  border-top-color: #86efac;
}

.mapped-total.price-worst {
  background: #fee2e2;
  color: #991b1b;
  border-top-color: #fca5a5;
}

.item-card-empty {
  min-height: 104px;
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

@media (max-width: 960px) {
  .compare-header {
    flex-wrap: wrap;
  }
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
  position: relative;
  background: #fff;
  border: 1px solid var(--border-light);
  border-radius: 12px;
  padding: 14px;
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.22);
  display: flex;
  flex-direction: column;
  gap: 10px;
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

.modal-label {
  color: var(--text-tertiary);
  font-size: 12px;
}

.modal-input {
  width: 100%;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  padding: 8px 10px;
  background: var(--bg-surface);
  color: var(--text-primary);
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

.empty-item {
  color: var(--text-tertiary);
  font-size: 12px;
  padding: 8px;
}

.selected-list {
  border-top: 1px dashed var(--border-light);
  padding-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.selected-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--border-light);
  border-radius: 999px;
  padding: 4px 6px 4px 8px;
  font-size: 12px;
  color: var(--text-primary);
  background: var(--bg-subtle);
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
</style>
