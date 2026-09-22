import { resolve } from 'node:path'
import { Linter } from 'eslint'
import { describe, expect, it } from 'vitest'
// @ts-expect-error Local ESLint plugin is plain ESM JavaScript.
import boundaries from '../../scripts/eslint-boundaries.mjs'

const linter = new Linter()
const check = (code: string, filename = 'app/check.js') => linter.verify(code, boundaries, { filename: resolve(filename) })

describe('public import boundaries', () => {
  it.each([
    "import db from '../server/database/index.js'",
    "import db from '~~/server/database/index'",
    "export * from '../server/services/config.js'",
    "import config from '~~/server/services/config'",
    "import config from '@@/server/services/config'",
    "import fs from 'node:fs'",
    "import('../server/services/config.js')",
    'import(somePath)',
    "require('../server/database/index.js')",
  ])('rejects %s', (code) => {
    expect(check(code).some(message => message.ruleId === 'museflow/public-boundaries')).toBe(true)
  })
  it('allows public contracts and Vue', () => {
    expect(check("import { healthSchema } from '#shared/contracts/health'; import { ref } from 'vue'")).toEqual([])
  })
  it('prevents transitive imports through shared code and contracts', () => {
    expect(check("export * from '../server/services/config.js'", 'shared/check.js')).toHaveLength(1)
    expect(check("import pg from 'pg'", 'shared/contracts/check.js')).toHaveLength(1)
    expect(check("import { z } from 'zod'", 'shared/contracts/check.js')).toEqual([])
  })
})
