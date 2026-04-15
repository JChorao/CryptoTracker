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

// Verificação de segurança para as variáveis
const cosmosConn = process.env.COSMOS_CONNECTION_STRING;
const storageConn = process.env.AZURE_STORAGE_CONNECTION_STRING;

let container;
if (cosmosConn) {
    const client = new CosmosClient(cosmosConn);
    container = client.database(process.env.COSMOS_DB_NAME || "CryptoDB").container(process.env.COSMOS_CONTAINER_NAME || "PriceHistory");
}

app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// Rota do PDF corrigida com tratamento de erro detalhado
app.get('/api/download-report', async (req, res) => {
    console.log("Generating PDF report...");
    try {
        if (!container) throw new Error("Cosmos DB não configurado.");

        const { resources } = await container.items
            .query("SELECT * FROM c WHERE c.partitionKey = 'crypto_data' ORDER BY c.timestamp DESC")
            .fetchAll();

        if (!resources || resources.length === 0) {
            return res.status(404).json({ error: "Sem dados no Cosmos DB para gerar relatório." });
        }

        const doc = new PDFDocument({ margin: 50 });
        const filename = `Relatorio_${Date.now()}.pdf`;

        res.setHeader('Content-disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-type', 'application/pdf');

        doc.pipe(res);
        doc.fontSize(25).text('CryptoTracker Report', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text(`Gerado em: ${new Date().toLocaleString()}`);
        doc.moveDown();

        resources.slice(0, 20).forEach(item => {
            doc.text(`Data: ${item.timestamp} - BTC: ${item.prices?.bitcoin?.eur || 'N/A'}€`);
        });

        doc.end();
    } catch (err) {
        console.error("PDF Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// Outras rotas...
app.get('/', async (req, res) => {
    try {
        if (!container) return res.render('index', { coinData: { bitcoin: [], ethereum: [], solana: [], cardano: [] } });
        const { resources } = await container.items
            .query("SELECT TOP 60 * FROM c WHERE c.partitionKey = 'crypto_data' ORDER BY c.timestamp DESC")
            .fetchAll();
        
        let coinData = { bitcoin: [], ethereum: [], solana: [], cardano: [] };
        resources.reverse().forEach(item => {
            if (item.prices) {
                Object.keys(item.prices).forEach(coin => {
                    if (coinData[coin]) coinData[coin].push({ price: item.prices[coin].eur, timestamp: item.timestamp });
                });
            }
        });
        res.render('index', { coinData });
    } catch (err) {
        res.render('index', { coinData: { bitcoin: [], ethereum: [], solana: [], cardano: [] } });
    }
});

server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));