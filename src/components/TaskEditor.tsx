import React, { useState, useRef, useMemo } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { Mic, Square, Save } from 'lucide-react';

interface TaskEditorProps {
  onSave: (task: any) => void;
  isAdmin: boolean;
  initialTask?: any;
  onCancel?: () => void;
}

const TaskEditor: React.FC<TaskEditorProps> = ({ onSave, isAdmin, initialTask, onCancel }) => {
  const [title, setTitle] = useState('');
  const [descriptionHtml, setDescriptionHtml] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [visibility, setVisibility] = useState('personal');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceNoteUrl, setVoiceNoteUrl] = useState<string | null>(null);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const quillRef = useRef<ReactQuill>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Populate form when editing
  React.useEffect(() => {
    if (initialTask) {
        setTitle(initialTask.title || '');
        setDescriptionHtml(initialTask.description_html || '');
        // Convert Date to datetime-local format (YYYY-MM-DDTHH:mm)
        if (initialTask.dueDate) {
            const date = new Date(initialTask.dueDate);
            const formatted = date.toISOString().slice(0, 16);
            setDueDate(formatted);
        }
        setVisibility(initialTask.visibility || 'personal');
        setVoiceNoteUrl(initialTask.voiceNoteUrl || initialTask.voice_note_url || null);
    } else {
        // Reset if we stop editing
        setTitle('');
        setDescriptionHtml('');
        setDueDate('');
        setVisibility('personal');
        setVoiceNoteUrl(null);
    }
  }, [initialTask]);

  // ---- Voice Recording ----
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(t => t.stop()); // stop mic access

        const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
        const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

        if (!cloudName || !uploadPreset) {
          alert('Cloudinary is not configured. Cannot upload audio.');
          return;
        }

        setIsUploadingAudio(true);
        const formData = new FormData();
        formData.append('file', audioBlob, 'voice-note.webm');
        formData.append('upload_preset', uploadPreset);
        formData.append('resource_type', 'video'); // Cloudinary uses "video" for audio files

        try {
          const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/video/upload`, {
            method: 'POST',
            body: formData,
          });
          const data = await res.json();
          if (data.secure_url) {
            setVoiceNoteUrl(data.secure_url);
          } else {
            alert('Audio upload failed. Check Cloudinary settings.');
          }
        } catch (err) {
          console.error('Audio upload error:', err);
        } finally {
          setIsUploadingAudio(false);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      alert('Microphone access denied. Please allow microphone access in browser settings.');
      console.error(err);
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  // ---- Cloudinary Image Handler ----
  const imageHandler = () => {
    const input = document.createElement('input');
    input.setAttribute('type', 'file');
    input.setAttribute('accept', 'image/*');
    input.click();

    input.onchange = async () => {
      const file = input.files ? input.files[0] : null;
      if (!file) return;

      const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
      const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

      if (!cloudName || !uploadPreset) {
        alert('Cloudinary Environment Variables are not set. Cannot upload image.');
        return;
      }

      setIsUploadingImage(true);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', uploadPreset);

      try {
        const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
          method: 'POST',
          body: formData,
        });
        const data = await response.json();
        if (data.secure_url) {
          const quill = quillRef.current?.getEditor();
          if (quill) {
            const range = quill.getSelection(true);
            quill.insertEmbed(range.index, 'image', data.secure_url);
            quill.setSelection(range.index + 1, 0);
          }
        } else {
          alert('Failed to upload image to Cloudinary.');
        }
      } catch (error) {
        console.error('Cloudinary error:', error);
      } finally {
        setIsUploadingImage(false);
      }
    };
  };

  const modules = useMemo(() => ({
    toolbar: {
      container: [
        [{ 'header': [1, 2, false] }],
        ['bold', 'italic', 'underline', 'strike', 'blockquote'],
        [{ 'list': 'ordered' }, { 'list': 'bullet' }, { 'indent': '-1' }, { 'indent': '+1' }],
        ['link', 'image'],
        ['clean']
      ],
      handlers: { image: imageHandler }
    }
  }), []);

  const formats = ['header', 'bold', 'italic', 'underline', 'strike', 'blockquote', 'list', 'bullet', 'indent', 'link', 'image'];

  const handleSave = () => {
    if (!title.trim() || isUploadingImage || isUploadingAudio) return;
    onSave({
      id: initialTask?.id, // include ID if editing
      title,
      description_html: descriptionHtml,
      due_date: new Date(dueDate || Date.now()).toISOString(),
      completed: initialTask?.completed || false,
      visibility,
      type: 'standard',
      voice_note_url: voiceNoteUrl,
      reactions: initialTask?.reactions || [],
      votes: initialTask?.votes || []
    });
    if (!initialTask) {
        setTitle('');
        setDescriptionHtml('');
        setDueDate('');
        setVoiceNoteUrl(null);
    }
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200" id="task-editor">
      <h3 className="text-lg font-medium mb-3">{initialTask ? 'Edit Task' : 'Add New Task'}</h3>

      <div className="space-y-4">
        <input
          type="text"
          placeholder="Task title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <div className="bg-white relative">
          {isUploadingImage && (
            <div className="absolute inset-0 bg-white/50 z-10 flex items-center justify-center font-medium text-blue-600">
              Uploading Image...
            </div>
          )}
          <ReactQuill
            ref={quillRef}
            theme="snow"
            value={descriptionHtml}
            onChange={setDescriptionHtml}
            modules={modules}
            formats={formats}
            placeholder="Write task description with rich text and images..."
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
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isUploadingAudio}
              className={`flex items-center space-x-2 px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                isRecording
                  ? 'bg-red-100 text-red-600 animate-pulse'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {isRecording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              <span>
                {isUploadingAudio ? 'Uploading Audio...' : isRecording ? 'Stop Recording' : 'Record Audio'}
              </span>
            </button>

            {voiceNoteUrl && (
              <div className="flex items-center gap-2">
                <audio controls src={voiceNoteUrl} className="h-8 max-w-[180px]" />
                <button
                  type="button"
                  onClick={() => setVoiceNoteUrl(null)}
                  className="text-xs text-red-500 hover:text-red-700"
                >✕</button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
              {initialTask && (
                <button
                    onClick={onCancel}
                    className="px-6 py-2 border border-gray-300 text-gray-600 rounded-md hover:bg-gray-50 transition"
                >
                    Cancel
                </button>
              )}
              <button
                onClick={handleSave}
                className="flex items-center justify-center space-x-2 px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
              >
                <Save className="h-4 w-4" />
                <span>{initialTask ? 'Update Task' : 'Save Task'}</span>
              </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskEditor;
