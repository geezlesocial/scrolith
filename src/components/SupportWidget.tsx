
import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Headphones, Sparkles, RefreshCw, Paperclip, FileText, Image as ImageIcon, ChevronRight, Mic, MicOff } from 'lucide-react';
import { getSupportResponse, loadChatFlow, ChatOption, ChatFlow } from '../services/ai';
import { Attachment } from '../types';
import { Link, useNavigate } from 'react-router-dom';

type Sender = 'user' | 'agent' | 'system';
type UserRole = 'Freelancer' | 'Employer' | null;

interface UIMessage {
  sender: Sender;
  text?: string;
  timestamp: Date;
  attachments?: Attachment[];
}

// Add simple type for Web Speech API
interface IWindow extends Window {
  webkitSpeechRecognition: any;
  SpeechRecognition: any;
}

const SupportWidget: React.FC = () => {
  const [chatFlow, setChatFlow] = useState<ChatFlow | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [role, setRole] = useState<UserRole>(null);
  
  // Chat State
  const [chatHistory, setChatHistory] = useState<UIMessage[]>([]);
  const [currentOptions, setCurrentOptions] = useState<ChatOption[]>([]);
  const [isFlowLoaded, setIsFlowLoaded] = useState(false);
  
  // Input State
  const [message, setMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  // Voice State
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Load Configuration on Mount
  useEffect(() => {
    const initChat = async () => {
      try {
        const flow = await loadChatFlow();
        setChatFlow(flow);
        setIsFlowLoaded(true);
        setCurrentOptions(flow.initial_prompt.options);
        
        // Set initial greeting
        setChatHistory([
          { 
            sender: 'agent', 
            text: flow.initial_prompt.text, 
            timestamp: new Date() 
          }
        ]);
      } catch (error) {
        console.error("Failed to initialize chat flow", error);
      }
    };
    initChat();
  }, []);

  // Initialize Speech Recognition
  useEffect(() => {
    const windowObj = window as unknown as IWindow;
    const SpeechRecognition = windowObj.SpeechRecognition || windowObj.webkitSpeechRecognition;
    
    if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = false;
        recognitionRef.current.lang = 'en-US';

        recognitionRef.current.onresult = (event: any) => {
            const transcript = event.results[0][0].transcript;
            setMessage(prev => prev + (prev ? ' ' : '') + transcript);
            setIsListening(false);
        };

        recognitionRef.current.onerror = (event: any) => {
            console.error('Speech recognition error', event.error);
            setIsListening(false);
        };

        recognitionRef.current.onend = () => {
            setIsListening(false);
        };
    }
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, isTyping, currentOptions, isOpen]);

  const handleAction = (path: string) => {
      // Handle Navigation Actions based on path
      switch(path) {
          case 'action_dashboard_freelancer': navigate('/freelancer/dashboard'); break;
          case 'action_dashboard_client': navigate('/client/dashboard'); break;
          case 'action_profile': navigate('/profile/edit'); break;
          case 'action_browse_jobs': navigate('/browse-jobs'); break;
          case 'action_create_job': navigate('/create-job'); break;
          case 'redirect_support': 
              setTimeout(() => {
                  setIsOpen(false);
                  navigate('/support');
              }, 1000);
              break;
      }
  };

  const handleOptionClick = (option: ChatOption) => {
    if (!chatFlow) return;

    // 1. User Message
    setChatHistory(prev => [...prev, { sender: 'user', text: option.label, timestamp: new Date() }]);
    
    // 2. Set Role if provided
    if (option.role === 'freelancer') setRole('Freelancer');
    if (option.role === 'employer') setRole('Employer');

    // 3. Reset Flow
    if (option.path === 'reset') {
        handleReset();
        return;
    }

    // 4. Handle Logic
    const pathData = chatFlow.paths[option.path];
    
    if (pathData) {
        setIsTyping(true);
        setCurrentOptions([]); // Hide options while thinking

        setTimeout(() => {
            setIsTyping(false);
            
            // Add Agent Messages
            const newMessages: UIMessage[] = pathData.messages.map(m => ({
                sender: 'agent',
                text: m.text,
                timestamp: new Date()
            }));
            setChatHistory(prev => [...prev, ...newMessages]);

            // Update Options
            if (pathData.options) {
                setCurrentOptions(pathData.options);
            }

            // Handle Redirections
            if (pathData.action) {
                handleAction(pathData.action);
            }
        }, 500);
    } else if (option.path.startsWith('action_')) {
        // Direct Action without message
        handleAction(option.path);
    }
  };

  const handleReset = () => {
      if (!chatFlow) return;
      setRole(null);
      setCurrentOptions(chatFlow.initial_prompt.options);
      setChatHistory(prev => [
          ...prev, 
          { sender: 'system', text: '--- Conversation Reset ---', timestamp: new Date() },
          { sender: 'agent', text: chatFlow.initial_prompt.text, timestamp: new Date() }
      ]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const toggleListening = () => {
      if (!recognitionRef.current) {
          alert("Your browser does not support voice input.");
          return;
      }

      if (isListening) {
          recognitionRef.current.stop();
      } else {
          try {
            recognitionRef.current.start();
            setIsListening(true);
          } catch (e) {
            console.error("Failed to start voice", e);
          }
      }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!message.trim() && !selectedFile)) return;

    const userMsg = message.trim();
    const currentFile = selectedFile;
    
    setMessage('');
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';

    if (userMsg.toLowerCase() === 'reset' || userMsg.toLowerCase() === 'start over') {
      handleReset();
      return;
    }

    // Add user message
    let attachment: Attachment | undefined = undefined;
    if (currentFile) {
      attachment = {
        id: Date.now().toString(),
        name: currentFile.name,
        url: URL.createObjectURL(currentFile),
        type: currentFile.type.startsWith('image/') ? 'image' : 'document',
        size: currentFile.size
      };
    }

    setChatHistory(prev => [...prev, { 
      sender: 'user', 
      text: userMsg, 
      timestamp: new Date(),
      attachments: attachment ? [attachment] : undefined
    }]);

    setIsTyping(true);
    setCurrentOptions([]); // Clear options when typing manually

    // Fallback to AI
    try {
        const response = await getSupportResponse(
          userMsg + (currentFile ? ` [Attached: ${currentFile.name}]` : ''), 
          role, 
          chatHistory.filter(m => m.text).map(m => ({ sender: m.sender, text: m.text! }))
        );
        
        setIsTyping(false);
        setChatHistory(prev => [...prev, { sender: 'agent', text: response, timestamp: new Date() }]);
        
        // Add a "back to menu" option after AI response
        setCurrentOptions([{ label: "Back to Menu", path: "reset" }]);
        
    } catch (e) {
        setIsTyping(false);
        setChatHistory(prev => [...prev, { sender: 'agent', text: "I'm having trouble connecting. Please try again or check your internet.", timestamp: new Date() }]);
    }
  };

  if (!isFlowLoaded) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col items-end font-sans">
      
      {/* Chat Window */}
      {isOpen && (
        <div className="bg-white w-80 sm:w-96 h-[600px] rounded-2xl shadow-2xl border border-gray-200 mb-4 flex flex-col overflow-hidden animate-fade-in-up">
          
          {/* Header */}
          <div className="bg-indigo-600 p-4 flex justify-between items-center text-white shadow-md">
            <div className="flex items-center">
              <div className="bg-white/20 p-2 rounded-full mr-3 relative">
                <Sparkles className="h-5 w-5 text-yellow-300" />
                <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full bg-green-400 ring-2 ring-indigo-600" />
              </div>
              <div>
                <h3 className="font-bold text-sm">{chatFlow?.agent.name || 'Jima'} (Support)</h3>
                <p className="text-[10px] text-indigo-200">{role ? `${role} Mode` : 'How can we help?'}</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button onClick={handleReset} className="text-indigo-200 hover:text-white p-1" title="Reset Chat">
                <RefreshCw className="h-4 w-4" />
              </button>
              <button onClick={() => setIsOpen(false)} className="hover:bg-indigo-700 p-1 rounded transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-white scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
            {chatHistory.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.sender === 'user' ? 'justify-end' : (msg.sender === 'system' ? 'justify-center' : 'justify-start')}`}>
                
                {msg.sender === 'system' ? (
                    <span className="text-xs text-gray-400 italic py-2">{msg.text}</span>
                ) : (
                    <>
                        {msg.sender === 'agent' && (
                        <div className="h-6 w-6 rounded-full bg-indigo-100 flex items-center justify-center mr-2 mt-1 flex-shrink-0">
                            <Sparkles className="h-3 w-3 text-indigo-600" />
                        </div>
                        )}
                        <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm whitespace-pre-wrap ${
                        msg.sender === 'user' 
                            ? 'bg-indigo-600 text-white rounded-br-none' 
                            : 'bg-gray-100 text-gray-800 border border-gray-100 rounded-bl-none'
                        }`}>
                        {msg.text && <p>{msg.text}</p>}
                        
                        {msg.attachments && msg.attachments.map(att => (
                            <div key={att.id} className="mt-2 p-2 bg-white/20 rounded border border-white/20 flex items-center">
                                <FileText className="h-4 w-4 mr-2" />
                                <span className="text-xs truncate max-w-[150px]">{att.name}</span>
                            </div>
                        ))}
                        </div>
                    </>
                )}
              </div>
            ))}

            {isTyping && (
              <div className="flex justify-start animate-pulse">
                 <div className="h-6 w-6 rounded-full bg-indigo-100 flex items-center justify-center mr-2">
                    <Sparkles className="h-3 w-3 text-indigo-600" />
                  </div>
                <div className="bg-gray-100 rounded-2xl px-4 py-3 text-gray-500 text-xs">Jima is thinking...</div>
              </div>
            )}

            {/* Dynamic Options */}
            {!isTyping && currentOptions.length > 0 && (
                <div className="flex flex-col space-y-2 mt-2 pl-8">
                    {currentOptions.map((opt, idx) => (
                        <button
                            key={idx}
                            onClick={() => handleOptionClick(opt)}
                            className="text-left px-4 py-3 bg-white border border-indigo-100 rounded-xl shadow-sm hover:bg-indigo-50 hover:border-indigo-300 transition-all text-sm font-medium text-gray-700 flex justify-between group"
                        >
                            {opt.label}
                            <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-indigo-500" />
                        </button>
                    ))}
                </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-3 bg-white border-t border-gray-100">
            {selectedFile && (
               <div className="mb-2 flex items-center bg-gray-100 p-2 rounded-lg text-xs relative max-w-fit">
                 <FileText className="h-3 w-3 mr-2" />
                 <span className="truncate max-w-[200px]">{selectedFile.name}</span>
                 <button onClick={() => setSelectedFile(null)} className="ml-2 hover:text-red-500"><X className="h-3 w-3" /></button>
               </div>
            )}
            <form onSubmit={handleSend} className="flex gap-2 items-center">
              <input 
                type="file"
                ref={fileInputRef}
                className="hidden"
                onChange={handleFileSelect}
              />
              <button 
                type="button" 
                onClick={() => fileInputRef.current?.click()}
                className="text-gray-400 hover:text-indigo-600"
              >
                <Paperclip className="h-5 w-5" />
              </button>
              
              <div className="flex-1 relative">
                  <input 
                    type="text" 
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={isListening ? "Listening..." : "Type a message..."}
                    className={`w-full text-sm border rounded-full px-4 py-3 focus:outline-none transition-colors ${isListening ? 'border-red-400 bg-red-50 focus:border-red-500 focus:ring-1 focus:ring-red-500' : 'border-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'}`}
                  />
                  <button 
                    type="button" 
                    onClick={toggleListening}
                    className={`absolute right-2 top-1/2 transform -translate-y-1/2 p-1.5 rounded-full transition-colors ${isListening ? 'text-red-600 bg-red-100 animate-pulse' : 'text-gray-400 hover:text-indigo-600'}`}
                  >
                    {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </button>
              </div>

              <button 
                type="submit" 
                disabled={!message.trim() && !selectedFile}
                className="bg-indigo-600 text-white p-3 rounded-full hover:bg-indigo-700 transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Toggle Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`${isOpen ? 'bg-gray-700' : 'bg-indigo-600'} text-white p-4 rounded-full shadow-lg hover:opacity-90 transition-all transform hover:scale-105 flex items-center justify-center group`}
      >
        {isOpen ? <X className="h-6 w-6" /> : (
          <div className="relative">
             <Headphones className="h-6 w-6" />
             <span className="absolute -top-1 -right-1 flex h-3 w-3">
               <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
               <span className="relative inline-flex rounded-full h-3 w-3 bg-yellow-500"></span>
             </span>
          </div>
        )}
      </button>

      <style>{`
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up {
          animation: fade-in-up 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
};

export default SupportWidget;
