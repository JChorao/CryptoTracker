const express = require('express');
const http = require('http');
const path = require('path');
const { CosmosClient } = require("@azure/cosmos");
const { BlobServiceClient } = require("@azure/storage-blob");
const socketio = require('socket.io');
const PDFDocument = require('pdfkit'); // <-- Biblioteca para gerar PDFs

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

// Mantém-se o endpoint antigo para Azure Blob (caso seja avaliado na UC)
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

// Helper: Calcula Média, Moda, Max e Min
function calculateStats(prices) {
    if (!prices || prices.length === 0) return { min: 0, max: 0, mean: 0, mode: 0 };
    let sum = 0, min = prices[0], max = prices[0];
    let frequency = {}, maxFreq = 0, mode = prices[0];

    prices.forEach(p => {
        sum += p;
        if (p < min) min = p;
        if (p > max) max = p;
        
        // Moda: usamos 2 casas decimais para agrupar valores aproximados
        let key = p.toFixed(2);
        frequency[key] = (frequency[key] || 0) + 1;
        if (frequency[key] > maxFreq) {
            maxFreq = frequency[key];
            mode = p;
        }
    });

    return { min, max, mean: sum / prices.length, mode };
}

// NOVO ENDPOINT: Geração de PDF e Download
app.get('/api/download-report', async (req, res) => {
    try {
        const { resources } = await container.items
            .query("SELECT * FROM c WHERE c.partitionKey = 'crypto_data' ORDER BY c.timestamp DESC")
            .fetchAll();

        let coinData = { bitcoin: [], ethereum: [], solana: [], cardano: [] };
        
        // Agrupar apenas os preços
        resources.forEach(item => {
            if (item.prices) {
                Object.keys(item.prices).forEach(coin => {
                    if (coinData[coin]) {
                        coinData[coin].push(item.prices[coin].eur);
                    }
                });
            }
        });

        // Configuração do PDF
        const doc = new PDFDocument({ margin: 50 });
        const filename = `CryptoTracker_Relatorio_${Date.now()}.pdf`;

        // Cabeçalhos para forçar download no browser
        res.setHeader('Content-disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-type', 'application/pdf');

        // Ligar o documento à stream de resposta
        doc.pipe(res);

        // Estilizar o conteúdo do PDF
        doc.fontSize(24).fillColor('#f0b90b').text('CryptoTracker', { align: 'center' });
        doc.fontSize(14).fillColor('#4a4a4a').text('Relatório Estatístico de Criptomoedas', { align: 'center' });
        doc.moveDown(2);
        doc.fontSize(12).fillColor('#000000').text(`Data do Relatório: ${new Date().toLocaleString('pt-PT')}`, { align: 'center' });
        doc.moveDown(3);

        Object.keys(coinData).forEach(coin => {
            const prices = coinData[coin];
            if (prices.length > 0) {
                const stats = calculateStats(prices);

                // Título da Moeda
                doc.fontSize(16).fillColor('#0ecb81').text(coin.toUpperCase());
                doc.moveDown(0.5);
                
                // Dados
                doc.fontSize(12).fillColor('#000000');
                doc.text(`Registos Analisados: ${prices.length}`);
                doc.text(`Média: ${stats.mean.toFixed(2)} €`);
                doc.text(`Valor Modal: ${stats.mode.toFixed(2)} €`);
                doc.text(`Valor Máximo: ${stats.max.toFixed(2)} €`);
                doc.text(`Valor Mínimo: ${stats.min.toFixed(2)} €`);
                doc.moveDown(2);
            }
        });

        doc.fontSize(10).fillColor('#888888').text('Computação em Nuvem - IPCB © 2026', { align: 'center', baseline: 'bottom' });
        
        doc.end();
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