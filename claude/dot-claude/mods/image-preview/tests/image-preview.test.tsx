import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { fit } from '../hooks/register'

const TOOL = 'mcp__image-preview__show_images'
const PANE_PROPS = {
  title: 'Images',
  isFocused: false,
  bodyColumns: 80,
  placement: 'dock' as const,
  scroll: { offset: 0, bodyRows: 40 },
  view: {},
}

const FILES: Record<string, string> = {
  '/tmp/shots/home.png': 'PNG image data, 1280 x 720, 8-bit/color RGBA, non-interlaced',
  '/tmp/shots/cart.png': 'PNG image data, 640 x 480, 8-bit/color RGB, non-interlaced',
  '/tmp/shots/photo.jpg': 'JPEG image data, JFIF standard 1.01',
}

const world = (on: On, isPlaced = true) => {
  const opened: string[] = []
  on('fs.stat', ($, e) => ({
    value: { kind: e.path in FILES ? ('file' as const) : ('other' as const), size: 1, mtimeMs: 42, isLink: false },
  }))
  const viewer: string[][] = []
  on('process.run', ($, e) => {
    // argv: sh -c SCRIPT $0 start ...paths
    if (e.argv[0] === '/bin/sh') viewer.push(e.argv.slice(4))
    return {
      value: { exitCode: 0, stdout: `${FILES[e.argv[2] ?? ''] ?? ''}\n`, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
    }
  })
  on('ui.open', ($, e) => {
    opened.push(e.id)
    return { value: isPlaced ? { isPlaced: true as const } : { isPlaced: false as const, reason: 'narrow' as const } }
  })

  return { opened, viewer }
}

// A mod's own tool answers `result` or `deny`; `text` is the engine's alone
const said = (answer: { result?: unknown; deny?: string }) => answer.deny ?? String(answer.result)

const shownFile = async (ui: Awaited<ReturnType<typeof mountPane>>) =>
  ((await ui.find({ type: 'Image' }))?.props.source as { file?: string } | undefined)?.file

const mountPane = ($: Engine) =>
  $.ui.mount({ plugin: 'image-preview', surface: 'terminal', component: 'Pane', requestId: 'image-preview', props: PANE_PROPS })

test('two screenshots open the pane on the first, arrows page between them', async ($, on) => {
  const { opened } = world(on)

  const answer = await $.tool.call({
    tool: TOOL,
    paths: ['/tmp/shots/home.png', '/tmp/shots/cart.png'],
    captions: ['Home', 'Cart'],
  })
  const ui = await mountPane($)

  expect(opened).toEqual(['image-preview'])
  expect(said(answer)).toContain('Showing 2 images')
  expect((await ui.find({ type: 'Image' }))?.props.source).toEqual({ file: '/tmp/shots/home.png', format: 'png', generation: 42 })
  expect((await ui.find({ type: 'Text', text: '1/2' })) !== undefined).toBe(true)

  await ui.press({ key: 'next' })
  expect(await shownFile(ui)).toBe('/tmp/shots/cart.png')
  expect((await ui.find({ type: 'Text', text: '2/2' })) !== undefined).toBe(true)

  await ui.press({ key: 'next' })
  expect(await shownFile(ui)).toBe('/tmp/shots/home.png')

  await ui.press({ key: 'prev' })
  expect(await shownFile(ui)).toBe('/tmp/shots/cart.png')
})

test('one image shows no arrows', async ($, on) => {
  world(on)

  await $.tool.call({ tool: TOOL, paths: ['/tmp/shots/home.png'] })
  const ui = await mountPane($)

  expect((await ui.find({ type: 'Image' })) !== undefined).toBe(true)
  expect(await ui.find({ key: 'next' })).toBe(undefined)
})

for (const [path, reason] of [
  ['/tmp/shots/photo.jpg', 'not a PNG'],
  ['shots/home.png', 'not an absolute path'],
  ['/tmp/shots/missing.png', 'no such file'],
] as const) {
  test(`${path} is refused: ${reason}`, async ($, on) => {
    const { opened } = world(on)

    const answer = await $.tool.call({ tool: TOOL, paths: ['/tmp/shots/home.png', path] })

    expect(said(answer)).toContain(reason)
    expect(opened).toEqual([])
  })
}

test('the agent is told to point the user at /images when the pane waits', async ($, on) => {
  world(on, false)

  const answer = await $.tool.call({ tool: TOOL, paths: ['/tmp/shots/home.png'] })

  expect(said(answer)).toContain('/images')
})

test('fit keeps the aspect ratio within the body', () => {
  expect(fit({ width: 1280, height: 720 }, 80, 40)).toEqual({ columns: 80, rows: 22 })
  expect(fit({ width: 720, height: 1280 }, 80, 40)).toEqual({ columns: 45, rows: 40 })
})

test('open hands the current image to the viewer, open all the whole set from it', async ($, on) => {
  const { viewer } = world(on)

  await $.tool.call({ tool: TOOL, paths: ['/tmp/shots/home.png', '/tmp/shots/cart.png'] })
  const ui = await mountPane($)
  await ui.press({ key: 'next' })
  await ui.press({ key: 'open' })
  await ui.press({ key: 'open-all' })

  expect(viewer).toEqual([
    ['1', '/tmp/shots/cart.png'],
    ['2', '/tmp/shots/home.png', '/tmp/shots/cart.png'],
  ])
})

test('one image offers open but not open all', async ($, on) => {
  world(on)

  await $.tool.call({ tool: TOOL, paths: ['/tmp/shots/home.png'] })
  const ui = await mountPane($)

  expect((await ui.find({ key: 'open' })) !== undefined).toBe(true)
  expect(await ui.find({ key: 'open-all' })).toBe(undefined)
})

test('file list names every image, highlights the current, jumps on press', async ($, on) => {
  world(on)

  await $.tool.call({ tool: TOOL, paths: ['/tmp/shots/home.png', '/tmp/shots/cart.png'], captions: ['Home', 'Cart'] })
  const ui = await mountPane($)

  expect((await ui.find({ type: 'Text', text: 'home.png' }))?.props.bold).toBe(true)
  expect((await ui.find({ key: 'file-0' }))?.props.variant).toBe('primary')
  expect((await ui.find({ key: 'file-1' }))?.props.dimColor).toBe(true)

  await ui.press({ key: 'file-1' })

  expect(await shownFile(ui)).toBe('/tmp/shots/cart.png')
  expect((await ui.find({ key: 'file-1' }))?.props.variant).toBe('primary')
  expect((await ui.find({ type: 'Text', text: 'Cart' })) !== undefined).toBe(true)
})
