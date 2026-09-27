// Shapes used by the poster page. They describe data. They do not draw anything.

export type Template = {
  id: string;
  title: string;
  occasionType: string;
  layoutConfig?: { photoSlots?: number; colors?: string[] };
};

export type PosterRow = {
  id: string;
  status: string;
  generatedImageUrl?: string;
  jpgUrl?: string;
  pdfUrl?: string;
  regenerateCount?: number;
  clean?: boolean;
  formData?: Record<string, string>;
};

export type ReviewRow = {
  id: string;
  status: string;
  blocked?: boolean;
  flagged?: boolean;
  clean?: boolean;
  formData?: { headline?: string; name?: string };
};

export type AdminTemplate = {
  id: string;
  title: string;
  occasionType: string;
  isActive: boolean;
};

// Newest Gemini attempt. tokensUsed stays null when Gemini did not report a count.
export type CostLog = {
  geminiPromptUsed: string;
  tokensUsed: number | null;
  latencyMs: number;
  success: boolean;
};
