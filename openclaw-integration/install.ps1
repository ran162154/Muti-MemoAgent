Write-Host "Installing Muti-MemoAgent for OpenClaw..."

$workspace = if ($args[0]) { $args[0] } else { "$env:USERPROFILE\.openclaw\workspace" }
$repoDir = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

Set-Location $workspace

npm link "$repoDir\cli" 2>$null
if ($LASTEXITCODE -eq 0) { Write-Host "✅ CLI linked" } else { Write-Host "⚠️  Link failed — run manually: cd $repoDir\cli && npm link" }

Copy-Item "$repoDir\openclaw-integration\memograph-hook.cmd" "$env:USERPROFILE\.openclaw\" -Force
Copy-Item "$repoDir\openclaw-integration\memograph-message-hook.cmd" "$env:USERPROFILE\.openclaw\" -Force
Write-Host "✅ Hooks installed"

Write-Host ""
Write-Host "=================================================="
Write-Host "  Muti-MemoAgent installed for OpenClaw"
Write-Host "  Run: mutimemoagent init --xiami-key YOUR_KEY"
Write-Host "=================================================="
