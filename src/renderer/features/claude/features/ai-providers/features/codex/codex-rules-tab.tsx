import { RulesManager } from '../../../../../../components/claude-settings/RulesManager'

interface Props {
  projectPath: string
}

export function CodexRulesTab({ projectPath }: Props) {
  return <RulesManager projectPath={projectPath} />
}
