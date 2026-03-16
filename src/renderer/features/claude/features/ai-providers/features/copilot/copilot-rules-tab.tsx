import { RulesManager } from '../../../../../../components/claude-settings/RulesManager'

interface Props {
  projectPath: string
}

export function CopilotRulesTab({ projectPath }: Props) {
  return <RulesManager projectPath={projectPath} />
}
