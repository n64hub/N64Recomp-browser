# Plays a recomp's desktop build by a timed plan of keys and captures its own window, for a flicker that a page's
# compositor screenshots or a person's eye catch but a frame rate doesn't: a frame drawn in parts, a frame matched
# wrongly against the one before, an old picture shown again.
#
#   pwsh -File tools/capture_window.ps1 -Exe <exe> -WorkDir <dir> -Plan <plan.txt> -OutDir <dir>
#        [-ExeArgs <args>] [-Env RT64_FRAME_LOG=1,...] [-Flag 2]
#
# It starts the exe in -WorkDir (its stdout and stderr go to stdout.log and stderr.log in -OutDir), finds the window
# of the process it started and plays the plan, then stops that process by its PID. Only that window is captured,
# with PrintWindow, never the screen: PrintWindow renders the window itself, whatever lies over it. -Flag 2
# (PW_RENDERFULLCONTENT) is the one that captures RT64's Vulkan swap chain; 3 returns black game frames on some
# drivers.
#
# Plan lines, each at seconds since the exe started:
#   <s> key <name> [ms]       press and release a key in the window (a letter, a digit, Enter, Space, Shift, Escape,
#                             Tab, Up, Down, Left, Right), held ms (120)
#   <s> shot <name>           one capture, <name>.png
#   <s> burst <name> <count>  count captures back to back, <name>-00.png on; about 9 a second for a 1280x960 window,
#                             so a flicker of one 60 Hz frame is caught now and then, one of several frames most times
#   <s> end
# A key a game reads through SDL comes from the window's messages, so keys reach it with its window behind others.
#
# Every capture's time, in milliseconds since 1970, is written to captures.tsv, the clock RT64_FRAME_LOG's game frames
# are printed with (tools/frame_log.mjs puts the two together). At the end each burst is checked for frames unlike both
# of their neighbours: the mean difference of a 160x90 grey copy of the frame to each neighbour, against the
# neighbours' to each other. Those are printed and written to flicker.txt, as "<burst>-<n> <to before>/<to after> vs
# <before to after>"; a steady pan reads as no flicker, a frame unlike both of its neighbours does.
param(
    [Parameter(Mandatory)][string]$Exe, [Parameter(Mandatory)][string]$WorkDir, [Parameter(Mandatory)][string]$Plan,
    [Parameter(Mandatory)][string]$OutDir, [string]$ExeArgs = '', [string[]]$Env = @(), [int]$Flag = 2
)
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class CaptureWindow {
    public delegate bool EnumProc(IntPtr h, IntPtr l);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] public static extern uint MapVirtualKey(uint code, uint mapType);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }

    // The largest visible window of the process pid, or zero.
    public static IntPtr Of(uint pid) {
        IntPtr best = IntPtr.Zero; int area = 0;
        EnumWindows(delegate(IntPtr h, IntPtr l) {
            uint owner; GetWindowThreadProcessId(h, out owner);
            if (owner != pid || !IsWindowVisible(h)) return true;
            RECT r; GetClientRect(h, out r);
            int a = (r.R - r.L) * (r.B - r.T);
            if (a > area) { area = a; best = h; }
            return true;
        }, IntPtr.Zero);
        return best;
    }
}
"@
[void][CaptureWindow]::SetProcessDPIAware()
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$OutDir = (Resolve-Path $OutDir).Path

$named = @{ Enter = 0x0D; Space = 0x20; Shift = 0x10; Escape = 0x1B; Tab = 0x09; Left = 0x25; Up = 0x26; Right = 0x27;
    Down = 0x28 }
$extended = @(0x25, 0x26, 0x27, 0x28)

function Send-Key($hwnd, $name, $ms) {
    if ($named.ContainsKey($name)) { $vk = $named[$name] }
    elseif ($name -match '^[A-Za-z0-9]$') { $vk = [int][char]$name.ToUpper() }
    else { throw "unknown key $name" }
    $l = 1 -bor ([int][CaptureWindow]::MapVirtualKey($vk, 0) -shl 16)
    if ($extended -contains $vk) { $l = $l -bor (1 -shl 24) }
    [void][CaptureWindow]::PostMessage($hwnd, 0x100, [IntPtr]$vk, [IntPtr]$l)
    Start-Sleep -Milliseconds $ms
    [void][CaptureWindow]::PostMessage($hwnd, 0x101, [IntPtr]$vk, [IntPtr]([long]$l -bor 0xC0000000L))
}

# Captures the window into a bitmap, kept in memory until the end so a burst isn't slowed by saving.
$script:captures = New-Object System.Collections.ArrayList
function Capture($hwnd, $name) {
    $r = New-Object CaptureWindow+RECT
    [void][CaptureWindow]::GetClientRect($hwnd, [ref]$r)
    $w = $r.R - $r.L; $h = $r.B - $r.T
    if ($w -le 0 -or $h -le 0) { Write-Output "${name}: the window has no client area"; return }
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $hdc = $g.GetHdc()
    [void][CaptureWindow]::PrintWindow($hwnd, $hdc, [uint32]$Flag)
    $g.ReleaseHdc($hdc); $g.Dispose()
    [void]$script:captures.Add(@($name, $bmp, [DateTimeOffset]::Now.ToUnixTimeMilliseconds(), $script:clock.Elapsed.TotalSeconds))
}

# A 160x90 grey copy of a capture, as floats.
function Small($bmp) {
    $s = New-Object System.Drawing.Bitmap 160, 90
    $g = [System.Drawing.Graphics]::FromImage($s)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBilinear
    $g.DrawImage($bmp, 0, 0, 160, 90); $g.Dispose()
    $v = New-Object 'float[]' (160 * 90)
    for ($y = 0; $y -lt 90; $y++) { for ($x = 0; $x -lt 160; $x++) {
        $c = $s.GetPixel($x, $y); $v[$y * 160 + $x] = 0.299 * $c.R + 0.587 * $c.G + 0.114 * $c.B } }
    $s.Dispose()
    return ,$v
}
function Diff($a, $b) { $t = 0.0; for ($i = 0; $i -lt $a.Length; $i++) { $t += [Math]::Abs($a[$i] - $b[$i]) }; $t / $a.Length }

$psi = New-Object System.Diagnostics.ProcessStartInfo $Exe
$psi.Arguments = $ExeArgs
$psi.WorkingDirectory = $WorkDir
$psi.UseShellExecute = $false
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
foreach ($e in $Env) { $k, $v = $e -split '=', 2; $psi.EnvironmentVariables[$k] = $v }
$proc = New-Object System.Diagnostics.Process
$proc.StartInfo = $psi
$outEvent = Register-ObjectEvent -InputObject $proc -EventName OutputDataReceived -MessageData (Join-Path $OutDir 'stdout.log') -Action {
    Add-Content -Path $Event.MessageData -Value $EventArgs.Data }
$errEvent = Register-ObjectEvent -InputObject $proc -EventName ErrorDataReceived -MessageData (Join-Path $OutDir 'stderr.log') -Action {
    Add-Content -Path $Event.MessageData -Value $EventArgs.Data }
[void]$proc.Start()
$proc.BeginOutputReadLine(); $proc.BeginErrorReadLine()
$script:clock = [System.Diagnostics.Stopwatch]::StartNew()
Set-Content -Path (Join-Path $OutDir 'pid.txt') -Value $proc.Id
Write-Output "started pid $($proc.Id)"

$hwnd = [IntPtr]::Zero
while ($hwnd -eq [IntPtr]::Zero -and $clock.Elapsed.TotalSeconds -lt 60 -and -not $proc.HasExited) {
    Start-Sleep -Milliseconds 250; $hwnd = [CaptureWindow]::Of([uint32]$proc.Id)
}
Write-Output ("window after {0:N1}s" -f $clock.Elapsed.TotalSeconds)

try {
    foreach ($line in Get-Content $Plan) {
        if ($line -match '^\s*(#|$)') { continue }
        $p = $line.Trim() -split '\s+'
        while ($clock.Elapsed.TotalSeconds -lt [double]$p[0] -and -not $proc.HasExited) { Start-Sleep -Milliseconds 20 }
        if ($proc.HasExited) { Write-Output ("exited with {0} at {1:N1}s" -f $proc.ExitCode, $clock.Elapsed.TotalSeconds); break }
        $hwnd = [CaptureWindow]::Of([uint32]$proc.Id)
        switch ($p[1]) {
            'key' { $ms = 120; if ($p.Count -gt 3) { $ms = [int]$p[3] }; Send-Key $hwnd $p[2] $ms
                Write-Output ("{0,6:N1}s key {1}" -f $clock.Elapsed.TotalSeconds, $p[2]) }
            'shot' { Capture $hwnd $p[2]; Write-Output ("{0,6:N1}s shot {1}" -f $clock.Elapsed.TotalSeconds, $p[2]) }
            'burst' { for ($i = 0; $i -lt [int]$p[3]; $i++) { Capture $hwnd ($p[2] + '-' + $i.ToString('00')) }
                Write-Output ("{0,6:N1}s burst {1}" -f $clock.Elapsed.TotalSeconds, $p[2]) }
            'end' { break }
            default { throw "unknown plan step: $line" }
        }
    }
} finally {
    if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force; Write-Output "stopped pid $($proc.Id)" }
    Start-Sleep -Milliseconds 500
    Unregister-Event -SourceIdentifier $outEvent.Name; Unregister-Event -SourceIdentifier $errEvent.Name
}

$tsv = foreach ($c in $script:captures) {
    $c[1].Save((Join-Path $OutDir "$($c[0]).png"), [System.Drawing.Imaging.ImageFormat]::Png)
    "{0}`t{1}`t{2:N3}" -f $c[0], $c[2], $c[3]
}
Set-Content -Path (Join-Path $OutDir 'captures.tsv') -Value $tsv

$flicker = @()
$series = $script:captures | Where-Object { $_[0] -match '-\d\d$' } | Group-Object { $_[0] -replace '-\d\d$', '' }
foreach ($s in $series) {
    $small = @($s.Group | ForEach-Object { ,(Small $_[1]) })
    for ($i = 1; $i -lt $small.Count - 1; $i++) {
        $before = Diff $small[$i] $small[$i - 1]; $after = Diff $small[$i] $small[$i + 1]
        $apart = Diff $small[$i - 1] $small[$i + 1]
        if ([Math]::Min($before, $after) -gt 1.5 * $apart + 0.7) {
            $flicker += "{0} {1:N1}/{2:N1} vs {3:N1}" -f $s.Group[$i][0], $before, $after, $apart
        }
    }
}
foreach ($c in $script:captures) { $c[1].Dispose() }
Set-Content -Path (Join-Path $OutDir 'flicker.txt') -Value $flicker
Write-Output "$($script:captures.Count) captures; frames unlike both neighbours: $($flicker.Count)"
$flicker | ForEach-Object { Write-Output "  $_" }
