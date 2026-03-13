import { IpcMain, net } from 'electron'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { IPC_CHANNELS, SkillStoreEntry, SkillStoreRepo } from '../../shared/types'

const SKILL_REPOS: SkillStoreRepo[] = [
  {
    id: 'everything-claude-code',
    owner: 'anthropics',
    repo: 'claude-code',
    displayName: 'Claude Code Official',
    description: 'Official Claude Code skills and examples',
    url: 'https://github.com/anthropics/claude-code',
  },
  {
    id: 'awesome-claude-skills',
    owner: 'ComposioHQ',
    repo: 'awesome-claude-skills',
    displayName: 'Awesome Claude Skills',
    description: 'Community-curated collection of Claude Code skills',
    url: 'https://github.com/ComposioHQ/awesome-claude-skills',
  },
  {
    id: 'everything-claude',
    owner: 'affaan-m',
    repo: 'everything-claude-code',
    displayName: 'Everything Claude Code',
    description: 'Comprehensive collection of Claude Code resources',
    url: 'https://github.com/affaan-m/everything-claude-code',
  },
  {
    id: 'marketingskills',
    owner: 'coreyhaines31',
    repo: 'marketingskills',
    displayName: 'Marketing Skills',
    description: 'Marketing-focused skills for Claude Code',
    url: 'https://github.com/coreyhaines31/marketingskills',
  },
]

const CACHE_DIR = path.join(os.homedir(), '.kanbai', 'cache', 'skills-store')
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

interface CachedData {
  fetchedAt: number
  skills: SkillStoreEntry[]
}

function getCachePath(repoId: string): string {
  return path.join(CACHE_DIR, `${repoId}.json`)
}

function readCache(repoId: string): CachedData | null {
  const cachePath = getCachePath(repoId)
  if (!fs.existsSync(cachePath)) return null
  try {
    const data = JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as CachedData
    if (Date.now() - data.fetchedAt < CACHE_TTL_MS) return data
    return null
  } catch {
    return null
  }
}

function writeCache(repoId: string, skills: SkillStoreEntry[]): void {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true })
  const data: CachedData = { fetchedAt: Date.now(), skills }
  fs.writeFileSync(getCachePath(repoId), JSON.stringify(data), 'utf-8')
}

/** Fetch JSON from a URL using Electron's net module (respects proxy settings). */
async function fetchJson(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = net.request(url)
    request.setHeader('User-Agent', 'Kanbai-Desktop')
    request.setHeader('Accept', 'application/vnd.github.v3+json')

    let body = ''
    request.on('response', (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`GitHub API returned ${response.statusCode} for ${url}`))
        return
      }
      response.on('data', (chunk) => { body += chunk.toString() })
      response.on('end', () => {
        try { resolve(JSON.parse(body)) } catch (err) { reject(err) }
      })
    })
    request.on('error', reject)
    request.end()
  })
}

/** Fetch raw file content from GitHub. */
async function fetchRaw(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = net.request(url)
    request.setHeader('User-Agent', 'Kanbai-Desktop')

    let body = ''
    request.on('response', (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`GitHub raw returned ${response.statusCode} for ${url}`))
        return
      }
      response.on('data', (chunk) => { body += chunk.toString() })
      response.on('end', () => resolve(body))
    })
    request.on('error', reject)
    request.end()
  })
}

interface GitHubTreeEntry {
  path: string
  type: string
  sha: string
}

interface GitHubTree {
  tree: GitHubTreeEntry[]
  truncated: boolean
}

/** Generic filenames that should be replaced by directory name or frontmatter name. */
const GENERIC_FILENAMES = new Set(['skill', 'index', 'main', 'readme'])

/** Parse skill frontmatter to extract name and description. */
function parseSkillMeta(filename: string, filePath: string, content: string): { name: string; description: string } {
  let name = filename.replace(/\.md(\.disabled)?$/, '')
  let description = ''

  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
  if (fmMatch?.[1]) {
    // Check frontmatter for explicit name
    const nameMatch = fmMatch[1].match(/^name:\s*["']?(.+?)["']?\s*$/m)
    if (nameMatch?.[1]) name = nameMatch[1]

    const descMatch = fmMatch[1].match(/^description:\s*["']?(.+?)["']?\s*$/m)
    if (descMatch?.[1]) description = descMatch[1]
  }

  // If filename is generic (e.g. "SKILL.md"), use the parent directory name
  if (GENERIC_FILENAMES.has(name.toLowerCase())) {
    const parts = filePath.split('/')
    if (parts.length >= 2) {
      name = parts[parts.length - 2]!
    }
  }

  // Try first heading as name if still generic
  if (GENERIC_FILENAMES.has(name.toLowerCase())) {
    const headingMatch = content.match(/^#\s+(.+)$/m)
    if (headingMatch?.[1]) name = headingMatch[1].trim()
  }

  if (!description) {
    // Try first non-heading, non-empty line after frontmatter
    const afterFm = content.replace(/^---\n[\s\S]*?\n---\n?/, '')
    const firstLine = afterFm.split('\n').find((l) => l.trim() && !l.startsWith('#'))
    if (firstLine) description = firstLine.trim().slice(0, 200)
  }

  return { name, description }
}

/** Fetch skills from a single GitHub repo. */
async function fetchRepoSkills(repo: SkillStoreRepo): Promise<SkillStoreEntry[]> {
  // Check cache first
  const cached = readCache(repo.id)
  if (cached) return cached.skills

  const skills: SkillStoreEntry[] = []

  try {
    // Get repo tree
    const treeUrl = `https://api.github.com/repos/${repo.owner}/${repo.repo}/git/trees/HEAD?recursive=1`
    const tree = (await fetchJson(treeUrl)) as GitHubTree

    // Filter for .md files that look like skills (not README, CHANGELOG, etc.)
    const skillFiles = tree.tree.filter((entry) => {
      if (entry.type !== 'blob') return false
      if (!entry.path.endsWith('.md')) return false
      const lower = entry.path.toLowerCase()
      if (lower === 'readme.md' || lower === 'changelog.md' || lower === 'contributing.md' || lower === 'license.md') return false
      if (lower.includes('readme.md')) return false
      // Look for files in skill-like directories or root .md files
      return true
    })

    // Limit to 50 files per repo to avoid excessive API calls
    const filesToFetch = skillFiles.slice(0, 50)

    // Fetch content for each skill file
    for (const file of filesToFetch) {
      try {
        const rawUrl = `https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/HEAD/${file.path}`
        const content = await fetchRaw(rawUrl)
        const meta = parseSkillMeta(path.basename(file.path), file.path, content)

        skills.push({
          id: `${repo.id}/${file.path}`,
          repoId: repo.id,
          name: meta.name,
          filename: path.basename(file.path),
          description: meta.description,
          content,
          path: file.path,
          repoUrl: `${repo.url}/blob/HEAD/${file.path}`,
          author: repo.owner,
          authorUrl: `https://github.com/${repo.owner}`,
        })
      } catch {
        // Skip files that fail to fetch
      }
    }

    writeCache(repo.id, skills)
  } catch {
    // Return empty on network error - will retry next time
  }

  return skills
}

/** Prefetch skills from all repos on app startup (non-blocking). */
export function prefetchSkillsStore(): void {
  Promise.allSettled(SKILL_REPOS.map((repo) => fetchRepoSkills(repo))).catch(() => {
    // Non-critical: skills will be fetched on demand later
  })
}

export function registerSkillsStoreHandlers(ipcMain: IpcMain): void {
  // Fetch all skills from all repos
  ipcMain.handle(
    IPC_CHANNELS.SKILLS_STORE_FETCH,
    async (_event, { force }: { force?: boolean } = {}) => {
      if (force) {
        // Clear cache to force refetch
        if (fs.existsSync(CACHE_DIR)) {
          for (const file of fs.readdirSync(CACHE_DIR)) {
            fs.unlinkSync(path.join(CACHE_DIR, file))
          }
        }
      }

      const results = await Promise.allSettled(
        SKILL_REPOS.map((repo) => fetchRepoSkills(repo)),
      )

      const allSkills: SkillStoreEntry[] = []
      for (const result of results) {
        if (result.status === 'fulfilled') {
          allSkills.push(...result.value)
        }
      }

      return { repos: SKILL_REPOS, skills: allSkills }
    },
  )

  // Install a skill from the store into the project
  ipcMain.handle(
    IPC_CHANNELS.SKILLS_STORE_INSTALL,
    async (_event, { projectPath, skill }: { projectPath: string; skill: SkillStoreEntry }) => {
      const skillsDir = path.join(projectPath, '.claude', 'skills')
      if (!fs.existsSync(skillsDir)) fs.mkdirSync(skillsDir, { recursive: true })

      const targetPath = path.join(skillsDir, skill.filename)
      if (fs.existsSync(targetPath)) {
        return { success: false, error: 'Skill already exists' }
      }

      // Inject store-origin metadata into frontmatter
      let contentToWrite = skill.content
      const fmMatch = contentToWrite.match(/^---\n([\s\S]*?)\n---/)
      if (fmMatch) {
        // Add store-origin to existing frontmatter
        const insertPos = contentToWrite.indexOf('\n---', 3)
        contentToWrite = contentToWrite.slice(0, insertPos) + `\nstore-origin: ${skill.repoUrl}` + contentToWrite.slice(insertPos)
      } else {
        // Wrap content with frontmatter containing store-origin
        contentToWrite = `---\nstore-origin: ${skill.repoUrl}\n---\n\n${contentToWrite}`
      }

      fs.writeFileSync(targetPath, contentToWrite, 'utf-8')
      return { success: true }
    },
  )
}
