
async function testEndpoint(url: string) {
    const fullUrl = `http://localhost:3000${url}`;
    try {
        console.log(`Testing ${fullUrl}...`);
        const response = await fetch(fullUrl, {
            headers: { 'Content-Type': 'application/json' }
        });
        console.log(`STATUS: ${response.status} ${response.statusText}`);
        const text = await response.text();
        console.log(`BODY: [${text}]`);
    } catch (error: any) {
        console.log(`ERROR: ${error.message}`);
    }
}

async function main() {
    await testEndpoint('/api/health');
}

main();
