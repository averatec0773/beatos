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
async def test_call_status_when_online_reports_running_with_count():
    two = [
        types.Tool(name=n, description="", inputSchema={"type": "object"})
        for n in ("ping", "list_tracks")
    ]
    res = await call_tool_payload(FakeConn(tools=two), "beatos_status", {})
    assert res.isError is False
    text = res.content[0].text.lower()
    assert "running" in text and "2 tools" in text


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
async def test_poller_retries_deferred_then_dedupes():
    """A change observed before the session exists (notify returns False) is
    retried on later ticks, not lost; a successfully-notified state isn't resent."""
    from beatos_mcp.proxy import poll_availability

    seq = iter([True, True, True, False, False])  # then StopIteration -> _Stop
    sent = []
    defer = {"n": 2}  # the first two notify attempts have no session yet

    async def notify(online):
        if defer["n"] > 0:
            defer["n"] -= 1
            return False  # deferred — session not captured yet
        sent.append(online)
        return True

    def probe():
        try:
            return next(seq)
        except StopIteration:
            raise _Stop()

    async def noop_sleep(_):
        return None

    with pytest.raises(_Stop):
        await poll_availability(probe, notify, interval=0, _sleep=noop_sleep)

    # online deferred twice then delivered once; offline delivered once; the second
    # offline tick is deduped.
    assert sent == [True, False]


@pytest.mark.asyncio
async def test_notifier_defers_without_session_and_sends_with():
    from beatos_mcp.proxy import make_notifier

    sent = []

    class FakeSession:
        async def send_tool_list_changed(self):
            sent.append(True)

    holder = SessionHolder()
    notify = make_notifier(holder)

    assert await notify(True) is False  # no session captured yet -> deferred
    assert sent == []

    holder.session = FakeSession()
    assert await notify(False) is True  # session present -> sent
    assert sent == [True]


# --- last-good cache + retry (the anti-flap fix) ---

class _SidecarStub:
    url = "http://127.0.0.1:1/mcp"
    token = None


class _ScriptedConnector(UpstreamConnector):
    """Drives `_list_once` from a script of return-values/exceptions."""

    def __init__(self, target, script):
        super().__init__(lambda: target)
        self._script = list(script)
        self.calls = 0

    async def _list_once(self, target):
        self.calls += 1
        item = self._script.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


@pytest.fixture(autouse=True)
def _no_retry_delay(monkeypatch):
    import beatos_mcp.proxy as p

    monkeypatch.setattr(p, "_RETRY_DELAY", 0)


@pytest.mark.asyncio
async def test_fetch_tools_retries_transient_then_succeeds():
    real = [types.Tool(name="ping", description="", inputSchema={"type": "object"})]
    conn = _ScriptedConnector(_SidecarStub(), [RuntimeError("x"), RuntimeError("x"), real])
    tools = await conn.fetch_tools()
    assert [t.name for t in tools] == ["ping"]
    assert conn.calls == 3  # retried twice before succeeding


@pytest.mark.asyncio
async def test_fetch_tools_returns_last_good_on_persistent_failure():
    real = [types.Tool(name="ping", description="", inputSchema={"type": "object"})]
    # one success (populates cache), then enough failures to exhaust a 2nd fetch
    conn = _ScriptedConnector(
        _SidecarStub(), [real, RuntimeError("down"), RuntimeError("down"), RuntimeError("down")]
    )
    assert [t.name for t in await conn.fetch_tools()] == ["ping"]  # cache populated
    again = await conn.fetch_tools()  # all attempts fail -> last-good, NOT degraded
    assert [t.name for t in again] == ["ping"]


@pytest.mark.asyncio
async def test_fetch_tools_offline_clears_cache_and_degrades():
    real = [types.Tool(name="ping", description="", inputSchema={"type": "object"})]
    target = {"t": _SidecarStub()}
    conn = _ScriptedConnector(target["t"], [real])
    conn._discover = lambda: target["t"]
    assert await conn.fetch_tools() is not None  # caches
    target["t"] = None  # sidecar genuinely offline
    assert await conn.fetch_tools() is None  # degrade
    assert conn._cached_tools is None  # cache dropped (no stale tools while offline)
