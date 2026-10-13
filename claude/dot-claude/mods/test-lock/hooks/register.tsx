import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Holder } from '../types'

const LOCK_FD = 9
const EX_TEMPFAIL = 75
const POLL_MS = 5000
// Waits run as blocking lock probes: a $ call's time is outside the hook's 10 s budget
const WAIT_S = 5
const MAX_WAITS = (20 * 60) / WAIT_S
// Covers the gap between a probe seeing the lock free and the command taking it
const TAKE_WAIT_S = 10
const NO_WAIT = 'TEST_LOCK_NOWAIT=1'

const START = String.raw`(^|[\s;&|(])`
const TEST = new RegExp(
  START +
    String.raw`(bun\s+(run\s+)?test|bunx?\s+(jest|vitest|playwright\s+test)|npx\s+(jest|vitest|playwright\s+test)|jest|vitest|playwright\s+test|dotnet\s+test|pg_prove|make\s+(test|e2e)|\./gradlew\b[^;&|]*\b(test\w*|connected\w*Test))\b`,
)
const BUILD = new RegExp(
  START +
    String.raw`(bunx?\s+tsc|npx\s+tsc|tsc|bun\s+run\s+(build|typecheck|tsc)|vite\s+build|dotnet\s+build|\./gradlew\b[^;&|]*\bassemble\w*)\b`,
)

type Locker = { take: (fd: number) => string; probe: (lock: string, seconds?: number) => string[] }

// flock is util-linux (every Linux); macOS ships only BSD lockf
const lockerFor = (path: string): Locker =>
  path.endsWith('/flock')
    ? {
        take: fd => `${path} -w ${TAKE_WAIT_S} ${fd}`,
        probe: (lock, seconds = 0) => (seconds === 0 ? [path, '-n', lock, 'true'] : [path, '-w', String(seconds), lock, 'true']),
      }
    : {
        take: fd => `${path} -s -t ${TAKE_WAIT_S} ${fd}`,
        probe: (lock, seconds = 0) => [path, '-k', '-s', '-t', String(seconds), lock, 'true'],
      }

const holder = atom({ plugin: 'test-lock', key: 'holder' } as const, null)

export const isTestCommand = (command: string) => TEST.test(command)
export const isBuildCommand = (command: string) => BUILD.test(command) && !TEST.test(command)

const quote = (text: string) => `'${text.replaceAll("'", `'\\''`)}'`

export const wrapCommand = (command: string, lock: string, locker: Locker) =>
  `exec ${LOCK_FD}>>${quote(lock)} && ${locker.take(LOCK_FD)} || { echo "test-lock: tests or a build already running in another session" >&2; exit ${EX_TEMPFAIL}; }; { ${command}\n} ${LOCK_FD}>&-`

let found: Promise<Locker | null> | undefined

const findLocker = ($: EngineInterface) =>
  (found ??= $.process
    .run(['/bin/sh', '-c', 'command -v flock || command -v lockf'])
    .then(({ exitCode, stdout }) => (exitCode === 0 && stdout.trim() !== '' ? lockerFor(stdout.trim().split('\n')[0] ?? '') : null)))

const lockPath = async ($: EngineInterface) => `${(await $.env.get('HOME')) ?? '/tmp'}/.cache/pluto-test.lock`

const isHeld = async ($: EngineInterface, lock: string, locker: Locker, seconds = 0) =>
  (await $.process.run(locker.probe(lock, seconds), { timeoutMs: (seconds + 5) * 1000 })).exitCode !== 0

// Resolves how many probes it waited, or null when the lock stayed held or the call was interrupted
const waitForLock = async ($: EngineInterface, lock: string, locker: Locker, current: Holder, signal: AbortSignal) => {
  $.ui.status(`test-lock: waiting for ${describe(current)}`)
  try {
    for (let waits = 1; waits <= MAX_WAITS; waits++) {
      if (signal.aborted) return null
      if (!(await isHeld($, lock, locker, WAIT_S))) return waits
    }
    return null
  } finally {
    $.ui.status(undefined)
  }
}

const readHolder = async ($: EngineInterface, lock: string): Promise<Holder> => {
  const sidecar = await $.fs.read(`${lock}.json`).catch(() => undefined)
  try {
    // Sidecars written before builds took the lock carry no kind
    return { kind: 'tests', ...(JSON.parse(String(sidecar)) as Omit<Holder, 'kind'>) }
  } catch {
    return { kind: 'tests', label: 'unknown session', command: 'unknown command', startedAt: 0 }
  }
}

const refresh = async ($: EngineInterface, lock: string, locker: Locker) => {
  const current = (await isHeld($, lock, locker)) ? await readHolder($, lock) : null
  await update($, holder, () => current)
  return current
}

const describe = (current: Holder) => `${current.kind} running in ${current.label}: ${current.command.slice(0, 60)}`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    const locker = await findLocker($)

    if (locker === null) {
      $.ui.toast('test-lock: neither flock nor lockf found; test runs are not serialized')
      return started
    }

    const lock = await lockPath($)
    await refresh($, lock, locker)
    $.clock.every(POLL_MS, () => void refresh($, lock, locker))

    return started
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const isTest = isTestCommand(e.command)
    const isBuild = isBuildCommand(e.command)

    if ((!isTest && !isBuild) || e.command.includes(`exec ${LOCK_FD}>>`)) {
      return next(e)
    }

    const locker = await findLocker($)

    if (locker === null) {
      return next(e)
    }

    const lock = await lockPath($)
    const current = await refresh($, lock, locker)

    let waited = 0

    if (current !== null) {
      const waits = e.command.includes(NO_WAIT) ? null : await waitForLock($, lock, locker, current, next.signal)

      if (waits === null) {
        return {
          deny: `test-lock: ${describe(current)}. Wait for that run to finish before running ${isTest ? 'tests' : 'a build or typecheck'}.`,
        }
      }

      waited = waits * WAIT_S
      await refresh($, lock, locker)
    }

    const root = await $.session.root()
    const id = await $.session.id()
    const entry: Holder = {
      kind: isTest ? 'tests' : 'build',
      label: `${root.split('/').at(-1)} (${id.slice(0, 8)})`,
      command: e.command,
      startedAt: await $.clock.now(),
    }
    await $.fs.write(`${lock}.json`, JSON.stringify(entry))

    const result = await next({ ...e, command: wrapCommand(e.command, lock, locker) })

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
