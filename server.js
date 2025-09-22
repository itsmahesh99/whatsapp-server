const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
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
    
    // Check if origin exactly matches one of our allowed origins
    if (corsOrigins.indexOf(origin) !== -1) {
      console.log('✅ Origin allowed (exact match):', origin);
      return callback(null, true);
    }
    
    // Check for seetech.energenie.io with any path
    if (origin.startsWith('https://seetech.energenie.io')) {
      console.log('✅ Origin allowed (seetech wildcard match):', origin);
      return callback(null, true);
    }
    
    // Check for formserver.energenie.io with any path
    if (origin.startsWith('https://formserver.energenie.io')) {
      console.log('✅ Origin allowed (formserver wildcard match):', origin);
      return callback(null, true);
    }
    
    // Check for localhost variations
    if (origin.includes('localhost')) {
      console.log('✅ Origin allowed (localhost):', origin);
      return callback(null, true);
    }
    
    console.log('❌ Origin blocked:', origin);
    console.log('📋 Allowed origins:', corsOrigins);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  optionsSuccessStatus: 200
}));

console.log('🔧 CORS configured to allow all origins (debug mode)');
console.log('📋 Intended origins:', corsOrigins);
app.use(express.json());

// Configure multer for file uploads
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
    files: 10 // Max 10 files per request
  },
  fileFilter: function (req, file, cb) {
    // Allow specific file types for WhatsApp
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'video/mp4', 'video/avi', 'video/mov', 'video/wmv',
      'application/pdf',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'audio/mp3', 'audio/wav', 'audio/ogg'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not supported`), false);
    }
  }
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
    
    // Start session health monitoring
    startSessionMonitor();
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

// Session monitoring to detect and handle session issues proactively
let sessionMonitorInterval;
const startSessionMonitor = () => {
  // Clear any existing monitor
  if (sessionMonitorInterval) {
    clearInterval(sessionMonitorInterval);
  }
  
  console.log('🔍 Starting session health monitor...');
  
  sessionMonitorInterval = setInterval(async () => {
    try {
      if (!client || !isClientReady) {
        console.log('⚠️ Monitor: Client not ready');
        return;
      }
      
      const healthy = await isSessionHealthy();
      if (!healthy) {
        console.log('❌ Monitor: Session unhealthy detected');
        isClientReady = false;
        
        // Attempt to reinitialize
        console.log('🔄 Monitor: Attempting session recovery...');
        try {
          await client.destroy();
        } catch (e) {
          console.log('⚠️ Monitor: Error destroying client:', e.message);
        }
        
        setTimeout(() => {
          initializeWhatsApp();
        }, 3000);
      } else {
        console.log('✅ Monitor: Session healthy');
      }
    } catch (error) {
      console.log('❌ Monitor error:', error.message);
    }
  }, 30000); // Check every 30 seconds
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

// Function to check if WhatsApp session is healthy
const isSessionHealthy = async () => {
  try {
    if (!client) {
      console.log('❌ Client not initialized');
      return false;
    }

    const state = await client.getState();
    console.log('🔍 Session state:', state);
    
    if (state !== 'CONNECTED') {
      console.log('❌ Session not connected, state:', state);
      return false;
    }

    // Try to get client info as a health check
    const clientInfo = await client.info;
    console.log('✅ Session healthy, client info available');
    return true;
  } catch (error) {
    console.log('❌ Session health check failed:', error.message);
    return false;
  }
};

// Function to wait for session to be ready with retry
const waitForSession = async (maxRetries = 3, delay = 2000) => {
  for (let i = 0; i < maxRetries; i++) {
    console.log(`🔄 Checking session health (attempt ${i + 1}/${maxRetries})`);
    
    if (await isSessionHealthy()) {
      console.log('✅ Session is ready');
      return true;
    }
    
    if (i < maxRetries - 1) {
      console.log(`⏳ Waiting ${delay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  console.log('❌ Session not ready after all retries');
  return false;
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
  
  return processed; // Return the processed template
};

// API Routes

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.version
  });
});

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

    // Check session health before sending
    if (!(await waitForSession())) {
      return res.status(500).json({
        success: false,
        message: 'WhatsApp session is not healthy. Please try again.'
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

    const { contacts, template, url } = req.body;
    
    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Contacts array is required'
      });
    }

    if (!template && !url) {
      return res.status(400).json({
        success: false,
        message: 'Message template or URL is required'
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
        
        let processedMessage = '';
        
        if (template) {
          processedMessage = processMessageTemplate(template, contact);
        }
        
        if (url) {
          if (processedMessage) {
            processedMessage += `\n\n🔗 ${url}`;
          } else {
            processedMessage = `🔗 ${url}`;
          }
        }

        // Check if number exists on WhatsApp with retry logic
        let numberId;
        let maxRetries = 3;
        
        for (let retry = 0; retry < maxRetries; retry++) {
          try {
            // Wait for session to be ready before attempting operations
            if (!(await waitForSession())) {
              throw new Error('Session not ready after health check');
            }
            
            console.log(`🔍 Checking if ${chatId} is registered on WhatsApp (attempt ${retry + 1}/${maxRetries})...`);
            numberId = await client.getNumberId(chatId);
            break; // Success, exit retry loop
            
          } catch (error) {
            console.error(`❌ Error checking number ${chatId} (attempt ${retry + 1}):`, error.message);
            
            // If session is closed or page closed, try to reinitialize on last retry
            if ((error.message.includes('Session closed') || error.message.includes('page has been closed')) && retry === maxRetries - 1) {
              console.log('🔄 Final attempt: reinitializing WhatsApp client...');
              try {
                initializeWhatsApp();
                await new Promise(resolve => setTimeout(resolve, 5000)); // Wait longer for init
                
                if (await waitForSession()) {
                  numberId = await client.getNumberId(chatId);
                  break;
                }
              } catch (retryError) {
                console.error(`❌ Final retry failed:`, retryError.message);
              }
            }
            
            // If not the last retry, wait before trying again
            if (retry < maxRetries - 1) {
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }
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

        // Send message with error handling and session validation
        let sendSuccess = false;
        for (let sendRetry = 0; sendRetry < 2; sendRetry++) {
          try {
            // Ensure session is healthy before sending
            if (!(await waitForSession())) {
              throw new Error('Session not ready for sending message');
            }
            
            console.log(`📤 Sending message to ${contact.name || 'Unknown'} at ${chatId} (attempt ${sendRetry + 1}/2)`);
            await client.sendMessage(chatId, processedMessage);
            
            results.sent++;
            results.details.push({
              contact: contact.name || 'Unknown',
              mobile: contact.mobile,
              status: 'sent',
              reason: 'Success'
            });

            console.log(`✅ Message sent to ${contact.name || 'Unknown'} (${results.sent}/${contacts.length})`);
            sendSuccess = true;
            break;
            
          } catch (sendError) {
            console.error(`❌ Failed to send message to ${contact.name || 'Unknown'} (attempt ${sendRetry + 1}):`, sendError.message);
            
            // If session is closed and it's the first retry, wait and try again
            if ((sendError.message.includes('Session closed') || sendError.message.includes('page has been closed')) && sendRetry === 0) {
              console.log('🔄 Session issue detected, waiting before retry...');
              await new Promise(resolve => setTimeout(resolve, 3000));
            } else {
              // Final failure
              results.failed++;
              results.details.push({
                contact: contact.name || 'Unknown',
                mobile: contact.mobile,
                status: 'failed',
                reason: 'Send error: ' + sendError.message
              });
              break;
            }
          }
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

// Send multimedia messages to multiple contacts (bulk messaging with attachments)
app.post('/api/whatsapp/send-bulk-multimedia', upload.any(), async (req, res) => {
  try {
    console.log('📤 Multimedia bulk send request received');
    
    if (!isClientReady) {
      console.log('⚠️ Client not ready at start of multimedia send. Attempting recovery...');
      if (!(await waitForSession(5, 2000))) {
        console.log('🔄 Session still not ready. Reinitializing WhatsApp client...');
        try { initializeWhatsApp(); } catch (e) { console.warn('⚠️ Error calling initializeWhatsApp:', e.message); }
        await new Promise(resolve => setTimeout(resolve, 5000));
        if (!(await waitForSession(5, 2000))) {
          return res.status(400).json({
            success: false,
            message: 'WhatsApp client is not ready. Please initialize connection first.'
          });
        }
      }
    }

    // Parse the data from FormData
    const data = JSON.parse(req.body.data);
    const { contacts, template, url } = data;
    const attachments = req.files || [];
    
    console.log(`📋 Processing ${contacts.length} contacts with ${attachments.length} attachments`);
    
    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Contacts array is required'
      });
    }

    if (!template && attachments.length === 0 && !url) {
      return res.status(400).json({
        success: false,
        message: 'Message template, attachments, or URL is required'
      });
    }

    const results = {
      total: contacts.length,
      sent: 0,
      failed: 0,
      details: []
    };

    // Send messages with delay to avoid rate limiting
    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      
      try {
        console.log(`Processing multimedia contact ${i + 1}/${contacts.length}: ${contact.name || 'Unknown'} - ${contact.mobile}`);
        
        const chatId = formatPhoneNumber(contact.mobile);
        
        if (!chatId) {
          console.error(`❌ Invalid phone number for ${contact.name}: ${contact.mobile}`);
          results.failed++;
          results.details.push({
            contact: contact.name || 'Unknown',
            phone: contact.mobile,
            status: 'failed',
            reason: 'Invalid phone number format'
          });
          continue;
        }

        // Ensure session is healthy before proceeding
        if (!(await waitForSession())) {
          console.warn('⚠️ Session not ready for multimedia send');
          results.failed++;
          results.details.push({
            contact: contact.name || 'Unknown',
            phone: contact.mobile,
            status: 'failed',
            reason: 'WhatsApp session not ready'
          });
          continue;
        }

        // Check if number exists on WhatsApp with simple retry logic
        let numberId = null;
        for (let retry = 0; retry < 3; retry++) {
          try {
            numberId = await client.getNumberId(chatId);
            break;
          } catch (e) {
            console.warn(`⚠️ getNumberId failed (attempt ${retry + 1}/3):`, e.message);
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }

        if (!numberId) {
          console.warn(`⚠️ Number not on WhatsApp: ${chatId}`);
          results.failed++;
          results.details.push({
            contact: contact.name || 'Unknown',
            phone: contact.mobile,
            status: 'failed',
            reason: 'Number not registered on WhatsApp'
          });
          continue;
        }

        // Prepare processed message (optional)
        let processedMessage = '';
        if (template) {
          processedMessage = processMessageTemplate(template, contact);
        }
        if (url) {
          processedMessage = processedMessage
            ? `${processedMessage}\n\n🔗 ${url}`
            : `🔗 ${url}`;
        }

        // Send text first (if any)
        if (processedMessage) {
          if (!(await waitForSession())) {
            throw new Error('Session lost before sending text');
          }
          await client.sendMessage(chatId, processedMessage);
          console.log(`✅ Text message sent to ${contact.name}`);
          // Short delay to respect rate limits
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Send attachments (if any)
        for (let j = 0; j < attachments.length; j++) {
          if (!(await waitForSession())) {
            throw new Error('Session lost before sending attachment');
          }
          const attachment = attachments[j];

          // Multer v2 may not include attachment.path; construct robustly
          const resolvedFilePath = attachment.path
            || (attachment.destination && attachment.filename
                  ? path.join(attachment.destination, attachment.filename)
                  : path.join(uploadDir, attachment.filename || ''));

          if (!resolvedFilePath || !fs.existsSync(resolvedFilePath)) {
            console.error('❌ Attachment file not found or path unresolved', {
              hasPath: !!attachment.path,
              destination: attachment.destination,
              filename: attachment.filename,
              originalname: attachment.originalname,
              size: attachment.size
            });
            throw new Error('Attachment file not found on server');
          }

          const media = MessageMedia.fromFilePath(resolvedFilePath);
          if (attachment.originalname) {
            media.filename = attachment.originalname; // keep original name for recipient
          }

          await client.sendMessage(chatId, media);
          console.log(`✅ Attachment ${j + 1} sent to ${contact.name}: ${attachment.originalname || attachment.filename}`);
          // Small delay between attachments
          await new Promise(resolve => setTimeout(resolve, 600));
        }

        results.sent++;
        results.details.push({
          contact: contact.name || 'Unknown',
          phone: contact.mobile,
          status: 'sent',
          attachments: attachments.length,
          hasText: !!template,
          hasUrl: !!url
        });

        // Delay between contacts to avoid rate limiting
        if (i < contacts.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2500));
        }

      } catch (error) {
        console.error(`❌ Failed to send multimedia message to ${contact.name}:`, error.message);
        results.failed++;
        results.details.push({
          contact: contact.name || 'Unknown',
          phone: contact.mobile,
          status: 'failed',
          reason: error.message
        });
      }
    }

    // Clean up uploaded files
    try {
      for (const attachment of attachments) {
        const cleanupPath = attachment.path
          || (attachment.destination && attachment.filename
                ? path.join(attachment.destination, attachment.filename)
                : path.join(uploadDir, attachment.filename || ''));
        if (cleanupPath && fs.existsSync(cleanupPath)) {
          fs.unlinkSync(cleanupPath);
          console.log(`🗑️ Cleaned up file: ${attachment.originalname || attachment.filename}`);
        }
      }
    } catch (cleanupError) {
      console.warn('⚠️ Error cleaning up files:', cleanupError.message);
    }

    console.log(`📊 Multimedia bulk send complete: ${results.sent} sent, ${results.failed} failed`);
    
    res.status(results.failed > 0 ? 207 : 200).json({
      success: results.failed === 0,
      message: `Sent: ${results.sent}, Failed: ${results.failed}`,
      results: results,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in multimedia bulk messaging:', error);
    
    // Clean up uploaded files on error
    if (req.files) {
      for (const file of req.files) {
        try {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (cleanupError) {
          console.warn('⚠️ Error cleaning up file on error:', cleanupError.message);
        }
      }
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to send multimedia messages: ' + error.message,
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