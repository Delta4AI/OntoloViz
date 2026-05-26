"""Tests for the model adapter endpoints."""

from __future__ import annotations

from fastapi.testclient import TestClient

from ontoloviz_server.main import app


def test_list_providers_returns_empty_array() -> None:
    client = TestClient(app)
    res = client.get("/api/models/")
    assert res.status_code == 200
    assert res.json() == []


def test_predict_returns_501_when_no_providers() -> None:
    client = TestClient(app)
    res = client.post(
        "/api/models/predict",
        json={"providerId": "missing", "query": "anything", "limit": 10},
    )
    assert res.status_code == 501


def test_predict_validates_limit_bounds() -> None:
    client = TestClient(app)
    res = client.post(
        "/api/models/predict",
        json={"providerId": "p", "query": "q", "limit": 0},
    )
    assert res.status_code == 422
