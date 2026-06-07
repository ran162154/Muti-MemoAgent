#!/bin/bash
# Muti-MemoAgent — Message Preprocessor
msg="$1"
if [[ ${#msg} -gt 100 ]] || echo "$msg" | grep -qiE "记住|偏好|喜欢|不喜欢|习惯|流程|配置|密码|token|key"; then
  cd "$HOME/.openclaw/workspace"
  mutimemoagent memo "$msg" --type fact --source dialogue 2>/dev/null || true
fi
