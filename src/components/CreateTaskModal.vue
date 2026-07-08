<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  connection: { type: Object, default: null }, // { type, id }
})
const emit = defineEmits(['close', 'created'])

const DEFAULT_STATUS_ID = 'e0896c9d-7646-11f1-b481-bc241127d0bd'

const AVATAR_COLORS = [
  { bg: '#dbeafe', color: '#1d4ed8' },
  { bg: '#dcfce7', color: '#15803d' },
  { bg: '#fef9c3', color: '#a16207' },
  { bg: '#ede9fe', color: '#6d28d9' },
  { bg: '#ffedd5', color: '#c2410c' },
  { bg: '#e0f2fe', color: '#0369a1' },
  { bg: '#fee2e2', color: '#b91c1c' },
]
const avatarColor = (initials) => {
  const s = initials || '?'
  const idx = (s.charCodeAt(0) + (s.charCodeAt(1) || 0)) % AVATAR_COLORS.length
  return AVATAR_COLORS[idx]
}

const PRIORITIES = {
  none:   { label: 'Без приоритета', color: null,      icon: null },
  low:    { label: 'Низкий',         color: '#22c55e', icon: 'fa-fire-flame-curved' },
  medium: { label: 'Средний',        color: '#f59e0b', icon: 'fa-fire-flame-curved' },
  high:   { label: 'Высокий',        color: '#ef4444', icon: 'fa-fire-flame-curved' },
  frozen: { label: 'Заморожен',      color: '#6366f1', icon: 'fa-snowflake' },
}

const MONTH_RU    = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']
const MONTH_SHORT = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря']
const DAYNAMES_RU = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота']

const USERS = ref([])
const projectOptions = ref([])

const userInitials = (u) => `${(u.surname?.[0] || '').toUpperCase()}${(u.name?.[0] || '').toUpperCase()}` || (u.name?.[0]?.toUpperCase() || '?')
const userName = (u) => [u.surname, u.name, u.patronymic].filter(Boolean).join(' ')

const loadUsers = async () => {
  if (USERS.value.length) return
  try {
    const r = await fetch('/api/as/users/all', { credentials: 'include' })
    if (r.ok) {
      const data = await r.json()
      USERS.value = (data.items ?? data).map(u => ({ id: u.id, name: userName(u), initials: userInitials(u) }))
    }
  } catch {}
}
const loadProjects = async () => {
  if (projectOptions.value.length) return
  try {
    const r = await fetch('/apiref/ref/objects', { credentials: 'include' })
    if (r.ok) { const d = await r.json(); (d.items ?? d).forEach(o => projectOptions.value.push({ id: o.id, name: o.short_name, type: 'object' })) }
  } catch {}
  try {
    const r = await fetch('/apisup/supply/request-objects/my', { credentials: 'include' })
    if (r.ok) { const d = await r.json(); (d.items ?? d).forEach(o => projectOptions.value.push({ id: o.id, name: o.name, type: 'project' })) }
  } catch {}
}

// ─── Форма ────────────────────────────────────────────────────────────────────
const emptyForm = () => ({
  title: '', priority: null, description: '',
  assigneeId: null, coexecutorIds: [], observerIds: [],
  projectId: null, startDate: '', deadline: '',
  files: [], subtasks: [], tags: [],
})
const createForm = ref(emptyForm())

const selectedAssignee = computed(() => USERS.value.find(u => u.id === createForm.value.assigneeId) || null)
const selectedCoexecutors = computed(() => USERS.value.filter(u => createForm.value.coexecutorIds.includes(u.id)))
const selectedObservers = computed(() => USERS.value.filter(u => createForm.value.observerIds.includes(u.id)))
const selectedProject = computed(() => projectOptions.value.find(p => p.id === createForm.value.projectId) || null)

// ─── Dropdowns ────────────────────────────────────────────────────────────────
const ddAssignee = ref(false)
const ddCoexecutors = ref(false)
const ddObservers = ref(false)
const ddProject = ref(false)
const ddPriority = ref(false)
const searchAssignee = ref('')
const searchCoexecutors = ref('')
const searchObservers = ref('')
const searchProject = ref('')
const ddRects = reactive({})

const closeAllDropdowns = () => {
  ddAssignee.value = false; ddCoexecutors.value = false
  ddObservers.value = false; ddProject.value = false; ddPriority.value = false
}
const openDDField = (name, event) => {
  closeAllDropdowns(); calOpen.value = false
  const r = event.currentTarget.getBoundingClientRect()
  ddRects[name] = { top: r.bottom + 2, left: r.left, width: Math.max(r.width, 220) }
  if (name === 'assignee') ddAssignee.value = true
  else if (name === 'coexecutors') ddCoexecutors.value = true
  else if (name === 'observers') ddObservers.value = true
  else if (name === 'project') ddProject.value = true
}
const ddFixedStyle = (name) => {
  const r = ddRects[name]; if (!r) return {}
  return { position: 'fixed', top: r.top + 'px', left: r.left + 'px', minWidth: r.width + 'px', zIndex: 9999 }
}
const filteredUsers = (q) => USERS.value.filter(u => u.name.toLowerCase().includes((q || '').toLowerCase()))
const filteredProjects = computed(() => projectOptions.value.filter(p => p.name.toLowerCase().includes(searchProject.value.toLowerCase())))
const toggleCoexecutor = (id) => {
  const a = createForm.value.coexecutorIds; const i = a.indexOf(id)
  i === -1 ? a.push(id) : a.splice(i, 1)
}
const toggleObserver = (id) => {
  const a = createForm.value.observerIds; const i = a.indexOf(id)
  i === -1 ? a.push(id) : a.splice(i, 1)
}

// ─── Теги ─────────────────────────────────────────────────────────────────────
const tagInput = ref('')
const tagInputFocused = ref(false)
const tagSuggestions = computed(() => {
  const q = tagInput.value.trim().toLowerCase()
  return q ? [] : []
})
const addTag = (val) => {
  const t = (val ?? tagInput.value).trim().replace(/^#+/, '')
  if (t && !createForm.value.tags.includes(t)) createForm.value.tags.push(t)
  tagInput.value = ''
}
const removeTag = (i) => createForm.value.tags.splice(i, 1)
const onTagKeydown = (e) => {
  if (e.key === 'Enter' || e.key === ',' || e.key === ' ') { e.preventDefault(); addTag() }
  else if (e.key === 'Backspace' && !tagInput.value) removeTag(createForm.value.tags.length - 1)
  else if (e.key === 'Escape') { tagInput.value = ''; tagInputFocused.value = false }
}
const onTagInput = () => {
  const val = tagInput.value
  const secondHash = val.indexOf('#', 1)
  if (secondHash > 0) { addTag(val.slice(0, secondHash)); tagInput.value = val.slice(secondHash) }
}

// ─── Календарь ────────────────────────────────────────────────────────────────
const calOpen = ref(false)
const calField = ref('deadline')
const calView = ref('date')
const calYear = ref(new Date().getFullYear())
const calMonth = ref(new Date().getMonth())
const calAnchor = ref(null)

const toInputDate = (d) => {
  const p = n => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
const getFieldDate = () => {
  const v = createForm.value[calField.value]
  return v ? new Date(v) : null
}
const setCalValue = (val) => { createForm.value[calField.value] = val }
const formatCalDate = (val) => {
  if (!val) return ''
  const d = new Date(val); const p = n => n.toString().padStart(2, '0')
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}`
}
const openCal = (field, event) => {
  calField.value = field; calView.value = 'date'
  const d = createForm.value[field] ? new Date(createForm.value[field]) : new Date()
  calYear.value = d.getFullYear(); calMonth.value = d.getMonth()
  calAnchor.value = event.currentTarget.getBoundingClientRect()
  calOpen.value = true; closeAllDropdowns()
}
const closeCal = () => { calOpen.value = false }
const calDropStyle = computed(() => {
  if (!calAnchor.value) return {}
  const left = Math.min(calAnchor.value.left, window.innerWidth - 534)
  return { position: 'fixed', top: (calAnchor.value.bottom + 6) + 'px', left: left + 'px', zIndex: 10001 }
})
const calDays = computed(() => {
  const y = calYear.value, m = calMonth.value
  const firstDow = new Date(y, m, 1).getDay()
  const offset = firstDow === 0 ? 6 : firstDow - 1
  const inMonth = new Date(y, m + 1, 0).getDate()
  const inPrev = new Date(y, m, 0).getDate()
  const cells = []
  for (let i = offset - 1; i >= 0; i--) cells.push({ d: inPrev - i, m: m === 0 ? 11 : m - 1, y: m === 0 ? y - 1 : y, out: true })
  for (let i = 1; i <= inMonth; i++) cells.push({ d: i, m, y, out: false })
  let nm = m === 11 ? 0 : m + 1, ny = m === 11 ? y + 1 : y, nd = 1
  while (cells.length < 42) cells.push({ d: nd++, m: nm, y: ny, out: true })
  return cells
})
const isCalSel = (cell) => {
  const d = getFieldDate(); if (!d) return false
  return !cell.out && cell.d === d.getDate() && cell.m === d.getMonth() && cell.y === d.getFullYear()
}
const isCalToday = (cell) => {
  const t = new Date()
  return !cell.out && cell.d === t.getDate() && cell.m === t.getMonth() && cell.y === t.getFullYear()
}
const getCellDow = (cell) => new Date(cell.y, cell.m, cell.d).getDay()
const selectCalDay = (cell) => {
  if (cell.out) { calYear.value = cell.y; calMonth.value = cell.m; return }
  const ex = getFieldDate()
  const nd = new Date(cell.y, cell.m, cell.d, ex?.getHours() ?? 19, ex?.getMinutes() ?? 0)
  setCalValue(toInputDate(nd)); calView.value = 'time'
}
const selectCalHour = (h) => { const d = getFieldDate() || new Date(); d.setHours(h); setCalValue(toInputDate(d)) }
const selectCalMinute = (m) => { const d = getFieldDate() || new Date(); d.setMinutes(m); setCalValue(toInputDate(d)) }
const calViewTitle = computed(() => {
  if (calView.value === 'time') {
    const d = getFieldDate(); if (!d) return ''
    const p = n => n.toString().padStart(2, '0')
    return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
  }
  return `${MONTH_RU[calMonth.value]}  ${calYear.value}`
})
const calTimeFmt = computed(() => {
  const d = getFieldDate(); if (!d) return '19:00'
  const p = n => n.toString().padStart(2, '0'); return `${p(d.getHours())}:${p(d.getMinutes())}`
})
const quickDates = computed(() => {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const dow = today.getDay()
  const toFri = dow === 5 ? 0 : (5 - dow + 7) % 7
  const endWeek = new Date(today); endWeek.setDate(today.getDate() + toFri)
  const nextWeek = new Date(today); nextWeek.setDate(today.getDate() + 7)
  const endMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  const fmt = d => `${DAYNAMES_RU[d.getDay()]}, ${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`
  return [
    { label: 'Сегодня', sub: fmt(today), date: today },
    { label: 'Завтра', sub: fmt(tomorrow), date: tomorrow },
    { label: 'В конце недели', sub: fmt(endWeek), date: endWeek },
    { label: 'Через неделю', sub: fmt(nextWeek), date: nextWeek },
    { label: 'В конце месяца', sub: fmt(endMonth), date: endMonth },
  ]
})
const applyQuickDate = (qd) => {
  const ex = getFieldDate()
  const d = new Date(qd.date); d.setHours(ex?.getHours() ?? 19, ex?.getMinutes() ?? 0)
  setCalValue(toInputDate(d)); calYear.value = d.getFullYear(); calMonth.value = d.getMonth()
}

// ─── Чек-лист ─────────────────────────────────────────────────────────────────
const showChecklistPanel = ref(false)
const clActiveItem = ref(null)
const clActivePopover = ref(null)
const clPopAnchor = ref(null)
const clEditingId = ref(null)
const clPopStyle = computed(() => {
  if (!clPopAnchor.value) return {}
  return { position: 'fixed', top: clPopAnchor.value.top + 'px', left: clPopAnchor.value.left + 'px', zIndex: 9999 }
})
const closeChecklist = () => {
  showChecklistPanel.value = false
  clActiveItem.value = null; clActivePopover.value = null; clEditingId.value = null; clPopAnchor.value = null
}
const addClItem = async () => {
  const newItem = { id: Date.now(), title: '', done: false, priority: null, coexecutorIds: [], observerIds: [] }
  createForm.value.subtasks.push(newItem)
  clEditingId.value = newItem.id; clActiveItem.value = newItem.id
  await nextTick()
  document.getElementById('ctm-cl-input-' + newItem.id)?.focus()
}
const onClItemBlur = (item, idx) => {
  if (!item.title.trim()) createForm.value.subtasks.splice(idx, 1)
  if (clEditingId.value === item.id) clEditingId.value = null
}
const onClItemEnter = async (item) => {
  if (!item.title.trim()) return
  clEditingId.value = null; await addClItem()
}
const removeSubtask = (idx) => createForm.value.subtasks.splice(idx, 1)
const toggleClPopover = (itemId, popover, event) => {
  if (clActiveItem.value === itemId && clActivePopover.value === popover) {
    clActiveItem.value = null; clActivePopover.value = null; clPopAnchor.value = null
  } else {
    clActiveItem.value = itemId; clActivePopover.value = popover
    if (event) { const r = event.currentTarget.getBoundingClientRect(); clPopAnchor.value = { top: r.bottom + 4, left: r.left } }
  }
}
const setClPriority = (item, key) => {
  item.priority = item.priority === key ? null : key
  clActiveItem.value = null; clActivePopover.value = null; clPopAnchor.value = null
}
const toggleClCoexecutor = (item, uid) => { const i = item.coexecutorIds.indexOf(uid); i === -1 ? item.coexecutorIds.push(uid) : item.coexecutorIds.splice(i, 1) }
const toggleClObserver = (item, uid) => { const i = item.observerIds.indexOf(uid); i === -1 ? item.observerIds.push(uid) : item.observerIds.splice(i, 1) }

// ─── Файлы ────────────────────────────────────────────────────────────────────
const fileInput = ref(null)
const onFileInput = (e) => { createForm.value.files.push(...Array.from(e.target.files || [])); e.target.value = '' }
const removeFile = (idx) => createForm.value.files.splice(idx, 1)

// ─── Создание ─────────────────────────────────────────────────────────────────
const submitting = ref(false)
const submitError = ref('')
const closeModal = () => { emit('close') }

const submitCreateTask = async () => {
  if (!createForm.value.title.trim() || submitting.value) return
  submitting.value = true; submitError.value = ''
  try {
    const f = createForm.value
    const proj = projectOptions.value.find(p => p.id === f.projectId)
    const conn = props.connection
    const taskRes = await fetch('/apisup/supply/tasks', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: f.title,
        description: f.description || null,
        object_id: f.projectId || null,
        object_type: proj?.type === 'object' ? 'object_id' : (f.projectId ? 'object_levels_id' : null),
        urgent: f.priority && f.priority !== 'none' ? f.priority : null,
        date_start: f.startDate || null,
        date_end: f.deadline || null,
        status_id: DEFAULT_STATUS_ID,
        ...(conn?.type && conn?.id ? { connection_type: conn.type, connection_id: conn.id } : {}),
      }),
    })
    if (!taskRes.ok) throw new Error(await taskRes.text())
    const task = await taskRes.json()
    const taskId = task.id ?? task.data?.id

    if (f.assigneeId) {
      await fetch('/apisup/supply/task-user-roles', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task_id: taskId, task_item_id: null, user_id: f.assigneeId, role: 'responsible' }) })
    }
    for (const uid of f.coexecutorIds) {
      await fetch('/apisup/supply/task-user-roles', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task_id: taskId, task_item_id: null, user_id: uid, role: 'co-executor' }) })
    }
    for (const uid of f.observerIds) {
      await fetch('/apisup/supply/task-user-roles', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task_id: taskId, task_item_id: null, user_id: uid, role: 'observer' }) })
    }
    for (let i = 0; i < f.subtasks.length; i++) {
      const s = f.subtasks[i]; if (!s.title.trim()) continue
      await fetch('/apisup/supply/task-items', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task_id: taskId, num: i, name: s.title, urgent: s.priority && s.priority !== 'none' ? s.priority : null, date_start: null, date_end: null, status_id: DEFAULT_STATUS_ID }) })
    }
    for (const tag of f.tags) {
      await fetch('/apisup/supply/task-tags', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task_id: taskId, tag }) })
    }
    if (f.files.length) {
      const fd = new FormData(); fd.append('task_id', taskId); f.files.forEach(file => fd.append('files', file))
      await fetch('/apisup/supply/task-files', { method: 'POST', credentials: 'include', body: fd })
    }
    emit('created', { id: taskId })
    closeModal()
  } catch (e) {
    submitError.value = 'Не удалось создать задачу'
    console.error(e)
  } finally {
    submitting.value = false
  }
}

watch(() => props.open, (v) => {
  if (v) {
    createForm.value = emptyForm()
    submitError.value = ''
    showChecklistPanel.value = false
    closeAllDropdowns(); calOpen.value = false
    loadUsers(); loadProjects()
  }
})
onMounted(() => { if (props.open) { loadUsers(); loadProjects() } })
</script>

<template>
  <div v-if="open" class="modal-backdrop" @mousedown.self="closeModal" @click="closeAllDropdowns">
    <div class="bx-modal" @click.stop>
      <div class="bx-title-row">
        <input v-model="createForm.title" class="bx-title-input" placeholder="Название задачи" @click.stop />
        <div class="bx-priority-wrap" @click.stop>
          <button class="bx-icon-btn" :class="{ active: createForm.priority }"
            :style="createForm.priority && PRIORITIES[createForm.priority]?.color ? { color: PRIORITIES[createForm.priority].color } : {}"
            title="Приоритет" @click.stop="ddPriority = !ddPriority">
            <i class="fas fa-fire-flame-curved"></i>
          </button>
          <div v-if="ddPriority" class="bx-mini-dd" @click.stop>
            <template v-for="(p, key) in PRIORITIES" :key="key">
              <button v-if="p.icon" class="bx-mini-dd-item" :class="{ active: createForm.priority === key }"
                :style="createForm.priority === key ? { color: p.color } : {}"
                @click.stop="createForm.priority = createForm.priority === key ? null : key; ddPriority = false">
                <i class="fas" :class="p.icon" :style="{ color: p.color }"></i> {{ p.label }}
              </button>
            </template>
          </div>
        </div>
        <button class="bx-icon-btn" @click="closeModal"><i class="fas fa-xmark"></i></button>
      </div>

      <div class="bx-desc-row">
        <textarea v-model="createForm.description" class="bx-desc-input" placeholder="Описание" rows="2" @click.stop></textarea>
      </div>

      <div class="bx-divider"></div>

      <div class="bx-fields">
        <div class="bx-field" @click.stop>
          <span class="bx-field-label">Исполнитель</span>
          <div class="bx-field-value-wrap">
            <button class="bx-field-value" @click.stop="openDDField('assignee', $event)">
              <template v-if="selectedAssignee">
                <div class="mini-avatar mini-avatar--sm" :style="{ background: avatarColor(selectedAssignee.initials).bg, color: avatarColor(selectedAssignee.initials).color }">{{ selectedAssignee.initials }}</div>
                <span>{{ selectedAssignee.name }}</span>
              </template>
              <span v-else class="bx-field-empty">Не выбран</span>
            </button>
          </div>
        </div>

        <div class="bx-field" @click.stop>
          <span class="bx-field-label">Соисполнители</span>
          <div class="bx-field-value-wrap">
            <button class="bx-field-value" @click.stop="openDDField('coexecutors', $event)">
              <div v-if="selectedCoexecutors.length" class="dd-avatars">
                <div v-for="u in selectedCoexecutors.slice(0,4)" :key="u.id" class="mini-avatar mini-avatar--sm" :style="{ background: avatarColor(u.initials).bg, color: avatarColor(u.initials).color }">{{ u.initials }}</div>
                <span v-if="selectedCoexecutors.length > 4" class="dd-more">+{{ selectedCoexecutors.length - 4 }}</span>
              </div>
              <span v-else class="bx-field-empty">Не выбраны</span>
            </button>
          </div>
        </div>

        <div class="bx-field" @click.stop>
          <span class="bx-field-label">Наблюдатели</span>
          <div class="bx-field-value-wrap">
            <button class="bx-field-value" @click.stop="openDDField('observers', $event)">
              <div v-if="selectedObservers.length" class="dd-avatars">
                <div v-for="u in selectedObservers.slice(0,4)" :key="u.id" class="mini-avatar mini-avatar--sm" :style="{ background: avatarColor(u.initials).bg, color: avatarColor(u.initials).color }">{{ u.initials }}</div>
                <span v-if="selectedObservers.length > 4" class="dd-more">+{{ selectedObservers.length - 4 }}</span>
              </div>
              <span v-else class="bx-field-empty">Не выбраны</span>
            </button>
          </div>
        </div>

        <div class="bx-field" @click.stop>
          <span class="bx-field-label">Дата начала</span>
          <div class="bx-field-value-wrap">
            <button class="bx-field-value" @click.stop="openCal('startDate', $event)">
              <i class="fas fa-calendar-plus" style="color:var(--text-tertiary);font-size:13px"></i>
              <span v-if="createForm.startDate">{{ formatCalDate(createForm.startDate) }}</span>
              <span v-else class="bx-field-empty">Не задана</span>
            </button>
          </div>
        </div>

        <div class="bx-field" @click.stop>
          <span class="bx-field-label">Крайний срок</span>
          <div class="bx-field-value-wrap">
            <button class="bx-field-value" @click.stop="openCal('deadline', $event)">
              <i class="fas fa-calendar-days" style="color:var(--brand-primary);font-size:13px"></i>
              <span v-if="createForm.deadline">{{ formatCalDate(createForm.deadline) }}</span>
              <span v-else class="bx-field-empty">Не задан</span>
            </button>
          </div>
        </div>

        <div class="bx-field" @click.stop>
          <span class="bx-field-label">Проект</span>
          <div class="bx-field-value-wrap">
            <button class="bx-field-value" @click.stop="openDDField('project', $event)">
              <template v-if="selectedProject">
                <span class="bx-proj-badge" :class="selectedProject.type === 'object' ? 'bx-proj-badge--obj' : 'bx-proj-badge--proj'">{{ selectedProject.type === 'object' ? 'Объект' : 'Проект' }}</span>
                <span>{{ selectedProject.name }}</span>
              </template>
              <span v-else class="bx-field-empty">Не выбран</span>
            </button>
          </div>
        </div>

        <div class="bx-field" @click.stop>
          <span class="bx-field-label">Теги</span>
          <div class="bx-field-value-wrap bx-tags-wrap" style="position:relative">
            <span v-for="(tag, i) in createForm.tags" :key="tag" class="bx-tag">
              #{{ tag }}
              <button class="bx-tag-remove" @click.stop="removeTag(i)"><i class="fas fa-xmark"></i></button>
            </span>
            <input v-model="tagInput" class="bx-tag-input" :placeholder="createForm.tags.length ? '' : '#тег...'"
              @keydown="onTagKeydown" @input="onTagInput"
              @focus="tagInputFocused = true" @blur="addTag(); setTimeout(()=>{tagInputFocused=false},150)" @click.stop />
          </div>
        </div>
      </div>

      <!-- Teleported dropdowns -->
      <Teleport to="body">
        <div v-if="ddAssignee||ddCoexecutors||ddObservers||ddProject||calOpen||clActivePopover" class="dd-close-overlay" @mousedown="closeAllDropdowns();closeCal();clActiveItem=null;clActivePopover=null;clPopAnchor=null"></div>

        <div v-if="ddAssignee" class="dd-menu bx-dd-menu" :style="ddFixedStyle('assignee')" @click.stop>
          <input v-model="searchAssignee" class="dd-search" placeholder="Поиск..." autofocus />
          <div class="dd-list">
            <button v-for="u in filteredUsers(searchAssignee)" :key="u.id" class="dd-item" :class="{ active: createForm.assigneeId === u.id }"
              @click.stop="createForm.assigneeId = createForm.assigneeId === u.id ? null : u.id; ddAssignee=false">
              <div class="mini-avatar mini-avatar--sm" :style="{ background: avatarColor(u.initials).bg, color: avatarColor(u.initials).color }">{{ u.initials }}</div>
              <span>{{ u.name }}</span>
              <i v-if="createForm.assigneeId === u.id" class="fas fa-check check-mark"></i>
            </button>
          </div>
        </div>

        <div v-if="ddCoexecutors" class="dd-menu bx-dd-menu" :style="ddFixedStyle('coexecutors')" @click.stop>
          <input v-model="searchCoexecutors" class="dd-search" placeholder="Поиск..." autofocus />
          <div class="dd-list">
            <button v-for="u in filteredUsers(searchCoexecutors)" :key="u.id" class="dd-item" :class="{ active: createForm.coexecutorIds.includes(u.id) }" @click.stop="toggleCoexecutor(u.id)">
              <div class="mini-avatar mini-avatar--sm" :style="{ background: avatarColor(u.initials).bg, color: avatarColor(u.initials).color }">{{ u.initials }}</div>
              <span>{{ u.name }}</span>
              <i v-if="createForm.coexecutorIds.includes(u.id)" class="fas fa-check check-mark"></i>
            </button>
          </div>
        </div>

        <div v-if="ddObservers" class="dd-menu bx-dd-menu" :style="ddFixedStyle('observers')" @click.stop>
          <input v-model="searchObservers" class="dd-search" placeholder="Поиск..." autofocus />
          <div class="dd-list">
            <button v-for="u in filteredUsers(searchObservers)" :key="u.id" class="dd-item" :class="{ active: createForm.observerIds.includes(u.id) }" @click.stop="toggleObserver(u.id)">
              <div class="mini-avatar mini-avatar--sm" :style="{ background: avatarColor(u.initials).bg, color: avatarColor(u.initials).color }">{{ u.initials }}</div>
              <span>{{ u.name }}</span>
              <i v-if="createForm.observerIds.includes(u.id)" class="fas fa-check check-mark"></i>
            </button>
          </div>
        </div>

        <div v-if="ddProject" class="dd-menu bx-dd-menu" :style="ddFixedStyle('project')" @click.stop>
          <input v-model="searchProject" class="dd-search" placeholder="Поиск..." autofocus />
          <div class="dd-list">
            <button v-for="p in filteredProjects" :key="p.id" class="dd-item" :class="{ active: createForm.projectId === p.id }"
              @click.stop="createForm.projectId = createForm.projectId === p.id ? null : p.id; ddProject=false">
              <span class="bx-proj-badge" :class="p.type === 'object' ? 'bx-proj-badge--obj' : 'bx-proj-badge--proj'">{{ p.type === 'object' ? 'Объект' : 'Проект' }}</span>
              <span>{{ p.name }}</span>
              <i v-if="createForm.projectId === p.id" class="fas fa-check check-mark"></i>
            </button>
          </div>
        </div>

        <!-- CL popovers -->
        <div v-if="clActiveItem && clActivePopover === 'priority'" class="cl-pop cl-pop--priority" :style="clPopStyle" @click.stop>
          <template v-for="item in createForm.subtasks" :key="item.id">
            <template v-if="item.id === clActiveItem">
              <template v-for="(pv, pk) in PRIORITIES" :key="pk">
                <button v-if="pv.icon" class="cl-priority-item" :class="{ active: item.priority === pk }"
                  :style="item.priority === pk ? { background: pv.color + '18', color: pv.color } : {}"
                  @click.stop="setClPriority(item, pk)">
                  <i class="fas" :class="pv.icon" :style="{ color: pv.color }"></i> {{ pv.label }}
                </button>
              </template>
            </template>
          </template>
        </div>
        <div v-if="clActiveItem && clActivePopover === 'coexecutor'" class="cl-pop cl-pop--people" :style="clPopStyle" @click.stop>
          <template v-for="item in createForm.subtasks" :key="item.id">
            <template v-if="item.id === clActiveItem">
              <button v-for="u in USERS" :key="u.id" class="dd-item" :class="{ active: item.coexecutorIds.includes(u.id) }" @click.stop="toggleClCoexecutor(item, u.id)">
                <div class="mini-avatar mini-avatar--sm" :style="{ background: avatarColor(u.initials).bg, color: avatarColor(u.initials).color }">{{ u.initials }}</div>
                <span>{{ u.name }}</span>
                <i v-if="item.coexecutorIds.includes(u.id)" class="fas fa-check check-mark"></i>
              </button>
            </template>
          </template>
        </div>
        <div v-if="clActiveItem && clActivePopover === 'observer'" class="cl-pop cl-pop--people" :style="clPopStyle" @click.stop>
          <template v-for="item in createForm.subtasks" :key="item.id">
            <template v-if="item.id === clActiveItem">
              <button v-for="u in USERS" :key="u.id" class="dd-item" :class="{ active: item.observerIds.includes(u.id) }" @click.stop="toggleClObserver(item, u.id)">
                <div class="mini-avatar mini-avatar--sm" :style="{ background: avatarColor(u.initials).bg, color: avatarColor(u.initials).color }">{{ u.initials }}</div>
                <span>{{ u.name }}</span>
                <i v-if="item.observerIds.includes(u.id)" class="fas fa-check check-mark"></i>
              </button>
            </template>
          </template>
        </div>

        <!-- Calendar -->
        <div v-if="calOpen" class="cal-close-overlay" @mousedown="closeCal()"></div>
        <div v-if="calOpen" class="cal-dropdown" :style="calDropStyle" @click.stop>
          <div class="cal-left">
            <div v-if="calView === 'date'" class="cal-header">
              <button class="cal-nav" @click.stop="calMonth===0?(calMonth=11,calYear--):(calMonth--)"><i class="fas fa-chevron-left"></i></button>
              <span class="cal-month-label">{{ calViewTitle }}</span>
              <button class="cal-nav" @click.stop="calMonth===11?(calMonth=0,calYear++):(calMonth++)"><i class="fas fa-chevron-right"></i></button>
            </div>
            <div v-else class="cal-header">
              <button class="cal-nav" @click.stop="calView='date'"><i class="fas fa-arrow-left"></i></button>
              <span class="cal-month-label">{{ calViewTitle }}</span>
            </div>
            <template v-if="calView === 'date'">
              <div class="cal-dow-row"><span v-for="d in ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']" :key="d" class="cal-dow">{{ d }}</span></div>
              <div class="cal-grid">
                <button v-for="(cell, i) in calDays" :key="i" class="cal-day"
                  :class="{ 'cal-day--out': cell.out, 'cal-day--today': isCalToday(cell), 'cal-day--sel': isCalSel(cell), 'cal-day--we': getCellDow(cell)===0||getCellDow(cell)===6 }"
                  @click.stop="selectCalDay(cell)">{{ cell.d }}</button>
              </div>
              <div class="cal-time-row" @click.stop="calView='time'">
                <i class="far fa-clock" style="font-size:12px;color:var(--text-tertiary)"></i>
                <span>{{ calTimeFmt }}</span>
              </div>
            </template>
            <template v-else>
              <div class="cal-time-pickers">
                <div class="cal-picker-col">
                  <div class="cal-picker-label">Часы</div>
                  <div class="cal-hours-grid">
                    <button v-for="h in Array.from({length:24},(_,i)=>i)" :key="h" class="cal-time-btn" :class="{ 'cal-time-btn--sel': getFieldDate()?.getHours()===h }" @click.stop="selectCalHour(h)">{{ h.toString().padStart(2,'0') }}</button>
                  </div>
                </div>
                <div class="cal-picker-divider"></div>
                <div class="cal-picker-col">
                  <div class="cal-picker-label">Минуты</div>
                  <div class="cal-mins-grid">
                    <button v-for="m in [0,5,10,15,20,25,30,35,40,45,50,55]" :key="m" class="cal-time-btn" :class="{ 'cal-time-btn--sel': getFieldDate()?.getMinutes()===m }" @click.stop="selectCalMinute(m)">{{ m.toString().padStart(2,'0') }}</button>
                  </div>
                </div>
              </div>
              <button class="cal-apply-btn" @click.stop="closeCal()">Применить</button>
            </template>
          </div>
          <div class="cal-right">
            <div class="cal-quick-title">Быстрый выбор</div>
            <button v-for="qd in quickDates" :key="qd.label" class="cal-quick-btn" @click.stop="applyQuickDate(qd); calView='time'">
              <span class="cal-quick-label">{{ qd.label }}</span>
              <span class="cal-quick-sub">{{ qd.sub }}</span>
            </button>
          </div>
        </div>
      </Teleport>

      <div class="bx-divider"></div>

      <div class="bx-attach-bar">
        <button class="bx-attach-pill" @click.stop="fileInput.click()">
          <i class="fas fa-paperclip"></i> Файлы
          <span v-if="createForm.files.length" class="bx-pill-badge">{{ createForm.files.length }}</span>
        </button>
        <input ref="fileInput" type="file" multiple style="display:none" @change="onFileInput" />
        <button class="bx-attach-pill" :class="{ active: showChecklistPanel }" @click.stop="showChecklistPanel = true">
          <i class="fas fa-list-check"></i> Чек-листы
          <span v-if="createForm.subtasks.length" class="bx-pill-badge">{{ createForm.subtasks.length }}</span>
        </button>
      </div>

      <div v-if="createForm.files.length" class="file-list" style="padding: 0 22px 10px">
        <div v-for="(f, i) in createForm.files" :key="i" class="file-item">
          <i class="fas fa-file"></i><span>{{ f.name }}</span>
          <button class="file-remove" @click="removeFile(i)"><i class="fas fa-xmark"></i></button>
        </div>
      </div>

      <div class="bx-footer">
        <span v-if="submitError" class="bx-submit-error">{{ submitError }}</span>
        <button class="btn btn-primary" :disabled="!createForm.title.trim() || submitting" @click="submitCreateTask">
          <i v-if="submitting" class="fas fa-spinner fa-spin" style="margin-right:6px"></i>
          {{ submitting ? 'Создание...' : 'Создать' }}
        </button>
        <button class="bx-cancel-btn" :disabled="submitting" @click="closeModal">Отмена</button>
      </div>

      <!-- Checklist panel -->
      <transition name="cl-slide">
        <div v-if="showChecklistPanel" class="cl-panel" @click.stop>
          <div class="cl-card-header">
            <i class="fas fa-list-check" style="color:var(--brand-primary);font-size:14px"></i>
            <span class="cl-card-title">Чек-лист 1</span>
            <span v-if="createForm.subtasks.length" class="cl-card-progress">{{ createForm.subtasks.filter(s=>s.done).length }}/{{ createForm.subtasks.length }} выполнено</span>
            <div class="cl-card-header-actions"><button class="bx-icon-btn" @click.stop="closeChecklist"><i class="fas fa-xmark"></i></button></div>
          </div>
          <div class="cl-progress-bar">
            <div class="cl-progress-fill" :style="{ width: createForm.subtasks.length ? (createForm.subtasks.filter(s=>s.done).length / createForm.subtasks.length * 100) + '%' : '0%' }"></div>
          </div>
          <div class="cl-items-list">
            <div v-for="(item, idx) in createForm.subtasks" :key="item.id" class="cl-row" :class="{ 'cl-row--active': clActiveItem === item.id || clEditingId === item.id }"
              @mouseenter="clActiveItem = item.id" @mouseleave="clEditingId !== item.id && !clActivePopover ? clActiveItem = null : null">
              <div v-show="clActiveItem === item.id || clEditingId === item.id" class="cl-row-toolbar" @click.stop>
                <button class="cl-tool-btn" :style="item.priority && PRIORITIES[item.priority]?.color ? { color: PRIORITIES[item.priority].color } : {}" @mousedown.prevent @click.stop="toggleClPopover(item.id, 'priority', $event)"><i class="fas fa-fire-flame-curved"></i></button>
                <div class="cl-tool-sep"></div>
                <button class="cl-tool-btn" :class="{ active: item.coexecutorIds.length }" @mousedown.prevent @click.stop="toggleClPopover(item.id, 'coexecutor', $event)"><i class="fas fa-user"></i><span v-if="item.coexecutorIds.length" class="cl-action-badge">{{ item.coexecutorIds.length }}</span></button>
                <button class="cl-tool-btn" :class="{ active: item.observerIds.length }" @mousedown.prevent @click.stop="toggleClPopover(item.id, 'observer', $event)"><i class="fas fa-eye"></i><span v-if="item.observerIds.length" class="cl-action-badge">{{ item.observerIds.length }}</span></button>
                <div class="cl-tool-sep"></div>
                <button class="cl-tool-btn cl-tool-btn--danger" @mousedown.prevent @click.stop="removeSubtask(idx)"><i class="fas fa-trash"></i></button>
              </div>
              <input type="checkbox" v-model="item.done" class="cl-checkbox" @click.stop />
              <template v-if="clEditingId === item.id">
                <textarea :id="'ctm-cl-input-' + item.id" v-model="item.title" class="cl-row-edit-input" placeholder="Название пункта..." rows="1"
                  @blur="onClItemBlur(item, idx)" @keydown.enter.prevent="onClItemEnter(item)"
                  @input="$event.target.style.height='auto';$event.target.style.height=$event.target.scrollHeight+'px'" @click.stop></textarea>
              </template>
              <template v-else>
                <span class="cl-row-text" :class="{ done: item.done }" @click="clEditingId = item.id; clActiveItem = item.id">{{ item.title }}</span>
              </template>
              <i v-if="item.priority && PRIORITIES[item.priority]?.icon" class="fas cl-prio-dot" :class="PRIORITIES[item.priority].icon" :style="{ color: PRIORITIES[item.priority].color }"></i>
            </div>
            <button class="cl-add-btn" @click.stop="addClItem"><i class="fas fa-plus cl-add-icon"></i><span>Добавить пункт</span></button>
          </div>
          <div class="cl-card-footer"><button class="btn btn-primary" @click="closeChecklist">Сохранить</button></div>
        </div>
      </transition>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed; inset: 0; background: rgba(15,23,42,0.4);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center; z-index: 200; padding: 24px;
}
.mini-avatar {
  width: 28px; height: 28px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700; flex-shrink: 0;
}
.mini-avatar--sm { width: 24px; height: 24px; font-size: 10px; }

.bx-modal { background: var(--bg-surface); border-radius: 16px; box-shadow: 0 24px 80px rgba(15,23,42,0.22); width: 100%; max-width: 560px; max-height: 90vh; overflow: hidden; display: flex; flex-direction: column; position: relative; }
.bx-title-row { display: flex; align-items: center; gap: 8px; padding: 22px 22px 0; }
.bx-title-input { flex: 1; border: none; outline: none; background: none; font-size: 22px; font-weight: 600; color: var(--text-primary); font-family: inherit; caret-color: var(--brand-primary); }
.bx-title-input::placeholder { color: var(--text-tertiary); }
.bx-desc-row { padding: 8px 22px 14px; }
.bx-desc-input { width: 100%; border: none; outline: none; background: none; resize: none; font-size: 14px; color: var(--text-secondary); font-family: inherit; line-height: 1.5; }
.bx-desc-input::placeholder { color: var(--text-tertiary); }
.bx-divider { height: 1px; background: var(--border-light); margin: 0; }
.bx-icon-btn { width: 32px; height: 32px; flex-shrink: 0; border: none; background: none; cursor: pointer; border-radius: var(--radius-sm); color: var(--text-tertiary); display: flex; align-items: center; justify-content: center; font-size: 15px; transition: all 0.15s; }
.bx-icon-btn:hover { background: var(--bg-subtle); color: var(--text-primary); }
.bx-icon-btn.active { color: var(--brand-primary); }
.bx-priority-wrap { position: relative; }
.bx-mini-dd { position: absolute; right: 0; top: calc(100% + 4px); z-index: 300; background: var(--bg-surface); border: 1px solid var(--border-light); border-radius: var(--radius-md); box-shadow: var(--shadow-md); min-width: 160px; overflow: hidden; }
.bx-mini-dd-item { width: 100%; display: flex; align-items: center; gap: 8px; padding: 8px 12px; border: none; background: none; cursor: pointer; font-size: 13px; color: var(--text-primary); text-align: left; transition: background 0.12s; }
.bx-mini-dd-item:hover { background: var(--bg-subtle); }
.bx-mini-dd-item.active { font-weight: 600; background: var(--brand-light); }
.bx-fields { display: flex; flex-direction: column; }
.bx-field { display: flex; align-items: center; min-height: 44px; padding: 0 22px; border-bottom: 1px solid var(--border-light); }
.bx-field:last-child { border-bottom: none; }
.bx-field-label { width: 130px; flex-shrink: 0; font-size: 13px; color: var(--text-tertiary); }
.bx-field-value-wrap { flex: 1; position: relative; }
.bx-field-value { display: flex; align-items: center; gap: 7px; padding: 10px 0; width: 100%; border: none; background: none; cursor: pointer; font-size: 13px; color: var(--text-primary); text-align: left; transition: color 0.12s; }
.bx-field-value:hover { color: var(--brand-primary); }
.bx-field-empty { color: var(--text-tertiary); }
.bx-tags-wrap { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; padding: 6px 0; min-height: 32px; }
.bx-tag { display: inline-flex; align-items: center; gap: 4px; background: rgba(99,102,241,0.10); border: 1px solid rgba(99,102,241,0.25); border-radius: 6px; padding: 2px 6px 2px 8px; font-size: 12px; color: var(--brand-primary); user-select: none; }
.bx-tag-remove { border: none; background: none; cursor: pointer; padding: 0; color: var(--brand-primary); font-size: 10px; line-height: 1; display: flex; align-items: center; opacity: 0.5; }
.bx-tag-input { border: none; outline: none; background: none; font-size: 13px; color: var(--text-primary); font-family: inherit; min-width: 100px; flex: 1; }
.bx-tag-input::placeholder { color: var(--text-tertiary); }
.bx-proj-badge { display: inline-block; font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 4px; flex-shrink: 0; text-transform: uppercase; letter-spacing: 0.3px; }
.bx-proj-badge--obj { background: #dbeafe; color: #1d4ed8; }
.bx-proj-badge--proj { background: #dcfce7; color: #15803d; }
.bx-submit-error { font-size: 12px; color: #ef4444; flex: 1; }
.dd-avatars { display: flex; align-items: center; gap: 3px; }
.dd-more { font-size: 11px; color: var(--text-tertiary); margin-left: 2px; }
.bx-attach-bar { display: flex; gap: 8px; padding: 12px 22px; }
.bx-attach-pill { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 20px; border: 1.5px solid var(--border-light); background: var(--bg-surface); color: var(--text-secondary); font-size: 13px; cursor: pointer; transition: all 0.15s; position: relative; }
.bx-attach-pill:hover { border-color: var(--brand-primary); color: var(--brand-primary); }
.bx-attach-pill.active { border-color: var(--brand-primary); background: var(--brand-light); color: var(--brand-primary); }
.bx-pill-badge { display: inline-flex; align-items: center; justify-content: center; background: var(--brand-primary); color: #fff; font-size: 10px; font-weight: 700; width: 16px; height: 16px; border-radius: 50%; }
.file-list { display: flex; flex-direction: column; gap: 4px; }
.file-item { display: flex; align-items: center; gap: 8px; padding: 5px 10px; border: 1px solid var(--border-light); border-radius: var(--radius-sm); background: var(--bg-subtle); font-size: 12px; color: var(--text-primary); }
.file-item i:first-child { color: var(--text-tertiary); }
.file-item span { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.file-remove { width: 20px; height: 20px; border: none; border-radius: 4px; background: transparent; color: var(--text-tertiary); cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 11px; flex-shrink: 0; }
.file-remove:hover { background: #fef2f2; color: #ef4444; }
.bx-footer { display: flex; align-items: center; gap: 16px; padding: 16px 22px 20px; }
.bx-cancel-btn { border: none; background: none; cursor: pointer; font-size: 14px; color: var(--text-secondary); font-family: inherit; }
.bx-cancel-btn:hover { color: var(--text-primary); }
.btn-primary { background: var(--brand-primary); color: #fff; border: none; padding: 9px 20px; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; }
.btn-primary:disabled { opacity: 0.6; cursor: default; }

/* Checklist panel */
.cl-panel { position: absolute; bottom: 0; left: 0; right: 0; height: 92%; background: var(--bg-surface); border-radius: 14px 14px 16px 16px; box-shadow: 0 -8px 32px rgba(15,23,42,0.14); border-top: 1px solid var(--border-light); display: flex; flex-direction: column; z-index: 10; overflow: hidden; }
.cl-slide-enter-active { transition: transform 0.28s cubic-bezier(0.32,0.72,0,1); }
.cl-slide-leave-active { transition: transform 0.2s ease-in; }
.cl-slide-enter-from, .cl-slide-leave-to { transform: translateY(100%); }
.cl-card-header { display: flex; align-items: center; gap: 8px; padding: 14px 18px 8px; flex-shrink: 0; }
.cl-card-title { font-size: 15px; font-weight: 600; color: var(--text-primary); }
.cl-card-progress { font-size: 12px; color: var(--text-tertiary); }
.cl-card-header-actions { display: flex; align-items: center; gap: 2px; margin-left: auto; }
.cl-progress-bar { height: 3px; background: var(--bg-subtle); margin: 0 18px 2px; border-radius: 2px; overflow: hidden; flex-shrink: 0; }
.cl-progress-fill { height: 100%; background: var(--brand-primary); border-radius: 2px; transition: width 0.3s ease; }
.cl-items-list { flex: 1; overflow-y: auto; border-top: 1px solid var(--border-light); padding-top: 18px; }
.cl-row { display: flex; align-items: flex-start; gap: 10px; padding: 10px 18px; border-bottom: 1px solid var(--border-light); position: relative; }
.cl-row-toolbar { position: absolute; top: -14px; right: 14px; display: flex; align-items: center; background: var(--bg-surface); border: 1px solid var(--border-light); border-radius: 10px; padding: 2px 4px; box-shadow: 0 4px 16px rgba(15,23,42,0.10); z-index: 20; }
.cl-checkbox { width: 16px; height: 16px; flex-shrink: 0; cursor: pointer; accent-color: var(--brand-primary); margin-top: 2px; }
.cl-row-text { flex: 1; font-size: 14px; color: var(--text-primary); line-height: 1.5; cursor: text; word-break: break-word; white-space: pre-wrap; min-width: 0; }
.cl-row-text.done { text-decoration: line-through; color: var(--text-tertiary); }
.cl-row-edit-input { flex: 1; border: none; outline: none; background: none; font-size: 14px; color: var(--text-primary); font-family: inherit; line-height: 1.5; min-width: 0; padding: 0; word-break: break-word; resize: none; overflow: hidden; white-space: pre-wrap; }
.cl-prio-dot { font-size: 11px; flex-shrink: 0; margin-top: 3px; }
.cl-tool-btn { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border: none; background: none; cursor: pointer; border-radius: 6px; font-size: 12px; color: var(--text-tertiary); position: relative; }
.cl-tool-btn:hover { color: var(--text-primary); }
.cl-tool-btn.active { color: var(--brand-primary); }
.cl-tool-btn--danger:hover { color: #ef4444; }
.cl-tool-sep { width: 1px; height: 16px; background: var(--border-light); margin: 0 2px; flex-shrink: 0; }
.cl-add-btn { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 18px; border: none; background: none; cursor: pointer; font-size: 14px; color: var(--text-tertiary); font-family: inherit; text-align: left; }
.cl-add-btn:hover { color: var(--brand-primary); }
.cl-add-icon { font-size: 11px; width: 16px; text-align: center; flex-shrink: 0; }
.cl-card-footer { display: flex; align-items: center; justify-content: flex-end; padding: 12px 18px; border-top: 1px solid var(--border-light); flex-shrink: 0; }
.cl-action-badge { position: absolute; top: -3px; right: -3px; background: var(--brand-primary); color: #fff; font-size: 9px; font-weight: 700; padding: 0 3px; border-radius: 6px; min-width: 14px; text-align: center; }

/* Teleported: overlays, dropdowns, calendar, popovers */
.dd-close-overlay { position: fixed; inset: 0; z-index: 9998; }
.cal-close-overlay { position: fixed; inset: 0; z-index: 10000; }
.dd-menu { background: var(--bg-surface); border: 1px solid var(--border-light); border-radius: var(--radius-md); box-shadow: var(--shadow-md); overflow: hidden; }
.bx-dd-menu { min-width: 220px; max-width: 320px; width: max-content; }
.dd-search { width: 100%; padding: 8px 12px; border: none; border-bottom: 1px solid var(--border-light); background: var(--bg-subtle); font-size: 13px; outline: none; color: var(--text-primary); box-sizing: border-box; }
.dd-list { max-height: 200px; overflow-y: auto; }
.dd-item { width: 100%; display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: none; border: none; cursor: pointer; font-size: 13px; color: var(--text-primary); text-align: left; transition: background 0.12s; }
.dd-item:hover { background: var(--bg-subtle); }
.dd-item.active { background: var(--brand-light); }
.check-mark { margin-left: auto; color: var(--brand-primary); font-size: 11px; }
.mini-avatar { width: 28px; height: 28px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; flex-shrink: 0; }
.mini-avatar--sm { width: 24px; height: 24px; font-size: 10px; }
.bx-proj-badge { display: inline-block; font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 4px; flex-shrink: 0; text-transform: uppercase; letter-spacing: 0.3px; }
.bx-proj-badge--obj { background: #dbeafe; color: #1d4ed8; }
.bx-proj-badge--proj { background: #dcfce7; color: #15803d; }

.cal-dropdown { background: var(--bg-surface); border: 1px solid var(--border-light); border-radius: 16px; box-shadow: 0 12px 48px rgba(15,23,42,0.18); display: flex; overflow: hidden; min-width: 500px; }
.cal-left { flex: 1; padding: 16px 16px 12px; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
.cal-right { width: 196px; flex-shrink: 0; border-left: 1px solid var(--border-light); padding: 12px 10px; display: flex; flex-direction: column; gap: 2px; }
.cal-header { display: flex; align-items: center; justify-content: space-between; }
.cal-nav { width: 30px; height: 30px; border: none; background: none; cursor: pointer; border-radius: 8px; color: var(--text-secondary); font-size: 12px; display: flex; align-items: center; justify-content: center; }
.cal-nav:hover { background: var(--bg-subtle); color: var(--text-primary); }
.cal-month-label { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.cal-dow-row { display: grid; grid-template-columns: repeat(7, 1fr); }
.cal-dow { text-align: center; font-size: 11px; font-weight: 500; color: var(--text-tertiary); padding: 4px 0; }
.cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.cal-day { aspect-ratio: 1; display: flex; align-items: center; justify-content: center; border: none; background: none; cursor: pointer; border-radius: 50%; font-size: 13px; color: var(--text-primary); }
.cal-day:hover:not(.cal-day--sel) { background: var(--bg-subtle); }
.cal-day--out { color: var(--text-tertiary); }
.cal-day--today { font-weight: 700; color: var(--brand-primary); }
.cal-day--sel { background: var(--brand-primary) !important; color: #fff !important; font-weight: 600; }
.cal-day--we:not(.cal-day--out):not(.cal-day--sel) { color: #ef4444; }
.cal-time-row { display: flex; align-items: center; gap: 6px; padding: 6px 2px; cursor: pointer; border-top: 1px solid var(--border-light); font-size: 13px; color: var(--text-secondary); }
.cal-time-row:hover { color: var(--brand-primary); }
.cal-time-pickers { display: flex; flex: 1; }
.cal-picker-col { flex: 1; display: flex; flex-direction: column; gap: 6px; }
.cal-picker-label { font-size: 11px; font-weight: 600; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.5px; }
.cal-picker-divider { width: 1px; background: var(--border-light); margin: 0 10px; }
.cal-hours-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3px; }
.cal-mins-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 3px; }
.cal-time-btn { padding: 5px 2px; border: none; background: none; cursor: pointer; border-radius: 6px; font-size: 13px; color: var(--text-secondary); text-align: center; }
.cal-time-btn:hover { background: var(--bg-subtle); color: var(--text-primary); }
.cal-time-btn--sel { background: var(--brand-primary) !important; color: #fff !important; font-weight: 600; }
.cal-apply-btn { margin-top: 10px; padding: 8px; border: none; background: var(--brand-primary); color: #fff; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; width: 100%; }
.cal-quick-title { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-tertiary); padding: 0 4px 8px; }
.cal-quick-btn { width: 100%; display: flex; flex-direction: column; align-items: flex-start; gap: 1px; padding: 8px 10px; border: none; background: none; cursor: pointer; border-radius: 8px; text-align: left; }
.cal-quick-btn:hover { background: var(--bg-subtle); }
.cal-quick-label { font-size: 13px; color: var(--text-primary); font-weight: 500; }
.cal-quick-sub { font-size: 11px; color: var(--text-tertiary); }

.cl-pop { background: var(--bg-surface); border: 1px solid var(--border-light); border-radius: var(--radius-md); box-shadow: 0 8px 30px rgba(15,23,42,0.15); overflow: hidden; }
.cl-pop--priority { min-width: 158px; }
.cl-pop--people { min-width: 200px; }
.cl-priority-item { width: 100%; display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: none; border: none; cursor: pointer; font-size: 13px; color: var(--text-primary); text-align: left; }
.cl-priority-item:hover { background: var(--bg-subtle); }
.cl-priority-item.active { font-weight: 600; }
</style>
