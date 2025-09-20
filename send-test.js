const axios = require('axios');

async function sendTestMessage() {
  console.log('📱 Sending TEST message to +91 75209...\n');
  
  try {
    // Check status first
    console.log('1️⃣ Checking WhatsApp status...');
    const statusResponse = await axios.get('http://localhost:3001/api/whatsapp/status');
    console.log('Status:', statusResponse.data.status);
    
    if (statusResponse.data.status === 'qr-ready') {
      console.log('❌ WhatsApp not connected yet. Please scan QR code.');
      console.log('🔗 QR Code: http://localhost:3001/api/whatsapp/qr');
      return;
    }
    
    // Send the message
    console.log('\n2️⃣ Sending message...');
    const messagePayload = {
      contact: {
        name: 'Test User',
        mobile: '75209'
      },
      template: 'TEST'
    };
    
    console.log('📤 Payload:', JSON.stringify(messagePayload, null, 2));
    
    const response = await axios.post(
      'http://localhost:3001/api/whatsapp/send-single',
      messagePayload,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      }
    );
    
    console.log('\n✅ SUCCESS!');
    console.log('Response:', response.data);
    
  } catch (error) {
    console.log('\n❌ ERROR:');
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Message:', error.response.data);
    } else {
      console.log('Error:', error.message);
    }
  }
}

// Wait 8 seconds for server to be ready, then send
console.log('⏳ Waiting for server to be ready...');
setTimeout(sendTestMessage, 8000);