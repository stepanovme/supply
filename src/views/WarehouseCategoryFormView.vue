<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TopNav from '../components/layout/TopNav.vue'
import CategoryTreePickerModal from '../components/CategoryTreePickerModal.vue'
import { buildWarehouseCategoryTree } from '../helpers/warehouseCategoryTree'
import { mainNavLinks } from '../constants/mainNav'

const route = useRoute()
const router = useRouter()

const navLinks = mainNavLinks

const categoryId = computed(() => String(route.params.categoryId || ''))
const isCreateMode = computed(() => categoryId.value === 'new' || !categoryId.value)

const loading = ref(false)
const saving = ref(false)
const error = ref('')

const categories = ref([])
const parentPickerOpen = ref(false)
const form = ref({
  name: '',
  parent_id: '',
})

const pageTitle = computed(() => (isCreateMode.value ? 'Создание категории' : 'Изменение категории'))
const categoryMeta = computed(() => buildWarehouseCategoryTree(categories.value))
const selectedParentLabel = computed(() => {
  const selected = categoryMeta.value.byId.get(String(form.value.parent_id || ''))
  return selected?.pathLabel || ''
})

const normalizeArray = (payload) => {
  if (Array.isArray(payload)) return payload
  return payload?.items || payload?.data || payload?.results || []
}

const goBack = () => {
  const back = String(route.query.back || '').trim()
  if (back) {
    router.push(back)
    return
  }
  router.push('/warehouses')
}

const loadCategories = async () => {
  const endpoints = ['/apisup/supply/warehouse-categories']
  for (const endpoint of endpoints) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const res = await fetch(endpoint, { credentials: 'include' })
      if (!res.ok) continue
      // eslint-disable-next-line no-await-in-loop
      const payload = await res.json()
      categories.value = normalizeArray(payload).map((item) => ({
        id: String(item?.id || ''),
        name: String(item?.name || ''),
        parent_id: String(item?.parent_id || ''),
      })).filter((item) => item.id)
      return
    } catch {
      // try next endpoint
    }
  }
  categories.value = []
}

const fillFormForEdit = () => {
  if (isCreateMode.value) return
  const id = categoryId.value
  const found = categories.value.find((item) => item.id === id)
  if (!found) {
    error.value = 'Категория не найдена.'
    return
  }
  form.value = {
    name: found.name,
    parent_id: found.parent_id,
  }
}

const loadPage = async () => {
  loading.value = true
  error.value = ''
  try {
    await loadCategories()
    fillFormForEdit()
  } catch {
    error.value = 'Не удалось загрузить данные категории.'
  } finally {
    loading.value = false
  }
}

const saveCategory = async () => {
  if (saving.value) return
  const name = String(form.value.name || '').trim()
  if (!name) {
    error.value = 'Введите название категории.'
    return
  }

  saving.value = true
  error.value = ''
  try {
    const payload = {
      name,
      parent_id: form.value.parent_id || null,
    }

    let res
    if (isCreateMode.value) {
      res = await fetch('/apisup/supply/warehouse-categories', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } else {
      res = await fetch(`/apisup/supply/warehouse-categories/${encodeURIComponent(categoryId.value)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    }

    if (!res.ok) throw new Error('save failed')
    goBack()
  } catch {
    error.value = 'Не удалось сохранить товарную категорию.'
  } finally {
    saving.value = false
  }
}

const excludedParentIds = computed(() => {
  const currentId = String(categoryId.value || '')
  if (!currentId) return []
  const ids = [currentId]
  categoryMeta.value.flat.forEach((item) => {
    if (item.id !== currentId && item.pathIds.includes(currentId)) ids.push(item.id)
  })
  return ids
})

watch(() => route.params.categoryId, () => {
  form.value = {
    name: '',
    parent_id: '',
  }
  loadPage()
})

onMounted(() => {
  loadPage()
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

        <section class="form-card">
          <div class="form-grid">
            <label class="field">
              <span>Название</span>
              <input v-model="form.name" type="text" class="field-input">
            </label>

            <label class="field">
              <span>Родительская категория</span>
              <button type="button" class="field-input picker-trigger" @click="parentPickerOpen = true">
                {{ selectedParentLabel || 'Без родителя' }}
              </button>
            </label>
          </div>
        </section>

        <footer class="actions">
          <button type="button" class="save-btn" :disabled="saving" @click="saveCategory">
            {{ saving ? 'Сохранение...' : 'Сохранить' }}
          </button>
          <button type="button" class="cancel-btn" :disabled="saving" @click="goBack">Отмена</button>
        </footer>
      </div>
    </main>

    <CategoryTreePickerModal
      :open="parentPickerOpen"
      title="Выбор родительской категории"
      :categories="categories"
      :selected-id="form.parent_id"
      :exclude-ids="excludedParentIds"
      :allow-none="true"
      none-label="Без родителя"
      @close="parentPickerOpen = false"
      @select="(id) => { form.parent_id = id }"
    />
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

.page-title {
  margin: 0;
  font-size: 24px;
  color: var(--text-primary);
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

.inline-state {
  padding: 12px;
  border-radius: 10px;
  border: 1px solid var(--border-light);
  background: var(--bg-surface);
  color: var(--text-secondary);
}

.inline-state.error {
  color: var(--danger-text);
  border-color: color-mix(in srgb, var(--danger-text) 24%, transparent);
  background: color-mix(in srgb, var(--danger-text) 8%, #fff);
}

.form-card {
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: var(--bg-surface);
  padding: 14px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
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
  font-size: 14px;
}

.picker-trigger {
  text-align: left;
  cursor: pointer;
}

.actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.save-btn {
  border: 1px solid var(--brand-primary);
  border-radius: 8px;
  background: var(--brand-primary);
  color: #fff;
  padding: 8px 14px;
  cursor: pointer;
  font-size: 13px;
}

.save-btn:disabled {
  opacity: 0.7;
  cursor: default;
}

.cancel-btn {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  padding: 8px 14px;
  cursor: pointer;
  font-size: 13px;
}

@media (max-width: 900px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
