$pattern = "spaced-repetition/hooks/spaced-repetition"
$srcRoot = "C:\projects\vibe\vicharanashala-vibe\frontend\src"
Get-ChildItem $srcRoot -Recurse -File -Include *.ts, *.tsx, *.json |
    Select-String -Pattern $pattern |
    ForEach-Object {
        Write-Output ($_.Path + ":" + $_.LineNumber + " -- " + $_.Line)
    }