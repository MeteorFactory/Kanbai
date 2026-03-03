import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { createMockIpcMain } from '../mocks/electron'

const TEST_DIR = path.join(os.tmpdir(), `.kanbai-claudeDefaults-ipc-test-${process.pid}-${Date.now()}`)
const dataDir = path.join(TEST_DIR, '.kanbai')

// Redirect StorageService homedir to temp directory so it does not touch real data
vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os')
  return {
    ...actual,
    default: {
      ...actual,
      homedir: () => TEST_DIR,
    },
    homedir: () => TEST_DIR,
  }
})

describe('Claude Defaults IPC Handlers', () => {
  let mockIpcMain: ReturnType<typeof createMockIpcMain>
  let projectPath: string

  beforeEach(async () => {
    vi.resetModules()

    // Ensure data directory exists for StorageService
    if (fs.existsSync(dataDir)) {
      fs.rmSync(dataDir, { recursive: true, force: true })
    }
    fs.mkdirSync(dataDir, { recursive: true })

    // Create a unique temp project path per test
    projectPath = path.join(TEST_DIR, `project-${Date.now()}`)
    fs.mkdirSync(projectPath, { recursive: true })

    // Reset singleton before each test
    const { _resetForTesting } = await import('../../src/main/services/storage')
    _resetForTesting()

    const { registerClaudeDefaultsHandlers } = await import('../../src/main/ipc/claudeDefaults')

    mockIpcMain = createMockIpcMain()
    registerClaudeDefaultsHandlers(mockIpcMain as never)
  })

  afterEach(() => {
    if (fs.existsSync(projectPath)) {
      fs.rmSync(projectPath, { recursive: true, force: true })
    }
  })

  afterAll(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  it('enregistre les 5 handlers claude defaults', () => {
    expect(mockIpcMain._handlers.has('claude:defaultsProfiles')).toBe(true)
    expect(mockIpcMain._handlers.has('claude:defaultsSkills')).toBe(true)
    expect(mockIpcMain._handlers.has('claude:deployProfile')).toBe(true)
    expect(mockIpcMain._handlers.has('claude:deploySkill')).toBe(true)
    expect(mockIpcMain._handlers.has('claude:checkDeployed')).toBe(true)
  })

  describe('claude:defaultsProfiles', () => {
    it('retourne les profils pour la locale par defaut (fr)', async () => {
      const profiles = await mockIpcMain._invoke('claude:defaultsProfiles')

      expect(Array.isArray(profiles)).toBe(true)
      expect(profiles.length).toBeGreaterThan(0)

      // Verify all profiles have the required shape
      for (const profile of profiles) {
        expect(profile).toHaveProperty('id')
        expect(profile).toHaveProperty('name')
        expect(profile).toHaveProperty('description')
        expect(profile).toHaveProperty('category')
        expect(profile).toHaveProperty('content')
        expect(profile).toHaveProperty('filename')
        expect(typeof profile.id).toBe('string')
        expect(typeof profile.content).toBe('string')
        expect(typeof profile.filename).toBe('string')
      }
    })

    it('contient les profils connus en francais', async () => {
      const profiles = await mockIpcMain._invoke('claude:defaultsProfiles')
      const profileIds = profiles.map((p: { id: string }) => p.id)

      expect(profileIds).toContain('code-reviewer')
      expect(profileIds).toContain('debugger')
      expect(profileIds).toContain('code-refactorer')
      expect(profileIds).toContain('security-auditor')
      expect(profileIds).toContain('frontend-designer')
      expect(profileIds).toContain('project-planner')
      expect(profileIds).toContain('doc-writer')
    })

    it('retourne les profils en francais avec les noms localises', async () => {
      const profiles = await mockIpcMain._invoke('claude:defaultsProfiles')
      const codeReviewer = profiles.find((p: { id: string }) => p.id === 'code-reviewer')

      expect(codeReviewer).toBeDefined()
      expect(codeReviewer.name).toBe('Revue de code')
    })

    it('retourne les profils en anglais quand la locale est en', async () => {
      // Change locale to 'en' via StorageService
      const { StorageService } = await import('../../src/main/services/storage')
      const storage = new StorageService()
      storage.updateSettings({ locale: 'en' })

      const profiles = await mockIpcMain._invoke('claude:defaultsProfiles')
      const codeReviewer = profiles.find((p: { id: string }) => p.id === 'code-reviewer')

      expect(codeReviewer).toBeDefined()
      expect(codeReviewer.name).toBe('Code Reviewer')
    })
  })

  describe('claude:defaultsSkills', () => {
    it('retourne les skills pour la locale par defaut (fr)', async () => {
      const skills = await mockIpcMain._invoke('claude:defaultsSkills')

      expect(Array.isArray(skills)).toBe(true)
      expect(skills.length).toBeGreaterThan(0)

      for (const skill of skills) {
        expect(skill).toHaveProperty('id')
        expect(skill).toHaveProperty('name')
        expect(skill).toHaveProperty('description')
        expect(skill).toHaveProperty('category')
        expect(skill).toHaveProperty('content')
        expect(skill).toHaveProperty('filename')
        expect(typeof skill.id).toBe('string')
        expect(typeof skill.content).toBe('string')
        expect(typeof skill.filename).toBe('string')
      }
    })

    it('contient les skills connus en francais', async () => {
      const skills = await mockIpcMain._invoke('claude:defaultsSkills')
      const skillIds = skills.map((s: { id: string }) => s.id)

      expect(skillIds).toContain('commit')
      expect(skillIds).toContain('fix-issue')
      expect(skillIds).toContain('pr-review')
      expect(skillIds).toContain('refactor')
      expect(skillIds).toContain('test')
      expect(skillIds).toContain('explain-code')
      expect(skillIds).toContain('debug')
      expect(skillIds).toContain('doc-generate')
      expect(skillIds).toContain('security-scan')
      expect(skillIds).toContain('deploy-checklist')
    })

    it('retourne les skills en anglais quand la locale est en', async () => {
      const { StorageService } = await import('../../src/main/services/storage')
      const storage = new StorageService()
      storage.updateSettings({ locale: 'en' })

      const skills = await mockIpcMain._invoke('claude:defaultsSkills')
      const commit = skills.find((s: { id: string }) => s.id === 'commit')

      expect(commit).toBeDefined()
      expect(commit.description).toBe('Generate a commit message automatically')
    })
  })

  describe('claude:deployProfile', () => {
    it('deploie un profil dans le dossier .claude/agents/', async () => {
      const result = await mockIpcMain._invoke('claude:deployProfile', {
        projectPath,
        profileId: 'code-reviewer',
      })

      expect(result).toEqual({ success: true })

      const deployedPath = path.join(projectPath, '.claude', 'agents', 'code-reviewer.md')
      expect(fs.existsSync(deployedPath)).toBe(true)

      const content = fs.readFileSync(deployedPath, 'utf-8')
      expect(content.length).toBeGreaterThan(0)
      // The french version should contain the french text
      expect(content).toContain('Agent de revue de code')
    })

    it('cree le dossier .claude/agents/ si inexistant', async () => {
      const agentsDir = path.join(projectPath, '.claude', 'agents')
      expect(fs.existsSync(agentsDir)).toBe(false)

      await mockIpcMain._invoke('claude:deployProfile', {
        projectPath,
        profileId: 'debugger',
      })

      expect(fs.existsSync(agentsDir)).toBe(true)
      expect(fs.existsSync(path.join(agentsDir, 'debugger.md'))).toBe(true)
    })

    it('retourne une erreur pour un profil inexistant', async () => {
      const result = await mockIpcMain._invoke('claude:deployProfile', {
        projectPath,
        profileId: 'nonexistent-profile',
      })

      expect(result).toEqual({ success: false, error: 'Profile not found' })

      // No files should have been created
      const agentsDir = path.join(projectPath, '.claude', 'agents')
      expect(fs.existsSync(agentsDir)).toBe(false)
    })

    it('ecrase un profil deja deploye', async () => {
      // Deploy once
      await mockIpcMain._invoke('claude:deployProfile', {
        projectPath,
        profileId: 'code-reviewer',
      })

      const deployedPath = path.join(projectPath, '.claude', 'agents', 'code-reviewer.md')
      const firstContent = fs.readFileSync(deployedPath, 'utf-8')

      // Deploy again (should overwrite without error)
      const result = await mockIpcMain._invoke('claude:deployProfile', {
        projectPath,
        profileId: 'code-reviewer',
      })

      expect(result).toEqual({ success: true })
      const secondContent = fs.readFileSync(deployedPath, 'utf-8')
      expect(secondContent).toBe(firstContent)
    })

    it('deploie plusieurs profils dans le meme dossier', async () => {
      await mockIpcMain._invoke('claude:deployProfile', {
        projectPath,
        profileId: 'code-reviewer',
      })
      await mockIpcMain._invoke('claude:deployProfile', {
        projectPath,
        profileId: 'debugger',
      })
      await mockIpcMain._invoke('claude:deployProfile', {
        projectPath,
        profileId: 'security-auditor',
      })

      const agentsDir = path.join(projectPath, '.claude', 'agents')
      const files = fs.readdirSync(agentsDir)
      expect(files).toContain('code-reviewer.md')
      expect(files).toContain('debugger.md')
      expect(files).toContain('security-auditor.md')
      expect(files).toHaveLength(3)
    })

    it('deploie le profil correspondant a la locale en cours', async () => {
      // Switch to english locale
      const { StorageService } = await import('../../src/main/services/storage')
      const storage = new StorageService()
      storage.updateSettings({ locale: 'en' })

      await mockIpcMain._invoke('claude:deployProfile', {
        projectPath,
        profileId: 'code-reviewer',
      })

      const deployedPath = path.join(projectPath, '.claude', 'agents', 'code-reviewer.md')
      const content = fs.readFileSync(deployedPath, 'utf-8')
      // English content should be deployed
      expect(content).toContain('You are a Code Reviewer agent')
    })
  })

  describe('claude:deploySkill', () => {
    it('deploie un skill dans le dossier .claude/commands/', async () => {
      const result = await mockIpcMain._invoke('claude:deploySkill', {
        projectPath,
        skillId: 'commit',
      })

      expect(result).toEqual({ success: true })

      const deployedPath = path.join(projectPath, '.claude', 'commands', 'commit.md')
      expect(fs.existsSync(deployedPath)).toBe(true)

      const content = fs.readFileSync(deployedPath, 'utf-8')
      expect(content.length).toBeGreaterThan(0)
      // French version
      expect(content).toContain('Conventional Commits')
    })

    it('cree le dossier .claude/commands/ si inexistant', async () => {
      const commandsDir = path.join(projectPath, '.claude', 'commands')
      expect(fs.existsSync(commandsDir)).toBe(false)

      await mockIpcMain._invoke('claude:deploySkill', {
        projectPath,
        skillId: 'debug',
      })

      expect(fs.existsSync(commandsDir)).toBe(true)
      expect(fs.existsSync(path.join(commandsDir, 'debug.md'))).toBe(true)
    })

    it('retourne une erreur pour un skill inexistant', async () => {
      const result = await mockIpcMain._invoke('claude:deploySkill', {
        projectPath,
        skillId: 'nonexistent-skill',
      })

      expect(result).toEqual({ success: false, error: 'Skill not found' })

      // No files should have been created
      const commandsDir = path.join(projectPath, '.claude', 'commands')
      expect(fs.existsSync(commandsDir)).toBe(false)
    })

    it('ecrase un skill deja deploye', async () => {
      await mockIpcMain._invoke('claude:deploySkill', {
        projectPath,
        skillId: 'commit',
      })

      const deployedPath = path.join(projectPath, '.claude', 'commands', 'commit.md')
      const firstContent = fs.readFileSync(deployedPath, 'utf-8')

      const result = await mockIpcMain._invoke('claude:deploySkill', {
        projectPath,
        skillId: 'commit',
      })

      expect(result).toEqual({ success: true })
      const secondContent = fs.readFileSync(deployedPath, 'utf-8')
      expect(secondContent).toBe(firstContent)
    })

    it('deploie plusieurs skills dans le meme dossier', async () => {
      await mockIpcMain._invoke('claude:deploySkill', {
        projectPath,
        skillId: 'commit',
      })
      await mockIpcMain._invoke('claude:deploySkill', {
        projectPath,
        skillId: 'debug',
      })
      await mockIpcMain._invoke('claude:deploySkill', {
        projectPath,
        skillId: 'test',
      })

      const commandsDir = path.join(projectPath, '.claude', 'commands')
      const files = fs.readdirSync(commandsDir)
      expect(files).toContain('commit.md')
      expect(files).toContain('debug.md')
      expect(files).toContain('test.md')
      expect(files).toHaveLength(3)
    })

    it('deploie le skill correspondant a la locale en cours', async () => {
      const { StorageService } = await import('../../src/main/services/storage')
      const storage = new StorageService()
      storage.updateSettings({ locale: 'en' })

      await mockIpcMain._invoke('claude:deploySkill', {
        projectPath,
        skillId: 'commit',
      })

      const deployedPath = path.join(projectPath, '.claude', 'commands', 'commit.md')
      const content = fs.readFileSync(deployedPath, 'utf-8')
      // English content should be deployed
      expect(content).toContain('Analyze the current staged changes')
    })
  })

  describe('claude:checkDeployed', () => {
    it('retourne des listes vides quand rien n est deploye', async () => {
      const result = await mockIpcMain._invoke('claude:checkDeployed', { projectPath })

      expect(result).toEqual({
        deployedProfiles: [],
        deployedSkills: [],
      })
    })

    it('detecte les profils deployes', async () => {
      // Deploy two profiles
      await mockIpcMain._invoke('claude:deployProfile', {
        projectPath,
        profileId: 'code-reviewer',
      })
      await mockIpcMain._invoke('claude:deployProfile', {
        projectPath,
        profileId: 'debugger',
      })

      const result = await mockIpcMain._invoke('claude:checkDeployed', { projectPath })

      expect(result.deployedProfiles).toContain('code-reviewer')
      expect(result.deployedProfiles).toContain('debugger')
      expect(result.deployedProfiles).toHaveLength(2)
      expect(result.deployedSkills).toHaveLength(0)
    })

    it('detecte les skills deployes', async () => {
      await mockIpcMain._invoke('claude:deploySkill', {
        projectPath,
        skillId: 'commit',
      })
      await mockIpcMain._invoke('claude:deploySkill', {
        projectPath,
        skillId: 'test',
      })
      await mockIpcMain._invoke('claude:deploySkill', {
        projectPath,
        skillId: 'debug',
      })

      const result = await mockIpcMain._invoke('claude:checkDeployed', { projectPath })

      expect(result.deployedProfiles).toHaveLength(0)
      expect(result.deployedSkills).toContain('commit')
      expect(result.deployedSkills).toContain('test')
      expect(result.deployedSkills).toContain('debug')
      expect(result.deployedSkills).toHaveLength(3)
    })

    it('detecte un mix de profils et skills deployes', async () => {
      await mockIpcMain._invoke('claude:deployProfile', {
        projectPath,
        profileId: 'security-auditor',
      })
      await mockIpcMain._invoke('claude:deploySkill', {
        projectPath,
        skillId: 'security-scan',
      })

      const result = await mockIpcMain._invoke('claude:checkDeployed', { projectPath })

      expect(result.deployedProfiles).toEqual(['security-auditor'])
      expect(result.deployedSkills).toEqual(['security-scan'])
    })

    it('ne detecte pas un profil dont le fichier a ete supprime manuellement', async () => {
      await mockIpcMain._invoke('claude:deployProfile', {
        projectPath,
        profileId: 'code-reviewer',
      })

      // Manually delete the deployed file
      const deployedPath = path.join(projectPath, '.claude', 'agents', 'code-reviewer.md')
      fs.unlinkSync(deployedPath)

      const result = await mockIpcMain._invoke('claude:checkDeployed', { projectPath })

      expect(result.deployedProfiles).toHaveLength(0)
    })

    it('detecte les fichiers meme si deployes par un autre processus', async () => {
      // Simulate files created externally (not through the IPC handler)
      const agentsDir = path.join(projectPath, '.claude', 'agents')
      const commandsDir = path.join(projectPath, '.claude', 'commands')
      fs.mkdirSync(agentsDir, { recursive: true })
      fs.mkdirSync(commandsDir, { recursive: true })

      // Create files matching known profile/skill filenames
      fs.writeFileSync(path.join(agentsDir, 'debugger.md'), 'custom content', 'utf-8')
      fs.writeFileSync(path.join(commandsDir, 'refactor.md'), 'custom content', 'utf-8')

      const result = await mockIpcMain._invoke('claude:checkDeployed', { projectPath })

      expect(result.deployedProfiles).toContain('debugger')
      expect(result.deployedSkills).toContain('refactor')
    })

    it('ignore les fichiers qui ne correspondent a aucun profil ou skill connu', async () => {
      const agentsDir = path.join(projectPath, '.claude', 'agents')
      const commandsDir = path.join(projectPath, '.claude', 'commands')
      fs.mkdirSync(agentsDir, { recursive: true })
      fs.mkdirSync(commandsDir, { recursive: true })

      // Create files with names not matching any known profile/skill
      fs.writeFileSync(path.join(agentsDir, 'custom-agent.md'), 'content', 'utf-8')
      fs.writeFileSync(path.join(commandsDir, 'custom-command.md'), 'content', 'utf-8')

      const result = await mockIpcMain._invoke('claude:checkDeployed', { projectPath })

      expect(result.deployedProfiles).toHaveLength(0)
      expect(result.deployedSkills).toHaveLength(0)
    })
  })

  describe('workflow complet : deploiement puis verification', () => {
    it('deploie tous les profils et skills puis verifie le resultat', async () => {
      // Get all available profiles and skills
      const profiles = await mockIpcMain._invoke('claude:defaultsProfiles')
      const skills = await mockIpcMain._invoke('claude:defaultsSkills')

      // Deploy all profiles
      for (const profile of profiles) {
        const result = await mockIpcMain._invoke('claude:deployProfile', {
          projectPath,
          profileId: profile.id,
        })
        expect(result).toEqual({ success: true })
      }

      // Deploy all skills
      for (const skill of skills) {
        const result = await mockIpcMain._invoke('claude:deploySkill', {
          projectPath,
          skillId: skill.id,
        })
        expect(result).toEqual({ success: true })
      }

      // Check all are detected
      const deployed = await mockIpcMain._invoke('claude:checkDeployed', { projectPath })

      expect(deployed.deployedProfiles).toHaveLength(profiles.length)
      expect(deployed.deployedSkills).toHaveLength(skills.length)

      // Verify each profile ID is present
      for (const profile of profiles) {
        expect(deployed.deployedProfiles).toContain(profile.id)
      }

      // Verify each skill ID is present
      for (const skill of skills) {
        expect(deployed.deployedSkills).toContain(skill.id)
      }
    })

    it('le contenu des fichiers deployes correspond exactement aux constantes', async () => {
      const profiles = await mockIpcMain._invoke('claude:defaultsProfiles')
      const firstProfile = profiles[0]

      await mockIpcMain._invoke('claude:deployProfile', {
        projectPath,
        profileId: firstProfile.id,
      })

      const deployedPath = path.join(projectPath, '.claude', 'agents', firstProfile.filename)
      const fileContent = fs.readFileSync(deployedPath, 'utf-8')

      expect(fileContent).toBe(firstProfile.content)
    })
  })
})
