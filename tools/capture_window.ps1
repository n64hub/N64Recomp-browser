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
# now and then and one of several frames most times. A burst's and a record's captures are scaled by -Scale (1).
# Every capture is written as it comes, off the plan's thread (CaptureWriter below), so the plan's thread only
# captures: a capture waits in memory only until it is saved, and a run ended early (a GPU turn's --max) leaves every
# capture saved so far, its captures.tsv line and its flicker.txt lines on disk. Writing costs the captures nothing
# measurable at 0.25 and takes some CPU at 1 from a large window, which on a busy host can slow them.
# A key a game reads through SDL comes from the window's messages, so keys reach it with its window behind others.
# RDRAM is read and written from outside, in the process this started: N64ModernRuntime commits it as one 512 MB region,
# the start of its allocation, with 0x80000000 at its first byte and each 32-bit word in the host's order.
#
# Every capture's time, in milliseconds since 1970, is written to captures.tsv, the clock RT64_FRAME_LOG's game frames
# are printed with (tools/frame_log.mjs puts the two together). Each series is checked as it is written for frames
# unlike both of their neighbours: the mean difference of a 160x90 grey copy of the frame to each neighbour, against
# the neighbours' to each other. Those are written to flicker.txt as they are found, and printed at the end, as
# "<series>-<n> <to before>/<to after> vs <before to after>"; a steady pan reads as no flicker, a frame unlike both of
# its neighbours does.
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
$drawing += 'System.Collections', 'System.Collections.Concurrent', 'System.IO.Compression', 'System.Threading',
    'System.Threading.Thread', 'System.Threading.Tasks'
Add-Type -ReferencedAssemblies $drawing -TypeDefinition @"
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.IO.Compression;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
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

    // The mean absolute difference of two grey copies.
    public static double Diff(float[] a, float[] b) {
        double t = 0;
        for (int i = 0; i < a.Length; i++) t += Math.Abs(a[i] - b[i]);
        return t / a.Length;
    }
}

// Writes the captures handed to it off the plan's thread: each one's PNG and grey copy on up to three threads of the
// pool at once (one can't keep up with a full-size 1600x1200 series, and the game recorded needs the other cores),
// then on a thread of its own, in order, its captures.tsv line and, for a series (a name ending -<4 digits>), the
// flicker check of the frame before it, which needs only the series' last two grey copies. Each line is flushed as it
// is written, so what is on disk holds if the run is ended. None of it touches GDI+: with PNGs saved by GDI+ beside
// it, the plan's captures took a sixth longer and now and then one stalled for 15-20 s, so a capture's pixels are
// copied out on the plan's thread and encoded here.
public sealed class CaptureWriter {
    sealed class Item {
        public string Name, Key; public byte[] Px; public int W, H, Stride; public long Ms; public double S;
        public Task<float[]> Work;
    }
    static readonly TaskScheduler encoders = new ConcurrentExclusiveSchedulerPair(TaskScheduler.Default, 3).ConcurrentScheduler;
    sealed class Series { public string Name; public float[] Before, Last; }
    readonly BlockingCollection<Item> queue = new BlockingCollection<Item>();
    readonly Dictionary<string, Series> series = new Dictionary<string, Series>();
    readonly string dir;
    readonly StreamWriter tsv, flicker;
    readonly Thread thread;
    public readonly List<string> Flicker = new List<string>();
    public readonly List<string> Errors = new List<string>();
    public int Written;

    public CaptureWriter(string dir) {
        this.dir = dir;
        tsv = new StreamWriter(Path.Combine(dir, "captures.tsv"), true) { AutoFlush = true };
        flicker = new StreamWriter(Path.Combine(dir, "flicker.txt"), false) { AutoFlush = true };
        thread = new Thread(Run) { IsBackground = true, Name = "capture writer" };
        thread.Start();
    }

    // Takes the capture's pixels (32 bpp BGRA) and disposes of the bitmap.
    public void Add(string name, Bitmap bmp, long ms, double s) {
        var data = bmp.LockBits(new Rectangle(0, 0, bmp.Width, bmp.Height), ImageLockMode.ReadOnly,
            PixelFormat.Format32bppArgb);
        var px = new byte[data.Stride * bmp.Height];
        Marshal.Copy(data.Scan0, px, 0, px.Length);
        bmp.UnlockBits(data);
        var c = new Item { Name = name, Px = px, W = bmp.Width, H = bmp.Height, Stride = data.Stride, Ms = ms, S = s };
        bmp.Dispose();
        int dash = name.Length - 5;
        if (dash >= 0 && name[dash] == '-' && IsDigits(name, dash + 1)) c.Key = name.Substring(0, dash);
        c.Work = Task.Factory.StartNew(() => {
            Png(Path.Combine(dir, c.Name + ".png"), c);
            var small = c.Key == null ? null : Small(c);
            c.Px = null;
            return small;
        }, CancellationToken.None, TaskCreationOptions.None, encoders);
        queue.Add(c);
    }

    public int Pending { get { return queue.Count; } }

    // Writes what is queued and stops the thread.
    public void Finish() {
        queue.CompleteAdding();
        thread.Join();
        tsv.Dispose(); flicker.Dispose();
    }

    void Run() {
        foreach (var c in queue.GetConsumingEnumerable()) {
            try {
                var small = c.Work.GetAwaiter().GetResult();
                tsv.WriteLine(String.Format("{0}\t{1}\t{2:N3}", c.Name, c.Ms, c.S));
                Written++;
                if (small != null) Check(c.Key, c.Name, small);
            } catch (Exception e) {
                Errors.Add(c.Name + ": " + e.Message);
            }
        }
    }

    // A 160x90 grey copy of a capture, each of its pixels the mean of the capture's pixels that fall in it, over black.
    static float[] Small(Item c) {
        var v = new float[160 * 90];
        var n = new int[160 * 90];
        for (int y = 0; y < c.H; y++) {
            int row = y * 90 / c.H * 160;
            for (int x = 0; x < c.W; x++) {
                int i = y * c.Stride + x * 4, j = row + x * 160 / c.W;
                v[j] += (0.114f * c.Px[i] + 0.587f * c.Px[i + 1] + 0.299f * c.Px[i + 2]) * c.Px[i + 3] / 255f;
                n[j]++;
            }
        }

        for (int j = 0; j < v.Length; j++) if (n[j] > 0) v[j] /= n[j];
        return v;
    }

    // An RGBA PNG of the capture, each row filtered by Sub (the pixel to its left) and deflated at the fastest level.
    static void Png(string path, Item c) {
        var raw = new MemoryStream();
        using (var z = new ZLibStream(raw, CompressionLevel.Fastest, true)) {
            var line = new byte[1 + c.W * 4];
            line[0] = 1;
            for (int y = 0; y < c.H; y++) {
                for (int x = 0; x < c.W; x++) {
                    int i = y * c.Stride + x * 4, o = 1 + x * 4;
                    line[o] = c.Px[i + 2]; line[o + 1] = c.Px[i + 1]; line[o + 2] = c.Px[i]; line[o + 3] = c.Px[i + 3];
                }

                for (int o = line.Length - 1; o > 4; o--) line[o] -= line[o - 4];
                z.Write(line, 0, line.Length);
            }
        }

        var head = new byte[13];
        Big(head, 0, c.W); Big(head, 4, c.H); head[8] = 8; head[9] = 6;
        using (var f = File.Create(path)) {
            f.Write(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A }, 0, 8);
            Chunk(f, "IHDR", head, 13);
            Chunk(f, "IDAT", raw.GetBuffer(), (int)raw.Length);
            Chunk(f, "IEND", new byte[0], 0);
        }
    }

    static void Big(byte[] b, int at, int v) {
        b[at] = (byte)(v >> 24); b[at + 1] = (byte)(v >> 16); b[at + 2] = (byte)(v >> 8); b[at + 3] = (byte)v;
    }

    static readonly uint[] crcs = Crcs();
    static uint[] Crcs() {
        var t = new uint[256];
        for (uint n = 0; n < 256; n++) {
            uint k = n;
            for (int i = 0; i < 8; i++) k = (k & 1) != 0 ? 0xEDB88320u ^ (k >> 1) : k >> 1;
            t[n] = k;
        }

        return t;
    }

    static void Chunk(Stream f, string type, byte[] data, int length) {
        var b = new byte[8 + length + 4];
        Big(b, 0, length);
        for (int i = 0; i < 4; i++) b[4 + i] = (byte)type[i];
        Array.Copy(data, 0, b, 8, length);
        uint crc = 0xFFFFFFFFu;
        for (int i = 4; i < 8 + length; i++) crc = crcs[(crc ^ b[i]) & 0xFF] ^ (crc >> 8);
        Big(b, 8 + length, (int)(crc ^ 0xFFFFFFFFu));
        f.Write(b, 0, b.Length);
    }

    static bool IsDigits(string s, int from) {
        for (int i = from; i < s.Length; i++) if (s[i] < '0' || s[i] > '9') return false;
        return true;
    }

    // The series' last frame against the one before it and this one.
    void Check(string key, string name, float[] next) {
        Series s;
        if (!series.TryGetValue(key, out s)) { s = new Series(); series[key] = s; }
        if (s.Before != null) {
            double before = CaptureWindow.Diff(s.Last, s.Before), after = CaptureWindow.Diff(s.Last, next);
            double apart = CaptureWindow.Diff(s.Before, next);
            if (Math.Min(before, after) > 1.5 * apart + 0.7) {
                string line = String.Format("{0} {1:N1}/{2:N1} vs {3:N1}", s.Name, before, after, apart);
                Flicker.Add(line); flicker.WriteLine(line);
            }
        }
        s.Before = s.Last; s.Last = next; s.Name = name;
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

# Captures the window's client area (the game's picture, without the title bar and frame PrintWindow draws too) and
# hands it to the writer.
$script:writer = New-Object CaptureWriter $OutDir
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
    $script:writer.Add($name, $bmp, [DateTimeOffset]::Now.ToUnixTimeMilliseconds(), $script:clock.Elapsed.TotalSeconds)
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
    :plan foreach ($line in Get-Content $Plan) {
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
                if (-not $met) { $failed = $true; break plan } }
            'poke' { [CaptureWindow]::Write($handle, (Rdram), (Num $p[2]), (Num $p[3]))
                Write-Output ("{0,6:N1}s poke {1} {2}" -f $clock.Elapsed.TotalSeconds, $p[2], $p[3]) }
            'or' { $addr = Num $p[2]; [CaptureWindow]::Write($handle, (Rdram), $addr, ([CaptureWindow]::Read($handle, (Rdram), $addr) -bor (Num $p[3])))
                Write-Output ("{0,6:N1}s or {1} {2}" -f $clock.Elapsed.TotalSeconds, $p[2], $p[3]) }
            'end' { break plan }
            default { throw "unknown plan step: $line" }
        }
    }
} finally {
    if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force; Write-Output "stopped pid $($proc.Id)" }
    [void][System.Threading.Tasks.Task]::WaitAll($copies, 5000)
    $outFile.Dispose(); $errFile.Dispose()
    $pending = $script:writer.Pending
    if ($pending -gt 0) { Write-Output "writing the last $pending captures" }
    $script:writer.Finish()
}

$script:writer.Errors | ForEach-Object { Write-Output "not saved: $_" }
Write-Output "$($script:writer.Written) captures; frames unlike both neighbours: $($script:writer.Flicker.Count)"
$script:writer.Flicker | ForEach-Object { Write-Output "  $_" }
if ($failed) { exit 1 }
