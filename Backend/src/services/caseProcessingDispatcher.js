const { pool } = require("../config/db");
const { getChannel, QUEUE_NAME } = require("../config/rabbitmq");

const DISPATCH_INTERVAL_MS = 2000;
const BATCH_SIZE = 10;
const LOCK_TIMEOUT_MINUTES = 2;

let timer = null;
let running = false;

async function dispatchPendingJobs() {
  if (running) return;
  running = true;

  try {
    const result = await pool.query(
      `SELECT id, case_id, image_url
       FROM case_processing_jobs
       WHERE published_at IS NULL
         AND failed_at IS NULL
         AND (
           locked_at IS NULL
           OR locked_at < CURRENT_TIMESTAMP - INTERVAL '${LOCK_TIMEOUT_MINUTES} minutes'
         )
       ORDER BY created_at ASC
       LIMIT $1`,
      [BATCH_SIZE],
    );

    const channel = getChannel();

    if (!channel) return;

    for (const job of result.rows) {
      const lockResult = await pool.query(
        `UPDATE case_processing_jobs
         SET locked_at = CURRENT_TIMESTAMP,
             attempts = attempts + 1
         WHERE id = $1
           AND published_at IS NULL
           AND failed_at IS NULL
           AND (
             locked_at IS NULL
             OR locked_at < CURRENT_TIMESTAMP - INTERVAL '${LOCK_TIMEOUT_MINUTES} minutes'
           )
         RETURNING id, case_id, image_url`,
        [job.id],
      );

      if (lockResult.rows.length === 0) continue;

      const lockedJob = lockResult.rows[0];

      try {
        channel.sendToQueue(
          QUEUE_NAME,
          Buffer.from(
            JSON.stringify({
              reportId: lockedJob.case_id,
              imageUrl: lockedJob.image_url,
              jobId: lockedJob.id,
            }),
          ),
          {
            persistent: true,
            contentType: "application/json",
            messageId: `case-processing-${lockedJob.id}`,
          },
        );

        await channel.waitForConfirms();

        await pool.query(
          `UPDATE case_processing_jobs
           SET published_at = CURRENT_TIMESTAMP,
               locked_at = NULL,
               last_error = NULL,
               failed_at = NULL,
               failure_reason = NULL
           WHERE id = $1
             AND published_at IS NULL`,
          [lockedJob.id],
        );
      } catch (error) {
        await pool.query(
          `UPDATE case_processing_jobs
           SET locked_at = NULL,
               last_error = LEFT($2, 1000)
           WHERE id = $1
             AND published_at IS NULL`,
          [lockedJob.id, error?.message || String(error)],
        );

        console.error(
          `AI job dispatch failed for case #${lockedJob.case_id}:`,
          error?.message || error,
        );
      }
    }
  } catch (error) {
    console.error(
      "AI processing outbox error:",
      error?.message || error,
    );
  } finally {
    running = false;
  }
}

function startCaseProcessingDispatcher() {
  if (timer) return;

  // Dispatch immediately, then continue polling.
  dispatchPendingJobs().catch(() => {});
  timer = setInterval(() => {
    dispatchPendingJobs().catch(() => {});
  }, DISPATCH_INTERVAL_MS);

  timer.unref?.();

  console.log(
    `📬 AI processing outbox dispatcher started (every ${DISPATCH_INTERVAL_MS}ms).`,
  );
}

function stopCaseProcessingDispatcher() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = {
  startCaseProcessingDispatcher,
  stopCaseProcessingDispatcher,
  dispatchPendingJobs,
};
