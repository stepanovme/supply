<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  modelValue: { type: [String, Array], default: '' },
  options: { type: Array, default: () => [] },
  placeholder: { type: String, default: 'Все' },
  multiple: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

const open = ref(false)
const query = ref('')
const rootEl = ref(null)

const selected = computed(() => (props.multiple ? (props.modelValue || []) : props.modelValue))

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  const base = q ? props.options.filter(o => o.toLowerCase().includes(q)) : props.options
  return base
})

const isChosen = (o) => props.multiple ? selected.value.includes(o) : selected.value === o

const choose = (o) => {
  if (props.multiple) {
    const arr = [...selected.value]
    const i = arr.indexOf(o)
    if (i === -1) arr.push(o); else arr.splice(i, 1)
    emit('update:modelValue', arr)
    query.value = ''
  } else {
    emit('update:modelValue', o)
    open.value = false
    query.value = ''
  }
}

const clearAll = () => {
  emit('update:modelValue', props.multiple ? [] : '')
  query.value = ''
}
const removeChip = (o) => {
  emit('update:modelValue', selected.value.filter(v => v !== o))
}

const openDD = () => { open.value = true }
const onBlur = (e) => {
  // закрываем, если фокус ушёл за пределы компонента
  if (rootEl.value && !rootEl.value.contains(e.relatedTarget)) open.value = false
}

const hasValue = computed(() => props.multiple ? selected.value.length > 0 : !!selected.value)
</script>

<template>
  <div ref="rootEl" class="fcombo" :class="{ 'fcombo--open': open }" @focusout="onBlur">
    <div class="fcombo-box" @click="openDD">
      <!-- Мультивыбор: чипы -->
      <template v-if="multiple">
        <span v-for="o in selected" :key="o" class="fcombo-chip" @click.stop>
          {{ o }}
          <button type="button" class="fcombo-chip-x" @click.stop="removeChip(o)"><i class="fas fa-xmark"></i></button>
        </span>
      </template>
      <input
        class="fcombo-input"
        :value="open ? query : (multiple ? '' : (modelValue || ''))"
        :placeholder="hasValue && !multiple ? '' : placeholder"
        @focus="openDD"
        @input="query = $event.target.value; open = true"
      />
      <button v-if="hasValue" type="button" class="fcombo-clear" @click.stop="clearAll"><i class="fas fa-xmark"></i></button>
      <i v-else class="fas fa-chevron-down fcombo-caret"></i>
    </div>
    <div v-if="open" class="fcombo-dd">
      <button v-if="!multiple" type="button" class="fcombo-item fcombo-item--all" @mousedown.prevent @click="choose('')">
        {{ placeholder }}
      </button>
      <button
        v-for="o in filtered" :key="o"
        type="button"
        class="fcombo-item"
        :class="{ chosen: isChosen(o) }"
        @mousedown.prevent
        @click="choose(o)"
      >
        <span class="fcombo-item-text">{{ o }}</span>
        <i v-if="isChosen(o)" class="fas fa-check"></i>
      </button>
      <div v-if="!filtered.length" class="fcombo-empty">Ничего не найдено</div>
    </div>
  </div>
</template>

<style scoped>
.fcombo { position: relative; }
.fcombo-box {
  display: flex; align-items: center; flex-wrap: wrap; gap: 4px;
  min-height: 34px; padding: 2px 6px; border: 1px solid var(--border-light, #e2e8f0);
  border-radius: 8px; background: var(--bg-surface, #fff); cursor: text;
}
.fcombo--open .fcombo-box { border-color: var(--brand-primary, #3b82f6); }
.fcombo-input {
  flex: 1; min-width: 60px; border: none; outline: none; background: transparent;
  font-size: 13px; color: var(--text-primary, #1e293b); padding: 4px 2px;
}
.fcombo-chip {
  display: inline-flex; align-items: center; gap: 4px;
  background: var(--brand-light, #eff6ff); color: var(--brand-primary, #3b82f6);
  border-radius: 6px; padding: 2px 4px 2px 7px; font-size: 12px; font-weight: 600;
}
.fcombo-chip-x { border: none; background: none; color: inherit; cursor: pointer; padding: 0; font-size: 10px; display: flex; }
.fcombo-clear, .fcombo-caret {
  border: none; background: none; color: var(--text-tertiary, #94a3b8);
  cursor: pointer; font-size: 12px; padding: 0 2px; display: flex; align-items: center;
}
.fcombo-dd {
  position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 60;
  background: var(--bg-surface, #fff); border: 1px solid var(--border-light, #e2e8f0);
  border-radius: 8px; box-shadow: 0 6px 18px rgba(0,0,0,0.12);
  max-height: 220px; overflow-y: auto; padding: 4px;
}
.fcombo-item {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  width: 100%; text-align: left; border: none; background: none; cursor: pointer;
  padding: 7px 8px; border-radius: 6px; font-size: 13px; color: var(--text-primary, #1e293b);
}
.fcombo-item:hover { background: var(--bg-subtle, #f1f5f9); }
.fcombo-item.chosen { color: var(--brand-primary, #3b82f6); font-weight: 600; }
.fcombo-item--all { color: var(--text-secondary, #64748b); }
.fcombo-item-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fcombo-item .fa-check { font-size: 11px; }
.fcombo-empty { padding: 10px 8px; font-size: 12px; color: var(--text-tertiary, #94a3b8); text-align: center; }
</style>
