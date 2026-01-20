"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DB_PASSWORD = exports.DB_USERNAME = exports.DB_DATABASE = exports.DB_PORT = exports.DB_HOST = exports.EMAIL_PASSWORD = exports.EMAIL_USER = exports.JWT_EXPIRES_IN = exports.JWT_SECRET = exports.PYTHON_URL = exports.SERVER_URL = exports.NODE_ENV = exports.PORT = void 0;
const dotenv_1 = require("dotenv");
(0, dotenv_1.config)({ path: `.env` });
_a = process.env, exports.PORT = _a.PORT, exports.NODE_ENV = _a.NODE_ENV, exports.SERVER_URL = _a.SERVER_URL, exports.PYTHON_URL = _a.PYTHON_URL, exports.JWT_SECRET = _a.JWT_SECRET, exports.JWT_EXPIRES_IN = _a.JWT_EXPIRES_IN, exports.EMAIL_USER = _a.EMAIL_USER, exports.EMAIL_PASSWORD = _a.EMAIL_PASSWORD, exports.DB_HOST = _a.DB_HOST, exports.DB_PORT = _a.DB_PORT, exports.DB_DATABASE = _a.DB_DATABASE, exports.DB_USERNAME = _a.DB_USERNAME, exports.DB_PASSWORD = _a.DB_PASSWORD;
