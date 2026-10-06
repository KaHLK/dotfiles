export type Limit = { pct: number; resetsAt?: string }
export type Snapshot = { contextPct?: number; fiveHour?: Limit; sevenDay?: Limit }

declare module 'claude-code' {
  interface PluginState {
    'usage-bar': { snapshot: Snapshot | null; effort: string | null; caveman: string | null }
  }
}
