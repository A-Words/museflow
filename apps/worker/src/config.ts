import { isAbsolute } from 'node:path'
import { z } from 'zod'

const schema = z.object({
  DATABASE_URL: z.url().refine(value => /^postgres(?:ql)?:\/\//.test(value)),
  STORAGE_ROOT: z.string().min(1).refine(isAbsolute),
})

export function parseWorkerConfig(env: NodeJS.ProcessEnv) {
  const result = schema.safeParse(env)
  if (!result.success) {
    const invalid = [...new Set(result.error.issues.map(issue => issue.path[0]))]
    throw new Error(`Invalid configuration: ${invalid.join(', ')}. Copy apps/worker/.env.example to .env; set a PostgreSQL URL and an absolute private storage path.`)
  }
  return result.data
}
