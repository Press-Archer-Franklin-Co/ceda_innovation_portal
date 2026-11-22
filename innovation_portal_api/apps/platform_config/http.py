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
from urllib.parse import urlencode, urljoin, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener, urlopen

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


# --------------------------------------------------------------------------------------
# Binary downloads (C2: files people send on WhatsApp)
# --------------------------------------------------------------------------------------


@dataclass
class DownloadResult:
    ok: bool
    content: bytes = b""
    content_type: str = ""
    status: int = 0
    error: str = ""
    too_big: bool = False


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: D401 - urllib hook
        return None


def download(url: str, *, headers: dict[str, str] | None = None, max_bytes: int, timeout: int = 8, max_redirects: int = 3) -> DownloadResult:
    """GET a file, following redirects ourselves so the Authorization header is dropped when the
    host changes (a provider's media link often redirects to signed storage that refuses it).
    Stops reading past ``max_bytes`` and reports ``too_big``."""
    opener = build_opener(_NoRedirect)
    current, current_headers = url, {"User-Agent": "ceda-innovation-portal", **(headers or {})}
    for _ in range(max_redirects + 1):
        try:
            response = opener.open(Request(current, headers=current_headers, method="GET"), timeout=timeout)
        except HTTPError as exc:
            if exc.code in (301, 302, 303, 307, 308) and exc.headers.get("Location"):
                target = urljoin(current, exc.headers["Location"])
                if urlparse(target).netloc != urlparse(current).netloc:
                    current_headers = {k: v for k, v in current_headers.items() if k.lower() != "authorization"}
                current = target
                continue
            return DownloadResult(False, status=exc.code, error=f"The provider answered with HTTP {exc.code}.")
        except (URLError, TimeoutError, OSError, ValueError) as exc:
            return DownloadResult(False, error=f"Could not reach the provider: {getattr(exc, 'reason', exc)}")
        with response:
            declared = response.headers.get("Content-Length")
            if declared and declared.isdigit() and int(declared) > max_bytes:
                return DownloadResult(False, status=response.status, too_big=True, error="The file is larger than allowed.")
            content = response.read(max_bytes + 1)
            if len(content) > max_bytes:
                return DownloadResult(False, status=response.status, too_big=True, error="The file is larger than allowed.")
            return DownloadResult(True, content=content, content_type=(response.headers.get("Content-Type") or "").split(";")[0].strip(), status=response.status)
    return DownloadResult(False, error="Too many redirects.")
