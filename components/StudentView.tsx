import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Question, Feedback, STUDENT_DIFFICULTY_LEVELS } from '../types';
import { generateStudentTest, gradeAnswer } from '../services/geminiService';
import Spinner from './Spinner';
import ContentRenderer from './QuestionCard';

// Type declarations for window-injected libraries
declare const mammoth: any;
declare const Tesseract: any;
declare const Cropper: any;

type StudentState = 'setup' | 'testing' | 'results';
type GradedResult = { question: Question, answer: string, feedback: Feedback };
type QuestionType = 'multiple-choice' | 'short-answer' | 'true/false';

const QUESTION_TYPE_OPTIONS: { id: QuestionType, label: string }[] = [
    { id: 'multiple-choice', label: 'Trắc nghiệm' },
    { id: 'true/false', label: 'Đúng/Sai' },
    { id: 'short-answer', label: 'Trả lời ngắn' },
];

const StudentView: React.FC = () => {
  const [studentState, setStudentState] = useState<StudentState>('setup');
  const [studentContext, setStudentContext] = useState('');
  const [subject, setSubject] = useState('');
  const [grade, setGrade] = useState('');
  
  // Customization state
  const [numQuestions, setNumQuestions] = useState(5);
  const [cognitiveLevel, setCognitiveLevel] = useState<string>(STUDENT_DIFFICULTY_LEVELS[1]);
  const [selectedQuestionTypes, setSelectedQuestionTypes] = useState<QuestionType[]>(['multiple-choice', 'true/false', 'short-answer']);

  const [test, setTest] = useState<Question[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGrading, setIsGrading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [gradedResults, setGradedResults] = useState<GradedResult[]>([]);
  const [currentFeedback, setCurrentFeedback] = useState<Feedback | null>(null);

  // State for advanced input methods
  const [isProcessingInput, setIsProcessingInput] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cropperRef = useRef<any>(null);
  
  useEffect(() => {
    if (imageToCrop && imageRef.current) {
        cropperRef.current = new Cropper(imageRef.current, {
            aspectRatio: 0,
            viewMode: 1,
            background: false,
        });
    }
    return () => {
      if (cropperRef.current) {
        cropperRef.current.destroy();
        cropperRef.current = null;
      }
    };
  }, [imageToCrop]);
  
  useEffect(() => {
    if(showCamera && videoRef.current) {
      navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        })
        .catch(err => {
          setError("Không thể truy cập camera. Vui lòng cấp quyền.");
          setShowCamera(false);
        });
    } else {
        if(videoRef.current && videoRef.current.srcObject){
            (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
        }
    }
  }, [showCamera])

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessingInput(true);
    setError(null);

    if (file.name.endsWith('.docx')) {
        setProcessingStatus('Đang xử lý tệp .docx...');
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const arrayBuffer = e.target?.result;
                const result = await mammoth.extractRawText({ arrayBuffer });
                setStudentContext(result.value);
            } catch (err) {
                setError('Không thể đọc tệp .docx.');
            } finally {
                setIsProcessingInput(false);
            }
        };
        reader.readAsArrayBuffer(file);
    } else if (file.type.startsWith('image/')) {
        setProcessingStatus('Đang tải ảnh lên...');
        const reader = new FileReader();
        reader.onload = (e) => {
            setImageToCrop(e.target?.result as string);
            setIsProcessingInput(false);
        };
        reader.readAsDataURL(file);
    }
    event.target.value = ''; // Reset file input
  };
  
  const handleCapture = () => {
    const canvas = document.createElement('canvas');
    if (videoRef.current) {
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        setImageToCrop(canvas.toDataURL('image/jpeg'));
    }
    setShowCamera(false);
  }

  const handleCropAndOCR = async () => {
    if (!cropperRef.current) return;
    const croppedCanvas = cropperRef.current.getCroppedCanvas();
    const croppedImage = croppedCanvas.toDataURL('image/png');

    setImageToCrop(null); // Close the modal
    setIsProcessingInput(true);

    try {
        const worker = await Tesseract.createWorker({
            logger: (m: any) => setProcessingStatus(`[${m.status}] ${m.progress ? Math.round(m.progress * 100) + '%' : ''}`),
        });
        await worker.loadLanguage('vie+eng');
        await worker.initialize('vie+eng');
        const { data: { text } } = await worker.recognize(croppedImage);
        setStudentContext(prev => prev ? `${prev}\n\n${text}` : text);
        await worker.terminate();
    } catch (err) {
        setError("Nhận dạng văn bản thất bại.");
    } finally {
        setIsProcessingInput(false);
        setProcessingStatus('');
    }
  };
  
  const handleQuestionTypeChange = (type: QuestionType) => {
    setSelectedQuestionTypes(prev => {
        const newSelection = prev.includes(type)
            ? prev.filter(t => t !== type)
            : [...prev, type];
        // Ensure at least one type is selected
        return newSelection.length > 0 ? newSelection : prev;
    });
  };

  const startTest = async () => {
    if (!studentContext || !subject || !grade) {
        setError('Vui lòng cung cấp ngữ liệu, môn học và lớp để bắt đầu.');
        return;
    }
    if (selectedQuestionTypes.length === 0) {
        setError('Vui lòng chọn ít nhất một dạng câu hỏi.');
        return;
    }
    setIsGenerating(true);
    setError(null);
    try {
        const questions = await generateStudentTest(studentContext, subject, grade, numQuestions, cognitiveLevel, selectedQuestionTypes);
        if (questions.length > 0) {
            setTest(questions);
            setCurrentAnswer('');
            setGradedResults([]);
            setCurrentFeedback(null);
            setCurrentQuestionIndex(0);
            setStudentState('testing');
        } else {
            setError("AI không thể tạo bài kiểm tra. Vui lòng thử lại với một chủ đề khác.");
            setStudentState('setup');
        }
    } catch (err: any) {
        setError(err.message);
    } finally {
        setIsGenerating(false);
    }
  };

  const handleSubmitAnswer = async () => {
    setIsGrading(true);
    setError(null);
    try {
        const currentQuestion = test[currentQuestionIndex];
        const feedback = await gradeAnswer(currentQuestion, currentAnswer);
        setCurrentFeedback(feedback);
        setGradedResults(prev => [...prev, { question: currentQuestion, answer: currentAnswer, feedback }]);
    } catch (err: any) {
        setError(err.message);
    } finally {
        setIsGrading(false);
    }
  };

  const handleNextQuestion = () => {
    if (currentQuestionIndex < test.length - 1) {
        setCurrentQuestionIndex(prev => prev + 1);
        setCurrentAnswer('');
        setCurrentFeedback(null);
    } else {
        setStudentState('results');
    }
  };

  const resetChallenge = () => {
    setStudentState('setup');
    setStudentContext('');
    setSubject('');
    setGrade('');
    setTest([]);
    setCurrentQuestionIndex(0);
    setCurrentAnswer('');
    setGradedResults([]);
    setCurrentFeedback(null);
    setError(null);
    setNumQuestions(5);
    setCognitiveLevel(STUDENT_DIFFICULTY_LEVELS[1]);
    setSelectedQuestionTypes(['multiple-choice', 'true/false', 'short-answer']);
    setIsProcessingInput(false);
    setProcessingStatus('');
  }

  const getQuestionTypeVietnamese = (type: string) => {
    switch (type) {
        case 'multiple-choice': return 'Trắc nghiệm';
        case 'short-answer': return 'Trả lời ngắn';
        case 'true/false': return 'Đúng/Sai';
        default: return type;
    }
  }

  const CropperModal = () => imageToCrop && ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-slate-800 p-4 rounded-lg max-w-4xl w-full">
            <h3 className="text-lg font-bold mb-4">Cắt ảnh để tập trung vào nội dung</h3>
            <div className="max-h-[70vh]">
                <img ref={imageRef} src={imageToCrop} alt="Nội dung để cắt" style={{ maxWidth: '100%' }}/>
            </div>
            <div className="flex justify-end space-x-2 mt-4">
                <button onClick={() => setImageToCrop(null)} className="px-4 py-2 bg-slate-500 text-white rounded-lg">Hủy</button>
                <button onClick={handleCropAndOCR} className="px-4 py-2 bg-blue-600 text-white rounded-lg">Xác nhận và Trích xuất Văn bản</button>
            </div>
        </div>
    </div>,
    document.getElementById('modal-root')!
  );
  
  const CameraModal = () => showCamera && ReactDOM.createPortal(
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 p-4 rounded-lg w-full max-w-2xl">
              <h3 className="text-lg font-bold mb-4">Sử dụng Camera</h3>
              <video ref={videoRef} autoPlay playsInline className="w-full h-auto rounded"></video>
              <div className="flex justify-end space-x-2 mt-4">
                  <button onClick={() => setShowCamera(false)} className="px-4 py-2 bg-slate-500 text-white rounded-lg">Hủy</button>
                  <button onClick={handleCapture} className="px-4 py-2 bg-blue-600 text-white rounded-lg">Chụp ảnh</button>
              </div>
          </div>
      </div>,
      document.getElementById('modal-root')!
  );

  const renderSetup = () => (
    <div className="max-w-xl mx-auto bg-white dark:bg-slate-800 p-8 rounded-lg shadow-lg">
      <CropperModal />
      <CameraModal />
      <h2 className="text-2xl font-bold text-center mb-2">Thử thách Cá nhân hóa</h2>
      <p className="text-center text-slate-500 dark:text-slate-400 mb-6">Cung cấp tài liệu bạn muốn học, AI sẽ tạo bài kiểm tra riêng cho bạn.</p>
      
      {/* Input Methods */}
       <div className="bg-white dark:bg-slate-800 rounded-lg">
          <h3 className="text-lg font-semibold mb-3 text-slate-900 dark:text-white">1. Cung cấp Ngữ cảnh</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
              <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".docx" hidden />
              <input type="file" ref={imageInputRef} onChange={handleFileChange} accept="image/*" hidden />
              <button onClick={() => fileInputRef.current?.click()} className="p-2 text-sm bg-blue-100 text-blue-800 rounded-lg hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-200 dark:hover:bg-blue-800">Tải tệp .docx</button>
              <button onClick={() => imageInputRef.current?.click()} className="p-2 text-sm bg-green-100 text-green-800 rounded-lg hover:bg-green-200 dark:bg-green-900 dark:text-green-200 dark:hover:bg-green-800">Tải ảnh</button>
              <button onClick={() => setShowCamera(true)} className="p-2 text-sm bg-purple-100 text-purple-800 rounded-lg hover:bg-purple-200 dark:bg-purple-900 dark:text-purple-200 dark:hover:bg-purple-800">Dùng Camera</button>
          </div>
          {isProcessingInput && (
              <div className="flex items-center space-x-2 text-sm text-slate-500 dark:text-slate-400 mb-3">
                  <Spinner size="sm" />
                  <span>{processingStatus || 'Đang xử lý...'}</span>
              </div>
          )}
          <textarea
            value={studentContext}
            onChange={(e) => setStudentContext(e.target.value)}
            placeholder="Dán nội dung vào đây, hoặc sử dụng các tùy chọn ở trên..."
            className="w-full h-40 p-3 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
          />
        </div>
      
      {/* Basic Info */}
      <div className="space-y-4 mt-4">
        <input type="text" placeholder="Môn học (ví dụ: Sinh học, Toán)" value={subject} onChange={e => setSubject(e.target.value)} className="w-full p-3 border rounded-md bg-slate-50 dark:bg-slate-700 border-slate-300 dark:border-slate-600"/>
        <input type="text" placeholder="Lớp (ví dụ: Lớp 9)" value={grade} onChange={e => setGrade(e.target.value)} className="w-full p-3 border rounded-md bg-slate-50 dark:bg-slate-700 border-slate-300 dark:border-slate-600"/>
      </div>
      
      {/* Customization Section */}
      <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-semibold text-center mb-4">2. Tùy chỉnh Bài kiểm tra</h3>
        <div className="space-y-4">
            {/* Question Type Selection */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Dạng câu hỏi</label>
              <div className="grid grid-cols-3 gap-2">
                {QUESTION_TYPE_OPTIONS.map(({id, label}) => (
                    <button 
                        key={id}
                        onClick={() => handleQuestionTypeChange(id)}
                        className={`p-2 text-sm rounded-lg border-2 transition-colors ${selectedQuestionTypes.includes(id) ? 'bg-teal-500 border-teal-500 text-white' : 'bg-transparent border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                    >
                        {label}
                    </button>
                ))}
              </div>
            </div>

            {/* Number of Questions Slider */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Số lượng câu hỏi: {numQuestions}</label>
              <input type="range" min="1" max="15" value={numQuestions} onChange={(e) => setNumQuestions(Number(e.target.value))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-700" />
            </div>
            
            {/* Difficulty Level Selection */}
             <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Mức độ khó</label>
              <div className="grid grid-cols-3 gap-2">
                {STUDENT_DIFFICULTY_LEVELS.map((level) => (
                    <button 
                        key={level}
                        onClick={() => setCognitiveLevel(level)}
                        className={`p-2 text-sm rounded-lg border-2 transition-colors ${cognitiveLevel === level ? 'bg-teal-500 border-teal-500 text-white' : 'bg-transparent border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                    >
                        {level}
                    </button>
                ))}
              </div>
            </div>
        </div>
      </div>

      {error && <p className="text-red-500 mt-4 text-center">{error}</p>}
      <button onClick={startTest} disabled={isGenerating || isProcessingInput} className="w-full mt-6 bg-teal-500 text-white font-bold py-3 rounded-lg hover:bg-teal-600 disabled:bg-slate-400 flex items-center justify-center">
        {isGenerating ? <Spinner size="sm" /> : 'Bắt đầu Thử thách'}
      </button>
    </div>
  );

  const renderAnswerInput = (question: Question) => {
    const isSubmitted = !!currentFeedback;
    switch(question.questionType) {
        case 'multiple-choice':
            return (
                <div className="space-y-3">
                    {question.options.map((option, index) => (
                         <button 
                            key={index} 
                            onClick={() => setCurrentAnswer(option)}
                            disabled={isSubmitted}
                            className={`w-full text-left p-4 border rounded-lg transition-colors ${currentAnswer === option ? 'bg-teal-100 dark:bg-teal-900 border-teal-500' : 'bg-slate-50 dark:bg-slate-700 border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600'} disabled:cursor-not-allowed disabled:opacity-70`}>
                            <ContentRenderer content={option} />
                        </button>
                    ))}
                </div>
            );
        case 'true/false':
            return (
                <div className="flex space-x-4">
                    {question.options.map((option, index) => (
                        <button
                            key={index}
                            onClick={() => setCurrentAnswer(option)}
                            disabled={isSubmitted}
                            className={`w-full p-4 border rounded-lg transition-colors text-lg font-bold ${currentAnswer === option ? 'bg-teal-100 dark:bg-teal-900 border-teal-500' : 'bg-slate-50 dark:bg-slate-700 border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600'} disabled:cursor-not-allowed disabled:opacity-70`}
                        >
                            {option}
                        </button>
                    ))}
                </div>
            );
        case 'short-answer':
            return (
                 <textarea 
                    value={currentAnswer}
                    onChange={(e) => setCurrentAnswer(e.target.value)}
                    placeholder="Nhập câu trả lời của bạn vào đây..." 
                    disabled={isSubmitted}
                    className="w-full h-40 p-3 border rounded-md bg-slate-50 dark:bg-slate-700 border-slate-300 dark:border-slate-600 disabled:cursor-not-allowed disabled:bg-slate-100 dark:disabled:bg-slate-800" 
                />
            );
    }
  }

  const renderFeedbackSection = () => {
    if (!currentFeedback) return null;
    const question = test[currentQuestionIndex];
    const isCorrect = question.questionType === 'multiple-choice' || question.questionType === 'true/false'
        ? currentAnswer === question.options[question.correctAnswerIndex]
        : currentFeedback.score > 8; // Heuristic for short answer

    return (
        <div className="mt-6 border-t-2 border-slate-200 dark:border-slate-700 pt-6">
            <h3 className={`text-2xl font-bold mb-4 ${isCorrect ? 'text-green-500' : 'text-red-500'}`}>
                {isCorrect ? 'Chính xác!' : 'Cần xem lại!'}
            </h3>
            
            <div className="mb-4">
                <p className="font-semibold text-sm">Đáp án đúng:</p>
                {question.questionType === 'multiple-choice' || question.questionType === 'true/false' ? (
                    <div className="p-3 rounded-lg border border-green-400 bg-green-50 dark:bg-green-900">
                        <ContentRenderer content={question.options[question.correctAnswerIndex]} />
                    </div>
                ) : (
                    <div className="p-3 rounded-lg border border-green-400 bg-green-50 dark:bg-green-900">
                         <ContentRenderer content={question.explanation} />
                    </div>
                )}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center bg-blue-100 dark:bg-blue-900 p-4 rounded-lg">
                <div className="text-sm text-blue-800 dark:text-blue-200">Điểm</div>
                <div className="text-3xl font-bold text-blue-600 dark:text-blue-300">{currentFeedback.score}<span className="text-lg">/10</span></div>
              </div>
              <div className="md:col-span-2 bg-slate-100 dark:bg-slate-700 p-4 rounded-lg">
                <p className="font-semibold text-slate-800 dark:text-slate-200">Nhận xét:</p>
                <p className="text-sm text-slate-600 dark:text-slate-300">{currentFeedback.feedback}</p>
                <p className="mt-2 font-semibold text-slate-800 dark:text-slate-200">Gợi ý:</p>
                <p className="text-sm text-slate-600 dark:text-slate-300">{currentFeedback.suggestions}</p>
              </div>
            </div>

            <div className="mt-6 text-center">
                 <button onClick={handleNextQuestion} className="bg-blue-600 text-white font-bold py-2 px-8 rounded-lg hover:bg-blue-700">
                    {currentQuestionIndex < test.length - 1 ? 'Câu tiếp theo' : 'Xem kết quả tổng kết'}
                </button>
            </div>
        </div>
    );
  }

  const renderTest = () => {
    const question = test[currentQuestionIndex];
    if (!question) return null;

    return (
        <div className="max-w-3xl mx-auto bg-white dark:bg-slate-800 p-8 rounded-lg shadow-lg">
            <div className="flex justify-between items-center mb-1">
              <h2 className="text-xl font-bold">Câu hỏi {currentQuestionIndex + 1} trên {test.length}</h2>
              <span className="text-sm font-medium text-teal-600 dark:text-teal-400 bg-teal-100 dark:bg-teal-900 px-3 py-1 rounded-full capitalize">{getQuestionTypeVietnamese(question.questionType)}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 mb-4">
                <div className="bg-teal-500 h-2.5 rounded-full" style={{ width: `${((currentQuestionIndex + 1) / test.length) * 100}%` }}></div>
            </div>
            <ContentRenderer content={question.questionText} />

            <div className="mt-6">
                {renderAnswerInput(question)}
            </div>

            {!currentFeedback && (
                 <div className="mt-8 flex justify-center">
                    <button onClick={handleSubmitAnswer} disabled={isGrading || !currentAnswer} className="bg-green-600 text-white font-bold py-3 px-8 rounded-lg hover:bg-green-700 disabled:bg-slate-400 flex items-center justify-center min-w-[150px]">
                        {isGrading ? <Spinner size="sm"/> : 'Nộp bài'}
                    </button>
                </div>
            )}
            {error && <p className="text-red-500 mt-4 text-center">{error}</p>}
            
            {renderFeedbackSection()}
        </div>
    );
  };
  
  const renderResults = () => {
     const totalScore = gradedResults.reduce((acc, result) => acc + result.feedback.score, 0);
     const averageScore = (totalScore / gradedResults.length).toFixed(1);

    return (
    <div className="max-w-3xl mx-auto">
        <div className="bg-white dark:bg-slate-800 p-8 rounded-lg shadow-lg text-center mb-8">
            <h2 className="text-3xl font-bold mb-2">Hoàn thành Thử thách!</h2>
            <p className="text-slate-500 dark:text-slate-400 mb-4">Đây là bản tổng kết phần thể hiện của bạn.</p>
            <div className="text-5xl font-bold text-teal-500">{averageScore}<span className="text-2xl text-slate-500 dark:text-slate-400">/10</span></div>
            <p className="text-slate-600 dark:text-slate-300 font-semibold">Điểm trung bình</p>
        </div>
        <div className="space-y-6">
            {gradedResults.map((result, index) => (
                <div key={index} className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg">
                    <div className="border-b dark:border-slate-700 pb-4 mb-4">
                        <p className="font-bold">Câu {index + 1}:</p>
                        <ContentRenderer content={result.question.questionText} />
                        
                        <div className="mt-4">
                          <p className="font-semibold text-sm">Câu trả lời của bạn:</p>
                           <div className="p-3 rounded-lg border border-yellow-500 bg-yellow-50 dark:bg-yellow-900">
                              <ContentRenderer content={result.answer || "Chưa có câu trả lời."} />
                          </div>
                        </div>

                        <div className="mt-4">
                           <p className="font-semibold text-sm">Đáp án đúng:</p>
                           <div className="p-3 rounded-lg border border-green-400 bg-green-50 dark:bg-green-900">
                               <ContentRenderer content={
                                   result.question.questionType === 'short-answer' 
                                   ? result.question.explanation 
                                   : result.question.options[result.question.correctAnswerIndex]
                               }/>
                           </div>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="text-center bg-blue-100 dark:bg-blue-900 p-4 rounded-lg">
                        <div className="text-sm text-blue-800 dark:text-blue-200">Điểm</div>
                        <div className="text-3xl font-bold text-blue-600 dark:text-blue-300">{result.feedback.score}<span className="text-lg">/10</span></div>
                      </div>
                      <div className="md:col-span-2 bg-slate-100 dark:bg-slate-700 p-4 rounded-lg">
                        <p className="font-semibold text-slate-800 dark:text-slate-200">Nhận xét:</p>
                        <p className="text-sm text-slate-600 dark:text-slate-300">{result.feedback.feedback}</p>
                      </div>
                    </div>
                </div>
            ))}
        </div>
        <div className="text-center mt-8">
          <button onClick={resetChallenge} className="bg-slate-600 text-white font-bold py-3 px-8 rounded-lg hover:bg-slate-700">Làm thử thách khác</button>
        </div>
    </div>
    )
  };

  switch (studentState) {
    case 'setup':
      return renderSetup();
    case 'testing':
      return renderTest();
    case 'results':
      return renderResults();
    default:
      return null;
  }
};

export default StudentView;