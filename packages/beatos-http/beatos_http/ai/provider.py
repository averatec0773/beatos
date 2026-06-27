"""AI provider abstraction for in-app tagging (EPIC-D4).

This defines only the interface + result shape so the rest of D4 (Settings UI,
suggest-tags route) can build against a stable seam. The concrete cloud provider
(Anthropic) and its actual network call land in a later sub-task, gated on the
runtime-dependency + privacy checkpoint.

beatos-core has no web/RPC deps (rule 2), so providers live here in beatos-http.
"""
from __future__ import annotations

from typing import Protocol, runtime_checkable

from pydantic import BaseModel, Field


class TagSuggestion(BaseModel):
    """A provider's proposed metadata for a track. All fields optional so a
    provider can return only what it is confident about; the user reviews and
    edits before anything is written."""

    genre: list[str] = Field(default_factory=list)
    mood: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    description: str | None = None


class ToolUse(BaseModel):
    """One tool call the model wants to make."""

    id: str
    name: str
    input: dict = Field(default_factory=dict)


class ChatTurn(BaseModel):
    """One assistant turn: its text, any tool calls, and why it stopped."""

    stop_reason: str
    text: str = ""
    tool_uses: list[ToolUse] = Field(default_factory=list)


@runtime_checkable
class AIProvider(Protocol):
    """A tagging provider. `name` matches the `ai_provider` setting value."""

    name: str

    async def suggest_tags(
        self,
        *,
        title: str,
        cover_png: bytes | None,
        existing: dict,
    ) -> TagSuggestion:
        """Propose genre / mood / tags / description from a track's title,
        optional cover image, and existing fields. Implementations must never
        log the API key or the raw response verbatim."""
        ...

    async def run_chat(self, *, messages: list[dict], tools: list[dict]) -> "ChatTurn":
        """Run one non-streaming chat turn with tool-use. `messages` is the
        Anthropic message history; `tools` is the tool-definition array. Returns
        the assistant text + any tool calls + stop reason. Never logs the key."""
        ...
