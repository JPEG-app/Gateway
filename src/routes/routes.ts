import { Router, Request as ExpressRequest, Response as ExpressResponse, NextFunction } from 'express';
import { createProxyMiddleware, Options } from 'http-proxy-middleware';
import { ClientRequest, IncomingMessage, ServerResponse as HttpServerResponse } from 'http';
import { Socket } from 'net';
import * as dotenv from 'dotenv';
import mcache from 'memory-cache';

dotenv.config();

const USER_SERVICE_URL: string = process.env.USER_API_URL || "http://user-service:3001";
const POST_SERVICE_URL: string = process.env.POST_API_URL || "http://post-service:3002";
const FEED_SERVICE_URL: string = process.env.FEED_API_URL || "http://feed-service:3003";

const router: Router = Router();

const logRequest = (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
  console.log(`[GATEWAY] ${new Date().toISOString()} - ${req.method} ${req.originalUrl} from ${req.ip}`);
  next();
};

// --- Caching Middleware ---
const CACHE_DURATION_MS = 5 * 60 * 1000;

const cacheMiddleware = (duration: number) => {
  return (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
    if (req.method !== 'GET') {
      return next();
    }

    const key = '__express__' + req.originalUrl || req.url;
    const cachedBody = mcache.get(key);

    if (cachedBody) {
      console.log(`[GATEWAY CACHE] HIT for ${key}`);
      res.setHeader('X-Cache', 'HIT');
      res.send(cachedBody);
      return;
    } else {
      console.log(`[GATEWAY CACHE] MISS for ${key}`);
      res.setHeader('X-Cache', 'MISS');
      const originalSend = res.send.bind(res);
      res.send = (body: any): ExpressResponse => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`[GATEWAY CACHE] PUT for ${key}, duration: ${duration}ms`);
          mcache.put(key, body, duration);
        }
        return originalSend(body);
      };
      next();
    }
  };
};
// --- End Caching Middleware ---

const commonProxyOptions: Options = {
  changeOrigin: true,
  on: {
    proxyReq: (proxyReq: ClientRequest, req: IncomingMessage, res: HttpServerResponse) => {
      const expressReq = req as ExpressRequest;
      console.log(`[GATEWAY] Proxying ${expressReq.method} ${expressReq.originalUrl} to ${proxyReq.protocol}//${proxyReq.host}${proxyReq.path}`);
      if (expressReq.body && Object.keys(expressReq.body).length > 0 && expressReq.method !== 'GET' && expressReq.method !== 'HEAD') {
        const bodyData = JSON.stringify(expressReq.body);
        proxyReq.setHeader('Content-Type', 'application/json');
        proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
        proxyReq.write(bodyData);
      }
    },
    proxyRes: (proxyRes: IncomingMessage, req: IncomingMessage, res: HttpServerResponse) => {
      const expressReq = req as ExpressRequest;
      console.log(`[GATEWAY] Received ${proxyRes.statusCode} for ${expressReq.method} ${expressReq.originalUrl} from target`);
    },
    error: (err: Error, req: IncomingMessage, res: HttpServerResponse | Socket, target?: any) => {
      const nodeErr = err as NodeJS.ErrnoException;
      let targetDisplay = 'unknown target';
      if (target) {
        if (typeof target === 'string') {
            targetDisplay = target;
        } else if (typeof target === 'object' && target !== null) {
            targetDisplay = target.href || target.host || target.hostname || JSON.stringify(target);
        }
      }
      console.error(`[GATEWAY] Proxy error for ${targetDisplay}:`, err.message);

      if (res instanceof HttpServerResponse) {
        const expressRes = res as ExpressResponse;
        if (!expressRes.headersSent) {
          if (nodeErr.code === 'ECONNREFUSED' || nodeErr.code === 'ENOTFOUND') {
            expressRes.status(503).json({ error: 'Service unavailable', details: err.message });
          } else if (nodeErr.code === 'ETIMEDOUT' || nodeErr.code === 'ECONNRESET') {
            expressRes.status(504).json({ error: 'Gateway timeout', details: err.message });
          } else {
            expressRes.status(500).json({ error: 'Gateway proxy error', details: err.message });
          }
        } else if (!expressRes.writableEnded) {
          expressRes.end();
        }
      } else if (res instanceof Socket) {
        if (!res.destroyed) {
            res.destroy(err);
        }
      }
    },
  }
};

export const setupRoutes = (): Router => {
  router.use(logRequest);

  const authProxyOptions: Options = { ...commonProxyOptions, target: USER_SERVICE_URL, pathRewrite: { '^/auth': '/auth' } };
  router.use('/auth', createProxyMiddleware(authProxyOptions));

  const usersProxyOptions: Options = { ...commonProxyOptions, target: USER_SERVICE_URL, pathRewrite: { '^/users': '/users' } };
  router.use('/users', createProxyMiddleware(usersProxyOptions));
  
  const userPostsProxyOptions: Options = { ...commonProxyOptions, target: POST_SERVICE_URL };
  router.use('/users/:userId/posts', createProxyMiddleware(userPostsProxyOptions));

  const postsProxyOptions: Options = { ...commonProxyOptions, target: POST_SERVICE_URL, pathRewrite: { '^/posts': '/posts' } };
  router.use('/posts', createProxyMiddleware(postsProxyOptions));

  const feedProxy = createProxyMiddleware({
    ...commonProxyOptions,
    target: FEED_SERVICE_URL,
    pathRewrite: { '^/feed': '/feed' },
  });
  router.use('/feed', cacheMiddleware(CACHE_DURATION_MS), feedProxy);

  router.use((req: ExpressRequest, res: ExpressResponse) => {
    res.status(404).json({ error: 'Not Found - No route matched in API Gateway' });
  });

  return router;
};