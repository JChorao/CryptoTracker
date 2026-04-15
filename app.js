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

// Configurações Azure
const cosmosClient = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
const container = cosmosClient.database(process.env.COSMOS_DB_NAME).container(process.env.COSMOS_CONTAINER_NAME);
const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
const containerClient = blobServiceClient.getContainerClient("reports");

app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// Rota Principal: Lista moedas e relatórios existentes
app.get('/', async (req, res) => {
    try {
        const { resources } = await container.items
            .query("SELECT TOP 60 * FROM c WHERE c.partitionKey = 'crypto_data' ORDER BY c.timestamp DESC")
            .fetchAll();
        
        // Listar ficheiros no Blob Storage
        const blobList = [];
        await containerClient.createIfNotExists({ access: 'blob' });
        for await (const blob of containerClient.listBlobsFlat()) {
            blobList.push(blob.name);
        }

        res.render('index', { resources, reports: blobList });
    } catch (err) {
        res.render('index', { resources: [], reports: [] });
    }
});

// Endpoint para Gerar e Guardar o PDF no Storage
app.post('/api/generate-report', async (req, res) => {
    try {
        const { resources } = await container.items
            .query("SELECT TOP 100 * FROM c WHERE c.partitionKey = 'crypto_data' ORDER BY c.timestamp DESC")
            .fetchAll();

        const doc = new PDFDocument();
        const chunks = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        
        doc.fontSize(20).text('Relatório de Criptomoedas', { align: 'center' });
        doc.moveDown();
        resources.forEach(item => {
            doc.fontSize(10).text(`Data: ${item.timestamp} | BTC: ${item.prices?.bitcoin?.eur}€ | ETH: ${item.prices?.ethereum?.eur}€`);
        });
        doc.end();

        doc.on('end', async () => {
            const pdfBuffer = Buffer.concat(chunks);
            const blobName = `relatorio-${Date.now()}.pdf`;
            const blockBlobClient = containerClient.getBlockBlobClient(blobName);
            
            await blockBlobClient.upload(pdfBuffer, pdfBuffer.length, {
                blobHTTPHeaders: { blobContentType: "application/pdf" }
            });

            res.status(200).json({ success: true, filename: blobName });
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Endpoint para fazer o Download de um relatório específico
app.get('/api/download/:name', async (req, res) => {
    const blobName = req.params.name;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const downloadBlockBlobResponse = await blockBlobClient.download(0);
    downloadBlockBlobResponse.readableStreamBody.pipe(res);
});

server.listen(PORT, () => console.log(`🚀 App a correr na porta ${PORT}`));