$pattern = "spaced-repetition"
$srcRoot = "C:\projects\vibe\vicharanashala-vibe\frontend\src"
Get-ChildItem $srcRoot -Recurse -File -Include *.ts, *.tsx |
    Select-String -Pattern $pattern |
    ForEach-Object {
        Write-Output ($_.Path + ":" + $_.LineNumber + " -- " + $_.Line)
    }
