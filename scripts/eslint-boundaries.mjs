import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const normalize = value => value.replaceAll('\\', '/')
const inside = (file, directory) => file === directory || file.startsWith(`${directory}/`)

// Apply to every file in these trees, including re-export barrels. This also
// prevents a shared utility from laundering a private import into the app.
export const publicBoundaryRule = {
  meta: {
    type: 'problem',
    schema: [],
    messages: { forbidden: 'Public code cannot import {{source}}. Keep server dependencies in server/ or the Worker; share public contracts via @museflow/contracts.' },
  },
  create(context) {
    const filename = normalize(path.relative(root, context.filename))
    const contracts = inside(filename, 'packages/contracts')
    const shared = inside(filename, 'apps/web/shared')
    const app = inside(filename, 'apps/web/app')
    if (!contracts && !shared && !app) return {}

    function allowed(source) {
      if (source === 'zod' || source.startsWith('zod/')) return true
      if (!contracts && source === '@museflow/contracts') return true
      if (app && ['vue', 'vue-router', '@nuxt/ui', '@ai-sdk/vue', '#imports', '#components', '#app'].includes(source)) return true
      let target
      if (source.startsWith('.')) target = path.resolve(path.dirname(context.filename), source)
      else if (/^(~\/|@\/)/.test(source)) target = path.resolve(root, 'apps/web/app', source.slice(2))
      else if (/^(~~\/|@@\/)/.test(source)) target = path.resolve(root, 'apps/web', source.slice(3))
      else if (source.startsWith('#shared/')) target = path.resolve(root, 'apps/web/shared', source.slice(8))
      if (!target) return false
      const relative = normalize(path.relative(root, target))
      if (contracts) return inside(relative, 'packages/contracts/src')
      return inside(relative, 'apps/web/shared') || (app && inside(relative, 'apps/web/app'))
    }

    function check(node, source) {
      if (typeof source !== 'string' || !allowed(source)) {
        context.report({ node, messageId: 'forbidden', data: { source: typeof source === 'string' ? source : 'a non-literal module path' } })
      }
    }
    return {
      ImportDeclaration: node => check(node, node.source.value),
      ExportNamedDeclaration: node => { if (node.source) check(node, node.source.value) },
      ExportAllDeclaration: node => check(node, node.source.value),
      ImportExpression: node => check(node, node.source.value),
      CallExpression: node => {
        if (node.callee.type === 'Identifier' && node.callee.name === 'require') check(node, node.arguments[0]?.value)
      },
      TSImportType: node => check(node, node.argument?.value ?? node.argument?.literal?.value),
      TSImportEqualsDeclaration: node => check(node, node.moduleReference?.expression?.value),
    }
  },
}

export default {
  name: 'museflow/public-boundaries',
  plugins: { museflow: { rules: { 'public-boundaries': publicBoundaryRule } } },
  rules: { 'museflow/public-boundaries': 'error' },
}
