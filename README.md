# 📱 Energenie WhatsApp Marketing Server

A Node.js backend service for sending WhatsApp messages to expo leads using whatsapp-web.js.

## 🌟 Features

- **WhatsApp Web Integration** - Connect via QR code scanning
- **Bulk Messaging** - Send personalized messages to multiple contacts
- **Template System** - Dynamic message templates with placeholders
- **Rate Limiting** - Safe messaging with automatic delays
- **Session Persistence** - Maintains WhatsApp connection across restarts
- **Health Monitoring** - Built-in health checks and status endpoints
- **Docker Ready** - Containerized for easy deployment

## 🚀 Quick Start

### Local Development

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.production .env

# Update .env with your settings
# Start the server
npm start
```

### Production Deployment (Dokploy)

```bash
# Build Docker image
docker build -t energenie-whatsapp-server .

# Run with docker-compose
docker-compose up -d
```

## 📋 Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Server port | `3001` |
| `CORS_ORIGINS` | Allowed frontend URLs | `https://yourdomain.com` |
| `SESSION_NAME` | WhatsApp session name | `energenie-whatsapp` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment | `development` |
| `DEBUG` | Enable debug logging | `false` |
| `RATE_LIMIT_PER_MINUTE` | Message rate limit | `25` |

## 🔧 API Endpoints

### WhatsApp Management

- `POST /api/whatsapp/initialize` - Initialize WhatsApp connection
- `GET /api/whatsapp/status` - Get connection status and QR code
- `POST /api/whatsapp/disconnect` - Disconnect WhatsApp
- `GET /api/whatsapp/qr` - Get QR code for scanning

### Messaging

- `POST /api/whatsapp/send-single` - Send message to one contact
- `POST /api/whatsapp/send-bulk` - Send messages to multiple contacts

### Health & Monitoring

- `GET /api/health` - Health check endpoint

## 📱 WhatsApp Setup Process

1. **Initialize**: `POST /api/whatsapp/initialize`
2. **Get QR Code**: `GET /api/whatsapp/status` 
3. **Scan QR Code**: Use WhatsApp app to scan
4. **Ready**: Status becomes `ready`

## 💬 Message Templates

Use these placeholders in your message templates:

- `{{name}}` - Contact name
- `{{company}}` - Company name
- `{{email}}` - Email address
- `{{mobile}}` - Mobile number
- `{{interestedArea}}` - Interest/review text
- `{{contactType}}` - client or partner

### Example Template

```
🌱 Hello {{name}} from {{company}}!

Thank you for visiting Energenie at the expo. 

Based on your interest: {{interestedArea}}

Let's schedule a call this week!

Best regards,
Energenie Team
```

## 🐳 Docker Deployment

### Dockerfile Features

- **Node.js 18 Alpine** - Lightweight base image
- **Session Persistence** - Volumes for WhatsApp auth data
- **Health Checks** - Automatic container health monitoring
- **Production Optimized** - Security and performance configurations

### Docker Compose

```yaml
version: '3.8'
services:
  whatsapp-server:
    build: .
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - PORT=3001
    volumes:
      - whatsapp_data:/app/.wwebjs_auth
    restart: unless-stopped
```

## 🔐 Security

### Production Security Features

- **CORS Protection** - Configurable allowed origins
- **Rate Limiting** - Prevents WhatsApp account restrictions
- **Session Security** - Encrypted session storage
- **Input Validation** - Sanitized message content
- **Error Handling** - No sensitive data in error responses

### WhatsApp Guidelines Compliance

- **2.5 Second Delays** - Between each message
- **Number Validation** - Checks WhatsApp registration
- **Opt-out Respect** - Manual management required
- **Business Use Only** - No spam messaging

## 📊 Monitoring & Logs

### Health Check Response

```json
{
  "status": "OK",
  "server": "Energenie WhatsApp Server",
  "version": "1.0.0",
  "timestamp": "2025-09-18T10:30:00.000Z",
  "whatsapp": {
    "connected": true,
    "hasQR": false
  }
}
```

### Log Messages

- `🚀 Server running on port 3001`
- `📱 QR Code generated`
- `✅ WhatsApp client is ready!`
- `📤 Message sent to Contact Name`

## 🔧 Troubleshooting

### Common Issues

**QR Code Not Appearing**
- Check server logs for errors
- Ensure WhatsApp is properly initialized
- Verify network connectivity

**Messages Not Sending**
- Check WhatsApp connection status
- Verify phone number format
- Ensure rate limits not exceeded

**Container Restart Issues**
- Check volume mounts for session data
- Verify environment variables
- Review Docker logs

## 🚀 Dokploy Deployment

### Step 1: Create New Service

1. **Service Name**: `energenie-whatsapp-server`
2. **Type**: Docker
3. **Repository**: Link to this GitHub repository

### Step 2: Environment Configuration

```env
NODE_ENV=production
PORT=3001
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
SESSION_NAME=energenie-whatsapp-prod
```

### Step 3: Volume Configuration

- **Volume Name**: `whatsapp-session-data`
- **Mount Path**: `/app/.wwebjs_auth`
- **Purpose**: Persist WhatsApp authentication

### Step 4: Domain Setup

- **Subdomain**: `whatsapp-api.yourdomain.com`
- **Port**: `3001`
- **SSL**: Enable automatic certificate

## 📈 Performance

### Optimizations

- **Alpine Linux** - Minimal container size
- **Process Management** - Graceful shutdowns
- **Memory Efficiency** - Optimized for WhatsApp sessions
- **Auto-restart** - Container resilience

### Resource Requirements

- **RAM**: 256MB minimum, 512MB recommended
- **CPU**: 0.5 cores minimum
- **Storage**: 100MB for session data
- **Network**: Outbound HTTPS access required

## 🤝 Integration

### Frontend Integration

Update your React app's WhatsApp component:

```javascript
const WHATSAPP_SERVER_URL = 'https://whatsapp-api.yourdomain.com';
```

### API Usage Example

```javascript
// Check status
const status = await fetch(`${WHATSAPP_SERVER_URL}/api/whatsapp/status`);

// Send bulk messages
const result = await fetch(`${WHATSAPP_SERVER_URL}/api/whatsapp/send-bulk`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ contacts, template })
});
```

## 📝 License

MIT License - Feel free to use for commercial expo marketing purposes.

## 🆘 Support

For issues or questions:
1. Check the troubleshooting section
2. Review server logs
3. Ensure WhatsApp account compliance
4. Verify environment configuration

---

**Built for Energenie Expo Marketing** 🌱⚡📱