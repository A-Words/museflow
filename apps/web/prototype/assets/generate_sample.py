import math, wave, struct
from pathlib import Path
# Original mathematical tone study, no sampled audio or human voice.
p = Path(__file__).parent / 'sample.wav'
sr = 22050
notes = [261.63,329.63,392,523.25,440,392,329.63,293.66]
with wave.open(str(p), 'wb') as w:
    w.setparams((1, 2, sr, 0, 'NONE', 'not compressed'))
    for i in range(sr * 8):
        t = i / sr
        u = t % 1
        f = notes[int(t)]
        envelope = min(u / .025, 1) * max(0, 1-u) ** 1.8
        v = .22 * envelope * (math.sin(2*math.pi*f*t)+.22*math.sin(4*math.pi*f*t))
        w.writeframesraw(struct.pack('<h', int(v * 32767)))
print(p)
