import { Router } from "express";
import { fetchAllPlansOfUser, searchPlansOfUser } from "../controllers/user.controller";

const userRouter = Router();

userRouter.post('/get-plans', fetchAllPlansOfUser)
userRouter.post('/search-plan', searchPlansOfUser)


export default userRouter;