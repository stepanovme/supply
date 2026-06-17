import { defineStore } from 'pinia'

const SERVICE_ID = '7dd8be78-cf3a-423a-852f-eab3511fbe30'
const SSO_URL = 'https://sso.st29.ru/?url=supply.st29.ru'

const isPublicRoute = () => window.location.pathname.startsWith('/request-suppliers/link/')

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    roleName: '',
    initialized: false,
    loading: false,
  }),
  actions: {
    async init() {
      if (this.loading || this.initialized) return
      if (isPublicRoute()) {
        this.user = null
        this.roleName = ''
        this.initialized = true
        return
      }
      this.loading = true
      try {
        const validateRes = await fetch('/api/as/auth/validate-session', {
          method: 'POST',
          credentials: 'include',
        })
        if (!validateRes.ok) {
          window.location.href = SSO_URL
          return
        }
        const validateJson = await validateRes.json()
        if (!validateJson.valid) {
          window.location.href = SSO_URL
          return
        }

        const meRes = await fetch('/api/as/users/me', { credentials: 'include' })
        if (!meRes.ok) {
          window.location.href = SSO_URL
          return
        }
        const me = await meRes.json()
        const roles = Array.isArray(me.roles) ? me.roles : []

        const roleByService = roles.find((role) => role.service_id === SERVICE_ID)
        const roleGlobal = roles.find((role) => role.service_id == null && role.is_global === 1)
        const chosenRole = roleByService || roleGlobal

        if (!chosenRole) {
          window.location.href = SSO_URL
          return
        }

        this.user = me
        this.roleName = chosenRole.name
        this.initialized = true
      } catch (error) {
        window.location.href = SSO_URL
      } finally {
        this.loading = false
      }
    },
  },
})
