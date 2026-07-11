$pattern = "spaced-repetition"
$paths = @(
    "C:\projects\vibe\vicharanashala-vibe\e2e",
    "C:\projects\vibe\vicharanashala-vibe\docs",
    "C:\projects\vibe\vicharanashala-vibe\cli"
)
foreach ($p in $paths) {
    if (Test-Path $p) {
        Get-ChildItem $p -Recurse -File -Include *.ts, *.tsx, *.js, *.json, *.md |
            Select-String -Pattern $pattern |
            ForEach-Object {
                Write-Output ($_.Path + ":" + $_.LineNumber + " -- " + $_.Line)
            }
    }
}