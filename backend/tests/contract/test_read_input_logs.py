import uuid
from datetime import UTC, datetime, timedelta

from app.models.input import Input


def _iso(dt: datetime) -> str:
    # Always explicit-UTC (never naive) so the client-supplied occurred_at and
    # the server's range-cutoff computation compare as the same instant
    # regardless of the server process's local timezone.
    return dt.isoformat()


def _seed_log(client, input_id: uuid.UUID, occurred_at: datetime) -> dict:
    resp = client.post(
        f"/inputs/{input_id}/logs",
        json={"value": 1, "occurred_at": _iso(occurred_at)},
    )
    assert resp.status_code == 201
    return resp.json()


def test_read_returns_only_logs_in_range_with_id(client, input_a: Input):
    now = datetime.now(UTC)
    in_range = _seed_log(client, input_a.id, now - timedelta(days=3))
    _seed_log(client, input_a.id, now - timedelta(days=40))  # outside 7d range

    resp = client.get(f"/inputs/{input_a.id}/logs", params={"range": "7d"})

    assert resp.status_code == 200
    body = resp.json()
    ids = {log["id"] for log in body}
    assert ids == {in_range["id"]}


def test_read_empty_range_returns_empty_list_not_error(client, input_a: Input):
    now = datetime.now(UTC)
    _seed_log(client, input_a.id, now - timedelta(days=40))  # outside any small range

    resp = client.get(f"/inputs/{input_a.id}/logs", params={"range": "1d"})

    assert resp.status_code == 200
    assert resp.json() == []


def test_read_never_includes_other_users_logs(
    client, client_as_user_b, input_a: Input, input_b: Input
):
    now = datetime.now(UTC)
    _seed_log(client, input_a.id, now - timedelta(days=1))
    other_log = _seed_log(client_as_user_b, input_b.id, now - timedelta(days=1))

    resp = client.get(f"/inputs/{input_a.id}/logs", params={"range": "7d"})

    assert resp.status_code == 200
    ids = {log["id"] for log in resp.json()}
    assert other_log["id"] not in ids


def test_read_nonexistent_or_other_users_input_404(client, input_b: Input):
    resp_other_user = client.get(f"/inputs/{input_b.id}/logs", params={"range": "7d"})
    resp_nonexistent = client.get(f"/inputs/{uuid.uuid4()}/logs", params={"range": "7d"})

    assert resp_other_user.status_code == 404
    assert resp_nonexistent.status_code == 404
    assert resp_other_user.json() == resp_nonexistent.json()
