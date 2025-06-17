import { Router, Request as ExpressRequest, Response as ExpressResponse, NextFunction } from 'express';
import { createProxyMiddleware, Options as ProxyOptions, fixRequestBody } from 'http-proxy-middleware';
import { ClientRequest, IncomingMessage, ServerResponse as HttpServerResponse, Server as HttpServer } from 'http';
import { Socket } from 'net';
import * as dotenv from 'dotenv';
import mcache from 'memory-cache';
import winston from 'winston';
import { RequestWithId } from '../utils/logger';

dotenv.config();

const USER_SERVICE_URL: string = process.env.USER_API_URL || "http://user-service-service:3001";
const POST_SERVICE_URL: string = process.env.POST_API_URL || "http://post-service-service:3002";
const FEED_SERVICE_URL: string = process.env.FEED_API_URL || "http://feed-service-service:3003";
const SEARCH_SERVICE_URL: string = process.env.SEARCH_API_URL || "http://search-service-service:4001";

const router: Router = Router();

const CACHE_DURATION_MS = process.env.GATEWAY_CACHE_DURATION_MS ? parseInt(process.env.GATEWAY_CACHE_DURATION_MS) : 5 * 60 * 1000;

const cacheMiddleware = (logger: winston.Logger, duration: number) => {
  return (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
    const typedReq = req as RequestWithId;
    const correlationId = typedReq.id;
    if (req.method !== 'GET') {
      return next();
    }
    const key = '__gateway_cache__' + req.originalUrl || req.url; 
    const cachedBody = mcache.get(key);
    if (cachedBody) {
      logger.info(`[GATEWAY CACHE] HIT`, { correlationId, cacheKey: key, type: 'GatewayCacheLog.Hit' });
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('Content-Type', 'application/json');
      res.send(cachedBody);
      return;
    } else {
      logger.info(`[GATEWAY CACHE] MISS`, { correlationId, cacheKey: key, type: 'GatewayCacheLog.Miss' });
      res.setHeader('X-Cache', 'MISS');
      const originalSend = res.send.bind(res);
      res.send = (body: any): ExpressResponse => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          logger.info(`[GATEWAY CACHE] PUT`, { correlationId, cacheKey: key, durationMs: duration, type: 'GatewayCacheLog.Put' });
          mcache.put(key, body, duration);
        }
        return originalSend(body);
      };
      next();
    }
  };
};

const createCommonProxyOptions = (logger: winston.Logger, targetService: string, targetUrl: string): ProxyOptions => ({
  target: targetUrl,
  changeOrigin: true,
  on: {
    proxyReq: (proxyReq: ClientRequest, req: IncomingMessage, res: HttpServerResponse) => {
      const expressReq = req as RequestWithId; 
      const correlationId = expressReq.id;
      if (correlationId) proxyReq.setHeader('X-Correlation-ID', correlationId);
      if (expressReq.headers.authorization) proxyReq.setHeader('Authorization', expressReq.headers.authorization);
      
      if (expressReq.body && (expressReq.method === 'POST' || expressReq.method === 'PUT' || expressReq.method === 'PATCH')) {
        fixRequestBody(proxyReq, req);
      }
      logger.info(`Gateway: Proxying request`, {
        correlationId, method: expressReq.method, originalUrl: expressReq.originalUrl,
        targetService, targetUrlProxied: `${proxyReq.protocol}//${proxyReq.host}${proxyReq.path}`, 
        type: 'GatewayProxyLog.Proxying'
      });
    },
    proxyRes: (proxyRes: IncomingMessage, req: IncomingMessage, res: HttpServerResponse) => {
      const expressReq = req as RequestWithId;
      const correlationId = expressReq.id;
      const requestHandlingTime = Date.now() - (expressReq.startTime || Date.now());
      logger.info(`Gateway: Received response from downstream service`, {
        correlationId, method: expressReq.method, originalUrl: expressReq.originalUrl,
        targetService, statusCode: proxyRes.statusCode, statusMessage: proxyRes.statusMessage,
        requestHandlingTimeMsAtProxyRes: requestHandlingTime, type: 'GatewayProxyLog.Response'
      });
    },
    error: (err: Error, req: IncomingMessage, res: HttpServerResponse | Socket, target?: any) => {
      const expressReq = req as RequestWithId;
      const correlationId = expressReq.id;
      const nodeErr = err as NodeJS.ErrnoException;
      let targetDisplay = (target && typeof target === 'object' && target.href) ? target.href : (typeof target === 'string' ? target : 'unknown target');
      logger.error(`Gateway: Proxy error`, {
        correlationId, targetService, targetUrl: targetDisplay, errorMessage: err.message,
        errorCode: nodeErr.code, stack: err.stack, type: 'GatewayProxyLog.Error'
      });
      if (res instanceof HttpServerResponse) {
        const expressRes = res as ExpressResponse;
        if (!expressRes.headersSent) {
          let statusCode = 500, message = 'Gateway proxy error';
          if (nodeErr.code === 'ECONNREFUSED' || nodeErr.code === 'ENOTFOUND') { statusCode = 503; message = 'Service unavailable'; }
          else if (nodeErr.code === 'ETIMEDOUT' || nodeErr.code === 'ECONNRESET') { statusCode = 504; message = 'Gateway timeout'; }
          expressRes.status(statusCode).json({ error: message, details: err.message, correlationId });
        } else if (!expressRes.writableEnded) expressRes.end();
      } else if (res instanceof Socket && !res.destroyed) res.destroy(err);
    },
  }
});

export const setupRoutes = (logger: winston.Logger, server: HttpServer): Router => {

  router.get('/healthz', (req: ExpressRequest, res: ExpressResponse) => {
    res.status(200).json({ status: 'UP', message: 'API Gateway is healthy' });
  });

  router.use(['/auth', '/api/v1/auth'], createProxyMiddleware({
    ...createCommonProxyOptions(logger, 'UserService(Auth)', USER_SERVICE_URL),
    pathRewrite: (path, req) => { 
        return '/auth' + path;
    }
  }));

  router.use(['/users', '/api/v1/users'], (req, res, next) => {
    if (req.originalUrl.match(/^\/(api\/v1\/)?users\/[^/]+\/posts/)) {
      return next();
    }
    createProxyMiddleware({
      ...createCommonProxyOptions(logger, 'UserService(Users)', USER_SERVICE_URL),
      pathRewrite: (path, req) => '/users' + path
    })(req, res, next);
  });

  router.use(['/users/:userId/posts', '/api/v1/users/:userId/posts'], createProxyMiddleware({
    ...createCommonProxyOptions(logger, 'PostService(UserPosts)', POST_SERVICE_URL),
    pathRewrite: (path, req) => {
        const expressReq = req as ExpressRequest;
        if (expressReq.originalUrl.startsWith('/api/v1/users/')) {
            return expressReq.originalUrl.replace('/api/v1', '');
        }
        return expressReq.originalUrl;
    }
  }));

  router.use(['/posts', '/api/v1/posts'], createProxyMiddleware({
    ...createCommonProxyOptions(logger, 'PostService(Posts)', POST_SERVICE_URL),
    pathRewrite: (path, req) => '/posts' + path
  }));

  router.use(['/feed', '/api/v1/feed'], cacheMiddleware(logger, CACHE_DURATION_MS), createProxyMiddleware({
    ...createCommonProxyOptions(logger, 'FeedService', FEED_SERVICE_URL),
    pathRewrite: (path, req) => '/feed' + path 
  }));
  
  router.use(['/search', '/api/v1/search'], cacheMiddleware(logger, CACHE_DURATION_MS), createProxyMiddleware({
    ...createCommonProxyOptions(logger, 'SearchService', SEARCH_SERVICE_URL),
    pathRewrite: (path, req) => {
        return path.replace(/^\/api\/v1/, '');
    }
  }));

  router.use((req: ExpressRequest, res: ExpressResponse) => {
    const typedReq = req as RequestWithId;
    logger.warn('Route not found in API Gateway', {
        correlationId: typedReq.id, method: req.method, url: req.originalUrl, type: 'GatewayRouteNotFound'
    });
    res.status(404).json({ error: 'Not Found - No route matched in API Gateway', correlationId: typedReq.id });
  });

  return router;
};