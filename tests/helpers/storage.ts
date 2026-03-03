import fs from 'fs'
import path from 'path'
import os from 'os'

const TEST_DATA_DIR = path.join(os.tmpdir(), '.kanbai-test-' + process.pid)

/**
 * Creates a temporary data directory for StorageService tests.
 * Returns the path and a cleanup function.
 */
export function createTestDataDir(): { dir: string; cleanup: () => void } {
  if (!fs.existsSync(TEST_DATA_DIR)) {
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true })
  }

  return {
    dir: TEST_DATA_DIR,
    cleanup: () => {
      if (fs.existsSync(TEST_DATA_DIR)) {
        fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true })
      }
    },
  }
}

/**
 * Writes test data directly to the storage file.
 */
export function writeTestData(dataPath: string, data: unknown): void {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf-8')
}

/**
 * Reads test data directly from the storage file.
 */
export function readTestData(dataPath: string): unknown {
  if (!fs.existsSync(dataPath)) return null
  return JSON.parse(fs.readFileSync(dataPath, 'utf-8'))
}
