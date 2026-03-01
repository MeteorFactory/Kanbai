import { describe } from 'vitest'

export const IS_MAC = process.platform === 'darwin'
export const IS_WIN = process.platform === 'win32'

/** Wrapper for macOS-only tests */
export const describeMac = IS_MAC ? describe : describe.skip
/** Wrapper for Windows-only tests */
export const describeWin = IS_WIN ? describe : describe.skip
/** Wrapper for cross-platform tests */
export const describeAll = describe
