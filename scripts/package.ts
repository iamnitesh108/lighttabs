// Zips the built extension into release/: one zip to load unpacked (the
// GitHub release), one to upload to a web store.
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

const manifest = JSON.parse(
  readFileSync(resolve(dist, 'manifest.json'), 'utf8'),
) as { key?: string; version: string }
// The manifest's "key" gives unpacked copies one fixed id, wherever their
// folder is. The store assigns its own id and refuses uploads that carry a
// key, so its zip gets a copy of the manifest without it.
const { key: _key, ...storeManifest } = manifest

mkdirSync(releaseDir, { recursive: true })
// The store reads the version from the manifest, so the file names use it too.
const ok =
  zip(`lighttabs-${manifest.version}.zip`, manifest) &&
  zip(`lighttabs-${manifest.version}-store.zip`, storeManifest)
if (!ok) process.exitCode = 1

/** Zips dist with this manifest into release/; false if zipping failed. */
function zip(name: string, withManifest: object): boolean {
  const output = resolve(releaseDir, name)
  const staging = mkdtempSync(join(tmpdir(), 'lighttabs-package-'))
  try {
    cpSync(dist, staging, { recursive: true })
    writeFileSync(
      join(staging, 'manifest.json'),
      `${JSON.stringify(withManifest, null, 2)}\n`,
    )
    rmSync(output, { force: true })
    // -X leaves out extra file attributes, so the same build gives the same zip.
    execFileSync('zip', ['-r', '-X', '-q', output, '.'], { cwd: staging })
    console.warn(`Created ${output}`)
    return true
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === 'ENOENT'
    console.error(
      missing ? 'The `zip` command is not installed.' : 'Zipping failed.',
    )
    return false
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}
