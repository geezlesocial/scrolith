# Scrolith AI Engineering Guide

## Project

Scrolith is an enterprise social networking, professional networking, marketplace, freelancing, jobs, creator, messaging, ads, wallet, AI, and CMS platform.

The primary goal is to continuously improve the platform while preserving production stability.

---

# Repository Priority

Always work in this order:

1. geezle/
   Main React + Vite + TypeScript frontend.

2. geezle-backend/
   Express + Prisma + PostgreSQL backend.

3. mobile/
   Capacitor Android/iOS wrapper.

4. deploy/
   Docker, Cloud Run, Cloud Build, nginx.

5. docs/
   Documentation.

Never modify unless explicitly instructed:

- dist/
- build/
- screenshots/
- logs/
- archived repositories
- deployment snapshots
- generated Capacitor assets

---

# Engineering Standards

Every implementation must be:

- Production-ready
- Enterprise-grade
- Secure
- Fully typed
- Responsive
- Mobile compatible
- High performance
- Backward compatible
- Maintainable
- Scalable

Never remove existing functionality.

Never introduce breaking API changes.

Never delete routes.

Never remove database columns.

Never remove permissions.

Never remove business logic.

Always extend existing systems instead of replacing them.

---

# Performance

Prefer:

- React.lazy
- Suspense
- Dynamic imports
- Lazy providers
- Route splitting
- Query optimization
- Database indexes when justified
- CDN-friendly caching
- Image optimization
- Memoization
- Virtualization

Avoid increasing initial bundle size.

---

# Database

Backend uses:

- PostgreSQL
- Prisma

Rules:

- Safe migrations only
- No destructive schema changes
- Preserve backward compatibility
- Rollback must remain possible

---

# Cloud

Production infrastructure:

- Google Cloud Run
- Cloud SQL
- Cloud Storage
- Cloud Build
- Artifact Registry
- Secret Manager
- Cloud DNS

Never modify:

- Billing
- IAM
- DNS
- SSL
- Secrets
- Cloud Run scaling
- CPU
- Memory

unless explicitly requested.

---

# AI

Scrolitha uses Ollama.

Current local production model:

qwen3:14b

Future supported models may include:

- DeepSeek
- Gemma
- Llama
- Qwen

Never replace the AI architecture.

Improve it incrementally.

---

# Security

Never expose:

- JWT secrets
- Database credentials
- API secrets
- OAuth secrets
- Stripe secrets
- Service account credentials

---

# Implementation Workflow

For every task:

1. Inspect existing architecture
2. Reuse existing implementation
3. Explain the plan
4. Implement
5. Build
6. Test
7. Verify
8. Commit
9. Push
10. Deploy only when requested

---

# Final Report

Always provide:

- Files changed
- Why they changed
- Build status
- Test status
- Performance impact
- Bundle impact
- Database impact
- Commit hash
- Deployment status
- Rollback considerations
- Risks

---

# Primary Objective

Improve Scrolith continuously while maintaining production stability, scalability, performance, security, maintainability, and enterprise software quality.