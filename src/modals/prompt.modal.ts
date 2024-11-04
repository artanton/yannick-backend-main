import { Schema, model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export interface IPrompt {
    _id : string;
    name: string;
    // description: string;
    instructions: string;
    // starting_questions: any[];
    // file_link : string;
    // file_name : string;
}

const promptSchema = new Schema<IPrompt>({
    _id: {
        type: String,
        default: () => `prompt_${uuidv4()}`,
        required: true,
      },
    name: { type: String, required: true },
    // description: { type: String, required: true },
    instructions : {type : String, required:true},
    // starting_questions : [],
    // file_link : {type : String, required:true},
    // file_name : {type : String, required:true},
  },{ timestamps: true});


  const Prompt = model<IPrompt>('Prompt', promptSchema, 'prompts');
export default Prompt
  