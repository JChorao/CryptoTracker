const express = require('express');
const http = require('http');
const path = require('path');
const { CosmosClient } = require("@azure/cosmos");
const { BlobServiceClient } = require("@azure/storage-blob");
const socketio = require('socket.io');
const PDFDocument = require('pdfkit');

const app = express();
const server = http.createServer(app);
const io = socketio(server);
const PORT = process.env.PORT || 3000;

// Configurações de Clientes Azure
const cosmosClient = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
const container = cosmosClient.database(process.env.COSMOS_DB_NAME).container(process.env.COSMOS_CONTAINER_NAME);
const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
const containerClient = blobServiceClient.getContainerClient("reports");

app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// Rota Principal: Dados das moedas + Listagem de ficheiros no Storage
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

        // Listar ficheiros existentes no Blob Storage para o Dashboard
        const reports = [];
        await containerClient.createIfNotExists({ access: 'blob' });
        for await (const blob of containerClient.listBlobsFlat()) {
            reports.push(blob.name);
        }

        res.render('index', { coinData, reports: reports.reverse() });
    } catch (err) {
        res.render('index', { 
            coinData: { bitcoin: [], ethereum: [], solana: [], cardano: [] }, 
            reports: [] 
        });
    }
});

// Endpoint: Gera PDF, faz Upload para Storage e retorna sucesso
app.post('/api/generate-report', async (req, res) => {
    try {
        const { resources } = await container.items
            .query("SELECT TOP 50 * FROM c WHERE c.partitionKey = 'crypto_data' ORDER BY c.timestamp DESC")
            .fetchAll();

        const doc = new PDFDocument();
        let chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        
        doc.on('end', async () => {
            const pdfBuffer = Buffer.concat(chunks);
            const filename = `Relatorio_${Date.now()}.pdf`;
            const blockBlobClient = containerClient.getBlockBlobClient(filename);
            
            await blockBlobClient.upload(pdfBuffer, pdfBuffer.length, {
                blobHTTPHeaders: { blobContentType: "application/pdf" }
            });
            res.json({ success: true, filename });
        });

        // Conteúdo do PDF
        doc.fontSize(24).fillColor('#f0b90b').text('CryptoTracker IPCB', { align: 'center' });
        doc.fontSize(14).fillColor('#000').text('Relatorio Estatistico de Precos', { align: 'center' });
        doc.moveDown();
        resources.forEach(item => {
            doc.fontSize(10).text(`Data: ${item.timestamp} | BTC: ${item.prices?.bitcoin?.eur}€ | ETH: ${item.prices?.ethereum?.eur}€`);
        });
        doc.end();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Endpoint: Serve o ficheiro PDF do Storage para o browser
app.get('/api/download/:name', async (req, res) => {
    try {
        const blockBlobClient = containerClient.getBlockBlobClient(req.params.name);
        const downloadResponse = await blockBlobClient.download(0);
        res.setHeader('Content-Type', 'application/pdf');
        downloadResponse.readableStreamBody.pipe(res);
    } catch (err) {
        res.status(404).send("Ficheiro não encontrado.");
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