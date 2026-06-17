<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TopNav from '../components/layout/TopNav.vue'
import ChatPanel from '../components/chat/ChatPanel.vue'
import FilterTabs from '../components/filters/FilterTabs.vue'
import { mainNavLinks } from '../constants/mainNav'
import { useChatStore } from '../stores/chat'

const route = useRoute()
const router = useRouter()
const projectId = route.params.projectId
const workId = route.params.workId
const objectId = computed(() => String(route.query.object_id || ''))

const navLinks = mainNavLinks
const chat = useChatStore()

const tabs = [
  { key: 'info', label: 'Общая информация' },
  { key: 'owners', label: 'Ответственные' },
  { key: 'budgets', label: 'Бюджеты' },
  { key: 'contacts', label: 'Контакты' },
]

const activeTab = ref('info')
const pendingTab = ref('')
const isUnsavedModalOpen = ref(false)

const originalInfo = ref({
  shortName: '',
  fullName: '',
  lead: '',
  address: '',
  managerId: '',
})

const info = ref({ ...originalInfo.value })
const isDirty = computed(() =>
  Object.keys(originalInfo.value).some((key) => originalInfo.value[key] !== info.value[key])
)
const infoLoading = ref(false)
const infoError = ref('')
const isInfoSaving = ref(false)
const saveInfoError = ref('')
const saveInfoSuccess = ref('')
const objectPayload = ref(null)
const resolvedObjectId = ref('')
const employees = ref([])
const employeesError = ref('')
const employeesLoading = ref(false)
const isManagerDropdownOpen = ref(false)
const managerQuery = ref('')
const titleParts = ref({
  object: '',
  contract: '',
  work: '',
})

const fullManagerName = (manager) => {
  if (!manager) return ''
  return [manager.last_name, manager.name].filter(Boolean).join(' ')
}

const setInfoFromObject = (payload) => {
  objectPayload.value = payload
  const nextInfo = {
    shortName: payload?.short_name || '',
    fullName: payload?.full_name || '',
    lead: fullManagerName(payload?.manager),
    address: payload?.address || '',
    managerId: '',
  }
  originalInfo.value = nextInfo
  info.value = { ...nextInfo }
}

const normalizeArray = (payload) => {
  if (Array.isArray(payload)) return payload
  return payload?.items || payload?.data || payload?.results || []
}

const loadObjectLevelsIdForBudgets = async () => {
  return String(workId || '')
}

const fullEmployeeName = (employee) =>
  [employee.last_name, employee.name, employee.middle_name].filter(Boolean).join(' ')

const filteredEmployees = computed(() => {
  const q = managerQuery.value.trim().toLowerCase()
  if (!q) return employees.value
  return employees.value.filter((item) => item.fullName.toLowerCase().includes(q))
})

const syncManagerFromEmployees = () => {
  const managerId = objectPayload.value?.manager?.id
  const managerName = fullManagerName(objectPayload.value?.manager)
  if (!managerId) return

  const match = employees.value.find((employee) =>
    employee.employeeId === managerId || employee.personId === managerId
  )
  if (match) {
    info.value.lead = match.fullName
    info.value.managerId = match.employeeId
    originalInfo.value.lead = match.fullName
    originalInfo.value.managerId = match.employeeId
    return
  }

  info.value.lead = managerName
  originalInfo.value.lead = managerName
}

const loadEmployees = async () => {
  employeesLoading.value = true
  employeesError.value = ''
  try {
    const res = await fetch('/apiref/ref/employees', { credentials: 'include' })
    if (!res.ok) throw new Error('employees load failed')
    const list = normalizeArray(await res.json())
    const uniqByPerson = new Map()
    list.forEach((employee) => {
      if (!employee?.person_id) return
      if (uniqByPerson.has(employee.person_id)) return
      uniqByPerson.set(employee.person_id, {
        employeeId: employee.id,
        personId: employee.person_id,
        fullName: fullEmployeeName(employee),
        position: employee.position || '',
      })
    })
    employees.value = [...uniqByPerson.values()].sort((a, b) => a.fullName.localeCompare(b.fullName))
    syncManagerFromEmployees()
  } catch (error) {
    employees.value = []
    employeesError.value = 'Не удалось загрузить сотрудников.'
  } finally {
    employeesLoading.value = false
  }
}

const selectManager = (employee) => {
  info.value.lead = employee.fullName
  info.value.managerId = employee.employeeId
  managerQuery.value = ''
  isManagerDropdownOpen.value = false
}

const toggleManagerDropdown = () => {
  isManagerDropdownOpen.value = !isManagerDropdownOpen.value
}

const closeManagerDropdown = () => {
  isManagerDropdownOpen.value = false
}

const onManagerInput = () => {
  info.value.managerId = ''
}

const findWorkPath = (nodes, targetWorkId, chain = []) => {
  if (!Array.isArray(nodes)) return null
  for (const node of nodes) {
    const nextChain = [...chain, node]
    const matches = String(node?.id || '') === String(targetWorkId)
    if (matches && node?.level_type === 'worktype') return nextChain
    const nested = findWorkPath(node?.children, targetWorkId, nextChain)
    if (nested) return nested
  }
  return null
}

const updateTitleFromObject = () => {
  const objectName = info.value.shortName || info.value.fullName || 'Объект'
  const path = findWorkPath(objectPayload.value?.children, workId)
  const workNode = path?.find((node) => node?.level_type === 'worktype')
  const agreementNode = [...(path || [])].reverse().find((node) => node?.level_type === 'agreement')

  titleParts.value = {
    object: objectName,
    contract: agreementNode?.contract_name || '',
    work: workNode?.work_type_name || '',
  }
}

const pageTitle = computed(() => {
  const parts = [titleParts.value.object, titleParts.value.contract, titleParts.value.work].filter(Boolean)
  return parts.join(' - ')
})

const pageSubtitle = computed(() => {
  const manager = info.value.lead || 'Руководитель не указан'
  const address = info.value.address || 'Адрес не указан'
  return `${manager} · ${address}`
})

const resolveObjectIdByProject = async () => {
  const res = await fetch('/apisup/supply/projects', { credentials: 'include' })
  if (!res.ok) throw new Error('projects load failed')
  const payload = await res.json()
  const list = normalizeArray(payload)
  const row = list.find((item) => String(item.id) === String(projectId))
  return row?.object_id ? String(row.object_id) : ''
}

const loadObjectInfo = async () => {
  infoLoading.value = true
  infoError.value = ''
  try {
    let id = objectId.value
    if (!id) {
      id = await resolveObjectIdByProject()
    }
    if (!id) throw new Error('missing object id')
    resolvedObjectId.value = id
    const res = await fetch(`/apiref/ref/objects/${encodeURIComponent(id)}`, {
      credentials: 'include',
    })
    if (!res.ok) throw new Error('object load failed')
    setInfoFromObject(await res.json())
    syncManagerFromEmployees()
    updateTitleFromObject()
  } catch (error) {
    infoError.value = 'Не удалось загрузить общую информацию объекта.'
  } finally {
    infoLoading.value = false
  }
}

const saveInfo = async () => {
  if (!resolvedObjectId.value) return
  isInfoSaving.value = true
  saveInfoError.value = ''
  saveInfoSuccess.value = ''
  try {
    const payload = {
      short_name: info.value.shortName || '',
      full_name: info.value.fullName || '',
      address: info.value.address || '',
      manager_id: info.value.managerId || null,
    }
    const res = await fetch(`/apiref/ref/objects/${encodeURIComponent(resolvedObjectId.value)}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error('save info failed')
    originalInfo.value = { ...info.value }
    updateTitleFromObject()
    saveInfoSuccess.value = 'Изменения сохранены.'
  } catch (error) {
    saveInfoError.value = 'Не удалось сохранить изменения.'
  } finally {
    isInfoSaving.value = false
  }
}

const requestTabChange = (nextTab) => {
  if (nextTab === activeTab.value) return
  if (activeTab.value === 'info' && isDirty.value) {
    pendingTab.value = nextTab
    isUnsavedModalOpen.value = true
    return
  }
  activeTab.value = nextTab
}

const confirmTabChange = () => {
  isUnsavedModalOpen.value = false
  if (!pendingTab.value) return
  activeTab.value = pendingTab.value
  pendingTab.value = ''
}

const cancelTabChange = () => {
  isUnsavedModalOpen.value = false
  pendingTab.value = ''
}

onMounted(async () => {
  await Promise.all([loadEmployees(), loadObjectInfo(), loadServiceUsers(), loadRoleItems(), loadSpecifications()])
})

const roleDefinitions = [
  {
    key: 'supply_manager',
    label: 'Ответственный за снабжение',
    apiRole: 'Supply manager',
    aliases: ['supply manager', 'procurement officer'],
  },
  {
    key: 'request_approver',
    label: 'Согласующие заявки',
    apiRole: 'Request approver',
    aliases: ['request approver'],
  },
  {
    key: 'budget_owner',
    label: 'Ответственные за бюджет',
    apiRole: 'Budget owner',
    aliases: ['budget owner'],
  },
  {
    key: 'payment_planner',
    label: 'Планируют платежи',
    apiRole: 'Payment planner',
    aliases: ['payment planner'],
  },
  {
    key: 'disbursement_officer',
    label: 'Ответственные за оплату',
    apiRole: 'Disbursement officer',
    aliases: ['disbursement officer', 'payer'],
  },
  {
    key: 'requester',
    label: 'Имеют право делать заявки',
    apiRole: 'Requester',
    aliases: ['requester', 'applicant'],
  },
  {
    key: 'invoice_approver',
    label: 'Согласующие счета',
    apiRole: 'Invoice approver',
    aliases: ['invoice approver'],
  },
  {
    key: 'budget_approver',
    label: 'Согласующие бюджеты',
    apiRole: 'Budget approver',
    aliases: ['budget approver'],
  },
  {
    key: 'payment_processor',
    label: 'Принимают в оплату',
    apiRole: 'Payment processor',
    aliases: ['payment processor'],
  },
]

const roleItems = ref([])
const rolesLoading = ref(false)
const rolesError = ref('')
const roleQueries = ref(Object.fromEntries(roleDefinitions.map((role) => [role.key, ''])))
const openRoleDropdown = ref(null)
const roleActionInProgress = ref('')

const usersList = ref([])
const usersLoading = ref(false)
const usersError = ref('')

const usersById = computed(() => {
  const map = new Map()
  usersList.value.forEach((user) => map.set(user.id, user))
  return map
})

const roleMatches = (definition, role) => {
  const value = String(role || '').trim().toLowerCase()
  return [definition.apiRole, ...definition.aliases].some((item) => item.toLowerCase() === value)
}

const displayRoleUserName = (item) => {
  const fromRole = [item?.user?.surname, item?.user?.name].filter(Boolean).join(' ')
  if (fromRole) return fromRole
  const user = usersById.value.get(item.user_id)
  if (!user) return item.user_id
  return [user.surname, user.name, user.patronymic].filter(Boolean).join(' ')
}

const loadServiceUsers = async () => {
  usersLoading.value = true
  usersError.value = ''
  try {
    const res = await fetch('/api/as/users/service/7dd8be78-cf3a-423a-852f-eab3511fbe30?page=1&limit=100', {
      credentials: 'include',
    })
    if (!res.ok) throw new Error('service users load failed')
    const payload = await res.json()
    const items = Array.isArray(payload) ? payload : payload?.items || payload?.data || payload?.results || []
    usersList.value = items.map((user) => ({
      id: user.id,
      name: user.name || '',
      surname: user.surname || '',
      patronymic: user.patronymic || '',
      fullName: [user.surname, user.name, user.patronymic].filter(Boolean).join(' '),
    }))
  } catch (error) {
    usersList.value = []
    usersError.value = 'Не удалось загрузить пользователей.'
  } finally {
    usersLoading.value = false
  }
}

const loadRoleItems = async () => {
  rolesLoading.value = true
  rolesError.value = ''
  try {
    const res = await fetch('/apisup/supply/project-user-roles', { credentials: 'include' })
    if (!res.ok) throw new Error('roles load failed')
    const payload = await res.json()
    const items = Array.isArray(payload) ? payload : payload?.items || payload?.data || payload?.results || []
    roleItems.value = items.filter((item) => String(item.object_levels_id) === String(workId))
  } catch (error) {
    roleItems.value = []
    rolesError.value = 'Не удалось загрузить ответственных.'
  } finally {
    rolesLoading.value = false
  }
}

const roleUsers = (roleKey) => {
  const definition = roleDefinitions.find((role) => role.key === roleKey)
  if (!definition) return []
  const filtered = roleItems.value.filter((item) => roleMatches(definition, item.role))
  const uniq = new Map()
  filtered.forEach((item) => {
    if (!uniq.has(item.user_id)) uniq.set(item.user_id, item)
  })
  return [...uniq.values()]
}

const filteredRoleCandidates = (roleKey) => {
  const query = (roleQueries.value[roleKey] || '').trim().toLowerCase()
  const assigned = new Set(roleUsers(roleKey).map((item) => item.user_id))
  const candidates = usersList.value.filter((user) => !assigned.has(user.id))
  if (!query) return candidates
  return candidates.filter((user) =>
    `${user.surname} ${user.name} ${user.patronymic}`.toLowerCase().includes(query)
  )
}

const openRolePicker = (roleKey) => {
  openRoleDropdown.value = openRoleDropdown.value === roleKey ? null : roleKey
}

const assignRoleUser = async (roleKey, user) => {
  const definition = roleDefinitions.find((role) => role.key === roleKey)
  if (!definition || !user?.id) return
  roleActionInProgress.value = `${roleKey}:${user.id}`
  try {
    const res = await fetch('/apisup/supply/project-user-roles', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        object_levels_id: String(workId),
        user_id: user.id,
        role: definition.apiRole,
      }),
    })
    if (!res.ok) throw new Error('assign role failed')
    roleQueries.value[roleKey] = ''
    openRoleDropdown.value = null
    await loadRoleItems()
  } catch (error) {
    rolesError.value = 'Не удалось добавить ответственного.'
  } finally {
    roleActionInProgress.value = ''
  }
}

const removeRoleUser = async (roleKey, item) => {
  if (!item?.id) return
  roleActionInProgress.value = `${roleKey}:remove:${item.id}`
  try {
    const res = await fetch(`/apisup/supply/project-user-roles/${encodeURIComponent(item.id)}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    if (!res.ok) throw new Error('remove role failed')
    await loadRoleItems()
  } catch (error) {
    rolesError.value = 'Не удалось удалить ответственного.'
  } finally {
    roleActionInProgress.value = ''
  }
}

const openBudgetMenuId = ref(null)
const specifications = ref([])
const specificationsLoading = ref(false)
const specificationsError = ref('')
const creatingSpecification = ref(false)

const toggleBudgetMenu = (id) => {
  openBudgetMenuId.value = openBudgetMenuId.value === id ? null : id
}

const budgetToggleLabel = (status) => (status === 'Активный' ? 'Сделать неактивным' : 'Сделать активным')

const budgetStatusClass = (statusName = '') => {
  const value = String(statusName).toLowerCase()
  if (value.includes('черновик')) return 'st-amber'
  if (value.includes('актив')) return 'st-green'
  if (value.includes('закры')) return 'st-red'
  return 'st-amber'
}

const formatShortDateTime = (value) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

const loadSpecifications = async () => {
  specificationsLoading.value = true
  specificationsError.value = ''
  try {
    const objectLevelsId = await loadObjectLevelsIdForBudgets()
    if (!objectLevelsId) throw new Error('missing object levels id')
    const res = await fetch(
      `/apisup/supply/specifications/by-object-levels/${encodeURIComponent(objectLevelsId)}`,
      { credentials: 'include' }
    )
    if (!res.ok) throw new Error('specifications load failed')
    specifications.value = normalizeArray(await res.json())
    nextTick(() => {
      for (const spec of specifications.value) {
        if (spec.chat_id) chat.fetchBadge(spec.chat_id)
      }
    })
  } catch (error) {
    specifications.value = []
    specificationsError.value = 'Не удалось загрузить спецификации.'
  } finally {
    specificationsLoading.value = false
  }
}

const getBadge = (chatId) => {
  if (!chatId) return null
  const b = chat.badges[chatId]
  return b && b.mention ? 'mention' : b?.unread ? 'unread' : null
}

const handleSpecChatOpen = (spec) => {
  chat.openPanel('specification', String(spec.id), spec.chat_id, spec.name)
}

const handleCloseChat = () => {
  const chatId = chat.currentChatId
  chat.closePanel()
  if (chatId) chat.refreshBadge(chatId)
}

const createSpecification = async () => {
  creatingSpecification.value = true
  specificationsError.value = ''
  try {
    const objectLevelsId = await loadObjectLevelsIdForBudgets()
    if (!objectLevelsId) throw new Error('missing object levels id')
    const res = await fetch('/apisup/supply/specifications', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        object_levels_id: String(objectLevelsId),
        status_id: 'ff28c5a3-1968-11f1-aa8c-bc241127d0bd',
      }),
    })
    if (!res.ok) throw new Error('specification create failed')
    const created = await res.json()
    await loadSpecifications()
    if (created?.id) {
      router.push(`/budgets/${created.id}?back=${encodeURIComponent(route.fullPath)}`)
    }
  } catch (error) {
    specificationsError.value = 'Не удалось создать спецификацию.'
  } finally {
    creatingSpecification.value = false
  }
}

const openSpecification = (specification) => {
  if (!specification?.id) return
  router.push(`/budgets/${specification.id}?back=${encodeURIComponent(route.fullPath)}`)
}

const contactList = ref([
  {
    name: 'Иванов И.И.',
    company: 'ООО Пример',
    role: 'Руководитель',
    phonePersonal: '+7 900 000-00-01',
    phoneWork: '+7 495 000-00-01',
    phoneExtra: '',
    emailPersonal: 'ivanov@mail.ru',
    emailWork: 'i.ivanov@company.ru',
    emailExtra: '',
  },
])

const contactFilters = [
  { label: 'Все', active: true },
  { label: 'В ответственных', active: false },
  { label: 'Только с email', active: false },
]
</script>

<template>
  <div class="page">
    <TopNav :links="navLinks" />
    <main class="main-content">
      <div class="content-header">
        <div class="title-row">
          <RouterLink class="back-btn" to="/projects" aria-label="Назад к проектам">
            <i class="fas fa-chevron-left"></i>
          </RouterLink>
          <div>
            <h1 class="page-title">
              {{ pageTitle }}
            </h1>
            <div class="page-subtitle">{{ pageSubtitle }}</div>
          </div>
        </div>
        <button
          v-if="activeTab === 'info'"
          class="btn btn-primary"
          :disabled="!isDirty || isInfoSaving"
          @click="saveInfo"
        >
          {{ isInfoSaving ? 'Сохранение...' : 'Сохранить' }}
        </button>
      </div>

      <div class="tabs">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="tab-btn"
          :class="{ active: activeTab === tab.key }"
          @click="requestTabChange(tab.key)"
        >
          {{ tab.label }}
        </button>
      </div>

      <section v-if="activeTab === 'info'" class="panel" @click="closeManagerDropdown">
        <div v-if="infoLoading" class="inline-state">Загрузка...</div>
        <div v-else-if="infoError" class="inline-state error">{{ infoError }}</div>
        <div v-else-if="employeesError" class="inline-state error">{{ employeesError }}</div>
        <div v-if="saveInfoError" class="inline-state error">{{ saveInfoError }}</div>
        <div v-if="saveInfoSuccess" class="inline-state success">{{ saveInfoSuccess }}</div>
        <div class="form-grid single">
          <div class="field">
            <label>Краткое название объекта</label>
            <input v-model="info.shortName" type="text">
          </div>
          <div class="field">
            <label>Полное название объекта</label>
            <textarea v-model="info.fullName" rows="3"></textarea>
          </div>
          <div class="field">
            <label>Руководитель объекта</label>
            <div class="manager-select" @click.stop>
              <button class="manager-select-btn" type="button" @click="toggleManagerDropdown">
                <span>{{ info.lead || 'Выберите руководителя' }}</span>
                <i class="fas" :class="isManagerDropdownOpen ? 'fa-chevron-up' : 'fa-chevron-down'"></i>
              </button>
              <div v-if="isManagerDropdownOpen" class="manager-dropdown">
                <input
                  v-model="managerQuery"
                  class="manager-search"
                  placeholder="Поиск: Фамилия Имя Отчество"
                  @input="onManagerInput"
                >
                <div class="manager-list">
                  <button
                    v-for="employee in filteredEmployees"
                    :key="employee.personId"
                    class="manager-option"
                    @click="selectManager(employee)"
                  >
                    {{ employee.fullName }}
                  </button>
                  <div v-if="employeesLoading" class="manager-empty">Загрузка...</div>
                  <div v-else-if="filteredEmployees.length === 0" class="manager-empty">Ничего не найдено</div>
                </div>
              </div>
            </div>
          </div>
          <div class="field">
            <label>Адрес объекта</label>
            <input v-model="info.address" type="text">
          </div>
        </div>
      </section>

      <section v-else-if="activeTab === 'owners'" class="panel">
        <div v-if="rolesLoading || usersLoading" class="inline-state">Загрузка...</div>
        <div v-if="rolesError" class="inline-state error">{{ rolesError }}</div>
        <div v-if="usersError" class="inline-state error">{{ usersError }}</div>
        <div class="responsibles">
          <div class="role" v-for="roleDef in roleDefinitions" :key="roleDef.key">
            <div class="role-title">
              {{ roleDef.label }}
            </div>
            <div class="chips">
              <span v-for="item in roleUsers(roleDef.key)" :key="`${roleDef.key}-${item.user_id}`" class="chip">
                {{ displayRoleUserName(item) }}
                <button @click="removeRoleUser(roleDef.key, item)">×</button>
              </span>
            </div>
            <div class="user-select-wrap">
              <button class="user-select-btn" @click="openRolePicker(roleDef.key)">
                Выбрать пользователя...
                <i class="fas" :class="openRoleDropdown === roleDef.key ? 'fa-chevron-up' : 'fa-chevron-down'"></i>
              </button>
              <div v-if="openRoleDropdown === roleDef.key" class="user-dropdown">
                <input
                  v-model="roleQueries[roleDef.key]"
                  class="user-search"
                  placeholder="Введите ФИО для поиска..."
                >
                <div class="user-list">
                  <button
                    v-for="user in filteredRoleCandidates(roleDef.key)"
                    :key="`${roleDef.key}-${user.id}`"
                    class="user-option"
                    :disabled="roleActionInProgress === `${roleDef.key}:${user.id}`"
                    @click="assignRoleUser(roleDef.key, user)"
                  >
                    {{ user.fullName }}
                  </button>
                  <div v-if="filteredRoleCandidates(roleDef.key).length === 0" class="user-empty">Ничего не найдено</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section v-else-if="activeTab === 'budgets'" class="panel">
        <div class="panel-actions">
          <button class="btn btn-primary" :disabled="creatingSpecification" @click="createSpecification">
            <i class="fas fa-plus"></i>
            {{ creatingSpecification ? 'Создание...' : 'Создать бюджет' }}
          </button>
        </div>
        <div v-if="specificationsLoading" class="inline-state">Загрузка...</div>
        <div v-else-if="specificationsError" class="inline-state error">{{ specificationsError }}</div>
        <table v-else class="table">
          <thead>
            <tr>
              <th>Наименование</th>
              <th>Проект</th>
              <th>Автор</th>
              <th>Статус</th>
              <th>Создан</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="specification in specifications" :key="specification.id">
              <td>
                <div class="budget-name">
                  <RouterLink
                    class="budget-link"
                    :to="`/budgets/${specification.id}?back=${encodeURIComponent($route.fullPath)}`"
                  >
                    {{ specification.name || specification.id }}
                  </RouterLink>
                </div>
                <button
                  class="budget-chat-btn"
                  type="button"
                  title="Чат спецификации"
                  @click.stop="handleSpecChatOpen(specification)"
                >
                  <span class="budget-chat-icon-wrap">
                    <i class="fas fa-comment-dots"></i>
                    <span v-if="specification.chat_id && getBadge(specification.chat_id)" class="budget-chat-badge"></span>
                  </span>
                </button>
              </td>
              <td>{{ specification.project_name || '—' }}</td>
              <td>{{ specification.created_by_user || '—' }}</td>
              <td>
                <span class="status-pill" :class="budgetStatusClass(specification.status_name)">
                  <span class="st-dot"></span> {{ specification.status_name || '—' }}
                </span>
              </td>
              <td>
                {{ formatShortDateTime(specification.created_at) }}
              </td>
              <td>
                <div class="actions-cell">
                  <button class="action-btn" @click.stop="toggleBudgetMenu(specification.id)">
                    <i class="fas fa-ellipsis-vertical"></i>
                  </button>
                  <div v-if="openBudgetMenuId === specification.id" class="action-menu">
                    <button class="menu-item">Клонировать бюджет</button>
                    <button class="menu-item">{{ budgetToggleLabel(specification.status_name) }}</button>
                    <button class="menu-item danger">Удалить</button>
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section v-else class="panel">
        <FilterTabs :tabs="contactFilters" />
        <table class="table">
          <thead>
            <tr>
              <th>ФИО</th>
              <th>Компания</th>
              <th>Должность</th>
              <th>Личный телефон</th>
              <th>Рабочий телефон</th>
              <th>Доп. телефон</th>
              <th>Личный email</th>
              <th>Рабочий email</th>
              <th>Доп. email</th>
            </tr>
            <tr class="filter-row">
              <th><input type="text" placeholder="ФИО"></th>
              <th><input type="text" placeholder="Компания"></th>
              <th><input type="text" placeholder="Должность"></th>
              <th><input type="text" placeholder="Личный"></th>
              <th><input type="text" placeholder="Рабочий"></th>
              <th><input type="text" placeholder="Доп."></th>
              <th><input type="text" placeholder="Личный email"></th>
              <th><input type="text" placeholder="Рабочий email"></th>
              <th><input type="text" placeholder="Доп. email"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="contact in contactList" :key="contact.name">
              <td>{{ contact.name }}</td>
              <td>{{ contact.company }}</td>
              <td>{{ contact.role }}</td>
              <td>{{ contact.phonePersonal }}</td>
              <td>{{ contact.phoneWork }}</td>
              <td>{{ contact.phoneExtra }}</td>
              <td>{{ contact.emailPersonal }}</td>
              <td>{{ contact.emailWork }}</td>
              <td>{{ contact.emailExtra }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </main>

    <div v-if="isUnsavedModalOpen" class="modal-backdrop" @click="cancelTabChange">
      <div class="modal-card" @click.stop>
        <div class="modal-header">
          <h2>Несохранённые изменения</h2>
          <button class="icon-close" @click="cancelTabChange">
            <i class="fas fa-xmark"></i>
          </button>
        </div>
        <div class="modal-body">
          <div class="modal-text">
            Есть несохранённые действия. Вы уверены, что хотите уйти?
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn" @click="cancelTabChange">Остаться</button>
          <button class="btn btn-primary" @click="confirmTabChange">Уйти</button>
        </div>
      </div>
    </div>

    <ChatPanel v-if="chat.panelOpen" @close="handleCloseChat" />
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

.title-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.back-btn {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  border: 1px solid var(--border-light);
  background: var(--bg-surface);
  transition: all 0.2s;
}

.back-btn:hover {
  background: var(--bg-subtle);
  color: var(--text-primary);
}

.page-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}

.page-subtitle {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.tabs {
  display: flex;
  gap: 8px;
  border-bottom: 1px solid var(--border-light);
}

.tab-btn {
  padding: 8px 14px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-weight: 500;
  cursor: pointer;
  border-bottom: 2px solid transparent;
}

.tab-btn.active {
  color: var(--brand-primary);
  border-bottom-color: var(--brand-primary);
}

.panel {
  background: var(--bg-surface);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-light);
  box-shadow: var(--shadow-sm);
  padding: 16px;
}

.inline-state {
  margin-bottom: 12px;
  font-size: 12px;
  color: var(--text-secondary);
}

.inline-state.error {
  color: var(--danger-text);
}

.inline-state.success {
  color: var(--success-text);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.form-grid.single {
  grid-template-columns: 1fr;
}

.field label {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.field input,
.field textarea {
  width: 100%;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-light);
  background: var(--bg-subtle);
  font-size: 13px;
  font-family: inherit;
}

.manager-select {
  position: relative;
}

.manager-select-btn {
  width: 100%;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-light);
  background: var(--bg-subtle);
  font-size: 13px;
  color: var(--text-primary);
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
}

.manager-select-btn:hover {
  background: var(--bg-surface);
}

.manager-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: 40;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  box-shadow: var(--shadow-md);
  padding: 8px;
}

.manager-search {
  width: 100%;
  padding: 8px 10px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-light);
  background: var(--bg-subtle);
  font-size: 12px;
}

.manager-list {
  margin-top: 8px;
  max-height: 220px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.manager-option {
  border: none;
  background: transparent;
  text-align: left;
  padding: 7px 8px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 12px;
  color: var(--text-primary);
}

.manager-option:hover {
  background: var(--bg-subtle);
}

.manager-empty {
  font-size: 11px;
  color: var(--text-tertiary);
  padding: 6px 8px;
}

.responsibles {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.role {
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: 12px;
  background: var(--bg-subtle);
}

.role-title {
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 8px;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.chip {
  background: var(--bg-body);
  border: 1px solid var(--border-light);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.chip-approved {
  background: var(--success-bg);
  color: var(--success-text);
  border-color: transparent;
}

.chip-rejected {
  background: var(--danger-bg);
  color: var(--danger-text);
  border-color: transparent;
}

.chip-pending {
  background: var(--bg-body);
  color: var(--text-secondary);
}

.chip button {
  border: none;
  background: transparent;
  cursor: pointer;
}

.panel-actions {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.table th,
.table td {
  border: 1px solid var(--border-light);
  padding: 10px 12px;
  text-align: left;
}

.filter-row th {
  background: var(--bg-surface);
  padding: 8px 12px;
}

.filter-row input {
  width: 100%;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-light);
  background: var(--bg-subtle);
  font-size: 11px;
}

.filter-row input:focus {
  outline: none;
  border-color: var(--brand-primary);
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
  background: var(--bg-surface);
}

.mono {
  font-family: "JetBrains Mono", monospace;
  color: var(--text-secondary);
  font-size: 12px;
}

.budget-link {
  color: var(--brand-primary);
  text-decoration: none;
}

.budget-link:hover {
  text-decoration: underline;
}

.budget-chat-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 2px;
  margin-top: 4px;
  color: var(--text-secondary, #64748b);
}

.budget-chat-btn:hover {
  color: var(--brand-primary, #3b82f6);
}

.budget-chat-icon-wrap {
  position: relative;
  display: inline-flex;
}

.budget-chat-badge {
  position: absolute;
  top: -2px;
  right: -4px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #ef4444;
}

.budget-info {
  font-size: 11px;
  color: var(--text-secondary);
}

.actions-cell {
  display: inline-flex;
  position: relative;
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
  min-width: 200px;
  display: flex;
  flex-direction: column;
  z-index: 10;
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

.btn.danger {
  color: var(--danger-text);
  border-color: var(--danger-bg);
}

.user-select-wrap {
  position: relative;
  width: 100%;
}

.user-select-btn {
  width: 100%;
  padding: 9px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-light);
  background: var(--bg-subtle);
  font-size: 12px;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
}

.user-select-btn:hover {
  background: var(--bg-surface);
}

.user-dropdown {
  position: absolute;
  top: 42px;
  left: 0;
  right: 0;
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  z-index: 30;
  padding: 8px;
}

.user-search {
  width: 100%;
  padding: 8px 10px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-light);
  background: var(--bg-subtle);
  font-size: 12px;
  color: var(--text-primary);
}

.user-search:focus {
  outline: none;
  border-color: var(--brand-primary);
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
  background: var(--bg-surface);
}

.user-list {
  margin-top: 8px;
  max-height: 180px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.user-option {
  text-align: left;
  background: transparent;
  border: none;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 12px;
  color: var(--text-primary);
}

.user-option:hover {
  background: var(--bg-subtle);
}

.user-empty {
  font-size: 11px;
  color: var(--text-tertiary);
  padding: 6px 8px;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 120;
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
  gap: 8px;
}

.modal-text {
  font-size: 13px;
  color: var(--text-primary);
}

.modal-actions {
  margin-top: 14px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
