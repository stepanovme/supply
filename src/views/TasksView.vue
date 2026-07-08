<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TopNav from '../components/layout/TopNav.vue'
import FilterCombo from '../components/FilterCombo.vue'
import { mainNavLinks } from '../constants/mainNav'
import { useAuthStore } from '../stores/auth'
import { useChatStore } from '../stores/chat'
import { useTasksStore } from '../stores/tasks'

const navLinks = mainNavLinks
const authStore = useAuthStore()
const chatStore = useChatStore()
const tasksStore = useTasksStore()
const route = useRoute()
const router = useRouter()

// ─── Avatar colours (rotating palette) ───────────────────────────────────────
const AVATAR_COLORS = [
  { bg: '#dbeafe', color: '#1d4ed8' },
  { bg: '#fce7f3', color: '#be185d' },
  { bg: '#dcfce7', color: '#15803d' },
  { bg: '#fef3c7', color: '#b45309' },
  { bg: '#ede9fe', color: '#6d28d9' },
  { bg: '#ffedd5', color: '#c2410c' },
  { bg: '#e0f2fe', color: '#0369a1' },
]
const avatarColor = (initials) => {
  const idx = (initials.charCodeAt(0) + (initials.charCodeAt(1) || 0)) % AVATAR_COLORS.length
  return AVATAR_COLORS[idx]
}

// ─── Priorities ───────────────────────────────────────────────────────────────
const PRIORITIES = {
  none:   { label: 'Без приоритета', color: null,      icon: null,           text: null },
  low:    { label: 'Низкий',         color: '#22c55e', icon: 'fa-fire-flame-curved', text: null },
  medium: { label: 'Средний',        color: '#f59e0b', icon: 'fa-fire-flame-curved', text: null },
  high:   { label: 'Высокий',        color: '#ef4444', icon: 'fa-fire-flame-curved', text: null },
  frozen: { label: 'Заморожен',      color: '#6366f1', icon: 'fa-snowflake',          text: null },
}
const priority = (key) => PRIORITIES[key] || PRIORITIES.none

// ─── Projects → Boards → Columns ──────────────────────────────────────────────
// Доски загружаются с сервера и группируются по проекту/объекту
const boardsRaw = ref([])
const boardsLoading = ref(false)

const loadBoards = async () => {
  boardsLoading.value = true
  try {
    const r = await fetch('/apisup/supply/task-boards/my', { credentials: 'include' })
    if (r.ok) {
      const data = await r.json()
      boardsRaw.value = (data.items ?? data ?? []).map(b => ({
        id: b.id,
        name: b.name,
        object_id: b.object_id,
        object_type: b.object_type,
        object_name: b.object_name || 'Без объекта',
        columns: b.columns ?? [],
        user_roles: b.user_roles ?? [],
      }))
    }
  } catch (e) { console.error(e) } finally { boardsLoading.value = false }
}

const projects = computed(() => {
  const map = new Map()
  for (const b of boardsRaw.value) {
    const key = b.object_id || '—'
    if (!map.has(key)) {
      map.set(key, { id: b.object_id, name: b.object_name, type: b.object_type, icon: 'fa-folder', boards: [] })
    }
    map.get(key).boards.push(b)
  }
  return [...map.values()]
})

// ─── Tasks (columnId links to columns above) ──────────────────────────────────
const tasksLoading = ref(false)

const mapTask = (t) => {
  const responsible = t.user_roles?.find(r => r.role === 'responsible')
  const coexecutors = t.user_roles?.filter(r => r.role === 'co-executor') ?? []
  const observers   = t.user_roles?.filter(r => r.role === 'observer') ?? []
  return {
    id:       t.id,
    columnId: t.connection_type === 'task-columns' ? t.connection_id : null,
    connectionType: t.connection_type || null,
    connectionId: t.connection_id || null,
    connectionName: t.connection_name || null,
    taskBoardId: t.task_board_id || null,
    verticalNum: t.vertical_num ?? 0,
    title:    t.name,
    description: t.description || '',
    deadline:  t.date_end   ? toInputDate(parseApiDate(t.date_end))   : '',
    startDate: t.date_start ? toInputDate(parseApiDate(t.date_start)) : '',
    priority: t.urgent || 'none',
    status:   t.status_name || '',
    project:  t.object_name || '',
    projectId: t.object_id || null,
    projectType: t.object_type || null,
    tags:     (t.tags ?? []).map(tg => tg.tag),
    assigner: t.created_by_user
      ? { name: t.created_by_user.short_fio, initials: userInitials(t.created_by_user) }
      : { name: '—', initials: '—' },
    assignee: responsible?.user
      ? { name: responsible.user.short_fio, initials: userInitials(responsible.user) }
      : { name: '—', initials: '—' },
    coexecutors: coexecutors.map(r => ({ name: r.user?.short_fio ?? '?', initials: r.user ? userInitials(r.user) : '?', id: r.user_id })),
    observers:   observers.map(r => ({ name: r.user?.short_fio ?? '?', initials: r.user ? userInitials(r.user) : '?', id: r.user_id })),
    subtasks:  (t.items ?? []).map(s => ({
      id: s.id, title: s.name, done: s.status_id !== DEFAULT_STATUS_ID,
      coexecutors: (s.user_roles ?? []).filter(r => r.role === 'co-executor').map(r => ({ id: r.user_id, roleId: r.id, name: r.user?.short_fio ?? '?', initials: r.user ? userInitials(r.user) : '?' })),
      observers:   (s.user_roles ?? []).filter(r => r.role === 'observer').map(r => ({ id: r.user_id, roleId: r.id, name: r.user?.short_fio ?? '?', initials: r.user ? userInitials(r.user) : '?' })),
    })),
    createdAt: t.created_at || '',
    statusId: t.status_id || null,
    dateCompleted: t.date_completed || null,
    accomplishments: (t.accomplishments ?? []).map(a => ({
      id: a.id,
      task_id: a.task_id,
      date_start: a.date_start || null,
      date_end: a.date_end || null,
      date_stop: a.date_stop || null,
      elapsed: a.elapsed || null,
      status_id: a.status_id || null,
      status_name: a.status_name || '',
      created_by: a.created_by,
    })),
    chatId: t.chat_id || null,
    meRole: ['assigner'],
    createdBy: t.created_by,
    rawUserRoles: t.user_roles ?? [],
    rawTags: (t.tags ?? []).map(tg => ({ id: tg.id, tag: tg.tag })),
    rawFiles: (t.files ?? []).map(f => ({ id: f.id, original_name: f.original_name, extension: f.extension, mime_type: f.mime_type, task_result_id: f.task_result_id ?? null })),
    results: (t.results ?? []).map(r => ({
      id: r.id,
      text: r.text || '',
      createdAt: r.created_at || '',
      createdBy: r.created_by,
    })),
    assigneeRoleId: responsible?.id ?? null,
  }
}

const tasks = ref([])

// ─── Sidebar state ────────────────────────────────────────────────────────────
const selectedFilter    = ref('all')
const selectedProjectId = ref(null)
const selectedBoardId   = ref(null)
const boardsOpen        = ref(true)   // secondary sidebar open/collapsed

// ─── Фильтры списка задач ─────────────────────────────────────────────────────
const showFilters   = ref(false)
const fTitle        = ref('')
const fAssigner     = ref('')
const fAssignee     = ref('')
const fCoexecutor   = ref('')
const fObserver     = ref('')
const fStartDate    = ref('')
const fEndDate      = ref('')
const fProject      = ref('')
const fStatus       = ref('')
const fPriority     = ref('')
const fConnection   = ref('')
const fTags         = ref([])

// Типы связи задачи
const CONNECTION_TYPES = {
  'task-columns': { label: 'Столбец',       icon: 'fa-table-columns' },
  letter:         { label: 'Письмо',        icon: 'fa-envelope' },
  contract:       { label: 'Договор',       icon: 'fa-file-signature' },
  request:        { label: 'Заявка',        icon: 'fa-file-lines' },
  invoice:        { label: 'Счёт',          icon: 'fa-file-invoice' },
  deal:           { label: 'Сделка',        icon: 'fa-handshake' },
  warehouse:      { label: 'Склад',         icon: 'fa-warehouse' },
  specification:  { label: 'Спецификация',  icon: 'fa-file-contract' },
}
const connectionMeta = (type) => CONNECTION_TYPES[type] || null
const optConnections = ['Без связи', ...Object.values(CONNECTION_TYPES).map(v => v.label)]
const workFilter    = ref('active') // active | done | all — по умолчанию скрываем завершённые

const priorityLabel = (key) => PRIORITIES[key]?.label || 'Без приоритета'
const optPriorities = ['none', 'low', 'medium', 'high', 'frozen'].map(k => PRIORITIES[k].label)

const uniq = (arr) => [...new Set(arr.filter(v => v && v !== '—'))].sort((a, b) => a.localeCompare(b, 'ru'))
const optAssigners   = computed(() => uniq(tasks.value.map(t => t.assigner?.name)))
const optAssignees   = computed(() => uniq(tasks.value.map(t => t.assignee?.name)))
const optCoexecutors = computed(() => uniq(tasks.value.flatMap(t => (t.coexecutors || []).map(u => u.name))))
const optObservers   = computed(() => uniq(tasks.value.flatMap(t => (t.observers || []).map(u => u.name))))
const optProjects    = computed(() => uniq(tasks.value.map(t => t.project)))
const optStatuses    = computed(() => uniq(tasks.value.map(t => t.status)))
const optTags        = computed(() => uniq(tasks.value.flatMap(t => t.tags || [])))

const activeFilterCount = computed(() =>
  [fTitle.value, fAssigner.value, fAssignee.value, fCoexecutor.value, fObserver.value,
   fStartDate.value, fEndDate.value, fProject.value, fStatus.value, fPriority.value, fConnection.value].filter(Boolean).length
   + fTags.value.length
)
const resetFilters = () => {
  fTitle.value = ''; fAssigner.value = ''; fAssignee.value = ''; fCoexecutor.value = ''
  fObserver.value = ''; fStartDate.value = ''; fEndDate.value = ''; fProject.value = ''; fStatus.value = ''
  fPriority.value = ''; fConnection.value = ''; fTags.value = []
}

// Активен ли фильтр по данному значению (для подсветки в строке)
const isActiveFilter = (field, value) => {
  if (field === 'assigner') return fAssigner.value === value
  if (field === 'assignee') return fAssignee.value === value
  if (field === 'project')  return fProject.value === value
  if (field === 'status')   return fStatus.value === value
  if (field === 'tag')      return fTags.value.includes(value)
  return false
}
// Снять фильтр по значению (крестик в строке)
const clearQuickFilter = (field, value) => {
  if (field === 'assigner') fAssigner.value = ''
  else if (field === 'assignee') fAssignee.value = ''
  else if (field === 'project') fProject.value = ''
  else if (field === 'status') fStatus.value = ''
  else if (field === 'tag') fTags.value = fTags.value.filter(t => t !== value)
}

// Клик по значению в строке списка → занести в фильтр (и открыть панель)
const applyQuickFilter = (field, value) => {
  if (!value || value === '—') return
  showFilters.value = true
  if (field === 'assigner') fAssigner.value = value
  else if (field === 'assignee') fAssignee.value = value
  else if (field === 'project') fProject.value = value
  else if (field === 'status') fStatus.value = value
  else if (field === 'tag') { if (!fTags.value.includes(value)) fTags.value = [...fTags.value, value] }
}

const filterLabels = [
  { key: 'all',         label: 'Все задачи',  icon: 'fa-list-check', role: null },
  { key: 'mine',        label: 'Мои задачи',  icon: 'fa-user-check', role: 'responsible' },
  { key: 'helper',      label: 'Я помогаю',   icon: 'fa-handshake',  role: 'co-executor' },
  { key: 'assigner',    label: 'Я поручил',   icon: 'fa-user-pen',   role: 'creator' },
  { key: 'observer',    label: 'Я наблюдаю',  icon: 'fa-eye',        role: 'observer' },
]

const loadTasks = async (key) => {
  tasksLoading.value = true
  tasks.value = []
  try {
    const fl = filterLabels.find(f => f.key === key)
    const url = fl?.role
      ? `/apisup/supply/tasks/my?role=${fl.role}`
      : '/apisup/supply/tasks/my'
    const r = await fetch(url, { credentials: 'include' })
    if (r.ok) {
      const data = await r.json()
      tasks.value = (data.items ?? data).map(mapTask)
    }
  } catch {} finally {
    tasksLoading.value = false
  }
}

// Сохранение/восстановление текущего раздела между перезагрузками
const NAV_STORAGE_KEY = 'tasksView.nav'
const persistNav = () => {
  try {
    localStorage.setItem(NAV_STORAGE_KEY, JSON.stringify({
      filter: selectedFilter.value,
      projectId: selectedProjectId.value,
      boardId: selectedBoardId.value,
    }))
  } catch {}
}

const selectFilter = (key) => {
  selectedFilter.value = key
  selectedProjectId.value = null
  selectedBoardId.value = null
  loadTasks(key)
  persistNav()
}

const selectProject = (id) => {
  if (selectedProjectId.value === id) {
    boardsOpen.value = !boardsOpen.value
  } else {
    selectedProjectId.value = id
    selectedBoardId.value = null
    selectedFilter.value = null
    boardsOpen.value = true
  }
  persistNav()
}

const boardDetail = ref(null)
const boardDetailLoading = ref(false)

const loadBoardDetail = async (boardId) => {
  boardDetailLoading.value = true
  try {
    const r = await fetch(`/apisup/supply/task-boards/${boardId}`, { credentials: 'include' })
    if (r.ok) {
      const b = await r.json()
      boardDetail.value = {
        id: b.id, name: b.name,
        object_id: b.object_id, object_type: b.object_type, object_name: b.object_name,
        columns: (b.columns ?? []).slice().sort((a, c) => (a.num ?? 0) - (c.num ?? 0)),
        user_roles: b.user_roles ?? [],
      }
    }
  } catch (e) { console.error(e) } finally { boardDetailLoading.value = false }
}

// Задачи доски — грузим вместе с колонками через /task-boards/{id}/tasks
const boardTasks = ref([])
const loadBoardTasks = async (boardId) => {
  try {
    const r = await fetch(`/apisup/supply/task-boards/${boardId}/tasks`, { credentials: 'include' })
    if (r.ok) {
      const b = await r.json()
      const cols = (b.columns ?? []).slice().sort((a, c) => (a.num ?? 0) - (c.num ?? 0))
      boardDetail.value = {
        id: b.id, name: b.name,
        object_id: b.object_id, object_type: b.object_type, object_name: b.object_name,
        columns: cols.map(c => ({ id: c.id, task_board_id: c.task_board_id, num: c.num, name: c.name, color: c.color })),
        user_roles: b.user_roles ?? [],
      }
      boardTasks.value = cols.flatMap(c => (c.tasks ?? []).map(mapTask))
    }
  } catch (e) { console.error(e) }
}

const selectBoard = async (boardId) => {
  selectedBoardId.value = boardId
  boardDetail.value = null
  persistNav()
  await loadBoardTasks(boardId)
}

// ─── View mode ────────────────────────────────────────────────────────────────
const isListView = computed(() => selectedBoardId.value === null)

const currentBoard = computed(() => boardDetail.value)

const currentProject = computed(() =>
  projects.value.find(p => p.id === selectedProjectId.value) || null
)

// ─── List view tasks ──────────────────────────────────────────────────────────
const filteredTasks = computed(() => {
  if (!isListView.value) return []
  let list = tasks.value
  if (workFilter.value === 'active') list = list.filter(t => !isTaskCompleted(t))
  else if (workFilter.value === 'done') list = list.filter(t => isTaskCompleted(t))
  const q = fTitle.value.trim().toLowerCase()
  if (q) list = list.filter(t => t.title?.toLowerCase().includes(q))
  if (fAssigner.value)   list = list.filter(t => t.assigner?.name === fAssigner.value)
  if (fAssignee.value)   list = list.filter(t => t.assignee?.name === fAssignee.value)
  if (fCoexecutor.value) list = list.filter(t => (t.coexecutors || []).some(u => u.name === fCoexecutor.value))
  if (fObserver.value)   list = list.filter(t => (t.observers || []).some(u => u.name === fObserver.value))
  if (fProject.value)    list = list.filter(t => t.project === fProject.value)
  if (fStatus.value)     list = list.filter(t => t.status === fStatus.value)
  if (fPriority.value)   list = list.filter(t => priorityLabel(t.priority) === fPriority.value)
  if (fConnection.value) {
    if (fConnection.value === 'Без связи') list = list.filter(t => !t.connectionType)
    else list = list.filter(t => connectionMeta(t.connectionType)?.label === fConnection.value)
  }
  if (fStartDate.value)  list = list.filter(t => t.startDate && t.startDate.slice(0, 10) >= fStartDate.value)
  if (fEndDate.value)    list = list.filter(t => t.deadline && t.deadline.slice(0, 10) <= fEndDate.value)
  if (fTags.value.length) list = list.filter(t => fTags.value.every(tag => (t.tags || []).includes(tag)))
  return list
})

// ─── Kanban: tasks by column ──────────────────────────────────────────────────
const tasksByColumn = computed(() => {
  if (!currentBoard.value) return {}
  const map = {}
  currentBoard.value.columns.forEach(c => { map[c.id] = [] })
  boardTasks.value
    .filter(t => currentBoard.value.columns.some(c => c.id === t.columnId))
    .forEach(t => { map[t.columnId]?.push(t) })
  // vertical_num: 0 — самый низ, поэтому сверху показываем наибольший
  Object.keys(map).forEach(k => map[k].sort((a, b) => (b.verticalNum ?? 0) - (a.verticalNum ?? 0)))
  return map
})

// ─── Mock users ──────────────────────────────────────────────────────────────
// Статус «Новая» — default при создании
const DEFAULT_STATUS_ID = 'e0896c9d-7646-11f1-b481-bc241127d0bd'
// Статус «Завершена»
const COMPLETED_STATUS_ID = '1ff32c4b-1312-11f1-aa8c-bc241127d0bd'
// Статус «Выполняется»
const IN_PROGRESS_STATUS_ID = '6b4fbf85-7901-11f1-b481-bc241127d0bd'
// Статус «Приостановлено»
const PAUSED_STATUS_ID = '1390dadd-7903-11f1-b481-bc241127d0bd'

// CSS-класс цвета для статуса задачи
const statusClass = (task) => {
  const id = task?.statusId
  const name = (task?.status || '').toLowerCase()
  if (id === COMPLETED_STATUS_ID || name.includes('заверш')) return 'status--done'
  if (id === IN_PROGRESS_STATUS_ID || name.includes('выполня')) return 'status--progress'
  if (id === PAUSED_STATUS_ID || name.includes('приостан')) return 'status--paused'
  return 'status--waiting'
}
const isTaskCompleted = (task) => {
  if (!task) return false
  // Задача завершена целиком
  if (task.statusId === COMPLETED_STATUS_ID || task.dateCompleted || (task.status || '').toLowerCase().includes('заверш')) return true
  // Либо я завершил своё выполнение (в accomplishments есть моё с date_end)
  const uid = authStore.user?.id
  return (task.accomplishments || []).some(a => a.created_by === uid && a.date_end)
}

const USERS = ref([])
const projectOptions = ref([]) // { id, name, type: 'object'|'project' }

// ─── Создание доски ───────────────────────────────────────────────────────────
const showBoardModal    = ref(false)
const boardName         = ref('')
const boardObject       = ref(null)   // { id, name, type }
const boardObjectQuery  = ref('')
const boardObjectOpen   = ref(false)
const boardExecutors    = ref([])     // исполнители [{ id, name, initials }]
const boardExecQuery    = ref('')
const boardExecOpen     = ref(false)
const boardObservers    = ref([])     // наблюдатели
const boardObsQuery     = ref('')
const boardObsOpen      = ref(false)
const boardSubmitting   = ref(false)

const selfUserOption = () => {
  const id = authStore.user?.id
  return USERS.value.find(u => u.id === id) || (id ? { id, name: userName(authStore.user), initials: userInitials(authStore.user) } : null)
}

const boardObjectFiltered = computed(() => {
  const q = boardObjectQuery.value.toLowerCase().trim()
  return projectOptions.value.filter(o => !q || o.name.toLowerCase().includes(q))
})
const boardExecFiltered = computed(() => {
  const q = boardExecQuery.value.toLowerCase().trim()
  return USERS.value.filter(u => (!q || u.name.toLowerCase().includes(q)) && !boardExecutors.value.some(m => m.id === u.id))
})
const boardObsFiltered = computed(() => {
  const q = boardObsQuery.value.toLowerCase().trim()
  return USERS.value.filter(u => (!q || u.name.toLowerCase().includes(q)) && !boardObservers.value.some(m => m.id === u.id))
})

const openBoardModal = (presetObject = null) => {
  boardName.value = ''
  boardObject.value = presetObject
  boardObjectQuery.value = presetObject?.name || ''
  boardObjectOpen.value = false
  const self = selfUserOption()
  boardExecutors.value = self ? [self] : []   // автоматически добавляем себя в исполнители
  boardExecQuery.value = ''
  boardExecOpen.value = false
  boardObservers.value = []
  boardObsQuery.value = ''
  boardObsOpen.value = false
  showBoardModal.value = true
}
const openBoardModalForCurrentProject = () => {
  const p = currentProject.value
  openBoardModal(p ? { id: p.id, name: p.name, type: p.type === 'object_id' ? 'object' : 'project' } : null)
}
const closeBoardModal = () => { showBoardModal.value = false }
const selectBoardObject = (o) => { boardObject.value = o; boardObjectQuery.value = o.name; boardObjectOpen.value = false }
const clearBoardObject = () => { boardObject.value = null; boardObjectQuery.value = '' }
const addBoardExec = (u) => { if (!boardExecutors.value.some(m => m.id === u.id)) boardExecutors.value.push(u); boardExecQuery.value = ''; boardExecOpen.value = false }
const removeBoardExec = (id) => { boardExecutors.value = boardExecutors.value.filter(m => m.id !== id) }
const addBoardObs = (u) => { if (!boardObservers.value.some(m => m.id === u.id)) boardObservers.value.push(u); boardObsQuery.value = ''; boardObsOpen.value = false }
const removeBoardObs = (id) => { boardObservers.value = boardObservers.value.filter(m => m.id !== id) }

const postBoardRole = (boardId, userId, role) =>
  fetch('/apisup/supply/task-boards-user-roles', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task_boards_id: boardId, user_id: userId, role }),
  })

const submitBoard = async () => {
  if (!boardName.value.trim() || !boardObject.value || boardSubmitting.value) return
  boardSubmitting.value = true
  try {
    const r = await fetch('/apisup/supply/task-boards', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: boardName.value.trim(),
        object_id: boardObject.value.id,
        object_type: boardObject.value.type === 'object' ? 'object_id' : 'object_levels_id',
      }),
    })
    let boardId = null
    if (r.ok) { const d = await r.json().catch(() => ({})); boardId = d.id ?? d.data?.id ?? null }
    if (boardId) {
      const selfId = authStore.user?.id
      if (selfId) await postBoardRole(boardId, selfId, 'responsible')  // создатель
      for (const m of boardExecutors.value) await postBoardRole(boardId, m.id, 'co-executor')
      for (const m of boardObservers.value) await postBoardRole(boardId, m.id, 'observer')
    }
    await loadBoards()
    closeBoardModal()
  } catch (e) { console.error(e) } finally { boardSubmitting.value = false }
}

// ─── Меню доски (три точки) ───────────────────────────────────────────────────
const boardMenuId = ref(null)
const boardMenuStyle = ref({})
const toggleBoardMenu = (id, ev) => {
  if (boardMenuId.value === id) { boardMenuId.value = null; return }
  const rect = ev.currentTarget.getBoundingClientRect()
  boardMenuStyle.value = { position: 'fixed', top: rect.bottom + 4 + 'px', left: Math.max(8, rect.right - 170) + 'px', zIndex: 9999 }
  boardMenuId.value = id
}
const closeBoardMenu = () => { boardMenuId.value = null }
const boardById = (id) => boardsRaw.value.find(b => b.id === id) || null

// Редактирование названия
const showBoardRename = ref(false)
const renameBoardId = ref(null)
const renameBoardName = ref('')
const showRenameConfirm = ref(false)
const boardOpSubmitting = ref(false)
const openBoardRename = (id) => {
  const b = boardById(id); if (!b) return
  renameBoardId.value = id; renameBoardName.value = b.name
  showBoardRename.value = true; closeBoardMenu()
}
const askRenameConfirm = () => { if (renameBoardName.value.trim()) showRenameConfirm.value = true }
const confirmBoardRename = async () => {
  if (boardOpSubmitting.value) return
  boardOpSubmitting.value = true
  try {
    const r = await fetch(`/apisup/supply/task-boards/${renameBoardId.value}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: renameBoardName.value.trim() }),
    })
    if (r.ok) {
      await loadBoards()
      if (boardDetail.value?.id === renameBoardId.value) boardDetail.value.name = renameBoardName.value.trim()
    }
    showRenameConfirm.value = false; showBoardRename.value = false
  } catch (e) { console.error(e) } finally { boardOpSubmitting.value = false }
}

// Удаление доски
const showBoardDelete = ref(false)
const deleteBoardId = ref(null)
const openBoardDelete = (id) => { deleteBoardId.value = id; showBoardDelete.value = true; closeBoardMenu() }
const confirmBoardDelete = async () => {
  if (boardOpSubmitting.value) return
  boardOpSubmitting.value = true
  try {
    const r = await fetch(`/apisup/supply/task-boards/${deleteBoardId.value}`, { method: 'DELETE', credentials: 'include' })
    if (r.ok) {
      if (selectedBoardId.value === deleteBoardId.value) { selectedBoardId.value = null; boardDetail.value = null }
      await loadBoards()
      showBoardDelete.value = false
    }
  } catch (e) { console.error(e) } finally { boardOpSubmitting.value = false }
}

// Участники / доступы
const showBoardMembers = ref(false)
const membersBoardId = ref(null)
const membersRoles = ref([])   // [{ id, user_id, role, name, initials }]
const membersExecQuery = ref('')
const membersObsQuery = ref('')
const membersExecOpen = ref(false)
const membersObsOpen = ref(false)
const membersExecList = computed(() => membersRoles.value.filter(r => r.role === 'co-executor'))
const membersObsList = computed(() => membersRoles.value.filter(r => r.role === 'observer'))
const membersExecFiltered = computed(() => {
  const q = membersExecQuery.value.toLowerCase().trim()
  return USERS.value.filter(u => (!q || u.name.toLowerCase().includes(q)) && !membersRoles.value.some(r => r.user_id === u.id && r.role === 'co-executor'))
})
const membersObsFiltered = computed(() => {
  const q = membersObsQuery.value.toLowerCase().trim()
  return USERS.value.filter(u => (!q || u.name.toLowerCase().includes(q)) && !membersRoles.value.some(r => r.user_id === u.id && r.role === 'observer'))
})
const openBoardMembers = async (id) => {
  membersBoardId.value = id; showBoardMembers.value = true; closeBoardMenu()
  membersRoles.value = []
  let roles = boardById(id)?.user_roles || []
  try {
    const r = await fetch(`/apisup/supply/task-boards/${id}`, { credentials: 'include' })
    if (r.ok) { const b = await r.json(); roles = b.user_roles || roles }
  } catch {}
  membersRoles.value = roles.map(r => {
    const u = USERS.value.find(x => x.id === r.user_id)
    return { id: r.id, user_id: r.user_id, role: r.role, name: u?.name || r.user?.short_fio || '?', initials: u?.initials || '?' }
  })
}
const addMemberRole = async (u, role) => {
  const r = await postBoardRole(membersBoardId.value, u.id, role)
  if (r.ok) { const d = await r.json().catch(() => ({})); membersRoles.value.push({ id: d.id ?? d.data?.id, user_id: u.id, role, name: u.name, initials: u.initials }) }
  membersExecQuery.value = ''; membersObsQuery.value = ''; membersExecOpen.value = false; membersObsOpen.value = false
}
const removeMemberRole = async (roleId) => {
  const r = await fetch(`/apisup/supply/task-boards-user-roles/${roleId}`, { method: 'DELETE', credentials: 'include' })
  if (r.ok) membersRoles.value = membersRoles.value.filter(x => x.id !== roleId)
}
const closeBoardMembers = () => { showBoardMembers.value = false }

// ─── Колонки доски ────────────────────────────────────────────────────────────
const newColName = ref('')
const colCreating = ref(false)
const createColumn = async () => {
  const name = newColName.value.trim()
  const b = boardDetail.value
  if (!name || !b || colCreating.value) return
  colCreating.value = true
  const num = b.columns.length ? Math.max(...b.columns.map(c => c.num ?? 0)) + 1 : 0
  try {
    const r = await fetch('/apisup/supply/task-board-columns', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_board_id: b.id, num, name }),
    })
    if (r.ok) {
      const d = await r.json().catch(() => ({}))
      const colId = d.id ?? d.data?.id
      // без дублей: WS column_created может прийти параллельно
      if (colId != null && !b.columns.some(c => String(c.id) === String(colId))) {
        b.columns.push({ id: colId, task_board_id: b.id, num, name })
      }
    }
    newColName.value = ''
  } catch (e) { console.error(e) } finally { colCreating.value = false }
}

// Редактирование названия колонки
const editingColId = ref(null)
const editingColName = ref('')
const startEditCol = (col) => { editingColId.value = col.id; editingColName.value = col.name }
const saveColName = async (col) => {
  const name = editingColName.value.trim()
  editingColId.value = null
  if (!name || name === col.name) return
  col.name = name
  try {
    await fetch(`/apisup/supply/task-board-columns/${col.id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
  } catch (e) { console.error(e) }
}

// Меню колонки (Удалить)
const colMenuId = ref(null)
const colMenuStyle = ref({})
const toggleColMenu = (col, ev) => {
  if (colMenuId.value === col.id) { colMenuId.value = null; return }
  const rect = ev.currentTarget.getBoundingClientRect()
  colMenuStyle.value = { position: 'fixed', top: (rect.bottom + 4) + 'px', left: Math.max(8, rect.right - 150) + 'px', zIndex: 9999 }
  colMenuId.value = col.id
}
const closeColMenu = () => { colMenuId.value = null }
const deleteColumn = async (colId) => {
  closeColMenu()
  try {
    const r = await fetch(`/apisup/supply/task-board-columns/${colId}`, { method: 'DELETE', credentials: 'include' })
    if (r.ok && boardDetail.value) {
      boardDetail.value.columns = boardDetail.value.columns.filter(c => c.id !== colId)
      boardTasks.value = boardTasks.value.filter(t => t.columnId !== colId)
    }
  } catch (e) { console.error(e) }
}

// Перемещение колонок (drag-n-drop по горизонтали)
const colDragId = ref(null)
const colDragOverId = ref(null)
const colDropBefore = ref(true)
const onColDragStart = (col, e) => {
  colDragId.value = col.id
  e.dataTransfer.effectAllowed = 'move'
  e.stopPropagation()
}
const onColDragOver = (col, e) => {
  if (!colDragId.value) return
  e.preventDefault(); e.stopPropagation()
  const rect = e.currentTarget.getBoundingClientRect()
  colDropBefore.value = (e.clientX - rect.left) < rect.width / 2
  colDragOverId.value = col.id
}
const onColDragEnd = () => { colDragId.value = null; colDragOverId.value = null }
const onColDrop = async (targetCol, e) => {
  const dragId = colDragId.value
  if (!dragId || !boardDetail.value) return  // не колонка — пусть обработает drop карточки
  e.preventDefault(); e.stopPropagation()
  const before = colDropBefore.value
  colDragId.value = null; colDragOverId.value = null
  const cols = [...boardDetail.value.columns]
  const dragged = cols.find(c => c.id === dragId)
  if (!dragged || dragId === targetCol.id) return
  const rest = cols.filter(c => c.id !== dragId)
  let idx = rest.findIndex(c => c.id === targetCol.id)
  if (idx === -1) idx = rest.length
  if (!before) idx++
  rest.splice(idx, 0, dragged)
  rest.forEach((c, i) => { c.num = i })
  boardDetail.value.columns = rest
  try {
    await fetch(`/apisup/supply/task-board-columns/${dragged.id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ num: dragged.num }),
    })
  } catch (err) { console.error(err) }
}

// ─── Создание задачи в колонке ────────────────────────────────────────────────
const addTaskColId = ref(null)
const newTaskTitle = ref('')
const colTaskCreating = ref(false)
const startAddColTask = (colId) => { addTaskColId.value = colId; newTaskTitle.value = '' }
const cancelAddColTask = () => { addTaskColId.value = null; newTaskTitle.value = '' }
const createTaskInColumn = async (colId) => {
  const name = newTaskTitle.value.trim()
  if (!name || colTaskCreating.value) return
  colTaskCreating.value = true
  const b = boardDetail.value
  // vertical_num = последний + 1 (задача встаёт наверх колонки)
  const colNums = boardTasks.value.filter(t => t.columnId === colId).map(t => t.verticalNum ?? 0)
  const verticalNum = colNums.length ? Math.max(...colNums) + 1 : 0
  try {
    const r = await fetch('/apisup/supply/tasks', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        status_id: DEFAULT_STATUS_ID,
        object_id: b?.object_id ?? null,
        object_type: b?.object_type ?? null,
        connection_id: colId,
        connection_type: 'task-columns',
        vertical_num: verticalNum,
      }),
    })
    if (r.ok) {
      const d = await r.json().catch(() => ({}))
      const id = d.id ?? d.data?.id
      upsertTaskIn(boardTasks.value, mapTask({ id, name, connection_id: colId, connection_type: 'task-columns', user_roles: [], status_id: DEFAULT_STATUS_ID, vertical_num: verticalNum }))
    }
    newTaskTitle.value = ''
  } catch (e) { console.error(e) } finally { colTaskCreating.value = false }
}

const userInitials = (u) => {
  const s = (u.surname?.[0] ?? '').toUpperCase()
  const n = (u.name?.[0] ?? '').toUpperCase()
  return s + n || u.name?.[0]?.toUpperCase() || '?'
}
const userName = (u) => [u.surname, u.name, u.patronymic].filter(Boolean).join(' ')

// ─── Реалтайм по WebSocket ────────────────────────────────────────────────────
const sameId = (a, b) => String(a) === String(b)
const upsertTaskIn = (arr, mapped) => {
  const i = arr.findIndex(t => sameId(t.id, mapped.id))
  if (i !== -1) arr[i] = { ...arr[i], ...mapped }
  else arr.push(mapped)
}
const handleTaskWsEvent = (ev) => {
  if (!ev) return
  const p = ev.payload || {}
  switch (ev.type) {
    case 'task_created':
    case 'task_updated': {
      if (!p.task) break
      const mapped = mapTask(p.task)
      // список задач (без дублей — по строковому id)
      const li = tasks.value.findIndex(t => sameId(t.id, mapped.id))
      if (li !== -1) tasks.value[li] = mapped
      else if (ev.type === 'task_created') tasks.value.push(mapped)
      // задачи доски (если относится к открытой доске)
      if (boardDetail.value?.columns?.some(c => sameId(c.id, mapped.columnId))) {
        upsertTaskIn(boardTasks.value, mapped)
      } else {
        const bi = boardTasks.value.findIndex(t => sameId(t.id, mapped.id))
        if (bi !== -1) boardTasks.value.splice(bi, 1) // задачу перенесли из этой доски
      }
      // открытая карточка: обновляем только если её не редактируют (нет открытых поповеров/панелей)
      if (viewTask.value?.id === mapped.id && !showResultModal.value && !viewingResult.value) {
        // сохраняем rawUserRoles/accomplishments из свежих данных
        viewTask.value = mapped
      }
      break
    }
    case 'task_deleted': {
      const id = p.task_id ?? p.task?.id
      if (!id) break
      const li = tasks.value.findIndex(t => sameId(t.id, id)); if (li !== -1) tasks.value.splice(li, 1)
      const bi = boardTasks.value.findIndex(t => sameId(t.id, id)); if (bi !== -1) boardTasks.value.splice(bi, 1)
      if (sameId(viewTask.value?.id, id)) closeTask()
      break
    }
    case 'task_log': {
      const log = p.log
      if (log && viewTask.value && sameId(log.log_object_id, viewTask.value.id)) {
        if (!taskLogs.value.some(l => sameId(l.id, log.id))) {
          taskLogs.value = [...taskLogs.value, log]
          nextTick(chatScrollBottom)
        }
      }
      break
    }
    case 'board_created':
    case 'board_updated':
    case 'board_deleted': {
      loadBoards()
      if (ev.type === 'board_deleted' && p.board_id === selectedBoardId.value) {
        selectedBoardId.value = null; boardDetail.value = null
      }
      break
    }
    case 'column_created':
    case 'column_updated':
    case 'column_deleted': {
      if (!boardDetail.value || !sameId(boardDetail.value.id, p.board_id)) break
      if (ev.type === 'column_deleted') {
        boardDetail.value.columns = boardDetail.value.columns.filter(c => !sameId(c.id, p.column_id))
        boardTasks.value = boardTasks.value.filter(t => !sameId(t.columnId, p.column_id))
      } else if (p.column) {
        const cols = boardDetail.value.columns
        const i = cols.findIndex(c => sameId(c.id, p.column.id))
        if (i !== -1) cols[i] = { ...cols[i], ...p.column }
        else cols.push(p.column)
        cols.sort((a, b) => (a.num ?? 0) - (b.num ?? 0))
      }
      break
    }
  }
}
watch(() => tasksStore.lastEvent, handleTaskWsEvent)

onMounted(async () => {
  // Пользователи
  try {
    const r = await fetch('/api/as/users/all', { credentials: 'include' })
    if (r.ok) {
      const data = await r.json()
      USERS.value = (data.items ?? data).map(u => ({
        id: u.id,
        name: userName(u),
        initials: userInitials(u),
      }))
    }
  } catch {}

  // Задачи (по умолчанию — все)
  await loadTasks(selectedFilter.value)

  // Открыть задачу из query-параметра (переход из чата)
  const taskIdFromQuery = route.query.task
  if (taskIdFromQuery) {
    const found = tasks.value.find(t => String(t.id) === String(taskIdFromQuery))
    if (found) {
      openTask(found)
    } else {
      // Задача может не быть в списке (фильтр), загружаем напрямую
      openTask({ id: taskIdFromQuery, title: '' })
    }
    router.replace({ query: { ...route.query, task: undefined } })
  }

  // Открыть модалку создания задачи, привязанной к сущности (переход из договора/счёта и т.д.)
  if (route.query.create && route.query.connType && route.query.connId) {
    openCreateModal({ type: String(route.query.connType), id: String(route.query.connId) })
    router.replace({ query: { ...route.query, create: undefined, connType: undefined, connId: undefined } })
  }

  // Объекты (apiref)
  try {
    const r = await fetch('/apiref/ref/objects', { credentials: 'include' })
    if (r.ok) {
      const data = await r.json()
      const list = data.items ?? data
      list.forEach(o => projectOptions.value.push({ id: o.id, name: o.short_name, type: 'object' }))
    }
  } catch {}

  // Проекты (request-objects)
  try {
    const r = await fetch('/apisup/supply/request-objects/my', { credentials: 'include' })
    if (r.ok) {
      const data = await r.json()
      const list = data.items ?? data
      list.forEach(o => projectOptions.value.push({ id: o.id, name: o.name, type: 'project' }))
    }
  } catch {}

  await loadBoards()

  // Восстанавливаем последний раздел/доску после перезагрузки
  try {
    const saved = JSON.parse(localStorage.getItem(NAV_STORAGE_KEY) || 'null')
    if (saved && !taskIdFromQuery) {
      if (saved.boardId && boardsRaw.value.some(b => b.id === saved.boardId)) {
        const b = boardsRaw.value.find(x => x.id === saved.boardId)
        selectedProjectId.value = b.object_id
        selectedFilter.value = null
        boardsOpen.value = true
        await selectBoard(saved.boardId)
      } else if (saved.projectId && projects.value.some(p => p.id === saved.projectId)) {
        selectProject(saved.projectId)
      } else if (saved.filter && saved.filter !== selectedFilter.value) {
        selectFilter(saved.filter)
      }
    }
  } catch {}

  timerInterval = setInterval(() => { nowTick.value = moscowNowMs() }, 1000)
})

onUnmounted(() => {
  if (timerInterval) clearInterval(timerInterval)
})

// ─── Create task modal ────────────────────────────────────────────────────────
const showCreateModal     = ref(false)
const showChecklistModal  = ref(false)  // kept for compat
const showChecklistPanel  = ref(false)

const emptyForm = () => ({
  title: '', priority: null, description: '',
  assigneeId: null, coexecutorIds: [], observerIds: [],
  projectId: null, startDate: '', deadline: '',
  files: [], subtasks: [], tags: [],
  connectionType: null, connectionId: null,
})
const createForm = ref(emptyForm())

// ─── Dropdown teleport positioning ───────────────────────────────────────────
const ddAssignee    = ref(false)
const ddCoexecutors = ref(false)
const ddObservers   = ref(false)
const ddProject     = ref(false)
const ddPriority    = ref(false)
const searchAssignee    = ref('')
const searchCoexecutors = ref('')
const searchObservers   = ref('')
const searchProject     = ref('')
const tagInput          = ref('')

const tagInputFocused = ref(false)

const allTags = computed(() => {
  const set = new Set()
  tasks.value.forEach(t => t.tags?.forEach(tag => set.add(tag)))
  return [...set]
})

const tagSuggestions = computed(() => {
  const q = tagInput.value.trim().toLowerCase()
  if (!q) return allTags.value.filter(t => !createForm.value.tags.includes(t))
  return allTags.value.filter(t => t.toLowerCase().includes(q) && !createForm.value.tags.includes(t))
})

const addTag = (val) => {
  const t = (val ?? tagInput.value).trim().replace(/^#+/, '')
  if (t && !createForm.value.tags.includes(t)) createForm.value.tags.push(t)
  tagInput.value = ''
}
const removeTag = (i) => { createForm.value.tags.splice(i, 1) }

const onTagKeydown = (e) => {
  if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
    e.preventDefault()
    addTag()
  } else if (e.key === 'Backspace' && !tagInput.value) {
    removeTag(createForm.value.tags.length - 1)
  } else if (e.key === 'Escape') {
    tagInput.value = ''; tagInputFocused.value = false
  }
}
const onTagInput = () => {
  const val = tagInput.value
  const secondHash = val.indexOf('#', 1)
  if (secondHash > 0) {
    addTag(val.slice(0, secondHash))
    tagInput.value = val.slice(secondHash)
  }
}

const filteredUsers = (q) => USERS.value.filter(u => u.name.toLowerCase().includes(q.toLowerCase()))
const filteredProjects = computed(() =>
  projectOptions.value.filter(p => p.name.toLowerCase().includes(searchProject.value.toLowerCase()))
)

const ddRects = reactive({})
const closeAllDropdowns = () => {
  ddAssignee.value = false; ddCoexecutors.value = false
  ddObservers.value = false; ddProject.value = false; ddPriority.value = false
}
const openDDField = (name, event) => {
  closeAllDropdowns(); calOpen.value = false
  const r = event.currentTarget.getBoundingClientRect()
  ddRects[name] = { top: r.bottom + 2, left: r.left, width: Math.max(r.width, 220) }
  if (name === 'assignee')    ddAssignee.value    = true
  else if (name === 'coexecutors') ddCoexecutors.value = true
  else if (name === 'observers')   ddObservers.value   = true
  else if (name === 'project')     ddProject.value     = true
}
const ddFixedStyle = (name) => {
  const r = ddRects[name]; if (!r) return {}
  return { position: 'fixed', top: r.top + 'px', left: r.left + 'px', minWidth: r.width + 'px', zIndex: 9999 }
}

const openCreateModal = (connection = null) => {
  createForm.value = emptyForm()
  if (connection?.type && connection?.id) {
    createForm.value.connectionType = connection.type
    createForm.value.connectionId = connection.id
  }
  showCreateModal.value = true
  closeAllDropdowns()
}
const closeCreateModal = () => { showCreateModal.value = false }

// ─── Calendar ────────────────────────────────────────────────────────────────
const calOpen   = ref(false)
const calField  = ref('deadline')
const calView   = ref('date')   // 'date' | 'time'
const calYear   = ref(new Date().getFullYear())
const calMonth  = ref(new Date().getMonth())
const calAnchor = ref(null)

const MONTH_RU    = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']
const MONTH_SHORT = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря']
const DAYNAMES_RU = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота']

const parseApiDate = (s) => {
  if (!s) return null
  // "dd.mm.yyyy HH:MM" или "dd.mm.yyyy HH:MM:SS"
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/)
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +(m[6] || 0))
  return new Date(s) // ISO fallback
}

const toInputDate = (d) => {
  const p = n => n.toString().padStart(2,'0')
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
const calTarget = ref('create') // 'create' | 'task'

const getFieldDate = () => {
  const v = calTarget.value === 'task' ? viewTask.value?.[calField.value]
    : calTarget.value === 'card' ? cardCalTask.value?.[calField.value]
    : createForm.value[calField.value]
  return v ? new Date(v) : null
}
const setCalValue = (val) => {
  if (calTarget.value === 'task' && viewTask.value) {
    viewTask.value[calField.value] = val
    saveTaskField(calField.value)
  } else if (calTarget.value === 'card' && cardCalTask.value) {
    const t = cardCalTask.value
    t[calField.value] = val
    syncBoardTaskToDetail(t)
    patchTaskById(t.id, { [calField.value === 'startDate' ? 'date_start' : 'date_end']: val || null })
  } else {
    createForm.value[calField.value] = val
  }
}
const formatCalDate = (val) => {
  if (!val) return ''
  const d = new Date(val)
  const p = n => n.toString().padStart(2,'0')
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}`
}

const openCal = (field, event) => {
  calTarget.value = 'create'
  calField.value = field; calView.value = 'date'
  const d = createForm.value[field] ? new Date(createForm.value[field]) : new Date()
  calYear.value = d.getFullYear(); calMonth.value = d.getMonth()
  calAnchor.value = event.currentTarget.getBoundingClientRect()
  calOpen.value = true; closeAllDropdowns()
}

const openTdCal = (field, event) => {
  calTarget.value = 'task'
  calField.value = field; calView.value = 'date'
  const d = viewTask.value?.[field] ? new Date(viewTask.value[field]) : new Date()
  calYear.value = d.getFullYear(); calMonth.value = d.getMonth()
  calAnchor.value = event.currentTarget.getBoundingClientRect()
  calOpen.value = true; closeTdDDs()
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
  const offset   = firstDow === 0 ? 6 : firstDow - 1
  const inMonth  = new Date(y, m + 1, 0).getDate()
  const inPrev   = new Date(y, m, 0).getDate()
  const cells    = []
  for (let i = offset - 1; i >= 0; i--)
    cells.push({ d: inPrev - i, m: m === 0 ? 11 : m - 1, y: m === 0 ? y - 1 : y, out: true })
  for (let i = 1; i <= inMonth; i++)
    cells.push({ d: i, m, y, out: false })
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
  setCalValue(toInputDate(nd))
  calView.value = 'time'
}
const selectCalHour = (h) => {
  const d = getFieldDate() || new Date(); d.setHours(h)
  setCalValue(toInputDate(d))
}
const selectCalMinute = (m) => {
  const d = getFieldDate() || new Date(); d.setMinutes(m)
  setCalValue(toInputDate(d))
}

const calViewTitle = computed(() => {
  if (calView.value === 'time') {
    const d = getFieldDate(); if (!d) return ''
    const p = n => n.toString().padStart(2,'0')
    return `${p(d.getDate())}.${p(d.getMonth()+1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
  }
  return `${MONTH_RU[calMonth.value]}  ${calYear.value}`
})
const calTimeFmt = computed(() => {
  const d = getFieldDate(); if (!d) return '19:00'
  const p = n => n.toString().padStart(2,'0'); return `${p(d.getHours())}:${p(d.getMinutes())}`
})

const quickDates = computed(() => {
  const today = new Date(); today.setHours(0,0,0,0)
  const dow = today.getDay()
  const toFri = dow === 5 ? 0 : (5 - dow + 7) % 7
  const endWeek  = new Date(today); endWeek.setDate(today.getDate() + toFri)
  const nextWeek = new Date(today); nextWeek.setDate(today.getDate() + 7)
  const endMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  const fmt = d => `${DAYNAMES_RU[d.getDay()]}, ${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`
  return [
    { label: 'Сегодня',        sub: fmt(today),    date: today    },
    { label: 'Завтра',         sub: fmt(tomorrow), date: tomorrow },
    { label: 'В конце недели', sub: fmt(endWeek),  date: endWeek  },
    { label: 'Через неделю',   sub: fmt(nextWeek), date: nextWeek },
    { label: 'В конце месяца', sub: fmt(endMonth), date: endMonth },
  ]
})
const applyQuickDate = (qd) => {
  const ex = getFieldDate()
  const d = new Date(qd.date); d.setHours(ex?.getHours() ?? 19, ex?.getMinutes() ?? 0)
  setCalValue(toInputDate(d))
  calYear.value = d.getFullYear(); calMonth.value = d.getMonth()
}

// ─── Checklist ────────────────────────────────────────────────────────────────
const clActiveItem    = ref(null)
const clActivePopover = ref(null)
const clPopAnchor     = ref(null)
const clEditingId     = ref(null)

const clPopStyle = computed(() => {
  if (!clPopAnchor.value) return {}
  return { position: 'fixed', top: clPopAnchor.value.top + 'px', left: clPopAnchor.value.left + 'px', zIndex: 9999 }
})

const openChecklist  = () => { showChecklistPanel.value = true }
const closeChecklist = () => {
  showChecklistPanel.value = false
  clActiveItem.value = null; clActivePopover.value = null; clEditingId.value = null; clPopAnchor.value = null
}

const addClItem = async () => {
  const newItem = { id: Date.now(), title: '', done: false, priority: null, coexecutorIds: [], observerIds: [] }
  createForm.value.subtasks.push(newItem)
  clEditingId.value = newItem.id; clActiveItem.value = newItem.id
  await nextTick()
  document.getElementById('cl-input-' + newItem.id)?.focus()
}
const onClItemBlur = (item, idx) => {
  if (!item.title.trim()) createForm.value.subtasks.splice(idx, 1)
  if (clEditingId.value === item.id) clEditingId.value = null
}
const onClItemEnter = async (item) => {
  if (!item.title.trim()) return
  clEditingId.value = null; await addClItem()
}
const removeSubtask = (idx) => { createForm.value.subtasks.splice(idx, 1) }

const toggleClPopover = (itemId, popover, event) => {
  if (clActiveItem.value === itemId && clActivePopover.value === popover) {
    clActiveItem.value = null; clActivePopover.value = null; clPopAnchor.value = null
  } else {
    clActiveItem.value = itemId; clActivePopover.value = popover
    if (event) {
      const r = event.currentTarget.getBoundingClientRect()
      clPopAnchor.value = { top: r.bottom + 4, left: r.left }
    }
  }
}
const setClPriority = (item, key) => {
  item.priority = item.priority === key ? null : key
  clActiveItem.value = null; clActivePopover.value = null; clPopAnchor.value = null
}
const toggleClCoexecutor = (item, uid) => {
  const idx = item.coexecutorIds.indexOf(uid)
  idx === -1 ? item.coexecutorIds.push(uid) : item.coexecutorIds.splice(idx, 1)
}
const toggleClObserver = (item, uid) => {
  const idx = item.observerIds.indexOf(uid)
  idx === -1 ? item.observerIds.push(uid) : item.observerIds.splice(idx, 1)
}

// ─── File upload ──────────────────────────────────────────────────────────────
const onFileInput = (e) => {
  createForm.value.files.push(...Array.from(e.target.files || []))
  e.target.value = ''
}
const removeFile = (idx) => { createForm.value.files.splice(idx, 1) }

// ─── Task detail modal ───────────────────────────────────────────────────────
const viewTask       = ref(null)
const viewTaskMenu   = ref(false)  // three-dot menu
const tdTitleEl      = ref(null)
// авто-высота заголовка: растёт под текст, максимум 3 строки
const autosizeTitle = (el) => {
  if (!el) return
  el.style.height = 'auto'
  const line = parseFloat(getComputedStyle(el).lineHeight) || 22
  el.style.height = Math.min(el.scrollHeight, Math.round(line * 3)) + 'px'
}
watch(() => viewTask.value?.id, () => {
  nextTick(() => autosizeTitle(tdTitleEl.value))
})

const chatDraft  = ref('')
const chatEl     = ref(null)

const taskDetailLoading = ref(false)
const openTask = async (task) => {
  viewTask.value = { ...task }
  viewTaskMenu.value = false
  taskDetailLoading.value = true
  try {
    const r = await fetch(`/apisup/supply/tasks/${task.id}`, { credentials: 'include' })
    if (r.ok) {
      const data = await r.json()
      viewTask.value = mapTask(data)
      // Open/create chat
      await chatStore.openPanel('task', String(task.id), data.chat_id || null, data.name || task.title)
      if (!data.chat_id) await chatStore.ensureChat()
      loadTaskLogs(String(task.id))
    }
  } catch (e) { console.error(e) } finally { taskDetailLoading.value = false }
}
const closeTask = () => {
  viewTask.value = null
  viewTaskMenu.value = false
  chatStore.closePanel()
}

// ─── Выполнение задачи (accomplishments) ──────────────────────────────────────
const accBusy = ref(false)

// Московское время (UTC+3), но в ISO-формате с суффиксом Z — чтобы в БД
// сохранялись именно московские числа времени.
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000
const moscowNowMs = () => Date.now() + MSK_OFFSET_MS
const moscowNowISO = () => new Date(moscowNowMs()).toISOString()

// Начать — создаёт accomplishment и переводит задачу в статус «Выполняется»
const startTask = async () => {
  const t = viewTask.value
  if (!t || accBusy.value) return
  accBusy.value = true
  const nowISO = moscowNowISO()
  try {
    const r = await fetch('/apisup/supply/task-accomplishments', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: t.id, date_start: nowISO, status_id: IN_PROGRESS_STATUS_ID }),
    })
    if (r.ok) {
      const data = await r.json()
      t.accomplishments.push({
        id: data.id ?? data.data?.id,
        task_id: t.id,
        date_start: nowISO, date_end: null, date_stop: null,
        elapsed: null, status_id: IN_PROGRESS_STATUS_ID, status_name: 'Выполняется',
        created_by: myId.value,
      })
      // Перевести задачу в «Выполняется», если ещё не так
      if (t.statusId !== IN_PROGRESS_STATUS_ID) {
        await patchTask({ status_id: IN_PROGRESS_STATUS_ID })
        t.statusId = IN_PROGRESS_STATUS_ID
        t.status = 'Выполняется'
      }
      syncTaskToList()
    }
  } catch (e) { console.error(e) } finally { accBusy.value = false }
}

// Приостановить — фиксирует date_stop у активного выполнения
const pauseMyAcc = async () => {
  const acc = myAcc.value
  if (!acc || accBusy.value) return
  accBusy.value = true
  const nowISO = moscowNowISO()
  try {
    const r = await fetch(`/apisup/supply/task-accomplishments/${acc.id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: viewTask.value.id, date_stop: nowISO, status_id: PAUSED_STATUS_ID }),
    })
    if (r.ok) { acc.date_stop = nowISO; acc.status_id = PAUSED_STATUS_ID; acc.status_name = 'Приостановлено' }
  } catch (e) { console.error(e) } finally { accBusy.value = false }
}

// Возобновить — снимает date_stop и сдвигает date_start вперёд на длительность паузы,
// чтобы таймер продолжился с того же значения, а не «дорос» на простоявшее время
const resumeMyAcc = async () => {
  const acc = myAcc.value
  if (!acc || accBusy.value) return
  accBusy.value = true
  const startEpoch = accEpoch(acc.date_start)
  const stopEpoch = accEpoch(acc.date_stop)
  let newStartISO = null
  if (startEpoch != null && stopEpoch != null) {
    const pausedMs = Math.max(0, moscowNowMs() - stopEpoch)
    newStartISO = new Date(startEpoch + pausedMs).toISOString()
  }
  try {
    const body = { task_id: viewTask.value.id, date_stop: null, status_id: IN_PROGRESS_STATUS_ID }
    if (newStartISO) body.date_start = newStartISO
    const r = await fetch(`/apisup/supply/task-accomplishments/${acc.id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (r.ok) {
      if (newStartISO) acc.date_start = newStartISO
      acc.date_stop = null; acc.status_id = IN_PROGRESS_STATUS_ID; acc.status_name = 'Выполняется'
    }
  } catch (e) { console.error(e) } finally { accBusy.value = false }
}

// Все ли исполнители (ответственный + соисполнители) завершили своё выполнение
const allExecutorsFinished = () => {
  const exs = executors.value
  if (!exs.length) return false
  return exs.every(ex => accStateForUser(ex.userId) === 'finished')
}

// Завершить своё выполнение — проставляет date_end.
// Если после этого все исполнители завершили — задача переходит в «Завершена».
const finishMyAcc = async () => {
  const acc = myAcc.value
  if (!acc || accBusy.value) return
  accBusy.value = true
  const nowISO = moscowNowISO()
  try {
    const r = await fetch(`/apisup/supply/task-accomplishments/${acc.id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: viewTask.value.id, date_end: nowISO, status_id: COMPLETED_STATUS_ID }),
    })
    if (r.ok) {
      acc.date_end = nowISO; acc.date_stop = null; acc.status_id = COMPLETED_STATUS_ID; acc.status_name = 'Завершена'
      const t = viewTask.value
      // Я последний — все закончили → завершаем задачу целиком
      if (t && t.statusId !== COMPLETED_STATUS_ID && allExecutorsFinished()) {
        await patchTask({ date_completed: nowISO, status_id: COMPLETED_STATUS_ID })
        t.statusId = COMPLETED_STATUS_ID
        t.dateCompleted = nowISO
        t.status = 'Завершена'
      }
      syncTaskToList()
    }
  } catch (e) { console.error(e) } finally { accBusy.value = false }
}

// ─── Завершение задачи ────────────────────────────────────────────────────────
const completing = ref(false)
const completeModal = ref(null) // null | { running: string[], notStarted: string[], hasMine: boolean }

// Клик по кнопке «Завершить»
const onCompleteClick = () => {
  // Соисполнитель (не ответственный/создатель) — завершает только своё выполнение
  const canWhole = isResponsible.value || isCreator.value
  if (!canWhole) { finishMyAcc(); return }
  // Ответственный/создатель — проверяем остальных исполнителей
  const running = []
  const notStarted = []
  for (const ex of executors.value) {
    if (ex.userId === myId.value) continue
    const st = accStateForUser(ex.userId)
    if (st === 'running') running.push(ex.name)
    else if (st === 'not_started') notStarted.push(ex.name)
  }
  completeModal.value = { running, notStarted, hasMine: !!myAcc.value }
}

// Завершить задачу для всех: закрыть все открытые выполнения + завершить задачу
const completeForAll = async () => {
  const t = viewTask.value
  if (!t || completing.value) return
  completing.value = true
  const nowISO = moscowNowISO()
  try {
    for (const acc of t.accomplishments.filter(a => !a.date_end)) {
      await fetch(`/apisup/supply/task-accomplishments/${acc.id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: t.id, date_end: nowISO, status_id: COMPLETED_STATUS_ID }),
      })
      acc.date_end = nowISO; acc.date_stop = null; acc.status_id = COMPLETED_STATUS_ID; acc.status_name = 'Завершена'
    }
    await patchTask({ date_completed: nowISO, status_id: COMPLETED_STATUS_ID })
    t.statusId = COMPLETED_STATUS_ID
    t.dateCompleted = nowISO
    t.status = 'Завершена'
    syncTaskToList()
    completeModal.value = null
    viewTaskMenu.value = false
  } catch (e) { console.error(e) } finally { completing.value = false }
}

// Завершить только своё выполнение из модалки
const finishMineFromModal = async () => {
  await finishMyAcc()
  completeModal.value = null
}

// ─── Удаление задачи ──────────────────────────────────────────────────────────
const showDeleteConfirm = ref(false)
const deleting = ref(false)
const deleteTask = () => {
  viewTaskMenu.value = false
  showDeleteConfirm.value = true
}
const confirmDeleteTask = async () => {
  const t = viewTask.value
  if (!t || deleting.value) return
  deleting.value = true
  try {
    const r = await fetch(`/apisup/supply/tasks/${t.id}`, { method: 'DELETE', credentials: 'include' })
    if (r.ok) {
      const idx = tasks.value.findIndex(tk => tk.id === t.id)
      if (idx !== -1) tasks.value.splice(idx, 1)
      const bIdx = boardTasks.value.findIndex(tk => tk.id === t.id)
      if (bIdx !== -1) boardTasks.value.splice(bIdx, 1)
      showDeleteConfirm.value = false
      closeTask()
    }
  } catch (e) { console.error(e) } finally { deleting.value = false }
}

// ─── Результат работы ─────────────────────────────────────────────────────────
const showResultModal = ref(false)
const resultEditor = ref(null)
const resultFiles = ref([])
const resultSubmitting = ref(false)

const openResultModal = () => {
  showResultModal.value = true
  nextTick(() => { if (resultEditor.value) resultEditor.value.innerHTML = '' })
}
const closeResultModal = () => {
  showResultModal.value = false
  resultFiles.value = []
}
// Форматирование содержимого редактора
const execFmt = (cmd, val = null) => {
  resultEditor.value?.focus()
  document.execCommand(cmd, false, val)
}
const insertBlock = (type) => {
  const editor = resultEditor.value
  if (!editor) return
  editor.focus()
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) return
  let range = sel.getRangeAt(0)
  // если каретка вне редактора — ставим в конец
  if (!editor.contains(range.commonAncestorContainer)) {
    range = document.createRange()
    range.selectNodeContents(editor)
    range.collapse(false)
  }
  const selectedText = sel.toString()

  // строим блок
  let block, holder
  if (type === 'code') {
    block = document.createElement('pre'); block.className = 'res-code'; holder = block
  } else if (type === 'quote') {
    block = document.createElement('blockquote'); block.className = 'res-quote'; holder = block
  } else if (type === 'spoiler') {
    block = document.createElement('details'); block.className = 'res-spoiler'; block.open = true
    const summary = document.createElement('summary'); summary.textContent = 'Спойлер'
    holder = document.createElement('div'); holder.className = 'res-spoiler-body'
    block.appendChild(summary); block.appendChild(holder)
  } else return

  if (selectedText) holder.textContent = selectedText
  else holder.appendChild(document.createElement('br'))

  // пустой абзац после блока (чтобы выйти из него на новую строку)
  const after = document.createElement('p')
  after.appendChild(document.createElement('br'))

  const frag = document.createDocumentFragment()
  frag.appendChild(block)
  frag.appendChild(after)

  range.deleteContents()
  range.insertNode(frag)

  // ставим каретку внутрь блока — можно сразу писать
  const inner = document.createRange()
  inner.selectNodeContents(holder)
  inner.collapse(true)
  sel.removeAllRanges()
  sel.addRange(inner)
}
const onResultFiles = (e) => {
  const files = Array.from(e.target.files || [])
  if (files.length) resultFiles.value.push(...files)
  e.target.value = ''
}
const removeResultFile = (i) => resultFiles.value.splice(i, 1)

const submitResult = async () => {
  const t = viewTask.value
  if (!t || resultSubmitting.value) return
  const html = (resultEditor.value?.innerHTML || '').trim()
  const isEmpty = !html || html === '<br>'
  if (isEmpty && !resultFiles.value.length) return
  resultSubmitting.value = true
  try {
    let resultId = null
    const r = await fetch('/apisup/supply/task-results', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: t.id, text: isEmpty ? '' : html }),
    })
    if (r.ok) {
      const d = await r.json().catch(() => ({}))
      resultId = d.id ?? d.data?.id ?? null
    }
    // Загрузка прикреплённых файлов результата
    if (resultFiles.value.length) {
      const fd = new FormData()
      resultFiles.value.forEach(f => fd.append('files', f))
      fd.append('task_id', t.id)
      if (resultId) fd.append('task_result_id', resultId)
      await fetch('/apisup/supply/task-files', { method: 'POST', credentials: 'include', body: fd })
    }
    // Подтягиваем свежие результаты
    try {
      const rr = await fetch(`/apisup/supply/tasks/${t.id}`, { credentials: 'include' })
      if (rr.ok) {
        const data = await rr.json()
        if (viewTask.value?.id === t.id) viewTask.value = mapTask(data)
      }
    } catch {}
    closeResultModal()
  } catch (e) { console.error(e) } finally { resultSubmitting.value = false }
}

// ─── Отображение результатов ──────────────────────────────────────────────────
const viewingResult = ref(null)
const openResultView = (res) => { viewingResult.value = res }
const closeResultView = () => { viewingResult.value = null }
const userById = (id) => USERS.value.find(u => u.id === id) || null
const resultFilesFor = (resultId) => (viewTask.value?.rawFiles || []).filter(f => f.task_result_id === resultId)

const taskResults = computed(() => {
  const list = [...(viewTask.value?.results || [])]
  list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
  const counts = {}
  list.forEach(r => { counts[r.createdBy] = (counts[r.createdBy] || 0) + 1 })
  const seen = {}
  return list.map(r => {
    const u = userById(r.createdBy)
    const name = u?.name || 'Пользователь'
    seen[r.createdBy] = (seen[r.createdBy] || 0) + 1
    const label = counts[r.createdBy] > 1
      ? `Результат от ${name} # ${seen[r.createdBy]}`
      : `Результат от ${name}`
    return { ...r, name, initials: u?.initials || '?', label, files: resultFilesFor(r.id) }
  })
})

// ─── Inline chat helpers ──────────────────────────────────────────────────────
const chatMessageText = ref('')
const chatMessagesEl  = ref(null)
const chatAttachFile  = ref(null)
const chatAttachPreview = ref('')
const chatMentionOpen  = ref(false)
const chatMentionQuery = ref('')
const chatMentionStart = ref(-1)
const chatTextareaRef  = ref(null)
const chatAllUsers     = ref([])

const taskLogs = ref([])
const loadTaskLogs = async (taskId) => {
  taskLogs.value = []
  try {
    const r = await fetch(`/apisup/supply/contract-logs?log_object_id=${encodeURIComponent(taskId)}&log_object_type=task`, { credentials: 'include' })
    if (!r.ok) return
    const data = await r.json()
    const list = Array.isArray(data) ? data : (data.items ?? data.data ?? [])
    taskLogs.value = list.filter(l => String(l.log_object_id) === String(taskId))
    nextTick(chatScrollBottom)
  } catch (e) { console.error(e) }
}

const chatMessageGroups = computed(() => {
  const groups = []; let curDate = null
  const fmt = (s) => {
    if (!s) return ''
    const d = new Date(s), now = new Date()
    const y = new Date(now); y.setDate(y.getDate()-1)
    if (d.toDateString() === now.toDateString()) return 'Сегодня'
    if (d.toDateString() === y.toDateString()) return 'Вчера'
    return d.toLocaleDateString('ru-RU')
  }
  // объединяем сообщения и логи в единую ленту по времени
  const items = [
    ...chatStore.sortedMessages.map(m => ({ kind: 'message', at: m.created_at, data: m })),
    ...taskLogs.value.map(l => ({ kind: 'log', at: l.created_at, data: l })),
  ].sort((a, b) => new Date(a.at) - new Date(b.at))
  for (const it of items) {
    const d = fmt(it.at)
    if (d !== curDate) { curDate = d; groups.push({ type: 'date', label: d }) }
    groups.push({ type: it.kind, data: it.data })
  }
  return groups
})
const chatIsMe = (msg) => String(msg.sender_id) === String(authStore.user?.id)
const chatFmtTime = (s) => s ? new Date(s).toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit' }) : ''
const chatSenderName = (msg) => {
  const s = msg.sender
  return s ? [s.surname, s.name, s.patronymic].filter(Boolean).join(' ') || '—' : '—'
}
const chatRenderText = (t) => (t||'').replace(/@(\S+(?:\s+\S+\.\S*\.?)?)/g, '<span class="mention-inline">@$1</span>')

const chatHandleInput = (e) => {
  const el = e.target, val = el.value, pos = el.selectionStart
  const at = val.lastIndexOf('@', pos-1)
  if (at !== -1 && (at===0 || val[at-1]===' ')) {
    const after = val.slice(at+1, pos)
    if (!after.includes(' ') && after.length <= 30) {
      chatMentionQuery.value = after; chatMentionStart.value = at; chatMentionOpen.value = true
      if (!chatAllUsers.value.length) fetch('/api/as/users/all',{credentials:'include'}).then(r=>r.ok&&r.json()).then(d=>d&&(chatAllUsers.value=d)).catch(()=>{})
      return
    }
  }
  chatMentionOpen.value = false
}
const chatMentionUsers = computed(() => {
  const q = chatMentionQuery.value.toLowerCase()
  return chatAllUsers.value.filter(u => {
    const n = [u.surname,u.name,u.patronymic].filter(Boolean).join(' ').toLowerCase()
    return n.includes(q) && String(u.id) !== String(authStore.user?.id)
  }).slice(0,8)
})
const chatSelectMention = (user) => {
  const before = chatMessageText.value.slice(0, chatMentionStart.value)
  const after  = chatMessageText.value.slice(chatMentionStart.value + 1 + chatMentionQuery.value.length)
  const short  = `${user.surname||''} ${user.name?user.name[0]+'.':''}${user.patronymic?user.patronymic[0]+'.':''}`.trim()
  chatMessageText.value = `${before}@${short} ${after}`
  chatMentionOpen.value = false
  nextTick(() => { chatTextareaRef.value?.focus() })
}
const chatExtractMentions = (text) => {
  const ids = []
  const re = /@(\S+(?:\s+\S+\.\S*\.?)?)/g; let m
  while ((m = re.exec(text)) !== null) {
    const str = m[1].trim().toLowerCase()
    for (const u of chatAllUsers.value) {
      const s = `${(u.surname||'')} ${u.name?u.name[0]+'.':''}${u.patronymic?u.patronymic[0]+'.':''}`.trim().toLowerCase()
      if (s === str && !ids.includes(u.id)) { ids.push(u.id); break }
    }
  }
  return ids
}
const chatHandleFileSelect = (e) => {
  const f = e.target.files?.[0]; if (!f) return
  chatAttachFile.value = f
  if (f.type.startsWith('image/')) {
    const r = new FileReader(); r.onload = ev => chatAttachPreview.value = ev.target?.result||''; r.readAsDataURL(f)
  } else { chatAttachPreview.value = f.name }
}
const chatSend = async () => {
  const text = chatMessageText.value.trim()
  const file = chatAttachFile.value
  if (!text && !file) return
  const mentions = chatExtractMentions(text)
  if (mentions.length) await chatStore.addMentionedUsers(mentions)
  if (file) await chatStore.sendMessageWithAttachment(text, file, mentions)
  else await chatStore.sendMessage(text, mentions)
  chatMessageText.value = ''; chatAttachFile.value = null; chatAttachPreview.value = ''
  await nextTick(); chatScrollBottom()
}
const chatScrollBottom = () => { if (chatMessagesEl.value) chatMessagesEl.value.scrollTop = chatMessagesEl.value.scrollHeight }
const chatKeydown = (e) => {
  if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); chatSend() }
  if (e.key==='Escape') chatMentionOpen.value = false
}
const chatIsImage = (att) => (att.file_type||'').toLowerCase().startsWith('image/')
const chatFullImage = ref(null)
const openChatImage = (url) => { chatFullImage.value = url }
const closeChatImage = () => { chatFullImage.value = null }

watch(() => chatStore.messages.length, () => nextTick(chatScrollBottom))

// ─── Task detail computed ─────────────────────────────────────────────────────
const isCreator = computed(() => viewTask.value?.createdBy === authStore.user?.id)
const isCompleted = computed(() =>
  viewTask.value?.statusId === COMPLETED_STATUS_ID || !!viewTask.value?.dateCompleted
)
// Задача на доске (task-columns) — редактировать может любой, у кого есть доступ к доске
const isBoardTask = computed(() => viewTask.value?.connectionType === 'task-columns')
// Редактировать может постановщик, ответственный исполнитель, либо любой на доске — пока задача не завершена
const canEdit = computed(() => (isCreator.value || isResponsible.value || isBoardTask.value) && !isCompleted.value)
const canCheckItems = computed(() => {
  if (!viewTask.value || !authStore.user) return false
  if (isCompleted.value) return false
  if (isBoardTask.value) return true
  const uid = authStore.user.id
  if (viewTask.value.createdBy === uid) return true
  return viewTask.value.rawUserRoles.some(r =>
    r.user_id === uid && (r.role === 'responsible' || r.role === 'co-executor')
  )
})

// ─── Роли текущего пользователя ───────────────────────────────────────────────
const myId = computed(() => authStore.user?.id)
const isResponsible = computed(() =>
  viewTask.value?.rawUserRoles?.some(r => r.role === 'responsible' && r.user_id === myId.value) ?? false
)
const isCoexecutor = computed(() =>
  viewTask.value?.rawUserRoles?.some(r => r.role === 'co-executor' && r.user_id === myId.value) ?? false
)
const isExecutor = computed(() => isResponsible.value || isCoexecutor.value)

// Список исполнителей (ответственный + соисполнители) для проверок завершения
const executors = computed(() => {
  const t = viewTask.value; if (!t) return []
  return (t.rawUserRoles || [])
    .filter(r => r.role === 'responsible' || r.role === 'co-executor')
    .map(r => ({
      userId: r.user_id,
      role: r.role,
      name: r.user?.short_fio || USERS.value.find(u => u.id === r.user_id)?.name || '?',
    }))
})

// ─── Живой таймер ─────────────────────────────────────────────────────────────
const nowTick = ref(moscowNowMs())
let timerInterval = null

const accsForUser = (userId) => (viewTask.value?.accomplishments || []).filter(a => a.created_by === userId)
// Активное (незавершённое) выполнение пользователя
const activeAccForUser = (userId) => {
  const list = accsForUser(userId).filter(a => !a.date_end)
  return list.length ? list[list.length - 1] : null
}
// Статус выполнения пользователя: not_started | running | paused | finished
const accStateForUser = (userId) => {
  const accs = accsForUser(userId)
  if (!accs.length) return 'not_started'
  const active = activeAccForUser(userId)
  if (!active) return 'finished'
  return active.date_stop ? 'paused' : 'running'
}

const myAcc = computed(() => activeAccForUser(myId.value))
const myState = computed(() => accStateForUser(myId.value))

// Выполнения, видимые текущему пользователю (не постановщик/создатель — только своё)
const visibleAccomplishments = computed(() => {
  const t = viewTask.value; if (!t) return []
  let accs = t.accomplishments || []
  if (!isCreator.value) accs = accs.filter(a => a.created_by === myId.value)
  return accs.map(a => ({
    ...a,
    userName: executors.value.find(e => e.userId === a.created_by)?.name
      || USERS.value.find(u => u.id === a.created_by)?.name || '?',
    userInitials: USERS.value.find(u => u.id === a.created_by)?.initials || '?',
  }))
})

const accIcon = (acc) => acc.date_end ? 'fa-circle-check' : (acc.date_stop ? 'fa-pause' : 'fa-play')
const accStateClass = (acc) => acc.date_end ? 'acc--done' : (acc.date_stop ? 'acc--paused' : 'acc--running')

// Приводит дату выполнения к реальному UTC-epoch.
// Серверный формат "dd.mm.yyyy HH:MM:SS" отдаётся в UTC — трактуем его как UTC,
// чтобы корректно сравнивать с Date.now() при живом таймере.
const accEpoch = (s) => {
  if (!s) return null
  if (/[TZ]/.test(s)) return new Date(s).getTime() // ISO — уже реальный epoch
  const m = String(s).match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/)
  if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +(m[6] || 0))
  const d = new Date(s); return isNaN(d) ? null : d.getTime()
}

const accElapsed = (acc) => {
  const start = accEpoch(acc.date_start)
  if (start == null || isNaN(start)) return '00:00:00'
  let end
  if (acc.date_end) end = accEpoch(acc.date_end)
  else if (acc.date_stop) end = accEpoch(acc.date_stop)
  else end = nowTick.value
  let diff = Math.max(0, Math.floor((end - start) / 1000))
  const h = Math.floor(diff / 3600); diff %= 3600
  const m = Math.floor(diff / 60); const s = diff % 60
  const p = n => String(n).padStart(2, '0')
  return `${p(h)}:${p(m)}:${p(s)}`
}

// ─── Task detail edit state ───────────────────────────────────────────────────
const tdEditField = ref(null)
const tdPriorityOpen = ref(false)

// ─── Task detail save functions ───────────────────────────────────────────────
const patchTask = async (fields) => {
  if (!viewTask.value) return
  await fetch(`/apisup/supply/tasks/${viewTask.value.id}`, {
    method: 'PATCH', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  })
}

const syncTaskToList = () => {
  const t = viewTask.value; if (!t) return
  const patch = (tk) => ({ ...tk,
    title: t.title, description: t.description, priority: t.priority,
    startDate: t.startDate, deadline: t.deadline,
    project: t.project, projectId: t.projectId,
    assignee: t.assignee, coexecutors: t.coexecutors, observers: t.observers,
    tags: t.tags,
    subtasks: t.subtasks?.map(s => ({ ...s })) ?? [],
    status: t.status, statusId: t.statusId, dateCompleted: t.dateCompleted,
    accomplishments: t.accomplishments?.map(a => ({ ...a })) ?? [],
  })
  const idx = tasks.value.findIndex(tk => tk.id === t.id)
  if (idx !== -1) tasks.value[idx] = patch(tasks.value[idx])
  const bIdx = boardTasks.value.findIndex(tk => tk.id === t.id)
  if (bIdx !== -1) boardTasks.value[bIdx] = patch(boardTasks.value[bIdx])
}

const saveTaskField = async (field) => {
  tdEditField.value = null
  const t = viewTask.value; if (!t) return
  if (field === 'title') await patchTask({ name: t.title })
  else if (field === 'description') await patchTask({ description: t.description })
  else if (field === 'priority') await patchTask({ urgent: t.priority === 'none' ? null : t.priority })
  else if (field === 'startDate') await patchTask({ date_start: t.startDate || null })
  else if (field === 'deadline') await patchTask({ date_end: t.deadline || null })
  else if (field === 'project') {
    const proj = projectOptions.value.find(p => p.id === t.projectId)
    await patchTask({ object_id: t.projectId, object_type: proj?.type === 'object' ? 'object_id' : 'object_levels_id' })
  }
  syncTaskToList()
}

const changeAssignee = async (userId) => {
  const t = viewTask.value; if (!t) return
  if (t.assigneeRoleId) {
    await fetch(`/apisup/supply/task-user-roles/${t.assigneeRoleId}`, { method: 'DELETE', credentials: 'include' })
  }
  if (userId) {
    const r = await fetch('/apisup/supply/task-user-roles', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: t.id, task_item_id: null, user_id: userId, role: 'responsible' }),
    })
    if (r.ok) {
      const data = await r.json()
      const u = USERS.value.find(u => u.id === userId)
      t.assignee = u ? { name: u.name, initials: u.initials } : t.assignee
      t.assigneeRoleId = data.id ?? null
      t.rawUserRoles = t.rawUserRoles.filter(rr => rr.role !== 'responsible')
      if (data.id) t.rawUserRoles.push({ id: data.id, role: 'responsible', user_id: userId, user: u })
      syncTaskToList()
    }
  } else {
    t.assignee = { name: '—', initials: '—' }; t.assigneeRoleId = null
    t.rawUserRoles = t.rawUserRoles.filter(rr => rr.role !== 'responsible')
    syncTaskToList()
  }
}

const toggleCoexecutorInTask = async (userId) => {
  const t = viewTask.value; if (!t) return
  const existing = t.rawUserRoles.find(r => r.role === 'co-executor' && r.user_id === userId)
  if (existing) {
    await fetch(`/apisup/supply/task-user-roles/${existing.id}`, { method: 'DELETE', credentials: 'include' })
    t.rawUserRoles = t.rawUserRoles.filter(r => r.id !== existing.id)
    t.coexecutors = t.coexecutors.filter(u => u.id !== userId)
  } else {
    const r = await fetch('/apisup/supply/task-user-roles', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: t.id, task_item_id: null, user_id: userId, role: 'co-executor' }),
    })
    if (r.ok) {
      const data = await r.json()
      const u = USERS.value.find(u => u.id === userId)
      t.rawUserRoles.push({ id: data.id, role: 'co-executor', user_id: userId })
      if (u) t.coexecutors.push({ name: u.name, initials: u.initials, id: userId })
    }
  }
  syncTaskToList()
}

const toggleObserverInTask = async (userId) => {
  const t = viewTask.value; if (!t) return
  const existing = t.rawUserRoles.find(r => r.role === 'observer' && r.user_id === userId)
  if (existing) {
    await fetch(`/apisup/supply/task-user-roles/${existing.id}`, { method: 'DELETE', credentials: 'include' })
    t.rawUserRoles = t.rawUserRoles.filter(r => r.id !== existing.id)
    t.observers = t.observers.filter(u => u.id !== userId)
  } else {
    const r = await fetch('/apisup/supply/task-user-roles', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: t.id, task_item_id: null, user_id: userId, role: 'observer' }),
    })
    if (r.ok) {
      const data = await r.json()
      const u = USERS.value.find(u => u.id === userId)
      t.rawUserRoles.push({ id: data.id, role: 'observer', user_id: userId })
      if (u) t.observers.push({ name: u.name, initials: u.initials, id: userId })
    }
  }
  syncTaskToList()
}

// ─── Tags in task detail ──────────────────────────────────────────────────────
const addTagInTask = async (tag) => {
  const t = viewTask.value; if (!t || !tag.trim()) return
  const cleanTag = tag.trim().replace(/^#/, '')
  if (t.rawTags.some(rt => rt.tag === cleanTag)) return
  const r = await fetch('/apisup/supply/task-tags', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task_id: t.id, tag: cleanTag }),
  })
  if (r.ok) {
    const data = await r.json()
    t.rawTags.push({ id: data.id ?? data.data?.id, tag: cleanTag })
    t.tags.push(cleanTag)
    syncTaskToList()
  }
}
const removeTagInTask = async (tagStr) => {
  const t = viewTask.value; if (!t) return
  const rt = t.rawTags.find(r => r.tag === tagStr)
  if (!rt) return
  await fetch(`/apisup/supply/task-tags/${rt.id}`, { method: 'DELETE', credentials: 'include' })
  t.rawTags = t.rawTags.filter(r => r.id !== rt.id)
  t.tags = t.tags.filter(tg => tg !== tagStr)
  syncTaskToList()
}

// ─── Checklist in task detail ─────────────────────────────────────────────────
const tdClDraft = ref('')
const tdClActiveItem    = ref(null)
const tdClEditingId     = ref(null)
const tdClActivePopover = ref(null)
const tdClPopAnchor     = ref(null)
const tdClSearchUser    = ref('')

const tdClPopStyle = computed(() => {
  if (!tdClPopAnchor.value) return {}
  return { position: 'fixed', top: tdClPopAnchor.value.top + 'px', left: tdClPopAnchor.value.left + 'px', zIndex: 9999 }
})

const toggleTdClPopover = (itemId, popover, event) => {
  if (tdClActiveItem.value === itemId && tdClActivePopover.value === popover) {
    tdClActiveItem.value = null; tdClActivePopover.value = null; tdClPopAnchor.value = null
  } else {
    tdClActiveItem.value = itemId; tdClActivePopover.value = popover
    const r = event.currentTarget.getBoundingClientRect()
    tdClPopAnchor.value = { top: r.bottom + 4, left: r.left }
  }
  tdClSearchUser.value = ''
}

const closeTdClPopover = () => {
  tdClActiveItem.value = null; tdClActivePopover.value = null; tdClPopAnchor.value = null
}

const saveTdClItemTitle = async (subtask) => {
  tdClEditingId.value = null
  if (!subtask.title.trim()) return
  await fetch(`/apisup/supply/task-items/${subtask.id}`, {
    method: 'PATCH', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: subtask.title }),
  })
}

const toggleTdClUserRole = async (subtask, userId, role) => {
  const arr = role === 'co-executor' ? subtask.coexecutors : subtask.observers
  const existing = arr.find(u => u.id === userId)
  if (existing) {
    await fetch(`/apisup/supply/task-user-roles/${existing.roleId}`, { method: 'DELETE', credentials: 'include' })
    if (role === 'co-executor') subtask.coexecutors = subtask.coexecutors.filter(u => u.id !== userId)
    else subtask.observers = subtask.observers.filter(u => u.id !== userId)
  } else {
    const t = viewTask.value; if (!t) return
    const r = await fetch('/apisup/supply/task-user-roles', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: t.id, task_item_id: subtask.id, user_id: userId, role }),
    })
    if (r.ok) {
      const data = await r.json()
      const u = USERS.value.find(u => u.id === userId)
      arr.push({ id: userId, roleId: data.id, name: u?.name ?? '?', initials: u?.initials ?? '?' })
    }
  }
}
const addClItemInTask = async () => {
  const t = viewTask.value; if (!t || !tdClDraft.value.trim()) return
  const r = await fetch('/apisup/supply/task-items', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task_id: t.id, num: t.subtasks.length, name: tdClDraft.value.trim(), urgent: null, date_start: null, date_end: null, status_id: DEFAULT_STATUS_ID }),
  })
  if (r.ok) {
    const data = await r.json()
    t.subtasks.push({ id: data.id ?? data.data?.id, title: tdClDraft.value.trim(), done: false })
    tdClDraft.value = ''
    syncTaskToList()
  }
}
const removeClItemInTask = async (subtask, idx) => {
  const t = viewTask.value; if (!t) return
  await fetch(`/apisup/supply/task-items/${subtask.id}`, { method: 'DELETE', credentials: 'include' })
  t.subtasks.splice(idx, 1)
  syncTaskToList()
}
const toggleClItemDone = async (subtask) => {
  if (!canCheckItems.value) return
  subtask.done = !subtask.done
  syncTaskToList()
  const statusId = subtask.done ? '1d9a6ecf-77a5-11f1-b481-bc241127d0bd' : DEFAULT_STATUS_ID
  await fetch(`/apisup/supply/task-items/${subtask.id}`, {
    method: 'PATCH', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status_id: statusId }),
  })
}

// ─── Files in task detail ─────────────────────────────────────────────────────
const tdFileUploading = ref(false)
const uploadFilesToTask = async (files) => {
  const t = viewTask.value; if (!t || !files?.length) return
  tdFileUploading.value = true
  try {
    for (const file of Array.from(files)) {
      const fd = new FormData()
      fd.append('files', file)
      fd.append('task_id', t.id)
      const r = await fetch('/apisup/supply/task-files', {
        method: 'POST', credentials: 'include', body: fd,
      })
      if (r.ok) {
        const data = await r.json()
        if (!t.rawFiles) t.rawFiles = []
        t.rawFiles.push({
          id: data.id ?? data.data?.id,
          original_name: file.name,
          extension: file.name.split('.').pop()?.toLowerCase() ?? '',
        })
      }
    }
  } finally { tdFileUploading.value = false }
}

const deleteFile = async (file) => {
  const t = viewTask.value; if (!t) return
  await fetch(`/apisup/supply/task-files/${file.id}`, { method: 'DELETE', credentials: 'include' })
  t.rawFiles = t.rawFiles.filter(f => f.id !== file.id)
}
const downloadFile = (file) => {
  window.open(`/apisup/supply/task-files/${file.id}/download`, '_blank')
}
const previewFile = ref(null)
const previewUrl = computed(() => previewFile.value ? `/apisup/supply/task-files/${previewFile.value.id}/download` : null)
const imageExts = ['jpg','jpeg','png','gif','webp','svg','bmp']
const previewableExts = ['pdf','doc','docx','xls','xlsx']
const openFilePreview = (file) => {
  const ext = file.extension?.toLowerCase()
  if (imageExts.includes(ext)) {
    // тот же полноэкранный просмотрщик, что и в чате
    openChatImage(`/apisup/supply/task-files/${file.id}/download`)
  } else if (previewableExts.includes(ext)) {
    previewFile.value = file
  } else {
    downloadFile(file)
  }
}
const fileIcon = (ext) => {
  const e = ext?.toLowerCase()
  if (['jpg','jpeg','png','gif','webp','svg'].includes(e)) return 'fa-image'
  if (['pdf'].includes(e)) return 'fa-file-pdf'
  if (['doc','docx'].includes(e)) return 'fa-file-word'
  if (['xls','xlsx'].includes(e)) return 'fa-file-excel'
  if (['zip','rar','7z'].includes(e)) return 'fa-file-zipper'
  return 'fa-file'
}

// ─── Tag input for task detail ────────────────────────────────────────────────
const tdTagInput = ref('')
const tdTagFocused = ref(false)
const tdTagSuggestions = computed(() => {
  const q = tdTagInput.value.trim().toLowerCase().replace(/^#/, '')
  const existing = viewTask.value?.tags ?? []
  return allTags.value.filter(t => !existing.includes(t) && (!q || t.toLowerCase().includes(q)))
})
const onTdTagKeydown = (e) => {
  if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
    e.preventDefault(); addTagInTask(tdTagInput.value); tdTagInput.value = ''
  } else if (e.key === 'Backspace' && !tdTagInput.value && viewTask.value?.tags.length) {
    removeTagInTask(viewTask.value.tags[viewTask.value.tags.length - 1])
  }
}

// ─── Dropdown state for task detail editing ───────────────────────────────────
const tdDdAssignee = ref(false)
const tdDdCoex = ref(false)
const tdDdObs = ref(false)
const tdDdProject = ref(false)
const tdDdRect = reactive({})
const openTdDD = (name, event) => {
  tdDdAssignee.value = false; tdDdCoex.value = false; tdDdObs.value = false; tdDdProject.value = false; tdPriorityOpen.value = false
  const r = event.currentTarget.getBoundingClientRect()
  tdDdRect[name] = { top: r.bottom + 4, left: r.left, width: Math.max(r.width, 220) }
  if (name === 'assignee') tdDdAssignee.value = true
  else if (name === 'coex') tdDdCoex.value = true
  else if (name === 'obs') tdDdObs.value = true
  else if (name === 'project') tdDdProject.value = true
}
const tdDdStyle = (name) => {
  const r = tdDdRect[name]; if (!r) return {}
  return { position: 'fixed', top: r.top + 'px', left: r.left + 'px', minWidth: r.width + 'px', zIndex: 9999 }
}
const closeTdDDs = () => { tdDdAssignee.value = false; tdDdCoex.value = false; tdDdObs.value = false; tdDdProject.value = false; tdPriorityOpen.value = false }

const tdSearchAssignee = ref('')
const tdSearchCoex = ref('')
const tdSearchObs = ref('')
const tdSearchProject = ref('')
const filteredTdProjects = computed(() =>
  projectOptions.value.filter(p => p.name.toLowerCase().includes(tdSearchProject.value.toLowerCase()))
)
const filteredTdUsers = (search) => {
  const q = (search || '').toLowerCase()
  return USERS.value.filter(u => !q || u.name.toLowerCase().includes(q))
}

const sendChatMsg = () => {
  const text = chatDraft.value.trim()
  if (!text || !viewTask.value) return
  const now = new Date()
  const p = n => n.toString().padStart(2,'0')
  viewTask.value.chatMessages.push({
    id: Date.now(), isMe: true, text,
    author: 'Вы', initials: 'ВЫ',
    time: `${p(now.getHours())}:${p(now.getMinutes())}`,
  })
  chatDraft.value = ''
  nextTick(() => { if (chatEl.value) chatEl.value.scrollTop = chatEl.value.scrollHeight })
}

// ─── Submit ───────────────────────────────────────────────────────────────────
const submitting = ref(false)
const submitError = ref('')

const submitCreateTask = async () => {
  if (!createForm.value.title.trim() || submitting.value) return
  submitting.value = true
  submitError.value = ''

  try {
    const f = createForm.value
    const proj = projectOptions.value.find(p => p.id === f.projectId)

    // 1. Создать задачу
    const taskRes = await fetch('/apisup/supply/tasks', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: f.title,
        description: f.description || null,
        object_id: f.projectId || null,
        object_type: proj?.type === 'object' ? 'object_id' : (f.projectId ? 'object_levels_id' : null),
        urgent: f.priority && f.priority !== 'none' ? f.priority : null,
        date_start: f.startDate || null,
        date_end: f.deadline || null,
        status_id: DEFAULT_STATUS_ID,
        ...(f.connectionType && f.connectionId ? { connection_type: f.connectionType, connection_id: f.connectionId } : {}),
      }),
    })
    if (!taskRes.ok) throw new Error(await taskRes.text())
    const task = await taskRes.json()
    const taskId = task.id ?? task.data?.id

    // 2. Исполнитель
    if (f.assigneeId) {
      await fetch('/apisup/supply/task-user-roles', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId, task_item_id: null, user_id: f.assigneeId, role: 'responsible' }),
      })
    }

    // 3. Соисполнители
    for (const uid of f.coexecutorIds) {
      await fetch('/apisup/supply/task-user-roles', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId, task_item_id: null, user_id: uid, role: 'co-executor' }),
      })
    }

    // 4. Наблюдатели
    for (const uid of f.observerIds) {
      await fetch('/apisup/supply/task-user-roles', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId, task_item_id: null, user_id: uid, role: 'observer' }),
      })
    }

    // 5. Подзадачи (чеклист)
    for (let i = 0; i < f.subtasks.length; i++) {
      const s = f.subtasks[i]
      if (!s.title.trim()) continue
      await fetch('/apisup/supply/task-items', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: taskId,
          num: i,
          name: s.title,
          urgent: s.priority && s.priority !== 'none' ? s.priority : null,
          date_start: null,
          date_end: null,
          status_id: DEFAULT_STATUS_ID,
        }),
      })
    }

    // 6. Теги
    for (const tag of f.tags) {
      await fetch('/apisup/supply/task-tags', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId, tag }),
      })
    }

    // 7. Файлы
    if (f.files.length) {
      const fd = new FormData()
      fd.append('task_id', taskId)
      f.files.forEach(file => fd.append('files', file))
      await fetch('/apisup/supply/task-files', {
        method: 'POST', credentials: 'include',
        body: fd,
      })
    }

    // Добавить в локальный список (без дублей — WS task_created может прийти параллельно)
    const assignee = USERS.value.find(u => u.id === f.assigneeId)
    upsertTaskIn(tasks.value, {
      id: taskId, columnId: null,
      title: f.title,
      deadline: f.deadline,
      assigner: { name: 'Вы', initials: 'ВЫ' },
      assignee: assignee || { name: '—', initials: '—' },
      project: proj?.name || '',
      tags: [...f.tags],
      priority: f.priority || 'none',
      subtasks: f.subtasks.map(s => ({ id: s.id, title: s.title, done: s.done })),
      meRole: ['assigner'],
    })

    closeCreateModal()
  } catch (e) {
    submitError.value = e.message || 'Ошибка при создании задачи'
  } finally {
    submitting.value = false
  }
}

// ─── Dropdown multi-select helpers ───────────────────────────────────────────
const toggleInList = (arr, id) => { const i = arr.indexOf(id); i === -1 ? arr.push(id) : arr.splice(i, 1) }
const toggleCoexecutor = (id) => toggleInList(createForm.value.coexecutorIds, id)
const toggleObserver   = (id) => toggleInList(createForm.value.observerIds, id)

const selectedAssignee    = computed(() => USERS.value.find(u => u.id === createForm.value.assigneeId) || null)
const selectedCoexecutors = computed(() => USERS.value.filter(u => createForm.value.coexecutorIds.includes(u.id)))
const selectedObservers   = computed(() => USERS.value.filter(u => createForm.value.observerIds.includes(u.id)))
const selectedProject     = computed(() => projectOptions.value.find(p => p.id === createForm.value.projectId) || null)

// ─── Drag & Drop ──────────────────────────────────────────────────────────────
const draggedTaskId  = ref(null)
const dragOverColId  = ref(null)
// Вставить перед карточкой с этим id; null = в самый низ колонки; undefined = нет наведения
const dragOverBeforeId = ref(undefined)

const onDragStart = (e, task) => {
  draggedTaskId.value = task.id
  e.dataTransfer.effectAllowed = 'move'
}
const onDragOver = (e, colId) => {
  e.preventDefault()
  dragOverColId.value = colId
  // Сбрасываем в «низ» только если курсор над пустой областью колонки, а не над карточкой
  const overCard = e.target?.closest?.('.kanban-card')
  if (!overCard) dragOverBeforeId.value = null
}
// Наведение на карточку — вставка до/после по середине
const onCardDragOver = (e, colId, task) => {
  e.preventDefault()
  dragOverColId.value = colId
  const rect = e.currentTarget.getBoundingClientRect()
  const before = (e.clientY - rect.top) < rect.height / 2
  if (before) {
    dragOverBeforeId.value = task.id
  } else {
    const list = tasksByColumn.value[colId] || []
    const i = list.findIndex(t => t.id === task.id)
    dragOverBeforeId.value = list[i + 1]?.id ?? null
  }
}
// Колонка под курсором по горизонтали (не зависит от вертикальной прокрутки)
const columnIdAtX = (x) => {
  const el = kanbanWrapEl.value
  if (!el) return null
  const cols = el.querySelectorAll('.kanban-col[data-col-id]')
  for (const c of cols) {
    const r = c.getBoundingClientRect()
    if (x >= r.left && x <= r.right) return c.getAttribute('data-col-id')
  }
  return null
}
const onDrop = async (e, dropColId) => {
  e.preventDefault()
  const task = boardTasks.value.find(t => t.id === draggedTaskId.value)
  // Целевая колонка — по горизонтальному положению курсора (работает на любой высоте),
  // с запасом на колонку из предпросмотра / переданную
  const colId = columnIdAtX(e.clientX) ?? dropColId ?? dragOverColId.value
  const beforeId = dragOverBeforeId.value
  draggedTaskId.value = null
  dragOverColId.value = null
  dragOverBeforeId.value = undefined
  if (!task || !colId) return

  // Остальные карточки колонки (сверху вниз)
  const others = (tasksByColumn.value[colId] || []).filter(t => t.id !== task.id)
  // beforeId имеет смысл только если карточка есть в этой колонке; иначе — в самый низ
  const beforeInThisCol = beforeId != null && others.some(t => sameId(t.id, beforeId))
  let k = beforeInThisCol ? others.findIndex(t => sameId(t.id, beforeId)) : others.length
  if (k === -1) k = others.length

  // Итоговый порядок сверху→вниз: others[0..k-1], task, others[k..]
  const final = [...others.slice(0, k), task, ...others.slice(k)]
  const len = final.length
  // vertical_num: снизу=0, значит верхний = len-1
  final.forEach((t, j) => { t.verticalNum = len - 1 - j })
  task.columnId = colId

  try {
    await fetch(`/apisup/supply/tasks/${task.id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connection_id: colId, vertical_num: task.verticalNum }),
    })
  } catch (err) { console.error(err) }
}
const onDragLeave = () => {}
const onDragEnd   = () => { draggedTaskId.value = null; dragOverColId.value = null; dragOverBeforeId.value = undefined }

// Автопрокрутка доски при перетаскивании к краям (чтобы дотянуться до невидимых колонок)
const kanbanWrapEl = ref(null)
const onWrapDragOver = (e) => {
  const el = kanbanWrapEl.value
  if (!el || (!draggedTaskId.value && !colDragId.value)) return
  // Автопрокрутка у краёв
  const rect = el.getBoundingClientRect()
  const edge = 80, speed = 24
  if (e.clientX > rect.right - edge) el.scrollLeft += speed
  else if (e.clientX < rect.left + edge) el.scrollLeft -= speed
  if (e.clientY > rect.bottom - edge) el.scrollTop += speed
  else if (e.clientY < rect.top + edge) el.scrollTop -= speed
  // Целевая колонка по горизонтали (даже если курсор над пустотой/промежутком)
  if (draggedTaskId.value) {
    const cid = columnIdAtX(e.clientX)
    if (cid) {
      dragOverColId.value = cid
      if (!e.target?.closest?.('.kanban-card')) dragOverBeforeId.value = null
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const formatDate = (d) => {
  if (!d) return '—'
  const dt = parseApiDate(d)
  if (!dt || isNaN(dt)) return d
  const p = n => n.toString().padStart(2, '0')
  return `${p(dt.getDate())}.${p(dt.getMonth()+1)}.${dt.getFullYear()} ${p(dt.getHours())}:${p(dt.getMinutes())}`
}
const isOverdue = (d) => d && new Date(d) < new Date()
// Просрочка в днях (только если срок прошёл и задача не завершена)
const overdueDays = (task) => {
  if (!task?.deadline || isTaskCompleted(task)) return 0
  const dl = new Date(task.deadline)
  if (isNaN(dl) || dl >= new Date()) return 0
  return Math.max(1, Math.ceil((Date.now() - dl.getTime()) / 86400000))
}
const overdueLabel = (task) => {
  const n = overdueDays(task)
  return n ? `просрочено на ${n} дн.` : ''
}

// Навигация по связи задачи
const connectionRoute = (task) => {
  const type = task?.connectionType, id = task?.connectionId
  if (!type || !id) return null
  switch (type) {
    case 'invoice':       return { name: 'invoice-detail', params: { invoiceId: id } }
    case 'deal':          return { name: 'deal-detail', params: { dealId: id } }
    case 'request':       return { name: 'request-detail', params: { requestId: id } }
    case 'warehouse':     return { name: 'warehouse-detail', params: { warehouseId: id } }
    case 'contract':      return { name: 'contract-detail', params: { id } }
    case 'letter':        return { name: 'letter-detail', params: { id } }
    case 'specification': return { path: `/specifications/${id}` }
    default:              return null   // task-columns — без навигации
  }
}
const goToConnection = (task) => {
  const r = connectionRoute(task)
  if (r) router.push(r)
}
// Значок/чип связи в списке (для всех типов, включая колонку доски)
const listConnectionMeta = (task) =>
  task?.connectionType ? connectionMeta(task.connectionType) : null
// Клик по связи: есть маршрут — переходим; task-columns — открываем доску; иначе задачу
const onConnClick = async (task) => {
  const r = connectionRoute(task)
  if (r) { router.push(r); return }
  if (task.connectionType === 'task-columns' && task.taskBoardId) {
    if (viewTask.value) closeTask()
    selectedProjectId.value = task.projectId
    selectedFilter.value = null
    boardsOpen.value = true
    await selectBoard(task.taskBoardId)
    persistNav()
  } else {
    openTask(task)
  }
}

const subtaskProgress = (task) => {
  if (!task.subtasks.length) return null
  const done = task.subtasks.filter(s => s.done).length
  return { done, total: task.subtasks.length, pct: Math.round(done / task.subtasks.length * 100) }
}
const toggleSubtask = (task, sub) => { sub.done = !sub.done }
// Отметка пункта чек-листа прямо в карточке (с сохранением на сервере)
const toggleCardSubtask = async (task, sub) => {
  sub.done = !sub.done
  const statusId = sub.done ? '1d9a6ecf-77a5-11f1-b481-bc241127d0bd' : DEFAULT_STATUS_ID
  try {
    await fetch(`/apisup/supply/task-items/${sub.id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status_id: statusId }),
    })
  } catch (e) { console.error(e); sub.done = !sub.done }
  // если эта задача открыта в деталях — синхронизируем
  if (viewTask.value?.id === task.id) {
    const vs = viewTask.value.subtasks?.find(s => s.id === sub.id)
    if (vs) vs.done = sub.done
  }
}

// ─── Быстрое редактирование прямо на карточке ─────────────────────────────────
const cardPop = ref(null)        // { taskId, type: 'priority'|'assignee'|'coex', style }
const cardPopSearch = ref('')
const cardCalTask = ref(null)
const cardPopTask = computed(() => cardPop.value ? boardTasks.value.find(t => t.id === cardPop.value.taskId) : null)

const openCardPop = (type, task, ev) => {
  ev.stopPropagation()
  if (cardPop.value?.taskId === task.id && cardPop.value?.type === type) { cardPop.value = null; return }
  const rect = ev.currentTarget.getBoundingClientRect()
  const left = Math.min(rect.left, window.innerWidth - 250)
  cardPop.value = { taskId: task.id, type, style: { position: 'fixed', top: (rect.bottom + 6) + 'px', left: left + 'px', zIndex: 10002 } }
  cardPopSearch.value = ''
}
const closeCardPop = () => { cardPop.value = null }
const cardUsersFiltered = computed(() => {
  const q = cardPopSearch.value.toLowerCase().trim()
  return USERS.value.filter(u => !q || u.name.toLowerCase().includes(q))
})

const patchTaskById = (id, body) => fetch(`/apisup/supply/tasks/${id}`, {
  method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})
const syncBoardTaskToDetail = (task) => {
  if (viewTask.value?.id === task.id) {
    Object.assign(viewTask.value, {
      priority: task.priority, startDate: task.startDate, deadline: task.deadline,
      assignee: task.assignee, coexecutors: task.coexecutors,
      rawUserRoles: task.rawUserRoles, assigneeRoleId: task.assigneeRoleId,
    })
  }
}

const setCardPriority = async (task, pk) => {
  task.priority = pk
  closeCardPop(); syncBoardTaskToDetail(task)
  await patchTaskById(task.id, { urgent: pk === 'none' ? null : pk })
}

const cardIsAssignee = (task, userId) => (task.rawUserRoles || []).some(r => r.role === 'responsible' && r.user_id === userId)
const setCardAssignee = async (task, userId) => {
  const existing = (task.rawUserRoles || []).find(r => r.role === 'responsible')
  const same = existing && existing.user_id === userId
  if (existing) {
    await fetch(`/apisup/supply/task-user-roles/${existing.id}`, { method: 'DELETE', credentials: 'include' })
    task.rawUserRoles = task.rawUserRoles.filter(r => r.id !== existing.id)
    task.assignee = { name: '—', initials: '—' }; task.assigneeRoleId = null
  }
  if (userId && !same) {
    const r = await fetch('/apisup/supply/task-user-roles', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: task.id, task_item_id: null, user_id: userId, role: 'responsible' }),
    })
    if (r.ok) {
      const d = await r.json().catch(() => ({}))
      const u = USERS.value.find(x => x.id === userId)
      task.rawUserRoles = [...(task.rawUserRoles || []), { id: d.id ?? d.data?.id, role: 'responsible', user_id: userId }]
      task.assignee = u ? { name: u.name, initials: u.initials } : task.assignee
      task.assigneeRoleId = d.id ?? d.data?.id
    }
  }
  syncBoardTaskToDetail(task); closeCardPop()
}

const cardHasCoex = (task, userId) => (task.coexecutors || []).some(u => u.id === userId)
const toggleCardCoex = async (task, userId) => {
  const existing = (task.rawUserRoles || []).find(r => r.role === 'co-executor' && r.user_id === userId)
  if (existing) {
    await fetch(`/apisup/supply/task-user-roles/${existing.id}`, { method: 'DELETE', credentials: 'include' })
    task.rawUserRoles = task.rawUserRoles.filter(r => r.id !== existing.id)
    task.coexecutors = (task.coexecutors || []).filter(u => u.id !== userId)
  } else {
    const r = await fetch('/apisup/supply/task-user-roles', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: task.id, task_item_id: null, user_id: userId, role: 'co-executor' }),
    })
    if (r.ok) {
      const d = await r.json().catch(() => ({}))
      const u = USERS.value.find(x => x.id === userId)
      task.rawUserRoles = [...(task.rawUserRoles || []), { id: d.id ?? d.data?.id, role: 'co-executor', user_id: userId }]
      task.coexecutors = [...(task.coexecutors || []), { id: userId, name: u?.name ?? '?', initials: u?.initials ?? '?' }]
    }
  }
  syncBoardTaskToDetail(task)
}

// Даты через общий календарь (цель — карточка)
const openCardCal = (field, task, ev) => {
  ev.stopPropagation()
  calTarget.value = 'card'; cardCalTask.value = task
  calField.value = field; calView.value = 'date'
  const d = task[field] ? new Date(task[field]) : new Date()
  calYear.value = d.getFullYear(); calMonth.value = d.getMonth()
  calAnchor.value = ev.currentTarget.getBoundingClientRect()
  calOpen.value = true
}
const clearCardDate = async (task, field, ev) => {
  ev.stopPropagation()
  task[field] = ''
  syncBoardTaskToDetail(task)
  await patchTaskById(task.id, { [field === 'startDate' ? 'date_start' : 'date_end']: null })
}

const columnLabel = (columnId) => {
  for (const p of projects.value)
    for (const b of p.boards)
      for (const c of b.columns)
        if (c.id === columnId) return c.name
  return '—'
}
</script>

<template>
  <div class="page">
    <TopNav :links="navLinks" />

    <div class="page-body">
      <!-- ── Primary Sidebar ───────────────────────────────────────────────── -->
      <aside class="tasks-sidebar">
        <div class="sidebar-section-label">Задачи</div>
        <button
          v-for="f in filterLabels" :key="f.key"
          class="sidebar-btn"
          :class="{ active: selectedFilter === f.key }"
          @click="selectFilter(f.key)"
        >
          <i class="fas" :class="f.icon"></i>
          {{ f.label }}
        </button>

        <div class="sidebar-divider"></div>

        <div class="sidebar-section-label sidebar-section-label--row">
          <span>Проекты</span>
          <button class="sidebar-add-btn" title="Создать доску" @click="openBoardModal()"><i class="fas fa-plus"></i></button>
        </div>
        <button
          v-for="proj in projects" :key="proj.id"
          class="sidebar-proj-btn"
          :class="{ active: selectedProjectId === proj.id }"
          @click="selectProject(proj.id)"
        >
          <i class="fas" :class="proj.icon"></i>
          <span>{{ proj.name }}</span>
          <i
            v-if="selectedProjectId === proj.id"
            class="fas fa-chevron-right boards-arrow"
            :class="{ open: boardsOpen }"
          ></i>
        </button>
      </aside>

      <!-- ── Secondary Sidebar: Boards ─────────────────────────────────────── -->
      <transition name="boards-slide">
        <aside v-if="selectedProjectId && boardsOpen" class="boards-sidebar">
          <div class="boards-sidebar-header">
            <span class="boards-sidebar-title">{{ currentProject?.name }}</span>
            <button class="boards-sidebar-close" @click="boardsOpen = false" title="Свернуть">
              <i class="fas fa-chevron-left"></i>
            </button>
          </div>
          <button class="boards-create-btn" @click="openBoardModalForCurrentProject">
            <i class="fas fa-plus"></i> Создать доску
          </button>
          <div class="boards-list">
            <div
              v-for="board in currentProject?.boards" :key="board.id"
              class="board-card"
              :class="{ active: selectedBoardId === board.id }"
              @click="selectBoard(board.id)"
            >
              <div class="board-card-icon">
                <i class="fas fa-table-columns"></i>
              </div>
              <div class="board-card-info">
                <div class="board-card-name">{{ board.name }}</div>
                <div class="board-card-meta">{{ board.columns.length }} колонок</div>
              </div>
              <div class="board-card-menu-wrap">
                <button class="board-card-dots" title="Действия" @click.stop="toggleBoardMenu(board.id, $event)"><i class="fas fa-ellipsis-vertical"></i></button>
              </div>
            </div>
          </div>
        </aside>
      </transition>

      <!-- Collapsed toggle button -->
      <button
        v-if="selectedProjectId && !boardsOpen"
        class="boards-collapsed-btn"
        @click="boardsOpen = true"
        :title="currentProject?.name"
      >
        <i class="fas fa-table-columns"></i>
      </button>

      <!-- ── Main ─────────────────────────────────────────────────────────── -->
      <main class="main-content">

        <!-- ── LIST VIEW ────────────────────────────────────────────────────── -->
        <template v-if="isListView">
          <div class="content-header">
            <div>
              <h1 class="page-title">{{ filterLabels.find(f => f.key === selectedFilter)?.label || 'Задачи' }}</h1>
              <div class="page-subtitle">Управление задачами и поручениями</div>
            </div>
            <div class="content-header-actions">
              <button class="btn btn-ghost" :class="{ 'btn-ghost--active': showFilters || activeFilterCount }" @click="showFilters = !showFilters">
                <i class="fas fa-filter"></i> Фильтры
                <span v-if="activeFilterCount" class="filter-count">{{ activeFilterCount }}</span>
              </button>
              <button class="btn btn-primary" @click="openCreateModal">
                <i class="fas fa-plus"></i> Создать задачу
              </button>
            </div>
          </div>

          <!-- Переключатель Все / В работе / Завершённые -->
          <div class="work-toggle">
            <button class="work-toggle-btn" :class="{ active: workFilter === 'all' }" @click="workFilter = 'all'">Все</button>
            <button class="work-toggle-btn" :class="{ active: workFilter === 'active' }" @click="workFilter = 'active'">В работе</button>
            <button class="work-toggle-btn" :class="{ active: workFilter === 'done' }" @click="workFilter = 'done'">Завершённые</button>
          </div>

          <!-- Панель фильтров -->
          <transition name="filters-slide">
            <div v-if="showFilters" class="filters-panel">
              <div class="filter-field filter-field--wide">
                <label>Название</label>
                <div class="filter-search">
                  <i class="fas fa-search"></i>
                  <input v-model="fTitle" type="text" placeholder="Поиск по названию..." />
                </div>
              </div>
              <div class="filter-field">
                <label>Постановщик</label>
                <FilterCombo v-model="fAssigner" :options="optAssigners" placeholder="Все" />
              </div>
              <div class="filter-field">
                <label>Исполнитель</label>
                <FilterCombo v-model="fAssignee" :options="optAssignees" placeholder="Все" />
              </div>
              <div class="filter-field">
                <label>Соисполнитель</label>
                <FilterCombo v-model="fCoexecutor" :options="optCoexecutors" placeholder="Все" />
              </div>
              <div class="filter-field">
                <label>Наблюдатель</label>
                <FilterCombo v-model="fObserver" :options="optObservers" placeholder="Все" />
              </div>
              <div class="filter-field">
                <label>Проект</label>
                <FilterCombo v-model="fProject" :options="optProjects" placeholder="Все" />
              </div>
              <div class="filter-field">
                <label>Статус</label>
                <FilterCombo v-model="fStatus" :options="optStatuses" placeholder="Все" />
              </div>
              <div class="filter-field">
                <label>Приоритет</label>
                <FilterCombo v-model="fPriority" :options="optPriorities" placeholder="Все" />
              </div>
              <div class="filter-field">
                <label>Связан</label>
                <FilterCombo v-model="fConnection" :options="optConnections" placeholder="Все" />
              </div>
              <div class="filter-field filter-field--wide">
                <label>Теги</label>
                <FilterCombo v-model="fTags" :options="optTags" placeholder="Выберите теги..." multiple />
              </div>
              <div class="filter-field">
                <label>Дата начала (от)</label>
                <input v-model="fStartDate" type="date" />
              </div>
              <div class="filter-field">
                <label>Крайний срок (до)</label>
                <input v-model="fEndDate" type="date" />
              </div>
              <div class="filter-field filter-field--reset">
                <button class="btn btn-ghost" :disabled="!activeFilterCount" @click="resetFilters">
                  <i class="fas fa-xmark"></i> Сбросить
                </button>
              </div>
            </div>
          </transition>

          <div v-if="tasksLoading" class="tasks-loading">
            <i class="fas fa-spinner fa-spin"></i> Загрузка задач...
          </div>

          <div v-else class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Название</th>
                  <th>Крайний срок</th>
                  <th>Постановщик</th>
                  <th>Исполнитель</th>
                  <th>Проект</th>
                  <th>Связь</th>
                  <th>Теги</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="task in filteredTasks" :key="task.id" class="task-row" @click="openTask(task)">
                  <!-- Title + priority icon + subtask bar -->
                  <td class="task-name-cell">
                    <div class="task-name-row">
                      <span
                        v-if="priority(task.priority).icon"
                        class="priority-icon"
                        :style="{ color: priority(task.priority).color }"
                        :title="priority(task.priority).label"
                      >
                        <i class="fas" :class="priority(task.priority).icon"></i>
                      </span>
                      <span class="task-name">{{ task.title }}</span>
                    </div>
                    <div v-if="subtaskProgress(task)" class="subtask-mini">
                      <div class="subtask-bar-wrap">
                        <div class="subtask-bar-fill" :style="{ width: subtaskProgress(task).pct + '%' }"></div>
                      </div>
                      <span class="subtask-mini-label">{{ subtaskProgress(task).done }}/{{ subtaskProgress(task).total }}</span>
                    </div>
                  </td>
                  <!-- Deadline -->
                  <td>
                    <span :class="['deadline-chip', isOverdue(task.deadline) && !isTaskCompleted(task) ? 'deadline-chip--overdue' : '']">
                      <i class="fas fa-clock"></i>
                      {{ formatDate(task.deadline) }}
                    </span>
                    <div v-if="overdueLabel(task)" class="td-overdue-label"><i class="fas fa-triangle-exclamation"></i> {{ overdueLabel(task) }}</div>
                  </td>
                  <!-- Assigner -->
                  <td>
                    <div class="user-chip user-chip--clickable" :class="{ 'is-filtered': isActiveFilter('assigner', task.assigner.name) }" title="Фильтровать по постановщику" @click.stop="applyQuickFilter('assigner', task.assigner.name)">
                      <div class="mini-avatar" :style="{ background: avatarColor(task.assigner.initials).bg, color: avatarColor(task.assigner.initials).color }">
                        {{ task.assigner.initials }}
                      </div>
                      <span>{{ task.assigner.name }}</span>
                      <button v-if="isActiveFilter('assigner', task.assigner.name)" class="chip-filter-x" title="Убрать из фильтра" @click.stop="clearQuickFilter('assigner', task.assigner.name)"><i class="fas fa-xmark"></i></button>
                    </div>
                  </td>
                  <!-- Assignee -->
                  <td>
                    <div class="user-chip user-chip--clickable" :class="{ 'is-filtered': isActiveFilter('assignee', task.assignee.name) }" title="Фильтровать по исполнителю" @click.stop="applyQuickFilter('assignee', task.assignee.name)">
                      <div class="mini-avatar" :style="{ background: avatarColor(task.assignee.initials).bg, color: avatarColor(task.assignee.initials).color }">
                        {{ task.assignee.initials }}
                      </div>
                      <span>{{ task.assignee.name }}</span>
                      <button v-if="isActiveFilter('assignee', task.assignee.name)" class="chip-filter-x" title="Убрать из фильтра" @click.stop="clearQuickFilter('assignee', task.assignee.name)"><i class="fas fa-xmark"></i></button>
                    </div>
                  </td>
                  <!-- Project -->
                  <td>
                    <span v-if="task.project" class="chip project-chip chip--clickable" :class="{ 'is-filtered': isActiveFilter('project', task.project) }" title="Фильтровать по проекту" @click.stop="applyQuickFilter('project', task.project)">
                      {{ task.project }}
                      <button v-if="isActiveFilter('project', task.project)" class="chip-filter-x" title="Убрать из фильтра" @click.stop="clearQuickFilter('project', task.project)"><i class="fas fa-xmark"></i></button>
                    </span>
                  </td>
                  <!-- Связь -->
                  <td>
                    <span v-if="listConnectionMeta(task)" class="chip conn-chip" :title="task.connectionName || listConnectionMeta(task).label" @click.stop="onConnClick(task)">
                      <i class="fas" :class="listConnectionMeta(task).icon"></i>
                      <span class="conn-chip-text">{{ task.connectionName || listConnectionMeta(task).label }}</span>
                    </span>
                    <span v-else class="td-empty">—</span>
                  </td>
                  <!-- Tags -->
                  <td>
                    <div class="tags-wrap">
                      <span v-for="tag in task.tags" :key="tag" class="chip chip--clickable" :class="{ 'is-filtered': isActiveFilter('tag', tag) }" title="Фильтровать по тегу" @click.stop="applyQuickFilter('tag', tag)">
                        {{ tag }}
                        <button v-if="isActiveFilter('tag', tag)" class="chip-filter-x" title="Убрать из фильтра" @click.stop="clearQuickFilter('tag', tag)"><i class="fas fa-xmark"></i></button>
                      </span>
                    </div>
                  </td>
                  <!-- Status -->
                  <td>
                    <span class="status-label status-badge status-badge--clickable" :class="[statusClass(task), { 'is-filtered': isActiveFilter('status', task.status) }]" v-if="task.status" title="Фильтровать по статусу" @click.stop="applyQuickFilter('status', task.status)">
                      {{ task.status }}
                      <button v-if="isActiveFilter('status', task.status)" class="chip-filter-x" title="Убрать из фильтра" @click.stop="clearQuickFilter('status', task.status)"><i class="fas fa-xmark"></i></button>
                    </span>
                    <span v-else class="status-label status-label--none">—</span>
                  </td>
                </tr>
                <tr v-if="!filteredTasks.length">
                  <td colspan="8" class="empty-state">Задач не найдено</td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>

        <!-- ── KANBAN VIEW ───────────────────────────────────────────────────── -->
        <template v-else-if="currentBoard">
          <div class="content-header">
            <div>
              <h1 class="page-title">{{ currentBoard.name }}</h1>
              <div class="page-subtitle">{{ currentProject?.name }}</div>
            </div>
          </div>

          <div class="kanban-wrap" ref="kanbanWrapEl" @dragover.prevent="onWrapDragOver" @drop.prevent="onDrop($event)">
            <div
              v-for="col in currentBoard.columns"
              :key="col.id"
              class="kanban-col"
              :data-col-id="col.id"
              :class="{ 'drag-over': dragOverColId === col.id, 'col-drag-over-before': colDragId && colDragOverId === col.id && colDropBefore, 'col-drag-over-after': colDragId && colDragOverId === col.id && !colDropBefore }"
              @dragenter.prevent="onDragOver($event, col.id)"
              @dragover.prevent="onDragOver($event, col.id)"
              @dragleave="onDragLeave"
            >
              <!-- Column header -->
              <div class="kanban-col-header"
                @dragover="onColDragOver(col, $event)"
                @drop="onColDrop(col, $event)">
                <span class="kanban-col-grip" title="Перетащить колонку" draggable="true"
                  @dragstart="onColDragStart(col, $event)" @dragend="onColDragEnd">
                  <i class="fas fa-grip-vertical"></i>
                </span>
                <span class="kanban-col-dot" :style="{ background: col.color || '#94a3b8' }"></span>
                <input v-if="editingColId === col.id" v-model="editingColName" class="kanban-col-title-input"
                  @keydown.enter="saveColName(col)" @keydown.esc="editingColId = null" @blur="saveColName(col)" />
                <span v-else class="kanban-col-title" @click="startEditCol(col)">{{ col.name }}</span>
                <span class="kanban-col-count">{{ tasksByColumn[col.id]?.length || 0 }}</span>
                <button class="kanban-col-dots" title="Действия" @click.stop="toggleColMenu(col, $event)"><i class="fas fa-ellipsis-vertical"></i></button>
              </div>

              <!-- Создать задачу -->
              <div v-if="addTaskColId === col.id" class="kanban-add-task">
                <input
                  class="kanban-add-task-input"
                  v-model="newTaskTitle"
                  placeholder="Название задачи"
                  autofocus
                  @keydown.enter="createTaskInColumn(col.id)"
                  @keydown.esc="cancelAddColTask"
                  @blur="newTaskTitle.trim() ? createTaskInColumn(col.id) : cancelAddColTask()"
                />
              </div>
              <button v-else class="kanban-add-task-btn" @click="startAddColTask(col.id)">
                <i class="fas fa-plus"></i> Создать задачу
              </button>

              <!-- Cards -->
              <div class="kanban-cards">
                <template v-for="task in tasksByColumn[col.id]" :key="task.id">
                <div v-if="draggedTaskId && dragOverColId === col.id && dragOverBeforeId === task.id && draggedTaskId !== task.id" class="kanban-placeholder"></div>
                <div
                  class="kanban-card"
                  :class="{ dragging: draggedTaskId === task.id, 'kanban-card--done': isTaskCompleted(task) }"
                  draggable="true"
                  @click="openTask(task)"
                  @dragstart="onDragStart($event, task)"
                  @dragover="onCardDragOver($event, col.id, task)"
                  @dragend="onDragEnd"
                >
                  <!-- Отметка выполнения -->
                  <div v-if="isTaskCompleted(task)" class="kcard-done-check" title="Задача завершена"><i class="fas fa-check"></i></div>

                  <!-- Priority icon -->
                  <div v-if="priority(task.priority).icon" class="kcard-priority">
                    <span
                      class="priority-icon"
                      :style="{ color: priority(task.priority).color }"
                      :title="priority(task.priority).label"
                    >
                      <i class="fas" :class="priority(task.priority).icon"></i>
                    </span>
                  </div>
                  <div class="kcard-title">{{ task.title }}</div>

                  <!-- Tags -->
                  <div v-if="task.tags.length" class="tags-wrap" style="margin-bottom:10px">
                    <span v-for="tag in task.tags" :key="tag" class="chip">{{ tag }}</span>
                  </div>

                  <!-- Subtasks -->
                  <template v-if="task.subtasks.length">
                    <div class="kcard-subtasks-header">
                      <div class="subtask-bar-wrap">
                        <div class="subtask-bar-fill" :style="{ width: subtaskProgress(task).pct + '%' }"></div>
                      </div>
                      <span class="subtask-mini-label">{{ subtaskProgress(task).done }}/{{ subtaskProgress(task).total }}</span>
                    </div>
                    <ul class="kcard-subtask-list">
                      <li
                        v-for="sub in task.subtasks"
                        :key="sub.id"
                        class="kcard-subtask"
                        :class="{ done: sub.done }"
                        @click.stop="toggleCardSubtask(task, sub)"
                      >
                        <span class="subtask-check">
                          <i v-if="sub.done" class="fas fa-check"></i>
                        </span>
                        <span class="subtask-text">{{ sub.title }}</span>
                      </li>
                    </ul>
                  </template>

                  <!-- Соисполнители -->
                  <div v-if="task.coexecutors?.length" class="kcard-coexec">
                    <i class="fas fa-users kcard-coexec-icon"></i>
                    <div class="kcard-avatars">
                      <div v-for="u in task.coexecutors.slice(0, 4)" :key="u.id ?? u.name"
                        class="mini-avatar mini-avatar--sm kcard-avatar"
                        :style="{ background: avatarColor(u.initials).bg, color: avatarColor(u.initials).color }"
                        :title="u.name">{{ u.initials }}</div>
                      <div v-if="task.coexecutors.length > 4" class="mini-avatar mini-avatar--sm kcard-avatar kcard-avatar--more">+{{ task.coexecutors.length - 4 }}</div>
                    </div>
                  </div>

                  <!-- Footer: assignee + deadline -->
                  <div class="kcard-footer">
                    <div class="user-chip">
                      <div class="mini-avatar mini-avatar--sm"
                        :style="{ background: avatarColor(task.assignee.initials).bg, color: avatarColor(task.assignee.initials).color }">
                        {{ task.assignee.initials }}
                      </div>
                      <span>{{ task.assignee.name }}</span>
                    </div>
                    <span :class="['deadline-chip', 'deadline-chip--sm', isOverdue(task.deadline) && !isTaskCompleted(task) ? 'deadline-chip--overdue' : '']" :title="overdueLabel(task)">
                      <i class="fas fa-clock"></i>
                      {{ formatDate(task.deadline) }}
                    </span>
                  </div>
                  <div v-if="overdueLabel(task)" class="kcard-overdue"><i class="fas fa-triangle-exclamation"></i> {{ overdueLabel(task) }}</div>
                  <div v-if="isTaskCompleted(task) && task.dateCompleted" class="kcard-completed">
                    <i class="fas fa-circle-check"></i> Завершена {{ formatDate(task.dateCompleted) }}
                  </div>
                </div>
                </template>

                <!-- Плейсхолдер в самом низу -->
                <div v-if="draggedTaskId && dragOverColId === col.id && dragOverBeforeId === null" class="kanban-placeholder"></div>

                <div v-if="!tasksByColumn[col.id]?.length && !(draggedTaskId && dragOverColId === col.id)" class="kanban-col-empty">
                  <i class="fas fa-inbox"></i>
                  Перетащите сюда
                </div>
              </div>
            </div>

            <!-- Добавить колонку (всегда последняя справа) -->
            <div class="kanban-col kanban-col--add">
              <div class="kanban-col-header kanban-add-col">
                <i class="fas fa-plus" style="color:var(--text-tertiary);font-size:12px"></i>
                <input
                  class="kanban-add-col-input"
                  v-model="newColName"
                  placeholder="Новая колонка"
                  @keydown.enter="createColumn"
                />
              </div>
            </div>
          </div>
        </template>

      </main>
    </div>

    <!-- ══ CREATE TASK MODAL (Bitrix style) ════════════════════════════════════ -->
    <div v-if="showCreateModal" class="modal-backdrop" @mousedown.self="closeCreateModal" @click="closeAllDropdowns">
      <div class="bx-modal" @click.stop>

        <!-- Title row -->
        <div class="bx-title-row">
          <input
            v-model="createForm.title"
            class="bx-title-input"
            placeholder="Название задачи"
            @click.stop
          />
          <!-- Priority icon button -->
          <div class="bx-priority-wrap" @click.stop>
            <button
              class="bx-icon-btn"
              :class="{ active: createForm.priority }"
              :style="createForm.priority && PRIORITIES[createForm.priority]?.color ? { color: PRIORITIES[createForm.priority].color } : {}"
              title="Приоритет"
              @click.stop="ddPriority = !ddPriority"
            >
              <i class="fas fa-fire-flame-curved"></i>
            </button>
            <div v-if="ddPriority" class="bx-mini-dd" @click.stop>
              <template v-for="(p, key) in PRIORITIES" :key="key">
                <button v-if="p.icon" class="bx-mini-dd-item"
                  :class="{ active: createForm.priority === key }"
                  :style="createForm.priority === key ? { color: p.color } : {}"
                  @click.stop="createForm.priority = createForm.priority === key ? null : key; ddPriority=false">
                  <i class="fas" :class="p.icon" :style="{ color: p.color }"></i> {{ p.label }}
                </button>
              </template>
            </div>
          </div>
          <button class="bx-icon-btn" @click="closeCreateModal"><i class="fas fa-xmark"></i></button>
        </div>

        <!-- Description -->
        <div class="bx-desc-row">
          <textarea
            v-model="createForm.description"
            class="bx-desc-input"
            placeholder="Описание"
            rows="2"
            @click.stop
          ></textarea>
        </div>

        <div class="bx-divider"></div>

        <!-- Field rows -->
        <div class="bx-fields">

          <!-- Исполнитель -->
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

          <!-- Соисполнители -->
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

          <!-- Наблюдатели -->
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

          <!-- Дата начала -->
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

          <!-- Крайний срок -->
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

          <!-- Проект -->
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

          <!-- Теги -->
          <div class="bx-field" @click.stop>
            <span class="bx-field-label">Теги</span>
            <div class="bx-field-value-wrap bx-tags-wrap" style="position:relative">
              <span v-for="(tag, i) in createForm.tags" :key="tag" class="bx-tag">
                #{{ tag }}
                <button class="bx-tag-remove" @click.stop="removeTag(i)"><i class="fas fa-xmark"></i></button>
              </span>
              <input
                v-model="tagInput"
                class="bx-tag-input"
                :placeholder="createForm.tags.length ? '' : '#тег...'"
                @keydown="onTagKeydown"
                @input="onTagInput"
                @focus="tagInputFocused=true"
                @blur="addTag(); setTimeout(()=>{tagInputFocused=false},150)"
                @click.stop
              />
              <!-- Suggestions -->
              <div v-if="tagInputFocused && tagSuggestions.length" class="bx-tag-suggestions" @click.stop>
                <button
                  v-for="s in tagSuggestions.slice(0,8)" :key="s"
                  class="bx-tag-sug-item"
                  @mousedown.prevent="addTag(s)"
                >#{{ s }}</button>
              </div>
            </div>
          </div>

        </div><!-- /bx-fields -->

        <!-- Teleported dropdowns -->
        <Teleport to="body">
          <!-- backdrop to close -->
          <div v-if="ddAssignee||ddCoexecutors||ddObservers||ddProject||calOpen||clActivePopover||tagInputFocused" class="dd-close-overlay" @mousedown="closeAllDropdowns();closeCal();clActiveItem=null;clActivePopover=null;clPopAnchor=null;tagInputFocused=false"></div>

          <!-- Assignee -->
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

          <!-- Coexecutors -->
          <div v-if="ddCoexecutors" class="dd-menu bx-dd-menu" :style="ddFixedStyle('coexecutors')" @click.stop>
            <input v-model="searchCoexecutors" class="dd-search" placeholder="Поиск..." autofocus />
            <div class="dd-list">
              <button v-for="u in filteredUsers(searchCoexecutors)" :key="u.id" class="dd-item" :class="{ active: createForm.coexecutorIds.includes(u.id) }"
                @click.stop="toggleCoexecutor(u.id)">
                <div class="mini-avatar mini-avatar--sm" :style="{ background: avatarColor(u.initials).bg, color: avatarColor(u.initials).color }">{{ u.initials }}</div>
                <span>{{ u.name }}</span>
                <i v-if="createForm.coexecutorIds.includes(u.id)" class="fas fa-check check-mark"></i>
              </button>
            </div>
          </div>

          <!-- Observers -->
          <div v-if="ddObservers" class="dd-menu bx-dd-menu" :style="ddFixedStyle('observers')" @click.stop>
            <input v-model="searchObservers" class="dd-search" placeholder="Поиск..." autofocus />
            <div class="dd-list">
              <button v-for="u in filteredUsers(searchObservers)" :key="u.id" class="dd-item" :class="{ active: createForm.observerIds.includes(u.id) }"
                @click.stop="toggleObserver(u.id)">
                <div class="mini-avatar mini-avatar--sm" :style="{ background: avatarColor(u.initials).bg, color: avatarColor(u.initials).color }">{{ u.initials }}</div>
                <span>{{ u.name }}</span>
                <i v-if="createForm.observerIds.includes(u.id)" class="fas fa-check check-mark"></i>
              </button>
            </div>
          </div>

          <!-- Project -->
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

          <!-- Calendar: см. общий календарь в always-mounted Teleport ниже -->

          <!-- CL Popovers -->
          <div v-if="clActiveItem && clActivePopover === 'priority'" class="cl-pop cl-pop--priority" :style="clPopStyle" @click.stop>
            <template v-for="item in createForm.subtasks" :key="item.id">
              <template v-if="item.id === clActiveItem">
                <template v-for="(pv, pk) in PRIORITIES" :key="pk">
                  <button v-if="pv.icon" class="cl-priority-item"
                    :class="{ active: item.priority === pk }"
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
        </Teleport>

        <div class="bx-divider"></div>

        <!-- Attach bar -->
        <div class="bx-attach-bar">
          <button class="bx-attach-pill" @click.stop="$refs.fileInput.click()">
            <i class="fas fa-paperclip"></i> Файлы
            <span v-if="createForm.files.length" class="bx-pill-badge">{{ createForm.files.length }}</span>
          </button>
          <input ref="fileInput" type="file" multiple style="display:none" @change="onFileInput" />
          <button class="bx-attach-pill" :class="{ active: showChecklistPanel }" @click.stop="showChecklistPanel = true">
            <i class="fas fa-list-check"></i> Чек-листы
            <span v-if="createForm.subtasks.length" class="bx-pill-badge">{{ createForm.subtasks.length }}</span>
          </button>
        </div>

        <!-- Files list -->
        <div v-if="createForm.files.length" class="file-list" style="padding: 0 22px 10px">
          <div v-for="(f, i) in createForm.files" :key="i" class="file-item">
            <i class="fas fa-file"></i><span>{{ f.name }}</span>
            <button class="file-remove" @click="removeFile(i)"><i class="fas fa-xmark"></i></button>
          </div>
        </div>

        <!-- Footer -->
        <div class="bx-footer">
          <span v-if="submitError" class="bx-submit-error">{{ submitError }}</span>
          <button class="btn btn-primary" :disabled="!createForm.title.trim() || submitting" @click="submitCreateTask">
            <i v-if="submitting" class="fas fa-spinner fa-spin" style="margin-right:6px"></i>
            {{ submitting ? 'Создание...' : 'Создать' }}
          </button>
          <button class="bx-cancel-btn" :disabled="submitting" @click="closeCreateModal">Отмена</button>
        </div>

        <!-- ══ CHECKLIST PANEL (slides up inside bx-modal) ══════════════════ -->
        <transition name="cl-slide">
          <div v-if="showChecklistPanel" class="cl-panel" @click.stop>

            <!-- Header -->
            <div class="cl-card-header">
              <i class="fas fa-list-check" style="color:var(--brand-primary);font-size:14px"></i>
              <span class="cl-card-title">Чек-лист 1</span>
              <span v-if="createForm.subtasks.length" class="cl-card-progress">
                {{ createForm.subtasks.filter(s=>s.done).length }}/{{ createForm.subtasks.length }} выполнено
              </span>
              <div class="cl-card-header-actions">
                <button class="bx-icon-btn" @click.stop="closeChecklist"><i class="fas fa-xmark"></i></button>
              </div>
            </div>

            <!-- Progress bar -->
            <div class="cl-progress-bar">
              <div class="cl-progress-fill"
                :style="{ width: createForm.subtasks.length ? (createForm.subtasks.filter(s=>s.done).length / createForm.subtasks.length * 100) + '%' : '0%' }">
              </div>
            </div>

            <!-- Items list -->
            <div class="cl-items-list">
              <div
                v-for="(item, idx) in createForm.subtasks" :key="item.id"
                class="cl-row"
                :class="{ 'cl-row--active': clActiveItem === item.id || clEditingId === item.id }"
                @mouseenter="clActiveItem = item.id"
                @mouseleave="clEditingId !== item.id && !clActivePopover ? clActiveItem = null : null"
              >
                <!-- Toolbar: at top border of row -->
                <div
                  v-show="clActiveItem === item.id || clEditingId === item.id"
                  class="cl-row-toolbar"
                  @click.stop
                >
                  <button class="cl-tool-btn"
                    :style="item.priority && PRIORITIES[item.priority]?.color ? { color: PRIORITIES[item.priority].color } : {}"
                    @mousedown.prevent @click.stop="toggleClPopover(item.id, 'priority', $event)">
                    <i class="fas fa-fire-flame-curved"></i>
                  </button>
                  <div class="cl-tool-sep"></div>
                  <button class="cl-tool-btn" :class="{ active: item.coexecutorIds.length }"
                    @mousedown.prevent @click.stop="toggleClPopover(item.id, 'coexecutor', $event)">
                    <i class="fas fa-user"></i>
                    <span v-if="item.coexecutorIds.length" class="cl-action-badge">{{ item.coexecutorIds.length }}</span>
                  </button>
                  <button class="cl-tool-btn" :class="{ active: item.observerIds.length }"
                    @mousedown.prevent @click.stop="toggleClPopover(item.id, 'observer', $event)">
                    <i class="fas fa-eye"></i>
                    <span v-if="item.observerIds.length" class="cl-action-badge">{{ item.observerIds.length }}</span>
                  </button>
                  <div class="cl-tool-sep"></div>
                  <button class="cl-tool-btn cl-tool-btn--danger"
                    @mousedown.prevent @click.stop="removeSubtask(idx)">
                    <i class="fas fa-trash"></i>
                  </button>
                </div>

                <!-- Row content -->
                <input type="checkbox" v-model="item.done" class="cl-checkbox" @click.stop />
                <template v-if="clEditingId === item.id">
                  <textarea
                    :id="'cl-input-' + item.id"
                    v-model="item.title"
                    class="cl-row-edit-input"
                    placeholder="Название пункта..."
                    rows="1"
                    @blur="onClItemBlur(item, idx)"
                    @keydown.enter.prevent="onClItemEnter(item)"
                    @input="$event.target.style.height='auto';$event.target.style.height=$event.target.scrollHeight+'px'"
                    @click.stop
                  ></textarea>
                </template>
                <template v-else>
                  <span class="cl-row-text" :class="{ done: item.done }" @click="clEditingId = item.id; clActiveItem = item.id">{{ item.title }}</span>
                </template>

                <i v-if="item.priority && PRIORITIES[item.priority]?.icon"
                  class="fas cl-prio-dot" :class="PRIORITIES[item.priority].icon"
                  :style="{ color: PRIORITIES[item.priority].color }"></i>
              </div>

              <!-- Add item button -->
              <button class="cl-add-btn" @click.stop="addClItem">
                <i class="fas fa-plus cl-add-icon"></i>
                <span>Добавить пункт</span>
              </button>
            </div>

            <!-- Footer -->
            <div class="cl-card-footer">
              <button class="btn btn-primary" @click="closeChecklist">Сохранить</button>
            </div>

          </div>
        </transition>

      </div>
    </div>

  <!-- ══ TASK DETAIL MODAL ═══════════════════════════════════════════════════ -->
  <Teleport to="body">
    <transition name="td-fade">
      <div v-if="viewTask" class="td-backdrop" @mousedown.self="closeTask">
        <div class="td-modal" @click.stop>

          <!-- ── LEFT PANEL ── -->
          <div class="td-left">

            <!-- Title row -->
            <div class="td-title-row">
              <div class="td-title-edit-wrap">
                <textarea v-if="canEdit" ref="tdTitleEl" v-model="viewTask.title" class="td-title td-title-edit" rows="1"
                  @blur="saveTaskField('title')"
                  @keydown.enter.prevent="saveTaskField('title')"
                  @input="autosizeTitle($event.target)"
                ></textarea>
                <div v-else class="td-title">{{ viewTask.title }}</div>
              </div>

              <div class="td-title-actions">
                <div class="td-prio-wrap">
                  <button class="td-prio-badge" :class="`td-prio-badge--${viewTask.priority}`"
                    @click.stop="canEdit ? tdPriorityOpen = !tdPriorityOpen : null"
                    :style="{ cursor: canEdit ? 'pointer' : 'default' }">
                    <i v-if="PRIORITIES[viewTask.priority]?.icon" class="fas" :class="PRIORITIES[viewTask.priority].icon" :style="{ color: PRIORITIES[viewTask.priority].color }"></i>
                    <span>{{ PRIORITIES[viewTask.priority]?.label || 'Без приоритета' }}</span>
                  </button>
                  <div v-if="tdPriorityOpen && canEdit" class="td-prio-menu">
                    <button v-for="(pv, pk) in PRIORITIES" :key="pk" class="td-prio-item"
                      :class="{ active: viewTask.priority === pk }"
                      @click.stop="viewTask.priority = pk; tdPriorityOpen = false; saveTaskField('priority')">
                      <i v-if="pv.icon" class="fas" :class="pv.icon" :style="{ color: pv.color }"></i>
                      <span>{{ pv.label }}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Scrollable body -->
            <div class="td-body">

              <!-- Description -->
              <div class="td-section td-section--desc" v-if="viewTask.description || canEdit">
                <textarea v-if="canEdit" v-model="viewTask.description" class="td-description td-desc-edit"
                  placeholder="Описание задачи..."
                  @blur="saveTaskField('description')"
                  @input="$event.target.style.height='auto';$event.target.style.height=$event.target.scrollHeight+'px'"
                ></textarea>
                <div v-else class="td-description">{{ viewTask.description }}</div>
              </div>

              <!-- Meta info -->
              <div class="td-section td-section--meta">
                <div class="td-meta-row">
                  <span class="td-meta-label"><i class="fas fa-user-pen"></i> Постановщик</span>
                  <div class="td-meta-val">
                    <div class="mini-avatar mini-avatar--sm" :style="{ background: avatarColor(viewTask.assigner.initials).bg, color: avatarColor(viewTask.assigner.initials).color }">{{ viewTask.assigner.initials }}</div>
                    <span>{{ viewTask.assigner.name }}</span>
                  </div>
                </div>
                <!-- Исполнитель: click whole row to change -->
                <div class="td-meta-row" :class="{ 'td-meta-row--clickable': canEdit }" @click.stop="canEdit ? openTdDD('assignee', $event) : null">
                  <span class="td-meta-label"><i class="fas fa-user-check"></i> Исполнитель</span>
                  <div class="td-meta-val">
                    <template v-if="viewTask.assignee?.name && viewTask.assignee.name !== '—'">
                      <div class="mini-avatar mini-avatar--sm" :style="{ background: avatarColor(viewTask.assignee.initials).bg, color: avatarColor(viewTask.assignee.initials).color }">{{ viewTask.assignee.initials }}</div>
                      <span>{{ viewTask.assignee.name }}</span>
                    </template>
                    <span v-else class="td-empty">Нажмите чтобы выбрать</span>
                  </div>
                </div>
                <!-- Соисполнители: × per chip, + to add -->
                <div class="td-meta-row">
                  <span class="td-meta-label"><i class="fas fa-users"></i> Соисполнители</span>
                  <div class="td-meta-val td-meta-val--wrap">
                    <div v-for="u in viewTask.coexecutors" :key="u.id ?? u.name" class="td-user-chip">
                      <div class="mini-avatar mini-avatar--sm" :style="{ background: avatarColor(u.initials).bg, color: avatarColor(u.initials).color }">{{ u.initials }}</div>
                      <span>{{ u.name }}</span>
                      <button v-if="canEdit" class="td-chip-del" @click.stop="toggleCoexecutorInTask(u.id)" title="Удалить"><i class="fas fa-xmark"></i></button>
                    </div>
                    <span v-if="!viewTask.coexecutors?.length" class="td-empty" style="margin-right:4px">Не выбраны</span>
                    <button v-if="canEdit" class="td-chip-add" @click.stop="openTdDD('coex', $event)" title="Добавить"><i class="fas fa-plus"></i></button>
                  </div>
                </div>
                <!-- Наблюдатели: × per chip, + to add -->
                <div class="td-meta-row">
                  <span class="td-meta-label"><i class="fas fa-eye"></i> Наблюдатели</span>
                  <div class="td-meta-val td-meta-val--wrap">
                    <div v-for="u in viewTask.observers" :key="u.id ?? u.name" class="td-user-chip">
                      <div class="mini-avatar mini-avatar--sm" :style="{ background: avatarColor(u.initials).bg, color: avatarColor(u.initials).color }">{{ u.initials }}</div>
                      <span>{{ u.name }}</span>
                      <button v-if="canEdit" class="td-chip-del" @click.stop="toggleObserverInTask(u.id)" title="Удалить"><i class="fas fa-xmark"></i></button>
                    </div>
                    <span v-if="!viewTask.observers?.length" class="td-empty" style="margin-right:4px">Не выбраны</span>
                    <button v-if="canEdit" class="td-chip-add" @click.stop="openTdDD('obs', $event)" title="Добавить"><i class="fas fa-plus"></i></button>
                  </div>
                </div>
                <!-- Даты: click to open calendar -->
                <div class="td-meta-row" :class="{ 'td-meta-row--clickable': canEdit }" @click.stop="canEdit ? openTdCal('startDate', $event) : null">
                  <span class="td-meta-label"><i class="fas fa-calendar-plus"></i> Дата начала</span>
                  <div class="td-meta-val">
                    <span v-if="viewTask.startDate">{{ formatDate(viewTask.startDate) }}</span>
                    <span v-else class="td-empty">Не задана</span>
                  </div>
                </div>
                <div class="td-meta-row" :class="{ 'td-meta-row--clickable': canEdit }" @click.stop="canEdit ? openTdCal('deadline', $event) : null">
                  <span class="td-meta-label"><i class="fas fa-calendar-days"></i> Крайний срок</span>
                  <div class="td-meta-val">
                    <span v-if="viewTask.deadline" :class="{ 'td-overdue': isOverdue(viewTask.deadline) }">{{ formatDate(viewTask.deadline) }}</span>
                    <span v-else class="td-empty">Не задан</span>
                  </div>
                </div>
                <div v-if="isCompleted" class="td-meta-row">
                  <span class="td-meta-label"><i class="fas fa-circle-check" style="color:#22c55e"></i> Дата завершения</span>
                  <div class="td-meta-val"><span style="color:#22c55e">{{ formatDate(viewTask.dateCompleted) }}</span></div>
                </div>
                <div class="td-meta-row">
                  <span class="td-meta-label"><i class="fas fa-circle-dot"></i> Статус</span>
                  <div class="td-meta-val"><span class="status-label status-badge" :class="statusClass(viewTask)">{{ viewTask.status || '—' }}</span></div>
                </div>
                <div class="td-meta-row">
                  <span class="td-meta-label"><i class="fas fa-calendar"></i> Создана</span>
                  <div class="td-meta-val">{{ formatDate(viewTask.createdAt) }}</div>
                </div>
                <!-- Связь -->
                <div v-if="viewTask.connectionName && connectionMeta(viewTask.connectionType)" class="td-meta-row">
                  <span class="td-meta-label"><i class="fas" :class="connectionMeta(viewTask.connectionType).icon"></i> Связь</span>
                  <div class="td-meta-val">
                    <a v-if="connectionRoute(viewTask) || (viewTask.connectionType === 'task-columns' && viewTask.taskBoardId)" class="td-conn-link" @click.stop="onConnClick(viewTask)">
                      {{ connectionMeta(viewTask.connectionType).label }}: {{ viewTask.connectionName }}
                    </a>
                    <span v-else>{{ connectionMeta(viewTask.connectionType).label }}: {{ viewTask.connectionName }}</span>
                  </div>
                </div>
                <!-- Проект: click to change -->
                <div class="td-meta-row" :class="{ 'td-meta-row--clickable': canEdit }" @click.stop="canEdit ? openTdDD('project', $event) : null">
                  <span class="td-meta-label"><i class="fas fa-folder"></i> Проект</span>
                  <div class="td-meta-val">
                    <span v-if="viewTask.project" class="chip project-chip">{{ viewTask.project }}</span>
                    <span v-else class="td-empty">Не выбран</span>
                  </div>
                </div>
                <div class="td-meta-row">
                  <span class="td-meta-label"><i class="fas fa-tags"></i> Теги</span>
                  <div class="td-meta-val td-meta-val--wrap" style="position:relative">
                    <template v-if="viewTask.tags?.length">
                      <span v-for="tag in viewTask.tags" :key="tag" class="bx-tag">
                        #{{ tag }}
                        <button v-if="canEdit" class="bx-tag-remove" @click.stop="removeTagInTask(tag)"><i class="fas fa-xmark"></i></button>
                      </span>
                    </template>
                    <template v-if="canEdit">
                      <input v-model="tdTagInput" class="bx-tag-input" placeholder="#тег..."
                        @keydown="onTdTagKeydown"
                        @focus="tdTagFocused=true"
                        @blur="addTagInTask(tdTagInput); tdTagInput=''; setTimeout(()=>{tdTagFocused=false},150)"
                        @click.stop
                      />
                      <div v-if="tdTagFocused && tdTagSuggestions.length" class="bx-tag-suggestions" @click.stop>
                        <button v-for="s in tdTagSuggestions.slice(0,8)" :key="s" class="bx-tag-sug-item" @mousedown.prevent="addTagInTask(s); tdTagInput=''">
                          #{{ s }}
                        </button>
                      </div>
                    </template>
                    <span v-else-if="!viewTask.tags?.length" class="td-empty">Нет тегов</span>
                  </div>
                </div>
              </div>

              <!-- Выполнение (таймеры) -->
              <div v-if="visibleAccomplishments.length" class="td-section td-section--exec">
                <div class="td-cl-header">
                  <i class="fas fa-stopwatch" style="color:var(--brand-primary)"></i>
                  <span>Выполнение</span>
                </div>
                <div v-for="acc in visibleAccomplishments" :key="acc.id" class="td-exec-row">
                  <div class="mini-avatar mini-avatar--sm" :style="{ background: avatarColor(acc.userInitials).bg, color: avatarColor(acc.userInitials).color }">{{ acc.userInitials }}</div>
                  <span class="td-exec-name">{{ acc.userName }}</span>
                  <span class="td-exec-timer" :class="accStateClass(acc)">
                    <i class="fas" :class="accIcon(acc)"></i>
                    <span class="td-exec-time">{{ accElapsed(acc) }}</span>
                    <span class="td-exec-tip">
                      <span class="td-exec-tip-row">Начало: {{ formatDate(acc.date_start) }}</span>
                      <span v-if="acc.date_stop" class="td-exec-tip-row">Приостановлено: {{ formatDate(acc.date_stop) }}</span>
                      <span v-if="acc.date_end" class="td-exec-tip-row">Завершено: {{ formatDate(acc.date_end) }}</span>
                    </span>
                  </span>
                </div>
              </div>

              <!-- Checklist -->
              <div v-if="viewTask.subtasks?.length || canEdit" class="td-section td-section--checklist">
                <div class="td-cl-header">
                  <i class="fas fa-list-check" style="color:var(--brand-primary)"></i>
                  <span>Чек-лист</span>
                  <span class="td-cl-progress">{{ viewTask.subtasks?.filter(s=>s.done).length ?? 0 }}/{{ viewTask.subtasks?.length ?? 0 }} выполнено</span>
                </div>
                <div v-if="viewTask.subtasks?.length" class="td-cl-bar"><div class="td-cl-fill" :style="{ width: (viewTask.subtasks.filter(s=>s.done).length / viewTask.subtasks.length * 100) + '%' }"></div></div>
                <div v-for="(s, idx) in viewTask.subtasks" :key="s.id"
                  class="td-cl-item"
                  :class="{ 'td-cl-item--active': tdClActiveItem === s.id || tdClEditingId === s.id }"
                  @mouseenter="tdClActiveItem = s.id"
                  @mouseleave="tdClEditingId !== s.id && !tdClActivePopover ? tdClActiveItem = null : null"
                >
                  <!-- Per-item toolbar (shown on hover) -->
                  <div v-show="(tdClActiveItem === s.id || tdClEditingId === s.id) && canEdit"
                    class="cl-row-toolbar" @click.stop>
                    <button class="cl-tool-btn" :class="{ active: (s.coexecutors??[]).length }"
                      @mousedown.prevent @click.stop="toggleTdClPopover(s.id, 'coexecutor', $event)">
                      <i class="fas fa-user"></i>
                      <span v-if="(s.coexecutors??[]).length" class="cl-action-badge">{{ s.coexecutors.length }}</span>
                    </button>
                    <button class="cl-tool-btn" :class="{ active: (s.observers??[]).length }"
                      @mousedown.prevent @click.stop="toggleTdClPopover(s.id, 'observer', $event)">
                      <i class="fas fa-eye"></i>
                      <span v-if="(s.observers??[]).length" class="cl-action-badge">{{ s.observers.length }}</span>
                    </button>
                    <div class="cl-tool-sep"></div>
                    <button class="cl-tool-btn cl-tool-btn--danger"
                      @mousedown.prevent @click.stop="removeClItemInTask(s, idx)">
                      <i class="fas fa-trash"></i>
                    </button>
                  </div>
                  <input type="checkbox" :checked="s.done" class="cl-checkbox"
                    :disabled="!canCheckItems"
                    @change="toggleClItemDone(s)" />
                  <div class="td-cl-content">
                    <template v-if="tdClEditingId === s.id">
                      <textarea
                        v-model="s.title" class="cl-row-edit-input" rows="1"
                        @blur="saveTdClItemTitle(s)"
                        @keydown.enter.prevent="saveTdClItemTitle(s)"
                        @input="$event.target.style.height='auto';$event.target.style.height=$event.target.scrollHeight+'px'"
                        @click.stop
                      ></textarea>
                    </template>
                    <template v-else>
                      <span
                        :class="['td-cl-text', { 'td-cl-text--done': s.done }]"
                        @click="canEdit ? (tdClEditingId = s.id, tdClActiveItem = s.id) : null"
                      >{{ s.title }}</span>
                    </template>
                    <!-- Assigned users under the item text -->
                    <div v-if="(s.coexecutors?.length || s.observers?.length)" class="td-cl-users">
                      <template v-if="s.coexecutors?.length">
                        <span class="td-cl-role-label"><i class="fas fa-user" style="font-size:9px"></i></span>
                        <div v-for="u in s.coexecutors" :key="u.id" class="mini-avatar mini-avatar--xs" :style="{ background: avatarColor(u.initials).bg, color: avatarColor(u.initials).color }" :title="u.name">{{ u.initials }}</div>
                      </template>
                      <template v-if="s.observers?.length">
                        <span class="td-cl-role-label" style="margin-left:4px"><i class="fas fa-eye" style="font-size:9px"></i></span>
                        <div v-for="u in s.observers" :key="u.id" class="mini-avatar mini-avatar--xs" :style="{ background: avatarColor(u.initials).bg, color: avatarColor(u.initials).color }" :title="u.name">{{ u.initials }}</div>
                      </template>
                    </div>
                  </div>
                </div>
                <div v-if="canEdit" class="td-cl-add">
                  <i class="fas fa-plus" style="color:var(--text-tertiary);font-size:12px"></i>
                  <input v-model="tdClDraft" class="td-cl-add-input" placeholder="Добавить пункт..."
                    @keydown.enter.prevent="addClItemInTask"
                    @blur="tdClDraft.trim() ? addClItemInTask() : null" />
                </div>
              </div>

              <!-- Результат работы -->
              <div v-if="isExecutor || isCreator || taskResults.length" class="td-section td-section--result">
                <div class="td-cl-header">
                  <i class="fas fa-clipboard-check" style="color:var(--brand-primary)"></i>
                  <span>Результат работы</span>
                  <span v-if="taskResults.length" class="td-cl-progress">{{ taskResults.length }}</span>
                </div>

                <!-- Список результатов -->
                <div v-for="res in taskResults" :key="res.id" class="res-item">
                  <button class="res-item-head" @click="openResultView(res)">
                    <div class="mini-avatar mini-avatar--sm" :style="{ background: avatarColor(res.initials).bg, color: avatarColor(res.initials).color }">{{ res.initials }}</div>
                    <div class="res-item-meta">
                      <span class="res-item-title">{{ res.label }}</span>
                      <span class="res-item-date">{{ formatDate(res.createdAt) }}</span>
                    </div>
                    <span v-if="res.files.length" class="res-item-files-count"><i class="fas fa-paperclip"></i> {{ res.files.length }}</span>
                    <i class="fas fa-chevron-right res-item-caret"></i>
                  </button>
                </div>

                <button v-if="isExecutor || isCreator" class="btn btn-ghost td-result-add" @click="openResultModal">
                  <i class="fas fa-plus"></i> Добавить результат
                </button>
              </div>

              <!-- Files -->
              <div v-if="viewTask.rawFiles?.length || canEdit" class="td-section td-section--files">
                <div class="td-files-header">
                  <i class="fas fa-paperclip" style="color:var(--brand-primary)"></i>
                  <span>Файлы</span>
                  <span class="td-cl-progress">{{ viewTask.rawFiles?.length ?? 0 }}</span>
                  <label v-if="canEdit" class="td-file-upload-btn" title="Загрузить файлы">
                    <i v-if="tdFileUploading" class="fas fa-spinner fa-spin"></i>
                    <i v-else class="fas fa-plus"></i>
                    <input type="file" multiple style="display:none" :disabled="tdFileUploading"
                      @change="uploadFilesToTask($event.target.files); $event.target.value=''" />
                  </label>
                </div>
                <div class="td-files-list">
                  <div v-for="file in viewTask.rawFiles" :key="file.id" class="td-file-item">
                    <div class="td-file-icon"><i class="fas" :class="fileIcon(file.extension)"></i></div>
                    <span class="td-file-name" @click="openFilePreview(file)">{{ file.original_name }}</span>
                    <button class="td-icon-btn" @click="downloadFile(file)" title="Скачать"><i class="fas fa-download"></i></button>
                    <button v-if="canEdit" class="td-icon-btn" @click="deleteFile(file)" title="Удалить" style="color:#ef4444"><i class="fas fa-trash"></i></button>
                  </div>
                  <div v-if="!viewTask.rawFiles?.length && !tdFileUploading" class="td-empty" style="padding:4px 0;font-size:12px">Нет прикреплённых файлов</div>
                </div>
              </div>

            </div><!-- /td-body -->

            <!-- Footer actions -->
            <div class="td-footer">
              <template v-if="isCompleted">
                <span class="td-completed-badge"><i class="fas fa-circle-check"></i> Задача завершена</span>
              </template>
              <template v-else>
                <!-- Управление своим выполнением (исполнители + постановщик/создатель) -->
                <template v-if="isExecutor || isCreator">
                  <button v-if="myState === 'not_started'" class="btn btn-success" :disabled="accBusy" @click="startTask"><i class="fas fa-play"></i> Начать</button>
                  <button v-else-if="myState === 'running'" class="btn btn-warning" :disabled="accBusy" @click="pauseMyAcc"><i class="fas fa-pause"></i> Приостановить</button>
                  <button v-else-if="myState === 'paused'" class="btn btn-success" :disabled="accBusy" @click="resumeMyAcc"><i class="fas fa-play"></i> Возобновить</button>
                  <span v-else-if="myState === 'finished'" class="td-completed-badge"><i class="fas fa-circle-check"></i> Вы завершили выполнение</span>
                  <!-- Завершить: видна после старта, а также постановщику/ответственному в любой момент -->
                  <button v-if="myState === 'running' || myState === 'paused' || isResponsible || isCreator" class="btn btn-primary" @click="onCompleteClick"><i class="fas fa-check"></i> Завершить</button>
                </template>
              </template>
              <div v-if="isCreator" class="td-menu-wrap">
                <button class="td-dots-btn" @click.stop="viewTaskMenu = !viewTaskMenu"><i class="fas fa-ellipsis-vertical"></i></button>
                <transition name="td-menu">
                  <div v-if="viewTaskMenu" class="td-dot-menu" @click.stop>
                    <button class="td-dot-item td-dot-item--danger" @click="deleteTask()"><i class="fas fa-trash"></i> Удалить задачу</button>
                  </div>
                </transition>
              </div>
            </div>

            <!-- Панель «Добавить результат» — выезжает снизу вверх внутри td-left -->
            <transition name="result-slide">
              <div v-if="showResultModal" class="result-panel">
                <div class="result-modal-header">
                  <span>Добавить результат</span>
                  <button class="td-icon-btn" @click="closeResultModal"><i class="fas fa-xmark"></i></button>
                </div>
                <div
                  ref="resultEditor"
                  class="result-editor"
                  contenteditable="true"
                  data-ph="Опишите результат работы..."
                ></div>
                <div v-if="resultFiles.length" class="result-files">
                  <div v-for="(f, i) in resultFiles" :key="i" class="result-file">
                    <i class="fas fa-paperclip"></i>
                    <span class="result-file-name">{{ f.name }}</span>
                    <button class="td-icon-btn" @click="removeResultFile(i)"><i class="fas fa-xmark"></i></button>
                  </div>
                </div>
                <div class="result-toolbar">
                  <label class="res-tool" title="Прикрепить файл">
                    <i class="fas fa-paperclip"></i>
                    <input type="file" multiple style="display:none" @change="onResultFiles">
                  </label>
                  <button class="res-tool" title="Маркированный список" @mousedown.prevent @click="execFmt('insertUnorderedList')"><i class="fas fa-list-ul"></i></button>
                  <button class="res-tool" title="Нумерованный список" @mousedown.prevent @click="execFmt('insertOrderedList')"><i class="fas fa-list-ol"></i></button>
                  <button class="res-tool" title="Блок кода" @mousedown.prevent @click="insertBlock('code')"><i class="fas fa-code"></i></button>
                  <button class="res-tool" title="Цитата" @mousedown.prevent @click="insertBlock('quote')"><i class="fas fa-quote-right"></i></button>
                  <button class="res-tool" title="Спойлер" @mousedown.prevent @click="insertBlock('spoiler')"><i class="fas fa-eye-slash"></i></button>
                  <button class="btn btn-primary result-send" :disabled="resultSubmitting" @click="submitResult">
                    <i v-if="resultSubmitting" class="fas fa-spinner fa-spin"></i>
                    <i v-else class="fas fa-paper-plane"></i> Отправить
                  </button>
                </div>
              </div>
            </transition>

            <!-- Панель просмотра результата — выезжает снизу вверх -->
            <transition name="result-slide">
              <div v-if="viewingResult" class="result-panel">
                <div class="result-modal-header">
                  <div class="result-view-head">
                    <div class="mini-avatar mini-avatar--sm" :style="{ background: avatarColor(viewingResult.initials).bg, color: avatarColor(viewingResult.initials).color }">{{ viewingResult.initials }}</div>
                    <div class="res-item-meta">
                      <span class="res-item-title">{{ viewingResult.label }}</span>
                      <span class="res-item-date">{{ formatDate(viewingResult.createdAt) }}</span>
                    </div>
                  </div>
                  <button class="td-icon-btn" @click="closeResultView"><i class="fas fa-xmark"></i></button>
                </div>
                <div class="result-view-scroll">
                  <div class="res-content" v-html="viewingResult.text"></div>
                  <div v-if="viewingResult.files.length" class="result-view-files">
                    <div class="res-files-label"><i class="fas fa-paperclip"></i> Прикреплённые файлы</div>
                    <div v-for="file in viewingResult.files" :key="file.id" class="td-file-item">
                      <div class="td-file-icon"><i class="fas" :class="fileIcon(file.extension)"></i></div>
                      <span class="td-file-name" @click="openFilePreview(file)">{{ file.original_name }}</span>
                      <button class="td-icon-btn" @click="downloadFile(file)" title="Скачать"><i class="fas fa-download"></i></button>
                    </div>
                  </div>
                </div>
              </div>
            </transition>

          </div><!-- /td-left -->

          <!-- ── RIGHT PANEL — CHAT ── -->
          <div class="td-right">
            <div class="td-chat-header">
              <i class="fas fa-comments" style="color:var(--brand-primary);font-size:15px"></i>
              <span class="td-chat-title">Чат задачи</span>
              <button class="td-icon-btn td-icon-btn--close td-chat-close" @click="closeTask"><i class="fas fa-xmark"></i></button>
            </div>

            <!-- Messages -->
            <div class="td-chat-messages" ref="chatMessagesEl">
              <div v-if="chatStore.messagesLoading" class="td-chat-empty">
                <i class="fas fa-spinner fa-spin"></i> Загрузка...
              </div>
              <template v-else-if="chatMessageGroups.length">
                <template v-for="(item, idx) in chatMessageGroups" :key="idx">
                  <div v-if="item.type==='date'" class="td-chat-date-sep">{{ item.label }}</div>
                  <div v-else-if="item.type==='log'" class="td-log">
                    <i class="fas fa-clock-rotate-left td-log-icon"></i>
                    <span class="td-log-text">{{ item.data.full_log || item.data.message }}</span>
                    <span class="td-log-time">{{ chatFmtTime(item.data.created_at) }}</span>
                  </div>
                  <div v-else
                    :class="['td-msg', chatIsMe(item.data) ? 'td-msg--me' : 'td-msg--other']"
                    :data-msg-id="item.data.id">
                    <div class="td-msg-body">
                      <div v-if="!chatIsMe(item.data)" class="td-msg-author">{{ chatSenderName(item.data) }}</div>
                      <div class="td-msg-bubble" :class="chatIsMe(item.data) ? 'td-msg-bubble--me' : 'td-msg-bubble--other'">
                        <div class="td-msg-text" v-html="chatRenderText(item.data.message_text)"></div>
                        <div v-if="item.data.attachments?.length" class="td-msg-attaches">
                          <template v-for="att in item.data.attachments" :key="att.id">
                            <img v-if="chatIsImage(att)"
                              :src="chatStore.getAttachmentUrl(chatStore.currentChatId, item.data.id, att.id)"
                              class="td-msg-img"
                              @click.stop="openChatImage(chatStore.getAttachmentUrl(chatStore.currentChatId, item.data.id, att.id))" />
                            <a v-else
                              :href="chatStore.getAttachmentUrl(chatStore.currentChatId, item.data.id, att.id)"
                              target="_blank" class="td-msg-file">
                              <i class="fas fa-paperclip"></i> {{ att.file_name || 'Файл' }}
                            </a>
                          </template>
                        </div>
                      </div>
                      <div class="td-msg-time">{{ chatFmtTime(item.data.created_at) }}</div>
                    </div>
                  </div>
                </template>
              </template>
              <div v-else class="td-chat-empty">Нет сообщений. Напишите первым!</div>
            </div>

            <!-- Attachment preview -->
            <div v-if="chatAttachFile" class="td-chat-attach-preview">
              <img v-if="chatAttachFile.type.startsWith('image/')" :src="chatAttachPreview" class="td-chat-attach-img" />
              <span v-else class="td-chat-attach-name"><i class="fas fa-paperclip"></i> {{ chatAttachFile.name }}</span>
              <button class="td-icon-btn" @click="chatAttachFile=null;chatAttachPreview=''"><i class="fas fa-xmark"></i></button>
            </div>

            <!-- Input -->
            <div class="td-chat-input-wrap" style="position:relative">
              <label class="td-chat-attach-btn" title="Прикрепить файл">
                <i class="fas fa-paperclip"></i>
                <input type="file" style="display:none" @change="chatHandleFileSelect">
              </label>
              <textarea
                ref="chatTextareaRef"
                v-model="chatMessageText"
                class="td-chat-input"
                placeholder="Написать сообщение... (@ для упоминания)"
                rows="1"
                @keydown="chatKeydown"
                @input="chatHandleInput"
              ></textarea>
              <button class="td-chat-send" :disabled="chatStore.sendingMessage || (!chatMessageText.trim() && !chatAttachFile)" @click="chatSend">
                <i class="fas fa-paper-plane"></i>
              </button>
              <!-- Mention dropdown -->
              <div v-if="chatMentionOpen && chatMentionUsers.length" class="td-chat-mention-dd">
                <button v-for="u in chatMentionUsers" :key="u.id" class="td-chat-mention-item"
                  @mousedown.prevent @click="chatSelectMention(u)">
                  {{ [u.surname,u.name,u.patronymic].filter(Boolean).join(' ') }}
                </button>
              </div>
            </div>
          </div><!-- /td-right -->

        </div>
      </div>
    </transition>
  </Teleport>

  <!-- File preview modal -->
  <Teleport to="body">
    <div v-if="previewFile" class="file-preview-backdrop" @click="previewFile = null">
      <div class="file-preview-modal" @click.stop>
        <button class="td-icon-btn td-icon-btn--close" style="position:absolute;top:10px;right:10px" @click="previewFile = null"><i class="fas fa-xmark"></i></button>
        <img v-if="imageExts.includes(previewFile.extension?.toLowerCase())" :src="`/apisup/supply/task-files/${previewFile.id}/download`" class="file-preview-img" />
        <iframe v-else :src="previewUrl" class="file-preview-frame"></iframe>
      </div>
    </div>
  </Teleport>

  <!-- ── Task-detail portals (dropdowns, popovers) ��� always mounted ── -->
  <Teleport to="body">
    <!-- Backdrop to close all task-detail overlays (без приоритета — меню приоритета инлайновое) -->
    <div v-if="tdDdAssignee||tdDdCoex||tdDdObs||tdDdProject||tdClActivePopover" class="dd-close-overlay"
      @mousedown="closeTdDDs();closeTdClPopover()"></div>
  </Teleport>

  <!-- Полноэкранный просмотр картинки из чата -->
  <Teleport to="body">
    <div v-if="chatFullImage" class="chat-img-overlay" @click="closeChatImage">
      <button class="chat-img-close" @click.stop="closeChatImage"><i class="fas fa-xmark"></i></button>
      <img :src="chatFullImage" class="chat-img-full" @click.stop />
    </div>
  </Teleport>

  <!-- Общий календарь (для создания и деталей задачи) -->
  <Teleport to="body">
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
          <div class="cal-dow-row">
            <span v-for="d in ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']" :key="d" class="cal-dow">{{ d }}</span>
          </div>
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
                <button v-for="h in Array.from({length:24},(_,i)=>i)" :key="h" class="cal-time-btn"
                  :class="{ 'cal-time-btn--sel': getFieldDate()?.getHours()===h }"
                  @click.stop="selectCalHour(h)">{{ h.toString().padStart(2,'0') }}</button>
              </div>
            </div>
            <div class="cal-picker-divider"></div>
            <div class="cal-picker-col">
              <div class="cal-picker-label">Минуты</div>
              <div class="cal-mins-grid">
                <button v-for="m in [0,5,10,15,20,25,30,35,40,45,50,55]" :key="m" class="cal-time-btn"
                  :class="{ 'cal-time-btn--sel': getFieldDate()?.getMinutes()===m }"
                  @click.stop="selectCalMinute(m)">{{ m.toString().padStart(2,'0') }}</button>
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

  <!-- Создание доски -->
  <Teleport to="body">
    <div v-if="showBoardModal" class="confirm-backdrop" @mousedown.self="closeBoardModal">
      <div class="board-modal">
        <div class="result-modal-header">
          <span>Новая доска</span>
          <button class="td-icon-btn" @click="closeBoardModal"><i class="fas fa-xmark"></i></button>
        </div>
        <div class="board-modal-body">
          <div class="board-field">
            <label>Название доски</label>
            <input v-model="boardName" type="text" class="board-input" placeholder="Например, Спринт 1" />
          </div>

          <div class="board-field">
            <label>Проект / Объект</label>
            <div class="board-combo" @focusout="e => { if (!e.currentTarget.contains(e.relatedTarget)) boardObjectOpen = false }">
              <div class="board-combo-box">
                <input
                  class="board-combo-input"
                  :value="boardObjectOpen ? boardObjectQuery : (boardObject?.name || '')"
                  placeholder="Выберите проект или объект..."
                  @focus="boardObjectOpen = true; boardObjectQuery = ''"
                  @input="boardObjectQuery = $event.target.value; boardObjectOpen = true"
                />
                <button v-if="boardObject" type="button" class="fcombo-clear" @click.stop="clearBoardObject"><i class="fas fa-xmark"></i></button>
              </div>
              <div v-if="boardObjectOpen" class="board-combo-dd">
                <button
                  v-for="o in boardObjectFiltered" :key="o.id + o.type"
                  type="button" class="board-combo-item"
                  @mousedown.prevent @click="selectBoardObject(o)"
                >
                  <i class="fas" :class="o.type === 'object' ? 'fa-building' : 'fa-diagram-project'" style="color:var(--text-tertiary);font-size:12px"></i>
                  <span>{{ o.name }}</span>
                </button>
                <div v-if="!boardObjectFiltered.length" class="fcombo-empty">Ничего не найдено</div>
              </div>
            </div>
          </div>

          <div class="board-field">
            <label>Исполнители</label>
            <div class="board-combo" @focusout="e => { if (!e.currentTarget.contains(e.relatedTarget)) boardExecOpen = false }">
              <div class="board-combo-box board-combo-box--multi">
                <span v-for="m in boardExecutors" :key="m.id" class="fcombo-chip">
                  {{ m.name }}
                  <button type="button" class="fcombo-chip-x" @click.stop="removeBoardExec(m.id)"><i class="fas fa-xmark"></i></button>
                </span>
                <input class="board-combo-input" v-model="boardExecQuery" placeholder="Добавить исполнителя..." @focus="boardExecOpen = true" @input="boardExecOpen = true" />
              </div>
              <div v-if="boardExecOpen" class="board-combo-dd">
                <button v-for="u in boardExecFiltered" :key="u.id" type="button" class="board-combo-item" @mousedown.prevent @click="addBoardExec(u)">
                  <div class="mini-avatar mini-avatar--sm" :style="{ background: avatarColor(u.initials).bg, color: avatarColor(u.initials).color }">{{ u.initials }}</div>
                  <span>{{ u.name }}</span>
                </button>
                <div v-if="!boardExecFiltered.length" class="fcombo-empty">Ничего не найдено</div>
              </div>
            </div>
          </div>

          <div class="board-field">
            <label>Наблюдатели</label>
            <div class="board-combo" @focusout="e => { if (!e.currentTarget.contains(e.relatedTarget)) boardObsOpen = false }">
              <div class="board-combo-box board-combo-box--multi">
                <span v-for="m in boardObservers" :key="m.id" class="fcombo-chip">
                  {{ m.name }}
                  <button type="button" class="fcombo-chip-x" @click.stop="removeBoardObs(m.id)"><i class="fas fa-xmark"></i></button>
                </span>
                <input class="board-combo-input" v-model="boardObsQuery" placeholder="Добавить наблюдателя..." @focus="boardObsOpen = true" @input="boardObsOpen = true" />
              </div>
              <div v-if="boardObsOpen" class="board-combo-dd">
                <button v-for="u in boardObsFiltered" :key="u.id" type="button" class="board-combo-item" @mousedown.prevent @click="addBoardObs(u)">
                  <div class="mini-avatar mini-avatar--sm" :style="{ background: avatarColor(u.initials).bg, color: avatarColor(u.initials).color }">{{ u.initials }}</div>
                  <span>{{ u.name }}</span>
                </button>
                <div v-if="!boardObsFiltered.length" class="fcombo-empty">Ничего не найдено</div>
              </div>
            </div>
          </div>
        </div>
        <div class="board-modal-footer">
          <button class="btn btn-ghost" :disabled="boardSubmitting" @click="closeBoardModal">Отмена</button>
          <button class="btn btn-primary" :disabled="boardSubmitting || !boardName.trim() || !boardObject" @click="submitBoard">
            <i v-if="boardSubmitting" class="fas fa-spinner fa-spin"></i>
            <i v-else class="fas fa-check"></i> Создать
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Меню колонки -->
  <Teleport to="body">
    <div v-if="colMenuId" class="dd-close-overlay" @mousedown="closeColMenu"></div>
    <div v-if="colMenuId" class="board-menu" :style="colMenuStyle" @click.stop>
      <button class="td-dot-item td-dot-item--danger" @click="deleteColumn(colMenuId)"><i class="fas fa-trash"></i> Удалить</button>
    </div>
  </Teleport>

  <!-- Меню доски -->
  <Teleport to="body">
    <div v-if="boardMenuId" class="dd-close-overlay" @mousedown="closeBoardMenu"></div>
    <div v-if="boardMenuId" class="board-menu" :style="boardMenuStyle" @click.stop>
      <button class="td-dot-item" @click="openBoardRename(boardMenuId)"><i class="fas fa-pen"></i> Редактировать</button>
      <button class="td-dot-item" @click="openBoardMembers(boardMenuId)"><i class="fas fa-users"></i> Участники / доступы</button>
      <button class="td-dot-item td-dot-item--danger" @click="openBoardDelete(boardMenuId)"><i class="fas fa-trash"></i> Удалить</button>
    </div>
  </Teleport>

  <!-- Переименование доски -->
  <Teleport to="body">
    <div v-if="showBoardRename" class="confirm-backdrop" @mousedown.self="showBoardRename = false">
      <div class="board-modal" style="width:420px">
        <div class="result-modal-header">
          <span>Редактировать доску</span>
          <button class="td-icon-btn" @click="showBoardRename = false"><i class="fas fa-xmark"></i></button>
        </div>
        <div class="board-modal-body">
          <div class="board-field">
            <label>Название доски</label>
            <input v-model="renameBoardName" type="text" class="board-input" @keydown.enter="askRenameConfirm" />
          </div>
        </div>
        <div class="board-modal-footer">
          <button class="btn btn-ghost" @click="showBoardRename = false">Отмена</button>
          <button class="btn btn-primary" :disabled="!renameBoardName.trim()" @click="askRenameConfirm"><i class="fas fa-check"></i> Сохранить</button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Подтверждение переименования -->
  <Teleport to="body">
    <div v-if="showRenameConfirm" class="confirm-backdrop" @click.self="showRenameConfirm = false">
      <div class="confirm-modal">
        <div class="confirm-icon confirm-icon--success"><i class="fas fa-pen"></i></div>
        <div class="confirm-title">Изменить название?</div>
        <div class="confirm-text">Сохранить новое название доски «{{ renameBoardName }}»?</div>
        <div class="confirm-actions">
          <button class="btn btn-ghost" :disabled="boardOpSubmitting" @click="showRenameConfirm = false">Отмена</button>
          <button class="btn btn-primary" :disabled="boardOpSubmitting" @click="confirmBoardRename">
            <i v-if="boardOpSubmitting" class="fas fa-spinner fa-spin"></i> Сохранить
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Подтверждение удаления доски -->
  <Teleport to="body">
    <div v-if="showBoardDelete" class="confirm-backdrop" @click.self="showBoardDelete = false">
      <div class="confirm-modal">
        <div class="confirm-icon confirm-icon--danger"><i class="fas fa-trash"></i></div>
        <div class="confirm-title">Удалить доску?</div>
        <div class="confirm-text">Доска будет удалена вместе с колонками. Это действие необратимо.</div>
        <div class="confirm-actions">
          <button class="btn btn-ghost" :disabled="boardOpSubmitting" @click="showBoardDelete = false">Отмена</button>
          <button class="btn btn-danger" :disabled="boardOpSubmitting" @click="confirmBoardDelete">
            <i v-if="boardOpSubmitting" class="fas fa-spinner fa-spin"></i> Удалить
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Участники доски -->
  <Teleport to="body">
    <div v-if="showBoardMembers" class="confirm-backdrop" @mousedown.self="closeBoardMembers">
      <div class="board-modal" style="width:460px">
        <div class="result-modal-header">
          <span>Участники доски</span>
          <button class="td-icon-btn" @click="closeBoardMembers"><i class="fas fa-xmark"></i></button>
        </div>
        <div class="board-modal-body">
          <div class="board-field">
            <label>Исполнители</label>
            <div class="board-combo" @focusout="e => { if (!e.currentTarget.contains(e.relatedTarget)) membersExecOpen = false }">
              <div class="board-combo-box board-combo-box--multi">
                <span v-for="m in membersExecList" :key="m.id" class="fcombo-chip">
                  {{ m.name }}
                  <button type="button" class="fcombo-chip-x" @click.stop="removeMemberRole(m.id)"><i class="fas fa-xmark"></i></button>
                </span>
                <input class="board-combo-input" v-model="membersExecQuery" placeholder="Добавить исполнителя..." @focus="membersExecOpen = true" @input="membersExecOpen = true" />
              </div>
              <div v-if="membersExecOpen" class="board-combo-dd">
                <button v-for="u in membersExecFiltered" :key="u.id" type="button" class="board-combo-item" @mousedown.prevent @click="addMemberRole(u, 'co-executor')">
                  <div class="mini-avatar mini-avatar--sm" :style="{ background: avatarColor(u.initials).bg, color: avatarColor(u.initials).color }">{{ u.initials }}</div>
                  <span>{{ u.name }}</span>
                </button>
                <div v-if="!membersExecFiltered.length" class="fcombo-empty">Ничего не найдено</div>
              </div>
            </div>
          </div>
          <div class="board-field">
            <label>Наблюдатели</label>
            <div class="board-combo" @focusout="e => { if (!e.currentTarget.contains(e.relatedTarget)) membersObsOpen = false }">
              <div class="board-combo-box board-combo-box--multi">
                <span v-for="m in membersObsList" :key="m.id" class="fcombo-chip">
                  {{ m.name }}
                  <button type="button" class="fcombo-chip-x" @click.stop="removeMemberRole(m.id)"><i class="fas fa-xmark"></i></button>
                </span>
                <input class="board-combo-input" v-model="membersObsQuery" placeholder="Добавить наблюдателя..." @focus="membersObsOpen = true" @input="membersObsOpen = true" />
              </div>
              <div v-if="membersObsOpen" class="board-combo-dd">
                <button v-for="u in membersObsFiltered" :key="u.id" type="button" class="board-combo-item" @mousedown.prevent @click="addMemberRole(u, 'observer')">
                  <div class="mini-avatar mini-avatar--sm" :style="{ background: avatarColor(u.initials).bg, color: avatarColor(u.initials).color }">{{ u.initials }}</div>
                  <span>{{ u.name }}</span>
                </button>
                <div v-if="!membersObsFiltered.length" class="fcombo-empty">Ничего не найдено</div>
              </div>
            </div>
          </div>
        </div>
        <div class="board-modal-footer">
          <button class="btn btn-primary" @click="closeBoardMembers">Готово</button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Confirm: complete task -->
  <Teleport to="body">
    <div v-if="completeModal" class="confirm-backdrop" @click.self="completeModal = null">
      <div class="confirm-modal">
        <div class="confirm-icon confirm-icon--success"><i class="fas fa-circle-check"></i></div>
        <div class="confirm-title">Завершение задачи</div>
        <div v-if="completeModal.running.length" class="confirm-text">
          Сейчас задачу выполняют: <b>{{ completeModal.running.join(', ') }}</b>.<br>
          Вы можете завершить только своё выполнение.
        </div>
        <div v-else-if="completeModal.notStarted.length" class="confirm-text">
          Ещё не начали выполнение: <b>{{ completeModal.notStarted.join(', ') }}</b>.<br>
          Завершить задачу для себя или для всех?
        </div>
        <div v-else class="confirm-text">
          Все исполнители завершили выполнение. Вы уверены, что хотите завершить задачу?
        </div>
        <div class="confirm-actions">
          <button class="btn btn-ghost" :disabled="completing" @click="completeModal = null">Отмена</button>
          <button v-if="completeModal.hasMine" class="btn btn-primary" :disabled="completing" @click="finishMineFromModal">
            Завершить для себя
          </button>
          <button v-if="!completeModal.running.length" class="btn btn-success" :disabled="completing" @click="completeForAll">
            <i v-if="completing" class="fas fa-spinner fa-spin"></i>
            Завершить для всех
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Confirm: delete task -->
  <Teleport to="body">
    <div v-if="showDeleteConfirm" class="confirm-backdrop" @click.self="showDeleteConfirm = false">
      <div class="confirm-modal">
        <div class="confirm-icon confirm-icon--danger"><i class="fas fa-trash"></i></div>
        <div class="confirm-title">Удалить задачу?</div>
        <div class="confirm-text">Вы уверены, что хотите удалить задачу? Это действие необратимо.</div>
        <div class="confirm-actions">
          <button class="btn btn-ghost" :disabled="deleting" @click="showDeleteConfirm = false">Отмена</button>
          <button class="btn btn-danger" :disabled="deleting" @click="confirmDeleteTask">
            <i v-if="deleting" class="fas fa-spinner fa-spin"></i>
            <i v-else class="fas fa-trash"></i> Удалить
          </button>
        </div>
      </div>
    </div>

    <!-- Assignee -->
    <div v-if="tdDdAssignee" class="dd-menu bx-dd-menu" :style="tdDdStyle('assignee')" @click.stop>
      <input v-model="tdSearchAssignee" class="dd-search" placeholder="Поиск..." autofocus />
      <div class="dd-list">
        <button v-for="u in filteredTdUsers(tdSearchAssignee)" :key="u.id" class="dd-item"
          :class="{ active: viewTask?.rawUserRoles?.some(r => r.role==='responsible' && r.user_id===u.id) }"
          @click.stop="changeAssignee(u.id); tdDdAssignee=false">
          <div class="mini-avatar mini-avatar--sm" :style="{ background: avatarColor(u.initials).bg, color: avatarColor(u.initials).color }">{{ u.initials }}</div>
          <span>{{ u.name }}</span>
          <i v-if="viewTask?.rawUserRoles?.some(r => r.role==='responsible' && r.user_id===u.id)" class="fas fa-check check-mark"></i>
        </button>
      </div>
    </div>

    <!-- Coexecutors -->
    <div v-if="tdDdCoex" class="dd-menu bx-dd-menu" :style="tdDdStyle('coex')" @click.stop>
      <input v-model="tdSearchCoex" class="dd-search" placeholder="Поиск..." autofocus />
      <div class="dd-list">
        <button v-for="u in filteredTdUsers(tdSearchCoex)" :key="u.id" class="dd-item"
          :class="{ active: viewTask?.rawUserRoles?.some(r => r.role==='co-executor' && r.user_id===u.id) }"
          @click.stop="toggleCoexecutorInTask(u.id)">
          <div class="mini-avatar mini-avatar--sm" :style="{ background: avatarColor(u.initials).bg, color: avatarColor(u.initials).color }">{{ u.initials }}</div>
          <span>{{ u.name }}</span>
          <i v-if="viewTask?.rawUserRoles?.some(r => r.role==='co-executor' && r.user_id===u.id)" class="fas fa-check check-mark"></i>
        </button>
      </div>
    </div>

    <!-- Observers -->
    <div v-if="tdDdObs" class="dd-menu bx-dd-menu" :style="tdDdStyle('obs')" @click.stop>
      <input v-model="tdSearchObs" class="dd-search" placeholder="Поиск..." autofocus />
      <div class="dd-list">
        <button v-for="u in filteredTdUsers(tdSearchObs)" :key="u.id" class="dd-item"
          :class="{ active: viewTask?.rawUserRoles?.some(r => r.role==='observer' && r.user_id===u.id) }"
          @click.stop="toggleObserverInTask(u.id)">
          <div class="mini-avatar mini-avatar--sm" :style="{ background: avatarColor(u.initials).bg, color: avatarColor(u.initials).color }">{{ u.initials }}</div>
          <span>{{ u.name }}</span>
          <i v-if="viewTask?.rawUserRoles?.some(r => r.role==='observer' && r.user_id===u.id)" class="fas fa-check check-mark"></i>
        </button>
      </div>
    </div>

    <!-- Project -->
    <div v-if="tdDdProject" class="dd-menu bx-dd-menu" :style="tdDdStyle('project')" @click.stop>
      <input v-model="tdSearchProject" class="dd-search" placeholder="Поиск..." autofocus />
      <div class="dd-list">
        <button v-for="p in filteredTdProjects" :key="p.id" class="dd-item"
          :class="{ active: viewTask?.projectId === p.id }"
          @click.stop="viewTask.projectId = p.id; viewTask.project = p.name; saveTaskField('project'); tdDdProject=false">
          <span class="bx-proj-badge" :class="p.type === 'object' ? 'bx-proj-badge--obj' : 'bx-proj-badge--proj'">{{ p.type === 'object' ? 'Объект' : 'Проект' }}</span>
          <span>{{ p.name }}</span>
          <i v-if="viewTask?.projectId === p.id" class="fas fa-check check-mark"></i>
        </button>
      </div>
    </div>

    <!-- Checklist item — coexecutor popover -->
    <div v-if="tdClActiveItem && tdClActivePopover === 'coexecutor'" class="cl-pop cl-pop--people" :style="tdClPopStyle" @click.stop>
      <input v-model="tdClSearchUser" class="dd-search" placeholder="Поиск..." autofocus style="margin:6px 8px;display:block;width:calc(100% - 16px);box-sizing:border-box" />
      <div class="dd-list">
        <button v-for="u in filteredTdUsers(tdClSearchUser)" :key="u.id" class="dd-item"
          :class="{ active: viewTask?.subtasks?.find(s=>s.id===tdClActiveItem)?.coexecutors?.some(c=>c.id===u.id) }"
          @mousedown.prevent
          @click.stop="toggleTdClUserRole(viewTask.subtasks.find(s=>s.id===tdClActiveItem), u.id, 'co-executor')">
          <div class="mini-avatar mini-avatar--sm" :style="{ background: avatarColor(u.initials).bg, color: avatarColor(u.initials).color }">{{ u.initials }}</div>
          <span>{{ u.name }}</span>
          <i v-if="viewTask?.subtasks?.find(s=>s.id===tdClActiveItem)?.coexecutors?.some(c=>c.id===u.id)" class="fas fa-check check-mark"></i>
        </button>
      </div>
    </div>

    <!-- Checklist item — observer popover -->
    <div v-if="tdClActiveItem && tdClActivePopover === 'observer'" class="cl-pop cl-pop--people" :style="tdClPopStyle" @click.stop>
      <input v-model="tdClSearchUser" class="dd-search" placeholder="Поиск..." autofocus style="margin:6px 8px;display:block;width:calc(100% - 16px);box-sizing:border-box" />
      <div class="dd-list">
        <button v-for="u in filteredTdUsers(tdClSearchUser)" :key="u.id" class="dd-item"
          :class="{ active: viewTask?.subtasks?.find(s=>s.id===tdClActiveItem)?.observers?.some(c=>c.id===u.id) }"
          @mousedown.prevent
          @click.stop="toggleTdClUserRole(viewTask.subtasks.find(s=>s.id===tdClActiveItem), u.id, 'observer')">
          <div class="mini-avatar mini-avatar--sm" :style="{ background: avatarColor(u.initials).bg, color: avatarColor(u.initials).color }">{{ u.initials }}</div>
          <span>{{ u.name }}</span>
          <i v-if="viewTask?.subtasks?.find(s=>s.id===tdClActiveItem)?.observers?.some(c=>c.id===u.id)" class="fas fa-check check-mark"></i>
        </button>
      </div>
    </div>
  </Teleport>

</div>
</template>

<style scoped>
/* ── Page layout ──────────────────────────────────────────────────────────────── */
.page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}
.page-body {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
}

/* ── Sidebar ──────────────────────────────────────────────────────────────────── */
.tasks-sidebar {
  width: 224px;
  flex-shrink: 0;
  border-right: 1px solid var(--border-light);
  background: var(--bg-surface);
  padding: 14px 10px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sidebar-section-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--text-tertiary);
  padding: 0 8px;
  margin: 10px 0 4px;
}
.sidebar-section-label:first-child { margin-top: 2px; }
.sidebar-section-label--row { display: flex; align-items: center; justify-content: space-between; }
.sidebar-add-btn {
  border: none; background: none; cursor: pointer; color: var(--text-tertiary);
  width: 20px; height: 20px; border-radius: 5px; font-size: 11px;
  display: inline-flex; align-items: center; justify-content: center; transition: background 0.12s, color 0.12s;
}
.sidebar-add-btn:hover { background: var(--brand-light); color: var(--brand-primary); }

/* Модальное окно создания доски */
.board-modal {
  width: 460px; max-width: 94vw; display: flex; flex-direction: column;
  background: var(--bg-surface); border-radius: 14px; overflow: visible;
  box-shadow: 0 16px 48px rgba(15,23,42,0.24);
}
.board-modal-body { padding: 16px 18px; display: flex; flex-direction: column; gap: 14px; }
.board-field { display: flex; flex-direction: column; gap: 5px; }
.board-field label { font-size: 12px; font-weight: 600; color: var(--text-secondary); }
.board-input {
  height: 38px; padding: 0 12px; border: 1px solid var(--border-light); border-radius: 8px;
  font-size: 14px; outline: none; box-sizing: border-box;
}
.board-input:focus { border-color: var(--brand-primary); }
.board-combo { position: relative; }
.board-combo-box {
  display: flex; align-items: center; flex-wrap: wrap; gap: 4px; min-height: 38px;
  padding: 3px 8px; border: 1px solid var(--border-light); border-radius: 8px; background: var(--bg-surface);
}
.board-combo-box:focus-within { border-color: var(--brand-primary); }
.board-combo-input { flex: 1; min-width: 80px; border: none; outline: none; background: transparent; font-size: 14px; padding: 4px 2px; }
.board-combo-dd {
  position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 70;
  background: var(--bg-surface); border: 1px solid var(--border-light); border-radius: 8px;
  box-shadow: 0 6px 18px rgba(0,0,0,0.12); max-height: 240px; overflow-y: auto; padding: 4px;
}
.board-combo-item {
  display: flex; align-items: center; gap: 8px; width: 100%; text-align: left;
  border: none; background: none; cursor: pointer; padding: 7px 8px; border-radius: 6px;
  font-size: 13px; color: var(--text-primary);
}
.board-combo-item:hover { background: var(--bg-subtle); }
.board-modal-footer {
  display: flex; justify-content: flex-end; gap: 10px;
  padding: 12px 18px; border-top: 1px solid var(--border-light);
}
.board-modal .fcombo-chip {
  display: inline-flex; align-items: center; gap: 4px;
  background: var(--brand-light); color: var(--brand-primary);
  border-radius: 6px; padding: 2px 4px 2px 7px; font-size: 12px; font-weight: 600;
}
.board-modal .fcombo-chip-x { border: none; background: none; color: inherit; cursor: pointer; padding: 0; font-size: 10px; display: flex; }
.board-modal .fcombo-clear { border: none; background: none; color: var(--text-tertiary); cursor: pointer; font-size: 12px; padding: 0 2px; display: flex; align-items: center; }
.board-modal .fcombo-empty { padding: 10px 8px; font-size: 12px; color: var(--text-tertiary); text-align: center; }

/* Кнопка «Создать доску» */
.boards-create-btn {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  margin: 10px 12px 4px; padding: 8px; border: 1px dashed var(--border-light); border-radius: 8px;
  background: none; color: var(--brand-primary); font-size: 12px; font-weight: 600; cursor: pointer;
}
.boards-create-btn:hover { background: var(--brand-light); border-color: var(--brand-primary); }

/* Карточка доски: меню */
.board-card { position: relative; cursor: pointer; }
.board-card-menu-wrap { margin-left: auto; }
.board-card-dots {
  opacity: 0; border: none; background: none; cursor: pointer; color: var(--text-secondary);
  width: 26px; height: 26px; border-radius: 6px; font-size: 13px; transition: opacity 0.12s, background 0.12s;
}
.board-card:hover .board-card-dots { opacity: 1; }
.board-card-dots:hover { background: var(--bg-subtle); }
.board-menu {
  min-width: 190px; background: var(--bg-surface); border: 1px solid var(--border-light);
  border-radius: 10px; box-shadow: 0 8px 28px rgba(15,23,42,0.18); padding: 4px;
}

/* Kanban: счётчик, добавление задачи/колонки */
.kanban-col-count {
  min-width: 20px; text-align: center; padding: 1px 7px; border-radius: 10px;
  background: var(--bg-subtle); color: var(--text-secondary); font-size: 11px; font-weight: 700;
}
.kanban-add-task-btn {
  display: flex; align-items: center; gap: 6px; width: 100%;
  margin: 4px 0 8px; padding: 7px 8px; border: 1px dashed var(--border-light); border-radius: 8px;
  background: none; color: var(--text-secondary); font-size: 12px; font-weight: 600; cursor: pointer;
}
.kanban-add-task-btn:hover { background: var(--bg-surface); color: var(--brand-primary); border-color: var(--brand-primary); }
.kanban-add-task { margin: 4px 0 8px; }
.kanban-add-task-input {
  width: 100%; padding: 8px 10px; border: 1px solid var(--brand-primary); border-radius: 8px;
  font-size: 13px; outline: none; box-sizing: border-box;
}
.kanban-col--add { background: transparent; }
.kanban-add-col { display: flex; align-items: center; gap: 6px; }
.kanban-add-col-input {
  flex: 1; border: none; background: none; outline: none; font-size: 13px; font-weight: 600;
  color: var(--text-primary); padding: 2px 0;
}
.kanban-add-col-input::placeholder { color: var(--text-tertiary); font-weight: 500; }

.sidebar-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s;
}
.sidebar-btn:hover { background: var(--bg-subtle); color: var(--text-primary); }
.sidebar-btn.active { background: var(--brand-light); color: var(--brand-primary); font-weight: 600; }
.sidebar-btn i { width: 14px; text-align: center; font-size: 12px; }

.sidebar-proj-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s;
}
.sidebar-proj-btn:hover { background: var(--bg-subtle); color: var(--text-primary); }
.sidebar-proj-btn.active { background: var(--brand-light); color: var(--brand-primary); font-weight: 600; }
.sidebar-proj-btn i:first-child { width: 14px; text-align: center; font-size: 12px; opacity: .8; }

.boards-arrow {
  font-size: 9px;
  margin-left: auto;
  opacity: .5;
  transition: transform 0.2s;
  flex-shrink: 0;
}
.boards-arrow.open { transform: rotate(90deg); }

/* ── Secondary sidebar: boards ────────────────────────────────────────────────── */
.boards-sidebar {
  width: 200px;
  flex-shrink: 0;
  border-right: 1px solid var(--border-light);
  background: var(--bg-subtle);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.boards-sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 12px 10px;
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}
.boards-sidebar-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.boards-sidebar-close {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.15s;
  font-size: 11px;
}
.boards-sidebar-close:hover { background: var(--border-light); color: var(--text-primary); }

.boards-list {
  padding: 10px 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
  flex: 1;
}

.board-card {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 10px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  cursor: pointer;
  text-align: left;
  transition: all 0.15s;
  box-shadow: var(--shadow-sm);
}
.board-card:hover { border-color: var(--brand-primary); box-shadow: 0 0 0 2px var(--brand-light); }
.board-card.active {
  border-color: var(--brand-primary);
  background: var(--brand-light);
  box-shadow: 0 0 0 2px var(--brand-light);
}

.board-card-icon {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  background: var(--brand-light);
  color: var(--brand-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  flex-shrink: 0;
}
.board-card.active .board-card-icon {
  background: var(--brand-primary);
  color: #fff;
}

.board-card-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.3;
}
.board-card-meta {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-top: 1px;
}

/* collapsed toggle */
.boards-collapsed-btn {
  width: 28px;
  flex-shrink: 0;
  border: none;
  border-right: 1px solid var(--border-light);
  background: var(--bg-subtle);
  color: var(--text-tertiary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  transition: all 0.15s;
}
.boards-collapsed-btn:hover { background: var(--bg-surface); color: var(--brand-primary); }

/* slide transition */
.boards-slide-enter-active,
.boards-slide-leave-active { transition: width 0.22s ease, opacity 0.18s ease; overflow: hidden; }
.boards-slide-enter-from,
.boards-slide-leave-to { width: 0; opacity: 0; }

.sidebar-divider {
  height: 1px;
  background: var(--border-light);
  margin: 8px 4px;
}

/* ── Main content ─────────────────────────────────────────────────────────────── */
.main-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 24px 32px;
  gap: 16px;
  overflow: hidden;
}

.content-header {
  flex-shrink: 0;
  display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
}
.content-header-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.work-toggle {
  display: inline-flex; align-self: flex-start; width: fit-content; padding: 3px; gap: 2px;
  background: var(--bg-subtle); border-radius: 9px;
  margin: 12px 0 4px;
}
.work-toggle-btn {
  border: none; background: none; cursor: pointer;
  padding: 6px 12px; border-radius: 7px; font-size: 12px; font-weight: 600;
  color: var(--text-secondary); transition: background 0.12s, color 0.12s;
}
.work-toggle-btn:hover { color: var(--text-primary); }
.work-toggle-btn.active { background: var(--bg-surface); color: var(--brand-primary); box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.page-title { font-size: 24px; font-weight: 700; color: var(--text-primary); letter-spacing: -0.5px; }
.page-subtitle { font-size: 12px; color: var(--text-secondary); margin-top: 4px; }

/* ── Панель фильтров ──────────────────────────────────────────────────────────── */
.btn-ghost--active { border-color: var(--brand-primary); color: var(--brand-primary); }
.filter-count {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px;
  background: var(--brand-primary); color: #fff; font-size: 11px; font-weight: 700; margin-left: 2px;
}
.filters-panel {
  display: flex; flex-wrap: wrap; gap: 12px;
  padding: 14px 16px; margin: 12px 0 4px;
  background: var(--bg-surface); border: 1px solid var(--border-light); border-radius: 10px;
}
.filter-field { display: flex; flex-direction: column; gap: 4px; min-width: 150px; }
.filter-field--wide { flex: 1; min-width: 220px; }
.filter-field--reset { justify-content: flex-end; min-width: auto; }
.filter-field label { font-size: 11px; font-weight: 600; color: var(--text-secondary); }
.filter-field select,
.filter-field input[type="date"] {
  height: 34px; padding: 0 10px; border: 1px solid var(--border-light); border-radius: 8px;
  font-size: 13px; background: var(--bg-surface); color: var(--text-primary); outline: none; box-sizing: border-box;
}
.filter-field select:focus,
.filter-field input:focus { border-color: var(--brand-primary); }
.filter-search { position: relative; }
.filter-search i { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--text-tertiary); font-size: 12px; }
.filter-search input {
  width: 100%; height: 34px; padding: 0 10px 0 30px; border: 1px solid var(--border-light);
  border-radius: 8px; font-size: 13px; outline: none; box-sizing: border-box;
}
.filter-search input:focus { border-color: var(--brand-primary); }
.filters-slide-enter-active, .filters-slide-leave-active { transition: opacity 0.18s, transform 0.18s; }
.filters-slide-enter-from, .filters-slide-leave-to { opacity: 0; transform: translateY(-6px); }

/* ── Table ────────────────────────────────────────────────────────────────────── */
.table-wrapper {
  background: var(--bg-surface);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-light);
  box-shadow: var(--shadow-sm);
  overflow: auto;
}
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th {
  text-align: left;
  padding: 11px 16px;
  background: var(--bg-subtle);
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 2px solid var(--border-light);
  position: sticky;
  top: 0;
  z-index: 1;
  white-space: nowrap;
}
th, td {
  border-left: 1px solid var(--border-light);
  border-right: 1px solid var(--border-light);
}
th:first-child, td:first-child { border-left: none; }
th:last-child,  td:last-child  { border-right: none; }
td {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-light);
  vertical-align: middle;
}
tr:hover td { background: var(--bg-subtle); }

.task-name-cell { max-width: 360px; }
.task-name-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.task-name { font-weight: 500; color: var(--text-primary); line-height: 1.35; }
.empty-state { text-align: center; color: var(--text-secondary); font-size: 13px; padding: 40px 16px; }

/* ── Priority icon ────────────────────────────────────────────────────────────── */
.priority-icon {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  font-size: 13px;
  line-height: 1;
}

/* ── Deadline chip ────────────────────────────────────────────────────────────── */
.deadline-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  white-space: nowrap;
}
.deadline-chip i { font-size: 10px; opacity: .65; }
.deadline-chip--overdue { color: var(--danger-text); font-weight: 600; }
.deadline-chip--sm { font-size: 11px; }

/* ── Status label (list view) ─────────────────────────────────────────────────── */
.status-label {
  display: inline-block;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  background: var(--bg-subtle);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 500;
  border: 1px solid var(--border-light);
}
.status-label--none { opacity: .5; }

/* Значок связи в списке */
.conn-icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 20px; height: 20px; border-radius: 5px; margin-right: 2px;
  color: var(--brand-primary); background: var(--brand-light); font-size: 11px; cursor: pointer;
}
.conn-icon:hover { filter: brightness(0.95); }
.td-conn-link { color: var(--brand-primary); cursor: pointer; text-decoration: none; }
.td-conn-link:hover { text-decoration: underline; }
.conn-chip {
  display: inline-flex; align-items: center; gap: 5px; cursor: pointer;
  background: var(--brand-light); color: var(--brand-primary); max-width: 180px;
}
.conn-chip:hover { filter: brightness(0.96); box-shadow: 0 0 0 2px var(--brand-light); }
.conn-chip-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Кликабельные значения-фильтры в строке */
.user-chip--clickable, .chip--clickable, .status-badge--clickable { cursor: pointer; }
.user-chip--clickable:hover { background: var(--bg-subtle); border-radius: 6px; }
.chip--clickable:hover { filter: brightness(0.96); box-shadow: 0 0 0 2px var(--brand-light); }
.status-badge--clickable:hover { filter: brightness(0.95); }

/* Активный фильтр — подсветка выбранного значения в строке */
.is-filtered {
  outline: 2px solid var(--brand-primary, #3b82f6);
  outline-offset: 1px;
  border-radius: 6px;
}
.user-chip.is-filtered { background: var(--brand-light, #eff6ff); }
.chip.is-filtered { box-shadow: none; }
.chip-filter-x {
  display: inline-flex; align-items: center; justify-content: center;
  border: none; background: var(--brand-primary, #3b82f6); color: #fff;
  width: 15px; height: 15px; border-radius: 50%; cursor: pointer;
  font-size: 8px; margin-left: 4px; flex-shrink: 0; padding: 0;
}
.chip-filter-x:hover { background: #2563eb; }

/* Цветные статусы */
.status-badge { border: none; font-weight: 600; }
.status--waiting  { background: #fef3c7; color: #b45309; }
.status--progress { background: #dbeafe; color: #2563eb; }
.status--paused   { background: #fde68a; color: #92400e; }
.status--done     { background: #dcfce7; color: #16a34a; }

/* ── User chip ────────────────────────────────────────────────────────────────── */
.user-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-primary);
  white-space: nowrap;
}
.mini-avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  font-size: 9px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.mini-avatar--sm { width: 22px; height: 22px; font-size: 8px; }
.mini-avatar--xs { width: 16px; height: 16px; font-size: 7px; }

/* ── Chips ────────────────────────────────────────────────────────────────────── */
.tags-wrap { display: flex; flex-wrap: wrap; gap: 4px; }
.project-chip { background: #ede9fe; color: #6d28d9; border-color: #ddd6fe; }

/* ── Subtask mini bar ─────────────────────────────────────────────────────────── */
.subtask-mini {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 6px;
}
.subtask-bar-wrap {
  flex: 1;
  height: 4px;
  border-radius: 4px;
  background: var(--border-light);
  overflow: hidden;
}
.subtask-bar-fill {
  height: 100%;
  border-radius: 4px;
  background: var(--brand-primary);
  transition: width 0.3s;
}
.subtask-mini-label { font-size: 10px; color: var(--text-tertiary); white-space: nowrap; }

/* ─── KANBAN ──────────────────────────────────────────────────────────────────── */
.kanban-wrap {
  flex: 1;
  display: flex;
  gap: 14px;
  overflow: auto;
  align-items: stretch;
  padding-bottom: 16px;
  min-height: 0;
}

.kanban-col {
  flex: 0 0 280px;
  display: flex;
  flex-direction: column;
  min-height: 100%;
  transition: box-shadow 0.15s;
}
/* Колонка добавления не растягивается на всю высоту */
.kanban-col--add { align-self: flex-start; }
.kanban-col.drag-over .kanban-col-header {
  box-shadow: 0 0 0 2px var(--brand-primary);
}

.kanban-col-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  margin-bottom: 10px;
}
.kanban-col-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.kanban-col-grip { cursor: grab; color: var(--text-tertiary); font-size: 12px; display: flex; align-items: center; }
.kanban-col-grip:active { cursor: grabbing; }
.kanban-col-title { font-size: 13px; font-weight: 700; color: var(--text-primary); flex: 1; cursor: text; padding: 2px 4px; border-radius: 5px; }
.kanban-col-title:hover { background: var(--bg-subtle); }
.kanban-col-title-input {
  flex: 1; min-width: 0; font-size: 13px; font-weight: 700; color: var(--text-primary);
  border: 1px solid var(--brand-primary); border-radius: 6px; padding: 2px 6px; outline: none;
}
.kanban-col-dots {
  border: none; background: none; cursor: pointer; color: var(--text-secondary);
  width: 24px; height: 24px; border-radius: 6px; font-size: 13px; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
}
.kanban-col-dots:hover { background: var(--bg-subtle); color: var(--text-primary); }
.kanban-col.col-drag-over-before > .kanban-col-header { box-shadow: -3px 0 0 0 var(--brand-primary), var(--shadow-sm); }
.kanban-col.col-drag-over-after > .kanban-col-header { box-shadow: 3px 0 0 0 var(--brand-primary), var(--shadow-sm); }
.kcard-overdue { font-size: 11px; color: #ef4444; font-weight: 600; margin-top: 4px; display: flex; align-items: center; gap: 4px; }
.td-overdue-label { font-size: 11px; color: #ef4444; font-weight: 600; margin-top: 3px; display: flex; align-items: center; gap: 4px; }
.kanban-col-count {
  font-size: 11px;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: 10px;
}

.kanban-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
}

.kanban-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: 12px;
  cursor: grab;
  user-select: none;
  transition: box-shadow 0.15s, opacity 0.15s;
  box-shadow: var(--shadow-sm);
}
.kanban-card:hover { box-shadow: var(--shadow-md); }
.kanban-card.dragging { opacity: 0.4; cursor: grabbing; }

.kcard-priority { margin-bottom: 7px; }
.kcard-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.4;
  margin-bottom: 10px;
}

.kcard-subtasks-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 7px;
}
.kcard-subtask-list {
  list-style: none;
  margin: 0 0 10px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.kcard-subtask {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  cursor: pointer;
  padding: 3px 4px;
  border-radius: var(--radius-sm);
  transition: background 0.12s;
}
.kcard-subtask:hover { background: var(--bg-subtle); }

.kanban-card.dragging { opacity: 0.4; }
.kanban-placeholder {
  height: 4px; margin: 2px 0; border-radius: 3px;
  background: var(--brand-primary);
  box-shadow: 0 0 0 2px var(--brand-light);
}

/* Быстрые действия на карточке */
.kcard-actions { display: flex; align-items: center; gap: 4px; margin: 8px 0 6px; }
.kcard-act {
  position: relative; width: 28px; height: 28px; border-radius: 7px;
  border: 1px solid var(--border-light); background: var(--bg-surface); cursor: pointer;
  color: var(--text-secondary); font-size: 12px; display: inline-flex; align-items: center; justify-content: center;
  transition: background 0.12s, border-color 0.12s;
}
.kcard-act:hover { background: var(--bg-subtle); }
.kcard-act.active { border-color: var(--brand-primary); color: var(--brand-primary); background: var(--brand-light); }
.kcard-act-badge {
  position: absolute; top: -5px; right: -5px; min-width: 15px; height: 15px; padding: 0 3px;
  border-radius: 8px; background: var(--brand-primary); color: #fff; font-size: 9px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
}
.kcard-act-clear {
  position: absolute; top: -5px; right: -5px; width: 14px; height: 14px; border-radius: 50%;
  background: var(--danger-text, #ef4444); color: #fff; font-size: 8px;
  display: flex; align-items: center; justify-content: center;
}
.card-pop {
  min-width: 210px; max-width: 250px; background: var(--bg-surface);
  border: 1px solid var(--border-light); border-radius: 10px;
  box-shadow: 0 8px 28px rgba(15,23,42,0.18); padding: 4px;
}
.card-pop-search {
  width: 100%; height: 32px; padding: 0 10px; margin-bottom: 4px; box-sizing: border-box;
  border: 1px solid var(--border-light); border-radius: 7px; font-size: 13px; outline: none;
}
.card-pop-search:focus { border-color: var(--brand-primary); }
.card-pop-list { max-height: 240px; overflow-y: auto; }
.card-pop-item {
  display: flex; align-items: center; gap: 8px; width: 100%; text-align: left;
  border: none; background: none; cursor: pointer; padding: 7px 8px; border-radius: 7px;
  font-size: 13px; color: var(--text-primary);
}
.card-pop-item:hover { background: var(--bg-subtle); }
.card-pop-item.active { color: var(--brand-primary); font-weight: 600; }
.card-pop-check { margin-left: auto; font-size: 11px; }
.card-pop-none { color: var(--text-secondary); }

/* Отметка завершённой задачи на карточке */
.kanban-card { position: relative; }
.kcard-done-check {
  position: absolute; top: 8px; right: 8px;
  width: 20px; height: 20px; border-radius: 50%;
  background: #22c55e; color: #fff; font-size: 11px;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 1px 3px rgba(0,0,0,0.15);
}
.kcard-completed {
  display: flex; align-items: center; gap: 5px; margin-top: 6px;
  font-size: 11px; font-weight: 600; color: #16a34a;
}
.kanban-card--done .kcard-title,
.kanban-card--done .kcard-priority { padding-right: 24px; }

.kcard-coexec { display: flex; align-items: center; gap: 6px; margin: 6px 0; }
.kcard-coexec-icon { font-size: 11px; color: var(--text-tertiary); }
.kcard-avatars { display: flex; }
.kcard-avatar { border: 2px solid var(--bg-surface); }
.kcard-avatar + .kcard-avatar { margin-left: -8px; }
.kcard-avatar--more { background: var(--bg-subtle) !important; color: var(--text-secondary) !important; font-size: 9px; }
.kcard-subtask.done .subtask-text { text-decoration: line-through; color: var(--text-tertiary); }

.subtask-check {
  width: 15px;
  height: 15px;
  border-radius: 4px;
  border: 1.5px solid var(--border-hover);
  background: var(--bg-subtle);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 1px;
  transition: all 0.15s;
  color: transparent;
}
.kcard-subtask.done .subtask-check {
  background: var(--brand-primary);
  border-color: var(--brand-primary);
  color: #fff;
}
.subtask-check i { font-size: 8px; }
.subtask-text { font-size: 12px; color: var(--text-primary); line-height: 1.4; }

.kcard-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-light);
  gap: 8px;
}

.kanban-col-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 80px;
  border: 2px dashed var(--border-light);
  border-radius: var(--radius-md);
  color: var(--text-tertiary);
  font-size: 12px;
}
.kanban-col-empty i { font-size: 16px; }

/* ══ MODAL BACKDROP ══════════════════════════════════════════════════════════ */
.modal-backdrop {
  position: fixed; inset: 0;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center;
  z-index: 200; padding: 24px;
}
.dd-close-overlay {
  position: fixed; inset: 0; z-index: 9998;
}
.cal-close-overlay {
  position: fixed; inset: 0; z-index: 10000;
}

/* ══ BITRIX-STYLE MODAL ══════════════════════════════════════════════════════ */
.bx-modal {
  background: var(--bg-surface);
  border-radius: 16px;
  box-shadow: 0 24px 80px rgba(15, 23, 42, 0.22);
  width: 100%; max-width: 560px;
  max-height: 90vh; overflow: hidden;
  display: flex; flex-direction: column;
  position: relative;
}

/* Title row */
.bx-title-row {
  display: flex; align-items: center; gap: 8px;
  padding: 22px 22px 0;
}
.bx-title-input {
  flex: 1; border: none; outline: none; background: none;
  font-size: 22px; font-weight: 600; color: var(--text-primary);
  font-family: inherit; caret-color: var(--brand-primary);
}
.bx-title-input::placeholder { color: var(--text-tertiary); }

/* Description */
.bx-desc-row { padding: 8px 22px 14px; }
.bx-desc-input {
  width: 100%; border: none; outline: none; background: none; resize: none;
  font-size: 14px; color: var(--text-secondary); font-family: inherit;
  line-height: 1.5;
}
.bx-desc-input::placeholder { color: var(--text-tertiary); }

.bx-divider { height: 1px; background: var(--border-light); margin: 0; }

/* Icon button (priority, close) */
.bx-icon-btn {
  width: 32px; height: 32px; flex-shrink: 0;
  border: none; background: none; cursor: pointer;
  border-radius: var(--radius-sm); color: var(--text-tertiary);
  display: flex; align-items: center; justify-content: center;
  font-size: 15px; transition: all 0.15s;
}
.bx-icon-btn:hover { background: var(--bg-subtle); color: var(--text-primary); }
.bx-icon-btn.active { color: var(--brand-primary); }

/* Priority mini-dropdown */
.bx-priority-wrap { position: relative; }
.bx-mini-dd {
  position: absolute; right: 0; top: calc(100% + 4px); z-index: 300;
  background: var(--bg-surface); border: 1px solid var(--border-light);
  border-radius: var(--radius-md); box-shadow: var(--shadow-md);
  min-width: 160px; overflow: hidden;
}
.bx-mini-dd-item {
  width: 100%; display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; border: none; background: none; cursor: pointer;
  font-size: 13px; color: var(--text-primary); text-align: left;
  transition: background 0.12s;
}
.bx-mini-dd-item:hover { background: var(--bg-subtle); }
.bx-mini-dd-item.active { font-weight: 600; background: var(--brand-light); }

/* ── Field rows ──────────────────────────────────────────────────────────── */
.bx-fields { display: flex; flex-direction: column; }
.bx-field {
  display: flex; align-items: center; min-height: 44px;
  padding: 0 22px; border-bottom: 1px solid var(--border-light);
  gap: 0;
}
.bx-field:last-child { border-bottom: none; }
.bx-field-label {
  width: 130px; flex-shrink: 0;
  font-size: 13px; color: var(--text-tertiary);
}
.bx-field-value-wrap { flex: 1; position: relative; }
.bx-field-value {
  display: flex; align-items: center; gap: 7px;
  padding: 10px 0; width: 100%;
  border: none; background: none; cursor: pointer;
  font-size: 13px; color: var(--text-primary); text-align: left;
  transition: color 0.12s;
}
.bx-field-value:hover { color: var(--brand-primary); }
.bx-field-value--date { cursor: pointer; position: relative; }
.bx-field-empty { color: var(--text-tertiary); }
.bx-tags-wrap {
  display: flex; flex-wrap: wrap; align-items: center; gap: 5px;
  padding: 6px 0; min-height: 32px;
}
.bx-tag {
  display: inline-flex; align-items: center; gap: 4px;
  background: var(--brand-primary-12, rgba(99,102,241,0.10)); border: 1px solid var(--brand-primary-30, rgba(99,102,241,0.25));
  border-radius: 6px; padding: 2px 6px 2px 8px;
  font-size: 12px; color: var(--brand-primary);
  cursor: default; user-select: none;
  transition: background 0.12s, border-color 0.12s;
}
.bx-tag:hover { background: rgba(239,68,68,0.10); border-color: rgba(239,68,68,0.3); color: #ef4444; }
.bx-tag:hover .bx-tag-remove { color: #ef4444; opacity: 1; }
.bx-tag-remove {
  border: none; background: none; cursor: pointer; padding: 0;
  color: var(--brand-primary); font-size: 10px; line-height: 1;
  display: flex; align-items: center; opacity: 0.5;
  transition: opacity 0.12s;
}
.bx-tag-input {
  border: none; outline: none; background: none;
  font-size: 13px; color: var(--text-primary); font-family: inherit;
  min-width: 100px; flex: 1;
}
.bx-tag-input::placeholder { color: var(--text-tertiary); }
.bx-proj-badge {
  display: inline-block; font-size: 10px; font-weight: 600;
  padding: 1px 6px; border-radius: 4px; flex-shrink: 0;
  text-transform: uppercase; letter-spacing: 0.3px;
}
.bx-proj-badge--obj  { background: #dbeafe; color: #1d4ed8; }
.bx-proj-badge--proj { background: #dcfce7; color: #15803d; }
.bx-submit-error {
  font-size: 12px; color: #ef4444; flex: 1;
}
.tasks-loading {
  display: flex; align-items: center; gap: 10px;
  padding: 48px; justify-content: center;
  font-size: 14px; color: var(--text-tertiary);
}
.bx-tag-suggestions {
  position: absolute; top: calc(100% + 4px); left: 0; right: 0;
  background: var(--bg-surface); border: 1px solid var(--border-light);
  border-radius: var(--radius-md); box-shadow: var(--shadow-md);
  overflow: hidden; z-index: 9999;
}
.bx-tag-sug-item {
  display: block; width: 100%; text-align: left;
  padding: 7px 12px; border: none; background: none; cursor: pointer;
  font-size: 13px; color: var(--text-secondary); font-family: inherit;
  transition: background 0.1s;
}
.bx-tag-sug-item:hover { background: var(--bg-subtle); color: var(--brand-primary); }

.dd-avatars { display: flex; align-items: center; gap: 3px; }
.dd-more { font-size: 11px; color: var(--text-muted); margin-left: 2px; }

/* Shared dropdown menu */
.dd-menu {
  position: absolute; top: calc(100% + 2px); left: -12px; right: -12px; z-index: 300;
  background: var(--bg-surface); border: 1px solid var(--border-light);
  border-radius: var(--radius-md); box-shadow: var(--shadow-md); overflow: hidden;
}
.bx-dd-menu { min-width: 220px; }
.bx-dd-menu[style*="position: fixed"] { right: auto; left: auto; width: max-content; min-width: 220px; max-width: 320px; }
.dd-search {
  width: 100%; padding: 8px 12px; border: none; border-bottom: 1px solid var(--border-light);
  background: var(--bg-subtle); font-size: 13px; outline: none; color: var(--text-primary);
  box-sizing: border-box;
}
.dd-list { max-height: 200px; overflow-y: auto; }
.dd-item {
  width: 100%; display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; background: none; border: none; cursor: pointer;
  font-size: 13px; color: var(--text-primary); text-align: left; transition: background 0.12s;
}
.dd-item:hover { background: var(--bg-subtle); }
.dd-item.active { background: var(--brand-light); }
.check-mark { margin-left: auto; color: var(--brand-primary); font-size: 11px; }

/* ── Attach bar ──────────────────────────────────────────────────────────── */
.bx-attach-bar {
  display: flex; gap: 8px; padding: 12px 22px;
}
.bx-attach-pill {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 14px; border-radius: 20px;
  border: 1.5px solid var(--border-light);
  background: var(--bg-surface); color: var(--text-secondary);
  font-size: 13px; cursor: pointer; transition: all 0.15s;
  position: relative;
}
.bx-attach-pill:hover { border-color: var(--brand-primary); color: var(--brand-primary); }
.bx-attach-pill.active { border-color: var(--brand-primary); background: var(--brand-light); color: var(--brand-primary); }
.bx-pill-badge {
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--brand-primary); color: #fff;
  font-size: 10px; font-weight: 700; width: 16px; height: 16px; border-radius: 50%;
}

/* ── File list ───────────────────────────────────────────────────────────── */
.file-list { display: flex; flex-direction: column; gap: 4px; }
.file-item {
  display: flex; align-items: center; gap: 8px;
  padding: 5px 10px; border: 1px solid var(--border-light);
  border-radius: var(--radius-sm); background: var(--bg-subtle);
  font-size: 12px; color: var(--text-primary);
}
.file-item i:first-child { color: var(--text-tertiary); }
.file-item span { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.file-remove {
  width: 20px; height: 20px; border: none; border-radius: 4px;
  background: transparent; color: var(--text-tertiary);
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  font-size: 11px; transition: all 0.12s; flex-shrink: 0;
}
.file-remove:hover { background: #fef2f2; color: #ef4444; }

/* ── Footer ──────────────────────────────────────────────────────────────── */
.bx-footer {
  display: flex; align-items: center; gap: 16px;
  padding: 16px 22px 20px;
}
.bx-cancel-btn {
  border: none; background: none; cursor: pointer;
  font-size: 14px; color: var(--text-secondary); font-family: inherit;
  transition: color 0.12s;
}
.bx-cancel-btn:hover { color: var(--text-primary); }

/* ══ CHECKLIST PANEL (slides up inside bx-modal) ════════════════════════════ */
.cl-panel {
  position: absolute; bottom: 0; left: 0; right: 0;
  height: 92%;
  background: var(--bg-surface);
  border-radius: 14px 14px 16px 16px;
  box-shadow: 0 -8px 32px rgba(15,23,42,0.14);
  border-top: 1px solid var(--border-light);
  display: flex; flex-direction: column;
  z-index: 10;
  overflow: hidden;
}

/* Slide-up animation */
.cl-slide-enter-active { transition: transform 0.28s cubic-bezier(0.32, 0.72, 0, 1); }
.cl-slide-leave-active { transition: transform 0.2s ease-in; }
.cl-slide-enter-from, .cl-slide-leave-to { transform: translateY(100%); }

/* Card header */
.cl-card-header {
  display: flex; align-items: center; gap: 8px;
  padding: 14px 18px 8px; flex-shrink: 0;
}
.cl-card-title { font-size: 15px; font-weight: 600; color: var(--text-primary); }
.cl-card-progress { font-size: 12px; color: var(--text-muted); }
.cl-card-header-actions { display: flex; align-items: center; gap: 2px; margin-left: auto; }

/* Progress bar */
.cl-progress-bar {
  height: 3px; background: var(--bg-subtle); margin: 0 18px 2px;
  border-radius: 2px; overflow: hidden; flex-shrink: 0;
}
.cl-progress-fill {
  height: 100%; background: var(--brand-primary);
  border-radius: 2px; transition: width 0.3s ease;
}

/* Items list */
.cl-items-list {
  flex: 1; overflow-y: auto;
  border-top: 1px solid var(--border-light);
  padding-top: 18px;
}

/* Each item row */
.cl-row {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 10px 18px;
  border-bottom: 1px solid var(--border-light);
  position: relative;
}

/* Toolbar: at top-right, offset into row so it clears the header */
.cl-row-toolbar {
  position: absolute; top: -14px; right: 14px;
  display: flex; align-items: center;
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: 10px; padding: 2px 4px;
  box-shadow: 0 4px 16px rgba(15,23,42,0.10);
  z-index: 20;
}

.cl-checkbox {
  width: 16px; height: 16px; flex-shrink: 0; cursor: pointer;
  accent-color: var(--brand-primary); margin-top: 2px;
}
.cl-row-text {
  flex: 1; font-size: 14px; color: var(--text-primary);
  line-height: 1.5; cursor: text;
  word-break: break-word; white-space: pre-wrap;
  min-width: 0;
}
.cl-row-text.done { text-decoration: line-through; color: var(--text-tertiary); }
.cl-row-edit-input {
  flex: 1; border: none; outline: none; background: none;
  font-size: 14px; color: var(--text-primary); font-family: inherit;
  line-height: 1.5; min-width: 0; padding: 0;
  word-break: break-word; resize: none; overflow: hidden;
  white-space: pre-wrap;
}
.cl-prio-dot { font-size: 11px; flex-shrink: 0; margin-top: 3px; }

.cl-tool-btn {
  width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  border: none; background: none; cursor: pointer;
  border-radius: 6px; font-size: 12px;
  color: var(--text-tertiary); transition: color 0.12s; position: relative;
}
.cl-tool-btn:hover { color: var(--text-primary); }
.cl-tool-btn.active { color: var(--brand-primary); }
.cl-tool-btn--danger:hover { color: #ef4444; }
.cl-tool-sep {
  width: 1px; height: 16px; background: var(--border-light);
  margin: 0 2px; flex-shrink: 0;
}

/* Add button */
.cl-add-btn {
  display: flex; align-items: center; gap: 10px;
  width: 100%; padding: 10px 18px;
  border: none; background: none; cursor: pointer;
  font-size: 14px; color: var(--text-tertiary); font-family: inherit;
  text-align: left;
}
.cl-add-btn:hover { color: var(--brand-primary); }
.cl-add-icon { font-size: 11px; width: 16px; text-align: center; flex-shrink: 0; }

/* Footer */
.cl-card-footer {
  display: flex; align-items: center; justify-content: flex-end;
  padding: 12px 18px; border-top: 1px solid var(--border-light); flex-shrink: 0;
}

/* CL Teleported popovers */
.cl-action-badge {
  position: absolute; top: -3px; right: -3px;
  background: var(--brand-primary); color: #fff;
  font-size: 9px; font-weight: 700; padding: 0 3px; border-radius: 6px;
  min-width: 14px; text-align: center;
}
.cl-pop {
  background: var(--bg-surface); border: 1px solid var(--border-light);
  border-radius: var(--radius-md); box-shadow: 0 8px 30px rgba(15,23,42,0.15);
  overflow: hidden;
}
.cl-pop--priority { min-width: 158px; }
.cl-pop--people   { min-width: 200px; }
.cl-priority-item {
  width: 100%; display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; background: none; border: none; cursor: pointer;
  font-size: 13px; color: var(--text-primary); text-align: left; transition: background 0.12s;
}
.cl-priority-item:hover { background: var(--bg-subtle); }
.cl-priority-item.active { font-weight: 600; }

/* ══ CALENDAR DROPDOWN ══════════════════════════════════════════════════════ */
.cal-dropdown {
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: 16px;
  box-shadow: 0 12px 48px rgba(15,23,42,0.18);
  display: flex;
  overflow: hidden;
  min-width: 500px;
}
.cal-left {
  flex: 1; padding: 16px 16px 12px; min-width: 0;
  display: flex; flex-direction: column; gap: 10px;
}
.cal-right {
  width: 196px; flex-shrink: 0;
  border-left: 1px solid var(--border-light);
  padding: 12px 10px;
  display: flex; flex-direction: column; gap: 2px;
}
.cal-header {
  display: flex; align-items: center; justify-content: space-between;
}
.cal-nav {
  width: 30px; height: 30px; border: none; background: none; cursor: pointer;
  border-radius: 8px; color: var(--text-secondary); font-size: 12px;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.12s;
}
.cal-nav:hover { background: var(--bg-subtle); color: var(--text-primary); }
.cal-month-label { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.cal-dow-row {
  display: grid; grid-template-columns: repeat(7, 1fr); gap: 0;
}
.cal-dow {
  text-align: center; font-size: 11px; font-weight: 500;
  color: var(--text-tertiary); padding: 4px 0;
}
.cal-grid {
  display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px;
}
.cal-day {
  aspect-ratio: 1; display: flex; align-items: center; justify-content: center;
  border: none; background: none; cursor: pointer;
  border-radius: 50%; font-size: 13px; color: var(--text-primary);
  transition: background 0.1s;
}
.cal-day:hover:not(.cal-day--sel) { background: var(--bg-subtle); }
.cal-day--out { color: var(--text-tertiary); }
.cal-day--today { font-weight: 700; color: var(--brand-primary); }
.cal-day--sel { background: var(--brand-primary) !important; color: #fff !important; font-weight: 600; }
.cal-day--we:not(.cal-day--out):not(.cal-day--sel) { color: #ef4444; }
.cal-time-row {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 2px; cursor: pointer; border-top: 1px solid var(--border-light);
  font-size: 13px; color: var(--text-secondary);
  transition: color 0.12s;
}
.cal-time-row:hover { color: var(--brand-primary); }

/* Time picker */
.cal-time-pickers {
  display: flex; gap: 0; flex: 1;
}
.cal-picker-col { flex: 1; display: flex; flex-direction: column; gap: 6px; }
.cal-picker-label {
  font-size: 11px; font-weight: 600; color: var(--text-tertiary);
  text-transform: uppercase; letter-spacing: 0.5px;
}
.cal-picker-divider {
  width: 1px; background: var(--border-light); margin: 0 10px;
}
.cal-hours-grid {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 3px;
}
.cal-mins-grid {
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 3px;
}
.cal-time-btn {
  padding: 5px 2px; border: none; background: none; cursor: pointer;
  border-radius: 6px; font-size: 13px; color: var(--text-secondary);
  text-align: center; transition: background 0.1s;
}
.cal-time-btn:hover { background: var(--bg-subtle); color: var(--text-primary); }
.cal-time-btn--sel { background: var(--brand-primary) !important; color: #fff !important; font-weight: 600; }
.cal-apply-btn {
  margin-top: 10px; padding: 8px; border: none;
  background: var(--brand-primary); color: #fff;
  border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer;
  width: 100%;
}

/* Quick dates */
.cal-quick-title {
  font-size: 10px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.5px; color: var(--text-tertiary);
  padding: 0 4px 8px;
}
.cal-quick-btn {
  width: 100%; display: flex; flex-direction: column; align-items: flex-start; gap: 1px;
  padding: 8px 10px; border: none; background: none; cursor: pointer;
  border-radius: 8px; transition: background 0.1s; text-align: left;
}
.cal-quick-btn:hover { background: var(--bg-subtle); }
.cal-quick-label { font-size: 13px; color: var(--text-primary); font-weight: 500; }
.cal-quick-sub   { font-size: 11px; color: var(--text-tertiary); }
/* ── Task row clickable ──────────────────────────────────────────────────────── */
.task-row { cursor: pointer; transition: background 0.12s; }
.task-row:hover td { background: var(--bg-subtle); }

/* ══ TASK DETAIL MODAL ══════════════════════════════════════════════════════ */
.td-backdrop {
  position: fixed; inset: 0; z-index: 400;
  background: rgba(15,23,42,0.45);
  backdrop-filter: blur(6px);
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
}
.td-fade-enter-active { transition: opacity 0.22s ease; }
.td-fade-leave-active { transition: opacity 0.2s ease; }
.td-fade-enter-from, .td-fade-leave-to { opacity: 0; }
.td-fade-enter-active .td-modal { transition: transform 0.3s cubic-bezier(.16,1,.3,1), opacity 0.3s ease; }
.td-fade-leave-active .td-modal { transition: transform 0.2s ease, opacity 0.2s ease; }
.td-fade-enter-from .td-modal, .td-fade-leave-to .td-modal { transform: translateY(28px) scale(0.97); opacity: 0; }

.td-modal {
  background: var(--bg-surface);
  border-radius: 16px;
  box-shadow: 0 24px 80px rgba(15,23,42,0.22);
  width: 100%; max-width: 960px;
  height: 88vh;
  display: flex; flex-direction: row;
  overflow: hidden;
}

/* ── Left panel ── */
.td-left {
  width: 420px; flex-shrink: 0;
  display: flex; flex-direction: column;
  border-right: 1px solid var(--border-light);
  position: relative;
  overflow: visible;
}
.td-title-row {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 18px 20px 14px; border-bottom: 1px solid var(--border-light); flex-shrink: 0;
}
.td-title {
  flex: 1; font-size: 16px; font-weight: 600; color: var(--text-primary); line-height: 1.4;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
  overflow: hidden; text-overflow: ellipsis; word-break: break-word;
}
.td-title-actions { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
.td-icon-btn {
  width: 28px; height: 28px; border: none; background: none; cursor: pointer;
  border-radius: 6px; color: var(--text-tertiary); font-size: 13px;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.12s, color 0.12s;
}
.td-icon-btn:hover { background: var(--bg-subtle); color: var(--text-primary); }
.td-icon-btn--close:hover { color: #ef4444; }

.td-body { flex: 1; overflow-y: auto; }

.td-section { padding: 16px 20px; border-bottom: 1px solid var(--border-light); }
.td-section--desc {}
.td-description {
  font-size: 13px; color: var(--text-secondary); line-height: 1.6; white-space: pre-wrap;
}
.td-section--meta { display: flex; flex-direction: column; }
.td-meta-row {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 7px 0; border-bottom: 1px solid var(--border-light); min-height: 34px;
}
.td-meta-row:last-child { border-bottom: none; }
.td-meta-label {
  width: 130px; flex-shrink: 0; font-size: 12px; color: var(--text-tertiary);
  font-weight: 500; display: flex; align-items: center; gap: 6px; padding-top: 2px;
}
.td-meta-val {
  flex: 1; display: flex; align-items: center; gap: 6px;
  font-size: 13px; color: var(--text-primary);
}
.td-meta-val--wrap { flex-wrap: wrap; }
.td-user-chip { display: flex; align-items: center; gap: 5px; font-size: 13px; background: var(--bg-subtle); border-radius: 20px; padding: 2px 6px 2px 3px; }
.td-empty { color: var(--text-tertiary); font-size: 13px; }
.td-overdue { color: #ef4444; font-weight: 600; }

.td-section--checklist { display: flex; flex-direction: column; gap: 8px; }
.td-cl-header { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; }
.td-cl-progress { color: var(--text-tertiary); font-weight: 400; font-size: 12px; }
.td-cl-bar { height: 4px; background: var(--bg-subtle); border-radius: 2px; overflow: hidden; }
.td-cl-fill { height: 100%; background: var(--brand-primary); border-radius: 2px; transition: width 0.3s; }
.td-cl-item { display: flex; align-items: flex-start; gap: 10px; padding: 4px 0; position: relative; }
.td-cl-text { font-size: 13px; color: var(--text-primary); line-height: 1.5; }
.td-cl-text.done { text-decoration: line-through; color: var(--text-tertiary); }
.td-cl-text--done { text-decoration: line-through; color: var(--text-tertiary); }

.td-footer {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 20px; border-top: 1px solid var(--border-light); flex-shrink: 0;
}
.btn-success {
  background: #22c55e; color: #fff; border: none;
  padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 500;
  cursor: pointer; display: flex; align-items: center; gap: 6px; transition: background 0.12s;
}
.btn-success:hover { background: #16a34a; }
.td-completed-badge {
  display: flex; align-items: center; gap: 6px;
  color: #16a34a; font-size: 13px; font-weight: 600;
}
.td-completed-badge i { font-size: 15px; }

/* Результат работы */
.td-section--result { display: flex; flex-direction: column; gap: 8px; }
.td-result-add { align-self: flex-start; }

/* Список результатов */
.res-item { border: 1px solid var(--border-light); border-radius: 10px; overflow: hidden; background: var(--bg-surface); }
.res-item-head {
  display: flex; align-items: center; gap: 10px; width: 100%;
  padding: 10px 12px; border: none; background: none; cursor: pointer; text-align: left;
}
.res-item-head:hover { background: var(--bg-subtle); }
.res-item-meta { flex: 1; display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.res-item-title { font-size: 13px; font-weight: 600; color: var(--text-primary); }
.res-item-date { font-size: 11px; color: var(--text-tertiary); }
.res-item-files-count { font-size: 11px; color: var(--text-secondary); display: inline-flex; align-items: center; gap: 3px; }
.res-item-caret { color: var(--text-tertiary); font-size: 12px; }

/* Панель просмотра результата */
.result-view-head { display: flex; align-items: center; gap: 10px; min-width: 0; }
.result-view-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 14px 18px; }
.result-view-files { margin-top: 16px; border-top: 1px solid var(--border-light); padding-top: 12px; display: flex; flex-direction: column; gap: 6px; }
.res-files-label { font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 2px; }

/* Отрисовка контента результата (те же блоки, что в редакторе) */
.res-content { font-size: 14px; line-height: 1.6; color: var(--text-primary); word-break: break-word; }
.res-content :deep(ul), .res-content :deep(ol) { margin: 6px 0; padding-left: 22px; }
.res-content :deep(.res-code) {
  margin: 12px 0; padding: 12px 14px; background: #1e293b; color: #e2e8f0;
  border-left: 3px solid #6366f1; border-radius: 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px; line-height: 1.5; white-space: pre-wrap; word-break: break-word;
}
.res-content :deep(.res-quote) {
  margin: 12px 0; padding: 8px 14px; border-left: 3px solid var(--brand-primary);
  background: var(--bg-subtle); color: var(--text-secondary); border-radius: 0 8px 8px 0; font-style: italic;
}
.res-content :deep(.res-spoiler) {
  margin: 12px 0; border: 1px solid var(--border-light); border-radius: 8px; overflow: hidden; background: var(--bg-surface);
}
.res-content :deep(.res-spoiler > summary) {
  cursor: pointer; padding: 9px 12px; font-weight: 600; font-size: 13px;
  color: var(--brand-primary); background: var(--brand-light); list-style: none; user-select: none;
}
.res-content :deep(.res-spoiler > summary::-webkit-details-marker) { display: none; }
.res-content :deep(.res-spoiler > summary::before) { content: '\25B8'; margin-right: 8px; display: inline-block; transition: transform 0.15s; }
.res-content :deep(.res-spoiler[open] > summary::before) { transform: rotate(90deg); }
.res-content :deep(.res-spoiler-body) { padding: 10px 12px; }
/* Запасные правила: та же отрисовка для блоков без классов */
.res-content :deep(pre) {
  margin: 12px 0; padding: 12px 14px; background: #1e293b; color: #e2e8f0;
  border-left: 3px solid #6366f1; border-radius: 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px; line-height: 1.5; white-space: pre-wrap; word-break: break-word;
}
.res-content :deep(blockquote) {
  margin: 12px 0; padding: 8px 14px; border-left: 3px solid var(--brand-primary);
  background: var(--bg-subtle); color: var(--text-secondary); border-radius: 0 8px 8px 0; font-style: italic;
}
.res-content :deep(code) {
  background: var(--bg-subtle); border-radius: 4px; padding: 1px 5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px;
}
.res-content :deep(pre code) { background: none; padding: 0; }
.res-content :deep(a) { color: var(--brand-primary); text-decoration: underline; }
.res-content :deep(p) { margin: 6px 0; }
.res-content :deep(:first-child) { margin-top: 0; }
.res-content :deep(:last-child) { margin-bottom: 0; }
.result-panel {
  position: absolute; left: 0; right: 0; bottom: 0; top: 70px; z-index: 30;
  display: flex; flex-direction: column;
  background: var(--bg-surface, #fff);
  border-top: 1px solid var(--border-light);
  border-radius: 16px 16px 0 0;
  box-shadow: 0 -12px 32px rgba(15,23,42,0.16);
}
.result-slide-enter-active { transition: transform 0.32s cubic-bezier(.16,1,.3,1), opacity 0.32s ease; }
.result-slide-leave-active { transition: transform 0.24s ease, opacity 0.24s ease; }
.result-slide-enter-from, .result-slide-leave-to { transform: translateY(100%); opacity: 0.4; }
.result-modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px; border-bottom: 1px solid var(--border-light);
  font-size: 15px; font-weight: 700; color: var(--text-primary);
}
.result-editor {
  flex: 1; min-height: 0; overflow-y: auto;
  padding: 14px 18px; font-size: 14px; line-height: 1.6; color: var(--text-primary);
  outline: none;
}
.result-editor:empty::before {
  content: attr(data-ph); color: var(--text-tertiary);
}
.result-editor ul, .result-editor ol { margin: 6px 0; padding-left: 22px; }

/* Блок кода */
.result-editor :deep(.res-code) {
  margin: 12px 0; padding: 12px 14px; background: #1e293b; color: #e2e8f0;
  border-left: 3px solid #6366f1; border-radius: 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px; line-height: 1.5; white-space: pre-wrap; word-break: break-word;
}
/* Цитата */
.result-editor :deep(.res-quote) {
  margin: 12px 0; padding: 8px 14px; border-left: 3px solid var(--brand-primary);
  background: var(--bg-subtle); color: var(--text-secondary);
  border-radius: 0 8px 8px 0; font-style: italic;
}
/* Спойлер */
.result-editor :deep(.res-spoiler) {
  margin: 12px 0; border: 1px solid var(--border-light); border-radius: 8px;
  overflow: hidden; background: var(--bg-surface);
}
.result-editor :deep(.res-spoiler > summary) {
  cursor: pointer; padding: 9px 12px; font-weight: 600; font-size: 13px;
  color: var(--brand-primary); background: var(--brand-light);
  list-style: none; user-select: none; outline: none;
}
.result-editor :deep(.res-spoiler > summary::-webkit-details-marker) { display: none; }
.result-editor :deep(.res-spoiler > summary::before) {
  content: '\25B8'; margin-right: 8px; display: inline-block; transition: transform 0.15s;
}
.result-editor :deep(.res-spoiler[open] > summary::before) { transform: rotate(90deg); }
.result-editor :deep(.res-spoiler-body) { padding: 10px 12px; }
.result-files {
  display: flex; flex-direction: column; gap: 4px; padding: 6px 18px;
  border-top: 1px solid var(--border-light);
}
.result-file { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-secondary); }
.result-file-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.result-toolbar {
  display: flex; align-items: center; gap: 4px;
  padding: 10px 18px; border-top: 1px solid var(--border-light);
}
.res-tool {
  width: 34px; height: 34px; border-radius: 8px; border: none; background: none;
  color: var(--text-secondary); cursor: pointer; font-size: 15px;
  display: inline-flex; align-items: center; justify-content: center; transition: background 0.12s;
}
.res-tool:hover { background: var(--bg-subtle); color: var(--brand-primary); }
.result-send { margin-left: auto; }

.btn-ghost {
  background: none; color: var(--text-secondary); border: 1px solid var(--border-light);
  padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 500;
  cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: background 0.12s;
}
.btn-ghost:hover { background: var(--bg-subtle); }
.btn-danger {
  background: #ef4444; color: #fff; border: none;
  padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 500;
  cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: background 0.12s;
}
.btn-danger:hover { background: #dc2626; }
.btn-ghost:disabled, .btn-danger:disabled { opacity: 0.6; cursor: default; }
.btn-warning {
  background: #f59e0b; color: #fff; border: none;
  padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 500;
  cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: background 0.12s;
}
.btn-warning:hover { background: #d97706; }
.btn-warning:disabled, .btn-success:disabled, .btn-primary:disabled { opacity: 0.6; cursor: default; }

/* Выполнение (таймеры) */
.td-section--exec { display: flex; flex-direction: column; gap: 8px; }
.td-exec-row { display: flex; align-items: center; gap: 8px; }
.td-exec-name { font-size: 13px; color: var(--text-primary); flex: 1; }
.td-exec-timer {
  position: relative; display: inline-flex; align-items: center; gap: 6px;
  font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums;
  padding: 3px 8px; border-radius: 6px; cursor: default;
}
.td-exec-timer.acc--running { background: #dcfce7; color: #16a34a; }
.td-exec-timer.acc--paused  { background: #fef3c7; color: #b45309; }
.td-exec-timer.acc--done    { background: var(--bg-subtle); color: var(--text-secondary); }
.td-exec-tip {
  position: absolute; bottom: calc(100% + 6px); right: 0;
  background: #1e293b; color: #fff; border-radius: 8px; padding: 8px 10px;
  font-size: 11px; font-weight: 400; white-space: nowrap; line-height: 1.5;
  display: none; flex-direction: column; gap: 2px; z-index: 20;
  box-shadow: 0 6px 18px rgba(0,0,0,0.25);
}
.td-exec-tip-row { color: #fff; }
.td-exec-timer:hover .td-exec-tip { display: flex; }

.confirm-backdrop {
  position: fixed; inset: 0; z-index: 10000;
  background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center;
}
.confirm-modal {
  width: 380px; max-width: 90vw; background: var(--bg-surface, #fff);
  border-radius: 14px; padding: 24px; box-shadow: 0 12px 40px rgba(0,0,0,0.2);
  display: flex; flex-direction: column; align-items: center; text-align: center; gap: 10px;
}
.confirm-icon {
  width: 52px; height: 52px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center; font-size: 22px;
}
.confirm-icon--success { background: #dcfce7; color: #16a34a; }
.confirm-icon--danger { background: #fee2e2; color: #ef4444; }
.confirm-title { font-size: 17px; font-weight: 700; color: var(--text-primary, #1e293b); }
.confirm-text { font-size: 13px; color: var(--text-secondary, #64748b); line-height: 1.5; }
.confirm-actions { display: flex; gap: 10px; margin-top: 12px; width: 100%; }
.confirm-actions .btn, .confirm-actions .btn-ghost, .confirm-actions .btn-danger { flex: 1; justify-content: center; }

.td-menu-wrap { margin-left: auto; position: relative; }
.td-dots-btn {
  width: 32px; height: 32px; border-radius: 8px;
  border: 1px solid var(--border-light); background: none; cursor: pointer;
  color: var(--text-secondary); font-size: 14px;
  display: flex; align-items: center; justify-content: center; transition: background 0.12s;
}
.td-dots-btn:hover { background: var(--bg-subtle); }
.td-dot-menu {
  position: absolute; bottom: calc(100% + 6px); right: 0;
  background: var(--bg-surface); border: 1px solid var(--border-light);
  border-radius: 10px; box-shadow: 0 8px 30px rgba(15,23,42,0.14);
  overflow: hidden; min-width: 180px; z-index: 10;
}
.td-menu-enter-active { transition: opacity 0.15s, transform 0.15s; }
.td-menu-leave-active { transition: opacity 0.1s, transform 0.1s; }
.td-menu-enter-from, .td-menu-leave-to { opacity: 0; transform: translateY(6px); }
.td-dot-item {
  width: 100%; display: flex; align-items: center; gap: 8px;
  padding: 10px 14px; border: none; background: none; cursor: pointer;
  font-size: 13px; color: var(--text-primary); text-align: left;
  font-family: inherit; transition: background 0.1s;
}
.td-dot-item:hover { background: var(--bg-subtle); }
.td-dot-item--danger { color: #ef4444; }
.td-dot-item--danger:hover { background: #fef2f2; }

/* ── Right panel — chat ── */
.td-right {
  flex: 1; display: flex; flex-direction: column; min-width: 0;
  background: var(--bg-subtle);
}
.td-chat-header {
  display: flex; align-items: center; gap: 10px;
  padding: 18px 20px 14px; border-bottom: 1px solid var(--border-light);
  background: var(--bg-surface); flex-shrink: 0;
}
.td-chat-title { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.td-chat-close { margin-left: auto; }

.td-chat-messages {
  flex: 1; overflow-y: auto; padding: 12px 16px 8px;
  display: flex; flex-direction: column; gap: 2px;
}
.td-chat-empty {
  flex: 1; display: flex; align-items: center; justify-content: center;
  color: var(--text-tertiary); font-size: 13px; text-align: center; padding: 40px;
}
.td-chat-date-sep {
  text-align: center; font-size: 11px; color: var(--text-tertiary);
  margin: 10px 0 6px; position: relative;
}
/* Логи задачи в ленте чата */
.td-log {
  display: flex; align-items: center; gap: 8px; align-self: center;
  max-width: 92%; margin: 6px 0; padding: 6px 14px;
  background: #fff7ed; border: 1px solid #fdba74;
  border-radius: 999px; font-size: 11.5px; color: #9a3412; font-weight: 500;
  box-shadow: 0 1px 4px rgba(15,23,42,0.08);
}
.td-log-icon { color: #f97316; font-size: 11px; flex-shrink: 0; }
.td-log-text { flex: 1; text-align: center; }
.td-log-time { color: #c2743a; font-size: 10px; flex-shrink: 0; }

.td-msg { display: flex; margin-bottom: 6px; }
.td-msg--me { justify-content: flex-end; }
.td-msg--other { justify-content: flex-start; }
.td-msg-body { display: flex; flex-direction: column; gap: 1px; max-width: 78%; }
.td-msg-author { font-size: 11px; color: var(--text-tertiary); padding: 0 2px; }
.td-msg-bubble {
  padding: 7px 11px; border-radius: 12px; font-size: 13px; line-height: 1.45; word-break: break-word;
}
.td-msg-bubble--other { background: var(--bg-surface); color: var(--text-primary); border-bottom-left-radius: 3px; }
.td-msg-bubble--me { background: var(--brand-primary); color: #fff; border-bottom-right-radius: 3px; }
.td-msg-bubble :deep(.mention-inline) { background: rgba(255,255,255,0.25); border-radius: 3px; padding: 0 2px; font-weight: 600; }
.td-msg-bubble--other :deep(.mention-inline) { background: rgba(59,130,246,0.15); color: var(--brand-primary); }
.td-msg-text { white-space: pre-wrap; }
.td-msg-attaches { margin-top: 4px; display: flex; flex-direction: column; gap: 4px; }
.td-msg-img { max-width: 200px; max-height: 150px; border-radius: 6px; object-fit: cover; cursor: pointer; display: block; }
.chat-img-overlay {
  position: fixed; inset: 0; z-index: 10050;
  background: rgba(15,23,42,0.85); display: flex; align-items: center; justify-content: center; padding: 32px;
}
.chat-img-full { max-width: 92vw; max-height: 92vh; border-radius: 8px; box-shadow: 0 12px 48px rgba(0,0,0,0.5); }
.chat-img-close {
  position: fixed; top: 20px; right: 24px; width: 40px; height: 40px; border-radius: 50%;
  border: none; background: rgba(255,255,255,0.15); color: #fff; font-size: 18px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.chat-img-close:hover { background: rgba(255,255,255,0.3); }
.td-msg-file { font-size: 12px; color: inherit; opacity: 0.85; text-decoration: underline; }
.td-msg-time { font-size: 10px; color: var(--text-tertiary); padding: 0 2px; }
.td-msg--me .td-msg-time { text-align: right; }

/* Attachment preview strip */
.td-chat-attach-preview {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 14px; background: var(--bg-subtle); border-top: 1px solid var(--border-light); flex-shrink: 0;
}
.td-chat-attach-img { width: 36px; height: 36px; object-fit: cover; border-radius: 4px; }
.td-chat-attach-name { flex: 1; font-size: 12px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.td-chat-input-wrap {
  display: flex; align-items: flex-end; gap: 8px;
  padding: 10px 14px; border-top: 1px solid var(--border-light);
  background: var(--bg-surface); flex-shrink: 0;
}
.td-chat-attach-btn {
  cursor: pointer; color: var(--text-tertiary); font-size: 16px;
  display: flex; align-items: center; padding: 4px; flex-shrink: 0;
}
.td-chat-attach-btn:hover { color: var(--brand-primary); }
.td-chat-input {
  flex: 1; border: 1px solid var(--border-light); border-radius: 10px;
  padding: 7px 11px; font-size: 13px; font-family: inherit;
  background: var(--bg-subtle); color: var(--text-primary);
  resize: none; outline: none; line-height: 1.5; max-height: 120px; overflow-y: auto;
  transition: border-color 0.12s;
}
.td-chat-input:focus { border-color: var(--brand-primary); background: var(--bg-surface); }
.td-chat-send {
  width: 34px; height: 34px; border-radius: 9px; flex-shrink: 0;
  background: var(--brand-primary); border: none; cursor: pointer; color: #fff; font-size: 13px;
  display: flex; align-items: center; justify-content: center; transition: background 0.12s;
}
.td-chat-send:hover:not(:disabled) { background: var(--brand-primary-dark, #4f46e5); }
.td-chat-send:disabled { opacity: 0.4; cursor: default; }
.td-chat-mention-dd {
  position: absolute; bottom: 100%; left: 32px; right: 48px;
  background: var(--bg-surface); border: 1px solid var(--border-light);
  border-radius: 8px; box-shadow: 0 -4px 12px rgba(0,0,0,0.1);
  max-height: 160px; overflow-y: auto; z-index: 20;
}
.td-chat-mention-item {
  display: block; width: 100%; text-align: left; border: none; background: transparent;
  padding: 7px 12px; font-size: 13px; cursor: pointer; font-family: inherit; color: var(--text-primary);
}
.td-chat-mention-item:hover { background: var(--bg-subtle); }

/* ── Task detail editable fields ─────────────────────────────────────────── */
.td-title-edit-wrap { flex: 1; min-width: 0; }
/* Title: same styling for div and textarea so there's no visual jump */
.td-title-edit {
  width: 100%; border: none; outline: none; background: transparent;
  font-size: 16px; font-weight: 600; color: var(--text-primary);
  border-radius: 6px; padding: 0; font-family: inherit; resize: none;
  line-height: 1.4; display: block; box-sizing: border-box;
  max-height: 4.2em; overflow-y: auto; white-space: pre-wrap; word-break: break-word;
  transition: background 0.12s;
}
.td-title-edit:focus { background: var(--bg-subtle, rgba(0,0,0,0.03)); padding: 2px 4px; margin: -2px -4px; }
/* Description: same styling for div and textarea */
.td-desc-edit {
  width: 100%; border: none; outline: none; background: transparent;
  font-size: 13px; color: var(--text-secondary); font-family: inherit;
  line-height: 1.6; resize: none; min-height: 40px; display: block;
  box-sizing: border-box; padding: 0;
  transition: background 0.12s;
}
.td-desc-edit:focus { background: var(--bg-subtle, rgba(0,0,0,0.03)); outline: none; border-radius: 4px; padding: 4px; margin: -4px; }
/* Clickable meta rows */
.td-meta-row--clickable { cursor: pointer; }
.td-meta-row--clickable:hover { background: var(--bg-hover, rgba(0,0,0,0.03)); border-radius: 6px; }
/* Chip delete/add buttons for users */
.td-chip-del {
  width: 16px; height: 16px; border: none; background: none; cursor: pointer;
  border-radius: 3px; color: var(--text-tertiary); font-size: 10px;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  opacity: 0; transition: opacity 0.12s, background 0.1s;
  padding: 0;
}
.td-user-chip:hover .td-chip-del { opacity: 1; }
.td-chip-del:hover { background: #fecaca; color: #ef4444; }
.td-chip-add {
  width: 22px; height: 22px; border: 1.5px dashed var(--border-light); background: none; cursor: pointer;
  border-radius: 50%; color: var(--text-tertiary); font-size: 11px;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  transition: border-color 0.12s, color 0.12s, background 0.12s;
}
.td-chip-add:hover { border-color: var(--brand-primary); color: var(--brand-primary); background: var(--bg-subtle); }

/* Priority badge in task detail */
.td-prio-wrap { position: relative; }
.td-prio-badge {
  display: flex; align-items: center; gap: 5px;
  padding: 4px 10px; border-radius: 20px; border: 1px solid var(--border-light);
  background: var(--bg-subtle); font-size: 12px; font-weight: 500;
  color: var(--text-secondary);
}
.td-prio-menu {
  position: absolute; top: calc(100% + 4px); right: 0; z-index: 100;
  background: var(--bg-surface); border: 1px solid var(--border-light);
  border-radius: 10px; box-shadow: 0 8px 30px rgba(15,23,42,0.14);
  overflow: hidden; min-width: 170px;
}
.td-prio-item {
  width: 100%; display: flex; align-items: center; gap: 8px;
  padding: 9px 14px; border: none; background: none; cursor: pointer;
  font-size: 13px; color: var(--text-primary); text-align: left; font-family: inherit;
  transition: background 0.1s;
}
.td-prio-item:hover { background: var(--bg-subtle); }
.td-prio-item.active { font-weight: 600; }

/* Files section */
.td-files-header { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; margin-bottom: 8px; }
.td-files-list { display: flex; flex-direction: column; gap: 4px; }
.td-file-item {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 8px; border-radius: 8px; transition: background 0.1s;
}
.td-file-item:hover { background: var(--bg-subtle); }
.td-file-icon { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; color: var(--text-tertiary); font-size: 14px; flex-shrink: 0; }
.td-file-name { flex: 1; font-size: 13px; color: var(--brand-primary); cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.td-file-name:hover { text-decoration: underline; }

/* Checklist add input */
.td-cl-add { display: flex; align-items: center; gap: 8px; padding: 6px 0; }
.td-cl-add-input {
  flex: 1; border: none; outline: none; background: none; font-size: 13px;
  color: var(--text-primary); font-family: inherit;
}
.td-cl-add-input::placeholder { color: var(--text-tertiary); }
.td-cl-item:hover .td-cl-del { opacity: 1 !important; }
/* Checklist item content column */
.td-cl-content { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
/* Assigned users row under item text */
.td-cl-users { display: flex; align-items: center; gap: 3px; flex-wrap: wrap; }
.td-cl-role-label { color: var(--text-tertiary); display: flex; align-items: center; }
/* File upload + button */
.td-file-upload-btn {
  margin-left: auto; width: 22px; height: 22px; border-radius: 50%;
  border: 1.5px dashed var(--border-light); display: flex; align-items: center;
  justify-content: center; cursor: pointer; color: var(--text-tertiary); font-size: 11px;
  transition: border-color 0.12s, color 0.12s, background 0.12s; flex-shrink: 0;
}
.td-file-upload-btn:hover { border-color: var(--brand-primary); color: var(--brand-primary); background: var(--bg-subtle); }

/* File preview */
.file-preview-backdrop {
  position: fixed; inset: 0; z-index: 600;
  background: rgba(0,0,0,0.75); display: flex; align-items: center; justify-content: center; padding: 24px;
}
.file-preview-modal {
  background: var(--bg-surface); border-radius: 12px; overflow: hidden;
  max-width: 90vw; max-height: 90vh; position: relative;
  display: flex; align-items: center; justify-content: center;
}
.file-preview-img { max-width: 85vw; max-height: 85vh; object-fit: contain; display: block; }
.file-preview-frame { width: 80vw; height: 85vh; border: none; }
</style>
