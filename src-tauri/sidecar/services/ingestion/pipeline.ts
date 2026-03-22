import { fetchGdeltEvents } from './gdelt.js';
import { calculateBaselineScore } from '../scoring.js';
import { adjudicateEvent } from '../adjudicator.js';
import { getDb } from '../../database/sqlite.js';

function generateEmbeddingId() {
  return `emb-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export async function runIngestionPipeline() {
  console.log('[Pipeline] Starting GDELT ingestion...');
  const events = await fetchGdeltEvents();
  console.log(`[Pipeline] Fetched ${events.length} events from GDELT.`);

  let insertedCount = 0;
  const db = getDb();

  for (const event of events) {
    // 1. Calculate Baseline Score using Rule-based engine
    const baselineScore = calculateBaselineScore(event);

    let finalScore = baselineScore;
    let confidence = 0.8; // default
    let reasoning = 'Rule-based scoring';

    // 2. LLM Adjudication if baseline > 50
    if (baselineScore > 50) {
      console.log(`[Pipeline] Event "${event.title}" requires LLM Adjudication (score: ${baselineScore})...`);
      const adjudication = await adjudicateEvent(event.id, event.title, event.description);
      
      if (adjudication) {
        // Assume LLM Score is 0.0 - 1.0, scale to 100
        const llmScore = adjudication.customs_relevance_score * 100;
        finalScore = (baselineScore * 0.4) + (llmScore * 0.6); // Blended score
        reasoning = adjudication.reasoning;
        confidence = 0.95; // LLM confidence boost
        console.log(`[Pipeline] LLM Adjusted Score: ${finalScore.toFixed(1)} - ${reasoning}`);
      }
    }

    // 3. Save to SQLite Knowledge Graph
    try {
      // Check if exists
      const exists = db.prepare('SELECT id FROM EventoGeopolitico WHERE id = ?').get(event.id);
      if (!exists) {
        // Generate mock embedding ID for now
        const embeddingId = generateEmbeddingId();
        
        db.prepare(`
          INSERT INTO EventoGeopolitico (id, title, description, source_url, severity_score, confidence_score, embedding_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          event.id,
          event.title,
          event.description + (reasoning !== 'Rule-based scoring' ? `\n[AI Reason: ${reasoning}]` : ''),
          event.sourceUrl,
          finalScore / 100, // Normalized to 0-1 for UI
          confidence,
          embeddingId
        );
        insertedCount++;
      }
    } catch (dbError) {
      console.error(`[Pipeline] Failed to store event ${event.id}:`, dbError);
    }
  }

  console.log(`[Pipeline] Ingestion complete. Inserted ${insertedCount} new events.`);
  return { processed: events.length, inserted: insertedCount };
}
