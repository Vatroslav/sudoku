# Sudoku - upute za Claude Code

Vanilla JS PWA (bez build sustava). Source u rootu: `index.html`, `app.js`,
`solver.js`, `sudoku.js`, `sw.js`, `style.css`, `manifest.webmanifest`.

## Linting

- ESLint 9 (flat config, `eslint.config.mjs`) + Prettier (`.prettierrc`).
- Format-on-save hook (`.claude/scripts/format-on-save.sh`) formatira na Write/Edit.
- Rucno: `npm run lint` / `npm run format`.

## Versioning

- Version file: `package.json` (`"version"`).
- Bump je rucan, u istom commitu s promjenom. **Bez** test suffixa.
  - feat -> minor (`1.3.2` -> `1.4.0`)
  - fix / perf -> patch (`1.3.2` -> `1.3.3`)
  - breaking (`!:` / `BREAKING CHANGE`) -> major (`1.3.2` -> `2.0.0`)
- Cisti docs / chore / refactor / style / test / tooling bez ucinka na runtime -> **bez bumpa**, cak i kad diraju source.
- **Conventional commit prefiks je obavezan kad se dira source** - hook iz njega cita namjeru (treba li bump).
- Tag tek kad verzija dode do korisnika (itch/prod deploy). Do tada verzija raste bez tagova; tag = broj koji je tad ziv + GitHub release.
- Hook (`.claude/hooks/check-version-bump.sh`) blokira: (1) diranje sourcea bez deklariranog tipa, (2) feat/fix/perf/breaking bez bumpa.
- `sw.js` `CACHE = "sudoku-vN"` je interni naziv cachea, NE verzija aplikacije - ne treba ga dizati (service worker ide `cache: "reload"`).
