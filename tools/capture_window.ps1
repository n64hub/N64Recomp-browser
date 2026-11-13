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
#   <s> size <w> <h>          the window's client area resized to w x h pixels, where it is: an aspect ratio of the
#                             desktop's own (16:9, 21:9) for a game whose window opens at another
#   <s> drag <ms>             the window's thread held in Windows' move loop for ms, as a drag by the title bar holds
#                             it, without the mouse: item 6b's check, with -Env SDL_AUDIODRIVER=disk,SDL_DISKAUDIOFILE=<f>
#                             recording what the game played, a gap a run of zeros (docs/new-recomp.md)
#   <s> until <addr> <mask> <value> <timeout s> [key]
#                             waits until the game's 32-bit word at RDRAM address addr (0x800DCE44), anded with mask,
#                             is value, pressing key every 1.5 s meanwhile if one is given, as a page plan's pressUntil
#                             does; the plan's later times move on by however long it waited. Unmet by timeout, the
#                             run ends there as failed (exit 1)
#   <s> poke <addr> <value>   writes the 32-bit word value at addr, and
#   <s> or <addr> <bits>      ors bits into it: a cheat that reaches a later level, the way a page plan's n64w does
#   <s> end
# A capture takes 40-110 ms (a 1600x1200 window, a busy host the slower), so a flicker of one 60 Hz frame is caught
# now and then and one of several frames most times. A burst's and a record's captures are kept in memory until the
# end, scaled by -Scale (1): 0.5 keeps a minute of them in about 3 GB.
# A key a game reads through SDL comes from the window's messages, so keys reach it with its window behind others.
# RDRAM is read and written from outside, in the process this started: N64ModernRuntime commits it as one 512 MB region,
# the start of its allocation, with 0x80000000 at its first byte and each 32-bit word in the host's order.
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
# A process that never started would leave the plan capturing nothing until its end.
if (-not (Test-Path -LiteralPath $Exe -PathType Leaf)) { throw "no such exe: $Exe" }
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
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int h2, uint flags);
    [DllImport("kernel32.dll")] public static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
    [DllImport("kernel32.dll")] public static extern bool ReadProcessMemory(IntPtr p, IntPtr a, byte[] b, IntPtr n, out IntPtr done);
    [DllImport("kernel32.dll")] public static extern bool WriteProcessMemory(IntPtr p, IntPtr a, byte[] b, IntPtr n, out IntPtr done);
    [DllImport("kernel32.dll")] public static extern IntPtr VirtualQueryEx(IntPtr p, IntPtr a, out MBI m, IntPtr n);
    [StructLayout(LayoutKind.Sequential)] public struct MBI {
        public IntPtr BaseAddress, AllocationBase; public uint AllocationProtect; public ushort PartitionId;
        public IntPtr RegionSize; public uint State, Protect, Type;
    }
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

    // The runtime's RDRAM in process p (opened with VM_READ, VM_WRITE, VM_OPERATION, QUERY_INFORMATION), or zero while
    // it has none yet: the committed read-write 512 MB at the start of its own allocation.
    public static IntPtr Rdram(IntPtr p) {
        long a = 0; MBI m;
        while (VirtualQueryEx(p, (IntPtr)a, out m, (IntPtr)Marshal.SizeOf(typeof(MBI))) != IntPtr.Zero) {
            if (m.State == 0x1000 && m.Protect == 0x04 && m.BaseAddress == m.AllocationBase && (long)m.RegionSize == 512L << 20)
                return m.BaseAddress;
            a = (long)m.BaseAddress + (long)m.RegionSize;
        }
        return IntPtr.Zero;
    }
    public static uint Read(IntPtr p, IntPtr rdram, uint addr) {
        var b = new byte[4]; IntPtr n;
        if (!ReadProcessMemory(p, rdram + (int)(addr - 0x80000000u), b, (IntPtr)4, out n)) throw new Exception("can't read RDRAM");
        return BitConverter.ToUInt32(b, 0);
    }
    public static void Write(IntPtr p, IntPtr rdram, uint addr, uint v) {
        IntPtr n;
        if (!WriteProcessMemory(p, rdram + (int)(addr - 0x80000000u), BitConverter.GetBytes(v), (IntPtr)4, out n))
            throw new Exception("can't write RDRAM");
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

# A number in a plan: decimal, or hex with 0x.
function Num($s) { if ($s -match '^0x') { [Convert]::ToUInt32($s.Substring(2), 16) } else { [uint32]$s } }
$script:rdram = [IntPtr]::Zero
$script:handle = [CaptureWindow]::OpenProcess(0x438, $false, [uint32]$proc.Id)
function Rdram {
    if ($script:rdram -eq [IntPtr]::Zero) { $script:rdram = [CaptureWindow]::Rdram($script:handle) }
    if ($script:rdram -eq [IntPtr]::Zero) { throw "no RDRAM in pid $($proc.Id)" }
    $script:rdram
}

$recording = $null; $recorded = 0; $shift = 0.0; $failed = $false
try {
    foreach ($line in Get-Content $Plan) {
        if ($line -match '^\s*(#|$)') { continue }
        $p = $line.Trim() -split '\s+'
        while ($clock.Elapsed.TotalSeconds -lt [double]$p[0] + $shift -and -not $proc.HasExited) {
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
            'size' { $c = New-Object CaptureWindow+RECT; $wr = New-Object CaptureWindow+RECT
                [void][CaptureWindow]::GetClientRect($hwnd, [ref]$c); [void][CaptureWindow]::GetWindowRect($hwnd, [ref]$wr)
                # The border and title bar stay as they are: the window grows by what the client area has to.
                $w = [int]$p[2] + ($wr.R - $wr.L) - ($c.R - $c.L); $h = [int]$p[3] + ($wr.B - $wr.T) - ($c.B - $c.T)
                # SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE
                [void][CaptureWindow]::SetWindowPos($hwnd, [IntPtr]::Zero, 0, 0, $w, $h, 0x16)
                Write-Output ("{0,6:N1}s size {1}x{2}" -f $clock.Elapsed.TotalSeconds, $p[2], $p[3]) }
            'drag' { # WM_SYSCOMMAND SC_MOVE: the window's thread runs Windows' move loop, as in a drag by its title bar,
                # held ms, then Escape ends it where it began.
                [void][CaptureWindow]::PostMessage($hwnd, 0x112, [IntPtr]0xF010, [IntPtr]0)
                Start-Sleep -Milliseconds ([int]$p[2])
                Send-Key $hwnd 'Escape' 120
                Write-Output ("{0,6:N1}s drag {1} ms" -f $clock.Elapsed.TotalSeconds, $p[2]) }
            'until' { $addr = Num $p[2]; $mask = Num $p[3]; $want = Num $p[4]; $began = $clock.Elapsed.TotalSeconds
                $press = -10.0; $met = $false
                while (-not $proc.HasExited -and $clock.Elapsed.TotalSeconds - $began -lt [double]$p[5]) {
                    if (([CaptureWindow]::Read($handle, (Rdram), $addr) -band $mask) -eq $want) { $met = $true; break }
                    if ($p.Count -gt 6 -and $clock.Elapsed.TotalSeconds - $press -ge 1.5) {
                        $press = $clock.Elapsed.TotalSeconds; Send-Key $hwnd $p[6] 120 }
                    if ($recording) { Capture $hwnd ($recording + '-' + $recorded.ToString('0000')); $recorded++ }
                    else { Start-Sleep -Milliseconds 20 }
                }
                $shift += $clock.Elapsed.TotalSeconds - $began
                Write-Output ("{0,6:N1}s until {1} {2} after {3:N1}s" -f $clock.Elapsed.TotalSeconds, $p[2],
                    $(if ($met) { 'met' } else { 'NOT met' }), ($clock.Elapsed.TotalSeconds - $began))
                if (-not $met) { $failed = $true; break } }
            'poke' { [CaptureWindow]::Write($handle, (Rdram), (Num $p[2]), (Num $p[3]))
                Write-Output ("{0,6:N1}s poke {1} {2}" -f $clock.Elapsed.TotalSeconds, $p[2], $p[3]) }
            'or' { $addr = Num $p[2]; [CaptureWindow]::Write($handle, (Rdram), $addr, ([CaptureWindow]::Read($handle, (Rdram), $addr) -bor (Num $p[3])))
                Write-Output ("{0,6:N1}s or {1} {2}" -f $clock.Elapsed.TotalSeconds, $p[2], $p[3]) }
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
if ($failed) { exit 1 }
