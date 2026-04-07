"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUsers = void 0;
const db_1 = __importDefault(require("../database/db"));
const getUsers = async (req, res) => {
    try {
        const connection = await (0, db_1.default)();
        const [rows] = await connection.execute('SELECT * FROM tfs_user');
        await connection.end();
        res.status(200).json({
            success: true,
            message: 'Users fetched successfully',
            data: rows
        });
    }
    catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching users',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};
exports.getUsers = getUsers;
