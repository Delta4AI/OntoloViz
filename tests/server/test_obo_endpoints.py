"""Integration tests for the OBO endpoints.

Parser correctness is covered in test_obo_parser.py — here we focus on the
HTTP surface: status codes, request validation, and that the route actually
goes through the parser.
"""

from __future__ import annotations

import httpx
import pytest
from fastapi.testclient import TestClient

from ontoloviz_server.main import app

SAMPLE_OBO = """format-version: 1.4

[Term]
id: X:1
name: Root

[Term]
id: X:2
name: Child
is_a: X:1
"""


def test_parse_returns_ontology() -> None:
    client = TestClient(app)
    res = client.post("/api/obo/parse", json={"text": SAMPLE_OBO})
    assert res.status_code == 200
    body = res.json()
    assert body["format"] == "parent-based"
    assert body["nodeCount"] == 2
    assert "X:1" in body["subtrees"]


def test_parse_rejects_empty_body() -> None:
    client = TestClient(app)
    res = client.post("/api/obo/parse", json={"text": "   \n  "})
    assert res.status_code == 400


def test_fetch_missing_url_400() -> None:
    client = TestClient(app)
    res = client.get("/api/obo/fetch", params={"url": ""})
    assert res.status_code == 400


def test_fetch_rejects_non_http_scheme() -> None:
    client = TestClient(app)
    res = client.get("/api/obo/fetch", params={"url": "file:///etc/passwd"})
    assert res.status_code == 400


def test_fetch_uses_parser(monkeypatch: pytest.MonkeyPatch) -> None:
    """Patch httpx.AsyncClient.get to return a canned OBO body."""

    class _DummyResponse:
        def __init__(self) -> None:
            self.status_code = 200
            self.content = SAMPLE_OBO.encode("utf-8")

    async def _fake_get(self, _url):  # type: ignore[no-untyped-def]
        return _DummyResponse()

    monkeypatch.setattr(httpx.AsyncClient, "get", _fake_get)

    client = TestClient(app)
    res = client.get("/api/obo/fetch", params={"url": "https://example.com/x.obo"})
    assert res.status_code == 200
    assert res.json()["nodeCount"] == 2


def test_fetch_upstream_failure_returns_502(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_get(self, _url):  # type: ignore[no-untyped-def]
        raise httpx.ConnectError("boom")

    monkeypatch.setattr(httpx.AsyncClient, "get", _fake_get)

    client = TestClient(app)
    res = client.get("/api/obo/fetch", params={"url": "https://example.com/x.obo"})
    assert res.status_code == 502
