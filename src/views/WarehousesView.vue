<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import TopNav from '../components/layout/TopNav.vue'
import { mainNavLinks } from '../constants/mainNav'

const navLinks = mainNavLinks

const loading = ref(false)
const error = ref('')
const rows = ref([])
const searchQuery = ref('')
const typeFilter = ref('all')
const router = useRouter()

const normalizeArray = (payload) => {
  if (Array.isArray(payload)) return payload
  return payload?.items || payload?.data || payload?.results || []
}

const normalizeType = (value) => {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return 'Склад'
  if (raw.includes('приоб') || raw.includes('on-site')) return 'Приобъектный склад'
  if (raw.includes('объект') || raw.includes('warehouse') || raw.includes('склад')) return 'Склад'
  return value
}

const pickName = (item) => (
  item?.name
  || item?.short_name
  || item?.full_name
  || item?.title
  || '—'
)

const pickType = (item) => (
  item?.type_name
  || item?.type
  || item?.warehouse_type
  || item?.warehouse_kind
  || item?.kind
  || item?.category
  || ''
)

const loadWarehouses = async () => {
  loading.value = true
  error.value = ''
  const endpoints = [
    '/apisup/supply/warehouses',
    '/apiref/ref/warehouses',
    '/apisup/supply/storages',
  ]

  try {
    let payload = null
    for (const endpoint of endpoints) {
      // eslint-disable-next-line no-await-in-loop
      const res = await fetch(endpoint, { credentials: 'include' })
      if (!res.ok) continue
      // eslint-disable-next-line no-await-in-loop
      payload = await res.json()
      break
    }

    if (!payload) throw new Error('warehouses load failed')

    rows.value = normalizeArray(payload).map((item, idx) => ({
      id: String(item?.id || idx + 1),
      name: pickName(item),
      type: normalizeType(pickType(item)),
      objectLevelsId: String(item?.object_levels_id || ''),
    }))
  } catch {
    rows.value = []
    error.value = 'Не удалось загрузить список складов.'
  } finally {
    loading.value = false
  }
}

const filteredRows = computed(() => {
  const q = String(searchQuery.value || '').trim().toLowerCase()
  return rows.value.filter((row) => {
    const typeOk = typeFilter.value === 'all' || row.type === typeFilter.value
    const nameOk = !q || String(row.name || '').toLowerCase().includes(q)
    return typeOk && nameOk
  })
})

const openWarehouse = (row) => {
  router.push({
    path: `/warehouses/${encodeURIComponent(String(row?.id || ''))}/stock`,
    query: {
      name: String(row?.name || ''),
      type: String(row?.type || ''),
      object_levels_id: String(row?.objectLevelsId || ''),
    },
  })
}

onMounted(() => {
  loadWarehouses()
})
</script>

<template>
  <div class="page">
    <TopNav :links="navLinks" />

    <main class="main-content">
      <header class="content-header">
        <h1 class="page-title">Склады</h1>
      </header>

      <div class="filters">
        <input
          v-model="searchQuery"
          class="filter-input"
          type="text"
          placeholder="Поиск по наименованию..."
        >
        <select v-model="typeFilter" class="filter-select">
          <option value="all">Все типы</option>
          <option value="Склад">Склад</option>
          <option value="Приобъектный склад">Приобъектный склад</option>
        </select>
      </div>

      <div class="table-wrapper">
        <div v-if="loading" class="table-state">Загрузка...</div>
        <div v-else-if="error" class="table-state error">{{ error }}</div>

        <table v-else class="table">
          <thead>
            <tr>
              <th>Наименование склада</th>
              <th>Тип</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in filteredRows" :key="row.id">
              <td>
                <button
                  type="button"
                  class="name-link"
                  @click="openWarehouse(row)"
                >
                  {{ row.name }}
                </button>
              </td>
              <td>{{ row.type }}</td>
            </tr>
            <tr v-if="!filteredRows.length">
              <td colspan="2" class="table-empty">Склады не найдены</td>
            </tr>
          </tbody>
        </table>
      </div>
    </main>
  </div>
</template>

<style scoped>
.main-content {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.content-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.filters {
  display: flex;
  gap: 10px;
  align-items: center;
}

.filter-input,
.filter-select {
  min-height: 36px;
  border-radius: 8px;
  border: 1px solid var(--border-light);
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: 13px;
  padding: 0 10px;
}

.filter-input {
  width: 320px;
  max-width: 100%;
}

.filter-select {
  width: 220px;
}

.page-title {
  margin: 0;
  font-size: 26px;
  color: var(--text-primary);
}

.table-wrapper {
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: 12px;
  overflow: auto;
}

.table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  min-width: 620px;
}

.table th,
.table td {
  border-bottom: 1px solid var(--border-light);
  padding: 12px;
  text-align: left;
  vertical-align: top;
}

.table th {
  background: var(--bg-subtle);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.table td {
  color: var(--text-primary);
  font-size: 13px;
}

.name-link {
  border: none;
  background: transparent;
  color: var(--brand-primary);
  text-decoration: none;
  padding: 0;
  cursor: pointer;
  font-size: 13px;
}

.name-link:hover {
  color: var(--brand-primary);
}

.table tr:last-child td {
  border-bottom: none;
}

.table-state {
  padding: 20px 14px;
  color: var(--text-secondary);
  font-size: 13px;
}

.table-state.error {
  color: var(--danger-text);
}

.table-empty {
  text-align: center;
  color: var(--text-tertiary);
}
</style>
