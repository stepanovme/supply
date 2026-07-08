<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import CreateTaskModal from './CreateTaskModal.vue'
import TaskDetailModal from './TaskDetailModal.vue'

const props = defineProps({
  connectionId: { type: [String, Number], required: true },
  connectionType: { type: String, required: true }, // например 'contract'
})

const router = useRouter()

const DEFAULT_STATUS_ID = 'e0896c9d-7646-11f1-b481-bc241127d0bd'
const COMPLETED_STATUS_ID = '1ff32c4b-1312-11f1-aa8c-bc241127d0bd'
const IN_PROGRESS_STATUS_ID = '6b4fbf85-7901-11f1-b481-bc241127d0bd'
const PAUSED_STATUS_ID = '1390dadd-7903-11f1-b481-bc241127d0bd'

const PRIORITIES = {
  none:   { label: 'Без приоритета', color: null,      icon: null },
  low:    { label: 'Низкий',         color: '#22c55e', icon: 'fa-fire-flame-curved' },
  medium: { label: 'Средний',        color: '#f59e0b', icon: 'fa-fire-flame-curved' },
  high:   { label: 'Высокий',        color: '#ef4444', icon: 'fa-fire-flame-curved' },
  frozen: { label: 'Заморожен',      color: '#6366f1', icon: 'fa-snowflake' },
}

const tasks = ref([])
const loading = ref(false)
const workFilter = ref('active') // all | active | done

const userShort = (u) => u?.short_fio || [u?.surname, u?.name].filter(Boolean).join(' ') || '—'
const initials = (u) => `${(u?.surname?.[0] || '').toUpperCase()}${(u?.name?.[0] || '').toUpperCase()}` || '?'

const responsibleOf = (t) => (t.user_roles || []).find(r => r.role === 'responsible')?.user || null

const isCompleted = (t) =>
  t.status_id === COMPLETED_STATUS_ID || !!t.date_completed || (t.status_name || '').toLowerCase().includes('заверш')

const statusClass = (t) => {
  const id = t.status_id
  const name = (t.status_name || '').toLowerCase()
  if (id === COMPLETED_STATUS_ID || name.includes('заверш')) return 'st--done'
  if (id === IN_PROGRESS_STATUS_ID || name.includes('выполня')) return 'st--progress'
  if (id === PAUSED_STATUS_ID || name.includes('приостан')) return 'st--paused'
  return 'st--waiting'
}

const parseApiDate = (s) => {
  if (!s) return null
  const m = String(s).match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})/)
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5])
  const d = new Date(s); return isNaN(d) ? null : d
}
const fmtDate = (s) => {
  const d = parseApiDate(s)
  if (!d) return '—'
  const p = n => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const filteredTasks = computed(() => {
  if (workFilter.value === 'active') return tasks.value.filter(t => !isCompleted(t))
  if (workFilter.value === 'done') return tasks.value.filter(t => isCompleted(t))
  return tasks.value
})

const loadTasks = async () => {
  if (!props.connectionId) return
  loading.value = true
  try {
    const url = `/apisup/supply/tasks?connection_type=${encodeURIComponent(props.connectionType)}&connection_id=${encodeURIComponent(props.connectionId)}`
    const r = await fetch(url, { credentials: 'include' })
    if (r.ok) {
      const data = await r.json()
      tasks.value = data.items ?? data ?? []
    }
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

// Создание — то же модальное окно, что и в списке задач, прямо на этой странице
const showCreate = ref(false)
const connection = computed(() => ({ type: props.connectionType, id: String(props.connectionId) }))
const openCreateTask = () => { showCreate.value = true }
const onCreated = () => { loadTasks() }

const detailTaskId = ref(null)
const showDetail = ref(false)
const openTask = (t) => { detailTaskId.value = t.id; showDetail.value = true }
const onDetailUpdated = () => { loadTasks() }
const closeDetail = () => { showDetail.value = false; loadTasks() }

watch(() => props.connectionId, loadTasks)
onMounted(() => {
  loadTasks()
  window.addEventListener('focus', loadTasks)
})
onUnmounted(() => {
  window.removeEventListener('focus', loadTasks)
})
</script>

<template>
  <div class="tasks-section">
    <div class="ts-head">
      <div class="ts-toggle">
        <button class="ts-toggle-btn" :class="{ active: workFilter === 'all' }" @click="workFilter = 'all'">Все</button>
        <button class="ts-toggle-btn" :class="{ active: workFilter === 'active' }" @click="workFilter = 'active'">В работе</button>
        <button class="ts-toggle-btn" :class="{ active: workFilter === 'done' }" @click="workFilter = 'done'">Завершённые</button>
      </div>
      <button class="ts-add-btn" @click="openCreateTask"><i class="fas fa-plus"></i> Создать задачу</button>
    </div>

    <div v-if="loading" class="ts-empty">Загрузка задач...</div>
    <div v-else-if="!filteredTasks.length" class="ts-empty">Задач нет</div>
    <div v-else class="ts-list">
      <div v-for="t in filteredTasks" :key="t.id" class="ts-card" @click="openTask(t)">
        <div class="ts-card-main">
          <span v-if="PRIORITIES[t.urgent || 'none']?.icon" class="ts-prio" :style="{ color: PRIORITIES[t.urgent].color }" :title="PRIORITIES[t.urgent].label">
            <i class="fas" :class="PRIORITIES[t.urgent].icon"></i>
          </span>
          <span class="ts-name">{{ t.name }}</span>
          <span v-if="isCompleted(t)" class="ts-done" title="Завершена"><i class="fas fa-circle-check"></i></span>
        </div>
        <div class="ts-card-meta">
          <span class="ts-status" :class="statusClass(t)">{{ t.status_name || 'Ждёт выполнения' }}</span>
          <span v-if="responsibleOf(t)" class="ts-assignee">
            <span class="ts-avatar">{{ initials(responsibleOf(t)) }}</span>
            {{ userShort(responsibleOf(t)) }}
          </span>
          <span v-if="t.date_end" class="ts-deadline"><i class="fas fa-clock"></i> {{ fmtDate(t.date_end) }}</span>
        </div>
      </div>
    </div>

    <CreateTaskModal :open="showCreate" :connection="connection" @close="showCreate = false" @created="onCreated" />
    <TaskDetailModal :open="showDetail" :task-id="detailTaskId" @close="closeDetail" @updated="onDetailUpdated" />
  </div>
</template>

<style scoped>
.tasks-section { display: flex; flex-direction: column; gap: 14px; }
.ts-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.ts-toggle { display: inline-flex; padding: 3px; gap: 2px; background: var(--bg-subtle, #f1f5f9); border-radius: 9px; }
.ts-toggle-btn {
  border: none; background: none; cursor: pointer; padding: 6px 12px; border-radius: 7px;
  font-size: 12px; font-weight: 600; color: var(--text-secondary, #64748b);
}
.ts-toggle-btn.active { background: var(--bg-surface, #fff); color: var(--brand-primary, #3b82f6); box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.ts-add-btn {
  display: inline-flex; align-items: center; gap: 6px; border: none; cursor: pointer;
  background: var(--brand-primary, #3b82f6); color: #fff; padding: 8px 14px; border-radius: 8px;
  font-size: 13px; font-weight: 500;
}
.ts-add-btn:hover { background: #2563eb; }
.ts-add-row { display: flex; gap: 8px; }
.ts-add-input {
  flex: 1; height: 38px; padding: 0 12px; border: 1px solid var(--brand-primary, #3b82f6);
  border-radius: 8px; font-size: 14px; outline: none;
}
.ts-btn {
  width: 38px; height: 38px; border-radius: 8px; border: 1px solid var(--border-light, #e2e8f0);
  background: var(--bg-surface, #fff); cursor: pointer; color: var(--text-secondary, #64748b);
  display: inline-flex; align-items: center; justify-content: center;
}
.ts-btn--primary { background: var(--brand-primary, #3b82f6); color: #fff; border-color: var(--brand-primary, #3b82f6); }
.ts-btn:disabled { opacity: 0.6; cursor: default; }
.ts-empty { padding: 28px; text-align: center; color: var(--text-tertiary, #94a3b8); font-size: 13px; }
.ts-list { display: flex; flex-direction: column; gap: 8px; }
.ts-card {
  border: 1px solid var(--border-light, #e2e8f0); border-radius: 10px; padding: 12px 14px;
  background: var(--bg-surface, #fff); cursor: pointer; transition: box-shadow 0.12s, border-color 0.12s;
}
.ts-card:hover { border-color: var(--brand-primary, #3b82f6); box-shadow: 0 2px 8px rgba(15,23,42,0.06); }
.ts-card-main { display: flex; align-items: center; gap: 8px; }
.ts-prio { font-size: 13px; flex-shrink: 0; }
.ts-name { font-size: 14px; font-weight: 600; color: var(--text-primary, #1e293b); flex: 1; }
.ts-done { color: #16a34a; font-size: 14px; }
.ts-card-meta { display: flex; align-items: center; gap: 12px; margin-top: 8px; flex-wrap: wrap; }
.ts-status { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 6px; }
.st--waiting  { background: #fef3c7; color: #b45309; }
.st--progress { background: #dbeafe; color: #2563eb; }
.st--paused   { background: #fde68a; color: #92400e; }
.st--done     { background: #dcfce7; color: #16a34a; }
.ts-assignee { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-secondary, #64748b); }
.ts-avatar {
  width: 22px; height: 22px; border-radius: 50%; background: var(--bg-subtle, #e2e8f0);
  color: var(--text-secondary, #475569); font-size: 10px; font-weight: 700;
  display: inline-flex; align-items: center; justify-content: center;
}
.ts-deadline { font-size: 12px; color: var(--text-secondary, #64748b); display: inline-flex; align-items: center; gap: 4px; }
</style>
