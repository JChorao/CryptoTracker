const { CosmosClient } = require("@azure/cosmos");
const { BlobServiceClient } = require("@azure/storage-blob");

const client = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
const container = client.database(process.env.COSMOS_DB_NAME).container(process.env.COSMOS_CONTAINER_NAME);

async function run() {
    console.log("Iniciando processamento isolado via Docker...");
    try {
        const { resources } = await container.items
            .query("SELECT * FROM c WHERE c.partitionKey = 'crypto_data' ORDER BY c.timestamp DESC")
            .fetchAll();

        const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
        const containerClient = blobServiceClient.getContainerClient("reports");
        await containerClient.createIfNotExists();

        const blobName = `docker-report-${Date.now()}.json`;
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        const data = JSON.stringify(resources, null, 2);

        await blockBlobClient.upload(data, data.length);
        console.log("✅ Relatório finalizado e enviado para o Blob Storage: " + blobName);
    } catch (err) {
        console.error("❌ Erro no processamento Docker:", err.message);
        process.exit(1);
    }
}

run();