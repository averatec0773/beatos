import pytest
import mcp.types as types

from beatos_mcp.proxy import (
    DEGRADED_TOOL,
    SessionHolder,
    UpstreamConnector,
    UpstreamUnavailable,
    build_server,
    call_tool_payload,
    list_tools_payload,
)


class FakeConn(UpstreamConnector):
    """Test double: `tools=None` means the sidecar is offline."""

    def __init__(self, tools=None, results=None):
        self._tools = tools
        self._results = results or {}

    async def fetch_tools(self):
        return self._tools

    async def call(self, name, arguments):
        if self._tools is None:
            raise UpstreamUnavailable("offline")
        return self._results[name]


@pytest.mark.asyncio
async def test_list_tools_offline_returns_status_only():
    tools = await list_tools_payload(FakeConn(tools=None))
    assert [t.name for t in tools] == ["beatos_status"]
    assert tools[0] is DEGRADED_TOOL


@pytest.mark.asyncio
async def test_list_tools_online_forwards():
    real = [types.Tool(name="ping", description="", inputSchema={"type": "object"})]
    tools = await list_tools_payload(FakeConn(tools=real))
    assert [t.name for t in tools] == ["ping"]


@pytest.mark.asyncio
async def test_call_status_when_offline_is_helpful():
    res = await call_tool_payload(FakeConn(tools=None), "beatos_status", {})
    assert res.isError is False
    assert "not running" in res.content[0].text.lower()


@pytest.mark.asyncio
async def test_call_status_when_online_reports_running():
    res = await call_tool_payload(FakeConn(tools={"ping"}), "beatos_status", {})
    assert res.isError is False
    assert "running" in res.content[0].text.lower()


@pytest.mark.asyncio
async def test_call_real_tool_offline_returns_error():
    res = await call_tool_payload(FakeConn(tools=None), "ping", {})
    assert res.isError is True
    assert "beatos" in res.content[0].text.lower()


@pytest.mark.asyncio
async def test_call_real_tool_online_forwards():
    ok = types.CallToolResult(
        content=[types.TextContent(type="text", text="pong")], isError=False
    )
    conn = FakeConn(tools={"ping"}, results={"ping": ok})
    res = await call_tool_payload(conn, "ping", {})
    assert res.content[0].text == "pong"


def test_build_server_registers_handlers():
    from mcp.types import CallToolRequest, ListToolsRequest

    holder = SessionHolder()
    server = build_server(FakeConn(tools=None), holder)
    assert ListToolsRequest in server.request_handlers
    assert CallToolRequest in server.request_handlers
    assert holder.session is None


@pytest.mark.asyncio
async def test_connector_offline_returns_none_and_raises():
    conn = UpstreamConnector(lambda: None)  # discover() -> None == sidecar offline
    assert await conn.fetch_tools() is None
    with pytest.raises(UpstreamUnavailable):
        await conn.call("ping", {})


class _Stop(Exception):
    pass


@pytest.mark.asyncio
async def test_poller_fires_on_transition_only():
    from beatos_mcp.proxy import poll_availability

    seq = iter([False, False, True, True, False])  # then StopIteration -> _Stop

    def probe():
        try:
            return next(seq)
        except StopIteration:
            raise _Stop()

    calls = []

    async def on_change(online):
        calls.append(online)

    async def noop_sleep(_):
        return None

    with pytest.raises(_Stop):
        await poll_availability(probe, on_change, interval=0, _sleep=noop_sleep)

    # Only the two flips (offline->online, online->offline) fire — not every tick.
    assert calls == [True, False]


@pytest.mark.asyncio
async def test_on_change_notifies_only_when_session_present():
    from beatos_mcp.proxy import make_on_change

    sent = []

    class FakeSession:
        async def send_tool_list_changed(self):
            sent.append(True)

    holder = SessionHolder()
    on_change = make_on_change(holder)

    await on_change(True)  # no session captured yet -> no crash, no notification
    assert sent == []

    holder.session = FakeSession()
    await on_change(False)
    assert sent == [True]
