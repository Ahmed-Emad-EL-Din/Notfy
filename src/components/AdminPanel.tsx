import React, { useState } from 'react'
import { Users, BellPlus, Calendar, BarChart3 } from 'lucide-react'

interface AdminPanelProps {
  isAdmin: boolean
  onToggleAdmin: () => void
  onSendNotification: (notification: { title: string; message: string; type: 'info' | 'warning' | 'urgent' }) => void
}

function AdminPanel({ isAdmin, onToggleAdmin, onSendNotification }: AdminPanelProps) {
  const [newNotification, setNewNotification] = useState({
    title: '',
    message: '',
    type: 'info' as const,
    scheduledTime: ''
  })

  const handleSendNotification = () => {
    if (newNotification.title.trim() && newNotification.message.trim()) {
      onSendNotification({
        title: newNotification.title,
        message: newNotification.message,
        type: newNotification.type
      })
      setNewNotification({ title: '', message: '', type: 'info', scheduledTime: '' })
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
              <span className="font-semibold">1</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Active Tasks:</span>
              <span className="font-semibold">0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Notifications Sent:</span>
              <span className="font-semibold">0</span>
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
            <button className="w-full px-3 py-2 bg-yellow-500 text-white rounded-md hover:bg-yellow-600">
              Send Test Notification
            </button>
            <button className="w-full px-3 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600">
              View User Activity
            </button>
            <button className="w-full px-3 py-2 bg-red-500 text-white rounded-md hover:bg-red-600">
              Clear All Notifications
            </button>
          </div>
        </div>

        {/* System Info */}
        <div className="bg-purple-50 rounded-lg p-4">
          <h3 className="text-lg font-medium mb-3">System Information</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Version:</span>
              <span>1.0.0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Last Updated:</span>
              <span>Just now</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Browser Support:</span>
              <span className="text-green-600">✓</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Notifications:</span>
              <span className="text-green-600">Enabled</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AdminPanel