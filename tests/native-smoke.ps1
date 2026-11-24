param([string]$Stockfish = $(if ($env:STOCKFISH) {$env:STOCKFISH} else {"stockfish"}))
$ErrorActionPreference = 'Stop'
$projectDir = Split-Path $PSScriptRoot -Parent
$javaDir = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { 'C:/Program Files/Java/jdk-21.0.10' }
$gradleDir = if ($env:GRADLE_USER_HOME) { $env:GRADLE_USER_HOME } else { Join-Path $env:USERPROFILE '.gradle' }
$kotlinJar = Get-ChildItem "$gradleDir/caches/modules-2/files-2.1/org.jetbrains.kotlin/kotlin-stdlib/2.0.21" -Recurse -Filter '*.jar' | Select-Object -First 1 -ExpandProperty FullName
$classesDir = Join-Path $projectDir 'app/build/tmp/kotlin-classes/debug'
$testClassesDir = Join-Path $projectDir 'tests/build/native'
New-Item -ItemType Directory -Force $testClassesDir | Out-Null
& "$javaDir/bin/javac.exe" -cp "$classesDir;$kotlinJar" -d $testClassesDir "$PSScriptRoot/NativeSmoke.java"
if ($LASTEXITCODE -ne 0) { throw 'javac failed; assembleDebug first' }
& "$javaDir/bin/java.exe" -cp "$testClassesDir;$classesDir;$kotlinJar" NativeSmoke $Stockfish
if ($LASTEXITCODE -ne 0) { throw 'native smoke failed' }
