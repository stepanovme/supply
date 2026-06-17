<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TopNav from '../components/layout/TopNav.vue'
import { buildWarehouseCategoryTree } from '../helpers/warehouseCategoryTree'
import { mainNavLinks } from '../constants/mainNav'
import stepHouseLogo from '../assets/shop/step_house.png'

const route = useRoute()
const router = useRouter()

const nomenclatureId = computed(() => String(route.params.nomenclatureId || ''))
const warehouseId = computed(() => String(route.query.warehouse_id || ''))
const navLinks = mainNavLinks

const loading = ref(false)
const error = ref('')
const detail = ref(null)
const categoryOptions = ref([])
const photos = ref([])
const photosLoading = ref(false)
const tab = ref('info')
const movement = ref([])
const providers = ref([])
const photoViewerOpen = ref(false)
const activePhotoIndex = ref(0)
const priceTagModalOpen = ref(false)

// ── Prices ──────────────────────────────────────────────────────────
const priceStats = ref(null)
const priceHistory = ref([])
const priceForm = ref({ price_opt: '', price_opt2: '', price_retail: '' })
const pricePcts = ref({ price_opt: '', price_opt2: '', price_retail: '' })
const pricePeriod = ref('all')
const pricesLoading = ref(false)
const priceSaving = ref(false)
const priceSaveSuccess = ref(false)
const priceSaveError = ref('')
const visibleTypes = ref(['price_purchase', 'price_opt', 'price_opt2', 'price_retail'])
const chartTooltip = ref({ show: false, x: 0, y: 0, label: '', color: '', value: 0, date: '' })
const historyFilters = ref({ types: [], dateFrom: '', dateTo: '', valueMin: '', valueMax: '' })

const PRICE_TYPES = {
  price_purchase: { label: 'Закупочная', color: '#64748b' },
  price_opt:      { label: 'Оптовая',    color: '#3b82f6' },
  price_opt2:     { label: 'Оптовая 2',  color: '#8b5cf6' },
  price_retail:   { label: 'Розница',    color: '#10b981' },
}

const categoryMeta = computed(() => buildWarehouseCategoryTree(categoryOptions.value))
const categoryPathById = computed(() => categoryMeta.value.byId)
const categoryLabel = computed(() => {
  const id = String(detail.value?.warehouse_category_id || '')
  return categoryPathById.value.get(id)?.pathLabel || detail.value?.warehouse_category?.name || '—'
})
const pageTitle = computed(() => detail.value?.name || 'Номенклатура')
const currentPhoto = computed(() => photos.value[activePhotoIndex.value] || null)

const normalizeArray = (payload) => {
  if (Array.isArray(payload)) return payload
  return payload?.items || payload?.data || payload?.results || []
}

const formatDate = (value) => {
  if (!value) return '—'
  const source = String(value).slice(0, 10)
  const parts = source.split('-')
  if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`
  return source
}

const formatNumber = (value) => {
  const num = Number(value)
  if (!Number.isFinite(num)) return '0'
  return num.toLocaleString('ru-RU')
}

const providerInitial = (name) => {
  const cleaned = String(name || '')
    .replace(/^(ООО|ОАО|ЗАО|ПАО|АО|ИП|НКО|ГУП|МУП)\s+/i, '')
    .replace(/^["«»"']/, '')
    .trim()
  return (cleaned[0] || name[0] || '?').toUpperCase()
}

const formatPrice = (v) => {
  const n = Number(v)
  if (!Number.isFinite(n) || n === 0) return '—'
  return n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽'
}

const formatPriceTagPrice = (value) => {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return ''
  return num.toLocaleString('ru-RU', {
    minimumFractionDigits: Number.isInteger(num) ? 0 : 2,
    maximumFractionDigits: 2,
  })
}

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;')

const CODE128_PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
]

const buildCode128BarcodeSvg = (value) => {
  const text = String(value || '').trim()
  if (!text) return ''
  const invalidChar = [...text].find((char) => {
    const code = char.charCodeAt(0)
    return code < 32 || code > 126
  })
  if (invalidChar) return ''

  const codes = [104, ...[...text].map((char) => char.charCodeAt(0) - 32)]
  const checksum = codes.reduce((sum, code, index) => sum + code * (index === 0 ? 1 : index), 0) % 103
  const fullCodes = [...codes, checksum, 106]
  let x = 10
  const height = 44
  const moduleWidth = 1.45
  const bars = []
  for (const code of fullCodes) {
    const pattern = CODE128_PATTERNS[code]
    let drawBar = true
    for (const part of pattern) {
      const width = Number(part) * moduleWidth
      if (drawBar) {
        bars.push(`<rect x="${x.toFixed(2)}" y="2" width="${width.toFixed(2)}" height="${height}" fill="#111"/>`)
      }
      x += width
      drawBar = !drawBar
    }
  }
  const width = Math.ceil(x + 10)
  return `<svg class="barcode-svg" viewBox="0 0 ${width} 50" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeHtml(text)}">${bars.join('')}</svg>`
}

const openPriceTagModal = () => {
  priceTagModalOpen.value = true
}

const printPriceTag = (variant = 'standard') => {
  const retailPrice = detail.value?.price_retail ?? priceForm.value.price_retail
  const formattedPrice = formatPriceTagPrice(retailPrice)
  if (!formattedPrice) {
    window.alert('У номенклатуры не указана розничная цена.')
    return
  }

  const name = escapeHtml(detail.value?.name || 'Номенклатура')
  const articleRaw = String(detail.value?.article || '').trim()
  const article = escapeHtml(articleRaw)
  const unitName = escapeHtml(detail.value?.unit?.name || detail.value?.unit_name || 'шт.')
  const withArticle = variant === 'article' || variant === 'barcode'
  const withBarcode = variant === 'barcode'
  const barcodeSvg = withBarcode ? buildCode128BarcodeSvg(articleRaw) : ''
  if (withArticle && !articleRaw) {
    window.alert('У номенклатуры не указан артикул.')
    return
  }
  if (withBarcode && !barcodeSvg) {
    window.alert('Для штрих-кода нужен артикул латиницей, цифрами или стандартными символами.')
    return
  }
  priceTagModalOpen.value = false
  const logoUrl = new URL(stepHouseLogo, window.location.origin).href
  const tagClass = withBarcode ? 'price-tag price-tag-barcode' : withArticle ? 'price-tag price-tag-article' : 'price-tag'
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)

  const doc = iframe.contentWindow?.document
  if (!doc) {
    iframe.remove()
    return
  }

  doc.open()
  doc.write(`<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <title>Ценник</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 0;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background: #fff;
      color: #334044;
      font-family: Arial, "Helvetica Neue", sans-serif;
    }

    .sheet {
      width: 216mm;
      display: grid;
      grid-template-columns: repeat(3, 72mm);
      grid-auto-rows: 42mm;
      gap: 0;
      align-content: start;
      justify-content: start;
      margin: 0;
    }

    .price-tag {
      width: 72mm;
      height: 42mm;
      border: 2mm solid #43a047;
      background: #fff;
      display: grid;
      grid-template-rows: 7mm 14mm 12.2mm 4.8mm;
      align-items: center;
      padding: 1.2mm 2mm 1.6mm;
      overflow: hidden;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .price-tag-article {
      grid-template-rows: 6.4mm 4mm 11mm 11.8mm 4.8mm;
    }

    .price-tag-barcode {
      grid-template-rows: 5.6mm 3.2mm 7.8mm 8.7mm 6.6mm 5.3mm;
      padding: 1mm 2mm 2mm;
    }

    .logo {
      max-width: 26mm;
      max-height: 6.2mm;
      justify-self: center;
      object-fit: contain;
    }

    .name {
      align-self: center;
      text-align: center;
      font-size: 4.8mm;
      line-height: 1.08;
      font-weight: 800;
      color: #334044;
      overflow-wrap: anywhere;
      max-height: 14.5mm;
      overflow: hidden;
    }

    .article {
      justify-self: center;
      width: 100%;
      text-align: center;
      font-size: 3.2mm;
      line-height: 1;
      font-weight: 700;
      color: #334044;
      white-space: nowrap;
      overflow: hidden;
    }

    .price {
      text-align: center;
      font-size: 13.8mm;
      line-height: 1;
      font-weight: 900;
      letter-spacing: 0;
      color: #334044;
      white-space: nowrap;
    }

    .price-tag-barcode .name {
      font-size: 3.15mm;
      max-height: 7.6mm;
    }

    .price-tag-barcode .price {
      font-size: 8.8mm;
    }

    .barcode {
      width: 100%;
      height: 6.4mm;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      background: #fff;
    }

    .barcode-svg {
      width: 58mm;
      height: 6.1mm;
      display: block;
    }

    .unit {
      justify-self: end;
      align-self: center;
      font-size: 3.1mm;
      line-height: 1;
      font-weight: 700;
      color: #334044;
    }

    .price-tag-barcode .unit {
      align-self: start;
      font-size: 3.05mm;
      padding-top: 0.8mm;
    }

    @media print {
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>
  <main class="sheet">
    ${Array.from({ length: 21 }).map(() => `
      <section class="${tagClass}">
        <img class="logo" src="${logoUrl}" alt="Степ Хаус">
        ${withArticle ? `<div class="article fit-article">Арт. ${article}</div>` : ''}
        <div class="name fit-name">${name}</div>
        <div class="price fit-price">${formattedPrice} ₽</div>
        ${withBarcode ? `<div class="barcode">${barcodeSvg}</div>` : ''}
        <div class="unit fit-unit">Цена за ${unitName}</div>
      </section>
    `).join('')}
  </main>
  <script>
    const fitText = (el, minPx) => {
      const computed = window.getComputedStyle(el);
      let size = parseFloat(computed.fontSize);
      let guard = 0;
      while (
        guard < 80
        && size > minPx
        && (el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth)
      ) {
        size -= 0.5;
        el.style.fontSize = size + 'px';
        guard += 1;
      }
    };

    window.onload = () => {
      document.querySelectorAll('.fit-name').forEach((el) => fitText(el, 8));
      document.querySelectorAll('.fit-price').forEach((el) => fitText(el, 28));
      document.querySelectorAll('.fit-unit').forEach((el) => fitText(el, 8));
      document.querySelectorAll('.fit-article').forEach((el) => fitText(el, 7));
      window.focus();
      setTimeout(() => window.print(), 160);
    };
  <\/script>
</body>
</html>`)
  doc.close()

  iframe.contentWindow.onafterprint = () => {
    iframe.remove()
  }

  setTimeout(() => {
    iframe.remove()
  }, 60000)
}

const diffPct = (base, target) => {
  const b = Number(base)
  const t = Number(target)
  if (!b || !Number.isFinite(b) || !Number.isFinite(t)) return null
  return (t - b) / b * 100
}

const goBack = () => {
  const back = String(route.query.back || '')
  if (back) {
    router.push(back)
    return
  }
  router.push('/warehouses')
}

const openEdit = () => {
  router.push({
    name: 'nomenclature-detail',
    params: {
      nomenclatureId: nomenclatureId.value,
    },
    query: {
      back: route.fullPath,
      warehouse_id: warehouseId.value,
    },
  })
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

const revokePhotoUrls = () => {
  photos.value.forEach((item) => {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
  })
}

const buildPhotoUrl = (fileId) =>
  `/apisup/supply/nomenclature/${encodeURIComponent(nomenclatureId.value)}/photos/${encodeURIComponent(fileId)}/download`

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

const loadDetail = async () => {
  const res = await fetch(`/apisup/supply/nomenclature/${encodeURIComponent(nomenclatureId.value)}`, {
    credentials: 'include',
  })
  if (!res.ok) throw new Error('nomenclature load failed')
  detail.value = await res.json()
}

const loadPhotos = async () => {
  photosLoading.value = true
  try {
    const res = await fetch(`/apisup/supply/nomenclature/${encodeURIComponent(nomenclatureId.value)}/photos`, {
      credentials: 'include',
    })
    if (!res.ok) throw new Error('photos load failed')
    const items = normalizeArray(await res.json())
    const nextPhotos = await Promise.all(items.map(async (item) => {
      const fileId = String(item?.id || item?.file_id || '')
      if (!fileId) return { ...item, previewUrl: '' }
      try {
        const fileRes = await fetch(buildPhotoUrl(fileId), { credentials: 'include' })
        if (!fileRes.ok) throw new Error('download failed')
        const blob = await fileRes.blob()
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
  } finally {
    photosLoading.value = false
  }
}

const loadMovement = async () => {
  const res = await fetch(`/apisup/supply/nomenclature/${encodeURIComponent(nomenclatureId.value)}/movement-history`, {
    credentials: 'include',
  })
  if (!res.ok) throw new Error('movement load failed')
  const payload = await res.json()
  const items = normalizeArray(payload?.items || payload)
  const rows = items.map((item) => ({
    id: String(item?.id || ''),
    type: String(item?.kind || ''),
    typeLabel: String(item?.operation || '—'),
    accentClass: String(item?.movement || '').startsWith('-') ? 'movement-outgoing' : 'movement-receipt',
    nomenclatureName: String(item?.nomenclature_name || payload?.nomenclature_name || detail.value?.name || '—'),
    invoiceItemName: String(item?.invoice_item_name || '—'),
    updItemName: String(item?.upd_item_name || '—'),
    quantity: Number(item?.quantity || 0),
    unitName: String(item?.unit_name || payload?.unit_name || detail.value?.unit?.name || detail.value?.unit_name || '—'),
    documentDate: String(item?.event_at || item?.warehouse_receipt_date_arrival || item?.warehouse_receipt_created_at || ''),
    sortDate: String(item?.event_at || item?.warehouse_receipt_created_at || item?.warehouse_receipt_date_arrival || ''),
    movementValue: String(item?.movement || ''),
    updDocumentId: String(item?.upd_documents_id || ''),
    invoiceId: String(item?.invoice?.id || item?.invoice_id || ''),
    invoiceNum: String(item?.invoice?.num || item?.invoice_num || '—'),
    deliveryId: String(item?.delivery_id || item?.delivery?.id || ''),
    deliveryNum: String(item?.delivery?.num || item?.delivery_num || '—'),
  }))
  rows.sort((a, b) => String(b.sortDate || '').localeCompare(String(a.sortDate || '')))
  movement.value = rows

  const uniqueDocumentIds = [...new Set(rows.map((item) => item.updDocumentId).filter(Boolean))]
  const providerEntries = await Promise.all(uniqueDocumentIds.map(async (id) => {
    try {
      const resDoc = await fetch(`/apisup/supply/upd-documents/${encodeURIComponent(id)}`, {
        credentials: 'include',
      })
      if (!resDoc.ok) return null
      const doc = await resDoc.json()
      return {
        id,
        providerId: String(doc?.provider_id || ''),
        providerName: String(doc?.provider_name || doc?.provider?.short_name || '—'),
        providerInn: String(doc?.provider?.inn || doc?.inn || ''),
        documentNum: String(doc?.num || '—'),
        documentDate: String(doc?.date || ''),
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
        documents: [],
        quantity: 0,
      })
    }
    const current = providerMap.get(key)
    if (entry?.documentNum) {
      const signature = `${entry.documentNum}|${entry.documentDate}`
      if (!current.documents.some((doc) => doc.signature === signature)) {
        current.documents.push({
          signature,
          num: entry.documentNum,
          date: entry.documentDate,
        })
      }
    }
    current.quantity += Number(item.quantity || 0)
  })

  providers.value = [...providerMap.values()]
    .map((provider) => ({
      ...provider,
      documentsCount: provider.documents.length,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}

const loadPriceStats = async () => {
  const res = await fetch(
    `/apisup/supply/nomenclature/${encodeURIComponent(nomenclatureId.value)}/purchase-price-stats`,
    { credentials: 'include' },
  )
  if (!res.ok) return
  priceStats.value = await res.json()
}

const loadPriceHistory = async () => {
  const res = await fetch(
    `/apisup/supply/warehouse-price-history?nomenclature_id=${encodeURIComponent(nomenclatureId.value)}`,
    { credentials: 'include' },
  )
  if (!res.ok) return
  const data = await res.json()
  priceHistory.value = normalizeArray(data).map((item) => ({
    id: String(item.id || ''),
    type: String(item.type || ''),
    value: Number(item.value || 0),
    date: String(item.date || ''),
  }))
}

const computeAllPcts = () => {
  const last = Number(priceStats.value?.last_purchase_price)
  const opt  = Number(priceForm.value.price_opt)
  const opt2 = Number(priceForm.value.price_opt2)
  const ret  = Number(priceForm.value.price_retail)
  pricePcts.value.price_opt    = (last && opt)  ? ((opt  / last - 1) * 100).toFixed(2) : ''
  pricePcts.value.price_opt2   = (opt  && opt2) ? ((opt2 / opt  - 1) * 100).toFixed(2) : ''
  pricePcts.value.price_retail = (opt2 && ret)  ? ((ret  / opt2 - 1) * 100).toFixed(2) : ''
}

const onOptValueInput = () => {
  const base = Number(priceStats.value?.last_purchase_price)
  const v = Number(priceForm.value.price_opt)
  pricePcts.value.price_opt = (base && v) ? ((v / base - 1) * 100).toFixed(2) : ''
}
const onOptPctInput = () => {
  const base = Number(priceStats.value?.last_purchase_price)
  const p = Number(pricePcts.value.price_opt)
  if (base && Number.isFinite(p)) priceForm.value.price_opt = (base * (1 + p / 100)).toFixed(2)
}
const onOpt2ValueInput = () => {
  const base = Number(priceForm.value.price_opt)
  const v = Number(priceForm.value.price_opt2)
  pricePcts.value.price_opt2 = (base && v) ? ((v / base - 1) * 100).toFixed(2) : ''
}
const onOpt2PctInput = () => {
  const base = Number(priceForm.value.price_opt)
  const p = Number(pricePcts.value.price_opt2)
  if (base && Number.isFinite(p)) priceForm.value.price_opt2 = (base * (1 + p / 100)).toFixed(2)
}
const onRetailValueInput = () => {
  const base = Number(priceForm.value.price_opt2)
  const v = Number(priceForm.value.price_retail)
  pricePcts.value.price_retail = (base && v) ? ((v / base - 1) * 100).toFixed(2) : ''
}
const onRetailPctInput = () => {
  const base = Number(priceForm.value.price_opt2)
  const p = Number(pricePcts.value.price_retail)
  if (base && Number.isFinite(p)) priceForm.value.price_retail = (base * (1 + p / 100)).toFixed(2)
}

const toggleChartType = (type) => {
  const idx = visibleTypes.value.indexOf(type)
  if (idx >= 0) {
    if (visibleTypes.value.length > 1) visibleTypes.value.splice(idx, 1)
  } else {
    visibleTypes.value.push(type)
  }
}

const onDotEnter = (event, dot, line) => {
  const wrap = event.currentTarget.closest('.chart-wrap')
  if (!wrap) return
  const wRect = wrap.getBoundingClientRect()
  const dRect = event.currentTarget.getBoundingClientRect()
  chartTooltip.value = {
    show: true,
    x: dRect.left + dRect.width / 2 - wRect.left,
    y: dRect.top - wRect.top,
    label: line.label,
    color: line.color,
    value: dot.v,
    date: dot.d,
  }
}
const onChartLeave = () => { chartTooltip.value.show = false }

const toggleHistoryType = (type) => {
  const idx = historyFilters.value.types.indexOf(type)
  if (idx >= 0) historyFilters.value.types.splice(idx, 1)
  else historyFilters.value.types.push(type)
}

const loadPrices = async () => {
  pricesLoading.value = true
  try {
    await Promise.all([loadPriceStats(), loadPriceHistory()])
    computeAllPcts()
  } finally {
    pricesLoading.value = false
  }
}

const initPriceForm = () => {
  priceForm.value = {
    price_opt: detail.value?.price_opt != null ? String(detail.value.price_opt) : '',
    price_opt2: detail.value?.price_opt2 != null ? String(detail.value.price_opt2) : '',
    price_retail: detail.value?.price_retail != null ? String(detail.value.price_retail) : '',
  }
}

const savePrices = async () => {
  priceSaving.value = true
  priceSaveError.value = ''
  priceSaveSuccess.value = false
  try {
    const body = {
      price_opt: Number(priceForm.value.price_opt) || 0,
      price_opt2: Number(priceForm.value.price_opt2) || 0,
      price_retail: Number(priceForm.value.price_retail) || 0,
    }
    const res = await fetch(
      `/apisup/supply/nomenclature/${encodeURIComponent(nomenclatureId.value)}`,
      {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    )
    if (!res.ok) throw new Error('save failed')

    const today = new Date().toISOString().slice(0, 10)
    const entries = [
      { type: 'price_opt', value: body.price_opt },
      { type: 'price_opt2', value: body.price_opt2 },
      { type: 'price_retail', value: body.price_retail },
    ].filter((e) => e.value > 0)

    await Promise.all(
      entries.map((e) =>
        fetch('/apisup/supply/warehouse-price-history', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nomenclature_id: nomenclatureId.value,
            type: e.type,
            value: e.value,
            date: today,
          }),
        }),
      ),
    )

    await loadPriceHistory()
    priceSaveSuccess.value = true
    setTimeout(() => { priceSaveSuccess.value = false }, 3000)
  } catch {
    priceSaveError.value = 'Не удалось сохранить цены.'
  } finally {
    priceSaving.value = false
  }
}

const filteredHistory = computed(() => {
  const now = new Date()
  let cutoff = null
  if (pricePeriod.value === 'year') cutoff = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
  else if (pricePeriod.value === 'month') cutoff = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
  return priceHistory.value.filter((item) => !cutoff || new Date(item.date) >= cutoff)
})

const chartSvg = computed(() => {
  const rows = filteredHistory.value
  if (!rows.length) return null

  const W = 840, H = 280
  const PAD = { top: 24, right: 32, bottom: 48, left: 76 }
  const iW = W - PAD.left - PAD.right
  const iH = H - PAD.top - PAD.bottom

  const allDates = [...new Set(rows.map((r) => r.date))].sort()
  const allVals = rows.map((r) => r.value)
  const rawMin = Math.min(...allVals)
  const rawMax = Math.max(...allVals)
  const vPad = (rawMax - rawMin) * 0.18 || rawMax * 0.12 || 20
  const minVal = rawMin - vPad
  const maxVal = rawMax + vPad
  const vRange = maxVal - minVal

  const minTs = new Date(allDates[0]).getTime()
  const maxTs = new Date(allDates[allDates.length - 1]).getTime()
  // Если все точки в одну дату — добавляем отступ по 12 часов с каждой стороны
  const dRange = maxTs - minTs || 86400000

  const toX = (d) => {
    const ts = new Date(d).getTime()
    const offset = maxTs === minTs ? iW / 2 : ((ts - minTs) / dRange) * iW
    return PAD.left + (maxTs === minTs ? iW / 2 : offset)
  }
  const toY = (v) => PAD.top + iH - ((v - minVal) / vRange) * iH

  // Ступенчатые линии (step-after): цена держится до следующей точки
  const makeStepPoints = (pts) => {
    if (!pts.length) return ''
    const out = []
    pts.forEach((p, i) => {
      const x = toX(p.date)
      const y = toY(p.value)
      out.push(`${x.toFixed(1)},${y.toFixed(1)}`)
      // Тянем горизонталь до следующей точки
      if (i < pts.length - 1) {
        const xNext = toX(pts[i + 1].date)
        out.push(`${xNext.toFixed(1)},${y.toFixed(1)}`)
      } else {
        // Последний отрезок тянем до правого края
        out.push(`${(PAD.left + iW).toFixed(1)},${y.toFixed(1)}`)
      }
    })
    return out.join(' ')
  }

  const types = ['price_purchase', 'price_opt', 'price_opt2', 'price_retail']
    .filter((t) => visibleTypes.value.includes(t))
  const lines = types
    .map((type) => {
      const pts = rows.filter((r) => r.type === type).sort((a, b) => a.date.localeCompare(b.date))
      if (!pts.length) return null
      return {
        type,
        color: PRICE_TYPES[type].color,
        label: PRICE_TYPES[type].label,
        points: makeStepPoints(pts),
        dots: pts.map((p) => ({ x: toX(p.date), y: toY(p.value), v: p.value, d: p.date })),
      }
    })
    .filter(Boolean)

  // 5 равномерных засечек по Y
  const yTicks = Array.from({ length: 5 }, (_, i) => {
    const val = minVal + (vRange / 4) * i
    return { y: toY(val).toFixed(1), label: Math.round(val).toLocaleString('ru-RU') }
  })

  // Не больше 6 засечек по X
  const xStep = Math.max(1, Math.ceil(allDates.length / 5))
  const xTicks = allDates
    .filter((_, i) => i === 0 || i === allDates.length - 1 || i % xStep === 0)
    .map((d) => ({ x: toX(d).toFixed(1), label: formatDate(d) }))

  return { W, H, PAD, iW, iH, lines, yTicks, xTicks }
})

const filteredSortedHistory = computed(() => {
  const f = historyFilters.value
  return [...filteredHistory.value]
    .filter((row) => {
      if (f.types.length && !f.types.includes(row.type)) return false
      if (f.dateFrom && row.date < f.dateFrom) return false
      if (f.dateTo && row.date > f.dateTo) return false
      if (f.valueMin !== '' && row.value < Number(f.valueMin)) return false
      if (f.valueMax !== '' && row.value > Number(f.valueMax)) return false
      return true
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.type.localeCompare(a.type))
})

const loadPage = async () => {
  loading.value = true
  error.value = ''
  priceStats.value = null
  priceHistory.value = []
  try {
    await Promise.all([loadCategories(), loadDetail()])
    initPriceForm()
    await Promise.all([loadPhotos(), loadMovement()])
  } catch {
    error.value = 'Не удалось загрузить номенклатуру.'
  } finally {
    loading.value = false
  }
}

const openPhoto = (index) => {
  activePhotoIndex.value = index
  photoViewerOpen.value = true
}

const closePhotoViewer = () => {
  photoViewerOpen.value = false
}

const prevPhoto = () => {
  if (!photos.value.length) return
  activePhotoIndex.value = (activePhotoIndex.value - 1 + photos.value.length) % photos.value.length
}

const nextPhoto = () => {
  if (!photos.value.length) return
  activePhotoIndex.value = (activePhotoIndex.value + 1) % photos.value.length
}

watch(() => route.params.nomenclatureId, () => {
  tab.value = 'info'
  loadPage()
})

watch(tab, (newTab) => {
  if (newTab === 'prices' && !pricesLoading.value && !priceStats.value && !priceHistory.value.length) {
    loadPrices()
  }
})

onMounted(loadPage)
onBeforeUnmount(revokePhotoUrls)
</script>

<template>
  <div class="page">
    <TopNav :links="navLinks" />

    <main class="main-content">
      <header class="page-head">
        <div class="page-head-main">
          <button type="button" class="back-btn" @click="goBack">
            <i class="fas fa-arrow-left"></i>
            Назад
          </button>
          <h1 class="page-title">{{ pageTitle }}</h1>
        </div>
        <div class="page-actions">
          <button type="button" class="print-btn" @click="openPriceTagModal">
            <i class="fas fa-print"></i>
            Ценник
          </button>
          <button type="button" class="edit-btn" @click="openEdit">
            <i class="fas fa-pen"></i>
            Редактировать
          </button>
        </div>
      </header>

      <div v-if="priceTagModalOpen" class="modal-backdrop" @click.self="priceTagModalOpen = false">
        <div class="price-tag-modal">
          <div class="modal-header">
            <h3>Печать ценников</h3>
            <button type="button" class="modal-close" @click="priceTagModalOpen = false">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div class="price-tag-options">
            <button type="button" class="price-tag-option" @click="printPriceTag('standard')">
              <span class="option-title">Стандартная</span>
              <span class="option-subtitle">Название и розничная цена</span>
            </button>
            <button type="button" class="price-tag-option" @click="printPriceTag('article')">
              <span class="option-title">С артикулом</span>
              <span class="option-subtitle">Название, артикул и розничная цена</span>
            </button>
            <button type="button" class="price-tag-option" @click="printPriceTag('barcode')">
              <span class="option-title">С артикулом и штрих-кодом</span>
              <span class="option-subtitle">Code 128 по значению артикула</span>
            </button>
          </div>
        </div>
      </div>

      <div v-if="loading" class="inline-state">Загрузка...</div>
      <div v-else>
        <div v-if="error" class="inline-state error">{{ error }}</div>

        <template v-else-if="detail">
          <div class="tabs">
            <button type="button" class="tab-btn" :class="{ active: tab === 'info' }" @click="tab = 'info'">Информация</button>
            <button type="button" class="tab-btn" :class="{ active: tab === 'movement' }" @click="tab = 'movement'">Движение товара</button>
            <button type="button" class="tab-btn" :class="{ active: tab === 'providers' }" @click="tab = 'providers'">Поставщики</button>
            <button type="button" class="tab-btn" :class="{ active: tab === 'prices' }" @click="tab = 'prices'">Цены</button>
          </div>

          <section v-if="tab === 'info'" class="form-card">
            <div class="form-grid one-col">
              <label class="field">
                <span>Фотография</span>
                <div v-if="photosLoading" class="inline-state">Загрузка фотографий...</div>
                <div v-else-if="photos.length" class="photos-grid">
                  <div v-for="(item, index) in photos" :key="item.id || index" class="photo-card">
                    <button type="button" class="photo-thumb" @click="openPhoto(index)">
                      <img v-if="item.previewUrl" :src="item.previewUrl" :alt="item.original_name || `Фото ${index + 1}`">
                      <span v-else class="photo-fallback">Фото</span>
                    </button>
                    <div class="photo-caption">{{ item.original_name || `Фото ${index + 1}` }}</div>
                  </div>
                </div>
                <div v-else class="inline-state">Фотографии не загружены.</div>
              </label>
            </div>

            <div class="form-grid two-col">
              <label class="field">
                <span>Название</span>
                <input :value="detail.name || ''" type="text" class="field-input" readonly>
              </label>

              <label class="field">
                <span>Товарная категория</span>
                <input :value="categoryLabel" type="text" class="field-input" readonly>
              </label>

              <label class="field">
                <span>Единицы измерения</span>
                <input :value="detail.unit?.name || detail.unit_name || ''" type="text" class="field-input" readonly>
              </label>

              <label class="field">
                <span>Артикул</span>
                <input :value="detail.article || ''" type="text" class="field-input" readonly>
              </label>

              <label class="field">
                <span>Вес</span>
                <input :value="detail.weight ?? ''" type="text" class="field-input" readonly>
              </label>
            </div>

            <div class="form-grid one-col">
              <label class="field">
                <span>Описание</span>
                <textarea :value="detail.description || ''" class="field-input textarea" rows="3" readonly></textarea>
              </label>
            </div>

            <div class="form-grid dims-grid">
              <label class="field">
                <span>Длина</span>
                <input :value="detail.length ?? ''" type="text" class="field-input" readonly>
              </label>
              <div class="dims-sep">x</div>
              <label class="field">
                <span>Ширина</span>
                <input :value="detail.width ?? ''" type="text" class="field-input" readonly>
              </label>
              <div class="dims-sep">x</div>
              <label class="field">
                <span>Высота</span>
                <input :value="detail.height ?? ''" type="text" class="field-input" readonly>
              </label>
            </div>
          </section>

          <section v-else-if="tab === 'movement'" class="movement-section">
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

          <section v-else-if="tab === 'providers'" class="providers-list">
            <article v-for="provider in providers" :key="provider.id" class="provider-card">
              <div class="provider-avatar">{{ providerInitial(provider.name) }}</div>
              <div class="provider-info">
                <div class="provider-name">{{ provider.name }}</div>
                <div v-if="provider.inn" class="provider-inn">ИНН {{ provider.inn }}</div>
              </div>
            </article>

            <div v-if="!providers.length" class="inline-state">Поставщики пока не определены.</div>
          </section>

          <section v-else-if="tab === 'prices'" class="prices-section">
            <div v-if="pricesLoading" class="inline-state">Загрузка цен...</div>
            <template v-else>

              <!-- Цены продажи -->
              <div class="price-card">
                <div class="price-card-header">
                  <span class="price-card-title">Цены продажи</span>
                  <div class="price-save-row">
                    <span v-if="priceSaveSuccess" class="price-save-ok"><i class="fas fa-check"></i> Сохранено</span>
                    <span v-if="priceSaveError" class="price-save-err">{{ priceSaveError }}</span>
                    <button type="button" class="btn-save" :disabled="priceSaving" @click="savePrices">
                      <i class="fas fa-save"></i>
                      {{ priceSaving ? 'Сохраняю...' : 'Сохранить' }}
                    </button>
                  </div>
                </div>
                <div class="price-fields">
                  <!-- Оптовая: % от последней закупочной -->
                  <div class="price-field">
                    <div class="price-field-header">
                      <span class="price-field-label">Оптовая</span>
                      <span class="price-field-hint">% от закупочной</span>
                    </div>
                    <div class="price-dual">
                      <div class="price-input-wrap">
                        <input v-model="priceForm.price_opt" type="number" min="0" step="0.01" class="price-input" placeholder="0.00" @input="onOptValueInput">
                        <span class="price-input-sfx">₽</span>
                      </div>
                      <div class="price-input-wrap price-pct-wrap">
                        <input v-model="pricePcts.price_opt" type="number" step="0.01" class="price-input" placeholder="0.00" @input="onOptPctInput">
                        <span class="price-input-sfx">%</span>
                      </div>
                    </div>
                  </div>

                  <!-- Оптовая 2: % от Оптовой -->
                  <div class="price-field">
                    <div class="price-field-header">
                      <span class="price-field-label">Оптовая 2</span>
                      <span class="price-field-hint">% от оптовой</span>
                    </div>
                    <div class="price-dual">
                      <div class="price-input-wrap">
                        <input v-model="priceForm.price_opt2" type="number" min="0" step="0.01" class="price-input" placeholder="0.00" @input="onOpt2ValueInput">
                        <span class="price-input-sfx">₽</span>
                      </div>
                      <div class="price-input-wrap price-pct-wrap">
                        <input v-model="pricePcts.price_opt2" type="number" step="0.01" class="price-input" placeholder="0.00" @input="onOpt2PctInput">
                        <span class="price-input-sfx">%</span>
                      </div>
                    </div>
                  </div>

                  <!-- Розница: % от Оптовой 2 -->
                  <div class="price-field">
                    <div class="price-field-header">
                      <span class="price-field-label">Розница</span>
                      <span class="price-field-hint">% от оптовой 2</span>
                    </div>
                    <div class="price-dual">
                      <div class="price-input-wrap">
                        <input v-model="priceForm.price_retail" type="number" min="0" step="0.01" class="price-input" placeholder="0.00" @input="onRetailValueInput">
                        <span class="price-input-sfx">₽</span>
                      </div>
                      <div class="price-input-wrap price-pct-wrap">
                        <input v-model="pricePcts.price_retail" type="number" step="0.01" class="price-input" placeholder="0.00" @input="onRetailPctInput">
                        <span class="price-input-sfx">%</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Статистика закупки -->
              <div v-if="priceStats" class="price-card">
                <div class="price-card-header">
                  <span class="price-card-title">Цена закупа</span>
                  <span class="price-last-date">{{ priceStats.rows_count }} записей · последняя {{ formatDate(priceStats.last_purchase_date) }}</span>
                </div>

                <div class="pstats-table-wrap">
                  <table class="pstats-table">
                    <thead>
                      <tr>
                        <th class="pst-col-label">Показатель</th>
                        <th class="pst-col-price">Цена закупа</th>
                        <th v-if="priceForm.price_opt" class="pst-col-pct">vs Оптовая</th>
                        <th v-if="priceForm.price_opt2" class="pst-col-pct">vs Оптовая 2</th>
                        <th v-if="priceForm.price_retail" class="pst-col-pct">vs Розница</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="[statKey, statLabel] in [
                          ['last_purchase_price','Последняя'],
                          ['max_purchase_price','Максимальная'],
                          ['avg_purchase_price','Средняя'],
                          ['min_purchase_price','Минимальная'],
                        ]"
                        :key="statKey"
                        :class="{ 'pst-row-highlight': statKey === 'last_purchase_price' }"
                      >
                        <td class="pst-label-cell">{{ statLabel }}</td>
                        <td class="pst-price-cell">{{ formatPrice(priceStats[statKey]) }}</td>
                        <td v-if="priceForm.price_opt" class="pst-pct-cell">
                          <span
                            class="pst-badge"
                            :class="diffPct(priceStats[statKey], priceForm.price_opt) >= 0 ? 'pst-pos' : 'pst-neg'"
                          >
                            {{ diffPct(priceStats[statKey], priceForm.price_opt) !== null
                              ? (diffPct(priceStats[statKey], priceForm.price_opt) >= 0 ? '+' : '')
                                + diffPct(priceStats[statKey], priceForm.price_opt).toFixed(1) + '%'
                              : '—' }}
                          </span>
                        </td>
                        <td v-if="priceForm.price_opt2" class="pst-pct-cell">
                          <span
                            class="pst-badge"
                            :class="diffPct(priceStats[statKey], priceForm.price_opt2) >= 0 ? 'pst-pos' : 'pst-neg'"
                          >
                            {{ diffPct(priceStats[statKey], priceForm.price_opt2) !== null
                              ? (diffPct(priceStats[statKey], priceForm.price_opt2) >= 0 ? '+' : '')
                                + diffPct(priceStats[statKey], priceForm.price_opt2).toFixed(1) + '%'
                              : '—' }}
                          </span>
                        </td>
                        <td v-if="priceForm.price_retail" class="pst-pct-cell">
                          <span
                            class="pst-badge"
                            :class="diffPct(priceStats[statKey], priceForm.price_retail) >= 0 ? 'pst-pos' : 'pst-neg'"
                          >
                            {{ diffPct(priceStats[statKey], priceForm.price_retail) !== null
                              ? (diffPct(priceStats[statKey], priceForm.price_retail) >= 0 ? '+' : '')
                                + diffPct(priceStats[statKey], priceForm.price_retail).toFixed(1) + '%'
                              : '—' }}
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- График истории -->
              <div class="price-card">
                <div class="price-card-header">
                  <span class="price-card-title">История цен</span>
                  <div class="period-tabs">
                    <button type="button" class="period-btn" :class="{ active: pricePeriod === 'all' }" @click="pricePeriod = 'all'">Всё время</button>
                    <button type="button" class="period-btn" :class="{ active: pricePeriod === 'year' }" @click="pricePeriod = 'year'">Год</button>
                    <button type="button" class="period-btn" :class="{ active: pricePeriod === 'month' }" @click="pricePeriod = 'month'">Месяц</button>
                  </div>
                </div>

                <!-- Переключатели типов -->
                <div class="chart-type-toggles">
                  <button
                    v-for="(cfg, type) in PRICE_TYPES"
                    :key="type"
                    type="button"
                    class="chart-type-btn"
                    :class="{ active: visibleTypes.includes(type) }"
                    :style="{ '--type-color': cfg.color }"
                    @click="toggleChartType(type)"
                  >
                    <span class="chart-type-dot"></span>
                    {{ cfg.label }}
                  </button>
                </div>

                <div v-if="!filteredHistory.length" class="inline-state" style="padding:16px 0">Нет данных за выбранный период.</div>
                <template v-else-if="chartSvg">
                  <!-- SVG Chart + tooltip -->
                  <div class="chart-wrap" @mouseleave="onChartLeave">
                    <div
                      v-if="chartTooltip.show"
                      class="chart-tooltip"
                      :style="{ left: chartTooltip.x + 'px', top: chartTooltip.y + 'px' }"
                    >
                      <div class="ct-label" :style="{ color: chartTooltip.color }">{{ chartTooltip.label }}</div>
                      <div class="ct-value">{{ formatPrice(chartTooltip.value) }}</div>
                      <div class="ct-date">{{ formatDate(chartTooltip.date) }}</div>
                    </div>
                    <svg :viewBox="`0 0 ${chartSvg.W} ${chartSvg.H}`" class="chart-svg">
                      <!-- Grid & Y ticks -->
                      <g v-for="tick in chartSvg.yTicks" :key="tick.y">
                        <line
                          :x1="chartSvg.PAD.left" :y1="tick.y"
                          :x2="chartSvg.W - chartSvg.PAD.right" :y2="tick.y"
                          stroke="#e2e8f0" stroke-width="1"
                        />
                        <text :x="chartSvg.PAD.left - 6" :y="tick.y" text-anchor="end" dominant-baseline="middle" font-size="11" fill="#94a3b8">
                          {{ tick.label }}
                        </text>
                      </g>

                      <!-- X ticks -->
                      <g v-for="tick in chartSvg.xTicks" :key="tick.x">
                        <line
                          :x1="tick.x" :y1="chartSvg.PAD.top"
                          :x2="tick.x" :y2="chartSvg.PAD.top + chartSvg.iH"
                          stroke="#f1f5f9" stroke-width="1"
                        />
                        <text :x="tick.x" :y="chartSvg.PAD.top + chartSvg.iH + 14" text-anchor="middle" font-size="11" fill="#94a3b8">
                          {{ tick.label }}
                        </text>
                      </g>

                      <!-- Axes -->
                      <line
                        :x1="chartSvg.PAD.left" :y1="chartSvg.PAD.top"
                        :x2="chartSvg.PAD.left" :y2="chartSvg.PAD.top + chartSvg.iH"
                        stroke="#cbd5e1" stroke-width="1"
                      />
                      <line
                        :x1="chartSvg.PAD.left" :y1="chartSvg.PAD.top + chartSvg.iH"
                        :x2="chartSvg.W - chartSvg.PAD.right" :y2="chartSvg.PAD.top + chartSvg.iH"
                        stroke="#cbd5e1" stroke-width="1"
                      />

                      <!-- Lines -->
                      <g v-for="line in chartSvg.lines" :key="line.type">
                        <polyline
                          :points="line.points"
                          :stroke="line.color"
                          stroke-width="2.5"
                          fill="none"
                          stroke-linejoin="miter"
                          stroke-linecap="square"
                        />
                        <circle
                          v-for="(dot, di) in line.dots"
                          :key="di"
                          :cx="dot.x" :cy="dot.y" r="4.5"
                          :fill="line.color"
                          stroke="#fff" stroke-width="2"
                          style="cursor:pointer"
                          @mouseenter="onDotEnter($event, dot, line)"
                        />
                      </g>
                    </svg>
                  </div>
                </template>
              </div>

              <!-- Таблица истории -->
              <div v-if="filteredHistory.length" class="price-card">
                <div class="price-card-header">
                  <span class="price-card-title">Журнал изменений</span>
                  <button
                    v-if="historyFilters.types.length || historyFilters.dateFrom || historyFilters.dateTo || historyFilters.valueMin || historyFilters.valueMax"
                    type="button"
                    class="ph-clear-btn"
                    @click="historyFilters = { types: [], dateFrom: '', dateTo: '', valueMin: '', valueMax: '' }"
                  >Сбросить фильтры</button>
                </div>

                <!-- Фильтры -->
                <div class="ph-filters">
                  <div class="ph-filter-row">
                    <span class="ph-filter-label">Тип:</span>
                    <div class="ph-type-btns">
                      <button
                        v-for="(cfg, type) in PRICE_TYPES"
                        :key="type"
                        type="button"
                        class="ph-type-btn"
                        :class="{ active: historyFilters.types.includes(type) }"
                        :style="{ '--type-color': cfg.color }"
                        @click="toggleHistoryType(type)"
                      >{{ cfg.label }}</button>
                    </div>
                  </div>
                  <div class="ph-filter-row">
                    <span class="ph-filter-label">Дата:</span>
                    <input v-model="historyFilters.dateFrom" type="date" class="ph-filter-date">
                    <span class="ph-filter-sep">—</span>
                    <input v-model="historyFilters.dateTo" type="date" class="ph-filter-date">
                  </div>
                  <div class="ph-filter-row">
                    <span class="ph-filter-label">Цена:</span>
                    <div class="price-input-wrap ph-val-input">
                      <input v-model="historyFilters.valueMin" type="number" min="0" step="0.01" class="price-input" placeholder="от">
                      <span class="price-input-sfx">₽</span>
                    </div>
                    <span class="ph-filter-sep">—</span>
                    <div class="price-input-wrap ph-val-input">
                      <input v-model="historyFilters.valueMax" type="number" min="0" step="0.01" class="price-input" placeholder="до">
                      <span class="price-input-sfx">₽</span>
                    </div>
                  </div>
                </div>

                <div v-if="!filteredSortedHistory.length" class="inline-state" style="padding: 8px 0">Нет записей по заданным фильтрам.</div>
                <div v-else class="ph-table-wrap">
                  <table class="ph-table">
                    <thead>
                      <tr>
                        <th>Дата</th>
                        <th>Тип цены</th>
                        <th class="ph-col-val">Значение</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="row in filteredSortedHistory" :key="row.id">
                        <td class="ph-date">{{ formatDate(row.date) }}</td>
                        <td>
                          <span class="ph-type-badge" :style="{ background: PRICE_TYPES[row.type]?.color + '1a', color: PRICE_TYPES[row.type]?.color }">
                            {{ PRICE_TYPES[row.type]?.label || row.type }}
                          </span>
                        </td>
                        <td class="ph-col-val ph-val">{{ formatPrice(row.value) }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

            </template>
          </section>

        </template>
      </div>
    </main>

    <div v-if="photoViewerOpen && currentPhoto" class="viewer-backdrop" @click.self="closePhotoViewer">
      <div class="viewer-shell">
        <button type="button" class="viewer-close" @click="closePhotoViewer">
          <i class="fas fa-times"></i>
        </button>
        <button v-if="photos.length > 1" type="button" class="viewer-nav viewer-prev" @click="prevPhoto">
          <i class="fas fa-chevron-left"></i>
        </button>
        <div class="viewer-stage">
          <img v-if="currentPhoto.previewUrl" :src="currentPhoto.previewUrl" :alt="currentPhoto.original_name || 'Фото'">
        </div>
        <button v-if="photos.length > 1" type="button" class="viewer-nav viewer-next" @click="nextPhoto">
          <i class="fas fa-chevron-right"></i>
        </button>
        <div class="viewer-caption">
          {{ currentPhoto.original_name || 'Фото' }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  min-height: 100vh;
  background: var(--bg-page);
}

.main-content {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.page-head-main {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.page-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
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

.edit-btn {
  border: 1px solid var(--brand-primary);
  border-radius: 10px;
  background: linear-gradient(180deg, #ffffff 0%, var(--brand-light) 100%);
  color: var(--brand-primary);
  padding: 9px 14px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-weight: 600;
  box-shadow: 0 8px 18px rgba(37, 99, 235, 0.12);
}

.edit-btn:hover {
  background: var(--brand-light);
}

.print-btn {
  border: 1px solid #43a047;
  border-radius: 10px;
  background: linear-gradient(180deg, #ffffff 0%, #eef8ef 100%);
  color: #2f7d32;
  padding: 9px 14px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-weight: 600;
  box-shadow: 0 8px 18px rgba(67, 160, 71, 0.12);
}

.print-btn:hover {
  background: #eef8ef;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: color-mix(in srgb, #0f172a 38%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.price-tag-modal {
  width: min(480px, calc(100vw - 32px));
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: var(--bg-surface);
  box-shadow: var(--shadow-md);
  padding: 16px;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.modal-header h3 {
  margin: 0;
  font-size: 16px;
  color: var(--text-primary);
}

.modal-close {
  width: 32px;
  height: 32px;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  cursor: pointer;
}

.price-tag-options {
  display: grid;
  gap: 10px;
}

.price-tag-option {
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background: #fff;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: left;
  cursor: pointer;
}

.price-tag-option:hover {
  border-color: #43a047;
  background: #f3fbf4;
}

.option-title {
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 700;
}

.option-subtitle {
  color: var(--text-secondary);
  font-size: 12px;
}

.inline-state {
  color: var(--text-secondary);
  font-size: 13px;
}

.inline-state.error {
  color: var(--danger-text);
}

.tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
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

.textarea {
  min-height: 92px;
  resize: none;
  padding: 8px 10px;
}

.photos-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 10px;
}

.photo-card {
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: var(--bg-surface);
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.photo-thumb {
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background: var(--bg-subtle);
  min-height: 140px;
  overflow: hidden;
  cursor: pointer;
}

.photo-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.photo-fallback,
.photo-caption {
  color: var(--text-secondary);
  font-size: 12px;
}

.form-card,
.movement-section,
.providers-list,
.prices-section {
  margin-top: 8px;
}

.providers-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* ── Movement table ────────────────────────────── */
.movement-table-wrap {
  border: 1px solid var(--border-light);
  border-radius: 12px;
  overflow: hidden;
  background: var(--bg-surface);
}

.movement-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.movement-table thead tr {
  background: var(--bg-subtle);
}

.movement-table th {
  padding: 9px 12px;
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid var(--border-light);
  white-space: nowrap;
}

.movement-table td {
  padding: 10px 12px;
  vertical-align: top;
  border-bottom: 1px solid var(--border-light);
  color: var(--text-primary);
}

.movement-table tbody tr:last-child td {
  border-bottom: none;
}

.movement-table tbody tr:hover td {
  background: var(--bg-subtle);
}

.mt-col-date { width: 96px; }
.mt-col-doc  { width: 150px; }
.mt-col-qty  { width: 110px; }
.mt-col-type { width: 140px; }
.mt-col-name { min-width: 0; }

.mt-date {
  color: var(--text-secondary);
  font-size: 12px;
}

.mt-name-primary {
  color: var(--text-primary);
}

.mt-name-secondary {
  margin-top: 2px;
  color: var(--text-secondary);
  font-size: 12px;
}

.movement-docs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.mt-qty {
  font-weight: 600;
  color: var(--text-primary);
  text-align: right;
  white-space: nowrap;
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

/* ── Provider card ─────────────────────────────── */
.provider-card {
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: var(--bg-surface);
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 14px;
}

.provider-avatar {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--brand-light);
  color: var(--brand-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 700;
}

.provider-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.provider-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.provider-inn {
  font-size: 12px;
  color: var(--text-secondary);
}

/* ── Prices tab ────────────────────────────────── */
.prices-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.price-card {
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: var(--bg-surface);
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.price-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.price-card-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}

.price-last-date {
  font-size: 12px;
  color: var(--text-secondary);
}

/* Dual price input */
.price-field-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.price-field-hint {
  font-size: 11px;
  color: var(--text-tertiary, #94a3b8);
}

.price-dual {
  display: grid;
  grid-template-columns: 1fr 90px;
  gap: 6px;
}

.price-pct-wrap .price-input {
  background: #f8fafc;
  border-style: dashed;
}

/* Chart type toggles */
.chart-type-toggles {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 4px;
}

.chart-type-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 999px;
  border: 1.5px solid var(--border-light);
  background: var(--bg-subtle);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, color 0.15s;
}

.chart-type-btn.active {
  border-color: var(--type-color);
  background: color-mix(in srgb, var(--type-color) 10%, #fff);
  color: var(--type-color);
  font-weight: 600;
}

.chart-type-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--border-light);
  flex-shrink: 0;
}

.chart-type-btn.active .chart-type-dot {
  background: var(--type-color);
}

/* Chart tooltip */
.chart-wrap {
  position: relative;
}

.chart-tooltip {
  position: absolute;
  transform: translate(-50%, calc(-100% - 10px));
  background: #1e293b;
  color: #fff;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 12px;
  pointer-events: none;
  white-space: nowrap;
  z-index: 10;
  box-shadow: 0 4px 12px rgba(0,0,0,0.2);
}

.chart-tooltip::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 5px solid transparent;
  border-top-color: #1e293b;
}

.ct-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 3px;
}

.ct-value {
  font-size: 14px;
  font-weight: 700;
}

.ct-date {
  font-size: 11px;
  color: #94a3b8;
  margin-top: 2px;
}

/* History filters */
.ph-filters {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border-light);
  margin-bottom: 4px;
}

.ph-filter-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.ph-filter-label {
  font-size: 12px;
  color: var(--text-secondary);
  min-width: 36px;
  flex-shrink: 0;
}

.ph-type-btns {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}

.ph-type-btn {
  padding: 3px 10px;
  border-radius: 999px;
  border: 1.5px solid var(--border-light);
  background: var(--bg-subtle);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
}

.ph-type-btn.active {
  border-color: var(--type-color);
  background: color-mix(in srgb, var(--type-color) 10%, #fff);
  color: var(--type-color);
  font-weight: 600;
}

.ph-filter-date {
  height: 32px;
  border: 1px solid var(--border-light);
  border-radius: 6px;
  background: var(--bg-subtle);
  color: var(--text-primary);
  padding: 0 8px;
  font-size: 12px;
}

.ph-filter-sep {
  color: var(--text-secondary);
  font-size: 12px;
}

.ph-val-input {
  width: 110px;
}

.ph-val-input .price-input {
  font-size: 12px;
  min-height: 32px;
}

.ph-clear-btn {
  border: none;
  background: none;
  color: var(--brand-primary);
  font-size: 12px;
  cursor: pointer;
  padding: 0;
}

/* Price form */
.price-save-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.price-save-ok {
  color: #16a34a;
  font-size: 12px;
}

.price-save-err {
  color: var(--danger-text, #dc2626);
  font-size: 12px;
}

.btn-save {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--brand-primary);
  border-radius: 8px;
  background: var(--brand-primary);
  color: #fff;
  padding: 7px 14px;
  font-size: 13px;
  cursor: pointer;
}

.btn-save:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.price-fields {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.price-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.price-field-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.price-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.price-input {
  width: 100%;
  min-height: 38px;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--bg-subtle);
  color: var(--text-primary);
  padding: 0 32px 0 10px;
  font-size: 14px;
}

.price-input:focus {
  outline: none;
  border-color: var(--brand-primary);
}

.price-input-sfx {
  position: absolute;
  right: 10px;
  color: var(--text-secondary);
  font-size: 13px;
  pointer-events: none;
}

/* Purchase stats table */
.pstats-table-wrap {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  overflow-x: auto;
}

.pstats-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.pstats-table thead tr {
  background: var(--bg-subtle);
}

.pstats-table th {
  padding: 9px 14px;
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid var(--border-light);
  white-space: nowrap;
}

.pstats-table td {
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-light);
  vertical-align: middle;
}

.pstats-table tbody tr:last-child td {
  border-bottom: none;
}

.pst-row-highlight td {
  background: #f8fafc;
  font-weight: 600;
}

.pst-col-label { min-width: 130px; }
.pst-col-price { text-align: right; white-space: nowrap; }
.pst-col-pct   { text-align: center; white-space: nowrap; }

.pst-label-cell {
  color: var(--text-secondary);
  font-size: 12px;
}

.pst-row-highlight .pst-label-cell {
  color: var(--text-primary);
}

.pst-price-cell {
  text-align: right;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
}

.pst-pct-cell {
  text-align: center;
}

.pst-badge {
  display: inline-block;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}

.pst-pos {
  background: #f0fdf4;
  color: #16a34a;
  border: 1px solid #86efac;
}

.pst-neg {
  background: #fef2f2;
  color: #dc2626;
  border: 1px solid #fca5a5;
}

/* Chart */
.period-tabs {
  display: flex;
  gap: 4px;
}

.period-btn {
  border: 1px solid var(--border-light);
  border-radius: 6px;
  background: var(--bg-subtle);
  color: var(--text-secondary);
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}

.period-btn.active {
  border-color: var(--brand-primary);
  background: var(--brand-light);
  color: var(--brand-primary);
}

.chart-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.chart-wrap {
  width: 100%;
  overflow-x: auto;
}

.chart-svg {
  display: block;
  width: 100%;
  height: auto;
  min-width: 400px;
}

/* History table */
.ph-table-wrap {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  overflow: hidden;
}

.ph-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.ph-table thead tr {
  background: var(--bg-subtle);
}

.ph-table th {
  padding: 8px 12px;
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid var(--border-light);
}

.ph-table td {
  padding: 9px 12px;
  border-bottom: 1px solid var(--border-light);
  vertical-align: middle;
}

.ph-table tbody tr:last-child td {
  border-bottom: none;
}

.ph-table tbody tr:hover td {
  background: var(--bg-subtle);
}

.ph-date {
  color: var(--text-secondary);
  font-size: 12px;
  white-space: nowrap;
}

.ph-col-val {
  text-align: right;
}

.ph-val {
  font-weight: 600;
  color: var(--text-primary);
}

.ph-type-badge {
  display: inline-block;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 500;
}

.viewer-backdrop {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: rgba(15, 23, 42, 0.82);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.viewer-shell {
  position: relative;
  width: min(1100px, 100%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.viewer-stage {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.viewer-stage img {
  max-width: 100%;
  max-height: calc(100vh - 80px);
  object-fit: contain;
}

.viewer-close,
.viewer-nav {
  position: absolute;
  width: 44px;
  height: 44px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  background: rgba(15, 23, 42, 0.74);
  color: #fff;
  cursor: pointer;
}

.viewer-close {
  top: -10px;
  right: -10px;
}

.viewer-prev {
  left: 16px;
}

.viewer-next {
  right: 16px;
}

.viewer-caption {
  position: absolute;
  bottom: -34px;
  left: 50%;
  transform: translateX(-50%);
  color: #fff;
  font-size: 13px;
}

@media (max-width: 900px) {
  .form-grid.two-col,
  .dims-grid {
    grid-template-columns: 1fr;
  }

  .dims-sep {
    display: none;
  }

  .movement-table th,
  .movement-table td {
    padding: 8px 10px;
  }

  .mt-col-date,
  .mt-col-doc {
    width: auto;
  }

  .price-fields {
    grid-template-columns: 1fr;
  }

  .price-dual {
    grid-template-columns: 1fr 80px;
  }

  .viewer-prev {
    left: 8px;
  }

  .viewer-next {
    right: 8px;
  }
}
</style>
