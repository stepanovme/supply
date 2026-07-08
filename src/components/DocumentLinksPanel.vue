<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

// Панель «Связи» документа (договор/письмо): список связей, добавление, удаление.
// При клике по файлу эмитит open-file(file, source) — родитель показывает его в своём просмотрщике.
const props = defineProps({
  ownerId: { type: [String, Number], required: true },
  ownerType: { type: String, required: true }, // 'contract' | 'letter'
  fileIcon: { type: Function, required: true },
  fileColor: { type: Function, required: true },
})
const emit = defineEmits(['open-file'])

const router = useRouter()

// ── Список связей ─────────────────────────────────────────
const links = ref([])
const linksLoading = ref(false)

const loadLinks = async () => {
  linksLoading.value = true
  try {
    const id = String(props.ownerId)
    const t = props.ownerType
    const [r1, r2] = await Promise.all([
      fetch(`/apisup/supply/documents-links?document_linked_first=${id}&document_type_first=${t}`, { credentials: 'include' }),
      fetch(`/apisup/supply/documents-links?document_linked_second=${id}&document_type_second=${t}`, { credentials: 'include' }),
    ])
    const parse = async (r) => {
      if (!r.ok) return []
      const d = await r.json()
      return Array.isArray(d) ? d : (d.items ?? d.data ?? [])
    }
    const first = await parse(r1)
    const second = await parse(r2)
    const items = [
      ...first.map(l => ({ linkId: l.id, doc: l.document_second, type: l.document_type_second, docId: l.document_linked_second, createdAt: l.created_at })),
      ...second.map(l => ({ linkId: l.id, doc: l.document_first, type: l.document_type_first, docId: l.document_linked_first, createdAt: l.created_at })),
    ]
    const seen = new Set()
    links.value = items
      .filter(i => { if (seen.has(i.linkId)) return false; seen.add(i.linkId); return true })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  } catch (e) { console.error(e) } finally { linksLoading.value = false }
}

const linkDocName = (l) => l.doc?.original_name || l.doc?.full_name || l.doc?.name || '—'
const linkTypeBadge = (type) => {
  if (type === 'contract') return { label: 'Договор', cls: 'lm-badge--contract' }
  if (type === 'letter') return { label: 'Письмо', cls: 'lm-badge--letter' }
  return { label: 'Файл', cls: 'lm-badge--file' }
}
const linkFileTypeBadge = (l) => {
  if (!String(l.type || '').startsWith('file')) return null
  if (l.doc?.type === 'version') return { label: 'Версия', cls: 'lm-badge--version' }
  if (l.doc?.type === 'original') return { label: 'Оригинал', cls: 'lm-badge--original' }
  return null
}
const fmtLinkDate = (s) => {
  const d = new Date(s)
  if (isNaN(d)) return s || ''
  const p = n => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

const openLink = (l) => {
  if (l.type === 'file_contract' || l.type === 'file_letter') {
    const name = l.doc?.original_name || ''
    const file = { id: l.docId, original_name: name, extension: name.split('.').pop()?.toLowerCase() || '' }
    emit('open-file', file, l.type === 'file_letter' ? 'letter' : 'contract')
  } else if (l.type === 'contract') {
    router.push({ name: 'contract-detail', params: { id: l.docId } })
  } else if (l.type === 'letter') {
    router.push({ name: 'letter-detail', params: { id: l.docId } })
  }
}

// ── Контекстное меню + удаление ───────────────────────────
const ctxMenu = ref(null) // { linkId, style }
const openCtxMenu = (l, e) => {
  ctxMenu.value = {
    linkId: l.linkId,
    style: { position: 'fixed', top: e.clientY + 'px', left: Math.min(e.clientX, window.innerWidth - 170) + 'px', zIndex: 10010 },
  }
}
const closeCtxMenu = () => { ctxMenu.value = null }

const deleteConfirm = ref(null) // linkId
const deleting = ref(false)
const askDelete = () => { deleteConfirm.value = ctxMenu.value?.linkId; closeCtxMenu() }
const confirmDelete = async () => {
  if (!deleteConfirm.value || deleting.value) return
  deleting.value = true
  try {
    const r = await fetch(`/apisup/supply/documents-links/${deleteConfirm.value}`, { method: 'DELETE', credentials: 'include' })
    if (r.ok) links.value = links.value.filter(l => l.linkId !== deleteConfirm.value)
    deleteConfirm.value = null
  } catch (e) { console.error(e) } finally { deleting.value = false }
}

// ── Модалка «Добавить связь» ──────────────────────────────
const modalOpen = ref(false)
const search = ref('')
const srcLoading = ref(false)
const letters = ref([])
const contracts = ref([])
const expanded = ref(new Set())
const selected = ref(null) // { id, type, label }
const saving = ref(false)

const letterTitle = (l) => {
  const kind = l.type === 'outgoing' ? 'Исходящее письмо' : (l.type === 'incoming' ? 'Входящее письмо' : 'Письмо')
  const base = `${kind} ${l.name || ''}`.trim()
  return l.num ? `${base} № ${l.num}` : base
}
const fileBadge = (f) => {
  if (f.type === 'version') return { label: 'Версия', cls: 'lm-badge--version' }
  if (f.type === 'original') return { label: 'Оригинал', cls: 'lm-badge--original' }
  return { label: 'Файл', cls: 'lm-badge--file' }
}

const loadSources = async () => {
  srcLoading.value = true
  try {
    const [lr, cr] = await Promise.all([
      fetch('/apisup/supply/letter-files/my', { credentials: 'include' }),
      fetch('/apisup/supply/contract-files/my', { credentials: 'include' }),
    ])
    if (lr.ok) {
      const d = await lr.json()
      const list = Array.isArray(d) ? d : (d.items ?? d.data ?? [])
      letters.value = props.ownerType === 'letter' ? list.filter(l => String(l.id) !== String(props.ownerId)) : list
    }
    if (cr.ok) {
      const d = await cr.json()
      const list = Array.isArray(d) ? d : (d.items ?? d.data ?? [])
      contracts.value = props.ownerType === 'contract' ? list.filter(c => String(c.id) !== String(props.ownerId)) : list
    }
  } catch (e) { console.error(e) } finally { srcLoading.value = false }
}

const openModal = () => {
  modalOpen.value = true
  search.value = ''
  expanded.value = new Set()
  selected.value = null
  loadSources()
}
const closeModal = () => { modalOpen.value = false }
const toggleExpand = (key) => {
  const s = new Set(expanded.value)
  s.has(key) ? s.delete(key) : s.add(key)
  expanded.value = s
}
const isSelected = (id, type) => selected.value?.id === String(id) && selected.value?.type === type
const selectItem = (id, type, label) => {
  selected.value = isSelected(id, type) ? null : { id: String(id), type, label }
}

const matchQ = (str, q) => (str || '').toLowerCase().includes(q)
const filteredLetters = computed(() => {
  const q = search.value.toLowerCase().trim()
  if (!q) return letters.value
  return letters.value.filter(l => matchQ(letterTitle(l), q) || matchQ(l.num, q) || (l.files || []).some(f => matchQ(f.original_name, q)))
})
const filteredContracts = computed(() => {
  const q = search.value.toLowerCase().trim()
  if (!q) return contracts.value
  return contracts.value.filter(c => matchQ(c.full_name, q) || (c.files || []).some(f => matchQ(f.original_name, q)))
})

const submitLink = async () => {
  if (!selected.value || saving.value) return
  saving.value = true
  try {
    const r = await fetch('/apisup/supply/documents-links', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        document_linked_first: String(props.ownerId),
        document_type_first: props.ownerType,
        document_linked_second: selected.value.id,
        document_type_second: selected.value.type,
      }),
    })
    if (r.ok) { closeModal(); loadLinks() }
  } catch (e) { console.error(e) } finally { saving.value = false }
}

watch(() => props.ownerId, () => loadLinks())
onMounted(() => {
  loadLinks()
  window.addEventListener('mousedown', closeCtxMenu)
})
onUnmounted(() => window.removeEventListener('mousedown', closeCtxMenu))
</script>

<template>
  <div class="viewer-links-wrap">
    <button class="viewer-addlink-btn" @click="openModal">
      <i class="fas fa-plus"></i> Добавить связь
    </button>
    <div v-if="linksLoading" class="dlp-state"><div class="mini-spinner"></div> Загрузка...</div>
    <div v-else-if="!links.length" class="dlp-empty">
      <i class="fas fa-link" style="font-size:32px;color:#e2e8f0;margin-bottom:10px"></i>
      <div>Связи не настроены</div>
    </div>
    <div v-else class="links-list">
      <div v-for="l in links" :key="l.linkId" class="link-item" @click="openLink(l)" @contextmenu.prevent="openCtxMenu(l, $event)">
        <div class="link-item-top">
          <span class="lm-badge" :class="linkTypeBadge(l.type).cls">{{ linkTypeBadge(l.type).label }}</span>
          <span class="link-item-name">{{ linkDocName(l) }}</span>
        </div>
        <div class="link-item-meta">
          <span v-if="linkFileTypeBadge(l)" class="lm-badge" :class="linkFileTypeBadge(l).cls">{{ linkFileTypeBadge(l).label }}</span>
          <span class="link-item-date">{{ fmtLinkDate(l.createdAt) }}</span>
        </div>
      </div>
    </div>

    <!-- Контекстное меню -->
    <Teleport to="body">
      <div v-if="ctxMenu" class="dlp-ctx" :style="ctxMenu.style" @mousedown.stop>
        <button class="dlp-ctx-item" @click="askDelete"><i class="fas fa-trash"></i> Удалить</button>
      </div>

      <!-- Подтверждение удаления -->
      <div v-if="deleteConfirm" class="dlp-confirm-back" @click.self="deleteConfirm = null">
        <div class="dlp-confirm">
          <div class="dlp-confirm-icon"><i class="fas fa-trash"></i></div>
          <div class="dlp-confirm-title">Удалить связь?</div>
          <div class="dlp-confirm-text">Связь между документами будет удалена. Сами документы не пострадают.</div>
          <div class="dlp-confirm-actions">
            <button class="dlp-btn" :disabled="deleting" @click="deleteConfirm = null">Отмена</button>
            <button class="dlp-btn dlp-btn--danger" :disabled="deleting" @click="confirmDelete">
              <div v-if="deleting" class="mini-spinner"></div>
              <template v-else>Удалить</template>
            </button>
          </div>
        </div>
      </div>

      <!-- Модалка «Добавить связь» -->
      <div v-if="modalOpen" class="dlp-modal-back" @click.self="closeModal">
        <div class="lm-modal">
          <div class="lm-head">
            <div class="lm-title">Добавить связь</div>
            <button class="lm-close" @click="closeModal"><i class="fas fa-xmark"></i></button>
          </div>
          <div class="lm-search">
            <i class="fas fa-search"></i>
            <input v-model="search" placeholder="Поиск по письмам, договорам и файлам..." autofocus />
          </div>

          <div class="lm-body">
            <div v-if="srcLoading" class="dlp-state"><div class="mini-spinner"></div> Загрузка...</div>
            <template v-else>
              <div v-for="l in filteredLetters" :key="'letter-' + l.id" class="lm-card">
                <div class="lm-card-head" :class="{ selected: isSelected(l.id, 'letter') }" @click="toggleExpand('letter-' + l.id)">
                  <button class="lm-radio" :class="{ on: isSelected(l.id, 'letter') }" title="Выбрать письмо" @click.stop="selectItem(l.id, 'letter', letterTitle(l))">
                    <i v-if="isSelected(l.id, 'letter')" class="fas fa-check"></i>
                  </button>
                  <span class="lm-badge lm-badge--letter">Письмо</span>
                  <span class="lm-card-name">{{ letterTitle(l) }}</span>
                  <span v-if="l.files?.length" class="lm-count">{{ l.files.length }}</span>
                  <i class="fas fa-chevron-down lm-caret" :class="{ open: expanded.has('letter-' + l.id) }"></i>
                </div>
                <div v-if="expanded.has('letter-' + l.id)" class="lm-files">
                  <div v-for="f in l.files" :key="f.id" class="lm-file" :class="{ selected: isSelected(f.id, 'file_letter') }" @click="selectItem(f.id, 'file_letter', f.original_name)">
                    <button class="lm-radio lm-radio--sm" :class="{ on: isSelected(f.id, 'file_letter') }"><i v-if="isSelected(f.id, 'file_letter')" class="fas fa-check"></i></button>
                    <span class="lm-badge" :class="fileBadge(f).cls">{{ fileBadge(f).label }}</span>
                    <i class="fas" :class="props.fileIcon(f.extension)" :style="{ color: props.fileColor(f.extension) }"></i>
                    <span class="lm-file-name">{{ f.original_name }}</span>
                  </div>
                  <div v-if="!l.files?.length" class="lm-file lm-file--empty">Нет файлов</div>
                </div>
              </div>

              <div v-for="c in filteredContracts" :key="'contract-' + c.id" class="lm-card">
                <div class="lm-card-head" :class="{ selected: isSelected(c.id, 'contract') }" @click="toggleExpand('contract-' + c.id)">
                  <button class="lm-radio" :class="{ on: isSelected(c.id, 'contract') }" title="Выбрать договор" @click.stop="selectItem(c.id, 'contract', c.full_name)">
                    <i v-if="isSelected(c.id, 'contract')" class="fas fa-check"></i>
                  </button>
                  <span class="lm-badge lm-badge--contract">Договор</span>
                  <span class="lm-card-name">{{ c.full_name }}</span>
                  <span v-if="c.files?.length" class="lm-count">{{ c.files.length }}</span>
                  <i class="fas fa-chevron-down lm-caret" :class="{ open: expanded.has('contract-' + c.id) }"></i>
                </div>
                <div v-if="expanded.has('contract-' + c.id)" class="lm-files">
                  <div v-for="f in c.files" :key="f.id" class="lm-file" :class="{ selected: isSelected(f.id, 'file_contract') }" @click="selectItem(f.id, 'file_contract', f.original_name)">
                    <button class="lm-radio lm-radio--sm" :class="{ on: isSelected(f.id, 'file_contract') }"><i v-if="isSelected(f.id, 'file_contract')" class="fas fa-check"></i></button>
                    <span class="lm-badge" :class="fileBadge(f).cls">{{ fileBadge(f).label }}</span>
                    <i class="fas" :class="props.fileIcon(f.extension)" :style="{ color: props.fileColor(f.extension) }"></i>
                    <span class="lm-file-name">{{ f.original_name }}</span>
                  </div>
                  <div v-if="!c.files?.length" class="lm-file lm-file--empty">Нет файлов</div>
                </div>
              </div>

              <div v-if="!filteredLetters.length && !filteredContracts.length" class="dlp-state">Ничего не найдено</div>
            </template>
          </div>

          <div class="lm-footer">
            <span v-if="selected" class="lm-selected-label"><i class="fas fa-link"></i> {{ selected.label }}</span>
            <span v-else class="lm-selected-label lm-selected-label--empty">Выберите письмо, договор или файл</span>
            <button class="lm-link-btn" :disabled="!selected || saving" @click="submitLink">
              <div v-if="saving" class="mini-spinner"></div>
              <template v-else><i class="fas fa-link"></i> Связать</template>
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.viewer-links-wrap { display: flex; flex-direction: column; padding: 12px; gap: 8px; overflow-y: auto; flex: 1; min-height: 0; }
.viewer-addlink-btn {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  padding: 9px; border: 1px dashed var(--border-light, #e2e8f0); border-radius: 8px;
  background: none; color: var(--brand-primary, #3b82f6); font-size: 13px; font-weight: 600; cursor: pointer; flex-shrink: 0;
}
.viewer-addlink-btn:hover { background: var(--brand-light, #eff6ff); border-color: var(--brand-primary, #3b82f6); }
.dlp-state { padding: 24px; text-align: center; color: var(--text-tertiary, #94a3b8); font-size: 13px; display: flex; align-items: center; justify-content: center; gap: 8px; flex-shrink: 0; }
.dlp-empty { padding: 32px 12px; text-align: center; color: var(--text-tertiary, #94a3b8); font-size: 13px; }
.mini-spinner { width: 14px; height: 14px; border: 2px solid rgba(0,0,0,0.15); border-top-color: var(--brand-primary, #3b82f6); border-radius: 50%; animation: dlp-spin 0.7s linear infinite; }
@keyframes dlp-spin { to { transform: rotate(360deg); } }

.links-list { display: flex; flex-direction: column; gap: 8px; overflow-y: auto; }
.link-item { border: 1px solid var(--border-light, #e2e8f0); border-radius: 10px; padding: 10px 12px; cursor: pointer; flex-shrink: 0; transition: border-color 0.12s, box-shadow 0.12s; }
.link-item:hover { border-color: var(--brand-primary, #3b82f6); box-shadow: 0 2px 8px rgba(15,23,42,0.06); }
.link-item-top { display: flex; align-items: flex-start; gap: 8px; }
.link-item-name { flex: 1; font-size: 13px; font-weight: 600; color: var(--text-primary, #1e293b); word-break: break-word; }
.link-item-meta { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
.link-item-date { font-size: 11px; color: var(--text-tertiary, #94a3b8); margin-left: auto; }

.lm-badge { flex-shrink: 0; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; padding: 2px 7px; border-radius: 5px; }
.lm-badge--letter { background: #e0f2fe; color: #0369a1; }
.lm-badge--contract { background: #dcfce7; color: #15803d; }
.lm-badge--version { background: #fef3c7; color: #b45309; }
.lm-badge--original { background: #dcfce7; color: #16a34a; }
.lm-badge--file { background: var(--bg-subtle, #f1f5f9); color: var(--text-secondary, #64748b); }

.dlp-ctx { min-width: 160px; background: var(--bg-surface, #fff); border: 1px solid var(--border-light, #e2e8f0); border-radius: 10px; box-shadow: 0 8px 28px rgba(15,23,42,0.18); padding: 4px; }
.dlp-ctx-item { width: 100%; display: flex; align-items: center; gap: 8px; padding: 9px 12px; border: none; background: none; cursor: pointer; font-size: 13px; color: #dc2626; border-radius: 7px; text-align: left; }
.dlp-ctx-item:hover { background: #fef2f2; }

.dlp-confirm-back { position: fixed; inset: 0; z-index: 10020; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; }
.dlp-confirm { width: 380px; max-width: 90vw; background: var(--bg-surface, #fff); border-radius: 14px; padding: 24px; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 10px; box-shadow: 0 12px 40px rgba(0,0,0,0.2); }
.dlp-confirm-icon { width: 52px; height: 52px; border-radius: 50%; background: #fee2e2; color: #ef4444; display: flex; align-items: center; justify-content: center; font-size: 20px; }
.dlp-confirm-title { font-size: 17px; font-weight: 700; color: var(--text-primary, #1e293b); }
.dlp-confirm-text { font-size: 13px; color: var(--text-secondary, #64748b); line-height: 1.5; }
.dlp-confirm-actions { display: flex; gap: 10px; margin-top: 10px; width: 100%; }
.dlp-btn { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 9px 16px; border: 1px solid var(--border-light, #e2e8f0); border-radius: 8px; background: var(--bg-surface, #fff); font-size: 13px; cursor: pointer; }
.dlp-btn--danger { background: #ef4444; color: #fff; border-color: #ef4444; }
.dlp-btn:disabled { opacity: 0.6; cursor: default; }

.dlp-modal-back { position: fixed; inset: 0; z-index: 10015; background: rgba(15,23,42,0.4); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; padding: 24px; }
.lm-modal { width: 640px; max-width: 94vw; max-height: 84vh; background: var(--bg-surface, #fff); border-radius: 14px; box-shadow: 0 16px 48px rgba(15,23,42,0.24); display: flex; flex-direction: column; overflow: hidden; }
.lm-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px 10px; }
.lm-title { font-size: 16px; font-weight: 700; color: var(--text-primary, #1e293b); }
.lm-close { border: none; background: none; cursor: pointer; color: var(--text-tertiary, #94a3b8); font-size: 16px; }
.lm-close:hover { color: var(--text-primary, #1e293b); }
.lm-search { position: relative; padding: 0 20px 12px; flex-shrink: 0; }
.lm-search i { position: absolute; left: 32px; top: 50%; transform: translateY(calc(-50% - 6px)); color: var(--text-tertiary, #94a3b8); font-size: 13px; }
.lm-search input { width: 100%; height: 38px; padding: 0 12px 0 36px; box-sizing: border-box; border: 1px solid var(--border-light, #e2e8f0); border-radius: 8px; font-size: 13px; outline: none; }
.lm-search input:focus { border-color: var(--brand-primary, #3b82f6); }
.lm-body { flex: 1; overflow-y: auto; padding: 0 20px 16px; display: flex; flex-direction: column; gap: 8px; }
.lm-card { border: 1px solid var(--border-light, #e2e8f0); border-radius: 10px; overflow: hidden; flex-shrink: 0; }
.lm-card-head { display: flex; align-items: center; gap: 8px; width: 100%; padding: 10px 12px; cursor: pointer; }
.lm-card-head:hover { background: var(--bg-subtle, #f1f5f9); }
.lm-card-head.selected { background: var(--brand-light, #eff6ff); }
.lm-card-name { flex: 1; font-size: 13px; font-weight: 600; color: var(--text-primary, #1e293b); }
.lm-count { font-size: 11px; font-weight: 700; color: var(--text-secondary, #64748b); background: var(--bg-subtle, #f1f5f9); border-radius: 10px; padding: 1px 7px; }
.lm-caret { color: var(--text-tertiary, #94a3b8); font-size: 11px; transition: transform 0.15s; }
.lm-caret.open { transform: rotate(180deg); }
.lm-files { border-top: 1px solid var(--border-light, #e2e8f0); padding: 6px 12px 8px; display: flex; flex-direction: column; gap: 4px; }
.lm-file { display: flex; align-items: center; gap: 8px; padding: 5px 4px; font-size: 13px; color: var(--text-primary, #1e293b); border-radius: 6px; cursor: pointer; }
.lm-file:hover { background: var(--bg-subtle, #f1f5f9); }
.lm-file.selected { background: var(--brand-light, #eff6ff); }
.lm-file--empty { color: var(--text-tertiary, #94a3b8); font-size: 12px; cursor: default; }
.lm-file-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lm-radio { width: 20px; height: 20px; flex-shrink: 0; border-radius: 50%; border: 2px solid var(--border-light, #e2e8f0); background: var(--bg-surface, #fff); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; color: #fff; font-size: 10px; padding: 0; transition: all 0.12s; }
.lm-radio:hover { border-color: var(--brand-primary, #3b82f6); }
.lm-radio.on { background: var(--brand-primary, #3b82f6); border-color: var(--brand-primary, #3b82f6); }
.lm-radio--sm { width: 17px; height: 17px; font-size: 8px; }
.lm-footer { display: flex; align-items: center; gap: 12px; padding: 12px 20px; border-top: 1px solid var(--border-light, #e2e8f0); flex-shrink: 0; }
.lm-selected-label { flex: 1; font-size: 13px; color: var(--brand-primary, #3b82f6); font-weight: 600; display: flex; align-items: center; gap: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lm-selected-label--empty { color: var(--text-tertiary, #94a3b8); font-weight: 400; }
.lm-link-btn { display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0; padding: 9px 18px; border: none; border-radius: 8px; background: var(--brand-primary, #3b82f6); color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; }
.lm-link-btn:disabled { opacity: 0.5; cursor: default; }
</style>
