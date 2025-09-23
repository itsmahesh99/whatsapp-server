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
        client = null;
      } catch (error) {
        console.warn('⚠️ Error destroying existing client:', error.message);
        client = null;
      }
    }

  console.log('⚙️ Creating new WhatsApp client with enhanced session management...');
  client = new Client({
    authStrategy: new LocalAuth({
      clientId: "energenie-whatsapp",
      dataPath: './.wwebjs_auth/'
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
    reconnectAttempts = 0; // Reset reconnect attempts on successful connection
    isInitializing = false; // Reset initialization flag
    console.log('🗑️ QR Code data cleared - authentication successful');
    
    // Start session health monitoring
    startSessionMonitor();
  });

  client.on('authenticated', (session) => {
    console.log('🔐 WhatsApp client authenticated successfully');
    console.log('👤 Authentication process completed');
    console.log('💾 Session data saved automatically by LocalAuth');
  });

  client.on('auth_failure', (msg) => {
    console.error('❌ Authentication failed:', msg);
    console.error('🔄 Will attempt to clear session and restart');
    isClientReady = false;
    
    // Clear potentially corrupted session
    setTimeout(async () => {
      if (!isShuttingDown) {
        console.log('🧹 Clearing corrupted session...');
        try {
          if (client && client.authStrategy && typeof client.authStrategy.logout === 'function') {
            await client.authStrategy.logout();
          }
        } catch (error) {
          console.warn('⚠️ Error during session cleanup:', error.message);
        }
        
        // Reinitialize after clearing session
        setTimeout(async () => {
          if (!isShuttingDown) {
            console.log('🔄 Reinitializing after auth failure...');
            await initializeWhatsApp();
          }
        }, 3000);
      }
    }, 2000);
  });

  client.on('disconnected', (reason) => {
    console.log('🔌 WhatsApp client disconnected. Reason:', reason);
    console.log('📊 Connection status reset');
    isClientReady = false;
    qrCodeData = null;
    qrCodeTimestamp = null;
    
    // Clear session monitor
    if (sessionMonitorInterval) {
      clearInterval(sessionMonitorInterval);
      sessionMonitorInterval = null;
    }
    
    // Handle different disconnect reasons
    if (reason === 'LOGOUT') {
      console.log('🚪 User logged out - clearing session data');
      try {
        if (client && client.authStrategy) {
          client.authStrategy.logout();
        }
      } catch (error) {
        console.warn('⚠️ Error during logout cleanup:', error.message);
      }
      reconnectAttempts = 0; // Reset on intentional logout
    } else if (!isShuttingDown) {
      // Only attempt reconnection if not shutting down and not a logout
      reconnectAttempts++;
      const delay = Math.min(5000 * reconnectAttempts, 30000); // Exponential backoff with max 30s
      
      if (reconnectAttempts <= MAX_RECONNECT_ATTEMPTS) {
        console.log(`⏰ Scheduling reconnection attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay/1000} seconds...`);
        setTimeout(async () => {
          if (!isShuttingDown) {
            console.log(`🔄 Attempting to reconnect WhatsApp... (attempt ${reconnectAttempts})`);
            await initializeWhatsApp();
          }
        }, delay);
      } else {
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
  
  console.log('🔍 Starting enhanced session health monitor...');
  
  sessionMonitorInterval = setInterval(async () => {
    try {
      // Skip monitoring if shutting down
      if (isShuttingDown) {
        return;
      }
      
      if (!client || !isClientReady) {
        console.log('⚠️ Monitor: Client not ready');
        return;
      }
      
      const healthy = await isSessionHealthy();
      if (!healthy) {
        console.log('❌ Monitor: Session unhealthy detected - attempting recovery');
        isClientReady = false;
        
        // Clear the monitor to prevent multiple recovery attempts
        if (sessionMonitorInterval) {
          clearInterval(sessionMonitorInterval);
          sessionMonitorInterval = null;
        }
        
        // Attempt graceful recovery
        console.log('🔄 Monitor: Attempting graceful session recovery...');
        try {
          // Try to destroy the client gracefully
          if (client) {
            await client.destroy();
            client = null;
          }
        } catch (e) {
          console.log('⚠️ Monitor: Error during graceful destroy:', e.message);
          client = null;
        }
        
        // Wait a moment then reinitialize
        setTimeout(async () => {
          if (!isShuttingDown) {
            console.log('🔄 Monitor: Reinitializing WhatsApp client...');
            await initializeWhatsApp();
          }
        }, 3000);
      } else {
        console.log('✅ Monitor: Session healthy');
      }
    } catch (error) {
      console.log('❌ Monitor error:', error.message);
      // If monitor itself fails, restart monitoring after a delay
      if (sessionMonitorInterval) {
        clearInterval(sessionMonitorInterval);
        sessionMonitorInterval = null;
      }
      
      setTimeout(() => {
        if (!isShuttingDown && isClientReady) {
          console.log('🔄 Restarting session monitor after error...');
          startSessionMonitor();
        }
      }, 10000);
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
    try {
      const clientInfo = await client.info;
      if (!clientInfo) {
        console.log('❌ Client info not available');
        return false;
      }
      console.log('✅ Session healthy, client info available');
      return true;
    } catch (infoError) {
      console.log('❌ Failed to get client info:', infoError.message);
      return false;
    }
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

// Utility function to safely send media with canvas error handling
const safeSendMedia = async (chatId, media, options = {}, originalFilePath = null) => {
  try {
    console.log('📤 Starting enhanced safeSendMedia with WhatsApp internal processing');
    console.log('📁 Original file path:', originalFilePath);
    
    // Method 1: Try WhatsApp's internal media processing pipeline
    if (originalFilePath && fs.existsSync(originalFilePath)) {
      try {
        console.log('🎯 Method 1: WhatsApp internal media processing');
        
        // Process media using WhatsApp's internal functions
        const processedMedia = await client.pupPage.evaluate(async (filePath) => {
          try {
            // Read file data using fetch API
            const response = await fetch(`file://${filePath}`);
            if (!response.ok) throw new Error('Could not read file');
            
            const arrayBuffer = await response.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            
            // Convert to base64
            let binary = '';
            uint8Array.forEach(byte => binary += String.fromCharCode(byte));
            const base64Data = btoa(binary);
            
            // Determine mimetype
            const extension = filePath.split('.').pop().toLowerCase();
            const mimetypeMap = {
              'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
              'png': 'image/png', 'gif': 'image/gif',
              'webp': 'image/webp', 'bmp': 'image/bmp',
              'tiff': 'image/tiff', 'svg': 'image/svg+xml'
            };
            const mimetype = mimetypeMap[extension] || 'application/octet-stream';
            
            // Create media info object for WhatsApp processing
            const mediaInfo = {
              mimetype: mimetype,
              data: base64Data,
              filename: filePath.split(/[/\\]/).pop()
            };
            
            // Use WhatsApp's internal processMediaData function if available
            if (window.WWebJS && window.WWebJS.processMediaData) {
              console.log('🔧 Using WhatsApp internal processMediaData');
              const processedData = await window.WWebJS.processMediaData(mediaInfo, {
                forceDocument: false,
                forceVoice: false,
                forceGif: false
              });
              return { success: true, data: processedData, method: 'whatsapp-internal' };
            }
            
            // Fallback: Return media info for standard processing
            return { success: true, data: mediaInfo, method: 'standard-fallback' };
            
          } catch (error) {
            console.log('❌ Internal processing error:', error.message);
            return { success: false, error: error.message };
          }
        }, originalFilePath);
        
        if (processedMedia.success) {
          console.log(`✅ WhatsApp processing succeeded using ${processedMedia.method} method`);
          
          // Create MessageMedia object from processed data
          let processedMediaObj;
          if (processedMedia.method === 'whatsapp-internal') {
            // Use processed data from WhatsApp's internal pipeline
            processedMediaObj = new MessageMedia(
              processedMedia.data.mimetype || processedMedia.data.type,
              processedMedia.data.data,
              processedMedia.data.filename
            );
          } else {
            // Use standard media object
            processedMediaObj = new MessageMedia(
              processedMedia.data.mimetype,
              processedMedia.data.data,
              processedMedia.data.filename
            );
          }
          
          await client.sendMessage(chatId, processedMediaObj, options);
          console.log('✅ Method 1 succeeded - WhatsApp internal processing worked');
          return;
        }
      } catch (error) {
        console.log('❌ Method 1 failed:', error.message);
      }
    }
    
    // Method 2: Standard media send
    console.log('🎯 Method 2: Standard media send');
    await client.sendMessage(chatId, media, options);
    console.log('✅ Method 2 succeeded - Standard send worked');
    
  } catch (error) {
    console.warn('⚠️ Standard media send failed:', error.message);
    
    // Handle canvas security errors specifically
    if (error.message.includes('Tainted canvases') || 
        error.message.includes('SecurityError') || 
        error.message.includes('toDataURL') ||
        error.message.includes('toBlob')) {
      
      console.warn('🔒 Canvas security issue detected');
      
      // For images, try different approaches before falling back to document
      if (media.mimetype && media.mimetype.startsWith('image/')) {
        console.log('🖼️ Trying alternative image sending methods...');
        
        // Method 3: Try sending without any special options (basic image)
        try {
          console.log('📸 Method 3: Basic image send (clean options)');
          await client.sendMessage(chatId, media, {});
          console.log('✅ Image sent successfully with basic method');
          return;
        } catch (basicError) {
          console.warn('⚠️ Basic image send failed:', basicError.message);
        }
        
        // Method 4: Try creating fresh media object (if we have the file path)
        if (originalFilePath) {
          try {
            console.log('📸 Method 4: Fresh media object from file');
            const freshMedia = createSafeMedia(originalFilePath, media.filename);
            await client.sendMessage(chatId, freshMedia, {});
            console.log('✅ Image sent successfully with fresh media object');
            return;
          } catch (freshError) {
            console.warn('⚠️ Fresh media send failed:', freshError.message);
          }
        }
        
        // Method 5: Try with explicit image options
        try {
          console.log('📸 Method 5: Explicit image options (force preview)');
          await client.sendMessage(chatId, media, { 
            sendMediaAsDocument: false,
            sendMediaAsSticker: false,
            sendVideoAsGif: false
          });
          console.log('✅ Image sent successfully with explicit options');
          return;
        } catch (explicitError) {
          console.warn('⚠️ Explicit options send failed:', explicitError.message);
        }
        
        // Method 6: Try minimal media object
        try {
          console.log('📸 Method 6: Minimal media object');
          const minimalMedia = new MessageMedia(media.mimetype, media.data, media.filename);
          await client.sendMessage(chatId, minimalMedia, {});
          console.log('✅ Image sent successfully with minimal media object');
          return;
        } catch (minimalError) {
          console.warn('⚠️ Minimal media send failed:', minimalError.message);
        }
      }
      
      // Final fallback: Send as document (but log it clearly)
      console.warn('📄 All image preview methods failed - sending as document (last resort)');
      const documentOptions = {
        ...options,
        sendMediaAsDocument: true,
        sendMediaAsSticker: false,
        sendVideoAsGif: false
      };
      
      await client.sendMessage(chatId, media, documentOptions);
      console.log('✅ Media sent as document (canvas security workaround)');
    } else {
      // Re-throw other errors
      throw error;
    }
  }
};

// Enhanced media creation to avoid canvas issues
const createSafeMedia = (filePath, filename = null) => {
  try {
    console.log('🔧 Creating safe media object from:', filePath);
    const media = MessageMedia.fromFilePath(filePath);
    
    if (filename) {
      media.filename = filename;
    }
    
    // Clear any problematic metadata that might cause canvas issues
    if (media.data) {
      // Ensure clean base64 data
      media.data = media.data.replace(/^data:[^;]+;base64,/, '');
    }
    
    console.log('✅ Safe media object created');
    return media;
  } catch (error) {
    console.error('❌ Error creating safe media:', error.message);
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
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]
  };

  const mediaOptions = {
    sendAsDocument: {
      description: 'Send any media as a document/file attachment',
      supportedTypes: 'all'
    },
    sendAsSticker: {
      description: 'Convert image/video to WebP sticker format',
      supportedTypes: ['image/*', 'video/*'],
      metadata: ['stickerName', 'stickerAuthor', 'stickerCategories']
    },
    sendAsVoice: {
      description: 'Send audio as voice message with waveform',
      supportedTypes: ['audio/*']
    },
    sendAsGif: {
      description: 'Send video as animated GIF',
      supportedTypes: ['video/*']
    },
    isViewOnce: {
      description: 'Send image/video as view-once message (disappears after viewing)',
      supportedTypes: ['image/*', 'video/*']
    },
    sendMediaAsHd: {
      description: 'Send image in HD quality',
      supportedTypes: ['image/*']
    }
  };

  const limits = {
    maxFileSize: '100MB',
    maxFilesPerRequest: 10,
    supportedEndpoints: [
      '/api/whatsapp/send-single-media',
      '/api/whatsapp/send-bulk-multimedia',
      '/api/whatsapp/send-sticker',
      '/api/whatsapp/send-media-url'
    ]
  };

  res.json({
    success: true,
    supportedFormats,
    mediaOptions,
    limits,
    examples: {
      singleMedia: {
        url: '/api/whatsapp/send-single-media',
        method: 'POST',
        contentType: 'multipart/form-data',
        fields: {
          contact: '{"mobile": "+919876543210", "name": "John Doe"}',
          message: 'Hello {{name}}! Check this out.',
          media: '[FILE]',
          sendAsDocument: 'false',
          sendAsSticker: 'false',
          sendAsVoice: 'false',
          sendAsGif: 'false',
          isViewOnce: 'false'
        }
      },
      sticker: {
        url: '/api/whatsapp/send-sticker',
        method: 'POST',
        contentType: 'multipart/form-data',
        fields: {
          contact: '{"mobile": "+919876543210", "name": "John Doe"}',
          media: '[IMAGE_OR_VIDEO_FILE]',
          stickerName: 'My Custom Sticker',
          stickerAuthor: 'Bot Creator',
          stickerCategories: '😀,🎉,👍'
        }
      },
      mediaFromUrl: {
        url: '/api/whatsapp/send-media-url',
        method: 'POST',
        contentType: 'application/json',
        body: {
          contact: { mobile: '+919876543210', name: 'John Doe' },
          mediaUrl: 'https://example.com/image.jpg',
          message: 'Check this image!',
          filename: 'custom-name.jpg',
          sendAsDocument: false
        }
      }
    },
    timestamp: new Date().toISOString()
  });
});

// Get WhatsApp connection status
app.get('/api/whatsapp/status', async (req, res) => {
  console.log('📊 Status check requested from:', req.ip);
  
  let status = 'disconnected';
  let qrInfo = null;
  let sessionInfo = null;
  
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
    
    // Get session information
    try {
      if (client && client.info) {
        const clientInfo = client.info;
        sessionInfo = {
          hasSession: true,
          phone: clientInfo.wid?.user || 'Unknown',
          platform: clientInfo.platform || 'Unknown',
          connected: await client.getState() === 'CONNECTED',
          pushname: clientInfo.pushname || 'Unknown'
        };
      }
    } catch (error) {
      console.warn('⚠️ Error getting session info:', error.message);
      sessionInfo = {
        hasSession: true,
        error: 'Could not retrieve session details'
      };
    }
    
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
    qrCode: qrInfo,
    session: sessionInfo,
    reconnectAttempts: reconnectAttempts,
    maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS,
    isShuttingDown: isShuttingDown,
    monitorActive: !!sessionMonitorInterval,
    timestamp: new Date().toISOString()
  });
});

// Initialize WhatsApp connection
app.post('/api/whatsapp/initialize', async (req, res) => {
  try {
    // Don't allow multiple concurrent initializations
    if (client && client.pupPage) {
      return res.json({
        success: true,
        message: 'WhatsApp client is already initializing or ready',
        timestamp: new Date().toISOString()
      });
    }
    
    await initializeWhatsApp();
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

// Send single message with media
app.post('/api/whatsapp/send-single-media', upload.single('media'), async (req, res) => {
  try {
    if (!isClientReady) {
      return res.status(400).json({
        success: false,
        message: 'WhatsApp client is not ready. Please initialize connection first.'
      });
    }

    const { contact, message, sendAsDocument, sendAsSticker, sendAsVoice, sendAsGif, isViewOnce } = req.body;
    const mediaFile = req.file;
    
    if (!contact || !contact.mobile) {
      return res.status(400).json({
        success: false,
        message: 'Contact mobile number is required'
      });
    }

    if (!message && !mediaFile) {
      return res.status(400).json({
        success: false,
        message: 'Either message text or media file is required'
      });
    }

    const chatId = formatPhoneNumber(contact.mobile);
    
    if (!chatId) {
      return res.status(400).json({
        success: false,
        message: `Invalid phone number format: ${contact.mobile}`
      });
    }

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

    let processedMessage = '';
    if (message) {
      processedMessage = processMessageTemplate(message, contact);
    }

    // Send text message if provided
    if (processedMessage) {
      await client.sendMessage(chatId, processedMessage);
    }

    // Send media if provided
    if (mediaFile) {
      const mediaPath = mediaFile.path || path.join(uploadDir, mediaFile.filename);
      const media = createSafeMedia(mediaPath, mediaFile.originalname);

      // Configure send options based on request
      const sendOptions = {
        sendMediaAsDocument: sendAsDocument === 'true',
        sendMediaAsSticker: sendAsSticker === 'true',
        sendAudioAsVoice: sendAsVoice === 'true',
        sendVideoAsGif: sendAsGif === 'true',
        isViewOnce: isViewOnce === 'true',
        caption: processedMessage || undefined
      };

      try {
        await safeSendMedia(chatId, media, sendOptions, mediaPath);
      } catch (mediaError) {
        // If safeSendMedia still fails, it's a different issue
        console.error('❌ Failed to send media even with safe function:', mediaError.message);
        throw mediaError;
      }

      // Clean up uploaded file
      if (fs.existsSync(mediaPath)) {
        fs.unlinkSync(mediaPath);
      }
    }

    res.json({
      success: true,
      message: 'Message sent successfully',
      contact: contact.name || 'Unknown',
      mobile: contact.mobile,
      hasMeida: !!mediaFile,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error sending media message:', error);
    
    // Clean up uploaded file on error
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to send message: ' + error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Send sticker from image/video
app.post('/api/whatsapp/send-sticker', upload.single('media'), async (req, res) => {
  try {
    if (!isClientReady) {
      return res.status(400).json({
        success: false,
        message: 'WhatsApp client is not ready. Please initialize connection first.'
      });
    }

    const { contact, stickerName, stickerAuthor, stickerCategories } = req.body;
    const mediaFile = req.file;
    
    if (!contact || !contact.mobile) {
      return res.status(400).json({
        success: false,
        message: 'Contact mobile number is required'
      });
    }

    if (!mediaFile) {
      return res.status(400).json({
        success: false,
        message: 'Media file is required for sticker'
      });
    }

    const chatId = formatPhoneNumber(contact.mobile);
    
    if (!chatId) {
      return res.status(400).json({
        success: false,
        message: `Invalid phone number format: ${contact.mobile}`
      });
    }

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

    const mediaPath = mediaFile.path || path.join(uploadDir, mediaFile.filename);
    const media = MessageMedia.fromFilePath(mediaPath);

    // Send as sticker with metadata
    const sendOptions = {
      sendMediaAsSticker: true,
      stickerName: stickerName || 'Custom Sticker',
      stickerAuthor: stickerAuthor || 'WhatsApp Bot',
      stickerCategories: stickerCategories ? stickerCategories.split(',') : ['😀']
    };

    await client.sendMessage(chatId, media, sendOptions);

    // Clean up uploaded file
    if (fs.existsSync(mediaPath)) {
      fs.unlinkSync(mediaPath);
    }

    res.json({
      success: true,
      message: 'Sticker sent successfully',
      contact: contact.name || 'Unknown',
      mobile: contact.mobile,
      stickerName: sendOptions.stickerName,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error sending sticker:', error);
    
    // Clean up uploaded file on error
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to send sticker: ' + error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Send media from URL
app.post('/api/whatsapp/send-media-url', async (req, res) => {
  try {
    if (!isClientReady) {
      return res.status(400).json({
        success: false,
        message: 'WhatsApp client is not ready. Please initialize connection first.'
      });
    }

    const { contact, mediaUrl, message, sendAsDocument, sendAsSticker, sendAsVoice, sendAsGif, isViewOnce, filename } = req.body;
    
    if (!contact || !contact.mobile) {
      return res.status(400).json({
        success: false,
        message: 'Contact mobile number is required'
      });
    }

    if (!mediaUrl) {
      return res.status(400).json({
        success: false,
        message: 'Media URL is required'
      });
    }

    const chatId = formatPhoneNumber(contact.mobile);
    
    if (!chatId) {
      return res.status(400).json({
        success: false,
        message: `Invalid phone number format: ${contact.mobile}`
      });
    }

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

    let processedMessage = '';
    if (message) {
      processedMessage = processMessageTemplate(message, contact);
    }

    // Create media from URL
    const media = await MessageMedia.fromUrl(mediaUrl, {
      filename: filename || undefined,
      unsafeMime: true // Allow unknown MIME types
    });

    // Configure send options
    const sendOptions = {
      sendMediaAsDocument: sendAsDocument === 'true',
      sendMediaAsSticker: sendAsSticker === 'true',
      sendAudioAsVoice: sendAsVoice === 'true',
      sendVideoAsGif: sendAsGif === 'true',
      isViewOnce: isViewOnce === 'true',
      caption: processedMessage || undefined
    };

    try {
      await safeSendMedia(chatId, media, sendOptions, null); // URL media doesn't have local file path
    } catch (mediaError) {
      // If safeSendMedia still fails, it's a different issue
      console.error('❌ Failed to send media from URL even with safe function:', mediaError.message);
      throw mediaError;
    }

    res.json({
      success: true,
      message: 'Media sent successfully from URL',
      contact: contact.name || 'Unknown',
      mobile: contact.mobile,
      mediaUrl: mediaUrl,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error sending media from URL:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send media: ' + error.message,
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
        try { 
          await initializeWhatsApp(); 
        } catch (e) { 
          console.warn('⚠️ Error calling initializeWhatsApp:', e.message); 
        }
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
    if (!req.body || !req.body.data) {
      return res.status(400).json({
        success: false,
        message: 'Request data is missing'
      });
    }

    let data;
    try {
      data = JSON.parse(req.body.data);
    } catch (parseError) {
      return res.status(400).json({
        success: false,
        message: 'Invalid JSON data provided'
      });
    }

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

          const media = createSafeMedia(resolvedFilePath, attachment.originalname);

          console.log('📎 Sending attachment', {
            resolvedFilePath,
            mimetype: attachment.mimetype,
            size: attachment.size,
            type: attachment.mimetype ? getMediaTypeInfo(attachment.mimetype).type : 'unknown'
          });

          try {
            // For images and videos, send as regular media for preview
            if (attachment.mimetype && (attachment.mimetype.startsWith('image/') || attachment.mimetype.startsWith('video/'))) {
              console.log('📸 Sending as preview-enabled media (image/video)');
              
              // Use safe send function to handle canvas issues
              await safeSendMedia(chatId, media, {}, resolvedFilePath);
            } else if (attachment.mimetype && attachment.mimetype.startsWith('audio/')) {
              console.log('🎵 Sending audio as voice message');
              await safeSendMedia(chatId, media, { sendAudioAsVoice: true }, resolvedFilePath);
            } else {
              console.log('📄 Sending as document');
              await safeSendMedia(chatId, media, { sendMediaAsDocument: true }, resolvedFilePath);
            }
          } catch (e) {
            console.warn('⚠️ Sending as preferred format failed, retrying as document:', e.message);
            await safeSendMedia(chatId, media, { sendMediaAsDocument: true }, resolvedFilePath);
          }

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
    isClientReady = false;
    
    // Clear session monitor first
    if (sessionMonitorInterval) {
      clearInterval(sessionMonitorInterval);
      sessionMonitorInterval = null;
      console.log('🛑 Session monitor stopped');
    }
    
    if (client) {
      console.log('🧹 Destroying WhatsApp client and clearing session...');
      
      try {
        // First try to logout properly (this clears session data)
        await client.logout();
        console.log('✅ Logged out successfully');
      } catch (logoutError) {
        console.warn('⚠️ Error during logout:', logoutError.message);
        
        // If logout fails, try to destroy the client
        try {
          await client.destroy();
          console.log('✅ Client destroyed');
        } catch (destroyError) {
          console.warn('⚠️ Error destroying client:', destroyError.message);
        }
      }
      
      // Clear session data manually if needed
      try {
        if (client.authStrategy && typeof client.authStrategy.logout === 'function') {
          await client.authStrategy.logout();
          console.log('✅ Session data cleared');
        }
      } catch (sessionError) {
        console.warn('⚠️ Error clearing session data:', sessionError.message);
      }
      
      client = null;
    }
    
    // Clear all state variables
    qrCodeData = null;
    qrCodeTimestamp = null;
    reconnectAttempts = 0;

    res.json({
      success: true,
      message: 'WhatsApp disconnected and session cleared successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error during disconnect:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to disconnect WhatsApp: ' + error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Clear session data and restart fresh
app.post('/api/whatsapp/clear-session', async (req, res) => {
  console.log('🧹 Clear session requested from:', req.ip);
  try {
    isClientReady = false;
    
    // Stop monitoring
    if (sessionMonitorInterval) {
      clearInterval(sessionMonitorInterval);
      sessionMonitorInterval = null;
    }
    
    if (client) {
      console.log('🛑 Stopping client and clearing all session data...');
      
      try {
        // Logout to clear session properly
        await client.logout();
      } catch (error) {
        console.warn('⚠️ Logout error (continuing):', error.message);
      }
      
      try {
        // Destroy client
        await client.destroy();
      } catch (error) {
        console.warn('⚠️ Destroy error (continuing):', error.message);
      }
      
      client = null;
    }
    
    // Clear all state
    qrCodeData = null;
    qrCodeTimestamp = null;
    reconnectAttempts = 0;
    
    console.log('✅ Session cleared. Ready for fresh initialization.');
    
    res.json({
      success: true,
      message: 'Session cleared successfully. You can now initialize a fresh connection.',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error clearing session:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear session: ' + error.message,
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
  setTimeout(async () => {
    console.log('🎯 Initializing WhatsApp now...');
    try {
      await initializeWhatsApp();
    } catch (error) {
      console.error('❌ Error during auto-initialization:', error.message);
    }
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
const gracefulShutdown = async (signal) => {
  console.log(`\n🛑 Received ${signal} - Shutting down server gracefully...`);
  isShuttingDown = true;
  
  // Stop session monitoring
  if (sessionMonitorInterval) {
    clearInterval(sessionMonitorInterval);
    sessionMonitorInterval = null;
    console.log('� Session monitor stopped');
  }
  
  // Disconnect WhatsApp properly
  if (client) {
    console.log('📱 Properly disconnecting WhatsApp...');
    try {
      // First try logout to clear session data
      await client.logout();
      console.log('✅ WhatsApp logged out successfully');
    } catch (logoutError) {
      console.warn('⚠️ Error during logout:', logoutError.message);
      
      // If logout fails, try destroy
      try {
        await client.destroy();
        console.log('✅ WhatsApp client destroyed');
      } catch (destroyError) {
        console.error('❌ Error destroying client:', destroyError.message);
      }
    }
    client = null;
  }
  
  console.log('✅ Graceful shutdown completed');
  process.exit(0);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));