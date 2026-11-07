// Zips the built extension into release/, ready to upload to a web store.
// Run through `npm run package`, which checks and builds first.
import { execFileSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const dist = resolve(root, 'dist')
const releaseDir = resolve(root, 'release')

if (!existsSync(resolve(dist, 'manifest.json'))) {
  console.error('dist/ is missing. Run `npm run build` first.')
  process.exit(1)
}

// The manifest's "key" gives unpacked copies one fixed id, wherever their
// folder is. The store assigns its own id and refuses uploads that carry a
// key, so the zip gets a copy of the manifest without it.
const { key: _key, ...manifest } = JSON.parse(
  readFileSync(resolve(dist, 'manifest.json'), 'utf8'),
) as { key?: string; version: string }

// The store reads the version from the manifest, so the file name uses it too.
const output = resolve(releaseDir, `lighttabs-${manifest.version}.zip`)

const staging = mkdtempSync(join(tmpdir(), 'lighttabs-package-'))
cpSync(dist, staging, { recursive: true })
writeFileSync(
  join(staging, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
)

mkdirSync(releaseDir, { recursive: true })
rmSync(output, { force: true })

try {
  // -X leaves out extra file attributes, so the same build gives the same zip.
  execFileSync('zip', ['-r', '-X', '-q', output, '.'], { cwd: staging })
  console.warn(`Created ${output}`)
} catch (error) {
  const missing = (error as NodeJS.ErrnoException).code === 'ENOENT'
  console.error(
    missing ? 'The `zip` command is not installed.' : 'Zipping failed.',
  )
  process.exitCode = 1
} finally {
  rmSync(staging, { recursive: true, force: true })
}
