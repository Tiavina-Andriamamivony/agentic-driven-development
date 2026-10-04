# Cahier des charges — Agentic-Driven Development (ADD)

**Version :** 0.1 — Draft de conception  
**Statut :** Spécification produit et technique  
**Nature :** Control plane / orchestration layer pour agents de développement  
**Runtime cible :** OpenCode  
**Principe directeur :** l'agent exécute, le système gouverne, l'humain reste l'autorité finale.

---

## 1. Résumé exécutif

### 1.1 Problème

Le _vibe coding_ permet de produire rapidement beaucoup de code, mais cette vitesse peut entraîner :

- perte de compréhension du système ;
- décisions architecturales implicites ;
- dette technique ;
- code mort ou inutile ;
- tests insuffisants ou écrits après coup ;
- régressions ;
- modifications destructrices ;
- perte de contrôle sur la base de données ou l'infrastructure ;
- absence de traçabilité entre le besoin initial et le code produit.

Le problème n'est donc pas uniquement la qualité du code généré. Le problème fondamental est la **perte de contrôle du processus d'ingénierie**.

### 1.2 Vision

Agentic-Driven Development (ADD) est une méthodologie et une plateforme d'orchestration permettant à des agents de développement autonomes de travailler dans un cadre d'ingénierie logiciel explicite.

L'objectif est de conserver la vitesse et la puissance des agents tout en réintroduisant :

- planification ;
- compréhension du contexte ;
- conventions ;
- architecture explicite ;
- tests ;
- vérification ;
- sécurité ;
- Git workflow ;
- revue ;
- traçabilité ;
- approbations humaines.

### 1.3 Positionnement

ADD n'est pas un nouvel IDE et n'a pas vocation à remplacer OpenCode.

> **OpenCode exécute. ADD gouverne et orchestre.**

Architecture conceptuelle :

```text
Human
  │
  ▼
Kanban / Ticket
  │
  ▼
┌──────────────────────────────┐
│       ADD CONTROL PLANE      │
│                              │
│ Context                      │
│ Planning                     │
│ Policies                     │
│ Agent orchestration          │
│ Testing strategy             │
│ Permissions                  │
│ Verification                 │
│ Git workflow                 │
│ Review                       │
│ Audit / traceability         │
└──────────────┬───────────────┘
               │
               ▼
          OpenCode
               │
       ┌───────┼────────┐
       ▼       ▼        ▼
     Code    Tests    Analysis
       │       │        │
       └───────┼────────┘
               ▼
          Verification
               │
               ▼
              PR
               │
               ▼
        Review Agent(s)
               │
               ▼
             Human
               │
               ▼
            Preprod
```

---

# 2. Objectifs

## 2.1 Objectif principal

Permettre à un développeur de déléguer une partie importante du travail de développement à des agents tout en conservant le contrôle sur :

- ce qui doit être construit ;
- pourquoi cela doit être construit ;
- comment cela doit être construit ;
- quelles règles doivent être respectées ;
- comment le résultat est vérifié ;
- quelles modifications peuvent être exécutées ;
- quand l'agent doit s'arrêter ;
- quand une décision humaine est obligatoire.

## 2.2 Objectifs secondaires

Le système doit :

1. onboarder automatiquement un repository ;
2. comprendre sa stack et son architecture ;
3. détecter ses conventions existantes ;
4. formaliser les conventions manquantes ;
5. connecter le repository à un Kanban ;
6. transformer un ticket en plan d'implémentation ;
7. poser les questions nécessaires avant l'implémentation ;
8. conserver les décisions prises ;
9. appliquer une politique d'ingénierie configurable ;
10. générer une stratégie de tests ;
11. écrire et vérifier les tests avant le code métier ;
12. orchestrer plusieurs agents spécialisés ;
13. isoler les permissions des agents ;
14. empêcher les opérations dangereuses sans approbation ;
15. utiliser des environnements isolés ;
16. gérer le workflow Git ;
17. créer et analyser les Pull Requests ;
18. effectuer une pré-review agentique ;
19. fournir une boucle de rétroaction contrôlée ;
20. produire une trace complète des décisions et actions.

---

# 3. Non-objectifs

Le projet ne doit pas devenir :

- un clone de Cursor ;
- un simple wrapper LLM ;
- un générateur automatique de CRUD ;
- un système qui remplace systématiquement le développeur ;
- un agent ayant accès sans restriction à la production ;
- une abstraction opaque qui masque les décisions de l'IA ;
- un framework imposant un modèle LLM unique.

Le produit doit rester **model-agnostic, runtime-oriented et policy-driven**.

---

# 4. Principes fondamentaux

## 4.1 Human-in-the-loop

L'humain reste l'autorité finale sur les décisions à fort impact.

## 4.2 Least privilege

Chaque agent ne reçoit que les permissions nécessaires à sa tâche.

## 4.3 Test before business implementation

Le comportement attendu doit être spécifié et testable avant l'implémentation métier lorsque la nature de la tâche le permet.

## 4.4 Small blast radius

Les agents doivent privilégier des modifications petites, isolées et réversibles.

## 4.5 Explicit over implicit

Les décisions importantes doivent être explicites et enregistrées.

## 4.6 Verification over trust

Le système ne doit pas considérer une affirmation de l'agent comme une preuve.

Exemple :

```text
Agent: "The tests pass."
```

n'est pas suffisant.

Le système doit exécuter les tests et vérifier le résultat.

## 4.7 Fail closed

Lorsqu'une opération critique ne peut pas être évaluée correctement, le système doit préférer l'arrêt à l'exécution.

## 4.8 Model agnostic

Le système doit pouvoir orchestrer différents modèles selon le type de tâche.

## 4.9 Reproducibility

Une exécution doit pouvoir être retracée et, autant que possible, reproduite.

---

# 5. Méthodologie Agentic-Driven Development

Le workflow ADD repose sur les phases suivantes :

```text
Requirement
    ↓
Discovery
    ↓
Questions
    ↓
Decision
    ↓
Plan
    ↓
Human Approval
    ↓
Test Design
    ↓
Test Implementation
    ↓
Test Verification
    ↓
Implementation
    ↓
Verification
    ↓
Review
    ↓
Human Approval
    ↓
Pull Request
    ↓
Pre-production
```

Chaque phase possède :

- des préconditions ;
- des permissions ;
- des entrées ;
- des sorties ;
- des validateurs ;
- des critères de sortie.

---

# 6. `/init` — Project Onboarding

## 6.1 Objectif

`/init` permet à ADD de comprendre un repository avant toute modification.

Exemple :

```bash
add init
```

## 6.2 Analyse

Le système doit détecter :

### Stack

- langage ;
- framework ;
- runtime ;
- package manager ;
- ORM ;
- base de données ;
- frontend ;
- backend ;
- infrastructure ;
- CI/CD ;
- testing frameworks.

### Architecture

- structure des dossiers ;
- modules ;
- couches ;
- dépendances ;
- patterns utilisés ;
- conventions de nommage.

### Git

- branches ;
- conventions de commit ;
- PR workflow ;
- protections de branches.

### Tests

- unitaires ;
- intégration ;
- E2E ;
- couverture ;
- outils de test.

### Documentation

- README ;
- architecture ;
- contribution ;
- ADR ;
- documentation technique.

## 6.3 Règle fondamentale

`/init` est **read-only par défaut**.

Il ne doit rien modifier sans approbation explicite.

## 6.4 Rapport d'onboarding

Exemple :

```text
PROJECT ONBOARDING

Stack
├── TypeScript
├── Next.js
├── PostgreSQL
└── Prisma

Testing
├── Unit: Vitest
├── Integration: Vitest
└── E2E: Playwright

Architecture
├── app/
├── components/
├── services/
└── repositories/

Detected conventions
...

Potential risks
...

Missing documentation
...
```

---

# 7. Project Constitution

ADD doit disposer d'un ensemble de règles persistantes.

Structure proposée :

```text
.add/
├── constitution.md
├── architecture.md
├── conventions.md
├── testing.md
├── security.md
├── workflow.md
├── decisions/
├── agents/
│   ├── planner.md
│   ├── tester.md
│   ├── developer.md
│   ├── reviewer.md
│   └── security.md
└── runs/
```

## 7.1 Constitution

Exemple :

```markdown
# Project Constitution

1. Never modify production automatically.
2. Never execute destructive database operations without approval.
3. Never bypass required tests.
4. Every feature must have acceptance criteria.
5. Every business rule must be testable.
6. Follow existing architecture unless an approved decision changes it.
7. Prefer KISS.
8. Apply YAGNI.
9. Apply SOLID where appropriate.
10. Minimize blast radius.
11. Avoid unnecessary dependencies.
12. Every architectural decision must be explainable.
```

La constitution doit être configurable par projet et par organisation.

---

# 8. Engineering Policy

Le système doit supporter des politiques d'ingénierie.

## 8.1 Principes par défaut

- KISS ;
- YAGNI ;
- SOLID ;
- DRY lorsque pertinent ;
- fail fast ;
- least privilege ;
- defense in depth ;
- explicit error handling ;
- small functions ;
- controlled dependencies ;
- deterministic operations.

## 8.2 NASA / Power of Ten

ADD peut fournir une politique inspirée des principes de programmation sûre popularisés par les règles "Power of Ten" du JPL/NASA.

Cette politique doit être présentée comme une **baseline configurable**, et non comme une norme universelle applicable sans contexte.

Exemples de règles :

1. contrôler la complexité du flux ;
2. limiter les branches et chemins difficiles à vérifier ;
3. éviter les effets de bord cachés ;
4. limiter la complexité cyclomatique ;
5. privilégier des fonctions courtes ;
6. rendre les erreurs explicites ;
7. limiter les dépendances ;
8. favoriser les comportements déterministes ;
9. éviter les abstractions inutiles ;
10. rendre les opérations critiques vérifiables.

## 8.3 Exceptions

Une règle peut être violée uniquement avec :

```text
Rule
↓
Violation
↓
Reason
↓
Exception
↓
Approval
```

---

# 9. Intégration Kanban

## 9.1 Première intégration cible

GitHub Issues / GitHub Projects.

## 9.2 Adaptateurs futurs

- Linear ;
- Jira ;
- Trello ;
- GitLab ;
- autres systèmes Kanban via adapters.

## 9.3 Commande

```bash
add ticket DEV-142
```

ADD récupère :

- titre ;
- description ;
- acceptance criteria ;
- labels ;
- priorité ;
- liens ;
- tickets dépendants ;
- commentaires pertinents.

---

# 10. Discovery et Brainstorm

Après récupération d'un ticket, aucun code ne doit être écrit immédiatement.

L'agent :

1. analyse le ticket ;
2. inspecte le repository ;
3. identifie les composants concernés ;
4. recherche les implémentations existantes ;
5. recherche les dépendances ;
6. détecte les ambiguïtés ;
7. identifie les risques ;
8. pose des questions.

Exemple :

```text
I found three ambiguities.

Q1:
Should reset tokens expire after 15 minutes or 1 hour?

Q2:
Should an existing session be invalidated after password reset?

Q3:
Should email delivery use the existing queue?
```

Les réponses sont enregistrées comme décisions.

---

# 11. Decision Log

Chaque décision importante doit être persistée.

Exemple :

```yaml
id: DEC-024
decision: 'Password reset tokens expire after 15 minutes.'
reason: 'Security requirement.'
alternative_rejected: '1 hour expiration.'
approved_by: 'human'
date: '2026-09-23'
```

Objectif :

> permettre à un agent futur de comprendre pourquoi une décision existe sans devoir reconstruire toute l'histoire du projet.

---

# 12. Architecture Decision Records

Les décisions architecturales importantes doivent être stockées sous forme d'ADR.

Exemple :

```text
.add/decisions/
├── DEC-001-authentication.md
├── DEC-002-payment-provider.md
└── DEC-003-event-driven-email.md
```

Chaque ADR doit contenir :

- contexte ;
- problème ;
- options ;
- décision ;
- conséquences ;
- date ;
- approbateur ;
- statut.

---

# 13. Planning

Après clarification, l'agent produit un plan.

Exemple :

```text
IMPLEMENTATION PLAN

1. Create PasswordResetToken entity
2. Create repository
3. Implement token generation
4. Implement expiration validation
5. Add email adapter
6. Add API endpoint
7. Implement frontend flow
8. Add integration tests
9. Add E2E coverage
```

Le plan doit identifier :

- fichiers potentiellement concernés ;
- modules ;
- dépendances ;
- risques ;
- tests ;
- migrations ;
- impact API ;
- impact infrastructure.

---

# 14. Human Approval Gate

Avant toute implémentation, le développeur doit pouvoir consulter :

- compréhension du ticket ;
- questions ;
- décisions ;
- architecture ;
- plan ;
- risques ;
- stratégie de tests.

Commandes possibles :

```bash
add approve
add reject
add revise
```

Aucune implémentation ne doit commencer si une étape obligatoire n'est pas approuvée.

---

# 15. Test-First Engineering

## 15.1 Principe

Le système doit construire une stratégie de vérification avant l'implémentation métier.

Pipeline :

```text
Specification
↓
Acceptance Criteria
↓
Test Plan
↓
Tests
↓
Verification
↓
Implementation
```

## 15.2 Niveaux

### Unit tests

Tests atomiques des règles métier.

### Integration tests

Tests entre composants réels.

### E2E tests

Validation du comportement utilisateur.

### Contract tests

Pour les APIs ou intégrations lorsque nécessaire.

### Security tests

Pour les fonctionnalités sensibles.

---

# 16. Test Designer Agent

Le Test Designer doit :

- traduire les acceptance criteria en cas de test ;
- identifier les happy paths ;
- identifier les edge cases ;
- identifier les erreurs ;
- détecter les comportements non spécifiés ;
- choisir le niveau de test approprié.

Exemple :

```text
Requirement:
User can reset password.

Tests:
✓ valid token
✓ expired token
✓ invalid token
✓ reused token
✓ password policy violation
✓ unknown email
✓ session invalidation
✓ email delivery failure
```

---

# 17. Agent Architecture

Le système doit supporter plusieurs rôles agentiques.

## 17.1 Planner Agent

Responsable de :

- compréhension ;
- architecture ;
- planification ;
- questions.

Permissions :

```text
filesystem: read
git: read
kanban: read
write: none
shell: none
```

## 17.2 Test Agent

Responsable de :

- stratégie de test ;
- écriture des tests ;
- vérification des tests ;
- mise en place du harnais de test lorsqu'il n'existe pas encore.

### 17.2.1 Harnais de test

Un harnais absent n'est pas un motif de refus. Sur un projet qui ne déclare aucun
script `test`, l'agent Test est seul qualifié pour créer le harnais :

- choisir le runner adapté à la stack détectée dans le manifeste ;
- l'ajouter comme dépendance de développement ;
- ajouter un script `test` qui l'exécute une fois et sort en erreur dès qu'un test échoue ;
- ajouter le fichier de configuration si le runner l'exige ;
- déclarer chaque fichier créé dans son rapport de modifications.

Le harnais doit être opérationnel **avant** l'écriture des premiers tests : Lou vérifie
en exécutant la suite, jamais en se fiant à la parole d'un agent (§4.6).

### 17.2.2 Prérequis bloquants vs advisory

Le préflight distingue deux familles de constats :

- **bloquant** — le run ne démarre pas. Exemples : `gh` non authentifié, runtime absent,
  dossier hors dépôt Git, script `test` déclaré mais qui ne prouve rien.
- **advisory** — le run démarre et le constat est journalisé. Exemple : aucun harnais de
  test n'est encore déclaré.

Un advisory ne dégrade jamais la vérification : si le harnais est toujours absent au moment
de la phase de vérification des tests, l'orchestrateur refuse de rapporter une passe et
remet le run à l'humain (§15.1). Le filet reste fermé, seule la porte d'entrée s'ouvre.

## 17.3 Developer Agent

Responsable de :

- implémentation ;
- correction ;
- refactoring contrôlé.

Permissions :

```text
filesystem: read/write
git: branch
shell: controlled
database: sandbox
production: deny
```

## 17.4 Verification Agent

Responsable de :

- exécuter les tests ;
- analyser les résultats ;
- vérifier les critères d'acceptation ;
- détecter les régressions.

## 17.5 Review Agent

Responsable de :

- qualité ;
- architecture ;
- sécurité ;
- tests ;
- complexité ;
- cohérence.

## 17.6 Security Agent

Responsable de :

- secrets ;
- permissions ;
- injection ;
- dépendances ;
- opérations dangereuses ;
- surface d'attaque.

---

# 18. Orchestrateur

L'orchestrateur est le cœur du produit.

Il doit gérer une machine à états.

```text
TICKET_RECEIVED
      ↓
DISCOVERY
      ↓
QUESTIONS
      ↓
PLAN
      ↓
HUMAN_APPROVAL
      ↓
TEST_DESIGN
      ↓
TEST_IMPLEMENTATION
      ↓
TEST_VERIFICATION
      ↓
IMPLEMENTATION
      ↓
VERIFICATION
      ↓
REVIEW
      ↓
HUMAN_APPROVAL
      ↓
PR_CREATED
      ↓
PREPROD
```

Chaque état possède :

- entrées ;
- sorties ;
- permissions ;
- agents autorisés ;
- outils autorisés ;
- validateurs ;
- conditions d'échec ;
- conditions de sortie.

---

# 19. State Machine

L'orchestrateur ne doit pas être conçu comme une simple boucle :

```text
while not done:
    ask LLM
```

Il doit utiliser une machine à états explicite.

Chaque transition doit être déterministe autant que possible.

Exemple :

```text
TEST_VERIFICATION
        │
        ├── PASS ──────► IMPLEMENTATION
        │
        └── FAIL ──────► IMPLEMENTATION
```

En test-first, un test rouge juste après son écriture est l'état attendu : le code
n'existe pas encore. `FAIL` est donc un signal, pas une erreur, et il ne consomme pas
d'itération. Réécrire des tests déjà corrects ne les rend pas plus justes ; la boucle
d'itération appartient au développeur, qui corrige le code et non la spécification.

Avec limite :

```text
MAX_ITERATIONS = 5
```

Au-delà :

```text
HUMAN_INTERVENTION_REQUIRED
```

Répartition des budgets d'itération :

```text
PLAN               : 5 re-planifications après rejet humain
IMPLEMENTATION     : 5 corrections après échec de vérification ou de revue
TEST_IMPLEMENTATION: 0 — un test juste n'est pas réécrit pour le faire passer
```

---

# 20. OpenCode Adapter

OpenCode constitue le runtime d'exécution initial.

ADD lui transmet :

- instructions ;
- contexte ;
- policies ;
- permissions ;
- workspace ;
- outils ;
- artefacts ;
- objectifs de la phase.

ADD récupère :

- événements ;
- tool calls ;
- fichiers modifiés ;
- résultats ;
- erreurs ;
- tests ;
- statut Git.

Le système doit isoler l'adapter OpenCode du reste du core afin de permettre ultérieurement d'ajouter d'autres runtimes.

Architecture :

```text
ADD Core
   │
   ├── OpenCode Adapter
   ├── Future Runtime Adapter
   └── Future Remote Agent Adapter
```

---

# 21. MCP

MCP constitue l'un des principaux mécanismes d'intégration.

Exemples :

```text
kanban-mcp
git-mcp
filesystem-mcp
testing-mcp
database-mcp
documentation-mcp
policy-mcp
```

Le `policy-mcp` peut exposer :

```text
get_project_policy()
get_architecture()
get_conventions()
get_decisions()
get_test_requirements()
get_security_policy()
```

---

# 22. Capability-Based Permissions

Chaque agent possède un ensemble explicite de capacités.

Exemple :

```yaml
agent: reviewer

permissions:
  filesystem:
    read: true
    write: false

  git:
    read: true
    write: false

  shell:
    execute:
      - test
      - lint

  database:
    read: sandbox

  production:
    access: false
```

Les permissions doivent être évaluées **avant** l'exécution de chaque action sensible.

---

# 23. Sandbox

Les agents doivent travailler dans un environnement isolé autant que possible.

Architecture cible :

```text
Repository
    ↓
Ephemeral Workspace
    ├── isolated filesystem
    ├── isolated database
    ├── restricted network
    ├── temporary credentials
    └── resource limits
```

Pour les projets conteneurisés :

```text
Docker
├── application
├── postgres-test
├── redis-test
└── isolated-network
```

L'environnement doit être détruisible et recréable.

---

# 24. Database Safety Layer

Le système doit identifier les opérations potentiellement destructrices.

Exemples :

```text
DROP DATABASE
DROP TABLE
TRUNCATE
DELETE without WHERE
prisma migrate reset
terraform destroy
kubectl delete
rm -rf
```

Classification :

```text
LOW
MEDIUM
HIGH
CRITICAL
```

Les opérations `CRITICAL` doivent nécessiter une approbation humaine.

---

# 25. Command Policy Engine

Toutes les commandes shell doivent passer par une politique.

Exemple :

```text
command
   ↓
parser
   ↓
risk classification
   ↓
policy evaluation
   ↓
ALLOW / DENY / ASK HUMAN
```

Le moteur doit détecter autant que possible :

- commandes destructrices ;
- accès production ;
- secrets ;
- modifications de configuration ;
- opérations réseau sensibles ;
- changements d'infrastructure.

---

# 26. Git Workflow

Le workflow standard doit être :

```text
main
  │
  └── feature/DEV-142-password-reset
```

Pipeline :

```text
Implementation
↓
Unit tests
↓
Integration tests
↓
E2E
↓
Lint
↓
Typecheck
↓
Security checks
↓
Commit
↓
Push
↓
Pull Request
```

Convention de commit configurable.

Exemple :

```text
feat(auth): implement password reset flow
```

---

# 27. Pull Request Automation

ADD doit pouvoir :

- créer la branche ;
- créer les commits ;
- pousser la branche ;
- ouvrir la PR ;
- générer la description ;
- associer le ticket ;
- joindre les résultats de tests ;
- joindre les décisions pertinentes ;
- joindre le rapport de review.

---

# 28. Agentic Pre-Review

Avant review humaine :

```text
Pull Request
     ↓
Review Agent
```

Le reviewer vérifie :

### Correctness

L'implémentation respecte-t-elle la spécification ?

### Architecture

Le code respecte-t-il l'architecture existante ?

### Tests

Les comportements importants sont-ils vérifiés ?

### Security

Des vulnérabilités évidentes ont-elles été introduites ?

### Complexity

La solution est-elle inutilement complexe ?

### Regression

Les fonctionnalités existantes peuvent-elles être cassées ?

### Policy

Les conventions du projet sont-elles respectées ?

Résultat :

```text
APPROVED
CHANGES_REQUESTED
BLOCKED
```

---

# 29. Feedback Loop

Une tâche peut entrer dans une boucle contrôlée :

```text
Implementation
      ↓
Test
      ↓
Failure
      ↓
Diagnosis
      ↓
Fix
      ↓
Test
      ↓
Pass
      ↓
Review
      ↓
Changes requested
      ↓
Fix
```

La boucle doit être bornée.

```yaml
max_iterations:
  tests: 5
  review: 3
```

Au-delà :

```text
HUMAN_INTERVENTION_REQUIRED
```

---

# 30. Human Checkpoints

Les gates minimales du MVP :

```text
Requirement
     ↓
[HUMAN]
     ↓
Plan
     ↓
[HUMAN]
     ↓
Tests
     ↓
Implementation
     ↓
Review
     ↓
[HUMAN]
     ↓
Preprod
```

Le système peut permettre un mode plus autonome uniquement lorsque le projet et l'organisation l'autorisent.

---

# 31. Pre-production

ADD ne doit pas déployer automatiquement en production dans le MVP.

Workflow :

```text
PR
 ↓
CI
 ↓
Review
 ↓
Human approval
 ↓
Preprod
```

Le déploiement production reste hors périmètre initial ou explicitement protégé par un gate supplémentaire.

---

# 32. Artifact System

Chaque run produit des artefacts persistants.

Exemple :

```text
.add/runs/DEV-142/
├── context.md
├── requirements.md
├── questions.md
├── decisions.md
├── architecture.md
├── implementation-plan.md
├── test-plan.md
├── test-report.md
├── verification.md
├── review.md
└── trace.jsonl
```

Objectif :

> pouvoir expliquer comment une modification est passée d'un ticket à une Pull Request.

---

# 33. Audit Trail

Chaque action importante doit générer un événement.

Exemple :

```json
{
  "timestamp": "2026-09-23T20:00:00Z",
  "run_id": "RUN-001",
  "agent": "developer",
  "event": "tool_call",
  "tool": "filesystem.write",
  "target": "src/auth/service.ts",
  "risk": "low",
  "result": "success"
}
```

Événements minimum :

```text
agent_started
agent_finished
tool_called
tool_denied
permission_requested
human_approval
human_rejection
file_changed
command_executed
test_started
test_finished
review_started
review_finished
git_commit
git_push
pr_created
```

---

# 34. Observability

Le système doit fournir :

- logs structurés ;
- trace par run ;
- trace par agent ;
- coût estimé des modèles ;
- temps d'exécution ;
- nombre de tool calls ;
- nombre d'itérations ;
- tests exécutés ;
- erreurs ;
- violations de policy.

Exemple :

```text
RUN DEV-142

Duration: 18m 42s
Agents: 4
LLM calls: 37
Tool calls: 112
Tests: 84
Failures: 6
Review iterations: 2
Human approvals: 2
Status: SUCCESS
```

---

# 35. Model Routing

ADD doit rester indépendant du fournisseur de modèle.

Une politique peut choisir un modèle selon la tâche :

```text
Simple classification
→ low-cost model

Planning
→ reasoning model

Implementation
→ coding model

Security review
→ specialized/reasoning model
```

Configuration :

```yaml
agents:
  planner:
    model: provider/model-a

  developer:
    model: provider/model-b

  reviewer:
    model: provider/model-c
```

Le système doit également pouvoir utiliser le même modèle pour tous les rôles.

---

# 36. Coût et contrôle des ressources

Le système doit suivre :

- tokens ;
- nombre de requêtes ;
- temps ;
- coût estimé ;
- nombre d'itérations.

Des limites peuvent être définies :

```yaml
limits:
  max_cost_per_run: 5
  max_agent_iterations: 5
  max_runtime_minutes: 30
```

Lorsque la limite est atteinte :

```text
RUN_PAUSED
HUMAN_INTERVENTION_REQUIRED
```

---

# 37. CLI

Interface principale du MVP :

```bash
add init
add ticket DEV-142
add status
add plan
add approve
add reject
add implement
add test
add review
add run DEV-142
```

Commande principale :

```bash
add run DEV-142
```

Cette commande orchestre automatiquement les phases autorisées.

---

# 38. TUI

Une interface terminal pourra afficher :

```text
╭────────────────────────────────────────────╮
│ ADD — Agentic Driven Development           │
├────────────────────────────────────────────┤
│ Ticket: DEV-142                             │
│                                             │
│ ● Discovery                    COMPLETE     │
│ ● Questions                   COMPLETE     │
│ ● Architecture               COMPLETE     │
│ ● Test Plan                  COMPLETE     │
│ ● Tests                      COMPLETE     │
│ ● Implementation             RUNNING       │
│ ○ Verification                             │
│ ○ Review                                   │
│ ○ Pull Request                             │
╰────────────────────────────────────────────╯
```

Actions :

```text
ENTER  Approve
R      Reject
E      Edit
V      View
Q      Quit
```

---

# 39. Architecture technique

## 39.1 Stack recommandée

### Core

```text
TypeScript
Node.js
```

### CLI / TUI

```text
Commander ou Yargs
Ink
React
```

### Orchestration

```text
Custom state machine
Event-driven architecture
```

Éviter un framework agentique lourd dans le core du MVP.

### Runtime

```text
OpenCode Adapter
```

### Git

```text
Git CLI
GitHub API
```

### Persistence

MVP :

```text
SQLite
```

Évolution :

```text
PostgreSQL
```

### Validation

```text
Zod
```

### Logging

```text
Structured JSON logs
```

### Isolation

```text
Docker
```

### MCP

```text
MCP-compatible adapters
```

---

# 40. Monorepo proposé

```text
add/
├── apps/
│   └── cli/
│
├── packages/
│   ├── core/
│   │   ├── orchestrator/
│   │   ├── state-machine/
│   │   ├── policies/
│   │   └── events/
│   │
│   ├── agents/
│   │   ├── planner/
│   │   ├── tester/
│   │   ├── developer/
│   │   ├── verifier/
│   │   ├── reviewer/
│   │   └── security/
│   │
│   ├── runtimes/
│   │   └── opencode/
│   │
│   ├── integrations/
│   │   ├── github/
│   │   ├── linear/
│   │   └── jira/
│   │
│   ├── git/
│   ├── sandbox/
│   ├── policy/
│   ├── testing/
│   ├── storage/
│   └── shared/
│
├── docs/
├── examples/
├── tests/
├── package.json
└── README.md
```

---

# 41. Interfaces principales

## AgentRuntime

```typescript
interface AgentRuntime {
  run(input: AgentRunInput): Promise<AgentRunResult>;
  interrupt(runId: string): Promise<void>;
  getStatus(runId: string): Promise<AgentStatus>;
}
```

## PolicyEngine

```typescript
interface PolicyEngine {
  evaluate(action: Action): Promise<PolicyDecision>;
}
```

## KanbanAdapter

```typescript
interface KanbanAdapter {
  getTicket(id: string): Promise<Ticket>;
  updateTicket(id: string, update: TicketUpdate): Promise<void>;
}
```

## GitAdapter

```typescript
interface GitAdapter {
  createBranch(name: string): Promise<void>;
  commit(message: string): Promise<void>;
  push(): Promise<void>;
  createPullRequest(input: PullRequestInput): Promise<PullRequest>;
}
```

## Agent

```typescript
interface Agent {
  id: string;
  role: AgentRole;
  permissions: Permissions;
  execute(context: AgentContext): Promise<AgentResult>;
}
```

---

# 42. Sécurité

Principes :

- secrets jamais injectés inutilement dans le contexte LLM ;
- credentials temporaires ;
- isolation des environnements ;
- permissions minimales ;
- audit trail ;
- allowlist / denylist ;
- confirmation humaine pour les actions critiques ;
- protection contre les commandes destructrices ;
- protection contre les modifications de configuration sensibles ;
- séparation production / preprod / sandbox.

---

# 43. Gestion des secrets

Les secrets doivent être gérés par l'environnement et non stockés dans :

```text
.add/
prompts
logs
agent memory
Git
```

Les secrets doivent être masqués dans les logs.

Exemple :

```text
DATABASE_URL=********
API_KEY=********
```

---

# 44. Résilience

Le système doit supporter :

- interruption d'un agent ;
- timeout ;
- crash ;
- perte de connexion ;
- modèle indisponible ;
- commande échouée ;
- tests bloqués ;
- état partiellement terminé.

Chaque run doit être reprenable lorsque cela est sûr.

```bash
add resume RUN-001
```

---

# 45. Idempotence

Les étapes doivent être autant que possible idempotentes.

Exemple :

```text
add test
```

ne doit pas produire quatre copies d'un même test si elle est relancée après une interruption.

---

# 46. Critères de qualité

Une tâche ne doit pas être considérée comme terminée simplement parce que le code compile.

Definition of Done minimale :

```text
[ ] Requirements understood
[ ] Questions resolved
[ ] Plan approved
[ ] Architecture respected
[ ] Tests implemented
[ ] Tests passing
[ ] Typecheck passing
[ ] Lint passing
[ ] Security checks passing
[ ] No policy violation
[ ] Review completed
[ ] Human approval obtained
[ ] PR created
```

---

# 47. MVP — Scope exact

Le MVP doit volontairement rester limité.

## Inclus

- CLI ;
- `/init` ;
- Git ;
- GitHub Issues ;
- GitHub Pull Requests ;
- Project Constitution ;
- Policy Engine ;
- Planner Agent ;
- Test Agent ;
- Developer Agent ;
- Reviewer Agent ;
- OpenCode adapter ;
- state machine ;
- human approval gates ;
- test-first workflow ;
- audit trail ;
- command safety ;
- PR generation.

## Exclu du MVP

- déploiement production automatique ;
- interface web complète ;
- support de dix Kanban ;
- marketplace d'agents ;
- entraînement de modèles ;
- fine-tuning ;
- système multi-tenant complet ;
- analytics avancés.

---

# 48. MVP User Journey

## Étape 1

L'utilisateur entre dans un repository :

```bash
cd my-project
add init
```

## Étape 2

ADD analyse le projet.

```text
Project successfully onboarded.

Detected:
Next.js
PostgreSQL
Prisma
Vitest
Playwright

No project constitution found.

Create baseline?
[Y/n]
```

## Étape 3

L'utilisateur connecte GitHub.

```bash
add connect github
```

## Étape 4

Il lance une tâche :

```bash
add ticket DEV-142
```

## Étape 5

L'agent analyse.

```text
I understand the ticket.

I found 3 ambiguities.

...
```

## Étape 6

L'utilisateur répond.

## Étape 7

ADD produit le plan.

```text
Implementation Plan

...
```

## Étape 8

L'utilisateur approuve.

```bash
add approve
```

## Étape 9

ADD génère les tests.

## Étape 10

Les tests sont vérifiés.

## Étape 11

OpenCode implémente.

## Étape 12

ADD exécute :

```text
tests
lint
typecheck
security checks
```

## Étape 13

Review Agent analyse la PR.

## Étape 14

L'utilisateur effectue la dernière validation.

## Étape 15

La branche est prête pour preprod.

---

# 49. Différenciation

La valeur du produit ne repose pas sur :

> "Nous avons un agent qui écrit du code."

Le marché possède déjà de nombreux agents capables de produire du code.

La différenciation repose sur :

```text
Governance
+
Context
+
Policy
+
Verification
+
Permissions
+
Traceability
+
Human control
```

Positionnement :

> **ADD is an engineering control plane for autonomous coding agents.**

---

# 50. Concept architectural central

La séparation fondamentale du système est :

```text
┌───────────────────────────────┐
│           HUMAN               │
│       Final authority         │
└───────────────┬───────────────┘
                │
┌───────────────▼───────────────┐
│          ADD LAYER             │
│                               │
│ Governance                    │
│ Planning                      │
│ Policies                      │
│ Orchestration                 │
│ Verification                  │
│ Permissions                   │
│ Audit                         │
└───────────────┬───────────────┘
                │
┌───────────────▼───────────────┐
│          OPENCODE              │
│       Agent execution          │
└───────────────┬───────────────┘
                │
┌───────────────▼───────────────┐
│       Repository / Runtime     │
└───────────────────────────────┘
```

Cette séparation doit être conservée dans toute l'architecture.

---

# 51. Roadmap

## Phase 0 — Proof of Concept

Objectif : démontrer le workflow.

```text
CLI
+
OpenCode
+
Git
+
manual ticket
+
planning
+
tests
+
implementation
+
review
```

Durée indicative : quelques jours à deux semaines.

## Phase 1 — MVP

Ajouter :

```text
GitHub
Policy Engine
Constitution
Human Gates
Audit
Sandbox
```

## Phase 2 — Agent Platform

Ajouter :

```text
Multiple agents
Multiple models
MCP
Model routing
Cost control
```

## Phase 3 — Team / Enterprise

Ajouter :

```text
Organization policies
RBAC
Shared projects
Centralized audit
Team dashboards
Compliance
```

## Phase 4 — Ecosystem

Ajouter :

```text
Linear
Jira
GitLab
Cloud environments
CI/CD providers
Plugin ecosystem
Agent marketplace
```

---

# 52. KPIs

Le produit doit être évalué sur autre chose que le nombre de lignes générées.

### Engineering KPIs

- defect rate ;
- regression rate ;
- escaped bugs ;
- test coverage ;
- review rejection rate ;
- mean time to resolve;
- change failure rate.

### Agent KPIs

- successful runs ;
- human intervention rate ;
- average iterations ;
- tool failure rate ;
- policy violation rate ;
- cost per task ;
- time per task.

### Control KPIs

- destructive actions blocked ;
- unauthorized actions blocked ;
- decisions documented ;
- requirements linked to tests ;
- code linked to tickets.

---

# 53. Principes de conception à ne jamais sacrifier

### 1. Ne jamais confondre autonomie et absence de contrôle.

### 2. Ne jamais considérer le LLM comme une source de vérité.

### 3. Ne jamais donner des privilèges inutiles à un agent.

### 4. Ne jamais laisser une opération critique être implicitement approuvée.

### 5. Ne jamais considérer "tests pass" comme une preuve suffisante de correction.

### 6. Ne jamais laisser la complexité de l'orchestrateur dépasser le problème qu'il résout.

### 7. Ne jamais transformer ADD en une nouvelle boîte noire.

---

# 54. Définition finale du produit

Agentic-Driven Development est un **control plane de développement logiciel agentique**.

Il se place au-dessus d'un runtime comme OpenCode et transforme une interaction de type :

```text
"Build this feature."
```

en un processus contrôlé :

```text
Understand
    ↓
Question
    ↓
Decide
    ↓
Plan
    ↓
Approve
    ↓
Specify
    ↓
Test
    ↓
Implement
    ↓
Verify
    ↓
Review
    ↓
Approve
    ↓
Preprod
```

Le but n'est pas de supprimer le développeur.

Le but est de permettre à un développeur de **déléguer davantage sans abandonner la maîtrise de son système**.

---

# 55. Phrase de positionnement

> **Agentic-Driven Development: the engineering control plane for AI coding agents.**

Alternative plus orientée développeur :

> **Give AI agents autonomy without giving up control.**

Alternative plus conceptuelle :

> **From vibe coding to governed agentic development.**

---

# 56. Résumé technique

```text
                 ┌──────────────────────┐
                 │       HUMAN          │
                 └──────────┬───────────┘
                            │
                       APPROVALS
                            │
                 ┌──────────▼───────────┐
                 │       ADD CORE       │
                 │                      │
                 │ State Machine        │
                 │ Policy Engine        │
                 │ Orchestrator         │
                 │ Permission Engine    │
                 │ Artifact Manager     │
                 │ Audit System         │
                 └──────────┬───────────┘
                            │
            ┌───────────────┼────────────────┐
            │               │                │
            ▼               ▼                ▼
        Planner          Tester          Reviewer
            │               │                │
            └───────────────┼────────────────┘
                            ▼
                    OpenCode Adapter
                            │
                            ▼
                       Agent Runtime
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
            Git           Tests         Sandbox
              │             │             │
              └─────────────┼─────────────┘
                            ▼
                         GitHub
                            │
                            ▼
                           PR
                            │
                            ▼
                         Preprod
```

---

# 57. Priorité absolue de développement

L'ordre recommandé est :

```text
1. State Machine
2. OpenCode Adapter
3. Policy Engine
4. Project Constitution
5. Git integration
6. Test workflow
7. Human approval gates
8. GitHub integration
9. Review Agent
10. Sandbox
11. Audit / observability
12. Multi-model routing
13. Additional Kanban adapters
```

Le premier objectif n'est donc pas de construire une interface spectaculaire.

Le premier objectif est de réussir parfaitement cette boucle :

```text
Ticket
  ↓
Understand
  ↓
Plan
  ↓
Human approval
  ↓
Tests
  ↓
OpenCode
  ↓
Verification
  ↓
Review
  ↓
Human approval
  ↓
PR
```

Si cette boucle est fiable, sécurisée et agréable à utiliser, le reste du produit peut être construit autour d'elle.
