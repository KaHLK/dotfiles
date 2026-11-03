import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Holder, Kind } from '../types'

const LOCK_FD = 9
const EX_TEMPFAIL = 75
const POLL_MS = 5000
// Waits run as blocking lock probes: a $ call's time is outside the hook's 10 s budget
const WAIT_S = 5
const MAX_WAITS = (20 * 60) / WAIT_S
// Covers the gap between a probe seeing the lock free and the command taking it
const TAKE_WAIT_S = 10
const NO_WAIT = 'TEST_LOCK_NOWAIT=1'

// Command position: after a separator, then env assignments and wrappers like `time`
const START = String.raw`(^|[\n;&|({]|\$\()\s*(\w+=\S*\s+|(time|env|nohup|nice|timeout\s+\S+|do|then|else|if|elif|while|until|!)\s+)*`
const CARGO = String.raw`cargo\s+(\+\S+\s+)?`
// What may precede a test tool: `uv run pytest`, `.venv/bin/pytest`
const RUNNER = String.raw`((bunx?|npx|pnpx|vpx|bundle\s+exec|(uv|poetry|pipenv|hatch)\s+run|(pnpm|yarn)(\s+(exec|dlx))?)\s+)?(\S*/)?`
const TEST = new RegExp(
  START +
    RUNNER +
    '(' +
    [
      String.raw`(bun|npm|pnpm|yarn|vp)\s+(-\S+\s+(\S+\s+)?)*(workspace\s+\S+\s+)?(run\s+)?(test|t)`,
      String.raw`claude\s+plugin\s+test`,
      String.raw`jest|vitest|mocha|playwright\s+test|cypress\s+run`,
      String.raw`pytest|py\.test|tox|nox|python[\d.]*\s+-m\s+(pytest|unittest)`,
      String.raw`(go|deno|mix|swift|dotnet|flutter|dart|sbt|rails|zig)\s+test|zig\s+build\s+test|gotestsum`,
      String.raw`rspec|rake\s+(test|spec)|phpunit|ctest|pg_prove`,
      String.raw`turbo\s+(run\s+)?test|nx\s+(run\s+\S*:)?test`,
      String.raw`make\b[^;&|\n]*\s[\w-]*(test|e2e|check)[\w-]*|just\s+[\w-]*test[\w-]*`,
      String.raw`(gradlew|gradle|mvnw|mvn)\b[^;&|\n]*\b(test\w*|verify|connected\w*Test)`,
      String.raw`xcodebuild\b[^;&|\n]*\stest`,
      String.raw`${CARGO}(test|t|nextest\s+run)`,
    ].join('|') +
    String.raw`)\b`,
)
// `sql/performance/` is how stack's /perf names its pgtap benchmarks
const BENCHMARK = new RegExp(
  START +
    String.raw`(bunx?\s+(run\s+)?bench\w*|(bunx?\s+|npx\s+)?vitest\s+bench|cargo\s+bench|go\s+test\b[^;&|]*\s-bench\b|hyperfine|make\s+[\w-]*bench[\w-]*)\b`,
)
// Usually passed in a quoted env var, so matched on the raw command
const PGTAP_BENCHMARK = /sql\/performance\//
const BUILD = new RegExp(
  START +
    String.raw`(bunx?\s+tsc|npx\s+tsc|tsc|bun\s+run\s+(build|typecheck|tsc)|vite\s+build|dotnet\s+build|\./gradlew\b[^;&|]*\bassemble\w*|rustc(?!\s+(-V|-vV|--version|--print)\b)|${CARGO}(build|b|check|c|clippy))\b`,
)
// A server started by `cargo run` would hold the lock as long as it lives: compile under the lock, run outside it
const CARGO_BUILD = new RegExp(START + CARGO + String.raw`(build|b)\b`)
const CARGO_RUN = new RegExp(START + CARGO + String.raw`(run|r)\b`)
// --path and --help leave the lock alone
const TEST_LOCK_RUN = new RegExp(START + String.raw`(\S*/)?test-lock\s(?!\s*(--path|--help|-h)\b)`)
// Touch the lock only when the command also names it
const LOCK_TOOL = new RegExp(START + String.raw`(\S*/)?(flock|lockf|rm|rip)\s`)
const LOCK_ENV = 'TEST_LOCK_FILE'
const HANDS_OFF =
  'Never touch the test lock yourself, EVER: no flock, lockf, rm, rip or test-lock on it. The test-lock mod handles it, or the user does. Run the command bare.'

// Heredoc bodies and quoted args (commit messages, search patterns) are text, not commands; `sh -c` bodies are commands
const HEREDOC = /<<-?\s*(["']?)(\w+)\1([^\n]*)\n[\s\S]*?\n[ \t]*\2[ \t]*(?=\n|$)/g
const SHELL_C = /\b(ba|z|fi|da)?sh\s+(-\w+\s+)*-\w*c\s+(["'])([\s\S]*?)\3/g
const QUOTED = /"(?:\\.|[^"\\])*"|'[^']*'/g
// A quoted path to one of these still runs it
const QUOTED_LOCK_TOOL = /\/(test-lock|flock|lockf|rm|rip)["']$/

const commandWords = (command: string) =>
  command
    .replace(HEREDOC, '<<$2$3')
    .replace(SHELL_C, '; $4 ;')
    .replace(QUOTED, text => (QUOTED_LOCK_TOOL.test(text) ? text.slice(1, -1) : '""'))

// bin/test-lock owns the lock file and how it is taken; the mod only asks it
type Lock = { bin: string; path: string }

const holder = atom({ plugin: 'test-lock', key: 'holder' } as const, null)
const cargoBuilt = atom({ plugin: 'test-lock', key: 'cargoBuilt' } as const, false)

// Most specific first: `vitest bench` is a benchmark, `hyperfine "bun run build"` too
export const kindOf = (command: string): Kind | null => {
  const words = commandWords(command)

  return BENCHMARK.test(words) || PGTAP_BENCHMARK.test(command)
    ? 'benchmark'
    : TEST.test(words)
      ? 'tests'
      : BUILD.test(words)
        ? 'build'
        : null
}

const RUNNING: Record<Kind, string> = { tests: 'tests', build: 'a build or typecheck', benchmark: 'a benchmark' }

const quote = (text: string) => `'${text.replaceAll("'", `'\\''`)}'`

// --file pins the lock --path printed: the Bash tool's shell may set another TEST_LOCK_FILE
export const wrapCommand = (command: string, lock: Lock, kind: Kind, label: string) =>
  `exec ${LOCK_FD}>>${quote(lock.path)} && ${quote(lock.bin)} --fd ${LOCK_FD} --wait ${TAKE_WAIT_S} --file ${quote(lock.path)} --kind ${kind} --label ${quote(label)} --command ${quote(command)} || exit ${EX_TEMPFAIL}; { ${command}\n} ${LOCK_FD}>&-`

// Wrap to the command it wraps. Auto mode can have the model re-send a rewritten command verbatim: only an exact copy is the mod's own
const issued = new Map<string, string>()

let found: Promise<Lock | null> | undefined

// Exits 69 when it finds neither flock nor lockf
const findLock = ($: EngineInterface) => {
  const bin = `${$.plugin.root}/bin/test-lock`

  return (found ??= $.process.run([bin, '--path']).then(({ exitCode, stdout }) => {
    const path = stdout.trim()
    return exitCode === 0 && path !== '' ? { bin, path } : null
  }))
}

const isHeld = async ($: EngineInterface, lock: Lock, seconds = 0) =>
  (
    await $.process.run(seconds === 0 ? [lock.bin, '--probe'] : [lock.bin, '--probe', '--wait', String(seconds)], {
      timeoutMs: (seconds + 5) * 1000,
    })
  ).exitCode !== 0

// Resolves how many probes it waited, or null when the lock stayed held or the call was interrupted
const waitForLock = async ($: EngineInterface, lock: Lock, current: Holder, signal: AbortSignal) => {
  $.ui.status(`test-lock: waiting for ${describe(current)}`)
  try {
    for (let waits = 1; waits <= MAX_WAITS; waits++) {
      if (signal.aborted) return null
      if (!(await isHeld($, lock, WAIT_S))) return waits
    }
    return null
  } finally {
    $.ui.status(undefined)
  }
}

const readHolder = async ($: EngineInterface, lock: Lock): Promise<Holder> => {
  const sidecar = await $.fs.read(`${lock.path}.json`).catch(() => undefined)
  try {
    // Sidecars written before builds took the lock carry no kind
    return { kind: 'tests', ...(JSON.parse(String(sidecar)) as Omit<Holder, 'kind'>) }
  } catch {
    return { kind: 'tests', label: 'unknown session', command: 'unknown command', startedAt: 0 }
  }
}

const refresh = async ($: EngineInterface, lock: Lock) => {
  const current = (await isHeld($, lock)) ? await readHolder($, lock) : null
  await update($, holder, () => current)
  return current
}

const describe = (current: Holder) => `${current.kind} running in ${current.label}: ${current.command.slice(0, 60)}`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    const lock = await findLock($)

    if (lock === null) {
      $.ui.toast('test-lock: neither flock nor lockf found; test runs are not serialized')
      return started
    }

    await refresh($, lock)
    $.clock.every(POLL_MS, () => void refresh($, lock))

    return started
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    // A re-sent wrap goes the way its command did: the lock may have been taken since
    const command = issued.get(e.command) ?? e.command
    const kind = kindOf(command)
    const words = commandWords(command)

    if (TEST_LOCK_RUN.test(words)) {
      return { deny: HANDS_OFF }
    }

    const isLockTool = LOCK_TOOL.test(words)
    const isLocked = kind !== null || CARGO_RUN.test(words)

    if (!isLocked && !isLockTool) {
      return next(e)
    }

    const lock = await findLock($)

    if (lock === null) {
      return next(e)
    }

    const namesLock = command.includes(lock.path.split('/').at(-1) ?? lock.path)

    // Under the wrap, its own flock/lockf would also wait on the lock its shell holds: a deadlock
    if ((kind !== null && namesLock) || (isLockTool && (namesLock || command.includes(LOCK_ENV)))) {
      return { deny: HANDS_OFF }
    }

    if (!isLocked) {
      return next(e)
    }

    if (kind === null) {
      return (await read($, cargoBuilt))
        ? next(e)
        : { deny: 'test-lock: run `cargo build` with the same flags first, so compiling waits for the lock, then `cargo run`.' }
    }

    const current = await refresh($, lock)

    let waited = 0

    if (current !== null) {
      const waits = command.includes(NO_WAIT) ? null : await waitForLock($, lock, current, next.signal)

      if (waits === null) {
        return {
          deny: `test-lock: ${describe(current)}. Wait for that run to finish before running ${RUNNING[kind]}.`,
        }
      }

      waited = waits * WAIT_S
      await refresh($, lock)
    }

    const root = await $.session.root()
    const id = await $.session.id()
    const label = `${root.split('/').at(-1)} (${id.slice(0, 8)})`

    const wrapped = wrapCommand(command, lock, kind, label)

    issued.set(wrapped, command)

    const result = await next({ ...e, command: wrapped })

    if (CARGO_BUILD.test(words) && !('deny' in result)) {
      await update($, cargoBuilt, () => true)
    }

    if (waited === 0 || 'deny' in result) {
      return result
    }

    // Read by the model alone: how to skip the wait next time
    const note = `test-lock waited about ${Math.ceil(waited / 60)}m for another session's tests or build to finish before running this. Prefix a command with ${NO_WAIT} to be refused at once instead of waiting.`

    return { ...result, context: [...(result.context ?? []), note] }
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, holder)

    if (current === null) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const minutes = Math.floor(((await $.clock.now()) - current.startedAt) / 60000)

    return (
      <Box>
        <Text color="warning">
          {describe(current)}
          {current.startedAt > 0 ? ` (${minutes}m)` : ''}
        </Text>
      </Box>
    )
  })
}
