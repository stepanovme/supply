<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TopNav from '../components/layout/TopNav.vue'
import { mainNavLinks } from '../constants/mainNav'

const route = useRoute()
const router = useRouter()

const navLinks = mainNavLinks
const SERVICE_ID = '7dd8be78-cf3a-423a-852f-eab3511fbe30'

const loading = ref(false)
const loadError = ref('')
const delivery = ref(null)
const deliveryItems = ref([])
const invoiceData = ref(null)
const requestData = ref(null)
const acceptMessage = ref('')

const counterpartyOptions = ref([])
const objectOptions = ref([])
const warehouseOptions = ref([])
const userOptions = ref([])

const normalizeArray = (payload) => {
  if (Array.isArray(payload)) return payload
  return payload?.items || payload?.data || payload?.results || []
}

const invoiceItemsById = computed(() => {
  const map = new Map()
  for (const item of normalizeArray(invoiceData.value?.items)) {
    const keys = [
      String(item?.id || ''),
      String(item?.invoice_item_id || ''),
    ].filter(Boolean)
    for (const key of keys) {
      if (!map.has(key)) map.set(key, item)
    }
  }
  return map
})

const requestItemsById = computed(() => {
  const map = new Map()
  for (const item of normalizeArray(requestData.value?.items)) {
    map.set(String(item?.id || ''), item)
  }
  return map
})

const deliveryId = computed(() => String(route.params.deliveryId || ''))
const backPath = computed(() => String(route.query.back || '/deliveries'))
const cameFromWarehouse = computed(() => backPath.value.includes('/warehouses/'))

const parseDate = (value) => {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (raw.includes('T')) return raw.slice(0, 10)
  return raw.slice(0, 10)
}

const parseTime = (value) => {
  const raw = String(value || '').trim()
  if (!raw || !raw.includes('T')) return ''
  return raw.slice(11, 16)
}

const buildPlaceLabel = (item) => {
  const prefix = item?.kind === 'warehouse'
    ? 'Склад'
    : item?.kind === 'object'
      ? 'Объект'
      : 'Юридический адрес'
  const name = String(item?.name || '').trim()
  const address = String(item?.address || '').trim()
  if (!name && !address) return ''
  if (!address) return `${prefix} - ${name}`
  if (!name) return `${prefix} - ${address}`
  return `${prefix} - ${name} - ${address}`
}

const findPlaceLabel = (type, id, fallbackName) => {
  const key = String(id || '')
  const fallback = String(fallbackName || '').trim()
  let source = counterpartyOptions.value
  if (type === 'warehouse') source = warehouseOptions.value
  if (type === 'object') source = objectOptions.value
  const matched = source.find((item) => String(item.id) === key)
  return buildPlaceLabel(matched) || fallback || '—'
}

const resolveCounterpartyAddress = async (counterpartyId) => {
  const id = String(counterpartyId || '')
  if (!id) return
  const current = counterpartyOptions.value.find((item) => String(item.id) === id)
  if (!current || String(current.address || '').trim()) return
  try {
    let address = ''
    const detailEndpoints = [
      `/apiref/ref/counterparties/llc/${encodeURIComponent(id)}`,
      `/apiref/ref/counterparties/ip/${encodeURIComponent(id)}`,
      `/apiref/ref/counterparties/phys/${encodeURIComponent(id)}`,
    ]
    for (const endpoint of detailEndpoints) {
      // eslint-disable-next-line no-await-in-loop
      const detailRes = await fetch(endpoint, { credentials: 'include' })
      if (!detailRes.ok) continue
      // eslint-disable-next-line no-await-in-loop
      const detailPayload = await detailRes.json()
      address = String(
        detailPayload?.details?.legal_address
        || detailPayload?.details?.actual_address
        || detailPayload?.details?.postal_address
        || detailPayload?.address_registration
        || detailPayload?.address_living
        || ''
      ).trim()
      if (address) break
    }
    if (!address) return
    counterpartyOptions.value = counterpartyOptions.value.map((item) => (
      String(item.id) === id ? { ...item, address } : item
    ))
  } catch {
    // ignore address lookup errors, the page can still be opened without them
  }
}

const selectedCarrierName = computed(() => {
  const id = String(delivery.value?.carrier_id || '')
  const matched = counterpartyOptions.value.find((item) => String(item.id) === id)
  return buildPlaceLabel(matched) || String(delivery.value?.carrier_name || '—')
})

const selectedFromName = computed(() => findPlaceLabel(
  String(delivery.value?.delivery_from_type || 'company'),
  delivery.value?.delivery_from,
  delivery.value?.delivery_from_name,
))

const selectedToName = computed(() => findPlaceLabel(
  String(delivery.value?.delivery_to_type || 'company'),
  delivery.value?.delivery_to,
  delivery.value?.delivery_to_name,
))

const selectedDriverName = computed(() => {
  const id = String(delivery.value?.driver_id || '')
  const matched = userOptions.value.find((item) => String(item.id) === id)
  return matched?.name || String(delivery.value?.driver_name || '—')
})

const pageTitle = computed(() => {
  const num = String(delivery.value?.num || '').trim()
  return num ? `Доставка № ${num}` : `Доставка ${deliveryId.value}`
})

const pageSubtitle = computed(() => {
  const invoiceLabel = String(delivery.value?.invoice_num || delivery.value?.invoice_id || '').trim()
  const requestLabel = String(delivery.value?.request_num || delivery.value?.request_id || '').trim()
  const parts = []
  if (invoiceLabel) parts.push(`Счёт: ${invoiceLabel}`)
  if (requestLabel) parts.push(`Заявка: ${requestLabel}`)
  return parts.join(' • ') || 'Плановая доставка'
})

const formState = computed(() => ({
  possiblePickup: parseDate(delivery.value?.pick_up_date),
  pickupPlanned: parseDate(delivery.value?.pick_up_date_planned),
  deliveryDateFrom: parseDate(delivery.value?.planned_delivery_from),
  deliveryDateTo: parseDate(delivery.value?.planned_delivery_to),
  deliveryTimeFrom: parseTime(delivery.value?.planned_delivery_from),
  deliveryTimeTo: parseTime(delivery.value?.planned_delivery_to),
  comment: String(delivery.value?.comment || ''),
}))

const openBack = () => {
  router.push(backPath.value)
}

const acceptDelivery = () => {
  router.push({
    name: 'delivery-process',
    params: { deliveryId: deliveryId.value },
    query: {
      back: route.fullPath,
      warehouse_id: route.query.warehouse_id || '',
    },
  })
}

const toItemRow = (item, index) => {
  const invoiceItemId = String(item?.invoice_item_id || '')
  const requestItemId = String(item?.request_item_id || '')
  const invoiceItem = invoiceItemsById.value.get(invoiceItemId)
  const requestItem = requestItemsById.value.get(requestItemId)
  return {
    id: String(item?.id || `item-${index + 1}`),
    invoiceName: String(invoiceItem?.name || item?.name || item?.nomenclature_name || '—'),
    invoiceUnit: String(invoiceItem?.unit_name || item?.unit_name || '—'),
    requestName: String(requestItem?.name || requestItem?.nomenclature?.name || '—'),
    requestUnit: String(requestItem?.unit?.name || requestItem?.nomenclature?.unit?.name || item?.unit_name || '—'),
    baseQty: item?.quantity ?? invoiceItem?.quantity ?? requestItem?.quantity ?? '',
    qtyToDeliver: item?.quantity ?? invoiceItem?.quantity ?? requestItem?.quantity ?? '',
    included: true,
    requestItemId,
    invoiceItemId,
  }
}

const allRowsIncluded = computed(() => {
  if (!deliveryItems.value.length) return false
  return deliveryItems.value.every((row) => row?.included)
})

const toggleAllRows = (included) => {
  deliveryItems.value = deliveryItems.value.map((row) => ({
    ...row,
    included,
    qtyToDeliver: included ? row.baseQty : 0,
  }))
}

const toggleRowIncluded = (rowId, included) => {
  const key = String(rowId || '')
  deliveryItems.value = deliveryItems.value.map((row) => {
    if (String(row.id || '') !== key) return row
    return {
      ...row,
      included,
      qtyToDeliver: included ? row.baseQty : 0,
    }
  })
}

const loadReferenceOptions = async () => {
  const tasks = [
    fetch('/apiref/ref/counterparties', { credentials: 'include' }).catch(() => null),
    fetch('/apiref/ref/objects', { credentials: 'include' }).catch(() => null),
    fetch('/apisup/supply/warehouses', { credentials: 'include' }).catch(() => null),
    fetch(`/api/as/users/service/${encodeURIComponent(SERVICE_ID)}?page=1&limit=100`, { credentials: 'include' }).catch(() => null),
  ]
  const [counterpartiesRes, objectsRes, warehousesRes, usersRes] = await Promise.all(tasks)

  if (counterpartiesRes?.ok) {
    const payload = await counterpartiesRes.json()
    counterpartyOptions.value = normalizeArray(payload).map((item) => ({
      id: String(item?.id || ''),
      name: String(item?.short_name || item?.full_name || item?.name || '').trim(),
      address: '',
      kind: 'company',
    })).filter((item) => item.id && item.name)
  }

  if (objectsRes?.ok) {
    const payload = await objectsRes.json()
    objectOptions.value = normalizeArray(payload).map((item) => ({
      id: String(item?.id || ''),
      name: String(item?.short_name || item?.full_name || item?.name || '').trim(),
      address: String(item?.address || item?.full_address || '').trim(),
      kind: 'object',
    })).filter((item) => item.id && item.name)
  }

  if (warehousesRes?.ok) {
    const payload = await warehousesRes.json()
    warehouseOptions.value = normalizeArray(payload).map((item) => ({
      id: String(item?.id || ''),
      name: String(item?.name || item?.short_name || '').trim(),
      address: String(item?.address || item?.full_address || item?.location || '').trim(),
      kind: 'warehouse',
    })).filter((item) => item.id && item.name)
  }

  if (usersRes?.ok) {
    const payload = await usersRes.json()
    userOptions.value = normalizeArray(payload?.items || payload).map((item) => ({
      id: String(item?.id || ''),
      name: [item?.surname, item?.name, item?.patronymic].filter(Boolean).join(' ').trim(),
    })).filter((item) => item.id && item.name)
  }
}

const loadDelivery = async () => {
  if (!deliveryId.value) return
  loading.value = true
  loadError.value = ''
  try {
    const [deliveryRes] = await Promise.all([
      fetch(`/apisup/supply/deliveries/${encodeURIComponent(deliveryId.value)}`, { credentials: 'include' }),
      loadReferenceOptions(),
    ])
    if (!deliveryRes.ok) throw new Error('delivery load failed')
    const payload = await deliveryRes.json()
    delivery.value = payload

    await Promise.all([
      resolveCounterpartyAddress(payload?.carrier_id),
      payload?.delivery_from_type === 'company' ? resolveCounterpartyAddress(payload?.delivery_from) : Promise.resolve(),
      payload?.delivery_to_type === 'company' ? resolveCounterpartyAddress(payload?.delivery_to) : Promise.resolve(),
    ])

    const invoiceTasks = []
    if (payload?.invoice_id) {
      invoiceTasks.push(
        fetch(`/apisup/supply/invoices/${encodeURIComponent(String(payload.invoice_id))}`, { credentials: 'include' }).catch(() => null)
      )
    } else {
      invoiceTasks.push(Promise.resolve(null))
    }
    if (payload?.request_id) {
      invoiceTasks.push(
        fetch(`/apisup/supply/requests/my/${encodeURIComponent(String(payload.request_id))}`, { credentials: 'include' }).catch(() => null)
      )
    } else {
      invoiceTasks.push(Promise.resolve(null))
    }
    const [invoiceRes, requestRes] = await Promise.all(invoiceTasks)
    invoiceData.value = invoiceRes?.ok ? await invoiceRes.json() : null
    requestData.value = requestRes?.ok ? await requestRes.json() : null

    let items = normalizeArray(payload?.items)
    if (!items.length) {
      const itemsRes = await fetch(`/apisup/supply/deliveries/${encodeURIComponent(deliveryId.value)}/items`, { credentials: 'include' }).catch(() => null)
      if (itemsRes?.ok) {
        items = normalizeArray(await itemsRes.json())
      }
    }
    deliveryItems.value = items.map(toItemRow)
  } catch {
    delivery.value = null
    deliveryItems.value = []
    invoiceData.value = null
    requestData.value = null
    loadError.value = 'Не удалось загрузить доставку.'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadDelivery()
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
        <div>
          <h1 class="page-title">{{ pageTitle }}</h1>
          <p class="page-subtitle">{{ pageSubtitle }}</p>
        </div>
        <button v-if="cameFromWarehouse" type="button" class="accept-btn" @click="acceptDelivery">
          Принять доставку
        </button>
      </header>

      <div v-if="loading" class="inline-state">Загрузка...</div>
      <div v-else-if="loadError" class="inline-state error">{{ loadError }}</div>

      <template v-else-if="delivery">
        <div v-if="acceptMessage" class="inline-state success">{{ acceptMessage }}</div>
        <section class="plan-form">
          <div class="row one-col">
            <label class="field-label">Перевозчик</label>
            <input :value="selectedCarrierName" class="field-input" type="text" readonly>
          </div>

          <div class="row four-col">
            <div>
              <label class="field-label">Возможно забрать</label>
              <input :value="formState.possiblePickup" class="field-input" type="date" readonly>
            </div>
            <div>
              <label class="field-label">Планируем забрать</label>
              <input :value="formState.pickupPlanned" class="field-input" type="date" readonly>
            </div>
            <div class="span-two">
              <label class="field-label">Планируем доставить</label>
              <div class="delivery-window">
                <span class="delivery-window-label">С</span>
                <input :value="formState.deliveryDateFrom" class="field-input slim" type="date" readonly>
                <input :value="formState.deliveryTimeFrom" class="field-input tiny" type="time" readonly>
                <span class="delivery-window-label">По</span>
                <input :value="formState.deliveryDateTo" class="field-input slim" type="date" readonly>
                <input :value="formState.deliveryTimeTo" class="field-input tiny" type="time" readonly>
              </div>
            </div>
          </div>

          <div class="row one-col">
            <div>
              <label class="field-label">Откуда везти</label>
              <input :value="selectedFromName" class="field-input" type="text" readonly>
            </div>
          </div>

          <div class="row one-col">
            <div>
              <label class="field-label">Куда везти</label>
              <input :value="selectedToName" class="field-input" type="text" readonly>
            </div>
          </div>

          <div class="row one-col">
            <div>
              <label class="field-label">Водитель</label>
              <input :value="selectedDriverName" class="field-input" type="text" readonly>
            </div>
          </div>

          <div class="row one-col">
            <label class="field-label">Комментарий к доставке</label>
            <textarea :value="formState.comment" class="field-input textarea" rows="2" readonly></textarea>
          </div>
        </section>

        <section class="positions-block">
          <div class="positions-head">
            <h2>Позиции из счета и заявки</h2>
            <button
              class="toggle-all-btn"
              type="button"
              @click="toggleAllRows(!allRowsIncluded)"
            >
              {{ allRowsIncluded ? 'Не включать все позиции' : 'Включать все позиции' }}
            </button>
          </div>

          <div class="table-wrap">
            <table class="positions-table">
              <thead>
                <tr>
                  <th>Название</th>
                  <th>Ед. изм.</th>
                  <th>Кол-во</th>
                  <th>Управление</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in deliveryItems" :key="row.id">
                  <td>
                    <div class="name-block-vertical">
                      <span class="name-label">Название из счета:</span>
                      <span class="name-value">{{ row.invoiceName || '—' }}</span>
                      <span class="name-label">Название из заявки:</span>
                      <span class="name-value">{{ row.requestName || '—' }}</span>
                    </div>
                  </td>
                  <td>{{ row.invoiceUnit || row.requestUnit || '—' }}</td>
                  <td>
                    <input v-model="row.qtyToDeliver" class="qty-input" type="text" :disabled="!row.included">
                  </td>
                  <td>
                    <div class="row-actions">
                      <span class="state-marker" :class="row.included ? 'included' : 'excluded'">
                        {{ row.included ? 'Включена' : 'Не включена' }}
                      </span>
                      <button
                        v-if="row.included"
                        type="button"
                        class="row-btn"
                        @click="toggleRowIncluded(row.id, false)"
                      >
                        Не включать позицию
                      </button>
                      <button
                        v-else
                        type="button"
                        class="row-btn"
                        @click="toggleRowIncluded(row.id, true)"
                      >
                        Включать позицию
                      </button>
                    </div>
                  </td>
                </tr>
                <tr v-if="!deliveryItems.length">
                  <td colspan="4" class="empty">Позиции доставки отсутствуют</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

      </template>
    </main>
  </div>
</template>

<style scoped>
.page {
  width: 100%;
  min-height: 100vh;
}

.main-content {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.page-head {
  display: flex;
  align-items: center;
  gap: 12px;
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

.accept-btn {
  margin-left: auto;
  border: 1px solid var(--brand-primary);
  border-radius: 8px;
  background: var(--brand-primary);
  color: #fff;
  padding: 8px 12px;
  cursor: pointer;
}

.accept-btn:hover {
  background: color-mix(in srgb, var(--brand-primary) 88%, #000);
}

.page-title {
  margin: 0;
  font-size: 22px;
  color: var(--text-primary);
}

.page-subtitle {
  margin: 2px 0 0;
  color: var(--text-tertiary);
  font-size: 13px;
}

.inline-state {
  font-size: 13px;
  color: var(--text-secondary);
}

.inline-state.error {
  color: var(--danger-text);
}

.inline-state.success {
  color: #166534;
}

.plan-form,
.positions-block {
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: var(--bg-surface);
  padding: 12px;
}


.row {
  display: grid;
  gap: 10px;
  margin-bottom: 10px;
}

.row:last-child {
  margin-bottom: 0;
}

.row.one-col {
  grid-template-columns: 1fr;
}

.row.four-col {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.span-two {
  grid-column: span 2;
}

.field-label {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.field-input {
  width: 100%;
  min-height: 36px;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--bg-subtle);
  padding: 0 10px;
  color: var(--text-primary);
}

.textarea {
  min-height: 74px;
  padding: 8px 10px;
  resize: vertical;
}

.delivery-window {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) 120px auto minmax(0, 1fr) 120px;
  gap: 8px;
  align-items: center;
}

.delivery-window-label {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 600;
}

.positions-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.positions-head h2 {
  margin: 0;
  font-size: 16px;
}


.toggle-all-btn,
.row-btn {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  cursor: pointer;
}

.toggle-all-btn {
  padding: 7px 10px;
}

.row-btn {
  padding: 6px 8px;
  font-size: 12px;
}

.toggle-all-btn:hover,
.row-btn:hover {
  border-color: var(--brand-primary);
  color: var(--brand-primary);
}

.table-wrap {
  overflow: auto;
}


.positions-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 13px;
}

.positions-table th,
.positions-table td {
  border-bottom: 1px solid var(--border-light);
  padding: 8px;
  vertical-align: top;
}

.positions-table th {
  background: var(--bg-subtle);
  color: var(--text-secondary);
  font-weight: 600;
  text-align: left;
}

.positions-table th:nth-child(2),
.positions-table td:nth-child(2),
.positions-table th:nth-child(3),
.positions-table td:nth-child(3),
.positions-table th:nth-child(4),
.positions-table td:nth-child(4) {
  width: 170px;
}

.qty-input {
  width: 100%;
  min-height: 34px;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  padding: 0 8px;
  background: var(--bg-subtle);
}

.row-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.state-marker {
  font-size: 12px;
  border-radius: 999px;
  padding: 3px 8px;
  width: fit-content;
}

.state-marker.included {
  background: #dcfce7;
  color: #166534;
}

.state-marker.excluded {
  background: #fee2e2;
  color: #991b1b;
}


.name-block-vertical {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.name-label {
  color: var(--text-tertiary);
  font-size: 12px;
}

.name-value {
  color: var(--text-primary);
  white-space: normal;
  word-break: break-word;
}

.empty {
  text-align: center;
  color: var(--text-tertiary);
}

@media (max-width: 1200px) {
  .row.four-col {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .span-two {
    grid-column: span 2;
  }
}

@media (max-width: 860px) {
  .main-content {
    padding: 16px;
  }

  .page-head {
    flex-wrap: wrap;
  }

  .accept-btn {
    margin-left: 0;
  }

  .row.four-col {
    grid-template-columns: 1fr;
  }

  .span-two {
    grid-column: auto;
  }

  .positions-head {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
