const axios = require('axios');
const { CosmosClient } = require("@azure/cosmos");

// Inicializa a ligação fora da função principal para melhor performance
const client = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
const container = client.database(process.env.COSMOS_DB_NAME).container(process.env.COSMOS_CONTAINER_NAME);

module.exports = async function (context, myTimer) {
    const coins = ['bitcoin', 'ethereum', 'solana', 'cardano'];
    const updateUrl = `${process.env.APP_SERVICE_URL}/api/update-prices`;

    try {
        // 1. Vai buscar os preços à API
        const { data } = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
            params: { ids: coins.join(','), vs_currencies: 'eur' }
        });

        const entry = {
            partitionKey: "crypto_data", // Chave estática para facilitar a query
            timestamp: new Date().toISOString(),
            prices: data
        };

        // 2. Grava na Base de Dados Cosmos DB
        await container.items.create(entry);
        context.log('✅ Dados guardados com sucesso no Cosmos DB.');

        // 3. Avisa o Web App para atualizar os gráficos em tempo real
        await axios.post(updateUrl, data);
        context.log('🚀 Web App notificado via POST.');

    } catch (err) {
        context.log.error('❌ Ocorreu um erro:', err.message);
    }
};