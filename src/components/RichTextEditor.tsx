
import React, { useRef, useState } from 'react';
import { Bold, Italic, List, Link, Image, Video, Code, Table, Smile, AtSign, Hash, Paperclip, Check } from 'lucide-react';
import FilePicker from './FilePicker';
import { UploadedFile } from '../types';

interface RichTextEditorProps {
    value: string;
    onChange: (val: string) => void;
    placeholder?: string;
    height?: string;
    showToolbar?: boolean;
}

const RichTextEditor: React.FC<RichTextEditorProps> = ({ value, onChange, placeholder, height = "200px", showToolbar = true }) => {
    const editorRef = useRef<HTMLTextAreaElement>(null);
    const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
    const [previewMode, setPreviewMode] = useState(false);

    const insertText = (before: string, after: string = '') => {
        if (!editorRef.current) return;
        const textarea = editorRef.current;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        const newText = text.substring(0, start) + before + text.substring(start, end) + after + text.substring(end);
        onChange(newText);
        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + before.length, end + before.length);
        }, 0);
    };

    const handleFileSelect = (file: UploadedFile) => {
        if (file.type.startsWith('image')) {
            insertText(`![${file.name}](${file.url})`);
        } else {
            insertText(`[${file.name}](${file.url})`);
        }
        setIsFilePickerOpen(false);
    };

    return (
        <div className="border border-gray-300 rounded-lg overflow-hidden bg-white shadow-sm transition-all focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500">
            {showToolbar && (
                <div className="bg-gray-50 border-b border-gray-200 p-2 flex flex-wrap gap-1 items-center">
                    <button type="button" onClick={() => insertText('**', '**')} className="p-1.5 rounded hover:bg-gray-200 text-gray-600" title="Bold"><Bold className="w-4 h-4" /></button>
                    <button type="button" onClick={() => insertText('*', '*')} className="p-1.5 rounded hover:bg-gray-200 text-gray-600" title="Italic"><Italic className="w-4 h-4" /></button>
                    <div className="w-px h-4 bg-gray-300 mx-1"></div>
                    <button type="button" onClick={() => insertText('\n- ')} className="p-1.5 rounded hover:bg-gray-200 text-gray-600" title="List"><List className="w-4 h-4" /></button>
                    <button type="button" onClick={() => insertText('[', '](url)')} className="p-1.5 rounded hover:bg-gray-200 text-gray-600" title="Link"><Link className="w-4 h-4" /></button>
                    <button type="button" onClick={() => setIsFilePickerOpen(true)} className="p-1.5 rounded hover:bg-gray-200 text-gray-600" title="Image/File"><Image className="w-4 h-4" /></button>
                    <div className="w-px h-4 bg-gray-300 mx-1"></div>
                    <button type="button" onClick={() => insertText('`', '`')} className="p-1.5 rounded hover:bg-gray-200 text-gray-600" title="Code"><Code className="w-4 h-4" /></button>
                    <button type="button" onClick={() => insertText('@')} className="p-1.5 rounded hover:bg-gray-200 text-gray-600" title="Mention"><AtSign className="w-4 h-4" /></button>
                    <button type="button" onClick={() => insertText('#')} className="p-1.5 rounded hover:bg-gray-200 text-gray-600" title="Channel"><Hash className="w-4 h-4" /></button>
                    <div className="flex-1"></div>
                    <button 
                        type="button" 
                        onClick={() => setPreviewMode(!previewMode)} 
                        className={`text-xs px-2 py-1 rounded border ${previewMode ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-white text-gray-600 border-gray-200'}`}
                    >
                        {previewMode ? 'Edit' : 'Preview'}
                    </button>
                </div>
            )}
            
            {previewMode ? (
                <div className="p-3 prose prose-sm max-w-none overflow-y-auto bg-gray-50" style={{ height }}>
                     {/* Basic Markdown Rendering Simulation */}
                     {value.split('\n').map((line, i) => (
                         <div key={i} dangerouslySetInnerHTML={{ 
                             __html: line
                                 .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
                                 .replace(/\*(.*?)\*/g, '<i>$1</i>')
                                 .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" class="text-blue-600 hover:underline">$1</a>')
                                 .replace(/`([^`]+)`/g, '<code class="bg-gray-100 px-1 rounded">$1</code>')
                         }} />
                     ))}
                     {!value && <p className="text-gray-400 italic">Nothing to preview</p>}
                </div>
            ) : (
                <textarea
                    ref={editorRef}
                    className="w-full p-3 text-sm focus:outline-none resize-none font-sans"
                    style={{ height }}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                />
            )}
            
            <FilePicker 
                isOpen={isFilePickerOpen} 
                onClose={() => setIsFilePickerOpen(false)} 
                onSelect={handleFileSelect} 
                acceptedTypes="image/*,video/*,.pdf,.doc,.docx"
            />
        </div>
    );
};

export default RichTextEditor;
