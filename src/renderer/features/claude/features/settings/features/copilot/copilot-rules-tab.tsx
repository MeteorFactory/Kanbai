import { RulesManager } from '../../components/rules-manager'

interface Props {
  projectPath: string
}

export function CopilotRulesTab({ projectPath }: Props) {
  return <RulesManager projectPath={projectPath} />
}
