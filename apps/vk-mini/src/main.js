import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './styles.css'
import { useVkStore } from './stores/vk'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

const start = async () => {
  const vk = useVkStore(pinia)
  await vk.init()
  app.mount('#app')
}

start()
