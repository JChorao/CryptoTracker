import {
  to = azurerm_storage_account.storage
  id = "/subscriptions/A_TUA_SUBSCRIPTION_ID/resourceGroups/rg-cryptotracker-${var.infra_id}/providers/Microsoft.Storage/storageAccounts/stcryptotrack${var.infra_id}"
}

resource "azurerm_storage_account" "storage" {
  name                     = "stcryptotrack${var.infra_id}"
  resource_group_name      = azurerm_resource_group.rg.name
  location                 = azurerm_resource_group.rg.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
}

import {
  to = azurerm_cosmosdb_account.cosmos
  id = "/subscriptions/A_TUA_SUBSCRIPTION_ID/resourceGroups/rg-cryptotracker-${var.infra_id}/providers/Microsoft.DocumentDB/databaseAccounts/cosmos-crypto-${var.infra_id}"
}

resource "azurerm_cosmosdb_account" "cosmos" {
  name                = "cosmos-crypto-${var.infra_id}"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  offer_type          = "???"
  kind                = "???"

  consistency_policy {
    consistency_level       = "Session"
  }

  geo_location {
    location          = azurerm_resource_group.rg.location
    failover_priority = 0
  }
}