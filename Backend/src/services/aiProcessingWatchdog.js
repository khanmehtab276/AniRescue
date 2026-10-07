const { pool } = require("../config/db");
const { notifyCaseRecipients } = require("../utils/caseNotificationRecipients");
const { logAudit } = require("../utils/auditLog");
const { publishCaseMapChange } = require("./caseRealtime");

const WATCHDOG_INTERVAL_MS = 60 * 1000;
const STALE_AFTER_MINUTES = 10;
let timer = null;
let running = false;

async function checkStaleProcessingJobs() {
  if (running) return;
  running = true;

  try {
    const result = await pool.query(
      `SELECT
         cpj.id AS job_id,
         cpj.case_id,
         COALESCE(
           cpj.worker_heartbeat_at,
           cpj.processing_started_at,
           cpj.locked_at,
           cpj.published_at
         ) AS last_seen_at
       FROM case_processing_jobs cpj
       JOIN rescue_cases rc ON rc.id = cpj.case_id
       WHERE rc.status = 'PROCESSING_ANALYSIS'
         AND rc.ai_validated_at IS NULL
         AND COALESCE(
           cpj.worker_heartbeat_at,
           cpj.processing_started_at,
           cpj.locked_at,
           cpj.published_at
         ) < CURRENT_TIMESTAMP - INTERVAL '${STALE_AFTER_MINUTES} minutes'
       ORDER BY last_seen_at ASC
       LIMIT 20`,
    );

    for (const stale of result.rows) {
      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        const update = await client.query(
          `UPDATE rescue_cases
           SET
             status = 'AI_PROCESSING_FAILED',
             rejection_reason = LEFT(
               'AI processing watchdog marked this case stale after ${STALE_AFTER_MINUTES} minutes.',
               2000
             )
           WHERE id = $1
             AND status = 'PROCESSING_ANALYSIS'
             AND ai_validated_at IS NULL
           RETURNING id`,
          [stale.case_id],
        );

        if (update.rows.length === 0) {
          await client.query("ROLLBACK");
          continue;
        }

        await client.query(
          `UPDATE case_processing_jobs
           SET
             failed_at = CURRENT_TIMESTAMP,
             failure_reason = LEFT($2, 2000),
             last_error = LEFT($2, 1000),
             locked_at = NULL
           WHERE id = $1`,
          [
            stale.job_id,
            `AI processing watchdog timeout: no worker heartbeat for ${STALE_AFTER_MINUTES} minutes.`,
          ],
        );

        await client.query("COMMIT");

        await logAudit({
          action: "AI_PROCESSING_WATCHDOG_FAILED",
          targetType: "CASE",
          targetId: stale.case_id,
          metadata: {
            jobId: stale.job_id,
            lastSeenAt: stale.last_seen_at,
            staleAfterMinutes: STALE_AFTER_MINUTES,
          },
        });

        await notifyCaseRecipients({
          caseId: stale.case_id,
          notificationType: "AI_PROCESSING_FAILED",
          title: "AI validation needs attention",
          message:
            "Automated image processing stopped responding. An administrator can retry this report.",
          includeReporter: true,
          includeAdmins: true,
        });

        publishCaseMapChange();

        console.warn(
          `AI watchdog marked case #${stale.case_id} as AI_PROCESSING_FAILED.`,
        );
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {}
        console.error(
          `AI watchdog failed for case #${stale.case_id}:`,
          error?.message || error,
        );
      } finally {
        client.release();
      }
    }
  } catch (error) {
    console.error(
      "AI processing watchdog error:",
      error?.message || error,
    );
  } finally {
    running = false;
  }
}

function startAiProcessingWatchdog() {
  if (timer) return;

  checkStaleProcessingJobs().catch(() => {});
  timer = setInterval(() => {
    checkStaleProcessingJobs().catch(() => {});
  }, WATCHDOG_INTERVAL_MS);

  timer.unref?.();

  console.log(
    `🛡️ AI processing watchdog started (stale after ${STALE_AFTER_MINUTES} minutes).`,
  );
}

function stopAiProcessingWatchdog() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = {
  startAiProcessingWatchdog,
  stopAiProcessingWatchdog,
  checkStaleProcessingJobs,
};
