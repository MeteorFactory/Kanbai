import type { KanbanTask } from '../../../shared/types/index'
import type { AiProviderConfig } from '../../../shared/types/ai-provider'

export interface ShellCommandParams {
  taskId: string
  kanbanFilePath: string
  ticketLabel: string
  workspaceId: string
  isCtoMode: boolean
  providerConfig: AiProviderConfig
  relativePromptPath: string
  shellType: 'powershell' | 'cmd' | 'bash'
  isWin: boolean
}

export function buildShellCommand(params: ShellCommandParams): string {
  const {
    taskId, kanbanFilePath, ticketLabel, workspaceId,
    isCtoMode, providerConfig, relativePromptPath, shellType, isWin,
  } = params

  let unsetEnv: string
  let exportEnv: string
  let catCmd: string
  let recoverySuffix: string

  if (isWin && shellType === 'powershell') {
    unsetEnv = providerConfig.envVarsToUnset.length > 0
      ? providerConfig.envVarsToUnset.map((v) => `Remove-Item Env:${v} -ErrorAction SilentlyContinue`).join('; ') + '; '
      : ''
    exportEnv = `$env:KANBAI_KANBAN_TASK_ID="${taskId}"; $env:KANBAI_KANBAN_FILE="${kanbanFilePath}"; $env:KANBAI_KANBAN_TICKET="${ticketLabel}"; $env:KANBAI_WORKSPACE_ID="${workspaceId}"; `
    catCmd = `Get-Content "${relativePromptPath}" | `
    recoverySuffix = '; $recoveryScript = "$env:USERPROFILE\\.kanbai\\hooks\\kanbai-terminal-recovery.ps1"; if (Test-Path $recoveryScript) { & $recoveryScript }'
  } else if (isWin && shellType === 'cmd') {
    unsetEnv = providerConfig.envVarsToUnset.length > 0
      ? providerConfig.envVarsToUnset.map((v) => `set "${v}="`).join(' & ') + ' & '
      : ''
    exportEnv = `set "KANBAI_KANBAN_TASK_ID=${taskId}" & set "KANBAI_KANBAN_FILE=${kanbanFilePath}" & set "KANBAI_KANBAN_TICKET=${ticketLabel}" & set "KANBAI_WORKSPACE_ID=${workspaceId}" & `
    catCmd = `type "${relativePromptPath}" | `
    recoverySuffix = ` & if exist "%USERPROFILE%\\.kanbai\\hooks\\kanbai-terminal-recovery.ps1" powershell -ExecutionPolicy Bypass -File "%USERPROFILE%\\.kanbai\\hooks\\kanbai-terminal-recovery.ps1"`
  } else {
    unsetEnv = providerConfig.envVarsToUnset.length > 0
      ? `unset ${providerConfig.envVarsToUnset.join(' ')} && `
      : ''
    exportEnv = `export KANBAI_KANBAN_TASK_ID="${taskId}" KANBAI_KANBAN_FILE="${kanbanFilePath}" KANBAI_KANBAN_TICKET="${ticketLabel}" KANBAI_WORKSPACE_ID="${workspaceId}" && `
    catCmd = `cat "${relativePromptPath}" | `
    recoverySuffix = ' ; bash "$HOME/.kanbai/hooks/kanbai-terminal-recovery.sh"'
  }

  if (isCtoMode) {
    return `${unsetEnv}${exportEnv}${catCmd}${providerConfig.cliCommand} ${providerConfig.nonInteractiveArgs.join(' ')}${recoverySuffix}`
  } else {
    const escapedPrompt = `Lis et execute les instructions du fichier ${relativePromptPath}. Si le fichier n'existe pas, lis le ticket id  dans  et realise la tache decrite. Mets a jour le ticket (status DONE/FAILED/PENDING + result/error/question + updatedAt) a la fin.`
    return `${unsetEnv}${exportEnv}${providerConfig.cliCommand} ${providerConfig.interactiveArgs.join(' ')} "${escapedPrompt}"${recoverySuffix}`
  }
}

export async function detectShellType(): Promise<'powershell' | 'cmd' | 'bash'> {
  const isWin = navigator.platform.startsWith('Win')
  if (!isWin) return 'bash'
  try {
    const settings = await window.kanbai.settings.get()
    const shell = (settings.defaultShell || '').toLowerCase()
    if (shell.includes('cmd')) return 'cmd'
    if (shell.includes('bash')) return 'bash'
    return 'powershell'
  } catch {
    return 'powershell'
  }
}

export interface RegularPromptParams {
  task: KanbanTask
  ticketLabel: string
  kanbanFilePath: string
  provider: string
  providerDisplayName: string
  targetProjectPath?: string
  firstProjectPath?: string
}

export async function buildRegularPrompt(params: RegularPromptParams): Promise<string> {
  const { task, ticketLabel, kanbanFilePath, provider, providerDisplayName, targetProjectPath, firstProjectPath } = params

  const promptParts: Array<string | null> = [
    `> **IMPORTANT — OBLIGATION DE MISE A JOUR DU TICKET**`,
    `> Tu DOIS mettre a jour le fichier kanban \`${kanbanFilePath}\` (ticket id \`${task.id}\`) a la FIN de ton travail.`,
    `> Change \`status\` a \`DONE\` (ou \`FAILED\`/\`PENDING\` selon le cas), ajoute \`result\`/\`error\`/\`question\` + \`aiModel\` (nom exact du modele), et mets a jour \`updatedAt\` avec \`Date.now()\`.`,
    `> NE JAMAIS terminer sans avoir mis a jour le ticket.`,
    ``,
    `Tu travailles sur un ticket Kanban.`,
    ``,
    `## Ticket ${ticketLabel}`,
    `- **ID**: ${task.id}`,
    `- **Numero**: ${ticketLabel}`,
    `- **Titre**: ${task.title}`,
    task.description ? `- **Description**: ${task.description}` : null,
    task.originalDescription ? `- **Description originale** (avant pre-qualification): ${task.originalDescription}` : null,
    task.aiClarification ? `- **Clarification IA** (contexte supplementaire de la pre-qualification): ${task.aiClarification}` : null,
    `- **Priorite**: ${task.priority}`,
    task.targetProjectId ? `- **Scope**: Projet ${task.targetProjectId}` : `- **Scope**: Workspace entier`,
    task.splitFromId ? `- **Issu du ticket**: ${task.splitFromId} (split automatique)` : null,
  ]

  if (task.attachments && task.attachments.length > 0) {
    const imageAtts = task.attachments.filter((a) => a.mimeType.startsWith('image/'))
    const otherAtts = task.attachments.filter((a) => !a.mimeType.startsWith('image/'))

    if (otherAtts.length > 0) {
      promptParts.push(``, `## Fichiers joints`, `Les fichiers suivants sont attaches a ce ticket. Lis-les pour du contexte.`)
      for (const att of otherAtts) {
        promptParts.push(`- **${att.filename}** (${att.mimeType}): \`${att.storedPath}\``)
      }
    }

    if (imageAtts.length > 0) {
      promptParts.push(``, `## Images jointes`, `Les images suivantes sont jointes a ce ticket. Utilise le tool Read sur le chemin pour les visualiser.`)
      for (const att of imageAtts) {
        promptParts.push(`- **${att.filename}**: \`${att.storedPath}\``)
      }
    }
  }

  const isReopening = !!(task.result || task.error)

  if (task.conversationHistoryPath) {
    if (isReopening) {
      promptParts.push(
        ``,
        `## Historique de la session precedente`,
        `Ce ticket a deja ete traite dans une session precedente.`,
        `Le fichier suivant contient l'historique complet de cette conversation :`,
        `\`${task.conversationHistoryPath}\``,
        ``,
        `**IMPORTANT** : Lis ce fichier avec le tool Read pour comprendre ce qui a ete fait precedemment.`,
      )
    } else {
      promptParts.push(
        ``,
        `## Historique de la session precedente`,
        `Ce ticket a deja ete travaille dans une session precedente qui a ete interrompue.`,
        `Le fichier suivant contient l'historique complet de cette conversation :`,
        `\`${task.conversationHistoryPath}\``,
        ``,
        `**IMPORTANT** : Lis ce fichier avec le tool Read pour recuperer le contexte de ce qui a deja ete fait.`,
        `Reprends le travail la ou il s'est arrete, sans refaire ce qui a deja ete accompli.`,
      )
    }
  }

  if (isReopening) {
    promptParts.push(``, `## Contexte de reouverture`)
    if (task.result) {
      promptParts.push(`### Resultat precedent`, task.result)
    }
    if (task.error) {
      promptParts.push(`### Erreur precedente`, task.error)
    }
    promptParts.push(
      ``,
      `L'utilisateur a rouvert ce ticket. Lis attentivement les commentaires ci-dessous pour comprendre ce qu'il attend de cette reprise.`,
    )
  }

  if (task.comments && task.comments.length > 0) {
    const commentsTitle = isReopening
      ? `## INSTRUCTIONS DE REPRISE (commentaires de l'utilisateur)`
      : `## Commentaires de l'utilisateur`
    promptParts.push(``, commentsTitle)
    for (const comment of task.comments) {
      const date = new Date(comment.createdAt).toLocaleString('fr-FR')
      promptParts.push(`- **[${date}]** : ${comment.text}`)
    }
  }

  const multiAgentProjectPath = targetProjectPath ?? firstProjectPath
  if (multiAgentProjectPath) {
    try {
      const multiAgentResult = await window.kanbai.aiProvider.checkMultiAgent(provider, multiAgentProjectPath)
      if (multiAgentResult?.enabled) {
        promptParts.push(
          ``,
          `## Mode Multi-Agents`,
          `L'option multi-agents est **activee** pour le provider ${providerDisplayName}.`,
          `Tu DOIS utiliser les sous-agents/agents multiples pour realiser cette tache.`,
          `Decompose le travail en sous-taches et delegue-les a des agents specialises (architecture, implementation, tests, etc.).`,
          `Coordonne les agents et assure-toi que leurs contributions sont coherentes.`,
        )
      }
    } catch { /* multi-agent check is best-effort */ }
  }

  promptParts.push(
    ``,
    `## Fichier Kanban`,
    `Le fichier kanban se trouve a: ${kanbanFilePath}`,
    ``,
    `## Instructions`,
    `1. Realise la tache decrite ci-dessus dans le projet.`,
    `2. **AVANT de mettre a jour le ticket**, commit TOUS tes changements sur la branche de travail :`,
    `   - \`git add -A && git commit -m "feat(kanban): ${ticketLabel} - description courte"\``,
    `   - Ne laisse AUCUN changement non commite dans le worktree.`,
    `3. Quand tu as termine avec succes, edite le fichier \`${kanbanFilePath}\`:`,
    `   - Trouve le ticket avec l'id \`${task.id}\``,
    `   - Change son champ \`status\` de \`WORKING\` a \`DONE\``,
    `   - Ajoute un champ \`result\` avec un resume court de ce que tu as fait`,
    `   - Ajoute un champ \`aiModel\` avec le nom exact du modele IA que tu utilises (ex: "claude-opus-4-6", "gpt-4.1", "gemini-2.5-pro")`,
    `   - Mets a jour \`updatedAt\` avec \`Date.now()\``,
    `4. Si tu as besoin de precisions de l'utilisateur:`,
    `   - Change le status a \`PENDING\``,
    `   - Ajoute un champ \`question\` expliquant ce que tu as besoin de savoir`,
    `5. Si tu ne peux pas realiser la tache, change le status a \`FAILED\` et ajoute un champ \`error\` expliquant pourquoi.`,
    ``,
    `---`,
    `**RAPPEL FINAL** : Ta DERNIERE action avant de terminer doit TOUJOURS etre la mise a jour du fichier kanban \`${kanbanFilePath}\` pour le ticket \`${task.id}\`. Assure-toi d'avoir commite tous tes changements AVANT. Sans cette mise a jour, ton travail ne sera pas comptabilise.`,
  )

  return promptParts.filter(Boolean).join('\n')
}

export function buildCtoPrompt(task: KanbanTask, ticketLabel: string, kanbanFilePath: string): string {
  const childInfo = task.childTicketIds?.length
    ? `\n### Sous-tickets existants\nSous-tickets deja crees: ${task.childTicketIds.map((id) => `\`${id}\``).join(', ')}. Utilise \`kanban_list\` pour voir leur statut.`
    : ''

  const MAX_RESULT_CHARS = 2000
  const trimmedResult = task.result
    ? task.result.length > MAX_RESULT_CHARS
      ? `…${task.result.slice(-MAX_RESULT_CHARS)}`
      : task.result
    : null
  const previousContext = trimmedResult
    ? `\n### Contexte des sessions precedentes\n${trimmedResult}`
    : ''

  const conversationHistory = task.conversationHistoryPath
    ? `\n### Historique de la derniere session\nLis \`${task.conversationHistoryPath}\` avec Read pour recuperer le contexte.`
    : ''

  return [
    `> **REGLES CTO — IMPERATIVES**`,
    `> - **JAMAIS** passer ce ticket en \`DONE\` — c'est un ticket d'amelioration continue`,
    `> - **JAMAIS** coder, modifier des fichiers source, ou faire des commits — tu es CTO, pas developpeur`,
    `> - **TOUJOURS** creer des sous-tickets via \`kanban_create\` avec \`parentTicketId: "${task.id}"\``,
    `> - **EN FIN DE SESSION** : editer \`${kanbanFilePath}\` (ticket \`${task.id}\`) → status \`TODO\`, \`result\` avec bilan, \`aiModel\` avec le nom exact du modele IA utilise, \`updatedAt\` = \`Date.now()\``,
    `> - Si besoin de precisions : status \`PENDING\` + \`question\` | Si erreur bloquante : status \`FAILED\` + \`error\``,
    `> - **NE JAMAIS terminer sans avoir mis a jour le ticket**`,
    ``,
    `Tu es le **CTO** de ce projet. Tu analyses, evalues et crees des tickets — tu ne codes jamais.`,
    ``,
    `## Contexte`,
    `- Ticket: ${ticketLabel} (CTO) — ID: \`${task.id}\` — Kanban: \`${kanbanFilePath}\``,
    task.description ? `- Description: ${task.description}` : '',
    previousContext,
    conversationHistory,
    task.comments && task.comments.length > 0
      ? `\n### Commentaires de l'utilisateur\n${task.comments.map((c) => `- **[${new Date(c.createdAt).toLocaleString('fr-FR')}]** : ${c.text}`).join('\n')}`
      : '',
    childInfo,
    ``,
    `## Outils MCP`,
    `- **Kanban** : \`kanban_list\`, \`kanban_get\`, \`kanban_create\` (avec \`parentTicketId: "${task.id}"\`), \`kanban_update\`, \`kanban_delete\``,
    `- **Projet** : \`project_list\`, \`project_scan_info\`, \`workspace_info\`, \`project_setup_claude_rules\``,
    `- **Analyse** : \`analysis_detect_tools\`, \`analysis_run\`, \`analysis_list_reports\`, \`analysis_create_tickets\``,
    ``,
    `## Workflow`,
    `1. \`kanban_list\` — voir l'etat des sous-tickets existants`,
    `2. \`project_scan_info\` — scanner le(s) projet(s)`,
    `3. Lire les fichiers cles (README, package.json, CLAUDE.md)`,
    `4. Identifier 3-5 axes d'amelioration`,
    `5. Creer un sous-ticket par axe via \`kanban_create\` avec \`parentTicketId: "${task.id}"\``,
    `6. Mettre a jour ce ticket CTO : status \`TODO\`, \`result\` avec bilan, \`updatedAt\``,
  ].filter(Boolean).join('\n')
}
