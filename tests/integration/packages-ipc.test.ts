import { describe, it, expect, beforeEach, afterAll, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { createMockIpcMain } from '../mocks/electron'

const TEST_DIR = path.join(os.tmpdir(), `.mirehub-packages-ipc-test-${process.pid}-${Date.now()}`)

// Mock crossExecFile from platform (instead of child_process directly)
const mockExecFile = vi.fn()
const mockAskPackageQuestion = vi.fn()
const mockCancelPackageQuery = vi.fn()

vi.mock('../../src/shared/platform', async () => {
  const actual = await vi.importActual<typeof import('../../src/shared/platform')>('../../src/shared/platform')
  return {
    ...actual,
    crossExecFile: mockExecFile,
  }
})

vi.mock('../../src/main/services/packages/nlPackages', () => ({
  askPackageQuestion: mockAskPackageQuestion,
  cancelPackageQuery: mockCancelPackageQuery,
}))

describe('Packages IPC Handlers', () => {
  let mockIpcMain: ReturnType<typeof createMockIpcMain>

  beforeEach(async () => {
    mockExecFile.mockReset()
    mockAskPackageQuestion.mockReset()
    mockAskPackageQuestion.mockResolvedValue({ answer: 'mocked answer' })
    mockCancelPackageQuery.mockReset()
    mockCancelPackageQuery.mockReturnValue(true)
    vi.resetModules()

    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true })
    }
    fs.mkdirSync(TEST_DIR, { recursive: true })

    const { registerPackagesHandlers } = await import('../../src/main/ipc/packages')

    mockIpcMain = createMockIpcMain()
    registerPackagesHandlers(mockIpcMain as never)
  })

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  afterAll(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  it('enregistre les 6 handlers packages', () => {
    expect(mockIpcMain._handlers.has('packages:detect')).toBe(true)
    expect(mockIpcMain._handlers.has('packages:list')).toBe(true)
    expect(mockIpcMain._handlers.has('packages:update')).toBe(true)
    expect(mockIpcMain._handlers.has('packages:search')).toBe(true)
    expect(mockIpcMain._handlers.has('packages:nlAsk')).toBe(true)
    expect(mockIpcMain._handlers.has('packages:nlCancel')).toBe(true)
  })

  describe('packages:detect', () => {
    it('detecte un projet npm (package.json)', async () => {
      const projectDir = path.join(TEST_DIR, 'npm-project')
      fs.mkdirSync(projectDir, { recursive: true })
      fs.writeFileSync(
        path.join(projectDir, 'package.json'),
        JSON.stringify({ name: 'test', dependencies: { lodash: '4.0.0' } }),
      )

      const results = await mockIpcMain._invoke('packages:detect', {
        paths: [{ id: 'p1', path: projectDir, name: 'npm-project' }],
      })

      expect(results).toHaveLength(1)
      expect(results[0].manager).toBe('npm')
      expect(results[0].projectId).toBe('p1')
      expect(results[0].projectName).toBe('npm-project')
      expect(results[0].projectPath).toBe(projectDir)
    })

    it('detecte un projet go (go.mod)', async () => {
      const projectDir = path.join(TEST_DIR, 'go-project')
      fs.mkdirSync(projectDir, { recursive: true })
      fs.writeFileSync(path.join(projectDir, 'go.mod'), 'module example.com/mymod\n\ngo 1.21\n')

      const results = await mockIpcMain._invoke('packages:detect', {
        paths: [{ id: 'p2', path: projectDir, name: 'go-project' }],
      })

      expect(results).toHaveLength(1)
      expect(results[0].manager).toBe('go')
      expect(results[0].projectId).toBe('p2')
    })

    it('detecte un projet pip avec requirements.txt', async () => {
      const projectDir = path.join(TEST_DIR, 'pip-project-req')
      fs.mkdirSync(projectDir, { recursive: true })
      fs.writeFileSync(path.join(projectDir, 'requirements.txt'), 'flask==2.0.0\nrequests==2.28.0\n')

      const results = await mockIpcMain._invoke('packages:detect', {
        paths: [{ id: 'p3', path: projectDir, name: 'pip-project' }],
      })

      expect(results).toHaveLength(1)
      expect(results[0].manager).toBe('pip')
    })

    it('detecte un projet pip avec pyproject.toml', async () => {
      const projectDir = path.join(TEST_DIR, 'pip-project-pyp')
      fs.mkdirSync(projectDir, { recursive: true })
      fs.writeFileSync(path.join(projectDir, 'pyproject.toml'), '[project]\nname = "myapp"\n')

      const results = await mockIpcMain._invoke('packages:detect', {
        paths: [{ id: 'p4', path: projectDir, name: 'pip-pyproject' }],
      })

      expect(results).toHaveLength(1)
      expect(results[0].manager).toBe('pip')
    })

    it('detecte un projet cargo (Cargo.toml)', async () => {
      const projectDir = path.join(TEST_DIR, 'cargo-project')
      fs.mkdirSync(projectDir, { recursive: true })
      fs.writeFileSync(path.join(projectDir, 'Cargo.toml'), '[package]\nname = "myapp"\nversion = "0.1.0"\n')

      const results = await mockIpcMain._invoke('packages:detect', {
        paths: [{ id: 'p5', path: projectDir, name: 'cargo-project' }],
      })

      expect(results).toHaveLength(1)
      expect(results[0].manager).toBe('cargo')
    })

    it('detecte un projet nuget (*.csproj)', async () => {
      const projectDir = path.join(TEST_DIR, 'nuget-project')
      fs.mkdirSync(projectDir, { recursive: true })
      fs.writeFileSync(path.join(projectDir, 'MyApp.csproj'), '<Project Sdk="Microsoft.NET.Sdk"></Project>')

      const results = await mockIpcMain._invoke('packages:detect', {
        paths: [{ id: 'p6', path: projectDir, name: 'nuget-project' }],
      })

      expect(results).toHaveLength(1)
      expect(results[0].manager).toBe('nuget')
    })

    it('detecte un projet composer (composer.json)', async () => {
      const projectDir = path.join(TEST_DIR, 'composer-project')
      fs.mkdirSync(projectDir, { recursive: true })
      fs.writeFileSync(path.join(projectDir, 'composer.json'), JSON.stringify({ name: 'vendor/package' }))

      const results = await mockIpcMain._invoke('packages:detect', {
        paths: [{ id: 'p7', path: projectDir, name: 'composer-project' }],
      })

      expect(results).toHaveLength(1)
      expect(results[0].manager).toBe('composer')
    })

    it('detecte un projet bower (bower.json)', async () => {
      const projectDir = path.join(TEST_DIR, 'bower-project')
      fs.mkdirSync(projectDir, { recursive: true })
      fs.writeFileSync(path.join(projectDir, 'bower.json'), JSON.stringify({ name: 'my-bower-pkg' }))

      const results = await mockIpcMain._invoke('packages:detect', {
        paths: [{ id: 'p8', path: projectDir, name: 'bower-project' }],
      })

      expect(results).toHaveLength(1)
      expect(results[0].manager).toBe('bower')
    })

    it('detecte plusieurs managers dans un meme projet', async () => {
      const projectDir = path.join(TEST_DIR, 'multi-project')
      fs.mkdirSync(projectDir, { recursive: true })
      fs.writeFileSync(
        path.join(projectDir, 'package.json'),
        JSON.stringify({ name: 'multi', dependencies: {} }),
      )
      fs.writeFileSync(path.join(projectDir, 'go.mod'), 'module example.com/multi\n\ngo 1.21\n')

      const results = await mockIpcMain._invoke('packages:detect', {
        paths: [{ id: 'pm', path: projectDir, name: 'multi-project' }],
      })

      expect(results).toHaveLength(2)
      const managers = results.map((r: { manager: string }) => r.manager)
      expect(managers).toContain('npm')
      expect(managers).toContain('go')
    })

    it('retourne un tableau vide pour un chemin inexistant', async () => {
      const results = await mockIpcMain._invoke('packages:detect', {
        paths: [{ id: 'pz', path: '/nonexistent/path/that/does/not/exist', name: 'ghost' }],
      })

      expect(results).toEqual([])
    })

    it('retourne un tableau vide pour un dossier vide', async () => {
      const emptyDir = path.join(TEST_DIR, 'empty-project')
      fs.mkdirSync(emptyDir, { recursive: true })

      const results = await mockIpcMain._invoke('packages:detect', {
        paths: [{ id: 'pe', path: emptyDir, name: 'empty-project' }],
      })

      expect(results).toEqual([])
    })

    it('compte les dependences dans package.json', async () => {
      const projectDir = path.join(TEST_DIR, 'npm-deps')
      fs.mkdirSync(projectDir, { recursive: true })
      fs.writeFileSync(
        path.join(projectDir, 'package.json'),
        JSON.stringify({
          name: 'dep-counter',
          dependencies: { lodash: '4.0.0', express: '4.18.0', axios: '1.0.0' },
          devDependencies: { vitest: '1.0.0', typescript: '5.0.0' },
        }),
      )

      const results = await mockIpcMain._invoke('packages:detect', {
        paths: [{ id: 'pd', path: projectDir, name: 'npm-deps' }],
      })

      expect(results).toHaveLength(1)
      expect(results[0].manager).toBe('npm')
      expect(results[0].packageCount).toBe(5) // 3 deps + 2 devDeps
    })

    it('detecte les managers sur plusieurs projets a la fois', async () => {
      const npmDir = path.join(TEST_DIR, 'proj-npm')
      const goDir = path.join(TEST_DIR, 'proj-go')
      const cargoDir = path.join(TEST_DIR, 'proj-cargo')

      fs.mkdirSync(npmDir, { recursive: true })
      fs.mkdirSync(goDir, { recursive: true })
      fs.mkdirSync(cargoDir, { recursive: true })

      fs.writeFileSync(
        path.join(npmDir, 'package.json'),
        JSON.stringify({ name: 'npm-proj', dependencies: {} }),
      )
      fs.writeFileSync(path.join(goDir, 'go.mod'), 'module example.com/go\n')
      fs.writeFileSync(path.join(cargoDir, 'Cargo.toml'), '[package]\nname = "rs"\n')

      const results = await mockIpcMain._invoke('packages:detect', {
        paths: [
          { id: 'a1', path: npmDir, name: 'proj-npm' },
          { id: 'a2', path: goDir, name: 'proj-go' },
          { id: 'a3', path: cargoDir, name: 'proj-cargo' },
        ],
      })

      expect(results).toHaveLength(3)
      const managers = results.map((r: { manager: string }) => r.manager)
      expect(managers).toContain('npm')
      expect(managers).toContain('go')
      expect(managers).toContain('cargo')

      // Verify project IDs are preserved
      const npmResult = results.find((r: { manager: string }) => r.manager === 'npm')
      expect(npmResult.projectId).toBe('a1')
      const goResult = results.find((r: { manager: string }) => r.manager === 'go')
      expect(goResult.projectId).toBe('a2')
      const cargoResult = results.find((r: { manager: string }) => r.manager === 'cargo')
      expect(cargoResult.projectId).toBe('a3')
    })

    it('gere un package.json invalide en retournant packageCount a 0', async () => {
      const projectDir = path.join(TEST_DIR, 'bad-json')
      fs.mkdirSync(projectDir, { recursive: true })
      fs.writeFileSync(path.join(projectDir, 'package.json'), '{ invalid json }}}')

      const results = await mockIpcMain._invoke('packages:detect', {
        paths: [{ id: 'pj', path: projectDir, name: 'bad-json' }],
      })

      expect(results).toHaveLength(1)
      expect(results[0].manager).toBe('npm')
      expect(results[0].packageCount).toBe(0)
    })

    it('ne detecte pip qu une seule fois meme avec requirements.txt et pyproject.toml', async () => {
      const projectDir = path.join(TEST_DIR, 'pip-both')
      fs.mkdirSync(projectDir, { recursive: true })
      fs.writeFileSync(path.join(projectDir, 'requirements.txt'), 'flask==2.0.0\n')
      fs.writeFileSync(path.join(projectDir, 'pyproject.toml'), '[project]\nname = "dual"\n')

      const results = await mockIpcMain._invoke('packages:detect', {
        paths: [{ id: 'pb', path: projectDir, name: 'pip-both' }],
      })

      const pipResults = results.filter((r: { manager: string }) => r.manager === 'pip')
      expect(pipResults).toHaveLength(1)
    })
  })

  describe('packages:list', () => {
    it('retourne les packages npm via npm outdated', async () => {
      const projectDir = path.join(TEST_DIR, 'npm-list')
      fs.mkdirSync(projectDir, { recursive: true })
      fs.writeFileSync(
        path.join(projectDir, 'package.json'),
        JSON.stringify({
          name: 'list-test',
          dependencies: { lodash: '^4.17.0' },
          devDependencies: { vitest: '^1.0.0' },
        }),
      )

      // npm outdated returns exit code 1 when there ARE outdated packages
      mockExecFile.mockImplementation((_command: string, _args: string[], _opts?: unknown) => {
        return Promise.reject({
          stdout: JSON.stringify({
            lodash: { current: '4.17.21', wanted: '4.17.21', latest: '4.17.21' },
          }),
        })
      })

      const result = await mockIpcMain._invoke('packages:list', {
        projectPath: projectDir,
        manager: 'npm',
      })

      expect(result.packages).toBeInstanceOf(Array)
      expect(result.packages.length).toBeGreaterThan(0)
    })

    it('retourne un tableau vide pour un manager non-npm via search', async () => {
      mockExecFile.mockRejectedValue(new Error('command not found'))

      const result = await mockIpcMain._invoke('packages:search', {
        manager: 'go',
        query: 'test',
      })

      expect(result.results).toEqual([])
    })
  })

  describe('packages:update', () => {
    it('execute npm update pour un package specifique', async () => {
      mockExecFile.mockResolvedValue({ stdout: '', stderr: '' })

      const result = await mockIpcMain._invoke('packages:update', {
        projectPath: '/some/project',
        manager: 'npm',
        packageName: 'lodash',
      })

      expect(result).toEqual({ success: true })
    })

    it('retourne une erreur si la commande echoue', async () => {
      mockExecFile.mockRejectedValue({ stderr: 'permission denied', message: 'permission denied' })

      const result = await mockIpcMain._invoke('packages:update', {
        projectPath: '/some/project',
        manager: 'npm',
        packageName: 'lodash',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  describe('packages:search', () => {
    it('recherche des packages npm', async () => {
      mockExecFile.mockResolvedValue({
        stdout: JSON.stringify([
          { name: 'lodash', version: '4.17.21', description: 'Lodash library' },
          { name: 'lodash-es', version: '4.17.21', description: 'Lodash ES modules' },
        ]),
      })

      const result = await mockIpcMain._invoke('packages:search', {
        manager: 'npm',
        query: 'lodash',
      })

      expect(result.results).toHaveLength(2)
      expect(result.results[0].name).toBe('lodash')
      expect(result.results[1].name).toBe('lodash-es')
    })

    it('retourne un tableau vide pour les managers non-npm', async () => {
      const result = await mockIpcMain._invoke('packages:search', {
        manager: 'cargo',
        query: 'serde',
      })

      expect(result.results).toEqual([])
    })
  })

  describe('packages:nlAsk', () => {
    it('appelle askPackageQuestion et retourne la reponse', async () => {
      // nlPackages is mocked at module level
      // For npm list, we need package.json and mock execFile
      const projectDir = path.join(TEST_DIR, 'nl-ask')
      fs.mkdirSync(projectDir, { recursive: true })
      fs.writeFileSync(
        path.join(projectDir, 'package.json'),
        JSON.stringify({ name: 'nl-test', dependencies: {} }),
      )

      // Mock npm outdated to return empty (no outdated packages)
      mockExecFile.mockResolvedValue({ stdout: '{}' })

      const result = await mockIpcMain._invoke('packages:nlAsk', {
        projectPath: projectDir,
        manager: 'npm',
        question: 'What packages are outdated?',
        history: [],
      })

      expect(result).toBeDefined()
      expect(result.answer).toBe('mocked answer')
    })
  })

  describe('packages:nlCancel', () => {
    it('annule une requete NL en cours et retourne cancelled: true', async () => {
      const result = await mockIpcMain._invoke('packages:nlCancel')

      expect(result).toEqual({ cancelled: true })
    })
  })
})
