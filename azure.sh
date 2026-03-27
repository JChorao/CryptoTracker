#!/bin/bash
set -e

# =============================================================================
#  CONFIGURAÇÕES GERAIS
# =============================================================================
AZ_RG="rg-cryptotracker"
AZ_LOCATION="francecentral"

# Sufixo aleatório para garantir unicidade global
ID=$RANDOM
AZ_APP_NAME="cryptotracker-app-$ID"
AZ_FUNC_NAME="cryptotracker-func-$ID"
AZ_STORAGE="stcryptotrack$ID"
AZ_COSMOS_ACCOUNT="cosmos-crypto-$ID"

AZ_COSMOS_DB="CryptoDB"
AZ_COSMOS_CONTAINER="PriceHistory"
GH_REPO="JChorao/CryptoTracker" # <-- Confirma se é o teu repositório

echo "------------------------------------------------------------------"
echo "🚀 SETUP FINAL: COSMOS DB + APP SERVICE + FUNCTION (WINDOWS)"
echo "------------------------------------------------------------------"

echo "📌 A criar Grupo de Recursos..."
az group create --name "$AZ_RG" --location "$AZ_LOCATION"

echo "📌 A criar Cosmos DB (Standard - 400 RU/s)..."
az cosmosdb create --name "$AZ_COSMOS_ACCOUNT" --resource-group "$AZ_RG" \
    --kind GlobalDocumentDB --locations regionName="$AZ_LOCATION" failoverPriority=0

echo "📌 A configurar Base de Dados e Contentor..."
az cosmosdb sql database create --account-name "$AZ_COSMOS_ACCOUNT" \
    --resource-group "$AZ_RG" --name "$AZ_COSMOS_DB"

# MSYS_NO_PATHCONV impede o Git Bash de alterar o caminho /partitionKey no Windows
MSYS_NO_PATHCONV=1 az cosmosdb sql container create \
    --account-name "$AZ_COSMOS_ACCOUNT" --resource-group "$AZ_RG" \
    --database-name "$AZ_COSMOS_DB" --name "$AZ_COSMOS_CONTAINER" \
    --partition-key-path "/partitionKey" --throughput 400

COSMOS_CONN=$(az cosmosdb keys list --type connection-strings \
    --name "$AZ_COSMOS_ACCOUNT" --resource-group "$AZ_RG" \
    --query "connectionStrings[0].connectionString" -o tsv)

echo "📌 A criar App Service (Linux B1)..."
az appservice plan create --name "plan-crypto" --resource-group "$AZ_RG" --sku B1 --is-linux
az webapp create --name "$AZ_APP_NAME" --resource-group "$AZ_RG" \
    --plan "plan-crypto" --runtime "NODE|22-lts"

APP_URL="https://$(az webapp show --name "$AZ_APP_NAME" --resource-group "$AZ_RG" --query "defaultHostName" -o tsv)"

echo "📌 A criar Storage Account (Requisito da Function)..."
az storage account create --name "$AZ_STORAGE" --location "$AZ_LOCATION" \
    --resource-group "$AZ_RG" --sku Standard_LRS

echo "📌 A criar Function App (Windows Serverless - Node 24)..."
az functionapp create --name "$AZ_FUNC_NAME" --resource-group "$AZ_RG" \
    --storage-account "$AZ_STORAGE" --consumption-plan-location "$AZ_LOCATION" \
    --runtime node --runtime-version 24 --functions-version 4 --os-type Windows

echo "📌 A configurar Variáveis de Ambiente..."
# Web App
az webapp config appsettings set --name "$AZ_APP_NAME" --resource-group "$AZ_RG" --settings \
    COSMOS_CONNECTION_STRING="$COSMOS_CONN" \
    COSMOS_DB_NAME="$AZ_COSMOS_DB" \
    COSMOS_CONTAINER_NAME="$AZ_COSMOS_CONTAINER"

# Function App
az functionapp config appsettings set --name "$AZ_FUNC_NAME" --resource-group "$AZ_RG" --settings \
    COSMOS_CONNECTION_STRING="$COSMOS_CONN" \
    COSMOS_DB_NAME="$AZ_COSMOS_DB" \
    COSMOS_CONTAINER_NAME="$AZ_COSMOS_CONTAINER" \
    APP_SERVICE_URL="$APP_URL"

echo "📌 A configurar GitHub Secrets (Web App e Function App)..."

# --- SECRETS DA WEB APP ---
az webapp deployment list-publishing-profiles --name "$AZ_APP_NAME" \
    --resource-group "$AZ_RG" --xml > app-publish.xml

gh secret set AZURE_PUBLISH_PROFILE < app-publish.xml --repo "$GH_REPO"
gh secret set AZURE_APP_NAME --body "$AZ_APP_NAME" --repo "$GH_REPO"
rm app-publish.xml

# --- SECRETS DA FUNCTION APP ---
az functionapp deployment list-publishing-profiles --name "$AZ_FUNC_NAME" \
    --resource-group "$AZ_RG" --xml > func-publish.xml

gh secret set AZURE_FUNCTION_PUBLISH_PROFILE < func-publish.xml --repo "$GH_REPO"
gh secret set AZURE_FUNC_NAME --body "$AZ_FUNC_NAME" --repo "$GH_REPO"
rm func-publish.xml

echo "✅ SETUP CONCLUÍDO COM SUCESSO!"
echo "🌐 Web App URL: $APP_URL"
echo "⚡ Function Name: $AZ_FUNC_NAME"