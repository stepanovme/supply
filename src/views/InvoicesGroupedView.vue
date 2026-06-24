<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TopNav from '../components/layout/TopNav.vue'
import ChatPanel from '../components/chat/ChatPanel.vue'
import { useAuthStore } from '../stores/auth'
import { useChatStore } from '../stores/chat'
import { mainNavLinks } from '../constants/mainNav'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const chat = useChatStore()
const navLinks = mainNavLinks

const loading = ref(true)
const loadError = ref('')
const invoices = ref([])
const resolvingProjectLink = ref(false)
const structureCache = ref(new Map())
const openSections = ref({
  approval: true,
  planning: true,
  payment: true,
  attention: true,
})

const currentUserId = computed(() => String(auth?.user?.id || ''))

const normalizeArray = (payload) => {
  if (Array.isArray(payload)) return payload
  return payload?.items || payload?.data || payload?.results || []
}

const toMoneyNumber = (value) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

const formatMoney = (value) => {
  const n = Number(value)
  if (!Number.isFinite(n)) return '0,00 ₽'
  return `${n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`
}

const formatDate = (value) => {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('ru-RU')
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

const hasMentions = (chatId) => {
  if (!chatId) return false
  const b = chat.badges[chatId]
  return b && !b.loading && b.mention
}

const getBadge = (chatId) => {
  if (!chatId) return null
  const b = chat.badges[chatId]
  if (!b || b.loading) return null
  return b.mention || b.unread ? b : null
}

const findNodeById = (nodes, targetId) => {
  const list = normalizeArray(nodes)
  for (const node of list) {
    if (String(node?.id || '') === String(targetId || '')) return node
    const found = findNodeById(node?.children, targetId)
    if (found) return found
  }
  return null
}

const paidPercentForRow = (row) => {
  const total = toMoneyNumber(row?.totalAmountNum)
  const paid = toMoneyNumber(row?.paidAmountNum)
  if (total <= 0 || paid <= 0) return 0
  return Math.max(0, Math.min(100, (paid / total) * 100))
}

const buildRow = (inv) => {
  const row = {
    totalAmountNum: toMoneyNumber(inv?.total_amount),
    key: String(inv?.id || ''),
    isUrgent: Boolean(inv?.is_urgent),
    requestId: inv?.request_id,
    objectLevelsId: inv?.object_levels_id,
    invoiceId: inv?.id,
    statusName: String(inv?.status_name || ''),
    statusClass: statusClassFromName(inv?.status_name),
    invoiceName: `Счет ${inv?.num || 'без номера'} от ${formatDate(inv?.date)}`,
    invoiceNameRaw: String(inv?.num || ''),
    amount: formatMoney(inv?.total_amount),
    paidAmountNum: normalizeArray(inv?.payments).reduce((acc, payment) => acc + toMoneyNumber(payment?.paid), 0),
    participants: [
      { icon: 'fas fa-plus', name: shortFio(inv?.created_by_user) },
      ...normalizeArray(inv?.planning).map((item) => ({ icon: 'fas fa-calendar-lines-pen', name: shortFio(item?.user) })),
      ...normalizeArray(inv?.payment).map((item) => ({ icon: 'fas fa-ruble-sign', name: shortFio(item?.user) })),
    ].filter((item) => item.name !== '—'),
    approvals: normalizeArray(inv?.approvals).map((approval) => ({
      name: approval?.user?.short_fio || shortFio(approval?.user),
      variant: approvalVariant(approval?.status_name || approval?.answer),
    })),
    providerId: inv?.provider_id,
    provider: inv?.provider_name || '—',
    payerId: inv?.payer_id,
    payer: inv?.payer_name || '—',
    fromByUserId: inv?.from_by,
    fromByUser: inv?.from_by_user?.short_fio || '—',
    invoiceDate: formatDate(inv?.date),
    createdDate: formatDate(inv?.created_at),
    plannedDate: formatDate(firstPlannedPaymentDate(inv?.payments)),
    paymentsCount: normalizeArray(inv?.payments).length,
    paidPaymentsCount: normalizeArray(inv?.payments).filter((item) => toMoneyNumber(item?.paid) > 0).length,
    rawInvoiceDate: String(inv?.date || ''),
    rawCreatedDate: String(inv?.created_at || ''),
    paymentLines: normalizeArray(inv?.payments).map((payment) => ({
      amount: formatMoney(payment?.value),
      date: formatDate(payment?.paid_at || payment?.date_plan),
      rawDate: String(payment?.paid_at || payment?.date_plan || ''),
      isPaid: toMoneyNumber(payment?.paid) > 0 || Boolean(payment?.paid_at),
    })),
    project: inv?.project_name || '—',
    requestName: inv?.request_name || `Заявка #${inv?.request_id || ''}`,
    chatId: inv?.chat_id || null,
    comment: String(inv?.comment || ''),
  }
  return row
}

const loadData = async () => {
  loading.value = true
  loadError.value = ''
  try {
    const res = await fetch('/apisup/supply/invoices/my', { credentials: 'include' })
    if (!res.ok) throw new Error('load failed')
    const payload = await res.json()
    invoices.value = normalizeArray(payload)

    nextTick(() => {
      for (const inv of invoices.value) {
        if (inv.chat_id) {
          chat.fetchBadge(inv.chat_id)
        }
      }
    })
  } catch {
    invoices.value = []
    loadError.value = 'Не удалось загрузить счета.'
  } finally {
    loading.value = false
  }
}

const userId = computed(() => currentUserId.value)

const approvalInvoices = computed(() =>
  invoices.value.filter((inv) =>
    normalizeArray(inv?.approvals).some(
      (a) => String(a?.user_id || '') === userId.value
        && String(a?.status_name || '').toLowerCase() === 'pending'
    )
  ).map(buildRow)
)

const planningInvoices = computed(() => {
  if (!userId.value) return []
  return invoices.value.filter((inv) => {
    const isPlanner = normalizeArray(inv?.planning).some(
      (p) => String(p?.user_id || '') === userId.value
    )
    if (!isPlanner) return false
    const payments = normalizeArray(inv?.payments)
    if (!payments.length) return true
    const allPaid = payments.every((p) => toMoneyNumber(p?.paid) > 0)
    if (!allPaid) return false
    const totalPaid = payments.reduce((acc, p) => acc + toMoneyNumber(p?.paid), 0)
    const total = toMoneyNumber(inv?.total_amount)
    return totalPaid < total
  }).map(buildRow)
})

const paymentInvoices = computed(() => {
  if (!userId.value) return []
  return invoices.value.filter((inv) => {
    const isPayer = normalizeArray(inv?.payment).some(
      (p) => String(p?.user_id || '') === userId.value
    )
    if (!isPayer) return false
    const payments = normalizeArray(inv?.payments)
    if (!payments.length) return false
    return payments.some((p) => toMoneyNumber(p?.paid) <= 0)
  }).map(buildRow)
})

const attentionInvoices = computed(() =>
  invoices.value.filter((inv) => hasMentions(inv?.chat_id)).map(buildRow)
)

const openInvoice = (row, mode = 'view') => {
  if (!row?.invoiceId) return
  router.push({
    path: `/invoices/${encodeURIComponent(String(row.invoiceId))}`,
    query: { back: route.fullPath, mode },
  })
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

const handleCloseChat = () => {
  const chatId = chat.currentChatId
  chat.closePanel()
  if (chatId) {
    chat.refreshBadge(chatId)
  }
}

onMounted(() => {
  loadData()
})
</script>

<template>
  <div class="page">
    <TopNav :links="navLinks" />
    <ChatPanel v-if="chat.panelOpen" @close="handleCloseChat" />

    <main class="main-content">
      <header class="page-head">
        <h1 class="page-title">Счета</h1>
      </header>

      <div v-if="loading" class="inline-state">Загрузка счетов...</div>
      <div v-else-if="loadError" class="inline-state error">{{ loadError }}</div>

      <template v-else>
        <section class="group-section">
          <button type="button" class="group-header" @click="openSections.approval = !openSections.approval">
            <i class="fas fa-chevron-right" :class="{ rotated: openSections.approval }"></i>
            <span class="group-title">Требуется согласование</span>
            <span class="group-count">{{ approvalInvoices.length }}</span>
          </button>
          <div v-if="openSections.approval" class="group-body">
            <div v-if="!approvalInvoices.length" class="empty-row">Нет счетов, требующих согласования</div>
            <div v-else class="table-wrapper">
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
                    <tr v-for="row in approvalInvoices" :key="row.key">
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
                            <div class="payment-fill" :style="{ width: `${paidPercentForRow(row)}%` }"></div>
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
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        <section class="group-section">
          <button type="button" class="group-header" @click="openSections.planning = !openSections.planning">
            <i class="fas fa-chevron-right" :class="{ rotated: openSections.planning }"></i>
            <span class="group-title">Требуется запланировать платежи</span>
            <span class="group-count">{{ planningInvoices.length }}</span>
          </button>
          <div v-if="openSections.planning" class="group-body">
            <div v-if="!planningInvoices.length" class="empty-row">Нет счетов для планирования платежей</div>
            <div v-else class="table-wrapper">
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
                    <tr v-for="row in planningInvoices" :key="row.key">
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
                            <div class="payment-fill" :style="{ width: `${paidPercentForRow(row)}%` }"></div>
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
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        <section class="group-section">
          <button type="button" class="group-header" @click="openSections.payment = !openSections.payment">
            <i class="fas fa-chevron-right" :class="{ rotated: openSections.payment }"></i>
            <span class="group-title">Требуется оплата</span>
            <span class="group-count">{{ paymentInvoices.length }}</span>
          </button>
          <div v-if="openSections.payment" class="group-body">
            <div v-if="!paymentInvoices.length" class="empty-row">Нет счетов, требующих оплаты</div>
            <div v-else class="table-wrapper">
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
                    <tr v-for="row in paymentInvoices" :key="row.key">
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
                            <div class="payment-fill" :style="{ width: `${paidPercentForRow(row)}%` }"></div>
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
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        <section class="group-section">
          <button type="button" class="group-header" @click="openSections.attention = !openSections.attention">
            <i class="fas fa-chevron-right" :class="{ rotated: openSections.attention }"></i>
            <span class="group-title">Требуется ваше внимание</span>
            <span class="group-count">{{ attentionInvoices.length }}</span>
          </button>
          <div v-if="openSections.attention" class="group-body">
            <div v-if="!attentionInvoices.length" class="empty-row">Нет счетов, требующих внимания</div>
            <div v-else class="table-wrapper">
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
                    <tr v-for="row in attentionInvoices" :key="row.key">
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
                            <div class="payment-fill" :style="{ width: `${paidPercentForRow(row)}%` }"></div>
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
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      </template>
    </main>
  </div>
</template>

<style scoped>
.page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-page);
}

.main-content {
  flex: 1;
  width: 100%;
  padding: 24px 16px;
}

.page-head {
  margin-bottom: 24px;
}

.page-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.inline-state {
  text-align: center;
  padding: 40px 16px;
  color: var(--text-secondary);
  font-size: 14px;
}

.inline-state.error {
  color: var(--danger-text, #ef4444);
}

.group-section {
  margin-bottom: 16px;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background: var(--bg-surface);
  overflow: hidden;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 14px 16px;
  border: none;
  background: transparent;
  cursor: pointer;
  font: inherit;
  color: var(--text-primary);
  text-align: left;
  transition: background 0.15s;
}

.group-header:hover {
  background: var(--bg-subtle);
}

.group-header .fa-chevron-right {
  font-size: 11px;
  color: var(--text-secondary);
  transition: transform 0.2s;
}

.group-header .fa-chevron-right.rotated {
  transform: rotate(90deg);
}

.group-title {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
}

.group-count {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  font-family: "JetBrains Mono", monospace;
  background: var(--bg-subtle);
  padding: 2px 8px;
  border-radius: 6px;
}

.group-body {
  border-top: 1px solid var(--border-light);
}

.empty-row {
  text-align: center;
  color: var(--text-tertiary);
  padding: 18px 12px;
  font-size: 13px;
}

.table-wrapper {
  background: var(--bg-surface);
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
  color: var(--text-tertiary);
  font-size: 11px;
}

.user-row,
.project-line,
.request-line {
  margin-bottom: 4px;
}

.entity-label {
  font-weight: 600;
  color: var(--text-tertiary);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .3px;
  margin-bottom: 2px;
}

.user-icon {
  width: 16px;
  color: var(--text-secondary);
  margin-right: 2px;
  font-size: 9px;
}

.project-line {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.request-line {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dates-pay-row {
  margin-bottom: 4px;
  white-space: nowrap;
}

.dates-pay-row:last-child {
  margin-bottom: 0;
}

.dates-pay-row span {
  color: var(--text-tertiary);
}

.dates-pay-list {
  margin-top: 6px;
}

.dates-pay-line {
  white-space: nowrap;
  margin-bottom: 3px;
}

.dates-pay-line.pay-paid {
  color: var(--text-tertiary);
  text-decoration: line-through;
}

.dates-pay-line.pay-planned {
  color: var(--text-primary);
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
}

.st-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.st-green .st-dot {
  background: #22c55e;
}

.st-red .st-dot {
  background: #ef4444;
}

.st-amber .st-dot {
  background: #f59e0b;
}

.empty {
  color: var(--text-secondary);
  font-size: 12px;
}
</style>
