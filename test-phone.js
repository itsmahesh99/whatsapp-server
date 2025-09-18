// Test phone number formatting function
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

// Test cases
console.log('=== Testing Phone Number Formatting ===\n');

const testNumbers = [
  '9022393240',           // 10 digits - should add 91
  '+919022393240',        // With country code and +
  '919022393240',         // With country code, no +
  '09022393240',          // With leading 0
  '091-9022393240',       // With 091 prefix
  '90-223-932-40',        // With dashes
  '90 223 932 40',        // With spaces
  '(90) 223-932-40'       // With brackets and dashes
];

testNumbers.forEach(number => {
  console.log(`\nTesting: "${number}"`);
  const result = formatPhoneNumber(number);
  console.log(`Result: ${result}\n`);
  console.log('---'.repeat(20));
});