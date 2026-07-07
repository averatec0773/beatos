"""Tests for mutagen-based audio metadata extraction."""
import wave


from beatos_core.assets.metadata import read_audio_metadata


def _make_wav(path, duration_seconds: float = 2.0, framerate: int = 44100) -> None:
    """Write a tiny valid PCM WAV to `path`."""
    nframes = int(duration_seconds * framerate)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(framerate)
        w.writeframes(b"\x00\x00" * nframes)


def test_read_metadata_returns_duration(tmp_path):
    file = tmp_path / "beat.wav"
    _make_wav(file, duration_seconds=3.5)

    meta = read_audio_metadata(file)

    assert meta is not None
    assert 3.3 < meta["duration_seconds"] < 3.7  # allow rounding


def test_read_metadata_returns_sample_rate(tmp_path):
    file = tmp_path / "beat.wav"
    _make_wav(file, framerate=48000)

    meta = read_audio_metadata(file)

    assert meta is not None
    assert meta["sample_rate"] == 48000


def test_read_metadata_returns_none_on_invalid_file(tmp_path):
    """Garbage in -> None out (do NOT raise)."""
    file = tmp_path / "junk.wav"
    file.write_bytes(b"this is not a wav header")

    meta = read_audio_metadata(file)

    assert meta is None
