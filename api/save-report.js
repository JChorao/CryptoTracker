const { CosmosClient } = require("@azure/cosmos");
const { BlobServiceClient } = require("@azure/storage-blob");
const PDFDocument = require('pdfkit');

const client = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
const container = client.database(process.env.COSMOS_DB_NAME).container(process.env.COSMOS_CONTAINER_NAME);

function calculateStats(prices) {
    if (!prices || prices.length === 0) return null;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    
    const freq = {};
    let maxFreq = 0, mode = prices[0];
    prices.forEach(p => {
        const k = p.toFixed(2);
        freq[k] = (freq[k] || 0) + 1;
        if (freq[k] > maxFreq) { maxFreq = freq[k]; mode = p; }
    });

    const newest = prices[prices.length - 1];
    const oldest = prices[0];
    const diff = ((newest - oldest) / oldest) * 100;
    const trend = `${diff >= 0 ? '+' : ''}${diff.toFixed(2)}% ${diff >= 0 ? '▲' : '▼'}`;

    return { min, max, mean, mode, trend };
}

async function run() {
    console.log("🐳 Docker: Iniciando auditoria estatística...");
    try {
        const { resources } = await container.items
            .query("SELECT TOP 60 * FROM c WHERE c.partitionKey = 'crypto_data' ORDER BY c.timestamp DESC")
            .fetchAll();

        const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
        const containerClient = blobServiceClient.getContainerClient("reports");
        await containerClient.createIfNotExists();

        const history = resources.reverse();
        const coinPrices = { bitcoin: [], ethereum: [], solana: [], cardano: [] };
        history.forEach(item => {
            if (item.prices) {
                Object.keys(item.prices).forEach(c => { if (coinPrices[c]) coinPrices[c].push(item.prices[c].eur); });
            }
        });

        const doc = new PDFDocument({ margin: 50 });
        let chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', async () => {
            const pdfBuffer = Buffer.concat(chunks);
            const blobName = `Full_Audit_${Date.now()}.pdf`;
            const blockBlobClient = containerClient.getBlockBlobClient(blobName);
            await blockBlobClient.upload(pdfBuffer, pdfBuffer.length, { blobHTTPHeaders: { blobContentType: "application/pdf" } });
            console.log("✅ PDF estatístico enviado: " + blobName);
            process.exit(0);
        });

        doc.fontSize(22).fillColor('#f0b90b').text('CryptoTracker — Auditoria Pesada', { align: 'center' });
        doc.fontSize(10).fillColor('#555').text(`Gerado via Docker em: ${new Date().toLocaleString('pt-PT')}`, { align: 'center' });
        doc.moveDown(2);

        Object.keys(coinPrices).forEach(coin => {
            const stats = calculateStats(coinPrices[coin]);
            if (stats) {
                doc.fontSize(14).fillColor('#f0b90b').text(coin.toUpperCase(), { underline: true });
                doc.fontSize(11).fillColor('#000');
                doc.text(`• Max: ${stats.max.toFixed(2)}€ | Min: ${stats.min.toFixed(2)}€`);
                doc.text(`• Média: ${stats.mean.toFixed(2)}€ | Moda: ${stats.mode.toFixed(2)}€`);
                doc.text(`• Tendência (1h): ${stats.trend}`);
                doc.moveDown(1.5);
            }
        });
        doc.end();
    } catch (err) {
        console.error("❌ Erro:", err.message);
        process.exit(1);
    }
}
run();