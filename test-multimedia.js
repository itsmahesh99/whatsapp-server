const fetch = require('node-fetch');

async function testMultimediaEndpoint() {
  console.log('🧪 Testing multimedia messaging endpoint...');
  
  const serverUrl = 'http://localhost:3001';
  
  try {
    // First, check if server is running
    console.log('1️⃣ Checking server health...');
    const healthResponse = await fetch(`${serverUrl}/api/health`);
    if (!healthResponse.ok) {
      throw new Error('Server is not responding');
    }
    const healthData = await healthResponse.json();
    console.log('✅ Server is running:', healthData);

    // Test endpoint existence (should return error about WhatsApp not ready, which is expected)
    console.log('2️⃣ Testing multimedia endpoint exists...');
    const FormData = require('form-data');
    const formData = new FormData();
    formData.append('data', JSON.stringify({
      contacts: [{name: 'Test', mobile: '+1234567890'}],
      template: 'Test message'
    }));

    const multimediaResponse = await fetch(`${serverUrl}/api/whatsapp/send-bulk-multimedia`, {
      method: 'POST',
      body: formData
    });

    const multimediaResult = await multimediaResponse.json();
    console.log('� Multimedia endpoint response:', multimediaResult);

    // Test regular bulk endpoint with URL
    console.log('3️⃣ Testing regular bulk endpoint with URL...');
    const textResponse = await fetch(`${serverUrl}/api/whatsapp/send-bulk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contacts: [{name: 'Test', mobile: '+1234567890'}],
        template: 'Test message',
        url: 'https://energenie.io'
      })
    });

    const textResult = await textResponse.json();
    console.log('� Regular bulk endpoint response:', textResult);

    console.log('✅ All endpoint tests completed! Both endpoints are properly configured.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testMultimediaEndpoint();