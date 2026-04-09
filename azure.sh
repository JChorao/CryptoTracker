#!/bin/bash
set -e

AZ_LOCATION="francecentral"
ID=$RANDOM
AZ_RG="rg-cryptotracker-$ID"
AZ_APP_NAME="cryptotracker-app-$ID"
AZ_FUNC_NAME="cryptotracker-func-$ID"
AZ_ACR_NAME="acrcrypto$ID"
AZ_STORAGE_REPORTS="streports$ID"
AZ_STORAGE_FUNC="stfunc$ID"
AZ_COSMOS_ACCOUNT="cosmos-crypto-$ID"
AZ_COSMOS_DB="CryptoDB"
AZ_COSMOS_CONTAINER="PriceHistory"
GH_REPO="JChorao/CryptoTracker" 

export MSYS_NO_PATHCONV=1

echo "📌 A iniciar criação da infraestrutura completa na Azure (Node 24)..."
az group create --name "$AZ_RG" --location "$AZ_LOCATION"

echo "1️⃣ Cosmos DB..."
az cosmosdb create --name "$AZ_COSMOS_ACCOUNT" --resource-group "$AZ_RG" --kind GlobalDocumentDB --locations regionName="$AZ_LOCATION" failoverPriority=0
az cosmosdb sql database create --account-name "$AZ_COSMOS_ACCOUNT" --resource-group "$AZ_RG" --name "$AZ_COSMOS_DB"
az cosmosdb sql container create --account-name "$AZ_COSMOS_ACCOUNT" --resource-group "$AZ_RG" --database-name "$AZ_COSMOS_DB" --name "$AZ_COSMOS_CONTAINER" --partition-key-path "/partitionKey" --throughput 400
COSMOS_CONN=$(az cosmosdb keys list --type connection-strings --name "$AZ_COSMOS_ACCOUNT" --resource-group "$AZ_RG" --query "connectionStrings[0].connectionString" -o tsv)

echo "2️⃣ Azure Container Registry (Docker para Relatórios)..."
az acr create --resource-group "$AZ_RG" --name "$AZ_ACR_NAME" --sku Basic --admin-enabled true

echo "3️⃣ Contas de Storage..."
az storage account create --name "$AZ_STORAGE_REPORTS" --location "$AZ_LOCATION" --resource-group "$AZ_RG" --sku Standard_LRS
STORAGE_CONN=$(az storage account show-connection-string --name "$AZ_STORAGE_REPORTS" --resource-group "$AZ_RG" --query connectionString -o tsv)
az storage account create --name "$AZ_STORAGE_FUNC" --location "$AZ_LOCATION" --resource-group "$AZ_RG" --sku Standard_LRS

echo "4️⃣ Web App Service (Node 24)..."
az appservice plan create --name "plan-crypto" --resource-group "$AZ_RG" --sku B1 --is-linux
az webapp create --name "$AZ_APP_NAME" --resource-group "$AZ_RG" --plan "plan-crypto" --runtime "NODE|24-lts"
az webapp config set --name "$AZ_APP_NAME" --resource-group "$AZ_RG" --web-sockets-enabled true
az webapp config appsettings set --name "$AZ_APP_NAME" --resource-group "$AZ_RG" --settings \
  COSMOS_CONNECTION_STRING="$COSMOS_CONN" \
  COSMOS_DB_NAME="$AZ_COSMOS_DB" \
  COSMOS_CONTAINER_NAME="$AZ_COSMOS_CONTAINER" \
  AZURE_STORAGE_CONNECTION_STRING="$STORAGE_CONN"

echo "5️⃣ Azure Function App (Node 24)..."
az functionapp create --resource-group "$AZ_RG" --consumption-plan-location "$AZ_LOCATION" --runtime node --runtime-version 24 --functions-version 4 --name "$AZ_FUNC_NAME" --storage-account "$AZ_STORAGE_FUNC"
az functionapp config appsettings set --name "$AZ_FUNC_NAME" --resource-group "$AZ_RG" --settings \
  COSMOS_CONNECTION_STRING="$COSMOS_CONN" \
  COSMOS_DB_NAME="$AZ_COSMOS_DB" \
  COSMOS_CONTAINER_NAME="$AZ_COSMOS_CONTAINER" \
  APP_SERVICE_URL="https://$AZ_APP_NAME.azurewebsites.net"

echo "6️⃣ Configuração dos GitHub Secrets..."
RG_SCOPE=$(az group show --name "$AZ_RG" --query id -o tsv)
SP_JSON=$(az ad sp create-for-rbac --name "CryptoDeploy-$ID" --role contributor --scopes "$RG_SCOPE" --sdk-auth)

gh secret set AZURE_CREDENTIALS --body "$SP_JSON" --repo "$GH_REPO"
gh secret set AZURE_APP_NAME --body "$AZ_APP_NAME" --repo "$GH_REPO"
gh secret set AZURE_FUNC_NAME --body "$AZ_FUNC_NAME" --repo "$GH_REPO"
gh secret set AZURE_ACR_NAME --body "$AZ_ACR_NAME" --repo "$GH_REPO"

echo "✅ Infraestrutura concluída com sucesso!"