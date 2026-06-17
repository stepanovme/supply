<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import TopNav from '../components/layout/TopNav.vue'
import { mainNavLinks } from '../constants/mainNav'

const navLinks = mainNavLinks
const router = useRouter()

const loading = ref(false)
const error = ref('')
const rows = ref([])
const checkedAll = ref(false)

const normalizeArray = (payload) => {
  if (Array.isArray(payload)) return payload
  return payload?.items || payload?.data || payload?.results || []
}

const formatDate = (value) => {
  if (!value) return '—'
  const source = String(value)
  const dateOnly = source.length >= 10 ? source.slice(0, 10) : source
  const parts = dateOnly.split('-')
  if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`
  return source
}

const formatDateTimeRange = (fromValue, toValue) => {
  const from = formatDate(fromValue)
  const to = formatDate(toValue)
  if (from === '—' && to === '—') return '—'
  if (from === to) return from
  return `${from} — ${to}`
}

const mapRow = (item, index) => {
  const requestNum = item?.request_num || item?.request?.num || item?.request_id || '—'
  const composition = item?.composition_name || item?.request_item_name || item?.request_item || item?.request_name || '—'
  const invoiceNum = item?.invoice_num || item?.invoice?.num || item?.invoice_id || '—'
  const dateParts = [
    `Создано: ${formatDate(item?.created_at)}`,
    `Забрать: ${formatDate(item?.pick_up_date_planned || item?.pick_up_date)}`,
    `Доставить: ${formatDateTimeRange(item?.planned_delivery_from, item?.planned_delivery_to)}`,
    `Факт: ${formatDate(item?.completed_at || item?.fact_date)}`,
  ]
  return {
    id: String(item?.id || index + 1),
    checked: false,
    project: String(item?.project_name || item?.object_name || '—'),
    requestComposition: `#${requestNum} / ${composition}`,
    invoice: String(invoiceNum),
    provider: String(item?.carrier_name || item?.provider_name || item?.supplier_name || '—'),
    driver: String(item?.driver_name || item?.driver?.name || item?.courier_name || item?.delivery_person || '—'),
    dates: dateParts.join(' · '),
  }
}

const loadDeliveries = async () => {
  loading.value = true
  error.value = ''
  try {
    const endpoints = ['/apisup/supply/deliveries', '/apisup/supply/delivery', '/apisup/supply/invoice-deliveries']
    for (const endpoint of endpoints) {
      // eslint-disable-next-line no-await-in-loop
      const res = await fetch(endpoint, { credentials: 'include' })
      if (!res.ok) continue
      // eslint-disable-next-line no-await-in-loop
      const payload = await res.json()
      const list = normalizeArray(payload)
      rows.value = list.map(mapRow)
      checkedAll.value = false
      return
    }
    throw new Error('deliveries endpoint not found')
  } catch {
    rows.value = []
    error.value = 'Не удалось загрузить реестр доставок.'
  } finally {
    loading.value = false
  }
}

const toggleAll = () => {
  const checked = Boolean(checkedAll.value)
  rows.value.forEach((row) => {
    row.checked = checked
  })
}

const syncCheckedAll = () => {
  checkedAll.value = rows.value.length > 0 && rows.value.every((row) => row.checked)
}

const selectedCount = computed(() => rows.value.filter((row) => row.checked).length)

const openCreateDelivery = () => {
  router.push('/deliveries/new')
}

const openDelivery = (deliveryId) => {
  const id = String(deliveryId || '')
  if (!id) return
  router.push(`/deliveries/${encodeURIComponent(id)}`)
}

onMounted(() => {
  loadDeliveries()
})
</script>

<template>
  <div class="page">
    <TopNav :links="navLinks" />
    <main class="main-content">
      <header class="page-head">
        <div>
          <h1 class="page-title">Реестр доставок</h1>
          <div class="page-subtitle">Всего: {{ rows.length }} · Выбрано: {{ selectedCount }}</div>
        </div>
        <button type="button" class="create-btn" @click="openCreateDelivery">
          <i class="fas fa-plus"></i>
          Создать доставку
        </button>
      </header>

      <div v-if="loading" class="inline-state">Загрузка доставок...</div>
      <div v-else-if="error" class="inline-state error">{{ error }}</div>

      <div class="table-wrap">
        <table class="data-table">
          <colgroup>
            <col class="col-check">
            <col class="col-id">
            <col class="col-project">
            <col class="col-request">
            <col class="col-invoice">
            <col class="col-provider">
            <col class="col-driver">
            <col>
          </colgroup>
          <thead>
            <tr>
              <th><input v-model="checkedAll" type="checkbox" aria-label="Выбрать все" @change="toggleAll"></th>
              <th>ID</th>
              <th>Проект</th>
              <th>Заявка/Состав</th>
              <th>Счёт</th>
              <th>Поставщик</th>
              <th>Водитель</th>
              <th>Даты</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id" class="clickable-row" @click="openDelivery(row.id)">
              <td class="check-cell" @click.stop><input v-model="row.checked" type="checkbox" aria-label="Выбрать строку" @change="syncCheckedAll"></td>
              <td class="mono">{{ row.id }}</td>
              <td>{{ row.project }}</td>
              <td>{{ row.requestComposition }}</td>
              <td>{{ row.invoice }}</td>
              <td>{{ row.provider }}</td>
              <td>{{ row.driver }}</td>
              <td>{{ row.dates }}</td>
            </tr>
            <tr v-if="!loading && !rows.length">
              <td colspan="8" class="empty">Нет данных</td>
            </tr>
          </tbody>
        </table>
      </div>
    </main>
  </div>
</template>

<style scoped>
.page { width: 100%; height: 100%; display: flex; flex-direction: column; }
.main-content { flex: 1; min-height: 0; padding: 20px 24px; display: flex; flex-direction: column; gap: 12px; }
.page-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.page-title { margin: 0; font-size: 22px; color: var(--text-primary); }
.page-subtitle { color: var(--text-secondary); font-size: 12px; }
.inline-state { font-size: 12px; color: var(--text-secondary); }
.inline-state.error { color: var(--danger-text); }
.create-btn {
  border: 1px solid var(--brand-primary);
  border-radius: 10px;
  background: linear-gradient(180deg, var(--brand-primary), #1d4ed8);
  color: #fff;
  padding: 9px 12px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  box-shadow: 0 10px 20px rgba(37, 99, 235, 0.16);
}
.table-wrap { background: var(--bg-surface); border: 1px solid var(--border-light); border-radius: var(--radius-lg); overflow: auto; }
.data-table { width: 100%; border-collapse: collapse; min-width: 1160px; }
.data-table th, .data-table td { border-bottom: 1px solid var(--border-light); padding: 10px 12px; text-align: left; font-size: 13px; }
.data-table th { background: var(--bg-subtle); font-size: 12px; color: var(--text-secondary); text-transform: uppercase; }
.check-cell { text-align: center; }
.mono { font-family: "JetBrains Mono", monospace; color: var(--text-secondary); }
.empty { text-align: center; color: var(--text-secondary); }
.clickable-row { cursor: pointer; }
.clickable-row:hover td { background: rgba(37, 99, 235, 0.04); }
.col-check { width: 42px; }
.col-id { width: 110px; }
.col-project { width: 170px; }
.col-request { width: 240px; }
.col-invoice { width: 130px; }
.col-provider { width: 220px; }
.col-driver { width: 180px; }

@media (max-width: 760px) {
  .page-head {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
