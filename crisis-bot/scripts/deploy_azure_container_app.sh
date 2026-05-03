#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${ENV_FILE:-${APP_DIR}/.env}"

if ! command -v az >/dev/null 2>&1; then
  echo "Azure CLI is required. Install it first: https://learn.microsoft.com/cli/azure/install-azure-cli"
  exit 1
fi

if ! az account show >/dev/null 2>&1; then
  echo "Azure CLI is not logged in. Run: az login"
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing env file: ${ENV_FILE}"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
SUFFIX="$(printf "%s" "${SUBSCRIPTION_ID}" | shasum | awk '{print substr($1,1,8)}')"

AZURE_RESOURCE_GROUP="${AZURE_RESOURCE_GROUP:-rg-crisis-bot-dev}"
AZURE_LOCATION="${AZURE_LOCATION:-southeastasia}"
AZURE_ACR_NAME="${AZURE_ACR_NAME:-crisisbot${SUFFIX}}"
CONTAINER_APP_ENV="${CONTAINER_APP_ENV:-crisis-bot-env}"
CONTAINER_APP_NAME="${CONTAINER_APP_NAME:-crisis-bot}"
IMAGE_NAME="${IMAGE_NAME:-crisis-bot}"
IMAGE_TAG="${IMAGE_TAG:-$(date +%Y%m%d%H%M%S)}"

echo "Deploying ${CONTAINER_APP_NAME} to ${AZURE_RESOURCE_GROUP} (${AZURE_LOCATION})"

az group create \
  --name "${AZURE_RESOURCE_GROUP}" \
  --location "${AZURE_LOCATION}" \
  --output none

az provider register --namespace Microsoft.App --wait
az provider register --namespace Microsoft.OperationalInsights --wait
az provider register --namespace Microsoft.ContainerRegistry --wait

if ! az acr show --name "${AZURE_ACR_NAME}" --resource-group "${AZURE_RESOURCE_GROUP}" >/dev/null 2>&1; then
  az acr create \
    --name "${AZURE_ACR_NAME}" \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --sku Basic \
    --admin-enabled true \
    --output none
else
  az acr update \
    --name "${AZURE_ACR_NAME}" \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --admin-enabled true \
    --output none
fi

LOGIN_SERVER="$(az acr show --name "${AZURE_ACR_NAME}" --resource-group "${AZURE_RESOURCE_GROUP}" --query loginServer -o tsv)"

az acr build \
  --registry "${AZURE_ACR_NAME}" \
  --image "${IMAGE_NAME}:${IMAGE_TAG}" \
  "${APP_DIR}"

if ! az containerapp env show --name "${CONTAINER_APP_ENV}" --resource-group "${AZURE_RESOURCE_GROUP}" >/dev/null 2>&1; then
  az containerapp env create \
    --name "${CONTAINER_APP_ENV}" \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --location "${AZURE_LOCATION}" \
    --output none
fi

ACR_USERNAME="$(az acr credential show --name "${AZURE_ACR_NAME}" --query username -o tsv)"
ACR_PASSWORD="$(az acr credential show --name "${AZURE_ACR_NAME}" --query passwords[0].value -o tsv)"

SECRET_ARGS=()
ENV_ARGS=(
  "CORS_ORIGINS=${CORS_ORIGINS:-http://localhost:5173}"
  "CASE_STORE_PROVIDER=${CASE_STORE_PROVIDER:-cosmos}"
  "EVENT_PUBLISHER=${EVENT_PUBLISHER:-service_bus}"
  "AI_TRIAGE_PROVIDER=${AI_TRIAGE_PROVIDER:-azure_openai}"
  "VOICE_AI_PROVIDER=${VOICE_AI_PROVIDER:-openai}"
  "OPENAI_REALTIME_MODEL=${OPENAI_REALTIME_MODEL:-gpt-realtime}"
  "OPENAI_REALTIME_VOICE=${OPENAI_REALTIME_VOICE:-alloy}"
  "AZURE_OPENAI_API_VERSION=${AZURE_OPENAI_API_VERSION:-2024-10-21}"
  "AZURE_COSMOS_DATABASE=${AZURE_COSMOS_DATABASE:-crisis_voiceops}"
  "AZURE_COSMOS_CASES_CONTAINER=${AZURE_COSMOS_CASES_CONTAINER:-cases}"
  "AZURE_COSMOS_RESOURCES_CONTAINER=${AZURE_COSMOS_RESOURCES_CONTAINER:-resources}"
  "AZURE_COSMOS_AUDIT_CONTAINER=${AZURE_COSMOS_AUDIT_CONTAINER:-audit_logs}"
  "AZURE_SERVICE_BUS_TOPIC=${AZURE_SERVICE_BUS_TOPIC:-crisis-events}"
  "AZURE_SERVICE_BUS_QUEUE=${AZURE_SERVICE_BUS_QUEUE:-}"
  "AZURE_SPEECH_REGION=${AZURE_SPEECH_REGION:-southeastasia}"
  "AZURE_SPEECH_RECOGNITION_LANGUAGE=${AZURE_SPEECH_RECOGNITION_LANGUAGE:-th-TH}"
  "AZURE_SPEECH_VOICE=${AZURE_SPEECH_VOICE:-th-TH-PremwadeeNeural}"
  "KEY_VAULT_URL=${KEY_VAULT_URL:-}"
)

add_secret_env() {
  local env_name="$1"
  local secret_name="$2"
  local value="${!env_name:-}"
  if [[ -n "${value}" ]]; then
    SECRET_ARGS+=("${secret_name}=${value}")
    ENV_ARGS+=("${env_name}=secretref:${secret_name}")
  fi
}

add_secret_env "OPENAI_API_KEY" "openai-api-key"
add_secret_env "TWILIO_ACCOUNT_SID" "twilio-account-sid"
add_secret_env "TWILIO_AUTH_TOKEN" "twilio-auth-token"
add_secret_env "TWILIO_PHONE_NUMBER" "twilio-phone-number"
add_secret_env "AZURE_OPENAI_ENDPOINT" "azure-openai-endpoint"
add_secret_env "AZURE_OPENAI_API_KEY" "azure-openai-api-key"
add_secret_env "AZURE_OPENAI_DEPLOYMENT" "azure-openai-deployment"
add_secret_env "AZURE_COSMOS_ENDPOINT" "azure-cosmos-endpoint"
add_secret_env "AZURE_COSMOS_KEY" "azure-cosmos-key"
add_secret_env "AZURE_SERVICE_BUS_CONNECTION_STRING" "azure-service-bus-connection-string"
add_secret_env "AZURE_SPEECH_KEY" "azure-speech-key"
add_secret_env "AZURE_MAPS_KEY" "azure-maps-key"
add_secret_env "APPLICATIONINSIGHTS_CONNECTION_STRING" "applicationinsights-connection-string"

IMAGE="${LOGIN_SERVER}/${IMAGE_NAME}:${IMAGE_TAG}"

if ! az containerapp show --name "${CONTAINER_APP_NAME}" --resource-group "${AZURE_RESOURCE_GROUP}" >/dev/null 2>&1; then
  az containerapp create \
    --name "${CONTAINER_APP_NAME}" \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --environment "${CONTAINER_APP_ENV}" \
    --image "${IMAGE}" \
    --registry-server "${LOGIN_SERVER}" \
    --registry-username "${ACR_USERNAME}" \
    --registry-password "${ACR_PASSWORD}" \
    --target-port 8080 \
    --ingress external \
    --min-replicas 1 \
    --max-replicas 5 \
    --secrets "${SECRET_ARGS[@]}" \
    --env-vars "${ENV_ARGS[@]}" \
    --output none
else
  if [[ ${#SECRET_ARGS[@]} -gt 0 ]]; then
    az containerapp secret set \
      --name "${CONTAINER_APP_NAME}" \
      --resource-group "${AZURE_RESOURCE_GROUP}" \
      --secrets "${SECRET_ARGS[@]}" \
      --output none
  fi

  az containerapp update \
    --name "${CONTAINER_APP_NAME}" \
    --resource-group "${AZURE_RESOURCE_GROUP}" \
    --image "${IMAGE}" \
    --set-env-vars "${ENV_ARGS[@]}" \
    --output none
fi

FQDN="$(az containerapp show --name "${CONTAINER_APP_NAME}" --resource-group "${AZURE_RESOURCE_GROUP}" --query properties.configuration.ingress.fqdn -o tsv)"

echo ""
echo "Backend deployed:"
echo "https://${FQDN}"
echo ""
echo "Twilio webhook:"
echo "https://${FQDN}/incoming-call"
