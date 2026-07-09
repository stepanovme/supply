import { defineStore } from 'pinia'
import { useAuthStore } from './auth'
import { ref } from 'vue'

export const useTicketsStore = defineStore('tickets', () => {
  const tickets = ref([])
  const incompleteCount = ref(0)
  const loading = ref(false)

  async function loadIncompleteCount() {
    try {
      const res = await fetch('/apisup/supply/tickets/incomplete-count', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        incompleteCount.value = data.count || 0
      }
    } catch {}
  }

  async function loadTickets() {
    loading.value = true
    try {
      const res = await fetch('/apisup/supply/tickets/my', { credentials: 'include' })
      if (res.ok) tickets.value = await res.json()
    } catch {}
    finally { loading.value = false }
  }

  async function createTicket({ type, description, files }) {
    const authStore = useAuthStore()
    const res = await fetch('/apisup/supply/tickets', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, status_id: '1ff34436-1312-11f1-aa8c-bc241127d0bd', chat_id: 0 }),
    })
    if (!res.ok) throw new Error('create ticket failed')
    const ticket = await res.json()

    if (authStore.user?.id) {
      await fetch(`/apisup/supply/tickets/${ticket.id}/users`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_id: ticket.id, user_id: authStore.user.id, role_id: 'author' }),
      })
    }

    try {
      const deptRes = await fetch('/apisup/supply/departments/1/users', { credentials: 'include' })
      if (deptRes.ok) {
        const users = await deptRes.json()
        for (const u of users) {
          await fetch(`/apisup/supply/tickets/${ticket.id}/users`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticket_id: ticket.id, user_id: u.user_id, role_id: 'assignee' }),
          })
        }
      }
    } catch {}

    let chatId = ticket.chat_id
    if (!chatId) {
      try {
        const chatRes = await fetch('/apisup/supply/chats', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'ticket', ticket_id: ticket.id }),
        })
        if (chatRes.ok) {
          const chatData = await chatRes.json()
          chatId = chatData?.id || chatData?.chat_id
        }
      } catch {}
    }

    if (chatId) {
      await fetch(`/apisup/supply/tickets/${ticket.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId }),
      })
      if (authStore.user?.id) {
        await fetch(`/apisup/supply/chats/${chatId}/members`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: authStore.user.id }),
        })
      }
      ticket.chat_id = chatId
    }

    if (chatId && (description?.trim() || files?.length)) {
      const msgRes = await fetch(`/apisup/supply/chats/${chatId}/messages`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_text: description?.trim() || '' }),
      })
      if (msgRes.ok && files?.length) {
        const msg = await msgRes.json()
        for (const file of files) {
          const fd = new FormData()
          fd.append('file', file)
          await fetch(`/apisup/supply/chats/${chatId}/messages/${msg.id}/attachments`, {
            method: 'POST', credentials: 'include', body: fd,
          })
        }
      }
    }

    return ticket
  }

  async function updateTicketStatus(ticketId, statusId) {
    const res = await fetch(`/apisup/supply/tickets/${ticketId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status_id: statusId }),
    })
    return res.ok
  }

  return { tickets, incompleteCount, loading, loadIncompleteCount, loadTickets, createTicket, updateTicketStatus }
})
