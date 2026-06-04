"""In-memory registry for background platform-login tasks (status polled by UI).

Tasks live in-process only; a sidecar restart loses them (publish-center is
real-time only, no persistence). The engine's run_login is imported lazily so
this module stays importable in the free build."""
from __future__ import annotations

import asyncio
import uuid
from typing import Optional


async def _run_login(platform: str, account: str) -> None:
    """Indirection point (patched in tests) -> the private engine login."""
    from beatos_publish.service import run_login
    await run_login(platform, account)


class LoginTask:
    def __init__(self, login_id: str, platform: str) -> None:
        self.login_id = login_id
        self.platform = platform
        self.status = "pending"  # pending | success | failed | timeout
        self.message = ""


class LoginRegistry:
    def __init__(self) -> None:
        self._tasks: dict[str, LoginTask] = {}
        self._active: set[str] = set()
        self._running: set = set()

    def is_active(self, platform: str) -> bool:
        return platform in self._active

    def start(self, platform: str, account: str) -> str:
        login_id = uuid.uuid4().hex
        self._tasks[login_id] = LoginTask(login_id, platform)
        self._active.add(platform)
        task = asyncio.create_task(self._drive(login_id, platform, account))
        self._running.add(task)
        task.add_done_callback(self._running.discard)
        return login_id

    async def _drive(self, login_id: str, platform: str, account: str) -> None:
        t = self._tasks[login_id]
        try:
            await _run_login(platform, account)
            t.status = "success"
        except Exception as e:  # noqa: BLE001
            t.status = "timeout" if "Timeout" in type(e).__name__ else "failed"
            t.message = str(e)
        finally:
            self._active.discard(platform)

    def get(self, login_id: str) -> Optional[LoginTask]:
        return self._tasks.get(login_id)


REGISTRY = LoginRegistry()
