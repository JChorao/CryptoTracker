const express = require('express');
const http = require('http');
const path = require('path');
const { CosmosClient } = require("@azure/cosmos");
const { BlobServiceClient } = require("@azure/storage-blob");
const socketio = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketio(server);
const PORT = process.env.PORT || 3000;

const client = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
const container = client.database(process.env.COSMOS_DB_NAME).container(process.env.COSMOS_CONTAINER_NAME);
const blobConnectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;

app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', async (req, res) => {
    try {
        const { resources } = await container.items
            .query("SELECT TOP 60 * FROM c WHERE c.partitionKey = 'crypto_data' ORDER BY c.timestamp DESC")
            .fetchAll();
        let coinData = { bitcoin: [], ethereum: [], solana: [], cardano: [] };
        resources.reverse().forEach(item => {
            if (item.prices) {
                Object.keys(item.prices).forEach(coin => {
                    if (coinData[coin]) {
                        coinData[coin].push({ price: item.prices[coin].eur, timestamp: item.timestamp });
                    }
                });
            }
        });
        res.render('index', { coinData });
    } catch (err) {
        res.render('index', { coinData: { bitcoin: [], ethereum: [], solana: [], cardano: [] } });
    }
});

app.get('/api/save-report', async (req, res) => {
    try {
        if (!blobConnectionString) throw new Error("AZURE_STORAGE_CONNECTION_STRING não configurada!");

        const { resources } = await container.items
            .query("SELECT * FROM c WHERE c.partitionKey = 'crypto_data' ORDER BY c.timestamp DESC")
            .fetchAll();

        const reportData = {
            data: new Date().toISOString(),
            projeto: "CryptoTracker IPCB",
            status: "Relatório gerado via Endpoint App Service",
            historico: resources
        };

        const blobName = `relatorio-${Date.now()}.json`;
        const blobServiceClient = BlobServiceClient.fromConnectionString(blobConnectionString);
        const containerClient = blobServiceClient.getContainerClient("reports");
        await containerClient.createIfNotExists();
        
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        const serializedData = JSON.stringify(reportData, null, 2);

        await blockBlobClient.upload(serializedData, serializedData.length);
        res.status(200).send({ message: "Sucesso!", ficheiro: blobName });
    } catch (err) {
        res.status(500).send({ error: err.message });
    }
});

app.post('/api/update-prices', (req, res) => {
    const simplifiedPrices = {};
    Object.keys(req.body).forEach(coin => {
        if (req.body[coin]?.eur) simplifiedPrices[coin] = req.body[coin].eur;
    });
    io.emit('priceUpdate', simplifiedPrices); 
    res.status(200).send('OK');
});

server.listen(PORT, () => console.log(`🚀 Servidor na porta ${PORT}`));