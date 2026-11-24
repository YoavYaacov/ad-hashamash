"""Original background-music sketches for 'עד הנר האחרון' — synthesized from scratch (no samples, no copyright)."""
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve
import subprocess, sys

SR = 44100
rng = np.random.default_rng(7)

def hz(n):  # MIDI → Hz
    return 440.0 * 2 ** ((n - 69) / 12)

def env(n, a=0.01, r=0.2, sustain=1.0):
    t = np.arange(n) / SR
    e = np.ones(n) * sustain
    an = int(a * SR); rn = int(r * SR)
    if an: e[:an] = np.linspace(0, sustain, an)
    if rn and rn < n: e[-rn:] *= np.linspace(1, 0, rn)
    return e

def lp(x, fc, order=2):
    return sosfilt(butter(order, fc, 'low', fs=SR, output='sos'), x)

def hp(x, fc, order=2):
    return sosfilt(butter(order, fc, 'high', fs=SR, output='sos'), x)

def pluck(f, dur, bright=0.5, decay=0.996):
    n = int(dur * SR); p = max(2, int(SR / f))
    buf = rng.uniform(-1, 1, p); buf = lp(buf, 2000 + 6000 * bright) if p > 20 else buf
    out = np.zeros(n)
    for i in range(n):
        out[i] = buf[i % p]
        buf[i % p] = decay * 0.5 * (buf[i % p] + buf[(i + 1) % p])
    return out * env(n, 0.002, 0.05)

def bell(f, dur, amp=1.0):
    n = int(dur * SR); t = np.arange(n) / SR
    mod = 2.0 * np.exp(-t * 3) * np.sin(2 * np.pi * f * 3.5 * t)
    return amp * np.sin(2 * np.pi * f * t + mod) * np.exp(-t * 2.2) * env(n, 0.002, 0.05)

def pad(fs, dur, cutoff=1400, amp=1.0):
    n = int(dur * SR); t = np.arange(n) / SR; x = np.zeros(n)
    for f in fs:
        for d in (-0.12, 0.0, 0.11):
            ph = rng.uniform(0, 1)
            x += 2 * ((f * (1 + d / 100) * t + ph) % 1) - 1      # detuned saws
    x = lp(x / (3 * len(fs)), cutoff, 2)
    return amp * x * env(n, min(0.8, dur / 3), min(1.0, dur / 3))

def bass(f, dur, amp=1.0):
    n = int(dur * SR); t = np.arange(n) / SR
    x = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t)
    return amp * x * np.exp(-t * 3) * env(n, 0.004, 0.06)

def brass(f, dur, amp=1.0):
    n = int(dur * SR); t = np.arange(n) / SR
    x = 2 * ((f * t) % 1) - 1 + 0.6 * (2 * ((f * 1.003 * t) % 1) - 1)
    cut = 900 + 2200 * np.minimum(1, t / 0.08)
    y = lp(x, 2600, 2) * 0.6 + lp(x, 1200, 2) * 0.4
    return amp * y * env(n, 0.03, 0.12, 0.9) * (0.85 + 0.15 * np.sin(2 * np.pi * 5 * t))

def kick(amp=1.0):
    n = int(0.35 * SR); t = np.arange(n) / SR
    f = 110 * np.exp(-t * 18) + 45
    return amp * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)

def shaker(amp=0.3, dur=0.07):
    n = int(dur * SR)
    return amp * hp(rng.uniform(-1, 1, n), 6000) * np.exp(-np.arange(n) / SR * 60)

def tick(amp=0.5, f=1800):
    n = int(0.05 * SR); t = np.arange(n) / SR
    return amp * np.sin(2 * np.pi * f * t) * np.exp(-t * 120)

def snare(amp=0.4):
    n = int(0.18 * SR); t = np.arange(n) / SR
    return amp * (hp(rng.uniform(-1, 1, n), 1500) * np.exp(-t * 22) + 0.4 * np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30))

class Track:
    def __init__(self, seconds):
        self.L = np.zeros(int(seconds * SR) + SR * 3); self.R = np.zeros_like(self.L)
    def add(self, x, at, gain=1.0, pan=0.0):
        i = int(at * SR); x = x[: max(0, len(self.L) - i)]
        self.L[i:i + len(x)] += x * gain * (1 - max(0, pan))
        self.R[i:i + len(x)] += x * gain * (1 + min(0, pan))
    def render(self, path, verb=0.25, seconds=None):
        ir_n = int(2.2 * SR); t = np.arange(ir_n) / SR
        ir = rng.uniform(-1, 1, ir_n) * np.exp(-t * 2.6); ir = lp(ir, 5000)
        ir /= np.sqrt(np.sum(ir ** 2))
        outs = []
        for ch in (self.L, self.R):
            wet = fftconvolve(ch, ir)[: len(ch)]
            outs.append((1 - verb) * ch + verb * wet)
        st = np.stack(outs, 1)
        if seconds: st = st[: int(seconds * SR)]
        fade = int(2.5 * SR); st[-fade:] *= np.linspace(1, 0, fade)[:, None]; st[: int(.3 * SR)] *= np.linspace(0, 1, int(.3 * SR))[:, None]
        st = np.tanh(st / (np.max(np.abs(st)) + 1e-9) * 1.3) * 0.85
        pcm = (st * 32767).astype(np.int16)
        wav = path.replace('.mp3', '.wav')
        import wave
        with wave.open(wav, 'wb') as w:
            w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-b:a', '160k', path], check=True)

# ── 1. אור הנרות: calm, warm, curious (puzzle background) ──────────────────────
def candlelight(path):
    bpm = 84; b = 60 / bpm; bars = 16
    tr = Track(bars * 4 * b + 2)
    # D minor → Bb → Gm → A (the A major gives a gentle Jewish "freygish" colour)
    prog = [(62, [50, 57, 62, 65]), (58, [46, 53, 58, 62]), (55, [43, 50, 55, 58]), (57, [45, 52, 57, 61])]
    arps = [[62, 65, 69, 74, 69, 65, 69, 65], [58, 62, 65, 70, 65, 62, 65, 62], [55, 58, 62, 67, 62, 58, 62, 58], [57, 61, 64, 69, 64, 61, 64, 61]]
    for bar in range(bars):
        root, chord = prog[bar % 4]; t0 = bar * 4 * b
        tr.add(pad([hz(n) for n in chord], 4 * b + 0.6, 1100), t0, 0.33)
        tr.add(bass(hz(root - 24), 2 * b), t0, 0.5); tr.add(bass(hz(root - 24), 2 * b), t0 + 2 * b, 0.35)
        if bar >= 2:
            for k, n in enumerate(arps[bar % 4]):
                tr.add(pluck(hz(n), 1.2, 0.35), t0 + k * b / 2, 0.32 if k % 2 == 0 else 0.22, pan=0.3 if k % 2 else -0.3)
        if bar >= 4 and bar % 2 == 0:
            for k, n in enumerate([81, 77, 74] if bar % 4 == 0 else [79, 76, 73]):
                tr.add(bell(hz(n), 2.5), t0 + (2 + k * 0.5) * b, 0.12, pan=-0.4 + 0.4 * k)
    tr.render(path, verb=0.35, seconds=bars * 4 * b + 1.5)

# ── 2. סביבון קצבי: playful, light klezmer bounce (energetic rounds) ───────────
def dreidel(path):
    bpm = 116; b = 60 / bpm; bars = 16
    tr = Track(bars * 4 * b + 2)
    # D "freygish" (D Eb F# G A Bb C) with Gm answers
    mel = [
        [(62, 0.5), (63, 0.5), (66, 0.5), (67, 0.5), (69, 1), (67, 0.5), (66, 0.5)],
        [(67, 0.5), (66, 0.5), (63, 0.5), (66, 0.5), (62, 2)],
        [(69, 0.5), (70, 0.5), (69, 0.5), (67, 0.5), (66, 0.5), (67, 0.5), (69, 1)],
        [(67, 0.5), (66, 0.5), (63, 0.5), (61, 0.5), (62, 2)],
    ]
    chords = [[50, 54, 57], [50, 54, 57], [43, 46, 50], [50, 54, 57]]
    for bar in range(bars):
        t0 = bar * 4 * b; ch = chords[bar % 4]
        for beat in range(4):                                   # oom-pah
            if beat % 2 == 0: tr.add(bass(hz(ch[0] - 12 + (7 if beat == 2 else 0)), b * 0.9), t0 + beat * b, 0.55)
            else:
                for n in ch: tr.add(pluck(hz(n + 12), 0.4, 0.6, 0.99), t0 + beat * b, 0.13, pan=-0.2)
            tr.add(shaker(0.22), t0 + beat * b + b / 2, 1, pan=0.4)
        if bar >= 2:
            t = t0
            for n, d in mel[bar % 4]:
                tr.add(pluck(hz(n + 12), d * b * 1.4, 0.75, 0.993), t, 0.36, pan=0.15)
                if bar >= 8: tr.add(bell(hz(n + 24), d * b * 2, 0.5), t, 0.07)
                t += d * b
        if bar % 4 == 3: tr.add(kick(0.6), t0 + 3.5 * b)
    tr.render(path, verb=0.2, seconds=bars * 4 * b + 1.5)

# ── 3. השעון מתקתק: tension for the last seconds / memory recall ───────────────
def ticking(path):
    bpm = 120; b = 60 / bpm; bars = 12
    tr = Track(bars * 4 * b + 2)
    for bar in range(bars):
        t0 = bar * 4 * b
        for k in range(8):
            tr.add(tick(0.42 if k % 2 == 0 else 0.25, 2000 if k % 2 == 0 else 1500), t0 + k * b / 2, pan=0.5 if k % 2 else -0.5)
            tr.add(bass(hz(38 if bar % 4 < 2 else 39), b / 2 * 0.8, 0.5), t0 + k * b / 2, 0.45)
        lift = 0 if bar < 8 else bar - 7
        tr.add(pad([hz(62 + lift), hz(65 + lift), hz(69 + lift)], 4 * b + 0.3, 700 + 220 * bar), t0, 0.22 + 0.02 * bar)
        if bar >= 4: tr.add(kick(0.45 + 0.04 * bar), t0); tr.add(kick(0.4), t0 + 2 * b)
        if bar >= 8:
            for k in range(4): tr.add(snare(0.18 + 0.03 * bar), t0 + k * b + b / 2)
    tr.render(path, verb=0.18, seconds=bars * 4 * b + 1.5)

# ── 4. הטריבונה: festive, bright, celebratory (podium / ending) ────────────────
def podium(path):
    bpm = 104; b = 60 / bpm; bars = 16
    tr = Track(bars * 4 * b + 2)
    prog = [[50, 54, 57, 62], [55, 59, 62, 67], [57, 61, 64, 69], [50, 54, 57, 62]]   # D G A D
    fan = [
        [(69, 0.5), (69, 0.5), (69, 0.5), (74, 2.5)],
        [(71, 0.5), (74, 0.5), (79, 1), (78, 1), (76, 1)],
        [(76, 1), (73, 0.5), (76, 0.5), (81, 1.5), (79, 0.5)],
        [(78, 1), (76, 0.5), (73, 0.5), (74, 2)],
    ]
    for bar in range(bars):
        t0 = bar * 4 * b; ch = prog[bar % 4]
        tr.add(pad([hz(n) for n in ch], 4 * b + 0.4, 2200), t0, 0.3)
        for beat in range(4):
            tr.add(bass(hz(ch[0] - 12), b * 0.9), t0 + beat * b, 0.5)
            tr.add(kick(0.55), t0 + beat * b) if beat in (0, 2) else tr.add(snare(0.32), t0 + beat * b)
            tr.add(shaker(0.2), t0 + beat * b + b / 2, 1, pan=0.4)
        t = t0
        for n, d in fan[bar % 4]:
            tr.add(brass(hz(n), d * b * 0.95), t, 0.3, pan=-0.15)
            tr.add(brass(hz(n - 5 if bar >= 4 else n - 12), d * b * 0.95), t, 0.16, pan=0.15)
            if bar >= 8: tr.add(bell(hz(n + 12), d * b * 2), t, 0.12)
            t += d * b
        if bar % 4 == 3:
            for k, n in enumerate([86, 90, 93, 98]): tr.add(bell(hz(n), 1.6), t0 + 3 * b + k * b / 4, 0.12, pan=-0.5 + k / 3)
    tr.render(path, verb=0.25, seconds=bars * 4 * b + 1.5)

if __name__ == '__main__' and len(sys.argv) == 2:
    out = sys.argv[1]
    candlelight(f'{out}/1-or-haneirot.mp3'); print('1')
    dreidel(f'{out}/2-sevivon.mp3'); print('2')
    ticking(f'{out}/3-hashaon.mp3'); print('3')
    podium(f'{out}/4-hatribuna.mp3'); print('4')

def flute(f, dur, amp=1.0):
    n = int(dur * SR); t = np.arange(n) / SR
    vib = 1 + 0.004 * np.sin(2 * np.pi * 5.5 * t) * np.minimum(1, t / 0.25)
    ph = 2 * np.pi * f * np.cumsum(vib) / SR
    x = np.sin(ph) + 0.25 * np.sin(2 * ph) + 0.08 * np.sin(3 * ph)
    breath = hp(rng.uniform(-1, 1, n), 3000) * 0.04
    return amp * (x + breath) * env(n, 0.03, 0.08, 0.9)

def clap(amp=0.35):
    n = int(0.15 * SR); t = np.arange(n) / SR; x = np.zeros(n)
    for d in (0, 0.008, 0.017):
        i = int(d * SR); m = n - i
        x[i:] += hp(rng.uniform(-1, 1, m), 1200) * np.exp(-np.arange(m) / SR * 35)
    return amp * lp(x, 6000)

# ── 2b. סביבון שמח: major, bouncy, bright (non-puzzle tasks) ──────────────────
def happy(path):
    bpm = 126; b = 60 / bpm; bars = 16
    tr = Track(bars * 4 * b + 2)
    prog = [[62, 66, 69], [67, 71, 74], [69, 73, 76], [62, 66, 69]]            # D G A D
    mel = [
        [(74, .5), (76, .5), (78, 1), (76, .5), (74, .5), (71, 1)],
        [(71, .5), (74, .5), (79, 1), (78, .5), (76, .5), (74, 1)],
        [(76, .5), (78, .5), (81, 1), (79, .5), (78, .5), (76, .5), (73, .5)],
        [(74, .75), (73, .25), (74, .5), (78, .5), (74, 2)],
    ]
    for bar in range(bars):
        t0 = bar * 4 * b; ch = prog[bar % 4]
        for beat in range(4):
            if beat % 2 == 0: tr.add(bass(hz(ch[0] - 24 + (7 if beat == 2 else 0)), b * .9), t0 + beat * b, .55)
            else:
                for n in ch: tr.add(pluck(hz(n), .35, .8, .99), t0 + beat * b, .12, pan=-.25)
                tr.add(clap(.28), t0 + beat * b, pan=.1)
            tr.add(shaker(.2), t0 + beat * b + b / 2, pan=.4)
        if bar % 2 == 0: tr.add(kick(.5), t0)
        if bar >= 2:
            t = t0
            for n, d in mel[bar % 4]:
                tr.add(flute(hz(n), d * b * .95), t, .26, pan=.12)
                if bar >= 8: tr.add(pluck(hz(n), d * b * 1.5, .9, .994), t, .14, pan=-.3)
                t += d * b
        if bar % 4 == 3:
            for k, n in enumerate([86, 90, 93]): tr.add(bell(hz(n), 1.4), t0 + 3 * b + k * b / 3, .1, pan=-.4 + .4 * k)
    tr.render(path, verb=.2, seconds=bars * 4 * b + 1.5)

# ── 4b. הטריבונה חגיגית: big, joyful party finale with a lift ────────────────
def celebration(path):
    bpm = 128; b = 60 / bpm; bars = 20
    tr = Track(bars * 4 * b + 2)
    prog = [[50, 54, 57, 62], [55, 59, 62, 67], [47, 50, 54, 59], [57, 61, 64, 69]]     # D G Bm A
    mel = [
        [(74, .5), (74, .5), (78, .5), (81, 1.5), (78, .5), (79, .5)],
        [(79, .5), (78, .5), (76, .5), (74, .5), (79, 2)],
        [(78, .5), (79, .5), (81, .5), (83, 1.5), (81, .5), (78, .5)],
        [(76, .5), (78, .5), (79, .5), (81, .5), (76, 2)],
    ]
    for bar in range(bars):
        up = 2 if bar >= 12 else 0                                     # key lift for the big finish
        t0 = bar * 4 * b; ch = [n + up for n in prog[bar % 4]]
        tr.add(pad([hz(n) for n in ch], 4 * b + .3, 2600), t0, .26)
        for beat in range(4):
            tr.add(kick(.6), t0 + beat * b)                            # four on the floor
            tr.add(bass(hz(ch[0] - 12), b * .45), t0 + beat * b + b / 2, .45)
            if beat % 2: tr.add(clap(.4), t0 + beat * b); tr.add(snare(.2), t0 + beat * b)
            tr.add(shaker(.22), t0 + beat * b + b / 2, pan=.4); tr.add(shaker(.12), t0 + beat * b + b / 4, pan=-.4)
        if bar >= 1:
            t = t0
            for n, d in mel[bar % 4]:
                tr.add(brass(hz(n + up), d * b * .92), t, .26, pan=-.12)
                tr.add(flute(hz(n + up + 12), d * b * .92), t, .12, pan=.2)
                if bar >= 4: tr.add(brass(hz(n + up - 4), d * b * .92), t, .14, pan=.15)
                t += d * b
        for k in range(8):                                             # sparkle arpeggio
            if bar >= 4: tr.add(bell(hz([86, 90, 93, 98, 93, 90, 86, 90][k] + up), .8), t0 + k * b / 2, .05, pan=-.5 + k / 7)
        if bar in (3, 11, 19):
            for k in range(8): tr.add(snare(.15 + .03 * k), t0 + 2 * b + k * b / 4)   # drum fill
    tr.render(path, verb=.22, seconds=bars * 4 * b + 1.5)

if __name__ == '__main__' and len(sys.argv) > 2 and sys.argv[2] == 'v2':
    happy(f'{sys.argv[1]}/2b-happy.mp3'); celebration(f'{sys.argv[1]}/4b-celebration.mp3'); print('v2')

def lead(f, dur, amp=1.0):
    """Bright, catchy synth lead: two detuned squares, a touch of filter sweep."""
    n = int(dur * SR); t = np.arange(n) / SR
    sq = lambda ff: np.sign(np.sin(2 * np.pi * ff * t))
    x = 0.5 * sq(f) + 0.5 * sq(f * 1.006) + 0.3 * np.sin(2 * np.pi * f * 2 * t)
    y = lp(x, 3200, 2) * 0.7 + lp(x, 1400, 2) * 0.3
    return amp * y * env(n, 0.008, 0.07, 0.85)

def hat(amp=0.15, open_=False):
    n = int((0.22 if open_ else 0.05) * SR)
    return amp * hp(rng.uniform(-1, 1, n), 8000) * np.exp(-np.arange(n) / SR * (14 if open_ else 70))

def riser(dur, amp=0.25):
    n = int(dur * SR); t = np.arange(n) / SR
    x = rng.uniform(-1, 1, n)
    out = np.zeros(n); seg = n // 16
    for k in range(16):                                    # noise sweep upward
        s = slice(k * seg, (k + 1) * seg if k < 15 else n)
        out[s] = hp(x[s], 400 + 500 * k)
    return amp * out * (t / dur) ** 2

# ── 4c. מסיבה: rhythm builds first, then a catchy major hook ───────────────────
def party(path):
    bpm = 124; b = 60 / bpm; bars = 24
    tr = Track(bars * 4 * b + 3)
    prog = [62, 57, 59, 55]                                     # D  A  Bm  G  (I–V–vi–IV)
    chords = {62: [62, 66, 69], 57: [57, 61, 64], 59: [59, 62, 66], 55: [55, 59, 62]}
    hook = [
        [(74, .75), (74, .75), (76, .5), (78, 1), (76, 1)],
        [(78, .75), (78, .75), (79, .5), (81, 1), (78, 1)],
        [(83, .75), (81, .75), (78, .5), (76, 1), (74, 1)],
        [(76, .75), (78, .75), (76, .5), (74, 2)],
    ]
    for bar in range(bars):
        t0 = bar * 4 * b; root = prog[bar % 4]; ch = chords[root]
        # 1–2: kick + shaker │ 3–4: + claps, hats │ 5–6: + bass groove │ 7–8: + chord stabs, riser │ 9+: the hook
        for beat in range(4):
            tr.add(kick(.65), t0 + beat * b)
            tr.add(shaker(.16), t0 + beat * b + b / 2, pan=.35)
            if bar >= 2:
                if beat % 2: tr.add(clap(.42), t0 + beat * b)
                tr.add(hat(.13, open_=True), t0 + beat * b + b / 2, pan=-.3)
                tr.add(hat(.07), t0 + beat * b + b / 4, pan=.3); tr.add(hat(.07), t0 + beat * b + 3 * b / 4, pan=.3)
            if bar >= 4:
                for k, off in enumerate((0, .5)):           # octave-bouncing bass on 8ths
                    tr.add(bass(hz(root - 24 + (12 if k else 0)), b * .42), t0 + beat * b + off * b, .5)
            if bar >= 6 and bar not in (15,):
                for n in ch: tr.add(pluck(hz(n + 12), .3, .9, .985), t0 + beat * b + b / 2, .1, pan=-.2)   # off-beat stabs
        if bar >= 8:
            pump = np.concatenate([np.minimum(1, np.linspace(.25, 1.6, int(b * SR)))] * 4)
            p = pad([hz(n) for n in ch], 4 * b, 2400)
            m = min(len(p), len(pump)); tr.add(p[:m] * pump[:m], t0, .2)
        if bar == 7: tr.add(riser(4 * b), t0, 1)
        if bar in (7, 15, 23):
            for k in range(8): tr.add(snare(.12 + .035 * k), t0 + 2 * b + k * b / 4)
        if bar >= 8:
            t = t0; up = 12 if bar >= 16 else 0
            for n, d in hook[bar % 4]:
                tr.add(lead(hz(n), d * b * .9), t, .2, pan=-.1)
                if bar >= 12: tr.add(lead(hz(n - 12), d * b * .9), t, .1, pan=.15)
                if bar >= 16: tr.add(bell(hz(n + up), d * b * 1.8), t, .09, pan=.3)
                t += d * b
    tr.add(kick(.8), bars * 4 * b); tr.add(clap(.5), bars * 4 * b)
    for n in chords[62]: tr.add(brass(hz(n + 12), 1.6), bars * 4 * b, .15)
    tr.render(path, verb=.18, seconds=bars * 4 * b + 2.5)

if __name__ == '__main__' and len(sys.argv) > 2 and sys.argv[2] == 'v3':
    party(f'{sys.argv[1]}/4c-party.mp3'); print('v3')
