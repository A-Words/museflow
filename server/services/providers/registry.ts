import type {
  ProviderConfig,
  ProviderDefault,
  ProviderKind,
  ProviderSnapshot,
} from '../../../shared/contracts/provider/common.js'
import type { ProviderPort } from '../../../shared/contracts/provider/ports.js'
import {
  resolveSnapshotRoute,
  selectProviderForNewRequest,
  type CapabilityRequirement,
  type NewRequestRoute,
  type SnapshotRoute,
} from '../../../shared/contracts/provider/routing.js'
import { createMockMusicPort } from './mock/music.js'
import { createMockScript, type MockScript, type MockScriptOptions } from './mock/script.js'
import { createMockSpeechPort } from './mock/speech.js'
import { createMockTextPort } from './mock/text.js'

// Registry for the switchable provider ports. It is the only place that knows which adapter
// implementations exist; business code asks for a snapshot and receives a port.
//
// Two switching rules are enforced by the shape of this API (FR-11, T-26, T-27):
// - `selectForNewRequest` reads the current default of a kind, so a business caller never
//   mentions an adapter and never changes when the default changes.
// - `port(snapshot)` resolves an already stored snapshot and never consults the defaults, so
//   old quotes, running tasks and cloned voice profiles stay on their original provider.

export interface MockProviderRegistryOptions {
  configs: readonly ProviderConfig[]
  defaults: readonly ProviderDefault[]
  /** Per-adapter mock scripts. One instance per adapter id, reused across calls. */
  scripts?: Partial<Record<string, MockScriptOptions>>
}

export interface ProviderRegistry {
  configs(): readonly ProviderConfig[]
  defaults(): readonly ProviderDefault[]
  /** Publishing a new default affects later new requests and quotes only. */
  setDefault(kind: ProviderKind, ref: { providerConfigId: string; version: number }): void
  selectForNewRequest(input: {
    kind: ProviderKind
    requirements?: readonly CapabilityRequirement[]
    now: string
  }): NewRequestRoute
  resolveSnapshot(input: {
    snapshot: ProviderSnapshot
    requirements?: readonly CapabilityRequirement[]
  }): SnapshotRoute
  /** Port for a stored snapshot. An in-flight task keeps its original adapter here. */
  port(snapshot: ProviderSnapshot): ProviderPort
}

export function createMockProviderRegistry(options: MockProviderRegistryOptions): ProviderRegistry {
  const configs = [...options.configs]
  const defaults = [...options.defaults]
  const scripts = new Map<string, MockScript>()

  function scriptFor(adapterId: string): MockScript {
    const existing = scripts.get(adapterId)
    if (existing) return existing
    const created = createMockScript(options.scripts?.[adapterId] ?? {})
    scripts.set(adapterId, created)
    return created
  }

  return {
    configs: () => configs,
    defaults: () => defaults,

    setDefault(kind, ref) {
      const index = defaults.findIndex(entry => entry.kind === kind)
      const entry: ProviderDefault = { kind, providerConfigId: ref.providerConfigId, version: ref.version }
      if (index === -1) defaults.push(entry)
      else defaults[index] = entry
    },

    selectForNewRequest(input) {
      return selectProviderForNewRequest({
        kind: input.kind,
        defaults,
        configs,
        ...(input.requirements ? { requirements: input.requirements } : {}),
        now: input.now,
      })
    },

    resolveSnapshot(input) {
      return resolveSnapshotRoute({
        snapshot: input.snapshot,
        configs,
        ...(input.requirements ? { requirements: input.requirements } : {}),
      })
    },

    port(snapshot) {
      // Reuse the same resolver the business layer uses, so a disabled or drifted snapshot
      // cannot be turned into a port here.
      const resolved = resolveSnapshotRoute({ snapshot, configs })
      if (!resolved.ok) {
        throw new Error(`Provider route is not usable: ${resolved.error.code} ${resolved.error.message}`)
      }
      const published = resolved.config
      if (published.sourceMode !== 'mock') {
        throw new Error(
          `No adapter is registered for ${published.adapterId}; real adapters arrive with the per-kind issues`,
        )
      }
      const script = scriptFor(published.adapterId)
      switch (published.kind) {
        case 'text':
          return createMockTextPort(published, script)
        case 'music':
          return createMockMusicPort(published, script)
        case 'tts':
          return createMockSpeechPort(published, script)
      }
    },
  }
}
