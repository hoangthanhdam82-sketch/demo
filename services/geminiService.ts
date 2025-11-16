import { GoogleGenAI, Type } from "@google/genai";
import { Question, Feedback } from "../types";

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

const questionSchema = {
  type: Type.OBJECT,
  properties: {
    questionText: { type: Type.STRING, description: "The question content. Should be formatted with Markdown and LaTeX if necessary." },
    options: {
      type: Type.ARRAY,
      description: "For multiple-choice: an array of possible answers. For true/false: an array with ['Đúng', 'Sai']. For short-answer: an empty array.",
      items: { type: Type.STRING },
    },
    correctAnswerIndex: {
      type: Type.INTEGER,
      description: "The 0-based index of the correct answer. For true/false, 0 is 'Đúng', 1 is 'Sai'. For short-answer, should be -1.",
    },
    explanation: {
      type: Type.STRING,
      description: "A detailed explanation for the correct answer.",
    },
    questionType: {
      type: Type.STRING,
      description: "The type of question. Can be 'multiple-choice', 'short-answer', or 'true/false'."
    }
  },
  required: ["questionText", "options", "correctAnswerIndex", "explanation", "questionType"],
};

export const generateQuestions = async (
  context: string,
  numQuestions: number,
  cognitiveLevel: string,
  difficulty: number
): Promise<Question[]> => {
  const prompt = `
    Based on the following context, generate a set of ${numQuestions} educational questions.
    Include a mix of question types: 'multiple-choice', 'true/false', and 'short-answer'.
    The questions should be tailored for a cognitive level of "${cognitiveLevel}" and a difficulty score of ${difficulty}/10.
    For 'true/false' questions, the 'options' array must contain exactly two strings: 'Đúng' and 'Sai', and the correctAnswerIndex must be 0 for 'Đúng' and 1 for 'Sai'.
    Format mathematical or scientific formulas using LaTeX.
    For multiple-choice questions, shuffle the options.

    Context:
    ---
    ${context}
    ---
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            questions: {
              type: Type.ARRAY,
              description: `An array of exactly ${numQuestions} questions.`,
              items: questionSchema,
            },
          },
          required: ["questions"],
        },
      },
    });

    const jsonText = response.text.trim();
    const result = JSON.parse(jsonText);
    return result.questions || [];
  } catch (error) {
    console.error("Error generating questions:", error);
    throw new Error("Tạo câu hỏi từ mô hình AI thất bại.");
  }
};


export const gradeAnswer = async (question: Question, answer: string): Promise<Feedback> => {
    const prompt = `
    You are an expert teacher. Your task is to grade a student's answer.
    Provide a score on a scale of 0 to 10.
    Offer constructive feedback explaining what was right and what was wrong.
    Give specific suggestions for improvement.
    
    Question: "${question.questionText}"
    ${question.questionType !== 'short-answer' ? `Correct Answer Explanation: "${question.explanation}"` : ''}

    Student's Answer: "${answer}"
    `;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        score: { type: Type.NUMBER, description: "A score from 0 to 10." },
                        feedback: { type: Type.STRING, description: "Constructive feedback on the student's answer." },
                        suggestions: { type: Type.STRING, description: "Actionable suggestions for improvement." }
                    },
                    required: ["score", "feedback", "suggestions"]
                }
            }
        });

        const jsonText = response.text.trim();
        return JSON.parse(jsonText);
    } catch (error) {
        console.error("Error grading answer:", error);
        throw new Error("Chấm câu trả lời bằng mô hình AI thất bại.");
    }
};

export const generateStudentTest = async (
    context: string, 
    subject: string, 
    grade: string,
    numQuestions: number,
    cognitiveLevel: string,
    questionTypes: string[]
): Promise<Question[]> => {
    const prompt = `
    Based on the following context, generate a ${numQuestions}-question diagnostic test for a student.
    The test is for the Subject "${subject}" at Grade Level "${grade}".
    The questions must be at the Cognitive Level of "${cognitiveLevel}".
    The test should only include questions of the following types: ${questionTypes.join(', ')}.
    For 'true/false' questions, the 'options' array must contain exactly two strings: 'Đúng' and 'Sai', and the correctAnswerIndex must be 0 for 'Đúng' and 1 for 'Sai'.

    Context:
    ---
    ${context}
    ---
    `;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        questions: {
                            type: Type.ARRAY,
                            description: `An array of ${numQuestions} questions.`,
                            items: questionSchema,
                        },
                    },
                    required: ["questions"],
                },
            },
        });
        const jsonText = response.text.trim();
        const result = JSON.parse(jsonText);
        return result.questions || [];
    } catch (error) {
        console.error("Error generating student test:", error);
        throw new Error("Tạo bài kiểm tra từ mô hình AI thất bại.");
    }
};