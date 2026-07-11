#!/bin/bash
# PreToolUse hook: intent-based bump guard.
# Veze se na DEKLARIRANU NAMJERU (tip commita), ne na putanju fajla.
# Source ovog repoa je u rootu (app.js, solver.js, sudoku.js, sw.js, style.css,
# index.html, manifest.webmanifest) - tooling (.mjs/.json/.prettierrc/docs) ne broji.

CMD=$(python -c "import sys,json; print(json.load(sys.stdin)['tool_input'].get('command',''))" 2>/dev/null)

# Samo git commit komande
echo "$CMD" | grep -qE 'git commit' || exit 0

# Staged fileovi (+ fileovi dodani inline preko git add u istoj komandi)
STAGED=$(git diff --cached --name-only)
ADD_PART=$(echo "$CMD" | sed -n 's/.*git add \([^&]*\).*/\1/p')
if [ -n "$ADD_PART" ]; then
    STAGED="$STAGED
$(echo "$ADD_PART" | tr ' ' '\n')"
fi

# Guard se aktivira samo ako su app source fileovi dirani (root-level runtime)
echo "$STAGED" | grep -qE '^[^/]+\.(js|css|html|webmanifest)$' || exit 0

deny() {
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}' "$1"
    exit 0
}

# Commit poruka iz -m / --message (robusno preko shlex)
MSG=$(printf '%s' "$CMD" | python -c "
import sys, shlex
try:
    toks = shlex.split(sys.stdin.read())
except Exception:
    toks = []
msg = ''
for i, t in enumerate(toks):
    if t in ('-m', '--message') and i + 1 < len(toks):
        msg = toks[i + 1]; break
    if t.startswith('-m') and len(t) > 2:
        msg = t[2:]; break
    if t.startswith('--message='):
        msg = t[len('--message='):]; break
    if t in ('-F', '--file') and i + 1 < len(toks) and toks[i + 1] != '-':
        try:
            msg = open(toks[i + 1], encoding='utf-8', errors='replace').read()
        except Exception:
            msg = ''
        break
    if t.startswith('--file=') and t[len('--file='):] != '-':
        try:
            msg = open(t[len('--file='):], encoding='utf-8', errors='replace').read()
        except Exception:
            msg = ''
        break
print(msg)
" 2>/dev/null)

# Tip je u PRVOM retku (conventional header). MSG je cesto viseredan (tijelo +
# Co-Authored-By), pa tip vadimo samo iz headera - inace sed hvata i rijeci iz
# tijela i TYPE postane viseredan (ne matcha case -> lazni blok).
HEADER=$(printf '%s' "$MSG" | head -1)
TYPE=$(printf '%s' "$HEADER" | sed -n 's/^\([a-zA-Z]\+\).*/\1/p' | tr 'A-Z' 'a-z')

# Breaking: "tip!:" / "tip(scope)!:" u headeru ili "BREAKING CHANGE" bilo gdje
BREAKING=0
printf '%s' "$HEADER" | grep -qE '^[a-zA-Z]+(\([^)]*\))?!:' && BREAKING=1
printf '%s' "$MSG" | grep -q 'BREAKING CHANGE' && BREAKING=1

# Je li version linija promijenjena. Staged uvijek broji. Unstaged broji SAMO
# ako je package.json u inline "git add" istoj komandi - jer se PreToolUse hook
# pokrece PRIJE staginga (kombinacija: git add package.json && git commit ...),
# a bez gejta bi "viseca" nestageana izmjena verzije dala lazni pozitiv.
BUMPED=0
git diff --cached -U0 -- package.json 2>/dev/null | grep -qE '^\+[[:space:]]*"version"' && BUMPED=1
if [ "$BUMPED" != "1" ] && echo "$ADD_PART" | grep -q 'package\.json'; then
    git diff -U0 -- package.json 2>/dev/null | grep -qE '^\+[[:space:]]*"version"' && BUMPED=1
fi

# Breaking uvijek trazi bump (major)
if [ "$BREAKING" = "1" ] && [ "$BUMPED" != "1" ]; then
    deny "Breaking promjena (!: / BREAKING CHANGE) a verzija nije podignuta. Bumpaj major u package.json."
fi

case "$TYPE" in
    feat|fix|perf)
        [ "$BUMPED" = "1" ] || deny "Tip '$TYPE' mijenja ponasanje a verzija nije podignuta. Bumpaj package.json (feat -> minor, fix/perf -> patch)."
        ;;
    docs|chore|style|refactor|test|ci|build|revert)
        : # bez bumpa OK
        ;;
    *)
        deny "Diras app source ali namjera nije deklarirana. Dodaj conventional prefiks u commit poruku (feat/fix/docs/chore/refactor...) da guard moze odluciti treba li bump."
        ;;
esac

exit 0
