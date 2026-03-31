const axios = require('axios');
const { CosmosClient } = require("@azure/cosmos");

// Inicializa a ligação fora da função para reutilização de instâncias (performance)
const client = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
const container = client.database(process.env.COSMOS_DB_NAME).container(process.env.COSMOS_CONTAINER_NAME);

module.exports = async function (context, myTimer) {
    const coins = ['bitcoin', 'ethereum', 'solana', 'cardano'];
    const updateUrl = `${process.env.APP_SERVICE_URL}/api/update-prices`;

    context.log('⚡ Iniciando recolha de preços...');

    try {
        // 1. Procura preços na API CoinGecko
        const { data } = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
            params: { ids: coins.join(','), vs_currencies: 'eur' }
        });

        // DEBUG: Imprime os dados recebidos na consola da Azure
        context.log('📊 Dados recebidos da API:', JSON.stringify(data, null, 2));

        const entry = {
            partitionKey: "crypto_data",
            timestamp: new Date().toISOString(),
            prices: data
        };

        // 2. Grava no Cosmos DB
        await container.items.create(entry);
        context.log('✅ Dados guardados com sucesso no Cosmos DB.');

        // 3. Notifica a Web App via POST para atualização em tempo real (Socket.io)
        try {
            await axios.post(updateUrl, data);
            context.log(`🚀 Web App notificado com sucesso em: ${updateUrl}`);
        } catch (postErr) {
            context.log.error('⚠️ Falha ao notificar Web App (verificar se a app está online):', postErr.message);
        }

    } catch (err) {
        context.log.error('❌ Erro crítico na execução:', err.message);
        if (err.response) {
            context.log.error('Datalhes do erro API:', err.response.data);
        }
    }
};