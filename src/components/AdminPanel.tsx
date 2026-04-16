import { useState } from 'react'
import { Users, BellPlus, BarChart3, Link } from 'lucide-react'
import { auth } from '../lib/firebase'

interface AdminPanelProps {
  isAdmin: boolean
  onToggleAdmin: () => void
  onSendNotification: (notification: { title: string; message: string; type: 'info' | 'warning' | 'urgent'; targetUserIds?: string[] }) => void
  users: Array<{ id: string; name: string; email: string; isAdmin: boolean }>
}

function AdminPanel({ isAdmin, onToggleAdmin, onSendNotification, users }: AdminPanelProps) {
  const [newNotification, setNewNotification] = useState({
    title: '',
    message: '',
    type: 'info' as const,
    scheduledTime: '',
    targetUserIds: [] as string[],
    isBroadcast: true
  })

  const [invitationLink, setInvitationLink] = useState('')
  const [showInvitationDialog, setShowInvitationDialog] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)

  const handleSendNotification = () => {
    if (newNotification.title.trim() && newNotification.message.trim()) {
      onSendNotification({
        title: newNotification.title,
        message: newNotification.message,
        type: newNotification.type,
        targetUserIds: newNotification.isBroadcast ? undefined : newNotification.targetUserIds
      })
      setNewNotification({ 
        title: '', 
        message: '', 
        type: 'info', 
        scheduledTime: '',
        targetUserIds: [],
        isBroadcast: true
      })
    }
  }

  const generateInvitationLink = async (role: 'user' | 'co-admin' = 'user') => {
    setIsGenerating(true)
    try {
      const fbToken = await auth.currentUser?.getIdToken() || 'local-debug-token'
      const res = await fetch('/.netlify/functions/api?action=generateInvite', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${fbToken}`
        },
        body: JSON.stringify({ role })
      })
      if (res.ok) {
        const data = await res.json()
        const baseUrl = window.location.origin
        const link = `${baseUrl}/invite/${data.token}`
        setInvitationLink(link)
      } else {
        alert("Failed to generate invite.")
      }
    } catch (e) {
      console.error(e)
    }
    setIsGenerating(false)
  }

  const copyInvitationLink = async () => {
    try {
      await navigator.clipboard.writeText(invitationLink)
      alert('Invitation link copied to clipboard!')
    } catch (err) {
      alert('Failed to copy link. Please copy it manually.')
    }
  }

  if (!isAdmin) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="text-center">
          <Users className="h-16 w-16 mx-auto text-gray-400 mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Admin Access Required</h2>
          <p className="text-gray-600 mb-4">You need admin privileges to access this panel.</p>
          <button
            onClick={onToggleAdmin}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Switch to Admin Mode
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-8 pb-4 border-b">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center">
          <BarChart3 className="h-6 w-6 mr-3 text-blue-600" />
          Admin Dashboard
        </h2>
        <button
          onClick={onToggleAdmin}
          className="px-4 py-2 bg-gray-100 text-gray-700 font-medium rounded-md hover:bg-gray-200 transition"
        >
          Switch to User Workspace
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* Statistics & Users */}
        <div className="space-y-8">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-5 border border-blue-100">
              <h3 className="text-lg font-semibold text-blue-900 mb-4 flex items-center">
                <Users className="h-5 w-5 mr-2" />
                Linked Users Directory
              </h3>
              
              <div className="space-y-2 mb-4">
                <div className="flex justify-between items-center bg-white p-3 rounded-lg shadow-sm">
                  <span className="text-gray-600 font-medium">Total Linked Users</span>
                  <span className="font-bold text-lg text-blue-700">{users.length}</span>
                </div>
              </div>

              <div className="scroll-py-2 max-h-60 overflow-y-auto pr-2 space-y-2">
                {users.map(user => (
                  <div key={user.id} className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-100 shadow-sm hover:border-blue-200 transition">
                    <div>
                      <div className="font-semibold text-gray-800">{user.name}</div>
                      <div className="text-xs text-gray-500">{user.email}</div>
                    </div>
                  </div>
                ))}
                
                {users.length === 0 && (
                  <div className="text-center text-gray-500 py-6 bg-white rounded-lg border border-dashed border-gray-300">
                    <p>No users linked yet.</p>
                    <p className="text-xs mt-1">Generate an invite link to onboard users.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Quick Actions</h3>
              <div className="space-y-3">
                <button 
                  onClick={() => setShowInvitationDialog(true)}
                  className="w-full flex justify-center items-center px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
                >
                  <Link className="h-4 w-4 mr-2" />
                  Generate Workspace Invite Link
                </button>
              </div>
            </div>
        </div>

        {/* Notifications */}
        <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-800 mb-5 flex items-center">
            <BellPlus className="h-5 w-5 mr-2 text-yellow-500" />
            Send Custom Notification
          </h3>
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Notification Title"
              value={newNotification.title}
              onChange={(e) => setNewNotification({...newNotification, title: e.target.value})}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <textarea
              placeholder="Provide a detailed message..."
              value={newNotification.message}
              onChange={(e) => setNewNotification({...newNotification, message: e.target.value})}
              rows={4}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            
            <div className="grid grid-cols-2 gap-4">
                <select
                  value={newNotification.type}
                  onChange={(e) => setNewNotification({...newNotification, type: e.target.value as any})}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="info">Info Priority</option>
                  <option value="warning">Warning Priority</option>
                  <option value="urgent">Urgent Priority</option>
                </select>
                <input
                  type="datetime-local"
                  title="Schedule Time"
                  value={newNotification.scheduledTime}
                  onChange={(e) => setNewNotification({...newNotification, scheduledTime: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
            </div>
            
            <div className="bg-gray-50 p-4 rounded-lg mt-2 border border-gray-100">
              <label className="flex items-center text-gray-800 font-medium mb-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newNotification.isBroadcast}
                  onChange={(e) => setNewNotification({...newNotification, isBroadcast: e.target.checked, targetUserIds: []})}
                  className="mr-3 h-4 w-4 text-blue-600 rounded"
                />
                Broadcast to all linked users
              </label>
              
              {!newNotification.isBroadcast && (
                <div className="space-y-2 mt-4 max-h-40 overflow-y-auto">
                  <p className="text-sm font-medium text-gray-600 mb-2">Select recipients:</p>
                  {users.filter(user => !user.isAdmin).map(user => (
                    <label key={user.id} className="flex items-center text-sm cursor-pointer hover:bg-gray-100 p-1.5 rounded">
                      <input
                        type="checkbox"
                        checked={newNotification.targetUserIds.includes(user.id)}
                        onChange={(e) => {
                          const updatedIds = e.target.checked
                            ? [...newNotification.targetUserIds, user.id]
                            : newNotification.targetUserIds.filter(id => id !== user.id)
                          setNewNotification({...newNotification, targetUserIds: updatedIds})
                        }}
                        className="mr-3 h-4 w-4"
                      />
                      {user.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
            
            <button
              onClick={handleSendNotification}
              className="w-full mt-4 px-4 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition shadow-sm"
            >
              Dispatch Notification
            </button>
          </div>
        </div>

      </div>

      {/* Invitation Dialog */}
      {showInvitationDialog && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 transform transition-all">
            <h3 className="text-xl font-bold text-gray-900 mb-6">Generate Secure Invite</h3>
            
            <div className="space-y-4">
              <button
                 onClick={() => generateInvitationLink('user')}
                 disabled={isGenerating}
                 className="w-full px-4 py-3 font-medium text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition"
              >
                 Create User Link
              </button>

              <button
                onClick={() => generateInvitationLink('co-admin')}
                disabled={isGenerating}
                className={`w-full px-4 py-3 font-medium text-white rounded-lg transition ${
                    isGenerating ? 'bg-indigo-400' : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {isGenerating ? 'Generating...' : 'Create Co-Admin Link'}
              </button>
              
              {invitationLink && (
                <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                  <label className="block text-sm font-semibold text-green-800 mb-2">Your Invite Link:</label>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={invitationLink}
                      readOnly
                      className="flex-1 px-3 py-2 bg-white border border-green-300 rounded-md text-sm cursor-text focus:outline-none"
                      onClick={(e) => e.currentTarget.select()}
                    />
                    <button
                      onClick={copyInvitationLink}
                      className="px-4 py-2 bg-green-600 font-medium text-white rounded-md hover:bg-green-700 transition"
                    >
                      Copy
                    </button>
                  </div>
                  <p className="text-xs text-green-700 mt-3 font-medium italic">
                    Share this unique link with users to link them to your workspace.
                  </p>
                </div>
              )}
              
              <button
                onClick={() => {
                    setShowInvitationDialog(false)
                    setInvitationLink('')
                }}
                className="w-full px-4 py-3 text-gray-600 font-medium bg-gray-100 rounded-lg hover:bg-gray-200 transition"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminPanel