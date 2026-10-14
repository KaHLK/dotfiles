export type Kind = 'tests' | 'build' | 'benchmark'
export type Holder = { kind: Kind; label: string; command: string; startedAt: number }

declare module 'claude-code' {
  interface PluginState {
    'test-lock': { holder: Holder | null }
  }
}
