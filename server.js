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
let sessionMonitorInterval = null;
let isShuttingDown = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
let isInitializing = false;

// Initialize WhatsApp client
const initializeWhatsApp = async () => {
  console.log('🔄 Starting WhatsApp client initialization...');
  
  // Don't initialize if shutting down
  if (isShuttingDown) {
    console.log('⚠️ Skipping initialization - server is shutting down');
    return;
  }
  
  // Prevent multiple concurrent initializations
  if (isInitializing) {
    console.log('⚠️ Initialization already in progress - skipping');
    return;
  }
  
  isInitializing = true;
  
  try {
    // Properly destroy existing client
    if (client) {
      console.log('🧹 Destroying existing client...');
      try {
        await client.destroy();
        console.log('✅ Previous client destroyed successfully');
      } catch (destroyError) {
        console.warn('⚠️ Error destroying previous client:', destroyError.message);
      }
      client = null;
      isClientReady = false;
    }

    // Reset state variables
    qrCodeData = null;
    qrCodeTimestamp = null;
    reconnectAttempts = 0;

    console.log('🚀 Creating new WhatsApp client...');
    
    // Clear any existing session monitor
    if (sessionMonitorInterval) {
      clearInterval(sessionMonitorInterval);
      sessionMonitorInterval = null;
    }

    // Create new client with optimized settings
    client = new Client({
      authStrategy: new LocalAuth({
        clientId: process.env.WHATSAPP_CLIENT_ID || 'default',
        dataPath: './whatsapp-auth'
      }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor'
        ],
        // Use Chrome executable for better media support
        executablePath: process.env.CHROME_EXECUTABLE_PATH || undefined
      },
      webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
      }
    });

  // Event handlers
  client.on('qr', (qr) => {
    console.log('📱 QR code received');
    qrCodeData = qr;
    qrCodeTimestamp = Date.now();
    console.log('💾 QR code stored with timestamp:', qrCodeTimestamp);
  });

  client.on('ready', () => {
    console.log('✅ WhatsApp client is ready!');
    isClientReady = true;
    qrCodeData = null;
    qrCodeTimestamp = null;
    reconnectAttempts = 0;
    
    // Start session monitoring
    startSessionMonitor();
  });

  client.on('authenticated', () => {
    console.log('🔐 WhatsApp client authenticated successfully');
  });

  client.on('auth_failure', (msg) => {
    console.error('❌ Authentication failed:', msg);
    isClientReady = false;
    qrCodeData = null;
    qrCodeTimestamp = null;
  });

  client.on('disconnected', async (reason) => {
    console.warn('🔌 WhatsApp client disconnected:', reason);
    isClientReady = false;
    
    // Clear session monitor
    if (sessionMonitorInterval) {
      clearInterval(sessionMonitorInterval);
      sessionMonitorInterval = null;
    }
    
    // Only attempt to reconnect if not shutting down and haven't exceeded max attempts
    if (!isShuttingDown && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      console.log(`🔄 Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
      
      // Wait before reconnecting
      setTimeout(async () => {
        try {
          await initializeWhatsApp();
        } catch (error) {
          console.error('❌ Reconnection failed:', error);
        }
      }, 5000);
    } else {
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.error('❌ Maximum reconnection attempts reached. Manual intervention required.');
        console.log('💡 Try calling /api/whatsapp/initialize to restart the connection');
      }
    }
  });

  client.on('loading_screen', (percent, message) => {
    console.log('⏳ Loading WhatsApp Web:', percent + '%', message);
  });

  client.on('change_state', (state) => {
    console.log('🔄 WhatsApp state changed to:', state);
  });

  // Official media handling using the documented API
  client.on('message_create', async (message) => {
    // Log incoming messages (optional)
    if (message.fromMe) return;
    
    console.log('📨 Message received from:', message.from);
    
    // Handle media messages using official API
    if (message.hasMedia) {
      console.log('📎 Media message detected, type:', message.type);
      try {
        const media = await message.downloadMedia();
        if (media) {
          console.log('📥 Media downloaded successfully:');
          console.log('  - MIME type:', media.mimetype);
          console.log('  - Filename:', media.filename || 'No filename');
          console.log('  - Data size:', media.data ? media.data.length : 'No data');
          
          // You can process the media here
          // For example, save it, analyze it, or forward it
          
        } else {
          console.log('⚠️ Media download failed - media may have been deleted or is no longer available');
        }
      } catch (error) {
        console.error('❌ Error downloading media:', error);
      }
    } else if (message.body) {
      console.log('💬 Text message content:', message.body.substring(0, 50) + '...');
    }
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
    setTimeout(async () => {
      console.log('🔄 Retrying WhatsApp initialization...');
      await initializeWhatsApp();
    }, 10000);
  } finally {
    isInitializing = false;
  }
} catch (initError) {
  console.error('❌ Error in initializeWhatsApp function:', initError);
  isInitializing = false;
}
};

// Session monitoring to detect and handle session issues proactively
const startSessionMonitor = () => {
  // Clear any existing monitor
  if (sessionMonitorInterval) {
    clearInterval(sessionMonitorInterval);
    sessionMonitorInterval = null;
  }
  
  console.log('🔍 Starting session monitor...');
  sessionMonitorInterval = setInterval(async () => {
    try {
      // Check if client is still ready and responsive
      if (client && isClientReady) {
        // Try to get info - this is a lightweight operation that will fail if session is invalid
        const info = await client.getState();
        
        if (info !== 'CONNECTED') {
          console.warn('⚠️ Session monitor detected non-connected state:', info);
          if (info === 'UNPAIRED' || info === 'UNPAIRED_IDLE') {
            console.warn('🔐 Device unpaired - marking as not ready');
            isClientReady = false;
            qrCodeData = null;
            qrCodeTimestamp = null;
          }
        }
      }
    } catch (error) {
      console.warn('⚠️ Session monitor error (this might indicate session issues):', error.message);
      // Don't immediately mark as not ready - wait for disconnect event
    }
  }, 30000); // Check every 30 seconds
};

// Utility functions

// Phone number formatting utility
const formatPhoneNumber = (phoneNumber) => {
  console.log('📞 Formatting phone number:', phoneNumber);
  
  if (!phoneNumber) {
    console.error('❌ No phone number provided');
    return null;
  }
  
  // Remove all non-digit characters
  const cleaned = phoneNumber.replace(/\D/g, '');
  console.log('🔢 Cleaned number:', cleaned);
  
  // Handle different number formats
  if (cleaned.length === 10) {
    // Assume it's a US number, add country code
    const formatted = '1' + cleaned + '@c.us';
    console.log('🇺🇸 US format detected, result:', formatted);
    return formatted;
  } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
    // US number with country code
    const formatted = cleaned + '@c.us';
    console.log('🇺🇸 US with country code, result:', formatted);
    return formatted;
  } else if (cleaned.length === 12) {
    // International format (e.g., 91xxxxxxxxxx for India)
    const formatted = cleaned + '@c.us';
    console.log('🌍 International format, result:', formatted);
    return formatted;
  } else if (cleaned.length > 12) {
    console.warn('⚠️ Unusually long number, might be invalid:', cleaned);
    const formatted = cleaned + '@c.us';
    console.log('📞 Long number format, result:', formatted);
    return formatted;
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

// Utility function to detect media type and suggest options
const getMediaTypeInfo = (mimetype) => {
  const mediaInfo = {
    type: 'unknown',
    canBeSticker: false,
    canBeVoice: false,
    canBeGif: false,
    canBeDocument: true,
    canBeViewOnce: false,
    suggestedOptions: []
  };

  if (mimetype.startsWith('image/')) {
    mediaInfo.type = 'image';
    mediaInfo.canBeSticker = true;
    mediaInfo.canBeViewOnce = true;
    mediaInfo.suggestedOptions = ['sendAsDocument', 'sendAsSticker', 'isViewOnce'];
  } else if (mimetype.startsWith('video/')) {
    mediaInfo.type = 'video';
    mediaInfo.canBeGif = true;
    mediaInfo.canBeViewOnce = true;
    mediaInfo.suggestedOptions = ['sendAsDocument', 'sendAsGif', 'isViewOnce'];
  } else if (mimetype.startsWith('audio/')) {
    mediaInfo.type = 'audio';
    mediaInfo.canBeVoice = true;
    mediaInfo.suggestedOptions = ['sendAsDocument', 'sendAsVoice'];
  } else {
    mediaInfo.type = 'document';
    mediaInfo.suggestedOptions = ['sendAsDocument'];
  }

  return mediaInfo;
};

// Official whatsapp-web.js media sending function (simplified and clean)
const safeSendMedia = async (chatId, media, options = {}) => {
  try {
    console.log('📤 Sending media using official whatsapp-web.js method');
    console.log('📊 Media object:', { 
      mimetype: media.mimetype, 
      filename: media.filename,
      hasData: !!media.data
    });
    
    // Use the official sendMessage method with proper options
    await client.sendMessage(chatId, media, options);
    console.log('✅ Media sent successfully');
    
  } catch (error) {
    console.error('❌ Error sending media:', error.message);
    
    // The downloadMedia method may return undefined if media is not available
    if (error.message.includes('media') && error.message.includes('undefined')) {
      throw new Error('Media is no longer available for download. It may have been deleted.');
    }
    
    throw error;
  }
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

// Get media information and supported options
app.get('/api/whatsapp/media-info', (req, res) => {
  const supportedFormats = {
    images: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    videos: ['video/mp4', 'video/avi', 'video/mov', 'video/wmv'],
    audio: ['audio/mp3', 'audio/wav', 'audio/ogg'],
    documents: [
      'application/pdf',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]
  };

  const sendingOptions = {
    caption: 'Add a caption to your media',
    sendMediaAsDocument: 'Send as document instead of preview',
    sendMediaAsSticker: 'Send image as sticker (images only)',
    sendVideoAsGif: 'Send video as GIF (videos only)',
    isViewOnce: 'Send as view once message (images and videos only)'
  };

  res.json({
    status: 'success',
    supportedFormats,
    sendingOptions,
    maxFileSize: '100MB',
    maxFilesPerRequest: 10
  });
});

// Get WhatsApp connection status
app.get('/api/whatsapp/status', (req, res) => {
  const currentTime = Date.now();
  const qrCodeAge = qrCodeTimestamp ? currentTime - qrCodeTimestamp : null;
  const qrExpired = qrCodeAge ? qrCodeAge > qrCodeExpiryTime : false;

  res.json({
    ready: isClientReady,
    hasQR: !!qrCodeData && !qrExpired,
    qrTimestamp: qrCodeTimestamp,
    qrAge: qrCodeAge,
    qrExpired: qrExpired,
    reconnectAttempts: reconnectAttempts,
    maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS,
    timestamp: currentTime
  });
});

// Get QR code for WhatsApp authentication
app.get('/api/whatsapp/qr', async (req, res) => {
  try {
    if (!qrCodeData) {
      return res.status(404).json({
        error: 'No QR code available',
        message: 'WhatsApp client may be already authenticated or not initialized',
        ready: isClientReady
      });
    }

    const currentTime = Date.now();
    const qrAge = currentTime - qrCodeTimestamp;

    if (qrAge > qrCodeExpiryTime) {
      return res.status(410).json({
        error: 'QR code expired',
        message: 'QR code is too old. Please refresh to get a new one.',
        age: qrAge,
        maxAge: qrCodeExpiryTime
      });
    }

    // Generate QR code image
    const qrCodeImage = await qrcode.toDataURL(qrCodeData);

    res.json({
      qr: qrCodeData,
      qrImage: qrCodeImage,
      timestamp: qrCodeTimestamp,
      age: qrAge,
      expiresIn: qrCodeExpiryTime - qrAge
    });
  } catch (error) {
    console.error('❌ Error generating QR code:', error);
    res.status(500).json({
      error: 'Failed to generate QR code',
      details: error.message
    });
  }
});

// Initialize WhatsApp connection
app.post('/api/whatsapp/initialize', async (req, res) => {
  try {
    if (isInitializing) {
      return res.status(409).json({
        error: 'Initialization already in progress',
        message: 'Please wait for the current initialization to complete'
      });
    }

    console.log('🔄 Manual WhatsApp initialization requested');
    await initializeWhatsApp();
    
    res.json({
      message: 'WhatsApp initialization started',
      ready: isClientReady,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('❌ Error initializing WhatsApp:', error);
    res.status(500).json({
      error: 'Failed to initialize WhatsApp',
      details: error.message
    });
  }
});

// Send a simple text message
app.post('/api/whatsapp/send-message', async (req, res) => {
  try {
    const { phoneNumber, message } = req.body;

    if (!isClientReady) {
      return res.status(503).json({
        error: 'WhatsApp client not ready',
        message: 'Please scan QR code or wait for connection'
      });
    }

    if (!phoneNumber || !message) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['phoneNumber', 'message']
      });
    }

    const chatId = formatPhoneNumber(phoneNumber);
    if (!chatId) {
      return res.status(400).json({
        error: 'Invalid phone number format',
        phoneNumber: phoneNumber
      });
    }

    console.log('📤 Sending message to:', chatId);
    await client.sendMessage(chatId, message);
    console.log('✅ Message sent successfully');

    res.json({
      success: true,
      message: 'Message sent successfully',
      chatId: chatId
    });
  } catch (error) {
    console.error('❌ Error sending message:', error);
    res.status(500).json({
      error: 'Failed to send message',
      details: error.message
    });
  }
});

// Send media files using official whatsapp-web.js methods
app.post('/api/whatsapp/send-single-media', upload.single('media'), async (req, res) => {
  try {
    const { phoneNumber, caption } = req.body;
    const mediaFile = req.file;

    if (!isClientReady) {
      return res.status(503).json({
        error: 'WhatsApp client not ready',
        message: 'Please scan QR code or wait for connection'
      });
    }

    if (!phoneNumber || !mediaFile) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['phoneNumber', 'media file']
      });
    }

    const chatId = formatPhoneNumber(phoneNumber);
    if (!chatId) {
      return res.status(400).json({
        error: 'Invalid phone number format',
        phoneNumber: phoneNumber
      });
    }

    const mediaPath = mediaFile.path;
    console.log('📤 Sending media to:', chatId);
    console.log('📎 Media file:', mediaFile.originalname, 'Type:', mediaFile.mimetype);

    // Use the official MessageMedia.fromFilePath method
    const media = MessageMedia.fromFilePath(mediaPath);
    
    // Set proper filename
    if (mediaFile.originalname) {
      media.filename = mediaFile.originalname;
    }

    // Prepare send options
    const sendOptions = {};
    if (caption) {
      sendOptions.caption = caption;
    }

    // Parse additional options from request body
    const options = req.body.options ? JSON.parse(req.body.options) : {};
    Object.assign(sendOptions, options);

    console.log('📤 Sending with options:', sendOptions);

    // Send using the simplified official method
    await safeSendMedia(chatId, media, sendOptions);

    // Clean up uploaded file
    try {
      fs.unlinkSync(mediaPath);
      console.log('🧹 Temporary file cleaned up');
    } catch (cleanupError) {
      console.warn('⚠️ Could not clean up temporary file:', cleanupError.message);
    }

    res.json({
      success: true,
      message: 'Media sent successfully',
      chatId: chatId,
      mediaType: mediaFile.mimetype,
      filename: mediaFile.originalname
    });

  } catch (error) {
    console.error('❌ Error sending media:', error);
    
    // Clean up uploaded file in case of error
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.warn('⚠️ Could not clean up temporary file after error:', cleanupError.message);
      }
    }

    res.status(500).json({
      error: 'Failed to send media',
      details: error.message
    });
  }
});

// Send media from URL using the official method
app.post('/api/whatsapp/send-media-url', async (req, res) => {
  try {
    const { phoneNumber, mediaUrl, caption, options = {} } = req.body;

    if (!isClientReady) {
      return res.status(503).json({
        error: 'WhatsApp client not ready',
        message: 'Please scan QR code or wait for connection'
      });
    }

    if (!phoneNumber || !mediaUrl) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['phoneNumber', 'mediaUrl']
      });
    }

    const chatId = formatPhoneNumber(phoneNumber);
    if (!chatId) {
      return res.status(400).json({
        error: 'Invalid phone number format',
        phoneNumber: phoneNumber
      });
    }

    console.log('📤 Sending media from URL to:', chatId);
    console.log('🌐 Media URL:', mediaUrl);

    // Use the official MessageMedia.fromUrl method
    const media = await MessageMedia.fromUrl(mediaUrl, {
      unsafeMime: true // Allow various MIME types
    });

    // Prepare send options
    const sendOptions = {};
    if (caption) {
      sendOptions.caption = caption;
    }
    Object.assign(sendOptions, options);

    console.log('📤 Sending with options:', sendOptions);

    // Send using the simplified official method
    await safeSendMedia(chatId, media, sendOptions);

    res.json({
      success: true,
      message: 'Media sent successfully from URL',
      chatId: chatId,
      mediaUrl: mediaUrl,
      mediaType: media.mimetype
    });

  } catch (error) {
    console.error('❌ Error sending media from URL:', error);
    res.status(500).json({
      error: 'Failed to send media from URL',
      details: error.message
    });
  }
});

// Bulk send messages with media support
app.post('/api/whatsapp/send-bulk-multimedia', upload.any(), async (req, res) => {
  try {
    const { contacts, message, mediaUrls } = req.body;
    const uploadedFiles = req.files || [];

    if (!isClientReady) {
      return res.status(503).json({
        error: 'WhatsApp client not ready',
        message: 'Please scan QR code or wait for connection'
      });
    }

    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({
        error: 'Invalid contacts array',
        message: 'Please provide a valid array of contacts'
      });
    }

    console.log(`📤 Starting bulk send to ${contacts.length} contacts`);
    console.log(`📎 Uploaded files: ${uploadedFiles.length}`);
    console.log(`🌐 Media URLs: ${mediaUrls ? JSON.parse(mediaUrls).length : 0}`);

    const results = [];
    const parsedMediaUrls = mediaUrls ? JSON.parse(mediaUrls) : [];
    
    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      const result = {
        contact: contact,
        success: false,
        error: null,
        sentItems: []
      };

      try {
        const chatId = formatPhoneNumber(contact.mobile);
        if (!chatId) {
          throw new Error('Invalid phone number format');
        }

        // Send text message if provided
        if (message) {
          const processedMessage = processMessageTemplate(message, contact);
          await client.sendMessage(chatId, processedMessage);
          result.sentItems.push({ type: 'text', content: processedMessage });
          console.log(`✅ Text message sent to ${contact.mobile}`);
        }

        // Send uploaded files
        for (const file of uploadedFiles) {
          try {
            const media = MessageMedia.fromFilePath(file.path);
            if (file.originalname) {
              media.filename = file.originalname;
            }
            
            await safeSendMedia(chatId, media);
            result.sentItems.push({ type: 'file', filename: file.originalname, mimetype: file.mimetype });
            console.log(`✅ File ${file.originalname} sent to ${contact.mobile}`);
          } catch (fileError) {
            console.error(`❌ Error sending file to ${contact.mobile}:`, fileError.message);
            result.sentItems.push({ type: 'file', filename: file.originalname, error: fileError.message });
          }
        }

        // Send media from URLs
        for (const mediaUrl of parsedMediaUrls) {
          try {
            const media = await MessageMedia.fromUrl(mediaUrl, { unsafeMime: true });
            await safeSendMedia(chatId, media);
            result.sentItems.push({ type: 'url', url: mediaUrl, mimetype: media.mimetype });
            console.log(`✅ Media from URL sent to ${contact.mobile}`);
          } catch (urlError) {
            console.error(`❌ Error sending media URL to ${contact.mobile}:`, urlError.message);
            result.sentItems.push({ type: 'url', url: mediaUrl, error: urlError.message });
          }
        }

        result.success = true;
        console.log(`✅ All items sent successfully to ${contact.mobile}`);

        // Add delay between sends to avoid rate limiting
        if (i < contacts.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

      } catch (error) {
        result.error = error.message;
        console.error(`❌ Error sending to ${contact.mobile}:`, error.message);
      }

      results.push(result);
    }

    // Clean up uploaded files
    for (const file of uploadedFiles) {
      try {
        fs.unlinkSync(file.path);
      } catch (cleanupError) {
        console.warn('⚠️ Could not clean up file:', file.path, cleanupError.message);
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;

    res.json({
      success: true,
      message: `Bulk send completed. ${successCount} successful, ${failureCount} failed.`,
      results: results,
      summary: {
        total: contacts.length,
        successful: successCount,
        failed: failureCount
      }
    });

  } catch (error) {
    console.error('❌ Error in bulk multimedia send:', error);

    // Clean up uploaded files in case of error
    if (req.files) {
      for (const file of req.files) {
        try {
          fs.unlinkSync(file.path);
        } catch (cleanupError) {
          console.warn('⚠️ Could not clean up file after error:', file.path);
        }
      }
    }

    res.status(500).json({
      error: 'Failed to send bulk multimedia',
      details: error.message
    });
  }
});

// Get chat information
app.get('/api/whatsapp/chat/:phoneNumber', async (req, res) => {
  try {
    const { phoneNumber } = req.params;

    if (!isClientReady) {
      return res.status(503).json({
        error: 'WhatsApp client not ready'
      });
    }

    const chatId = formatPhoneNumber(phoneNumber);
    if (!chatId) {
      return res.status(400).json({
        error: 'Invalid phone number format'
      });
    }

    const chat = await client.getChatById(chatId);
    const contact = await chat.getContact();

    res.json({
      success: true,
      chat: {
        id: chat.id._serialized,
        name: chat.name,
        isGroup: chat.isGroup,
        isMuted: chat.isMuted,
        unreadCount: chat.unreadCount
      },
      contact: {
        id: contact.id._serialized,
        name: contact.name,
        pushname: contact.pushname,
        isMe: contact.isMe,
        isUser: contact.isUser,
        isGroup: contact.isGroup,
        isWAContact: contact.isWAContact
      }
    });

  } catch (error) {
    console.error('❌ Error getting chat info:', error);
    res.status(500).json({
      error: 'Failed to get chat information',
      details: error.message
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('❌ Express error:', error);
  res.status(500).json({
    error: 'Internal server error',
    details: error.message
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`🚀 WhatsApp Server running on port ${PORT}`);
  console.log(`📱 Health check: http://localhost:${PORT}/health`);
  console.log(`📊 Media info: http://localhost:${PORT}/api/whatsapp/media-info`);
  console.log(`🔍 Status: http://localhost:${PORT}/api/whatsapp/status`);
  console.log('🔄 Initializing WhatsApp client...');
  
  // Initialize WhatsApp client
  initializeWhatsApp().catch(error => {
    console.error('❌ Failed to initialize WhatsApp client:', error);
  });
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`\n🛑 ${signal} received. Starting graceful shutdown...`);
  isShuttingDown = true;
  
  // Stop accepting new connections
  server.close(() => {
    console.log('🔌 HTTP server closed');
  });
  
  // Clear session monitor
  if (sessionMonitorInterval) {
    clearInterval(sessionMonitorInterval);
    sessionMonitorInterval = null;
    console.log('🔍 Session monitor cleared');
  }
  
  // Destroy WhatsApp client
  if (client) {
    try {
      console.log('🧹 Destroying WhatsApp client...');
      await client.destroy();
      console.log('✅ WhatsApp client destroyed');
    } catch (error) {
      console.error('❌ Error destroying WhatsApp client:', error.message);
    }
  }
  
  console.log('✅ Graceful shutdown completed');
  process.exit(0);
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  gracefulShutdown('EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('REJECTION');
});