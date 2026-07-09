<script setup>
import { computed, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useTicketsStore } from '../stores/tickets'
import TopNav from '../components/layout/TopNav.vue'
import { mainNavLinks } from '../constants/mainNav'

const router = useRouter()
const ticketsStore = useTicketsStore()
const navLinks = mainNavLinks

const showCreate = ref(false)
const newType = ref('question')
const newDescription = ref('')
const newFiles = ref([])
const creating = ref(false)

const typeOptions = [
  { value: 'problem', label: 'Проблема' },
  { value: 'suggestion', label: 'Предложение' },
  { value: 'question', label: 'Вопрос' },
]

const typeLabel = (t) => typeOptions.find(o => o.value === t)?.label || t

const statusMap = {
  '1ff34436-1312-11f1-aa8c-bc241127d0bd': 'Новый',
  '77664011-7aca-11f1-b481-bc241127d0bd': 'В работе',
  '1ff32c4b-1312-11f1-aa8c-bc241127d0bd': 'Завершён',
}
const statusLabel = (id) => statusMap[id] || id?.slice(0, 8) || '—'

const statusOptions = Object.entries(statusMap).map(([value, label]) => ({ value, label }))

const formatDate = (v) => {
  if (!v) return '—'
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('ru-RU')
}

const getAuthor = (t) => t.users?.find(u => u.role_id === 'author')
const authorName = (t) => {
  const a = getAuthor(t)
  if (!a?.user) return '—'
  return [a.user.surname, a.user.name, a.user.patronymic].filter(Boolean).join(' ')
}

const filterId = ref('')
const filterType = ref('')
const filterStatus = ref('')
const filterDateFrom = ref('')
const filterDateTo = ref('')

const applicantQuery = ref('')
const applicantOpen = ref(false)
const applicantSelected = ref('')

const applicantOptions = computed(() => {
  const names = new Set(ticketsStore.tickets.map(t => authorName(t)).filter(n => n !== '—'))
  return [...names].sort()
})

const filteredApplicantOptions = computed(() => {
  const q = applicantQuery.value.toLowerCase()
  if (!q) return applicantOptions.value
  return applicantOptions.value.filter(n => n.toLowerCase().includes(q))
})

function selectApplicant(name) {
  applicantSelected.value = name
  applicantQuery.value = name
  applicantOpen.value = false
}

function clearApplicant() {
  applicantSelected.value = ''
  applicantQuery.value = ''
  applicantOpen.value = false
}

const filteredTickets = computed(() => {
  return ticketsStore.tickets.filter(t => {
    if (filterId.value && !String(t.id).includes(filterId.value)) return false
    if (filterType.value && t.type !== filterType.value) return false
    if (filterStatus.value && t.status_id !== filterStatus.value) return false
    if (applicantSelected.value && authorName(t) !== applicantSelected.value) return false
    if (filterDateFrom.value && t.created_at) {
      const d = new Date(t.created_at)
      const f = new Date(filterDateFrom.value)
      if (d < f) return false
    }
    if (filterDateTo.value && t.created_at) {
      const d = new Date(t.created_at)
      const f = new Date(filterDateTo.value + 'T23:59:59')
      if (d > f) return false
    }
    return true
  })
})

onMounted(() => {
  ticketsStore.loadTickets()
})

async function handleCreate() {
  if (!newDescription.value.trim() && !newFiles.value.length) return
  creating.value = true
  try {
    const ticket = await ticketsStore.createTicket({
      type: newType.value,
      description: newDescription.value.trim(),
      files: newFiles.value,
    })
    showCreate.value = false
    resetForm()
    ticketsStore.loadTickets()
    if (ticket?.id) router.push(`/tickets/${ticket.id}`)
  } catch {} finally {
    creating.value = false
  }
}

function resetForm() {
  newType.value = 'question'
  newDescription.value = ''
  newFiles.value = []
}

function onFileChange(e) {
  newFiles.value = Array.from(e.target.files || [])
}

function openTicket(id) {
  router.push(`/tickets/${id}`)
}
</script>

<template>
  <div>
    <TopNav :links="navLinks" />
    <main class="page-shell">
      <header class="page-head">
        <div>
          <p class="eyebrow">Обратная связь</p>
          <h1>Тикеты</h1>
        </div>
        <div class="head-actions">
          <button type="button" class="primary-btn" @click="showCreate = true">Создать тикет</button>
        </div>
      </header>

      <section class="registry-card">
        <div class="filter-bar">
          <input v-model="filterId" class="filter-input col-id-w" type="text" placeholder="#">
          <select v-model="filterType" class="filter-input col-type-w">
            <option value="">Тема</option>
            <option v-for="o in typeOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
          <select v-model="filterStatus" class="filter-input col-status-w">
            <option value="">Статус</option>
            <option v-for="o in statusOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
          <div class="autocomplete-wrap">
            <input v-model="applicantQuery" class="filter-input col-users-w" type="text" placeholder="Заявитель" @focus="applicantOpen = true" @input="applicantOpen = true" @blur="setTimeout(() => applicantOpen = false, 150)">
            <div v-if="applicantOpen && filteredApplicantOptions.length" class="ac-dropdown">
              <div v-if="applicantSelected" class="ac-item ac-selected" @mousedown.prevent="clearApplicant()">&times; {{ applicantSelected }}</div>
              <div v-for="name in filteredApplicantOptions" :key="name" class="ac-item" :class="{ active: name === applicantSelected }" @mousedown.prevent="selectApplicant(name)">{{ name }}</div>
            </div>
          </div>
          <input v-model="filterDateFrom" class="filter-input col-date-w" type="date" placeholder="Дата с">
          <input v-model="filterDateTo" class="filter-input col-date-w" type="date" placeholder="Дата по">
        </div>
        <table class="registry-table">
          <colgroup>
            <col class="col-id">
            <col>
            <col class="col-status-w">
            <col class="col-users">
            <col class="col-dates">
          </colgroup>
          <thead>
            <tr>
              <th>№</th>
              <th>Тема</th>
              <th>Статус</th>
              <th>Заявитель</th>
              <th>Дата</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(t, i) in filteredTickets" :key="t.id" class="clickable" @click="openTicket(t.id)">
              <td class="mono">{{ i + 1 }}</td>
              <td>
                <div class="ticket-title">
                  <span class="ticket-type-badge" :class="t.type">{{ typeLabel(t.type) }}</span>
                  <span class="ticket-id">#{{ t.id }}</span>
                </div>
              </td>
              <td><span class="status-chip" :class="t.status_id === '1ff32c4b-1312-11f1-aa8c-bc241127d0bd' ? 'done' : ''">{{ statusLabel(t.status_id) }}</span></td>
              <td class="mono">{{ authorName(t) }}</td>
              <td class="mono">{{ formatDate(t.created_at) }}</td>
            </tr>
            <tr v-if="ticketsStore.loading">
              <td colspan="5" class="empty-state">Загружаем тикеты...</td>
            </tr>
            <tr v-else-if="!filteredTickets.length">
              <td colspan="5" class="empty-state">Тикетов пока нет.</td>
            </tr>
          </tbody>
        </table>
      </section>
    </main>

    <Teleport to="body">
      <div v-if="showCreate" class="modal-overlay" @click.self="showCreate = false">
        <div class="modal-card">
          <div class="modal-header">
            <h2>Создать тикет</h2>
            <button class="modal-close" type="button" @click="showCreate = false">&times;</button>
          </div>
          <div class="modal-body">
            <label class="ff">
              <span>Тип обращения</span>
              <select v-model="newType" class="form-input">
                <option v-for="o in typeOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>
            </label>
            <label class="ff">
              <span>{{ typeOptions.find(o => o.value === newType)?.label || 'Описание' }}</span>
              <textarea v-model="newDescription" class="form-input" rows="6" placeholder="Опишите подробно..."></textarea>
            </label>
            <label class="ff">
              <span>Прикрепить файлы</span>
              <input type="file" multiple class="form-input-file" @change="onFileChange">
              <div v-if="newFiles.length" class="file-list">
                <span v-for="(f, fi) in newFiles" :key="fi" class="file-chip">{{ f.name }}</span>
              </div>
            </label>
          </div>
          <div class="modal-footer">
            <button class="secondary-btn" type="button" @click="showCreate = false">Отмена</button>
            <button class="primary-btn" type="button" :disabled="creating || (!newDescription.trim() && !newFiles.length)" @click="handleCreate">
              {{ creating ? 'Создание...' : 'Создать' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.page-shell { padding: 24px; }
.page-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
.head-actions { display: flex; align-items: center; gap: 10px; }
.eyebrow { margin: 0 0 6px; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--brand-primary); }
h1 { margin: 0; font-size: 28px; line-height: 1.1; }

.registry-card { background: var(--bg-surface); border: 1px solid var(--border-light); border-radius: 14px; overflow: hidden; }
.registry-table { width: 100%; border-collapse: collapse; }
.registry-table th, .registry-table td { padding: 14px 16px; border: 1px solid var(--border-light); text-align: left; vertical-align: middle; }
.registry-table th { background: #f8fafc; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-secondary); }
.registry-table tbody tr:last-child td { border-bottom: none; }
.registry-table tbody tr.clickable { cursor: pointer; transition: background 0.15s; }
.registry-table tbody tr.clickable:hover { background: #f8fafc; }

.col-id { width: 50px; }
.col-id-w { width: 60px; }
.col-type-w { width: 140px; }
.col-status-w { width: 130px; }
.col-users { width: 180px; }
.col-users-w { width: 160px; }
.col-dates { width: 110px; }
.col-date-w { width: 130px; }

.filter-bar { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-bottom: 1px solid var(--border-light); background: #fafbfc; flex-wrap: wrap; }
.filter-input { height: 32px; border: 1px solid var(--border-light); border-radius: 6px; background: #fff; font-size: 12px; padding: 0 8px; outline: none; color: var(--text-primary); min-width: 0; }
.filter-input:focus { border-color: var(--brand-primary); }
.filter-input::placeholder { color: #94a3b8; }

.autocomplete-wrap { position: relative; }
.ac-dropdown { position: absolute; top: 100%; left: 0; right: 0; z-index: 50; background: #fff; border: 1px solid #e2e8f0; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-height: 180px; overflow-y: auto; margin-top: 2px; }
.ac-item { padding: 6px 10px; font-size: 12px; cursor: pointer; color: var(--text-primary); }
.ac-item:hover, .ac-item.active { background: #f1f5f9; }
.ac-selected { color: var(--brand-primary); font-weight: 600; display: flex; align-items: center; gap: 4px; border-bottom: 1px solid #e2e8f0; }

.mono { font-family: "SF Mono", "Cascadia Code", monospace; font-size: 13px; }
.empty-state { text-align: center; color: var(--text-secondary); padding: 40px 16px !important; font-size: 14px; }

.ticket-title { display: flex; align-items: center; gap: 8px; }
.ticket-id { font-size: 13px; color: var(--text-secondary); }
.ticket-type-badge { font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 6px; }
.ticket-type-badge.problem { background: #fef2f2; color: #dc2626; }
.ticket-type-badge.suggestion { background: #f0fdf4; color: #16a34a; }
.ticket-type-badge.question { background: #eff6ff; color: #2563eb; }

.status-chip { font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 999px; background: #f59e0b; color: #fff; }
.status-chip.done { background: #22c55e; }

.primary-btn { border: none; border-radius: 12px; padding: 11px 16px; background: var(--brand-primary); color: #fff; font-weight: 700; cursor: pointer; }
.primary-btn:hover { background: var(--brand-hover); }
.primary-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.secondary-btn { border: 1px solid var(--border-light); border-radius: 12px; padding: 11px 16px; background: #fff; color: var(--text-primary); font-weight: 600; cursor: pointer; }

.form-input { width: 100%; min-height: 40px; border-radius: 10px; border: 1px solid var(--border-light); background: var(--bg-body); color: var(--text-primary); padding: 0 12px; font-size: 14px; outline: none; box-sizing: border-box; font-family: inherit; }
.form-input:focus { border-color: var(--brand-primary); box-shadow: 0 0 0 2px var(--brand-soft); background: var(--bg-surface); }
textarea.form-input { padding: 10px 12px; resize: vertical; min-height: 120px; }
.form-input-file { font-size: 14px; }

.ff { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 500; }
.ff span { color: var(--text-secondary); }

.file-list { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.file-chip { font-size: 12px; padding: 4px 10px; background: #f1f5f9; border-radius: 6px; color: var(--text-secondary); }

/* Modal */
.modal-overlay { position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; }
.modal-card { background: #fff; border-radius: 16px; width: 520px; max-width: 94vw; max-height: 90vh; overflow-y: auto; box-shadow: 0 25px 60px rgba(0,0,0,0.15); }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px 0; }
.modal-header h2 { margin: 0; font-size: 20px; }
.modal-close { background: none; border: none; font-size: 28px; cursor: pointer; color: var(--text-secondary); padding: 0; line-height: 1; }
.modal-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; }
.modal-footer { display: flex; justify-content: flex-end; gap: 10px; padding: 0 24px 20px; }
</style>
