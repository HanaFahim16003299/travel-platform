# Travel Planning and Booking Platform

Backend for the Software Project I semester project (Milestone 1): a NestJS REST API with MongoDB Atlas, documented with Swagger.

## Prerequisites
- Node.js 20 or newer and npm
- A MongoDB Atlas database (connection string from the team leader)

## Setup
```bash
git clone <repo-ssh-url>
cd travel-platform/backend
npm install
cp .env.example .env
```
Open `.env` and fill in the values. At minimum set `MONGODB_URI` (include the database name, for example `.../travel_platform?...`). Never commit `.env`.

## Run
```bash
npm run start:dev
```
- API: http://localhost:3000/api
- Swagger docs: http://localhost:3000/api/docs

## Branches and commits
- `main`: stable. `develop`: integration branch.
- Work on `feature/<REQ-ID>-<short-description>` branches created from `develop` and merge through pull requests into `develop`.
- Commit messages follow Conventional Commits, for example `feat(flights): add round-trip search`.

## Conventions
- Relative imports end in `.js` (for example `./auth/auth.module.js`).
- Roles: `user`, `admin`, `airline_moderator`, `hotel_moderator`.
- Every error response uses `{ statusCode, error, message, path, timestamp }`.
- List endpoints accept `page`, `limit`, `sort`, `order` and return `{ data, meta }`.
- Each member works inside their own feature folder and does not edit `app.module.ts`.

## Structure
- `backend/src/<feature>/`: one module per feature
- `backend/src/common/`: shared filters, DTOs, enums, utils
- `docs/`: requirements and API notes
- `AI_PROMPTS.txt`: AI usage log
