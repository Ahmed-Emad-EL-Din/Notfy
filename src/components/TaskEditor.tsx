import React, { useState } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { Mic, Square, Save } from 'lucide-react';
// import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
// import { storage } from '../lib/firebase'; // Assumes Firebase storage is initialized

interface TaskEditorProps {
  onSave: (task: any) => void;
  isAdmin: boolean;
}

const TaskEditor: React.FC<TaskEditorProps> = ({ onSave, isAdmin }) => {
  const [title, setTitle] = useState('');
  const [descriptionHtml, setDescriptionHtml] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [visibility, setVisibility] = useState('personal');

  // We leave voice note recording as a mockup that resolves to null since storage might not be configured.
  const [isRecording] = useState(false);

  const handleSave = () => {
    if (!title.trim()) return;
    onSave({
      title,
      description_html: descriptionHtml,
      due_date: new Date(dueDate || Date.now()).toISOString(),
      completed: false,
      visibility,
      type: 'standard',
      voice_note_url: null, // Audio integration stub
      reactions: [],
      votes: []
    });
    setTitle('');
    setDescriptionHtml('');
    setDueDate('');
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
      <h3 className="text-lg font-medium mb-3">Add New Task</h3>
      
      <div className="space-y-4">
        <input
          type="text"
          placeholder="Task title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <div className="bg-white">
          <ReactQuill 
            theme="snow" 
            value={descriptionHtml} 
            onChange={setDescriptionHtml} 
            placeholder="Write task description with rich text..."
            className="h-32 mb-12"
          />
        </div>

        <div className="flex space-x-4 items-center">
          <div className="flex-1">
             <label className="block text-sm text-gray-600 mb-1">Due Date</label>
             <input
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
             />
          </div>

          <div className="w-1/3">
             <label className="block text-sm text-gray-600 mb-1">Visibility</label>
             <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={!isAdmin}
             >
                <option value="personal">Personal (Only Me)</option>
                {isAdmin && <option value="global">Global (All Linked Users)</option>}
             </select>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
            <button
                // onClick={isRecording ? stopRecording : startRecording}
                className={`flex items-center space-x-2 px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  isRecording ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                title="Voice notes coming soon"
            >
                {isRecording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                <span>{isRecording ? 'Recording...' : 'Record Audio'}</span>
            </button>

            <button
              onClick={handleSave}
              className="flex items-center justify-center space-x-2 px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
            >
              <Save className="h-4 w-4" />
              <span>Save Task</span>
            </button>
        </div>
      </div>
    </div>
  );
};

export default TaskEditor;
