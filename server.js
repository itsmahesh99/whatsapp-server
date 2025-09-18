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
    'https://formserver.energenie.io'
  ];

app.use(cors({
  origin: corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// WhatsApp client
let client = null;
let isClientReady = false;
let qrCodeData = null;

// Initialize WhatsApp client
const initializeWhatsApp = () => {
  if (client) {
    client.destroy();
  }

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

  // Event handlers
  client.on('qr', async (qr) => {
    console.log('QR Code generated');
    try {
      qrCodeData = await qrcode.toDataURL(qr);
      console.log('QR Code ready for scanning');
    } catch (error) {
      console.error('Error generating QR code:', error);
    }
  });

  client.on('ready', () => {
    console.log('WhatsApp client is ready!');
    isClientReady = true;
    qrCodeData = null;
  });

  client.on('authenticated', () => {
    console.log('WhatsApp client authenticated');
  });

  client.on('auth_failure', (msg) => {
    console.error('Authentication failed:', msg);
    isClientReady = false;
  });

  client.on('disconnected', (reason) => {
    console.log('WhatsApp client disconnected:', reason);
    isClientReady = false;
    qrCodeData = null;
    
    // Retry initialization after disconnect
    setTimeout(() => {
      console.log('Attempting to reconnect WhatsApp...');
      initializeWhatsApp();
    }, 5000);
  });

  client.on('message_create', (message) => {
    // Log incoming messages (optional)
    if (message.fromMe) return;
    console.log('Message received:', message.body);
  });

  // Initialize the client with error handling
  try {
    client.initialize();
  } catch (error) {
    console.error('Error initializing WhatsApp client:', error);
    // Retry after a delay
    setTimeout(() => {
      console.log('Retrying WhatsApp initialization...');
      initializeWhatsApp();
    }, 10000);
  }
};

// Utility function to format phone number
const formatPhoneNumber = (mobile) => {
  // Remove all non-digit characters
  let cleaned = mobile.replace(/\D/g, '');
  
  // Add country code if not present (assuming India +91)
  if (cleaned.length === 10) {
    cleaned = '91' + cleaned;
  } else if (cleaned.startsWith('0')) {
    cleaned = '91' + cleaned.substring(1);
  }
  
  return cleaned + '@c.us';
};

// Utility function to replace template placeholders
const processMessageTemplate = (template, contact) => {
  return template
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
  let status = 'disconnected';
  
  if (qrCodeData) {
    status = 'qr-ready';
  } else if (isClientReady) {
    status = 'ready';
  } else if (client && client.pupPage) {
    status = 'connecting';
  }

  res.json({
    status,
    qrCode: qrCodeData,
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
      contact: contact.name,
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
        const chatId = formatPhoneNumber(contact.mobile);
        const processedMessage = processMessageTemplate(template, contact);

        // Check if number exists on WhatsApp
        const numberId = await client.getNumberId(chatId);
        if (!numberId) {
          results.failed++;
          results.details.push({
            contact: contact.name,
            mobile: contact.mobile,
            status: 'failed',
            reason: 'Number not registered on WhatsApp'
          });
          continue;
        }

        // Send message
        await client.sendMessage(chatId, processedMessage);
        
        results.sent++;
        results.details.push({
          contact: contact.name,
          mobile: contact.mobile,
          status: 'sent',
          reason: 'Success'
        });

        console.log(`Message sent to ${contact.name} (${i + 1}/${contacts.length})`);

        // Add delay between messages (2-3 seconds to avoid rate limiting)
        if (i < contacts.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2500));
        }

      } catch (error) {
        console.error(`Failed to send message to ${contact.name}:`, error.message);
        results.failed++;
        results.details.push({
          contact: contact.name,
          mobile: contact.mobile,
          status: 'failed',
          reason: error.message
        });
      }
    }

    console.log(`Bulk messaging completed. Sent: ${results.sent}, Failed: ${results.failed}`);

    res.json({
      success: true,
      message: `Bulk messaging completed. Sent: ${results.sent}, Failed: ${results.failed}`,
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
  if (qrCodeData) {
    res.json({
      success: true,
      qrCode: qrCodeData,
      message: 'Scan this QR code with WhatsApp on your phone'
    });
  } else {
    res.json({
      success: false,
      message: 'QR code not available. Initialize WhatsApp first.'
    });
  }
});

// Disconnect WhatsApp
app.post('/api/whatsapp/disconnect', async (req, res) => {
  try {
    if (client) {
      await client.destroy();
      client = null;
    }
    isClientReady = false;
    qrCodeData = null;

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
  res.json({
    status: 'OK',
    server: 'Energenie WhatsApp Server',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    whatsapp: {
      connected: isClientReady,
      hasQR: !!qrCodeData
    }
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
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
  
  // Auto-initialize WhatsApp on server start
  console.log('🔄 Auto-initializing WhatsApp connection...');
  setTimeout(() => {
    initializeWhatsApp();
  }, 2000);
});

// Error handling for uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  // Don't exit, just log the error
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit, just log the error
});

// Graceful shutdown
process.on('SIGINT', async () => {
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