import { Request, Response, NextFunction } from "express";
import UserPlan from "../modals/plans.modal";


export const fetchAllPlansOfUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const limit = parseInt(req?.body?.limit, 10) || 10;
        const page = parseInt(req?.body?.page, 10) || 1;
        const email = req?.body?.email;
        const [plans, totalCount] = await Promise.all([
            UserPlan.find({ email: email })
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .exec(),
            UserPlan.countDocuments().exec()
        ]);
        return res.status(200).json({
            status: true,
            plans,
            totalPage: Math.ceil(totalCount / limit),
        });

    } catch (error) {
        console.error('Error fetching files from database:', error);
        return res.status(500).json({ status: false, message: 'Something went wrong! Please try again' });
    }
}


export const searchPlansOfUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const limit = parseInt(req?.body?.limit, 10) || 10;
        const page = parseInt(req?.body?.page, 10) || 1;
        const email = req?.body?.email;
        const searchTerm = req?.body?.searchTerm?.toLowerCase() || ''; // To handle global search

        const hasProjectStarted = searchTerm === 'yes' ? true : searchTerm === 'no' ? false : null;

        // Create the search conditions for global search
        const searchConditions = {
            $or: [
                { _id: { $regex: searchTerm, $options: 'i' } },
                { planName: { $regex: searchTerm, $options: 'i' } },
                { changeType: { $regex: searchTerm, $options: 'i' } },
                { projectPhase: { $regex: searchTerm, $options: 'i' } },
                { potentialJobLoses: { $regex: searchTerm, $options: 'i' } },
                { employeeImpact: { $regex: searchTerm, $options: 'i' } },
                { filePath: { $regex: searchTerm, $options: 'i' } },
                { email: { $regex: searchTerm, $options: 'i' } },
                ...(hasProjectStarted !== null ? [{ hasProjectStarted }] : [])
            ]
        };

        const [plans, totalCount] = await Promise.all([
            UserPlan.find({
                email: email,
                ...searchConditions,
            })
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .exec(),
            UserPlan.countDocuments({
                email: email,
                ...searchConditions,
            }).exec()
        ]);

        return res.status(200).json({
            status: true,
            plans,
            totalPage: Math.ceil(totalCount / limit),
        });

    } catch (error) {
        console.error('Error fetching plans from database:', error);
        return res.status(500).json({ status: false, message: 'Something went wrong! Please try again' });
    }
};

