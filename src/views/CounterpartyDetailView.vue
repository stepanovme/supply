<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TopNav from '../components/layout/TopNav.vue'
import { mainNavLinks } from '../constants/mainNav'

const route = useRoute()
const router = useRouter()

const navLinks = mainNavLinks

const loading = ref(false)
const error = ref('')
const data = ref(null)
const activeTab = ref('info')
const employeesLoading = ref(false)
const employeesError = ref('')
const employees = ref([])
const employeesViewMode = ref('table')
const employeesSearch = ref('')
const employeesSearchDraft = ref('')
const employeeModalOpen = ref(false)
const employeeModalMode = ref('create')
const employeeModalSaving = ref(false)
const employeeModalError = ref('')
const employeeEditId = ref('')
const employeePersonId = ref('')
const employeePersonQuery = ref('')
const employeePersonMode = ref('existing')
const employeePersonDropdownOpen = ref(false)
const employeePersonLookupRef = ref(null)
const employeePersons = ref([])
const employeePersonsLoading = ref(false)
const employeePersonsError = ref('')
const employeeNewPerson = ref({
  last_name: '',
  name: '',
  middle_name: '',
})
const employeeForm = ref({
  position: '',
  phone_work: '',
  phone_extra: '',
  email_work: '',
  email_extra: '',
  role_type: 'employee',
  comment: '',
})
let employeesSearchTimer = null

const roleOptions = [
  { value: 'employee', label: 'Сотрудник' },
  { value: 'owner', label: 'Директор' },
  { value: 'founder', label: 'Учредитель' },
]

const type = computed(() => String(route.params.type || '').toLowerCase())
const id = computed(() => String(route.params.id || route.params.counterparty_id || ''))

const resolvedType = computed(() => {
  const payload = data.value || {}
  if (payload.owner || payload.details?.ogrnip) return 'ip'
  if (payload.personal_data || payload.passport) return 'phys'
  if (payload.director || payload.details?.kpp || payload.details?.ogrn || Array.isArray(payload.bank_accounts)) {
    return 'llc'
  }
  if (['llc', 'ip', 'phys'].includes(type.value)) return type.value
  return 'phys'
})

const typeTitle = computed(() => {
  if (resolvedType.value === 'llc') return 'ООО'
  if (resolvedType.value === 'ip') return 'ИП'
  return 'Физ. лицо'
})
const pageTitle = computed(() => {
  const name = data.value?.basic_info?.short_name || data.value?.basic_info?.full_name
  return name ? `${name} (${typeTitle.value})` : `Карточка контрагента (${typeTitle.value})`
})

const employeesCountText = computed(() => {
  const count = employees.value.length
  return count ? `${count} сотруд${count === 1 ? 'ник' : count < 5 ? 'ника' : 'ников'}` : 'Сотрудники'
})

const normalizeArray = (payload) => {
  if (Array.isArray(payload)) return payload
  return payload?.items || payload?.data || payload?.results || []
}

const normalizePersonLabel = (item) => String(
  item?.full_name
    || [item?.last_name, item?.name, item?.middle_name].filter(Boolean).join(' ')
    || ''
).replace(/\s+/g, ' ').trim()

const formatPhoneMask = (value) => {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 11)
  if (!digits) return ''
  let normalized = digits
  if (normalized.length === 11 && normalized.startsWith('8')) {
    normalized = `7${normalized.slice(1)}`
  }
  if (normalized.length === 11 && !normalized.startsWith('7')) {
    normalized = `7${normalized.slice(1)}`
  }
  const local = normalized.startsWith('7') ? normalized.slice(1) : normalized
  const parts = []
  if (local.length > 0) parts.push(`+7 (${local.slice(0, 3)}`)
  else return '+7 ('
  if (local.length >= 3) parts[0] = `+7 (${local.slice(0, 3)})`
  if (local.length > 3) parts.push(` ${local.slice(3, 6)}`)
  if (local.length > 6) parts.push(`-${local.slice(6, 8)}`)
  if (local.length > 8) parts.push(`-${local.slice(8, 10)}`)
  return parts.join('').trim()
}

const onPhoneFieldInput = (field, event) => {
  const targetValue = event?.target?.value ?? employeeForm.value[field]
  employeeForm.value[field] = formatPhoneMask(targetValue)
}

const formatPersonName = (item) => {
  if (!item) return '—'
  return item.full_name
    || [item.last_name, item.name, item.middle_name].filter(Boolean).join(' ')
    || '—'
}

const formatContactValue = (primary, fallback) => String(primary || fallback || '—')

const formatPersonLabel = (item) => {
  if (!item) return '—'
  return normalizePersonLabel(item) || item.email || item.phone || '—'
}

const filteredEmployeePersons = computed(() => {
  const q = String(employeePersonQuery.value || '').trim().toLowerCase()
  if (!q) return employeePersons.value
  return employeePersons.value.filter((item) => {
    const haystack = [
      item.full_name,
      item.last_name,
      item.name,
      item.middle_name,
      item.phone,
      item.email,
    ].join(' ').toLowerCase()
    return haystack.includes(q)
  })
})

const resetEmployeeForm = () => {
  employeeModalMode.value = 'create'
  employeeModalError.value = ''
  employeeModalSaving.value = false
  employeeEditId.value = ''
  employeePersonId.value = ''
  employeePersonQuery.value = ''
  employeePersonMode.value = 'existing'
  employeePersonDropdownOpen.value = false
  employeePersonsError.value = ''
  employeeNewPerson.value = {
    last_name: '',
    name: '',
    middle_name: '',
  }
  employeeForm.value = {
    position: '',
    phone_work: '',
    phone_extra: '',
    email_work: '',
    email_extra: '',
    role_type: 'employee',
    comment: '',
  }
}

const loadEmployeePersons = async () => {
  if (employeePersonsLoading.value) return
  employeePersonsLoading.value = true
  employeePersonsError.value = ''
  try {
    const res = await fetch('/apiref/ref/persons', { credentials: 'include' })
    if (!res.ok) throw new Error('persons load failed')
    const list = normalizeArray(await res.json()).map((item) => ({
      ...item,
      id: String(item?.id || item?.person_id || ''),
      full_name: normalizePersonLabel(item),
      phone: item?.phone || item?.phone_personal || '',
      email: item?.email || item?.email_personal || '',
    })).filter((item) => item.id)
    const uniq = new Map()
    list.forEach((item) => {
      const key = normalizePersonLabel(item).toLowerCase() || item.id
      if (!uniq.has(key)) uniq.set(key, item)
    })
    employeePersons.value = [...uniq.values()].sort((a, b) => normalizePersonLabel(a).localeCompare(normalizePersonLabel(b), 'ru'))
  } catch {
    employeePersons.value = []
    employeePersonsError.value = 'Не удалось загрузить список людей.'
  } finally {
    employeePersonsLoading.value = false
  }
}

const openCreateEmployeeModal = async () => {
  resetEmployeeForm()
  employeeModalMode.value = 'create'
  employeeModalOpen.value = true
  if (!employeePersons.value.length) {
    await loadEmployeePersons()
  }
}

const openEditEmployeeModal = (employee) => {
  if (!employee) return
  resetEmployeeForm()
  employeeModalMode.value = 'edit'
  employeeEditId.value = String(employee.id || '')
  employeePersonId.value = String(employee.person_id || '')
  employeePersonQuery.value = formatPersonLabel(employee)
  employeeForm.value = {
    position: employee.position || '',
    phone_work: formatPhoneMask(employee.phone_work || ''),
    phone_extra: formatPhoneMask(employee.phone_extra || ''),
    email_work: employee.email_work || '',
    email_extra: employee.email_extra || '',
    role_type: employee.role_type || employee.role || 'employee',
    comment: employee.comment || '',
  }
  employeeModalOpen.value = true
}

const closeEmployeeModal = () => {
  employeeModalOpen.value = false
  resetEmployeeForm()
}

const selectEmployeePerson = (person) => {
  employeePersonId.value = String(person?.id || '')
  employeePersonQuery.value = formatPersonLabel(person)
  employeePersonDropdownOpen.value = false
}

const onEmployeePersonInput = () => {
  employeePersonId.value = ''
  employeePersonDropdownOpen.value = true
}

const openNewPersonForm = () => {
  employeeModalError.value = ''
  employeePersonMode.value = 'new'
  employeePersonId.value = ''
  employeePersonQuery.value = ''
  employeePersonDropdownOpen.value = false
  employeeNewPerson.value = {
    last_name: '',
    name: '',
    middle_name: '',
  }
  if (!employeePersons.value.length) loadEmployeePersons()
}

const normalizeText = (value) => String(value || '').trim()

const buildNewPersonPayload = () => ({
  name: normalizeText(employeeNewPerson.value.name),
  last_naem: normalizeText(employeeNewPerson.value.last_name),
  last_name: normalizeText(employeeNewPerson.value.last_name),
  middle_name: normalizeText(employeeNewPerson.value.middle_name),
  phone_personal: '',
  email_personal: '',
})

const createPerson = async () => {
  const personPayload = buildNewPersonPayload()
  if (!personPayload.last_naem || !personPayload.name) {
    throw new Error('person name missing')
  }
  const personRes = await fetch('/apiref/ref/persons', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(personPayload),
  })
  if (!personRes.ok) throw new Error('person create failed')
  const personJson = await personRes.json()
  const personId = personJson?.id || personJson?.person_id
  if (!personId) throw new Error('person_id missing')
  return String(personId)
}

const generateEmployeeId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `emp-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const saveEmployee = async () => {
  employeeModalError.value = ''
  const payload = {
    counterparty_id: id.value,
    position: String(employeeForm.value.position || ''),
    phone_work: formatPhoneMask(employeeForm.value.phone_work),
    phone_extra: formatPhoneMask(employeeForm.value.phone_extra),
    email_work: String(employeeForm.value.email_work || ''),
    email_extra: String(employeeForm.value.email_extra || ''),
    role_type: String(employeeForm.value.role_type || ''),
    comment: String(employeeForm.value.comment || ''),
  }

  if (employeeModalMode.value === 'create' && employeePersonMode.value === 'existing' && !employeePersonId.value) {
    employeeModalError.value = 'Выберите человека или нажмите «Создать физическое лицо».'
    return
  }

  employeeModalSaving.value = true
  if (employeeModalMode.value === 'create') {
    try {
      if (employeePersonMode.value === 'new') {
        const personId = await createPerson()
        payload.person_id = personId
      } else {
        payload.person_id = employeePersonId.value
      }
      payload.id = generateEmployeeId()
    } catch {
      employeeModalError.value = 'Не удалось создать физическое лицо.'
      employeeModalSaving.value = false
      return
    }
  }

  try {
    const res = await fetch(
      employeeModalMode.value === 'create'
        ? '/apiref/ref/employees'
        : `/apiref/ref/employees/${encodeURIComponent(employeeEditId.value)}`,
      {
        method: employeeModalMode.value === 'create' ? 'POST' : 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    )
    if (!res.ok) throw new Error('employee save failed')
    closeEmployeeModal()
    await loadEmployees()
  } catch {
    employeeModalError.value = 'Не удалось сохранить сотрудника.'
  } finally {
    employeeModalSaving.value = false
  }
}

const loadEmployees = async () => {
  if (!id.value) return
  employeesLoading.value = true
  employeesError.value = ''
  try {
    const params = new URLSearchParams()
    const search = String(employeesSearch.value || '').trim()
    if (search) params.set('search', search)
    const query = params.toString()
    const res = await fetch(
      `/apiref/ref/employees/counterparty/${encodeURIComponent(id.value)}${query ? `?${query}` : ''}`,
      { credentials: 'include' },
    )
    if (!res.ok) throw new Error('employees load failed')
    employees.value = normalizeArray(await res.json()).map((item) => ({
      ...item,
      id: String(item?.id || ''),
      person_id: String(item?.person_id || ''),
      full_name: formatPersonLabel(item),
      position: item?.position || '',
      phone_work: formatPhoneMask(item?.phone_work || ''),
      phone_extra: formatPhoneMask(item?.phone_extra || ''),
      email_work: item?.email_work || '',
      email_extra: item?.email_extra || '',
      role_type: item?.role_type || item?.role || '',
      comment: item?.comment || '',
    }))
  } catch {
    employees.value = []
    employeesError.value = 'Не удалось загрузить сотрудников компании.'
  } finally {
    employeesLoading.value = false
  }
}

const setTab = (tab) => {
  activeTab.value = tab
  if (tab === 'employees' && !employees.value.length && !employeesLoading.value) {
    loadEmployees()
  }
}

const onEmployeesSearchInput = () => {
  employeesSearch.value = employeesSearchDraft.value.trim()
  clearTimeout(employeesSearchTimer)
  employeesSearchTimer = setTimeout(() => {
    if (activeTab.value === 'employees') loadEmployees()
  }, 300)
}

const handleWindowClick = (event) => {
  const target = event?.target
  if (!(target instanceof Node)) return
  const personEl = employeePersonLookupRef.value
  if (!personEl || !personEl.contains(target)) {
    employeePersonDropdownOpen.value = false
  }
}

const loadCounterparty = async () => {
  if (!id.value) {
    error.value = 'Некорректный идентификатор контрагента.'
    return
  }
  loading.value = true
  error.value = ''
  try {
    const res = await fetch(`/apiref/ref/counterparties/${encodeURIComponent(id.value)}/full-profile`, {
      credentials: 'include',
    })
    if (!res.ok) throw new Error('load failed')
    data.value = await res.json()
  } catch (e) {
    error.value = 'Не удалось загрузить карточку контрагента.'
  } finally {
    loading.value = false
  }
}

const goBack = () => router.push('/users')

watch(id, () => {
  activeTab.value = 'info'
  employees.value = []
  employeesError.value = ''
  employeesSearch.value = ''
  employeesSearchDraft.value = ''
  closeEmployeeModal()
  loadCounterparty()
  if (activeTab.value === 'employees') loadEmployees()
})

watch(activeTab, (tab) => {
  if (tab === 'employees' && !employees.value.length && !employeesLoading.value) {
    loadEmployees()
  }
})

onMounted(loadCounterparty)
onMounted(() => {
  window.addEventListener('mousedown', handleWindowClick)
})

onBeforeUnmount(() => {
  if (employeesSearchTimer) clearTimeout(employeesSearchTimer)
  window.removeEventListener('mousedown', handleWindowClick)
})
</script>

<template>
  <div class="page">
    <TopNav :links="navLinks" />
    <main class="main-content">
      <div class="content-header">
        <button class="back-btn" type="button" @click="goBack">
          <i class="fas fa-chevron-left"></i>
          <span>Вернуться</span>
        </button>
        <h1 class="page-title">{{ pageTitle }}</h1>
      </div>

      <div v-if="loading" class="panel placeholder">Загрузка...</div>
      <div v-else-if="error" class="panel placeholder error">{{ error }}</div>

      <template v-else-if="data">
        <div class="tabs">
          <button class="tab-btn" :class="{ active: activeTab === 'info' }" type="button" @click="setTab('info')">
            Информация о компании
          </button>
          <button class="tab-btn" :class="{ active: activeTab === 'employees' }" type="button" @click="setTab('employees')">
            Сотрудники
          </button>
        </div>

        <template v-if="activeTab === 'info'">
          <div class="panel">
            <h2 class="section-title">Базовая информация</h2>
            <div class="grid">
              <div class="field"><label>Краткое наименование</label><div>{{ data.basic_info?.short_name || '—' }}</div></div>
              <div class="field"><label>Полное наименование</label><div>{{ data.basic_info?.full_name || '—' }}</div></div>
              <div class="field"><label>Внутренняя компания</label><div>{{ data.basic_info?.is_internal ? 'Да' : 'Нет' }}</div></div>
              <div class="field"><label>Префикс договора</label><div>{{ data.basic_info?.contract_prefix || '—' }}</div></div>
            </div>
          </div>

          <div class="panel" v-if="resolvedType === 'llc'">
            <h2 class="section-title">Реквизиты ООО</h2>
            <div class="grid">
              <div class="field"><label>ИНН</label><div>{{ data.details?.inn || '—' }}</div></div>
              <div class="field"><label>КПП</label><div>{{ data.details?.kpp || '—' }}</div></div>
              <div class="field"><label>ОГРН</label><div>{{ data.details?.ogrn || '—' }}</div></div>
              <div class="field"><label>ОКПО</label><div>{{ data.details?.okpo || '—' }}</div></div>
              <div class="field"><label>ОКВЭД</label><div>{{ data.details?.okved || '—' }}</div></div>
              <div class="field"><label>ОКОГУ</label><div>{{ data.details?.okogu || '—' }}</div></div>
              <div class="field"><label>ОКАТО</label><div>{{ data.details?.okato || '—' }}</div></div>
              <div class="field"><label>ОКТМО</label><div>{{ data.details?.oktmo || '—' }}</div></div>
              <div class="field"><label>ОКФС</label><div>{{ data.details?.okfs || '—' }}</div></div>
              <div class="field"><label>ОКОПФ</label><div>{{ data.details?.okopf || '—' }}</div></div>
              <div class="field"><label>Система налогообложения</label><div>{{ data.details?.tax_system || '—' }}</div></div>
              <div class="field"><label>Дата регистрации</label><div>{{ data.details?.date_register || '—' }}</div></div>
            </div>
            <div class="sublist">
              <label>Доп. ОКВЭД</label>
              <div class="stack">
                <div class="field" v-for="item in data.additional_okved || []" :key="item">
                  <div>{{ item }}</div>
                </div>
                <div class="field" v-if="!data.additional_okved?.length">
                  <div>—</div>
                </div>
              </div>
            </div>
          </div>

          <div class="panel" v-if="resolvedType === 'llc'">
            <h2 class="section-title">Руководитель</h2>
            <div class="grid">
              <div class="field">
                <label>ФИО</label>
                <div>{{ [data.director?.last_name, data.director?.name, data.director?.middle_name].filter(Boolean).join(' ') || '—' }}</div>
              </div>
              <div class="field"><label>Должность</label><div>{{ data.director?.position || '—' }}</div></div>
              <div class="field"><label>Телефон</label><div>{{ data.director?.phone || '—' }}</div></div>
              <div class="field"><label>Email</label><div>{{ data.director?.email || '—' }}</div></div>
            </div>
          </div>

          <div class="panel" v-if="resolvedType === 'ip'">
            <h2 class="section-title">Реквизиты ИП</h2>
            <div class="grid">
              <div class="field"><label>ИНН</label><div>{{ data.details?.inn || '—' }}</div></div>
              <div class="field"><label>ОГРНИП</label><div>{{ data.details?.ogrnip || '—' }}</div></div>
              <div class="field"><label>ОКПО</label><div>{{ data.details?.okpo || '—' }}</div></div>
              <div class="field"><label>ОКВЭД</label><div>{{ data.details?.okved || '—' }}</div></div>
              <div class="field"><label>ОКОПФ</label><div>{{ data.details?.okopf || '—' }}</div></div>
              <div class="field"><label>ОКФС</label><div>{{ data.details?.okfs || '—' }}</div></div>
              <div class="field"><label>ОКОГУ</label><div>{{ data.details?.okogu || '—' }}</div></div>
              <div class="field"><label>ОКАТО</label><div>{{ data.details?.okato || '—' }}</div></div>
              <div class="field"><label>ОКТМО</label><div>{{ data.details?.oktmo || '—' }}</div></div>
              <div class="field"><label>Дата регистрации</label><div>{{ data.details?.date_register || '—' }}</div></div>
            </div>
            <div class="sublist">
              <label>Доп. ОКВЭД</label>
              <div class="stack">
                <div class="field" v-for="item in data.additional_okved || []" :key="item">
                  <div>{{ item }}</div>
                </div>
                <div class="field" v-if="!data.additional_okved?.length">
                  <div>—</div>
                </div>
              </div>
            </div>
          </div>

          <div class="panel" v-if="resolvedType === 'ip'">
            <h2 class="section-title">Владелец</h2>
            <div class="grid">
              <div class="field">
                <label>ФИО</label>
                <div>{{ [data.owner?.last_name, data.owner?.name, data.owner?.middle_name].filter(Boolean).join(' ') || '—' }}</div>
              </div>
              <div class="field"><label>Дата рождения</label><div>{{ data.owner?.birth_date || '—' }}</div></div>
              <div class="field"><label>Телефон</label><div>{{ data.owner?.phone || '—' }}</div></div>
              <div class="field"><label>Email</label><div>{{ data.owner?.email || '—' }}</div></div>
            </div>
          </div>

          <div class="panel" v-if="resolvedType === 'phys'">
            <h2 class="section-title">Данные физического лица</h2>
            <div class="grid">
              <div class="field"><label>Фамилия</label><div>{{ data.personal_data?.last_name || '—' }}</div></div>
              <div class="field"><label>Имя</label><div>{{ data.personal_data?.name || '—' }}</div></div>
              <div class="field"><label>Отчество</label><div>{{ data.personal_data?.middle_name || '—' }}</div></div>
              <div class="field"><label>Дата рождения</label><div>{{ data.personal_data?.birth_date || '—' }}</div></div>
              <div class="field"><label>Телефон</label><div>{{ data.personal_data?.phone || '—' }}</div></div>
              <div class="field"><label>Email</label><div>{{ data.personal_data?.email || '—' }}</div></div>
              <div class="field"><label>Серия паспорта</label><div>{{ data.passport?.series || '—' }}</div></div>
              <div class="field"><label>Номер паспорта</label><div>{{ data.passport?.number || '—' }}</div></div>
              <div class="field"><label>Кем выдан</label><div>{{ data.passport?.issued_by || '—' }}</div></div>
              <div class="field"><label>Дата выдачи</label><div>{{ data.passport?.date_issued || '—' }}</div></div>
              <div class="field"><label>Код подразделения</label><div>{{ data.passport?.department_code || '—' }}</div></div>
              <div class="field"><label>Должность</label><div>{{ data.employment?.position || '—' }}</div></div>
              <div class="field"><label>Рабочий телефон</label><div>{{ data.employment?.phone_work || '—' }}</div></div>
              <div class="field"><label>Рабочий email</label><div>{{ data.employment?.email_work || '—' }}</div></div>
            </div>
          </div>

          <div
            class="panel"
            v-if="
              (resolvedType === 'llc' && (data.details?.legal_address || data.details?.actual_address || data.details?.postal_address))
              || (resolvedType === 'phys' && (data.addresses?.registration || data.addresses?.living))
            "
          >
            <h2 class="section-title">Адреса</h2>
            <div class="grid">
              <template v-if="resolvedType === 'llc'">
                <div class="field"><label>Юридический адрес</label><div>{{ data.details?.legal_address || '—' }}</div></div>
                <div class="field"><label>Фактический адрес</label><div>{{ data.details?.actual_address || '—' }}</div></div>
                <div class="field"><label>Почтовый адрес</label><div>{{ data.details?.postal_address || '—' }}</div></div>
              </template>
              <template v-else-if="resolvedType === 'phys'">
                <div class="field"><label>Адрес регистрации</label><div>{{ data.addresses?.registration || '—' }}</div></div>
                <div class="field"><label>Адрес проживания</label><div>{{ data.addresses?.living || '—' }}</div></div>
              </template>
            </div>
          </div>

          <div class="panel" v-if="resolvedType === 'llc' && Array.isArray(data.bank_accounts)">
            <h2 class="section-title">Банковские счета</h2>
            <table class="table">
              <thead>
                <tr>
                  <th>Название</th>
                  <th>Банк</th>
                  <th>БИК</th>
                  <th>Расчётный счёт</th>
                  <th>Кор. счёт</th>
                  <th>Основной</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="acc in data.bank_accounts" :key="acc.id">
                  <td>{{ acc.account_name || '—' }}</td>
                  <td>{{ acc.bank_name || '—' }}</td>
                  <td>{{ acc.bik || '—' }}</td>
                  <td>{{ acc.account_number || '—' }}</td>
                  <td>{{ acc.correspondent_account || '—' }}</td>
                  <td>{{ acc.is_main ? 'Да' : 'Нет' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>

        <template v-else-if="activeTab === 'employees'">
          <div class="panel employees-panel">
            <div class="employees-toolbar">
              <div>
                <h2 class="section-title">Сотрудники</h2>
                <div class="employees-subtitle">{{ employeesCountText }}</div>
              </div>
              <div class="employees-controls">
                <button class="btn btn-primary" type="button" @click="openCreateEmployeeModal">
                  <i class="fas fa-plus"></i>
                  Добавить сотрудника
                </button>
                <div class="search-wrap">
                  <input
                    v-model="employeesSearchDraft"
                    class="search-input"
                    type="text"
                    name="employees-search"
                    autocomplete="off"
                    autocapitalize="off"
                    autocorrect="off"
                    spellcheck="false"
                    placeholder="Поиск по ФИО, должности, телефону, email..."
                    @input="onEmployeesSearchInput"
                  >
                </div>
                <div class="view-toggle">
                  <button class="toggle-btn" :class="{ active: employeesViewMode === 'table' }" type="button" @click="employeesViewMode = 'table'">Таблица</button>
                  <button class="toggle-btn" :class="{ active: employeesViewMode === 'cards' }" type="button" @click="employeesViewMode = 'cards'">Карточки</button>
                </div>
              </div>
            </div>

            <div v-if="employeesLoading" class="placeholder">Загрузка сотрудников...</div>
            <div v-else-if="employeesError" class="placeholder error">{{ employeesError }}</div>
            <template v-else>
              <div v-if="employeesViewMode === 'table'" class="employees-table-wrap">
                <table class="employees-table">
                  <thead>
                    <tr>
                      <th>ФИО</th>
                      <th>Должность</th>
                      <th>Телефон</th>
                      <th>Email</th>
                      <th>Комментарий</th>
                      <th>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="employee in employees" :key="employee.id">
                      <td>{{ formatPersonName(employee) }}</td>
                      <td>{{ employee.position || '—' }}</td>
                      <td>{{ formatContactValue(employee.phone_work, employee.phone_personal) }}</td>
                      <td>{{ formatContactValue(employee.email_work, employee.email_personal) }}</td>
                      <td>{{ employee.comment || '—' }}</td>
                      <td>
                        <button class="employee-action-btn" type="button" @click="openEditEmployeeModal(employee)">
                          <i class="fas fa-pen"></i>
                          Изменить
                        </button>
                      </td>
                    </tr>
                    <tr v-if="!employees.length">
                      <td colspan="6" class="empty-row">Сотрудники не найдены.</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div v-else class="employees-cards">
                <div v-for="employee in employees" :key="employee.id" class="employee-card">
                  <div class="employee-card-name">{{ formatPersonName(employee) }}</div>
                  <div class="employee-card-grid">
                    <div class="employee-card-field">
                      <span>Должность</span>
                      <div>{{ employee.position || '—' }}</div>
                    </div>
                    <div class="employee-card-field">
                      <span>Телефон</span>
                      <div>{{ formatContactValue(employee.phone_work, employee.phone_personal) }}</div>
                    </div>
                    <div class="employee-card-field">
                      <span>Email</span>
                      <div>{{ formatContactValue(employee.email_work, employee.email_personal) }}</div>
                    </div>
                    <div class="employee-card-field employee-card-comment">
                      <span>Комментарий</span>
                      <div>{{ employee.comment || '—' }}</div>
                    </div>
                  </div>
                  <div class="employee-card-actions">
                    <button class="employee-action-btn" type="button" @click="openEditEmployeeModal(employee)">
                      <i class="fas fa-pen"></i>
                      Изменить
                    </button>
                  </div>
                </div>
                <div v-if="!employees.length" class="placeholder">Сотрудники не найдены.</div>
              </div>
            </template>
          </div>
        </template>
      </template>

      <div v-if="employeeModalOpen" class="modal-backdrop" @click="closeEmployeeModal">
        <div class="modal-card employee-modal" @click.stop>
          <div class="modal-title">
            {{ employeeModalMode === 'create' ? 'Добавить сотрудника' : 'Изменить сотрудника' }}
          </div>
          <div class="modal-subtitle">{{ pageTitle }}</div>

          <div class="modal-field" v-if="employeeModalMode === 'create' && employeePersonMode === 'existing'">
            <span>Человек</span>
            <div ref="employeePersonLookupRef" class="lookup-wrap">
              <div class="input-with-icon">
                <input
                  v-model="employeePersonQuery"
                  class="form-input"
                  type="text"
                  name="employee-person-search"
                  autocomplete="off"
                  autocapitalize="off"
                  autocorrect="off"
                  spellcheck="false"
                  placeholder="Начните вводить ФИО, телефон или email..."
                  @focus="employeePersonDropdownOpen = true"
                  @input="onEmployeePersonInput"
                >
                <button class="field-icon-btn" type="button" @click="employeePersonDropdownOpen = !employeePersonDropdownOpen">
                  <i class="fas fa-chevron-down"></i>
                </button>
              </div>
              <div v-if="employeePersonDropdownOpen" class="lookup-list lookup-list-overlay">
                <div class="lookup-sticky-head">
                  <button class="lookup-item create-person-item" type="button" @click="openNewPersonForm">
                    + Создать физическое лицо
                  </button>
                </div>
                <div class="lookup-scroll-area">
                  <div v-if="employeePersonsLoading" class="lookup-empty">Загрузка...</div>
                  <div v-else-if="employeePersonsError" class="lookup-empty error">{{ employeePersonsError }}</div>
                  <button
                    v-for="person in filteredEmployeePersons"
                    :key="person.id"
                    class="lookup-item"
                    type="button"
                    @click="selectEmployeePerson(person)"
                  >
                    {{ formatPersonLabel(person) }}
                  </button>
                  <div v-if="!employeePersonsLoading && !employeePersonsError && !filteredEmployeePersons.length" class="lookup-empty">
                    Ничего не найдено
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-if="employeeModalMode === 'create' && employeePersonMode === 'new'" class="modal-grid">
            <div class="modal-field modal-field-wide person-mode-back">
              <button class="person-back-btn" type="button" @click="employeePersonMode = 'existing'">
                <i class="fas fa-chevron-left"></i>
                Вернуться к списку людей
              </button>
              <div class="modal-note">Создаём новое физическое лицо, а потом автоматически привяжем его к сотруднику.</div>
            </div>
            <label class="modal-field">
              <span>Фамилия</span>
              <input
                v-model="employeeNewPerson.last_name"
                class="form-input"
                type="text"
                name="employee-person-last-name"
                autocomplete="off"
                autocapitalize="words"
                autocorrect="off"
                spellcheck="false"
                placeholder="Например: Иванов"
              >
            </label>
            <label class="modal-field">
              <span>Имя</span>
              <input
                v-model="employeeNewPerson.name"
                class="form-input"
                type="text"
                name="employee-person-name"
                autocomplete="off"
                autocapitalize="words"
                autocorrect="off"
                spellcheck="false"
                placeholder="Например: Иван"
              >
            </label>
            <label class="modal-field">
              <span>Отчество</span>
              <input
                v-model="employeeNewPerson.middle_name"
                class="form-input"
                type="text"
                name="employee-person-middle-name"
                autocomplete="off"
                autocapitalize="words"
                autocorrect="off"
                spellcheck="false"
                placeholder="Например: Иванович"
              >
            </label>
          </div>

          <div class="modal-field" v-if="employeeModalMode === 'edit'">
            <span>Человек</span>
            <input class="form-input" type="text" :value="employeePersonQuery" disabled autocomplete="off">
            <div v-if="employeeModalMode === 'edit'" class="modal-note">Физическое лицо у существующего сотрудника не изменяется.</div>
          </div>

          <div class="modal-grid">
            <label class="modal-field">
              <span>Должность</span>
              <input v-model="employeeForm.position" class="form-input" type="text" placeholder="Например: Инженер">
            </label>
            <label class="modal-field">
              <span>Тип роли</span>
              <select v-model="employeeForm.role_type" class="form-input">
                <option v-for="role in roleOptions" :key="role.value" :value="role.value">{{ role.label }}</option>
              </select>
            </label>
            <label class="modal-field">
              <span>Телефон рабочий</span>
              <input
                :value="employeeForm.phone_work"
                class="form-input"
                type="text"
                inputmode="tel"
                placeholder="+7 (___) ___-__-__"
                @input="onPhoneFieldInput('phone_work', $event)"
              >
            </label>
            <label class="modal-field">
              <span>Телефон дополнительный</span>
              <input
                :value="employeeForm.phone_extra"
                class="form-input"
                type="text"
                inputmode="tel"
                placeholder="+7 (___) ___-__-__"
                @input="onPhoneFieldInput('phone_extra', $event)"
              >
            </label>
            <label class="modal-field">
              <span>Email рабочий</span>
              <input v-model="employeeForm.email_work" class="form-input" type="email" placeholder="name@company.ru">
            </label>
            <label class="modal-field">
              <span>Email дополнительный</span>
              <input v-model="employeeForm.email_extra" class="form-input" type="email" placeholder="name@company.ru">
            </label>
            <label class="modal-field modal-field-wide">
              <span>Комментарий</span>
              <textarea v-model="employeeForm.comment" class="form-input employee-comment-input" rows="3" placeholder="Комментарий..."></textarea>
            </label>
          </div>

          <div v-if="employeeModalError" class="lookup-empty error modal-error">{{ employeeModalError }}</div>

          <div class="modal-actions">
            <button class="btn" type="button" :disabled="employeeModalSaving" @click="closeEmployeeModal">Отмена</button>
            <button class="btn btn-primary" type="button" :disabled="employeeModalSaving" @click="saveEmployee">
              {{ employeeModalSaving ? 'Сохранение...' : 'Сохранить' }}
            </button>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.page {
  width: 100%;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.main-content {
  flex-grow: 1;
  padding: 24px 32px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.content-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.back-btn {
  height: 32px;
  padding: 0 10px;
  border-radius: var(--radius-sm);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-secondary);
  border: 1px solid var(--border-light);
  background: var(--bg-surface);
  cursor: pointer;
}

.back-btn:hover {
  background: var(--bg-subtle);
  color: var(--text-primary);
}

.page-title {
  font-size: 20px;
  font-weight: 700;
}

.panel {
  background: var(--bg-surface);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-light);
  box-shadow: var(--shadow-sm);
  padding: 16px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.field label {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.field div {
  padding: 10px 12px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--bg-subtle);
  font-size: 12px;
  white-space: pre-wrap;
}

.sublist {
  margin-top: 16px;
}

.sublist label {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.sublist ul {
  margin: 0;
  padding-left: 20px;
}

.sublist li {
  font-size: 12px;
  margin: 4px 0;
}

.stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.placeholder {
  font-size: 12px;
  color: var(--text-secondary);
}

.placeholder.error {
  color: var(--danger-text);
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

.table th {
  background: var(--bg-subtle);
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.employees-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.employees-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  flex-wrap: wrap;
}

.employees-subtitle {
  font-size: 12px;
  color: var(--text-secondary);
}

.employees-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.search-wrap {
  min-width: 280px;
  flex: 1 1 280px;
}

.search-input {
  width: 100%;
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: #fff;
  font: inherit;
  font-size: 12px;
}

.employees-table-wrap {
  overflow: auto;
}

.employees-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.employees-table th,
.employees-table td {
  border: 1px solid var(--border-light);
  padding: 10px 12px;
  text-align: left;
  vertical-align: top;
}

.employees-table th {
  background: var(--bg-subtle);
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.employees-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 12px;
}

.employee-card {
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  padding: 14px;
  box-shadow: var(--shadow-sm);
}

.employee-card-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 12px;
}

.employee-card-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.employee-card-field span {
  display: block;
  font-size: 11px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.employee-card-field div {
  font-size: 12px;
  color: var(--text-primary);
  white-space: pre-wrap;
  line-height: 1.4;
}

.employee-card-actions {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
}

.employee-action-btn {
  border: 1px solid var(--border-light);
  background: var(--bg-surface);
  color: var(--text-primary);
  border-radius: var(--radius-md);
  padding: 7px 10px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.employee-action-btn:hover {
  background: var(--bg-subtle);
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 300;
}

.modal-card.employee-modal {
  width: min(920px, 100%);
  max-height: calc(100vh - 32px);
  overflow: auto;
  background: linear-gradient(180deg, var(--bg-surface) 0%, #f8fafc 100%);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: 20px;
}

.modal-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
}

.modal-subtitle {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.modal-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 14px;
  background: #fff;
  border: 1px solid var(--border-light);
  border-radius: 14px;
  padding: 12px 14px;
  box-shadow: 0 1px 0 rgba(15, 23, 42, 0.02);
}

.modal-field > span {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 600;
}

.modal-card.employee-modal .form-input {
  width: 100%;
  min-height: 40px;
  padding: 9px 12px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: #f8fafc;
  color: var(--text-primary);
  font: inherit;
  font-size: 12px;
  box-sizing: border-box;
}

.modal-card.employee-modal .form-input:focus {
  outline: none;
  border-color: var(--brand-primary);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}

.modal-card.employee-modal select.form-input {
  appearance: none;
  background-image: linear-gradient(45deg, transparent 50%, var(--text-secondary) 50%), linear-gradient(135deg, var(--text-secondary) 50%, transparent 50%);
  background-position: calc(100% - 18px) 16px, calc(100% - 12px) 16px;
  background-size: 6px 6px, 6px 6px;
  background-repeat: no-repeat;
  padding-right: 36px;
}

.modal-grid {
  margin-top: 8px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.modal-grid .modal-field {
  margin-top: 0;
}

.modal-field-wide {
  grid-column: 1 / -1;
}

.person-mode-back {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.person-back-btn {
  align-self: flex-start;
  border: 1px solid var(--border-light);
  background: var(--bg-surface);
  color: var(--text-primary);
  border-radius: 999px;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.person-back-btn:hover {
  background: var(--bg-subtle);
}

.employee-comment-input {
  min-height: 92px;
  resize: vertical;
  padding: 10px 12px;
}

.modal-field textarea.form-input {
  min-height: 92px;
  resize: vertical;
}

.lookup-wrap {
  position: relative;
}

.lookup-list {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 6px);
  z-index: 30;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  box-shadow: var(--shadow-md);
  max-height: 260px;
  overflow: auto;
  padding: 6px;
}

.lookup-list-overlay {
  position: absolute;
}

.lookup-sticky-head {
  position: sticky;
  top: 0;
  z-index: 3;
  padding-bottom: 6px;
  background: var(--bg-surface);
}

.lookup-scroll-area {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.lookup-empty {
  padding: 8px 10px;
  font-size: 12px;
  color: var(--text-secondary);
}

.lookup-empty.error {
  color: var(--danger-text);
}

.lookup-item {
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 12px;
  color: var(--text-primary);
  cursor: pointer;
}

.lookup-item:hover {
  background: var(--bg-subtle);
}

.create-person-item {
  margin-bottom: 0;
  border: 1px dashed var(--brand-primary);
  color: var(--brand-primary);
  background: rgba(37, 99, 235, 0.06);
  font-weight: 600;
}

.create-person-item:hover {
  background: rgba(37, 99, 235, 0.12);
}

.input-with-icon {
  position: relative;
}

.input-with-icon .form-input {
  width: 100%;
  padding-right: 40px;
}

.field-icon-btn {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

.field-icon-btn:hover {
  background: var(--bg-subtle);
  color: var(--text-primary);
}

.modal-actions {
  margin-top: 18px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.modal-error {
  margin-top: 14px;
}

.modal-note {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-top: -2px;
}

.tabs {
  display: inline-flex;
  gap: 8px;
  flex-wrap: wrap;
}

.tab-btn {
  border: 1px solid var(--border-light);
  background: var(--bg-surface);
  color: var(--text-secondary);
  border-radius: 999px;
  padding: 8px 14px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.tab-btn:hover {
  background: var(--bg-subtle);
  color: var(--text-primary);
}

.tab-btn.active {
  background: var(--brand-primary);
  color: #fff;
  border-color: var(--brand-primary);
}

.employees-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.employees-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  flex-wrap: wrap;
}

.employees-subtitle {
  font-size: 12px;
  color: var(--text-secondary);
}

.employees-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.search-wrap {
  min-width: 280px;
}

.search-input {
  width: 100%;
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: #fff;
  font: inherit;
  font-size: 12px;
}

.view-toggle {
  display: inline-flex;
  gap: 6px;
  padding: 4px;
  border-radius: 999px;
  background: var(--bg-subtle);
}

.toggle-btn {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  border-radius: 999px;
  padding: 7px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.toggle-btn.active {
  background: var(--brand-primary);
  color: #fff;
}

.employees-table-wrap {
  overflow: auto;
}

.employees-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.employees-table th,
.employees-table td {
  border: 1px solid var(--border-light);
  padding: 10px 12px;
  text-align: left;
  vertical-align: top;
}

.employees-table th {
  background: var(--bg-subtle);
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.employees-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 12px;
}

.employee-card {
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  padding: 14px;
  box-shadow: var(--shadow-sm);
}

.employee-card-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 12px;
}

.employee-card-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.employee-card-field span {
  display: block;
  font-size: 11px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.employee-card-field div {
  font-size: 12px;
  color: var(--text-primary);
  white-space: pre-wrap;
  line-height: 1.4;
}

.employee-card-comment {
  grid-column: 1 / -1;
}
</style>
