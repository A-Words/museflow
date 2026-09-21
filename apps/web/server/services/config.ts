import { isAbsolute } from 'node:path'
import { z } from 'zod'

const schema = z.object({
  databaseUrl: z.url().refine(value => /^postgres(?:ql)?:\/\//.test(value)),
  storageRoot: z.string().min(1).refine(isAbsolute),
})

export function parseServerConfig(input: unknown) {
  const result = schema.safeParse(input)
  if (!result.success) {
    const names = { databaseUrl: 'NUXT_DATABASE_URL', storageRoot: 'NUXT_STORAGE_ROOT' }
    const invalid = [...new Set(result.error.issues.map(issue => names[issue.path[0] as keyof typeof names] ?? 'server config'))]
    throw new Error(`Invalid configuration: ${invalid.join(', ')}. Copy apps/web/.env.example to .env; set a PostgreSQL URL and an absolute private storage path.`)
  }
  return result.data
}
