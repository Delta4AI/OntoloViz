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
from ontoloviz_server.routers import obo as obo_router


@pytest.fixture(autouse=True)
def _clear_obo_cache() -> None:
    """Cache leaks between tests would make ordering-dependent flakes."""
    obo_router._reset_cache()

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


# ---------------------------------------------------------------------------
# Per-ontology root override flows through both endpoints.
# ---------------------------------------------------------------------------

_HPO_LIKE_BODY = """[Term]
id: HP:0000001
name: All

[Term]
id: HP:0000118
name: Phenotypic abnormality
is_a: HP:0000001

[Term]
id: HP:0000478
name: Abnormality of the eye
is_a: HP:0000118

[Term]
id: HP:0000707
name: Abnormality of the nervous system
is_a: HP:0000118
"""


def test_parse_honours_root_id_alias() -> None:
    client = TestClient(app)
    res = client.post(
        "/api/obo/parse",
        json={"text": _HPO_LIKE_BODY, "rootId": "HP:0000118"},
    )
    assert res.status_code == 200
    body = res.json()
    # Two phenotype-system roots instead of the single HP:0000001 structural root.
    assert set(body["subtrees"].keys()) == {"HP:0000478", "HP:0000707"}


def test_parse_honours_min_node_size() -> None:
    client = TestClient(app)
    res = client.post(
        "/api/obo/parse",
        json={"text": _HPO_LIKE_BODY, "rootId": "HP:0000118", "minNodeSize": 2},
    )
    assert res.status_code == 200
    # Both phenotype-system subtrees have a single node, so both get dropped.
    assert res.json()["subtrees"] == {}


def test_fetch_caches_repeated_calls(monkeypatch: pytest.MonkeyPatch) -> None:
    """A second fetch with the same (url, rootId, minNodeSize) skips the network."""

    calls = {"count": 0}

    class _DummyResponse:
        def __init__(self) -> None:
            self.status_code = 200
            self.content = SAMPLE_OBO.encode("utf-8")

    async def _fake_get(self, _url):  # type: ignore[no-untyped-def]
        calls["count"] += 1
        return _DummyResponse()

    monkeypatch.setattr(httpx.AsyncClient, "get", _fake_get)

    client = TestClient(app)
    url = "https://example.com/cached.obo"
    res1 = client.get("/api/obo/fetch", params={"url": url})
    res2 = client.get("/api/obo/fetch", params={"url": url})
    assert res1.status_code == 200
    assert res2.status_code == 200
    assert res1.json() == res2.json()
    assert calls["count"] == 1, "second call should hit the cache"


def test_fetch_cache_keyed_on_root_id(monkeypatch: pytest.MonkeyPatch) -> None:
    """Different overrides for the same URL must not collide in the cache."""

    calls = {"count": 0}

    class _DummyResponse:
        def __init__(self) -> None:
            self.status_code = 200
            self.content = SAMPLE_OBO.encode("utf-8")

    async def _fake_get(self, _url):  # type: ignore[no-untyped-def]
        calls["count"] += 1
        return _DummyResponse()

    monkeypatch.setattr(httpx.AsyncClient, "get", _fake_get)

    client = TestClient(app)
    url = "https://example.com/cached.obo"
    client.get("/api/obo/fetch", params={"url": url})
    client.get("/api/obo/fetch", params={"url": url, "rootId": "X:1"})
    assert calls["count"] == 2, "rootId variant must miss the cache"


def test_fetch_threads_root_id_query_param(monkeypatch: pytest.MonkeyPatch) -> None:
    class _DummyResponse:
        def __init__(self) -> None:
            self.status_code = 200
            self.content = _HPO_LIKE_BODY.encode("utf-8")

    async def _fake_get(self, _url):  # type: ignore[no-untyped-def]
        return _DummyResponse()

    monkeypatch.setattr(httpx.AsyncClient, "get", _fake_get)

    client = TestClient(app)
    res = client.get(
        "/api/obo/fetch",
        params={"url": "https://example.com/hp.obo", "rootId": "HP:0000118"},
    )
    assert res.status_code == 200
    assert set(res.json()["subtrees"].keys()) == {"HP:0000478", "HP:0000707"}
