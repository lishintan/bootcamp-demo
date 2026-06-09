#!/usr/bin/env bash
set -euo pipefail

# ------------------------------------------------------------
# macOS Developer Bootstrap (Minimal)
# Installs:
#   - Xcode Command Line Tools
#   - Homebrew
#   - Google Cloud CLI (gcloud)
#   - Claude Code (terminal)
# ------------------------------------------------------------

RED=$'\033[1;31m'
GREEN=$'\033[1;32m'
YELLOW=$'\033[1;33m'
BLUE=$'\033[1;34m'
BOLD=$'\033[1m'
NC=$'\033[0m'

hr()   { echo "------------------------------------------------------------"; }
msg()  { printf "${BLUE}[INFO]${NC}  %s\n" "$*"; }
ok()   { printf "${GREEN}[OK]${NC}    %s\n" "$*"; }
warn() { printf "${YELLOW}[WARN]${NC}  %s\n" "$*"; }
err()  { printf "${RED}[ERROR]${NC} %s\n" "$*"; }

step() {
  echo ""
  printf "${BOLD}==> %s${NC}\n" "$*"
}

have_cmd() { command -v "$1" >/dev/null 2>&1; }

confirm() {
  local prompt="${1:-Continue?}"
  read -r -p "$prompt [y/N]: " ans
  [[ "${ans:-}" =~ ^[Yy]$ ]]
}

# ------------------------------------------------------------
# Platform Check
# ------------------------------------------------------------

if [[ "$(uname -s)" != "Darwin" ]]; then
  warn "This script is intended for macOS. Detected: $(uname -s)"
fi

# ------------------------------------------------------------
# Step 1: Xcode Command Line Tools
# ------------------------------------------------------------

step "Step 1: Xcode Command Line Tools"

if xcode-select -p >/dev/null 2>&1; then
  ok "Xcode tools already installed."
else
  warn "Xcode tools not found."
  xcode-select --install || true
  read -r -p "Finish installing Xcode tools, then press Enter to continue... " _
fi

# ------------------------------------------------------------
# Step 2: Homebrew
# ------------------------------------------------------------

step "Step 2: Homebrew"

if have_cmd brew; then
  ok "Homebrew found."
else
  warn "Homebrew not installed."

  if confirm "Install Homebrew now?"; then
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

    # Load brew into current shell
    if [[ -x /opt/homebrew/bin/brew ]]; then
      eval "$(/opt/homebrew/bin/brew shellenv)"
    elif [[ -x /usr/local/bin/brew ]]; then
      eval "$(/usr/local/bin/brew shellenv)"
    fi
  else
    err "Homebrew required. Exiting."
    exit 1
  fi
fi

msg "Updating Homebrew..."
brew update >/dev/null 2>&1 || true

# ------------------------------------------------------------
# Step 3: Install Google Cloud CLI
# ------------------------------------------------------------

step "Step 3: Google Cloud CLI (gcloud)"

if have_cmd gcloud; then
  ok "gcloud already installed."
else
  msg "Installing Google Cloud CLI..."
  brew install --cask google-cloud-sdk
  ok "Google Cloud CLI installed."
fi

# ------------------------------------------------------------
# Step 4: Authenticate gcloud
# ------------------------------------------------------------

step "Step 4: gcloud Authentication"

if confirm "Run 'gcloud auth application-default login' now?"; then
  gcloud auth application-default login
  ok "Application Default Credentials configured."
fi

if confirm "Run 'gcloud auth login' (browser login)?"; then
  gcloud auth login
  ok "User login complete."
fi

# ------------------------------------------------------------
# Step 5: Install Claude Code (terminal)
# ------------------------------------------------------------

step "Step 5: Claude Code (terminal)"

if have_cmd claude; then
  ok "Claude Code already installed."
else
  msg "Installing Claude Code..."
  curl -fsSL https://claude.ai/install.sh | bash
  ok "Claude Code installed."
fi

# ------------------------------------------------------------
# Done
# ------------------------------------------------------------

hr
ok "Environment setup complete."

msg ""
msg "Installed:"
msg "  - Xcode Command Line Tools"
msg "  - Homebrew"
msg "  - Google Cloud CLI"
msg "  - Claude Code (terminal)"
msg ""
msg "Next:"
msg "  gcloud config set project YOUR_PROJECT_ID"
msg "  gcloud config list"
msg "  claude   # to verify Claude Code works"
hr