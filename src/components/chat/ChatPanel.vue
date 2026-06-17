<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useChatStore } from '../../stores/chat'
import { useAuthStore } from '../../stores/auth'

const chat = useChatStore()
const auth = useAuthStore()

const emit = defineEmits(['close'])

const messageText = ref('')
const messagesContainer = ref(null)
const showMembers = ref(false)
const attachmentFile = ref(null)
const attachmentPreview = ref('')
const fullscreenMedia = ref(null)

const mentionOpen = ref(false)
const mentionQuery = ref('')
const mentionStartPos = ref(-1)
const textareaRef = ref(null)

const showNewMsgSeparator = ref(true)
const capturedBoundaryId = ref(0)

const currentUser = computed(() => auth.user)

const isMyMessage = (msg) => {
  return String(msg.sender_id || '') === String(currentUser.value?.id || '')
}

const formatTime = (dateStr) => {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

const formatDate = (dateStr) => {
  if (!dateStr) return ''
  const d = new Date(dateStr)
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
  let newSeparatorAdded = false
  const boundaryId = showNewMsgSeparator.value ? capturedBoundaryId.value : 0
  for (const msg of chat.sortedMessages) {
    const msgDate = formatDate(msg.created_at)
    if (msgDate !== currentDate) {
      currentDate = msgDate
      groups.push({ type: 'date', label: msgDate })
    }
    if (!newSeparatorAdded && boundaryId && msg.id && msg.id > boundaryId) {
      groups.push({ type: 'new-separator', label: 'Новые сообщения' })
      newSeparatorAdded = true
    }
    groups.push({ type: 'message', data: msg })
  }
  return groups
})

const allUsers = ref([])
const allUsersLoading = ref(false)

const loadAllUsers = async () => {
  if (allUsers.value.length || allUsersLoading.value) return
  allUsersLoading.value = true
  try {
    const res = await fetch('/api/as/users/all', { credentials: 'include' })
    if (res.ok) allUsers.value = await res.json()
  } catch {
    // ignore
  } finally {
    allUsersLoading.value = false
  }
}

const filteredMentionUsers = computed(() => {
  const q = mentionQuery.value.toLowerCase().trim()
  if (!q) return []
  return allUsers.value
    .filter((u) => {
      const fullName = [u.surname, u.name, u.patronymic].filter(Boolean).join(' ').toLowerCase()
      return fullName.includes(q) && String(u.id) !== String(currentUser.value?.id || '')
    })
    .slice(0, 10)
})

const handleInput = (e) => {
  const el = e.target
  const val = el.value
  const pos = el.selectionStart

  const lastAtIndex = val.lastIndexOf('@', pos - 1)
  if (lastAtIndex !== -1 && (lastAtIndex === 0 || val[lastAtIndex - 1] === ' ')) {
    const afterAt = val.slice(lastAtIndex + 1, pos)
    if (!afterAt.includes(' ') && afterAt.length <= 30) {
      mentionQuery.value = afterAt
      mentionStartPos.value = lastAtIndex
      mentionOpen.value = true
      loadAllUsers()
      return
    }
  }
  mentionOpen.value = false
}

const selectMention = (user) => {
  if (mentionStartPos.value === -1) return
  const before = messageText.value.slice(0, mentionStartPos.value)
  const after = messageText.value.slice(mentionStartPos.value + 1 + mentionQuery.value.length)
  const surname = user.surname || ''
  const nameInitial = user.name ? `${user.name[0]}.` : ''
  const patronymicInitial = user.patronymic ? `${user.patronymic[0]}.` : ''
  const shortName = `${surname} ${nameInitial}${patronymicInitial}`.trim()
  messageText.value = `${before}@${shortName} ${after}`
  mentionOpen.value = false
  nextTick(() => {
    if (textareaRef.value) {
      const pos = mentionStartPos.value + 1 + shortName.length + 1
      textareaRef.value.setSelectionRange(pos, pos)
      textareaRef.value.focus()
    }
  })
}

const extractMentions = (text) => {
  const userIds = []
  const mentionPattern = /@(\S+(?:\s+\S+\.\S*\.?)?)/g
  let match
  while ((match = mentionPattern.exec(text)) !== null) {
    const mentionStr = match[1].trim().toLowerCase()
    for (const user of allUsers.value) {
      if (userIds.includes(user.id)) continue
      const surname = (user.surname || '').toLowerCase()
      const firstChar = user.name ? user.name[0] : ''
      const patronymicChar = user.patronymic ? user.patronymic[0] : ''
      const nameInit = firstChar ? firstChar + '.' : ''
      const patronymicInit = patronymicChar ? patronymicChar + '.' : ''
      const shortFio = (surname + ' ' + nameInit + patronymicInit).trim().toLowerCase()
      if (shortFio === mentionStr) {
        userIds.push(user.id)
        break
      }
    }
  }
  return userIds
}

const renderMessageText = (text) => {
  if (!text) return ''
  return text.replace(/@(\S+(?:\s+\S+\.\S*\.?)?)/g, '<span class="mention-inline">@$1</span>')
}

const sendMessage = async () => {
  const text = messageText.value.trim()
  const file = attachmentFile.value

  if (!text && !file) return

  showNewMsgSeparator.value = false

  const mentions = extractMentions(text)

  if (mentions.length) {
    await chat.addMentionedUsers(mentions)
  }

  if (file) {
    await chat.sendMessageWithAttachment(text, file, mentions)
  } else {
    await chat.sendMessage(text, mentions)
  }

  messageText.value = ''
  attachmentFile.value = null
  attachmentPreview.value = ''
  await nextTick()
  scrollToBottom()
}

const handleFileSelect = (e) => {
  const file = e.target.files?.[0]
  if (!file) return
  attachmentFile.value = file
  if (file.type.startsWith('image/')) {
    const reader = new FileReader()
    reader.onload = (ev) => { attachmentPreview.value = ev.target?.result || '' }
    reader.readAsDataURL(file)
  } else if (file.type.startsWith('video/')) {
    attachmentPreview.value = URL.createObjectURL(file)
  } else {
    attachmentPreview.value = file.name
  }
}

const removeAttachment = () => {
  if (attachmentFile.value && attachmentPreview.value && attachmentFile.value.type.startsWith('video/')) {
    URL.revokeObjectURL(attachmentPreview.value)
  }
  attachmentFile.value = null
  attachmentPreview.value = ''
}

const scrollToMessage = (msgId) => {
  if (!messagesContainer.value || !msgId) return
  const el = messagesContainer.value.querySelector(`[data-msg-id="${msgId}"]`)
  if (el) {
    el.scrollIntoView({ block: 'start', behavior: 'auto' })
  }
}

const scrollToBottom = () => {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

const handleKeydown = (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
  if (e.key === 'Escape') {
    mentionOpen.value = false
  }
}

const getSenderName = (sender) => {
  if (!sender) return '—'
  return [sender.surname, sender.name, sender.patronymic].filter(Boolean).join(' ') || '—'
}

const getMemberName = (member) => {
  if (!member?.user) return '—'
  return [member.user.surname, member.user.name, member.user.patronymic].filter(Boolean).join(' ') || '—'
}

const isMessageRead = (msg) => {
  if (!chat.readStatus) return false
  return (msg.id || 0) <= (chat.readStatus.last_read_message_id || 0)
}

const isMessageMentioned = (msg) => {
  return msg.id && chat.mentionedMessageIds.has(msg.id)
}

const isImageFile = (att) => {
  const t = (att.file_type || '').toLowerCase()
  return t.startsWith('image/')
}

const isVideoFile = (att) => {
  const t = (att.file_type || '').toLowerCase()
  return t.startsWith('video/')
}

const openFullscreen = (att) => {
  const url = chat.getAttachmentUrl(chat.currentChatId, att.message_id || '', att.id)
  fullscreenMedia.value = { ...att, url }
}

const closeFullscreen = () => {
  fullscreenMedia.value = null
}

watch(() => chat.mentionedMessageIds.size, (size) => {
  if (size && chat.panelOpen) {
    chat.markMentionsViewed()
  }
})

watch(() => chat.messages.length, () => {
  if (!chat.messages.length) return

  const msgs = chat.sortedMessages
  const lastMsg = msgs[msgs.length - 1]
  if (lastMsg && lastMsg.id && !isMessageRead(lastMsg)) {
    chat.updateReadStatus(lastMsg.id)
  }
  nextTick(() => {
    const targetId = chat.scrollToMsgId || chat.lastReadMessageId
    if (targetId) {
      scrollToMessage(targetId)
      chat.scrollToMsgId = null
    } else {
      scrollToBottom()
    }
  })
})

watch(() => chat.readStatus, (rs) => {
  if (!rs?.last_read_message_id) return

  if (!capturedBoundaryId.value) {
    capturedBoundaryId.value = rs.last_read_message_id
  }

  const targetId = chat.scrollToMsgId || rs.last_read_message_id
  if (targetId && chat.messages.length) {
    nextTick(() => {
      scrollToMessage(targetId)
      chat.scrollToMsgId = null
    })
  }
})

onMounted(() => {
  if (chat.currentChatId && chat.messages.length) {
    const lastReadId = chat.lastReadMessageId
    if (lastReadId) {
      chat.scrollToMsgId = lastReadId
    }
    const lastMsg = chat.sortedMessages[chat.sortedMessages.length - 1]
    if (lastMsg?.id) {
      chat.updateReadStatus(lastMsg.id)
    }

    if (chat.mentionedMessageIds.size) {
      chat.markMentionsViewed()
    }
  }

  nextTick(() => {
    const targetId = chat.scrollToMsgId || chat.lastReadMessageId
    if (targetId) {
      scrollToMessage(targetId)
      chat.scrollToMsgId = null
    } else {
      scrollToBottom()
    }
  })
})
</script>

<template>
  <div class="chat-overlay" @click.self="emit('close')">
    <div class="chat-panel">
      <div class="chat-header">
        <div class="chat-header-left">
          <span class="chat-title">{{ chat.currentEntityTitle }}</span>
          <button class="chat-members-btn" type="button" @click="showMembers = !showMembers" :title="showMembers ? 'Скрыть участников' : 'Показать участников'">
            <i class="fas fa-users"></i>
            <span v-if="chat.members.length" class="members-count">{{ chat.members.length }}</span>
          </button>
        </div>
        <button class="chat-close-btn" type="button" @click="emit('close')">&times;</button>
      </div>

      <div class="chat-body">
        <div v-if="showMembers && chat.members.length" class="chat-members-panel">
          <div class="members-title">Участники ({{ chat.members.length }})</div>
          <div v-for="member in chat.members" :key="member.id || member.user_id" class="member-row">
            <span class="member-name">{{ getMemberName(member) }}</span>
          </div>
        </div>

        <div ref="messagesContainer" class="chat-messages" :class="{ 'with-members': showMembers && chat.members.length }">
          <div v-if="chat.messagesLoading" class="chat-loading">Загрузка сообщений...</div>
          <div v-else-if="!chat.messages.length && !chat.loading" class="chat-empty-msg">Нет сообщений. Напишите первое!</div>

          <template v-for="(item, idx) in messageGroups" :key="idx">
            <div v-if="item.type === 'date'" class="msg-date-separator">{{ item.label }}</div>
            <div v-else-if="item.type === 'new-separator'" class="msg-new-separator">Новые сообщения</div>
            <div v-else class="msg-row" :class="{ 'msg-mine': isMyMessage(item.data), 'msg-other': !isMyMessage(item.data), 'msg-mentioned': isMessageMentioned(item.data) }" :data-msg-id="item.data.id">
              <div class="msg-bubble">
                <div v-if="!isMyMessage(item.data)" class="msg-sender">{{ getSenderName(item.data.sender) }}</div>
                <div class="msg-text" v-html="renderMessageText(item.data.message_text)"></div>
                <div v-if="item.data.attachments && item.data.attachments.length" class="msg-attachments">
                  <template v-for="att in item.data.attachments" :key="att.id">
                    <div v-if="isImageFile(att)" class="media-preview" @click="openFullscreen(att)">
                      <img :src="chat.getAttachmentUrl(chat.currentChatId, item.data.id, att.id)" :alt="att.file_name || 'image'" class="media-thumb">
                    </div>
                    <div v-else-if="isVideoFile(att)" class="media-preview" @click="openFullscreen(att)">
                      <video :src="chat.getAttachmentUrl(chat.currentChatId, item.data.id, att.id)" class="media-thumb" preload="metadata"></video>
                    </div>
                    <div v-else class="msg-attachment">
                      <i class="fas fa-paperclip"></i>
                      <a :href="chat.getAttachmentUrl(chat.currentChatId, item.data.id, att.id)" target="_blank" class="attach-link">{{ att.file_name || 'Файл' }}</a>
                    </div>
                  </template>
                </div>
                <div class="msg-meta">
                  <span class="msg-time">{{ formatTime(item.data.created_at) }}</span>
                  <span v-if="isMyMessage(item.data)" class="msg-status">
                    <i v-if="isMessageRead(item.data)" class="fas fa-check-double msg-read"></i>
                    <i v-else class="fas fa-check msg-unread"></i>
                  </span>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>

      <div class="chat-footer">
        <div v-if="attachmentFile" class="attachment-preview">
          <img v-if="attachmentPreview && attachmentFile.type.startsWith('image/')" :src="attachmentPreview" class="attach-img-preview">
          <video v-else-if="attachmentPreview && attachmentFile.type.startsWith('video/')" :src="attachmentPreview" class="attach-video-preview" muted></video>
          <span v-else class="attach-name">{{ attachmentFile.name }}</span>
          <button class="attach-remove" type="button" @click="removeAttachment">&times;</button>
        </div>
        <div class="chat-input-row" style="position:relative">
          <label class="chat-attach-label" title="Прикрепить файл">
            <i class="fas fa-paperclip"></i>
            <input type="file" class="hidden-input" @change="handleFileSelect">
          </label>
          <textarea
            ref="textareaRef"
            v-model="messageText"
            class="chat-input"
            placeholder="Напишите сообщение... (@ для упоминания)"
            rows="1"
            @keydown="handleKeydown"
            @input="handleInput"
          ></textarea>
          <button class="chat-send-btn" type="button" :disabled="chat.sendingMessage || (!messageText.trim() && !attachmentFile)" @click="sendMessage">
            <i class="fas fa-paper-plane"></i>
          </button>
          <div v-if="mentionOpen && filteredMentionUsers.length" class="mention-dropdown">
            <div v-if="allUsersLoading" class="mention-loading">Загрузка...</div>
            <button
              v-for="user in filteredMentionUsers"
              :key="user.id"
              class="mention-item"
              type="button"
              @click="selectMention(user)"
            >
              {{ [user.surname, user.name, user.patronymic].filter(Boolean).join(' ') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="fullscreenMedia" class="fullscreen-overlay" @click.self="closeFullscreen">
      <button class="fullscreen-close" type="button" @click="closeFullscreen">&times;</button>
      <img v-if="isImageFile(fullscreenMedia)" :src="fullscreenMedia.url" class="fullscreen-media">
      <video v-else-if="isVideoFile(fullscreenMedia)" :src="fullscreenMedia.url" class="fullscreen-media" controls autoplay></video>
    </div>
  </div>
</template>

<style scoped>
.chat-overlay {
  position: fixed;
  bottom: 0;
  right: 0;
  width: 420px;
  max-width: 100vw;
  height: 560px;
  max-height: 100vh;
  z-index: 500;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: flex-end;
  pointer-events: none;
}

.chat-panel {
  width: 100%;
  height: 100%;
  background: #fff;
  border-radius: 12px 12px 0 0;
  box-shadow: 0 -4px 24px rgba(0,0,0,0.15);
  display: flex;
  flex-direction: column;
  pointer-events: auto;
  overflow: hidden;
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
  flex-shrink: 0;
}

.chat-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chat-title {
  font-weight: 600;
  font-size: 14px;
  color: #1e293b;
}

.chat-members-btn {
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 4px 8px;
  font-size: 14px;
  color: #64748b;
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
}

.chat-members-btn:hover {
  color: #3b82f6;
}

.members-count {
  font-size: 11px;
  background: #3b82f6;
  color: #fff;
  border-radius: 999px;
  padding: 1px 6px;
  min-width: 18px;
  text-align: center;
}

.chat-close-btn {
  border: none;
  background: transparent;
  font-size: 22px;
  cursor: pointer;
  color: #94a3b8;
  line-height: 1;
  padding: 0 4px;
}

.chat-close-btn:hover {
  color: #475569;
}

.chat-body {
  flex: 1;
  overflow: hidden;
  display: flex;
  position: relative;
}

.chat-loading {
  padding: 24px;
  text-align: center;
  color: #94a3b8;
  font-size: 13px;
}

.chat-members-panel {
  width: 180px;
  border-right: 1px solid #e2e8f0;
  padding: 12px;
  overflow-y: auto;
  flex-shrink: 0;
}

.members-title {
  font-weight: 600;
  font-size: 12px;
  color: #64748b;
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.member-row {
  padding: 6px 4px;
  font-size: 13px;
  color: #334155;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
}

.chat-messages.with-members {
  width: calc(100% - 180px);
}

.chat-empty-msg {
  padding: 40px 16px;
  text-align: center;
  color: #94a3b8;
  font-size: 13px;
}

.msg-date-separator {
  text-align: center;
  font-size: 11px;
  color: #94a3b8;
  margin: 12px 0 8px;
  position: relative;
}

.msg-date-separator::before,
.msg-date-separator::after {
  content: '';
  position: absolute;
  top: 50%;
  width: calc(50% - 60px);
  height: 1px;
  background: #e2e8f0;
}

.msg-date-separator::before { left: 0; }
.msg-date-separator::after { right: 0; }

.msg-new-separator {
  text-align: center;
  font-size: 11px;
  font-weight: 700;
  color: #3b82f6;
  margin: 16px 0 12px;
  position: relative;
}

.msg-new-separator::before,
.msg-new-separator::after {
  content: '';
  position: absolute;
  top: 50%;
  width: calc(50% - 70px);
  height: 1px;
  background: #3b82f6;
}

.msg-new-separator::before { left: 0; }
.msg-new-separator::after { right: 0; }

.msg-row {
  display: flex;
  margin-bottom: 8px;
}

.msg-mine { justify-content: flex-end; }
.msg-other { justify-content: flex-start; }

.msg-bubble {
  max-width: 75%;
  padding: 8px 12px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.4;
}

.msg-mine .msg-bubble {
  background: #3b82f6;
  color: #fff;
  border-bottom-right-radius: 4px;
}

.msg-other .msg-bubble {
  background: #f1f5f9;
  color: #1e293b;
  border-bottom-left-radius: 4px;
}

.msg-mentioned .msg-bubble {
  background: #fef9c3;
  outline: 2px solid #facc15;
}

.msg-mentioned.msg-mine .msg-bubble {
  background: #6366f1;
  outline: 2px solid #a5b4fc;
}

.msg-sender {
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  margin-bottom: 2px;
}

.msg-text {
  white-space: pre-wrap;
  word-break: break-word;
}

.msg-text :deep(.mention-inline) {
  background: rgba(251,191,36,0.25);
  border-radius: 3px;
  padding: 0 2px;
  font-weight: 600;
}

.msg-attachments { margin-top: 4px; }

.msg-attachment {
  font-size: 12px;
  opacity: 0.85;
  margin-top: 2px;
}

.attach-link { color: inherit; text-decoration: underline; }

.media-preview {
  margin-top: 6px;
  cursor: pointer;
  border-radius: 8px;
  overflow: hidden;
  max-width: 240px;
}

.media-thumb {
  width: 100%;
  max-height: 160px;
  object-fit: cover;
  border-radius: 8px;
  display: block;
  background: #e2e8f0;
}

.msg-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
  font-size: 10px;
}

.msg-mine .msg-meta {
  color: rgba(255,255,255,0.75);
  justify-content: flex-end;
}

.msg-other .msg-meta { color: #94a3b8; }

.msg-status { display: inline-flex; }
.msg-read { color: #60a5fa; }
.msg-unread { color: rgba(255,255,255,0.5); }

.chat-footer {
  border-top: 1px solid #e2e8f0;
  padding: 8px 12px;
  flex-shrink: 0;
  background: #fff;
}

.attachment-preview {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: #f8fafc;
  border-radius: 6px;
  margin-bottom: 8px;
  font-size: 12px;
}

.attach-img-preview {
  width: 40px;
  height: 40px;
  object-fit: cover;
  border-radius: 4px;
}

.attach-video-preview {
  width: 60px;
  height: 40px;
  object-fit: cover;
  border-radius: 4px;
}

.attach-name {
  color: #475569;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attach-remove {
  border: none;
  background: transparent;
  font-size: 18px;
  color: #94a3b8;
  cursor: pointer;
  padding: 0 4px;
}

.chat-input-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.chat-attach-label {
  cursor: pointer;
  color: #94a3b8;
  font-size: 18px;
  padding: 4px;
  display: flex;
  align-items: center;
}

.chat-attach-label:hover { color: #3b82f6; }

.chat-input {
  flex: 1;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 13px;
  font-family: inherit;
  resize: none;
  outline: none;
  min-height: 36px;
  max-height: 100px;
}

.chat-input:focus { border-color: #3b82f6; }

.chat-send-btn {
  border: none;
  background: #3b82f6;
  color: #fff;
  border-radius: 8px;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 14px;
  flex-shrink: 0;
}

.chat-send-btn:disabled {
  background: #cbd5e1;
  cursor: not-allowed;
}

.chat-send-btn:hover:not(:disabled) { background: #2563eb; }

.hidden-input { display: none; }

.mention-dropdown {
  position: absolute;
  bottom: 100%;
  left: 32px;
  right: 44px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 -4px 12px rgba(0,0,0,0.1);
  max-height: 160px;
  overflow-y: auto;
  z-index: 10;
}

.mention-loading {
  padding: 8px 12px;
  font-size: 12px;
  color: #94a3b8;
}

.mention-item {
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  padding: 8px 12px;
  font-size: 13px;
  cursor: pointer;
}

.mention-item:hover { background: #f1f5f9; }

.fullscreen-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0,0,0,0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
}

.fullscreen-close {
  position: absolute;
  top: 16px;
  right: 20px;
  border: none;
  background: transparent;
  color: #fff;
  font-size: 36px;
  cursor: pointer;
  z-index: 10;
}

.fullscreen-media {
  max-width: 90vw;
  max-height: 90vh;
  object-fit: contain;
}
</style>
