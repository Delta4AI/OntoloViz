"""Integration tests for the ontology handoff endpoints.

Covers the HTTP surface: store-and-retrieve round trip, schema validation,
404 on unknown/expired ids, TTL expiry, and LRU eviction past the cap.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from ontoloviz_server.main import app
from ontoloviz_server.routers import ontology as ontology_router

SAMPLE_ONTOLOGY = {
    "format": "parent-based",
    "countLabel": "Counts",
    "subtrees": {
        "root1": {
            "rootId": "root1",
            "nodes": {
                "root1": {
                    "id": "root1",
                    "parent": "",
                    "label": "Root",
                    "count": 0,
                    "level": 0,
                },
                "child1": {
                    "id": "child1",
                    "parent": "root1",
                    "label": "Child A",
                    "count": 12,
                    "level": 1,
                },
            },
        }
    },
    "nodeCount": 2,
    "warnings": [],
}


@pytest.fixture(autouse=True)
def _clear_store() -> Iterator[None]:
    """Pending handoffs leaking between tests would cause ordering flakes."""
    ontology_router._reset_store()
    yield
    ontology_router._reset_store()


def test_post_returns_handoff_id() -> None:
    client = TestClient(app)
    res = client.post("/api/ontology", json=SAMPLE_ONTOLOGY)
    assert res.status_code == 200
    handoff_id = res.json()["id"]
    assert isinstance(handoff_id, str)
    assert handoff_id


def test_round_trip_preserves_payload() -> None:
    client = TestClient(app)
    handoff_id = client.post("/api/ontology", json=SAMPLE_ONTOLOGY).json()["id"]

    res = client.get(f"/api/ontology/{handoff_id}")
    assert res.status_code == 200
    body = res.json()
    assert body["nodeCount"] == 2
    assert body["format"] == "parent-based"
    assert body["subtrees"]["root1"]["nodes"]["child1"]["count"] == 12


def test_get_unknown_session_returns_404() -> None:
    client = TestClient(app)
    res = client.get("/api/ontology/does-not-exist")
    assert res.status_code == 404


def test_post_rejects_invalid_schema() -> None:
    client = TestClient(app)
    # Missing required `subtrees` and `nodeCount`.
    res = client.post("/api/ontology", json={"format": "parent-based"})
    assert res.status_code == 422


def test_expired_session_returns_404(monkeypatch: pytest.MonkeyPatch) -> None:
    client = TestClient(app)
    handoff_id = client.post("/api/ontology", json=SAMPLE_ONTOLOGY).json()["id"]

    # Fast-forward the clock past the TTL by patching the router's monotonic().
    base = ontology_router.monotonic()
    monkeypatch.setattr(
        ontology_router,
        "monotonic",
        lambda: base + ontology_router._SESSION_TTL_SECONDS + 1,
    )
    res = client.get(f"/api/ontology/{handoff_id}")
    assert res.status_code == 404


def test_lru_eviction_past_max_sessions() -> None:
    client = TestClient(app)
    ids = [
        client.post("/api/ontology", json=SAMPLE_ONTOLOGY).json()["id"]
        for _ in range(ontology_router._MAX_SESSIONS + 3)
    ]

    # The three oldest handoffs are evicted once the cap is exceeded.
    for stale_id in ids[:3]:
        assert client.get(f"/api/ontology/{stale_id}").status_code == 404
    # The most recent handoff is still retrievable.
    assert client.get(f"/api/ontology/{ids[-1]}").status_code == 200
