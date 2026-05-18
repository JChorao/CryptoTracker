terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0" # Ou a versão mais recente estável
    }
  }
}

provider "azurerm" {
  features {}
}
