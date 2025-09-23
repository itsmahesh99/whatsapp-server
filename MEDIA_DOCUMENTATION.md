# WhatsApp Server - Media Sharing Documentation

## 📱 Media Support Overview

Your WhatsApp server has comprehensive media sharing capabilities using the `whatsapp-web.js` library. Here's everything you can do:

## 🎯 Supported Media Types

### Images
- **Formats**: JPEG, PNG, GIF, WebP
- **Options**: Send as image, document, sticker, view-once, HD quality
- **Max Size**: 100MB

### Videos  
- **Formats**: MP4, AVI, MOV, WMV
- **Options**: Send as video, document, GIF, view-once
- **Max Size**: 100MB

### Audio
- **Formats**: MP3, WAV, OGG
- **Options**: Send as audio, voice message (with waveform), document
- **Max Size**: 100MB

### Documents
- **Formats**: PDF, Word (.doc, .docx), Excel (.xls, .xlsx)
- **Options**: Send as document attachment
- **Max Size**: 100MB

## 🚀 Available Endpoints

### 1. Send Single Media (`/api/whatsapp/send-single-media`)
**Method**: POST  
**Content-Type**: multipart/form-data

**Fields**:
```javascript
{
  contact: '{"mobile": "+919876543210", "name": "John Doe"}',
  message: 'Hello {{name}}! Check this out.',  // Optional text message
  media: [FILE],  // Media file upload
  sendAsDocument: 'false',    // Send as document
  sendAsSticker: 'false',     // Convert to sticker
  sendAsVoice: 'false',       // Send audio as voice message
  sendAsGif: 'false',         // Send video as GIF
  isViewOnce: 'false'         // Disappearing message
}
```

### 2. Send Media from URL (`/api/whatsapp/send-media-url`)
**Method**: POST  
**Content-Type**: application/json

```javascript
{
  contact: { mobile: "+919876543210", name: "John Doe" },
  mediaUrl: "https://example.com/image.jpg",
  message: "Check this image!",  // Optional
  filename: "custom-name.jpg",   // Optional
  sendAsDocument: false,
  sendAsSticker: false,
  sendAsVoice: false,
  sendAsGif: false,
  isViewOnce: false
}
```

### 3. Send Custom Sticker (`/api/whatsapp/send-sticker`)
**Method**: POST  
**Content-Type**: multipart/form-data

**Fields**:
```javascript
{
  contact: '{"mobile": "+919876543210", "name": "John Doe"}',
  media: [IMAGE_OR_VIDEO_FILE],
  stickerName: 'My Custom Sticker',      // Optional
  stickerAuthor: 'Bot Creator',          // Optional  
  stickerCategories: '😀,🎉,👍'          // Optional emojis
}
```

### 4. Bulk Media Messages (`/api/whatsapp/send-bulk-multimedia`)
**Method**: POST  
**Content-Type**: multipart/form-data

**Fields**:
```javascript
{
  data: JSON.stringify({
    contacts: [
      { mobile: "+919876543210", name: "John" },
      { mobile: "+919876543211", name: "Jane" }
    ],
    template: "Hello {{name}}! Check this out.",  // Optional
    url: "https://example.com"                    // Optional
  }),
  file1: [MEDIA_FILE_1],  // Multiple files supported
  file2: [MEDIA_FILE_2]
}
```

### 5. Get Media Information (`/api/whatsapp/media-info`)
**Method**: GET

Returns supported formats, options, limits, and examples.

## ⚙️ Media Options Explained

### `sendAsDocument: true`
- Sends any media as a file attachment
- Preserves original filename and format
- Works with all media types

### `sendAsSticker: true` 
- Converts images/videos to WebP sticker format
- Only works with images and videos
- Can include custom metadata (name, author, categories)

### `sendAsVoice: true`
- Converts audio to voice message format
- Generates waveform visualization
- Only works with audio files

### `sendAsGif: true`
- Sends video as animated GIF
- Only works with video files
- Automatically loops

### `isViewOnce: true`
- Creates disappearing media message
- Only works with images and videos
- Message disappears after viewing

### `sendMediaAsHd: true`
- Sends images in HD quality
- Only works with images
- Larger file size but better quality

## 📝 Message Templates

All endpoints support template variables that get replaced with contact data:

```javascript
"Hello {{name}} from {{company}}! Your mobile is {{mobile}}"
```

**Available variables**:
- `{{name}}` - Contact name
- `{{company}}` - Contact company  
- `{{email}}` - Contact email
- `{{mobile}}` - Contact mobile number
- `{{interestedArea}}` - Contact interested area
- `{{contactType}}` - Contact type

## 🧪 Testing Your Media Features

1. **Check WhatsApp Status**:
   ```bash
   curl http://localhost:3001/api/whatsapp/status
   ```

2. **Get Media Information**:
   ```bash
   curl http://localhost:3001/api/whatsapp/media-info
   ```

3. **Run Test Suite**:
   ```bash
   node test-media.js
   ```

## 🔧 Configuration

Your current setup includes:

- **File Upload**: Multer with 100MB limit
- **Multiple Files**: Up to 10 files per request
- **Auto Cleanup**: Uploaded files are automatically deleted after sending
- **Error Handling**: Comprehensive error handling and logging
- **Rate Limiting**: Built-in delays to prevent WhatsApp rate limiting

## 📊 Current Implementation Features

✅ **Implemented**:
- File uploads from local system
- Media from URLs
- Sticker creation with metadata
- Bulk media messaging
- All WhatsApp media options
- Template variable replacement
- Comprehensive error handling
- File cleanup
- Rate limiting protection

✅ **Media Types Supported**:
- Images (JPEG, PNG, GIF, WebP)
- Videos (MP4, AVI, MOV, WMV)  
- Audio (MP3, WAV, OGG)
- Documents (PDF, Word, Excel)

✅ **Special Features**:
- Convert images/videos to stickers
- Send audio as voice messages with waveforms
- Send videos as GIFs
- View-once (disappearing) messages
- HD quality images
- Document mode for any media

## 🚨 Important Notes

1. **WhatsApp Limits**: WhatsApp has built-in limits on file sizes and sending frequency
2. **Rate Limiting**: The server includes delays to prevent being blocked
3. **File Cleanup**: All uploaded files are automatically deleted after processing
4. **Error Handling**: If media sending fails, it automatically retries as document
5. **Session Management**: Always checks WhatsApp session health before sending

## 📞 Contact & Support

Your media server is production-ready with comprehensive error handling, logging, and fallback mechanisms. All major WhatsApp media features are supported and properly implemented!