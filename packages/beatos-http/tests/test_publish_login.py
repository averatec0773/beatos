import asyncio
import pytest
from beatos_http import publish_login


@pytest.mark.asyncio
async def test_login_registry_success(monkeypatch):
    reg = publish_login.LoginRegistry()
    started = asyncio.Event()
    async def fake_run_login(platform, account):
        started.set()
    monkeypatch.setattr(publish_login, "_run_login", fake_run_login)
    lid = reg.start("netease", "default")
    assert reg.is_active("netease") is True
    await asyncio.sleep(0)
    await started.wait()
    for _ in range(50):
        if reg.get(lid).status != "pending":
            break
        await asyncio.sleep(0.01)
    assert reg.get(lid).status == "success"
    assert reg.is_active("netease") is False


@pytest.mark.asyncio
async def test_login_registry_maps_timeout(monkeypatch):
    reg = publish_login.LoginRegistry()
    class FakeTimeout(Exception):
        pass
    FakeTimeout.__name__ = "TimeoutError"
    async def fake_run_login(platform, account):
        raise FakeTimeout("waited too long")
    monkeypatch.setattr(publish_login, "_run_login", fake_run_login)
    lid = reg.start("netease", "default")
    for _ in range(50):
        if reg.get(lid).status != "pending":
            break
        await asyncio.sleep(0.01)
    assert reg.get(lid).status == "timeout"
    assert reg.get(lid).message == "waited too long"


def test_get_unknown_returns_none():
    reg = publish_login.LoginRegistry()
    assert reg.get("nope") is None
