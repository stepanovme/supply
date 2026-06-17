<script setup>
import { computed, ref, watch } from 'vue'
import { buildWarehouseCategoryTree } from '../helpers/warehouseCategoryTree'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: 'Выбор категории' },
  categories: { type: Array, default: () => [] },
  selectedId: { type: String, default: '' },
  allowNone: { type: Boolean, default: true },
  noneLabel: { type: String, default: 'Без выбора' },
  excludeIds: { type: Array, default: () => [] },
  showCreate: { type: Boolean, default: false },
  createLabel: { type: String, default: '+ Создать товарную категорию' },
})

const emit = defineEmits(['close', 'select', 'create'])

const query = ref('')
const expandedIds = ref(new Set())

const treeMeta = computed(() => buildWarehouseCategoryTree(props.categories))
const excluded = computed(() => new Set((props.excludeIds || []).map((id) => String(id))))
const childrenByParent = computed(() => {
  const map = new Map()
  treeMeta.value.flat.forEach((row) => {
    const parentId = String(row.parentId || '')
    if (!map.has(parentId)) map.set(parentId, [])
    map.get(parentId).push(row)
  })
  return map
})

const rootRows = computed(() => {
  const byId = treeMeta.value.byId
  return treeMeta.value.flat.filter((row) => !row.parentId || !byId.has(row.parentId))
})

const hasChildren = (id) => (childrenByParent.value.get(String(id)) || []).length > 0
const isExpanded = (id) => expandedIds.value.has(String(id))

const toggleExpand = (id) => {
  const key = String(id)
  const next = new Set(expandedIds.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expandedIds.value = next
}

const visibleRows = computed(() => {
  const q = query.value.trim().toLowerCase()
  const rows = treeMeta.value.flat
  if (q) return rows.filter((row) => row.pathLabel.toLowerCase().includes(q))

  const result = []
  const walk = (nodes) => {
    nodes.forEach((node) => {
      result.push(node)
      if (!isExpanded(node.id)) return
      const children = childrenByParent.value.get(String(node.id)) || []
      walk(children)
    })
  }
  walk(rootRows.value)
  return result
})

watch(
  () => props.open,
  (open) => {
    if (!open) return
    query.value = ''
    const next = new Set()
    const selected = treeMeta.value.byId.get(String(props.selectedId || ''))
    if (selected?.pathIds?.length) {
      selected.pathIds.slice(0, -1).forEach((id) => next.add(String(id)))
    }
    expandedIds.value = next
  }
)

const onSelect = (id) => {
  const value = String(id || '')
  if (value && excluded.value.has(value)) return
  emit('select', value)
  emit('close')
}
</script>

<template>
  <div v-if="open" class="picker-backdrop" @click.self="$emit('close')">
    <div class="picker-modal">
      <div class="picker-head">
        <h3 class="picker-title">{{ title }}</h3>
        <button type="button" class="picker-close" @click="$emit('close')">
          <i class="fas fa-times"></i>
        </button>
      </div>

      <label class="picker-search">
        <span>Поиск</span>
        <input v-model="query" type="text" class="picker-input" placeholder="Начните вводить название категории">
      </label>

      <div class="picker-list">
        <button v-if="showCreate" type="button" class="picker-row picker-row-create" @click="$emit('create')">
          <span class="picker-name">{{ createLabel }}</span>
        </button>
        <button v-if="allowNone" type="button" class="picker-row" :class="{ selected: !selectedId }" @click="onSelect('')">
          <span class="picker-name">{{ noneLabel }}</span>
        </button>
        <div
          v-for="row in visibleRows"
          :key="row.id"
          class="picker-row"
          :class="{ selected: selectedId === row.id, disabled: excluded.has(row.id) }"
          :style="{ paddingLeft: `${8 + row.depth * 18}px` }"
        >
          <button
            v-if="!query.trim() && hasChildren(row.id)"
            type="button"
            class="picker-expander"
            @click.stop="toggleExpand(row.id)"
          >
            <i class="fas" :class="isExpanded(row.id) ? 'fa-chevron-down' : 'fa-chevron-right'"></i>
          </button>
          <span v-else class="picker-expander picker-expander-empty"></span>

          <button
            type="button"
            class="picker-select"
            :disabled="excluded.has(row.id)"
            @click="onSelect(row.id)"
          >
            <span class="picker-name">{{ row.name }}</span>
            <span class="picker-path">{{ row.pathLabel }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.picker-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.38);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 5000;
  padding: 18px;
}

.picker-modal {
  width: min(860px, 100%);
  max-height: min(80vh, 760px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  border: 1px solid var(--border-light);
  background: var(--bg-surface);
  box-shadow: 0 20px 40px rgba(15, 23, 42, 0.28);
}

.picker-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-bottom: 1px solid var(--border-light);
  padding: 12px;
}

.picker-title {
  margin: 0;
  font-size: 16px;
  color: var(--text-primary);
}

.picker-close {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  width: 32px;
  height: 32px;
  cursor: pointer;
}

.picker-search {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border-bottom: 1px solid var(--border-light);
  font-size: 12px;
  color: var(--text-secondary);
}

.picker-input {
  width: 100%;
  min-height: 36px;
  border-radius: 8px;
  border: 1px solid var(--border-light);
  background: var(--bg-subtle);
  color: var(--text-primary);
  padding: 0 10px;
}

.picker-list {
  overflow: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.picker-row {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--bg-surface);
  color: var(--text-primary);
  display: flex;
  align-items: stretch;
  gap: 6px;
  padding: 4px 6px;
}

.picker-row:hover:not(.disabled) {
  border-color: color-mix(in srgb, var(--brand-primary) 55%, var(--border-light));
}

.picker-row-create {
  color: var(--brand-primary);
  font-weight: 600;
}

.picker-row.selected {
  border-color: var(--brand-primary);
  background: color-mix(in srgb, var(--brand-primary) 10%, #fff);
}

.picker-row.disabled {
  opacity: 0.5;
}

.picker-expander {
  width: 24px;
  min-width: 24px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

.picker-expander-empty {
  pointer-events: none;
}

.picker-select {
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 4px 4px 4px 0;
  width: 100%;
}

.picker-select:disabled {
  cursor: not-allowed;
}

.picker-name {
  font-size: 13px;
  font-weight: 600;
}

.picker-path {
  font-size: 12px;
  color: var(--text-secondary);
}
</style>
