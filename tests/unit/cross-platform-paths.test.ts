import { describe, it, expect } from 'vitest'
import {
  IS_WIN,
  PATH_SEP,
  getExtendedToolPaths,
  getDbToolPaths,
  getAnalysisToolPaths,
} from '../../src/shared/platform'
import { IS_MAC as TEST_IS_MAC, IS_WIN as TEST_IS_WIN } from '../helpers/platform'

describe('cross-platform paths', () => {
  describe('PATH_SEP', () => {
    it('uses the correct separator for the current OS', () => {
      if (TEST_IS_WIN) {
        expect(PATH_SEP).toBe(';')
      } else {
        expect(PATH_SEP).toBe(':')
      }
    })
  })

  describe('getExtendedToolPaths()', () => {
    it('returns non-empty array', () => {
      const paths = getExtendedToolPaths()
      expect(paths.length).toBeGreaterThan(0)
    })

    it('all entries are strings', () => {
      const paths = getExtendedToolPaths()
      paths.forEach((p) => expect(typeof p).toBe('string'))
    })

    if (TEST_IS_WIN) {
      it('contains Windows-style paths on Windows', () => {
        const paths = getExtendedToolPaths()
        expect(paths.some((p) => p.includes('\\'))).toBe(true)
      })

      it('does not contain Unix-style paths on Windows', () => {
        const paths = getExtendedToolPaths()
        expect(paths.some((p) => p.startsWith('/opt/'))).toBe(false)
      })
    }

    if (TEST_IS_MAC) {
      it('contains Unix-style paths on macOS', () => {
        const paths = getExtendedToolPaths()
        expect(paths.some((p) => p.startsWith('/'))).toBe(true)
      })

      it('does not contain Windows-style paths on macOS', () => {
        const paths = getExtendedToolPaths()
        expect(paths.some((p) => p.startsWith('C:\\'))).toBe(false)
      })
    }
  })

  describe('getDbToolPaths()', () => {
    it('returns non-empty array', () => {
      const paths = getDbToolPaths()
      expect(paths.length).toBeGreaterThan(0)
    })

    if (TEST_IS_WIN) {
      it('includes PostgreSQL Program Files path on Windows', () => {
        const paths = getDbToolPaths()
        expect(paths.some((p) => p.includes('PostgreSQL'))).toBe(true)
      })
    }

    if (TEST_IS_MAC) {
      it('includes homebrew postgresql paths on macOS', () => {
        const paths = getDbToolPaths()
        expect(paths.some((p) => p.includes('postgresql'))).toBe(true)
      })
    }
  })

  describe('getAnalysisToolPaths()', () => {
    it('returns non-empty array', () => {
      const paths = getAnalysisToolPaths()
      expect(paths.length).toBeGreaterThan(0)
    })

    if (TEST_IS_WIN) {
      it('includes Python Scripts path on Windows', () => {
        const paths = getAnalysisToolPaths()
        expect(paths.some((p) => p.includes('Python'))).toBe(true)
      })
    }

    if (TEST_IS_MAC) {
      it('includes homebrew path on macOS', () => {
        const paths = getAnalysisToolPaths()
        expect(paths.some((p) => p.includes('homebrew'))).toBe(true)
      })
    }
  })

  describe('path consistency', () => {
    it('getExtendedToolPaths and getDbToolPaths share common DB paths', () => {
      const extPaths = getExtendedToolPaths()
      const dbPaths = getDbToolPaths()
      // At least one DB path should be in the extended set
      const overlap = dbPaths.some((dp) => extPaths.includes(dp))
      expect(overlap).toBe(true)
    })
  })
})
