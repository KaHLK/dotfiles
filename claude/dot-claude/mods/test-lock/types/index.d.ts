export type Holder = { label: string; command: string; startedAt: number }

declare module 'claude-code' {
  interface PluginState {
    'test-lock': { holder: Holder | null }
  }
}
