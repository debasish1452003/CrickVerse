# CrickVerse — daily pre-2000 recovery drip.
# Runs ONE small, polite batch of per-player Statsguru recovery on this machine's
# (residential) IP. Safe to miss days / run twice: the CoverageGap-driven queue is
# durable and the task is idempotent. Stops itself on any 403/429/captcha.
#
# Register with Windows Task Scheduler — see apps/worker/docs/data-completeness-runbook.md.
#
# Tunables (override via env before the scheduled task, or edit here):
$Limit   = if ($env:RECOVER_LIMIT)    { $env:RECOVER_LIMIT }    else { "30" }
$DelayMs = if ($env:RECOVER_DELAY_MS) { $env:RECOVER_DELAY_MS } else { "4000" }

# Resolve repo root (two levels up from this script: apps/worker/scripts -> repo).
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
Set-Location $RepoRoot

# Capture everything to a per-day log so scheduled (headless) runs are trackable.
$LogDir = Join-Path $RepoRoot "data\recovery\logs"
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Force -Path $LogDir | Out-Null }
$Log = Join-Path $LogDir ("recover-{0}.log" -f (Get-Date -Format "yyyy-MM-dd"))
Start-Transcript -Path $Log -Append | Out-Null

$stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Write-Host "[$stamp] CrickVerse recovery drip — limit=$Limit delay=${DelayMs}ms"

# Use the workspace script so .env is loaded via dotenv-cli.
# NOTE: this is a PNPM workspace — root `npm -w` fails, so target the package dir
# directly with `--prefix`.
& npm --prefix "apps/worker" run recover:player-careers -- --limit=$Limit --delay-ms=$DelayMs
$code = $LASTEXITCODE

$stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
if ($code -eq 0) { Write-Host "[$stamp] done (exit 0)" }
else { Write-Host "[$stamp] exited $code — queue left intact, will resume next run" }
Stop-Transcript | Out-Null
exit $code
