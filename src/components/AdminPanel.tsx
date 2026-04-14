import { useState } from 'react'
import { Users, BellPlus, BarChart3 } from 'lucide-react'

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
  const [invitationType, setInvitationType] = useState<'user' | 'admin'>('user')

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

  const generateInvitationLink = () => {
    const baseUrl = window.location.origin
    const code = `${invitationType}-invite-${Date.now()}`
    const link = `${baseUrl}/?invite=${code}`
    setInvitationLink(link)
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
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900 flex items-center">
          <BarChart3 className="h-5 w-5 mr-2" />
          Admin Panel
        </h2>
        <button
          onClick={onToggleAdmin}
          className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
        >
          Switch to User Mode
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Notification Management */}
        <div className="bg-blue-50 rounded-lg p-4">
          <h3 className="text-lg font-medium mb-3 flex items-center">
            <BellPlus className="h-5 w-5 mr-2" />
            Send Notification
          </h3>
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Notification title"
              value={newNotification.title}
              onChange={(e) => setNewNotification({...newNotification, title: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <textarea
              placeholder="Message content"
              value={newNotification.message}
              onChange={(e) => setNewNotification({...newNotification, message: e.target.value})}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={newNotification.type}
              onChange={(e) => setNewNotification({...newNotification, type: e.target.value as any})}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="urgent">Urgent</option>
            </select>
            <input
              type="datetime-local"
              placeholder="Schedule time (optional)"
              value={newNotification.scheduledTime}
              onChange={(e) => setNewNotification({...newNotification, scheduledTime: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={newNotification.isBroadcast}
                  onChange={(e) => setNewNotification({...newNotification, isBroadcast: e.target.checked, targetUserIds: []})}
                  className="mr-2"
                />
                Send to all users
              </label>
              
              {!newNotification.isBroadcast && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium">Select users:</label>
                  {users.filter(user => !user.isAdmin).map(user => (
                    <label key={user.id} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={newNotification.targetUserIds.includes(user.id)}
                        onChange={(e) => {
                          const updatedIds = e.target.checked
                            ? [...newNotification.targetUserIds, user.id]
                            : newNotification.targetUserIds.filter(id => id !== user.id)
                          setNewNotification({...newNotification, targetUserIds: updatedIds})
                        }}
                        className="mr-2"
                      />
                      {user.name} ({user.email})
                    </label>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={handleSendNotification}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Send Notification
            </button>
          </div>
        </div>

        {/* Statistics */}
        <div className="bg-green-50 rounded-lg p-4">
          <h3 className="text-lg font-medium mb-3 flex items-center">
            <BarChart3 className="h-5 w-5 mr-2" />
            System Statistics
          </h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Total Users:</span>
              <span className="font-semibold">{users.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Administrators:</span>
              <span className="font-semibold">{users.filter(u => u.isAdmin).length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Regular Users:</span>
              <span className="font-semibold">{users.filter(u => !u.isAdmin).length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">System Status:</span>
              <span className="font-semibold text-green-600">Online</span>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-yellow-50 rounded-lg p-4">
          <h3 className="text-lg font-medium mb-3">Quick Actions</h3>
          <div className="space-y-2">
            <button 
              onClick={() => setShowInvitationDialog(true)}
              className="w-full px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
            >
              Generate Invitation Link
            </button>
            <button className="w-full px-3 py-2 bg-yellow-500 text-white rounded-md hover:bg-yellow-600">
              Send Test Notification
            </button>
            <button className="w-full px-3 py-2 bg-red-500 text-white rounded-md hover:bg-red-600">
              Clear All Notifications
            </button>
          </div>
        </div>

        {/* User Management */}
        <div className="bg-purple-50 rounded-lg p-4">
          <h3 className="text-lg font-medium mb-3">User Management</h3>
          <div className="space-y-3 max-h-40 overflow-y-auto">
            {users.map(user => (
              <div key={user.id} className="flex items-center justify-between p-2 bg-white rounded border">
                <div>
                  <div className="font-medium">{user.name}</div>
                  <div className="text-sm text-gray-600">{user.email}</div>
                </div>
                <span className={`px-2 py-1 text-xs rounded ${
                  user.isAdmin ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800'
                }`}>
                  {user.isAdmin ? 'Admin' : 'User'}
                </span>
              </div>
            ))}
            
            {users.length === 0 && (
              <div className="text-center text-gray-500 py-4">
                No users registered yet
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Invitation Dialog */}
      {showInvitationDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-medium mb-4">Generate Invitation Link</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Invitation Type:</label>
                <select
                  value={invitationType}
                  onChange={(e) => setInvitationType(e.target.value as 'user' | 'admin')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="user">Regular User</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>
              
              <button
                onClick={generateInvitationLink}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Generate Link
              </button>
              
              {invitationLink && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium">Invitation Link:</label>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={invitationLink}
                      readOnly
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
                    />
                    <button
                      onClick={copyInvitationLink}
                      className="px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                    >
                      Copy
                    </button>
                  </div>
                  <p className="text-xs text-gray-600">
                    Share this link with users to invite them to join Notfy
                  </p>
                </div>
              )}
              
              <button
                onClick={() => setShowInvitationDialog(false)}
                className="w-full px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminPanel