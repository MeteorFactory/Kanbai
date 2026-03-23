import { describe, it, expect } from 'vitest'
import path from 'path'
import { validatePath, sanitizePath } from '../../src/main/ipc/filesystem'

describe('validatePath', () => {
  const basePath = '/Users/test/projects/myapp'
  const resolvedBase = path.resolve(basePath)

  describe('valid paths', () => {
    it('should accept a path within the base directory', () => {
      const result = validatePath(basePath, '/Users/test/projects/myapp/src/index.ts')
      expect(result).toBe(path.resolve('/Users/test/projects/myapp/src/index.ts'))
    })

    it('should accept the base directory itself', () => {
      const result = validatePath(basePath, basePath)
      expect(result).toBe(resolvedBase)
    })

    it('should accept a relative path within the base directory', () => {
      const result = validatePath(basePath, 'src/index.ts')
      expect(result).toBe(path.resolve(basePath, 'src/index.ts'))
    })

    it('should accept nested subdirectories', () => {
      const result = validatePath(basePath, '/Users/test/projects/myapp/src/components/App.tsx')
      expect(result).toBe(path.resolve('/Users/test/projects/myapp/src/components/App.tsx'))
    })

    it('should resolve relative path with . segments within base', () => {
      const result = validatePath(basePath, '/Users/test/projects/myapp/src/./index.ts')
      expect(result).toBe(path.resolve('/Users/test/projects/myapp/src/index.ts'))
    })
  })

  describe('path traversal attacks', () => {
    it('should reject path with .. escaping base directory', () => {
      expect(() =>
        validatePath(basePath, '/Users/test/projects/myapp/../../etc/passwd'),
      ).toThrow('Path traversal detected')
    })

    it('should reject relative path with .. escaping base', () => {
      expect(() =>
        validatePath(basePath, '../../../etc/passwd'),
      ).toThrow('Path traversal detected')
    })

    it('should reject absolute path outside base directory', () => {
      expect(() =>
        validatePath(basePath, '/etc/passwd'),
      ).toThrow('Path traversal detected')
    })

    it('should reject path going up then back into a different directory', () => {
      expect(() =>
        validatePath(basePath, '/Users/test/projects/myapp/../otherapp/config'),
      ).toThrow('Path traversal detected')
    })

    it('should reject path that is a prefix but not a child (myapp2)', () => {
      expect(() =>
        validatePath('/Users/test/projects/myapp', '/Users/test/projects/myapp2/file.txt'),
      ).toThrow('Path traversal detected')
    })
  })

  describe('null byte attacks', () => {
    it('should reject path containing null byte', () => {
      expect(() =>
        validatePath(basePath, '/Users/test/projects/myapp/file.txt\0.jpg'),
      ).toThrow('null bytes')
    })

    it('should reject basePath containing null byte', () => {
      expect(() =>
        validatePath('/Users/test\0/projects', '/Users/test/projects/file.txt'),
      ).toThrow('null bytes')
    })
  })

  describe('invalid inputs', () => {
    it('should reject empty path', () => {
      expect(() => validatePath(basePath, '')).toThrow('non-empty string')
    })

    it('should reject empty basePath', () => {
      expect(() => validatePath('', '/some/path')).toThrow('non-empty string')
    })

    it('should reject non-string path', () => {
      expect(() => validatePath(basePath, 123 as unknown as string)).toThrow('non-empty string')
    })

    it('should reject non-string basePath', () => {
      expect(() => validatePath(null as unknown as string, '/some/path')).toThrow('non-empty string')
    })
  })
})

describe('sanitizePath', () => {
  describe('valid paths', () => {
    it('should accept and resolve an absolute path', () => {
      const result = sanitizePath('/Users/test/file.txt')
      expect(result).toBe(path.resolve('/Users/test/file.txt'))
    })

    it('should resolve a relative path to absolute', () => {
      const result = sanitizePath('relative/path.txt')
      expect(result).toBe(path.resolve('relative/path.txt'))
    })

    it('should normalize paths with . segments', () => {
      const result = sanitizePath('/Users/test/./file.txt')
      expect(result).toBe(path.resolve('/Users/test/file.txt'))
    })

    it('should resolve paths with .. segments', () => {
      const result = sanitizePath('/Users/test/sub/../file.txt')
      expect(result).toBe(path.resolve('/Users/test/file.txt'))
    })
  })

  describe('null byte attacks', () => {
    it('should reject path containing null byte', () => {
      expect(() => sanitizePath('/Users/test/file.txt\0.jpg')).toThrow('null bytes')
    })

    it('should reject path with null byte at start', () => {
      expect(() => sanitizePath('\0/etc/passwd')).toThrow('null bytes')
    })

    it('should reject path with embedded null byte', () => {
      expect(() => sanitizePath('/etc/pass\0wd')).toThrow('null bytes')
    })
  })

  describe('invalid inputs', () => {
    it('should reject empty string', () => {
      expect(() => sanitizePath('')).toThrow('non-empty string')
    })

    it('should reject non-string input', () => {
      expect(() => sanitizePath(undefined as unknown as string)).toThrow('non-empty string')
    })

    it('should reject number input', () => {
      expect(() => sanitizePath(42 as unknown as string)).toThrow('non-empty string')
    })

    it('should reject null input', () => {
      expect(() => sanitizePath(null as unknown as string)).toThrow('non-empty string')
    })
  })
})
