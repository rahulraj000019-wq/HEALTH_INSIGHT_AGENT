export interface HealthReport {
  id: string;
  userId: string;
  fileName: string;
  extractedText: string;
  analysis: AnalysisResult;
  createdAt: string;
}

export interface AnalysisResult {
  summary: string;
  parameters: {
    name: string;
    value: string;
    unit: string;
    range: string;
    status: 'normal' | 'abnormal' | 'concerning' | 'unknown';
    explanation: string;
  }[];
  recommendations: string[];
  disclaimer: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  createdAt: string;
}
