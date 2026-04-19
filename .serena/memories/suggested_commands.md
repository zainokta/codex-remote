Project commands:
- `npm install` — install workspace dependencies
- `npm run build` — build shared-types, gateway, and mobile-web from the repo root
- `npm run test` — run all workspace tests from the repo root
- `npm run lint` — run lint/typecheck tasks across all workspaces from the repo root

Workspace commands:
- `npm run dev --workspace @codex-remote/mobile-web` — run the mobile web app on port 3000
- `npm run preview --workspace @codex-remote/mobile-web` — preview the built mobile web app on port 3000
- `npm run dev --workspace @codex-remote/gateway` — run the gateway with Node watch mode
- `npm run start --workspace @codex-remote/gateway` — start the built gateway from dist
- `npm run build --workspace @codex-remote/shared-types` — build shared types package
- `npm run test --workspace @codex-remote/mobile-web` — run frontend Vitest suite
- `npm run test --workspace @codex-remote/gateway` — run gateway Node test suite
- `npm run lint --workspace @codex-remote/mobile-web` — run frontend ESLint
- `npm run format --workspace @codex-remote/mobile-web` — check Prettier formatting
- `npm run check --workspace @codex-remote/mobile-web` — write Prettier formatting and apply ESLint fixes

Useful Linux utilities in this environment:
- `rtk git status`, `rtk git diff`, `rtk git log --oneline -5`
- `ls`, `pwd`, `rg`, `npm`