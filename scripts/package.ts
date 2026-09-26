// Zips the built extension into release/, ready to upload to a web store.
// Run through `npm run package`, which checks and builds first.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const dist = resolve(root, 'dist')
const releaseDir = resolve(root, 'release')

if (!existsSync(resolve(dist, 'manifest.json'))) {
  console.error('dist/ is missing. Run `npm run build` first.')
  process.exit(1)
}

// The store reads the version from the manifest, so the file name uses it too.
const manifest = JSON.parse(
  readFileSync(resolve(dist, 'manifest.json'), 'utf8'),
) as { version: string }
const output = resolve(releaseDir, `lighttabs-${manifest.version}.zip`)

mkdirSync(releaseDir, { recursive: true })
rmSync(output, { force: true })

try {
  // -X leaves out extra file attributes, so the same build gives the same zip.
  execFileSync('zip', ['-r', '-X', '-q', output, '.'], { cwd: dist })
} catch (error) {
  const missing = (error as NodeJS.ErrnoException).code === 'ENOENT'
  console.error(
    missing ? 'The `zip` command is not installed.' : 'Zipping failed.',
  )
  process.exit(1)
}

console.warn(`Created ${output}`)
