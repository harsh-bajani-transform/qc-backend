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
const db_1 = __importDefault(require("../database/db"));
// User-related queries
const userQueries = {
    // Get user with designation for QC access check
    getUserWithDesignation: (userId) => __awaiter(void 0, void 0, void 0, function* () {
        const connection = yield (0, db_1.default)();
        try {
            const [result] = yield connection.execute('SELECT u.user_id, u.user_name, u.designation_id, ud.designation as designation_name FROM tfs_user u LEFT JOIN user_designation ud ON u.designation_id = ud.designation_id WHERE u.user_id = ?', [userId]);
            return result[0] || null;
        }
        finally {
            yield connection.end();
        }
    }),
    // Get all designations for access control
    getAllDesignations: () => __awaiter(void 0, void 0, void 0, function* () {
        const connection = yield (0, db_1.default)();
        try {
            const [result] = yield connection.execute('SELECT designation_id, designation FROM user_designation ORDER BY designation_id');
            return result;
        }
        finally {
            yield connection.end();
        }
    })
};
exports.default = userQueries;
