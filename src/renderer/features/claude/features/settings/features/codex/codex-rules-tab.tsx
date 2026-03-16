import { RulesManager } from '../../components/rules-manager'

interface Props {
  projectPath: string
}

export function CodexRulesTab({ projectPath }: Props) {
  return <RulesManager projectPath={projectPath} />
}
