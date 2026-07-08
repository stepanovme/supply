<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import TopNav from '../components/layout/TopNav.vue'
import { mainNavLinks } from '../constants/mainNav'

const navLinks = mainNavLinks

const tabs = [
  { key: 'orgs', label: 'Организации' },
  { key: 'users', label: 'Пользователи' },
  { key: 'departments', label: 'Отделы и группы' },
]

const activeTab = ref('users')
const router = useRouter()

const orgs = ref([])
const orgsLoading = ref(false)
const orgsError = ref('')
const resolvingOrgKey = ref('')
const orgSearch = ref('')
const orgTypeFilter = ref('all')

const loadCompanies = async () => {
  orgsLoading.value = true
  orgsError.value = ''
  try {
    const res = await fetch('/apiref/ref/counterparties/summary', { credentials: 'include' })
    if (!res.ok) throw new Error('Failed to load companies')
    const data = await res.json()
    orgs.value = (Array.isArray(data)
      ? data
      : data.data || data.items || data.results || [])
      .map((item) => ({
        ...item,
        id: String(item?.id || item?.counterparty_id || ''),
        short_name: String(item?.short_name || ''),
        full_name: String(item?.full_name || ''),
        opf: String(item?.opf || ''),
        address: String(item?.address || ''),
        phone: String(item?.phone || ''),
        email: String(item?.email || ''),
        inn_ogrn_kpp: String(item?.inn_ogrn_kpp || item?.inn || ''),
        type_kind: orgTypeFromItem(item),
      }))
  } catch (error) {
    orgsError.value = 'Не удалось загрузить список компаний'
  } finally {
    orgsLoading.value = false
  }
}

const orgTypeFromItem = (org) => {
  const explicitType = String(org?.type || '').toUpperCase()
  if (explicitType === 'LLC') return 'llc'
  if (explicitType === 'IP') return 'ip'
  if (explicitType === 'PHYSIC') return 'phys'

  const val = String(org?.opf || '').toLowerCase()
  if (val.includes('ооо')) return 'llc'
  if (val.includes('ип')) return 'ip'
  return 'phys'
}

const uniquePersonOptions = (data) => {
  const list = normalizeArray(data)
    .map((item) => ({
      ...item,
      id: String(item?.id || item?.person_id || ''),
      full_name: normalizePersonLabel(item),
      phone: String(item?.phone || item?.phone_personal || ''),
      email: String(item?.email || item?.email_personal || ''),
    }))
    .filter((item) => item.id)
  const uniq = new Map()
  list.forEach((item) => {
    const key = String(item.full_name || '').toLowerCase() || item.id
    if (!uniq.has(key)) uniq.set(key, item)
  })
  return [...uniq.values()].sort((a, b) => a.full_name.localeCompare(b.full_name, 'ru'))
}

const extractInn = (value) => String(value || '').split('/')[0].replace(/\D/g, '')

const normalizeList = (data) => (Array.isArray(data) ? data : data.data || data.items || data.results || [])

const normalizeText = (value) => String(value ?? '').trim()

const buildUniqueLines = (kind, ...chunks) => {
  const seen = new Set()
  const result = []
  const source = []

  chunks.forEach((chunk) => {
    if (Array.isArray(chunk)) {
      source.push(...chunk)
    } else if (chunk !== undefined && chunk !== null) {
      source.push(chunk)
    }
  })

  source.forEach((value) => {
    const display = normalizeText(value)
    if (!display) return

    let key = display.toLowerCase()
    if (kind === 'phone') key = display.replace(/\D/g, '')
    if (kind === 'email') key = display.toLowerCase()
    if (kind === 'company') key = display.toLowerCase()

    if (!key || seen.has(key)) return
    seen.add(key)
    result.push(display)
  })

  return result
}

const buildCompanyEntries = (...chunks) => {
  const seen = new Set()
  const result = []
  const source = []

  chunks.forEach((chunk) => {
    if (Array.isArray(chunk)) {
      source.push(...chunk)
    } else if (chunk && typeof chunk === 'object') {
      source.push(chunk)
    }
  })

  source.forEach((item) => {
    const id = normalizeText(item?.id || item?.counterparty_id || item?.company_id)
    const name = normalizeText(
      item?.name || item?.company_name || item?.short_name || item?.full_name || item?.counterparty_name
    )
    if (!id && !name) return
    const key = id || name.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    result.push({
      id,
      name: name || '—',
    })
  })

  return result
}

const joinLines = (values, kind = 'text') => {
  const lines = buildUniqueLines(kind, values)
  return lines.length ? lines.join('\n') : '—'
}

const resolveCounterparty = async (org) => {
  const directId = org.id || org.counterparty_id
  if (directId) {
    return { id: directId, type: orgTypeFromItem(org) }
  }

  const inn = extractInn(org.inn_ogrn_kpp)
  const searchQueries = [inn, org.short_name].filter(Boolean)

  for (const query of searchQueries) {
    const res = await fetch(`/apiref/ref/counterparties/search?q=${encodeURIComponent(query)}`, {
      credentials: 'include',
    })
    if (!res.ok) continue
    const items = normalizeList(await res.json())
    if (!items.length) continue

    const match = inn
      ? items.find((item) => extractInn(item.inn_ogrn_kpp || item.inn || '') === inn) || items[0]
      : items.find((item) => item.short_name === org.short_name) || items[0]
    const matchId = match?.id || match?.counterparty_id
    if (!matchId) continue

    return {
      id: matchId,
      type: orgTypeFromItem({ ...org, ...match }),
    }
  }

  throw new Error('missing id')
}

const openCounterparty = async (org) => {
  const rowKey = `${org.short_name || ''}_${org.inn_ogrn_kpp || ''}`
  resolvingOrgKey.value = rowKey
  orgsError.value = ''
  try {
    const target = await resolveCounterparty(org)
    await router.push({
      name: 'counterparty-detail',
      params: {
        type: target.type,
        id: target.id,
      },
    })
  } catch (error) {
    orgsError.value = 'Не удалось открыть карточку контрагента: ID не найден.'
  } finally {
    resolvingOrgKey.value = ''
  }
}

const users = ref([])
const usersLoading = ref(false)
const usersError = ref('')
const userSearch = ref('')
const userCompanyFilter = ref('all')
const userAccessFilter = ref('all')
const personOptions = ref([])
const personOptionsLoading = ref(false)
const personOptionsError = ref('')

const isCreateUserModalOpen = ref(false)
const createUserError = ref('')
const createUserSaving = ref(false)
const createUserPersonMode = ref('existing')
const createUserCompanyQuery = ref('')
const createUserCompanyDropdownOpen = ref(false)
const createUserCompanyLookupRef = ref(null)
const selectedCreateUserCompanyId = ref('')
const selectedCreateUserCompanyName = ref('')
const createUserPersonQuery = ref('')
const createUserPersonDropdownOpen = ref(false)
const createUserPersonLookupRef = ref(null)
const selectedCreateUserPersonId = ref('')
const createUserNewPerson = ref({
  last_name: '',
  name: '',
  middle_name: '',
})
const createUserForm = ref({
  position: '',
  phone_work: '',
  phone_extra: '',
  email_work: '',
  email_extra: '',
  role_type: 'employee',
  comment: '',
})
const companyEmployeesCache = ref([])
const companyEmployeesLoading = ref(false)

const roleOptions = [
  { value: 'employee', label: 'Сотрудник' },
  { value: 'owner', label: 'Директор' },
  { value: 'founder', label: 'Учредитель' },
]

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
  if (normalized.length === 11 && normalized.startsWith('8')) normalized = `7${normalized.slice(1)}`
  if (normalized.length === 11 && !normalized.startsWith('7')) normalized = `7${normalized.slice(1)}`
  const local = normalized.startsWith('7') ? normalized.slice(1) : normalized
  if (!local) return '+7 ('
  let out = `+7 (${local.slice(0, 3)}`
  if (local.length >= 3) out = `+7 (${local.slice(0, 3)})`
  if (local.length > 3) out += ` ${local.slice(3, 6)}`
  if (local.length > 6) out += `-${local.slice(6, 8)}`
  if (local.length > 8) out += `-${local.slice(8, 10)}`
  return out
}

const onUserPhoneInput = (field, event) => {
  createUserForm.value[field] = formatPhoneMask(event?.target?.value || '')
}

const filteredOrgs = computed(() => {
  const q = String(orgSearch.value || '').trim().toLowerCase()
  return orgs.value.filter((org) => {
    if (orgTypeFilter.value !== 'all' && org.type_kind !== orgTypeFilter.value) return false
    if (!q) return true
    return String(org.short_name || '').toLowerCase().includes(q)
  })
})

const uniqueCompanies = computed(() => {
  const map = new Map()
  users.value.forEach((user) => {
    ;(user.companies || []).forEach((company) => {
      if (!company?.name) return
      const key = company.id || company.name.toLowerCase()
      if (!map.has(key)) map.set(key, company.name)
    })
  })
  orgs.value.forEach((org) => {
    if (org.id && org.short_name) {
      map.set(org.id, org.short_name)
    }
  })
  return [...map.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
})

const uniqueAccessRoles = computed(() => {
  const set = new Set()
  users.value.forEach((user) => {
    ;(user.accessValues || []).forEach((value) => {
      if (value && value !== '—') set.add(value)
    })
  })
  return [...set].sort((a, b) => a.localeCompare(b, 'ru'))
})

const filteredUsers = computed(() => {
  const q = String(userSearch.value || '').trim().toLowerCase()
  return users.value.filter((user) => {
    if (userCompanyFilter.value !== 'all' && !(user.companyIds || []).includes(String(userCompanyFilter.value))) return false
    if (userAccessFilter.value !== 'all' && !(user.accessValues || []).includes(String(userAccessFilter.value))) return false
    if (!q) return true
    return String(user.searchText || '').includes(q)
  })
})

const resetOrgFilters = () => {
  orgSearch.value = ''
  orgTypeFilter.value = 'all'
}

const resetUserFilters = () => {
  userSearch.value = ''
  userCompanyFilter.value = 'all'
  userAccessFilter.value = 'all'
}

const filteredCreateCompanies = computed(() => {
  const q = String(createUserCompanyQuery.value || '').trim().toLowerCase()
  if (!q) return orgs.value
  return orgs.value.filter((org) => {
    const haystack = [org.short_name, org.full_name, org.opf, org.address, org.inn_ogrn_kpp].join(' ').toLowerCase()
    return haystack.includes(q)
  })
})

const filteredCreatePersons = computed(() => {
  const q = String(createUserPersonQuery.value || '').trim().toLowerCase()
  if (!q) return personOptions.value
  return personOptions.value.filter((person) => {
    const haystack = [
      person.full_name,
      person.last_name,
      person.name,
      person.middle_name,
      person.phone,
      person.email,
    ].join(' ').toLowerCase()
    return haystack.includes(q)
  })
})

const loadPersonOptions = async () => {
  personOptionsLoading.value = true
  personOptionsError.value = ''
  try {
    const res = await fetch('/apiref/ref/persons', { credentials: 'include' })
    if (!res.ok) throw new Error('persons load failed')
    personOptions.value = uniquePersonOptions(await res.json())
  } catch {
    personOptions.value = []
    personOptionsError.value = 'Не удалось загрузить список людей.'
  } finally {
    personOptionsLoading.value = false
  }
}

const resetCreateUserForm = () => {
  createUserError.value = ''
  createUserSaving.value = false
  createUserPersonMode.value = 'existing'
  createUserCompanyQuery.value = ''
  createUserCompanyDropdownOpen.value = false
  selectedCreateUserCompanyId.value = ''
  selectedCreateUserCompanyName.value = ''
  createUserPersonQuery.value = ''
  createUserPersonDropdownOpen.value = false
  selectedCreateUserPersonId.value = ''
  createUserNewPerson.value = {
    last_name: '',
    name: '',
    middle_name: '',
  }
  createUserForm.value = {
    position: '',
    phone_work: '',
    phone_extra: '',
    email_work: '',
    email_extra: '',
    role_type: 'employee',
    comment: '',
  }
  companyEmployeesCache.value = []
}

const openCreateUserModal = async () => {
  resetCreateUserForm()
  isCreateUserModalOpen.value = true
  if (!personOptions.value.length) await loadPersonOptions()
}

const closeCreateUserModal = () => {
  isCreateUserModalOpen.value = false
  resetCreateUserForm()
}

const selectCreateUserCompany = (org) => {
  selectedCreateUserCompanyId.value = String(org.id || '')
  selectedCreateUserCompanyName.value = org.short_name || org.full_name || ''
  createUserCompanyQuery.value = selectedCreateUserCompanyName.value
  createUserCompanyDropdownOpen.value = false
  companyEmployeesCache.value = []
}

const selectCreateUserPerson = (person) => {
  selectedCreateUserPersonId.value = String(person.id || '')
  createUserPersonQuery.value = normalizePersonLabel(person)
  createUserPersonDropdownOpen.value = false
  createUserPersonMode.value = 'existing'
}

const switchCreateUserToNewPerson = () => {
  createUserError.value = ''
  createUserPersonMode.value = 'new'
  selectedCreateUserPersonId.value = ''
  createUserPersonQuery.value = ''
  createUserPersonDropdownOpen.value = false
  createUserNewPerson.value = {
    last_name: '',
    name: '',
    middle_name: '',
  }
}

const switchCreateUserToExistingPerson = () => {
  createUserError.value = ''
  createUserPersonMode.value = 'existing'
}

const normalizeCreateUserText = (value) => String(value || '').trim()

const createPersonPayload = () => ({
  name: normalizeCreateUserText(createUserNewPerson.value.name),
  last_naem: normalizeCreateUserText(createUserNewPerson.value.last_name),
  last_name: normalizeCreateUserText(createUserNewPerson.value.last_name),
  middle_name: normalizeCreateUserText(createUserNewPerson.value.middle_name),
  phone_personal: '',
  email_personal: '',
})

const createNewPerson = async () => {
  const payload = createPersonPayload()
  if (!payload.last_name || !payload.name) {
    throw new Error('person name missing')
  }
  const res = await fetch('/apiref/ref/persons', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error('person create failed')
  const json = await res.json()
  const personId = json?.id || json?.person_id
  if (!personId) throw new Error('person_id missing')
  return String(personId)
}

const onCreateUserCompanyInput = () => {
  createUserCompanyDropdownOpen.value = true
  selectedCreateUserCompanyId.value = ''
  selectedCreateUserCompanyName.value = ''
  companyEmployeesCache.value = []
}

const loadCompanyEmployees = async (companyId) => {
  const id = String(companyId || '')
  if (!id) return []
  companyEmployeesLoading.value = true
  try {
    const res = await fetch(`/apiref/ref/employees/counterparty/${encodeURIComponent(id)}`, { credentials: 'include' })
    if (!res.ok) throw new Error('load company employees failed')
    const list = normalizeArray(await res.json()).map((item) => ({
      ...item,
      person_id: String(item?.person_id || ''),
      full_name: normalizePersonLabel(item),
    }))
    companyEmployeesCache.value = list
    return list
  } finally {
    companyEmployeesLoading.value = false
  }
}

const handleWindowClick = (event) => {
  const target = event?.target
  if (!(target instanceof Node)) return

  const companyEl = createUserCompanyLookupRef.value
  if (!companyEl || !companyEl.contains(target)) {
    createUserCompanyDropdownOpen.value = false
  }

  const personEl = createUserPersonLookupRef.value
  if (!personEl || !personEl.contains(target)) {
    createUserPersonDropdownOpen.value = false
  }
}

const createUser = async () => {
  createUserError.value = ''
  if (!selectedCreateUserCompanyId.value) {
    createUserError.value = 'Выберите компанию.'
    return
  }
  if (createUserPersonMode.value === 'existing' && !selectedCreateUserPersonId.value) {
    createUserError.value = 'Выберите человека или создайте нового.'
    return
  }

  createUserSaving.value = true
  try {
    const companyEmployees = companyEmployeesCache.value.length
      ? companyEmployeesCache.value
      : await loadCompanyEmployees(selectedCreateUserCompanyId.value)

    let personId = selectedCreateUserPersonId.value
    let personName = ''

    if (createUserPersonMode.value === 'new') {
      personName = normalizePersonLabel({
        last_name: createUserNewPerson.value.last_name,
        name: createUserNewPerson.value.name,
        middle_name: createUserNewPerson.value.middle_name,
      })
      const duplicateByName = companyEmployees.some((employee) => normalizePersonLabel(employee).toLowerCase() === personName.toLowerCase())
      if (duplicateByName) {
        createUserError.value = 'Такой сотрудник уже добавлен в этой компании.'
        return
      }
      personId = await createNewPerson()
    } else {
      const selectedPerson = personOptions.value.find((item) => String(item.id || '') === String(personId || ''))
      personName = normalizePersonLabel(selectedPerson)
      const duplicate = companyEmployees.some((employee) => {
        const samePerson = String(employee.person_id || '') === String(personId || '')
        const sameName = normalizePersonLabel(employee).toLowerCase() === personName.toLowerCase()
        return samePerson || sameName
      })
      if (duplicate) {
        createUserError.value = 'Такой сотрудник уже добавлен в этой компании.'
        return
      }
    }

    const payload = {
      id: `emp-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      counterparty_id: selectedCreateUserCompanyId.value,
      person_id: personId,
      position: normalizeCreateUserText(createUserForm.value.position),
      phone_work: formatPhoneMask(createUserForm.value.phone_work),
      phone_extra: formatPhoneMask(createUserForm.value.phone_extra),
      email_work: normalizeCreateUserText(createUserForm.value.email_work),
      email_extra: normalizeCreateUserText(createUserForm.value.email_extra),
      role_type: String(createUserForm.value.role_type || 'employee'),
      comment: normalizeCreateUserText(createUserForm.value.comment),
    }

    const res = await fetch('/apiref/ref/employees', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error('employee create failed')

    closeCreateUserModal()
    await loadUsers()
  } catch (error) {
    if (!createUserError.value) {
      createUserError.value = 'Не удалось создать пользователя.'
    }
  } finally {
    createUserSaving.value = false
  }
}

const loadUsers = async () => {
  usersLoading.value = true
  usersError.value = ''
  try {
    const [personsRes, employeesRes] = await Promise.all([
      fetch('/apiref/ref/persons', { credentials: 'include' }),
      fetch('/apiref/ref/employees', { credentials: 'include' }).catch(() => null),
    ])

    if (!personsRes || !personsRes.ok) throw new Error('Failed to load persons')

    const personsData = await personsRes.json()
    const persons = Array.isArray(personsData)
      ? personsData
      : personsData.data || personsData.items || personsData.results || []
    personOptionsError.value = ''
    personOptions.value = uniquePersonOptions(persons)

    const employeesData = employeesRes && employeesRes.ok ? await employeesRes.json() : []
    const employees = Array.isArray(employeesData)
      ? employeesData
      : employeesData.data || employeesData.items || employeesData.results || []

    const employeesByPersonId = new Map()
    employees.forEach((employee) => {
      const personId = String(employee?.person_id || employee?.personId || employee?.person?.id || '')
      if (!personId) return
      if (!employeesByPersonId.has(personId)) employeesByPersonId.set(personId, [])
      employeesByPersonId.get(personId).push(employee)
    })

    const companyNamesById = new Map()
    orgs.value.forEach((org) => {
      const companyId = String(org.id || org.counterparty_id || '')
      const companyName = normalizeText(org.short_name || org.full_name)
      if (companyId && companyName) companyNamesById.set(companyId, companyName)
    })

    users.value = persons
      .map((person) => {
        const personId = String(person.person_id || person.id || '')
        const relatedEmployees = employeesByPersonId.get(personId) || []

        const companyEntries = buildCompanyEntries(
          relatedEmployees.map((employee) => ({
            id: String(employee?.counterparty_id || employee?.company_id || ''),
            name: normalizeText(
              employee?.counterparty_name
                || employee?.company_name
                || companyNamesById.get(String(employee?.counterparty_id || employee?.company_id || ''))
                || ''
            ),
          })),
          person.companies || []
        )

        const companyIds = buildUniqueLines(
          'text',
          companyEntries.map((company) => company.id).filter(Boolean)
        )
        const companyNames = buildUniqueLines(
          'company',
          companyEntries.map((company) => company.name)
        )
        const positionLines = buildUniqueLines(
          'text',
          relatedEmployees.map((employee) => employee?.position),
          person.position
        )
        const phoneLines = buildUniqueLines(
          'phone',
          person.phone,
          person.phone_personal,
          person.phone_work,
          person.phone_extra,
          relatedEmployees.flatMap((employee) => [
            employee?.phone_work,
            employee?.phone_extra,
            employee?.phone_personal,
          ])
        )
        const emailLines = buildUniqueLines(
          'email',
          person.email,
          person.email_personal,
          person.email_work,
          person.email_extra,
          relatedEmployees.flatMap((employee) => [
            employee?.email_work,
            employee?.email_extra,
            employee?.email_personal,
          ])
        )
        const accessValues = buildUniqueLines(
          'text',
          relatedEmployees.map((employee) => employee?.role_type || employee?.role)
        )
        const commentLines = buildUniqueLines(
          'text',
          person.comment,
          relatedEmployees.map((employee) => employee?.comment)
        )
        const searchText = buildUniqueLines(
          'text',
          normalizePersonLabel(person),
          companyNames,
          positionLines,
          phoneLines,
          emailLines,
          accessValues,
          commentLines
        ).join(' ').toLowerCase()

        return {
          id: String(person.user_id || person.id || person.person_id || ''),
          personId,
          name: normalizePersonLabel(person) || '—',
          companies: companyEntries,
          companyIds,
          companyText: joinLines(companyNames),
          positionsText: joinLines(positionLines),
          phonesText: joinLines(phoneLines),
          emailsText: joinLines(emailLines),
          accessValues,
          accessText: joinLines(accessValues),
          commentText: joinLines(commentLines),
          searchText,
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  } catch (error) {
    usersError.value = 'Не удалось загрузить список пользователей'
  } finally {
    usersLoading.value = false
  }
}

// ── Отделы и группы ─────────────────────────────────────────
const departments = ref([])
const deptLoading = ref(false)
const deptModalOpen = ref(false)
const deptName = ref('')
const deptUsers = ref([])        // выбранные [{ id, name, initials }]
const deptUserQuery = ref('')
const deptUserDdOpen = ref(false)
const deptSaving = ref(false)
const deptError = ref('')
const allDeptUsers = ref([])     // все пользователи для выбора

const deptUserInitials = (u) => `${(u.surname?.[0] || '').toUpperCase()}${(u.name?.[0] || '').toUpperCase()}` || '?'

const loadAllDeptUsers = async () => {
  if (allDeptUsers.value.length) return
  try {
    const r = await fetch('/api/as/users/all', { credentials: 'include' })
    if (r.ok) {
      const d = await r.json()
      allDeptUsers.value = (d.items ?? d).map(u => ({
        id: u.id,
        name: [u.surname, u.name, u.patronymic].filter(Boolean).join(' '),
        initials: deptUserInitials(u),
      }))
    }
  } catch {}
}

const loadDepartments = async () => {
  deptLoading.value = true
  try {
    const r = await fetch('/apisup/supply/departments/my', { credentials: 'include' })
    if (r.ok) {
      const d = await r.json()
      departments.value = Array.isArray(d) ? d : (d.items ?? d.data ?? [])
    }
  } catch (e) { console.error(e) } finally { deptLoading.value = false }
}

// ── Права: создатель отдела или админ в отделе ─────────────
const myUserId = ref(null)
const loadMe = async () => {
  try {
    const r = await fetch('/api/as/users/me', { credentials: 'include' })
    if (r.ok) { const me = await r.json(); myUserId.value = me?.id ?? null }
  } catch {}
}
const canManageDept = (dep) => {
  if (!myUserId.value) return false
  if (String(dep?.created_by) === String(myUserId.value)) return true
  // если членство пришло вместе со списком/деталью
  const roles = dep?.users ?? dep?.user_roles ?? []
  if (roles.some(m => String(m.user_id ?? m.user?.id) === String(myUserId.value) && m.role_id === 'admin')) return true
  // если открыта страница этого отдела — смотрим загруженных участников
  if (deptDetail.value && String(deptDetail.value.id) === String(dep?.id)) {
    return deptMembers.value.some(m => String(memberUserId(m)) === String(myUserId.value) && m.role_id === 'admin')
  }
  return false
}

// ── Меню карточки отдела (⋮) ────────────────────────────────
const deptMenuId = ref(null)
const deptMenuStyle = ref({})
const toggleDeptMenu = (dep, ev) => {
  if (deptMenuId.value === dep.id) { deptMenuId.value = null; return }
  const r = ev.currentTarget.getBoundingClientRect()
  deptMenuStyle.value = { position: 'fixed', top: (r.bottom + 4) + 'px', left: Math.max(8, r.right - 180) + 'px', zIndex: 9999 }
  deptMenuId.value = dep.id
}
const closeDeptMenu = () => { deptMenuId.value = null }

// Переименование
const deptRename = ref(null) // { id, name }
const deptRenameSaving = ref(false)
const openDeptRename = (dep) => { deptRename.value = { id: dep.id, name: dep.name }; closeDeptMenu() }
const submitDeptRename = async () => {
  const r0 = deptRename.value
  if (!r0 || !r0.name.trim() || deptRenameSaving.value) return
  deptRenameSaving.value = true
  try {
    const r = await fetch(`/apisup/supply/departments/${r0.id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: r0.name.trim() }),
    })
    if (r.ok) {
      const dep = departments.value.find(d => d.id === r0.id)
      if (dep) dep.name = r0.name.trim()
      if (deptDetail.value?.id === r0.id) deptDetail.value.name = r0.name.trim()
      deptRename.value = null
    }
  } catch (e) { console.error(e) } finally { deptRenameSaving.value = false }
}

// Удаление отдела
const deptDelete = ref(null) // dep
const deptDeleting = ref(false)
const openDeptDelete = (dep) => { deptDelete.value = dep; closeDeptMenu() }
const confirmDeptDelete = async () => {
  const dep = deptDelete.value
  if (!dep || deptDeleting.value) return
  deptDeleting.value = true
  try {
    const r = await fetch(`/apisup/supply/departments/${dep.id}`, { method: 'DELETE', credentials: 'include' })
    if (r.ok) {
      departments.value = departments.value.filter(d => d.id !== dep.id)
      if (deptDetail.value?.id === dep.id) deptDetail.value = null
      deptDelete.value = null
    }
  } catch (e) { console.error(e) } finally { deptDeleting.value = false }
}

// ── Страница отдела: участники ──────────────────────────────
const deptDetail = ref(null)
const deptMembers = ref([])
const deptMembersLoading = ref(false)

const memberUserId = (m) => m.user_id ?? m.user?.id ?? m.created_by
const memberUser = (m) => m.user ?? m.created_by_user ?? null
const memberName = (m) => {
  const u = memberUser(m)
  if (!u) return allDeptUsers.value.find(x => String(x.id) === String(memberUserId(m)))?.name || '—'
  return u.short_fio || [u.surname, u.name, u.patronymic].filter(Boolean).join(' ') || '—'
}
const memberInitials = (m) => {
  const u = memberUser(m)
  if (u) return deptUserInitials(u)
  return allDeptUsers.value.find(x => String(x.id) === String(memberUserId(m)))?.initials || '?'
}
const isDeptCreator = (m) => deptDetail.value && String(memberUserId(m)) === String(deptDetail.value.created_by)

const openDeptDetail = async (dep) => {
  deptDetail.value = dep
  loadAllDeptUsers()
  await loadDeptMembers(dep.id)
}
const closeDeptDetail = () => { deptDetail.value = null; deptMembers.value = [] }
const loadDeptMembers = async (deptId) => {
  deptMembersLoading.value = true
  try {
    const r = await fetch(`/apisup/supply/departments/${deptId}/users`, { credentials: 'include' })
    if (r.ok) {
      const d = await r.json()
      deptMembers.value = Array.isArray(d) ? d : (d.items ?? d.data ?? [])
    }
  } catch (e) { console.error(e) } finally { deptMembersLoading.value = false }
}

// Добавление участника на странице отдела
const memberAddQuery = ref('')
const memberAddDdOpen = ref(false)
const hideMemberAddDd = () => setTimeout(() => { memberAddDdOpen.value = false }, 150)
const memberAddFiltered = computed(() => {
  const q = memberAddQuery.value.toLowerCase().trim()
  return allDeptUsers.value.filter(u =>
    (!q || u.name.toLowerCase().includes(q)) &&
    !deptMembers.value.some(m => String(memberUserId(m)) === String(u.id))
  )
})
const addMemberToDept = async (u) => {
  const dep = deptDetail.value; if (!dep) return
  memberAddQuery.value = ''; memberAddDdOpen.value = false
  try {
    const r = await fetch(`/apisup/supply/departments/${dep.id}/users`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ departament_id: dep.id, user_id: u.id, role_id: 'participant' }),
    })
    if (r.ok) await loadDeptMembers(dep.id)
  } catch (e) { console.error(e) }
}

// Смена роли участника
const changeMemberRole = async (m, roleId) => {
  if (m.role_id === roleId) return
  const prev = m.role_id
  m.role_id = roleId
  try {
    const r = await fetch(`/apisup/supply/departments/users/${m.id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role_id: roleId }),
    })
    if (!r.ok) m.role_id = prev
  } catch { m.role_id = prev }
}

// Удаление участника (с подтверждением)
const memberDelete = ref(null) // membership
const memberDeleting = ref(false)
const confirmMemberDelete = async () => {
  const m = memberDelete.value
  if (!m || memberDeleting.value) return
  memberDeleting.value = true
  try {
    const r = await fetch(`/apisup/supply/departments/users/${m.id}`, { method: 'DELETE', credentials: 'include' })
    if (r.ok) {
      deptMembers.value = deptMembers.value.filter(x => x.id !== m.id)
      memberDelete.value = null
    }
  } catch (e) { console.error(e) } finally { memberDeleting.value = false }
}

const deptUsersFiltered = computed(() => {
  const q = deptUserQuery.value.toLowerCase().trim()
  return allDeptUsers.value.filter(u =>
    (!q || u.name.toLowerCase().includes(q)) && !deptUsers.value.some(s => s.id === u.id)
  )
})

const openDeptModal = () => {
  deptName.value = ''
  deptUsers.value = []
  deptUserQuery.value = ''
  deptUserDdOpen.value = false
  deptError.value = ''
  deptModalOpen.value = true
  loadAllDeptUsers()
}
const closeDeptModal = () => { deptModalOpen.value = false }
const addDeptUser = (u) => {
  if (!deptUsers.value.some(s => s.id === u.id)) deptUsers.value.push(u)
  deptUserQuery.value = ''
  deptUserDdOpen.value = false
}
const removeDeptUser = (id) => { deptUsers.value = deptUsers.value.filter(u => u.id !== id) }

const submitDepartment = async () => {
  const name = deptName.value.trim()
  if (!name || deptSaving.value) return
  deptSaving.value = true
  deptError.value = ''
  try {
    const r = await fetch('/apisup/supply/departments', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!r.ok) throw new Error(await r.text())
    const d = await r.json().catch(() => ({}))
    const deptId = d.id ?? d.data?.id
    if (deptId != null) {
      for (const u of deptUsers.value) {
        await fetch(`/apisup/supply/departments/${deptId}/users`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ departament_id: deptId, user_id: u.id, role_id: 'participant' }),
        })
      }
    }
    closeDeptModal()
    loadDepartments()
  } catch (e) {
    console.error(e)
    deptError.value = 'Не удалось создать отдел'
  } finally { deptSaving.value = false }
}

onMounted(() => {
  loadCompanies().finally(() => {
    loadUsers()
  })
  loadDepartments()
  loadMe()
  window.addEventListener('mousedown', handleWindowClick)
})

onBeforeUnmount(() => {
  window.removeEventListener('mousedown', handleWindowClick)
})
</script>

<template>
  <div class="page">
    <TopNav :links="navLinks" />
    <main class="main-content">
      <div class="content-header">
        <h1 class="page-title">Пользователи</h1>
        <div class="header-actions">
          <RouterLink v-if="activeTab === 'orgs'" class="btn btn-primary btn-link" to="/organizations/create">
            <i class="fas fa-plus"></i> Создать организацию
          </RouterLink>
          <button v-else-if="activeTab === 'departments'" class="btn btn-primary" type="button" @click="openDeptModal">
            <i class="fas fa-plus"></i> Создать
          </button>
          <button v-else class="btn btn-primary" type="button" @click="openCreateUserModal">
            <i class="fas fa-plus"></i> Создать пользователя
          </button>
        </div>
      </div>

      <div class="tabs">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="tab-btn"
          :class="{ active: activeTab === tab.key }"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
        </button>
      </div>

      <div v-if="activeTab === 'orgs'" class="filters-panel">
        <div class="filters-grid">
          <label class="filter-field">
            <span>Поиск</span>
            <input
              v-model="orgSearch"
              class="filter-input"
              type="text"
              autocomplete="off"
              placeholder="Поиск по краткому наименованию компании..."
            >
          </label>

          <div class="filter-field">
            <span>Тип</span>
            <div class="chip-row">
              <button class="chip-btn" :class="{ active: orgTypeFilter === 'all' }" type="button" @click="orgTypeFilter = 'all'">Все</button>
              <button class="chip-btn" :class="{ active: orgTypeFilter === 'llc' }" type="button" @click="orgTypeFilter = 'llc'">ООО</button>
              <button class="chip-btn" :class="{ active: orgTypeFilter === 'ip' }" type="button" @click="orgTypeFilter = 'ip'">ИП</button>
              <button class="chip-btn" :class="{ active: orgTypeFilter === 'phys' }" type="button" @click="orgTypeFilter = 'phys'">Физлицо</button>
            </div>
          </div>

          <div class="filter-actions">
            <button class="btn" type="button" @click="resetOrgFilters">Сбросить</button>
          </div>
        </div>
      </div>

      <div class="table-wrapper" v-if="activeTab === 'orgs'">
        <div v-if="orgsLoading" class="table-state">Загрузка...</div>
        <div v-else-if="orgsError" class="table-state error">{{ orgsError }}</div>
        <table class="table">
          <thead>
            <tr>
              <th>Краткое наименование компании</th>
              <th>Полное наименование компании</th>
              <th>ОПФ</th>
              <th>Адрес</th>
              <th>Телефон</th>
              <th>Email</th>
              <th>ИНН/ОГРН/КПП</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="org in filteredOrgs" :key="org.id || org.short_name">
              <td>
                <button
                  class="org-link org-link-btn"
                  type="button"
                  :disabled="resolvingOrgKey === `${org.short_name || ''}_${org.inn_ogrn_kpp || ''}`"
                  @click="openCounterparty(org)"
                >
                  {{
                    resolvingOrgKey === `${org.short_name || ''}_${org.inn_ogrn_kpp || ''}`
                      ? 'Открываем...'
                      : org.short_name
                  }}
                </button>
              </td>
              <td>{{ org.full_name }}</td>
              <td>{{ org.opf }}</td>
              <td>{{ org.address || '—' }}</td>
              <td>{{ org.phone }}</td>
              <td>{{ org.email }}</td>
              <td>{{ org.inn_ogrn_kpp }}</td>
            </tr>
            <tr v-if="!filteredOrgs.length && !orgsLoading">
              <td colspan="7" class="empty-row">Ничего не найдено.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="activeTab === 'users'" class="filters-panel">
        <div class="filters-grid users-filters">
          <label class="filter-field">
            <span>Поиск</span>
            <input
              v-model="userSearch"
              class="filter-input"
              type="text"
              autocomplete="off"
              placeholder="Поиск по ФИО, компании, должности, телефону, email..."
            >
          </label>

          <label class="filter-field">
            <span>Компания</span>
            <select v-model="userCompanyFilter" class="filter-input">
              <option value="all">Все компании</option>
              <option v-for="company in uniqueCompanies" :key="company.id" :value="company.id">
                {{ company.name }}
              </option>
            </select>
          </label>

          <label class="filter-field">
            <span>Тип роли</span>
            <select v-model="userAccessFilter" class="filter-input">
              <option value="all">Все типы</option>
              <option v-for="role in uniqueAccessRoles" :key="role" :value="role">
                {{ role }}
              </option>
            </select>
          </label>

          <div class="filter-actions">
            <button class="btn" type="button" @click="resetUserFilters">Сбросить</button>
          </div>
        </div>
      </div>

      <div class="table-wrapper" v-if="activeTab === 'users'">
        <div v-if="usersLoading" class="table-state">Загрузка...</div>
        <div v-else-if="usersError" class="table-state error">{{ usersError }}</div>
        <table class="table">
          <thead>
            <tr>
              <th>ФИО</th>
              <th>Компания</th>
              <th>Должность</th>
              <th>Телефон</th>
              <th>Email</th>
              <th>Роль</th>
              <th>Комментарий</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in filteredUsers" :key="user.id || user.personId || user.name">
              <td>{{ user.name }}</td>
              <td class="multiline-cell">{{ user.companyText }}</td>
              <td class="multiline-cell">{{ user.positionsText }}</td>
              <td class="multiline-cell">{{ user.phonesText }}</td>
              <td class="multiline-cell">{{ user.emailsText }}</td>
              <td class="multiline-cell">{{ user.accessText }}</td>
              <td class="multiline-cell">{{ user.commentText }}</td>
            </tr>
            <tr v-if="!filteredUsers.length && !usersLoading">
              <td colspan="7" class="empty-row">Ничего не найдено.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- ── Отделы и группы ── -->
      <div v-if="activeTab === 'departments'" class="dept-wrap">
        <!-- Страница отдела -->
        <template v-if="deptDetail">
          <div class="dept-detail-head">
            <button class="dept-back" type="button" @click="closeDeptDetail"><i class="fas fa-arrow-left"></i></button>
            <div class="dept-icon"><i class="fas fa-sitemap"></i></div>
            <div class="dept-detail-name">{{ deptDetail.name }}</div>
            <div v-if="canManageDept(deptDetail)" class="dept-menu-wrap">
              <button class="dept-dots" type="button" @click.stop="toggleDeptMenu(deptDetail, $event)"><i class="fas fa-ellipsis-vertical"></i></button>
            </div>
          </div>

          <!-- Добавить участника -->
          <div v-if="canManageDept(deptDetail)" class="dept-field" style="max-width:420px">
            <span>Добавить участника</span>
            <div class="dept-combo">
              <div class="dept-combo-box">
                <input v-model="memberAddQuery" class="dept-combo-input" placeholder="Поиск пользователя..."
                  @focus="memberAddDdOpen = true" @input="memberAddDdOpen = true" @blur="hideMemberAddDd" />
              </div>
              <div v-if="memberAddDdOpen && memberAddFiltered.length" class="dept-combo-dd" @mousedown.prevent>
                <button v-for="u in memberAddFiltered.slice(0, 30)" :key="u.id" type="button" class="dept-combo-item" @click="addMemberToDept(u)">
                  <span class="dept-avatar">{{ u.initials }}</span>
                  <span>{{ u.name }}</span>
                </button>
              </div>
            </div>
          </div>

          <div v-if="deptMembersLoading" class="dept-empty">Загрузка участников...</div>
          <div v-else class="dept-members-list">
            <div v-for="m in deptMembers" :key="m.id" class="dept-member-row">
              <span class="dept-avatar">{{ memberInitials(m) }}</span>
              <span class="dept-member-name">{{ memberName(m) }}</span>
              <span v-if="isDeptCreator(m)" class="dept-role-badge dept-role-badge--creator">Создатель</span>
              <template v-if="canManageDept(deptDetail) && !isDeptCreator(m)">
                <select class="dept-role-select" :value="m.role_id" @change="changeMemberRole(m, $event.target.value)">
                  <option value="participant">Участник</option>
                  <option value="admin">Администратор</option>
                </select>
                <button class="dept-member-del" type="button" title="Удалить из отдела" @click="memberDelete = m">
                  <i class="fas fa-xmark"></i>
                </button>
              </template>
              <span v-else class="dept-role-badge" :class="{ 'dept-role-badge--admin': m.role_id === 'admin' }">
                {{ m.role_id === 'admin' ? 'Администратор' : 'Участник' }}
              </span>
            </div>
            <div v-if="!deptMembers.length" class="dept-empty">В отделе пока нет участников</div>
          </div>
        </template>

        <!-- Список отделов -->
        <template v-else>
          <div v-if="deptLoading" class="empty-row" style="padding:32px;text-align:center">Загрузка...</div>
          <div v-else-if="!departments.length" class="dept-empty">
            <i class="fas fa-sitemap" style="font-size:36px;color:#e2e8f0"></i>
            <div>Отделы и группы ещё не созданы</div>
            <button class="btn btn-primary" type="button" @click="openDeptModal"><i class="fas fa-plus"></i> Создать</button>
          </div>
          <div v-else class="dept-grid">
            <div v-for="dep in departments" :key="dep.id" class="dept-card" @click="openDeptDetail(dep)">
              <div class="dept-card-top">
                <div class="dept-icon"><i class="fas fa-sitemap"></i></div>
                <div class="dept-name">{{ dep.name }}</div>
                <button v-if="canManageDept(dep)" class="dept-dots" type="button" title="Действия" @click.stop="toggleDeptMenu(dep, $event)">
                  <i class="fas fa-ellipsis-vertical"></i>
                </button>
              </div>
              <div class="dept-members" v-if="dep.users?.length || dep.user_roles?.length">
                <span class="dept-members-count">
                  <i class="fas fa-users"></i> {{ (dep.users || dep.user_roles || []).length }}
                </span>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- Контекстное меню отдела -->
      <Teleport to="body">
        <div v-if="deptMenuId" class="dept-menu-overlay" @mousedown="closeDeptMenu"></div>
        <div v-if="deptMenuId" class="dept-menu" :style="deptMenuStyle" @mousedown.stop>
          <button class="dept-menu-item" type="button" @click="openDeptRename(departments.find(d => d.id === deptMenuId) || deptDetail)">
            <i class="fas fa-pen"></i> Изменить название
          </button>
          <button class="dept-menu-item dept-menu-item--danger" type="button" @click="openDeptDelete(departments.find(d => d.id === deptMenuId) || deptDetail)">
            <i class="fas fa-trash"></i> Удалить
          </button>
        </div>
      </Teleport>

      <!-- Переименование отдела -->
      <div v-if="deptRename" class="modal-backdrop" @click="deptRename = null">
        <div class="modal-card" @click.stop>
          <div class="modal-title">Изменить название</div>
          <label class="dept-field">
            <span>Название</span>
            <input v-model="deptRename.name" class="filter-input" type="text" @keyup.enter="submitDeptRename" autofocus />
          </label>
          <div class="modal-actions">
            <button class="btn" type="button" :disabled="deptRenameSaving" @click="deptRename = null">Отмена</button>
            <button class="btn btn-primary" type="button" :disabled="deptRenameSaving || !deptRename.name.trim()" @click="submitDeptRename">
              <i v-if="deptRenameSaving" class="fas fa-spinner fa-spin"></i> Сохранить
            </button>
          </div>
        </div>
      </div>

      <!-- Подтверждение удаления отдела -->
      <div v-if="deptDelete" class="modal-backdrop" @click="deptDelete = null">
        <div class="modal-card" @click.stop>
          <div class="modal-title">Удалить отдел «{{ deptDelete.name }}»?</div>
          <div class="modal-subtitle">Это действие необратимо. Участники не будут удалены из системы.</div>
          <div class="modal-actions">
            <button class="btn" type="button" :disabled="deptDeleting" @click="deptDelete = null">Отмена</button>
            <button class="btn dept-btn-danger" type="button" :disabled="deptDeleting" @click="confirmDeptDelete">
              <i v-if="deptDeleting" class="fas fa-spinner fa-spin"></i> Удалить
            </button>
          </div>
        </div>
      </div>

      <!-- Подтверждение удаления участника -->
      <div v-if="memberDelete" class="modal-backdrop" @click="memberDelete = null">
        <div class="modal-card" @click.stop>
          <div class="modal-title">Удалить участника?</div>
          <div class="modal-subtitle">{{ memberName(memberDelete) }} будет исключён из отдела.</div>
          <div class="modal-actions">
            <button class="btn" type="button" :disabled="memberDeleting" @click="memberDelete = null">Отмена</button>
            <button class="btn dept-btn-danger" type="button" :disabled="memberDeleting" @click="confirmMemberDelete">
              <i v-if="memberDeleting" class="fas fa-spinner fa-spin"></i> Удалить
            </button>
          </div>
        </div>
      </div>

      <!-- ── Модалка создания отдела/группы ── -->
      <div v-if="deptModalOpen" class="modal-backdrop" @click="closeDeptModal">
        <div class="modal-card" @click.stop>
          <div class="modal-title">Создать отдел или группу</div>
          <div class="modal-subtitle">Укажите название и участников</div>

          <label class="dept-field">
            <span>Название</span>
            <input v-model="deptName" class="filter-input" type="text" placeholder="Например, Отдел закупок"
              @keyup.enter="submitDepartment" autofocus />
          </label>

          <div class="dept-field">
            <span>Участники</span>
            <div class="dept-combo">
              <div class="dept-combo-box">
                <span v-for="u in deptUsers" :key="u.id" class="dept-chip">
                  {{ u.name }}
                  <button type="button" class="dept-chip-x" @click="removeDeptUser(u.id)"><i class="fas fa-xmark"></i></button>
                </span>
                <input v-model="deptUserQuery" class="dept-combo-input" placeholder="Добавить пользователя..."
                  @focus="deptUserDdOpen = true" @input="deptUserDdOpen = true" />
              </div>
              <div v-if="deptUserDdOpen && deptUsersFiltered.length" class="dept-combo-dd" @mousedown.prevent>
                <button v-for="u in deptUsersFiltered.slice(0, 30)" :key="u.id" type="button" class="dept-combo-item" @click="addDeptUser(u)">
                  <span class="dept-avatar">{{ u.initials }}</span>
                  <span>{{ u.name }}</span>
                </button>
              </div>
            </div>
          </div>

          <div v-if="deptError" class="dept-error">{{ deptError }}</div>

          <div class="modal-actions">
            <button class="btn" type="button" :disabled="deptSaving" @click="closeDeptModal">Отмена</button>
            <button class="btn btn-primary" type="button" :disabled="deptSaving || !deptName.trim()" @click="submitDepartment">
              <i v-if="deptSaving" class="fas fa-spinner fa-spin"></i>
              {{ deptSaving ? 'Создание...' : 'Создать' }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="isCreateUserModalOpen" class="modal-backdrop" @click="closeCreateUserModal">
        <div class="modal-card user-modal" @click.stop>
          <div class="modal-title">Создать пользователя</div>
          <div class="modal-subtitle">Выберите компанию и человека</div>

          <div class="modal-field">
            <span>Компания</span>
            <div ref="createUserCompanyLookupRef" class="lookup-wrap">
              <div class="input-with-icon">
                <input
                  v-model="createUserCompanyQuery"
                  class="form-input"
                  type="text"
                  name="create-user-company"
                  autocomplete="off"
                  autocapitalize="off"
                  autocorrect="off"
                  spellcheck="false"
                  placeholder="Поиск компании..."
                  @focus="createUserCompanyDropdownOpen = true"
                  @input="onCreateUserCompanyInput"
                >
                <button class="field-icon-btn" type="button" @click="createUserCompanyDropdownOpen = !createUserCompanyDropdownOpen">
                  <i class="fas fa-chevron-down"></i>
                </button>
              </div>
              <div v-if="createUserCompanyDropdownOpen" class="lookup-list lookup-list-overlay">
                <div class="lookup-scroll-area">
                  <button
                    v-for="org in filteredCreateCompanies"
                    :key="org.id"
                    class="lookup-item"
                    type="button"
                    @click="selectCreateUserCompany(org)"
                  >
                    {{ org.short_name || org.full_name || 'Без названия' }}
                  </button>
                  <div v-if="!filteredCreateCompanies.length" class="lookup-empty">Ничего не найдено</div>
                </div>
              </div>
            </div>
            <div v-if="selectedCreateUserCompanyName" class="modal-note">Выбрана компания: {{ selectedCreateUserCompanyName }}</div>
          </div>

          <div v-if="createUserPersonMode === 'existing'" class="modal-field">
            <span>Человек</span>
            <div ref="createUserPersonLookupRef" class="lookup-wrap">
              <div class="input-with-icon">
                <input
                  v-model="createUserPersonQuery"
                  class="form-input"
                  type="text"
                  name="create-user-person"
                  autocomplete="off"
                  autocapitalize="off"
                  autocorrect="off"
                  spellcheck="false"
                  placeholder="Начните вводить ФИО, телефон или email..."
                  @focus="createUserPersonDropdownOpen = true"
                  @input="() => { selectedCreateUserPersonId = ''; createUserPersonDropdownOpen = true }"
                >
                <button class="field-icon-btn" type="button" @click="createUserPersonDropdownOpen = !createUserPersonDropdownOpen">
                  <i class="fas fa-chevron-down"></i>
                </button>
              </div>
              <div v-if="createUserPersonDropdownOpen" class="lookup-list lookup-list-overlay">
                <div class="lookup-sticky-head">
                  <button class="lookup-item create-person-item" type="button" @click="switchCreateUserToNewPerson">
                    + Создать физическое лицо
                  </button>
                </div>
                <div class="lookup-scroll-area">
                  <div v-if="personOptionsLoading" class="lookup-empty">Загрузка...</div>
                  <div v-else-if="personOptionsError" class="lookup-empty error">{{ personOptionsError }}</div>
                  <button
                    v-for="person in filteredCreatePersons"
                    :key="person.id"
                    class="lookup-item"
                    type="button"
                    @click="selectCreateUserPerson(person)"
                  >
                    {{ person.full_name || 'Без ФИО' }}
                  </button>
                  <div v-if="!personOptionsLoading && !personOptionsError && !filteredCreatePersons.length" class="lookup-empty">
                    Ничего не найдено
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="modal-grid">
            <div class="modal-field modal-field-wide person-mode-back">
              <button class="person-back-btn" type="button" @click="switchCreateUserToExistingPerson">
                <i class="fas fa-chevron-left"></i>
                Вернуться к списку людей
              </button>
              <div class="modal-note">Создаём новое физическое лицо и потом привязываем его к компании.</div>
            </div>
            <label class="modal-field">
              <span>Фамилия</span>
              <input
                v-model="createUserNewPerson.last_name"
                class="form-input"
                type="text"
                name="create-user-new-last-name"
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
                v-model="createUserNewPerson.name"
                class="form-input"
                type="text"
                name="create-user-new-name"
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
                v-model="createUserNewPerson.middle_name"
                class="form-input"
                type="text"
                name="create-user-new-middle-name"
                autocomplete="off"
                autocapitalize="words"
                autocorrect="off"
                spellcheck="false"
                placeholder="Например: Иванович"
              >
            </label>
          </div>

          <div class="modal-grid">
            <label class="modal-field">
              <span>Должность</span>
              <input v-model="createUserForm.position" class="form-input" type="text" autocomplete="off" placeholder="Например: Инженер">
            </label>
            <label class="modal-field">
              <span>Тип роли</span>
              <select v-model="createUserForm.role_type" class="form-input">
                <option v-for="role in roleOptions" :key="role.value" :value="role.value">{{ role.label }}</option>
              </select>
            </label>
            <label class="modal-field">
              <span>Телефон рабочий</span>
              <input
                :value="createUserForm.phone_work"
                class="form-input"
                type="text"
                inputmode="tel"
                autocomplete="off"
                placeholder="+7 (___) ___-__-__"
                @input="onUserPhoneInput('phone_work', $event)"
              >
            </label>
            <label class="modal-field">
              <span>Телефон дополнительный</span>
              <input
                :value="createUserForm.phone_extra"
                class="form-input"
                type="text"
                inputmode="tel"
                autocomplete="off"
                placeholder="+7 (___) ___-__-__"
                @input="onUserPhoneInput('phone_extra', $event)"
              >
            </label>
            <label class="modal-field">
              <span>Email рабочий</span>
              <input v-model="createUserForm.email_work" class="form-input" type="email" autocomplete="off" placeholder="name@company.ru">
            </label>
            <label class="modal-field">
              <span>Email дополнительный</span>
              <input v-model="createUserForm.email_extra" class="form-input" type="email" autocomplete="off" placeholder="name@company.ru">
            </label>
            <label class="modal-field modal-field-wide">
              <span>Комментарий</span>
              <textarea v-model="createUserForm.comment" class="form-input employee-comment-input" rows="3" autocomplete="off" placeholder="Комментарий..."></textarea>
            </label>
          </div>

          <div v-if="createUserError" class="lookup-empty error modal-error">{{ createUserError }}</div>

          <div class="modal-actions">
            <button class="btn" type="button" :disabled="createUserSaving" @click="closeCreateUserModal">Отмена</button>
            <button class="btn btn-primary" type="button" :disabled="createUserSaving" @click="createUser">
              {{ createUserSaving ? 'Создание...' : 'Создать' }}
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

.header-actions {
  display: flex;
  gap: 8px;
}

.btn-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #fff;
  text-decoration: none;
}
.page-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
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

.table-wrapper {
  background: var(--bg-surface);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-light);
  box-shadow: var(--shadow-sm);
  overflow: auto;
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

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  min-width: 1200px;
}

.table th,
.table td {
  border: 1px solid var(--border-light);
  padding: 10px 12px;
  text-align: left;
  vertical-align: top;
}

.table th {
  background: var(--bg-subtle);
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.empty-row {
  text-align: center;
  color: var(--text-secondary);
  padding: 18px 12px;
}

.mono {
  font-family: "JetBrains Mono", monospace;
  color: var(--text-secondary);
  font-size: 12px;
}

.multiline-cell {
  white-space: pre-line;
}

.org-link {
  color: var(--brand-primary);
  text-decoration: none;
  font-weight: 600;
}

.org-link:hover {
  text-decoration: underline;
}

.org-link-btn {
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.org-link-btn:disabled {
  cursor: wait;
  opacity: 0.7;
  text-decoration: none;
}

.filters-panel {
  background: var(--bg-surface);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-light);
  box-shadow: var(--shadow-sm);
  padding: 14px;
}

.filters-grid {
  display: grid;
  grid-template-columns: 1.4fr 1fr auto;
  gap: 12px;
  align-items: end;
}

.users-filters {
  grid-template-columns: 1.4fr 1fr 1fr auto;
}

.filter-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.filter-field > span {
  font-size: 12px;
  font-weight: 600;
}

.filter-input {
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: #fff;
  font: inherit;
  font-size: 12px;
  box-sizing: border-box;
}

.filter-actions {
  display: flex;
  justify-content: flex-end;
}

.chip-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.chip-btn {
  border: 1px solid var(--border-light);
  background: var(--bg-surface);
  color: var(--text-secondary);
  border-radius: 999px;
  padding: 7px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.chip-btn.active {
  background: var(--brand-primary);
  border-color: var(--brand-primary);
  color: #fff;
}

.chip-btn:hover {
  background: var(--bg-subtle);
  color: var(--text-primary);
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

.modal-card.user-modal {
  width: min(980px, 100%);
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
}

.modal-field > span {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 600;
}

.modal-card.user-modal .form-input {
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

.modal-card.user-modal .form-input:focus {
  outline: none;
  border-color: var(--brand-primary);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}

.modal-card.user-modal select.form-input {
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

.lookup-wrap {
  position: relative;
}

.input-with-icon {
  position: relative;
}

.input-with-icon .form-input {
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

.lookup-empty {
  padding: 8px 10px;
  font-size: 12px;
  color: var(--text-secondary);
}

.lookup-empty.error {
  color: var(--danger-text);
}

.modal-note {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-top: -2px;
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
/* ── Отделы и группы ── */
.dept-wrap { flex: 1; overflow-y: auto; }
.dept-empty {
  display: flex; flex-direction: column; align-items: center; gap: 12px;
  padding: 48px; color: var(--text-tertiary); font-size: 14px;
}
.dept-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px;
  padding: 4px 0 24px;
}
.dept-card {
  border: 1px solid var(--border-light); border-radius: 12px; padding: 14px 16px;
  background: var(--bg-surface); transition: border-color 0.12s, box-shadow 0.12s;
}
.dept-card:hover { border-color: var(--brand-primary); box-shadow: 0 2px 8px rgba(15,23,42,0.06); }
.dept-card-top { display: flex; align-items: center; gap: 10px; }
.dept-icon {
  width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0;
  background: var(--brand-light, #eff6ff); color: var(--brand-primary);
  display: flex; align-items: center; justify-content: center; font-size: 15px;
}
.dept-name { font-size: 14px; font-weight: 600; color: var(--text-primary); word-break: break-word; }
.dept-members { margin-top: 10px; }
.dept-members-count { font-size: 12px; color: var(--text-secondary); display: inline-flex; align-items: center; gap: 6px; }

/* Модалка отдела */
.modal-card {
  width: min(520px, 100%);
  max-height: calc(100vh - 32px);
  overflow: visible;
  background: var(--bg-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: 20px;
}
.dept-field { display: flex; flex-direction: column; gap: 6px; margin-top: 14px; }
.dept-field > span { font-size: 12px; font-weight: 600; color: var(--text-secondary); }
.dept-combo { position: relative; }
.dept-combo-box {
  display: flex; align-items: center; flex-wrap: wrap; gap: 5px; min-height: 40px;
  padding: 4px 8px; border: 1px solid var(--border-light); border-radius: 8px; background: var(--bg-surface);
}
.dept-combo-box:focus-within { border-color: var(--brand-primary); }
.dept-combo-input { flex: 1; min-width: 120px; border: none; outline: none; background: none; font-size: 13px; padding: 5px 2px; }
.dept-combo-dd {
  position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 400;
  background: var(--bg-surface); border: 1px solid var(--border-light); border-radius: 8px;
  box-shadow: 0 6px 18px rgba(0,0,0,0.12); max-height: 220px; overflow-y: auto; padding: 4px;
}
.dept-combo-item {
  display: flex; align-items: center; gap: 8px; width: 100%; text-align: left;
  border: none; background: none; cursor: pointer; padding: 7px 8px; border-radius: 6px;
  font-size: 13px; color: var(--text-primary);
}
.dept-combo-item:hover { background: var(--bg-subtle); }
.dept-avatar {
  width: 24px; height: 24px; border-radius: 50%; flex-shrink: 0;
  background: var(--brand-light, #eff6ff); color: var(--brand-primary);
  display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700;
}
.dept-chip {
  display: inline-flex; align-items: center; gap: 5px;
  background: var(--brand-light, #eff6ff); color: var(--brand-primary);
  border-radius: 6px; padding: 3px 5px 3px 8px; font-size: 12px; font-weight: 600;
}
.dept-chip-x { border: none; background: none; color: inherit; cursor: pointer; padding: 0; font-size: 10px; display: flex; }
.dept-error { margin-top: 12px; font-size: 12px; color: #ef4444; }

/* Карточка: три точки + меню */
.dept-card { cursor: pointer; }
.dept-dots {
  margin-left: auto; flex-shrink: 0; width: 28px; height: 28px; border-radius: 7px;
  border: none; background: none; cursor: pointer; color: var(--text-secondary); font-size: 13px;
  display: inline-flex; align-items: center; justify-content: center;
}
.dept-dots:hover { background: var(--bg-subtle); color: var(--text-primary); }
.dept-menu-overlay { position: fixed; inset: 0; z-index: 9998; }
.dept-menu {
  min-width: 190px; background: var(--bg-surface); border: 1px solid var(--border-light);
  border-radius: 10px; box-shadow: 0 8px 28px rgba(15,23,42,0.18); padding: 4px;
}
.dept-menu-item {
  width: 100%; display: flex; align-items: center; gap: 8px;
  padding: 9px 12px; border: none; background: none; cursor: pointer;
  font-size: 13px; color: var(--text-primary); border-radius: 7px; text-align: left;
}
.dept-menu-item:hover { background: var(--bg-subtle); }
.dept-menu-item--danger { color: #dc2626; }
.dept-menu-item--danger:hover { background: #fef2f2; }
.dept-btn-danger { background: #ef4444 !important; color: #fff !important; border-color: #ef4444 !important; }

/* Страница отдела */
.dept-detail-head { display: flex; align-items: center; gap: 10px; padding: 4px 0 14px; }
.dept-back {
  width: 32px; height: 32px; border-radius: 8px; border: 1px solid var(--border-light);
  background: var(--bg-surface); cursor: pointer; color: var(--text-secondary);
  display: inline-flex; align-items: center; justify-content: center;
}
.dept-back:hover { color: var(--brand-primary); border-color: var(--brand-primary); }
.dept-detail-name { font-size: 18px; font-weight: 700; color: var(--text-primary); flex: 1; }
.dept-menu-wrap { flex-shrink: 0; }
.dept-members-list { display: flex; flex-direction: column; gap: 6px; margin-top: 16px; max-width: 640px; padding-bottom: 24px; }
.dept-member-row {
  display: flex; align-items: center; gap: 10px;
  border: 1px solid var(--border-light); border-radius: 10px; padding: 10px 14px;
  background: var(--bg-surface);
}
.dept-member-name { flex: 1; font-size: 13px; font-weight: 500; color: var(--text-primary); }
.dept-role-badge {
  font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 6px;
  background: var(--bg-subtle); color: var(--text-secondary);
}
.dept-role-badge--creator { background: #fef3c7; color: #b45309; }
.dept-role-badge--admin { background: #dbeafe; color: #2563eb; }
.dept-role-select {
  height: 30px; padding: 0 8px; border: 1px solid var(--border-light); border-radius: 7px;
  font-size: 12px; background: var(--bg-surface); color: var(--text-primary); outline: none; cursor: pointer;
}
.dept-role-select:focus { border-color: var(--brand-primary); }
.dept-member-del {
  width: 26px; height: 26px; border-radius: 7px; border: none; background: none;
  cursor: pointer; color: var(--text-tertiary); font-size: 12px;
  display: inline-flex; align-items: center; justify-content: center;
}
.dept-member-del:hover { background: #fef2f2; color: #ef4444; }
</style>
