#!/usr/bin/env bash
set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PASS=0
FAIL=0
SKIP=0

run_step() {
  local name="$1"
  shift
  echo
  echo "============================================================"
  echo "$name"
  echo "============================================================"
  if "$@"; then
    PASS=$((PASS + 1))
    echo "RESULT: PASS — $name"
  else
    FAIL=$((FAIL + 1))
    echo "RESULT: FAIL — $name"
  fi
}

echo "AniRescue Research Evaluation"
echo "Branch: $(git branch --show-current 2>/dev/null || echo unknown)"
echo "Commit: $(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

# R6-R8: deterministic backend evaluation.
run_step "Backend — R6/R7/R8 lifecycle, RBAC and geospatial tests"   bash -c 'cd Backend && npm test'

# R1/R2: existing controlled AI benchmark and resource metrics.
run_step "AI Worker — R1/R2 benchmark artifact validation"   python3 ai-async-worker/benchmark/validate_research_result.py   ai-async-worker/benchmark/results/yolo-world-openvino.json

# R3: Gemini contract tests run inside the real Docker worker environment.
if docker image inspect anirescue-ai-worker:latest >/dev/null 2>&1; then
  run_step "AI Worker — R3/R4/R5 Gemini and async-worker research tests"     docker run --rm --network none -v "$ROOT_DIR/ai-async-worker:/app:ro" -w /app anirescue-ai-worker:latest python -m unittest discover -s /app/test -p 'test_*.py'
else
  SKIP=$((SKIP + 1))
  echo
  echo "RESULT: SKIP — R3 Docker worker image anirescue-ai-worker:latest is not available"
fi

# R9/R10 deterministic backend notification + feedback coverage.
run_step "Backend — R9/R10 notification and feedback research tests"   bash -c 'cd Backend && node --test test/researchNotificationsFeedback.test.js'

# Frontend build/lint are implementation integrity checks, not ML metrics.
run_frontend_lint() {
  cd "$ROOT_DIR/Frontend"
  local lint_log
  lint_log="$(mktemp)"
  if npm run lint >"$lint_log" 2>&1; then
    local warning_count
    warning_count="$(grep -c "warning" "$lint_log" || true)"
    if [ "$warning_count" -gt 0 ]; then
      echo "ESLint completed successfully; $warning_count warning lines suppressed."
    else
      echo "ESLint completed successfully; no warnings."
    fi
    rm -f "$lint_log"
    return 0
  fi

  cat "$lint_log"
  rm -f "$lint_log"
  return 1
}

run_step "Frontend — lint" run_frontend_lint

run_step "Frontend — production build" bash -c 'cd Frontend && npm run build'

echo
echo "============================================================"
echo "RESEARCH TEST SUMMARY"
echo "============================================================"
echo "PASS: $PASS"
echo "FAIL: $FAIL"
echo "SKIP: $SKIP"

echo
if [ "${RESEARCH_LIVE:-0}" = "1" ]; then
  run_step "LIVE — R3/R4/R5/R9/R10 controlled integration harness" bash research/live/run_live_tests.sh
else
  SKIP=$((SKIP + 1))
  echo
  echo "RESULT: SKIP — LIVE R3/R4/R5/R9/R10 harness disabled"
  echo "Enable explicitly with RESEARCH_LIVE=1 and an isolated research API."
fi

echo
echo "The normal runner never defaults to deployed production services."
echo "R1-R10 component tests are safe to run locally; live R3/R4/R5/R9/R10"
echo "require explicit RESEARCH_LIVE=1 and a supplied isolated API/image."

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi

exit 0
