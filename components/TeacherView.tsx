import React, { useState, useCallback, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Question, COGNITIVE_LEVELS } from '../types';
import { generateQuestions } from '../services/geminiService';
import Spinner from './Spinner';
import ContentRenderer from './QuestionCard';

// Type declarations for window-injected libraries
declare const mammoth: any;
declare const Tesseract: any;
declare const Cropper: any;

const TeacherView: React.FC = () => {
  const [context, setContext] = useState<string>('');
  const [numQuestions, setNumQuestions] = useState<number>(5);
  const [cognitiveLevel, setCognitiveLevel] = useState<string>(COGNITIVE_LEVELS[2]);
  const [difficulty, setDifficulty] = useState<number>(5);
  
  const [generatedQuestions, setGeneratedQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

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
                setContext(result.value);
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
        setContext(prev => prev ? `${prev}\n\n${text}` : text);
        await worker.terminate();
    } catch (err) {
        setError("Nhận dạng văn bản thất bại.");
    } finally {
        setIsProcessingInput(false);
        setProcessingStatus('');
    }
  };

  const handleGenerate = useCallback(async () => {
    if (!context.trim()) {
      setError('Vui lòng cung cấp ngữ liệu.');
      return;
    }
    setIsLoading(true);
    setError(null);
    setGeneratedQuestions([]);
    try {
      const questions = await generateQuestions(context, numQuestions, cognitiveLevel, difficulty);
      setGeneratedQuestions(questions);
    } catch (err: any) {
      setError(err.message || 'Đã xảy ra lỗi không xác định.');
    } finally {
      setIsLoading(false);
    }
  }, [context, numQuestions, cognitiveLevel, difficulty]);
  
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Modals */}
      <CropperModal />
      <CameraModal />

      {/* Left Column: Controls */}
      <div className="flex flex-col space-y-6">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg">
          <h2 className="text-xl font-bold mb-4 text-slate-900 dark:text-white">1. Cung cấp Ngữ cảnh</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
              <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".docx" hidden />
              <input type="file" ref={imageInputRef} onChange={handleFileChange} accept="image/*" hidden />
              <button onClick={() => fileInputRef.current?.click()} className="p-2 text-sm bg-blue-100 text-blue-800 rounded-lg hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-200 dark:hover:bg-blue-800">Tải tệp .docx</button>
              <button onClick={() => imageInputRef.current?.click()} className="p-2 text-sm bg-green-100 text-green-800 rounded-lg hover:bg-green-200 dark:bg-green-900 dark:text-green-200 dark:hover:bg-green-800">Tải ảnh</button>
              <button onClick={() => setShowCamera(true)} className="p-2 text-sm bg-purple-100 text-purple-800 rounded-lg hover:bg-purple-200 dark:bg-purple-900 dark:text-purple-200 dark:hover:bg-purple-800">Dùng Camera</button>
          </div>
          {isProcessingInput && (
              <div className="flex items-center space-x-2 text-sm text-slate-500 dark:text-slate-400">
                  <Spinner size="sm" />
                  <span>{processingStatus || 'Đang xử lý...'}</span>
              </div>
          )}
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="Dán nội dung vào đây, hoặc sử dụng các tùy chọn ở trên..."
            className="w-full h-64 p-3 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
          />
        </div>

        <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg">
          <h2 className="text-xl font-bold mb-4 text-slate-900 dark:text-white">2. Thiết lập Tham số</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Số lượng câu hỏi: {numQuestions}</label>
              <input type="range" min="1" max="15" value={numQuestions} onChange={(e) => setNumQuestions(Number(e.target.value))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-700" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Cấp độ Nhận thức</label>
              <select value={cognitiveLevel} onChange={(e) => setCognitiveLevel(e.target.value)} className="w-full mt-1 p-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-700 focus:ring-blue-500 focus:border-blue-500">
                {COGNITIVE_LEVELS.map(level => <option key={level} value={level}>{level}</option>)}
              </select>
            </div>
             <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Độ khó: {difficulty}/10</label>
              <input type="range" min="1" max="10" value={difficulty} onChange={(e) => setDifficulty(Number(e.target.value))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-700" />
            </div>
          </div>
        </div>

        <button
          onClick={handleGenerate}
          disabled={isLoading || !context || isProcessingInput}
          className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-transform transform hover:scale-105 flex items-center justify-center"
        >
          {isLoading ? <Spinner size="sm" /> : 'Tạo Câu hỏi'}
        </button>
      </div>

      {/* Right Column: Output */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg">
        <h2 className="text-xl font-bold mb-4 text-slate-900 dark:text-white">3. Đề bài đã tạo</h2>
        {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">{error}</div>}
        
        {isLoading && (
          <div className="flex flex-col items-center justify-center h-full space-y-4">
            <Spinner size="lg"/>
            <p className="text-slate-500 dark:text-slate-400">AI đang tạo câu hỏi cho bạn...</p>
          </div>
        )}

        {!isLoading && generatedQuestions.length === 0 && (
          <div className="flex items-center justify-center h-full text-center text-slate-500 dark:text-slate-400">
            <p>Câu hỏi bạn tạo sẽ xuất hiện ở đây.</p>
          </div>
        )}

        {generatedQuestions.length > 0 && (
          <div className="space-y-6">
            {generatedQuestions.map((q, index) => (
              <div key={index} className="border-b border-slate-200 dark:border-slate-700 pb-4">
                <div className="font-semibold mb-2">Câu hỏi {index + 1}</div>
                <ContentRenderer content={q.questionText} />
                {q.questionType === 'multiple-choice' && (
                  <ul className="mt-4 space-y-2">
                    {q.options.map((option, i) => (
                      <li key={i} className={`p-3 rounded-lg border ${i === q.correctAnswerIndex ? 'bg-green-100 dark:bg-green-900 border-green-400' : 'bg-slate-50 dark:bg-slate-700 border-slate-300 dark:border-slate-600'}`}>
                        <ContentRenderer content={option} />
                      </li>
                    ))}
                  </ul>
                )}
                 <div className="mt-4 p-3 bg-blue-50 dark:bg-slate-700 rounded-lg">
                    <p className="font-bold text-sm">Giải thích:</p>
                    <ContentRenderer content={q.explanation} />
                 </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TeacherView;