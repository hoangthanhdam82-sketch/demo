
export interface Question {
  questionText: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
  questionType: 'multiple-choice' | 'short-answer' | 'true/false';
}

export interface Feedback {
  score: number;
  feedback: string;
  suggestions: string;
}

export const COGNITIVE_LEVELS = [
  "Nhận biết",
  "Thông hiểu",
  "Vận dụng",
  "Phân tích",
  "Đánh giá",
  "Sáng tạo"
];

export const STUDENT_DIFFICULTY_LEVELS = ["Nhận biết", "Thông hiểu", "Vận dụng"];
