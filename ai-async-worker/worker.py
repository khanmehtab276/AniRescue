import os
import sys
import json
import gc
import time
import signal
import io
import tempfile
import pika
import psycopg2
import requests
from PIL import Image
from pathlib import Path

# --------------------------------------------------
# WORKER PATH CONFIGURATION
# --------------------------------------------------

WORKER_DIR = Path(__file__).resolve().parent

if str(WORKER_DIR) not in sys.path:
    sys.path.insert(0, str(WORKER_DIR))

from src.models.yolo_engine import YoloGatekeeper


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

MAX_RETRIES = 3

IMAGE_DOWNLOAD_TIMEOUT = 15

# --------------------------------------------------
# DATABASE CONNECTION
# --------------------------------------------------


def get_db_connection(existing_conn):
    """
    Reuse an existing PostgreSQL connection if it is healthy.
    Otherwise create a new connection.
    """

    if existing_conn is not None and not existing_conn.closed:
        try:
            with existing_conn.cursor() as cur:
                cur.execute("SELECT 1")

            return existing_conn

        except Exception:
            try:
                existing_conn.close()
            except Exception:
                pass

    return psycopg2.connect(DATABASE_URL)


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

    if not image_source.startswith(
        ("http://", "https://")
    ):
        raise ValueError(
            "Only HTTP/HTTPS image URLs are supported."
        )

    temp_path = None

    try:
        headers = {
            "User-Agent": "AniRescueWorker/1.0"
        }

        response = requests.get(
            image_source,
            headers=headers,
            timeout=IMAGE_DOWNLOAD_TIMEOUT
        )

        response.raise_for_status()

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
            f"⚠️ Failed downloading image: {err}"
        )

        raise ValueError(
            f"Unable to fetch image URL: {err}"
        )


# --------------------------------------------------
# MAIN WORKER
# --------------------------------------------------


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
                    # PROCESSING_ANALYSIS
                    # ------------------------------------------

                    cursor.execute(
                        """
                        UPDATE rescue_cases
                        SET status = 'PROCESSING_ANALYSIS'
                        WHERE id = %s
                        """,
                        (report_id,)
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

                    is_valid, species, confidence = (
                        gatekeeper.validate_image(
                            image_input
                        )
                    )

                    # ------------------------------------------
                    # STEP 3:
                    # UPDATE FINAL STATUS
                    # ------------------------------------------

                    if is_valid:

                        cursor.execute(
                            """
                            UPDATE rescue_cases
                            SET
                                status = 'VALIDATION_PASSED',
                                species = %s
                            WHERE id = %s
                            """,
                            (
                                species,
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
                            SET status = 'REJECTED_JUNK'
                            WHERE id = %s
                            """,
                            (report_id,)
                        )

                        print(
                            f"❌ Case {report_id} "
                            f"REJECTED_JUNK"
                        )

                    db_conn.commit()

                    # ------------------------------------------
                    # SUCCESSFUL MESSAGE
                    # ------------------------------------------

                    ch.basic_ack(
                        delivery_tag=
                        method.delivery_tag
                    )

                    print(
                        f"📨 RabbitMQ message acknowledged "
                        f"for Case {report_id}"
                    )

                except Exception as e:

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

                        ch.basic_publish(
                            exchange="",
                            routing_key=QUEUE_NAME,
                            body=body,
                            properties=pika.BasicProperties(
                                delivery_mode=2,
                                headers=new_headers
                            )
                        )

                        print(
                            f"🔄 Retrying Case "
                            f"{report_id} "
                            f"({retry_count + 1}/"
                            f"{MAX_RETRIES})"
                        )

                    else:

                        print(
                            f"❌ Case {report_id} "
                            f"exceeded maximum retries."
                        )

                    # ------------------------------------------
                    # ACK ORIGINAL MESSAGE
                    # ------------------------------------------

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