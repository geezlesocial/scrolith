# Scrolith Monorepo

Scrolith is organized as a parent repository with:

- `geezle/` -> frontend application (Vite + React)
- `geezle-backend/` -> backend API (Node.js + Prisma + PostgreSQL)

## Repository links

- Main repository: `https://github.com/geezlesocial/scrolith`

## Quick start (local development)

### 1) Clone

```bash
git clone --recurse-submodules git@github.com:geezlesocial/scrolith.git
cd scrolith
git submodule sync --recursive
git submodule update --init --recursive
```

### 2) Backend

```bash
cd geezle-backend
npm ci
npm run dev
```

### 3) Frontend

```bash
cd geezle
npm ci
npm run dev
```

## Production hosting documentation

Use the full cloud deployment guide:

- `docs/CLOUD_HOSTING_GUIDE.md`

This includes step-by-step instructions for:

- transferring/downloading from local machine or GitHub
- production env setup
- Microsoft Azure deployment
- AWS deployment
- Google Cloud deployment
- production hardening checklist

## Container assets

- `deploy/docker/backend.Dockerfile`
- `deploy/docker/frontend.Dockerfile`
- `deploy/nginx/frontend.conf`
- `docker-compose.prod.yml`
- `.env.production.example`

Run local production simulation:

```bash
cp .env.production.example .env.production
docker compose -f docker-compose.prod.yml --env-file .env.production up --build
```

Note:
- The backend container starts with `ts-node` transpile-only mode, matching the current runtime behavior used in local dev.
