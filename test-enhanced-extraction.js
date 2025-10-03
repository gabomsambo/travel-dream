import { LLMExtractionService } from './src/lib/llm-extraction-service.js';

const testTexts = [
  // High confidence test
  "Park Güell - Gaudí's mosaic wonderland in Barcelona. Amazing sunset views over the city. €10 entry, book online to skip the lines. Best visited early morning or late afternoon.",

  // Medium confidence test
  "Cervecería Catalana - best tapas we had in Barcelona! Lines are crazy but totally worth the wait. Try the jamón croquettes and patatas bravas. Gets packed around 9pm.",

  // Low confidence test
  "Nice beach for morning walks"
];

async function testExtraction() {
  console.log('🧪 Testing Enhanced LLM Extraction (v2.0.0)\n');
  console.log('═'.repeat(80) + '\n');

  const service = new LLMExtractionService();

  for (let i = 0; i < testTexts.length; i++) {
    const text = testTexts[i];
    console.log(`📝 Test ${i + 1}: "${text.substring(0, 60)}${text.length > 60 ? '...' : ''}"`);
    console.log('─'.repeat(80));

    try {
      const result = await service.extractFromSource(`test-source-${i + 1}`, text);

      if (result.success && result.places.length > 0) {
        const place = result.places[0];

        console.log(`\n✅ Extraction successful`);
        console.log(`   Name: ${place.name}`);
        console.log(`   Kind: ${place.kind}`);
        console.log(`   Location: ${place.location.city || 'N/A'}, ${place.location.country || 'N/A'}`);
        console.log(`   Confidence: ${place.confidence.toFixed(2)}`);

        // Validate description (critical)
        if (place.description) {
          console.log(`   ✅ Description: "${place.description.substring(0, 100)}${place.description.length > 100 ? '...' : ''}"`);
        } else {
          console.log(`   ❌ Description: MISSING`);
        }

        // Validate activities
        if (place.metadata.activities && place.metadata.activities.length > 0) {
          console.log(`   ✅ Activities (${place.metadata.activities.length}): ${place.metadata.activities.slice(0, 3).join(', ')}${place.metadata.activities.length > 3 ? '...' : ''}`);
        } else {
          console.log(`   ⚠️  Activities: None extracted`);
        }

        // Validate price_level
        if (place.metadata.price_level) {
          console.log(`   ✅ Price Level: ${place.metadata.price_level}`);
        } else {
          console.log(`   ⚠️  Price Level: Not extracted`);
        }

        // Validate best_time
        if (place.metadata.best_time) {
          console.log(`   ✅ Best Time: ${place.metadata.best_time}`);
        } else {
          console.log(`   ⚠️  Best Time: Not extracted`);
        }

        // Validate cuisine (for restaurants)
        if (place.metadata.cuisine && place.metadata.cuisine.length > 0) {
          console.log(`   ✅ Cuisine (${place.metadata.cuisine.length}): ${place.metadata.cuisine.join(', ')}`);
        }

        // Validate amenities
        if (place.metadata.amenities && place.metadata.amenities.length > 0) {
          console.log(`   ✅ Amenities (${place.metadata.amenities.length}): ${place.metadata.amenities.slice(0, 2).join(', ')}${place.metadata.amenities.length > 2 ? '...' : ''}`);
        }

        // Validate tags and vibes
        if (place.metadata.tags && place.metadata.tags.length > 0) {
          console.log(`   ✅ Tags: ${place.metadata.tags.join(', ')}`);
        }

        if (place.metadata.vibes && place.metadata.vibes.length > 0) {
          console.log(`   ✅ Vibes: ${place.metadata.vibes.join(', ')}`);
        }

        // Provider info
        console.log(`\n   Provider: ${result.provider || 'unknown'}`);
        console.log(`   Model: ${result.model || 'unknown'}`);
        if (result.cost) {
          console.log(`   Cost: $${result.cost.toFixed(4)}`);
        }

      } else {
        console.log(`\n❌ Extraction failed`);
        console.log(`   Error: ${result.error || 'No places extracted'}`);
      }

    } catch (error) {
      console.log(`\n❌ Test failed with error:`);
      console.log(`   ${error.message}`);
    }

    console.log('\n' + '═'.repeat(80) + '\n');
  }

  console.log('🏁 Testing complete!\n');

  console.log('Expected Results Summary:');
  console.log('Test 1 (High): description ✅, 4+ activities, price="$$", confidence >0.9');
  console.log('Test 2 (Med):  description ✅, 2+ activities, cuisine present, confidence >0.7');
  console.log('Test 3 (Low):  description ✅ (synthesized), confidence <0.5');
}

testExtraction().catch(console.error);
