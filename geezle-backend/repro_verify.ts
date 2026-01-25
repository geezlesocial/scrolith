
async function testEndpoint(url: string) {
    const fullUrl = `http://localhost:3000${url}`;
    try {
        console.log(`Testing ${fullUrl}...`);
        const response = await fetch(fullUrl, {
            headers: {
                'Content-Type': 'application/json'
            }
        }); // Add timeout?
        console.log(`STATUS: ${response.status} ${response.statusText}`);
        const text = await response.text();
        console.log(`BODY Length: ${text.length}`);
        if (text.length < 500) console.log(`BODY: ${text}`);
    } catch (error: any) {
        console.log(`ERROR: ${error.message}`);
    }
}

async function main() {
    await new Promise(r => setTimeout(r, 5000)); // Wait for server startup
    console.log('--- Starting Tests ---');
    await testEndpoint('/api/health'); // Check health
    await testEndpoint('/api/admin/platform/settings'); // Check originally failing endpoint
}

main();
