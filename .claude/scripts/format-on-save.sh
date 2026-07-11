#!/bin/bash
# Format-on-save za Claude Code (Write|Edit). Vanilla JS/CSS/HTML PWA.
input=$(cat)
file_path=$(echo "$input" | python -c "import sys,json; print(json.load(sys.stdin)['tool_input'].get('file_path',''))" 2>/dev/null)
[ -z "$file_path" ] && exit 0
[ ! -f "$file_path" ] && exit 0

case "$file_path" in
  *.js|*.mjs|*.cjs)
    npx prettier --write "$file_path" 2>/dev/null
    npx eslint --fix "$file_path" 2>/dev/null
    ;;
  *.json|*.css|*.html|*.md|*.yaml|*.yml)
    npx prettier --write "$file_path" 2>/dev/null
    ;;
esac
exit 0
