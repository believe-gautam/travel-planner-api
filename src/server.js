const express = require('express');
const cors = require('cors'); // Add this
const { initDb } = require('./config/db');
const apiRoutes = require('./routes/api');
const logger = require('./logger/logger');

const app = express();

// Add CORS middleware
app.use(cors({
  origin: '*', // Allow all origins for now (development only)
  // For specific origin, use: origin: 'http://localhost:3000'
  methods: ['GET', 'POST', 'DELETE', 'PUT', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

app.use('/api', apiRoutes);

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    await initDb();
    app.listen(PORT, () => logger.info(`Server running on port ${PORT}`));
  } catch (err) {
    logger.error('Server startup failed', { error: err.message });
    process.exit(1);
  }
};

startServer();