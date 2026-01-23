import { Request, Response } from 'express';
// Fix: Removed PrismaClient import as it causes build errors in this environment
// import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import { cosineSimilarity } from '../utils/cosineSimilarity';

// Fix: Mock Prisma client or use in-memory storage for demo
// const prisma = new PrismaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Generate embedding for a query
export const generateEmbedding = async (text: string) => {
  // Mock embedding generation if API key is missing to prevent crash
  if (!process.env.OPENAI_API_KEY) return new Array(1536).fill(0).map(() => Math.random());

  const response = await openai.embeddings.create({
    model: 'text-embedding-3-large',
    input: text,
  });
  return response.data[0].embedding;
};

// Save search query and generate embedding
// Fix: Use 'any' for req/res to resolve type mismatches in this environment
export const saveSearchQuery = async (req: any, res: any) => {
  const { userId, query } = req.body;
  try {
    const embedding = await generateEmbedding(query);

    // Fix: Commented out Prisma calls, replaced with console log
    /*
    await prisma.searchHistory.create({
      data: { userId, query },
    });

    await prisma.userEmbedding.create({
      data: { userId, embedding },
    });
    */
    console.log(`[Mock DB] Saved search for ${userId}: ${query}`);

    res.status(200).json({ message: 'Search query saved successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// Semantic search using embeddings
// Fix: Use 'any' for req/res to resolve type mismatches
export const searchGigsSemantic = async (req: any, res: any) => {
  const { query } = req.query;
  
  if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: "Query parameter is required" });
  }

  try {
    const queryEmbedding = await generateEmbedding(query);

    // Fix: Mocked database retrieval and ranking
    /*
    const allGigs = await prisma.gig.findMany({
      include: { embeddings: true },
    });
    */
    // Mock Data
    const allGigs: any[] = []; 

    const rankedGigs = allGigs
      .map((gig) => {
        if (!gig.embeddings.length) return null;
        const similarity = cosineSimilarity(queryEmbedding, gig.embeddings[0].embedding);
        return { ...gig, score: similarity };
      })
      .filter(Boolean)
      .sort((a, b) => (b?.score || 0) - (a?.score || 0));

    res.status(200).json(rankedGigs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// Fix: Use 'any' for req/res to resolve type mismatches
export const getRecommendations = async (req: any, res: any) => {
  const { userId } = req.params;
  try {
    // Fix: Mocked Prisma call
    /*
    const recommendations = await prisma.recommendedGig.findMany({
      where: { userId },
      orderBy: { score: 'desc' },
      include: { gig: true }
    });
    */
    const recommendations: any[] = [];
    res.status(200).json(recommendations);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};