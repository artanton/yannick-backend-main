import { Router } from "express";
import { getPrompts, addPrompt, updatePrompt } from "../controllers/admin.controller";

const adminRouter = Router();

adminRouter.get('/prompts', getPrompts);
adminRouter.post('/prompts', addPrompt);
adminRouter.put('/prompts/:id', updatePrompt);

export default adminRouter;
