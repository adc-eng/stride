from datetime import UTC, datetime, timedelta

from app.models.input import Input


def test_create_ignores_client_logged_at_and_stamps_server_time(client, input_a: Input):
    client_supplied_logged_at = (datetime.now(UTC) - timedelta(days=365)).isoformat()
    before = datetime.now(UTC)

    resp = client.post(
        f"/inputs/{input_a.id}/logs",
        json={
            "occurred_at": "2026-08-16T07:30:00Z",
            "logged_at": client_supplied_logged_at,
        },
    )
    after = datetime.now(UTC)

    assert resp.status_code == 201
    body = resp.json()
    server_logged_at = datetime.fromisoformat(body["logged_at"])
    assert before <= server_logged_at <= after
    assert server_logged_at.isoformat() != client_supplied_logged_at


def test_attributes_jsonb_round_trips_intact(client, input_a: Input):
    attributes = {"quality": 4, "notes": "slept well", "distance_miles": 2.5}

    resp = client.post(
        f"/inputs/{input_a.id}/logs",
        json={"occurred_at": "2026-08-16T07:30:00Z", "attributes": attributes},
    )

    assert resp.status_code == 201
    body = resp.json()
    assert body["attributes"] == attributes


def test_write_then_read_round_trip_succeeds_first_attempt(client, input_a: Input):
    """SC-001: a log written against the user's own input is visible, with its
    id, in a subsequent range read — on the first attempt, no retry."""
    occurred_at = datetime.now(UTC) - timedelta(days=1)

    create_resp = client.post(
        f"/inputs/{input_a.id}/logs",
        json={"value": 7.0, "occurred_at": occurred_at.isoformat()},
    )
    assert create_resp.status_code == 201
    created_id = create_resp.json()["id"]

    read_resp = client.get(f"/inputs/{input_a.id}/logs", params={"range": "7d"})
    assert read_resp.status_code == 200
    ids = {log["id"] for log in read_resp.json()}
    assert created_id in ids


def test_deleted_log_absent_from_all_subsequent_reads(client, input_a: Input):
    """SC-004: a deleted log is absent from every subsequent history read."""
    create_resp = client.post(
        f"/inputs/{input_a.id}/logs",
        json={"value": 1, "occurred_at": "2026-08-16T07:30:00Z"},
    )
    assert create_resp.status_code == 201
    log_id = create_resp.json()["id"]

    delete_resp = client.delete(f"/inputs/{input_a.id}/logs/{log_id}")
    assert delete_resp.status_code == 204

    for range_str in ("1d", "7d", "30d", "3650d"):
        read_resp = client.get(f"/inputs/{input_a.id}/logs", params={"range": range_str})
        assert read_resp.status_code == 200
        ids = {log["id"] for log in read_resp.json()}
        assert log_id not in ids
