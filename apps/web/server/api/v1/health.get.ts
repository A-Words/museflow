import { healthSchema } from '@museflow/contracts'

export default defineEventHandler(() => healthSchema.parse({ status: 'ok', service: 'web' }))
