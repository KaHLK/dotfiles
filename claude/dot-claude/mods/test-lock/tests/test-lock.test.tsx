import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const LOCK = '/Users/me/.cache/pluto-test.lock'
const HOLDER = { kind: 'tests', label: 'stack (abcd1234)', command: 'bun run test', startedAt: 1 }
// How the wrap takes the lock: bin/test-lock on fd 9, waiting out the probe-to-take gap
const TAKE = "/bin/test-lock' --fd 9 --wait 10"
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

const quoted = (text: string) => `'${text.replaceAll("'", `'\\''`)}'`

// `locked`: true held for good, false free, a number: held for that many probes, then free
// `lock`: what `test-lock --path` prints; null when it finds neither flock nor lockf
const world = (on: On, locked: boolean | number, held: object = HOLDER, lock: string | null = LOCK) => {
  const ran: string[] = []
  const probes: string[][] = []
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
    if (e.argv.includes('--path')) return run(lock === null ? 69 : 0, lock === null ? '' : `${lock}\n`)
    probes.push([...e.argv])
    return run(isHeldNow() ? 1 : 0)
  })
  on('fs.read', () => ({ value: JSON.stringify(held) }))
  on('tool.call', { tool: 'Bash' }, ($, e) => {
    ran.push(e.command)
    return { result: { stdout: 'ok', stderr: '', interrupted: false } }
  })

  return { ran, probes }
}

test('test command runs under the lock when no other session holds it', async ($, on) => {
  const { ran } = world(on, false)

  await $.tool.call({ tool: 'Bash', command: 'cd js && bun run test --silent' })

  expect(ran).toHaveLength(1)
  expect(ran[0]).toContain(TAKE)
  expect(ran[0]).toContain(`exec 9>>'${LOCK}'`)
  expect(ran[0]).toContain(`--file '${LOCK}' --kind tests`)
  expect(ran[0]).toContain("--kind tests --label 'stack (abcd1234)' --command 'cd js && bun run test --silent'")
  expect(ran[0]).toContain('{ cd js && bun run test --silent\n} 9>&-')
})

test('lock file comes from test-lock --path', async ($, on) => {
  const { ran } = world(on, false, HOLDER, '/tmp/other.lock')

  await $.tool.call({ tool: 'Bash', command: 'bun run test' })

  expect(ran[0]).toContain("exec 9>>'/tmp/other.lock'")
})

test('probes run the bin/test-lock the mod ships', async ($, on) => {
  const { probes } = world(on, false)

  await $.tool.call({ tool: 'Bash', command: 'bun run test' })

  expect(probes[0]?.[0]).toMatch(/\/test-lock\/bin\/test-lock$/)
  expect(probes[0]?.slice(1)).toEqual(['--probe'])
})

test('test command runs unwrapped when test-lock finds neither flock nor lockf', async ($, on) => {
  const { ran } = world(on, true, HOLDER, null)

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
  const { ran } = world(on, false)

  await $.tool.call({ tool: 'Bash', command: 'bunx tsc --noEmit' })

  expect(ran).toHaveLength(1)
  expect(ran[0]).toContain(TAKE)
  expect(ran[0]).toContain("--kind build --label 'stack (abcd1234)' --command 'bunx tsc --noEmit'")
})

for (const [command, kind] of [
  ['rustc -O src/main.rs', 'build'],
  ['cargo build --release', 'build'],
  ['cargo +nightly build', 'build'],
  ['cargo b', 'build'],
  ['cd crates/core && cargo check --all-targets', 'build'],
  ['cargo clippy -- -D warnings', 'build'],
  ['cargo test -p core', 'tests'],
  ['cargo t', 'tests'],
  ['cargo nextest run', 'tests'],
] as const) {
  test(`rust command runs under the lock as ${kind}: ${command}`, async ($, on) => {
    const { ran } = world(on, false)

    await $.tool.call({ tool: 'Bash', command })

    expect(ran[0]).toContain(TAKE)
    expect(ran[0]).toContain(`--kind ${kind} `)
    expect(ran[0]).toContain(`--command ${quoted(command)}`)
  })
}

for (const command of ['cargo run --bin cli', 'cargo r']) {
  test(`${command} before any cargo build in the session is denied, asking for a build first`, async ($, on) => {
    const { ran } = world(on, false)

    const called = await $.tool.call({ tool: 'Bash', command })

    expect(ran).toHaveLength(0)
    expect(called.deny ?? called.text).toContain('cargo build')
  })
}

test('cargo run after a cargo build runs unchanged, outside the lock', async ($, on) => {
  const { ran } = world(on, false)

  await $.tool.call({ tool: 'Bash', command: 'cargo build --bin cli' })
  await $.tool.call({ tool: 'Bash', command: 'cargo run --bin cli' })

  expect(ran).toHaveLength(2)
  expect(ran[1]).toBe('cargo run --bin cli')
})

test('test command is denied, naming the build, when a build holds the lock past the wait', async ($, on) => {
  const { ran } = world(on, true, { ...HOLDER, kind: 'build', command: 'bun run build' })

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
  expect(ran[0]).toContain(TAKE)
  expect(probes.filter(argv => argv.includes('--wait'))).toHaveLength(3)
  expect(probes.map(argv => argv.slice(1))).toContainEqual(['--probe', '--wait', '5'])
  expect(called.context?.join('\n')).toContain('TEST_LOCK_NOWAIT=1')
})

test('no wait, no note, when the lock is free', async ($, on) => {
  const { probes } = world(on, false)

  const called = await $.tool.call({ tool: 'Bash', command: 'bun run test' })

  expect(probes.filter(argv => argv.includes('--wait'))).toHaveLength(0)
  expect(called.context).toBe(undefined)
})

test('TEST_LOCK_NOWAIT=1 is denied at once while the lock is held', async ($, on) => {
  const { ran, probes } = world(on, true)

  const called = await $.tool.call({ tool: 'Bash', command: 'TEST_LOCK_NOWAIT=1 bun run test' })

  expect(ran).toHaveLength(0)
  expect(probes.filter(argv => argv.includes('--wait'))).toHaveLength(0)
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
    const { ran } = world(on, false)

    await $.tool.call({ tool: 'Bash', command })

    expect(ran[0]).toContain(TAKE)
    expect(ran[0]).toContain(`--kind benchmark --label 'stack (abcd1234)' --command ${quoted(command)}`)
  })
}

test('test command is denied, naming the benchmark, when a benchmark holds the lock past the wait', async ($, on) => {
  const { ran } = world(on, true, { ...HOLDER, kind: 'benchmark', command: 'cargo bench' })

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

test('the deadlock guard follows the lock file test-lock --path prints', async ($, on) => {
  const { ran } = world(on, false, HOLDER, '/tmp/other.lock')

  const called = await $.tool.call({ tool: 'Bash', command: 'flock /tmp/other.lock true; bun run test' })

  expect(ran).toHaveLength(0)
  expect(called.deny ?? called.text).toContain('other.lock')
})

for (const command of [
  'test-lock cargo test',
  'cd crates/core && TEST_LOCK_FILE=/tmp/x.lock test-lock --kind build -- cargo build',
  '~/.claude/mods/test-lock/bin/test-lock bun run test',
]) {
  test(`command that runs under test-lock itself runs unchanged while the lock is held: ${command}`, async ($, on) => {
    const { ran } = world(on, true)

    await $.tool.call({ tool: 'Bash', command })

    expect(ran).toEqual([command])
  })
}

for (const command of [
  "git commit -q -F - <<'EOF'\nlock rust builds\n\ncargo run stays unlocked; cargo build first\nEOF\ngit log --oneline -1",
  'git commit -m "run cargo test; then bun run test"',
  'command -v rustc',
  "rg -n 'cargo build' README.md",
  'rustc --version',
]) {
  test(`command that only mentions a locked command runs unchanged while the lock is held: ${command}`, async ($, on) => {
    const { ran } = world(on, true)

    await $.tool.call({ tool: 'Bash', command })

    expect(ran).toEqual([command])
  })
}

for (const command of [
  'bash -lc "cargo test"',
  'RUST_LOG=debug cargo test',
  'time cargo build --release',
  'for p in a b; do cargo test -p $p; done',
  'cat <<EOF > notes.txt\nhi\nEOF\ncargo build',
]) {
  test(`command in shell syntax still runs under the lock: ${command}`, async ($, on) => {
    const { ran } = world(on, false)

    await $.tool.call({ tool: 'Bash', command })

    expect(ran[0]).toContain(TAKE)
  })
}

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
