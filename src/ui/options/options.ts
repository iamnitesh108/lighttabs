import { formatMinutes } from '../../core/format.ts'
import type { Settings } from '../../core/settings.ts'
import {
  saveSuspendedAfterChoices,
  suspendAfterChoices,
} from '../../core/settings.ts'
import { normalizeSiteRule } from '../../core/sites.ts'
import { youTubeOrigins } from '../../core/video-time.ts'
import { SettingsStore } from '../../platform/settings-store.ts'
import { send } from '../../shared/messages.ts'
import { byId, el } from '../shared/dom.ts'

type BooleanSetting = {
  [K in keyof Settings]: Settings[K] extends boolean ? K : never
}[keyof Settings]

const note = byId('saved-note')
const minutes = byId<HTMLSelectElement>('suspendAfterMinutes')
const days = byId<HTMLSelectElement>('saveSuspendedAfterDays')
const sites = byId<HTMLTextAreaElement>('neverSuspendSites')
const videoTime = byId<HTMLInputElement>('rememberVideoTime')

function show(settings: Settings): void {
  minutes.value = String(settings.suspendAfterMinutes)
  days.value = String(settings.saveSuspendedAfterDays)
  for (const box of document.querySelectorAll<HTMLInputElement>(
    '[data-setting]',
  )) {
    box.checked = settings[box.dataset.setting as BooleanSetting]
  }
  videoTime.checked = settings.rememberVideoTime
  // Don't overwrite what the user is typing.
  if (document.activeElement !== sites)
    sites.value = settings.neverSuspendSites.join('\n')
}

/** Saves a change through the background (the only writer), then shows the result. */
async function save(patch: Partial<Settings>): Promise<void> {
  try {
    show(await send('update-settings', { patch }))
    note.textContent = 'Saved'
  } catch (error) {
    note.textContent = error instanceof Error ? error.message : String(error)
  }
}

async function main(): Promise<void> {
  for (const choice of suspendAfterChoices) {
    minutes.append(
      el(
        'option',
        { value: choice },
        choice === 0 ? 'Never' : formatMinutes(choice),
      ),
    )
  }
  minutes.addEventListener(
    'change',
    () => void save({ suspendAfterMinutes: Number(minutes.value) }),
  )

  for (const choice of saveSuspendedAfterChoices) {
    days.append(
      el(
        'option',
        { value: choice },
        choice === 0 ? 'Never' : formatMinutes(choice * 24 * 60),
      ),
    )
  }
  days.addEventListener(
    'change',
    () => void save({ saveSuspendedAfterDays: Number(days.value) }),
  )

  for (const box of document.querySelectorAll<HTMLInputElement>(
    '[data-setting]',
  )) {
    box.addEventListener(
      'change',
      () => void save({ [box.dataset.setting as BooleanSetting]: box.checked }),
    )
  }

  // Reading a video's position needs access to YouTube, asked for only
  // when this is turned on (and given back when it's turned off).
  videoTime.addEventListener('change', async () => {
    const origins = { origins: youTubeOrigins }
    const on = videoTime.checked && (await chrome.permissions.request(origins))
    if (!on) await chrome.permissions.remove(origins)
    await save({ rememberVideoTime: on })
  })

  // Sites are saved when the field loses focus; lines that aren't sites are
  // dropped, and the cleaned list is shown back.
  sites.addEventListener('change', () => {
    const rules = sites.value
      .split('\n')
      .map(normalizeSiteRule)
      .filter((r): r is string => r !== null)
    sites.value = rules.join('\n')
    void save({ neverSuspendSites: rules })
  })

  const store = new SettingsStore()
  show(await store.get())
  store.onChange(show) // changes made from the popup show up here too

  const shortcuts = byId('shortcuts')
  for (const command of await chrome.commands.getAll()) {
    const name =
      command.name === '_execute_action'
        ? 'Open LightTabs'
        : command.description
    shortcuts.append(
      el('dt', {}, name ?? ''),
      el('dd', {}, command.shortcut || 'Not set'),
    )
  }
  byId('change-shortcuts').addEventListener('click', () => {
    // Every Chromium browser maps chrome:// to its own settings pages.
    void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })
  })

  byId('version').textContent =
    `LightTabs ${chrome.runtime.getManifest().version}`
}

main().catch((error: unknown) => {
  note.textContent = error instanceof Error ? error.message : String(error)
})
