import os
import sys
import json
import gc
import time
import signal
import io
import threading
import tempfile
import pika
import psycopg2
import requests
from PIL import Image
from pathlib import Path
from urllib.parse import urlparse

Image.MAX_IMAGE_PIXELS = 20_000_000

# --------------------------------------------------
# WORKER PATH CONFIGURATION
# --------------------------------------------------

WORKER_DIR = Path(__file__).resolve().parent

if str(WORKER_DIR) not in sys.path:
    sys.path.insert(0, str(WORKER_DIR))

from src.models.yolo_engine import YoloGatekeeper
from src.models.gemini_analyzer import analyze_image_with_gemini


# --------------------------------------------------
# REQUIRED ENVIRONMENT VARIABLES
# --------------------------------------------------

RABBITMQ_URL = os.getenv("RABBITMQ_URL")
DATABASE_URL = os.getenv("DATABASE_URL")

if not RABBITMQ_URL:
    raise RuntimeError(
        "RABBITMQ_URL is missing from environment variables."
    )

if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is missing from environment variables."
    )


# --------------------------------------------------
# WORKER CONFIGURATION
# --------------------------------------------------

QUEUE_NAME = "yolo_processing_queue"
CASE_NOTIFICATION_QUEUE = "case_notification_queue"

MAX_RETRIES = 3

# AI assessment -> initial operational rescue priority.
# The highest signal from severity/urgency is used so an urgent/critical
# case is not accidentally placed in a low-priority rescue queue.
def derive_initial_priority(gemini_analysis):
    if not isinstance(gemini_analysis, dict):
        return "STANDARD"

    severity_priority = {
        "LOW": 0,
        "MODERATE": 1,
        "HIGH": 2,
        "CRITICAL": 3,
        "UNKNOWN": 1,
    }
    urgency_priority = {
        "ROUTINE": 0,
        "SOON": 1,
        "URGENT": 2,
        "EMERGENCY": 3,
        "UNKNOWN": 1,
    }
    priority_names = ["LOW", "STANDARD", "HIGH", "CRITICAL"]

    severity_score = severity_priority.get(
        str(gemini_analysis.get("severity", "UNKNOWN")).upper(), 1
    )
    urgency_score = urgency_priority.get(
        str(gemini_analysis.get("urgency", "UNKNOWN")).upper(), 1
    )

    return priority_names[max(severity_score, urgency_score)]


IMAGE_DOWNLOAD_TIMEOUT = 15

CLOUDINARY_DELIVERY_HOST = "res.cloudinary.com"
CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME")

if not CLOUDINARY_CLOUD_NAME:
    raise RuntimeError("CLOUDINARY_CLOUD_NAME is missing from environment variables.")

MAX_IMAGE_BYTES = 10 * 1024 * 1024

WORKER_SERVICE_NAME = "anirescue-ai-worker"
WORKER_HEARTBEAT_INTERVAL_SECONDS = 30


def write_worker_heartbeat(*, last_success=False, error=None):
    """Write worker health using a short-lived connection separate from job processing."""
    connection = None

    try:
        connection = psycopg2.connect(
            DATABASE_URL,
            connect_timeout=5,
        )

        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO worker_heartbeats
                    (service_name, last_seen_at, last_success_at, last_error_at, last_error, processed_count)
                VALUES (
                    %s,
                    CURRENT_TIMESTAMP,
                    CASE WHEN %s THEN CURRENT_TIMESTAMP ELSE NULL END,
                    CASE WHEN %s IS NULL THEN NULL ELSE CURRENT_TIMESTAMP END,
                    %s,
                    CASE WHEN %s THEN 1 ELSE 0 END
                )
                ON CONFLICT (service_name) DO UPDATE
                SET
                    last_seen_at = CURRENT_TIMESTAMP,
                    last_success_at =
                        CASE
                            WHEN EXCLUDED.last_success_at IS NOT NULL
                            THEN CURRENT_TIMESTAMP
                            ELSE worker_heartbeats.last_success_at
                        END,
                    last_error_at =
                        CASE
                            WHEN EXCLUDED.last_error_at IS NOT NULL
                            THEN CURRENT_TIMESTAMP
                            ELSE worker_heartbeats.last_error_at
                        END,
                    last_error =
                        CASE
                            WHEN EXCLUDED.last_error IS NOT NULL
                            THEN LEFT(EXCLUDED.last_error, 2000)
                            ELSE worker_heartbeats.last_error
                        END,
                    processed_count =
                        worker_heartbeats.processed_count + EXCLUDED.processed_count,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (
                    WORKER_SERVICE_NAME,
                    last_success,
                    error,
                    error,
                    last_success,
                ),
            )

        connection.commit()
    except Exception as heartbeat_error:
        print(
            f"⚠️ Worker heartbeat update failed: {heartbeat_error}"
        )
        if connection:
            try:
                connection.rollback()
            except Exception:
                pass
    finally:
        if connection:
            try:
                connection.close()
            except Exception:
                pass


def worker_heartbeat_loop(stop_event):
    while not stop_event.wait(WORKER_HEARTBEAT_INTERVAL_SECONDS):
        write_worker_heartbeat()


# --------------------------------------------------
# DATABASE CONNECTION
# --------------------------------------------------


def get_db_connection(existing_conn):
    """
    Reuse an existing PostgreSQL connection if it is healthy.
    Otherwise create a new connection.

    Neon pooled connections reject PostgreSQL startup parameters such
    as statement_timeout. Keep connection-level timeouts in psycopg2,
    then apply statement_timeout after the connection is established.
    """

    if existing_conn is not None and not existing_conn.closed:
        try:
            with existing_conn.cursor() as cur:
                cur.execute("SET statement_timeout = 10000")
                cur.execute("SELECT 1")

            return existing_conn

        except Exception as err:
            print(
                f"⚠️ Existing PostgreSQL connection is stale/unusable: {err}"
            )

            try:
                existing_conn.close()
            except Exception:
                pass

    connection = psycopg2.connect(
        DATABASE_URL,
        connect_timeout=10,
        keepalives=1,
        keepalives_idle=30,
        keepalives_interval=10,
        keepalives_count=3,
    )

    with connection.cursor() as cur:
        cur.execute("SET statement_timeout = 30000")

    return connection


# --------------------------------------------------
# CASE NOTIFICATION
# --------------------------------------------------


def publish_case_notification(
    channel,
    report_id,
    is_valid,
    species=None,
    processing_failed=False,
):
    payload = {
        "reportId": report_id,
        "validationPassed": is_valid,
        "species": species,
        "processingFailed": processing_failed,
    }

    channel.queue_declare(
        queue=CASE_NOTIFICATION_QUEUE,
        durable=True,
    )

    channel.basic_publish(
        exchange="",
        routing_key=CASE_NOTIFICATION_QUEUE,
        body=json.dumps(payload).encode(),
        properties=pika.BasicProperties(
            delivery_mode=2,
            content_type="application/json",
        ),
        mandatory=True,
    )

    print(
        f"📢 Case {report_id} notification event published: "
        f"{'PASSED' if is_valid else 'REJECTED'}"
    )

# --------------------------------------------------
# IMAGE DOWNLOAD
# --------------------------------------------------


def resolve_image_input(image_source):
    """
    Download a Cloudinary image URL and save it
    temporarily for YOLO processing.

    Only HTTP/HTTPS URLs are supported.
    """

    if not image_source:
        raise ValueError(
            "Image source is missing."
        )

    if not isinstance(image_source, str):
        raise ValueError(
            "Image source must be a string URL."
        )

    try:
        parsed_url = urlparse(image_source)
    except ValueError:
        raise ValueError(
            "Invalid image URL."
        )

    if parsed_url.scheme != "https":
        raise ValueError(
            "Only HTTPS Cloudinary image URLs are supported."
        )

    if parsed_url.hostname != CLOUDINARY_DELIVERY_HOST:
        raise ValueError(
            "Image URL must use the approved Cloudinary delivery host."
        )

    expected_prefix = f"/{CLOUDINARY_CLOUD_NAME}/"
    if not parsed_url.path.startswith(expected_prefix):
        raise ValueError(
            "Image URL does not belong to the approved Cloudinary cloud."
        )

    if parsed_url.username or parsed_url.password:
        raise ValueError(
            "Image URL credentials are not allowed."
        )

    temp_path = None

    try:
        headers = {
            "User-Agent": "AniRescueWorker/1.0"
        }

        response = requests.get(
            image_source,
            headers=headers,
            timeout=IMAGE_DOWNLOAD_TIMEOUT,
            allow_redirects=False,
        )

        response.raise_for_status()

        content_length = response.headers.get("Content-Length")
        if content_length and int(content_length) > MAX_IMAGE_BYTES:
            raise ValueError("Downloaded image exceeds the 10 MB processing limit.")

        if len(response.content) > MAX_IMAGE_BYTES:
            raise ValueError("Downloaded image exceeds the 10 MB processing limit.")

        # Convert downloaded image to RGB JPEG.
        # This also normalizes formats such as PNG/WebP.
        img = Image.open(
            io.BytesIO(response.content)
        ).convert("RGB")

        temp_file = tempfile.NamedTemporaryFile(
            suffix=".jpg",
            delete=False
        )

        temp_path = temp_file.name
        temp_file.close()

        img.save(
            temp_path,
            format="JPEG"
        )

        return temp_path

    except Exception as err:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass

        print(
            f"⚠️ Image processing/download failed: {err}"
        )

        raise


def main():

    print(
        "🚀 Initializing YOLO AI Worker microservice..."
    )

    print(
        f"📡 RabbitMQ queue: {QUEUE_NAME}"
    )

    # Load YOLO model once.
    # This avoids loading the model for every case.
    gatekeeper = YoloGatekeeper()

    db_conn = None
    shutdown_requested = False
    heartbeat_stop_event = threading.Event()
    heartbeat_thread = threading.Thread(
        target=worker_heartbeat_loop,
        args=(heartbeat_stop_event,),
        daemon=True,
        name="anirescue-worker-heartbeat",
    )
    heartbeat_thread.start()
    write_worker_heartbeat()

    # --------------------------------------------------
    # SIGNAL HANDLING
    # --------------------------------------------------

    def handle_signal(sig, frame):
        nonlocal shutdown_requested

        print(
            "\n🛑 Shutdown signal received. "
            "Stopping worker gracefully..."
        )

        shutdown_requested = True

    signal.signal(
        signal.SIGINT,
        handle_signal
    )

    signal.signal(
        signal.SIGTERM,
        handle_signal
    )

    # --------------------------------------------------
    # RABBITMQ CONNECTION LOOP
    # --------------------------------------------------

    while not shutdown_requested:

        connection = None

        try:

            print(
                "🔄 Connecting to RabbitMQ..."
            )

            params = pika.URLParameters(
                RABBITMQ_URL
            )

            params.heartbeat = 600

            connection = pika.BlockingConnection(
                params
            )

            channel = connection.channel()
            channel.confirm_delivery()

            channel.queue_declare(
                queue=QUEUE_NAME,
                durable=True
            )

            # Process one image at a time.
            # Important because the worker is limited
            # to 2 GB RAM / 1.5 CPU.
            channel.basic_qos(
                prefetch_count=1
            )

            # --------------------------------------------------
            # MESSAGE CALLBACK
            # --------------------------------------------------

            def callback(
                ch,
                method,
                properties,
                body
            ):

                nonlocal db_conn

                cursor = None
                report_id = None
                image_input = None

                try:

                    # ------------------------------------------
                    # PARSE MESSAGE
                    # ------------------------------------------

                    payload = json.loads(
                        body.decode()
                    )

                    report_id = payload.get(
                        "reportId"
                    )

                    job_id = payload.get(
                        "jobId"
                    )

                    image_url = payload.get(
                        "imageUrl"
                    )

                    if not report_id:
                        raise ValueError(
                            "Missing reportId in RabbitMQ message."
                        )

                    if not image_url:
                        raise ValueError(
                            "Missing imageUrl in RabbitMQ message."
                        )

                    print(
                        f"\n[WORKER] Processing Case ID: {report_id}"
                    )

                    print(
                        f"📸 Image URL received from Cloudinary."
                    )

                    # ------------------------------------------
                    # DOWNLOAD IMAGE
                    # ------------------------------------------

                    image_input = resolve_image_input(
                        image_url
                    )

                    print(
                        f"📥 Temporary image downloaded: "
                        f"{image_input}"
                    )

                    # ------------------------------------------
                    # DATABASE CONNECTION
                    # ------------------------------------------

                    db_conn = get_db_connection(
                        db_conn
                    )

                    cursor = db_conn.cursor()

                    # ------------------------------------------
                    # STEP 1:
                    # LOAD CASE + MAKE PROCESSING IDEMPOTENT
                    # ------------------------------------------

                    cursor.execute(
                        """
                        SELECT status, ai_validated_at, issue_description
                        FROM rescue_cases
                        WHERE id = %s
                        """,
                        (report_id,)
                    )

                    case_row = cursor.fetchone()

                    if not case_row:
                        raise ValueError(f"Case {report_id} no longer exists.")

                    if case_row[1] is not None:
                        print(
                            f"ℹ️ Case {report_id} was already AI-validated; "
                            "acknowledging duplicate delivery."
                        )
                        ch.basic_ack(delivery_tag=method.delivery_tag)
                        return

                    if case_row[0] not in ("PENDING_VALIDATION", "PROCESSING_ANALYSIS"):
                        print(
                            f"ℹ️ Case {report_id} is already in state {case_row[0]}; "
                            "acknowledging stale delivery."
                        )
                        ch.basic_ack(delivery_tag=method.delivery_tag)
                        return

                    cursor.execute(
                        """
                        UPDATE rescue_cases
                        SET status = 'PROCESSING_ANALYSIS'
                        WHERE id = %s
                          AND ai_validated_at IS NULL
                        """,
                        (report_id,)
                    )

                    if job_id:
                        cursor.execute(
                            """
                            UPDATE case_processing_jobs
                            SET
                                processing_started_at = COALESCE(
                                    processing_started_at,
                                    CURRENT_TIMESTAMP
                                ),
                                worker_heartbeat_at = CURRENT_TIMESTAMP
                            WHERE id = %s
                              AND case_id = %s
                            """,
                            (job_id, report_id),
                        )

                    db_conn.commit()

                    # ------------------------------------------
                    # STEP 2:
                    # YOLO INFERENCE
                    # ------------------------------------------

                    print(
                        f"🤖 Running YOLO inference for "
                        f"Case {report_id}..."
                    )

                    validation_status, species, confidence = (
                        gatekeeper.validate_image(
                            image_input
                        )
                    )

                    # A model/infrastructure failure must never be treated
                    # as "no animal". Raise it into the bounded retry path.
                    if validation_status == "MODEL_ERROR":
                        raise RuntimeError(
                            "YOLO_MODEL_ERROR: animal validation could not be completed."
                        )

                    is_valid = validation_status == "VALID_ANIMAL"

                    # ------------------------------------------
                    # STEP 3:
                    # UPDATE FINAL STATUS
                    # ------------------------------------------

                    if is_valid:

                        # Gemini is deliberately optional. YOLO remains the
                        # gatekeeper, so a Gemini quota/API failure never
                        # rejects a valid rescue report.
                        print(
                            f"🧠 Running Gemini preliminary assessment for "
                            f"Case {report_id}..."
                        )

                        gemini_result = analyze_image_with_gemini(
                            image_path=image_input,
                            yolo_species=species,
                            yolo_confidence=confidence,
                            issue_description=case_row[2],
                        )

                        gemini_status = gemini_result["status"]
                        gemini_analysis = gemini_result["analysis"]

                        initial_priority = derive_initial_priority(gemini_analysis)

                        if gemini_status == "COMPLETED":
                            model_used = gemini_result.get(
                                "model_used",
                                "unknown",
                            )
                            fallback_used = gemini_result.get(
                                "fallback_used",
                                False,
                            )
                            print(
                                f"🎯 Initial rescue priority derived from AI: "
                                f"{initial_priority}"
                            )
                            print(
                                f"🧠 Gemini assessment completed for "
                                f"Case {report_id}: "
                                f"severity={gemini_analysis.get('severity')}, "
                                f"urgency={gemini_analysis.get('urgency')}, "
                                f"model={model_used}, "
                                f"fallback={fallback_used}"
                            )
                        else:
                            print(
                                f"ℹ️ Gemini assessment unavailable for "
                                f"Case {report_id}: {gemini_status}"
                            )

                        cursor.execute(
                            """
                            UPDATE rescue_cases
                            SET
                                status = 'VALIDATION_PASSED',
                                species = %s,
                                priority = %s,
                                ai_confidence = %s,
                                ai_validated_at = CURRENT_TIMESTAMP,
                                gemini_status = %s,
                                gemini_analysis = %s::jsonb,
                                gemini_analyzed_at =
                                    CASE
                                        WHEN %s = 'COMPLETED'
                                        THEN CURRENT_TIMESTAMP
                                        ELSE NULL
                                    END
                            WHERE id = %s
                              AND ai_validated_at IS NULL
                            """,
                            (
                                species,
                                initial_priority,
                                confidence,
                                gemini_status,
                                json.dumps(gemini_analysis)
                                if gemini_analysis is not None
                                else None,
                                gemini_status,
                                report_id
                            )
                        )

                        print(
                            f"✅ Case {report_id} "
                            f"PASSED"
                        )

                        print(
                            f"   Species: {species}"
                        )

                        print(
                            f"   Confidence: "
                            f"{confidence:.2f}"
                        )

                    else:

                        cursor.execute(
                            """
                            UPDATE rescue_cases
                            SET
                                status = 'REJECTED_JUNK',
                                ai_confidence = %s,
                                ai_validated_at = CURRENT_TIMESTAMP,
                                gemini_status = 'NOT_APPLICABLE'
                            WHERE id = %s
                              AND ai_validated_at IS NULL
                            """,
                            (confidence, report_id)
                        )

                        print(
                            f"❌ Case {report_id} "
                            f"REJECTED_JUNK"
                        )

                    db_conn.commit()

                    try:
                        publish_case_notification(
                            channel=ch,
                            report_id=report_id,
                            is_valid=is_valid,
                            species=species if is_valid else None,
                        )
                    except Exception as notify_err:
                        print(
                            f"⚠️ Notification failed for Case {report_id}: "
                            f"{notify_err}"
                        )

                    # ------------------------------------------
                    # SUCCESSFUL MESSAGE
                    # ------------------------------------------

                    write_worker_heartbeat(last_success=True)

                    ch.basic_ack(
                        delivery_tag=
                        method.delivery_tag
                    )

                    print(
                        f"📨 RabbitMQ message acknowledged "
                        f"for Case {report_id}"
                    )

                except Exception as e:

                    write_worker_heartbeat(error=str(e))

                    print(
                        f"⚠️ Error processing "
                        f"Case {report_id}: {e}"
                    )

                    # ------------------------------------------
                    # DATABASE ROLLBACK
                    # ------------------------------------------

                    if db_conn:

                        try:
                            db_conn.rollback()
                        except Exception:
                            pass

                    # ------------------------------------------
                    # RESET CASE STATUS
                    # ------------------------------------------

                    if (
                        db_conn
                        and report_id
                    ):

                        try:

                            with db_conn.cursor() as error_cursor:

                                error_cursor.execute(
                                    """
                                    UPDATE rescue_cases
                                    SET status =
                                        'PENDING_VALIDATION'
                                    WHERE id = %s
                                      AND ai_validated_at IS NULL
                                    """,
                                    (report_id,)
                                )

                                db_conn.commit()

                            print(
                                f"↩️ Case {report_id} "
                                f"reset to PENDING_VALIDATION."
                            )

                        except Exception as db_err:

                            print(
                                "⚠️ Failed to reset "
                                f"Case {report_id}: "
                                f"{db_err}"
                            )

                            try:
                                db_conn.rollback()
                            except Exception:
                                pass

                    # ------------------------------------------
                    # BOUNDED RETRY
                    # ------------------------------------------

                    retry_count = 0

                    if (
                        properties
                        and properties.headers
                    ):

                        retry_count = properties.headers.get(
                            "x-retry-count",
                            0
                        )

                    if retry_count < MAX_RETRIES:

                        new_headers = dict(
                            properties.headers or {}
                        )

                        new_headers[
                            "x-retry-count"
                        ] = retry_count + 1

                        try:
                            published = ch.basic_publish(
                                exchange="",
                                routing_key=QUEUE_NAME,
                                body=body,
                                properties=pika.BasicProperties(
                                    delivery_mode=2,
                                    headers=new_headers
                                )
                            )

                            if published is False:
                                raise RuntimeError(
                                    "RabbitMQ did not confirm retry publication."
                                )

                            print(
                                f"🔄 Retrying Case "
                                f"{report_id} "
                                f"({retry_count + 1}/"
                                f"{MAX_RETRIES})"
                            )

                            # The replacement message is safely published,
                            # so the failed original can now be acknowledged.
                            ch.basic_ack(
                                delivery_tag=
                                method.delivery_tag
                            )

                        except Exception as retry_err:
                            print(
                                f"⚠️ Retry publication failed for Case "
                                f"{report_id}: {retry_err}"
                            )

                            # Do not lose the original message if RabbitMQ
                            # could not accept the replacement. RabbitMQ will
                            # redeliver it after the consumer recovers.
                            ch.basic_nack(
                                delivery_tag=method.delivery_tag,
                                requeue=True
                            )

                    else:

                        print(
                            f"❌ Case {report_id} "
                            f"exceeded maximum retries."
                        )

                        # Persist a terminal processing failure so the case
                        # remains recoverable without being misclassified as
                        # REJECTED_JUNK.
                        if db_conn and report_id:
                            try:
                                with db_conn.cursor() as failure_cursor:
                                    failure_cursor.execute(
                                        """
                                        UPDATE rescue_cases
                                        SET
                                            status = 'AI_PROCESSING_FAILED',
                                            rejection_reason = LEFT(%s, 2000)
                                        WHERE id = %s
                                          AND ai_validated_at IS NULL
                                        """,
                                        (
                                            f"AI processing failed after {MAX_RETRIES} retries: {e}",
                                            report_id,
                                        ),
                                    )

                                    failure_cursor.execute(
                                        """
                                        UPDATE case_processing_jobs
                                        SET
                                            failed_at = CURRENT_TIMESTAMP,
                                            failure_reason = LEFT(%s, 2000),
                                            last_error = LEFT(%s, 1000),
                                            locked_at = NULL
                                        WHERE case_id = %s
                                        """,
                                        (
                                            str(e),
                                            str(e),
                                            report_id,
                                        ),
                                    )
                                    db_conn.commit()
                            except Exception as failure_db_err:
                                print(
                                    f"⚠️ Failed to persist terminal AI failure "
                                    f"for Case {report_id}: {failure_db_err}"
                                )
                                try:
                                    db_conn.rollback()
                                except Exception:
                                    pass

                        # Publish a distinct event so users/admins are not
                        # told that the report was rejected as junk.
                        try:
                            publish_case_notification(
                                channel=ch,
                                report_id=report_id,
                                is_valid=False,
                                species=None,
                                processing_failed=True,
                            )
                        except Exception as notify_err:
                            print(
                                f"⚠️ AI failure notification failed for Case {report_id}: "
                                f"{notify_err}"
                            )

                        # Acknowledge the message so it cannot loop forever.
                        # The durable job failure is the recovery signal for
                        # the ADMIN retry endpoint.
                        ch.basic_ack(
                            delivery_tag=
                            method.delivery_tag
                        )

                finally:

                    # ------------------------------------------
                    # CLOSE CURSOR
                    # ------------------------------------------

                    if cursor:

                        try:
                            cursor.close()
                        except Exception:
                            pass

                    # ------------------------------------------
                    # REMOVE TEMPORARY IMAGE
                    # ------------------------------------------

                    if (
                        image_input
                        and isinstance(
                            image_input,
                            str
                        )
                        and os.path.isfile(
                            image_input
                        )
                    ):

                        try:

                            os.remove(
                                image_input
                            )

                            print(
                                f"🧹 Removed temporary "
                                f"image: {image_input}"
                            )

                        except OSError as cleanup_err:

                            print(
                                "⚠️ Temporary image "
                                "cleanup failed: "
                                f"{cleanup_err}"
                            )

                    # ------------------------------------------
                    # MEMORY CLEANUP
                    # ------------------------------------------

                    gc.collect()

            # --------------------------------------------------
            # START CONSUMER
            # --------------------------------------------------

            print(
                "📡 AI Worker connected."
            )

            print(
                f"👂 Listening on '{QUEUE_NAME}'..."
            )

            channel.basic_consume(
                queue=QUEUE_NAME,
                on_message_callback=callback
            )

            # --------------------------------------------------
            # EVENT LOOP
            # --------------------------------------------------

            while (
                channel.is_open
                and not shutdown_requested
            ):

                connection.process_data_events(
                    time_limit=1
                )

        # ------------------------------------------------------
        # RABBITMQ CONNECTION ERRORS
        # ------------------------------------------------------

        except (
            pika.exceptions.AMQPConnectionError,
            pika.exceptions.AMQPChannelError
        ) as conn_err:

            if not shutdown_requested:

                print(
                    "⚠️ RabbitMQ connection error: "
                    f"{conn_err}"
                )

                print(
                    "🔄 Retrying RabbitMQ connection "
                    "in 5 seconds..."
                )

                time.sleep(5)

        # ------------------------------------------------------
        # UNEXPECTED ERRORS
        # ------------------------------------------------------

        except Exception as e:

            if not shutdown_requested:

                print(
                    f"⚠️ Unexpected Worker Error: {e}"
                )

                print(
                    "🔄 Restarting worker loop "
                    "in 5 seconds..."
                )

                time.sleep(5)

        # ------------------------------------------------------
        # CONNECTION CLEANUP
        # ------------------------------------------------------

        finally:

            if (
                connection
                and connection.is_open
            ):

                try:
                    connection.close()

                except Exception:
                    pass

    # --------------------------------------------------
    # FINAL DATABASE CLEANUP
    # --------------------------------------------------

    heartbeat_stop_event.set()

    if (
        db_conn
        and not db_conn.closed
    ):

        try:
            db_conn.close()
        except Exception:
            pass

    print(
        "✅ Worker stopped safely."
    )


# --------------------------------------------------
# APPLICATION ENTRY POINT
# --------------------------------------------------

if __name__ == "__main__":
    main()