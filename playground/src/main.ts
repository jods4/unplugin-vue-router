import { createApp } from 'vue'
import App from './App.vue'
import { DataLoaderPlugin } from 'unplugin-vue-router/data-loaders'
import { MutationCache, QueryCache, VueQueryPlugin } from '@tanstack/vue-query'
import { createPinia } from 'pinia'
import { PiniaColada } from '@pinia/colada'
import { router } from './router'

const app = createApp(App)

app.use(createPinia())
app.use(PiniaColada)
app.use(VueQueryPlugin, {
  queryClientConfig: {
    mutationCache: new MutationCache({
      onSuccess(data, vars, context, mutation) {
        // debugger
        mutation
      },
      async onSettled(...args) {
        await new Promise((r) => setTimeout(r, 1000))
        console.log('global onSettled', ...args)
      },
    }),
  },
})
app.use(DataLoaderPlugin, { router })
app.use(router)

app.mount('#app')

// small logger for navigations, useful to check HMR
router.isReady().then(() => {
  router.beforeEach((to, from) => {
    console.log('🧭', from.fullPath, '->', to.fullPath)
  })
})
