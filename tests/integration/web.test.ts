import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { healthSchema } from '../../shared/contracts/health.js'

describe('Nuxt SSR and Nitro HTTP', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../..', import.meta.url)),
    browser: false,
    nuxtConfig: {
      runtimeConfig: {
        databaseUrl: 'postgresql://unused:MF04_PRIVATE_SENTINEL@127.0.0.1:1/unused',
        storageRoot: resolve('storage'),
      },
    },
  })

  it('serves the public health contract without contacting a database', async () => {
    expect(healthSchema.parse(await $fetch('/api/v1/health'))).toEqual({ status: 'ok', service: 'web' })
  })
  it('renders the page on the server without exposing private configuration', async () => {
    const html = await $fetch<string>('/')
    expect(html).toContain('MuseFlow')
    expect(html).toContain('Web 进程：ok')
    expect(html).not.toContain('MF04_PRIVATE_SENTINEL')
    expect(html).not.toContain('databaseUrl')
  })

  it('serves the dialog icon from the bundled collection', async () => {
    const result = await $fetch<{ icons: { x: { body: string } } }>('/api/_nuxt_icon/lucide.json?icons=x')
    expect(result.icons.x.body).toContain('<path')
  })
})
