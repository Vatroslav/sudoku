# Sudoku - upute za Claude Code

Vanilla JS PWA (bez build sustava). Source u rootu: `index.html`, `app.js`,
`solver.js`, `sudoku.js`, `sw.js`, `style.css`, `manifest.webmanifest`.

## Linting

- ESLint 9 (flat config, `eslint.config.mjs`) + Prettier (`.prettierrc`).
- Format-on-save hook (`.claude/scripts/format-on-save.sh`) formatira na Write/Edit.
- Rucno: `npm run lint` / `npm run format`.

## Versioning

Intent-based model - puna pravila: `~/.claude/knowledge/versioning-intent.md`. Hook: `.claude/hooks/check-version-bump.sh`.
- Version file: `package.json` (`"version"`).
- Tag na itch/prod deploy.
- `sw.js` `CACHE = "sudoku-vN"` je interni naziv cachea, NE verzija aplikacije - ne treba ga dizati (service worker ide `cache: "reload"`).
