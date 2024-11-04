import { Router } from "express";
import { BotReply } from "../controllers/prompt.controller";

const promptRouter = Router();

promptRouter.post('/bot-reply',BotReply)
// promptRouter.get('/suggestions',SuggestionsList)

export default promptRouter;