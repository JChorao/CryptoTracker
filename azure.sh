#!/bin/bash
# ========================================================================================
# PROJETO: CryptoTracker — Script de Automação de Infraestrutura (Entrega 3)
# ========================================================================================

set -e

# --- CONFIGURAÇÕES DE VARIÁVEIS GLOBAIS ---
AZ_LOCATION="francecentral"
ID=$RANDOM
AZ_RG="rg-cryptotracker-production"

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

echo "📌 A iniciar criação da infraestrutura completa na Azure..."

echo "--------------------------------------------------------"
echo "👉 1. A criar Grupo de Recursos..."
az group create --name "$AZ_RG" --location "$AZ_LOCATION" -o none
echo "✅ Grupo de Recursos criado."

echo "--------------------------------------------------------"
echo "👉 2. A configurar Azure Cosmos DB (pode demorar alguns minutos)..."
az cosmosdb create \
  --name "$AZ_COSMOS_ACCOUNT" \
  --resource-group "$AZ_RG" \
  --kind GlobalDocumentDB \
  --locations regionName="$AZ_LOCATION" failoverPriority=0 \
  -o none

az cosmosdb sql database create \
  --account-name "$AZ_COSMOS_ACCOUNT" \
  --resource-group "$AZ_RG" \
  --name "$AZ_COSMOS_DB" \
  -o none

az cosmosdb sql container create \
  --account-name "$AZ_COSMOS_ACCOUNT" \
  --resource-group "$AZ_RG" \
  --database-name "$AZ_COSMOS_DB" \
  --name "$AZ_COSMOS_CONTAINER" \
  --partition-key-path "/partitionKey" \
  --throughput 400 \
  -o none

COSMOS_CONN=$(az cosmosdb keys list --type connection-strings --name "$AZ_COSMOS_ACCOUNT" --resource-group "$AZ_RG" --query "connectionStrings[0].connectionString" -o tsv)
echo "✅ Cosmos DB configurado com sucesso."

echo "--------------------------------------------------------"
echo "👉 3. A criar Azure Container Registry (ACR)..."
az acr create \
 --resource-group "$AZ_RG" \
 --name "$AZ_ACR_NAME" \
 --sku Basic \
 --admin-enabled true \
 -o none
echo "✅ ACR criado."

echo "--------------------------------------------------------"
echo "👉 4. A configurar Contas de Armazenamento (Storage)..."
az storage account create \
 --name "$AZ_STORAGE_REPORTS" \
 --location "$AZ_LOCATION" \
 --resource-group "$AZ_RG" \
 --sku Standard_LRS \
 -o none
STORAGE_CONN=$(az storage account show-connection-string --name "$AZ_STORAGE_REPORTS" --resource-group "$AZ_RG" --query connectionString -o tsv)

az storage account create \
 --name "$AZ_STORAGE_FUNC" \
 --location "$AZ_LOCATION" \
 --resource-group "$AZ_RG" \
 --sku Standard_LRS \
 -o none
echo "✅ Contas de Storage criadas."

echo "--------------------------------------------------------"
echo "👉 5. A configurar Web App Service (Garantindo Node 20 para igualar Terraform)..."
az appservice plan create \
 --name "plan-crypto" \
 --resource-group "$AZ_RG" \
 --sku B1 \
 --is-linux \
 -o none
 
# Bypass Web App: Criamos com versão validada pela CLI local
az webapp create \
 --name "$AZ_APP_NAME" \
 --resource-group "$AZ_RG" \
 --plan "plan-crypto" \
 --runtime "node:22-lts" \
 -o none

# Bypass Web App: Forçamos o downgrade imediato para Node 20 via API
az webapp config set \
 --name "$AZ_APP_NAME" \
 --resource-group "$AZ_RG" \
 --linux-fx-version "NODE|20-lts" \
 -o none
 
az webapp config set \
 --name "$AZ_APP_NAME" \
 --resource-group "$AZ_RG" \
 --web-sockets-enabled true \
 -o none

az webapp config appsettings set \
 --name "$AZ_APP_NAME" \
 --resource-group "$AZ_RG" \
 --settings \
  COSMOS_CONNECTION_STRING="$COSMOS_CONN" \
  COSMOS_DB_NAME="$AZ_COSMOS_DB" \
  COSMOS_CONTAINER_NAME="$AZ_COSMOS_CONTAINER" \
  AZURE_STORAGE_CONNECTION_STRING="$STORAGE_CONN" \
 -o none
echo "✅ Web App criada e configurada com Node 20."

echo "--------------------------------------------------------"
echo "👉 6. A configurar Azure Function App (Garantindo Node 20 para igualar Terraform)..."
# Bypass Function: Criamos com Node 24 para contornar a rejeição de EOL
az functionapp create \
  --name "$AZ_FUNC_NAME" \
  --resource-group "$AZ_RG" \
  --consumption-plan-location "$AZ_LOCATION" \
  --storage-account "$AZ_STORAGE_FUNC" \
  --runtime node \
  --runtime-version 24 \
  --functions-version 4 \
  -o none

# Bypass Function: Injetamos a variável que dita o Runtime, forçando o Node 20
az functionapp config appsettings set \
  --name "$AZ_FUNC_NAME" \
  --resource-group "$AZ_RG" \
  --settings \
  WEBSITE_NODE_DEFAULT_VERSION="~20" \
  COSMOS_CONNECTION_STRING="$COSMOS_CONN" \
  COSMOS_DB_NAME="$AZ_COSMOS_DB" \
  COSMOS_CONTAINER_NAME="$AZ_COSMOS_CONTAINER" \
  APP_SERVICE_URL="https://$AZ_APP_NAME.azurewebsites.net" \
  -o none
echo "✅ Function App criada e interligada à Web App (forçada para Node 20)."

echo "--------------------------------------------------------"
echo "👉 7. A gerar Chaves de Segurança e guardar no GitHub Secrets..."
RG_SCOPE=$(az group show --name "$AZ_RG" --query id -o tsv)
SP_JSON=$(az ad sp create-for-rbac --name "CryptoDeploy-$ID" --role contributor --scopes "$RG_SCOPE" --sdk-auth)

gh secret set AZURE_CREDENTIALS --body "$SP_JSON" --repo "$GH_REPO"
gh secret set AZURE_APP_NAME --body "$AZ_APP_NAME" --repo "$GH_REPO"
gh secret set AZURE_FUNC_NAME --body "$AZ_FUNC_NAME" --repo "$GH_REPO"
gh secret set AZURE_ACR_NAME --body "$AZ_ACR_NAME" --repo "$GH_REPO"
echo "✅ Segredos injetados no repositório."

echo "--------------------------------------------------------"
echo "👉 8. A despoletar o Primeiro Deploy (Aguardando sincronização)..."
sleep 120

LATEST_APP_RUN=$(gh run list --repo "$GH_REPO" --workflow "deploy.yml" --limit 1 --json databaseId --jq '.[0].databaseId')
if [ -n "$LATEST_APP_RUN" ]; then
    gh run rerun "$LATEST_APP_RUN" --repo "$GH_REPO"
    echo "🚀 Re-run acionado para a Web App e Docker (Run ID: $LATEST_APP_RUN)."
fi

LATEST_FUNC_RUN=$(gh run list --repo "$GH_REPO" --workflow "deploy-function.yml" --limit 1 --json databaseId --jq '.[0].databaseId')
if [ -n "$LATEST_FUNC_RUN" ]; then
    gh run rerun "$LATEST_FUNC_RUN" --repo "$GH_REPO"
    echo "🚀 Re-run acionado para a Azure Function (Run ID: $LATEST_FUNC_RUN)."
fi

echo "--------------------------------------------------------"
echo "✅ [SUCESSO] Infraestrutura provisionada e pipelines ativados!"