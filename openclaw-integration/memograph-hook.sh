#!/bin/bash
# Muti-MemoAgent — OpenClaw Startup Hook
cd "$HOME/.openclaw/workspace"
mutimemoagent trigger schedule:tick 2>/dev/null || true
