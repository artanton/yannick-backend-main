import e, { Request, Response, NextFunction } from "express";
import ExcelFile from "../modals/excelFile.modal";
import multer from 'multer';
import path from "path";
import OpenAI from "openai";
import { OPEN_API_KEY } from "../constant/env.contant";
import Prompt from "../modals/prompt.modal";
import * as xlsx from 'xlsx';
import { questionsAndAnswers } from '../utils/prompt.utils'
import * as ExcelJS from 'exceljs';
import { extractActivityColumn, jsonFilter, jsonFilterAndSanitization, mergeMissingDataAndGenerateExl, updateActivityColumn } from "../utils/user.excelread";
import processSteps from "../utils/excelData";

const apiKey = OPEN_API_KEY;
const client = new OpenAI.OpenAI({ apiKey });
const allowedFileTypes = ['.xls', '.xlsx', '.xlsm', '.csv'];

// Configure Multer storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../../public/uploads'));
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}_${file.originalname}`);
    }
});

// File filter to check file type
const fileFilter = (req: any, file: any, cb: any) => {
    const fileType = path.extname(file.originalname).toLowerCase();
    if (allowedFileTypes.includes(fileType)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Please upload an Excel or CSV file.'));
    }
};

// Initialize Multer with storage and file filter
const upload = multer({ storage,limits: { fileSize: 5 * 1024 * 1024 }, fileFilter });

export const uploadMiddleware = upload.single('file');

export const uploadExcelFile = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const file = req.file;
        console.log('Uploading file', file);
        if (!file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        // Check file type and size
        const fileType = path.extname(file.originalname).toLowerCase();
        console.log('Uploading fileType', fileType);

        if (!allowedFileTypes.includes(fileType)) {
            return res.status(400).json({ message: 'Only Excel files (.xls, .xlsx, .xlsm, .csv) are accepted' });
        }
        if (file.size === 0) {
            return res.status(400).json({ message: 'Uploaded file is empty' });
        }

        const fileName = path.basename(file.path);
        const filePathCheck = file.path;
        console.log('filePathCheck', filePathCheck, file, fileName);

        // Save file info to the database
        const newExcelFile = new ExcelFile({ file: fileName });
        await newExcelFile.save();

        const jsonData = readExcelFile(fileName);
        console.log('jsonData final after return', jsonData)
        const response: any = await generateAIReply(jsonData);
        if (!response) {
            return res.status(200).json({ status: false, message: 'Failed to generate AI response' });
        }
        console.log("AI Response 2:", response);

        let aiResponse = response?.choices[0]?.message?.content;
        console.log("AI Response 3:", aiResponse);

        let aiResponsefinal;
        if (aiResponse) {
            // Remove backticks and other potential problematic characters
            aiResponse = aiResponse.replace(/```json|```/g, '').trim();
            console.log("Sanitized AI Response:", aiResponse); // Log sanitized response

            // Check if the AI response is valid JSON
            if (!isValidJson(aiResponse)) {
                res.status(200).json({ status: false, message: "Invalid JSON format from AI response" });
            }

            try {
                aiResponsefinal = JSON.parse(aiResponse);
            } catch (parseError) {
                console.error("Error parsing AI response JSON:", parseError);
                return res.status(200).json({ status: false, message: 'Error parsing AI response JSON' });
            }

            // Generate Excel file from AI response
            const filePath = await generateExcel(aiResponsefinal);
            console.log('Excel file generated:', filePath);
            res.status(200).json({ status: true, message: 'File uploaded successfully', file: newExcelFile, filePath });
        } else {
            res.status(500).json({ message: 'AI response is empty' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};





export const retrieveExcelFile = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const file = req.file;
        console.log('Uploading file', file);
        if (!file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        // Check file type and size
        const fileType = path.extname(file.originalname).toLowerCase();
        console.log('Uploading fileType', fileType);

        if (!allowedFileTypes.includes(fileType)) {
            return res.status(200).json({ status: false, message: 'Only Excel files (.xls, .xlsx, .xlsm, .csv) are accepted' });
        }
        if (file.size === 0) {
            return res.status(200).json({ status: false, message: 'Uploaded file is empty' });
        }
        const fileName = path.basename(file.path);
        const filePathCheck = file.path;
        console.log('filePathCheck', filePathCheck, file, fileName);

        const activitiesList = extractActivityColumn(file.path)
        // console.log("activitiesList", activitiesList)
        if (activitiesList?.length == 0) {
            return res.status(200).json({ status: false, message: "Excel format is invalid", type: "invalid_format" })
        }

        const result: any = await jsonFilterAndSanitization(activitiesList, filePathCheck)
        return res.status(200).json(result)

    } catch (error) {
        console.error("error while retrieveing excel file", e)
        return res.status(200).json({ status: false, message: "Something went wrong ! Please try again" })

    }
}



const readExcelFile = (fileName: string) => {
    console.log('readExcelFile', fileName);
    path.join(__dirname, '../public/uploads')
    const workbook = xlsx.readFile(`public/uploads/${fileName}`);
    console.log('readExcelFile workbook', workbook);

    const sheetName = workbook.SheetNames[0];
    console.log('readExcelFile sheetName', sheetName);

    const sheet = workbook.Sheets[sheetName];
    console.log('readExcelFile sheetName sheet', sheet);

    const jsonData = xlsx.utils.sheet_to_json(sheet);
    console.log('readExcelFile jsonData', jsonData);

    return jsonData;
};

const generateAIReply = async (jsonData: any) => {
    try {
        const promptResult = await Prompt.find({ _id: "2" }).lean();

        const prompter = promptResult[0]?.instructions;
        console.log('generateAIReply ', questionsAndAnswers);

        if (prompter) {
            const PROMPT = `
                User Query: Here is user response of question and their respective answers: ${JSON.stringify(questionsAndAnswers)}.
                Prompt: ${JSON.stringify(prompter)}.
            
                Response Format: Answer in JSON format in the structure below:
                {
                  ai_reply: reply to ${JSON.stringify(questionsAndAnswers)} as per ${JSON.stringify(prompter)} follow data format ${JSON.stringify(jsonData)} and make sure there is no empty values. Use your change managment expertise to fill the data.
                }
                `;
            console.log("PROMPT", PROMPT);
            const completion = await client.chat.completions.create({
                messages: [
                    { role: "system", content: "You are a helpful assistant." },
                    { role: "user", content: PROMPT }
                ],
                model: "gpt-4o-mini",
            });

            return completion;
        }
        return false;
    } catch (error) {
        console.error("Error while generating response from OpenAI", error);
        return false;
    }
};

export const generateExcel = async (data: any) => {
    console.log("data.ai_reply------------------>", data.ai_reply)
    const randomFileName = await generateExcelSheet(data.ai_reply);


    return randomFileName;
};
// Function to generate the Excel sheet
async function generateExcelSheet(result: any) {
    try {
        // console.log("Generating Excel Sheet", JSON.stringify(result, null, 2));

        if (typeof result !== 'object' || result === null) {
            throw new TypeError("Expected result to be an object, but got " + typeof result);
        }

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Sheet1');

        // Extract all unique keys from the data to define the headers dynamically
        const headersSet = new Set<string>();
        result.forEach((item: any) => {
            Object.keys(item).forEach(key => headersSet.add(key));
        });

        const headers = Array.from(headersSet);
        worksheet.addRow(headers);

        // Iterate over the data to populate the rows
        result.forEach((item: any) => {
            const row: any[] = [];
            headers.forEach(header => {
                row.push(item[header] || '');
            });
            worksheet.addRow(row);
        });

        // Apply border styles
        worksheet.eachRow({ includeEmpty: true }, (row) => {
            row.eachCell({ includeEmpty: true }, (cell) => {
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
            });
        });

        // Add filters
        worksheet.autoFilter = {
            from: 'A1',
            to: `${String.fromCharCode(65 + headers.length - 1)}1` // Adjust this range according to your data
        };

        // Adjust column widths based on content
        worksheet.columns.forEach((column: any) => {
            if (column) { // Ensure the column is not undefined
                let maxLength = 0;
                column.eachCell({ includeEmpty: true }, (cell: any) => {
                    if (cell && cell.value) {
                        const length = cell.value.toString().length;
                        if (length > maxLength) {
                            maxLength = length;
                        }
                    }
                });
                column.width = maxLength < 10 ? 10 : maxLength + 2;
            }
        });

        // Generate a random file name and save the file
        const randomFileName = generateRandomFileName('ai_response', 'xlsx');
        const filePath = `public/files/${randomFileName}`;
        console.log("Excel file saved at:", filePath);

        await workbook.xlsx.writeFile(filePath);

        return randomFileName;
    } catch (error) {
        console.error("Error while creating Excel file:", error);
        return "";
    }
}




// Function to generate a random file name
const generateRandomFileName = (prefix: any, extension: any) => {
    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD format
    const randomString = Math.random().toString(36).substring(2, 15);
    return `${prefix}_${date}_${randomString}.${extension}`;
};

function isValidJson(str: string): boolean {
    try {
        JSON.parse(str);
        return true;
    } catch {
        return false;
    }
}
function matchActivitiesByPhase(data:any, processSteps:any) {
    const matchedActivities:any = {};
  
    data.forEach((activityObj:any) => {
      const activityName = activityObj.Activity;
  
      // Loop through each phase in processSteps
      Object.keys(processSteps).forEach(phase => {
        processSteps[phase].forEach((stepObj:any) => {
          stepObj.sub_tasks.forEach((subTask:any) => {
            if (subTask.Activities === activityName) {
              // Initialize phase in result object if not already there
              if (!matchedActivities[phase]) {
                matchedActivities[phase] = [];
              }
  
              matchedActivities[phase].push({
                'Activities': activityName,
                "Process Step": stepObj["Process Step"],
                'Type of Change Complexity': subTask["Type of Change Complexity"],
                'Owner': subTask.Owner,
                'Target Audience': subTask["Target Audience"],
                'Engagement&Communication Medium': subTask["Engagement&Communication Medium"],
                'Relevance': subTask.Relevance,
                'Tool': subTask.Tool,
                'Timeframe': subTask.Timeframe
              });
            }
          });
        });
      });
    });
  
    return matchedActivities;
  }
  
  



export const fillMissingActivities = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { missingActivities, activitiesList } = req.body

        const mergedResponse: any = [...activitiesList, ...missingActivities]
        const formattedResponse = await matchActivitiesByPhase(mergedResponse,processSteps)
        // console.log("formattedResponse",JSON.stringify(formattedResponse))
        const { fileName, filePath } = await mergeMissingDataAndGenerateExl(formattedResponse)
        if (fileName) {
            return res.status(200).json({ status: true, fileName: fileName, filePath: filePath })
        }
        return res.status(200).json({ status: false, fileName: '' })
    } catch (error) {
        console.error("error while filling missing activities", error)
        return res.status(200).json({ status: false, fileName: '' })

    }
}

