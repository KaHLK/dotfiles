import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const LOCK = '/Users/me/.cache/pluto-test.lock'
const HOLDER = { label: 'stack (abcd1234)', command: 'bun run test', startedAt: 1 }
const BAND_PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 5,
  bodyColumns: 80,
  scroll: { offset: 0, bodyRows: 5 },
  view: {},
}

const run = (exitCode: number, stdout = '') => ({
  value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
})

const world = (on: On, isLocked: boolean, locker: string | null = '/usr/local/bin/flock') => {
  const ran: string[] = []
  const written: Record<string, string> = {}

  mock.env(on, { HOME: '/Users/me' })
  mock.clock(on)
  on('session.root', () => ({ value: '/Users/me/pluto/stack' }))
  on('session.id', () => ({ value: 'abcd1234-5678' }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  on('process.run', ($, e) =>
    e.argv[0] === '/bin/sh'
      ? run(locker === null ? 1 : 0, locker === null ? '' : `${locker}\n`)
      : run(isLocked ? 1 : 0),
  )
  on('fs.read', () => ({ value: JSON.stringify(HOLDER) }))
  on('fs.write', ($, e) => {
    written[e.path] = e.text
    return { value: undefined }
  })
  on('tool.call', { tool: 'Bash' }, ($, e) => {
    ran.push(e.command)
    return { result: { stdout: 'ok', stderr: '', interrupted: false } }
  })

  return { ran, written }
}

test('test command runs under the lock when no other session holds it', async ($, on) => {
  const { ran, written } = world(on, false)

  await $.tool.call({ tool: 'Bash', command: 'cd js && bun run test --silent' })

  expect(ran).toHaveLength(1)
  expect(ran[0]).toContain('/usr/local/bin/flock -n 9')
  expect(ran[0]).toContain(`'${LOCK}'`)
  expect(ran[0]).toContain('cd js && bun run test --silent')
  expect(JSON.parse(written[`${LOCK}.json`] ?? '{}').command).toBe('cd js && bun run test --silent')
})

test('test command falls back to lockf when flock is missing', async ($, on) => {
  const { ran } = world(on, false, '/usr/bin/lockf')

  await $.tool.call({ tool: 'Bash', command: 'bun run test' })

  expect(ran[0]).toContain('/usr/bin/lockf -s -t 0 9')
})

test('test command runs unwrapped when neither flock nor lockf exists', async ($, on) => {
  const { ran } = world(on, true, null)

  await $.tool.call({ tool: 'Bash', command: 'bun run test' })

  expect(ran).toEqual(['bun run test'])
})

test('test command is denied, naming the holder, while another session holds the lock', async ($, on) => {
  const { ran } = world(on, true)

  const called = await $.tool.call({ tool: 'Bash', command: 'dotnet test' })

  expect(ran).toHaveLength(0)
  expect(called.deny ?? called.text).toContain('tests running in stack (abcd1234)')
})

test('build is denied while the lock is held', async ($, on) => {
  const { ran } = world(on, true)

  await $.tool.call({ tool: 'Bash', command: 'bunx tsc --noEmit' })

  expect(ran).toHaveLength(0)
})

test('build runs unwrapped when the lock is free', async ($, on) => {
  const { ran } = world(on, false)

  await $.tool.call({ tool: 'Bash', command: 'bunx tsc --noEmit' })

  expect(ran).toEqual(['bunx tsc --noEmit'])
})

test('unrelated command runs unchanged while the lock is held', async ($, on) => {
  const { ran } = world(on, true)

  await $.tool.call({ tool: 'Bash', command: 'git status' })

  expect(ran).toEqual(['git status'])
})

for (const isLocked of [true, false]) {
  test(`band ${isLocked ? 'shows' : 'hides'} the holder when the lock is ${isLocked ? 'held' : 'free'}`, async ($, on) => {
    world(on, isLocked)
    await $.tool.call({ tool: 'Bash', command: 'git status' })
    await $.tool.call({ tool: 'Bash', command: 'bun run build' })

    const ui = await $.ui.mount({ plugin: 'test-lock', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS })
    const found = await ui.find({ type: 'Text', text: /tests running in stack/ })

    expect(found !== undefined).toBe(isLocked)
  })
}
