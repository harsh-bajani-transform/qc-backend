"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = __importDefault(require("../database/db"));
// User-related queries
const userQueries = {
    // Get user with designation for QC access check
    getUserWithDesignation: async (userId) => {
        const connection = await (0, db_1.default)();
        try {
            const [result] = await connection.execute('SELECT u.user_id, u.user_name, u.designation_id, ud.designation as designation_name FROM tfs_user u LEFT JOIN user_designation ud ON u.designation_id = ud.designation_id WHERE u.user_id = ?', [userId]);
            return result[0] || null;
        }
        finally {
            await connection.end();
        }
    },
    // Get all designations for access control
    getAllDesignations: async () => {
        const connection = await (0, db_1.default)();
        try {
            const [result] = await connection.execute('SELECT designation_id, designation FROM user_designation ORDER BY designation_id');
            return result;
        }
        finally {
            await connection.end();
        }
    }
};
exports.default = userQueries;
