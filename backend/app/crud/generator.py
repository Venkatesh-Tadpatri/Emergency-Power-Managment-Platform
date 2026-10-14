from sqlalchemy.orm import Session

from app.models.generator import Generator
from app.schemas.generator import GeneratorCreate, GeneratorUpdate
from app.services.mqtt_topics import delete_device_topic, sync_device_topic


def list_generators(db: Session, panel_id: str | None = None) -> list[Generator]:
    q = db.query(Generator)
    if panel_id:
        q = q.filter(Generator.panel_id == panel_id)
    return q.order_by(Generator.name).all()


def get_generator(db: Session, generator_id: str) -> Generator | None:
    return db.get(Generator, generator_id)


def create_generator(db: Session, data: GeneratorCreate) -> Generator:
    generator = Generator(**data.model_dump())
    db.add(generator)
    db.flush()
    sync_device_topic(db, generator, "generator")
    db.commit()
    db.refresh(generator)
    return generator


def update_generator(db: Session, generator: Generator, data: GeneratorUpdate) -> Generator:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(generator, field, value)
    sync_device_topic(db, generator, "generator")
    db.commit()
    db.refresh(generator)
    return generator


def delete_generator(db: Session, generator: Generator) -> None:
    delete_device_topic(db, generator.id, "generator")
    db.delete(generator)
    db.commit()
