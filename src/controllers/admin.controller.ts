import { Request, Response, NextFunction } from "express";
import Prompt from "../modals/prompt.modal";
// Ensure this path is correct
import { ObjectId } from "mongodb";

// Get all prompts
export const getPrompts = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const prompts = await Prompt.find().sort({ _id: -1 }).limit(100);
        res.json(prompts);
    } catch (error) {
        console.error("Error fetching prompts", error);
        res.status(500).json({ status: false, msg: "Error fetching prompts" });
    }
};

// Add a new prompt
export const addPrompt = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { name, instructions } = req.body;
        const newPrompt = new Prompt({ name, instructions });
        const result = await newPrompt.save();
        res.json(result);
    } catch (error) {
        console.error("Error adding prompt", error);
        res.status(500).json({ status: false, msg: "Error adding prompt" });
    }
};

// Update an existing prompt
export const updatePrompt = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { name, instructions } = req.body;
        const result = await Prompt.findByIdAndUpdate(
            id,
            { name, instructions },
            { new: true } // return the updated document
        );
        res.json(result);
    } catch (error) {
        console.error("Error updating prompt", error);
        res.status(500).json({ status: false, msg: "Error updating prompt" });
    }
};
