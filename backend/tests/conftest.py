import uuid
from collections.abc import Generator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi import Header
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.deps.auth import CurrentUser, get_current_user
from app.main import app
from app.models.input import Input
from app.models.user import User

USER_A_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")  # matches the stub's fixed identity
USER_B_ID = uuid.UUID("00000000-0000-0000-0000-000000000002")

ALEMBIC_INI = Path(__file__).resolve().parent.parent / "alembic.ini"


def _ensure_database_exists(url: str) -> None:
    """Creates the target database if missing, via the server's 'postgres'
    maintenance DB — CREATE DATABASE can't run inside a transaction on the
    target DB itself."""
    target = make_url(url)
    dbname = target.database
    admin_engine = create_engine(target.set(database="postgres"), isolation_level="AUTOCOMMIT")
    try:
        with admin_engine.connect() as conn:
            exists = conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :name"), {"name": dbname}
            ).scalar()
            if not exists:
                conn.execute(text(f'CREATE DATABASE "{dbname}"'))
    finally:
        admin_engine.dispose()


@pytest.fixture(scope="session")
def test_engine() -> Generator[Engine, None, None]:
    """Engine bound to a dedicated stride_test database, created and migrated
    to head here — kept fully separate from the dev DB a live uvicorn writes
    to, so manual live-server seeding can never collide with test fixtures."""
    _ensure_database_exists(settings.test_database_url)

    cfg = Config(str(ALEMBIC_INI))
    cfg.set_main_option("sqlalchemy.url", settings.test_database_url)
    command.upgrade(cfg, "head")

    engine = create_engine(settings.test_database_url)
    yield engine
    engine.dispose()


@pytest.fixture()
def db(test_engine: Engine) -> Generator[Session, None, None]:
    """A session bound to a single connection/transaction, rolled back after each test."""
    connection = test_engine.connect()
    trans = connection.begin()
    session = Session(bind=connection)
    try:
        yield session
    finally:
        session.close()
        trans.rollback()
        connection.close()


@pytest.fixture()
def seed_users(db: Session) -> tuple[User, User]:
    user_a = User(id=USER_A_ID, email="a@example.com")
    user_b = User(id=USER_B_ID, email="b@example.com")
    db.add_all([user_a, user_b])
    db.flush()
    return user_a, user_b


@pytest.fixture()
def input_a(db: Session, seed_users: tuple[User, User]) -> Input:
    user_a, _ = seed_users
    inp = Input(user_id=user_a.id, name="Focussed Breathing")
    db.add(inp)
    db.flush()
    return inp


@pytest.fixture()
def input_b(db: Session, seed_users: tuple[User, User]) -> Input:
    _, user_b = seed_users
    inp = Input(user_id=user_b.id, name="Sleep")
    db.add(inp)
    db.flush()
    return inp


def _override_get_current_user(
    x_test_user_id: str | None = Header(default=None, alias="X-Test-User-Id"),
) -> CurrentUser:
    """Test-only stand-in for get_current_user. Identity is read per-request
    from a header set on each TestClient instance (below), not captured in a
    closure at fixture-setup time — app.dependency_overrides is a single dict
    shared by the whole `app` object, so two TestClients each binding their
    own closure here would silently clobber one another's override and both
    end up authenticated as whichever fixture initialized last."""
    user_id = uuid.UUID(x_test_user_id) if x_test_user_id else USER_A_ID
    return CurrentUser(user_id=user_id)


def _make_client(db: Session, current_user_id: uuid.UUID) -> TestClient:
    def override_get_db() -> Generator[Session, None, None]:
        yield db

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = _override_get_current_user

    test_client = TestClient(app)
    test_client.headers.update({"X-Test-User-Id": str(current_user_id)})
    return test_client


@pytest.fixture()
def client(db: Session, seed_users: tuple[User, User]) -> Generator[TestClient, None, None]:
    """Authenticated as User A — the default caller for most tests."""
    user_a, _ = seed_users
    test_client = _make_client(db, user_a.id)
    yield test_client
    app.dependency_overrides.clear()


@pytest.fixture()
def client_as_user_b(
    db: Session, seed_users: tuple[User, User]
) -> Generator[TestClient, None, None]:
    """Authenticated as User B — for seeding/asserting the cross-user side."""
    _, user_b = seed_users
    test_client = _make_client(db, user_b.id)
    yield test_client
    app.dependency_overrides.clear()
