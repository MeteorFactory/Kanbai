import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import type { Workspace, Project, KanbanTask, AutoClauderTemplate } from '../../src/shared/types'
import { DEFAULT_SETTINGS } from '../../src/shared/constants/defaults'

// We need to mock the DATA_DIR before importing StorageService
const TEST_DIR = path.join(os.tmpdir(), `.kanbai-test-${process.pid}-${Date.now()}`)

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

// Import after mock
const { StorageService, _resetForTesting } = await import('../../src/main/services/storage')

describe('StorageService', () => {
  let service: InstanceType<typeof StorageService>
  const dataDir = path.join(TEST_DIR, '.kanbai')
  const dataPath = path.join(dataDir, 'data.json')

  beforeEach(() => {
    // Reset singleton so each test gets a fresh instance
    _resetForTesting()
    // Ensure clean state
    if (fs.existsSync(dataDir)) {
      fs.rmSync(dataDir, { recursive: true, force: true })
    }
    service = new StorageService()
  })

  afterEach(() => {
    if (fs.existsSync(dataDir)) {
      fs.rmSync(dataDir, { recursive: true, force: true })
    }
  })

  describe('initialisation', () => {
    it('cree le repertoire de donnees si inexistant', () => {
      expect(fs.existsSync(dataDir)).toBe(true)
    })

    it('retourne les parametres par defaut si aucun fichier existant', () => {
      const settings = service.getSettings()
      expect(settings).toEqual(DEFAULT_SETTINGS)
    })

    it('retourne des listes vides par defaut', () => {
      expect(service.getWorkspaces()).toEqual([])
      expect(service.getProjects()).toEqual([])
      expect(service.getKanbanTasks()).toEqual([])
      expect(service.getTemplates()).toEqual([])
    })

    it('charge les donnees existantes depuis le fichier', () => {
      const existingData = {
        workspaces: [{ id: 'ws-1', name: 'Test', color: '#fff', projectIds: [], createdAt: 1, updatedAt: 1 }],
        projects: [],
        settings: { ...DEFAULT_SETTINGS, theme: 'light' as const },
        kanbanTasks: [],
        autoClauderTemplates: [],
      }
      fs.writeFileSync(dataPath, JSON.stringify(existingData), 'utf-8')

      _resetForTesting()
      const freshService = new StorageService()
      expect(freshService.getWorkspaces()).toHaveLength(1)
      expect(freshService.getWorkspaces()[0]!.name).toBe('Test')
      expect(freshService.getSettings().theme).toBe('light')
    })
  })

  describe('workspaces', () => {
    const workspace: Workspace = {
      id: 'ws-1',
      name: 'Mon Workspace',
      color: '#3b82f6',
      projectIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    it('ajoute un workspace et le persiste', () => {
      service.addWorkspace(workspace)

      expect(service.getWorkspaces()).toHaveLength(1)
      expect(service.getWorkspaces()[0]).toEqual(workspace)

      // Verify persistence
      const raw = JSON.parse(fs.readFileSync(dataPath, 'utf-8'))
      expect(raw.workspaces).toHaveLength(1)
    })

    it('recupere un workspace par id', () => {
      service.addWorkspace(workspace)

      const found = service.getWorkspace('ws-1')
      expect(found).toEqual(workspace)
    })

    it('retourne undefined pour un id inexistant', () => {
      expect(service.getWorkspace('inexistant')).toBeUndefined()
    })

    it('met a jour un workspace existant', () => {
      service.addWorkspace(workspace)

      const updated: Workspace = { ...workspace, name: 'Renamed', updatedAt: Date.now() + 1000 }
      service.updateWorkspace(updated)

      expect(service.getWorkspace('ws-1')!.name).toBe('Renamed')
    })

    it('ne fait rien si on met a jour un workspace inexistant', () => {
      service.addWorkspace(workspace)
      const unknown: Workspace = { ...workspace, id: 'ws-999', name: 'Ghost' }
      service.updateWorkspace(unknown)

      expect(service.getWorkspaces()).toHaveLength(1)
      expect(service.getWorkspace('ws-999')).toBeUndefined()
    })

    it('supprime un workspace et ses projets associes', () => {
      service.addWorkspace(workspace)
      const project: Project = {
        id: 'p-1',
        name: 'Projet',
        path: '/tmp/projet',
        hasClaude: false,
        workspaceId: 'ws-1',
        createdAt: Date.now(),
      }
      service.addProject(project)

      service.deleteWorkspace('ws-1')

      expect(service.getWorkspaces()).toHaveLength(0)
      expect(service.getProjects()).toHaveLength(0)
    })
  })

  describe('projects', () => {
    const project: Project = {
      id: 'p-1',
      name: 'Mon Projet',
      path: '/Users/test/projet',
      hasClaude: true,
      workspaceId: 'ws-1',
      createdAt: Date.now(),
    }

    it('ajoute un projet et le persiste', () => {
      service.addProject(project)

      expect(service.getProjects()).toHaveLength(1)
      expect(service.getProjects()[0]).toEqual(project)
    })

    it('filtre les projets par workspaceId', () => {
      service.addProject(project)
      service.addProject({ ...project, id: 'p-2', workspaceId: 'ws-2' })

      expect(service.getProjects('ws-1')).toHaveLength(1)
      expect(service.getProjects('ws-2')).toHaveLength(1)
      expect(service.getProjects()).toHaveLength(2)
    })

    it('supprime un projet', () => {
      service.addProject(project)
      service.deleteProject('p-1')

      expect(service.getProjects()).toHaveLength(0)
    })

    it('ne supprime pas un projet inexistant', () => {
      service.addProject(project)
      service.deleteProject('inexistant')

      expect(service.getProjects()).toHaveLength(1)
    })
  })

  describe('settings', () => {
    it('retourne les parametres par defaut', () => {
      expect(service.getSettings()).toEqual(DEFAULT_SETTINGS)
    })

    it('met a jour partiellement les parametres', () => {
      service.updateSettings({ theme: 'light' })

      const settings = service.getSettings()
      expect(settings.theme).toBe('light')
      expect(settings.fontSize).toBe(DEFAULT_SETTINGS.fontSize)
    })

    it('persiste les parametres mis a jour', () => {
      service.updateSettings({ fontSize: 18, fontFamily: 'Fira Code' })

      const raw = JSON.parse(fs.readFileSync(dataPath, 'utf-8'))
      expect(raw.settings.fontSize).toBe(18)
      expect(raw.settings.fontFamily).toBe('Fira Code')
    })
  })

  describe('kanban tasks', () => {
    const task: KanbanTask = {
      id: 'k-1',
      workspaceId: 'ws-1',
      title: 'Tache test',
      description: 'Description',
      status: 'TODO',
      priority: 'medium',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    it('ajoute une tache kanban', () => {
      service.addKanbanTask(task)
      expect(service.getKanbanTasks()).toHaveLength(1)
    })

    it('filtre les taches par workspaceId', () => {
      service.addKanbanTask(task)
      service.addKanbanTask({ ...task, id: 'k-2', workspaceId: 'ws-2' })

      expect(service.getKanbanTasks('ws-1')).toHaveLength(1)
      expect(service.getKanbanTasks('ws-2')).toHaveLength(1)
    })

    it('met a jour une tache kanban', () => {
      service.addKanbanTask(task)

      const updated: KanbanTask = { ...task, status: 'DONE', updatedAt: Date.now() + 1000 }
      service.updateKanbanTask(updated)

      expect(service.getKanbanTasks()[0]!.status).toBe('DONE')
    })

    it('ne fait rien si on met a jour une tache inexistante', () => {
      service.addKanbanTask(task)
      service.updateKanbanTask({ ...task, id: 'k-999', title: 'Ghost' })

      expect(service.getKanbanTasks()).toHaveLength(1)
      expect(service.getKanbanTasks()[0]!.title).toBe('Tache test')
    })

    it('supprime une tache kanban', () => {
      service.addKanbanTask(task)
      service.deleteKanbanTask('k-1')

      expect(service.getKanbanTasks()).toHaveLength(0)
    })
  })

  describe('auto-clauder templates', () => {
    const template: AutoClauderTemplate = {
      id: 't-1',
      name: 'Template test',
      description: 'Un template de test',
      claudeMd: '# Test',
      settings: { key: 'value' },
      createdAt: Date.now(),
    }

    it('ajoute un template', () => {
      service.addTemplate(template)
      expect(service.getTemplates()).toHaveLength(1)
    })

    it('supprime un template', () => {
      service.addTemplate(template)
      service.deleteTemplate('t-1')

      expect(service.getTemplates()).toHaveLength(0)
    })
  })
})
