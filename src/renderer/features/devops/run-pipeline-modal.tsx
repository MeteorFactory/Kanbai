import { useCallback, useState } from 'react'
import { useI18n } from '../../lib/i18n'

export function RunPipelineModal({
  pipelineName,
  initialBranch,
  initialParameters,
  onRun,
  onClose,
}: {
  pipelineName: string
  initialBranch: string
  initialParameters: Record<string, string>
  onRun: (branch: string, parameters: Record<string, string>) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const [branch, setBranch] = useState(initialBranch)
  const [params, setParams] = useState<Array<{ key: string; value: string }>>(
    () => {
      const entries = Object.entries(initialParameters)
      return entries.length > 0 ? entries.map(([key, value]) => ({ key, value })) : []
    },
  )

  const handleAddParam = useCallback(() => {
    setParams((prev) => [...prev, { key: '', value: '' }])
  }, [])

  const handleRemoveParam = useCallback((index: number) => {
    setParams((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const handleParamChange = useCallback((index: number, field: 'key' | 'value', newValue: string) => {
    setParams((prev) => prev.map((p, i) => i === index ? { ...p, [field]: newValue } : p))
  }, [])

  const handleSubmit = useCallback(() => {
    const paramObj: Record<string, string> = {}
    for (const p of params) {
      if (p.key.trim()) {
        paramObj[p.key.trim()] = p.value
      }
    }
    onRun(branch.trim(), paramObj)
  }, [branch, params, onRun])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }, [handleSubmit])

  return (
    <div className="devops-modal-overlay" onClick={onClose}>
      <div className="devops-modal-container devops-modal-container--sm" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="devops-modal-header">
          <h3>{t('devops.runPipelineTitle')}</h3>
          <button className="devops-modal-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        <p className="devops-modal-desc">{pipelineName}</p>
        <div className="devops-modal-body">
          <div className="devops-field">
            <label className="devops-field-label">{t('devops.branch')}</label>
            <input
              className="devops-field-input"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="main"
              autoFocus
            />
          </div>

          <div className="devops-params-section">
            <div className="devops-params-header">
              <label className="devops-field-label">{t('devops.parameters')}</label>
              <button
                className="devops-btn devops-btn--small"
                onClick={handleAddParam}
                title={t('devops.addParameter')}
              >
                +
              </button>
            </div>
            {params.map((param, index) => (
              <div key={index} className="devops-param-row">
                <input
                  className="devops-field-input devops-param-key"
                  value={param.key}
                  onChange={(e) => handleParamChange(index, 'key', e.target.value)}
                  placeholder={t('devops.paramKey')}
                />
                <input
                  className="devops-field-input devops-param-value"
                  value={param.value}
                  onChange={(e) => handleParamChange(index, 'value', e.target.value)}
                  placeholder={t('devops.paramValue')}
                />
                <button
                  className="devops-btn devops-btn--icon"
                  onClick={() => handleRemoveParam(index)}
                  title={t('devops.removeParameter')}
                >
                  {'\u2716'}
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="devops-modal-footer">
          <div className="devops-modal-footer-right">
            <button className="devops-modal-btn devops-modal-btn--secondary" onClick={onClose}>
              {t('devops.cancel')}
            </button>
            <button className="devops-modal-btn devops-modal-btn--primary" onClick={handleSubmit}>
              {'\u25B6'} {t('devops.run')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
