#!/usr/bin/env bash
set -euo pipefail

asciinema rec --title "Lou — 30 seconds" --idle-time-limit 1.5 --overwrite "$(dirname "$0")/lou-demo.cast" -c "bash demos/run-demo.sh"