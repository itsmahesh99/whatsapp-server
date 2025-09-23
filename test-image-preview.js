const FormData = require('form-data');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

async function testImagePreview() {
  console.log('🧪 Testing Image Preview Fix...');
  
  // Test single image sending (should work with preview)
  console.log('\n1. Testing single image send...');
  
  const form = new FormData();
  
  // Add contact info
  form.append('contact', JSON.stringify({
    mobile: '918012345678', // Replace with your test number
    name: 'Test User'
  }));
  
  form.append('message', 'Test image - should show preview!');
  form.append('sendAsDocument', 'false'); // Explicitly set to false
  
  // You'll need to add a test image file here
  // form.append('media', fs.createReadStream('path/to/test-image.jpg'));
  
  try {
    const response = await fetch('http://localhost:3001/api/whatsapp/send-single-media', {
      method: 'POST',
      body: form
    });
    
    const result = await response.json();
    console.log('Single media result:', result);
  } catch (error) {
    console.error('Single media test failed:', error.message);
  }
  
  // Test bulk sending (should also work with preview now)
  console.log('\n2. Testing bulk image send...');
  
  const bulkForm = new FormData();
  
  const bulkData = {
    contacts: [
      {
        mobile: '918012345678', // Replace with your test number
        name: 'Test User'
      }
    ],
    template: 'Bulk test image for {{name}} - should show preview!'
  };
  
  bulkForm.append('data', JSON.stringify(bulkData));
  // You'll need to add a test image file here
  // bulkForm.append('attachments', fs.createReadStream('path/to/test-image.jpg'));
  
  try {
    const response = await fetch('http://localhost:3001/api/whatsapp/send-bulk-multimedia', {
      method: 'POST',
      body: bulkForm
    });
    
    const result = await response.json();
    console.log('Bulk media result:', result);
  } catch (error) {
    console.error('Bulk media test failed:', error.message);
  }
}

// Check server status first
async function checkServer() {
  try {
    const response = await fetch('http://localhost:3001/api/whatsapp/status');
    const status = await response.json();
    console.log('Server status:', status.status);
    
    if (status.status === 'ready') {
      await testImagePreview();
    } else {
      console.log('❌ Server not ready. Status:', status.status);
      console.log('Please ensure WhatsApp is connected before testing.');
    }
  } catch (error) {
    console.error('❌ Server not reachable:', error.message);
    console.log('Please start the server first: npm start');
  }
}

checkServer();