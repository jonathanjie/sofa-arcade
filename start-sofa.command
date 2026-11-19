#!/bin/bash
cd -- "$(dirname "$0")" || exit 1

sofa_node="$(command -v node 2>/dev/null || true)"
if [ -z "$sofa_node" ]; then
  for sofa_candidate in /opt/homebrew/bin/node /usr/local/bin/node; do
    if [ -x "$sofa_candidate" ]; then
      sofa_node="$sofa_candidate"
      break
    fi
  done
fi

if [ -z "$sofa_node" ] || ! "$sofa_node" -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 13) ? 0 : 1)' 2>/dev/null; then
  printf '\nSofa Arcade needs Node.js 22.13 or newer.\n'
  printf 'Install the current Node.js LTS from https://nodejs.org/ and open this launcher again.\n'
  printf '\nPress Return to close this window.\n'
  read -r sofa_finished
  exit 1
fi

"$sofa_node" scripts/lan-server.mjs
sofa_status=$?
if [ "$sofa_status" -ne 0 ]; then
  printf '\nThe local host stopped. Read the message above for the next step.\n'
  printf 'Press Return to close this window.\n'
  read -r sofa_finished
fi
exit "$sofa_status"
