import withNuxt from './.nuxt/eslint.config.mjs'
import boundaries from './scripts/eslint-boundaries.mjs'

export default withNuxt(
  { ignores: ['**/dist/**', '**/.nuxt/**', '**/.output/**', '**/.cache/**', 'coverage/**', 'tmp/**', 'storage/**', 'data/**', 'prototype/**', '.agents/**'] },
  boundaries,
)
