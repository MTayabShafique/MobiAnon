import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import userRoutes from './routes/bicycleRoute.js';
import uploadRoutes from './routes/uploadRoute.js';

dotenv.config();

const PORT = process.env.PORT || 5000;

const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('Created uploads directory:', uploadsDir);
}

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api', userRoutes);
app.use('/api/upload', uploadRoutes);

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
