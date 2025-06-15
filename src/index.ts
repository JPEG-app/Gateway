import { App } from './app';
import * as dotenv from 'dotenv';
import logger from './utils/logger'; 

dotenv.config();

const port = process.env.PORT || 8000;

const startGateway = async () => {
    logger.info('API Gateway starting...', { type: 'GatewayStartupLog.Init' });
    try {
        const appInstance = new App();
        const server = appInstance.server;

        server.listen(port, () => {
            logger.info(`Gateway API is running on port ${port}`, { port, type: 'GatewayStartupLog.HttpReady' });
        });

        const shutdown = (signal: string) => {
            logger.info(`${signal} received. Shutting down API Gateway gracefully.`, { signal, type: 'GatewayShutdownLog.SignalReceived' });
            server.close(() => {
                logger.info('Gateway server closed.');
                process.exit(0);
            });
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('uncaughtException', (error) => {
            logger.error('Unhandled synchronous error in Gateway (uncaughtException):', { error: error.message, stack: error.stack, type: 'GatewayFatalErrorLog.UncaughtException' });
            process.exit(1);
        });
        process.on('unhandledRejection', (reason, promise) => {
            logger.error('Unhandled promise rejection in Gateway:', { reason, type: 'GatewayFatalErrorLog.UnhandledRejection' });
        });

    } catch (error: any) {
        logger.error('Failed to start API Gateway.', { error: error.message, stack: error.stack, type: 'GatewayStartupLog.FatalError' });
        process.exit(1);
    }
};

startGateway();