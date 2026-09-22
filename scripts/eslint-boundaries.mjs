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
    messages: { forbidden: 'Public code cannot import {{source}}. Keep server dependencies in server/; share public contracts via #shared.' },
  },
  create(context) {
    const filename = normalize(path.relative(root, context.filename))
    const shared = inside(filename, 'shared')
    const app = inside(filename, 'app')
    if (!shared && !app) return {}

    function allowed(source) {
      if (source === 'zod' || source.startsWith('zod/')) return true
      if (app && ['vue', 'vue-router', '@nuxt/ui', '@ai-sdk/vue', '#imports', '#components', '#app'].includes(source)) return true
      let target
      if (source.startsWith('.')) target = path.resolve(path.dirname(context.filename), source)
      else if (/^(~\/|@\/)/.test(source)) target = path.resolve(root, 'app', source.slice(2))
      else if (/^(~~\/|@@\/)/.test(source)) target = path.resolve(root, source.slice(3))
      else if (source.startsWith('#shared/')) target = path.resolve(root, 'shared', source.slice(8))
      if (!target) return false
      const relative = normalize(path.relative(root, target))
      return inside(relative, 'shared') || (app && inside(relative, 'app'))
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
