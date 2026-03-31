const express = require('express');
const http = require('http');
const path = require('path');
const { CosmosClient } = require("@azure/cosmos");
const socketio = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketio(server);
const PORT = process.env.PORT || 3000;

// Configuração do Cosmos DB - As variáveis são injetadas pelo script azure.sh
const client = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
const container = client.database(process.env.COSMOS_DB_NAME).container(process.env.COSMOS_CONTAINER_NAME);

app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// Rota principal: carrega o histórico de 60 minutos do Cosmos DB
app.get('/', async (req, res) => {
    try {
        // Query para obter os registos mais recentes
        const { resources } = await container.items
            .query("SELECT TOP 60 * FROM c WHERE c.partitionKey = 'crypto_data' ORDER BY c.timestamp DESC")
            .fetchAll();

        // Inicializa o objeto com as 4 moedas definidas
        let coinData = { bitcoin: [], ethereum: [], solana: [], cardano: [] };
        
        // Processa os resultados (do mais antigo para o mais recente para o gráfico)
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

        console.log(`📊 Renderizando página com ${resources.length} registos históricos.`);
        res.render('index', { coinData });
    } catch (err) {
        console.error("⚠️ Erro ao ler do Cosmos DB:", err.message);
        // Em caso de erro (ex: contentor vazio), renderiza com dados vazios
        res.render('index', { coinData: { bitcoin: [], ethereum: [], solana: [], cardano: [] } });
    }
});

// Endpoint chamado pela Azure Function via POST
app.post('/api/update-prices', (req, res) => {
    // A Function envia algo como: { bitcoin: { eur: 60000 }, ... }
    // O frontend espera apenas: { bitcoin: 60000, ... }
    const simplifiedPrices = {};
    Object.keys(req.body).forEach(coin => {
        if (req.body[coin] && req.body[coin].eur) {
            simplifiedPrices[coin] = req.body[coin].eur;
        }
    });

    console.log('📥 Broadcast via Socket.io:', JSON.stringify(simplifiedPrices));
    io.emit('priceUpdate', simplifiedPrices); 
    res.status(200).send('Preços atualizados em tempo real');
});

server.listen(PORT, () => console.log(`🚀 Servidor Web App a correr na porta ${PORT}`));