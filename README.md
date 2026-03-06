# 🚀 CryptoTracker — Computação em Nuvem (IPCB)

> Projeto desenvolvido para a unidade curricular de **Computação em Nuvem**  
> Politécnico de Castelo Branco — Escola Superior de Tecnologia  
> **João Oliveira** · **Tiago Pinheiro** · **Tiago Covas** — Janeiro 2026

---

## 📁 Estrutura do Projeto

```
cryptotracker/
├── app.js                        # Servidor Node.js
├── azure.sh                      # Cria a IAS no Azure
├── package.json                  # Dependências do projeto
├── package-lock.json
├── .gitignore                    # Ficheiros ignorados pelo Git
├── .github/
│   └── workflows/
│       └── deploy.yml            # GitHub Actions — CI/CD automático para Azure
└── views/
    └── index.ejs                 # Index da APP
```

---

## ☁️ Arquitetura Azure

| Serviço | Função | Estado |
|---|---|---|
| **Azure App Service** | Servidor web Node.js com deploy via GitHub | ✅ Concluído |
| **Azure Function** | Recolha periódica de dados (CoinGecko API) | 🔜 Fase 2 |
| **Azure Cosmos DB** | Base de dados NoSQL para histórico de preços | 🔜 Fase 2 |
| **Azure Blob Storage** | Armazenamento de relatórios gerados | 🔜 Fase 3 |
| **Azure Container Instance** | Docker container para processamento pesado | 🔜 Fase 3 |
| **Terraform** | Provisionamento automático de infraestrutura (IaC) | 🔜 Fase 4 |

---

## ⚙️ Pré-requisitos

Antes de começar, garante que tens instalado:

- [Node.js 22+](https://nodejs.org/)
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
git remote add origin https://github.com/JChorao/CryptoTracker.git
git push -u origin main
```

---

### 2. Instalar dependências

```bash
npm install
```

---

### 3. Executar o script de setup Azure

> ⚠️ **Antes de executar**, abre o ficheiro `azure.sh` e edita as variáveis no topo:

```bash
RESOURCE_GROUP="rg-cryptotracker"      # nome do grupo de recursos
APP_NAME="cryptotracker-app-$RANDOM"   # Numero torna aleatorio
GITHUB_REPO="https://github.com/JChorao/CryptoTracker"
```

Depois executa:

```bash
bash azure.sh
```

O script faz automaticamente:
1. Login no Azure (`az login`)
2. Cria o **Resource Group**
3. Cria o **App Service Plan** (Free tier, Linux)
4. Cria a **Web App** com Node.js 22
5. Configura variáveis de ambiente (`NODE_ENV`, `PORT`)
6. Liga ao repositório GitHub
7. Gera o ficheiro `publish-profile.xml`

---

### 4. Verificar Secrets no GitHub

Como o script utiliza a GitHub CLI, os secrets são configurados automaticamente! Não precisas de os adicionar à mão nem de lidar com ficheiros XML.

Se quiseres confirmar que tudo correu bem, vai ao teu repositório no GitHub:

```
GitHub → Settings → Secrets and variables → Actions
```

Deves ver lá criados os seguintes Repository secrets:

AZURE_APP_NAME

AZURE_PUBLISH_PROFILE

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

## 📊 Planeamento (Diagrama de Gantt)

| Tarefa | S1 | S2 | S3 | S4 | S5 | S6 | S7 | S8 | S9 | S10 | S11 | S12 | S13 |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Brainstorming / Relatório 1ª Fase | ✅ | | | | | | | | | | | | |
| Implementação App Service + GitHub | | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | |
| Implementação Azure Function | | ✅ | ✅ | ✅ | | | | | | | | | |
| Implementação Cosmos DB | | ✅ | ✅ | ✅ |  |  | | | | | | | |
| Implementação Blob Storage | | | | | ✅ | ✅ | ✅ | ✅ | | | | | |
| Implementação Docker | | | | | ✅ | ✅ | ✅ | ✅ | | | | | |
| Relatório 2ª Fase | | | | | | |  | ✅ | | | | | |
| Implementação Terraform | | | | | | | | | ✅ | ✅ | ✅ | ✅ | |
| Testes & Correção de Bugs | | | | | | | | | ✅ | ✅ | ✅ | ✅ | |
| Relatório Final | | | | | | | | | | | | | ✅ |

> Semanas entre **23 de fevereiro** e **22 de maio de 2026**

---

## ❗ Problemas Comuns

**O deploy falha no GitHub Actions**
- Verifica no GitHub se os secrets `AZURE_APP_NAME` e `AZURE_PUBLISH_PROFILE` foram efetivamente criados pelo script.

**Erro "App name already exists"**
- O nome da app tem de ser único globalmente no Azure — o sufixo `$RANDOM` no script normalmente resolve isto, mas podes tentar alterar manualmente no `azure.sh`.

**A app demora a responder na primeira visita**
- A app demora a responder na primeira visita

**`az login` não abre o browser**
- Usa `az login --use-device-code` como alternativa

---

## 👥 Autores

| Nome | Nº Aluno |
|---|---|
| João Oliveira | 20200666 |
| Tiago Pinheiro | 20211822 |
| Tiago Covas | 20221209 |