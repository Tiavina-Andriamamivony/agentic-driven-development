#!/usr/bin/env bash
set -euo pipefail

LOU_DEMO_ISSUE="${LOU_DEMO_ISSUE:-}"

scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT

git -C "$scratch" init -q
git -C "$scratch" -c user.email=demo@lou.dev -c user.name=Lou commit --allow-empty -q -m "chore: scaffold demo project"
printf 'module.exports = exports\n' > "$scratch/index.js"
printf '{"name":"demo","private":true,"scripts":{"test":"node --test"}}\n' > "$scratch/package.json"

cd "$scratch"
lou doctor
lou init
if [[ -n "$LOU_DEMO_ISSUE" ]]; then
  lou run "$LOU_DEMO_ISSUE"
fi
lou runs