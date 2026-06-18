import aiosqlite
import pytest

from beatos_core.approvals import (
    ApplyHandlerNotFound,
    RowVanishedError,
    apply,
    register_apply_handler,
)


@pytest.mark.asyncio
async def test_apply_dispatches_payload(tmp_path):
    @register_apply_handler("__t_echo__")
    async def _h(conn, payload):
        return {"echo": payload["x"]}

    async with aiosqlite.connect(tmp_path / "x.db") as c:
        out = await apply(c, "__t_echo__", {"x": 7})
        assert out["echo"] == 7


@pytest.mark.asyncio
async def test_apply_unknown_tool_raises(tmp_path):
    async with aiosqlite.connect(tmp_path / "x.db") as c:
        with pytest.raises(ApplyHandlerNotFound):
            await apply(c, "__missing__", {})


def test_row_vanished_error_is_exported():
    # Handlers import RowVanishedError from approvals after the two_phase removal.
    assert issubclass(RowVanishedError, Exception)
