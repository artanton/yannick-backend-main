import { Request, Response, NextFunction } from "express";
import OpenAI from "openai";
import { OPEN_API_KEY } from "../constant/env.contant";
import Prompt from "../modals/prompt.modal";
import ExcelJS from 'exceljs';
import path from "path";
import fs from 'fs';
import headings from "../utils/heading";
import processSteps from "../utils/excelData";
import { v4 as uuidv4 } from 'uuid';
import UserPlan from "../modals/plans.modal";


const apiKey = OPEN_API_KEY;
// console.log('apiKey',apiKey);
const client = new OpenAI.OpenAI({ apiKey });

export const BotReply = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { userQuery } = req.body;
        console.log("User Query:", userQuery.answers);
        const valuesOnly = Object.values(userQuery.answers);

        const query = {
            planName: userQuery.answers.planName,
            hasProjectStarted: userQuery.answers.hasProjectStarted,
            changeType: userQuery.answers.changeType,
            projectPhase: userQuery.answers.projectPhase,
            potentialJobLoses: userQuery.answers.potentialJobLoses,
            variantImpact: userQuery.answers.variantImpact,
            employeeImpact: userQuery.answers.employeeImpact,
            email:userQuery.answers.email,
            userChangeProcess:userQuery.answers.userChangeProcess,
            groupEmpChange:userQuery.answers.groupEmpChange,

        };
        
        const existingPlan = await UserPlan.findOne(query);

        if (existingPlan) {
            console.log("Plan already exists:", existingPlan);
            return res.status(200).json({ status: true, filePath: existingPlan.filePath,message:"Plan generated successfully!",isExistingRecord: true });
        }
        

        // Generate AI reply using OpenAI
        const aiResponse = await aiReplier(JSON.stringify(valuesOnly));
        console.log('aiResponse aiReplier:', aiResponse);

        // Generate Excel file from AI response
        const filePath = await generateExcel(aiResponse);
        console.log('Excel file generated:', filePath);

        // Create the data object with the new fields
        const planData = {
            _id: `plan_${uuidv4()}`, // Generate a unique ID
            ...userQuery.answers,
            aiResponse,
            filePath,
        };

        // Store the plan data in the UserPlan schema in MongoDB
        const newPlan = new UserPlan(planData);
        await newPlan.save();

        // Send the file path back to the client
        // Send the file path back to the client
        return res.status(200).json({ status: true, filePath,message:"Plan generated successfully!",isExistingRecord: false });


    } catch (error) {
        console.error("Error while generating API reply", error);
        return res.status(500).json({ status: false, msg: "Error while sending AI reply" });
    }
};

export const aiReplier = async (userQuery: string) => {
    try {
        console.log("AI 1:", userQuery);

        const response: any = await generateAIReply(userQuery);
        console.log("AI Response 2:", response);

        let aiResponse = response?.choices[0]?.message?.content;
        console.log("AI Response 3:", aiResponse);

        if (aiResponse) {
            // Remove backticks and other potential problematic characters
            aiResponse = aiResponse.replace(/```json|```/g, '').trim();
            const aiResponsefinal = JSON.parse(aiResponse);
            console.log("AI Response parsed:", aiResponsefinal);
            return aiResponsefinal;
        }

    } catch (error) {
        console.log("Error while generating AI replies", error);
    }
};

const generateAIReply = async (userQuery: string) => {
    try {
        const promptResult: any = await Prompt.find({}).lean();
        console.log("promptResult", promptResult);


        const prompter = promptResult[1]?.["instructions"];
        console.log("prompter", prompter);

        if (prompter) {
            const PROMPT = `
            User Query: Here is the user response to the question and their respective answers: ${userQuery}.
            Prompt: ${JSON.stringify(prompter)}.
        
            Response Format: Provide an answer in JSON format using the structure below:
            {
              ai_reply: "Reply to ${userQuery} as per prompt ${JSON.stringify(prompter)} and reference this JSON structure for output: ${JSON.stringify(processSteps)}. Ensure that all the resultant json data  is filled properly and doesn't contain empty values in response; try to fill them based on your understanding, user response, or the prompt."
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
            console.log("Recommendations results:", JSON.stringify(completion));
            return completion;
        }
        return false;
    } catch (error) {
        console.error("Error while generating response from OpenAI", error);
        return false;
    }
};

const generateExcel = async (data: any) => {
    console.log("Type of data:", typeof data);
    console.log("Data:", data.ai_reply);

    // const processedData = processData(data.ai_reply)
    // console.log("Processed data:", processedData)
    const randomFileName = await generateExcelSheet(data.ai_reply);
    console.log("Processed randomFileName data:", randomFileName)

    return randomFileName;
};



// Function to generate the Excel sheet
export async function generateExcelSheet(result: any) {
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

                // Extract values from step
                const processStep = step['Process Step'] || '';
                const activities = (step['sub_tasks'] || []).map((task: any) => task['Activities']);
                const complexities = (step['sub_tasks'] || []).map((task: any) => (task['Type of Change Complexity']).join(",") ?? "");
                const owners = (step['sub_tasks'] || []).map((task: any) => task['Owner']);
                const audiences = (step['sub_tasks'] || []).map((task: any) => task['Target Audience']);
                const mediums = (step['sub_tasks'] || []).map((task: any) => task['Engagement&Communication Medium']);
                const relevances = (step['sub_tasks'] || []).map((task: any) => task['Relevance']);
                const tools = (step['sub_tasks'] || []).map((task: any) => task['Tool']); // corrected the key name to 'Tool'
                const timeframes = (step['sub_tasks'] || []).map((task: any) => task['Timeframe']);
                const insights = (step['sub_tasks'] || []).map((task: any) => task['Additional Insights']);
                console.log("activities", activities)

                // worksheet.addRow([
                //     processStep,
                //     activities,
                //     complexities,
                //     owners,
                //     audiences,
                //     mediums,
                //     relevances,
                //     tools,
                //     timeframes,
                //     insights
                // ]);
                const getMaxArrayLength = (arrays: any) => {
                    return Math.max(...arrays.map((array: any) => array.length));
                };

                // Function to create rows based on the maximum length of the arrays
                const createRows = (processStep: any, arrays: any) => {
                    const maxRows = getMaxArrayLength(arrays);
                    const rows = [];

                    for (let i = 0; i < maxRows; i++) {
                        const row = [i === 0 ? processStep : '']; // Only set processStep for the first row
                        arrays.forEach((array: any) => {
                            row.push(array[i] || ''); // Add the element or an empty string if the array is shorter
                        });
                        rows.push(row);
                    }

                    return rows;
                };

                // List of all arrays to be added to the worksheet
                const arrays = [activities, complexities, owners, audiences, mediums, relevances, tools, timeframes, insights];

                // Create rows
                const rows = createRows(processStep, arrays);

                // Add rows to the worksheet
                rows.forEach(row => {
                    worksheet.addRow(row);
                });

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
// function processData(data: any) {
//     // Initialize the result array
//     console.log("Processing", data);
//     let result: any = [];

//     // Helper function to create an array of 9 empty strings
//     const createEmptyArray = () => Array(9).fill("");

//     // Iterate through each phase in the data
//     Object.keys(data).forEach(phaseName => {
//         // Get the array of phases for the current phase name
//         let phases = data[phaseName];

//         phases.forEach((phase: any) => {
//             // Initialize the array for the current phase
//             let phaseArray = createEmptyArray();

//             // Set the Process Step in the first element of the phase array
//             phaseArray[0] = phase["Process Step"];

// Create arrays for each sub-task attribute
let activities: any = [];
let complexities: any = [];
let owners: any = [];
let targetaudience: any = [];
let mediums: any = [];
let relevances: any = [];
let tools: any = [];
let timeframes: any = [];
let insights: any = [];

//             // Iterate through each sub-task
//             phase.sub_tasks.forEach((task: any) => {
//                 // Populate the corresponding arrays, using empty strings as default values
//                 activities.push(task["Activities"] || "");
//                 complexities.push(task["Type of Change Complexity (do not include in final plan generated for user)"] || "");
//                 owners.push(task['Owner'] || "");
//                 mediums.push(task["Engagement&Communication Medium"] || "");
//                 relevances.push(task["Relevance"] || "");
//                 tools.push(task["Tool"] || "");
//                 timeframes.push(task["Timeframe"] || "");
//                 insights.push(task["Additional Insights (for this column AI should be trained to add a 2-3 sentence note to shed deeper insight into the given activity)"] || "");
//             });

//             // Add the sub-task arrays to the phase array
//             phaseArray[1] = activities;
//             phaseArray[2] = complexities;
//             phaseArray[3] = mediums;
//             phaseArray[4] = relevances;
//             phaseArray[5] = tools;
//             phaseArray[6] = timeframes;
//             phaseArray[7] = insights;

//             // Push the completed phase array to the result array
//             result.push(phaseArray);
//         });
//     });

//     return result;
// }



// Function to generate a random file name
export const generateRandomFileName = (prefix: any, extension: any) => {
    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD format
    const randomString = Math.random().toString(36).substring(2, 15);
    return `${prefix}_${date}_${randomString}.${extension}`;
};