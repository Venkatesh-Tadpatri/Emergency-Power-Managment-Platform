"""Entrypoint for `python -m app.seed.run_seed`, invoked by entrypoint.sh."""
from app.database import SessionLocal
from app.seed.seed_data import seed

if __name__ == "__main__":
    db = SessionLocal()
    try:
        seed(db)
    finally:
        db.close()
