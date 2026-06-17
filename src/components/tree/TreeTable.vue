<script setup>
import { computed } from 'vue'

const props = defineProps({
  nodes: {
    type: Array,
    required: true,
  },
})

const flatRows = computed(() => {
  const rows = []
  const walk = (items, depth) => {
    items.forEach((node) => {
      rows.push({
        node,
        depth,
        hasChildren: Array.isArray(node.children) && node.children.length > 0,
      })
      if (node.open !== false && node.children && node.children.length) {
        walk(node.children, depth + 1)
      }
    })
  }
  walk(props.nodes, 0)
  return rows
})

const toggle = (node) => {
  if (!node.children || node.children.length === 0) return
  node.open = !(node.open !== false)
}
</script>

<template>
  <div class="tree-table">
    <div class="tree-header">
      <div class="tree-title">Иерархия проекта</div>
      <div class="tree-subtitle">Обязательное правило: Проект → Договор</div>
    </div>
    <table class="tree-grid">
      <thead>
        <tr>
          <th>Структура</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in flatRows" :key="row.node.id">
          <td>
            <div class="tree-row" :style="{ paddingLeft: `${row.depth * 18}px` }">
              <button
                class="tree-toggle"
                :class="{ disabled: !row.hasChildren }"
                @click="toggle(row.node)"
              >
                <i v-if="row.hasChildren" class="fas" :class="row.node.open === false ? 'fa-plus' : 'fa-minus'"></i>
              </button>
              <span class="tree-label">{{ row.node.label }}</span>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.tree-table {
  background: var(--bg-surface);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-light);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

.tree-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-light);
}

.tree-title {
  font-weight: 600;
  font-size: 13px;
  color: var(--text-primary);
}

.tree-subtitle {
  font-size: 11px;
  color: var(--text-secondary);
}

.tree-grid {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.tree-grid th {
  text-align: left;
  padding: 10px 16px;
  background: var(--bg-subtle);
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--border-light);
}

.tree-grid td {
  padding: 8px 16px;
  border-bottom: 1px solid var(--border-light);
}

.tree-grid tr:last-child td {
  border-bottom: none;
}

.tree-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tree-toggle {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 0;
}

.tree-toggle.disabled {
  cursor: default;
  opacity: 0.4;
}

.tree-label {
  font-size: 12px;
  color: var(--text-primary);
}
</style>
