"""Three original sketches for the finale (השַּׁמָּשׁ): thinking, tension, pressure, drama.
Run: python3 scripts/music/finale.py <outdir> finale"""
import sys, numpy as np
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from synth import (SR, hz, env, lp, hp, rng, bell, pad, bass, brass, kick, tick, snare, Track)

def tom(f=80, amp=0.6, dur=0.6):
    n = int(dur * SR); t = np.arange(n) / SR
    fr = f * (1 + 0.6 * np.exp(-t * 20))
    body = np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-t * 5)
    return amp * (body + 0.25 * hp(rng.uniform(-1, 1, n), 800) * np.exp(-t * 40))

def stab(f, dur, amp=1.0, cutoff=1800):   # short bowed-string ostinato note
    n = int(dur * SR); t = np.arange(n) / SR
    x = sum(2 * ((f * (1 + d) * t + rng.uniform()) % 1) - 1 for d in (-0.002, 0, 0.0025)) / 3
    return amp * lp(x, cutoff, 2) * env(n, 0.006, min(0.06, dur / 2), 0.9)

def heartbeat(amp=0.8):
    a = kick(amp); b = kick(amp * 0.6)
    out = np.zeros(len(a) + int(0.22 * SR)); out[:len(a)] += a; out[int(0.22 * SR):] += b
    return out

def sub_drone(f, dur, amp=0.4):
    n = int(dur * SR); t = np.arange(n) / SR
    return amp * np.sin(2 * np.pi * f * t) * (0.8 + 0.2 * np.sin(2 * np.pi * 0.25 * t)) * env(n, 1.5, 1.5)

# ── A. "הספירה לאחור" — heartbeat, ticking clock, a minor pulse that keeps climbing ──
def countdown(path):
    bpm = 96; b = 60 / bpm; bars = 40
    tr = Track(bars * 4 * b + 3)
    prog = [[50, 53, 57], [46, 50, 53], [48, 52, 55], [49, 52, 57]]   # Dm Bb C A
    for bar in range(bars):
        t0 = bar * 4 * b; ch = prog[(bar // 2) % 4]; sec = bar // 8; lift = min(sec, 3)
        tr.add(pad([hz(n + 12 + lift) for n in ch], 4 * b + 0.4, 600 + 250 * sec), t0, 0.2 + 0.03 * sec)
        tr.add(heartbeat(0.55 + 0.05 * sec), t0); tr.add(heartbeat(0.5 + 0.05 * sec), t0 + 2 * b)
        for k in range(8):
            tr.add(tick(0.3 if k % 2 == 0 else 0.18, 2100 if k % 2 == 0 else 1600), t0 + k * b / 2, pan=0.45 if k % 2 else -0.45)
        if sec >= 1:
            for k in range(8): tr.add(stab(hz(ch[0] - 12 + lift), b / 2 * 0.7, 0.35), t0 + k * b / 2)
        if sec >= 2:
            for k, n in enumerate([ch[2] + 12, ch[1] + 12, ch[0] + 12, ch[1] + 12]):
                tr.add(stab(hz(n + 12 + lift), b * 0.45, 0.16, 3200), t0 + k * b + b / 2, pan=0.3)
        if sec >= 3:
            for k in range(4): tr.add(snare(0.12 + 0.02 * (bar % 8)), t0 + k * b + 3 * b / 4)
        if sec >= 4 and bar % 2 == 1: tr.add(tom(70, 0.55), t0 + 3 * b); tr.add(tom(60, 0.55), t0 + 3.5 * b)
    tr.render(path, verb=0.22, seconds=bars * 4 * b + 1.5)

# ── B. "חדר החידות" — mysterious, thinking; oriental (Phrygian-dominant) bells over a low pulse ──
def mystery(path):
    bpm = 84; b = 60 / bpm; bars = 32
    tr = Track(bars * 4 * b + 4)
    scale = [62, 63, 66, 67, 69, 70, 72, 74]          # D Eb F# G A Bb C D
    motif = [(0, 1), (1, .5), (2, .5), (1, 1), (0, 1), (4, 1.5), (5, .5), (4, 1), (2, 1), (1, 2)]
    for bar in range(bars):
        t0 = bar * 4 * b; sec = bar // 8
        if bar % 2 == 0: tr.add(sub_drone(hz(38), 8 * b + 1, 0.35), t0)
        tr.add(pad([hz(50), hz(57), hz(63 if bar % 4 < 2 else 62)], 4 * b + 0.4, 500 + 200 * sec), t0, 0.22)
        for k in range(8):   # quiet low pulse, "thinking"
            tr.add(stab(hz(38 if k % 4 else 50), b / 2 * 0.6, 0.28 + 0.05 * sec, 700), t0 + k * b / 2)
        if bar % 2 == 0: tr.add(tom(55, 0.5), t0)
        if sec >= 1 and bar % 2 == 1: tr.add(tom(65, 0.35), t0 + 2.5 * b); tr.add(tom(55, 0.45), t0 + 3 * b)
    t = 4 * 4 * b
    while t < (bars - 2) * 4 * b:   # bell motif, answered an octave up later on
        for deg, d in motif:
            tr.add(bell(hz(scale[deg] + 12), d * b * 2.2, 1), t, 0.16, pan=-0.25)
            if t > 16 * 4 * b: tr.add(bell(hz(scale[deg] + 24), d * b * 1.6, 1), t + b / 2, 0.06, pan=0.35)
            t += d * b
        t += 4 * b
    for bar in range(16, bars):   # second half: tension strings
        t0 = bar * 4 * b
        for k in range(16): tr.add(stab(hz(scale[(k * 3) % 5] + 0), b / 4 * 0.7, 0.07 + 0.006 * (bar - 16), 2600), t0 + k * b / 4, pan=0.2)
    tr.render(path, verb=0.32, seconds=bars * 4 * b + 2)

# ── C. "הקרב האחרון" — epic and driving: string ostinato, war drums, brass, rising key ──
def battle(path):
    bpm = 126; b = 60 / bpm; bars = 48
    tr = Track(bars * 4 * b + 3)
    prog = [[50, 53, 57], [50, 53, 57], [46, 50, 53], [48, 52, 55]]   # Dm Dm Bb C
    riff = [0, 0, 12, 0, 10, 0, 7, 0]
    for bar in range(bars):
        t0 = bar * 4 * b; sec = bar // 12; key = 2 * sec; ch = prog[bar % 4]
        root = ch[0] - 12 + key
        for k in range(16):   # 16th string ostinato
            tr.add(stab(hz(root + riff[k % 8]), b / 4 * 0.8, 0.22 + 0.03 * sec, 1500 + 400 * sec), t0 + k * b / 4, pan=-0.2 if k % 2 else 0.2)
        tr.add(bass(hz(root - 12), 2 * b, 0.55), t0); tr.add(bass(hz(root - 12), 2 * b, 0.5), t0 + 2 * b)
        tr.add(tom(60, 0.7), t0); tr.add(tom(60, 0.5), t0 + 1.5 * b); tr.add(tom(75, 0.6), t0 + 2 * b)
        if sec >= 1: tr.add(tom(90, 0.45), t0 + 3 * b); tr.add(tom(80, 0.45), t0 + 3.25 * b); tr.add(tom(70, 0.5), t0 + 3.5 * b)
        if sec >= 1: tr.add(pad([hz(n + 12 + key) for n in ch], 4 * b + 0.3, 1500), t0, 0.2)
        if sec >= 2 and bar % 2 == 0:   # brass call
            for n, at, d in [(ch[2] + 12, 0, 1.5), (ch[1] + 12, 1.5, .5), (ch[0] + 12, 2, 2)]:
                tr.add(brass(hz(n + key), d * b * 0.95), t0 + at * b, 0.3, pan=-0.1)
                tr.add(brass(hz(n + key - 12), d * b * 0.95), t0 + at * b, 0.18, pan=0.1)
        if sec >= 3:
            for k in range(4): tr.add(snare(0.25), t0 + k * b + b / 2)
            tr.add(kick(0.8), t0); tr.add(kick(0.7), t0 + 2 * b)
    tr.render(path, verb=0.2, seconds=bars * 4 * b + 1.5)

if __name__ == '__main__':
    out = sys.argv[1]
    countdown(f'{out}/finale-A-countdown.mp3'); print('A')
    mystery(f'{out}/finale-B-mystery.mp3'); print('B')
    battle(f'{out}/finale-C-battle.mp3'); print('C')
