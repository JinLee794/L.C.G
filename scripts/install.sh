#!/usr/bin/env bash

set -euo pipefail

REPO_OWNER="JinLee794"
REPO_NAME="L.C.G"
REPO_REF="main"
INSTALL_DIR="${PWD}/${REPO_NAME}"
FORCE=0
BOOTSTRAP_ARGS=()

usage() {
  cat <<'EOF'
Usage: install.sh [--dir <path>] [--ref <git-ref>] [--force] [--bootstrap-arg <arg>]

Downloads the public L.C.G repository archive, extracts it into the current
directory, and runs the repo bootstrap script.

Examples:
  curl -fsSL https://raw.githubusercontent.com/JinLee794/L.C.G/main/scripts/install.sh | bash
  curl -fsSL https://raw.githubusercontent.com/JinLee794/L.C.G/main/scripts/install.sh | bash -s -- --dir "$HOME/src/L.C.G"
EOF
}

say() {
  printf '%s\n' "$*"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir)
      INSTALL_DIR="$2"
      shift 2
      ;;
    --ref)
      REPO_REF="$2"
      shift 2
      ;;
    --force)
      FORCE=1
      shift
      ;;
    --bootstrap-arg)
      BOOTSTRAP_ARGS+=("$2")
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      BOOTSTRAP_ARGS+=("$1")
      shift
      ;;
  esac
done

if ! command -v curl >/dev/null 2>&1; then
  say "curl is required to download the installer archive."
  exit 1
fi

if ! command -v tar >/dev/null 2>&1; then
  say "tar is required to extract the installer archive."
  exit 1
fi

INSTALL_DIR="${INSTALL_DIR/#\~/$HOME}"
INSTALL_PARENT="$(dirname "$INSTALL_DIR")"

# Block installation into cloud-synced directories (credentials would sync to the cloud).
INSTALL_DIR_LOWER="$(printf '%s' "$INSTALL_DIR" | tr '[:upper:]' '[:lower:]')"
if [[ "$INSTALL_DIR_LOWER" == *"onedrive"* || "$INSTALL_DIR_LOWER" == *"dropbox"* || "$INSTALL_DIR_LOWER" == *"google drive"* || "$INSTALL_DIR_LOWER" == *"icloud"* ]]; then
  say "ERROR: Install path appears to be inside a cloud-synced folder:"
  say "  $INSTALL_DIR"
  say ""
  say "L.C.G. stores cached credentials locally (.env, .npmrc tokens). Installing"
  say "here would sync those secrets to the cloud — which will get you an email"
  say "from CISO you don't want."
  say ""
  say "Choose a non-synced directory instead:"
  say "  curl ... | bash -s -- --dir \"\$HOME/L.C.G\""
  exit 1
fi

if [[ -e "$INSTALL_DIR" && $FORCE -ne 1 ]]; then
  say "Destination already exists: $INSTALL_DIR"
  say "Re-run with --force to replace it, or use --dir to choose another path."
  exit 1
fi

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

ARCHIVE_URL="https://codeload.github.com/${REPO_OWNER}/${REPO_NAME}/tar.gz/refs/heads/${REPO_REF}"
ARCHIVE_PATH="$TMP_DIR/${REPO_NAME}.tar.gz"

say "Downloading ${REPO_OWNER}/${REPO_NAME}@${REPO_REF}..."
curl -fsSL "$ARCHIVE_URL" -o "$ARCHIVE_PATH"

say "Extracting archive..."
tar -xzf "$ARCHIVE_PATH" -C "$TMP_DIR"

EXTRACTED_DIR="$TMP_DIR/${REPO_NAME}-${REPO_REF}"
if [[ ! -d "$EXTRACTED_DIR" ]]; then
  say "Expected extracted directory not found: $EXTRACTED_DIR"
  exit 1
fi

mkdir -p "$INSTALL_PARENT"
if [[ -e "$INSTALL_DIR" ]]; then
  rm -rf "$INSTALL_DIR"
fi
mv "$EXTRACTED_DIR" "$INSTALL_DIR"

say "Running bootstrap from $INSTALL_DIR..."
cd "$INSTALL_DIR"

# When invoked via `curl | bash`, stdin is the pipe (already consumed).
# Reopen stdin from /dev/tty so bootstrap prompts can read user input.
if [[ ! -t 0 ]] && [[ -e /dev/tty ]]; then
  exec </dev/tty
fi

exec bash ./scripts/bootstrap.sh ${BOOTSTRAP_ARGS[@]+"${BOOTSTRAP_ARGS[@]}"}