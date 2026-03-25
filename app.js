const express    = require('express');
const http       = require('http');
const path       = require('path');
const axios      = require('axios');
const socketio   = require('socket.io');

const app    = express();
const server = http.createServer(app);
const io     = socketio(server);
const PORT   = process.env.PORT || 3000;

// ─── MOEDAS A MONITORIZAR ─────────────────────────────────────────────────────
const COINS = ['bitcoin', 'ethereum', 'solana', 'cardano'];

let coinData = {};
COINS.forEach(c => coinData[c] = []);

// ─── CONFIGURAÇÃO EXPRESS ─────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ─── ROTA PRINCIPAL ───────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  // Numa fase final, aqui farias uma query ao Cosmos DB para obter o histórico inicial
  res.render('index', { coinData });
});

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'CryptoTracker (Serverless Integrated)',
    environment: process.env.NODE_ENV || 'development',
    coins_tracked: COINS
  });
});

// ─── ENDPOINT PARA A AZURE FUNCTION ──────────────────────────────────────────
app.post('/api/update-prices', (req, res) => {
  const newPrices = req.body;
  
  // Atualiza o histórico local em memória para novos utilizadores
  Object.keys(newPrices).forEach(coin => {
    if (COINS.includes(coin)) {
      const entry = { price: newPrices[coin], timestamp: new Date().toISOString() };
      coinData[coin].unshift(entry);
      if (coinData[coin].length > 100) coinData[coin].pop();
    }
  });

  // Emite para os clientes via Socket.io
  io.emit('priceUpdate', newPrices);
  
  res.status(200).send('Preços atualizados no frontend');
});

// ─── API — OUTRAS ROTAS (Mantidas para consulta manual) ──────────────────────
app.get('/api/crypto', async (req, res) => {
  try {
    const { data } = await axios.get('https://api.coingecko.com/api/v3/coins/markets', {
      params: { vs_currency: 'eur', ids: COINS.join(','), order: 'market_cap_desc' }
    });
    const coins = data.map(c => ({ id: c.id, symbol: c.symbol.toUpperCase(), price_eur: c.current_price }));
    res.json({ success: true, coins });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── SOCKET.IO ───────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`Cliente ligado: ${socket.id}`);
  socket.on('disconnect', () => console.log(`Cliente desligado: ${socket.id}`));
});

// ─── START ────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`✅ CryptoTracker Web App a correr em http://localhost:${PORT}`);
  console.log(`💡 A aguardar atualizações da Azure Function...`);
});

module.exports = app;