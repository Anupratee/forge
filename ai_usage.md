# AI Usage

Project: **Forge** — IITM App Dev Lab, T22026_cs4010
Student: Anupratee Bharadwaj (21f1001850)

This document records how AI assistance was used while building Forge, kept current as work
happens rather than reconstructed at submission.

## Tool

**Claude Code** (Anthropic's CLI/IDE agent, Claude Opus 5), run locally against this repository.

## How it is being used

| Used for | Not used for |
| --- | --- |
| Scaffolding boilerplate (config files, project structure) | Choosing the project idea or problem statement |
| Writing implementation code from a plan I reviewed and approved | Deciding the architecture without my review |
| Explaining library APIs and current best practice | Copying any existing or previous-term implementation |
| Reviewing my code for missed edge cases and RBAC gaps | Producing work I have not read and understood |

Every phase followed the same loop: I described the goal, the assistant proposed a written plan,
I reviewed and corrected it (including rejecting choices that did not match the course
requirements), and only then was code written. Work proceeded one phase at a time, with my
explicit approval between phases.

---

## Log

### Planning — project setup and implementation plan

**What I asked for:** read the project spec (`Forge.pdf`), initialize version control, then
produce a full implementation plan.

**What the assistant did:**

- Extracted and read the spec, then reported the requirements back for confirmation.
- Initialized the git repository, wrote `.gitignore` and the initial `README.md`, and created the
  private GitHub remote. On my instruction, `Forge.pdf` was gitignored rather than committed.
- Asked me to decide the open technical questions rather than assuming: backend language,
  database hosting, frontend data/styling approach, and which optional features to build. My
  answers: TypeScript, PostgreSQL via Docker Compose, Tailwind + TanStack Query, and all four
  extras.
- Produced a phased implementation plan covering architecture, the points-economy invariants, and
  per-phase verification steps.

**Corrections I made:**

1. I required that the plan follow the course technology stack strictly. The assistant fetched the
   course requirements document and audited the plan against it, adding a compliance table and two
   requirements the plan had missed: the per-entity attribute set (title, description, timestamp,
   category, capacity, media, ownership) and the **availability filter** in advanced search.
2. I supplied the mandated project-structure diagram from the rubric. The plan was revised to match
   it exactly — layer-first server folders (`controllers/`, `services/`, `routes/`,
   `middlewares/`), the `app.ts`/`server.ts` split, `services/` rather than `api/` on the client,
   and the required root `ai_usage.md`. Its earlier npm-workspaces root and `shared/` package were
   dropped, since neither appears in the mandated structure.
3. I directed that implementation proceed one phase at a time, stopping for my approval after each.

**My own contribution:** the project concept, problem statement, role model, core entity design,
and feature set are mine, from the spec I wrote. All stack and scope decisions above were mine.
I reviewed the plan and required the three corrections listed before approving it.

### Phase 1 — Scaffold and infrastructure

**What I asked for:** build Phase 1 of the approved plan.

**What the assistant did:** created the mandated directory tree; `docker-compose.yml` for
PostgreSQL 16 with Redis behind an opt-in profile; `.env.example`; fail-fast environment parsing
in `server/src/config/env.ts`; the `app.ts`/`server.ts` split with a health endpoint; independent
`package.json`, TypeScript, ESLint, and Prettier configuration for `server/` and `client/`; the
Vite + React + Tailwind client shell; and `CLAUDE.md` recording the conventions and invariants
that later work must respect.

**What I verified:** the container reports healthy, and lint plus type-check pass in both
packages.
