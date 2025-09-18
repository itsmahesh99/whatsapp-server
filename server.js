const express = require('express');
const cors = require('cors');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
const corsOrigins = process.env.CORS_ORIGINS 
  ? process.env.CORS_ORIGINS.split(',')
  : [
    'http://localhost:3000',
    'https://localhost:3000',
    'http://localhost:3001',
    'https://localhost:3001',
    'https://formserver.energenie.io',
    'https://seetech.energenie.io',
    'http://seetech.energenie.io',
    'https://seetech.energenie.io/whatsapp'
  ];

app.use(cors({
  origin: function (origin, callback) {
    console.log('🌐 CORS request from origin:', origin);
    
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      console.log('✅ Allowing request with no origin');
      return callback(null, true);
    }
    
    if (corsOrigins.indexOf(origin) !== -1) {
      console.log('✅ Origin allowed:', origin);
      callback(null, true);
    } else {
      console.log('❌ Origin blocked:', origin);
      console.log('📋 Allowed origins:', corsOrigins);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  optionsSuccessStatus: 200 // For legacy browser support
}));

console.log('🔧 CORS configured with origins:', corsOrigins);
app.use(express.json());

// Additional CORS handling for preflight requests
app.use('*', (req, res, next) => {
  console.log(`📡 ${req.method} request to ${req.originalUrl} from origin: ${req.get('Origin') || 'no-origin'}`);
  
  if (req.method === 'OPTIONS') {
    console.log('🔄 Handling OPTIONS preflight request');
    res.header('Access-Control-Allow-Origin', req.get('Origin') || '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
    res.header('Access-Control-Allow-Credentials', 'true');
    return res.status(200).end();
  }
  
  next();
});

// WhatsApp client
let client = null;
let isClientReady = false;
let qrCodeData = null;
let qrCodeTimestamp = null;
let qrCodeExpiryTime = 20000; // 20 seconds (typical QR code lifespan)

// Initialize WhatsApp client
const initializeWhatsApp = () => {
  console.log('🔄 Starting WhatsApp client initialization...');
  
  if (client) {
    console.log('🧹 Destroying existing client...');
    client.destroy();
  }

  console.log('⚙️ Creating new WhatsApp client with Puppeteer config...');
  client = new Client({
    authStrategy: new LocalAuth({
      clientId: "energenie-whatsapp"
    }),
    puppeteer: {
      headless: true,
      timeout: 0, // Disable timeout
      handleSIGINT: false,
      handleSIGTERM: false,
      handleSIGHUP: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
        '--disable-extensions',
        '--disable-default-apps',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-features=site-per-process',
        '--disable-hang-monitor',
        '--disable-client-side-phishing-detection',
        '--disable-popup-blocking',
        '--disable-prompt-on-repost',
        '--disable-sync',
        '--disable-translate',
        '--metrics-recording-only',
        '--no-crash-upload',
        '--disable-logging',
        '--disable-login-animations',
        '--disable-notifications',
        '--disable-permissions-api',
        '--disable-plugins',
        '--disable-speech-api',
        '--hide-scrollbars',
        '--mute-audio',
        '--no-default-browser-check',
        '--no-service-autorun',
        '--password-store=basic',
        '--use-mock-keychain',
        '--force-color-profile=srgb',
        '--memory-pressure-off',
        '--max_old_space_size=4096',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=VizDisplayCompositor,site-per-process',
        '--flag-switches-begin',
        '--flag-switches-end',
        '--disable-crash-reporter',
        '--disable-in-process-stack-traces',
        '--disable-logging',
        '--disable-dev-tools',
        '--allow-pre-commit-input',
        '--allow-running-insecure-content',
        '--autoplay-policy=user-gesture-required',
        '--disable-component-update',
        '--disable-domain-reliability',
        '--disable-features=AudioServiceOutOfProcess,TranslateUI',
        '--disable-print-preview',
        '--disable-reading-from-canvas',
        '--disable-software-rasterizer',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-back-forward-cache',
        '--disable-backgrounding-occluded-windows',
        '--disable-features=TranslateUI,BlinkGenPropertyTrees',
        '--disable-ipc-flooding-protection',
        '--disable-renderer-backgrounding',
        '--disable-field-trial-config',
        '--no-pings',
        '--no-session-id',
        '--remote-debugging-port=9222',
        '--remote-debugging-address=0.0.0.0'
      ]
    }
  });

  console.log('✅ WhatsApp client created successfully');
  console.log('📡 Setting up event handlers...');

  // Event handlers
  client.on('qr', async (qr) => {
    console.log('📱 QR Code generated, converting to data URL...');
    try {
      qrCodeData = await qrcode.toDataURL(qr);
      qrCodeTimestamp = Date.now(); // Track when QR code was generated
      console.log('✅ QR Code ready for scanning');
      console.log('⏰ QR Code timestamp:', new Date(qrCodeTimestamp).toISOString());
      console.log('📏 QR Code data length:', qrCodeData.length);
    } catch (error) {
      console.error('❌ Error generating QR code:', error);
    }
  });

  client.on('ready', () => {
    console.log('🎉 WhatsApp client is ready!');
    console.log('🔗 Client connection established successfully');
    isClientReady = true;
    qrCodeData = null;
    qrCodeTimestamp = null; // Clear QR data when authenticated
    console.log('🗑️ QR Code data cleared - authentication successful');
  });

  client.on('authenticated', () => {
    console.log('🔐 WhatsApp client authenticated successfully');
    console.log('👤 Authentication process completed');
  });

  client.on('auth_failure', (msg) => {
    console.error('❌ Authentication failed:', msg);
    console.error('🔄 Will attempt to restart authentication process');
    isClientReady = false;
  });

  client.on('disconnected', (reason) => {
    console.log('🔌 WhatsApp client disconnected. Reason:', reason);
    console.log('📊 Connection status reset');
    isClientReady = false;
    qrCodeData = null;
    qrCodeTimestamp = null; // Clear QR data on disconnect
    
    // Retry initialization after disconnect
    console.log('⏰ Scheduling reconnection in 5 seconds...');
    setTimeout(() => {
      console.log('🔄 Attempting to reconnect WhatsApp...');
      initializeWhatsApp();
    }, 5000);
  });

  client.on('loading_screen', (percent, message) => {
    console.log('⏳ Loading WhatsApp Web:', percent + '%', message);
  });

  client.on('change_state', (state) => {
    console.log('🔄 WhatsApp state changed to:', state);
  });

  client.on('message_create', (message) => {
    // Log incoming messages (optional)
    if (message.fromMe) return;
    console.log('📨 Message received from:', message.from, 'Content:', message.body?.substring(0, 50) + '...');
  });

  // Initialize the client with error handling
  console.log('🚀 Starting WhatsApp client initialization process...');
  try {
    client.initialize();
    console.log('✅ Client.initialize() called successfully');
  } catch (error) {
    console.error('❌ Error initializing WhatsApp client:', error);
    console.error('📋 Error stack:', error.stack);
    // Retry after a delay
    console.log('⏰ Scheduling retry in 10 seconds...');
    setTimeout(() => {
      console.log('🔄 Retrying WhatsApp initialization...');
      initializeWhatsApp();
    }, 10000);
  }
};

// Utility function to check if QR code is still valid
const isQRCodeValid = () => {
  if (!qrCodeData || !qrCodeTimestamp) {
    return false;
  }
  
  const now = Date.now();
  const elapsed = now - qrCodeTimestamp;
  const isValid = elapsed < qrCodeExpiryTime;
  
  if (!isValid) {
    console.log('⏰ QR Code has expired, clearing data');
    qrCodeData = null;
    qrCodeTimestamp = null;
  }
  
  return isValid;
};

// Utility function to format phone number
const formatPhoneNumber = (mobile) => {
  console.log('📞 Formatting phone number:', mobile);
  
  // Handle empty or invalid input
  if (!mobile || typeof mobile !== 'string') {
    console.error('❌ Invalid mobile number provided:', mobile);
    return null;
  }
  
  // Remove all non-digit characters
  let cleaned = mobile.replace(/\D/g, '');
  
  // Check if we have any digits left
  if (!cleaned || cleaned.length === 0) {
    console.error('❌ No digits found in mobile number:', mobile);
    return null;
  }
  
  console.log('📞 Cleaned number:', cleaned);
  
  // Add country code if not present (assuming India +91)
  if (cleaned.length === 10) {
    cleaned = '91' + cleaned;
    console.log('📞 Added country code 91 for 10-digit number');
  } else if (cleaned.length === 11 && cleaned.startsWith('0')) {
    cleaned = '91' + cleaned.substring(1);
    console.log('📞 Replaced leading 0 with country code 91');
  } else if (cleaned.length === 12 && cleaned.startsWith('91')) {
    console.log('📞 Country code 91 already present');
  } else if (cleaned.length === 13 && cleaned.startsWith('091')) {
    cleaned = '91' + cleaned.substring(3);
    console.log('📞 Fixed 091 prefix to 91');
  } else {
    console.warn('⚠️ Unusual number length:', cleaned.length, 'for number:', cleaned);
  }
  
  // Validate final length
  if (cleaned.length !== 12) {
    console.error('❌ Invalid final number length:', cleaned.length, 'for number:', cleaned);
    return null;
  }
  
  const formatted = cleaned + '@c.us';
  console.log('📞 Final formatted number:', formatted);
  return formatted;
};

// Utility function to replace template placeholders
const processMessageTemplate = (template, contact) => {
  console.log('📝 Processing message template for contact:', contact.name || contact.mobile);
  const processed = template
    .replace(/\{\{name\}\}/g, contact.name || '')
    .replace(/\{\{company\}\}/g, contact.company || '')
    .replace(/\{\{email\}\}/g, contact.email || '')
    .replace(/\{\{mobile\}\}/g, contact.mobile || '')
    .replace(/\{\{interestedArea\}\}/g, contact.interestedArea || '')
    .replace(/\{\{contactType\}\}/g, contact.contactType || '');
};

// API Routes

// Get WhatsApp connection status
app.get('/api/whatsapp/status', (req, res) => {
  console.log('📊 Status check requested from:', req.ip);
  
  let status = 'disconnected';
  let qrInfo = null;
  
  // Check QR code validity first
  if (isQRCodeValid()) {
    status = 'qr-ready';
    const remainingTime = Math.max(0, qrCodeExpiryTime - (Date.now() - qrCodeTimestamp));
    qrInfo = {
      available: true,
      expiresIn: Math.round(remainingTime / 1000),
      generatedAt: new Date(qrCodeTimestamp).toISOString()
    };
    console.log('📱 Status: QR code is ready for scanning, expires in:', Math.round(remainingTime / 1000), 'seconds');
  } else if (isClientReady) {
    status = 'ready';
    console.log('✅ Status: WhatsApp client is ready');
  } else if (client && client.pupPage) {
    status = 'connecting';
    console.log('🔄 Status: WhatsApp client is connecting');
  } else {
    console.log('❌ Status: WhatsApp client is disconnected');
  }

  console.log('📤 Sending status response:', status);
  res.json({
    status,
    qrCode: qrInfo, // Include QR info instead of raw data
    timestamp: new Date().toISOString()
  });
});

// Initialize WhatsApp connection
app.post('/api/whatsapp/initialize', (req, res) => {
  try {
    initializeWhatsApp();
    res.json({
      success: true,
      message: 'WhatsApp initialization started',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to initialize WhatsApp: ' + error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Send message to a single contact
app.post('/api/whatsapp/send-single', async (req, res) => {
  try {
    if (!isClientReady) {
      return res.status(400).json({
        success: false,
        message: 'WhatsApp client is not ready. Please initialize connection first.'
      });
    }

    const { contact, message } = req.body;
    
    if (!contact || !contact.mobile || !message) {
      return res.status(400).json({
        success: false,
        message: 'Contact mobile number and message are required'
      });
    }

    const chatId = formatPhoneNumber(contact.mobile);
    
    // Check if phone number formatting was successful
    if (!chatId) {
      return res.status(400).json({
        success: false,
        message: `Invalid phone number format: ${contact.mobile}`
      });
    }
    
    const processedMessage = processMessageTemplate(message, contact);

    // Check if number exists on WhatsApp
    const numberId = await client.getNumberId(chatId);
    if (!numberId) {
      return res.status(400).json({
        success: false,
        message: `Number ${contact.mobile} is not registered on WhatsApp`
      });
    }

    // Send message
    await client.sendMessage(chatId, processedMessage);

    res.json({
      success: true,
      message: 'Message sent successfully',
      contact: contact.name || 'Unknown',
      mobile: contact.mobile,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message: ' + error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Send messages to multiple contacts (bulk messaging)
app.post('/api/whatsapp/send-bulk', async (req, res) => {
  try {
    if (!isClientReady) {
      return res.status(400).json({
        success: false,
        message: 'WhatsApp client is not ready. Please initialize connection first.'
      });
    }

    const { contacts, template } = req.body;
    
    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Contacts array is required'
      });
    }

    if (!template) {
      return res.status(400).json({
        success: false,
        message: 'Message template is required'
      });
    }

    const results = {
      total: contacts.length,
      sent: 0,
      failed: 0,
      details: []
    };

    console.log(`Starting bulk message send to ${contacts.length} contacts...`);

    // Send messages with delay to avoid rate limiting
    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      
      try {
        console.log(`Processing contact ${i + 1}/${contacts.length}: ${contact.name || 'Unknown'} - ${contact.mobile}`);
        
        const chatId = formatPhoneNumber(contact.mobile);
        
        // Skip if phone number formatting failed
        if (!chatId) {
          console.error(`❌ Invalid phone number for ${contact.name}: ${contact.mobile}`);
          results.failed++;
          results.details.push({
            contact: contact.name || 'Unknown',
            mobile: contact.mobile,
            status: 'failed',
            reason: 'Invalid phone number format'
          });
          continue;
        }
        
        const processedMessage = processMessageTemplate(template, contact);

        // Check if number exists on WhatsApp with retry logic
        let numberId;
        try {
          numberId = await client.getNumberId(chatId);
        } catch (error) {
          console.error(`❌ Error checking number ${chatId}:`, error.message);
          results.failed++;
          results.details.push({
            contact: contact.name || 'Unknown',
            mobile: contact.mobile,
            status: 'failed',
            reason: 'Error checking WhatsApp registration: ' + error.message
          });
          continue;
        }
        
        if (!numberId) {
          console.warn(`⚠️ Number not on WhatsApp: ${chatId}`);
          results.failed++;
          results.details.push({
            contact: contact.name || 'Unknown',
            mobile: contact.mobile,
            status: 'failed',
            reason: 'Number not registered on WhatsApp'
          });
          continue;
        }

        // Send message with error handling
        try {
          console.log(`📤 Sending message to ${contact.name || 'Unknown'} at ${chatId}`);
          await client.sendMessage(chatId, processedMessage);
          
          results.sent++;
          results.details.push({
            contact: contact.name || 'Unknown',
            mobile: contact.mobile,
            status: 'sent',
            reason: 'Success'
          });

          console.log(`✅ Message sent to ${contact.name || 'Unknown'} (${results.sent}/${contacts.length})`);
        } catch (sendError) {
          console.error(`❌ Failed to send message to ${contact.name || 'Unknown'}:`, sendError.message);
          results.failed++;
          results.details.push({
            contact: contact.name || 'Unknown',
            mobile: contact.mobile,
            status: 'failed',
            reason: 'Send error: ' + sendError.message
          });
        }

        // Add delay between messages (2-3 seconds to avoid rate limiting)
        if (i < contacts.length - 1) {
          console.log(`⏳ Waiting 2.5 seconds before next message...`);
          await new Promise(resolve => setTimeout(resolve, 2500));
        }

      } catch (error) {
        console.error(`❌ Unexpected error processing ${contact.name || 'Unknown'}:`, error.message);
        results.failed++;
        results.details.push({
          contact: contact.name || 'Unknown',
          mobile: contact.mobile,
          status: 'failed',
          reason: 'Processing error: ' + error.message
        });
      }
    }

    console.log(`🎉 Bulk messaging completed. Sent: ${results.sent}, Failed: ${results.failed}`);

    res.json({
      success: true,
      message: `Successfully sent ${results.sent} messages! Failed: ${results.failed}`,
      results,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in bulk messaging:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send bulk messages: ' + error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get QR code for scanning
app.get('/api/whatsapp/qr', (req, res) => {
  console.log('📱 QR Code requested from:', req.ip);
  
  // Check if QR code is still valid
  if (isQRCodeValid()) {
    const remainingTime = Math.max(0, qrCodeExpiryTime - (Date.now() - qrCodeTimestamp));
    console.log('✅ Returning valid QR code, expires in:', Math.round(remainingTime / 1000), 'seconds');
    
    res.json({
      success: true,
      qrCode: qrCodeData,
      message: 'Scan this QR code with WhatsApp on your phone',
      expiresIn: Math.round(remainingTime / 1000), // seconds until expiry
      generatedAt: new Date(qrCodeTimestamp).toISOString()
    });
  } else {
    console.log('❌ No valid QR code available');
    res.json({
      success: false,
      message: 'QR code not available or expired. Initialize WhatsApp or wait for new QR code.',
      timestamp: new Date().toISOString()
    });
  }
});

// Disconnect WhatsApp
app.post('/api/whatsapp/disconnect', async (req, res) => {
  console.log('🔌 Disconnect requested from:', req.ip);
  try {
    if (client) {
      console.log('🧹 Destroying WhatsApp client...');
      await client.destroy();
      client = null;
    }
    isClientReady = false;
    qrCodeData = null;
    qrCodeTimestamp = null; // Clear QR data on manual disconnect

    res.json({
      success: true,
      message: 'WhatsApp disconnected successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to disconnect WhatsApp: ' + error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  console.log('🩺 Health check requested from:', req.ip);
  
  const healthData = {
    status: 'OK',
    server: 'Energenie WhatsApp Server',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    whatsapp: {
      connected: isClientReady,
      hasQR: !!qrCodeData
    }
  };
  
  console.log('📤 Health check response:', JSON.stringify(healthData, null, 2));
  res.json(healthData);
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('❌ Server error occurred:', error);
  console.error('📋 Error stack:', error.stack);
  console.error('🌐 Request details:', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Energenie WhatsApp Server running on port ${PORT}`);
  console.log(`📱 API endpoints available at http://localhost:${PORT}/api/`);
  console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
  console.log(`⚙️ Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🕐 Server started at: ${new Date().toISOString()}`);
  console.log(`🔧 Process ID: ${process.pid}`);
  console.log(`💾 Node.js version: ${process.version}`);
  console.log(`🖥️ Platform: ${process.platform} ${process.arch}`);
  
  // Auto-initialize WhatsApp on server start
  console.log('🔄 Auto-initializing WhatsApp connection...');
  console.log('⏰ Starting initialization in 2 seconds...');
  setTimeout(() => {
    console.log('🎯 Initializing WhatsApp now...');
    initializeWhatsApp();
  }, 2000);
});

// Error handling for uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  console.error('📋 Exception stack:', error.stack);
  // Don't exit, just log the error
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  console.error('📋 Rejection details:', reason);
  // Don't exit, just log the error
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server gracefully...');
  console.log('📱 Disconnecting WhatsApp client...');
  if (client) {
    console.log('📱 Disconnecting WhatsApp...');
    try {
      await client.destroy();
    } catch (error) {
      console.error('Error destroying client:', error);
    }
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down server...');
  if (client) {
    console.log('📱 Disconnecting WhatsApp...');
    try {
      await client.destroy();
    } catch (error) {
      console.error('Error destroying client:', error);
    }
  }
  process.exit(0);
});