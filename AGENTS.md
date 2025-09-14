# Codex Agents Guide

This repository is a PNPM + Turborepo style monorepo with three apps:

- backend: Express + TypeScript API (MongoDB)
- admin: Next.js admin portal
- mobile: Expo (React Native)

## Quick Tasks

Codex tasks are defined in `.codex/codex.yaml`:

- setup: `pnpm install`
- dev: `pnpm dev` (backend + admin concurrently)
- backend:dev | backend:build | backend:start | backend:seed
- admin:dev | admin:build | admin:start
- mobile:web | mobile:ios | mobile:android

## Environment

- Requires Node and PNPM (see `packageManager` in `package.json`).
- Backend needs a `.env` at `backend/.env` (see `backend/.env.sample`). The backend connects to MongoDB via the env vars in that file. Seeding requires the same.
- Admin defaults to Next.js dev server; ensure the backend URL is configured in admin app code if needed.
- Mobile uses Expo; `mobile:web` works without native SDKs, while `ios`/`android` require platform tooling or simulators.

## Notes for Agents

- Root scripts:
  - `pnpm dev` runs backend and admin concurrently via `concurrently`.
  - Turborepo is configured in `turbo.json` but is not required to run dev tasks.
- Workspace declaration in `pnpm-workspace.yaml` lists `admin-portal` but the folder is `admin`. Use explicit `--dir` flags (as the tasks do) to avoid relying on workspace resolution.
- Avoid network calls during analysis; prefer local commands and file inspection.

## Useful Paths

- Backend entry: `backend/src/server.ts`
- Admin entry: `admin/`
- Mobile entry: `mobile/`

