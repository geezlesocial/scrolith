
import { DemandForecast } from '../../types';

// Mock AI Service for Demand Forecasting
// In production, this would connect to an ML model or Gemini analysis on real data.

export const ForecastingService = {
    getForecasts: async (): Promise<DemandForecast[]> => {
        // Simulating API Latency
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve([
                    { 
                        skill: "AI Automation", 
                        growth_rate: 38, 
                        recommended_price_range: "$45–$85/hr", 
                        regions: ["US", "EU", "SEA"], 
                        confidence: 0.92, 
                        timeframe: 'Short-Term', 
                        category: 'AI Services' 
                    },
                    { 
                        skill: "Rust Development", 
                        growth_rate: 25, 
                        recommended_price_range: "$60–$100/hr", 
                        regions: ["US", "EU"], 
                        confidence: 0.85, 
                        timeframe: 'Mid-Term', 
                        category: 'Development' 
                    },
                    { 
                        skill: "Video Generation", 
                        growth_rate: 45, 
                        recommended_price_range: "$50–$90/hr", 
                        regions: ["Global"], 
                        confidence: 0.88, 
                        timeframe: 'Short-Term', 
                        category: 'Video' 
                    },
                    { 
                        skill: "Sustainability Consulting", 
                        growth_rate: 15, 
                        recommended_price_range: "$80–$150/hr", 
                        regions: ["EU", "UK"], 
                        confidence: 0.75, 
                        timeframe: 'Long-Term', 
                        category: 'Business' 
                    },
                    { 
                        skill: "Web3 Security", 
                        growth_rate: 12, 
                        recommended_price_range: "$100–$200/hr", 
                        regions: ["US", "SG"], 
                        confidence: 0.70, 
                        timeframe: 'Mid-Term', 
                        category: 'Blockchain' 
                    },
                    {
                        skill: "React Native",
                        growth_rate: 8,
                        recommended_price_range: "$40-$70/hr",
                        regions: ["Global"],
                        confidence: 0.95,
                        timeframe: "Short-Term",
                        category: "Mobile Dev"
                    }
                ]);
            }, 600);
        });
    }
};
