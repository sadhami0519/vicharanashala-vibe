# Skip node_modules entirely by walking manually with depth limit + filter
$root = "C:\projects\vibe\vicharanashala-vibe\docs"
$pattern = "spaced-repetition"

function Scan-Dir {
    param($dir, $depth)
    if ($depth -le 0) { return }
    Get-ChildItem $dir -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -ne ".git" } |
        Select-String -Pattern $pattern -ErrorAction SilentlyContinue |
        ForEach-Object { Write-Output ($_.Path + ":" + $_.LineNumber + " -- " + $_.Line) }
    Get-ChildItem $dir -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -ne "node_modules" } |
        ForEach-Object { Scan-Dir $_.FullName ($depth - 1) }
}

Scan-Dir $root 4