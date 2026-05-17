import numpy as np
import soundfile as sf

sr = 22050
duration = 4.0  # 4 sec
n = int(sr * duration)
t = np.linspace(0, duration, n)

# Click track at 120 BPM = 2 Hz beat
beat_period = 60.0 / 120.0  # 0.5 sec
click_signal = np.zeros(n)
for beat_t in np.arange(0, duration, beat_period):
    idx = int(beat_t * sr)
    click_signal[idx:idx+220] = np.sin(2 * np.pi * 1000 * t[:220])  # 1kHz click 10ms

# C major triad as harmonic backdrop: C4=261.63, E4=329.63, G4=392.00
chord = 0.1 * (np.sin(2*np.pi*261.63*t) + np.sin(2*np.pi*329.63*t) + np.sin(2*np.pi*392.00*t))

mix = (click_signal + chord) / np.max(np.abs(click_signal + chord))
sf.write("click_120bpm_c_major.wav", mix, sr)
print("Written click_120bpm_c_major.wav")
