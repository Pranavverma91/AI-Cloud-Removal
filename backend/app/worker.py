from celery import Celery

from .config import settings

celery = Celery("space_eye", broker=settings().redis_url, backend=settings().redis_url)
celery.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    broker_connection_retry_on_startup=True,
)


@celery.task(name="space_eye.process")
def process_job(analysis_id):
    from .services.pipeline import process

    process(analysis_id)
