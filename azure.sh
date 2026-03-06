#!/bin/bash
# =============================================================================
#  CryptoTracker — Setup Azure App Service + GitHub Deploy
#  Executar: bash setup-azure.sh
# =============================================================================

set -e  # para se houver erro

# ─── CONFIGURAÇÕES (edita aqui) ──────────────────────────────────────────────
RESOURCE_GROUP="rg-cryptotracker"
LOCATION="westeurope"
APP_SERVICE_PLAN="plan-cryptotracker"
APP_NAME="cryptotracker-app"          # ⚠️ tem de ser único globalmente no Azure
GITHUB_REPO="https://github.com/JChorao/CryptoTracker"
GITHUB_BRANCH="main"
NODE_VERSION="NODE|18-lts"

echo "============================================="
echo "  🚀 CryptoTracker — Azure App Service Setup"
echo "============================================="

# ─── 1. LOGIN ────────────────────────────────────────────────────────────────
echo ""
echo "📌 Passo 1: Login no Azure..."
az login

# ─── 2. CRIAR RESOURCE GROUP ─────────────────────────────────────────────────
echo ""
echo "📌 Passo 2: Criar Resource Group '$RESOURCE_GROUP' em '$LOCATION'..."
az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION"
echo "✅ Resource Group criado."

# ─── 3. CRIAR APP SERVICE PLAN (FREE tier) ───────────────────────────────────
echo ""
echo "📌 Passo 3: Criar App Service Plan '$APP_SERVICE_PLAN' (Free tier)..."
az appservice plan create \
  --name "$APP_SERVICE_PLAN" \
  --resource-group "$RESOURCE_GROUP" \
  --sku FREE \
  --is-linux
echo "✅ App Service Plan criado."

# ─── 4. CRIAR WEB APP ────────────────────────────────────────────────────────
echo ""
echo "📌 Passo 4: Criar Web App '$APP_NAME' com Node.js..."
az webapp create \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --plan "$APP_SERVICE_PLAN" \
  --runtime "$NODE_VERSION"
echo "✅ Web App criada."

# ─── 5. CONFIGURAR VARIÁVEIS DE AMBIENTE ─────────────────────────────────────
echo ""
echo "📌 Passo 5: Configurar variáveis de ambiente..."
az webapp config appsettings set \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --settings \
    NODE_ENV="production" \
    PORT="8080"
echo "✅ Variáveis de ambiente configuradas."

# ─── 6. LIGAR AO GITHUB (CI/CD) ──────────────────────────────────────────────
echo ""
echo "📌 Passo 6: Ligar ao repositório GitHub para deploy automático..."
az webapp deployment source config \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --repo-url "$GITHUB_REPO" \
  --branch "$GITHUB_BRANCH" \
  --manual-integration
echo "✅ Repositório GitHub ligado."

# ─── 7. OBTER PUBLISH PROFILE (para GitHub Actions) ──────────────────────────
echo ""
echo "📌 Passo 7: A obter o Publish Profile para GitHub Actions..."
az webapp deployment list-publishing-profiles \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --xml > publish-profile.xml
echo "✅ Publish Profile guardado em 'publish-profile.xml'"
echo ""
echo "⚠️  IMPORTANTE: Copia o conteúdo de 'publish-profile.xml' e adiciona"
echo "    como secret no GitHub com o nome: AZURE_PUBLISH_PROFILE"
echo "    GitHub → Settings → Secrets → Actions → New repository secret"

# ─── 8. MOSTRAR URL DA APP ────────────────────────────────────────────────────
echo ""
echo "============================================="
APP_URL=$(az webapp show \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query "defaultHostName" -o tsv)
echo "🌐 App disponível em: https://$APP_URL"
echo "============================================="
echo ""
echo "✅ Setup concluído! Faz push para a branch 'main' para fazer deploy."