import type { Locale } from '../types'

export interface DefaultSkill {
  id: string
  name: string
  description: string
  category: 'Git' | 'Development' | 'Quality' | 'Documentation' | 'Security' | 'DevOps' | 'Workflow'
  content: string
  filename: string
}

const SKILLS_EN: DefaultSkill[] = [
  {
    id: 'commit',
    name: '/commit',
    description: 'Generate a commit message automatically',
    category: 'Git',
    filename: 'commit.md',
    content: `---
description: Generate a commit message from staged changes
---

Analyze the current staged changes using \`git diff --cached\` and generate an appropriate commit message.

Rules:
1. Use Conventional Commits format (feat:, fix:, refactor:, docs:, test:, chore:)
2. First line: max 72 characters, imperative mood
3. Body: explain WHY, not WHAT (the diff shows what)
4. If multiple logical changes, suggest splitting into separate commits
5. Run \`git commit -m "message"\` with the generated message

Do NOT commit if no files are staged. Warn the user instead.
`,
  },
  {
    id: 'fix-issue',
    name: '/fix-issue',
    description: 'Fix a GitHub issue by number',
    category: 'Git',
    filename: 'fix-issue.md',
    content: `---
description: Fix a GitHub issue by number
---

$ARGUMENTS contains the issue number.

Steps:
1. Read the issue with \`gh issue view $ARGUMENTS\`
2. Analyze the codebase to understand the context
3. Implement the fix following existing code patterns
4. Write tests if applicable
5. Create a commit referencing the issue (e.g., "fix: resolve #$ARGUMENTS - description")
6. Optionally create a PR with \`gh pr create\`
`,
  },
  {
    id: 'pr-review',
    name: '/pr-review',
    description: 'Review a pull request',
    category: 'Git',
    filename: 'pr-review.md',
    content: `---
description: Review a pull request
---

$ARGUMENTS contains the PR number (optional - uses current branch PR if omitted).

Steps:
1. Get PR details: \`gh pr view $ARGUMENTS\` or \`gh pr view\`
2. Get the diff: \`gh pr diff $ARGUMENTS\`
3. Review for:
   - Bugs and edge cases
   - Security issues
   - Performance concerns
   - Code style and readability
   - Test coverage
4. Provide a structured review with actionable feedback
`,
  },
  {
    id: 'refactor',
    name: '/refactor',
    description: 'Refactoring following best practices',
    category: 'Development',
    filename: 'refactor.md',
    content: `---
description: Refactor code following best practices
---

$ARGUMENTS contains the target file or function to refactor.

Steps:
1. Read and understand the current code
2. Identify code smells (long functions, deep nesting, duplicated logic, etc.)
3. Plan the refactoring steps
4. Apply changes incrementally
5. Verify all existing tests still pass after each step
6. Run the test suite: \`npm test\` or equivalent

Principles: SOLID, DRY, KISS. Never change external behavior.
`,
  },
  {
    id: 'test',
    name: '/test',
    description: 'Generate test suites',
    category: 'Quality',
    filename: 'test.md',
    content: `---
description: Generate comprehensive test suites
---

$ARGUMENTS contains the target file or function to test.

Steps:
1. Read the target code and understand its behavior
2. Identify the testing framework in use (check package.json)
3. Write tests covering:
   - Happy path (normal usage)
   - Edge cases (empty inputs, boundaries, nulls)
   - Error scenarios (invalid inputs, network failures)
4. Follow existing test patterns in the project
5. Run the tests to verify they pass

Use descriptive test names that explain WHAT is being tested and EXPECTED behavior.
`,
  },
  {
    id: 'explain-code',
    name: '/explain-code',
    description: 'Explain code with diagrams',
    category: 'Documentation',
    filename: 'explain-code.md',
    content: `---
description: Explain code with diagrams and clear documentation
---

$ARGUMENTS contains the file or function to explain.

Provide:
1. **Overview**: What the code does and why it exists
2. **Architecture**: How it fits in the larger system
3. **Flow**: Step-by-step execution flow
4. **Key concepts**: Important patterns or algorithms used
5. **Diagram**: ASCII or Mermaid diagram of the flow/architecture
6. **Dependencies**: What it depends on and what depends on it
`,
  },
  {
    id: 'debug',
    name: '/debug',
    description: 'Debug with root cause analysis',
    category: 'Development',
    filename: 'debug.md',
    content: `---
description: Debug issues with systematic root cause analysis
---

$ARGUMENTS contains the error description or issue.

Methodology:
1. **Reproduce**: Understand the issue and how to reproduce it
2. **Isolate**: Narrow down the source (binary search through code/commits)
3. **Identify**: Find the root cause (not just the symptom)
4. **Fix**: Apply minimal, targeted fix
5. **Verify**: Confirm the fix works and doesn't break other things
6. **Prevent**: Add a test to catch regressions
`,
  },
  {
    id: 'doc-generate',
    name: '/doc-generate',
    description: 'Generate documentation',
    category: 'Documentation',
    filename: 'doc-generate.md',
    content: `---
description: Generate comprehensive project documentation
---

$ARGUMENTS contains the scope (file, module, or "project" for full docs).

Generate documentation including:
1. **README**: Project overview, setup, usage
2. **API Reference**: Functions, parameters, return types
3. **Architecture**: High-level design, module responsibilities
4. **Configuration**: Environment variables, config files
5. **Contributing**: Code style, PR process, testing requirements

Write documentation in Markdown format. Be concise and practical.
`,
  },
  {
    id: 'security-scan',
    name: '/security-scan',
    description: 'Vulnerability assessment',
    category: 'Security',
    filename: 'security-scan.md',
    content: `---
description: Perform a security vulnerability assessment
---

Scan the project for security issues:

1. **Dependencies**: Check for known vulnerabilities (\`npm audit\` or equivalent)
2. **Secrets**: Search for hardcoded API keys, passwords, tokens
3. **Injection**: Check for SQL injection, XSS, command injection risks
4. **Authentication**: Verify auth logic and session management
5. **Configuration**: Check for insecure defaults (CORS, CSP, etc.)

Output a security report with severity levels (CRITICAL/HIGH/MEDIUM/LOW) and remediation steps.
`,
  },
  {
    id: 'deploy-checklist',
    name: '/deploy-checklist',
    description: 'Pre-deployment checklist',
    category: 'DevOps',
    filename: 'deploy-checklist.md',
    content: `---
description: Generate a pre-deployment checklist
---

Analyze the project and generate a deployment checklist:

1. **Build**: Does \`npm run build\` succeed?
2. **Tests**: Do all tests pass?
3. **Types**: Does type checking pass?
4. **Lint**: Are there any lint errors?
5. **Dependencies**: Are dependencies up to date? Any vulnerabilities?
6. **Environment**: Are all required env variables documented?
7. **Database**: Any pending migrations?
8. **Breaking changes**: Any API changes that need communication?
9. **Monitoring**: Is logging and error tracking configured?
10. **Rollback**: Is the rollback plan documented?

Mark each item as PASS/FAIL/N-A with details.
`,
  },
  {
    id: 'ticket',
    name: '/ticket',
    description: 'Execute a kanban ticket with strict time-boxing',
    category: 'Workflow',
    filename: 'ticket.md',
    content: `---
description: Execute a kanban ticket with strict time-boxing (2-3 min exploration max)
---

$ARGUMENTS contains the ticket identifier (e.g., T-25) or the ticket file path.

## Execution Constraints

1. Read the specified ticket (max 1 min)
2. Read ONLY the files directly referenced by the ticket (max 2 min)
3. Start implementing immediately — produce code changes within the first 3 minutes
4. Do NOT do broad codebase exploration — ask the user if you need clarification
5. Run tests after implementation
6. Update the ticket status in the kanban file

## Workflow

1. Read the ticket and extract acceptance criteria
2. Identify the files to modify (max 3-5 files)
3. Implement the changes
4. Run \`npm run test\` to verify no regressions
5. Run \`npm run typecheck\` if the project is TypeScript
6. Update the ticket: status DONE + result field with summary
7. If blocked: status PENDING + question field

## Anti-patterns

- Do NOT spend the entire session exploring/planning without producing code
- Do NOT create a plan document — write code directly
- Do NOT explore more than 5 files not referenced by the ticket
`,
  },
  {
    id: 'ticket-tdd',
    name: '/ticket-tdd',
    description: 'Execute a kanban ticket in Test-Driven mode',
    category: 'Workflow',
    filename: 'ticket-tdd.md',
    content: `---
description: Execute a kanban ticket in Test-Driven mode (tests first, then implementation)
---

$ARGUMENTS contains the ticket identifier (e.g., T-25) or the ticket file path.

## Strict TDD Loop

1. Read the ticket and extract all acceptance criteria
2. Write failing unit/integration tests that encode each criterion
3. Run tests to confirm they fail
4. Implement the feature with minimal code to pass all tests
5. Re-run tests — if any fail, debug and fix without asking the user
6. Once all tests are green, run the full test suite to check for regressions
7. Update the ticket to DONE with the list of changed files and test results

## Rules

- NEVER mark the ticket as done before all tests pass
- Write tests BEFORE implementation
- Each acceptance criterion must have at least one test
- Cover edge cases: empty inputs, missing files, first-time runs
- Use the project's existing test framework (Vitest, pytest, etc.)

## Anti-patterns

- Do NOT implement without tests
- Do NOT ignore failing tests
- Do NOT write tests that test implementation rather than behavior
`,
  },
  {
    id: 'edge-review',
    name: '/edge-review',
    description: 'Edge-case review before marking work as done',
    category: 'Quality',
    filename: 'edge-review.md',
    content: `---
description: Edge-case and completeness review before marking work as done
---

$ARGUMENTS contains the description of the implemented feature or the modified files.

## Review Checklist

Before reporting work as done, systematically verify:

### 1. Edge Cases
- Empty or null inputs
- Missing or inaccessible files
- First-time execution (no existing data)
- Corrupted data or unexpected format
- Numeric boundaries (0, negatives, very large numbers)

### 2. Requirement Completeness
- Are ALL ticket criteria addressed?
- No partial or forgotten functionality?
- Are error messages clear and actionable?

### 3. Test Coverage
- Do tests cover the new behaviors?
- Are the edge cases identified above tested?
- Do existing tests still pass?

### 4. Triggers and Side Effects
- Does the behavior trigger ONLY at the right moment?
- No unintended automatic triggering?
- Are side effects documented?

## Actions

1. Run \`npm run test\` (or equivalent) to verify
2. If issues are found, fix them immediately
3. Summarize the verifications performed in the final report
`,
  },
]

const SKILLS_FR: DefaultSkill[] = [
  {
    id: 'commit',
    name: '/commit',
    description: 'Genere un message de commit automatiquement',
    category: 'Git',
    filename: 'commit.md',
    content: `---
description: Genere un message de commit depuis les changements stages
---

Analyse les changements stages avec \`git diff --cached\` et genere un message de commit appropriate.

Regles :
1. Utilise le format Conventional Commits (feat:, fix:, refactor:, docs:, test:, chore:)
2. Premiere ligne : max 72 caracteres, mode imperatif
3. Corps : explique POURQUOI, pas QUOI (le diff montre quoi)
4. Si plusieurs changements logiques, suggere de separer en commits distincts
5. Execute \`git commit -m "message"\` avec le message genere

NE committe PAS si aucun fichier n'est stage. Previens l'utilisateur.
`,
  },
  {
    id: 'fix-issue',
    name: '/fix-issue',
    description: 'Corrige un issue GitHub par numero',
    category: 'Git',
    filename: 'fix-issue.md',
    content: `---
description: Corrige un issue GitHub par numero
---

$ARGUMENTS contient le numero de l'issue.

Etapes :
1. Lis l'issue avec \`gh issue view $ARGUMENTS\`
2. Analyse le codebase pour comprendre le contexte
3. Implemente le correctif en suivant les patterns existants
4. Ecris des tests si applicable
5. Cree un commit referencant l'issue (ex: "fix: resout #$ARGUMENTS - description")
6. Optionnellement cree une PR avec \`gh pr create\`
`,
  },
  {
    id: 'pr-review',
    name: '/pr-review',
    description: 'Revue de pull request',
    category: 'Git',
    filename: 'pr-review.md',
    content: `---
description: Revue de pull request
---

$ARGUMENTS contient le numero de la PR (optionnel - utilise la PR de la branche courante si omis).

Etapes :
1. Recupere les details de la PR : \`gh pr view $ARGUMENTS\` ou \`gh pr view\`
2. Recupere le diff : \`gh pr diff $ARGUMENTS\`
3. Passe en revue :
   - Bugs et cas limites
   - Problemes de securite
   - Problemes de performance
   - Style de code et lisibilite
   - Couverture de tests
4. Fournis une revue structuree avec des retours actionnables
`,
  },
  {
    id: 'refactor',
    name: '/refactor',
    description: 'Refactoring suivant les bonnes pratiques',
    category: 'Development',
    filename: 'refactor.md',
    content: `---
description: Refactoring du code suivant les bonnes pratiques
---

$ARGUMENTS contient le fichier ou la fonction cible a refactorer.

Etapes :
1. Lis et comprends le code actuel
2. Identifie les code smells (fonctions trop longues, imbrication profonde, logique dupliquee, etc.)
3. Planifie les etapes de refactoring
4. Applique les changements incrementalement
5. Verifie que tous les tests existants passent apres chaque etape
6. Lance la suite de tests : \`npm test\` ou equivalent

Principes : SOLID, DRY, KISS. Ne jamais changer le comportement externe.
`,
  },
  {
    id: 'test',
    name: '/test',
    description: 'Genere des suites de tests',
    category: 'Quality',
    filename: 'test.md',
    content: `---
description: Genere des suites de tests completes
---

$ARGUMENTS contient le fichier ou la fonction cible a tester.

Etapes :
1. Lis le code cible et comprends son comportement
2. Identifie le framework de test utilise (verifie package.json)
3. Ecris des tests couvrant :
   - Cas nominal (utilisation normale)
   - Cas limites (entrees vides, bornes, nulls)
   - Scenarios d'erreur (entrees invalides, echecs reseau)
4. Suis les patterns de test existants dans le projet
5. Lance les tests pour verifier qu'ils passent

Utilise des noms de tests descriptifs qui expliquent CE QUI est teste et le COMPORTEMENT attendu.
`,
  },
  {
    id: 'explain-code',
    name: '/explain-code',
    description: 'Explique le code avec diagrammes',
    category: 'Documentation',
    filename: 'explain-code.md',
    content: `---
description: Explique le code avec diagrammes et documentation claire
---

$ARGUMENTS contient le fichier ou la fonction a expliquer.

Fournis :
1. **Vue d'ensemble** : Ce que fait le code et pourquoi il existe
2. **Architecture** : Comment il s'integre dans le systeme global
3. **Flux** : Flux d'execution etape par etape
4. **Concepts cles** : Patterns ou algorithmes importants utilises
5. **Diagramme** : Diagramme ASCII ou Mermaid du flux/architecture
6. **Dependances** : De quoi il depend et ce qui depend de lui
`,
  },
  {
    id: 'debug',
    name: '/debug',
    description: 'Debug avec analyse de cause racine',
    category: 'Development',
    filename: 'debug.md',
    content: `---
description: Debug des problemes avec analyse systematique de cause racine
---

$ARGUMENTS contient la description de l'erreur ou du probleme.

Methodologie :
1. **Reproduire** : Comprendre le probleme et comment le reproduire
2. **Isoler** : Reduire la source (recherche binaire dans le code/commits)
3. **Identifier** : Trouver la cause racine (pas juste le symptome)
4. **Corriger** : Appliquer un correctif minimal et cible
5. **Verifier** : Confirmer que le correctif fonctionne sans casser le reste
6. **Prevenir** : Ajouter un test pour detecter les regressions
`,
  },
  {
    id: 'doc-generate',
    name: '/doc-generate',
    description: 'Genere la documentation',
    category: 'Documentation',
    filename: 'doc-generate.md',
    content: `---
description: Genere une documentation complete du projet
---

$ARGUMENTS contient le scope (fichier, module, ou "projet" pour la doc complete).

Genere une documentation incluant :
1. **README** : Vue d'ensemble, installation, utilisation
2. **Reference API** : Fonctions, parametres, types de retour
3. **Architecture** : Design de haut niveau, responsabilites des modules
4. **Configuration** : Variables d'environnement, fichiers de config
5. **Contribution** : Style de code, processus PR, exigences de tests

Redige la documentation au format Markdown. Sois concis et pratique.
`,
  },
  {
    id: 'security-scan',
    name: '/security-scan',
    description: 'Evaluation de vulnerabilites',
    category: 'Security',
    filename: 'security-scan.md',
    content: `---
description: Realise une evaluation de vulnerabilites de securite
---

Scanne le projet pour les problemes de securite :

1. **Dependances** : Verifie les vulnerabilites connues (\`npm audit\` ou equivalent)
2. **Secrets** : Recherche les cles API, mots de passe, tokens codes en dur
3. **Injection** : Verifie les risques d'injection SQL, XSS, injection de commandes
4. **Authentification** : Verifie la logique d'auth et la gestion des sessions
5. **Configuration** : Verifie les parametres par defaut insecures (CORS, CSP, etc.)

Produis un rapport de securite avec niveaux de severite (CRITIQUE/HAUTE/MOYENNE/BASSE) et etapes de remediation.
`,
  },
  {
    id: 'deploy-checklist',
    name: '/deploy-checklist',
    description: 'Checklist pre-deploiement',
    category: 'DevOps',
    filename: 'deploy-checklist.md',
    content: `---
description: Genere une checklist pre-deploiement
---

Analyse le projet et genere une checklist de deploiement :

1. **Build** : Est-ce que \`npm run build\` reussit ?
2. **Tests** : Est-ce que tous les tests passent ?
3. **Types** : Est-ce que la verification de types passe ?
4. **Lint** : Y a-t-il des erreurs de lint ?
5. **Dependances** : Les dependances sont-elles a jour ? Des vulnerabilites ?
6. **Environnement** : Toutes les variables d'env requises sont-elles documentees ?
7. **Base de donnees** : Des migrations en attente ?
8. **Breaking changes** : Des changements d'API necessitant une communication ?
9. **Monitoring** : Le logging et le suivi d'erreurs sont-ils configures ?
10. **Rollback** : Le plan de rollback est-il documente ?

Marque chaque element comme OK/ECHEC/N-A avec des details.
`,
  },
  {
    id: 'ticket',
    name: '/ticket',
    description: 'Execute un ticket Kanban avec time-boxing strict',
    category: 'Workflow',
    filename: 'ticket.md',
    content: `---
description: Execute un ticket Kanban avec time-boxing strict (2-3 min exploration max)
---

$ARGUMENTS contient l'identifiant du ticket (ex: T-25) ou le chemin du fichier ticket.

## Contraintes d'execution

1. Lis le ticket specifie (max 1 min)
2. Lis UNIQUEMENT les fichiers directement references par le ticket (max 2 min)
3. Commence a implementer immediatement — produis des changements de code dans les 3 premieres minutes
4. NE FAIS PAS d'exploration large du codebase — demande a l'utilisateur si tu as besoin de clarification
5. Lance les tests apres implementation
6. Mets a jour le statut du ticket dans le fichier kanban

## Workflow

1. Lire le ticket et extraire les criteres d'acceptation
2. Identifier les fichiers a modifier (max 3-5 fichiers)
3. Implementer les changements
4. Lancer \`npm run test\` pour verifier aucune regression
5. Lancer \`npm run typecheck\` si le projet est TypeScript
6. Mettre a jour le ticket: status DONE + champ result avec resume
7. Si bloque: status PENDING + champ question

## Anti-patterns

- NE PAS passer toute la session a explorer/planifier sans produire de code
- NE PAS creer de document de plan — ecrire du code directement
- NE PAS explorer plus de 5 fichiers non references par le ticket
`,
  },
  {
    id: 'ticket-tdd',
    name: '/ticket-tdd',
    description: 'Execute un ticket Kanban en mode Test-Driven',
    category: 'Workflow',
    filename: 'ticket-tdd.md',
    content: `---
description: Execute un ticket Kanban en mode Test-Driven (tests d'abord, puis implementation)
---

$ARGUMENTS contient l'identifiant du ticket (ex: T-25) ou le chemin du fichier ticket.

## Boucle TDD stricte

1. Lis le ticket et extrais tous les criteres d'acceptation
2. Ecris des tests unitaires/integration qui echouent et encodent chaque critere
3. Lance les tests pour confirmer qu'ils echouent
4. Implemente la fonctionnalite avec le minimum de code pour passer tous les tests
5. Relance les tests — si un test echoue, debug et corrige sans demander a l'utilisateur
6. Une fois tous les tests verts, lance la suite de tests complete pour verifier les regressions
7. Mets a jour le ticket a DONE avec la liste des fichiers modifies et les resultats de tests

## Regles

- NE JAMAIS marquer le ticket comme termine avant que tous les tests passent
- Ecrire les tests AVANT l'implementation
- Chaque critere d'acceptation doit avoir au moins un test
- Couvrir les cas limites : entrees vides, fichiers manquants, premiere execution
- Utiliser le framework de test existant du projet (Vitest, pytest, etc.)

## Anti-patterns

- NE PAS implementer sans tests
- NE PAS ignorer les tests en echec
- NE PAS ecrire des tests qui testent l'implementation plutot que le comportement
`,
  },
  {
    id: 'edge-review',
    name: '/edge-review',
    description: 'Revue des cas limites avant de marquer un travail comme termine',
    category: 'Quality',
    filename: 'edge-review.md',
    content: `---
description: Revue des cas limites et completude avant de marquer un travail comme termine
---

$ARGUMENTS contient la description de la fonctionnalite implementee ou les fichiers modifies.

## Checklist de revue

Avant de reporter le travail comme termine, verifie systematiquement :

### 1. Cas limites
- Entrees vides ou nulles
- Fichiers manquants ou inaccessibles
- Premiere execution (pas de donnees existantes)
- Donnees corrompues ou format inattendu
- Limites numeriques (0, negatifs, tres grands nombres)

### 2. Completude des exigences
- TOUS les criteres du ticket sont-ils adresses ?
- Aucune fonctionnalite partielle ou oubliee ?
- Les messages d'erreur sont-ils clairs et actionnables ?

### 3. Couverture de tests
- Les tests couvrent-ils les nouveaux comportements ?
- Les cas limites identifies ci-dessus ont-ils des tests ?
- Les tests existants passent-ils toujours ?

### 4. Triggers et effets de bord
- Le comportement se declenche-t-il UNIQUEMENT au bon moment ?
- Pas de declenchement automatique non desire ?
- Les effets de bord sont-ils documentes ?

## Actions

1. Lance \`npm run test\` (ou equivalent) pour verifier
2. Si des problemes sont trouves, corrige-les immediatement
3. Resumer les verifications effectuees dans le rapport final
`,
  },
]

export const DEFAULT_SKILLS: Record<Locale, DefaultSkill[]> = {
  en: SKILLS_EN,
  fr: SKILLS_FR,
}
