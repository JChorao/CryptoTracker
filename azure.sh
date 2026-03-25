#!/bin/bash

set -e


# =============================================================================

#  CONFIGURAÇÕES - ALTERA ESTES VALORES

# =============================================================================

# Google Cloud

GCP_PROJECT_ID="cryptotracker" # Substitui pelo teu ID de projeto no GCP

GCP_LOCATION="eur3" # eur3 é multi-region (Europa)


# Azure

AZ_RG="rg-cryptotracker"

AZ_LOCATION="francecentral"

AZ_APP_NAME="cryptotracker-app-$RANDOM"

AZ_FUNC_NAME="cryptotracker-func-$RANDOM"

AZ_STORAGE="stcryptotrack$RANDOM"


# GitHub

GH_REPO="JChorao/CryptoTracker"


echo "------------------------------------------------------"

echo "🚀 INICIANDO SETUP HÍBRIDO: AZURE + GOOGLE FIRESTORE"

echo "------------------------------------------------------"


# --- PARTE 1: GOOGLE CLOUD (FIRESTORE) ---

echo "📌 [GOOGLE] A configurar projeto e Firestore..."

gcloud config set project "$GCP_PROJECT_ID"


# Criar a base de dados Firestore (se não existir)

# --type=firestore-native garante que usas o modo nativo

gcloud alpha firestore databases create \

    --location="$GCP_LOCATION" \

    --type=firestore-native || echo "⚠️ Firestore já existe ou erro na criação."


# Criar Service Account para a Azure Function

echo "📌 [GOOGLE] A criar Service Account para acesso externo..."

SA_NAME="azure-func-link"

gcloud iam service-accounts create $SA_NAME --display-name="Azure Function Firestore Access"


# Dar permissão de escrita no Firestore

gcloud projects add-iam-policy-binding "$GCP_PROJECT_ID" \

    --member="serviceAccount:$SA_NAME@$GCP_PROJECT_ID.iam.gserviceaccount.com" \

    --role="roles/datastore.user"


# Gerar a chave JSON e guardar localmente

gcloud iam service-accounts keys create google-key.json \

    --iam-account="$SA_NAME@$GCP_PROJECT_ID.iam.gserviceaccount.com"


# --- PARTE 2: AZURE (COMPUTE) ---

echo "📌 [AZURE] A criar Grupo de Recursos..."

az group create --name "$AZ_RG" --location "$AZ_LOCATION"


echo "📌 [AZURE] A criar App Service (B1)..."

az appservice plan create --name "plan-crypto" --resource-group "$AZ_RG" --sku B1 --is-linux

az webapp create --name "$AZ_APP_NAME" --resource-group "$AZ_RG" --plan "plan-crypto" --runtime "NODE|22-lts"


# Obter URL da App

APP_URL="https://$(az webapp show --name "$AZ_APP_NAME" --resource-group "$AZ_RG" --query "defaultHostName" -o tsv)"


echo "📌 [AZURE] A criar Function App (Serverless)..."

az storage account create --name "$AZ_STORAGE" --location "$AZ_LOCATION" --resource-group "$AZ_RG" --sku Standard_LRS

az functionapp create --name "$AZ_FUNC_NAME" --resource-group "$AZ_RG" --storage-account "$AZ_STORAGE" \

    --consumption-plan-location "$AZ_LOCATION" --runtime node --runtime-version 20 --functions-version 4 --os-type Linux


# Configurar Variáveis de Ambiente na Azure Function

az functionapp config appsettings set --name "$AZ_FUNC_NAME" --resource-group "$AZ_RG" --settings \

    APP_SERVICE_URL="$APP_URL" \

    GOOGLE_CLOUD_PROJECT="$GCP_PROJECT_ID" \

    GOOGLE_APPLICATION_CREDENTIALS="/home/site/wwwroot/google-key.json"


# --- PARTE 3: GITHUB SECRETS ---

echo "📌 [GITHUB] A configurar segredos para Deploy..."

az webapp deployment list-publishing-profiles --name "$AZ_APP_NAME" --resource-group "$AZ_RG" --xml > publish.xml

gh secret set AZURE_PUBLISH_PROFILE < publish.xml --repo "$GH_REPO"

gh secret set AZURE_APP_NAME --body "$AZ_APP_NAME" --repo "$GH_REPO"

rm publish.xml


echo "------------------------------------------------------"

echo "✅ SETUP CONCLUÍDO!"

echo "📍 Firestore Criado em: $GCP_LOCATION"

echo "🔑 Chave 'google-key.json' gerada (Mantém este ficheiro seguro!)"

echo "🌐 Web App: $APP_URL"

echo "------------------------------------------------------"