#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# LIVE RESEARCH TEST SETUP
#
# Run these exports in the shell before starting the live test:
#
# export RESEARCH_LIVE=1
# export RESEARCH_API_BASE_URL="https://anirescue-backend.onrender.com"
# export RESEARCH_USER_EMAIL="testuser@gmail.com"
# export RESEARCH_USER_PASSWORD="12345678"
# export RESEARCH_IMAGE_URL="PASTE_YOUR_CLOUDINARY_IMAGE_URL_HERE"
#
# Optional:
# export RESEARCH_TIMEOUT_MS=180000
# export RESEARCH_FCM_TOKEN="YOUR_FCM_DEVICE_TOKEN"
#
# Then run:
# bash research/live/run_live_tests.sh
#
# IMPORTANT:
# - Keep the Cloudinary image URL as an HTTPS URL from your AniRescue
#   Cloudinary account. Do not commit a real secret/token here.
# - The password above is the dedicated research test-account password.
# ─────────────────────────────────────────────────────────────────────────────

if [[ "${RESEARCH_LIVE:-0}" != "1" ]]; then
  echo "LIVE RESEARCH TESTS DISABLED. Set RESEARCH_LIVE=1 explicitly."
  exit 2
fi

: "${RESEARCH_API_BASE_URL:?RESEARCH_API_BASE_URL is required}"
: "${RESEARCH_USER_EMAIL:?RESEARCH_USER_EMAIL is required}"
: "${RESEARCH_USER_PASSWORD:?RESEARCH_USER_PASSWORD is required}"
: "${RESEARCH_IMAGE_URL:?RESEARCH_IMAGE_URL is required}"

node research/live/run_live_tests.js
