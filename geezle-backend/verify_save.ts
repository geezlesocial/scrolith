
import { authMiddleware } from './src/middleware/auth.middleware';
import { saveHeaderConfig } from './src/controllers/cmsController';
import { Request, Response } from 'express';

// Mock Express objects
const req = {
    method: 'POST',
    path: '/api/cms/header',
    headers: {},
    body: {
        logo_url: '/logo-updated.svg',
        variant: 'dark',
        navigation: []
    },
    user: {
        id: 'dev-user-id-123',
        email: 'dev@example.com',
        role: 'ADMIN'
    }
} as unknown as Request & { user?: { id: string; email: string; role: string } };

const res = {
    json: (data: any) => console.log('SUCCESS:', data),
    status: (code: number) => {
        console.log(`STATUS: ${code}`);
        return {
            json: (data: any) => console.log('ERROR JSON:', data)
        };
    }
} as unknown as Response;

async function testSave() {
    console.log('Testing header save...');
    try {
        await saveHeaderConfig(req, res);
    } catch (err) {
        console.error('Test Failed:', err);
    }
}

testSave();
