export type Shown = { path: string; width: number; height: number; caption?: string; generation: number }

declare module 'claude-code' {
  interface PluginState {
    'image-preview': { images: Shown[]; index: number; title: string }
  }
}
