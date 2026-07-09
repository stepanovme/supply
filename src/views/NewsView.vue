<script setup>
import { onMounted, ref } from 'vue'
import WikiBlockEditor from '../components/WikiBlockEditor.vue'

const API = '/apisup/supply/news'

// ── Тема ──
const dark = ref(localStorage.getItem('wiki.theme') === 'dark')
const toggleTheme = () => { dark.value = !dark.value; localStorage.setItem('wiki.theme', dark.value ? 'dark' : 'light') }

const EDIT_ROLE = '697afdbf-4f2e-47fb-8277-7127b9b85317'
const canEdit = ref(false)
const editMode = ref(false)
const mode = ref('list') // list | post | edit
const checkRole = async () => {
  try {
    const r = await fetch('/api/as/users/me', { credentials: 'include' })
    if (r.ok) {
      const me = await r.json()
      canEdit.value = (me.roles || []).some(role => role.id === EDIT_ROLE)
    }
  } catch { /* ignore */ }
}

// ── Лента ──
const posts = ref([])
const loadingList = ref(true)
const loadList = async () => {
  loadingList.value = true
  try {
    const r = await fetch(API, { credentials: 'include' })
    if (r.ok) posts.value = await r.json()
  } catch { /* ignore */ } finally { loadingList.value = false }
}

// ── Пост ──
const activePost = ref(null)
const openPost = async (id) => {
  mode.value = 'post'
  activePost.value = null
  try {
    const r = await fetch(`${API}/${id}`, { credentials: 'include' })
    if (r.ok) activePost.value = await r.json()
  } catch { /* ignore */ }
}
const backToList = () => { mode.value = 'list'; activePost.value = null }

const fmtDate = (s) => {
  if (!s) return ''
  try { return new Date(s).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) } catch { return s }
}

// ── Редактирование ──
const form = ref(null)
const coverInput = ref(null)
const saving = ref(false)

const newPost = () => { form.value = { id: null, title: '', cover: '', content: { html: '' }, is_published: true }; mode.value = 'edit' }
const editPost = () => {
  if (!activePost.value) return
  form.value = { id: activePost.value.id, title: activePost.value.title, cover: activePost.value.cover || '', content: activePost.value.content || { html: '' }, is_published: activePost.value.is_published ?? true }
  mode.value = 'edit'
}
const cancelEdit = () => { mode.value = form.value?.id ? 'post' : 'list' }

const uploadCover = async (e) => {
  const file = e.target.files?.[0]; e.target.value = ''
  if (!file) return
  const fd = new FormData(); fd.append('file', file)
  try {
    const r = await fetch(`${API}/upload`, { method: 'POST', credentials: 'include', body: fd })
    if (r.ok) form.value.cover = (await r.json()).url
  } catch { /* ignore */ }
}

const saveEditor = ({ html }) => { form.value.content = { html } }

const savePost = async () => {
  const f = form.value
  if (!f.title.trim()) { alert('Введите заголовок'); return }
  saving.value = true
  const body = JSON.stringify({ title: f.title, cover: f.cover, content: f.content, is_published: f.is_published })
  try {
    let id = f.id
    if (id) {
      await fetch(`${API}/${id}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body })
    } else {
      const r = await fetch(API, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body })
      if (r.ok) id = (await r.json())?.id
    }
    await loadList()
    if (id) await openPost(id); else backToList()
  } catch { /* ignore */ } finally { saving.value = false }
}

const removePost = async () => {
  if (!activePost.value || !confirm('Удалить новость?')) return
  try {
    await fetch(`${API}/${activePost.value.id}`, { method: 'DELETE', credentials: 'include' })
    await loadList(); backToList()
  } catch { /* ignore */ }
}

onMounted(() => { loadList(); checkRole() })
</script>

<template>
  <div class="nw" :class="{ dark }">
    <!-- Шапка -->
    <header class="nw-top">
      <div class="nw-brand">
        <div class="nw-logo"><i class="fas fa-layer-group"></i></div>
        <span>КОПЗАКУПКИ</span>
        <span class="nw-brand-sub">Новости</span>
      </div>
      <nav class="nw-topnav">
        <a class="nw-topnav-link" href="/wiki">Документация</a>
        <a class="nw-topnav-link active">Новости</a>
      </nav>
      <div class="nw-top-right">
        <button v-if="canEdit" class="nw-editbtn" :class="{ on: editMode }" @click="editMode = !editMode">
          <i class="fas fa-pen"></i> {{ editMode ? 'Готово' : 'Редактирование' }}
        </button>
        <button class="nw-theme" @click="toggleTheme" :title="dark ? 'Светлая тема' : 'Тёмная тема'">
          <i class="fas" :class="dark ? 'fa-sun' : 'fa-moon'"></i>
        </button>
      </div>
    </header>

    <main class="nw-body">
      <!-- Лента -->
      <template v-if="mode === 'list'">
        <div class="nw-list-head">
          <h1>Новости</h1>
          <button v-if="editMode" class="nw-btn primary" @click="newPost"><i class="fas fa-plus"></i> Новость</button>
        </div>
        <div v-if="loadingList" class="nw-empty">Загрузка…</div>
        <div v-else-if="!posts.length" class="nw-empty">Пока нет новостей</div>
        <div v-else class="nw-feed">
          <article v-for="p in posts" :key="p.id" class="nw-card" @click="openPost(p.id)">
            <div v-if="p.cover" class="nw-card-cover"><img :src="p.cover" alt="" /></div>
            <div class="nw-card-body">
              <div class="nw-card-meta">
                <span>{{ fmtDate(p.published_at || p.created_at) }}</span>
                <span v-if="editMode && p.is_published === false" class="nw-draft">Черновик</span>
              </div>
              <h2>{{ p.title }}</h2>
              <p v-if="p.excerpt">{{ p.excerpt }}</p>
            </div>
          </article>
        </div>
      </template>

      <!-- Просмотр поста -->
      <template v-else-if="mode === 'post'">
        <button class="nw-back" @click="backToList"><i class="fas fa-arrow-left"></i> Все новости</button>
        <div v-if="!activePost" class="nw-empty">Загрузка…</div>
        <article v-else class="nw-article">
          <div v-if="activePost.cover" class="nw-article-cover"><img :src="activePost.cover" alt="" /></div>
          <div class="nw-article-meta">
            <span>{{ fmtDate(activePost.published_at || activePost.created_at) }}</span>
            <button v-if="editMode" class="nw-mini" @click="editPost"><i class="fas fa-pen"></i> Изменить</button>
            <button v-if="editMode" class="nw-mini danger" @click="removePost"><i class="fas fa-trash"></i></button>
          </div>
          <h1>{{ activePost.title }}</h1>
          <div class="nw-content" v-html="activePost.content?.html || ''"></div>
        </article>
      </template>

      <!-- Редактирование -->
      <template v-else-if="mode === 'edit'">
        <button class="nw-back" @click="cancelEdit"><i class="fas fa-arrow-left"></i> Отмена</button>
        <div class="nw-edit">
          <div class="nw-cover-edit">
            <div v-if="form.cover" class="nw-cover-preview"><img :src="form.cover" alt="" /><button class="nw-cover-del" @click="form.cover = ''"><i class="fas fa-times"></i></button></div>
            <button v-else class="nw-cover-add" @click="coverInput?.click()"><i class="fas fa-image"></i> Добавить обложку</button>
            <input ref="coverInput" type="file" accept="image/*" hidden @change="uploadCover" />
          </div>
          <input v-model="form.title" class="nw-title-input" placeholder="Заголовок новости" />
          <label class="nw-pub"><input type="checkbox" v-model="form.is_published" /> Опубликовать</label>
          <WikiBlockEditor :html="form.content?.html || ''" :api="API" :dark="dark"
            @save="({ html }) => { saveEditor({ html }); savePost() }" @cancel="cancelEdit" />
        </div>
      </template>
    </main>
  </div>
</template>

<style scoped>
.nw {
  --wk-bg: #ffffff; --wk-surface: #ffffff; --wk-border: #eaedf2;
  --wk-text: #0f172a; --wk-text-2: #475569; --wk-muted: #94a3b8;
  --wk-brand: #3b82f6; --wk-brand-soft: #eff6ff; --wk-code-bg: #f6f8fa;
  min-height: 100vh; display: flex; flex-direction: column; background: var(--wk-bg); color: var(--wk-text);
}
.nw.dark {
  --wk-bg: #0d1117; --wk-surface: #0d1117; --wk-border: #20262e;
  --wk-text: #e6edf3; --wk-text-2: #b2bac6; --wk-muted: #7d8590;
  --wk-brand: #60a5fa; --wk-brand-soft: #172234; --wk-code-bg: #161b22;
}

/* Шапка */
.nw-top { display: flex; align-items: center; gap: 28px; height: 60px; padding: 0 24px; border-bottom: 1px solid var(--wk-border); background: var(--wk-surface); position: sticky; top: 0; z-index: 20; }
.nw-brand { display: flex; align-items: center; gap: 10px; font-size: 17px; font-weight: 800; letter-spacing: -0.4px; }
.nw-logo { width: 32px; height: 32px; border-radius: 9px; background: linear-gradient(135deg, #3b82f6, #2563eb); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 15px; }
.nw-brand-sub { font-size: 12px; font-weight: 600; color: var(--wk-muted); padding: 3px 8px; border: 1px solid var(--wk-border); border-radius: 20px; }
.nw-topnav { display: flex; gap: 4px; }
.nw-topnav-link { padding: 7px 12px; border-radius: 8px; font-size: 14px; font-weight: 600; color: var(--wk-text-2); text-decoration: none; cursor: pointer; }
.nw-topnav-link:hover { background: var(--wk-brand-soft); color: var(--wk-brand); }
.nw-topnav-link.active { color: var(--wk-brand); }
.nw-top-right { margin-left: auto; display: flex; align-items: center; gap: 10px; }
.nw-editbtn { display: flex; align-items: center; gap: 7px; height: 38px; padding: 0 14px; border-radius: 10px; border: 1px solid var(--wk-border); background: var(--wk-surface); color: var(--wk-text-2); cursor: pointer; font-size: 13px; font-weight: 600; }
.nw-editbtn:hover { color: var(--wk-brand); border-color: var(--wk-brand); }
.nw-editbtn.on { background: var(--wk-brand); border-color: var(--wk-brand); color: #fff; }
.nw-theme { width: 38px; height: 38px; border-radius: 10px; border: 1px solid var(--wk-border); background: var(--wk-surface); color: var(--wk-text-2); cursor: pointer; font-size: 15px; }
.nw-theme:hover { color: var(--wk-brand); border-color: var(--wk-brand); }

.nw-body { flex: 1; max-width: 760px; width: 100%; margin: 0 auto; padding: 36px 24px 100px; box-sizing: border-box; }
.nw-empty { padding: 60px 0; text-align: center; color: var(--wk-muted); }

/* Лента */
.nw-list-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
.nw-list-head h1 { font-size: 32px; font-weight: 800; letter-spacing: -0.6px; margin: 0; }
.nw-feed { display: flex; flex-direction: column; gap: 18px; }
.nw-card { display: flex; flex-direction: column; border: 1px solid var(--wk-border); border-radius: 16px; overflow: hidden; cursor: pointer; background: var(--wk-surface); transition: border-color 0.15s, transform 0.15s, box-shadow 0.15s; }
.nw-card:hover { border-color: var(--wk-brand); transform: translateY(-2px); box-shadow: 0 10px 30px rgba(15,23,42,0.08); }
.nw-card-cover { height: 200px; overflow: hidden; }
.nw-card-cover img { width: 100%; height: 100%; object-fit: cover; }
.nw-card-body { padding: 18px 20px; }
.nw-card-meta { display: flex; align-items: center; gap: 10px; font-size: 12.5px; color: var(--wk-muted); margin-bottom: 6px; }
.nw-draft { padding: 2px 8px; border-radius: 20px; background: color-mix(in srgb, #f59e0b 15%, transparent); color: #d97706; font-weight: 600; }
.nw-card-body h2 { font-size: 20px; font-weight: 700; margin: 0 0 6px; letter-spacing: -0.3px; }
.nw-card-body p { font-size: 14.5px; line-height: 1.6; color: var(--wk-text-2); margin: 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

/* Пост */
.nw-back { display: inline-flex; align-items: center; gap: 8px; margin-bottom: 20px; border: none; background: none; color: var(--wk-text-2); cursor: pointer; font-size: 14px; font-weight: 600; }
.nw-back:hover { color: var(--wk-brand); }
.nw-article-cover { border-radius: 18px; overflow: hidden; margin-bottom: 24px; max-height: 380px; }
.nw-article-cover img { width: 100%; height: 100%; object-fit: cover; }
.nw-article-meta { display: flex; align-items: center; gap: 12px; font-size: 13px; color: var(--wk-muted); margin-bottom: 10px; }
.nw-article h1 { font-size: 36px; font-weight: 800; letter-spacing: -0.8px; margin: 0 0 20px; }
.nw-mini { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--wk-border); background: var(--wk-surface); color: var(--wk-text-2); cursor: pointer; font-size: 12.5px; font-weight: 600; }
.nw-mini:hover { color: var(--wk-brand); border-color: var(--wk-brand); }
.nw-mini.danger:hover { color: #ef4444; border-color: #ef4444; }

/* Контент поста */
.nw-content :deep(h2) { font-size: 22px; font-weight: 700; margin: 30px 0 12px; color: var(--wk-text); }
.nw-content :deep(h3) { font-size: 17px; font-weight: 700; margin: 22px 0 8px; color: var(--wk-text); }
.nw-content :deep(p) { font-size: 16px; line-height: 1.8; margin: 12px 0; color: var(--wk-text-2); }
.nw-content :deep(ul), .nw-content :deep(ol) { padding-left: 22px; font-size: 16px; line-height: 1.85; color: var(--wk-text-2); }
.nw-content :deep(blockquote) { border-left: 3px solid var(--wk-border); padding-left: 16px; font-style: italic; color: var(--wk-text-2); margin: 16px 0; }
.nw-content :deep(strong) { color: var(--wk-text); }
.nw-content :deep(a) { color: var(--wk-brand); }
.nw-content :deep(img), .nw-content :deep(video) { max-width: 100%; border-radius: 12px; margin: 12px 0; display: block; }
.nw-content :deep(video) { background: #000; }
.nw-content :deep(.cx-callout) { display: flex; gap: 12px; padding: 15px 18px; border-radius: 14px; margin: 18px 0; font-size: 14.5px; line-height: 1.6; border: 1px solid; color: var(--wk-text); }
.nw-content :deep(.cx-callout--info) { background: color-mix(in srgb, var(--wk-brand) 8%, transparent); border-color: color-mix(in srgb, var(--wk-brand) 30%, transparent); }
.nw-content :deep(.cx-callout--info i) { color: var(--wk-brand); }
.nw-content :deep(.cx-callout--warn) { background: color-mix(in srgb, #f59e0b 12%, transparent); border-color: color-mix(in srgb, #f59e0b 35%, transparent); }
.nw-content :deep(.cx-callout--warn i) { color: #f59e0b; }

/* Редактирование */
.nw-cover-edit { margin-bottom: 18px; }
.nw-cover-add { display: flex; align-items: center; gap: 10px; width: 100%; height: 120px; justify-content: center; border: 1px dashed var(--wk-border); border-radius: 16px; background: none; color: var(--wk-text-2); cursor: pointer; font-size: 14px; font-weight: 600; }
.nw-cover-add:hover { color: var(--wk-brand); border-color: var(--wk-brand); }
.nw-cover-preview { position: relative; border-radius: 16px; overflow: hidden; max-height: 300px; }
.nw-cover-preview img { width: 100%; object-fit: cover; }
.nw-cover-del { position: absolute; top: 12px; right: 12px; width: 34px; height: 34px; border-radius: 50%; border: none; background: rgba(0,0,0,0.55); color: #fff; cursor: pointer; }
.nw-title-input { width: 100%; box-sizing: border-box; border: none; outline: none; background: none; font-size: 32px; font-weight: 800; letter-spacing: -0.6px; color: var(--wk-text); padding: 4px 0; margin-bottom: 8px; }
.nw-title-input::placeholder { color: var(--wk-muted); }
.nw-pub { display: inline-flex; align-items: center; gap: 8px; font-size: 13.5px; color: var(--wk-text-2); margin-bottom: 20px; cursor: pointer; }
.nw-pub input { width: 16px; height: 16px; accent-color: var(--wk-brand); }

.nw-btn { display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 18px; border-radius: 11px; font-size: 14px; font-weight: 600; cursor: pointer; border: 1px solid var(--wk-border); background: var(--wk-surface); color: var(--wk-text-2); }
.nw-btn.primary { background: var(--wk-brand); border-color: var(--wk-brand); color: #fff; }
</style>
