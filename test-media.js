const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3001';

// Test configuration
const testContact = {
  mobile: '+919422145534', // Replace with actual test number
  name: 'Test User'
};

/**
 * Test sending media from local file
 */
async function testSendLocalMedia() {
  console.log('\n🧪 Testing: Send Local Media');
  
  try {
    // Create a simple test image file (1x1 pixel PNG)
    const testImagePath = path.join(__dirname, 'test-image.png');
    const pngData = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
      0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0x00, 0x00, 0x00,
      0x01, 0x00, 0x01, 0x5C, 0xC2, 0x8A, 0xDB, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
    ]);
    
    fs.writeFileSync(testImagePath, pngData);
    
    const formData = new FormData();
    formData.append('contact', JSON.stringify(testContact));
    formData.append('message', 'Hello {{name}}! Here is a test image.');
    formData.append('media', fs.createReadStream(testImagePath), 'test-image.png');
    formData.append('sendAsDocument', 'false');
    formData.append('isViewOnce', 'false');
    
    const response = await axios.post(`${BASE_URL}/api/whatsapp/send-single-media`, formData, {
      headers: formData.getHeaders()
    });
    
    console.log('✅ Local media sent:', response.data);
    
    // Clean up test file
    fs.unlinkSync(testImagePath);
    
  } catch (error) {
    console.error('❌ Error sending local media:', error.response?.data || error.message);
  }
}

/**
 * Test sending media from URL
 */
async function testSendMediaFromURL() {
  console.log('\n🧪 Testing: Send Media from URL');
  
  try {
    const response = await axios.post(`${BASE_URL}/api/whatsapp/send-media-url`, {
      contact: testContact,
      mediaUrl: 'https://picsum.photos/300/200',
      message: 'Hello {{name}}! Here is a random image from the internet.',
      filename: 'random-image.jpg',
      sendAsDocument: false,
      isViewOnce: false
    });
    
    console.log('✅ URL media sent:', response.data);
    
  } catch (error) {
    console.error('❌ Error sending URL media:', error.response?.data || error.message);
  }
}

/**
 * Test sending sticker
 */
async function testSendSticker() {
  console.log('\n🧪 Testing: Send Sticker');
  
  try {
    // Create a simple test image for sticker
    const testImagePath = path.join(__dirname, 'test-sticker.png');
    const pngData = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
      0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0x00, 0x00, 0x00,
      0x01, 0x00, 0x01, 0x5C, 0xC2, 0x8A, 0xDB, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
    ]);
    
    fs.writeFileSync(testImagePath, pngData);
    
    const formData = new FormData();
    formData.append('contact', JSON.stringify(testContact));
    formData.append('media', fs.createReadStream(testImagePath), 'test-sticker.png');
    formData.append('stickerName', 'Test Bot Sticker');
    formData.append('stickerAuthor', 'WhatsApp Bot');
    formData.append('stickerCategories', '🤖,🧪,✅');
    
    const response = await axios.post(`${BASE_URL}/api/whatsapp/send-sticker`, formData, {
      headers: formData.getHeaders()
    });
    
    console.log('✅ Sticker sent:', response.data);
    
    // Clean up test file
    fs.unlinkSync(testImagePath);
    
  } catch (error) {
    console.error('❌ Error sending sticker:', error.response?.data || error.message);
  }
}

/**
 * Test getting media info
 */
async function testGetMediaInfo() {
  console.log('\n🧪 Testing: Get Media Info');
  
  try {
    const response = await axios.get(`${BASE_URL}/api/whatsapp/media-info`);
    console.log('✅ Media info retrieved:');
    console.log('📋 Supported formats:', response.data.supportedFormats);
    console.log('⚙️ Media options:', Object.keys(response.data.mediaOptions));
    console.log('📏 Limits:', response.data.limits);
    
  } catch (error) {
    console.error('❌ Error getting media info:', error.response?.data || error.message);
  }
}

/**
 * Test WhatsApp status
 */
async function testWhatsAppStatus() {
  console.log('\n🧪 Testing: WhatsApp Status');
  
  try {
    const response = await axios.get(`${BASE_URL}/api/whatsapp/status`);
    console.log('✅ WhatsApp status:', response.data);
    return response.data.status === 'ready';
    
  } catch (error) {
    console.error('❌ Error getting status:', error.response?.data || error.message);
    return false;
  }
}

/**
 * Run all tests
 */
async function runTests() {
  console.log('🚀 Starting WhatsApp Media Tests');
  console.log('📱 Test contact:', testContact);
  
  // Check if WhatsApp is ready
  const isReady = await testWhatsAppStatus();
  
  if (!isReady) {
    console.log('⚠️ WhatsApp is not ready. Please scan QR code first.');
    console.log('🔗 Check status at: http://localhost:3001/api/whatsapp/status');
    return;
  }
  
  // Get media info first
  await testGetMediaInfo();
  
  // Test different media sending methods
  await testSendLocalMedia();
  await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
  
  await testSendMediaFromURL();
  await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
  
  await testSendSticker();
  
  console.log('\n✨ All tests completed!');
}

// Run tests if called directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = {
  testSendLocalMedia,
  testSendMediaFromURL,
  testSendSticker,
  testGetMediaInfo,
  testWhatsAppStatus,
  runTests
};