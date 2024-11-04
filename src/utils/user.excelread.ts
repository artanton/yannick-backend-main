import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import Prompt from '../modals/prompt.modal';
import { OPEN_API_KEY } from '../constant/env.contant';
import OpenAI from 'openai';
import processSteps from './excelData';
import ExcelJS from 'exceljs';
import { generateExcelSheet, generateRandomFileName } from '../controllers/prompt.controller';
const apiKey = OPEN_API_KEY;
const client = new OpenAI.OpenAI({ apiKey });

export const extractActivityColumn = (filePath: any) => {
    try {
        // Read the file from the filesystem
        const fileBuffer = fs.readFileSync(filePath);
        console.log('File Buffer Size:', fileBuffer.length); // Check buffer size

        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
        console.log('Workbook:', workbook); // Debug: Check workbook structure

        const sheetNames = workbook.SheetNames;
        let activities: any[] = [];

        if (sheetNames.length === 0) {
            throw new Error('No sheets found in workbook');
        }

        for (const sheetName of sheetNames) {
            const sheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

            // console.log('Sheet Name:', sheetName);
            // console.log('JSON Data:', jsonData); // Debug: Check JSON data

            // Check if jsonData is properly populated
            if (!jsonData || jsonData.length === 0) {
                console.log('Sheet is empty or not properly formatted.');
                continue; // Move to the next sheet if this one is empty
            }

            const headers: any = jsonData[0];
            if (!headers) {
                console.log('No headers found in sheet:', sheetName);
                continue; // Move to the next sheet if headers are not found
            }

            const activityIndex = headers.findIndex((header: any) => header.trim().toLowerCase() === 'activities');

            if (activityIndex !== -1) {
                // Extract activities from the column
                activities = jsonData.slice(1).map((row: any) => ({
                    Activity: row[activityIndex]
                }));
                break; // Stop searching after finding the first sheet with the Activity column
            }
        }

        if (activities.length === 0) {
            console.log('No activities column found.');
            return [];
        }

        return activities;
    } catch (error) {
        console.error('Error reading file', error);
        return [];
    }
}


const readJsonFile = (): any => {
    try {
        // Read the JSON file
        const jsonFilePath = path.resolve(__dirname, '../json/activity.json');
        const fileContent = fs.readFileSync(jsonFilePath, 'utf-8');
        // Parse and return the JSON data
        return JSON.parse(fileContent);
    } catch (error) {
        console.error('Error reading or parsing JSON file', error);
        return null;
    }
};


export const jsonFilter = async (userJson: any) => {
    try {
        const jsonData = readJsonFile()
        const PROMPT = `
            You are given two sets of JSON data. The first set is user-provided JSON and the second set is the data from the file. 

            userJson: ${JSON.stringify(userJson)}
            jsonData: ${JSON.stringify(jsonData)}

            Please respond with a JSON object that contains:
            {
              "activity_score": An array of objects from jsonData that relate to any activity in userJson.
              "missing_activity": An array of objects from jsonData that are not present in userJson.
            }
        `;
        const completion = await client.chat.completions.create({
            messages: [
                { role: "system", content: "You are a helpful assistant." },
                { role: "user", content: PROMPT }
            ],
            model: "gpt-4o-mini",
        });

        return completion;

    } catch (error) {
        console.error("error while matching score", error);
    }
}

function isValidJson(str: string): boolean {
    try {
        JSON.parse(str);
        return true;
    } catch {
        return false;
    }
}



export const generateRelevantExcelJSONAccToReference = async (userQuery: string) => {
    try {
        const promptResult = await Prompt.find({ _id: "1" }).lean();
        console.log("promptResult", promptResult);


        const prompter = promptResult[0]["instructions"];
        console.log("prompter", prompter);

        if (prompter) {
            const PROMPT = `
            User Query: The user has provided the following list of activities: ${userQuery}.
            Prompt Details: ${JSON.stringify(prompter)}.
            
            Response Format:
            Please respond with a JSON object that contains  the activities listed in the user query. The JSON object should adhere to the structure of ${JSON.stringify(processSteps)}. Ensure that:
            1. Please read the User Query and match the activities with those in the reference json ${JSON.stringify(processSteps)}. Also consider only those points that are related with the reference json file.
            2. The JSON object only follows the format specified in ${JSON.stringify(processSteps)}.
            3. Must  fill this  in the json object"Additional Insights"
            
            Your response should be a well-formed JSON object that includes only the relevant activities from the user query and matches the structure outlined in ${JSON.stringify(processSteps)}.
            `;


            console.log("PROMPT", PROMPT);
            const completion = await client.chat.completions.create({
                messages: [
                    { role: "system", content: "You are a helpful assistant." },
                    { role: "user", content: PROMPT }
                ],
                model: "gpt-4o-mini",
                response_format: { type: 'json_object' }
            });
            console.log("Recommendations results:", JSON.stringify(completion));
            return completion;
        }
        return false;
    } catch (error) {
        console.error("Error while generating response from OpenAI", error);
        return false;
    }
};


export const jsonFilterAndSanitization = async (activitiesList: any, filePath: string) => {
    try {
        const activities_details: any = await jsonFilter(activitiesList);
        let aiResponse = activities_details ? activities_details?.choices[0]?.message?.content : false;

        if (aiResponse) {
            // Remove unwanted text before and after the JSON data
            const jsonString = aiResponse.match(/{[\s\S]*}/);
            if (!jsonString) {
                return { status: false, message: "No valid JSON found in the AI response" };
            }

            aiResponse = jsonString[0].trim();
            console.log("activities_details", { aiResponse, type: typeof aiResponse });

            // Check if the AI response is valid JSON
            if (!isValidJson(aiResponse)) {
                return { status: false, message: "Invalid JSON format from AI response" };
            }

            let aiResponsefinal: any = false;
            try {
                aiResponsefinal = JSON.parse(aiResponse);
            } catch (parseError) {
                console.error("Error parsing AI response JSON:", parseError);
                return { status: false, message: 'Error parsing AI response JSON' };
            }

            let finalResult: any = {};
            finalResult["filePath"] = filePath
            finalResult["activitiesList"] = activitiesList
            if (aiResponsefinal["activity_score"]) {
                const sum = aiResponsefinal["activity_score"].reduce((total: any, item: any) => total + item.score, 0);
                const strength_count = (sum / 160) * 100;
                finalResult["strength_count"] = strength_count;
                finalResult["sum"] = sum;
                finalResult["matched_activity"] = aiResponsefinal["activity_score"]
                console.log("aiResponsefinalaiResponsefinal", aiResponsefinal["missing_activity"])
                if (aiResponsefinal["missing_activity"]) {
                    finalResult["missing_activity"] = aiResponsefinal["missing_activity"];
                }
            }

            const jsonForExcel: any = await generateRelevantExcelJSONAccToReference(activitiesList);
            if (jsonForExcel) {
                let aiResponse = jsonForExcel?.choices[0]?.message?.content;
                console.log("AI Response 3:", aiResponse);

                let aiResponseExcel;
                if (aiResponse) {
                    // Remove backticks and other potential problematic characters
                    aiResponse = aiResponse.replace(/```json|```/g, '').trim();
                    console.log("Sanitized AI Response:", aiResponse, typeof aiResponse); // Log sanitized response
                    aiResponseExcel = JSON.parse(aiResponse);
                    console.log("---------------aiResponse---------", typeof aiResponseExcel)

                    // Generate Excel file from AI response
                    const filePath = await generateExcelSheet(aiResponseExcel)
                    const fileName = path.basename(filePath);
                    finalResult["fileName"] = fileName
                    finalResult["filePath"] = filePath
                }
            }
            return { status: true, message: 'Excel file successfully parsed', finalResult: finalResult };
        }

    } catch (error) {
        console.error("error while sanitization of json", error);
        return { status: false, message: 'Error while parsing excel file data' };
    }
}





export const updateActivityColumn = (filePath: any, missingActivities: any) => {
    const fileName = path.basename(filePath);
    try {
        // Read the file from the filesystem
        const fileBuffer = fs.readFileSync(filePath);
        console.log('File Buffer Size:', fileBuffer.length); // Check buffer size

        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
        console.log('Workbook:', workbook); // Debug: Check workbook structure

        const sheetNames = workbook.SheetNames;

        if (sheetNames.length === 0) {
            throw new Error('No sheets found in workbook');
        }

        // Assume we're updating the first sheet
        const firstSheetName = sheetNames[0];
        const sheet = workbook.Sheets[firstSheetName];
        const jsonData: any = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        if (!jsonData || jsonData.length === 0) {
            throw new Error('Sheet is empty or not properly formatted.');
        }

        const headers: any = jsonData[0];
        const activityIndex = headers.findIndex((header: any) => header.trim().toLowerCase() === 'activities');

        if (activityIndex === -1) {
            throw new Error('No activities column found.');
        }

        // Update the 'Activities' column with values from missingActivities
        for (let i = 0; i < missingActivities.length; i++) {
            if (i + 1 < jsonData.length) {
                jsonData[i + 1][activityIndex] = missingActivities[i].Activity;
            } else {
                // If there are more activities than rows, add new rows
                jsonData.push(new Array(headers.length).fill(''));
                jsonData[jsonData.length - 1][activityIndex] = missingActivities[i].Activity;
            }
        }

        // Update the sheet with the modified data
        const updatedSheet = XLSX.utils.aoa_to_sheet(jsonData);
        workbook.Sheets[firstSheetName] = updatedSheet;

        // Write the updated workbook to the same file
        XLSX.writeFile(workbook, filePath);
        console.log('Updated Excel file saved at', filePath);
        return fileName

    } catch (error) {
        console.error('Error updating file', error);
        return fileName
    }
}


export const generateRelevantExcelJSON = async (userQuery: string) => {
    try {
        const promptResult = await Prompt.find({ _id: "1" }).lean();
        console.log("promptResult", promptResult);


        const prompter = promptResult[0]["instructions"];
        console.log("prompter", prompter);

        if (prompter) {
            const PROMPT = `You're an advanced data processing specialist with extensive experience in handling complex JSON structures and providing detailed insights.
            Your task is to take the user-provided query ${JSON.stringify(userQuery)} regarding activities grouped under different phases and enrich each activity by adding an AdditionalInsights key to every object within those phases. Here are the activities provided by the user: ${JSON.stringify(userQuery)}
            While generating the output, ensure that you maintain the original phase grouping precisely without skipping anything. For each object inside a phase, incorporate the AdditionalInsights field that consists of 2-3 insightful sentences relevant to the context and data of that activity. It's crucial to retain all existing structure and data, without omitting any information or phases in the final response.

            Please return the modified JSON object, preserving the original phase grouping and enhancing each activity with the newly added insights.`;


            const completion = await client.chat.completions.create({
                messages: [
                    { role: "system", content: "You are a helpful assistant." },
                    { role: "user", content: PROMPT }
                ],
                model: "gpt-4o-mini",
                response_format: { type: 'json_object' }
            });
            return completion;
        }
        return false;
    } catch (error) {
        console.error("Error while generating response from OpenAI", error);
        return false;
    }
};



// Function to generate the Excel sheet
export async function generateExcelSheetFile(result: any) {
    try {
        console.log("Generating Excel Sheet", JSON.stringify(result, null, 2));

        if (typeof result !== 'object' || result === null) {
            throw new TypeError("Expected result to be an object, but got " + typeof result);
        }

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Sheet1');

        // Define the header row
        const headers = [
            'Process Step',
            'Activities',
            'Type of Change Complexity (do not include in final plan generated for user)',
            'Owner',
            'Target Audience',
            'Engagement & Communication Medium',
            'Relevance',
            'Tools',
            'Timeframe',
            'Additional Insights (for this column AI should be trained to add a 2-3 sentence note to shed deeper insight into the given activity)'
        ];
        worksheet.addRow(headers);

        // Variable to track the last written Process Step
        let lastProcessStep = '';

        // Iterate over the phases in the result object
        Object.keys(result).forEach((phaseName) => {
            const phase = result[phaseName];
        
            // Check if phase is an array
            if (!Array.isArray(phase)) {
                throw new TypeError(`Expected phase for "${phaseName}" to be an array, but got ${typeof phase}`);
            }
        
            phase.forEach((step: any) => {
                // Check if step is an object and has the expected structure
                if (typeof step !== 'object' || step === null) {
                    throw new TypeError("Expected step to be an object, but got " + typeof step);
                }
                console.log("step", step);
        
                // Extract values from step
                const processStep = step['Process Step'] || '';
                const activities = step['Activities'] || '';
                const complexities = (step['Type of Change Complexity'] || []).join(", ");
                const owner = step['Owner'] || '';
                const audience = step['Target Audience'] || '';
                const medium = step['Engagement&Communication Medium'] || '';
                const relevance = step['Relevance'] || '';
                const tools = step['Tool'] || '';
                const timeframe = step['Timeframe'] || '';
                const insights = step['AdditionalInsights'] || '';
        
                // Only write Process Step if it's different from the last one
                const processStepToWrite = processStep !== lastProcessStep ? processStep : '';

                // Add the row to the worksheet
                worksheet.addRow([
                    processStepToWrite,
                    activities,
                    complexities,
                    owner,
                    audience,
                    medium,
                    relevance,
                    tools,
                    timeframe,
                    insights
                ]);

                // Update the last written Process Step
                lastProcessStep = processStep;
            });
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
            to: `J${worksheet.rowCount}` // Adjust this range according to your data
        };

        // Adjust column widths based on content
        if (worksheet.columns) {
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
        }

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



export const mergeMissingDataAndGenerateExl = async (mergedResponse: any) => {
    try {
        const jsonForExtrendedExcel: any = await generateRelevantExcelJSON(mergedResponse);

        if (jsonForExtrendedExcel) {
            let aiResponse = jsonForExtrendedExcel?.choices[0]?.message?.content;
            console.log("AI Response 3:", aiResponse);

            let aiResponseExtendedExcel;
            if (aiResponse) {
                // Remove backticks and other potential problematic characters
                aiResponse = aiResponse.replace(/```json|```/g, '').trim();
                console.log("Sanitized AI Response:", aiResponse, typeof aiResponse); // Log sanitized response
                aiResponseExtendedExcel = JSON.parse(aiResponse);
                console.log("---------------aiResponse---------", typeof aiResponseExtendedExcel)
                console.log("JSON Stringgify", JSON.stringify(aiResponseExtendedExcel))

                // Generate Excel file from AI response
                const filePath = await generateExcelSheetFile(aiResponseExtendedExcel)
                const fileName = path.basename(filePath);
                return { fileName, filePath }
            }
        }
        return { fileName: "", filePath: "" }

    } catch (error) {
        console.log("error while merging missing data", error)
        return { fileName: "", filePath: "" }
    }
}

// export const generateRelevantExcelJSON = async () => {
//     try {
//         const PROMPT = `
//             User Query: Here is the json data : ${processSteps}.
//             Prompt Details:
//             Response Format:
//             Please respond with a JSON object that matches the following structure: ${JSON.stringify(processSteps)}. Ensure that:
//             1. All fields are filled and no values are empty.
//             2. Must  fill this  in the json object"Additional Insights"
            
//             Your response should be a well-formed JSON object that adheres to the structure outlined in ${JSON.stringify(processSteps)}.
//             `;

//         const completion = await client.chat.completions.create({
//             messages: [
//                 { role: "system", content: "You are a helpful assistant." },
//                 { role: "user", content: PROMPT }
//             ],
//             model: "gpt-4o-mini",
//             response_format: { type: 'json_object' }
//         });
//         console.log("Recommendations results:", JSON.stringify(completion));
//         return completion;

//         return false;
//     } catch (error) {
//         console.error("Error while generating response from OpenAI", error);
//         return false;
//     }
// };

// export const mergeMissingDataAndGenerateExl = async (mergedResponse: any) => {
//     try {
//         const jsonForExtrendedExcel: any = await generateRelevantExcelJSON();

//         if (jsonForExtrendedExcel) {
//             let aiResponse = jsonForExtrendedExcel?.choices[0]?.message?.content;
//             console.log("AI Response 3:", aiResponse);

//             let aiResponseExtendedExcel;
//             if (aiResponse) {
//                 // Remove backticks and other potential problematic characters
//                 aiResponse = aiResponse.replace(/```json|```/g, '').trim();
//                 console.log("Sanitized AI Response:", aiResponse, typeof aiResponse); // Log sanitized response
//                 aiResponseExtendedExcel = JSON.parse(aiResponse);
//                 console.log("---------------aiResponse---------", typeof aiResponseExtendedExcel)

//                 // Generate Excel file from AI response
//                 const filePath = await generateExcelSheet(aiResponseExtendedExcel)
//                 const fileName = path.basename(filePath);
//                 return { fileName, filePath }
//             }
//         }
//         return { fileName: "", filePath: "" }

//     } catch (error) {
//         console.log("error while merging missing data", error)
//         return { fileName: "", filePath: "" }
//     }
// }