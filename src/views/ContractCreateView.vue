<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import TopNav from '../components/layout/TopNav.vue'
import { mainNavLinks } from '../constants/mainNav'

const router  = useRouter()
const navLinks = mainNavLinks

// ── Steps meta ─────────────────────────────────────────────
const currentStep = ref(0)
const STEPS = [
  {
    label: 'Наименование',
    icon: 'fa-file-alt',
    desc: 'Укажите тип и предмет договора — это основа классификации документа в реестре.',
  },
  {
    label: 'Стороны договора',
    icon: 'fa-handshake',
    desc: 'Укажите все организации, участвующие в договоре. Заказчик и Подрядчик обязательны, остальные стороны добавляются при необходимости.',
  },
  {
    label: 'Сроки',
    icon: 'fa-calendar-alt',
    desc: 'Задайте даты действия договора. Номер договора формируется автоматически из даты и префикса организации.',
  },
  {
    label: 'Объект',
    icon: 'fa-building',
    desc: 'Выберите объект строительства или деятельности, к которому относится договор. При необходимости можно создать новый объект.',
  },
  {
    label: 'Виды работ',
    icon: 'fa-tools',
    desc: 'Укажите один или несколько видов работ по договору. Это позволяет группировать и фильтровать договоры по типу деятельности.',
  },
  {
    label: 'Сумма договора',
    icon: 'fa-ruble-sign',
    desc: 'Укажите общую стоимость договора в рублях. Значение используется при расчёте бюджета и задолженностей.',
  },
  {
    label: 'Ответственные',
    icon: 'fa-users',
    desc: 'Назначьте исполнителя, который несёт ответственность за договор. Соисполнители и наблюдатели добавляются по необходимости.',
  },
  {
    label: 'Дополнительно',
    icon: 'fa-info-circle',
    desc: 'Любая дополнительная информация, которая не вошла в основные поля: особые условия, внутренние пометки, комментарии.',
  },
]

// ── API lists ──────────────────────────────────────────────
const docTypesList   = ref([])
const counterparties = ref([])
const objectsList    = ref([])
const projectsList   = ref([])
const workTypesList  = ref([])
const usersList      = ref([])

const loadAll = async () => {
  const results = await Promise.allSettled([
    fetch('/apisup/supply/document-types',     { credentials: 'include' }).then(r => r.ok ? r.json() : []),
    fetch('/apiref/ref/counterparties',         { credentials: 'include' }).then(r => r.ok ? r.json() : []),
    fetch('/apiref/ref/objects',                { credentials: 'include' }).then(r => r.ok ? r.json() : []),
    fetch('/apisup/supply/request-objects/my',  { credentials: 'include' }).then(r => r.ok ? r.json() : []),
    fetch('/apisup/supply/contract-work-types', { credentials: 'include' }).then(r => r.ok ? r.json() : []),
    fetch('/api/as/users/all',                  { credentials: 'include' }).then(r => r.ok ? r.json() : []),
  ])
  docTypesList.value   = results[0].status === 'fulfilled' ? (results[0].value || []) : []
  counterparties.value = results[1].status === 'fulfilled' ? (results[1].value || []) : []
  objectsList.value    = results[2].status === 'fulfilled' ? (results[2].value || []) : []
  projectsList.value   = results[3].status === 'fulfilled' ? (results[3].value || []) : []
  workTypesList.value  = results[4].status === 'fulfilled' ? (results[4].value || []) : []
  usersList.value      = results[5].status === 'fulfilled' ? (results[5].value || []) : []

  try {
    const r = await fetch('/api/as/users/me', { credentials: 'include' })
    if (r.ok) {
      const me = await r.json()
      if (me?.id && !executor.value) {
        executor.value      = me
        executorQuery.value = uName(me)
      }
    }
  } catch { /* no /me endpoint */ }
}

// ── Step 1 ─────────────────────────────────────────────────
const docType      = ref(null)
const docTypeQuery = ref('')
const docTypeOpen  = ref(false)
const subject      = ref('')

const filteredDocTypes = computed(() => {
  const q = docTypeQuery.value.trim().toLowerCase()
  if (!q) return docTypesList.value.slice(0, 30)
  return docTypesList.value.filter(d => d.name.toLowerCase().includes(q))
})
const hasExactDocType = computed(() =>
  docTypesList.value.some(d => d.name.toLowerCase() === docTypeQuery.value.trim().toLowerCase())
)
const selectDocType  = (dt) => { docType.value = dt; docTypeQuery.value = dt.name; docTypeOpen.value = false }
const onDocTypeInput = ()   => { docType.value = null; docTypeOpen.value = true }
const createDocType  = async () => {
  const name = docTypeQuery.value.trim()
  if (!name) return
  try {
    const r = await fetch('/apisup/supply/document-types', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!r.ok) return
    const created = await r.json()
    docTypesList.value.push(created)
    selectDocType(created)
  } catch { /* silent */ }
}

// ── Step 2 ─────────────────────────────────────────────────
const parties = ref([
  { role: 'Заказчик',  company: null, query: '', open: false, fixed: true },
  { role: 'Подрядчик', company: null, query: '', open: false, fixed: true },
])
const filterCPs = (q) => {
  const query = (q || '').trim().toLowerCase()
  if (!query) return counterparties.value.slice(0, 25)
  return counterparties.value.filter(c =>
    c.short_name?.toLowerCase().includes(query) || c.full_name?.toLowerCase().includes(query)
  )
}
const selectPartyCP = (idx, cp) => {
  parties.value[idx].company = cp
  parties.value[idx].query   = cp.short_name
  parties.value[idx].open    = false
}
const clearPartyCP = (idx) => { parties.value[idx].company = null }
const addParty     = ()    => { parties.value.push({ role: '', company: null, query: '', open: false, fixed: false }) }
const removeParty  = (idx) => { parties.value.splice(idx, 1) }

// Создание компании — переход на страницу создания с возвратом
const goCreateCompany = (partyIdx) => {
  // Сохраняем состояние в sessionStorage чтобы восстановить после возврата
  sessionStorage.setItem('contractDraft', JSON.stringify({
    step:        currentStep.value,
    partyIdx,
    docTypeId:   docType.value?.id   || null,
    docTypeName: docType.value?.name || null,
    subject:     subject.value,
  }))
  router.push('/organizations/create')
}

// При маунте — проверяем, вернулись ли со страницы создания компании
const restoreDraftAfterOrgCreate = async () => {
  const raw = sessionStorage.getItem('contractDraft')
  if (!raw) return
  sessionStorage.removeItem('contractDraft')
  try {
    const draft = JSON.parse(raw)
    // Обновляем список контрагентов
    const r = await fetch('/apiref/ref/counterparties', { credentials: 'include' })
    if (r.ok) counterparties.value = await r.json()
    // Восстанавливаем шаг
    if (draft.docTypeId) {
      const dt = docTypesList.value.find(d => d.id === draft.docTypeId)
      if (dt) selectDocType(dt)
    }
    subject.value = draft.subject || ''
    currentStep.value = draft.step ?? 1
  } catch { /* silent */ }
}

// ── Step 3 ─────────────────────────────────────────────────
const contractDate = ref('')
const contractNum  = ref('')
const dateStart    = ref('')
const dateEnd      = ref('')

const buildContractNum = () => {
  if (!contractDate.value) return
  const [y, m, d] = contractDate.value.split('-')
  if (!y || !m || !d) return
  let prefix = ''
  for (const p of parties.value) {
    if (p.company?.is_internal && p.company?.contract_prefix) {
      prefix = p.company.contract_prefix + ' '
      break
    }
  }
  contractNum.value = prefix + `${d}-${m}-${y}`
}
watch([contractDate, parties], buildContractNum, { deep: true })

// ── Step 4 ─────────────────────────────────────────────────
const selectedObject   = ref(null)
const objectQuery      = ref('')
const objectOpen       = ref(false)
const selectedProjects = ref([])
const projectQuery     = ref('')
const projectOpen      = ref(false)

const filteredObjects = computed(() => {
  const q    = objectQuery.value.trim().toLowerCase()
  const base = objectsList.value.filter(o => o.is_active !== false)
  if (!q) return base.slice(0, 25)
  return base.filter(o => o.short_name?.toLowerCase().includes(q))
})
const hasExactObject = computed(() =>
  objectsList.value.some(o => o.short_name?.toLowerCase() === objectQuery.value.trim().toLowerCase())
)
const selectObject  = (obj) => { selectedObject.value = obj; objectQuery.value = obj.short_name; objectOpen.value = false }
const onObjectInput = ()    => { selectedObject.value = null; objectOpen.value = true }
const createObject  = async () => {
  const name = objectQuery.value.trim()
  if (!name) return
  try {
    const r = await fetch('/apiref/ref/objects', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ short_name: name, is_active: true, created_at: new Date().toISOString() }),
    })
    if (!r.ok) return
    const created = await r.json()
    objectsList.value.push(created)
    selectObject(created)
  } catch { /* silent */ }
}

const filteredProjects = computed(() => {
  const q      = projectQuery.value.trim().toLowerCase()
  const selIds = new Set(selectedProjects.value.map(p => p.id))
  const list   = projectsList.value.filter(p => !selIds.has(p.id))
  if (!q) return list.slice(0, 25)
  return list.filter(p => p.name.toLowerCase().includes(q))
})
const addProject    = (proj) => { selectedProjects.value.push(proj); projectQuery.value = ''; projectOpen.value = false }
const removeProject = (id)   => { selectedProjects.value = selectedProjects.value.filter(p => p.id !== id) }

// ── Step 5 ─────────────────────────────────────────────────
const selectedWTs = ref([])
const wtQuery     = ref('')
const wtOpen      = ref(false)

const filteredWTs = computed(() => {
  const q      = wtQuery.value.trim().toLowerCase()
  const selIds = new Set(selectedWTs.value.map(w => w.id))
  const list   = workTypesList.value.filter(w => !selIds.has(w.id))
  if (!q) return list.slice(0, 25)
  return list.filter(w => w.name.toLowerCase().includes(q))
})
const hasExactWT = computed(() =>
  workTypesList.value.some(w => w.name.toLowerCase() === wtQuery.value.trim().toLowerCase())
)
const addWT    = (wt) => { selectedWTs.value.push(wt); wtQuery.value = ''; wtOpen.value = false }
const removeWT = (id) => { selectedWTs.value = selectedWTs.value.filter(w => w.id !== id) }
const createWT = async () => {
  const name = wtQuery.value.trim()
  if (!name) return
  try {
    const r = await fetch('/apisup/supply/contract-work-types', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!r.ok) return
    const created = await r.json()
    workTypesList.value.push(created)
    addWT(created)
  } catch { /* silent */ }
}

// ── Step 6 ─────────────────────────────────────────────────
const amountStr  = ref('0,00')
const fmtAmount  = (n) => new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)
const parseAmount = (s) => parseFloat((s || '0').replace(/\s/g, '').replace(',', '.')) || 0
const onAmountFocus = (e) => { const n = parseAmount(amountStr.value); e.target.value = n === 0 ? '' : String(n).replace('.', ','); e.target.select() }
const onAmountBlur  = (e) => { amountStr.value = fmtAmount(parseAmount(e.target.value)) }

// ── Step 7 ─────────────────────────────────────────────────
const executor      = ref(null)
const executorQuery = ref('')
const executorOpen  = ref(false)
const coExecutors   = ref([])
const coExQuery     = ref('')
const coExOpen      = ref(false)
const observers     = ref([])
const obsQuery      = ref('')
const obsOpen       = ref(false)

const uName = (u) => `${u.surname} ${u.name}${u.patronymic ? ' ' + u.patronymic : ''}`

const usedIds = computed(() => {
  const s = new Set()
  if (executor.value) s.add(executor.value.id)
  coExecutors.value.forEach(u => s.add(u.id))
  observers.value.forEach(u => s.add(u.id))
  return s
})

const filterUsers = (query, selfId = null) => {
  const q = (query || '').trim().toLowerCase()
  return usersList.value.filter(u => {
    if (u.id !== selfId && usedIds.value.has(u.id)) return false
    if (!q) return true
    return uName(u).toLowerCase().includes(q) || (u.username || '').toLowerCase().includes(q)
  }).slice(0, 20)
}

const selectExecutor = (u)  => { executor.value = u; executorQuery.value = uName(u); executorOpen.value = false }
const clearExecutor  = ()   => { executor.value = null; executorQuery.value = '' }
const onExInput      = ()   => { executor.value = null; executorOpen.value = true }
const addCoEx        = (u)  => { coExecutors.value.push(u); coExQuery.value = ''; coExOpen.value = false }
const removeCoEx     = (id) => { coExecutors.value = coExecutors.value.filter(u => u.id !== id) }
const addObs         = (u)  => { observers.value.push(u); obsQuery.value = ''; obsOpen.value = false }
const removeObs      = (id) => { observers.value = observers.value.filter(u => u.id !== id) }

// ── Step 8 ─────────────────────────────────────────────────
const note = ref('')

// ── Completion — все флаги честные ─────────────────────────
const stepDone = computed(() => [
  !!docType.value,                                                 // 1: тип выбран
  !!(parties.value[0]?.company && parties.value[1]?.company),     // 2: заказчик + подрядчик
  !!contractDate.value,                                            // 3: дата договора
  !!selectedObject.value,                                          // 4: объект обязателен
  selectedWTs.value.length > 0,                                   // 5: хотя бы один вид работ
  parseAmount(amountStr.value) >= 0,                              // 6: сумма (0 — допустимо, но должна быть изменена)
  !!executor.value,                                                // 7: исполнитель
  true,                                                            // 8: необязательно
])

// Шаг 6 считаем заполненным только если пользователь взаимодействовал (не дефолтный 0,00)
const step6Touched = ref(false)
const stepDoneDisplay = computed(() => stepDone.value.map((v, i) => i === 5 ? (step6Touched.value && v) : v))

const canCreate = computed(() =>
  stepDone.value[0] && stepDone.value[1] && stepDone.value[2] &&
  stepDone.value[3] && stepDone.value[4] && stepDone.value[6]
)

// ── Submit ─────────────────────────────────────────────────
const submitting  = ref(false)
const submitError = ref('')

const postJSON = (url, body) => fetch(url, {
  method: 'POST', credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

const submit = async () => {
  submitError.value = ''
  submitting.value  = true
  try {
    // 1. Создаём договор
    const customer   = parties.value[0].company
    const contractor = parties.value[1].company

    const contractRes = await postJSON('/apisup/supply/contracts', {
      num:              contractNum.value || null,
      document_type_id: docType.value?.id,
      name:             subject.value || null,
      date:             contractDate.value,
      date_start:       dateStart.value || null,
      date_end:         dateEnd.value   || null,
      customer_id:      customer?.id    || null,
      contractor_id:    contractor?.id  || null,
      sum:              parseAmount(amountStr.value),
      comment:          note.value || null,
    })
    if (!contractRes.ok) throw new Error(`Ошибка создания договора: HTTP ${contractRes.status}`)
    const contract = await contractRes.json()
    const contractId = contract.id

    // 2. Дополнительные стороны (idx >= 2)
    const extraParties = parties.value.slice(2).filter(p => p.company)
    const partyCalls = extraParties.map(p =>
      postJSON('/apisup/supply/contract-parties', {
        contract_id:       contractId,
        counterparties_id: p.company.id,
        name:              p.role,
      })
    )

    // 3. Объект
    const objectCalls = []
    if (selectedObject.value) {
      objectCalls.push(postJSON('/apisup/supply/contract-objects', {
        contract_id: contractId,
        object_id:   selectedObject.value.id,
        object_type: 'object',
      }))
    }
    for (const proj of selectedProjects.value) {
      objectCalls.push(postJSON('/apisup/supply/contract-objects', {
        contract_id: contractId,
        object_id:   proj.id,
        object_type: 'object_levels_id',
      }))
    }

    // 4. Виды работ
    const wtCalls = selectedWTs.value.map(wt =>
      postJSON('/apisup/supply/work-contracts', {
        contract_id:           contractId,
        contract_work_type_id: wt.id,
      })
    )

    // 5. Ответственные
    const roleCalls = []
    if (executor.value) {
      roleCalls.push(postJSON('/apisup/supply/contract-user-roles', {
        contract_id: contractId,
        user_id:     executor.value.id,
        role:        'executor',
      }))
    }
    for (const u of coExecutors.value) {
      roleCalls.push(postJSON('/apisup/supply/contract-user-roles', {
        contract_id: contractId,
        user_id:     u.id,
        role:        'co-executor',
      }))
    }
    for (const u of observers.value) {
      roleCalls.push(postJSON('/apisup/supply/contract-user-roles', {
        contract_id: contractId,
        user_id:     u.id,
        role:        'observer',
      }))
    }

    // Все параллельно
    await Promise.all([...partyCalls, ...objectCalls, ...wtCalls, ...roleCalls])

    router.push('/documents')
  } catch (e) {
    submitError.value = e.message || 'Ошибка при создании договора'
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  await loadAll()
  await restoreDraftAfterOrgCreate()
})
</script>

<template>
  <div class="page-wrap">
    <TopNav :links="navLinks" />

    <div class="create-layout">

      <!-- ── Steps sidebar ── -->
      <aside class="steps-sidebar">
        <div class="sidebar-top">
          <button class="back-btn" @click="router.push('/documents')">
            <i class="fas fa-arrow-left"></i> Назад
          </button>
          <div class="sidebar-title">Новый договор</div>
          <div class="sidebar-progress">
            {{ stepDone.filter(Boolean).length }} из {{ STEPS.length }} шагов
          </div>
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: (stepDone.filter(Boolean).length / STEPS.length * 100) + '%' }"></div>
          </div>
        </div>

        <nav class="steps-nav">
          <button
            v-for="(step, idx) in STEPS" :key="idx"
            class="step-btn"
            :class="{ active: currentStep === idx, done: stepDoneDisplay[idx] && currentStep !== idx }"
            @click="currentStep = idx"
          >
            <span class="step-num">
              <i v-if="stepDoneDisplay[idx] && currentStep !== idx" class="fas fa-check"></i>
              <span v-else>{{ idx + 1 }}</span>
            </span>
            <span class="step-lbl">{{ step.label }}</span>
          </button>
        </nav>

        <div class="sidebar-bottom">
          <div v-if="!canCreate" class="hint-text">
            <i class="fas fa-info-circle"></i>
            Заполните все обязательные шаги
          </div>
          <div v-if="submitError" class="submit-error">{{ submitError }}</div>
          <button
            class="btn-create"
            :disabled="!canCreate || submitting"
            @click="submit"
          >
            <i class="fas fa-check-circle"></i>
            {{ submitting ? 'Создание...' : 'Создать договор' }}
          </button>
        </div>
      </aside>

      <!-- ── Step content ── -->
      <main class="step-body">

        <!-- Sticky top nav -->
        <div class="step-topbar">
          <div class="step-topbar-left">
            <button v-if="currentStep > 0" class="topbar-nav-btn" @click="currentStep--">
              <i class="fas fa-arrow-left"></i>
            </button>
            <div class="step-topbar-info">
              <span class="step-topbar-num">Шаг {{ currentStep + 1 }} из {{ STEPS.length }}</span>
              <span class="step-topbar-name">{{ STEPS[currentStep].label }}</span>
            </div>
          </div>
          <button v-if="currentStep < STEPS.length - 1" class="topbar-next-btn" @click="currentStep++">
            Далее <i class="fas fa-arrow-right"></i>
          </button>
        </div>

        <!-- Step content area -->
        <div class="step-inner">

          <!-- Step 1 -->
          <template v-if="currentStep === 0">
            <p class="step-desc">{{ STEPS[0].desc }}</p>

            <div class="form-card">
              <div class="field-group">
                <label class="field-label required-label">Тип договора</label>
                <p class="field-desc">Классификационная категория, определяющая правовую природу соглашения — например, «Договор подряда», «Договор оказания услуг», «Договор поставки».</p>
                <div class="autocomplete">
                  <input
                    v-model="docTypeQuery"
                    class="field-input" :class="{ 'has-value': docType }"
                    placeholder="Начните вводить тип договора..."
                    @focus="docTypeOpen = true"
                    @blur="setTimeout(() => docTypeOpen = false, 160)"
                    @input="onDocTypeInput"
                  />
                  <div v-if="docTypeOpen" class="ac-drop">
                    <div v-if="docTypeQuery.trim() && !hasExactDocType" class="ac-create" @mousedown.prevent="createDocType">
                      <i class="fas fa-plus-circle"></i> Создать тип: «{{ docTypeQuery.trim() }}»
                    </div>
                    <div v-for="dt in filteredDocTypes" :key="dt.id" class="ac-item" :class="{ 'ac-item--sel': docType?.id === dt.id }" @mousedown.prevent="selectDocType(dt)">{{ dt.name }}</div>
                    <div v-if="!filteredDocTypes.length && !docTypeQuery.trim()" class="ac-empty">Нет типов договоров</div>
                  </div>
                </div>
                <div v-if="docType" class="value-badge"><i class="fas fa-tag"></i> {{ docType.name }}</div>
              </div>

              <div class="field-divider"></div>

              <div class="field-group field-group--last">
                <label class="field-label">Предмет договора</label>
                <p class="field-desc">Краткое содержательное описание того, что является основным обязательством по договору. Не обязательно к заполнению.</p>
                <textarea v-model="subject" class="field-textarea" rows="4" placeholder="Например: выполнение строительно-монтажных работ на объекте ЖК «Северный»..."></textarea>
              </div>
            </div>
          </template>

          <!-- Step 2 -->
          <template v-else-if="currentStep === 1">
            <p class="step-desc">{{ STEPS[1].desc }}</p>

            <div v-for="(party, idx) in parties" :key="idx" class="form-card party-card">
              <div class="party-head">
                <div class="party-role-wrap">
                  <span v-if="party.fixed" class="party-role-fixed required-label">{{ party.role }}</span>
                  <input v-else v-model="party.role" class="party-role-input" placeholder="Укажите роль стороны..." />
                </div>
                <button v-if="!party.fixed" class="party-rm-btn" @click="removeParty(idx)"><i class="fas fa-trash"></i></button>
              </div>
              <div class="autocomplete">
                <input
                  v-model="party.query"
                  class="field-input" :class="{ 'has-value': party.company }"
                  placeholder="Поиск по наименованию организации..."
                  @focus="party.open = true"
                  @blur="setTimeout(() => party.open = false, 160)"
                  @input="() => { party.company = null; party.open = true }"
                />
                <div v-if="party.open" class="ac-drop">
                  <div v-for="cp in filterCPs(party.query)" :key="cp.id" class="ac-item ac-item--cp" :class="{ 'ac-item--sel': party.company?.id === cp.id }" @mousedown.prevent="selectPartyCP(idx, cp)">
                    <span class="cp-name">{{ cp.short_name }}</span>
                    <span v-if="cp.is_internal" class="internal-badge">Наш</span>
                  </div>
                  <div v-if="!filterCPs(party.query).length" class="ac-empty">Организация не найдена</div>
                  <div class="ac-footer-create" @mousedown.prevent="goCreateCompany(idx)">
                    <i class="fas fa-building"></i> Создать новую организацию
                  </div>
                </div>
              </div>
              <div v-if="party.company" class="selected-row">
                <i class="fas fa-building" style="color:var(--brand-primary)"></i>
                <span>{{ party.company.short_name }}</span>
                <span v-if="party.company.is_internal" class="internal-badge">Наш</span>
                <button class="clear-btn" @click="clearPartyCP(idx)"><i class="fas fa-times"></i></button>
              </div>
            </div>

            <button class="btn-add-item" @click="addParty">
              <i class="fas fa-plus"></i> Добавить сторону
            </button>
          </template>

          <!-- Step 3 -->
          <template v-else-if="currentStep === 2">
            <p class="step-desc">{{ STEPS[2].desc }}</p>

            <div class="form-card">
              <div class="fields-grid-2">
                <div class="field-group">
                  <label class="field-label required-label">Дата договора</label>
                  <p class="field-desc">Дата подписания или заключения договора. Используется для генерации номера.</p>
                  <input v-model="contractDate" type="date" class="field-input" />
                </div>
                <div class="field-group">
                  <label class="field-label">Номер договора</label>
                  <p class="field-desc">Генерируется автоматически из даты и префикса внутренней организации. Можно изменить вручную.</p>
                  <input v-model="contractNum" class="field-input" placeholder="Автоматически из даты" />
                </div>
              </div>

              <div class="field-divider"></div>

              <div class="fields-grid-2">
                <div class="field-group">
                  <label class="field-label">Дата начала работ</label>
                  <p class="field-desc">Фактическая дата, с которой стороны приступают к исполнению обязательств.</p>
                  <input v-model="dateStart" type="date" class="field-input" />
                </div>
                <div class="field-group">
                  <label class="field-label">Дата окончания работ</label>
                  <p class="field-desc">Плановая дата завершения всех работ по договору.</p>
                  <input v-model="dateEnd" type="date" class="field-input" />
                </div>
              </div>
            </div>
          </template>

          <!-- Step 4 -->
          <template v-else-if="currentStep === 3">
            <p class="step-desc">{{ STEPS[3].desc }}</p>

            <div class="form-card">
              <div class="field-group">
                <label class="field-label required-label">Краткое наименование объекта</label>
                <p class="field-desc">Выберите объект из справочника или создайте новый. Объект — это место или адрес, где выполняются работы по договору.</p>
                <div class="autocomplete">
                  <input
                    v-model="objectQuery"
                    class="field-input" :class="{ 'has-value': selectedObject }"
                    placeholder="Поиск объекта..."
                    @focus="objectOpen = true"
                    @blur="setTimeout(() => objectOpen = false, 160)"
                    @input="onObjectInput"
                  />
                  <div v-if="objectOpen" class="ac-drop">
                    <div v-if="objectQuery.trim() && !hasExactObject" class="ac-create" @mousedown.prevent="createObject">
                      <i class="fas fa-plus-circle"></i> Создать объект: «{{ objectQuery.trim() }}»
                    </div>
                    <div v-for="obj in filteredObjects" :key="obj.id" class="ac-item" :class="{ 'ac-item--sel': selectedObject?.id === obj.id }" @mousedown.prevent="selectObject(obj)">{{ obj.short_name }}</div>
                    <div v-if="!filteredObjects.length && !objectQuery.trim()" class="ac-empty">Нет объектов</div>
                  </div>
                </div>
                <div v-if="selectedObject" class="selected-row">
                  <i class="fas fa-map-marker-alt" style="color:var(--brand-primary)"></i>
                  <span>{{ selectedObject.short_name }}</span>
                  <button class="clear-btn" @click="() => { selectedObject = null; objectQuery = '' }"><i class="fas fa-times"></i></button>
                </div>
              </div>

              <div v-if="selectedObject?.full_name" class="field-group">
                <label class="field-label">Полное наименование</label>
                <div class="readonly-field">{{ selectedObject.full_name }}</div>
              </div>

              <div class="field-divider"></div>

              <div class="field-group field-group--last">
                <label class="field-label">Проекты</label>
                <p class="field-desc">Свяжите договор с одним или несколькими внутренними проектами для удобной навигации.</p>
                <div class="autocomplete">
                  <input
                    v-model="projectQuery"
                    class="field-input"
                    placeholder="Добавить проект..."
                    @focus="projectOpen = true"
                    @blur="setTimeout(() => projectOpen = false, 160)"
                    @input="projectOpen = true"
                  />
                  <div v-if="projectOpen && filteredProjects.length" class="ac-drop">
                    <div v-for="proj in filteredProjects" :key="proj.id" class="ac-item" @mousedown.prevent="addProject(proj)">{{ proj.name }}</div>
                  </div>
                </div>
                <div v-if="selectedProjects.length" class="tags-wrap">
                  <span v-for="proj in selectedProjects" :key="proj.id" class="tag">
                    {{ proj.name }}<button @click="removeProject(proj.id)"><i class="fas fa-times"></i></button>
                  </span>
                </div>
              </div>
            </div>
          </template>

          <!-- Step 5 -->
          <template v-else-if="currentStep === 4">
            <p class="step-desc">{{ STEPS[4].desc }}</p>

            <div class="form-card">
              <div class="field-group field-group--last">
                <label class="field-label required-label">Виды работ</label>
                <p class="field-desc">Укажите конкретные виды работ, которые предусмотрены данным договором. Минимум один вид работ обязателен.</p>
                <div class="autocomplete">
                  <input
                    v-model="wtQuery"
                    class="field-input"
                    placeholder="Добавить вид работ..."
                    @focus="wtOpen = true"
                    @blur="setTimeout(() => wtOpen = false, 160)"
                    @input="wtOpen = true"
                  />
                  <div v-if="wtOpen" class="ac-drop">
                    <div v-if="wtQuery.trim() && !hasExactWT" class="ac-create" @mousedown.prevent="createWT">
                      <i class="fas fa-plus-circle"></i> Создать вид работ: «{{ wtQuery.trim() }}»
                    </div>
                    <div v-for="wt in filteredWTs" :key="wt.id" class="ac-item" @mousedown.prevent="addWT(wt)">{{ wt.name }}</div>
                    <div v-if="!filteredWTs.length && !wtQuery.trim()" class="ac-empty">Нет видов работ</div>
                  </div>
                </div>
                <div v-if="selectedWTs.length" class="tags-wrap">
                  <span v-for="wt in selectedWTs" :key="wt.id" class="tag tag--work">
                    <i class="fas fa-tools"></i>
                    {{ wt.name }}<button @click="removeWT(wt.id)"><i class="fas fa-times"></i></button>
                  </span>
                </div>
                <div v-else class="empty-notice">
                  <i class="fas fa-exclamation-circle"></i> Добавьте хотя бы один вид работ
                </div>
              </div>
            </div>
          </template>

          <!-- Step 6 -->
          <template v-else-if="currentStep === 5">
            <p class="step-desc">{{ STEPS[5].desc }}</p>

            <div class="form-card">
              <div class="field-group field-group--last" style="max-width:380px">
                <label class="field-label required-label">Сумма договора</label>
                <p class="field-desc">Общая стоимость работ или поставки согласно условиям договора. Укажите 0, если сумма не определена или является ориентировочной.</p>
                <div class="amount-wrap">
                  <input
                    :value="amountStr"
                    class="field-input amount-input"
                    placeholder="0,00"
                    @focus="onAmountFocus"
                    @blur="e => { onAmountBlur(e); step6Touched = true }"
                    @input="e => amountStr = e.target.value"
                  />
                  <span class="amount-sym">₽</span>
                </div>
                <div class="amount-preview">
                  {{ fmtAmount(parseAmount(amountStr)) }} рублей
                </div>
              </div>
            </div>
          </template>

          <!-- Step 7 -->
          <template v-else-if="currentStep === 6">
            <p class="step-desc">{{ STEPS[6].desc }}</p>

            <div class="form-card">
              <!-- Исполнитель -->
              <div class="field-group">
                <label class="field-label required-label">Исполнитель</label>
                <p class="field-desc">Сотрудник, несущий персональную ответственность за ведение договора. Может быть только один. По умолчанию — вы.</p>
                <div class="autocomplete">
                  <input
                    v-model="executorQuery"
                    class="field-input" :class="{ 'has-value': executor }"
                    placeholder="Поиск пользователя..."
                    @focus="executorOpen = true"
                    @blur="setTimeout(() => executorOpen = false, 160)"
                    @input="onExInput"
                  />
                  <div v-if="executorOpen" class="ac-drop">
                    <div v-for="u in filterUsers(executorQuery, executor?.id)" :key="u.id" class="ac-item" @mousedown.prevent="selectExecutor(u)">{{ uName(u) }}</div>
                    <div v-if="!filterUsers(executorQuery, executor?.id).length" class="ac-empty">Не найдено</div>
                  </div>
                </div>
                <div v-if="executor" class="selected-row">
                  <i class="fas fa-user-circle" style="color:var(--brand-primary)"></i>
                  <span>{{ uName(executor) }}</span>
                  <span class="role-badge role-badge--exec">Исполнитель</span>
                  <button class="clear-btn" @click="clearExecutor"><i class="fas fa-times"></i></button>
                </div>
              </div>

              <div class="field-divider"></div>

              <!-- Соисполнители -->
              <div class="field-group">
                <label class="field-label">Соисполнители</label>
                <p class="field-desc">Сотрудники, участвующие в работе по договору совместно с исполнителем. Может быть несколько.</p>
                <div class="autocomplete">
                  <input
                    v-model="coExQuery"
                    class="field-input"
                    placeholder="Добавить соисполнителя..."
                    @focus="coExOpen = true"
                    @blur="setTimeout(() => coExOpen = false, 160)"
                    @input="coExOpen = true"
                  />
                  <div v-if="coExOpen" class="ac-drop">
                    <div v-for="u in filterUsers(coExQuery)" :key="u.id" class="ac-item" @mousedown.prevent="addCoEx(u)">{{ uName(u) }}</div>
                    <div v-if="!filterUsers(coExQuery).length" class="ac-empty">Не найдено</div>
                  </div>
                </div>
                <div v-if="coExecutors.length" class="persons-list">
                  <div v-for="u in coExecutors" :key="u.id" class="person-row">
                    <i class="fas fa-user"></i>
                    <span>{{ uName(u) }}</span>
                    <span class="role-badge">Соисполнитель</span>
                    <button @click="removeCoEx(u.id)"><i class="fas fa-times"></i></button>
                  </div>
                </div>
              </div>

              <div class="field-divider"></div>

              <!-- Наблюдатели -->
              <div class="field-group field-group--last">
                <label class="field-label">Наблюдатели</label>
                <p class="field-desc">Сотрудники, которые следят за ходом исполнения договора, но не несут ответственности за результат.</p>
                <div class="autocomplete">
                  <input
                    v-model="obsQuery"
                    class="field-input"
                    placeholder="Добавить наблюдателя..."
                    @focus="obsOpen = true"
                    @blur="setTimeout(() => obsOpen = false, 160)"
                    @input="obsOpen = true"
                  />
                  <div v-if="obsOpen" class="ac-drop">
                    <div v-for="u in filterUsers(obsQuery)" :key="u.id" class="ac-item" @mousedown.prevent="addObs(u)">{{ uName(u) }}</div>
                    <div v-if="!filterUsers(obsQuery).length" class="ac-empty">Не найдено</div>
                  </div>
                </div>
                <div v-if="observers.length" class="persons-list">
                  <div v-for="u in observers" :key="u.id" class="person-row">
                    <i class="fas fa-eye"></i>
                    <span>{{ uName(u) }}</span>
                    <span class="role-badge">Наблюдатель</span>
                    <button @click="removeObs(u.id)"><i class="fas fa-times"></i></button>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <!-- Step 8 -->
          <template v-else-if="currentStep === 7">
            <p class="step-desc">{{ STEPS[7].desc }}</p>

            <div class="form-card">
              <div class="field-group field-group--last">
                <label class="field-label">Примечание</label>
                <p class="field-desc">Свободное поле для любых заметок, которые важно зафиксировать вместе с договором. Не отображается в реестре — только внутри карточки.</p>
                <textarea v-model="note" class="field-textarea" rows="8" placeholder="Дополнительная информация, особые условия, внутренние пометки..."></textarea>
              </div>
            </div>
          </template>

        </div><!-- /step-inner -->
      </main>
    </div>
  </div>
</template>

<style scoped>
.page-wrap {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

/* ── Layout ── */
.create-layout {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* ── Steps sidebar ── */
.steps-sidebar {
  width: 256px;
  flex-shrink: 0;
  background: var(--bg-surface);
  border-right: 1px solid var(--border-light);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-top {
  padding: 16px 16px 14px;
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
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
  margin-bottom: 10px;
}
.back-btn:hover { color: var(--text-primary); }

.sidebar-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 10px;
}

.sidebar-progress {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-bottom: 6px;
}

.progress-bar {
  height: 4px;
  background: var(--bg-subtle);
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--brand-primary);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.steps-nav {
  flex: 1;
  overflow-y: auto;
  padding: 10px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.step-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-tertiary);
  font-size: 13px;
  font-weight: 500;
  padding: 8px 10px;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s, color 0.12s;
}
.step-btn:hover { background: var(--bg-subtle); color: var(--text-primary); }
.step-btn.active { background: var(--brand-light); color: var(--brand-primary); font-weight: 600; }
.step-btn.done { color: var(--text-primary); }

.step-num {
  width: 24px; height: 24px;
  border-radius: 50%;
  background: var(--bg-subtle);
  color: var(--text-tertiary);
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: 1.5px solid var(--border-light);
  transition: all 0.15s;
}
.step-btn.active .step-num  { background: var(--brand-primary); color: #fff; border-color: var(--brand-primary); }
.step-btn.done .step-num    { background: #16a34a; color: #fff; border-color: #16a34a; }

.step-lbl { line-height: 1.2; }

.sidebar-bottom {
  padding: 12px 14px 16px;
  border-top: 1px solid var(--border-light);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hint-text {
  font-size: 11px;
  color: var(--text-tertiary);
  display: flex;
  align-items: center;
  gap: 5px;
}

.submit-error { font-size: 12px; color: #ef4444; }

.btn-create {
  width: 100%; height: 40px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--brand-primary);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.btn-create:hover:not(:disabled) { opacity: 0.9; }
.btn-create:disabled { opacity: 0.4; cursor: not-allowed; }

/* ── Step body ── */
.step-body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: var(--bg-page);
}

/* ── Sticky top bar ── */
.step-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 32px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
  gap: 12px;
}

.step-topbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.topbar-nav-btn {
  width: 34px; height: 34px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--bg-subtle);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px;
  flex-shrink: 0;
}
.topbar-nav-btn:hover { background: var(--bg-page); color: var(--text-primary); }

.step-topbar-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.step-topbar-num {
  font-size: 11px;
  color: var(--text-tertiary);
  font-weight: 500;
}

.step-topbar-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.topbar-next-btn {
  height: 36px;
  padding: 0 18px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--brand-primary);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 7px;
}
.topbar-next-btn:hover { opacity: 0.9; }

/* ── Inner scroll area ── */
.step-inner {
  flex: 1;
  overflow-y: auto;
  padding: 28px 32px 40px;
}

.step-desc {
  margin: 0 0 24px;
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.65;
  max-width: 640px;
}

/* ── Form card ── */
.form-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  padding: 24px;
  max-width: 640px;
  margin-bottom: 16px;
  box-shadow: var(--shadow-sm);
}

.field-divider {
  height: 1px;
  background: var(--border-light);
  margin: 20px 0;
}

/* ── Fields ── */
.field-group {
  margin-bottom: 20px;
  position: relative;
}
.field-group--last { margin-bottom: 0; }

.field-label {
  display: block;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 3px;
}
.required-label::after { content: ' *'; color: #ef4444; }

.field-desc {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--text-tertiary);
  line-height: 1.5;
}

.field-input {
  width: 100%;
  height: 40px;
  border: 1.5px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: 0 12px;
  font-size: 14px;
  color: var(--text-primary);
  background: var(--bg-subtle);
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s, background 0.15s;
}
.field-input:focus { border-color: var(--brand-primary); background: var(--bg-surface); }
.field-input.has-value { border-color: #16a34a; background: var(--bg-surface); }
.field-input::placeholder { color: var(--text-tertiary); }

.field-textarea {
  width: 100%;
  border: 1.5px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  font-size: 14px;
  color: var(--text-primary);
  background: var(--bg-subtle);
  outline: none;
  box-sizing: border-box;
  resize: vertical;
  font-family: inherit;
  line-height: 1.6;
  transition: border-color 0.15s;
}
.field-textarea:focus { border-color: var(--brand-primary); background: var(--bg-surface); }
.field-textarea::placeholder { color: var(--text-tertiary); }

.readonly-field {
  padding: 10px 12px;
  background: var(--bg-subtle);
  border: 1.5px solid var(--border-light);
  border-radius: var(--radius-md);
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.4;
}

.fields-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px 20px;
}

/* ── Autocomplete ── */
.autocomplete { position: relative; }

.ac-drop {
  position: absolute;
  top: calc(100% + 4px);
  left: 0; right: 0;
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  box-shadow: 0 8px 24px rgba(0,0,0,0.1);
  z-index: 100;
  max-height: 260px;
  overflow-y: auto;
}

.ac-create {
  padding: 10px 12px;
  font-size: 13px;
  color: var(--brand-primary);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 7px;
  font-weight: 600;
  border-bottom: 1px solid var(--border-light);
}
.ac-create:hover { background: var(--brand-light); }

.ac-item {
  padding: 9px 12px;
  font-size: 13px;
  color: var(--text-primary);
  cursor: pointer;
}
.ac-item:hover  { background: var(--bg-subtle); }
.ac-item--sel   { background: var(--brand-light); color: var(--brand-primary); font-weight: 600; }
.ac-item--cp    { display: flex; align-items: center; gap: 8px; }
.cp-name        { flex: 1; }
.ac-empty       { padding: 14px; text-align: center; color: var(--text-tertiary); font-size: 13px; }

.ac-footer-create {
  padding: 9px 12px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 7px;
  border-top: 1px solid var(--border-light);
  background: var(--bg-subtle);
}
.ac-footer-create:hover { color: var(--brand-primary); background: var(--brand-light); }

/* ── Selected rows ── */
.value-badge {
  margin-top: 8px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  background: var(--brand-light);
  color: var(--brand-primary);
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 600;
}

.selected-row {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: var(--radius-md);
  font-size: 13px;
  color: var(--text-primary);
}

.clear-btn {
  margin-left: auto;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 2px 4px;
  font-size: 12px;
  flex-shrink: 0;
}
.clear-btn:hover { color: #ef4444; }

.internal-badge {
  padding: 1px 7px;
  border-radius: 10px;
  background: #dbeafe;
  color: #1d4ed8;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}

/* ── Parties ── */
.party-card { margin-bottom: 12px; }

.party-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}
.party-role-wrap { flex: 1; }

.party-role-fixed {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}

.party-role-input {
  width: 100%;
  height: 34px;
  border: 1.5px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: 0 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  background: var(--bg-subtle);
  outline: none;
  box-sizing: border-box;
}
.party-role-input:focus { border-color: var(--brand-primary); }

.party-rm-btn {
  width: 32px; height: 32px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--bg-subtle);
  color: var(--text-tertiary);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px;
}
.party-rm-btn:hover { background: #fef2f2; color: #ef4444; border-color: #ef4444; }

.btn-add-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 14px;
  border: 1.5px dashed var(--border-light);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
}
.btn-add-item:hover { border-color: var(--brand-primary); color: var(--brand-primary); background: var(--brand-light); }

/* ── Tags ── */
.tags-wrap {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px 5px 10px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  font-size: 13px;
  color: var(--text-primary);
}
.tag--work {
  background: #eff6ff;
  border-color: #bfdbfe;
  color: #1e40af;
}
.tag button {
  border: none; background: transparent;
  color: var(--text-tertiary); cursor: pointer;
  padding: 0; font-size: 11px;
}
.tag button:hover { color: #ef4444; }

.empty-notice {
  margin-top: 10px;
  font-size: 13px;
  color: #d97706;
  display: flex;
  align-items: center;
  gap: 6px;
}

/* ── Amount ── */
.amount-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
.amount-input {
  padding-right: 36px;
  font-size: 22px;
  font-weight: 700;
  height: 52px;
  font-family: 'JetBrains Mono', monospace;
  letter-spacing: 0.02em;
}
.amount-sym {
  position: absolute;
  right: 12px;
  font-size: 20px;
  font-weight: 700;
  color: var(--text-secondary);
  pointer-events: none;
}
.amount-preview {
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-tertiary);
}

/* ── Persons ── */
.persons-list {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.person-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  font-size: 13px;
  color: var(--text-primary);
}
.person-row button {
  margin-left: auto;
  border: none; background: transparent;
  color: var(--text-tertiary); cursor: pointer; font-size: 12px;
}
.person-row button:hover { color: #ef4444; }

.role-badge {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  background: var(--bg-page);
  color: var(--text-tertiary);
  border: 1px solid var(--border-light);
}
.role-badge--exec {
  background: var(--brand-light);
  color: var(--brand-primary);
  border-color: transparent;
}
</style>
