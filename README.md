# 🚀 CryptoTracker — Computação em Nuvem (IPCB)

> Projeto desenvolvido para a unidade curricular de **Computação em Nuvem**  
> Politécnico de Castelo Branco — Escola Superior de Tecnologia  
> **João Oliveira** · **Tiago Pinheiro** · **Tiago Covas** — Janeiro 2026

---

## 📁 Estrutura do Projeto

```
cryptotracker/
├── app.js                        # Servidor Node.js (Express + API CoinGecko)
├── package.json                  # Dependências do projeto
├── .gitignore                    # Ficheiros ignorados pelo Git
└── .github/
    └── workflows/
        └── deploy.yml            # GitHub Actions — CI/CD automático para Azure
```

---

## ☁️ Arquitetura Azure

| Serviço | Função | Estado |
|---|---|---|
| **Azure App Service** | Servidor web Node.js com deploy via GitHub | ✅ Fase 1 |
| **Azure Function** | Recolha periódica de dados (CoinGecko API) | 🔜 Fase 2 |
| **Azure Cosmos DB** | Base de dados NoSQL para histórico de preços | 🔜 Fase 2 |
| **Azure Blob Storage** | Armazenamento de relatórios gerados | 🔜 Fase 3 |
| **Azure Container Instance** | Docker container para processamento pesado | 🔜 Fase 3 |
| **Terraform** | Provisionamento automático de infraestrutura (IaC) | 🔜 Fase 4 |

---

## ⚙️ Pré-requisitos

Antes de começar, garante que tens instalado:

- [Node.js 18+](https://nodejs.org/)
- [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli)
- [Git](https://git-scm.com/)
- Uma conta [Microsoft Azure](https://portal.azure.com) ativa
- Um repositório GitHub criado

---

## 🛠️ Passo a Passo — App Service + GitHub

### 1. Clonar / Inicializar o repositório

```bash
git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/SEU_UTILIZADOR/SEU_REPOSITORIO.git
git push -u origin main
```

---

### 2. Instalar dependências localmente

```bash
npm install
```

Testar localmente:

```bash
npm start
# App disponível em http://localhost:3000
```

---

### 3. Executar o script de setup Azure

> ⚠️ **Antes de executar**, abre o ficheiro `setup-azure.sh` e edita as variáveis no topo:

```bash
RESOURCE_GROUP="rg-cryptotracker"      # nome do grupo de recursos
APP_NAME="cryptotracker-app"           # ⚠️ tem de ser único globalmente no Azure
GITHUB_REPO="https://github.com/SEU_UTILIZADOR/SEU_REPOSITORIO"
```

Depois executa:

```bash
bash setup-azure.sh
```

O script faz automaticamente:
1. Login no Azure (`az login`)
2. Cria o **Resource Group**
3. Cria o **App Service Plan** (Free tier, Linux)
4. Cria a **Web App** com Node.js 18
5. Configura variáveis de ambiente (`NODE_ENV`, `PORT`)
6. Liga ao repositório GitHub
7. Gera o ficheiro `publish-profile.xml`

---

### 4. Configurar Secrets no GitHub

Após o script terminar, vai ao teu repositório no GitHub:

```
GitHub → Settings → Secrets and variables → Actions → New repository secret
```

Adiciona os seguintes secrets:

| Nome do Secret | Valor |
|---|---|
| `AZURE_APP_NAME` | Nome da tua app (ex: `cryptotracker-app`) |
| `AZURE_PUBLISH_PROFILE` | Conteúdo completo do ficheiro `publish-profile.xml` |

> 💡 Abre o `publish-profile.xml` com um editor de texto, seleciona tudo (Ctrl+A) e cola no campo do secret.

---

### 5. Fazer Deploy

A partir deste momento, **qualquer push para a branch `main`** dispara o deploy automático:

```bash
git add .
git commit -m "update"
git push origin main
```

Podes acompanhar o deploy em:
```
GitHub → Actions → Deploy CryptoTracker → Azure App Service
```

---

## 🌐 Endpoints Disponíveis

| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/` | Página inicial |
| `GET` | `/api/health` | Estado do servidor |
| `GET` | `/api/crypto` | Top 10 criptomoedas em EUR |
| `GET` | `/api/crypto/:coin` | Preço de uma moeda específica |

**Exemplos:**
```
https://cryptotracker-app.azurewebsites.net/api/health
https://cryptotracker-app.azurewebsites.net/api/crypto
https://cryptotracker-app.azurewebsites.net/api/crypto/bitcoin
https://cryptotracker-app.azurewebsites.net/api/crypto/ethereum
```

---

## 📊 Planeamento (Diagrama de Gantt)

| Semanas | Tarefa |
|---|---|
| 1 | Brainstorming, definição da arquitetura e Relatório 1ª Fase ✅ |
| 2–3 | Azure App Service + GitHub CI/CD ✅ |
| 3–5 | Azure Function + CoinGecko API |
| 4–6 | Azure Cosmos DB |
| 5–7 | Azure Blob Storage |
| 6–8 | Docker Container (ACI) + Relatório 2ª Fase |
| 9–11 | Terraform (IaC) |
| 10–12 | Testes & Correção de bugs |
| 13 | Relatório Final & Entrega |

---

## ❗ Problemas Comuns

**O deploy falha no GitHub Actions**
- Verifica se os secrets `AZURE_APP_NAME` e `AZURE_PUBLISH_PROFILE` estão corretos
- Confirma que o `publish-profile.xml` foi copiado na íntegra (incluindo as tags XML)

**Erro "App name already exists"**
- O nome da app tem de ser único globalmente no Azure — tenta `cryptotracker-app-ipcb` ou similar

**A app retorna erro 503**
- O Free tier pode demorar ~30 segundos a "acordar" na primeira visita (cold start)

**`az login` não abre o browser**
- Usa `az login --use-device-code` como alternativa

---

## 👥 Autores

| Nome | Nº Aluno |
|---|---|
| João Oliveira | 20200666 |
| Tiago Pinheiro | 20211822 |
| Tiago Covas | 20221209 |