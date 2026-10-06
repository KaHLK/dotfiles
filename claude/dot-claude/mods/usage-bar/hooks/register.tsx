import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextUsage, SessionRateLimit } from 'claude-code'

import type { Limit, Snapshot } from '../types'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const { context, rateLimits } = await $.session.usage()
    const { effortLevel } = await $.settings.read()
    await store($, context, rateLimits)
    if (typeof effortLevel === 'string') await setEffort($, effortLevel)
    await refreshCaveman($)

    return result
  })

  on('session.measure', async ($, e, next) => {
    await store($, e.context, e.rateLimits)

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined && e.effort !== undefined) await setEffort($, String(e.effort))

    return yield* next(e)
  })

  // Caveman's own prompt hook writes the flag file, so read it after the chain
  on('prompt.submit', async ($, e, next) => {
    const result = await next(e)
    await refreshCaveman($)

    return result
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    await refreshCaveman($)

    return next(e)
  })

  // Right end of the footer row; the engine's mode labels stay, ours follow
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const { Box, Text } = $.ui.resolve(e)
    const segments = await segmentsOf($)
    const engine = await next(e)

    return (
      <Box gap={2}>
        {engine}
        <Box>
          {segments.flatMap(segment => [
            ...(segment.sep === ''
              ? []
              : [
                  <Text key={`${segment.key}-sep`} dimColor>
                    {segment.sep}
                  </Text>,
                ]),
            <Text key={segment.key} {...segment.style}>
              {segment.text}
            </Text>,
          ])}
        </Box>
      </Box>
    )
  })
}

type Segment = {
  key: string
  text: string
  sep: string
  style: { color?: string; dimColor?: boolean }
}

const segmentsOf = async ($: EngineInterface): Promise<Segment[]> => {
  const current = (await read($, snapshot)) ?? {}
  const currentEffort = await read($, effort)
  const currentCaveman = await read($, caveman)
  const model = displayName(await $.session.model())
  const now = await $.clock.now()
  const segments: Segment[] = []

  if (currentCaveman !== null) {
    segments.push({ key: 'caveman', text: cavemanLabel(currentCaveman), sep: '', style: { color: CAVEMAN_COLOR } })
  }

  segments.push({
    key: 'model',
    text: currentEffort === null ? model : `${model} · ${currentEffort}`,
    sep: segments.length === 0 ? '' : ' ',
    style: { dimColor: true },
  })

  let usageSep = '  '

  if (current.contextPct !== undefined) {
    const pct = Math.floor(current.contextPct)
    segments.push({ key: 'ctx', text: `${bar(pct)} ${pct}%`, sep: usageSep, style: tone(pct) })
    usageSep = ' | '
  }

  for (const [key, limit] of [
    ['5h', current.fiveHour],
    ['7d', current.sevenDay],
  ] as const) {
    if (limit === undefined) continue

    const pct = Math.round(limit.pct)
    const remaining = key === '5h' ? countdown(limit.resetsAt, now) : undefined
    segments.push({
      key,
      text: `${key}: ${pct}%${remaining === undefined ? '' : ` (${remaining})`}`,
      sep: usageSep,
      style: tone(pct),
    })
    usageSep = ' | '
  }

  return segments
}

const BAR_WIDTH = 10
// xterm 172, as the old status line drew it
const CAVEMAN_COLOR = '#d78700'

const snapshot = atom({ plugin: 'usage-bar', key: 'snapshot' } as const, null)
const effort = atom({ plugin: 'usage-bar', key: 'effort' } as const, null)
const caveman = atom({ plugin: 'usage-bar', key: 'caveman' } as const, null)

// Skip same-value writes: each one redraws the band
const setEffort = async ($: EngineInterface, value: string) => {
  if ((await read($, effort)) !== value) await update($, effort, () => value)
}

const setCaveman = async ($: EngineInterface, value: string | null) => {
  if ((await read($, caveman)) !== value) await update($, caveman, () => value)
}

const refreshCaveman = async ($: EngineInterface) => {
  const home = (await $.env.get('HOME')) ?? ''
  const mode = await $.fs.read(`${home}/.claude/.caveman-active`).then(
    text => String(text).trim(),
    () => null,
  )
  await setCaveman($, mode)
}

// `claude-opus-5-5[1m]` → `Opus 5.5 (1M context)`; unknown shapes pass through
const MODEL_ID = /^claude-([a-z]+)-(\d+(?:-\d{1,2})*?)(?:-\d{8})?(\[1m\])?$/

const displayName = (id: string) => {
  const match = MODEL_ID.exec(id)
  if (match === null) return id

  const [, family = '', version = '', isLong] = match
  const name = `${family.charAt(0).toUpperCase()}${family.slice(1)} ${version.replaceAll('-', '.')}`

  return isLong === undefined ? name : `${name} (1M context)`
}

const cavemanLabel = (mode: string) =>
  mode === '' || mode === 'full' ? '[CAVEMAN]' : `[CAVEMAN:${mode.toUpperCase()}]`

const store = ($: EngineInterface, context: SessionContextUsage, rateLimits: SessionRateLimit[]) =>
  update($, snapshot, (): Snapshot => ({
    contextPct: context.percent,
    fiveHour: limitOf(rateLimits, 'five_hour'),
    sevenDay: limitOf(rateLimits, 'seven_day'),
  }))

const limitOf = (rateLimits: SessionRateLimit[], kind: string): Limit | undefined => {
  const found = rateLimits.find(limit => limit.kind === kind)

  return found === undefined ? undefined : { pct: found.percentUsed, resetsAt: found.resetsAt }
}

// Same thresholds as the old status line: red ≥80, yellow ≥60, dim otherwise
const tone = (pct: number): Segment['style'] =>
  pct >= 80 ? { color: 'error' } : pct >= 60 ? { color: 'warning' } : { dimColor: true }

const bar = (pct: number) => {
  const filled = Math.max(0, Math.min(BAR_WIDTH, Math.floor((pct * BAR_WIDTH) / 100)))

  return '▓'.repeat(filled) + '░'.repeat(BAR_WIDTH - filled)
}

const countdown = (resetsAt: string | undefined, now: number) => {
  if (resetsAt === undefined) return undefined

  const seconds = Math.floor((Date.parse(resetsAt) - now) / 1000)
  if (!(seconds > 0)) return undefined

  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)

  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
}
