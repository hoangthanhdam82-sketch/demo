
import React, { useState } from 'react';
import TeacherView from './components/TeacherView';
import StudentView from './components/StudentView';

type View = 'teacher' | 'student';

const App: React.FC = () => {
  const [view, setView] = useState<View>('teacher');

  const renderView = () => {
    switch (view) {
      case 'teacher':
        return <TeacherView />;
      case 'student':
        return <StudentView />;
      default:
        return <TeacherView />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-sans">
      <header className="bg-white dark:bg-slate-800 shadow-md">
        <nav className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <span className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-teal-400">
                EduMatrix AI
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setView('teacher')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors duration-200 ${
                  view === 'teacher'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-blue-100 dark:hover:bg-slate-600'
                }`}
              >
                Vai trò Giáo viên
              </button>
              <button
                onClick={() => setView('student')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors duration-200 ${
                  view === 'student'
                    ? 'bg-teal-500 text-white'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-teal-100 dark:hover:bg-slate-600'
                }`}
              >
                Vai trò Học sinh
              </button>
            </div>
          </div>
        </nav>
      </header>
      <main className="container mx-auto p-4 sm:p-6 lg:p-8">
        {renderView()}
      </main>
    </div>
  );
};

export default App;
