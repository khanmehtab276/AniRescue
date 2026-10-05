#!/usr/bin/env bash
set -euo pipefail

if [[ "${RESEARCH_LIVE:-0}" != "1" ]]; then
  echo "LIVE RESEARCH TESTS DISABLED. Set RESEARCH_LIVE=1 explicitly."
  exit 2
fi

: "${RESEARCH_API_BASE_URL:?RESEARCH_API_BASE_URL is required}"
: "${RESEARCH_USER_EMAIL:?RESEARCH_USER_EMAIL is required}"
: "${RESEARCH_USER_PASSWORD:?RESEARCH_USER_PASSWORD is required}"
: "${RESEARCH_IMAGE_URL:?RESEARCH_IMAGE_URL is required}"

node research/live/run_live_tests.js
