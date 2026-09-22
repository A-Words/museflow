import { healthSchema } from '#shared/contracts/health'

export default defineEventHandler(() => healthSchema.parse({ status: 'ok', service: 'web' }))
