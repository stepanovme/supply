<script setup>
const emit = defineEmits(['toggle-check'])

const props = defineProps({
  columns: {
    type: Array,
    required: true,
  },
  rows: {
    type: Array,
    required: true,
  },
  colWidths: {
    type: Array,
    required: true,
  },
  theme: {
    type: String,
    default: '',
  },
})
</script>

<template>
  <div class="expanded-content" :class="theme">
    <table class="subtable">
      <colgroup>
        <col v-for="(width, idx) in colWidths" :key="`col-${idx}`" :style="{ width }">
      </colgroup>
      <thead>
        <tr>
          <th
            v-for="(col, idx) in columns"
            :key="`head-${idx}`"
            :class="{ 'th-vertical': col.vertical }"
          >
            <div v-if="col.vertical" class="status-label-vertical">{{ col.label }}</div>
            <span v-else>{{ col.label }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, rIdx) in rows" :key="`row-${rIdx}`">
          <td v-for="(cell, cIdx) in row" :key="`cell-${rIdx}-${cIdx}`">
            <template v-if="cell && cell.type === 'bar'">
              <div class="chart-cell">
                <div class="bar-track">
                  <div class="bar-fill" :class="cell.variant" :style="{ height: cell.height }"></div>
                </div>
                <div v-if="cell.label" class="bar-value">{{ cell.label }}</div>
                <div v-if="cell.title" class="bar-tooltip-block">
                  {{ cell.title }}
                </div>
              </div>
            </template>
            <template v-else-if="cell && cell.type === 'checkbox'">
              <div class="cell-check">
                <input
                  type="checkbox"
                  :checked="Boolean(cell.checked)"
                  aria-label="Выбрать позицию"
                  @change="emit('toggle-check', { id: cell.requestId, itemId: cell.itemId, checked: $event.target.checked })"
                >
              </div>
            </template>
            <template v-else-if="cell && cell.type === 'docs'">
              <div class="doc-stack">
                <i v-for="(doc, dIdx) in cell.items" :key="`doc-${dIdx}`" :class="['doc-icon', doc.icon]">
                  <div v-if="doc.status" class="doc-status" :class="doc.status"></div>
                </i>
              </div>
            </template>
            <template v-else>
              {{ cell }}
            </template>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.expanded-content {
  padding: 4px 0;
  margin: 0;
  background: color-mix(in srgb, var(--bg-subtle) 52%, #fff);
  border-top: 1px solid var(--border-light);
  border-bottom: 1px solid var(--border-light);
  box-shadow: none;
  border-radius: 0;
}

.subtable {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
  background: var(--bg-surface);
  border: none;
}

.subtable th {
  background: color-mix(in srgb, var(--brand-light) 18%, var(--bg-subtle));
  font-size: 11px;
  color: var(--text-tertiary);
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-light);
  border-right: 1px solid var(--border-light);
  text-transform: none;
  letter-spacing: normal;
  font-weight: 600;
  text-align: center;
}

.subtable th:last-child {
  border-right: none;
}

.subtable td {
  padding: 4px 6px;
  font-size: 12px;
  border-bottom: 1px solid var(--border-light);
  border-right: 1px solid var(--border-light);
  background: color-mix(in srgb, var(--bg-subtle) 36%, #fff);
}

.subtable td:last-child {
  border-right: none;
}

.subtable tbody tr:nth-child(even) td {
  background: color-mix(in srgb, var(--bg-subtle) 58%, #fff);
}

.subtable tbody tr:hover td {
  background: color-mix(in srgb, var(--brand-light) 14%, #fff);
}

.subtable th:first-child,
.subtable td:first-child {
  border-left: none;
  box-shadow: none;
  text-align: center;
}

.subtable tr:last-child td {
  border-bottom: 1px solid var(--border-light);
}

.th-vertical {
  vertical-align: bottom;
  text-align: left;
  padding-bottom: 8px;
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

.chart-cell {
  display: flex;
  flex-direction: column-reverse;
  align-items: center;
  height: 100%;
  padding: 0;
  position: relative;
  overflow: visible;
}

.bar-value {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
  font-weight: 700;
  color: var(--brand-primary);
  line-height: 1.2;
  margin-top: 2px;
}

.bar-track {
  width: 8px;
  height: 80px;
  background: var(--border-light);
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column-reverse;
}

.bar-fill {
  width: 100%;
  background: var(--brand-primary);
  transition: height 0.3s ease;
}

.fill-success {
  background: #10b981;
}

.fill-answer {
  background: #f59e0b;
}

.fill-stock {
  background: #3b82f6;
}

.fill-warn {
  background: #f59e0b;
}

.fill-muted {
  background: #cbd5e1;
}

.doc-stack {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.doc-icon {
  color: var(--text-secondary);
  font-size: 16px;
  position: relative;
  cursor: pointer;
  transition: color 0.2s;
}

.doc-icon:hover {
  color: var(--brand-primary);
}

.doc-status {
  position: absolute;
  bottom: -2px;
  right: -2px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 2px solid var(--bg-surface);
}

.ds-process {
  background: #f59e0b;
}

.ds-ok {
  background: #10b981;
}

.ds-blue {
  background: #3b82f6;
}

.cell-check {
  display: flex;
  align-items: center;
  justify-content: center;
}

.bar-tooltip-block {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 8px);
  transform: translateX(-50%);
  min-width: 180px;
  max-width: 260px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--border-light);
  background: var(--bg-surface);
  box-shadow: var(--shadow-md);
  font-size: 11px;
  color: var(--text-primary);
  line-height: 1.35;
  text-align: center;
  z-index: 40;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition: opacity 0.15s ease, visibility 0.15s ease;
}

.chart-cell:hover .bar-tooltip-block {
  opacity: 1;
  visibility: visible;
}
</style>
