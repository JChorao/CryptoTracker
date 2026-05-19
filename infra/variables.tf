variable "location" {
  type        = string
  default     = "francecentral"
  description = "Região da Azure onde os recursos serão criados."
}

variable "project_name" {
  type        = string
  default     = "cryptotracker"
  description = "Nome base atribuído aos recursos do projeto."
}

variable "github_token" {
  type        = string
  sensitive   = true # Oculta o valor no terminal por segurança
  description = "O Personal Access Token (PAT) do GitHub obtido nas definições de programador."
}

variable "github_repository" {
  type        = string
  default     = "CryptoTracker"
  description = "O nome do teu repositório no GitHub."
}