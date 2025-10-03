PRP-6 Planning: Deduplication Engine
Core Vision
An intelligent guardian against redundancy that understands place identity beyond string matching - knowing that "MoMA", "Museum of Modern Art", and "MOMA" are all the same place.
Key Concepts

Multi-Signal Matching: Combines name, location, metadata, and context signals
Confidence Scoring: Each duplicate suggestion has a clear confidence percentage
Zero Information Loss: Every source, note, and variation is preserved
Semantic Understanding: Uses NLP to understand meaning, not just string matching
Learning System: Improves from user merge decisions over time

Notable Features

Side-by-Side Comparison: Visual diff showing what's different and what would be merged
Merge Preview: See exactly what the final result will look like
Name Normalization Pipeline: Handles accents, abbreviations, articles intelligently
Special Cases: Knows chains need exact addresses, landmarks are unique
Bulk Merge: Review and merge multiple duplicate groups at once

Technical Highlights

Multiple Signals: Name (Levenshtein, normalized), Geo (distance), Meta (tags, category), Context (saved together)
Performance: Process 1000 places in < 2 seconds
Indexing: Trigram for fuzzy match, spatial for coordinates, full-text for descriptions
Audit Trail: Complete history of all merges with ability to undo

Success Metrics

Precision > 95% (no false merges)
Recall > 90% (catch most duplicates)
Review time < 10 seconds per duplicate
User confidence > 4.5/5 rating


Key Insights from Both Systems
Shared Themes

Human-AI Partnership: AI suggests, human decides, system learns
Confidence-Driven UX: Visual confidence scores guide user attention
Context Preservation: Never lose the "why" behind the data
Progressive Disclosure: Simple for common cases, powerful for edge cases

Interaction Philosophy

Make the right thing the easy thing
Show confidence to build trust
Batch operations for efficiency
Always allow undo/correction
Learn from patterns, not just individual actions

Technical Requirements Both Need

Fast performance (<100ms response times)
Background processing queues
Optimistic UI updates
Full audit trails
Soft deletes (never lose data)

Questions That Connect Both Systems

Should duplicate detection happen at inbox stage or after confirmation?
How do confidence scores from extraction affect duplicate detection confidence?
Should bulk confirm automatically handle detected duplicates?
When merging, should items stay in inbox or move to library?
How do we handle duplicates across inbox/library boundary?

Next Steps
With these planning documents complete, you now have:

Clear vision for user workflows
Specific UI/UX patterns to implement
Technical requirements and performance targets
Success metrics to measure against
Edge cases to handle