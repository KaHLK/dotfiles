import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const LOCK = '/Users/me/.cache/pluto-test.lock'
const HOLDER = { kind: 'tests', label: 'stack (abcd1234)', command: 'bun run test', startedAt: 1 }
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

// `locked`: true held for good, false free, a number: held for that many probes, then free
const world = (on: On, locked: boolean | number, locker: string | null = '/usr/local/bin/flock', held: object = HOLDER) => {
  const ran: string[] = []
  const probes: string[][] = []
  const written: Record<string, string> = {}
  const isHeldNow = () => (typeof locked === 'number' ? probes.length <= locked : locked)

  mock.env(on, { HOME: '/Users/me' })
  mock.clock(on)
  on('session.root', () => ({ value: '/Users/me/pluto/stack' }))
  on('session.id', () => ({ value: 'abcd1234-5678' }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  on('process.run', ($, e) => {
    if (e.argv[0] === '/bin/sh') return run(locker === null ? 1 : 0, locker === null ? '' : `${locker}\n`)
    probes.push([...e.argv])
    return run(isHeldNow() ? 1 : 0)
  })
  on('fs.read', () => ({ value: JSON.stringify(held) }))
  on('fs.write', ($, e) => {
    written[e.path] = e.text
    return { value: undefined }
  })
  on('tool.call', { tool: 'Bash' }, ($, e) => {
    ran.push(e.command)
    return { result: { stdout: 'ok', stderr: '', interrupted: false } }
  })

  return { ran, probes, written }
}

test('test command runs under the lock when no other session holds it', async ($, on) => {
  const { ran, written } = world(on, false)

  await $.tool.call({ tool: 'Bash', command: 'cd js && bun run test --silent' })

  expect(ran).toHaveLength(1)
  expect(ran[0]).toContain('/usr/local/bin/flock -w 10 9')
  expect(ran[0]).toContain(`'${LOCK}'`)
  expect(ran[0]).toContain('cd js && bun run test --silent')
  expect(JSON.parse(written[`${LOCK}.json`] ?? '{}')).toMatchObject({ kind: 'tests', command: 'cd js && bun run test --silent' })
})

test('test command falls back to lockf when flock is missing', async ($, on) => {
  const { ran } = world(on, false, '/usr/bin/lockf')

  await $.tool.call({ tool: 'Bash', command: 'bun run test' })

  expect(ran[0]).toContain('/usr/bin/lockf -s -t 10 9')
})

test('test command runs unwrapped when neither flock nor lockf exists', async ($, on) => {
  const { ran } = world(on, true, null)

  await $.tool.call({ tool: 'Bash', command: 'bun run test' })

  expect(ran).toEqual(['bun run test'])
})

test('test command is denied, naming the holder, when the lock stays held past the wait', async ($, on) => {
  const { ran } = world(on, true)

  const called = await $.tool.call({ tool: 'Bash', command: 'dotnet test' })

  expect(ran).toHaveLength(0)
  expect(called.deny ?? called.text).toContain('tests running in stack (abcd1234)')
})

test('build is denied when the lock stays held past the wait', async ($, on) => {
  const { ran } = world(on, true)

  await $.tool.call({ tool: 'Bash', command: 'bunx tsc --noEmit' })

  expect(ran).toHaveLength(0)
})

test('build runs under the lock when the lock is free', async ($, on) => {
  const { ran, written } = world(on, false)

  await $.tool.call({ tool: 'Bash', command: 'bunx tsc --noEmit' })

  expect(ran).toHaveLength(1)
  expect(ran[0]).toContain('/usr/local/bin/flock -w 10 9')
  expect(ran[0]).toContain('bunx tsc --noEmit')
  expect(JSON.parse(written[`${LOCK}.json`] ?? '{}')).toMatchObject({ kind: 'build', command: 'bunx tsc --noEmit' })
})

test('test command is denied, naming the build, when a build holds the lock past the wait', async ($, on) => {
  const { ran } = world(on, true, '/usr/local/bin/flock', { ...HOLDER, kind: 'build', command: 'bun run build' })

  const called = await $.tool.call({ tool: 'Bash', command: 'bun run test' })

  expect(ran).toHaveLength(0)
  expect(called.deny ?? called.text).toContain('build running in stack (abcd1234)')
})

test('unrelated command runs unchanged while the lock is held', async ($, on) => {
  const { ran } = world(on, true)

  await $.tool.call({ tool: 'Bash', command: 'git status' })

  expect(ran).toEqual(['git status'])
})

test('test command waits for the lock to free, then runs under it', async ($, on) => {
  const { ran, probes } = world(on, 3)

  const called = await $.tool.call({ tool: 'Bash', command: 'bun run test' })

  expect(ran).toHaveLength(1)
  expect(ran[0]).toContain('/usr/local/bin/flock -w 10 9')
  expect(probes.filter(argv => argv.includes('-w'))).toHaveLength(3)
  expect(probes).toContainEqual(['/usr/local/bin/flock', '-w', '5', LOCK, 'true'])
  expect(called.context?.join('\n')).toContain('TEST_LOCK_NOWAIT=1')
})

test('lockf waits with its own timeout flag', async ($, on) => {
  const { probes } = world(on, 1, '/usr/bin/lockf')

  await $.tool.call({ tool: 'Bash', command: 'bun run test' })

  expect(probes).toContainEqual(['/usr/bin/lockf', '-k', '-s', '-t', '5', LOCK, 'true'])
})

test('no wait, no note, when the lock is free', async ($, on) => {
  const { probes } = world(on, false)

  const called = await $.tool.call({ tool: 'Bash', command: 'bun run test' })

  expect(probes.filter(argv => argv.includes('-w'))).toHaveLength(0)
  expect(called.context).toBe(undefined)
})

test('TEST_LOCK_NOWAIT=1 is denied at once while the lock is held', async ($, on) => {
  const { ran, probes } = world(on, true)

  const called = await $.tool.call({ tool: 'Bash', command: 'TEST_LOCK_NOWAIT=1 bun run test' })

  expect(ran).toHaveLength(0)
  expect(probes.filter(argv => argv.includes('-w'))).toHaveLength(0)
  expect(called.deny ?? called.text).toContain('tests running in stack (abcd1234)')
})

for (const command of [
  'cd backend && make clean && SQL_TESTS="sql/performance/benchmark_refresh_materialized_table.sql" make db_test',
  'bun run bench',
  'bunx vitest bench',
  'cargo bench --bench parse',
  'go test ./... -bench=. -run=^$',
  'hyperfine "bun run build"',
  'make bench-sql',
]) {
  test(`benchmark runs under the lock: ${command}`, async ($, on) => {
    const { ran, written } = world(on, false)

    await $.tool.call({ tool: 'Bash', command })

    expect(ran[0]).toContain('/usr/local/bin/flock -w 10 9')
    expect(JSON.parse(written[`${LOCK}.json`] ?? '{}')).toMatchObject({ kind: 'benchmark', command })
  })
}

test('test command is denied, naming the benchmark, when a benchmark holds the lock past the wait', async ($, on) => {
  const { ran } = world(on, true, '/usr/local/bin/flock', { ...HOLDER, kind: 'benchmark', command: 'cargo bench' })

  const called = await $.tool.call({ tool: 'Bash', command: 'bun run test' })

  expect(ran).toHaveLength(0)
  expect(called.deny ?? called.text).toContain('benchmark running in stack (abcd1234)')
})

test('a test command that takes the lock itself is denied, so it cannot deadlock under the wrap', async ($, on) => {
  const { ran } = world(on, false)

  const called = await $.tool.call({
    tool: 'Bash',
    command: '/opt/local/bin/flock ~/.cache/pluto-test.lock true; bun run test --silent src/map',
  })

  expect(ran).toHaveLength(0)
  expect(called.deny ?? called.text).toContain('test-lock already waits for the lock')
})

test('reading the lock file in an unrelated command runs unchanged', async ($, on) => {
  const { ran } = world(on, true)

  await $.tool.call({ tool: 'Bash', command: 'lsof ~/.cache/pluto-test.lock' })

  expect(ran).toEqual(['lsof ~/.cache/pluto-test.lock'])
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
