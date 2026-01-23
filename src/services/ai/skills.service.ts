
import { SkillCertification, TalentCreditScore, SkillLevel } from "../../types";

const CERTS_KEY = 'atmyworks_skill_certs';

export const SkillsService = {
    // --- SKILL CERTIFICATION ---

    getCertifications: async (userId: string): Promise<SkillCertification[]> => {
        return new Promise(resolve => {
            try {
                const stored = localStorage.getItem(CERTS_KEY);
                const allCerts: SkillCertification[] = stored ? JSON.parse(stored) : [];
                resolve(allCerts.filter(c => c.user_id === userId));
            } catch {
                resolve([]);
            }
        });
    },

    generateAssessment: async (skill: string, level: SkillLevel) => {
        // In production, call LLM to generate questions
        return new Promise(resolve => {
            setTimeout(() => {
                resolve({
                    id: Math.random().toString(36).substr(2, 9),
                    skill,
                    level,
                    questions: [
                        { id: 1, text: `What is a key concept in ${skill} at the ${level} level?`, type: 'multiple_choice', options: ['Concept A', 'Concept B', 'Concept C'] },
                        { id: 2, text: `Explain how you would handle an edge case in ${skill}.`, type: 'text' },
                        { id: 3, text: `Identify the error in this ${skill} snippet.`, type: 'code_review' }
                    ]
                });
            }, 1000);
        });
    },

    submitAssessment: async (userId: string, skill: string, level: SkillLevel, answers: any): Promise<{ passed: boolean, certification?: SkillCertification, feedback?: string }> => {
        // Simulate AI Grading
        return new Promise(resolve => {
            setTimeout(() => {
                const passed = Math.random() > 0.3; // 70% pass rate simulation
                const score = Math.floor(Math.random() * (100 - 70) + 70); // Random score 70-100 if passed

                if (passed) {
                    const cert: SkillCertification = {
                        id: `cert-${Date.now()}`,
                        user_id: userId,
                        skill,
                        level,
                        score,
                        confidence: 0.95,
                        expires_at: new Date(Date.now() + 31536000000).toISOString(), // 1 year
                        verified_by_ai: true,
                        issued_at: new Date().toISOString(),
                        badge_url: 'https://cdn-icons-png.flaticon.com/512/6423/6423870.png'
                    };

                    // Persist
                    const stored = localStorage.getItem(CERTS_KEY);
                    const allCerts = stored ? JSON.parse(stored) : [];
                    allCerts.push(cert);
                    localStorage.setItem(CERTS_KEY, JSON.stringify(allCerts));

                    resolve({ passed: true, certification: cert });
                } else {
                    resolve({ passed: false, feedback: "Your answers demonstrated gaps in advanced error handling." });
                }
            }, 1500);
        });
    },

    // --- TALENT CREDIT SCORING ---

    getTalentScore: async (userId: string): Promise<TalentCreditScore> => {
        // Mock calculation based on user behavior
        return new Promise(resolve => {
            setTimeout(() => {
                const score = 750 + Math.floor(Math.random() * 100);
                resolve({
                    user_id: userId,
                    score,
                    risk_level: score > 700 ? 'Low' : 'Medium',
                    recommended_limit: score * 10,
                    confidence: 0.91,
                    last_updated: new Date().toISOString()
                });
            }, 500);
        });
    }
};
