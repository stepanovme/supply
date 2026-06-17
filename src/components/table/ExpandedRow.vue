<script setup>
import SubTable from './SubTable.vue'

const props = defineProps({
  expanded: {
    type: Object,
    required: true,
  },
  colSpan: {
    type: Number,
    required: true,
  },
})

const emit = defineEmits(['toggle-check'])
</script>

<template>
  <tr v-if="expanded" :class="{ hidden: !expanded.open }">
    <td :colspan="colSpan" class="expanded-parent-cell">
      <template v-if="expanded.type === 'table'">
        <SubTable
          :columns="expanded.columns"
          :rows="expanded.rows"
          :col-widths="expanded.colWidths"
          :theme="expanded.theme"
          @toggle-check="emit('toggle-check', $event)"
        />
      </template>
      <template v-else>
        <div class="expanded-content" :class="expanded.theme">
          <span class="expanded-text">{{ expanded.text }}</span>
        </div>
      </template>
    </td>
  </tr>
</template>

<style scoped>
.expanded-parent-cell {
  padding: 0 !important;
  border: none;
  background: transparent;
}

.expanded-content {
  padding: 0;
  margin: 0;
  background: #fff;
  border: none;
  box-shadow: none;
  border-radius: 0;
}

.expanded-text {
  color: var(--text-secondary);
  padding: 10px;
  display: block;
}
</style>
