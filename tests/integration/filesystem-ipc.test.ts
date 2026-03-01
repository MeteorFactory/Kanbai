import { describe, it, expect, beforeEach, afterAll, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { createMockIpcMain } from '../mocks/electron'
import { IS_WIN } from '../helpers/platform'

const TEST_DIR = path.join(os.tmpdir(), `.mirehub-fs-ipc-test-${process.pid}-${Date.now()}`)
const testFilesDir = path.join(TEST_DIR, 'test-files')

describe('Filesystem IPC Handlers', () => {
  let mockIpcMain: ReturnType<typeof createMockIpcMain>

  beforeEach(async () => {
    vi.resetModules()

    if (fs.existsSync(testFilesDir)) {
      fs.rmSync(testFilesDir, { recursive: true, force: true })
    }
    fs.mkdirSync(testFilesDir, { recursive: true })

    const { registerFilesystemHandlers } = await import('../../src/main/ipc/filesystem')

    mockIpcMain = createMockIpcMain()
    registerFilesystemHandlers(mockIpcMain as never)
  })

  afterEach(() => {
    if (fs.existsSync(testFilesDir)) {
      fs.rmSync(testFilesDir, { recursive: true, force: true })
    }
  })

  afterAll(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  it('enregistre les 8 handlers filesystem', () => {
    expect(mockIpcMain._handlers.has('fs:readDir')).toBe(true)
    expect(mockIpcMain._handlers.has('fs:readFile')).toBe(true)
    expect(mockIpcMain._handlers.has('fs:writeFile')).toBe(true)
    expect(mockIpcMain._handlers.has('fs:rename')).toBe(true)
    expect(mockIpcMain._handlers.has('fs:delete')).toBe(true)
    expect(mockIpcMain._handlers.has('fs:copy')).toBe(true)
    expect(mockIpcMain._handlers.has('fs:mkdir')).toBe(true)
    expect(mockIpcMain._handlers.has('fs:exists')).toBe(true)
  })

  describe('fs:readDir', () => {
    it('liste les fichiers et dossiers tries (dossiers en premier)', async () => {
      fs.mkdirSync(path.join(testFilesDir, 'subdir'))
      fs.writeFileSync(path.join(testFilesDir, 'file.txt'), 'content')
      fs.writeFileSync(path.join(testFilesDir, 'aaa.txt'), 'content')

      const result = await mockIpcMain._invoke('fs:readDir', { path: testFilesDir })

      expect(result).toHaveLength(3)
      // Dossiers en premier
      expect(result[0].name).toBe('subdir')
      expect(result[0].isDirectory).toBe(true)
      // Puis fichiers tries par nom
      expect(result[1].name).toBe('aaa.txt')
      expect(result[2].name).toBe('file.txt')
    })

    it('retourne un tableau vide pour un dossier inexistant', async () => {
      const result = await mockIpcMain._invoke('fs:readDir', { path: '/nonexistent/path' })
      expect(result).toEqual([])
    })

    it('retourne un tableau vide pour un dossier vide', async () => {
      const emptyDir = path.join(testFilesDir, 'empty')
      fs.mkdirSync(emptyDir)

      const result = await mockIpcMain._invoke('fs:readDir', { path: emptyDir })
      expect(result).toEqual([])
    })

    it.skipIf(IS_WIN)('inclut les informations de symlink', async () => {
      const targetDir = path.join(testFilesDir, 'target')
      fs.mkdirSync(targetDir)
      const symlinkPath = path.join(testFilesDir, 'link')
      fs.symlinkSync(targetDir, symlinkPath, 'dir')

      const result = await mockIpcMain._invoke('fs:readDir', { path: testFilesDir })
      const link = result.find((e: { name: string }) => e.name === 'link')

      expect(link).toBeDefined()
      expect(link.isSymlink).toBe(true)
    })
  })

  describe('fs:readFile', () => {
    it('lit le contenu d un fichier texte', async () => {
      const filePath = path.join(testFilesDir, 'test.txt')
      fs.writeFileSync(filePath, 'Hello World', 'utf-8')

      const result = await mockIpcMain._invoke('fs:readFile', { path: filePath })

      expect(result.content).toBe('Hello World')
      expect(result.error).toBeNull()
    })

    it('retourne une erreur pour un fichier inexistant', async () => {
      const result = await mockIpcMain._invoke('fs:readFile', { path: '/nonexistent/file.txt' })

      expect(result.content).toBeNull()
      expect(result.error).toBeDefined()
    })

    it('refuse les fichiers de plus de 5 Mo', async () => {
      const filePath = path.join(testFilesDir, 'large.bin')
      // Creer un fichier de >5 Mo
      const buf = Buffer.alloc(6 * 1024 * 1024, 'a')
      fs.writeFileSync(filePath, buf)

      const result = await mockIpcMain._invoke('fs:readFile', { path: filePath })

      expect(result.content).toBeNull()
      expect(result.error).toContain('trop volumineux')
    })

    it('lit correctement un fichier JSON', async () => {
      const filePath = path.join(testFilesDir, 'package.json')
      const jsonContent = JSON.stringify({ name: 'test', version: '1.0.0', dependencies: { vitest: '^3.0.0' } }, null, 2)
      fs.writeFileSync(filePath, jsonContent, 'utf-8')

      const result = await mockIpcMain._invoke('fs:readFile', { path: filePath })

      expect(result.content).toBe(jsonContent)
      expect(result.error).toBeNull()
      // Verify it's valid JSON
      expect(() => JSON.parse(result.content)).not.toThrow()
    })

    it('lit un fichier JSON avec caracteres speciaux', async () => {
      const filePath = path.join(testFilesDir, 'config.json')
      const jsonContent = JSON.stringify({ description: 'Projet avec des accents éàü', emoji: '🎉', path: '/Users/test/dossier' }, null, 2)
      fs.writeFileSync(filePath, jsonContent, 'utf-8')

      const result = await mockIpcMain._invoke('fs:readFile', { path: filePath })

      expect(result.content).toBe(jsonContent)
      expect(result.error).toBeNull()
    })

    it('lit un fichier TypeScript', async () => {
      const filePath = path.join(testFilesDir, 'index.ts')
      const tsContent = 'export function hello(): string {\n  return "hello world"\n}\n'
      fs.writeFileSync(filePath, tsContent, 'utf-8')

      const result = await mockIpcMain._invoke('fs:readFile', { path: filePath })

      expect(result.content).toBe(tsContent)
      expect(result.error).toBeNull()
    })

    it('lit un fichier CSS', async () => {
      const filePath = path.join(testFilesDir, 'styles.css')
      const cssContent = '.container { display: flex; color: #cdd6f4; }\n'
      fs.writeFileSync(filePath, cssContent, 'utf-8')

      const result = await mockIpcMain._invoke('fs:readFile', { path: filePath })

      expect(result.content).toBe(cssContent)
      expect(result.error).toBeNull()
    })

    it('lit un fichier vide sans erreur', async () => {
      const filePath = path.join(testFilesDir, 'empty.json')
      fs.writeFileSync(filePath, '', 'utf-8')

      const result = await mockIpcMain._invoke('fs:readFile', { path: filePath })

      expect(result.content).toBe('')
      expect(result.error).toBeNull()
    })

    it('lit un fichier JSON minifie', async () => {
      const filePath = path.join(testFilesDir, 'minified.json')
      const content = '{"a":1,"b":"hello","c":[1,2,3],"d":{"nested":true}}'
      fs.writeFileSync(filePath, content, 'utf-8')

      const result = await mockIpcMain._invoke('fs:readFile', { path: filePath })

      expect(result.content).toBe(content)
      expect(result.error).toBeNull()
    })

  })

  describe('fs:writeFile', () => {
    it('ecrit du contenu dans un fichier', async () => {
      const filePath = path.join(testFilesDir, 'written.txt')
      const result = await mockIpcMain._invoke('fs:writeFile', {
        path: filePath,
        content: 'Hello from writeFile',
      })

      expect(result).toEqual({ success: true, error: null })
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('Hello from writeFile')
    })

    it('ecrase le contenu existant', async () => {
      const filePath = path.join(testFilesDir, 'overwrite.txt')
      fs.writeFileSync(filePath, 'original content', 'utf-8')

      const result = await mockIpcMain._invoke('fs:writeFile', {
        path: filePath,
        content: 'new content',
      })

      expect(result).toEqual({ success: true, error: null })
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('new content')
    })

    it('ecrit un fichier vide', async () => {
      const filePath = path.join(testFilesDir, 'empty.txt')
      const result = await mockIpcMain._invoke('fs:writeFile', {
        path: filePath,
        content: '',
      })

      expect(result).toEqual({ success: true, error: null })
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('')
    })

    it('ecrit du contenu UTF-8 avec caracteres speciaux', async () => {
      const filePath = path.join(testFilesDir, 'unicode.txt')
      const content = 'Caractères spéciaux: é à ü ñ 日本語 🎉'
      const result = await mockIpcMain._invoke('fs:writeFile', {
        path: filePath,
        content,
      })

      expect(result).toEqual({ success: true, error: null })
      expect(fs.readFileSync(filePath, 'utf-8')).toBe(content)
    })

    it('retourne une erreur pour un dossier parent inexistant', async () => {
      const filePath = path.join(testFilesDir, 'nested', 'deep', 'file.txt')
      const result = await mockIpcMain._invoke('fs:writeFile', {
        path: filePath,
        content: 'nested content',
      })

      // writeFileSync ne cree pas les dossiers parents
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error).toContain('ENOENT')
    })

    it('retourne une erreur si le chemin est invalide', async () => {
      const result = await mockIpcMain._invoke('fs:writeFile', {
        path: '/\0invalid-path',
        content: 'content',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  describe('fs:delete', () => {
    it('supprime un fichier', async () => {
      const filePath = path.join(testFilesDir, 'to-delete.txt')
      fs.writeFileSync(filePath, 'content')

      const result = await mockIpcMain._invoke('fs:delete', { path: filePath })

      expect(result).toBe(true)
      expect(fs.existsSync(filePath)).toBe(false)
    })

    it('supprime un dossier recursivement', async () => {
      const dirPath = path.join(testFilesDir, 'dir-to-delete')
      fs.mkdirSync(dirPath)
      fs.writeFileSync(path.join(dirPath, 'child.txt'), 'content')
      fs.mkdirSync(path.join(dirPath, 'subdir'))
      fs.writeFileSync(path.join(dirPath, 'subdir', 'deep.txt'), 'deep')

      const result = await mockIpcMain._invoke('fs:delete', { path: dirPath })

      expect(result).toBe(true)
      expect(fs.existsSync(dirPath)).toBe(false)
    })

    it('ne leve pas d erreur pour un chemin inexistant (force: true)', async () => {
      const result = await mockIpcMain._invoke('fs:delete', { path: '/nonexistent/path' })
      expect(result).toBe(true)
    })
  })

  describe('fs:copy', () => {
    it('copie un fichier', async () => {
      const src = path.join(testFilesDir, 'source.txt')
      const dest = path.join(testFilesDir, 'destination.txt')
      fs.writeFileSync(src, 'source content')

      const result = await mockIpcMain._invoke('fs:copy', { src, dest })

      expect(result).toBe(true)
      expect(fs.readFileSync(dest, 'utf-8')).toBe('source content')
      // Source doit toujours exister
      expect(fs.existsSync(src)).toBe(true)
    })

    it('copie un dossier recursivement', async () => {
      const src = path.join(testFilesDir, 'src-dir')
      const dest = path.join(testFilesDir, 'dest-dir')
      fs.mkdirSync(src)
      fs.writeFileSync(path.join(src, 'file.txt'), 'content')
      fs.mkdirSync(path.join(src, 'sub'))
      fs.writeFileSync(path.join(src, 'sub', 'nested.txt'), 'nested')

      const result = await mockIpcMain._invoke('fs:copy', { src, dest })

      expect(result).toBe(true)
      expect(fs.readFileSync(path.join(dest, 'file.txt'), 'utf-8')).toBe('content')
      expect(fs.readFileSync(path.join(dest, 'sub', 'nested.txt'), 'utf-8')).toBe('nested')
    })

    it('echoue si la source n existe pas', async () => {
      const src = path.join(testFilesDir, 'nonexistent.txt')
      const dest = path.join(testFilesDir, 'dest.txt')

      await expect(
        mockIpcMain._invoke('fs:copy', { src, dest }),
      ).rejects.toThrow()
    })
  })

  describe('fs:mkdir', () => {
    it('cree un dossier', async () => {
      const dirPath = path.join(testFilesDir, 'new-dir')

      const result = await mockIpcMain._invoke('fs:mkdir', { path: dirPath })

      expect(result).toBe(true)
      expect(fs.existsSync(dirPath)).toBe(true)
      expect(fs.statSync(dirPath).isDirectory()).toBe(true)
    })

    it('cree des dossiers imbriques (recursive)', async () => {
      const dirPath = path.join(testFilesDir, 'a', 'b', 'c')

      const result = await mockIpcMain._invoke('fs:mkdir', { path: dirPath })

      expect(result).toBe(true)
      expect(fs.existsSync(dirPath)).toBe(true)
    })

    it('ne leve pas d erreur si le dossier existe deja', async () => {
      const dirPath = path.join(testFilesDir, 'existing-dir')
      fs.mkdirSync(dirPath)

      const result = await mockIpcMain._invoke('fs:mkdir', { path: dirPath })
      expect(result).toBe(true)
    })
  })

  describe('fs:exists', () => {
    it('retourne true pour un fichier existant', async () => {
      const filePath = path.join(testFilesDir, 'exists.txt')
      fs.writeFileSync(filePath, 'content')

      const result = await mockIpcMain._invoke('fs:exists', { path: filePath })
      expect(result).toBe(true)
    })

    it('retourne true pour un dossier existant', async () => {
      const dirPath = path.join(testFilesDir, 'exists-dir')
      fs.mkdirSync(dirPath)

      const result = await mockIpcMain._invoke('fs:exists', { path: dirPath })
      expect(result).toBe(true)
    })

    it('retourne false pour un chemin inexistant', async () => {
      const result = await mockIpcMain._invoke('fs:exists', { path: path.join(testFilesDir, 'nope') })
      expect(result).toBe(false)
    })
  })

  describe('fs:rename', () => {
    it('renomme un fichier', async () => {
      const oldPath = path.join(testFilesDir, 'old.txt')
      const newPath = path.join(testFilesDir, 'new.txt')
      fs.writeFileSync(oldPath, 'content')

      const result = await mockIpcMain._invoke('fs:rename', { oldPath, newPath })

      expect(result).toBe(true)
      expect(fs.existsSync(newPath)).toBe(true)
      expect(fs.existsSync(oldPath)).toBe(false)
    })

    it('echoue si le fichier source n existe pas', async () => {
      const oldPath = path.join(testFilesDir, 'nonexistent.txt')
      const newPath = path.join(testFilesDir, 'new.txt')

      await expect(
        mockIpcMain._invoke('fs:rename', { oldPath, newPath }),
      ).rejects.toThrow()
    })
  })

  describe('operations chainees (simulation menu contextuel)', () => {
    it('copie un fichier puis le colle dans un dossier', async () => {
      // Setup: creer un fichier et un dossier cible
      const srcFile = path.join(testFilesDir, 'original.txt')
      const targetDir = path.join(testFilesDir, 'target')
      fs.writeFileSync(srcFile, 'original content')
      fs.mkdirSync(targetDir)

      // Copy
      const destPath = path.join(targetDir, 'original.txt')
      await mockIpcMain._invoke('fs:copy', { src: srcFile, dest: destPath })

      // Verify
      expect(fs.existsSync(srcFile)).toBe(true) // source preserved
      expect(fs.readFileSync(destPath, 'utf-8')).toBe('original content')
    })

    it('duplique un fichier (copie + deduplication nom)', async () => {
      const srcFile = path.join(testFilesDir, 'file.txt')
      fs.writeFileSync(srcFile, 'content')

      // Simulate "Duplicate" - copy to same dir with different name
      const dupePath = path.join(testFilesDir, 'file copie.txt')
      await mockIpcMain._invoke('fs:copy', { src: srcFile, dest: dupePath })

      expect(fs.existsSync(srcFile)).toBe(true)
      expect(fs.readFileSync(dupePath, 'utf-8')).toBe('content')
    })

    it('cree un fichier vide via writeFile', async () => {
      const filePath = path.join(testFilesDir, 'nouveau_fichier')
      await mockIpcMain._invoke('fs:writeFile', { path: filePath, content: '' })

      expect(fs.existsSync(filePath)).toBe(true)
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('')
    })

    it('cree un dossier puis renomme', async () => {
      const dirPath = path.join(testFilesDir, 'nouveau_dossier')
      await mockIpcMain._invoke('fs:mkdir', { path: dirPath })

      const renamedPath = path.join(testFilesDir, 'mon_dossier')
      await mockIpcMain._invoke('fs:rename', { oldPath: dirPath, newPath: renamedPath })

      expect(fs.existsSync(renamedPath)).toBe(true)
      expect(fs.existsSync(dirPath)).toBe(false)
    })

    it('verifie l existence avant de creer un duplicat', async () => {
      const filePath = path.join(testFilesDir, 'test.txt')
      fs.writeFileSync(filePath, 'content')

      // Check if "test copie.txt" exists
      const copie1 = path.join(testFilesDir, 'test copie.txt')
      const exists1 = await mockIpcMain._invoke('fs:exists', { path: copie1 })
      expect(exists1).toBe(false)

      // Create the copy
      await mockIpcMain._invoke('fs:copy', { src: filePath, dest: copie1 })

      // Now it exists
      const exists2 = await mockIpcMain._invoke('fs:exists', { path: copie1 })
      expect(exists2).toBe(true)

      // Check for "test copie 2.txt"
      const copie2 = path.join(testFilesDir, 'test copie 2.txt')
      const exists3 = await mockIpcMain._invoke('fs:exists', { path: copie2 })
      expect(exists3).toBe(false)
    })

    it('supprime un dossier avec contenu puis verifie inexistence', async () => {
      const dirPath = path.join(testFilesDir, 'to-remove')
      fs.mkdirSync(dirPath)
      fs.writeFileSync(path.join(dirPath, 'a.txt'), 'a')
      fs.writeFileSync(path.join(dirPath, 'b.txt'), 'b')

      await mockIpcMain._invoke('fs:delete', { path: dirPath })

      const exists = await mockIpcMain._invoke('fs:exists', { path: dirPath })
      expect(exists).toBe(false)
    })

    it('copie un dossier entier avec sous-structure', async () => {
      // Setup: structure imbriquee
      const src = path.join(testFilesDir, 'project')
      fs.mkdirSync(path.join(src, 'src', 'components'), { recursive: true })
      fs.writeFileSync(path.join(src, 'package.json'), '{}')
      fs.writeFileSync(path.join(src, 'src', 'index.ts'), 'export {}')
      fs.writeFileSync(path.join(src, 'src', 'components', 'App.tsx'), '<App />')

      // Copy
      const dest = path.join(testFilesDir, 'project copie')
      await mockIpcMain._invoke('fs:copy', { src, dest })

      // Verify entire structure
      expect(fs.readFileSync(path.join(dest, 'package.json'), 'utf-8')).toBe('{}')
      expect(fs.readFileSync(path.join(dest, 'src', 'index.ts'), 'utf-8')).toBe('export {}')
      expect(fs.readFileSync(path.join(dest, 'src', 'components', 'App.tsx'), 'utf-8')).toBe('<App />')

      // Verify directory listing of copy
      const entries = await mockIpcMain._invoke('fs:readDir', { path: dest })
      expect(entries).toHaveLength(2) // package.json + src
    })
  })
})
