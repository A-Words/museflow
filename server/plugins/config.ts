import { parseServerConfig } from '../services/config'

export default defineNitroPlugin(() => {
  parseServerConfig(useRuntimeConfig())
})
