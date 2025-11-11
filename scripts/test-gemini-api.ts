import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });

async function testGeminiAPI() {
  console.log('Testing Gemini API connection...\n');

  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    console.error('❌ GOOGLE_GENERATIVE_AI_API_KEY not found in environment');
    process.exit(1);
  }

  console.log('✅ API key found');
  console.log(`   Length: ${apiKey.length} characters`);
  console.log(`   Prefix: ${apiKey.substring(0, 10)}...`);

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

    console.log('\n✅ Gemini client initialized');
    console.log('   Model: gemini-2.0-flash-exp');

    console.log('\n🔄 Testing text generation...');
    const textResult = await model.generateContent('Say hello in one word');
    const textResponse = textResult.response.text();
    console.log('✅ Text generation works:', textResponse);

    console.log('\n🔄 Testing vision with test image...');
    const testImagePath = path.join(process.cwd(), 'test_photos', 'IMG_2640.PNG');

    if (!fs.existsSync(testImagePath)) {
      console.error('❌ Test image not found:', testImagePath);
      process.exit(1);
    }

    const imageBuffer = fs.readFileSync(testImagePath);
    console.log(`   Image size: ${(imageBuffer.length / 1024).toFixed(1)}KB`);

    const base64Image = imageBuffer.toString('base64');

    const imagePart = {
      inlineData: {
        data: base64Image,
        mimeType: 'image/png',
      },
    };

    const prompt = 'Extract all visible text from this image. Return only the text content.';

    const startTime = Date.now();
    const visionResult = await model.generateContent([prompt, imagePart]);
    const processingTime = Date.now() - startTime;

    const extractedText = visionResult.response.text();

    console.log('\n✅ Vision API works!');
    console.log(`   Processing time: ${processingTime}ms`);
    console.log(`   Extracted text length: ${extractedText.length} characters`);
    console.log('\n--- Extracted Text (first 200 chars) ---');
    console.log(extractedText.substring(0, 200));
    console.log('---\n');

    console.log('✅ All tests passed! Gemini API is working correctly.');

  } catch (error) {
    console.error('\n❌ API test failed:', error);
    if (error instanceof Error) {
      console.error('   Error message:', error.message);
      console.error('   Error stack:', error.stack);
    }
    process.exit(1);
  }
}

testGeminiAPI();
