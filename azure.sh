#!/bin/bash
set -e

AZ_LOCATION="francecentral"
ID=$RANDOM
AZ_RG="rg-cryptotracker-$ID"
AZ_APP_NAME="cryptotracker-app-$ID"
AZ_FUNC_NAME="cryptotracker-func-$ID"
AZ_STORAGE="stcryptotrack$ID"
AZ_STORAGE_REPORTS="streports$ID"        # Adicionado: Nome para storage de relatórios
AZ_ACR_NAME="acrcrypto$ID"               # Adicionado: Nome para o Docker Registry
AZ_COSMOS_ACCOUNT="cosmos-crypto-$ID"
AZ_COSMOS_DB="CryptoDB"
AZ_COSMOS_CONTAINER="PriceHistory"
GH_REPO="JChorao/CryptoTracker" 

export MSYS_NO_PATHCONV=1

echo "📌 A criar recursos na Azure (Node 24)..."
az group create --name "$AZ_RG" --location "$AZ_LOCATION"

# Cosmos DB
az cosmosdb create --name "$AZ_COSMOS_ACCOUNT" --resource-group "$AZ_RG" --kind GlobalDocumentDB --locations regionName="$AZ_LOCATION" failoverPriority=0
az cosmosdb sql database create --account-name "$AZ_COSMOS_ACCOUNT" --resource-group "$AZ_RG" --name "$AZ_COSMOS_DB"
az cosmosdb sql container create --account-name "$AZ_COSMOS_ACCOUNT" --resource-group "$AZ_RG" --database-name "$AZ_COSMOS_DB" --name "$AZ_COSMOS_CONTAINER" --partition-key-path "/partitionKey" --throughput 400
COSMOS_CONN=$(az cosmosdb keys list --type connection-strings --name "$AZ_COSMOS_ACCOUNT" --resource-group "$AZ_RG" --query "connectionStrings[0].connectionString" -o tsv)

# Adicionado: Azure Container Registry (Docker)
echo "🐳 A criar Container Registry..."
az acr create --resource-group "$AZ_RG" --name "$AZ_ACR_NAME" --sku Basic --admin-enabled true

# App Service
az appservice plan create --name "plan-crypto" --resource-group "$AZ_RG" --sku B1 --is-linux
az webapp create --name "$AZ_APP_NAME" --resource-group "$AZ_RG" --plan "plan-crypto" --runtime "NODE|24-lts"
APP_URL="https://$(az webapp show --name "$AZ_APP_NAME" --resource-group "$AZ_RG" --query "defaultHostName" -o tsv)"

# Function App
az storage account create --name "$AZ_STORAGE" --location "$AZ_LOCATION" --resource-group "$AZ_RG" --sku Standard_LRS
az functionapp create --name "$AZ_FUNC_NAME" --resource-group "$AZ_RG" --storage-account "$AZ_STORAGE" --consumption-plan-location "$AZ_LOCATION" --runtime node --runtime-version 24 --functions-version 4 --os-type Windows

# Criar Storage Account para Relatórios
az storage account create --name "$AZ_STORAGE_REPORTS" --location "$AZ_LOCATION" --resource-group "$AZ_RG" --sku Standard_LRS
az storage container create --name "reports" --account-name "$AZ_STORAGE_REPORTS"

# Obter a Connection String e adicionar às App Settings
STORAGE_CONN=$(az storage account show-connection-string --name "$AZ_STORAGE_REPORTS" --resource-group "$AZ_RG" --query connectionString -o tsv)
az webapp config appsettings set --name "$AZ_APP_NAME" --resource-group "$AZ_RG" --settings AZURE_STORAGE_CONNECTION_STRING="$STORAGE_CONN"

# Configurações
az webapp config appsettings set --name "$AZ_APP_NAME" --resource-group "$AZ_RG" --settings COSMOS_CONNECTION_STRING="$COSMOS_CONN" COSMOS_DB_NAME="$AZ_COSMOS_DB" COSMOS_CONTAINER_NAME="$AZ_COSMOS_CONTAINER" > /dev/null
az functionapp config appsettings set --name "$AZ_FUNC_NAME" --resource-group "$AZ_RG" --settings COSMOS_CONNECTION_STRING="$COSMOS_CONN" COSMOS_DB_NAME="$AZ_COSMOS_DB" COSMOS_CONTAINER_NAME="$AZ_COSMOS_CONTAINER" APP_SERVICE_URL="$APP_URL" > /dev/null

# GitHub Secrets
RG_SCOPE=$(az group show --name "$AZ_RG" --query id -o tsv)
SP_JSON=$(az ad sp create-for-rbac --name "CryptoDeploy-$ID" --role contributor --scopes "$RG_SCOPE" --sdk-auth)

gh secret set AZURE_CREDENTIALS --body "$SP_JSON" --repo "$GH_REPO"
gh secret set AZURE_APP_NAME --body "$AZ_APP_NAME" --repo "$GH_REPO"
gh secret set AZURE_FUNC_NAME --body "$AZ_FUNC_NAME" --repo "$GH_REPO"
gh secret set AZURE_ACR_NAME --body "$AZ_ACR_NAME" --repo "$GH_REPO" # Adicionado: Nome do ACR para o Workflow de Docker

echo "🤖 A relançar deploys automáticos..."
sleep 30
gh run rerun $(gh run list --workflow=deploy.yml --limit 1 --json databaseId -q '.[0].databaseId') || true
gh run rerun $(gh run list --workflow=deploy-function.yml --limit 1 --json databaseId -q '.[0].databaseId') || true

echo "✅ Concluído! App: $APP_URL"