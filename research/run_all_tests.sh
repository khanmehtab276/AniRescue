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
  run_step "AI Worker — R3 Gemini structured-output/error contract tests"     docker run --rm --network none -v "$ROOT_DIR/ai-async-worker:/app:ro" -w /app anirescue-ai-worker:latest python -m unittest discover -s /app/test -p 'test_*.py'
else
  SKIP=$((SKIP + 1))
  echo
  echo "RESULT: SKIP — R3 Docker worker image anirescue-ai-worker:latest is not available"
fi

# Frontend build/lint are implementation integrity checks, not ML metrics.
run_step "Frontend — lint"   bash -c 'cd Frontend && npm run lint'

run_step "Frontend — production build"   bash -c 'cd Frontend && npm run build'

echo
echo "============================================================"
echo "RESEARCH TEST SUMMARY"
echo "============================================================"
echo "PASS: $PASS"
echo "FAIL: $FAIL"
echo "SKIP: $SKIP"

echo
echo "Live integration groups R4/R5/R9/R10 are intentionally not executed"
echo "against deployed production services by this command."
echo "They require an isolated test environment and controlled test data."
echo "This prevents the research runner from creating/modifying production"
echo "rescue cases, notifications, feedback, or database records."

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi

exit 0
