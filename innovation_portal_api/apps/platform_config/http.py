"""Small HTTP helper for provider checks and sends.

Every outbound call goes through ``request``, so tests patch one function and never
touch the network.
"""

from __future__ import annotations

import base64
import json
import time
from dataclasses import dataclass, field
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

DEFAULT_TIMEOUT = 10


@dataclass
class HttpResult:
    status: int
    body: Any = None
    text: str = ""
    elapsed_ms: int = 0
    error: str = ""
    headers: dict = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        return 200 <= self.status < 300 and not self.error


def basic_auth(username: str, password: str) -> str:
    return "Basic " + base64.b64encode(f"{username}:{password}".encode()).decode()


def request(
    url: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    form: dict[str, Any] | None = None,
    json_body: Any = None,
    raw_body: str | bytes | None = None,
    timeout: int = DEFAULT_TIMEOUT,
) -> HttpResult:
    request_headers = {"Accept": "application/json", "User-Agent": "ceda-innovation-portal", **(headers or {})}
    data = None
    if form is not None:
        data = urlencode(form).encode()
        request_headers.setdefault("Content-Type", "application/x-www-form-urlencoded")
    elif json_body is not None:
        data = json.dumps(json_body).encode()
        request_headers.setdefault("Content-Type", "application/json")
    elif raw_body is not None:
        data = raw_body.encode() if isinstance(raw_body, str) else raw_body
    started = time.monotonic()
    try:
        with urlopen(Request(url, data=data, headers=request_headers, method=method.upper()), timeout=timeout) as response:
            text = response.read().decode("utf-8", errors="replace")
            status = response.status
            response_headers = dict(response.headers.items())
    except HTTPError as exc:
        text = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
        status = exc.code
        response_headers = dict(exc.headers.items()) if exc.headers else {}
    except (URLError, TimeoutError, OSError, ValueError) as exc:
        reason = getattr(exc, "reason", exc)
        return HttpResult(status=0, error=f"Could not reach the server: {reason}", elapsed_ms=int((time.monotonic() - started) * 1000))
    elapsed_ms = int((time.monotonic() - started) * 1000)
    try:
        body = json.loads(text) if text else None
    except ValueError:
        body = None
    return HttpResult(status=status, body=body, text=text[:2000], elapsed_ms=elapsed_ms, headers=response_headers)
