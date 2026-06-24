<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TopNav from '../components/layout/TopNav.vue'
import FilterTabs from '../components/filters/FilterTabs.vue'
import { mainNavLinks } from '../constants/mainNav'

const navLinks = mainNavLinks

const filterTabs = [
  { label: 'Все', active: true },
  { label: 'В работе', active: false },
  { label: 'Неактивные', active: false },
  { label: 'Скрытые', active: false },
]

const levelTypeLabels = {
  section: 'Секция',
  building: 'Корпус',
  queue: 'Очередь',
  agreement: 'Договор',
  worktype: 'Вид работ',
  area: 'Участок',
}

const rows = ref([])
const loading = ref(false)
const loadError = ref('')
const search = ref('')

const openMenuId = ref(null)
const isCreateModalOpen = ref(false)
const projectName = ref('')
const allObjects = ref([])
const isLoadingObjects = ref(false)
const isObjectDropdownOpen = ref(false)
const selectedObjectId = ref('')
const isSubmittingProject = ref(false)
const createProjectError = ref('')
const projectActionInProgressId = ref('')
const expandedProjects = ref({})
const isLevelModalOpen = ref(false)
const levelModalType = ref('')
const levelModalProjectId = ref('')
const levelModalProjectName = ref('')
const levelModalParentId = ref(null)
const levelName = ref('')
const contractQuery = ref('')
const workTypeQuery = ref('')
const selectedLookupId = ref('')
const lookupItems = ref([])
const isContractDropdownOpen = ref(false)
const isWorkTypeDropdownOpen = ref(false)
const isSubmittingLevel = ref(false)
const levelModalError = ref('')
const route = useRoute()
const router = useRouter()

const toggleMenu = (id) => {
  openMenuId.value = openMenuId.value === id ? null : id
}

const closeMenu = () => {
  openMenuId.value = null
}

const handleWindowClick = () => closeMenu()

onMounted(() => {
  window.addEventListener('click', handleWindowClick)
})

onBeforeUnmount(() => {
  window.removeEventListener('click', handleWindowClick)
})

const openCreateModal = () => {
  isCreateModalOpen.value = true
  projectName.value = ''
  selectedObjectId.value = ''
  createProjectError.value = ''
  isObjectDropdownOpen.value = false
  loadObjects()
}

const closeCreateModal = () => {
  isCreateModalOpen.value = false
  projectName.value = ''
  selectedObjectId.value = ''
  createProjectError.value = ''
  isObjectDropdownOpen.value = false
}

const closeLevelModal = () => {
  isLevelModalOpen.value = false
  levelModalType.value = ''
  levelModalProjectId.value = ''
  levelModalProjectName.value = ''
  levelModalParentId.value = null
  levelName.value = ''
  contractQuery.value = ''
  workTypeQuery.value = ''
  selectedLookupId.value = ''
  isContractDropdownOpen.value = false
  isWorkTypeDropdownOpen.value = false
  lookupItems.value = []
  levelModalError.value = ''
}

const toggleProject = (id) => {
  expandedProjects.value[id] = !expandedProjects.value[id]
}

const toggleNode = (node) => {
  if (!node.children || node.children.length === 0) return
  node.open = node.open === false
}

const buildFlatRows = (nodes, depth, rowsAcc) => {
  nodes.forEach((node) => {
    rowsAcc.push({
      node,
      depth,
      hasChildren: Array.isArray(node.children) && node.children.length > 0,
    })
    if (node.open !== false && node.children && node.children.length) {
      buildFlatRows(node.children, depth + 1, rowsAcc)
    }
  })
}

const getFlatRows = (projectId) => {
  if (!expandedProjects.value[projectId]) return []
  const project = rows.value.find((row) => row.id === projectId)
  const nodes = project?.tree || []
  const rowsAcc = []
  buildFlatRows(nodes, 0, rowsAcc)
  return rowsAcc
}

const getCreateOptions = (type) => {
  if (type === 'Проект') return ['Секция', 'Договор']
  if (type === 'Секция') return ['Договор']
  if (type === 'Договор') return ['Вид работ']
  return []
}

const menuIdForProject = (id) => `project:${id}`
const menuIdForNode = (projectId, nodeId) => `node:${projectId}:${nodeId}`

const isWorkTypeNode = (node) => node?.levelType === 'worktype'

const normalizeArray = (payload) => {
  if (Array.isArray(payload)) return payload
  return payload?.items || payload?.data || payload?.results || []
}

const typeToLevelType = (type) => {
  if (type === 'Секция') return 'section'
  if (type === 'Договор') return 'agreement'
  if (type === 'Вид работ') return 'worktype'
  return ''
}

const managerName = (manager) => {
  if (!manager) return '—'
  return [manager.last_name, manager.name].filter(Boolean).join(' ') || '—'
}

const statusFromActive = (isActive) => (isActive ? 'В работе' : 'Неактивен')

const sortByLevelNumber = (a, b) => {
  const aNum = Number.isFinite(Number(a?.level_number)) ? Number(a.level_number) : Number.MAX_SAFE_INTEGER
  const bNum = Number.isFinite(Number(b?.level_number)) ? Number(b.level_number) : Number.MAX_SAFE_INTEGER
  if (aNum !== bNum) return aNum - bNum
  const aCreated = String(a?.created_at || '')
  const bCreated = String(b?.created_at || '')
  return aCreated.localeCompare(bCreated)
}

const mapNode = (node) => {
  const levelType = node.level_type || ''
  const type = levelTypeLabels[levelType] || levelType || 'Уровень'
  const fallbackLabel = node.level_number ? `${type} ${node.level_number}` : type
  let label = fallbackLabel
  if (levelType === 'section') label = node.name || fallbackLabel
  else if (levelType === 'agreement') label = node.contract_name || fallbackLabel
  else if (levelType === 'worktype') label = node.work_type_name || fallbackLabel
  else label = node.name || node.contract_name || node.work_type_name || fallbackLabel

  const sortedChildren = Array.isArray(node.children)
    ? [...node.children].sort(sortByLevelNumber)
    : []

  return {
    id: node.id,
    type,
    levelType,
    label,
    creator: '—',
    budget: '—',
    status: statusFromActive(Boolean(node.is_active)),
    open: true,
    workTypeId: node.work_type_id || null,
    children: sortedChildren.map(mapNode),
  }
}

const loadObjectMeta = async (objectId) => {
  const res = await fetch(`/apiref/ref/objects/${encodeURIComponent(objectId)}`, {
    credentials: 'include',
  })
  if (!res.ok) throw new Error('object meta failed')
  return res.json()
}

const loadLookupItems = async (type) => {
  if (type === 'Договор') {
    const res = await fetch('/apiref/ref/contracts', { credentials: 'include' })
    if (!res.ok) throw new Error('contracts load failed')
    lookupItems.value = normalizeArray(await res.json())
    return
  }
  if (type === 'Вид работ') {
    const res = await fetch('/apiref/ref/work-types', { credentials: 'include' })
    if (!res.ok) throw new Error('work-types load failed')
    lookupItems.value = normalizeArray(await res.json())
    return
  }
  lookupItems.value = []
}

const loadObjects = async () => {
  isLoadingObjects.value = true
  try {
    const res = await fetch('/apiref/ref/objects', { credentials: 'include' })
    if (!res.ok) throw new Error('objects load failed')
    allObjects.value = normalizeArray(await res.json())
  } catch (error) {
    allObjects.value = []
    createProjectError.value = 'Не удалось загрузить список объектов.'
  } finally {
    isLoadingObjects.value = false
  }
}

const loadProjects = async () => {
  loading.value = true
  loadError.value = ''
  try {
    const listRes = await fetch('/apisup/supply/projects', { credentials: 'include' })
    if (!listRes.ok) throw new Error('projects list failed')
    const rawProjects = normalizeArray(await listRes.json())
    const visibleProjects = rawProjects.filter((project) => project.is_hide === false)

    const mappedProjects = await Promise.all(
      visibleProjects.map(async (project) => {
        try {
          if (!project.object_id) {
            return {
              id: project.id,
              objectId: '',
              name: 'Без названия',
              creator: '—',
              budget: '—',
              isHide: Boolean(project.is_hide),
              isActive: Boolean(project.is_active),
              status: statusFromActive(Boolean(project.is_active)),
              tree: [],
            }
          }

          const structureRes = await fetch(`/apiref/ref/objects/${encodeURIComponent(project.object_id)}/structure`, {
            credentials: 'include',
          })
          if (!structureRes.ok) throw new Error('structure failed')
          const structurePayload = await structureRes.json()

          let objectMeta = null
          try {
            objectMeta = await loadObjectMeta(project.object_id)
          } catch (e) {
            objectMeta = null
          }

          const rawChildren = Array.isArray(structurePayload)
            ? structurePayload
            : Array.isArray(structurePayload?.children)
              ? structurePayload.children
              : normalizeArray(structurePayload)
          const sortedRootChildren = [...rawChildren].sort(sortByLevelNumber)

          return {
            id: project.id,
            objectId: project.object_id,
            name: objectMeta?.short_name || objectMeta?.full_name || project.object_id,
            creator: managerName(objectMeta?.manager),
            budget: '—',
            isHide: Boolean(project.is_hide),
            isActive: Boolean(project.is_active),
            status: statusFromActive(Boolean(project.is_active)),
            tree: sortedRootChildren.map(mapNode),
          }
        } catch (error) {
          return {
            id: project.id,
            objectId: project.object_id,
            name: project.id,
            creator: '—',
            budget: '—',
            isHide: Boolean(project.is_hide),
            isActive: Boolean(project.is_active),
            status: statusFromActive(Boolean(project.is_active)),
            tree: [],
          }
        }
      })
    )

    rows.value = mappedProjects
    expandedProjects.value = Object.fromEntries(mappedProjects.map((project) => [project.id, true]))
  } catch (error) {
    loadError.value = 'Не удалось загрузить проекты.'
    rows.value = []
  } finally {
    loading.value = false
  }
}

const filteredRows = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return rows.value
  return rows.value.filter((row) => {
    const idText = String(row.id || '').toLowerCase()
    const nameText = String(row.name || '').toLowerCase()
    return idText.includes(q) || nameText.includes(q)
  })
})

const existingObjectIds = computed(() =>
  new Set(rows.value.map((row) => row.objectId).filter(Boolean))
)

const filteredObjectItems = computed(() => {
  const query = projectName.value.trim().toLowerCase()
  const availableObjects = allObjects.value.filter((item) => !existingObjectIds.value.has(item.id))
  if (!query) return availableObjects
  return availableObjects.filter((item) =>
    String(item.short_name || '').toLowerCase().includes(query)
  )
})

const filteredContractItems = computed(() => {
  const q = contractQuery.value.trim().toLowerCase()
  if (!q) return []
  return lookupItems.value.filter((item) => String(item.name || '').toLowerCase().includes(q))
})

const filteredWorkTypeItems = computed(() => {
  const q = workTypeQuery.value.trim().toLowerCase()
  if (!q) return lookupItems.value
  return lookupItems.value.filter((item) => String(item.name || '').toLowerCase().includes(q))
})

const selectLookup = (item) => {
  selectedLookupId.value = item.id
  if (levelModalType.value === 'Договор') {
    contractQuery.value = item.name || ''
    isContractDropdownOpen.value = false
  } else if (levelModalType.value === 'Вид работ') {
    workTypeQuery.value = item.name || ''
    isWorkTypeDropdownOpen.value = false
  }
}

const onContractInput = () => {
  selectedLookupId.value = ''
}

const onWorkTypeInput = () => {
  selectedLookupId.value = ''
}

const toggleContractDropdown = () => {
  isContractDropdownOpen.value = !isContractDropdownOpen.value
}

const toggleWorkTypeDropdown = () => {
  isWorkTypeDropdownOpen.value = !isWorkTypeDropdownOpen.value
}

const closeLookupDropdowns = () => {
  isContractDropdownOpen.value = false
  isWorkTypeDropdownOpen.value = false
}

const selectObject = (item) => {
  selectedObjectId.value = item.id
  projectName.value = item.short_name || ''
  isObjectDropdownOpen.value = false
  createProjectError.value = ''
}

const onProjectNameInput = () => {
  selectedObjectId.value = ''
  isObjectDropdownOpen.value = true
}

const toggleObjectDropdown = () => {
  isObjectDropdownOpen.value = !isObjectDropdownOpen.value
}

const closeObjectDropdown = () => {
  isObjectDropdownOpen.value = false
}

const openCreateLevelModal = async ({ project, type, parentId }) => {
  levelModalType.value = type
  levelModalProjectId.value = project.objectId || ''
  levelModalProjectName.value = project.name || ''
  levelModalParentId.value = parentId || null
  levelName.value = ''
  contractQuery.value = ''
  workTypeQuery.value = ''
  selectedLookupId.value = ''
  isContractDropdownOpen.value = false
  isWorkTypeDropdownOpen.value = false
  levelModalError.value = ''
  lookupItems.value = []
  isLevelModalOpen.value = true
  closeMenu()
  try {
    await loadLookupItems(type)
  } catch (error) {
    levelModalError.value = 'Не удалось загрузить справочник для выбора.'
  }
}

const createContractIfNeeded = async () => {
  if (selectedLookupId.value) return selectedLookupId.value
  const name = contractQuery.value.trim()
  if (!name) throw new Error('empty contract')
  const createRes = await fetch('/apiref/ref/contracts', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!createRes.ok) throw new Error('contract create failed')
  const payload = await createRes.json()
  return payload?.id
}

const createWorkTypeIfNeeded = async () => {
  if (selectedLookupId.value) return selectedLookupId.value
  const name = workTypeQuery.value.trim()
  if (!name) throw new Error('empty work type')
  const createRes = await fetch('/apiref/ref/work-types', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!createRes.ok) throw new Error('work type create failed')
  const payload = await createRes.json()
  return payload?.id
}

const submitCreateLevel = async () => {
  levelModalError.value = ''
  if (!levelModalProjectId.value) {
    levelModalError.value = 'Не найден id объекта.'
    return
  }
  const levelType = typeToLevelType(levelModalType.value)
  if (!levelType) {
    levelModalError.value = 'Некорректный тип уровня.'
    return
  }

  isSubmittingLevel.value = true
  try {
    const body = {
      object_id: levelModalProjectId.value,
      level_type: levelType,
      level_number: 0,
      is_active: true,
    }

    if (levelModalType.value === 'Секция') {
      const name = levelName.value.trim()
      if (!name) throw new Error('empty section')
      body.name = name
    }

    if (levelModalType.value === 'Договор') {
      const contractId = await createContractIfNeeded()
      if (!contractId) throw new Error('missing contract id')
      body.contract_id = contractId
    }

    if (levelModalType.value === 'Вид работ') {
      const workTypeId = await createWorkTypeIfNeeded()
      if (!workTypeId) throw new Error('missing work type id')
      body.work_type = workTypeId
    }

    if (levelModalParentId.value) {
      body.parent_id = levelModalParentId.value
    }

    const res = await fetch(`/apiref/ref/objects/${encodeURIComponent(levelModalProjectId.value)}/levels`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error('create level failed')

    closeLevelModal()
    await loadProjects()
  } catch (error) {
    if (levelModalType.value === 'Секция' && !levelName.value.trim()) {
      levelModalError.value = 'Введите название секции.'
    } else if (levelModalType.value === 'Договор' && !contractQuery.value.trim()) {
      levelModalError.value = 'Введите название договора или выберите существующий.'
    } else if (levelModalType.value === 'Вид работ' && !workTypeQuery.value.trim()) {
      levelModalError.value = 'Введите название вида работ или выберите существующий.'
    } else {
      levelModalError.value = 'Не удалось создать подуровень.'
    }
  } finally {
    isSubmittingLevel.value = false
  }
}

const resolveObjectIdForProjectCreate = async () => {
  if (selectedObjectId.value) return selectedObjectId.value
  const name = projectName.value.trim()
  if (!name) throw new Error('empty object name')

  const exactMatch = allObjects.value.find(
    (item) =>
      String(item.short_name || '').trim().toLowerCase() === name.toLowerCase()
      && !existingObjectIds.value.has(item.id)
  )
  if (exactMatch?.id) return exactMatch.id

  const createRes = await fetch('/apiref/ref/objects', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ short_name: name }),
  })
  if (!createRes.ok) throw new Error('create object failed')
  const payload = await createRes.json()
  const objectId = payload?.id || payload?.data?.id
  if (!objectId) throw new Error('missing object id')
  return objectId
}

const submitCreateProject = async () => {
  createProjectError.value = ''
  if (!projectName.value.trim()) {
    createProjectError.value = 'Введите название проекта.'
    return
  }

  isSubmittingProject.value = true
  try {
    const objectId = await resolveObjectIdForProjectCreate()
    const res = await fetch('/apisup/supply/projects', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ object_id: objectId }),
    })
    if (!res.ok) throw new Error('create project failed')
    closeCreateModal()
    await loadProjects()
  } catch (error) {
    createProjectError.value = 'Не удалось создать проект.'
  } finally {
    isSubmittingProject.value = false
  }
}

const patchProject = async (projectId, patch) => {
  const project = rows.value.find((row) => row.id === projectId)
  if (!project) return

  projectActionInProgressId.value = projectId
  try {
    const payload = {
      is_hide: Boolean(project.isHide),
      is_active: Boolean(project.isActive),
      ...patch,
    }
    const res = await fetch(`/apisup/supply/projects/${encodeURIComponent(projectId)}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error('patch project failed')
    closeMenu()
    await loadProjects()
  } catch (error) {
    loadError.value = 'Не удалось обновить проект.'
  } finally {
    projectActionInProgressId.value = ''
  }
}

const openWork = (projectId, node) => {
  if (node.levelType !== 'worktype') return
  const project = rows.value.find((row) => row.id === projectId)
  router.push({
    path: `/projects/${projectId}/works/${node.id}`,
    query: {
      ...(project?.objectId ? { object_id: project.objectId } : {}),
      back: route.fullPath,
    },
  })
}

const PROJECTS_SCROLL_KEY = 'projects-list-scroll'

const scheduleScrollRestore = (key) => {
  const saved = sessionStorage.getItem(key)
  if (!saved) return
  const top = Number(saved)
  const tryScroll = (attemptsLeft) => {
    const pageHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)
    if (pageHeight >= top + window.innerHeight || attemptsLeft <= 0) {
      window.scrollTo(0, top)
      document.documentElement.scrollTop = top
      document.body.scrollTop = top
      sessionStorage.removeItem(key)
    } else {
      setTimeout(() => tryScroll(attemptsLeft - 1), 60)
    }
  }
  nextTick(() => nextTick(() => tryScroll(10)))
}

onMounted(() => {
  window.addEventListener('click', handleWindowClick)
  loadProjects().then(() => scheduleScrollRestore(PROJECTS_SCROLL_KEY))
})

onBeforeUnmount(() => {
  window.removeEventListener('click', handleWindowClick)
  const scrollTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop
  sessionStorage.setItem(PROJECTS_SCROLL_KEY, String(scrollTop))
})
</script>

<template>
  <div class="page">
    <TopNav :links="navLinks" />
    <main class="main-content">
      <div class="content-header">
        <div>
          <h1 class="page-title">Проекты</h1>
          <div class="page-subtitle">Управление проектами и бюджетами</div>
        </div>
        <button class="btn btn-primary" @click="openCreateModal">
          <i class="fas fa-plus"></i> Создать проект
        </button>
      </div>

      <div class="toolbar">
        <div class="search-wrapper">
          <i class="fas fa-magnifying-glass"></i>
          <input v-model="search" type="text" placeholder="Поиск по ID или названию...">
        </div>
      </div>

      <FilterTabs :tabs="filterTabs" />

      <div class="table-wrapper">
        <div v-if="loading" class="table-state">Загрузка проектов...</div>
        <div v-else-if="loadError" class="table-state error">{{ loadError }}</div>
        <table>
          <thead>
            <tr>
              <th>Название</th>
              <th>Тип</th>
              <th>Руководитель объекта</th>
              <th>Сумма по бюджету</th>
              <th>Статус</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="row in filteredRows" :key="row.id">
              <tr class="project-row">
                <td>
                  <div class="tree-row">
                    <button class="tree-toggle" @click="toggleProject(row.id)">
                      <i class="fas" :class="expandedProjects[row.id] ? 'fa-chevron-down' : 'fa-chevron-right'"></i>
                    </button>
                    <span class="tree-label">{{ row.name }}</span>
                  </div>
                </td>
                <td class="type-cell">Проект</td>
                <td>{{ row.creator }}</td>
                <td>{{ row.budget }}</td>
                <td>
                  <span class="status-pill st-green" v-if="row.status === 'В работе'">
                    <span class="st-dot"></span> {{ row.status }}
                  </span>
                  <span class="status-pill st-red" v-else>
                    <span class="st-dot"></span> {{ row.status }}
                  </span>
                </td>
                <td>
                  <div class="actions-cell">
                    <button class="action-btn" @click.stop="toggleMenu(menuIdForProject(row.id))">
                      <i class="fas fa-ellipsis-vertical"></i>
                    </button>
                    <div v-if="openMenuId === menuIdForProject(row.id)" class="action-menu">
                      <div class="menu-group">
                        <div class="menu-title">Создать под уровень</div>
                        <button
                          v-for="option in getCreateOptions('Проект')"
                          :key="`create-${row.id}-${option}`"
                          class="menu-item"
                          @click.stop="openCreateLevelModal({ project: row, type: option, parentId: null })"
                        >
                          {{ option }}
                        </button>
                      </div>
                      <div class="menu-divider"></div>
                      <button
                        v-if="!row.isActive"
                        class="menu-item"
                        :disabled="projectActionInProgressId === row.id"
                        @click.stop="patchProject(row.id, { is_active: true })"
                      >
                        Сделать активным
                      </button>
                      <button
                        v-else
                        class="menu-item"
                        :disabled="projectActionInProgressId === row.id"
                        @click.stop="patchProject(row.id, { is_active: false })"
                      >
                        Сделать неактивным
                      </button>
                      <button
                        class="menu-item"
                        :disabled="projectActionInProgressId === row.id"
                        @click.stop="patchProject(row.id, { is_hide: true })"
                      >
                        Скрыть
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
              <tr
                v-for="treeRow in getFlatRows(row.id)"
                :key="`${row.id}-${treeRow.node.id}`"
                class="tree-subrow"
              >
                <td>
                  <div class="tree-row" :style="{ paddingLeft: `${(treeRow.depth + 1) * 18}px` }">
                    <button
                      class="tree-toggle"
                      :class="{ disabled: !treeRow.hasChildren }"
                      @click="toggleNode(treeRow.node)"
                    >
                      <i
                        v-if="treeRow.hasChildren"
                        class="fas"
                        :class="treeRow.node.open === false ? 'fa-chevron-right' : 'fa-chevron-down'"
                      ></i>
                    </button>
                    <span
                      class="tree-label"
                      :class="{ 'worktype-link': isWorkTypeNode(treeRow.node) }"
                      @click="openWork(row.id, treeRow.node)"
                    >
                      {{ treeRow.node.label }}
                    </span>
                  </div>
                </td>
                <td class="type-cell">{{ treeRow.node.type || '' }}</td>
                <td>{{ treeRow.node.creator || '—' }}</td>
                <td>{{ treeRow.node.budget || '—' }}</td>
                <td>
                  <span class="status-pill st-green" v-if="treeRow.node.status === 'В работе'">
                    <span class="st-dot"></span> {{ treeRow.node.status }}
                  </span>
                  <span class="status-pill st-red" v-else>
                    <span class="st-dot"></span> {{ treeRow.node.status || 'Неактивен' }}
                  </span>
                </td>
                <td>
                  <div class="actions-cell">
                    <button
                      class="action-btn"
                      @click.stop="toggleMenu(menuIdForNode(row.id, treeRow.node.id))"
                    >
                      <i class="fas fa-ellipsis-vertical"></i>
                    </button>
                    <div
                      v-if="openMenuId === menuIdForNode(row.id, treeRow.node.id)"
                      class="action-menu"
                    >
                      <div v-if="getCreateOptions(treeRow.node.type).length" class="menu-group">
                        <div class="menu-title">Создать под уровень</div>
                        <button
                          v-for="option in getCreateOptions(treeRow.node.type)"
                          :key="`create-${treeRow.node.id}-${option}`"
                          class="menu-item"
                          @click.stop="openCreateLevelModal({ project: row, type: option, parentId: treeRow.node.id })"
                        >
                          {{ option }}
                        </button>
                      </div>
                      <div class="menu-divider"></div>
                      <button class="menu-item">Скрыть</button>
                      <button class="menu-item danger">Удалить</button>
                    </div>
                  </div>
                </td>
              </tr>
            </template>
            <tr v-if="!loading && !loadError && filteredRows.length === 0">
              <td colspan="6" class="empty-state">Проекты не найдены</td>
            </tr>
          </tbody>
        </table>
      </div>
    </main>

    <div v-if="isCreateModalOpen" class="modal-backdrop" @click="closeCreateModal">
      <div class="modal-card" @click.stop>
        <div class="modal-header">
          <h2>Создать проект</h2>
          <button class="icon-close" @click="closeCreateModal">
            <i class="fas fa-xmark"></i>
          </button>
        </div>
        <div class="modal-body" @click="closeObjectDropdown">
          <label class="field-label">Название проекта</label>
          <div class="select-wrap" @click.stop>
            <button class="field-input select-trigger" type="button" @click="toggleObjectDropdown">
              <span>{{ projectName || 'Выберите объект или введите новое название' }}</span>
              <i class="fas" :class="isObjectDropdownOpen ? 'fa-chevron-up' : 'fa-chevron-down'"></i>
            </button>
            <div v-if="isObjectDropdownOpen" class="lookup-list lookup-list-overlay select-dropdown" @click.stop>
              <input
                id="project-name"
                v-model="projectName"
                type="text"
                class="field-input select-search"
                placeholder="Поиск по краткому названию"
                @input="onProjectNameInput"
              >
              <div v-if="isLoadingObjects" class="lookup-empty">Загрузка...</div>
              <template v-else>
                <div v-if="filteredObjectItems.length">
                  <button
                    v-for="item in filteredObjectItems"
                    :key="item.id"
                    class="lookup-item"
                    @click="selectObject(item)"
                  >
                    {{ item.short_name }}
                  </button>
                </div>
                <div v-else class="lookup-empty">Объекты не найдены</div>
              </template>
            </div>
          </div>
          <div v-if="createProjectError" class="field-error">{{ createProjectError }}</div>
        </div>
        <div class="modal-actions">
          <button class="btn" :disabled="isSubmittingProject" @click="closeCreateModal">Отмена</button>
          <button class="btn btn-primary" :disabled="isSubmittingProject" @click="submitCreateProject">
            {{ isSubmittingProject ? 'Создание...' : 'Создать' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="isLevelModalOpen" class="modal-backdrop" @click="closeLevelModal">
      <div class="modal-card" @click.stop>
        <div class="modal-header">
          <h2>Создать: {{ levelModalType }}</h2>
          <button class="icon-close" @click="closeLevelModal">
            <i class="fas fa-xmark"></i>
          </button>
        </div>
        <div class="modal-body" @click="closeLookupDropdowns">
          <label class="field-label">Проект</label>
          <div class="field-static">{{ levelModalProjectName || '—' }}</div>

          <template v-if="levelModalType === 'Секция'">
            <label class="field-label" for="level-name">Название</label>
            <input
              id="level-name"
              v-model="levelName"
              type="text"
              class="field-input"
              placeholder="Введите название секции"
            >
          </template>

          <template v-else-if="levelModalType === 'Договор'">
            <label class="field-label">Договор</label>
            <div class="select-wrap" @click.stop>
              <button class="field-input select-trigger" type="button" @click="toggleContractDropdown">
                <span>{{ contractQuery || 'Выберите или введите договор' }}</span>
                <i class="fas" :class="isContractDropdownOpen ? 'fa-chevron-up' : 'fa-chevron-down'"></i>
              </button>
              <div v-if="isContractDropdownOpen" class="lookup-list lookup-list-overlay select-dropdown" @click.stop>
                <input
                  v-model="contractQuery"
                  type="text"
                  class="field-input select-search"
                  placeholder="Поиск или новое название"
                  @input="onContractInput"
                >
                <div v-if="filteredContractItems.length">
                  <button
                    v-for="item in filteredContractItems"
                    :key="item.id"
                    class="lookup-item"
                    @click="selectLookup(item)"
                  >
                    {{ item.name }}
                  </button>
                </div>
                <div v-else class="lookup-empty">Ничего не найдено</div>
              </div>
            </div>
          </template>

          <template v-else-if="levelModalType === 'Вид работ'">
            <label class="field-label">Вид работ</label>
            <div class="select-wrap" @click.stop>
              <button class="field-input select-trigger" type="button" @click="toggleWorkTypeDropdown">
                <span>{{ workTypeQuery || 'Выберите или введите вид работ' }}</span>
                <i class="fas" :class="isWorkTypeDropdownOpen ? 'fa-chevron-up' : 'fa-chevron-down'"></i>
              </button>
              <div v-if="isWorkTypeDropdownOpen" class="lookup-list lookup-list-overlay select-dropdown" @click.stop>
                <input
                  v-model="workTypeQuery"
                  type="text"
                  class="field-input select-search"
                  placeholder="Поиск или новое название"
                  @input="onWorkTypeInput"
                >
                <div v-if="filteredWorkTypeItems.length">
                  <button
                    v-for="item in filteredWorkTypeItems"
                    :key="item.id"
                    class="lookup-item"
                    @click="selectLookup(item)"
                  >
                    {{ item.name }}
                  </button>
                </div>
                <div v-else class="lookup-empty">Ничего не найдено</div>
              </div>
            </div>
          </template>

          <div v-if="levelModalError" class="field-error">{{ levelModalError }}</div>
        </div>
        <div class="modal-actions">
          <button class="btn" :disabled="isSubmittingLevel" @click="closeLevelModal">Отмена</button>
          <button class="btn btn-primary" :disabled="isSubmittingLevel" @click="submitCreateLevel">
            {{ isSubmittingLevel ? 'Создание...' : 'Создать' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.main-content {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  padding: 24px 32px;
  gap: 16px;
}

.content-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
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

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.search-wrapper {
  position: relative;
}

.search-wrapper input {
  padding: 8px 12px 8px 36px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-light);
  background: var(--bg-subtle);
  width: 280px;
  font-size: 13px;
  color: var(--text-primary);
  transition: all 0.2s;
}

.search-wrapper input:focus {
  background: var(--bg-surface);
  border-color: var(--brand-primary);
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
}

.search-wrapper i {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-tertiary);
}

.table-wrapper {
  background: var(--bg-surface);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-light);
  box-shadow: var(--shadow-sm);
  overflow: visible;
}

.table-state {
  padding: 12px 16px;
  font-size: 12px;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-light);
  background: var(--bg-subtle);
}

.table-state.error {
  color: var(--danger-text);
  background: var(--danger-bg);
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

th {
  text-align: left;
  padding: 12px 16px;
  background: var(--bg-subtle);
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--border-light);
}

th,
td {
  border-left: 1px solid var(--border-light);
  border-right: 1px solid var(--border-light);
}

th:first-child,
td:first-child {
  border-left: none;
}

th:last-child,
td:last-child {
  border-right: none;
}

td {
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-light);
  color: var(--text-primary);
}

tr:last-child td {
  border-bottom: none;
}

tr:hover td {
  background: var(--bg-subtle);
}

.mono {
  font-family: "JetBrains Mono", monospace;
  color: var(--text-secondary);
  font-size: 12px;
}

.project-row td {
  background: var(--bg-surface);
}

.tree-subrow td {
  background: var(--bg-subtle);
}

.tree-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tree-toggle {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 0;
}

.tree-toggle.disabled {
  cursor: default;
  opacity: 0.4;
}

.tree-label {
  font-size: 12px;
  color: var(--text-primary);
}

.tree-label.worktype-link {
  color: var(--brand-primary);
  text-decoration: underline;
  cursor: pointer;
}

.tree-label.worktype-link:hover {
  color: var(--brand-hover);
}

.type-cell {
  font-size: 12px;
  color: var(--text-secondary);
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}

.st-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.st-green {
  background: #dcfce7;
  color: #166534;
}

.st-green .st-dot {
  background: #16a34a;
}

.st-red {
  background: #fee2e2;
  color: #991b1b;
}

.st-red .st-dot {
  background: #dc2626;
}

.empty-state {
  text-align: center;
  color: var(--text-secondary);
  font-size: 12px;
  padding: 16px;
}

.actions-cell {
  position: relative;
  display: inline-flex;
}

.action-btn {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  transition: all 0.2s;
  cursor: pointer;
  background: transparent;
  border: none;
  padding: 0;
}

.action-btn:hover {
  background: var(--bg-body);
  color: var(--text-primary);
}

.action-menu {
  position: absolute;
  top: 32px;
  right: 0;
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  min-width: 180px;
  display: flex;
  flex-direction: column;
  z-index: 120;
}

.menu-group {
  display: flex;
  flex-direction: column;
  padding: 6px 0;
}

.menu-title {
  padding: 6px 12px 4px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--text-tertiary);
}

.menu-divider {
  height: 1px;
  background: var(--border-light);
  margin: 4px 0;
}

.menu-item {
  text-align: left;
  background: transparent;
  border: none;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--text-primary);
  cursor: pointer;
}

.menu-item:hover {
  background: var(--bg-subtle);
}

.menu-item.danger {
  color: var(--danger-text);
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal-card {
  width: 420px;
  background: var(--bg-surface);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-light);
  box-shadow: var(--shadow-md);
  padding: 16px;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.modal-header h2 {
  font-size: 16px;
  font-weight: 600;
}

.icon-close {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--text-secondary);
}

.icon-close:hover {
  background: var(--bg-body);
  color: var(--text-primary);
}

.modal-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.field-input {
  padding: 10px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-light);
  background: var(--bg-subtle);
  font-size: 13px;
  color: var(--text-primary);
  transition: all 0.2s;
  width: 100%;
  box-sizing: border-box;
}

.field-input:focus {
  background: var(--bg-surface);
  border-color: var(--brand-primary);
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
}

.field-static {
  padding: 10px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-light);
  background: var(--bg-subtle);
  color: var(--text-primary);
  font-size: 13px;
}

.lookup-list {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
}

.lookup-wrap {
  position: relative;
}

.lookup-list-overlay {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 160;
  box-shadow: var(--shadow-md);
}

.select-wrap {
  position: relative;
}

.select-trigger {
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  text-align: left;
}

.select-dropdown {
  padding: 8px;
}

.select-search {
  width: 100%;
  margin-bottom: 8px;
}

.lookup-item {
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  padding: 8px 12px;
  cursor: pointer;
  color: var(--text-primary);
  font-size: 12px;
}

.lookup-item:hover {
  background: var(--bg-subtle);
}

.lookup-empty {
  padding: 8px 12px;
  font-size: 12px;
  color: var(--text-secondary);
}

.field-error {
  color: var(--danger-text);
  font-size: 12px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
</style>
