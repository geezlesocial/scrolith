// src/controllers/auth.controller.ts
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient, Role as PrismaRole, KYCStatus as PrismaKYCStatus } from '@prisma/client'; // Import Prisma Client, Role, and KYCStatus enums

const prisma = new PrismaClient();

// JWT Secret from environment variables
const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Registration Controller
export const register = async (req: Request, res: Response) => {
  try {
    const { email, name, password, role = 'EMPLOYER' } = req.body; // Default role to EMPLOYER if not provided

    // Validate input
    if (!email || !name || !password) {
      return res.status(400).json({ error: 'Email, name, and password are required' });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    // Hash the password
    const saltRounds = 12; // Consider making this configurable
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create the user in the database using the CORRECT field name (passwordHash) and CORRECT syntax
    // CRITICAL: Wrap the data object with { data: { ... } }
    const user = await prisma.user.create({
      data: {
        email: email,
        name: name,
        passwordHash: hashedPassword,
        role: role as PrismaRole,
        isActive: true, // Use isActive instead of status
        kycStatus: 'PENDING' as PrismaKYCStatus,
      },
    });

    // Generate JWT token
    const token = (jwt as any).sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET!,
      { expiresIn: JWT_EXPIRES_IN as string }
    );

    // Send success response with user data and token
    return res.status(201).json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        // Include other necessary user fields (e.g., avatar, joinDate)
        // Exclude sensitive fields like passwordHash from the response
      },
      token,
    });
  } catch (error) {
    console.error('Registration error:', error);
    // Check if it's a Prisma validation error (e.g., unknown argument, constraint violation)
    if (error instanceof Error && ('code' in error || error.message.includes('Unknown argument') || error.message.includes('Argument'))) {
      return res.status(500).json({ error: 'Database schema error during registration. Please contact support.' });
    } else {
      return res.status(500).json({ error: 'Internal server error during registration' });
    }
  }
};

// Login Controller
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
    });

    // Check if user exists and password is correct - CRITICAL: Compare against passwordHash
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) { // <--- CORRECTED: Compare against user.passwordHash
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = (jwt as any).sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET!,
      { expiresIn: JWT_EXPIRES_IN as string }
    );

    // Send success response with user data and token
    return res.status(200).json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        // Include other necessary user fields (e.g., avatar, joinDate)
        // Exclude sensitive fields like passwordHash from the response
      },
      token,
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error during login' });
  }
};

// Get Current User Controller (requires auth middleware)
export const getCurrentUser = async (req: Request, res: Response) => {
  try {
    // This function assumes `req.user` is populated by the `authMiddleware`
    const userId = req.user?.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        // Select other necessary user fields (e.g., avatar, joinDate)
        // DO NOT select passwordHash or other sensitive fields here
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(200).json({ user });
  } catch (error) {
    console.error('Get current user error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Logout Controller (typically handled client-side by clearing the token, but can add server-side logic like blacklisting if needed)
export const logout = async (req: Request, res: Response) => {
  // Logout is typically handled client-side by clearing the stored JWT token (e.g., from localStorage or sessionStorage).
  // Server-side logic might involve blacklisting the token if using refresh tokens or implementing a token revocation list.
  // For now, just send a confirmation response.
  res.status(200).json({ message: 'Logged out successfully' });
};

