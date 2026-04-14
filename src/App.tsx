import { useState, useEffect } from 'react'
import { Bell, Calendar, Plus, User, Settings, CheckCircle, LogOut } from 'lucide-react'
import { format, isTomorrow } from 'date-fns'
import { subscribeUserToPush } from './lib/pushSubscription'
import { auth } from './lib/firebase'
import AdminPanel from './components/AdminPanel'
import Auth from './components/Auth'

interface Task {
  id: string
  title: string
  description: string
  dueDate: Date
  completed: boolean
  userId: string
}

interface AppNotification {
  id: string
  title: string
  message: string
  timestamp: Date
  type: 'info' | 'warning' | 'urgent'
  voiceNote?: string
}

interface UserData {
  id: string
  email: string
  name: string
  isAdmin: boolean
}

function App() {
  const [currentUser, setCurrentUser] = useState<UserData | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [showAdminPanel, setShowAdminPanel] = useState(false)
  const [users] = useState<Array<{ id: string; name: string; email: string; isAdmin: boolean }>>([])
  const [newTask, setNewTask] = useState({ title: '', description: '', dueDate: '' })
  const [newNotification, setNewNotification] = useState({ title: '', message: '', type: 'info' as const })

  // Check browser notification permission
  useEffect(() => {
    if ('Notification' in window) {
      Notification.requestPermission()
    }
  }, [])

  // Check for tasks due tomorrow and send notifications
  useEffect(() => {
    if (!currentUser) return
    
    const tomorrowTasks = tasks.filter(task => 
      !task.completed && isTomorrow(task.dueDate) && task.userId === currentUser.id
    )
    
    if (tomorrowTasks.length > 0 && Notification.permission === 'granted') {
      tomorrowTasks.forEach(task => {
        new Notification('Task Due Tomorrow', {
          body: `"${task.title}" is due tomorrow!`,
          icon: '/vite.svg'
        })
      })
    }
  }, [tasks, currentUser])

  const handleLogin = async (user: UserData) => {
    setCurrentUser(user)
    setIsAdmin(user.isAdmin)
    
    // Subscribe user to push
    subscribeUserToPush(user.id)
    
    // Save user to MongoDB
    const token = await auth.currentUser?.getIdToken()
    await fetch('/.netlify/functions/api?action=upsertUser', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        id: user.id,
        email: user.email,
        name: user.name,
        is_admin: user.isAdmin
      })
    })
    
    // Fetch tasks
    const res = await fetch(`/.netlify/functions/api?action=getTasks&userId=${user.id}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    if (res.ok) {
      const data = await res.json()
      setTasks(data.map((d: any) => ({
        id: d._id,
        title: d.title,
        description: d.description,
        dueDate: new Date(d.due_date),
        completed: d.completed,
        userId: d.user_id
      })))
    }
  }

  const handleLogout = () => {
    setCurrentUser(null)
    setIsAdmin(false)
    setShowAdminPanel(false)
  }

  const addTask = async () => {
    if (newTask.title.trim() && currentUser) {
      const taskObj = {
        title: newTask.title,
        description: newTask.description,
        due_date: new Date(newTask.dueDate || Date.now()).toISOString(),
        completed: false,
        user_id: currentUser.id
      }
      
      const token = await auth.currentUser?.getIdToken()
      const res = await fetch('/.netlify/functions/api?action=addTask', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(taskObj)
      })
      
      if (res.ok) {
        const data = await res.json()
        const task: Task = {
          id: data._id,
          title: data.title,
          description: data.description,
          dueDate: new Date(data.due_date),
          completed: data.completed,
          userId: data.user_id
        }
        setTasks([...tasks, task])
        setNewTask({ title: '', description: '', dueDate: '' })
      }
    }
  }

  const toggleTaskCompletion = async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId)
    if (task) {
      const token = await auth.currentUser?.getIdToken()
      await fetch('/.netlify/functions/api?action=updateTask', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ id: taskId, completed: !task.completed })
      })
      setTasks(tasks.map(t => t.id === taskId ? { ...t, completed: !t.completed } : t))
    }
  }

  const sendNotification = (notificationData: { title: string; message: string; type: 'info' | 'warning' | 'urgent' }) => {
    const notification: AppNotification = {
      id: Date.now().toString(),
      title: notificationData.title,
      message: notificationData.message,
      timestamp: new Date(),
      type: notificationData.type
    }
    setNotifications([notification, ...notifications])
    
    if (Notification.permission === 'granted') {
      new Notification(notificationData.title, {
        body: notificationData.message,
        icon: '/vite.svg'
      })
    }
  }

  const handleSendNotification = () => {
    if (newNotification.title.trim() && newNotification.message.trim()) {
      sendNotification(newNotification)
      setNewNotification({ title: '', message: '', type: 'info' })
    }
  }

  if (!currentUser) {
    return <Auth onLogin={handleLogin} />
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <Bell className="h-8 w-8 text-blue-600" />
              <h1 className="text-2xl font-bold text-gray-900">Notfy</h1>
            </div>
            
            <div className="flex items-center space-x-4">
              {isAdmin && (
                <button
                  onClick={() => setShowAdminPanel(!showAdminPanel)}
                  className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                >
                  <Settings className="h-4 w-4" />
                  <span>{showAdminPanel ? 'User View' : 'Admin Panel'}</span>
                </button>
              )}
              
              <div className="flex items-center space-x-2">
                <User className="h-6 w-6 text-gray-600" />
                <span className="text-sm text-gray-700">{currentUser.name}</span>
                <button
                  onClick={handleLogout}
                  className="p-1 text-gray-400 hover:text-gray-600"
                  title="Logout"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {showAdminPanel ? (
          <AdminPanel 
            isAdmin={isAdmin}
            onToggleAdmin={() => setIsAdmin(!isAdmin)}
            onSendNotification={sendNotification}
            users={users}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-900 flex items-center">
                  <Calendar className="h-5 w-5 mr-2" />
                  My Tasks
                </h2>
                <span className="text-sm text-gray-500">
                  {tasks.filter(t => !t.completed && t.userId === currentUser.id).length} pending
                </span>
              </div>

              <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                <h3 className="text-lg font-medium mb-3">Add New Task</h3>
                <div className="space-y-3">
                    <input
                      type="text"
                      placeholder="Task title"
                      value={newTask.title}
                      onChange={(e) => setNewTask({...newTask, title: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  <textarea
                    placeholder="Description (optional)"
                    value={newTask.description}
                    onChange={(e) => setNewTask({...newTask, description: e.target.value})}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="datetime-local"
                    value={newTask.dueDate}
                    onChange={(e) => setNewTask({...newTask, dueDate: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={addTask}
                    className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Add Task</span>
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {tasks
                  .filter(task => task.userId === currentUser.id)
                  .map((task) => (
                  <div
                    key={task.id}
                    className={`p-4 border rounded-lg ${
                      task.completed ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => toggleTaskCompletion(task.id)}
                            className={`p-1 rounded ${
                              task.completed ? 'text-green-600' : 'text-gray-400 hover:text-green-600'
                            }`}
                          >
                            <CheckCircle className="h-5 w-5" />
                          </button>
                          <h3 className={`font-medium ${task.completed ? 'text-green-800 line-through' : 'text-gray-900'}`}>
                            {task.title}
                          </h3>
                        </div>
                        {task.description && (
                          <p className="text-sm text-gray-600 mt-1 ml-7">{task.description}</p>
                        )}
                        <p className="text-xs text-gray-500 mt-2 ml-7">
                          Due: {format(task.dueDate, 'MMM dd, yyyy HH:mm')}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
                
                {tasks.filter(task => task.userId === currentUser.id).length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <Calendar className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No tasks yet. Add your first task above!</p>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-900 flex items-center">
                  <Bell className="h-5 w-5 mr-2" />
                  Notifications
                </h2>
                <span className="text-sm text-gray-500">{notifications.length} total</span>
              </div>

              {isAdmin && (
                <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                  <h3 className="text-lg font-medium mb-3">Send Notification</h3>
                  <div className="space-y-3">
                    <input
                      type="text"
                      placeholder="Notification title"
                      value={newNotification.title}
                      onChange={(e) => setNewNotification({...newNotification, title: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <textarea
                      placeholder="Message"
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
                    <button
                      onClick={handleSendNotification}
                      className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                      Send Notification
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`p-4 border rounded-lg ${
                      notification.type === 'urgent' ? 'bg-red-50 border-red-200' :
                      notification.type === 'warning' ? 'bg-yellow-50 border-yellow-200' :
                      'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-medium text-gray-900">{notification.title}</h3>
                        <p className="text-sm text-gray-600 mt-1">{notification.message}</p>
                        <p className="text-xs text-gray-500 mt-2">
                          {format(notification.timestamp, 'MMM dd, yyyy HH:mm:ss')}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
                
                {notifications.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <Bell className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No notifications yet.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-center text-sm text-gray-500 font-medium">
            Made By: Ahmed Emad
          </p>
        </div>
      </footer>
    </div>
  )
}

export default App