const express = require('express');
const http = require('http');
const path = require('path');
const { CosmosClient } = require("@azure/cosmos");
const { BlobServiceClient } = require("@azure/storage-blob");
const socketio = require('socket.io');

// Importa a nova lógica separada
const { generateReport } = require('./api/generate-report'); 

const app = express();
const server = http.createServer(app);
const io = socketio(server);
const PORT = process.env.PORT || 3000;

const client = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
const container = client.database(process.env.COSMOS_DB_NAME).container(process.env.COSMOS_CONTAINER_NAME);
const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
const containerClient = blobServiceClient.getContainerClient("reports");

app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', async (req, res) => {
    let coinData = { bitcoin: [], ethereum: [], solana: [], cardano: [] };
    let reports = [];
    try {
        const { resources } = await container.items
            .query("SELECT TOP 60 * FROM c WHERE c.partitionKey = 'crypto_data' ORDER BY c.timestamp DESC")
            .fetchAll();
        
        resources.reverse().forEach(item => {
            if (item.prices) {
                Object.keys(item.prices).forEach(coin => {
                    if (coinData[coin]) coinData[coin].push({ price: item.prices[coin].eur, timestamp: item.timestamp });
                });
            }
        });

        await containerClient.createIfNotExists();
        for await (const blob of containerClient.listBlobsFlat()) {
            reports.push(blob.name);
        }
    } catch (err) { console.error("Erro inicial:", err.message); }
    res.render('index', { coinData, reports: reports.reverse() });
});

// Endpoint chamado pelo botão da UI
app.post('/api/generate-report', async (req, res) => {
    try {
        const filename = await generateReport();
        res.json({ success: true, filename });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Recebe os dados da Azure Function e atualiza os clientes em tempo real
app.post('/api/update-prices', (req, res) => {
    io.emit('priceUpdate', req.body);
    res.status(200).send('OK');
});

app.get('/api/download/:name', async (req, res) => {
    try {
        const blockBlobClient = containerClient.getBlockBlobClient(req.params.name);
        const downloadResponse = await blockBlobClient.download(0);
        res.setHeader('Content-Type', 'application/pdf');
        downloadResponse.readableStreamBody.pipe(res);
    } catch (err) { res.status(404).send("Ficheiro não encontrado."); }
});

server.listen(PORT, () => console.log(`🚀 Servidor na porta ${PORT}`));