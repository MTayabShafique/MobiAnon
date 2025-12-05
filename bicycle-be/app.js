import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import userRoutes from './routes/bicycleRoute.js';
import uploadRoutes from './routes/uploadRoute.js';

// Load environment variables from .env file
dotenv.config();

const PORT = process.env.PORT || 5000;

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('Created uploads directory:', uploadsDir);
}

const app = express();

// Middleware
app.use(cors()); // Enable CORS for all origins, consider restricting in production
app.use(express.json()); // Parse JSON request bodies

// Routes
app.use('/api', userRoutes);
app.use('/api/upload', uploadRoutes);

// Error handling middleware (catch-all)
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  res.status(500).json({
    status: 'error',
    message: 'Internal server error',
    error: err.message || 'Unknown error',
  });
});

console.log('DATABASE_URL APP:', process.env.DATABASE_URL);


app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

export default app;
