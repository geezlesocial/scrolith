-- Add the least-privilege runtime analyst role without changing existing enum values.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'ANALYST';
