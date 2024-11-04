
import axios from 'axios';
import { Request, Response, NextFunction } from "express";
import Stripe from 'stripe';
const crypto = require('crypto');

const sendgrid = require('@sendgrid/mail');
const { SENDGRID_API_KEY, FRONTEND_URL } = require("../constant/env.contant");
// console.log('SENDGRID_API_KEY', SENDGRID_API_KEY)
sendgrid.setApiKey(SENDGRID_API_KEY); // Set your SendGrid API key
import { parsePhoneNumberFromString, isValidNumber } from 'libphonenumber-js';


// Auth0 Configuration
const auth0Domain = process.env.AUTH0_DOMAIN;
const auth0ClientId = process.env.AUTH0_CLIENT_ID;
const auth0ClientSecret = process.env.AUTH0_CLIENT_SECRET;
const stripeSecretKey = process.env.TEST_STRIPE_KEY;

if (!stripeSecretKey) {
    throw new Error("Stripe secret key is not defined in environment variables.");
    throw new Error("Stripe secret key is not defined in environment variables.");
}

// Initialize the Stripe client
const stripe = new Stripe(stripeSecretKey);
// Function to get Auth0 Management API Token
const getAuth0Token = async (): Promise<string> => {
    try {
        const response = await axios.post(`https://${auth0Domain}/oauth/token`, {
            client_id: auth0ClientId,
            client_secret: auth0ClientSecret,
            audience: `https://${auth0Domain}/api/v2/`,
            grant_type: 'client_credentials',

        });

        return response.data.access_token;
    } catch (error: any) {
        console.error('Error fetching Auth0 token:', error?.response?.data);
        throw new Error('Could not fetch Auth0 token');
    }
};


export const userRegistration = async (req: Request, res: Response, next: NextFunction) => {

    const { username, email, password, phoneNumber } = req.body;

    if (!username || !email || !password || !phoneNumber) {
        return res.status(200).json({ message: 'Username, email, and password are required' });
    }
    const phoneNumberParsed = parsePhoneNumberFromString(phoneNumber);
    if (!phoneNumberParsed || !isValidNumber(phoneNumberParsed.number)) {
        return res.status(400).json({ message: 'Invalid phone number' });
    }

    try {
        const token = await getAuth0Token();

        const existingUserResponse = await axios.get(`https://${auth0Domain}/api/v2/users-by-email`, {
            params: { email },
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        if (existingUserResponse.data.length > 0) {
            // If user exists, return an error message
            return res.status(409).json({ message: 'Email already exists' });
        }

        const response = await axios.post(`https://${auth0Domain}/api/v2/users`, {
            email: email,
            password: password,
            user_metadata: { phoneNumber, username },
            connection: 'Username-Password-Authentication', // Default Auth0 DB connection
            email_verified: false,
        }, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });
        console.log('userRegistration', response)
        // Obtain an Auth0 access token for the newly registered user
        const authTokenResponse = await axios.post(`https://${auth0Domain}/oauth/token`, {
            grant_type: 'password',
            username: email,
            password: password,
            audience: `https://${auth0Domain}/api/v2/`,
            client_id: auth0ClientId,
            client_secret: auth0ClientSecret,
            scope: 'openid profile email',
        });

        const { access_token } = authTokenResponse.data;
        // Create a customer in Stripe
        const stripeCustomer = await stripe.customers.create({
            email: email,
            name: username,
            phone: phoneNumber,
        });

        // Update Auth0 user with Stripe customer ID
        const finalResponse = await updateAuth0User(response.data.user_id, stripeCustomer.id, token);

        res.status(201).json({ message: 'User registered successfully', user: response.data, stripeCustomer: stripeCustomer, updateUser: finalResponse, accessToken: access_token, });
    } catch (error: any) {
        console.error('Error creating user in Auth0:', error.response.data);
        res.status(200).json({ message: 'Error registering user', error: error.response.data });

    }
}


export const userLogin = async (req: Request, res: Response, next: NextFunction) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(200).json({ message: 'Email and password are required' });
    }

    try {
        const response = await axios.post(`https://${auth0Domain}/oauth/token`, {
            grant_type: 'password',
            username: email,
            password: password,
            audience: `https://${auth0Domain}/api/v2/`,
            client_id: auth0ClientId,
            client_secret: auth0ClientSecret,
            scope: 'openid profile email',
        });

        const { access_token, id_token, expires_in } = response.data;

        res.status(200).json({
            message: 'Login successful',
            accessToken: access_token,
            idToken: id_token,
            expiresIn: expires_in,
        });
    } catch (error: any) {
        console.error('Error logging in:', error.response?.data || error.message);
        res.status(200).json({ message: 'Invalid email or password' });
    }
}


export const retrieveUserInfo = async (req: Request, res: Response, next: NextFunction) => {
    const { email } = req.query;

    if (!email) {
        return res.status(400).json({ message: 'Email is required' });
    }

    try {
        const token = await getAuth0Token();

        const response = await axios.get(`https://${auth0Domain}/api/v2/users-by-email`, {
            params: {
                email: email,
            },
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        if (response.data.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.status(200).json({ message: 'User found', user: response.data[0] });
    } catch (error: any) {
        console.error('Error retrieving user info:', error.response?.data || error.message);
        res.status(500).json({ message: 'Error retrieving user info', error: error.response?.data });
    }
}


export const updatePassword = async (req: Request, res: Response, next: NextFunction) => {
    const { email, newPassword } = req.body;

    if (!email || !newPassword) {
        return res.status(400).json({ message: 'Email and new password are required' });
    }

    try {
        const token = await getAuth0Token();

        // Get the user by email first
        const usersResponse = await axios.get(`https://${auth0Domain}/api/v2/users-by-email`, {
            params: {
                email: email,
            },
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        if (usersResponse.data.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        const userId = usersResponse.data[0].user_id;

        // Update the user's password
        await axios.patch(`https://${auth0Domain}/api/v2/users/${userId}`, {
            password: newPassword,
            connection: 'Username-Password-Authentication', // Default Auth0 DB connection
        }, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        res.status(200).json({ message: 'Password updated successfully' });
    } catch (error: any) {
        console.error('Error updating password:', error.response?.data || error.message);
        res.status(500).json({ message: 'Error updating password', error: error.response?.data });
    }
}

export const createPaymentIntent = async (req: Request, res: Response, next: NextFunction) => {
    const { amount, currency } = req.body; // Expecting amount in smallest currency unit (e.g., cents)

    try {
        // Create a Payment Intent with the specified amount and currency
        const paymentIntent = await stripe.paymentIntents.create({
            amount,
            currency,
            payment_method_types: ['card'],
        });

        // Return the client secret to the client for further processing
        res.status(200).json({ clientSecret: paymentIntent.client_secret });
    } catch (error) {
        console.error('Error creating payment intent:', error);
        res.status(500).json({ error: error });
    }
};

// Function to update Auth0 user profile
const updateAuth0User = async (userId: string, stripeCustomerId: string, token: string) => {
    try {
        console.log('updateAuth0User', userId, stripeCustomerId, token);
        await axios.patch(`https://${auth0Domain}/api/v2/users/${userId}`, {
            user_metadata: { stripeCustomerId }, // Add the stripeCustomerId to user_metadata
        }, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

    } catch (error: any) {
        console.error('Error updating Auth0 user:', error.response?.data || error.message);
        throw new Error('Could not update Auth0 user');
    }
};

// Generate and send password reset token
export const forgotPassword = async (req: Request, res: Response, next: NextFunction) => {
    const { email } = req.body;
    console.log('Forgot Password', email);

    try {
        const token = await getAuth0Token();

        console.log('Token', token);
        const response = await axios.get(`https://${auth0Domain}/api/v2/users-by-email`, {
            params: {
                email: email,
            },
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });
        console.log('userResponse', response);
        const user = response.data[0];
        if (!user) {
            return res.status(404).json({ status: false, message: "User not found" });
        }
        // Generate a reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenExpiry = Date.now() + 3600000; // 1 hour

        // Store the reset token and expiry in Auth0 user metadata
        await axios.patch(`https://${auth0Domain}/api/v2/users/${user.user_id}`, {
            user_metadata: {
                resetPasswordToken: resetToken,
                resetPasswordExpires: resetTokenExpiry,
            }
        }, {
            headers: { Authorization: `Bearer ${token}` }
        });

        // Send the reset email
        const resetUrl = `${FRONTEND_URL}/reset-password?t=${resetToken}`;
        const message = {
            to: email,
            from: 'deepanshuqa@gmail.com',
            subject: 'Password Reset Request',
            text: `You requested a password reset. Click the link below to reset your password: ${resetUrl}`,
            html: `<p>You requested a password reset. Click the link below to reset your password:</p><a href="${resetUrl}">Reset Password</a>`
        };

        await sendgrid.send(message);
        return res.status(200).json({ status: true, message: "Password reset email sent" });

    } catch (error) {
        console.error('Error sending password reset email:', error);
        return res.status(500).json({ status: false, message: "Server error" });
    }
};

export const resetPassword = async (req: Request, res: Response) => {
    const { password } = req.body;
    const { token } = req.params;  // Extract token from URL params
    console.log(`Reset password request with token: ${token}, new password: ${password}`);

    try {
        const tokenMain = await getAuth0Token();

        // Log tokenMain to ensure the token is correct
        console.log('Auth0 management token:', tokenMain);

        // Find user by the reset token in Auth0 metadata
        const response = await axios.get(`https://${auth0Domain}/api/v2/users`, {
            params: {
                q: `user_metadata.resetPasswordToken:"${token}"`,
                search_engine: 'v3',
            },
            headers: {
                Authorization: `Bearer ${tokenMain}`,
            },
        });

        console.log('User lookup response:', response.data);

        const user = response.data[0]; // Ensure at least one user is found
        if (!user) {
            console.error('User not found or no user associated with this token');
            return res.status(404).json({ status: false, message: 'User not found' });
        }

        if (user.user_metadata.resetPasswordExpires < Date.now()) {
            return res.status(400).json({ status: false, message: 'Reset token is invalid or has expired' });
        }

        // Update user's password in Auth0
        const resposne = await axios.patch(`https://${auth0Domain}/api/v2/users/${user.user_id}`, {
            password: password,
            connection: 'Username-Password-Authentication', // Your connection type
        }, {
            headers: { Authorization: `Bearer ${tokenMain}` },
        });

        console.log('Password successfully updated for user:', resposne.data);

        // Clear reset token and expiry from metadata
        const removeToken = await axios.patch(`https://${auth0Domain}/api/v2/users/${user.user_id}`, {
            user_metadata: {
                resetPasswordToken: null,
                resetPasswordExpires: null,
            },
        }, {
            headers: { Authorization: `Bearer ${tokenMain}` },
        });
        console.log('Password successfully RemoveToken:', removeToken.data);

        return res.status(200).json({ status: true, message: 'Password updated successfully' });
    } catch (error: any) {
        if (error.response && error.response.data) {
            if (error.response.data.message.includes('PasswordStrengthError')) {
                // Handle weak password error
                return res.status(400).json({
                    status: false,
                    message: 'The password you entered is too weak. Please choose a stronger password.',
                });
            }
            console.error('Error response data:', error.response.data);
        }

        return res.status(500).json({ status: false, message: 'Server error', error: error.response?.data });
    }
};
