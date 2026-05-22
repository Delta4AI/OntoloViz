from fastapi.testclient import TestClient

from ontoloviz_server.main import app


def test_health_returns_ok():
    client = TestClient(app)
    res = client.get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert isinstance(body["version"], str)


def test_models_list_empty():
    client = TestClient(app)
    res = client.get("/api/models/")
    assert res.status_code == 200
    assert res.json() == {"providers": []}


def test_obo_fetch_missing_url_400():
    client = TestClient(app)
    res = client.get("/api/obo/fetch", params={"url": ""})
    assert res.status_code == 400
