"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupRoutes = void 0;
const express_1 = __importDefault(require("express"));
const axios_1 = __importDefault(require("axios"));
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const router = express_1.default.Router();
const setupRoutes = () => {
    router.all('/users*', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const userApiUrl = process.env.USER_API_URL;
            if (!userApiUrl) {
                return res.status(500).json({ error: 'USER_API_URL not defined' });
            }
            const userApiResponse = yield (0, axios_1.default)({
                method: req.method,
                url: `${userApiUrl}${req.url}`,
                headers: Object.assign(Object.assign({}, req.headers), { 'Content-Type': req.headers['content-type'] ? req.headers['content-type'] : 'application/json' }),
                data: req.body,
            });
            res.status(userApiResponse.status).send(userApiResponse.data);
        }
        catch (error) {
            console.error('Error proxying to User API:', error.message);
            if (error.response) {
                res.status(error.response.status).send(error.response.data);
            }
            else {
                res.status(500).send({ error: 'Gateway Error' });
            }
        }
    }));
    router.all('/posts*', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const postApiUrl = process.env.POST_API_URL;
            if (!postApiUrl) {
                return res.status(500).json({ error: 'POST_API_URL not defined' });
            }
            const postApiResponse = yield (0, axios_1.default)({
                method: req.method,
                url: `${postApiUrl}${req.url}`,
                headers: Object.assign(Object.assign({}, req.headers), { 'Content-Type': req.headers['content-type'] ? req.headers['content-type'] : 'application/json' }),
                data: req.body,
            });
            res.status(postApiResponse.status).send(postApiResponse.data);
        }
        catch (error) {
            console.error('Error proxying to Post API:', error.message);
            if (error.response) {
                res.status(error.response.status).send(error.response.data);
            }
            else {
                res.status(500).send({ error: 'Gateway Error' });
            }
        }
    }));
    router.all('/feed*', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const feedApiUrl = process.env.FEED_API_URL;
            if (!feedApiUrl) {
                return res.status(500).json({ error: 'FEED_API_URL not defined' });
            }
            const feedApiResponse = yield (0, axios_1.default)({
                method: req.method,
                url: `${feedApiUrl}${req.url}`,
                headers: Object.assign(Object.assign({}, req.headers), { 'Content-Type': req.headers['content-type'] ? req.headers['content-type'] : 'application/json' }),
                data: req.body,
            });
            res.status(feedApiResponse.status).send(feedApiResponse.data);
        }
        catch (error) {
            console.error('Error proxying to Feed API:', error.message);
            if (error.response) {
                res.status(error.response.status).send(error.response.data);
            }
            else {
                res.status(500).send({ error: 'Gateway Error' });
            }
        }
    }));
    return router;
};
exports.setupRoutes = setupRoutes;
//# sourceMappingURL=routes.js.map