<script setup>
defineProps({
  selectedCount: {
    type: Number,
    default: 0,
  },
})

defineEmits(['create-request', 'export'])
</script>

<template>
  <div class="content-header">
    <div>
      <h1 class="page-title">Реестр заявок</h1>
      <div class="page-subtitle">Управление закупками и согласованиями</div>
    </div>
    <div class="actions-bar">
      <button class="btn" @click="$emit('export')"><i class="fas fa-download"></i> Экспорт</button>
      <button class="btn btn-primary" @click="$emit('create-request')">
        <i class="fas fa-plus"></i> Создать заявку
      </button>
    </div>
  </div>
  <div v-if="selectedCount > 0" class="selection-hint">Выбрано заявок: {{ selectedCount }}</div>
</template>

<style scoped>
.content-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  flex-shrink: 0;
}

.page-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.5px;
}

.page-subtitle {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.actions-bar {
  display: flex;
  gap: 12px;
}

.selection-hint {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}
</style>
