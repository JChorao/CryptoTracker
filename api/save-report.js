// Exemplo de lógica para gerar relatório com base no histórico
app.get('/api/generate-history-report', async (req, res) => {
    try {
        // 1. Procurar histórico no Cosmos DB (similar à sua rota '/')
        const { resources } = await container.items
            .query("SELECT * FROM c WHERE c.partitionKey = 'crypto_data' ORDER BY c.timestamp DESC")
            .fetchAll();

        // 2. Formatar os dados para o relatório
        const reportContent = JSON.stringify(resources, null, 2);
        const blobName = `history-report-${Date.now()}.json`;

        // 3. Enviar para o Blob Storage (usando a connection string que já configurou)
        const blobServiceClient = BlobServiceClient.fromConnectionString(blobConnectionString);
        const containerClient = blobServiceClient.getContainerClient("reports");
        await containerClient.createIfNotExists();
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        
        await blockBlobClient.upload(reportContent, reportContent.length);
        
        res.status(200).send({ message: "Relatório gerado!", url: blobName });
    } catch (err) {
        res.status(500).send({ error: err.message });
    }
});