import { defineStore } from 'pinia'
import bridge from '@vkontakte/vk-bridge'

export const useVkStore = defineStore('vkBridge', {
  state: () => ({
    initialized: false,
    loading: false,
    isVkApp: false,
    platform: '',
    scheme: '',
    launchParams: {},
    user: null,
    config: null,
    error: '',
  }),
  getters: {
    appearanceScheme: (state) => state.scheme || 'bright_light',
  },
  actions: {
    async init(force = false) {
      if (this.loading || (this.initialized && !force)) return
      this.loading = true
      this.error = ''
      try {
        this.launchParams = bridge.parseURLSearchParams(window.location.search)
        this.platform = String(this.launchParams.vk_platform || '')
        this.scheme = String(this.launchParams.vk_scheme || '')
        this.isVkApp = Boolean(this.platform)

        await bridge.send('VKWebAppInit')

        try {
          this.config = await bridge.send('VKWebAppGetConfig')
        } catch {
          this.config = null
        }

        if (this.isVkApp) {
          try {
            this.user = await bridge.send('VKWebAppGetUserInfo')
          } catch {
            this.user = null
          }
        }

        bridge.subscribe((event) => {
          if (event?.detail?.type === 'VKWebAppUpdateConfig') {
            this.config = event.detail.data
            this.scheme = String(event.detail.data?.scheme || this.scheme || '')
          }
        })

        this.initialized = true
      } catch {
        this.error = 'Не удалось инициализировать VK Bridge.'
        this.initialized = true
      } finally {
        this.loading = false
      }
    },
  },
})
