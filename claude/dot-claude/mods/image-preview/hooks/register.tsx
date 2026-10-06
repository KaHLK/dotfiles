import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Shown } from '../types'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.tool.register({ name: TOOL, description: DESCRIPTION, inputSchema: INPUT_SCHEMA })
    await $.command.register({ name: 'images', description: 'Reopen the image preview pane' })

    return result
  })

  on('tool.call', { tool: 'mcp__image-preview__show_images' }, async ($, e) => {
    const input = e as unknown as Input
    const paths = Array.isArray(input.paths) ? input.paths : []
    if (paths.length === 0) return { deny: 'paths: give at least one absolute .png path' }

    const shown: Shown[] = []
    for (const [i, path] of paths.entries()) {
      const found = await inspect($, path)
      if (typeof found === 'string') return { deny: found }
      shown.push({ ...found, caption: input.captions?.[i] })
    }

    const title = input.title ?? 'Images'
    await update($, images, () => shown)
    await update($, index, () => 0)
    await update($, paneTitle, () => title)
    const opened = await $.ui.open({ id: PANE, title })

    return {
      result: opened.isPlaced
        ? `Showing ${shown.length} image${shown.length === 1 ? '' : 's'} to the user in the preview pane.`
        : `Images loaded, but the pane is waiting for room (${opened.reason}). Tell the user to run /images.`,
    }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'image-preview failed to load the images' }))

  on('command.run', { command: 'images' }, async $ => {
    const count = (await read($, images)).length
    await $.ui.open({ id: PANE, title: await read($, paneTitle) })

    return { text: count === 0 ? 'No images yet.' : `Image preview opened (${count}).` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const list = await read($, images)
    const current = list[Math.min(await read($, index), list.length - 1)]

    // Image is the terminal's alone; elsewhere name the file
    if (e.surface !== 'terminal' || current === undefined) {
      const { Text } = $.ui.resolve(e)
      return <Text dimColor>{current === undefined ? 'No images yet.' : (current.caption ?? current.path)}</Text>
    }

    const { Box, Button, Image, Text } = $.ui.resolve(e)

    const isMany = list.length > 1
    // name, buttons, caption when given, the file list when several
    const chromeRows = 2 + (current.caption === undefined ? 0 : 1) + (isMany ? list.length : 0)
    const { columns, rows } = fit(current, e.props.bodyColumns, e.props.scroll.bodyRows - chromeRows)
    const position = list.indexOf(current)

    return (
      <Box flexDirection="column" alignItems="center">
        <Text bold>{baseName(current.path)}</Text>
        <Image
          source={{ file: current.path, format: 'png', generation: current.generation }}
          columns={columns}
          rows={rows}
          alt="image not drawn here, press o to open"
        />
        {current.caption !== undefined && <Text dimColor>{current.caption}</Text>}
        <Box gap={2}>
          {isMany && <Button key="prev" label="←" hotkey="p" onPress={() => step($, -1)} />}
          {isMany && (
            <Text dimColor>
              {position + 1}/{list.length}
            </Text>
          )}
          {isMany && <Button key="next" label="→" hotkey="n" onPress={() => step($, 1)} />}
          <Button key="open" label="open" hotkey="o" onPress={() => openInViewer($, [current.path], 0)} />
          {isMany && (
            <Button key="open-all" label="open all" hotkey="a" onPress={() => openInViewer($, list.map(one => one.path), position)} />
          )}
        </Box>
        {isMany && (
          <Box flexDirection="column">
            {list.map((one, i) => (
              <Button
                key={`file-${i}`}
                label={baseName(one.path)}
                plain
                {...(i < 9 ? { hotkey: String(i + 1) } : {})}
                {...(i === position ? { variant: 'primary' as const } : { dimColor: true })}
                onPress={() => update($, index, () => i)}
              />
            ))}
          </Box>
        )}
      </Box>
    )
  })
}

type Input = { paths?: string[]; captions?: string[]; title?: string }

const TOOL = 'show_images'
const PANE = 'image-preview'
// Terminal cells are about twice as tall as wide
const CELL_ASPECT = 2

const DESCRIPTION = [
  'Show one or more PNG images to the user in a preview pane inside this Claude Code session.',
  'Use it whenever you capture screenshots (e.g. of a headless browser) or produce images the user should see,',
  'instead of only describing them or printing their paths. Several images get arrows to page between them.',
  'Each call replaces what the pane shows. Paths must be absolute and PNG; convert other formats first',
  '(macOS: `sips -s format png in.jpg --out out.png`).',
].join(' ')

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    paths: { type: 'array', items: { type: 'string' }, minItems: 1, description: 'Absolute paths of PNG files, in display order' },
    captions: { type: 'array', items: { type: 'string' }, description: 'Optional caption per image, same order as paths' },
    title: { type: 'string', description: 'Pane title, e.g. "Checkout flow"' },
  },
  required: ['paths'],
}

const images = atom({ plugin: 'image-preview', key: 'images' } as const, [])
const index = atom({ plugin: 'image-preview', key: 'index' } as const, 0)
const paneTitle = atom({ plugin: 'image-preview', key: 'title' } as const, 'Images')

const step = async ($: EngineInterface, by: number) => {
  const count = (await read($, images)).length
  await update($, index, i => (i + by + count) % count)
}

// Viewers page through the image's folder, so "open all" links the set into
// a fresh one, numbered in display order, and opens the current image there.
// qView; `open` returns once it has handed the file over
const OPEN_SCRIPT = String.raw`
start=$1; shift
if [ $# -eq 1 ]; then target=$1
else
  tmp=$TMPDIR; [ -n "$tmp" ] || tmp=/tmp
  dir=$(mktemp -d "$tmp/image-preview.XXXXXX") || exit 1
  i=0
  for p; do
    i=$((i + 1))
    link="$dir/$(printf %02d $i)-$(basename "$p")"
    ln -s "$p" "$link"
    [ $i -eq "$start" ] && target=$link
  done
fi
open -a qView "$target"
`

export const openInViewer = ($: EngineInterface, paths: string[], position: number) =>
  $.process.run(['/bin/sh', '-c', OPEN_SCRIPT, 'image-preview', String(position + 1), ...paths])

// `file -b` confirms PNG and gives its size without reading the pixels
const inspect = async ($: EngineInterface, path: string): Promise<Omit<Shown, 'caption'> | string> => {
  if (!path.startsWith('/')) return `${path}: not an absolute path`

  const stat = await $.fs.stat(path).catch(() => undefined)
  if (stat?.kind !== 'file') return `${path}: no such file`

  const { stdout } = await $.process.run(['file', '-b', path])
  const size = /PNG image data, (\d+) x (\d+)/.exec(stdout)
  if (size === null) return `${path}: not a PNG (${stdout.trim()}); convert it first`

  return { path, width: Number(size[1]), height: Number(size[2]), generation: Math.floor(stat.mtimeMs) }
}

const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1)

const clamp = (n: number) => Math.max(1, Math.min(255, Math.floor(n)))

export const fit = (image: { width: number; height: number }, maxColumns: number, maxRows: number) => {
  const ratio = image.height / image.width / CELL_ASPECT
  const columns = Math.min(maxColumns, maxRows / ratio)

  return { columns: clamp(columns), rows: clamp(columns * ratio) }
}
