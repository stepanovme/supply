<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useChatStore } from '../stores/chat'

const props = defineProps({
  open: { type: Boolean, default: false },
  taskId: { type: [String, Number], default: null },
})
const emit = defineEmits(['close', 'updated'])

const authStore = useAuthStore()
const chatStore = useChatStore()

const DEFAULT_STATUS_ID = 'e0896c9d-7646-11f1-b481-bc241127d0bd'
const COMPLETED_STATUS_ID = '1ff32c4b-1312-11f1-aa8c-bc241127d0bd'
const IN_PROGRESS_STATUS_ID = '6b4fbf85-7901-11f1-b481-bc241127d0bd'
const PAUSED_STATUS_ID = '1390dadd-7903-11f1-b481-bc241127d0bd'
const DONE_ITEM_STATUS_ID = '1d9a6ecf-77a5-11f1-b481-bc241127d0bd'

const AVATAR_COLORS = [
  { bg: '#dbeafe', color: '#1d4ed8' }, { bg: '#dcfce7', color: '#15803d' }, { bg: '#fef9c3', color: '#a16207' },
  { bg: '#ede9fe', color: '#6d28d9' }, { bg: '#ffedd5', color: '#c2410c' }, { bg: '#e0f2fe', color: '#0369a1' },
]
const avatarColor = (initials) => { const s = initials || '?'; return AVATAR_COLORS[(s.charCodeAt(0) + (s.charCodeAt(1) || 0)) % AVATAR_COLORS.length] }
const PRIORITIES = {
  none: { label: 'Без приоритета', color: null, icon: null },
  low: { label: 'Низкий', color: '#22c55e', icon: 'fa-fire-flame-curved' },
  medium: { label: 'Средний', color: '#f59e0b', icon: 'fa-fire-flame-curved' },
  high: { label: 'Высокий', color: '#ef4444', icon: 'fa-fire-flame-curved' },
  frozen: { label: 'Заморожен', color: '#6366f1', icon: 'fa-snowflake' },
}
const userInit = (u) => `${(u?.surname?.[0] || '').toUpperCase()}${(u?.name?.[0] || '').toUpperCase()}` || '?'

const parseApiDate = (s) => {
  if (!s) return null
  const m = String(s).match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})/)
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5])
  const d = new Date(s); return isNaN(d) ? null : d
}
const toInputDate = (d) => { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}` }
const fmtDate = (s) => { const d = parseApiDate(s); if (!d) return '—'; const p = n => String(n).padStart(2, '0'); return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}` }

const USERS = ref([])
const loadUsers = async () => {
  if (USERS.value.length) return
  try { const r = await fetch('/api/as/users/all', { credentials: 'include' }); if (r.ok) { const d = await r.json(); USERS.value = (d.items ?? d).map(u => ({ id: u.id, name: [u.surname, u.name, u.patronymic].filter(Boolean).join(' '), initials: userInit(u) })) } } catch {}
}

const task = ref(null)
const loading = ref(false)

const mapTask = (t) => {
  const roles = t.user_roles || []
  const responsible = roles.find(r => r.role === 'responsible')
  return {
    id: t.id,
    title: t.name,
    description: t.description || '',
    priority: t.urgent || 'none',
    status: t.status_name || '',
    statusId: t.status_id || null,
    dateCompleted: t.date_completed || null,
    startDate: t.date_start ? toInputDate(parseApiDate(t.date_start)) : '',
    deadline: t.date_end ? toInputDate(parseApiDate(t.date_end)) : '',
    project: t.object_name || '',
    createdAt: t.created_at || '',
    createdBy: t.created_by,
    assigner: t.created_by_user ? { name: t.created_by_user.short_fio, initials: userInit(t.created_by_user) } : { name: '—', initials: '—' },
    assignee: responsible?.user ? { name: responsible.user.short_fio, initials: userInit(responsible.user), id: responsible.user_id } : { name: '—', initials: '—' },
    assigneeRoleId: responsible?.id ?? null,
    coexecutors: roles.filter(r => r.role === 'co-executor').map(r => ({ id: r.user_id, roleId: r.id, name: r.user?.short_fio ?? '?', initials: r.user ? userInit(r.user) : '?' })),
    observers: roles.filter(r => r.role === 'observer').map(r => ({ id: r.user_id, roleId: r.id, name: r.user?.short_fio ?? '?', initials: r.user ? userInit(r.user) : '?' })),
    rawUserRoles: roles,
    subtasks: (t.items ?? []).map(s => ({ id: s.id, title: s.name, done: s.status_id !== DEFAULT_STATUS_ID })),
    tags: (t.tags ?? []).map(tg => tg.tag),
    rawTags: (t.tags ?? []).map(tg => ({ id: tg.id, tag: tg.tag })),
    files: (t.files ?? []).map(f => ({ id: f.id, name: f.original_name, ext: f.extension })),
    results: (t.results ?? []).map(r => ({ id: r.id, text: r.text || '', createdBy: r.created_by, createdAt: r.created_at })),
    connectionType: t.connection_type || null,
    connectionName: t.connection_name || null,
    chatId: t.chat_id || null,
  }
}

const loadTask = async () => {
  if (!props.taskId) return
  loading.value = true
  try {
    const r = await fetch(`/apisup/supply/tasks/${props.taskId}`, { credentials: 'include' })
    if (r.ok) {
      const data = await r.json()
      task.value = mapTask(data)
      await chatStore.openPanel('task', String(props.taskId), data.chat_id || null, data.name)
      if (!data.chat_id) await chatStore.ensureChat()
    }
  } catch (e) { console.error(e) } finally { loading.value = false }
}

const isCreator = computed(() => task.value?.createdBy === authStore.user?.id)
const isResponsible = computed(() => (task.value?.rawUserRoles || []).some(r => r.role === 'responsible' && r.user_id === authStore.user?.id))
const isCompleted = computed(() => task.value?.statusId === COMPLETED_STATUS_ID || !!task.value?.dateCompleted)
const isBoardTask = computed(() => task.value?.connectionType === 'task-columns')
const canEdit = computed(() => (isCreator.value || isResponsible.value || isBoardTask.value) && !isCompleted.value)

const patchTask = (fields) => fetch(`/apisup/supply/tasks/${task.value.id}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields) }).then(() => emit('updated'))

// Заголовок / описание
const saveTitle = () => { if (task.value.title.trim()) patchTask({ name: task.value.title }) }
const saveDescription = () => patchTask({ description: task.value.description })
const savePriority = (pk) => { task.value.priority = pk; tdPrioOpen.value = false; patchTask({ urgent: pk === 'none' ? null : pk }) }
const tdPrioOpen = ref(false)

// Даты
const saveDate = (field) => patchTask({ [field === 'startDate' ? 'date_start' : 'date_end']: task.value[field] || null })

// Исполнитель / соисполнители / наблюдатели — dropdown
const ddOpen = ref(null) // 'assignee' | 'coex' | 'obs'
const ddStyle = ref({})
const ddSearch = ref('')
const openDd = (type, ev) => {
  if (!canEdit.value) return
  const r = ev.currentTarget.getBoundingClientRect()
  ddStyle.value = { position: 'fixed', top: (r.bottom + 4) + 'px', left: r.left + 'px', minWidth: '240px', zIndex: 10002 }
  ddOpen.value = ddOpen.value === type ? null : type
  ddSearch.value = ''
}
const ddUsers = computed(() => { const q = ddSearch.value.toLowerCase().trim(); return USERS.value.filter(u => !q || u.name.toLowerCase().includes(q)) })
const changeAssignee = async (uid) => {
  const t = task.value
  if (t.assigneeRoleId) await fetch(`/apisup/supply/task-user-roles/${t.assigneeRoleId}`, { method: 'DELETE', credentials: 'include' })
  if (uid && t.assignee.id !== uid) {
    const r = await fetch('/apisup/supply/task-user-roles', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task_id: t.id, task_item_id: null, user_id: uid, role: 'responsible' }) })
    if (r.ok) { const d = await r.json(); const u = USERS.value.find(x => x.id === uid); t.assignee = u ? { name: u.name, initials: u.initials, id: uid } : t.assignee; t.assigneeRoleId = d.id ?? d.data?.id }
  } else { t.assignee = { name: '—', initials: '—' }; t.assigneeRoleId = null }
  ddOpen.value = null; emit('updated')
}
const toggleRole = async (uid, role) => {
  const t = task.value
  const arr = role === 'co-executor' ? t.coexecutors : t.observers
  const ex = arr.find(u => u.id === uid)
  if (ex) {
    await fetch(`/apisup/supply/task-user-roles/${ex.roleId}`, { method: 'DELETE', credentials: 'include' })
    if (role === 'co-executor') t.coexecutors = arr.filter(u => u.id !== uid); else t.observers = arr.filter(u => u.id !== uid)
  } else {
    const r = await fetch('/apisup/supply/task-user-roles', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task_id: t.id, task_item_id: null, user_id: uid, role }) })
    if (r.ok) { const d = await r.json(); const u = USERS.value.find(x => x.id === uid); arr.push({ id: uid, roleId: d.id ?? d.data?.id, name: u?.name ?? '?', initials: u?.initials ?? '?' }) }
  }
  emit('updated')
}
const hasCoex = (uid) => task.value.coexecutors.some(u => u.id === uid)
const hasObs = (uid) => task.value.observers.some(u => u.id === uid)

// Теги
const tagInput = ref('')
const addTag = async () => {
  const tag = tagInput.value.trim().replace(/^#+/, ''); tagInput.value = ''
  if (!tag || task.value.rawTags.some(r => r.tag === tag)) return
  const r = await fetch('/apisup/supply/task-tags', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task_id: task.value.id, tag }) })
  if (r.ok) { const d = await r.json(); task.value.rawTags.push({ id: d.id ?? d.data?.id, tag }); task.value.tags.push(tag); emit('updated') }
}
const removeTag = async (tag) => {
  const rt = task.value.rawTags.find(r => r.tag === tag); if (!rt) return
  await fetch(`/apisup/supply/task-tags/${rt.id}`, { method: 'DELETE', credentials: 'include' })
  task.value.rawTags = task.value.rawTags.filter(r => r.id !== rt.id); task.value.tags = task.value.tags.filter(t => t !== tag); emit('updated')
}

// Чек-лист
const clDraft = ref('')
const addClItem = async () => {
  const name = clDraft.value.trim(); if (!name) return
  const r = await fetch('/apisup/supply/task-items', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task_id: task.value.id, num: task.value.subtasks.length, name, status_id: DEFAULT_STATUS_ID }) })
  if (r.ok) { const d = await r.json(); task.value.subtasks.push({ id: d.id ?? d.data?.id, title: name, done: false }); clDraft.value = ''; emit('updated') }
}
const canCheck = computed(() => !isCompleted.value && (isCreator.value || isBoardTask.value || (task.value?.rawUserRoles || []).some(r => r.user_id === authStore.user?.id && (r.role === 'responsible' || r.role === 'co-executor'))))
const toggleClItem = async (s) => {
  if (!canCheck.value) return
  s.done = !s.done
  await fetch(`/apisup/supply/task-items/${s.id}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status_id: s.done ? DONE_ITEM_STATUS_ID : DEFAULT_STATUS_ID }) })
  emit('updated')
}
const removeClItem = async (s, idx) => {
  await fetch(`/apisup/supply/task-items/${s.id}`, { method: 'DELETE', credentials: 'include' })
  task.value.subtasks.splice(idx, 1); emit('updated')
}

// Файлы
const fileUploading = ref(false)
const fileInput = ref(null)
const uploadFiles = async (files) => {
  if (!files?.length) return
  fileUploading.value = true
  try {
    const fd = new FormData(); fd.append('task_id', task.value.id); Array.from(files).forEach(f => fd.append('files', f))
    const r = await fetch('/apisup/supply/task-files', { method: 'POST', credentials: 'include', body: fd })
    if (r.ok) { await loadTask() }
  } finally { fileUploading.value = false }
}
const downloadFile = (f) => window.open(`/apisup/supply/task-files/${f.id}/download`, '_blank')
const deleteFile = async (f) => { await fetch(`/apisup/supply/task-files/${f.id}`, { method: 'DELETE', credentials: 'include' }); task.value.files = task.value.files.filter(x => x.id !== f.id) }
const fullImage = ref(null)
const isImg = (ext) => ['jpg','jpeg','png','gif','webp','bmp','svg'].includes((ext || '').toLowerCase())
const openFile = (f) => { if (isImg(f.ext)) fullImage.value = `/apisup/supply/task-files/${f.id}/download`; else downloadFile(f) }

// Результаты
const openResultId = ref(null)
const userName = (id) => USERS.value.find(u => u.id === id)?.name || 'Пользователь'
const userInitials = (id) => USERS.value.find(u => u.id === id)?.initials || '?'

// Статус-цвет
const statusClass = (t) => {
  const id = t?.statusId, name = (t?.status || '').toLowerCase()
  if (id === COMPLETED_STATUS_ID || name.includes('заверш')) return 'st--done'
  if (id === IN_PROGRESS_STATUS_ID || name.includes('выполня')) return 'st--progress'
  if (id === PAUSED_STATUS_ID || name.includes('приостан')) return 'st--paused'
  return 'st--waiting'
}

// Завершение / удаление
const busy = ref(false)
const showComplete = ref(false)
const showDelete = ref(false)
const completeTask = async () => {
  if (busy.value) return; busy.value = true
  try { await patchTask({ date_completed: new Date().toISOString(), status_id: COMPLETED_STATUS_ID }); task.value.statusId = COMPLETED_STATUS_ID; task.value.dateCompleted = new Date().toISOString(); task.value.status = 'Завершена'; showComplete.value = false } finally { busy.value = false }
}
const deleteTask = async () => {
  if (busy.value) return; busy.value = true
  try { const r = await fetch(`/apisup/supply/tasks/${task.value.id}`, { method: 'DELETE', credentials: 'include' }); if (r.ok) { emit('updated'); closeModal() } } finally { busy.value = false; showDelete.value = false }
}

// Календарь (простой, для дат)
const calOpen = ref(false)
const calField = ref('deadline')
const calStyle = ref({})
const calValue = ref('')
const openCal = (field, ev) => {
  if (!canEdit.value) return
  calField.value = field
  calValue.value = task.value[field] || toInputDate(new Date())
  const r = ev.currentTarget.getBoundingClientRect()
  calStyle.value = { position: 'fixed', top: (r.bottom + 4) + 'px', left: r.left + 'px', zIndex: 10002 }
  calOpen.value = true
}
const applyCal = () => { task.value[calField.value] = calValue.value; saveDate(calField.value); calOpen.value = false }
const clearCal = () => { task.value[calField.value] = ''; saveDate(calField.value); calOpen.value = false }

// ── Чат ──
const chatText = ref('')
const chatEl = ref(null)
const chatAttach = ref(null)
const chatIsMe = (m) => String(m.sender_id) === String(authStore.user?.id)
const chatSender = (m) => { const s = m.sender; return s ? [s.surname, s.name].filter(Boolean).join(' ') : '—' }
const chatTime = (s) => s ? new Date(s).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : ''
const chatIsImage = (a) => (a.file_type || '').toLowerCase().startsWith('image/')
const chatScroll = () => nextTick(() => { if (chatEl.value) chatEl.value.scrollTop = chatEl.value.scrollHeight })
const chatSend = async () => {
  const text = chatText.value.trim(); const file = chatAttach.value
  if (!text && !file) return
  if (file) await chatStore.sendMessageWithAttachment(text, file, []); else await chatStore.sendMessage(text, [])
  chatText.value = ''; chatAttach.value = null; chatScroll()
}
const onChatFile = (e) => { chatAttach.value = e.target.files?.[0] || null; e.target.value = '' }
watch(() => chatStore.messages.length, chatScroll)

const closeModal = () => { chatStore.closePanel(); emit('close') }

watch(() => props.open, (v) => {
  if (v) { openResultId.value = null; loadUsers(); loadTask() }
  else { task.value = null; chatStore.closePanel() }
})
</script>

<template>
  <Teleport to="body">
    <transition name="tdm-fade">
      <div v-if="open" class="tdm-backdrop" @mousedown.self="closeModal">
        <div class="tdm-modal" @click.stop>
          <div v-if="loading || !task" class="tdm-loading"><i class="fas fa-spinner fa-spin"></i> Загрузка...</div>
          <template v-else>
            <!-- LEFT -->
            <div class="tdm-left">
              <div class="tdm-title-row">
                <textarea v-if="canEdit" v-model="task.title" class="tdm-title tdm-title-edit" rows="1" @blur="saveTitle" @keydown.enter.prevent="saveTitle"></textarea>
                <div v-else class="tdm-title">{{ task.title }}</div>
                <div class="tdm-prio-wrap">
                  <button class="tdm-prio" @click.stop="canEdit ? tdPrioOpen = !tdPrioOpen : null">
                    <i v-if="PRIORITIES[task.priority]?.icon" class="fas" :class="PRIORITIES[task.priority].icon" :style="{ color: PRIORITIES[task.priority].color }"></i>
                    <span>{{ PRIORITIES[task.priority]?.label || 'Без приоритета' }}</span>
                  </button>
                  <div v-if="tdPrioOpen && canEdit" class="tdm-prio-menu">
                    <button v-for="(pv, pk) in PRIORITIES" :key="pk" class="tdm-prio-item" @click.stop="savePriority(pk)">
                      <i v-if="pv.icon" class="fas" :class="pv.icon" :style="{ color: pv.color }"></i><span>{{ pv.label }}</span>
                    </button>
                  </div>
                </div>
              </div>

              <div class="tdm-body">
                <div v-if="task.description || canEdit" class="tdm-section">
                  <textarea v-if="canEdit" v-model="task.description" class="tdm-desc" placeholder="Описание задачи..." @blur="saveDescription"></textarea>
                  <div v-else class="tdm-desc-view">{{ task.description }}</div>
                </div>

                <div class="tdm-meta">
                  <div class="tdm-row"><span class="tdm-label"><i class="fas fa-user-pen"></i> Постановщик</span><div class="tdm-val"><div class="mini-avatar" :style="{ background: avatarColor(task.assigner.initials).bg, color: avatarColor(task.assigner.initials).color }">{{ task.assigner.initials }}</div>{{ task.assigner.name }}</div></div>
                  <div class="tdm-row" :class="{ clickable: canEdit }" @click.stop="openDd('assignee', $event)"><span class="tdm-label"><i class="fas fa-user-check"></i> Исполнитель</span><div class="tdm-val"><template v-if="task.assignee.name !== '—'"><div class="mini-avatar" :style="{ background: avatarColor(task.assignee.initials).bg, color: avatarColor(task.assignee.initials).color }">{{ task.assignee.initials }}</div>{{ task.assignee.name }}</template><span v-else class="tdm-empty">Не выбран</span></div></div>
                  <div class="tdm-row"><span class="tdm-label"><i class="fas fa-users"></i> Соисполнители</span><div class="tdm-val tdm-val--wrap"><span v-for="u in task.coexecutors" :key="u.id" class="tdm-chip"><div class="mini-avatar" :style="{ background: avatarColor(u.initials).bg, color: avatarColor(u.initials).color }">{{ u.initials }}</div>{{ u.name }}<button v-if="canEdit" class="tdm-chip-x" @click.stop="toggleRole(u.id, 'co-executor')"><i class="fas fa-xmark"></i></button></span><span v-if="!task.coexecutors.length" class="tdm-empty">Не выбраны</span><button v-if="canEdit" class="tdm-add" @click.stop="openDd('coex', $event)"><i class="fas fa-plus"></i></button></div></div>
                  <div class="tdm-row"><span class="tdm-label"><i class="fas fa-eye"></i> Наблюдатели</span><div class="tdm-val tdm-val--wrap"><span v-for="u in task.observers" :key="u.id" class="tdm-chip"><div class="mini-avatar" :style="{ background: avatarColor(u.initials).bg, color: avatarColor(u.initials).color }">{{ u.initials }}</div>{{ u.name }}<button v-if="canEdit" class="tdm-chip-x" @click.stop="toggleRole(u.id, 'observer')"><i class="fas fa-xmark"></i></button></span><span v-if="!task.observers.length" class="tdm-empty">Не выбраны</span><button v-if="canEdit" class="tdm-add" @click.stop="openDd('obs', $event)"><i class="fas fa-plus"></i></button></div></div>
                  <div class="tdm-row" :class="{ clickable: canEdit }" @click.stop="openCal('startDate', $event)"><span class="tdm-label"><i class="fas fa-calendar-plus"></i> Дата начала</span><div class="tdm-val"><span v-if="task.startDate">{{ fmtDate(task.startDate) }}</span><span v-else class="tdm-empty">Не задана</span></div></div>
                  <div class="tdm-row" :class="{ clickable: canEdit }" @click.stop="openCal('deadline', $event)"><span class="tdm-label"><i class="fas fa-calendar-days"></i> Крайний срок</span><div class="tdm-val"><span v-if="task.deadline">{{ fmtDate(task.deadline) }}</span><span v-else class="tdm-empty">Не задан</span></div></div>
                  <div v-if="isCompleted" class="tdm-row"><span class="tdm-label"><i class="fas fa-circle-check" style="color:#22c55e"></i> Завершена</span><div class="tdm-val" style="color:#16a34a">{{ fmtDate(task.dateCompleted) }}</div></div>
                  <div class="tdm-row"><span class="tdm-label"><i class="fas fa-circle-dot"></i> Статус</span><div class="tdm-val"><span class="tdm-status" :class="statusClass(task)">{{ task.status || '—' }}</span></div></div>
                  <div class="tdm-row"><span class="tdm-label"><i class="fas fa-calendar"></i> Создана</span><div class="tdm-val">{{ fmtDate(task.createdAt) }}</div></div>
                  <div v-if="task.project" class="tdm-row"><span class="tdm-label"><i class="fas fa-folder"></i> Проект</span><div class="tdm-val"><span class="tdm-proj">{{ task.project }}</span></div></div>
                  <div class="tdm-row"><span class="tdm-label"><i class="fas fa-tags"></i> Теги</span><div class="tdm-val tdm-val--wrap"><span v-for="tag in task.tags" :key="tag" class="tdm-tag">#{{ tag }}<button v-if="canEdit" class="tdm-chip-x" @click.stop="removeTag(tag)"><i class="fas fa-xmark"></i></button></span><input v-if="canEdit" v-model="tagInput" class="tdm-tag-input" placeholder="#тег..." @keydown.enter="addTag" @blur="addTag" /><span v-else-if="!task.tags.length" class="tdm-empty">Нет тегов</span></div></div>
                </div>

                <!-- Чек-лист -->
                <div v-if="task.subtasks.length || canEdit" class="tdm-section">
                  <div class="tdm-sec-head"><i class="fas fa-list-check" style="color:var(--brand-primary)"></i> Чек-лист <span class="tdm-sec-count">{{ task.subtasks.filter(s=>s.done).length }}/{{ task.subtasks.length }}</span></div>
                  <div v-for="(s, idx) in task.subtasks" :key="s.id" class="tdm-cl-item">
                    <input type="checkbox" :checked="s.done" :disabled="!canCheck" @change="toggleClItem(s)" />
                    <span :class="{ done: s.done }">{{ s.title }}</span>
                    <button v-if="canEdit" class="tdm-cl-del" @click="removeClItem(s, idx)"><i class="fas fa-trash"></i></button>
                  </div>
                  <div v-if="canEdit" class="tdm-cl-add"><i class="fas fa-plus"></i><input v-model="clDraft" placeholder="Добавить пункт..." @keydown.enter="addClItem" /></div>
                </div>

                <!-- Результаты -->
                <div v-if="task.results.length" class="tdm-section">
                  <div class="tdm-sec-head"><i class="fas fa-clipboard-check" style="color:var(--brand-primary)"></i> Результаты <span class="tdm-sec-count">{{ task.results.length }}</span></div>
                  <div v-for="res in task.results" :key="res.id" class="tdm-res">
                    <button class="tdm-res-head" @click="openResultId = openResultId === res.id ? null : res.id">
                      <div class="mini-avatar" :style="{ background: avatarColor(userInitials(res.createdBy)).bg, color: avatarColor(userInitials(res.createdBy)).color }">{{ userInitials(res.createdBy) }}</div>
                      <span class="tdm-res-title">Результат от {{ userName(res.createdBy) }}</span>
                      <span class="tdm-res-date">{{ fmtDate(res.createdAt) }}</span>
                      <i class="fas fa-chevron-down" :class="{ open: openResultId === res.id }"></i>
                    </button>
                    <div v-if="openResultId === res.id" class="tdm-res-body" v-html="res.text"></div>
                  </div>
                </div>

                <!-- Файлы -->
                <div v-if="task.files.length || canEdit" class="tdm-section">
                  <div class="tdm-sec-head"><i class="fas fa-paperclip" style="color:var(--brand-primary)"></i> Файлы <span class="tdm-sec-count">{{ task.files.length }}</span>
                    <label v-if="canEdit" class="tdm-file-upload"><i v-if="fileUploading" class="fas fa-spinner fa-spin"></i><i v-else class="fas fa-plus"></i><input type="file" multiple style="display:none" :disabled="fileUploading" @change="uploadFiles($event.target.files)" /></label>
                  </div>
                  <div v-for="f in task.files" :key="f.id" class="tdm-file">
                    <i class="fas fa-file"></i><span @click="openFile(f)">{{ f.name }}</span>
                    <button @click="downloadFile(f)"><i class="fas fa-download"></i></button>
                    <button v-if="canEdit" style="color:#ef4444" @click="deleteFile(f)"><i class="fas fa-trash"></i></button>
                  </div>
                </div>
              </div>

              <div class="tdm-footer">
                <span v-if="isCompleted" class="tdm-done-badge"><i class="fas fa-circle-check"></i> Задача завершена</span>
                <button v-else-if="isCreator || isResponsible || isBoardTask" class="tdm-btn tdm-btn--primary" @click="showComplete = true"><i class="fas fa-check"></i> Завершить</button>
                <button v-if="isCreator" class="tdm-btn tdm-btn--danger" @click="showDelete = true"><i class="fas fa-trash"></i></button>
              </div>
            </div>

            <!-- RIGHT: chat -->
            <div class="tdm-right">
              <div class="tdm-chat-head"><i class="fas fa-comments" style="color:var(--brand-primary)"></i> Чат задачи<button class="tdm-close" @click="closeModal"><i class="fas fa-xmark"></i></button></div>
              <div ref="chatEl" class="tdm-chat-msgs">
                <div v-if="chatStore.messagesLoading" class="tdm-chat-empty"><i class="fas fa-spinner fa-spin"></i></div>
                <template v-else-if="chatStore.sortedMessages.length">
                  <div v-for="m in chatStore.sortedMessages" :key="m.id" class="tdm-msg" :class="chatIsMe(m) ? 'me' : 'other'">
                    <div class="tdm-msg-b">
                      <div v-if="!chatIsMe(m)" class="tdm-msg-author">{{ chatSender(m) }}</div>
                      <div class="tdm-bubble" :class="chatIsMe(m) ? 'me' : 'other'">
                        <div v-if="m.message_text" class="tdm-msg-text">{{ m.message_text }}</div>
                        <template v-for="a in (m.attachments || [])" :key="a.id">
                          <img v-if="chatIsImage(a)" :src="chatStore.getAttachmentUrl(chatStore.currentChatId, m.id, a.id)" class="tdm-msg-img" @click="fullImage = chatStore.getAttachmentUrl(chatStore.currentChatId, m.id, a.id)" />
                          <a v-else :href="chatStore.getAttachmentUrl(chatStore.currentChatId, m.id, a.id)" target="_blank" class="tdm-msg-file"><i class="fas fa-paperclip"></i> {{ a.file_name || 'Файл' }}</a>
                        </template>
                      </div>
                      <div class="tdm-msg-time">{{ chatTime(m.created_at) }}</div>
                    </div>
                  </div>
                </template>
                <div v-else class="tdm-chat-empty">Нет сообщений</div>
              </div>
              <div v-if="chatAttach" class="tdm-chat-attach"><i class="fas fa-paperclip"></i> {{ chatAttach.name }}<button @click="chatAttach = null"><i class="fas fa-xmark"></i></button></div>
              <div class="tdm-chat-input">
                <label class="tdm-chat-clip"><i class="fas fa-paperclip"></i><input type="file" style="display:none" @change="onChatFile" /></label>
                <textarea v-model="chatText" placeholder="Написать сообщение..." rows="1" @keydown.enter.exact.prevent="chatSend"></textarea>
                <button class="tdm-chat-send" :disabled="chatStore.sendingMessage || (!chatText.trim() && !chatAttach)" @click="chatSend"><i class="fas fa-paper-plane"></i></button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </transition>

    <!-- teleported dropdown for users -->
    <div v-if="ddOpen" class="tdm-dd-overlay" @mousedown="ddOpen = null"></div>
    <div v-if="ddOpen" class="tdm-dd" :style="ddStyle" @click.stop>
      <input v-model="ddSearch" class="tdm-dd-search" placeholder="Поиск..." />
      <div class="tdm-dd-list">
        <button v-if="ddOpen === 'assignee'" class="tdm-dd-item" @click="changeAssignee(null)"><span class="tdm-empty">Без исполнителя</span></button>
        <button v-for="u in ddUsers" :key="u.id" class="tdm-dd-item"
          :class="{ active: ddOpen === 'assignee' ? task?.assignee.id === u.id : (ddOpen === 'coex' ? hasCoex(u.id) : hasObs(u.id)) }"
          @click="ddOpen === 'assignee' ? changeAssignee(u.id) : toggleRole(u.id, ddOpen === 'coex' ? 'co-executor' : 'observer')">
          <div class="mini-avatar" :style="{ background: avatarColor(u.initials).bg, color: avatarColor(u.initials).color }">{{ u.initials }}</div>
          <span>{{ u.name }}</span>
          <i v-if="ddOpen === 'assignee' ? task?.assignee.id === u.id : (ddOpen === 'coex' ? hasCoex(u.id) : hasObs(u.id))" class="fas fa-check" style="margin-left:auto;color:var(--brand-primary)"></i>
        </button>
      </div>
    </div>

    <!-- calendar -->
    <div v-if="calOpen" class="tdm-dd-overlay" @mousedown="calOpen = false"></div>
    <div v-if="calOpen" class="tdm-cal" :style="calStyle" @click.stop>
      <input type="datetime-local" v-model="calValue" class="tdm-cal-input" />
      <div class="tdm-cal-actions">
        <button class="tdm-btn" @click="clearCal">Очистить</button>
        <button class="tdm-btn tdm-btn--primary" @click="applyCal">Применить</button>
      </div>
    </div>

    <!-- confirm complete -->
    <div v-if="showComplete" class="tdm-confirm-back" @click.self="showComplete = false">
      <div class="tdm-confirm"><div class="tdm-confirm-title">Завершить задачу?</div><div class="tdm-confirm-text">После завершения задачу нельзя будет редактировать.</div><div class="tdm-confirm-actions"><button class="tdm-btn" @click="showComplete = false">Отмена</button><button class="tdm-btn tdm-btn--primary" :disabled="busy" @click="completeTask">Завершить</button></div></div>
    </div>
    <div v-if="showDelete" class="tdm-confirm-back" @click.self="showDelete = false">
      <div class="tdm-confirm"><div class="tdm-confirm-title">Удалить задачу?</div><div class="tdm-confirm-text">Это действие необратимо.</div><div class="tdm-confirm-actions"><button class="tdm-btn" @click="showDelete = false">Отмена</button><button class="tdm-btn tdm-btn--danger" :disabled="busy" @click="deleteTask">Удалить</button></div></div>
    </div>

    <div v-if="fullImage" class="tdm-img-overlay" @click="fullImage = null">
      <button class="tdm-img-close"><i class="fas fa-xmark"></i></button>
      <img :src="fullImage" class="tdm-img-full" @click.stop />
    </div>
  </Teleport>
</template>

<style scoped>
.tdm-backdrop { position: fixed; inset: 0; z-index: 400; background: rgba(15,23,42,0.45); backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center; padding: 24px; }
.tdm-fade-enter-active, .tdm-fade-leave-active { transition: opacity 0.2s; }
.tdm-fade-enter-from, .tdm-fade-leave-to { opacity: 0; }
.tdm-modal { background: var(--bg-surface); border-radius: 16px; box-shadow: 0 24px 80px rgba(15,23,42,0.22); width: 100%; max-width: 960px; height: 88vh; display: flex; overflow: hidden; }
.tdm-loading { flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px; color: var(--text-tertiary); }
.tdm-left { width: 420px; flex-shrink: 0; display: flex; flex-direction: column; border-right: 1px solid var(--border-light); }
.tdm-title-row { display: flex; align-items: flex-start; gap: 8px; padding: 18px 20px 14px; border-bottom: 1px solid var(--border-light); }
.tdm-title { flex: 1; font-size: 16px; font-weight: 600; color: var(--text-primary); line-height: 1.4; }
.tdm-title-edit { border: none; outline: none; background: none; resize: none; font-family: inherit; max-height: 4.2em; overflow-y: auto; }
.tdm-prio-wrap { position: relative; flex-shrink: 0; }
.tdm-prio { display: inline-flex; align-items: center; gap: 5px; border: 1px solid var(--border-light); background: none; border-radius: 20px; padding: 4px 10px; font-size: 12px; cursor: pointer; color: var(--text-secondary); }
.tdm-prio-menu { position: absolute; right: 0; top: calc(100% + 4px); background: var(--bg-surface); border: 1px solid var(--border-light); border-radius: 10px; box-shadow: 0 8px 30px rgba(15,23,42,0.14); min-width: 170px; z-index: 5; overflow: hidden; }
.tdm-prio-item { width: 100%; display: flex; align-items: center; gap: 8px; padding: 9px 14px; border: none; background: none; cursor: pointer; font-size: 13px; text-align: left; }
.tdm-prio-item:hover { background: var(--bg-subtle); }
.tdm-body { flex: 1; overflow-y: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 16px; }
.tdm-section { display: flex; flex-direction: column; gap: 8px; }
.tdm-desc { width: 100%; border: none; outline: none; background: none; resize: none; font-family: inherit; font-size: 14px; color: var(--text-secondary); min-height: 40px; }
.tdm-desc-view { font-size: 14px; color: var(--text-secondary); white-space: pre-wrap; }
.tdm-meta { display: flex; flex-direction: column; }
.tdm-row { display: flex; align-items: center; gap: 10px; padding: 9px 6px; border-bottom: 1px solid var(--border-light); }
.tdm-row.clickable { cursor: pointer; border-radius: 6px; }
.tdm-row.clickable:hover { background: var(--bg-subtle); }
.tdm-label { width: 140px; flex-shrink: 0; font-size: 12px; color: var(--text-tertiary); display: flex; align-items: center; gap: 6px; }
.tdm-val { flex: 1; display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-primary); }
.tdm-val--wrap { flex-wrap: wrap; }
.tdm-empty { color: var(--text-tertiary); font-size: 13px; }
.mini-avatar { width: 24px; height: 24px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; flex-shrink: 0; }
.tdm-chip { display: flex; align-items: center; gap: 5px; font-size: 13px; background: var(--bg-subtle); border-radius: 20px; padding: 2px 6px 2px 3px; }
.tdm-chip-x { border: none; background: none; cursor: pointer; color: var(--text-tertiary); font-size: 10px; }
.tdm-add { width: 24px; height: 24px; border-radius: 50%; border: 1px dashed var(--border-light); background: none; cursor: pointer; color: var(--text-secondary); }
.tdm-tag { display: inline-flex; align-items: center; gap: 3px; background: rgba(99,102,241,0.1); color: var(--brand-primary); border-radius: 6px; padding: 2px 6px; font-size: 12px; }
.tdm-tag-input { border: none; outline: none; background: none; font-size: 13px; min-width: 80px; }
.tdm-proj { background: #dcfce7; color: #15803d; border-radius: 6px; padding: 2px 8px; font-size: 12px; }
.tdm-status { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 6px; }
.st--waiting { background: #fef3c7; color: #b45309; } .st--progress { background: #dbeafe; color: #2563eb; } .st--paused { background: #fde68a; color: #92400e; } .st--done { background: #dcfce7; color: #16a34a; }
.tdm-sec-head { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; }
.tdm-sec-count { color: var(--text-tertiary); font-weight: 400; }
.tdm-file-upload { margin-left: auto; cursor: pointer; color: var(--text-secondary); }
.tdm-cl-item { display: flex; align-items: center; gap: 8px; font-size: 13px; padding: 3px 0; }
.tdm-cl-item span.done { text-decoration: line-through; color: var(--text-tertiary); }
.tdm-cl-del { margin-left: auto; border: none; background: none; cursor: pointer; color: var(--text-tertiary); font-size: 11px; }
.tdm-cl-add { display: flex; align-items: center; gap: 8px; color: var(--text-tertiary); }
.tdm-cl-add input { border: none; outline: none; background: none; font-size: 13px; flex: 1; }
.tdm-res { border: 1px solid var(--border-light); border-radius: 8px; overflow: hidden; }
.tdm-res-head { display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 10px; border: none; background: none; cursor: pointer; text-align: left; }
.tdm-res-title { font-size: 13px; font-weight: 600; flex: 1; }
.tdm-res-date { font-size: 11px; color: var(--text-tertiary); }
.tdm-res-head .fa-chevron-down { transition: transform 0.15s; font-size: 11px; color: var(--text-tertiary); }
.tdm-res-head .fa-chevron-down.open { transform: rotate(180deg); }
.tdm-res-body { padding: 8px 12px; border-top: 1px solid var(--border-light); font-size: 14px; }
.tdm-res-body :deep(.res-code) { background: #1e293b; color: #e2e8f0; border-radius: 8px; padding: 10px; white-space: pre-wrap; font-family: monospace; }
.tdm-res-body :deep(.res-quote) { border-left: 3px solid var(--brand-primary); padding: 6px 12px; background: var(--bg-subtle); font-style: italic; }
.tdm-file { display: flex; align-items: center; gap: 8px; font-size: 13px; padding: 4px 0; }
.tdm-file span { flex: 1; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tdm-file button { border: none; background: none; cursor: pointer; color: var(--text-secondary); }
.tdm-footer { display: flex; align-items: center; gap: 8px; padding: 12px 20px; border-top: 1px solid var(--border-light); }
.tdm-done-badge { display: flex; align-items: center; gap: 6px; color: #16a34a; font-weight: 600; font-size: 13px; }
.tdm-btn { border: 1px solid var(--border-light); background: var(--bg-surface); padding: 8px 16px; border-radius: 8px; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
.tdm-btn--primary { background: var(--brand-primary); color: #fff; border-color: var(--brand-primary); }
.tdm-btn--danger { background: #ef4444; color: #fff; border-color: #ef4444; }
.tdm-btn:disabled { opacity: 0.6; cursor: default; }
/* right chat */
.tdm-right { flex: 1; display: flex; flex-direction: column; }
.tdm-chat-head { display: flex; align-items: center; gap: 8px; padding: 16px 18px; border-bottom: 1px solid var(--border-light); font-weight: 600; font-size: 14px; }
.tdm-close { margin-left: auto; border: none; background: none; cursor: pointer; color: var(--text-tertiary); font-size: 15px; }
.tdm-chat-msgs { flex: 1; overflow-y: auto; padding: 12px 16px; display: flex; flex-direction: column; gap: 4px; }
.tdm-chat-empty { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--text-tertiary); font-size: 13px; }
.tdm-msg { display: flex; }
.tdm-msg.me { justify-content: flex-end; }
.tdm-msg-b { max-width: 78%; }
.tdm-msg-author { font-size: 11px; color: var(--text-tertiary); margin-bottom: 2px; }
.tdm-bubble { padding: 8px 12px; border-radius: 12px; font-size: 13px; }
.tdm-bubble.me { background: var(--brand-primary); color: #fff; }
.tdm-bubble.other { background: var(--bg-subtle); }
.tdm-msg-text { white-space: pre-wrap; word-break: break-word; }
.tdm-msg-img { max-width: 180px; border-radius: 6px; cursor: pointer; margin-top: 4px; display: block; }
.tdm-msg-file { color: inherit; font-size: 12px; }
.tdm-msg-time { font-size: 10px; color: var(--text-tertiary); margin-top: 2px; }
.tdm-msg.me .tdm-msg-time { text-align: right; }
.tdm-chat-attach { display: flex; align-items: center; gap: 6px; padding: 6px 12px; font-size: 12px; background: var(--bg-subtle); }
.tdm-chat-attach button { margin-left: auto; border: none; background: none; cursor: pointer; }
.tdm-chat-input { display: flex; align-items: flex-end; gap: 8px; padding: 10px 12px; border-top: 1px solid var(--border-light); }
.tdm-chat-clip { cursor: pointer; color: var(--text-tertiary); padding: 6px; }
.tdm-chat-input textarea { flex: 1; border: 1px solid var(--border-light); border-radius: 8px; padding: 8px 12px; font-size: 13px; font-family: inherit; resize: none; outline: none; max-height: 100px; }
.tdm-chat-send { width: 36px; height: 36px; border: none; border-radius: 8px; background: var(--brand-primary); color: #fff; cursor: pointer; }
.tdm-chat-send:disabled { background: var(--border-light); cursor: default; }
/* dropdown/calendar teleport */
.tdm-dd-overlay { position: fixed; inset: 0; z-index: 10001; }
.tdm-dd { background: var(--bg-surface); border: 1px solid var(--border-light); border-radius: 10px; box-shadow: 0 8px 30px rgba(15,23,42,0.15); overflow: hidden; }
.tdm-dd-search { width: 100%; padding: 8px 12px; border: none; border-bottom: 1px solid var(--border-light); background: var(--bg-subtle); outline: none; font-size: 13px; box-sizing: border-box; }
.tdm-dd-list { max-height: 240px; overflow-y: auto; }
.tdm-dd-item { width: 100%; display: flex; align-items: center; gap: 8px; padding: 8px 12px; border: none; background: none; cursor: pointer; font-size: 13px; text-align: left; }
.tdm-dd-item:hover { background: var(--bg-subtle); }
.tdm-dd-item.active { background: var(--brand-light); }
.tdm-cal { background: var(--bg-surface); border: 1px solid var(--border-light); border-radius: 10px; box-shadow: 0 8px 30px rgba(15,23,42,0.15); padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.tdm-cal-input { border: 1px solid var(--border-light); border-radius: 8px; padding: 8px; font-size: 13px; }
.tdm-cal-actions { display: flex; gap: 8px; justify-content: space-between; }
.tdm-confirm-back { position: fixed; inset: 0; z-index: 10005; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; }
.tdm-confirm { background: var(--bg-surface); border-radius: 14px; padding: 24px; width: 360px; text-align: center; }
.tdm-confirm-title { font-size: 17px; font-weight: 700; }
.tdm-confirm-text { font-size: 13px; color: var(--text-secondary); margin: 8px 0 16px; }
.tdm-confirm-actions { display: flex; gap: 10px; }
.tdm-confirm-actions .tdm-btn { flex: 1; justify-content: center; }
.tdm-img-overlay { position: fixed; inset: 0; z-index: 10050; background: rgba(15,23,42,0.85); display: flex; align-items: center; justify-content: center; padding: 32px; }
.tdm-img-full { max-width: 92vw; max-height: 92vh; border-radius: 8px; }
.tdm-img-close { position: fixed; top: 20px; right: 24px; width: 40px; height: 40px; border-radius: 50%; border: none; background: rgba(255,255,255,0.15); color: #fff; font-size: 18px; cursor: pointer; }
</style>
