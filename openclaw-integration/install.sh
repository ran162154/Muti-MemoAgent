echo Installing Muti-MemoAgent for OpenClaw... 1. Link CLI from local source 2. Setup hooks

WORKSPACE="${1:-$HOME/.openclaw/workspace}"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cd "$WORKSPACE"

npm link "$REPO_DIR/cli" 2>/dev/null && echo "✅ CLI linked" || echo "⚠️  npm link failed — run: cd $REPO_DIR/cli && npm link"

cp "$REPO_DIR/openclaw-integration/memograph-hook.sh" "$HOME/.openclaw/" 2>/dev/null
cp "$REPO_DIR/openclaw-integration/memograph-message-hook.sh" "$HOME/.openclaw/" 2>/dev/null
echo "✅ Hooks installed"

echo ""
echo "=================================================="
echo "  Muti-MemoAgent installed for OpenClaw"
echo "  Run: mutimemoagent init --xiami-key YOUR_KEY"
echo "=================================================="
