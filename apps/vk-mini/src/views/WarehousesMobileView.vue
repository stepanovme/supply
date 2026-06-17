<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useVkStore } from '../stores/vk'

const router = useRouter()
const auth = useAuthStore()
const vk = useVkStore()

const loading = ref(false)
const error = ref('')
const search = ref('')
const warehouses = ref([])

const normalizeType = (value) => {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return ''
  if (raw.includes('приоб') || raw.includes('on-site')) return 'Приобъектный'
  if (raw.includes('объект') || raw.includes('warehouse') || raw.includes('склад')) return 'Склад'
  return value
}

const filteredWarehouses = computed(() => {
  const query = String(search.value || '').trim().toLowerCase()
  if (!query) return warehouses.value
  return warehouses.value.filter((item) => (
    String(item.name || '').toLowerCase().includes(query)
    || String(item.typeName || '').toLowerCase().includes(query)
  ))
})

const loadWarehouses = async () => {
  loading.value = true
  error.value = ''
  try {
    const res = await fetch('/apisup/supply/warehouses', { credentials: 'include' })
    if (!res.ok) throw new Error('warehouses')
    const payload = await res.json()
    const list = Array.isArray(payload) ? payload : (payload?.items || [])
    warehouses.value = list.map((item) => ({
      id: String(item?.id || ''),
      name: String(item?.name || 'Склад'),
      typeName: normalizeType(item?.type_name || item?.type || ''),
    }))
  } catch {
    error.value = 'Не удалось загрузить список складов.'
  } finally {
    loading.value = false
  }
}

const openWarehouse = (warehouse) => {
  router.push({
    name: 'vk-warehouse-home',
    params: { warehouseId: warehouse.id },
    query: {
      name: warehouse.name,
      type: warehouse.typeName,
    },
  })
}

onMounted(async () => {
  await auth.init()
  await loadWarehouses()
})
</script>

<template>
  <main class="vk-shell">
    <header class="vk-screen-head">
      <div>
        <div class="vk-screen-eyebrow">VK Mini Apps</div>
        <h1 class="vk-screen-title">Склады</h1>
      </div>
      <div class="vk-user-chip">
        {{ vk.user?.first_name || auth.user?.name || 'Пользователь' }}
      </div>
    </header>

    <section class="vk-card vk-status-card">
      <div class="vk-status-row">
        <span>Режим</span>
        <strong>{{ vk.isVkApp ? 'Запуск внутри VK' : 'Обычный браузер' }}</strong>
      </div>
      <div class="vk-status-row">
        <span>Платформа VK</span>
        <strong>{{ vk.platform || '—' }}</strong>
      </div>
      <div class="vk-status-row">
        <span>Пользователь VK</span>
        <strong>{{ vk.user?.first_name ? `${vk.user.first_name} ${vk.user.last_name || ''}`.trim() : 'Не получен' }}</strong>
      </div>
    </section>

    <section class="vk-card">
      <label class="vk-field">
        <span>Поиск по складам</span>
        <input v-model="search" type="text" class="vk-input" placeholder="Название или тип">
      </label>
    </section>

    <div v-if="loading" class="vk-card empty-card">Загрузка складов...</div>
    <div v-else-if="error" class="vk-card empty-card error-card">{{ error }}</div>

    <section v-else class="warehouse-list">
      <button
        v-for="warehouse in filteredWarehouses"
        :key="warehouse.id"
        type="button"
        class="vk-card warehouse-card"
        @click="openWarehouse(warehouse)"
      >
        <div class="warehouse-card-head">
          <h2>{{ warehouse.name }}</h2>
          <span class="warehouse-tag">{{ warehouse.typeName || 'Склад' }}</span>
        </div>
        <div class="warehouse-meta">
          <span>ID: {{ warehouse.id }}</span>
        </div>
      </button>

      <div v-if="!filteredWarehouses.length" class="vk-card empty-card">
        По текущему фильтру склады не найдены.
      </div>
    </section>
  </main>
</template>
