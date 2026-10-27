# Plays a recomp's desktop build by a timed plan of keys and captures its own window, for a flicker that a page's
# compositor screenshots or a person's eye catch but a frame rate doesn't: a frame drawn in parts, a frame matched
# wrongly against the one before, an old picture shown again.
#
#   pwsh -File tools/capture_window.ps1 -Exe <exe> -WorkDir <dir> -Plan <plan.txt> -OutDir <dir>
#        [-ExeArgs <args>] [-Env RT64_FRAME_LOG=1,...] [-Scale 0.5] [-Flag 2]
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
#   <s> burst <name> <count>  count captures back to back, <name>-0000.png on, the plan waiting meanwhile
#   <s> record <name>         captures back to back from here, <name>-0000.png on, while the plan's keys go on, until
#   <s> stop                  this: for a moment whose time varies from run to run
#   <s> end
# A capture takes 40-110 ms (a 1600x1200 window, a busy host the slower), so a flicker of one 60 Hz frame is caught
# now and then and one of several frames most times. A burst's and a record's captures are kept in memory until the
# end, scaled by -Scale (1): 0.5 keeps a minute of them in about 3 GB.
# A key a game reads through SDL comes from the window's messages, so keys reach it with its window behind others.
#
# Every capture's time, in milliseconds since 1970, is written to captures.tsv, the clock RT64_FRAME_LOG's game frames
# are printed with (tools/frame_log.mjs puts the two together). At the end each series is checked for frames unlike both
# of their neighbours: the mean difference of a 160x90 grey copy of the frame to each neighbour, against the
# neighbours' to each other. Those are printed and written to flicker.txt, as "<series>-<n> <to before>/<to after> vs
# <before to after>"; a steady pan reads as no flicker, a frame unlike both of its neighbours does.
param(
    [Parameter(Mandatory)][string]$Exe, [Parameter(Mandatory)][string]$WorkDir, [Parameter(Mandatory)][string]$Plan,
    [Parameter(Mandatory)][string]$OutDir, [string]$ExeArgs = '', [string[]]$Env = @(), [double]$Scale = 1,
    [int]$Flag = 2
)
Add-Type -AssemblyName System.Drawing
# The C# below uses System.Drawing, which PowerShell 7 spreads over several assemblies: a bitmap made first loads them.
[System.Drawing.Bitmap]::new(1, 1).Dispose()
$drawing = [AppDomain]::CurrentDomain.GetAssemblies() | Where-Object {
    $_.GetName().Name -match '^System\.(Drawing|Private\.Windows)' -and $_.Location } | ForEach-Object { $_.Location }
Add-Type -ReferencedAssemblies $drawing -TypeDefinition @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
public static class CaptureWindow {
    public delegate bool EnumProc(IntPtr h, IntPtr l);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref POINT p);
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] public static extern uint MapVirtualKey(uint code, uint mapType);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }

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

    // A 160x90 grey copy of a capture.
    public static float[] Small(Bitmap bmp) {
        using (var s = new Bitmap(160, 90, PixelFormat.Format32bppArgb)) {
            using (var g = Graphics.FromImage(s)) {
                g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBilinear;
                g.DrawImage(bmp, 0, 0, 160, 90);
            }

            var data = s.LockBits(new Rectangle(0, 0, 160, 90), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            var bytes = new byte[data.Stride * 90];
            Marshal.Copy(data.Scan0, bytes, 0, bytes.Length);
            s.UnlockBits(data);
            var v = new float[160 * 90];
            for (int y = 0; y < 90; y++) {
                for (int x = 0; x < 160; x++) {
                    int i = y * data.Stride + x * 4;
                    v[y * 160 + x] = 0.114f * bytes[i] + 0.587f * bytes[i + 1] + 0.299f * bytes[i + 2];
                }
            }

            return v;
        }
    }

    // The mean absolute difference of two grey copies.
    public static double Diff(float[] a, float[] b) {
        double t = 0;
        for (int i = 0; i < a.Length; i++) t += Math.Abs(a[i] - b[i]);
        return t / a.Length;
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

# Captures the window's client area (the game's picture, without the title bar and frame PrintWindow draws too). A
# shot is saved at once; a series' captures (a burst's, a record's) are kept in memory, scaled, until the end so they
# aren't slowed by saving.
$script:captures = New-Object System.Collections.ArrayList
function Capture($hwnd, $name) {
    $c = New-Object CaptureWindow+RECT; $wr = New-Object CaptureWindow+RECT; $o = New-Object CaptureWindow+POINT
    [void][CaptureWindow]::GetClientRect($hwnd, [ref]$c)
    [void][CaptureWindow]::GetWindowRect($hwnd, [ref]$wr)
    [void][CaptureWindow]::ClientToScreen($hwnd, [ref]$o)
    $w = $c.R - $c.L; $h = $c.B - $c.T
    if ($w -le 0 -or $h -le 0) { Write-Output "${name}: the window has no client area"; return }
    $window = New-Object System.Drawing.Bitmap ($wr.R - $wr.L), ($wr.B - $wr.T)
    $g = [System.Drawing.Graphics]::FromImage($window)
    $hdc = $g.GetHdc()
    [void][CaptureWindow]::PrintWindow($hwnd, $hdc, [uint32]$Flag)
    $g.ReleaseHdc($hdc); $g.Dispose()
    $series = $name -match '-\d{4}$'
    $sw = $w; $sh = $h
    if ($series) { $sw = [int]($w * $Scale); $sh = [int]($h * $Scale) }
    $bmp = New-Object System.Drawing.Bitmap $sw, $sh
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.DrawImage($window, (New-Object System.Drawing.Rectangle 0, 0, $sw, $sh), ($o.X - $wr.L), ($o.Y - $wr.T), $w, $h,
        [System.Drawing.GraphicsUnit]::Pixel)
    $g.Dispose(); $window.Dispose()
    $capture = @($name, $bmp, [DateTimeOffset]::Now.ToUnixTimeMilliseconds(), $script:clock.Elapsed.TotalSeconds)
    if (-not $series) { Save $capture }
    [void]$script:captures.Add($capture)
}

function Save($capture) {
    if ($capture[1] -eq $null) { return }
    $capture[1].Save((Join-Path $OutDir "$($capture[0]).png"), [System.Drawing.Imaging.ImageFormat]::Png)
    Add-Content -Path (Join-Path $OutDir 'captures.tsv') -Value ("{0}`t{1}`t{2:N3}" -f $capture[0], $capture[2], $capture[3])
    if ($capture[0] -notmatch '-\d{4}$') { $capture[1].Dispose(); $capture[1] = $null }
}

$psi = New-Object System.Diagnostics.ProcessStartInfo $Exe
$psi.Arguments = $ExeArgs
$psi.WorkingDirectory = $WorkDir
$psi.UseShellExecute = $false
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
# pwsh -File passes a list as one string, so each is split at its commas too.
foreach ($e in ($Env | ForEach-Object { $_ -split ',' })) { $k, $v = $e -split '=', 2; $psi.EnvironmentVariables[$k] = $v }
$proc = New-Object System.Diagnostics.Process
$proc.StartInfo = $psi
[void]$proc.Start()
# Copied to the files as they come, off this thread: a game that logs every frame (RT64_FRAME_LOG) would stall on a
# full pipe otherwise.
$outFile = [System.IO.File]::Create((Join-Path $OutDir 'stdout.log'))
$errFile = [System.IO.File]::Create((Join-Path $OutDir 'stderr.log'))
$copies = @($proc.StandardOutput.BaseStream.CopyToAsync($outFile), $proc.StandardError.BaseStream.CopyToAsync($errFile))
$script:clock = [System.Diagnostics.Stopwatch]::StartNew()
Set-Content -Path (Join-Path $OutDir 'pid.txt') -Value $proc.Id
Write-Output "started pid $($proc.Id)"

$hwnd = [IntPtr]::Zero
while ($hwnd -eq [IntPtr]::Zero -and $clock.Elapsed.TotalSeconds -lt 60 -and -not $proc.HasExited) {
    Start-Sleep -Milliseconds 250; $hwnd = [CaptureWindow]::Of([uint32]$proc.Id)
}
Write-Output ("window after {0:N1}s" -f $clock.Elapsed.TotalSeconds)

$recording = $null; $recorded = 0
try {
    foreach ($line in Get-Content $Plan) {
        if ($line -match '^\s*(#|$)') { continue }
        $p = $line.Trim() -split '\s+'
        while ($clock.Elapsed.TotalSeconds -lt [double]$p[0] -and -not $proc.HasExited) {
            if ($recording) { Capture $hwnd ($recording + '-' + $recorded.ToString('0000')); $recorded++ }
            else { Start-Sleep -Milliseconds 20 }
        }
        if ($proc.HasExited) { Write-Output ("exited with {0} at {1:N1}s" -f $proc.ExitCode, $clock.Elapsed.TotalSeconds); break }
        $hwnd = [CaptureWindow]::Of([uint32]$proc.Id)
        switch ($p[1]) {
            'key' { $ms = 120; if ($p.Count -gt 3) { $ms = [int]$p[3] }; Send-Key $hwnd $p[2] $ms
                Write-Output ("{0,6:N1}s key {1}" -f $clock.Elapsed.TotalSeconds, $p[2]) }
            'shot' { Capture $hwnd $p[2]; Write-Output ("{0,6:N1}s shot {1}" -f $clock.Elapsed.TotalSeconds, $p[2]) }
            'burst' { for ($i = 0; $i -lt [int]$p[3]; $i++) { Capture $hwnd ($p[2] + '-' + $i.ToString('0000')) }
                Write-Output ("{0,6:N1}s burst {1}" -f $clock.Elapsed.TotalSeconds, $p[2]) }
            'record' { $recording = $p[2]; $recorded = 0; Write-Output ("{0,6:N1}s record {1}" -f $clock.Elapsed.TotalSeconds, $p[2]) }
            'stop' { Write-Output ("{0,6:N1}s stop {1} after {2} captures" -f $clock.Elapsed.TotalSeconds, $recording, $recorded)
                $recording = $null }
            'end' { break }
            default { throw "unknown plan step: $line" }
        }
    }
} finally {
    if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force; Write-Output "stopped pid $($proc.Id)" }
    [void][System.Threading.Tasks.Task]::WaitAll($copies, 5000)
    $outFile.Dispose(); $errFile.Dispose()
}

foreach ($c in $script:captures) { Save $c }

$flicker = @()
$series = $script:captures | Where-Object { $_[0] -match '-\d{4}$' } | Group-Object { $_[0] -replace '-\d{4}$', '' }
foreach ($s in $series) {
    $small = @($s.Group | ForEach-Object { ,[CaptureWindow]::Small($_[1]) })
    for ($i = 1; $i -lt $small.Count - 1; $i++) {
        $before = [CaptureWindow]::Diff($small[$i], $small[$i - 1]); $after = [CaptureWindow]::Diff($small[$i], $small[$i + 1])
        $apart = [CaptureWindow]::Diff($small[$i - 1], $small[$i + 1])
        if ([Math]::Min($before, $after) -gt 1.5 * $apart + 0.7) {
            $flicker += "{0} {1:N1}/{2:N1} vs {3:N1}" -f $s.Group[$i][0], $before, $after, $apart
        }
    }
}
foreach ($c in $script:captures) { if ($c[1] -ne $null) { $c[1].Dispose() } }
Set-Content -Path (Join-Path $OutDir 'flicker.txt') -Value $flicker
Write-Output "$($script:captures.Count) captures; frames unlike both neighbours: $($flicker.Count)"
$flicker | ForEach-Object { Write-Output "  $_" }
