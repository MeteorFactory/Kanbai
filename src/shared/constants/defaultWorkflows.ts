import type { Locale } from '../types'

export interface WorkflowSection {
  id: string
  title: string
  items: string[]
}

export interface DefaultWorkflow {
  id: string
  name: string
  description: string
  sections: WorkflowSection[]
}

export const WORKFLOW_MARKER = '<!-- KANBAI_WORKFLOW -->'

const WORKFLOW_EN: DefaultWorkflow = {
  id: 'default-workflow',
  name: 'Default Workflow',
  description: 'Orchestration workflow with planning, subagents, self-improvement, and verification',
  sections: [
    {
      id: 'plan',
      title: '1. Plan Mode',
      items: [
        'Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)',
        'If something goes sideways, STOP and re-plan immediately - don\'t keep pushing',
        'Use plan mode for verification steps, not just building',
        'Write detailed specs upfront to reduce ambiguity',
      ],
    },
    {
      id: 'subagent',
      title: '2. Subagent Strategy',
      items: [
        'Use subagents liberally to keep main context window clean',
        'Offload research, exploration, and parallel analysis to subagents',
        'For complex problems, throw more compute at it via subagents',
        'One task per subagent for focused execution',
      ],
    },
    {
      id: 'self-improvement',
      title: '3. Self-Improvement Loop',
      items: [
        'After ANY correction from the user: update tasks/lessons.md with the pattern',
        'Write rules for yourself that prevent the same mistake',
        'Ruthlessly iterate on these lessons until mistake rate drops',
        'Review lessons at session start for relevant project',
      ],
    },
    {
      id: 'verification',
      title: '4. Verification Before Done',
      items: [
        'Never mark a task complete without proving it works',
        'Diff behavior between main and your changes when relevant',
        'Ask yourself: "Would a staff engineer approve this?"',
        'Run tests, check logs, demonstrate correctness',
      ],
    },
    {
      id: 'elegance',
      title: '5. Demand Elegance (Balanced)',
      items: [
        'For non-trivial changes: pause and ask "is there a more elegant way?"',
        'If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"',
        'Skip this for simple, obvious fixes - don\'t over-engineer',
        'Challenge your own work before presenting it',
      ],
    },
    {
      id: 'bug-fixing',
      title: '6. Autonomous Bug Fixing',
      items: [
        'When given a bug report: just fix it. Don\'t ask for hand-holding',
        'Point at logs, errors, failing tests - then resolve them',
        'Zero context switching required from the user',
        'Go fix failing CI tests without being told how',
      ],
    },
  ],
}

const WORKFLOW_FR: DefaultWorkflow = {
  id: 'default-workflow',
  name: 'Workflow par defaut',
  description: 'Workflow d\'orchestration avec planification, sous-agents, auto-amelioration et verification',
  sections: [
    {
      id: 'plan',
      title: '1. Mode Plan',
      items: [
        'Entrer en mode plan pour TOUTE tache non triviale (3+ etapes ou decisions architecturales)',
        'Si quelque chose deraille, STOP et re-planifier immediatement - ne pas insister',
        'Utiliser le mode plan pour les etapes de verification, pas seulement la construction',
        'Ecrire des specifications detaillees en amont pour reduire l\'ambiguite',
      ],
    },
    {
      id: 'subagent',
      title: '2. Strategie Sous-Agents',
      items: [
        'Utiliser les sous-agents liberalement pour garder la fenetre de contexte principale propre',
        'Deleguer la recherche, l\'exploration et l\'analyse parallele aux sous-agents',
        'Pour les problemes complexes, utiliser plus de calcul via les sous-agents',
        'Une tache par sous-agent pour une execution concentree',
      ],
    },
    {
      id: 'self-improvement',
      title: '3. Boucle d\'Auto-Amelioration',
      items: [
        'Apres TOUTE correction de l\'utilisateur : mettre a jour tasks/lessons.md avec le pattern',
        'Ecrire des regles pour soi-meme qui empechent la meme erreur',
        'Iterer sans relache sur ces lecons jusqu\'a ce que le taux d\'erreur baisse',
        'Revoir les lecons au debut de chaque session pour le projet concerne',
      ],
    },
    {
      id: 'verification',
      title: '4. Verification Avant Terminaison',
      items: [
        'Ne jamais marquer une tache comme terminee sans prouver qu\'elle fonctionne',
        'Comparer le comportement entre main et vos changements quand c\'est pertinent',
        'Se demander : "Est-ce qu\'un ingenieur senior approuverait ceci ?"',
        'Lancer les tests, verifier les logs, demontrer la correction',
      ],
    },
    {
      id: 'elegance',
      title: '5. Exiger l\'Elegance (Equilibre)',
      items: [
        'Pour les changements non triviaux : pause et se demander "y a-t-il une facon plus elegante ?"',
        'Si un correctif semble hacky : "Sachant tout ce que je sais, implementer la solution elegante"',
        'Passer cette etape pour les correctifs simples et evidents - ne pas sur-concevoir',
        'Remettre en question son propre travail avant de le presenter',
      ],
    },
    {
      id: 'bug-fixing',
      title: '6. Correction Autonome de Bugs',
      items: [
        'Quand un rapport de bug arrive : le corriger directement. Ne pas demander d\'accompagnement',
        'Pointer les logs, erreurs, tests echoues - puis les resoudre',
        'Zero changement de contexte requis de la part de l\'utilisateur',
        'Aller corriger les tests CI en echec sans qu\'on vous le dise',
      ],
    },
  ],
}

export const DEFAULT_WORKFLOWS: Record<Locale, DefaultWorkflow> = {
  en: WORKFLOW_EN,
  fr: WORKFLOW_FR,
}

export function generateWorkflowMarkdown(workflow: DefaultWorkflow): string {
  const lines: string[] = [
    WORKFLOW_MARKER,
    '',
    '## Workflow Orchestration',
    '',
  ]

  for (const section of workflow.sections) {
    lines.push(`### ${section.title}`)
    for (const item of section.items) {
      lines.push(`- ${item}`)
    }
    lines.push('')
  }

  lines.push('## Task Management')
  lines.push('')
  lines.push('1. **Plan First**: Write plan to tasks/todo.md with checkable items')
  lines.push('2. **Verify Plan**: Check in before starting implementation')
  lines.push('3. **Track Progress**: Mark items complete as you go')
  lines.push('4. **Explain Changes**: High-level summary at each step')
  lines.push('5. **Document Results**: Add review section to tasks/todo.md')
  lines.push('6. **Capture Lessons**: Update tasks/lessons.md after corrections')
  lines.push('')
  lines.push('## Core Principles')
  lines.push('')
  lines.push('- **Simplicity First**: Make every change as simple as possible. Impact minimal code.')
  lines.push('- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.')
  lines.push('- **Minimal Impact**: Changes should only touch what\'s necessary.')
  lines.push('')

  return lines.join('\n')
}
