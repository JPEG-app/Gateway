import express, { Application } from 'express';
import bodyParser from 'body-parser';
import { setupRoutes } from './routes/routes';
import cors from 'cors';

export class App {
  public app: Application;

  constructor() {
    this.app = express();
    this.config();
    this.routes();
  }

  private config(): void {
    const allowedOrigins = [
      'http://localhost:5173',
      'http://127.0.0.1:5173'
    ];

    const corsOptions: cors.CorsOptions = {
      origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true
    };
    this.app.use(bodyParser.json());
    this.app.use(bodyParser.urlencoded({ extended: true }));
  }

  private routes(): void {
    this.app.use('/', setupRoutes());
  }
}
