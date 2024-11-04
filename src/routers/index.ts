import { Router } from "express";

import promptRouter from "./prompt.router";
import adminRouter from "./admin.router";
import excelFileRouter from "./excelFile.router";
import authRouter from "./auth.router";
import userRouter from "./user.router";
const router = Router();
console.log("datat ::::::::::::::")
router.use('/prompt', promptRouter);
router.use('/admin', adminRouter);
router.use('/upload', excelFileRouter);
router.use('/auth', authRouter);
router.use('/user', userRouter)


export default router;
