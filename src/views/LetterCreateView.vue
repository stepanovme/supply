<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import TopNav from '../components/layout/TopNav.vue'
import { mainNavLinks } from '../constants/mainNav'

const router   = useRouter()
const route    = useRoute()
const navLinks = mainNavLinks

// ── Steps ─────────────────────────────────────────────────
const currentStep = ref(0)
const STEPS = [
  { label: 'Тип и тема',      desc: 'Выберите тип письма и укажите его тему — это основа идентификации в реестре.' },
  { label: 'Стороны',         desc: 'Укажите организацию-отправителя и организацию-получателя письма.' },
  { label: 'Объект и проект', desc: 'Выберите объект и/или проект, к которым относится письмо.' },
  { label: 'Ответственные',   desc: 'Назначьте ответственного, исполнителей и наблюдателей по письму.' },
  { label: 'Дата и номер',    desc: 'Дата и номер письма. Номер исходящих формируется автоматически из префикса организации.' },
  { label: 'Дополнительно',   desc: 'Любые дополнительные пометки, которые важно зафиксировать вместе с письмом.' },
]

// ── API lists ─────────────────────────────────────────────
const counterparties = ref([])
const objectsList    = ref([])
const projectsList   = ref([])
const usersList      = ref([])

// ── Step 1: Тип и тема ────────────────────────────────────
const letterType = ref(route.query.type === 'incoming' ? 'incoming' : 'outgoing')
const letterName = ref('')

// ── Step 2: Стороны ───────────────────────────────────────
const fromCp    = ref(null)
const fromQuery = ref('')
const fromOpen  = ref(false)
const toCp      = ref(null)
const toQuery   = ref('')
const toOpen    = ref(false)

const filterCPs = (q) => {
  const query = (q || '').trim().toLowerCase()
  if (!query) return counterparties.value.slice(0, 25)
  return counterparties.value.filter(c =>
    c.short_name?.toLowerCase().includes(query) || c.full_name?.toLowerCase().includes(query)
  )
}
const selectFrom = (cp) => { fromCp.value = cp; fromQuery.value = cp.short_name; fromOpen.value = false }
const clearFrom  = ()   => { fromCp.value = null; fromQuery.value = '' }
const selectTo   = (cp) => { toCp.value = cp; toQuery.value = cp.short_name; toOpen.value = false }
const clearTo    = ()   => { toCp.value = null; toQuery.value = '' }
const goCreateCompany = () => window.open('/organizations/create', '_blank')

// ── Step 3: Объект ────────────────────────────────────────
const selectedObject = ref(null)
const objectQuery    = ref('')
const objectOpen     = ref(false)

const filteredObjects = computed(() => {
  const q = objectQuery.value.trim().toLowerCase()
  const base = objectsList.value.filter(o => o.is_active !== false)
  return q ? base.filter(o => o.short_name?.toLowerCase().includes(q)) : base.slice(0, 25)
})
const hasExactObject = computed(() =>
  objectsList.value.some(o => o.short_name?.toLowerCase() === objectQuery.value.trim().toLowerCase())
)
const selectObject  = (obj) => { selectedObject.value = obj; objectQuery.value = obj.short_name; objectOpen.value = false }
const onObjectInput = ()    => { selectedObject.value = null; objectOpen.value = true }

// Проекты
const selectedProjects = ref([])
const projectQuery     = ref('')
const projectOpen      = ref(false)

const filteredProjects = computed(() => {
  const q      = projectQuery.value.trim().toLowerCase()
  const selIds = new Set(selectedProjects.value.map(p => p.id))
  const list   = projectsList.value.filter(p => !selIds.has(p.id))
  if (!q) return list.slice(0, 25)
  return list.filter(p => p.name.toLowerCase().includes(q))
})
const addProject    = (proj) => { selectedProjects.value.push(proj); projectQuery.value = ''; projectOpen.value = false }
const removeProject = (id)   => { selectedProjects.value = selectedProjects.value.filter(p => p.id !== id) }
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
  } catch {}
}

// ── Step 4: Ответственные ─────────────────────────────────
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
    return !q || uName(u).toLowerCase().includes(q) || (u.username || '').toLowerCase().includes(q)
  }).slice(0, 20)
}

const selectExecutor = (u)  => { executor.value = u; executorQuery.value = uName(u); executorOpen.value = false }
const clearExecutor  = ()   => { executor.value = null; executorQuery.value = '' }
const onExInput      = ()   => { executor.value = null; executorOpen.value = true }
const addCoEx        = (u)  => { coExecutors.value.push(u); coExQuery.value = ''; coExOpen.value = false }
const removeCoEx     = (id) => { coExecutors.value = coExecutors.value.filter(u => u.id !== id) }
const addObs         = (u)  => { observers.value.push(u); obsQuery.value = ''; obsOpen.value = false }
const removeObs      = (id) => { observers.value = observers.value.filter(u => u.id !== id) }

// ── Step 5: Реквизиты ─────────────────────────────────────
const letterDate = ref('')
const letterNum  = ref('')

const buildLetterNum = async () => {
  if (letterType.value === 'incoming') { letterNum.value = ''; return }
  const prefix = (fromCp.value?.is_internal && fromCp.value?.contract_prefix)
    ? fromCp.value.contract_prefix + '-' : ''
  try {
    const r = await fetch('/apisup/supply/letters/my?type=outgoing', { credentials: 'include' })
    if (r.ok) {
      const list = await r.json()
      const maxNum = list.reduce((max, l) => {
        const n = parseInt((l.num || l.internal_num || '').replace(/^[^0-9]*/, ''), 10)
        return n > max ? n : max
      }, 0)
      letterNum.value = prefix + (maxNum + 1)
    } else { letterNum.value = prefix + '1' }
  } catch { letterNum.value = prefix + '1' }
}

watch([letterType, fromCp], buildLetterNum)

// ── Step 6: Примечание ────────────────────────────────────
const letterComment = ref('')

// ── Step completion ───────────────────────────────────────
const stepDone = computed(() => [
  !!(letterType.value && letterName.value.trim()),
  !!(fromCp.value && toCp.value),
  !!(selectedObject.value || selectedProjects.value.length),
  !!executor.value,
  !!(letterDate.value || letterNum.value.trim()),
  !!letterComment.value.trim(),
])

const stepDoneDisplay = computed(() => stepDone.value)

const canCreate = computed(() => stepDone.value[0] && stepDone.value[1] && stepDone.value[3])

// ── Outside click ─────────────────────────────────────────
const closeAllDropdowns = (e) => {
  if (e.target.closest('.autocomplete')) return
  fromOpen.value = false; toOpen.value = false; objectOpen.value = false; projectOpen.value = false
  executorOpen.value = false; coExOpen.value = false; obsOpen.value = false
}

// ── Submit ────────────────────────────────────────────────
const saving      = ref(false)
const submitError = ref('')

const postJSON = (url, body) => fetch(url, {
  method: 'POST', credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

const save = async () => {
  if (!canCreate.value) return
  saving.value = true
  submitError.value = ''
  try {
    const r = await postJSON('/apisup/supply/letters', {
      num:      letterNum.value.trim() || null,
      name:     letterName.value.trim(),
      from_to:  fromCp.value.id,
      where_to: toCp.value.id,
      type:     letterType.value,
      comment:  letterComment.value.trim() || null,
    })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const letter = await r.json()
    const lid = letter.id

    const extra = []
    if (selectedObject.value) {
      extra.push(postJSON('/apisup/supply/letter-objects', {
        letter_id: lid, object_id: selectedObject.value.id, object_type: 'object',
      }))
    }
    for (const proj of selectedProjects.value) {
      extra.push(postJSON('/apisup/supply/letter-objects', {
        letter_id: lid, object_id: proj.id, object_type: 'object_levels_id',
      }))
    }
    if (executor.value) {
      extra.push(postJSON('/apisup/supply/letter-user-roles', { letter_id: lid, user_id: executor.value.id, role: 'executor' }))
    }
    for (const u of coExecutors.value) {
      extra.push(postJSON('/apisup/supply/letter-user-roles', { letter_id: lid, user_id: u.id, role: 'co-executor' }))
    }
    for (const u of observers.value) {
      extra.push(postJSON('/apisup/supply/letter-user-roles', { letter_id: lid, user_id: u.id, role: 'observer' }))
    }
    await Promise.all(extra)
    router.push(`/documents/letters/${lid}`)
  } catch (e) {
    submitError.value = e.message || 'Не удалось создать письмо'
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  const [cps, objs, projs, users] = await Promise.all([
    fetch('/apiref/ref/counterparties', { credentials: 'include' }).then(r => r.ok ? r.json() : []),
    fetch('/apiref/ref/objects',        { credentials: 'include' }).then(r => r.ok ? r.json() : []),
    fetch('/apiref/ref/object-levels',  { credentials: 'include' }).then(r => r.ok ? r.json() : []),
    fetch('/api/as/users/all',          { credentials: 'include' }).then(r => r.ok ? r.json() : []),
  ])
  counterparties.value = cps
  objectsList.value    = objs
  projectsList.value   = projs
  usersList.value      = users
  try {
    const me = await fetch('/api/as/users/me', { credentials: 'include' }).then(r => r.ok ? r.json() : null)
    if (me?.id && !executor.value) { executor.value = me; executorQuery.value = uName(me) }
  } catch {}
  window.addEventListener('focus', async () => {
    const r = await fetch('/apiref/ref/counterparties', { credentials: 'include' })
    if (r.ok) counterparties.value = await r.json()
  })
  document.addEventListener('mousedown', closeAllDropdowns)
})
onUnmounted(() => { document.removeEventListener('mousedown', closeAllDropdowns) })
</script>

<template>
  <div class="page-wrap">
    <TopNav :links="navLinks" />

    <div class="create-layout">

      <!-- ── Sidebar ── -->
      <aside class="steps-sidebar">
        <div class="sidebar-top">
          <button class="back-btn" @click="router.push('/documents')">
            <i class="fas fa-arrow-left"></i> Назад
          </button>
          <div class="sidebar-title">Новое письмо</div>
          <div class="sidebar-progress">{{ stepDone.filter(Boolean).length }} из {{ STEPS.length }} шагов</div>
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
            <i class="fas fa-info-circle"></i> Заполните обязательные поля
          </div>
          <div v-if="submitError" class="submit-error">{{ submitError }}</div>
          <button class="btn-create" :disabled="!canCreate || saving" @click="save">
            <i class="fas fa-check-circle"></i>
            {{ saving ? 'Создаём...' : 'Создать письмо' }}
          </button>
        </div>
      </aside>

      <!-- ── Step body ── -->
      <main class="step-body">

        <!-- Topbar -->
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

        <div class="step-inner">

          <!-- ── Шаг 1: Тип и тема ── -->
          <template v-if="currentStep === 0">
            <p class="step-desc">{{ STEPS[0].desc }}</p>
            <div class="form-card">
              <div class="field-group">
                <label class="field-label required-label">Тип письма</label>
                <p class="field-desc">Определяет направление письма — исходящее отправляется от вашей организации, входящее получено от контрагента.</p>
                <div class="type-tabs">
                  <button class="type-tab" :class="{ active: letterType === 'outgoing' }" type="button" @click="letterType = 'outgoing'">
                    <i class="fas fa-paper-plane"></i> Исходящее
                  </button>
                  <button class="type-tab" :class="{ active: letterType === 'incoming' }" type="button" @click="letterType = 'incoming'">
                    <i class="fas fa-inbox"></i> Входящее
                  </button>
                </div>
              </div>

              <div class="field-divider"></div>

              <div class="field-group field-group--last">
                <label class="field-label required-label">Тема письма</label>
                <p class="field-desc">Краткое содержание или назначение письма. Используется в реестре для идентификации документа.</p>
                <textarea
                  v-model="letterName"
                  class="field-textarea" rows="3"
                  placeholder="Укажите тему письма..."
                ></textarea>
              </div>
            </div>
          </template>

          <!-- ── Шаг 2: Стороны ── -->
          <template v-else-if="currentStep === 1">
            <p class="step-desc">{{ STEPS[1].desc }}</p>

            <!-- От кого -->
            <div class="form-card party-card">
              <div class="party-head">
                <span class="party-role-fixed required-label">От кого</span>
              </div>
              <p class="field-desc" style="margin-bottom:10px">Организация или лицо, от имени которого отправляется письмо.</p>
              <div class="autocomplete">
                <input v-model="fromQuery" class="field-input" :class="{ 'has-value': fromCp }"
                  placeholder="Поиск по наименованию организации..."
                  @focus="fromOpen = true" @blur="setTimeout(() => fromOpen = false, 160)"
                  @input="() => { fromCp = null; fromOpen = true }" />
                <div v-if="fromOpen" class="ac-drop">
                  <div v-for="cp in filterCPs(fromQuery)" :key="cp.id"
                    class="ac-item ac-item--cp" :class="{ 'ac-item--sel': fromCp?.id === cp.id }"
                    @mousedown.prevent="selectFrom(cp)">
                    <span class="cp-name">{{ cp.short_name }}</span>
                    <span v-if="cp.is_internal" class="internal-badge">Наш</span>
                  </div>
                  <div v-if="!filterCPs(fromQuery).length" class="ac-empty">Организация не найдена</div>
                  <div class="ac-footer-create" @mousedown.prevent="goCreateCompany">
                    <i class="fas fa-building"></i> Создать новую организацию
                  </div>
                </div>
              </div>
              <div v-if="fromCp" class="selected-row">
                <i class="fas fa-building" style="color:var(--brand-primary)"></i>
                <span>{{ fromCp.short_name }}</span>
                <span v-if="fromCp.is_internal" class="internal-badge">Наш</span>
                <button class="clear-btn" @click="clearFrom"><i class="fas fa-times"></i></button>
              </div>
            </div>

            <!-- Кому -->
            <div class="form-card party-card">
              <div class="party-head">
                <span class="party-role-fixed required-label">Кому</span>
              </div>
              <p class="field-desc" style="margin-bottom:10px">Организация или лицо, которому адресовано письмо.</p>
              <div class="autocomplete">
                <input v-model="toQuery" class="field-input" :class="{ 'has-value': toCp }"
                  placeholder="Поиск по наименованию организации..."
                  @focus="toOpen = true" @blur="setTimeout(() => toOpen = false, 160)"
                  @input="() => { toCp = null; toOpen = true }" />
                <div v-if="toOpen" class="ac-drop">
                  <div v-for="cp in filterCPs(toQuery)" :key="cp.id"
                    class="ac-item ac-item--cp" :class="{ 'ac-item--sel': toCp?.id === cp.id }"
                    @mousedown.prevent="selectTo(cp)">
                    <span class="cp-name">{{ cp.short_name }}</span>
                    <span v-if="cp.is_internal" class="internal-badge">Наш</span>
                  </div>
                  <div v-if="!filterCPs(toQuery).length" class="ac-empty">Организация не найдена</div>
                  <div class="ac-footer-create" @mousedown.prevent="goCreateCompany">
                    <i class="fas fa-building"></i> Создать новую организацию
                  </div>
                </div>
              </div>
              <div v-if="toCp" class="selected-row">
                <i class="fas fa-building" style="color:var(--brand-primary)"></i>
                <span>{{ toCp.short_name }}</span>
                <span v-if="toCp.is_internal" class="internal-badge">Наш</span>
                <button class="clear-btn" @click="clearTo"><i class="fas fa-times"></i></button>
              </div>
            </div>
          </template>

          <!-- ── Шаг 3: Объект ── -->
          <template v-else-if="currentStep === 2">
            <p class="step-desc">{{ STEPS[2].desc }}</p>
            <div class="form-card">
              <div class="field-group field-group--last">
                <label class="field-label">Объект</label>
                <p class="field-desc">Выберите объект из справочника или создайте новый. Объект — это место или адрес, к которому относится письмо.</p>
                <div class="autocomplete">
                  <input v-model="objectQuery" class="field-input" :class="{ 'has-value': selectedObject }"
                    placeholder="Поиск объекта..."
                    @focus="objectOpen = true" @blur="setTimeout(() => objectOpen = false, 160)"
                    @input="onObjectInput" />
                  <div v-if="objectOpen" class="ac-drop">
                    <div v-if="objectQuery.trim() && !hasExactObject" class="ac-create" @mousedown.prevent="createObject">
                      <i class="fas fa-plus-circle"></i> Создать объект: «{{ objectQuery.trim() }}»
                    </div>
                    <div v-for="obj in filteredObjects" :key="obj.id"
                      class="ac-item" :class="{ 'ac-item--sel': selectedObject?.id === obj.id }"
                      @mousedown.prevent="selectObject(obj)">{{ obj.short_name }}</div>
                    <div v-if="!filteredObjects.length && !objectQuery.trim()" class="ac-empty">Нет объектов</div>
                  </div>
                </div>
                <div v-if="selectedObject" class="selected-row">
                  <i class="fas fa-map-marker-alt" style="color:var(--brand-primary)"></i>
                  <span>{{ selectedObject.short_name }}</span>
                  <button class="clear-btn" @click="() => { selectedObject = null; objectQuery = '' }"><i class="fas fa-times"></i></button>
                </div>
              </div>

              <div class="field-divider"></div>

              <div class="field-group field-group--last">
                <label class="field-label">Проекты</label>
                <p class="field-desc">Свяжите письмо с одним или несколькими внутренними проектами для удобной навигации.</p>
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
                    <div v-for="proj in filteredProjects" :key="proj.id"
                      class="ac-item" @mousedown.prevent="addProject(proj)">{{ proj.name }}</div>
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

          <!-- ── Шаг 4: Ответственные ── -->
          <template v-else-if="currentStep === 3">
            <p class="step-desc">{{ STEPS[3].desc }}</p>
            <div class="form-card">

              <!-- Ответственный -->
              <div class="field-group">
                <label class="field-label required-label">Ответственный</label>
                <p class="field-desc">Сотрудник, несущий персональную ответственность за ведение письма. По умолчанию — вы.</p>
                <div class="autocomplete">
                  <input v-model="executorQuery" class="field-input" :class="{ 'has-value': executor }"
                    placeholder="Поиск пользователя..."
                    @focus="executorOpen = true" @blur="setTimeout(() => executorOpen = false, 160)"
                    @input="onExInput" />
                  <div v-if="executorOpen" class="ac-drop">
                    <div v-for="u in filterUsers(executorQuery, executor?.id)" :key="u.id"
                      class="ac-item" @mousedown.prevent="selectExecutor(u)">{{ uName(u) }}</div>
                    <div v-if="!filterUsers(executorQuery, executor?.id).length" class="ac-empty">Не найдено</div>
                  </div>
                </div>
                <div v-if="executor" class="selected-row">
                  <i class="fas fa-user-circle" style="color:var(--brand-primary)"></i>
                  <span>{{ uName(executor) }}</span>
                  <span class="role-badge role-badge--exec">Ответственный</span>
                  <button class="clear-btn" @click="clearExecutor"><i class="fas fa-times"></i></button>
                </div>
              </div>

              <div class="field-divider"></div>

              <!-- Исполнители -->
              <div class="field-group">
                <label class="field-label">Исполнители</label>
                <p class="field-desc">Сотрудники, участвующие в работе по письму. Может быть несколько.</p>
                <div class="autocomplete">
                  <input v-model="coExQuery" class="field-input"
                    placeholder="Добавить исполнителя..."
                    @focus="coExOpen = true" @blur="setTimeout(() => coExOpen = false, 160)"
                    @input="coExOpen = true" />
                  <div v-if="coExOpen" class="ac-drop">
                    <div v-for="u in filterUsers(coExQuery)" :key="u.id"
                      class="ac-item" @mousedown.prevent="addCoEx(u)">{{ uName(u) }}</div>
                    <div v-if="!filterUsers(coExQuery).length" class="ac-empty">Не найдено</div>
                  </div>
                </div>
                <div v-if="coExecutors.length" class="persons-list">
                  <div v-for="u in coExecutors" :key="u.id" class="person-row">
                    <i class="fas fa-user"></i>
                    <span>{{ uName(u) }}</span>
                    <span class="role-badge">Исполнитель</span>
                    <button @click="removeCoEx(u.id)"><i class="fas fa-times"></i></button>
                  </div>
                </div>
              </div>

              <div class="field-divider"></div>

              <!-- Наблюдатели -->
              <div class="field-group field-group--last">
                <label class="field-label">Наблюдатели</label>
                <p class="field-desc">Сотрудники, которые следят за ходом исполнения, но не несут ответственности.</p>
                <div class="autocomplete">
                  <input v-model="obsQuery" class="field-input"
                    placeholder="Добавить наблюдателя..."
                    @focus="obsOpen = true" @blur="setTimeout(() => obsOpen = false, 160)"
                    @input="obsOpen = true" />
                  <div v-if="obsOpen" class="ac-drop">
                    <div v-for="u in filterUsers(obsQuery)" :key="u.id"
                      class="ac-item" @mousedown.prevent="addObs(u)">{{ uName(u) }}</div>
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

          <!-- ── Шаг 5: Реквизиты ── -->
          <template v-else-if="currentStep === 4">
            <p class="step-desc">{{ STEPS[4].desc }}</p>
            <div class="form-card">
              <div class="fields-grid-2">
                <div class="field-group">
                  <label class="field-label">Дата письма</label>
                  <p class="field-desc">Дата составления или получения письма. Используется для генерации номера.</p>
                  <input v-model="letterDate" type="date" class="field-input" :class="{ 'has-value': letterDate }" />
                </div>
                <div class="field-group">
                  <label class="field-label">Номер письма</label>
                  <p class="field-desc">Для исходящих генерируется автоматически из префикса организации «От кого». Для входящих вводится вручную.</p>
                  <input v-model="letterNum" class="field-input" :class="{ 'has-value': letterNum.trim() }"
                    placeholder="Автоматически..." />
                </div>
              </div>
            </div>
          </template>

          <!-- ── Шаг 6: Дополнительно ── -->
          <template v-else-if="currentStep === 5">
            <p class="step-desc">{{ STEPS[5].desc }}</p>
            <div class="form-card">
              <div class="field-group field-group--last">
                <label class="field-label">Примечание</label>
                <p class="field-desc">Свободное поле для заметок. Не отображается в реестре — только внутри карточки письма.</p>
                <textarea v-model="letterComment" class="field-textarea" rows="8"
                  placeholder="Дополнительная информация, внутренние пометки..."></textarea>
              </div>
            </div>
          </template>

        </div><!-- /step-inner -->
      </main>

    </div>
  </div>
</template>

<style scoped>
.page-wrap { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

.create-layout { display: flex; flex: 1; overflow: hidden; }

/* ── Sidebar ── */
.steps-sidebar {
  width: 256px; flex-shrink: 0;
  background: var(--bg-surface);
  border-right: 1px solid var(--border-light);
  display: flex; flex-direction: column; overflow: hidden;
}

.sidebar-top {
  padding: 16px 16px 14px;
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}

.back-btn {
  display: inline-flex; align-items: center; gap: 6px;
  border: none; background: transparent; color: var(--text-tertiary);
  font-size: 12px; cursor: pointer; padding: 0; margin-bottom: 10px;
}
.back-btn:hover { color: var(--text-primary); }

.sidebar-title { font-size: 15px; font-weight: 700; color: var(--text-primary); margin-bottom: 10px; }

.sidebar-progress { font-size: 11px; color: var(--text-tertiary); margin-bottom: 6px; }

.progress-bar { height: 4px; background: var(--bg-subtle); border-radius: 4px; overflow: hidden; }
.progress-fill { height: 100%; background: var(--brand-primary); border-radius: 4px; transition: width 0.3s ease; }

.steps-nav {
  flex: 1; overflow-y: auto; padding: 10px 8px;
  display: flex; flex-direction: column; gap: 2px;
}

.step-btn {
  display: flex; align-items: center; gap: 10px;
  width: 100%; border: none; border-radius: var(--radius-md);
  background: transparent; color: var(--text-tertiary);
  font-size: 13px; font-weight: 500; padding: 8px 10px;
  cursor: pointer; text-align: left; transition: background 0.12s, color 0.12s;
}
.step-btn:hover  { background: var(--bg-subtle); color: var(--text-primary); }
.step-btn.active { background: var(--brand-light); color: var(--brand-primary); font-weight: 600; }
.step-btn.done   { color: var(--text-primary); }

.step-num {
  width: 24px; height: 24px; border-radius: 50%;
  background: var(--bg-subtle); color: var(--text-tertiary);
  font-size: 11px; font-weight: 700;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  border: 1.5px solid var(--border-light); transition: all 0.15s;
}
.step-btn.active .step-num { background: var(--brand-primary); color: #fff; border-color: var(--brand-primary); }
.step-btn.done .step-num   { background: #16a34a; color: #fff; border-color: #16a34a; }
.step-lbl { line-height: 1.2; }

.sidebar-bottom {
  padding: 12px 14px 16px;
  border-top: 1px solid var(--border-light);
  flex-shrink: 0; display: flex; flex-direction: column; gap: 8px;
}

.hint-text { font-size: 11px; color: var(--text-tertiary); display: flex; align-items: center; gap: 5px; }
.submit-error { font-size: 12px; color: #ef4444; }

.btn-create {
  width: 100%; height: 40px; border: none; border-radius: var(--radius-md);
  background: var(--brand-primary); color: #fff;
  font-size: 13px; font-weight: 600; cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 8px;
}
.btn-create:hover:not(:disabled) { opacity: 0.9; }
.btn-create:disabled { opacity: 0.4; cursor: not-allowed; }

/* ── Step body ── */
.step-body { flex: 1; overflow: hidden; display: flex; flex-direction: column; background: var(--bg-page); }

.step-topbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 32px;
  background: var(--bg-surface); border-bottom: 1px solid var(--border-light);
  flex-shrink: 0; gap: 12px;
}
.step-topbar-left { display: flex; align-items: center; gap: 12px; }

.topbar-nav-btn {
  width: 34px; height: 34px;
  border: 1px solid var(--border-light); border-radius: var(--radius-md);
  background: var(--bg-subtle); color: var(--text-secondary);
  cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 13px; flex-shrink: 0;
}
.topbar-nav-btn:hover { background: var(--bg-page); color: var(--text-primary); }

.step-topbar-info { display: flex; flex-direction: column; gap: 1px; }
.step-topbar-num  { font-size: 11px; color: var(--text-tertiary); font-weight: 500; }
.step-topbar-name { font-size: 15px; font-weight: 700; color: var(--text-primary); }

.topbar-next-btn {
  height: 36px; padding: 0 18px; border: none; border-radius: var(--radius-md);
  background: var(--brand-primary); color: #fff;
  font-size: 13px; font-weight: 600; cursor: pointer;
  display: flex; align-items: center; gap: 7px;
}
.topbar-next-btn:hover { opacity: 0.9; }

.step-inner { flex: 1; overflow-y: auto; padding: 28px 32px 40px; display: flex; flex-direction: column; gap: 16px; }

.step-desc { margin: 0 0 4px; font-size: 14px; color: var(--text-secondary); line-height: 1.65; max-width: 640px; }

/* ── Form card ── */
.form-card {
  background: var(--bg-surface); border: 1px solid var(--border-light);
  border-radius: var(--radius-lg); padding: 20px 24px;
}

.field-group { margin-bottom: 20px; }
.field-group--last { margin-bottom: 0; }
.field-divider { height: 1px; background: var(--border-light); margin: 16px 0; }

.fields-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px 20px; }

.field-label { display: block; font-size: 13px; font-weight: 600; color: var(--text-secondary); margin-bottom: 4px; }
.required-label::after { content: ' *'; color: #ef4444; }

.field-desc { font-size: 12px; color: var(--text-tertiary); margin: 0 0 8px; line-height: 1.5; }

.field-input {
  width: 100%; padding: 9px 12px;
  border: 1.5px solid var(--border-light); border-radius: var(--radius-md);
  background: var(--bg-subtle); color: var(--text-primary);
  font-size: 14px; outline: none;
  transition: border-color 0.15s, background 0.15s; box-sizing: border-box;
}
.field-input:focus     { border-color: var(--brand-primary); background: var(--bg-surface); }
.field-input.has-value { border-color: #16a34a; background: var(--bg-surface); }
.field-input::placeholder { color: var(--text-tertiary); }

.field-textarea {
  width: 100%; border: 1.5px solid var(--border-light); border-radius: var(--radius-md);
  padding: 10px 12px; font-size: 14px; color: var(--text-primary);
  background: var(--bg-subtle); outline: none; box-sizing: border-box;
  resize: vertical; font-family: inherit; line-height: 1.6; transition: border-color 0.15s;
}
.field-textarea:focus { border-color: var(--brand-primary); background: var(--bg-surface); }
.field-textarea::placeholder { color: var(--text-tertiary); }

/* ── Type tabs ── */
.type-tabs { display: flex; gap: 8px; }
.type-tab {
  display: flex; align-items: center; gap: 7px;
  padding: 8px 16px; border-radius: var(--radius-md);
  border: 1.5px solid var(--border-light); background: var(--bg-subtle);
  color: var(--text-secondary); font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.15s;
}
.type-tab:hover:not(.active) { border-color: var(--brand-primary); color: var(--brand-primary); }
.type-tab.active { border-color: var(--brand-primary); background: var(--brand-light); color: var(--brand-primary); font-weight: 600; }

/* ── Parties ── */
.party-card { }
.party-head { margin-bottom: 4px; }
.party-role-fixed { font-size: 13px; font-weight: 700; color: var(--text-primary); }

/* ── Autocomplete ── */
.autocomplete { position: relative; }
.ac-drop {
  position: absolute; top: calc(100% + 4px); left: 0; right: 0;
  background: var(--bg-surface); border: 1px solid var(--border-light);
  border-radius: var(--radius-md); box-shadow: 0 8px 24px rgba(0,0,0,0.1);
  z-index: 100; max-height: 260px; overflow-y: auto;
}
.ac-create {
  padding: 10px 12px; font-size: 13px; color: var(--brand-primary);
  cursor: pointer; display: flex; align-items: center; gap: 7px; font-weight: 600;
  border-bottom: 1px solid var(--border-light);
}
.ac-create:hover { background: var(--brand-light); }
.ac-item { padding: 9px 12px; font-size: 13px; color: var(--text-primary); cursor: pointer; }
.ac-item:hover  { background: var(--bg-subtle); }
.ac-item--sel   { background: var(--brand-light); color: var(--brand-primary); font-weight: 600; }
.ac-item--cp    { display: flex; align-items: center; gap: 8px; }
.cp-name        { flex: 1; }
.ac-empty       { padding: 14px; text-align: center; color: var(--text-tertiary); font-size: 13px; }
.ac-footer-create {
  padding: 9px 12px; font-size: 12px; color: var(--text-secondary);
  cursor: pointer; display: flex; align-items: center; gap: 7px;
  border-top: 1px solid var(--border-light); background: var(--bg-subtle);
}
.ac-footer-create:hover { color: var(--brand-primary); background: var(--brand-light); }

.internal-badge {
  padding: 1px 7px; border-radius: 10px; background: #dbeafe; color: #1d4ed8;
  font-size: 11px; font-weight: 600; flex-shrink: 0;
}

/* ── Selected row ── */
.selected-row {
  margin-top: 8px; display: flex; align-items: center; gap: 8px;
  padding: 9px 12px; background: #f0fdf4; border: 1px solid #bbf7d0;
  border-radius: var(--radius-md); font-size: 13px; color: var(--text-primary);
}
.clear-btn {
  margin-left: auto; border: none; background: transparent;
  color: var(--text-tertiary); cursor: pointer; padding: 2px 4px; font-size: 12px; flex-shrink: 0;
}
.clear-btn:hover { color: #ef4444; }

/* ── Persons ── */
.persons-list { margin-top: 10px; display: flex; flex-direction: column; gap: 4px; }
.person-row {
  display: flex; align-items: center; gap: 8px;
  padding: 9px 12px; background: var(--bg-subtle);
  border: 1px solid var(--border-light); border-radius: var(--radius-md);
  font-size: 13px; color: var(--text-primary);
}
.person-row button { margin-left: auto; border: none; background: transparent; color: var(--text-tertiary); cursor: pointer; font-size: 12px; }
.person-row button:hover { color: #ef4444; }

.role-badge {
  padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600;
  background: var(--bg-page); color: var(--text-tertiary); border: 1px solid var(--border-light);
}
.role-badge--exec { background: var(--brand-light); color: var(--brand-primary); border-color: transparent; }

.tags-wrap { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px; }
.tag {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 10px; border-radius: 20px;
  background: var(--bg-subtle); border: 1px solid var(--border-light);
  font-size: 12px; font-weight: 500; color: var(--text-primary);
}
.tag button { border: none; background: transparent; color: var(--text-tertiary); cursor: pointer; padding: 0; font-size: 11px; line-height: 1; }
.tag button:hover { color: #ef4444; }
</style>
