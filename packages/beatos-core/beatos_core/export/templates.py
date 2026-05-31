from __future__ import annotations

import re

from beatos_core.models.track import Track

# Producer credit default is interpolated into beat_description's "Prod.{prod}".
DEFAULT_TEMPLATES: dict[str, str] = {
    "album_name": "{year} {title}",
    "free_prefix": "[FREE] ",
    "beat_name": '{free}"{title}" - {genre} TYPE BEAT',
    "beat_description": (
        "Prod.{prod}\n"
        "评论+关注+歌名后缀获取非商用使用权\n"
        "!非商用使用权仅允许本平台发歌，上传歌曲需要绑定25%播放收益分成!\n"
        "不允许: 发布其他音乐或短视频平台，以及拍摄MV, 演出等盈利行为\n"
        "如需完整使用权请进行购买，感谢支持！"
    ),
    "album_description": "{publish date} Prod.{prod}",
    "prod_separator": " x ",
}

_TOKEN_RE = re.compile(r"\{([\w ]+)\}")


def render_template(
    tmpl: str, track: Track, *, prod: str, year: int, publish_date: str, genre_zh: str, free: str = ""
) -> str:
    """Substitute {title}/{genre}/{year}/{publish date}/{prod}/{bpm}/{key}.

    Pure: no I/O. `genre_zh`/`year`/`publish_date`/`prod` are supplied by the
    caller. Token names are matched allowing internal spaces and trimmed before
    lookup (so `{publish date}` and `{ title }` both work). Unknown tokens are
    left verbatim; missing values render as empty string.
    """
    values: dict[str, str] = {
        "title": track.title or "",
        "genre": genre_zh or "",
        "year": str(year),
        "publish date": publish_date or "",
        "prod": prod or "",
        "bpm": str(track.bpm) if track.bpm is not None else "",
        "key": track.key_signature or "",
        "free": free,
    }

    def _sub(m: re.Match[str]) -> str:
        name = m.group(1).strip()
        return values[name] if name in values else m.group(0)

    return _TOKEN_RE.sub(_sub, tmpl)
