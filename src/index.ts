import express from 'express';
import { App } from './app';
import * as dotenv from 'dotenv';

dotenv.config();

const port = process.env.PORT || 8000;

const app = new App().app;

app.listen(port, () => {
  console.log(`Gateway API is running on port ${port}`);
});