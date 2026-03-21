import { IpcMain } from 'electron'
import { v4 as uuid } from 'uuid'
import fs from 'fs'
import path from 'path'
import os from 'os'

import { IPC_CHANNELS, PromptTemplate, Locale } from '../../shared/types/index'
import { StorageService } from '../services/storage'

const storage = new StorageService()

const TEMPLATES_PATH = path.join(os.homedir(), '.kanbai', 'prompt-templates.json')

type TemplateEntry = Omit<PromptTemplate, 'id' | 'createdAt'>

const DEFAULT_TEMPLATES: Record<Locale, TemplateEntry[]> = {
  en: [
    {
      name: 'Bug fix',
      category: 'Development',
      content: 'Fix the following bug:\n\n**Problem**: \n**Steps to reproduce**: \n**Expected behavior**: \n**Actual behavior**: \n\nInvestigate the root cause and apply a minimal fix. Add a test if possible.',
    },
    {
      name: 'New feature',
      category: 'Development',
      content: 'Implement the following feature:\n\n**Feature**: \n**Requirements**:\n- \n- \n\n**Acceptance criteria**:\n- \n- \n\nFollow existing code patterns. Add tests.',
    },
    {
      name: 'Refactoring',
      category: 'Development',
      content: 'Refactor the following code:\n\n**Target**: \n**Goal**: \n**Constraints**:\n- Do not change external behavior\n- Maintain all existing tests\n- Keep backwards compatibility',
    },
    {
      name: 'Code review',
      category: 'Quality',
      content: 'Review the recent changes in this project:\n\n1. Check for bugs, edge cases, and security issues\n2. Verify error handling is adequate\n3. Check naming conventions and code readability\n4. Suggest improvements if needed\n\nProvide a summary of findings.',
    },
    {
      name: 'Write tests',
      category: 'Quality',
      content: 'Write tests for:\n\n**Target**: \n**Test types**: unit / integration / e2e\n\nCover:\n- Happy path\n- Edge cases\n- Error scenarios\n\nUse the existing test framework and follow project conventions.',
    },
    {
      name: 'Documentation',
      category: 'Documentation',
      content: 'Write documentation for:\n\n**Target**: \n**Audience**: developers / users / both\n\nInclude:\n- Overview and purpose\n- Usage examples\n- API reference (if applicable)\n- Common pitfalls',
    },
    {
      name: 'Performance optimization',
      category: 'Quality',
      content: 'Optimize performance of:\n\n**Target**: \n**Current issue**: \n**Metrics**: \n\nProfile the code, identify bottlenecks, and apply optimizations. Benchmark before and after.',
    },
    {
      name: 'Security audit',
      category: 'Quality',
      content: 'Perform a security audit on this project:\n\n1. Check for OWASP Top 10 vulnerabilities\n2. Review authentication and authorization\n3. Check for hardcoded secrets\n4. Verify input validation and sanitization\n5. Check dependencies for known vulnerabilities\n\nReport findings with severity levels.',
    },
    {
      name: 'Migration / Upgrade',
      category: 'Development',
      content: 'Migrate/upgrade the following:\n\n**From**: \n**To**: \n\n**Steps**:\n1. Assess breaking changes\n2. Update dependencies\n3. Fix compatibility issues\n4. Run and fix tests\n5. Verify functionality',
    },
    {
      name: 'API endpoint',
      category: 'Development',
      content: 'Create a new API endpoint:\n\n**Method**: GET / POST / PUT / DELETE\n**Path**: \n**Request body**: \n**Response**: \n**Authentication**: required / optional / none\n\nImplement with proper validation, error handling, and tests.',
    },
    {
      name: 'CI/CD pipeline',
      category: 'DevOps',
      content: 'Set up or improve the CI/CD pipeline:\n\n**Platform**: GitHub Actions / GitLab CI / other\n**Steps needed**:\n- Lint\n- Type check\n- Unit tests\n- Build\n- Deploy (if applicable)\n\nOptimize for speed with caching and parallelism.',
    },
    {
      name: 'Free prompt',
      category: 'General',
      content: '',
    },
  ],
  fr: [
    {
      name: 'Correction de bug',
      category: 'Development',
      content: 'Corrige le bug suivant :\n\n**Probleme** : \n**Etapes de reproduction** : \n**Comportement attendu** : \n**Comportement actuel** : \n\nAnalyse la cause racine et applique un correctif minimal. Ajoute un test si possible.',
    },
    {
      name: 'Nouvelle fonctionnalite',
      category: 'Development',
      content: 'Implemente la fonctionnalite suivante :\n\n**Fonctionnalite** : \n**Exigences** :\n- \n- \n\n**Criteres d\'acceptation** :\n- \n- \n\nSuis les patterns existants du code. Ajoute des tests.',
    },
    {
      name: 'Refactoring',
      category: 'Development',
      content: 'Refactorise le code suivant :\n\n**Cible** : \n**Objectif** : \n**Contraintes** :\n- Ne pas changer le comportement externe\n- Maintenir tous les tests existants\n- Garder la retrocompatibilite',
    },
    {
      name: 'Revue de code',
      category: 'Quality',
      content: 'Passe en revue les changements recents de ce projet :\n\n1. Chercher les bugs, cas limites et problemes de securite\n2. Verifier que la gestion d\'erreurs est adequate\n3. Verifier les conventions de nommage et la lisibilite\n4. Suggerer des ameliorations si necessaire\n\nFournis un resume des observations.',
    },
    {
      name: 'Ecrire des tests',
      category: 'Quality',
      content: 'Ecris des tests pour :\n\n**Cible** : \n**Types de tests** : unitaire / integration / e2e\n\nCouvrir :\n- Cas nominal\n- Cas limites\n- Scenarios d\'erreur\n\nUtilise le framework de test existant et suis les conventions du projet.',
    },
    {
      name: 'Documentation',
      category: 'Documentation',
      content: 'Redige la documentation pour :\n\n**Cible** : \n**Public** : developpeurs / utilisateurs / les deux\n\nInclure :\n- Vue d\'ensemble et objectif\n- Exemples d\'utilisation\n- Reference API (si applicable)\n- Pieges courants',
    },
    {
      name: 'Optimisation des performances',
      category: 'Quality',
      content: 'Optimise les performances de :\n\n**Cible** : \n**Probleme actuel** : \n**Metriques** : \n\nProfile le code, identifie les goulots d\'etranglement et applique des optimisations. Mesure avant et apres.',
    },
    {
      name: 'Audit de securite',
      category: 'Quality',
      content: 'Realise un audit de securite sur ce projet :\n\n1. Verifier les vulnerabilites OWASP Top 10\n2. Passer en revue l\'authentification et l\'autorisation\n3. Chercher les secrets codes en dur\n4. Verifier la validation et l\'assainissement des entrees\n5. Verifier les dependances pour les vulnerabilites connues\n\nRapporte les observations avec leur niveau de severite.',
    },
    {
      name: 'Migration / Mise a jour',
      category: 'Development',
      content: 'Migrer/mettre a jour les elements suivants :\n\n**De** : \n**Vers** : \n\n**Etapes** :\n1. Evaluer les changements cassants\n2. Mettre a jour les dependances\n3. Corriger les problemes de compatibilite\n4. Lancer et corriger les tests\n5. Verifier le fonctionnement',
    },
    {
      name: 'Endpoint API',
      category: 'Development',
      content: 'Cree un nouvel endpoint API :\n\n**Methode** : GET / POST / PUT / DELETE\n**Chemin** : \n**Corps de la requete** : \n**Reponse** : \n**Authentification** : requise / optionnelle / aucune\n\nImplemente avec une validation correcte, gestion d\'erreurs et tests.',
    },
    {
      name: 'Pipeline CI/CD',
      category: 'DevOps',
      content: 'Configure ou ameliore le pipeline CI/CD :\n\n**Plateforme** : GitHub Actions / GitLab CI / autre\n**Etapes necessaires** :\n- Lint\n- Verification des types\n- Tests unitaires\n- Build\n- Deploiement (si applicable)\n\nOptimise la vitesse avec du cache et du parallelisme.',
    },
    {
      name: 'Prompt libre',
      category: 'General',
      content: '',
    },
  ],
}

// English default names for detecting unmodified templates
const EN_DEFAULT_NAMES = new Set(DEFAULT_TEMPLATES.en.map((t) => t.name))

function getCurrentLocale(): Locale {
  return storage.getSettings().locale ?? 'fr'
}

function saveTemplates(templates: PromptTemplate[]): void {
  fs.writeFileSync(TEMPLATES_PATH, JSON.stringify(templates, null, 2), 'utf-8')
}

function seedTemplates(locale: Locale): PromptTemplate[] {
  const templates = DEFAULT_TEMPLATES[locale]
  const seeded: PromptTemplate[] = templates.map((t) => ({
    ...t,
    id: uuid(),
    createdAt: Date.now(),
  }))
  saveTemplates(seeded)
  return seeded
}

function loadTemplates(): PromptTemplate[] {
  const locale = getCurrentLocale()
  if (fs.existsSync(TEMPLATES_PATH)) {
    try {
      const existing: PromptTemplate[] = JSON.parse(fs.readFileSync(TEMPLATES_PATH, 'utf-8'))
      // If all templates are unmodified EN defaults and locale is FR, re-seed
      if (locale !== 'en' && existing.length > 0) {
        const allAreEnDefaults = existing.every((t) => EN_DEFAULT_NAMES.has(t.name))
        if (allAreEnDefaults) {
          return seedTemplates(locale)
        }
      }
      // If all templates are unmodified FR defaults and locale is EN, re-seed
      const frNames = new Set(DEFAULT_TEMPLATES.fr.map((t) => t.name))
      if (locale !== 'fr' && existing.length > 0) {
        const allAreFrDefaults = existing.every((t) => frNames.has(t.name))
        if (allAreFrDefaults) {
          return seedTemplates(locale)
        }
      }
      return existing
    } catch {
      return []
    }
  }
  // First use: seed with current locale
  return seedTemplates(locale)
}

export function registerPromptsHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(IPC_CHANNELS.PROMPTS_LIST, async () => {
    return loadTemplates()
  })

  ipcMain.handle(
    IPC_CHANNELS.PROMPTS_CREATE,
    async (_event, data: Omit<PromptTemplate, 'id' | 'createdAt'>) => {
      const templates = loadTemplates()
      const template: PromptTemplate = {
        id: uuid(),
        name: data.name,
        content: data.content,
        category: data.category,
        createdAt: Date.now(),
      }
      templates.push(template)
      saveTemplates(templates)
      return template
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.PROMPTS_UPDATE,
    async (_event, data: Partial<PromptTemplate> & { id: string }) => {
      const templates = loadTemplates()
      const idx = templates.findIndex((t) => t.id === data.id)
      if (idx >= 0) {
        templates[idx] = { ...templates[idx]!, ...data }
        saveTemplates(templates)
        return templates[idx]
      }
      return null
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.PROMPTS_DELETE,
    async (_event, { id }: { id: string }) => {
      const templates = loadTemplates().filter((t) => t.id !== id)
      saveTemplates(templates)
      return { success: true }
    },
  )
}
