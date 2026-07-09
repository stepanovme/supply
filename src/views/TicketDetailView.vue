<script setup>
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTicketsStore } from '../stores/tickets'
import { useAuthStore } from '../stores/auth'
import { useChatStore } from '../stores/chat'
import TopNav from '../components/layout/TopNav.vue'
import { mainNavLinks } from '../constants/mainNav'

const route = useRoute()
const router = useRouter()
const ticketsStore = useTicketsStore()
const authStore = useAuthStore()
const chat = useChatStore()
const navLinks = mainNavLinks

const ticket = ref(null)
const messageText = ref('')
const attachmentFile = ref(null)
const attachmentPreview = ref('')
const messagesContainer = ref(null)
const showMembers = ref(false)
const fullscreenMedia = ref(null)

const ticketId = computed(() => Number(route.params.ticketId))

const typeOptions = [
  { value: 'problem', label: 'Проблема' },
  { value: 'suggestion', label: 'Предложение' },
  { value: 'question', label: 'Вопрос' },
]
const typeLabel = (t) => typeOptions.find(o => o.value === t)?.label || t
const roleLabel = (r) => r === 'author' ? 'Автор' : r === 'assignee' ? 'Ответственный' : r

const headerUsers = computed(() => {
  return (ticket.value?.users || []).filter(u => u.role_id !== 'assignee')
})

const currentUserRole = computed(() => {
  if (!ticket.value?.users || !authStore.user?.id) return null
  const u = ticket.value.users.find(x => x.user_id === authStore.user.id)
  return u?.role_id || null
})

const isAssignee = computed(() => currentUserRole.value === 'assignee')
const isCompleted = computed(() => ticket.value?.status_id === '1ff32c4b-1312-11f1-aa8c-bc241127d0bd')
const isMyMessage = (msg) => String(msg.sender_id || '') === String(authStore.user?.id || '')

const formatMsgTime = (v) => {
  if (!v) return ''
  return new Date(v).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

const formatMsgDate = (v) => {
  if (!v) return ''
  const d = new Date(v)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Сегодня'
  if (d.toDateString() === yesterday.toDateString()) return 'Вчера'
  return d.toLocaleDateString('ru-RU')
}

const messageGroups = computed(() => {
  const groups = []
  let currentDate = null
  for (const msg of chat.sortedMessages) {
    const d = formatMsgDate(msg.created_at)
    if (d !== currentDate) {
      currentDate = d
      groups.push({ type: 'date', label: d })
    }
    groups.push({ type: 'message', data: msg })
  }
  return groups
})

const isImageFile = (att) => (att.file_type || '').toLowerCase().startsWith('image/')
const isVideoFile = (att) => (att.file_type || '').toLowerCase().startsWith('video/')

function getAttachmentUrl(msgId, attId) {
  return chat.getAttachmentUrl(chat.currentChatId, msgId, attId)
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

async function loadTicket() {
  if (ticketsStore.tickets.length) {
    ticket.value = ticketsStore.tickets.find(t => t.id === ticketId.value) || null
  }
  if (!ticket.value) {
    await ticketsStore.loadTickets()
    ticket.value = ticketsStore.tickets.find(t => t.id === ticketId.value) || null
  }
  if (ticket.value && isAssignee.value && ticket.value.status_id === '1ff34436-1312-11f1-aa8c-bc241127d0bd') {
    const ok = await ticketsStore.updateTicketStatus(ticketId.value, '77664011-7aca-11f1-b481-bc241127d0bd')
    if (ok) ticket.value.status_id = '77664011-7aca-11f1-b481-bc241127d0bd'
  }
}

async function handleSend() {
  const text = messageText.value.trim()
  const file = attachmentFile.value
  if (!text && !file) return
  if (file) {
    await chat.sendMessageWithAttachment(text, file)
  } else {
    await chat.sendMessage(text)
  }
  messageText.value = ''
  attachmentFile.value = null
  attachmentPreview.value = ''
  scrollToBottom()
}

function handleFileSelect(e) {
  const file = e.target.files?.[0]
  if (!file) return
  attachmentFile.value = file
  if (file.type.startsWith('image/')) {
    const reader = new FileReader()
    reader.onload = (ev) => { attachmentPreview.value = ev.target?.result || '' }
    reader.readAsDataURL(file)
  } else {
    attachmentPreview.value = file.name
  }
}

function removeAttachment() {
  attachmentFile.value = null
  attachmentPreview.value = ''
}

function openFullscreen(att) {
  fullscreenMedia.value = { ...att, url: getAttachmentUrl(att.message_id, att.id) }
}

function closeFullscreen() {
  fullscreenMedia.value = null
}

async function handleComplete() {
  const ok = await ticketsStore.updateTicketStatus(ticketId.value, '1ff32c4b-1312-11f1-aa8c-bc241127d0bd')
  if (ok) ticket.value.status_id = '1ff32c4b-1312-11f1-aa8c-bc241127d0bd'
}

function goBack() { router.push('/tickets') }

onMounted(async () => {
  await authStore.init()
  if (!ticketId.value) { router.push('/tickets'); return }
  await loadTicket()
  chat.currentEntityType = 'ticket'
  chat.currentEntityId = String(ticket.value.id)
  if (ticket.value?.chat_id) {
    chat.currentChatId = String(ticket.value.chat_id)
  } else {
    await chat.ensureChat()
  }
  if (chat.currentChatId) {
    await Promise.all([
      chat.loadMessages(),
      chat.loadMembers(),
      chat.loadReadStatus(),
    ])
    await chat.ensureMembership()
    const lastMsg = chat.sortedMessages[chat.sortedMessages.length - 1]
    if (lastMsg?.id) chat.updateReadStatus(lastMsg.id)
    scrollToBottom()
  }
})

onBeforeUnmount(() => {
  chat.currentChatId = null
})

watch(() => chat.messages.length, () => {
  scrollToBottom()
})

watch(() => chat.currentChatId, (id) => {
  if (id && ticket.value && !ticket.value.chat_id) {
    ticket.value.chat_id = Number(id)
  }
})
</script>

<template>
  <div class="ticket-page">
    <TopNav :links="navLinks" />
    <div class="ticket-layout">
      <div v-if="!ticket && !ticketsStore.loading" class="not-found">
        Тикет не найден. <a href="#" @click.prevent="goBack">Вернуться к списку</a>
      </div>

      <template v-if="ticket">
        <div class="ticket-header">
          <button class="back-btn" type="button" @click="goBack"><i class="fas fa-arrow-left"></i></button>
          <div class="ticket-info">
            <div class="ticket-badges">
              <span class="ticket-type" :class="ticket.type">{{ typeLabel(ticket.type) }}</span>
              <span class="ticket-status" :class="{ done: isCompleted }">{{ isCompleted ? 'Завершён' : 'В работе' }}</span>
              <span class="ticket-id-label">#{{ ticket.id }}</span>
            </div>
            <div class="ticket-users">
              <span v-for="u in headerUsers" :key="u.id" class="user-chip">
                {{ u.user ? [u.user.surname, u.user.name, u.user.patronymic].filter(Boolean).join(' ') : '—' }}
              </span>
            </div>
          </div>
          <div class="ticket-actions">
            <button class="members-btn" type="button" title="Участники" @click="showMembers = !showMembers">
              <i class="fas fa-users"></i>
              <span v-if="chat.members.length" class="members-badge">{{ chat.members.length }}</span>
            </button>
            <button v-if="isAssignee && !isCompleted" class="complete-btn" type="button" @click="handleComplete">Завершить</button>
          </div>
        </div>

        <div class="chat-panel-inline">
          <div class="chat-title-bar">{{ chat.currentEntityTitle || 'Чат тикета' }}</div>
          <div class="chat-body-inline" :class="{ 'with-sidebar': showMembers && chat.members.length }">
            <div v-if="showMembers && chat.members.length" class="members-sidebar">
              <div class="members-heading">Участники ({{ chat.members.length }})</div>
              <div v-for="m in chat.members" :key="m.id || m.user_id" class="member-item">
                {{ m.user ? [m.user.surname, m.user.name, m.user.patronymic].filter(Boolean).join(' ') : '—' }}
              </div>
            </div>
            <div ref="messagesContainer" class="chat-msgs">
              <div v-if="chat.messagesLoading" class="chat-status">Загрузка сообщений...</div>
              <div v-else-if="!chat.messages.length && !chat.messagesLoading" class="chat-status">Нет сообщений. Напишите первое!</div>
              <template v-for="(item, idx) in messageGroups" :key="idx">
                <div v-if="item.type === 'date'" class="date-line">{{ item.label }}</div>
                <div v-else class="msg-row" :class="isMyMessage(item.data) ? 'msg-mine' : 'msg-other'">
                  <div class="msg-bubble">
                    <div v-if="!isMyMessage(item.data)" class="msg-author">{{ item.data.sender ? [item.data.sender.surname, item.data.sender.name].filter(Boolean).join(' ') : '—' }}</div>
                    <div v-if="item.data.message_text" class="msg-body">{{ item.data.message_text }}</div>
                    <div v-if="item.data.attachments?.length" class="msg-attachments">
                      <template v-for="att in item.data.attachments" :key="att.id">
                        <div v-if="isImageFile(att)" class="media-box" @click="openFullscreen(att)">
                          <img :src="getAttachmentUrl(item.data.id, att.id)" :alt="att.file_name" class="media-img">
                        </div>
                        <div v-else-if="isVideoFile(att)" class="media-box" @click="openFullscreen(att)">
                          <video :src="getAttachmentUrl(item.data.id, att.id)" class="media-img" preload="metadata"></video>
                        </div>
                        <div v-else class="file-link">
                          <i class="fas fa-paperclip"></i>
                          <a :href="getAttachmentUrl(item.data.id, att.id)" target="_blank">{{ att.file_name || 'Файл' }}</a>
                        </div>
                      </template>
                    </div>
                    <div class="msg-meta">
                      <span>{{ formatMsgTime(item.data.created_at) }}</span>
                    </div>
                  </div>
                </div>
              </template>
            </div>
          </div>

          <div v-if="!isCompleted" class="chat-footer-inline">
            <div v-if="attachmentFile" class="attach-preview">
              <img v-if="attachmentPreview && attachmentFile.type.startsWith('image/')" :src="attachmentPreview" class="attach-img">
              <span v-else class="attach-name">{{ attachmentFile.name }}</span>
              <button class="attach-remove" type="button" @click="removeAttachment">&times;</button>
            </div>
            <div class="input-row">
              <label class="attach-label" title="Прикрепить файл">
                <i class="fas fa-paperclip"></i>
                <input type="file" class="hidden-input" @change="handleFileSelect">
              </label>
              <textarea v-model="messageText" class="msg-textarea" placeholder="Напишите сообщение..." rows="1" @keydown.enter.prevent="handleSend"></textarea>
              <button class="send-btn" type="button" :disabled="chat.sendingMessage || (!messageText.trim() && !attachmentFile)" @click="handleSend">
                <i class="fas fa-paper-plane"></i>
              </button>
            </div>
          </div>
          <div v-else class="chat-closed">
            <i class="fas fa-lock"></i> Тикет завершён
          </div>
        </div>
      </template>
    </div>

    <div v-if="fullscreenMedia" class="fs-overlay" @click.self="closeFullscreen">
      <button class="fs-close" type="button" @click="closeFullscreen">&times;</button>
      <img v-if="isImageFile(fullscreenMedia)" :src="fullscreenMedia.url" class="fs-media">
      <video v-else-if="isVideoFile(fullscreenMedia)" :src="fullscreenMedia.url" class="fs-media" controls autoplay></video>
    </div>
  </div>
</template>

<style scoped>
.ticket-page { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
.ticket-layout { flex: 1; overflow: hidden; max-width: 780px; margin: 0 auto; padding: 20px 24px 0; display: flex; flex-direction: column; }
.not-found { text-align: center; padding: 60px 0; color: var(--text-secondary); }

/* ── Header ── */
.ticket-header { flex-shrink: 0; display: flex; align-items: center; gap: 14px; margin-bottom: 18px; background: var(--bg-surface, #fff); border: 1px solid var(--border-light, #e2e8f0); border-radius: 14px; padding: 16px 18px; box-shadow: 0 1px 4px rgba(0,0,0,0.04); }
.back-btn { width: 36px; height: 36px; border: 1px solid #e2e8f0; border-radius: 10px; background: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #64748b; flex-shrink: 0; font-size: 14px; transition: all 0.15s; }
.back-btn:hover { background: #f8fafc; color: #1e293b; border-color: #cbd5e1; }
.ticket-info { flex: 1; display: flex; flex-direction: column; gap: 8px; }
.ticket-badges { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ticket-type { font-size: 11px; font-weight: 700; padding: 4px 11px; border-radius: 6px; letter-spacing: 0.02em; }
.ticket-type.problem { background: #fef2f2; color: #dc2626; }
.ticket-type.suggestion { background: #f0fdf4; color: #16a34a; }
.ticket-type.question { background: #eff6ff; color: #2563eb; }
.ticket-status { font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 999px; background: #f59e0b; color: #fff; }
.ticket-status.done { background: #22c55e; }
.ticket-id-label { font-size: 13px; font-weight: 600; color: #94a3b8; margin-left: 2px; }
.ticket-users { display: flex; gap: 6px; flex-wrap: wrap; }
.user-chip { font-size: 12px; padding: 3px 10px; background: #f1f5f9; border-radius: 6px; color: #475569; font-weight: 500; }
.ticket-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

.members-btn { width: 36px; height: 36px; border: 1px solid #e2e8f0; border-radius: 10px; background: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #64748b; position: relative; font-size: 14px; transition: all 0.15s; }
.members-btn:hover { color: #3b82f6; border-color: #3b82f6; background: #f8faff; }
.members-badge { position: absolute; top: -4px; right: -4px; font-size: 10px; background: #3b82f6; color: #fff; border-radius: 999px; padding: 1px 5px; min-width: 16px; text-align: center; font-weight: 600; }

.complete-btn { border: none; border-radius: 8px; padding: 8px 18px; background: #22c55e; color: #fff; font-weight: 600; cursor: pointer; font-size: 13px; transition: background 0.15s; }
.complete-btn:hover { background: #16a34a; }

/* ── Chat Panel ── */
.chat-panel-inline { flex: 1; min-height: 0; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 1px 6px rgba(0,0,0,0.04); display: flex; flex-direction: column; overflow: hidden; }

.chat-title-bar { flex-shrink: 0; padding: 12px 16px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; font-weight: 600; font-size: 14px; color: #1e293b; }

.chat-body-inline { flex: 1; min-height: 0; display: flex; }
.members-sidebar { width: 180px; border-right: 1px solid #e2e8f0; padding: 12px; overflow-y: auto; flex-shrink: 0; }
.members-heading { font-weight: 600; font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
.member-item { padding: 5px 4px; font-size: 13px; color: #334155; }

.chat-msgs { flex: 1; overflow-y: auto; padding: 12px 16px; }
.chat-body-inline.with-sidebar .chat-msgs { width: calc(100% - 180px); }
.chat-status { padding: 40px 16px; text-align: center; color: #94a3b8; font-size: 13px; }

.date-line { text-align: center; font-size: 11px; color: #94a3b8; margin: 16px 0 10px; position: relative; }
.date-line::before, .date-line::after { content: ''; position: absolute; top: 50%; width: calc(50% - 50px); height: 1px; background: #e2e8f0; }
.date-line::before { left: 0; }
.date-line::after { right: 0; }

.msg-row { display: flex; margin-bottom: 8px; }
.msg-mine { justify-content: flex-end; }
.msg-other { justify-content: flex-start; }

.msg-bubble { max-width: 75%; padding: 8px 12px; border-radius: 12px; font-size: 13px; line-height: 1.4; }
.msg-mine .msg-bubble { background: #3b82f6; color: #fff; border-bottom-right-radius: 4px; }
.msg-other .msg-bubble { background: #f1f5f9; color: #1e293b; border-bottom-left-radius: 4px; }

.msg-author { font-size: 11px; font-weight: 600; color: #64748b; margin-bottom: 2px; }
.msg-other .msg-author { color: #64748b; }

.msg-body { white-space: pre-wrap; word-break: break-word; }

.msg-attachments { margin-top: 4px; }
.media-box { margin-top: 6px; cursor: pointer; border-radius: 8px; overflow: hidden; max-width: 240px; }
.media-img { width: 100%; max-height: 160px; object-fit: cover; border-radius: 8px; display: block; background: #e2e8f0; }

.file-link { font-size: 12px; margin-top: 2px; }
.file-link a { color: inherit; text-decoration: underline; opacity: 0.85; }
.msg-mine .file-link a { color: rgba(255,255,255,0.85); }

.msg-meta { margin-top: 4px; font-size: 10px; }
.msg-mine .msg-meta { color: rgba(255,255,255,0.75); text-align: right; }
.msg-other .msg-meta { color: #94a3b8; }

/* ── Footer ── */
.chat-footer-inline { flex-shrink: 0; border-top: 1px solid #e2e8f0; padding: 8px 12px; background: #fff; }

.attach-preview { display: flex; align-items: center; gap: 8px; padding: 6px 8px; background: #f8fafc; border-radius: 6px; margin-bottom: 8px; font-size: 12px; }
.attach-img { width: 40px; height: 40px; object-fit: cover; border-radius: 4px; }
.attach-name { color: #475569; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.attach-remove { border: none; background: transparent; font-size: 18px; color: #94a3b8; cursor: pointer; padding: 0 4px; }

.input-row { display: flex; align-items: flex-end; gap: 8px; }

.attach-label { cursor: pointer; color: #94a3b8; font-size: 18px; padding: 4px; display: flex; align-items: center; }
.attach-label:hover { color: #3b82f6; }

.msg-textarea { flex: 1; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 12px; font-size: 13px; font-family: inherit; resize: none; outline: none; min-height: 36px; max-height: 100px; }
.msg-textarea:focus { border-color: #3b82f6; }

.send-btn { border: none; background: #3b82f6; color: #fff; border-radius: 8px; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 14px; flex-shrink: 0; }
.send-btn:disabled { background: #cbd5e1; cursor: not-allowed; }
.send-btn:hover:not(:disabled) { background: #2563eb; }

.hidden-input { display: none; }

.chat-closed { flex-shrink: 0; padding: 12px 16px; text-align: center; color: #94a3b8; font-size: 13px; border-top: 1px solid #e2e8f0; }
.chat-closed i { margin-right: 6px; }

/* ── Fullscreen ── */
.fs-overlay { position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,0.9); display: flex; align-items: center; justify-content: center; }
.fs-close { position: absolute; top: 16px; right: 20px; border: none; background: transparent; color: #fff; font-size: 36px; cursor: pointer; z-index: 10; }
.fs-media { max-width: 90vw; max-height: 90vh; object-fit: contain; }
</style>
