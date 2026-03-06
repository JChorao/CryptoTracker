#!/bin/bash
# =============================================================================
#  CryptoTracker — Setup Azure App Service (Tier B1) + GitHub Deploy
# =============================================================================

set -e  # Interrompe o script se houver algum erro

# ─── CONFIGURAÇÕES ───────────────────────────────────────────────────────────
RESOURCE_GROUP="rg-cryptotracker"
LOCATION="francecentral"
APP_SERVICE_PLAN="plan-cryptotracker"
APP_NAME="cryptotracker-app-$RANDOM"  
GITHUB_REPO="https://github.com/JChorao/CryptoTracker"
GITHUB_BRANCH="main"
NODE_VERSION="NODE|22-lts"

echo "============================================="
echo "  🚀 CryptoTracker — Azure App Service Setup"
echo "============================================="

# ─── 1. CRIAR RESOURCE GROUP ─────────────────────────────────────────────────
echo ""
echo "📌 Passo 1: Criar Resource Group '$RESOURCE_GROUP' em '$LOCATION'..."
az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION"
echo "✅ Resource Group criado."

# ─── 2. CRIAR APP SERVICE PLAN (Tier B1) ─────────────────────────────────────
echo ""
echo "📌 Passo 2: Criar App Service Plan '$APP_SERVICE_PLAN' (Tier B1)..."
az appservice plan create \
  --name "$APP_SERVICE_PLAN" \
  --resource-group "$RESOURCE_GROUP" \
  --sku B1 \
  --is-linux
echo "✅ App Service Plan criado."

# ─── 3. CRIAR WEB APP ────────────────────────────────────────────────────────
echo ""
echo "📌 Passo 3: Criar Web App '$APP_NAME' com Node.js..."
az webapp create \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --plan "$APP_SERVICE_PLAN" \
  --runtime "$NODE_VERSION"
echo "✅ Web App criada."

# ─── 4. CONFIGURAR VARIÁVEIS DE AMBIENTE ─────────────────────────────────────
echo ""
echo "📌 Passo 4: Configurar variáveis de ambiente..."
az webapp config appsettings set \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --settings \
    NODE_ENV="production" \
    PORT="8080"
echo "✅ Variáveis configuradas."

# ─── 5. ATIVAR SCM BASIC AUTHENTICATION (CORREÇÃO) ───────────────────────────
echo ""
echo "📌 Passo 5: Ativar SCM Basic Authentication..."
az resource update \
  --resource-group "$RESOURCE_GROUP" \
  --name scm \
  --namespace Microsoft.Web \
  --resource-type basicPublishingCredentialsPolicies \
  --parent sites/"$APP_NAME" \
  --set properties.allow=true
echo "✅ SCM Basic Auth ativado."

# ─── 6. LIGAR AO GITHUB (CI/CD) ──────────────────────────────────────────────
echo ""
echo "📌 Passo 6: Configurar integração com repositório GitHub..."
az webapp deployment source config \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --repo-url "$GITHUB_REPO" \
  --branch "$GITHUB_BRANCH" \
  --repository-type github

echo "✅ Repositório ligado."

# ─── 7. OBTER PUBLISH PROFILE E CONFIGURAR GITHUB SECRETS ────────────────────
echo ""
echo "📌 Passo 7: A extrair Publish Profile e a configurar Secrets no GitHub..."