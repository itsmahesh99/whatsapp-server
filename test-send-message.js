// Direct test of WhatsApp messaging API
const axios = require('axios');

async function testSendMessage() {
  try {
    console.log('🧪 Testing WhatsApp Message Sending...');
    console.log('=' * 50);

    // First check if WhatsApp is connected
    console.log('\n1️⃣ Checking WhatsApp connection status...');
    const statusResponse = await axios.get('http://localhost:3001/api/whatsapp/status');
    console.log('📊 Status:', statusResponse.data);

    if (statusResponse.data.status !== 'ready' && statusResponse.data.status !== 'connected') {
      console.log('❌ WhatsApp not connected. Please scan QR code first.');
      console.log('🔗 Get QR: http://localhost:3001/api/whatsapp/qr');
      return;
    }

    // Test sending message
    console.log('\n2️⃣ Sending test message...');
    const messageData = {
      contact: {
        name: 'Test User',
        mobile: '75209'  // Will be formatted to +91 75209
      },
      template: 'TEST'
    };

    console.log('📤 Message payload:', JSON.stringify(messageData, null, 2));

    const messageResponse = await axios.post(
      'http://localhost:3001/api/whatsapp/send-single',
      messageData,
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Message sent successfully!');
    console.log('📋 Response:', messageResponse.data);

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    
    if (error.response?.status === 400) {
      console.log('🔍 This might be a WhatsApp connection issue');
    } else if (error.response?.status === 500) {
      console.log('🔍 This might be a server error');
    }
  }
}

// Wait a moment for server to be ready, then test
setTimeout(() => {
  testSendMessage();
}, 5000);

console.log('⏳ Waiting 5 seconds for WhatsApp server to be ready...');