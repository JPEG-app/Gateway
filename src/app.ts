import express, { Application } from 'express';
import bodyParser from 'body-parser';
import { setupRoutes } from './routes/routes';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

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
        if (allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true
    };
    this.app.use(cors(corsOptions));

    this.app.set('trust proxy', 1); 

    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 100,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many requests, please try again later.' },
    });
    this.app.use(limiter);
    this.app.use(bodyParser.json());
    this.app.use(bodyParser.urlencoded({ extended: true }));
  }

  private routes(): void {
    this.app.use('/', setupRoutes());
  }
}