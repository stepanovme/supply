<script setup>
const props = defineProps({
  tabs: {
    type: Array,
    required: true,
  },
})

const emit = defineEmits(['select', 'reset'])
</script>

<template>
  <div class="filter-tabs">
    <div
      v-for="tab in tabs"
      :key="tab.label"
      class="tab-item"
      :class="{ active: tab.active }"
      @click="emit('select', tab.key)"
    >
      {{ tab.label }}
      <span v-if="tab.count" class="tab-count">{{ tab.count }}</span>
    </div>
    <div class="reset-filter" @click="emit('reset')">
      <i class="fas fa-xmark"></i> Сбросить фильтры
    </div>
  </div>
</template>

<style scoped>
.filter-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--border-light);
  padding-bottom: 0;
  flex-shrink: 0;
}

.tab-item {
  padding: 8px 16px;
  color: var(--text-secondary);
  font-weight: 500;
  font-size: 13px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.tab-item:hover {
  color: var(--text-primary);
}

.tab-item.active {
  color: var(--brand-primary);
  border-bottom-color: var(--brand-primary);
  font-weight: 600;
}

.tab-count {
  background: var(--brand-light);
  color: var(--brand-primary);
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 10px;
}

.reset-filter {
  margin-left: auto;
  color: var(--text-tertiary);
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.reset-filter:hover {
  color: var(--danger-text);
}
</style>
