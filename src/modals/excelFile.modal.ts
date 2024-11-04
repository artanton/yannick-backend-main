import { Schema, model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

// Define the interface for the ExcelFile document
export interface IExcelFile  {
    _id: string; 
    file: string; 
}

// Define the schema for the ExcelFile model
const excelFileSchema = new Schema<IExcelFile>({
    _id: {
        type: String,
        default: uuidv4, // Automatically generate a UUID
        required: true
    },
    file: {
        type: String,
        required: true
    }
}, { timestamps: true }); // Add createdAt and updatedAt fields

// Create and export the ExcelFile model
const ExcelFile = model<IExcelFile>('ExcelFile', excelFileSchema, 'excelFiles');
export default ExcelFile;
