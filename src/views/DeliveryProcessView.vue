<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TopNav from '../components/layout/TopNav.vue'
import { mainNavLinks } from '../constants/mainNav'

const route = useRoute()
const router = useRouter()

const navLinks = mainNavLinks

const loading = ref(false)
const loadError = ref('')
const saveMessage = ref('')
const finishing = ref(false)
const finishModalOpen = ref(false)
const delivery = ref(null)
const deliveryItems = ref([])
const invoiceData = ref(null)
const requestData = ref(null)
const mappingRows = ref([])
const selectedDeliveryItemId = ref('')
const nomenclatureLookupRowId = ref('')
const nomenclatureLookupLoadingRowId = ref('')
const nomenclatureLookupResults = ref([])
const tempMappingSeq = ref(1)
const autoMatchLoading = ref(false)
const deliverySort = ref({ key: 'name', direction: 'asc' })
const mappingSort = ref({ key: 'group', direction: 'asc' })
const finishForm = ref({ delivery_at: '' })
const jsonHeaders = { 'Content-Type': 'application/json' }
const postedIncomingStatusId = 'ff28cc86-1968-11f1-aa8c-bc241127d0bd'

const warehouseId = computed(() => String(route.query.warehouse_id || ''))

const normalizeArray = (payload) => {
  if (Array.isArray(payload)) return payload
  return payload?.items || payload?.data || payload?.results || []
}

const deliveryId = computed(() => String(route.params.deliveryId || ''))
const backPath = computed(() => String(route.query.back || `/deliveries/${deliveryId.value}`))

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

const mappedRowsForFinish = computed(() => (
  mappingRows.value.filter((row) => (
    row?.delivery_item_id
    && row?.nomenclature_id
    && toNumberOrZero(row?.mapped_quantity) > 0
  ))
))

const pageTitle = computed(() => {
  const num = String(delivery.value?.num || '').trim()
  return num ? `Сопоставление доставки № ${num}` : `Сопоставление доставки ${deliveryId.value}`
})

const pageSubtitle = computed(() => {
  const invoiceLabel = String(delivery.value?.invoice_num || delivery.value?.invoice_id || '').trim()
  const requestLabel = String(delivery.value?.request_num || delivery.value?.request_id || '').trim()
  const parts = []
  if (invoiceLabel) parts.push(`Счёт: ${invoiceLabel}`)
  if (requestLabel) parts.push(`Заявка: ${requestLabel}`)
  return parts.join(' • ') || 'Принятие доставки'
})

const defaultDeliveryAt = computed(() => toDateOnly(
  delivery.value?.planned_delivery_to
    || delivery.value?.pick_up_date_planned
    || delivery.value?.pick_up_date
    || new Date().toISOString()
))

const openBack = () => {
  router.push(backPath.value)
}

const openFinishModal = () => {
  finishForm.value.delivery_at = String(finishForm.value.delivery_at || defaultDeliveryAt.value)
  finishModalOpen.value = true
}

const toNumberOrZero = (value) => {
  const normalized = String(value ?? '').replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

const formatMaybeNumber = (value) => {
  const num = Number(value)
  if (!Number.isFinite(num)) return '—'
  return num.toLocaleString('ru-RU')
}

const rowSum = (row) => toNumberOrZero(row?.mapped_quantity) * toNumberOrZero(row?.price)

const toDateOnly = (value) => {
  const raw = String(value || '').trim()
  if (!raw) return new Date().toISOString().slice(0, 10)
  return raw.includes('T') ? raw.slice(0, 10) : raw
}

const toIsoDateTime = (value) => {
  const raw = String(value || '').trim()
  if (!raw) return new Date().toISOString()
  if (raw.includes('T')) return raw
  return `${raw}T00:00:00.000Z`
}

const compareValues = (left, right) => {
  const leftNum = Number(left)
  const rightNum = Number(right)
  const leftIsNum = Number.isFinite(leftNum)
  const rightIsNum = Number.isFinite(rightNum)
  if (leftIsNum && rightIsNum) return leftNum - rightNum
  return String(left ?? '').localeCompare(String(right ?? ''), 'ru', { sensitivity: 'base' })
}

const deliverySortValue = (row, key) => {
  switch (key) {
    case 'quantity':
      return toNumberOrZero(row?.quantity)
    case 'group':
      return Number(row?.groupNumber || 0)
    case 'name':
    default:
      return `${row?.invoiceName || ''} ${row?.requestName || ''}`.trim()
  }
}

const mappingSortValue = (row, key) => {
  switch (key) {
    case 'quantity':
      return toNumberOrZero(row?.mapped_quantity)
    case 'unit':
      return row?.unit_name || ''
    case 'price':
      return toNumberOrZero(row?.price)
    case 'sum':
      return rowSum(row)
    case 'group':
      return Number(row?.group_number || 0)
    case 'name':
    default:
      return row?.name || ''
  }
}

const groupColorStyle = (groupNumber) => {
  const value = Number(groupNumber || 0)
  if (!value) return {}
  const hue = (value * 47) % 360
  return {
    background: `hsla(${hue}, 78%, 92%, 1)`,
    color: `hsla(${hue}, 58%, 30%, 1)`,
    borderColor: `hsla(${hue}, 62%, 70%, 1)`,
  }
}

const sortedDeliveryItems = computed(() => {
  const rows = [...deliveryItems.value]
  const { key, direction } = deliverySort.value
  rows.sort((a, b) => {
    const diff = compareValues(deliverySortValue(a, key), deliverySortValue(b, key))
    return direction === 'desc' ? -diff : diff
  })
  return rows
})

const visibleMappingRows = computed(() => {
  const rows = [...mappingRows.value]
  const { key, direction } = mappingSort.value
  rows.sort((a, b) => {
    const diff = compareValues(mappingSortValue(a, key), mappingSortValue(b, key))
    return direction === 'desc' ? -diff : diff
  })
  return rows
})

const toggleDeliverySort = (key) => {
  deliverySort.value = deliverySort.value.key === key
    ? { key, direction: deliverySort.value.direction === 'asc' ? 'desc' : 'asc' }
    : { key, direction: 'asc' }
}

const toggleMappingSort = (key) => {
  mappingSort.value = mappingSort.value.key === key
    ? { key, direction: mappingSort.value.direction === 'asc' ? 'desc' : 'asc' }
    : { key, direction: 'asc' }
}

const sortIndicator = (state, key) => {
  if (state.key !== key) return ''
  return state.direction === 'asc' ? '↑' : '↓'
}

const syncDeliveryGroupsFromMappings = () => {
  deliveryItems.value = deliveryItems.value.map((row) => {
    const linked = mappingRows.value.find((mapping) => String(mapping.delivery_item_id || '') === String(row.id || ''))
    if (!linked) {
      return {
        ...row,
        groupNumber: 0,
        nomenclatureId: '',
      }
    }
    return {
      ...row,
      groupNumber: Number(linked.group_number || 0),
      nomenclatureId: String(linked.nomenclature_id || ''),
      quantity: linked.delivery_quantity ?? row.quantity,
    }
  })
}

const buildDeliveryRow = (item, index) => {
  const invoiceItemId = String(item?.invoice_item_id || '')
  const requestItemId = String(item?.request_item_id || '')
  const invoiceItem = invoiceItemsById.value.get(invoiceItemId)
  const requestItem = requestItemsById.value.get(requestItemId)
  return {
    id: String(item?.id || `item-${index + 1}`),
    deliveryItemId: String(item?.id || ''),
    invoiceItemId,
    requestItemId,
    invoiceName: String(invoiceItem?.name || item?.name || item?.nomenclature_name || '—'),
    invoiceUnit: String(invoiceItem?.unit_name || item?.unit_name || '—'),
    requestName: String(requestItem?.name || requestItem?.nomenclature?.name || '—'),
    requestUnit: String(requestItem?.unit?.name || requestItem?.nomenclature?.unit?.name || item?.unit_name || '—'),
    quantity: item?.quantity ?? invoiceItem?.quantity ?? requestItem?.quantity ?? '',
    groupNumber: 0,
    nomenclatureId: String(item?.nomenclature_id || ''),
    price: invoiceItem?.price ?? 0,
  }
}

const buildLinkedMappingRow = (row, groupNumber) => ({
  id: `linked-${row.id}`,
  mappingId: '',
  delivery_item_id: row.id,
  nomenclature_id: row.nomenclatureId,
  name: row.requestName !== '—' ? row.requestName : row.invoiceName,
  unit_name: row.invoiceUnit || row.requestUnit || '',
  delivery_quantity: row.quantity,
  nomenclature_quantity: row.quantity,
  mapped_quantity: row.quantity,
  price: row.price || 0,
  group_number: groupNumber,
  isDraft: false,
})

const rebuildMappingsFromDelivery = () => {
  const drafts = mappingRows.value.filter((row) => row.isDraft)
  const newRows = []
  let nextGroupNumber = 1
  deliveryItems.value = deliveryItems.value.map((row) => {
    const nomenclatureId = String(row?.nomenclatureId || '')
    if (!nomenclatureId) return { ...row, groupNumber: 0 }
    const updated = { ...row, groupNumber: nextGroupNumber }
    newRows.push(buildLinkedMappingRow(updated, nextGroupNumber))
    nextGroupNumber += 1
    return updated
  })
  mappingRows.value = [...newRows, ...drafts]
}

const getNextGroupNumber = () => mappingRows.value.reduce((max, row) => Math.max(max, Number(row?.group_number || 0)), 0) + 1

const onDeliveryMappingClick = (row) => {
  if (row?.groupNumber) {
    unlinkDeliveryRow(row)
    return
  }
  selectedDeliveryItemId.value = String(row?.id || '')
}

const syncLinkedMappingFromDelivery = (deliveryRow) => {
  const deliveryItemId = String(deliveryRow?.id || '')
  mappingRows.value = mappingRows.value.map((row) => {
    if (String(row.delivery_item_id || '') !== deliveryItemId) return row
    return {
      ...row,
      delivery_quantity: deliveryRow.quantity,
      price: deliveryRow.price || row.price || 0,
    }
  })
}

const findDeliveryRowByMapping = (row) => (
  deliveryItems.value.find((item) => String(item.id || '') === String(row?.delivery_item_id || ''))
)

const persistMappingRow = async (row) => {
  if (!row?.delivery_item_id || !row?.nomenclature_id) return
  const deliveryRow = findDeliveryRowByMapping(row)
  const body = {
    delivery_id: deliveryId.value,
    delivery_item_id: row.delivery_item_id,
    nomenclature_id: row.nomenclature_id,
    delivery_quantity: toNumberOrZero(deliveryRow?.quantity ?? row.delivery_quantity),
    nomenclature_quantity: toNumberOrZero(row.nomenclature_quantity ?? row.mapped_quantity),
    group_number: Number(row.group_number || 0),
    delivery_at: finishForm.value.delivery_at || null,
  }
  try {
    if (row.isDraft || !row.mappingId) {
      const res = await fetch('/apisup/supply/delivery-item-mappings', {
        method: 'POST',
        credentials: 'include',
        headers: jsonHeaders,
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('create delivery mapping failed')
    } else {
      const res = await fetch(`/apisup/supply/delivery-item-mappings/${encodeURIComponent(row.mappingId)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: jsonHeaders,
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('update delivery mapping failed')
    }
    await loadDeliveryMappings()
  } catch {
    loadError.value = 'Не удалось сохранить сопоставление доставки.'
    await loadDeliveryMappings()
  }
}

const resetLocalMappingsState = () => {
  mappingRows.value = []
  deliveryItems.value = deliveryItems.value.map((row) => ({
    ...row,
    groupNumber: 0,
    nomenclatureId: '',
  }))
  selectedDeliveryItemId.value = String(deliveryItems.value[0]?.id || '')
}

const clearAllMappings = async () => {
  const persistedRows = mappingRows.value.filter((row) => row?.mappingId)
  if (!persistedRows.length) {
    resetLocalMappingsState()
    saveMessage.value = 'Все связки удалены.'
    return
  }
  try {
    await Promise.all(persistedRows.map(async (row) => {
      const res = await fetch(`/apisup/supply/delivery-item-mappings/${encodeURIComponent(row.mappingId)}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error('delete delivery mapping failed')
    }))
    resetLocalMappingsState()
    saveMessage.value = 'Все связки удалены.'
  } catch {
    loadError.value = 'Не удалось удалить все связки доставки.'
  }
}

const onDeliveryQuantityInput = async (row) => {
  syncLinkedMappingFromDelivery(row)
  const linked = mappingRows.value.find((mapping) => String(mapping.delivery_item_id || '') === String(row.id || ''))
  if (linked?.nomenclature_id) {
    linked.delivery_quantity = row.quantity
    await persistMappingRow(linked)
  }
}

const addMappingDraft = () => {
  mappingRows.value.push({
    id: `tmp-map-${tempMappingSeq.value++}`,
    mappingId: '',
    delivery_item_id: '',
    nomenclature_id: '',
    name: '',
    unit_name: '',
    mapped_quantity: '',
    price: 0,
    group_number: 0,
    isDraft: true,
  })
}

const unlinkDeliveryRow = async (deliveryRow) => {
  const deliveryItemId = String(deliveryRow?.id || '')
  const linkedRows = mappingRows.value.filter((row) => String(row.delivery_item_id || '') === deliveryItemId)
  if (!linkedRows.some((row) => row?.mappingId)) {
    deliveryItems.value = deliveryItems.value.map((row) => (
      String(row.id) === deliveryItemId
        ? { ...row, nomenclatureId: '', groupNumber: 0 }
        : row
    ))
    mappingRows.value = mappingRows.value.filter((row) => String(row.delivery_item_id || '') !== deliveryItemId)
    return
  }
  try {
    await Promise.all(linkedRows
      .filter((row) => row?.mappingId)
      .map(async (row) => {
        const res = await fetch(`/apisup/supply/delivery-item-mappings/${encodeURIComponent(row.mappingId)}`, {
          method: 'DELETE',
          credentials: 'include',
        })
        if (!res.ok) throw new Error('delete delivery mapping failed')
      }))
    await loadDeliveryMappings()
  } catch {
    loadError.value = 'Не удалось снять связку доставки.'
    await loadDeliveryMappings()
  }
}

const bindMappingRow = async (row) => {
  if (!selectedDeliveryItemId.value) return
  const deliveryRow = deliveryItems.value.find((item) => String(item.id) === String(selectedDeliveryItemId.value))
  if (!deliveryRow) return
  if (!row.nomenclature_id) return
  const existingLinkedRows = mappingRows.value.filter((item) => (
    String(item.delivery_item_id || '') === String(deliveryRow.id) && String(item.id || '') !== String(row.id || '')
  ))
  if (existingLinkedRows.length) {
    try {
      await Promise.all(existingLinkedRows
        .filter((item) => item.mappingId)
        .map(async (item) => {
          const res = await fetch(`/apisup/supply/delivery-item-mappings/${encodeURIComponent(item.mappingId)}`, {
            method: 'DELETE',
            credentials: 'include',
          })
          if (!res.ok) throw new Error('delete delivery mapping failed')
        }))
      mappingRows.value = mappingRows.value.filter((item) => !existingLinkedRows.some((linked) => String(linked.id) === String(item.id)))
    } catch {
      loadError.value = 'Не удалось обновить связку доставки.'
      await loadDeliveryMappings()
      return
    }
  }
  const groupNumber = getNextGroupNumber()
  row.delivery_item_id = deliveryRow.id
  row.group_number = groupNumber
  row.delivery_quantity = deliveryRow.quantity
  row.nomenclature_quantity = row.nomenclature_quantity ?? row.mapped_quantity ?? deliveryRow.quantity
  row.mapped_quantity = row.nomenclature_quantity
  row.price = deliveryRow.price || row.price || 0
  mappingRows.value = mappingRows.value.map((item) => (
    String(item.id) === String(row.id) ? { ...row } : item
  ))
  deliveryItems.value = deliveryItems.value.map((item) => (
    String(item.id) === String(deliveryRow.id)
      ? { ...item, groupNumber, nomenclatureId: row.nomenclature_id || item.nomenclatureId }
      : item
  ))
  selectedDeliveryItemId.value = ''
  await persistMappingRow(row)
}

const searchNomenclature = async (row) => {
  const query = String(row?.name || '').trim()
  nomenclatureLookupRowId.value = String(row?.id || '')
  if (!query) {
    nomenclatureLookupResults.value = []
    return
  }
  nomenclatureLookupLoadingRowId.value = String(row?.id || '')
  try {
    const res = await fetch(`/apisup/supply/nomenclature?search=${encodeURIComponent(query)}`, {
      credentials: 'include',
    })
    if (!res.ok) throw new Error('nomenclature search failed')
    const data = await res.json()
    nomenclatureLookupResults.value = normalizeArray(data).map((item) => ({
      id: String(item?.id || ''),
      name: String(item?.name || ''),
      unit_name: String(item?.unit?.name || item?.unit_name || ''),
      price: item?.price_opt ?? item?.price ?? 0,
    })).filter((item) => item.id && item.name)
  } catch {
    nomenclatureLookupResults.value = []
  } finally {
    nomenclatureLookupLoadingRowId.value = ''
  }
}

const autoMatchMappings = async () => {
  loadError.value = ''
  saveMessage.value = ''
  autoMatchLoading.value = true
  try {
    const res = await fetch('/apisup/supply/delivery-item-mappings/auto-match', {
      method: 'POST',
      credentials: 'include',
      headers: jsonHeaders,
      body: JSON.stringify({
        delivery_id: deliveryId.value,
      }),
    })
    if (!res.ok) throw new Error('delivery auto-match failed')
    await loadDeliveryMappings()
    saveMessage.value = 'Автосопоставление завершено.'
  } catch {
    loadError.value = 'Не удалось выполнить автосопоставление.'
  } finally {
    autoMatchLoading.value = false
  }
}

const finishDelivery = async () => {
  if (finishing.value) return
  loadError.value = ''
  saveMessage.value = ''
  if (!warehouseId.value) {
    loadError.value = 'Не найден склад для принятия доставки.'
    return
  }
  if (!mappedRowsForFinish.value.length) {
    loadError.value = 'Нет сопоставленных позиций для принятия доставки.'
    return
  }
  if (!finishForm.value.delivery_at) {
    loadError.value = 'Укажите фактическую дату доставки.'
    return
  }

  finishing.value = true
  finishModalOpen.value = false
  try {
    for (const row of mappedRowsForFinish.value) {
      if (!row.mappingId) continue
      const res = await fetch(`/apisup/supply/delivery-item-mappings/${encodeURIComponent(row.mappingId)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: jsonHeaders,
        body: JSON.stringify({
          delivery_id: deliveryId.value,
          delivery_item_id: row.delivery_item_id,
          nomenclature_id: row.nomenclature_id,
          delivery_quantity: toNumberOrZero(findDeliveryRowByMapping(row)?.quantity ?? row.delivery_quantity),
          nomenclature_quantity: toNumberOrZero(row.nomenclature_quantity ?? row.mapped_quantity),
          group_number: Number(row.group_number || 0),
          delivery_at: finishForm.value.delivery_at,
        }),
      })
      if (!res.ok) throw new Error('delivery mapping patch failed')
    }

    const objectId = String(delivery.value?.project_id || invoiceData.value?.project_id || '')
    const objectLevelsId = String(delivery.value?.object_levels_id || invoiceData.value?.object_levels_id || '')
    const dateArrival = toDateOnly(
      finishForm.value.delivery_at || new Date().toISOString()
    )
    const dateCompleted = toIsoDateTime(delivery.value?.planned_delivery_to || new Date().toISOString())

    let nextReceiptNum = 1
    const receiptListRes = await fetch(`/apisup/supply/warehouse-receipts?warehouse_id=${encodeURIComponent(warehouseId.value)}`, {
      credentials: 'include',
    })
    if (receiptListRes.ok) {
      const receiptListPayload = await receiptListRes.json()
      const receiptList = normalizeArray(receiptListPayload)
      const currentNums = receiptList
        .map((item) => Number(item?.num))
        .filter((value) => Number.isFinite(value))
      nextReceiptNum = currentNums.length ? Math.max(...currentNums) + 1 : 1
    }

    const receiptRes = await fetch('/apisup/supply/warehouse-receipts', {
      method: 'POST',
      credentials: 'include',
      headers: jsonHeaders,
      body: JSON.stringify({
        num: nextReceiptNum,
        from: delivery.value?.delivery_from || null,
        to: null,
        type: 1,
        who_write_off: delivery.value?.carrier_id || null,
        object_id: objectId || null,
        date_arrival: dateArrival,
        date_completed: dateCompleted,
        warehouse_id: warehouseId.value,
        delivery_id: deliveryId.value,
        status_id: postedIncomingStatusId,
      }),
    })
    if (!receiptRes.ok) throw new Error('create incoming receipt failed')
    const createdReceipt = await receiptRes.json()
    const receiptId = String(createdReceipt?.id || '')
    if (!receiptId) throw new Error('receipt id missing')

    const createdItemIds = []
    for (const row of mappedRowsForFinish.value) {
      const deliveryRow = findDeliveryRowByMapping(row)
      const invoiceItem = invoiceItemsById.value.get(String(deliveryRow?.invoiceItemId || ''))
      const price = toNumberOrZero(row.price)
      const quantity = toNumberOrZero(row.mapped_quantity)
      const vatRate = toNumberOrZero(invoiceItem?.nds ?? invoiceData.value?.vat_rate)

      const itemRes = await fetch(`/apisup/supply/warehouse-receipts/${encodeURIComponent(receiptId)}/items`, {
        method: 'POST',
        credentials: 'include',
        headers: jsonHeaders,
        body: JSON.stringify({
          nomenclature_id: row.nomenclature_id,
          quantity,
          price,
          attribute: objectId || null,
        }),
      })
      if (!itemRes.ok) throw new Error('create receipt item failed')
      const createdItem = await itemRes.json()
      const receiptItemId = String(createdItem?.id || '')
      if (receiptItemId) createdItemIds.push(receiptItemId)

      const priceHistoryRes = await fetch('/apisup/supply/warehouse-price-history', {
        method: 'POST',
        credentials: 'include',
        headers: jsonHeaders,
        body: JSON.stringify({
          nomenclature_id: row.nomenclature_id,
          type: 'price_purchase',
          value: price,
          date: dateArrival,
        }),
      })
      if (!priceHistoryRes.ok) throw new Error('warehouse price history create failed')

      const stockRes = await fetch(`/apisup/supply/warehouses/${encodeURIComponent(warehouseId.value)}/list`, {
        method: 'POST',
        credentials: 'include',
        headers: jsonHeaders,
        body: JSON.stringify({
          nomenclature_id: row.nomenclature_id,
          quantity,
          price,
          vat_rate: vatRate,
          upd_item_mapping_id: null,
          attribute: objectId || null,
          date: dateArrival,
          object_levels_id: objectLevelsId || null,
          object_id: objectId || null,
          warehouse_receipt_id: receiptId,
          delivery_id: deliveryId.value,
        }),
      })
      if (!stockRes.ok) throw new Error('warehouse stock create failed')
    }

    const receiptLogRes = await fetch(`/apisup/supply/warehouse-receipts/${encodeURIComponent(receiptId)}/logs`, {
      method: 'POST',
      credentials: 'include',
      headers: jsonHeaders,
      body: JSON.stringify({ warehouse_id: warehouseId.value }),
    })
    if (!receiptLogRes.ok) throw new Error('receipt log create failed')

    for (const receiptItemId of createdItemIds) {
      const itemLogRes = await fetch(`/apisup/supply/warehouse-receipts/${encodeURIComponent(receiptId)}/items/${encodeURIComponent(receiptItemId)}/logs`, {
        method: 'POST',
        credentials: 'include',
        headers: jsonHeaders,
        body: JSON.stringify({ warehouse_id: warehouseId.value }),
      })
      if (!itemLogRes.ok) throw new Error('receipt item log create failed')
    }

    const deliveryStatusRes = await fetch(`/apisup/supply/deliveries/${encodeURIComponent(deliveryId.value)}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: jsonHeaders,
      body: JSON.stringify({
        status_id: 'ff3e0560-592e-11f1-8707-bc241127d0bd',
      }),
    })
    if (!deliveryStatusRes.ok) throw new Error('delivery status patch failed')

    saveMessage.value = 'Доставка успешно принята.'
    openBack()
  } catch {
    loadError.value = 'Не удалось завершить принятие доставки.'
  } finally {
    finishing.value = false
  }
}

const chooseNomenclature = async (row, option) => {
  row.nomenclature_id = option.id
  row.name = option.name
  row.unit_name = option.unit_name
  row.price = option.price || row.price || 0
  if (row.nomenclature_quantity === '' || row.nomenclature_quantity == null) row.nomenclature_quantity = row.delivery_quantity || row.mapped_quantity || 1
  row.mapped_quantity = row.nomenclature_quantity
  nomenclatureLookupRowId.value = ''
  nomenclatureLookupResults.value = []
  if (row.delivery_item_id) {
    deliveryItems.value = deliveryItems.value.map((item) => (
      String(item.id) === String(row.delivery_item_id || '')
        ? { ...item, nomenclatureId: option.id }
        : item
    ))
    await persistMappingRow(row)
  }
}

const openCreateNomenclature = () => {
  router.push({
    path: '/nomenclature/new',
    query: {
      back: route.fullPath,
      warehouse_id: route.query.warehouse_id || '',
    },
  })
}

const loadDeliveryMappings = async () => {
  try {
    const res = await fetch(`/apisup/supply/delivery-item-mappings?delivery_id=${encodeURIComponent(deliveryId.value)}`, {
      credentials: 'include',
    })
    if (!res.ok) throw new Error('delivery mappings load failed')
    const payload = await res.json()
    const rows = normalizeArray(payload).map((item, index) => ({
      id: String(item?.id || `map-${index + 1}`),
      mappingId: String(item?.id || ''),
      delivery_item_id: String(item?.delivery_item_id || item?.delivery_item?.id || ''),
      nomenclature_id: String(item?.nomenclature_id || item?.nomenclature?.id || ''),
      name: String(item?.nomenclature_name || item?.name || item?.nomenclature?.name || ''),
      unit_name: String(item?.unit_name || item?.nomenclature?.unit?.name || item?.delivery_item?.unit_name || ''),
      delivery_quantity: item?.delivery_quantity ?? item?.delivery_item?.quantity ?? '',
      nomenclature_quantity: item?.nomenclature_quantity ?? '',
      mapped_quantity: item?.nomenclature_quantity ?? '',
      price: invoiceItemsById.value.get(String(item?.delivery_item?.invoice_item_id || ''))?.price ?? item?.price ?? 0,
      group_number: Number(item?.group_number || 0),
      isDraft: false,
    }))
    if (rows.length) {
      mappingRows.value = rows
      syncDeliveryGroupsFromMappings()
      return
    }
  } catch {
    // fallback to local rebuild below
  }
  rebuildMappingsFromDelivery()
}

const loadDelivery = async () => {
  if (!deliveryId.value) return
  loading.value = true
  loadError.value = ''
  try {
    const deliveryRes = await fetch(`/apisup/supply/deliveries/${encodeURIComponent(deliveryId.value)}`, { credentials: 'include' })
    if (!deliveryRes.ok) throw new Error('delivery load failed')
    const payload = await deliveryRes.json()
    delivery.value = payload

    const tasks = []
    if (payload?.invoice_id) tasks.push(fetch(`/apisup/supply/invoices/${encodeURIComponent(String(payload.invoice_id))}`, { credentials: 'include' }).catch(() => null))
    else tasks.push(Promise.resolve(null))
    if (payload?.request_id) tasks.push(fetch(`/apisup/supply/requests/my/${encodeURIComponent(String(payload.request_id))}`, { credentials: 'include' }).catch(() => null))
    else tasks.push(Promise.resolve(null))
    const [invoiceRes, requestRes] = await Promise.all(tasks)
    invoiceData.value = invoiceRes?.ok ? await invoiceRes.json() : null
    requestData.value = requestRes?.ok ? await requestRes.json() : null

    let items = normalizeArray(payload?.items)
    if (!items.length) {
      const itemsRes = await fetch(`/apisup/supply/deliveries/${encodeURIComponent(deliveryId.value)}/items`, { credentials: 'include' }).catch(() => null)
      if (itemsRes?.ok) items = normalizeArray(await itemsRes.json())
    }
    deliveryItems.value = items.map(buildDeliveryRow)
    await loadDeliveryMappings()
    const firstUnmatched = deliveryItems.value.find((row) => !row.groupNumber)
    selectedDeliveryItemId.value = String(firstUnmatched?.id || deliveryItems.value[0]?.id || '')
  } catch {
    delivery.value = null
    deliveryItems.value = []
    mappingRows.value = []
    invoiceData.value = null
    requestData.value = null
    loadError.value = 'Не удалось загрузить сопоставление доставки.'
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

    <div v-if="autoMatchLoading || finishing" class="page-loader">
      <div class="loader-card">
        <div class="loader-spinner"></div>
        <div class="loader-text">
          {{ autoMatchLoading
            ? 'Выполняем автосопоставление доставки, пожалуйста подождите...'
            : 'Принимаем доставку и создаём приходную накладную, пожалуйста подождите...'
          }}
        </div>
      </div>
    </div>

    <div v-if="finishModalOpen" class="modal-backdrop" @click.self="finishModalOpen = false">
      <div class="modal-card">
        <div class="modal-header">
          <h3>Фактическая доставка</h3>
          <button type="button" class="icon-btn" @click="finishModalOpen = false">
            <i class="fa-regular fa-xmark"></i>
          </button>
        </div>
        <div class="modal-body">
          <label class="modal-field">
            <span>Дата фактической доставки</span>
            <input v-model="finishForm.delivery_at" type="date" class="modal-input">
          </label>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn" @click="finishModalOpen = false">Отмена</button>
          <button type="button" class="btn btn-primary" @click="finishDelivery">Завершить</button>
        </div>
      </div>
    </div>

    <main class="main-content">
      <header class="step-header">
        <button type="button" class="back-link-btn" @click="openBack">
          <i class="fas fa-arrow-left"></i>
          Вернуться
        </button>
        <span class="step-chip">1. Доставка</span>
        <i class="fas fa-chevron-right step-arrow"></i>
        <span class="step-chip active">2. Сопоставление</span>
        <div class="step-title">{{ pageTitle }}<span>•</span>{{ pageSubtitle }}</div>
      </header>

      <div v-if="loading" class="inline-state">Загрузка...</div>
      <div v-else-if="loadError" class="inline-state error">{{ loadError }}</div>

      <template v-else>
        <div v-if="saveMessage" class="inline-state success">{{ saveMessage }}</div>
        <section class="stage-three">
          <div class="stage-layout">
            <div class="table-card">
              <div class="card-title-row">
                <div class="table-title table-title-inline">Позиции из доставки</div>
              </div>
              <div class="table-wrap">
                <table class="data-table stage3-document-table">
                  <colgroup>
                    <col class="col-name-wide">
                    <col class="col-small">
                    <col class="col-narrow">
                  </colgroup>
                  <thead>
                    <tr>
                      <th class="sortable-head" @click="toggleDeliverySort('name')">Название <span>{{ sortIndicator(deliverySort, 'name') }}</span></th>
                      <th class="sortable-head" @click="toggleDeliverySort('quantity')">Кол-во <span>{{ sortIndicator(deliverySort, 'quantity') }}</span></th>
                      <th class="sortable-head" @click="toggleDeliverySort('group')"># <span>{{ sortIndicator(deliverySort, 'group') }}</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="row in sortedDeliveryItems"
                      :key="row.id"
                      class="match-row"
                      :class="{ selected: String(selectedDeliveryItemId || '') === String(row.id || '') }"
                    >
                      <td>
                        <div class="name-block-vertical">
                          <span class="name-label">Название из счета:</span>
                          <span class="name-value">{{ row.invoiceName || '—' }}</span>
                          <span class="name-label">Название из заявки:</span>
                          <span class="name-value">{{ row.requestName || '—' }}</span>
                        </div>
                      </td>
                      <td><input v-model="row.quantity" class="cell-input" type="number" min="0" step="any" @change="onDeliveryQuantityInput(row)"></td>
                      <td>
                        <button type="button" class="group-cell-btn" @click="onDeliveryMappingClick(row)">
                          <span class="group-badge" :style="groupColorStyle(row.groupNumber)" :class="{ empty: !row.groupNumber, active: String(selectedDeliveryItemId || '') === String(row.id || '') }">
                            {{ row.groupNumber || '—' }}
                          </span>
                        </button>
                      </td>
                    </tr>
                    <tr v-if="!deliveryItems.length">
                      <td colspan="3" class="table-empty">Позиции доставки отсутствуют</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div class="table-card">
              <div class="card-title-row">
                <div class="table-title table-title-inline">Позиции из номенклатуры</div>
                <div class="card-title-actions">
                  <button class="secondary-btn compact" type="button" @click="clearAllMappings">
                    Удалить все связки
                  </button>
                  <button class="icon-btn" type="button" title="Добавить строку" @click="addMappingDraft">
                    <i class="fa-regular fa-plus"></i>
                  </button>
                </div>
              </div>
              <div class="table-wrap">
                <table class="data-table stage3-mapping-table">
                  <colgroup>
                    <col class="col-narrow">
                    <col class="col-name-wide stage3-map-name">
                    <col class="col-small">
                    <col class="col-small">
                    <col class="col-small">
                    <col class="col-small">
                  </colgroup>
                  <thead>
                    <tr>
                      <th class="sortable-head" @click="toggleMappingSort('group')"># <span>{{ sortIndicator(mappingSort, 'group') }}</span></th>
                      <th class="sortable-head" @click="toggleMappingSort('name')">Наименование <span>{{ sortIndicator(mappingSort, 'name') }}</span></th>
                      <th class="sortable-head" @click="toggleMappingSort('quantity')">Прив. кол-во <span>{{ sortIndicator(mappingSort, 'quantity') }}</span></th>
                      <th class="sortable-head" @click="toggleMappingSort('unit')">Прив. ед. изм. <span>{{ sortIndicator(mappingSort, 'unit') }}</span></th>
                      <th class="sortable-head" @click="toggleMappingSort('price')">Прив. цена <span>{{ sortIndicator(mappingSort, 'price') }}</span></th>
                      <th class="sortable-head" @click="toggleMappingSort('sum')">Сумма <span>{{ sortIndicator(mappingSort, 'sum') }}</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, index) in visibleMappingRows" :key="row.id || index">
                      <td>
                        <button type="button" class="group-cell-btn" @click="bindMappingRow(row)">
                          <span class="group-badge" :style="groupColorStyle(row.group_number)" :class="{ empty: !row.group_number }">{{ row.group_number || '—' }}</span>
                        </button>
                      </td>
                      <td>
                        <div class="lookup-field">
                          <textarea
                            v-model="row.name"
                            class="cell-input cell-textarea mapping-name-textarea"
                            rows="1"
                            placeholder="Начните вводить наименование"
                            @focus="searchNomenclature(row)"
                            @input="searchNomenclature(row)"
                            @blur="setTimeout(() => { if (nomenclatureLookupRowId === row.id) nomenclatureLookupRowId = '' }, 150)"
                          ></textarea>
                          <div v-if="nomenclatureLookupRowId === row.id" class="lookup-menu">
                            <button
                              type="button"
                              class="lookup-item ghost"
                              @mousedown.prevent="openCreateNomenclature"
                            >
                              + Создать товар
                            </button>
                            <div v-if="nomenclatureLookupLoadingRowId === row.id" class="lookup-empty">Загрузка...</div>
                            <button
                              v-for="option in nomenclatureLookupResults"
                              :key="option.id"
                              type="button"
                              class="lookup-item"
                              @mousedown.prevent="chooseNomenclature(row, option)"
                            >
                              {{ option.name }}
                            </button>
                            <div v-if="!nomenclatureLookupLoadingRowId && !nomenclatureLookupResults.length" class="lookup-empty">
                              Ничего не найдено
                            </div>
                          </div>
                        </div>
                      </td>
                      <td><input v-model="row.mapped_quantity" class="cell-input" type="number" min="0" step="any" @change="persistMappingRow(row)"></td>
                      <td><input :value="row.unit_name || '—'" class="cell-input readonly" type="text" readonly></td>
                      <td><input v-model="row.price" class="cell-input" type="number" min="0" step="any"></td>
                      <td><input :value="formatMaybeNumber(rowSum(row))" class="cell-input readonly" type="text" readonly></td>
                    </tr>
                    <tr v-if="!visibleMappingRows.length">
                      <td colspan="6" class="table-empty">Сопоставления отсутствуют</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      </template>
    </main>

    <footer class="invoice-footer">
      <div class="footer-left">
        <button type="button" class="btn" :disabled="autoMatchLoading || finishing" @click="autoMatchMappings">
          Автосопоставление
        </button>
      </div>

      <div class="footer-right">
        <button type="button" class="btn" :disabled="finishing" @click="openBack">Назад</button>
        <button type="button" class="btn btn-primary" :disabled="autoMatchLoading || finishing" @click="openFinishModal">
          Завершить
        </button>
      </div>
    </footer>
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
  padding: 18px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  border-radius: 12px;
  border: 1px solid var(--border-light);
  background: var(--bg-surface);
  box-shadow: var(--shadow-md);
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

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 310;
  background: color-mix(in srgb, #0f172a 38%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.modal-card {
  width: min(420px, calc(100vw - 32px));
  padding: 16px;
  border-radius: 12px;
  border: 1px solid var(--border-light);
  background: var(--bg-surface);
  box-shadow: var(--shadow-md);
}

.modal-header,
.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.modal-header {
  margin-bottom: 14px;
}

.modal-header h3 {
  margin: 0;
  font-size: 16px;
}

.modal-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.modal-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.modal-input {
  width: 100%;
  min-height: 38px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-light);
  background: #fff;
  padding: 0 10px;
  box-sizing: border-box;
}

.modal-footer {
  margin-top: 16px;
  justify-content: flex-end;
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

.inline-state {
  font-size: 12px;
  color: var(--text-secondary);
}

.inline-state.error {
  color: var(--danger-text);
}

.inline-state.success {
  color: #166534;
}

.stage-three {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.stage-layout {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(300px, 42%) minmax(420px, 58%);
  gap: 14px;
}

.table-card {
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  box-shadow: var(--shadow-sm);
  padding: 12px;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

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

.card-title-actions {
  display: flex;
  align-items: center;
  gap: 8px;
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

.primary-btn,
.secondary-btn {
  border-radius: 10px;
  padding: 10px 14px;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease;
}

.primary-btn {
  border: 1px solid var(--brand-primary);
  background: var(--brand-primary);
  color: #fff;
}

.primary-btn:hover {
  filter: brightness(0.96);
}

.primary-btn:disabled,
.secondary-btn:disabled,
.icon-btn:disabled,
.btn:disabled {
  opacity: 0.6;
  cursor: wait;
}

.secondary-btn {
  border: 1px solid var(--border-light);
  background: var(--bg-surface);
  color: var(--text-primary);
}

.secondary-btn:hover {
  background: var(--bg-subtle);
}

.secondary-btn.compact {
  padding: 8px 12px;
  font-size: 12px;
}

.btn {
  min-height: 36px;
  border-radius: 10px;
  border: 1px solid var(--border-light);
  background: var(--bg-surface);
  color: var(--text-primary);
  padding: 0 14px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease, color 0.16s ease;
}

.btn:hover {
  border-color: var(--brand-primary);
  color: var(--brand-primary);
}

.btn.btn-primary {
  border-color: var(--brand-primary);
  background: var(--brand-primary);
  color: #fff;
}

.btn.btn-primary:hover {
  filter: brightness(0.96);
  color: #fff;
}

.table-wrap {
  overflow: visible;
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

.data-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 12px;
}

.data-table col.col-narrow {
  width: 52px;
}

.data-table col.col-name-wide {
  width: auto;
}

.data-table col.col-small {
  width: 98px;
}

.stage3-document-table col.col-name-wide {
  width: 42%;
}

.stage3-mapping-table col.col-name-wide {
  width: 40%;
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

.sortable-head {
  cursor: pointer;
  user-select: none;
}

.sortable-head span {
  display: inline-block;
  min-width: 12px;
  margin-left: 4px;
  color: var(--text-tertiary);
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
}

.cell-input:focus {
  border-color: var(--brand-primary);
  background: var(--bg-subtle);
  outline: none;
}

.cell-input.readonly {
  color: var(--text-secondary);
}

.cell-textarea {
  resize: vertical;
}

.group-cell-btn {
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
}

.group-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  min-height: 28px;
  border-radius: 999px;
  border: 1px solid var(--border-light);
  background: var(--bg-subtle);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.group-badge.empty {
  color: var(--text-tertiary);
}

.group-badge.active {
  border-color: var(--brand-primary);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--brand-primary) 16%, transparent);
}

.lookup-field {
  position: relative;
}

.lookup-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 50;
  max-height: 220px;
  overflow: auto;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background: var(--bg-surface);
  box-shadow: 0 18px 36px rgba(15, 23, 42, 0.12);
}

.lookup-item {
  width: 100%;
  border: none;
  background: transparent;
  text-align: left;
  padding: 10px 12px;
  cursor: pointer;
  color: var(--text-primary);
}

.lookup-item:hover {
  background: var(--bg-subtle);
}

.lookup-item.ghost {
  color: var(--brand-primary);
  font-weight: 600;
  border-bottom: 1px solid var(--border-light);
}

.lookup-empty {
  padding: 10px 12px;
  color: var(--text-tertiary);
  font-size: 12px;
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

.match-row.selected td {
  background: color-mix(in srgb, var(--brand-primary) 8%, #fff);
}

.table-empty {
  text-align: center;
  color: var(--text-tertiary);
}

@media (max-width: 1200px) {
  .stage-layout {
    grid-template-columns: 1fr;
  }

  .invoice-footer {
    flex-direction: column;
    align-items: stretch;
  }

  .footer-left,
  .footer-right {
    justify-content: flex-end;
  }
}

@media (max-width: 860px) {
  .main-content {
    padding: 16px;
  }

  .step-header {
    flex-wrap: wrap;
    padding: 10px 12px;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
