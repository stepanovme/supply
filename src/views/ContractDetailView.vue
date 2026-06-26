<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TopNav from '../components/layout/TopNav.vue'
import { mainNavLinks } from '../constants/mainNav'
import { renderAsync } from 'docx-preview'
import * as XLSX from 'xlsx'

const route   = useRoute()
const router  = useRouter()
const navLinks = mainNavLinks

const contract = ref(null)
const loading  = ref(true)
const error    = ref('')
const activeTab = ref('main')

const tabs = [
  { key: 'main',    label: 'Основная информация' },
  { key: 'viewer',  label: 'Просмотр договора' },
  { key: 'docs',    label: 'Документы' },
  { key: 'history', label: 'История действий' },
]

const loadContract = async () => {
  loading.value = true
  error.value   = ''
  try {
    const r = await fetch(`/apisup/supply/contracts/${route.params.id}`, { credentials: 'include' })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    contract.value = await r.json()
  } catch {
    error.value = 'Не удалось загрузить договор'
  } finally {
    loading.value = false
  }
}

const formatDate = (v) => {
  if (!v) return '—'
  const d = new Date(v)
  return isNaN(d) ? '—' : d.toLocaleDateString('ru-RU')
}

const formatMoney = (v) => {
  if (v == null) return '—'
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) + ' ₽'
}

const typeLabel = (t) => ({ buyer: 'Покупатель', provide: 'Поставщик', seller: 'Продавец', service: 'Услуги' }[t] || t)

const executor    = computed(() => contract.value?.user_roles?.find(r => r.role === 'executor'))
const coExecutors = computed(() => contract.value?.user_roles?.filter(r => r.role === 'co-executor') || [])
const observers   = computed(() => contract.value?.user_roles?.filter(r => r.role === 'observer') || [])
const extraParties = computed(() => contract.value?.parties || [])

const logs        = ref([])
const logsLoading = ref(false)
const logsError   = ref('')

// ── Documents ──────────────────────────────────────────────
const UPLOAD_TYPES = [
  { key: 'original', label: 'Оригинал договора',  folderName: 'Оригинал договора', icon: 'fa-stamp',         fileType: 'original' },
  { key: 'version',  label: 'Версия договора',     folderName: 'Версия договора',   icon: 'fa-file-contract', fileType: 'version'  },
  { key: 'files',    label: 'Файлы',               folderName: null,                icon: 'fa-paperclip',     fileType: null       },
]

const TYPE_EXTS = ['pdf', 'docx', 'doc', 'xlsx', 'xls']

const uploadState  = ref({}) // key → { loading, error, done }
const fileInputs   = ref({}) // key → HTMLInputElement
const dropActive   = ref(false)
const dropUploading = ref(false)

const triggerUpload = (key) => {
  const el = fileInputs.value[key]
  if (el) el.click()
}

// Find folder in loaded tree by name + parent_id=null (no extra API call)
const findRootFolderInTree = (name) => {
  return tree.value.find(f => f.name === name && !f.parent_id) || null
}

const getOrCreateFolder = async (folderName) => {
  const contractId = route.params.id
  const existing = findRootFolderInTree(folderName)
  if (existing) return existing.id
  const createRes = await fetch('/apisup/supply/contract-folders', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contract_id: Number(contractId), name: folderName }),
  })
  if (!createRes.ok) throw new Error('Не удалось создать папку')
  const folder = await createRes.json()
  return folder.id
}

// Send files to API; fileType = 'original'|'version'|null
const sendFilesToApi = async (files, folderId, fileType = null) => {
  const contractId = route.params.id
  const formData = new FormData()
  formData.append('contract_id', contractId)
  if (folderId) formData.append('contract_folder_id', folderId)
  for (const file of files) {
    formData.append('files', file)
    if (fileType && TYPE_EXTS.includes(file.name.split('.').pop()?.toLowerCase())) {
      formData.append('type', fileType)
    }
  }
  const res = await fetch('/apisup/supply/contract-files', {
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

// Drag & drop
const onDragOver = (e) => { e.preventDefault(); dropActive.value = true }
const onDragLeave = () => { dropActive.value = false }
const onDrop = async (e) => {
  e.preventDefault()
  dropActive.value = false
  const files = [...(e.dataTransfer?.files || [])]
  if (!files.length) return
  dropUploading.value = true
  try {
    await sendFilesToApi(files, currentFolder.value?.id || null)
    await loadTree()
  } catch { /* silent */ }
  dropUploading.value = false
}

// ── File tree ───────────────────────────────────────────────
const tree        = ref([])
const treeLoading = ref(false)
const treeError   = ref('')
const breadcrumb  = ref([]) // { id, name }

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
    const r = await fetch(
      `/apisup/supply/contract-folders/tree?contract_id=${route.params.id}`,
      { credentials: 'include' }
    )
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    tree.value = await r.json()
  } catch {
    treeError.value = 'Не удалось загрузить файлы'
  } finally {
    treeLoading.value = false
  }
}

const openFolder = (folder) => breadcrumb.value.push({ id: folder.id, name: folder.name })
const goToBreadcrumb = (idx) => { breadcrumb.value = breadcrumb.value.slice(0, idx + 1) }
const goToRoot = () => { breadcrumb.value = [] }

// ── File/folder actions ─────────────────────────────────────
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
  const res = await fetch(`/apisup/supply/contract-files/${file.id}/download`, { credentials: 'include' })
  if (!res.ok) return
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = file.original_name; a.click()
  URL.revokeObjectURL(url)
}

// ── File preview ────────────────────────────────────────────
const previewType = (ext) => {
  ext = ext?.toLowerCase()
  if (ext === 'pdf')                                        return 'pdf'
  if (['jpg','jpeg','png','gif','webp','bmp','svg'].includes(ext)) return 'image'
  if (['docx','doc'].includes(ext))                         return 'docx'
  if (['xlsx','xls'].includes(ext))                         return 'xlsx'
  return 'unsupported'
}

const preview = ref({ show: false, file: null, blobUrl: null, xlsxHtml: '', loading: false, error: '' })
const docxContainerRef = ref(null)

const openPreview = async (file) => {
  preview.value = { show: true, file, blobUrl: null, xlsxHtml: '', loading: true, error: '' }
  const ext = file.extension?.toLowerCase()
  const type = previewType(ext)

  try {
    const usePreview = ['docx', 'doc', 'xlsx', 'xls'].includes(ext)
    const fetchUrl = usePreview
      ? `/apisup/supply/contract-files/${file.id}/preview`
      : `/apisup/supply/contract-files/${file.id}/download`
    const res = await fetch(fetchUrl, { credentials: 'include' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()

    if (type === 'pdf' || type === 'image') {
      preview.value.blobUrl = URL.createObjectURL(blob)
    } else if (type === 'docx' || type === 'xlsx') {
      // rendered server-side via /preview endpoint (already fetched above as pdf)
      preview.value.blobUrl = URL.createObjectURL(blob)
    }
  } catch (e) {
    preview.value.error = 'Не удалось загрузить файл для просмотра'
  } finally {
    preview.value.loading = false
  }
}

const closePreview = () => {
  if (preview.value.blobUrl) URL.revokeObjectURL(preview.value.blobUrl)
  preview.value = { show: false, file: null, blobUrl: null, xlsxHtml: '', loading: false, error: '' }
}

// ── Rename modal ────────────────────────────────────────────
const renameModal = ref({ show: false, type: '', id: '', name: '', loading: false })

const openRenameFile = (file) => {
  renameModal.value = { show: true, type: 'file', id: file.id, name: file.original_name, loading: false }
}
const openRenameFolder = (folder) => {
  renameModal.value = { show: true, type: 'folder', id: folder.id, name: folder.name, loading: false }
}
const submitRename = async () => {
  const m = renameModal.value
  m.loading = true
  try {
    const url = m.type === 'file'
      ? `/apisup/supply/contract-files/${m.id}`
      : `/apisup/supply/contract-folders/${m.id}`
    const body = m.type === 'file' ? { original_name: m.name } : { name: m.name }
    await fetch(url, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    renameModal.value.show = false
    await loadTree()
  } finally {
    renameModal.value.loading = false
  }
}

// ── Delete modal ────────────────────────────────────────────
const deleteModal = ref({ show: false, type: '', id: '', name: '', loading: false })

const openDeleteFile   = (file)   => { deleteModal.value = { show: true, type: 'file',   id: file.id,   name: file.original_name, loading: false } }
const openDeleteFolder = (folder) => { deleteModal.value = { show: true, type: 'folder', id: folder.id, name: folder.name,        loading: false } }

const submitDelete = async () => {
  const m = deleteModal.value
  m.loading = true
  try {
    const url = m.type === 'file'
      ? `/apisup/supply/contract-files/${m.id}`
      : `/apisup/supply/contract-folders/${m.id}`
    await fetch(url, { method: 'DELETE', credentials: 'include' })
    deleteModal.value.show = false
    if (m.type === 'folder' && currentFolder.value?.id === m.id) goToRoot()
    await loadTree()
  } finally {
    m.loading = false
  }
}

// ── Create folder modal ─────────────────────────────────────
const createFolderModal = ref({ show: false, name: '', loading: false })

const submitCreateFolder = async () => {
  const m = createFolderModal.value
  if (!m.name.trim()) return
  m.loading = true
  try {
    await fetch('/apisup/supply/contract-folders', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contract_id: Number(route.params.id),
        name: m.name.trim(),
        parent_id: currentFolder.value?.id || null,
      }),
    })
    createFolderModal.value.show = false
    createFolderModal.value.name = ''
    await loadTree()
  } finally {
    m.loading = false
  }
}

const loadLogs = async () => {
  logsLoading.value = true
  logsError.value   = ''
  try {
    const r = await fetch(
      `/apisup/supply/contract-logs?log_object_id=${route.params.id}&log_object_type=contract`,
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

const formatDateTime = (v) => {
  if (!v) return '—'
  const d = new Date(v)
  if (isNaN(d)) return '—'
  return d.toLocaleDateString('ru-RU') + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

// ── Viewer ──────────────────────────────────────────────────
const viewerFiles        = ref([])
const viewerLoading      = ref(false)
const viewerError        = ref('')
const viewerActiveFile   = ref(null)
const viewerBlobUrl      = ref(null)
const viewerPreviewLoad  = ref(false)
const viewerRightTab     = ref('files') // 'files' | 'links'
const viewerInputOriginal = ref(null)
const viewerInputVersion  = ref(null)
const viewerUploadState   = ref({ loading: false, error: '' })

const viewerUpload = async (typeKey, files) => {
  if (!files || !files.length) return
  viewerUploadState.value = { loading: true, error: '' }
  try {
    const folderName = typeKey === 'original' ? 'Оригинал договора' : 'Версия договора'
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
    const r = await fetch(
      `/apisup/supply/contract-files/history?contract_id=${route.params.id}`,
      { credentials: 'include' }
    )
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const data = await r.json()
    // Sort ascending by uploaded_at — earliest first
    viewerFiles.value = [...data].sort((a, b) => new Date(a.uploaded_at) - new Date(b.uploaded_at))
    // Auto-select earliest file
    if (viewerFiles.value.length) selectViewerFile(viewerFiles.value[0])
  } catch {
    viewerError.value = 'Не удалось загрузить файлы'
  } finally {
    viewerLoading.value = false
  }
}

const selectViewerFile = async (file) => {
  if (viewerBlobUrl.value) { URL.revokeObjectURL(viewerBlobUrl.value); viewerBlobUrl.value = null }
  viewerActiveFile.value = file
  viewerPreviewLoad.value = true
  try {
    const ext = file.extension?.toLowerCase()
    const usePreview = ['docx', 'doc', 'xlsx', 'xls'].includes(ext)
    const url = usePreview
      ? `/apisup/supply/contract-files/${file.id}/preview`
      : `/apisup/supply/contract-files/${file.id}/download`
    const res = await fetch(url, { credentials: 'include' })
    if (!res.ok) throw new Error()
    const blob = await res.blob()
    viewerBlobUrl.value = URL.createObjectURL(blob)
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

const setTab = (key) => {
  activeTab.value = key
  if (key === 'history' && !logsLoading.value) loadLogs()
  if (key === 'docs' && !tree.value.length && !treeLoading.value) loadTree()
  if (key === 'viewer') loadViewerFiles()
}

// ── Edit mode ──────────────────────────────────────────────
const editMode    = ref(false)
const editSaving  = ref(false)
const editError   = ref('')
const currentUserId = ref(null)

const editCounterparties = ref([])
const editDocTypes       = ref([])
const editWTList         = ref([])
const editUsers          = ref([])
const editObjectsList    = ref([])

const editForm = ref({})
const editParties   = ref([])
const editObjects   = ref([])
const editWorkTypes = ref([])
const editExecutor  = ref(null)
const editRoles     = ref([])

const acCust    = ref({ q: '', open: false })
const acContr   = ref({ q: '', open: false })
const acNewWT   = ref({ q: '', open: false })
const acDocType = ref({ q: '', open: false })
const acNewObj  = ref({ q: '', open: false })

const uName = (u) => u ? `${u.surname || ''} ${u.name || ''}${u.patronymic ? ' ' + u.patronymic : ''}`.trim() : ''

const filterDocTypes = (q) => {
  const l = q.toLowerCase()
  return editDocTypes.value.filter(d => !q || d.name?.toLowerCase().includes(l)).slice(0, 20)
}

const filterCPs = (q) => {
  const l = q.toLowerCase()
  return editCounterparties.value.filter(c =>
    !q || c.short_name?.toLowerCase().includes(l) || c.full_name?.toLowerCase().includes(l)
  ).slice(0, 20)
}

const filterUsers = (q) => {
  const l = q.toLowerCase()
  return editUsers.value.filter(u => {
    if (!q) return true
    const n = uName(u).toLowerCase()
    return n.includes(l) || (u.username || '').toLowerCase().includes(l)
  }).slice(0, 20)
}

const filteredEditObjects = computed(() => {
  const q = acNewObj.value.q.toLowerCase()
  const existingIds = new Set(editObjects.value.filter(o => !o._delete && !o._new).map(o => o.object_id))
  return editObjectsList.value.filter(o =>
    !existingIds.has(o.id) && (!q || o.short_name?.toLowerCase().includes(q))
  ).slice(0, 20)
})

const editCoExecutors = computed(() => editRoles.value.filter(r => r.role === 'co-executor'))
const editObservers   = computed(() => editRoles.value.filter(r => r.role === 'observer'))

const formatSumInput = (v) => {
  if (v === '' || v == null) return ''
  const num = parseFloat(String(v).replace(/\s/g,'').replace(',','.'))
  if (isNaN(num)) return v
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num)
}

const editSumDisplay = ref('')
const onSumInput = (e) => {
  const raw = e.target.value
  editSumDisplay.value = raw
  const num = parseFloat(raw.replace(/\s/g,'').replace(',','.'))
  editForm.value.sum = isNaN(num) ? 0 : num
}
const onSumBlur = () => {
  editSumDisplay.value = formatSumInput(editForm.value.sum)
}
const onSumFocus = (e) => {
  // show plain number for easy editing
  editSumDisplay.value = editForm.value.sum ? String(editForm.value.sum).replace('.',',') : ''
  nextTick(() => e.target.select())
}

const filteredNewWTs = computed(() => {
  const q = acNewWT.value.q.toLowerCase()
  const existingIds = new Set(editWorkTypes.value.filter(w => !w._delete).map(w => w.contract_work_type_id))
  return editWTList.value.filter(w =>
    !existingIds.has(w.id) && (!q || w.name?.toLowerCase().includes(q))
  ).slice(0, 20)
})

const loadEditData = async () => {
  const results = await Promise.allSettled([
    fetch('/apiref/ref/counterparties',           { credentials: 'include' }).then(r => r.ok ? r.json() : []),
    fetch('/apisup/supply/document-types',         { credentials: 'include' }).then(r => r.ok ? r.json() : []),
    fetch('/apisup/supply/contract-work-types',    { credentials: 'include' }).then(r => r.ok ? r.json() : []),
    fetch('/api/as/users/all',                     { credentials: 'include' }).then(r => r.ok ? r.json() : []),
    fetch('/api/as/users/me',                      { credentials: 'include' }).then(r => r.ok ? r.json() : null),
    fetch('/apiref/ref/objects',                   { credentials: 'include' }).then(r => r.ok ? r.json() : []),
  ])
  if (results[0].status === 'fulfilled') editCounterparties.value = Array.isArray(results[0].value) ? results[0].value : []
  if (results[1].status === 'fulfilled') editDocTypes.value       = Array.isArray(results[1].value) ? results[1].value : []
  if (results[2].status === 'fulfilled') editWTList.value         = Array.isArray(results[2].value) ? results[2].value : []
  if (results[3].status === 'fulfilled') editUsers.value          = Array.isArray(results[3].value) ? results[3].value : []
  if (results[4].status === 'fulfilled') currentUserId.value      = results[4].value?.id || null
  if (results[5].status === 'fulfilled') editObjectsList.value    = Array.isArray(results[5].value) ? results[5].value : []
}

const refreshCounterparties = async () => {
  const r = await fetch('/apiref/ref/counterparties', { credentials: 'include' })
  if (r.ok) editCounterparties.value = await r.json()
}

const enterEditMode = async () => {
  const c = contract.value
  editForm.value = {
    num:              c.num              || '',
    internal_num:     c.internal_num     || '',
    date:             c.date?.slice(0,10)       || '',
    document_type_id: c.document_type_id || '',
    name:             c.name             || '',
    date_start:       c.date_start?.slice(0,10) || '',
    date_end:         c.date_end?.slice(0,10)   || '',
    sum:              c.sum              ?? 0,
    type:             c.type             || '',
    comment:          c.comment          || '',
    customer_id:      c.customer_id      || '',
    contractor_id:    c.contractor_id    || '',
  }
  acCust.value    = { q: c.customer_name       || '', open: false }
  acContr.value   = { q: c.contractor_name     || '', open: false }
  acDocType.value = { q: c.document_type_name  || '', open: false }
  editSumDisplay.value = formatSumInput(c.sum ?? 0)
  editParties.value    = (c.parties    || []).map(p => ({ ...p, _delete: false, _new: false, _q: p.counterparty_name || p.counterparties_id || '', _open: false }))
  editObjects.value    = (c.objects    || []).map(o => ({ ...o, _delete: false }))
  editWorkTypes.value  = (c.work_types || []).map(w => ({ ...w, contract_work_type_id: w.id, _delete: false, _new: false }))
  const allRoles = c.user_roles || []
  const ex = allRoles.find(r => r.role === 'executor')
  editExecutor.value = ex ? { ...ex, user_id: ex.user?.id || ex.user_id, _changed: false, _q: ex.user?.short_fio || uName(ex.user) || '', _open: false } : null
  editRoles.value = allRoles.filter(r => r.role !== 'executor').map(r => ({ ...r, user_id: r.user?.id || r.user_id, _delete: false, _new: false, _changed: false, _q: r.user?.short_fio || uName(r.user) || '', _open: false, _uid: Math.random() }))
  await loadEditData()
  editMode.value = true
}

const cancelEdit = () => { editMode.value = false; editError.value = '' }

const patchJ = (url, body) => fetch(url, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const postJ  = (url, body) => fetch(url, { method: 'POST',  credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const delReq = (url)       => fetch(url, { method: 'DELETE', credentials: 'include' })

const saveEdit = async () => {
  if (!editForm.value.internal_num?.trim()) { editError.value = 'Внутренний номер обязателен'; return }
  if (!editForm.value.document_type_id)    { editError.value = 'Тип документа обязателен';    return }
  editSaving.value = true; editError.value = ''
  try {
    const cid = route.params.id
    await patchJ(`/apisup/supply/contracts/${cid}`, {
      num:              editForm.value.num              || null,
      internal_num:     editForm.value.internal_num,
      date:             editForm.value.date             || null,
      document_type_id: editForm.value.document_type_id || null,
      name:             editForm.value.name             || null,
      date_start:       editForm.value.date_start       || null,
      date_end:         editForm.value.date_end         || null,
      customer_id:      editForm.value.customer_id      || null,
      contractor_id:    editForm.value.contractor_id    || null,
      type:             editForm.value.type             || null,
      sum:              parseFloat(String(editForm.value.sum).replace(/\s/g,'').replace(',','.')) || 0,
      comment:          editForm.value.comment          || null,
    })
    await Promise.allSettled([
      ...editParties.value.filter(p => p._delete && !p._new).map(p => delReq(`/apisup/supply/contract-parties/${p.id}`)),
      ...editParties.value.filter(p => !p._delete && !p._new).map(p => patchJ(`/apisup/supply/contract-parties/${p.id}`, { counterparties_id: p.counterparties_id, name: p.name })),
      ...editParties.value.filter(p => p._new && !p._delete && p.counterparties_id).map(p => postJ('/apisup/supply/contract-parties', { contract_id: Number(cid), counterparties_id: p.counterparties_id, name: p.name })),
    ])
    await Promise.allSettled([
      ...editObjects.value.filter(o => o._delete && !o._new).map(o => delReq(`/apisup/supply/contract-objects/${o.id}`)),
      ...editObjects.value.filter(o => o._new && !o._delete).map(o => postJ('/apisup/supply/contract-objects', { contract_id: Number(cid), object_id: o.object_id, object_type: o.object_type })),
    ])
    await Promise.allSettled([
      ...editWorkTypes.value.filter(w => w._delete && !w._new).map(w => delReq(`/apisup/supply/work-contracts/${w.id}`)),
      ...editWorkTypes.value.filter(w => w._new && !w._delete).map(w => postJ('/apisup/supply/work-contracts', { contract_id: Number(cid), contract_work_type_id: w.contract_work_type_id })),
    ])
    if (editExecutor.value?._changed && editExecutor.value?.id) {
      await patchJ(`/apisup/supply/contract-user-roles/${editExecutor.value.id}`, { user_id: editExecutor.value.user_id, role: 'executor' })
    }
    await Promise.allSettled([
      ...editRoles.value.filter(r => r._delete && !r._new).map(r => delReq(`/apisup/supply/contract-user-roles/${r.id}`)),
      ...editRoles.value.filter(r => !r._delete && !r._new && r._changed).map(r => patchJ(`/apisup/supply/contract-user-roles/${r.id}`, { user_id: r.user_id, role: r.role })),
      ...editRoles.value.filter(r => r._new && !r._delete && r.user_id).map(r => postJ('/apisup/supply/contract-user-roles', { contract_id: Number(cid), user_id: r.user_id, role: r.role })),
    ])
    await loadContract()
    editMode.value = false
  } catch { editError.value = 'Ошибка при сохранении' }
  finally  { editSaving.value = false }
}

const createDocType = async (name) => {
  try {
    const r = await postJ('/apisup/supply/document-types', { name })
    if (r.ok) {
      const created = await r.json()
      editDocTypes.value.push(created)
      editForm.value.document_type_id = created.id
      acDocType.value = { q: created.name, open: false }
    }
  } catch {}
}

const createWorkType = async (name) => {
  try {
    const r = await postJ('/apisup/supply/contract-work-types', { name })
    if (r.ok) {
      const created = await r.json()
      editWTList.value.push(created)
      addWorkType(created)
    }
  } catch {}
}

const openCreateCounterparty = () => {
  window.open('/organizations/create', '_blank')
  const timer = setInterval(async () => {
    if (document.hasFocus()) {
      clearInterval(timer)
      await refreshCounterparties()
    }
  }, 1000)
  setTimeout(() => clearInterval(timer), 120000)
}

const addObject = (obj) => {
  // Mark all existing non-new objects as deleted (replace semantics)
  editObjects.value.forEach(o => { if (!o._new) o._delete = true })
  // Remove already-new ones that weren't saved
  editObjects.value = editObjects.value.filter(o => !o._new)
  editObjects.value.push({ id: null, object_id: obj.id, object_name: obj.short_name, object_type: 'object', _new: true, _delete: false })
  acNewObj.value = { q: '', open: false }
}

const addParty = () => editParties.value.push({ id: null, counterparties_id: '', counterparty_name: '', name: '', _new: true, _delete: false, _q: '', _open: false })

const addRole = (role) => editRoles.value.push({ id: null, user_id: '', user: null, role, _new: true, _delete: false, _changed: false, _q: '', _open: false, _uid: Math.random() })

const addWorkType = (wt) => {
  editWorkTypes.value.push({ id: null, contract_work_type_id: wt.id, contract_work_type_name: wt.name, _new: true, _delete: false })
  acNewWT.value = { q: '', open: false }
}

const selectCP = (target, cp) => {
  target.customer_id = cp.id; target.q = cp.short_name; target.open = false
}

const closeAllDropdowns = (e) => {
  if (!editMode.value) return
  if (e.target.closest('.ac-wrap')) return
  acCust.value.open    = false
  acContr.value.open   = false
  acDocType.value.open = false
  acNewWT.value.open   = false
  acNewObj.value.open  = false
  if (editExecutor.value) editExecutor.value._open = false
  editParties.value.forEach(p => { p._open = false })
  editRoles.value.forEach(r => { r._open = false })
}

onMounted(() => {
  loadContract()
  document.addEventListener('mousedown', closeAllDropdowns)
})
onUnmounted(() => {
  document.removeEventListener('mousedown', closeAllDropdowns)
})
</script>

<template>
  <div class="page-wrap">
    <TopNav :links="navLinks" />

    <div v-if="loading" class="state-full"><div class="spinner"></div> Загрузка...</div>
    <div v-else-if="error" class="state-full state-error"><i class="fas fa-exclamation-circle"></i> {{ error }}</div>

    <template v-else-if="contract">
      <!-- ── Header ── -->
      <div class="contract-header">
        <div class="header-top">
          <button class="back-btn" @click="router.push('/documents')">
            <i class="fas fa-arrow-left"></i> Реестр договоров
          </button>
          <div class="header-meta">
            <span class="meta-num">№ {{ contract.internal_num || contract.id }}</span>
            <span class="meta-sep">·</span>
            <span class="meta-date">{{ formatDate(contract.date) }}</span>
            <span v-if="contract.type" class="type-badge" :class="`type-badge--${contract.type}`">{{ typeLabel(contract.type) }}</span>
          </div>
        </div>
        <div class="header-title-row">
          <h1 class="contract-title">{{ contract.full_name || contract.name || '—' }}</h1>
          <button v-if="activeTab === 'main' && !editMode" class="edit-contract-btn" @click="enterEditMode">
            <i class="fas fa-pencil-alt"></i> Редактировать
          </button>
        </div>
        <div v-if="contract.document_type_name" class="contract-type-label">
          <i class="fas fa-tag"></i> {{ contract.document_type_name }}
        </div>
      </div>

      <!-- ── Tabs ── -->
      <div class="tabs-bar">
        <button
          v-for="tab in tabs" :key="tab.key"
          class="tab-btn" :class="{ active: activeTab === tab.key }"
          @click="setTab(tab.key)"
        >{{ tab.label }}</button>
      </div>

      <!-- ── Edit save bar ── -->
      <div v-if="editMode" class="edit-save-bar">
        <div class="edit-save-left">
          <i class="fas fa-pencil-alt"></i> Режим редактирования
          <span v-if="editError" class="edit-error-msg"><i class="fas fa-exclamation-circle"></i> {{ editError }}</span>
        </div>
        <div class="edit-save-actions">
          <button class="edit-cancel-btn" :disabled="editSaving" @click="cancelEdit">Отмена</button>
          <button class="edit-save-btn" :disabled="editSaving" @click="saveEdit">
            <div v-if="editSaving" class="mini-spinner"></div>
            <span v-else><i class="fas fa-check"></i> Сохранить</span>
          </button>
        </div>
      </div>

      <!-- ── Tab: Основная информация ── -->
      <div v-if="activeTab === 'main'" class="main-content">

        <!-- Стороны договора -->
        <section class="info-section">
          <div class="section-heading"><i class="fas fa-handshake"></i> Стороны договора</div>
          <div v-if="!editMode" class="cards-row">
            <div class="party-card">
              <div class="party-role">Заказчик</div>
              <div class="party-name">{{ contract.customer_name || '—' }}</div>
            </div>
            <div class="party-card">
              <div class="party-role">Подрядчик</div>
              <div class="party-name">{{ contract.contractor_name || '—' }}</div>
            </div>
            <div v-for="p in extraParties" :key="p.id" class="party-card party-card--extra">
              <div class="party-role">{{ p.name || 'Доп. сторона' }}</div>
              <div class="party-name">{{ p.counterparty_name || p.counterparties_id }}</div>
            </div>
          </div>
          <div v-else class="edit-parties">
            <!-- Заказчик + Подрядчик рядом -->
            <div class="edit-party-pair">
            <div class="edit-party-card">
              <div class="edit-field-group">
              <div class="edit-field-label">Заказчик</div>
              <div class="ac-wrap">
                <input class="edit-input" v-model="acCust.q" placeholder="Поиск организации..."
                  @focus="acCust.open=true" @blur="setTimeout(()=>acCust.open=false,160)" />
                <div v-if="acCust.open" class="ac-drop">
                  <div v-for="cp in filterCPs(acCust.q)" :key="cp.id" class="ac-item"
                    @mousedown.prevent="editForm.customer_id=cp.id; acCust.q=cp.short_name; acCust.open=false">
                    {{ cp.short_name }}
                  </div>
                  <div v-if="acCust.q.trim() && !filterCPs(acCust.q).length" class="ac-create"
                    @mousedown.prevent="openCreateCounterparty">
                    <i class="fas fa-plus-circle"></i> Создать контрагента: «{{ acCust.q.trim() }}»
                  </div>
                  <div v-if="!acCust.q.trim()" class="ac-empty">Начните вводить название</div>
                </div>
              </div>
            </div>
            </div><!-- /edit-party-card заказчик -->
            <!-- Подрядчик -->
            <div class="edit-party-card">
              <div class="edit-field-group">
              <div class="edit-field-label">Подрядчик</div>
              <div class="ac-wrap">
                <input class="edit-input" v-model="acContr.q" placeholder="Поиск организации..."
                  @focus="acContr.open=true" @blur="setTimeout(()=>acContr.open=false,160)" />
                <div v-if="acContr.open" class="ac-drop">
                  <div v-for="cp in filterCPs(acContr.q)" :key="cp.id" class="ac-item"
                    @mousedown.prevent="editForm.contractor_id=cp.id; acContr.q=cp.short_name; acContr.open=false">
                    {{ cp.short_name }}
                  </div>
                  <div v-if="acContr.q.trim() && !filterCPs(acContr.q).length" class="ac-create"
                    @mousedown.prevent="openCreateCounterparty">
                    <i class="fas fa-plus-circle"></i> Создать контрагента: «{{ acContr.q.trim() }}»
                  </div>
                  <div v-if="!acContr.q.trim()" class="ac-empty">Начните вводить название</div>
                </div>
              </div>
              </div>
            </div>
            </div><!-- /edit-party-pair -->
            <!-- Дополнительные стороны -->
            <div v-for="(p, idx) in editParties" :key="idx" class="edit-party-row" :class="{ 'edit-party--deleted': p._delete }">
              <div class="edit-field-group" style="flex:1">
                <div class="edit-field-label">Роль / название стороны</div>
                <input class="edit-input" v-model="p.name" placeholder="Название роли" :disabled="p._delete" />
              </div>
              <div class="edit-field-group" style="flex:2; position:relative">
                <div class="edit-field-label">Организация</div>
                <div class="ac-wrap">
                  <input class="edit-input" v-model="p._q" placeholder="Поиск..." :disabled="p._delete"
                    @focus="p._open=true" @blur="setTimeout(()=>p._open=false,160)" />
                  <div v-if="p._open && !p._delete" class="ac-drop">
                    <div v-for="cp in filterCPs(p._q)" :key="cp.id" class="ac-item"
                      @mousedown.prevent="p.counterparties_id=cp.id; p._q=cp.short_name; p._open=false">
                      {{ cp.short_name }}
                    </div>
                    <div v-if="p._q.trim() && !filterCPs(p._q).length" class="ac-create"
                      @mousedown.prevent="openCreateCounterparty">
                      <i class="fas fa-plus-circle"></i> Создать контрагента: «{{ p._q.trim() }}»
                    </div>
                    <div v-if="!p._q.trim()" class="ac-empty">Начните вводить название</div>
                  </div>
                </div>
              </div>
              <button class="edit-row-del-btn" :title="p._delete ? 'Восстановить' : 'Удалить'"
                @click="p._delete=!p._delete">
                <i class="fas" :class="p._delete ? 'fa-undo' : 'fa-times'"></i>
              </button>
            </div>
            <button class="edit-add-btn" @click="addParty">
              <i class="fas fa-plus"></i> Добавить сторону
            </button>
          </div>
        </section>

        <!-- Основные реквизиты -->
        <section class="info-section">
          <div class="section-heading"><i class="fas fa-file-alt"></i> Реквизиты договора</div>
          <div v-if="!editMode" class="fields-grid">
            <div class="field-item">
              <div class="field-key">Номер договора</div>
              <div class="field-val mono">{{ contract.num || '—' }}</div>
            </div>
            <div class="field-item">
              <div class="field-key">Внутренний №</div>
              <div class="field-val mono">{{ contract.internal_num || '—' }}</div>
            </div>
            <div class="field-item">
              <div class="field-key">Тип документа</div>
              <div class="field-val">{{ contract.document_type_name || '—' }}</div>
            </div>
            <div class="field-item">
              <div class="field-key">Предмет договора</div>
              <div class="field-val">{{ contract.name || '—' }}</div>
            </div>
          </div>
          <div v-else class="edit-fields-grid">
            <div class="edit-field-group">
              <div class="edit-field-label">Номер договора</div>
              <input class="edit-input mono" v-model="editForm.num" placeholder="Номер договора" />
            </div>
            <div class="edit-field-group">
              <div class="edit-field-label">Внутренний № <span class="required-mark">*</span></div>
              <input class="edit-input mono" v-model="editForm.internal_num" placeholder="Обязательное поле" />
            </div>
            <div class="edit-field-group">
              <div class="edit-field-label">Тип документа <span class="required-mark">*</span></div>
              <div class="ac-wrap">
                <input class="edit-input" v-model="acDocType.q" placeholder="Поиск типа документа..."
                  @focus="acDocType.open=true" @blur="setTimeout(()=>acDocType.open=false,160)" />
                <div v-if="acDocType.open" class="ac-drop">
                  <div v-for="dt in filterDocTypes(acDocType.q)" :key="dt.id" class="ac-item"
                    @mousedown.prevent="editForm.document_type_id=dt.id; acDocType.q=dt.name; acDocType.open=false">
                    {{ dt.name }}
                  </div>
                  <div v-if="acDocType.q.trim() && !filterDocTypes(acDocType.q).length" class="ac-create"
                    @mousedown.prevent="createDocType(acDocType.q.trim())">
                    <i class="fas fa-plus-circle"></i> Создать тип: «{{ acDocType.q.trim() }}»
                  </div>
                  <div v-else-if="!filterDocTypes(acDocType.q).length" class="ac-empty">Нет типов</div>
                </div>
              </div>
            </div>
            <div class="edit-field-group full">
              <div class="edit-field-label">Предмет договора</div>
              <input class="edit-input" v-model="editForm.name" placeholder="Предмет договора" />
            </div>
          </div>
        </section>

        <!-- Сроки -->
        <section class="info-section">
          <div class="section-heading"><i class="fas fa-calendar-alt"></i> Сроки</div>
          <div v-if="!editMode" class="fields-grid">
            <div class="field-item">
              <div class="field-key">Дата договора</div>
              <div class="field-val">{{ formatDate(contract.date) }}</div>
            </div>
            <div class="field-item">
              <div class="field-key">Дата начала работ</div>
              <div class="field-val">{{ formatDate(contract.date_start) }}</div>
            </div>
            <div class="field-item">
              <div class="field-key">Дата окончания работ</div>
              <div class="field-val">{{ formatDate(contract.date_end) }}</div>
            </div>
            <div class="field-item">
              <div class="field-key">Дата завершения</div>
              <div class="field-val">{{ formatDate(contract.date_completed) }}</div>
            </div>
          </div>
          <div v-else class="edit-fields-grid">
            <div class="edit-field-group">
              <div class="edit-field-label">Дата договора</div>
              <input type="date" class="edit-input" v-model="editForm.date" />
            </div>
            <div class="edit-field-group">
              <div class="edit-field-label">Дата начала работ</div>
              <input type="date" class="edit-input" v-model="editForm.date_start" />
            </div>
            <div class="edit-field-group">
              <div class="edit-field-label">Дата окончания работ</div>
              <input type="date" class="edit-input" v-model="editForm.date_end" />
            </div>
            <div class="edit-field-group">
              <div class="edit-field-label">Дата завершения</div>
              <div class="field-val" style="padding-top:2px">{{ formatDate(contract.date_completed) || '—' }}</div>
            </div>
          </div>
        </section>

        <!-- Финансовая информация -->
        <section class="info-section">
          <div class="section-heading"><i class="fas fa-ruble-sign"></i> Финансовая информация</div>
          <div v-if="!editMode" class="fields-grid">
            <div class="field-item">
              <div class="field-key">Сумма договора</div>
              <div class="field-val field-val--amount">{{ formatMoney(contract.sum) }}</div>
            </div>
            <div class="field-item">
              <div class="field-key">Тип</div>
              <div class="field-val">
                <span v-if="contract.type" class="type-badge" :class="`type-badge--${contract.type}`">{{ typeLabel(contract.type) }}</span>
                <span v-else>—</span>
              </div>
            </div>
          </div>
          <div v-else class="edit-fields-grid">
            <div class="edit-field-group">
              <div class="edit-field-label">Сумма договора, ₽</div>
              <input class="edit-input" :value="editSumDisplay"
                @focus="onSumFocus" @input="onSumInput" @blur="onSumBlur" placeholder="0,00" />
            </div>
            <div class="edit-field-group">
              <div class="edit-field-label">Тип</div>
              <select class="edit-select" v-model="editForm.type">
                <option value="buyer">Покупатель</option>
                <option value="provide">Поставщик</option>
              </select>
            </div>
          </div>
        </section>

        <!-- Объект и проекты -->
        <section class="info-section">
          <div class="section-heading"><i class="fas fa-building"></i> Объект</div>
          <div v-if="!editMode">
            <div v-if="contract.objects?.length" class="tags-list">
              <div v-for="obj in contract.objects" :key="obj.id" class="object-row">
                <i class="fas fa-map-marker-alt"></i>
                <span>{{ obj.object_name || obj.object_id }}</span>
                <span class="obj-type-badge">{{ obj.object_type === 'object' ? 'Объект' : 'Проект' }}</span>
              </div>
            </div>
            <div v-else class="empty-hint">Объекты не указаны</div>
          </div>
          <div v-else>
            <div class="tags-list" style="margin-bottom:10px">
              <div v-for="obj in editObjects" :key="obj.object_id + (obj._new ? '_new' : '')"
                class="object-row object-row--edit" :class="{ 'edit-item--deleted': obj._delete }">
                <i class="fas fa-map-marker-alt"></i>
                <span class="object-row__name">{{ obj.object_name || obj.object_id }}</span>
                <span class="obj-type-badge">{{ obj.object_type === 'object' ? 'Объект' : 'Проект' }}</span>
                <button class="edit-row-del-btn"
                  :title="obj._delete ? 'Восстановить' : 'Удалить'"
                  @click="obj._delete=!obj._delete">
                  <i class="fas" :class="obj._delete ? 'fa-undo' : 'fa-times'"></i>
                </button>
              </div>
              <div v-if="!editObjects.length" class="empty-hint">Объекты не указаны</div>
            </div>
            <div class="ac-wrap" style="max-width:360px; position:relative">
              <input class="edit-input" v-model="acNewObj.q" placeholder="Добавить объект..."
                @focus="acNewObj.open=true" @blur="setTimeout(()=>acNewObj.open=false,160)" />
              <div v-if="acNewObj.open" class="ac-drop">
                <div v-for="obj in filteredEditObjects" :key="obj.id" class="ac-item"
                  @mousedown.prevent="addObject(obj)">{{ obj.short_name }}</div>
                <div v-if="!filteredEditObjects.length" class="ac-empty">Объекты не найдены</div>
              </div>
            </div>
          </div>
        </section>

        <!-- Виды работ -->
        <section class="info-section">
          <div class="section-heading"><i class="fas fa-tools"></i> Виды работ</div>
          <div v-if="!editMode">
            <div v-if="contract.work_types?.length" class="tags-list tags-list--wrap">
              <span v-for="wt in contract.work_types" :key="wt.id" class="wt-chip">{{ wt.contract_work_type_name }}</span>
            </div>
            <div v-else class="empty-hint">Виды работ не указаны</div>
          </div>
          <div v-else>
            <div class="wt-chips-edit">
              <div v-for="wt in editWorkTypes" :key="wt.contract_work_type_id"
                class="wt-chip wt-chip--edit" :class="{ 'wt-chip--deleted': wt._delete }">
                {{ wt.contract_work_type_name }}
                <button class="wt-del-btn" :title="wt._delete ? 'Восстановить' : 'Удалить'" @click="wt._delete=!wt._delete">
                  <i class="fas" :class="wt._delete ? 'fa-undo' : 'fa-times'"></i>
                </button>
              </div>
              <div v-if="!editWorkTypes.length" class="empty-hint" style="padding:0">Нет видов работ</div>
            </div>
            <div class="ac-wrap" style="max-width:320px; position:relative">
              <input class="edit-input" v-model="acNewWT.q" placeholder="Добавить вид работ..."
                @focus="acNewWT.open=true" @blur="setTimeout(()=>acNewWT.open=false,160)" />
              <div v-if="acNewWT.open" class="ac-drop">
                <div v-for="wt in filteredNewWTs" :key="wt.id" class="ac-item"
                  @mousedown.prevent="addWorkType(wt)">{{ wt.name }}</div>
                <div v-if="acNewWT.q.trim() && !filteredNewWTs.length" class="ac-create"
                  @mousedown.prevent="createWorkType(acNewWT.q.trim())">
                  <i class="fas fa-plus-circle"></i> Создать вид работ: «{{ acNewWT.q.trim() }}»
                </div>
                <div v-else-if="!filteredNewWTs.length" class="ac-empty">Нет доступных видов работ</div>
              </div>
            </div>
          </div>
        </section>

        <!-- Ответственные -->
        <section class="info-section">
          <div class="section-heading"><i class="fas fa-users"></i> Ответственные лица</div>
          <div v-if="!editMode" class="persons-grid">
            <div class="persons-col">
              <div class="persons-col-label">Ответственный</div>
              <div v-if="executor" class="person-row">
                <div class="person-avatar">{{ executor.user?.name?.[0] }}{{ executor.user?.surname?.[0] }}</div>
                <div class="person-info">
                  <div class="person-name">{{ executor.user?.short_fio }}</div>
                  <div class="person-role">Ответственный</div>
                </div>
              </div>
              <div v-else class="empty-hint">Не назначен</div>
            </div>
            <div class="persons-col">
              <div class="persons-col-label">Исполнители</div>
              <div v-if="coExecutors.length">
                <div v-for="r in coExecutors" :key="r.id" class="person-row">
                  <div class="person-avatar person-avatar--co">{{ r.user?.name?.[0] }}{{ r.user?.surname?.[0] }}</div>
                  <div class="person-info">
                    <div class="person-name">{{ r.user?.short_fio }}</div>
                    <div class="person-role">Исполнитель</div>
                  </div>
                </div>
              </div>
              <div v-else class="empty-hint">Не назначены</div>
            </div>
            <div class="persons-col">
              <div class="persons-col-label">Наблюдатели</div>
              <div v-if="observers.length">
                <div v-for="r in observers" :key="r.id" class="person-row">
                  <div class="person-avatar person-avatar--obs">{{ r.user?.name?.[0] }}{{ r.user?.surname?.[0] }}</div>
                  <div class="person-info">
                    <div class="person-name">{{ r.user?.short_fio }}</div>
                    <div class="person-role">Наблюдатель</div>
                  </div>
                </div>
              </div>
              <div v-else class="empty-hint">Не назначены</div>
            </div>
          </div>
          <div v-else class="edit-roles">
            <!-- Ответственный (обязателен, нельзя удалить) -->
            <div class="edit-roles-group">
              <div class="edit-roles-label">Ответственный <span class="required-mark">*</span></div>
              <div v-if="editExecutor" class="ac-wrap">
                <input class="edit-input" v-model="editExecutor._q" placeholder="Поиск пользователя..."
                  @focus="editExecutor._open=true" @blur="setTimeout(()=>editExecutor._open=false,160)" />
                <div v-if="editExecutor._open" class="ac-drop">
                  <div v-for="u in filterUsers(editExecutor._q)" :key="u.id" class="ac-item"
                    :class="{ 'ac-item--disabled': u.id === currentUserId }"
                    @mousedown.prevent="u.id !== currentUserId && (editExecutor.user_id=u.id, editExecutor._q=uName(u), editExecutor._open=false, editExecutor._changed=true)">
                    {{ uName(u) }}
                    <span v-if="u.id === currentUserId" class="ac-self-label">Вы</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Исполнители -->
            <div class="edit-roles-group">
              <div class="edit-roles-label">Исполнители</div>
              <div v-for="r in editCoExecutors" :key="r._uid || r.id"
                class="edit-role-row" :class="{ 'edit-item--deleted': r._delete }">
                <div class="ac-wrap" style="flex:1; position:relative">
                  <input class="edit-input" v-model="r._q" :disabled="r._delete"
                    @focus="r._open=true" @blur="setTimeout(()=>r._open=false,160)" />
                  <div v-if="r._open && !r._delete" class="ac-drop">
                    <div v-for="u in filterUsers(r._q)" :key="u.id" class="ac-item"
                      :class="{ 'ac-item--disabled': u.id === currentUserId }"
                      @mousedown.prevent="u.id !== currentUserId && (r.user_id=u.id, r._q=uName(u), r._open=false, r._changed=true)">
                      {{ uName(u) }}
                      <span v-if="u.id === currentUserId" class="ac-self-label">Вы</span>
                    </div>
                  </div>
                </div>
                <button class="edit-row-del-btn"
                  :disabled="r.user_id === currentUserId"
                  :title="r.user_id === currentUserId ? 'Нельзя удалить себя' : (r._delete ? 'Восстановить' : 'Удалить')"
                  @click="r.user_id !== currentUserId && (r._delete=!r._delete)">
                  <i class="fas" :class="r._delete ? 'fa-undo' : 'fa-times'"></i>
                </button>
              </div>
              <div v-if="!editCoExecutors.length" class="empty-hint" style="margin-bottom:6px">Нет исполнителей</div>
              <button class="edit-add-btn" @click="addRole('co-executor')">
                <i class="fas fa-plus"></i> Добавить исполнителя
              </button>
            </div>

            <!-- Наблюдатели -->
            <div class="edit-roles-group">
              <div class="edit-roles-label">Наблюдатели</div>
              <div v-for="r in editObservers" :key="r._uid || r.id"
                class="edit-role-row" :class="{ 'edit-item--deleted': r._delete }">
                <div class="ac-wrap" style="flex:1; position:relative">
                  <input class="edit-input" v-model="r._q" :disabled="r._delete"
                    @focus="r._open=true" @blur="setTimeout(()=>r._open=false,160)" />
                  <div v-if="r._open && !r._delete" class="ac-drop">
                    <div v-for="u in filterUsers(r._q)" :key="u.id" class="ac-item"
                      :class="{ 'ac-item--disabled': u.id === currentUserId }"
                      @mousedown.prevent="u.id !== currentUserId && (r.user_id=u.id, r._q=uName(u), r._open=false, r._changed=true)">
                      {{ uName(u) }}
                      <span v-if="u.id === currentUserId" class="ac-self-label">Вы</span>
                    </div>
                  </div>
                </div>
                <button class="edit-row-del-btn"
                  :disabled="r.user_id === currentUserId"
                  :title="r.user_id === currentUserId ? 'Нельзя удалить себя' : (r._delete ? 'Восстановить' : 'Удалить')"
                  @click="r.user_id !== currentUserId && (r._delete=!r._delete)">
                  <i class="fas" :class="r._delete ? 'fa-undo' : 'fa-times'"></i>
                </button>
              </div>
              <div v-if="!editObservers.length" class="empty-hint" style="margin-bottom:6px">Нет наблюдателей</div>
              <button class="edit-add-btn" @click="addRole('observer')">
                <i class="fas fa-plus"></i> Добавить наблюдателя
              </button>
            </div>
          </div>
        </section>

        <!-- Примечание -->
        <section class="info-section">
          <div class="section-heading"><i class="fas fa-comment-alt"></i> Примечание</div>
          <div v-if="!editMode">
            <div v-if="contract.comment" class="comment-box">{{ contract.comment }}</div>
            <div v-else class="empty-hint">Не указано</div>
          </div>
          <div v-else class="edit-field-group">
            <div class="edit-field-label">Примечание (необязательно)</div>
            <textarea class="edit-textarea" v-model="editForm.comment" placeholder="Введите примечание..." rows="4"></textarea>
          </div>
        </section>

        <!-- Системная информация -->
        <section class="info-section info-section--sys">
          <div class="section-heading"><i class="fas fa-info-circle"></i> Системная информация</div>
          <div class="fields-grid">
            <div class="field-item">
              <div class="field-key">Создан</div>
              <div class="field-val">{{ formatDate(contract.created_at) }}</div>
            </div>
            <div class="field-item">
              <div class="field-key">Создатель</div>
              <div class="field-val">{{ contract.created_by_user?.short_fio || '—' }}</div>
            </div>
            <div class="field-item">
              <div class="field-key">Обновлён</div>
              <div class="field-val">{{ formatDate(contract.updated_at) }}</div>
            </div>
          </div>
        </section>

      </div>

      <!-- ── Tab: Документы ── -->
      <div v-else-if="activeTab === 'docs'" class="docs-wrap"
        @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop">

        <!-- Drop overlay -->
        <div v-if="dropActive" class="drop-overlay">
          <div class="drop-overlay-inner">
            <i class="fas fa-cloud-upload-alt"></i>
            <span>Отпустите файлы для загрузки{{ currentFolder ? ` в «${currentFolder.name}»` : '' }}</span>
          </div>
        </div>

        <!-- Upload cards -->
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

        <!-- File browser -->
        <div class="docs-browser-section">
          <div class="docs-browser-header">
            <div class="docs-section-title" style="margin-bottom:0">Файлы договора</div>
            <button class="create-folder-btn" @click="createFolderModal.show = true">
              <i class="fas fa-folder-plus"></i> Создать папку
            </button>
          </div>

          <div v-if="treeLoading" class="state-msg"><div class="mini-spinner"></div> Загрузка...</div>
          <div v-else-if="treeError" class="state-msg state-error">{{ treeError }}</div>
          <div v-else class="browser">
            <!-- Breadcrumb -->
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

            <!-- Contents -->
            <div class="browser-list">
              <!-- Folders -->
              <div v-for="folder in currentItems.folders" :key="folder.id"
                class="browser-row browser-row--folder" @click="openFolder(folder)">
                <i class="fas fa-folder browser-row-icon" style="color:#f59e0b"></i>
                <div class="browser-row-name">{{ folder.name }}</div>
                <div class="browser-row-meta">
                  {{ (folder.children?.length || 0) + (folder.files?.length || 0) }} элем.
                </div>
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

              <!-- Files -->
              <div v-for="file in currentItems.files" :key="file.id" class="browser-row browser-row--file">
                <i class="fas browser-row-icon" :class="fileIcon(file.extension)"
                  :style="{ color: fileColor(file.extension) }"></i>
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

        <!-- Modal: Rename -->
        <div v-if="renameModal.show" class="modal-backdrop" @click.self="renameModal.show = false">
          <div class="modal-box">
            <div class="modal-title">
              {{ renameModal.type === 'file' ? 'Переименовать файл' : 'Переименовать папку' }}
            </div>
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

        <!-- Modal: Delete -->
        <div v-if="deleteModal.show" class="modal-backdrop" @click.self="deleteModal.show = false">
          <div class="modal-box">
            <div class="modal-title modal-title--danger">
              {{ deleteModal.type === 'file' ? 'Удалить файл?' : 'Удалить папку?' }}
            </div>
            <div class="modal-body">
              Вы уверены, что хотите удалить
              <strong>«{{ deleteModal.name }}»</strong>?
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

        <!-- Modal: Preview -->
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
            <!-- Loading -->
            <div v-if="preview.loading" class="preview-state">
              <div class="spinner"></div>
              <span>Загрузка...</span>
            </div>
            <!-- Error -->
            <div v-else-if="preview.error" class="preview-state preview-state--error">
              <i class="fas fa-exclamation-circle"></i>
              {{ preview.error }}
            </div>
            <!-- PDF / DOCX / XLSX — все рендерятся как PDF -->
            <embed v-else-if="['pdf','docx','doc','xlsx','xls'].includes(preview.file?.extension?.toLowerCase()) && preview.blobUrl"
              :src="preview.blobUrl" type="application/pdf" class="preview-embed" />
            <!-- Image -->
            <div v-else-if="previewType(preview.file?.extension) === 'image'" class="preview-image-wrap">
              <img :src="preview.blobUrl" class="preview-image" :alt="preview.file?.original_name" />
            </div>
            <!-- Unsupported -->
            <div v-else class="preview-state preview-state--unsupported">
              <i class="fas fa-file-alt preview-state-icon"></i>
              <div class="preview-state-title">Предпросмотр недоступен</div>
              <div class="preview-state-sub">
                Файлы формата <strong>.{{ preview.file?.extension }}</strong> нельзя открыть в браузере.
              </div>
              <button class="upload-btn" style="margin-top:8px" @click="downloadFile(preview.file)">
                <i class="fas fa-download"></i> Скачать файл
              </button>
            </div>
          </div>
        </div>

        <!-- Modal: Create folder -->
        <div v-if="createFolderModal.show" class="modal-backdrop" @click.self="createFolderModal.show = false">
          <div class="modal-box">
            <div class="modal-title">Создать папку</div>
            <div v-if="currentFolder" class="modal-hint">
              Внутри «{{ currentFolder.name }}»
            </div>
            <input class="modal-input" v-model="createFolderModal.name" placeholder="Название папки"
              @keyup.enter="submitCreateFolder" @keyup.esc="createFolderModal.show = false" autofocus />
            <div class="modal-actions">
              <button class="modal-btn modal-btn--cancel" @click="createFolderModal.show = false">Отмена</button>
              <button class="modal-btn modal-btn--ok" :disabled="createFolderModal.loading || !createFolderModal.name.trim()"
                @click="submitCreateFolder">
                <div v-if="createFolderModal.loading" class="mini-spinner"></div>
                <span v-else>Создать</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Tab: Просмотр договора ── -->
      <div v-else-if="activeTab === 'viewer'" class="viewer-layout">

        <!-- Left: contract info -->
        <div class="viewer-left">
          <div class="viewer-info-title">Информация о договоре</div>

          <div class="viewer-info-block">
            <div class="viewer-info-label">Номер договора</div>
            <div class="viewer-info-val mono">{{ contract.num || '—' }}</div>
          </div>
          <div class="viewer-info-block">
            <div class="viewer-info-label">Дата</div>
            <div class="viewer-info-val">{{ formatDate(contract.date) }}</div>
          </div>
          <div class="viewer-info-block">
            <div class="viewer-info-label">Тип документа</div>
            <div class="viewer-info-val">{{ contract.document_type_name || '—' }}</div>
          </div>
          <div class="viewer-info-block">
            <div class="viewer-info-label">Предмет</div>
            <div class="viewer-info-val">{{ contract.name || '—' }}</div>
          </div>

          <div class="viewer-info-divider"></div>

          <div class="viewer-info-block">
            <div class="viewer-info-label">Заказчик</div>
            <div class="viewer-info-val">{{ contract.customer_name || '—' }}</div>
          </div>
          <div class="viewer-info-block">
            <div class="viewer-info-label">Подрядчик</div>
            <div class="viewer-info-val">{{ contract.contractor_name || '—' }}</div>
          </div>

          <div class="viewer-info-divider"></div>

          <div class="viewer-info-block">
            <div class="viewer-info-label">Дата начала</div>
            <div class="viewer-info-val">{{ formatDate(contract.date_start) }}</div>
          </div>
          <div class="viewer-info-block">
            <div class="viewer-info-label">Дата окончания</div>
            <div class="viewer-info-val">{{ formatDate(contract.date_end) }}</div>
          </div>

          <div class="viewer-info-divider"></div>

          <div class="viewer-info-block">
            <div class="viewer-info-label">Сумма</div>
            <div class="viewer-info-val viewer-info-val--amount">{{ formatMoney(contract.sum) }}</div>
          </div>
          <div class="viewer-info-block">
            <div class="viewer-info-label">Тип</div>
            <div class="viewer-info-val">
              <span v-if="contract.type" class="type-badge" :class="`type-badge--${contract.type}`">{{ typeLabel(contract.type) }}</span>
              <span v-else>—</span>
            </div>
          </div>

          <div class="viewer-info-divider"></div>

          <div class="viewer-info-block">
            <div class="viewer-info-label">Ответственный</div>
            <div class="viewer-info-val">{{ executor?.user?.short_fio || '—' }}</div>
          </div>

          <div class="viewer-info-divider"></div>

          <div class="viewer-info-block">
            <div class="viewer-info-label">Кем создано</div>
            <div class="viewer-info-val">{{ contract.created_by_user?.short_fio || '—' }}</div>
          </div>
          <div class="viewer-info-block">
            <div class="viewer-info-label">Дата создания</div>
            <div class="viewer-info-val">{{ formatDateTime(contract.created_at) }}</div>
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
            <i class="fas fa-file-contract" style="font-size:48px;color:#e2e8f0;margin-bottom:12px"></i>
            <div style="color:#94a3b8">Файлы договора не найдены</div>
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

        <!-- Right: tabs -->
        <div class="viewer-right">
          <div class="viewer-right-tabs">
            <button class="viewer-right-tab" :class="{ active: viewerRightTab === 'files' }"
              @click="viewerRightTab = 'files'">Файлы</button>
            <button class="viewer-right-tab" :class="{ active: viewerRightTab === 'links' }"
              @click="viewerRightTab = 'links'">Связи</button>
          </div>

          <!-- Files timeline -->
          <div v-if="viewerRightTab === 'files'" class="viewer-file-list">
            <!-- Upload buttons -->
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
                <i class="fas fa-file-contract"></i> Версия
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

          <!-- Links -->
          <div v-else-if="viewerRightTab === 'links'" class="viewer-file-empty">
            <i class="fas fa-link" style="font-size:32px;color:#e2e8f0;margin-bottom:10px"></i>
            <div>Связи не настроены</div>
          </div>
        </div>
      </div>

      <!-- ── Tab: История ── -->
      <div v-else-if="activeTab === 'history'" class="history-wrap">
        <div v-if="logsLoading" class="state-full"><div class="spinner"></div> Загрузка...</div>
        <div v-else-if="logsError" class="state-full state-error"><i class="fas fa-exclamation-circle"></i> {{ logsError }}</div>
        <div v-else-if="!logs.length" class="tab-empty">
          <i class="fas fa-history tab-empty-icon"></i>
          <p class="tab-empty-title">История пуста</p>
          <p class="tab-empty-sub">Действия по договору появятся здесь</p>
        </div>
        <div v-else class="log-list">
          <div v-for="log in logs" :key="log.id" class="log-item">
            <div class="log-avatar">
              {{ log.created_by_user?.name?.[0] }}{{ log.created_by_user?.surname?.[0] }}
            </div>
            <div class="log-body">
              <div class="log-message">{{ log.full_log || log.message }}</div>
              <div class="log-meta">
                <span class="log-author">{{ log.created_by_user?.short_fio }}</span>
                <span class="log-sep">·</span>
                <span class="log-time">{{ formatDateTime(log.created_at) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.page-wrap {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: var(--bg-page);
}

/* ── States ── */
.state-full {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  font-size: 15px;
  color: var(--text-secondary);
}
.state-error { color: #ef4444; }

.spinner {
  width: 20px; height: 20px;
  border: 2px solid var(--border-light);
  border-top-color: var(--brand-primary);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Header ── */
.contract-header {
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-light);
  padding: 16px 32px 18px;
  flex-shrink: 0;
}

.header-top {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 10px;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  font-size: 12px;
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
}
.back-btn:hover { color: var(--brand-primary); }

.header-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
}
.meta-sep { color: var(--text-tertiary); }
.meta-num { font-family: 'JetBrains Mono', monospace; font-weight: 600; }

.contract-title {
  margin: 0 0 6px;
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.35;
}

.contract-type-label {
  font-size: 12px;
  color: var(--text-tertiary);
  display: flex;
  align-items: center;
  gap: 5px;
}

/* ── Tabs ── */
.tabs-bar {
  display: flex;
  gap: 0;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-light);
  padding: 0 32px;
  flex-shrink: 0;
}

.tab-btn {
  height: 42px;
  padding: 0 16px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color 0.15s, border-color 0.15s;
}
.tab-btn:hover { color: var(--text-primary); }
.tab-btn.active { color: var(--brand-primary); border-bottom-color: var(--brand-primary); font-weight: 600; }

/* ── Main content ── */
.main-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px 32px 40px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ── Sections ── */
.info-section {
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  padding: 20px 24px;
  box-shadow: var(--shadow-sm);
}

.info-section--sys {
  background: var(--bg-subtle);
  border-style: dashed;
  box-shadow: none;
}

.section-heading {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 7px;
}
.section-heading i { color: var(--brand-primary); font-size: 13px; }

/* ── Parties ── */
.cards-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.party-card {
  flex: 1;
  min-width: 200px;
  padding: 14px 16px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
}
.party-card--extra { border-style: dashed; }

.party-role {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-tertiary);
  margin-bottom: 5px;
}

.party-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.3;
}

/* ── Fields grid ── */
.fields-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px 24px;
}

.field-item {}

.field-key {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 4px;
}

.field-val {
  font-size: 14px;
  color: var(--text-primary);
  line-height: 1.4;
}
.field-val.mono { font-family: 'JetBrains Mono', monospace; }
.field-val--amount {
  font-size: 20px;
  font-weight: 700;
  font-family: 'JetBrains Mono', monospace;
  color: var(--brand-primary);
}

/* ── Objects ── */
.tags-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tags-list--wrap {
  flex-direction: row;
  flex-wrap: wrap;
  gap: 6px;
}

.object-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  background: var(--bg-subtle);
  border-radius: var(--radius-md);
  font-size: 13px;
  color: var(--text-primary);
  border: 1px solid var(--border-light);
}
.object-row i { color: var(--brand-primary); }

.obj-type-badge {
  margin-left: auto;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  background: var(--bg-page);
  color: var(--text-tertiary);
  border: 1px solid var(--border-light);
}

/* ── Work types ── */
.wt-chip {
  display: inline-flex;
  align-items: center;
  padding: 5px 10px;
  background: #eff6ff;
  color: #1e40af;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 500;
}

/* ── Persons ── */
.persons-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}

.persons-col-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-tertiary);
  margin-bottom: 10px;
}

.person-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border-light);
}
.person-row:last-child { border-bottom: none; }

.person-avatar {
  width: 34px; height: 34px;
  border-radius: 50%;
  background: var(--brand-primary);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.person-avatar--co  { background: #7c3aed; }
.person-avatar--obs { background: #0284c7; }

.person-name { font-size: 13px; font-weight: 600; color: var(--text-primary); }
.person-role { font-size: 11px; color: var(--text-tertiary); margin-top: 1px; }

/* ── Comment ── */
.comment-box {
  padding: 12px 16px;
  background: var(--bg-subtle);
  border-radius: var(--radius-md);
  font-size: 14px;
  color: var(--text-primary);
  line-height: 1.6;
  white-space: pre-wrap;
  border: 1px solid var(--border-light);
}

/* ── Type badge ── */
.type-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
  background: var(--bg-subtle);
  color: var(--text-secondary);
}
.type-badge--buyer   { background: #dbeafe; color: #1d4ed8; }
.type-badge--provide { background: #f3e8ff; color: #6b21a8; }
.type-badge--seller  { background: #dcfce7; color: #166534; }
.type-badge--service { background: #fef9c3; color: #854d0e; }

/* ── Empty hint ── */
.empty-hint {
  font-size: 13px;
  color: var(--text-tertiary);
  font-style: italic;
}

/* ── Tab empty ── */
.tab-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-tertiary);
}
.tab-empty-icon { font-size: 48px; color: var(--border-light); }
.tab-empty-title { margin: 0; font-size: 18px; font-weight: 600; color: var(--text-secondary); }
.tab-empty-sub   { margin: 0; font-size: 13px; }

/* ── Documents ── */
.docs-wrap {
  flex: 1;
  overflow-y: auto;
  padding: 24px 32px 40px;
}

.docs-section-title {
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-tertiary);
  margin-bottom: 16px;
}

.upload-cards {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.upload-card {
  flex: 1;
  min-width: 200px;
  max-width: 300px;
  background: var(--bg-surface);
  border: 1px dashed var(--border-light);
  border-radius: var(--radius-lg);
  padding: 24px 20px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.upload-card:hover {
  border-color: var(--brand-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand-primary) 8%, transparent);
}

.upload-card-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--brand-primary) 10%, transparent);
  color: var(--brand-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  margin-bottom: 4px;
}

.upload-card-label {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}

.upload-card-hint {
  font-size: 12px;
  color: var(--text-tertiary);
  line-height: 1.4;
}

.upload-btn {
  margin-top: 8px;
  padding: 8px 18px;
  background: var(--brand-primary);
  color: #fff;
  border: none;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: opacity 0.15s;
}
.upload-btn:hover { opacity: 0.85; }

.upload-status {
  margin-top: 8px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: center;
}
.upload-status--loading { color: var(--text-secondary); }
.upload-status--done    { color: #16a34a; font-weight: 600; }
.upload-status--error   { color: #ef4444; }

.mini-spinner {
  width: 14px; height: 14px;
  border: 2px solid var(--border-light);
  border-top-color: var(--brand-primary);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
}

.retry-btn {
  padding: 3px 10px;
  border: 1px solid #ef4444;
  border-radius: var(--radius-md);
  background: transparent;
  color: #ef4444;
  font-size: 12px;
  cursor: pointer;
  margin-left: 4px;
}
.retry-btn:hover { background: #fef2f2; }

/* ── File browser ── */
.docs-browser-section { margin-top: 28px; }

.browser {
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 10px 16px;
  background: var(--bg-subtle);
  border-bottom: 1px solid var(--border-light);
  font-size: 13px;
  flex-wrap: wrap;
}

.bc-item {
  color: var(--brand-primary);
  cursor: pointer;
  padding: 2px 4px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  gap: 4px;
}
.bc-item:hover { background: color-mix(in srgb, var(--brand-primary) 10%, transparent); }
.bc-item--active { color: var(--text-primary); font-weight: 600; cursor: default; }
.bc-item--active:hover { background: transparent; }
.bc-item--root { color: var(--text-secondary); }

.bc-sep { color: var(--text-tertiary); font-size: 10px; }

.browser-list { display: flex; flex-direction: column; }

.browser-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border-light);
  transition: background 0.1s;
}
.browser-row:last-child { border-bottom: none; }
.browser-row--folder { cursor: pointer; }
.browser-row--folder:hover { background: var(--bg-subtle); }
.browser-row--file:hover { background: var(--bg-subtle); }

.browser-row-icon { font-size: 18px; flex-shrink: 0; width: 22px; text-align: center; }

.browser-row-name {
  flex: 1;
  font-size: 13px;
  color: var(--text-primary);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.browser-row-meta {
  font-size: 12px;
  color: var(--text-tertiary);
  flex-shrink: 0;
  white-space: nowrap;
}

.browser-row-arrow { color: var(--text-tertiary); font-size: 11px; }

.browser-row-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.file-action-btn {
  width: 30px;
  height: 30px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--bg-page);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  transition: background 0.1s, color 0.1s;
}
.file-action-btn:hover { background: var(--bg-subtle); color: var(--text-primary); }
.file-action-btn--danger:hover { background: #fef2f2; color: #ef4444; border-color: #fca5a5; }

.browser-empty {
  padding: 32px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.state-msg {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  padding: 16px 0;
}

/* ── Drop overlay ── */
.docs-wrap { position: relative; }

.drop-overlay {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--brand-primary) 12%, transparent);
  border: 3px dashed var(--brand-primary);
  border-radius: var(--radius-lg);
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.drop-overlay-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--brand-primary);
  font-size: 15px;
  font-weight: 600;
}
.drop-overlay-inner i { font-size: 48px; }

.drop-uploading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  font-size: 13px;
  color: var(--text-secondary);
  border-top: 1px solid var(--border-light);
}

/* ── Browser header ── */
.docs-browser-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.create-folder-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
}
.create-folder-btn:hover { background: var(--bg-subtle); color: var(--text-primary); }

/* ── Modals ── */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.35);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-box {
  background: var(--bg-surface);
  border-radius: var(--radius-lg);
  box-shadow: 0 20px 60px rgba(0,0,0,0.25);
  padding: 24px;
  width: 380px;
  max-width: 90vw;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.modal-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}
.modal-title--danger { color: #ef4444; }

.modal-hint {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: -8px;
}

.modal-body {
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.modal-input {
  width: 100%;
  box-sizing: border-box;
  height: 36px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: 0 10px;
  font-size: 14px;
  outline: none;
  background: var(--bg-page);
  color: var(--text-primary);
}
.modal-input:focus { border-color: var(--brand-primary); }

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.modal-btn {
  padding: 7px 18px;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 80px;
  justify-content: center;
}
.modal-btn:disabled { opacity: 0.6; cursor: default; }
.modal-btn--cancel { background: var(--bg-subtle); color: var(--text-secondary); border: 1px solid var(--border-light); }
.modal-btn--cancel:hover:not(:disabled) { background: var(--bg-page); }
.modal-btn--ok { background: var(--brand-primary); color: #fff; }
.modal-btn--ok:hover:not(:disabled) { opacity: 0.88; }
.modal-btn--danger { background: #ef4444; color: #fff; }
.modal-btn--danger:hover:not(:disabled) { background: #dc2626; }

/* ── File preview ── */
.browser-row-name--link {
  cursor: pointer;
  color: var(--brand-primary);
}
.browser-row-name--link:hover { text-decoration: underline; }

.file-type-badge {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
.file-type-badge--original { background: #dbeafe; color: #1d4ed8; }
.file-type-badge--version  { background: #f3e8ff; color: #6b21a8; }

.preview-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0,0,0,0.85);
  display: flex;
  flex-direction: column;
  outline: none;
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: #1e1e1e;
  border-bottom: 1px solid rgba(255,255,255,0.1);
  flex-shrink: 0;
  gap: 12px;
}

.preview-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.preview-action-btn {
  width: 34px; height: 34px;
  border-radius: var(--radius-md);
  border: 1px solid rgba(255,255,255,0.15);
  background: rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.7);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px;
  transition: background 0.1s;
}
.preview-action-btn:hover { background: rgba(255,255,255,0.15); color: #fff; }

.preview-close-btn {
  width: 34px; height: 34px;
  border-radius: var(--radius-md);
  border: none;
  background: rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.7);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  font-size: 16px;
  transition: background 0.1s, color 0.1s;
}
.preview-close-btn:hover { background: #ef4444; color: #fff; }

.preview-body {
  flex: 1;
  overflow: hidden;
  display: flex;
  align-items: stretch;
}

.preview-embed {
  width: 100%;
  height: 100%;
  border: none;
}

.preview-image-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  overflow: auto;
}

.preview-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 4px;
  box-shadow: 0 4px 32px rgba(0,0,0,0.5);
}

.preview-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: rgba(255,255,255,0.6);
  font-size: 15px;
}
.preview-state--error { color: #f87171; }
.preview-state--unsupported { color: rgba(255,255,255,0.5); text-align: center; }

.preview-state-icon { font-size: 64px; color: rgba(255,255,255,0.2); }
.preview-state-title { font-size: 20px; font-weight: 700; color: rgba(255,255,255,0.7); }
.preview-state-sub { font-size: 14px; color: rgba(255,255,255,0.4); }
.preview-state-sub strong { color: rgba(255,255,255,0.6); }

/* DOCX preview */
.preview-docx-wrap {
  flex: 1;
  overflow-y: auto;
  background: #525659;
  display: flex;
  justify-content: center;
  padding: 24px 16px;
}
.preview-docx-container {
  width: 100%;
  max-width: 900px;
}
/* docx-preview internal styles reset for dark bg */
:deep(.docx-body) {
  background: #fff;
  box-shadow: 0 4px 32px rgba(0,0,0,0.4);
}
:deep(.docx-wrapper) {
  background: #525659;
  padding: 24px;
}
:deep(.docx-wrapper > section.docx) {
  background: #fff;
  box-shadow: 0 4px 24px rgba(0,0,0,0.35);
  margin-bottom: 24px;
}

/* XLSX preview */
.preview-xlsx-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #fff;
}
.xlsx-tabs {
  display: flex;
  gap: 0;
  background: #f1f5f9;
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
  overflow-x: auto;
}
.xlsx-tab {
  padding: 8px 18px;
  border: none;
  background: transparent;
  color: #64748b;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  border-bottom: 2px solid transparent;
}
.xlsx-tab.active { color: #1e40af; border-bottom-color: #1e40af; background: #fff; font-weight: 600; }
.xlsx-tab:hover:not(.active) { background: #e2e8f0; }

.preview-xlsx-table {
  flex: 1;
  overflow: auto;
  padding: 0;
}
:deep(.preview-xlsx-table table) {
  border-collapse: collapse;
  font-size: 13px;
  font-family: 'Calibri', sans-serif;
  min-width: 100%;
}
:deep(.preview-xlsx-table td),
:deep(.preview-xlsx-table th) {
  border: 1px solid #d1d5db;
  padding: 4px 8px;
  white-space: nowrap;
  color: #111827;
  min-width: 60px;
}
:deep(.preview-xlsx-table tr:first-child td),
:deep(.preview-xlsx-table tr:first-child th) {
  background: #f8fafc;
  font-weight: 600;
  position: sticky;
  top: 0;
  z-index: 1;
}

/* ── Viewer layout ── */
.viewer-layout {
  flex: 1;
  display: grid;
  grid-template-columns: 300px 1fr 340px;
  overflow: hidden;
}

/* Left panel */
.viewer-left {
  border-right: 1px solid var(--border-light);
  overflow-y: auto;
  padding: 20px;
  background: var(--bg-surface);
  display: flex;
  flex-direction: column;
  gap: 0;
}

.viewer-info-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-tertiary);
  margin-bottom: 12px;
}

.viewer-info-block {
  margin-bottom: 10px;
}

.viewer-info-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 2px;
}

.viewer-info-val {
  font-size: 13px;
  color: var(--text-primary);
  line-height: 1.4;
  word-break: break-word;
}
.viewer-info-val--amount {
  font-size: 15px;
  font-weight: 700;
  font-family: 'JetBrains Mono', monospace;
  color: var(--brand-primary);
}

.viewer-info-divider {
  border-top: 1px solid var(--border-light);
  margin: 10px 0 12px;
}

/* Center: preview */
.viewer-center {
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: #525659;
  position: relative;
}

.viewer-embed {
  width: 100%;
  height: 100%;
  border: none;
}

.viewer-image-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  overflow: auto;
}

.viewer-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: rgba(255,255,255,0.5);
  font-size: 14px;
}
.viewer-state--error { color: #f87171; }

/* Right panel */
.viewer-right {
  border-left: 1px solid var(--border-light);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-surface);
}

.viewer-right-tabs {
  display: flex;
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}

.viewer-right-tab {
  flex: 1;
  height: 40px;
  border: none;
  background: transparent;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color 0.15s, border-color 0.15s;
}
.viewer-right-tab:hover { color: var(--text-primary); }
.viewer-right-tab.active { color: var(--brand-primary); border-bottom-color: var(--brand-primary); font-weight: 600; }

.viewer-file-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.viewer-upload-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.viewer-upload-btn {
  flex: 1;
  padding: 7px 10px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-light);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  transition: background 0.1s, opacity 0.1s;
}
.viewer-upload-btn:disabled { opacity: 0.5; cursor: default; }
.viewer-upload-btn--original { background: #dbeafe; color: #1d4ed8; border-color: #bfdbfe; }
.viewer-upload-btn--original:hover:not(:disabled) { background: #bfdbfe; }
.viewer-upload-btn--version  { background: #f3e8ff; color: #6b21a8; border-color: #e9d5ff; }
.viewer-upload-btn--version:hover:not(:disabled)  { background: #e9d5ff; }

.viewer-upload-error {
  font-size: 12px;
  color: #ef4444;
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.viewer-file-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
  font-size: 13px;
  padding: 16px 0;
}

.viewer-file-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-tertiary);
  font-size: 13px;
  padding: 32px 16px;
  text-align: center;
}

/* Timeline */
.viewer-timeline {
  display: flex;
  flex-direction: column;
}

.viewer-timeline-item {
  display: flex;
  gap: 10px;
  cursor: pointer;
}

.vtl-connector {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  width: 16px;
  padding-top: 4px;
}

.vtl-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--border-light);
  border: 2px solid var(--bg-surface);
  box-shadow: 0 0 0 1px var(--border-light);
  flex-shrink: 0;
  transition: background 0.15s;
}
.vtl-dot--active {
  background: var(--brand-primary);
  box-shadow: 0 0 0 1px var(--brand-primary);
}

.vtl-line {
  flex: 1;
  width: 2px;
  background: var(--border-light);
  margin: 3px 0;
  min-height: 12px;
}

.vtl-card {
  flex: 1;
  padding: 6px 8px 10px;
  border-radius: var(--radius-md);
  margin-bottom: 0;
  transition: background 0.12s;
  min-width: 0;
}
.viewer-timeline-item:hover .vtl-card { background: var(--bg-subtle); }
.viewer-timeline-item.active .vtl-card { background: color-mix(in srgb, var(--brand-primary) 8%, transparent); }

.vtl-card-top {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.vtl-card-top i { flex-shrink: 0; font-size: 14px; }

.vtl-name {
  font-size: 12px;
  color: var(--text-primary);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vtl-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  flex-wrap: wrap;
}

.vtl-date {
  font-size: 11px;
  color: var(--text-tertiary);
}

/* ── History ── */
.history-wrap {
  flex: 1;
  overflow-y: auto;
  padding: 24px 32px 40px;
}

.log-list {
  display: flex;
  flex-direction: column;
  gap: 0;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}

.log-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border-light);
}
.log-item:last-child { border-bottom: none; }

.log-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--brand-primary);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.log-body { flex: 1; min-width: 0; }

.log-message {
  font-size: 13px;
  color: var(--text-primary);
  line-height: 1.5;
}

.log-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-tertiary);
}
.log-sep { color: var(--border-light); }

/* ── Edit mode ── */
.header-title-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.contract-title { flex: 1; margin: 0; }

.edit-contract-btn {
  flex-shrink: 0;
  padding: 7px 16px;
  border: 1.5px solid var(--brand-primary);
  border-radius: 8px;
  background: transparent;
  color: var(--brand-primary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 7px;
  transition: background .15s, color .15s;
  letter-spacing: .01em;
}
.edit-contract-btn:hover { background: var(--brand-primary); color: #fff; }

/* Save bar */
.edit-save-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px;
  background: #fff;
  border-bottom: 2px solid var(--brand-primary);
  position: sticky;
  top: 0;
  z-index: 20;
}
.edit-save-left {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  font-weight: 500;
  color: var(--brand-primary);
}
.edit-save-left i { font-size: 14px; }
.edit-error-msg {
  display: flex;
  align-items: center;
  gap: 5px;
  color: #d32f2f;
  font-weight: 500;
  font-size: 13px;
  background: #fff5f5;
  padding: 3px 10px;
  border-radius: 6px;
  border: 1px solid #ffcdd2;
}
.edit-save-actions { display: flex; gap: 8px; align-items: center; }
.edit-cancel-btn {
  padding: 7px 18px;
  border: 1.5px solid var(--border-light);
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: border-color .15s, color .15s;
}
.edit-cancel-btn:hover { border-color: var(--text-secondary); color: var(--text-primary); }
.edit-cancel-btn:disabled { opacity: .5; cursor: default; }
.edit-save-btn {
  padding: 7px 20px;
  background: var(--brand-primary);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 120px;
  justify-content: center;
  transition: opacity .15s;
}
.edit-save-btn:hover { opacity: .88; }
.edit-save-btn:disabled { opacity: .55; cursor: default; }

/* Fields */
.required-mark { color: #d32f2f; margin-left: 2px; }

.edit-field-group { display: flex; flex-direction: column; gap: 5px; }
.edit-field-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: .06em;
}

.edit-input {
  width: 100%;
  padding: 8px 11px;
  border: 1.5px solid var(--border-light);
  border-radius: 8px;
  font-size: 14px;
  color: var(--text-primary);
  background: #fff;
  box-sizing: border-box;
  transition: border-color .15s;
  line-height: 1.4;
}
.edit-input:focus { outline: none; border-color: var(--brand-primary); box-shadow: 0 0 0 3px rgba(var(--brand-primary-rgb, 59,130,246),.10); }
.edit-input:hover:not(:focus) { border-color: var(--border-medium, #bbb); }
.edit-input.mono { font-family: 'Courier New', monospace; letter-spacing: .02em; }

.edit-select {
  width: 100%;
  padding: 8px 11px;
  border: 1.5px solid var(--border-light);
  border-radius: 8px;
  font-size: 14px;
  color: var(--text-primary);
  background: #fff;
  box-sizing: border-box;
  cursor: pointer;
  transition: border-color .15s;
  appearance: auto;
}
.edit-select:focus { outline: none; border-color: var(--brand-primary); }

.edit-textarea {
  width: 100%;
  padding: 9px 11px;
  border: 1.5px solid var(--border-light);
  border-radius: 8px;
  font-size: 14px;
  color: var(--text-primary);
  background: #fff;
  box-sizing: border-box;
  resize: vertical;
  font-family: inherit;
  line-height: 1.55;
  transition: border-color .15s;
}
.edit-textarea:focus { outline: none; border-color: var(--brand-primary); }

/* Fields grid in edit mode — 2 columns */
.edit-fields-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px 20px;
}
.edit-fields-grid .edit-field-group.full { grid-column: 1 / -1; }

/* Autocomplete */
.ac-wrap { position: relative; }
.ac-drop {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: #fff;
  border: 1.5px solid var(--border-light);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,.11), 0 2px 6px rgba(0,0,0,.06);
  z-index: 200;
  max-height: 220px;
  overflow-y: auto;
  overflow-x: hidden;
}
.ac-item {
  padding: 8px 13px;
  font-size: 13.5px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--text-primary);
  transition: background .1s;
}
.ac-item:hover { background: var(--surface-hover, #f5f7fa); }
.ac-item--disabled { opacity: .45; cursor: not-allowed; }
.ac-self-label {
  font-size: 11px;
  color: var(--text-tertiary);
  background: var(--surface-light, #f0f0f0);
  padding: 1px 6px;
  border-radius: 4px;
}
.ac-empty { padding: 10px 13px; font-size: 13px; color: var(--text-tertiary); }
.ac-create {
  padding: 8px 13px;
  font-size: 13px;
  cursor: pointer;
  color: var(--brand-primary);
  border-top: 1px solid var(--border-light);
  display: flex;
  align-items: center;
  gap: 7px;
  font-weight: 500;
  transition: background .1s;
}
.ac-create i { font-size: 13px; }
.ac-create:hover { background: var(--surface-hover, #f5f7fa); }

/* Parties edit */
.edit-parties { display: flex; flex-direction: column; gap: 12px; }

.edit-party-pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.edit-party-card {
  background: var(--surface-light, #f8f9fa);
  border: 1.5px solid var(--border-light);
  border-radius: 10px;
  padding: 12px 14px;
}

.edit-party-row {
  display: flex;
  gap: 10px;
  align-items: flex-end;
  background: var(--surface-light, #f8f9fa);
  border: 1.5px solid var(--border-light);
  border-radius: 10px;
  padding: 12px 14px;
}
.edit-party-row:has(.edit-input:focus),
.edit-party-card:has(.edit-input:focus) {
  border-color: var(--brand-primary);
  background: #fff;
}
.edit-party--deleted { opacity: .4; }

/* Delete / restore button */
.edit-row-del-btn {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border: 1.5px solid var(--border-light);
  border-radius: 8px;
  background: #fff;
  color: var(--text-tertiary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  transition: border-color .15s, color .15s, background .15s;
}
.edit-row-del-btn:hover:not(:disabled) {
  border-color: #ef5350;
  color: #ef5350;
  background: #fff5f5;
}
.edit-row-del-btn:disabled { opacity: .25; cursor: default; }

/* Add button */
.edit-add-btn {
  align-self: flex-start;
  padding: 7px 14px;
  border: 1.5px dashed var(--brand-primary);
  border-radius: 8px;
  background: transparent;
  color: var(--brand-primary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 7px;
  transition: background .15s, color .15s, border-style .15s;
}
.edit-add-btn:hover {
  background: var(--brand-primary);
  color: #fff;
  border-style: solid;
}

/* Deleted item strikethrough */
.edit-item--deleted { opacity: .38; text-decoration: line-through; pointer-events: none; }
.edit-item--deleted .edit-row-del-btn { pointer-events: all; }

/* Objects */
.object-row--edit {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  background: var(--surface-light, #f8f9fa);
  border: 1.5px solid var(--border-light);
  border-radius: 9px;
  margin-bottom: 6px;
}
.object-row--edit .object-row__name { flex: 1; font-size: 13.5px; }
.object-row--edit .edit-row-del-btn { margin-left: auto; }

/* Work type chips edit */
.wt-chips-edit { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 12px; }
.wt-chip--edit {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px 5px 12px;
  background: var(--surface-light, #f0f2f5);
  border: 1.5px solid var(--border-light);
  border-radius: 20px;
  font-size: 13px;
  color: var(--text-primary);
  transition: opacity .15s;
}
.wt-chip--deleted {
  opacity: .35;
  text-decoration: line-through;
  background: #fff0f0;
  border-color: #ffcdd2;
}
.wt-del-btn {
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 50%;
  background: var(--border-light);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: var(--text-secondary);
  padding: 0;
  flex-shrink: 0;
  transition: background .15s, color .15s;
}
.wt-del-btn:hover { background: #ef5350; color: #fff; }
.wt-chip--deleted .wt-del-btn { background: #ffcdd2; color: #c62828; }

/* Roles */
.edit-roles { display: flex; flex-direction: column; gap: 20px; }
.edit-roles-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.edit-roles-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: .06em;
  margin-bottom: 2px;
}
.edit-role-row {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 9px 12px;
  background: var(--surface-light, #f8f9fa);
  border: 1.5px solid var(--border-light);
  border-radius: 10px;
  transition: border-color .15s, background .15s;
}
.edit-role-row:has(.edit-input:focus) {
  border-color: var(--brand-primary);
  background: #fff;
}
.edit-add-role-btns { display: flex; gap: 8px; flex-wrap: wrap; }

/* Mini spinner */
.mini-spinner {
  width: 15px;
  height: 15px;
  border: 2px solid rgba(255,255,255,.35);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin .65s linear infinite;
}
</style>
