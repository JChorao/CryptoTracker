const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

// ─── ROOT ────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>CryptoTracker</title></head>
      <body style="font-family:sans-serif; padding:2rem; background:#0f172a; color:#e2e8f0">
        <h1>🚀 CryptoTracker</h1>
        <p>Azure App Service está online!</p>
        <ul>
          <li><a href="/api/health" style="color:#38bdf8">GET /api/health</a> — Estado do servidor</li>
          <li><a href="/api/crypto/bitcoin" style="color:#38bdf8">GET /api/crypto/:coin</a> — Preço de uma moeda</li>
          <li><a href="/api/crypto" style="color:#38bdf8">GET /api/crypto</a> — Top moedas</li>
        </ul>
      </body>
    </html>
  `);
});

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'CryptoTracker',
    environment: process.env.NODE_ENV || 'development'
  });
});

// ─── TOP CRIPTOMOEDAS ─────────────────────────────────────────────────────────
app.get('/api/crypto', async (req, res) => {
  try {
    const { data } = await axios.get(
      'https://api.coingecko.com/api/v3/coins/markets',
      {
        params: {
          vs_currency: 'eur',
          order: 'market_cap_desc',
          per_page: 10,
          page: 1,
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

// ─── PREÇO DE UMA MOEDA ESPECÍFICA ───────────────────────────────────────────
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

// ─── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ CryptoTracker a correr na porta ${PORT}`);
});

module.exports = app;