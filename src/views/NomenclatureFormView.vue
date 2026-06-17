<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TopNav from '../components/layout/TopNav.vue'
import CategoryTreePickerModal from '../components/CategoryTreePickerModal.vue'
import { buildWarehouseCategoryTree } from '../helpers/warehouseCategoryTree'
import { mainNavLinks } from '../constants/mainNav'

const route = useRoute()
const router = useRouter()

const navLinks = mainNavLinks

const nomenclatureId = computed(() => String(route.params.nomenclatureId || ''))
const isCreateMode = computed(() => nomenclatureId.value === 'new' || !nomenclatureId.value)
const warehouseId = computed(() => String(route.query.warehouse_id || ''))

const loading = ref(false)
const saving = ref(false)
const deleting = ref(false)
const error = ref('')
const detail = ref(null)
const tab = ref('info')
const photos = ref([])
const photosLoading = ref(false)
const photosUploading = ref(false)
const photosError = ref('')
const photoViewerOpen = ref(false)
const activePhotoIndex = ref(0)
const movement = ref([])
const providers = ref([])
const pricesLoading = ref(false)
const priceSaving = ref(false)
const priceSaveSuccess = ref(false)
const priceSaveError = ref('')
const priceStats = ref(null)
const priceForm = ref({ price_opt: '', price_opt2: '', price_retail: '' })
const pricePcts = ref({ price_opt: '', price_opt2: '', price_retail: '' })

const unitOptions = ref([])
const categoryOptions = ref([])
const categoryPickerOpen = ref(false)
const unitDropdownOpen = ref(false)
const unitModalOpen = ref(false)
const unitSaving = ref(false)
const unitError = ref('')
const newUnitName = ref('')

const form = ref({
  name: '',
  warehouse_category_id: '',
  unit_id: '',
  description: '',
  article: '',
  length: '',
  width: '',
  height: '',
  weight: '',
})

const pageTitle = computed(() => (isCreateMode.value ? 'Создание номенклатуры' : 'Редактирование номенклатуры'))
const categoryMeta = computed(() => buildWarehouseCategoryTree(categoryOptions.value))
const selectedCategoryLabel = computed(() => {
  const selected = categoryMeta.value.byId.get(String(form.value.warehouse_category_id || ''))
  return selected?.pathLabel || ''
})
const selectedUnitLabel = computed(() => {
  const selected = unitOptions.value.find((item) => item.id === String(form.value.unit_id || ''))
  return selected?.name || ''
})
const currentPhoto = computed(() => photos.value[activePhotoIndex.value] || null)

const normalizeArray = (payload) => {
  if (Array.isArray(payload)) return payload
  return payload?.items || payload?.data || payload?.results || []
}

const toNumberOrNull = (value) => {
  if (value === '' || value == null) return null
  const n = Number(String(value).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

const formatDate = (value) => {
  if (!value) return '—'
  const source = String(value).slice(0, 10)
  const parts = source.split('-')
  return parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : source
}

const formatNumber = (value) => {
  const num = Number(value)
  if (!Number.isFinite(num)) return '0'
  return num.toLocaleString('ru-RU')
}

const formatPrice = (value) => {
  const num = Number(value)
  if (!Number.isFinite(num) || num === 0) return '—'
  return `${num.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`
}

const providerInitial = (name) => {
  const cleaned = String(name || '')
    .replace(/^(ООО|ОАО|ЗАО|ПАО|АО|ИП|НКО|ГУП|МУП)\s+/i, '')
    .replace(/^["«»"']/, '')
    .trim()
  return (cleaned[0] || name?.[0] || '?').toUpperCase()
}

const goBack = () => {
  const back = String(route.query.back || '')
  if (back) {
    router.push(back)
    return
  }
  router.push('/warehouses')
}

const openDocument = (documentId) => {
  const id = String(documentId || '')
  if (!id || !warehouseId.value) return
  router.push({
    name: 'warehouse-document-detail',
    params: {
      warehouseId: warehouseId.value,
      documentId: id,
    },
  })
}

const openInvoice = (invoiceId) => {
  const id = String(invoiceId || '')
  if (!id) return
  router.push({
    name: 'invoice-detail',
    params: {
      invoiceId: id,
    },
  })
}

const openDelivery = (deliveryId) => {
  const id = String(deliveryId || '')
  if (!id) return
  router.push({
    name: 'delivery-detail',
    params: {
      deliveryId: id,
    },
    query: warehouseId.value ? { warehouse_id: warehouseId.value } : {},
  })
}

const handleWindowClick = (event) => {
  const target = event.target
  if (!(target instanceof Element)) return
  if (target.closest('.unit-picker')) return
  unitDropdownOpen.value = false
}

const revokePhotoUrls = () => {
  photos.value.forEach((item) => {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
  })
}

const photoName = (item) => String(item?.original_name || item?.name || `Фото ${item?.id || ''}`)
const buildPhotoUrl = (fileId) =>
  `/apisup/supply/nomenclature/${encodeURIComponent(nomenclatureId.value)}/photos/${encodeURIComponent(fileId)}/download`

const loadPhotos = async () => {
  if (isCreateMode.value) {
    revokePhotoUrls()
    photos.value = []
    return
  }
  photosLoading.value = true
  photosError.value = ''
  try {
    const res = await fetch(`/apisup/supply/nomenclature/${encodeURIComponent(nomenclatureId.value)}/photos`, {
      credentials: 'include',
    })
    if (!res.ok) throw new Error('photos load failed')
    const data = await res.json()
    const items = normalizeArray(data)
    const nextPhotos = await Promise.all(items.map(async (item) => {
      try {
        const downloadRes = await fetch(buildPhotoUrl(String(item?.id || '')), { credentials: 'include' })
        if (!downloadRes.ok) throw new Error('photo download failed')
        const blob = await downloadRes.blob()
        return {
          ...item,
          previewUrl: URL.createObjectURL(blob),
        }
      } catch {
        return {
          ...item,
          previewUrl: '',
        }
      }
    }))
    revokePhotoUrls()
    photos.value = nextPhotos
  } catch {
    photosError.value = 'Не удалось загрузить фотографии.'
    revokePhotoUrls()
    photos.value = []
  } finally {
    photosLoading.value = false
  }
}

const onPhotoChange = async (event) => {
  const files = Array.from(event.target?.files || [])
  if (!files.length || isCreateMode.value) {
    if (event.target) event.target.value = ''
    return
  }
  photosUploading.value = true
  photosError.value = ''
  try {
    for (const file of files) {
      const formData = new FormData()
      formData.append('files', file)
      const res = await fetch(`/apisup/supply/nomenclature/${encodeURIComponent(nomenclatureId.value)}/photos`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      })
      if (!res.ok) throw new Error('photos upload failed')
    }
    await loadPhotos()
  } catch {
    photosError.value = 'Не удалось загрузить фотографии.'
  } finally {
    photosUploading.value = false
    if (event.target) event.target.value = ''
  }
}

const downloadPhoto = async (item) => {
  const fileId = String(item?.id || '')
  if (!fileId || isCreateMode.value) return
  window.open(
    `/apisup/supply/nomenclature/${encodeURIComponent(nomenclatureId.value)}/photos/${encodeURIComponent(fileId)}/download`,
    '_blank'
  )
}

const deletePhoto = async (item) => {
  const fileId = String(item?.id || '')
  if (!fileId || isCreateMode.value) return
  try {
    const res = await fetch(
      `/apisup/supply/nomenclature/${encodeURIComponent(nomenclatureId.value)}/photos/${encodeURIComponent(fileId)}`,
      {
        method: 'DELETE',
        credentials: 'include',
      }
    )
    if (!res.ok) throw new Error('photo delete failed')
    await loadPhotos()
  } catch {
    photosError.value = 'Не удалось удалить фотографию.'
  }
}

const openPhotoViewer = (index) => {
  activePhotoIndex.value = index
  photoViewerOpen.value = true
}

const closePhotoViewer = () => {
  photoViewerOpen.value = false
}

const showPrevPhoto = () => {
  if (!photos.value.length) return
  activePhotoIndex.value = (activePhotoIndex.value - 1 + photos.value.length) % photos.value.length
}

const showNextPhoto = () => {
  if (!photos.value.length) return
  activePhotoIndex.value = (activePhotoIndex.value + 1) % photos.value.length
}

const loadUnits = async () => {
  const res = await fetch('/apisup/supply/units', { credentials: 'include' })
  if (!res.ok) throw new Error('units load failed')
  unitOptions.value = normalizeArray(await res.json())
    .map((item) => ({ id: String(item?.id || ''), name: String(item?.name || '') }))
    .filter((item) => item.id && item.name)
}

const selectUnit = (id) => {
  form.value.unit_id = String(id || '')
  unitDropdownOpen.value = false
}

const openCreateUnitModal = () => {
  unitDropdownOpen.value = false
  newUnitName.value = ''
  unitError.value = ''
  unitModalOpen.value = true
}

const closeCreateUnitModal = () => {
  unitModalOpen.value = false
  unitSaving.value = false
  unitError.value = ''
  newUnitName.value = ''
}

const saveUnit = async () => {
  if (unitSaving.value) return
  const name = String(newUnitName.value || '').trim()
  if (!name) {
    unitError.value = 'Введите название единицы измерения.'
    return
  }
  unitSaving.value = true
  unitError.value = ''
  try {
    const res = await fetch('/apisup/supply/units', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) throw new Error('unit create failed')
    const created = await res.json()
    const item = {
      id: String(created?.id || ''),
      name: String(created?.name || name),
    }
    if (item.id) {
      unitOptions.value = [item, ...unitOptions.value.filter((unit) => unit.id !== item.id)]
      form.value.unit_id = item.id
    } else {
      await loadUnits()
      const found = unitOptions.value.find((unit) => unit.name === name)
      if (found) form.value.unit_id = found.id
    }
    closeCreateUnitModal()
  } catch {
    unitError.value = 'Не удалось создать единицу измерения.'
  } finally {
    unitSaving.value = false
  }
}

const loadCategories = async () => {
  const res = await fetch('/apisup/supply/warehouse-categories', { credentials: 'include' })
  if (!res.ok) throw new Error('categories load failed')
  categoryOptions.value = normalizeArray(await res.json())
    .map((item) => ({
      id: String(item?.id || ''),
      name: String(item?.name || ''),
      parent_id: String(item?.parent_id || ''),
    }))
    .filter((item) => item.id && item.name)
}

const loadNomenclature = async () => {
  if (isCreateMode.value) return
  const res = await fetch(`/apisup/supply/nomenclature/${encodeURIComponent(nomenclatureId.value)}`, {
    credentials: 'include',
  })
  if (!res.ok) throw new Error('nomenclature load failed')
  const data = await res.json()
  detail.value = data
  form.value = {
    name: String(data?.name || ''),
    warehouse_category_id: String(data?.warehouse_category_id || ''),
    unit_id: String(data?.unit_id || ''),
    description: String(data?.description || ''),
    article: String(data?.article || ''),
    length: data?.length ?? '',
    width: data?.width ?? '',
    height: data?.height ?? '',
    weight: data?.weight ?? '',
  }
  initPriceForm()
}

const loadMovement = async () => {
  if (isCreateMode.value) {
    movement.value = []
    providers.value = []
    return
  }
  const res = await fetch(`/apisup/supply/nomenclature/${encodeURIComponent(nomenclatureId.value)}/movement-history`, {
    credentials: 'include',
  })
  if (!res.ok) throw new Error('movement load failed')
  const payload = await res.json()
  const items = normalizeArray(payload?.items || payload)
  const rows = items.map((item) => ({
    id: String(item?.id || ''),
    nomenclatureName: String(item?.nomenclature_name || payload?.nomenclature_name || detail.value?.name || '—'),
    invoiceItemName: String(item?.invoice_item_name || '—'),
    updItemName: String(item?.upd_item_name || '—'),
    quantity: Number(item?.quantity || 0),
    unitName: String(item?.unit_name || payload?.unit_name || detail.value?.unit?.name || detail.value?.unit_name || '—'),
    documentDate: String(item?.event_at || item?.warehouse_receipt_date_arrival || item?.warehouse_receipt_created_at || ''),
    sortDate: String(item?.event_at || item?.warehouse_receipt_created_at || item?.warehouse_receipt_date_arrival || ''),
    movementValue: String(item?.movement || ''),
    typeLabel: String(item?.operation || '—'),
    accentClass: String(item?.movement || '').startsWith('-') ? 'movement-outgoing' : 'movement-receipt',
    updDocumentId: String(item?.upd_documents_id || ''),
    invoiceId: String(item?.invoice?.id || item?.invoice_id || ''),
    deliveryId: String(item?.delivery_id || item?.delivery?.id || ''),
  }))
  rows.sort((a, b) => String(b.sortDate || '').localeCompare(String(a.sortDate || '')))
  movement.value = rows

  const uniqueDocumentIds = [...new Set(rows.map((item) => item.updDocumentId).filter(Boolean))]
  const providerEntries = await Promise.all(uniqueDocumentIds.map(async (id) => {
    try {
      const docRes = await fetch(`/apisup/supply/upd-documents/${encodeURIComponent(id)}`, {
        credentials: 'include',
      })
      if (!docRes.ok) return null
      const doc = await docRes.json()
      return {
        id,
        providerId: String(doc?.provider_id || ''),
        providerName: String(doc?.provider_name || doc?.provider?.short_name || '—'),
        providerInn: String(doc?.provider?.inn || ''),
      }
    } catch {
      return null
    }
  }))

  const providerMap = new Map()
  movement.value.forEach((item) => {
    const entry = providerEntries.find((doc) => doc?.id === item.updDocumentId)
    const key = entry?.providerId || entry?.providerName || item.updDocumentId || item.id
    if (!providerMap.has(key)) {
      providerMap.set(key, {
        id: key,
        name: entry?.providerName || '—',
        inn: entry?.providerInn || '',
        quantity: 0,
      })
    }
    providerMap.get(key).quantity += Number(item.quantity || 0)
  })

  providers.value = [...providerMap.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}

const loadPriceStats = async () => {
  if (isCreateMode.value) {
    priceStats.value = null
    return
  }
  const res = await fetch(`/apisup/supply/nomenclature/${encodeURIComponent(nomenclatureId.value)}/purchase-price-stats`, {
    credentials: 'include',
  })
  if (!res.ok) {
    priceStats.value = null
    return
  }
  priceStats.value = await res.json()
}

const computeAllPcts = () => {
  const last = Number(priceStats.value?.last_purchase_price)
  const opt = Number(priceForm.value.price_opt)
  const opt2 = Number(priceForm.value.price_opt2)
  const retail = Number(priceForm.value.price_retail)
  pricePcts.value.price_opt = last && opt ? ((opt / last - 1) * 100).toFixed(2) : ''
  pricePcts.value.price_opt2 = opt && opt2 ? ((opt2 / opt - 1) * 100).toFixed(2) : ''
  pricePcts.value.price_retail = opt2 && retail ? ((retail / opt2 - 1) * 100).toFixed(2) : ''
}

const initPriceForm = () => {
  priceForm.value = {
    price_opt: detail.value?.price_opt != null ? String(detail.value.price_opt) : '',
    price_opt2: detail.value?.price_opt2 != null ? String(detail.value.price_opt2) : '',
    price_retail: detail.value?.price_retail != null ? String(detail.value.price_retail) : '',
  }
  computeAllPcts()
}

const onOptValueInput = () => {
  const base = Number(priceStats.value?.last_purchase_price)
  const value = Number(priceForm.value.price_opt)
  pricePcts.value.price_opt = base && value ? ((value / base - 1) * 100).toFixed(2) : ''
}

const onOptPctInput = () => {
  const base = Number(priceStats.value?.last_purchase_price)
  const pct = Number(pricePcts.value.price_opt)
  if (base && Number.isFinite(pct)) priceForm.value.price_opt = (base * (1 + pct / 100)).toFixed(2)
}

const onOpt2ValueInput = () => {
  const base = Number(priceForm.value.price_opt)
  const value = Number(priceForm.value.price_opt2)
  pricePcts.value.price_opt2 = base && value ? ((value / base - 1) * 100).toFixed(2) : ''
}

const onOpt2PctInput = () => {
  const base = Number(priceForm.value.price_opt)
  const pct = Number(pricePcts.value.price_opt2)
  if (base && Number.isFinite(pct)) priceForm.value.price_opt2 = (base * (1 + pct / 100)).toFixed(2)
}

const onRetailValueInput = () => {
  const base = Number(priceForm.value.price_opt2)
  const value = Number(priceForm.value.price_retail)
  pricePcts.value.price_retail = base && value ? ((value / base - 1) * 100).toFixed(2) : ''
}

const onRetailPctInput = () => {
  const base = Number(priceForm.value.price_opt2)
  const pct = Number(pricePcts.value.price_retail)
  if (base && Number.isFinite(pct)) priceForm.value.price_retail = (base * (1 + pct / 100)).toFixed(2)
}

const loadPrices = async () => {
  if (isCreateMode.value) return
  pricesLoading.value = true
  try {
    await loadPriceStats()
    computeAllPcts()
  } finally {
    pricesLoading.value = false
  }
}

const savePrices = async () => {
  if (isCreateMode.value || priceSaving.value) return
  priceSaving.value = true
  priceSaveError.value = ''
  priceSaveSuccess.value = false
  try {
    const body = {
      price_opt: Number(priceForm.value.price_opt) || 0,
      price_opt2: Number(priceForm.value.price_opt2) || 0,
      price_retail: Number(priceForm.value.price_retail) || 0,
    }
    const res = await fetch(`/apisup/supply/nomenclature/${encodeURIComponent(nomenclatureId.value)}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error('save prices failed')
    detail.value = { ...(detail.value || {}), ...body }
    priceSaveSuccess.value = true
    setTimeout(() => { priceSaveSuccess.value = false }, 2500)
  } catch {
    priceSaveError.value = 'Не удалось сохранить цены.'
  } finally {
    priceSaving.value = false
  }
}

const loadPage = async () => {
  loading.value = true
  error.value = ''
  try {
    await Promise.all([loadUnits(), loadCategories(), loadNomenclature()])
    await Promise.all([loadPhotos(), loadMovement(), loadPrices()])
  } catch {
    error.value = 'Не удалось загрузить данные номенклатуры.'
  } finally {
    loading.value = false
  }
}

const saveNomenclature = async () => {
  if (saving.value) return
  if (!form.value.name.trim()) {
    error.value = 'Заполните поле "Название".'
    return
  }
  if (!form.value.warehouse_category_id) {
    error.value = 'Выберите товарную категорию.'
    return
  }
  if (!form.value.unit_id) {
    error.value = 'Выберите единицу измерения.'
    return
  }

  saving.value = true
  error.value = ''
  try {
    const payload = {
      warehouse_category_id: form.value.warehouse_category_id,
      name: form.value.name.trim(),
      description: form.value.description.trim() || null,
      article: form.value.article.trim() || null,
      unit_id: form.value.unit_id,
      length: toNumberOrNull(form.value.length),
      width: toNumberOrNull(form.value.width),
      height: toNumberOrNull(form.value.height),
      weight: toNumberOrNull(form.value.weight),
    }

    let res
    if (isCreateMode.value) {
      res = await fetch('/apisup/supply/nomenclature', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } else {
      res = await fetch(`/apisup/supply/nomenclature/${encodeURIComponent(nomenclatureId.value)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    }

    if (!res.ok) throw new Error('save failed')
    goBack()
  } catch {
    error.value = 'Не удалось сохранить номенклатуру.'
  } finally {
    saving.value = false
  }
}

const deleteNomenclature = async () => {
  if (isCreateMode.value || deleting.value) return
  if (!window.confirm('Удалить номенклатуру?')) return
  deleting.value = true
  error.value = ''
  try {
    const res = await fetch(`/apisup/supply/nomenclature/${encodeURIComponent(nomenclatureId.value)}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    if (!res.ok) throw new Error('delete failed')
    goBack()
  } catch {
    error.value = 'Не удалось удалить номенклатуру.'
  } finally {
    deleting.value = false
  }
}

watch(() => route.params.nomenclatureId, () => {
  detail.value = null
  tab.value = 'info'
  form.value = {
    name: '',
    warehouse_category_id: '',
    unit_id: '',
    description: '',
    article: '',
    length: '',
    width: '',
    height: '',
    weight: '',
  }
  unitDropdownOpen.value = false
  loadPage()
})

onMounted(() => {
  loadPage()
  window.addEventListener('mousedown', handleWindowClick)
})

watch(unitModalOpen, (open) => {
  if (!open) {
    unitError.value = ''
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('mousedown', handleWindowClick)
  revokePhotoUrls()
})
</script>

<template>
  <div class="page">
    <TopNav :links="navLinks" />

    <main class="main-content">
      <header class="page-head">
        <button type="button" class="back-btn" @click="goBack">
          <i class="fas fa-arrow-left"></i>
          Назад
        </button>
        <h1 class="page-title">{{ pageTitle }}</h1>
      </header>

      <div v-if="loading" class="inline-state">Загрузка...</div>
      <div v-else>
        <div v-if="error" class="inline-state error">{{ error }}</div>

        <div v-if="!isCreateMode" class="tabs">
          <button type="button" class="tab-btn" :class="{ active: tab === 'info' }" @click="tab = 'info'">Информация</button>
          <button type="button" class="tab-btn" :class="{ active: tab === 'movement' }" @click="tab = 'movement'">Движение товара</button>
          <button type="button" class="tab-btn" :class="{ active: tab === 'providers' }" @click="tab = 'providers'">Поставщики</button>
          <button type="button" class="tab-btn" :class="{ active: tab === 'prices' }" @click="tab = 'prices'">Цены</button>
        </div>

        <section v-if="isCreateMode || tab === 'info'" class="form-card content-section">
          <div class="form-grid one-col">
            <label class="field">
              <span>Фотография</span>
              <label class="file-trigger">
                <input type="file" accept="image/*" multiple class="file-input" :disabled="isCreateMode" @change="onPhotoChange">
                <i class="fas fa-camera"></i>
                {{ photosUploading ? 'Загрузка...' : 'Добавить фото' }}
              </label>
              <div v-if="isCreateMode" class="inline-state">Фотографии можно загрузить после создания номенклатуры.</div>
              <div v-else-if="photosLoading" class="inline-state">Загрузка фотографий...</div>
              <div v-else-if="photosError" class="inline-state error">{{ photosError }}</div>
              <div v-else-if="photos.length" class="photos-grid">
                <div v-for="(item, index) in photos" :key="item.id" class="photo-card">
                  <button type="button" class="photo-thumb" @click="openPhotoViewer(index)">
                    <img v-if="item.previewUrl" :src="item.previewUrl" :alt="photoName(item)">
                    <span v-else class="photo-fallback">{{ photoName(item) }}</span>
                  </button>
                  <div class="photo-caption">{{ photoName(item) }}</div>
                  <div class="photo-actions">
                    <button type="button" class="btn" @click="downloadPhoto(item)">Скачать</button>
                    <button type="button" class="btn btn-danger" @click="deletePhoto(item)">Удалить</button>
                  </div>
                </div>
              </div>
              <div v-else class="inline-state">
                Фотографии не загружены.
              </div>
            </label>
          </div>

          <div class="form-grid two-col">
            <label class="field">
              <span>Название</span>
              <input v-model="form.name" type="text" class="field-input">
            </label>

            <label class="field">
              <span>Товарная категория</span>
              <button type="button" class="field-input picker-trigger" @click="categoryPickerOpen = true">
                {{ selectedCategoryLabel || 'Выберите категорию' }}
              </button>
            </label>

            <label class="field unit-picker">
              <span>Единицы измерения</span>
              <button type="button" class="field-input picker-trigger" @click="unitDropdownOpen = !unitDropdownOpen">
                {{ selectedUnitLabel || 'Выберите ед. изм.' }}
              </button>
              <div v-if="unitDropdownOpen" class="unit-dropdown">
                <button type="button" class="unit-create" @click="openCreateUnitModal">
                  + Ед. изм.
                </button>
                <button
                  v-for="item in unitOptions"
                  :key="item.id"
                  type="button"
                  class="unit-option"
                  @click="selectUnit(item.id)"
                >
                  {{ item.name }}
                </button>
              </div>
            </label>

            <label class="field">
              <span>Вес</span>
              <input v-model="form.weight" type="text" class="field-input" placeholder="0">
            </label>

            <label class="field">
              <span>Артикул</span>
              <input v-model="form.article" type="text" class="field-input">
            </label>
          </div>

          <div class="form-grid one-col">
            <label class="field">
              <span>Описание</span>
              <textarea v-model="form.description" class="field-input textarea" rows="3"></textarea>
            </label>
          </div>

          <div class="form-grid dims-grid">
            <label class="field">
              <span>Длина</span>
              <input v-model="form.length" type="text" class="field-input" placeholder="0">
            </label>
            <div class="dims-sep">x</div>
            <label class="field">
              <span>Ширина</span>
              <input v-model="form.width" type="text" class="field-input" placeholder="0">
            </label>
            <div class="dims-sep">x</div>
            <label class="field">
              <span>Высота</span>
              <input v-model="form.height" type="text" class="field-input" placeholder="0">
            </label>
          </div>
        </section>

        <section v-else-if="tab === 'movement'" class="movement-section content-section">
          <div v-if="!movement.length" class="inline-state">Движений пока нет.</div>
          <div v-else class="movement-table-wrap">
            <table class="movement-table">
              <thead>
                <tr>
                  <th class="mt-col-date">Дата</th>
                  <th class="mt-col-doc">Документы</th>
                  <th class="mt-col-name">Товар / В документе</th>
                  <th class="mt-col-qty">Кол-во</th>
                  <th class="mt-col-type">Тип операции</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in movement" :key="item.id">
                  <td class="mt-col-date mt-date">{{ formatDate(item.documentDate) }}</td>
                  <td class="mt-col-doc">
                    <div class="movement-docs">
                      <button
                        v-if="item.updDocumentId && warehouseId"
                        type="button"
                        class="document-link"
                        @click="openDocument(item.updDocumentId)"
                      >УПД</button>
                      <button
                        v-if="item.invoiceId"
                        type="button"
                        class="document-link"
                        @click="openInvoice(item.invoiceId)"
                      >Счёт</button>
                      <button
                        v-if="item.deliveryId"
                        type="button"
                        class="document-link"
                        @click="openDelivery(item.deliveryId)"
                      >Доставка</button>
                    </div>
                  </td>
                  <td class="mt-col-name">
                    <div class="mt-name-primary">{{ item.nomenclatureName }}</div>
                    <div v-if="item.invoiceItemName && item.invoiceItemName !== '—'" class="mt-name-secondary">Счёт: {{ item.invoiceItemName }}</div>
                    <div v-if="item.updItemName && item.updItemName !== '—'" class="mt-name-secondary">УПД: {{ item.updItemName }}</div>
                  </td>
                  <td class="mt-col-qty mt-qty" :class="item.accentClass">{{ item.movementValue || formatNumber(item.quantity) }} {{ item.unitName }}</td>
                  <td class="mt-col-type">
                    <span class="movement-type-chip" :class="item.accentClass">{{ item.typeLabel }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section v-else-if="tab === 'providers'" class="providers-list content-section">
          <article v-for="provider in providers" :key="provider.id" class="provider-card">
            <div class="provider-avatar">{{ providerInitial(provider.name) }}</div>
            <div class="provider-info">
              <div class="provider-name">{{ provider.name }}</div>
              <div v-if="provider.inn" class="provider-inn">ИНН {{ provider.inn }}</div>
              <div class="provider-meta">Поступило: {{ formatNumber(provider.quantity) }}</div>
            </div>
          </article>
          <div v-if="!providers.length" class="inline-state">Поставщики пока не определены.</div>
        </section>

        <section v-else-if="tab === 'prices'" class="prices-section content-section">
          <div v-if="pricesLoading" class="inline-state">Загрузка цен...</div>
          <template v-else>
            <div class="price-card">
              <div class="price-card-header">
                <span class="price-card-title">Цены продажи</span>
                <div class="price-save-row">
                  <span v-if="priceSaveSuccess" class="price-save-ok"><i class="fas fa-check"></i> Сохранено</span>
                  <span v-if="priceSaveError" class="price-save-err">{{ priceSaveError }}</span>
                  <button type="button" class="btn btn-primary" :disabled="priceSaving" @click="savePrices">
                    {{ priceSaving ? 'Сохраняю...' : 'Сохранить' }}
                  </button>
                </div>
              </div>

              <div class="price-fields">
                <div class="price-field">
                  <div class="price-field-header">
                    <span class="price-field-label">Оптовая</span>
                    <span class="price-field-hint">% от закупочной</span>
                  </div>
                  <div class="price-dual">
                    <div class="price-input-wrap">
                      <input v-model="priceForm.price_opt" type="number" min="0" step="0.01" class="field-input price-input" @input="onOptValueInput">
                      <span class="price-input-sfx">₽</span>
                    </div>
                    <div class="price-input-wrap price-pct-wrap">
                      <input v-model="pricePcts.price_opt" type="number" step="0.01" class="field-input price-input" @input="onOptPctInput">
                      <span class="price-input-sfx">%</span>
                    </div>
                  </div>
                </div>

                <div class="price-field">
                  <div class="price-field-header">
                    <span class="price-field-label">Оптовая 2</span>
                    <span class="price-field-hint">% от оптовой</span>
                  </div>
                  <div class="price-dual">
                    <div class="price-input-wrap">
                      <input v-model="priceForm.price_opt2" type="number" min="0" step="0.01" class="field-input price-input" @input="onOpt2ValueInput">
                      <span class="price-input-sfx">₽</span>
                    </div>
                    <div class="price-input-wrap price-pct-wrap">
                      <input v-model="pricePcts.price_opt2" type="number" step="0.01" class="field-input price-input" @input="onOpt2PctInput">
                      <span class="price-input-sfx">%</span>
                    </div>
                  </div>
                </div>

                <div class="price-field">
                  <div class="price-field-header">
                    <span class="price-field-label">Розница</span>
                    <span class="price-field-hint">% от оптовой 2</span>
                  </div>
                  <div class="price-dual">
                    <div class="price-input-wrap">
                      <input v-model="priceForm.price_retail" type="number" min="0" step="0.01" class="field-input price-input" @input="onRetailValueInput">
                      <span class="price-input-sfx">₽</span>
                    </div>
                    <div class="price-input-wrap price-pct-wrap">
                      <input v-model="pricePcts.price_retail" type="number" step="0.01" class="field-input price-input" @input="onRetailPctInput">
                      <span class="price-input-sfx">%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="priceStats" class="stats-grid">
              <article class="stat-card">
                <span class="stat-label">Последняя закупка</span>
                <strong class="stat-value">{{ formatPrice(priceStats.last_purchase_price) }}</strong>
                <span class="stat-hint">{{ formatDate(priceStats.last_purchase_date) }}</span>
              </article>
              <article class="stat-card">
                <span class="stat-label">Средняя закупка</span>
                <strong class="stat-value">{{ formatPrice(priceStats.avg_purchase_price) }}</strong>
              </article>
              <article class="stat-card">
                <span class="stat-label">Минимальная закупка</span>
                <strong class="stat-value">{{ formatPrice(priceStats.min_purchase_price) }}</strong>
              </article>
              <article class="stat-card">
                <span class="stat-label">Максимальная закупка</span>
                <strong class="stat-value">{{ formatPrice(priceStats.max_purchase_price) }}</strong>
              </article>
            </div>
          </template>
        </section>

        <div v-if="isCreateMode || tab === 'info'" class="actions-row">
          <button type="button" class="btn btn-primary" :disabled="saving" @click="saveNomenclature">
            {{ saving ? 'Сохранение...' : 'Сохранить' }}
          </button>
          <button type="button" class="btn" @click="goBack">Отмена</button>
          <button
            v-if="!isCreateMode"
            type="button"
            class="btn btn-danger"
            :disabled="deleting"
            @click="deleteNomenclature"
          >
            {{ deleting ? 'Удаление...' : 'Удалить' }}
          </button>
        </div>
      </div>
    </main>

    <CategoryTreePickerModal
      :open="categoryPickerOpen"
      title="Выбор товарной категории"
      :categories="categoryOptions"
      :selected-id="form.warehouse_category_id"
      :allow-none="false"
      @close="categoryPickerOpen = false"
      @select="(id) => { form.warehouse_category_id = id }"
    />

    <div v-if="unitModalOpen" class="modal-backdrop" @click.self="closeCreateUnitModal">
      <div class="modal-card">
        <div class="modal-head">
          <h3>Создать ед. изм.</h3>
          <button type="button" class="modal-close" @click="closeCreateUnitModal">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body">
          <label class="field">
            <span>Название</span>
            <input v-model="newUnitName" type="text" class="field-input" placeholder="Например, л">
          </label>
          <div v-if="unitError" class="inline-state error">{{ unitError }}</div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-primary" :disabled="unitSaving" @click="saveUnit">
            {{ unitSaving ? 'Создание...' : 'Создать' }}
          </button>
          <button type="button" class="btn" @click="closeCreateUnitModal">Отмена</button>
        </div>
      </div>
    </div>

    <div v-if="photoViewerOpen && currentPhoto" class="viewer-backdrop" @click.self="closePhotoViewer">
      <div class="viewer-shell">
        <button type="button" class="viewer-close" @click="closePhotoViewer">
          <i class="fas fa-times"></i>
        </button>
        <button v-if="photos.length > 1" type="button" class="viewer-nav viewer-prev" @click="showPrevPhoto">
          <i class="fas fa-chevron-left"></i>
        </button>
        <div class="viewer-stage">
          <img v-if="currentPhoto.previewUrl" :src="currentPhoto.previewUrl" :alt="photoName(currentPhoto)">
        </div>
        <button v-if="photos.length > 1" type="button" class="viewer-nav viewer-next" @click="showNextPhoto">
          <i class="fas fa-chevron-right"></i>
        </button>
        <div class="viewer-caption">
          {{ photoName(currentPhoto) }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.main-content {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.page-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.content-section {
  margin-top: 12px;
}

.tab-btn {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  padding: 7px 10px;
  cursor: pointer;
}

.tab-btn.active {
  border-color: var(--brand-primary);
  background: var(--brand-light);
  color: var(--brand-primary);
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
  font-size: 24px;
  color: var(--text-primary);
}

.inline-state {
  color: var(--text-secondary);
  font-size: 13px;
}

.inline-state.error {
  color: var(--danger-text);
}

.form-card {
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: var(--bg-surface);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.form-grid {
  display: grid;
  gap: 10px;
}

.form-grid.one-col {
  grid-template-columns: 1fr;
}

.form-grid.two-col {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.dims-grid {
  grid-template-columns: minmax(0, 1fr) 24px minmax(0, 1fr) 24px minmax(0, 1fr);
  align-items: end;
}

.dims-sep {
  text-align: center;
  color: var(--text-tertiary);
  padding-bottom: 10px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.field-input {
  width: 100%;
  min-height: 36px;
  border-radius: 8px;
  border: 1px solid var(--border-light);
  background: var(--bg-subtle);
  color: var(--text-primary);
  padding: 0 10px;
}

.picker-trigger {
  text-align: left;
  cursor: pointer;
}

.unit-picker {
  position: relative;
}

.unit-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 2500;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background: var(--bg-surface);
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.15);
  max-height: 280px;
  overflow: auto;
}

.unit-create,
.unit-option {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--bg-surface);
  color: var(--text-primary);
  padding: 7px 10px;
  text-align: left;
  cursor: pointer;
}

.unit-create {
  border-style: dashed;
  background: var(--bg-subtle);
  color: var(--text-secondary);
}

.textarea {
  min-height: 88px;
  padding: 8px 10px;
  resize: vertical;
}

.file-input {
  display: none;
}

.file-trigger {
  min-height: 36px;
  border-radius: 8px;
  border: 1px dashed var(--border-light);
  background: var(--bg-subtle);
  color: var(--text-secondary);
  padding: 0 12px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.photo-preview {
  margin-top: 10px;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--border-light);
  max-width: 320px;
}

.photo-preview img {
  display: block;
  width: 100%;
  height: auto;
}

.photos-grid {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}

.photo-card {
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: var(--bg-surface);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.photo-thumb {
  border: none;
  background: #f8fafc;
  cursor: pointer;
  padding: 0;
  aspect-ratio: 4 / 3;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.photo-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.photo-fallback {
  padding: 12px;
  color: var(--text-secondary);
  font-size: 13px;
}

.photo-caption {
  padding: 10px 10px 0;
  font-size: 12px;
  color: var(--text-secondary);
  word-break: break-word;
}

.photo-actions {
  display: flex;
  gap: 8px;
  padding: 10px;
}

.actions-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.btn {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  padding: 7px 12px;
  cursor: pointer;
}

.btn-primary {
  border-color: var(--brand-primary);
  background: var(--brand-primary);
  color: #fff;
}

.btn-danger {
  border-color: #ef4444;
  background: #fef2f2;
  color: #b91c1c;
}

.movement-section,
.providers-list,
.prices-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.movement-table-wrap {
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: var(--bg-surface);
  overflow: auto;
}

.movement-table {
  width: 100%;
  border-collapse: collapse;
}

.movement-table th,
.movement-table td {
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-light);
  text-align: left;
  vertical-align: top;
}

.mt-col-date { width: 96px; }
.mt-col-doc  { width: 150px; }
.mt-col-qty  { width: 110px; }
.mt-col-type { width: 140px; }
.mt-col-name { min-width: 0; }

.mt-date,
.mt-qty {
  white-space: nowrap;
}

.mt-qty {
  font-weight: 600;
}

.mt-name-primary {
  color: var(--text-primary);
  font-weight: 600;
}

.mt-name-secondary {
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 12px;
}

.movement-docs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.movement-receipt {
  color: #166534;
}

.movement-outgoing {
  color: #b91c1c;
}

.document-link {
  border: 1px solid color-mix(in srgb, var(--brand-primary) 24%, var(--border-light));
  border-radius: 999px;
  padding: 4px 8px;
  background: var(--bg-surface);
  color: var(--brand-primary);
  cursor: pointer;
  font-size: 12px;
  text-align: left;
}

.movement-type-chip {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid var(--border-light);
  background: var(--bg-subtle);
  font-size: 12px;
  font-weight: 600;
}

.providers-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
}

.provider-card,
.price-card,
.stat-card {
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: var(--bg-surface);
}

.provider-card {
  padding: 14px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.provider-avatar {
  width: 42px;
  height: 42px;
  border-radius: 999px;
  background: var(--brand-light);
  color: var(--brand-primary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
}

.provider-name {
  color: var(--text-primary);
  font-weight: 600;
}

.provider-inn,
.provider-meta {
  margin-top: 2px;
  color: var(--text-secondary);
  font-size: 12px;
}

.price-card {
  padding: 14px;
}

.price-card-header,
.price-field-header,
.price-save-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.price-card-title,
.price-field-label {
  color: var(--text-primary);
  font-weight: 700;
}

.price-field-hint,
.price-save-err,
.price-save-ok {
  color: var(--text-secondary);
  font-size: 12px;
}

.price-fields {
  margin-top: 14px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
}

.price-field {
  border: 1px solid var(--border-light);
  border-radius: 10px;
  padding: 12px;
  background: var(--bg-subtle);
}

.price-dual {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 110px;
  gap: 10px;
  margin-top: 10px;
}

.price-input-wrap {
  position: relative;
}

.price-input {
  padding-right: 34px;
}

.price-input-sfx {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-tertiary);
  font-size: 12px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 12px;
}

.stat-card {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stat-label,
.stat-hint {
  color: var(--text-secondary);
  font-size: 12px;
}

.stat-value {
  color: var(--text-primary);
  font-size: 20px;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 4000;
  padding: 18px;
}

.modal-card {
  width: min(420px, 100%);
  border-radius: 12px;
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  box-shadow: 0 20px 40px rgba(15, 23, 42, 0.25);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.modal-head h3 {
  margin: 0;
  font-size: 18px;
  color: var(--text-primary);
}

.modal-close {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

.modal-body,
.modal-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.viewer-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.86);
  z-index: 4500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.viewer-shell {
  position: relative;
  width: min(92vw, 1400px);
  height: min(92vh, 980px);
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr) 56px;
  grid-template-rows: minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
}

.viewer-stage {
  grid-column: 2;
  grid-row: 1;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.viewer-stage img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 12px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
}

.viewer-nav,
.viewer-close {
  border: none;
  border-radius: 999px;
  width: 44px;
  height: 44px;
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
  cursor: pointer;
}

.viewer-prev {
  grid-column: 1;
  grid-row: 1;
}

.viewer-next {
  grid-column: 3;
  grid-row: 1;
}

.viewer-close {
  position: absolute;
  top: 0;
  right: 0;
}

.viewer-caption {
  grid-column: 1 / span 3;
  grid-row: 2;
  text-align: center;
  color: #e2e8f0;
  font-size: 14px;
}

@media (max-width: 900px) {
  .form-grid.two-col,
  .dims-grid {
    grid-template-columns: 1fr;
  }

  .dims-sep {
    display: none;
  }
}
</style>
