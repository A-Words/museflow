export default defineNuxtConfig({
  compatibilityDate: '2026-09-22',
  modules: ['@nuxt/ui', '@nuxt/eslint'],
  css: ['~/assets/css/main.css'],
  devtools: { enabled: false },
  nitro: { preset: 'node-server' },
  typescript: { strict: true },
  runtimeConfig: {
    databaseUrl: '',
    storageRoot: '',
    public: { appName: 'MuseFlow' },
  },
  // Keep the scaffold reproducible without external font downloads.
  ui: { fonts: false },
  icon: { serverBundle: { collections: ['lucide'] }, fallbackToApi: false },
})
