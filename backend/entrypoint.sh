#!/bin/sh
set -e

echo "Waiting for database..."
python -c "
import time
from sqlalchemy import create_engine, text
from app.config import settings

for attempt in range(60):
    try:
        engine = create_engine(settings.database_url)
        with engine.connect() as conn:
            conn.execute(text('SELECT 1'))
        print('Database is ready.')
        break
    except Exception as exc:
        print(f'DB not ready yet ({exc.__class__.__name__}), retrying...')
        time.sleep(2)
else:
    raise SystemExit('Database never became ready')
"

echo "Running migrations..."
alembic upgrade head

if [ "${SEED_ON_START:-true}" = "true" ]; then
    echo "Seeding demo data (no-op if already seeded)..."
    python -m app.seed.run_seed
fi

echo "Starting API server..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
