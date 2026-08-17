import uuid

from app.models.input import Input


def test_create_log_success_returns_id(client, input_a: Input):
    resp = client.post(
        f"/inputs/{input_a.id}/logs",
        json={
            "value": 7.0,
            "attributes": {"quality": 4},
            "occurred_at": "2026-08-16T07:30:00Z",
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body.get("id")
    assert body["value"] == 7.0
    assert body["attributes"] == {"quality": 4}
    assert body["occurred_at"].startswith("2026-08-16T07:30:00")
    assert "logged_at" in body


def test_create_log_optional_fields_omitted_still_succeeds(client, input_a: Input):
    resp = client.post(
        f"/inputs/{input_a.id}/logs",
        json={"occurred_at": "2026-08-16T07:30:00Z"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["value"] is None
    assert body["attributes"] is None


def test_create_log_missing_occurred_at_422(client, input_a: Input):
    resp = client.post(f"/inputs/{input_a.id}/logs", json={"value": 1})
    assert resp.status_code == 422


def test_create_log_nonexistent_input_404(client):
    resp = client.post(
        f"/inputs/{uuid.uuid4()}/logs",
        json={"occurred_at": "2026-08-16T07:30:00Z"},
    )
    assert resp.status_code == 404


def test_create_log_other_users_input_404_identical_to_nonexistent(
    client, input_b: Input
):
    """User A (the default `client` identity) may not log against User B's input,
    and the response must be indistinguishable from logging against a nonexistent input."""
    resp_other_user = client.post(
        f"/inputs/{input_b.id}/logs",
        json={"occurred_at": "2026-08-16T07:30:00Z"},
    )
    resp_nonexistent = client.post(
        f"/inputs/{uuid.uuid4()}/logs",
        json={"occurred_at": "2026-08-16T07:30:00Z"},
    )
    assert resp_other_user.status_code == 404
    assert resp_nonexistent.status_code == 404
    assert resp_other_user.json() == resp_nonexistent.json()
