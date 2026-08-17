import uuid

from app.models.input import Input


def test_uniform_404_and_zero_cross_user_leakage_across_all_endpoints(
    client, client_as_user_b, input_a: Input, input_b: Input
):
    """SC-002: 0% of one user's attempts ever return/modify/remove another
    user's log data. SC-003: nonexistent and cross-user targets are
    indistinguishable (identical 404) across create, read, and delete."""
    random_input_id = uuid.uuid4()
    random_log_id = uuid.uuid4()

    # User B owns a real log on their own input — the target user A will
    # repeatedly, and always unsuccessfully, try to reach.
    seed_resp = client_as_user_b.post(
        f"/inputs/{input_b.id}/logs",
        json={"value": 1, "occurred_at": "2026-08-16T07:30:00Z"},
    )
    assert seed_resp.status_code == 201
    other_log_id = seed_resp.json()["id"]

    # --- create: cross-user vs nonexistent target, identical 404 ---
    create_cross = client.post(
        f"/inputs/{input_b.id}/logs",
        json={"occurred_at": "2026-08-16T07:30:00Z"},
    )
    create_missing = client.post(
        f"/inputs/{random_input_id}/logs",
        json={"occurred_at": "2026-08-16T07:30:00Z"},
    )
    assert create_cross.status_code == 404
    assert create_missing.status_code == 404
    assert create_cross.json() == create_missing.json()

    # --- read: cross-user vs nonexistent target, identical 404; no leakage ---
    read_cross = client.get(f"/inputs/{input_b.id}/logs", params={"range": "30d"})
    read_missing = client.get(f"/inputs/{random_input_id}/logs", params={"range": "30d"})
    assert read_cross.status_code == 404
    assert read_missing.status_code == 404
    assert read_cross.json() == read_missing.json()

    # User A's own read never contains User B's log id, even indirectly.
    own_read = client.get(f"/inputs/{input_a.id}/logs", params={"range": "30d"})
    assert own_read.status_code == 200
    assert other_log_id not in {log["id"] for log in own_read.json()}

    # --- delete: cross-user vs nonexistent target, identical 404 ---
    delete_cross = client.delete(f"/inputs/{input_b.id}/logs/{other_log_id}")
    delete_missing = client.delete(f"/inputs/{random_input_id}/logs/{random_log_id}")
    assert delete_cross.status_code == 404
    assert delete_missing.status_code == 404
    assert delete_cross.json() == delete_missing.json()

    # Zero leakage/modification: User B's log survived every attempt above.
    survivor_check = client_as_user_b.get(f"/inputs/{input_b.id}/logs", params={"range": "30d"})
    assert survivor_check.status_code == 200
    assert other_log_id in {log["id"] for log in survivor_check.json()}
