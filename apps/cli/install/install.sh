#!/usr/bin/env bash
# Lou — one-line installer for Linux and macOS.
# Downloads the Lou sources from GitHub and wires the `lou` launcher.
#   curl -fsSL https://raw.githubusercontent.com/LOU_REPO/main/apps/cli/install/install.sh | bash
# Windows: apps/cli/install/install.ps1

set -euo pipefail

LOU_REPO="${LOU_REPO:-Tiavina-Andriamamivony/lou-agents-orchestrator}"
LOU_ARCHIVE_URL="${LOU_ARCHIVE_URL:-}"

PREFIX="${LOU_PREFIX:-$HOME/.lou}"
VERSION="${LOU_VERSION:-main}"
NODE_BIN="${NODE_BIN:-node}"
QUIET=false

if [[ $- == *i* ]]; then INTERACTIVE=true; else INTERACTIVE=false; fi
if [[ "${CI:-}" == "true" || "${NO_COLOR:-}" != "" ]]; then COLOR=false; else COLOR=true; fi

C_DIM='\033[2m'
C_RED='\033[31m'
C_GREEN='\033[32m'
C_YELLOW='\033[33m'
C_CYAN='\033[36m'
C_BOLD='\033[1m'
C_RST='\033[0m'
CHECK='OK'
CROSS='KO'

if [[ "$COLOR" != true ]]; then
  C_DIM=''; C_RED=''; C_GREEN=''; C_YELLOW=''; C_CYAN=''; C_BOLD=''; C_RST=''
  CHECK='[ok]'
  CROSS='[!!]'
fi

abort() {
  printf "%b%b\n%b\n" "$C_RED" "$CROSS $*" "$C_RST" >&2
  exit 1
}

say() {
  printf "%b%s%b\n" "$C_DIM" "$*" "$C_RST"
}

info() {
  printf "%b%s%b\n" "$C_YELLOW" "$*" "$C_RST"
}

good() {
  printf "%b%s%b\n" "$C_GREEN" "$*" "$C_RST"
}

banner() {
  printf "%b" "$C_CYAN"
  cat <<'EOF'
   ██╗      ██████╗ ██╗   ██╗
   ██║     ██╔═══██╗██║   ██║
   ██║     ██║   ██║██║   ██║
   ██║     ██║   ██║██║   ██║
   ███████╗╚██████╔╝╚██████╔╝
   ╚══════╝ ╚═════╝  ╚═════╝
EOF
  printf "%b  Lou · Agentic-Driven Orchestration — installer%b\n\n" "$C_BOLD" "$C_RST"
}

usage() {
  cat <<EOF
Usage: install.sh [options]

  --prefix <dir>    install directory (default: ~/.lou, or \$LOU_PREFIX)
  --version <ref>   Lou version to install: a tag or 'main' (default: \$LOU_VERSION or main)
  --node <bin>      node binary to use (default: \$NODE_BIN or 'node')
  --quiet           minimal output
  -h, --help        show this help
EOF
}

cmd_exists() {
  command -v "$1" >/dev/null 2>&1
}

spin_until() {
  local pid="$1" frames='-\|/' i=0
  while kill -0 "$pid" 2>/dev/null; do
    printf '\r  %b%b%b ' "$C_DIM" "${frames:i%4:1}" "$C_RST"
    i=$((i + 1))
    sleep 0.1
  done
  printf '\r  %b  %b' "$C_DIM" "$C_RST"
}

run_step() {
  local label="$1"
  shift
  local log pid
  log="$(mktemp -d)/step.log"
  printf '%b·%b %b ...' "$C_DIM" "$C_RST" "$label"
  "$@" >"$log" 2>&1 &
  pid=$!
  if [[ -t 1 && "$QUIET" != true ]]; then
    spin_until "$pid"
  else
    while kill -0 "$pid" 2>/dev/null; do sleep 0.3; done
    printf '\r  %b  %b' "$C_DIM" "$C_RST"
  fi
  if ! wait "$pid"; then
    printf '\r%bKO%b  %s\n' "$C_RED" "$C_RST" "$label"
    sed -n '1,25p' "$log" >&2 || true
    abort "Step failed: $label"
  fi
  printf '\r%bOK%b  %s\n' "$C_GREEN" "$C_RST" "$label"
}

find_node() {
  if ! cmd_exists "$NODE_BIN"; then
    abort "Node.js was not found ($NODE_BIN). Install Node v22 or newer from https://nodejs.org"
  fi
  if ! "$NODE_BIN" --experimental-strip-types -e 'console.log("ok")' >/dev/null 2>&1; then
    abort "Your Node ($("$NODE_BIN" --version)) lacks --experimental-strip-types. Use Node v22.7 or newer."
  fi
}

download_archive() {
  local url
  if [[ -n "$LOU_ARCHIVE_URL" ]]; then
    url="$LOU_ARCHIVE_URL"
  elif [[ "$VERSION" == "main" ]]; then
    url="https://github.com/$LOU_REPO/archive/refs/heads/main.tar.gz"
  else
    url="https://github.com/$LOU_REPO/archive/refs/tags/$VERSION.tar.gz"
  fi
  if cmd_exists curl; then
    curl -fsSL "$url" -o "$TARBALL"
  elif cmd_exists wget; then
    wget -qO "$TARBALL" "$url"
  else
    abort "Install curl or wget, then re-run this installer."
  fi
}

install_sources() {
  local tmp root
  tmp="$(mktemp -d)"
  tar -xzf "$TARBALL" -C "$tmp"
  if [[ -f "$tmp/apps/cli/src/cli.ts" ]]; then
    root="$tmp"
  else
    root="$(find "$tmp" -mindepth 1 -maxdepth 1 -type d | head -n1)"
  fi
  if [[ -z "$root" || ! -f "$root/apps/cli/src/cli.ts" ]]; then
    rm -rf "$tmp"
    abort "The archive did not contain the Lou sources."
  fi
  mkdir -p "$PREFIX"
  rm -rf "$PREFIX/$VERSION" "$PREFIX/current"
  mv "$root" "$PREFIX/$VERSION"
  ln -sfn "$PREFIX/$VERSION" "$PREFIX/current"
  rm -rf "$tmp" "$TARBALL"
}

install_launcher() {
  local src
  src="$PREFIX/current/apps/cli/src/cli.ts"
  mkdir -p "$PREFIX/bin"
  cat >"$PREFIX/bin/lou" <<EOF
#!/usr/bin/env bash
exec "$NODE_BIN" --no-warnings --experimental-strip-types "$src" "\$@"
EOF
  chmod +x "$PREFIX/bin/lou"
}

add_to_path() {
  local line bin
  bin="$PREFIX/bin"
  line='export PATH="'"$bin"':$PATH"'
  for rc in "$HOME/.bashrc" "$HOME/.zshrc"; do
    [[ -f "$rc" ]] || continue
    grep -qF "$bin" "$rc" 2>/dev/null && continue
    printf '\n# added by the Lou installer\n%s\n' "$line" >>"$rc"
    info "PATH updated in $rc"
  done
}

find_pnpm() {
  local out cmd
  out="$PREFIX/.pnpm-cmd"
  if cmd_exists pnpm; then
    printf 'pnpm' >"$out"
  elif cmd_exists corepack; then
    say "       using corepack to run pnpm (downloads on first use)"
    printf 'corepack pnpm' >"$out"
  elif cmd_exists npm; then
    say "       adopting pnpm via  npm install -g pnpm  (one-time)"
    npm install -g pnpm >/dev/null 2>&1 || true
    if ! cmd_exists pnpm; then
      abort "npm failed to install pnpm."
    fi
    printf 'pnpm' >"$out"
  else
    abort "pnpm was not found. Install it (https://pnpm.io/installation) or enable corepack, then re-run this installer."
  fi
  cmd="$(cat "$out")"
  if ! $cmd --version >/dev/null 2>&1; then
    abort "pnpm did not start. Install pnpm (https://pnpm.io/installation), then re-run this installer."
  fi
}

install_deps() {
  local cmd
  cmd="$(cat "$PREFIX/.pnpm-cmd")"
  if ! (
    cd "$PREFIX/current"
    $cmd install --prod --frozen-lockfile --ignore-scripts
  ); then
    abort "Installing Lou dependencies failed. Re-run with network access."
  fi
}

verify() {
  "$PREFIX/bin/lou" --version >/dev/null
}

main() {
  local arg
  while [[ $# -gt 0 ]]; do
    case "$1" in
    --prefix)
      PREFIX="${2:?--prefix needs a value}"
      shift 2
      ;;
    --version)
      VERSION="${2:?--version needs a value}"
      shift 2
      ;;
    --node)
      NODE_BIN="${2:?--node needs a value}"
      shift 2
      ;;
    --quiet)
      QUIET=true
      shift
      ;;
    --help | -h)
      usage
      exit 0
      ;;
    *)
      abort "Unknown option: $1 (see --help)"
      ;;
    esac
  done

  if [[ "$QUIET" != true ]]; then banner; fi
  mkdir -p "$PREFIX"
  TARBALL="$PREFIX/.lou-archive.tar.gz"
  rm -f "$TARBALL"
  run_step "Detecting system" uname -s -m
  run_step "Locating Node runtime" find_node
  say "       runtime: $("$NODE_BIN" --version) ($(uname -s) $(uname -m))"
  run_step "Downloading Lou ($VERSION)" download_archive
  run_step "Extracting sources" install_sources
  run_step "Locating pnpm tooling" find_pnpm
  run_step "Installing dependencies" install_deps
  run_step "Installing launcher" install_launcher
  run_step "Adding to PATH" add_to_path
  run_step "Verifying install" verify

  printf '\n%s\n' "$(printf '%*s' "$(tput cols 2>/dev/null || echo 40)" '' | tr ' ' '─')"
  good "Lou $VERSION installed."
  say "  Binary : $PREFIX/bin/lou"
  say "  Sources: $PREFIX/current"
  say "  Version: $("$PREFIX/bin/lou" --version)"
  printf '\n'
  info "Next steps:"
  say "  1. Restart your shell (or run: source ~/.bashrc)"
  say "  2. cd into a project and run  lou init"
  say "  3. Drive a ticket to a PR with  lou run <issue-number>"
  printf '\n'
  say "Re-run this installer to upgrade. Uninstall: rm -rf $PREFIX and remove the PATH line added to ~/.bashrc or ~/.zshrc."
}

main "$@"