param([string]$OutputPath)
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $OutputPath) {
  $OutputPath = Join-Path (Split-Path $projectRoot -Parent) ('Pulse_개발완료_' + (Get-Date -Format 'yyyy-MM-dd_HHmmss') + '.zip')
}
$archivePath = [System.IO.Path]::GetFullPath($OutputPath)
if (Test-Path -LiteralPath $archivePath) { throw "Existing archive will not be overwritten: $archivePath" }
Add-Type -AssemblyName System.IO.Compression
$files = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
foreach ($folder in @('src','public','scripts','docs','e2e','dist')) {
  Get-ChildItem -LiteralPath (Join-Path $projectRoot $folder) -Recurse -File | ForEach-Object { [void]$files.Add($_.FullName) }
}
foreach ($name in @('README.md','package.json','package-lock.json','index.html','.gitignore','vite.config.ts','playwright.config.ts','postcss.config.cjs','tailwind.config.ts','tsconfig.json','tsconfig.node.json','vercel.json')) {
  [void]$files.Add((Join-Path $projectRoot $name))
}
$evidenceRoot = Join-Path $projectRoot 'output/playwright'
Get-ChildItem -LiteralPath $evidenceRoot -File | Where-Object Extension -In '.json','.png' | ForEach-Object { [void]$files.Add($_.FullName) }
Get-ChildItem -LiteralPath $evidenceRoot -Directory | Where-Object { $_.Name -eq 'journeys' -or $_.Name -like 'pwa-*' } | ForEach-Object {
  Get-ChildItem -LiteralPath $_.FullName -File | Where-Object Extension -In '.json','.png' | ForEach-Object { [void]$files.Add($_.FullName) }
}
$stream = [System.IO.File]::Open($archivePath, [System.IO.FileMode]::CreateNew)
$archive = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($file in ($files | Sort-Object)) {
    $absolute = [System.IO.Path]::GetFullPath($file)
    if (-not $absolute.StartsWith($projectRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) { throw "File outside project: $absolute" }
    $relative = $absolute.Substring($projectRoot.Length + 1).Replace('\','/')
    $entry = $archive.CreateEntry('Pulse/' + $relative, [System.IO.Compression.CompressionLevel]::Optimal)
    $inputStream = [System.IO.File]::OpenRead($absolute)
    $outputStream = $entry.Open()
    try { $inputStream.CopyTo($outputStream) } finally { $inputStream.Dispose(); $outputStream.Dispose() }
  }
} finally { $archive.Dispose(); $stream.Dispose() }
[pscustomobject]@{ Path=$archivePath; Files=$files.Count; Bytes=(Get-Item -LiteralPath $archivePath).Length }
