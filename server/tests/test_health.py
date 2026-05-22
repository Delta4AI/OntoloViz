from fastapi.testclient import TestClient

from ontoloviz_server.main import app


def test_health_returns_ok():
    client = TestClient(app)
    res = client.get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert isinstance(body["version"], str)


# `/api/models/` and `/api/obo/fetch` are covered in test_models.py and
# test_obo_endpoints.py respectively.
