<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import WikiTreeNode from '../components/WikiTreeNode.vue'
import WikiBlockEditor from '../components/WikiBlockEditor.vue'

const API = '/apisup/supply/wiki'

// ── Тема ──
const dark = ref(localStorage.getItem('wiki.theme') === 'dark')
const toggleTheme = () => { dark.value = !dark.value; localStorage.setItem('wiki.theme', dark.value ? 'dark' : 'light') }

// ── Режим редактирования (только для роли администратора) ──
const EDIT_ROLE = '697afdbf-4f2e-47fb-8277-7127b9b85317'
const canEdit = ref(false)
const editMode = ref(false)
const checkRole = async () => {
  try {
    const r = await fetch('/api/as/users/me', { credentials: 'include' })
    if (r.ok) {
      const me = await r.json()
      canEdit.value = (me.roles || []).some(role => role.id === EDIT_ROLE)
    }
  } catch { /* ignore */ }
}

// ── Дерево ──
const tree = ref([])
const loadingTree = ref(true)
const search = ref('')

const normalize = (nodes) => (nodes || []).map(n => ({
  id: n.id,
  title: n.title,
  slug: n.slug,
  kind: n.kind,
  parent_id: n.parent_id ?? null,
  position: n.position ?? 0,
  open: n.open ?? false,
  children: normalize(n.children),
}))

const loadTree = async () => {
  loadingTree.value = true
  try {
    const r = await fetch(`${API}/tree`, { credentials: 'include' })
    if (r.ok) tree.value = normalize(await r.json())
  } catch { /* ignore */ } finally { loadingTree.value = false }
}

// поиск по дереву
const matchTree = (nodes, q) => {
  const out = []
  for (const n of nodes) {
    const kids = matchTree(n.children || [], q)
    if (n.title.toLowerCase().includes(q) || kids.length) {
      out.push({ ...n, open: true, children: kids.length ? kids : (n.children || []) })
    }
  }
  return out
}
const filteredTree = computed(() => {
  const q = search.value.toLowerCase().trim()
  return q ? matchTree(tree.value, q) : tree.value
})

// ── Текущая страница ──
const activePage = ref(null)
const loadingPage = ref(false)

const selectPage = async (node) => {
  if (editing.value) return
  loadingPage.value = true
  activePage.value = { id: node.id, title: node.title, html: '' }
  try {
    const r = await fetch(`${API}/pages/${node.id}`, { credentials: 'include' })
    if (r.ok) {
      const d = await r.json()
      activePage.value = { id: d.id, title: d.title, html: d.content?.html || '' }
    }
  } catch { /* ignore */ } finally {
    loadingPage.value = false
    nextTick(buildToc)
  }
}
const toggleSection = (n) => { n.open = !n.open }

// ── Оглавление ──
const articleEl = ref(null)
const toc = ref([])
const activeAnchor = ref('')
const buildToc = () => {
  toc.value = []
  const root = articleEl.value?.querySelector('.wk-content')
  if (!root) return
  const heads = [...root.querySelectorAll('h2, h3')]
  toc.value = heads.map((h, i) => { if (!h.id) h.id = 'h-' + i; return { id: h.id, text: h.textContent, level: h.tagName === 'H3' ? 2 : 1 } })
  activeAnchor.value = toc.value[0]?.id || ''
}
const scrollToAnchor = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
const onScroll = () => {
  if (!articleEl.value) return
  const top = articleEl.value.scrollTop + 90
  let cur = toc.value[0]?.id
  for (const t of toc.value) { const el = document.getElementById(t.id); if (el && el.offsetTop <= top) cur = t.id }
  activeAnchor.value = cur
}

// ── Контекстное меню узла ──
const menu = ref({ open: false, x: 0, y: 0, node: null })
const openMenu = (node, e) => {
  const r = e.currentTarget.getBoundingClientRect()
  menu.value = { open: true, x: r.right - 180, y: r.bottom + 4, node }
}
const closeMenu = () => { menu.value.open = false }
onMounted(() => window.addEventListener('click', closeMenu))
onUnmounted(() => window.removeEventListener('click', closeMenu))

// ── Диалог создания/переименования ──
const dialog = ref({ open: false, mode: '', title: '', kind: 'page', parentId: null, nodeId: null })
const openCreate = (kind, parentId) => { dialog.value = { open: true, mode: 'create', title: '', kind, parentId, nodeId: null }; closeMenu() }
const openRename = (node) => { dialog.value = { open: true, mode: 'rename', title: node.title, kind: node.kind, parentId: null, nodeId: node.id }; closeMenu() }
const submitDialog = async () => {
  const title = dialog.value.title.trim()
  if (!title) return
  try {
    if (dialog.value.mode === 'create') {
      await fetch(`${API}/pages`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, kind: dialog.value.kind, parent_id: dialog.value.parentId }),
      })
    } else {
      await fetch(`${API}/pages/${dialog.value.nodeId}`, {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
    }
    dialog.value.open = false
    await loadTree()
  } catch { /* ignore */ }
}

const removeNode = async (node) => {
  closeMenu()
  if (!confirm(`Удалить «${node.title}»${node.kind === 'section' ? ' и всё содержимое' : ''}?`)) return
  try {
    await fetch(`${API}/pages/${node.id}`, { method: 'DELETE', credentials: 'include' })
    if (activePage.value && String(activePage.value.id) === String(node.id)) activePage.value = null
    await loadTree()
  } catch { /* ignore */ }
}

// ── Drag-n-drop ──
const draggingNode = ref(null)
const onDragStart = (node) => { draggingNode.value = node }

const findParentAndIndex = (nodes, id, parent = null) => {
  for (let i = 0; i < nodes.length; i++) {
    if (String(nodes[i].id) === String(id)) return { parent, list: nodes, index: i }
    const f = findParentAndIndex(nodes[i].children || [], id, nodes[i])
    if (f) return f
  }
  return null
}
const isDescendant = (node, maybeChildId) => {
  for (const c of node.children || []) {
    if (String(c.id) === String(maybeChildId) || isDescendant(c, maybeChildId)) return true
  }
  return false
}

const onDropNode = async (target, pos) => {
  const src = draggingNode.value
  draggingNode.value = null
  if (!src || String(src.id) === String(target.id)) return
  if (isDescendant(src, target.id)) return // нельзя внутрь своего потомка

  let parentId, position
  if (pos === 'inside') {
    parentId = target.id
    position = (target.children || []).length
  } else {
    const loc = findParentAndIndex(tree.value, target.id)
    if (!loc) return
    parentId = loc.parent ? loc.parent.id : null
    position = pos === 'after' ? loc.index + 1 : loc.index
  }
  try {
    await fetch(`${API}/pages/${src.id}`, {
      method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parent_id: parentId, position }),
    })
    await loadTree()
  } catch { /* ignore */ }
}

// ── Редактор контента ──
const editing = ref(false)
const startEdit = () => { editing.value = true }
const cancelEdit = () => { editing.value = false; nextTick(buildToc) }

const savePage = async ({ html, blocks }) => {
  if (!activePage.value) return
  try {
    await fetch(`${API}/pages/${activePage.value.id}`, {
      method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: { html, blocks } }),
    })
    activePage.value.html = html
    editing.value = false
    nextTick(buildToc)
  } catch { /* ignore */ }
}

onMounted(() => { loadTree(); checkRole() })
</script>

<template>
  <div class="wk" :class="{ dark }">
    <!-- Шапка -->
    <header class="wk-top">
      <div class="wk-brand">
        <div class="wk-logo"><i class="fas fa-layer-group"></i></div>
        <span>КОПЗАКУПКИ</span>
        <span class="wk-brand-sub">База знаний</span>
      </div>
      <nav class="wk-topnav">
        <a class="wk-topnav-link active">Документация</a>
        <a class="wk-topnav-link" href="/news">Новости</a>
      </nav>
      <div class="wk-top-right">
        <button v-if="canEdit" class="wk-editbtn" :class="{ on: editMode }" @click="editMode = !editMode">
          <i class="fas fa-pen"></i> {{ editMode ? 'Готово' : 'Редактирование' }}
        </button>
        <button class="wk-theme" @click="toggleTheme" :title="dark ? 'Светлая тема' : 'Тёмная тема'">
          <i class="fas" :class="dark ? 'fa-sun' : 'fa-moon'"></i>
        </button>
      </div>
    </header>

    <div class="wk-body">
      <!-- Дерево -->
      <aside class="wk-nav">
        <div class="wk-search">
          <i class="fas fa-search"></i>
          <input v-model="search" type="text" placeholder="Поиск по документации..." />
        </div>
        <nav class="wk-tree">
          <div v-if="loadingTree" class="wk-empty">Загрузка…</div>
          <template v-else>
            <WikiTreeNode
              v-for="n in filteredTree" :key="n.id" :node="n"
              :active-id="activePage?.id" :edit-mode="editMode"
              @select="selectPage" @toggle="toggleSection"
              @menu="openMenu" @dragstart="onDragStart" @dropnode="onDropNode" />
            <div v-if="!filteredTree.length" class="wk-empty">Ничего не найдено</div>
          </template>
        </nav>
        <div v-if="editMode" class="wk-add-root-row">
          <button class="wk-add-root" @click="openCreate('section', null)"><i class="fas fa-folder-plus"></i> Раздел</button>
          <button class="wk-add-root" @click="openCreate('page', null)"><i class="fas fa-file-circle-plus"></i> Страница</button>
        </div>
      </aside>

      <!-- Статья -->
      <main ref="articleEl" class="wk-article" @scroll="onScroll">
        <div class="wk-inner">
          <template v-if="!activePage">
            <div class="wk-placeholder">
              <i class="fas fa-book-open"></i>
              <p>Выберите страницу слева</p>
            </div>
          </template>

          <template v-else>
            <div class="wk-crumbs"><i class="fas fa-house"></i> <i class="fas fa-angle-right"></i> <span class="wk-crumb-cur">{{ activePage.title }}</span></div>

            <div class="wk-page-head">
              <h1 class="wk-h1">{{ activePage.title }}</h1>
              <button v-if="editMode && !editing" class="wk-editpage" @click="startEdit"><i class="fas fa-pen"></i> Изменить</button>
            </div>

            <!-- Просмотр -->
            <article v-if="!editing" class="wk-content" v-html="activePage.html || '<p class=&quot;wk-muted-p&quot;>Страница пока пустая.</p>'"></article>

            <!-- Редактор -->
            <WikiBlockEditor v-else :html="activePage.html" :api="API" :dark="dark"
              @save="savePage" @cancel="cancelEdit" />
          </template>
        </div>
      </main>

      <!-- Оглавление -->
      <aside v-if="activePage && !editing" class="wk-toc">
        <div class="wk-toc-title">На этой странице</div>
        <a v-for="t in toc" :key="t.id" class="wk-toc-link"
          :class="{ active: activeAnchor === t.id, sub: t.level === 2 }"
          @click.prevent="scrollToAnchor(t.id)">{{ t.text }}</a>
        <div v-if="!toc.length" class="wk-toc-empty">—</div>
      </aside>
    </div>

    <!-- Контекстное меню -->
    <Teleport to="body">
      <div v-if="menu.open" class="wk-menu" :class="{ dark }" :style="{ left: menu.x + 'px', top: menu.y + 'px' }" @click.stop>
        <button v-if="menu.node.kind === 'section'" @click="openCreate('section', menu.node.id)"><i class="fas fa-folder-plus"></i> Подраздел</button>
        <button v-if="menu.node.kind === 'section'" @click="openCreate('page', menu.node.id)"><i class="fas fa-file-circle-plus"></i> Страницу</button>
        <button @click="openRename(menu.node)"><i class="fas fa-pen"></i> Переименовать</button>
        <button class="danger" @click="removeNode(menu.node)"><i class="fas fa-trash"></i> Удалить</button>
      </div>
    </Teleport>

    <!-- Диалог -->
    <Teleport to="body">
      <div v-if="dialog.open" class="wk-overlay" :class="{ dark }" @click.self="dialog.open = false">
        <div class="wk-dialog">
          <h3>{{ dialog.mode === 'rename' ? 'Переименовать' : dialog.kind === 'section' ? 'Новый раздел' : 'Новая страница' }}</h3>
          <input v-model="dialog.title" type="text" placeholder="Название" @keyup.enter="submitDialog" />
          <div class="wk-dialog-actions">
            <button class="wk-btn ghost" @click="dialog.open = false">Отмена</button>
            <button class="wk-btn primary" @click="submitDialog">{{ dialog.mode === 'rename' ? 'Сохранить' : 'Создать' }}</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.wk {
  --wk-bg: #ffffff; --wk-surface: #ffffff; --wk-side: #fbfcfe; --wk-border: #eaedf2;
  --wk-text: #0f172a; --wk-text-2: #475569; --wk-muted: #94a3b8;
  --wk-brand: #3b82f6; --wk-brand-soft: #eff6ff; --wk-code-bg: #f6f8fa;
  height: 100vh; display: flex; flex-direction: column; background: var(--wk-bg); color: var(--wk-text);
}
.wk.dark {
  --wk-bg: #0d1117; --wk-surface: #0d1117; --wk-side: #0b0e14; --wk-border: #20262e;
  --wk-text: #e6edf3; --wk-text-2: #b2bac6; --wk-muted: #7d8590;
  --wk-brand: #60a5fa; --wk-brand-soft: #172234; --wk-code-bg: #161b22;
}

/* Шапка */
.wk-top { display: flex; align-items: center; gap: 28px; height: 60px; padding: 0 24px; border-bottom: 1px solid var(--wk-border); background: var(--wk-surface); flex-shrink: 0; }
.wk-brand { display: flex; align-items: center; gap: 10px; font-size: 17px; font-weight: 800; letter-spacing: -0.4px; }
.wk-logo { width: 32px; height: 32px; border-radius: 9px; background: linear-gradient(135deg, #3b82f6, #2563eb); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 15px; }
.wk-brand-sub { font-size: 12px; font-weight: 600; color: var(--wk-muted); padding: 3px 8px; border: 1px solid var(--wk-border); border-radius: 20px; letter-spacing: 0; }
.wk-topnav { display: flex; align-items: center; gap: 4px; }
.wk-topnav-link { padding: 7px 12px; border-radius: 8px; font-size: 14px; font-weight: 600; color: var(--wk-text-2); text-decoration: none; cursor: pointer; }
.wk-topnav-link:hover { background: var(--wk-brand-soft); color: var(--wk-brand); }
.wk-topnav-link.active { color: var(--wk-brand); }
.wk-top-right { margin-left: auto; display: flex; align-items: center; gap: 10px; }
.wk-editbtn { display: flex; align-items: center; gap: 7px; height: 38px; padding: 0 14px; border-radius: 10px; border: 1px solid var(--wk-border); background: var(--wk-surface); color: var(--wk-text-2); cursor: pointer; font-size: 13px; font-weight: 600; }
.wk-editbtn:hover { color: var(--wk-brand); border-color: var(--wk-brand); }
.wk-editbtn.on { background: var(--wk-brand); border-color: var(--wk-brand); color: #fff; }
.wk-theme { width: 38px; height: 38px; border-radius: 10px; border: 1px solid var(--wk-border); background: var(--wk-surface); color: var(--wk-text-2); cursor: pointer; font-size: 15px; }
.wk-theme:hover { color: var(--wk-brand); border-color: var(--wk-brand); }

.wk-body { flex: 1; display: grid; grid-template-columns: 280px minmax(0,1fr) 240px; overflow: hidden; }

/* Дерево */
.wk-nav { background: var(--wk-side); border-right: 1px solid var(--wk-border); display: flex; flex-direction: column; overflow: hidden; }
.wk-search { position: relative; padding: 16px 16px 10px; }
.wk-search i { position: absolute; left: 27px; top: calc(50% + 3px); transform: translateY(-50%); color: var(--wk-muted); font-size: 12px; }
.wk-search input { width: 100%; height: 38px; padding: 0 12px 0 32px; box-sizing: border-box; border: 1px solid var(--wk-border); border-radius: 10px; font-size: 13px; outline: none; background: var(--wk-surface); color: var(--wk-text); }
.wk-search input:focus { border-color: var(--wk-brand); box-shadow: 0 0 0 3px var(--wk-brand-soft); }
.wk-tree { flex: 1; overflow-y: auto; padding: 6px 10px 24px; }
.wk-empty { padding: 16px; font-size: 13px; color: var(--wk-muted); text-align: center; }
.wk-add-root-row { display: flex; gap: 8px; margin: 10px 14px 16px; }
.wk-add-root { flex: 1; display: flex; align-items: center; justify-content: center; gap: 7px; height: 40px; border: 1px dashed var(--wk-border); border-radius: 10px; background: none; color: var(--wk-text-2); cursor: pointer; font-size: 12.5px; font-weight: 600; }
.wk-add-root:hover { color: var(--wk-brand); border-color: var(--wk-brand); }

/* Статья */
.wk-article { overflow-y: auto; background: var(--wk-bg); }
.wk-inner { max-width: 780px; margin: 0 auto; padding: 30px 40px 100px; }
.wk-placeholder { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 120px 0; color: var(--wk-muted); }
.wk-placeholder i { font-size: 40px; }
.wk-crumbs { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--wk-muted); margin-bottom: 12px; }
.wk-crumb-cur { color: var(--wk-brand); font-weight: 600; }
.wk-page-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 8px; }
.wk-h1 { font-size: 34px; font-weight: 800; letter-spacing: -0.8px; margin: 0; }
.wk-editpage { display: flex; align-items: center; gap: 7px; height: 34px; padding: 0 12px; border-radius: 9px; border: 1px solid var(--wk-border); background: var(--wk-surface); color: var(--wk-text-2); cursor: pointer; font-size: 13px; font-weight: 600; flex-shrink: 0; }
.wk-editpage:hover { color: var(--wk-brand); border-color: var(--wk-brand); }

/* Контент */
.wk-content :deep(h2) { font-size: 22px; font-weight: 700; margin: 34px 0 12px; color: var(--wk-text); scroll-margin-top: 24px; }
.wk-content :deep(h3) { font-size: 17px; font-weight: 700; margin: 24px 0 8px; color: var(--wk-text); scroll-margin-top: 24px; }
.wk-content :deep(p) { font-size: 15.5px; line-height: 1.75; margin: 12px 0; color: var(--wk-text-2); }
.wk-content :deep(.wk-muted-p) { color: var(--wk-muted); font-style: italic; }
.wk-content :deep(ol), .wk-content :deep(ul) { padding-left: 22px; font-size: 15.5px; line-height: 1.85; color: var(--wk-text-2); }
.wk-content :deep(strong) { color: var(--wk-text); }
.wk-content :deep(img) { max-width: 100%; border-radius: 12px; margin: 12px 0; }
.wk-content :deep(video) { max-width: 100%; border-radius: 12px; margin: 12px 0; display: block; background: #000; }
.wk-content :deep(a) { color: var(--wk-brand); text-decoration: none; font-weight: 500; border-bottom: 1px solid color-mix(in srgb, var(--wk-brand) 35%, transparent); }
.wk-content :deep(a:hover) { border-bottom-color: currentColor; }
.wk-content :deep(.cx-callout) { display: flex; gap: 12px; padding: 15px 18px; border-radius: 14px; margin: 18px 0; font-size: 14.5px; line-height: 1.6; border: 1px solid; color: var(--wk-text); }
.wk-content :deep(.cx-callout i) { margin-top: 2px; font-size: 15px; }
.wk-content :deep(.cx-callout--info) { background: color-mix(in srgb, var(--wk-brand) 8%, transparent); border-color: color-mix(in srgb, var(--wk-brand) 30%, transparent); }
.wk-content :deep(.cx-callout--info i) { color: var(--wk-brand); }
.wk-content :deep(.cx-callout--warn) { background: color-mix(in srgb, #f59e0b 12%, transparent); border-color: color-mix(in srgb, #f59e0b 35%, transparent); }
.wk-content :deep(.cx-callout--warn i) { color: #f59e0b; }
.wk-content :deep(.cx-table) { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px; }
.wk-content :deep(.cx-table th), .wk-content :deep(.cx-table td) { border: 1px solid var(--wk-border); padding: 10px 14px; text-align: left; }
.wk-content :deep(.cx-table th) { background: var(--wk-code-bg); font-weight: 700; color: var(--wk-text); }
.wk-content :deep(.cx-spoiler) { border: 1px solid var(--wk-border); border-radius: 12px; margin: 16px 0; overflow: hidden; background: var(--wk-code-bg); }
.wk-content :deep(.cx-spoiler > summary) { cursor: pointer; padding: 12px 16px; font-weight: 600; font-size: 14.5px; color: var(--wk-text); }
.wk-content :deep(.cx-spoiler > div) { padding: 4px 16px 14px; font-size: 14.5px; color: var(--wk-text-2); }

/* Редактор */
.wk-toolbar { position: sticky; top: 0; z-index: 5; display: flex; flex-wrap: wrap; align-items: center; gap: 2px; padding: 8px; margin-bottom: 14px; border: 1px solid var(--wk-border); border-radius: 12px; background: var(--wk-surface); }
.wk-toolbar button { min-width: 32px; height: 32px; padding: 0 8px; border: none; background: none; border-radius: 7px; cursor: pointer; color: var(--wk-text-2); font-size: 13px; font-weight: 700; }
.wk-toolbar button:hover { background: var(--wk-brand-soft); color: var(--wk-brand); }
.wk-sep { width: 1px; height: 20px; background: var(--wk-border); margin: 0 4px; }
.wk-editable { min-height: 320px; outline: none; border: 1px solid var(--wk-border); border-radius: 12px; padding: 18px 20px; }
.wk-editable:focus { border-color: var(--wk-brand); box-shadow: 0 0 0 3px var(--wk-brand-soft); }
.wk-editor-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }

.wk-btn { height: 40px; padding: 0 18px; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; border: 1px solid var(--wk-border); }
.wk-btn.ghost { background: var(--wk-surface); color: var(--wk-text-2); }
.wk-btn.ghost:hover { color: var(--wk-text); }
.wk-btn.primary { background: var(--wk-brand); border-color: var(--wk-brand); color: #fff; }
.wk-btn.primary:disabled { opacity: 0.6; cursor: default; }

/* Оглавление */
.wk-toc { background: transparent; padding: 30px 18px; overflow-y: auto; }
.wk-toc-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: var(--wk-muted); margin-bottom: 12px; }
.wk-toc-empty { color: var(--wk-muted); font-size: 13px; }
.wk-toc-link { display: block; padding: 6px 0 6px 12px; border-left: 2px solid var(--wk-border); font-size: 13px; color: var(--wk-text-2); cursor: pointer; }
.wk-toc-link:hover { color: var(--wk-text); }
.wk-toc-link.sub { padding-left: 24px; }
.wk-toc-link.active { color: var(--wk-brand); border-left-color: var(--wk-brand); font-weight: 600; }

@media (max-width: 1100px) { .wk-body { grid-template-columns: 260px 1fr; } .wk-toc { display: none; } }

/* Телепорты: собственные цвета (вне .wk переменные недоступны) */
.wk-menu {
  --m-surface: #fff; --m-border: #eaedf2; --m-text: #475569; --m-brand: #3b82f6; --m-brand-soft: #eff6ff;
  position: fixed; z-index: 300; width: 190px; padding: 6px; border-radius: 14px;
  border: 1px solid var(--m-border); background: var(--m-surface); box-shadow: 0 12px 34px rgba(15,23,42,0.14);
}
.wk-menu.dark { --m-surface: #161b22; --m-border: #2a313b; --m-text: #b2bac6; --m-brand: #60a5fa; --m-brand-soft: #1c2740; box-shadow: 0 12px 34px rgba(0,0,0,0.55); }
.wk-menu button { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 11px; border: none; background: none; border-radius: 9px; cursor: pointer; font-size: 13px; font-weight: 500; color: var(--m-text); text-align: left; }
.wk-menu button i { width: 15px; text-align: center; opacity: 0.85; }
.wk-menu button:hover { background: var(--m-brand-soft); color: var(--m-brand); }
.wk-menu button.danger:hover { background: rgba(239,68,68,0.12); color: #ef4444; }

/* Диалог */
.wk-overlay {
  --d-surface: #fff; --d-bg: #f8fafc; --d-border: #e5e9f0; --d-text: #0f172a; --d-text-2: #64748b;
  --d-brand: #3b82f6; --d-brand-soft: #eff6ff;
  position: fixed; inset: 0; z-index: 320; background: rgba(15,23,42,0.45);
  backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; padding: 20px;
}
.wk-overlay.dark { --d-surface: #161b22; --d-bg: #0d1117; --d-border: #2a313b; --d-text: #e6edf3; --d-text-2: #9aa4b2; --d-brand: #60a5fa; --d-brand-soft: #1c2740; background: rgba(0,0,0,0.6); }
.wk-dialog {
  width: 400px; max-width: 100%; box-sizing: border-box; background: var(--d-surface);
  border: 1px solid var(--d-border); border-radius: 18px; padding: 24px;
  box-shadow: 0 24px 60px rgba(15,23,42,0.28); animation: wk-pop 0.16s ease-out;
}
@keyframes wk-pop { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: none; } }
.wk-dialog h3 { margin: 0 0 4px; font-size: 18px; font-weight: 700; color: var(--d-text); letter-spacing: -0.3px; }
.wk-dialog input {
  width: 100%; height: 46px; box-sizing: border-box; margin-top: 16px; padding: 0 15px;
  border: 1.5px solid var(--d-border); border-radius: 12px; font-size: 15px; outline: none;
  background: var(--d-bg); color: var(--d-text); transition: border-color 0.15s, box-shadow 0.15s;
}
.wk-dialog input::placeholder { color: var(--d-text-2); }
.wk-dialog input:focus { border-color: var(--d-brand); box-shadow: 0 0 0 4px var(--d-brand-soft); }
.wk-dialog-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 22px; }
.wk-dialog-actions .wk-btn { height: 42px; padding: 0 20px; border-radius: 11px; }
.wk-dialog-actions .wk-btn.ghost { background: transparent; border-color: var(--d-border); color: var(--d-text-2); }
.wk-dialog-actions .wk-btn.ghost:hover { color: var(--d-text); background: var(--d-bg); }
.wk-dialog-actions .wk-btn.primary { background: var(--d-brand); border-color: var(--d-brand); color: #fff; }
.wk-dialog-actions .wk-btn.primary:hover { filter: brightness(1.05); }
</style>
