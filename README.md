# CryptoTracker 🪙

Aplicação de monitorização de preços de criptomoedas em tempo real, integrando APIs externas e infraestrutura automatizada.

## 🛠️ Tecnologias Utilizadas
* **Backend:** Node.js & Express
* **Frontend:** EJS (Embedded JavaScript templates)
* **Cloud:** Azure Functions
* **Infraestrutura:** Terraform (Infrastructure as Code)
* **API:** CoinGecko / Crypto API integration

## 🏗️ Infraestrutura (IaC)
Diferente de deployments manuais, este projeto utiliza **Terraform** para provisionar os recursos na Azure. Isso garante que a base de dados, as service plans e as Functions sejam replicáveis e versionadas.

## 🌟 Destaques
* **Serverless:** Utilização de Azure Functions para busca periódica de preços (FetchPrices).
* **Automação:** Deployment automatizado via GitHub Actions.
* **Visualização:** Dashboard simples e funcional para acompanhamento de ativos.

## 🔧 Configuração
1. Configure as suas credenciais Azure no CLI.
2. Navegue até a pasta de infraestrutura.
3. Execute `terraform init` e `terraform apply`.
