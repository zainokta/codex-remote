Codebase conventions observed:
- TypeScript with ESM modules and explicit package/workspace boundaries.
- React function components and hooks in the frontend.
- Shared API contracts live in packages/shared-types and are imported via workspace package name.
- Naming is descriptive and camelCase for functions/variables, PascalCase for React components/types where appropriate.
- Files generally use single quotes and omit semicolons.
- Frontend routes follow TanStack file-based routing under apps/mobile-web/src/routes.
- Gateway logic is split into focused services under apps/codex-gateway/src/services.
- Prefer minimal changes that preserve existing structure and patterns.