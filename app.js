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

        // Garantir que o contentor existe antes de listar
        await containerClient.createIfNotExists({ access: 'blob' });
        for await (const blob of containerClient.listBlobsFlat()) {
            reports.push(blob.name);
        }
    } catch (err) { console.error("Erro inicial:", err.message); }
    res.render('index', { coinData, reports: reports.reverse() });
});

app.post('/api/generate-report', async (req, res) => {
    try {
        // CORREÇÃO: Criar o contentor se ele não existir antes do upload
        await containerClient.createIfNotExists({ access: 'blob' });

        const { resources } = await container.items
            .query("SELECT TOP 50 * FROM c WHERE c.partitionKey = 'crypto_data' ORDER BY c.timestamp DESC")
            .fetchAll();

        const doc = new PDFDocument();
        let chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', async () => {
            const pdfBuffer = Buffer.concat(chunks);
            const filename = `Audit_${Date.now()}.pdf`;
            const blockBlobClient = containerClient.getBlockBlobClient(filename);
            await blockBlobClient.upload(pdfBuffer, pdfBuffer.length, {
                blobHTTPHeaders: { blobContentType: "application/pdf" }
            });
            res.json({ success: true, filename });
        });

        doc.fontSize(24).fillColor('#f0b90b').text('CryptoTracker IPCB Audit', { align: 'center' });
        doc.moveDown();
        resources.forEach(item => {
            doc.fontSize(10).fillColor('#000').text(`${item.timestamp}: BTC ${item.prices?.bitcoin?.eur}€`);
        });
        doc.end();
    } catch (err) {
        res.status(500).json({ success: false, error: "Falha ao guardar no Storage: " + err.message });
    }
});

app.get('/api/download/:name', async (req, res) => {
    try {
        const blockBlobClient = containerClient.getBlockBlobClient(req.params.name);
        const downloadResponse = await blockBlobClient.download(0);
        res.setHeader('Content-Type', 'application/pdf');
        downloadResponse.readableStreamBody.pipe(res);
    } catch (err) { res.status(404).send("Ficheiro não encontrado."); }
});

app.post('/api/update-prices', (req, res) => {
    io.emit('priceUpdate', req.body);
    res.status(200).send('OK');
});

server.listen(PORT, () => console.log(`🚀 Web App na porta ${PORT}`));