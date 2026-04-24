import React, { useState, useRef, useMemo } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { Mic, Square, Save } from 'lucide-react';
type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly';
type TaskAttachment = { url: string; name: string; mimeType: string; size: number };

interface TaskEditorProps {
  onSave: (task: any) => Promise<void> | void;
  isAdmin: boolean;
  users?: Array<{ id: string; name: string }>;
  initialTask?: any;
  onCancel?: () => void;
}

const TaskEditor: React.FC<TaskEditorProps> = ({ onSave, isAdmin, users, initialTask, onCancel }) => {
  const [title, setTitle] = useState('');
  const [descriptionHtml, setDescriptionHtml] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [visibility, setVisibility] = useState('personal');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceNoteUrl, setVoiceNoteUrl] = useState<string | null>(null);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  
  // New features
  const [groupName, setGroupName] = useState('');
  const [isPoll, setIsPoll] = useState(false);
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [showPollResults, setShowPollResults] = useState(true);
  const [recurrenceEnabled, setRecurrenceEnabled] = useState(false);
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<RecurrenceFrequency>('daily');
  const [recurrenceInterval, setRecurrenceInterval] = useState(1);
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [subtasks, setSubtasks] = useState<Array<{ id: string; title: string; completed: boolean }>>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [labels, setLabels] = useState<string[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [assignedTo, setAssignedTo] = useState<string | null>(null);
  const [reminderOffset, setReminderOffset] = useState(0);
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);

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
        setGroupName(initialTask.groupName || '');
        setIsPoll(initialTask.isPoll || false);
        setPollOptions(initialTask.pollOptions?.length ? initialTask.pollOptions : ['', '']);
        setShowPollResults(initialTask.showPollResults !== undefined ? initialTask.showPollResults : true);
        setRecurrenceEnabled(!!initialTask.recurrence);
        setRecurrenceFrequency(initialTask.recurrence?.frequency || 'daily');
        setRecurrenceInterval(initialTask.recurrence?.interval || 1);
        setPriority(initialTask.priority || 'medium');
        setSubtasks(initialTask.subtasks || []);
        setLabels(initialTask.labels || []);
        setAssignedTo(initialTask.assigned_to || null);
        setReminderOffset(initialTask.reminder_offset_minutes || 0);
        setAttachments(initialTask.attachments || []);
    } else {
        // Reset if we stop editing
        setTitle('');
        setDescriptionHtml('');
        setDueDate('');
        setVisibility('personal');
        setVoiceNoteUrl(null);
        setGroupName('');
        setIsPoll(false);
        setPollOptions(['', '']);
        setShowPollResults(true);
        setRecurrenceEnabled(false);
        setRecurrenceFrequency('daily');
        setRecurrenceInterval(1);
        setPriority('medium');
        setSubtasks([]);
        setLabels([]);
        setNewLabel('');
        setAssignedTo(null);
        setReminderOffset(0);
        setAttachments([]);
    }
  }, [initialTask]);

  const uploadAttachment = async (file: File) => {
    const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
    const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;
    if (!cloudName || !uploadPreset) {
      setFormError('Cloudinary is not configured for attachments.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setFormError('Attachment exceeds 10MB limit.');
      return;
    }
    const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain'];
    if (!allowed.includes(file.type)) {
      setFormError('Unsupported attachment type. Allowed: PDF, PNG, JPG, WEBP, TXT.');
      return;
    }

    setIsUploadingAttachment(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', uploadPreset);
      const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (!data.secure_url) throw new Error('Upload failed');
      setAttachments(prev => [...prev, { url: data.secure_url, name: file.name, mimeType: file.type, size: file.size }]);
    } catch (err) {
      console.error(err);
      setFormError('Failed to upload attachment.');
    } finally {
      setIsUploadingAttachment(false);
    }
  };

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
        // Support cross-browser formats — favor webm for Chrome, mp4 for Safari
        const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
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
        [{ 'color': [] }, { 'background': [] }],
        ['link', 'image'],
        ['clean']
      ],
      handlers: { image: imageHandler }
    }
  }), []);

  const formats = ['header', 'bold', 'italic', 'underline', 'strike', 'blockquote', 'list', 'bullet', 'indent', 'color', 'background', 'link', 'image'];

  const handleSave = () => {
    const save = async () => {
      setFormError(null);
      if (isUploadingImage || isUploadingAudio || isUploadingAttachment || isSaving) return;

      const normalizedTitle = title.trim();
      if (!normalizedTitle) {
        setFormError('Task title is required.');
        return;
      }

      if (normalizedTitle.length > 120) {
        setFormError('Task title must be 120 characters or fewer.');
        return;
      }

      const computedDueDate = dueDate ? new Date(dueDate) : new Date();
      if (Number.isNaN(computedDueDate.getTime())) {
        setFormError('Please provide a valid due date.');
        return;
      }

      const normalizedPollOptions = isPoll
        ? pollOptions.map(opt => opt.trim()).filter(Boolean)
        : [];

      if (isPoll && normalizedPollOptions.length < 2) {
        setFormError('Polls require at least 2 non-empty options.');
        return;
      }

      if (new Set(normalizedPollOptions.map(opt => opt.toLowerCase())).size !== normalizedPollOptions.length) {
        setFormError('Poll options must be unique.');
        return;
      }

      setIsSaving(true);
      try {
        await onSave({
          id: initialTask?.id, // include ID if editing
          title: normalizedTitle,
          description_html: descriptionHtml,
          due_date: computedDueDate.toISOString(),
          completed: initialTask?.completed || false,
          visibility,
          type: isPoll ? 'poll' : 'standard',
          voice_note_url: voiceNoteUrl,
          reactions: initialTask?.reactions || {},
          votes: initialTask?.votes || {},
          groupName: groupName.trim() || undefined,
          isPoll,
          pollOptions: normalizedPollOptions,
          showPollResults: isPoll ? showPollResults : false
          ,
          priority,
          subtasks,
          labels,
          assigned_to: assignedTo || undefined,
          reminder_offset_minutes: reminderOffset,
          recurrence: recurrenceEnabled ? { frequency: recurrenceFrequency, interval: recurrenceInterval } : undefined,
          attachments
        });
        if (!initialTask) {
          setTitle('');
          setDescriptionHtml('');
          setDueDate('');
          setVoiceNoteUrl(null);
          setGroupName('');
          setIsPoll(false);
          setPollOptions(['', '']);
          setRecurrenceEnabled(false);
          setRecurrenceFrequency('daily');
          setRecurrenceInterval(1);
          setPriority('medium');
          setSubtasks([]);
          setLabels([]);
          setNewLabel('');
          setAssignedTo(null);
          setReminderOffset(0);
          setAttachments([]);
        }
      } catch (err) {
        console.error(err);
        setFormError('Failed to save task. Please try again.');
      } finally {
        setIsSaving(false);
      }
    };

    void save();
  };

  return (
    <div className="bg-white p-3 sm:p-4 rounded-xl shadow-sm border border-gray-200" id="task-editor">
      <h3 className="text-base sm:text-lg font-semibold mb-3">{initialTask ? 'Edit Task' : 'Add New Task'}</h3>

      <div className="space-y-4">
        {formError && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {formError}
          </div>
        )}
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
            className="task-editor-quill h-32 mb-16 sm:mb-12"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Due Date</label>
            <input
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">Group Name (Optional)</label>
            <input
              type="text"
              placeholder="e.g. Announcements"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
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

          <div>
            <label className="block text-sm text-gray-600 mb-1">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
        </div>

        {/* Polling Options */}
        <div className="border border-gray-200 rounded-md p-3 sm:p-4 bg-gray-50">
           <div className="flex items-center mb-3">
              <input 
                 type="checkbox" 
                 id="isPoll" 
                 checked={isPoll} 
                 onChange={(e) => setIsPoll(e.target.checked)}
                 className="mr-2"
              />
              <label htmlFor="isPoll" className="font-medium text-gray-700">Make this a Poll</label>
           </div>
           
           {isPoll && (
              <div className="ml-1 sm:ml-5 space-y-2">
                 {pollOptions.map((opt, i) => (
                    <div key={i} className="flex items-center space-x-2">
                       <input
                          type="text"
                          placeholder={`Option ${i + 1}`}
                          value={opt}
                          onChange={(e) => {
                             const newOpts = [...pollOptions];
                             newOpts[i] = e.target.value;
                             setPollOptions(newOpts);
                          }}
                          className="flex-1 px-3 py-1 border border-gray-300 rounded focus:border-blue-500 outline-none shadow-sm"
                       />
                         {i === pollOptions.length - 1 && (
                          <button type="button" onClick={() => setPollOptions([...pollOptions, ''])} className="px-2 py-1 bg-gray-200 rounded hover:bg-gray-300 text-sm">+</button>
                       )}
                       {pollOptions.length > 2 && (
                          <button type="button" onClick={() => setPollOptions(pollOptions.filter((_, idx) => idx !== i))} className="px-2 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200 text-sm">-</button>
                       )}
                    </div>
                 ))}
                 <div className="pt-2 flex items-center">
                    <input 
                       type="checkbox" 
                       id="showResults" 
                       checked={showPollResults} 
                       onChange={(e) => setShowPollResults(e.target.checked)}
                       className="mr-2"
                    />
                    <label htmlFor="showResults" className="text-sm text-gray-600">Show results to users after they vote</label>
                 </div>
              </div>
           )}
        </div>

        <div className="border border-gray-200 rounded-md p-3 sm:p-4 bg-gray-50 space-y-3">
          <div className="flex items-center gap-2">
            <input type="checkbox" id="recurring" checked={recurrenceEnabled} onChange={(e) => setRecurrenceEnabled(e.target.checked)} />
            <label htmlFor="recurring" className="font-medium text-gray-700">Recurring task</label>
          </div>
          {recurrenceEnabled && (
            <div className="grid grid-cols-2 gap-3">
              <select value={recurrenceFrequency} onChange={(e) => setRecurrenceFrequency(e.target.value as RecurrenceFrequency)} className="w-full px-3 py-2 border border-gray-300 rounded-md">
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
              <input type="number" min={1} max={12} value={recurrenceInterval} onChange={(e) => setRecurrenceInterval(Number(e.target.value || 1))} className="w-full px-3 py-2 border border-gray-300 rounded-md" />
            </div>
          )}
        </div>

        {/* Subtasks */}
        <div className="border border-gray-200 rounded-md p-3 sm:p-4 bg-gray-50 space-y-3">
          <p className="font-medium text-gray-700">Subtasks</p>
          <div className="space-y-2">
            {subtasks.map((st, i) => (
              <div key={st.id} className="flex items-center gap-2">
                <input type="checkbox" checked={st.completed} onChange={() => {
                  const updated = [...subtasks];
                  updated[i].completed = !updated[i].completed;
                  setSubtasks(updated);
                }} className="mr-1" />
                <span className={`text-sm flex-1 ${st.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>{st.title}</span>
                <button type="button" onClick={() => setSubtasks(subtasks.filter((_, idx) => idx !== i))} className="text-red-500 text-xs">✕</button>
              </div>
            ))}
            <div className="flex gap-2">
              <input type="text" placeholder="Add subtask..." value={newSubtaskTitle} onChange={(e) => setNewSubtaskTitle(e.target.value)} className="flex-1 px-3 py-1 border border-gray-300 rounded-md text-sm" />
              <button type="button" onClick={() => {
                const t = newSubtaskTitle.trim();
                if (t) {
                  setSubtasks([...subtasks, { id: crypto.randomUUID(), title: t, completed: false }]);
                  setNewSubtaskTitle('');
                }
              }} className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 text-sm">+</button>
            </div>
          </div>
        </div>

        {/* Labels */}
        <div className="border border-gray-200 rounded-md p-3 sm:p-4 bg-gray-50 space-y-3">
          <p className="font-medium text-gray-700">Labels</p>
          <div className="flex flex-wrap gap-2">
            {labels.map((label, i) => (
              <span key={i} className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs flex items-center gap-1">
                {label}
                <button type="button" onClick={() => setLabels(labels.filter((_, idx) => idx !== i))} className="text-blue-500 hover:text-blue-800">✕</button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input type="text" placeholder="Add label..." value={newLabel} onChange={(e) => setNewLabel(e.target.value)} className="flex-1 px-3 py-1 border border-gray-300 rounded-md text-sm" />
            <button type="button" onClick={() => {
              const t = newLabel.trim().toLowerCase();
              if (t && !labels.includes(t) && labels.length < 8) {
                setLabels([...labels, t]);
                setNewLabel('');
              }
            }} className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 text-sm">+</button>
          </div>
        </div>

        {/* Assignment + Reminder */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {isAdmin && users && users.length > 0 && (
            <div>
              <label className="block text-sm text-gray-600 mb-1">Assign To</label>
              <select value={assignedTo || ''} onChange={(e) => setAssignedTo(e.target.value || null)} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Unassigned</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm text-gray-600 mb-1">Reminder</label>
            <select value={reminderOffset} onChange={(e) => setReminderOffset(Number(e.target.value))} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value={0}>At due time</option>
              <option value={15}>15 minutes before</option>
              <option value={60}>1 hour before</option>
              <option value={1440}>1 day before</option>
            </select>
          </div>
        </div>

        <div className="border border-gray-200 rounded-md p-3 sm:p-4 bg-gray-50">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
            <p className="font-medium text-gray-700">Attachments</p>
            <input
              type="file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadAttachment(file);
              }}
              disabled={isUploadingAttachment}
              className="text-sm w-full sm:w-auto"
            />
          </div>
          {isUploadingAttachment && <p className="text-sm text-blue-600">Uploading attachment...</p>}
          <div className="space-y-1">
            {attachments.map((attachment, idx) => (
              <div key={`${attachment.url}-${idx}`} className="flex items-center justify-between gap-2 text-sm bg-white px-2 py-1 rounded border">
                <a href={attachment.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline truncate max-w-[75%]">{attachment.name}</a>
                <button type="button" onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))} className="text-red-500">Remove</button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 pt-2">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isUploadingAudio || isSaving}
              className={`flex items-center space-x-2 px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                isRecording
                  ? 'bg-red-100 text-red-600 animate-pulse'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              } disabled:opacity-60`}
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

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end items-stretch sm:items-center gap-2">
              {initialTask && (
                <button
                    onClick={onCancel}
                    disabled={isSaving}
                    className="w-full sm:w-auto px-6 py-2 border border-gray-300 text-gray-600 rounded-md hover:bg-gray-50 transition disabled:opacity-60"
                >
                    Cancel
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={isUploadingImage || isUploadingAudio || isSaving}
                className="w-full sm:w-auto flex items-center justify-center space-x-2 px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                <span>{isSaving ? 'Saving...' : initialTask ? 'Update Task' : 'Save Task'}</span>
              </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskEditor;
