import express, { Router, Request, Response, NextFunction } from 'express';
import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

let user_service: string = process.env.USER_API_URL || "http://user-service:3001";
let post_service: string = process.env.POST_API_URL || "http://post-service:3002";
let feed_service: string = process.env.FEED_API_URL || "http://feed-service:3003";

const router: Router = express.Router();

const logRequest = (req: Request, res: Response, next: NextFunction) => {
  console.log(`[${req.method}] ${req.originalUrl}`);
  next();
};

export const setupRoutes = (): Router => {
  router.use(logRequest);

  router.all('/users/*', (req: Request, res: Response, next: NextFunction) => {
    if (req.originalUrl.startsWith('/users/') && req.originalUrl.split('/').length === 3) {
      proxyRequest(req, res, user_service, '/users');
    } else if (req.originalUrl.startsWith('/users/me') || req.originalUrl.startsWith('/users/me/')) {
      proxyRequest(req, res, user_service, '/users');
    } else {
      next();
    }
  });

  router.all('/auth/*', (req: Request, res: Response) => {
    proxyRequest(req, res, user_service, '/auth');
  });

  router.all('/posts*', (req: Request, res: Response) => {
    proxyRequest(req, res, post_service, '/posts');
  });

  router.all('/users/:userId/posts', (req: Request, res: Response) => {
    proxyRequest(req, res, post_service, `/users/${req.params.userId}/posts`);
  });

  router.all('/feed*', (req: Request, res: Response) => {
    proxyRequest(req, res, feed_service, '/feed');
  });

  return router;
};

const proxyRequest = async (req: Request, res: Response, targetApiUrl: string, targetPath: string) => {
  try {
    const apiResponse = await axios({
      method: req.method,
      url: `${targetApiUrl}${targetPath}`,
      headers: {
        ...req.headers,
        'Content-Type': req.headers['content-type'] ? req.headers['content-type'] : 'application/json',
      },
      data: req.body,
    });

    res.status(apiResponse.status).send(apiResponse.data);
  } catch (error: any) {
    console.error(`Error proxying ${req.method} ${req.originalUrl} to ${targetApiUrl}${targetPath}:`, error.message);
    if (error.response) {
      res.status(error.response.status).send(error.response.data);
    } else {
      res.status(500).send({ error: 'Gateway Error' });
    }
  }
};