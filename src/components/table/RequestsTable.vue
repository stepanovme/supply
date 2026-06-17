<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import RequestRow from './RequestRow.vue'
import ExpandedRow from './ExpandedRow.vue'

const props = defineProps({
  rows: { type: Array, required: true },
  expandedRows: { type: Object, required: true },
  checkedAll: { type: Boolean, default: false },
  colFilters: { type: Object, default: () => ({ agreed: [], answered: [], stock: [], paid: [], delivered: [] }) },
})

const emit = defineEmits(['toggle', 'open-request', 'download-attachment', 'attach-invoice', 'compare-invoices', 'toggle-all', 'toggle-check', 'update:colFilters', 'chat-open'])

const colFilterOpen = ref('')

const columnFilterConfig = {
  agreed: { options: [
    { value: 'pending', text: 'Не согласованные заявки' },
    { value: 'done', text: 'Согласованные заявки' },
  ]},
  answered: { options: [
    { value: 'waiting', text: 'Есть позиции ожидающие ответа' },
    { value: 'all', text: 'По всем позициям получен ответ' },
  ]},
  stock: { options: [
    { value: 'missing', text: 'Есть позиции отсутствующие на складе' },
    { value: 'present', text: 'Есть позиции на складе' },
  ]},
  paid: { options: [
    { value: 'unpaid', text: 'Есть не оплаченные позиции' },
    { value: 'all', text: 'Все позиции оплачены' },
  ]},
  delivered: { options: [
    { value: 'undelivered', text: 'Есть не доставленные позиции' },
    { value: 'delivered', text: 'Есть доставленные позиции' },
  ]},
}

const toggleColFilter = (key) => {
  colFilterOpen.value = colFilterOpen.value === key ? '' : key
}

const toggleColFilterOption = (key, value) => {
  const current = [...(props.colFilters[key] || [])]
  const idx = current.indexOf(value)
  if (idx >= 0) current.splice(idx, 1)
  else current.push(value)
  emit('update:colFilters', { ...props.colFilters, [key]: current })
}

const closeFilters = () => {
  colFilterOpen.value = ''
}

onMounted(() => {
  window.addEventListener('mousedown', closeFilters)
})
onBeforeUnmount(() => window.removeEventListener('mousedown', closeFilters))
</script>

<template>
  <div class="table-wrapper">
    <div class="bar-slot"><slot name="bar" /></div>
    <div class="table-scroll">
      <table>
        <colgroup>
          <col class="col-check">
          <col class="col-id">
          <col class="col-request">
          <col class="col-project">
          <col class="col-creator">
          <col class="col-acceptors">
          <col class="col-dates">
          <col class="col-status-1">
          <col class="col-status-2">
          <col class="col-status-3">
          <col class="col-status-4">
          <col class="col-status-5">
          <col class="col-docs">
          <col class="col-actions">
        </colgroup>
        <thead>
          <tr>
            <th><input :checked="checkedAll" type="checkbox" @change="emit('toggle-all', $event.target.checked)"></th>
            <th>ID</th>
            <th>Заявка / Состав</th>
            <th>Проект</th>
            <th>Участники</th>
            <th>Согласование</th>
            <th>Сроки</th>
            <th class="th-vertical">
              <div class="status-label-vertical">Согласовано</div>
              <div class="col-filter-trigger" :class="{ active: colFilters.agreed?.length }" @click.stop="toggleColFilter('agreed')">
                <i class="fas fa-filter"></i>
              </div>
              <div v-if="colFilterOpen === 'agreed'" class="col-filter-dropdown" @mousedown.stop @click.stop>
                <div v-for="opt in columnFilterConfig.agreed.options" :key="opt.value" class="col-filter-option" @click.stop="toggleColFilterOption('agreed', opt.value)">
                    <input type="checkbox" :checked="colFilters.agreed?.includes(opt.value)" @click.stop>
                    <span>{{ opt.text }}</span>
                  </div>
                </div>
              </th>
              <th class="th-vertical">
                <div class="status-label-vertical">Ответ</div>
                <div class="col-filter-trigger" :class="{ active: colFilters.answered?.length }" @click.stop="toggleColFilter('answered')">
                  <i class="fas fa-filter"></i>
                </div>
                <div v-if="colFilterOpen === 'answered'" class="col-filter-dropdown" @mousedown.stop @click.stop>
                  <div v-for="opt in columnFilterConfig.answered.options" :key="opt.value" class="col-filter-option" @click.stop="toggleColFilterOption('answered', opt.value)">
                    <input type="checkbox" :checked="colFilters.answered?.includes(opt.value)" @click.stop>
                    <span>{{ opt.text }}</span>
                  </div>
                </div>
              </th>
              <th class="th-vertical">
                <div class="status-label-vertical">На складе</div>
                <div class="col-filter-trigger" :class="{ active: colFilters.stock?.length }" @click.stop="toggleColFilter('stock')">
                  <i class="fas fa-filter"></i>
                </div>
                <div v-if="colFilterOpen === 'stock'" class="col-filter-dropdown" @mousedown.stop @click.stop>
                  <div v-for="opt in columnFilterConfig.stock.options" :key="opt.value" class="col-filter-option" @click.stop="toggleColFilterOption('stock', opt.value)">
                    <input type="checkbox" :checked="colFilters.stock?.includes(opt.value)" @click.stop>
                    <span>{{ opt.text }}</span>
                  </div>
                </div>
              </th>
              <th class="th-vertical">
                <div class="status-label-vertical">Оплачено</div>
                <div class="col-filter-trigger" :class="{ active: colFilters.paid?.length }" @click.stop="toggleColFilter('paid')">
                  <i class="fas fa-filter"></i>
                </div>
                <div v-if="colFilterOpen === 'paid'" class="col-filter-dropdown" @mousedown.stop @click.stop>
                  <div v-for="opt in columnFilterConfig.paid.options" :key="opt.value" class="col-filter-option" @click.stop="toggleColFilterOption('paid', opt.value)">
                    <input type="checkbox" :checked="colFilters.paid?.includes(opt.value)" @click.stop>
                    <span>{{ opt.text }}</span>
                  </div>
                </div>
              </th>
              <th class="th-vertical">
                <div class="status-label-vertical">Доставлено</div>
                <div class="col-filter-trigger" :class="{ active: colFilters.delivered?.length }" @click.stop="toggleColFilter('delivered')">
                  <i class="fas fa-filter"></i>
                </div>
                <div v-if="colFilterOpen === 'delivered'" class="col-filter-dropdown" @mousedown.stop @click.stop>
                  <div v-for="opt in columnFilterConfig.delivered.options" :key="opt.value" class="col-filter-option" @click.stop="toggleColFilterOption('delivered', opt.value)">
                    <input type="checkbox" :checked="colFilters.delivered?.includes(opt.value)" @click.stop>
                    <span>{{ opt.text }}</span>
                  </div>
              </div>
            </th>
            <th>Док-ты</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="row in rows" :key="row.id">
            <RequestRow
              :row="row"
              :expanded="expandedRows[row.id]?.open"
              @toggle-check="emit('toggle-check', $event)"
              @toggle="emit('toggle', $event)"
              @open-request="emit('open-request', $event)"
              @download-attachment="emit('download-attachment', $event)"
              @attach-invoice="emit('attach-invoice', $event)"
              @compare-invoices="emit('compare-invoices', $event)"
              @chat-open="emit('chat-open', $event)"
            />
            <ExpandedRow
              v-if="expandedRows[row.id]"
              :expanded="expandedRows[row.id]"
              :col-span="14"
              @toggle-check="emit('toggle-check', $event)"
            />
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.table-wrapper {
  background: var(--bg-surface);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-light);
  box-shadow: var(--shadow-sm);
  flex-grow: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.table-scroll {
  overflow: auto;
  flex-grow: 1;
}

table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
  font-size: 12px;
}

colgroup col.col-check {
  width: 40px;
}

colgroup col.col-id {
  width: 70px;
}

colgroup col.col-request {
  width: 180px;
}

colgroup col.col-project {
  width: 120px;
}

colgroup col.col-creator {
  width: 130px;
}

colgroup col.col-acceptors {
  width: 160px;
}

colgroup col.col-dates {
  width: 170px;
}

colgroup col.col-status-1,
colgroup col.col-status-2,
colgroup col.col-status-3,
colgroup col.col-status-4,
colgroup col.col-status-5 {
  width: 36px;
}

colgroup col.col-docs {
  width: 100px;
}

colgroup col.col-actions {
  width: 60px;
}

th,
td {
  border: none;
}

th:not(:last-child),
td:not(:last-child) {
  border-right: 1px solid var(--border-light);
}

td {
  border-bottom: 1px solid var(--border-light);
}

th {
  text-align: center;
  padding: 12px 10px;
  background: var(--bg-subtle);
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--border-light);
  position: sticky;
  top: 0;
  z-index: 20;
  height: 48px;
}

.th-vertical {
  vertical-align: bottom;
  text-align: left;
  padding: 24px 10px 8px;
}

.status-label-vertical {
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  font-size: 10px;
  color: var(--text-tertiary);
  height: 80px;
  margin: 0;
  font-weight: 600;
  white-space: nowrap;
  display: block;
}

.col-filter-trigger {
  position: absolute;
  top: 5px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 21;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-tertiary);
  font-size: 10px;
  line-height: 1;
  padding: 2px;
  transition: color 0.15s;
}

.col-filter-trigger:hover,
.col-filter-trigger.active {
  color: var(--brand-primary);
}

.col-filter-dropdown {
  position: absolute;
  left: 50%;
  top: 100%;
  transform: translateX(-50%);
  z-index: 30;
  min-width: 220px;
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  padding: 6px;
}

.col-filter-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
  font-size: 12px;
  color: var(--text-primary);
}

.col-filter-option:hover {
  background: var(--bg-subtle);
}
</style>
