# Copilot Instructions

## Project

This is an ESM Node.js/TypeScript toolkit with three entry points:
`format-md`, `format-list`, and `format-url-content`. The last one fetches recipe
pages, detects and extracts candidates, reconciles fields, and renders Markdown.
Its subsystems live under `src/format-url-content/` in folders named for their
responsibility.

## Commands

Run these from the repository root:

- `npm install` - install dependencies.
- `npm test` - run Vitest tests.
- `npm run tsc-check` - type-check without emitting files.
- `npm run lint` - run ESLint.
- `npm run format:check` - check Prettier formatting.

Use `npm run lint:fix` or `npm run format:write` only when intentionally
modifying files.

## Conventions

- Follow strict TypeScript and the existing ESM style; imports use `.ts` extensions.
- Import helpers and types directly from their defining modules. Reuse existing
  code instead of adding duplicate wrappers or re-export workarounds.
- Keep utilities shared across all formatters in `src/shared/`. Keep
  `format-url-content`-only helpers within that module.
- Preserve the existing ESLint and Prettier configuration.

## Keep Changes Minimal

- Apply YAGNI: first verify that the requested code or abstraction is needed.
- Look for an existing helper, type, dependency, or platform feature before writing new code.
- Reuse existing dependencies where possible. Get user approval before installing,
  adding, or upgrading a dependency; modify the lockfile only when an approved
  dependency change requires it.
- Prefer the smallest clear solution that solves the actual problem.
- For bug fixes, inspect all callers of shared code and fix the root cause once.
- Do not simplify away input validation, error handling, security, accessibility,
  or explicitly requested behavior.
- Preserve unrelated working-tree changes. Do not modify generated files, fixtures,
  snapshots, or other unrelated files unless the task requires it.
- Do not edit `package-lock.json` by hand; let `npm install` regenerate it, and only
  when an approved dependency change requires it.

## Important Invariants

- The project uses fixture-backed integration tests. When extraction or Markdown
  output changes, update the relevant fixtures in `tests/fixtures/` and
  `tests/format-url-content.integration.test.ts`.
- Tests must not depend on real websites or OpenAI API access.

## Secrets

- Never hard-code, print, commit, or expose `OPENAI_API_KEY` or other credentials.
- Use environment variables or a local `.env` file for development and tests.

## Workflow

Inspect the relevant code and nearby tests before editing. Preserve unrelated
working-tree changes. After editing, run the narrowest relevant check, then the
broader checks from the Commands section when practical.

## Responses

Keep responses minimal and focused on the requested result. Avoid broad
explanations unless the user explicitly asks for detailed information.
