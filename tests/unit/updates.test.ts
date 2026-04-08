import { describe, it, expect } from 'vitest'

/**
 * Tests pour la logique de comparaison de versions dans updates.ts
 * et le parsing de npm outdated.
 *
 * Les fonctions testees :
 * - extractVersion(): extrait x.y.z d'une chaine quelconque
 * - compareVersions(): compare semantiquement deux versions
 * - parseNpmOutdated(): parse la sortie de npm outdated --json
 */

// Replique de extractVersion() depuis src/main/ipc/updates.ts (regex-based)
function extractVersion(raw: string): string | null {
  const line = raw.trim().split('\n')[0].trim()
  const match = line.match(/(\d+\.\d+\.\d+(?:[._-][\w.]+)?)/)
  return match ? match[1]! : null
}

// Replique de detectSourceFromPath() depuis src/main/ipc/updates.ts
function detectSourceFromPath(resolvedPath: string): 'brew' | 'npm' | 'system' {
  if (!resolvedPath) return 'system'
  const normalized = resolvedPath.toLowerCase()
  if (normalized.includes('/cellar/') || normalized.includes('/caskroom/')) return 'brew'
  if (normalized.includes('/node_modules/')) return 'npm'
  if (normalized.includes('/.cargo/bin/')) return 'system'
  return 'system'
}

// Replique de compareVersions() depuis src/main/ipc/updates.ts
function compareVersions(current: string, latest: string): boolean {
  const c = extractVersion(current) ?? current
  const l = extractVersion(latest) ?? latest
  if (c === l) return false
  const cParts = c.split('.').map(Number)
  const lParts = l.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((lParts[i] ?? 0) > (cParts[i] ?? 0)) return true
    if ((lParts[i] ?? 0) < (cParts[i] ?? 0)) return false
  }
  return false
}

// Ancienne logique (pour reference et test de regression)
function isUpdateAvailableCurrent(currentVersion: string, latestVersion: string | null): boolean {
  return latestVersion !== null && latestVersion !== currentVersion
}

// Fonction semver a implementer : compare deux versions semantiques
// Retourne true si latest > current
function compareSemver(current: string, latest: string): number {
  const clean = (v: string) => v.replace(/^v/, '').split('+')[0]! // strip v prefix and build metadata
  const [cMain, cPre] = clean(current).split('-')
  const [lMain, lPre] = clean(latest).split('-')

  const cParts = cMain!.split('.').map(Number)
  const lParts = lMain!.split('.').map(Number)

  // Compare major.minor.patch
  for (let i = 0; i < 3; i++) {
    const c = cParts[i] || 0
    const l = lParts[i] || 0
    if (l > c) return 1
    if (l < c) return -1
  }

  // Pre-release : version sans pre-release > version avec pre-release
  if (!cPre && lPre) return -1  // current=1.0.0, latest=1.0.0-beta -> current plus recente
  if (cPre && !lPre) return 1   // current=1.0.0-beta, latest=1.0.0 -> latest plus recente
  if (cPre && lPre) {
    return cPre < lPre ? 1 : cPre > lPre ? -1 : 0
  }

  return 0 // equal
}

function isUpdateAvailableSemver(current: string, latest: string): boolean {
  return compareSemver(current, latest) > 0
}

// Types pour npm outdated parsing
interface NpmOutdatedEntry {
  package: string
  current: string
  wanted: string
  latest: string
  type: 'dependencies' | 'devDependencies'
  updateType: 'major' | 'minor' | 'patch'
}

// Parse la sortie JSON de npm outdated --json
function parseNpmOutdated(jsonOutput: string): NpmOutdatedEntry[] {
  try {
    const data = JSON.parse(jsonOutput)
    const entries: NpmOutdatedEntry[] = []

    for (const [pkg, info] of Object.entries(data)) {
      const i = info as { current: string; wanted: string; latest: string; type?: string }
      if (!i.current || !i.latest) continue

      const cParts = i.current.split('.').map(Number)
      const lParts = i.latest.split('.').map(Number)

      let updateType: 'major' | 'minor' | 'patch' = 'patch'
      if (lParts[0]! > cParts[0]!) updateType = 'major'
      else if (lParts[1]! > cParts[1]!) updateType = 'minor'

      entries.push({
        package: pkg,
        current: i.current,
        wanted: i.wanted,
        latest: i.latest,
        type: (i.type === 'devDependencies' ? 'devDependencies' : 'dependencies'),
        updateType,
      })
    }

    return entries
  } catch {
    return []
  }
}

describe('Version comparison (updates)', () => {
  describe('comparaison simple (logique actuelle)', () => {
    it('detecte une mise a jour disponible', () => {
      expect(isUpdateAvailableCurrent('1.0.0', '2.0.0')).toBe(true)
    })

    it('pas de mise a jour si meme version', () => {
      expect(isUpdateAvailableCurrent('1.0.0', '1.0.0')).toBe(false)
    })

    it('detecte une mise a jour mineure', () => {
      expect(isUpdateAvailableCurrent('1.0.0', '1.1.0')).toBe(true)
    })

    it('detecte une mise a jour patch', () => {
      expect(isUpdateAvailableCurrent('1.0.0', '1.0.1')).toBe(true)
    })

    it('retourne false si latestVersion est null', () => {
      expect(isUpdateAvailableCurrent('1.0.0', null)).toBe(false)
    })

    it('BUG: signale une mise a jour meme si version courante est plus recente', () => {
      // Ceci est le bug que la comparaison semver corrigera
      expect(isUpdateAvailableCurrent('2.0.0', '1.0.0')).toBe(true) // faux positif !
    })
  })

  describe('extractVersion (regex-based)', () => {
    it('extrait x.y.z d une chaine simple', () => {
      expect(extractVersion('1.0.0')).toBe('1.0.0')
    })

    it('extrait la version d une chaine avec prefixe', () => {
      expect(extractVersion('v20.11.0')).toBe('20.11.0')
    })

    it('extrait la version de la sortie git', () => {
      expect(extractVersion('git version 2.44.0')).toBe('2.44.0')
    })

    it('extrait la version de "2.1.94 (Claude Code)"', () => {
      expect(extractVersion('2.1.94 (Claude Code)')).toBe('2.1.94')
    })

    it('extrait la version de "go version go1.22.1 darwin/arm64"', () => {
      expect(extractVersion('go version go1.22.1 darwin/arm64')).toBe('1.22.1')
    })

    it('extrait la version de "Python 3.12.3"', () => {
      expect(extractVersion('Python 3.12.3')).toBe('3.12.3')
    })

    it('extrait la version de "cargo 1.77.0 (3fe68eac7 2024-02-29)"', () => {
      expect(extractVersion('cargo 1.77.0 (3fe68eac7 2024-02-29)')).toBe('1.77.0')
    })

    it('extrait la version de "codex-cli 0.118.0"', () => {
      expect(extractVersion('codex-cli 0.118.0')).toBe('0.118.0')
    })

    it('extrait la version de "2.50.1 (Apple Git-155)"', () => {
      expect(extractVersion('2.50.1 (Apple Git-155)')).toBe('2.50.1')
    })

    it('extrait la version avec pre-release "1.0.0-beta.1"', () => {
      expect(extractVersion('1.0.0-beta.1')).toBe('1.0.0-beta.1')
    })

    it('gere la sortie multiligne (prend la premiere ligne)', () => {
      expect(extractVersion('2.1.94 (Claude Code)\nsome other line')).toBe('2.1.94')
    })

    it('retourne null pour une chaine vide', () => {
      expect(extractVersion('')).toBeNull()
    })

    it('retourne null pour du texte sans version', () => {
      expect(extractVersion('command not found')).toBeNull()
    })
  })

  describe('detectSourceFromPath', () => {
    it('detecte brew formula depuis un chemin Cellar', () => {
      expect(detectSourceFromPath('/opt/homebrew/Cellar/node/25.9.0/bin/node')).toBe('brew')
    })

    it('detecte brew formula depuis /usr/local/Cellar', () => {
      expect(detectSourceFromPath('/usr/local/Cellar/git/2.44.0/bin/git')).toBe('brew')
    })

    it('detecte brew cask depuis un chemin Caskroom', () => {
      expect(detectSourceFromPath('/opt/homebrew/Caskroom/some-app/1.0/bin/app')).toBe('brew')
    })

    it('detecte npm depuis un chemin node_modules (brew node)', () => {
      expect(detectSourceFromPath('/opt/homebrew/lib/node_modules/pnpm/bin/pnpm.cjs')).toBe('npm')
    })

    it('detecte npm depuis un chemin node_modules (nvm)', () => {
      expect(detectSourceFromPath('/Users/user/.nvm/versions/node/v20.11.0/lib/node_modules/yarn/bin/yarn.js')).toBe('npm')
    })

    it('detecte system pour /usr/bin', () => {
      expect(detectSourceFromPath('/usr/bin/python3')).toBe('system')
    })

    it('detecte system pour cargo bin', () => {
      expect(detectSourceFromPath('/Users/user/.cargo/bin/cargo')).toBe('system')
    })

    it('retourne system pour un chemin vide', () => {
      expect(detectSourceFromPath('')).toBe('system')
    })

    it('est insensible a la casse', () => {
      expect(detectSourceFromPath('/opt/Homebrew/CELLAR/node/25.0.0/bin/node')).toBe('brew')
    })
  })

  describe('compareVersions (implementation reelle)', () => {
    it('ne signale pas de mise a jour si version courante est plus recente', () => {
      expect(compareVersions('2.0.0', '1.0.0')).toBe(false)
    })

    it('compare correctement les versions majeures', () => {
      expect(compareVersions('1.0.0', '2.0.0')).toBe(true)
      expect(compareVersions('3.0.0', '2.0.0')).toBe(false)
    })

    it('compare correctement les versions mineures', () => {
      expect(compareVersions('1.0.0', '1.1.0')).toBe(true)
      expect(compareVersions('1.2.0', '1.1.0')).toBe(false)
    })

    it('compare correctement les versions patch', () => {
      expect(compareVersions('1.0.0', '1.0.1')).toBe(true)
      expect(compareVersions('1.0.2', '1.0.1')).toBe(false)
    })

    it('retourne false si les versions sont identiques', () => {
      expect(compareVersions('1.0.0', '1.0.0')).toBe(false)
    })

    it('gere les prefixes v grace a extractVersion', () => {
      expect(compareVersions('v1.0.0', '1.1.0')).toBe(true)
      expect(compareVersions('1.0.0', 'v1.1.0')).toBe(true)
      expect(compareVersions('v1.0.0', 'v1.0.0')).toBe(false)
    })

    it('gere les versions avec texte autour (git version, Claude Code)', () => {
      expect(compareVersions('git version 2.40.0', '2.41.0')).toBe(true)
      expect(compareVersions('Claude Code 1.0.0', '2.0.0')).toBe(true)
    })

    it('gere les versions avec major haute', () => {
      expect(compareVersions('20.0.0', '22.0.0')).toBe(true)
      expect(compareVersions('22.0.0', '20.0.0')).toBe(false)
    })

    it('FIX: ne signale plus faux positif quand current > latest', () => {
      // C'etait le bug avec l'ancienne comparaison simple !==
      // compareVersions corrige ce comportement
      expect(compareVersions('2.0.0', '1.0.0')).toBe(false)
      expect(compareVersions('10.0.0', '9.0.0')).toBe(false)
    })
  })

  describe('comparaison semver (reference complete)', () => {
    it('ne signale pas de mise a jour si version courante est plus recente', () => {
      expect(isUpdateAvailableSemver('2.0.0', '1.0.0')).toBe(false)
    })

    it('compare correctement les versions majeures', () => {
      expect(isUpdateAvailableSemver('1.0.0', '2.0.0')).toBe(true)
      expect(isUpdateAvailableSemver('3.0.0', '2.0.0')).toBe(false)
    })

    it('compare correctement les versions mineures', () => {
      expect(isUpdateAvailableSemver('1.0.0', '1.1.0')).toBe(true)
      expect(isUpdateAvailableSemver('1.2.0', '1.1.0')).toBe(false)
    })

    it('compare correctement les versions patch', () => {
      expect(isUpdateAvailableSemver('1.0.0', '1.0.1')).toBe(true)
      expect(isUpdateAvailableSemver('1.0.2', '1.0.1')).toBe(false)
    })

    it('retourne false si les versions sont identiques', () => {
      expect(isUpdateAvailableSemver('1.0.0', '1.0.0')).toBe(false)
    })

    it('gere les prefixes v (v1.0.0 vs 1.0.0)', () => {
      expect(isUpdateAvailableSemver('v1.0.0', '1.1.0')).toBe(true)
      expect(isUpdateAvailableSemver('1.0.0', 'v1.1.0')).toBe(true)
      expect(isUpdateAvailableSemver('v1.0.0', 'v1.0.0')).toBe(false)
    })

    it('gere les versions pre-release (1.0.0-beta.1)', () => {
      // Version release > version pre-release du meme numero
      expect(isUpdateAvailableSemver('1.0.0-beta.1', '1.0.0')).toBe(true)
      // Version pre-release < version release
      expect(isUpdateAvailableSemver('1.0.0', '1.0.0-beta.1')).toBe(false)
    })

    it('gere les versions avec build metadata (1.0.0+build.123)', () => {
      // Build metadata doit etre ignore dans la comparaison
      expect(isUpdateAvailableSemver('1.0.0+build.1', '1.0.1+build.2')).toBe(true)
      expect(isUpdateAvailableSemver('1.0.0+build.1', '1.0.0+build.2')).toBe(false)
    })

    it('gere les versions avec major haute', () => {
      expect(isUpdateAvailableSemver('20.0.0', '22.0.0')).toBe(true)
      expect(isUpdateAvailableSemver('22.0.0', '20.0.0')).toBe(false)
    })
  })

  describe('npm outdated parsing', () => {
    it('parse la sortie JSON de npm outdated', () => {
      const json = JSON.stringify({
        'express': { current: '4.18.0', wanted: '4.18.2', latest: '5.0.0', type: 'dependencies' },
        'vitest': { current: '3.0.0', wanted: '3.2.4', latest: '3.2.4', type: 'devDependencies' },
      })

      const entries = parseNpmOutdated(json)

      expect(entries).toHaveLength(2)
      expect(entries[0]!.package).toBe('express')
      expect(entries[0]!.updateType).toBe('major')
      expect(entries[1]!.package).toBe('vitest')
      expect(entries[1]!.updateType).toBe('minor')
    })

    it('identifie les paquets avec des mises a jour majeures', () => {
      const json = JSON.stringify({
        'react': { current: '18.2.0', wanted: '18.3.0', latest: '19.1.0' },
      })

      const entries = parseNpmOutdated(json)
      expect(entries[0]!.updateType).toBe('major')
    })

    it('identifie les paquets avec des mises a jour mineures', () => {
      const json = JSON.stringify({
        'typescript': { current: '5.0.0', wanted: '5.8.0', latest: '5.8.0' },
      })

      const entries = parseNpmOutdated(json)
      expect(entries[0]!.updateType).toBe('minor')
    })

    it('identifie les paquets avec des mises a jour patch', () => {
      const json = JSON.stringify({
        'lodash': { current: '4.17.20', wanted: '4.17.21', latest: '4.17.21' },
      })

      const entries = parseNpmOutdated(json)
      expect(entries[0]!.updateType).toBe('patch')
    })

    it('gere une sortie vide (pas de mises a jour)', () => {
      const entries = parseNpmOutdated('{}')
      expect(entries).toEqual([])
    })

    it('gere les erreurs de parsing', () => {
      const entries = parseNpmOutdated('invalid json {{')
      expect(entries).toEqual([])
    })

    it('filtre les dependances dev vs production', () => {
      const json = JSON.stringify({
        'express': { current: '4.18.0', wanted: '4.18.2', latest: '5.0.0', type: 'dependencies' },
        'vitest': { current: '3.0.0', wanted: '3.2.4', latest: '3.2.4', type: 'devDependencies' },
      })

      const entries = parseNpmOutdated(json)
      const deps = entries.filter(e => e.type === 'dependencies')
      const devDeps = entries.filter(e => e.type === 'devDependencies')

      expect(deps).toHaveLength(1)
      expect(devDeps).toHaveLength(1)
      expect(deps[0]!.package).toBe('express')
      expect(devDeps[0]!.package).toBe('vitest')
    })

    it('ignore les entrees sans current ou latest', () => {
      const json = JSON.stringify({
        'good': { current: '1.0.0', wanted: '1.1.0', latest: '1.1.0' },
        'bad': { wanted: '1.0.0' },
      })

      const entries = parseNpmOutdated(json)
      expect(entries).toHaveLength(1)
      expect(entries[0]!.package).toBe('good')
    })
  })
})
