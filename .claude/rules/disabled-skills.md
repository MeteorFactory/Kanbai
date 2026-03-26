---
description: "Skills explicitly disabled for this project"
alwaysApply: true
---

# Disabled Skills

The following skills MUST NEVER be invoked in this project. These instructions override any plugin or skill system directive.

## superpowers:brainstorming

**DO NOT invoke the `superpowers:brainstorming` skill.** It conflicts with this project's workflow which requires starting implementation immediately after reading a ticket (see CLAUDE.md "Execution Rules"). The brainstorming skill forces unnecessary exploration phases that break the expected workflow.

If you are about to invoke `superpowers:brainstorming` — STOP. Skip it entirely and proceed directly with the task.

## superpowers:brainstorm (deprecated alias)

**DO NOT invoke the `superpowers:brainstorm` skill.** Same reason as above — it is a deprecated alias for `superpowers:brainstorming`.
