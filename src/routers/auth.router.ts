import { Router } from "express";
import { retrieveUserInfo, updatePassword, userLogin, userRegistration,createPaymentIntent,forgotPassword,resetPassword } from "../controllers/auth.controller";

const authRouter = Router();

authRouter.post('/register', userRegistration);
authRouter.post('/login', userLogin);
authRouter.get('/user-info', retrieveUserInfo);
authRouter.post('/update-password', updatePassword);
authRouter.post('/create-payment-intent', createPaymentIntent);
authRouter.post('/forgot-password', forgotPassword);
authRouter.post('/reset-password/:token',resetPassword );





export default authRouter;
