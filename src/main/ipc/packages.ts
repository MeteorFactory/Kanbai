import { IpcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import { IPC_CHANNELS, PackageInfo, PackageManagerType, PkgNlMessage, ProjectPackageManager } from '../../shared/types/index'
import { crossExecFile } from '../../shared/platform'
import { askPackageQuestion, cancelPackageQuery } from '../services/packages/nlPackages'

interface DetectInput {
  paths: Array<{ id: string; path: string; name: string }>
}

interface ListInput {
  projectPath: string
  manager: PackageManagerType
}

interface UpdateInput {
  projectPath: string
  manager: PackageManagerType
  packageName?: string
}

interface SearchInput {
  manager: PackageManagerType
  query: string
}

interface NlAskInput {
  projectPath: string
  manager: PackageManagerType
  question: string
  history: PkgNlMessage[]
}

function detectManagersInProject(project: { id: string; path: string; name: string }): ProjectPackageManager[] {
  const results: ProjectPackageManager[] = []
  const projectPath = project.path

  if (!fs.existsSync(projectPath)) {
    return results
  }

  // npm — package.json
  const packageJsonPath = path.join(projectPath, 'package.json')
  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
      const depCount = Object.keys(pkg.dependencies || {}).length + Object.keys(pkg.devDependencies || {}).length
      results.push({
        projectId: project.id,
        projectName: project.name,
        projectPath,
        manager: 'npm',
        packageCount: depCount,
      })
    } catch {
      results.push({
        projectId: project.id,
        projectName: project.name,
        projectPath,
        manager: 'npm',
        packageCount: 0,
      })
    }
  }

  // go — go.mod
  if (fs.existsSync(path.join(projectPath, 'go.mod'))) {
    results.push({
      projectId: project.id,
      projectName: project.name,
      projectPath,
      manager: 'go',
      packageCount: 0,
    })
  }

  // pip — requirements.txt or pyproject.toml
  if (fs.existsSync(path.join(projectPath, 'requirements.txt')) || fs.existsSync(path.join(projectPath, 'pyproject.toml'))) {
    results.push({
      projectId: project.id,
      projectName: project.name,
      projectPath,
      manager: 'pip',
      packageCount: 0,
    })
  }

  // cargo — Cargo.toml
  if (fs.existsSync(path.join(projectPath, 'Cargo.toml'))) {
    results.push({
      projectId: project.id,
      projectName: project.name,
      projectPath,
      manager: 'cargo',
      packageCount: 0,
    })
  }

  // nuget — *.csproj
  try {
    const files = fs.readdirSync(projectPath)
    const hasCsproj = files.some((f) => f.endsWith('.csproj'))
    if (hasCsproj) {
      results.push({
        projectId: project.id,
        projectName: project.name,
        projectPath,
        manager: 'nuget',
        packageCount: 0,
      })
    }
  } catch {
    // Directory not readable — skip nuget detection
  }

  // composer — composer.json
  if (fs.existsSync(path.join(projectPath, 'composer.json'))) {
    results.push({
      projectId: project.id,
      projectName: project.name,
      projectPath,
      manager: 'composer',
      packageCount: 0,
    })
  }

  // bower — bower.json
  if (fs.existsSync(path.join(projectPath, 'bower.json'))) {
    results.push({
      projectId: project.id,
      projectName: project.name,
      projectPath,
      manager: 'bower',
      packageCount: 0,
    })
  }

  return results
}

async function listNpmPackages(projectPath: string): Promise<PackageInfo[]> {
  const pkgPath = path.join(projectPath, 'package.json')
  if (!fs.existsSync(pkgPath)) {
    return []
  }

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    const allDeps: Record<string, string> = { ...pkg.dependencies }
    const allDevDeps: Record<string, string> = { ...pkg.devDependencies }

    let outdatedData: Record<string, { current: string; wanted: string; latest: string; deprecated?: string }> = {}
    try {
      const { stdout } = await crossExecFile('npm', ['outdated', '--json'], { cwd: projectPath, timeout: 30000 })
      outdatedData = JSON.parse(stdout || '{}')
    } catch (err: unknown) {
      // npm outdated returns exit code 1 when there ARE outdated packages — this is normal
      const execErr = err as { stdout?: string }
      if (execErr.stdout) {
        outdatedData = JSON.parse(execErr.stdout || '{}')
      }
    }

    const packages: PackageInfo[] = []
    const addPackages = (deps: Record<string, string>, type: 'dependency' | 'devDependency') => {
      for (const [name, version] of Object.entries(deps)) {
        const outdated = outdatedData[name]
        const info: PackageInfo = {
          name,
          currentVersion: outdated?.current || version.replace(/^[\^~]/, ''),
          latestVersion: outdated?.latest || null,
          isDeprecated: !!outdated?.deprecated,
          updateAvailable: !!outdated?.latest && outdated.current !== outdated.latest,
          type,
        }
        if (outdated?.deprecated) {
          info.deprecationMessage = outdated.deprecated
        }
        packages.push(info)
      }
    }
    addPackages(allDeps, 'dependency')
    addPackages(allDevDeps, 'devDependency')

    return packages
  } catch {
    return []
  }
}

async function listGoPackages(projectPath: string): Promise<PackageInfo[]> {
  try {
    const { stdout } = await crossExecFile('go', ['list', '-m', '-u', '-json', 'all'], {
      cwd: projectPath,
      timeout: 60000,
    })

    // go list -m -u -json outputs concatenated JSON objects (not an array)
    const packages: PackageInfo[] = []
    const jsonObjects = stdout.split('\n}\n').filter((s) => s.trim())

    for (const jsonStr of jsonObjects) {
      try {
        const raw = jsonStr.trim().endsWith('}') ? jsonStr.trim() : jsonStr.trim() + '}'
        const mod = JSON.parse(raw)

        // Skip the main module itself
        if (mod.Main) continue

        const updateVersion = mod.Update?.Version || null
        packages.push({
          name: mod.Path,
          currentVersion: mod.Version || '0.0.0',
          latestVersion: updateVersion,
          updateAvailable: !!updateVersion,
          isDeprecated: !!mod.Deprecated,
          deprecationMessage: mod.Deprecated || undefined,
          type: mod.Indirect ? 'dependency' : 'module',
        })
      } catch {
        // Skip malformed JSON fragments
      }
    }

    return packages
  } catch {
    return []
  }
}

async function listPipPackages(projectPath: string): Promise<PackageInfo[]> {
  try {
    const { stdout } = await crossExecFile('pip', ['list', '--outdated', '--format=json'], {
      cwd: projectPath,
      timeout: 30000,
    })

    const outdated: Array<{ name: string; version: string; latest_version: string; latest_filetype: string }> =
      JSON.parse(stdout || '[]')

    return outdated.map((pkg) => ({
      name: pkg.name,
      currentVersion: pkg.version,
      latestVersion: pkg.latest_version,
      updateAvailable: true,
      isDeprecated: false,
      type: 'dependency' as const,
    }))
  } catch {
    return []
  }
}

async function listCargoPackages(projectPath: string): Promise<PackageInfo[]> {
  try {
    const { stdout } = await crossExecFile('cargo', ['outdated', '--format', 'json'], {
      cwd: projectPath,
      timeout: 60000,
    })

    const data = JSON.parse(stdout || '{}')
    const dependencies = data.dependencies || []
    return dependencies.map((dep: { name: string; project: string; latest: string }) => ({
      name: dep.name,
      currentVersion: dep.project,
      latestVersion: dep.latest,
      updateAvailable: dep.project !== dep.latest,
      isDeprecated: false,
      type: 'dependency' as const,
    }))
  } catch {
    return []
  }
}

async function listNugetPackages(projectPath: string): Promise<PackageInfo[]> {
  try {
    const { stdout } = await crossExecFile('dotnet', ['list', 'package', '--outdated', '--format', 'json'], {
      cwd: projectPath,
      timeout: 60000,
    })

    const data = JSON.parse(stdout || '{}')
    const packages: PackageInfo[] = []

    const projects = data.projects || []
    for (const project of projects) {
      const frameworks = project.frameworks || []
      for (const framework of frameworks) {
        const topLevelPackages = framework.topLevelPackages || []
        for (const pkg of topLevelPackages) {
          // Avoid duplicates across frameworks
          if (!packages.some((p) => p.name === pkg.id)) {
            packages.push({
              name: pkg.id,
              currentVersion: pkg.resolvedVersion || pkg.requestedVersion || '0.0.0',
              latestVersion: pkg.latestVersion || null,
              updateAvailable: !!pkg.latestVersion && pkg.resolvedVersion !== pkg.latestVersion,
              isDeprecated: false,
              type: 'dependency',
            })
          }
        }
      }
    }

    return packages
  } catch {
    return []
  }
}

async function listComposerPackages(projectPath: string): Promise<PackageInfo[]> {
  try {
    const { stdout } = await crossExecFile('composer', ['outdated', '--format=json'], {
      cwd: projectPath,
      timeout: 60000,
    })

    const data = JSON.parse(stdout || '{}')
    const installed = data.installed || []

    return installed.map((pkg: { name: string; version: string; latest: string; 'latest-status': string; abandoned?: string }) => ({
      name: pkg.name,
      currentVersion: pkg.version,
      latestVersion: pkg.latest || null,
      updateAvailable: pkg['latest-status'] !== 'up-to-date',
      isDeprecated: !!pkg.abandoned,
      deprecationMessage: pkg.abandoned ? `Abandoned: ${pkg.abandoned}` : undefined,
      type: 'dependency' as const,
    }))
  } catch {
    return []
  }
}

async function listBowerPackages(projectPath: string): Promise<PackageInfo[]> {
  try {
    const { stdout } = await crossExecFile('bower', ['list', '--json'], {
      cwd: projectPath,
      timeout: 30000,
    })

    const data = JSON.parse(stdout || '{}')
    const packages: PackageInfo[] = []
    const deps = data.dependencies || {}

    for (const [name, dep] of Object.entries(deps)) {
      const depInfo = dep as { pkgMeta?: { version?: string }; update?: { latest?: string } }
      const currentVersion = depInfo.pkgMeta?.version || '0.0.0'
      const latestVersion = depInfo.update?.latest || null
      packages.push({
        name,
        currentVersion,
        latestVersion,
        updateAvailable: !!latestVersion && currentVersion !== latestVersion,
        isDeprecated: false,
        type: 'dependency',
      })
    }

    return packages
  } catch {
    return []
  }
}

/**
 * Get the currently installed version of an npm package by reading its package.json in node_modules.
 */
function getInstalledNpmVersion(projectPath: string, packageName: string): string | null {
  try {
    const pkgJsonPath = path.join(projectPath, 'node_modules', packageName, 'package.json')
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'))
    return pkg.version ?? null
  } catch {
    return null
  }
}

async function updateNpmPackage(projectPath: string, packageName: string): Promise<{ success: boolean; error?: string; versionBefore?: string | null; versionAfter?: string | null }> {
  const versionBefore = getInstalledNpmVersion(projectPath, packageName)
  const args = ['install', `${packageName}@latest`]

  try {
    await crossExecFile('npm', args, { cwd: projectPath, timeout: 120000 })
  } catch (installErr: unknown) {
    const errMsg = String((installErr as { stderr?: string }).stderr ?? '')
    if (errMsg.includes('ERESOLVE') || errMsg.includes('peer dep') || errMsg.includes('Could not resolve dependency')) {
      await crossExecFile('npm', [...args, '--legacy-peer-deps'], { cwd: projectPath, timeout: 120000 })
    } else {
      throw installErr
    }
  }

  const versionAfter = getInstalledNpmVersion(projectPath, packageName)
  const result: { success: boolean; versionBefore?: string | null; versionAfter?: string | null } = { success: true }
  if (versionBefore !== null || versionAfter !== null) {
    result.versionBefore = versionBefore
    result.versionAfter = versionAfter
  }
  return result
}

async function updateAllNpmPackages(projectPath: string): Promise<{ success: boolean; error?: string }> {
  try {
    await crossExecFile('npm', ['update'], { cwd: projectPath, timeout: 120000 })
  } catch (installErr: unknown) {
    const errMsg = String((installErr as { stderr?: string }).stderr ?? '')
    if (errMsg.includes('ERESOLVE') || errMsg.includes('peer dep') || errMsg.includes('Could not resolve dependency')) {
      await crossExecFile('npm', ['update', '--legacy-peer-deps'], { cwd: projectPath, timeout: 120000 })
    } else {
      throw installErr
    }
  }
  return { success: true }
}

async function updatePackage(projectPath: string, manager: PackageManagerType, packageName?: string): Promise<{ success: boolean; error?: string; versionBefore?: string | null; versionAfter?: string | null }> {
  try {
    switch (manager) {
      case 'npm':
        if (packageName) {
          return await updateNpmPackage(projectPath, packageName)
        }
        // Update all: escalating fallback chain
        return await updateAllNpmPackages(projectPath)
      case 'go':
        await crossExecFile('go', packageName ? ['get', '-u', packageName] : ['get', '-u', './...'], {
          cwd: projectPath,
          timeout: 120000,
        })
        return { success: true }
      case 'pip':
        await crossExecFile(
          'pip',
          packageName ? ['install', '--upgrade', packageName] : ['install', '--upgrade', '-r', 'requirements.txt'],
          { cwd: projectPath, timeout: 120000 },
        )
        return { success: true }
      case 'cargo':
        await crossExecFile('cargo', packageName ? ['update', '-p', packageName] : ['update'], {
          cwd: projectPath,
          timeout: 120000,
        })
        return { success: true }
      case 'nuget':
        await crossExecFile('dotnet', packageName ? ['add', 'package', packageName] : ['restore'], {
          cwd: projectPath,
          timeout: 120000,
        })
        return { success: true }
      case 'composer':
        await crossExecFile('composer', packageName ? ['update', packageName] : ['update'], {
          cwd: projectPath,
          timeout: 120000,
        })
        return { success: true }
      case 'bower':
        await crossExecFile('bower', packageName ? ['update', packageName] : ['update'], {
          cwd: projectPath,
          timeout: 120000,
        })
        return { success: true }
    }

    return { success: true }
  } catch (err: unknown) {
    const execErr = err as { stderr?: string; message?: string }
    return { success: false, error: execErr.stderr || execErr.message || `${manager} update failed` }
  }
}

async function searchPackages(manager: PackageManagerType, query: string): Promise<PackageInfo[]> {
  if (manager !== 'npm') {
    // Most registries do not have a simple CLI search — return empty for non-npm
    return []
  }

  try {
    const { stdout } = await crossExecFile('npm', ['search', '--json', query], { timeout: 15000 })
    const results: Array<{ name: string; version: string; description: string }> = JSON.parse(stdout || '[]')

    return results.map((pkg) => ({
      name: pkg.name,
      currentVersion: pkg.version,
      latestVersion: pkg.version,
      updateAvailable: false,
      isDeprecated: false,
      type: 'dependency' as const,
    }))
  } catch {
    return []
  }
}

export function registerPackagesHandlers(ipcMain: IpcMain): void {
  // Detect which package managers are present across project paths
  ipcMain.handle(
    IPC_CHANNELS.PACKAGES_DETECT,
    async (_event, { paths: projectPaths }: DetectInput): Promise<ProjectPackageManager[]> => {
      const results: ProjectPackageManager[] = []
      for (const project of projectPaths) {
        const managers = detectManagersInProject(project)
        results.push(...managers)
      }
      return results
    },
  )

  // List packages for a project + manager combination
  ipcMain.handle(
    IPC_CHANNELS.PACKAGES_LIST,
    async (_event, { projectPath, manager }: ListInput): Promise<{ packages: PackageInfo[] }> => {
      let packages: PackageInfo[] = []

      switch (manager) {
        case 'npm':
          packages = await listNpmPackages(projectPath)
          break
        case 'go':
          packages = await listGoPackages(projectPath)
          break
        case 'pip':
          packages = await listPipPackages(projectPath)
          break
        case 'cargo':
          packages = await listCargoPackages(projectPath)
          break
        case 'nuget':
          packages = await listNugetPackages(projectPath)
          break
        case 'composer':
          packages = await listComposerPackages(projectPath)
          break
        case 'bower':
          packages = await listBowerPackages(projectPath)
          break
      }

      return { packages }
    },
  )

  // Update a specific package or all packages for a given manager
  ipcMain.handle(
    IPC_CHANNELS.PACKAGES_UPDATE,
    async (_event, { projectPath, manager, packageName }: UpdateInput): Promise<{ success: boolean; error?: string }> => {
      return updatePackage(projectPath, manager, packageName)
    },
  )

  // Search for packages in registries
  ipcMain.handle(
    IPC_CHANNELS.PACKAGES_SEARCH,
    async (_event, { manager, query }: SearchInput): Promise<{ results: PackageInfo[] }> => {
      const results = await searchPackages(manager, query)
      return { results }
    },
  )

  // Natural language: ask a question about packages
  ipcMain.handle(
    IPC_CHANNELS.PACKAGES_NL_ASK,
    async (
      _event,
      { projectPath, manager, question, history }: NlAskInput,
    ): Promise<{ answer: string; action?: { type: 'update'; packages: string[] } }> => {
      // Load the current packages list to provide as context
      let packages: PackageInfo[] = []

      switch (manager) {
        case 'npm':
          packages = await listNpmPackages(projectPath)
          break
        case 'go':
          packages = await listGoPackages(projectPath)
          break
        case 'pip':
          packages = await listPipPackages(projectPath)
          break
        case 'cargo':
          packages = await listCargoPackages(projectPath)
          break
        case 'nuget':
          packages = await listNugetPackages(projectPath)
          break
        case 'composer':
          packages = await listComposerPackages(projectPath)
          break
        case 'bower':
          packages = await listBowerPackages(projectPath)
          break
      }

      return askPackageQuestion(projectPath, manager, question, history, packages)
    },
  )

  // Natural language: cancel an active package query
  ipcMain.handle(
    IPC_CHANNELS.PACKAGES_NL_CANCEL,
    async (): Promise<{ cancelled: boolean }> => {
      return { cancelled: cancelPackageQuery() }
    },
  )
}
