import { defineStore } from 'pinia'
import { useAuthStore } from './auth'
import notificationSound from '../assets/sounds/notification.mp3'

let _notifAudio = null
const _playNotificationSound = () => {
  try {
    if (!_notifAudio) _notifAudio = new Audio(notificationSound)
    _notifAudio.currentTime = 0
    _notifAudio.play().catch(() => {})
  } catch {
    // ignore autoplay restrictions
  }
}

const normalizeArray = (payload) => {
  if (Array.isArray(payload)) return payload
  return payload?.items || payload?.data || payload?.results || []
}

export const useChatStore = defineStore('chat', {
  state: () => ({
    currentChatId: null,
    currentEntityType: null,
    currentEntityId: null,
    currentEntityTitle: '',
    messages: [],
    members: [],
    readStatus: null,
    readStatusByUser: {},
    loading: false,
    messagesLoading: false,
    sendingMessage: false,
    panelOpen: false,
    scrollToMsgId: null,
    badges: {},
    mentionedMessageIds: new Set(),
    chatList: [],
    chatListLoading: false,
    hasUnviewedMentions: false,
    ws: null,
    wsReconnectTimer: null,
    wsPingTimer: null,
    wsReconnectAttempts: 0,
  }),

  getters: {
    sortedMessages: (state) => {
      return [...state.messages].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    },

    lastReadMessageId: (state) => {
      return state.readStatus?.last_read_message_id || 0
    },

    memberIds: (state) => {
      return new Set(state.members.map((m) => String(m.user_id || '')))
    },
  },

  actions: {
    async openPanel(entityType, entityId, chatId, entityTitle) {
      this.currentEntityType = entityType
      this.currentEntityId = entityId
      this.currentChatId = chatId ? String(chatId) : chatId
      this.currentEntityTitle = entityTitle || this._resolveEntityTitle()
      this.panelOpen = true
      this.messages = []
      this.members = []
      this.readStatus = null
      this.scrollToMsgId = null
      this.mentionedMessageIds = new Set()

      if (chatId) {
        await Promise.all([
          this.loadMessages(),
          this.loadMembers(),
          this.loadReadStatus(),
          this.loadMentions(),
        ])
        await this.ensureMembership()
      }
    },

    closePanel() {
      this.panelOpen = false
      this.currentChatId = null
      this.currentEntityType = null
      this.currentEntityId = null
      this.currentEntityTitle = ''
      this.messages = []
      this.members = []
      this.readStatus = null
      this.scrollToMsgId = null
      this.mentionedMessageIds = new Set()
    },

    async ensureChat() {
      if (this.currentChatId) return
      const type = this.currentEntityType
      const id = this.currentEntityId
      if (!type || !id) return

      try {
        const payload = { type }
        payload[`${type}_id`] = id

        const res = await fetch('/apisup/supply/chats', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error('chat create failed')
        const data = await res.json()
        const chatId = data?.id || data?.chat_id
        if (chatId) {
          this.currentChatId = chatId
          await Promise.all([
            this.loadMessages(),
            this.loadMembers(),
          ])
          await this.ensureMembership()
          if (type === 'personal') {
            await this.addMember(id)
          }
        }
      } catch {
        // ignore
      }
    },

    async ensureMembership() {
      if (!this.currentChatId) return
      const userId = this._currentUserId()
      if (!userId) return
      const isMember = this.memberIds.has(String(userId))
      if (isMember) return
      try {
        const res = await fetch(`/apisup/supply/chats/${this.currentChatId}/members`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: userId }),
        })
        if (res.ok) {
          await this.loadMembers()
        }
      } catch {
        // ignore
      }
    },

    async addMentionedUsers(mentions) {
      if (!this.currentChatId || !mentions?.length) return
      const added = []
      for (const userId of mentions) {
        if (this.memberIds.has(String(userId))) continue
        try {
          const res = await fetch(`/apisup/supply/chats/${this.currentChatId}/members`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId }),
          })
          if (res.ok) added.push(userId)
        } catch {
          // ignore
        }
      }
      if (added.length) {
        await this.loadMembers()
      }
    },

    async loadMessages() {
      if (!this.currentChatId) return
      this.messagesLoading = true
      try {
        const res = await fetch(`/apisup/supply/chats/${this.currentChatId}/messages`, {
          credentials: 'include',
        })
        if (!res.ok) throw new Error('messages load failed')
        const data = await res.json()
        this.messages = normalizeArray(data)
      } catch {
        this.messages = []
      } finally {
        this.messagesLoading = false
      }
    },

    async sendMessage(text, mentions = []) {
      if (!text?.trim()) return
      if (!this.currentChatId) await this.ensureChat()
      if (!this.currentChatId) return null

      this.sendingMessage = true
      try {
        const res = await fetch(`/apisup/supply/chats/${this.currentChatId}/messages`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message_text: text.trim(), mentions: mentions.length ? mentions : null }),
        })
        if (!res.ok) throw new Error('message send failed')
        const msg = await res.json()
        this.messages.push(msg)
        return msg
      } catch {
        return null
      } finally {
        this.sendingMessage = false
      }
    },

    async sendMessageWithAttachment(text, file, mentions = []) {
      if (!this.currentChatId) await this.ensureChat()
      if (!this.currentChatId) return null

      this.sendingMessage = true
      try {
        const res = await fetch(`/apisup/supply/chats/${this.currentChatId}/messages`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message_text: text?.trim() || '', mentions: mentions.length ? mentions : null }),
        })
        if (!res.ok) throw new Error('message send failed')
        const msg = await res.json()

        if (file && msg?.id) {
          const attachForm = new FormData()
          attachForm.append('file', file)
          await fetch(`/apisup/supply/chats/${this.currentChatId}/messages/${msg.id}/attachments`, {
            method: 'POST',
            credentials: 'include',
            body: attachForm,
          })
        }

        await this.loadMessages()
        return msg
      } catch {
        return null
      } finally {
        this.sendingMessage = false
      }
    },

    async loadMembers() {
      if (!this.currentChatId) return
      try {
        const res = await fetch(`/apisup/supply/chats/${this.currentChatId}/members`, {
          credentials: 'include',
        })
        if (!res.ok) throw new Error('members load failed')
        this.members = normalizeArray(await res.json())
      } catch {
        this.members = []
      }
    },

    async addMember(userId) {
      if (!this.currentChatId || !userId) return
      try {
        const res = await fetch(`/apisup/supply/chats/${this.currentChatId}/members`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: userId }),
        })
        if (res.ok) {
          await this.loadMembers()
        }
      } catch {
        // ignore
      }
    },

    async loadReadStatus() {
      if (!this.currentChatId) return
      const userId = this._currentUserId()
      if (!userId) return
      try {
        const res = await fetch(`/apisup/supply/chats/${this.currentChatId}/read-status?user_id=${encodeURIComponent(userId)}`, {
          credentials: 'include',
        })
        if (res.ok) {
          this.readStatus = await res.json()
        }
      } catch {
        this.readStatus = null
      }
    },

    async updateReadStatus(lastReadMessageId) {
      if (!this.currentChatId) return
      try {
        const res = await fetch(`/apisup/supply/chats/${this.currentChatId}/read-status`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: this.currentChatId, last_read_message_id: lastReadMessageId }),
        })
        if (res.ok) {
          this.readStatus = await res.json()
        }
      } catch {
        // ignore
      }
    },

    getAttachmentUrl(chatId, messageId, attachmentId) {
      return `/apisup/supply/chats/${chatId}/messages/${messageId}/attachments/${attachmentId}/download`
    },

    async fetchBadge(chatId) {
      if (!chatId) return
      const key = String(chatId)
      const userId = this._currentUserId()
      if (!userId) return

      const current = this.badges[key]
      if (current?.loading) return

      this.badges = { ...this.badges, [key]: { unread: false, mention: false, loading: true } }

      try {
        const [readRes, mentionRes] = await Promise.all([
          fetch(`/apisup/supply/chats/${chatId}/read-status?user_id=${encodeURIComponent(userId)}`, { credentials: 'include' }),
          fetch(`/apisup/supply/mentions?user_id=${encodeURIComponent(userId)}&chat_id=${chatId}`, { credentials: 'include' }),
        ])

        let unread = false
        if (readRes.ok) {
          const readData = await readRes.json()
          const lastRead = readData?.last_read_message_id || 0
          const lastChat = readData?.last_chat_message || 0
          unread = lastChat > lastRead
        }

        let mention = false
        if (mentionRes.ok) {
          const mentions = await mentionRes.json()
          mention = mentions.some((m) => !m.is_viewed)
        }

        this.badges = { ...this.badges, [key]: { unread, mention, loading: false } }
      } catch {
        this.badges = { ...this.badges, [key]: { unread: false, mention: false, loading: false } }
      }
    },

    async refreshBadge(chatId) {
      if (!chatId) return
      const key = String(chatId)
      delete this.badges[key]
      this.badges = { ...this.badges }
      await this.fetchBadge(chatId)
    },

    async loadMentions() {
      if (!this.currentChatId) return
      const userId = this._currentUserId()
      if (!userId) return
      try {
        const res = await fetch(`/apisup/supply/mentions?user_id=${encodeURIComponent(userId)}&chat_id=${this.currentChatId}`, { credentials: 'include' })
        if (res.ok) {
          const data = await res.json()
          this.mentionedMessageIds = new Set(data.map((m) => m.message_id))
        }
      } catch {
        this.mentionedMessageIds = new Set()
      }
    },

    async markMentionsViewed() {
      if (!this.currentChatId) return
      const userId = this._currentUserId()
      if (!userId) return
      if (!this.mentionedMessageIds.size) return
      try {
        const res = await fetch(`/apisup/supply/mentions?chat_id=${this.currentChatId}&user_id=${encodeURIComponent(userId)}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_viewed: true, is_notified: true }),
        })
        if (res.ok && this.currentChatId) {
          await this.refreshBadge(this.currentChatId)
        }
      } catch {
        // ignore
      }
    },

    async loadChatList() {
      const userId = this._currentUserId()
      if (!userId) return
      this.chatListLoading = true
      try {
        const res = await fetch(`/apisup/supply/chats/my?user_id=${encodeURIComponent(userId)}`, { credentials: 'include' })
        if (res.ok) {
          this.chatList = normalizeArray(await res.json())
        }
      } catch {
        this.chatList = []
      } finally {
        this.chatListLoading = false
      }
    },

    async checkGlobalMentions() {
      const userId = this._currentUserId()
      if (!userId) return
      try {
        const res = await fetch(`/apisup/supply/mentions?user_id=${encodeURIComponent(userId)}`, { credentials: 'include' })
        if (res.ok) {
          const data = await res.json()
          this.hasUnviewedMentions = Array.isArray(data) && data.some((m) => !m.is_viewed)
        }
      } catch {
        this.hasUnviewedMentions = false
      }
    },

    _handleWsMessage(parsed) {
      const { type, ...data } = parsed
      const userId = this._currentUserId()

      switch (type) {
        case 'new_message': {
          const chatId = String(data.chat_id || '')
          const message = data.message
          if (chatId === this.currentChatId) {
            const exists = this.messages.some((m) => String(m.id) === String(message?.id))
            if (!exists && message) this.messages.push(message)
          } else if (chatId) {
            this.badges = {
              ...this.badges,
              [chatId]: { unread: true, mention: this.badges[chatId]?.mention || false, loading: false },
            }
            const ci = this.chatList.findIndex((c) => String(c.id) === chatId)
            if (ci >= 0) {
              this.chatList[ci] = { ...this.chatList[ci], unread_count: (this.chatList[ci].unread_count || 0) + 1 }
            }
          }
          break
        }
        case 'message_updated': {
          const muChatId = String(data.chat_id || '')
          const muMsg = data.message
          if (muChatId === this.currentChatId && muMsg) {
            const idx = this.messages.findIndex((m) => String(m.id) === String(muMsg.id))
            if (idx >= 0) this.messages[idx] = muMsg
          }
          break
        }
        case 'message_deleted': {
          const mdChatId = String(data.chat_id || '')
          if (mdChatId === this.currentChatId) {
            this.messages = this.messages.filter((m) => String(m.id) !== String(data.message_id))
          }
          break
        }
        case 'mention': {
          const menChatId = String(data.chat_id || '')
          if (menChatId === this.currentChatId) {
            this.mentionedMessageIds = new Set([...this.mentionedMessageIds, data.message_id])
          }
          const mi = this.chatList.findIndex((c) => String(c.id) === menChatId)
          if (mi >= 0) {
            this.chatList[mi] = { ...this.chatList[mi], has_unviewed_mention: true }
          }
          this.hasUnviewedMentions = true
          _playNotificationSound()
          break
        }
        case 'read_status': {
          const rsChatId = String(data.chat_id || '')
          const rsUserId = String(data.user_id || '')
          if (rsUserId && rsUserId !== userId) {
            if (!this.readStatusByUser[rsChatId]) {
              this.readStatusByUser[rsChatId] = {}
            }
            this.readStatusByUser[rsChatId][rsUserId] = data.last_read_message_id
          }
          if (rsChatId === this.currentChatId && rsUserId === userId && this.readStatus) {
            this.readStatus.last_read_message_id = data.last_read_message_id
          }
          if (rsUserId === userId && rsChatId) {
            this.badges = {
              ...this.badges,
              [rsChatId]: { unread: false, mention: this.badges[rsChatId]?.mention || false, loading: false },
            }
            const ri = this.chatList.findIndex((c) => String(c.id) === rsChatId)
            if (ri >= 0) {
              this.chatList[ri] = { ...this.chatList[ri], unread_count: 0 }
            }
          }
          break
        }
        case 'badge': {
          const bChatId = String(data.chat_id || '')
          if (bChatId) {
            this.badges = {
              ...this.badges,
              [bChatId]: { unread: !!data.unread, mention: !!data.has_unviewed_mention, loading: false },
            }
            const bi = this.chatList.findIndex((c) => String(c.id) === bChatId)
            if (bi >= 0) {
              this.chatList[bi] = {
                ...this.chatList[bi],
                unread_count: data.unread ? (this.chatList[bi].unread_count || 0) + 1 : 0,
                has_unviewed_mention: !!data.has_unviewed_mention,
              }
            }
          }
          break
        }
        case 'chat_updated': {
          const updatedChat = data.chat
          if (updatedChat?.id) {
            const idx = this.chatList.findIndex((c) => String(c.id) === String(updatedChat.id))
            if (idx >= 0) this.chatList[idx] = { ...this.chatList[idx], ...updatedChat }
          }
          break
        }
        case 'new_chat': {
          const newChat = data.chat
          if (newChat?.id) {
            const exists = this.chatList.some((c) => String(c.id) === String(newChat.id))
            if (!exists) this.chatList.unshift(newChat)
          }
          break
        }
        case 'global_mentions': {
          this.hasUnviewedMentions = (data.count || 0) > 0
          break
        }
      }
    },

    connectWebSocket() {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) return

      const userId = this._currentUserId()
      if (!userId) return

      if (this.wsPingTimer) {
        clearInterval(this.wsPingTimer)
        this.wsPingTimer = null
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const host = window.location.host
      const url = import.meta.env.DEV
        ? `${protocol}//${host}/ws/api/supply/ws?user_id=${encodeURIComponent(userId)}`
        : `${protocol}//${host}/apisup/supply/ws?user_id=${encodeURIComponent(userId)}`

      this.ws = new WebSocket(url)

      this.ws.onopen = () => {
        console.log('[WS] Connected')
        this.wsReconnectAttempts = 0
        this.wsPingTimer = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) this.ws.send('ping')
        }, 30000)
      }

      this.ws.onmessage = (event) => {
        let parsed
        try {
          parsed = JSON.parse(event.data)
        } catch {
          return
        }
        if (!parsed || typeof parsed !== 'object') return
        console.log('[WS] Event:', parsed.type, parsed)
        this._handleWsMessage(parsed)
      }

      this.ws.onclose = () => {
        console.log('[WS] Disconnected, retry in 3s')
        if (this.wsPingTimer) {
          clearInterval(this.wsPingTimer)
          this.wsPingTimer = null
        }
        this.ws = null
        const delay = Math.min(3000 * Math.pow(2, this.wsReconnectAttempts), 30000)
        this.wsReconnectAttempts++
        this.wsReconnectTimer = setTimeout(() => this.connectWebSocket(), delay)
      }

      this.ws.onerror = () => {
        this.ws?.close()
      }
    },

    disconnectWebSocket() {
      if (this.wsReconnectTimer) {
        clearTimeout(this.wsReconnectTimer)
        this.wsReconnectTimer = null
      }
      if (this.wsPingTimer) {
        clearInterval(this.wsPingTimer)
        this.wsPingTimer = null
      }
      this.wsReconnectAttempts = 0
      if (this.ws) {
        this.ws.onclose = null
        this.ws.close()
        this.ws = null
      }
    },

    _currentUserId() {
      try {
        const authStore = useAuthStore()
        return authStore?.user?.id || null
      } catch {
        return null
      }
    },

    _resolveEntityTitle() {
      if (this.currentChatId) {
        const found = this.chatList.find((c) => String(c.id) === this.currentChatId)
        if (found?.title) return found.title
      }
      const labels = {
        invoice: 'Чат счета',
        request: 'Чат заявки',
        deal: 'Чат сделки',
        specification: 'Чат спецификации',
        personal: 'Личный чат',
        delivery: 'Чат доставки',
      }
      return labels[this.currentEntityType] || 'Чат'
    },
  },
})
