import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Holder } from '../types'

const LOCK_FD = 9
const EX_TEMPFAIL = 75
const POLL_MS = 5000

const START = String.raw`(^|[\s;&|(])`
const TEST = new RegExp(
  START +
    String.raw`(bun\s+(run\s+)?test|bunx?\s+(jest|vitest|playwright\s+test)|npx\s+(jest|vitest|playwright\s+test)|jest|vitest|playwright\s+test|dotnet\s+test|pg_prove|make\s+(test|e2e)|\./gradlew\b[^;&|]*\b(test\w*|connected\w*Test))\b`,
)
const BUILD = new RegExp(
  START +
    String.raw`(bunx?\s+tsc|npx\s+tsc|tsc|bun\s+run\s+(build|typecheck|tsc)|vite\s+build|dotnet\s+build|\./gradlew\b[^;&|]*\bassemble\w*)\b`,
)

type Locker = { take: (fd: number) => string; probe: (lock: string) => string[] }

// flock is util-linux (every Linux); macOS ships only BSD lockf
const lockerFor = (path: string): Locker =>
  path.endsWith('/flock')
    ? { take: fd => `${path} -n ${fd}`, probe: lock => [path, '-n', lock, 'true'] }
    : { take: fd => `${path} -s -t 0 ${fd}`, probe: lock => [path, '-k', '-s', '-t', '0', lock, 'true'] }

const holder = atom({ plugin: 'test-lock', key: 'holder' } as const, null)

export const isTestCommand = (command: string) => TEST.test(command)
export const isBuildCommand = (command: string) => BUILD.test(command) && !TEST.test(command)

const quote = (text: string) => `'${text.replaceAll("'", `'\\''`)}'`

export const wrapCommand = (command: string, lock: string, locker: Locker) =>
  `exec ${LOCK_FD}>>${quote(lock)} && ${locker.take(LOCK_FD)} || { echo "test-lock: tests are already running in another session" >&2; exit ${EX_TEMPFAIL}; }; { ${command}\n} ${LOCK_FD}>&-`

let found: Promise<Locker | null> | undefined

const findLocker = ($: EngineInterface) =>
  (found ??= $.process
    .run(['/bin/sh', '-c', 'command -v flock || command -v lockf'])
    .then(({ exitCode, stdout }) => (exitCode === 0 && stdout.trim() !== '' ? lockerFor(stdout.trim().split('\n')[0] ?? '') : null)))

const lockPath = async ($: EngineInterface) => `${(await $.env.get('HOME')) ?? '/tmp'}/.cache/pluto-test.lock`

const isHeld = async ($: EngineInterface, lock: string, locker: Locker) =>
  (await $.process.run(locker.probe(lock))).exitCode !== 0

const readHolder = async ($: EngineInterface, lock: string): Promise<Holder> => {
  const sidecar = await $.fs.read(`${lock}.json`).catch(() => undefined)
  try {
    return JSON.parse(String(sidecar)) as Holder
  } catch {
    return { label: 'unknown session', command: 'unknown command', startedAt: 0 }
  }
}

const refresh = async ($: EngineInterface, lock: string, locker: Locker) => {
  const current = (await isHeld($, lock, locker)) ? await readHolder($, lock) : null
  await update($, holder, () => current)
  return current
}

const describe = (current: Holder) => `tests running in ${current.label}: ${current.command.slice(0, 60)}`

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

    if (current !== null) {
      return {
        deny: `test-lock: ${describe(current)}. Wait for that run to finish before running ${isTest ? 'tests' : 'a build or typecheck'}.`,
      }
    }

    if (isBuild) {
      return next(e)
    }

    const root = await $.session.root()
    const id = await $.session.id()
    const entry: Holder = {
      label: `${root.split('/').at(-1)} (${id.slice(0, 8)})`,
      command: e.command,
      startedAt: await $.clock.now(),
    }
    await $.fs.write(`${lock}.json`, JSON.stringify(entry))

    return next({ ...e, command: wrapCommand(e.command, lock, locker) })
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
