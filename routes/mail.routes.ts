import { Router } from "express";
import { sendReworkEmail } from "../controllers/mail.controller";

const router = Router();

router.post("/mail/send-rework", sendReworkEmail);

export default router;
