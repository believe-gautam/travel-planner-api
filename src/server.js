 
const express = require('express');
const { initDb } = require('./config/db');
const apiRoutes = require('./routes/api');

const app = express();
app.use(express.json());

app.use('/api', apiRoutes);

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  await initDb();
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
};

startServer();