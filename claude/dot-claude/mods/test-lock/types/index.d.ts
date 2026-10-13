export type Holder = { kind: 'tests' | 'build'; label: string; command: string; startedAt: number }

declare module 'claude-code' {
  interface PluginState {
    'test-lock': { holder: Holder | null }
  }
}
