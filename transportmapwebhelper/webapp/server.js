import express from 'express';
import { writeFileSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const DATA_PATH = join(__dirname, 'public', 'map_data.json');
const CHAIN_CONFIG_PATH = join(__dirname, 'public', 'chain_config.json');

// Get current map data
app.get('/api/map-data', (req, res) => {
  try {
    const data = readFileSync(DATA_PATH, 'utf-8');
    res.json(JSON.parse(data));
  } catch (error) {
    res.status(500).json({ error: 'Failed to read map data' });
  }
});

// Save map data
app.post('/api/map-data', (req, res) => {
  try {
    const data = req.body;
    writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
    res.json({ success: true, message: 'Map data saved successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save map data' });
  }
});

// Get chain config
app.get('/api/chain-config', (req, res) => {
  try {
    const data = readFileSync(CHAIN_CONFIG_PATH, 'utf-8');
    res.json(JSON.parse(data));
  } catch {
    // Return empty config if file doesn't exist yet
    res.json({ chains: [], pcbSlots: {} });
  }
});

// Save chain config
app.post('/api/chain-config', (req, res) => {
  try {
    const data = req.body;
    writeFileSync(CHAIN_CONFIG_PATH, JSON.stringify(data, null, 2));
    res.json({ success: true, message: 'Chain config saved successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save chain config' });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`API server running at http://localhost:${PORT}`);
});
