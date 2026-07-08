<script setup>
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import TopNav from '../components/layout/TopNav.vue'
import DocumentLinksPanel from '../components/DocumentLinksPanel.vue'
import { mainNavLinks } from '../constants/mainNav'

const LetterEditor = defineAsyncComponent(() => import('../components/LetterEditor.vue'))

const editorMode = ref('onlyoffice') // 'onlyoffice' | 'custom'

const router   = useRouter()
const route    = useRoute()
const navLinks = mainNavLinks

// ── State ─────────────────────────────────────────────────
const letter  = ref(null)
const loading = ref(true)
const error   = ref('')

const activeTab = ref('main')
const tabs = [
  { key: 'main',        label: 'Основная информация' },
  { key: 'docs',        label: 'Файлы' },
  { key: 'viewer',      label: 'Просмотр письма' },
  { key: 'constructor', label: 'Конструктор' },
  { key: 'history',     label: 'История действий' },
]

// ── Load ──────────────────────────────────────────────────
const loadLetter = async () => {
  loading.value = true
  error.value   = ''
  try {
    const r = await fetch(`/apisup/supply/letters/${route.params.id}`, { credentials: 'include' })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    letter.value = await r.json()
  } catch {
    error.value = 'Не удалось загрузить письмо'
  } finally {
    loading.value = false
  }
}

// ── Helpers ───────────────────────────────────────────────
const formatDate = (v) => {
  if (!v) return '—'
  const d = new Date(v)
  return isNaN(d) ? '—' : d.toLocaleDateString('ru-RU')
}
const formatDateTime = (v) => {
  if (!v) return '—'
  const d = new Date(v)
  if (isNaN(d)) return '—'
  return d.toLocaleDateString('ru-RU') + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

const typeLabel = (t) => ({ outgoing: 'Исходящее', incoming: 'Входящее' }[t] || t || '—')

const letterTitle = computed(() => {
  if (!letter.value) return ''
  const { name, num } = letter.value
  return name ? (num ? `${name} № ${num}` : name) : '—'
})

// ── Roles ─────────────────────────────────────────────────
const executor = computed(() =>
  (letter.value?.user_roles || []).find(r => r.role === 'executor')?.user || null
)
const coExecutors = computed(() =>
  (letter.value?.user_roles || []).filter(r => r.role === 'co-executor').map(r => r.user)
)
const observers = computed(() =>
  (letter.value?.user_roles || []).filter(r => r.role === 'observer').map(r => r.user)
)
const avatarLetter = (u) =>
  u ? (u.surname?.[0] || u.name?.[0] || '?').toUpperCase() : '?'

// ── Statuses ──────────────────────────────────────────────
const hasStatus = (key) => (letter.value?.statuses || []).some(s => s.status === key)
const getStatus = (key) => (letter.value?.statuses || []).find(s => s.status === key)
const statusLoading = ref('')

const addStatus = async (status) => {
  statusLoading.value = status
  try {
    const r = await fetch('/apisup/supply/letter-statuses', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ letter_id: Number(route.params.id), status }),
    })
    if (!r.ok) throw new Error()
    await loadLetter()
  } catch {}
  statusLoading.value = ''
}

const removeStatus = async (status) => {
  const s = getStatus(status)
  if (!s) return
  statusLoading.value = status
  try {
    await fetch(`/apisup/supply/letter-statuses/${s.id}`, { method: 'DELETE', credentials: 'include' })
    await loadLetter()
  } catch {}
  statusLoading.value = ''
}

// ── Confirm modal ─────────────────────────────────────────
const confirmModal = ref({ show: false, text: '', onConfirm: null, loading: false, danger: false })
const showConfirm = (text, onConfirm, danger = false) => {
  confirmModal.value = { show: true, text, onConfirm, loading: false, danger }
}
const doConfirm = async () => {
  confirmModal.value.loading = true
  try { await confirmModal.value.onConfirm() } finally {
    confirmModal.value = { show: false, text: '', onConfirm: null, loading: false, danger: false }
  }
}

// ── Delete ────────────────────────────────────────────────
const deleteLoading = ref(false)
const confirmDelete = async () => {
  deleteLoading.value = true
  try {
    const r = await fetch(`/apisup/supply/letters/${route.params.id}`, { method: 'DELETE', credentials: 'include' })
    if (!r.ok) throw new Error()
    router.push('/documents?registry=letters')
  } catch {
    deleteLoading.value = false
  }
}

// ── История действий ──────────────────────────────────────
const logs        = ref([])
const logsLoading = ref(false)
const logsError   = ref('')

const logIcon = (text) => {
  const t = (text || '').toLowerCase()
  const has = (stem) => t.includes(stem)
  const isFolder  = has('папк')
  const isFile    = has('файл')
  const isLetter  = has('письм')
  const isObject  = has('объект')
  const isUser    = has('пользовател') || has('исполнит') || has('ответствен') || has('наблюдател')
  const isStatus  = has('статус')
  const isEdit    = /измен|обновл|редактир/.test(t)
  const isDelete  = /удал/.test(t)
  const isCreate  = /создал|создан|добавил|добавлен|загруз/.test(t)

  if (isFolder)  return { icon: 'fa-folder',       color: '#f59e0b' }
  if (isFile)    return { icon: 'fa-file-alt',      color: '#6366f1' }
  if (isLetter)  {
    if (isDelete) return { icon: 'fa-trash-alt',    color: '#ef4444' }
    if (isCreate) return { icon: 'fa-envelope',     color: '#10b981' }
    if (isEdit)   return { icon: 'fa-pencil-alt',   color: '#3b82f6' }
                  return { icon: 'fa-envelope',      color: '#8b5cf6' }
  }
  if (isObject)  return { icon: 'fa-map-marker-alt', color: '#f97316' }
  if (isUser)    return { icon: 'fa-user',           color: '#06b6d4' }
  if (isStatus)  return { icon: 'fa-flag',           color: '#f59e0b' }
  if (isDelete)  return { icon: 'fa-trash-alt',      color: '#ef4444' }
  if (isCreate)  return { icon: 'fa-plus-circle',    color: '#10b981' }
  if (isEdit)    return { icon: 'fa-pencil-alt',     color: '#3b82f6' }
                 return { icon: 'fa-history',         color: '#94a3b8' }
}

const LOG_TYPES = [
  { key: 'letter', label: 'Письмо',    icon: 'fa-envelope',      color: '#8b5cf6' },
  { key: 'file',   label: 'Файл',      icon: 'fa-file-alt',      color: '#6366f1' },
  { key: 'folder', label: 'Папка',     icon: 'fa-folder',        color: '#f59e0b' },
  { key: 'object', label: 'Объект',    icon: 'fa-map-marker-alt', color: '#f97316' },
  { key: 'user',   label: 'Сотрудник', icon: 'fa-user',          color: '#06b6d4' },
]

const logType = (text) => {
  const t = (text || '').toLowerCase()
  if (t.includes('папк'))  return 'folder'
  if (t.includes('файл'))  return 'file'
  if (t.includes('письм')) return 'letter'
  if (t.includes('объект')) return 'object'
  if (t.includes('пользовател') || t.includes('исполнит') || t.includes('ответствен') || t.includes('наблюдател')) return 'user'
  return 'other'
}

const logUniqueUsers = computed(() => {
  const map = new Map()
  for (const log of logs.value) {
    const u = log.created_by_user
    if (u?.id && !map.has(u.id)) map.set(u.id, u)
  }
  return [...map.values()]
})

const filterText     = ref('')
const filterUser     = ref('')
const filterUserQ    = ref('')
const filterUserOpen = ref(false)
const filterDateFrom = ref('')
const filterDateTo   = ref('')
const filterTypes    = ref([])

const filteredLogUsers = computed(() => {
  const q = filterUserQ.value.toLowerCase()
  return logUniqueUsers.value.filter(u => {
    if (!q) return true
    return (u.short_fio || `${u.surname} ${u.name}`).toLowerCase().includes(q)
  })
})

const selectLogUser = (u) => {
  filterUser.value  = u ? String(u.id) : ''
  filterUserQ.value = u ? (u.short_fio || `${u.surname} ${u.name}`) : ''
  filterUserOpen.value = false
}
const clearLogUser = () => { filterUser.value = ''; filterUserQ.value = ''; filterUserOpen.value = false }
const filtersActive = computed(() =>
  filterText.value.trim() || filterUser.value || filterDateFrom.value || filterDateTo.value || filterTypes.value.length
)
const toggleFilterType = (key) => {
  const idx = filterTypes.value.indexOf(key)
  if (idx === -1) filterTypes.value.push(key)
  else filterTypes.value.splice(idx, 1)
}
const clearFilters = () => {
  filterText.value = ''; filterUser.value = ''; filterUserQ.value = ''
  filterDateFrom.value = ''; filterDateTo.value = ''; filterTypes.value = []
}

const logsFiltered = computed(() => {
  let list = logs.value
  const q = filterText.value.trim().toLowerCase()
  if (q) list = list.filter(l => (l.full_log || l.message || '').toLowerCase().includes(q))
  if (filterUser.value) list = list.filter(l => String(l.created_by_user?.id) === filterUser.value)
  if (filterDateFrom.value) list = list.filter(l => l.created_at >= filterDateFrom.value)
  if (filterDateTo.value)   list = list.filter(l => l.created_at.slice(0,10) <= filterDateTo.value)
  if (filterTypes.value.length) list = list.filter(l => filterTypes.value.includes(logType(l.full_log || l.message)))
  return list
})

const isSameDay = (a, b) => {
  const da = new Date(a), db = new Date(b)
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate()
}
const formatDateGroup = (iso) => {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1)
  if (isSameDay(d, today)) return 'Сегодня'
  if (isSameDay(d, yesterday)) return 'Вчера'
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
}

const logsGrouped = computed(() => {
  const groups = []
  let lastDay = null
  for (const log of logsFiltered.value) {
    const day = formatDateGroup(log.created_at)
    if (day !== lastDay) { groups.push({ type: 'day', label: day }); lastDay = day }
    groups.push({ type: 'log', log })
  }
  return groups
})

const loadLogs = async () => {
  logsLoading.value = true
  logsError.value   = ''
  try {
    const r = await fetch(
      `/apisup/supply/contract-logs?log_object_id=${route.params.id}&log_object_type=letter`,
      { credentials: 'include' }
    )
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    logs.value = await r.json()
  } catch {
    logsError.value = 'Не удалось загрузить историю'
  } finally {
    logsLoading.value = false
  }
}

// ── Файлы: загрузка ───────────────────────────────────────
const UPLOAD_TYPES = [
  { key: 'original', label: 'Оригинал письма', folderName: 'Оригинал письма', icon: 'fa-stamp',    fileType: 'original' },
  { key: 'version',  label: 'Версия письма',   folderName: 'Версия письма',   icon: 'fa-envelope', fileType: 'version'  },
  { key: 'files',    label: 'Файлы',           folderName: null,              icon: 'fa-paperclip', fileType: null       },
]
const TYPE_EXTS = ['pdf', 'docx', 'doc', 'xlsx', 'xls']
const uploadState   = ref({})
const fileInputs    = ref({})
const dropActive    = ref(false)
const dropUploading = ref(false)

const triggerUpload = (key) => {
  const el = fileInputs.value[key]
  if (el) el.click()
}

const findRootFolderInTree = (name) =>
  tree.value.find(f => f.name === name && !f.parent_id) || null

const getOrCreateFolder = async (folderName) => {
  if (!tree.value.length) await loadTree()
  const existing = findRootFolderInTree(folderName)
  if (existing) return existing.id
  const res = await fetch('/apisup/supply/letter-folders', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ letter_id: Number(route.params.id), name: folderName }),
  })
  if (!res.ok) throw new Error('Не удалось создать папку')
  const folder = await res.json()
  return folder.id
}

const sendFilesToApi = async (files, folderId, fileType = null) => {
  const formData = new FormData()
  formData.append('letter_id', route.params.id)
  if (folderId) formData.append('letter_folder_id', folderId)
  for (const file of files) {
    formData.append('files', file)
    if (fileType && TYPE_EXTS.includes(file.name.split('.').pop()?.toLowerCase())) {
      formData.append('type', fileType)
    }
  }
  const res = await fetch('/apisup/supply/letter-files', {
    method: 'POST', credentials: 'include', body: formData,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

const uploadFiles = async (key, files) => {
  if (!files || !files.length) return
  const type = UPLOAD_TYPES.find(t => t.key === key)
  uploadState.value[key] = { loading: true, error: '', done: false }
  try {
    let folderId = currentFolder.value?.id || null
    if (type.folderName) folderId = await getOrCreateFolder(type.folderName)
    await sendFilesToApi(files, folderId, type.fileType)
    uploadState.value[key] = { loading: false, error: '', done: true }
    setTimeout(() => { uploadState.value[key] = { loading: false, error: '', done: false } }, 3000)
    await loadTree()
  } catch (e) {
    uploadState.value[key] = { loading: false, error: e.message || 'Ошибка загрузки', done: false }
  }
  if (fileInputs.value[key]) fileInputs.value[key].value = ''
}

const onDragOver  = (e) => { e.preventDefault(); dropActive.value = true }
const onDragLeave = ()  => { dropActive.value = false }
const onDrop = async (e) => {
  e.preventDefault()
  dropActive.value = false
  const files = [...(e.dataTransfer?.files || [])]
  if (!files.length) return
  dropUploading.value = true
  try {
    await sendFilesToApi(files, currentFolder.value?.id || null)
    await loadTree()
  } catch {}
  dropUploading.value = false
}

// ── Файлы: дерево ────────────────────────────────────────
const tree        = ref([])
const treeLoading = ref(false)
const treeError   = ref('')
const breadcrumb  = ref([])

const currentFolder = computed(() =>
  breadcrumb.value.length ? breadcrumb.value[breadcrumb.value.length - 1] : null
)

const findFolderNode = (nodes, id) => {
  for (const n of nodes) {
    if (n.id === id) return n
    const found = findFolderNode(n.children || [], id)
    if (found) return found
  }
  return null
}

const currentItems = computed(() => {
  if (!breadcrumb.value.length) return { folders: tree.value, files: [] }
  const folder = findFolderNode(tree.value, currentFolder.value.id)
  return { folders: folder?.children || [], files: folder?.files || [] }
})

const loadTree = async () => {
  treeLoading.value = true
  treeError.value   = ''
  try {
    const r = await fetch(`/apisup/supply/letter-folders/tree?letter_id=${route.params.id}`, { credentials: 'include' })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    tree.value = await r.json()
  } catch {
    treeError.value = 'Не удалось загрузить файлы'
  } finally {
    treeLoading.value = false
  }
}

const openFolder    = (f)   => breadcrumb.value.push({ id: f.id, name: f.name })
const goToBreadcrumb = (idx) => { breadcrumb.value = breadcrumb.value.slice(0, idx + 1) }
const goToRoot      = ()    => { breadcrumb.value = [] }

// ── Файлы: иконки ─────────────────────────────────────────
const EXT_ICONS = {
  pdf:  { icon: 'fa-file-pdf',     color: '#ef4444' },
  doc:  { icon: 'fa-file-word',    color: '#2563eb' },
  docx: { icon: 'fa-file-word',    color: '#2563eb' },
  xls:  { icon: 'fa-file-excel',   color: '#16a34a' },
  xlsx: { icon: 'fa-file-excel',   color: '#16a34a' },
  jpg:  { icon: 'fa-file-image',   color: '#d97706' },
  jpeg: { icon: 'fa-file-image',   color: '#d97706' },
  png:  { icon: 'fa-file-image',   color: '#d97706' },
  zip:  { icon: 'fa-file-archive', color: '#7c3aed' },
  rar:  { icon: 'fa-file-archive', color: '#7c3aed' },
}
const fileIcon  = (ext) => EXT_ICONS[ext?.toLowerCase()]?.icon  || 'fa-file-alt'
const fileColor = (ext) => EXT_ICONS[ext?.toLowerCase()]?.color || '#94a3b8'

const downloadFile = async (file) => {
  const res = await fetch(`/apisup/supply/letter-files/${file.id}/download`, { credentials: 'include' })
  if (!res.ok) return
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = file.original_name; a.click()
  URL.revokeObjectURL(url)
}

// ── Файлы: предпросмотр ───────────────────────────────────
const previewType = (ext) => {
  ext = ext?.toLowerCase()
  if (ext === 'pdf') return 'pdf'
  if (['jpg','jpeg','png','gif','webp','bmp','svg'].includes(ext)) return 'image'
  if (['docx','doc','xlsx','xls'].includes(ext)) return 'pdf'
  return 'unsupported'
}

const preview = ref({ show: false, file: null, blobUrl: null, loading: false, error: '' })

const openPreview = async (file) => {
  preview.value = { show: true, file, blobUrl: null, loading: true, error: '' }
  const ext = file.extension?.toLowerCase()
  try {
    const usePreview = ['docx','doc','xlsx','xls'].includes(ext)
    const res = await fetch(
      usePreview
        ? `/apisup/supply/letter-files/${file.id}/preview`
        : `/apisup/supply/letter-files/${file.id}/download`,
      { credentials: 'include' }
    )
    if (!res.ok) throw new Error()
    preview.value.blobUrl = URL.createObjectURL(await res.blob())
  } catch {
    preview.value.error = 'Не удалось загрузить файл для просмотра'
  } finally {
    preview.value.loading = false
  }
}

const closePreview = () => {
  if (preview.value.blobUrl) URL.revokeObjectURL(preview.value.blobUrl)
  preview.value = { show: false, file: null, blobUrl: null, loading: false, error: '' }
}

// ── Файлы: переименование ─────────────────────────────────
const renameModal = ref({ show: false, type: '', id: '', name: '', loading: false })
const openRenameFile   = (f) => { renameModal.value = { show: true, type: 'file',   id: f.id, name: f.original_name, loading: false } }
const openRenameFolder = (f) => { renameModal.value = { show: true, type: 'folder', id: f.id, name: f.name,          loading: false } }
const submitRename = async () => {
  const m = renameModal.value
  m.loading = true
  try {
    const url  = m.type === 'file' ? `/apisup/supply/letter-files/${m.id}` : `/apisup/supply/letter-folders/${m.id}`
    const body = m.type === 'file' ? { original_name: m.name } : { name: m.name }
    await fetch(url, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    renameModal.value.show = false
    await loadTree()
  } finally { renameModal.value.loading = false }
}

// ── Файлы: удаление ───────────────────────────────────────
const deleteModal = ref({ show: false, type: '', id: '', name: '', loading: false })
const openDeleteFile   = (f) => { deleteModal.value = { show: true, type: 'file',   id: f.id, name: f.original_name, loading: false } }
const openDeleteFolder = (f) => { deleteModal.value = { show: true, type: 'folder', id: f.id, name: f.name,          loading: false } }
const submitDelete = async () => {
  const m = deleteModal.value
  m.loading = true
  try {
    const url = m.type === 'file' ? `/apisup/supply/letter-files/${m.id}` : `/apisup/supply/letter-folders/${m.id}`
    await fetch(url, { method: 'DELETE', credentials: 'include' })
    deleteModal.value.show = false
    if (m.type === 'folder' && currentFolder.value?.id === m.id) goToRoot()
    await loadTree()
  } finally { m.loading = false }
}

// ── Файлы: создание папки ─────────────────────────────────
const createFolderModal = ref({ show: false, name: '', loading: false })
const submitCreateFolder = async () => {
  const m = createFolderModal.value
  if (!m.name.trim()) return
  m.loading = true
  try {
    await fetch('/apisup/supply/letter-folders', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ letter_id: Number(route.params.id), name: m.name.trim(), parent_id: currentFolder.value?.id || null }),
    })
    createFolderModal.value = { show: false, name: '', loading: false }
    await loadTree()
  } finally { m.loading = false }
}

// ── Вьюер письма ─────────────────────────────────────────
const viewerFiles       = ref([])
const viewerLoading     = ref(false)
const viewerError       = ref('')
const viewerActiveFile  = ref(null)
const viewerBlobUrl     = ref(null)
const viewerPreviewLoad = ref(false)
const viewerRightTab    = ref('files')
const viewerInputOriginal = ref(null)
const viewerInputVersion  = ref(null)
const viewerUploadState   = ref({ loading: false, error: '' })

const viewerUpload = async (typeKey, files) => {
  if (!files || !files.length) return
  viewerUploadState.value = { loading: true, error: '' }
  try {
    const folderName = typeKey === 'original' ? 'Оригинал письма' : 'Версия письма'
    const folderId = await getOrCreateFolder(folderName)
    await sendFilesToApi(files, folderId, typeKey)
    await loadViewerFiles()
  } catch (e) {
    viewerUploadState.value.error = e.message || 'Ошибка загрузки'
  } finally {
    viewerUploadState.value.loading = false
    if (viewerInputOriginal.value) viewerInputOriginal.value.value = ''
    if (viewerInputVersion.value)  viewerInputVersion.value.value  = ''
  }
}

const loadViewerFiles = async () => {
  viewerLoading.value = true
  viewerError.value   = ''
  try {
    const r = await fetch(`/apisup/supply/letter-files/history?letter_id=${route.params.id}`, { credentials: 'include' })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const data = await r.json()
    viewerFiles.value = [...data].sort((a, b) => new Date(a.uploaded_at) - new Date(b.uploaded_at))
    if (viewerFiles.value.length) selectViewerFile(viewerFiles.value[0])
  } catch {
    viewerError.value = 'Не удалось загрузить файлы'
  } finally {
    viewerLoading.value = false
  }
}

const selectViewerFile = async (file, source = 'letter') => {
  if (viewerBlobUrl.value) { URL.revokeObjectURL(viewerBlobUrl.value); viewerBlobUrl.value = null }
  viewerActiveFile.value = file
  viewerPreviewLoad.value = true
  try {
    const ext = file.extension?.toLowerCase()
    const usePreview = ['docx','doc','xlsx','xls'].includes(ext)
    const base = source === 'contract' ? '/apisup/supply/contract-files' : '/apisup/supply/letter-files'
    const res = await fetch(`${base}/${file.id}/${usePreview ? 'preview' : 'download'}`, { credentials: 'include' })
    if (!res.ok) throw new Error()
    viewerBlobUrl.value = URL.createObjectURL(await res.blob())
  } catch {
    viewerBlobUrl.value = null
  } finally {
    viewerPreviewLoad.value = false
  }
}

const viewerPreviewType = (ext) => {
  ext = ext?.toLowerCase()
  if (['pdf','docx','doc','xlsx','xls'].includes(ext)) return 'pdf'
  if (['jpg','jpeg','png','gif','webp','bmp','svg'].includes(ext)) return 'image'
  return 'unsupported'
}

// ── OnlyOffice Constructor ────────────────────────────────
const editorLoading = ref(false)
const editorError   = ref('')
const editorReady   = ref(false)
let   docEditorInstance = null
let   docConnector      = null

// Текущий пользователь для OnlyOffice
const currentUser = ref(null)
const fetchCurrentUser = async () => {
  try {
    const r = await fetch('/api/as/users/me', { credentials: 'include' })
    if (r.ok) currentUser.value = await r.json()
  } catch {}
}

// Состояние ручного сохранения версии
const ooSaveStatus    = ref('') // '' | 'saving' | 'saved' | 'error'
const connectorReady  = ref(false)

// Force-save через Command Service OnlyOffice (надёжнее executeMethod)
const ooSaveVersion = async () => {
  ooSaveStatus.value = 'saving'
  try {
    const r = await fetch(
      `/apisup/supply/letters/${route.params.id}/editor-forcesave`,
      { method: 'POST', credentials: 'include' }
    )
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    // OnlyOffice асинхронно вызовет callback; ждём ~2с и обновляем список
    await new Promise(res => setTimeout(res, 2500))
    ooSaveStatus.value = 'saved'
    await loadConstructorVersions()
    setTimeout(() => { ooSaveStatus.value = '' }, 3000)
  } catch (e) {
    console.error('ForceSave error:', e)
    ooSaveStatus.value = 'error'
    setTimeout(() => { ooSaveStatus.value = '' }, 3000)
  }
}

// Модальное окно «Сохранить перед уходом?»
const leaveModal = ref({ show: false, targetTab: '' })
const leaveAndSave = async () => {
  const tab = leaveModal.value.targetTab
  leaveModal.value.show = false
  await ooSaveVersion()
  doSetTab(tab)
}
const leaveWithoutSave = () => {
  const tab = leaveModal.value.targetTab
  leaveModal.value.show = false
  doSetTab(tab)
}

const ONLYOFFICE_API_URL = 'https://doc.st29.ru/web-apps/apps/api/documents/api.js'

const loadOnlyOfficeScript = () => new Promise((resolve, reject) => {
  if (window.DocsAPI) { resolve(); return }
  const s = document.createElement('script')
  s.src = ONLYOFFICE_API_URL
  s.onload  = resolve
  s.onerror = () => reject(new Error('Не удалось загрузить OnlyOffice API'))
  document.head.appendChild(s)
})

const destroyEditor = () => {
  if (docConnector)      { try { docConnector.disconnect() }      catch {} docConnector = null }
  if (docEditorInstance) { try { docEditorInstance.destroyEditor() } catch {} docEditorInstance = null }
  editorReady.value    = false
  connectorReady.value = false
}

const switchEditorMode = async (mode) => {
  if (editorMode.value === mode) return
  if (mode === 'custom') {
    destroyEditor()
    editorMode.value = 'custom'
  } else {
    editorMode.value = 'onlyoffice'
    await nextTick()
    setTimeout(initEditor, 50)
  }
}

const initEditor = async () => {
  if (editorReady.value) return
  editorLoading.value = true
  editorError.value   = ''
  try {
    await loadOnlyOfficeScript()
    const r = await fetch(`/apisup/supply/letters/${route.params.id}/editor-config`, { credentials: 'include' })
    if (!r.ok) throw new Error(`Ошибка загрузки конфига: HTTP ${r.status}`)
    const cfg = await r.json()

    destroyEditor()
    docEditorInstance = new window.DocsAPI.DocEditor('onlyoffice-editor', {
      documentType: 'word',
      token: cfg.token || undefined,
      document: {
        fileType:    cfg.document?.fileType    || cfg.fileType || 'docx',
        key:         cfg.document?.key         || cfg.key,
        title:       cfg.document?.title       || cfg.title || `Письмо ${letter.value?.internal_num || ''}`,
        url:         cfg.document?.url         || cfg.fileUrl,
        permissions: cfg.document?.permissions || { edit: true, download: true, print: true },
        token:       cfg.token || undefined,
      },
      editorConfig: {
        callbackUrl: cfg.editorConfig?.callbackUrl || cfg.callbackUrl,
        lang:        cfg.editorConfig?.lang        || 'ru',
        user: cfg.editorConfig?.user || cfg.user || (currentUser.value ? {
          id:   String(currentUser.value.id),
          name: [currentUser.value.surname, currentUser.value.name, currentUser.value.patronymic]
                  .filter(Boolean).join(' ') || currentUser.value.username || 'Пользователь',
        } : undefined),
        customization: {
          autosave:    true,
          forcesave:   true,
          compactHeader: true,
          toolbarNoTabs: false,
          hideRightMenu: false,
        },
      },
      events: {
        onAppReady: () => {
          docConnector = docEditorInstance.createConnector()
        },
        onError: (e) => {
          editorError.value = `Ошибка редактора: ${e.data?.errorDescription || JSON.stringify(e.data)}`
        },
      },
      width:  '100%',
      height: '100%',
    })
    editorReady.value = true
  } catch (e) {
    editorError.value = e.message || 'Не удалось инициализировать редактор'
  } finally {
    editorLoading.value = false
  }
}

// ── AI панель ─────────────────────────────────────────────
const MISTRAL_API_KEY = 'bvTwJKJ7WBYii13zp1OVqU7uNwetQwpW'
const aiPrompt        = ref('')
const aiResult        = ref('')
const aiLoading       = ref(false)
const aiError         = ref('')
const aiPanelOpen     = ref(true)

const aiSystemPrompt = computed(() => {
  const l = letter.value
  if (!l) return 'Ты помощник для написания деловых писем.'
  return `Ты помощник для написания деловых писем на русском языке.
Контекст текущего письма:
- Тип: ${l.type === 'outgoing' ? 'Исходящее' : 'Входящее'}
- Тема: ${l.name || '—'}
- От кого: ${l.from_to_name || '—'}
- Кому: ${l.where_to_name || '—'}
- Номер: ${l.internal_num || '—'}
- Дата: ${l.created_at ? formatDate(l.created_at) : '—'}

Пиши только основной текст письма — без шапки, реквизитов, обращения и подписи, они уже есть в шаблоне.
Стиль: официально-деловой, строгий, грамотный русский язык. Без лишних слов, без канцелярского мусора. Структурируй текст абзацами. Не используй markdown-разметку — только чистый текст.`
})

const askAI = async () => {
  if (!aiPrompt.value.trim()) return
  aiLoading.value = true
  aiError.value   = ''
  aiResult.value  = ''
  try {
    const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${MISTRAL_API_KEY}`,
      },
      body: JSON.stringify({
        model:    'mistral-large-latest',
        messages: [
          { role: 'system',  content: aiSystemPrompt.value },
          { role: 'user',    content: aiPrompt.value },
        ],
        max_tokens:  2000,
        temperature: 0.7,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.message || `HTTP ${res.status}`)
    }
    const data = await res.json()
    aiResult.value = data.choices?.[0]?.message?.content?.trim() || ''
  } catch (e) {
    aiError.value = e.message || 'Ошибка запроса к AI'
  } finally {
    aiLoading.value = false
  }
}

const aiCopied   = ref(false)
const aiInserted = ref(false)
const insertToEditor = async () => {
  if (!aiResult.value) return
  if (docConnector) {
    docConnector.executeMethod('InsertText', [{ text: aiResult.value, isHtml: false }], () => {})
    aiInserted.value = true
    setTimeout(() => { aiInserted.value = false }, 2500)
  } else {
    await navigator.clipboard.writeText(aiResult.value)
    aiCopied.value = true
    setTimeout(() => { aiCopied.value = false }, 2500)
  }
}

// ── Версии в конструкторе ─────────────────────────────────
const constructorVersions       = ref([])
const constructorVersionsLoading = ref(false)
const constructorActiveVersion  = ref(null)

const loadConstructorVersions = async () => {
  constructorVersionsLoading.value = true
  try {
    const r = await fetch(`/apisup/supply/letter-files/history?letter_id=${route.params.id}`, { credentials: 'include' })
    if (!r.ok) throw new Error()
    const data = await r.json()
    constructorVersions.value = [...data].sort((a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at))
  } catch {}
  finally { constructorVersionsLoading.value = false }
}

const selectConstructorVersion = async (file) => {
  constructorActiveVersion.value = file
  destroyEditor()
  editorLoading.value = true
  editorError.value   = ''
  try {
    await loadOnlyOfficeScript()
    const r = await fetch(`/apisup/supply/letters/${route.params.id}/editor-config?file_id=${file.id}`, { credentials: 'include' })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const cfg = await r.json()

    docEditorInstance = new window.DocsAPI.DocEditor('onlyoffice-editor', {
      documentType: 'word',
      token: cfg.token || undefined,
      document: {
        fileType:    cfg.document?.fileType    || file.extension || 'docx',
        key:         cfg.document?.key         || `letter-${route.params.id}-ver-${file.id}`,
        title:       cfg.document?.title       || file.original_name,
        url:         cfg.document?.url         || cfg.fileUrl,
        permissions: cfg.document?.permissions || { edit: true, download: true, print: true },
        token:       cfg.token || undefined,
      },
      editorConfig: {
        callbackUrl: cfg.editorConfig?.callbackUrl || cfg.callbackUrl,
        lang:        'ru',
        user:        cfg.editorConfig?.user || cfg.user || undefined,
        customization: { autosave: true, forcesave: false, compactHeader: true },
      },
      events: {
        onAppReady: () => {
          docConnector = docEditorInstance.createConnector()
          connectorReady.value = true
        },
        onError: (e) => { editorError.value = `Ошибка редактора: ${e.data?.errorDescription || ''}` },
      },
      width: '100%', height: '100%',
    })
    editorReady.value = true
  } catch (e) {
    editorError.value = e.message || 'Не удалось открыть версию'
  } finally {
    editorLoading.value = false
  }
}

const copyAiResult = async () => {
  await navigator.clipboard.writeText(aiResult.value)
}

// ── Tab switch ────────────────────────────────────────────
const doSetTab = (key) => {
  if (activeTab.value === 'constructor' && key !== 'constructor') destroyEditor()
  activeTab.value = key
  if (key === 'history'     && !logs.value.length && !logsLoading.value) loadLogs()
  if (key === 'docs'        && !tree.value.length  && !treeLoading.value) loadTree()
  if (key === 'viewer')     loadViewerFiles()
  if (key === 'constructor') { if (editorMode.value === 'onlyoffice') setTimeout(initEditor, 50); loadConstructorVersions() }
}

const setTab = (key) => {
  // Покидаем конструктор в режиме OnlyOffice — спрашиваем про сохранение
  if (activeTab.value === 'constructor' && key !== 'constructor'
      && editorMode.value === 'onlyoffice' && editorReady.value) {
    leaveModal.value = { show: true, targetTab: key }
    return
  }
  doSetTab(key)
}

onUnmounted(destroyEditor)

onMounted(() => { loadLetter(); fetchCurrentUser() })

// Переход письмо → письмо (через связи): компонент переиспользуется,
// при смене id перезагружаем данные
watch(() => route.params.id, (newId, oldId) => {
  if (!newId || newId === oldId) return
  viewerActiveFile.value = null
  if (viewerBlobUrl.value) { URL.revokeObjectURL(viewerBlobUrl.value); viewerBlobUrl.value = null }
  viewerFiles.value = []
  viewerRightTab.value = 'files'
  loadLetter()
})
</script>


<template>
  <div class="page-wrap">
    <TopNav :links="navLinks" />

    <div v-if="loading" class="state-full"><div class="spinner"></div> Загрузка...</div>
    <div v-else-if="error" class="state-full state-error"><i class="fas fa-exclamation-circle"></i> {{ error }}</div>

    <template v-else-if="letter">

      <!-- ── Header ── -->
      <div class="contract-header">
        <div class="header-top">
          <button class="back-btn" @click="router.push('/documents?registry=letters')">
            <i class="fas fa-arrow-left"></i> Реестр писем
          </button>
          <div class="header-meta">
            <span class="meta-num">№ {{ letter.internal_num || letter.id }}</span>
            <span v-if="letter.num" class="meta-sep">·</span>
            <span v-if="letter.num" class="meta-num">{{ letter.num }}</span>
            <span class="meta-sep">·</span>
            <span class="meta-date">{{ formatDate(letter.created_at) }}</span>
            <span class="type-badge" :class="`type-badge--${letter.type}`">{{ typeLabel(letter.type) }}</span>
          </div>
        </div>
        <div class="header-title-row">
          <h1 class="contract-title">{{ letterTitle }}</h1>
          <div class="header-actions-row">
            <button class="delete-contract-btn" @click="showConfirm('Вы уверены, что хотите удалить письмо? Это действие необратимо.', confirmDelete, true)">
              <i class="fas fa-trash-alt"></i> Удалить
            </button>
          </div>
        </div>
      </div>

      <!-- ── Tabs ── -->
      <div class="tabs-bar">
        <button v-for="tab in tabs" :key="tab.key"
          class="tab-btn" :class="{ active: activeTab === tab.key }"
          @click="setTab(tab.key)">{{ tab.label }}</button>
      </div>

      <!-- ── Status bar ── -->
      <div class="status-actions-bar">
        <button v-if="!hasStatus('prepared')" class="status-action-btn status-action-btn--sign"
          :disabled="statusLoading === 'prepared'"
          @click="showConfirm('Отметить письмо как подготовленное?', () => addStatus('prepared'))">
          <i class="fas fa-file-alt"></i> Подготовлен
        </button>
        <button v-else class="status-action-btn status-action-btn--undo"
          :disabled="statusLoading === 'prepared'"
          @click="showConfirm('Отменить статус «Подготовлен»?', () => removeStatus('prepared'), true)">
          <i class="fas fa-times"></i> Отменить подготовку
        </button>

        <template v-if="hasStatus('prepared')">
          <button v-if="!hasStatus('signed')" class="status-action-btn status-action-btn--sign"
            :disabled="statusLoading === 'signed'"
            @click="showConfirm('Отметить письмо как подписанное?', () => addStatus('signed'))">
            <i class="fas fa-pen-nib"></i> Подписан
          </button>
          <button v-else class="status-action-btn status-action-btn--undo"
            :disabled="statusLoading === 'signed'"
            @click="showConfirm('Отменить статус «Подписан»?', () => removeStatus('signed'), true)">
            <i class="fas fa-times"></i> Отменить подписание
          </button>
        </template>

        <template v-if="hasStatus('signed')">
          <button v-if="!hasStatus('sent')" class="status-action-btn status-action-btn--verify"
            :disabled="statusLoading === 'sent'"
            @click="showConfirm('Отметить письмо как отправленное?', () => addStatus('sent'))">
            <i class="fas fa-paper-plane"></i> Отправлен
          </button>
          <button v-else class="status-action-btn status-action-btn--undo"
            :disabled="statusLoading === 'sent'"
            @click="showConfirm('Отменить статус «Отправлен»?', () => removeStatus('sent'), true)">
            <i class="fas fa-times"></i> Отменить отправку
          </button>
        </template>
      </div>

      <!-- ══════════════════════════════════════════════════
           TAB: Основная информация
      ══════════════════════════════════════════════════ -->
      <div v-if="activeTab === 'main'" class="main-content">

        <section class="info-section">
          <div class="section-heading"><i class="fas fa-handshake"></i> Стороны</div>
          <div class="cards-row">
            <div class="party-card">
              <div class="party-role">От кого</div>
              <div class="party-name">{{ letter.from_to_name || '—' }}</div>
            </div>
            <div class="party-card">
              <div class="party-role">Кому</div>
              <div class="party-name">{{ letter.where_to_name || '—' }}</div>
            </div>
          </div>
        </section>

        <section class="info-section">
          <div class="section-heading"><i class="fas fa-file-alt"></i> Реквизиты письма</div>
          <div class="fields-grid">
            <div class="field-item">
              <div class="field-key">Внутренний №</div>
              <div class="field-val mono">{{ letter.internal_num || '—' }}</div>
            </div>
            <div class="field-item">
              <div class="field-key">Номер письма</div>
              <div class="field-val mono">{{ letter.num || '—' }}</div>
            </div>
            <div class="field-item">
              <div class="field-key">Тип</div>
              <div class="field-val">
                <span class="type-badge" :class="`type-badge--${letter.type}`">{{ typeLabel(letter.type) }}</span>
              </div>
            </div>
            <div class="field-item">
              <div class="field-key">Дата создания</div>
              <div class="field-val">{{ formatDate(letter.created_at) }}</div>
            </div>
          </div>
        </section>

        <section class="info-section">
          <div class="section-heading"><i class="fas fa-building"></i> Объекты</div>
          <div v-if="letter.objects?.length" class="tags-list">
            <div v-for="obj in letter.objects" :key="obj.id" class="object-row">
              <i class="fas fa-map-marker-alt"></i>
              <span>{{ obj.object_name }}</span>
            </div>
          </div>
          <div v-else class="empty-hint">Объекты не указаны</div>
        </section>

        <section v-if="executor || coExecutors.length || observers.length" class="info-section">
          <div class="section-heading"><i class="fas fa-users"></i> Ответственные лица</div>
          <div class="persons-grid">
            <div v-if="executor">
              <div class="persons-col-label">Ответственный</div>
              <div class="person-row">
                <div class="person-avatar">{{ avatarLetter(executor) }}</div>
                <div>
                  <div class="person-name">{{ executor.short_fio }}</div>
                  <div class="person-role">Ответственный</div>
                </div>
              </div>
            </div>
            <div v-if="coExecutors.length">
              <div class="persons-col-label">Исполнители</div>
              <div v-for="u in coExecutors" :key="u.id" class="person-row">
                <div class="person-avatar person-avatar--co">{{ avatarLetter(u) }}</div>
                <div>
                  <div class="person-name">{{ u.short_fio }}</div>
                  <div class="person-role">Исполнитель</div>
                </div>
              </div>
            </div>
            <div v-if="observers.length">
              <div class="persons-col-label">Наблюдатели</div>
              <div v-for="u in observers" :key="u.id" class="person-row">
                <div class="person-avatar person-avatar--obs">{{ avatarLetter(u) }}</div>
                <div>
                  <div class="person-name">{{ u.short_fio }}</div>
                  <div class="person-role">Наблюдатель</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="info-section">
          <div class="section-heading"><i class="fas fa-comment-alt"></i> Примечание</div>
          <div v-if="letter.comment" class="comment-box">{{ letter.comment }}</div>
          <div v-else class="empty-hint">Не указано</div>
        </section>

        <section class="info-section info-section--sys">
          <div class="section-heading"><i class="fas fa-info-circle"></i> Системная информация</div>
          <div class="fields-grid">
            <div class="field-item">
              <div class="field-key">Создан</div>
              <div class="field-val">{{ formatDateTime(letter.created_at) }}</div>
            </div>
            <div class="field-item">
              <div class="field-key">Создатель</div>
              <div class="field-val">{{ letter.created_by_user?.short_fio || '—' }}</div>
            </div>
          </div>
        </section>
      </div>

      <!-- ══════════════════════════════════════════════════
           TAB: Файлы
      ══════════════════════════════════════════════════ -->
      <div v-else-if="activeTab === 'docs'" class="docs-wrap"
        @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop">

        <div v-if="dropActive" class="drop-overlay">
          <div class="drop-overlay-inner">
            <i class="fas fa-cloud-upload-alt"></i>
            <span>Отпустите файлы для загрузки{{ currentFolder ? ` в «${currentFolder.name}»` : '' }}</span>
          </div>
        </div>

        <div class="docs-upload-section">
          <div class="docs-section-title">Загрузить документы</div>
          <div class="upload-cards">
            <div v-for="type in UPLOAD_TYPES" :key="type.key" class="upload-card">
              <input type="file" multiple style="display:none"
                :ref="el => { if (el) fileInputs[type.key] = el }"
                @change="e => uploadFiles(type.key, e.target.files)" />
              <div class="upload-card-icon"><i class="fas" :class="type.icon"></i></div>
              <div class="upload-card-label">{{ type.label }}</div>
              <div class="upload-card-hint">
                {{ type.folderName ? `Папка «${type.folderName}»` : (currentFolder ? `В «${currentFolder.name}»` : 'Без папки') }}
              </div>
              <button v-if="!uploadState[type.key]?.loading && !uploadState[type.key]?.done && !uploadState[type.key]?.error"
                class="upload-btn" @click="triggerUpload(type.key)">
                <i class="fas fa-upload"></i> Выбрать файлы
              </button>
              <div v-else-if="uploadState[type.key]?.loading" class="upload-status upload-status--loading">
                <div class="mini-spinner"></div> Загрузка...
              </div>
              <div v-else-if="uploadState[type.key]?.done" class="upload-status upload-status--done">
                <i class="fas fa-check-circle"></i> Загружено
              </div>
              <div v-else-if="uploadState[type.key]?.error" class="upload-status upload-status--error">
                <i class="fas fa-exclamation-circle"></i> {{ uploadState[type.key].error }}
                <button class="retry-btn" @click="triggerUpload(type.key)">Повторить</button>
              </div>
            </div>
          </div>
        </div>

        <div class="docs-browser-section">
          <div class="docs-browser-header">
            <div class="docs-section-title" style="margin-bottom:0">Файлы письма</div>
            <button class="create-folder-btn" @click="createFolderModal.show = true">
              <i class="fas fa-folder-plus"></i> Создать папку
            </button>
          </div>

          <div v-if="treeLoading" class="state-msg"><div class="mini-spinner"></div> Загрузка...</div>
          <div v-else-if="treeError" class="state-msg state-error">{{ treeError }}</div>
          <div v-else class="browser">
            <div class="breadcrumb">
              <span class="bc-item bc-item--root" @click="goToRoot">
                <i class="fas fa-home"></i> Корень
              </span>
              <template v-for="(crumb, idx) in breadcrumb" :key="crumb.id">
                <span class="bc-sep"><i class="fas fa-chevron-right"></i></span>
                <span class="bc-item" :class="{ 'bc-item--active': idx === breadcrumb.length - 1 }"
                  @click="goToBreadcrumb(idx)">{{ crumb.name }}</span>
              </template>
            </div>

            <div class="browser-list">
              <div v-for="folder in currentItems.folders" :key="folder.id"
                class="browser-row browser-row--folder" @click="openFolder(folder)">
                <i class="fas fa-folder browser-row-icon" style="color:#f59e0b"></i>
                <div class="browser-row-name">{{ folder.name }}</div>
                <div class="browser-row-meta">{{ (folder.children?.length || 0) + (folder.files?.length || 0) }} элем.</div>
                <div class="browser-row-actions">
                  <button class="file-action-btn" title="Переименовать" @click.stop="openRenameFolder(folder)">
                    <i class="fas fa-pencil-alt"></i>
                  </button>
                  <button class="file-action-btn file-action-btn--danger" title="Удалить" @click.stop="openDeleteFolder(folder)">
                    <i class="fas fa-trash"></i>
                  </button>
                </div>
                <i class="fas fa-chevron-right browser-row-arrow"></i>
              </div>

              <div v-for="file in currentItems.files" :key="file.id" class="browser-row browser-row--file">
                <i class="fas browser-row-icon" :class="fileIcon(file.extension)" :style="{ color: fileColor(file.extension) }"></i>
                <div class="browser-row-name browser-row-name--link" @click.stop="openPreview(file)">{{ file.original_name }}</div>
                <span v-if="file.type === 'original'" class="file-type-badge file-type-badge--original">Оригинал</span>
                <span v-else-if="file.type === 'version'" class="file-type-badge file-type-badge--version">Версия</span>
                <div class="browser-row-meta">{{ formatDateTime(file.uploaded_at) }}</div>
                <div class="browser-row-actions">
                  <button class="file-action-btn" title="Скачать" @click.stop="downloadFile(file)">
                    <i class="fas fa-download"></i>
                  </button>
                  <button class="file-action-btn" title="Переименовать" @click.stop="openRenameFile(file)">
                    <i class="fas fa-pencil-alt"></i>
                  </button>
                  <button class="file-action-btn file-action-btn--danger" title="Удалить" @click.stop="openDeleteFile(file)">
                    <i class="fas fa-trash"></i>
                  </button>
                </div>
              </div>

              <div v-if="!tree.length" class="browser-empty">
                <i class="fas fa-folder-open"></i> Файлы ещё не загружены
              </div>
              <div v-else-if="!currentItems.folders.length && !currentItems.files.length" class="browser-empty">
                <i class="fas fa-folder-open"></i> Папка пуста
              </div>
            </div>

            <div v-if="dropUploading" class="drop-uploading">
              <div class="mini-spinner"></div> Загрузка файлов...
            </div>
          </div>
        </div>

        <!-- Preview fullscreen -->
        <div v-if="preview.show" class="preview-backdrop" @keyup.esc="closePreview" tabindex="-1">
          <div class="preview-header">
            <div class="preview-title">
              <i class="fas" :class="fileIcon(preview.file?.extension)" :style="{ color: fileColor(preview.file?.extension) }"></i>
              {{ preview.file?.original_name }}
            </div>
            <div class="preview-header-actions">
              <button class="preview-action-btn" title="Скачать" @click="downloadFile(preview.file)">
                <i class="fas fa-download"></i>
              </button>
              <button class="preview-close-btn" @click="closePreview">
                <i class="fas fa-times"></i>
              </button>
            </div>
          </div>
          <div class="preview-body">
            <div v-if="preview.loading" class="preview-state">
              <div class="spinner"></div><span>Загрузка...</span>
            </div>
            <div v-else-if="preview.error" class="preview-state preview-state--error">
              <i class="fas fa-exclamation-circle"></i> {{ preview.error }}
            </div>
            <embed v-else-if="['pdf','docx','doc','xlsx','xls'].includes(preview.file?.extension?.toLowerCase()) && preview.blobUrl"
              :src="preview.blobUrl" type="application/pdf" class="preview-embed" />
            <div v-else-if="previewType(preview.file?.extension) === 'image'" class="preview-image-wrap">
              <img :src="preview.blobUrl" class="preview-image" :alt="preview.file?.original_name" />
            </div>
            <div v-else class="preview-state preview-state--unsupported">
              <i class="fas fa-file-alt preview-state-icon"></i>
              <div class="preview-state-title">Предпросмотр недоступен</div>
              <button class="upload-btn" style="margin-top:8px" @click="downloadFile(preview.file)">
                <i class="fas fa-download"></i> Скачать файл
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- ══════════════════════════════════════════════════
           TAB: Просмотр письма
      ══════════════════════════════════════════════════ -->
      <div v-else-if="activeTab === 'viewer'" class="viewer-layout">

        <!-- Left: letter info -->
        <div class="viewer-left">
          <div class="viewer-info-title">Информация о письме</div>

          <div class="viewer-info-block">
            <div class="viewer-info-label">Внутренний номер</div>
            <div class="viewer-info-val mono">{{ letter.internal_num || '—' }}</div>
          </div>
          <div class="viewer-info-block">
            <div class="viewer-info-label">Номер письма</div>
            <div class="viewer-info-val mono">{{ letter.num || '—' }}</div>
          </div>
          <div class="viewer-info-block">
            <div class="viewer-info-label">Тема</div>
            <div class="viewer-info-val">{{ letter.name || '—' }}</div>
          </div>
          <div class="viewer-info-block">
            <div class="viewer-info-label">Тип</div>
            <div class="viewer-info-val">
              <span class="type-badge" :class="`type-badge--${letter.type}`">{{ typeLabel(letter.type) }}</span>
            </div>
          </div>

          <div class="viewer-info-divider"></div>

          <div class="viewer-info-block">
            <div class="viewer-info-label">От кого</div>
            <div class="viewer-info-val">{{ letter.from_to_name || '—' }}</div>
          </div>
          <div class="viewer-info-block">
            <div class="viewer-info-label">Кому</div>
            <div class="viewer-info-val">{{ letter.where_to_name || '—' }}</div>
          </div>

          <div class="viewer-info-divider"></div>

          <div class="viewer-info-block">
            <div class="viewer-info-label">Ответственный</div>
            <div class="viewer-info-val">{{ executor?.short_fio || '—' }}</div>
          </div>

          <div class="viewer-info-divider"></div>

          <div class="viewer-info-block">
            <div class="viewer-info-label">Кем создано</div>
            <div class="viewer-info-val">{{ letter.created_by_user?.short_fio || '—' }}</div>
          </div>
          <div class="viewer-info-block">
            <div class="viewer-info-label">Дата создания</div>
            <div class="viewer-info-val">{{ formatDateTime(letter.created_at) }}</div>
          </div>
        </div>

        <!-- Center: preview -->
        <div class="viewer-center">
          <div v-if="viewerLoading" class="viewer-state">
            <div class="spinner"></div> Загрузка файлов...
          </div>
          <div v-else-if="viewerError" class="viewer-state viewer-state--error">
            <i class="fas fa-exclamation-circle"></i> {{ viewerError }}
          </div>
          <div v-else-if="!viewerFiles.length" class="viewer-state">
            <i class="fas fa-envelope" style="font-size:48px;color:#e2e8f0;margin-bottom:12px"></i>
            <div style="color:#94a3b8">Файлы письма не найдены</div>
          </div>
          <template v-else>
            <div v-if="viewerPreviewLoad" class="viewer-state">
              <div class="spinner"></div> Загрузка превью...
            </div>
            <embed v-else-if="viewerBlobUrl && viewerPreviewType(viewerActiveFile?.extension) === 'pdf'"
              :src="viewerBlobUrl" type="application/pdf" class="viewer-embed" />
            <div v-else-if="viewerBlobUrl && viewerPreviewType(viewerActiveFile?.extension) === 'image'"
              class="viewer-image-wrap">
              <img :src="viewerBlobUrl" class="preview-image" />
            </div>
            <div v-else-if="!viewerBlobUrl && !viewerPreviewLoad" class="viewer-state">
              <i class="fas fa-eye-slash" style="font-size:36px;color:#e2e8f0;margin-bottom:12px"></i>
              <div style="color:#94a3b8">Предпросмотр недоступен</div>
            </div>
          </template>
        </div>

        <!-- Right: files timeline -->
        <div class="viewer-right">
          <div class="viewer-right-tabs">
            <button class="viewer-right-tab" :class="{ active: viewerRightTab === 'files' }"
              @click="viewerRightTab = 'files'">Файлы</button>
            <button class="viewer-right-tab" :class="{ active: viewerRightTab === 'links' }"
              @click="viewerRightTab = 'links'">Связи</button>
          </div>

          <DocumentLinksPanel
            v-if="viewerRightTab === 'links'"
            :owner-id="route.params.id"
            owner-type="letter"
            :file-icon="fileIcon"
            :file-color="fileColor"
            @open-file="selectViewerFile"
          />

          <div v-else class="viewer-file-list">
            <div class="viewer-upload-bar">
              <input type="file" multiple style="display:none" ref="viewerInputOriginal"
                @change="e => viewerUpload('original', e.target.files)" />
              <input type="file" multiple style="display:none" ref="viewerInputVersion"
                @change="e => viewerUpload('version', e.target.files)" />
              <button class="viewer-upload-btn viewer-upload-btn--original"
                :disabled="viewerUploadState.loading"
                @click="viewerInputOriginal.click()">
                <i class="fas fa-stamp"></i> Оригинал
              </button>
              <button class="viewer-upload-btn viewer-upload-btn--version"
                :disabled="viewerUploadState.loading"
                @click="viewerInputVersion.click()">
                <i class="fas fa-envelope"></i> Версия
              </button>
            </div>
            <div v-if="viewerUploadState.loading" class="viewer-file-loading">
              <div class="mini-spinner"></div> Загрузка файла...
            </div>
            <div v-else-if="viewerUploadState.error" class="viewer-upload-error">
              <i class="fas fa-exclamation-circle"></i> {{ viewerUploadState.error }}
            </div>

            <div v-if="viewerLoading" class="viewer-file-loading">
              <div class="mini-spinner"></div> Загрузка...
            </div>
            <div v-else-if="!viewerFiles.length" class="viewer-file-empty">
              Файлы не найдены
            </div>
            <div v-else class="viewer-timeline">
              <div v-for="(file, idx) in viewerFiles" :key="file.id"
                class="viewer-timeline-item"
                :class="{ active: viewerActiveFile?.id === file.id }"
                @click="selectViewerFile(file)">
                <div class="vtl-connector">
                  <div class="vtl-dot" :class="{ 'vtl-dot--active': viewerActiveFile?.id === file.id }"></div>
                  <div v-if="idx < viewerFiles.length - 1" class="vtl-line"></div>
                </div>
                <div class="vtl-card">
                  <div class="vtl-card-top">
                    <i class="fas" :class="fileIcon(file.extension)" :style="{ color: fileColor(file.extension) }"></i>
                    <span class="vtl-name">{{ file.original_name }}</span>
                  </div>
                  <div class="vtl-meta">
                    <span class="vtl-date">{{ formatDateTime(file.uploaded_at) }}</span>
                    <span v-if="file.type === 'original'" class="file-type-badge file-type-badge--original">Оригинал</span>
                    <span v-else-if="file.type === 'version'" class="file-type-badge file-type-badge--version">Версия</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ══════════════════════════════════════════════════
           TAB: Конструктор
      ══════════════════════════════════════════════════ -->
      <div v-else-if="activeTab === 'constructor'" class="constructor-wrap">
        <div class="constructor-hint">
          <i class="fas fa-info-circle"></i>
          <span v-if="editorMode === 'onlyoffice'">Документ сохраняется автоматически. Чтобы зафиксировать версию — просто перейдите на другую вкладку.</span>
          <span v-else>Встроенный редактор. Нажмите «Сохранить версию» чтобы зафиксировать изменения.</span>
          <div class="editor-mode-toggle">
            <button class="editor-mode-btn" :class="{ active: editorMode === 'onlyoffice' }"
              @click="switchEditorMode('onlyoffice')">
              <i class="fas fa-file-word"></i> OnlyOffice
            </button>
            <button class="editor-mode-btn" :class="{ active: editorMode === 'custom' }"
              @click="switchEditorMode('custom')">
              <i class="fas fa-pen-nib"></i> Свой редактор
            </button>
          </div>
        </div>

        <!-- Свой редактор -->
        <Suspense v-if="editorMode === 'custom'">
          <LetterEditor
            :letter="letter"
            :letter-id="route.params.id"
            :mistral-key="'bvTwJKJ7WBYii13zp1OVqU7uNwetQwpW'"
            @version-saved="loadConstructorVersions"
            style="flex:1;min-height:0;display:flex;flex-direction:column"
          />
          <template #fallback>
            <div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--text-tertiary)">
              <div class="mini-spinner"></div>&nbsp; Загрузка редактора...
            </div>
          </template>
        </Suspense>

        <div v-else class="constructor-body">

          <!-- AI панель -->
          <div class="ai-panel" :class="{ 'ai-panel--collapsed': !aiPanelOpen }">
            <div class="ai-panel-header" @click="aiPanelOpen = !aiPanelOpen">
              <div class="ai-panel-title">
                <i class="fas fa-robot"></i> AI помощник
              </div>
              <i class="fas" :class="aiPanelOpen ? 'fa-chevron-right' : 'fa-chevron-left'"></i>
            </div>

            <div v-if="aiPanelOpen" class="ai-panel-body">
              <!-- Скроллируемая часть -->
              <div class="ai-scroll-area">
                <div class="ai-context-block">
                  <div class="ai-context-label">Контекст письма</div>
                  <div class="ai-context-row"><span>Тема:</span> {{ letter.name || '—' }}</div>
                  <div class="ai-context-row"><span>От кого:</span> {{ letter.from_to_name || '—' }}</div>
                  <div class="ai-context-row"><span>Кому:</span> {{ letter.where_to_name || '—' }}</div>
                </div>

                <div class="ai-input-label">Что написать?</div>
                <textarea
                  class="ai-textarea"
                  v-model="aiPrompt"
                  placeholder="Например: напиши вежливый отказ на запрос о предоставлении документов"
                  @keydown.ctrl.enter="askAI"
                ></textarea>
                <div class="ai-input-hint">Ctrl+Enter — отправить</div>

                <div v-if="aiError" class="ai-error">
                  <i class="fas fa-exclamation-circle"></i> {{ aiError }}
                </div>

                <div v-if="aiResult" class="ai-result">
                  <div class="ai-result-header">
                    <div class="ai-result-label">Результат</div>
                    <div class="ai-result-actions">
                      <button class="ai-result-btn" title="Копировать" @click="copyAiResult">
                        <i class="fas fa-copy"></i>
                      </button>
                    </div>
                  </div>
                  <div class="ai-result-text">{{ aiResult }}</div>
                </div>
              </div>

              <!-- Зафиксированные кнопки внизу -->
              <div class="ai-panel-footer">
                <button class="ai-send-btn" :disabled="aiLoading || !aiPrompt.trim()" @click="askAI">
                  <div v-if="aiLoading" class="mini-spinner" style="border-top-color:#fff"></div>
                  <i v-else class="fas fa-paper-plane"></i>
                  {{ aiLoading ? 'Генерирую...' : 'Сгенерировать' }}
                </button>
                <button v-if="aiResult" class="ai-insert-btn" @click="insertToEditor">
                  <i class="fas" :class="(aiInserted || aiCopied) ? 'fa-check' : 'fa-file-import'"></i>
                  {{ aiInserted ? 'Вставлено!' : aiCopied ? 'Скопировано — нажмите Ctrl+V' : 'Вставить в документ' }}
                </button>
              </div>
            </div>
          </div>

          <!-- Редактор -->
          <div class="constructor-editor-wrap">
            <!-- Панель управления над редактором -->
            <div class="oo-toolbar">
              <div class="oo-user-info" v-if="currentUser">
                <div class="oo-user-avatar">
                  {{ currentUser.surname?.[0] }}{{ currentUser.name?.[0] }}
                </div>
                <span class="oo-user-name">
                  {{ [currentUser.surname, currentUser.name, currentUser.patronymic].filter(Boolean).join(' ') || currentUser.username }}
                </span>
              </div>
              <div class="oo-toolbar-spacer"></div>
              <div class="oo-save-status" :class="`oo-save-status--${ooSaveStatus}`">
                <template v-if="ooSaveStatus === 'saving'">
                  <div class="mini-spinner"></div> Сохранение...
                </template>
                <template v-else-if="ooSaveStatus === 'saved'">
                  <i class="fas fa-check-circle"></i> Версия сохранена
                </template>
                <template v-else-if="ooSaveStatus === 'error'">
                  <i class="fas fa-exclamation-circle"></i> Ошибка сохранения
                </template>
              </div>
              <button class="oo-save-btn" :disabled="!editorReady || ooSaveStatus === 'saving'" @click="ooSaveVersion" title="Сохранить текущее состояние как версию">
                <div v-if="ooSaveStatus === 'saving'" class="mini-spinner" style="border-top-color:#fff"></div>
                <i v-else class="fas fa-save"></i>
                Сохранить версию
              </button>
            </div>

            <div v-if="editorLoading" class="constructor-state">
              <div class="spinner"></div>
              <span>Загрузка редактора...</span>
            </div>
            <div v-else-if="editorError" class="constructor-state constructor-state--error">
              <i class="fas fa-exclamation-circle" style="font-size:32px;margin-bottom:10px"></i>
              <div>{{ editorError }}</div>
              <button class="upload-btn" style="margin-top:14px" @click="initEditor">
                <i class="fas fa-redo"></i> Повторить
              </button>
            </div>
            <div id="onlyoffice-editor" class="onlyoffice-editor"></div>
          </div>

          <!-- Версии -->
          <div class="cv-panel">
            <div class="cv-panel-header">
              <i class="fas fa-history"></i> Версии
              <button class="cv-refresh-btn" @click="loadConstructorVersions" title="Обновить">
                <i class="fas fa-sync-alt" :class="{ 'fa-spin': constructorVersionsLoading }"></i>
              </button>
            </div>
            <div class="cv-list">
              <div v-if="constructorVersionsLoading" class="cv-empty">
                <div class="mini-spinner"></div>
              </div>
              <div v-else-if="!constructorVersions.length" class="cv-empty">
                <i class="fas fa-clock" style="font-size:24px;color:var(--border-light);margin-bottom:6px"></i>
                <span>Версий пока нет</span>
              </div>
              <div v-else class="cv-items">
                <div v-for="(file, idx) in constructorVersions" :key="file.id"
                  class="cv-item" :class="{ 'cv-item--active': constructorActiveVersion?.id === file.id }"
                  @click="selectConstructorVersion(file)">
                  <div class="cv-item-top">
                    <span class="cv-version-num">v{{ constructorVersions.length - idx }}</span>
                    <span v-if="idx === 0" class="cv-badge cv-badge--latest">Новая</span>
                    <span v-if="file.type === 'original'" class="cv-badge cv-badge--original">Оригинал</span>
                  </div>
                  <div class="cv-item-date">
                    <i class="fas fa-calendar-alt"></i> {{ formatDateTime(file.uploaded_at) }}
                  </div>
                  <div v-if="file.uploaded_by_user" class="cv-item-author">
                    <div class="cv-avatar">{{ file.uploaded_by_user?.name?.[0] }}{{ file.uploaded_by_user?.surname?.[0] }}</div>
                    {{ file.uploaded_by_user?.short_fio }}
                  </div>
                  <div class="cv-item-name">{{ file.original_name }}</div>
                </div>
              </div>
            </div>
          </div>

        </div><!-- /constructor-body (onlyoffice) -->
      </div><!-- /constructor-wrap -->

      <!-- ══════════════════════════════════════════════════
           TAB: История действий
      ══════════════════════════════════════════════════ -->
      <div v-else-if="activeTab === 'history'" class="history-wrap">
        <div v-if="logsLoading" class="state-full"><div class="spinner"></div> Загрузка...</div>
        <div v-else-if="logsError" class="state-full state-error"><i class="fas fa-exclamation-circle"></i> {{ logsError }}</div>
        <template v-else>
          <div class="log-filters">
            <div class="log-filter-search">
              <i class="fas fa-search log-filter-search-icon"></i>
              <input class="log-filter-input" v-model="filterText" placeholder="Поиск по тексту..." />
              <button v-if="filterText" class="log-filter-clear-x" @click="filterText=''">
                <i class="fas fa-times"></i>
              </button>
            </div>
            <div class="log-filter-user-wrap">
              <div class="log-filter-user-input-row" :class="{ focused: filterUserOpen }">
                <i class="fas fa-user log-filter-user-icon"></i>
                <input class="log-filter-user-input" v-model="filterUserQ" placeholder="Пользователь..."
                  @focus="filterUserOpen = true"
                  @blur="setTimeout(() => filterUserOpen = false, 160)"
                  @input="filterUser = ''" />
                <button v-if="filterUser || filterUserQ" class="log-filter-clear-x" @mousedown.prevent="clearLogUser">
                  <i class="fas fa-times"></i>
                </button>
              </div>
              <div v-if="filterUserOpen" class="log-filter-user-drop">
                <div class="ac-item" @mousedown.prevent="selectLogUser(null)">
                  <span style="color:var(--text-tertiary)">Все пользователи</span>
                </div>
                <div v-for="u in filteredLogUsers" :key="u.id"
                  class="ac-item" :class="{ 'ac-item--sel': filterUser === String(u.id) }"
                  @mousedown.prevent="selectLogUser(u)">
                  <div class="log-user-avatar" style="width:22px;height:22px;font-size:9px;flex-shrink:0">
                    {{ u.name?.[0] }}{{ u.surname?.[0] }}
                  </div>
                  {{ u.short_fio || `${u.surname} ${u.name}` }}
                </div>
                <div v-if="!filteredLogUsers.length" class="ac-empty">Не найдено</div>
              </div>
            </div>
            <input type="date" class="log-filter-date" v-model="filterDateFrom" :max="filterDateTo || undefined" title="Дата с" />
            <span class="log-filter-date-sep">—</span>
            <input type="date" class="log-filter-date" v-model="filterDateTo" :min="filterDateFrom || undefined" title="Дата по" />
            <button v-if="filtersActive" class="log-filter-reset" @click="clearFilters">
              <i class="fas fa-times"></i> Сбросить
            </button>
          </div>

          <div class="log-type-chips">
            <button v-for="lt in LOG_TYPES" :key="lt.key"
              class="log-type-chip"
              :class="{ active: filterTypes.includes(lt.key) }"
              :style="filterTypes.includes(lt.key) ? { background: lt.color + '18', borderColor: lt.color, color: lt.color } : {}"
              @click="toggleFilterType(lt.key)">
              <i class="fas" :class="lt.icon"></i> {{ lt.label }}
            </button>
          </div>

          <div v-if="!logs.length" class="tab-empty">
            <i class="fas fa-history tab-empty-icon"></i>
            <p class="tab-empty-title">История пуста</p>
            <p class="tab-empty-sub">Действия по письму появятся здесь</p>
          </div>
          <div v-else-if="!logsFiltered.length" class="log-no-results">
            <i class="fas fa-filter"></i>
            <span>Ничего не найдено. <button class="log-no-results-reset" @click="clearFilters">Сбросить фильтры</button></span>
          </div>
          <div v-else>
            <div class="log-results-meta" v-if="filtersActive">
              Найдено: <strong>{{ logsFiltered.length }}</strong> из {{ logs.length }}
            </div>
            <div class="log-timeline">
              <template v-for="(item, idx) in logsGrouped" :key="idx">
                <div v-if="item.type === 'day'" class="log-day-sep">
                  <span class="log-day-label">{{ item.label }}</span>
                </div>
                <div v-else class="log-entry">
                  <div class="log-action-icon"
                    :style="{ background: logIcon(item.log.full_log || item.log.message).color + '18', color: logIcon(item.log.full_log || item.log.message).color }">
                    <i class="fas" :class="logIcon(item.log.full_log || item.log.message).icon"></i>
                  </div>
                  <div class="log-content">
                    <div class="log-content-top">
                      <div class="log-message-text">{{ item.log.full_log || item.log.message }}</div>
                      <div class="log-time-badge">{{ formatDateTime(item.log.created_at) }}</div>
                    </div>
                    <div class="log-author-row">
                      <div class="log-user-avatar">
                        {{ item.log.created_by_user?.name?.[0] }}{{ item.log.created_by_user?.surname?.[0] }}
                      </div>
                      <span class="log-author-name">{{ item.log.created_by_user?.short_fio || '—' }}</span>
                    </div>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </template>
      </div>

    </template>

    <!-- ── Modal: Rename ── -->
    <div v-if="renameModal.show" class="modal-backdrop" @click.self="renameModal.show = false">
      <div class="modal-box">
        <div class="modal-title">{{ renameModal.type === 'file' ? 'Переименовать файл' : 'Переименовать папку' }}</div>
        <input class="modal-input" v-model="renameModal.name"
          @keyup.enter="submitRename" @keyup.esc="renameModal.show = false" autofocus />
        <div class="modal-actions">
          <button class="modal-btn modal-btn--cancel" @click="renameModal.show = false">Отмена</button>
          <button class="modal-btn modal-btn--ok" :disabled="renameModal.loading" @click="submitRename">
            <div v-if="renameModal.loading" class="mini-spinner"></div>
            <span v-else>Сохранить</span>
          </button>
        </div>
      </div>
    </div>

    <!-- ── Modal: Delete file/folder ── -->
    <div v-if="deleteModal.show" class="modal-backdrop" @click.self="deleteModal.show = false">
      <div class="modal-box">
        <div class="modal-title modal-title--danger">{{ deleteModal.type === 'file' ? 'Удалить файл?' : 'Удалить папку?' }}</div>
        <div class="modal-body">
          Вы уверены, что хотите удалить <strong>«{{ deleteModal.name }}»</strong>?
          <span v-if="deleteModal.type === 'folder'"> Все вложенные файлы будут удалены.</span>
        </div>
        <div class="modal-actions">
          <button class="modal-btn modal-btn--cancel" @click="deleteModal.show = false">Отмена</button>
          <button class="modal-btn modal-btn--danger" :disabled="deleteModal.loading" @click="submitDelete">
            <div v-if="deleteModal.loading" class="mini-spinner"></div>
            <span v-else>Удалить</span>
          </button>
        </div>
      </div>
    </div>

    <!-- ── Modal: Create folder ── -->
    <div v-if="createFolderModal.show" class="modal-backdrop" @click.self="createFolderModal.show = false">
      <div class="modal-box">
        <div class="modal-title">Новая папка</div>
        <input class="modal-input" v-model="createFolderModal.name" placeholder="Название папки"
          @keyup.enter="submitCreateFolder" autofocus />
        <div class="modal-actions">
          <button class="modal-btn modal-btn--cancel" @click="createFolderModal.show = false">Отмена</button>
          <button class="modal-btn modal-btn--ok" :disabled="createFolderModal.loading" @click="submitCreateFolder">
            <div v-if="createFolderModal.loading" class="mini-spinner"></div>
            <span v-else>Создать</span>
          </button>
        </div>
      </div>
    </div>

    <!-- ── Modal: Confirm ── -->
    <div v-if="confirmModal.show" class="modal-backdrop" @click.self="confirmModal.show = false">
      <div class="modal-box">
        <div class="modal-body" style="font-size:15px;padding-top:4px">{{ confirmModal.text }}</div>
        <div class="modal-actions">
          <button class="modal-btn modal-btn--cancel" :disabled="confirmModal.loading" @click="confirmModal.show = false">Отмена</button>
          <button :class="['modal-btn', confirmModal.danger ? 'modal-btn--danger' : 'modal-btn--ok']"
            :disabled="confirmModal.loading" @click="doConfirm">
            <div v-if="confirmModal.loading" class="mini-spinner"></div>
            <span v-else>Подтвердить</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Модальное окно: сохранить перед выходом из конструктора? -->
    <div v-if="leaveModal.show" class="modal-backdrop">
      <div class="modal-box leave-modal">
        <div class="leave-modal-icon"><i class="fas fa-file-alt"></i></div>
        <div class="leave-modal-title">Сохранить версию?</div>
        <div class="leave-modal-body">
          Вы уходите из конструктора. Хотите сохранить текущее состояние документа как новую версию?
        </div>
        <div class="modal-actions">
          <button class="modal-btn modal-btn--cancel" @click="leaveWithoutSave">
            Не сохранять
          </button>
          <button class="modal-btn modal-btn--ok leave-modal-save" @click="leaveAndSave"
            :disabled="ooSaveStatus === 'saving'">
            <div v-if="ooSaveStatus === 'saving'" class="mini-spinner" style="border-top-color:#fff"></div>
            <i v-else class="fas fa-save"></i>
            Сохранить и выйти
          </button>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.page-wrap { display: flex; flex-direction: column; height: 100vh; overflow: hidden; background: var(--bg-page); }

/* ── States ── */
.state-full { flex: 1; display: flex; align-items: center; justify-content: center; gap: 10px; font-size: 15px; color: var(--text-secondary); }
.state-error { color: #ef4444; }
.spinner { width: 20px; height: 20px; border: 2px solid var(--border-light); border-top-color: var(--brand-primary); border-radius: 50%; animation: spin 0.7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Header ── */
.contract-header { background: var(--bg-surface); border-bottom: 1px solid var(--border-light); padding: 16px 32px 18px; flex-shrink: 0; }
.header-top { display: flex; align-items: center; gap: 16px; margin-bottom: 10px; }
.back-btn { display: inline-flex; align-items: center; gap: 6px; border: none; background: transparent; color: var(--text-tertiary); font-size: 12px; cursor: pointer; padding: 0; flex-shrink: 0; }
.back-btn:hover { color: var(--brand-primary); }
.header-meta { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-secondary); flex-wrap: wrap; }
.meta-sep  { color: var(--text-tertiary); }
.meta-num  { font-family: 'JetBrains Mono', monospace; font-weight: 600; }
.meta-date { color: var(--text-tertiary); }
.header-title-row { display: flex; align-items: flex-start; gap: 12px; }
.contract-title { flex: 1; margin: 0; font-size: 20px; font-weight: 700; color: var(--text-primary); line-height: 1.35; }
.header-actions-row { display: flex; gap: 8px; align-items: center; flex-shrink: 0; }
.delete-contract-btn { padding: 7px 16px; border: 1.5px solid #ef4444; border-radius: 8px; background: transparent; color: #ef4444; font-size: 13px; font-weight: 500; cursor: pointer; display: flex; align-items: center; gap: 7px; transition: background .15s, color .15s; }
.delete-contract-btn:hover { background: #ef4444; color: #fff; }

/* ── Tabs ── */
.tabs-bar { display: flex; background: var(--bg-surface); border-bottom: 1px solid var(--border-light); padding: 0 32px; flex-shrink: 0; }
.tab-btn { height: 42px; padding: 0 16px; border: none; background: transparent; color: var(--text-secondary); font-size: 13px; font-weight: 500; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; transition: color .15s, border-color .15s; }
.tab-btn:hover { color: var(--text-primary); }
.tab-btn.active { color: var(--brand-primary); border-bottom-color: var(--brand-primary); font-weight: 600; }

/* ── Status bar ── */
.status-actions-bar { display: flex; align-items: center; gap: 8px; padding: 10px 0; flex-wrap: wrap; margin-left: 32px; flex-shrink: 0; }
.status-action-btn { display: inline-flex; align-items: center; gap: 7px; padding: 7px 14px; border-radius: var(--radius-md); font-size: 13px; font-weight: 500; cursor: pointer; border: 1.5px solid; transition: opacity .15s; }
.status-action-btn:disabled { opacity: .5; cursor: not-allowed; }
.status-action-btn--sign   { background: #eff6ff; border-color: #93c5fd; color: #1d4ed8; }
.status-action-btn--sign:hover:not(:disabled)   { background: #dbeafe; }
.status-action-btn--verify { background: #f0fdf4; border-color: #86efac; color: #15803d; }
.status-action-btn--verify:hover:not(:disabled) { background: #dcfce7; }
.status-action-btn--undo   { background: #fef2f2; border-color: #fca5a5; color: #dc2626; }
.status-action-btn--undo:hover:not(:disabled)   { background: #fee2e2; }

/* ── Main content ── */
.main-content { flex: 1; overflow-y: auto; padding: 24px 32px 40px; display: flex; flex-direction: column; gap: 16px; }
.info-section { background: var(--bg-surface); border: 1px solid var(--border-light); border-radius: var(--radius-lg); padding: 20px 24px; box-shadow: var(--shadow-sm); }
.info-section--sys { background: var(--bg-subtle); border-style: dashed; box-shadow: none; }
.section-heading { font-size: 13px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: .05em; margin-bottom: 16px; display: flex; align-items: center; gap: 7px; }
.section-heading i { color: var(--brand-primary); font-size: 13px; }
.cards-row { display: flex; flex-wrap: wrap; gap: 12px; }
.party-card { flex: 1; min-width: 200px; padding: 14px 16px; background: var(--bg-subtle); border: 1px solid var(--border-light); border-radius: var(--radius-md); }
.party-role { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--text-tertiary); margin-bottom: 5px; }
.party-name { font-size: 14px; font-weight: 600; color: var(--text-primary); line-height: 1.3; }
.fields-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px 24px; }
.field-key { font-size: 11px; font-weight: 600; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: .05em; margin-bottom: 4px; }
.field-val { font-size: 14px; color: var(--text-primary); line-height: 1.4; }
.field-val.mono { font-family: 'JetBrains Mono', monospace; }
.tags-list { display: flex; flex-direction: column; gap: 8px; }
.object-row { display: flex; align-items: center; gap: 8px; padding: 9px 12px; background: var(--bg-subtle); border-radius: var(--radius-md); font-size: 13px; color: var(--text-primary); border: 1px solid var(--border-light); }
.object-row i { color: var(--brand-primary); }
.persons-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
.persons-col-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--text-tertiary); margin-bottom: 10px; }
.person-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--border-light); }
.person-row:last-child { border-bottom: none; }
.person-avatar { width: 34px; height: 34px; border-radius: 50%; background: var(--brand-primary); color: #fff; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.person-avatar--co  { background: #7c3aed; }
.person-avatar--obs { background: #0284c7; }
.person-name { font-size: 13px; font-weight: 600; color: var(--text-primary); }
.person-role { font-size: 11px; color: var(--text-tertiary); margin-top: 1px; }
.comment-box { padding: 12px 16px; background: var(--bg-subtle); border-radius: var(--radius-md); font-size: 14px; color: var(--text-primary); line-height: 1.6; white-space: pre-wrap; border: 1px solid var(--border-light); }
.type-badge { display: inline-block; padding: 2px 10px; border-radius: 10px; font-size: 12px; font-weight: 600; background: var(--bg-subtle); color: var(--text-secondary); }
.type-badge--outgoing { background: #eff6ff; color: #1d4ed8; }
.type-badge--incoming { background: #f0fdf4; color: #15803d; }
.empty-hint { font-size: 13px; color: var(--text-tertiary); font-style: italic; }

/* ── Tab empty ── */
.tab-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: var(--text-tertiary); }
.tab-empty-icon { font-size: 48px; color: var(--border-light); }
.tab-empty-title { margin: 0; font-size: 18px; font-weight: 600; color: var(--text-secondary); }
.tab-empty-sub   { margin: 0; font-size: 13px; }

/* ── Documents ── */
.docs-wrap { flex: 1; overflow-y: auto; padding: 24px 32px 40px; position: relative; }
.docs-section-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--text-tertiary); margin-bottom: 16px; }
.upload-cards { display: flex; gap: 16px; flex-wrap: wrap; }
.upload-card { flex: 1; min-width: 200px; max-width: 300px; background: var(--bg-surface); border: 1px dashed var(--border-light); border-radius: var(--radius-lg); padding: 24px 20px 20px; display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center; transition: border-color .15s, box-shadow .15s; }
.upload-card:hover { border-color: var(--brand-primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand-primary) 8%, transparent); }
.upload-card-icon { width: 48px; height: 48px; border-radius: 50%; background: color-mix(in srgb, var(--brand-primary) 10%, transparent); color: var(--brand-primary); display: flex; align-items: center; justify-content: center; font-size: 20px; margin-bottom: 4px; }
.upload-card-label { font-size: 14px; font-weight: 700; color: var(--text-primary); }
.upload-card-hint { font-size: 12px; color: var(--text-tertiary); line-height: 1.4; }
.upload-btn { margin-top: 8px; padding: 8px 18px; background: var(--brand-primary); color: #fff; border: none; border-radius: var(--radius-md); font-size: 13px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: opacity .15s; }
.upload-btn:hover { opacity: .85; }
.upload-status { margin-top: 8px; font-size: 13px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; justify-content: center; }
.upload-status--loading { color: var(--text-secondary); }
.upload-status--done    { color: #16a34a; font-weight: 600; }
.upload-status--error   { color: #ef4444; }
.retry-btn { padding: 3px 10px; border: 1px solid #ef4444; border-radius: var(--radius-md); background: transparent; color: #ef4444; font-size: 12px; cursor: pointer; margin-left: 4px; }
.retry-btn:hover { background: #fef2f2; }
.mini-spinner { width: 14px; height: 14px; border: 2px solid var(--border-light); border-top-color: var(--brand-primary); border-radius: 50%; animation: spin .7s linear infinite; flex-shrink: 0; }
.docs-browser-section { margin-top: 28px; }
.docs-browser-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.create-folder-btn { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border: 1px solid var(--border-light); border-radius: var(--radius-md); background: var(--bg-surface); color: var(--text-secondary); font-size: 13px; font-weight: 500; cursor: pointer; }
.create-folder-btn:hover { background: var(--bg-subtle); color: var(--text-primary); }
.state-msg { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-secondary); padding: 16px 0; }
.browser { background: var(--bg-surface); border: 1px solid var(--border-light); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); overflow: hidden; }
.breadcrumb { display: flex; align-items: center; gap: 4px; padding: 10px 16px; background: var(--bg-subtle); border-bottom: 1px solid var(--border-light); font-size: 13px; flex-wrap: wrap; }
.bc-item { color: var(--brand-primary); cursor: pointer; padding: 2px 4px; border-radius: var(--radius-sm); display: flex; align-items: center; gap: 4px; }
.bc-item:hover { background: color-mix(in srgb, var(--brand-primary) 10%, transparent); }
.bc-item--active { color: var(--text-primary); font-weight: 600; cursor: default; }
.bc-item--active:hover { background: transparent; }
.bc-item--root { color: var(--text-secondary); }
.bc-sep { color: var(--text-tertiary); font-size: 10px; }
.browser-list { display: flex; flex-direction: column; }
.browser-row { display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-bottom: 1px solid var(--border-light); transition: background .1s; }
.browser-row:last-child { border-bottom: none; }
.browser-row--folder { cursor: pointer; }
.browser-row--folder:hover { background: var(--bg-subtle); }
.browser-row--file:hover   { background: var(--bg-subtle); }
.browser-row-icon { font-size: 18px; flex-shrink: 0; width: 22px; text-align: center; }
.browser-row-name { flex: 1; font-size: 13px; color: var(--text-primary); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.browser-row-name--link { cursor: pointer; color: var(--brand-primary); }
.browser-row-name--link:hover { text-decoration: underline; }
.browser-row-meta { font-size: 12px; color: var(--text-tertiary); flex-shrink: 0; white-space: nowrap; }
.browser-row-arrow { color: var(--text-tertiary); font-size: 11px; }
.browser-row-actions { display: flex; gap: 4px; flex-shrink: 0; }
.file-action-btn { width: 30px; height: 30px; border: 1px solid var(--border-light); border-radius: var(--radius-md); background: var(--bg-page); color: var(--text-secondary); cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 12px; transition: background .1s, color .1s; }
.file-action-btn:hover { background: var(--bg-subtle); color: var(--text-primary); }
.file-action-btn--danger:hover { background: #fef2f2; color: #ef4444; border-color: #fca5a5; }
.browser-empty { padding: 32px; text-align: center; color: var(--text-tertiary); font-size: 14px; display: flex; align-items: center; justify-content: center; gap: 8px; }
.file-type-badge { flex-shrink: 0; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; white-space: nowrap; }
.file-type-badge--original { background: #dbeafe; color: #1d4ed8; }
.file-type-badge--version  { background: #f3e8ff; color: #6b21a8; }
.drop-overlay { position: absolute; inset: 0; background: color-mix(in srgb, var(--brand-primary) 12%, transparent); border: 3px dashed var(--brand-primary); border-radius: var(--radius-lg); z-index: 50; display: flex; align-items: center; justify-content: center; pointer-events: none; }
.drop-overlay-inner { display: flex; flex-direction: column; align-items: center; gap: 12px; color: var(--brand-primary); font-size: 15px; font-weight: 600; }
.drop-overlay-inner i { font-size: 48px; }
.drop-uploading { display: flex; align-items: center; gap: 8px; padding: 10px 16px; font-size: 13px; color: var(--text-secondary); border-top: 1px solid var(--border-light); }

/* ── Preview fullscreen ── */
.preview-backdrop { position: fixed; inset: 0; z-index: 200; background: rgba(0,0,0,0.85); display: flex; flex-direction: column; outline: none; }
.preview-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 20px; background: #1e1e1e; border-bottom: 1px solid rgba(255,255,255,0.1); flex-shrink: 0; gap: 12px; }
.preview-title { display: flex; align-items: center; gap: 10px; font-size: 14px; font-weight: 600; color: #fff; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.preview-header-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.preview-action-btn { width: 34px; height: 34px; border-radius: var(--radius-md); border: 1px solid rgba(255,255,255,0.15); background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.7); cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 14px; }
.preview-action-btn:hover { background: rgba(255,255,255,0.15); color: #fff; }
.preview-close-btn { width: 34px; height: 34px; border-radius: var(--radius-md); border: none; background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.7); cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 16px; }
.preview-close-btn:hover { background: #ef4444; color: #fff; }
.preview-body { flex: 1; overflow: hidden; display: flex; align-items: stretch; }
.preview-embed { width: 100%; height: 100%; border: none; }
.preview-image-wrap { flex: 1; display: flex; align-items: center; justify-content: center; padding: 24px; overflow: auto; }
.preview-image { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 4px; box-shadow: 0 4px 32px rgba(0,0,0,0.5); }
.preview-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: rgba(255,255,255,0.6); font-size: 15px; }
.preview-state--error { color: #f87171; }
.preview-state--unsupported { color: rgba(255,255,255,0.5); text-align: center; }
.preview-state-icon { font-size: 64px; color: rgba(255,255,255,0.2); }
.preview-state-title { font-size: 20px; font-weight: 700; color: rgba(255,255,255,0.7); }

/* ── Viewer ── */
.viewer-layout { flex: 1; display: grid; grid-template-columns: 300px 1fr 340px; overflow: hidden; }
.viewer-left { border-right: 1px solid var(--border-light); overflow-y: auto; padding: 20px; background: var(--bg-surface); display: flex; flex-direction: column; gap: 0; }
.viewer-info-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--text-tertiary); margin-bottom: 12px; }
.viewer-info-block { margin-bottom: 10px; }
.viewer-info-label { font-size: 11px; font-weight: 600; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: .04em; margin-bottom: 2px; }
.viewer-info-val { font-size: 13px; color: var(--text-primary); line-height: 1.4; word-break: break-word; }
.viewer-info-val.mono { font-family: 'JetBrains Mono', monospace; }
.viewer-info-divider { border-top: 1px solid var(--border-light); margin: 10px 0 12px; }
.viewer-center { overflow: hidden; display: flex; flex-direction: column; background: #525659; position: relative; }
.viewer-embed { width: 100%; height: 100%; border: none; }
.viewer-image-wrap { flex: 1; display: flex; align-items: center; justify-content: center; padding: 24px; overflow: auto; }
.viewer-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: rgba(255,255,255,0.5); font-size: 14px; }
.viewer-state--error { color: #f87171; }
.viewer-right { border-left: 1px solid var(--border-light); display: flex; flex-direction: column; overflow: hidden; background: var(--bg-surface); }
.viewer-right-tabs { display: flex; border-bottom: 1px solid var(--border-light); flex-shrink: 0; }
.viewer-right-tab { flex: 1; height: 40px; border: none; background: transparent; font-size: 13px; font-weight: 500; color: var(--text-secondary); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; transition: color .15s, border-color .15s; }
.viewer-right-tab:hover { color: var(--text-primary); }
.viewer-right-tab.active { color: var(--brand-primary); border-bottom-color: var(--brand-primary); font-weight: 600; }
.viewer-file-list { flex: 1; overflow-y: auto; padding: 12px; }
.viewer-upload-bar { display: flex; gap: 8px; margin-bottom: 12px; }
.viewer-upload-btn { flex: 1; padding: 7px 10px; border-radius: var(--radius-md); border: 1px solid var(--border-light); font-size: 12px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 5px; transition: background .1s, opacity .1s; }
.viewer-upload-btn:disabled { opacity: .5; cursor: default; }
.viewer-upload-btn--original { background: #dbeafe; color: #1d4ed8; border-color: #bfdbfe; }
.viewer-upload-btn--original:hover:not(:disabled) { background: #bfdbfe; }
.viewer-upload-btn--version  { background: #f3e8ff; color: #6b21a8; border-color: #e9d5ff; }
.viewer-upload-btn--version:hover:not(:disabled)  { background: #e9d5ff; }
.viewer-upload-error { font-size: 12px; color: #ef4444; display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
.viewer-file-loading { display: flex; align-items: center; gap: 8px; color: var(--text-secondary); font-size: 13px; padding: 16px 0; }
.viewer-file-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--text-tertiary); font-size: 13px; padding: 32px 16px; text-align: center; }
.viewer-timeline { display: flex; flex-direction: column; }
.viewer-timeline-item { display: flex; gap: 10px; cursor: pointer; }
.vtl-connector { display: flex; flex-direction: column; align-items: center; flex-shrink: 0; width: 16px; padding-top: 4px; }
.vtl-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--border-light); border: 2px solid var(--bg-surface); box-shadow: 0 0 0 1px var(--border-light); flex-shrink: 0; transition: background .15s; }
.vtl-dot--active { background: var(--brand-primary); box-shadow: 0 0 0 1px var(--brand-primary); }
.vtl-line { flex: 1; width: 2px; background: var(--border-light); margin: 3px 0; min-height: 12px; }
.vtl-card { flex: 1; padding: 6px 8px 10px; border-radius: var(--radius-md); transition: background .12s; min-width: 0; }
.viewer-timeline-item:hover .vtl-card { background: var(--bg-subtle); }
.viewer-timeline-item.active .vtl-card { background: color-mix(in srgb, var(--brand-primary) 8%, transparent); }
.vtl-card-top { display: flex; align-items: center; gap: 6px; min-width: 0; }
.vtl-card-top i { flex-shrink: 0; font-size: 14px; }
.vtl-name { font-size: 12px; color: var(--text-primary); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vtl-meta { display: flex; align-items: center; gap: 6px; margin-top: 4px; flex-wrap: wrap; }
.vtl-date { font-size: 11px; color: var(--text-tertiary); }

/* ── History ── */
.history-wrap { flex: 1; overflow-y: auto; padding: 24px 32px 40px; }
.log-filters { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
.log-filter-search { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 180px; background: var(--bg-surface); border: 1.5px solid var(--border-light); border-radius: 8px; padding: 0 10px; transition: border-color .15s; }
.log-filter-search:focus-within { border-color: var(--brand-primary); }
.log-filter-search-icon { font-size: 13px; color: var(--text-tertiary); flex-shrink: 0; }
.log-filter-input { flex: 1; border: none; outline: none; background: transparent; font-size: 13.5px; color: var(--text-primary); padding: 8px 0; }
.log-filter-clear-x { background: none; border: none; cursor: pointer; color: var(--text-tertiary); font-size: 12px; padding: 0; flex-shrink: 0; }
.log-filter-clear-x:hover { color: var(--text-primary); }
.log-filter-user-wrap { position: relative; min-width: 180px; }
.log-filter-user-input-row { display: flex; align-items: center; gap: 7px; padding: 0 10px; border: 1.5px solid var(--border-light); border-radius: 8px; background: var(--bg-surface); transition: border-color .15s; }
.log-filter-user-input-row.focused { border-color: var(--brand-primary); }
.log-filter-user-icon { font-size: 12px; color: var(--text-tertiary); flex-shrink: 0; }
.log-filter-user-input { flex: 1; border: none; outline: none; background: transparent; font-size: 13px; color: var(--text-primary); padding: 7.5px 0; min-width: 0; }
.log-filter-user-input::placeholder { color: var(--text-tertiary); }
.log-filter-user-drop { position: absolute; top: calc(100% + 4px); left: 0; right: 0; background: var(--bg-surface); border: 1.5px solid var(--border-light); border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,.11); z-index: 200; max-height: 220px; overflow-y: auto; }
.log-filter-date { padding: 7px 10px; border: 1.5px solid var(--border-light); border-radius: 8px; background: var(--bg-surface); font-size: 13px; color: var(--text-primary); width: 138px; }
.log-filter-date:focus { outline: none; border-color: var(--brand-primary); }
.log-filter-date-sep { color: var(--text-tertiary); font-size: 13px; flex-shrink: 0; }
.log-filter-reset { padding: 7px 13px; border: 1.5px solid var(--border-light); border-radius: 8px; background: var(--bg-surface); color: var(--text-secondary); font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 6px; white-space: nowrap; transition: border-color .15s, color .15s; }
.log-filter-reset:hover { border-color: #ef4444; color: #ef4444; }
.log-type-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 8px; }
.log-type-chips:last-of-type { margin-bottom: 16px; }
.log-type-chip { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border: 1.5px solid var(--border-light); border-radius: 20px; background: var(--bg-surface); color: var(--text-secondary); font-size: 12.5px; cursor: pointer; transition: border-color .15s, color .15s, background .15s; }
.log-type-chip i { font-size: 12px; }
.log-type-chip:hover { border-color: var(--border-medium, #bbb); color: var(--text-primary); }
.log-type-chip.active { font-weight: 500; }
.log-results-meta { font-size: 12.5px; color: var(--text-tertiary); margin-bottom: 10px; }
.log-results-meta strong { color: var(--text-primary); }
.log-no-results { display: flex; align-items: center; gap: 10px; padding: 32px 0; color: var(--text-tertiary); font-size: 14px; }
.log-no-results i { font-size: 18px; }
.log-no-results-reset { background: none; border: none; cursor: pointer; color: var(--brand-primary); font-size: 14px; padding: 0; text-decoration: underline; }
.log-timeline { display: flex; flex-direction: column; gap: 0; padding: 8px 0 24px; }
.log-day-sep { display: flex; align-items: center; gap: 12px; padding: 20px 0 12px; }
.log-day-sep::before, .log-day-sep::after { content: ''; flex: 1; height: 1px; background: var(--border-light); }
.log-day-label { font-size: 11px; font-weight: 600; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: .07em; white-space: nowrap; padding: 0 4px; }
.log-entry { display: flex; align-items: flex-start; gap: 14px; padding: 13px 16px; border-radius: 10px; border: 1px solid var(--border-light); background: var(--bg-surface); margin-bottom: 8px; transition: box-shadow .15s, border-color .15s; }
.log-entry:hover { border-color: var(--border-medium, #d0d5dd); box-shadow: 0 2px 8px rgba(0,0,0,.06); }
.log-action-icon { flex-shrink: 0; width: 38px; height: 38px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 15px; margin-top: 1px; }
.log-content { flex: 1; min-width: 0; }
.log-content-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
.log-message-text { font-size: 13.5px; color: var(--text-primary); line-height: 1.5; flex: 1; }
.log-time-badge { flex-shrink: 0; font-size: 11.5px; color: var(--text-tertiary); white-space: nowrap; margin-top: 2px; }
.log-author-row { display: flex; align-items: center; gap: 7px; }
.log-user-avatar { width: 22px; height: 22px; border-radius: 50%; background: var(--brand-primary); color: #fff; font-size: 9px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; opacity: .85; }
.log-author-name { font-size: 12px; color: var(--text-secondary); font-weight: 500; }

/* ── Autocomplete shared ── */
.ac-item { display: flex; align-items: center; gap: 8px; padding: 9px 12px; font-size: 13px; color: var(--text-primary); cursor: pointer; }
.ac-item:hover { background: var(--bg-subtle); }
.ac-item--sel { background: var(--surface-hover, #f5f7fa); font-weight: 500; }
.ac-empty { padding: 14px; text-align: center; color: var(--text-tertiary); font-size: 13px; }

/* ── Modals ── */
.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.35); z-index: 100; display: flex; align-items: center; justify-content: center; }
.modal-box { background: var(--bg-surface); border-radius: var(--radius-lg); box-shadow: 0 20px 60px rgba(0,0,0,.25); padding: 24px; width: 380px; max-width: 90vw; display: flex; flex-direction: column; gap: 14px; }
.modal-title { font-size: 16px; font-weight: 700; color: var(--text-primary); }
.modal-title--danger { color: #ef4444; }
.modal-body { font-size: 14px; color: var(--text-secondary); line-height: 1.5; }
.modal-input { width: 100%; box-sizing: border-box; height: 36px; border: 1px solid var(--border-light); border-radius: var(--radius-md); padding: 0 10px; font-size: 14px; outline: none; background: var(--bg-page); color: var(--text-primary); }
.modal-input:focus { border-color: var(--brand-primary); }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
.modal-btn { padding: 7px 18px; border-radius: var(--radius-md); font-size: 13px; font-weight: 600; cursor: pointer; border: none; display: inline-flex; align-items: center; gap: 6px; min-width: 80px; justify-content: center; }
.modal-btn:disabled { opacity: .6; cursor: default; }
.modal-btn--cancel { background: var(--bg-subtle); color: var(--text-secondary); border: 1px solid var(--border-light); }
.modal-btn--cancel:hover:not(:disabled) { background: var(--bg-page); }
.modal-btn--ok { background: var(--brand-primary); color: #fff; }
.modal-btn--ok:hover:not(:disabled) { opacity: .88; }
.modal-btn--danger { background: #ef4444; color: #fff; }
.modal-btn--danger:hover:not(:disabled) { background: #dc2626; }
/* leave modal */
.leave-modal { text-align: center; gap: 10px; }
.leave-modal-icon { font-size: 36px; color: var(--brand-primary); }
.leave-modal-title { font-size: 16px; font-weight: 700; color: var(--text-primary); }
.leave-modal-body { font-size: 13px; color: var(--text-secondary); line-height: 1.5; }
.leave-modal-save { min-width: 160px; }

/* ── Constructor (OnlyOffice) ── */
.constructor-wrap { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.constructor-hint { flex-shrink: 0; display: flex; align-items: center; gap: 8px; padding: 7px 16px; background: #eff6ff; border-bottom: 1px solid #bfdbfe; font-size: 13px; color: #1d4ed8; }
.constructor-hint i { flex-shrink: 0; }
.editor-mode-toggle { display: flex; margin-left: auto; background: #dbeafe; border-radius: 8px; padding: 2px; gap: 2px; flex-shrink: 0; }
.editor-mode-btn { padding: 4px 12px; border: none; border-radius: 6px; background: transparent; font-size: 12px; font-weight: 600; color: #1d4ed8; cursor: pointer; display: flex; align-items: center; gap: 5px; transition: background .15s, color .15s; white-space: nowrap; }
.editor-mode-btn.active { background: #fff; color: #1d4ed8; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
.editor-mode-btn:hover:not(.active) { background: rgba(255,255,255,.5); }
.constructor-body { flex: 1; display: flex; overflow: hidden; }
.constructor-editor-wrap { flex: 1; display: flex; flex-direction: column; overflow: hidden; position: relative; }
.constructor-state { position: absolute; inset: 0; top: 45px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: var(--text-secondary); font-size: 15px; z-index: 2; background: var(--bg-page); }
.constructor-state--error { color: #ef4444; text-align: center; padding: 24px; }
.onlyoffice-editor { flex: 1; width: 100%; border: none; min-height: 0; }
/* ── OnlyOffice toolbar ── */
.oo-toolbar { display: flex; align-items: center; gap: 10px; padding: 6px 14px; background: var(--bg-surface); border-bottom: 1px solid var(--border-light); flex-shrink: 0; height: 45px; }
.oo-user-info { display: flex; align-items: center; gap: 8px; }
.oo-user-avatar { width: 28px; height: 28px; border-radius: 50%; background: var(--brand-primary); color: #fff; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.oo-user-name { font-size: 13px; font-weight: 600; color: var(--text-primary); }
.oo-toolbar-spacer { flex: 1; }
.oo-save-status { display: flex; align-items: center; gap: 6px; font-size: 12px; }
.oo-save-status--saving { color: var(--text-tertiary); }
.oo-save-status--saved  { color: #16a34a; }
.oo-save-status--error  { color: #ef4444; }
.oo-save-btn { display: flex; align-items: center; gap: 7px; padding: 7px 16px; background: var(--brand-primary); color: #fff; border: none; border-radius: var(--radius-md); font-size: 13px; font-weight: 600; cursor: pointer; transition: opacity .15s; flex-shrink: 0; }
.oo-save-btn:hover:not(:disabled) { opacity: .88; }
.oo-save-btn:disabled { opacity: .45; cursor: default; }

/* ── AI панель ── */
.ai-panel { width: 320px; flex-shrink: 0; border-right: 1px solid var(--border-light); background: var(--bg-surface); display: flex; flex-direction: column; overflow: hidden; transition: width .2s; }
.ai-panel--collapsed { width: 40px; }
.ai-panel-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; cursor: pointer; border-bottom: 1px solid var(--border-light); flex-shrink: 0; gap: 8px; user-select: none; }
.ai-panel-header:hover { background: var(--bg-subtle); }
.ai-panel-title { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; }
.ai-panel-title i { color: #7c3aed; font-size: 14px; flex-shrink: 0; }
.ai-panel-header > .fas { color: var(--text-tertiary); font-size: 11px; flex-shrink: 0; }
.ai-panel-body { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.ai-scroll-area { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 12px; }
.ai-panel-footer { flex-shrink: 0; padding: 10px 14px; border-top: 1px solid var(--border-light); display: flex; flex-direction: column; gap: 8px; background: var(--bg-surface); }
.ai-context-block { background: var(--bg-subtle); border: 1px solid var(--border-light); border-radius: var(--radius-md); padding: 10px 12px; }
.ai-context-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--text-tertiary); margin-bottom: 6px; }
.ai-context-row { font-size: 12px; color: var(--text-secondary); line-height: 1.5; }
.ai-context-row span { font-weight: 600; color: var(--text-primary); }
.ai-input-label { font-size: 12px; font-weight: 600; color: var(--text-secondary); }
.ai-textarea { width: 100%; box-sizing: border-box; border: 1.5px solid var(--border-light); border-radius: var(--radius-md); padding: 9px 11px; font-size: 13px; color: var(--text-primary); background: var(--bg-page); resize: none; min-height: 80px; max-height: 180px; outline: none; font-family: inherit; line-height: 1.5; }
.ai-textarea:focus { border-color: #7c3aed; }
.ai-input-hint { font-size: 11px; color: var(--text-tertiary); margin-top: -6px; }
.ai-send-btn { width: 100%; padding: 9px; background: #7c3aed; color: #fff; border: none; border-radius: var(--radius-md); font-size: 13px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 7px; transition: opacity .15s; }
.ai-send-btn:hover:not(:disabled) { opacity: .88; }
.ai-send-btn:disabled { opacity: .5; cursor: default; }
.ai-error { font-size: 12px; color: #ef4444; display: flex; align-items: flex-start; gap: 6px; }
.ai-result { border: 1.5px solid #e9d5ff; border-radius: var(--radius-md); overflow: hidden; }
.ai-result-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: #f5f3ff; border-bottom: 1px solid #e9d5ff; }
.ai-result-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #6b21a8; }
.ai-result-actions { display: flex; gap: 4px; }
.ai-result-btn { width: 26px; height: 26px; border: 1px solid #e9d5ff; border-radius: var(--radius-sm); background: #fff; color: #7c3aed; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 11px; }
.ai-result-btn:hover { background: #ede9fe; }
.ai-result-text { padding: 10px 12px; font-size: 13px; color: var(--text-primary); line-height: 1.6; white-space: pre-wrap; max-height: 300px; overflow-y: auto; }
.ai-insert-btn { width: 100%; padding: 8px; background: #f5f3ff; border: none; border-top: 1px solid #e9d5ff; color: #6b21a8; font-size: 13px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; transition: background .15s; }
.ai-insert-btn:hover { background: #ede9fe; }

/* ── Версии в конструкторе ── */
.cv-panel { width: 240px; flex-shrink: 0; border-left: 1px solid var(--border-light); background: var(--bg-surface); display: flex; flex-direction: column; overflow: hidden; }
.cv-panel-header { display: flex; align-items: center; gap: 8px; padding: 11px 14px; border-bottom: 1px solid var(--border-light); font-size: 12px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: .05em; flex-shrink: 0; }
.cv-panel-header i { color: var(--brand-primary); }
.cv-refresh-btn { margin-left: auto; background: none; border: none; cursor: pointer; color: var(--text-tertiary); font-size: 12px; padding: 2px 4px; }
.cv-refresh-btn:hover { color: var(--brand-primary); }
.cv-list { flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 6px; }
.cv-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; color: var(--text-tertiary); font-size: 12px; padding: 24px 0; text-align: center; }
.cv-item { padding: 10px 12px; border: 1.5px solid var(--border-light); border-radius: var(--radius-md); cursor: pointer; transition: border-color .15s, background .15s; display: flex; flex-direction: column; gap: 5px; }
.cv-item:hover { border-color: var(--brand-primary); background: color-mix(in srgb, var(--brand-primary) 4%, transparent); }
.cv-item--active { border-color: var(--brand-primary); background: color-mix(in srgb, var(--brand-primary) 8%, transparent); }
.cv-item-top { display: flex; align-items: center; gap: 6px; }
.cv-version-num { font-size: 13px; font-weight: 700; color: var(--text-primary); }
.cv-badge { padding: 1px 7px; border-radius: 10px; font-size: 10px; font-weight: 700; }
.cv-badge--latest   { background: #dcfce7; color: #15803d; }
.cv-badge--original { background: #dbeafe; color: #1d4ed8; }
.cv-item-date { font-size: 11px; color: var(--text-tertiary); display: flex; align-items: center; gap: 5px; }
.cv-item-author { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--text-secondary); }
.cv-avatar { width: 18px; height: 18px; border-radius: 50%; background: var(--brand-primary); color: #fff; font-size: 8px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.cv-item-name { font-size: 11px; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
