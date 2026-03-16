import React from 'react'

interface IconProps {
  size?: number
}

const ICON_SIZE = 14

function BaseFileIcon({ stroke, children, size = ICON_SIZE }: IconProps & { stroke: string; children?: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      {children}
    </svg>
  )
}

function CodeIcon({ size }: IconProps) {
  return (
    <BaseFileIcon stroke="#6C8CFF" size={size}>
      <path d="M10 12L8 14l2 2" />
      <path d="M14 12l2 2-2 2" />
    </BaseFileIcon>
  )
}

function WebIcon({ size }: IconProps) {
  return (
    <BaseFileIcon stroke="#E8834A" size={size}>
      <path d="M10 12L8 14l2 2" />
      <path d="M14 12l2 2-2 2" />
    </BaseFileIcon>
  )
}

function StyleIcon({ size }: IconProps) {
  return (
    <BaseFileIcon stroke="#A77BCA" size={size}>
      <circle cx="12" cy="15" r="2" />
    </BaseFileIcon>
  )
}

function DataIcon({ size }: IconProps) {
  return (
    <BaseFileIcon stroke="#E5C07B" size={size}>
      <path d="M8 13h3" />
      <path d="M8 17h5" />
    </BaseFileIcon>
  )
}

function ConfigIcon({ size }: IconProps) {
  return (
    <BaseFileIcon stroke="#8B949E" size={size}>
      <circle cx="12" cy="15" r="1.5" />
      <path d="M10 15h-2" />
      <path d="M14 15h2" />
    </BaseFileIcon>
  )
}

function DocIcon({ size }: IconProps) {
  return (
    <BaseFileIcon stroke="#56B6C2" size={size}>
      <path d="M8 13h8" />
      <path d="M8 17h5" />
    </BaseFileIcon>
  )
}

function ImageIcon({ size }: IconProps) {
  return (
    <BaseFileIcon stroke="#98C379" size={size}>
      <circle cx="10" cy="14" r="1.5" />
      <path d="M20 17l-3-3-5 5" />
    </BaseFileIcon>
  )
}

function ShellIcon({ size }: IconProps) {
  return (
    <BaseFileIcon stroke="#98C379" size={size}>
      <path d="M8 14l3 2-3 2" />
    </BaseFileIcon>
  )
}

function DatabaseIcon({ size }: IconProps) {
  return (
    <BaseFileIcon stroke="#E06C75" size={size}>
      <ellipse cx="12" cy="14" rx="4" ry="1.5" />
      <path d="M8 14v3c0 .8 1.8 1.5 4 1.5s4-.7 4-1.5v-3" />
    </BaseFileIcon>
  )
}

function TestIcon({ size }: IconProps) {
  return (
    <BaseFileIcon stroke="#98C379" size={size}>
      <path d="M9 15l2 2 4-4" />
    </BaseFileIcon>
  )
}

function LockIcon({ size }: IconProps) {
  return (
    <BaseFileIcon stroke="#8B949E" size={size}>
      <rect x="9" y="13" width="6" height="5" rx="1" />
      <path d="M10 13v-1a2 2 0 0 1 4 0v1" />
    </BaseFileIcon>
  )
}

function BinaryIcon({ size }: IconProps) {
  return (
    <BaseFileIcon stroke="#8B949E" size={size}>
      <path d="M9 13h1v5H9z" />
      <path d="M13 13h2v1h-2v1h2v1h-2v1h2v1h-2" />
    </BaseFileIcon>
  )
}

function FontIcon({ size }: IconProps) {
  return (
    <BaseFileIcon stroke="#A77BCA" size={size}>
      <path d="M10 18l2-6 2 6" />
      <path d="M10.5 16h3" />
    </BaseFileIcon>
  )
}

function VideoIcon({ size }: IconProps) {
  return (
    <BaseFileIcon stroke="#E06C75" size={size}>
      <path d="M11 13v5l4-2.5z" />
    </BaseFileIcon>
  )
}

function AudioIcon({ size }: IconProps) {
  return (
    <BaseFileIcon stroke="#E5C07B" size={size}>
      <circle cx="11" cy="16" r="2" />
      <path d="M13 16v-4" />
    </BaseFileIcon>
  )
}

function ArchiveIcon({ size }: IconProps) {
  return (
    <BaseFileIcon stroke="#E5C07B" size={size}>
      <rect x="10" y="12" width="4" height="2" />
      <rect x="10" y="15" width="4" height="2" />
    </BaseFileIcon>
  )
}

function DefaultFileIcon({ size }: IconProps) {
  return (
    <svg width={size ?? ICON_SIZE} height={size ?? ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke="#565C66" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    </svg>
  )
}

type IconComponent = React.FC<IconProps>

const EXTENSION_MAP: Record<string, IconComponent> = {
  // JavaScript / TypeScript
  js: CodeIcon,
  jsx: CodeIcon,
  ts: CodeIcon,
  tsx: CodeIcon,
  mjs: CodeIcon,
  cjs: CodeIcon,
  mts: CodeIcon,
  cts: CodeIcon,

  // Web
  html: WebIcon,
  htm: WebIcon,
  vue: WebIcon,
  svelte: WebIcon,
  astro: WebIcon,

  // Styles
  css: StyleIcon,
  scss: StyleIcon,
  sass: StyleIcon,
  less: StyleIcon,
  styl: StyleIcon,
  pcss: StyleIcon,

  // Data / Config (structured)
  json: DataIcon,
  jsonc: DataIcon,
  json5: DataIcon,
  yaml: DataIcon,
  yml: DataIcon,
  toml: DataIcon,
  xml: DataIcon,
  csv: DataIcon,
  tsv: DataIcon,

  // Config files
  ini: ConfigIcon,
  env: ConfigIcon,
  editorconfig: ConfigIcon,
  prettierrc: ConfigIcon,
  eslintrc: ConfigIcon,
  babelrc: ConfigIcon,
  browserslistrc: ConfigIcon,
  npmrc: ConfigIcon,
  nvmrc: ConfigIcon,

  // Documentation / Text
  md: DocIcon,
  mdx: DocIcon,
  txt: DocIcon,
  rtf: DocIcon,
  tex: DocIcon,
  rst: DocIcon,
  adoc: DocIcon,
  org: DocIcon,

  // Images
  png: ImageIcon,
  jpg: ImageIcon,
  jpeg: ImageIcon,
  gif: ImageIcon,
  svg: ImageIcon,
  webp: ImageIcon,
  avif: ImageIcon,
  ico: ImageIcon,
  bmp: ImageIcon,
  tiff: ImageIcon,
  tif: ImageIcon,

  // Video
  mp4: VideoIcon,
  webm: VideoIcon,
  mov: VideoIcon,
  avi: VideoIcon,
  mkv: VideoIcon,

  // Audio
  mp3: AudioIcon,
  wav: AudioIcon,
  ogg: AudioIcon,
  flac: AudioIcon,
  aac: AudioIcon,
  m4a: AudioIcon,

  // Shell / Scripts
  sh: ShellIcon,
  bash: ShellIcon,
  zsh: ShellIcon,
  fish: ShellIcon,
  ps1: ShellIcon,
  bat: ShellIcon,
  cmd: ShellIcon,

  // Backend / Systems languages
  py: CodeIcon,
  rb: CodeIcon,
  go: CodeIcon,
  rs: CodeIcon,
  java: CodeIcon,
  kt: CodeIcon,
  kts: CodeIcon,
  scala: CodeIcon,
  c: CodeIcon,
  h: CodeIcon,
  cpp: CodeIcon,
  cc: CodeIcon,
  cxx: CodeIcon,
  hpp: CodeIcon,
  hxx: CodeIcon,
  cs: CodeIcon,
  swift: CodeIcon,
  m: CodeIcon,
  mm: CodeIcon,
  r: CodeIcon,
  lua: CodeIcon,
  php: CodeIcon,
  pl: CodeIcon,
  pm: CodeIcon,
  ex: CodeIcon,
  exs: CodeIcon,
  erl: CodeIcon,
  hs: CodeIcon,
  clj: CodeIcon,
  cljs: CodeIcon,
  dart: CodeIcon,
  zig: CodeIcon,
  nim: CodeIcon,
  v: CodeIcon,
  d: CodeIcon,
  jl: CodeIcon,
  f90: CodeIcon,
  f95: CodeIcon,
  asm: CodeIcon,
  s: CodeIcon,
  proto: CodeIcon,
  graphql: CodeIcon,
  gql: CodeIcon,
  wasm: BinaryIcon,

  // Database
  sql: DatabaseIcon,
  sqlite: DatabaseIcon,
  db: DatabaseIcon,

  // Lock files
  lock: LockIcon,

  // Binary / Compiled
  exe: BinaryIcon,
  dll: BinaryIcon,
  so: BinaryIcon,
  dylib: BinaryIcon,
  o: BinaryIcon,
  a: BinaryIcon,
  class: BinaryIcon,
  pyc: BinaryIcon,

  // Fonts
  ttf: FontIcon,
  otf: FontIcon,
  woff: FontIcon,
  woff2: FontIcon,
  eot: FontIcon,

  // Archives
  zip: ArchiveIcon,
  tar: ArchiveIcon,
  gz: ArchiveIcon,
  bz2: ArchiveIcon,
  xz: ArchiveIcon,
  '7z': ArchiveIcon,
  rar: ArchiveIcon,
  tgz: ArchiveIcon,

  // PDF / Office
  pdf: DocIcon,
  doc: DocIcon,
  docx: DocIcon,
  xls: DataIcon,
  xlsx: DataIcon,
  ppt: DocIcon,
  pptx: DocIcon,
}

const FILENAME_MAP: Record<string, IconComponent> = {
  dockerfile: ConfigIcon,
  makefile: ConfigIcon,
  cmakelists: ConfigIcon,
  rakefile: ConfigIcon,
  gemfile: ConfigIcon,
  vagrantfile: ConfigIcon,
  procfile: ConfigIcon,
  justfile: ConfigIcon,
  taskfile: ConfigIcon,
  '.gitignore': ConfigIcon,
  '.gitattributes': ConfigIcon,
  '.gitmodules': ConfigIcon,
  '.dockerignore': ConfigIcon,
  '.eslintignore': ConfigIcon,
  '.prettierignore': ConfigIcon,
  '.env': ConfigIcon,
  '.env.local': ConfigIcon,
  '.env.example': ConfigIcon,
  '.editorconfig': ConfigIcon,
  '.npmrc': ConfigIcon,
  '.nvmrc': ConfigIcon,
  license: DocIcon,
  'license.md': DocIcon,
  'license.txt': DocIcon,
  changelog: DocIcon,
  'changelog.md': DocIcon,
  readme: DocIcon,
  'readme.md': DocIcon,
}

function isTestFile(filename: string): boolean {
  const lower = filename.toLowerCase()
  return (
    lower.includes('.test.') ||
    lower.includes('.spec.') ||
    lower.includes('.e2e.') ||
    lower.startsWith('test_') ||
    lower.endsWith('_test.py') ||
    lower.endsWith('_test.go')
  )
}

function getExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf('.')
  if (dotIndex <= 0) return ''
  return filename.slice(dotIndex + 1).toLowerCase()
}

export function getFileIcon(filename: string, size?: number): React.ReactElement {
  const lower = filename.toLowerCase()

  if (isTestFile(lower)) {
    return <TestIcon size={size} />
  }

  const filenameIcon = FILENAME_MAP[lower]
  if (filenameIcon) {
    const Icon = filenameIcon
    return <Icon size={size} />
  }

  const ext = getExtension(filename)
  const extIcon = EXTENSION_MAP[ext]
  if (extIcon) {
    const Icon = extIcon
    return <Icon size={size} />
  }

  return <DefaultFileIcon size={size} />
}

export function FolderIcon({ size = ICON_SIZE }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#6C8CFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  )
}
