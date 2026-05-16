#!/usr/bin/env bash
# scripts/setup/r171-functions-iam.sh — Create cron-runner SA + grant IAM roles.
#
# Run once during R171-0 setup. Idempotent — gcloud handles existing SAs.
#
# Prerequisites:
#   - gcloud auth login
#   - gcloud config set project labyra-app-dev
#
# @phase R171-0b

set -euo pipefail

PROJECT="labyra-app-dev"
SA_NAME="cron-runner"
SA_EMAIL="${SA_NAME}@${PROJECT}.iam.gserviceaccount.com"
COMPUTE_SA="802854518465-compute@developer.gserviceaccount.com"

echo "=== R171-0 Functions IAM Setup ==="
echo "Project: $PROJECT"
echo ""

# 1. Create cron-runner SA (idempotent)
echo "[1/4] Create $SA_NAME service account"
if gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT" &>/dev/null; then
  echo "  SKIP: $SA_NAME already exists"
else
  gcloud iam service-accounts create "$SA_NAME" \
    --project="$PROJECT" \
    --display-name="Cron Runner (R171 scheduled functions)" \
    --description="Runs scheduled functions: backup-costs, ragas-eval, cost-drift"
  echo "  + Created $SA_EMAIL"
fi

# 2. Grant IAM roles to cron-runner
echo ""
echo "[2/4] Grant IAM roles to $SA_NAME"
for role in \
  "roles/datastore.user" \
  "roles/storage.objectAdmin" \
  "roles/logging.logWriter" \
  "roles/monitoring.metricWriter"
do
  echo "  → $role"
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member="serviceAccount:$SA_EMAIL" \
    --role="$role" \
    --condition=None \
    --quiet >/dev/null
done
echo "  Done."

# 3. Allow compute SA (Functions Gen 2 default) to impersonate cron-runner
echo ""
echo "[3/4] Allow Compute SA to impersonate $SA_NAME"
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --member="serviceAccount:$COMPUTE_SA" \
  --role="roles/iam.serviceAccountTokenCreator" \
  --project="$PROJECT" \
  --condition=None \
  --quiet >/dev/null
echo "  Done."

# 4. Enable required APIs
echo ""
echo "[4/4] Enable required APIs"
for api in \
  "cloudfunctions.googleapis.com" \
  "cloudscheduler.googleapis.com" \
  "cloudbuild.googleapis.com" \
  "run.googleapis.com" \
  "pubsub.googleapis.com"
do
  echo "  → $api"
  gcloud services enable "$api" --project="$PROJECT" --quiet >/dev/null
done
echo "  Done."

echo ""
echo "=== Setup complete ==="
echo ""
echo "Verify:"
echo "  gcloud iam service-accounts describe $SA_EMAIL --project=$PROJECT"
echo "  gcloud projects get-iam-policy $PROJECT --flatten='bindings[].members' \\"
echo "    --filter="bindings.members:$SA_EMAIL""
echo ""
echo "Next: cd functions && pnpm install && pnpm build"
