import withNuxt from './apps/web/.nuxt/eslint.config.mjs'
import boundaries from './scripts/eslint-boundaries.mjs'

export default withNuxt(
  { ignores: ['**/dist/**', '**/.nuxt/**', '**/.output/**', '**/.cache/**', 'coverage/**', 'tmp/**', 'storage/**', 'data/**', 'apps/web/prototype/**', '.agents/**'] },
  boundaries,
  // The generated config uses app-relative globs; this entrypoint is at workspace root.
  { files: ['apps/web/app/pages/**/*.vue', 'apps/web/app/layouts/**/*.vue'], rules: { 'vue/multi-word-component-names': 'off' } },
)
