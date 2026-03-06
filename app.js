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

// Histórico em memória: { bitcoin: [{price, timestamp}, ...], ... }
const coinData = {};
COINS.forEach(c => coinData[c] = []);

// ─── CONFIGURAÇÃO EXPRESS ─────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ─── ROTA PRINCIPAL — renderiza o EJS com os dados atuais ─────────────────────
app.get('/', (req, res) => {
  res.render('index', { coinData });
});

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'CryptoTracker',
    environment: process.env.NODE_ENV || 'development',
    coins_tracked: COINS
  });
});

// ─── API — TOP CRIPTOMOEDAS ───────────────────────────────────────────────────
app.get('/api/crypto', async (req, res) => {
  try {
    const { data } = await axios.get(
      'https://api.coingecko.com/api/v3/coins/markets',
      {
        params: {
          vs_currency: 'eur',
          ids: COINS.join(','),
          order: 'market_cap_desc',
          sparkline: false
        }
      }
    );

    const coins = data.map(c => ({
      id: c.id,
      symbol: c.symbol.toUpperCase(),
      name: c.name,
      price_eur: c.current_price,
      change_24h: c.price_change_percentage_24h,
      market_cap: c.market_cap
    }));

    res.json({ success: true, coins, fetched_at: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── API — PREÇO DE UMA MOEDA ESPECÍFICA ─────────────────────────────────────
app.get('/api/crypto/:coin', async (req, res) => {
  const { coin } = req.params;
  try {
    const { data } = await axios.get(
      `https://api.coingecko.com/api/v3/coins/${coin}`,
      { params: { localization: false, tickers: false, community_data: false } }
    );

    res.json({
      success: true,
      coin: {
        id: data.id,
        name: data.name,
        symbol: data.symbol.toUpperCase(),
        price_eur: data.market_data.current_price.eur,
        price_usd: data.market_data.current_price.usd,
        change_24h: data.market_data.price_change_percentage_24h,
        high_24h: data.market_data.high_24h.eur,
        low_24h: data.market_data.low_24h.eur,
        market_cap: data.market_data.market_cap.eur,
        last_updated: data.market_data.last_updated
      }
    });
  } catch (err) {
    const status = err.response?.status === 404 ? 404 : 500;
    res.status(status).json({ success: false, error: `Moeda "${coin}" não encontrada.` });
  }
});

// ─── RECOLHA PERIÓDICA DE PREÇOS (a cada 30s) ────────────────────────────────
async function fetchPrices() {
  try {
    const { data } = await axios.get(
      'https://api.coingecko.com/api/v3/simple/price',
      {
        params: {
          ids: COINS.join(','),
          vs_currencies: 'eur'
        }
      }
    );

    const newPrices = {};

    COINS.forEach(coin => {
      if (!data[coin]) return;

      const price = data[coin].eur;
      const entry = { price, timestamp: new Date().toISOString() };

      // Guarda no histórico (máx 100 entradas por moeda)
      coinData[coin].unshift(entry);
      if (coinData[coin].length > 100) coinData[coin].pop();

      newPrices[coin] = price;
    });

    // Emite para todos os clientes ligados via Socket.IO
    io.emit('priceUpdate', newPrices);
    console.log(`[${new Date().toLocaleTimeString('pt-PT')}] Preços atualizados:`, newPrices);

  } catch (err) {
    console.error('Erro ao recolher preços:', err.message);
  }
}

// Primeira recolha imediata + intervalo de 30 segundos
fetchPrices();
setInterval(fetchPrices, 30000);

// ─── SOCKET.IO — ligação de clientes ─────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`Cliente ligado: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`Cliente desligado: ${socket.id}`);
  });
});

// ─── START ────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`✅ CryptoTracker a correr em http://localhost:${PORT}`);
});

module.exports = app;