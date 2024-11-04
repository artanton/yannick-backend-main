import { Router } from "express";
import { fillMissingActivities, retrieveExcelFile, uploadExcelFile, uploadMiddleware } from "../controllers/excelFile.controller";

const excelFileRouter = Router();

excelFileRouter.post('/uploadExcelFile', uploadMiddleware, retrieveExcelFile)
excelFileRouter.post('/updateExel', fillMissingActivities)
// console.log("excel datad  :::::::::: :::" ,uploadMiddleware,uploadExcelFile)
// promptRouter.get('/suggestions',SuggestionsList)

export default excelFileRouter;