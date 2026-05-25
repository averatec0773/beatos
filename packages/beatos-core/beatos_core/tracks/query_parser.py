"""Pure query-string parser shared by the HTTP route and the MCP search tool.

Turns a search string like `genre:trap bpm:>140 "young chop" dark` into a
FilterSpec. No web / DB / IO deps — pure logic (CLAUDE.md rule #2).
"""
from __future__ import annotations

import re
import shlex
from dataclasses import dataclass, field


@dataclass(eq=True)
class FilterSpec:
    producers: list[str] = field(default_factory=list)
    genres: list[str] = field(default_factory=list)
    moods: list[str] = field(default_factory=list)
    keys: list[str] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    bpm_min: int | None = None
    bpm_max: int | None = None
    has_audio: bool | None = None
    text: list[str] = field(default_factory=list)


_FIELD_TO_ATTR = {
    "producer": "producers",
    "genre": "genres",
    "mood": "moods",
    "key": "keys",
    "tag": "tags",
}

_BPM_RANGE = re.compile(r"^(\d+)-(\d+)$")
_BPM_OP = re.compile(r"^(>=|<=|>|<)(\d+)$")


def _apply_bpm(spec: FilterSpec, value: str) -> None:
    m = _BPM_RANGE.match(value)
    if m:
        spec.bpm_min, spec.bpm_max = int(m.group(1)), int(m.group(2))
        return
    m = _BPM_OP.match(value)
    if m:
        op, num = m.group(1), int(m.group(2))
        if op == ">":
            spec.bpm_min = num + 1
        elif op == ">=":
            spec.bpm_min = num
        elif op == "<":
            spec.bpm_max = num - 1
        elif op == "<=":
            spec.bpm_max = num
        return
    if value.isdigit():
        spec.bpm_min = spec.bpm_max = int(value)
        return
    spec.text.append(f"bpm:{value}")


def parse_query(s: str) -> FilterSpec:
    spec = FilterSpec()
    if not s or not s.strip():
        return spec
    try:
        tokens = shlex.split(s)
    except ValueError:
        tokens = s.split()
    for tok in tokens:
        if ":" in tok:
            raw_field, value = tok.split(":", 1)
            key = raw_field.lower()
            if value == "":
                spec.text.append(tok)
                continue
            if key in _FIELD_TO_ATTR:
                getattr(spec, _FIELD_TO_ATTR[key]).append(value)
                continue
            if key == "bpm":
                _apply_bpm(spec, value)
                continue
            if key == "has":
                if value.lower() == "audio":
                    spec.has_audio = True
                    continue
                spec.text.append(tok)
                continue
            spec.text.append(tok)
        else:
            spec.text.append(tok)
    return spec
