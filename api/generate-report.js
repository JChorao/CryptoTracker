const { CosmosClient } = require("@azure/cosmos");
const { BlobServiceClient } = require("@azure/storage-blob");
const PDFDocument = require('pdfkit');

const client = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
const container = client.database(process.env.COSMOS_DB_NAME).container(process.env.COSMOS_CONTAINER_NAME);

function calculateDetailedStats(data) {
    if (!data || data.length === 0) return null;

    const prices = data.map(d => d.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;

    // Encontrar os timestamps (hora exata) para o valor máximo e mínimo
    // Como procuramos da esquerda para a direita, apanha a primeira vez que o valor foi atingido
    const itemMax = data.find(d => d.price === max);
    const itemMin = data.find(d => d.price === min);
    
    const timeMax = itemMax ? new Date(itemMax.timestamp).toLocaleTimeString('pt-PT') : 'N/A';
    const timeMin = itemMin ? new Date(itemMin.timestamp).toLocaleTimeString('pt-PT') : 'N/A';

    // Cálculo da Moda (agrupando valores idênticos a 2 casas decimais)
    const frequency = {};
    let maxFreq = 0;
    let mode = prices[0];
    prices.forEach(p => {
        const val = p.toFixed(2);
        frequency[val] = (frequency[val] || 0) + 1;
        if (frequency[val] > maxFreq) {
            maxFreq = frequency[val];
            mode = parseFloat(val);
        }
    });

    return { min, max, mean, mode, timeMax, timeMin };
}

async function generateReport() {
    console.log("📊 A iniciar geração de relatório detalhado...");
    
    const { resources } = await container.items
        .query("SELECT TOP 60 * FROM c WHERE c.partitionKey = 'crypto_data' ORDER BY c.timestamp DESC")
        .fetchAll();

    const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
    const containerClient = blobServiceClient.getContainerClient("reports");
    await containerClient.createIfNotExists();

    // Inverter para ordem cronológica (do mais antigo para o mais recente)
    const historicalData = resources.reverse();
    const coinDataMap = { bitcoin: [], ethereum: [], solana: [], cardano: [] };
    
    historicalData.forEach(item => {
        if (item.prices) {
            Object.keys(item.prices).forEach(coin => {
                if (coinDataMap[coin]) {
                    coinDataMap[coin].push({ 
                        price: item.prices[coin].eur, 
                        timestamp: item.timestamp 
                    });
                }
            });
        }
    });

    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50 });
        let chunks = [];
        
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', async () => {
            try {
                const pdfBuffer = Buffer.concat(chunks);
                const blobName = `Audit_${Date.now()}.pdf`;
                const blockBlobClient = containerClient.getBlockBlobClient(blobName);
                
                await blockBlobClient.upload(pdfBuffer, pdfBuffer.length, {
                    blobHTTPHeaders: { blobContentType: "application/pdf" }
                });
                
                console.log("✅ Relatório guardado com sucesso no Blob Storage: " + blobName);
                resolve(blobName);
            } catch (err) {
                console.error("❌ Falha no upload:", err);
                reject(err);
            }
        });

        doc.on('error', reject);

        // --- Design e Conteúdo do Relatório ---
        doc.fontSize(22).fillColor('#f0b90b').text('CryptoTracker — Auditoria Estatística', { align: 'center' });
        doc.fontSize(10).fillColor('#555').text(`Gerado em: ${new Date().toLocaleString('pt-PT')}`, { align: 'center' });
        doc.moveDown(2);

        Object.keys(coinDataMap).forEach(coin => {
            const stats = calculateDetailedStats(coinDataMap[coin]);
            if (stats) {
                doc.fontSize(14).fillColor('#f0b90b').text(coin.toUpperCase(), { underline: true });
                doc.fontSize(11).fillColor('#000');
                
                // Valores pedidos com os respetivos horários
                doc.text(`• Valor Máximo: ${stats.max.toLocaleString('pt-PT')} € (Registado às ${stats.timeMax})`);
                doc.text(`• Valor Mínimo: ${stats.min.toLocaleString('pt-PT')} € (Registado às ${stats.timeMin})`);
                doc.text(`• Média (última hora): ${stats.mean.toLocaleString('pt-PT', {maximumFractionDigits:2})} €`);
                doc.text(`• Moda (Valor mais frequente): ${stats.mode.toLocaleString('pt-PT')} €`);
                
                doc.moveDown(1.5);
            }
        });

        doc.fontSize(8).fillColor('#999').text('Computação em Nuvem - Relatório de Auditoria IPCB', { align: 'center' });
        doc.end();
    });
}

// Lógica para execução isolada via Docker (Fase 3)
if (require.main === module) {
    generateReport()
        .then(() => process.exit(0))
        .catch(err => {
            console.error("❌ Erro fatal na execução isolada:", err);
            process.exit(1);
        });
}

// Lógica de exportação para a Web App (Fase 1/2)
module.exports = { generateReport };