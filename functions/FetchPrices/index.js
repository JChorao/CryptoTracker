const axios = require('axios');
const { Firestore } = require('@google-cloud/firestore');

// Inicializa o Firestore (ele vai procurar a KEY nas variáveis de ambiente)
const firestore = new Firestore();

module.exports = async function (context, myTimer) {
    const coins = ['bitcoin', 'ethereum', 'solana', 'cardano'];
    const APP_SERVICE_URL = process.env.APP_SERVICE_URL + '/api/update-prices';

    try {
        // 1. Recolha de dados
        const { data } = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
            params: { ids: coins.join(','), vs_currencies: 'eur' }
        });

        const entry = {
            timestamp: new Date().toISOString(),
            prices: data
        };

        // 2. Gravar no Google Firestore (Coleção 'PriceHistory')
        await firestore.collection('PriceHistory').add(entry);
        context.log('✅ Dados persistidos no Google Firestore.');

        // 3. Notificar o App Service
        await axios.post(APP_SERVICE_URL, data);
        context.log('🚀 Frontend notificado.');

    } catch (err) {
        context.log.error('❌ Erro:', err.message);
    }
};