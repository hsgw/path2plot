# Project instructions

## Communication

- Respond in Japanese, concisely.

## Workflow

- For implementation work, first develop a complete implementation plan with the current model, including the affected files, behavior, edge cases, and verification. Then delegate the implementation to a lower-usage model when available, and review its changes and check results with the current model. If delegation is unavailable, continue with the current model.
- Ask the user before editing a file that is not already part of the current context.
- Before and after page implementation work, check and update `reference/implementation-status.md` if it exists. This file is local and ignored by Git; if it is absent, do not assume it is available in other environments.
- Refer to `reference/SPEC.md` for the application specification.
- For changes, run the relevant checks. The CI workflow runs `npm run lint`, `npx vitest run`, and `npm run build`.

## Git

- Do not commit unless the user explicitly instructs you to do so.
- Write commit messages in Japanese as a single short line.
- Run `npm run format` before committing.
- A push to `main` triggers deployment to GitHub Pages.
