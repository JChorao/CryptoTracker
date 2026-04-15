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
const cosmosConn = process.env.COSMOS_CONNECTION_STRING;
const storageConn = process.env.AZURE_STORAGE_CONNECTION_STRING;

let container;
let containerClient;

if (cosmosConn) {
    const client = new CosmosClient(cosmosConn);
    container = client.database(process.env.COSMOS_DB_NAME || "CryptoDB").container(process.env.COSMOS_CONTAINER_NAME || "PriceHistory");
}

if (storageConn) {
    const blobServiceClient = BlobServiceClient.fromConnectionString(storageConn);
    containerClient = blobServiceClient.getContainerClient("reports");
}

app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', async (req, res) => {
    let coinData = { bitcoin: [], ethereum: [], solana: [], cardano: [] };
    let reports = [];

    try {
        if (container) {
            const { resources } = await container.items
                .query("SELECT TOP 60 * FROM c WHERE c.partitionKey = 'crypto_data' ORDER BY c.timestamp DESC")
                .fetchAll();
            
            resources.reverse().forEach(item => {
                if (item.prices) {
                    Object.keys(item.prices).forEach(coin => {
                        if (coinData[coin]) {
                            coinData[coin].push({ price: item.prices[coin].eur, timestamp: item.timestamp });
                        }
                    });
                }
            });
        }

        if (containerClient) {
            await containerClient.createIfNotExists({ access: 'blob' });
            for await (const blob of containerClient.listBlobsFlat()) {
                reports.push(blob.name);
            }
        }
    } catch (err) {
        console.error("Erro ao carregar dados:", err.message);
    }

    res.render('index', { coinData, reports: reports.reverse() });
});

// Endpoint para gerar e guardar PDF no Storage
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

        doc.fontSize(24).fillColor('#f0b90b').text('CryptoTracker IPCB', { align: 'center' });
        doc.moveDown();
        resources.forEach(item => {
            doc.fontSize(10).fillColor('#000').text(`Data: ${item.timestamp} | BTC: ${item.prices?.bitcoin?.eur}€`);
        });
        doc.end();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/download/:name', async (req, res) => {
    try {
        const blockBlobClient = containerClient.getBlockBlobClient(req.params.name);
        const download = await blockBlobClient.download(0);
        res.setHeader('Content-Type', 'application/pdf');
        download.readableStreamBody.pipe(res);
    } catch (err) {
        res.status(404).send("Erro no download.");
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