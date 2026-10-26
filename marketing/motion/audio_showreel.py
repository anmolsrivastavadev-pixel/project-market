"""Sound design for comps/showreel.html, cued to the same timeline.
   python3 audio_showreel.py out/showreel-mix.wav"""
import sys, wave
import numpy as np

SR, DUR = 48000, 15.0
N = int(SR * DUR)
rng = np.random.default_rng(11)
L = np.zeros(N); R = np.zeros(N)

def place(sig, at, gain=1.0, pan=0.0):
    i = int(at * SR); j = min(N, i + len(sig)); s = sig[: j - i] * gain
    L[i:j] += s * np.sqrt((1 - pan) / 2); R[i:j] += s * np.sqrt((1 + pan) / 2)

def env(n, a=0.005, r=0.1):
    t = np.arange(n) / SR
    return np.minimum(1, t / a) * np.exp(-t / r)

def bandnoise(n, lo, hi):
    spec = np.fft.rfft(rng.standard_normal(n)); f = np.fft.rfftfreq(n, 1 / SR)
    spec[(f < lo) | (f > hi)] = 0
    x = np.fft.irfft(spec, n); return x / (np.abs(x).max() + 1e-9)

def scratch(dur, seed=0):
    n = int(dur * SR); t = np.arange(n) / SR
    flutter = 0.55 + 0.45 * np.abs(np.sin(2 * np.pi * (9 + seed) * t + seed))
    shape = np.minimum(1, t / 0.02) * np.minimum(1, (dur - t) / 0.04)
    return bandnoise(n, 2500, 9000) * flutter * shape

def whoosh(dur, lo=300, hi=3000, peak=0.5):
    n = int(dur * SR); t = np.arange(n) / SR
    shape = np.where(t < dur * peak, t / (dur * peak), (dur - t) / (dur * (1 - peak))) ** 2
    return bandnoise(n, lo, hi) * shape

def thud(f0=70, dur=0.5, click=0.4):
    n = int(dur * SR); t = np.arange(n) / SR
    body = np.sin(2 * np.pi * (f0 + 60 * np.exp(-t / 0.03)) * t) * env(n, 0.002, 0.12)
    return body + click * bandnoise(n, 1500, 6000) * env(n, 0.001, 0.012)

def tick(f=2400, r=0.008):
    n = int(0.05 * SR); t = np.arange(n) / SR
    return np.sin(2 * np.pi * f * t) * env(n, 0.001, r)

def key(seed):
    n = int(0.03 * SR)
    return bandnoise(n, 1800, 7000) * env(n, 0.0005, 0.006) + 0.4 * tick(900 + seed % 5 * 70, 0.004)[:n]

def pluck(f, dur=0.6):
    n = int(dur * SR); t = np.arange(n) / SR
    return (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t)) * env(n, 0.003, 0.18)

def pad(freqs, start, end, gain):
    n = int((end - start) * SR); t = np.arange(n) / SR
    x = sum(np.sin(2 * np.pi * f * t + i) + 0.3 * np.sin(2 * np.pi * f * 2.003 * t) for i, f in enumerate(freqs))
    shape = np.minimum(1, t / 0.6) * np.minimum(1, (end - start - t) / 0.8)
    place(x / len(freqs) * shape, start, gain, -0.2); place(x / len(freqs) * shape, start + 0.011, gain, 0.2)

# harmony: tense → open on the stage → bright on the sign-off
pad([110, 155.6, 220], 0.0, 2.4, 0.06)
pad([130.8, 196, 261.6, 329.6], 2.3, 5.2, 0.075)
pad([130.8, 196, 246.9, 329.6], 4.9, 10.1, 0.06)
pad([146.8, 220, 293.7, 370], 9.9, 15.0, 0.085)
# a pulse under the product demo so it feels like it's moving
for i, at in enumerate(np.arange(4.9, 9.8, 0.4)):
    place(thud(48, 0.25, 0.0), at, 0.12 if i % 2 == 0 else 0.07)

# S1: cards pile on
for i, at in enumerate([0.62, 0.83, 1.0, 1.2, 1.36]):
    place(whoosh(0.18, 600, 4000), at - 0.08, 0.07, (i % 2) * 0.6 - 0.3)
    place(thud(120 + i * 9, 0.18, 0.7), at + 0.08, 0.2, (i % 2) * 0.6 - 0.3)
# whip
place(whoosh(0.55, 200, 6000, 0.6), 2.05, 0.5, 0.0)
place(thud(55, 0.4, 0.2), 2.5, 0.25)
# S2 type + underline
for i in range(14):
    place(tick(2100 + (i * 173) % 900), 2.5 + i * 0.034, 0.05, (i % 5 - 2) / 4)
place(scratch(0.3, 2), 3.25, 0.22, 0.1); place(scratch(0.22, 3), 3.5, 0.16, -0.1)
# S3 slides up
place(whoosh(0.6, 150, 2500, 0.7), 4.6, 0.3, 0.2)
for i in range(11):
    place(tick(2300 + (i * 131) % 700), 5.12 + i * 0.027, 0.04)
for i in range(34):                                        # typing the URL
    place(key(i), 5.45 + i * (0.78 / 34) + (i * 37 % 7) * 0.002, 0.11, -0.4)
place(key(99), 6.36, 0.3, -0.3); place(tick(1100, 0.02), 6.4, 0.18, -0.3)   # Submit click
place(pluck(880), 6.5, 0.18, -0.3)                        # favicon fetched
place(whoosh(0.3, 400, 3000), 6.5, 0.12, 0.4); place(thud(140, 0.2, 0.5), 6.72, 0.16, 0.4)  # card lands
place(whoosh(0.58, 800, 7000, 0.4), 6.68, 0.16, 0.2)        # logo in flight
place(pluck(1318.5, 0.8), 7.26, 0.2, 0.4)                 # logo lands
place(scratch(0.7, 5), 7.4, 0.17, -0.4); place(scratch(0.42, 6), 7.78, 0.15, 0.1)
place(thud(60, 0.7, 0.9), 8.58, 0.9, 0.2)                 # LISTED: the payoff
# S3 drops away, mark builds
place(whoosh(0.55, 150, 2200, 0.3), 9.85, 0.32)
place(pluck(587.3), 10.0, 0.16); place(pluck(740), 10.2, 0.14); place(pluck(880), 10.3, 0.14)
place(thud(90, 0.3, 0.5), 10.5, 0.3)
for i in range(14):
    place(tick(2400 + (i * 211) % 800), 10.6 + i * 0.03, 0.04, (i % 3 - 1) / 3)
for i in range(21):
    place(tick(2600 + (i * 97) % 600), 11.35 + i * 0.024, 0.035, (i % 3 - 1) / 3)
place(scratch(0.38, 7), 12.5, 0.15, 0.1)
place(pluck(1174.7, 1.6) * 0.8 + pluck(1480, 1.6) * 0.5, 12.85, 0.12)

mix = np.stack([L, R], 1)
mix -= mix.mean(0)
mix *= np.minimum(1, (DUR - np.arange(N) / SR) / 0.7)[:, None]
mix *= 0.89 / np.abs(mix).max()
with wave.open(sys.argv[1], 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype('<i2').tobytes())
