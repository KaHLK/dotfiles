import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, TurnStepInput } from 'claude-code'

const BAND_PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 5,
  bodyColumns: 80,
  scroll: { offset: 0, bodyRows: 5 },
  view: {},
}

const NOW = Date.parse('2026-10-06T12:00:00Z')

test('band shows context bar, 5h with countdown and 7d, colored by threshold', async ($, on) => {
  mock.clock(on, { now: NOW })
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('session.model', () => ({ value: 'Opus 5.5' }))

  await $.session.measure({
    context: { window: 200_000, tokens: 68_000, percent: 34 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 65.4, resetsAt: '2026-10-06T14:14:30Z' },
      { kind: 'seven_day', percentUsed: 85 },
    ],
    changed: ['context', 'rateLimits'],
  })

  const ui = await $.ui.mount({ plugin: 'usage-bar', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS })
  const ctx = await ui.find({ type: 'Text', text: /%$/ })
  const fiveHour = await ui.find({ type: 'Text', text: /^5h:/ })
  const sevenDay = await ui.find({ type: 'Text', text: /^7d:/ })

  expect(ctx?.text).toBe('▓▓▓░░░░░░░ 34%')
  expect(ctx?.props.dimColor).toBe(true)
  expect(fiveHour?.text).toBe('5h: 65% (2h 14m)')
  expect(fiveHour?.props.color).toBe('warning')
  expect(sevenDay?.text).toBe('7d: 85%')
  expect(sevenDay?.props.color).toBe('error')
})

test('band shows the model alone before anything is measured', async ($, on) => {
  mock.clock(on, { now: NOW })
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  on('session.model', () => ({ value: 'Opus 5.5' }))

  const ui = await $.ui.mount({ plugin: 'usage-bar', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS })

  expect((await ui.find({ type: 'Text', text: 'Opus 5.5' })) !== undefined).toBe(true)
  expect(await ui.find({ type: 'Text', text: /%/ })).toBe(undefined)
})

for (const [id, shown] of [
  ['claude-opus-5-5', 'Opus 5.5'],
  ['claude-haiku-4-5-20251001', 'Haiku 4.5'],
  ['claude-opus-5-5[1m]', 'Opus 5.5 (1M context)'],
  ['some-custom-model', 'some-custom-model'],
] as const) {
  test(`band shows model id ${id} as ${shown}`, async ($, on) => {
    mock.clock(on, { now: NOW })
    on('ui.render', ($, e) => {
      const { Box } = $.ui.resolve(e)
      return <Box />
    })
    on('session.model', () => ({ value: id }))

    const ui = await $.ui.mount({ plugin: 'usage-bar', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS })

    expect((await ui.find({ type: 'Text', text: shown })) !== undefined).toBe(true)
  })
}

const band = (on: On, model = 'claude-opus-5-5') => {
  mock.clock(on, { now: NOW })
  mock.env(on, { HOME: '/Users/me' })
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  on('session.model', () => ({ value: model }))
}

const step = (effort: TurnStepInput['effort'], agentId?: string): TurnStepInput => ({
  turnId: 't1',
  index: 0,
  model: 'claude-opus-5-5',
  effort,
  messageCount: 1,
  agentId,
})

const mountBand = ($: Engine) =>
  $.ui.mount({ plugin: 'usage-bar', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS })

test('session start seeds effort from settings and caveman from its flag file', async ($, on) => {
  band(on)
  const read: string[] = []
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] } }))
  on('settings.read', () => ({ value: { effortLevel: 'high' } }))
  on('fs.read', ($, e) => {
    read.push(e.path)
    return { value: 'ultra\n' }
  })

  await $.session.start({ cwd: '/Users/me/project', surface: 'terminal', isInteractive: true })
  const ui = await mountBand($)

  expect(read).toEqual(['/Users/me/.claude/.caveman-active'])
  expect((await ui.find({ type: 'Text', text: 'Opus 5.5 · high' })) !== undefined).toBe(true)
  expect((await ui.find({ type: 'Text', text: '[CAVEMAN:ULTRA]' }))?.props.color).toBe('#d78700')
})

test('main-thread step sets effort, a subagent step leaves it', async ($, on) => {
  band(on)
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }
  })

  for await (const _ of $.turn.step(step('max'))) {
  }
  for await (const _ of $.turn.step(step('low', 'agent-1'))) {
  }
  const ui = await mountBand($)

  expect((await ui.find({ type: 'Text', text: 'Opus 5.5 · max' })) !== undefined).toBe(true)
})

test('model shows without effort when none is known', async ($, on) => {
  band(on)

  const ui = await mountBand($)

  expect((await ui.find({ type: 'Text', text: 'Opus 5.5' })) !== undefined).toBe(true)
  expect(await ui.find({ type: 'Text', text: /·/ })).toBe(undefined)
})

test('caveman label follows the flag file across prompts', async ($, on) => {
  band(on)
  let flag: string | null = null
  on('fs.read', () => {
    if (flag === null) throw new Error('ENOENT')
    return { value: flag }
  })
  on('prompt.submit', ($, e) => ({ text: e.text }))
  const submit = () => $.prompt.submit({ text: 'hi', wait: false, origin: { kind: 'composer' } })

  await submit()
  expect(await (await mountBand($)).find({ type: 'Text', text: /CAVEMAN/ })).toBe(undefined)

  flag = 'full'
  await submit()
  expect((await (await mountBand($)).find({ type: 'Text', text: '[CAVEMAN]' })) !== undefined).toBe(true)

  flag = 'lite'
  await submit()
  expect((await (await mountBand($)).find({ type: 'Text', text: '[CAVEMAN:LITE]' })) !== undefined).toBe(true)

  flag = null
  await submit()
  expect(await (await mountBand($)).find({ type: 'Text', text: /CAVEMAN/ })).toBe(undefined)
})
