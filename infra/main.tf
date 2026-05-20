# 1. Grupo de Recursos
resource "azurerm_resource_group" "rg" {
  name     = "rg-${var.project_name}-${random_string.suffix.result}"
  location = var.location
}

# 2. Cosmos DB
resource "azurerm_cosmosdb_account" "cosmos" {
  name                = "cosmos-crypto-${random_string.suffix.result}"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  offer_type          = "Standard"
  kind                = "GlobalDocumentDB"

  consistency_policy {
    consistency_level = "Session"
  }

  geo_location {
    location          = azurerm_resource_group.rg.location
    failover_priority = 0
  }
}

resource "azurerm_cosmosdb_sql_database" "db" {
  name                = "CryptoDB"
  resource_group_name = azurerm_resource_group.rg.name
  account_name        = azurerm_cosmosdb_account.cosmos.name
  depends_on          = [azurerm_cosmosdb_account.cosmos]
}

resource "azurerm_cosmosdb_sql_container" "container" {
  name                = "PriceHistory"
  resource_group_name = azurerm_resource_group.rg.name
  account_name        = azurerm_cosmosdb_account.cosmos.name
  database_name       = azurerm_cosmosdb_sql_database.db.name
  partition_key_paths = ["/partitionKey"]
  throughput          = 400
  depends_on          = [azurerm_cosmosdb_sql_database.db]
}

# 3. Azure Container Registry (Adicionado para suportar o Docker de Relatórios)
resource "azurerm_container_registry" "acr" {
  name                = "acrcrypto${random_string.suffix.result}"
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  sku                 = "Basic"
  admin_enabled       = true
}

# 4. Storage Account para os Relatórios (Adicionado)
resource "azurerm_storage_account" "st_reports" {
  name                     = "streports${random_string.suffix.result}"
  resource_group_name      = azurerm_resource_group.rg.name
  location                 = azurerm_resource_group.rg.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
}

# 5. App Service Plan para a Web App (Linux - B1)
resource "azurerm_service_plan" "plan" {
  name                = "plan-crypto-${random_string.suffix.result}"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  os_type             = "Linux"
  sku_name            = "B1"
}

# 6. Web App (Linux, Node 20-lts com suporte a Node 24 em runtime)
resource "azurerm_linux_web_app" "webapp" {
  name                = "cryptotracker-app-${random_string.suffix.result}"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  service_plan_id     = azurerm_service_plan.plan.id

  site_config {
    application_stack {
      node_version = "20-lts"
    }
  }

  app_settings = {
    "COSMOS_CONNECTION_STRING"        = azurerm_cosmosdb_account.cosmos.primary_sql_connection_string
    "COSMOS_DB_NAME"                  = azurerm_cosmosdb_sql_database.db.name
    "COSMOS_CONTAINER_NAME"           = azurerm_cosmosdb_sql_container.container.name
    "AZURE_STORAGE_CONNECTION_STRING" = azurerm_storage_account.st_reports.primary_connection_string
    "WEBSITE_RUN_FROM_PACKAGE"        = "1"
    "SCM_DO_BUILD_DURING_DEPLOYMENT"  = "true"
  }

  depends_on = [
    azurerm_cosmosdb_sql_container.container,
    azurerm_storage_account.st_reports
  ]
}

# 7. Storage Account para a Function App
resource "azurerm_storage_account" "st" {
  name                     = "stcryptotrack${random_string.suffix.result}"
  resource_group_name      = azurerm_resource_group.rg.name
  location                 = azurerm_resource_group.rg.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
}

# 8. Service Plan dedicado à Function App (Serverless Consumption - Y1)
resource "azurerm_service_plan" "plan_func" {
  name                = "plan-func-${random_string.suffix.result}"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  os_type             = "Linux"
  sku_name            = "Y1"
}

# 9. Function App em Linux
resource "azurerm_linux_function_app" "func" {
  name                = "cryptotracker-func-${random_string.suffix.result}"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name

  storage_account_name       = azurerm_storage_account.st.name
  storage_account_access_key = azurerm_storage_account.st.primary_access_key
  service_plan_id            = azurerm_service_plan.plan_func.id

  site_config {
    application_stack {
      node_version = "20"
    }
  }

  app_settings = {
    "COSMOS_CONNECTION_STRING"     = azurerm_cosmosdb_account.cosmos.primary_sql_connection_string
    "COSMOS_DB_NAME"               = azurerm_cosmosdb_sql_database.db.name
    "COSMOS_CONTAINER_NAME"        = azurerm_cosmosdb_sql_container.container.name
    "APP_SERVICE_URL"              = "https://${azurerm_linux_web_app.webapp.default_hostname}"
    "FUNCTIONS_WORKER_RUNTIME"     = "node"
    "WEBSITE_NODE_DEFAULT_VERSION" = "~24"
  }

  depends_on = [azurerm_linux_web_app.webapp, azurerm_storage_account.st]
}

# =====================================================================
# AUTOMATIZAÇÃO GITHUB SECRETS
# =====================================================================

resource "github_actions_secret" "secret_app_name" {
  repository      = var.github_repository
  secret_name     = "AZURE_APP_NAME"
  plaintext_value = azurerm_linux_web_app.webapp.name
}

resource "github_actions_secret" "secret_func_name" {
  repository      = var.github_repository
  secret_name     = "AZURE_FUNC_NAME"
  plaintext_value = azurerm_linux_function_app.func.name
}

resource "github_actions_secret" "secret_acr_name" {
  repository      = var.github_repository
  secret_name     = "AZURE_ACR_NAME"
  plaintext_value = azurerm_container_registry.acr.name
}

output "web_app_url" {
  value       = "https://${azurerm_linux_web_app.webapp.default_hostname}"
  description = "URL público da aplicação Web."
}