# Forge

Unifies personal habit tracking and budget management into one platform, with a gamified points
economy layered on top — completing a habit, holding a streak, or staying within budget earns
points that can be redeemed for cosmetic rewards and simulated vouchers. Users can also join
time-boxed community challenges authored by Creators and governed by Admins.

IITM App Dev Lab project — T22026_cs4010.

## Roles

Three strictly separate roles; an account holds exactly one.

| Role | Can do |
| --- | --- |
| **Admin** | Manage user accounts, approve/reject submitted challenges, curate the reward store, view system-wide stats. Sole approver of challenges. |
| **Creator** | Author challenges and submit them for approval; view participant progress for their own approved challenges only. Cannot self-approve, manage users, or see any user's habit or budget data. |
| **User** | Track habits and streaks, manage monthly budgets and expenses, browse and join approved challenges, record daily check-ins, redeem points, opt in to the leaderboard. |

## Core entity: Challenge

Creator-owned, Admin-approved, joined by Users and completed via daily check-ins.

```
DRAFT → PENDING_APPROVAL → APPROVED → ENDED
                        ↘ REJECTED → (edit & resubmit)
```

No challenge is visible to Users until an Admin approves it; material edits to an approved
challenge trigger re-approval.

Supporting entities: `ChallengeParticipation`, `ChallengeCheckIn`, `Habit`, `Expense`,
`BudgetGoal`, `RewardItem`, `Redemption`, and `PointsLedger` — an append-only record of every
earn/spend event and the source of truth for the points economy.

## Tech stack

- **Frontend** — React SPA with role-aware dashboards
- **Backend** — Node.js + Express REST API
- **Database** — PostgreSQL via TypeORM (code-first entities and migrations)
- **Auth** — JWT with bcrypt-hashed passwords; RBAC enforced at the API layer
- **Also** — Multer (uploads), class-validator (validation), Redis (optional cache for
  leaderboards and approved-challenge lists)

## Planned extras

AI-assisted bank statement import (pdf-parse + LLM API, with a preview/confirm step), CSV
expense import, community and global leaderboards, and cosmetic profile customization driven by
redeemed reward items.

## Status

Initial setup — repository scaffolding only. No application code yet.
