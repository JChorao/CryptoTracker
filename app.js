const express = require('express');
const http = require('http');
const path = require('path');
const { CosmosClient } = require("@azure/cosmos");
const socketio = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketio(server);
const PORT = process.env.PORT || 3000;

// Configuração do Cosmos DB
const client = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
const container = client.database(process.env.COSMOS_DB_NAME).container(process.env.COSMOS_CONTAINER_NAME);

app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// Rota principal: carrega histórico do Cosmos DB
app.get('/', async (req, res) => {
    try {
        const { resources } = await container.items
            .query("SELECT TOP 60 * FROM c WHERE c.partitionKey = 'crypto_data' ORDER BY c.timestamp DESC")
            .fetchAll();

        let coinData = { bitcoin: [], ethereum: [], solana: [], cardano: [] };
        
        // Inverter para que o gráfico mostre do mais antigo para o mais recente (da esquerda para a direita)
        resources.reverse().forEach(item => {
            if (item.prices) {
                Object.keys(item.prices).forEach(coin => {
                    if (coinData[coin]) {
                        coinData[coin].push({ 
                            price: item.prices[coin].eur, 
                            timestamp: item.timestamp 
                        });
                    }
                });
            }
        });

        res.render('index', { coinData });
    } catch (err) {
        console.error("⚠️ Erro ao ler do Cosmos DB:", err.message);
        res.render('index', { coinData: { bitcoin: [], ethereum: [], solana: [], cardano: [] } });
    }
});

// Endpoint de atualização em tempo real (chamado pela Azure Function)
app.post('/api/update-prices', (req, res) => {
    // Extraímos apenas o valor numérico (eur) para enviar ao browser
    const simplifiedPrices = {};
    Object.keys(req.body).forEach(coin => {
        if (req.body[coin] && req.body[coin].eur) {
            simplifiedPrices[coin] = req.body[coin].eur;
        }
    });

    console.log('📥 Real-time update broadcast:', JSON.stringify(simplifiedPrices));
    io.emit('priceUpdate', simplifiedPrices); 
    res.status(200).send('OK');
});

server.listen(PORT, () => console.log(`🚀 Servidor Web App (Node 24) na porta ${PORT}`));