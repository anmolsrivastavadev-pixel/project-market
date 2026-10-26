"""Sound design for comps/project-market.html, cued to the same timeline.
   python3 audio.py out/project-market-mix.wav"""
import sys, wave
import numpy as np

SR, DUR = 48000, 13.0
N = int(SR * DUR)
rng = np.random.default_rng(7)
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
    # pen on paper: band-limited noise with stroke-rate amplitude flutter
    n = int(dur * SR); t = np.arange(n) / SR
    flutter = 0.55 + 0.45 * np.abs(np.sin(2 * np.pi * (9 + seed) * t + seed))
    shape = np.minimum(1, t / 0.02) * np.minimum(1, (dur - t) / 0.04)
    return bandnoise(n, 2500, 9000) * flutter * shape

def whoosh(dur, lo=300, hi=3000):
    n = int(dur * SR); t = np.arange(n) / SR
    return bandnoise(n, lo, hi) * np.sin(np.pi * t / dur) ** 2

def thud(f0=70, dur=0.5, click=0.4):
    n = int(dur * SR); t = np.arange(n) / SR
    body = np.sin(2 * np.pi * (f0 + 60 * np.exp(-t / 0.03)) * t) * env(n, 0.002, 0.12)
    return body + click * bandnoise(n, 1500, 6000) * env(n, 0.001, 0.012)

def tick(f=2400):
    n = int(0.04 * SR); t = np.arange(n) / SR
    return np.sin(2 * np.pi * f * t) * env(n, 0.001, 0.008)

# pad: warm chord that lifts to a brighter voicing on the end card
def pad(freqs, start, end, gain):
    n = int((end - start) * SR); t = np.arange(n) / SR
    x = sum(np.sin(2 * np.pi * f * t + i) + 0.3 * np.sin(2 * np.pi * f * 2.003 * t) for i, f in enumerate(freqs))
    shape = np.minimum(1, t / 0.8) * np.minimum(1, (end - start - t) / 0.9)
    place(x / len(freqs) * shape, start, gain, -0.2); place(x / len(freqs) * shape, start + 0.011, gain, 0.2)

pad([110, 164.8, 220, 261.6], 0.0, 3.3, 0.07)      # A minor-ish: the problem
pad([130.8, 196, 261.6, 329.6], 3.1, 9.6, 0.075)   # C major: the answer
pad([146.8, 220, 293.7, 370], 9.3, 13.0, 0.085)    # D major: sign-off lift

place(scratch(0.55, 1), 0.35, 0.22, -0.3)          # circle "Nobody"
place(scratch(0.45, 2), 1.0, 0.16, 0.4)            # (crickets)
place(scratch(0.22, 3), 2.45, 0.26, -0.1)          # strike 1
place(scratch(0.2, 4), 2.64, 0.26, 0.1)            # strike 2
place(whoosh(0.35, 500, 4000), 2.95, 0.18)         # hook exits
for i in range(18):                                 # letters set by hand
    place(tick(2000 + (i * 137) % 900), 3.15 + i * 0.034 * (0.8 + (i * 7 % 5) / 10), 0.05, (i % 5 - 2) / 4)
place(whoosh(0.5, 200, 2000), 4.3, 0.22, 0.4)       # card in the air
place(thud(110, 0.25, 0.6), 4.78, 0.25, 0.3)       # paper touches down
place(tick(1500), 5.3, 0.12, 0.3)                  # logo pops in
place(scratch(0.75, 5), 5.6, 0.18, -0.4)           # margin note
place(scratch(0.65, 6), 6.0, 0.16, 0.0)            # arrow
place(thud(62, 0.7, 0.9), 7.08, 0.85)              # LISTED stamp: the payoff
place(whoosh(0.8, 150, 2500), 9.25, 0.3, -0.3)     # page pulled away
for i in range(21):
    place(tick(2600 + (i * 211) % 800), 9.85 + i * 0.03, 0.04, (i % 3 - 1) / 3)
place(scratch(0.4, 7), 10.6, 0.16, 0.1)            # underline URL

mix = np.stack([L, R], 1)
mix -= mix.mean(0)
fade = np.minimum(1, (DUR - np.arange(N) / SR) / 0.6)[:, None]
mix *= fade
mix *= 0.89 / np.abs(mix).max()                     # ~ -1 dBFS peak
with wave.open(sys.argv[1], 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype('<i2').tobytes())
