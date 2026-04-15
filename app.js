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
const cosmosConn = process.env.COSMOS_CONNECTION_STRING;
const storageConn = process.env.AZURE_STORAGE_CONNECTION_STRING;

let container;
let containerClient;

// Inicialização segura
try {
    if (cosmosConn) {
        const client = new CosmosClient(cosmosConn);
        container = client.database(process.env.COSMOS_DB_NAME || "CryptoDB").container(process.env.COSMOS_CONTAINER_NAME || "PriceHistory");
    }
    if (storageConn) {
        const blobServiceClient = BlobServiceClient.fromConnectionString(storageConn);
        containerClient = blobServiceClient.getContainerClient("reports");
    }
} catch (e) {
    console.error("Erro na inicialização da Azure:", e.message);
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
            const { resources } = await container.items.query("SELECT TOP 60 * FROM c WHERE c.partitionKey = 'crypto_data' ORDER BY c.timestamp DESC").fetchAll();
            resources.reverse().forEach(item => {
                if (item.prices) {
                    Object.keys(item.prices).forEach(coin => {
                        if (coinData[coin]) coinData[coin].push({ price: item.prices[coin].eur, timestamp: item.timestamp });
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
    } catch (err) { console.error(err); }
    res.render('index', { coinData, reports: reports.reverse() });
});

// ENDPOINT CRÍTICO: Geração e Upload
app.post('/api/generate-report', async (req, res) => {
    console.log("Pedido de relatório recebido...");
    try {
        if (!container || !containerClient) {
            return res.status(500).json({ success: false, error: "Azure Storage ou Cosmos não configurados nas variáveis de ambiente." });
        }

        const { resources } = await container.items.query("SELECT TOP 30 * FROM c WHERE c.partitionKey = 'crypto_data' ORDER BY c.timestamp DESC").fetchAll();

        const doc = new PDFDocument();
        let chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        
        doc.on('end', async () => {
            try {
                const pdfBuffer = Buffer.concat(chunks);
                const filename = `Audit_${Date.now()}.pdf`;
                const blockBlobClient = containerClient.getBlockBlobClient(filename);
                
                await blockBlobClient.upload(pdfBuffer, pdfBuffer.length, {
                    blobHTTPHeaders: { blobContentType: "application/pdf" }
                });
                
                console.log("Relatório guardado com sucesso:", filename);
                res.json({ success: true, filename });
            } catch (uploadErr) {
                console.error("Erro no upload para o Blob:", uploadErr);
                res.status(500).json({ success: false, error: "Falha ao guardar no Storage: " + uploadErr.message });
            }
        });

        doc.fontSize(22).fillColor('#f0b90b').text('CRYPTO TRACKER AUDIT', { align: 'center' });
        doc.moveDown();
        doc.fontSize(10).fillColor('#333').text(`Generated on: ${new Date().toISOString()}`);
        doc.moveDown();
        resources.forEach(item => {
            doc.text(`Time: ${item.timestamp} | BTC: ${item.prices?.bitcoin?.eur || 'N/A'} EUR`);
        });
        doc.end();

    } catch (err) {
        console.error("Erro geral na API:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/download/:name', async (req, res) => {
    try {
        const blockBlobClient = containerClient.getBlockBlobClient(req.params.name);
        const download = await blockBlobClient.download(0);
        res.setHeader('Content-Type', 'application/pdf');
        download.readableStreamBody.pipe(res);
    } catch (err) { res.status(404).send("Ficheiro não encontrado."); }
});

server.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));