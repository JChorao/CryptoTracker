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
        
        resources.reverse().forEach(item => {
            Object.keys(item.prices).forEach(coin => {
                if (coinData[coin]) {
                    coinData[coin].push({ 
                        price: item.prices[coin].eur, 
                        timestamp: item.timestamp 
                    });
                }
            });
        });

        res.render('index', { coinData });
    } catch (err) {
        console.error("⚠️ Erro ao ler do Cosmos DB:", err.message);
        res.render('index', { coinData: { bitcoin: [], ethereum: [], solana: [], cardano: [] } });
    }
});

// Endpoint de atualização em tempo real (chamado pela Azure Function)
app.post('/api/update-prices', (req, res) => {
    console.log('📥 Atualização recebida da Azure Function:', JSON.stringify(req.body));
    io.emit('priceUpdate', req.body); 
    res.status(200).send('Broadcast efetuado com sucesso');
});

server.listen(PORT, () => console.log(`🚀 Servidor a correr na porta ${PORT}`));