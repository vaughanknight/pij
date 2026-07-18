#requires -Version 5.1

[CmdletBinding()]
param(
	[ValidateRange(1, 6)]
	[int]$StartAt = 1
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = $PSScriptRoot
$AgentRoot = Join-Path $HOME ".pi\agent"
$ExtensionSourceRoot = Join-Path $RepoRoot ".pi\extensions"
$ExtensionTargetRoot = Join-Path $AgentRoot "extensions"
$ManifestPath = Join-Path $RepoRoot ".pi\packages.yaml"
$NpmRegistryUrl = "https://packagefeedproxy.microsoft.io/npm/"
$NpmReplaceRegistryHost = "always"
$NpmPreferOnline = "true"
$ReleaseAgeDays = 7

function Write-Stage {
	param(
		[Parameter(Mandatory = $true)]
		[string]$Message
	)

	Write-Host ""
	Write-Host "=== $Message ==="
}

function Resolve-CommandPath {
	param(
		[Parameter(Mandatory = $true)]
		[string[]]$Names
	)

	foreach ($name in $Names) {
		$command = Get-Command $name -ErrorAction SilentlyContinue | Select-Object -First 1
		if ($null -ne $command) {
			return $command.Source
		}
	}

	throw "Required command not found: $($Names -join ", ")"
}

function Resolve-OptionalCommandPath {
	param(
		[Parameter(Mandatory = $true)]
		[string[]]$Names
	)

	foreach ($name in $Names) {
		$command = Get-Command $name -ErrorAction SilentlyContinue | Select-Object -First 1
		if ($null -ne $command) {
			return $command.Source
		}
	}

	return $null
}

function Invoke-Native {
	param(
		[Parameter(Mandatory = $true)]
		[string]$Command,

		[string[]]$Arguments = @(),

		[switch]$AllowFailure
	)

	& $Command @Arguments
	$exitCode = $LASTEXITCODE
	if ($exitCode -ne 0) {
		$message = "'$Command $($Arguments -join " ")' exited with code $exitCode"
		if ($AllowFailure) {
			Write-Warning $message
			return
		}
		throw $message
	}
}

function Invoke-WithNpmEnvironment {
	param(
		[Parameter(Mandatory = $true)]
		[scriptblock]$Action,

		[switch]$ClearReleaseAge
	)

	$registryName = "npm_config_registry"
	$replaceRegistryHostName = "npm_config_replace_registry_host"
	$preferOnlineName = "npm_config_prefer_online"
	$minReleaseAgeName = "npm_config_min_release_age"
	$beforeName = "npm_config_before"
	$previousRegistry = [Environment]::GetEnvironmentVariable($registryName, "Process")
	$previousReplaceRegistryHost = [Environment]::GetEnvironmentVariable($replaceRegistryHostName, "Process")
	$previousPreferOnline = [Environment]::GetEnvironmentVariable($preferOnlineName, "Process")
	$previousMinReleaseAge = [Environment]::GetEnvironmentVariable($minReleaseAgeName, "Process")
	$previousBefore = [Environment]::GetEnvironmentVariable($beforeName, "Process")
	[Environment]::SetEnvironmentVariable($registryName, $NpmRegistryUrl, "Process")
	[Environment]::SetEnvironmentVariable($replaceRegistryHostName, $NpmReplaceRegistryHost, "Process")
	[Environment]::SetEnvironmentVariable($preferOnlineName, $NpmPreferOnline, "Process")
	$minReleaseAge = if ($ClearReleaseAge) { $null } else { [string]$ReleaseAgeDays }
	[Environment]::SetEnvironmentVariable($minReleaseAgeName, $minReleaseAge, "Process")
	[Environment]::SetEnvironmentVariable($beforeName, $null, "Process")
	try {
		& $Action
	}
	finally {
		[Environment]::SetEnvironmentVariable($registryName, $previousRegistry, "Process")
		[Environment]::SetEnvironmentVariable($replaceRegistryHostName, $previousReplaceRegistryHost, "Process")
		[Environment]::SetEnvironmentVariable($preferOnlineName, $previousPreferOnline, "Process")
		[Environment]::SetEnvironmentVariable($minReleaseAgeName, $previousMinReleaseAge, "Process")
		[Environment]::SetEnvironmentVariable($beforeName, $previousBefore, "Process")
	}
}

function Invoke-WithNpmResolutionEnvironment {
	param(
		[Parameter(Mandatory = $true)]
		[scriptblock]$Action
	)

	Invoke-WithNpmEnvironment -Action $Action
}

function Invoke-WithRootLockNpmResolutionEnvironment {
	param(
		[Parameter(Mandatory = $true)]
		[scriptblock]$Action
	)

	Invoke-WithNpmEnvironment -Action $Action -ClearReleaseAge
}

function Get-NormalizedPath {
	param(
		[Parameter(Mandatory = $true)]
		[string]$Path
	)

	return [System.IO.Path]::GetFullPath($Path).TrimEnd("\")
}

function Get-LinkTargetPath {
	param(
		[Parameter(Mandatory = $true)]
		[System.IO.FileSystemInfo]$Item
	)

	$rawTarget = @($Item.Target)[0]
	if ([string]::IsNullOrWhiteSpace($rawTarget)) {
		return $null
	}

	if ([System.IO.Path]::IsPathRooted($rawTarget)) {
		return Get-NormalizedPath $rawTarget
	}

	return Get-NormalizedPath (Join-Path (Split-Path $Item.FullName -Parent) $rawTarget)
}

function Ensure-DirectoryJunction {
	param(
		[Parameter(Mandatory = $true)]
		[string]$Source,

		[Parameter(Mandatory = $true)]
		[string]$Target
	)

	$sourcePath = Get-NormalizedPath $Source
	$existing = Get-Item -LiteralPath $Target -Force -ErrorAction SilentlyContinue
	if ($null -eq $existing) {
		New-Item -ItemType Junction -Path $Target -Target $sourcePath | Out-Null
		Write-Host "-> $(Split-Path $Target -Leaf)"
		return
	}

	if ($existing.LinkType -notin @("Junction", "SymbolicLink")) {
		throw "Refusing to replace real directory '$Target'."
	}

	$currentTarget = Get-LinkTargetPath $existing
	if (-not [string]::Equals($currentTarget, $sourcePath, [System.StringComparison]::OrdinalIgnoreCase)) {
		throw "Refusing to replace '$Target'; it points to '$currentTarget', not '$sourcePath'."
	}

	Write-Host "= $(Split-Path $Target -Leaf) (already linked)"
}

function Test-CommandVersion {
	param(
		[Parameter(Mandatory = $true)]
		[string]$Name
	)

	$command = Resolve-OptionalCommandPath @("$Name.cmd", "$Name.exe", $Name)
	if ($null -eq $command) {
		return $false
	}

	& $command "--version" *> $null
	return $LASTEXITCODE -eq 0
}

function Get-ManifestPackages {
	param(
		[Parameter(Mandatory = $true)]
		[string]$NodeCommand
	)

	$parser = @'
const fs = require("node:fs");
const YAML = require("yaml");
const manifest = YAML.parse(fs.readFileSync(process.argv[1], "utf8"));
process.stdout.write(JSON.stringify(manifest.packages ?? []));
'@

	$json = & $NodeCommand "-e" $parser $ManifestPath
	if ($LASTEXITCODE -ne 0) {
		throw "Failed to read package manifest '$ManifestPath'."
	}

	return @($json | ConvertFrom-Json)
}

function Ensure-LeanCtx {
	param(
		[Parameter(Mandatory = $true)]
		[string]$NpmCommand,

		[Parameter(Mandatory = $true)]
		[string]$NodeCommand
	)

	if (Test-CommandVersion "lean-ctx") {
		Write-Host "= lean-ctx (already installed)"
		return
	}

	Write-Host "Installing lean-ctx from the official prebuilt npm package..."
	$previousNoOnboard = [Environment]::GetEnvironmentVariable("LEAN_CTX_NO_ONBOARD", "Process")
	$env:LEAN_CTX_NO_ONBOARD = "1"
	try {
		Invoke-WithNpmResolutionEnvironment {
			Invoke-Native $NpmCommand @("install", "-g", "lean-ctx-bin")
		}

		if (-not (Test-CommandVersion "lean-ctx")) {
			$npmRoot = (& $NpmCommand "root" "-g" | Select-Object -Last 1).Trim()
			if ($LASTEXITCODE -ne 0) {
				throw "Could not resolve the global npm package directory."
			}

			$packageRoot = Join-Path $npmRoot "lean-ctx-bin"
			$postInstall = Join-Path $packageRoot "postinstall.js"
			if (-not (Test-Path -LiteralPath $postInstall)) {
				throw "lean-ctx-bin installed without a usable binary or postinstall script."
			}

			Write-Host "Running lean-ctx-bin's explicit binary installer..."
			Push-Location $packageRoot
			try {
				Invoke-Native $NodeCommand @($postInstall)
			}
			finally {
				Pop-Location
			}
		}
	}
	finally {
		if ($null -eq $previousNoOnboard) {
			Remove-Item Env:LEAN_CTX_NO_ONBOARD -ErrorAction SilentlyContinue
		}
		else {
			$env:LEAN_CTX_NO_ONBOARD = $previousNoOnboard
		}
	}

	if (-not (Test-CommandVersion "lean-ctx")) {
		throw "lean-ctx was installed but is not runnable from PATH."
	}
}

function Install-ManifestPackages {
	param(
		[Parameter(Mandatory = $true)]
		[object[]]$Packages,

		[Parameter(Mandatory = $true)]
		[string]$PiCommand,

		[Parameter(Mandatory = $true)]
		[string]$NpmCommand,

		[Parameter(Mandatory = $true)]
		[string]$NodeCommand
	)

	$failed = @()
	foreach ($package in $Packages) {
		$source = [string]$package.source
		if (-not [bool]$package.enabled) {
			Write-Host "Removing disabled package $source..."
			Invoke-Native $PiCommand @("remove", $source) -AllowFailure
			continue
		}

		$requiresProperty = $package.PSObject.Properties["requires"]
		if ($null -ne $requiresProperty) {
			$requires = $requiresProperty.Value
			$requiredBin = [string]$requires.bin
			if (-not (Test-CommandVersion $requiredBin)) {
				if ($requiredBin -eq "lean-ctx") {
					Ensure-LeanCtx $NpmCommand $NodeCommand
				}
				else {
					throw "Package '$source' requires missing '$requiredBin'. Its manifest installer is not Windows-compatible: $($requires.install)"
				}
			}
		}

		Write-Host "Installing $source..."
		try {
			Invoke-WithNpmResolutionEnvironment {
				Invoke-Native $PiCommand @("install", $source)
			}
		}
		catch {
			Write-Warning $_
			$failed += $source
		}
	}

	if ($failed.Count -gt 0) {
		throw "Failed to install $($failed.Count) package(s): $($failed -join ", ")"
	}
}

function Assert-InstalledState {
	param(
		[Parameter(Mandatory = $true)]
		[object[]]$Packages,

		[Parameter(Mandatory = $true)]
		[string]$PiCommand
	)

	Write-Host "Pi:"
	Invoke-Native $PiCommand @("--version")

	$pijCommand = Resolve-CommandPath @("pij.cmd", "pij.exe", "pij")
	& $pijCommand "--help" *> $null
	if ($LASTEXITCODE -ne 0) {
		throw "The globally linked pij CLI is not runnable."
	}
	Write-Host "pij CLI: ok"

	Write-Host ""
	Write-Host "Local extensions:"
	foreach ($source in Get-ChildItem -LiteralPath $ExtensionSourceRoot -Directory | Sort-Object Name) {
		$target = Join-Path $ExtensionTargetRoot $source.Name
		$item = Get-Item -LiteralPath $target -Force -ErrorAction SilentlyContinue
		if ($null -eq $item -or $item.LinkType -notin @("Junction", "SymbolicLink")) {
			throw "Extension '$($source.Name)' is not linked at '$target'."
		}

		$currentTarget = Get-LinkTargetPath $item
		$expectedTarget = Get-NormalizedPath $source.FullName
		if (-not [string]::Equals($currentTarget, $expectedTarget, [System.StringComparison]::OrdinalIgnoreCase)) {
			throw "Extension '$($source.Name)' points to '$currentTarget', not '$expectedTarget'."
		}

		Write-Host "  - $($source.Name)"
	}

	$settingsPath = Join-Path $AgentRoot "settings.json"
	if (-not (Test-Path -LiteralPath $settingsPath)) {
		throw "Pi settings were not created at '$settingsPath'."
	}

	$settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
	$packagesProperty = $settings.PSObject.Properties["packages"]
	if ($null -eq $packagesProperty) {
		throw "Pi settings at '$settingsPath' have no packages list."
	}
	$actualPackages = @($packagesProperty.Value | ForEach-Object { [string]$_ })
	$expectedPackages = @(
		$Packages |
			Where-Object { [bool]$_.enabled } |
			ForEach-Object { [string]$_.source }
	)
	$missingPackages = @($expectedPackages | Where-Object { $actualPackages -notcontains $_ })
	if ($missingPackages.Count -gt 0) {
		throw "Pi settings are missing package(s): $($missingPackages -join ", ")"
	}

	Write-Host ""
	Write-Host "Manifest packages:"
	foreach ($source in $expectedPackages) {
		Write-Host "  - $source"
	}

	$modelsPath = Join-Path $AgentRoot "models.json"
	if (-not (Test-Path -LiteralPath $modelsPath)) {
		throw "Pi model registry was not synchronized to '$modelsPath'."
	}

	$models = Get-Content -LiteralPath $modelsPath -Raw | ConvertFrom-Json
	$providersProperty = $models.PSObject.Properties["providers"]
	if ($null -eq $providersProperty) {
		throw "Pi model registry at '$modelsPath' has no providers object."
	}
	foreach ($provider in @("github-copilot", "sakana", "openrouter")) {
		if ($null -eq $providersProperty.Value.PSObject.Properties[$provider]) {
			throw "Pi model registry is missing managed provider '$provider'."
		}
	}
	Write-Host ""
	Write-Host "Managed model providers: github-copilot, sakana, openrouter"

	$mcpPath = Join-Path $AgentRoot "mcp.json"
	if (-not (Test-Path -LiteralPath $mcpPath)) {
		throw "Pi MCP configuration was not copied to '$mcpPath'."
	}

	$mcp = Get-Content -LiteralPath $mcpPath -Raw | ConvertFrom-Json
	Write-Host ""
	Write-Host "MCP servers:"
	$mcpServersProperty = $mcp.PSObject.Properties["mcpServers"]
	if ($null -eq $mcpServersProperty) {
		Write-Host "  (none)"
	}
	else {
		foreach ($server in $mcpServersProperty.Value.PSObject.Properties) {
			Write-Host "  - $($server.Name)"
		}
	}
}

if ([Environment]::OSVersion.Platform -ne [System.PlatformID]::Win32NT) {
	throw "install-windows.ps1 can only run on Windows."
}

Set-Location $RepoRoot
$Npm = Resolve-CommandPath @("npm.cmd", "npm")
$Node = Resolve-CommandPath @("node.exe", "node")
$Tsx = Join-Path $RepoRoot "node_modules\.bin\tsx.cmd"

if ($StartAt -le 1) {
	Write-Stage "1/6 npm dependencies"
	Invoke-WithRootLockNpmResolutionEnvironment {
		Invoke-Native $Npm @("ci", "--min-release-age=null")
	}
}

if ($StartAt -le 2) {
	Write-Stage "2/6 install/update official Pi binary"
	Invoke-WithNpmResolutionEnvironment {
		Invoke-Native $Npm @("install", "-g", "--ignore-scripts", "@earendil-works/pi-coding-agent@latest")
	}
}
$Pi = Resolve-CommandPath @("pi.cmd", "pi.exe", "pi")

if ($StartAt -le 3) {
	Write-Stage "3/6 sync global Pi preferences"
	New-Item -ItemType Directory -Path $AgentRoot -Force | Out-Null
	Copy-Item -LiteralPath (Join-Path $RepoRoot ".pi\APPEND_SYSTEM.md") -Destination $AgentRoot -Force
	Copy-Item -LiteralPath (Join-Path $RepoRoot ".pi\mcp.json") -Destination $AgentRoot -Force
	Write-Host "-> $AgentRoot\APPEND_SYSTEM.md"
	Write-Host "-> $AgentRoot\mcp.json"
	if (-not (Test-Path -LiteralPath $Tsx)) {
		throw "Locked tsx executable is missing at '$Tsx'. Run the dependency stage first."
	}
	Invoke-Native $Tsx @("harness/scripts/sync-models.ts")
}

if ($StartAt -le 4) {
	Write-Stage "4/6 link pij extensions globally"
	New-Item -ItemType Directory -Path $ExtensionTargetRoot -Force | Out-Null
	foreach ($source in Get-ChildItem -LiteralPath $ExtensionSourceRoot -Directory | Sort-Object Name) {
		Ensure-DirectoryJunction $source.FullName (Join-Path $ExtensionTargetRoot $source.Name)
	}
	Write-Host "Linking the pij CLI onto PATH..."
	Invoke-Native $Npm @("link")
}

$packages = Get-ManifestPackages $Node
if ($StartAt -le 5) {
	Write-Stage "5/6 install and update manifest packages"
	Invoke-Native $Npm @("run", "pkg", "--", "sync")
	Install-ManifestPackages $packages $Pi $Npm $Node
	Invoke-WithNpmResolutionEnvironment {
		Invoke-Native $Pi @("update", "--extensions")
	}
}

Write-Stage "6/6 verify installed state"
Assert-InstalledState $packages $Pi

Write-Host ""
Write-Host "[ok] Windows install complete. Pi and all pij-managed plugins are ready."
