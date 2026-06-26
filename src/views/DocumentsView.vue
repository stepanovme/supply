<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import TopNav from '../components/layout/TopNav.vue'
import { mainNavLinks } from '../constants/mainNav'

const router = useRouter()
const navLinks = mainNavLinks
const activeRegistry = ref('contracts')

// ── Registries ────────────────────────────────────────────
const registries = [
  { key: 'contracts', label: 'Договора' },
  { key: 'acts', label: 'Акты' },
  { key: 'letters', label: 'Письма' },
  { key: 'upd', label: 'УПД' },
  { key: 'invoices', label: 'Счета' },
  { key: 'statements', label: 'Выписки' },
]

const settings = [
  { key: 'work-types', label: 'Виды работ' },
  { key: 'doc-types', label: 'Типы договоров' },
]

// ── Contracts ─────────────────────────────────────────────
const contracts        = ref([])
const contractsLoading = ref(false)
const contractsError   = ref('')

const loadContracts = async () => {
  contractsLoading.value = true
  contractsError.value   = ''
  try {
    const res = await fetch('/apisup/supply/contracts/my', { credentials: 'include' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    contracts.value = await res.json()
  } catch {
    contractsError.value = 'Не удалось загрузить список договоров'
  } finally {
    contractsLoading.value = false
  }
}

// ── Helpers ───────────────────────────────────────────────
const formatDate = (value) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('ru-RU')
}

const formatMoney = (value) => {
  if (value == null) return '—'
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) + ' ₽'
}

// ── Work Types ────────────────────────────────────────────
const workTypes = ref([])
const workTypesLoading = ref(false)
const workTypesError = ref('')

const loadWorkTypes = async () => {
  workTypesLoading.value = true
  workTypesError.value = ''
  try {
    const res = await fetch('/apisup/supply/contract-work-types', { credentials: 'include' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    workTypes.value = await res.json()
  } catch (e) {
    workTypesError.value = 'Не удалось загрузить виды работ'
  } finally {
    workTypesLoading.value = false
  }
}

// create
const wtCreateOpen = ref(false)
const wtCreateName = ref('')
const wtCreateError = ref('')
const wtCreateLoading = ref(false)

const openWtCreate = () => { wtCreateName.value = ''; wtCreateError.value = ''; wtCreateOpen.value = true }
const closeWtCreate = () => { wtCreateOpen.value = false }

const submitWtCreate = async () => {
  const name = wtCreateName.value.trim()
  if (!name) { wtCreateError.value = 'Введите название'; return }
  if (workTypes.value.some(w => w.name.trim().toLowerCase() === name.toLowerCase())) {
    wtCreateError.value = 'Вид работ с таким названием уже существует'
    return
  }
  wtCreateLoading.value = true
  wtCreateError.value = ''
  try {
    const res = await fetch('/apisup/supply/contract-work-types', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    closeWtCreate()
    await loadWorkTypes()
  } catch {
    wtCreateError.value = 'Ошибка при создании'
  } finally {
    wtCreateLoading.value = false
  }
}

// edit
const wtEditOpen = ref(false)
const wtEditItem = ref(null)
const wtEditName = ref('')
const wtEditError = ref('')
const wtEditLoading = ref(false)

const openWtEdit = (item) => { wtEditItem.value = item; wtEditName.value = item.name; wtEditError.value = ''; wtEditOpen.value = true }
const closeWtEdit = () => { wtEditOpen.value = false }

const submitWtEdit = async () => {
  const name = wtEditName.value.trim()
  if (!name) { wtEditError.value = 'Введите название'; return }
  if (workTypes.value.some(w => w.id !== wtEditItem.value.id && w.name.trim().toLowerCase() === name.toLowerCase())) {
    wtEditError.value = 'Вид работ с таким названием уже существует'
    return
  }
  wtEditLoading.value = true
  wtEditError.value = ''
  try {
    const res = await fetch(`/apisup/supply/contract-work-types/${wtEditItem.value.id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    closeWtEdit()
    await loadWorkTypes()
  } catch {
    wtEditError.value = 'Ошибка при сохранении'
  } finally {
    wtEditLoading.value = false
  }
}

// delete
const wtDeleteItem = ref(null)
const wtDeleteLoading = ref(false)

const openWtDelete = (item) => { wtDeleteItem.value = item }
const closeWtDelete = () => { wtDeleteItem.value = null }

const submitWtDelete = async () => {
  wtDeleteLoading.value = true
  try {
    const res = await fetch(`/apisup/supply/contract-work-types/${wtDeleteItem.value.id}`, {
      method: 'DELETE', credentials: 'include',
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    closeWtDelete()
    await loadWorkTypes()
  } catch {
    // silent
  } finally {
    wtDeleteLoading.value = false
  }
}

// ── Document Types ────────────────────────────────────────
const docTypes = ref([])
const docTypesLoading = ref(false)
const docTypesError = ref('')

const loadDocTypes = async () => {
  docTypesLoading.value = true
  docTypesError.value = ''
  try {
    const res = await fetch('/apisup/supply/document-types', { credentials: 'include' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    docTypes.value = await res.json()
  } catch {
    docTypesError.value = 'Не удалось загрузить типы договоров'
  } finally {
    docTypesLoading.value = false
  }
}

// create
const dtCreateOpen = ref(false)
const dtCreateName = ref('')
const dtCreateError = ref('')
const dtCreateLoading = ref(false)

const openDtCreate = () => { dtCreateName.value = ''; dtCreateError.value = ''; dtCreateOpen.value = true }
const closeDtCreate = () => { dtCreateOpen.value = false }

const submitDtCreate = async () => {
  const name = dtCreateName.value.trim()
  if (!name) { dtCreateError.value = 'Введите название'; return }
  if (docTypes.value.some(d => d.name.trim().toLowerCase() === name.toLowerCase())) {
    dtCreateError.value = 'Тип договора с таким названием уже существует'
    return
  }
  dtCreateLoading.value = true
  dtCreateError.value = ''
  try {
    const res = await fetch('/apisup/supply/document-types', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    closeDtCreate()
    await loadDocTypes()
  } catch {
    dtCreateError.value = 'Ошибка при создании'
  } finally {
    dtCreateLoading.value = false
  }
}

// edit
const dtEditOpen = ref(false)
const dtEditItem = ref(null)
const dtEditName = ref('')
const dtEditError = ref('')
const dtEditLoading = ref(false)

const openDtEdit = (item) => { dtEditItem.value = item; dtEditName.value = item.name; dtEditError.value = ''; dtEditOpen.value = true }
const closeDtEdit = () => { dtEditOpen.value = false }

const submitDtEdit = async () => {
  const name = dtEditName.value.trim()
  if (!name) { dtEditError.value = 'Введите название'; return }
  if (docTypes.value.some(d => d.id !== dtEditItem.value.id && d.name.trim().toLowerCase() === name.toLowerCase())) {
    dtEditError.value = 'Тип договора с таким названием уже существует'
    return
  }
  dtEditLoading.value = true
  dtEditError.value = ''
  try {
    const res = await fetch(`/apisup/supply/document-types/${dtEditItem.value.id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    closeDtEdit()
    await loadDocTypes()
  } catch {
    dtEditError.value = 'Ошибка при сохранении'
  } finally {
    dtEditLoading.value = false
  }
}

// delete
const dtDeleteItem = ref(null)
const dtDeleteLoading = ref(false)

const openDtDelete = (item) => { dtDeleteItem.value = item }
const closeDtDelete = () => { dtDeleteItem.value = null }

const submitDtDelete = async () => {
  dtDeleteLoading.value = true
  try {
    const res = await fetch(`/apisup/supply/document-types/${dtDeleteItem.value.id}`, {
      method: 'DELETE', credentials: 'include',
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    closeDtDelete()
    await loadDocTypes()
  } catch {
    // silent
  } finally {
    dtDeleteLoading.value = false
  }
}

// ── Work Types filters ────────────────────────────────────
const wtF = ref({ id: '', name: '', createdBy: '', createdAt: '', updatedBy: '', updatedAt: '' })

const filteredWorkTypes = computed(() => {
  const f = wtF.value
  return workTypes.value.filter(w => {
    if (f.id && !String(w.id).includes(f.id.trim())) return false
    if (f.name && !w.name.toLowerCase().includes(f.name.trim().toLowerCase())) return false
    const createdBy = w.created_by_user?.short_fio || ''
    if (f.createdBy && !createdBy.toLowerCase().includes(f.createdBy.trim().toLowerCase())) return false
    if (f.createdAt && !formatDate(w.created_at).includes(f.createdAt.trim())) return false
    const updatedBy = w.updated_by_user?.short_fio || ''
    if (f.updatedBy && !updatedBy.toLowerCase().includes(f.updatedBy.trim().toLowerCase())) return false
    if (f.updatedAt && !formatDate(w.updated_at).includes(f.updatedAt.trim())) return false
    return true
  })
})

// ── Doc Types filters ─────────────────────────────────────
const dtF = ref({ name: '', createdBy: '', createdAt: '', updatedBy: '', updatedAt: '' })

const filteredDocTypes = computed(() => {
  const f = dtF.value
  return docTypes.value.filter(d => {
    if (f.name && !d.name.toLowerCase().includes(f.name.trim().toLowerCase())) return false
    const createdBy = d.created_by_user?.short_fio || ''
    if (f.createdBy && !createdBy.toLowerCase().includes(f.createdBy.trim().toLowerCase())) return false
    if (f.createdAt && !formatDate(d.created_at).includes(f.createdAt.trim())) return false
    const updatedBy = d.updated_by_user?.short_fio || ''
    if (f.updatedBy && !updatedBy.toLowerCase().includes(f.updatedBy.trim().toLowerCase())) return false
    if (f.updatedAt && !formatDate(d.updated_at).includes(f.updatedAt.trim())) return false
    return true
  })
})

// ── Switch section ────────────────────────────────────────
const setRegistry = (key) => {
  activeRegistry.value = key
  if (key === 'contracts' && !contracts.value.length) loadContracts()
  if (key === 'work-types' && !workTypes.value.length) loadWorkTypes()
  if (key === 'doc-types' && !docTypes.value.length) loadDocTypes()
}

onMounted(() => { loadContracts() })
</script>

<template>
  <div class="page-wrap">
    <TopNav :links="navLinks" />

    <div class="page-content">
      <!-- ── Sidenav ── -->
      <aside class="sidenav">
        <div class="sidenav-section-label">Реестры</div>
        <nav class="sidenav-nav">
          <button
            v-for="reg in registries" :key="reg.key"
            type="button" class="sidenav-item"
            :class="{ active: activeRegistry === reg.key }"
            @click="setRegistry(reg.key)"
          >{{ reg.label }}</button>
        </nav>

        <div class="sidenav-section-label sidenav-section-label--mt">Настройки</div>
        <nav class="sidenav-nav">
          <button
            v-for="s in settings" :key="s.key"
            type="button" class="sidenav-item"
            :class="{ active: activeRegistry === s.key }"
            @click="setRegistry(s.key)"
          >{{ s.label }}</button>
        </nav>
      </aside>

      <!-- ── Main ── -->
      <main class="main-area">

        <!-- Contracts -->
        <template v-if="activeRegistry === 'contracts'">
          <div class="section-header">
            <h1 class="section-title">Реестр договоров</h1>
            <button class="btn-add" @click="router.push('/documents/contracts/create')">
              <i class="fas fa-plus"></i> Создать договор
            </button>
          </div>
          <div class="table-wrap">
            <div v-if="contractsLoading" class="state-msg">Загрузка...</div>
            <div v-else-if="contractsError" class="state-msg state-error">{{ contractsError }}</div>
            <table v-else class="contracts-table">
              <colgroup>
                <col style="width:40px"><col style="width:40px"><col style="width:160px">
                <col style="width:100px"><col style="width:100px">
                <col style="width:160px"><col style="width:160px"><col style="width:100px">
                <col style="width:100px"><col style="width:100px"><col style="width:180px">
                <col style="width:36px"><col style="width:36px"><col style="width:36px"><col style="width:36px">
              </colgroup>
              <thead>
                <tr>
                  <th>ID</th><th>№</th><th>Договор</th><th>Создатель</th><th>Даты</th>
                  <th>Заказчик</th><th>Подрядчик</th><th>Объект</th>
                  <th class="th-num">Сумма</th><th class="th-num">Задолженность</th><th>Вид работ</th>
                  <th class="th-vert"><span class="vert-text">Информация о договоре</span></th>
                  <th class="th-vert"><span class="vert-text">Подписан</span></th>
                  <th class="th-vert"><span class="vert-text">Оригинал</span></th>
                  <th class="th-vert"><span class="vert-text">Сверка</span></th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="!contracts.length">
                  <td colspan="15" class="empty-cell">Нет договоров</td>
                </tr>
                <tr v-for="c in contracts" :key="c.id">
                  <td class="mono td-id">{{ c.id }}</td>
                  <td class="mono td-num">{{ c.internal_num || '—' }}</td>
                  <td class="td-name">
                    <span class="contract-link" @click="router.push(`/documents/contracts/${c.id}`)">{{ c.full_name || c.name || '—' }}</span>
                  </td>
                  <td>{{ c.created_by_user?.short_fio || '—' }}</td>
                  <td>
                    <div class="date-stack">
                      <span class="date-line"><span class="date-label">С:</span> {{ formatDate(c.date_start) }}</span>
                      <span class="date-line"><span class="date-label">По:</span> {{ formatDate(c.date_end) }}</span>
                    </div>
                  </td>
                  <td>{{ c.customer_name || '—' }}</td>
                  <td>{{ c.contractor_name || '—' }}</td>
                  <td>
                    <div v-if="c.objects?.length" class="wt-list">
                      <span v-for="obj in c.objects" :key="obj.id">{{ obj.object_name || '—' }}</span>
                    </div>
                    <span v-else>—</span>
                  </td>
                  <td class="mono td-num">{{ formatMoney(c.sum) }}</td>
                  <td class="mono td-num">—</td>
                  <td>
                    <div v-if="c.work_types?.length" class="wt-list">
                      <span v-for="wt in c.work_types" :key="wt.id" class="wt-chip">{{ wt.contract_work_type_name }}</span>
                    </div>
                    <span v-else>—</span>
                  </td>
                  <td class="td-status"><i class="fas fa-times-circle status-no"></i></td>
                  <td class="td-status"><i class="fas fa-times-circle status-no"></i></td>
                  <td class="td-status"><i class="fas fa-times-circle status-no"></i></td>
                  <td class="td-status"><i class="fas fa-times-circle status-no"></i></td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>

        <!-- Work Types -->
        <template v-else-if="activeRegistry === 'work-types'">
          <div class="section-header">
            <h1 class="section-title">Виды работ</h1>
            <button class="btn-add" @click="openWtCreate"><i class="fas fa-plus"></i> Добавить вид работ</button>
          </div>
          <div class="table-wrap">
            <div v-if="workTypesLoading" class="state-msg">Загрузка...</div>
            <div v-else-if="workTypesError" class="state-msg state-error">{{ workTypesError }}</div>
            <table v-else class="settings-table">
              <thead>
                <tr>
                  <th style="width:60px">ID</th>
                  <th>Вид работы</th>
                  <th style="width:160px">Создатель</th>
                  <th style="width:130px">Дата создания</th>
                  <th style="width:160px">Кем изменено</th>
                  <th style="width:130px">Дата изменения</th>
                  <th style="width:80px">Действия</th>
                </tr>
                <tr class="filter-row">
                  <td><input v-model="wtF.id" class="filter-input" placeholder="ID" /></td>
                  <td><input v-model="wtF.name" class="filter-input" placeholder="Поиск..." /></td>
                  <td><input v-model="wtF.createdBy" class="filter-input" placeholder="Поиск..." /></td>
                  <td><input v-model="wtF.createdAt" class="filter-input" placeholder="дд.мм.гггг" /></td>
                  <td><input v-model="wtF.updatedBy" class="filter-input" placeholder="Поиск..." /></td>
                  <td><input v-model="wtF.updatedAt" class="filter-input" placeholder="дд.мм.гггг" /></td>
                  <td></td>
                </tr>
              </thead>
              <tbody>
                <tr v-if="!filteredWorkTypes.length">
                  <td colspan="7" class="empty-cell">{{ workTypes.length ? 'Нет результатов' : 'Нет видов работ' }}</td>
                </tr>
                <tr v-for="wt in filteredWorkTypes" :key="wt.id">
                  <td class="mono td-id">{{ wt.id }}</td>
                  <td>{{ wt.name }}</td>
                  <td>{{ wt.created_by_user?.short_fio || '—' }}</td>
                  <td class="td-date">{{ formatDate(wt.created_at) }}</td>
                  <td>{{ wt.updated_by_user?.short_fio || '—' }}</td>
                  <td class="td-date">{{ wt.updated_at ? formatDate(wt.updated_at) : '—' }}</td>
                  <td class="td-actions">
                    <button class="action-btn" title="Редактировать" @click="openWtEdit(wt)"><i class="fas fa-pen"></i></button>
                    <button class="action-btn action-btn--danger" title="Удалить" @click="openWtDelete(wt)"><i class="fas fa-trash"></i></button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>

        <!-- Document Types -->
        <template v-else-if="activeRegistry === 'doc-types'">
          <div class="section-header">
            <h1 class="section-title">Типы договоров</h1>
            <button class="btn-add" @click="openDtCreate"><i class="fas fa-plus"></i> Добавить тип договора</button>
          </div>
          <div class="table-wrap">
            <div v-if="docTypesLoading" class="state-msg">Загрузка...</div>
            <div v-else-if="docTypesError" class="state-msg state-error">{{ docTypesError }}</div>
            <table v-else class="settings-table">
              <thead>
                <tr>
                  <th style="width:50px">№</th>
                  <th>Вид договора</th>
                  <th style="width:160px">Кем создано</th>
                  <th style="width:130px">Дата создания</th>
                  <th style="width:160px">Кем изменено</th>
                  <th style="width:130px">Дата изменения</th>
                  <th style="width:80px">Действия</th>
                </tr>
                <tr class="filter-row">
                  <td></td>
                  <td><input v-model="dtF.name" class="filter-input" placeholder="Поиск..." /></td>
                  <td><input v-model="dtF.createdBy" class="filter-input" placeholder="Поиск..." /></td>
                  <td><input v-model="dtF.createdAt" class="filter-input" placeholder="дд.мм.гггг" /></td>
                  <td><input v-model="dtF.updatedBy" class="filter-input" placeholder="Поиск..." /></td>
                  <td><input v-model="dtF.updatedAt" class="filter-input" placeholder="дд.мм.гггг" /></td>
                  <td></td>
                </tr>
              </thead>
              <tbody>
                <tr v-if="!filteredDocTypes.length">
                  <td colspan="7" class="empty-cell">{{ docTypes.length ? 'Нет результатов' : 'Нет типов договоров' }}</td>
                </tr>
                <tr v-for="(dt, idx) in filteredDocTypes" :key="dt.id">
                  <td class="mono td-id">{{ idx + 1 }}</td>
                  <td>{{ dt.name }}</td>
                  <td>{{ dt.created_by_user?.short_fio || '—' }}</td>
                  <td class="td-date">{{ formatDate(dt.created_at) }}</td>
                  <td>{{ dt.updated_by_user?.short_fio || '—' }}</td>
                  <td class="td-date">{{ dt.updated_at ? formatDate(dt.updated_at) : '—' }}</td>
                  <td class="td-actions">
                    <button class="action-btn" title="Редактировать" @click="openDtEdit(dt)"><i class="fas fa-pen"></i></button>
                    <button class="action-btn action-btn--danger" title="Удалить" @click="openDtDelete(dt)"><i class="fas fa-trash"></i></button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>

        <!-- Placeholder -->
        <template v-else>
          <div class="placeholder">
            <i class="fas fa-tools placeholder-icon"></i>
            <p class="placeholder-text">Раздел в разработке</p>
            <p class="placeholder-sub">{{ [...registries, ...settings].find(r => r.key === activeRegistry)?.label }} — скоро будет доступен</p>
          </div>
        </template>
      </main>
    </div>
  </div>

  <!-- ── Work Type: Create modal ── -->
  <div v-if="wtCreateOpen" class="modal-backdrop">
    <div class="modal-card">
      <div class="modal-header">
        <span class="modal-title">Добавить вид работ</span>
        <button class="modal-close" @click="closeWtCreate"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body">
        <label class="modal-label">Название</label>
        <input v-model="wtCreateName" class="modal-input" type="text" placeholder="Введите название" @keydown.enter="submitWtCreate">
        <div v-if="wtCreateError" class="modal-error">{{ wtCreateError }}</div>
      </div>
      <div class="modal-footer">
        <button class="btn-cancel" @click="closeWtCreate">Отмена</button>
        <button class="btn-submit" :disabled="wtCreateLoading" @click="submitWtCreate">
          {{ wtCreateLoading ? 'Создание...' : 'Создать' }}
        </button>
      </div>
    </div>
  </div>

  <!-- ── Work Type: Edit modal ── -->
  <div v-if="wtEditOpen" class="modal-backdrop">
    <div class="modal-card">
      <div class="modal-header">
        <span class="modal-title">Редактировать вид работ</span>
        <button class="modal-close" @click="closeWtEdit"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body">
        <label class="modal-label">Название</label>
        <input v-model="wtEditName" class="modal-input" type="text" @keydown.enter="submitWtEdit">
        <div v-if="wtEditError" class="modal-error">{{ wtEditError }}</div>
      </div>
      <div class="modal-footer">
        <button class="btn-cancel" @click="closeWtEdit">Отмена</button>
        <button class="btn-submit" :disabled="wtEditLoading" @click="submitWtEdit">
          {{ wtEditLoading ? 'Сохранение...' : 'Сохранить' }}
        </button>
      </div>
    </div>
  </div>

  <!-- ── Work Type: Delete confirm ── -->
  <div v-if="wtDeleteItem" class="modal-backdrop">
    <div class="modal-card modal-card--sm">
      <div class="modal-header">
        <span class="modal-title">Удалить вид работ?</span>
        <button class="modal-close" @click="closeWtDelete"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body">
        <p class="confirm-text">Вы уверены, что хотите удалить <strong>«{{ wtDeleteItem.name }}»</strong>? Это действие нельзя отменить.</p>
      </div>
      <div class="modal-footer">
        <button class="btn-cancel" @click="closeWtDelete">Отмена</button>
        <button class="btn-danger" :disabled="wtDeleteLoading" @click="submitWtDelete">
          {{ wtDeleteLoading ? 'Удаление...' : 'Удалить' }}
        </button>
      </div>
    </div>
  </div>

  <!-- ── Doc Type: Create modal ── -->
  <div v-if="dtCreateOpen" class="modal-backdrop">
    <div class="modal-card">
      <div class="modal-header">
        <span class="modal-title">Добавить тип договора</span>
        <button class="modal-close" @click="closeDtCreate"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body">
        <label class="modal-label">Название</label>
        <input v-model="dtCreateName" class="modal-input" type="text" placeholder="Введите название" @keydown.enter="submitDtCreate">
        <div v-if="dtCreateError" class="modal-error">{{ dtCreateError }}</div>
      </div>
      <div class="modal-footer">
        <button class="btn-cancel" @click="closeDtCreate">Отмена</button>
        <button class="btn-submit" :disabled="dtCreateLoading" @click="submitDtCreate">
          {{ dtCreateLoading ? 'Создание...' : 'Создать' }}
        </button>
      </div>
    </div>
  </div>

  <!-- ── Doc Type: Edit modal ── -->
  <div v-if="dtEditOpen" class="modal-backdrop">
    <div class="modal-card">
      <div class="modal-header">
        <span class="modal-title">Редактировать тип договора</span>
        <button class="modal-close" @click="closeDtEdit"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body">
        <label class="modal-label">Название</label>
        <input v-model="dtEditName" class="modal-input" type="text" @keydown.enter="submitDtEdit">
        <div v-if="dtEditError" class="modal-error">{{ dtEditError }}</div>
      </div>
      <div class="modal-footer">
        <button class="btn-cancel" @click="closeDtEdit">Отмена</button>
        <button class="btn-submit" :disabled="dtEditLoading" @click="submitDtEdit">
          {{ dtEditLoading ? 'Сохранение...' : 'Сохранить' }}
        </button>
      </div>
    </div>
  </div>

  <!-- ── Doc Type: Delete confirm ── -->
  <div v-if="dtDeleteItem" class="modal-backdrop">
    <div class="modal-card modal-card--sm">
      <div class="modal-header">
        <span class="modal-title">Удалить тип договора?</span>
        <button class="modal-close" @click="closeDtDelete"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body">
        <p class="confirm-text">Вы уверены, что хотите удалить <strong>«{{ dtDeleteItem.name }}»</strong>? Это действие нельзя отменить.</p>
      </div>
      <div class="modal-footer">
        <button class="btn-cancel" @click="closeDtDelete">Отмена</button>
        <button class="btn-danger" :disabled="dtDeleteLoading" @click="submitDtDelete">
          {{ dtDeleteLoading ? 'Удаление...' : 'Удалить' }}
        </button>
      </div>
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

.page-content {
  display: flex;
  flex-direction: row;
  flex: 1;
  overflow: hidden;
}

/* ── Sidenav ── */
.sidenav {
  width: 200px;
  flex-shrink: 0;
  background: var(--bg-surface);
  border-right: 1px solid var(--border-light);
  display: flex;
  flex-direction: column;
  padding: 16px 0;
  overflow-y: auto;
}

.sidenav-section-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-tertiary);
  padding: 0 16px 6px;
}

.sidenav-section-label--mt {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--border-light);
}

.sidenav-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 8px;
}

.sidenav-item {
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  padding: 8px 12px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.sidenav-item:hover { background: var(--bg-subtle); color: var(--text-primary); }
.sidenav-item.active { background: var(--brand-light); color: var(--brand-primary); font-weight: 600; }

/* ── Main area ── */
.main-area {
  flex: 1;
  overflow: auto;
  display: flex;
  flex-direction: column;
  background: var(--bg-page);
}

.section-header {
  padding: 20px 24px 12px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.section-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}

.btn-add {
  height: 34px;
  padding: 0 14px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--brand-primary);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}
.btn-add:hover { opacity: 0.9; }

/* ── Table wrap ── */
.table-wrap {
  flex: 1;
  overflow: auto;
  padding: 0 24px 24px;
}

/* ── Contracts table ── */
.contracts-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  background: var(--bg-surface);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--border-light);
}

.contracts-table thead { position: sticky; top: 0; z-index: 10; }

.contracts-table th,
.contracts-table td {
  padding: 7px 8px;
  border: 1px solid var(--border-light);
  text-align: left;
  vertical-align: top;
  font-size: 12px;
  overflow: hidden;
}

.contracts-table td { word-break: break-word; white-space: normal; }
.contracts-table th {
  background: var(--bg-subtle);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-secondary);
  white-space: nowrap;
  text-overflow: ellipsis;
}
.contracts-table tbody tr:hover td { background: var(--bg-subtle); }

.th-vert { padding: 4px 0 !important; vertical-align: bottom !important; text-align: center !important; }
.vert-text {
  display: inline-block;
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  white-space: nowrap;
  height: 52px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary);
  line-height: 1;
}

.th-num { text-align: right !important; }
.td-num { text-align: right; white-space: nowrap; }
.td-status { text-align: center !important; padding: 6px 2px !important; font-size: 14px; vertical-align: middle !important; }
.status-yes { color: #16a34a; }
.status-no  { color: #e2e8f0; }
.td-id { color: var(--text-tertiary); font-size: 11px; }
.contract-link { color: var(--brand-primary); cursor: pointer; font-weight: 500; }
.contract-link:hover { text-decoration: underline; }
.td-name { white-space: normal; word-break: break-word; line-height: 1.4; }
.mono { font-family: 'JetBrains Mono', monospace; }
.text-debt { color: #dc2626; font-weight: 600; }
.date-stack { display: flex; flex-direction: column; gap: 2px; }
.date-line { font-size: 11px; color: var(--text-secondary); white-space: nowrap; }
.date-label { color: var(--text-tertiary); font-size: 10px; }

/* ── Settings table ── */
.settings-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  background: var(--bg-surface);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-light);
  box-shadow: var(--shadow-sm);
  font-size: 13px;
}

.settings-table thead th {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--bg-subtle);
  padding: 9px 12px;
  text-align: left;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-light);
}

.settings-table thead th:not(:last-child) { border-right: 1px solid var(--border-light); }

.settings-table tbody td {
  padding: 9px 12px;
  border-bottom: 1px solid var(--border-light);
  color: var(--text-primary);
  vertical-align: middle;
}

.settings-table tbody td:not(:last-child) { border-right: 1px solid var(--border-light); }
.settings-table tbody tr:last-child td { border-bottom: none; }
.settings-table tbody tr:hover td { background: var(--bg-subtle); }

.td-date { color: var(--text-secondary); font-size: 12px; white-space: nowrap; }

/* Filter row */
.filter-row td {
  padding: 4px 6px;
  background: var(--bg-page);
  border-bottom: 1px solid var(--border-light);
  border-right: 1px solid var(--border-light);
}
.filter-row td:last-child { border-right: none; }

.filter-input {
  width: 100%;
  box-sizing: border-box;
  height: 28px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: 0 8px;
  font-size: 12px;
  color: var(--text-primary);
  background: var(--bg-surface);
  outline: none;
}
.filter-input:focus { border-color: var(--brand-primary); }
.filter-input::placeholder { color: var(--text-tertiary); }

.td-actions {
  display: flex;
  gap: 6px;
  align-items: center;
}

.action-btn {
  width: 30px;
  height: 30px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--bg-subtle);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  transition: all 0.15s;
}
.action-btn:hover { background: var(--bg-surface); color: var(--brand-primary); border-color: var(--brand-primary); }
.action-btn--danger:hover { color: #ef4444; border-color: #ef4444; background: #fef2f2; }

.empty-cell { text-align: center; color: var(--text-tertiary); padding: 40px; }

/* ── State ── */
.state-msg { text-align: center; padding: 40px; color: var(--text-secondary); font-size: 14px; }
.state-error { color: #ef4444; }

/* ── Placeholder ── */
.placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 80px 24px;
}
.placeholder-icon { font-size: 48px; color: var(--border-light); }
.placeholder-text { margin: 0; font-size: 18px; font-weight: 600; color: var(--text-secondary); }
.placeholder-sub { margin: 0; font-size: 13px; color: var(--text-tertiary); }

/* ── Modals ── */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.modal-card {
  background: var(--bg-surface);
  border-radius: var(--radius-lg);
  box-shadow: 0 20px 60px rgba(0,0,0,0.18);
  width: 420px;
  max-width: calc(100vw - 32px);
  display: flex;
  flex-direction: column;
}

.modal-card--sm { width: 360px; }

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-light);
}

.modal-title { font-size: 15px; font-weight: 700; color: var(--text-primary); }

.modal-close {
  width: 28px; height: 28px;
  border: none;
  background: var(--bg-subtle);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px;
}
.modal-close:hover { background: var(--bg-page); color: var(--text-primary); }

.modal-body { padding: 20px; display: flex; flex-direction: column; gap: 8px; }

.modal-label { font-size: 12px; font-weight: 600; color: var(--text-secondary); }

.modal-input {
  height: 38px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: 0 12px;
  font-size: 14px;
  color: var(--text-primary);
  background: var(--bg-subtle);
  outline: none;
  width: 100%;
  box-sizing: border-box;
}
.modal-input:focus { border-color: var(--brand-primary); background: var(--bg-surface); }

.modal-error {
  font-size: 12px;
  color: #ef4444;
  padding: 6px 10px;
  background: #fef2f2;
  border-radius: var(--radius-md);
  border: 1px solid #fecaca;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px 16px;
  border-top: 1px solid var(--border-light);
}

.confirm-text { margin: 0; font-size: 14px; color: var(--text-primary); line-height: 1.5; }

.btn-cancel {
  height: 36px; padding: 0 16px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--bg-subtle);
  color: var(--text-secondary);
  font-size: 13px; cursor: pointer;
}
.btn-cancel:hover { background: var(--bg-page); }

.btn-submit {
  height: 36px; padding: 0 16px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--brand-primary);
  color: #fff;
  font-size: 13px; font-weight: 600; cursor: pointer;
}
.btn-submit:hover { opacity: 0.9; }
.btn-submit:disabled { opacity: 0.6; cursor: default; }

.btn-danger {
  height: 36px; padding: 0 16px;
  border: none;
  border-radius: var(--radius-md);
  background: #ef4444;
  color: #fff;
  font-size: 13px; font-weight: 600; cursor: pointer;
}
.btn-danger:hover { background: #dc2626; }
.btn-danger:disabled { opacity: 0.6; cursor: default; }

/* ── Contracts table extras ── */
.contract-name-main {
  font-size: 12px;
  color: var(--text-primary);
  line-height: 1.4;
  word-break: break-word;
  white-space: normal;
}
.contract-num {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-top: 2px;
  font-family: 'JetBrains Mono', monospace;
}
.td-person { font-size: 12px; color: var(--text-secondary); }
.td-empty  { color: var(--text-tertiary); }

.wt-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.wt-chip {
  display: inline-block;
  padding: 1px 6px;
  background: #eff6ff;
  color: #1e40af;
  border-radius: 4px;
  font-size: 11px;
  white-space: normal;
  word-break: break-word;
}

.type-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  background: var(--bg-subtle);
  color: var(--text-secondary);
  white-space: nowrap;
}
.type-badge--buyer   { background: #dbeafe; color: #1d4ed8; }
.type-badge--seller  { background: #dcfce7; color: #166534; }
.type-badge--service { background: #fef9c3; color: #854d0e; }
</style>
