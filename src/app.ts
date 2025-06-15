import express, { Application, Request as ExpressRequest, Response, NextFunction } from 'express';
import http from 'http';
import bodyParser from 'body-parser';
import { setupRoutes } from './routes/routes';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import logger, { assignRequestId, requestLoggerMiddleware, logError, RequestWithId } from './utils/logger';

export class App {
  public app: Application;
  public server: http.Server;

  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.config();
    this.routes(); 
    this.errorHandling(); 
  }

  private config(): void {
    this.app.use(assignRequestId); 

    const allowedOrigins = [
      'https://jpegapp.lol',
      'https://www.jpegapp.lol'
    ];

    const corsOptions: cors.CorsOptions = {
      origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          logger.warn('CORS blocked request by Gateway', { origin, type: 'GatewayCorsErrorLog' });
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true
    };
    this.app.use(cors(corsOptions));
    this.app.options('*', cors(corsOptions));

    this.app.set('trust proxy', 1);

    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, 
      max: 100, 
      standardHeaders: true, 
      legacyHeaders: false, 
      message: { error: 'Too many requests, please try again later.' },
      handler: (req, res, next, options) => { 
        logger.warn('Client rate-limited by Gateway', {
          correlationId: (req as RequestWithId).id, 
          ip: req.ip,
          path: req.originalUrl,
          method: req.method,
          limit: options.max,
          windowMs: options.windowMs,
          type: 'GatewayRateLimitLog'
        });
        res.status(options.statusCode).json(options.message); 
      }
    });
    this.app.use(limiter);

    this.app.use(bodyParser.json());
    this.app.use(bodyParser.urlencoded({ extended: true })); 

    this.app.use(requestLoggerMiddleware); 
  }

  private routes(): void {
    this.app.use('/', setupRoutes(logger, this.server));
  }

  private errorHandling(): void {
    this.app.use((err: any, req: ExpressRequest, res: Response, next: NextFunction) => {
        const typedReq = req as RequestWithId;
        logError(err, req, 'Unhandled error in Gateway Express lifecycle');

        if (res.headersSent) {
            return next(err);
        }

        res.status(err.status || 500).json({
            message: err.message || 'Internal Gateway Error',
            correlationId: typedReq.id,
            ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
        });
    });
  }
}