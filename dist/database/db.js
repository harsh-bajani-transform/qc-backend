"use strict";
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
exports.get_db_connection = void 0;
const promise_1 = __importDefault(require("mysql2/promise"));
const env_1 = require("../config/env");
const get_db_connection = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const connection = yield promise_1.default.createConnection({
            host: env_1.DB_HOST,
            user: env_1.DB_USERNAME,
            password: env_1.DB_PASSWORD,
            database: env_1.DB_DATABASE,
            port: Number(env_1.DB_PORT)
        });
        console.log('Connected to MySQL database successfully');
        return connection;
    }
    catch (error) {
        console.error('Error connecting to MySQL database:', error);
        throw error;
    }
});
exports.get_db_connection = get_db_connection;
exports.default = exports.get_db_connection;
