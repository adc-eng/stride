import uuid

from app.models.input import Input


def _create_log(client, input_id: uuid.UUID) -> str:
    resp = client.post(
        f"/inputs/{input_id}/logs",
        json={"value": 1, "occurred_at": "2026-08-16T07:30:00Z"},
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def test_delete_existing_log_returns_204(client, input_a: Input):
    log_id = _create_log(client, input_a.id)

    resp = client.delete(f"/inputs/{input_a.id}/logs/{log_id}")

    assert resp.status_code == 204
    assert resp.content == b""


def test_delete_nonexistent_log_404(client, input_a: Input):
    resp = client.delete(f"/inputs/{input_a.id}/logs/{uuid.uuid4()}")
    assert resp.status_code == 404


def test_delete_other_users_log_404(client, client_as_user_b, input_b: Input):
    """User A (default `client`) may not delete a log belonging to User B's
    input, and must be rejected identically to a nonexistent log."""
    other_log_id = _create_log(client_as_user_b, input_b.id)

    resp_other_user = client.delete(f"/inputs/{input_b.id}/logs/{other_log_id}")
    resp_nonexistent = client.delete(f"/inputs/{uuid.uuid4()}/logs/{uuid.uuid4()}")

    assert resp_other_user.status_code == 404
    assert resp_nonexistent.status_code == 404
    assert resp_other_user.json() == resp_nonexistent.json()


def test_delete_already_deleted_log_404_not_idempotent_success(client, input_a: Input):
    log_id = _create_log(client, input_a.id)

    first = client.delete(f"/inputs/{input_a.id}/logs/{log_id}")
    second = client.delete(f"/inputs/{input_a.id}/logs/{log_id}")

    assert first.status_code == 204
    assert second.status_code == 404
