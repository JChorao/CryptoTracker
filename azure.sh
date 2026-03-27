#!/bin/bash
set -e

# =============================================================================
#  CONFIGURAÇÕES GERAIS
# =============================================================================

AZ_LOCATION="francecentral"

# Sufixo aleatório para garantir unicidade global
ID=$RANDOM
AZ_RG="rg-cryptotracker-$ID"
AZ_APP_NAME="cryptotracker-app-$ID"
AZ_FUNC_NAME="cryptotracker-func-$ID"
AZ_STORAGE="stcryptotrack$ID"
AZ_COSMOS_ACCOUNT="cosmos-crypto-$ID"

AZ_COSMOS_DB="CryptoDB"
AZ_COSMOS_CONTAINER="PriceHistory"
GH_REPO="JChorao/CryptoTracker" # <-- Confirma se é o teu repositório

# Garante que o Git Bash no Windows não estraga nenhum caminho que comece por "/"
export MSYS_NO_PATHCONV=1

echo "------------------------------------------------------------------"
echo "🚀 SETUP FINAL: INFRAESTRUTURA + TOKEN AUTH + AUTO-RERUN"
echo "------------------------------------------------------------------"

echo "📌 A criar Grupo de Recursos..."
az group create --name "$AZ_RG" --location "$AZ_LOCATION"

echo "📌 A criar Cosmos DB (Standard - 400 RU/s)..."
az cosmosdb create --name "$AZ_COSMOS_ACCOUNT" --resource-group "$AZ_RG" \
    --kind GlobalDocumentDB --locations regionName="$AZ_LOCATION" failoverPriority=0

echo "📌 A configurar Base de Dados e Contentor..."
az cosmosdb sql database create --account-name "$AZ_COSMOS_ACCOUNT" \
    --resource-group "$AZ_RG" --name "$AZ_COSMOS_DB"

az cosmosdb sql container create \
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
az webapp config appsettings set --name "$AZ_APP_NAME" --resource-group "$AZ_RG" --settings \
    COSMOS_CONNECTION_STRING="$COSMOS_CONN" COSMOS_DB_NAME="$AZ_COSMOS_DB" COSMOS_CONTAINER_NAME="$AZ_COSMOS_CONTAINER" > /dev/null

az functionapp config appsettings set --name "$AZ_FUNC_NAME" --resource-group "$AZ_RG" --settings \
    COSMOS_CONNECTION_STRING="$COSMOS_CONN" COSMOS_DB_NAME="$AZ_COSMOS_DB" COSMOS_CONTAINER_NAME="$AZ_COSMOS_CONTAINER" APP_SERVICE_URL="$APP_URL" > /dev/null

echo "📌 🔐 A gerar Identidade Segura (Service Principal Token)..."
# TRUQUE DE MESTRE: Buscar o Scope exato diretamente à Azure para evitar o bug do Git Bash
RG_SCOPE=$(az group show --name "$AZ_RG" --query id -o tsv)

SP_JSON=$(az ad sp create-for-rbac --name "CryptoDeploy-$ID" \
                                   --role contributor \
                                   --scopes "$RG_SCOPE" \
                                   --sdk-auth)

echo "📌 A enviar Secrets para o GitHub..."
gh secret set AZURE_CREDENTIALS --body "$SP_JSON" --repo "$GH_REPO"
gh secret set AZURE_APP_NAME --body "$AZ_APP_NAME" --repo "$GH_REPO"
gh secret set AZURE_FUNC_NAME --body "$AZ_FUNC_NAME" --repo "$GH_REPO"

echo "------------------------------------------------------------------"
echo "🤖 A INICIAR DEPLOYS AUTOMÁTICOS NO GITHUB ACTIONS..."
echo "------------------------------------------------------------------"
sleep 5 

WEB_RUN_ID=$(gh run list --workflow=deploy.yml --limit 1 --json databaseId -q '.[0].databaseId')
if [ -n "$WEB_RUN_ID" ]; then
    echo "▶️ A relançar o deploy da Web App (Run ID: $WEB_RUN_ID)..."
    gh run rerun $WEB_RUN_ID || echo "⚠️ Não foi possível relançar a Web App."
fi

FUNC_RUN_ID=$(gh run list --workflow=deploy-function.yml --limit 1 --json databaseId -q '.[0].databaseId')
if [ -n "$FUNC_RUN_ID" ]; then
    echo "▶️ A relançar o deploy da Azure Function (Run ID: $FUNC_RUN_ID)..."
    gh run rerun $FUNC_RUN_ID || echo "⚠️ Não foi possível relançar a Function."
fi

echo "✅ TUDO PRONTO! Os deploys estão a correr agora mesmo no GitHub."
echo "🌐 Web App URL: $APP_URL"
echo "⚡ Function Name: $AZ_FUNC_NAME"