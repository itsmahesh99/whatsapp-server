const axios = require('axios');

const BASE_URL = 'http://localhost:3001';

/**
 * Test session management features
 */

async function testStatus() {
  console.log('\n🧪 Testing: Enhanced Status Endpoint');
  try {
    const response = await axios.get(`${BASE_URL}/api/whatsapp/status`);
    console.log('✅ Status retrieved:');
    console.log('📊 Status:', response.data.status);
    console.log('🔄 Reconnect attempts:', response.data.reconnectAttempts);
    console.log('📱 Session info:', response.data.session);
    console.log('🔍 Monitor active:', response.data.monitorActive);
    return response.data;
  } catch (error) {
    console.error('❌ Error getting status:', error.response?.data || error.message);
    return null;
  }
}

async function testClearSession() {
  console.log('\n🧪 Testing: Clear Session');
  try {
    const response = await axios.post(`${BASE_URL}/api/whatsapp/clear-session`);
    console.log('✅ Session cleared:', response.data.message);
    return true;
  } catch (error) {
    console.error('❌ Error clearing session:', error.response?.data || error.message);
    return false;
  }
}

async function testDisconnect() {
  console.log('\n🧪 Testing: Enhanced Disconnect');
  try {
    const response = await axios.post(`${BASE_URL}/api/whatsapp/disconnect`);
    console.log('✅ Disconnected:', response.data.message);
    return true;
  } catch (error) {
    console.error('❌ Error disconnecting:', error.response?.data || error.message);
    return false;
  }
}

async function testInitialize() {
  console.log('\n🧪 Testing: Initialize WhatsApp');
  try {
    const response = await axios.post(`${BASE_URL}/api/whatsapp/initialize`);
    console.log('✅ Initialized:', response.data.message);
    return true;
  } catch (error) {
    console.error('❌ Error initializing:', error.response?.data || error.message);
    return false;
  }
}

async function testQRCode() {
  console.log('\n🧪 Testing: QR Code Generation');
  try {
    const response = await axios.get(`${BASE_URL}/api/whatsapp/qr`);
    if (response.data.success) {
      console.log('✅ QR Code available, expires in:', response.data.expiresIn, 'seconds');
    } else {
      console.log('ℹ️ QR Code not available:', response.data.message);
    }
    return response.data;
  } catch (error) {
    console.error('❌ Error getting QR code:', error.response?.data || error.message);
    return null;
  }
}

async function testSessionPersistence() {
  console.log('\n🧪 Testing: Session Persistence Workflow');
  
  // 1. Check initial status
  console.log('Step 1: Check initial status');
  let status = await testStatus();
  
  if (!status) {
    console.log('❌ Cannot continue - status check failed');
    return;
  }
  
  // 2. If ready, test disconnect and reconnect
  if (status.status === 'ready') {
    console.log('\\nStep 2: Testing disconnect -> reconnect cycle');
    
    await testDisconnect();
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    await testInitialize();
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    status = await testStatus();
    if (status?.status === 'ready') {
      console.log('✅ Session persistence working - reconnected without QR');
    } else if (status?.status === 'qr-ready') {
      console.log('ℹ️ New QR required - session was cleared');
      await testQRCode();
    }
  }
  
  // 3. Test clear session
  console.log('\\nStep 3: Testing session clearing');
  await testClearSession();
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  status = await testStatus();
  console.log('Post-clear status:', status?.status);
  
  // 4. Initialize fresh
  console.log('\\nStep 4: Fresh initialization');
  await testInitialize();
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  await testQRCode();
}

async function monitorStatusChanges(duration = 30000) {
  console.log(`\\n🧪 Testing: Monitor Status Changes for ${duration/1000} seconds`);
  
  const startTime = Date.now();
  let lastStatus = '';
  
  const interval = setInterval(async () => {
    const status = await testStatus();
    const currentStatus = status?.status || 'unknown';
    
    if (currentStatus !== lastStatus) {
      console.log(`🔄 Status changed: ${lastStatus} → ${currentStatus}`);
      lastStatus = currentStatus;
    }
    
    if (Date.now() - startTime >= duration) {
      clearInterval(interval);
      console.log('✅ Monitoring completed');
    }
  }, 5000);
}

/**
 * Run comprehensive session tests
 */
async function runSessionTests() {
  console.log('🚀 Starting Session Management Tests');
  console.log('=' .repeat(50));
  
  try {
    // Basic functionality tests
    await testStatus();
    await testInitialize();
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Session persistence test
    await testSessionPersistence();
    
    // Optional: Monitor for changes
    const shouldMonitor = process.argv.includes('--monitor');
    if (shouldMonitor) {
      await monitorStatusChanges();
    }
    
    console.log('\\n✨ Session management tests completed!');
    console.log('💡 Use --monitor flag to watch status changes');
    
  } catch (error) {
    console.error('❌ Test suite error:', error.message);
  }
}

// Quick status check
async function quickStatus() {
  const status = await testStatus();
  if (status) {
    console.log('\\n📋 Quick Status Summary:');
    console.log(`Status: ${status.status}`);
    console.log(`Ready: ${status.status === 'ready'}`);
    console.log(`Has Session: ${status.session?.hasSession || false}`);
    console.log(`Phone: ${status.session?.phone || 'N/A'}`);
    console.log(`Reconnect Attempts: ${status.reconnectAttempts}/${status.maxReconnectAttempts}`);
  }
}

// Export functions for individual testing
module.exports = {
  testStatus,
  testClearSession,
  testDisconnect,
  testInitialize,
  testQRCode,
  testSessionPersistence,
  monitorStatusChanges,
  runSessionTests,
  quickStatus
};

// Run tests if called directly
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--quick')) {
    quickStatus();
  } else {
    runSessionTests();
  }
}