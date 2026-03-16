import { useState } from 'react'
import { useI18n } from '../../../../../../lib/i18n'
import { AI_PROVIDERS } from '../../../../../../../shared/types/ai-provider'
import { CardSelector } from '../../../../../../components/claude-settings/CardSelector'
import type { GeminiFullConfig } from './use-gemini-config'

const ACCENT_COLOR = AI_PROVIDERS.gemini.detectionColor

interface Props {
  config: GeminiFullConfig
  onUpdate: (patch: Partial<GeminiFullConfig>) => Promise<void>
}

function Toggle({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      className={`cs-toggle-switch${active ? ' cs-toggle-switch--active' : ''}`}
      style={active ? { background: ACCENT_COLOR } : undefined}
      onClick={onToggle}
    />
  )
}

function Row({ label, desc, children }: { label: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="cs-toggle-row">
      <div className="cs-toggle-info">
        <span className="cs-toggle-label">{label}</span>
        <span className="cs-toggle-desc">{desc}</span>
      </div>
      {children}
    </div>
  )
}

export function GeminiToolsTab({ config, onUpdate }: Props) {
  const { t } = useI18n()
  const [ignorePaths, setIgnorePaths] = useState(
    (config.context?.fileFiltering?.customIgnoreFilePaths ?? []).join('\n'),
  )

  const tools = config.tools ?? {}
  const shell = tools.shell ?? {}
  const ctx = config.context ?? {}
  const ff = ctx.fileFiltering ?? {}

  const setTools = (patch: Partial<NonNullable<GeminiFullConfig['tools']>>) =>
    onUpdate({ tools: { ...tools, ...patch } })

  const setShell = (patch: Partial<NonNullable<NonNullable<GeminiFullConfig['tools']>['shell']>>) =>
    onUpdate({ tools: { ...tools, shell: { ...shell, ...patch } } })

  const setCtx = (patch: Partial<NonNullable<GeminiFullConfig['context']>>) =>
    onUpdate({ context: { ...ctx, ...patch } })

  const setFileFiltering = (patch: Partial<NonNullable<NonNullable<GeminiFullConfig['context']>['fileFiltering']>>) =>
    onUpdate({ context: { ...ctx, fileFiltering: { ...ff, ...patch } } })

  const sandboxOptions = [
    { value: 'false', label: 'Off', description: t('gemini.sandboxOff') },
    { value: 'true', label: 'Auto', description: t('gemini.sandboxAuto') },
    { value: 'sandbox-exec', label: 'Seatbelt (macOS)', description: t('gemini.sandboxSeatbelt') },
    { value: 'docker', label: 'Docker', description: t('gemini.sandboxDocker') },
    { value: 'podman', label: 'Podman', description: t('gemini.sandboxPodman') },
  ]

  return (
    <div className="cs-general-tab">
      {/* Sandbox */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('gemini.sandbox')}</div>
        <div className="cs-general-card cs-agent-teams">
          <CardSelector
            label={t('gemini.sandboxMode')}
            options={sandboxOptions}
            value={String(config.tools?.shell?.enableInteractiveShell !== undefined ? 'custom' : (tools as Record<string, unknown>).sandbox ?? 'false')}
            onChange={(v) => {
              if (v === 'false') {
                const { ...rest } = tools
                onUpdate({ tools: { ...rest } })
              } else {
                onUpdate({ tools: { ...tools, ...({ sandbox: v === 'true' ? true : v } as Record<string, unknown>) } as GeminiFullConfig['tools'] })
              }
            }}
            accentColor={ACCENT_COLOR}
          />
        </div>
      </div>

      {/* Shell */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('gemini.shell')}</div>
        <div className="cs-general-card">
          <Row label={t('gemini.shellInteractive')} desc={t('gemini.shellInteractiveDesc')}>
            <Toggle active={shell.enableInteractiveShell ?? false} onToggle={() => setShell({ enableInteractiveShell: !shell.enableInteractiveShell })} />
          </Row>
          <Row label={t('gemini.shellColor')} desc={t('gemini.shellColorDesc')}>
            <Toggle active={shell.showColor ?? true} onToggle={() => setShell({ showColor: !(shell.showColor ?? true) })} />
          </Row>
        </div>
      </div>

      {/* Tool settings */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('gemini.toolSettings')}</div>
        <div className="cs-general-card">
          <Row label={t('gemini.useRipgrep')} desc={t('gemini.useRipgrepDesc')}>
            <Toggle active={tools.useRipgrep ?? true} onToggle={() => setTools({ useRipgrep: !(tools.useRipgrep ?? true) })} />
          </Row>
          <Row label={t('gemini.disableLLMCorrection')} desc={t('gemini.disableLLMCorrectionDesc')}>
            <Toggle active={tools.disableLLMCorrection ?? false} onToggle={() => setTools({ disableLLMCorrection: !tools.disableLLMCorrection })} />
          </Row>
          <Row label={t('gemini.truncateToolOutput')} desc={t('gemini.truncateToolOutputDesc')}>
            <input
              type="number"
              className="cs-input-number"
              value={tools.truncateToolOutputThreshold ?? 16000}
              min={0}
              step={1000}
              onChange={(e) => setTools({ truncateToolOutputThreshold: parseInt(e.target.value) || 16000 })}
              style={{ width: 100, textAlign: 'center' }}
            />
          </Row>
        </div>
      </div>

      {/* Context */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('gemini.contextSettings')}</div>
        <div className="cs-general-card">
          <Row label={t('gemini.discoveryMaxDirs')} desc={t('gemini.discoveryMaxDirsDesc')}>
            <input
              type="number"
              className="cs-input-number"
              value={ctx.discoveryMaxDirs ?? 50}
              min={1}
              onChange={(e) => setCtx({ discoveryMaxDirs: parseInt(e.target.value) || 50 })}
              style={{ width: 80, textAlign: 'center' }}
            />
          </Row>
          <Row label={t('gemini.loadMemoryFromIncludes')} desc={t('gemini.loadMemoryFromIncludesDesc')}>
            <Toggle active={ctx.loadMemoryFromIncludeDirectories ?? true} onToggle={() => setCtx({ loadMemoryFromIncludeDirectories: !(ctx.loadMemoryFromIncludeDirectories ?? true) })} />
          </Row>
        </div>
      </div>

      {/* File filtering */}
      <div className="cs-general-section">
        <div className="cs-general-section-header">{t('gemini.fileFiltering')}</div>
        <div className="cs-general-card">
          <Row label={t('gemini.respectGitIgnore')} desc={t('gemini.respectGitIgnoreDesc')}>
            <Toggle active={ff.respectGitIgnore ?? true} onToggle={() => setFileFiltering({ respectGitIgnore: !(ff.respectGitIgnore ?? true) })} />
          </Row>
          <Row label={t('gemini.respectGeminiIgnore')} desc={t('gemini.respectGeminiIgnoreDesc')}>
            <Toggle active={ff.respectGeminiIgnore ?? true} onToggle={() => setFileFiltering({ respectGeminiIgnore: !(ff.respectGeminiIgnore ?? true) })} />
          </Row>
          <Row label={t('gemini.enableRecursiveSearch')} desc={t('gemini.enableRecursiveSearchDesc')}>
            <Toggle active={ff.enableRecursiveFileSearch ?? true} onToggle={() => setFileFiltering({ enableRecursiveFileSearch: !(ff.enableRecursiveFileSearch ?? true) })} />
          </Row>
          <Row label={t('gemini.enableFuzzySearch')} desc={t('gemini.enableFuzzySearchDesc')}>
            <Toggle active={ff.enableFuzzySearch ?? true} onToggle={() => setFileFiltering({ enableFuzzySearch: !(ff.enableFuzzySearch ?? true) })} />
          </Row>
          <div style={{ marginTop: 12 }}>
            <span className="cs-toggle-label">{t('gemini.customIgnorePaths')}</span>
            <span className="cs-toggle-desc" style={{ display: 'block', marginBottom: 8 }}>{t('gemini.customIgnorePathsDesc')}</span>
            <textarea
              className="claude-md-editor"
              value={ignorePaths}
              onChange={(e) => setIgnorePaths(e.target.value)}
              onBlur={() => {
                const paths = ignorePaths.split('\n').map((p) => p.trim()).filter(Boolean)
                setFileFiltering({ customIgnoreFilePaths: paths.length > 0 ? paths : undefined })
              }}
              rows={4}
              spellCheck={false}
              placeholder="node_modules&#10;.git&#10;dist"
              style={{ fontFamily: 'monospace', fontSize: 12 }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
