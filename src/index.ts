import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import './config/env.config'
import './config/db.config'
import router from './routers';
import path from 'path';

const app = express();

const PORT = process.env.PORT;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../public/files')));
app.use(express.static(path.join(__dirname, '../public/uploads')));

console.log("data :::::: main file")

// This will check which api  is called on which date
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} Request to ${req.url}`);
  next();
});

app.get('/', (req, res) => {
  res.send('Hello, TypeScript with Express!');
});

app.use('/api', router)

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});