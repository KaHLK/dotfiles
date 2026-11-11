import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const LOCK = '/Users/me/.cache/pluto-test.lock'
const HOLDER = { kind: 'tests', label: 'stack (abcd1234)', command: 'bun run test', startedAt: 1 }
// How the wrap takes the lock: bin/test-lock waiting out the probe-to-take gap, running the command in bash
const TAKE = "--wait 10 -- bash -c '"
const HANDS_OFF = "Don't take the test lock by hand"
// How the mod tells the model to call test-lock itself
const DIRECT = (kind: string) => `test-lock --kind ${kind} --label 'stack (abcd1234)' -- <command>`
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
// `refusals`: how many calls are refused after the mod's rewrite, as auto mode's classifier does
const world = (on: On, locked: boolean | number, held: object = HOLDER, lock: string | null = LOCK, refusals = 0) => {
  const ran: string[] = []
  const sent: string[] = []
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
    sent.push(e.command)
    if (refusals-- > 0) return { deny: 'refused' }
    ran.push(e.command)
    return { result: { stdout: 'ok', stderr: '', interrupted: false } }
  })

  const setLocked = (next: boolean | number) => {
    locked = next
  }

  return { ran, sent, probes, setLocked }
}

test('test command runs under the lock when no other session holds it', async ($, on) => {
  const { ran } = world(on, false)

  await $.tool.call({ tool: 'Bash', command: 'cd js && bun run test --silent' })

  expect(ran).toHaveLength(1)
  expect(ran[0]).toMatch(/^'[^']*\/test-lock\/bin\/test-lock' --kind tests /)
  expect(ran[0]).toContain(
    "--kind tests --label 'stack (abcd1234)' --command 'cd js && bun run test --silent' --wait 10 -- bash -c 'cd js && bun run test --silent'",
  )
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

test('no wait, no wait note, when the lock is free', async ($, on) => {
  const { probes } = world(on, false)

  const called = await $.tool.call({ tool: 'Bash', command: 'bun run test' })

  expect(probes.filter(argv => argv.includes('--wait'))).toHaveLength(0)
  expect(called.context?.join('\n')).not.toContain('TEST_LOCK_NOWAIT=1')
})

for (const [command, kind] of [
  ['bun run test', 'tests'],
  ['bunx tsc --noEmit', 'build'],
  ['cargo bench', 'benchmark'],
] as const) {
  test(`a rewritten ${kind} run tells the model to call test-lock itself`, async ($, on) => {
    world(on, false)

    const called = await $.tool.call({ tool: 'Bash', command })

    expect(called.context?.join('\n')).toContain(DIRECT(kind))
  })
}

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

for (const command of [
  '/opt/local/bin/flock ~/.cache/pluto-test.lock true; bun run test --silent src/map',
  'flock ~/.cache/pluto-test.lock bun run test',
  'flock -n ~/.cache/pluto-test.lock true',
  'lockf -s -t 0 ~/.cache/pluto-test.lock true',
  'if flock -n "$HOME/.cache/pluto-test.lock" true; then echo free; fi',
  'exec 9>>~/.cache/pluto-test.lock && flock 9; git status',
  '"/opt/local/bin/flock" ~/.cache/pluto-test.lock true',
  'flock "$TEST_LOCK_FILE" true',
  'bash -c "flock ~/.cache/pluto-test.lock true"',
  'test-lock --probe',
  'test-lock --kind tests --probe',
  'test-lock --fd 9 --wait 10',
  'test-lock --file /tmp/x.lock -- bun run test',
  'cd crates/core && TEST_LOCK_FILE=/tmp/x.lock test-lock --kind build -- cargo build',
  'rm -f ~/.cache/pluto-test.lock',
  'rip ~/.cache/pluto-test.lock',
  '/bin/rm "$HOME/.cache/pluto-test.lock"',
  'rm "$TEST_LOCK_FILE"',
  'cd /tmp && rm -f ~/.cache/pluto-test.lock && bun run test',
]) {
  test(`command touching the lock itself is denied: ${command}`, async ($, on) => {
    const { ran } = world(on, false)

    const called = await $.tool.call({ tool: 'Bash', command })

    expect(ran).toHaveLength(0)
    expect(called.deny ?? called.text).toContain(HANDS_OFF)
  })
}

test('denying a hand-taken lock shows the test-lock command for this session', async ($, on) => {
  world(on, false)

  const called = await $.tool.call({ tool: 'Bash', command: 'flock ~/.cache/pluto-test.lock bun run test' })

  expect(called.deny ?? called.text).toContain(DIRECT('tests|build|benchmark'))
})

// test-lock takes the lock itself: a rewrite would only cost an auto mode refusal
for (const command of [
  'test-lock cargo test',
  'test-lock -- bun run test',
  'cd js && test-lock --kind tests --label "stack (abcd1234)" -- bun run test --silent 2>&1 | tail -n 20',
  'test-lock --kind build --wait 600 -- cargo build',
  'test-lock -- bash -c "cd js && bun run test"',
  '~/.claude/mods/test-lock/bin/test-lock bun run test',
  '"$HOME/.claude/mods/test-lock/bin/test-lock" bun run test',
]) {
  test(`command run through test-lock runs unchanged: ${command}`, async ($, on) => {
    const { ran } = world(on, false)

    await $.tool.call({ tool: 'Bash', command })

    expect(ran).toEqual([command])
  })
}

test('command run through test-lock waits for the lock to free, then runs unchanged', async ($, on) => {
  const { ran, probes } = world(on, 3)

  const called = await $.tool.call({ tool: 'Bash', command: 'test-lock -- bun run test' })

  expect(ran).toEqual(['test-lock -- bun run test'])
  expect(probes.filter(argv => argv.includes('--wait'))).toHaveLength(3)
  expect(called.context?.join('\n')).toContain('TEST_LOCK_NOWAIT=1')
})

test('command run through test-lock is denied, naming the holder, when the lock stays held past the wait', async ($, on) => {
  const { ran } = world(on, true)

  const called = await $.tool.call({ tool: 'Bash', command: 'test-lock --kind build -- cargo build' })

  expect(ran).toHaveLength(0)
  expect(called.deny ?? called.text).toContain('tests running in stack (abcd1234)')
})

test('cargo run works after a cargo build run through test-lock', async ($, on) => {
  const { ran } = world(on, false)

  await $.tool.call({ tool: 'Bash', command: 'test-lock --kind build -- cargo build --bin cli' })
  await $.tool.call({ tool: 'Bash', command: 'cargo run --bin cli' })

  expect(ran).toEqual(['test-lock --kind build -- cargo build --bin cli', 'cargo run --bin cli'])
})

test('the guard follows the lock file test-lock --path prints', async ($, on) => {
  const { ran } = world(on, false, HOLDER, '/tmp/other.lock')

  const called = await $.tool.call({ tool: 'Bash', command: 'flock /tmp/other.lock true; bun run test' })

  expect(ran).toHaveLength(0)
  expect(called.deny ?? called.text).toContain(HANDS_OFF)
})

for (const command of [
  'flock /tmp/unrelated.lock git status',
  'rm -f /tmp/unrelated.lock',
  'rip dist',
  'test-lock --path',
  'test-lock  --path',
  'test-lock --help',
  'git commit -m "flock ~/.cache/pluto-test.lock; rm ~/.cache/pluto-test.lock; test-lock cargo test"',
  'git rm tests/pluto-test.lock.snap',
  'bat bin/test-lock | head',
  'rg -n flock bin/test-lock',
  'cat ~/.cache/pluto-test.lock.json',
]) {
  test(`command that does not touch the lock runs unchanged while it is held: ${command}`, async ($, on) => {
    const { ran } = world(on, true)

    await $.tool.call({ tool: 'Bash', command })

    expect(ran).toEqual([command])
  })
}

test('rm of something else in a test command still runs under the lock', async ($, on) => {
  const { ran } = world(on, false)

  await $.tool.call({ tool: 'Bash', command: 'rm -rf dist && bun run test' })

  expect(ran[0]).toContain(TAKE)
})

test('a test command setting TEST_LOCK_FILE still runs under the lock', async ($, on) => {
  const { ran } = world(on, false)

  await $.tool.call({ tool: 'Bash', command: 'TEST_LOCK_FILE=/tmp/x.lock bun run test' })

  expect(ran[0]).toContain(TAKE)
})

test('the wrap this mod issued, re-sent as is, runs unchanged', async ($, on) => {
  const { ran } = world(on, false)

  await $.tool.call({ tool: 'Bash', command: 'bun run test' })
  await $.tool.call({ tool: 'Bash', command: ran[0] as string })

  expect(ran).toHaveLength(2)
  expect(ran[1]).toBe(ran[0])
})

test('a re-sent wrap waits when another session took the lock after the refusal', async ($, on) => {
  const { ran, sent, probes, setLocked } = world(on, false, HOLDER, LOCK, 1)

  await $.tool.call({ tool: 'Bash', command: 'bun run test' })
  setLocked(probes.length + 2)
  const called = await $.tool.call({ tool: 'Bash', command: sent[0] as string })

  expect(ran).toEqual([sent[0] as string])
  expect(probes.filter(argv => argv.includes('--wait')).length > 0).toBe(true)
  expect(called.context?.join('\n')).toContain('TEST_LOCK_NOWAIT=1')
})

test('a re-sent wrap is denied, naming the holder, when the lock stays held past the wait', async ($, on) => {
  const { ran, sent, setLocked } = world(on, false, HOLDER, LOCK, 1)

  await $.tool.call({ tool: 'Bash', command: 'bun run test' })
  setLocked(true)
  const called = await $.tool.call({ tool: 'Bash', command: sent[0] as string })

  expect(ran).toHaveLength(0)
  expect(called.deny ?? called.text).toContain('tests running in stack (abcd1234)')
})

test('a re-sent TEST_LOCK_NOWAIT=1 wrap is denied at once while the lock is held', async ($, on) => {
  const { ran, sent, probes, setLocked } = world(on, false, HOLDER, LOCK, 1)

  await $.tool.call({ tool: 'Bash', command: 'TEST_LOCK_NOWAIT=1 bun run test' })
  setLocked(true)
  await $.tool.call({ tool: 'Bash', command: sent[0] as string })

  expect(ran).toHaveLength(0)
  expect(probes.filter(argv => argv.includes('--wait'))).toHaveLength(0)
})

test('cargo run works after a cargo build that ran on the re-send', async ($, on) => {
  const { ran, sent } = world(on, false, HOLDER, LOCK, 1)

  await $.tool.call({ tool: 'Bash', command: 'cargo build --bin cli' })
  await $.tool.call({ tool: 'Bash', command: sent[0] as string })
  await $.tool.call({ tool: 'Bash', command: 'cargo run --bin cli' })

  expect(ran).toEqual([sent[0] as string, 'cargo run --bin cli'])
})

test('cargo run stays denied after a refused cargo build', async ($, on) => {
  const { ran } = world(on, false, HOLDER, LOCK, 1)

  await $.tool.call({ tool: 'Bash', command: 'cargo build --bin cli' })
  const called = await $.tool.call({ tool: 'Bash', command: 'cargo run --bin cli' })

  expect(ran).toHaveLength(0)
  expect(called.deny ?? called.text).toContain('cargo build')
})

// The model learns the wrap from an earlier run and writes the next one itself
test('a wrap identical to the one the mod would issue, sent before it was issued, runs unchanged', async ($, on) => {
  const { ran } = world(on, false)

  await $.tool.call({ tool: 'Bash', command: 'bun run test a' })
  const wrap = (ran[0] as string).replaceAll('bun run test a', 'bun run test b')
  await $.tool.call({ tool: 'Bash', command: wrap })

  expect(ran).toHaveLength(2)
  expect(ran[1]).toBe(wrap)
})

for (const command of [
  `exec 9>>'${LOCK}' && test-lock --fd 9 --wait 10; bun run test`,
  `exec 9>>'${LOCK}' && '/elsewhere/bin/test-lock' --fd 9 --wait 10; git status`,
]) {
  test(`hand-written wrap is denied: ${command}`, async ($, on) => {
    const { ran } = world(on, false)

    const called = await $.tool.call({ tool: 'Bash', command })

    expect(ran).toHaveLength(0)
    expect(called.deny ?? called.text).toContain(HANDS_OFF)
  })
}

test('opening fd 9 does not skip the wrap', async ($, on) => {
  const { ran } = world(on, false)

  await $.tool.call({ tool: 'Bash', command: 'exec 9>>/tmp/other; bun run test' })

  expect(ran[0]).toContain(TAKE)
})

for (const command of [
  'claude plugin test .',
  'cd mods/x && claude plugin test .',
  'npm test',
  'npm t',
  'npm run test:unit',
  'npm --prefix js test',
  'pnpm test',
  'pnpm -r test',
  'pnpm --filter web run test',
  'pnpm exec vitest run',
  'yarn test',
  'yarn workspace web test',
  'vp test',
  'npx mocha',
  'npx cypress run',
  './node_modules/.bin/vitest run',
  'turbo run test',
  'nx test web',
  'nx run web:test',
  'pytest -q',
  'py.test',
  '.venv/bin/pytest',
  'python -m pytest',
  'python3 -m unittest discover',
  'uv run pytest',
  'poetry run pytest',
  'tox',
  'nox',
  'go test ./...',
  'gotestsum',
  'deno test',
  'mix test',
  'rspec',
  'bundle exec rspec',
  'rake test',
  'rails test',
  'phpunit',
  'ctest',
  'mvn test',
  './mvnw -q verify',
  'gradle test',
  'swift test',
  'xcodebuild -scheme App test',
  'flutter test',
  'dart test',
  'zig build test',
  'sbt test',
  'just test',
  'make check',
  'make -C backend test',
  'make db_test',
  'if pytest; then echo ok; fi',
]) {
  test(`test invocation runs under the lock as tests: ${command}`, async ($, on) => {
    const { ran } = world(on, false)

    await $.tool.call({ tool: 'Bash', command })

    expect(ran[0]).toContain(TAKE)
    expect(ran[0]).toContain('--kind tests ')
  })
}

for (const command of [
  'claude plugin validate .',
  'npm install',
  'npm run lint',
  'pnpm add -D vitest',
  'yarn add test-utils',
  'go vet ./...',
  'go build ./...',
  'make build',
  'which pytest',
  'cat pytest.ini',
  'vim tox.ini',
  'test -f package.json',
  'python -m pip list',
  'just lint',
]) {
  test(`not a test run, runs unchanged while the lock is held: ${command}`, async ($, on) => {
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
