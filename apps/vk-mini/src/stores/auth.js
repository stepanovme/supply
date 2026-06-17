import { defineStore } from 'pinia'

const SERVICE_ID = '7dd8be78-cf3a-423a-852f-eab3511fbe30'
const SSO_URL = 'https://sso.st29.ru/?url=supply.st29.ru'

export const useAuthStore = defineStore('vkMiniAuth', {
  state: () => ({
    user: null,
    roleName: '',
    initialized: false,
    loading: false,
    error: '',
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.user),
  },
  actions: {
    async init(force = false) {
      if (this.loading || (this.initialized && !force)) return
      this.loading = true
      this.error = ''
      try {
        const validateRes = await fetch('/api/as/auth/validate-session', {
          method: 'POST',
          credentials: 'include',
        })
        if (!validateRes.ok) {
          this.initialized = true
          this.user = null
          return
        }
        const validateJson = await validateRes.json()
        if (!validateJson.valid) {
          this.initialized = true
          this.user = null
          return
        }

        const meRes = await fetch('/api/as/users/me', { credentials: 'include' })
        if (!meRes.ok) {
          this.initialized = true
          this.user = null
          return
        }

        const me = await meRes.json()
        const roles = Array.isArray(me.roles) ? me.roles : []
        const roleByService = roles.find((role) => role.service_id === SERVICE_ID)
        const roleGlobal = roles.find((role) => role.service_id == null && role.is_global === 1)
        const chosenRole = roleByService || roleGlobal

        if (!chosenRole) {
          this.initialized = true
          this.user = null
          this.error = 'Нет доступа к сервису снабжения.'
          return
        }

        this.user = me
        this.roleName = chosenRole.name
        this.initialized = true
      } catch {
        this.initialized = true
        this.user = null
        this.error = 'Не удалось проверить сессию.'
      } finally {
        this.loading = false
      }
    },
    login() {
      window.location.href = SSO_URL
    },
  },
})
