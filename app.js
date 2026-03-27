const express = require('express');
const http = require('http');
const path = require('path');
const { CosmosClient } = require("@azure/cosmos");
const socketio = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketio(server);
const PORT = process.env.PORT || 3000;

// Liga ao Cosmos DB com as variáveis injetadas pelo script bash
const client = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
const container = client.database(process.env.COSMOS_DB_NAME).container(process.env.COSMOS_CONTAINER_NAME);

app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// Quando o utilizador acede ao site, vai buscar o histórico
app.get('/', async (req, res) => {
    try {
        // Vai buscar os últimos 60 registos ordenados do mais recente para o mais antigo
        const { resources } = await container.items
            .query("SELECT TOP 60 * FROM c WHERE c.partitionKey = 'crypto_data' ORDER BY c.timestamp DESC")
            .fetchAll();

        let coinData = { bitcoin: [], ethereum: [], solana: [], cardano: [] };
        
        // Inverte o array para o gráfico ficar cronológico (da esquerda para a direita)
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
        // Se falhar (ex: a BD ainda está vazia), renderiza arrays vazios
        res.render('index', { coinData: { bitcoin: [], ethereum: [], solana: [], cardano: [] } });
    }
});

// Rota chamada internamente pela Azure Function
app.post('/api/update-prices', (req, res) => {
    io.emit('priceUpdate', req.body); // Emite para o Frontend
    res.status(200).send('Broadcast efetuado com sucesso');
});

server.listen(PORT, () => console.log(`🚀 Servidor a correr na porta ${PORT}`));