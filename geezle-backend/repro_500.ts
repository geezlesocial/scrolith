
async function testEndpoint(url: string) {
    const fullUrl = `http://localhost:3000${url}`;
    try {
        console.log(`Testing ${fullUrl}...`);
        // Assuming no auth for health check, but typical endpoints might need it.
        // For now we just want to see if it crashes or returns 401/403 (which is expected) vs 500.
        const response = await fetch(fullUrl, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        console.log(`STATUS: ${response.status} ${response.statusText}`);
        const text = await response.text();
        try {
            console.log(JSON.parse(text));
        } catch {
            console.log(text);
        }
    } catch (error: any) {
        console.log(`ERROR: ${error.message}`);
    }
}

async function main() {
    await testEndpoint('/api/health');
    await testEndpoint('/api/cms/header'); // Should be 401 or 403 if auth works, or 500 if crash
    await testEndpoint('/api/admin/platform/settings'); // Same
}

main();
