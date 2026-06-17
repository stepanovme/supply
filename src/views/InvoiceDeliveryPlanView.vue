<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TopNav from '../components/layout/TopNav.vue'
import { mainNavLinks } from '../constants/mainNav'

const route = useRoute()
const router = useRouter()

const navLinks = mainNavLinks

const SERVICE_ID = '7dd8be78-cf3a-423a-852f-eab3511fbe30'

const loading = ref(false)
const loadError = ref('')
const saveMessage = ref('')
const saveLoading = ref(false)
const invoice = ref(null)
const requestData = ref(null)
const mappings = ref([])

const counterpartyOptions = ref([])
const warehouseOptions = ref([])
const userOptions = ref([])

const carrierOpen = ref(false)
const fromOpen = ref(false)
const toOpen = ref(false)
const driverOpen = ref(false)
const responsibleOpen = ref(false)

const carrierQuery = ref('')
const fromQuery = ref('')
const toQuery = ref('')
const driverQuery = ref('')
const responsibleQuery = ref('')

const carrierId = ref('')
const availableFrom = ref('')
const pickupPlanned = ref('')
const deliveryPlanned = ref('')
const fromPlaceId = ref('')
const toPlaceId = ref('')
const responsibleIds = ref([])
const docsNeed = ref('')
const deliveryComment = ref('')
const driverId = ref('')

const normalizeArray = (payload) => {
  if (Array.isArray(payload)) return payload
  return payload?.items || payload?.data || payload?.results || []
}

const buildPlaceKey = (item) => `${String(item?.kind || 'company')}:${String(item?.id || '')}`

const buildPlaceLabel = (item) => {
  const prefix = item?.kind === 'warehouse' ? 'Склад' : 'Компания'
  const name = String(item?.name || '').trim()
  const address = String(item?.address || '').trim()
  if (!name && !address) return ''
  if (!address) return `${prefix} - ${name}`
  if (!name) return `${prefix} - ${address}`
  return `${prefix} - ${name} - ${address}`
}

const invoiceId = computed(() => String(route.params.invoiceId || ''))

const invoiceNumberLabel = computed(() => {
  const num = String(invoice.value?.num || '').trim()
  return num || invoiceId.value
})

const pageTitle = computed(() => `Планирование доставки • Счет ${invoiceNumberLabel.value}`)

const pageSubtitle = computed(() => {
  const provider = invoice.value?.provider?.short_name || invoice.value?.provider_name || '—'
  const payer = invoice.value?.payer?.short_name || invoice.value?.payer_name || '—'
  return `Поставщик: ${provider} • Плательщик: ${payer}`
})

const requestItemsById = computed(() => {
  const map = new Map()
  const list = normalizeArray(requestData.value?.items)
  for (const item of list) map.set(String(item?.id || ''), item)
  return map
})

const getMappingInvoiceItemId = (item) => String(
  item?.invoice_item_id
  || item?.invoice_item?.id
  || item?.invoiceItem?.id
  || ''
)

const getMappingRequestItemId = (item) => String(
  item?.request_item_id
  || item?.request_item?.id
  || item?.requestItem?.id
  || ''
)

const mappingByInvoiceItem = computed(() => {
  const map = new Map()
  for (const item of normalizeArray(mappings.value)) {
    const key = getMappingInvoiceItemId(item)
    if (!key || map.has(key)) continue
    map.set(key, item)
  }
  return map
})

const deliveryRows = ref([])
const allPlaceOptions = computed(() => ([
  ...counterpartyOptions.value,
  ...warehouseOptions.value,
]).filter((item) => item.id && item.name))

const filteredPlacesBy = (queryRef) => computed(() => {
  const q = String(queryRef.value || '').trim().toLowerCase()
  if (!q) return allPlaceOptions.value
  return allPlaceOptions.value.filter((item) => {
    const name = String(item?.name || '').toLowerCase()
    const address = String(item?.address || '').toLowerCase()
    const label = String(buildPlaceLabel(item) || '').toLowerCase()
    return name.includes(q) || address.includes(q) || label.includes(q)
  })
})

const filteredCounterpartiesBy = (queryRef) => computed(() => {
  const q = String(queryRef.value || '').trim().toLowerCase()
  if (!q) return counterpartyOptions.value
  return counterpartyOptions.value.filter((item) => {
    const name = String(item?.name || '').toLowerCase()
    const address = String(item?.address || '').toLowerCase()
    const label = String(buildPlaceLabel(item) || '').toLowerCase()
    return name.includes(q) || address.includes(q) || label.includes(q)
  })
})

const filteredUsersBy = (queryRef) => computed(() => {
  const q = String(queryRef.value || '').trim().toLowerCase()
  if (!q) return userOptions.value
  return userOptions.value.filter((item) => String(item?.name || '').toLowerCase().includes(q))
})

const carrierOptionsFiltered = filteredCounterpartiesBy(carrierQuery)
const fromOptionsFiltered = filteredPlacesBy(fromQuery)
const toOptionsFiltered = filteredPlacesBy(toQuery)
const driverOptionsFiltered = filteredUsersBy(driverQuery)
const responsibleOptionsFiltered = filteredUsersBy(responsibleQuery)

const selectedCarrierName = computed(() => counterpartyOptions.value.find((x) => x.id === carrierId.value)?.name || '')
const selectedFromName = computed(() => buildPlaceLabel(allPlaceOptions.value.find((x) => buildPlaceKey(x) === fromPlaceId.value)) || '')
const selectedToName = computed(() => buildPlaceLabel(allPlaceOptions.value.find((x) => buildPlaceKey(x) === toPlaceId.value)) || '')
const selectedDriverName = computed(() => userOptions.value.find((x) => x.id === driverId.value)?.name || '')

const selectedResponsibles = computed(() => {
  const ids = new Set(responsibleIds.value.map((x) => String(x)))
  return userOptions.value.filter((u) => ids.has(String(u.id)))
})

const hasPositiveQuantity = (row) => {
  const quantity = Number(String(row?.qtyToDeliver ?? row?.baseQty ?? 0).replace(',', '.'))
  return Number.isFinite(quantity) && quantity > 0
}

const includedRowsCount = computed(() => deliveryRows.value.filter((row) => row?.included && hasPositiveQuantity(row)).length)

const allRowsIncluded = computed(() => {
  if (!deliveryRows.value.length) return false
  return deliveryRows.value.every((row) => row?.included)
})

const canSave = computed(() => (
  includedRowsCount.value > 0
  && carrierId.value
  && pickupPlanned.value
  && deliveryPlanned.value
  && fromPlaceId.value
  && toPlaceId.value
))

const closeAllDropdowns = () => {
  carrierOpen.value = false
  fromOpen.value = false
  toOpen.value = false
  driverOpen.value = false
  responsibleOpen.value = false
}

const handleWindowMouseDown = (event) => {
  const target = event?.target
  if (!(target instanceof Element)) return
  if (!target.closest('.carrier-select')) carrierOpen.value = false
  if (!target.closest('.from-select')) fromOpen.value = false
  if (!target.closest('.to-select')) toOpen.value = false
  if (!target.closest('.driver-select')) driverOpen.value = false
  if (!target.closest('.responsible-select')) responsibleOpen.value = false
}

const openBack = () => {
  const back = String(route.query.back || '')
  if (back) {
    router.push(back)
    return
  }
  router.push(`/invoices/${encodeURIComponent(invoiceId.value)}`)
}

const selectCarrier = (item) => {
  carrierId.value = String(item?.id || '')
  carrierQuery.value = String(item?.name || '')
  carrierOpen.value = false
}

const selectFrom = (item) => {
  fromPlaceId.value = buildPlaceKey(item)
  fromQuery.value = buildPlaceLabel(item) || String(item?.name || '')
  fromOpen.value = false
}

const selectTo = (item) => {
  toPlaceId.value = buildPlaceKey(item)
  toQuery.value = buildPlaceLabel(item) || String(item?.name || '')
  toOpen.value = false
}

const selectDriver = (item) => {
  driverId.value = String(item?.id || '')
  driverQuery.value = String(item?.name || '')
  driverOpen.value = false
}

const toggleResponsible = (item) => {
  const id = String(item?.id || '')
  if (!id) return
  if (responsibleIds.value.includes(id)) {
    responsibleIds.value = responsibleIds.value.filter((x) => x !== id)
  } else {
    responsibleIds.value = [...responsibleIds.value, id]
  }
}

const removeResponsible = (id) => {
  const key = String(id || '')
  responsibleIds.value = responsibleIds.value.filter((x) => x !== key)
}

const toggleAllRows = (included) => {
  deliveryRows.value = deliveryRows.value.map((row) => ({
    ...row,
    included,
    qtyToDeliver: included ? row.baseQty : 0,
  }))
}

const toggleRowIncluded = (rowId, included) => {
  const key = String(rowId || '')
  deliveryRows.value = deliveryRows.value.map((row) => {
    if (String(row.id || '') !== key) return row
    return {
      ...row,
      included,
      qtyToDeliver: included ? row.baseQty : 0,
    }
  })
}

const buildDeliveryDateTime = (dateValue, hours, minutes) => {
  const raw = String(dateValue || '').slice(0, 10)
  if (!raw) return null
  const hh = String(hours).padStart(2, '0')
  const mm = String(minutes).padStart(2, '0')
  return `${raw}T${hh}:${mm}:00.000Z`
}

const parsePlaceRef = (value) => {
  const [kind = 'company', id = ''] = String(value || '').split(':')
  return {
    type: kind === 'warehouse' ? 'warehouse' : kind === 'object' ? 'object' : 'company',
    id: String(id || ''),
  }
}

const fetchFreshInvoiceItemMap = async () => {
  const id = String(invoice.value?.id || invoiceId.value || '')
  if (!id) return new Map()
  const res = await fetch(`/apisup/supply/invoices/${encodeURIComponent(id)}`, { credentials: 'include' })
  if (!res.ok) throw new Error('fresh invoice load failed')
  const payload = await res.json()
  const map = new Map()
  for (const item of normalizeArray(payload?.items)) {
    const keys = [
      String(item?.id || ''),
      String(item?.invoice_item_id || ''),
    ].filter(Boolean)
    for (const key of keys) {
      if (!map.has(key)) map.set(key, item)
    }
  }
  return map
}

const saveDeliveryPlan = async () => {
  if (!canSave.value || saveLoading.value || !invoice.value?.id) return
  saveLoading.value = true
  loadError.value = ''
  saveMessage.value = ''
  try {
    const fromRef = parsePlaceRef(fromPlaceId.value)
    const toRef = parsePlaceRef(toPlaceId.value)
    const freshInvoiceItems = await fetchFreshInvoiceItemMap()
    const res = await fetch('/apisup/supply/deliveries', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request_id: invoice.value?.request_id || 0,
        invoice_id: invoice.value?.id || 0,
        carrier_id: carrierId.value,
        pick_up_date: availableFrom.value || null,
        pick_up_date_planned: pickupPlanned.value,
        planned_delivery_from: buildDeliveryDateTime(deliveryPlanned.value, 9, 0),
        planned_delivery_to: buildDeliveryDateTime(deliveryPlanned.value, 18, 0),
        delivery_from: fromRef.id,
        delivery_from_type: fromRef.type,
        delivery_to: toRef.id,
        delivery_to_type: toRef.type,
        driver_id: driverId.value || null,
        comment: deliveryComment.value || '',
      }),
    })
    if (!res.ok) throw new Error('delivery create failed')
    const created = await res.json()
    const deliveryId = String(created?.id || '')
    if (!deliveryId) throw new Error('delivery id missing')

    const includedRows = deliveryRows.value.filter((row) => row?.included && hasPositiveQuantity(row))
    for (const row of includedRows) {
      const quantity = Number(String(row.qtyToDeliver ?? row.baseQty ?? 0).replace(',', '.'))
      if (!Number.isFinite(quantity) || quantity <= 0) continue
      const freshItem = freshInvoiceItems.get(String(row.id || ''))
        || freshInvoiceItems.get(String(row.invoiceItemId || ''))
        || null
      const resolvedInvoiceItemId = String(
        freshItem?.invoice_item_id
        || freshItem?.id
        || row.invoiceItemId
        || ''
      )
      const rawRequestItemId = freshItem?.request_item_id ?? row.requestItemId ?? null
      const resolvedRequestItemId = rawRequestItemId == null || rawRequestItemId === ''
        ? null
        : String(rawRequestItemId)
      const rawNomenclatureId = freshItem?.nomenclature_id ?? row.nomenclatureId ?? null
      const resolvedNomenclatureId = rawNomenclatureId == null || rawNomenclatureId === ''
        ? null
        : String(rawNomenclatureId)
      // eslint-disable-next-line no-await-in-loop
      const itemRes = await fetch(`/apisup/supply/deliveries/${encodeURIComponent(deliveryId)}/items`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nomenclature_id: resolvedNomenclatureId,
          request_item_id: resolvedRequestItemId,
          invoice_item_id: resolvedInvoiceItemId,
          name: row.requestName || row.invoiceName || '',
          unit_name: row.requestUnit || row.invoiceUnit || '',
          quantity,
        }),
      })
      if (!itemRes.ok) throw new Error('delivery item create failed')
    }

    saveMessage.value = 'Доставка запланирована.'
    window.setTimeout(() => {
      router.push('/deliveries')
    }, 350)
  } catch {
    loadError.value = 'Не удалось запланировать доставку.'
  } finally {
    saveLoading.value = false
  }
}

const toRow = (invoiceItem, index) => {
  const id = String(invoiceItem?.id || `row-${index + 1}`)
  const mapping = mappingByInvoiceItem.value.get(id)
  const requestItemId = getMappingRequestItemId(mapping)
  const invoiceItemId = String(invoiceItem?.invoice_item_id || invoiceItem?.id || id)
  const linkedRequestItemId = String(invoiceItem?.request_item_id || requestItemId || '')
  const requestItem = linkedRequestItemId
    ? requestItemsById.value.get(linkedRequestItemId)
    : null

  return {
    id,
    invoiceItemId,
    requestItemId: String(linkedRequestItemId || requestItem?.id || ''),
    nomenclatureId: String(
      requestItem?.nomenclature_id
      || requestItem?.nomenclature?.id
      || invoiceItem?.nomenclature_id
      || ''
    ),
    invoiceName: String(invoiceItem?.name || ''),
    invoiceUnit: String(invoiceItem?.unit_name || ''),
    invoiceQty: invoiceItem?.quantity ?? '',
    requestName: String(requestItem?.name || requestItem?.nomenclature?.name || ''),
    requestUnit: String(requestItem?.unit?.name || requestItem?.nomenclature?.unit?.name || ''),
    requestQty: requestItem?.quantity ?? '',
    baseQty: invoiceItem?.quantity ?? '',
    qtyToDeliver: invoiceItem?.quantity ?? '',
    included: true,
  }
}

const loadOptions = async () => {
  try {
    const counterpartiesRes = await fetch('/apiref/ref/counterparties', { credentials: 'include' })
    if (counterpartiesRes.ok) {
      const data = await counterpartiesRes.json()
      counterpartyOptions.value = normalizeArray(data).map((item) => ({
        id: String(item?.id || ''),
        name: String(item?.short_name || item?.full_name || item?.name || '').trim(),
        address: '',
        kind: 'company',
      })).filter((x) => x.id && x.name)
    }
  } catch {
    counterpartyOptions.value = []
  }

  try {
    const warehousesRes = await fetch('/apisup/supply/warehouses', { credentials: 'include' })
    if (warehousesRes.ok) {
      const payload = await warehousesRes.json()
      warehouseOptions.value = normalizeArray(payload).map((item) => ({
        id: String(item?.id || ''),
        name: String(item?.name || item?.short_name || '').trim(),
        address: String(item?.address || item?.full_address || item?.location || '').trim(),
        kind: 'warehouse',
      })).filter((x) => x.id && x.name)
    }
  } catch {
    warehouseOptions.value = []
  }

  try {
    const usersRes = await fetch(`/api/as/users/service/${encodeURIComponent(SERVICE_ID)}?page=1&limit=100`, {
      credentials: 'include',
    })
    if (usersRes.ok) {
      const payload = await usersRes.json()
      userOptions.value = normalizeArray(payload?.items || payload).map((item) => ({
        id: String(item?.id || ''),
        name: [item?.surname, item?.name, item?.patronymic].filter(Boolean).join(' ').trim(),
      })).filter((x) => x.id && x.name)
    }
  } catch {
    userOptions.value = []
  }
}

const loadDeliveryData = async () => {
  const id = String(invoiceId.value || '')
  if (!id) return
  loading.value = true
  loadError.value = ''
  try {
    const invoiceRes = await fetch(`/apisup/supply/invoices/${encodeURIComponent(id)}`, { credentials: 'include' })
    if (!invoiceRes.ok) throw new Error('invoice load failed')
    const invoicePayload = await invoiceRes.json()
    invoice.value = invoicePayload

    const tasks = [
      fetch(`/apisup/supply/item-mappings?invoice_id=${encodeURIComponent(id)}`, { credentials: 'include' }).catch(() => null),
      loadOptions(),
    ]

    if (invoicePayload?.request_id) {
      tasks.push(
        fetch(`/apisup/supply/requests/my/${encodeURIComponent(String(invoicePayload.request_id))}`, {
          credentials: 'include',
        }).catch(() => null)
      )
    }

    const results = await Promise.all(tasks)
    const mappingsRes = results[0]
    const requestRes = results[2]

    if (mappingsRes?.ok) {
      mappings.value = normalizeArray(await mappingsRes.json())
    } else {
      mappings.value = []
    }

    if (requestRes?.ok) {
      requestData.value = await requestRes.json()
    } else {
      requestData.value = null
    }

    const invoiceItems = normalizeArray(invoicePayload?.items)
    deliveryRows.value = invoiceItems.map(toRow)
  } catch {
    loadError.value = 'Не удалось загрузить данные для планирования доставки.'
    invoice.value = null
    requestData.value = null
    mappings.value = []
    deliveryRows.value = []
  } finally {
    loading.value = false
  }
}

watch(() => route.params.invoiceId, () => {
  closeAllDropdowns()
  loadDeliveryData()
})

watch(selectedCarrierName, (value) => {
  if (!carrierOpen.value) carrierQuery.value = value
})
watch(selectedFromName, (value) => {
  if (!fromOpen.value) fromQuery.value = value
})
watch(selectedToName, (value) => {
  if (!toOpen.value) toQuery.value = value
})
watch(selectedDriverName, (value) => {
  if (!driverOpen.value) driverQuery.value = value
})

onMounted(() => {
  window.addEventListener('mousedown', handleWindowMouseDown)
  loadDeliveryData()
})

onBeforeUnmount(() => {
  window.removeEventListener('mousedown', handleWindowMouseDown)
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
      </header>

      <div v-if="loading" class="inline-state">Загрузка...</div>
      <div v-else-if="loadError" class="inline-state error">{{ loadError }}</div>

      <template v-else>
        <section class="plan-form">
          <div class="row one-col">
            <label class="field-label">Перевозчик</label>
            <div class="select-wrap carrier-select">
              <input
                v-model="carrierQuery"
                class="field-input"
                type="text"
                placeholder="Выберите перевозчика"
                @focus="carrierOpen = true"
                @input="carrierOpen = true"
              >
              <div v-if="carrierOpen" class="dropdown-list">
                <button
                  v-for="item in carrierOptionsFiltered"
                  :key="`carrier-${item.id}`"
                  type="button"
                  class="dropdown-item"
                  @click="selectCarrier(item)"
                >
                  {{ item.name }}
                </button>
              </div>
            </div>
          </div>

          <div class="row four-col">
            <div>
              <label class="field-label">Возможно забрать</label>
              <input v-model="availableFrom" class="field-input" type="date">
            </div>
            <div>
              <label class="field-label">Планируем забрать</label>
              <input v-model="pickupPlanned" class="field-input" type="date">
            </div>
            <div class="span-two">
              <label class="field-label">Планируем доставить</label>
              <input v-model="deliveryPlanned" class="field-input" type="date">
            </div>
          </div>

          <div class="row one-col">
            <div>
              <label class="field-label">Откуда везти</label>
              <div class="select-wrap from-select">
                <input
                  v-model="fromQuery"
                  class="field-input"
                  type="text"
                  placeholder="Выберите адрес"
                  @focus="fromOpen = true"
                  @input="fromOpen = true"
                >
                <div v-if="fromOpen" class="dropdown-list">
                <button
                  v-for="item in fromOptionsFiltered"
                  :key="`from-${item.id}`"
                  type="button"
                  class="dropdown-item"
                  @click="selectFrom(item)"
                >
                  {{ buildPlaceLabel(item) || item.name }}
                </button>
                </div>
              </div>
            </div>
          </div>
          <div class="row one-col">
            <div>
              <label class="field-label">Куда везти</label>
              <div class="select-wrap to-select">
                <input
                  v-model="toQuery"
                  class="field-input"
                  type="text"
                  placeholder="Выберите адрес"
                  @focus="toOpen = true"
                  @input="toOpen = true"
                >
                <div v-if="toOpen" class="dropdown-list">
                <button
                  v-for="item in toOptionsFiltered"
                  :key="`to-${item.id}`"
                  type="button"
                  class="dropdown-item"
                  @click="selectTo(item)"
                >
                  {{ buildPlaceLabel(item) || item.name }}
                </button>
                </div>
              </div>
            </div>
          </div>

          <div class="row one-col">
            <label class="field-label">Ответственные за приемку</label>
            <div class="select-wrap responsible-select">
              <input
                v-model="responsibleQuery"
                class="field-input"
                type="text"
                placeholder="Поиск пользователя"
                @focus="responsibleOpen = true"
                @input="responsibleOpen = true"
              >
              <div v-if="responsibleOpen" class="dropdown-list">
                <button
                  v-for="item in responsibleOptionsFiltered"
                  :key="`resp-${item.id}`"
                  type="button"
                  class="dropdown-item"
                  @click="toggleResponsible(item)"
                >
                  <input type="checkbox" :checked="responsibleIds.includes(item.id)" readonly>
                  <span>{{ item.name }}</span>
                </button>
              </div>
            </div>
            <div v-if="selectedResponsibles.length" class="chips-row">
              <span v-for="item in selectedResponsibles" :key="`chip-${item.id}`" class="chip">
                <span>{{ item.name }}</span>
                <button type="button" class="chip-remove" @click="removeResponsible(item.id)">
                  <i class="fas fa-times"></i>
                </button>
              </span>
            </div>
          </div>

          <div class="row one-col">
            <label class="field-label">Потребность в документах</label>
            <textarea v-model="docsNeed" class="field-input textarea" rows="2"></textarea>
          </div>

          <div class="row one-col">
            <div>
              <label class="field-label">Водитель</label>
              <div class="select-wrap driver-select">
                <input
                  v-model="driverQuery"
                  class="field-input"
                  type="text"
                  placeholder="Выберите водителя"
                  @focus="driverOpen = true"
                  @input="driverOpen = true"
                >
                <div v-if="driverOpen" class="dropdown-list">
                  <button
                    v-for="item in driverOptionsFiltered"
                    :key="`driver-${item.id}`"
                    type="button"
                    class="dropdown-item"
                    @click="selectDriver(item)"
                  >
                    {{ item.name }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="row one-col">
            <label class="field-label">Комментарий к доставке</label>
            <textarea v-model="deliveryComment" class="field-input textarea" rows="2"></textarea>
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
                <template v-for="row in deliveryRows" :key="row.id">
                  <tr>
                    <td>
                      <div class="name-block-vertical">
                        <span class="name-label">Название из счета:</span>
                        <span class="name-value">{{ row.invoiceName || '—' }}</span>
                        <span class="name-label">Название из заявки:</span>
                        <span class="name-value">{{ row.requestName || '—' }}</span>
                      </div>
                    </td>
                    <td>{{ row.invoiceUnit || '' }}</td>
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
                </template>
                <tr v-if="!deliveryRows.length">
                  <td colspan="4" class="empty">Позиции счета отсутствуют</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <div class="actions-row">
          <button type="button" class="plan-btn" :disabled="!canSave || saveLoading" @click="saveDeliveryPlan">
            {{ saveLoading ? 'Создаем доставку...' : 'Запланировать доставку' }}
          </button>
          <span v-if="saveMessage" class="save-message">{{ saveMessage }}</span>
        </div>
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

.row.two-col {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.row.three-col {
  grid-template-columns: 1.4fr 1fr 1fr;
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
}

.textarea {
  min-height: 74px;
  padding: 8px 10px;
  resize: vertical;
}

.select-wrap {
  position: relative;
}

.dropdown-list {
  position: absolute;
  top: calc(100% + 2px);
  left: 0;
  right: 0;
  z-index: 120;
  max-height: 220px;
  overflow: auto;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--bg-surface);
  box-shadow: var(--shadow-md);
}

.dropdown-item {
  width: 100%;
  border: none;
  background: transparent;
  text-align: left;
  padding: 8px 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: var(--text-primary);
}

.dropdown-item:hover {
  background: var(--bg-subtle);
}

.chips-row {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip {
  border: 1px solid var(--border-light);
  background: var(--bg-subtle);
  border-radius: 999px;
  padding: 4px 8px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.chip-remove {
  width: 16px;
  height: 16px;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
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
.plan-btn,
.row-btn {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  cursor: pointer;
}

.toggle-all-btn,
.plan-btn {
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

.plan-btn {
  background: var(--brand-primary);
  border-color: var(--brand-primary);
  color: #fff;
}

.plan-btn:disabled {
  opacity: 0.6;
  cursor: default;
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

.name-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
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

.empty {
  text-align: center;
  color: var(--text-tertiary);
}

.actions-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.save-message {
  font-size: 13px;
  color: #166534;
}

@media (max-width: 1200px) {
  .row.four-col {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .row.three-col {
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

  .row.two-col,
  .row.three-col,
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
