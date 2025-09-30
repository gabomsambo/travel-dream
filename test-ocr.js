const fs = require('fs');
const path = require('path');

async function testOCR() {
  console.log('🔍 Testing OCR Service Server...\n');

  // Check if public/uploads directory exists with any screenshots
  const uploadsDir = path.join(__dirname, 'public/uploads/screenshots');

  if (!fs.existsSync(uploadsDir)) {
    console.log('❌ No uploads directory found. Upload some screenshots first.');
    return;
  }

  const files = fs.readdirSync(uploadsDir).filter(f => f.endsWith('.jpg') || f.endsWith('.png'));

  if (files.length === 0) {
    console.log('❌ No image files found in uploads directory. Upload some screenshots first.');
    return;
  }

  console.log(`✅ Found ${files.length} uploaded files`);
  const testFile = files[0];
  console.log(`📄 Testing with: ${testFile}\n`);

  // Test the OCR API endpoint
  const filePath = `/uploads/screenshots/${testFile}`;

  // Read the database to get a source ID
  console.log('📊 Checking database for sources...');

  const response = await fetch('http://localhost:3000/api/upload/sessions?limit=1');
  const data = await response.json();

  if (data.sessions && data.sessions.length > 0) {
    const session = data.sessions[0];
    console.log(`✅ Found session: ${session.id}`);

    if (session.meta && session.meta.uploadedFiles && session.meta.uploadedFiles.length > 0) {
      const sourceIds = session.meta.uploadedFiles;
      console.log(`✅ Found ${sourceIds.length} uploaded sources\n`);
      console.log(`🚀 Starting OCR processing...`);

      const processResponse = await fetch('http://localhost:3000/api/upload/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceIds: sourceIds.slice(0, 1), // Test with just one
          sessionId: session.id
        })
      });

      const processData = await processResponse.json();
      console.log('\n📋 OCR Results:');
      console.log(JSON.stringify(processData, null, 2));

      if (processData.status === 'success' && processData.results.length > 0) {
        const result = processData.results[0];
        if (result.success) {
          console.log('\n✅ OCR Processing Successful!');
          console.log(`📝 Extracted Text (first 200 chars):`);
          console.log(result.ocrText?.substring(0, 200) || 'No text extracted');
          console.log(`\n📊 Confidence: ${result.confidence}%`);
          console.log(`⏱️  Processing Time: ${result.processingTime}ms`);
        } else {
          console.log('\n❌ OCR Processing Failed:');
          console.log(result.error);
        }
      }
    } else {
      console.log('❌ No uploaded files in session');
    }
  } else {
    console.log('❌ No sessions found. Upload some files first.');
  }
}

testOCR().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});