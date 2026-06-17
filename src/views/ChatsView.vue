<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useChatStore } from '../stores/chat'
import { useAuthStore } from '../stores/auth'
import TopNav from '../components/layout/TopNav.vue'
import { mainNavLinks } from '../constants/mainNav'

const router = useRouter()
const chat = useChatStore()
const auth = useAuthStore()

const navLinks = mainNavLinks

const selectedChatId = ref(null)
const messageText = ref('')
const messagesContainer = ref(null)
const attachmentFile = ref(null)
const attachmentPreview = ref('')
const fullscreenMedia = ref(null)
const textareaRef = ref(null)
const showMembers = ref(false)
const sidebarOpen = ref(true)
const chatSearch = ref('')
const typeFilter = ref('')
const projectFilter = ref('')
const projectQuery = ref('')
const projectDropdownOpen = ref(false)
const showNewChatModal = ref(false)
const newChatUserQuery = ref('')
const newChatUsers = ref([])
const newChatUsersLoading = ref(false)
const creatingChat = ref(false)

const mentionOpen = ref(false)
const mentionQuery = ref('')
const mentionStartPos = ref(-1)
const allUsers = ref([])
const allUsersLoading = ref(false)

const capturedBoundaryId = ref(0)
const showNewMsgSeparator = ref(true)

const projectFilterRef = ref(null)

const currentUser = computed(() => auth.user)

const selectedChat = computed(() => {
  if (!selectedChatId.value) return null
  return chat.chatList.find((c) => c.id === selectedChatId.value) || null
})

const chatTypes = computed(() => {
  const types = new Set(chat.chatList.map((c) => c.type))
  return ['', ...types]
})

const chatTypeLabel = (type) => {
  const labels = { invoice: 'Счёт', personal: 'Личный', delivery: 'Доставка', deal: 'Сделка', request: 'Заявка', specification: 'Спецификация' }
  return labels[type] || type
}

const filteredChatList = computed(() => {
  let list = chat.chatList
  const q = chatSearch.value.toLowerCase().trim()
  if (q) list = list.filter((c) => c.title?.toLowerCase().includes(q))
  if (typeFilter.value) list = list.filter((c) => c.type === typeFilter.value)
  if (projectFilter.value) list = list.filter((c) => c.project_name === projectFilter.value)
  return list
})

const projectOptions = computed(() => {
  const names = new Set(chat.chatList.map((c) => c.project_name).filter(Boolean))
  return [...names]
})

const filteredProjectOptions = computed(() => {
  const q = projectQuery.value.toLowerCase().trim()
  if (!q) return projectOptions.value
  return projectOptions.value.filter((p) => p.toLowerCase().includes(q))
})

const selectProject = (project) => {
  projectFilter.value = project
  projectQuery.value = project
  projectDropdownOpen.value = false
}

const handleClickOutside = (e) => {
  if (projectFilterRef.value && !projectFilterRef.value.contains(e.target)) {
    projectDropdownOpen.value = false
  }
}

const typeIcon = (type) => {
  const icons = {
    invoice: 'fa-file-invoice',
    personal: 'fa-user',
    delivery: 'fa-truck',
    deal: 'fa-handshake',
    request: 'fa-file-lines',
    specification: 'fa-file',
  }
  return icons[type] || 'fa-comment'
}

const isMyMessage = (msg) => {
  return String(msg.sender_id || '') === String(currentUser.value?.id || '')
}

const formatTime = (dateStr) => {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
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

const isMessageRead = (msg) => {
  if (!chat.readStatus) return false
  return (msg.id || 0) <= (chat.readStatus.last_read_message_id || 0)
}

const isMessageMentioned = (msg) => {
  return msg.id && chat.mentionedMessageIds.has(msg.id)
}

const isImageFile = (att) => (att.file_type || '').toLowerCase().startsWith('image/')
const isVideoFile = (att) => (att.file_type || '').toLowerCase().startsWith('video/')

const getSenderName = (sender) => {
  if (!sender) return '—'
  return [sender.surname, sender.name, sender.patronymic].filter(Boolean).join(' ') || '—'
}

const getMemberName = (member) => {
  if (!member?.user) return '—'
  return [member.user.surname, member.user.name, member.user.patronymic].filter(Boolean).join(' ') || '—'
}

const renderMessageText = (text) => {
  if (!text) return ''
  return text.replace(/@(\S+(?:\s+\S+\.\S*\.?)?)/g, '<span class="mention-inline">@$1</span>')
}

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

const handleMentionInput = (e) => {
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

const scrollToMessage = (msgId) => {
  if (!messagesContainer.value || !msgId) return
  const el = messagesContainer.value.querySelector(`[data-msg-id="${msgId}"]`)
  if (el) el.scrollIntoView({ block: 'start', behavior: 'auto' })
}

const scrollToBottom = () => {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

const selectChat = async (chatItem) => {
  selectedChatId.value = chatItem.id
  capturedBoundaryId.value = 0
  showNewMsgSeparator.value = true
  await chat.openPanel(
    chatItem.type,
    String(chatItem[`${chatItem.type}_id`] || ''),
    chatItem.id,
  )
  nextTick(() => scrollToBottom())
}

const handleKeydown = (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
  if (e.key === 'Escape') mentionOpen.value = false
}

const sendMessage = async () => {
  const text = messageText.value.trim()
  const file = attachmentFile.value
  if (!text && !file) return

  showNewMsgSeparator.value = false
  const mentions = extractMentions(text)

  if (mentions.length) await chat.addMentionedUsers(mentions)

  if (file) {
    await chat.sendMessageWithAttachment(text, file, mentions)
  } else {
    await chat.sendMessage(text, mentions)
  }

  messageText.value = ''
  attachmentFile.value = null
  attachmentPreview.value = ''
  nextTick(() => scrollToBottom())
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

const loadNewChatUsers = async () => {
  const q = newChatUserQuery.value.trim()
  if (q.length < 2) { newChatUsers.value = []; return }
  newChatUsersLoading.value = true
  try {
    const res = await fetch('/api/as/users/all', { credentials: 'include' })
    if (res.ok) {
      const all = await res.json()
      const lower = q.toLowerCase()
      newChatUsers.value = all
        .filter((u) => {
          const fio = [u.surname, u.name, u.patronymic].filter(Boolean).join(' ').toLowerCase()
          return fio.includes(lower) && String(u.id) !== String(currentUser.value?.id || '')
        })
        .slice(0, 20)
    }
  } catch {
    newChatUsers.value = []
  } finally {
    newChatUsersLoading.value = false
  }
}

const startNewPersonalChat = async (targetUser) => {
  creatingChat.value = true
  try {
    const res = await fetch('/apisup/supply/chats', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'personal', user_id: targetUser.id }),
    })
    if (res.ok) {
      const data = await res.json()
      const newChatId = data?.id || data?.chat_id
      if (newChatId && targetUser.id) {
        await fetch(`/apisup/supply/chats/${newChatId}/members`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: targetUser.id }),
        })
      }
      showNewChatModal.value = false
      newChatUserQuery.value = ''
      newChatUsers.value = []
      await chat.loadChatList()
      const newChat = chat.chatList.find((c) => c.type === 'personal' && c.id === newChatId)
      if (newChat) await selectChat(newChat)
      else if (chat.chatList.length) await selectChat(chat.chatList[0])
    }
  } catch {
    // ignore
  } finally {
    creatingChat.value = false
  }
}

const removeAttachment = () => {
  if (attachmentFile.value && attachmentPreview.value && attachmentFile.value.type.startsWith('video/')) {
    URL.revokeObjectURL(attachmentPreview.value)
  }
  attachmentFile.value = null
  attachmentPreview.value = ''
}

const openFullscreen = (att) => {
  const url = chat.getAttachmentUrl(chat.currentChatId, att.message_id || '', att.id)
  fullscreenMedia.value = { ...att, url }
}

const closeFullscreen = () => { fullscreenMedia.value = null }

watch(() => chat.messages.length, () => {
  if (!chat.messages.length || !selectedChatId.value) return
  const msgs = chat.sortedMessages
  const lastMsg = msgs[msgs.length - 1]
  if (lastMsg?.id && !isMessageRead(lastMsg)) {
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

watch(() => chat.mentionedMessageIds.size, (size) => {
  if (size && chat.panelOpen) chat.markMentionsViewed()
})

watch(projectQuery, () => {
  if (!projectDropdownOpen.value) return
  projectFilter.value = ''
})

onMounted(async () => {
  chat.closePanel()
  await chat.loadChatList()
  if (!chat.chatList.length) return
  const first = chat.chatList[0]
  await selectChat(first)

  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div class="page">
    <TopNav :links="navLinks" />

    <div class="chats-layout">
      <aside class="chats-sidebar" :class="{ collapsed: !sidebarOpen }">
        <div class="sidebar-header">
          <div class="sidebar-title-area">
            <h2 class="sidebar-title">Чаты</h2>
            <button class="sidebar-newchat-btn" type="button" @click="showNewChatModal = true" title="Новый чат">
              <i class="fas fa-plus"></i>
            </button>
          </div>
          <button class="sidebar-toggle" type="button" @click="sidebarOpen = false">
            <i class="fas fa-chevron-left"></i>
          </button>
        </div>

        <div class="sidebar-filters">
          <div class="filter-search">
            <i class="fas fa-search filter-search-icon"></i>
            <input v-model="chatSearch" class="filter-input" type="text" placeholder="Поиск чатов...">
          </div>
          <div class="filter-tabs">
            <button class="filter-tab" :class="{ active: !typeFilter }" type="button" @click="typeFilter = ''">Все</button>
            <button v-for="t in chatTypes" :key="t" v-show="t" class="filter-tab" :class="{ active: typeFilter === t }" type="button" @click="typeFilter = t">{{ chatTypeLabel(t) }}</button>
          </div>
          <div ref="projectFilterRef" class="filter-project">
            <input
              v-model="projectQuery"
              class="filter-input"
              type="text"
              placeholder="Все проекты"
              @input="projectDropdownOpen = true"
            >
            <div v-if="projectDropdownOpen && filteredProjectOptions.length" class="project-dropdown">
              <button
                v-for="p in filteredProjectOptions"
                :key="p"
                class="project-dropdown-item"
                type="button"
                @mousedown.prevent
                @click="selectProject(p)"
              >{{ p }}</button>
            </div>
          </div>
        </div>

        <div v-if="chat.chatListLoading" class="sidebar-loading">Загрузка...</div>

        <div v-else class="chat-list">
          <button
            v-for="item in filteredChatList"
            :key="item.id"
            class="chat-list-item"
            :class="{ active: selectedChatId === item.id }"
            type="button"
            @click="selectChat(item)"
          >
            <div class="chat-item-icon">
              <i class="fas" :class="typeIcon(item.type)"></i>
            </div>
            <div class="chat-item-info">
              <div class="chat-item-title">{{ item.title }}</div>
              <div class="chat-item-project">{{ item.project_name }}</div>
            </div>
            <div v-if="item.unread_count > 0 || item.has_unviewed_mention" class="chat-item-badge" :class="item.has_unviewed_mention ? 'badge-red' : 'badge-blue'">
              {{ item.unread_count || '!' }}
            </div>
          </button>
          <div v-if="!chat.chatListLoading && !filteredChatList.length" class="sidebar-empty">Ничего не найдено</div>
        </div>
      </aside>
      <button v-if="!sidebarOpen" class="sidebar-reopen" type="button" @click="sidebarOpen = true" title="Показать чаты">
        <i class="fas fa-chevron-right"></i>
      </button>

      <main class="chats-main">
        <template v-if="selectedChat">
          <div class="chat-header">
            <div class="chat-header-info">
              <span class="chat-header-title">{{ selectedChat.title }}</span>
              <span class="chat-header-project">{{ selectedChat.project_name }}</span>
            </div>
            <button class="chat-members-toggle" type="button" @click="showMembers = !showMembers">
              <i class="fas fa-users"></i>
              <span v-if="chat.members.length" class="members-count">{{ chat.members.length }}</span>
            </button>
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
              <div v-else-if="!chat.messages.length && !chat.messagesLoading" class="chat-empty-msg">Нет сообщений. Напишите первое!</div>

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
            <div class="chat-input-row">
              <label class="chat-attach-label" title="Прикрепить файл">
                <i class="fas fa-paperclip"></i>
                <input type="file" class="hidden-input" @change="handleFileSelect">
              </label>
              <div class="input-wrap">
                <textarea
                  ref="textareaRef"
                  v-model="messageText"
                  class="chat-input"
                  placeholder="Напишите сообщение... (@ для упоминания)"
                  rows="1"
                  @keydown="handleKeydown"
                  @input="handleMentionInput"
                ></textarea>
                <div v-if="mentionOpen && filteredMentionUsers.length" class="mention-dropdown">
                  <div v-if="allUsersLoading" class="mention-loading">Загрузка...</div>
                  <button v-for="user in filteredMentionUsers" :key="user.id" class="mention-item" type="button" @click="selectMention(user)">
                    {{ [user.surname, user.name, user.patronymic].filter(Boolean).join(' ') }}
                  </button>
                </div>
              </div>
              <button class="chat-send-btn" type="button" :disabled="chat.sendingMessage || (!messageText.trim() && !attachmentFile)" @click="sendMessage">
                <i class="fas fa-paper-plane"></i>
              </button>
            </div>
          </div>
        </template>

        <div v-else class="chat-empty-state">
          <i class="fas fa-comment-dots"></i>
          <p>Выберите чат для начала общения</p>
        </div>
      </main>
    </div>

    <div v-if="fullscreenMedia" class="fullscreen-overlay" @click.self="closeFullscreen">
      <button class="fullscreen-close" type="button" @click="closeFullscreen">&times;</button>
      <img v-if="isImageFile(fullscreenMedia)" :src="fullscreenMedia.url" class="fullscreen-media">
      <video v-else-if="isVideoFile(fullscreenMedia)" :src="fullscreenMedia.url" class="fullscreen-media" controls autoplay></video>
    </div>

    <div v-if="showNewChatModal" class="modal-overlay" @click.self="showNewChatModal = false">
      <div class="modal-card">
        <div class="modal-header">
          <h3>Новый чат</h3>
          <button class="modal-close" type="button" @click="showNewChatModal = false">&times;</button>
        </div>
        <div class="modal-body">
          <div class="newchat-search">
            <i class="fas fa-search newchat-search-icon"></i>
            <input
              v-model="newChatUserQuery"
              class="newchat-input"
              type="text"
              placeholder="Поиск сотрудника..."
              @input="loadNewChatUsers"
            >
          </div>
          <div v-if="newChatUsersLoading" class="newchat-loading">Поиск...</div>
          <div v-else-if="newChatUsers.length" class="newchat-results">
            <button
              v-for="u in newChatUsers"
              :key="u.id"
              class="newchat-user"
              type="button"
              :disabled="creatingChat"
              @click="startNewPersonalChat(u)"
            >
              <div class="newchat-user-avatar">{{ (u.surname?.[0] || '') + (u.name?.[0] || '') }}</div>
              <div class="newchat-user-info">
                <div class="newchat-user-name">{{ [u.surname, u.name, u.patronymic].filter(Boolean).join(' ') }}</div>
                <div class="newchat-user-hint">Начать чат</div>
              </div>
            </button>
          </div>
          <div v-else-if="newChatUserQuery.trim().length >= 2" class="newchat-empty">Ничего не найдено</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chats-layout {
  display: flex;
  height: calc(100vh - var(--nav-height, 56px));
  overflow: hidden;
  position: relative;
}

.chats-sidebar {
  width: 320px;
  min-width: 320px;
  border-right: 1px solid var(--border-light, #e2e8f0);
  background: var(--bg-surface, #fff);
  display: flex;
  flex-direction: column;
  transition: width 0.2s, min-width 0.2s;
  overflow: hidden;
}

.chats-sidebar.collapsed {
  width: 0;
  min-width: 0;
}

.sidebar-reopen {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 28px;
  height: 48px;
  border: 1px solid var(--border-light, #e2e8f0);
  border-left: none;
  border-radius: 0 6px 6px 0;
  background: var(--bg-surface, #fff);
  color: var(--text-secondary, #64748b);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  z-index: 5;
  box-shadow: 2px 0 6px rgba(0,0,0,0.06);
}

.sidebar-reopen:hover {
  color: var(--brand-primary, #3b82f6);
  background: var(--brand-light, #eff6ff);
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--border-light, #e2e8f0);
  flex-shrink: 0;
}

.sidebar-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary, #1e293b);
  margin: 0;
}

.sidebar-title-area {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sidebar-toggle {
  border: none;
  background: transparent;
  color: var(--text-secondary, #64748b);
  cursor: pointer;
  font-size: 14px;
  padding: 4px;
}

.sidebar-toggle:hover {
  color: var(--brand-primary, #3b82f6);
}

.sidebar-newchat-btn {
  border: none;
  background: var(--brand-primary, #3b82f6);
  color: #fff;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 12px;
}

.sidebar-newchat-btn:hover {
  background: #2563eb;
}

.sidebar-filters {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-light, #e2e8f0);
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

.filter-search {
  position: relative;
}

.filter-search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-secondary, #94a3b8);
  font-size: 12px;
}

.filter-input {
  width: 100%;
  padding: 7px 10px 7px 28px;
  border: 1px solid var(--border-light, #e2e8f0);
  border-radius: 6px;
  font-size: 12px;
  outline: none;
  box-sizing: border-box;
}

.filter-input:focus {
  border-color: var(--brand-primary, #3b82f6);
}

.filter-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.filter-tab {
  padding: 4px 8px;
  border: 1px solid var(--border-light, #e2e8f0);
  border-radius: 4px;
  background: transparent;
  font-size: 11px;
  color: var(--text-secondary, #64748b);
  cursor: pointer;
}

.filter-tab.active {
  background: var(--brand-primary, #3b82f6);
  color: #fff;
  border-color: var(--brand-primary, #3b82f6);
}

.filter-project {
  position: relative;
}

.project-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 50;
  background: #fff;
  border: 1px solid var(--border-light, #e2e8f0);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  max-height: 200px;
  overflow-y: auto;
  margin-top: 2px;
}

.project-dropdown-item {
  display: block;
  width: 100%;
  padding: 6px 10px;
  border: none;
  background: transparent;
  text-align: left;
  font-size: 12px;
  color: var(--text-primary, #1e293b);
  cursor: pointer;
}

.project-dropdown-item:hover {
  background: var(--brand-light, #eff6ff);
}

.sidebar-empty {
  padding: 24px 12px;
  text-align: center;
  color: var(--text-secondary, #94a3b8);
  font-size: 12px;
}

.sidebar-loading {
  padding: 24px;
  text-align: center;
  color: var(--text-secondary, #94a3b8);
  font-size: 13px;
}

.chat-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.chat-list-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s;
  position: relative;
}

.chat-list-item:hover {
  background: var(--bg-subtle, #f1f5f9);
}

.chat-list-item.active {
  background: var(--brand-light, #eff6ff);
}

.chat-item-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--bg-subtle, #f1f5f9);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--brand-primary, #3b82f6);
  font-size: 16px;
  flex-shrink: 0;
}

.chat-list-item.active .chat-item-icon {
  background: var(--brand-primary, #3b82f6);
  color: #fff;
}

.chat-item-info {
  flex: 1;
  min-width: 0;
}

.chat-item-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #1e293b);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-item-project {
  font-size: 11px;
  color: var(--text-secondary, #64748b);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}

.chat-item-badge {
  min-width: 20px;
  height: 20px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  padding: 0 6px;
  flex-shrink: 0;
}

.chat-item-badge.badge-blue {
  background: var(--brand-primary, #3b82f6);
}

.chat-item-badge.badge-red {
  background: var(--danger-text, #ef4444);
}

.chats-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-surface, #fff);
}

.chat-empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary, #94a3b8);
  font-size: 32px;
  gap: 12px;
}

.chat-empty-state p {
  font-size: 14px;
  margin: 0;
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-light, #e2e8f0);
  background: var(--bg-surface-alt, #f8fafc);
  flex-shrink: 0;
}

.chat-header-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.chat-header-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary, #1e293b);
}

.chat-header-project {
  font-size: 11px;
  color: var(--text-secondary, #64748b);
}

.chat-members-toggle {
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 4px 8px;
  font-size: 14px;
  color: var(--text-secondary, #64748b);
  display: flex;
  align-items: center;
  gap: 4px;
}

.chat-members-toggle:hover {
  color: var(--brand-primary, #3b82f6);
}

.members-count {
  font-size: 11px;
  background: var(--brand-primary, #3b82f6);
  color: #fff;
  border-radius: 999px;
  padding: 1px 6px;
  min-width: 18px;
  text-align: center;
}

.chat-body {
  flex: 1;
  overflow: hidden;
  display: flex;
}

.chat-members-panel {
  width: 180px;
  border-right: 1px solid var(--border-light, #e2e8f0);
  padding: 12px;
  overflow-y: auto;
  flex-shrink: 0;
}

.members-title {
  font-weight: 600;
  font-size: 12px;
  color: var(--text-secondary, #64748b);
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.member-row {
  padding: 6px 4px;
  font-size: 13px;
  color: var(--text-primary, #334155);
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
}

.chat-messages.with-members {
  width: calc(100% - 180px);
}

.chat-loading {
  padding: 24px;
  text-align: center;
  color: var(--text-secondary, #94a3b8);
  font-size: 13px;
}

.chat-empty-msg {
  padding: 40px 16px;
  text-align: center;
  color: var(--text-secondary, #94a3b8);
  font-size: 13px;
}

.msg-date-separator {
  text-align: center;
  font-size: 11px;
  color: var(--text-secondary, #94a3b8);
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
  background: var(--border-light, #e2e8f0);
}

.msg-date-separator::before { left: 0; }
.msg-date-separator::after { right: 0; }

.msg-new-separator {
  text-align: center;
  font-size: 11px;
  font-weight: 700;
  color: var(--brand-primary, #3b82f6);
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
  background: var(--brand-primary, #3b82f6);
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
  background: var(--brand-primary, #3b82f6);
  color: #fff;
  border-bottom-right-radius: 4px;
}

.msg-other .msg-bubble {
  background: var(--bg-subtle, #f1f5f9);
  color: var(--text-primary, #1e293b);
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
  color: var(--text-secondary, #64748b);
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
  background: var(--bg-subtle, #e2e8f0);
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

.msg-other .msg-meta { color: var(--text-secondary, #94a3b8); }

.msg-read { color: #60a5fa; }
.msg-unread { color: rgba(255,255,255,0.5); }

.chat-footer {
  border-top: 1px solid var(--border-light, #e2e8f0);
  padding: 8px 12px;
  flex-shrink: 0;
  background: var(--bg-surface, #fff);
}

.attachment-preview {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: var(--bg-surface-alt, #f8fafc);
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
  color: var(--text-primary, #475569);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attach-remove {
  border: none;
  background: transparent;
  font-size: 18px;
  color: var(--text-secondary, #94a3b8);
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
  color: var(--text-secondary, #94a3b8);
  font-size: 18px;
  padding: 4px;
  display: flex;
  align-items: center;
}

.chat-attach-label:hover { color: var(--brand-primary, #3b82f6); }

.input-wrap {
  flex: 1;
  position: relative;
}

.chat-input {
  width: 100%;
  border: 1px solid var(--border-light, #e2e8f0);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 13px;
  font-family: inherit;
  resize: none;
  outline: none;
  min-height: 36px;
  max-height: 100px;
  box-sizing: border-box;
}

.chat-input:focus { border-color: var(--brand-primary, #3b82f6); }

.chat-send-btn {
  border: none;
  background: var(--brand-primary, #3b82f6);
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
  background: var(--border-light, #cbd5e1);
  cursor: not-allowed;
}

.chat-send-btn:hover:not(:disabled) { background: #2563eb; }

.hidden-input { display: none; }

.mention-dropdown {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  background: var(--bg-surface, #fff);
  border: 1px solid var(--border-light, #e2e8f0);
  border-radius: 8px;
  box-shadow: 0 -4px 12px rgba(0,0,0,0.1);
  max-height: 160px;
  overflow-y: auto;
  z-index: 10;
}

.mention-loading {
  padding: 8px 12px;
  font-size: 12px;
  color: var(--text-secondary, #94a3b8);
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

.mention-item:hover { background: var(--bg-subtle, #f1f5f9); }

.fullscreen-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0,0,0,0.9);
  display: flex;
  align-items: center;
  justify-content: center;
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

.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 900;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-card {
  width: 420px;
  max-width: 90vw;
  max-height: 80vh;
  background: var(--bg-surface, #fff);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.18);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-light, #e2e8f0);
}

.modal-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary, #1e293b);
}

.modal-close {
  border: none;
  background: transparent;
  font-size: 24px;
  color: var(--text-secondary, #94a3b8);
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}

.modal-body {
  padding: 16px 20px;
  overflow-y: auto;
  flex: 1;
}

.newchat-search {
  position: relative;
  margin-bottom: 12px;
}

.newchat-search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-secondary, #94a3b8);
  font-size: 14px;
}

.newchat-input {
  width: 100%;
  padding: 10px 12px 10px 36px;
  border: 1px solid var(--border-light, #e2e8f0);
  border-radius: 8px;
  font-size: 13px;
  outline: none;
  box-sizing: border-box;
}

.newchat-input:focus {
  border-color: var(--brand-primary, #3b82f6);
}

.newchat-loading,
.newchat-empty {
  padding: 24px;
  text-align: center;
  color: var(--text-secondary, #94a3b8);
  font-size: 13px;
}

.newchat-results {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.newchat-user {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
}

.newchat-user:hover {
  background: var(--bg-subtle, #f1f5f9);
}

.newchat-user:disabled {
  opacity: 0.6;
  cursor: default;
}

.newchat-user-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--brand-primary, #3b82f6);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 12px;
  flex-shrink: 0;
}

.newchat-user-info {
  flex: 1;
  min-width: 0;
}

.newchat-user-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #1e293b);
}

.newchat-user-hint {
  font-size: 11px;
  color: var(--brand-primary, #3b82f6);
  margin-top: 1px;
}
</style>
