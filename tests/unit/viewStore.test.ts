import { describe, it, expect, beforeEach } from 'vitest'
import { useViewStore } from '../../src/renderer/shared/stores/view-store'
import type { ViewMode } from '../../src/renderer/shared/stores/view-store'

describe('useViewStore', () => {
  beforeEach(() => {
    useViewStore.setState({
      viewMode: 'terminal',
      selectedFilePath: null,
      isEditorDirty: false,
      availableMagicTabs: [],
      selectedFiles: [],
      diffFiles: null,
      clipboardPath: null,
      clipboardOperation: null,
    })
  })

  describe('etat initial', () => {
    it('a le mode terminal par defaut', () => {
      const state = useViewStore.getState()
      expect(state.viewMode).toBe('terminal')
      expect(state.selectedFilePath).toBeNull()
    })

    it('isEditorDirty est false par defaut', () => {
      const state = useViewStore.getState()
      expect(state.isEditorDirty).toBe(false)
    })
  })

  describe('setViewMode', () => {
    it('change le mode de vue vers git', () => {
      useViewStore.getState().setViewMode('git')
      expect(useViewStore.getState().viewMode).toBe('git')
    })

    it('change le mode de vue vers kanban', () => {
      useViewStore.getState().setViewMode('kanban')
      expect(useViewStore.getState().viewMode).toBe('kanban')
    })

    it('change le mode de vue vers file', () => {
      useViewStore.getState().setViewMode('file')
      expect(useViewStore.getState().viewMode).toBe('file')
    })

    it('revient au mode terminal', () => {
      useViewStore.getState().setViewMode('git')
      useViewStore.getState().setViewMode('terminal')
      expect(useViewStore.getState().viewMode).toBe('terminal')
    })

    it('ne modifie pas selectedFilePath en changeant de mode', () => {
      useViewStore.getState().openFile('/path/to/file.ts')
      useViewStore.getState().setViewMode('git')

      // Le fichier selectionne reste en memoire meme en mode git
      expect(useViewStore.getState().selectedFilePath).toBe('/path/to/file.ts')
    })
  })

  describe('openFile', () => {
    it('ouvre un fichier et bascule en mode file', () => {
      useViewStore.getState().openFile('/path/to/file.ts')

      const state = useViewStore.getState()
      expect(state.viewMode).toBe('file')
      expect(state.selectedFilePath).toBe('/path/to/file.ts')
    })

    it('change le fichier selectionne', () => {
      useViewStore.getState().openFile('/path/to/first.ts')
      useViewStore.getState().openFile('/path/to/second.ts')

      expect(useViewStore.getState().selectedFilePath).toBe('/path/to/second.ts')
    })

    it('bascule en mode file meme si on etait dans un autre mode', () => {
      useViewStore.getState().setViewMode('git')
      useViewStore.getState().openFile('/path/to/file.ts')

      expect(useViewStore.getState().viewMode).toBe('file')
    })
  })

  describe('transitions de modes de vue', () => {
    it('enchainage de modes: terminal -> git -> file -> kanban -> terminal', () => {
      const modes: ViewMode[] = ['terminal', 'git', 'file', 'kanban', 'terminal']

      for (const mode of modes) {
        useViewStore.getState().setViewMode(mode)
        expect(useViewStore.getState().viewMode).toBe(mode)
      }
    })

    it('openFile depuis chaque mode bascule vers file', () => {
      const modes: ViewMode[] = ['terminal', 'git', 'kanban']

      for (const mode of modes) {
        useViewStore.getState().setViewMode(mode)
        useViewStore.getState().openFile('/test/file.ts')
        expect(useViewStore.getState().viewMode).toBe('file')
      }
    })

    it('le retour au mode terminal preserve le fichier selectionne', () => {
      useViewStore.getState().openFile('/test/file.ts')
      expect(useViewStore.getState().viewMode).toBe('file')

      useViewStore.getState().setViewMode('terminal')
      expect(useViewStore.getState().viewMode).toBe('terminal')

      // Le fichier reste en memoire
      expect(useViewStore.getState().selectedFilePath).toBe('/test/file.ts')

      // Revenir en mode file doit retrouver le fichier
      useViewStore.getState().setViewMode('file')
      expect(useViewStore.getState().selectedFilePath).toBe('/test/file.ts')
    })
  })

  describe('isEditorDirty et setEditorDirty', () => {
    it('setEditorDirty(true) marque le fichier comme modifie', () => {
      useViewStore.getState().setEditorDirty(true)
      expect(useViewStore.getState().isEditorDirty).toBe(true)
    })

    it('setEditorDirty(false) marque le fichier comme non modifie', () => {
      useViewStore.getState().setEditorDirty(true)
      useViewStore.getState().setEditorDirty(false)
      expect(useViewStore.getState().isEditorDirty).toBe(false)
    })

    it('openFile remet isEditorDirty a false', () => {
      // Simuler un fichier dirty
      useViewStore.getState().setEditorDirty(true)
      expect(useViewStore.getState().isEditorDirty).toBe(true)

      // Ouvrir un autre fichier doit remettre dirty a false
      useViewStore.getState().openFile('/path/to/new-file.ts')
      expect(useViewStore.getState().isEditorDirty).toBe(false)
    })

    it('openFile remet dirty a false meme pour le meme fichier', () => {
      useViewStore.getState().openFile('/path/to/file.ts')
      useViewStore.getState().setEditorDirty(true)

      // Re-ouvrir le meme fichier doit aussi remettre dirty a false
      useViewStore.getState().openFile('/path/to/file.ts')
      expect(useViewStore.getState().isEditorDirty).toBe(false)
    })

    it('setViewMode ne modifie pas isEditorDirty', () => {
      useViewStore.getState().setEditorDirty(true)
      useViewStore.getState().setViewMode('git')

      // Changer de mode ne touche pas au dirty flag
      expect(useViewStore.getState().isEditorDirty).toBe(true)
    })

    it('le dirty flag est independant du fichier selectionne', () => {
      useViewStore.getState().setEditorDirty(true)
      expect(useViewStore.getState().isEditorDirty).toBe(true)

      // Sans ouvrir de fichier, le flag reste
      useViewStore.getState().setViewMode('terminal')
      useViewStore.getState().setViewMode('file')
      expect(useViewStore.getState().isEditorDirty).toBe(true)
    })
  })

  describe('toggleFileSelection et diff', () => {
    it('selectionne un fichier avec toggleFileSelection', () => {
      useViewStore.getState().toggleFileSelection('/path/a.ts')

      expect(useViewStore.getState().selectedFiles).toEqual(['/path/a.ts'])
    })

    it('deselectionne un fichier deja selectionne', () => {
      useViewStore.getState().toggleFileSelection('/path/a.ts')
      useViewStore.getState().toggleFileSelection('/path/a.ts')

      expect(useViewStore.getState().selectedFiles).toEqual([])
    })

    it('ouvre automatiquement le diff quand 2 fichiers sont selectionnes', () => {
      useViewStore.getState().toggleFileSelection('/path/a.ts')
      useViewStore.getState().toggleFileSelection('/path/b.ts')

      const state = useViewStore.getState()
      expect(state.selectedFiles).toEqual(['/path/a.ts', '/path/b.ts'])
      expect(state.diffFiles).toEqual(['/path/a.ts', '/path/b.ts'])
      expect(state.viewMode).toBe('diff')
    })

    it('remplace la selection la plus ancienne quand 3eme fichier selectionne', () => {
      useViewStore.getState().toggleFileSelection('/path/a.ts')
      useViewStore.getState().toggleFileSelection('/path/b.ts')
      useViewStore.getState().toggleFileSelection('/path/c.ts')

      const state = useViewStore.getState()
      expect(state.selectedFiles).toEqual(['/path/b.ts', '/path/c.ts'])
    })

    it('clearSelection remet tout a zero', () => {
      useViewStore.getState().toggleFileSelection('/path/a.ts')
      useViewStore.getState().toggleFileSelection('/path/b.ts')
      useViewStore.getState().clearSelection()

      const state = useViewStore.getState()
      expect(state.selectedFiles).toEqual([])
      expect(state.diffFiles).toBeNull()
    })

    it('openDiff ne fait rien si moins de 2 fichiers', () => {
      useViewStore.getState().toggleFileSelection('/path/a.ts')
      useViewStore.getState().openDiff()

      expect(useViewStore.getState().diffFiles).toBeNull()
      expect(useViewStore.getState().viewMode).toBe('terminal')
    })

    it('openDiff bascule en mode diff avec 2 fichiers', () => {
      useViewStore.setState({ selectedFiles: ['/a.ts', '/b.ts'] })
      useViewStore.getState().openDiff()

      expect(useViewStore.getState().diffFiles).toEqual(['/a.ts', '/b.ts'])
      expect(useViewStore.getState().viewMode).toBe('diff')
    })
  })

  describe('clipboard', () => {
    it('setClipboard stocke le chemin et l operation', () => {
      useViewStore.getState().setClipboard('/path/file.ts', 'copy')

      const state = useViewStore.getState()
      expect(state.clipboardPath).toBe('/path/file.ts')
      expect(state.clipboardOperation).toBe('copy')
    })

    it('clearClipboard remet a null', () => {
      useViewStore.getState().setClipboard('/path/file.ts', 'copy')
      useViewStore.getState().clearClipboard()

      const state = useViewStore.getState()
      expect(state.clipboardPath).toBeNull()
      expect(state.clipboardOperation).toBeNull()
    })

    it('setClipboard remplace la valeur precedente', () => {
      useViewStore.getState().setClipboard('/path/a.ts', 'copy')
      useViewStore.getState().setClipboard('/path/b.ts', 'copy')

      expect(useViewStore.getState().clipboardPath).toBe('/path/b.ts')
    })
  })

  describe('nouveaux modes de vue', () => {
    it('bascule vers le mode diff', () => {
      useViewStore.getState().setViewMode('diff')
      expect(useViewStore.getState().viewMode).toBe('diff')
    })

    it('bascule vers le mode claude', () => {
      useViewStore.getState().setViewMode('claude')
      expect(useViewStore.getState().viewMode).toBe('claude')
    })

    it('bascule vers le mode settings', () => {
      useViewStore.getState().setViewMode('settings')
      expect(useViewStore.getState().viewMode).toBe('settings')
    })

    it('bascule vers le mode npm', () => {
      useViewStore.getState().setViewMode('npm')
      expect(useViewStore.getState().viewMode).toBe('npm')
    })

    it('transitions entre tous les nouveaux modes', () => {
      const modes: ViewMode[] = ['diff', 'claude', 'settings', 'npm', 'terminal']
      for (const mode of modes) {
        useViewStore.getState().setViewMode(mode)
        expect(useViewStore.getState().viewMode).toBe(mode)
      }
    })
  })

  describe('magic tabs (fonctionnalite a implementer)', () => {
    // Les magic tabs associent un onglet terminal a chaque mode de vue.
    // Quand on bascule vers git ou kanban, l'onglet correspondant est cree/active.
    // Ces tests preparent l'implementation.

    it('le store expose les fonctions setViewMode et openFile', () => {
      const state = useViewStore.getState()
      expect(typeof state.setViewMode).toBe('function')
      expect(typeof state.openFile).toBe('function')
    })

    it('le store supporte tous les modes de vue', () => {
      // Verification que les types sont respectes
      const validModes: ViewMode[] = ['terminal', 'git', 'kanban', 'file', 'npm', 'diff', 'claude', 'settings']
      for (const mode of validModes) {
        useViewStore.getState().setViewMode(mode)
        expect(useViewStore.getState().viewMode).toBe(mode)
      }
    })

    it('le changement de mode est synchrone', () => {
      // Important pour les magic tabs : le mode doit etre mis a jour immediatement
      useViewStore.getState().setViewMode('git')
      const viewMode = useViewStore.getState().viewMode
      expect(viewMode).toBe('git')
      // Pas de delai async
    })
  })
})
