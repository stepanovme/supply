<script setup>
import { ref } from 'vue'

const props = defineProps({
  node: { type: Object, required: true },
  activeId: { type: [String, Number], default: null },
  editMode: { type: Boolean, default: false },
  depth: { type: Number, default: 0 },
})
const emit = defineEmits(['select', 'toggle', 'menu', 'dragstart', 'dropnode'])

const dropPos = ref('') // '', 'before', 'inside', 'after'

const onDragStart = (e) => {
  e.dataTransfer.effectAllowed = 'move'
  emit('dragstart', props.node)
}
const onDragOver = (e) => {
  e.preventDefault()
  const r = e.currentTarget.getBoundingClientRect()
  const y = e.clientY - r.top
  if (props.node.kind === 'section' && y > r.height * 0.28 && y < r.height * 0.72) dropPos.value = 'inside'
  else dropPos.value = y < r.height / 2 ? 'before' : 'after'
}
const onDragLeave = () => { dropPos.value = '' }
const onDrop = () => {
  const pos = dropPos.value
  dropPos.value = ''
  if (pos) emit('dropnode', props.node, pos)
}
</script>

<template>
  <div class="wtn" :style="{ '--d': depth }">
    <div
      class="wtn-row"
      :class="{ active: String(activeId) === String(node.id), section: node.kind === 'section', ['drop-' + dropPos]: dropPos }"
      :draggable="editMode"
      @dragstart.stop="onDragStart"
      @dragover="editMode && onDragOver($event)"
      @dragleave="onDragLeave"
      @drop.stop.prevent="editMode && onDrop()"
    >
      <button v-if="node.kind === 'section'" class="wtn-chev" @click="emit('toggle', node)">
        <i class="fas fa-chevron-right" :class="{ open: node.open }"></i>
      </button>
      <span v-else class="wtn-dot"></span>
      <button class="wtn-label" @click="node.kind === 'section' ? emit('toggle', node) : emit('select', node)">
        {{ node.title }}
      </button>
      <button v-if="editMode" class="wtn-dots" @click.stop="emit('menu', node, $event)"><i class="fas fa-ellipsis"></i></button>
    </div>

    <div v-if="node.kind !== 'section' || node.open" class="wtn-children">
      <WikiTreeNode
        v-for="ch in node.children || []"
        :key="ch.id"
        :node="ch"
        :active-id="activeId"
        :edit-mode="editMode"
        :depth="depth + 1"
        @select="emit('select', $event)"
        @toggle="emit('toggle', $event)"
        @menu="(n, e) => emit('menu', n, e)"
        @dragstart="emit('dragstart', $event)"
        @dropnode="(n, p) => emit('dropnode', n, p)"
      />
    </div>
  </div>
</template>

<style scoped>
.wtn-row { position: relative; display: flex; align-items: center; gap: 4px; border-radius: 8px; padding-left: calc(var(--d) * 12px); }
.wtn-row:hover { background: var(--wk-brand-soft); }
.wtn-row:hover .wtn-dots { opacity: 1; }
.wtn-row.active { background: var(--wk-brand-soft); }
.wtn-row.active .wtn-label { color: var(--wk-brand); font-weight: 600; }
.wtn-row[draggable="true"] { cursor: grab; }
.wtn-row.drop-inside { box-shadow: inset 0 0 0 2px var(--wk-brand); background: var(--wk-brand-soft); }
.wtn-row.drop-before::before, .wtn-row.drop-after::after { content: ''; position: absolute; left: calc(var(--d) * 12px); right: 4px; height: 2px; background: var(--wk-brand); border-radius: 2px; }
.wtn-row.drop-before::before { top: -1px; }
.wtn-row.drop-after::after { bottom: -1px; }
.wtn-chev { width: 22px; height: 30px; border: none; background: none; cursor: pointer; color: var(--wk-muted); font-size: 10px; flex-shrink: 0; }
.wtn-chev .fa-chevron-right { transition: transform 0.15s; }
.wtn-chev .fa-chevron-right.open { transform: rotate(90deg); }
.wtn-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--wk-muted); margin: 0 8px 0 9px; flex-shrink: 0; }
.wtn-label { flex: 1; text-align: left; border: none; background: none; cursor: pointer; padding: 8px 4px; font-size: 13px; color: var(--wk-text-2); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wtn-row.section > .wtn-label { font-weight: 700; color: var(--wk-text); }
.wtn-label:hover { color: var(--wk-text); }
.wtn-dots { opacity: 0; width: 26px; height: 26px; border: none; background: none; cursor: pointer; color: var(--wk-muted); border-radius: 6px; flex-shrink: 0; transition: opacity 0.12s; }
.wtn-dots:hover { background: var(--wk-border); color: var(--wk-text); }
</style>
