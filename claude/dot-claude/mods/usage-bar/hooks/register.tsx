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

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const current = (await read($, snapshot)) ?? {}
    const currentEffort = await read($, effort)
    const currentCaveman = await read($, caveman)
    const model = displayName(await $.session.model())
    const now = await $.clock.now()

    const left: JSX.Element[] = []
    const right: JSX.Element[] = []

    if (currentCaveman !== null) {
      left.push(
        <Text key="caveman" color={CAVEMAN_COLOR}>
          {cavemanLabel(currentCaveman)}
        </Text>,
      )
    }

    left.push(
      <Text key="model" dimColor>
        {currentEffort === null ? model : `${model} · ${currentEffort}`}
      </Text>,
    )

    if (current.contextPct !== undefined) {
      const pct = Math.floor(current.contextPct)
      right.push(
        <Text key="ctx" {...tone(pct)}>
          {bar(pct)} {pct}%
        </Text>,
      )
    }

    for (const [key, label, limit] of [
      ['5h', '5h', current.fiveHour],
      ['7d', '7d', current.sevenDay],
    ] as const) {
      if (limit === undefined) continue

      const pct = Math.round(limit.pct)
      const remaining = key === '5h' ? countdown(limit.resetsAt, now) : undefined
      right.push(
        <Text key={key} {...tone(pct)}>
          {label}: {pct}%{remaining === undefined ? '' : ` (${remaining})`}
        </Text>,
      )
    }

    return (
      <Box width="100%" justifyContent="space-between">
        <Box gap={1}>{left}</Box>
        <Box>
          {right.flatMap((segment, i) =>
            i === 0
              ? [segment]
              : [
                  <Text key={`sep${i}`} dimColor>
                    {' | '}
                  </Text>,
                  segment,
                ],
          )}
        </Box>
      </Box>
    )
  })
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
const tone = (pct: number) =>
  pct >= 80 ? { color: 'error' as const } : pct >= 60 ? { color: 'warning' as const } : { dimColor: true }

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
