const axios = require('axios');
const { CosmosClient } = require("@azure/cosmos");

// Reutilização de instâncias para performance
const client = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
const container = client.database(process.env.COSMOS_DB_NAME).container(process.env.COSMOS_CONTAINER_NAME);

module.exports = async function (context, myTimer) {
    const coins = ['bitcoin', 'ethereum', 'solana', 'cardano'];
    const updateUrl = `${process.env.APP_SERVICE_URL}/api/update-prices`;

    context.log('⚡ Iniciando recolha de preços...');

    try {
        // 1. Procurar preços na CoinGecko
        const { data } = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
            params: { ids: coins.join(','), vs_currencies: 'eur' }
        });

        context.log('📊 Dados recebidos da API:', JSON.stringify(data, null, 2));

        const entry = {
            partitionKey: "crypto_data",
            timestamp: new Date().toISOString(),
            prices: data
        };

        // 2. Gravar no Cosmos DB
        await container.items.create(entry);
        context.log('✅ Dados guardados com sucesso no Cosmos DB.');

        // 3. Notificar a Web App (para os WebSockets)
        try {
            await axios.post(updateUrl, data);
            context.log(`🚀 Web App notificada com sucesso em: ${updateUrl}`);
        } catch (postErr) {
            context.log.error('⚠️ Falha ao notificar a Web App. Confirme se está online:', postErr.message);
        }

    } catch (err) {
        context.log.error('❌ Erro crítico:', err.message);
        if (err.response) context.log.error('Detalhes da API:', err.response.data);
    }
};