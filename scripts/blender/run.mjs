// Renders the Blender rooms one after another.
//   node scripts/blender/run.mjs [roomId…] [--preview] [--samples=N] [--blend]
// Rooms live in scripts/blender/rooms/<room_id>.py (ids use dashes, files underscores).
import { spawn } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const flags = args.filter((a) => a.startsWith('--'))
let rooms = args.filter((a) => !a.startsWith('--'))
if (!rooms.length) {
  rooms = readdirSync(join(here, 'rooms')).filter((f) => f.endsWith('.py') && !f.startsWith('_')).map((f) => f.slice(0, -3).replaceAll('_', '-'))
}
const blender = process.env.BLENDER ?? 'blender'

for (const id of rooms) {
  const started = Date.now()
  const code = await new Promise((resolve) => {
    const p = spawn(blender, ['-b', '--factory-startup', '--python', join(here, 'build.py'), '--', id, ...flags], { stdio: ['ignore', 'pipe', 'pipe'] })
    let tail = ''
    const onData = (d) => {
      const s = d.toString()
      tail = (tail + s).slice(-4000)
      for (const line of s.split('\n')) if (line.startsWith('[room]') || /Error|Traceback/.test(line)) console.log(line)
    }
    p.stdout.on('data', onData)
    p.stderr.on('data', onData)
    p.on('close', (c) => {
      if (c) console.error(tail)
      resolve(c)
    })
  })
  console.log(`${id}: ${code ? 'FAILED' : 'done'} in ${((Date.now() - started) / 1000).toFixed(0)}s`)
  if (code) process.exitCode = 1
}
