import { Schema, model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export interface IPlan {
    _id: string;
    planName: string;
    hasProjectStarted: boolean;
    changeType: string;
    projectPhase: string;
    potentialJobLoses: string;
    // variantImpact: string;
    employeeImpact: string;
    aiResponse: any;
    filePath: string;
    userId: string;
    email: string;
    userChangeProcess: string;
    groupEmpChange : string;
}

const planSchema = new Schema<IPlan>({
    _id: {
        type: String,
        default: () => `plan_${uuidv4()}`,
        required: true,
    },
    planName: { type: String, required: true },
    hasProjectStarted: { type: Boolean, required: true },
    changeType: { type: String, required: true },
    projectPhase: { type: String, required: true },
    potentialJobLoses: { type: String, required: true },
    // variantImpact: { type: String, required: false },
    employeeImpact: { type: String, required: true },
    aiResponse: {},
    filePath: { type: String },
    userId: { type: String, },
    email: { type: String, required: true },
    userChangeProcess: { type: String, required: true },
    groupEmpChange: { type: String, required: true }



}, { timestamps: true });


const UserPlan = model<IPlan>('Plan', planSchema, 'plans');
export default UserPlan
