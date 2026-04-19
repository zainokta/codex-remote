When finishing a coding task in this repo:
- Run targeted tests for changed workspace(s) at minimum.
- If changes span multiple workspaces or shared contracts, run root `npm run test`.
- Run relevant lint/typecheck commands. For frontend changes, run `npm run lint --workspace @codex-remote/mobile-web`. For gateway/shared-types changes, run each workspace `lint` script.
- Run builds when behavior or type contracts changed: root `npm run build` or the affected workspace build.
- Do not claim success without command output confirming the result.
- Avoid touching unrelated dirty worktree changes.