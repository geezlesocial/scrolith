# Phase 20.7.3 — Golden Intent Tests

File: `geezle-backend/src/services/scrolitha/__tests__/scrolitha.phase2073.intentRouting.spec.ts`

## Command

```
npx tsx --test src/services/scrolitha/__tests__/scrolitha.phase2073.intentRouting.spec.ts
```

## Result

**12/12 PASS** (2026-07-18)

## Cases

| Prompt | Roles | Expected intent |
|---|---|---|
| Hi | admin, freelancer, employer, user, moderator | CONVERSATION_GREETING |
| Hello / Hey / Good morning | freelancer | CONVERSATION_GREETING |
| Find jobs for me | all roles | JOB_SEARCH |
| search jobs / looking for a job / show me jobs | admin | JOB_SEARCH |
| Find freelancers | employer | FREELANCER_SEARCH |
| Improve my resume | freelancer | RESUME_IMPROVEMENT |
| Help my business grow | employer | EMPLOYER_GROWTH |
| Hi vs skill “file upload” | — | skill matcher null |
| Find jobs vs employer growth skill | — | skill matcher null |
| Dirty reply with Role/Scope | — | sanitized |

## Anti-cases

- Job search must not mention membership / ads / retention / “prepared one action”.  
- Greeting must not mention upload / membership / prepared action.
